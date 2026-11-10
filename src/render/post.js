// District Deck V3.10 — W1-RENDER post-processing chain (spec §7).
//
// Render (4x MSAA, half-float, linear) → GTAO + screen-space contact shadows → bloom →
// tilt-shift depth of field → TAA (high only) → AgX tonemap + baked 32³ LUT grade →
// vignette + animated grain → spatial AA: SMAA-shaped at high and medium, FXAA at low.
//
// Rules this file obeys:
//  * It reads the scene and writes pixels. It never touches simulation state.
//  * No Math.random(), no Date.now(). Every noise term is a hash of pixel coordinates and
//    an integer frame counter that only advances when a frame is actually composed.
//  * Nothing is fetched. The LUT is arithmetic, evaluated into a Data3DTexture at load.
//  * Every render target, geometry, material and texture allocated here is released in
//    dispose(); `textureBytes()` reports what it is holding so perf-budget.mjs can assert.
//  * Time-driven terms take their clock from the `elapsed` argument, which advances through
//    window.__districtDeck.step(n) as well as through requestAnimationFrame.

import * as THREE from 'three';
import { P1_GROUNDING, P1_LIGHT, P4_GRUNGE, P23_LIGHT_PHOTO, R9_ATMOS } from './v4-p1-polish.js';
import { LAND_EDGE, LAND_EDGE_UNIFORMS_GLSL, landFieldUniforms } from './land-edge.js';
import { COAST_SPINE_GLSL } from './coast-spine.js';
import { sceneSamples } from './frame-policy.js';

// `aa` is the temporal stage the tier runs; `spatial` is the edge filter that runs on the
// graded buffer on the way to screen. Round 1 shipped `high` with aa:'taa' and nothing
// spatial, so the final blit was a pass-through and a single captured frame — which only
// ever gets taaConvergeFrames = 2 of the 8 Halton phases — kept a raw staircase on every
// diagonal kerb. `high` now carries MSAA on the scene target, TAA, and SMAA on the way out.
export const QUALITY_TIERS = Object.freeze({
  high: Object.freeze({
    ao: true, aoDirections: 4, aoSteps: 4, aoScale: 0.5,
    contactShadows: true, contactSteps: 12,
    bloom: true, bloomLevels: 4,
    dof: true, dofTaps: 20,
    grain: true, aa: 'taa', spatial: 'smaa', msaa: 4, halfFloat: true,
  }),
  medium: Object.freeze({
    ao: true, aoDirections: 4, aoSteps: 3, aoScale: 0.5,
    contactShadows: true, contactSteps: 8,
    bloom: true, bloomLevels: 3,
    dof: true, dofTaps: 10,
    grain: true, aa: 'smaa', spatial: 'smaa', msaa: 2, halfFloat: true,
  }),
  low: Object.freeze({
    ao: false, aoDirections: 0, aoSteps: 0, aoScale: 0.5,
    contactShadows: false, contactSteps: 0,
    bloom: false, bloomLevels: 0,
    dof: false, dofTaps: 0,
    grain: false, aa: 'fxaa', spatial: 'fxaa', msaa: 0, halfFloat: false,
  }),
});

const LUT_SIZE = 32;

// Scene-linear -> AgX input scale.
//
// Round 1 shipped 0.55. Round 2 raised it to 0.66 on the reasoning that cutting the rig's
// non-shadowing stack had dropped a lit surface to ~70% of its round-1 value. That reasoning
// was wrong and the measurement says so: lighting.js also raised the key from 3.06 to 4.72,
// which more than replaced what the ambient cut removed, so 0.66 shipped a frame whose board
// region measured mean luminance 0.401 and median 0.440 against the reference plate's 0.257
// and 0.217 — roads rendered near white and every roof went pastel.
//
// 0.38 is where the measured frame lands on the plate: mean 0.309, median 0.322, saturation
// 0.266 against 0.299, and the shadowed/lit ratio falls to 0.383, inside the 0.35-0.45 band
// the round-1 critic asked for. Measured at 1600x1000, seed DD-SHOT-0001, ANGLE Metal.
//
// V3.30 GRADE seat, and this is the correction the two failed rounds above needed. **Every
// target number in the paragraph above is a PHOTOGRAPH's luminance statistics** — the
// `_reference/` pack of photographed physical miniatures that spec §4 has since retired as a
// bar. It does not follow that 0.38 is wrong, and the measurement says it is right: at the
// lab's ToD the working band (scene linear 0.3-1.2, which is where every lit wall in the
// residential set lands) sits at AgX normalised-log u = 0.57-0.69, and AgX's own peak slope
// is at u = 0.625. **BASE_EXPOSURE is already parked on the steepest part of the curve.**
// Raising it moves onto the shoulder and *narrows* the frame: a fixed 3-stop scene interval
// maps to 74 display code values at 0.38, 69 at 0.55 and 64 at 0.75. That is round 2's
// "pastel roofs" stated as a number, and it is why the fix for a flat frame is never here.
// 0.38 stands, for the board and for the lab.
//
// What the residential bar needed instead is a steeper display transfer with a higher white
// point, and that is a grade, not an exposure — see _applyResidentialGrade().
export const BASE_EXPOSURE = 0.38;
// P20 L4B: recover X3's display brightness with the corrected PMREM retained.
// The environment balance lives in lighting.js; keep this compensation through ToD changes.
export const ENVIRONMENT_EXPOSURE_COMPENSATION = 2.60;

/**
 * W4-C light finish: the grade chain's output transfer, measured rather than reasoned about.
 *
 * Probe (clear sky, sunlit horizontal grey patches, real post chain, light terms zeroed one at a
 * time): the lights are physically proportionate (sun 71 %, fill 12 %, env 9 %, hemisphere 5 %,
 * rim 4 % of an albedo-0.2 patch) and the scene radiance of an albedo-0 / 0.05 / 0.2 / 0.5 patch
 * is 0.012 / 0.043 / 0.125 / 0.30. The lift is the grade pass. `agx()` returns AgX's display-
 * encoded sigmoid, and this shader then ran it through `srgbEncode` as if it were linear (three's
 * own AgX ends in `pow(c, 2.2)`; this one never did), and the P23 tone curve stretches 95-196 by
 * a further 1.45. Result: albedo 0 / 0.05 / 0.2 / 0.5 rendered V 37 / 68 / 93 / 98, so every
 * sunlit horizontal above radiance 0.18 clipped to near-white whatever its paint.
 *
 * The physically correct transfer (`encodeGamma` 2.2) renders those patches V 10 / 28 / 58 / 90
 * but halves the city (stations 01 and 02 mean V 54 / 50 to 21 / 19), because every material and
 * light in the world was authored against the lifted transfer. That re-lighting belongs to the
 * materials and the key, not to this file, so the transfer is landed as a mean-preserving
 * partial: a soft shoulder unclips the highlights so paints separate (shipped), and an optional
 * display-domain toe plus exposure trim deepen the darks. The toe is OFF (strength 0): with
 * trim 1.6 and toe 1.5 the black patch reads V 29 and stations 02 / 22 hold mean V at 0.95 of
 * before, but the near-black-green band (V under 22, S over 15) grows by 38 % because the dark
 * content is the same population as the dark patch. A black patch at V 12 and a city that keeps
 * its mean V and its dark-green share cannot both hold until the content is re-lit.
 * `encodeGamma` is the one-line path to the correct transfer once the content is re-lit.
 */
export const GRADE_TRANSFER = Object.freeze({
  /** Multiplies scene radiance into AgX (the board only; the fidelity lab keeps its own). */
  exposureTrim: 1.0,
  /** Power applied to the graded value before the sRGB encode. 1 = shipped, 2.2 = correct. */
  encodeGamma: 1,
  /** Display-domain toe: below `knee` the value is `knee * (v / knee) ^ (1 + strength)`. 0 = off. */
  toe: Object.freeze({ knee: 0.62, strength: 0 }),
  /** Display-domain shoulder: above `start` the value rolls off exponentially over `range`. */
  // taste gate: at 0.50 / 0.35 the shoulder topped out near 0.85, so whites read light grey (clear-sky p98 fell
  // from V 96 to V 81) and the picture went dull. 0.62 / 0.34 still rolls a clipped roof off into colour and lets
  // white walls, foam and canvas reach V 93 to 95.
  shoulder: Object.freeze({ start: 0.62, range: 0.34 }),
});

/**
 * W5 tone transfer: the second grade, selected by `?grade=2` (anything else keeps the shipped grade).
 *
 * The shipped grade encodes AgX's already display-encoded output a second time (`GRADE_TRANSFER`
 * above), which lifts black to V 37 and clips every sunlit surface over radiance 0.18. Grade 2 is
 * the same chain with one display encode and a re-exposure, so the picture keeps its overall
 * brightness and gains true blacks and rolled-off highlights. It is built by patching the shipped
 * grade shader source at three anchors (see `gradeShaderForVariant`), so the shipped source is
 * passed through untouched when the switch is off. All four numbers are runtime uniforms
 * (`uG2A`, `uG2B` on the grade pass) so a capture harness can tune them without a reload.
 *
 *  - exposure: multiplies scene radiance (on top of `uExposure`) before AgX.
 *  - black: soft black point on the brightest channel before AgX, `m - black * (1 - exp(-m / black))`,
 *    quadratic below `black` and a plain subtraction above it; hue-preserving because the whole
 *    colour is scaled by the ratio.
 *  - contrast: display-domain S-curve on the brightest channel about `pivot` (darks fall as
 *    `pivot * (m / pivot) ^ gamma`, lights rise symmetrically); gamma 1 is off.
 *  - shoulder: display-domain exponential roll-off on the brightest channel above `start`.
 *  - saturation: trim after the shoulder (1 = none). 1.07 offsets the neutral desaturation below, so
 *    mean S at stations 01 / 02 / 22 stays within 10 % of the shipped grade.
 *  - neutralDesat: share of chroma removed from near-neutrals (saturation under about 0.28), so
 *    pale paving and walls stay at S 12 or less under the warm key; saturated colours are untouched.
 *  - cap: ceiling on the brightest channel, so nothing reaches pure white.
 */
export const GRADE_2 = Object.freeze({
  exposure: 4.6,
  black: 0.012,
  contrast: Object.freeze({ gamma: 1.3, pivot: 0.45 }),
  shoulder: Object.freeze({ start: 0.72, range: 0.20 }),
  saturation: 1.07,
  neutralDesat: 0.30,
  cap: 0.975,
});

/**
 * W8-A grade 3, selected by `?grade=3` (the shipped grade stays the default and its shader source is untouched).
 *
 * Grade 2 (above) matched the frame mean with exposure and a toe, which crushed blacks and capped whites
 * together; the gate (GATE-R2 part b) returned it. Grade 3 changes the two things that are actually wrong:
 *  - the TRANSFER: one display encode (`pow(colour, 2.2)` undoes AgX's own display encoding, then `srgbEncode`
 *    once), no toe, no contrast curve, no P23 tone table, and a raised shoulder on the max channel so a scene
 *    radiance of 1.0 lands at V 94 and nothing clips below it. Radiance 0 / 0.05 / 0.2 / 0.5 / 0.8 albedo
 *    patches then read V 9 / 30 / 54 / 77 / 90 instead of 37 / 66 / 81 / 88 / 90.
 *  - the CONTENT: every material was authored against the double encode, so under a single encode the city
 *    renders at about a quarter of its radiance. `albedoGain` multiplies `diffuseColor.rgb` of every built-in
 *    lit material (three's standard and physical programs) once, immediately before `lights_physical_fragment`
 *    so it lands after every map, vertex colour and custom `onBeforeCompile` write to the diffuse colour.
 *    It does not reach: custom ShaderMaterials (sea, outer ocean, sky, foam, plumes), MeshBasicMaterial
 *    (unlit far field, rings, scaffold, port harbour surface), points and sprites, and the emissive term
 *    of every material. `skyGain` rescales the sky and the horizon fog colour on the grade pass, because the
 *    sky is a ShaderMaterial authored against the double encode too.
 *
 * `shoulder`: above `start` the max channel rolls off over `range` toward `start + range` (asymptote).
 * `saturation`: trim after the shoulder. `cap`: ceiling on the max channel; `neutralCap`: the same ceiling for highlights with no hue. Every number is overridable by
 * URL for tuning without a rebuild: `?grade=3&g3gain=3.2&g3exp=0.85&g3sh=0.86,0.12&g3sat=1&g3sky=2&g3cap=0.975&g3ncap=0.91&g3hemi=3.5`.
 */
export const GRADE_3 = Object.freeze({
  exposure: 0.88,
  albedoGain: 4.4,
  /** Multiplier on the hemisphere (sky floor) light, wired in scene.js. Lifts shaded faces so lit over shaded wall V reads 1.5-1.8. */
  hemisphere: 3.5,
  skyGain: 1.0,
  shoulder: Object.freeze({ start: 0.85, range: 0.15 }),
  saturation: 0.97,
  cap: 0.975,
  neutralCap: 0.91,
});

export function parseGradeVariant(search) {
  const raw = new URLSearchParams(search || '').get('grade');
  return raw === '2' ? 2 : raw === '3' ? 3 : 1;
}

/** `?g3gain=` and friends; anything missing or non-numeric keeps the GRADE_3 default. */
export function parseGrade3Overrides(search) {
  const q = new URLSearchParams(search || '');
  const num = (key, fallback) => {
    const raw = q.get(key);
    const n = raw == null || raw === '' ? NaN : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const sh = (q.get('g3sh') || '').split(',').map(Number);
  return {
    exposure: num('g3exp', GRADE_3.exposure),
    albedoGain: num('g3gain', GRADE_3.albedoGain),
    skyGain: num('g3sky', GRADE_3.skyGain),
    saturation: num('g3sat', GRADE_3.saturation),
    cap: num('g3cap', GRADE_3.cap),
    hemisphere: num('g3hemi', GRADE_3.hemisphere),
    neutralCap: num('g3ncap', GRADE_3.neutralCap),
    shoulder: sh.length === 2 && sh.every(n => Number.isFinite(n) && n > 0)
      ? { start: sh[0], range: sh[1] } : GRADE_3.shoulder,
  };
}

/**
 * Patches three's physical program (both `standard` and `physical` shader IDs) so the albedo the lighting reads is scaled
 * once, immediately AFTER `lights_physical_fragment`. Several surface kits (beaux, deco, moderne, car paint, wet road) splice
 * their own colour code in front of that include and overwrite `diffuseColor.rgb`, so a gain placed before it is lost for them;
 * after it, the gain multiplies `material.diffuseContribution` (what direct and indirect diffuse read) and `material.diffuseColor`,
 * and lifts a metal's reflected colour. Idempotent; must run before the first program compiles.
 */
export function installGrade3AlbedoGain(gain) {
  const anchor = '#include <lights_physical_fragment>';
  const marker = '// grade3 albedo gain';
  const g = gain.toFixed(4);
  for (const id of ['standard', 'physical']) {
    const lib = THREE.ShaderLib[id];
    if (!lib || lib.fragmentShader.includes(marker)) continue;
    if (!lib.fragmentShader.includes(anchor)) throw new Error(`grade=3: ShaderLib.${id} anchor missing`);
    // A material authored at a palette token (or converted to token authoring) sets `defines.DD_NO_GAIN = ''` and keeps its colour.
    lib.fragmentShader = lib.fragmentShader.replace(anchor, `${anchor}
\t${marker}
\t#ifndef DD_NO_GAIN
\tmaterial.diffuseColor *= ${g};
\tmaterial.diffuseContribution *= ${g};
\tmaterial.specularColorBlended = mix( material.specularColorBlended, material.specularColorBlended * ${g}, metalnessFactor );
\t#endif`);
  }
}

/** Scale scene.js applies to the hemisphere light: 1 for the shipped grade, `GRADE_3.hemisphere` (or `?g3hemi=`) under `?grade=3`. */
export function grade3HemisphereScale() {
  if (typeof location === 'undefined' || readGradeVariant() !== 3) return 1;
  return parseGrade3Overrides(location.search).hemisphere;
}

if (readGradeVariant() === 3 && typeof document !== 'undefined' && !document.getElementById('lab')) {
  installGrade3AlbedoGain(parseGrade3Overrides(location.search).albedoGain);
}

export function readGradeVariant() {
  if (typeof location === 'undefined') return 1;
  return parseGradeVariant(location.search);
}

/**
 * Derives the grade-2 fragment source from the shipped one. Anchors are matched on text that the
 * shipped template emits verbatim; a missing anchor throws rather than silently shipping grade 1.
 */
export function gradeShaderForVariant(source, variant) {
  if (variant === 3) return gradeShader3(source);
  if (variant !== 2) return source;
  const swap = (from, to) => {
    if (!source.includes(from)) throw new Error(`grade=2: shader anchor missing: ${from.slice(0, 48)}`);
    source = source.replace(from, to);
  };
  swap('uniform float uAtmosphereOffset;', `uniform float uAtmosphereOffset;
      uniform vec4 uG2A; // exposure, black point, contrast gamma, contrast pivot
      uniform vec4 uG2B; // shoulder start, shoulder range, saturation, cap
      vec3 g2Linear(vec3 c) {
        c *= uG2A.x;
        float m = max(max(c.r, c.g), c.b);
        float k = uG2A.y;
        float m2 = m - k * (1.0 - exp(-m / k));
        return c * (m2 / max(m, 0.00001));
      }`);
  const a0 = source.indexOf('colour = agx(colour * uExposure');
  const a1 = source.indexOf(';', a0);
  if (a0 < 0 || a1 < 0) throw new Error('grade=2: shader anchor missing: agx call');
  source = `${source.slice(0, a0)}colour = agx(uAtmosphere > 0.0 ? g2Linear(colour * uExposure) : colour * uExposure)${source.slice(a1)}`;
  const d0 = source.indexOf('vec3 display = srgbEncode(');
  const endMark = 'gl_FragColor = vec4(display, 1.0);';
  const d1 = source.indexOf(endMark, d0);
  if (d0 < 0 || d1 < 0) throw new Error('grade=2: shader anchor missing: display block');
  const display = `vec3 display = srgbEncode(clamp(pow(max(colour, vec3(0.0)), vec3(2.2)), 0.0, 1.0));
        if (uAtmosphere > 0.0 && horizonDepth < 1.0) {
          float gMax = max(max(display.r, display.g), display.b);
          float cMax = gMax < uG2A.w
            ? uG2A.w * pow(gMax / uG2A.w, uG2A.z)
            : 1.0 - (1.0 - uG2A.w) * pow((1.0 - gMax) / (1.0 - uG2A.w), uG2A.z);
          display *= cMax / max(gMax, 0.00001);
          gMax = cMax;
          float shoulderEx = max(gMax - uG2B.x, 0.0);
          float rolled = min(gMax, uG2B.x) + uG2B.y * (1.0 - exp(-shoulderEx / uG2B.y));
          display *= rolled / max(gMax, 0.00001);
          display = max(mix(vec3(luma(display)), display, uG2B.z), vec3(0.0));
          // Neutrals (saturation under about 0.28) lose ${GRADE_2.neutralDesat} of their chroma: the single encode warms pale paving past S 12.
          float chroma = (max(max(display.r, display.g), display.b) - min(min(display.r, display.g), display.b)) / max(max(max(display.r, display.g), display.b), 0.00001);
          display = mix(display, vec3(luma(display)), ${GRADE_2.neutralDesat.toFixed(2)} * (1.0 - smoothstep(0.10, 0.28, chroma)));
          // The shipped grade's ceiling on green saturation, kept so hedges and grass cannot turn neon.
          if (display.g > display.r && display.g > display.b) {
            float greenSat = (display.g - min(display.r, display.b)) / max(display.g, 0.00001);
            float greenMin = display.g * (1.0 - ${P23_LIGHT_PHOTO.toneGreenSaturationMax.toFixed(2)});
            if (greenSat > ${P23_LIGHT_PHOTO.toneGreenSaturationMax.toFixed(2)}) display = max(display, vec3(greenMin));
          }
          display *= min(1.0, uG2B.w / max(max(display.r, display.g), max(display.b, 0.00001)));
        }
        `;
  return `${source.slice(0, d0)}${display}${source.slice(d1)}`;
}

/**
 * Grade 3 fragment source, derived from the shipped one at four anchors (a missing anchor throws rather than
 * silently shipping grade 1): the uniforms, the sky and horizon-fog scale before AgX, and the display block.
 * Everything between (AgX, the 32^3 LUT, aerial perspective, vignette, grain, rain) is the shipped chain.
 */
function gradeShader3(source) {
  const swap = (from, to) => {
    if (!source.includes(from)) throw new Error(`grade=3: shader anchor missing: ${from.slice(0, 48)}`);
    source = source.replace(from, to);
  };
  swap('uniform float uAtmosphereOffset;', `uniform float uAtmosphereOffset;
      uniform vec4 uG3A; // shoulder start, shoulder range, saturation, cap
      uniform float uG3Sky; // scale on sky radiance and horizon fog colour (ShaderMaterial sky is outside the albedo gain)
      uniform float uG3Exp; // exposure scale on everything before AgX, set by the token patch test
      uniform vec2 uG3N; // ceiling on neutral highlights (saturation under about 5 %), saturation above which the full cap applies`);
  swap('if (horizonAmount > 0.0) colour = mix(colour, uHorizonColor, horizonAmount);',
    'if (horizonAmount > 0.0) colour = mix(colour, uHorizonColor * uG3Sky, horizonAmount);');
  // The shipped chain rolls AgX's output off a second time in colour (R9_ATMOS.shoulderStart 0.80, range 0.20), which caps a
  // radiance of 1.0 at V 90. Grade 3 has one shoulder, in the display domain below, so this one goes.
  swap(`colour -= uAtmosphere * excess * excess / (excess + ${R9_ATMOS.shoulderRange.toFixed(2)});`,
    '// grade 3: the R9 colour-domain shoulder is replaced by the display-domain shoulder');
  const a0 = source.indexOf('colour = agx(colour * uExposure');
  const a1 = source.indexOf(';', a0);
  if (a0 < 0 || a1 < 0) throw new Error('grade=3: shader anchor missing: agx call');
  source = `${source.slice(0, a0)}colour = agx((horizonDepth >= 1.0 ? colour * uG3Sky : colour) * uExposure * uG3Exp)${source.slice(a1)}`;
  const d0 = source.indexOf('vec3 display = srgbEncode(');
  const endMark = 'gl_FragColor = vec4(display, 1.0);';
  const d1 = source.indexOf(endMark, d0);
  if (d0 < 0 || d1 < 0) throw new Error('grade=3: shader anchor missing: display block');
  const greenMax = P23_LIGHT_PHOTO.toneGreenSaturationMax.toFixed(2);
  const display = `// grade 3: AgX returns a display-encoded value, so undo that once and encode once. No toe, no tone table.
        vec3 display = srgbEncode(clamp(pow(max(colour, vec3(0.0)), vec3(2.2)), 0.0, 1.0));
        if (uAtmosphere > 0.0) {
          float gMax = max(max(display.r, display.g), display.b);
          float shoulderEx = max(gMax - uG3A.x, 0.0);
          float rolled = min(gMax, uG3A.x) + uG3A.y * (1.0 - exp(-shoulderEx / uG3A.y));
          display *= rolled / max(gMax, 0.00001);
          display = max(mix(vec3(luma(display)), display, uG3A.z), vec3(0.0));
          // The shipped grade's ceiling on green saturation, kept so hedges and grass cannot turn neon.
          if (display.g > display.r && display.g > display.b) {
            float greenSat = (display.g - min(display.r, display.b)) / max(display.g, 0.00001);
            float greenMin = display.g * (1.0 - ${greenMax});
            if (greenSat > ${greenMax}) display = max(display, vec3(greenMin));
          }
          // Highlights that carry no hue are capped under the bible's pure-white band (S under 5, V over 93); tinted ones reach the cap.
          float hiMax = max(max(display.r, display.g), display.b);
          float hiSat = (hiMax - min(min(display.r, display.g), display.b)) / max(hiMax, 0.00001);
          float hiCap = mix(uG3N.x, uG3A.w, smoothstep(0.07, uG3N.y, hiSat));
          display *= min(1.0, hiCap / max(hiMax, 0.00001));
        }
        `;
  return `${source.slice(0, d0)}${display}${source.slice(d1)}`;
}

/**
 * P19 X3: user-calibrated midtone lift. Default is P1_LIGHT.playMidtoneLift (+12 %).
 * `?exposure=1.15` multiplies BASE_EXPOSURE × grade.exposure (1.0 = pre-X3).
 * Values outside (0, 4] are ignored.
 */
export function parsePlayExposureMul(search) {
  const raw = new URLSearchParams(search || '').get('exposure');
  if (raw == null || raw === '') return P1_LIGHT.playMidtoneLift;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 4) return P1_LIGHT.playMidtoneLift;
  return n;
}

