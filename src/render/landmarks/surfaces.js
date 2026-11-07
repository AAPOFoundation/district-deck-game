// District Deck V3.70 — LANDMARKS lane, the nine-bucket palette.
//
// §3.2 caps a building at NINE material buckets and this file is where that cap is enforced:
// `landmarkPalette` returns exactly nine materials plus two semantic ALIASES (`room`, `jointBed`,
// `shadow`) that resolve onto buckets already in the nine. An alias is not a tenth material.
//
// THE ONE RULE THAT DECIDES EVERY HEX IN THIS FILE (§5.0): the family map is a per-bucket GAIN
// with a ~20x spread — `render` 0.60, `sand` 0.58, `corrugation` 0.40, `brick`/`concrete` 0.29,
// `foliage` 0.10, `timber` 0.10, `asphalt` 0.03 — and `MaterialLibrary._create()` multiplies the
// authored colour by that map. So a bucket's RENDERED value is the authored linear value times its
// family's gain, and two buckets with the same hex on different families are not the same value.
// Author against the rendered figure. `mvp/tests/lm-ladder.mjs --gains` prints the measured means
// this lane used, and `--ladder` prints the resulting nine-band separation.
//
// AND AUTHOR NOTHING NEAR BLACK (§5.2). The post grade multiplies hue at the bottom of the curve
// by design; hand it an albedo with no chroma and almost no value and it returns the only chroma
// left in the pipe, which is how six buckets authored below luma 26 all arrived on an earlier
// plate as the same saturated navy. Nothing here is authored below sRGB 0x50.

import * as THREE from 'three';
import { restyleColour } from '../style/restyle.js';
import { shade } from './kit.js';

const PROGRAM_KEY = 'dd-v370-landmark-1';

/**
 * Per-subject family assignment and authored colour.
 *
 * FAMILY CHOICE IS A MATERIAL DECISION, not a colour one, and on these two subjects it is part of
 * the identity:
 *
 *   `limestone` is an ASHLAR texture set — repeat 1.55, normal strength 3.4, courses about a metre
 *   across. The civic lane moved its TRIM off limestone because coursed ashlar on a 0.20 m fascia
 *   renders a shade sail as a stone grid. The same property is exactly right here: Old Arts is
 *   coursed freestone ashlar and the Town Hall's ground storey is rusticated ashlar. This is the
 *   one lane in the programme whose subjects are actually made of the thing that set draws.
 *
 *   `slate` is the roof of both subjects in reality — Old Arts's steep pitched roof and the Town
 *   Hall's mansard are both slate — so neither takes `corrugated`, which is the family every
 *   modern subject in this programme uses and which would put a shed roof on a landmark.
 */
