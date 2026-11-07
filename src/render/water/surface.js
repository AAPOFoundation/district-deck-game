// District Deck — water surface shading (fragment side of the water program).
// Owner seat: SURFACE. Contract: ./contract.js — read it before editing.
//
// Responsibility
//   • the body colour of the bay: depth extinction, shallow-over-sand read,
//     subsurface scattering through backlit wave faces
//   • surface detail normals (ripple layered on the Gerstner normal)
//   • Fresnel reflection of the sky env, sun specular, glitter
//   • distance handling so the far edge of the plane reads as horizon haze,
//     not a stepped polygon boundary
//
// It must NOT draw foam — foam.js owns every white pixel. Returning a milky
// body to fake foam is a contract breach and will be caught by the critic.
//
// ─────────────────────────────────────────────────────────────────────────────
// COLOUR MODEL (R02 rebuild, R2 recalibration)
// ─────────────────────────────────────────────────────────────────────────────
// The R01 pass mixed three flat colours by depth and pasted a sand tint on top.
// That is what produced the chalky shallows and the three-different-bays read
// (W-M5 / W-R01e). This pass runs the single-scattering form instead:
//
//     body = seabed · transmittance  +  volume · (1 − transmittance)
//     transmittance = exp(−extinction · opticalPath)      (per RGB channel)
//
// One seabed albedo, one per-channel extinction vector and one three-stop
// volume ramp produce the whole coast. Red dies first, so the bed reads gold
// under 0.3 m, gold-green by 0.7 m, jade by 1.5 m and is gone by ~4 m — the
// same ramp the Monopoly-Plus reference plates show. Because every band comes
// out of the same two constants the bay cannot drift identity between cameras.
//
// Reference targets measured off mvp/assets/img/water/_reference/ (sRGB means):
//   gold-shallow #ccac6a → jade #7ea479 → emerald #126566 → basin #11323b
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT ROUND 2 CHANGED, AND WHY (read this before turning a knob back)
// ─────────────────────────────────────────────────────────────────────────────
// The R1 critic measured the far field at hue 211.9° / chroma 21.2 — the sky's
// hue at half its chroma — while the sand in the same frame held 37.3° at
// chroma 40.2. One surface rotating toward the sky while its neighbour keeps
// its warmth is a reflection term, and it was this file's. Four structural
// changes follow from that, plus one from the integration seat's retraction
// (mvp/_reviews/quality-loop/W-AAA-haze-attribution.md): the water's flat local
// contrast is the water shader's own, not the grade's.
//
//  1. REFLECTANCE. The grazing ceiling drops 0.72 → 0.24 and the deep-water
//     multiplier 0.75 → 0.34, and what reflection remains is filtered through
//     the bay's own deep colour (ddUnitTint) so a colourless dome cannot bleach
//     the far field to grey. sky.js owns the dome; this file must not wait for
//     it.
//  2. NORMAL-DRIVEN LIGHT. The body used to be one tint times one scalar, so a
//     wave face and a wave back rendered the same value and the offshore patch
//     spanned 50 code values against the reference's 203. The volume term is
//     now lit by N·L: a face carries the key, a back keeps only sky.
//  3. GLITTER. The specular path was a smooth analytic lobe on a normal field
//     that the footprint fade had already smoothed flat, which is how it came
//     out as a broad sheen at saturation 0.012 and never reached luma 230. It
//     is now a screen-stable facet population: one cell is ~2.6 px at ANY
//     distance, so the sparkles never alias and never dissolve.
//  4. HORIZON. The dissolve sampled the equirect at 0.055 elevation, which is
//     the shoulder of the ground-bounce lobe — the warm tan trough the critic
//     measured across the seam (−26 luma afternoon, −45 golden). The sample
//     moved to 0.22 and the alpha taper was widened so the SKY BEHIND, not a
//     guess at the sky's colour, is what closes the join.
//
// ─────────────────────────────────────────────────────────────────────────────
// LEGACY UNIFORM WARNING — still live as of R2, re-checked against water.js
// ─────────────────────────────────────────────────────────────────────────────
// water.js `setSolar()` (water.js:1687-1699) STILL writes uDeepColor and
// uShallowColor with hardcoded linear RGB (a mint 0.05/0.82/0.72 and a slate
// 0.008/0.08/0.16). Those two values were the direct cause of the mint-sheet /
// slate-offshore split. This module no longer reads them, but it must keep
// declaring them or `setSolar` throws on `.value.setRGB()` — verified by grep,
// they are still written. The palette lives in uBay* / uSeabed, and
// time-of-day response is derived from uSunColor, which setSolar also writes.

import * as THREE from 'three';
import { WATER_LAW, waterLawGlsl } from './law.js';

// P23-R linear radiance; tuned through the shared presentation grade.
export const P23_WATER_SHALLOW = Object.freeze([0.0, 0.095, 0.12]);
export const P23_WATER_DEEP = Object.freeze([0.0005, 0.006, 0.023]);
export const P23_WATER_SHELF_ABSORPTION = 0.85;
export const P23_WATER_ABSORPTION = 0.38; // 99% coverage at 12 m; no opacity cliff.

/**
 * Bed grain reaches exactly 1 at `fadeEnd`. The noise sample is skipped only
 * at that zero weight, so the multiplier does not step.
 */
export const BED_DETAIL = Object.freeze({
  fade0: 1.40,
  fadeEnd: 2.60,
  lo: 0.78,
  amp: 0.22,
});

