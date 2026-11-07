// Procedural rock surface: the "register conversion" proof (wave six, lane B).
//
// Three parts, usable on any mesh of rock without an art pipeline:
//
//   createStoneMaterial   a MeshStandardMaterial whose fragment shader adds
//                         world-space, triplanar, tile-free albedo structure: course
//                         bedding 1 to 2.3 m thick that varies in value, thin joint
//                         lines at the course boundaries, vertical fracture hairlines
//                         and stain streaks, two octaves of value noise plus a grain
//                         octave, a weathered lighter top, a wet band with its own
//                         roughness and a little weed tint at the waterline, and a
//                         light normal grit from the same noise. It multiplies the
//                         material colour and the vertex colour, so the token colour
//                         and the baked occlusion stay in charge of the base value.
//   fractureStone         midpoint subdivision followed by position-only displacement
//                         (course recesses with chamfers, a low crumble, and planar
//                         fracture cuts on the broad faces) so the silhouette breaks
//                         and no face stays a single plane wider than about 4 m.
//                         Position-only, so seam duplicates cannot crack.
//   bakeStoneOcclusion    vertex-colour occlusion from geometry alone (height above
//                         the waterline, normal direction, Laplacian concavity).
//
// Nothing here reads a light. The scene's lights multiply the baked colour, so the
// numbers are kept small enough that a shaded face stays rock.

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Shader
// ---------------------------------------------------------------------------

const VERT_COMMON = /* glsl */`
#include <common>
varying vec3 vStW;
`;

const VERT_BEGIN = /* glsl */`
#include <begin_vertex>
vStW = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const FRAG_COMMON = /* glsl */`
#include <common>
varying vec3 vStW;
uniform float uStWaterY, uStWetTop, uStWetRough, uStWetDark, uStScale, uStBed, uStFine, uStBump, uStSeed, uStJoint, uStStain, uStCrack;
uniform vec3 uStWarm, uStCool;

uint stU(ivec2 i) {
  uint n = uint(i.x) * 374761393u + uint(i.y) * 668265263u + uint(uStSeed) * 2246822519u;
  n = (n ^ (n >> 13u)) * 1274126177u;
  n = n ^ (n >> 16u);
  return n;
}
float stH(ivec2 i) { return float(stU(i) & 16777215u) / 16777215.0; }
float stH1(float f) { return stH(ivec2(int(f), 91)); }
float stN(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  ivec2 ii = ivec2(i);
  return mix(mix(stH(ii), stH(ii + ivec2(1, 0)), f.x), mix(stH(ii + ivec2(0, 1)), stH(ii + ivec2(1, 1)), f.x), f.y);
}