export function readPlayExposureMul() {
  if (typeof location === 'undefined') return parsePlayExposureMul('');
  return parsePlayExposureMul(location.search);
}

/**
 * Tilt-shift at board pitch (miniature → 1). Street (miniature 0) stays
 * sharp; the overview must keep the information-bearing city inspectable.
 * R4 used rangeSlope 0.33 / cocSlope 13.5 / no band widen — a narrow ribbon.
 */
export const DOF_OVERVIEW = Object.freeze({
  rangeBase: 0.55,
  rangeSlope: 0.16,
  cocBase: 0.5,
  cocSlope: 8.0,
  bandWiden: 0.14,
  bandSoftWiden: 0.08,
  bandGain: 0.72,
});

/** Frame elevation scales the existing public strength; absent/invalid scale is neutral. */
export function effectiveDofRadius(strength, frameScale = 1) {
  const scale = Number.isFinite(frameScale) ? Math.min(1, Math.max(0, frameScale)) : 1;
  return Math.min(6, Math.max(0, 6 * strength / 0.45)) * scale;
}

/** P19 X4 CPU twin: radius in final output pixels, including the edge-only frame. */
export function dofCircleOfConfusion(depth, y, { focusDistance, focalRange, maxRadius = 6 }) {
  const t = THREE.MathUtils.clamp((Math.abs(y - 0.5) - 0.35) / 0.15, 0, 1);
  const edge = t * t * (3 - 2 * t);
  const defocus = THREE.MathUtils.clamp(Math.abs(depth - focusDistance) / Math.max(focalRange, 1e-3), 0, 1);
  return edge * Math.max(0.15, defocus * defocus) * THREE.MathUtils.clamp(maxRadius, 0, 6);
}

/** Halton(2,3), eight phases. Deterministic, no clock, no RNG. */
const TAA_JITTER = (() => {
  const halton = (index, base) => {
    let result = 0;
    let f = 1 / base;
    let i = index;
    while (i > 0) {
      result += f * (i % base);
      i = Math.floor(i / base);
      f /= base;
    }
    return result;
  };
  const points = [];
  for (let i = 1; i <= 8; i += 1) {
    points.push([halton(i, 2) - 0.5, halton(i, 3) - 0.5]);
  }
  return points;
})();

const COMMON = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  // The scene render carries a handful of NaN fragments (degenerate normals in the board
  // kit — 13 pixels at 1200x750, seed DD-SHOT-0001). NaN survives a multiply by zero, so
  // one bad fragment becomes a growing black block the moment a mip chain touches it.
  // Every pass that reads the scene buffer launders it first.
  vec3 sanitise(vec3 c) {
    c = mix(c, vec3(0.0), vec3(notEqual(c, c)));
    return clamp(c, vec3(0.0), vec3(64.0));
  }
  // Interleaved gradient noise. A plain per-pixel hash gives the AO estimator an
  // uncorrelated rotation on every pixel, which a small bilateral blur cannot resolve; IGN
  // spreads its values evenly over every small neighbourhood, so the same blur denoises it.
  float ign(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  }
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
`;

const DEPTH_COMMON = /* glsl */`
  uniform sampler2D tDepth;
  uniform mat4 uProjInv;
  uniform mat4 uProj;
  uniform float uNear;
  uniform float uFar;
  float rawDepth(vec2 uv) { return texture2D(tDepth, uv).x; }
  float viewZ(float depth) {
    // Perspective depth -> view-space z (negative in front of the camera).
    return (uNear * uFar) / ((uFar - uNear) * depth - uFar);
  }
  vec3 viewPosition(vec2 uv, float depth) {
    vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 view = uProjInv * clip;
    return view.xyz / view.w;
  }
  vec3 normalFromDepth(vec2 uv, vec2 texel, vec3 centre) {
    // Best-of-four reconstruction: pick the neighbour pair that stays on the same surface.
    vec3 rightP = viewPosition(uv + vec2(texel.x, 0.0), rawDepth(uv + vec2(texel.x, 0.0)));
    vec3 leftP  = viewPosition(uv - vec2(texel.x, 0.0), rawDepth(uv - vec2(texel.x, 0.0)));
    vec3 upP    = viewPosition(uv + vec2(0.0, texel.y), rawDepth(uv + vec2(0.0, texel.y)));
    vec3 downP  = viewPosition(uv - vec2(0.0, texel.y), rawDepth(uv - vec2(0.0, texel.y)));
    vec3 dx = abs(rightP.z - centre.z) < abs(leftP.z - centre.z) ? rightP - centre : centre - leftP;
    vec3 dy = abs(upP.z - centre.z) < abs(downP.z - centre.z) ? upP - centre : centre - downP;
    return normalize(cross(dx, dy));
  }
