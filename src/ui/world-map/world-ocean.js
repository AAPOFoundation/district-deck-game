// V4.5 Wave 3 — subtle voxel-register ocean motion. Uniform/shader time only.

export const OCEAN_MOTION = Object.freeze({
  currentSpeed: 0.000012,
  currentYaw: 0.00008,
  shimmerAmp: 0.055,
  swellAmp: 0.0016,
  swellSpeed: 0.32,
  foamPulse: 0.035,
  roughnessBase: 0.42,
  roughnessAmp: 0.028,
});

/**
 * G1 water contract. Three's physical material evaluates the direct lobe with
 * GGX; an IOR of 1.329431339 gives the requested dielectric F0 of exactly 0.02.
 * The custom shader only supplies a non-repeating, world-space normal field and
 * the sky term that an environment-less scene otherwise cannot reflect.
 */
export const OCEAN_BRDF = Object.freeze({
  f0: 0.02,
  ior: 1.329431339,
  roughness: 0.28,
  limbKeep: 0.62,
  waveStrength: 0.022,
  waveFrequencyA: 17,
  waveFrequencyB: 29,
  skyTint: Object.freeze([0.10, 0.31, 0.48]),
});

export function fresnelSchlick(cosTheta, f0 = OCEAN_BRDF.f0) {
  const c = Math.min(1, Math.max(0, Number(cosTheta) || 0));
  const base = Math.min(1, Math.max(0, Number(f0) || 0));
  return base + ((1 - base) * ((1 - c) ** 5));
}

export function ggxDistribution(nDotH, roughness = OCEAN_BRDF.roughness) {
  const nh = Math.min(1, Math.max(0, Number(nDotH) || 0));
  const r = Math.min(1, Math.max(0.0525, Number(roughness) || OCEAN_BRDF.roughness));
  const alpha = r * r;
  const alpha2 = alpha * alpha;
  const denom = (nh * nh * (alpha2 - 1)) + 1;
  return alpha2 / Math.max(1e-8, Math.PI * denom * denom);
}

/**
 * ── P14-M11 ITEM 3 — THE SUN TERM IS CAPPED, AND BROKEN. ──
 *
 * MC6 pack-b, 3/10: "voxel cube continents on a PLASTIC-SPECULAR teal ocean";
 * pack-a: "glossy teal ocean... a foam maquette, not a planet". M9 and M10 both
 * moved the ROUGHNESS and the audit still read gloss, and the arithmetic says
 * why: `MeshStandardMaterial` multiplies its `roughness` by the roughness map's
 * green channel, and the map's mid grey was 0.72. An authored 0.78 therefore
 * drew at 0.56 — a semi-gloss surface — and the map's own blobs took patches of
 * it down to 0.42. The sphere was never as matte as its own material said.
 *
 * Two changes, and they are independent so the A/B can separate them:
 *
 *   1. The map's mid grey is raised (in `world-map.js`) and the authored base
 *      with it, so `roughness x map` lands at or above 0.72 everywhere. That is
 *      the brief's "roughness >= 0.7 equivalent", measured on the product
 *      rather than on the authored number.
 *   2. `SPEC_CAP` scales the DIRECT SPECULAR after the lights are gathered, and
 *      scales it by a broken field rather than by a constant, so what is left
 *      is a run of separate glints across the sea — a sun TRACK — instead of
 *      one Blinn lobe sitting on the sphere like a highlight on a billiard
 *      ball. The diffuse, the terminator, the emissive floor and the shadow
 *      map are all untouched.
 *
 * P14-G1 supersedes this path with the physical GGX/Smith/Schlick BRDF below.
 * `SPEC_CAP` remains exported as a legacy audit contract, but no longer alters
 * the live shader; the analytic world-space normal field breaks the lobe.
 */
export const SPEC_CAP = Object.freeze({
  /** Ceiling on the direct specular the sea returns. */
  gain: 0.30,
  /** Share of the remaining specular the break field can remove. */
  breakAmt: 0.80,
  /** Cell size of the break, in radians of surface normal. */
  breakFreq: 26.0,
});