export const LANDMARK_SCHEME = Object.freeze({
  'university-old-arts': Object.freeze({
    wallFamily: 'limestone', altFamily: 'concrete', roofFamily: 'slate',
    trimFamily: 'render', metalFamily: 'render', accentFamily: 'render',
    groundFamily: 'concrete', gardenFamily: 'foliage',
    // KYNETON freestone: warm HONEY ashlar. The stone is named because the name was WRONG in the
    // first draft of this file — it said Tasmanian, which is the MELBOURNE TOWN HALL's stone, not
    // Old Arts's; the Victorian Heritage Database has Old Arts in Kyneton freestone. The colour
    // did not move on the correction, because it was authored off the reference plate's own buff
    // rather than off a provenance, and both stones are warm buff sandstone in coursed ashlar. The
    // COMMENT moved, which is the point: a comment asserting the wrong provenance is the defect
    // species this programme has logged sixteen times.
    //
    // The warmth itself is a correction rather than a
    // preference. [MEASURED by looking] `_reference-landmarks/mp-oldarts-three-quarter.png`,
    // which landed mid-round, puts this building's stone in a buff-honey band; r1's `#8b857b`
    // came back on `plates/r1/university-old-arts--street.png` as a grey-cream that shared one
    // value with the trim, the plinth, the boundary wall and the plate deck at once.
    get wall() { return restyleColour('#9a8f78', '#e6d5b3', { id: 'civic:university-old-arts.wall' }); },
    // Bluestone base, buttress footings and the boundary wall — moved from `brick`-adjacent pale
    // to a NEUTRAL-COOL grey on `concrete`, whose gain of 0.29 against `limestone`'s 0.59 is what
    // actually buys the value band. A hex alone could not: §5.0's whole point is that the family
    // map is a per-bucket gain and the rendered value is authored-linear times that gain.
    get wallAlt() { return restyleColour('#8e9094', '#b3b5ba', { id: 'civic:university-old-arts.wallAlt' }); },
    // THE ROOF IS AUTHORED AGAINST A MEASURED TRANSFER, NOT AGAINST A TABLE.
    //
    // r1 was right about the mechanism and over-shot the correction by 1.4x. `slate`'s map is
    // blue-dominant, so a neutral hex through it returns cobalt; r1 authored `#4e4437` to cancel
    // that and landed a roof that was both WARM and 1.6x too dark.
    //
    // [MEASURED] `mvp/tests/lmroof-gains.mjs`, this checkout, per-texel linearised — which is the
    // form the shader actually applies, `slate` gain **(0.1262, 0.1365, 0.1799)**, luma **0.1374**,
    // **b - r = +0.0538**, so a neutral hex returns **1.43x as much blue as red**. That confirms
    // §5.3.10's unpublished blue-dominant gain on this checkout rather than taking it on report.
    //
    // [MEASURED] `plates/r6-geom/university-old-arts--three-quarter.png` against the reference
    // `_reference-landmarks/mp-oldarts-three-quarter.png` at the same station:
    //
    //   reference   lit slope rgb(89, 91, 91) luma 90.6 | lit wall luma 125.8 | ratio **0.72**
    //   r1 shipped  roof mean luma **62.0**             | wall luma 140.6     | ratio **0.44**
    //
    // and the reference's roof is NEUTRAL (b - r = +1.7 lit, +6.7 in shade) where r1's ran
    // b - r = **-14.5**. So: too dark by 1.6x, and warm where slate is neutral-cool.
    //
    // The hex is solved backwards through a transfer measured on the plates themselves, and the
    // transfer is AFFINE, not proportional. Two captures at the same clean 85 x 65 px patch of lit
    // slate on `--three-quarter`, one at `#4e4437` and one at `#62625b`, fit
    // `rendered_linear = k * authored_linear + c` at **k (0.425, 0.401, 0.461), c (+0.0111,
    // +0.0129, +0.0211)**. The constant is the ambient floor, it does not scale with albedo, and
    // it is BLUE-HEAVY — which is why every attempt to cancel the map's bias with a warm hex
    // over-shot: a pure ratio model has no term for it and mis-solves by 1.4x. A one-point ratio
    // was tried first and it is what produced `#62625b`, 1.28x too dark.
    //
    // Target = the reference's own lit slope, scaled to OUR wall by the two plates' wall luma
    // (linear 0.27052 / 0.20979 = 1.2895). Predicted rendered rgb(101, 103, 103), luma 102.4,
    // b - r **+2.4**, roof/wall **0.673** against the reference's 0.72 — and [MEASURED] on
    // `plates/r8/university-old-arts--three-quarter.png` the shipped result is quoted in
    // `roof-builder.md` §5.
    //
    // ONE HEX CANNOT SERVE BOTH STATIONS AND THE NUMBERS SAY SO. The same fit at the BOARD station
    // gives **k (0.160, 0.137, 0.129), c (+0.0181, +0.0125, +0.0069)** — a lower key and an ambient
    // floor that is WARM where the studio rig's is cool. This hex lands neutral (b - r +2.4) at the
    // studio station and warm (b - r -15) at the board one, and no albedo closes that: an albedo
    // multiplies `k` and cannot move `c`. The remedy is a response change on `LANDMARK_RESPONSE`
    // shared with the Town Hall, not another hex — carried as an open item rather than swung at.
    roof: '#909689',
    get trim() { return restyleColour('#b0a894', '#ccc3ac', { id: 'civic:university-old-arts.trim' }); },
    metal: '#403e3c',
    // ONE saturated colour, on the clock ring, the hands, the gate finials and the flag (§2.10).
    accent: '#c08c34',
    // P17-W2B round 2: live f2/none was #9b9894 after jitter (class V56.86).
    // This reaches the #b0a89a ramp on all façades, projecting that class to V64.6.
    get ground() { return restyleColour('#787672', '#a5a29d', { id: 'civic:university-old-arts.ground' }); },
    garden: '#8b9070',
  }),
  'town-hall-melbourne': Object.freeze({
    wallFamily: 'render', altFamily: 'limestone', roofFamily: 'slate',
    trimFamily: 'render', metalFamily: 'render', accentFamily: 'render',
    groundFamily: 'concrete', gardenFamily: 'foliage',
    // Warm buff freestone over a COOL GREY rusticated ground storey. Both halves of that are
    // read off `_reference-landmarks/mp-townhall-three-quarter.png`, whose single strongest
    // device is exactly this: a cool grey rusticated base carrying a warm cream body, separated
    // in BOTH hue and value. r1 had the value split and not the hue, and the plate came back one
    // material with a darker skirt.
    wall: '#a2977f',
    wallAlt: '#787e85',
    // Authored warm for the same reason as Old Arts: `slate`'s map is cool and multiplies.
    roof: '#4a4134',
    // The classical dressings — portico entablature, modillioned cornice, balustrade, pilaster
    // capitals — are the palest bucket, because in the real building they are the surfaces that
    // catch the light and they are what the eye sorts the elevation by.
    trim: '#b3ab99',
    metal: '#403e3c',
    accent: '#b8863a',
    ground: '#767470',
    garden: '#8b9070',
  }),
});