// One vertical projection. u runs along the face, y is height in metres. The result is
// (bed, fine, stain, dark) where dark is the combined joint and fracture-hairline mask.
vec4 stVert(float u, float y, out float crackDir) {
  vec2 q = vec2(u, y) * uStScale;
  // Beds dip and fold gently along the face.
  float yb = q.y + 0.9 * (stN(vec2(q.x * 0.16, 7.3)) - 0.5) + 0.35 * (stN(vec2(q.x * 0.55, 3.1)) - 0.5);
  // Two interleaved courses (about 1.35 m and 2.25 m) so no bed boundary repeats evenly.
  float c1 = yb / 1.35;
  float c2 = yb / 2.25 + 11.0;
  float bed = 0.58 * stH1(floor(c1)) + 0.42 * stH1(floor(c2) + 31.0);
  float px = max(fwidth(q.y), 1e-4);
  // Joint lines at course boundaries, broken along the run.
  float nb = floor(c1 + 0.5);
  float e1 = abs(c1 - nb) * 1.35;
  float j1 = (1.0 - smoothstep(0.0, max(0.045, px * 1.5), e1))
    * smoothstep(0.44, 0.64, stN(vec2(q.x * 0.8, nb * 3.7)));
  float nb2 = floor(c2 + 0.5);
  float e2 = abs(c2 - nb2) * 2.25;
  float j2 = (1.0 - smoothstep(0.0, max(0.05, px * 1.5), e2))
    * smoothstep(0.50, 0.70, stN(vec2(q.x * 0.6 + 5.0, nb2 * 2.9)));
  // Vertical fracture hairlines: where a stretched noise field crosses 0.5.
  float cr = stN(vec2(q.x * 1.7 + 3.0, q.y * 0.12));
  float crack = 1.0 - smoothstep(0.0, max(0.03, fwidth(cr) * 1.4), abs(cr - 0.5));
  crack *= smoothstep(0.35, 0.6, stN(vec2(q.x * 0.35 + 9.0, q.y * 0.07)));
  // Stain streaks running down from the beds.
  float stain = smoothstep(0.58, 0.88, stN(vec2(q.x * 2.1, q.y * 0.30 + 5.0)))
    * (0.55 + 0.45 * stN(vec2(q.x * 0.5, q.y * 0.1)));
  // Two octaves of value noise, stretched along the bedding, plus grain.
  vec2 qs = vec2(q.x * 0.8, q.y);
  float fine = 0.58 * stN(qs * 0.9) + 0.30 * stN(qs * 2.6 + 17.0) + 0.12 * stN(qs * 7.9 + 43.0);
  crackDir = max(crack * uStCrack, max(j1 * uStJoint, j2 * uStJoint * 0.7));
  return vec4(bed, fine, stain, stN(q * 0.22 + 31.0));
}