/**
 * ── P14-M9 ITEM 1 — THE TERMINATOR, AND WHY IT IS DONE HERE. ──
 *
 * MC4 pack-i/pack-j read the globe as a billiard ball, and half of that is that
 * the sphere has no day and no night: one key at 2.48, a hemisphere at 0.92, an
 * ambient at 0.26 and an emissive floor at 0.62 add up to a body that is nearly
 * the same value all the way round, so the only shading information on the sea
 * is the specular lobe — which is exactly what a billiard ball looks like.
 *
 * `uSunDir` is the world-space key direction and `vOceanWN` is the world-space
 * surface normal, so `nl` is a real cosine of the sun angle that survives the
 * globe's own spin. `night` is a smoothstep from +0.32 to -0.28 in that cosine,
 * which is about 36 degrees of arc: a genuinely SOFT terminator rather than the
 * one-pixel edge a `max(0, N.L)` gives at a grazing angle.
 *
 * The night side is deepened and pulled toward blue rather than switched off.
 * MC3 F8 put the emissive floor in because the unlit half was measuring luma 3
 * and reading as a hole in the desk, and that finding stands: the floor is kept
 * and only 34 % of the albedo is taken, which is a night sea rather than a void.
 */
export const OCEAN_TERMINATOR = Object.freeze({
  /** Cosine of the sun angle at which the day term is fully on / fully off. */
  dayAt: 0.32,
  nightAt: -0.28,
  /** How much of the albedo the night side keeps. */
  nightKeep: 0.80,
  /** Blue push on the night side. */
  nightTint: 0.22,
  /**
   * Share of the emissive floor the DAY side keeps. The floor exists for the
   * night half (MC3 F8); on the lit half it only washes out the key's own
   * shading, so a third of it is enough to keep the deep water off black in the
   * shadow of a continent.
   */
  dayFloor: 0.46,
});