function smooth01(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** CPU twin of the shallow bed-grain multiplier. 1 once the grain has faded. */
export function bedDetailMul(depth, noise01 = 0) {
  const d = Math.max(0, Number(depth) || 0);
  const w = 1 - smooth01(BED_DETAIL.fade0, BED_DETAIL.fadeEnd, d);
  const n = Math.min(1, Math.max(0, Number(noise01) || 0));
  const varied = BED_DETAIL.lo + BED_DETAIL.amp * n;
  return (1 - w) + varied * w;
}

/** Shallow, resolvable caustics. Deep water and coarse pixels skip the web. */
export const COAST_CAUSTIC = Object.freeze({
  depthFade0: 0.45,
  depthFade1: 2.20,
  pixelFade0: 0.22,
  pixelFade1: 1.10,
});

/** 0 when the bed caustic would be invisible. CPU twin of the shader gate. */
export function coastCausticWeight(depth, pixelMetres) {
  const d = Math.max(0, Number(depth) || 0);
  const px = Math.max(0, Number(pixelMetres) || 0);
  const shallow = 1 - smooth01(COAST_CAUSTIC.depthFade0, COAST_CAUSTIC.depthFade1, d);
  const resolved = 1 - smooth01(COAST_CAUSTIC.pixelFade0, COAST_CAUSTIC.pixelFade1, px);
  return shallow * resolved;
}

export const SURFACE_GLSL = /* glsl */ `
  #ifndef DD_SURFACE
  #define DD_SURFACE
  ${waterLawGlsl()}

  uniform vec3  uBayShoal;       // volume colour of a thin column over the shelf
  uniform vec3  uBayMid;         // the working teal of the bay
  uniform vec3  uBayDeep;        // basin colour past the shelf
  uniform vec3  uSeabed;         // seabed albedo seen through the water
  uniform float uWaterGain;      // water-law ramp radiance gain (law.js bodyGain)
  uniform float uWaterDesat;     // pre-tonemap desaturation of the ramp (law.js bodyDesat)
  uniform float uWaterFloor;     // neutral radiance floor (law.js bodyFloor)
  uniform vec3  uExtinct;        // per-channel extinction, 1/m of optical path
  uniform vec3  uSunColor;
  uniform vec3  uSunDir;
  uniform vec3  uSkyColor;       // fallback zenith when no env map
  uniform vec3  uHorizonColor;   // fallback haze when no env map
  uniform float uEnvIntensity;
  uniform float uReflMax;        // grazing reflectance ceiling
  uniform float uEnvTint;        // how far the mirror takes the bay's own hue
  uniform float uHorizonFade;    // front distance of the far plane edge
  uniform float uGlitter;
  uniform float uCaustic;
  uniform sampler2D uRippleMap;
  uniform sampler2D uEnvMap;
  uniform bool  uHasEnv;

  struct DDSurfaceIn {
    vec3  world;
    vec3  flatWorld;
    vec3  normal;
    vec3  viewDir;
    float front;
    float depth;
    float height;
    float crest;
    float steep;
    float fold;
    float shoal;
    float t;
  };

  struct DDRipple {
    vec3  n;        // tangent-space-ish detail normal, +y up
    float detail;   // 1 = full ripple detail survived, 0 = all of it aliased away
  };

  float ddLum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

  /**
   * A colour scaled so its brightest channel is 1 — the hue and the channel
   * ratios of a palette entry, with its brightness thrown away. Multiplying a
   * light by this rotates the light's hue without turning it black, which is
   * what "tint the reflection with the bay" has to mean when the bay's deep
   * colour is a linear 0.002 in red.
   */
  vec3 ddUnitTint(vec3 c) {
    return c / max(max(c.r, max(c.g, c.b)), 1e-4);
  }

  // ── Sky / environment ───────────────────────────────────────────────────
  // The lighting rig hands over its equirect (linear float, DataTexture with
  // flipY = false, so row 0 / v = 0 is the zenith, and phi = atan2(x, z)).
  // R01 sampled it with atan(z, x) and an asin-based v, which was rotated 90°
  // AND vertically flipped — the bay was mirroring the brown ground-bounce
  // lobe instead of the sky. That is where the taupe smear across the far
  // water came from.
  vec3 ddSampleEnv(vec3 dir) {
    vec3 d = normalize(dir);
    #ifdef DD_AQUA_SOFT
      // R5B: aqua owns the single rough PMREM reflection. Ambient and haze
      // use the existing sky uniforms, without three extra equirect taps.
      return mix(uHorizonColor, uSkyColor, clamp(d.y * 0.5 + 0.5, 0.0, 1.0));
    #else
    if (!uHasEnv) {
      float up = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
      return mix(uHorizonColor, uSkyColor, pow(up, 0.7));
    }
    vec2 uv = vec2(
      atan(d.x, d.z) * 0.15915494309 + 0.5,
      acos(clamp(d.y, -1.0, 1.0)) * 0.31830988618
    );
    return texture2D(uEnvMap, uv).rgb;
    #endif
  }

  /**
   * Three scrolling ripple layers on the analytic wave normal.
   *
   * Each layer is faded out once its features drop below the pixel footprint.
   * Without that the far field boils into moire and the sun path shatters into
   * salt-and-pepper — which is exactly what the 04 / 08 plates showed. The
   * surviving-detail fraction is returned so downstream terms can compensate.
   *
   * R2: the layers no longer share one axis-aligned sampling frame. All three
   * used to read the map on the same lattice orientation, so their tile repeats
   * lined up and reinforced a single rectangular hatch — half of the diagonal
   * weave two critics measured. Each layer now reads on its own rotation.
   */
  DDRipple ddRippleNormal(vec2 p, float t, float shoal, float px) {
    #ifdef DD_AQUA_SOFT
      // P21: the gentle analytic swell owns normals; no repeating detail map.
      return DDRipple(vec3(0.0, 1.0, 0.0), 0.0);
    #endif
    // Feature size of each layer in metres — the size of the DOMINANT cell in
    // that layer, which is the tile period divided by the map's base lattice
    // (64 cells). R1 quoted these as 0.90 / 0.56 / 0.24 m, which was the tile
    // period rather than its content, so nothing ever faded and the offshore
    // band carried full-amplitude detail it could not resolve.
    const float fA = 0.21;
    const float fB = 0.085;
    const float fC = 0.036;
    float wA = 1.0 - smoothstep(fA * 0.6, fA * 3.2, px);
    float wB = 1.0 - smoothstep(fB * 0.6, fB * 3.2, px);
    float wC = 1.0 - smoothstep(fC * 0.6, fC * 3.2, px);

    // Per-layer rotation. Nothing about the water is axis-aligned, and three
    // co-oriented lattices are what a viewer reads as canvas weave.
    mat2 rA = mat2(1.0, 0.0, 0.0, 1.0);
    mat2 rB = mat2(0.7314, 0.6820, -0.6820, 0.7314);   // 43 degrees
    mat2 rC = mat2(-0.2079, 0.9781, -0.9781, -0.2079); // 102 degrees

    vec2 uvA = (rA * p) * 0.075 + vec2(t * 0.021, -t * 0.034);
    vec2 uvB = (rB * p) * 0.184 + vec2(-t * 0.043, t * 0.026);
    vec2 uvC = (rC * p) * 0.430 + vec2(t * 0.062, t * 0.051);

    // The map packs (dx, up, dz) in RGB — R01 read .xy and fed the "up"
    // channel in as a tangent, which skewed every ripple onto one diagonal.
    // Each layer's gradient is rotated back out of its own frame so the three
    // slopes add in world space rather than in three unrelated frames.
    vec2 aA = (texture2D(uRippleMap, uvA).xz * 2.0 - 1.0) * (0.62 * wA);
    vec2 aB = (texture2D(uRippleMap, uvB).xz * 2.0 - 1.0) * (0.44 * wB);
    vec2 aC = (texture2D(uRippleMap, uvC).xz * 2.0 - 1.0) * (mix(0.16, 0.34, shoal) * wC);
    vec2 g = aA * rA + aB * rB + aC * rC;

    DDRipple r;
    r.n = normalize(vec3(g.x, 1.0, g.y));
    r.detail = clamp((0.62 * wA + 0.44 * wB + 0.25 * wC) / 1.31, 0.0, 1.0);
    return r;
  }

  /** Caustic web on the seabed. Ridged difference of two drifting noise fields. */
  float ddCausticWeb(vec2 p, float t) {
    vec2 q = p * 0.62;
    float a = ddValueNoise(q + vec2(t * 0.11, -t * 0.07));
    float b = ddValueNoise(q * 1.41 + vec2(-t * 0.09, t * 0.13) + 11.3);
    float ridge = 1.0 - abs(a + b - 1.0) * 2.1;
    float fine = ddValueNoise(q * 3.1 + vec2(t * 0.19, t * 0.14) + 3.7);
    return pow(clamp(ridge, 0.0, 1.0), 3.0) * (0.72 + 0.55 * fine);
  }

  vec4 ddSurface(DDSurfaceIn si) {
    #ifdef DD_AQUA_SOFT
    // THE WATER LAW (TASTE-BIBLE section 6, water/law.js). The column colour is
    // one depth ramp from the tokens (#6FB6B4 at 0.5 m, #3F8E9A at 2 m, #2A6587
    // at 6 m, #1E3B5D from 15 m) and nothing else: no per-channel extinction, no
    // sand-tinted volume, no second palette. Weather and fog are applied by the
    // caller through the same shared helpers, so every body of water that uses
    // this ramp answers depth and weather identically.
    float depth = max(si.depth + si.height * 0.85, 0.0);
    vec3 L = normalize(uSunDir);
    // The bed bake stops at 9 m; open water keeps deepening seaward on the ramp.
    float lawDepth = depth + smoothstep(30.0, 220.0, max(si.front, 0.0)) * 14.0;
    vec3 vol = ddWaterRamp(lawDepth);
    vol = mix(vol, vec3(dot(vol, vec3(0.2126, 0.7152, 0.0722))), uWaterDesat);
    // Round two (gate ruling 1): no caustic web on the shared ramp. The ridged noise net drew a
    // sub-metre cross-hatch on the shallows from beyond 100 m, and the water law bans any visible
    // caustic, net or cross-hatch at any distance. The body colour is the depth ramp and nothing else.
    // Absorption exp(-depth / 4) is how much of the bed still shows through (opacity below).
    float bedVis = exp(-depth / ${WATER_LAW.absorptionDepth.toFixed(1)});
    vec3 body = vol;
    float light = 0.85 + 0.15 * max(dot(normalize(si.normal), L), 0.0);
    // The first half metre lets the bed through (the foam band sits on it);
    // deeper water covers it, fully by 6 m so the void offshore never shows.
    // taste-r1 (W14-A): cover = 1 - exp(-depth / 0.30). The smoothstep left the first 0.5 m clear, so the
    // shelf water read as the grey sand-and-sky fog Civ VII never has; this is 63% at 0.3 m, 89% at 0.66 m.
    float cover = 1.0 - exp(-depth / 0.30);
    float opacity = cover * (1.0 - 0.10 * bedVis * (1.0 - smoothstep(2.0, 6.0, depth)));
    return vec4(body * light * uWaterGain + vec3(uWaterFloor), opacity);
    #else
    vec3 V = normalize(si.viewDir);
    vec3 L = normalize(uSunDir);
    float camDist = length(cameraPosition - si.world);

    // World metres covered by one pixel — the anti-alias budget for every
    // high-frequency term below.
    float px = max(
      length(vec2(dFdx(si.flatWorld.x), dFdy(si.flatWorld.x))),
      length(vec2(dFdx(si.flatWorld.z), dFdy(si.flatWorld.z)))
    );

    // ── Normal ────────────────────────────────────────────────────────────
    DDRipple rip = ddRippleNormal(si.flatWorld.xz, si.t, si.shoal, px);
    // R1 raised the offshore tilt to 0.40 to chase glitter out of the env sun
    // disc. That did not produce glitter (measured %L >= 230 = 0.000 at three
    // framings) and it did amplify the ripple map's lattice, so it comes back
    // down: the sun path is now an explicit facet population further below,
    // which is footprint-stable and does not need the normal field to carry it.
    float ripAmt = mix(0.30, 0.50, si.shoal);
    vec3 N = normalize(si.normal + vec3(rip.n.x, 0.0, rip.n.z) * ripAmt);
    float cosNV = clamp(dot(N, V), 0.0, 1.0);
    float ndl = dot(N, L);

    // ── Optical path ──────────────────────────────────────────────────────
    // Instantaneous depth, not still-water depth: the swell breathing over the
    // bar has to expose the bed in the troughs or the shallows read as paint.
    float d = max(si.depth + si.height * 0.85, 0.0);
    // Down-leg follows the sun, up-leg follows the eye. Both are clamped well
    // short of grazing — a literal 1/cos blows the shallow read out of the
    // low-camera plates, where the seabed is exactly what has to be legible.
    //
    // R2: the two legs are AVERAGED, not summed. R1 summed them, so a head-on
    // view of one metre of water carried 3.9 m of optical path and uExtinct
    // read four times larger than its own comment claimed. The seabed died
    // inside the first half-metre and the shallows had nothing warm left to
    // show — the measured "shallow" band came out hue 172 at saturation 0.278,
    // a mint, where the reference is hue 37 at 0.528.
    float sunUp = clamp(L.y, 0.30, 1.0);
    float eyeUp = clamp(V.y, 0.34, 1.0);
    float legs = clamp((1.0 / sunUp + 1.0 / eyeUp) * 0.5, 1.0, 2.7);
    float path = d * legs;
    vec3 trans = exp(-uExtinct * path);

    // ── Incident light ────────────────────────────────────────────────────
    // The palette is authored for the mid-afternoon key, so the key colour is
    // divided out and only the *shift* away from it tints the bay. That is how
    // golden hour warms the water without a second palette, and it rides on
    // uSunColor, which setSolar keeps current.
    const vec3 refKey = vec3(1.0, 0.88, 0.718);
    vec3 sunTint = uSunColor / refKey;
    float dayAmt = clamp(L.y * 1.7, 0.0, 1.0);
    // R1 used 1 - dayAmt, which reaches only 0.44 at the golden-hour capture
    // and left the bay reading mid-afternoon while the beach had turned. This
    // curve separates the two capture hours properly: 0.00 at ToD 0.42,
    // 0.70 at ToD 0.86.
    float lowSun = 1.0 - smoothstep(0.16, 0.62, L.y);
    vec3 lightIn = mix(vec3(1.0), sunTint, 0.90) * (0.66 + 0.34 * dayAmt);
    // How much of the key a given patch of surface can see. This is the term
    // that gives the bay local contrast: a face turned to the sun carries the
    // key, a back keeps only the sky. Without it the whole offshore body is
    // one tint times one scalar and the histogram has no tails at all.
    //
    // The window is centred on the value FLAT water would read, not on zero.
    // A fixed window from -0.18 saturates at 1.0 for every upward normal under
    // a 40-degree sun, which is the whole offshore body — measured as an open-
    // bay shore-normal mean step of 1.52 against a gate of 3.5.
    float ndlFlat = max(L.y, 0.08);
    float faceLit = smoothstep(ndlFlat - 0.36, ndlFlat + 0.28, ndl);
    // A low sun does not just dim the bay, it splits it: faces that still see
    // the key go hot, backs fall to a cold blue. The dome this water mirrors is
    // colourless at every hour (sky.js measures saturation 0.066 at golden
    // hour), so if the split does not happen here it does not happen at all,
    // and 10-golden-hour keeps putting an afternoon sea beside a golden beach.
    vec3 warmLow = vec3(1.48, 0.96, 0.52);
    vec3 coolLow = vec3(0.42, 0.62, 1.22);
    lightIn *= mix(vec3(1.0), mix(coolLow, warmLow, faceLit), lowSun * 0.85);

    // ── Volume colour ─────────────────────────────────────────────────────
    // Three stops on one curve — shelf turquoise, working teal, basin.
    float dv = 1.0 - exp(-d * 0.42);
    vec3 vol = mix(uBayShoal, uBayMid, smoothstep(0.05, 0.58, dv));
    vol = mix(vol, uBayDeep, smoothstep(0.55, 0.99, dv));
    vol *= lightIn * (0.32 + 1.00 * faceLit);

    // ── Seabed through the column ─────────────────────────────────────────
    vec3 skyAmb = ddSampleEnv(vec3(0.0, 1.0, 0.0));
    vec3 bedLight = uSunColor * (0.46 + 0.72 * clamp(L.y, 0.0, 1.0)) + skyAmb * 0.17;
    // Caustics only where the bed is actually visible, and only while the
    // pixel footprint can still resolve them.
    float causFade = (1.0 - smoothstep(0.22, 1.10, px)) * uCaustic;
    float caus = 0.0;
    #ifndef DD_AQUA_SOFT
      caus = ddCausticWeb(si.flatWorld.xz, si.t) * causFade * smoothstep(0.02, 0.35, trans.g);
    #endif
    bedLight *= 0.78 + caus * 0.80;
    vec3 bed = uSeabed * bedLight;

    vec3 body = bed * trans + vol * (1.0 - trans);

    // ── Subsurface scattering through the wave face ───────────────────────
    // A wave lifting between the sun and the eye glows green at its crest.
    #ifndef DD_AQUA_SOFT
    float backLit = pow(clamp(dot(V, -L) * 0.5 + 0.5, 0.0, 1.0), 2.6);
    float face = smoothstep(0.12, 0.85, si.steep) * smoothstep(0.02, 0.80, si.crest);
    float lift = clamp(si.height, 0.0, 2.0);
    float sss = backLit * face * (0.28 + 0.72 * si.shoal) * (0.35 + 0.65 * lift);
    vec3 sssCol = uBayShoal * 3.4 * (0.55 + 0.55 * uSunColor);
    body = mix(body, sssCol, clamp(sss * 0.55, 0.0, 0.62));
    #endif
    // Troughs sit in their own shadow, crests catch a little more sky.
    body *= 1.0 + clamp(si.height, -1.6, 1.6) * 0.09;
    // Low-sun inscatter. Multiplying a teal body by a warm light cannot rotate
    // its hue — the red channel of the basin is a linear 0.002, and nothing
    // multiplicative brings it back. The hour has to be ADDED, and only into
    // the part of the pixel that is actually water column.
    // Confined to the shelf and the mid-bay. Inscatter is a short-column effect
    // at a grazing key, and adding it flat across the basin — whose body sits
    // at a linear 0.02 — swamped the blue channel and turned the golden-hour
    // sea brown.
    vec3 lowGlow = uSunColor * vec3(0.95, 0.46, 0.17)
      * (lowSun * lowSun) * 0.095 * (0.24 + 0.76 * faceLit);
    body += lowGlow * (1.0 - trans) * (1.0 - smoothstep(2.5, 8.0, d));

    // ── Reflection ────────────────────────────────────────────────────────
    vec3 R = reflect(-V, N);
    // Wave normals routinely throw R below the horizon, where the equirect
    // holds the table's brown bounce lobe. Fold it back up rather than
    // painting mud on the bay.
    R.y = abs(R.y) * 0.94 + 0.03;
    // Bound the sun disc so a mirror hit is a bright patch, not a white hole;
    // the analytic specular below is the controllable part of the sun path.
    vec3 envRaw = min(ddSampleEnv(R), vec3(8.0)) * uEnvIntensity;
    // The mirror takes the bay's own hue. A physically faithful reflection of
    // a colourless dome is a colourless reflection, and the dome measures
    // saturation 0.017 in the afternoon — which is exactly how the far field
    // came out at the sky's hue and half its chroma while the sand beside it
    // kept 37 degrees. At a low sun the tint target swings to the key, so the
    // bay changes hour even though the dome does not.
    vec3 warmMirror = ddUnitTint(uSunColor * vec3(1.45, 0.60, 0.20));
    // A low sun does not make the whole sea orange, it splits it. Blending the
    // mirror uniformly toward the key turned 10-golden-hour into mud; the warm
    // half belongs on the faces that see the sun and the backs take a cold
    // violet-blue, which is exactly the swing ref-05 shows between #FAAE4F and
    // #5F4857.
    vec3 coolMirror = ddUnitTint(vec3(0.40, 0.52, 1.0)) * 0.72;
    vec3 lowMirror = mix(coolMirror, warmMirror * 0.92, smoothstep(0.06, 0.66, faceLit));
    vec3 reflTint = mix(ddUnitTint(uBayDeep) * 0.78, lowMirror, lowSun * 0.80);
    vec3 env = mix(envRaw, ddLum(envRaw) * reflTint, uEnvTint);
    float fres = 0.02 + 0.98 * pow(1.0 - cosNV, 5.0);
    // Sand-lit shallows scatter more than they mirror; the basin is the mirror.
    float refl = fres * mix(0.13, 0.16, smoothstep(0.25, 3.5, d));
    // Churned water scatters instead of reflecting. Foam.js paints the white.
    refl *= 1.0 - 0.45 * clamp(si.fold, 0.0, 1.0);
    // Hard ceiling: even at the horizon the bay keeps three quarters of its own
    // colour. R1 sat at 0.72 here and the far field became a strip of sky —
    // measured hue 211.9 against the bay's own 193, luma 117 against a gate of
    // 70, with 1.58 % of the water below luma 60 against the reference's 31 %.
    vec3 colour = mix(body, env, clamp(refl, 0.0, uReflMax));

    // ── Sun specular and glitter ──────────────────────────────────────────
    vec3 H = normalize(L + V);
    float ndh = max(dot(N, H), 0.0);
    float sunFace = clamp(ndl * 2.4, 0.0, 1.0);
    float specW = (0.16 + 0.84 * fres) * uGlitter * sunFace;
    // The facet population carries its own weight. Folding it into specW put a
    // Fresnel floor under the broad analytic sheen as well, which lifted the
    // whole far field 13 luma to buy 0.1 % of sun path — the wrong trade when
    // major 1 is the far field.
    float glitW = (0.45 + 0.55 * fres) * uGlitter * sunFace;

    // Screen-stable facet population. One cell is about 2.6 px WHATEVER the
    // distance, because its world size is quantised off the pixel footprint —
    // so the sparkles never alias into salt-and-pepper close in and never
    // dissolve into a sheen far out. That dissolve is what R1 shipped: a broad
    // colourless glow at saturation 0.012 with not one pixel over luma 230,
    // against a reference sun path at saturation 0.683 and 7.4 % over 230.
    // exp2/floor keeps the cell grid piecewise-constant across the frame, so
    // cell boundaries do not crawl pixel to pixel.
    #ifndef DD_AQUA_SOFT
    float cellW = exp2(floor(log2(max(px * 2.6, 0.02))));
    vec2 cid = floor(si.flatWorld.xz / cellW);
    float hA = ddHash21(cid);
    float hB = ddHash21(cid + vec2(41.7, 17.3));
    // Only a minority of cells ever hold a facet steep enough to line up, and
    // each flashes on its own phase, so the road twinkles rather than strobing
    // as one sheet.
    // Density is the whole game here, and it has to fall off with distance.
    // Not the brightness — that is what R1 faded, and a faded sparkle is a
    // sheen. The population thins instead, because the board's tilt-shift
    // blurs the far field and a blurred sparkle is not a highlight, it is a
    // soft blob that lifts the mean. Measured on the hero plate: a uniform
    // population put 27 luma of the far water's 100 on the glitter alone and
    // dragged its saturation from 0.74 to 0.17.
    // Where the sun road IS. Measured off the BASE wave normal, not the
    // ripple-perturbed one: with the ripple in, ndh reaches the mirror
    // somewhere in almost every pixel and the "road" becomes the whole bay,
    // which is how the first two R2 passes sprayed the hero plate. Off the
    // base normal it is a real band that follows the swell, and the facet
    // population below is the sub-pixel statistics inside it.
    float ndhB = max(dot(normalize(si.normal), H), 0.0);
    float road = smoothstep(0.972, 0.9995, ndhB);
    // Live-cell threshold: dense on the road, nearly empty off it, and thinned
    // again as the footprint grows, because the board's tilt-shift turns a
    // blurred sparkle into a soft blob that lifts the mean without adding a
    // highlight. Thinning the POPULATION is not R1's mistake, which was fading
    // each sparkle's amplitude until the whole road dissolved into a sheen.
    float thr = mix(0.94, 0.58, road);
    thr = min(thr + 0.05 * smoothstep(0.12, 0.45, px), 0.99);
    float alive = step(thr, hB);
    float ph = hA * 6.2831853 + si.t * (1.7 + 3.4 * hB);
    float flash = smoothstep(0.82, 0.98, sin(ph));
    float spark = alive * flash * (0.45 + 0.55 * hA);
    // A facet can only reach the mirror direction if the mean normal is already
    // within the facet's own tilt of it, so the road is narrow by construction.
    // The first R2 pass gated the population on pow(ndh, 6), which is most of a
    // hemisphere: it sprayed confetti over the whole bay and lifted the far
    // water 20 luma instead of letting it go dark.
    float glitter = spark * road * 5.4;
    // Facets mirror the sky as well as the sun. Looking away from the key a real
    // sea still breaks into bright and dark scales, and this is the only route
    // to the histogram tails § 5 C2 asks for on 04-open-bay, whose camera has
    // the sun behind it and therefore cannot carry a solar lobe at all. Its own
    // population, drawn off the other hash axis: it has to exist everywhere on
    // open water rather than only on the road, so it is deliberately dimmer
    // than a solar hit — bright enough to move a 95th percentile, not bright
    // enough to move a mean.
    float aliveSky = step(min(0.89 + 0.04 * smoothstep(0.12, 0.45, px), 0.97), hA);
    // Gated on how close the facet's reflection runs to the horizon, because
    // that is the only direction with a bright band in it. Without this gate
    // the population is a uniform Poisson dust over the whole bay — measured
    // fine, but it reads as blue confetti on the open-bay plate. With it the
    // glints clump onto the wave faces that are actually turned to the bright
    // sky, which is where a real sea puts them.
    float grazeR = 0.40 + 0.60 * (1.0 - smoothstep(0.06, 0.45, R.y));
    float sparkSky = aliveSky * flash * (0.50 + 0.50 * hB) * uGlitter * grazeR
      * (0.45 + 0.55 * fres) * smoothstep(0.5, 3.2, d);
    colour += envRaw * sparkSky * 1.65;
    // The smooth part: a tight analytic lobe for near-mirror hits and a wide
    // sheen so the sun road is legible before the half-vector lines up.
    float loss = 1.0 - rip.detail;
    float tight = pow(ndh, mix(900.0, 60.0, loss)) * mix(1.4, 0.35, loss);
    float broad = pow(ndh, 40.0) * 0.075;
    float sheen = pow(ndh, 7.0) * 0.018 * (1.0 + 1.6 * lowSun);
    // A clipped white highlight has no hue, and the grade's shoulder desaturates
    // anything driven far past white. ref-05's sun path is #DD8A4B at saturation
    // 0.683 — a gold road, not a paper-white one — so the specular carries a
    // much harder tint than the key itself does, and its ceiling stays close
    // enough to white that the channels do not all pin together.
    //
    // The ceiling is also a bloom budget. post.js blooms above linear 1.40, and
    // a facet population driven to 6.0 puts every sparkle four times over that
    // threshold; the bloom then paints a soft glow across the whole bay and
    // ADDS energy, which is why the hero far water measured a 26-luma lift from
    // a population covering nearer 5 % of its area. Sitting just over the
    // threshold crosses luma 230 without buying the veil.
    vec3 specTint = uSunColor * mix(vec3(1.0), vec3(1.30, 0.58, 0.22), lowSun * 0.72 + 0.20);
    colour += specTint * min((tight + broad + sheen) * specW + glitter * glitW, 3.6);
    #endif

    // ── Horizon dissolve ──────────────────────────────────────────────────
    // The plane has a far edge at front ≈ uHorizonFade. R1 dissolved the colour
    // into an env sample at 0.055 elevation, which sits on the shoulder of the
    // equirect's ground-bounce lobe: that is the warm tan trough drawn across
    // the seam, 26 luma deep in the afternoon and 45 at golden hour with the
    // hue swinging to 23.5 degrees. The sample now sits at 0.22, clear of the
    // lobe, it is tinted with the same reflTint as the mirror so the far water
    // stays water-coloured, and the ALPHA taper below is what actually closes
    // the join — the sky behind the plane is a better match for the sky than
    // any sample this shader can guess.
    vec3 fwd = vec3(-V.x, 0.0, -V.z);
    float fwdLen = max(length(fwd), 1e-4);
    vec3 hazeRaw = ddSampleEnv(vec3(fwd.x / fwdLen, 0.22, fwd.z / fwdLen)) * uEnvIntensity;
    vec3 haze = mix(hazeRaw, ddLum(hazeRaw) * reflTint, 0.70);
    float edge = smoothstep(uHorizonFade * 0.86, uHorizonFade * 0.995, si.front);
    // A little aerial perspective everywhere so the bay recedes on a board that
    // is only a few hundred millimetres across. A low sun earns a thicker,
    // warmer veil; midday keeps it nearly off, because milky distance is
    // exactly how R00 failed and haze is the fastest route back to it.
    float aerial = (1.0 - exp(-camDist * 0.0011)) * (0.09 + 0.16 * lowSun);
    colour = mix(colour, haze, clamp(max(edge * 0.75, aerial), 0.0, 1.0));

    // ── Alpha ─────────────────────────────────────────────────────────────
    // Only the first metre is see-through, so the real sand relief shows in the
    // swash; past that the body is opaque and the bay has mass. The sand shelf
    // reaches ~1.2 m of water, so opacity must land before that or the table
    // shows through the bay.
    float alpha = mix(0.28, 1.0, smoothstep(0.02, 1.00, d));
    // Land edge: dissolve over the last stretch onto wet sand.
    alpha *= smoothstep(-0.9, 1.1, si.front);
    // Far edge: taper out over a long stretch rather than 4.5 % of the plane.
    // The taper is the horizon: whatever is behind the plane comes through as
    // the water thins out, which cannot mismatch the sky because it IS the sky.
    alpha *= 1.0 - smoothstep(uHorizonFade * 0.90, uHorizonFade * 0.999, si.front);
    alpha = clamp(alpha, 0.0, 1.0);

    return vec4(colour, alpha);
    #endif
  }

  #endif
`;

/**
 * Procedural tiling ripple normal map. Seeded, no Math.random.
 * Packs (dx, up, dz) into RGB; ddRippleNormal reads .xz.
 *
 * R2 rebuild. Two faults, both of them visible in the plates:
 *
 *  1. The height field was mostly white noise. Octave 0 sampled the 64-entry
 *     table at frequency 4, which is 256 cells across a 256-texel map — one
 *     cell per texel, already at Nyquist — and the five octaves above it ran to
 *     8192 cells. Everything above the first octave was per-texel hash, so the
 *     map had almost no resolved structure for the mip chain to keep.
 *  2. Two single-frequency sinusoids were added on top as "wind anisotropy". A
 *     sine in a tiling map is coherent across every repeat, so it does not
 *     average away with distance the way noise does — it stacks. Layer A's
 *     0.51 m stripe is the diagonal weave the SURFACE critic measured at ~5.75
 *     px and 75 degrees, and the WAVES critic independently found by FFT at
 *     four times the magnitude of the strongest real wave component.
 *
 * Both are gone. The octaves now run 1 → 3.6 in lattice norm, every one of them
 * resolved, each on its own rotation so their tile repeats cannot reinforce a
 * single grid; wind streaking comes from the same noise read on a deliberately
 * anisotropic lattice. Every lattice coefficient is an integer, which is what
 * keeps the tile seamless.
 *
 * @param {number} size
 * @param {(seed: string) => () => number} makeSeededRng
 */
export function buildRippleMap(size, makeSeededRng) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const rng = makeSeededRng('dd-water-ripple-v3');
  const tableSize = 64;
  const table = new Float32Array(tableSize * tableSize);
  for (let i = 0; i < table.length; i += 1) table[i] = rng();

  const sample = (x, y) => {
    const x0 = Math.floor(x) & (tableSize - 1);
    const y0 = Math.floor(y) & (tableSize - 1);
    const x1 = (x0 + 1) & (tableSize - 1);
    const y1 = (y0 + 1) & (tableSize - 1);
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const v00 = table[y0 * tableSize + x0];
    const v10 = table[y0 * tableSize + x1];
    const v01 = table[y1 * tableSize + x0];
    const v11 = table[y1 * tableSize + x1];
    const a = v00 + (v10 - v00) * sx;
    const b = v01 + (v11 - v01) * sx;
    return a + (b - a) * sy;
  };

  // Octave lattices as [ax, ay, bx, by] — the two rows of an integer matrix
  // applied to (u, v) before the table lookup. Integer entries keep every wrap
  // on a 64-texel boundary, so the map still tiles exactly; the rotation is
  // what stops six octaves from stacking onto one rectangular grid. Norms run
  // 1.0, 1.41, 2.24, 3.61 — the largest is 231 cells over a 256-texel map,
  // which is the finest content the map can actually hold.
  const OCTAVES = [
    { m: [1, 0, 0, 1], amp: 0.40, off: 0.0 },
    { m: [1, 1, -1, 1], amp: 0.27, off: 7.3 },
    { m: [2, 1, -1, 2], amp: 0.17, off: 19.1 },
    { m: [2, 3, -3, 2], amp: 0.09, off: 31.7 },
  ];
  // Wind streaking: the same noise on a deliberately anisotropic lattice, so
  // features run long with the swell and short across it. Broadband, so there
  // is no single frequency for the eye to lock onto as a hatch.
  const STREAKS = [
    { m: [1, 9, -3, 1], amp: 0.085, off: 3.9 },
    { m: [2, 15, -5, 2], amp: 0.050, off: 23.3 },
  ];

  const height = new Float32Array(size * size);
  let mean = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      let h = 0;
      for (let o = 0; o < OCTAVES.length; o += 1) {
        const { m, amp, off } = OCTAVES[o];
        h += amp * sample(
          (u * m[0] + v * m[1]) * tableSize + off,
          (u * m[2] + v * m[3]) * tableSize + off,
        );
      }
      for (let s = 0; s < STREAKS.length; s += 1) {
        const { m, amp, off } = STREAKS[s];
        h += amp * (sample(
          (u * m[0] + v * m[1]) * tableSize + off,
          (u * m[2] + v * m[3]) * tableSize + off,
        ) - 0.5);
      }
      height[y * size + x] = h;
      mean += h;
    }
  }
  mean /= size * size;
  for (let i = 0; i < height.length; i += 1) height[i] -= mean;

  // Higher than R1's 2.6 because the field it differentiates is now resolved
  // rather than per-texel hash, so a two-texel difference is a real slope
  // instead of a noise sample.
  const strength = 3.6;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const xl = height[y * size + ((x - 1 + size) % size)];
      const xr = height[y * size + ((x + 1) % size)];
      const yd = height[((y - 1 + size) % size) * size + x];
      const yu = height[((y + 1) % size) * size + x];
      const dx = (xr - xl) * strength * size * 0.0039;
      const dy = (yu - yd) * strength * size * 0.0039;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      data[i + 1] = (inv * 0.5 + 0.5) * 255;
      data[i + 2] = (-dy * inv * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/** @param {string} quality */
export function surfaceUniforms(quality = 'high') {
  const srgb = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  const low = quality === 'low';
  return {
    // ── Bay identity. One seabed, one extinction vector, one volume ramp. ──
    // R2 darkened all three stops. The R1 palette put the basin at luma 69 and
    // the shelf at a mint bright enough (linear green 0.56) to wash every
    // nearshore plate; the gate is deep water at luma <= 50 with saturation
    // >= 0.40, and the reference basin is #11323b.
    uBayShoal: { value: srgb('#23a08d') },
    uBayMid: { value: srgb('#063f5c') },
    uBayDeep: { value: srgb('#083a4e') },
    uSeabed: { value: srgb('#e0ac62') },
    // Radiance gain on the water-law ramp colour (water/law.js `bodyGain`).
    uWaterGain: { value: WATER_LAW.bodyGain },
    uWaterDesat: { value: WATER_LAW.bodyDesat },
    uWaterFloor: { value: WATER_LAW.bodyFloor },
    // Not a colour — 1/metre extinction per channel, on a path that is now the
    // AVERAGE of the sun and eye legs rather than their sum. Red dies first,
    // which is what turns the seabed gold → green → jade → gone across roughly
    // four metres instead of the half-metre R1 shipped.
    uExtinct: { value: new THREE.Vector3(0.72, 0.33, 0.38) },
    uSunColor: { value: srgb('#fff1d0') },
    uSunDir: { value: new THREE.Vector3(0.4, 0.75, 0.35).normalize() },
    uSkyColor: { value: srgb('#7fb4e2') },
    uHorizonColor: { value: srgb('#b8c6cc') },
    uEnvIntensity: { value: low ? 0.66 : 0.76 },
    // Grazing reflectance ceiling. This is the single knob the R1 critic named
    // and the R1 builder declined to turn.
    uReflMax: { value: 0.12 },
    // How far the mirror is pulled onto the bay's own hue. 0 is a faithful
    // reflection of a colourless dome, which is what R1 shipped.
    uEnvTint: { value: 0.92 },
    // Front distance of the far plane edge: WATER_EXTENT (420) minus the mean
    // waterline offset (~47.6). Keep in step with contract.js if either moves.
    uHorizonFade: { value: 372 },
    uGlitter: { value: low ? 0.75 : 1.0 },
    uCaustic: { value: low ? 0.0 : 1.0 },
    uRippleMap: { value: null },
    uEnvMap: { value: null },
    uHasEnv: { value: false },
    // ── Legacy write targets for water.js setSolar(). Not read by the shader.
    // Re-checked 2026-08-10: water.js:1689/1694 still call .value.setRGB() on
    // both of these, so deleting them here throws. They go when that call does.
    uShallowColor: { value: srgb('#4fd7cf') },
    uDeepColor: { value: srgb('#062a44') },
  };
}

export default { SURFACE_GLSL, surfaceUniforms, buildRippleMap };