`;

/**
 * taste-r1 (W31): GROUND_CREASE. At close range the AO term (not the contact march: switched off it leaves them) drew thin dark
 * lines along the facet joins of the hinterland ground and cracks where farm-track ribbon segments meet. The ground-facing bias
 * in the AO pass (`uBiasGround`, 0.085) equals `uBias`, so it never lifted anything, and its cone (15 degrees) was narrower than
 * the hinterland's slopes in any case. 1 takes the AO bias to `bias` for ground-facing pixels (reconstructed normal within the
 * cone `coneLo`..`coneHi` of dot(N, up)) that lie more than `edgeM` m clear of the city board and outside the two venue
 * precincts (mirrors `venueGroundRegions` in fringe/venue-ground.js, `padFadeM` fall). World position is rebuilt from depth with
 * the camera's matrixWorld. A wall (dot about 0.7 or more), a kerb, a wall foot, a tree foot, a hedge foot and a shed still clear
 * the bias; the city board and the precincts keep the present shader values. 0 restores the present shader text byte for byte.
 * Browser: `?groundCrease=0`; node: `DD_GROUND_CREASE=0`.
 */
export const GROUND_CREASE = Object.freeze({
  on: (typeof process !== 'undefined' && process?.env?.DD_GROUND_CREASE !== undefined)
    ? (Number(process.env.DD_GROUND_CREASE) > 0 ? 1 : 0)
    : ((typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('groundCrease') === '0') ? 0 : 1),
  bias: 0.45, coneLo: 0.60, coneHi: 0.80, edgeM: [4, 16], padFadeM: 12,
  /** The city board's extent until the scene says otherwise (`PostChain.boardExtent`); createCity defaults to 4 x 4 blocks. */
  boardExtent: Object.freeze({ x: 272, z: 272 }),
});
const GC_F = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));
/**
 * taste W48 (SHARPEN_FLOOR): the temporal pass's sharpen runs on linear values, where the open sea is about 0.0105. A 1 px glint of 0.47
 * (the sea sparkle, and the SPARKLE_PATH crowd of them) gives each of its four neighbours an unsharp delta of 0.2 x (0.0105 - 0.1256) =
 * -0.023, more than the pixel holds; a still frame settles at the full 0.20 weight (the history carries the delta), so the neighbour
 * clamps to black: a dark speck beside every glint (8,900 dark outliers at station 46-sun-path with the path on, against 790 off;
 * `uSharpen` 0 takes them to 0). 1 floors the sharpen's dip at `floor` of the pixel's own linear value, `max(delta, -current * floor)`:
 * a pixel can lose at most that share of itself to the sharpen. The sharpen's lift (the bright side) does not change; the floor acts
 * only where the dip would exceed that share, which is an edge where one side is about three times or more brighter than the other.
 * 0 restores the present shader text byte for byte. Browser: `?sharpenFloor=0`; node: `DD_SHARPEN_FLOOR=0`.
 */
export const SHARPEN_FLOOR = Object.freeze({
  on: (typeof process !== 'undefined' && process?.env?.DD_SHARPEN_FLOOR !== undefined)
    ? (Number(process.env.DD_SHARPEN_FLOOR) > 0 ? 1 : 0)
    : ((typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('sharpenFloor') === '0') ? 0 : 1),
  floor: 0.15,
});
const SHARPEN_APPLY = SHARPEN_FLOOR.on
  ? `            vec3 sharpDelta = max((current - blur * 0.25) * uSharpen, -max(current, vec3(0.0)) * ${SHARPEN_FLOOR.floor.toFixed(2)});
            colour = max(vec3(0.0), colour + sharpDelta * (1.0 - historyWeight));`
  : '            colour = max(vec3(0.0), colour + (current - blur * 0.25) * uSharpen * (1.0 - historyWeight));';
/**
 * taste W33 (CREASE_VENUES): the venue precincts the crease pass leaves alone come from `venueGroundRegions` (fringe/venue-ground.js), set
 * by the scene as uniforms (`PostChain.venueRegions`, up to `max` rectangles [x0, z0, x1, z1] with the same `padFadeM` inner fall), not
 * from two rectangles written into the shader text, so the list and the pass cannot drift apart. An unused slot weighs nothing. 0 restores
 * wave thirty-two's shader text (the airport and the stadium with the circuit, written by hand). `?groundCrease=0` still restores wave
 * thirty. Browser: `?creaseVenues=0`; node: `DD_CREASE_VENUES=0`.
 */
export const CREASE_VENUES = Object.freeze({
  on: GROUND_CREASE.on && ((typeof process !== 'undefined' && process?.env?.DD_CREASE_VENUES !== undefined)
    ? (Number(process.env.DD_CREASE_VENUES) > 0 ? 1 : 0)
    : ((typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('creaseVenues') === '0') ? 0 : 1)),
  max: 4,
});
// taste-r1 W79 (L2): under LAND_EDGE the crease pass leaves the precincts alone by the land edge's one weight, not the rectangles.
const LAND_CREASE = LAND_EDGE.readers.venue && GROUND_CREASE.on && CREASE_VENUES.on ? 1 : 0;
const GC_DECL = GROUND_CREASE.on ? `
        uniform mat4 uCamWorld;
        uniform vec2 uBoardExtent;
        uniform vec4 uHinter;${CREASE_VENUES.on ? `
        uniform vec4 uVenues[${CREASE_VENUES.max}];` : ''}${LAND_CREASE ? `
${COAST_SPINE_GLSL}
${LAND_EDGE_UNIFORMS_GLSL}` : ''}` : '';
const GC_BODY_BASE = GROUND_CREASE.on ? `
          {
            vec3 Pw = (uCamWorld * vec4(P, 1.0)).xyz;
            vec2 outB = max(max(-Pw.xz, Pw.xz - uBoardExtent), vec2(0.0));
            float hinterT = smoothstep(${GC_F(GROUND_CREASE.edgeM[0])}, ${GC_F(GROUND_CREASE.edgeM[1])}, max(outB.x, outB.y));
${CREASE_VENUES.on ? `            // Venue precincts: the rectangles of venueGroundRegions (uVenues, x0 z0 x1 z1), each with a soft inner fall.
            float venueW = 0.0;
            for (int vi = 0; vi < ${LAND_CREASE ? 0 : CREASE_VENUES.max}; vi++) {
              vec4 vr = uVenues[vi];
              float vp = clamp(min(min(Pw.x - vr.x, Pw.z - vr.y), min(vr.z - Pw.x, vr.w - Pw.z)) / ${GC_F(GROUND_CREASE.padFadeM)}, 0.0, 1.0);
              venueW = max(venueW, vp * vp * (3.0 - 2.0 * vp));
            }${LAND_CREASE ? '\n            venueW = ddPrecinctWeightAt(Pw.xz);' : ''}
            hinterT *= 1.0 - venueW;
` : `            // Venue precincts (west: airport; south: stadium and circuit), each a rectangle with a soft inner fall.
            vec2 padW = Pw.xz + vec2(165.0, -30.0);
            float padA = clamp(min(min(padW.x, padW.y), min(-12.0 - Pw.x, uBoardExtent.y - 8.0 - Pw.z)) / ${GC_F(GROUND_CREASE.padFadeM)}, 0.0, 1.0);
            float padB = clamp(min(min(Pw.x + 20.0, Pw.z - uBoardExtent.y - 12.0), min(uBoardExtent.x - 18.0 - Pw.x, uBoardExtent.y + 145.0 - Pw.z)) / ${GC_F(GROUND_CREASE.padFadeM)}, 0.0, 1.0);
            hinterT *= 1.0 - max(padA * padA * (3.0 - 2.0 * padA), padB * padB * (3.0 - 2.0 * padB));
`}            float hinterGround = smoothstep(uHinter.y, uHinter.z, dot(N, uUpView)) * hinterT;
            bias = max(bias, mix(uBias, uHinter.x, hinterGround));
          }` : '';

/**
 * taste W91 (CREASE_AO): the hinterland sheet's coarse cells (about 14 m by 12 m) are twisted by 2.7 to 3.7 m, so a few triangle edges are valley
 * creases of 28 to 39 degrees (the sheet's p99 is 12 degrees). The AO term reads one as a wall base: dot(N, V) is sin(crease) = 0.47 to 0.63 for a
 * sample on the other face, over GROUND_CREASE's bias 0.45 (and over 0.085 inside the venue precincts' fall, where A3 and A4 at (-25, 353) lie), so
 * four straight dark lines cross the grass (M6: 11, 3, 19 and 42 % of the flank today, 35 to 52 % with `groundCrease=0`). GROUND_CREASE judges the
 * receiver only and cannot tell a sheet fold from a tree foot. 1 judges the OCCLUDER too: a sample whose dot with the receiver's normal lies
 * above today's bias and under the knob (0.65, above sin 39 degrees) takes the knob as its bias when (a) it lies on a
 * ground-facing surface (its own reconstructed normal within `groundLo`..`groundHi` of dot(up)), (b) that surface is tilted from the receiver's by
 * `tiltLo`..`tiltHi` of dot(N, Ns) (about 8 to 20 degrees and over: a step, an apron or a track bed is parallel and keeps its AO), and (c) the
 * chord from the receiver to the sample lies above the depth buffer (a roof, a canopy or a wall standing between the two is nearer than the chord
 * and keeps its AO). The receiver weight is GROUND_CREASE's cone and distance from the board WITHOUT the venue fall (`hinterT0`): the venue term
 * keeps the precincts' own detail at 0.085, and only a pair of ground-facing faces 8 degrees or more apart is cut there. Samples outside the band,
 * walls, trunks, kerb risers and the city board take today's code path; 0 restores the present shader text byte for byte.
 * Browser: `?creaseAo=1` (and `?creaseAoBias=0.5..0.9`); node: `DD_CREASE_AO=1` (and `DD_CREASE_AO_BIAS`). Off by default.
 */
const creaseAoBiasKnob = () => {
  const raw = (typeof process !== 'undefined' && process?.env?.DD_CREASE_AO_BIAS !== undefined) ? process.env.DD_CREASE_AO_BIAS
    : ((typeof location !== 'undefined' && location?.search) ? new URLSearchParams(location.search).get('creaseAoBias') : null);
  const v = raw === null || raw === '' ? NaN : Number(raw);
  return Number.isFinite(v) ? Math.min(0.9, Math.max(0.5, v)) : 0.65;
};
export const CREASE_AO = Object.freeze({
  on: GROUND_CREASE.on && ((typeof process !== 'undefined' && process?.env?.DD_CREASE_AO !== undefined)
    ? (Number(process.env.DD_CREASE_AO) > 0 ? 1 : 0)
    : ((typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('creaseAo') === '1') ? 1 : 0)),
  /** The one knob: the bias a cut sample takes (sin of the steepest crease cut; 39 degrees is 0.63). */
  bias: creaseAoBiasKnob(),
  groundLo: 0.35, groundHi: 0.55, tiltLo: 0.94, tiltHi: 0.99, chordTolM: 0.02, chordTolRel: 0.02,
});
const swapOnce = (text, from, to) => {
  if (text.split(from).length !== 2) throw new Error(`CREASE_AO: the GROUND_CREASE text no longer holds ${JSON.stringify(from)} once`);
  return text.replace(from, () => to);
};
const GC_BODY = CREASE_AO.on && GC_BODY_BASE
  ? swapOnce(swapOnce(swapOnce(GC_BODY_BASE, '\n          {\n', '\n          float creaseW = 0.0;\n          {\n'),
    'max(outB.x, outB.y));\n', 'max(outB.x, outB.y));\n            float hinterT0 = hinterT;\n'),
  '            bias = max(bias, mix(uBias, uHinter.x, hinterGround));',
  `            bias = max(bias, mix(uBias, uHinter.x, hinterGround));
            creaseW = smoothstep(uHinter.y, uHinter.z, dot(N, uUpView)) * hinterT0;`)
  : GC_BODY_BASE;
const CREASE_NDV_BASE = 'float ndv = (dot(N, V / len) - bias) / (1.0 - bias);';
const CREASE_NDV = !(CREASE_AO.on && GC_BODY_BASE) ? CREASE_NDV_BASE : `float dnv = dot(N, V / len);
                float sb = bias;
                if (creaseW > 0.0 && dnv > bias && dnv < ${GC_F(CREASE_AO.bias)}) {
                  // W91 CREASE_AO: a ground-facing face tilted from the receiver's, reached over a chord that stays above the surface.
                  vec3 Ns = normalFromDepth(sampleUv, uTexel, S);
                  vec3 cmid = 0.5 * (P + S);
                  vec4 cclip = uProj * vec4(cmid, 1.0);
                  float zCut = viewZ(rawDepth(cclip.xy / cclip.w * 0.5 + 0.5));
                  float chordAbove = zCut <= cmid.z + ${GC_F(CREASE_AO.chordTolM)} + ${GC_F(CREASE_AO.chordTolRel)} * len ? 1.0 : 0.0;
                  float cutW = smoothstep(${GC_F(CREASE_AO.groundLo)}, ${GC_F(CREASE_AO.groundHi)}, dot(Ns, uUpView))
                    * (1.0 - smoothstep(${GC_F(CREASE_AO.tiltLo)}, ${GC_F(CREASE_AO.tiltHi)}, dot(N, Ns))) * chordAbove;
                  sb = mix(bias, ${GC_F(CREASE_AO.bias)}, creaseW * cutW);
                }
                float ndv = (dnv - sb) / (1.0 - sb);`;
/** The shader pieces GROUND_CREASE and CREASE_AO write, for the tests (no GL context is needed to read them). */
export const GROUND_CREASE_TEXT = Object.freeze({ decl: GC_DECL, body: GC_BODY, ndv: CREASE_NDV });
/** JS mirror of the cut: the bias a sample takes. `nsUp` is dot(Ns, up), `nNs` is dot(N, Ns), `chordAbove` whether the chord stays above the depth buffer. */
export function creaseAoSampleBias({ creaseW, dnv, bias, nsUp, nNs, chordAbove }, k = CREASE_AO) {
  if (!(creaseW > 0 && dnv > bias && dnv < k.bias)) return bias;
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const w = ss(k.groundLo, k.groundHi, nsUp) * (1 - ss(k.tiltLo, k.tiltHi, nNs)) * (chordAbove ? 1 : 0);
  return bias + (k.bias - bias) * creaseW * w;
}

/**
 * ── P16-W6 PROTOTYPE B constants. ──
 * A linear view-space march at a half-resolution stride, refined once by
 * bisection. 28 steps is the middle of the brief's 24-32; the stride is
 * geometric so the near field is dense and a ray still reaches the far quay.
 */
export const SSR = Object.freeze({
  steps: 28,
  /** First step, view-space metres, and the growth per step. */
  step0: 0.65,
  growth: 1.14,
  /** Depth agreement that counts as a hit, view-space metres. */
  thickness: 1.10,
  /** Screen-edge fade, in UV. */
  edgeFade: 0.14,
  /** Ceiling on the SSR mix. Same painted-register argument as REFLECT.reflMax. */
  strength: 0.42,
  /** Metres of world Y either side of the still-water plane that count as water. */
  band: 1.35,
  /** Ripple, duplicated here because the mask has no access to the ocean normal. */
  rippleM: 2.4,
  rippleAmp: 0.055,
});

const VERTEX = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** A shared full-screen triangle. One geometry for the whole chain. */
class FullScreenPass {
  constructor(geometry, camera, fragmentShader, uniforms, defines = {}) {
    // ShaderMaterial rather than RawShaderMaterial: three's prelude supplies the GLSL3
    // conversion defines and the precision statements, and leaves the whole fragment
    // stage to us.
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader,
      uniforms,
      defines,
      depthTest: false,
      depthWrite: false,
      // Grade already writes display-encoded bytes. Three's default toneMapped
      // true would inject colorspace_fragment on a canvas blit in some WebKit
      // builds and double-encode (or skip the tag and look a gamma too dark).
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
    this.camera = camera;
  }

  render(renderer, target) {
    renderer.setRenderTarget(target ?? null);
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.material.dispose();
    this.scene.remove(this.mesh);
  }
}

function makeTarget(width, height, options = {}) {
  const target = new THREE.WebGLRenderTarget(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)), {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: options.type ?? THREE.HalfFloatType,
    depthBuffer: options.depthBuffer ?? false,
    stencilBuffer: false,
    generateMipmaps: false,
    colorSpace: THREE.NoColorSpace,
    samples: options.samples ?? 0,
  });
  target.texture.name = options.name ?? 'dd-post';
  return target;
}

// R129: low keeps its inexpensive post chain, but its one scene-linear colour
// buffer needs enough precision for the dark asphalt before grading. WebGL2's
// EXT_color_buffer_float makes RGBA16F colour attachments renderable. Missing
// capability APIs (including headless/test renderers) retain the accepted byte
// target; no other tier target follows this choice.
function lowSceneHalfFloatSupported(renderer) {
  if (renderer?.capabilities?.isWebGL2 !== true) return false;
  const gl = renderer.getContext?.();
  return typeof gl?.getExtension === 'function' && !!gl.getExtension('EXT_color_buffer_float');
}

/** Bytes a target holds, for the §2 texture-memory budget. */
function targetBytes(target) {
  if (!target) return 0;
  const channels = target.texture.format === THREE.RedFormat ? 1 : 4;
  const channelBytes = target.texture.type === THREE.HalfFloatType ? 2
    : target.texture.type === THREE.FloatType ? 4 : 1;
  const perPixel = channels * channelBytes;
  const depth = target.depthTexture ? 4 : 0;
  // A multisampled target carries the resolve texture plus an N-sample renderbuffer pair.
  const samples = Math.max(1, target.samples ?? 0);
  return target.width * target.height * (perPixel + depth) * (samples > 1 ? 1 + samples : 1);
}

/** Lift channel split. Rec.709 mean is the neutral floor of the same luminance. */
const GRADE_LIFT_SPLIT = Object.freeze([0.88, 0.94, 1.12]);

/**
 * `?gradeSplit=liftSplit,shadowTint`. Each value is in [0, 1.5].
 * Absent, blank, or any malformed / out-of-range part returns null (the bake stays as authored).
 * `liftSplit` 1 keeps the lift split, 0 collapses it to its Rec.709 mean.
 * `shadowTint` 1 keeps the shadow tint, 0 collapses it to [1, 1, 1].
 */
export function parseGradeSplit(search) {
  const raw = new URLSearchParams(search || '').get('gradeSplit');
  if (raw == null || raw.trim() === '') return null;
  const parts = raw.split(',');
  if (parts.length !== 2) return null;
  const liftText = parts[0].trim();
  const shadowText = parts[1].trim();
  if (liftText === '' || shadowText === '') return null;
  const liftSplit = Number(liftText);
  const shadowSplit = Number(shadowText);
  if (!Number.isFinite(liftSplit) || !Number.isFinite(shadowSplit)) return null;
  if (liftSplit < 0 || liftSplit > 1.5 || shadowSplit < 0 || shadowSplit > 1.5) return null;
  return { liftSplit, shadowTint: shadowSplit };
}

function readGradeSplit() {
  if (typeof location === 'undefined' || location == null || typeof location.search !== 'string') return null;
  return parseGradeSplit(location.search);
}

function gradeLiftMean(coeffs) {
  return 0.2126 * coeffs[0] + 0.7152 * coeffs[1] + 0.0722 * coeffs[2];
}

/** Scale each coefficient's distance from the Rec.709 mean. 1 is a no-op, exactly. */
function applyLiftSplit(coeffs, scale) {
  if (scale == null || scale === 1) return coeffs;
  const mean = gradeLiftMean(coeffs);
  if (scale === 0) return [mean, mean, mean];
  return [
    mean + scale * (coeffs[0] - mean),
    mean + scale * (coeffs[1] - mean),
    mean + scale * (coeffs[2] - mean),
  ];
}

/** Scale each channel's distance from 1. 1 is a no-op, exactly. */
function applyShadowSplit(tint, scale) {
  if (scale == null || scale === 1) return tint;
  if (scale === 0) return [1, 1, 1];
  return [
    1 + scale * (tint[0] - 1),
    1 + scale * (tint[1] - 1),
    1 + scale * (tint[2] - 1),
  ];
}

function resolveLiftCoeffs(liftCoeffs) {
  if (!Array.isArray(liftCoeffs) || liftCoeffs.length !== 3) return GRADE_LIFT_SPLIT;
  if (!liftCoeffs.every(n => Number.isFinite(n))) return GRADE_LIFT_SPLIT;
  return liftCoeffs;
}

function gradeParams(grade, liftCoeffs) {
  const split = readGradeSplit();
  const blackPoint = grade?.blackPoint ?? 0;
  return {
    liftRGB: applyLiftSplit(resolveLiftCoeffs(liftCoeffs), split?.liftSplit),
    shadowTint: applyShadowSplit(grade?.shadowTint ?? P4_GRUNGE.shadowTint, split?.shadowTint),
    highlightTint: grade?.highlightTint ?? P4_GRUNGE.highlightTint,
    contrast: grade?.contrast ?? P4_GRUNGE.contrast,
    saturation: grade?.saturation ?? P4_GRUNGE.saturation,
    midtoneSatBoost: grade?.midtoneSatBoost ?? P4_GRUNGE.midtoneSatBoost,
    toe: grade?.toe ?? P4_GRUNGE.toe,
    liftAmount: grade?.lift ?? P4_GRUNGE.lift,
    pivot: grade?.pivot ?? P4_GRUNGE.pivot,
    blackPoint,
    bpScale: blackPoint > 0 && blackPoint < 0.9 ? 1 / (1 - blackPoint) : 1,
  };
}

function gradeTexel(r0, g0, b0, p) {
  let r = r0;
  let g = g0;
  let b = b0;
  if (p.blackPoint > 0) {
    r = Math.max(0, (r - p.blackPoint) * p.bpScale);
    g = Math.max(0, (g - p.blackPoint) * p.bpScale);
    b = Math.max(0, (b - p.blackPoint) * p.bpScale);
  }
  const lift = p.liftAmount;
  r = lift * p.liftRGB[0] + (1 - lift) * r;
  g = lift * p.liftRGB[1] + (1 - lift) * g;
  b = lift * p.liftRGB[2] + (1 - lift) * b;
  r = Math.pow(r, p.toe[0]);
  g = Math.pow(g, p.toe[1]);
  b = Math.pow(b, p.toe[2]);
  r = p.pivot + (r - p.pivot) * p.contrast;
  g = p.pivot + (g - p.pivot) * p.contrast;
  b = p.pivot + (b - p.pivot) * p.contrast;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const displayLum = lum <= 0.0031308
    ? Math.max(0, lum) * 12.92
    : 1.055 * Math.pow(lum, 1 / 2.4) - 0.055;
  const midtonePosition = Math.max(0, 1 - Math.abs(displayLum - 0.40) / 0.18);
  const midtoneRelief = midtonePosition * midtonePosition * (3 - 2 * midtonePosition);
  const shadowWeight = Math.max(0, 1 - lum) * (1 - midtoneRelief);
  const highlightWeight = Math.pow(Math.max(0, lum), 1.35);
  r = r * (1 + (p.shadowTint[0] - 1) * shadowWeight + (p.highlightTint[0] - 1) * highlightWeight);
  g = g * (1 + (p.shadowTint[1] - 1) * shadowWeight + (p.highlightTint[1] - 1) * highlightWeight);
  b = b * (1 + (p.shadowTint[2] - 1) * shadowWeight + (p.highlightTint[2] - 1) * highlightWeight);
  const grey = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const sat = p.saturation + p.midtoneSatBoost * midtoneRelief;
  r = grey + (r - grey) * sat;
  g = grey + (g - grey) * sat;
  b = grey + (b - grey) * sat;
  return {
    r: Math.min(1, Math.max(0, r)),
    g: Math.min(1, Math.max(0, g)),
    b: Math.min(1, Math.max(0, b)),
    displayLum,
  };
}

/**
 * One display-referred input through the grade, before 8-bit rounding.
 * `displayLum` is the sRGB luma after contrast: the weight on the shadow tint.
 * `liftCoeffs`, when three finite numbers, replaces 0.88/0.94/1.12 before `?gradeSplit=` scales it.
 */
export function evalGradeTexel(rgb, grade, liftCoeffs = null) {
  return gradeTexel(rgb[0], rgb[1], rgb[2], gradeParams(grade, liftCoeffs));
}

/**
 * The authored grade, evaluated into a 32³ LUT at load. Display-referred: it runs after the
 * AgX tonemap, which is where a colourist's LUT belongs.
 *
 * `?gradeSplit=liftSplit,shadowTint` is read on every bake (constructor, setGrade on time of
 * day or weather, and the residential lab). The lab keeps the grade object it passes — its
 * lift amount, toe, contrast, saturation, pivot — and the query only scales the lift's channel
 * split and the shadow tint. Absent or invalid, the bytes match the bake from before the query.
 * `liftCoeffs` replaces 0.88/0.94/1.12 before that scale, so a neutral split can be passed directly.
 */
export function bakeGradeLut(grade, size = LUT_SIZE, liftCoeffs = null) {
  const data = new Uint8Array(size * size * size * 4);
  const params = gradeParams(grade, liftCoeffs);
  // `toe` and `pivot` were fixed constants until V3.30. They remain optional: board callers
  // inherit the shared defaults, while the residential lab supplies its own transfer.
  // Lane F: toe stays near-neutral so the explicit shadow/highlight tints, not a hidden
  // warm-R bias, determine the raster. Pivot sits on the miniature mid-grey.
  // Display-referred black point, subtracted and renormalised before anything else.
  //
  // AgX is built to hold detail in deep shadow, and it does that by refusing to put
  // anything at display zero: its toe lands the darkest scene values well above black.
  // On this board that is not a small effect. Measured on the coast hero plate, the
  // ungraded frame runs p5 = 18.4 with 32.9% of pixels below luma 60 — almost exactly
  // the reference miniature's 24.6 and 31.3%. The same frame through the grade runs
  // p5 = 107.1 with 0.19% below 60, and half the dynamic range gone. The scene already
  // has the tonal structure; the transfer discards it.
  //
  // This is the standard display-referred fix and it belongs here rather than in
  // exposure — see BASE_EXPOSURE's note, which shows why raising exposure narrows the
  // frame instead of opening it. DEFAULTS TO 0 so every existing caller bakes a
  // byte-identical LUT, same convention as `toe` and `pivot` above.
  let offset = 0;
  for (let bIndex = 0; bIndex < size; bIndex += 1) {
    for (let gIndex = 0; gIndex < size; gIndex += 1) {
      for (let rIndex = 0; rIndex < size; rIndex += 1) {
        // Black point first: pull AgX's floor down to display zero and rescale, so the
        // shadows the scene actually contains survive into the frame.
        // Lift/gamma/gain. The lift is tiny and cool; the gain is warm — the split that
        // makes a golden-hour miniature read as photographed rather than rendered.
        // With the rig's ambient stack cut hard, an enclosed courtyard can fall to a hole;
        // the lift is the floor that keeps a colour in the deepest pocket, weighted cool so
        // §7.6's shadow channel-split starts at the very bottom of the curve.
        // r3: slightly cooler lift floor so shadow bounce reads teal, not grey.
        // v330-r4: `lift` becomes a grade parameter. Board default is P4_GRUNGE.lift
        // (R5 raised it so contrast 1.36 no longer clips roads to void). The
        // residential lab still supplies its own lift. A blind critic counted pure-black pixels (all channels < 10)
        // at 1,003-11,032 per plate on our side against 7-185 on the reference's, and used it
        // as a 7/7 oracle — so it is a §2.9 failure and a fingerprint at once. Three material
        // shadow floors were already confirmed compiling into their buckets, which is what
        // proves the residual is the post chain rather than any material.
        // V3.70: the channel split is narrowed, and this is the last of the three navy
        // mechanisms this programme found. The first was `lighting.js` driving the fill lamp
        // with the sky dome's saturated blue (fixed). The second was material families
        // multiplying authored colour by a tinted map (a lane fix). This is the third, and it
        // is ADDITIVE rather than multiplicative, which is why no amount of re-authoring an
        // albedo ever removed it and why darkening a bucket made it worse.
        //
        // Two lanes measured it independently and agree on both mechanism and magnitude:
        // L1 inverted the transfer chain and found a neutral dark radiance L = 0.004 rendering
        // as `(0, 0, 11)`; L3 measured the crushed-pixel mean on its own plates at
        // `(0.1, 0.02, 11.5)`. At the residential lab's `lift = 0.052` the old coefficients put
        // the black floor at b − r = 0.052 × (1.40 − 0.70) = 0.0364 linear — a pure blue pocket
        // that no lane could author its way out of.
        //
        // The cool intent is kept and only the split is narrowed, from 0.70/0.86/1.40 to
        // 0.88/0.94/1.12: the floor's b − r falls to 0.052 × 0.24 = 0.0125, about a third of
        // what it was, while the shadow pocket still reads cooler than neutral. The board runs
        // `lift = 0.012`, where the same change is proportionally smaller.
        // `?gradeSplit=` scales the lift split toward its Rec.709 mean and the shadow tint
        // toward 1. 1 (or no query) leaves both as authored, including 0.88/0.94/1.12.
        // Toe, contrast, saturation, highlight tint and the lift amount are not scaled.
        const out = gradeTexel(
          rIndex / (size - 1),
          gIndex / (size - 1),
          bIndex / (size - 1),
          params,
        );
        data[offset] = Math.round(out.r * 255);
        data[offset + 1] = Math.round(out.g * 255);
        data[offset + 2] = Math.round(out.b * 255);
        data[offset + 3] = 255;
        offset += 4;
      }
    }
  }
  const texture = new THREE.Data3DTexture(data, size, size, size);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.wrapR = THREE.ClampToEdgeWrapping;
  texture.unpackAlignment = 1;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Device-pixel rain length follows the camera's distance along its ground ray. */
export function rainStreakScale(d) {
  return Math.max(0.3, Math.min(1, 230 / Math.max(1, d)));
}

export class PostChain {
  constructor(renderer, {
    quality = 'high', reducedMotion = false, width = 1, height = 1, grade = null,
    msaa = null,
  } = {}) {
    this.renderer = renderer;
    this.quality = QUALITY_TIERS[quality] ? quality : 'high';
    this.tier = QUALITY_TIERS[this.quality];
    this._msaa = msaa;
    this.reducedMotion = reducedMotion;
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.frameIndex = 0;
    this._rainDirection = new THREE.Vector3();
    this.enabled = true;
    // The fidelity lab opts into a resolved depth copy through its existing residential
    // AO call. The board keeps the ordinary MSAA path and its target/memory profile.
    this._residentialDepthEnabled = false;
    this._residentialGradeApplied = false;
    this._initialGrade = grade ? { ...grade } : null;
    this._residentialDepthTarget = null;
    this._residentialDepthMaterial = null;
    this._playExposureMul = readPlayExposureMul();
    // Safari / WebKit: keep the drawing buffer tagged sRGB so a display-encoded
    // blit is not interpreted as linear (a gamma too dark on Retina).
    if (this.renderer) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      const gl = this.renderer.getContext?.();
      if (gl && 'drawingBufferColorSpace' in gl) {
        gl.drawingBufferColorSpace = 'srgb';
      }
    }
    // §7's headline is that one time-of-day parameter drives the lights, the sky and the
    // grade. `grade.exposure` is the rig's warmth-weighted exposure hint (lighting.js), and
    // round 2 applied it only through setGrade() — so it reached the frame on a time-of-day
    // change but not on the first bake, and the two paths disagreed by 3.4%.
    this.exposure = BASE_EXPOSURE * (grade?.exposure ?? 1) * this._playExposureMul
      * ENVIRONMENT_EXPOSURE_COMPENSATION;
    // V3.10 bloom R12: prior 0.28 @ threshold 1.05 still washed the mid-board hero plate
    // into a central soft blob and erased building silhouettes. Strength half-cut so
    // surviving specular / emissive energy stays a glint, not a fog.
    this.bloomStrength = 0.14;
    // §7 authors the threshold as 0.85 of display white. A sunlit white roof in this
    // scene exposes to about 1.1, so 0.85 blooms every roof in the city; 1.30 keeps the
    // effect on the specular hits and the glazing, which is what "restrained" meant.
    // §7.4's authored 0.85 now means what it says: round 1 pre-multiplied the bloom buffer
    // by exposure and then let the grade multiply by exposure a second time, so the energy
    // reaching AgX was strength * exposure^2 and the threshold had been raised to 1.30 to
    // compensate for a bug rather than to describe an intent.
    // §7.4 authors 0.85. At 0.85 the board's street-lamp emissives — which are authored well
    // above display white — blew into white blobs across the whole wide plate, which is the
    // opposite of "the miniature is lit, not glowing". 1.05 still let sunlit roofs and the
    // R10 key stack (keyIntensity ~7.5 @ ToD 0.42) form a central bloom blob on the hero
    // plate. R12 raises to 1.40 so only hard specular and true emissives pass the prefilter;
    // grade warmth is unchanged. Recorded as a deliberate deviation from §7.4's 0.85.
    this.bloomThreshold = 1.40;
    this.bloomRadius = 0.6;
    // §7.2 authors ~0.35 world units. On grid.js's scale (TILE = 16 units, STOREY = 3.2)
    // that is a 35 cm crease — real, but sub-pixel at board zoom. The march runs log-spaced
    // from the authored near radius out to half a storey, so the spec figure is the inner
    // bound rather than being silently multiplied by six as round 1 did (0.35 * 6.0).
    this._aoRadiusNear = P1_GROUNDING.aoRadiusNear;
    this._aoRadiusFar = P1_GROUNDING.aoRadiusFar;
    // V4 Wave P1: board GTAO was generating a usable buffer then applying it too weakly, so
    // wall-footings and kerbs still read as bright seams. P16 L1 measured the fixed civic toe
    // band at p10/p60 0.333 on MP plus-1 and 0.336 on the r18 entertainment plate (delta 0.003).
    // Keep radius/intensity at the measured match; do not raise the shadow/fill floor or spend
    // the 3.4 roof-speckle ceiling chasing a contact statistic that already clears by 0.027.
    this._aoIntensity = P1_GROUNDING.aoIntensity;
    this._contactDarkness = P1_GROUNDING.contactDarkness;
    this._aoApplyStrength = P1_GROUNDING.aoApplyStrength;
    // R41g native pair: 0.25 softens leaf-receiver contours and keeps more crown
    // volume than 0. Leaf receivers only; generic AO and contact stay put.
    this._foliageReceiverCap = 0.25;
    this.aoPeakMix = 0.84;
    this.aoBias = 0.085;
    // W31 GROUND_CREASE: the city board's extent, read by the AO pass to tell the hinterland from the board.
    this.boardExtent = { x: GROUND_CREASE.boardExtent.x, z: GROUND_CREASE.boardExtent.z };
    // W33 CREASE_VENUES: the venue precincts to leave out, [x0, z0, x1, z1] each (the scene sets them from venueGroundRegions).
    this.venueRegions = [];
    // Longer contact march under the raking key so wall bases and the table seat darken.
    this.contactLength = P1_GROUNDING.contactLength;
    // Hero-friendly soft miniature DOF at default focusDistance (board / hero-wide).
    // Capture harness freezes focus and may set dofStrength low (e.g. 0.12) — leave both
    // as public fields so capture-state.mjs can still override without chain rewrites.
    // X4: frame the miniature with soft outer 15% bands. Depth cannot blur
    // the central subject stripe, and output-pixel CoC is capped in compose.
    this.dofStrength = 0.45;
    this.tiltGain = 0;
    this.tiltCentre = 0.5;
    this.bandHalf = 0.35;
    this.bandSoft = 0.15;
    this.grainAmount = P4_GRUNGE.grainAmount;
    this.vignette = P4_GRUNGE.vignette;
    this.focusDistance = 120;
    this._prevViewProjection = new THREE.Matrix4();
    this._viewProjection = new THREE.Matrix4();
    this._jitter = new THREE.Vector2();
    this._savedProjection = new THREE.Matrix4();
    this._foliageMaskMaterials = new Map();
    this._foliageMaskSceneRoot = null;
    this._maskClearColor = new THREE.Color();
    this._maskDepthProj = new THREE.Vector4();
    this._sunViewDirection = new THREE.Vector3();
    this._historyValid = false;

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -1, -1, 0, 3, -1, 0, -1, 3, 0,
    ]), 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
      0, 0, 2, 0, 0, 2,
    ]), 2));
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.lut = bakeGradeLut(grade);
    this.passes = [];
    this.targets = [];
    // ── P16-W6 PROTOTYPE B: screen-space reflection over water pixels. ──
    // OFF by default and its target and pass are not built until it is turned
    // on, so a chain that never enables it costs nothing — no program, no
    // memory, and no change to the existing pass order. `setSsr(true)` builds
    // both and wires the pass between GTAO and TAA; nothing else in the chain
    // is touched either way.
    this.ssrEnabled = false;
    this.ssrPass = null;
    this.ssrTarget = null;
    this.ssrSteps = SSR.steps;
    this._buildTargets();
    this._buildPasses();
  }

  /**
   * Turn the SSR prototype on or off. Building is lazy and one-shot; turning it
   * off leaves the target allocated so the A/B can toggle at frame rate without
   * a reallocation showing up in the measurement.
   */
  setSsr(on) {
    this.ssrEnabled = Boolean(on);
    if (this.ssrEnabled && !this.ssrPass) this._buildSsr();
    return this.ssrEnabled;
  }

  /**
   * AO is public because the board and the fidelity lab use different camera scales. Keep the
   * fields as real accessors: older lab callers that assign them directly still update the live
   * shader, while new callers can use setAmbientOcclusion() as one atomic configuration change.
   */
  get aoRadiusNear() { return this._aoRadiusNear; }

  set aoRadiusNear(value) {
    if (Number.isFinite(Number(value))) this._aoRadiusNear = Math.max(0, Number(value));
    this._syncAoUniforms();
  }

  get aoRadiusFar() { return this._aoRadiusFar; }

  set aoRadiusFar(value) {
    if (Number.isFinite(Number(value))) this._aoRadiusFar = Math.max(0, Number(value));
    this._syncAoUniforms();
  }

  get aoIntensity() { return this._aoIntensity; }

  set aoIntensity(value) {
    if (Number.isFinite(Number(value))) this._aoIntensity = Math.max(0, Number(value));
    this._syncAoUniforms();
  }

  get foliageReceiverCap() { return this._foliageReceiverCap; }

  set foliageReceiverCap(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    this._foliageReceiverCap = Math.max(0, Math.min(1, numeric));
    const cap = this.aoApplyPass?.material?.uniforms?.uFoliageReceiverCap;
    if (cap) cap.value = this._foliageReceiverCap;
  }

  get contactDarkness() { return this._contactDarkness; }

  set contactDarkness(value) {
    if (Number.isFinite(Number(value))) this._contactDarkness = Math.max(0, Math.min(1, Number(value)));
    this._syncAoUniforms();
  }

  setAmbientOcclusion({
    radiusNear = this.aoRadiusNear,
    radiusFar = this.aoRadiusFar,
    intensity = this.aoIntensity,
    contactDarkness = this.contactDarkness,
  } = {}) {
    // The lab's scene target is multisampled. On the SwiftShader path the attached depth
    // texture is a valid depth attachment for rasterisation but is not a reliable sampler
    // source for the later fullscreen AO pass. A single-sample depth copy is the additive,
    // lab-only bridge; board callers never invoke this method.
    if (!this._residentialDepthEnabled && this.renderer.domElement?.id === 'lab') {
      this._residentialDepthEnabled = true;
      this._buildResidentialDepthTarget();
      this._rebindTargets();
      this._applyResidentialGrade();
    }
    this.aoRadiusNear = radiusNear;
    this.aoRadiusFar = radiusFar;
    this.aoIntensity = intensity;
    this.contactDarkness = contactDarkness;
    return this;
  }

  _syncAoUniforms() {
    const uniforms = this.aoPass?.material?.uniforms;
    if (!uniforms) return;
    uniforms.uRadiusNear.value = this._aoRadiusNear;
    uniforms.uRadiusFar.value = this._aoRadiusFar;
    uniforms.uIntensity.value = this._aoIntensity;
    if (uniforms.uPeakMix) uniforms.uPeakMix.value = this.aoPeakMix;
    const applyUniforms = this.aoApplyPass?.material?.uniforms;
    if (applyUniforms?.uContactDarkness) applyUniforms.uContactDarkness.value = this._contactDarkness;
    // Board play uses P1_GROUNDING.aoApplyStrength. The fidelity lab still takes the
    // stronger 0.82 mix so residential plates keep their resolved creases.
    if (applyUniforms?.uAoStrength) {
      applyUniforms.uAoStrength.value = this._residentialDepthEnabled ? 0.82 : this._aoApplyStrength;
    }
  }

  _buildResidentialDepthTarget() {
    if (this._residentialDepthTarget) return;
    this._residentialDepthTarget = makeTarget(this.width, this.height, {
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      name: 'dd-residential-depth-copy',
    });
    this._residentialDepthTarget.depthTexture = new THREE.DepthTexture(this.width, this.height);
    this._residentialDepthTarget.depthTexture.format = THREE.DepthFormat;
    this._residentialDepthTarget.depthTexture.type = THREE.UnsignedIntType;
    this.targets.push(this._residentialDepthTarget);
    this._residentialDepthMaterial = new THREE.MeshDepthMaterial();
    this._residentialDepthMaterial.colorWrite = false;
    this._residentialDepthMaterial.depthWrite = true;
  }

  /**
   * The residential fidelity lab's own grade. Lab-only: it is reached from
   * setAmbientOcclusion() behind the `domElement.id === 'lab'` gate, the board never calls it,
   * and the board's LUT is not rebuilt by it.
   *
   * V3.30 re-calibration, against `mvp/_reviews/residential/_reference-mp/` — the stylised
   * board-game pack that spec §4 makes the bar — rather than against the retired pack of
   * photographed miniatures. The previous numbers here (exposure -0.055, contrast +0.10,
   * saturation +0.045) were the photographic calibration: they *lowered* exposure to hold a
   * "dark verandah toe and a cream sun face", which is a photograph's tonal habit.
   *
   * Measured on the v330-r1-core plates against the mp pack, subject-masked by border
   * region-grow (a fixed-tolerance flood fill does not work — the studio seamless is a shaded
   * shell running 177 to 216, so a fixed tolerance leaves ~38% of the frame's own backdrop
   * inside the "subject" and every statistic then grades the backdrop):
   *
   *   cottage   ours sd 41.7  p05 57.6  p95 188.2  >=200: 0.8%     bar sd 59.9  p95 233.9  15.7%
   *   villa     ours sd 39.5  p05 52.9  p95 181.9  >=200: 0.7%     bar sd 50.2  p95 206.2   5.9%
   *   carlton   ours sd 51.9  p05  0.0  p95 172.7  >=200: 0.0%     bar sd 58.8  p95 219.0  10.8%
   *
   * Both tails are missing, which is a range deficiency and not a level one — the subject mean
   * was already within 12 code values of the bar. The four levers below were chosen from a
   * scored grid over an exact re-grade of the captured plates (every stage after AgX inverts,
   * so a candidate can be measured without a render), and then verified on real captures:
   *
   *  - `exposure` x2. One stop. Not a move toward "brighter": it is what puts the frame's
   *    white point where the bar's is. On its own it pastels the frame exactly as round 2
   *    did — sd falls to 35 and a third of the subject piles above 200 — which is why it
   *    never appears here without the toe.
   *  - `toe` 1.12/1.14/1.18, from 0.968/0.988/1.028. The compensator: a gamma above one over
   *    the graded value, so the stop of exposure lands on the highlights and is given back in
   *    the mids and shadows. Exposure and toe are one lever in two halves and neither is
   *    meaningful alone.
   *  - `contrast` +0.336 and `pivot` 0.30, from +0.10 and 0.360. Contrast alone cannot do this
   *    job: it operates on the pre-encode value, where a step near 0.05 is worth four times as
   *    many code values as the same step near 0.5, so it moves the shadows four times harder
   *    than the highlights. At the contrast that reached the bar's sd on its own, the Carlton
   *    went to 30% of subject at or below code value 20 against the bar's 1.9%. The lower
   *    pivot is what keeps this expansion off the blacks.
   *  - `saturation` +0.255. The pack measures mean chroma 21-36 against our 18-29.
   *
   * The vignette goes with them. 0.40 was a lens artefact; Lane F dropped the board to
   * P4_GRUNGE.vignette (0.22) so corners stop manufacturing mud. The lab stays at 0.18.
   */
  _applyResidentialGrade() {
    if (this._residentialGradeApplied) return;
    const grade = this._initialGrade ?? {};
    this.setGrade({
      ...grade,
      exposure: (grade.exposure ?? 1) * 2.00,
      contrast: (grade.contrast ?? 1.06) + 0.336,
      saturation: (grade.saturation ?? 1.06) + 0.255,
      toe: [1.12, 1.14, 1.18],
      pivot: 0.30,
      // The black floor. Board uses P4_GRUNGE.lift (0.055 after R5). A residential
      // fidelity plate is majority building and its blacks are window reveals, so
      // the lab stays at 0.052. Lab-only; board LUT is not rebuilt by this path.
      lift: 0.052,
    });
    this.vignette = 0.18;
    const uniforms = this.gradePass?.material?.uniforms;
    if (uniforms?.uVignette) uniforms.uVignette.value = this.vignette;
    this._residentialGradeApplied = true;
  }

  // ---------------------------------------------------------------- targets

  _buildTargets() {
    const { width, height, tier } = this;
    const type = tier.halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const sceneType = this.quality === 'low' && lowSceneHalfFloatSupported(this.renderer)
      ? THREE.HalfFloatType : type;
    const half = Math.max(1, Math.round(width * tier.aoScale));
    const halfH = Math.max(1, Math.round(height * tier.aoScale));

    // MSAA on the scene target, not on the canvas: the canvas is only ever the AA pass's
    // output, so canvas multisampling would resolve nothing the chain has drawn. WebGL2
    // resolves both colour and the attached depth texture on read
    // (three.module.js:19381 blits DEPTH_BUFFER_BIT), so GTAO and DOF still get real depth.
    this.sceneTarget = makeTarget(width, height, {
      type: sceneType, depthBuffer: true, name: 'dd-scene',
      samples: sceneSamples(tier.msaa ?? 0, this._msaa, this.renderer?.capabilities?.maxSamples),
    });
    this.sceneTarget.depthTexture = new THREE.DepthTexture(width, height);
    this.sceneTarget.depthTexture.format = THREE.DepthFormat;
    this.sceneTarget.depthTexture.type = THREE.UnsignedIntType;
    this.sceneTarget.depthTexture.minFilter = THREE.NearestFilter;
    this.sceneTarget.depthTexture.magFilter = THREE.NearestFilter;
    this.targets.push(this.sceneTarget);

    if (tier.ao || tier.contactShadows) {
      this.aoTarget = makeTarget(half, halfH, { type: THREE.UnsignedByteType, name: 'dd-ao' });
      // P19 X1C: bilateral upsample lives in aoApply; no extra blur target/pass.
      this.aoBlurTarget = this.aoTarget;
      this.litTarget = makeTarget(width, height, { type, name: 'dd-lit' });
      this.targets.push(this.aoTarget, this.litTarget);
    }
    if (tier.ao) {
      // R8 coverage. Single-sample colour only: the MSAA scene depth stays a
      // read-only comparison and is not attached here.
      this.foliageMaskTarget = new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RedFormat,
        type: THREE.UnsignedByteType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false,
        colorSpace: THREE.NoColorSpace,
        samples: 0,
      });
      this.foliageMaskTarget.texture.name = 'dd-foliage-mask';
      this.targets.push(this.foliageMaskTarget);
    }

    this.bloomTargets = [];
    // P19 X1C: bloom is a few thresholded taps inside the grade pass.

    if (tier.dof) {
      const dofW = Math.max(1, Math.round(width * 0.5));
      const dofH = Math.max(1, Math.round(height * 0.5));
      this.dofTarget = makeTarget(dofW, dofH, { type, name: 'dd-dof' });
      this.targets.push(this.dofTarget);
    }

    if (tier.aa === 'taa') {
      // Ping-pong, so the resolved frame becomes next frame's history without a blit.
      this.historyA = makeTarget(width, height, { type, name: 'dd-taa-a' });
      this.historyB = makeTarget(width, height, { type, name: 'dd-taa-b' });
      this._historyRead = this.historyA;
      this._historyWrite = this.historyB;
      this.targets.push(this.historyA, this.historyB);
    }

    // Grade output is 8-bit and already display-encoded; the AA pass is the only reader.
    this.gradeTarget = makeTarget(width, height, { type: THREE.UnsignedByteType, name: 'dd-grade' });
    this.targets.push(this.gradeTarget);
    this._historyValid = false;
    if (this._residentialDepthEnabled) this._buildResidentialDepthTarget();
  }

  _disposeTargets() {
    for (const target of this.targets) {
      if (target.depthTexture) target.depthTexture.dispose();
      target.dispose();
    }
    this.targets = [];
    this.bloomTargets = [];
    this.sceneTarget = null;
    this.aoTarget = null;
    this.aoBlurTarget = null;
    this.litTarget = null;
    this.dofTarget = null;
    this.historyA = null;
    this.historyB = null;
    this._historyRead = null;
    this._historyWrite = null;
    this.gradeTarget = null;
    // P16-W6 prototype B: dropped with the rest, rebuilt in _rebindTargets when
    // the pass exists, so a resize cannot leave the pass reading a dead target.
    this.ssrTarget = null;
    this._residentialDepthTarget = null;
    this.foliageMaskTarget = null;
  }

  // ---------------------------------------------------------------- passes

  _pass(fragmentShader, uniforms, defines) {
    const pass = new FullScreenPass(this.geometry, this.quadCamera, fragmentShader, uniforms, defines);
    this.passes.push(pass);
    return pass;
  }

  _buildPasses() {
    const tier = this.tier;
    const texel = new THREE.Vector2(1 / this.width, 1 / this.height);

    if (tier.ao || tier.contactShadows) {
      this.aoPass = this._pass(/* glsl */`
        ${COMMON}
        ${DEPTH_COMMON}
        uniform vec2 uTexel;
        uniform float uRadiusNear;
        uniform float uRadiusFar;
        uniform float uIntensity;
        uniform float uPeakMix;
        uniform float uBias;
        uniform float uBiasFar;
        uniform vec2 uBiasFarRange;
        uniform float uBiasGround;
        uniform vec3 uUpView;
        uniform float uContactLength;
        uniform vec3 uSunView;
        uniform float uFrame;${GC_DECL}
        void main() {
          // R8: nearest-filtered depth belongs to a texel centre. Reconstructing
          // it at a subpixel march UV invents height on a perfectly flat plane.
          vec2 centreUv = (floor(vUv / uTexel) + 0.5) * uTexel;
          float depth = rawDepth(centreUv);
          if (depth >= 1.0) { gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0); return; }
          vec3 P = viewPosition(centreUv, depth);
          vec3 N = normalFromDepth(centreUv, uTexel, P);
          float noise = ign(gl_FragCoord.xy + uFrame * 5.588238);
          // Distance-scaled angle bias (orchestrator, 2026-09-02). The normal is
          // reconstructed from depth, so on the ring's 10–17 m sheets every triangle join
          // (5–10°) read as a crease and the AO drew a soft dark band along every edge —
          // the "polygonal seam network" that capped six board plates. Near the camera
          // the authored bias keeps kerbs and wall bases; past ~120 m it rises so only a
          // real crease (a wall, a cutting) registers on distant terrain.
          float farT = smoothstep(uBiasFarRange.x, uBiasFarRange.y, -P.z);
          // Ground-facing pixels (reconstructed normal within ~15° of world up) take a
          // 0.30 bias at ANY distance: a coarse terrain sheet's facet joins (dot ≈ 0.1–0.2)
          // stop registering, while a wall base (≥ 0.7) or a kerb (≈ 0.45) still does.
          // The distance term stays only for the outer ring's steeper dish facets.
          float groundT = smoothstep(0.86, 0.97, dot(N, uUpView));
          float bias = max(mix(uBias, uBiasFar, farT), mix(uBias, uBiasGround, groundT));${GC_BODY}

          float ao = 1.0;
          #if AO_DIRECTIONS > 0
            float occlusionSum = 0.0;
            float occlusionPeak = 0.0;
            float nearPixels = uRadiusNear * (uProj[1][1] * 0.5) / max(0.05, -P.z) / uTexel.y;
            float farPixels  = uRadiusFar  * (uProj[1][1] * 0.5) / max(0.05, -P.z) / uTexel.y;
            // Retain the measured crease field. The full-resolution receiver gate
            // below limits its application to two pixels, so its reach is not a halo.
            nearPixels = clamp(nearPixels, 2.0, 24.0);
            farPixels = clamp(farPixels, max(nearPixels * 1.8, 6.0), 72.0);
            float ratio = farPixels / nearPixels;
            // Keep vertical occluders inside the authored world radius even when the
            // projected reach is capped: a wall next to this pixel can rise above it.
            // At board zoom retain the floor's projected radius, as the earlier fix did.
            float worldFar = max(uRadiusFar, farPixels * uTexel.y * max(0.05, -P.z) / (uProj[1][1] * 0.5));
            float invFarSq = 1.0 / max(worldFar * worldFar, 1e-6);
            for (int d = 0; d < AO_DIRECTIONS; d++) {
              float angle = (float(d) + noise) / float(AO_DIRECTIONS) * 6.2831853;
              vec2 dir = vec2(cos(angle), sin(angle));
              float horizon = 0.0;
              for (int s = 1; s <= AO_STEPS; s++) {
                // Log-spaced march. §7.2 authors a ~0.35 world-unit radius, which on this
                // grid (grid.js: TILE = 16 units per parcel) is a 35 cm crease and covers
                // well under a pixel at board zoom. Marching from the authored near radius
                // out to a kerb-scale far radius honours the figure and still darkens the
                // wall/ground junction the reference plate seats every building on.
                float t = (float(s) - 0.5 + noise * 0.5) / float(AO_STEPS);
                float step = nearPixels * pow(ratio, t);
                vec2 sampleUv = centreUv + dir * step * uTexel;
                sampleUv = (floor(sampleUv / uTexel) + 0.5) * uTexel;
                float sampleDepth = rawDepth(sampleUv);
                if (sampleDepth >= 1.0) continue;
                vec3 S = viewPosition(sampleUv, sampleDepth);
                vec3 V = S - P;
                float len = length(V);
                if (len < 1e-4) continue;
                // Squared falloff, not linear: a linear ramp zeroes an occluder sitting
                // near the radius edge and lets the near occluder — the one that actually
                // makes contact read — average away against it.
                float f = clamp(1.0 - (len * len) * invFarSq, 0.0, 1.0);
                // Angle bias. The normal is reconstructed from depth, so a flat roof or a
                // shallow ramp returns a small positive dot from reconstruction error alone;
                // taking a max over directions then picks the largest error on every pixel
                // and the surface fills with speckle. Ignore everything below the bias and
                // rescale what survives, so only a real crease registers.
                ${CREASE_NDV}
                // R8 open-plane gate: require real height above the receiver's
                // tangent plane. Depth quantisation and shallow facets are not creases.
                float planeGate = smoothstep(0.025, 0.10, dot(N, V));
                horizon = max(horizon, max(ndv, 0.0) * f * f * planeGate);
              }
              occlusionSum += horizon;
              occlusionPeak = max(occlusionPeak, horizon);
            }
            // A perfect 90-degree wall/ground junction occludes at most one of four
            // directions, so a plain mean can never fall below 1 - 0.25 * intensity and the
            // AO buffer sat at a measured mean of 0.962 with 0.14% of pixels below 0.8.
            // Weighting the mean toward the strongest direction is what recovers the crease.
            float occlusion = mix(occlusionSum / float(AO_DIRECTIONS), occlusionPeak, uPeakMix);
            // Saturate confirmed creases without lifting a zero/open horizon.
            occlusion = sqrt(occlusion) * smoothstep(0.035, 0.16, occlusionPeak);
            // Floored, not clamped to zero. A crease that reaches 0 multiplies the wall base
            // to black and the seat reads as an inked outline rather than as occlusion —
            // visible at 2x zoom on the close plate. A miniature under a real sky keeps
            // bounce in its deepest creases. R8 raises that floor to 0.30 because
            // the compact receiver gate must not turn a tiny sole into a black mark.
            ao = clamp(1.0 - occlusion * uIntensity, 0.30, 1.0);
            // World-vertical faces retain diffuse bounce in deep creases; the
            // R8 floor and contact receiver on horizontal planes stay intact.
            if (abs(dot(N, uUpView)) < ${P23_LIGHT_PHOTO.wallNormalMax.toFixed(2)}) {
              ao = max(ao, ${P23_LIGHT_PHOTO.wallAoFloor.toFixed(2)});
            }
            // Distant terrain keeps only part of its AO: at 200+ m the pass is mostly
            // facet noise on the ring, while building bases there still get 45 %.
            // 0.35, not 0.55: at 0.55 the far city blocks at play zoom lifted 7 luma; the
            // bias carries most of the ring fix on its own (o3 vs o4 census).
            // P16 (2026-09-04) trial: 0.45 → 0.20. The bias law above is what removed the
            // ring's polygonal seam network; this fade was belt-and-braces and it also faded
            // the contact term at building feet to a mean 3 luma at plate distance (the board
            // critic's "no AO at building-ground junctions"). Guarded by the lineament census.
            ao = mix(ao, 1.0, farT * 0.20);
          #endif

          float contact = 1.0;
          #if CONTACT_STEPS > 0
          // Contact shadows are a near-field effect; on distant coarse terrain the march
          // hits the neighbouring facet and prints the same lattice. Fade it out with the
          // same range as the bias.
          // P21 R1: a back-facing receiver is already outside direct sunlight.
          // Marching it into its own wall painted an upper-storey box halo.
          if (uContactLength > 0.0 && farT < 0.999 && dot(N, uSunView) > 0.05) {
            vec3 rayPos = P + N * 0.05;
            vec3 rayStep = uSunView * (uContactLength / float(CONTACT_STEPS));
            rayPos += rayStep * noise;
            float hit = 0.0;
            for (int i = 0; i < CONTACT_STEPS; i++) {
              rayPos += rayStep;
              vec4 clip = uProj * vec4(rayPos, 1.0);
              if (clip.w <= 0.0) break;
              vec2 sampleUv = (clip.xy / clip.w) * 0.5 + 0.5;
              if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) break;
              sampleUv = (floor(sampleUv / uTexel) + 0.5) * uTexel;
              float sampleDepth = rawDepth(sampleUv);
              if (sampleDepth >= 1.0) continue;
              vec3 sampleP = viewPosition(sampleUv, sampleDepth);
              float sampleZ = sampleP.z;
              float delta = sampleZ - rayPos.z;
              // A contact hit must stay within a thin surface, not the old 90 cm
              // slab behind every depth sample (which self-occluded flat facades).
              // Reject a coplanar sample even when the depth slab accepts it.
              if (delta > 0.02 && delta < 0.10 && dot(N, sampleP - P) > 0.05) {
                // A binary hit writes a hard black stripe one pixel wide along every wall
                // base, which at 2x zoom reads as an ink outline rather than as an occlusion.
                // Grade it by how far the ray travelled before it was stopped: a caster right
                // against the surface darkens fully, one at the end of the march barely.
                hit = 1.0 - (float(i) + 0.5) / float(CONTACT_STEPS);
                break;
              }
            }
            contact = 1.0 - hit * hit * 0.92 * (1.0 - farT);
          }
          #endif
          gl_FragColor = vec4(ao, contact, 0.0, 1.0);
        }
      `, {
        tDepth: { value: this.sceneTarget.depthTexture },
        uProjInv: { value: new THREE.Matrix4() },
        uProj: { value: new THREE.Matrix4() },
        uNear: { value: 1 },
        uFar: { value: 2000 },
        uTexel: { value: texel.clone() },
        uRadiusNear: { value: this.aoRadiusNear },
        uRadiusFar: { value: this.aoRadiusFar },
        uIntensity: { value: this.aoIntensity },
        uPeakMix: { value: this.aoPeakMix },
        uBias: { value: this.aoBias },
        // Far bias 0.26 (≈ 15°) from 120 m to 280 m of view depth: the graded board poses
        // put the ring at 200–500 m, the city blocks inside 150 m.
        // Far bias 0.40 (≈ 24°): the first plate at 0.26 blended over 120–280 m still left
        // faint bands on the ring's relief (facet joins reach 10–15° there) because the
        // nearer ring at 200 m only got a third of the far bias. Full far bias from 220 m;
        // nothing changes inside 150 m, which is the whole city at play zoom.
        // Measured 2026-09-03: a 0.30 ground-facing bias cost the near city 5.5 luma of
        // contact AO and did not clear the Falls foreground ring; the distance law alone,
        // starting at 110 m with 0.45 (≈ 27°), is the better trade. Ground term left inert.
        // Final (2026-09-03): 0.55 from 110 m — the Falls foreground ring (150–200 m at
        // that pose) still showed AO creases at 0.45; the far city block at play zoom pays
        // ~7 luma of wall-base AO for six clean ring plates.
        uBiasFar: { value: 0.55 },
        uBiasGround: { value: 0.085 },
        uUpView: { value: new THREE.Vector3(0, 1, 0) },
        // 120→180 m: the Falls Creek pose (camera 230 m out) sees the ring at 180–300 m and
        // still showed a faint lattice with the 150→220 range; play-zoom city stays under 120 m.
        // With the ground-facing bias carrying the terrain at any distance, the distance
        // term can start later again (150→220 m) so the far city keeps its wall-base AO.
        // P16 L2: 110→170 faded screen-space contact at container-zone (camera 135 m,
        // crane ~80–150 m) to ~58 % of its near strength, so crane-bay and figure feet
        // lost the 1 m band. 145→210 keeps that pose at farT = 0, reaches full fade
        // by 210 m (the ring at board-wide), and leaves play-zoom city (< 120 m) untouched.
        uBiasFarRange: { value: new THREE.Vector2(145, 210) },
        uContactLength: { value: this.contactLength },
        uSunView: { value: new THREE.Vector3(0, 1, 0) },
        uFrame: { value: 0 },
        ...(GROUND_CREASE.on ? {
          uCamWorld: { value: new THREE.Matrix4() },
          uBoardExtent: { value: new THREE.Vector2(this.boardExtent.x, this.boardExtent.z) },
          uHinter: { value: new THREE.Vector4(GROUND_CREASE.bias, GROUND_CREASE.coneLo, GROUND_CREASE.coneHi, 0) },
          ...(LAND_CREASE ? landFieldUniforms() : {}),
          ...(CREASE_VENUES.on ? { uVenues: { value: Array.from({ length: CREASE_VENUES.max }, () => new THREE.Vector4(1e9, 1e9, -1e9, -1e9)) } } : {}),
        } : {}),
      }, {
        AO_DIRECTIONS: tier.ao ? tier.aoDirections : 0,
        AO_STEPS: tier.ao ? tier.aoSteps : 0,
        CONTACT_STEPS: tier.contactShadows ? tier.contactSteps : 0,
      });

      this.aoBlurPass = null;

      this.aoApplyPass = this._pass(/* glsl */`
        ${COMMON}
        ${DEPTH_COMMON}
        uniform sampler2D tDiffuse;
        uniform sampler2D tAo;
        uniform sampler2D tFoliageMask;
        uniform vec2 uAoTexel;
        uniform float uAoStrength;
        uniform float uFoliageReceiverCap;
        uniform float uContactDarkness;
        // W17: exclude the drawn sea at full resolution, after the bilateral
        // gather. Keeping the AO field unchanged preserves every land sample.
        uniform float uHasWater;
        bool waterSurface(float depth) {
          // Ocean's separate alpha blend writes this coverage ID without
          // changing RGB. Depth rejects clear sky; partial shore/solid pixels
          // keep AO. Unlike a height band this follows the actual wave crest.
          return uHasWater > 0.5 && depth < 1.0 && texture2D(tDiffuse, vUv).a < 0.05;
        }
        void main() {
          vec4 colour = vec4(sanitise(texture2D(tDiffuse, vUv).rgb), 1.0);
          if (waterSurface(rawDepth(vUv))) { gl_FragColor = colour; return; }
          float foliageCoverage = clamp(texture2D(tFoliageMask, vUv).r, 0.0, 1.0);
          float centreZ = viewZ(rawDepth(vUv));
          float tolerance = max(0.001 * abs(centreZ), 0.015);
          vec2 sum = vec2(0.0);
          float weightSum = 0.0;
          // R8: compact bilateral gather; the old 5x5 spread bled onto open planes.
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec2 offset = vec2(float(x), float(y)) * uAoTexel * 0.5;
              float z = viewZ(rawDepth(vUv + offset));
              float w = exp(-abs(z - centreZ) / tolerance) * exp(-float(x * x + y * y) * 0.22);
              sum += texture2D(tAo, vUv + offset).rg * w;
              weightSum += w;
            }
          }
          vec2 occ = sum / max(weightSum, 1e-4);
          // R8: a half-resolution field cannot resolve every one-pixel car/figure
          // contact. Keep its strong crease estimate, but admit it only where
          // full-resolution depth confirms a local receiver/occluder junction.
          // This gate runs AFTER the gather so blur cannot spill onto open planes.
          vec2 texel = uAoTexel * 0.5;
          vec3 P = viewPosition(vUv, rawDepth(vUv));
          vec3 N = normalFromDepth(vUv, texel, P);
          float bias = mix(0.085, 0.55, smoothstep(145.0, 210.0, -P.z));
          float receiverHorizon = 0.0;
          for (int d = 0; d < 4; d++) {
            vec2 dir = d == 0 ? vec2(1.0, 0.0) : d == 1 ? vec2(-1.0, 0.0)
              : d == 2 ? vec2(0.0, 1.0) : vec2(0.0, -1.0);
            vec2 uv = vUv + dir * texel * 2.0;
            float depth = rawDepth(uv);
            if (depth >= 1.0) continue;
            vec3 V = viewPosition(uv, depth) - P;
            float len = max(length(V), 1e-4);
            float horizon = max(0.0, (dot(N, V / len) - bias) / (1.0 - bias));
            // Millimetre-scale separation retains a figure's sole; texel-aligned
            // reconstruction keeps a coplanar receiver below this threshold.
            receiverHorizon = max(receiverHorizon, horizon * smoothstep(0.002, 0.015, dot(N, V)));
          }
          float receiverGate = smoothstep(0.005, 0.025, receiverHorizon);
          occ = mix(vec2(1.0), occ, receiverGate);
          // Coverage 0 keeps the architectural AO term exact. Covered foliage
          // retains a bounded share of that term instead of the full strength.
          float aoStrength = mix(uAoStrength, min(uAoStrength, uFoliageReceiverCap), foliageCoverage);
          colour.rgb *= mix(1.0, occ.r, aoStrength);
          colour.rgb *= mix(1.0, occ.g, uContactDarkness);
          gl_FragColor = colour;
        }
      `, {
        tDiffuse: { value: this.sceneTarget.texture },
        tAo: { value: this.aoTarget.texture },
        tFoliageMask: { value: this.foliageMaskTarget?.texture ?? null },
        tDepth: { value: this.sceneTarget.depthTexture },
        uProjInv: { value: new THREE.Matrix4() },
        uProj: { value: new THREE.Matrix4() },
        uNear: { value: 1 },
        uFar: { value: 2000 },
        uAoTexel: { value: new THREE.Vector2(1 / this.aoTarget.width, 1 / this.aoTarget.height) },
        uAoStrength: { value: this._aoApplyStrength },
        uFoliageReceiverCap: { value: this._foliageReceiverCap },
        uContactDarkness: { value: this.contactDarkness },
        uHasWater: { value: 0 },
      });
    }

    this.bloomPrefilterPass = null;
    this.bloomBlurPass = null;
    this.bloomCombinePass = null;

    if (tier.dof) {
      this.dofPass = this._pass(/* glsl */`
        ${COMMON}
        ${DEPTH_COMMON}
        uniform sampler2D tDiffuse;
        uniform vec2 uTexel;
        uniform float uFocus;
        uniform float uRange;
        uniform float uTerrainFocus;
        uniform float uMaxCoc;
        uniform float uTilt;
        uniform float uTiltCentre;
        uniform float uBandHalf;
        uniform float uBandSoft;
        uniform float uBandGain;
        uniform float uFrame;

        const vec2 TAPS[20] = vec2[20](
          vec2( 0.0000,  1.0000), vec2( 0.5878,  0.8090), vec2( 0.9511,  0.3090),
          vec2( 0.9511, -0.3090), vec2( 0.5878, -0.8090), vec2( 0.0000, -1.0000),
          vec2(-0.5878, -0.8090), vec2(-0.9511, -0.3090), vec2(-0.9511,  0.3090),
          vec2(-0.5878,  0.8090), vec2( 0.0000,  0.5000), vec2( 0.4045,  0.2939),
          vec2( 0.4755, -0.1545), vec2( 0.1545, -0.4755), vec2(-0.2939, -0.4045),
          vec2(-0.5000,  0.0000), vec2(-0.2939,  0.4045), vec2( 0.1545,  0.4755),
          vec2( 0.4755,  0.1545), vec2( 0.2500,  0.0000)
        );

        vec2 focusBand() {
          if (uTerrainFocus < 0.5) return vec2(uFocus, uRange);
          // X4B: focus the visible reticle surface, including bare terrain.
          // A sky reticle retains the rig fallback. The broad terrain range
          // protects the midground while the outer miniature frame still ramps.
          float reticleDepth = rawDepth(vec2(0.5));
          float terrain = uTerrainFocus * (1.0 - step(0.999999, reticleDepth));
          float reticleZ = -viewPosition(vec2(0.5), reticleDepth).z;
          float focus = mix(uFocus, reticleZ, terrain);
          float range = mix(uRange, max(uRange, reticleZ), terrain);
          return vec2(focus, range);
        }

        float cocAt(vec2 uv, vec2 focalBand) {
          float depth = rawDepth(uv);
          float z = -viewPosition(uv, depth).z;
          // X4: depth modulates only the outer 15% at each edge. It cannot
          // dissolve the subject in the centre 70% of the frame.
          float depthCoc = clamp(abs(z - focalBand.x) / max(focalBand.y, 1e-3), 0.0, 1.0);
          float band = smoothstep(uBandHalf, uBandHalf + uBandSoft, abs(uv.y - uTiltCentre));
          float coc = band * max(0.15, depthCoc * depthCoc);
          return coc;
        }

        void main() {
          vec3 centre = sanitise(texture2D(tDiffuse, vUv).rgb);
          // Depth can only reduce this finite-input radius bound. Keep the
          // strict threshold: a radius of exactly 0.5 still runs the gather.
          float band = smoothstep(uBandHalf, uBandHalf + uBandSoft, abs(vUv.y - uTiltCentre));
          if (band * uMaxCoc < 0.5) { gl_FragColor = vec4(centre, 0.0); return; }
          vec2 focalBand = focusBand();
          float coc = cocAt(vUv, focalBand);
          float radius = coc * uMaxCoc;
          if (radius < 0.5) { gl_FragColor = vec4(centre, 0.0); return; }
          float centreZ = -viewPosition(vUv, rawDepth(vUv)).z;
          float angle = hash12(gl_FragCoord.xy + uFrame * 3.77) * 6.2831853;
          float cs = cos(angle);
          float sn = sin(angle);
          vec3 sum = centre;
          float weightSum = 1.0;
          for (int i = 0; i < DOF_TAPS; i++) {
            vec2 tap = TAPS[i];
            vec2 rotated = vec2(tap.x * cs - tap.y * sn, tap.x * sn + tap.y * cs);
            vec2 uv = vUv + rotated * radius * uTexel;
            float sampleCoc = cocAt(uv, focalBand);
            // Reject depth discontinuities, including thin cables/railings.
            // A non-zero floor here would leak the background through a cable.
            float sampleZ = -viewPosition(uv, rawDepth(uv)).z;
            float depthGuard = 1.0 - smoothstep(max(0.15, centreZ * 0.002),
              max(0.30, centreZ * 0.004), abs(sampleZ - centreZ));
            float weight = clamp(sampleCoc / max(coc, 1e-3), 0.0, 1.0) * depthGuard;
            sum += sanitise(texture2D(tDiffuse, uv).rgb) * weight;
            weightSum += weight;
          }
          gl_FragColor = vec4(sum / weightSum, smoothstep(0.5, 1.5, radius));
        }
      `, {
        tDiffuse: { value: null },
        tDepth: { value: this.sceneTarget.depthTexture },
        uProjInv: { value: new THREE.Matrix4() },
        uProj: { value: new THREE.Matrix4() },
        uNear: { value: 1 },
        uFar: { value: 2000 },
        uTexel: { value: this.dofTarget
          ? new THREE.Vector2(1 / this.dofTarget.width, 1 / this.dofTarget.height)
          : texel.clone() },
        uFocus: { value: 120 },
        uRange: { value: 90 },
        uTerrainFocus: { value: 0 },
        uMaxCoc: { value: 9 },
        uTilt: { value: this.tiltGain },
        uTiltCentre: { value: this.tiltCentre },
        // The sharp stripe covers the central 70%; each outer 15% ramps softly.
        uBandHalf: { value: this.bandHalf },
        uBandSoft: { value: this.bandSoft },
        uBandGain: { value: 0 },
        uFrame: { value: 0 },
      }, { DOF_TAPS: tier.dofTaps });
    }

    if (tier.aa === 'taa') {
      this.taaPass = this._pass(/* glsl */`
        ${COMMON}
        ${DEPTH_COMMON}
        uniform sampler2D tCurrent;
        uniform sampler2D tSharp;
        uniform float uHasDof;
        uniform sampler2D tHistory;
        uniform mat4 uPrevViewProjection;
        uniform mat4 uInvViewProjection;
        uniform vec2 uTexel;
        uniform float uBlend;
        uniform float uValid;
        uniform float uSharpen;
        vec3 resolvedCurrent(vec2 uv) {
          vec4 blurred = texture2D(tCurrent, uv);
          return mix(texture2D(tSharp, uv).rgb, blurred.rgb, uHasDof > 0.5 ? blurred.a : 1.0);
        }
        void main() {
          vec3 current = resolvedCurrent(vUv);
          float depth = rawDepth(vUv);
          // History alpha stores positive view depth, not coverage. Half-float depth
          // preserves metre-scale disocclusions without another target or copy pass.
          float currentZ = -viewZ(depth);
          if (uValid < 0.5) { gl_FragColor = vec4(current, currentZ); return; }
          vec4 world = uInvViewProjection * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
          world /= world.w;
          vec4 prevClip = uPrevViewProjection * world;
          vec2 prevUv = (prevClip.xy / prevClip.w) * 0.5 + 0.5;
          if (prevClip.w <= 0.0 || prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0) {
            gl_FragColor = vec4(current, currentZ);
            return;
          }
          // Neighbourhood clamp: history that cannot exist in this frame is disocclusion.
          // Variance clipping (mean ± γσ over the 3×3) rather than the raw min/max box: the
          // box let a moving container's previous positions survive along its path as a
          // serrated brown trail (R7 t22, "broad brown motion smear") because the crane's
          // yellow and the apron's grey stretched the box wide enough to admit the brown.
          vec3 m1 = vec3(0.0);
          vec3 m2 = vec3(0.0);
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec3 n = resolvedCurrent(vUv + vec2(float(x), float(y)) * uTexel);
              m1 += n;
              m2 += n * n;
            }
          }
          vec3 mu = m1 / 9.0;
          vec3 sigma = sqrt(max(m2 / 9.0 - mu * mu, 0.0));
          vec3 lo = mu - sigma * 1.1;
          vec3 hi = mu + sigma * 1.1;
          vec4 previous = texture2D(tHistory, prevUv);
          // Perspective clip w is the expected previous view depth. Reject the
          // old foreground when current geometry exposes a different surface.
          // Tolerance covers half-float quantisation, not an object's height.
          float depthMatch = 1.0 - step(max(0.025, prevClip.w * 0.0015), abs(previous.a - prevClip.w));
          vec3 history = clamp(previous.rgb, lo, hi);
          float historyWeight = uBlend * depthMatch;
          vec3 colour = mix(current, history, historyWeight);
          // Sharpen the incoming sample, not the accumulated history. Feeding
          // colour back into its own unsharp mask amplified high-contrast edges
          // every stationary frame, producing white rims and black contours.
          // Weight the new detail exactly like the new colour so it converges
          // to one sharpening application, independent of history length.
          if (uSharpen > 0.0) {
            vec3 blur = sanitise(resolvedCurrent(vUv + vec2(uTexel.x, 0.0)))
                      + sanitise(resolvedCurrent(vUv - vec2(uTexel.x, 0.0)))
                      + sanitise(resolvedCurrent(vUv + vec2(0.0, uTexel.y)))
                      + sanitise(resolvedCurrent(vUv - vec2(0.0, uTexel.y)));
${SHARPEN_APPLY}
          }
          gl_FragColor = vec4(colour, currentZ);
        }
      `, {
        tCurrent: { value: null },
        tSharp: { value: null },
        uHasDof: { value: 0 },
        tHistory: { value: null },
        tDepth: { value: this.sceneTarget.depthTexture },
        uProjInv: { value: new THREE.Matrix4() },
        uProj: { value: new THREE.Matrix4() },
        uNear: { value: 1 },
        uFar: { value: 2000 },
        uPrevViewProjection: { value: new THREE.Matrix4() },
        uInvViewProjection: { value: new THREE.Matrix4() },
        uTexel: { value: texel.clone() },
        uBlend: { value: 0.88 },
        uValid: { value: 0 },
        uSharpen: { value: 0.20 },
      });
    }

    // Grade: AgX tonemap, 32³ LUT, vignette, animated grain. Writes display-encoded 8-bit.
    // W5: `?grade=2` swaps in the single-encode, re-exposed grade (board canvas only, never the lab).
    const gradeVariant = this.renderer.domElement?.id === 'lab' ? 1 : readGradeVariant();
    this.gradeVariant = gradeVariant;
    this.gradePass = this._pass(gradeShaderForVariant(/* glsl */`
      precision highp sampler3D;
      ${COMMON}
      uniform sampler2D tDiffuse;
      uniform sampler2D tBloom;
      uniform sampler3D tLut;
      uniform float uExposure;
      uniform float uDebugRaw;
      uniform float uBloomStrength;
      uniform float uVignette;
      uniform float uGrain;
      uniform float uTime;
      uniform float uRain;
      uniform float uRainTime;
      uniform float uRainLen;
      uniform float uLutSize;
      uniform float uHasBloom;
      uniform float uBloomThreshold;
      uniform float uSharpen;
      uniform vec2 uTexel;

      // MS1: one depth tap in the existing grade, including fog-free ocean shaders.
      uniform sampler2D tHorizonDepth;
      uniform vec2 uHorizonCamera;
      uniform vec2 uHorizonRange;
      uniform vec3 uHorizonColor;
      uniform float uHorizonEnabled;
      uniform float uAtmosphere;
      uniform float uAtmosphereOffset;

      // AgX, the reference inset/outset formulation. Warmer mids than ACES, which is what
      // a golden-hour miniature needs — ACES pulls the whole board grey.
      const mat3 AGX_IN = mat3(
        0.8566271533, 0.1373189729, 0.1118982130,
        0.0951212405, 0.7612419906, 0.0767994186,
        0.0482516061, 0.1014390365, 0.8113023684);
      const mat3 AGX_OUT = mat3(
         1.1271005818, -0.1413297635, -0.1413297635,
        -0.1106066431,  1.1578237022, -0.1106066431,
        -0.0164939387, -0.0164939387,  1.2519364066);
      const float AGX_MIN_EV = -12.47393;
      const float AGX_MAX_EV = 4.026069;

      vec3 agxContrast(vec3 x) {
        vec3 x2 = x * x;
        vec3 x4 = x2 * x2;
        return + 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x
               + 0.4298 * x2 + 0.1191 * x - 0.00232;
      }

      vec3 agx(vec3 colour) {
        colour = AGX_IN * max(colour, vec3(0.0));
        colour = clamp(log2(max(colour, 1e-10)), AGX_MIN_EV, AGX_MAX_EV);
        colour = (colour - AGX_MIN_EV) / (AGX_MAX_EV - AGX_MIN_EV);
        colour = agxContrast(colour);
        colour = AGX_OUT * colour;
        return clamp(colour, 0.0, 1.0);
      }

      vec3 srgbEncode(vec3 c) {
        return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(0.41666)) - 0.055,
                   step(vec3(0.0031308), c));
      }

      // Rain read for the wet states: thin slanted streaks in two screen-space layers, drawn
      // after the scene so nothing floats in the world and TAA never ghosts them. Dry frames
      // skip it entirely (uRain = 0). Returns coverage in 0..~0.8.
      float rainStreaks(vec2 px, float t) {
        float acc = 0.0;
        for (int i = 0; i < 2; i++) {
          float f = float(i);
          float colW = 46.0 + 30.0 * f;
          vec2 q = vec2(px.x + px.y * 0.16, px.y);
          float id = floor(q.x / colW);
          float h1 = hash12(vec2(id, 11.0 + f * 29.0));
          float h2 = hash12(vec2(id, 53.0 + f * 7.0));
          float dx = abs((q.x - id * colW) - colW * (0.2 + 0.6 * h1));
          float speed = 780.0 + 520.0 * h2 - 160.0 * f;
          float period = 600.0 + 500.0 * h1;
          float len = (54.0 + 46.0 * h2) * uRainLen;
          float y = mod(q.y + t * speed + h1 * 997.0, period);
          float tail = clamp(1.0 - y / len, 0.0, 1.0);
          acc += tail * tail * (1.0 - smoothstep(0.6, 1.5, dx)) * (0.55 - 0.2 * f);
        }
        return acc * (0.5 + 0.5 * uRainLen);
      }

      void main() {
        vec3 colour = sanitise(texture2D(tDiffuse, vUv).rgb);
        // P19 X1C: bloom + vignette + grade in this pass. Sharpen lives on TAA.
        if (uHasBloom > 0.5) {
          vec3 bloomAcc = vec3(0.0);
          float bloomW = 0.0;
          vec2 wide = uTexel * 5.5;
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              if (x == 0 && y == 0) continue;
              vec3 s = sanitise(texture2D(tDiffuse, vUv + vec2(float(x), float(y)) * wide).rgb);
              float brightness = max(s.r, max(s.g, s.b)) * uExposure;
              float contrib = max(brightness - uBloomThreshold, 0.0);
              bloomAcc += s * contrib;
              bloomW += contrib;
            }
          }
          colour += bloomAcc * uBloomStrength * (bloomW > 0.0 ? 0.18 : 0.0);
        }
        // Diagnostic tap, default off. Outputs the linear buffer the grade RECEIVES,
        // sRGB-encoded and nothing else, so "what the scene looks like" can be separated
        // from "what the transfer does to it" without disabling the chain (which also
        // removes DOF, AO and TAA and therefore compares two different images).
        // Four rounds of this programme argued about which stage caused a washed frame
        // using ablations that turned out to be no-ops; this settles it in one capture.
        if (uDebugRaw > 0.5) {
          gl_FragColor = vec4(srgbEncode(clamp(colour, 0.0, 1.0)), 1.0);
          return;
        }
        float horizonDepth = texture2D(tHorizonDepth, vUv).x;
        float horizonDistance = uHorizonCamera.x * uHorizonCamera.y /
          (uHorizonCamera.y - horizonDepth * (uHorizonCamera.y - uHorizonCamera.x));
        // The focal block remains in the near band at strategic zoom. Using raw
        // camera distance made the entire opening city fully hazed at 212m.
        float atmosphereDistance = max(0.0, horizonDistance - uAtmosphereOffset);
        if (uHorizonEnabled > 0.5) {
          // Clear depth belongs to the matching procedural sky, never a flat fog fill.
          if (horizonDepth < 1.0) {
            float horizonAmount = smoothstep(uHorizonRange.x, uHorizonRange.y, horizonDistance);
            if (horizonAmount > 0.0) colour = mix(colour, uHorizonColor, horizonAmount);
          }
        }
        colour = agx(colour * uExposure * (uAtmosphere > 0.0 ? ${GRADE_TRANSFER.exposureTrim.toFixed(3)} : 1.0));

        // 32³ LUT, hardware trilinear, half-texel corrected.
        float scale = (uLutSize - 1.0) / uLutSize;
        float offset = 1.0 / (2.0 * uLutSize);
        colour = texture(tLut, clamp(colour, 0.0, 1.0) * scale + offset).rgb;

        // R9: reuse resolved scene depth, including water; never filter a neighbour.
        // Limit haze energy lift to protect R8 open planes while dissolving far chroma.
        if (uAtmosphere > 0.0 && horizonDepth < 1.0) {
          float distanceT = smoothstep(${R9_ATMOS.nearM.toFixed(1)}, ${R9_ATMOS.cityFarM.toFixed(1)}, atmosphereDistance);
          float haze = ${R9_ATMOS.cityHaze} * distanceT + ${R9_ATMOS.boardHaze - R9_ATMOS.cityHaze} *
            smoothstep(${R9_ATMOS.cityFarM.toFixed(1)}, ${R9_ATMOS.boardFarM.toFixed(1)}, atmosphereDistance);
          haze = clamp(haze + (hash12(gl_FragCoord.xy + uTime) - 0.5) / 1024.0 * distanceT, 0.0, ${R9_ATMOS.boardHaze});
          haze *= uAtmosphere;
          float nearWeight = (1.0 - distanceT) * uAtmosphere;
          colour *= 1.0 + (${R9_ATMOS.nearContrast} - 1.0) * nearWeight * (luma(colour) - 0.38);
          colour = mix(vec3(luma(colour)), colour, mix(${R9_ATMOS.nearSaturation.toFixed(1)}, ${R9_ATMOS.saturation}, distanceT * uAtmosphere));
          vec3 hazeTint = vec3(${R9_ATMOS.hazeTint.join(', ')});
          hazeTint *= luma(colour) * ${R9_ATMOS.hazeLumaLift} / luma(hazeTint);
          colour = mix(colour, hazeTint, haze);
          // P23: continuous aerial perspective, zero below 90m and full at 150m.
          // Preserve local luma while removing chroma, then lift it toward sky haze.
          float photoDistance = smoothstep(${P23_LIGHT_PHOTO.photoHazeNearM.toFixed(1)}, ${P23_LIGHT_PHOTO.photoHazeFarM.toFixed(1)}, atmosphereDistance);
          photoDistance = clamp(photoDistance + (hash12(gl_FragCoord.xy + uTime) - 0.5) / 1024.0 * photoDistance, 0.0, 1.0) * uAtmosphere;
          colour = mix(colour, vec3(luma(colour)), ${P23_LIGHT_PHOTO.photoHazeDesaturation} * photoDistance);
          colour *= 1.0 + ${P23_LIGHT_PHOTO.photoHazeLift} * photoDistance;
          // C1-continuous rational shoulder; midtones and R8 shadow floor stay intact.
          vec3 excess = max(colour - ${R9_ATMOS.shoulderStart.toFixed(2)}, vec3(0.0));
          colour -= uAtmosphere * excess * excess / (excess + ${R9_ATMOS.shoulderRange.toFixed(2)});
        }

        vec2 centred = vUv - 0.5;
        float vignette = 1.0 - uVignette * dot(centred, centred) * 1.8;
        colour *= clamp(vignette, 0.0, 1.0);

        if (uGrain > 0.0) {
          float n = hash12(gl_FragCoord.xy + uTime) - 0.5;
          // §7.7's 0.015 amplitude is kept, but shaped like real film: grain lives in the
          // mids and dies in both the toe and the shoulder. Flat at 0.015 it was the most
          // visible thing on the near-black table the board sits on.
          float l = luma(colour);
          float shape = smoothstep(0.0, 0.13, l) * (1.0 - 0.55 * l);
          colour += n * uGrain * shape;
        }

        if (uRain > 0.0) {
          // Wet-weather grade: 14% less chroma at the rain level of 0.8. TASTE_RAIN.desaturate is 8% on the grade alone;
          // the rest closes the gate's rain/clear saturation ratio (0.88-0.96) that the sea and the lamps lift. Hue untouched.
          colour = mix(vec3(luma(colour)), colour, 1.0 - 0.18 * uRain);
          colour = mix(colour, vec3(0.80, 0.84, 0.88), clamp(rainStreaks(gl_FragCoord.xy, uRainTime) * 0.55 * uRain, 0.0, 0.5));
        }

        vec3 display = srgbEncode(clamp(${GRADE_TRANSFER.encodeGamma === 1 ? 'colour' : `pow(max(colour, vec3(0.0)), vec3(${GRADE_TRANSFER.encodeGamma.toFixed(3)}))`}, 0.0, 1.0));
        if (uAtmosphere > 0.0 && horizonDepth < 1.0) {
          // W4-C transfer (GRADE_TRANSFER): a toe that deepens the lifted darks and a soft shoulder
          // that stops sunlit horizontals clipping, both on the max channel so hue holds.
          float gMax = max(max(display.r, display.g), display.b);
          float toed = ${GRADE_TRANSFER.toe.strength > 0
    ? `gMax < ${GRADE_TRANSFER.toe.knee.toFixed(3)}
            ? ${GRADE_TRANSFER.toe.knee.toFixed(3)} * pow(gMax / ${GRADE_TRANSFER.toe.knee.toFixed(3)}, ${(1 + GRADE_TRANSFER.toe.strength).toFixed(3)})
            : gMax`
    : 'gMax'};
          float shoulderEx = max(toed - ${GRADE_TRANSFER.shoulder.start.toFixed(3)}, 0.0);
          float rolled = min(toed, ${GRADE_TRANSFER.shoulder.start.toFixed(3)})
            + ${GRADE_TRANSFER.shoulder.range.toFixed(3)} * (1.0 - exp(-shoulderEx / ${GRADE_TRANSFER.shoulder.range.toFixed(3)}));
          display *= rolled / max(gMax, 0.00001);
        }
        // TONE-CONTRAST: grade resolved display luma, retaining hue and the dark toe.
        // Full strength below 90m; the existing aerial perspective owns >=150m.
        if (uAtmosphere > 0.0 && horizonDepth < 1.0) {
          float toneWeight = (1.0 - smoothstep(${P23_LIGHT_PHOTO.photoHazeNearM.toFixed(1)}, ${P23_LIGHT_PHOTO.photoHazeFarM.toFixed(1)}, atmosphereDistance)) * uAtmosphere;
          float toneLuma = luma(display);
          float toneValue = ${P23_LIGHT_PHOTO.toneOutput[0].toFixed(1)};
          ${P23_LIGHT_PHOTO.toneInput.slice(1).map((hi, i) => `toneValue += ${(P23_LIGHT_PHOTO.toneOutput[i + 1] - P23_LIGHT_PHOTO.toneOutput[i]).toFixed(1)} * clamp((toneLuma * 255.0 - ${P23_LIGHT_PHOTO.toneInput[i].toFixed(1)}) / ${(hi - P23_LIGHT_PHOTO.toneInput[i]).toFixed(1)}, 0.0, 1.0);`).join('\n          ')}
          vec3 toned = display * (toneValue / 255.0) / max(toneLuma, 0.00001);
          toned = mix(vec3(luma(toned)), toned, ${P23_LIGHT_PHOTO.toneSaturation.toFixed(2)});
          // The olive/green family shares a ceiling so grass cannot turn neon.
          if (toned.g > toned.r && toned.g > toned.b) {
            float greenSat = (toned.g - min(toned.r, toned.b)) / max(toned.g, 0.00001);
            float greenMin = toned.g * (1.0 - ${P23_LIGHT_PHOTO.toneGreenSaturationMax.toFixed(2)});
            if (greenSat > ${P23_LIGHT_PHOTO.toneGreenSaturationMax.toFixed(2)}) toned = max(toned, vec3(greenMin));
          }
          toned = max(toned, vec3(0.0));
          toned *= min(1.0, ${P23_LIGHT_PHOTO.toneHighlightMax.toFixed(3)} / max(max(toned.r, toned.g), max(toned.b, 0.00001)));
          display = mix(display, toned, toneWeight);
        }
        gl_FragColor = vec4(display, 1.0);
      }
    `, gradeVariant), {
      ...(gradeVariant === 2 ? {
        uG2A: { value: new THREE.Vector4(GRADE_2.exposure, GRADE_2.black, GRADE_2.contrast.gamma, GRADE_2.contrast.pivot) },
        uG2B: { value: new THREE.Vector4(GRADE_2.shoulder.start, GRADE_2.shoulder.range, GRADE_2.saturation, GRADE_2.cap) },
      } : {}),
      ...(gradeVariant === 3 ? (() => {
        const g3 = parseGrade3Overrides(typeof location === 'undefined' ? '' : location.search);
        return {
          uG3A: { value: new THREE.Vector4(g3.shoulder.start, g3.shoulder.range, g3.saturation, g3.cap) },
          uG3Sky: { value: g3.skyGain },
          uG3Exp: { value: g3.exposure },
          uG3N: { value: new THREE.Vector2(g3.neutralCap, 0.14) },
        };
      })() : {}),
      tDiffuse: { value: null },
      tBloom: { value: null },
      tLut: { value: this.lut },
      tHorizonDepth: { value: this.sceneTarget.depthTexture },
      uHorizonCamera: { value: new THREE.Vector2(1, 2000) },
      uHorizonRange: { value: new THREE.Vector2(600, 1200) },
      uHorizonColor: { value: new THREE.Color() },
      uHorizonEnabled: { value: 0 },
      uAtmosphere: { value: this.renderer.domElement?.id === 'lab' ? 0 : 1 },
      uAtmosphereOffset: { value: 0 },
      uExposure: { value: this.exposure },
      uDebugRaw: { value: 0 },
      uBloomStrength: { value: this.bloomStrength },
      uVignette: { value: this.vignette },
      uGrain: { value: this.reducedMotion ? this.grainAmount * 0.5 : this.grainAmount },
      uTime: { value: 0 },
      uRain: { value: 0 },
      uRainTime: { value: 0 },
      uRainLen: { value: 1 },
      uLutSize: { value: LUT_SIZE },
      uHasBloom: { value: tier.bloom ? 1 : 0 },
      uBloomThreshold: { value: this.bloomThreshold },
      // Sharpen moved onto the TAA pass (P19 X1C). MSAA + TAA carry the edge.
      uSharpen: { value: 0 },
      uTexel: { value: texel.clone() },
    });

    // P19 X1C: spatial AA folded — 4× MSAA scene target + TAA + sharpen. Grade
    // presents to the canvas so the chain stays at ≤ 5 FullScreenPasses.
    this.aaPass = null;
  }

  // ---------------------------------------------------------------- runtime

  /**
   * ── P16-W6 PROTOTYPE B: the SSR pass. ──
   *
   * Built lazily by `setSsr(true)`. One pass, reading the post-GTAO colour and
   * the scene depth, writing a full-resolution target that becomes `current`
   * for DOF and TAA — so it sits after GTAO and before TAA, and no existing
   * pass is edited.
   *
   * The water mask is the ocean's OWN depth bake, handed down through
   * `frame.water`: r = column depth / max, g = waterness, at a world XZ derived
   * from the depth buffer. A mask reconstructed from the depth buffer alone
   * would need a height band around the still-water plane, and the beach, the
   * apron and every flat roof at that height come with it. Both tests are
   * applied — the bake says "this XZ is sea", the height band says "this pixel
   * is the surface and not the bed seen through it".
   *
   * The ripple has to be re-derived here, because the ocean's normal never
   * reaches the depth buffer: the sheet's ripple is a shading term, so the
   * reconstructed normal is the swell only. That duplication is the honest cost
   * of doing this in screen space and it is written down rather than hidden.
   *
   * "Half resolution" is the MARCH STRIDE, not a half-size target: a half-res
   * target would need an upsample-and-composite pass to get back to full
   * resolution, and the brief allows one new pass.
   */
  _buildSsr() {
    if (this.ssrPass) return;
    const type = this.tier.halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.ssrTarget = makeTarget(this.width, this.height, { type, name: 'dd-ssr' });
    this.targets.push(this.ssrTarget);
    this.ssrPass = this._pass(/* glsl */`
      ${COMMON}
      ${DEPTH_COMMON}
      uniform sampler2D tDiffuse;
      uniform sampler2D tWaterDepth;
      uniform vec2  uTexel;
      uniform mat4  uInvView;
      uniform vec2  uWaterOrigin;
      uniform float uWaterSpan;
      uniform float uWaterMaxDepth;
      uniform float uWaterY;
      uniform float uHasWater;
      uniform float uTime;
      uniform float uStrength;

      float ssrValueNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash12(i);
        float b = hash12(i + vec2(1.0, 0.0));
        float c = hash12(i + vec2(0.0, 1.0));
        float d = hash12(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      void main() {
        vec3 base = sanitise(texture2D(tDiffuse, vUv).rgb);
        float depth = rawDepth(vUv);
        if (uHasWater < 0.5 || depth >= 1.0) { gl_FragColor = vec4(base, 1.0); return; }
        vec3 P = viewPosition(vUv, depth);
        vec4 worldH = uInvView * vec4(P, 1.0);
        vec3 world = worldH.xyz / worldH.w;
        // Height band first: it is one subtraction and it rejects most of the frame.
        float band = 1.0 - smoothstep(0.0, ${SSR.band.toFixed(2)}, abs(world.y - uWaterY));
        if (band <= 0.004) { gl_FragColor = vec4(base, 1.0); return; }
        vec2 duv = (world.xz - uWaterOrigin) / max(uWaterSpan, 1.0);
        // Positive-form window: a NaN fails every comparison and leaves the pixel alone.
        if (!(duv.x >= 0.0 && duv.x <= 1.0 && duv.y >= 0.0 && duv.y <= 1.0)) {
          gl_FragColor = vec4(base, 1.0); return;
        }
        vec4 packed = texture2D(tWaterDepth, duv);
        float mask = band * packed.g * smoothstep(0.05, 0.60, packed.r * uWaterMaxDepth);
        if (mask <= 0.004) { gl_FragColor = vec4(base, 1.0); return; }

        // World up in view space. uInvView is the camera's matrixWorld, whose
        // rotation is orthonormal, so its ROWS are the world axes expressed in
        // view space: row 1 is world up, row 0 world X, row 2 world Z.
        vec3 upView = normalize(vec3(uInvView[0][1], uInvView[1][1], uInvView[2][1]));
        vec2 rp = world.xz / ${SSR.rippleM.toFixed(2)} + vec2(uTime * 0.21, -uTime * 0.13);
        float e = 0.22;
        float n0 = ssrValueNoise(rp);
        vec2 slope = vec2(
          ssrValueNoise(rp + vec2(e, 0.0)) - n0,
          ssrValueNoise(rp + vec2(0.0, e)) - n0
        ) * ${(SSR.rippleAmp * 12.0).toFixed(3)};
        // Tangent frame on the water plane, in view space, from the world axes.
        vec3 xView = normalize(vec3(uInvView[0][0], uInvView[1][0], uInvView[2][0]));
        vec3 zView = normalize(vec3(uInvView[0][2], uInvView[1][2], uInvView[2][2]));
        vec3 N = normalize(upView - xView * slope.x - zView * slope.y);
        vec3 V = normalize(-P);
        vec3 R = reflect(-V, N);

        float stride = ${SSR.step0.toFixed(3)};
        vec3 pos = P;
        vec3 hit = vec3(0.0);
        float found = 0.0;
        vec2 hitUv = vUv;
        for (int i = 0; i < ${SSR.steps}; i += 1) {
          pos += R * stride;
          stride *= ${SSR.growth.toFixed(3)};
          vec4 clip = uProj * vec4(pos, 1.0);
          if (clip.w <= 0.0) break;
          vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
          if (!(uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0)) break;
          float sceneZ = viewZ(rawDepth(uv));
          // View z is negative in front, so DISTANCE is -z. The ray has passed
          // behind the surface when its distance exceeds the surface's, i.e.
          // when sceneZ - pos.z is POSITIVE, and the overshoot has to be inside
          // the thickness or a ray slips behind a thin gantry leg and calls it
          // a hit. (The first cut had this comparison the wrong way round and
          // the pass returned almost no hits at all, which reads exactly like
          // an SSR that cannot see the quay.)
          float delta = sceneZ - pos.z;
          if (delta > 0.0 && delta < ${SSR.thickness.toFixed(2)}) {
            // One bisection refine, so the hit lands on the surface and not on
            // the far side of the stride that found it.
            vec3 lo = pos - R * stride / ${SSR.growth.toFixed(3)};
            vec3 mid = mix(lo, pos, 0.5);
            vec4 mclip = uProj * vec4(mid, 1.0);
            vec2 muv = mclip.xy / mclip.w * 0.5 + 0.5;
            if (muv.x >= 0.0 && muv.x <= 1.0 && muv.y >= 0.0 && muv.y <= 1.0) {
              float mz = viewZ(rawDepth(muv));
              if (mz - mid.z > 0.0 && mz - mid.z < ${SSR.thickness.toFixed(2)}) uv = muv;
            }
            hitUv = uv;
            hit = sanitise(texture2D(tDiffuse, uv).rgb);
            found = 1.0;
            break;
          }
        }
        // Edge fade, so a ray that runs off the frame releases instead of
        // smearing the last column of pixels down the whole basin.
        vec2 edge = smoothstep(vec2(0.0), vec2(${SSR.edgeFade.toFixed(3)}), hitUv)
          * (1.0 - smoothstep(vec2(1.0 - ${SSR.edgeFade.toFixed(3)}), vec2(1.0), hitUv));
        float fade = found * min(edge.x, edge.y);
        // Fresnel on the reconstructed normal, same shape the ocean shader uses.
        float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
        float w = mask * fade * uStrength * mix(0.45, 1.0, fres);
        gl_FragColor = vec4(mix(base, hit, clamp(w, 0.0, 1.0)), 1.0);
      }
    `, {
      tDiffuse: { value: null },
      tDepth: { value: this.sceneTarget.depthTexture },
      tWaterDepth: { value: null },
      uTexel: { value: new THREE.Vector2(1 / this.width, 1 / this.height) },
      uProj: { value: new THREE.Matrix4() },
      uProjInv: { value: new THREE.Matrix4() },
      uInvView: { value: new THREE.Matrix4() },
      uNear: { value: 1 },
      uFar: { value: 1000 },
      uWaterOrigin: { value: new THREE.Vector2() },
      uWaterSpan: { value: 1 },
      uWaterMaxDepth: { value: 9 },
      uWaterY: { value: 0.02 },
      uHasWater: { value: 0 },
      uTime: { value: 0 },
      uStrength: { value: SSR.strength },
    });
  }

  setSize(width, height) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this._disposeTargets();
    this._buildTargets();
    this._rebindTargets();
  }

  /** Passes hold texture references; after a resize they all point at dead targets. */
  _rebindTargets() {
    // P16-W6 prototype B: its target and depth binding follow every resize the
    // same way the rest of the chain does. Nothing else here is touched.
    if (this.ssrPass) {
      this.ssrPass.material.uniforms.tDepth.value = this.sceneTarget.depthTexture;
      this.ssrPass.material.uniforms.uTexel.value.set(1 / this.width, 1 / this.height);
      if (!this.ssrTarget) {
        const ssrType = this.tier.halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
        this.ssrTarget = makeTarget(this.width, this.height, { type: ssrType, name: 'dd-ssr' });
        this.targets.push(this.ssrTarget);
      }
    }
    const texel = new THREE.Vector2(1 / this.width, 1 / this.height);
    if (this.aoPass) {
      this.aoPass.material.uniforms.tDepth.value = this.sceneTarget.depthTexture;
      if (this._residentialDepthTarget) {
        this.aoPass.material.uniforms.tDepth.value = this._residentialDepthTarget.depthTexture;
      }
      this.aoPass.material.uniforms.uTexel.value.copy(texel);
      if (this.aoApplyPass) {
        this.aoApplyPass.material.uniforms.tDiffuse.value = this.sceneTarget.texture;
        this.aoApplyPass.material.uniforms.tAo.value = this.aoTarget.texture;
        if (this.foliageMaskTarget) {
          this.aoApplyPass.material.uniforms.tFoliageMask.value = this.foliageMaskTarget.texture;
        }
        for (const maskMaterial of this._foliageMaskMaterials?.values() ?? []) {
          maskMaterial.uniforms.tSceneDepth.value = this.sceneTarget.depthTexture;
          maskMaterial.uniforms.uResolution.value.set(this.width, this.height);
        }
        this.aoApplyPass.material.uniforms.tDepth.value = this.sceneTarget.depthTexture;
        this.aoApplyPass.material.uniforms.uAoTexel.value.set(
          1 / this.aoTarget.width, 1 / this.aoTarget.height,
        );
      }
    }
    if (this.dofPass) {
      this.dofPass.material.uniforms.tDepth.value = this.sceneTarget.depthTexture;
      this.dofPass.material.uniforms.uTexel.value.set(
        1 / this.dofTarget.width, 1 / this.dofTarget.height,
      );
    }
    if (this.taaPass) {
      this.taaPass.material.uniforms.tDepth.value = this.sceneTarget.depthTexture;
      this.taaPass.material.uniforms.uTexel.value.copy(texel);
    }
    if (this.aaPass?.material.uniforms.uTexel) {
      this.aaPass.material.uniforms.uTexel.value.copy(texel);
    }
    this.gradePass.material.uniforms.uTexel.value.copy(texel);
    this._historyValid = false;
  }

  setGrade(grade) {
    if (this.lut) this.lut.dispose();
    this.lut = bakeGradeLut(grade);
    this.gradePass.material.uniforms.tLut.value = this.lut;
    if (grade?.exposure) {
      this.exposure = BASE_EXPOSURE * grade.exposure
        * (this._playExposureMul ?? P1_LIGHT.playMidtoneLift)
        * ENVIRONMENT_EXPOSURE_COMPENSATION;
      this.gradePass.material.uniforms.uExposure.value = this.exposure;
      if (this.gradePass?.material?.uniforms?.uBloomThreshold) {
        this.gradePass.material.uniforms.uExposure.value = this.exposure;
      }
    }
  }

  setReducedMotion(on) {
    this.reducedMotion = Boolean(on);
    // Grain stays, but it stops animating; DOF breathing, the AO/bokeh dither rotation and
    // the TAA jitter all pin, so a reduced-motion frame is reproducible.
    this.gradePass.material.uniforms.uGrain.value = this.reducedMotion
      ? this.grainAmount * 0.5 : this.grainAmount;
    this._historyValid = false;
  }

  /**
   * The rotation handed to the AO and bokeh dithers. It advances per frame so the temporal
   * resolve can average the estimator's noise away — but under prefers-reduced-motion a
   * rotating dither is a full-screen animated pass in its own right, so it is pinned and
   * the frame becomes reproducible. Round 1 froze the grain and the DOF breathing and left
   * this moving, which left 234k pixels changing between two otherwise identical frames.
   */
  _ditherPhase() {
    return this.reducedMotion ? 0 : this.frameIndex % 64;
  }

  /** Apply the TAA sub-pixel jitter. Must be called after the rig has posed the camera. */
  _applyJitter(camera) {
    if (this.tier.aa !== 'taa') return false;
    // A rotating sub-pixel jitter is sub-pixel shimmer on an otherwise still frame, which is
    // exactly what prefers-reduced-motion asks us not to do. Pinned, the temporal stage
    // becomes a stable smoother and 4x MSAA plus the SMAA pass carry the edges alone.
    const phase = this.reducedMotion ? 0 : this.frameIndex % TAA_JITTER.length;
    const [jx, jy] = TAA_JITTER[phase];
    // Amplitude below a full pixel: a whole-pixel spread resolves cleaner edges but costs
    // more real detail than this board, which is mostly flat colour, can spare.
    const amplitude = 0.62;
    this._savedProjection.copy(camera.projectionMatrix);
    camera.projectionMatrix.elements[8] += (jx * amplitude * 2) / this.width;
    camera.projectionMatrix.elements[9] += (jy * amplitude * 2) / this.height;
    this._jitter.set(jx, jy);
    return true;
  }

  _clearJitter(camera, applied) {
    if (!applied) return;
    camera.projectionMatrix.copy(this._savedProjection);
  }

  _updateDepthUniforms(pass, camera) {
    const uniforms = pass.material.uniforms;
    uniforms.uProj.value.copy(camera.projectionMatrix);
    uniforms.uProjInv.value.copy(camera.projectionMatrixInverse);
    uniforms.uNear.value = camera.near;
    uniforms.uFar.value = camera.far;
  }

  /**
   * Compose one frame.
   * @param {THREE.Scene} scene
   * @param {THREE.PerspectiveCamera} camera
   * @param {object} frame { elapsed, focusDistance, sunDirection, dofScale, accumulate }
   */
  render(scene, camera, frame = {}) {
    const renderer = this.renderer;
    if (!this.enabled) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }
    const accumulate = Math.max(1, Math.floor(frame.accumulate ?? 1));
    const elapsed = frame.elapsed ?? 0;

    for (let sub = 0; sub < accumulate; sub += 1) {
      this._composeOnce(scene, camera, frame, elapsed, sub === accumulate - 1);
    }
  }

  _composeOnce(scene, camera, frame, elapsed, present) {
    const renderer = this.renderer;
    const tier = this.tier;

    // 1. Scene into the half-float linear target.
    const jittered = this._applyJitter(camera);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    renderer.setRenderTarget(this.sceneTarget);
    renderer.render(scene, camera);
    if (this._residentialDepthTarget) {
      // Resolve depth with the same jittered camera but without touching the scene's live
      // materials. This extra pass exists only for the residential fidelity lab, where the
      // MSAA depth attachment is not sampler-reliable on the capture backend.
      const previousOverride = scene.overrideMaterial;
      scene.overrideMaterial = this._residentialDepthMaterial;
      renderer.setRenderTarget(this._residentialDepthTarget);
      renderer.clear(true, true, true);
      renderer.render(scene, camera);
      scene.overrideMaterial = previousOverride;
      renderer.setRenderTarget(this.sceneTarget);
    }
    let current = this.sceneTarget;
    if (!present && this.taaPass === undefined) {
      // Nothing downstream of the scene pass accumulates, so a non-presented sub-frame
      // has no work left to do.
      this._clearJitter(camera, jittered);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      this.frameIndex += 1;
      return;
    }

    // 2/3. GTAO + screen-space contact shadows.
    if (this.aoPass) {
      // X8B: retain GTAO, but skip the contact march at board altitude.
      this.aoPass.material.uniforms.uContactLength.value = camera.position.y >= 210
        ? 0 : this.contactLength;
      this._updateDepthUniforms(this.aoPass, camera);
      const sun = frame.sunDirection;
      if (sun) {
        this._sunViewDirection.copy(sun).transformDirection(camera.matrixWorldInverse);
        this.aoPass.material.uniforms.uSunView.value.copy(this._sunViewDirection);
      }
      // World up in view space, for the ground-facing AO bias (see the pass shader).
      this.aoPass.material.uniforms.uUpView.value.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
      if (GROUND_CREASE.on) {
        this.aoPass.material.uniforms.uCamWorld.value.copy(camera.matrixWorld);
        this.aoPass.material.uniforms.uBoardExtent.value.set(frame.boardExtent?.x ?? this.boardExtent.x, frame.boardExtent?.z ?? this.boardExtent.z);
        if (CREASE_VENUES.on) {
          const slots = this.aoPass.material.uniforms.uVenues.value;
          for (let i = 0; i < slots.length; i += 1) {
            const r = this.venueRegions[i];
            if (r) slots[i].set(r.x, r.y, r.z, r.w); else slots[i].set(1e9, 1e9, -1e9, -1e9);
          }
        }
      }
      this.aoPass.material.uniforms.uFrame.value = this._ditherPhase();
      this._renderFoliageMask(renderer, camera);
      this.aoPass.render(renderer, this.aoTarget);

      this._updateDepthUniforms(this.aoApplyPass, camera);
      const water = frame.water;
      const waterAo = this.aoApplyPass.material.uniforms;
      waterAo.uHasWater.value = water?.depthMap ? 1 : 0;
      this.aoApplyPass.material.uniforms.tDiffuse.value = current.texture;
      this.aoApplyPass.render(renderer, this.litTarget);
      current = this.litTarget;
    }

    // 3b. P16-W6 PROTOTYPE B: screen-space reflection over water pixels.
    // After GTAO (it reads the lit buffer) and before DOF/TAA (so the blur and
    // the temporal resolve treat the reflection as part of the image). Off by
    // default; when off, `current` is untouched and this branch is one boolean.
    if (this.ssrEnabled && this.ssrPass && this.ssrTarget) {
      const water = frame.water ?? null;
      const u = this.ssrPass.material.uniforms;
      this._updateDepthUniforms(this.ssrPass, camera);
      u.tDiffuse.value = current.texture;
      u.uInvView.value.copy(camera.matrixWorld);
      u.uTime.value = this.reducedMotion ? 0 : elapsed;
      u.uStrength.value = SSR.strength;
      if (water?.depthMap) {
        u.tWaterDepth.value = water.depthMap;
        u.uWaterOrigin.value.set(water.originX, water.originZ);
        u.uWaterSpan.value = water.span;
        u.uWaterMaxDepth.value = water.maxDepth;
        u.uWaterY.value = water.waterY;
        u.uHasWater.value = 1;
      } else {
        u.uHasWater.value = 0;
      }
      this.ssrPass.render(renderer, this.ssrTarget);
      current = this.ssrTarget;
    }

    // 4. Bloom is folded into the grade pass (P19 X1C).
    const bloomTexture = null;

    // 5. Tilt-shift depth of field.
    const sharpTexture = current.texture;
    if (this.dofPass) {
      this._updateDepthUniforms(this.dofPass, camera);
      const published = camera.userData.dofFocus;
      const focus = published?.focusDistance ?? frame.focusDistance ?? this.focusDistance;
      const uniforms = this.dofPass.material.uniforms;
      uniforms.tDiffuse.value = current.texture;
      uniforms.uFocus.value = focus;
      uniforms.uRange.value = published?.focalRange ?? Math.max(16, focus);
      uniforms.uTerrainFocus.value = published?.terrainFocus ? 1 : 0;
      // CoC and texel offsets are in final canvas pixels, never half-res pixels.
      uniforms.uMaxCoc.value = effectiveDofRadius(this.dofStrength, frame.dofScale);
      uniforms.uTexel.value.set(1 / renderer.domElement.width, 1 / renderer.domElement.height);
      uniforms.uTilt.value = 0;
      uniforms.uTiltCentre.value = 0.5;
      uniforms.uBandHalf.value = 0.35;
      uniforms.uBandSoft.value = 0.15;
      uniforms.uBandGain.value = 1;
      uniforms.uFrame.value = this._ditherPhase();
      this.dofPass.render(renderer, this.dofTarget);
      current = this.dofTarget;
    }

    // 8a. TAA runs on the linear buffer, before the grade, so the grain it would otherwise
    // smear is applied afterwards and stays crisp.
    if (this.taaPass) {
      this._viewProjection.multiplyMatrices(
        jittered ? this._savedProjection : camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      const uniforms = this.taaPass.material.uniforms;
      uniforms.tCurrent.value = current.texture;
      uniforms.tSharp.value = sharpTexture;
      uniforms.uHasDof.value = this.dofPass ? 1 : 0;
      uniforms.tHistory.value = this._historyRead.texture;
      uniforms.uInvViewProjection.value.copy(this._viewProjection).invert();
      uniforms.uPrevViewProjection.value.copy(this._prevViewProjection);
      uniforms.uValid.value = this._historyValid ? 1 : 0;
      this._updateDepthUniforms(this.taaPass, camera);
      this.taaPass.render(renderer, this._historyWrite);
      current = this._historyWrite;
      const swap = this._historyRead;
      this._historyRead = this._historyWrite;
      this._historyWrite = swap;
      this._prevViewProjection.copy(this._viewProjection);
      this._historyValid = true;
    }

    this._clearJitter(camera, jittered);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

    if (!present) {
      this.frameIndex += 1;
      renderer.setRenderTarget(null);
      return;
    }

    // 6/7. Grade, vignette, grain, in-shader bloom — present to the canvas.
    const gradeUniforms = this.gradePass.material.uniforms;
    const haze = frame.horizonHaze;
    gradeUniforms.tHorizonDepth.value = this.sceneTarget.depthTexture;
    gradeUniforms.uHorizonCamera.value.set(camera.near, camera.far);
    gradeUniforms.uAtmosphereOffset.value = Math.max(0,
      (frame.focusDistance ?? this.focusDistance) - R9_ATMOS.nearM);
    gradeUniforms.uHorizonEnabled.value = haze ? 1 : 0;
    if (haze) {
      gradeUniforms.uHorizonRange.value.set(haze.near, haze.far);
      gradeUniforms.uHorizonColor.value.copy(haze.color).multiplyScalar(haze.intensity);
    }
    gradeUniforms.tDiffuse.value = current.texture;
    gradeUniforms.tBloom.value = bloomTexture ?? current.texture;
    gradeUniforms.uHasBloom.value = this.tier.bloom ? 1 : 0;
    gradeUniforms.uTime.value = this.reducedMotion ? 0 : (elapsed * 60) % 1024;
    // Rain streaks: 0 when dry. Reduced motion keeps a still, faint set instead of falling lines.
    gradeUniforms.uRain.value = Math.max(0, Math.min(1, Number(this.rain) || 0)) * (this.reducedMotion ? 0.5 : 1);
    gradeUniforms.uRainTime.value = this.reducedMotion ? 0 : (elapsed % 600);
    camera.getWorldDirection(this._rainDirection);
    const rainDistance = this._rainDirection.y < -1e-6
      ? -camera.matrixWorld.elements[13] / this._rainDirection.y : Infinity;
    gradeUniforms.uRainLen.value = rainStreakScale(rainDistance);
    this.gradePass.render(renderer, null);
    renderer.setRenderTarget(null);
    this.frameIndex += 1;
  }

  /** Bytes held by every target and texture this chain owns. */
  textureBytes() {
    let bytes = 0;
    for (const target of this.targets) bytes += targetBytes(target);
    bytes += LUT_SIZE * LUT_SIZE * LUT_SIZE * 4;
    return bytes;
  }

  stats() {
    return {
      quality: this.quality,
      sceneColorType: this.sceneTarget?.texture.type ?? null,
      sceneColorHalfFloat: this.sceneTarget?.texture.type === THREE.HalfFloatType,
      passes: this.passes.length,
      targets: this.targets.length,
      textureBytes: this.textureBytes(),
      aa: this.tier.aa,
      spatialAa: this.tier.spatial ?? this.tier.aa,
      sceneSamples: this.sceneTarget?.samples ?? 0,
      exposure: this.exposure,
      bloom: { threshold: this.bloomThreshold, strength: this.bloomStrength },
      ao: {
        radiusNear: this.aoRadiusNear,
        radiusFar: this.aoRadiusFar,
        intensity: this.aoIntensity,
        peakMix: this.aoPeakMix,
        applyStrength: this._aoApplyStrength,
        foliageReceiverCap: this.foliageReceiverCap,
        contactDarkness: this.contactDarkness,
      },
    };
  }

  setBroadleafReceivers(meshes, sceneRoot = null) {
    this._releaseFoliageMaskProxies();
    this._foliageMaskSceneRoot = sceneRoot ?? null;
    if (!this.tier.ao) return;
    this._foliageMaskSources = (meshes ?? []).filter(Boolean).slice(0, 4);
    this._foliageMaskScene = this._foliageMaskScene ?? new THREE.Scene();
    this._foliageMaskProxies = this._foliageMaskSources.map((source) => {
      const proxy = new THREE.InstancedMesh(
        source.geometry,
        this._maskMaterialFor(source.material),
        Math.max(1, source.instanceMatrix?.count ?? source.count ?? 1),
      );
      const ownedMatrix = proxy.instanceMatrix;
      proxy.instanceMatrix = source.instanceMatrix;
      ownedMatrix.dispose();
      proxy.count = source.count;
      proxy.frustumCulled = false;
      proxy.matrixAutoUpdate = false;
      proxy.matrixWorldAutoUpdate = false;
      proxy.name = `dd-foliage-mask:${source.name}`;
      this._foliageMaskScene.add(proxy);
      return { source, proxy };
    });
  }

  _createFoliageMaskMaterial() {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        tLeaf: { value: null },
        tSceneDepth: { value: this.sceneTarget?.depthTexture ?? null },
        uAlphaTest: { value: 0.40 },
        uUvTransform: { value: new THREE.Matrix3() },
        uDepthProj: { value: new THREE.Vector4() },
        uDepthStep: { value: 1 / 16777215 },
        uWindTime: { value: 0 },
        uWindAmp: { value: 0 },
        uResolution: { value: new THREE.Vector2(this.width, this.height) },
      },
      vertexShader: `
        attribute float aWind;
        attribute float aTap;
        uniform float uWindTime;
        uniform float uWindAmp;
        uniform mat3 uUvTransform;
        varying vec2 vLeafUv;
        void main() {
          vLeafUv = (uUvTransform * vec3(uv, 1.0)).xy;
          vec3 transformed = position;
          float w = aWind * uWindAmp;
          float tap = aTap;
          transformed.x += 0.0 * w * tap;
          transformed.z += 0.0 * w * uWindTime;
          vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
          gl_Position = projectionMatrix * modelViewMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D tLeaf;
        uniform sampler2D tSceneDepth;
        uniform float uAlphaTest;
        uniform vec4 uDepthProj;
        uniform float uDepthStep;
        uniform vec2 uResolution;
        varying vec2 vLeafUv;
        float eyeDistance(float windowDepth) {
          float ndc = windowDepth * 2.0 - 1.0;
          float viewZ = (uDepthProj.z - ndc * uDepthProj.w) / (ndc * uDepthProj.y - uDepthProj.x);
          return -viewZ;
        }
        void main() {
          if (texture2D(tLeaf, vLeafUv).a < uAlphaTest) discard;
          vec2 depthUv = gl_FragCoord.xy / uResolution;
          float resolvedDepth = texture2D(tSceneDepth, depthUv).x;
          float leafEye = eyeDistance(gl_FragCoord.z);
          float surfaceEye = eyeDistance(resolvedDepth);
          float quant = abs(eyeDistance(min(resolvedDepth + uDepthStep, 1.0)) - surfaceEye);
          float tolerance = max(0.05, quant * 4.0);
          if (leafEye > surfaceEye + tolerance) discard;
          gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
        }
      `,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    material.customProgramCacheKey = () => 'dd-foliage-receiver-mask-r41e2';
    material.name = 'dd-foliage-receiver-mask';
    material.userData.maskStamp = 0;
    return material;
  }

  _maskMaterialFor(sourceMaterial) {
    let mask = this._foliageMaskMaterials.get(sourceMaterial);
    if (!mask) {
      mask = this._createFoliageMaskMaterial();
      this._foliageMaskMaterials.set(sourceMaterial, mask);
    }
    return mask;
  }

  _refreshFoliageMaskMaterial(mask, sourceMaterial) {
    const uniforms = mask.uniforms;
    const map = sourceMaterial.map ?? null;
    uniforms.tLeaf.value = map;
    uniforms.uAlphaTest.value = sourceMaterial.alphaTest;
    if (map?.matrix) {
      if (map.matrixAutoUpdate === true) map.updateMatrix();
      uniforms.uUvTransform.value.copy(map.matrix);
    }
    const wind = sourceMaterial.userData?.windUniforms;
    uniforms.uWindTime.value = wind?.uWindTime?.value ?? 0;
    uniforms.uWindAmp.value = wind?.uWindAmp?.value ?? 0;
    if (mask.side !== sourceMaterial.side) mask.side = sourceMaterial.side;
    uniforms.tSceneDepth.value = this.sceneTarget.depthTexture;
    uniforms.uResolution.value.set(this.foliageMaskTarget.width, this.foliageMaskTarget.height);
    uniforms.uDepthProj.value.copy(this._maskDepthProj);
  }

  _attachedToMaskScene(object) {
    const root = this._foliageMaskSceneRoot;
    if (!root) return false;
    let node = object;
    while (node) {
      if (node === root) return true;
      node = node.parent;
    }
    return false;
  }

  _ancestorVisible(object) {
    let node = object;
    while (node) {
      if (node.visible === false) return false;
      node = node.parent;
    }
    return true;
  }

  // Called only after _composeOnce has bound and rendered the full sceneTarget.
  // Not a general wrapper for an arbitrary viewport or scissor.
  _renderFoliageMask(renderer, camera) {
    if (!this.tier.ao || !this.foliageMaskTarget) return;
    const previousTarget = renderer.getRenderTarget();
    const cubeFace = renderer.getActiveCubeFace();
    const mipLevel = renderer.getActiveMipmapLevel();
    renderer.getClearColor(this._maskClearColor);
    const clearAlpha = renderer.getClearAlpha();
    const autoClear = renderer.autoClear;
    const shadows = renderer.shadowMap.enabled;
    const projection = camera.projectionMatrix.elements;
    this._maskDepthProj.set(projection[10], projection[11], projection[14], projection[15]);
    const maskTarget = this.foliageMaskTarget;
    maskTarget.viewport.set(0, 0, maskTarget.width, maskTarget.height);
    maskTarget.scissor.set(0, 0, maskTarget.width, maskTarget.height);
    maskTarget.scissorTest = false;
    try {
      renderer.shadowMap.enabled = false;
      renderer.autoClear = false;
      renderer.setRenderTarget(maskTarget, 0, 0);
      renderer.setClearColor(0x000000, 1);
      renderer.clear(true, false, false);
      const stamp = (this._foliageMaskStamp ?? 0) + 1;
      this._foliageMaskStamp = stamp;
      let draw = false;
      for (const pair of this._foliageMaskProxies ?? []) {
        const source = pair.source;
        const sourceMaterial = source?.material ?? null;
        const live = Boolean(sourceMaterial?.visible)
          && this._attachedToMaskScene(source)
          && this._ancestorVisible(source);
        if (sourceMaterial) {
          const mask = this._maskMaterialFor(sourceMaterial);
          mask.userData.maskStamp = stamp;
          this._refreshFoliageMaskMaterial(mask, sourceMaterial);
          if (pair.proxy.material !== mask) pair.proxy.material = mask;
        }
        pair.proxy.visible = live;
        if (!live || !sourceMaterial) continue;
        if (pair.proxy.geometry !== source.geometry) pair.proxy.geometry = source.geometry;
        if (pair.proxy.instanceMatrix !== source.instanceMatrix) {
          pair.proxy.instanceMatrix = source.instanceMatrix;
        }
        pair.proxy.matrix.copy(source.matrixWorld);
        pair.proxy.matrixWorld.copy(source.matrixWorld);
        pair.proxy.count = source.count;
        pair.proxy.layers.mask = source.layers.mask;
        draw = true;
      }
      for (const [sourceMaterial, mask] of this._foliageMaskMaterials) {
        if (mask.userData.maskStamp === stamp) continue;
        mask.uniforms.tLeaf.value = null;
        mask.uniforms.tSceneDepth.value = null;
        mask.dispose();
        this._foliageMaskMaterials.delete(sourceMaterial);
      }
      if (draw) renderer.render(this._foliageMaskScene, camera);
    } finally {
      renderer.shadowMap.enabled = shadows;
      renderer.autoClear = autoClear;
      renderer.setClearColor(this._maskClearColor, clearAlpha);
      renderer.setRenderTarget(previousTarget, cubeFace, mipLevel);
    }
  }

  _releaseFoliageMaskProxies() {
    for (const pair of this._foliageMaskProxies ?? []) {
      this._foliageMaskScene?.remove(pair.proxy);
      pair.proxy.instanceMatrix = null;
      pair.proxy.geometry = null;
      pair.proxy.material = null;
      pair.source = null;
    }
    this._foliageMaskProxies = [];
    this._foliageMaskSources = [];
    for (const mask of this._foliageMaskMaterials?.values() ?? []) {
      mask.uniforms.tLeaf.value = null;
      mask.uniforms.tSceneDepth.value = null;
      mask.dispose();
    }
    this._foliageMaskMaterials?.clear();
  }

  dispose() {
    this._releaseFoliageMaskProxies();
    this._foliageMaskSceneRoot = null;
    this._foliageMaskScene = null;
    for (const pass of this.passes) pass.dispose();
    this.passes = [];
    this._disposeTargets();
    this.geometry.dispose();
    if (this.lut) this.lut.dispose();
    this.lut = null;
  }
}