// The horizontal projection, for upward faces.
vec4 stTop(vec2 p) {
  vec2 q = p * uStScale;
  float fine = 0.50 * stN(q * 0.9) + 0.32 * stN(q * 3.1 + 17.0) + 0.18 * stN(q * 9.7 + 43.0);
  return vec4(0.62, fine, 0.0, stN(q * 0.22 + 31.0));
}
`;

const FRAG_COLOR = /* glsl */`
#include <color_fragment>
vec3 stBump = vec3(0.0);
float stWet = 0.0;
{
  vec3 stFn = normalize(cross(dFdx(vStW), dFdy(vStW)));
  vec3 stWt = pow(abs(stFn), vec3(4.0));
  stWt /= (stWt.x + stWt.y + stWt.z);
  // All three projections run unconditionally: stVert reads screen derivatives.
  float dkx = 0.0, dkz = 0.0;
  vec4 sx = stVert(vStW.z, vStW.y, dkx);
  vec4 sz = stVert(vStW.x, vStW.y, dkz);
  vec4 sy = stTop(vStW.xz);
  vec4 sm = sx * stWt.x + sz * stWt.z + sy * stWt.y;
  float dark = dkx * stWt.x + dkz * stWt.z;
  float top = smoothstep(0.55, 0.9, stFn.y);
  float val = 1.0
    + uStBed * (sm.x - 0.5) * 2.0
    + uStFine * (sm.y - 0.5) * 2.0
    + 0.07 * (sm.w - 0.5) * 2.0
    - uStStain * sm.z
    - dark
    + 0.07 * top;
  // taste-r1 (W14-B) ledges: the per-bed tone of Pocket Reserve island-body.ts:408-420 (a hash tone
  // per bed, 0.76 to 1.0 up the lower third and 1.0 to 1.12 near the top) on 1.9 m beds, each bed
  // darkening under its own lip so a stack reads as stacked ledges (5 per 10 m of height).
  {
    float lbPh = (vStW.y + 0.9 * (stN(vec2((vStW.x + vStW.z) * 0.06, 7.3)) - 0.5)) / 1.9;
    float lbF = fract(lbPh);
    float lbH = clamp((vStW.y - uStWaterY) / 12.0, 0.0, 1.0);
    float lbTone = (0.90 + 0.20 * stH1(floor(lbPh) + 51.0))
      * mix(0.80, 1.0, smoothstep(0.0, 0.33, lbH)) * mix(1.0, 1.10, smoothstep(0.66, 1.0, lbH));
    val *= mix(1.0, lbTone, 1.0 - top);
    val *= 1.0 - 0.34 * smoothstep(0.72, 0.97, lbF) * (1.0 - top);
  }
  vec3 stTint = mix(uStCool, uStWarm, clamp(sm.x * 0.7 + sm.w * 0.5, 0.0, 1.0));
  // Wet band: a wavy tide line, darker, with weed tint just above the water.
  float stHW = vStW.y - uStWaterY;
  float tideN = stN(vec2(vStW.x * 0.9 + vStW.z * 0.6, 2.0)) - 0.5;
  float stEdge = uStWetTop * (1.0 + 0.5 * tideN);
  stWet = 1.0 - smoothstep(stEdge * 0.55, stEdge * 1.2, stHW);
  float stSplash = (1.0 - smoothstep(stEdge, stEdge * 2.6, stHW)) * (1.0 - stWet);
  float stWeed = stWet * smoothstep(0.0, 0.4, stHW + 0.2 * tideN) * (1.0 - smoothstep(0.7, 1.5, stHW));
  vec3 weedTint = mix(vec3(1.0), vec3(0.84, 0.93, 0.78), stWeed * (0.5 + 0.5 * sm.y));
  diffuseColor.rgb *= max(val, 0.25) * stTint * weedTint * (1.0 - uStWetDark * stWet - 0.08 * stSplash);
  // Light grit on the normal from the mid octave, in world space.
  float e = 0.1 / uStScale;
  vec3 g = vec3(0.0);
  if (stWt.x > 0.02) {
    float n0 = stN(vec2(vStW.z * 0.8, vStW.y) * uStScale * 2.6 + 17.0);
    float nu = stN(vec2((vStW.z + e) * 0.8, vStW.y) * uStScale * 2.6 + 17.0);
    float nv = stN(vec2(vStW.z * 0.8, vStW.y + e) * uStScale * 2.6 + 17.0);
    g += stWt.x * vec3(0.0, (nv - n0) / e, (nu - n0) / e);
  }
  if (stWt.z > 0.02) {
    float n0 = stN(vec2(vStW.x * 0.8, vStW.y) * uStScale * 2.6 + 17.0);
    float nu = stN(vec2((vStW.x + e) * 0.8, vStW.y) * uStScale * 2.6 + 17.0);
    float nv = stN(vec2(vStW.x * 0.8, vStW.y + e) * uStScale * 2.6 + 17.0);
    g += stWt.z * vec3((nu - n0) / e, (nv - n0) / e, 0.0);
  }
  if (stWt.y > 0.02) {
    float n0 = stN(vStW.xz * uStScale * 3.1 + 17.0);
    float nu = stN((vStW.xz + vec2(e, 0.0)) * uStScale * 3.1 + 17.0);
    float nv = stN((vStW.xz + vec2(0.0, e)) * uStScale * 3.1 + 17.0);
    g += stWt.y * vec3((nu - n0) / e, 0.0, (nv - n0) / e);
  }
  stBump = g * uStBump * (1.0 - 0.6 * stWet);
}
`;

const FRAG_NORMAL = /* glsl */`
#include <normal_fragment_maps>
{
  vec3 stGv = (viewMatrix * vec4(stBump, 0.0)).xyz;
  stGv -= normal * dot(stGv, normal);
  normal = normalize(normal - stGv);
}
`;

const FRAG_ROUGH = /* glsl */`
#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, uStWetRough, stWet);
`;

const DEFAULT_WARM = new THREE.Color(1.03, 1.0, 0.95);
const DEFAULT_COOL = new THREE.Color(0.93, 0.975, 1.04);

// AP1 round 3 (28 Oct 2026): the bed tone (base 0.90, spread 0.20), the lower-third tone (0.80), the bed-lip strength
// (0.34) and the value floor (0.25) become uniforms only for a material that passes one of the AP1 options, so the
// shader text and program key of every other stone material stay as they were (the hash locks read them).
const AP1_KEYS = ['lip', 'lowTone', 'toneBase', 'toneSpread', 'valFloor'];
const AP1_TUNED_GLSL = [
  ['uniform vec3 uStWarm, uStCool;', 'uniform float uStLip, uStLowTone, uStValFloor;\nuniform vec2 uStTone;\nuniform vec3 uStWarm, uStCool;'],
  ['(0.90 + 0.20 * stH1(floor(lbPh) + 51.0))', '(uStTone.x + uStTone.y * stH1(floor(lbPh) + 51.0))'],
  ['mix(0.80, 1.0, smoothstep(0.0, 0.33, lbH))', 'mix(uStLowTone, 1.0, smoothstep(0.0, 0.33, lbH))'],
  ['1.0 - 0.34 * smoothstep(0.72, 0.97, lbF)', '1.0 - uStLip * smoothstep(0.72, 0.97, lbF)'],
  ['max(val, 0.25)', 'max(val, uStValFloor)'],
];
function ap1Swap(glsl, pairs) {
  for (const [from, to] of pairs) {
    if (glsl.split(from).length !== 2) throw new Error(`stone-surface: AP1 literal not found once: ${from}`);
    glsl = glsl.replace(from, to);
  }
  return glsl;
}


/**
 * @param {object} [opts]
 * @param {THREE.ColorRepresentation} [opts.color]  base rock token colour
 * @param {number} [opts.roughness]   dry roughness
 * @param {number} [opts.wetRoughness] roughness inside the wet band
 * @param {number} [opts.waterY]      world height of the waterline
 * @param {number} [opts.wetTop]      height of the wet band above the waterline, metres
 * @param {number} [opts.scale]       feature-size divisor: 1 for stacks, 2 to 3 for boulders
 * @param {number} [opts.bed]         bedding value amplitude (0.07 = +/-7 %)
 * @param {boolean} [opts.vertexColors]
 * @param {number} [opts.lip]        AP1 round 3: bed-lip darkening under each 1.9 m ledge (default 0.34)
 * @param {number} [opts.lowTone]    AP1 round 3: ledge tone at the waterline, rising to 1 over the lower third (default 0.80)
 * @param {number} [opts.toneBase]   AP1 round 3: per-bed tone base (default 0.90)
 * @param {number} [opts.toneSpread] AP1 round 3: per-bed tone hash spread (default 0.20; the tone runs base to base + spread)
 * @param {number} [opts.valFloor]   AP1 round 3: floor of the albedo value term after joints, cracks and stains (default 0.25)
 *   The five are read with these defaults and are not written into userData.stone unless passed. Only a material that
 *   passes one of them compiles the uniform form (AP1_TUNED_GLSL) on its own program key; every other caller (Falls
 *   Creek, the shared Apostles materials) keeps the base shader text and program key byte for byte.
 */
export function createStoneMaterial(opts = {}) {
  const o = {
    color: '#a79e8c',
    roughness: 0.93,
    wetRoughness: 0.34,
    waterY: 0,
    wetTop: 1.5,
    wetDark: 0.20,
    scale: 1,
    bed: 0.09,
    fine: 0.11,
    stain: 0.20,
    joint: 0.26,
    crack: 0.30,
    bump: 0.045,
    seed: 0,
    vertexColors: true,
    flatShading: true,
    side: THREE.FrontSide,
    ...opts,
  };
  const material = new THREE.MeshStandardMaterial({
    color: o.color,
    roughness: o.roughness,
    metalness: 0,
    vertexColors: o.vertexColors,
    flatShading: o.flatShading,
    side: o.side,
    map: o.map ?? null,
  });
  material.userData.stone = o;
  material.onBeforeCompile = (shader) => {
    const u = shader.uniforms;
    u.uStWaterY = { value: o.waterY };
    u.uStWetTop = { value: o.wetTop };
    u.uStWetRough = { value: o.wetRoughness };
    u.uStWetDark = { value: o.wetDark };
    u.uStScale = { value: o.scale };
    u.uStBed = { value: o.bed };
    u.uStFine = { value: o.fine };
    u.uStBump = { value: o.bump };
    u.uStSeed = { value: o.seed };
    u.uStJoint = { value: o.joint };
    u.uStStain = { value: o.stain };
    u.uStCrack = { value: o.crack };
    u.uStWarm = { value: DEFAULT_WARM };
    u.uStCool = { value: DEFAULT_COOL };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', VERT_COMMON)
      .replace('#include <begin_vertex>', VERT_BEGIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', FRAG_COMMON)
      .replace('#include <color_fragment>', FRAG_COLOR)
      .replace('#include <normal_fragment_maps>', FRAG_NORMAL)
      .replace('#include <roughnessmap_fragment>', FRAG_ROUGH);
  };
  material.customProgramCacheKey = () => 'stone-surface-w6b-v1';
  // AP1 round 3: a material that passes one of the AP1 options wraps the base hook with the uniform form on its own
  // program key. The base hook above stays byte for byte, since track-gates and the airport locks hash its source.
  if (AP1_KEYS.some((key) => opts[key] != null)) {
    const baseHook = material.onBeforeCompile;
    material.onBeforeCompile = (shader) => {
      baseHook(shader);
      const u = shader.uniforms;
      u.uStLip = { value: o.lip ?? 0.34 };
      u.uStLowTone = { value: o.lowTone ?? 0.80 };
      u.uStTone = { value: new THREE.Vector2(o.toneBase ?? 0.90, o.toneSpread ?? 0.20) };
      u.uStValFloor = { value: o.valFloor ?? 0.25 };
      shader.fragmentShader = ap1Swap(shader.fragmentShader, AP1_TUNED_GLSL);
    };
    material.customProgramCacheKey = () => 'stone-surface-w6b-v1-ap1';
  }
  material.needsUpdate = true;
  return material;
}

// ---------------------------------------------------------------------------
// Deterministic scalar helpers
// ---------------------------------------------------------------------------

function hash(i, salt = 0) {
  const s = Math.sin(i * 12.9898 + salt * 78.233 + 1.0) * 43758.5453;
  return s - Math.floor(s);
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function vnoise2(x, y, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const h = (a, b) => hash(a * 57 + b * 131, seed);
  const a = h(ix, iy);
  const b = h(ix + 1, iy);
  const c = h(ix, iy + 1);
  const d = h(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// ---------------------------------------------------------------------------
// Form: subdivision, course recesses, crumble and planar fracture cuts
// ---------------------------------------------------------------------------

function subdivideOnce(positions, uvs, indices) {
  const edge = new Map();
  const pos = positions.slice();
  const uv = uvs ? uvs.slice() : null;
  const mid = (a, b) => {
    const key = a < b ? a * 4194304 + b : b * 4194304 + a;
    let m = edge.get(key);
    if (m === undefined) {
      m = pos.length / 3;
      pos.push((positions[a * 3] + positions[b * 3]) / 2,
        (positions[a * 3 + 1] + positions[b * 3 + 1]) / 2,
        (positions[a * 3 + 2] + positions[b * 3 + 2]) / 2);
      if (uv) uv.push((uvs[a * 2] + uvs[b * 2]) / 2, (uvs[a * 2 + 1] + uvs[b * 2 + 1]) / 2);
      edge.set(key, m);
    }
    return m;
  };
  const out = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t];
    const b = indices[t + 1];
    const c = indices[t + 2];
    const ab = mid(a, b);
    const bc = mid(b, c);
    const ca = mid(c, a);
    out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  return { positions: pos, uvs: uv, indices: out };
}

/**
 * Subdivide an indexed stone and push its vertices around as a pure function of
 * position, so duplicated seam vertices land together.
 *
 * @param {THREE.BufferGeometry} geometry indexed, with position (and optionally uv)
 * @param {object} o
 * @param {number} o.seed
 * @param {number} [o.levels]   midpoint subdivision levels (default 2)
 * @param {number} [o.baseY]    local height of the waterline
 * @param {number} [o.recess]   course recess depth as a fraction of the radius (0.1)
 * @param {number} [o.crumble]  low crumble amplitude, metres (0.08)
 * @param {number} [o.cuts]     planar fracture cuts (4)
 * @param {number} [o.cutDepth] depth range of a cut as a fraction of the radius (0.30)
 */
export function fractureStone(geometry, o) {
  const seed = o.seed ?? 0;
  const levels = o.levels ?? 2;
  let positions = Array.from(geometry.getAttribute('position').array);
  let uvs = geometry.getAttribute('uv') ? Array.from(geometry.getAttribute('uv').array) : null;
  let indices = Array.from(geometry.index.array);
  for (let l = 0; l < levels; l += 1) {
    const next = subdivideOnce(positions, uvs, indices);
    positions = next.positions;
    uvs = next.uvs;
    indices = next.indices;
  }
  const n = positions.length / 3;
  // Frame of the stone.
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  let minZ = Infinity; let maxZ = -Infinity;
  for (let i = 0; i < n; i += 1) {
    const x = positions[i * 3]; const y = positions[i * 3 + 1]; const z = positions[i * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const R = Math.max(0.5, Math.max(maxX - minX, maxZ - minZ) / 2);
  const H = Math.max(0.5, maxY - minY);
  const baseY = o.baseY ?? minY;
  const recess = (o.recess ?? 0.10) * R;
  const crumble = o.crumble ?? 0.08;
  const cutN = o.cuts ?? 4;
  const cutDepth = o.cutDepth ?? 0.30;

  // Planar fracture cuts: near-vertical planes, slightly canted, each taking a flat
  // facet off the broadest part of the stone.
  const cuts = [];
  for (let k = 0; k < cutN; k += 1) {
    const az = (k / Math.max(1, cutN)) * Math.PI * 2 + hash(seed, 400 + k) * 1.1;
    // Exactly vertical planes: a cut moves a vertex sideways only, so every ring of the
    // lattice keeps one height and the stone keeps its ring structure.
    const nx = Math.cos(az);
    const nz = Math.sin(az);
    const ny = 0;
    const d = R * (1 - cutDepth * (0.45 + 0.55 * hash(seed, 420 + k)));
    cuts.push({ nx, ny, nz, d });
  }

  // Course hardness: hard beds stand proud, soft beds are recessed, with a short
  // chamfer between them. Courses are 1.2 to 2.4 m.
  const course = (h) => {
    const c1 = h / 1.5;
    const c2 = h / 2.35 + 7;
    const k1 = Math.floor(c1);
    const k2 = Math.floor(c2);
    const hard1 = hash(k1 + seed * 13, 430);
    const hard2 = hash(k2 + seed * 17, 431);
    return { hard1, hard2, f1: c1 - k1, f2: c2 - k2, k1, k2 };
  };
  const hardAt = (h) => {
    // Smooth blend of neighbouring courses over 0.45 m so the step is a chamfer.
    const w = 0.45;
    const a = course(h - w);
    const b = course(h + w);
    const mixv = (u, v) => 0.5 * (u + v);
    return mixv(0.6 * a.hard1 + 0.4 * a.hard2, 0.6 * b.hard1 + 0.4 * b.hard2);
  };

  for (let i = 0; i < n; i += 1) {
    let x = positions[i * 3];
    let y = positions[i * 3 + 1];
    let z = positions[i * 3 + 2];
    const h = y - baseY;
    let rx = x - cx;
    let rz = z - cz;
    const rho = Math.hypot(rx, rz);
    const nxr = rho > 1e-5 ? rx / rho : 0;
    const nzr = rho > 1e-5 ? rz / rho : 0;
    // The top cap and the axis stay put; the flank moves.
    const flank = smooth(0.25 * R, 0.6 * R, rho);
    // Course recess: soft beds step back by up to `recess`.
    const hard = hardAt(h);
    const wet = 1 - smooth(0.2, 1.4, h);
    const step = -recess * (1 - hard) * (1 - 0.55 * wet) * flank;
    // Low crumble, kept off the lowest 0.4 m so the waterline footprint holds.
    const cr = (vnoise2(x * 0.7 + 3.1, y * 0.55 + z * 0.4, seed) - 0.5) * 2 * crumble * flank
      * smooth(0.3, 1.2, h);
    const push = step + cr;
    x += nxr * push;
    z += nzr * push;
    // Planar cuts, applied last so the flats stay flat. Only on the flank, and only
    // above the wet foot so the footprint survives.
    const gate = smooth(0.8, 2.4, h) * smooth(0.0, 0.25 * R, rho - 0.3 * R);
    if (gate > 0.01) {
      for (let k = 0; k < cuts.length; k += 1) {
        const c = cuts[k];
        const s = (x - cx) * c.nx + (z - cz) * c.nz - c.d;
        if (s > 0) {
          const amt = Math.min(1, gate * 1.5);
          x -= c.nx * s * amt;
          z -= c.nz * s * amt;
        }
      }
    }
    positions[i * 3] = x;
    positions[i * 3 + 2] = z;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (uvs) out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  out.setIndex(indices);
  out.computeVertexNormals();
  out.computeBoundingBox();
  return out;
}

// ---------------------------------------------------------------------------
// Baked occlusion
// ---------------------------------------------------------------------------

/**
 * Write the occlusion multiplier (times a base colour) into the `color` attribute.
 * Crevices, undercuts and the lowest `wetM` metres are darkened, upward faces lifted.
 *
 * @param {THREE.BufferGeometry} geometry indexed, with normals
 * @param {object} [o]
 * @param {number} [o.baseY]     local height of the waterline
 * @param {number} [o.wetM]      wet band height (1.5)
 * @param {number} [o.wetDark]   darkening in the wet band (0.22)
 * @param {number} [o.topLift]   lift on upward faces (0.10)
 * @param {number} [o.undercut]  darkening of downward faces (0.22)
 * @param {number} [o.cavity]    darkening in concave creases (0.28)
 * @param {number} [o.floor]     lowest multiplier (0.58)
 * @param {THREE.Color} [o.tint] base rock colour (linear) the occlusion multiplies (default white)
 * @param {boolean} [o.multiply] multiply the existing colour attribute instead of replacing it
 * @param {number} [o.crownT]    fraction of the height above which crown tint blends in
 */
export function bakeStoneOcclusion(geometry, o = {}) {
  const pos = geometry.getAttribute('position');
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  const nor = geometry.getAttribute('normal');
  const idx = geometry.index.array;
  const n = pos.count;
  const baseY = o.baseY ?? 0;
  const wetM = o.wetM ?? 1.5;
  const wetDark = o.wetDark ?? 0.22;
  const topLift = o.topLift ?? 0.10;
  const undercut = o.undercut ?? 0.22;
  const cavity = o.cavity ?? 0.28;
  const floor = o.floor ?? 0.58;

  // Weld coincident vertices so seam duplicates share neighbours.
  const weld = new Map();
  const canon = new Int32Array(n);
  for (let i = 0; i < n; i += 1) {
    const key = `${Math.round(pos.getX(i) * 400)},${Math.round(pos.getY(i) * 400)},${Math.round(pos.getZ(i) * 400)}`;
    const found = weld.get(key);
    if (found === undefined) {
      weld.set(key, i);
      canon[i] = i;
    } else canon[i] = found;
  }
  const sum = new Float64Array(n * 3);
  const cnt = new Int32Array(n);
  const edgeLen = new Float64Array(n);
  for (let t = 0; t < idx.length; t += 3) {
    for (let e = 0; e < 3; e += 1) {
      const a = canon[idx[t + e]];
      const b = canon[idx[t + (e + 1) % 3]];
      if (a === b) continue;
      const dx = pos.getX(b) - pos.getX(a);
      const dy = pos.getY(b) - pos.getY(a);
      const dz = pos.getZ(b) - pos.getZ(a);
      sum[a * 3] += pos.getX(b); sum[a * 3 + 1] += pos.getY(b); sum[a * 3 + 2] += pos.getZ(b);
      sum[b * 3] += pos.getX(a); sum[b * 3 + 1] += pos.getY(a); sum[b * 3 + 2] += pos.getZ(a);
      cnt[a] += 1; cnt[b] += 1;
      const len = Math.hypot(dx, dy, dz);
      edgeLen[a] += len; edgeLen[b] += len;
    }
  }
  let maxY = -Infinity;
  for (let i = 0; i < n; i += 1) maxY = Math.max(maxY, pos.getY(i));
  const colors = new Float32Array(n * 3);
  const tint = o.tint ?? null;
  const prior = o.multiply ? geometry.getAttribute('color') : null;
  for (let i = 0; i < n; i += 1) {
    const c = canon[i];
    const y = pos.getY(i);
    const h = y - baseY;
    const ny = nor.getY(i);
    let conc = 0;
    if (cnt[c] > 0) {
      const inv = 1 / cnt[c];
      const mx = sum[c * 3] * inv - pos.getX(i);
      const my = sum[c * 3 + 1] * inv - pos.getY(i);
      const mz = sum[c * 3 + 2] * inv - pos.getZ(i);
      const mean = edgeLen[c] * inv * 0.5 || 1;
      conc = (mx * nor.getX(i) + my * nor.getY(i) + mz * nor.getZ(i)) / mean;
    }
    const wet = 1 - smooth(wetM * 0.5, wetM * 1.35, h);
    const up = smooth(0.55, 0.95, ny);
    const down = smooth(0.1, -0.5, ny);
    let f = 1;
    f *= 1 - wetDark * wet;
    f *= 1 - undercut * down;
    f *= 1 - cavity * clamp01(conc * 1.6);
    f *= 1 + topLift * up;
    // A gentle climb with height: the foot of a stack is always the shadowed part.
    f *= 0.95 + 0.05 * smooth(0, Math.max(2, (maxY - baseY) * 0.5), h);
    f = Math.max(floor, f);
    colors[i * 3] = f * (tint ? tint.r : 1) * (prior ? prior.getX(i) : 1);
    colors[i * 3 + 1] = f * (tint ? tint.g : 1) * (prior ? prior.getY(i) : 1);
    colors[i * 3 + 2] = f * (tint ? tint.b : 1) * (prior ? prior.getZ(i) : 1);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// ---------------------------------------------------------------------------
// Ledge sites: where low scrub may stand
// ---------------------------------------------------------------------------

/**
 * Up-facing triangles that are a real ledge (broad enough, flat enough, above the
 * splash zone), picked deterministically. Positions are in the geometry's own space.
 */
export function findLedgeSites(geometry, o = {}) {
  const pos = geometry.getAttribute('position');
  const idx = geometry.index.array;
  const minH = o.minH ?? 2.6;
  const maxH = o.maxH ?? Infinity;
  const baseY = o.baseY ?? 0;
  const seed = o.seed ?? 0;
  const want = o.count ?? 8;
  const minArea = o.minArea ?? 0.12;
  const cand = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    a.fromBufferAttribute(pos, idx[t]);
    b.fromBufferAttribute(pos, idx[t + 1]);
    c.fromBufferAttribute(pos, idx[t + 2]);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    const nrm = ab.cross(ac);
    const area = nrm.length() / 2;
    if (area < minArea) continue;
    nrm.normalize();
    if (nrm.y < 0.82) continue;
    const cy = (a.y + b.y + c.y) / 3 - baseY;
    if (cy < minH || cy > maxH) continue;
    cand.push({
      x: (a.x + b.x + c.x) / 3,
      y: (a.y + b.y + c.y) / 3,
      z: (a.z + b.z + c.z) / 3,
      area,
      key: hash(t, seed + 500),
    });
  }
  cand.sort((p, q) => p.key - q.key);
  const picked = [];
  for (let i = 0; i < cand.length && picked.length < want; i += 1) {
    const p = cand[i];
    let ok = true;
    for (let j = 0; j < picked.length; j += 1) {
      if (Math.hypot(picked[j].x - p.x, picked[j].y - p.y, picked[j].z - p.z) < 1.6) { ok = false; break; }
    }
    if (ok) picked.push(p);
  }
  return picked;
}