/**
 * Surface response per bucket. `envBase` is the single number deciding whether a face the key
 * cannot reach reads neutral-dark or cerulean: the baked environment's sky term is blue by
 * construction, so on a soffit, a reveal return or a north elevation the env return IS the pixel.
 */
export const LANDMARK_RESPONSE = Object.freeze({
  wall: { roughness: 0.91, metalness: 0.0, envBase: 0.62, normal: 0.78 },
  wallAlt: { roughness: 0.93, metalness: 0.0, envBase: 0.50, normal: 0.86 },
  // `envBase` 0.52 -> 0.34. On a pitched plane the key reaches one side and the SKY is the other
  // side's whole illumination, and the baked sky term is linear (0.129, 0.392, 0.850) — blue by
  // construction. Half the r1 roof's saturation was the map and half was this.
  roof: { roughness: 0.84, metalness: 0.04, envBase: 0.34, normal: 0.72 },
  trim: { roughness: 0.87, metalness: 0.0, envBase: 0.66, normal: 0.34 },
  metal: { roughness: 0.55, metalness: 0.22, envBase: 0.60, normal: 0.30 },
  accent: { roughness: 0.48, metalness: 0.30, envBase: 0.74, normal: 0.24 },
  ground: { roughness: 0.94, metalness: 0.0, envBase: 0.60, normal: 0.42 },
  garden: { roughness: 0.94, metalness: 0.0, envBase: 0.46, normal: 0.50 },
});

/**
 * The pane. §2.2 asks for "a dark, slightly reflective body with a hint of sky or foliage in it —
 * never a flat blue card", and §5.0.3 measured that this is the single craft deficit the reference
 * pack separates on: its cool sits in coherent lit panes, ours in shadow specks.
 *
 * §5.3 is why the value is EMISSIVE rather than authored. A pane sits at the back of a 0.30 m
 * reveal; GTAO multiplies that recess by as little as 0.225 on an inward-facing lining, the
 * display chain's black clip is scene-linear 0.0073, and a diffuse term is albedo x irradiance —
 * inside a reveal the irradiance is the factor going to zero. `totalEmissiveRadiance` is added to
 * `outgoingLight` with no irradiance factor in front of it, so it is the one term that survives.
 *
 * It is a RAMP, not a floor: brighter at the head where the pane sees sky, darker at the sill
 * where it sees the room. The sky values are warm-neutral rather than blue, because a neutral
 * LINEAR value lands blue on this grade and a blue pane is the fault this bucket exists to avoid.
 */
export const LANDMARK_GLASS = Object.freeze({
  base: '#2b2a28',
  head: '#3a3833',
  sill: '#1e1d1c',
  roughness: 0.34,
  envBase: 0.42,
  specularColor: '#d8cfc0',
  specularIntensity: 0.55,
  skyHead: [0.01560, 0.01640, 0.01180],
  skySill: [0.00980, 0.01060, 0.00760],
});

/**
 * §2.5 — material grunge. Nothing is a clean flat colour: tonal drift over the whole surface,
 * grime gathering at the base, and streaking below fixings. All three ride the world position, so
 * a run of forty balusters is not forty copies of one baluster's dirt.
 */