export function bindOceanMaterial(material, { reducedMotion = false, geoMap = false } = {}) {
  if (!material) return material;
  material.userData.oceanBound = true;
  material.userData.oceanReduced = Boolean(reducedMotion);
  // P14-M9: the colour map is registered to the geography (the depth-tinted
  // shelf sits on the real coastlines), so it must not scroll. G1 moved the
  // moving surface detail into an analytic world-space normal field.
  material.userData.oceanGeoMap = Boolean(geoMap);
  // Remember what the author asked for, so `tickOceanMaterial` can breathe
  // around it instead of resetting it to the module default.
  material.userData.oceanRoughBase = material.roughness;
  const sun = { x: 0.68, y: 0.575, z: 0.47 };
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.(shader, renderer);
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uMotion = { value: reducedMotion ? 0 : 1 };
    shader.uniforms.uShimmerAmp = { value: OCEAN_MOTION.shimmerAmp };
    shader.uniforms.uSwellAmp = { value: OCEAN_MOTION.swellAmp };
    shader.uniforms.uOceanF0 = { value: OCEAN_BRDF.f0 };
    shader.uniforms.uWaveStrength = { value: OCEAN_BRDF.waveStrength };
    shader.uniforms.uSkyTint = { value: OCEAN_BRDF.skyTint };
    shader.uniforms.uSunDir = {
      value: material.userData.oceanSunDir ?? [sun.x, sun.y, sun.z],
    };
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       uniform float uTime;
       uniform float uMotion;
       uniform float uSwellAmp;
       varying float vOceanLat;
       varying vec3 vOceanWN;
       varying vec3 vOceanWP;
       varying vec3 vOceanView;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vOceanLat = normalize(transformed).y;
       vOceanWN = normalize(mat3(modelMatrix) * objectNormal);
       float swell = sin(uTime * 0.32 + vOceanLat * 14.0) * uSwellAmp * uMotion;
       transformed += objectNormal * swell;
       vec3 ddOceanWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
       vOceanWP = ddOceanWP;
       vOceanView = normalize(cameraPosition - ddOceanWP);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       uniform float uTime;
       uniform float uMotion;
       uniform float uShimmerAmp;
       uniform float uOceanF0;
       uniform float uWaveStrength;
       uniform vec3 uSkyTint;
       uniform vec3 uSunDir;
       varying float vOceanLat;
       varying vec3 vOceanWN;
       varying vec3 vOceanWP;
       varying vec3 vOceanView;`,
    );
    if (shader.fragmentShader.includes('#include <map_fragment>')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         float latBand = sin(vOceanLat * 40.0 + uTime * 0.11);
         float drift = sin(uTime * 0.19) * 0.5 + 0.5;
         float shimmer = (latBand * 0.55 + drift * 0.45) * uShimmerAmp * uMotion;
         diffuseColor.rgb += vec3(0.12, 0.18, 0.20) * shimmer;
         float ddNl = dot(normalize(vOceanWN), normalize(uSunDir));
         float ddNight = smoothstep(
           ${OCEAN_TERMINATOR.dayAt.toFixed(3)},
           ${OCEAN_TERMINATOR.nightAt.toFixed(3)},
           ddNl
         );
         diffuseColor.rgb *= mix(
           1.0, ${OCEAN_TERMINATOR.nightKeep.toFixed(3)}, ddNight
         );
         diffuseColor.b += diffuseColor.b
           * ${OCEAN_TERMINATOR.nightTint.toFixed(3)} * ddNight;
         float ddViewN = max(0.0, dot(normalize(vOceanWN), normalize(vOceanView)));
         float ddOceanLimb = smoothstep(0.10, 0.94, pow(1.0 - ddViewN, 1.65));
         // Water transmits less of its body colour at grazing incidence. The
         // atmosphere shell supplies the light outside this dark inner edge.
         diffuseColor.rgb *= mix(1.0, ${OCEAN_BRDF.limbKeep.toFixed(3)}, ddOceanLimb);
         diffuseColor.rgb = mix(
           diffuseColor.rgb,
           diffuseColor.rgb * vec3(0.72, 0.94, 1.08),
           ddOceanLimb * 0.24
         );`,
      );
    }
    if (shader.fragmentShader.includes('#include <normal_fragment_maps>')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
         // Two incommensurate world-space swells: no UV tile and therefore no
         // repeat to reveal at the sighting zoom. Reduced motion fixes time at
         // zero while retaining the static surface relief.
         vec3 ddOceanBaseN = normalize(vOceanWN);
         vec3 ddAxis = abs(ddOceanBaseN.y) < 0.92
           ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
         vec3 ddOceanT = normalize(cross(ddAxis, ddOceanBaseN));
         vec3 ddOceanB = normalize(cross(ddOceanBaseN, ddOceanT));
         float ddWaveA = dot(vOceanWP, vec3(0.73, 0.18, -0.66))
           * ${OCEAN_BRDF.waveFrequencyA.toFixed(1)} + uTime * 0.055 * uMotion;
         float ddWaveB = dot(vOceanWP, vec3(-0.31, 0.82, 0.48))
           * ${OCEAN_BRDF.waveFrequencyB.toFixed(1)} - uTime * 0.037 * uMotion;
         vec2 ddSlope = vec2(
           sin(ddWaveA) + 0.46 * sin(ddWaveB + 1.4),
           cos(ddWaveA * 0.71 + 0.8) + 0.38 * cos(ddWaveB)
         ) * uWaveStrength;
         vec3 ddOceanN = normalize(
           ddOceanBaseN + ddOceanT * ddSlope.x + ddOceanB * ddSlope.y
         );
         normal = normalize((viewMatrix * vec4(ddOceanN, 0.0)).xyz);`,
      );
    }
    /*
     * ── AND THE HALF WITHOUT WHICH THE TERMINATOR CANNOT SHOW. ──
     *
     * MC3 F8 put an emissive floor on this sphere because the unlit half was
     * measuring luma 3 and reading as a hole in the desk. That finding stands
     * and the floor is kept. But an emissive term is light the surface carries
     * ITSELF: it is unaffected by the key, by the normal and by the sun angle,
     * so at 0.62 it was the largest single contribution to the sea's value on
     * BOTH halves of the globe — which is why no amount of albedo work could
     * make a shelf or a terminator read. It was flattening its own sphere.
     *
     * Two changes, and they are the same change: the floor is put on an
     * emissive MAP (the shelf texture, so the floor itself carries the coastal
     * shading rather than washing it out), and it is scaled DOWN on the day
     * side, where the key is doing the work, and left at full strength on the
     * night side, where it is the only thing between the sea and a hole.
     */
    /*
     * MeshPhysicalMaterial supplies the direct GGX/Smith lobe and Schlick
     * Fresnel from the 1.329431339 IOR (F0 0.02). There is no environment map
     * in this room, so add only the missing sky reflection here. It is almost
     * absent face-on and rises at grazing angle, while the physical direct lobe
     * continues to move with V as the camera dollies.
     */
    if (shader.fragmentShader.includes('#include <lights_fragment_end>')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
         float ddBrdfNV = max(0.0, dot(normalize(ddOceanN), normalize(vOceanView)));
         float ddFresnel = uOceanF0
           + (1.0 - uOceanF0) * pow(1.0 - ddBrdfNV, 5.0);
         float ddSkyDay = smoothstep(-0.30, 0.34,
           dot(normalize(ddOceanN), normalize(uSunDir)));
         reflectedLight.indirectSpecular += uSkyTint * ddFresnel
           * mix(0.105, 0.19, ddSkyDay);`,
      );
    }
    if (shader.fragmentShader.includes('#include <emissivemap_fragment>')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         totalEmissiveRadiance *= mix(
           ${OCEAN_TERMINATOR.dayFloor.toFixed(3)}, 1.0, ddNight
         );`,
      );
    }
    // P21-G1B: luminous painted water under one warm key. Limit the physical
    // lobe relative to its own pigment; no detached white Pacific hotspot.
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      outgoingLight = clamp(outgoingLight, diffuseColor.rgb * 0.85, diffuseColor.rgb * 1.12);
      #include <opaque_fragment>`);
    material.userData.oceanShader = shader;
  };
  material.customProgramCacheKey = () => 'dd-ocean-g1-ggx-f002';
  return material;
}

