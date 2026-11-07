// District Deck V3.10 — W1-RENDER lighting rig and procedural IBL.
//
// One time-of-day parameter drives the key, the fill, the rim, the ground bounce, the sky
// gradient that is baked into the PMREM environment, and the grade hints handed to the post
// chain. Nothing here reads or writes simulation state, nothing fetches, and nothing uses
// an RNG or a wall clock — the sky is a closed-form function of `timeOfDay`.
//
// Ownership note (V3.10 §5): materials.js owns the MeshPhysicalMaterial factory; this rig
// only assigns envMap / envMapIntensity on what it finds in the graph.

import * as THREE from 'three';
import { applyArchitecturalMatteFloor } from './materials.js';
import {
  STYLE_SWITCHES, applyStyleRules, applyStyleEmit, lampLevel, setLampEmission, isStyleExempt,
} from './style/material-rules.js';
import { applyAlbedoGain } from './style/material-key.js';
import { P1_AERIAL, P1_FOG, P1_HIGHLIGHT, P1_LIGHT, P4_GRUNGE } from './v4-p1-polish.js';
import { applyShadowCasterBudget } from './batching.js';
import { applyLod, installShadowLod } from './lod.js';

const DEG = Math.PI / 180;
const RGB_LUMA = Object.freeze([0.2126, 0.7152, 0.0722]);
const AERIAL_UPSTREAM = new WeakMap();

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Pure CPU twin of the shader band law, used by tests and plate-stat receipts. */
export function aerialPerspectiveResponse(distanceM, heightM = 0) {
  const distance = Math.max(0, Number(distanceM) || 0);
  const height = Math.max(0, Number(heightM) || 0);
  const midT = smoothstep(P1_AERIAL.nearEndM, P1_AERIAL.midFullM, distance);
  const farT = smoothstep(P1_AERIAL.farStartM, P1_AERIAL.farFullM, distance);
  const mix = (a, b, t) => a + (b - a) * t;
  const bandSaturation = mix(
    mix(1, P1_AERIAL.midSaturation, midT),
    P1_AERIAL.farSaturation,
    farT,
  );
  const bandLumaLift = mix(
    mix(1, P1_AERIAL.midLumaLift, midT),
    P1_AERIAL.farLumaLift,
    farT,
  );
  const bandCoolShift = mix(
    P1_AERIAL.midCoolShift * midT,
    P1_AERIAL.farCoolShift,
    farT,
  );
  const heightT = smoothstep(
    P1_AERIAL.crispHeightStartM,
    P1_AERIAL.crispHeightFullM,
    height,
  );
  const response = mix(1, P1_AERIAL.roofResponse, heightT);
  return {
    saturation: mix(1, bandSaturation, response),
    lumaLift: mix(1, bandLumaLift, response),
    coolShift: bandCoolShift * response,
    response,
    midT,
    farT,
  };
}

/**
 * Apply the same luma-preserving saturation/cool transform on the CPU. Water is an explicit
 * negative control: the ocean shader is fog-free and a tagged water material is never injected.
 */
export function applyAerialPerspectiveRgb(
  rgb,
  distanceM,
  heightM = 0,
  { water = false, coolColor = [0.10, 0.38, 0.86] } = {},
) {
  const source = Array.isArray(rgb) ? rgb.slice(0, 3) : [rgb?.r ?? 0, rgb?.g ?? 0, rgb?.b ?? 0];
  if (water) return source;
  const state = aerialPerspectiveResponse(distanceM, heightM);
  const luma = source[0] * RGB_LUMA[0] + source[1] * RGB_LUMA[1] + source[2] * RGB_LUMA[2];
  const desaturated = source.map((channel) => luma + (channel - luma) * state.saturation);
  const cool = Array.isArray(coolColor)
    ? coolColor : [coolColor?.r ?? 0.10, coolColor?.g ?? 0.38, coolColor?.b ?? 0.86];
  const coolLuma = Math.max(
    1e-6,
    cool[0] * RGB_LUMA[0] + cool[1] * RGB_LUMA[1] + cool[2] * RGB_LUMA[2],
  );
  const coolAtLuma = cool.map((channel) => channel * luma / coolLuma);
  return desaturated.map((channel, index) => Math.max(
    0,
    (channel + (coolAtLuma[index] - channel) * state.coolShift) * state.lumaLift,
  ));
}