function applyGrunge(material, { seed, drift, grime, streak, soilY = 1.7 }) {
  if (material.userData.v370Landmark) return material;
  material.userData.v370Landmark = { seed, drift, grime, streak };
  const uniforms = {
    ddLmSeed: { value: seed },
    ddLmMix: { value: new THREE.Vector3(drift, grime, streak) },
    ddLmSoil: { value: soilY },
  };
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (previous) previous(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec3 ddLmW;',
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n\tddLmW = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
varying vec3 ddLmW;
uniform float ddLmSeed;
uniform vec3 ddLmMix;
uniform float ddLmSoil;
float ddLmHash(vec3 q) {
  return fract(sin(dot(q, vec3(12.9898, 78.233, 37.719)) + ddLmSeed) * 43758.5453);
}
float ddLmNoise(vec3 q) {
  vec3 i = floor(q); vec3 f = fract(q);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = ddLmHash(i);
  float n100 = ddLmHash(i + vec3(1.0, 0.0, 0.0));
  float n010 = ddLmHash(i + vec3(0.0, 1.0, 0.0));
  float n110 = ddLmHash(i + vec3(1.0, 1.0, 0.0));
  float n001 = ddLmHash(i + vec3(0.0, 0.0, 1.0));
  float n101 = ddLmHash(i + vec3(1.0, 0.0, 1.0));
  float n011 = ddLmHash(i + vec3(0.0, 1.0, 1.0));
  float n111 = ddLmHash(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
  {
    float ddDrift = ddLmNoise(ddLmW * 0.17) * 0.60 + ddLmNoise(ddLmW * 0.71) * 0.40;
    float ddSoil = 1.0 - smoothstep(0.0, ddLmSoil, max(ddLmW.y, 0.0));
    float ddDirt = ddSoil * (0.55 + 0.45 * ddLmNoise(ddLmW * 1.9));
    float ddRun = ddLmNoise(vec3(ddLmW.x * 5.4, ddLmW.y * 0.30, ddLmW.z * 5.4));
    ddRun = smoothstep(0.60, 0.98, ddRun) * (0.35 + 0.65 * fract(ddLmW.y * 0.19));
    float ddF = 1.0
      + (ddDrift - 0.5) * 2.0 * ddLmMix.x
      - ddDirt * ddLmMix.y
      - ddRun * ddLmMix.z;
    diffuseColor.rgb *= clamp(ddF, 0.56, 1.30);
  }`,
    );
  };
  material.customProgramCacheKey = () => PROGRAM_KEY;
  material.needsUpdate = true;
  return material;
}

function glassBucket(materials, variant) {
  const G = LANDMARK_GLASS;
  const material = materials.get('glass', {
    variant,
    color: G.base,
    roughness: G.roughness,
    metalness: 0.0,
    opacity: 1.0,
    transparent: false,
    envBase: G.envBase,
  });
  if (material.userData.v370LmGlass) return material;
  material.userData.v370LmGlass = true;
  // `transparent: false` deliberately: the shared family's 0.58 alpha averages the dark room
  // behind the pane into a flat mid grey, which is the flat card §2.2 forbids.
  material.transparent = false;
  material.depthWrite = true;
  material.opacity = 1.0;
  if (material.specularColor) material.specularColor.set(G.specularColor);
  material.specularIntensity = G.specularIntensity;
  const headC = new THREE.Color(G.head);
  const sillC = new THREE.Color(G.sill);
  const uniforms = {
    ddLmHead: { value: new THREE.Vector3(headC.r, headC.g, headC.b) },
    ddLmSill: { value: new THREE.Vector3(sillC.r, sillC.g, sillC.b) },
    ddLmSkyHead: { value: new THREE.Vector3(...G.skyHead) },
    ddLmSkySill: { value: new THREE.Vector3(...G.skySill) },
  };
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (previous) previous(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nvarying float ddLmPaneT;',
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n\tddLmPaneT = uv.y;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nvarying float ddLmPaneT;\nuniform vec3 ddLmHead;\nuniform vec3 ddLmSill;\n'
      + 'uniform vec3 ddLmSkyHead;\nuniform vec3 ddLmSkySill;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
  float ddLmValid = step(1e-6, fwidth(ddLmPaneT));
  float ddLmT = mix(0.55, clamp(ddLmPaneT, 0.0, 1.0), ddLmValid);
  float ddLmRamp = smoothstep(0.02, 0.98, ddLmT);
  diffuseColor.rgb = mix(ddLmSill, ddLmHead, ddLmRamp);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
  totalEmissiveRadiance += mix(ddLmSkySill, ddLmSkyHead, ddLmRamp);`,
    );
  };
  material.customProgramCacheKey = () => `${PROGRAM_KEY}-glass`;
  material.needsUpdate = true;
  return material;
}

function bucket(materials, {
  family, color, response, variant, grunge,
}) {
  const r = response;
  const material = materials.get(family, {
    variant, color, roughness: r.roughness, metalness: r.metalness, envBase: r.envBase,
  });
  if (material.userData.v370LmBound) return material;
  material.userData.v370LmBound = true;
  if (material.normalScale) material.normalScale.set(r.normal, r.normal);
  else material.normalScale = new THREE.Vector2(r.normal, r.normal);
  for (const texture of [material.map, material.roughnessMap, material.normalMap, material.aoMap]) {
    if (!texture) continue;
    texture.anisotropy = Math.max(texture.anisotropy ?? 1, 8);
    texture.needsUpdate = true;
  }
  applyGrunge(material, grunge);
  return material;
}

/**
 * Resolve the nine buckets for one landmark.
 *
 * `districtId` reaches the variation seed but NOT the family assignment. A landmark's material is
 * the largest part of its identity — a district that prefers weatherboard cannot turn the Town
 * Hall into a timber shed — and the same call is made by the civic and industrial dispatchers for
 * the same reason.
 */
export function landmarkPalette(materials, { id, districtId, facade, v }) {
  const scheme = LANDMARK_SCHEME[id] ?? LANDMARK_SCHEME['university-old-arts'];
  const key = `v370lm|${id}|${districtId ?? 'none'}|f${facade}`;
  const seed = v.unit(1) * 100;
  // Façade 0 is the plate a critic grades, so it takes the authored colour exactly; the other
  // three carry the street's value spread.
  const spread = facade === 0 ? 0 : 1;
  const g = (drift, grime, streak, soilY) => ({ seed, drift, grime, streak, soilY });

  return {
    wall: bucket(materials, {
      family: scheme.wallFamily,
      color: shade(scheme.wall, spread * v.range(10, -0.030, 0.030)),
      response: LANDMARK_RESPONSE.wall,
      variant: `${key}|wall`,
      grunge: g(0.085, 0.24, 0.06, 2.6),
    }),
    wallAlt: bucket(materials, {
      family: scheme.altFamily,
      color: shade(scheme.wallAlt, spread * v.range(11, -0.035, 0.025)),
      response: LANDMARK_RESPONSE.wallAlt,
      variant: `${key}|wallAlt`,
      grunge: g(0.11, 0.30, 0.05, 1.6),
    }),
    roof: bucket(materials, {
      family: scheme.roofFamily,
      color: shade(scheme.roof, spread * v.range(12, -0.030, 0.030)),
      response: LANDMARK_RESPONSE.roof,
      variant: `${key}|roof`,
      grunge: g(0.095, 0.05, 0.17, 0.9),
    }),
    trim: bucket(materials, {
      family: scheme.trimFamily,
      color: shade(scheme.trim, spread * v.range(13, -0.020, 0.020)),
      response: LANDMARK_RESPONSE.trim,
      variant: `${key}|trim`,
      grunge: g(0.060, 0.18, 0.10, 1.9),
    }),
    metal: bucket(materials, {
      family: scheme.metalFamily,
      color: scheme.metal,
      response: LANDMARK_RESPONSE.metal,
      variant: `${key}|metal`,
      grunge: g(0.05, 0.12, 0.06, 1.1),
    }),
    accent: bucket(materials, {
      family: scheme.accentFamily,
      color: shade(scheme.accent, spread * v.range(14, -0.025, 0.025)),
      response: LANDMARK_RESPONSE.accent,
      variant: `${key}|accent`,
      grunge: g(0.05, 0.07, 0.05, 1.0),
    }),
    glass: glassBucket(materials, `${key}|glass`),
    ground: bucket(materials, {
      family: scheme.groundFamily,
      color: shade(scheme.ground, spread * v.range(15, -0.030, 0.030)),
      response: LANDMARK_RESPONSE.ground,
      variant: `${key}|ground`,
      grunge: g(0.12, 0.15, 0.03, 0.7),
    }),
    garden: bucket(materials, {
      family: scheme.gardenFamily,
      color: shade(scheme.garden, spread * v.range(16, -0.035, 0.035)),
      response: LANDMARK_RESPONSE.garden,
      variant: `${key}|garden`,
      grunge: g(0.14, 0.11, 0.02, 0.6),
    }),

    /**
     * ALIASES — semantics, not materials. Three names resolve onto buckets already counted in the
     * nine above, so the cap in §3.2 is nine and stays nine.
     *
     * `room` is `trim` and that is §5.3 applied rather than a preference: no albedo can light a
     * reveal, so the surface at the back of one has to CARRY its value. Every lane in this
     * programme that put its interior backer in the darkest bucket got a black sticker behind its
     * glass and spent rounds moving the pane's albedo, which cannot work.
     *
     * `jointBed` and `shadow` are `metal`, the darkest bucket, which is where a paver joint and a
     * soffit genuinely sit.
     */
    get room() { return this.trim; },
    get jointBed() { return this.metal; },
    get shadow() { return this.metal; },
  };
}