/**
 * Point the terminator at the live key. Called once with the globe's own key
 * direction; the shader reads it in world space, so the globe's spin does not
 * move the day side.
 */
export function setOceanSun(material, dir) {
  if (!material || !dir) return material;
  const len = Math.hypot(dir.x ?? 0, dir.y ?? 0, dir.z ?? 0) || 1;
  const v = [(dir.x ?? 0) / len, (dir.y ?? 0) / len, (dir.z ?? 0) / len];
  material.userData.oceanSunDir = v;
  const u = material.userData.oceanShader?.uniforms?.uSunDir;
  if (u) u.value = v;
  return material;
}

export function tickOceanMaterial(material, timeMs, reducedMotion = false) {
  if (!material) return;
  const motion = reducedMotion ? 0 : 1;
  const shader = material.userData.oceanShader;
  if (shader?.uniforms?.uTime) {
    shader.uniforms.uTime.value = reducedMotion ? 0 : timeMs * 0.001;
    shader.uniforms.uMotion.value = motion;
  }
  // A geo-registered colour map must hold still — scrolling it would walk the
  // depth-tinted shelf off the coastlines. Legacy callers may still provide a
  // roughness map; G1's live globe instead moves its shader normal field.
  const drift = material.userData.oceanGeoMap ? material.roughnessMap : material.map;
  if (material.userData.oceanGeoMap && material.map) material.map.offset.set(0, 0);
  if (drift) {
    if (reducedMotion) {
      drift.offset.set(0, 0);
    } else {
      drift.offset.x = (timeMs * OCEAN_MOTION.currentSpeed * 6) % 1;
      drift.offset.y = Math.sin(timeMs * OCEAN_MOTION.currentYaw) * 0.012;
    }
    drift.needsUpdate = false;
  }
  /*
   * P14-M9: the base is the material's OWN authored roughness, not
   * `OCEAN_MOTION.roughnessBase`. This line used to nail the sphere to 0.42
   * every frame, so the globe's material could not be made matte at all — an
   * authored 0.78 was overwritten by the first tick and the toy gloss came
   * straight back. `roughnessBase` stays exported at 0.42 and is the fallback
   * for any material that did not author its own; the SWING is unchanged.
   */
  const base = material.userData.oceanRoughBase ?? OCEAN_MOTION.roughnessBase;
  material.roughness = reducedMotion
    ? base
    : base + Math.sin(timeMs * 0.00042) * OCEAN_MOTION.roughnessAmp;
}

export function tickCoastFoam(foam, timeMs, reducedMotion = false) {
  if (!foam?.material) return;
  const pulse = reducedMotion ? 0 : Math.sin(timeMs * 0.0011) * OCEAN_MOTION.foamPulse;
  foam.material.emissiveIntensity = 0.08 + pulse;
}