function aerialMaterialDescriptor(material, object = null) {
  return [
    material?.name,
    material?.userData?.family,
    material?.userData?.variant,
    material?.userData?.surface,
    material?.userData?.role,
    material?.userData?.weatherRole,
    object?.name,
    object?.userData?.family,
    object?.userData?.surface,
    object?.userData?.role,
  ].filter(Boolean).join(' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

/**
 * Fold P16's atmosphere into each material's existing fog chunk. This adds no render target,
 * draw, or fullscreen pass; water/foam/ocean materials retain their own colour path.
 */
export function installLayeredAerialPerspective(material, profile, object = null) {
  if (!material) return false;
  const descriptor = aerialMaterialDescriptor(material, object);
  if (/\b(water|ocean|foam)\b/.test(descriptor)) {
    // A few fringe meshes share an otherwise ordinary standard material with a water/foam
    // binding encountered later in the scene walk. Water wins: unwind an earlier installation
    // so that shared instance cannot inherit the land-atmosphere transform through traversal order.
    material.userData ??= {};
    material.userData.layeredAerialPerspectiveExcluded = 'water';
    const upstream = AERIAL_UPSTREAM.get(material);
    if (upstream && material.userData?.layeredAerialPerspective) {
      material.onBeforeCompile = upstream.onBeforeCompile;
      material.customProgramCacheKey = upstream.customProgramCacheKey;
      delete material.userData.layeredAerialPerspective;
      AERIAL_UPSTREAM.delete(material);
      material.needsUpdate = true;
    }
    return false;
  }
  // Exclusion is sticky across later bindings of a shared material. A single water use is
  // sufficient to reserve its colour path; otherwise traversal order can reinstall the hook.
  if (material.userData?.layeredAerialPerspectiveExcluded === 'water') return false;
  if (material.fog === false || material.userData?.layeredAerialPerspective) return false;
  // These built-in geometry shaders all establish `transformed` before <fog_vertex>.
  // Sprite/custom shaders do not share that contract and retain their ordinary sky-coloured fog.
  const supportsWorldVertex = material.isMeshStandardMaterial || material.isMeshPhysicalMaterial
    || material.isMeshBasicMaterial || material.isMeshLambertMaterial || material.isMeshPhongMaterial
    || material.isMeshToonMaterial || material.isMeshMatcapMaterial || material.isPointsMaterial
    || material.isLineBasicMaterial || material.isLineDashedMaterial;
  if (!supportsWorldVertex) return false;
  const coolUniform = { value: new THREE.Color().copy(profile?.skyColor ?? new THREE.Color('#6fa5d8')) };
  const amountUniform = { value: 1 };
  material.userData ??= {};
  material.userData.layeredAerialPerspective = {
    bandsM: [
      P1_AERIAL.nearEndM,
      P1_AERIAL.midFullM,
      P1_AERIAL.farStartM,
      P1_AERIAL.farFullM,
    ],
    coolUniform,
    amountUniform,
  };
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  AERIAL_UPSTREAM.set(material, {
    onBeforeCompile: previousCompile,
    customProgramCacheKey: previousKey,
  });
  material.onBeforeCompile = (shader, renderer) => {
    if (previousCompile) previousCompile.call(material, shader, renderer);
    if (
      !shader.vertexShader.includes('#include <fog_pars_vertex>')
      || !shader.vertexShader.includes('#include <fog_vertex>')
      || !shader.fragmentShader.includes('#include <fog_pars_fragment>')
      || !shader.fragmentShader.includes('#include <fog_fragment>')
    ) return;
    shader.uniforms.p16AerialCool = coolUniform;
    shader.uniforms.p16AerialAmount = amountUniform;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <fog_pars_vertex>',
      `#include <fog_pars_vertex>
#ifdef USE_FOG
  uniform float p16AerialAmount;
  varying float vP16AerialHeight;
#endif`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <fog_vertex>',
      `#include <fog_vertex>
#ifdef USE_FOG
if (p16AerialAmount > 0.001) {
  vec4 p16AerialWorld = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    p16AerialWorld = batchingMatrix * p16AerialWorld;
  #endif
  #ifdef USE_INSTANCING
    p16AerialWorld = instanceMatrix * p16AerialWorld;
  #endif
  vP16AerialHeight = (modelMatrix * p16AerialWorld).y;
} else {
  vP16AerialHeight = 0.0;
}
#endif`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_pars_fragment>',
      `#include <fog_pars_fragment>
#ifdef USE_FOG
  uniform vec3 p16AerialCool;
  uniform float p16AerialAmount;
  varying float vP16AerialHeight;
#endif`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>',
      `#ifdef USE_FOG
if (p16AerialAmount > 0.001) {
  #ifdef FOG_EXP2
    float p16AerialDistance = max(0.0, vFogDepth);
  #else
    float p16AerialDistance = max(0.0, vFogDepth - fogNear);
  #endif
if (p16AerialDistance > ${P1_AERIAL.nearEndM.toFixed(1)}) {
  float p16AerialMid = smoothstep(${P1_AERIAL.nearEndM.toFixed(1)}, ${P1_AERIAL.midFullM.toFixed(1)}, p16AerialDistance);
  float p16AerialFar = smoothstep(${P1_AERIAL.farStartM.toFixed(1)}, ${P1_AERIAL.farFullM.toFixed(1)}, p16AerialDistance);
  float p16AerialHeightT = smoothstep(${P1_AERIAL.crispHeightStartM.toFixed(1)}, ${P1_AERIAL.crispHeightFullM.toFixed(1)}, max(0.0, vP16AerialHeight));
  float p16AerialResponse = mix(1.0, ${P1_AERIAL.roofResponse.toFixed(2)}, p16AerialHeightT);
  float p16AerialSaturation = mix(1.0,
    mix(mix(1.0, ${P1_AERIAL.midSaturation.toFixed(2)}, p16AerialMid), ${P1_AERIAL.farSaturation.toFixed(2)}, p16AerialFar),
    p16AerialResponse);
  float p16AerialLift = mix(1.0,
    mix(mix(1.0, ${P1_AERIAL.midLumaLift.toFixed(2)}, p16AerialMid), ${P1_AERIAL.farLumaLift.toFixed(2)}, p16AerialFar),
    p16AerialResponse);
  float p16AerialCoolMix = mix(${P1_AERIAL.midCoolShift.toFixed(2)} * p16AerialMid,
    ${P1_AERIAL.farCoolShift.toFixed(2)}, p16AerialFar) * p16AerialResponse;
  float p16AerialY = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 p16AerialDesaturated = mix(vec3(p16AerialY), gl_FragColor.rgb, p16AerialSaturation);
  float p16AerialCoolY = max(dot(p16AerialCool, vec3(0.2126, 0.7152, 0.0722)), 1e-5);
  vec3 p16AerialCoolAtY = p16AerialCool * (p16AerialY / p16AerialCoolY);
  gl_FragColor.rgb = max(vec3(0.0), mix(p16AerialDesaturated, p16AerialCoolAtY,
    p16AerialCoolMix) * p16AerialLift);
}
} else {
  #include <fog_fragment>
}
#endif`,
    );
  };
  material.customProgramCacheKey = () => {
    const upstream = typeof previousKey === 'function' ? previousKey.call(material) : '';
    return `${upstream}|p16-layered-aerial-v1`;
  };
  material.needsUpdate = true;
  return true;
}

/** Four authored shadow bands. See _fitShadow() for why this is a ladder, not per-fragment CSM. */
export const SHADOW_CASCADE_BANDS = Object.freeze([26, 58, 124, 260]);
/**
 * World-metres per shadow texel. At 2048 a 260 m band is 0.254 m/texel; the 2.0
 * PCF kernel then dissolves a 1 m crane leg. Close port poses must stay at or
 * under this ceiling so the key actually reaches the apron.
 */
export const SHADOW_TEXEL_CEILING_M = 0.25;
/** Height sampled into the shadow fit so a gantry boom / ship stack stays a caster. */
export const SHADOW_TALL_CASTER_M = 48;

/**
 * Closed-form solar profile. `t` runs 0 (first light) → 0.5 (noon) → 1 (last light).
 * Returns the whole lighting state so every consumer reads one source.
 */
export function solarProfile(t) {
  const time = Math.min(1, Math.max(0, t));
  const arc = Math.sin(time * Math.PI);              // 0 at both horizons, 1 at noon
  // W1-RENDER r3: lower elevation ceiling than grounding (arc×44 → arc×38) so the key
  // rakes harder at every hour. Overhead light flattens roof planes and kills the
  // Monopoly-Plus miniature read; target plate is a low warm key with long soft contact.
  const elevation = (3 + arc * 38) * DEG;
  // The board's default camera sits on the -x/+z corner. The sun swings across the far
  // side so shadows are thrown toward the viewer instead of hiding behind their casters.
  // Swung +52 deg on 2026-08-29. At the previous 55 deg the sun sat ~7 deg off the
  // default view direction, so every ground shadow fell straight toward the camera and
  // hid inside its own caster's silhouette — two independent reviews measured a fully
  // flat-lit deck with street trees, lamp columns and multi-storey buildings throwing
  // nothing at all. Offsetting the swing puts the sun across the shot instead of behind
  // it, so contact shadows read as shadows.
  const azimuth = (107 + time * 95) * DEG;
  // Warmth is a function of how much atmosphere the light is cutting through.
  const warmth = Math.pow(1 - arc, 1.55);
  // Hero R10: floor key warmth so ToD 0.42 (arc≈0.97) still reads gold key vs cool fill.
  // Atmospheric warmth alone collapses to ~0 at mid-afternoon and flattens the diorama.
  const keyWarmth = Math.max(warmth, P1_LIGHT.keyWarmthFloor + (1 - arc) * P1_LIGHT.keyWarmthHorizon);
  // Lane D: keep the daylight key, but make its amber shoulder legible at board scale so
  // sun-facing roofs and the warmed HUD steel belong to the same shot.
  const keyColor = new THREE.Color().setRGB(
    1.0,
    0.920 - keyWarmth * 0.30,
    0.765 - keyWarmth * 0.50,
    THREE.LinearSRGBColorSpace,
  );
  // Cooler fill/sky: punchier zenith blue at low warmth so the dome is not grey void.
  const skyColor = new THREE.Color().setRGB(
    0.10 + warmth * 0.28,
    0.38 + warmth * 0.12,
    0.86 - warmth * 0.10,
    THREE.LinearSRGBColorSpace,
  );
  // ——— V3.70: the fill lamp is no longer the sky dome's colour ———
  //
  // FOUR INDEPENDENT LANES DIAGNOSED THE SAME NAVY FAULT AND ALL FOUR AIMED AT THEIR OWN PALETTE.
  // It was never the palette. `skyColor` above is a deliberately punchy zenith blue — at mid-day
  // roughly linear (0.10, 0.38, 0.86) — and it was driving BOTH the dome and the fill
  // `DirectionalLight` at intensity 0.55–0.90. Every surface the key does not reach was therefore
  // lit by a strongly saturated blue lamp, and the grade's shadow tint then multiplied what came
  // back.
  //
  // What the lanes measured, each blaming their own materials:
  //   L1  darks running +9.4 to +13.0 b−r against a reference of −7.6 to +0.9
  //   L3  a NEUTRAL GREY CARD returning +47 b−r on a shaded vertical face
  //   L4  the same pavers at b−r −49.9 lit and +18.0 in shade — a 68-point inversion, where the
  //       reference inverts the other way
  //   L6  twice the reference chroma across the whole subject
  //
  // L3's grey-card measurement is the one that settles it: no albedo can be at fault when an
  // achromatic sample comes back that blue.
  //
  // A real sky IS blue, so the fill keeps a cool cast — this pulls it most of the way to a neutral
  // of the same luminance rather than neutralising it outright. The dome keeps `skyColor` intact,
  // because the dome being punchy was never the problem and dulling it would flatten the sky for
  // no gain.
  // Lane D: neutralise the fill lamp decisively enough that the authored LUT shadow tint,
  // rather than cyan illumination or brown bounce, determines the raster shadow family.
  const FILL_NEUTRALISE = P1_LIGHT.fillNeutralise;
  const skyLuma = skyColor.r * 0.2126 + skyColor.g * 0.7152 + skyColor.b * 0.0722;
  const fillColor = new THREE.Color().setRGB(
    skyColor.r + (skyLuma - skyColor.r) * FILL_NEUTRALISE,
    skyColor.g + (skyLuma - skyColor.g) * FILL_NEUTRALISE,
    skyColor.b + (skyLuma - skyColor.b) * FILL_NEUTRALISE,
    THREE.LinearSRGBColorSpace,
  );
  // P16 L1: move the fill back toward the actual sky hue without moving its luminance.
  // `fillColor` and `skyColor` have identical linear luma by construction, so this is a pure
  // chroma change; the north-wall receipt can move blue while the W7/W8 luma guards stand.
  fillColor.lerp(skyColor, P1_LIGHT.fillSkyMix);

  // Horizon warm peach even at mid-day — thin band, not beige milk void.
  const horizonColor = new THREE.Color().setRGB(
    0.64 + warmth * 0.28,
    0.52 + warmth * 0.04,
    0.40 - warmth * 0.08,
    THREE.LinearSRGBColorSpace,
  );
  // Warm earth/table bounce on down-facing normals. The old slate triplet's exact luma is
  // retained, so the hemisphere and directional-bounce intensities remain honest controls.
  const groundLuma = (0.155 + warmth * 0.020) * RGB_LUMA[0]
    + (0.165 + warmth * 0.018) * RGB_LUMA[1]
    + (0.180 + warmth * 0.012) * RGB_LUMA[2];
  const groundHue = [1.28, 0.94, 0.62];
  const groundHueLuma = groundHue[0] * RGB_LUMA[0]
    + groundHue[1] * RGB_LUMA[1]
    + groundHue[2] * RGB_LUMA[2];
  const groundColor = new THREE.Color().setRGB(
    groundHue[0] * groundLuma / groundHueLuma,
    groundHue[1] * groundLuma / groundHueLuma,
    groundHue[2] * groundLuma / groundHueLuma,
    THREE.LinearSRGBColorSpace,
  );
  return {
    time,
    arc,
    warmth,
    elevation,
    azimuth,
    keyColor,
    skyColor,
    fillColor,
    horizonColor,
    groundColor,
    // P20 L4B: balance the 2.6× post exposure with the retained PMREM below.
    // Measured white-card contrast stays above L4's 3.10:1; fill lamps stay fixed.
    keyIntensity: (P1_LIGHT.keyIntensityBase + arc * P1_LIGHT.keyIntensityArc) * 0.46,
    fillIntensity: P1_LIGHT.fillIntensityBase + arc * P1_LIGHT.fillIntensityArc,
    rimIntensity: P1_LIGHT.rimIntensityBase + warmth * P1_LIGHT.rimIntensityWarmth,
    bounceIntensity: P1_LIGHT.bounceIntensityBase + arc * P1_LIGHT.bounceIntensityArc,
    // P20 L4B: retain directional PMREM and glass floors while exposing the scene
    // 2.6× in post. Reduced diffuse IBL keeps city midtones and card shadows bounded.
    envIntensity: (0.38 + arc * 0.20) * 0.20,
    // Slightly larger disc so hero sky plate shows a readable sun.
    sunAngularSize: 0.010 + warmth * 0.008,
    // Grade hints. The post chain bakes these into the LUT so sky, lights and grade agree.
    // V4.9 Lane F: cool-neutral shadows + warm-not-amber highlights. The previous
    // [1.27, 1.00, 0.74] highlight mul was a global brown wash; MP / grunge-refs
    // keep brick red, grass green, water cyan.
    grade: {
      shadowTint: [
        P4_GRUNGE.shadowTint[0] - warmth * P4_GRUNGE.shadowTintWarmth,
        P4_GRUNGE.shadowTint[1],
        P4_GRUNGE.shadowTint[2] + warmth * P4_GRUNGE.shadowTintWarmth,
      ],
      highlightTint: [
        P4_GRUNGE.highlightTint[0] + keyWarmth * P4_GRUNGE.highlightTintWarmth,
        P4_GRUNGE.highlightTint[1],
        P4_GRUNGE.highlightTint[2] - keyWarmth * P4_GRUNGE.highlightTintWarmth,
      ],
      contrast: P4_GRUNGE.contrast + warmth * P4_GRUNGE.contrastWarmth,
      saturation: P4_GRUNGE.saturation - arc * P4_GRUNGE.saturationArc,
      midtoneSatBoost: P4_GRUNGE.midtoneSatBoost,
      exposure: P1_LIGHT.gradeExposure + warmth * 0.05,
    },
  };
}

/** Warm charcoal haze with a slight horizon lift. Not mist, not studio void. */
export function applyP1FogColor(fog, profile) {
  if (!fog?.color) return fog;
  if (profile?.skyColor) {
    // Fallback for a custom material that owns a fog implementation and cannot take the
    // layered hook below: haze now belongs to the sky, never a uniform charcoal wash.
    fog.color.copy(profile.skyColor);
    if (profile.horizonColor) fog.color.lerp(profile.horizonColor, P1_FOG.horizonMix);
  } else {
    fog.color.setRGB(P1_FOG.r, P1_FOG.g, P1_FOG.b, THREE.LinearSRGBColorSpace);
  }
  return fog;
}

/** Direction the sun travels *from*, unit length. */
export function sunDirection(profile, out = new THREE.Vector3()) {
  const horizontal = Math.cos(profile.elevation);
  return out.set(
    Math.sin(profile.azimuth) * horizontal,
    Math.sin(profile.elevation),
    Math.cos(profile.azimuth) * horizontal,
  ).normalize();
}

/* ------------------------------------------------------------------ *
 * P14 M7 item 3 — the shadow-fill term, for the military units only.
 *
 * The key is the only caster in this rig and it carries ~80 % of a lit
 * pavement's radiance, so the ground inside a shadow falls to about 0.20x the
 * pavement around it (measured on the tank at the roster pose: p05 25.9
 * against a plaza p50 of 127.2). M6 proved by A/B that the black mass under a
 * unit is the shadow map and not the contact print, and carried it as a
 * residual because it could not be fixed from `units.js` alone.
 *
 * This is the missing half, and it is a *term*, not a policy: given the key's
 * own direction, colour and intensity, it returns the radiance a unit's pad
 * should put back into its own shadow and the ellipse that shadow occupies on
 * the ground. Nothing here touches the key — its bias, normalBias and radius
 * are unchanged — and nothing here is global: `units.js` is the only caller,
 * one fill per unit, sized to that unit's own footprint.
 *
 * A bounce, physically: the pavement around a unit is in full sun, and what it
 * throws back under the unit is a fraction of the key it is receiving. Deriving
 * the fill from the key rather than from a tuned hex keeps the two in step
 * through any time-of-day move, and keeps the fill warm where the key is warm.
 * ------------------------------------------------------------------ */

/** The key intensity the fill's strength is calibrated against (rig at ToD 0.42). */
export const KEY_WORKING_INTENSITY = 4.79;
export const MILITARY_SHADOW_FILL = Object.freeze({
  /**
   * Share of the key's own radiance the pad bounce puts back into its shadow.
   * Screen-blended (see `makeShadowFill`), so this is the fraction of the gap
   * to white the fill can close at the centre of the pad, not a flat addition:
   * a lit deck at 0.45 takes 0.55 of it, a shadow at 0.02 takes 0.98.
   */
  keyFraction: 0.40,
  /**
   * Half-width across the shadow, as a multiple of the unit's footprint radius.
   * The first M7 capture used 1.42 and produced an 8.2 m band across a 5.4 m
   * tank, which is a glow on the pavement rather than a shadow being lifted.
   */
  spread: 1.15,
  /**
   * Ground clearance, metres.
   *
   * This is the number the first M7 pass got wrong, and the frame said so: at
   * 0.028 m the fill lit a thin crescent at the pad's rim and nothing else. A
   * downward probe under the roster tank returns `ground:road-straight` at
   * **y 0.02 to 0.052** — the deck the units stand on is not at zero, and a
   * quad at 0.028 is *inside* it over most of its area, so the depth test
   * threw it away. (The same probe explains why M6's contact prints at 0.012
   * and 0.018 changed nothing over the dark mass: they were buried too.)
   * 0.11 m clears the road everywhere it was measured; at the roster camera's
   * 28 deg off vertical that is 0.05 m of lateral parallax, which is nothing.
   */
  lift: 0.11,
  /** The floor the receipt asks for: ground under a unit >= this x surrounding pavement. */
  floorRatio: 0.55,
  /** Shadow length is capped at this multiple of the caster's height (low-sun guard). */
  maxLengthPerHeight: 3.2,
});

/**
 * The fill an individual unit's pad should carry.
 *
 * `dir` is the direction *toward* the key, unit length — exactly
 * `light.position - light.target.position` normalised, so a caller reads it off
 * the live rig rather than re-deriving a solar profile. `height` and `radius`
 * are the caster's own, in metres.
 *
 * Returns the ellipse in the ground plane (centre offset along the shadow, its
 * two axes, and the yaw that aligns the long axis with the shadow) plus the
 * linear RGB radiance to add. Pure: no THREE, no scene, no clock.
 */
export function militaryShadowFill(
  { dir, color, intensity, height, radius },
  tuning = MILITARY_SHADOW_FILL,
) {
  const dx = Number(dir?.x) || 0;
  const dy = Number(dir?.y) || 0;
  const dz = Number(dir?.z) || 0;
  const flat = Math.hypot(dx, dz);
  const h = Math.max(0.1, Number(height) || 0.1);
  const r = Math.max(0.1, Number(radius) || 0.1);
  // Ground-projected sun; the shadow runs the other way.
  const sx = flat > 1e-6 ? -dx / flat : 0;
  const sz = flat > 1e-6 ? -dz / flat : 1;
  const tanElevation = flat > 1e-6 ? Math.max(1e-3, dy / flat) : 1e3;
  const length = Math.min(h / tanElevation, h * tuning.maxLengthPerHeight);
  // Screen strength, bounded to (0, 1): the fraction of the gap to white the
  // pad may close at its centre. It is NOT a radiance — `intensity` scales a
  // radiance without limit, and a screen source above 1 does not lift a shadow,
  // it paints it white. The key's intensity therefore only *tilts* the
  // strength around the rig's own working level, and the key's colour is
  // normalised so the fill carries the sun's hue at that strength.
  const c = color ?? {};
  const peak = Math.max(1e-6, Number(c.r) || 0, Number(c.g) || 0, Number(c.b) || 0);
  const lift = Math.max(0.2, Math.min(1.6, (Number(intensity) || 0) / KEY_WORKING_INTENSITY));
  const gain = Math.min(0.92, tuning.keyFraction * lift);
  return {
    // Unit vector along the ground shadow.
    dirXZ: [sx, sz],
    // How far the shadow reaches from the caster's base, metres.
    length,
    // Centre of the fill, metres along `dirXZ` from the base: half way down the
    // shadow, so the ellipse below covers the caster's own footprint at one end
    // and the tip of its shadow at the other and nothing beyond either.
    offset: length * 0.5,
    // Full axes, metres. The first M7 capture computed a 15 m ellipse for a
    // 3.8 m shadow: `reach` was multiplying the whole shadow length into a HALF
    // axis. The footprint is what it is — the caster's own width plus the
    // shadow it throws — and there is no tuning constant left in the length.
    longAxis: 2 * ((r * tuning.spread) + (length * 0.5)),
    shortAxis: 2 * r * tuning.spread,
    // World yaw of the long axis, radians, measured +x toward +z.
    yaw: Math.atan2(sz, sx),
    lift: tuning.lift,
    // Screen source at the centre of the fill, linear, in (0, 1).
    rgb: [
      ((Number(c.r) || 0) / peak) * gain,
      ((Number(c.g) || 0) / peak) * gain,
      ((Number(c.b) || 0) / peak) * gain,
    ],
    gain,
  };
}

/**
 * Procedural HDR environment: sky gradient, a real sun disc, horizon haze and a ground
 * bounce lobe, written as float RGBA into an equirectangular DataTexture and PMREM-baked
 * once. No file, no CDN, no canvas — pure arithmetic, so it is identical on every machine.
 */
export function buildEnvironmentEquirect(profile, width = 256, reflectionMapping = false, saturation = 1) {
  const height = width / 2;
  const data = new Float32Array(width * height * 4);
  const sun = sunDirection(profile);
  const sky = profile.skyColor;
  const horizon = profile.horizonColor;
  const ground = profile.groundColor;
  const cosSize = Math.cos(profile.sunAngularSize * 24);   // soft disc, generous penumbra
  const sunPeak = 22 + profile.arc * 46;

  for (let y = 0; y < height; y += 1) {
    const theta = ((y + 0.5) / height) * Math.PI;          // 0 = up
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    for (let x = 0; x < width; x += 1) {
      const phi = ((x + 0.5) / width) * Math.PI * 2 - Math.PI;
      // PMREM uses Three's atan(z,x) / asin(y) convention. Water owns a legacy
      // atan(x,z) / acos(y) sampler; keep its public source contract intact.
      const dx = sinT * (reflectionMapping ? Math.cos(phi) : Math.sin(phi));
      const dy = reflectionMapping ? -cosT : cosT;
      const dz = sinT * (reflectionMapping ? Math.sin(phi) : Math.cos(phi));

      const up = Math.max(0, dy);
      const haze = Math.pow(1 - up, 5.5);
      let r = sky.r * (1 - haze) + horizon.r * haze;
      let g = sky.g * (1 - haze) + horizon.g * haze;
      let b = sky.b * (1 - haze) + horizon.b * haze;

      if (dy < 0) {
        // Ground bounce: the table and the board underneath, lit by the same sun.
        const down = Math.min(1, -dy * 1.8);
        r = r * (1 - down) + ground.r * down;
        g = g * (1 - down) + ground.g * down;
        b = b * (1 - down) + ground.b * down;
      }

      const alignment = dx * sun.x + dy * sun.y + dz * sun.z;
      if (alignment > cosSize) {
        const t = (alignment - cosSize) / (1 - cosSize);
        const disc = t * t * sunPeak;
        r += profile.keyColor.r * disc;
        g += profile.keyColor.g * disc;
        b += profile.keyColor.b * disc;
      } else if (alignment > 0) {
        // Circumsolar glow — the thing that makes a sky read as a sky rather than a ramp.
        const glow = Math.pow(alignment, 26) * (1.6 + profile.warmth * 2.4);
        r += profile.keyColor.r * glow;
        g += profile.keyColor.g * glow;
        b += profile.keyColor.b * glow;
      }

      const offset = (y * width + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 1;
    }
  }

  if (saturation !== 1) {
    // Linear Rec.709 grey preserves each complete texel's energy, including sun/glow.
    for (let i = 0; i < data.length; i += 4) {
      const y = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      const r = y + (data[i] - y) * saturation;
      const g = y + (data[i + 1] - y) * saturation;
      const b = y + (data[i + 2] - y) * saturation;
      const cr = Math.max(0, r), cg = Math.max(0, g), cb = Math.max(0, b);
      // Above unity, clipping can add luminance. Renormalise only clipped texels.
      const clippedY = cr * 0.2126 + cg * 0.7152 + cb * 0.0722;
      const scale = (r < 0 || g < 0 || b < 0) && clippedY > 0 ? y / clippedY : 1;
      data[i] = cr * scale;
      data[i + 1] = cg * scale;
      data[i + 2] = cb * scale;
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** How hard a surface family should take the environment. Keyed off what the material is. */
function envIntensityFor(material) {
  if (material.isMeshPhysicalMaterial || material.isMeshStandardMaterial) {
    // MaterialLibrary stamps an authored base so family response stays stable under retune.
    if (typeof material.userData?.envIntensityBase === 'number') {
      return material.userData.envIntensityBase;
    }
    if ((material.metalness ?? 0) > 0.45) return 1.35;
    if (material.transparent && (material.opacity ?? 1) < 0.9) return 1.15;
    if ((material.roughness ?? 1) < 0.35) return 1.20;
    return 0.92;
  }
  return 0;
}

// L4C: restore the reflection response of steel and glazing without raising the
// diffuse IBL on masonry. Explicit envMap materials bypass the scene intensity.
// Water keeps its independent response, including any standard-material accents.
//
// Style W1 L3: with ?styleRules=1 the fourfold is keyed on the ruled metalness and on glass, not on the
// family name, so painted steel the rule has brought down to 0.15 takes the plain environment. A material the rules
// leave alone (glass or water, by its own tests or by the name of a mesh that draws it: isStyleExempt) keeps
// today's scale, so the childcare centre's transparent painted_metal glass stays at the fourfold.
function materialEnvironmentScale(material, styleRules = false) {
  const family = material.userData?.family ?? '';
  const label = `${material.name ?? ''} ${family}`;
  if (/water|ocean|foam|wake/i.test(label) || material.userData?.architecturalMatteFloor) return 1;
  if (styleRules && !isStyleExempt(material)) return /glass/i.test(label) || (material.metalness ?? 0) > 0.15 ? 4 : 1;
  return family === 'painted_metal' || /glass/i.test(label)
    || (material.metalness ?? 0) > 0.15 ? 4 : 1;
}

const LIGHT_GAIN_K_MIN = 0;
const LIGHT_GAIN_E_MIN = 0.25;
const LIGHT_GAIN_MAX = 2;

/** key/ambient/envGain [0, 2], exposure [0.25, 2], skySat/envSat [0, 1.5]; legacy shapes stay intact. */
export function parseLightGain(search) {
  const raw = new URLSearchParams(search || '').get('lightGain');
  if (raw == null || raw === '') return null;
  const parts = raw.split(',');
  if (parts.length === 4 || parts.length === 6) {
    if (parts.some((part) => part.trim() === '')) return null;
    const [key, ambient, exposure, skySat, envSat = 1, envGain = 1] = parts.map(Number);
    if (![key, ambient, exposure, skySat, envSat, envGain].every(Number.isFinite)) return null;
    if (key < 0 || key > 2 || ambient < 0 || ambient > 2
      || exposure < 0.25 || exposure > 2 || skySat < 0 || skySat > 1.5
      || envSat < 0 || envSat > 1.5 || envGain < 0 || envGain > 2) return null;
    return Object.freeze(parts.length === 4 ? { key, ambient, exposure, skySat }
      : { key, ambient, exposure, skySat, envSat, envGain });
  }
  if (parts.length !== 2) return null;
  const k = Number(parts[0].trim());
  const e = Number(parts[1].trim());
  if (!Number.isFinite(k) || !Number.isFinite(e)) return null;
  if (k < LIGHT_GAIN_K_MIN || k > LIGHT_GAIN_MAX || e < LIGHT_GAIN_E_MIN || e > LIGHT_GAIN_MAX) return null;
  return Object.freeze({ k, e });
}

/** Query-only white balance: independent key/fill mixes in the inclusive unit interval. */
export function parseWhiteBalance(search) {
  const raw = new URLSearchParams(search || '').get('wb');
  if (raw == null) return null;
  const parts = raw.split(',');
  if (parts.length !== 2 || parts.some((part) => part.trim() === '')) return null;
  const [key, fill] = parts.map(Number);
  if (![key, fill].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) return null;
  return Object.freeze({ key, fill });
}

function readLightGain() {
  const search = typeof location !== 'undefined' && location?.search ? location.search : '';
  const gain = parseLightGain(search);
  if (!gain) return null;
  return 'k' in gain
    ? { key: gain.k, ambient: gain.k, exposure: gain.e, skySat: 1, envSat: 1, envGain: 1 }
    : { envSat: 1, envGain: 1, ...gain };
}

function isWaterEnvMaterial(entry) {
  const family = entry?.userData?.family ?? '';
  const label = `${entry?.name ?? ''} ${family}`;
  return /water|ocean|foam|wake/i.test(label);
}

// Adopted once per fresh solarProfile. _applyProfile must not stamp again or a second call squares k.
function adoptProfileGain(profile, gain) {
  if (!gain) return;
  profile.keyIntensity *= gain.key;
  profile.fillIntensity *= gain.ambient;
  profile.rimIntensity *= gain.ambient;
  profile.bounceIntensity *= gain.ambient;
  profile.grade.exposure *= gain.exposure;
}

// Photo shadow assigns the hemisphere from a constant, not the profile. No gain leaves the data property.
const skyFloorGainSlots = new WeakMap();
function installSkyFloorGain(light, k) {
  let slot = skyFloorGainSlots.get(light);
  if (!slot) {
    slot = { raw: light.intensity, k };
    skyFloorGainSlots.set(light, slot);
    Object.defineProperty(light, 'intensity', {
      configurable: true,
      enumerable: true,
      get() { return slot.raw * slot.k; },
      set(value) { slot.raw = value; },
    });
  } else {
    slot.k = k;
  }
}

// The getter stays installed after the query loses lightGain, so a later write of the photo
// value still reads raw * 0. Put the stored raw back and drop the slot.
function releaseSkyFloorGain(light) {
  const slot = skyFloorGainSlots.get(light);
  if (!slot) return;
  Object.defineProperty(light, 'intensity', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: slot.raw,
  });
  skyFloorGainSlots.delete(light);
}

/** Scale the stored hemisphere intensity. The getter returns raw * k, so `intensity *= f` would square k. */
export function scaleSkyFloorRaw(light, factor) {
  const slot = skyFloorGainSlots.get(light);
  if (slot) slot.raw *= factor;
  else light.intensity *= factor;
}

// SceneView rebuilds light colours with copy(), optional RGB tint, then multiplyScalar().
// Keep that entire tint in raw linear RGB; finish saturation after its energy normalisation.
// The photo pass also writes rim/bounce RGB directly, so it flushes pending copies at its
// existing setWeatherEnvironmentGain call. Weather's grey mix commutes with this transform.
// White balance uses the same hooks on the key and ambient lights, leaving the shared
// solar profile (sky, fog, water and environment sources) untouched. Each copy marks a
// fresh raw colour; repeated flushes do nothing, and release removes the instance hooks.
function installColourSaturation(color, saturation) {
  const copy = color.copy;
  const multiply = color.multiplyScalar;
  const descriptors = ['copy', 'multiplyScalar'].map((name) => Object.getOwnPropertyDescriptor(color, name));
  const raw = color.clone();
  const slot = {
    saturation, pending: true,
    apply() {
      if (!slot.pending) return;
      raw.copy(color);
      const y = raw.r * 0.2126 + raw.g * 0.7152 + raw.b * 0.0722;
      // No channel clamp: oversaturation must retain this colour's linear luminance.
      color.setRGB(y + (raw.r - y) * slot.saturation,
        y + (raw.g - y) * slot.saturation, y + (raw.b - y) * slot.saturation,
        THREE.LinearSRGBColorSpace);
      slot.pending = false;
    },
    release() {
      copy.call(color, raw);
      ['copy', 'multiplyScalar'].forEach((name, i) => {
        if (descriptors[i]) Object.defineProperty(color, name, descriptors[i]);
        else delete color[name];
      });
    },
  };
  Object.defineProperties(color, {
    copy: { configurable: true, writable: true, value(source) {
      copy.call(this, source);
      slot.pending = true;
      return this;
    } },
    multiplyScalar: { configurable: true, writable: true, value(factor) {
      multiply.call(this, factor);
      if (slot.pending) slot.apply();
      else raw.multiplyScalar(factor);
      return this;
    } },
  });
  return slot;
}

export class LightingRig {
  /**
   * @param {THREE.Scene} scene
   * @param {{x:number,z:number}} extent board extent in world units
   * @param {{quality?:string, timeOfDay?:number, renderer?:THREE.WebGLRenderer, styleRules?:boolean, styleEmit?:boolean}} options
   *   styleRules and styleEmit are style W1 L3's two switches (?styleRules=1, ?styleEmit=1); both default to the URL, which is off.
   */
  constructor(scene, extent, {
    quality = 'high', timeOfDay = 0.865, renderer = null,
    styleRules = STYLE_SWITCHES.rules, styleEmit = STYLE_SWITCHES.emit,
  } = {}) {
    this.scene = scene;
    this.styleRules = Boolean(styleRules);
    this.styleEmit = Boolean(styleEmit);
    /** Receipts of the latest style walks, and running totals (undefined until a switch is on and a walk has run). */
    this.lastStyleRulesStats = undefined;
    this.lastStyleEmitStats = undefined;
    this.styleWalkTotals = { walks: 0, rulesChanged: 0, emitChanged: 0 };
    this._lampList = [];
    this.extent = extent;
    this.quality = quality;
    this.renderer = renderer;
    this.timeOfDay = timeOfDay;
    this.profile = solarProfile(timeOfDay);
    this._lightGain = readLightGain();
    this._gainHemispheres = new Set();
    this._colourSaturation = new Map();
    adoptProfileGain(this.profile, this._lightGain);
    // Adopt once per fresh profile; only live light colours consume this recipe.
    this._whiteBalance = parseWhiteBalance(typeof location !== 'undefined' ? location.search : '');
    this.boardRadius = Math.max(extent.x, extent.z) * 0.72;
    /**
     * Optional fixed shadow-camera radius, in world units. Null on the board, which wants the
     * band ladder below. The residential fidelity lab sets it once the subject's bounds are
     * known, because a lab stage is one building on a stage the size of a board block: the
     * ladder picks its smallest band, 26 units, centred on the camera's aim point, and a low
     * sun throws a shadow well past that. Four separate critics independently reported the same
     * plate defect — "a hard-edged shadow polygon with a straight boundary unrelated to the
     * building silhouette" — and read it as the ground plane running out. It is the shadow
     * camera's own bound. Additive and opt-in: the board never sets it and its behaviour is
     * unchanged.
     */
    this._shadowRadius = null;
    // §7 authors 2048 per cascade. The band ladder in _fitShadow() uses one map rather
    // than four, and a 4096 map matched the four-cascade texel budget — but it also cost
    // 67 MB of depth per WebGL context, and the capture harness opens twenty-three of them
    // in sequence on a software rasteriser. 2048 over the tightest band that covers the
    // view is the spec's own number and holds the penumbra at this scale.
    this.shadowMapSize = quality === 'high' ? 2048 : quality === 'medium' ? 1536 : 0;
    // Family base intensity per tuned material, so a time-of-day move can re-derive the
    // final intensity exactly rather than compounding onto whatever is already there.
    this._weatherEnvironmentGain = 1;
    this._tunedMaterials = new WeakMap();
    this._tunedList = [];
    this._aerialList = [];
    this.lastArchitecturalMatteStats = Object.freeze({
      materials: 0, bindings: 0, matched: 0, changed: 0,
    });
    this.lastAerialInstallCount = 0;
    this._sunDir = new THREE.Vector3();
    this._lightBasis = new THREE.Matrix4();
    this._scratch = new THREE.Vector3();
    this._footOrigin = new THREE.Vector3();
    this._footCorner = new THREE.Vector3();
    this._footDir = new THREE.Vector3();
    this._centre = new THREE.Vector3(extent.x / 2, 0, extent.z / 2);
    this._band = SHADOW_CASCADE_BANDS[SHADOW_CASCADE_BANDS.length - 1];
    this.lastShadowFit = Object.freeze({
      radius: this._band, texel: 0, band: this._band, wanted: this._band,
    });

    // Key — warm, low, the only shadow caster. Cascade selection is a per-frame band fit
    // (see _fitShadow) rather than per-fragment cascades: per-fragment CSM needs shader
    // injection into every material, and materials.js belongs to a later workstream.
    const key = new THREE.DirectionalLight(this.profile.keyColor, this.profile.keyIntensity);
    key.castShadow = quality !== 'low';
    if (key.castShadow) {
      key.shadow.mapSize.set(this.shadowMapSize, this.shadowMapSize);
      key.shadow.camera.near = 1;
      key.shadow.camera.far = this.boardRadius * 6;
      // Critic R5–R6: soft PCF radius + raking key produced ink-blot canopy blobs on
      // asphalt. Harder shadow (radius 0) + higher normalBias keeps contact readable.
      key.shadow.bias = -0.00015;
      key.shadow.normalBias = 0.42;
      key.shadow.radius = 0;
      installShadowLod(key);
    }
    key.target.position.copy(this._centre);
    scene.add(key, key.target);
    this.key = key;

    // Fill — cool, sky side, never shadows. This is the sky term the IBL cannot carry on
    // its own at low env intensity.
    const fill = new THREE.DirectionalLight(this.profile.fillColor, this.profile.fillIntensity);
    fill.castShadow = false;
    fill.target.position.copy(this._centre);
    scene.add(fill, fill.target);
    this.fill = fill;

    // Rim — sits opposite the camera each frame so silhouettes stay tight from any azimuth.
    const rim = new THREE.DirectionalLight(this.profile.horizonColor, this.profile.rimIntensity);
    rim.castShadow = false;
    rim.target.position.copy(this._centre);
    scene.add(rim, rim.target);
    this.rim = rim;

    // Bounce — the board's own albedo throwing light back up under eaves and verandahs.
    const bounce = new THREE.DirectionalLight(this.profile.groundColor, this.profile.bounceIntensity);
    bounce.castShadow = false;
    bounce.position.set(extent.x * 0.2, -extent.x * 0.5, extent.z * 0.6);
    bounce.target.position.copy(this._centre);
    scene.add(bounce, bounce.target);
    this.bounce = bounce;

    // Sky/ground floor. The rig was four directional lights and nothing else, so any
    // surface facing away from all four received literally zero and crushed to (0,0,0).
    // Three independent reviews measured it: road under terraces at (0,0,0), frame p1
    // luminance 3 against the AAA reference's 17, and sub-luminance-8 pixels at 4% of
    // frame against the references' 0.5-0.75%. A hemisphere term floors every normal in
    // proportion to how skyward it faces, which keeps form-shading intact where a flat
    // ambient would have washed it out.
    const skyFloor = new THREE.HemisphereLight(0xffffff, 0xffffff, 0);
    scene.add(skyFloor);
    this.skyFloor = skyFloor;
    // A non-unity environment gain saves the scene value before its first assignment.
    this._sceneEnvBeforeGain = undefined;

    // SceneView uses this public texture as its visible sky at startup.
    this.environment = null;
    this._lightingEnvironmentTarget = null;
    this.pmrem = null;
    this._equirect = null;

    this._applyProfile();
  }

  get shadowRadius() { return this._shadowRadius; }

  set shadowRadius(value) {
    this._shadowRadius = Number.isFinite(Number(value)) && Number(value) > 0
      ? Number(value) : null;
    if (!this.key?.castShadow || this._shadowRadius == null) return;
    // A residential lab subject occupies a small, fixed stage. Its opt-in setter can spend
    // the tighter map on penumbra quality; the board never sets shadowRadius and stays at the
    // existing 2048 cascade budget.
    this.shadowMapSize = Math.max(this.shadowMapSize, 4096);
    this.key.shadow.mapSize.set(this.shadowMapSize, this.shadowMapSize);
    this.key.shadow.radius = 3.5;
    this.key.shadow.needsUpdate = true;
  }

  /**
   * Source equirectangular env used for the PMREM bake. W2-NATURE water samples this for
   * Fresnel reflection so the bay and the sky never disagree. Read-only.
   */
  get equirect() {
    return this._equirect ?? null;
  }

  /** Bake the PMREM environment. Called once at load; re-callable when time-of-day moves. */
  bakeEnvironment(renderer = this.renderer) {
    if (!renderer) return null;
    const saturation = this._lightGain?.envSat ?? 1;
    if (this._environmentTarget && this._environmentTime === this.profile.time
      && this._environmentSaturation === saturation) {
      return this._lightingEnvironmentTarget?.texture ?? this.environment;
    }
    const started = performance.now();
    const size = this.quality === 'low' ? 128 : 256;
    const equirect = buildEnvironmentEquirect(this.profile, size);
    // The legacy water disc is deliberately broad. In PMREM it becomes diffuse
    // illumination as well as a reflection, washing out key shadows. An 8x solar
    // radius retains a resolvable soft specular lobe without that 24x fill disc.
    const reflectionProfile = {
      ...this.profile,
      sunAngularSize: this.profile.sunAngularSize / 3,
    };
    const reflectionSource = buildEnvironmentEquirect(reflectionProfile, size, true);
    if (!this.pmrem) {
      this.pmrem = new THREE.PMREMGenerator(renderer);
      this.pmrem.compileEquirectangularShader();
    }
    const target = this.pmrem.fromEquirectangular(reflectionSource);
    reflectionSource.dispose();
    let lightingTarget = null;
    if (saturation !== 1) {
      const lightingSource = buildEnvironmentEquirect(reflectionProfile, size, true, saturation);
      lightingTarget = this.pmrem.fromEquirectangular(lightingSource);
      lightingSource.dispose();
    }
    // MS1: default sky/lighting share one target. The switch alone adds a lighting
    // target; the public environment stays coloured for SceneView's startup sky.
    if (this.scene.background === this.environment && this.environment) {
      this.scene.background = target.texture;
      this.scene.backgroundIntensity = this.profile.envIntensity;
    }
    // The render target owns the texture. Disposing only `.texture` and dropping the target
    // leaked one live GPU texture per setTimeOfDay() call — six calls moved
    // renderer.info.memory.textures 31 -> 37 at `high`. Dispose the target itself.
    if (this._environmentTarget) this._environmentTarget.dispose();
    if (this._lightingEnvironmentTarget) this._lightingEnvironmentTarget.dispose();
    if (this._equirect) this._equirect.dispose();
    this._equirect = equirect;
    this.environment = target.texture;
    this._environmentTarget = target;
    this._lightingEnvironmentTarget = lightingTarget;
    this._environmentTime = this.profile.time;
    this._environmentSaturation = saturation;
    this.environmentBakeStats = Object.freeze({
      count: (this.environmentBakeStats?.count ?? 0) + 1,
      cpuSubmitMs: performance.now() - started,
      sourceWidth: size,
    });
    this.scene.environment = lightingTarget?.texture ?? target.texture;
    this.scene.userData.ddSkyEnvironment = target.texture;
    // Only reaches materials whose envMap is still null (three r185 gates it on
    // `material.envMap === null`, WebGLRenderer.setProgram). Everything this rig has tuned
    // carries its own envMapIntensity instead — see applyEnvironmentToScene.
    // A rebake advances the ungained value too. Release at this same time may reuse
    // the cached texture, so it must restore this base rather than the pre-bake scalar.
    if (this._lightGain && (this._lightGain.ambient !== 1 || this._lightGain.envGain !== 1)) this._sceneEnvBeforeGain = this.profile.envIntensity;
    this._assignSceneEnvironment();
    // Sizes for the texture-memory accounting in perf-budget.mjs.
    const targetBytes = (size * 3) * (size * 4) * 8;
    this.environmentBytes = size * (size / 2) * 16 + targetBytes * (lightingTarget ? 2 : 1);
    return this.scene.environment;
  }

  /**
   * Give every standard material a real environment response. Materials are still built by
   * board.js; this only tunes what already exists and never replaces an instance.
   */
  applyEnvironmentToScene(root = this.scene) {
    // P16 L1: one after-load walk clamps architectural response before the environment base is
    // cached. This is load/succession work, not a frame loop; glass, water, car paint and named
    // metal trim are explicit negative controls in materials.js.
    this.lastArchitecturalMatteStats = Object.freeze(applyArchitecturalMatteFloor(root));
    // Style W1 L3: the metal and roughness rule, and daytime emission, after the matte floor and before the
    // environment base is read below (and, at board build, before the world bake fingerprints the scalars).
    if (this.styleRules || this.styleEmit) this._applyStyleWalks(root);
    let tuned = 0;
    let aerialInstalled = 0;
    root.traverse((object) => {
      if (object.isHemisphereLight && (this._lightGain || this._whiteBalance)) this._trackGainHemisphere(object);
      const material = object.material;
      if (!material) return;
      const list = Array.isArray(material) ? material : [material];
      for (const entry of list) {
        const daylight = entry.userData?.buildingGlassFinish?.daylightUniform;
        if (daylight) daylight.value = THREE.MathUtils.smoothstep(this.profile.arc, 0.08, 0.35);
        if (installLayeredAerialPerspective(entry, this.profile, object)) {
          this._aerialList.push(new WeakRef(entry));
          aerialInstalled += 1;
        }
        if (this._tunedMaterials.has(entry)) {
          // A material can acquire a semantic roof binding after its first environment tune.
          // Carry the newly discovered floor into the cached base as well as the live uniform.
          if (entry.userData?.architecturalMatteFloor) {
            const floor = entry.userData.architecturalMatteFloor.envMapIntensity;
            const base = Math.min(this._tunedMaterials.get(entry), floor);
            this._tunedMaterials.set(entry, base);
            // k = 0 stores a live intensity of 0. live / k cannot rebuild it after release.
            entry.envMapIntensity = this._environmentIntensityFor(entry, base);
          }
          continue;
        }
        const base = envIntensityFor(entry);
        if (base <= 0) continue;
        // Assigning envMap is what buys per-family control, and it is also what takes the
        // material out of scene.environmentIntensity's reach. The profile multiply is
        // therefore owned here, explicitly, rather than delegated to a dial three ignores.
        entry.envMap = this._environmentTextureFor(entry);
        const capped = Math.min(base, P1_HIGHLIGHT.maxEnvBase);
        entry.envMapIntensity = this._environmentIntensityFor(entry, capped);
        this._tunedMaterials.set(entry, capped);
        entry.needsUpdate = true;
        this._tunedList.push(new WeakRef(entry));
        tuned += 1;
      }
    });
    this.lastAerialInstallCount = aerialInstalled;
    // Load, succession and the one-shot batch root. SceneView.syncState calls
    // applyAlbedoGain again after people, crowd, overlays, services and fringe.
    applyAlbedoGain(root);
    return tuned;
  }

  /** Style W1 L3's load-time walks; each is idempotent and costs one traversal of `root`. */
  _applyStyleWalks(root) {
    const totals = this.styleWalkTotals;
    totals.walks += 1;
    if (this.styleRules) {
      const { restoredMaterials, ...receipt } = applyStyleRules(root);
      this.lastStyleRulesStats = Object.freeze(receipt);
      totals.rulesChanged += receipt.changed;
      // A material put back to its authored scalars had its environment derived from the ruled ones (base 0.92 at 1x for steel at
      // 0.15, where the authored 0.72 gives 1.35 at the fourfold). Forget the cached base: the tune that follows in this call meets
      // the material afresh, as it would with the switch off.
      if (restoredMaterials.length) {
        const gone = new Set(restoredMaterials);
        for (const material of gone) this._tunedMaterials.delete(material);
        this._tunedList = this._tunedList.filter((ref) => !gone.has(ref.deref())); // the tune lists them again
      }
    }
    if (this.styleEmit) {
      const { lampMaterials, ...receipt } = applyStyleEmit(root, { level: lampLevel(this.profile.arc) });
      for (const material of lampMaterials) {
        if (!this._lampList.some((ref) => ref.deref() === material)) this._lampList.push(new WeakRef(material));
      }
      this.lastStyleEmitStats = Object.freeze({ ...receipt, lampMaterials: lampMaterials.length });
      totals.emitChanged += receipt.changed;
    }
  }

  /** Lamp heads follow the sun: dark in daylight, their authored intensity as the sun reaches the horizon. */
  _retuneStyleEmit() {
    if (!this.styleEmit) return 0;
    const level = lampLevel(this.profile.arc);
    const survivors = [];
    for (const ref of this._lampList) {
      const material = ref.deref();
      if (!material) continue;
      survivors.push(ref);
      setLampEmission(material, level);
    }
    this._lampList = survivors;
    return survivors.length;
  }

  _environmentTextureFor(entry) {
    // Water's standard-material accents agree with its unaltered Fresnel source.
    const lighting = isWaterEnvMaterial(entry) ? null : this._lightingEnvironmentTarget?.texture;
    return lighting ?? this.environment ?? entry.envMap;
  }

  _environmentIntensityFor(entry, base) {
    // Keep the authored dry glass/matte floors, then attenuate incident environment light.
    // k is applied after the floor and the weather so a capped material still scales by exactly k. Water is not gained.
    const glassFloor = /glass/i.test(entry.name ?? '') ? P1_HIGHLIGHT.minEnvGlass : 0;
    let intensity = Math.max(glassFloor, base * this.profile.envIntensity * materialEnvironmentScale(entry, this.styleRules));
    if (entry.userData?.architecturalMatteFloor) {
      intensity = Math.min(intensity, entry.userData.architecturalMatteFloor.envMapIntensity);
    }
    intensity *= this._weatherEnvironmentGain;
    if (this._lightGain && !isWaterEnvMaterial(entry)) {
      intensity *= this._lightGain.ambient;
      intensity *= this._lightGain.envGain;
    }
    return intensity;
  }

  _assignSceneEnvironment() {
    const base = this.profile.envIntensity;
    // The background intensity is the sky. A null gain assigns base, not base * 1.
    this.scene.environmentIntensity = this._lightGain ? base * this._lightGain.ambient * this._lightGain.envGain : base;
  }

  /** Uniform-only weather transition over the existing registry; no traversal or rebake. */
  setWeatherEnvironmentGain(gain) {
    this._applyAmbientSaturation();
    if (!Number.isFinite(gain)) return false;
    gain = Math.max(0, Math.min(1, gain));
    if (gain === this._weatherEnvironmentGain) return false;
    this._weatherEnvironmentGain = gain;
    for (const ref of this._tunedList) {
      const entry = ref.deref();
      if (!entry) continue;
      const base = this._tunedMaterials.get(entry);
      if (base !== undefined) entry.envMapIntensity = this._environmentIntensityFor(entry, base);
    }
    return true;
  }

  /** Re-derive every tuned material's intensity from its family base and the live profile. */
  _retuneEnvironment() {
    let live = 0;
    const survivors = [];
    for (const ref of this._tunedList) {
      const entry = ref.deref();
      if (!entry) continue;
      survivors.push(ref);
      const daylight = entry.userData?.buildingGlassFinish?.daylightUniform;
      if (daylight) daylight.value = THREE.MathUtils.smoothstep(this.profile.arc, 0.08, 0.35);
      const base = this._tunedMaterials.get(entry);
      if (base === undefined) continue;
      entry.envMap = this._environmentTextureFor(entry);
      entry.envMapIntensity = this._environmentIntensityFor(entry, base);
      entry.needsUpdate = true;
      live += 1;
    }
    this._tunedList = survivors;
    this._retuneStyleEmit();
    return live;
  }

  /** Keep every installed material's cool target tied to the live procedural sky. */
  _retuneAerialColors() {
    const survivors = [];
    let live = 0;
    for (const ref of this._aerialList) {
      const entry = ref.deref();
      const uniform = entry?.userData?.layeredAerialPerspective?.coolUniform;
      if (!entry || !uniform?.value) continue;
      survivors.push(ref);
      uniform.value.copy(this.profile.skyColor);
      live += 1;
    }
    this._aerialList = survivors;
    return live;
  }

  setTimeOfDay(t) {
    this.timeOfDay = Math.min(1, Math.max(0, t));
    this.profile = solarProfile(this.timeOfDay);
    this._lightGain = readLightGain();
    adoptProfileGain(this.profile, this._lightGain);
    // Adopt once per fresh profile; only live light colours consume this recipe.
    this._whiteBalance = parseWhiteBalance(typeof location !== 'undefined' ? location.search : '');
    this._applyProfile();
    if (this.renderer) {
      this.bakeEnvironment();
      // The bake hands back a new texture object, and the per-material intensity is a
      // function of the new profile, so both have to be pushed back onto every material.
      // Round 1 moved only scene.environmentIntensity, which meant time-of-day stopped
      // changing IBL strength entirely after the first bake.
    }
    // Uniform-only/headless users also follow time of day. This reuses the
    // material registry and runs on a time change, never in the frame loop.
    this._retuneEnvironment();
    return this.profile;
  }

  _trackGainColour(color, key = false) {
    // Desaturation is the equal-luminance mix towards neutral. Compose with skySat
    // before installing one hook, so copied/tinted colours are never balanced twice.
    const saturation = key ? 1 - (this._whiteBalance?.key ?? 0)
      : (this._lightGain?.skySat ?? 1) * (1 - (this._whiteBalance?.fill ?? 0));
    const slot = this._colourSaturation.get(color);
    if (slot && slot.saturation !== saturation) {
      slot.release();
      this._colourSaturation.delete(color);
    }
    if (saturation !== 1 && !this._colourSaturation.has(color)) {
      const next = installColourSaturation(color, saturation);
      this._colourSaturation.set(color, next);
      next.apply();
    }
  }

  _trackGainHemisphere(light) {
    this._gainHemispheres.add(light);
    const ambient = this._lightGain?.ambient ?? 1;
    if (ambient !== 1) installSkyFloorGain(light, ambient);
    else releaseSkyFloorGain(light);
    this._trackGainColour(light.color);
    this._trackGainColour(light.groundColor);
  }

  _syncLightGain() {
    if (this._lightGain || this._whiteBalance) {
      this.scene.traverse((object) => {
        if (object.isHemisphereLight) this._trackGainHemisphere(object);
      });
      this._trackGainColour(this.key.color, true);
      for (const light of [this.fill, this.rim, this.bounce]) this._trackGainColour(light.color);
    } else {
      for (const light of this._gainHemispheres) releaseSkyFloorGain(light);
      this._gainHemispheres.clear();
      for (const slot of this._colourSaturation.values()) slot.release();
      this._colourSaturation.clear();
    }
  }

  _applyAmbientSaturation() {
    for (const slot of this._colourSaturation.values()) slot.apply();
  }

  _applyProfile() {
    this._syncLightGain();
    const profile = this.profile;
    sunDirection(profile, this._sunDir);
    const reach = this.boardRadius * 2.2;
    this.key.color.copy(profile.keyColor);
    this.key.intensity = profile.keyIntensity;
    this.key.position.copy(this._centre).addScaledVector(this._sunDir, reach);

    this.fill.color.copy(profile.fillColor);
    this.fill.intensity = profile.fillIntensity;
    this.fill.position.set(
      this._centre.x - this._sunDir.x * reach * 0.5,
      this._centre.y + reach * 0.85,
      this._centre.z - this._sunDir.z * reach * 0.5,
    );

    this.rim.color.copy(profile.horizonColor);
    this.rim.intensity = profile.rimIntensity;

    this.bounce.color.copy(profile.groundColor);
    this.bounce.intensity = profile.bounceIntensity;

    this.skyFloor.color.copy(profile.skyColor);
    this.skyFloor.groundColor.copy(profile.groundColor);
    // P19 X3: L1 intensity (0.30). Colours stay L1's; midtones move in post exposure.
    this.skyFloor.intensity = P1_LIGHT.skyFloorIntensity;
    this._applyAmbientSaturation();
    this._retuneAerialColors();

    if (this.scene.fog) {
      applyP1FogColor(this.scene.fog, profile);
    }
    // Unity must leave the scene scalar byte-identical even before the first bake.
    // Non-unity keeps the legacy profile-based gain; release restores the saved scalar.
    if (this._lightGain && (this._lightGain.ambient !== 1 || this._lightGain.envGain !== 1)) {
      this._sceneEnvBeforeGain ??= this.scene.environmentIntensity;
      this._assignSceneEnvironment();
    } else if (this._sceneEnvBeforeGain !== undefined) {
      this.scene.environmentIntensity = this._sceneEnvBeforeGain;
      this._sceneEnvBeforeGain = undefined;
    }
  }

  /**
   * Per-frame rig update. `camera` and `distance` come from the iso rig; nothing here reads
   * the clock, so a stepped frame and a live frame produce the same rig.
   * `photoReceiverBudget` is only for SceneView's immediate photo-shadow successor.
   */
  update(camera, target, distance, photoReceiverBudget = false) {
    if (camera) this._orientRim(camera, target);
    // P19 X1C: distance LOD + low-LOD shadow casters. One map update per frame.
    if (camera) applyLod(this.scene, camera);
    if (this.key.castShadow) {
      // X8B: reduce only the high-altitude shadow target, with zoom hysteresis.
      const altitude = camera?.position.y ?? 0;
      this._highShadow = this._highShadow ? altitude >= 180 : altitude >= 210;
      const mapSize = this.shadowRadius == null && this._highShadow
        ? Math.min(1024, this.shadowMapSize) : this.shadowMapSize;
      if (this.key.shadow.mapSize.x !== mapSize) {
        this.key.shadow.map?.dispose();
        this.key.shadow.map = null;
        this.key.shadow.mapSize.set(mapSize, mapSize);
      }
      this._fitShadow(target, distance, camera);
      // Casters: ≥ SHADOW_CASTER_MIN_M (1.5 m) within SHADOW_CASTER_RANGE_M (160 m).
      const batch = this.scene.userData.batching;
      if (batch && this._contactCasterBatch !== batch) {
        this._restoreContactCasters(batch);
        this._contactCasterBatch = batch;
      }
      // Photo CSM replaces these flags before any draw; standalone rigs retain the
      // radial budget. LOD selection and contact-caster discovery above still run.
      if (!photoReceiverBudget) {
        if (batch && camera) applyShadowCasterBudget(this.scene, camera, target, batch);
        // A far/impostor LOD must not keep rendering its source into the shadow map.
        const lod = this.scene.userData.lodState;
        if (lod?.applied) {
          for (const record of lod.records) {
            if (record.level !== 2 && record.level !== 'impostor' && record.level !== 'hide') continue;
            record.mesh.castShadow = false;
            if (record.mesh.userData.shadowMesh) record.mesh.userData.shadowMesh.castShadow = false;
          }
        }
      }
      this.key.shadow.needsUpdate = true;
    }
  }

  /** L3: batching sizes limbs separately, then replaces them with named stubs.
   * Restore the resulting draw, using the whole figure's stature or the port
   * prop's authored >=0.5 m size. Decals never qualify. The existing 160 m
   * distance budget (or the photo receiver successor) includes these recovered draws.
   */
  _restoreContactCasters(batch) {
    const draws = new Set();
    this.scene.traverse((source) => {
      let figure = null;
      for (let p = source.parent; p && !figure; p = p.parent) {
        if (p.userData.p17Figure) figure = p.userData.p17Figure;
      }
      const part = source.userData.p17FigurePart || source.userData.p17FigureMid
        || source.userData.p17FigureCard;
      const person = part && (figure?.stature ?? 0) >= 0.4;
      const prop = /^fringe:port/.test(source.name)
        && source.userData.shadowSizeM >= 0.5
        && !/contact|shadow-line|foam|wetline/.test(source.name);
      if (!person && !prop) return;
      const draw = source.userData.mergedInto ?? source;
      if (!draw.isMesh || draw.material?.transparent || draw.material?.colorWrite === false) return;
      draws.add(draw);
    });
    for (const draw of draws) {
      draw.userData.shadowCulledSize = false;
      draw.castShadow = true;
      draw.receiveShadow = true;
      if (!batch.casters.includes(draw)) batch.casters.push(draw);
    }
    this.contactCasterDraws = draws.size;
  }

  _orientRim(camera, target) {
    // Opposite the camera, lifted, so the far edge of every roof keeps a lit line.
    const centre = target ?? this._centre;
    this._scratch.copy(camera.position).sub(centre);
    this._scratch.y = 0;
    if (this._scratch.lengthSq() < 1e-6) this._scratch.set(0, 0, 1);
    this._scratch.normalize().multiplyScalar(-this.boardRadius * 1.6);
    this.rim.position.set(
      centre.x + this._scratch.x,
      centre.y + this.boardRadius * 0.55,
      centre.z + this._scratch.z,
    );
    this.rim.target.position.copy(centre);
    this.rim.target.updateMatrixWorld();
  }

  /**
   * Fit the key's shadow camera to the visible board region, quantised to four authored
   * bands and snapped to whole shadow texels so the penumbra does not crawl as the camera
   * moves. Same texel budget as four 2048 cascades, one map, no material shader injection.
   *
   * P16 L2: a low-angle port pose used to spend the one map on the horizon (band 260,
   * 0.254 m/texel) so crane legs, ships and figures dissolved under the 2.0 PCF kernel
   * while shed-lane — a tighter footprint — still raked. Fit the FOCUS volume, keep
   * tall casters, and never pick a band that breaks the 0.25 m/texel ceiling.
   */
  _fitShadow(target, distance, viewCamera = null) {
    // P16 (2026-09-03): the box used to be a band-sized square around the ORBIT TARGET. At a
    // low-angle pose the visible ground runs far past the target in the view direction, so the
    // port's gantries (75–111 m from the target at container-zone) fell outside the ±58 m box
    // and cast nothing. Fit to the view frustum's ground footprint instead: the camera's near
    // corners plus its far corners dropped onto y = 0 (clamped along the ray), boxed in light
    // space, then centred and quantised exactly as before so the penumbra still does not crawl.
    let centre = target ?? this._centre;
    let wanted = Math.max(18, (distance ?? this.boardRadius * 2) * 0.52);
    if (viewCamera && viewCamera.isPerspectiveCamera) {
      const fit = this._viewFootprint(viewCamera, centre, distance ?? this.boardRadius * 2);
      if (fit) { centre = fit.centre; wanted = Math.max(18, fit.radius); }
    }
    let band = SHADOW_CASCADE_BANDS[SHADOW_CASCADE_BANDS.length - 1];
    for (const candidate of SHADOW_CASCADE_BANDS) {
      if (wanted <= candidate) { band = candidate; break; }
    }
    const maxRadius = Math.min(
      this.boardRadius * 1.35,
      (Math.max(1, this.shadowMapSize) * SHADOW_TEXEL_CEILING_M) / 2,
    );
    let radius;
    if (this.shadowRadius != null) {
      radius = this.shadowRadius;
    } else if (band <= maxRadius) {
      radius = Math.min(band, maxRadius);
    } else {
      // The 260 m band is 0.254 m/texel at 2048 — just over the ceiling. Use the
      // wanted radius (still texel-snapped below) so a port close-up does not
      // jump from 124 m to 260 m and dissolve the crane.
      radius = Math.min(Math.max(wanted, 18), maxRadius);
    }
    const camera = this.key.shadow.camera;

    // The board deliberately keeps a crisp PCF edge. The fidelity lab opts into a bounded
    // shadow camera through shadowRadius; give only that path a real filter kernel so its
    // ground shadow has a penumbra instead of the straight, hard slab named by the critics.
    // The fidelity lab opts into a broad map and needs a readable eave/contact penumbra, but
    // six filter taps made the wall toe disappear. Keep the board's crisp path unchanged.
    // P16 (2026-09-04) TRIAL: board path 0 → 2.0. The BA3 blind critic read the ring's shadows
    // as "crushed-black hard shadows with no bounce"; the Monopoly Plus stills carry a visible
    // penumbra on every cast shadow. Measured on the transport plate and crane-close — see
    // P13-PORT-LOGISTICS-PLAN.md 09-04 08:30Z; reverted there if the edge did not soften.
    this.key.shadow.radius = this.shadowRadius == null ? 2.0 : 3.5;

    // Light-space basis, so the snap happens in the space the shadow map is rasterised in.
    this._lightBasis.lookAt(this._sunDir, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
    const basis = this._lightBasis.clone();
    const inverse = basis.clone().invert();
    this._scratch.copy(centre).applyMatrix4(inverse);
    const texel = (radius * 2) / Math.max(1, this.key.shadow.mapSize.x);
    this._scratch.x = Math.round(this._scratch.x / texel) * texel;
    this._scratch.y = Math.round(this._scratch.y / texel) * texel;
    this._scratch.applyMatrix4(basis);

    const reach = this.boardRadius * 2.4;
    this.key.position.copy(this._scratch).addScaledVector(this._sunDir, reach);
    this.key.target.position.copy(this._scratch);
    this.key.target.updateMatrixWorld();

    // P16 L2: scale normalBias with texel so a 1 m crane leg at a tight band is not
    // peter-panned off the apron. 0.42 stays the ceiling (the constructor / wide band).
    if (this.shadowRadius == null) {
      this.key.shadow.normalBias = Math.min(0.42, Math.max(0.10, texel * 1.35 + 0.08));
    }

    if (camera.left !== -radius || camera.right !== radius || camera.far !== reach * 2) {
      camera.left = -radius;
      camera.right = radius;
      camera.top = radius;
      camera.bottom = -radius;
      camera.near = 1;
      camera.far = reach * 2;
      camera.updateProjectionMatrix();
    }
    this._band = band;
    this.lastShadowFit = Object.freeze({
      radius, texel, band, wanted, maxRadius,
    });
  }

  /**
   * Focus volume of the view frustum, in light-space extents. Returns the world-space
   * centre of the volume and the half-size of the square that encloses it in the light's
   * basis, or null when the camera looks away from the ground.
   *
   * P16 L2: the previous fit dropped only y = 0 corners at up to 2.4 × orbit distance
   * (capped at 299 m). A 26° polar close-up then enclosed the horizon, picked band 260,
   * and the crane boom sitting in the TOP of the frame was outside the ortho XY because
   * a downward camera never hits y = 48 on those rays. Sample the frustum at several
   * clip depths (so a boom in frame is a caster), drop the same rays onto the ground
   * (so the apron still receives), and clamp reach to the focus — never the sky.
   */
  _viewFootprint(viewCamera, fallbackCentre, distance) {
    viewCamera.updateMatrixWorld();
    const origin = this._footOrigin.setFromMatrixPosition(viewCamera.matrixWorld);
    const maxReach = Math.min(Math.max(48, distance * 1.15), 168);
    const points = [];
    const corner = this._footCorner;
    const dir = this._footDir;
    const clipDepths = [-0.82, -0.15, 0.35];
    for (const ndcZ of clipDepths) {
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          corner.set(sx, sy, ndcZ).unproject(viewCamera);
          dir.copy(corner).sub(origin);
          const span = dir.length();
          if (span < 1e-6) continue;
          dir.multiplyScalar(1 / span);
          const t = Math.min(span, maxReach);
          points.push(origin.clone().addScaledVector(dir, t));
          // Ground hit of the same ray, so the apron in front of a raking camera
          // stays inside the map even when the near clip is all crane steel.
          if (dir.y < -1e-4) {
            const tGround = Math.min(maxReach, -origin.y / dir.y);
            if (tGround > 0) points.push(origin.clone().addScaledVector(dir, tGround));
          }
        }
      }
    }
    // The orbit target always stays inside the box, so a pose that tilts to the sky still
    // shades what the player is looking at. A 48 m pole at the aim point covers a gantry
    // boom / container stack whose ground projection is inside the view.
    points.push(fallbackCentre.clone());
    points.push(fallbackCentre.clone().setY(SHADOW_TALL_CASTER_M));
    this._lightBasis.lookAt(this._sunDir, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
    const inverse = this._lightBasis.clone().invert();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const local = new THREE.Vector3();
    for (const p of points) {
      local.copy(p).applyMatrix4(inverse);
      if (local.x < minX) minX = local.x;
      if (local.x > maxX) maxX = local.x;
      if (local.y < minY) minY = local.y;
      if (local.y > maxY) maxY = local.y;
    }
    if (!Number.isFinite(minX + maxX + minY + maxY)) return null;
    // 22 m covered a kerb. A 48 m caster at ToD 0.42 (elev ≈ 40°) spans
    // ~37 m of light-space Y past its ground point; keep half of that as margin
    // so a boom on the box edge still casts onto the apron in frame.
    const elev = Math.asin(Math.min(1, Math.max(0.08, this._sunDir.y)));
    const margin = 22 + SHADOW_TALL_CASTER_M * Math.cos(elev) * 0.45;
    const radius = Math.max(maxX - minX, maxY - minY) * 0.5 + margin;
    const centreLocal = new THREE.Vector3((minX + maxX) * 0.5, (minY + maxY) * 0.5, 0);
    // Back to world on the ground plane: the light basis is a rotation, so apply it and drop
    // the point onto y = 0 along the sun direction for a stable target.
    const centre = centreLocal.applyMatrix4(this._lightBasis);
    if (Math.abs(this._sunDir.y) > 1e-4) centre.addScaledVector(this._sunDir, -centre.y / this._sunDir.y);
    return { centre, radius };
  }

  /** Everything the post chain needs to stay in agreement with the rig. */
  postState() {
    return {
      sunDirection: this._sunDir,
      grade: this.profile.grade,
      keyColor: this.profile.keyColor,
      timeOfDay: this.timeOfDay,
      shadowBand: this._band,
      shadowFit: this.lastShadowFit,
    };
  }

  dispose() {
    // A surviving shared material leaves this owner with its dry scalar and no stale texture.
    this.setWeatherEnvironmentGain(1);
    for (const light of this._gainHemispheres) releaseSkyFloorGain(light);
    for (const slot of this._colourSaturation.values()) slot.release();
    this._gainHemispheres.clear();
    this._colourSaturation.clear();
    for (const light of [this.key, this.fill, this.rim, this.bounce]) {
      if (light.shadow?.map) light.shadow.map.dispose();
      light.dispose?.();
      light.target.removeFromParent();
      light.removeFromParent();
    }
    // Drop the environment reference off anything still alive before the texture goes, so
    // a material that outlives the rig cannot bind a released GPU texture.
    for (const ref of this._tunedList) {
      const entry = ref.deref();
      if (entry) entry.envMap = null;
    }
    this._tunedList = [];
    this._aerialList = [];
    if (this.scene.background === this.environment) this.scene.background = null;
    if (this.scene.userData.ddSkyEnvironment === this.environment) delete this.scene.userData.ddSkyEnvironment;
    if (this._environmentTarget) this._environmentTarget.dispose();
    if (this._lightingEnvironmentTarget) this._lightingEnvironmentTarget.dispose();
    if (this._equirect) this._equirect.dispose();
    if (this.pmrem) this.pmrem.dispose();
    this.scene.environment = null;
    this.environment = null;
    this._lightingEnvironmentTarget = null;
    this.pmrem = null;
    this._equirect = null;
    this._environmentTarget = null;
  }
}

/**
 * Cloud-shadow mottle (TASTE-BIBLE section 3, rain state, round-one gate ruling 2).
 *
 * Under rain the key is multiplied by two octaves of value noise at 140 m and 400 m feature size,
 * mapped to 0.55-1.0 and drifting at 3 m/s, so the paddocks dim unevenly instead of together.
 * One factor is computed per fragment (after the normal is set up, where `vViewPosition` is known)
 * and applied wherever three.js reads a directional light, so CSM and the plain loop both see it.
 * One shared uniform `uDDCloud` (x strength, yz drift in metres) rides every ShaderLib program the
 * same way the globe bend does; strength 0 (clear sky) is a uniform branch that costs nothing.
 */
export const CLOUD_MOTTLE = Object.freeze({
  octaves: [140, 400],
  weights: [0.62, 0.38],
  // W4-C: 0.55 -> 0.40. Rain keeps only 55% of the sun, so a 0.55-1.0 factor on the key moved the
  // hinterland by about one V point (rain-gate SD 1.17 against 3-9); 0.40 is the depth at which the
  // paddocks read as drifting cloud shadow at the overview without turning into stains.
  min: 0.40,
  /** Share of the key's cloud depth that also dims the hemisphere (sky) light. */
  hemisphere: 0.55,
  driftMps: 3,
  heading: [0.8, 0.6],
});

export const CLOUD_STATE = { uDDCloud: { value: new THREE.Vector4(0, 0, 0, 0) } };

const CLOUD_COMMON = /* glsl */ `
#ifndef DD_CLOUD_MOTTLE
#define DD_CLOUD_MOTTLE
uniform vec4 uDDCloud;
vec3 ddCloudWorld = vec3( 0.0 );
float ddCloudFactor = 1.0;
float ddCloudHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float ddCloudVN( vec2 p ) {
	vec2 i = floor( p ); vec2 f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( ddCloudHash( i ), ddCloudHash( i + vec2( 1.0, 0.0 ) ), u.x ),
		mix( ddCloudHash( i + vec2( 0.0, 1.0 ) ), ddCloudHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
float ddCloudMottle( vec3 w ) {
	vec2 q = w.xz - uDDCloud.yz;
	float n = ${CLOUD_MOTTLE.weights[1].toFixed(2)} * ddCloudVN( q / ${CLOUD_MOTTLE.octaves[1].toFixed(1)} )
		+ ${CLOUD_MOTTLE.weights[0].toFixed(2)} * ddCloudVN( q / ${CLOUD_MOTTLE.octaves[0].toFixed(1)} + vec2( 7.3, 3.1 ) );
	return mix( 1.0, mix( ${CLOUD_MOTTLE.min.toFixed(2)}, 1.0, smoothstep( 0.40, 0.60, n ) ), uDDCloud.x );
}
#endif
`;

let _cloudInstalled = false;

/** Idempotent. Call once before the first compile, beside `installWorldCurve`. */
export function installCloudMottle(three = THREE) {
  if (_cloudInstalled) return;
  const chunk = three.ShaderChunk;
  if (!chunk?.common || !chunk.lights_pars_begin || !chunk.normal_fragment_begin) return;
  const dirInfo = 'light.color = directionalLight.color;';
  if (!chunk.lights_pars_begin.includes(dirInfo)) return;
  _cloudInstalled = true;
  chunk.common += `\n${CLOUD_COMMON}\n`;
  chunk.lights_pars_begin = chunk.lights_pars_begin.replace(dirInfo, `${dirInfo}\n\t\tlight.color *= ddCloudFactor;`);
  // W4-C: the sky light dims under the same cloud, at CLOUD_MOTTLE.hemisphere of the key's depth.
  // Rain keeps 55% of the sun, so the key alone moved the paddocks by about one V point.
  const hemiInfo = 'vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );';
  if (chunk.lights_pars_begin.includes(hemiInfo)) {
    chunk.lights_pars_begin = chunk.lights_pars_begin.replace(hemiInfo,
      `${hemiInfo}\n\t\tirradiance *= mix( 1.0, ddCloudFactor, ${CLOUD_MOTTLE.hemisphere.toFixed(2)} );`);
  }
  chunk.normal_fragment_begin = `
	if ( uDDCloud.x > 0.0 ) {
		ddCloudWorld = transpose( mat3( viewMatrix ) ) * ( - vViewPosition - viewMatrix[ 3 ].xyz );
		ddCloudFactor = ddCloudMottle( ddCloudWorld );
	}
` + chunk.normal_fragment_begin;
  const share = (uniforms) => { if (uniforms) uniforms.uDDCloud = CLOUD_STATE.uDDCloud; return uniforms; };
  for (const shader of Object.values(three.ShaderLib ?? {})) if (shader?.uniforms) share(shader.uniforms);
  const utils = three.UniformsUtils;
  if (utils?.clone && !utils.clone.__ddCloud) {
    const orig = utils.clone.bind(utils);
    const patched = function cloneCloudUniforms(src) {
      const dst = orig(src);
      if (dst && typeof dst === 'object') share(dst);
      return dst;
    };
    patched.__ddCloud = true;
    // Keep the globe bend's marker so its own install check still sees a patched clone.
    if (utils.clone.__ddWorldCurve) patched.__ddWorldCurve = true;
    utils.clone = patched;
  }
}

/** @param {number} strength 0 in clear sky, 1 in rain @param {number} seconds wall clock for the drift */
export function updateCloudMottle(strength, seconds) {
  const d = CLOUD_MOTTLE.driftMps * (Number.isFinite(seconds) ? seconds : 0);
  CLOUD_STATE.uDDCloud.value.set(strength > 0 ? 1 : 0, CLOUD_MOTTLE.heading[0] * d, CLOUD_MOTTLE.heading[1] * d, 0);
}
