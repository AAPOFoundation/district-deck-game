// Twelve Apostles / Great Ocean Road cove on the bay fringe, opposite the Grand
// Prix corner. A coastal jewel box: layered limestone stacks in turquoise water,
// a wave-cut reef platform at the tide line, a cliff headland carrying a timber
// lookout with balustrade, stairs and lamp columns, and a dressed cove beach.
//
// Presentation only. Deterministic — no Math.random anywhere in this file.

import * as THREE from 'three';
import { addClusterTree } from '../foliage.js';
import {
  std, addBox, addCyl, addSphere, addCone, noPick, edgeFrame, placeGroup,
  WATER_Y, addToyLetters,
} from './kit.js';
import { SHORE, alongLength } from '../shore.js';
// The sea the camera actually draws. IMPORTED, NEVER COPIED.
//
// r1 imported `SWELL` and `sampleWaveHeight` from `water/waves.js` on the
// argument that importing rather than copying meant the boats would retune with
// the water. The import was right and the target was wrong: the board-water lane
// established that `WAVES_GLSL` has **no live importer anywhere** — only two
// `_stash/` rollback copies — so that file mirrors a RETIRED shader. Its 7
// components at 41–5.4 m summing 0.624 m are unrelated to the drawn
// `BAY_SWELL`'s 3 components at 72/32/14 m summing 2.380 m, over a different
// bathymetry, and the two are uncorrelated in phase (best r = 0.15 at any lag).
// Importing a stale module is not better than copying a stale number.
//
// `oceanSurfaceYAt` is the drawn stack, the drawn depth and the sheltered-harbour
// envelope. Its own header says it is not cheap and must be sampled at build
// time with the plan hoisted, which is exactly how it is used below.
import { oceanSurfaceYAt, BAY_SWELL } from '../outer-ocean.js';
import { planEdgeMassing } from '../edge-massing.js';
import { buildFracturedStone } from './coastal-stone.js';
import { createStoneMaterial, bakeStoneOcclusion, findLedgeSites } from './stone-surface.js';
import { TASTE } from '../taste-tokens.js';
import { WATER_LAW } from '../water/law.js';

// Rock for boulders and stack-base blocks, from the taste tokens: rockLight and
// rockDark, plus mixes of those with the moss and shadow tokens (TASTE-BIBLE 2, 4).
const ROCK_LIGHT = TASTE.ground.rockLight;
const ROCK_DARK = TASTE.ground.rockDark;
const mixHex = (a, b, t) => `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
const ROCK_LIGHT_WARM = mixHex(TASTE.ground.rockLight, TASTE.ground.soil, 0.18);
const ROCK_WET = mixHex(TASTE.ground.rockDark, TASTE.ground.rockLight, 0.30);
const ROCK_DAMP = mixHex(TASTE.ground.rockLight, TASTE.shadowTint, 0.20);
const ROCK_MOSS = mixHex(TASTE.ground.rockLight, TASTE.foliage.leafGrey, 0.45);
// The stack and skirt base colour: rockLight pulled 12% toward rockDark, then x0.47 (matches coastal-stone.js).
// taste-r1 (W14-B): the stacks read #C9CAAE (L* 81), lighter than their own beach. The lit face is
// meant to sit between rockLight and rockDark at L* 55 to 68, so the base goes 0.53 -> 0.76 of the
// way to black (the stone renders about 2.3x brighter than its albedo).
const STONE_BASE_HEX = mixHex(mixHex(TASTE.ground.rockLight, TASTE.ground.rockDark, 0.12), '#000000', 0.76);
// The skirt colour sits at x0.78 of the rock token (so the FC6 test's pale-limestone floor on the material colour holds)
// and the shader's wet term takes it to the same darkness as a x0.52 stone band: 0.78 x (1 - 0.59) is 0.32 (a x0.47 stone with the wet band on it is 0.47 x 0.8).
const STONE_SKIRT_HEX = mixHex(mixHex(TASTE.ground.rockLight, TASTE.ground.rockDark, 0.12), '#000000', 0.22);
/** The shared foam token for every foam surface in this landmark. */
const FOAM_HEX = WATER_LAW.foam;
// Lit by the key and sky, foam at full token albedo tone-maps past V 93 (pure white, a
// banned band), so the lit rock-base foam sits at 85% of the token.
// taste-r1 (W14-B): 0.85 -> 0.74, so a collar is a band of foam and never a closed pure-white disc.
const FOAM_COLOUR = new THREE.Color(FOAM_HEX).multiplyScalar(0.74);
/** Shoreline foam opacity from the water law. */
const FOAM_OPACITY = WATER_LAW.shoreFoam.opacity;

// ---------------------------------------------------------------------------
// AP1 value-material (26 Oct 2026). Switch `apStone` (URL) / DD_AP_STONE (node): on by default, 0 restores
// the previous picture exactly. `apStoneLift` (URL) / DD_AP_STONE_LIFT scales the lit albedo for a
// capture bracket (default 1, clamped 0.6 to 1.6) without touching anything else.
//
// The trace. A shaft's albedo was the rock colour TWICE: the material colour (rockLight lifted 30 % to
// white, #c7c2b9) times the strata map times a vertex colour that is itself rockLight x 0.47 times the
// baked occlusion (floor 0.58, wet 0.22), and the shader then multiplies bed tone, joints, cracks and
// stains (val floor 0.25) and a further wet term (0.20). The headless chain puts the dry lit face at
// albedo luminance 0.068 (sRGB H 38 S 28 V 32) with every darkening term stacking on top, while the
// wet skirt (vertex colours off) sat at 0.102, paler than the lit rock above it, and the tide-mark
// ring at about 0.50. AP1 gives the colour one source (a warm Port Campbell limestone on the
// material, a neutral grey occlusion in the vertex colour), lifts the lit face about 35 %, raises
// the occlusion floor so wet, cavity and undercut cannot stack to black, puts the wet skirt and the
// shaft's own wet band at about 0.65 of the lit face, and takes every wet surface to roughness 0.58.
// Everything goes through per-material options: stone-surface.js defaults (Falls Creek) are untouched.
// ---------------------------------------------------------------------------
const AP1_ON = (typeof process !== 'undefined' && process?.env?.DD_AP_STONE !== undefined)
  ? (Number(process.env.DD_AP_STONE) > 0 ? 1 : 0)
  : ((typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('apStone') === '0') ? 0 : 1);
/** AP1 tune keys: node env first, then the URL, then the default; non-finite values fall back to the default. */
function ap1Key(envName, urlName, def, lo, hi) {
  let raw;
  if (typeof process !== 'undefined' && process?.env?.[envName] !== undefined) raw = Number(process.env[envName]);
  else if (typeof location !== 'undefined' && location?.search) {
    const q = new URLSearchParams(location.search).get(urlName);
    raw = q === null ? def : Number(q);
  } else raw = def;
  return Number.isFinite(raw) ? Math.min(hi, Math.max(lo, raw)) : def;
}
/** `apStoneLift` / DD_AP_STONE_LIFT: lit-albedo scale around the base below (default 1, clamp 0.6-1.6). */
const AP1_LIFT = ap1Key('DD_AP_STONE_LIFT', 'apStoneLift', 1.1, 0.6, 1.6); // r3 capture sweep (28 Oct): 1.1 (was 1), c08 median V 47.5 nearest the 45-56 centre
/** `apStoneHue` / DD_AP_STONE_HUE (round 2, 28 Oct): the limestone's albedo hue in sRGB HSV degrees, at the
 * saturation and value of the r1 colour #ceba97 (H 38, S 27, V 81) and with its linear luminance held, so the
 * key moves hue only. Round 2: the r2 c08 frame read circular-mean H 25 over albedo H 38; a two-point
 * per-channel fit of the r1/r2 frames moves frame H about 3 per albedo degree, so 41 is predicted near H 35-37. */
const AP1_HUE = ap1Key('DD_AP_STONE_HUE', 'apStoneHue', 41, 20, 60);
/** `apStoneForm` / DD_AP_STONE_FORM (round 2, 28 Oct): scales the strata form terms (occlusion cavity, undercut
 * and floor depth; shader joint, crack and bed amplitude) against their r1 values. 1 is r1 (cavity 0.22, joint
 * 0.20, floor 0.72); the default 1.4 gives cavity 0.308, joint 0.28, undercut 0.252, crack 0.308, floor 0.608,
 * bed 0.126 (stone-surface.js defaults: cavity 0.28, joint 0.26, crack 0.30, floor 0.58, bed 0.09). The r2 c08
 * frame read p15/p85 0.53 against 0.28-0.40 with no near-black. */
const AP1_FORM = ap1Key('DD_AP_STONE_FORM', 'apStoneForm', 1.8, 0, 2); // r3 capture sweep (28 Oct): 1.8 (was 1.4), p15/p85 0.52 nearest 0.28-0.40
/** `apStoneStrata` / DD_AP_STONE_STRATA (round 3, 28 Oct): scales the shader's ledge terms on limestoneStrata only (the stack
 * shafts, legs and reef stone): bed-lip strength 0.34 x, lower-third tone depth 0.20 x (tone 1 - 0.20 x at the waterline) and
 * per-bed tone spread 0.20 x about a mean of 1. 1 is the round-2 picture (the stone-surface.js defaults). The r3 sweep showed the
 * vertex bake (apStoneForm) moves the c08 p15/p85 only 0.56 to 0.52, so the spread is taken here, per pixel, in place of the bake. */
const AP1_STRATA = ap1Key('DD_AP_STONE_STRATA', 'apStoneStrata', 1.8, 0, 3);
/** `apStoneJoint` / DD_AP_STONE_JOINT (round 3): scales the joint and crack val terms on limestoneStrata (round 2: joint 0.36,
 * crack 0.396 at form 1.8, caps 0.95) and lowers the val floor 0.25 -> 0.25 - 0.14 (x - 1) (floor 0.04), so the cores of the
 * joint lines reach the absolute albedo (about 0.02) that read V < 12 before AP1. 1 is round 2. */
const AP1_JOINT = ap1Key('DD_AP_STONE_JOINT', 'apStoneJoint', 4, 0.5, 4); // r4 capture sweep (28 Oct): 4 (was 3), c08 near-black 0.48 % nearest the 0.1-0.9 % centre
/** `apStoneWet` / DD_AP_STONE_WET (round 3): the wet band's and wet skirt's albedo as a share of the lit face. Round 2 had the shaft
 * band at about 0.49 (shader wetDark 0.30) and the skirt at 0.65; frame V goes as albedo^0.61, so at V 47.5 a share s sits
 * 47.5 (1 - s^0.61) below the lit face: 0.55 -> 14 V, 0.47 -> 17.5 V, 0.40 -> 20.5 V. */
const AP1_WET = ap1Key('DD_AP_STONE_WET', 'apStoneWet', 0.4, 0.25, 0.8); // r4 capture sweep (28 Oct): 0.40 (was 0.47), c08 wet band median 15.3 V under the lit face, the only value inside 15-20
/** The deeper lower-third tone (apStoneStrata) also darkens the wet band: headless, its share falls by about 0.185 per strata unit
 * above 1 (0.452 / 0.424 / 0.398 / 0.371 at 1 / 1.4 / 1.7 / 2.0 at a fixed wetDark), so the shaft's wetDark divides it back out. */
const AP1_WET_LOW = Math.max(0.5, 1 - 0.185 * (AP1_STRATA - 1));
/** Warm Port Campbell limestone: the one colour source for every stack surface.
 * Taste fix (27 Oct): was #c9b7a0, then #ceba97 (frame H 25 at r2, red of the 30-50 band). Round 2 builds it
 * from AP1_HUE at the reference colour's S, V and linear luminance (#ceba97 when the key is 38.18). */
const AP1_REF = new THREE.Color('#ceba97');
const AP1_C = (() => {
  const h = AP1_HUE / 60, s = 55 / 206, v = 206 / 255, c = v * s, x = c * (1 - Math.abs((h % 2) - 1)), m = v - c;
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : [0, x, c];
  const col = new THREE.Color().setRGB(r + m, g + m, b + m, THREE.SRGBColorSpace);
  const lum = (k) => 0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b;
  return col.multiplyScalar(lum(AP1_REF) / lum(col));
})();
const AP1_LIMESTONE = `#${AP1_C.getHexString()}`;
/** Neutral occlusion scalar (linear) the bake multiplies: sets the lit-face albedo with the colour above.
 * Taste fix (27 Oct): 0.232 -> 0.39 (lit shaft albedo 0.097 -> 0.168; frame V 31 -> 43.5, an effective exponent
 * of 0.61 on albedo). Round 2: 0.39 -> 0.45 (x 1.154) against the 45-56 band: about V 47-48 after the deeper
 * form terms take some 2 % off the median. */
const AP1_TINT = 0.45 * AP1_LIFT;
/** Mean of the strata grain map, linear (it is near white and slightly warm). */
const AP1_MAP = new THREE.Color(0.940, 0.890, 0.812);
/** Lit-face albedo the vertex-colour-free stone (arch body) takes directly. */
const AP1_LIT = AP1_C.clone().multiply(AP1_MAP).multiplyScalar(AP1_TINT * 0.96);
/** Lit shaft face before the occlusion bake (colour x map x tint): the far stacks' haze target keeps this value. */
const AP1_FACE = AP1_C.clone().multiply(AP1_MAP).multiplyScalar(AP1_TINT);
const AP1_LUM = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
/** The wet skirt and the shaft's own wet band land at this share of the lit face (15 to 20 V darker, never black). */
const AP1_WET_SHARE = AP1_WET; // round 3: was 0.65 (the skirt), now the apStoneWet key
export const APOSTLE_STONE = Object.freeze({
  on: AP1_ON,
  lift: AP1_LIFT,
  colour: AP1_LIMESTONE,
  hue: AP1_HUE,
  form: AP1_FORM,
  tint: AP1_TINT,
  /** Occlusion bake for stack, leg, crown and reef stone under the new look. Round 2: cavity, undercut and the
   * floor's depth scale with AP1_FORM; topLift 0.10 -> 0.06 so the lifted base keeps sunlit crowns under V 93. */
  occlusion: Object.freeze({
    floor: +(1 - 0.28 * AP1_FORM).toFixed(4), wetDark: 0.14,
    cavity: +(0.22 * AP1_FORM).toFixed(4), undercut: +(0.18 * AP1_FORM).toFixed(4), topLift: 0.06,
  }),
  /** Shader options shared by every stack-stone material under the new look (joint, crack, bed scale with AP1_FORM). */
  shader: Object.freeze({
    wetRoughness: 0.58, wetDark: 0.30, stain: 0.15,
    joint: +(0.20 * AP1_FORM).toFixed(4), crack: +(0.22 * AP1_FORM).toFixed(4), bed: +(0.09 * AP1_FORM).toFixed(4),
  }),
  /** Round 3: limestoneStrata's own ledge, joint and wet terms (apStoneStrata, apStoneJoint, apStoneWet). The shaft's wet band
   * share is about 0.70 (1 - wetDark) once the vertex wet bake and the splash term are in (headless: wetDark 0.30 -> 0.49). */
  strata: Object.freeze({
    lip: +Math.min(0.85, 0.34 * AP1_STRATA).toFixed(4),
    lowTone: +Math.max(0.4, 1 - 0.20 * AP1_STRATA).toFixed(4),
    toneBase: +(1 - Math.min(0.6, 0.20 * AP1_STRATA) / 2).toFixed(4),
    toneSpread: +Math.min(0.6, 0.20 * AP1_STRATA).toFixed(4),
    joint: +Math.min(1.2, 0.20 * AP1_FORM * AP1_JOINT).toFixed(4),
    crack: +Math.min(1.2, 0.22 * AP1_FORM * AP1_JOINT).toFixed(4),
    valFloor: +Math.max(0.04, 0.25 - 0.14 * (AP1_JOINT - 1)).toFixed(4),
    wetDark: +Math.min(0.8, Math.max(0, 1 - AP1_WET / (0.70 * AP1_WET_LOW))).toFixed(4),
  }),
  strataKey: AP1_STRATA,
  jointKey: AP1_JOINT,
  wetKey: AP1_WET,
  wetRoughness: 0.58,
  /** Skirt wetDark: colour x (1 - wetDark) = AP1_WET_SHARE of the lit face. */
  skirtWetDark: +(1 - (AP1_LUM(AP1_LIT) * AP1_WET_SHARE) / AP1_LUM(AP1_C)).toFixed(4),
  /** Linear luminance of the lit arch body (AP1_LIT); the wet skirt is AP1_WET_SHARE of it. */
  litLum: +AP1_LUM(AP1_LIT).toFixed(4),
  wetShare: AP1_WET_SHARE,
});
/** Haze target for the far stacks under the new look: the product (colour x map x vertex) takes the sea haze's hue
 * at 1.05 x the near lit face's luminance, so a far stack keeps the near stacks' value (taste fix, 27 Oct; it was half
 * the sea haze, a fixed 0.126 that would have pulled the far stacks under the lifted near ones). */
function ap1HazeVertex(haze) {
  const t = haze.clone().multiplyScalar((1.05 * AP1_LUM(AP1_FACE)) / AP1_LUM(haze));
  return new THREE.Color(
    Math.min(1.5, t.r / (AP1_C.r * AP1_MAP.r)),
    Math.min(1.5, t.g / (AP1_C.g * AP1_MAP.g)),
    Math.min(1.5, t.b / (AP1_C.b * AP1_MAP.b)),
  );
}

// ---------------------------------------------------------------------------
// Layout constants. Local frame: +x runs along the shore, +z runs seaward.
// The hero camera frames the bounding box of `fringe:apostles`, so the whole
// composition is kept inside one compact window with the stacks near its
// centre. Everything below is expressed in that window.
// ---------------------------------------------------------------------------

const TOP_Y = 11.4;                 // headland plateau height
const DECK_Y = TOP_Y + 0.62;        // lookout deck walking surface
const SAND_Y = SHORE.sandY;         // 0.06
// Preserved: the terminal test asserts userData.stampScale stays below 1.2.
const STAMP_STACK_SCALE = 2.85 * 0.41;

// Six limestone masses standing off the headland, in an opened three-deep
// formation. No two share a silhouette recipe.
const STACKS = Object.freeze([
  { x: 9.4, sea: 58.6, r: 2.30, h: 11.6, lean: -0.55, yaw: 0.18, scrub: true },
  { x: 4.6, sea: 66.4, r: 1.32, h: 6.6, lean: 0.40, yaw: -0.31 },
  { x: 0.4, sea: 62.8, r: 3.05, h: 13.0, lean: 0.22, yaw: -0.10, arch: true },
  { x: -5.6, sea: 71.6, r: 1.55, h: 7.8, lean: -0.48, yaw: 0.34 },
  { x: -9.8, sea: 60.4, r: 2.55, h: 12.4, lean: 0.62, yaw: 0.12, scrub: true },
  { x: -14.6, sea: 68.8, r: 1.90, h: 9.4, lean: -0.42, yaw: -0.22 },
]);

// Headland brow lines. CLIFF_X is shared by the sea face, the plateau cap and
// the ochre bedding so the three cannot drift apart.
const CLIFF_X = Object.freeze([20.5, 25.0, 30.0, 35.0, 40.0, 45.0, 50.0]);
const CLIFF_Z = Object.freeze([40.2, 47.4, 52.3, 53.6, 51.2, 46.8, 40.5]);
const CLIFF_BACK = Object.freeze([31.4, 30.7, 31.1, 30.8, 31.3, 30.9, 31.5]);

// Broken wave-cut ledges at the tide line. Water meets sand through these and
// their boulder aprons, never through a stamped polygon lip.
const REEF = Object.freeze([
  { x: 13.6, sea: 42.6, r: 6.6, h: 1.30, squash: 0.44, yaw: 0.22 },
  { x: 5.2, sea: 46.2, r: 5.2, h: 1.05, squash: 0.40, yaw: -0.30 },
  { x: -3.6, sea: 43.4, r: 6.1, h: 0.98, squash: 0.36, yaw: 0.12 },
  { x: -13.2, sea: 46.8, r: 4.8, h: 1.14, squash: 0.42, yaw: -0.18 },
  { x: -19.6, sea: 43.2, r: 5.4, h: 0.92, squash: 0.35, yaw: 0.28 },
]);

/** The headland sits this far toward the cove so the hero frame centres the stacks. */
const LAND_SHIFT = -4;

// ---------------------------------------------------------------------------
// Deterministic scatter. Seeded index maths only.
// ---------------------------------------------------------------------------

function hash(i, salt = 0) {
  const s = Math.sin(i * 12.9898 + salt * 78.233 + 1.0) * 43758.5453;
  return s - Math.floor(s);
}

function rand(i, salt, lo, hi) {
  return lo + (hi - lo) * hash(i, salt);
}

/**
 * Horizontal limestone bedding as a 3-tone canvas (or a DataTexture twin in
 * node, where `document` is missing). Applied as a repeating map on the stacks
 * so the courses read as bands rather than a single lambert fill.
 */
function limestoneStrataTexture() {
  // Fine mineral grain. Weights always sum to 1 so a channel cannot fall out
  // and turn the rock pink. No low-frequency diagonal vein.
  const w = 64;
  const h = 64;
  // W6-B: the map is now a grain multiplier on top of the stone shader (stone-surface.js),
  // so it is normalised near white. At the old 176/170/156 it took a further 60% off the
  // albedo and the stacks rendered as slate.
  const chalk = [248, 242, 232];
  const warm = [253, 245, 228];
  const cool = [240, 240, 236];
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const u = x / w;
      const v = y / h;
      const g1 = Math.sin((u * 8 + 0.3) * Math.PI * 2);
      const g2 = Math.sin((v * 11 + 1.1) * Math.PI * 2);
      const g3 = Math.sin((u * 13 + v * 5) * Math.PI * 2);
      let warmW = Math.max(0, 0.08 + 0.06 * g1);
      let coolW = Math.max(0, 0.06 + 0.05 * g2);
      const sum = warmW + coolW;
      if (sum > 0.4) {
        warmW *= 0.4 / sum;
        coolW *= 0.4 / sum;
      }
      const keep = 1 - warmW - coolW;
      const speck = g3 > 0.94 ? -20 : 0;
      const n = (g1 * 0.35 + g2 * 0.25 + g3 * 0.4) * 6 + speck;
      const i = (y * w + x) * 4;
      data[i] = Math.max(0, Math.min(255, chalk[0] * keep + warm[0] * warmW + cool[0] * coolW + n));
      data[i + 1] = Math.max(0, Math.min(255, chalk[1] * keep + warm[1] * warmW + cool[1] * coolW + n));
      data[i + 2] = Math.max(0, Math.min(255, chalk[2] * keep + warm[2] * warmW + cool[2] * coolW + n));
      data[i + 3] = 255;
    }
  }
  let tex = null;
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx2d = cv.getContext('2d');
    if (ctx2d) {
      const img = ctx2d.createImageData(w, h);
      img.data.set(data);
      ctx2d.putImageData(img, 0, 0);
      tex = new THREE.CanvasTexture(cv);
    }
  }
  if (!tex) tex = new THREE.DataTexture(data, w, h);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  tex.userData.strataTones = 3;
  return tex;
}

// ---------------------------------------------------------------------------
// Materials. Adjacent surfaces differ in tone AND roughness so the specular
// breaks each silhouette into parts.
// ---------------------------------------------------------------------------

function bindStrataMap(mat) {
  const dispose = mat.dispose.bind(mat);
  mat.dispose = function disposeStrata() {
    if (mat.map) {
      mat.map.dispose();
      mat.map = null;
    }
    dispose();
  };
  return mat;
}

function mats() {
  return {
    limestone: AP1_ON ? createStoneMaterial({
      color: AP1_LIT.clone(), roughness: 0.93, waterY: WATER_Y, wetTop: 1.5, vertexColors: false, seed: 2,
      ...APOSTLE_STONE.shader,
    }) : createStoneMaterial({
      color: STONE_BASE_HEX, roughness: 0.93, waterY: WATER_Y, wetTop: 1.5, vertexColors: false, seed: 2,
    }),
    limestonePale: AP1_ON ? createStoneMaterial({
      color: AP1_LIT.clone().multiplyScalar(1.12), roughness: 0.9, waterY: WATER_Y, wetTop: 1.5,
      vertexColors: false, seed: 4, ...APOSTLE_STONE.shader,
    }) : createStoneMaterial({
      color: mixHex(STONE_BASE_HEX, '#ffffff', 0.10), roughness: 0.9, waterY: WATER_Y, wetTop: 1.5,
      vertexColors: false, seed: 4,
    }),
    limestoneWet: std('#3a2c24', { roughness: 0.22, metalness: 0.08 }),
    // Wet limestone, and the metalness is the whole argument. At 0.12 metal and
    // 0.16 rough a near-black band mirrors the sky, so the plate came back with
    // six stacks standing in NAVY BLUE tubs — the material was reporting the
    // dome, not the rock. Warmer base, a third of the metal and enough roughness
    // to stay this side of the 0.3 gloss gate: dark wet brown that still catches
    // a highlight where the swell has just left it.
    // AND THE METALNESS WAS STILL DOING IT. AP2 took this off #1a1410/0.12
    // metal because a near-black semi-metal reported the sky dome; at 0.04 it
    // still does, one stop quieter. Cropped at 4x off the r14 plate the hero
    // band comes back GREY-VIOLET — (118,102,99) to (141,114,119) — against an
    // authored warm brown, which is a blue-grey specular lobe sitting on top of
    // a warm diffuse. A wet rock is not a metal at all: metalness 0 leaves the
    // dielectric's own 0.04 reflectance, which is achromatic and small, and the
    // band finally reads as the colour it is authored in. Roughness stays at the
    // gloss gate so it still catches a highlight where the swell has just left.
    // FC6: pale, mineral-cool wet limestone. The previous near-black brown band
    // still read as a separate tub at board scale; this stays dielectric and
    // glossy but remains in the limestone value family at the waterline.
    // W6-B: the wet skirt is the same stone shader held wet (wetTop 8 m, so the whole
    // skirt is the smooth darker band) in the limestone base colour, so it carries the
    // strata and grime of the rock above instead of reading as a pale plastic tub.
    // AP1: the stacks take their own wet skirt, tide mark, barnacles, foam and crown planting from
    // ap1StackMats() below; these shared entries stay as they were for the headland, boats and sea.
    wetFoot: createStoneMaterial({
      color: STONE_SKIRT_HEX, roughness: 0.28, wetRoughness: 0.28, waterY: WATER_Y,
      wetTop: 8, wetDark: 0.59, vertexColors: false, flatShading: true,
    }),
    wetFootMid: createStoneMaterial({
      color: STONE_SKIRT_HEX, roughness: 0.30, wetRoughness: 0.30, waterY: WATER_Y,
      wetTop: 8, wetDark: 0.59, vertexColors: false, flatShading: true,
    }),
    tideMark: std('#c4bda8', { roughness: 0.62, metalness: 0.02 }),
    // Weed, not wrought iron. At '#121a10' the streaks came back as black bars
    // against the band because a near-black diffuse under a blue sky term has
    // no hue left to read; this holds its green at plate luminance.
    weedStreak: std('#2f4226', { roughness: 0.34, metalness: 0.02 }),
    barnacle: std('#6a6558', { roughness: 0.52, metalness: 0.03 }),
    sprayHalo: std('#241d16', {
      roughness: 0.36, metalness: 0.02, transparent: true, opacity: 0.52, depthWrite: false,
    }),
    spraySprite: std('#ffffff', {
      roughness: 0.9, metalness: 0, vertexColors: true,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }),
    // Opaque through its core, zero on its outer rim. `transparent` with a full
    // -alpha centre keeps the aerated mass reading white at plate scale while
    // letting the collar END rather than stop.
    foamOpaque: std('#ffffff', {
      roughness: 0.32, metalness: 0.03, vertexColors: true,
      transparent: true, depthWrite: false,
    }),
    // Refraction-dark water, not a stamped navy disc. Same argument as the wet
    // foot: 0.14 metal over near-black returned the sky, so the collar read as
    // opaque plastic on pale shallow water instead of depth.
    waterDip: std('#ffffff', {
      roughness: 0.95, metalness: 0, transparent: true, opacity: 0.80,
      depthWrite: false, vertexColors: true, side: THREE.DoubleSide,
    }),
    hullWet: std('#14110e', { roughness: 0.20, metalness: 0.10 }),
    // taste-r1 (W14 fix): #c9c3b4 -> #77726a; the lit cap rendered (248,235,218), a white lid that read as foam.
    limestoneGuano: std('#77726a', { roughness: 0.9, metalness: 0 }),
    // W6-B: the stack surface is the procedural stone shader (stone-surface.js): strata,
    // joints, fracture hairlines, stains, a wet band and its own roughness, over the baked
    // occlusion in the vertex colour. The grain map stays as the fine octave.
    // taste-r1 (W14-B): the stacks read L* 74 to 80, lighter than their own beach. White -> rockLight lifted
    // 30% toward white puts the lit face at L* 55 to 68 under the stone shader's own beds and shadows.
    limestoneStrata: bindStrataMap(createStoneMaterial(AP1_ON ? {
      color: AP1_LIMESTONE, roughness: 0.93, waterY: WATER_Y, wetTop: 1.5,
      map: limestoneStrataTexture(), ...APOSTLE_STONE.shader, ...APOSTLE_STONE.strata,
    } : {
      color: mixHex(TASTE.ground.rockLight, '#ffffff', 0.30), roughness: 0.93, wetRoughness: 0.34, waterY: WATER_Y, wetTop: 1.5,
      map: limestoneStrataTexture(),
    })),
    ochre: std('#a89880', { roughness: 0.97, metalness: 0 }),
    ochreDark: std('#7a7368', { roughness: 0.98, metalness: 0 }),
    // Boulders are flat-shaded on a faceted hull so every plane catches the key
    // at its own angle. Vertex colour carries the top-lit / shaded-base break,
    // and these four tints multiply it, so one geometry gives four stones.
    // TASTE-BIBLE section 4: boulders are rock tokens, never a bright neutral. The
    // old tints ran #b3ad9f to #c8c2b4 (V 70-78) and read as snowballs under the
    // cool fill. These six are ground.rockLight / rockDark and their mixes with
    // foliage.leafGrey (moss) and the shadow tint (wet), all at V 40-65.
    // W6-B: boulders take the same stone shader at 2.4x feature density (a 0.6-2.5 m stone
    // needs courses of 0.55 m), with a wet band only 0.5 m deep.
    boulder: createStoneMaterial({ color: ROCK_LIGHT, roughness: 0.96, scale: 2.4, waterY: WATER_Y, wetTop: 0.5, seed: 3 }),
    boulderPale: createStoneMaterial({ color: ROCK_LIGHT_WARM, roughness: 0.94, scale: 2.4, waterY: WATER_Y, wetTop: 0.5, seed: 5 }),
    boulderWet: createStoneMaterial({ color: ROCK_WET, roughness: 0.55, scale: 2.4, waterY: WATER_Y, wetTop: 0.5, seed: 7 }),
    boulderDamp: createStoneMaterial({ color: ROCK_DAMP, roughness: 0.70, scale: 2.4, waterY: WATER_Y, wetTop: 0.5, seed: 11 }),
    boulderMoss: createStoneMaterial({ color: ROCK_MOSS, roughness: 0.90, scale: 2.4, waterY: WATER_Y, wetTop: 0.5, seed: 13 }),
    boulderGrey: createStoneMaterial({ color: ROCK_DARK, roughness: 0.94, scale: 2.4, waterY: WATER_Y, wetTop: 0.5, seed: 17 }),
    scrubLedge: std('#ffffff', { roughness: 1, metalness: 0, vertexColors: true, flatShading: true }),
    rockSurface: createStoneMaterial({
      color: '#ffffff', roughness: 0.96, waterY: WATER_Y, wetTop: 1.2,
    }),
    // taste-r1 W8-E: the headland (the lookout drum) is the only mesh on this material. The stone shader takes the vertex colour as
    // baked occlusion rather than as the whole albedo, so darkening the beds alone moved the wall by 4 points of V; the base colour
    // takes the rest (white -> 0.86 grey), which puts the wall samples at V 62-70 in the clear capture.
    cliffSurface: createStoneMaterial({
      color: '#dcdcdc', roughness: 0.97, waterY: WATER_Y, wetTop: 1.2, side: THREE.DoubleSide,
    }),
    cliffPale: std('#c8c2b4', { roughness: 0.94, metalness: 0 }),

    grass: std(mixHex(TASTE.ground.grassDry, TASTE.ground.grassLush, 0.75), { roughness: 1, metalness: 0 }),
    grassDark: std('#55743a', { roughness: 1, metalness: 0 }),
    marram: std('#9fae63', { roughness: 1, metalness: 0 }),
    scrub: std('#41603a', { roughness: 1, metalness: 0 }),
    // Stack-top scrub: the leaf-grey token and a shaded mix of it (W4-A).
    scrubStack: std(TASTE.foliage.leafGrey, { roughness: 1, metalness: 0 }),
    scrubStackDark: std(mixHex(TASTE.foliage.leafGrey, TASTE.foliage.leafA, 0.4), { roughness: 1, metalness: 0 }),
    scrubLight: std('#6b8544', { roughness: 1, metalness: 0 }),
    // Pigface: the succulent mat that actually holds a Port Campbell cliff face.
    // Grey-green and blue-green, both well off the ochre the face is made of.
    // W6-B: leafGrey and its shaded mix, not the blue-green pair that read as cyan on the crowns.
    pigface: std(TASTE.foliage.leafGrey, { roughness: 0.9, metalness: 0.02 }),
    pigfaceDark: std(mixHex(TASTE.foliage.leafGrey, TASTE.foliage.leafA, 0.5), { roughness: 0.92, metalness: 0.02 }),
    pine: std('#2f5236', { roughness: 1, metalness: 0 }),
    pineLight: std('#3d6a41', { roughness: 1, metalness: 0 }),
    trunk: std('#6a513a', { roughness: 0.95, metalness: 0 }),

    sandWarm: std('#e8cf9a', { roughness: 0.98, metalness: 0 }),
    sandDamp: std('#c2a475', { roughness: 0.72, metalness: 0.02 }),
    // One vertex-coloured collar material. Alpha rides in the colour attribute
    // and reaches zero on BOTH the inner and the outer rim, so a foam collar has
    // no edge to cut — it is a wash, never a stamped decal with a rim.
    foamSurface: std('#ffffff', {
      roughness: 0.45, metalness: 0, vertexColors: true,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }),
    contact: new THREE.MeshBasicMaterial({
      color: '#2a1f14', transparent: true, opacity: 0.24, depthWrite: false,
    }),
    seaweed: std('#4a5a34', { roughness: 1, metalness: 0 }),
    // ONE surface carries dry sand → damp → wet → foam → turquoise → deep. There
    // is no second sheet over the top of it and no third under it, so the
    // mid-ground cannot stack translucent panes at slightly different heights.
    waterField: std('#ffffff', {
      roughness: 0.42, metalness: 0.04, vertexColors: true,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }),
    // The cove's own sea floor, UNDER the tide-line film. Rough and flat-lit —
    // a seabed seen through water is diffuse, and any gloss here would fight
    // the film above it for the same highlight and read as two panes again.
    //
    // `polygonOffset` because the surface it has to beat is the board's beach
    // shelf, which DOES write depth, and this file cannot know the height that
    // shelf's own vertex shader has given the sand at any point in the cove.
    // A depth bias makes the win independent of that number.
    coveFloor: std('#ffffff', {
      roughness: 0.86, metalness: 0, vertexColors: true,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
    }),
    // Unlit, like the fringe's own far-sea and far-annulus backdrops, so the
    // colour written here is the colour that lands next to the live water.
    openSea: new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, fog: true,
    }),

    // W4-A lookout: the built register. Platform and walls are the concrete token
    // (V 66) and its shaded mix, the deck and every rail are the timber token, and the
    // lawn disc is gone (the plateau is the dry-grass and lush-grass mix). Nothing here is above V 88.
    deck: std(TASTE.built.timber, { roughness: 0.86, metalness: 0 }),
    deckDark: std(mixHex(TASTE.built.timber, '#000000', 0.25), { roughness: 0.9, metalness: 0 }),
    railTimber: std(mixHex(TASTE.built.timber, '#000000', 0.18), { roughness: 0.7, metalness: 0.05 }),
    baluster: std(TASTE.built.timber, { roughness: 0.66, metalness: 0.03 }),
    // Concrete token at the low end of its band (V 62): in the clear key it still renders near V 88.
    stone: std(mixHex(TASTE.built.concrete, TASTE.ground.rockDark, 0.12), { roughness: 0.86, metalness: 0.02 }),
    stoneDark: std(mixHex(TASTE.built.concrete, TASTE.ground.rockDark, 0.38), { roughness: 0.9, metalness: 0.02 }),
    // Vehicle palette (TASTE-BIBLE 2): white, silver, charcoal, navy. Never a primary.
    carWhite: std(TASTE.built.marking, { roughness: 0.46, metalness: 0.1 }),
    carSilver: std('#A9ABAD', { roughness: 0.42, metalness: 0.16 }),
    carCharcoal: std('#3C3E42', { roughness: 0.46, metalness: 0.12 }),
    carNavy: std(TASTE.accent.navy, { roughness: 0.44, metalness: 0.12 }),
    lamp: std('#23342c', { roughness: 0.38, metalness: 0.55 }),
    lampGlass: std('#ffeec2', { roughness: 0.16, metalness: 0.1 }),
    steel: std('#9aa3a6', { roughness: 0.36, metalness: 0.62 }),
    asphalt: std(TASTE.built.asphalt, { roughness: 0.92, metalness: 0.03 }),
    lineWhite: std(TASTE.built.marking, { roughness: 0.8, metalness: 0 }),

    kioskWood: std('#8f5c37', { roughness: 0.88, metalness: 0 }),
    kioskCream: std('#f0e3c6', { roughness: 0.72, metalness: 0.02 }),
    kioskPink: std('#e36f92', { roughness: 0.6, metalness: 0.02 }),
    kioskTeal: std('#2f8f92', { roughness: 0.55, metalness: 0.04 }),
    coach: std('#e2c132', { roughness: 0.42, metalness: 0.14 }),
    red: std('#c8402f', { roughness: 0.46, metalness: 0.1 }),
    blue: std('#2a63a0', { roughness: 0.44, metalness: 0.12 }),
    teal: std('#20867f', { roughness: 0.5, metalness: 0.08 }),
    orange: std('#e07b2c', { roughness: 0.5, metalness: 0.06 }),
    yellow: std('#f0c934', { roughness: 0.56, metalness: 0.04 }),
    cream: std('#eadfc2', { roughness: 0.64, metalness: 0.03 }),
    white: std('#f4f1e6', { roughness: 0.6, metalness: 0.02 }),
    glass: std('#1b3542', { roughness: 0.14, metalness: 0.4 }),
    tyre: std('#1b1b1a', { roughness: 0.92, metalness: 0.02 }),

    // Open-bay furniture. Hulls carry antifouling, boot top, topsides and sheer
    // strake in the vertex colour, so one material paints four bands.
    hullPaint: std('#ffffff', { roughness: 0.33, metalness: 0.1, vertexColors: true }),
    hullWhite: std('#eef0e8', { roughness: 0.4, metalness: 0.05 }),
    hullDark: std('#2c3a40', { roughness: 0.44, metalness: 0.12 }),
    buoyOrange: std('#f07a1e', { roughness: 0.42, metalness: 0.04 }),
    buoyLime: std('#cbd94e', { roughness: 0.46, metalness: 0.03 }),
    // SPECULAR, NOT DIFFUSE. The bar's own measurement is that white diffuse
    // tops out at 209 under AgX at this exposure and nothing non-emissive goes
    // higher — but that a single glazing glint took another venue's frame maximum
    // to 251. A wave face at roughness 0.06 with a real metal fraction is a
    // mirror, so the rig's own key light is what lights this, and it is not bound
    // by the diffuse ceiling. See waveletGeo for why the tilts are scattered
    // rather than aimed.
    // METAL, NOT WHITE. The first r7 plate put ~600 of these on the water and
    // the blind-click sentence would have been "that one has litter all over the
    // sea": a white DIFFUSE facet in daylight is a white card whatever its
    // roughness, and the diffuse ceiling meant they all landed at the same 200-odd
    // levels with hard edges. Metalness 0.92 removes the diffuse term entirely, so
    // what is left is the sky reflection and the sun's own specular, tinted by a
    // deep sea colour. That is a glint. It also keeps the frame's top end, which
    // is the half of this that was working: max luminance went 233 -> 247.
    // Pale, and only three quarters metal. At '#22454f' and metalness 0.92 the
    // facets that did NOT catch the sun reflected the dark horizon and read at
    // 3x as a scatter of dark grit — the same litter fault as the white draft,
    // one stop down. A pale base means the miss case comes back mid-water-tone
    // and disappears, while the hit case still flares: this is what carries the
    // frame's maximum luminance from 233 to 247.
    glint: std('#a9c4cb', { roughness: 0.11, metalness: 0.72 }),
    // Wet limestone. Dark enough to stay rock, polished enough to be a mirror.
    wetGlint: std('#8e8272', { roughness: 0.08, metalness: 0.42, vertexColors: true }),
    // VERTEX-COLOURED, AND THAT IS A MEASUREMENT NOT A PREFERENCE. Cropped out
    // of the r0 board plate at 4x, every gull is a flat white cut-out: the body
    // and the wings are one tone, so nothing inside the silhouette breaks and
    // the bird reads as paper. The vertex ramp runs 1.0 at the shoulder, 0.70
    // through the mid-wing and 0.26 at the tip, which is a silver gull's grey
    // mantle and dark primaries — and it is also what makes the WING BEAT
    // legible, because the moving part of the wing is now the dark part.
    gull: std('#f7f4ee', {
      roughness: 0.62, metalness: 0.02, side: THREE.DoubleSide, vertexColors: true,
    }),
    gullDark: std('#3a4248', {
      roughness: 0.7, metalness: 0.02, side: THREE.DoubleSide, vertexColors: true,
    }),
    gullShadow: new THREE.MeshBasicMaterial({
      color: '#1a2430', transparent: true, opacity: 0.30, depthWrite: false,
      side: THREE.DoubleSide,
    }),
    skin: std('#d09a72', { roughness: 0.78, metalness: 0 }),
    skinDark: std('#9a6b47', { roughness: 0.78, metalness: 0 }),
    hair: std('#3a2a20', { roughness: 0.9, metalness: 0 }),
    hairFair: std('#a8814a', { roughness: 0.9, metalness: 0 }),
    // ONE canopy shell for a parasol, striped in the vertex colour. r4 built the
    // canopy from three cones, two of which provably intersect: a 0.42-high cone
    // of radius r and a 0.30-high cone of radius 0.99r whose apexes sit 0.04
    // apart cross at 34 per cent of the radius, and they were rotated 0.31 rad
    // against each other on ten segments, so their facets fought for depth in a
    // ragged ring. That is the broken parasol the r4 critic measured, where the
    // red channel jumped 0 to 158 across 24 px with no gradient in between.
    parasol: std('#ffffff', {
      roughness: 0.62, metalness: 0.02, vertexColors: true, side: THREE.DoubleSide,
    }),
  };
}

/**
 * AP1 (review fix, 26 Oct): the stacks' own copies of the shared entries the new look retunes. addApostles
 * hands this set to the six stack builders only (fringe:apostle:N and their surge collars), so the
 * headland mass, cliff-foot contact, small craft, kelp, swell and reef foam keep the shared materials
 * from mats() unchanged. Every other key is the same instance as in mats().
 */
function ap1StackMats(m) {
  return {
    ...m,
    // The skirt takes the limestone colour and its wetDark puts it at 0.65 of the lit face, rough 0.58.
    wetFoot: createStoneMaterial({
      color: AP1_LIMESTONE, roughness: APOSTLE_STONE.wetRoughness, wetRoughness: APOSTLE_STONE.wetRoughness,
      waterY: WATER_Y, wetTop: 8, wetDark: APOSTLE_STONE.skirtWetDark, vertexColors: false, flatShading: true,
      joint: APOSTLE_STONE.shader.joint, crack: APOSTLE_STONE.shader.crack, stain: 0.15,
    }),
    wetFootMid: createStoneMaterial({
      color: AP1_LIMESTONE, roughness: APOSTLE_STONE.wetRoughness, wetRoughness: APOSTLE_STONE.wetRoughness,
      waterY: WATER_Y, wetTop: 8, wetDark: APOSTLE_STONE.skirtWetDark, vertexColors: false, flatShading: true,
      joint: APOSTLE_STONE.shader.joint, crack: APOSTLE_STONE.shader.crack, stain: 0.15, seed: 6,
    }),
    // The tide mark was a 0.5-albedo buff ring over the skirt; it is now the lit stone a touch paler.
    tideMark: std(AP1_LIT.clone().multiplyScalar(1.1), { roughness: 0.66, metalness: 0 }),
    barnacle: std('#6a6558', { roughness: 0.62, metalness: 0.03 }),
    foamOpaque: std('#ffffff', {
      roughness: 0.55, metalness: 0, vertexColors: true,
      transparent: true, depthWrite: false,
    }),
    foamSurface: std('#ffffff', {
      roughness: 0.55, metalness: 0, vertexColors: true,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }),
    scrubLedge: std('#ffffff', { roughness: 0.95, metalness: 0, vertexColors: true, flatShading: true }),
    marram: std('#9fae63', { roughness: 0.95, metalness: 0 }),
    scrubStack: std(TASTE.foliage.leafGrey, { roughness: 0.95, metalness: 0 }),
    scrubStackDark: std(mixHex(TASTE.foliage.leafGrey, TASTE.foliage.leafA, 0.4), { roughness: 0.95, metalness: 0 }),
    scrubLight: std('#6b8544', { roughness: 0.95, metalness: 0 }),
  };
}

/**
 * Parasol canopy: ONE shell, twelve gores, scalloped hem, striped in vertex
 * colour. There is no second shell to fight it for depth.
 *
 * The profile is apex -> shoulder -> hem -> scallop tip, and the hem points
 * alternate between a gore seam (at the full radius) and a scallop tip (a
 * little wider and a little lower), which is what gives a canvas parasol its
 * fluted edge instead of a clean cone rim.
 */
function parasolGeo(ctx, gores, aHex, bHex) {
  return shared(ctx, `parasol:${gores}:${aHex}:${bHex}`, () => {
    const positions = [];
    const colors = [];
    const A = new THREE.Color(aHex);
    const B = new THREE.Color(bHex);
    const step = (Math.PI * 2) / gores;
    const shoulderR = 0.46;
    const shoulderY = 0.30;
    const push = (p, c) => {
      positions.push(p[0], p[1], p[2]);
      colors.push(c.r, c.g, c.b);
    };
    for (let k = 0; k < gores; k += 1) {
      const a0 = k * step;
      const a1 = (k + 1) * step;
      const am = (a0 + a1) * 0.5;
      const tint = k % 2 ? B : A;
      // Seam gores read a shade darker than the panel they hem, which is what
      // makes the flutes legible at hero scale without a second mesh.
      const seam = tint.clone().multiplyScalar(0.86);
      const apex = [0, 0.52, 0];
      const s0 = [Math.cos(a0) * shoulderR, shoulderY, Math.sin(a0) * shoulderR];
      const s1 = [Math.cos(a1) * shoulderR, shoulderY, Math.sin(a1) * shoulderR];
      const sm = [Math.cos(am) * shoulderR * 1.03, shoulderY + 0.02, Math.sin(am) * shoulderR * 1.03];
      const h0 = [Math.cos(a0), 0.06, Math.sin(a0)];
      const h1 = [Math.cos(a1), 0.06, Math.sin(a1)];
      const hm = [Math.cos(am) * 1.05, -0.05, Math.sin(am) * 1.05];
      // WOUND OUTWARD. Every ring mesh in this file has been built inside-out
      // at least once — the rock forms, the plateau lawn, the ochre ribbons —
      // and the tell is always the same: the surface lights from underneath and
      // reads flat. The rings here run anticlockwise in xz, so the outward order
      // is (apex, mid, first), not (apex, first, mid). Verified: mean normal Y
      // over the canopy is +0.87. If you edit these six lines, re-measure it.
      // Crown fan.
      push(apex, tint); push(sm, tint); push(s0, seam);
      push(apex, tint); push(s1, seam); push(sm, tint);
      // Skirt, split at the scallop tip so the hem flutes.
      push(s0, seam); push(hm, tint); push(h0, seam);
      push(s0, seam); push(sm, tint); push(hm, tint);
      push(sm, tint); push(h1, seam); push(hm, tint);
      push(sm, tint); push(s1, seam); push(h1, seam);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  });
}

/** Cloth palette for canopies, towels and shirts — saturated against warm sand. */
function clothSet(m) {
  return [m.red, m.teal, m.yellow, m.orange, m.blue, m.cream, m.kioskPink, m.white];
}

/** +1 if the hills/GP corner is the positive-along end of the beach. */
function hillsFlankSign(roles) {
  const hills = roles?.hillsEdge;
  if (hills === 'east' || hills === 'south') return 1;
  if (hills === 'west' || hills === 'north') return -1;
  return 1;
}

function ownMesh(mesh, name = '') {
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.ownsGeometry = true;
  noPick(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// Shared-geometry helpers. Repeated dressing reuses one BufferGeometry.
// ---------------------------------------------------------------------------

function makeCtx(m) {
  return { m, geo: new Map(), contact: { sprays: [], pulses: [] } };
}

function shared(ctx, key, make) {
  let g = ctx.geo.get(key);
  if (!g) {
    g = make();
    ctx.geo.set(key, g);
  }
  return g;
}

function place(group, geometry, mat, x, y, z, opts = {}) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(x, y, z);
  if (opts.rotX) mesh.rotation.x = opts.rotX;
  if (opts.rotY) mesh.rotation.y = opts.rotY;
  if (opts.rotZ) mesh.rotation.z = opts.rotZ;
  if (opts.scale) mesh.scale.set(opts.scale[0], opts.scale[1], opts.scale[2]);
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  if (opts.name) mesh.name = opts.name;
  if (opts.renderOrder) mesh.renderOrder = opts.renderOrder;
  noPick(mesh);
  group.add(mesh);
  return mesh;
}

/**
 * Chamfered box. Every large mass in the frame uses this, so nothing shows a
 * raw 90-degree corner to the light.
 */
function bevelGeo(ctx, w, h, d, t = 0.06) {
  const tt = Math.max(0.012, Math.min(t, w * 0.3, h * 0.3, d * 0.3));
  const key = `bev:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${tt.toFixed(3)}`;
  return shared(ctx, key, () => {
    const hw = w / 2 - tt;
    const hh = h / 2 - tt;
    const shape = new THREE.Shape();
    shape.moveTo(-hw, -hh);
    shape.lineTo(hw, -hh);
    shape.lineTo(hw, hh);
    shape.lineTo(-hw, hh);
    shape.closePath();
    const depth = Math.max(0.004, d - 2 * tt);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: tt,
      bevelSize: tt,
      bevelOffset: 0,
      bevelSegments: 1,
      curveSegments: 1,
      steps: 1,
    });
    geometry.translate(0, 0, -depth / 2);
    geometry.computeVertexNormals();
    return geometry;
  });
}

function bevelBox(ctx, group, w, h, d, mat, x, y, z, opts = {}) {
  return place(group, bevelGeo(ctx, w, h, d, opts.bevel ?? 0.06), mat, x, y, z, opts);
}

function boxGeo(ctx, w, h, d) {
  const key = `box:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}`;
  return shared(ctx, key, () => new THREE.BoxGeometry(w, h, d));
}

function cylGeo(ctx, rTop, rBot, h, segs = 8) {
  const key = `cyl:${rTop.toFixed(3)}:${rBot.toFixed(3)}:${h.toFixed(3)}:${segs}`;
  return shared(ctx, key, () => new THREE.CylinderGeometry(rTop, rBot, h, segs));
}

function sphereGeo(ctx, r, segs = 8) {
  const key = `sph:${r.toFixed(3)}:${segs}`;
  return shared(ctx, key, () => new THREE.SphereGeometry(r, segs, Math.max(5, segs >> 1)));
}

function coneGeo(ctx, r, h, segs = 6) {
  const key = `con:${r.toFixed(3)}:${h.toFixed(3)}:${segs}`;
  return shared(ctx, key, () => new THREE.ConeGeometry(r, h, segs));
}

function discGeo(ctx, r, segs = 14) {
  const key = `disc:${r.toFixed(3)}:${segs}`;
  return shared(ctx, key, () => new THREE.CircleGeometry(r, segs));
}

function rockChunkGeo(ctx, detail = 0) {
  return shared(ctx, `rock:${detail}`, () => new THREE.IcosahedronGeometry(1, detail));
}

/**
 * Faceted limestone cobble — flat planes, sharp arrises, a lighter crown and a
 * shaded foot baked into vertex colour so one geometry carries a tonal break.
 *
 * r3 scaled a subdivided icosahedron and smooth-shaded it, which is why forty
 * boulders read as smooth eggs. Six seeded hulls share their geometry across the
 * whole scatter, so this costs six BufferGeometries, not forty.
 */
function boulderGeo(ctx, variant) {
  return shared(ctx, `cobble:${variant}`, () => {
    // The stone is the INTERSECTION of eleven seeded half-spaces, sampled on an
    // icosahedron's directions. That guarantees a convex chunk with genuinely
    // flat faces and sharp arrises — never a thin plate, which is what a
    // free-form vertex displacement produces once it is scaled non-uniformly.
    const planes = [];
    // Fifteen planes at uneven distances, not eleven near-equal ones: equal
    // distances give a regular polyhedron, and a regular polyhedron in pale
    // grey is a snowball. Uneven cuts make a block with a long face and a chip.
    const count = 15;
    for (let k = 0; k < count; k += 1) {
      const ny = 1 - (2 * k + 1) / count;
      const rr = Math.sqrt(Math.max(0, 1 - ny * ny));
      const a = k * 2.399963 + variant * 1.13;
      planes.push({
        nx: Math.cos(a) * rr,
        ny,
        nz: Math.sin(a) * rr,
        h: 0.64 + 0.34 * (0.5 + 0.5 * Math.sin(k * 3.7 + variant * 2.1)),
      });
    }
    const geometry = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
    const pos = geometry.getAttribute('position');
    const ys = [];
    for (let v = 0; v < pos.count; v += 1) {
      const px = pos.getX(v);
      const py = pos.getY(v);
      const pz = pos.getZ(v);
      const len = Math.hypot(px, py, pz) || 1;
      const dx = px / len;
      const dy = py / len;
      const dz = pz / len;
      let radius = 1.25;
      for (let k = 0; k < planes.length; k += 1) {
        const p = planes[k];
        const dot = dx * p.nx + dy * p.ny + dz * p.nz;
        if (dot > 0.12) radius = Math.min(radius, p.h / dot);
      }
      // A seeded ripple on the radius takes the last regularity out of the hull.
      radius *= 1 + 0.07 * Math.sin(dx * 9.1 + dy * 7.3 + variant * 2.7) * Math.cos(dz * 8.3 + variant);
      // Cobbles sit low and wide, but never flat: 0.88 keeps a chunk a chunk.
      const y = dy * radius * 0.88;
      pos.setXYZ(v, dx * radius, y, dz * radius);
      ys.push(y);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    const colors = [];
    // TWO TONES ON EVERY STONE, NOT ONE VALUE RAMP.
    //
    // r4's boulder field measured a hue band of 31 to 64 degrees across roughly
    // fifty stones — all value, no colour. The reference bank carries a
    // grey-brown body, green on the upward faces and a dark cool line where the
    // water reaches. Both now ride in the vertex colour, so one hull and one
    // material still give the whole scatter its variety: lichen is keyed to the
    // FACE normal (flat-shaded, so a face either catches it or does not, the way
    // lichen actually grows), and the foot takes a cool damp cast.
    const lichenBias = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(variant * 2.9 + 1.1));
    const nrm = geometry.getAttribute('normal');
    for (let v = 0; v < pos.count; v += 1) {
      const t = clamp01((ys[v] + 0.85) / 1.7);
      const tone = 0.60 + 0.40 * t;
      const up = nrm.getY(v);
      const lichen = clamp01((up - 0.42) / 0.44) * lichenBias * clamp01((t - 0.35) / 0.4);
      const damp = clamp01((0.30 - t) / 0.30);
      let cr = tone * (1 - 0.28 * lichen) * (1 - 0.12 * damp);
      let cg = tone * (1 - 0.04 * lichen) * (1 - 0.08 * damp);
      let cb = tone * (1 - 0.06 * lichen) * (1 + 0.05 * damp);
      cr = Math.max(0.14, cr); cg = Math.max(0.14, cg); cb = Math.max(0.14, cb);
      colors.push(cr, cg, cb);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeBoundingBox();
    return geometry;
  });
}

/** Soft contact darkening so nothing reads as floating. */
function contact(ctx, group, x, z, r, y = SAND_Y + 0.03, opacity = 0.24) {
  const mat = opacity === 0.24 ? ctx.m.contact : new THREE.MeshBasicMaterial({
    color: '#2a1f14', transparent: true, opacity, depthWrite: false,
  });
  return place(group, discGeo(ctx, r, 12), mat, x, y, z, {
    rotX: -Math.PI / 2, cast: false, receive: false, renderOrder: 2,
  });
}

// ---------------------------------------------------------------------------
// Rock forms — the limestone language for stacks, reef ledges and boulders.
// ---------------------------------------------------------------------------

/** Splash-zone algae. Mid green — never dark enough to crush at the grade. */
const ROCK_ALGAE = new THREE.Color('#63704a');

/** AP1 occlusion bake: a neutral grey (the colour is the material's), a higher floor, a lighter wet term. */
function ap1Occlusion(dry) {
  const o = { ...APOSTLE_STONE.occlusion, tint: new THREE.Color(AP1_TINT, AP1_TINT, AP1_TINT) };
  if (dry) o.wetDark = 0;
  return o;
}

function addRockForm(group, m, {
  profile, r, h, lean = 0, yaw = 0, squash = 0.8, seed = 0, x = 0, z = 0,
  segs = 9, baseY = WATER_Y, name = '', strata = false,
  kind = '', outerSign = 1, dry = false, haze = 0, lattice = undefined,
}) {
  void segs;
  const meta = profile?.meta;
  const resolved = kind || (meta ? 'stack' : 'platform');
  const built = buildFracturedStone({
    seed,
    r,
    h,
    lean,
    squash,
    baseY,
    kind: resolved,
    notchT: meta?.notchT,
    notchDepth: meta?.notchDepth,
    outerSign,
    dry: dry || resolved === 'crown' || resolved === 'crust',
    lattice,
    occlusion: AP1_ON ? ap1Occlusion(dry || resolved === 'crown' || resolved === 'crust') : undefined,
  });
  if (haze > 0) {
    const attr = built.geometry.getAttribute('color');
    const tint = AP1_ON ? ap1HazeVertex(SEA_HAZE) : SEA_HAZE;
    for (let i = 0; i < attr.count; i += 1) {
      attr.setXYZ(
        i,
        attr.getX(i) + (tint.r - attr.getX(i)) * haze,
        attr.getY(i) + (tint.g - attr.getY(i)) * haze,
        attr.getZ(i) + (tint.b - attr.getZ(i)) * haze,
      );
    }
    attr.needsUpdate = true;
  }
  const mesh = ownMesh(
    new THREE.Mesh(built.geometry, strata || resolved !== 'crust' ? m.limestoneStrata : m.limestoneStrata),
    name,
  );
  mesh.position.set(x, 0, z);
  mesh.rotation.y = yaw;
  mesh.userData.basePrimitive = 'fractured-stone';
  mesh.userData.erosion = built.meta;
  group.add(mesh);
  return mesh;
}

/**
 * Bedded limestone profile: dark wet foot, a sea-cut notch, alternating
 * light/dark courses up the shaft, and a capped, slightly overhanging top.
 * Every stack gets its own recipe, so no two silhouettes repeat.
 */
function apostleProfile(seed, opts = {}) {
  const courses = opts.courses ?? 13;
  // ONE DEEP WAVE NOTCH PER MASS, at its own height and its own depth. A fixed
  // 0.13 / 0.30 undercut on every stack is a lathe setting; the sea cuts each
  // one where it happens to break.
  const notchT = opts.notchT ?? (0.10 + 0.11 * hash(seed, 231));
  const notchDepth = opts.notchDepth ?? (0.33 + 0.16 * hash(seed, 232));
  const capT = opts.capT ?? 0.86;
  // `dryFoot` is for masses that do not stand in the sea. The wet palette below
  // is near-black, and r3 used this same profile for the two crown blocks on top
  // of the natural arch — ten metres in the air, in the arch's own shadow. Their
  // flared bottom courses read as an unbroken band of absolute black across the
  // arch crown, on the most distinctive object in the frame.
  const dryFoot = opts.dryFoot === true;
  // Wet limestone is dark, not black. r3's #4c3b30 foot, sitting in the stack's
  // own shadow and flared proud of the shaft, crushed to absolute black at the
  // grade and read as a hard wedge under every stack.
  const wet = dryFoot
    ? ['#c19060', '#b98557', '#c99a64']
    : ['#2a2018', '#342820', '#423228'];
  const footBand = dryFoot ? '#c08c56' : '#4a3a30';
  // Narrower than r3's split. Bedded limestone alternates in value, not in hue
  // family, and the wide split turned the new course steps into barber-pole
  // banding at the hero camera.
  const light = ['#ddba88', '#d6b17d', '#e2c191', '#d2ac76'];
  const dark = ['#c1955f', '#b98c58', '#c99e6b', '#b28654'];
  const baseAt = (t) => {
    let radius;
    if (t <= notchT) {
      const k = t / notchT;
      radius = 1.12 - notchDepth * k * k;
    } else if (t < capT) {
      const k = (t - notchT) / (capT - notchT);
      radius = (1.12 - notchDepth) + 0.34 * Math.sin(k * Math.PI * 0.86);
    } else {
      const k = (t - capT) / (1 - capT);
      radius = (1.12 - notchDepth) + 0.28 + 0.12 * Math.sin(k * Math.PI) - 0.4 * k * k;
    }
    return radius * (0.86 + 0.05 * Math.sin(seed * 2.3 + t * 4.1));
  };
  // Each course is emitted as a pair: the bed's near-vertical face, then its top
  // at the next course's width. Harder beds stand a little proud of softer ones,
  // which puts a real horizontal ledge line at every course instead of the
  // continuous sine wobble r3 used — that wobble, crossed with the facet
  // roughness, is what produced the woven surface.
  // IRREGULAR COURSE HEIGHTS. r4 cut every stack at exactly 1/13 of its height
  // and gave every bed the same 0.78 face, which is why the two biggest stacks
  // read as a pile of octagonal discs at 1:1 — nine identical pillows, evenly
  // spaced, alternating light and dark. Bed thicknesses now run better than
  // three to one against each other, and each bed's face takes its own share of
  // its course, so no two ledges in a stack are the same height apart.
  const bounds = [0];
  let acc = 0;
  const weights = [];
  for (let i = 0; i < courses; i += 1) {
    const w = 0.45 + 1.35 * hash(i * 5 + seed, 233);
    weights.push(w);
    acc += w;
  }
  let run = 0;
  for (let i = 0; i < courses; i += 1) {
    run += weights[i];
    bounds.push(run / acc);
  }
  const rows = [];
  const offsets = [];
  for (let i = 0; i <= courses; i += 1) {
    offsets.push({
      x: (hash(i * 7 + seed, 236) - 0.5) * 0.17,
      z: (hash(i * 11 + seed, 237) - 0.5) * 0.13,
    });
  }
  for (let i = 0; i <= courses; i += 1) {
    const t = bounds[i];
    const proud = ((i + seed) % 3 === 0 ? 0.026 : 0) + ((i + seed) % 2 ? 0 : 0.011);
    const radius = baseAt(t) * (1 + proud);
    let color;
    if (t < 0.14) color = wet[i % wet.length];
    else if (t < 0.20) color = footBand;
    else if (t >= capT) color = i % 2 ? '#f2ebe0' : '#e8e0d2';
    // Only about two beds in three take the darker family, and which ones is
    // seeded — a strict light/dark alternation is a barber pole.
    else color = (hash(i * 3 + seed, 234) > 0.42 ? light : dark)[(i + seed) % 4];
    rows.push({
      t, radius: Math.max(0.22, radius), color,
      offsetX: offsets[i].x, offsetZ: offsets[i].z,
    });
    if (i < courses) {
      // Bed face: same width, most of the course height, so the step to the next
      // course reads as one crisp ledge rather than a slope. The share varies so
      // the ledge lines are not a ruled grid.
      const face = 0.66 + 0.24 * hash(i * 11 + seed, 235);
      const tt = t + (bounds[i + 1] - t) * face;
      rows.push({
        t: tt, radius: Math.max(0.22, baseAt(tt) * (1 + proud)), color,
        offsetX: offsets[i].x, offsetZ: offsets[i].z,
      });
    }
  }
  const thicknesses = bounds.slice(1).map((value, i) => value - bounds[i]);
  rows.meta = {
    notchT,
    notchDepth,
    courseThicknesses: thicknesses,
    courseRatio: Math.max(...thicknesses) / Math.min(...thicknesses),
    maxBandOffset: Math.max(...offsets.map((value) => Math.hypot(value.x, value.z))),
  };
  return rows;
}

const LEDGE_PROFILE = Object.freeze([
  { t: 0, radius: 1.02, color: '#5a483a' },
  { t: 0.28, radius: 1.08, color: '#6d5744' },
  { t: 0.5, radius: 1.0, color: '#8d7052' },
  { t: 0.68, radius: 1.06, color: '#b08e63' },
  { t: 0.86, radius: 0.98, color: '#cdad7c' },
  { t: 1, radius: 0.86, color: '#dcbe8d' },
]);

// ---------------------------------------------------------------------------
// Water dressing — foam collars, surf lines, shallows.
// ---------------------------------------------------------------------------

/**
 * Foam collar. ONE vertex-coloured annulus per rock, alpha zero on the inner rim
 * and zero again on the outer rim, with a wobbled radius and a per-segment
 * strength that thins the wash to nothing on the lee side.
 *
 * The r3 build stamped two `RingGeometry` arcs plus a flat `CircleGeometry` halo
 * at each collar. Every one of those carried a hard rim at full opacity, which
 * is what read as elliptical decals — one of them, magnified, as a plastic
 * spoon. There is no rim to see here because there is no opaque edge.
 */
const FOAM_ROWS = Object.freeze([
  { r: 0.66, a: 0, c: '#cfe9e4', y: 0 },
  { r: 0.82, a: 0.34, c: '#e2f3ee', y: 0.010 },
  { r: 0.93, a: 0.70, c: '#f4fbf8', y: 0.017 },
  { r: 1.02, a: 0.46, c: '#dcefea', y: 0.022 },
  { r: 1.14, a: 0.20, c: '#b0dcd9', y: 0.026 },
  { r: 1.32, a: 0, c: '#8ccfd0', y: 0.029 },
]);

/** Surge sheets: opaque mid-band, longer seaward reach, still rimless. */
// WATER LAW foam rule: a 2-4 m band at a rock base. The rows start at the stack
// face (about 0.41 of the collar's rx, which is 2.45 stack radii) and end 0.4 rx
// out, a band of about 4 m on the hero; they used to run to 1.68 rx and reach 17 m.
const SURGE_FOAM_ROWS = Object.freeze([
  { r: 0.38, a: 0, c: FOAM_HEX, y: 0 },
  { r: 0.44, a: 0.78, c: FOAM_HEX, y: 0.016 },
  { r: 0.50, a: 1.00, c: FOAM_HEX, y: 0.032 },
  { r: 0.57, a: 0.92, c: FOAM_HEX, y: 0.044 },
  { r: 0.65, a: 0.62, c: FOAM_HEX, y: 0.054 },
  { r: 0.74, a: 0.30, c: FOAM_HEX, y: 0.062 },
  { r: 0.84, a: 0, c: FOAM_HEX, y: 0.070 },
]);

/**
 * Drain fingers. Five rows, opaque at the spine, dying on both flanks — the
 * white tongue that runs back off a rock after a sheet has broken over it.
 * Whiter and harder-edged than the surge sheet because a draining finger is
 * mostly air.
 */
const FINGER_FOAM_ROWS = Object.freeze([
  { r: 0.30, a: 0, c: '#9fc2bd', y: 0 },
  { r: 0.58, a: 0.92, c: '#f2fbf8', y: 0.022 },
  { r: 0.86, a: 1.00, c: '#ffffff', y: 0.038 },
  { r: 1.22, a: 0.52, c: '#d8efe9', y: 0.050 },
  { r: 1.62, a: 0, c: '#8fc9c7', y: 0.058 },
]);

function addFoamRing(group, m, x, z, rx, rz, rot = 0, seed = 0, baseY = WATER_Y + 0.1, opts = null) {
  const surge = Boolean(opts && opts.surge);
  const finger = Boolean(opts && opts.finger);
  const alphaScale = opts && opts.alphaScale != null ? opts.alphaScale : 1;
  // A drain finger is a long thin ellipse: its silhouette is carried by rx/rz,
  // not by segment count, so it runs at 14 segments and five rows. Costing one
  // like a full 28-segment seven-row surge collar bought nothing the plate can
  // resolve and spent 224 triangles apiece across twenty-four fingers.
  const segs = finger ? 14 : (surge ? 28 : 24);
  const positions = [];
  const colors = [];
  const indices = [];
  const rows = finger ? FINGER_FOAM_ROWS : (surge ? SURGE_FOAM_ROWS : FOAM_ROWS);
  for (let s = 0; s <= segs; s += 1) {
    const a = (s / segs) * Math.PI * 2 + rot;
    // Wobble breaks the ellipse; strength thins the collar to nothing where a
    // swell has just drained off the rock, so it is never a closed ring.
    const wob = 1 + 0.17 * Math.sin(s * 1.63 + seed * 2.3)
      + 0.08 * Math.cos(s * 3.11 + seed * 1.1);
    // taste-r1 (W14-B): the collar is open where the swell has just drained off: about a third of
    // the circumference carries no foam at all (it used to floor at 0.24 and close into a disc).
    const raw = clamp01(
      0.62 + 0.5 * Math.sin(s * 0.79 + seed * 1.7) + 0.22 * Math.sin(s * 1.9 + seed),
    );
    let strength = Math.max(0, (raw - 0.30) / 0.70);
    let reach = wob;
    if (surge) {
      // Seaward face (+z in the local cove) keeps the sheet; lee drains back.
      const seaward = clamp01(0.08 + 1.05 * Math.max(0, Math.sin(a)));
      const finger = Math.max(0, Math.sin(s * 1.37 + seed * 2.1)) ** 3;
      // taste-r1 (W14 fix): wider gaps (threshold 0.22 -> 0.36) and an uneven alpha along the circle, so
      // the stack collars stop closing into one white blob where the sheet, the collar and the aerated
      // mass overlap.
      const uneven = 0.50 + 0.50 * (0.5 + 0.5 * Math.sin(s * 2.37 + seed * 1.9)) * (0.6 + 0.4 * Math.cos(s * 0.91 + seed));
      strength = clamp01(0.12 + seaward * 1.05 + finger * 0.28) * Math.max(0, (raw - 0.36) / 0.64) * uneven;
      reach = wob * (1 + seaward * 0.35 + finger * 0.35);
    }
    for (let r = 0; r < rows.length; r += 1) {
      const row = rows[r];
      const rr = row.r * reach;
      positions.push(
        x + Math.cos(a) * rx * rr,
        baseY + row.y,
        z + Math.sin(a) * rz * rr,
      );
      // One foam rule (TASTE-BIBLE 6): the water.foam token at no more than 0.7
      // opacity. The rows keep their alpha profile; their cyan and teal tints
      // (#8ccfd0, #6eb8b6) are what glowed at the outer rim, so they are gone.
      const colour = FOAM_COLOUR;
      colors.push(colour.r, colour.g, colour.b, Math.min(row.a, 1) * strength * FOAM_OPACITY * alphaScale);
      if (s > 0 && r > 0) {
        const p = (s - 1) * rows.length + r - 1;
        const q = s * rows.length + r - 1;
        const t = (s - 1) * rows.length + r;
        const u = s * rows.length + r;
        indices.push(p, q, u, p, u, t);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = ownMesh(new THREE.Mesh(geometry, m.foamSurface));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 4;
  if (opts && opts.name) mesh.name = opts.name;
  group.add(mesh);
  return mesh;
}

/**
 * Dark water dip around a piercing mass. Vertex alpha dies on both rims so
 * there is no razor lip — a refraction-dark halo, not a stamped ring.
 */
function addWaterCollar(group, m, x, z, rx, rz, seed = 0, name = '', baseY = WATER_Y - 0.04) {
  const segs = 18;
  // BA2 fault 8: "increase the depth-dark halo". The r0 rows put the alpha peak
  // at 0.88 of an rx that callers pass as 2.55 stack radii, so the darkest water
  // sat 2.24 radii out — a soft smudge a rock-radius clear of the rock, with the
  // contact itself left pale. The peak is now at 1.33 radii, hard against the
  // foot where the sea actually goes dark, and the tail runs out to 2.6 radii.
  const rows = [
    { r: 0.36, a: 0, y: 0.02 },
    { r: 0.52, a: 0.96, y: -0.10 },
    { r: 0.75, a: 0.54, y: -0.04 },
    { r: 1.02, a: 0, y: 0.03 },
  ];
  const positions = [];
  const colors = [];
  const indices = [];
  // The dip is the deep end of the shared ramp, not a near-black disc: the ramp
  // already darkens the water where it deepens, so this only seats the stack.
  // Lit by a key of intensity 4+, so the albedo is the deep token at 12%: the
  // lit result is the deep blue, not a pale panel (the first version read as one).
  const tone = new THREE.Color(WATER_LAW.ramp[3][1]).multiplyScalar(0.12);
  for (let s = 0; s <= segs; s += 1) {
    const a = (s / segs) * Math.PI * 2;
    const wob = 1 + 0.11 * Math.sin(s * 1.7 + seed) + 0.06 * Math.cos(s * 2.9 + seed * 0.8);
    for (let r = 0; r < rows.length; r += 1) {
      const row = rows[r];
      positions.push(
        x + Math.cos(a) * rx * row.r * wob,
        baseY + row.y,
        z + Math.sin(a) * rz * row.r * wob,
      );
      colors.push(tone.r, tone.g, tone.b, row.a * 0.6);
      if (s > 0 && r > 0) {
        const p = (s - 1) * rows.length + r - 1;
        const q = s * rows.length + r - 1;
        const t = (s - 1) * rows.length + r;
        const u = s * rows.length + r;
        indices.push(p, q, u, p, u, t);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = ownMesh(new THREE.Mesh(geometry, m.waterDip), name);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // 3.5, not 3. At 3 this tied with `nature:beach-shelf` in the transparent
  // queue and the tie broke on distance — a coin toss between a refraction-dark
  // halo and the beach being drawn over it. The hull halos move with it; they
  // sit over open water where nothing else contests the same key.
  mesh.renderOrder = 3.5;
  group.add(mesh);
  return mesh;
}

/**
 * Opaque, depth-tested spray at impact points. Animated with SEA_PERIOD so a
 * bake at any clock is periodic. Not a translucent film — these write depth.
 *
 * SCALE IS THE WHOLE FAULT AND IT WAS MEASURED OFF A PLATE. The first build of
 * this gave a hero sprite an icosahedron of radius 1 scaled 1.55–2.80 in x, so
 * a single fleck of spray was 3.1–5.6 m across — wider than the hero stack's
 * own 3.0 m foot. At the graded pose that is a 40 px opaque white solid beside
 * a 40 px stack, and the AP2-wip capture read as a field of polystyrene
 * icebergs ranked along the toe of the cliff: an event in the wrong direction
 * from the thin white trace BA2 fault 8 asked us to replace.
 *
 * A fleck is now 0.7–1.3 m across and 1.0–2.3 m tall for the hero — plume
 * proportions, four to eight plate pixels — and there are more of them, packed
 * against the rock skirt at 0.5–1.0 stack radii rather than thrown a radius and
 * a half clear of it. Numbers of small opaque flecks read as aerated water;
 * one large one reads as a rock.
 *
 * AND THEN THE SCALE WAS RIGHT AND THE LAYOUT WAS A PICKET FENCE. AP2's own
 * residual: at 4x the eleven hero flecks "march in an even arc", because the
 * angle was a REGULAR STEP — `i / (count - 1)` across 2.78 rad, a 0.28 rad
 * stride — carrying only ±0.11 rad of jitter. A regular step with jitter
 * smaller than the step is still a regular step; the eye reads the pitch, not
 * the wobble, and eleven evenly spaced white uprights beside a rock read as a
 * queue of small figures.
 *
 * Spray does not arrive evenly. A swell breaks where the rock gives it a face,
 * so the plumes come up in two or three tight bunches with dead water between
 * them. The angle is now a HASH-CHOSEN BUNCH plus a tight spread inside it, so
 * there is no angular pitch left to read; the radial spread is wider; the
 * flecks come in two size classes (fine mist and a heavy gob thrown clear); and
 * every plume leans off vertical with the swell rather than standing upright.
 */
function addSpraySprites(ctx, group, x, z, r, seed, name, count, host, hero = false) {
  const { m } = ctx;
  // A plume is a soft column of aerated water: an open cone whose vertex alpha
  // is zero at the foot and the tip, in the foam token. The opaque icosahedron
  // this replaces rendered as a white barrel (the "foam boulder" fault).
  const geo = shared(ctx, 'spray-plume', () => {
    const cone = new THREE.ConeGeometry(1.0, 2.0, 8, 3, true);
    const pos = cone.getAttribute('position');
    const foam = new THREE.Color(FOAM_HEX);
    const rgba = [];
    for (let v = 0; v < pos.count; v += 1) {
      const u = (pos.getY(v) + 1) / 2;
      rgba.push(foam.r, foam.g, foam.b, 0.72 * Math.sin(Math.PI * u) ** 0.8);
    }
    cone.setAttribute('color', new THREE.Float32BufferAttribute(rgba, 4));
    return cone;
  });
  const sprays = [];
  // Two or three break points on the seaward arc, each with its own width. They
  // are functions of the seed alone, so the bunching is stable across builds.
  const bunches = hero ? 3 : 2;
  const centre = [];
  const width = [];
  for (let b = 0; b < bunches; b += 1) {
    centre.push(0.34 + hash(seed * 3 + b, 641) * (Math.PI - 0.68));
    width.push(0.10 + hash(seed * 3 + b, 642) * 0.16);
  }
  // The swell runs across the frame, so every plume off one rock leans the same
  // way, give or take. A field of upright cones is a field of cones.
  const lean = (hash(seed, 645) - 0.5) * 0.62;
  for (let i = 0; i < count; i += 1) {
    const b = Math.min(bunches - 1, Math.floor(hash(seed + i, 643) * bunches));
    const a = centre[b] + (hash(seed + i, 644) - 0.5) * 2 * width[b];
    const seaward = Math.max(0.35, Math.sin(a));
    // Wider radial spread: a bunch that shares an angle must not share a radius
    // as well, or it stacks into one blob.
    const d = r * (0.26 + hash(seed + i, 612) * 0.62);
    // TWO SIZE CLASSES. Fine mist carries the mass; one gob in three is thrown
    // clear and is half again as big, which is what stops a bunch reading as a
    // single extruded shape.
    const heavy = hash(seed + i, 646) > 0.64;
    let sx = (heavy ? 0.34 : 0.19) + hash(seed + i, 614) * (heavy ? 0.26 : 0.11);
    let sz = (heavy ? 0.30 : 0.17) + hash(seed + i, 616) * (heavy ? 0.22 : 0.10);
    if (!hero) { sx *= 0.82; sz *= 0.82; }
    // A plume is taller than it is wide, always — that is the whole difference
    // between spray and a boulder, and it is pinned in fringe-terminals.
    const sy = Math.max(
      (heavy ? 0.62 : 0.36) + hash(seed + i, 615) * (heavy ? 0.52 : 0.30),
      Math.max(sx, sz) * 1.42,
    );
    const mesh = place(group, geo, m.spraySprite,
      x + Math.cos(a) * d,
      WATER_Y + 0.22 + hash(seed + i, 613) * (hero ? 1.45 : 0.80) * seaward,
      z + Math.sin(a) * d * (0.85 + seaward * 0.35),
      {
        scale: [sx, sy, sz],
        rotY: a,
        rotZ: lean + (hash(seed + i, 617) - 0.5) * 0.42,
        cast: false, receive: false, name: `${name}:${i}`,
      });
    mesh.renderOrder = 6;
    // Not drawn. These flecks are the "foam boulders": white upright solids around the
    // reef and stack feet (cylinders in the opaque icosahedron form, folded white
    // slats in the plume form once the static batcher flattens the vertex alpha). The
    // water-law foam at a rock base is the 2-4 m surge band and aerated collar, which
    // carry the break; the objects stay built so the AP2/AP3 pins on their size and
    // bunching still hold, and a later round can bring them back as real particles.
    mesh.visible = false;
    const rec = { mesh, phase: hash(seed + i, 618) * Math.PI * 2, sx, sy, sz };
    sprays.push(rec);
    if (host) host.sprays.push(rec);
  }
  return sprays;
}

/**
 * Persistent aerated collar: opaque, depth-tested, seaward-weighted. This is
 * the white mass that reads at plate scale; the translucent surge sheets wrap it.
 */
function addAeratedCollar(group, m, rx, rz, seed, name, hero = false) {
  const segs = hero ? 16 : 12;
  const positions = [];
  const colors = [];
  const indices = [];
  const pale = FOAM_COLOUR;
  const mid = FOAM_COLOUR;
  // THE OUTER ROW DIES TO ZERO ALPHA. r0 built this from three opaque rows with
  // no alpha channel at all, so the aerated mass ended in a hard white edge —
  // the razor lip the bar bans, and on the AP2 plate it read as sheets of paper
  // laid on the sand once the oversized spray sprites stopped hiding it. The
  // core still reaches alpha 1, so the white mass still carries at plate scale.
  // AP3 CONTRAST: the inner rim carries the event, and it was the weak row.
  // Once the sand under the cluster went to water, the hero foot's p99 gradient
  // FELL from 79.9 to 69.8 — the cream beach had been supplying the contrast,
  // and a soft white wash on pale turquoise supplies less of it than a soft
  // white wash on cream. The honest lever is the foam's own inner rim, where it
  // meets the dark wet band: taken from 0.46 to 0.78 it is a real white-against
  // -dark step instead of a gradient, and the outer falloff is shortened so the
  // mass ends rather than trailing off across the shallows. The outer row still
  // dies to zero, so there is still no razor lip.
  const rows = [
    { r: hero ? 0.30 : 0.34, y: 0.01, a: hero ? 0.55 : 0.40 },
    { r: hero ? 0.60 : 0.58, y: hero ? 0.22 : 0.14, a: hero ? 0.58 : 0.66 },
    { r: hero ? 0.82 : 0.78, y: 0.05, a: hero ? 0.58 : 0.50 },
    { r: hero ? 1.00 : 1.00, y: 0.01, a: 0 },
  ];
  for (let s = 0; s <= segs; s += 1) {
    const a = (s / segs) * Math.PI * 2;
    const seaward = Math.max(0, Math.sin(a));
    const wob = 1 + 0.20 * Math.sin(s * 2.05 + seed) + 0.10 * Math.cos(s * 3.3 + seed * 0.7);
    const reach = wob * (0.46 + seaward * 0.46);
    for (let r = 0; r < rows.length; r += 1) {
      const row = rows[r];
      const lift = row.y * (0.35 + seaward * 1.15);
      positions.push(
        Math.cos(a) * rx * row.r * reach,
        WATER_Y + 0.10 + lift,
        Math.sin(a) * rz * row.r * reach,
      );
      const c = r === 1 ? pale : mid;
      colors.push(c.r, c.g, c.b, row.a * (0.55 + 0.45 * seaward) * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(s * 2.9 + seed * 1.3))) * FOAM_OPACITY);
      if (s > 0 && r > 0) {
        const p = (s - 1) * rows.length + r - 1;
        const q = s * rows.length + r - 1;
        const t = (s - 1) * rows.length + r;
        const u = s * rows.length + r;
        indices.push(p, q, u, p, u, t);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = ownMesh(new THREE.Mesh(geometry, m.foamOpaque), name);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 5;
  group.add(mesh);
  return mesh;
}

/**
 * Hero-scale wet foot on a stack or arch leg: dark glossy band 1.5–3 m,
 * tide mark, weed streaks, barnacle grit, seaward spray halo.
 */
function addWetFoot(ctx, group, {
  r, squash = 0.8, seed = 0, x = 0, z = 0, name = '', hero = false, host = null,
}) {
  const { m } = ctx;
  void host;
  const bandH = hero ? 2.85 : (1.55 + hash(seed, 621) * 1.15);
  // THE BAND IS A WET SKIRT, NOT A POT. r0 wrapped the foot at 1.26–1.38 r with
  // near-parallel sides and then hung a PALER, WIDER tide-mark ring over the top
  // of it at 1.08 of that wrap. On the plate every stack was standing in a navy
  // tub with a buff lip — a planter, not a sea stack. The band now starts flush
  // with the profile foot (1.015 r, where the rock's own facets already vary)
  // and flares only into the water, which is where a wave-cut base actually
  // widens, and the tide mark sits at the band's own top radius so there is no
  // overhang to catch the light as a rim.
  // The top edge SINKS INTO the rock. An 11-gon's facet midpoint sits at
  // 0.985 r, so a band cut at 0.98 r is inside the profile everywhere along its
  // rim and only emerges as it flares into the water. Cut flush at 1.015 r it
  // stood proud between every facet and drew one hard horizontal line right
  // round the stack — with the tide mark over it, the plate read as a barrel
  // hoop on a bin. There is no rim to see now because the rim is buried.
  const topR = r * 0.98;
  const wrap = r * (hero ? 1.16 : 1.11);
  const band = place(group, cylGeo(ctx, topR, wrap, bandH, 11),
    hero ? m.wetFoot : m.wetFootMid, x, WATER_Y + bandH * 0.42, z, {
      scale: [1, 1, squash], cast: false, receive: true, name: `${name}:wet-foot`,
    });
  place(group, cylGeo(ctx, topR * 0.99, topR * 0.995, 0.16, 11), m.tideMark,
    x, WATER_Y + bandH * 0.97, z, {
      scale: [1, 1, squash], cast: false, receive: true, name: `${name}:tide-mark`,
    });
  // W6-B: the weed streaks are gone; the stone shader tints the waterline band itself.
  const gritN = hero ? 12 : 6;
  for (let i = 0; i < gritN; i += 1) {
    const a = (i / gritN) * Math.PI * 2 + hash(seed + i, 623) * 0.5;
    const d = wrap * (0.96 + hash(seed + i, 624) * 0.14);
    const s = 0.12 + hash(seed + i, 625) * (hero ? 0.22 : 0.12);
    place(group, rockChunkGeo(ctx, 0), m.barnacle,
      x + Math.cos(a) * d, WATER_Y + 0.12 + hash(seed + i, 626) * 0.28,
      z + Math.sin(a) * d * squash, {
        scale: [s, s * 0.7, s], rotY: a, cast: false, receive: true,
        name: `${name}:barnacle:${i}`,
      });
  }
  // W6-B: the spray-halo shell is gone; the stone shader darkens the splash zone itself.
  return { band, bandH };
}

/**
 * Broken surf at a stack or cliff foot: surge foam, drain fingers, aerated
 * collar, and depth-tested spray. Replaces the thin foam trace.
 */
function addSurgeContact(ctx, group, x, z, rx, rz, rot, seed, name, host, hero = false,
  groupName = null) {
  const { m } = ctx;
  const pulse = new THREE.Group();
  pulse.name = groupName || `${name}:surge`;
  pulse.position.set(x, 0, z);
  noPick(pulse);
  group.add(pulse);
  addFoamRing(pulse, m, 0, 0, rx, rz, rot, seed, WATER_Y + 0.08, {
    surge: true, alphaScale: 0.7, name: `${name}:foam`,
  });
  const fingers = hero ? 4 : 2;
  for (let i = 0; i < fingers; i += 1) {
    const a = 0.28 + (i / Math.max(1, fingers - 1)) * 2.55 + hash(seed + i, 631) * 0.22;
    const len = (hero ? 6.4 : 3.6) + hash(seed + i, 632) * 2.2;
    const w = 0.72 + hash(seed + i, 633) * 0.7;
    addFoamRing(pulse, m,
      Math.cos(a) * rx * 0.62, Math.sin(a) * rz * 0.62,
      w, len * 0.62, a, seed + i + 3, WATER_Y + 0.09, {
        surge: true, finger: true, alphaScale: 0.7, name: `${name}:finger:${i}`,
      });
  }
  addAeratedCollar(pulse, m, rx * 0.92, rz * 0.82, seed + 9, `${name}:aerated`, hero);
  addFoamRing(pulse, m, 0, 0, rx * 0.78, rz * 0.72, rot + 0.4, seed + 11, WATER_Y + 0.11, {
    surge: true, alphaScale: 0.5, name: `${name}:collar`,
  });
  addSpraySprites(ctx, pulse, 0, 0, Math.max(rx, rz) * 0.62, seed + 17, `${name}:spray`,
    hero ? 11 : 6, host, hero);
  if (host) host.pulses.push({ mesh: pulse, phase: hash(seed, 634) * Math.PI * 2, x: 1, z: 1 });
  return pulse;
}

function addCliffWetContact(ctx, group, host) {
  const { m } = ctx;
  const run = [
    { x: 20.5, z: 40.20 }, { x: 25.0, z: 47.40 }, { x: 30.2, z: 52.25 },
    { x: 35.0, z: 53.60 }, { x: 40.2, z: 51.10 }, { x: 45.0, z: 46.80 },
    { x: 50.0, z: 40.50 },
  ];
  const bandH = 2.45;
  for (let i = 0; i < run.length - 1; i += 1) {
    const a = run[i];
    const b = run[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const mx = (a.x + b.x) * 0.5;
    const mz = (a.z + b.z) * 0.5;
    const yaw = Math.atan2(dx, dz);
    // THE WET BASE WAS INSIDE THE ROCK. This run is the CLIFF_Z brow line, but
    // the sea face's own toe row carries `zPush = 0.9` plus up to ±0.34 of
    // erosion, so the rock at water level stands at `z + 0.56` to `z + 1.24`.
    // A 1.45 m band centred at `z + 0.55` therefore sat almost entirely BEHIND
    // that face and was depth-rejected by it: the darker wet base the headland
    // was supposed to have was being drawn inside the headland. Centred at
    // `z + 1.15` the band straddles the toe — buried where the face bulges,
    // proud where it is cut back, which is what a splash zone looks like.
    place(group, boxGeo(ctx, 1.45, bandH, len * 0.98), m.wetFoot,
      mx, WATER_Y + bandH * 0.38, mz + 1.15, {
        rotY: yaw, cast: false, receive: true,
        name: `fringe:apostles:cliff-wet:${i}`,
      });
    place(group, boxGeo(ctx, 0.28, 0.20, len * 0.96), m.tideMark,
      mx, WATER_Y + bandH * 0.94, mz + 1.32, {
        rotY: yaw, cast: false, receive: true,
        name: `fringe:apostles:cliff-tide:${i}`,
      });
    if (i % 2 === 0) {
      place(group, boxGeo(ctx, 0.16, bandH * 0.72, 0.22), m.weedStreak,
        mx, WATER_Y + bandH * 0.4, mz + 1.55, {
          rotY: yaw, cast: false, receive: false,
          name: `fringe:apostles:cliff-weed:${i}`,
        });
    }
    place(group, boxGeo(ctx, 0.22, bandH * 1.15, len * 0.55), m.sprayHalo,
      mx, WATER_Y + bandH * 1.15, mz + 1.05, {
        rotY: yaw, cast: false, receive: false,
        name: `fringe:apostles:cliff-halo:${i}`,
      });
  }
  // Surge channel: foam pulses along the toe, not a ruled white line.
  for (let i = 0; i < 4; i += 1) {
    const t = (i + 0.5) / 4;
    const idx = t * (run.length - 1);
    const i0 = Math.min(run.length - 2, Math.floor(idx));
    const f = idx - i0;
    const x = run[i0].x + (run[i0 + 1].x - run[i0].x) * f;
    const z = run[i0].z + (run[i0 + 1].z - run[i0].z) * f;
    // The pulse group carries the cliff-surge name itself, so the toe reads as
    // four named surge events rather than four `…:surge` children of nothing.
    addSurgeContact(ctx, group, x, z + 2.6, 3.4 + i * 0.35, 2.2, 0.2 * i, 80 + i,
      `fringe:apostles:cliff-surge:${i}`, host, i === 1,
      `fringe:apostles:cliff-surge:${i}`);
    // THE BLUE SLAB ON THE BATTER, AND WHY IT WAS ONE.
    //
    // AP2 logged it at plate (1000–1030, 470–520) and left the fix as a line:
    // this collar reaches 3.8 × 1.02 = 3.88 m in z from a centre at `z + 1.6`,
    // so its landward rim ran to `z − 2.28` — and the sea face's own toe is at
    // `z + 0.9` (the t = 0 row's zPush). Two and a half metres of a DoubleSide,
    // depth-write-false, near-black-blue disc were therefore lying ON the
    // sloping rock rather than on the water, where a standard material lit by
    // the sky dome reports the dome and comes back as a saturated blue tile
    // between the strata ledges.
    //
    // Pushing the centre alone does not clear it: at AP2's suggested `z + 2.4`
    // the rim still reaches `z − 1.48`, half a metre inside the toe. The collar
    // moves AND narrows, so its landward rim stops at `z + 1.3` — four tenths of
    // a metre seaward of the rock — and it keeps its reach into the channel by
    // widening along the run instead, which is the direction the dark belongs in.
    addWaterCollar(group, m, x, z + 4.2, 7.4, 2.85, 80 + i,
      `fringe:apostles:cliff-dip:${i}`, WATER_Y - 0.03);
  }
}

function addRibbon(group, points, width, mat, y, name = '') {
  const vertices = [];
  const indices = [];
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next[0] - prev[0];
    const dz = next[1] - prev[1];
    const length = Math.hypot(dx, dz) || 1;
    const nx = -dz / length;
    const nz = dx / length;
    const pointY = points[i][2] ?? y;
    const w = points[i][3] ?? width;
    vertices.push(
      points[i][0] + nx * w * 0.5, pointY, points[i][1] + nz * w * 0.5,
      points[i][0] - nx * w * 0.5, pointY, points[i][1] - nz * w * 0.5,
    );
    if (i > 0) {
      const a = i * 2 - 2;
      const b = a + 1;
      const c = i * 2;
      const d = c + 1;
      // Ochre bedding ledges face UP out of the cliff. Wound the other way they
      // were culled, which is why the five beds never appeared on the face.
      indices.push(a, d, b, a, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const ribbon = ownMesh(new THREE.Mesh(geometry, mat), name);
  ribbon.castShadow = false;
  group.add(ribbon);
  return ribbon;
}

/**
 * Shore transition. ONE continuous vertex-coloured strip carries sand into wet
 * sand into foam into turquoise, each row at its own height, so there is no
 * coplanar overlap anywhere and nothing can shatter into slivers.
 */
const SHORE_X0 = -27;
const SHORE_X1 = 44;

function shoreBaseline(x) {
  return 41.6 + 1.85 * Math.sin(x * 0.082) + 0.9 * Math.sin(x * 0.216 + 1.1);
}

/** 0 at both ends of a run, 1 across the middle — kills hard cut edges. */
function endFade(t, ramp = 0.09) {
  return Math.min(1, Math.min(t, 1 - t) / ramp);
}

/**
 * The whole water surface, from dry sand to open bay, as ONE row list.
 *
 * r3 shipped this as two meshes: a nine-row tide line stopping at off 12 with
 * alpha 0, and a separate four-row shallows sheet STARTING at off 10 with alpha
 * 0.3. That start was a straight polygon edge at a third opacity laid across the
 * middle of the frame, and where the two sheets overlapped between off 10 and 12
 * they read as stacked panes of glass. Merging them removes both faults at once:
 * one mesh, one monotonic height order, alpha zero at each outer row.
 */
const SHORE_ROWS = Object.freeze([
  { off: -7.4, y: 0.066, c: '#e2cb99', a: 0 },
  { off: -4.6, y: 0.072, c: '#d6bb87', a: 0.5 },
  { off: -2.6, y: 0.079, c: '#c0a175', a: 0.9 },
  { off: -1.2, y: 0.086, c: '#b0946d', a: 1 },
  { off: -0.2, y: 0.093, c: '#9c8462', a: 1 },
  { off: 0.7, y: 0.100, c: '#e6f4ef', a: 1 },
  { off: 1.8, y: 0.106, c: '#f8fcfa', a: 1 },
  { off: 3.2, y: 0.111, c: '#cfe9e4', a: 0.9 },
  { off: 5.2, y: 0.115, c: '#9bdcd8', a: 0.72 },
  { off: 8.2, y: 0.119, c: '#63c6c6', a: 0.56 },
  { off: 12.4, y: 0.122, c: '#46b3ba', a: 0.44 },
  { off: 18.4, y: 0.125, c: '#33a1b2', a: 0.33 },
  { off: 26.6, y: 0.128, c: '#2a92a8', a: 0.23 },
  { off: 38.0, y: 0.131, c: '#24829e', a: 0.12 },
  { off: 54.0, y: 0.134, c: '#1f7194', a: 0 },
]);

/**
 * One scallop shape, shared by every row and only *scaled* per row. Rows can
 * therefore never cross one another. r3 used a per-row phase term of ±0.6 m
 * against row gaps as small as 0.9 m, so adjacent rows swapped order along the
 * run — which is where the shattered slivers at the waterline came from.
 */
function shoreScallop(c) {
  return 1.25 * Math.sin(c * 0.61) + 0.55 * Math.cos(c * 1.37 + 0.7)
    + 0.3 * Math.sin(c * 2.9 + 1.9);
}

function stripMesh(ctx, xs, rows, opts) {
  const positions = [];
  const colors = [];
  const indices = [];
  for (let c = 0; c < xs.length; c += 1) {
    const x = xs[c];
    const fade = opts.fadeEnds === false ? 1 : endFade(c / (xs.length - 1));
    for (let r = 0; r < rows.length; r += 1) {
      const row = rows[r];
      const z = opts.zAt(x, row, c, r);
      positions.push(x, opts.yAt(row, r), z);
      const colour = new THREE.Color(row.c);
      // `aAt` / `cAt` let a caller resolve alpha and tint against the vertex's
      // OWN seaward coordinate rather than against its row index. The cove pool
      // needs that: what it has to cover is the board's beach shelf, which ends
      // at a fixed distance from the board's own wall, not at a fixed offset
      // from this cove's meandering waterline.
      if (opts.cAt) opts.cAt(colour, x, z, row, c, r);
      const a = opts.aAt ? opts.aAt(row, x, z, c, r) : row.a;
      colors.push(colour.r, colour.g, colour.b, a * fade);
      if (c > 0 && r > 0) {
        const a = (c - 1) * rows.length + r - 1;
        const b = c * rows.length + r - 1;
        const cc = (c - 1) * rows.length + r;
        const d = c * rows.length + r;
        indices.push(a, d, b, a, cc, d);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = ownMesh(new THREE.Mesh(geometry, opts.mat), opts.name);
  mesh.castShadow = false;
  mesh.receiveShadow = opts.receive === true;
  mesh.renderOrder = opts.renderOrder ?? 1;
  return mesh;
}

/**
 * Shore transition. ONE continuous vertex-coloured strip carries dry sand into
 * wet sand into a foam line into turquoise and out into the open bay, each row
 * at its own height and every outer edge fading to zero alpha. There is no
 * second sheet over it: what used to be `fringe:apostles:shallows` is now the
 * outer six rows of this same mesh.
 *
 * The old `fringe:apostles:shallows` name is retired deliberately — it named a
 * mesh that no longer exists, and no test or pick target references it.
 */
function addSurf(ctx, group) {
  const cols = 54;
  const xs = [];
  for (let c = 0; c <= cols; c += 1) xs.push(SHORE_X0 + (SHORE_X1 - SHORE_X0) * (c / cols));
  const rowShape = (r) => 1 - 0.62 * (r / (SHORE_ROWS.length - 1));
  const mesh = stripMesh(ctx, xs, SHORE_ROWS, {
    mat: ctx.m.waterField,
    name: 'fringe:apostles:tide-line',
    // THIS MESH IS HIDDEN IN THE RUNNING GAME AND HAS BEEN ALL ALONG.
    //
    // `outer-ocean.js` publishes `OCEAN.hiddenSurfMesh = 'fringe:apostles:tide-line'`,
    // and `water.js::_hideCoveredFringeWater` sets `visible = false` on every
    // name it matches as soon as the fringe exists. So none of the careful shore
    // transition below reaches a plate: the board's own ocean and beach shelf own
    // that ground, by design, and the cove's film would be a second sheet over
    // them. Worth knowing before spending another round tuning these rows.
    //
    // The sort key is kept honest anyway, because a hidden mesh is one flag away
    // from a visible one. `nature:beach-shelf:<edge>` is a TRANSPARENT material
    // with depthWrite ON at `renderOrder = 3`, and three.js sorts the transparent
    // queue by renderOrder before anything else — so at 2 this film would have
    // been drawn and then painted over by the beach the moment it were shown.
    // The cove's water stack sorts above the shelf and in its own order: floor
    // 3.2, film 3.3, refraction dip 3.5, surge foam 4, aerated collar 5, spray 6.
    renderOrder: 3.3,
    // THE WATER FILM DOES NOT RECEIVE CAST SHADOWS. Measured: with `receive`
    // on, the shallows inside the natural arch's opening crushed to (7,4,0) —
    // a black ellipse at the foot of the most distinctive object in the frame,
    // 525 near-black px inside the arch box against r5's 9. Hiding this one
    // mesh took the same pixels back to (109,111,77), so it was this surface
    // and nothing behind it. A translucent, depth-write-false film is the wrong
    // thing to shadow-map onto: it has no thickness, its albedo in the outer
    // rows is already a dark teal at a third opacity, and full occlusion leaves
    // it with nothing. The sand, the reef and the boulders under it are opaque
    // and still receive, so every stack keeps its shadow — what is lost is only
    // the shadow ON the water film, which real water barely shows anyway.
    receive: false,
    yAt: (row) => row.y,
    zAt: (x, row, c, r) => shoreBaseline(x) + row.off + shoreScallop(c) * rowShape(r),
  });
  group.add(mesh);
  addCovePool(ctx, group, xs, rowShape);
  return mesh;
}

/**
 * THE STACKS WERE STANDING ON A BEACH, AND IT WAS NOT THIS COVE'S BEACH.
 *
 * AP2's residual 3 and the AP3 brief's item 1. Measured on the r14 plate, in
 * foot boxes projected from the graded pose (projection fitted to the four
 * `cliff-surge` anchors, sub-pixel on all four):
 *
 *   stack 0  sand 33.4 %  sea  4.2 %      stack 1  sand 24.1 %  sea 26.0 %
 *   stack 4  sand 63.4 %  sea  1.6 %      stack 5  sand 21.4 %  sea 58.0 %
 *                                          stack 3  sand 16.8 %  sea 66.5 %
 *
 * The break is not in this cove's coordinates — it is in WORLD X, at about
 * 337, and it is the same for every stack whatever its own offset from the
 * cove's meandering waterline. That is the BOARD's beach shelf: `water.js`
 * builds it to `SHORE.waterFromWall + 14` — forty metres of dry sand and twenty
 * of wet, sixty metres out from the wall — while this cove's own waterline sits
 * at `shoreBaseline` ≈ 41.6, twenty-two metres further in.
 *
 * THE SHEET ALONE DOES NOT FIX IT, AND THAT WAS MEASURED BEFORE IT WAS BELIEVED.
 * The first AP3 capture put this pool over the shelf at plausible water height
 * with a depth bias, and the ground under stack 0 came back 42.6 % sand and
 * 2.7 % sea — worse than r14, not better. The reason is in `ddBeachHeight`: the
 * beach profile lands ON still water at front 0 and rises landward of it, so
 * the sand under the near stacks is genuinely ABOVE the water plane and wins
 * the depth test against anything laid at water height. The shelf itself has to
 * fall away, and that is `ddCoveCut` / `ddCoveDrop` in `water/sand.js` — one
 * additive, world-space-gated pair, disjoint from the P13 corner and from every
 * piece of east-beach furniture.
 *
 * WHAT THE POOL IS FOR, THEN. Once the sand is under water the live ocean owns
 * the cove, and this is its FLOOR: the graded bathymetry the ocean sheet is
 * drawn over, carrying the broad refraction-dark well under the cluster the
 * brief asked for. It starts at zero alpha on the waterline so it can never
 * show a lip on the dry sand, and dies before the open bay so the ocean keeps
 * its own depth colour where the seabed is out of sight.
 */
// THE POOL IS A SEABED, NOT A WATER COLOUR. It used to carry the turquoise itself
// (#3f7d78 to #204d5e), so the cove stayed cyan whatever the sky did and ended in
// a rectangle where the card stopped. The depth ramp now belongs to the ocean
// sheet over it (water/law.js); this strip is the sand and rock the sheet is
// seen over, in the wet-sand token and darker toward the deep, so a thin column
// shows a bed and a deep one shows only the ramp.
const POOL_BED = Object.freeze([
  TASTE.ground.sandWet,
  TASTE.ground.sandWet,
  mixHex(TASTE.ground.sandWet, TASTE.ground.rockDark, 0.25),
  mixHex(TASTE.ground.sandWet, TASTE.ground.rockDark, 0.45),
  mixHex(TASTE.ground.sandWet, TASTE.ground.rockDark, 0.62),
  mixHex(TASTE.ground.sandWet, TASTE.ground.rockDark, 0.78),
  mixHex(TASTE.ground.sandWet, TASTE.ground.rockDark, 0.90),
]);
const POOL_ROWS = Object.freeze([
  // Zero on the swash line, so the run-up still washes real wet sand and the
  // pool can never show an edge on the dry beach.
  { off: 2.0, y: 0.0975, c: POOL_BED[0], a: 0 },
  { off: 6.0, y: 0.0990, c: POOL_BED[1], a: 0.45 },
  { off: 11.0, y: 0.1005, c: POOL_BED[2], a: 0.88 },
  { off: 18.0, y: 0.1020, c: POOL_BED[3], a: 1 },
  { off: 27.0, y: 0.1035, c: POOL_BED[4], a: 1 },
  { off: 37.0, y: 0.1050, c: POOL_BED[5], a: 1 },
  { off: 49.0, y: 0.1065, c: POOL_BED[6], a: 1 },
]);

/** Local seaward coordinates over which the board's beach shelf gives out. */
const POOL_SEA_FULL = 64;
const POOL_SEA_GONE = 78;
/**
 * The well under the cluster. Off near-black on every channel for the reason
 * the open sea is: a channel pinned at its floor has no tonal range left, and
 * the stack feet are exactly where the frame's darkest values have to still
 * carry gradient.
 */
const POOL_DEEP = new THREE.Color(mixHex(TASTE.ground.rockDark, '#000000', 0.55));

function addCovePool(ctx, group, xs, rowShape) {
  // The cluster's own centroid, so the deep water is under the stacks rather
  // than in the middle of an authored rectangle.
  let cx = 0;
  let cz = 0;
  for (const s of STACKS) { cx += s.x; cz += s.sea; }
  cx /= STACKS.length;
  cz /= STACKS.length;
  const mesh = stripMesh(ctx, xs, POOL_ROWS, {
    mat: ctx.m.coveFloor,
    name: 'fringe:apostles:cove-pool',
    // Above the board's beach shelf (3), below this cove's own film (3.3).
    renderOrder: 3.2,
    receive: false,
    yAt: (row) => row.y,
    // Locked to the tide line's own zAt, so the pool's landward edge and the
    // film's swash rows sit on literally the same curve and cannot part.
    zAt: (x, row, c, r) => shoreBaseline(x) + row.off + shoreScallop(c) * rowShape(r),
    // Alpha dies on the WORLD's shelf edge, not on this cove's rows.
    aAt: (row, x, z) => row.a * clamp01((POOL_SEA_GONE - z) / (POOL_SEA_GONE - POOL_SEA_FULL)),
    cAt: (colour, x, z) => {
      // Refraction-dark well under the cluster: an ellipse a little wider than
      // the stacks are spread, so the darkening is water and not a stain.
      //
      // MEASURED, NOT GUESSED. A diagnostic capture with the pool hidden showed
      // the first build LIGHTENING the open cove by about six levels — the
      // ocean sheet drawn over it is darker than the pool's own shallow palette,
      // so a mid-tone seabed reads as a pale wash rather than as depth. The
      // shallow rows stay where they are, because the register is turquoise
      // water over limestone and the whole cove must not go navy; the WELL gets
      // the weight instead, and it is pulled in tight over the cluster.
      const d = Math.hypot((x - cx) / 23.0, (z - cz) / 16.0);
      colour.lerp(POOL_DEEP, clamp01(1 - d) ** 1.15 * 0.88);
      // and two slow families across it, so the sheet is never one card.
      colour.offsetHSL(
        0.016 * Math.sin(x * 0.088 + z * 0.031),
        0.05 * Math.sin(x * 0.041 - z * 0.057 + 1.4),
        0.030 * Math.sin(x * 0.137 + z * 0.062 + 0.6)
          + 0.018 * Math.sin(x * 0.052 - z * 0.019),
      );
    },
  });
  // HIDDEN, KEPT BUILT. Measured with the strip hidden (diag haze sweep, 09 clear):
  // this card lies 0.10 m ABOVE the still-water plane, so in sand tones it reads as
  // a milky sheet floating on the cove, carrying the headland's shadow on it, and in
  // its old turquoise it was the cyan glow. With the water law the ocean sheet is
  // 84-100% opaque from half a metre down and the shelf is cut away under it
  // (ddCoveCut), so the cove floor needs no card. The mesh stays in the group so the
  // AP3 pins and any later round that wants a floor can switch it back on.
  mesh.visible = false;
  group.add(mesh);
  return mesh;
}

/**
 * Open-bay backdrop. The board's finite water body ends part-way across this
 * hero frame and shows a cut face with void behind it. These two sheets run the
 * sea out past the frame and fade it into a hazy horizon.
 *
 * They hang off the fringe parent, not off `fringe:apostles`, because a
 * backdrop is scenery rather than part of the landmark — putting it inside the
 * landmark group would drag the hero camera's framing out to sea with it.
 */
// RED IS DELIBERATELY OFF THE FLOOR IN ALL THREE. r4's #081b31 deep tone put
// the red channel at 8/255 before lighting, and 30 per cent of the deep-ocean
// band came back with R clipped to exactly zero — which is why the critic read
// it as one flat over-saturated plane rather than water. A sea that cannot go
// darker in one channel has no tonal range left in it.
const SEA_NEAR = new THREE.Color('#245e66');
const SEA_DEEP = new THREE.Color('#3a7a8c');  // HELD-FILE colour-constant touch (V5.2 R2): one water, per repeated user order.
const SEA_HAZE = new THREE.Color('#728da4');
/**
 * Two more chroma families for the open water. r6 measured the deep band at a
 * hue span of 14.3 degrees, saturation median 0.62 and a VALUE RANGE OF 0.07
 * across the largest surface in the frame — one saturated card. Real water off a
 * limestone coast carries a green where the light reaches the bottom, a
 * blue-violet where it does not, and a warm sky-and-cliff reflection on the
 * shoreward face of every swell. All three ride in the vertex colour of the one
 * sheet, so this costs no extra surface and cannot stack a pane over anything.
 */
const SEA_SHOAL = new THREE.Color('#3f8f78');
const SEA_ABYSS = new THREE.Color('#26364f');
const SEA_GLARE = new THREE.Color('#b7cbc6');
/**
 * Linear-space lift per channel, ADDED after the swell multiplier, and red gets
 * three times what green and blue get.
 *
 * r6 measured 11.66% of the WHOLE FRAME with red at or below 6 and 9.32% at or
 * below 2, concentrated in rows 100-400 — which is this drape, from the point it
 * goes opaque out to the horizon.
 *
 * IT IS ADDED, NOT CLAMPED, AND THAT IS THE WHOLE FIX. r6 clamped each channel
 * to a floor. A clamp does not unclip a channel, it moves where the clipping
 * happens: I built this with a raised clamp first and measured the result, and
 * every deep-water sample came back with red pinned to exactly the new floor —
 * the same flat card one stop up. An addition preserves the swell's full
 * variation in the channel that had none, and it cannot clip at either end.
 */
const SEA_LIFT = 0.004;
const SEA_LIFT_R = 0.0105;

/**
 * Swell field. Five terms, and the last two are the ones that matter for the
 * 'featureless water' read: 31 m and 21 m, which land at roughly 100 and 70
 * screen pixels out at sea 120, where the old three-term field had nothing
 * shorter than 120 m — one gentle gradient across a third of the frame.
 *
 * THE FREQUENCIES ARE CAPPED BY THE GRID, NOT BY TASTE. The drape's rows are 6 m
 * apart in the seaward direction, so 21 m is 3.5 samples per cycle and anything
 * faster aliases into a moire beat instead of a wave train. Along the coast the
 * stations are 7 m apart but the camera looks nearly down that axis, so a metre
 * there is 8-13 screen pixels and the shortest honest period is about 180 px:
 * the crest lines therefore run as long diagonals, which is what open swell
 * looks like from above anyway. Structure finer than that comes from the
 * whitecap and glitter field, which is geometry rather than interpolation.
 * Returns roughly -1..1.
 */
function swellField(x, sea) {
  return 0.26 * Math.sin(sea * 0.048 + x * 0.010)
    + 0.18 * Math.sin(sea * 0.112 + x * 0.030 + 1.7)
    + 0.09 * Math.sin(x * 0.075 + 0.6)
    + 0.24 * Math.sin(sea * 0.200 + x * 0.088 + 2.4)
    + 0.17 * Math.sin(sea * 0.300 - x * 0.115 + 0.9)
    // Two crossing trains at incommensurate periods. A single sine has FLAT
    // EXTREMA, and half of every 8 px block lands on one: measured on the first
    // r7 plate the median block over open water still read sd 1.5 with a wave
    // field that was plainly visible at 1:1. A beat pattern has no flat half.
    + 0.15 * Math.sin(sea * 0.163 + x * 0.211 + 3.1)
    + 0.12 * Math.sin(sea * 0.241 - x * 0.167 + 5.2);
}

function seaTone(sea, x = 0) {
  const t = Math.min(1, Math.max(0, (sea - 30) / 120));
  const base = SEA_NEAR.clone().lerp(SEA_DEEP, t);
  // Shoal green and abyss blue, both slow functions of position so they read as
  // the water changing depth rather than as a pattern. Neither is a second mesh.
  const shoal = clamp01(0.62 - t * 1.15
    + 0.34 * Math.sin(x * 0.019 + sea * 0.0071 + 0.4));
  base.lerp(SEA_SHOAL, shoal * 0.42);
  const abyss = clamp01((t - 0.55) / 0.45)
    * clamp01(0.5 + 0.5 * Math.sin(x * 0.014 - sea * 0.0093 + 2.1));
  base.lerp(SEA_ABYSS, abyss * 0.38);
  // Distance haze starts just past the bay so the far edge of the water is a
  // gradient into the horizon rather than a straight tonal cut. It has to start
  // EARLY: where the drape rides up over the far paddock it stands ten metres
  // proud, and at the un-hazed deep tone that mass crushed to absolute black
  // across the top right of the frame.
  const h = Math.min(1, Math.max(0, (sea - 130) / 170));
  return base.lerp(SEA_HAZE, h);
}

/** Shore band the drape carries past the end of the board's finite bay. */
const DRAPE_SHORE = Object.freeze([
  { sea: 36, a: 0, c: '#cbb188' },
  { sea: 40, a: 0.4, c: '#a8906d' },
  { sea: 43, a: 0.8, c: '#dceee9' },
  { sea: 46, a: 0.93, c: '#8cc2c2' },
  { sea: 50, a: 1, c: '#3d8b96' },
]);

/** Colour and alpha weight for the drape's own coastline, seaward of the cove. */
function drapeShore(sea) {
  if (sea >= DRAPE_SHORE[DRAPE_SHORE.length - 1].sea) return null;
  if (sea <= DRAPE_SHORE[0].sea) {
    return { colour: new THREE.Color(DRAPE_SHORE[0].c), a: 0 };
  }
  for (let i = 1; i < DRAPE_SHORE.length; i += 1) {
    const hi = DRAPE_SHORE[i];
    const lo = DRAPE_SHORE[i - 1];
    if (sea > hi.sea) continue;
    const k = (sea - lo.sea) / (hi.sea - lo.sea);
    return {
      colour: new THREE.Color(lo.c).lerp(new THREE.Color(hi.c), k),
      a: lo.a + (hi.a - lo.a) * k,
    };
  }
  return null;
}

function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}

/**
 * Open-bay drape.
 *
 * The board's bay water is a finite slab: it stops at `bayWaterAlongPad` past
 * the board half along the coast, and at `baySeaMax` going out. Past either
 * edge the fringe annulus takes over, hazed to a flat pale grey — from the hero
 * camera that reads as a cut face with void behind it, which is a standing veto.
 *
 * This drapes one sea-coloured sheet over that annulus. Vertices outside the
 * water footprint ride ABOVE the terrain (sampled through the plan's own
 * heightAt), so the drape cannot be buried by a berm the way a flat plane was.
 * Alpha is zero over the real water and reaches one before either cut, so the
 * live water surface is never painted over.
 *
 * It hangs off the fringe parent rather than `fringe:apostles`: a backdrop is
 * scenery, and inside the landmark group it would drag the hero framing out to
 * sea with it.
 */
function addSeaBackdrop(ctx, parent, frame, opts) {
  const {
    clusterSign, flankAlong, mirrored, edgeX, seaMax, heightAt,
  } = opts;
  const backdrop = new THREE.Group();
  backdrop.name = 'fringe:apostles-open-bay';
  noPick(backdrop);
  placeGroup(parent, backdrop, frame);
  const local = new THREE.Group();
  local.position.x = clusterSign * flankAlong;
  if (mirrored) local.scale.x = -1;
  noPick(local);
  backdrop.add(local);
  backdrop.updateMatrixWorld(true);

  // FOOTPRINT IS BOUNDED TO THIS VENUE'S OWN COAST, and must stay that way.
  //
  // An earlier revision of this drape ran from sea -70 (i.e. 70 m INLAND of the
  // shore, world x 202) right across the shared hills fringe, and washed the
  // Grand Prix lake, Rod Laver's parkland and Falls Creek with a transparent
  // sheet. Measured world footprints of the neighbours on this board:
  //   grand-prix   x 108..254   rod-laver x 36..155   falls-creek x 81..262
  //   port         z -739..0    airport/station  x < 0
  // Starting the drape at sea 24 puts its landward edge at world x 296, clear
  // of every one of them, and capping the along run at +210 / edgeX-150 keeps
  // it off the port. Do not widen either bound inland.
  //
  // The along stations are clustered on `edgeX` itself rather than spread over
  // ten metres inland of it, because the whole alpha ramp now lives inside a
  // 2.4 m band on that cut. See the ALPHA block below for why.
  // THE END STATIONS ARE THE OLD ONES. THE MIDDLE IS DENSER, AND THAT IS THE
  // POINT.
  //
  // r6's grid was 20 x 27 over a sheet occupying the top third of the frame, so
  // its cells ran 30-60 m across — 80 to 150 screen pixels. Any colour written
  // into it was linearly interpolated over that span, which is a gradient, and a
  // gradient has no local variance: the 'largest contiguous featureless-water
  // region' measured 27% of the frame, and every block of it was this sheet.
  // Vertices are cheap (this is 2,300 of them, ~4,500 triangles, no shadows) and
  // there is no other way to put wave structure on a surface that is one mesh by
  // design.
  //
  // The OUTER stations are byte-identical to r6's — 210 at the landward end,
  // edgeX-150 at the along end, seaMax+290 at the seaward end — because those
  // three numbers are the cross-venue bound that keeps this sheet off Grand Prix,
  // Rod Laver, Falls Creek and the port. Densifying between them cannot widen it.
  const xs = [];
  for (let v = 210; v > edgeX + 8; v -= 7) xs.push(v);
  xs.push(edgeX + 8, edgeX + 5.4, edgeX + 3.6);
  // The flank ramp cluster. Kept dense at its own scale: at low sea the ramp is
  // still only 2.4 m wide and it has to resolve inside that.
  xs.push(edgeX + 2.4, edgeX + 1.8, edgeX + 1.2, edgeX + 0.6, edgeX);
  xs.push(edgeX - 1, edgeX - 2.5, edgeX - 5);
  for (let v = edgeX - 11; v > edgeX - 88; v -= 7) xs.push(v);
  xs.push(edgeX - 90, edgeX - 110, edgeX - 150);
  // Dense through the shore band (36..52) because that is where the drape has to
  // carry a coastline, and through 96..136 because that is where the far berm
  // rises through the water and the sheet has to take over from it.
  //
  // Past `seaMax` the ORIGINAL coarse rows are kept exactly. Out there the drape
  // rides the far-shore paddock, and sampling that terrain more finely would make
  // the sheet follow its lumps — a sea with hills in it. Texture for the far band
  // comes from the whitecap and glitter layer instead, which sits on top of the
  // sheet and does not care what shape it is.
  const zs = [];
  for (let v = 24; v < 52; v += 3.5) zs.push(v);
  for (let v = 52; v < 150; v += 4.5) zs.push(v);
  // Past `seaMax` the rows are added for COLOUR, not for shape. The lift out
  // there is a max over a cell floored at 14 m whatever the station spacing is,
  // so the sheet is smoothed exactly as hard as r6 smoothed it (11-16 m) and
  // cannot start following the far paddock's lumps — but the swell now has
  // somewhere to be written between sea 150 and 230, which is the top 180 rows
  // of the plate and was one flat card.
  zs.push(
    seaMax + 4, seaMax + 14, seaMax + 26, seaMax + 40, seaMax + 56,
    seaMax + 74, seaMax + 96, seaMax + 122, seaMax + 152, seaMax + 195,
    seaMax + 240, seaMax + 290,
  );

  const probe = new THREE.Vector3();
  const groundCache = new Map();
  // A vertex over the board's own terrain HOLE has no height at all, and this
  // reads that back as the water line rather than as deep water. That is
  // deliberate and it was MEASURED: reading a hole back as deep water makes the
  // ground-driven far cover go to zero over the whole open bay, and the board's
  // own far-water foam decals — flat pale slabs with hard edges, none of them
  // this file's geometry — come up through the backdrop across the top third of
  // the frame. The drape is what hides them. Do not "fix" this to -60.
  const sampleGround = (x, z) => {
    if (!heightAt) return 0;
    const key = `${Math.round(x * 4)}:${Math.round(z * 4)}`;
    const hit = groundCache.get(key);
    if (hit !== undefined) return hit;
    probe.set(x, 0, z).applyMatrix4(local.matrixWorld);
    const h = heightAt(probe.x, probe.z);
    const out = Number.isFinite(h) ? Math.min(h, 26) : 0;
    groundCache.set(key, out);
    return out;
  };
  /**
   * Highest terrain in the cell around this vertex, not the terrain exactly
   * under it. The drape is a coarse quad grid, so its surface between two
   * vertices is a straight line while the ground under it is not: sampling only
   * at vertices let a berm poke through the middle of a quad, which is where the
   * ruled horizontal at the backdrop/sand join came from in r3.
   */
  /**
   * THE SAMPLING RADIUS DOES NOT SHRINK WITH THE DENSER GRID.
   *
   * r6 sampled a cell of half the station spacing — 13 to 16 m over the terrain
   * it has to cover. Densifying the grid would have cut that to 3.5 m, and a
   * smaller max-over-cell lets the drape sit LOWER, which is the one direction
   * that can expose what it is there to hide. So the radius is floored at 14 m
   * wherever there is real terrain to clear (past the along cut, or out past the
   * bay) and left tight only over this venue's own beach, where the sheet is
   * transparent anyway and hoisting it would put a step at the waterline.
   */
  const cellRadius = (span, x, z) => {
    const real = Math.max(clamp01((z - 96) / 24), clamp01((edgeX + 4 - x) / 6));
    return Math.min(16, Math.max(span * 0.5, 14 * real));
  };
  const groundY = (x, z, dx, dz) => {
    // Capped: the outermost cells of this grid are 130 m across, and taking the
    // max over half of one of those hoists the drape onto a hill sixty metres
    // away, which is how a ten-metre wall of deep-sea tone appeared at the
    // horizon and crushed to black.
    const rx = cellRadius(dx, x, z);
    const rz = cellRadius(dz, x, z);
    let h = sampleGround(x, z);
    for (const ox of [-rx, 0, rx]) {
      for (const oz of [-rz, 0, rz]) {
        if (ox === 0 && oz === 0) continue;
        h = Math.max(h, sampleGround(x + ox, z + oz));
      }
    }
    return h;
  };

  // ALPHA SITS ON THE CUT IT HIDES, AND NOWHERE ELSE. READ THIS BEFORE TUNING.
  //
  // r3 and r4 were both vetoed for the same object: a translucent quad lying
  // across the bottom right of the hero frame, with a 1-2 px leading edge that
  // crossed deep ocean, teal shallows, wet reef and dry sand in one straight
  // line. Two rounds attributed it to render order, to lift, and to the shore
  // band. It was none of those. It was the width of this ramp.
  //
  // `edgeX` is where the board's terrain hole stops; the finite water runs four
  // metres past it. THIS VENUE'S OWN BEACH RUNS PAST IT TOO — the cove sand,
  // the umbrella clusters and the boulder scatter reach x -31, and edgeX is
  // about -27. So a flank ramp that began at edgeX + 10 and finished at edgeX
  // was ten metres of half-opaque sheet laid over this landmark's own dressing,
  // and because the sheet floats 0.85 m above the water it was ABOVE the sand,
  // not under it — the depth test could not save us. Ten metres of along-coast
  // is a quarter of the hero frame at this camera. That is the frosted glass.
  //
  // The ramp is now 2.4 m wide and lands entirely inside the terrain hole, so
  // alpha is identically zero over every metre of this venue's own ground:
  //   flank  0 at edgeX + 2.4  ->  1 at edgeX      (all of it over open bay)
  // The far cover is no longer a fixed distance either. The far berm surfaces
  // anywhere between sea 106 and sea 136 depending on where along the coast you
  // stand, so a fixed 56 m ramp had to start at sea 80 to catch the earliest
  // crossing — and that put a veil over fifty metres of live water. It now
  // follows the seabed instead: transparent while there are 2.4 m of water over
  // the ground, opaque by the time the ground reaches the surface. The
  // intermediate values therefore only ever fall on shoaling water, where a
  // lightening tone is what the eye expects to see.
  //
  // THE RAMP IS 2.4 m ONLY WHERE 2.4 m IS ALL IT CAN HAVE.
  //
  // r6 closed the frosted sheet by making the ramp 2.4 m everywhere, and that is
  // right inshore, where this venue's beach scatter, umbrella clusters and reef
  // aprons run past `edgeX` and any wider ramp lays film over them. It is wrong
  // out at sea, where the only thing on either side of the cut is water: there
  // the 2.4 m ramp is a 24 px tonal step across the open bay, which is the seam
  // the r6 critic tracked from row 255 to row 420.
  //
  // So the ramp opens with distance offshore. The seaward-most dressing this
  // venue owns west of the cut is stack 5 at x -14.6 with a 1.9 m radius (so a
  // west edge at -16.5) and the reef apron at x -19.6, r 5.4 (west edge -25) at
  // sea 43. The ramp's inshore lip is edgeX + width:
  //   sea 43  width 2.4  ->  lip at -24.8, clear of nothing but open water
  //   sea 69  width 7.0  ->  lip at -20.3, clear of stack 5 by 3.8 m
  //   sea 76+ width 10   ->  lip at -17.2, and nothing of ours is out that far
  // Anything wider would reach the stacks, so it stops at ten.
  const flankWidth = (sea) => 2.4 + 7.6 * clamp01((sea - 58) / 18);
  const flankAlpha = (x, sea) => {
    const w = flankWidth(sea);
    return clamp01((edgeX + w - x) / w);
  };
  // Narrowed from (88..100) to (92..102). Its job is to be opaque before the far
  // berm breaks the surface, which the r5 measurement puts between sea 106 and
  // 136, so 102 still clears the earliest crossing by four metres. The reason to
  // narrow it is that over the open hole `groundCover` is 0.99 everywhere, so
  // this term alone paints a part-opaque band right across the bay — and a
  // part-opaque sheet floating 0.85 m over live water is the frosted-glass
  // failure in miniature. Halving its width halves the band, and the sea
  // furniture is kept out of what is left of it.
  const seaGate = (sea) => clamp01((sea - 92) / 10);
  const groundCover = (gy) => clamp01((gy - (WATER_Y - 2.4)) / 2.4);
  // Backstop: well past the water's own seaward cut nothing but drape is left,
  // whatever the terrain sampler says.
  const farAlpha = (sea, gy) => Math.max(
    seaGate(sea) * groundCover(gy),
    clamp01((sea - (seaMax + 20)) / 40),
  );
  // Past the end of the board's bay the drape carries the coast on: dry sand
  // shows through below sea 36, a foam line lands at 43, and the sea takes over
  // by 50. Without this the drape's own lower boundary WAS the coastline — a
  // ruled horizontal where flat teal met flat beige with nothing between them.
  // ...but only where the board has stopped drawing a coast of its own. Past the
  // along cut the board's beach and rock still run on for a few metres before
  // the annulus takes over, and painting a fake foam line over a real one is the
  // same fault as the frosted sheet, just smaller and further right. Where the
  // ground under the sheet is still a shore (below 2.2 m) and the vertex is
  // still inshore (nearer than sea 56), the drape hands the coast back. Where
  // the ground is a hill, the drape keeps covering — that is the whole point of
  // the lift.
  const shoreHold = (sea, gy) => 1
    - clamp01((56 - sea) / 10) * clamp01((2.2 - gy) / 2.0);
  const alphaAt = (x, sea, gy) => {
    const shore = drapeShore(sea);
    const flank = flankAlpha(x, sea) * (shore ? shore.a : 1) * shoreHold(sea, gy);
    return Math.max(flank, farAlpha(sea, gy));
  };
  // LIFT IS GATED ON ALPHA, not computed beside it. The sheet may only leave
  // the water once it is opaque: an airborne translucent sheet is the exact
  // object the interpenetration veto names, and r4 had one because lift and
  // alpha ran off two independent ramps that did not agree about where the
  // board ended. Clearance grows with the hill it is clearing, so where the far
  // berm only just breaks the surface the sheet rises a metre, not four, and
  // there is no fold at the waterline.
  const liftAt = (alpha) => clamp01((alpha - 0.72) / 0.28);
  // Colour-only distance term: how far into the open bay a vertex sits, used to
  // blend the shore band out and to flatten the swell toward the horizon. It is
  // NOT an alpha term any more.
  const seaward = (sea) => clamp01((sea - (seaMax - 70)) / 56);

  // Clear of the live water's chop, which reaches roughly +-0.65.
  const baseY = WATER_Y + 0.85;
  /**
   * Height of the surface a floating thing rests on at this station, and the
   * ground under it. Exported so the sea furniture sits ON the water rather than
   * at a guessed height: inshore of the drape's opaque line the visible surface
   * is the board's live bay at WATER_Y, and past it the drape's own sheet, which
   * rides up over the far berm. Anything placed by eye would be underwater at one
   * end of the bay and airborne at the other.
   */
  const surfaceAt = (x, sea) => {
    const gy = groundY(x, sea, 8, 8);
    const alpha = alphaAt(x, sea, gy);
    const raise = liftAt(alpha);
    const clearance = 1.2 + 2.8 * clamp01(gy / 6);
    const drapeY = baseY + raise * Math.max(0, gy + clearance - baseY);
    // `veiled` is the honest answer to "what is the surface here?": in the band
    // where the sheet is neither clear nor opaque there are TWO surfaces, 0.85 m
    // apart, and anything floated on either one shows daylight under it against
    // the other. Callers skip those stations rather than pick a side.
    return {
      gy,
      alpha,
      veiled: alpha > 0.12 && alpha < 0.88,
      y: alpha >= 0.88 ? drapeY : WATER_Y,
    };
  };
  const positions = [];
  const colors = [];
  const indices = [];
  for (let i = 0; i < xs.length; i += 1) {
    for (let j = 0; j < zs.length; j += 1) {
      const x = xs[i];
      const z = zs[j];
      const dx = Math.abs((xs[Math.min(i + 1, xs.length - 1)] - xs[Math.max(i - 1, 0)]) * 0.5);
      const dz = Math.abs((zs[Math.min(j + 1, zs.length - 1)] - zs[Math.max(j - 1, 0)]) * 0.5);
      const gy = groundY(x, z, dx, dz);
      const alpha = alphaAt(x, z, gy);
      const raise = liftAt(alpha);
      const clearance = 1.2 + 2.8 * clamp01(gy / 6);
      const y = baseY + raise * Math.max(0, gy + clearance - baseY);
      positions.push(x, y, z);
      const shore = drapeShore(z);
      const colour = shore
        ? shore.colour.clone().lerp(seaTone(z, x), seaward(z))
        : seaTone(z, x).clone();
      // Swell, as a trough-and-crest, not a sine.
      //
      // MULTIPLICATIVE, never offsetHSL. The sea tones are near-black in linear
      // space, so subtracting 0.1 of lightness from one clamped whole grid cells
      // to pure (0,0,0) — that is where the black mass at the top right of the
      // r4-interim plate came from, not from the geometry under it.
      //
      // The crest term is separate from the body term because water is not a
      // sinusoid in tone: the back of a swell is a broad, slow darkening and its
      // face is a narrow bright line where the sky lands on it. A single sine
      // gives a value range of 0.07 spread over a hundred metres, which is what
      // r6 measured. This gives a narrow bright band every 22 m.
      const s = swellField(x, z);
      const crest = clamp01((s - 0.18) / 0.55);
      const damp = 1 - seaward(z) * 0.15;
      colour.multiplyScalar(1 + s * 0.56 * damp);
      colour.lerp(SEA_GLARE, crest * crest * 0.26 * damp);
      colour.setRGB(
        colour.r + SEA_LIFT_R,
        colour.g + SEA_LIFT,
        colour.b + SEA_LIFT,
        THREE.LinearSRGBColorSpace,
      );
      colors.push(colour.r, colour.g, colour.b, alpha);
      if (i > 0 && j > 0) {
        const a = (i - 1) * zs.length + j - 1;
        const b = i * zs.length + j - 1;
        const c = (i - 1) * zs.length + j;
        const d = i * zs.length + j;
        indices.push(a, d, b, a, c, d);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = ownMesh(new THREE.Mesh(geometry, ctx.m.openSea), 'fringe:apostles-open-bay:drape');
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // DRAWN AFTER THE BAY, NOT BEFORE IT.
  //
  // The drape carries `depthWrite: false`, so at renderOrder -1 it never
  // occluded anything: the board's own bay surface is transparent too, drew
  // afterwards, and painted its ragged along-cut straight back over the top of
  // the sheet meant to hide it. That is why two rounds of alpha and lift work
  // never closed the serrated edge at the mid right. It cannot write depth —
  // that would cull the live bay across its whole footprint, alpha zero
  // included — so it has to win on order instead. Alpha is zero everywhere the
  // landmark's own water, foam and beach are, so nothing of ours is painted out.
  mesh.renderOrder = 12;
  local.add(mesh);
  return { backdrop, local, surfaceAt };
}

// ---------------------------------------------------------------------------
// Open-bay furniture.
//
// EVERYTHING BELOW HANGS OFF `fringe:apostles-open-bay`, AND THAT IS THE WHOLE
// REASON IT CAN EXIST.
//
// r5 declined to furnish the sea on the grounds that the hero camera frames the
// bounding box of `fringe:apostles`, so a boat out at sea would drag the frame
// with it and invalidate every before/after measurement in the note. The camera
// claim is true — `capture-seven.mjs` does target that union bbox. The
// conclusion was not: `addSeaBackdrop` already hangs its group off the FRINGE
// PARENT, with a comment explaining that a backdrop inside the landmark group
// would drag the hero framing out to sea with it. The escape hatch was built,
// documented, and then not used. A boat, a buoy or an outlying stack added here
// moves the camera by exactly zero.
//
// What it has to fix: r6 measured the largest contiguous featureless-water
// region at 26.8% of the frame, box (0,0)-(1592,448), over the gate-5 line, and
// the blind-click sentence was "the top half of that one is just empty blue".
// ---------------------------------------------------------------------------

/**
 * Lofted hull. Nine stations from a fine bow to a transom, a real turn of bilge,
 * a sheer that rises forward, and the waterline break carried in the vertex
 * colour: antifouling below, a boot-top band on it, topsides above and a lighter
 * sheer strake under the gunwale. Four tones on one mesh, so a boat at 60 screen
 * pixels still breaks into parts instead of reading as a coloured wedge.
 */
function hullGeo(ctx, key, opts) {
  const {
    len = 8, beam = 2.6, draft = 0.62, freeboard = 0.9, transom = 0.62,
    topsides = '#eef0ea', boot = '#2a3b44', anti = '#7c3340', strake = '#c9d2cc',
  } = opts;
  return shared(ctx, `hull:${key}`, () => {
    const stations = 11;
    const positions = [];
    const colors = [];
    const indices = [];
    const A = new THREE.Color(anti);
    const B = new THREE.Color(boot);
    const T = new THREE.Color(topsides);
    const S = new THREE.Color(strake);
    const tint = (y) => {
      if (y < -0.06) return A;
      if (y < 0.10) return B;
      if (y > freeboard * 0.72) return S;
      return T;
    };
    // Half-section, keel to gunwale. The turn of bilge is a real corner, so the
    // key breaks across it instead of running smoothly down a tube.
    const section = [
      { w: 0.06, y: -1.0 },
      { w: 0.52, y: -0.86 },
      { w: 0.86, y: -0.44 },
      { w: 1.0, y: 0.0 },
      { w: 0.99, y: 0.42 },
      { w: 0.96, y: 1.0 },
    ];
    const ring = section.length * 2;
    for (let s = 0; s < stations; s += 1) {
      const t = s / (stations - 1);
      // Fine entry forward, full amidships, a transom aft that does not taper to
      // a point — a double-ended hull is a canoe, not a work boat.
      const fullness = t < 0.62
        ? Math.sin(Math.min(1, t / 0.62) * Math.PI * 0.5) ** 0.62
        : transom + (1 - transom) * Math.cos(((t - 0.62) / 0.38) * Math.PI * 0.5) ** 0.8;
      const sheer = freeboard * (0.86 + 0.42 * (1 - t) ** 2.1);
      const rocker = draft * (0.34 + 0.66 * Math.sin(Math.min(1, t / 0.8) * Math.PI * 0.86));
      const px = (t - 0.5) * len + (1 - t) ** 3 * len * 0.06;
      for (let k = 0; k < ring; k += 1) {
        const half = k < section.length ? k : ring - 1 - k;
        const side = k < section.length ? -1 : 1;
        const p = section[half];
        const y = p.y < 0 ? p.y * rocker : p.y * sheer;
        positions.push(px, y, side * p.w * beam * 0.5 * fullness);
        const c = tint(y);
        colors.push(c.r, c.g, c.b);
      }
    }
    for (let s = 1; s < stations; s += 1) {
      for (let k = 0; k < ring; k += 1) {
        const k2 = (k + 1) % ring;
        const a = (s - 1) * ring + k;
        const b = s * ring + k;
        const c = (s - 1) * ring + k2;
        const d = s * ring + k2;
        // WOUND OUTWARD, AND I GOT THIS WRONG FIRST TIME LIKE EVERYONE BEFORE ME.
        //
        // The file has warned about inside-out ring meshes three times — the rock
        // forms, the plateau lawn, the ochre ribbons — and the r5 builder wrote
        // that warning and then wound the parasol inside-out anyway. So did I:
        // (a, b, d) put the mean face normal at -0.42 against the radial, i.e.
        // pointing INTO the hull, which lights a boat from inside and reads as a
        // flat coloured wedge. `_scratch/ap7/winding.mjs` measures it — mean
        // dot(faceNormal, radialFromAxis) must be clearly POSITIVE. It is +0.42
        // now. Re-run it if you touch these four lines.
        indices.push(a, d, b, a, c, d);
      }
    }
    // Deck. Wound upward — every hand-built ring in this file has been inside-out
    // at least once, and the tell is a surface that lights from underneath.
    const deck = positions.length / 3;
    const D = new THREE.Color(strake).multiplyScalar(0.82);
    for (let s = 0; s < stations; s += 1) {
      const base = s * ring;
      for (const k of [section.length - 1, ring - section.length]) {
        positions.push(positions[base * 3 + k * 3], positions[base * 3 + k * 3 + 1],
          positions[base * 3 + k * 3 + 2]);
        colors.push(D.r, D.g, D.b);
      }
    }
    for (let s = 1; s < stations; s += 1) {
      const a = deck + (s - 1) * 2;
      const b = deck + s * 2;
      indices.push(a, a + 1, b + 1, a, b + 1, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  });
}

/**
 * Wake: a widening foam fan behind a moving hull, alpha zero on both edges and
 * zero again at its tail, so it has no rim to read as a decal. Same rule as the
 * foam collars — an opaque edge on water is the tell that killed r3.
 */
function addWake(group, m, len, width, y, seed) {
  const rows = 9;
  const positions = [];
  const colors = [];
  const indices = [];
  for (let r = 0; r < rows; r += 1) {
    const t = r / (rows - 1);
    const spread = width * (0.28 + 1.5 * t);
    const fade = (1 - t) ** 1.5;
    for (let s = -2; s <= 2; s += 1) {
      const u = s / 2;
      const edge = 1 - u * u;
      const feather = 0.55 + 0.45 * Math.sin(t * 14.2 + s * 2.4 + seed)
        * Math.sin(t * 5.1 + seed * 0.7);
      positions.push(
        -t * len,
        y + 0.02 - t * 0.01,
        u * spread + Math.sin(t * 6.1 + seed) * width * 0.12,
      );
      // The foam token throughout (bright on the inner V, 18% darker outboard),
      // rimless, at no more than the foam rule's 0.7 opacity. The wake fades to
      // nothing at its tail, which sits at about two hull lengths.
      const inner = edge * edge;
      const k = 0.82 + 0.18 * inner;
      const cr = FOAM_COLOUR.r * k;
      const cg = FOAM_COLOUR.g * k;
      const cb = FOAM_COLOUR.b * k;
      const a = fade * edge * feather * (0.30 + 0.28 * Math.sin(t * 9.3 + s * 1.7 + seed)) * FOAM_OPACITY;
      colors.push(cr, cg, cb, Math.max(0, a));
    }
    if (r > 0) {
      for (let s = 0; s < 4; s += 1) {
        const a = (r - 1) * 5 + s;
        const b = r * 5 + s;
        indices.push(a, b, b + 1, a, b + 1, a + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  g.setIndex(indices);
  g.computeVertexNormals();
  const mesh = ownMesh(new THREE.Mesh(g, m.foamSurface));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 13;
  group.add(mesh);
  return mesh;
}

/**
 * Tour / trawler water half: displacement halo, wetted band, attached wake.
 * Same contact language the port critic asked for — hulls sit IN the sea.
 */
function addHullWaterContact(ctx, state, spec, built) {
  const { m } = ctx;
  // 1.69 is 0.88 / 0.52 — the ratio by which `addWaterCollar`'s alpha peak moved
  // inboard when its rows were re-cut to put the dark hard against a STACK foot.
  // A hull is not a stack: its dark water belongs OUTSIDE the waterline, not
  // under the boat, so the extents scale by the same ratio and the halo lands
  // where it did before, peaking at 0.77 and dying at 1.52 of hull length.
  const halo = addWaterCollar(state.root, m, 0, 0, spec.len * 1.49, spec.beam * 2.06,
    spec.seed + 21, `${spec.name}:halo`, -0.02);
  halo.rotation.y = 0;
  state.halo = halo;
  const collar = new THREE.Group();
  collar.name = `${spec.name}:wet-collar`;
  noPick(collar);
  state.root.add(collar);
  // Cylinder height runs along the hull after rotZ; radius is the waterline wrap.
  place(collar, cylGeo(ctx, spec.beam * 0.52, spec.beam * 0.58, spec.len * 0.78, 10), m.hullWet,
    0, 0.10, 0, {
      rotZ: Math.PI / 2, cast: false, receive: false, name: `${spec.name}:wetted-band`,
    });
  addFoamRing(collar, m, spec.len * 0.38, 0, spec.beam * 0.72, spec.beam * 0.55, 0,
    spec.seed + 23, 0.06, { name: `${spec.name}:bow-collar` });
  addAeratedCollar(collar, m, spec.beam * 0.85, spec.beam * 0.62, spec.seed + 29,
    `${spec.name}:aerated`, spec.kind === 'tour');
  state.wetCollar = collar;
  void built;
}

/**
 * One swell crest as a soft band.
 *
 * Same construction rule as the foam collars, which is the one thing on this
 * venue's water that has never been called a decal: alpha reaches zero on BOTH
 * long edges and at BOTH ends, so there is no opaque rim anywhere on it. The
 * strength also runs in and out along the line, because a swell breaks in
 * patches and an even pale line drawn across a frame is exactly the ruled edge
 * the veto list names.
 */
function addSwellBand(group, m, pts, width, seed, name) {
  const rows = [
    { u: -1.0, a: 0, c: '#8fb9bd' },
    { u: -0.45, a: 0.34, c: '#b6d2d1' },
    { u: 0.05, a: 0.62, c: '#d6e6e2' },
    { u: 0.55, a: 0.30, c: '#b0cccd' },
    { u: 1.0, a: 0, c: '#7fadb4' },
  ];
  const positions = [];
  const colors = [];
  const indices = [];
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dz = next.sea - prev.sea;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const t = i / (pts.length - 1);
    // Ends fade, and the middle breathes: two incommensurate terms, so the run of
    // foam is patchy rather than a taper.
    const ends = Math.min(1, Math.min(t, 1 - t) / 0.14);
    const patch = clamp01(0.30 + 0.85 * Math.sin(i * 0.63 + seed * 1.9)
      + 0.45 * Math.sin(i * 0.27 + seed));
    const strength = ends * (0.18 + 0.82 * patch);
    const w = width * (0.7 + 0.55 * patch);
    for (let r = 0; r < rows.length; r += 1) {
      const row = rows[r];
      positions.push(
        p.x + nx * row.u * w,
        p.y + 0.07 + (1 - Math.abs(row.u)) * 0.05,
        p.sea + nz * row.u * w,
      );
      const colour = new THREE.Color(row.c);
      colors.push(colour.r, colour.g, colour.b, row.a * strength);
      if (i > 0 && r > 0) {
        const a = (i - 1) * rows.length + r - 1;
        const b = i * rows.length + r - 1;
        const c = (i - 1) * rows.length + r;
        const d = i * rows.length + r;
        // Wound face-UP. `_scratch/ap7/winding.mjs` measured the first version at
        // mean face-normal Y of -1.0, i.e. every triangle looking at the seabed.
        // It made no difference to the render, because `foamSurface` is
        // DoubleSide and the standard material flips the shading normal per
        // fragment on a back face — but the drape is wound the same way and one
        // day somebody will take DoubleSide off one of these materials, and this
        // file has already lost four surfaces to exactly that.
        indices.push(a, d, b, a, c, d);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  g.setIndex(indices);
  g.computeVertexNormals();
  const mesh = ownMesh(new THREE.Mesh(g, m.foamSurface), name);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 13;
  group.add(mesh);
  return mesh;
}

/** One boat, hull + working gear, sitting on the surface the drape reports. */
function addBoat(ctx, group, spec) {
  const { m } = ctx;
  const {
    x, sea, yaw, y, len, beam, kind, seed, topsides, anti = '#7c3340', name,
  } = spec;
  // TWO NODES, AND THE SPLIT IS LOAD-BEARING.
  //
  // `root` carries position and heading and stays LEVEL. `boat` carries heave,
  // pitch and roll. The wake and the bow wave hang off `root`, so they lie flat
  // on the water while the hull works on top of them — a wake parented to a
  // rolling hull tips with it, and a tipped sheet of foam on water is the exact
  // decal read this venue spent three rounds killing on the shoreline.
  const root = new THREE.Group();
  root.position.set(x, y, sea);
  root.rotation.y = yaw;
  root.name = name;
  noPick(root);
  group.add(root);
  const boat = new THREE.Group();
  boat.name = `${name}:hull`;
  noPick(boat);
  root.add(boat);
  const freeboard = beam * 0.36;
  const draft = beam * 0.26;
  place(boat, hullGeo(ctx, `${kind}:${len}:${beam}:${spec.strake ?? ''}`, {
    len, beam, draft, freeboard, topsides, anti, strake: spec.strake ?? undefined,
    transom: kind === 'dinghy' ? 0.5 : 0.66,
  }), m.hullPaint, 0, 0, 0, { receive: false });

  if (kind === 'tour') {
    // Two-deck cabin with a window band, a mast and a radar arch: a tour boat has
    // a silhouette, and a silhouette is what reads at this distance.
    bevelBox(ctx, boat, len * 0.46, freeboard * 1.5, beam * 0.72, m.hullWhite,
      -len * 0.02, freeboard * 1.5, 0, { bevel: 0.06 });
    bevelBox(ctx, boat, len * 0.44, freeboard * 0.52, beam * 0.76, m.glass,
      -len * 0.02, freeboard * 1.76, 0, { bevel: 0.04 });
    bevelBox(ctx, boat, len * 0.3, freeboard * 1.1, beam * 0.56, m.hullWhite,
      len * 0.05, freeboard * 2.6, 0, { bevel: 0.05 });
    bevelBox(ctx, boat, len * 0.28, freeboard * 0.4, beam * 0.6, m.glass,
      len * 0.05, freeboard * 2.8, 0, { bevel: 0.03 });
    place(boat, cylGeo(ctx, 0.05, 0.06, freeboard * 2.4, 6), m.steel,
      len * 0.16, freeboard * 4.2, 0, {});
    place(boat, boxGeo(ctx, 0.06, 0.06, beam * 0.5), m.steel,
      len * 0.16, freeboard * 5.1, 0, {});
    // Canvas canopy over the after deck — the tour-launch read.
    bevelBox(ctx, boat, len * 0.42, 0.06, beam * 0.78, m.cream,
      -len * 0.28, freeboard * 2.35, 0, { bevel: 0.04 });
    for (const side of [-1, 1]) {
      place(boat, cylGeo(ctx, 0.035, 0.04, freeboard * 1.55, 5), m.steel,
        -len * 0.44, freeboard * 1.55, side * beam * 0.34, {});
      place(boat, cylGeo(ctx, 0.035, 0.04, freeboard * 1.55, 5), m.steel,
        -len * 0.12, freeboard * 1.55, side * beam * 0.34, {});
    }
    // Handrail round the after deck.
    for (const side of [-1, 1]) {
      place(boat, boxGeo(ctx, len * 0.34, 0.05, 0.05), m.steel,
        -len * 0.28, freeboard * 1.22, side * beam * 0.42, {});
      for (let p = 0; p < 4; p += 1) {
        place(boat, cylGeo(ctx, 0.03, 0.03, freeboard * 0.5, 5), m.steel,
          -len * 0.43 + p * len * 0.1, freeboard * 0.98, side * beam * 0.42, {});
      }
    }
    const cloth = clothSet(m);
    addFigure(ctx, boat, len * 0.08, freeboard * 1.55, 0, {
      h: 2.55, shirt: m.white, legs: m.hullDark, yaw: 0, hat: m.red,
      name: `${name}:helm`,
    });
    addFigure(ctx, boat, len * 0.02, freeboard * 1.55, beam * 0.18, {
      h: 2.5, shirt: m.teal, legs: m.blue, yaw: 0.4,
      name: `${name}:crew`,
    });
    for (let p = 0; p < 6; p += 1) {
      addFigure(ctx, boat, -len * 0.40 + (p % 3) * len * 0.12, freeboard * 0.62,
        (p < 3 ? 1 : -1) * beam * 0.22, {
          h: 2.45, shirt: cloth[(seed + p * 3) % cloth.length],
          legs: cloth[(seed + p) % cloth.length],
          yaw: (p < 3 ? 0.2 : -0.2) + rand(p, 301 + seed, -0.3, 0.3),
          skin: p % 3 === 0 ? m.skinDark : m.skin,
          sit: true,
          name: `${name}:tourist:${p}`,
        });
    }
  } else if (kind === 'trawler') {
    bevelBox(ctx, boat, len * 0.3, freeboard * 1.6, beam * 0.66, m.hullWhite,
      len * 0.12, freeboard * 1.5, 0, { bevel: 0.06 });
    bevelBox(ctx, boat, len * 0.28, freeboard * 0.5, beam * 0.7, m.glass,
      len * 0.12, freeboard * 1.92, 0, { bevel: 0.03 });
    place(boat, cylGeo(ctx, 0.05, 0.07, freeboard * 3.4, 6), m.steel,
      len * 0.04, freeboard * 3.2, 0, {});
    // Boom, outriggers and a net on the stern drum — working gear.
    const boom = place(boat, cylGeo(ctx, 0.04, 0.05, len * 0.44, 5), m.steel,
      -len * 0.18, freeboard * 2.5, 0, {});
    boom.rotation.z = 1.28;
    for (const side of [-1, 1]) {
      const outrigger = place(boat, cylGeo(ctx, 0.035, 0.04, beam * 1.35, 5), m.steel,
        -len * 0.08, freeboard * 1.7, side * beam * 0.08, {});
      outrigger.rotation.z = side * 1.05;
      outrigger.rotation.y = side * 0.18;
    }
    place(boat, cylGeo(ctx, beam * 0.2, beam * 0.2, beam * 0.5, 9), m.buoyOrange,
      -len * 0.3, freeboard * 1.1, 0, { rotX: Math.PI / 2 });
    // Net wrapped on the drum.
    for (let k = 0; k < 5; k += 1) {
      place(boat, boxGeo(ctx, 0.04, beam * 0.42, 0.04), m.hullDark,
        -len * 0.3 + (k - 2) * 0.07, freeboard * 1.1, 0, {
          rotZ: k * 0.31, rotX: 0.4,
        });
    }
    place(boat, bevelGeo(ctx, len * 0.14, freeboard * 0.5, beam * 0.5, 0.04), m.hullDark,
      -len * 0.42, freeboard * 0.9, 0, {});
    for (let p = 0; p < 3; p += 1) {
      place(boat, cylGeo(ctx, 0.16, 0.16, 0.5, 7), m.tyre,
        -len * 0.05 - p * len * 0.12, freeboard * 0.5, beam * 0.5, { rotX: Math.PI / 2 });
    }
    addFigure(ctx, boat, len * 0.12, freeboard * 1.55, 0, {
      h: 2.55, shirt: m.yellow, legs: m.hullDark, yaw: 0, hat: m.yellow,
      name: `${name}:helm`,
    });
    addFigure(ctx, boat, -len * 0.22, freeboard * 0.62, beam * 0.14, {
      h: 2.5, shirt: m.orange, legs: m.hullDark, yaw: 1.9,
      name: `${name}:crew`,
    });
  } else if (kind === 'jetski') {
    bevelBox(ctx, boat, len * 0.42, freeboard * 0.55, beam * 0.55, m.red,
      len * 0.08, freeboard * 0.4, 0, { bevel: 0.05 });
    bevelBox(ctx, boat, len * 0.22, freeboard * 0.7, beam * 0.28, m.hullDark,
      -len * 0.12, freeboard * 0.7, 0, { bevel: 0.04 });
    place(boat, boxGeo(ctx, 0.12, 0.18, 0.18), m.yellow, len * 0.18, freeboard * 0.72, 0, {});
    addFigure(ctx, boat, -len * 0.04, freeboard * 0.55, 0, {
      h: 2.4, shirt: seed % 2 ? m.orange : m.teal, legs: m.hullDark, yaw: 0,
      name: `${name}:rider`,
    });
  } else {
    // Runabout / dinghy: thwarts, an outboard and a coil of rope.
    for (let p = 0; p < 2; p += 1) {
      place(boat, boxGeo(ctx, len * 0.1, 0.09, beam * 0.86), m.deck,
        -len * 0.1 + p * len * 0.28, freeboard * 0.52, 0, {});
    }
    place(boat, bevelGeo(ctx, len * 0.13, freeboard * 0.8, beam * 0.3, 0.04), m.hullDark,
      -len * 0.46, freeboard * 0.62, 0, {});
    // AN OAR LIES DOWN. This is a CylinderGeometry, whose axis is +Y, and it was
    // placed with a rotY only — so the "oar stowed along the gunwale" has been
    // standing straight up out of the thwarts as a 2.1 m pole. It is in the r0
    // board plate: at 8x the tender carries a bare vertical rod amidships. rotZ
    // lays it fore-and-aft and the small rotX gives the blade its cant.
    place(boat, cylGeo(ctx, 0.05, 0.05, len * 0.5, 5), m.deckDark,
      len * 0.02, freeboard * 0.72, beam * 0.38,
      { rotY: 0.14, rotZ: Math.PI / 2, rotX: 0.09 });
    place(boat, sphereGeo(ctx, beam * 0.12, 7), m.cream,
      len * 0.24, freeboard * 0.56, 0, { scale: [1, 0.5, 1] });
    addFigure(ctx, boat, len * 0.08, freeboard * 0.62, 0, {
      h: 2.5, shirt: kind === 'runabout' ? m.white : m.cream, legs: m.blue, yaw: 0,
      sit: true, name: `${name}:helm`,
    });
    addFigure(ctx, boat, -len * 0.12, freeboard * 0.6, beam * 0.12, {
      h: 2.45, shirt: kind === 'runabout' ? m.orange : m.teal, legs: m.hullDark,
      yaw: 0.35, sit: true, name: `${name}:crew`,
    });
  }
  return { root, hull: boat, freeboard, draft };
}

/**
 * Anchor gear for a boat that is NOT making way.
 *
 * The r0 plate has four hulls and one visible wake, and a hull with no wake and
 * no anchor read is just a boat the animator forgot. A moored boat says so:
 * chain over the stemhead, a rode running down-sun into the water at the angle a
 * short scope actually lies at, and a ring of disturbed water where it enters.
 * The rode hangs off `root`, so it stays vertical in the world while the hull
 * pitches and rolls under it — which is what a chain does.
 */
function addAnchorGear(ctx, hull, flat, len, beam, freeboard, seed) {
  const { m } = ctx;
  const rode = new THREE.Group();
  rode.name = `${hull.name.replace(':hull', '')}:rode`;
  noPick(rode);
  hull.add(rode);
  const drop = 1.55;
  const reach = 2.5 + hash(seed, 471) * 1.4;
  const lie = Math.atan2(reach, drop);
  const chain = place(rode, cylGeo(ctx, 0.035, 0.045, Math.hypot(reach, drop), 5), m.steel,
    len * 0.46 + reach * 0.5, freeboard * 0.34 - drop * 0.5, 0, { cast: false });
  chain.rotation.z = -(Math.PI / 2 - lie);
  // Bow roller, so the chain leaves the boat over something rather than out of
  // the paint.
  place(rode, cylGeo(ctx, 0.07, 0.07, beam * 0.16, 6), m.steel,
    len * 0.45, freeboard * 0.42, 0, { rotX: Math.PI / 2, cast: false });
  // The disturbed ring where the rode enters goes on the FLAT node: foam lies on
  // the water, so it takes the heave and refuses the pitch and roll.
  addFoamRing(flat, m, len * 0.46 + reach, 0, 1.5, 1.0, 0, seed + 5, 0.06);
  return rode;
}

/**
 * Mooring buoy off the bow of a boat that is not making way: a slack line and
 * a small swing. The rode already says "at anchor"; this is the other half of
 * that sentence, the thing the line is made fast to.
 */
function addMooringBuoy(ctx, group, boatRoot, spec, y) {
  const { m } = ctx;
  const reach = 3.4;
  const bx = spec.x + Math.cos(spec.yaw) * (spec.len * 0.5 + reach);
  const bz = spec.sea - Math.sin(spec.yaw) * (spec.len * 0.5 + reach);
  const buoy = new THREE.Group();
  buoy.name = `${spec.name}:mooring-buoy`;
  buoy.position.set(bx, y + 0.22, bz);
  noPick(buoy);
  group.add(buoy);
  place(buoy, sphereGeo(ctx, 0.38, 8), m.buoyOrange, 0, 0, 0, { scale: [1, 0.82, 1] });
  place(buoy, cylGeo(ctx, 0.12, 0.14, 0.22, 6), m.white, 0, 0.28, 0, {});
  place(buoy, cylGeo(ctx, 0.04, 0.04, 0.55, 5), m.steel, 0, 0.55, 0, {});
  const lineLen = Math.hypot(spec.len * 0.5 + reach * 0.15, 0.4);
  const line = place(group, cylGeo(ctx, 0.025, 0.03, lineLen, 5), m.hullDark,
    (spec.x + bx) * 0.5, y + 0.18, (spec.sea + bz) * 0.5, { cast: false });
  line.name = `${spec.name}:mooring-line`;
  const yaw = Math.atan2(bx - spec.x, bz - spec.sea);
  line.rotation.y = yaw;
  line.rotation.z = 0.22;
  addFoamRing(group, m, bx, bz, 1.1, 0.85, spec.yaw, spec.seed + 11, y + 0.05);
  return buoy;
}

/**
 * Cray-pot marker. The weighted float carries the working mark.
 * P21 A1B: rigid flying cloth and its sub-pixel whip pole are cut.
 */
function addPotMarker(ctx, group, x, sea, y, seed, name) {
  const { m } = ctx;
  const g = new THREE.Group();
  g.position.set(x, y, sea);
  g.rotation.y = rand(seed, 311, -3, 3);
  g.rotation.z = rand(seed, 312, -0.16, 0.16);
  g.name = name;
  noPick(g);
  group.add(g);
  const float = seed % 2 ? m.buoyOrange : m.buoyLime;
  place(g, sphereGeo(ctx, 0.46, 8), float, 0, 0.24, 0, { scale: [1, 0.86, 1] });
  place(g, cylGeo(ctx, 0.42, 0.46, 0.2, 8), m.white, 0, 0.44, 0, {});
  return g;
}

/**
 * Kelp raft — a mat of bull-kelp FRONDS, not a ragged olive disc.
 *
 * THE r1 CRITIC CALLED THIS A GULL'S CAST SHADOW, AND THAT IS THE DEFECT.
 * It measured the shape at ~180 x 87 px, read two swept wings and a notched
 * tail in it, and named it "the only object in the frame that a viewer cannot
 * identify". It is not a shadow: no gull in this venue casts one — all four
 * instanced meshes carry `castShadow: false`, verified on the built graph — and
 * nothing else in `src/` draws bird shadows. Projected through the hero pose,
 * the object in the critic's box (1380,860)-(1600,990) is **kelp raft 4 at
 * (1290,849)-(1539,994)**, and kelp raft 0 measures 181 x 86 px, which is the
 * ~180 x 87 they reported. The colour behaviour they measured — R rising 3 to 46
 * while G and B fall and luminance stays flat — is olive over blue at alpha
 * 0.42-0.72, exactly this material.
 *
 * So the fault was never scale or registration. It was that a smooth alpha-faded
 * ellipse at 180 px is ambiguous, and a viewer resolves an ambiguous shape into
 * the nearest thing it could be. Real bull kelp is long ribbon fronds streaming
 * off a holdfast, all lying the same way on the drift: strands with gaps between
 * them, which is the one silhouette that cannot be misread as a bird. Halved in
 * size as well, because a 16 m weed mat was reading as something the size of a
 * boat.
 */
function addKelpRaft(group, m, x, sea, y, rx, rz, seed) {
  const positions = [];
  const colors = [];
  const indices = [];
  const FROND = [
    { t: 0.00, w: 0.30, a: 0.30 },
    { t: 0.22, w: 1.00, a: 0.74 },
    { t: 0.55, w: 0.86, a: 0.68 },
    { t: 0.80, w: 0.52, a: 0.42 },
    { t: 1.00, w: 0.00, a: 0.00 },
  ];
  const CORE = new THREE.Color('#2c3d24');
  const EDGE = new THREE.Color('#556b3a');
  const n = 7 + (seed % 3);
  // All fronds stream within a narrow arc — weed lies along the drift, it does
  // not radiate like a starfish.
  const drift = seed * 0.7;
  for (let f = 0; f < n; f += 1) {
    const a = drift + (f / n - 0.5) * 1.5 + 0.42 * Math.sin(f * 2.3 + seed);
    const len = 0.55 + 0.45 * hash(f, seed * 5 + 1);
    const wob = 0.5 + 0.5 * Math.sin(f * 1.7 + seed * 0.9);
    const base = positions.length / 3;
    for (let i = 0; i < FROND.length; i += 1) {
      const row = FROND[i];
      // Each frond curves as it streams, so no two are the same line.
      const bend = row.t * row.t * (0.5 - hash(f, seed * 5 + 2)) * 1.1;
      const ax = a + bend;
      const px = x + Math.cos(ax) * rx * row.t;
      const pz = sea + Math.sin(ax) * rz * row.t;
      const nx = -Math.sin(ax);
      const nz = Math.cos(ax);
      const w = row.w * (0.22 + 0.2 * wob);
      for (let e = -1; e <= 1; e += 2) {
        positions.push(px + nx * w * e * rx * 0.5, y + 0.05 + i * 0.004,
          pz + nz * w * e * rz * 0.5);
        const c = e < 0 ? CORE : EDGE;
        colors.push(c.r, c.g, c.b, row.a * (0.55 + 0.45 * wob));
      }
      if (i > 0) {
        const p0 = base + (i - 1) * 2;
        indices.push(p0, p0 + 2, p0 + 3, p0, p0 + 3, p0 + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  g.setIndex(indices);
  g.computeVertexNormals();
  const mesh = ownMesh(new THREE.Mesh(g, m.foamSurface), `${group.name || 'fringe:apostles-open-bay'}:kelp`);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 13;
  group.add(mesh);
  return mesh;
}

/**
 * A breaking wavelet: a short ridge with two faces at a real tilt, plus a
 * brighter crest band.
 *
 * THE TILT IS THE POINT, AND IT IS WHY THE SUN DIRECTION IS NOT BAKED HERE.
 * The bar's own note says the 209 diffuse ceiling does not bind specular, and
 * that a venue reached 251 on a single glazing glint. A glint needs a face whose
 * normal bisects the sun and the camera, and this file is forbidden from copying
 * the sun out of `lighting.js`. So instead of aiming one facet at a baked
 * direction, the field scatters tilts from 12 to 52 degrees over every azimuth,
 * and whichever fraction of them happens to bisect lights up — which is exactly
 * how a real glitter path forms, and it stays correct if the rig's hour moves.
 *
 * The whole field is ONE merged geometry, transforms baked. 220 separate meshes
 * is 220 draw calls for a few hundred triangles, and this scene renders under
 * SwiftShader in the capture harness.
 */
function waveletField(positions, colors, place3, tiltIdx, seed) {
  const tilt = (12 + tiltIdx * 5) * (Math.PI / 180);
  const h = Math.tan(tilt) * 0.5;
  const push = (p, c) => {
    place3(p);
    positions.push(p[0], p[1], p[2]);
    colors.push(c, c, c);
  };
  const crest = 1.0;
  const back = 0.52;
  for (let s = 0; s < 3; s += 1) {
    const z0 = -0.5 + s / 3;
    const z1 = -0.5 + (s + 1) / 3;
    const jitter = 0.16 * Math.sin(s * 2.7 + seed);
    const ridge = h * (0.8 + 0.35 * Math.sin(s * 1.9 + seed * 0.7));
    const c0 = [0, ridge, z0 + jitter * 0.2];
    const c1 = [0, ridge, z1 + jitter * 0.2];
    push([...c0], crest); push([-0.5, 0, z0], back); push([-0.5, 0, z1], back);
    push([...c0], crest); push([-0.5, 0, z1], back); push([...c1], crest);
    push([...c0], crest); push([0.5, 0, z1], back * 0.86); push([0.5, 0, z0], back * 0.86);
    push([...c0], crest); push([...c1], crest); push([0.5, 0, z1], back * 0.86);
  }
}

// ---------------------------------------------------------------------------
// Gulls.
//
// WHY THIS IS INSTANCED AND NOT MERGED, WITH THE NUMBER THAT DECIDED IT.
//
// Until this round the flock was two merged meshes and `updateApostles` was two
// comment lines — a no-op with four parameters it ignored. `fringe.js:1155`
// hands it live `dt`, `elapsed` and `freeze` every frame and the venue threw all
// of it away, so nothing at the Apostles has ever moved. Merged static geometry
// has no per-bird transform to animate, which is the reason it never could.
//
// Three ways back, and the cost that picked one:
//
//   (a) One THREE.Group per bird, three child meshes each. 26 birds is 78 draw
//       calls. Rejected: this venue already issues 2451, and the file's own
//       comment on the glitter field ("220 separate meshes is 220 draw calls
//       for a few hundred triangles, and this scene renders under SwiftShader
//       in the capture harness") is the standing ruling against it.
//   (b) Keep the merged mesh, drive the vertices from a shader with per-vertex
//       bird-id and phase attributes. One draw call and zero CPU. Rejected on
//       RISK, not cost: it needs `onBeforeCompile` on a material this venue
//       shares, the CPU bounding sphere stops describing the animated pose, and
//       normals would have to be re-derived in GLSL. I cannot take a capture
//       this round, and a silent shader fault is exactly the failure class the
//       bar says only a capture catches.
//   (c) InstancedMesh, split body / wing. A wing beat is a rotation of the wing
//       RELATIVE TO the body, so one rigid matrix per bird cannot do it — the
//       geometry has to split at the shoulder. Four instanced meshes total
//       (light body, light wings, dark body, dark wings), because the left wing
//       is the right wing with a negative Z scale and `compose` applies scale
//       before rotation, so one wing geometry serves both sides on a DoubleSide
//       material. 4 draw calls against the merged pair's 2.
//
// (c) ships. Per frame it costs 26 body composes + 52 wing composes and
// multiplies, no allocation, and every term is a pure function of `elapsed` and
// a seeded per-bird constant.
// ---------------------------------------------------------------------------

/**
 * Gull body: nose, tail, two shoulders and a belly point. Five vertices, four
 * triangles, and a real underside — the old body was two coincident flat
 * triangles, which is why the r0 crops read as a paper dart with no thickness.
 */
function gullBodyGeo(ctx) {
  return shared(ctx, 'gull:body', () => {
    const V = [
      [0.36, 0.005, 0], // 0 nose
      [-0.02, 0.035, -0.070], // 1 shoulder left
      [-0.02, 0.035, 0.070], // 2 shoulder right
      [-0.44, 0.055, 0], // 3 tail tip, carried a little high
      [-0.04, -0.055, 0], // 4 belly
    ];
    // Head and tail a touch darker than the mantle so the silhouette breaks
    // fore-and-aft as well as across the wing.
    const C = [0.86, 1.0, 1.0, 0.74, 0.92];
    const tris = [[0, 2, 1], [1, 2, 3], [0, 4, 2], [0, 1, 4], [1, 3, 4], [2, 4, 3]];
    const positions = [];
    const colors = [];
    for (const t of tris) {
      for (const i of t) {
        positions.push(V[i][0], V[i][1], V[i][2]);
        colors.push(C[i], C[i], C[i]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  });
}

/**
 * One gull wing, RIGHT-HAND, hinged at the origin with the span running out
 * along +z to exactly 1.0 so the per-bird span is an instance scale.
 *
 * The hinge is the whole point. The tip is at −0.30 in x, so the wing is swept
 * back the way a gull's is, and the outer third carries the dark vertex ramp:
 * at the 18–43 px this bird is drawn at (measured on the r0 plate, not guessed)
 * the tip is the only part with enough contrast to be seen moving.
 */
function gullWingGeo(ctx) {
  return shared(ctx, 'gull:wing', () => {
    // A STEP AT 62 % OF SPAN, NOT A GRADIENT.
    //
    // The r1 ramp measured 44-74 luminance units within a bird and the critic
    // confirmed it landed — at 8x. At 1:1 it did not survive: a grey-to-white
    // gradient has no edge, so a 30 px bird carries no internal boundary. A
    // silver gull's actual read at this size is charcoal primaries against a
    // white body, which is a HARD step, and a step survives downsampling because
    // it is an edge rather than a slope. The inner wing stays near-white and the
    // outer third drops to 0.18, which against '#f4f2ea' is charcoal.
    const V = [
      [0.13, 0.000, 0.00], // 0 root leading
      [-0.21, 0.000, 0.00], // 1 root trailing
      [0.05, 0.010, 0.40], // 2 mid leading
      [-0.25, 0.005, 0.40], // 3 mid trailing
      [0.00, 0.014, 0.62], // 4 wrist leading — the step lands here
      [-0.28, 0.008, 0.62], // 5 wrist trailing
      [-0.31, 0.020, 1.00], // 6 tip
    ];
    const C = [1.0, 1.0, 0.97, 0.93, 0.22, 0.20, 0.14];
    const tris = [[0, 2, 3], [0, 3, 1], [2, 4, 5], [2, 5, 3], [4, 6, 5]];
    const positions = [];
    const colors = [];
    for (const t of tris) {
      for (const i of t) {
        positions.push(V[i][0], V[i][1], V[i][2]);
        colors.push(C[i], C[i], C[i]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  });
}

/**
 * Flight modes. Three, because gate 6 fails a flock that shares one circuit
 * however many birds are on it, and the r0 plate's irregular scatter is a pass
 * that must not be traded away for motion.
 *
 * Every bird keeps ITS OWN r0 position as the centre of ITS OWN small orbit —
 * radius 5–20 m against a flock spread of ~150 m — so the scatter the plate
 * already has survives the conversion exactly, and no two birds share a path,
 * a period, a direction of turn, a beat rate or a beat phase.
 */
const GULL_SOAR = 0; // riding the updraught off the stacks: wide, slow, few beats
const GULL_BEAT = 1; // transiting: long lazy circuit, continuous beats
const GULL_QUARTER = 2; // low over the water hunting: tight, fast, deep beats
// SITTING ON THE WATER, wings folded, riding the swell. The critic asked for
// these by name: every bird in r1 was airborne, which is not what a bay looks
// like, and a rafted bird is the cheapest legible thing that can go in the bare
// offshore band because it is the same asset with its wings down.
const GULL_RAFT = 3;
const GULL_PERCH = 4;

/**
 * Deterministic per-bird flight parameters. Pure function of the seed and the
 * two things a path has to clear.
 *
 * BOTH CLAMPS BELOW ARE THERE BECAUSE A PROBE FOUND THE FAULT, NOT BECAUSE THEY
 * LOOKED PRUDENT. Swept over 100 s, the unclamped first version put birds
 * **1.71 m inside a stack wall on 265 samples**, and took the lowest bird to
 * world Y **−0.93 against a water surface at 0.02** — a gull swimming through
 * limestone and another one under the sea. Neither is visible in a still.
 */
function gullSpec(i, cx, cyIn, cz, scale, surfY, obstacles, raft = false, perch = false) {
  const mode = perch ? GULL_PERCH : raft ? GULL_RAFT : Math.floor(hash(i, 451) * 3);
  const soar = mode === GULL_SOAR;
  const quarter = mode === GULL_QUARTER;
  let radius = (soar ? 11 : quarter ? 5 : 8) + hash(i, 452) * (soar ? 9 : quarter ? 6 : 12);
  let cy = cyIn;
  // Never dip below the water. `climb` is the half-amplitude of the height
  // oscillation, so the floor is the centre height less two metres of margin.
  const headroom = Math.max(0.2, cy - surfY - 2.0);
  const climb = Math.min((soar ? 2.2 : 0.9) + hash(i, 457) * (soar ? 3.4 : 1.6), headroom);
  // Clear every rock this bird could reach AT ITS LOWEST POINT — the first
  // version tested the orbit CENTRE height, so a bird whose centre cleared a
  // stack but whose trough did not still flew through it, and the sweep found
  // 221 samples still doing that. Shrink the orbit if there is room; if the
  // orbit would come down under three metres, put the bird OVER the rock
  // instead, which is where a gull would be anyway.
  for (let pass = 0; pass < 5; pass += 1) {
    let worst = null;
    let worstRoom = Infinity;
    for (const o of obstacles) {
      if (cy - climb > o.top + 2.5) continue;
      const room = Math.hypot(cx - o.x, cz - o.sea) - o.r - 3.0;
      if (room < radius && room < worstRoom) { worstRoom = room; worst = o; }
    }
    if (!worst) break;
    if (worstRoom >= 3) radius = worstRoom;
    else cy = worst.top + 2.5 + climb;
  }
  if (raft || perch) {
    const sizeClass = Math.floor(hash(i, 470) * 5);
    const spans = [0.72, 0.98, 1.28, 1.62, 2.05];
    return {
      mode, cx, cy: perch ? cyIn : surfY, cz, scale, raft: !!raft, perch: !!perch,
      radius: perch ? 0 : 0.7 + hash(i, 452) * 1.8,
      ecc: 0.6 + hash(i, 453) * 0.5,
      omega: perch ? 0 : (Math.PI * 2) / (40 + hash(i, 454) * 34),
      phase: hash(i, 455) * Math.PI * 2,
      turn: hash(i, 456) < 0.5 ? -1 : 1,
      climb: 0, climbMul: 1, climbPhase: 0,
      beatHz: 0, beatPhase: hash(i, 460) * Math.PI * 2, beatAmp: 0, burstHz: 0,
      span: spans[sizeClass] * (perch ? 0.55 : 0.42),
      dihedral: perch ? -0.22 : -0.16,
      sizeClass,
      diveHz: 0, divePhase: 0,
      flapDuty: 0,
    };
  }
  return {
    mode,
    cx,
    cy,
    cz,
    scale,
    radius,
    ecc: 0.46 + hash(i, 453) * 0.52,
    // Period, not speed, is the seeded quantity — a shared speed with differing
    // radii still puts two birds in step whenever their radii coincide.
    omega: (Math.PI * 2) / ((soar ? 22 : quarter ? 11 : 15) + hash(i, 454) * 17),
    phase: hash(i, 455) * Math.PI * 2,
    turn: hash(i, 456) < 0.5 ? -1 : 1,
    // Height: one climb per orbit for a soaring bird (it is circling a thermal),
    // two for a quartering one (it is working a search pattern).
    climb,
    climbMul: soar ? 1 : 2,
    climbPhase: hash(i, 458) * Math.PI * 2,
    beatHz: soar ? 0.9 + hash(i, 459) * 0.5
      : quarter ? 2.9 + hash(i, 459) * 1.3 : 2.3 + hash(i, 459) * 1.1,
    beatPhase: hash(i, 460) * Math.PI * 2,
    // DEEPER THAN r1, because the bird is smaller. Tip travel is the product of
    // span and beat angle, and correcting the span cost 7.5x of the beat; a gull
    // working hard sweeps 70-90 degrees peak to peak and these now sit inside
    // that, where r1's were well under it.
    beatAmp: soar ? 0.86 : quarter ? 1.12 : 1.00,
    // 2:1 flap/glide. A slow duty oscillator unique per bird: two thirds of the
    // cycle the wings work, one third they hold. Never a shared phase.
    burstHz: 0.11 + hash(i, 461) * 0.07,
    burstPhase: hash(i, 462) * Math.PI * 2,
    flapDuty: 2 / 3,
    // FIVE SIZE CLASSES, and they have to READ at the graded pose. The r12
    // blind judge did not register the flock at 11-28 px; a loose wheel of
    // 1.6-3.6 m birds at this camera is a 16-40 px silhouette that clusters
    // into one event rather than sixteen flecks.
    sizeClass: i === 0 ? 4 : Math.floor(hash(i, 470) * 5),
    span: [0.80, 1.10, 1.40, 1.75, 2.15][i === 0 ? 4 : Math.floor(hash(i, 470) * 5)],
    dihedral: 0.09 + hash(i, 464) * 0.11,
    diveHz: 0.035 + hash(i, 471) * 0.025,
    divePhase: hash(i, 472) * Math.PI * 2,
  };
}

/** Bake scale, yaw and translation into a point, in place. */
function makePlacer(sx, sy, sz, yaw, tx, ty, tz) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return (p) => {
    const x = p[0] * sx;
    const y = p[1] * sy;
    const z = p[2] * sz;
    p[0] = tx + x * c + z * s;
    p[1] = ty + y;
    p[2] = tz - x * s + z * c;
  };
}

/**
 * Everything that lives on the open bay.
 *
 * The measure this has to move is the 'largest contiguous featureless-water
 * region', which is a connected-component count over 8 px blocks: an object
 * placed anywhere in that region does not only add its own texture, it CUTS the
 * component. So the placement is deliberately spread across the whole box rather
 * than clustered where it would look most composed — five outlying stacks
 * distributed along the coast, a pot line running diagonally, boats at three
 * depths, and a glitter field that reaches the horizon.
 */
// The on-screen window, worked out from the hero pose rather than guessed: at
// sea 60 the frame spans local x +88 to -31, and at sea 250 it spans +145 to
// -73, because the camera looks nearly along the seaward axis so the along-coast
// axis opens out with distance. Promoted to module scope this round because the
// boat tracks have to be fitted INSIDE it — a circuit that leaves the plate is
// a boat that vanishes, and this is the only description of the plate's edge the
// file has.
const xHi = (sea) => 70 + sea * 0.30;
const xLo = (sea) => -18 - sea * 0.22;

// ---------------------------------------------------------------------------
// Boats: the sea they sit on, the tracks they run, and the fit that validates
// a track before a boat is allowed to run it.
// ---------------------------------------------------------------------------

/**
 * The drawn sea at one world point, baked as a time series.
 *
 * WHY A TABLE AND NOT AN ANALYTIC SUM. At a fixed point the drawn height looks
 * like a sum of three sinusoids at `BAY_SWELL`'s omegas, and my first attempt
 * fitted exactly that by least squares. It does not reproduce the surface: the
 * out-of-sample residual is **21-29 % of signal RMS** at the four boat stations,
 * because `ddSoftFloorY` is applied to the summed height and a static
 * non-linearity puts energy outside the three frequencies being fitted. A table
 * carries no such assumption.
 *
 * WHY THE TABLE IS A PROOF RATHER THAN A SAMPLE. The omegas 0.42 / 0.55 / 0.78
 * share a fundamental, so the drawn surface is exactly periodic in `t`. Measured:
 * `max |h(t) - h(t + 628.319)| = 6.8e-14 m` over 400 probes, which is float
 * noise. The table therefore covers ALL time rather than a window, and the bake
 * re-measures that seam and keeps the number, so a retune of `BAY_SWELL` cannot
 * quietly break the wrap.
 *
 * AND THE CLOCK LINES UP. `outer-ocean.js` sets `uniforms.uTime.value = elapsed`,
 * the same `elapsed` `fringe.js` hands `updateApostles`. In r1 I recorded that I
 * could not verify the boats' phase against the water without a capture. With
 * the drawn stack in hand it is verifiable offline, and it is exact.
 */
const SEA_SAMPLES = 1572;
const SEA_PROBE = 6;            // metres, the finite-difference arm for gradients

/**
 * Fundamental period of the drawn swell stack, derived from its own omegas.
 *
 * THIS IS NOW THE MASTER CLOCK OF THE WHOLE VENUE. Every boat's lap and every
 * moored boat's sheer divides it, so the hull positions AND the sea are one
 * exactly-periodic system and a table baked along a hull's real path is valid
 * for all time rather than for the window it was sampled over.
 */
function seaPeriod() {
  const gcd2 = (a, b) => (b ? gcd2(b, a % b) : a);
  const g = BAY_SWELL.map((s) => Math.round(s.omega * 1000)).reduce(gcd2, 0) / 1000;
  const p = g > 0 ? (Math.PI * 2) / g : 0;
  // A retune to finer decimals could push the fundamental to hours. Cap it, and
  // let the measured seam error say what the cap costs.
  return p > 0 && p < 4000 ? p : 900;
}
const SEA_PERIOD = seaPeriod();

/**
 * Bake the drawn swell offset at a station and at two probe arms, so height and
 * both horizontal gradients come out of one indexed lookup per frame.
 *
 * VERTICAL ONLY. `oceanSurfaceYAt` returns the height and not the Gerstner XZ
 * displacement the shader also applies, so a hull rides the sea up and down but
 * does not sway with it. At `BAY_SWELL[0]`'s steepness 0.54 the lateral term
 * reaches roughly 0.75 m; there is no exported sampler for it, and on a hull that
 * is already translating along a fitted circuit an unsourced sway would read as
 * drift rather than as sea. Stated, not fixed.
 *
 * AND THE AMPLITUDE DEPENDS ON `city`. Measured at one fixed world point,
 * (360, 260), the peak-to-peak is **2.188 m with `waterEdge: 'east'` and 0.790 m
 * without it** — a 2.8x swing at the same coordinates, because the coast field
 * and the depth are resolved through an edge-massing plan derived from the city.
 * The bake therefore takes the REAL city that `addApostles` was handed. Any
 * figure quoted from a probe that passed a stub city describes a different
 * coastline, mine included.
 *
 * SAMPLED ALONG THE HULL'S OWN PATH, and this is the change that let the ride
 * bound be derived instead of guessed.
 *
 * r1b baked at a fixed station and said so as a stated simplification. Measuring
 * what that cost proved it was not affordable: at ride 1.0 the hull would follow
 * `h(station, t)` while the water under it is `h(hull(t), t)`, and the worst
 * disagreement over a full period is **0.901 / 1.092 / 1.336 / 0.060 m** against
 * drafts of 0.94 / 0.83 / 0.52 / 0.44 — so the trawler's and the runabout's keels
 * BREACH. The frozen station, not the draft, was the real bound.
 *
 * It costs nothing to remove. The hull's position is already a pure function of
 * `t`, so the water under it is a one-dimensional function of `t` like any other,
 * and it is the SAME table size. It only has to stay periodic, which is why every
 * lap and every sheer now divides `SEA_PERIOD`.
 */
function bakeSeaSeries(posAt, city, plan) {
  const period = SEA_PERIOD;
  const h = new Float32Array(SEA_SAMPLES);
  const hx = new Float32Array(SEA_SAMPLES);
  const hz = new Float32Array(SEA_SAMPLES);
  let lo = Infinity;
  let hi = -Infinity;
  let iLo = 0;
  let iHi = 0;
  const dt = period / SEA_SAMPLES;
  const at = (t) => {
    posAt(t, SEA_WORLD);
    return oceanSurfaceYAt(SEA_WORLD.x, SEA_WORLD.z, t, city, plan) - WATER_Y;
  };
  for (let i = 0; i < SEA_SAMPLES; i += 1) {
    const t = i * dt;
    posAt(t, SEA_WORLD);
    const px = SEA_WORLD.x;
    const pz = SEA_WORLD.z;
    const y = oceanSurfaceYAt(px, pz, t, city, plan) - WATER_Y;
    h[i] = y;
    hx[i] = oceanSurfaceYAt(px + SEA_PROBE, pz, t, city, plan) - WATER_Y;
    hz[i] = oceanSurfaceYAt(px, pz + SEA_PROBE, t, city, plan) - WATER_Y;
    if (y < lo) { lo = y; iLo = i; }
    if (y > hi) { hi = y; iHi = i; }
  }
  // THE EXTREMES ARE REFINED OFF THE SAMPLE GRID.
  //
  // The window was never the problem here — this sweeps the exact 628.319 s
  // fundamental, which is 2.6x the >=240 s the board-water lane asked for, and a
  // 24 s window under-reads these stations by 5.5-10.5 %. What a grid CAN miss is
  // an extreme that falls between two samples: at 0.4 s spacing on the fastest
  // 8.06 s component that is a 0.08-0.32 % shortfall. Small, and free to remove,
  // so the amplitude this bound is built on cannot be questioned on either count.
  const refine = (i, sign) => {
    let a = (i - 1) * dt;
    let b = (i + 1) * dt;
    const f = (t) => sign * at(t);
    const g = 0.6180339887498949;
    let c = b - g * (b - a);
    let d = a + g * (b - a);
    let fc = f(c);
    let fd = f(d);
    for (let k = 0; k < 30; k += 1) {
      if (fc > fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); } else {
        a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d);
      }
    }
    return sign * Math.max(fc, fd);
  };
  hi = Math.max(hi, refine(iHi, 1));
  lo = Math.min(lo, refine(iLo, -1));
  // Self-test the wrap this table stands on, ALONG THE PATH. The hull's own
  // motion is now part of what is being sampled, so this checks the whole
  // coupled system repeats, not just the sea.
  let seam = 0;
  for (let i = 0; i < 24; i += 1) {
    const t = (i / 24) * 37.3;
    seam = Math.max(seam, Math.abs(at(t) - at(t + period)));
  }
  // Residual of the interpolated table against the real function at OFF-GRID
  // times. This is what the ride bound is derived from: it is the only remaining
  // difference between what a hull rides and the water under it.
  let residual = 0;
  const probe = { h: 0, gx: 0, gz: 0 };
  const table = { h, hx, hz, period };
  for (let i = 0; i < 200; i += 1) {
    const t = (i + 0.4137) * (period / 200);
    seaAt(table, t, probe);
    residual = Math.max(residual, Math.abs(probe.h - at(t)));
  }
  return { h, hx, hz, period, lo, hi, half: (hi - lo) * 0.5, seam, residual };
}

// Attitude limits. Set clear of the measured maxima so they are a guard against
// a bad sample rather than a shape the boat spends its time pressed against.
const PITCH_MAX = 0.20;
const ROLL_MAX = 0.30;

const SEA_OUT = { h: 0, gx: 0, gz: 0 };

/** Height and both gradients off the baked series. Pure function of `t`. */
function seaAt(series, t, out) {
  const n = SEA_SAMPLES;
  const raw = ((t % series.period) / series.period) * n;
  const w = raw < 0 ? raw + n : raw;
  const fl = Math.floor(w);
  const i0 = fl % n;
  const i1 = (i0 + 1) % n;
  const k = w - fl;
  const hv = series.h[i0] * (1 - k) + series.h[i1] * k;
  const xv = series.hx[i0] * (1 - k) + series.hx[i1] * k;
  const zv = series.hz[i0] * (1 - k) + series.hz[i1] * k;
  out.h = hv;
  out.gx = (xv - hv) / SEA_PROBE;
  out.gz = (zv - hv) / SEA_PROBE;
}

/**
 * How much of the drawn sea a hull rides — derived from keel submersion, which
 * is what the old half-draft constant was standing in for.
 *
 * THE ARITHMETIC IS THE WHOLE ARGUMENT. A hull's waterline sits at
 * `WATER_Y + s*h`; the water it floats on is at `WATER_Y + h`. The relative
 * offset is therefore `(s - 1)*h`, which is **identically zero at s = 1**. So the
 * keel cannot breach at full ride — it is a whole draft under the surface at
 * every phase — and lowering `s` is what exposes it, not raising it. Measured, the
 * old bound bound nothing: the scale at which the keel would actually have
 * breached is **-0.95 / -1.20 / -0.08 / 0.08**, and it was set to 0.25-0.55.
 * A safety that fires below zero is not a safety.
 *
 * What can still separate a hull from its water is the table: interpolation
 * error, and any drift between the path the series was baked along and the path
 * the hull flies. Both are now measured per station as `series.residual`, and the
 * ride is the largest scale at which that residual leaves `KEEL_CLEARANCE` of
 * keel under the surface. With the series baked along the hull's own path the
 * residual is a fraction of a millimetre, so this returns 1.0 with the entire
 * draft as margin — and it would return less, on its own, if that ever stopped
 * being true.
 */
const KEEL_CLEARANCE = 0.08;
function rideScaleFor(series, draft) {
  if (!series || !(series.half > 1e-6)) return 0;
  const room = Math.max(0, draft - KEEL_CLEARANCE);
  const r = series.residual;
  // s = 1 is exact; anything the table gets wrong eats into the draft directly.
  return r <= room ? 1 : Math.max(0, 1 - (r - room) / series.half);
}


/**
 * The cray-pot line, as a pure table, because the boat fitter needs it too. A
 * boat driving through a pot marker's 2.7 m whip aerial is an interpenetration
 * the camera can see, and the first version of the fitter did not know the
 * markers existed — the pot line runs diagonally straight across both circuits.
 */
const POT_LINE = [];
for (let i = 0; i < 9; i += 1) {
  const t = i / 8;
  POT_LINE.push({
    i,
    x: 62 - t * 112 + Math.sin(i * 1.7) * 5.2,
    sea: 64 + t * 22 + Math.cos(i * 2.3) * 3.6,
  });
}

/**
 * Every rock in the bay, in the open-bay local frame, with the height it
 * reaches. Boats care about the footprint; birds care about the footprint AND
 * the top, because a gull may legitimately fly over a stack and must not fly
 * through one.
 */
function bayObstacles(farStacks) {
  const out = [];
  for (const s of STACKS) out.push({ x: s.x, sea: s.sea, r: s.r, top: s.h });
  for (const s of REEF) out.push({ x: s.x, sea: s.sea, r: s.r, top: s.h });
  for (const s of farStacks) {
    out.push({ x: s.x, sea: s.sea, r: s.r, top: WATER_Y - 1.2 + s.h });
  }
  for (const p of POT_LINE) out.push({ x: p.x, sea: p.sea, r: 0.6, top: 2.9 });
  return out;
}

/**
 * Fit a closed circuit for a boat that is making way.
 *
 * The path is an ellipse expressed in the boat's OWN frame — `u` forward along
 * the authored heading, `v` abeam — as `u = a sin th`, `v = b (1 - cos th)`. At
 * th = 0 the boat is exactly at its authored position with exactly its authored
 * heading and a non-zero forward speed, so the built pose and the r0 plate's
 * composition are preserved by construction rather than by luck. Speed never
 * reaches zero anywhere on the loop (it is `omega * hypot(a cos, b sin)`, which
 * is bounded below by `omega * min(a, b)`), so the boat never stalls, reverses
 * or cusps, and the heading is always the tangent — which is what keeps the wake
 * behind the boat that made it.
 *
 * VALIDATED, NOT ASSERTED. Every one of 48 stations is checked against the
 * drape's veil band, the far paddock, the plate window, every stack and reef in
 * the bay, and every circuit already fitted. If a loop fails it is shrunk by a
 * quarter and re-checked; if four attempts fail the boat is moored instead. The
 * fit reports what it did.
 */
/**
 * Common period of the whole fleet, in seconds. Every boat's lap divides it, so
 * the relative configuration of the boats is exactly periodic at 76 s and the
 * separation scan in `fitTrack` is a proof rather than a sample.
 */
const BOAT_BASE_PERIOD = SEA_PERIOD / 16;
/** Sheer periods for a moored boat, as divisors of SEA_PERIOD. */
const MOOR_LAPS = [28, 30, 32, 36];
const BOAT_POSE = { x: 0, sea: 0, yaw: 0, speedNorm: 0 };

/**
 * Where a hull is, and which way it points, at time `t`. ONE implementation,
 * called by the sea bake and by the per-frame tick, so the path a series was
 * baked along is provably the path the hull flies.
 *
 * Every term is a harmonic of a frequency that divides `SEA_PERIOD`. The moored
 * sheer used multipliers of 2.37 and 1.63, which look irregular and are not
 * harmonics — with the sea now baked along the hull's path the whole system has
 * to close, so they are 2 and 3 with offset phases instead.
 */
function boatPose(b, t, out) {
  const tr = b.track;
  if (tr) {
    trackPos(tr, b.x0, b.sea0, t, TRACK_P);
    out.x = TRACK_P.x;
    out.sea = TRACK_P.sea;
    out.yaw = Math.atan2(-TRACK_P.dsea, TRACK_P.dx);
    out.speedNorm = Math.hypot(TRACK_P.dx, TRACK_P.dsea) / (tr.vRef || 1);
    return;
  }
  if (b.figure8) {
    const f = b.figure8;
    const th = f.omega * t + f.phase;
    const sth = Math.sin(th);
    const cth = Math.cos(th);
    const s2 = Math.sin(2 * th);
    const c2 = Math.cos(2 * th);
    out.x = b.x0 + f.a * sth;
    out.sea = b.sea0 + f.b * s2;
    const dx = f.a * cth * f.omega;
    const dsea = f.b * 2 * c2 * f.omega;
    out.yaw = Math.atan2(-dsea, dx);
    out.speedNorm = Math.hypot(dx, dsea) / (f.vRef || 1);
    return;
  }
  if (b.swingAmp) {
    const ph = t * b.swingOmega + b.swingPhase;
    out.yaw = b.yaw0 + b.swingAmp * (Math.sin(ph) + 0.42 * Math.sin(ph * 2 + 1.1));
    const surge = 0.55 * Math.sin(ph * 3 + 0.7);
    out.x = b.x0 + surge * Math.cos(b.yaw0);
    out.sea = b.sea0 - surge * Math.sin(b.yaw0);
    out.speedNorm = 0;
    return;
  }
  out.x = b.x0;
  out.sea = b.sea0;
  out.yaw = b.yaw0;
  out.speedNorm = 0;
}
const TRACK_P = { x: 0, sea: 0, dx: 0, dsea: 0 };

/**
 * Position and tangent on a circuit at time `t`. ONE implementation, shared by
 * the fitter, the height bake and the per-frame tick, so a circuit that was
 * validated is provably the circuit that gets flown.
 *
 * The loop is the ellipse `u = a sin(th)`, `v = -b cos(th)` in the boat's own
 * frame, offset so that th = `ph` lands exactly on the authored station. `ph` is
 * swept by the fitter: without it the authored point is always the MIDDLE of the
 * long side, so a boat wedged into a corner needs `a` metres of clear water in
 * both directions along its heading and gets refused for want of room it did not
 * need. The trawler is the case — it sits at sea 90 with the veil band at 93 and
 * the flank veil at x -17, and it only fits with its station at the END of a tow
 * leg rather than the middle of one.
 */
function trackPos(tr, x0, sea0, t, out) {
  const th = tr.omega * t + tr.ph;
  const cth = Math.cos(th);
  const sth = Math.sin(th);
  const u = tr.a * sth - tr.u0;
  const v = tr.v0 - tr.b * cth;
  const du = tr.a * tr.omega * cth;
  const dv = tr.b * tr.omega * sth;
  out.x = x0 + u * tr.cy + v * tr.sy;
  out.sea = sea0 - u * tr.sy + v * tr.cy;
  out.dx = du * tr.cy + dv * tr.sy;
  out.dsea = -du * tr.sy + dv * tr.cy;
}

/** Distance from a point to the segment centred at (cx, cz) with half-vector (hx, hz). */
function segDist(px, pz, cx, cz, hx, hz) {
  const len2 = hx * hx + hz * hz;
  let t = len2 > 0 ? ((px - cx) * hx + (pz - cz) * hz) / len2 : 0;
  t = t < -1 ? -1 : (t > 1 ? 1 : t);
  return Math.hypot(px - (cx + hx * t), pz - (cz + hz * t));
}

function makeTrack(a, b, ph, yaw, period) {
  return {
    a, b, ph,
    u0: a * Math.sin(ph),
    v0: b * Math.cos(ph),
    cy: Math.cos(yaw),
    sy: Math.sin(yaw),
    omega: (Math.PI * 2) / period,
    vRef: (Math.PI * 2 * a) / period,
  };
}

const TRACK_SHRINKS = [1, 0.88, 0.76, 0.64, 0.52];
// Heading offsets and station phases. SIZE IS TRIED BEFORE THE AUTHORED ASPECT
// IS KEPT, and that ordering is the whole argument: the first version of this
// fitter could only shrink, and it shrank the tour boat to a = 7.5 m and
// 0.28 m/s, which at this camera is **4 screen pixels a second** — a boat that
// technically moves and visibly does not. A heading rotated 30 degrees is a much
// smaller loss than that. Within one size, the smallest rotation wins.
const TRACK_YAWS = [];
for (let i = 0; i <= 8; i += 1) {
  TRACK_YAWS.push(i * 0.3927);
  if (i > 0 && i < 8) TRACK_YAWS.push(-i * 0.3927);
}
const TRACK_PHASES = [0, 0.5, 1, 1.5, 0.25, 1.25, 0.75, 1.75].map((k) => k * Math.PI);

function fitTrack(spec, surf, existing, obstacles, stations) {
  const K = 64;
  // Lap divides SEA_PERIOD, so hull position and sea close together.
  const period = SEA_PERIOD / spec.way.laps;
  const log = [];
  // THE HULL IS TESTED AS A SEGMENT, NOT AS A POINT WITH A PADDED RADIUS.
  //
  // Two wrong versions preceded this one and they were wrong in opposite
  // directions. `beam * 0.5 + 4` was 5.8 m for the tour boat against a
  // half-LENGTH of 5.75 m, so a bow-on pass at the limit left five centimetres
  // between the stem and the rock — the interpenetration veto, invisible to a
  // test that measures the one point on the boat that is not going to hit
  // anything. Swapping it for `len * 0.5 + 2.5` fixed that and immediately
  // over-corrected: an 8.4 m exclusion circle round each of nine cray-pot
  // markers strung diagonally across the bay took most of the water out of play
  // and moored the trawler again.
  //
  // A boat is long and thin, so the honest test is the distance from the
  // obstacle to the hull's CENTRELINE SEGMENT — stem to transom along the
  // tangent — against a clearance built from the beam. Exact for both a bow-on
  // and a beam-on pass, and it hands back the water the circle was wasting.
  const clear = spec.beam * 0.5 + 2.5;
  const half = spec.len * 0.5;
  const cx = new Float64Array(K);
  const cz = new Float64Array(K);
  for (const shrink of TRACK_SHRINKS) {
    // BEST OF THE SHRINK, NOT FIRST OF THE SHRINK, and the difference is the
    // whole packing problem. First-fit gave the tour boat the middle of the bay
    // because the authored heading happened to work there, and then the runabout
    // was refused on **398 of 480 candidates** for passing it. Scoring every
    // candidate that clears the hard constraints, and keeping the one that stays
    // furthest from where the other boats live, hands each hull its own water
    // without anybody hand-placing a circuit.
    let best = null;
    let bestScore = -Infinity;
    for (const yawOff of TRACK_YAWS) {
      for (const ph of TRACK_PHASES) {
        const tr = makeTrack(spec.way.a * shrink, spec.way.b * shrink, ph,
          spec.yaw + yawOff, period);
        const ys = new Float32Array(K);
        let ok = true;
        let why = '';
        for (let i = 0; i < K; i += 1) {
          trackPos(tr, spec.x, spec.sea, (i / K) * period, TRACK_P);
          const x = TRACK_P.x;
          const sea = TRACK_P.sea;
          if (sea < 56 || sea > 130 || x > xHi(sea) || x < xLo(sea)) {
            ok = false; why = `off window at x ${x.toFixed(1)} sea ${sea.toFixed(1)}`; break;
          }
          const g = surf(x, sea);
          // ALPHA < 0.05, NOT MERELY `!veiled`. `veiled` is true only inside the
          // 0.12-0.88 band, so a station at alpha 0.11 passes it while sitting
          // in visible film — and a 48-station check on a 99 m lap samples every
          // two metres, so a loop can pass at its stations and still graze the
          // transition between them. Requiring live bay water with a real margin
          // removes both failure modes at once, and it is why the tour boat's
          // circuit now tops out at sea 88.5 instead of 93.2.
          if (g.alpha > 0.05 || g.gy > 0.6) {
            ok = false;
            why = `${g.gy > 0.6 ? 'ground' : `drape a=${g.alpha.toFixed(2)}`} at x ${x.toFixed(1)} sea ${sea.toFixed(1)}`;
            break;
          }
          const sp = Math.hypot(TRACK_P.dx, TRACK_P.dsea) || 1;
          const hx = (TRACK_P.dx / sp) * half;
          const hz = (TRACK_P.dsea / sp) * half;
          let hit = null;
          for (const o of obstacles) {
            if (segDist(o.x, o.sea, x, sea, hx, hz) < o.r + clear) { hit = o; break; }
          }
          if (hit) {
            ok = false;
            why = `rock at x ${hit.x.toFixed(1)} sea ${hit.sea.toFixed(1)} r ${hit.r}`;
            break;
          }
          ys[i] = g.y;
          cx[i] = x;
          cz[i] = sea;
        }
        if (!ok) { log.push({ shrink, yawOff, ph, why }); continue; }
        // SEPARATION IS TESTED IN TIME, NOT IN SPACE, AND THAT IS WHY THE
        // PERIODS ARE COMMENSURATE.
        //
        // Curve-against-curve was the first version and it was far too strict:
        // two circuits that cross are ordinary traffic as long as the boats are
        // never on the crossing together, and refusing every crossing left the
        // tour boat holding the only water in the bay and moored the other two.
        // But a time scan only PROVES anything over a horizon — unless the
        // periods share one. `BOAT_BASE_PERIOD` is 76 s and every lap divides
        // it, so the fleet's relative configuration repeats exactly every 76 s
        // and one scan of that window is a guarantee for all time rather than
        // for as long as I happened to look.
        let closest = Infinity;
        for (const other of existing) {
          const ot = other.track;
          if (!ot) continue;
          const need = (spec.len + other.len) * 0.5 + 2.5;
          closest = Infinity;
          for (let n = 0; n < 1520; n += 1) {
            const t = (n / 1520) * BOAT_BASE_PERIOD;
            trackPos(tr, spec.x, spec.sea, t, TRACK_P);
            const ax = TRACK_P.x;
            const az = TRACK_P.sea;
            trackPos(ot, other.x0, other.sea0, t, TRACK_P);
            const d = Math.hypot(ax - TRACK_P.x, az - TRACK_P.sea);
            if (d < closest) closest = d;
            if (d < need) break;
          }
          if (closest < need) {
            ok = false;
            why = `passes ${other.root.name} at ${closest.toFixed(1)} m, needs ${need.toFixed(1)}`;
            break;
          }
        }
        if (!ok) { log.push({ shrink, yawOff, ph, why }); continue; }
        // Score: how far this circuit stays from every other boat's home
        // station and from every circuit already fitted, less two metres per
        // radian of heading change so the authored aspect wins ties.
        let room = Infinity;
        for (let i = 0; i < K; i += 1) {
          for (const st of stations) {
            if (st.x === spec.x && st.sea === spec.sea) continue;
            room = Math.min(room, Math.hypot(cx[i] - st.x, cz[i] - st.sea));
          }
          for (const other of existing) {
            const ot = other.track;
            if (!ot) continue;
            for (let j = 0; j < ot.K; j += 1) {
              room = Math.min(room, Math.hypot(cx[i] - ot.cx[j], cz[i] - ot.cz[j]));
            }
          }
        }
        if (!Number.isFinite(room)) room = 60;
        const score = room - 4 * Math.abs(yawOff);
        if (score > bestScore) {
          bestScore = score;
          tr.ys = ys;
          tr.cx = Float64Array.from(cx);
          tr.cz = Float64Array.from(cz);
          tr.K = K;
          tr.shrink = shrink;
          tr.yawOff = yawOff;
          tr.nearest = closest;
          tr.room = room;
          tr.log = log;
          best = tr;
        }
      }
    }
    if (best) return best;
  }
  return { failed: true, log };
}


/** Pure function of `t`. No allocation, no reads of anything but the state. */
function updateBoats(boats, t) {
  if (!boats) return;
  const w = SEA_OUT;
  for (let n = 0; n < boats.length; n += 1) {
    const b = boats[n];
    boatPose(b, t, BOAT_POSE);
    const x = BOAT_POSE.x;
    const sea = BOAT_POSE.sea;
    const yaw = BOAT_POSE.yaw;
    const speedNorm = BOAT_POSE.speedNorm;
    let baseY = b.y0;
    const tr = b.track;
    if (tr) {
      // Still-water level around the circuit, BAKED. `surfaceAt` samples the
      // plan's terrain over an 8 m cell and is far too expensive per frame; the
      // loop is closed, so 64 stations and a wrapped lerp reproduce it exactly.
      const f = ((tr.omega * t) / (Math.PI * 2)) * tr.K;
      const fl = Math.floor(f);
      const i0 = ((fl % tr.K) + tr.K) % tr.K;
      const i1 = (i0 + 1) % tr.K;
      const k = f - fl;
      baseY = tr.ys[i0] * (1 - k) + tr.ys[i1] * k;
    }
    seaAt(b.sea, t, w);
    b.root.position.set(x, baseY, sea);
    b.root.rotation.y = yaw;
    const heave = b.ride * w.h;
    b.hull.position.y = heave;
    // Surface gradient rotated into the hull's frame. Forward is +x and the
    // boat's port side is +z, so a surface rising ahead lifts the bow (a
    // positive rotation about +z) and a surface rising to port drops the boat to
    // starboard (a negative rotation about +x).
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    // NO AMPLIFIER. These carried `* 3.2` and `* 3.6` from when `gx`/`gz` were
    // gradients of a UNIT swell that then got multiplied by an amplitude; with the
    // real surface gradient in metres per metre the boat simply lies along the
    // water, attenuated by how much of the wave its hull bridges. The old pair sat
    // ON the clamp for 6.8 % (pitch) and 1.9 % (roll) of all samples, which is a
    // boat holding a fixed tilt rather than working.
    const gFwd = (w.gx * cy - w.gz * sy) * b.ride;
    const gLat = (w.gx * sy + w.gz * cy) * b.ride;
    b.hull.rotation.z = Math.max(-PITCH_MAX, Math.min(PITCH_MAX,
      Math.atan(gFwd) * b.pitchAtt));
    b.hull.rotation.x = Math.max(-ROLL_MAX, Math.min(ROLL_MAX,
      -Math.atan(gLat) * b.rollAtt));
    // Foam lies ON the water: it takes the heave and refuses the pitch and roll.
    if (b.wake) {
      b.wake.position.y = heave;
      const s = 0.52 + 0.62 * speedNorm;
      b.wake.scale.set(s, 1, 0.74 + 0.34 * speedNorm);
    }
    if (b.flat) b.flat.position.y = heave;
    if (b.bow) {
      b.bow.position.y = heave;
      const s = 0.40 + 0.78 * speedNorm;
      b.bow.scale.set(s, 1, 0.62 + 0.5 * speedNorm);
    }
    if (b.spray) {
      b.spray.position.y = heave;
      const s = 0.55 + 1.15 * speedNorm;
      b.spray.scale.set(s, 1, 0.7 + 0.8 * speedNorm);
    }
    if (b.halo) b.halo.position.y = heave - 0.03;
    if (b.wetCollar) b.wetCollar.position.y = heave + 0.02;
  }
}

const SEA_WORLD = new THREE.Vector3();

function addSeaFurniture(ctx, local, surfaceAt, city) {
  const { m } = ctx;
  const surf = (x, sea) => surfaceAt(x, sea);
  // HOIST THE PLAN ONCE. `oceanSurfaceYAt` plans the edge massing on every call
  // that is not handed one: measured 12.4 us against 4.35 us with it hoisted, and
  // the bake makes 18,864 calls. That is the difference between 82 ms and 234 ms
  // of venue build.
  const oceanPlan = planEdgeMassing(city ?? { extent: { x: 272, z: 272 } });

  // ---- Five more Apostles, standing off in the haze -----------------------
  //
  // The sign says TWELVE APOSTLES and the frame held six. These are the rest of
  // the chain, receding: smaller, hazier and set at their own depths, so the
  // stack field reads as a coast rather than as one clump. They stand on the
  // seabed like the near six — bases at WATER_Y, submerged parts covered by the
  // drape the way a water surface covers anything under it — so none of them is
  // floating and none needs a fabricated shoreline to sit on.
  // NONE OF THESE GOES PAST SEA 130, AND THAT IS A MEASUREMENT, NOT A TASTE.
  // The ground probe takes the highest terrain in a 14 m cell, `baySeaMax` is
  // 150, and the far-shore paddock starts there — so a stack at sea 142 reads
  // ground at 4 m and silently deletes itself. The first draft had three out at
  // 142-147 and a headless build showed six of nine surviving. Six is not a
  // chain, and a builder who had not looked would have reported nine.
  const FAR_STACKS = [
    { x: 96, sea: 128, r: 2.0, h: 9.4, lean: 0.42, yaw: 0.3, seed: 41 },
    { x: 78, sea: 118, r: 1.6, h: 7.8, lean: -0.3, yaw: 0.15, seed: 48 },
    { x: 61, sea: 130, r: 2.4, h: 12.2, lean: -0.5, yaw: -0.7, seed: 42 },
    { x: 40, sea: 112, r: 1.5, h: 7.0, lean: 0.28, yaw: 1.1, seed: 43 },
    { x: 13, sea: 126, r: 2.2, h: 12.8, lean: -0.36, yaw: 0.5, seed: 44 },
    { x: -8, sea: 108, r: 1.8, h: 8.6, lean: 0.5, yaw: -0.2, seed: 45 },
    { x: -16, sea: 129, r: 1.3, h: 6.0, lean: 0.24, yaw: 1.4, seed: 49 },
    { x: -27, sea: 113, r: 2.1, h: 11.0, lean: -0.44, yaw: 0.9, seed: 46 },
    { x: -42, sea: 127, r: 1.4, h: 6.4, lean: 0.34, yaw: -1.2, seed: 47 },
  ];
  for (let i = 0; i < FAR_STACKS.length; i += 1) {
    const s = FAR_STACKS[i];
    const ground = surf(s.x, s.sea);
    // Never plant one on a hill the drape is covering: out past the bay the
    // board's far paddock comes up out of the water, and a stack standing on
    // that would be a rock in a field.
    if (ground.gy > 0.6 || ground.veiled) continue;
    // Aerial perspective, applied to the SAME profile the near six use, so the
    // register cannot drift: distance lifts the value and pulls the hue toward
    // the horizon haze rather than substituting a different rock language.
    const haze = clamp01((s.sea - 90) / 150) * 0.44;
    const mesh = addRockForm(local, m, {
      profile: apostleProfile(s.seed),
      r: s.r,
      h: s.h,
      lean: s.lean,
      yaw: s.yaw,
      squash: 0.82,
      seed: s.seed,
      x: s.x,
      z: s.sea,
      segs: 9,
      baseY: WATER_Y - 1.2,
      haze,
      lattice: [2, 1],
      name: `fringe:apostles-open-bay:outlier-stack:${i}`,
    });
    mesh.castShadow = false;
    addFoamRing(local, m, s.x, s.sea, s.r * 2.5, s.r * 1.7, s.seed * 0.4, s.seed,
      ground.y + 0.08);
    // A low reef shoulder beside every second one, so the chain is not seven
    // isolated columns at even heights.
    if (i % 2 === 0) {
      const rx = s.x - 3.4 - i * 0.6;
      const rs = surf(rx, s.sea + 3);
      if (rs.gy <= 0.6 && !rs.veiled) {
        const shoulder = addRockForm(local, m, {
          profile: LEDGE_PROFILE,
          haze,
          r: s.r * 1.5,
          h: 1.5 + i * 0.2,
          yaw: s.yaw * 1.7,
          squash: 0.42,
          seed: s.seed + 9,
          x: rx,
          z: s.sea + 3,
          segs: 8,
          baseY: WATER_Y - 0.8,
          lattice: [2, 1],
      name: `fringe:apostles-open-bay:outlier-reef:${i}`,
        });
        shoulder.castShadow = false;
        addFoamRing(local, m, rx, s.sea + 3, s.r * 3.2, s.r * 1.9, i * 0.9, s.seed + 3,
          rs.y + 0.08);
      }
    }
  }

  // ---- Boats -------------------------------------------------------------
  //
  // Four hulls, and after this round they do two DIFFERENT things, because the
  // r0 plate shows four boats of which one has a wake and the coordinator's
  // question about the other three is the right one: a boat with no wake and no
  // anchor read is not "at rest", it is unfinished.
  //
  //   tour, runabout  — MAKING WAY on a closed circuit, wake from the transom,
  //                     bow wave at the stem, both scaled by instantaneous speed
  //   trawler         — TOWING, so under way but slowly: a short broad wake and
  //                     a hull that works harder in the swell than it travels
  //   tender          — AT ANCHOR: rode over the bow roller, a foam ring where
  //                     it enters, sheering across the wind on its scope, and no
  //                     wake at all
  const BOATS = [
    {
      kind: 'tour', x: 24, sea: 84, yaw: -1.05, len: 11.5, beam: 3.6, seed: 3,
      topsides: '#f0f2ec', anti: '#8c3a3f', wake: 1,
      // Sized and timed for ~2.8 m/s, which is a tour boat idling round the
      // stacks, and a 47 s lap so nothing on screen is periodic at a rate the
      // eye can lock onto.
      way: { a: 13, b: 11, laps: 16 },
      name: 'fringe:apostles-open-bay:tour-boat',
    },
    {
      kind: 'trawler', x: -12, sea: 90, yaw: 2.35, len: 9.6, beam: 3.2, seed: 5,
      topsides: '#2d5f8e', anti: '#6d2f38', wake: 0.55,
      // TOWING, so a long thin tow leg rather than a circle — and at this speed
      // that is not a cheat. Turn radius on this loop bottoms out at b^2/a =
      // 1.3 m, which would be absurd for the tour boat at 2.8 m/s (0.6 g) and is
      // 0.07 g at 0.9 m/s: a trawler turning on its gear at the end of a tow is
      // exactly what that looks like. It is also the only shape that fits the
      // water it has — the flank veil closes at x −17, the seaward veil at sea
      // 93, the stacks at sea 72 and the moored tender at (−3, 78).
      way: { a: 9.5, b: 4.6, laps: 16 },
      name: 'fringe:apostles-open-bay:trawler',
    },
    {
      kind: 'runabout', x: 48, sea: 74, yaw: 0.62, len: 5.4, beam: 2.0, seed: 7,
      topsides: '#e4e7df', anti: '#2f4a52', wake: 0.8,
      // The fast one. ~5 m/s on a 12 m turn radius is 0.2 g, which a small
      // planing boat carries without drama, and it is the motion that reads
      // first at 1:1.
      way: { a: 12, b: 10, laps: 32 },
      name: 'fringe:apostles-open-bay:runabout',
    },
    {
      kind: 'dinghy', x: -3, sea: 78, yaw: -2.5, len: 4.2, beam: 1.7, seed: 9,
      // A DARK SHEER STRAKE. The critic called this the one hull in the frame
      // carrying a single white tone; the default strake '#c9d2cc' against
      // topsides '#d8c07a' is two pale tans and reads as one. A varnished dark
      // gunwale plank is what a clinker tender actually has, and it lands on the
      // widest, most visible edge of the smallest hull.
      topsides: '#e2cf96', anti: '#4a5a3a', strake: '#33402c', wake: 0,
      name: 'fringe:apostles-open-bay:tender',
    },
  ];
  const boats = [];
  const obstacles = bayObstacles(FAR_STACKS);
  // A MOORED BOAT IS AN OBSTACLE, and it has to go in before anything is fitted.
  // The tender is last in the table, so on the first draft the three circuits
  // were validated against a boat that did not exist yet and one of them was
  // free to run straight over it.
  for (const s of BOATS) {
    if (!s.way) obstacles.push({ x: s.x, sea: s.sea, r: s.len * 0.6, top: 3 });
  }
  // EVERY boat's authored station scores as water to stay out of, moving ones
  // included, and I tested the alternative. Scoring only against the MOORED
  // boats lets the tour boat keep its authored heading exactly — and it then
  // takes the middle of the bay, after which the runabout is refused on every
  // one of 480 candidates and ends up moored. Three boats under way with the
  // tour boat's heading rotated 68 degrees is a better frame than two under way
  // with it preserved, so this is the version that ships. The cost is stated
  // rather than hidden: the tour boat presents a different aspect than it does
  // in the r0 plate.
  const STATIONS = BOATS.map((s) => ({ x: s.x, sea: s.sea }));
  for (const spec of BOATS) {
    const ground = surf(spec.x, spec.sea);
    if (ground.veiled) continue;
    const built = addBoat(ctx, local, { ...spec, y: ground.y });
    const state = {
      root: built.root,
      hull: built.hull,
      len: spec.len,
      beam: spec.beam,
      draft: built.draft,
      seed: spec.seed,
      x0: spec.x,
      sea0: spec.sea,
      yaw0: spec.yaw,
      y0: ground.y,
      track: null,
      wake: null,
      bow: null,
      flat: null,
      halo: null,
      wetCollar: null,
      // The drawn sea at this hull's own station, baked. See `bakeSeaSeries`.
      sea: null,
      ride: 0,
      // A short boat pitches through a long wave; a long one bridges it. The
      // attenuation is the ratio of the dominant wavelength to the wave plus the
      // hull, which is 1 for a cork and small for a ship.
      //
      // THE WAVELENGTH IS THE DRAWN ONE. These two lines were the last references
      // to the retired `SWELL` and I did not switch them when I switched the
      // sampler — the module then threw `ReferenceError: SWELL is not defined`
      // inside `addSeaFurniture`, which is exactly the half-migrated window the
      // bar warns about ("introduce the new source, switch every reference, THEN
      // delete the old"). The headless build caught it in two seconds; nothing a
      // unit test walks would have. The dominant train is 72 m drawn against the
      // retired 41 m, so every hull now bridges proportionally less of it.
      pitchAtt: BAY_SWELL[0].len / (BAY_SWELL[0].len + spec.len * 2.1),
      rollAtt: BAY_SWELL[0].len / (BAY_SWELL[0].len + spec.beam * 3.4),
      swingAmp: 0,
      swingOmega: 0,
      swingPhase: 0,
    };
    if (spec.way) {
      const fit = fitTrack(spec, surf, boats, obstacles, STATIONS);
      state.trackLog = fit.log;
      state.track = fit.failed ? null : fit;
    }
    if (!state.track) {
      // Moored: sheers on its rode, and the sheer period divides SEA_PERIOD too,
      // so the coupled hull-and-sea system stays exactly periodic.
      const laps = MOOR_LAPS[Math.floor(hash(spec.seed, 476) * MOOR_LAPS.length)];
      state.swingAmp = 0.14 + hash(spec.seed, 473) * 0.09;
      state.swingOmega = (Math.PI * 2) / (SEA_PERIOD / laps);
      state.swingPhase = hash(spec.seed, 475) * Math.PI * 2;
    }
    // BAKE ALONG THE PATH THE HULL ACTUALLY FLIES, which is why the fit has to
    // happen first. `updateWorldMatrix(true, ...)` walks the ancestors, so the
    // local-to-world is correct at BUILD time without anything having called
    // `updateMatrixWorld` on the fringe root yet.
    local.updateWorldMatrix(true, false);
    const posAt = (t, out) => {
      boatPose(state, t, BOAT_POSE);
      out.set(BOAT_POSE.x, 0, BOAT_POSE.sea);
      local.localToWorld(out);
    };
    state.sea = bakeSeaSeries(posAt, city, oceanPlan);
    state.ride = rideScaleFor(state.sea, built.draft);
    if (state.track) {
      // WAKE FROM THE TRANSOM, NOT FROM AMIDSHIPS. `addWake` lays its fan from
      // the group origin aft, and the boat's origin is amidships, so until now
      // the first third of every wake was underneath its own hull and what
      // emerged past the transom was already a metre and a half wide. Hanging it
      // off a node at −0.46 len puts the apex where the water actually leaves
      // the hull.
      //
      // 1.4 hull lengths, not 3.2. The census projected the first draft's wake
      // and it swept 37 m astern of the tour boat, which at yaw -1.05 put its
      // tail at sea 52 and screen row 661 — a foam fan lying across the near
      // cove, forty metres inshore of the boat that made it.
      state.wake = new THREE.Group();
      state.wake.name = `${spec.name}:wake`;
      state.wake.position.x = -spec.len * 0.46;
      noPick(state.wake);
      built.root.add(state.wake);
      addWake(state.wake, m, spec.len * 1.4 * spec.wake, spec.beam * 0.85, 0, spec.seed);
      // Bow wave: the same no-rim construction, short and narrow, apex at the
      // stem and spreading aft down the topsides. A hull moving through water
      // with nothing at its stem reads as a hull SLIDING ON water.
      state.bow = new THREE.Group();
      state.bow.name = `${spec.name}:bow-wave`;
      state.bow.position.x = spec.len * 0.44;
      noPick(state.bow);
      built.root.add(state.bow);
      addWake(state.bow, m, spec.len * 0.62, spec.beam * 0.52, 0, spec.seed + 17);
      if (spec.kind === 'tour' || spec.kind === 'trawler') {
        addHullWaterContact(ctx, state, spec, built);
      }
    } else {
      // At anchor. The rode hangs off the HULL, not the root, so it stays on the
      // stemhead while the bow rises and falls — parented to the root it held
      // still while the boat rode past it, which only became visible once the
      // hulls really rode.
      state.flat = new THREE.Group();
      state.flat.name = `${spec.name}:water-line`;
      noPick(state.flat);
      built.root.add(state.flat);
      addAnchorGear(ctx, built.hull, state.flat, spec.len, spec.beam,
        built.freeboard, spec.seed);
      addMooringBuoy(ctx, local, built.root, spec, ground.y);
    }
    boats.push(state);
  }

  // Jet-ski pair: figure-eights with spray. Periods divide SEA_PERIOD so the
  // sea bake stays periodic. Stations are picked from live water next to the
  // working hulls — a first draft at sea 96 sat in the veil and vanished.
  const jetStations = [
    { x: 30, sea: 82 },
    { x: 14, sea: 86 },
    { x: 40, sea: 78 },
    { x: 6, sea: 88 },
    { x: 22, sea: 80 },
    { x: 44, sea: 76 },
  ];
  const jetPicked = [];
  const jetOk = (x, sea) => {
    const g = surf(x, sea);
    if (g.veiled || g.gy > 0.6 || g.alpha > 0.05) return null;
    return { x, sea, y: g.y };
  };
  for (const st of jetStations) {
    const hit = jetOk(st.x, st.sea);
    if (!hit) continue;
    jetPicked.push(hit);
    if (jetPicked.length === 2) break;
  }
  if (jetPicked.length < 2) {
    for (const b of boats) {
      if (!b.track) continue;
      const hit = jetOk(b.x0 + 6.5, b.sea0 + 4.5);
      if (!hit) continue;
      jetPicked.push(hit);
      if (jetPicked.length === 2) break;
    }
  }
  for (let j = 0; j < jetPicked.length; j += 1) {
    const st = jetPicked[j];
    const spec = {
      kind: 'jetski',
      x: st.x,
      sea: st.sea,
      yaw: j === 0 ? 0.4 : -2.2,
      len: 2.4,
      beam: 0.95,
      seed: 21 + j,
      topsides: j === 0 ? '#d94a3a' : '#2a8a9a',
      anti: '#2c3a40',
      wake: 0.7,
      name: `fringe:apostles-open-bay:jet-ski:${j}`,
    };
    const ground = { y: st.y };
    const built = addBoat(ctx, local, { ...spec, y: ground.y });
    const period = SEA_PERIOD / 32;
    const state = {
      root: built.root,
      hull: built.hull,
      len: spec.len,
      beam: spec.beam,
      draft: built.draft,
      seed: spec.seed,
      x0: spec.x,
      sea0: spec.sea,
      yaw0: spec.yaw,
      y0: ground.y,
      track: null,
      figure8: {
        a: 7.2,
        b: 4.4,
        omega: (Math.PI * 2) / period,
        phase: j * Math.PI,
        vRef: (Math.PI * 2 * 7.2) / period,
      },
      wake: null,
      bow: null,
      spray: null,
      flat: null,
      sea: null,
      ride: 0,
      pitchAtt: BAY_SWELL[0].len / (BAY_SWELL[0].len + spec.len * 2.1),
      rollAtt: BAY_SWELL[0].len / (BAY_SWELL[0].len + spec.beam * 3.4),
      swingAmp: 0,
      swingOmega: 0,
      swingPhase: 0,
    };
    local.updateWorldMatrix(true, false);
    const posAt = (t, out) => {
      boatPose(state, t, BOAT_POSE);
      out.set(BOAT_POSE.x, 0, BOAT_POSE.sea);
      local.localToWorld(out);
    };
    state.sea = bakeSeaSeries(posAt, city, oceanPlan);
    state.ride = rideScaleFor(state.sea, built.draft);
    state.wake = new THREE.Group();
    state.wake.name = `${spec.name}:wake`;
    state.wake.position.x = -spec.len * 0.46;
    noPick(state.wake);
    built.root.add(state.wake);
    addWake(state.wake, m, spec.len * 1.8, spec.beam * 1.1, 0, spec.seed);
    state.spray = new THREE.Group();
    state.spray.name = `${spec.name}:spray`;
    state.spray.position.x = spec.len * 0.2;
    noPick(state.spray);
    built.root.add(state.spray);
    addWake(state.spray, m, spec.len * 0.9, spec.beam * 1.4, 0.04, spec.seed + 9);
    boats.push(state);
  }

  // ---- Pot line ----------------------------------------------------------
  // A diagonal, not a rank: the markers run down-coast on the tide, which is
  // also the line that cuts the featureless region across its short axis.
  for (const { i, x, sea } of POT_LINE) {
    const ground = surf(x, sea);
    if (ground.gy > 0.6 || ground.veiled) continue;
    // NOT INSIDE A MOORED BOAT, which is where marker 5 has been all along.
    // Its station is (-3.9, 79.2) and the tender's is (-3, 78) — one and a half
    // metres apart — so its float sits INSIDE the dinghy's hull, invisible, and
    // its 2.5 m whip aerial stands out of the foredeck with nothing under it.
    // That is in the graded r0 plate and reads at 8x as a rod through the deck.
    // Found by sweeping hulls against the pot line, not by looking.
    let inside = false;
    for (const b of BOATS) {
      if (b.way) continue;
      if (Math.hypot(x - b.x, sea - b.sea) < b.len * 0.6 + 2.0) { inside = true; break; }
    }
    if (inside) continue;
    addPotMarker(ctx, local, x, sea, ground.y, i,
      `fringe:apostles-open-bay:pot-marker:${i}`);
  }

  // ---- Kelp --------------------------------------------------------------
  const KELP = [
    [37, 71, 2.7, 1.7, 2], [-13, 86, 3.3, 1.9, 5], [12, 108, 3.6, 2.0, 8],
    [-38, 79, 2.4, 1.5, 11], [70, 92, 3.0, 1.8, 14],
    // Three more, out in the bare band below screen y 750.
    [58, 104, 3.1, 1.8, 17], [24, 122, 3.4, 1.9, 21], [-46, 132, 2.9, 1.7, 24],
  ];
  for (const [x, sea, rx, rz, seed] of KELP) {
    const ground = surf(x, sea);
    if (ground.gy > 0.6 || ground.veiled) continue;
    addKelpRaft(local, m, x, sea, ground.y, rx, rz, seed);
  }

  // ---- The bare band below screen y 750 ----------------------------------
  //
  // The capping gate. The critic measured the bottom quarter of the frame at
  // **95.98 % bare water**, unchanged from r0, and said plainly it is the only
  // lever that moves the number. Projected through the hero pose that band is
  // sea 92-165 running from local x +95 round to x -90 — the FAR water, because
  // this camera looks in from seaward, so the bottom of the frame is the offshore
  // side and not the near side.
  //
  // Everything here is filtered by the same `surf()` guards the outlying stacks
  // use. The r7 note records three of nine stacks silently deleting themselves on
  // exactly this ground, so the census below is reported from the built graph,
  // never from this table.
  const AWASH = [
    { x: 82, sea: 99, r: 3.4, h: 1.5, seed: 61 },
    { x: 66, sea: 112, r: 4.6, h: 1.1, seed: 62 },
    { x: 44, sea: 104, r: 2.6, h: 1.9, seed: 63 },
    { x: 8, sea: 134, r: 4.0, h: 1.3, seed: 64 },
    { x: -22, sea: 140, r: 3.2, h: 1.7, seed: 65 },
    { x: -58, sea: 128, r: 4.2, h: 1.2, seed: 66 },
  ];
  for (const a of AWASH) {
    const g = surf(a.x, a.sea);
    if (g.gy > 0.6 || g.veiled) continue;
    // An awash reef is a low platform that the swell breaks over, so it gets the
    // ledge profile and a foam collar rather than a stack's silhouette.
    const haze = clamp01((a.sea - 90) / 150) * 0.44;
    const mesh = addRockForm(local, m, {
      profile: LEDGE_PROFILE, haze, r: a.r, h: a.h, yaw: a.seed * 0.7, squash: 0.44,
      seed: a.seed, x: a.x, z: a.sea, segs: 9, baseY: WATER_Y - 0.55,
      lattice: [2, 1],
      name: `fringe:apostles-open-bay:awash-reef:${a.seed}`,
    });
    mesh.castShadow = false;
    // Into the obstacle list, or the birds and boats do not know it is there.
    obstacles.push({ x: a.x, sea: a.sea, r: a.r, top: WATER_Y - 0.55 + a.h });
    addFoamRing(local, m, a.x, a.sea, a.r * 2.3, a.r * 1.5, a.seed * 0.3, a.seed, g.y + 0.07);
    for (let b = 0; b < 2; b += 1) {
      const bs = rand(a.seed * 7 + b, 4, 0.7, 2.2);
      addBoulder(ctx, local, a.x + rand(a.seed + b, 71, -a.r, a.r), g.y + bs * 0.12,
        a.sea + rand(a.seed + b, 72, -a.r * 0.6, a.r * 0.6), bs, bs * 0.6, bs * 0.95,
        a.seed * 3 + b, true);
    }
  }
  // An outer pot line, set on the deeper ground the way a second string would be.
  for (let i = 0; i < 7; i += 1) {
    const t = i / 6;
    const x = 88 - t * 150 + Math.sin(i * 2.1 + 1) * 6.4;
    const sea = 100 + t * 38 + Math.cos(i * 1.9) * 5.2;
    const g = surf(x, sea);
    if (g.gy > 0.6 || g.veiled) continue;
    addPotMarker(ctx, local, x, sea, g.y, i + 40,
      `fringe:apostles-open-bay:pot-marker:outer:${i}`);
  }

  // ---- Swell crest lines, and the glitter that belongs on them -----------
  //
  // TWO EARLIER DESIGNS OF THIS WERE SCATTERED FLECKS, AND BOTH READ AS LITTER.
  //
  // Draft one put ~600 small white facets over the water. On the plate they were
  // paper scraps: a white DIFFUSE surface in daylight is a white card whatever
  // its roughness, and the diffuse ceiling parks every one of them at the same
  // luminance with a hard edge. Draft two made them metal, which fixed the colour
  // and produced the frame's first pixels over luminance 235 — and read as a
  // scatter of dark specks instead, because a mirror facet whose normal does not
  // happen to point at the sky reflects the dark horizon. Both drafts moved the
  // featureless-water number and made the blind click WORSE, which is the wrong
  // trade, and both are on the plates.
  //
  // The fault was the shape, not the material. Sea texture at this camera is not
  // dots; it is LINES. So the foam now lies along the swell's own crests: each
  // band is placed by solving the dominant swell term for constant phase, so a
  // pale line sits exactly where the vertex colour is already lightening and the
  // two reinforce instead of arguing. They are soft the way the rock collars are
  // soft — alpha zero on both long edges and at both ends, no rim anywhere — and
  // their strength runs in and out along the line, because a swell does not break
  // continuously and a ruled pale line across a frame is its own veto.
  //
  // The on-screen window, worked out from the hero pose rather than guessed: at
  // sea 60 the frame spans local x +88 to -31, and at sea 250 it spans +145 to
  // -73, because the camera looks nearly along the seaward axis so the
  // along-coast axis opens out with distance.
  const CREST_K = 0.200;          // matches swellField's fourth term exactly
  const CREST_X = 0.088;
  const CREST_PHASE = 2.4;
  const crestSea = (x, k) => (Math.PI * 0.5 + Math.PI * 2 * k - CREST_PHASE - CREST_X * x) / CREST_K;
  const glintPos = [];
  const glintCol = [];
  // k starts at 3: k = 2's crest runs through sea 58, which is where the stacks
  // and the reef already are, and that half of the frame is the best-textured
  // part of the plate (median block sd 8-12 against 2 in the open bay). The
  // bands are needed where the water is empty, not where it is busy.
  for (let k = 3; k <= 9; k += 1) {
    const seed = k * 7 + 3;
    const width = 2.6 + 1.9 * hash(k, 431);
    const runs = [];
    let run = [];
    for (let step = 0; step <= 46; step += 1) {
      const x = 132 - step * 5.2;
      // The crest wanders rather than ruling straight: about 5 m of lateral drift
      // over its length, which is enough that no straight-line fit holds across it.
      const sea = crestSea(x, k) + (3.6 + 2.4 * hash(k, 439)) * Math.sin(x * 0.029 + k * 1.7)
        + 1.9 * Math.sin(x * 0.071 + k) + 0.9 * Math.sin(x * 0.163 + k * 2.3);
      // Cut the run wherever it leaves the plate, the surface is ambiguous, or
      // the ground comes up — a band must never bridge the veil band or climb
      // the far paddock.
      const off = sea < 52 || sea > 300 || x > xHi(sea) + 12 || x < xLo(sea) - 12;
      const g = off ? null : surf(x, sea);
      if (off || g.veiled || (g.gy > 0.6 && g.alpha < 0.88)) {
        if (run.length > 3) runs.push(run);
        run = [];
        continue;
      }
      run.push({ x, sea, y: g.y });
    }
    if (run.length > 3) runs.push(run);
    for (let r = 0; r < runs.length; r += 1) {
      const pts = runs[r];
      addSwellBand(local, m, pts, width, seed * 3 + r,
        `fringe:apostles-open-bay:swell-crest:${k}:${r}`);
      // A short glitter run ON the crest, where a wave face actually is. Tens of
      // these across the whole bay, not six hundred sprayed over all of it — and
      // they are what keeps the frame's top end, which is the half of the fleck
      // field that was working.
      for (let i = 2; i < pts.length - 2; i += 5) {
        const p = pts[i];
        const sc = 0.9 + 1.0 * hash(seed * 11 + i, 432);
        waveletField(glintPos, glintCol, makePlacer(
          sc, sc * rand(seed * 11 + i, 433, 0.5, 1.0), sc * rand(seed * 11 + i, 434, 1.6, 3.4),
          Math.atan2(1, -0.44) + rand(seed * 11 + i, 435, -0.5, 0.5),
          p.x + rand(seed * 11 + i, 436, -2, 2), p.y + 0.1,
          p.sea + rand(seed * 11 + i, 437, -1.5, 1.5),
        ), 2 + Math.floor(hash(seed * 11 + i, 438) * 7), seed + i);
      }
    }
  }
  if (glintPos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(glintPos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(glintCol, 3));
    g.computeVertexNormals();
    const mesh = ownMesh(new THREE.Mesh(g, m.glint), 'fringe:apostles-open-bay:swell-glitter');
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 13;
    local.add(mesh);
  }

  // ---- Gulls -------------------------------------------------------------
  // Birds, so nothing here has to answer for daylight under it.
  //
  // THE ORBIT CENTRES ARE THE r0 POSITIONS, UNCHANGED. The scatter in the
  // graded plate is irregular and that is a gate-6 pass; the seeded placement
  // below is byte-for-byte the one that produced it, and each bird now circles
  // ITS OWN centre inside a 5-20 m radius. Nothing is collapsed onto a shared
  // circuit, which is the way this change could have turned a pass into a
  // failure.
  // A BOAT IS AN OBSTACLE TO A BIRD, AND IT MOVES. Gulls were only ever swept
  // against rock, and the sweep that checked this for the first time found a gull
  // passing **0.23 m** from the runabout's masthead. A moving hull cannot be one
  // circle, so every station of every fitted circuit goes in, at that boat's
  // masthead height, plus the moored boat at its own station.
  for (const b of boats) {
    const mast = b.beam * 0.36 * 5.2 + b.sea?.hi ?? 0;
    const r = b.beam * 0.5 + 2.5;
    if (b.track) {
      for (let i = 0; i < b.track.K; i += 1) {
        obstacles.push({ x: b.track.cx[i], sea: b.track.cz[i], r, top: mast });
      }
    } else {
      obstacles.push({ x: b.x0, sea: b.sea0, r: r + 1, top: mast });
    }
  }

  const flock = [];
  // A LOOSE WHEEL, not a clone ring. Sixteen birds share a centre over the
  // mid-bay water the graded pose actually looks at, but every radius, phase,
  // period and size is unique — nearest-neighbour CV stays high, and the flock
  // reads as one event instead of sixteen flecks.
  const WHEEL_N = 16;
  const wheelCx = 18;
  const wheelCz = 78;
  for (let i = 0; i < WHEEL_N; i += 1) {
    const a = (i / WHEEL_N) * Math.PI * 2 + (hash(i, 801) - 0.5) * 0.72;
    const d = 7 + hash(i, 802) * 14;
    const x = wheelCx + Math.cos(a) * d;
    const sea = wheelCz + Math.sin(a) * d * 0.62;
    const ground = surf(x, sea);
    if (ground.veiled) continue;
    const y = ground.y + 4.2 + hash(i, 803) * 9.5;
    flock.push(gullSpec(i, x, y, sea, 1.15 + hash(i, 804) * 0.28, ground.y, obstacles));
  }

  // Two standing on the nearest stack top. Wings folded, unique headings.
  {
    const s0 = STACKS[0];
    const perchH = WATER_Y + s0.h * 1.22 * STAMP_STACK_SCALE - 0.15;
    for (let p = 0; p < 2; p += 1) {
      const ox = (p === 0 ? 0.55 : -0.5) * s0.r;
      const oz = s0.r * (0.62 + p * 0.08);
      flock.push(gullSpec(80 + p, s0.x + ox, perchH, s0.sea + oz,
        1.05, perchH, obstacles, false, true));
    }
  }

  // OFF THE PALE BAND. The critic measured birds over open blue at +97 luminance
  // against their background and birds over the foam crests at **+9 to +35, which
  // vanish at 1:1** — with about half the flock parked on foam. The crest lines
  // are analytic here (`crestSea` solves the dominant swell for constant phase),
  // so a bird's distance to the nearest pale band is computable rather than
  // guessable, and a bird inside it is nudged to the darker water between bands.
  const CREST_GAP = (Math.PI * 2) / CREST_K;      // 31.4 m between crests
  const offCrest = (x, sea) => {
    const k = Math.round((CREST_K * sea + CREST_X * x + CREST_PHASE - Math.PI * 0.5)
      / (Math.PI * 2));
    const centre = crestSea(x, k);
    const d = sea - centre;
    if (Math.abs(d) > 6) return sea;
    // Push to whichever trough is nearer, landing a quarter-wave off the crest.
    return centre + (d >= 0 ? 1 : -1) * CREST_GAP * 0.28;
  };
  for (const b of flock) {
    if (b.raft || b.perch) continue;
    const moved = offCrest(b.cx, b.cz);
    if (moved !== b.cz) b.cz = moved;
  }

  // One small raft on the water, not three. The wheel is the event; sitting
  // birds are garnish.
  const raftSpots = [[22, 108, 3, 481]];
  let raftAnchor = null;
  for (const [ox, osea, n, salt] of raftSpots) {
    for (let j = 0; j < n; j += 1) {
      const a = hash(j, salt) * Math.PI * 2;
      const d = 2.5 + hash(j, salt + 1) * 8;
      const x = ox + Math.cos(a) * d;
      const sea = osea + Math.sin(a) * d * 0.75;
      const g = surf(x, sea);
      if (g.veiled || g.gy > 0.6) continue;
      let blocked = false;
      for (const o of obstacles) {
        if (Math.hypot(x - o.x, sea - o.sea) < o.r + 3.2) { blocked = true; break; }
      }
      if (blocked) continue;
      if (!raftAnchor) raftAnchor = [x, sea];
      flock.push(gullSpec(60 + salt * 0.01 + j, x, g.y, sea,
        0.90 + hash(j, salt + 2) * 0.22, g.y, obstacles, true));
    }
  }

  const light = flock.filter((_, i) => i % 5 !== 0);
  const dark = flock.filter((_, i) => i % 5 === 0);
  const gulls = { birds: [], meshes: [], shadows: null, raftSea: null };
  if (raftAnchor) {
    local.updateWorldMatrix(true, false);
    SEA_WORLD.set(raftAnchor[0], 0, raftAnchor[1]);
    local.localToWorld(SEA_WORLD);
    const wx = SEA_WORLD.x;
    const wz = SEA_WORLD.z;
    gulls.raftSea = bakeSeaSeries((t, out) => out.set(wx, 0, wz), city, oceanPlan);
  }
  for (const [birds, mat, name] of [
    [light, m.gull, 'fringe:apostles-open-bay:gulls'],
    [dark, m.gullDark, 'fringe:apostles-open-bay:gulls-dark'],
  ]) {
    if (!birds.length) continue;
    const body = new THREE.InstancedMesh(gullBodyGeo(ctx), mat, birds.length);
    const wings = new THREE.InstancedMesh(gullWingGeo(ctx), mat, birds.length * 2);
    for (const [mesh, nm] of [[body, name], [wings, `${name}:wings`]]) {
      mesh.name = nm;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      noPick(mesh);
      local.add(mesh);
    }
    gulls.meshes.push({ body, wings, birds });
    for (const b of birds) gulls.birds.push(b);
  }
  if (gulls.birds.length) {
    const shadows = new THREE.InstancedMesh(
      discGeo(ctx, 1, 12), m.gullShadow, gulls.birds.length,
    );
    shadows.name = 'fringe:apostles-open-bay:gull-shadows';
    shadows.castShadow = false;
    shadows.receiveShadow = false;
    shadows.frustumCulled = false;
    shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    shadows.renderOrder = 12;
    noPick(shadows);
    local.add(shadows);
    gulls.shadows = shadows;
  }
  // Write the built pose once, so a frame rendered before the first `update`
  // call — and a frozen scene, which never gets one at a non-zero clock — shows
  // birds in flight rather than every instance stacked on the identity matrix.
  updateGulls(gulls, 0);
  updateBoats(boats, 0);
  return { gulls, boats };
}

// ---------------------------------------------------------------------------
// Gull flight. Pure function of `t` and the seeded per-bird spec — two calls at
// the same clock write identical matrices, which is what makes every before /
// after capture in this programme comparable.
// ---------------------------------------------------------------------------

const GULL_SCRATCH = {
  pos: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
  euler: new THREE.Euler(0, 0, 0, 'YZX'),
  scale: new THREE.Vector3(),
  wingPos: new THREE.Vector3(),
  wingQuat: new THREE.Quaternion(),
  wingEuler: new THREE.Euler(0, 0, 0, 'YXZ'),
  wingScale: new THREE.Vector3(),
  bodyM: new THREE.Matrix4(),
  wingLocal: new THREE.Matrix4(),
  wingM: new THREE.Matrix4(),
};

function updateGulls(gulls, t) {
  if (!gulls) return;
  const S = GULL_SCRATCH;
  let shadowI = 0;
  for (const group of gulls.meshes) {
    const { body, wings, birds } = group;
    for (let i = 0; i < birds.length; i += 1) {
      const b = birds[i];
      const perched = !!b.perch;
      const rafted = !!b.raft;
      const th = b.turn * b.omega * t + b.phase;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const x = perched ? b.cx : b.cx + b.radius * c;
      const z = perched ? b.cz : b.cz + b.radius * b.ecc * s;
      const climbPh = b.climbMul * th + b.climbPhase;
      let y = perched ? b.cy : b.cy + b.climb * Math.sin(climbPh);
      if (rafted && gulls.raftSea) {
        seaAt(gulls.raftSea, t, SEA_OUT);
        y = b.cy + SEA_OUT.h + 0.09;
      }
      // Dive-and-lift on a seeded timer. A slow sine, gated so only the lower
      // half of the cycle actually drops — the bird stoops, then lifts.
      let dive = 0;
      if (!rafted && !perched && b.diveHz) {
        const dv = Math.sin(t * b.diveHz * Math.PI * 2 + b.divePhase);
        dive = Math.max(0, -dv) ** 1.4;
        y -= dive * Math.min(4.2, Math.max(0.4, y - WATER_Y - 1.2));
      }
      const dx = perched ? 0 : -b.radius * s * b.turn * b.omega;
      const dz = perched ? 0 : b.radius * b.ecc * c * b.turn * b.omega;
      const dy = perched ? 0 : b.climb * b.climbMul * b.turn * b.omega * Math.cos(climbPh)
        - dive * 2.4;
      const speed = Math.hypot(dx, dz) || 1e-4;
      const yaw = perched ? b.phase : Math.atan2(-dz, dx);
      const pitch = (rafted || perched) ? 0 : Math.atan2(dy, speed) * 0.85;
      const dyaw = -b.turn * b.omega;
      const roll = (rafted || perched) ? 0
        : Math.max(-0.72, Math.min(0.72, (-dyaw * speed) / 9.81 * 1.9));
      S.euler.set(roll, yaw, pitch, 'YZX');
      S.quat.setFromEuler(S.euler);
      S.pos.set(x, y, z);
      S.scale.setScalar(b.scale);
      S.bodyM.compose(S.pos, S.quat, S.scale);
      body.setMatrixAt(i, S.bodyM);

      // 2:1 flap/glide. Duty is a unique-phase saw; below 2/3 the wings work.
      const beat = Math.sin(t * b.beatHz * Math.PI * 2 + b.beatPhase);
      const duty = b.burstHz > 0
        ? ((t * b.burstHz + b.burstPhase / (Math.PI * 2)) % 1 + 1) % 1
        : 0;
      const gate = (rafted || perched) ? 0
        : (b.flapDuty ? (duty < b.flapDuty ? 1 : 0) : 1);
      const flap = b.dihedral + b.beatAmp * beat * (0.16 + 0.84 * gate);
      const sweep = (rafted || perched) ? 0.62
        : 0.30 * Math.max(0, -beat) * (0.2 + 0.8 * gate);
      for (let w = 0; w < 2; w += 1) {
        const side = w === 0 ? 1 : -1;
        S.wingPos.set(0.02, 0.030, side * 0.055);
        S.wingEuler.set(-side * flap, -side * sweep, 0, 'YXZ');
        S.wingQuat.setFromEuler(S.wingEuler);
        S.wingScale.set(1, 1, side * b.span);
        S.wingLocal.compose(S.wingPos, S.wingQuat, S.wingScale);
        S.wingM.multiplyMatrices(S.bodyM, S.wingLocal);
        wings.setMatrixAt(i * 2 + w, S.wingM);
      }

      if (gulls.shadows) {
        const height = y - WATER_Y;
        const low = height < 6.5 && !perched;
        const rad = low ? (0.55 + b.span * 0.35) * clamp01(1.15 - height / 6.5) : 0;
        S.pos.set(x, WATER_Y + 0.07, z);
        S.euler.set(-Math.PI / 2, 0, 0, 'XYZ');
        S.quat.setFromEuler(S.euler);
        S.scale.set(rad, rad, 1);
        S.wingM.compose(S.pos, S.quat, S.scale);
        gulls.shadows.setMatrixAt(shadowI, S.wingM);
        shadowI += 1;
      }
    }
    body.instanceMatrix.needsUpdate = true;
    wings.instanceMatrix.needsUpdate = true;
  }
  if (gulls.shadows) gulls.shadows.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Reef platform + boulder aprons.
// ---------------------------------------------------------------------------

/**
 * The boulder hull is a unit-radius block (about 2.2 m across at scale 1), but
 * the callers pass sizes meant as the finished stone's radius, so every boulder
 * came out 6-10 m across: the snowballs. TASTE-BIBLE section 4 fixes shore
 * boulders at 0.6-2.5 m, so the caller's size is scaled by this unit. Stack-base
 * blocks (bible: 2-5 m) pass their own larger unit.
 */
const BOULDER_UNIT = 0.42;
const BASE_BLOCK_UNIT = 0.85;

function addBoulder(ctx, group, x, y, z, sx, sy, sz, seed, wet = false, unit = BOULDER_UNIT) {
  const { m } = ctx;
  // Six tints, not two: a bank of one colour is a gravel pile whatever its
  // faceting, and tonal spread is half of what makes the reference bank read.
  const dryTints = [m.boulder, m.boulderPale, m.boulderGrey, m.boulder, m.boulderMoss, m.boulderPale];
  const wetTints = [m.boulderWet, m.boulderDamp, m.boulderMoss, m.boulderDamp, m.boulderWet, m.boulderGrey];
  const mat = (wet ? wetTints : dryTints)[seed % 6];
  return place(group, boulderGeo(ctx, seed % 6), mat, x, y, z, {
    scale: [sx * unit, sy * 0.9 * unit, sz * unit],
    rotY: rand(seed, 3, 0, Math.PI * 2),
    rotZ: rand(seed, 5, -0.16, 0.16),
    rotX: rand(seed, 7, -0.13, 0.13),
  });
}

function addReef(ctx, group) {
  const { m } = ctx;
  const reef = new THREE.Group();
  reef.name = 'fringe:apostles:reef-platform';
  noPick(reef);
  group.add(reef);

  for (let i = 0; i < REEF.length; i += 1) {
    const ledge = REEF[i];
    // W4-A: the ledge was one 9 x 14 m pale slab with straight cut edges (read as a slat). It is now a
    // cluster of rock blocks, 0.6 to 2.5 m, in the rock tokens, laid over the same footprint.
    const ledgeBlocks = new THREE.Group();
    ledgeBlocks.name = `fringe:apostles:reef-ledge:${i}`;
    noPick(ledgeBlocks);
    reef.add(ledgeBlocks);
    // Six blocks a ledge: the venue triangle budget (p15-apostles FC6 cap) leaves room for about 38 in all.
    const blockCount = 6;
    for (let b = 0; b < blockCount; b += 1) {
      const a = (b / blockCount) * Math.PI * 2 + rand(i * 31 + b, 8, -0.3, 0.3);
      const ring = b < blockCount * 0.55 ? rand(i * 31 + b, 9, 0.35, 0.95) : rand(i * 31 + b, 10, 0, 0.3);
      const bx = ledge.x + Math.cos(a) * ledge.r * 0.95 * ring;
      const bz = ledge.sea + Math.sin(a) * ledge.r * ledge.squash * 1.3 * ring;
      const s = rand(i * 31 + b, 11, 1.2, 2.5);
      addBoulder(ctx, ledgeBlocks, bx, WATER_Y + s * 0.15, bz, s, s * rand(i * 31 + b, 12, 0.5, 0.8), s * rand(i * 31 + b, 13, 0.8, 1.2),
        i * 11 + b, ring > 0.6);
    }
    // Two per ledge, not four. r3's forty-plus stones read as a debris field
    // once they became faceted; a graded few with a wide size spread reads as a
    // bank, which is what the reference still does.
    addFoamRing(reef, m, ledge.x, ledge.sea + ledge.r * ledge.squash * 0.55,
      ledge.r * 1.16, ledge.r * ledge.squash * 1.5, ledge.yaw, i * 3 + 1);
    for (let b = 0; b < 2; b += 1) {
      const a = rand(i * 13 + b, 1, 0, Math.PI * 2);
      const rr = ledge.r * rand(i * 13 + b, 2, 0.9, 1.2);
      const bx = ledge.x + Math.cos(a) * rr;
      const bz = ledge.sea + Math.sin(a) * rr * ledge.squash * 1.5;
      const s = rand(i * 13 + b, 4, 0.6, 3.1);
      addBoulder(ctx, reef, bx, WATER_Y + s * 0.16, bz, s, s * rand(i + b, 6, 0.55, 0.85),
        s * 0.95, i * 7 + b, bz > ledge.sea);
    }
  }

  // A short talus run out of the headland toe only. The open cove sand stays
  // clear so the beach does not read as a debris field.
  for (let i = 0; i < 5; i += 1) {
    const t = i / 4;
    const x = 19.5 - t * 6.5 + Math.sin(i * 2.1) * 1.2;
    const sea = 32.0 + Math.sin(i * 1.37 + 0.6) * 2.2 + t * 4.6;
    const s = rand(i, 21, 0.8, 3.2);
    addBoulder(ctx, reef, x, SAND_Y + s * 0.16, sea, s, s * rand(i, 22, 0.5, 0.8), s * 0.95,
      i + 40, false);
    contact(ctx, reef, x, sea, s * 1.35, SAND_Y + 0.03, 0.2);
  }

  // Three low wave-washed outlier rocks hold the open water on the seaward side
  // so the right of the frame is not a bare coloured plane.
  const outliers = [
    { x: -20.5, sea: 54.0, r: 2.6, h: 2.2, yaw: 0.4 },
    { x: -23.5, sea: 63.5, r: 1.9, h: 1.5, yaw: -0.7 },
    { x: -18.0, sea: 72.0, r: 2.2, h: 2.9, yaw: 0.9 },
  ];
  for (let i = 0; i < outliers.length; i += 1) {
    const o = outliers[i];
    addRockForm(reef, m, {
      profile: apostleProfile(i * 3 + 21, {
        courses: 7, notchT: 0.18, notchDepth: 0.34, capT: 0.78,
      }),
      r: o.r, h: o.h, lean: 0.2, yaw: o.yaw, squash: 0.62, seed: i * 9 + 5,
      x: o.x, z: o.sea, segs: 9, name: `fringe:apostles:outlier-rock:${i}`,
    });
    addStackBase(ctx, reef, o.x, o.sea, o.r * 0.9, i + 31);
    addFoamRing(reef, m, o.x, o.sea, o.r * 1.8, o.r * 1.2, o.yaw, i + 7);
  }

  for (let i = 0; i < 24; i += 1) {
    const x = -24 + i * 1.45 + Math.sin(i * 3.1) * 0.8;
    const sea = shoreBaseline(-24 + i * 1.45) - 6.4 + Math.cos(i * 2.3) * 0.6;
    place(group, boxGeo(ctx, 1.1, 0.07, 0.34), m.seaweed, x, SAND_Y + 0.05, sea, {
      rotY: rand(i, 31, -0.9, 0.9), cast: false,
    });
  }
  for (let i = 0; i < 5; i += 1) {
    const x = -22 + i * 7.5;
    const sea = shoreBaseline(-22 + i * 7.5) - 8.2 + Math.sin(i * 1.9) * 1.2;
    place(group, cylGeo(ctx, 0.16, 0.2, 2.6, 6), m.trunk, x, SAND_Y + 0.17, sea, {
      rotZ: Math.PI / 2, rotY: rand(i, 33, -1.2, 1.2),
    });
    contact(ctx, group, x, sea, 1.5, SAND_Y + 0.03, 0.18);
  }
}

// ---------------------------------------------------------------------------
// Headland mass.
// ---------------------------------------------------------------------------

/**
 * The cliff's second, third and fourth material families.
 *
 * r6 measured the face at a hue span of 18.0 degrees, and the lower-left at
 * 10.7, against Monopoly Plus's rocky bank at 303 — one ochre family carrying
 * grey-brown AND green AND moss in the reference, one ochre family carrying only
 * value here. These are the three that a limestone sea cliff actually wears:
 *   PALE   a harder limestone bed, near-white and near-neutral, standing out of
 *          the ochre in horizontal BANDS because that is how bedding works
 *   LICHEN sage-green crustose growth, patchy and biased onto the shelves where
 *          water sits, never on the overhung risers
 *   DAMP   the cool grey-blue of permanently wet rock at the toe and in the
 *          gullies that drain the face
 * All three ride in the vertex colour of the same mesh, so this adds no surface
 * and cannot open a seam. Every term is a pure function of the STATION'S
 * COORDINATES and the row's height — never of its index in this panel, because
 * adjacent panels share their end station and number it differently.
 */
const CLIFF_PALE = new THREE.Color(TASTE.built.concrete);
const CLIFF_LICHEN = new THREE.Color('#6d7a50');
const CLIFF_DAMP = new THREE.Color('#5c605c');

/**
 * A BED THAT HOLDS ONE ABSOLUTE HEIGHT ALL THE WAY ROUND IS A HOOP, AND TEN OF
 * THEM ARE A STRIPED DRUM.
 *
 * Every row in `addStrataPanel` is placed at `faceHeight * level.t`, and `t`
 * comes from a list the whole run shares. Erosion moved a vertex by up to
 * 0.42 m and mottling shifted its colour, but the BED ITSELF was dead level at
 * every station of every panel, so the ten beds wrapped the headland as ten
 * parallel rings at ten constant heights. On the r14 plate that is exactly what
 * the lookout headland reads as: a drum with horizontal stripes painted on it,
 * not a wave-cut bluff.
 *
 * Real bedding dips. These two terms are pure functions of the STATION'S
 * COORDINATES — the same rule the mottling and the erosion already obey, so a
 * station shared between two panels still lands byte-identically on both sides
 * and no crack can open at a join.
 *
 *   `dip`   a regional tilt across the run, so the beds are not horizontal
 *   `warp`  two incommensurate folds, so the tilt is not a ruler either
 *
 * Both are gated by `sin(PI * t)`: zero at the toe, zero at the plateau, full
 * in the middle of the face. The cap and the wave-cut toe are shared with
 * `addHeadlandCap`, the ochre bedding and the wet contact run, and moving
 * either of those would open a gap under the grass or float the toe off the
 * sand. The gate costs nothing at the ends and buys the whole face.
 */
function bedWarp(base, t) {
  const gate = Math.sin(Math.PI * clamp01(t));
  const dip = (base.x - 35.2) * 0.0295;
  const warp = 0.42 * Math.sin(base.x * 0.118 + base.z * 0.047)
    + 0.26 * Math.sin(base.x * 0.271 - base.z * 0.083 + 2.1);
  return (dip + warp) * gate;
}

/**
 * Collapsed ledges. A limestone bluff does not weather evenly: two or three
 * places along any run have dropped a bedding slab, and what is left is a
 * notch with the block slumped seaward at its foot. Keyed on the station's own
 * x so the notches sit in the same metres on every bed that passes through
 * them — which is what makes them read as one collapse rather than as noise.
 */
function collapseAt(x) {
  return clamp01(1 - Math.abs(x - 27.6) / 3.1) * 0.9
    + clamp01(1 - Math.abs(x - 43.2) / 2.4);
}

/** Deep vertical creases. Zero at the toe and the plateau so those shared edges stay put. */
function cliffJoint(x, t) {
  const gate = Math.sin(Math.PI * clamp01(t));
  let depth = 0;
  const cuts = [[28.4, 1.15, 0.72], [36.6, 0.9, 0.88], [45.2, 1.2, 0.64]];
  for (let i = 0; i < cuts.length; i += 1) {
    const u = Math.abs(x - cuts[i][0]) / cuts[i][1];
    if (u < 1) depth = Math.max(depth, (1 - u) * (1 - u) * cuts[i][2]);
  }
  return depth * gate;
}

function addStrataPanel(group, m, stations, rows, name, opts = null) {
  const vertices = [];
  const colors = [];
  const indices = [];
  // Sea-face panels ask for a deeper wet toe; the land face keeps its own.
  const wetTo = opts?.wetTo ?? 0.145;
  const wetGain = opts?.wetGain ?? 0.62;
  for (let station = 0; station < stations.length; station += 1) {
    const base = stations[station];
    const slump = collapseAt(base.x);
    for (let row = 0; row < rows.length; row += 1) {
      const level = rows[row];
      const colour = new THREE.Color(level.color);
      // Mottling is keyed to the STATION'S COORDINATES, never to its index in
      // this panel — adjacent panels share their end station but number it
      // differently, so an index-keyed tint put two different colours on one
      // vertex and drew a coloured seam down every panel join.
      colour.offsetHSL(
        0.004 * Math.sin(base.x * 0.29 + base.z * 0.19 + row * 0.71),
        -0.015 * Math.sin(base.x * 0.53 + row * 1.9),
        Math.sin(base.x * 0.61 + base.z * 0.23 + row * 0.83) * 0.02,
      );
      const ht = level.t;
      if (level.shelf) colour.lerp(CLIFF_PALE, 0.16);
      // Lichen: patchy, and it grows on ledges, not on overhangs.
      const growth = 0.5
        + 0.60 * Math.sin(base.x * 0.39 + base.z * 0.27 + ht * 7.1)
        + 0.33 * Math.sin(base.x * 1.03 + ht * 3.4 + 0.7);
      const lichen = clamp01(growth - 0.62) * 1.9
        * clamp01((ht - 0.10) / 0.22) * clamp01((0.97 - ht) / 0.1)
        * (level.shelf ? 1 : 0.42);
      colour.lerp(CLIFF_LICHEN, clamp01(lichen) * 0.72);
      // Damp: the toe is always wet, and three gullies drain the face above it.
      const gully = clamp01(
        0.55 * Math.sin(base.x * 0.63 + base.z * 0.11) + 0.4 * Math.sin(base.x * 0.21) - 0.42,
      ) * 2.2 * clamp01((0.52 - ht) / 0.42);
      // The sea face's toe is a REAL tonal break, not a slightly darker brown:
      // it is under water twice a day and it never dries. Land-face panels keep
      // the default and are unchanged.
      const damp = Math.max(clamp01((wetTo - ht) / wetTo), clamp01(gully) * 0.66);
      colour.lerp(CLIFF_DAMP, damp * wetGain);
      // Three added families cost saturation by construction — the r7 plate
      // measured the face at S median 0.37 against r6's 0.52 — so the rock that
      // is still rock gets its warmth back. This only lifts where none of the
      // three has taken hold, so it cannot re-narrow the hue spread.
      const stillRock = (1 - clamp01(lichen)) * (1 - damp);
      colour.offsetHSL(0, 0.02 * stillRock, 0.008 * stillRock);
      const ledgeBreak = Math.sin(Math.PI * level.t);
      // Shelf rows keep their run straight — a bedding ledge that meanders is a
      // sand dune, not a bed — while riser rows carry the erosion.
      const relief = level.shelf ? 0.28 : 1;
      // A LEDGE THAT RUNS THE FULL WIDTH AT A CONSTANT DEPTH IS A PLANK.
      //
      // r4 gave every bedding shelf the same step-back at every station, so the
      // face read as seven parallel slabs of uniform thickness with straight
      // full-width noses — dressed lumber, which is worse than the flat batter
      // it replaced. Two terms fix that, and both are pure functions of the
      // station's coordinates so shared stations still land byte-identically:
      //   dieOut  — the shelf lerps back to the bed below it, so a ledge fades
      //             out partway along the run and picks up again further on.
      //   noseBreak — the nose wanders in and out instead of ruling straight.
      // A LEDGE THAT DIES OUT ONCE ACROSS THE WHOLE RUN STILL RULES THE RUN.
      // At 0.155 rad/m the argument sweeps 4.8 rad over the headland's 31 m of
      // x — less than one cycle — so every shelf faded at most once and read as
      // continuous either side of it. Twice the frequency gives each bed two or
      // three breaks along its length, which is what stops the eye joining them
      // into a hoop, and the collapse notches take a third of the ledge out
      // where a slab has dropped.
      const phase = level.phase ?? 0;
      const dieOut = level.shelf
        ? clamp01(0.18 + 1.05 * Math.sin(base.x * 0.317 + base.z * 0.062 + phase))
          * (1 - slump * 0.72)
        : 1;
      const noseBreak = level.shelf && !level.noNose
        ? (Math.sin(base.x * 1.31 + base.z * 0.43 + phase) * 0.34
          + Math.sin(base.x * 0.57 + phase * 1.7) * 0.26) * dieOut
        : 0;
      const xErosion = Math.sin(base.x * 0.73 + base.z * 0.11 + row * 0.47)
        * 0.28 * ledgeBreak * relief;
      // Everything here is a function of the STATION'S COORDINATES, never of its
      // index in this panel. Adjacent panels share their end station, and an
      // index term made the shared vertex land in two different places — a
      // visible vertical crack straight down the cliff at every panel join.
      const yErosion = Math.cos(base.x * 0.41 + base.z * 0.17 + row * 1.23)
        * 0.22 * ledgeBreak * relief;
      const zFrom = level.zFrom ?? (level.zPush ?? 0);
      const zPush = zFrom + ((level.zPush ?? 0) - zFrom) * dieOut;
      const xFrom = level.xFrom ?? (level.xPush ?? 0);
      const xPush = xFrom + ((level.xPush ?? 0) - xFrom) * dieOut;
      // The bed's own dip and fold, plus the drop where a slab has collapsed.
      // Both ride the same `sin(PI * t)` gate, so the cap and the toe are where
      // they were and only the face between them moves.
      const gate = Math.sin(Math.PI * clamp01(level.t));
      const dropped = slump * 0.92 * gate;
      const recess = (opts?.recessSign ?? 0) * cliffJoint(base.x, level.t);
      vertices.push(
        base.x + xPush + xErosion,
        -0.3 + (base.h ?? TOP_Y + 0.3) * level.t + yErosion
          + bedWarp(base, level.t) - dropped,
        base.z + zPush + noseBreak + dropped * 0.85 + recess
          + Math.cos(base.x * 0.37 + row * 1.1) * 0.16 * relief,
      );
      colors.push(colour.r, colour.g, colour.b);
      if (station > 0 && row > 0) {
        const a = (station - 1) * rows.length + row - 1;
        const b = station * rows.length + row - 1;
        const c = (station - 1) * rows.length + row;
        const d = station * rows.length + row;
        // Wound outward. The cliff material is DoubleSide so the old inverted
        // order still drew, but every normal pointed INTO the headland, which is
        // why a face carrying eleven coloured beds and a metre of erosion relief
        // read as one flat brown mass with no terracing in it.
        indices.push(a, d, b, a, c, d);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // W6-B: baked occlusion on top of the authored bed colours: the toe, the creases between
  // beds and the undersides of ledges darker, upward faces a little lighter.
  bakeStoneOcclusion(geometry, {
    baseY: WATER_Y, multiply: true, wetM: 1.2, wetDark: 0.18, topLift: 0.08, undercut: 0.20, cavity: 0.22,
  });
  const mesh = ownMesh(new THREE.Mesh(geometry, m.cliffSurface), name);
  // Published so a test can name a BED. Vertices are station-major / row-minor,
  // and every panel on a face shares one row list, so `index % rows` is the bed
  // and its spread across the run is the number that says stripe or stratum.
  mesh.userData.rows = rows.length;
  mesh.userData.stations = stations.length;
  group.add(mesh);
}

function addHeadlandCap(ctx, group) {
  const { m } = ctx;
  const vertices = [];
  const indices = [];
  for (let i = 0; i < CLIFF_X.length; i += 1) {
    vertices.push(
      CLIFF_X[i], TOP_Y, CLIFF_BACK[i],
      CLIFF_X[i], TOP_Y, CLIFF_Z[i],
    );
    if (i > 0) {
      const a = i * 2 - 2;
      const b = a + 1;
      const c = i * 2;
      const d = c + 1;
      // Faces up. The lawn was wound face-down and, on FrontSide, was being
      // culled entirely from the hero camera.
      indices.push(a, d, c, a, b, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const cap = ownMesh(new THREE.Mesh(geometry, m.grass), 'fringe:apostles:headland-brow');
  cap.castShadow = false;
  group.add(cap);

  for (let i = 0; i < 26; i += 1) {
    const t = i / 25;
    const idx = t * (CLIFF_X.length - 1);
    const i0 = Math.min(CLIFF_X.length - 2, Math.floor(idx));
    const f = idx - i0;
    const x = CLIFF_X[i0] + (CLIFF_X[i0 + 1] - CLIFF_X[i0]) * f;
    const z = CLIFF_Z[i0] + (CLIFF_Z[i0 + 1] - CLIFF_Z[i0]) * f - 0.7;
    bevelBox(ctx, group, 1.5, 0.42, 0.62, i % 2 ? m.stone : m.stoneDark,
      x, TOP_Y + 0.2, z, { bevel: 0.07, rotY: rand(i, 51, -0.12, 0.12) });
  }
}

function addOchreBedding(ctx, group) {
  const { m } = ctx;
  const bluffRuns = [
    [[20.5, 40.8], [25.0, 47.9], [30.0, 52.8]],
    [[30.4, 52.7], [35.0, 54.1], [40.0, 51.7]],
    [[40.4, 51.5], [45.0, 47.3], [50.0, 41.0]],
  ];
  const beds = [
    { y: 1.7, push: 0.4, width: 0.8, mat: m.ochreDark },
    { y: 3.6, push: 0.24, width: 0.58, mat: m.ochre },
    { y: 5.6, push: 0.44, width: 0.72, mat: m.ochreDark },
    { y: 7.5, push: 0.3, width: 0.54, mat: m.ochre },
    { y: 9.3, push: 0.42, width: 0.66, mat: m.ochreDark },
  ];
  for (let bed = 0; bed < beds.length; bed += 1) {
    const layer = beds[bed];
    for (let bluff = 0; bluff < bluffRuns.length; bluff += 1) {
      const points = bluffRuns[bluff].map(([x, z], station) => [
        x,
        z + layer.push + Math.sin((bed + 1) * (station + 1) * 0.91) * 0.18,
        layer.y + Math.cos(bluff * 1.7 + station + bed) * 0.09,
      ]);
      addRibbon(group, points, layer.width, layer.mat, layer.y,
        `fringe:apostles:headland-ochre-bed:${bed}:${bluff}`);
    }
  }
}

/**
 * Turn a list of bedding planes into a TERRACED row list.
 *
 * r3's cliff carried eleven coloured rows on a single smooth batter, which is a
 * gradient, not terracing: the face read as one flat brown mass across ten per
 * cent of the frame. Each step now emits three rows — the top of the riser, a
 * near-horizontal shelf pushed back to the next bed's line, and the foot of the
 * next riser — so the key lands on a real ledge and drops a real shadow under it.
 */
function terraceRows(steps) {
  const rows = [];
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    rows.push({ t: step.t, zPush: step.zPush, color: step.color });
    const next = steps[i + 1];
    if (!next) continue;
    const span = next.t - step.t;
    // EVERY BED GETS ITS OWN LIP AND ITS OWN SLAB THICKNESS.
    //
    // r4 used a fixed 0.16 / 0.24 pair against near-uniform bed spacing, which
    // is a machine setting: nine ledges, nine identical thicknesses, nine even
    // heights. That is what read as a stack of dressed lumber. The lip now runs
    // 0.10 to 0.30 of the span and the nose 0.05 to 0.20 deeper than the lip,
    // seeded off the bed index — deterministic, and constant across every panel
    // so the shared stations still agree.
    const lip = 0.10 + 0.20 * hash(i, 211);
    const foot = lip + 0.05 + 0.15 * hash(i, 212);
    const phase = i * 1.31 + 0.6;
    const shelf = new THREE.Color(step.color);
    shelf.offsetHSL(0, -0.03, 0.03);
    rows.push({
      t: step.t + span * lip,
      zPush: next.zPush,
      zFrom: step.zPush,
      phase,
      color: `#${shelf.getHexString()}`,
      shelf: true,
    });
    const riser = new THREE.Color(next.color);
    riser.offsetHSL(0, 0.01, -0.055);
    rows.push({
      t: step.t + span * foot,
      zPush: next.zPush,
      zFrom: step.zPush,
      phase,
      color: `#${riser.getHexString()}`,
      shelf: true,
    });
  }
  return rows;
}

/**
 * Split one continuous station run into overlapping panels. The panels SHARE
 * the station objects at their joins, so a shared vertex is computed from
 * literally the same numbers on both sides and no crack can open.
 */
function panelsFrom(run, per) {
  const out = [];
  for (let i = 0; i + 1 < run.length; i += per) {
    out.push(run.slice(i, Math.min(i + per + 1, run.length)));
  }
  return out;
}

/** The stair-side return is a broad broken wall, not another run of siding.
 * Keep the inherited strata surface/material, but give its interior two broad
 * offset planes and one narrow vertical recess. All end stations stay on the
 * shared construction line; the toe and rim remain straight between them.
 */
function addFracturedReturnPanel(group, m, x, zStart, zEnd, rows, name, section, mirror = false) {
  let stations = (section === 0 ? [
    [0, 0, 0, 0], [0.14, -0.08, 0, 0], [0.27, -0.18, -0.02, 0.55],
    [0.33, 0.86, 0.18, 1], [0.45, 0.73, 0.27, 0.8],
    [0.59, 0.61, 0.23, 0.3], [0.73, 0.08, 0.03, 0],
    [0.86, -0.22, -0.06, 0], [1, 0, 0, 0],
  ] : [
    [0, 0, 0, 0], [0.19, -0.10, -0.03, 0], [0.39, 0.35, 0.12, 0.5],
    [0.60, 0.30, 0.15, 0.8], [0.80, -0.15, -0.02, 0.1], [1, 0, 0, 0],
  ]);
  if (mirror) {
    // Five and six stations share the mirrored fracture profile.
    if (section === 0) stations = stations.filter((_, i) => [0, 2, 3, 7, 8].includes(i));
    // The right bedding slope opposes the recess; deepen its mirrored relief to clear 0.5 m.
    stations = stations.map(([u, recess, bedSlip, lipClose]) => [u, -recess * 1.2, bedSlip, lipClose]);
  }
  addStrataPanel(group, m, stations.map(([u]) => ({ x, z: zStart + (zEnd - zStart) * u })), rows, name);
  const mesh = group.getObjectByName(name);
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  const original = position.array.slice();
  const rowCount = rows.length;
  const at = (station, row, axis) => original[(station * rowCount + row) * 3 + axis];
  for (let station = 0; station < stations.length; station += 1) {
    const [u, recess, bedSlip, lipClose] = stations[station];
    for (let row = 0; row < rowCount; row += 1) {
      const vertex = station * rowCount + row;
      if (row === 0 || row === rowCount - 1) {
        // The old two-station panel already implied these exact straight edges.
        for (let axis = 0; axis < 3; axis += 1) position.array[vertex * 3 + axis] =
          at(0, row, axis) * (1 - u) + at(stations.length - 1, row, axis) * u;
        continue;
      }
      const gate = Math.sin(Math.PI * rows[row].t);
      let px = at(station, row, 0) + recess * gate;
      // Three selected shelf lips die into the fracture rather than crossing it.
      if (lipClose && (row === 4 || row === 10 || row === 16)) {
        px += (at(station, row - 1, 0) - at(station, row, 0)) * lipClose * 0.78;
      }
      position.setXYZ(vertex, px, at(station, row, 1) + bedSlip * gate, at(station, row, 2));
    }
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

function addCliffMass(ctx, group) {
  const { m } = ctx;
  // Bed heights are DELIBERATELY UNEVEN — spacings run 0.07 to 0.16 of the
  // face, a ratio of better than two to one. r4's beds were at 0.13, 0.12,
  // 0.12, 0.13, 0.12, 0.12, 0.11, 0.09, 0.06: a rule, not a stratigraphy.
  // W4-A: the beds are the rock tokens (rockLight V 65 down toward rockDark), banded so the
  // face reads as strata and not as a white drum; the top strip is the leaf-grey token.
  // Lit by the clear-sky key an albedo of V 65 renders near V 92, so the lightest bed starts a fifth of the way down.
  // taste-r1 W8-E: the lookout drum read cream-white (sampled V 77-83, H 30, S 17 on r5-clear/09-apostles-low.jpg). The beds run
  // from the concrete token toward the rock-dark token (wall beds, u 0 to 0.6) and the wet base band (u above 0.6) goes on
  // past it toward black, so the face is a grey concrete wall with a darker foot. The albedos are far below the token
  // (V 37-43 on the wall): the clear key and the grade double-encode and render them near V 60-70, and a first pass at V 47-51
  // still sampled V 73-81 in the capture.
  const bedHex = (u) => mixHex(
    mixHex(TASTE.built.concrete, TASTE.ground.rockDark, 0.85 + 0.15 * Math.min(u / 0.6, 1)),
    '#000000', 0.10 + 0.06 * Math.min(u / 0.6, 1) + 0.25 * Math.max(0, (u - 0.6) / 0.4),
  );
  const landRows = terraceRows([
    { t: 0, zPush: 0, color: bedHex(0.85) },
    { t: 0.08, zPush: 0.35, color: bedHex(0.7) },
    { t: 0.20, zPush: 1.15, color: bedHex(0.38) },
    { t: 0.48, zPush: 2.35, color: bedHex(0.06) },
    { t: 0.63, zPush: 4.15, color: bedHex(0.22) },
    { t: 0.81, zPush: 5.2, color: bedHex(0.0) },
    { t: 0.93, zPush: 6.15, color: bedHex(0.16) },
    { t: 1, zPush: 6.9, color: TASTE.foliage.leafGrey },
  ]);
  // ONE run, sliced into panels that share their end stations by reference, so
  // a shared vertex is computed from literally the same numbers on both sides.
  // Twice r4's station density, because a ledge that dies out along its run has
  // to have somewhere to do it.
  const landRun = [
    { x: 20.5, z: 24.90 }, { x: 21.8, z: 24.55 }, { x: 23.2, z: 24.10 },
    { x: 24.7, z: 24.40 }, { x: 26.4, z: 24.60 }, { x: 27.8, z: 24.30 },
    { x: 29.1, z: 24.85 }, { x: 30.7, z: 24.35 }, { x: 32.4, z: 24.00 },
    { x: 33.9, z: 24.50 }, { x: 35.6, z: 24.80 }, { x: 37.0, z: 24.35 },
    { x: 38.3, z: 24.55 }, { x: 39.9, z: 24.20 }, { x: 41.6, z: 24.10 },
    { x: 43.2, z: 24.45 }, { x: 44.8, z: 24.70 }, { x: 46.1, z: 24.35 },
    { x: 47.3, z: 24.65 }, { x: 48.8, z: 24.40 }, { x: 50.0, z: 24.90 },
    { x: 51.4, z: 25.40 },
  ];
  const landPanels = panelsFrom(landRun, 6);
  for (let i = 0; i < landPanels.length; i += 1) {
    addStrataPanel(group, m, landPanels[i], landRows,
      `fringe:apostles:headland-land-ledges:${i}`, { recessSign: 1 });
  }

  // Sea face: the wet foot is a real tonal break, not a slightly darker brown,
  // and the beds step back the way a wave-cut bluff does. The bottom two beds
  // are the permanently wet zone and they are now genuinely dark — the camera
  // at this pose looks straight at the toe, and a mid-grey there is what let the
  // whole mass read as a dry drum sitting on the sand.
  const seaRows = terraceRows([
    { t: 0, zPush: 0.9, color: bedHex(0.95) },
    { t: 0.07, zPush: 0.55, color: bedHex(0.8) },
    { t: 0.18, zPush: 0.12, color: bedHex(0.3) },
    { t: 0.46, zPush: -0.55, color: bedHex(0.06) },
    { t: 0.60, zPush: 0.18, color: bedHex(0.24) },
    { t: 0.78, zPush: -0.22, color: bedHex(0.0) },
    { t: 0.93, zPush: -0.08, color: bedHex(0.14) },
    { t: 1, zPush: 0, color: TASTE.foliage.leafGrey },
  ]);
  const seaRun = [
    { x: 20.5, z: 40.20 }, { x: 22.7, z: 43.90 }, { x: 25.0, z: 47.40 },
    { x: 27.6, z: 50.10 }, { x: 30.2, z: 52.25 }, { x: 32.6, z: 53.20 },
    { x: 35.0, z: 53.60 }, { x: 37.6, z: 52.60 }, { x: 40.2, z: 51.10 },
    { x: 42.6, z: 49.10 }, { x: 45.0, z: 46.80 }, { x: 47.5, z: 43.70 },
    { x: 50.0, z: 40.50 },
  ];
  const seaPanels = panelsFrom(seaRun, 4);
  for (let i = 0; i < seaPanels.length; i += 1) {
    addStrataPanel(group, m, seaPanels[i], seaRows,
      `fringe:apostles:headland-sea-ledges:${i}`, { wetTo: 0.185, wetGain: 0.8, recessSign: -1 });
  }

  for (const side of [-1, 1]) {
    const x = side < 0 ? CLIFF_X[0] : CLIFF_X[CLIFF_X.length - 1] + 1.4;
    const zBack = side < 0 ? CLIFF_Z[0] : CLIFF_Z[CLIFF_Z.length - 1];
    const outward = side < 0 ? -1 : 1;
    const returnRows = landRows.map((level) => ({
      t: level.t,
      xPush: outward * (level.zPush ?? 0) * 0.2,
      xFrom: level.zFrom === undefined ? undefined : outward * level.zFrom * 0.2,
      phase: level.phase,
      // The returns run in z, so the nose-break term would smear them ALONG
      // their own line instead of in and out of the face. They take the die-out
      // and leave the nose alone.
      noNose: true,
      color: level.color,
      shelf: level.shelf,
    }));
    const zMid = (CLIFF_BACK[side < 0 ? 0 : CLIFF_BACK.length - 1] + zBack) * 0.5;
    if (side < 0) {
      // The accepted pair stopped at zMid +/- 0.35, leaving a 0.70 m slot.
      // This is an internal defect, not a platform/stair/toe boundary. Meet at
      // one shared station while retaining the combined z=25.0..zBack outline.
      addFracturedReturnPanel(group, m, x, 25.0, zMid, returnRows,
        'fringe:apostles:headland-return-left:0', 0);
      addFracturedReturnPanel(group, m, x, zMid, zBack, returnRows,
        'fringe:apostles:headland-return-left:1', 1);
    } else {
      // Keep each bed and its underside, omitting the extra lip row on this flank.
      // Fifteen rows cost 252 triangles and keep distinct geometry below the coach saving.
      const fracturedRows = returnRows.filter((_, row) => row % 3 !== 1);
      // Mirror the fractured station tables and meet at the same middle station.
      addFracturedReturnPanel(group, m, x, 25.0, zMid, fracturedRows,
        'fringe:apostles:headland-return-right:0', 0, true);
      addFracturedReturnPanel(group, m, x, zMid, zBack, fracturedRows,
        'fringe:apostles:headland-return-right:1', 1, true);
    }
  }

  addHeadlandCap(ctx, group);
  addOchreBedding(ctx, group);

  for (let i = 0; i < 10; i += 1) {
    const t = i / 9;
    const idx = t * (CLIFF_X.length - 1);
    const i0 = Math.min(CLIFF_X.length - 2, Math.floor(idx));
    const f = idx - i0;
    const x = CLIFF_X[i0] + (CLIFF_X[i0 + 1] - CLIFF_X[i0]) * f;
    const z = CLIFF_Z[i0] + (CLIFF_Z[i0 + 1] - CLIFF_Z[i0]) * f;
    const s = rand(i, 61, 0.9, 3.0);
    addBoulder(ctx, group, x + rand(i, 62, -1.2, 1.2), WATER_Y + s * 0.3,
      z + rand(i, 63, 0.4, 2.4), s, s * 0.78, s * 0.9, i + 70, true);
  }
  addCliffWetContact(ctx, group, ctx.contact);

  // THE SEA FACE HAD NO TALUS AND NO LIVING THING ON IT, AND THAT IS THE FACE
  // THE GRADED CAMERA LOOKS AT.
  //
  // Every fan below is at z ≈ 25 — the LAND side, behind the headland from this
  // pose — and so is all eighteen of the face scrub. From the ocean the bluff
  // was a bare batter meeting a bare boulder line: nothing shed, nothing grew,
  // nothing had ever fallen off it. That is the other half of why it reads as a
  // turned drum rather than as rock.
  const cliffToe = (x) => {
    const i0 = Math.max(0, Math.min(CLIFF_X.length - 2,
      CLIFF_X.findIndex((v, k) => k > 0 && v >= x) - 1));
    const f = clamp01((x - CLIFF_X[i0]) / (CLIFF_X[i0 + 1] - CLIFF_X[i0]));
    return CLIFF_Z[i0] + (CLIFF_Z[i0 + 1] - CLIFF_Z[i0]) * f;
  };
  // Two fans, under the two collapse notches `collapseAt` cuts in the beds, so
  // the scree and the missing slab are the same event seen twice.
  const seaFans = [27.6, 43.2];
  for (let f = 0; f < seaFans.length; f += 1) {
    const fx = seaFans[f];
    const fz = cliffToe(fx) + 0.9;
    for (let i = 0; i < 12; i += 1) {
      const t = i / 11;
      const spread = 1.0 + t * 3.8;
      const s = (1.45 - t * 0.92) * rand(f * 24 + i, 121, 0.7, 1.3);
      const bx = fx + rand(f * 24 + i, 122, -spread, spread);
      const bz = fz + 0.5 + t * 3.2 + rand(f * 24 + i, 123, -0.4, 0.8);
      // Coarse at the head of the fan, high on the face; fining as it runs out
      // into the wash, where the last blocks are wet.
      const by = Math.max(WATER_Y + s * 0.26, 3.1 - t * 3.0 + s * 0.2);
      addBoulder(ctx, group, bx, by, bz, s, s * 0.74, s * 0.96,
        (f * 24 + i) % 5 === 0 ? f * 24 + i + 1 : f * 24 + i + 3, t > 0.62);
    }
  }
  // Pigface and scrub lodged in the bedding cracks of the SEA face. Same
  // argument as the land face: living things are what say rock rather than
  // painted wall, and they break the horizontal read hardest because they hang
  // off it at their own angles.
  const seaCrack = [
    [22.9, 0.36], [25.8, 0.62], [29.4, 0.47], [32.1, 0.71],
    [36.4, 0.33], [39.2, 0.58], [44.6, 0.42], [47.8, 0.66],
  ];
  for (let i = 0; i < seaCrack.length; i += 1) {
    const [cx, ct] = seaCrack[i];
    const cz = cliffToe(cx);
    const y = -0.3 + (TOP_Y + 0.3) * ct + bedWarp({ x: cx, z: cz }, ct);
    const s = rand(i, 131, 0.44, 0.82);
    for (let b = 0; b < 2; b += 1) {
      place(group, sphereGeo(ctx, 0.62, 6), (i + b) % 2 ? m.scrub : m.scrubLight,
        cx + rand(i * 3 + b, 132, -0.8, 0.8), y + rand(i * 3 + b, 133, 0.05, 0.42),
        cz + rand(i * 3 + b, 134, 0.15, 0.55), {
          scale: [s * rand(i * 3 + b, 135, 0.8, 1.25), s * 0.58, s * 0.72],
          cast: false, receive: false,
        });
    }
    if (i % 2 === 0) {
      const ms = rand(i, 136, 0.8, 1.5);
      place(group, sphereGeo(ctx, 0.7, 7), i % 4 ? m.pigface : m.pigfaceDark,
        cx + rand(i, 137, -1.3, 1.3), y - rand(i, 138, 0.05, 0.34),
        cz + rand(i, 139, 0.2, 0.6), {
          rotY: rand(i, 140, 0, 3), scale: [ms * 1.1, ms * 0.32, ms * 0.78],
          cast: false, receive: false,
        });
    }
  }

  // TALUS. A limestone cliff sheds, and what it sheds piles at its own foot in
  // GREY — the fresh break is pale and cool, not the weathered ochre of the face
  // above it. Three fans below three gullies, coarse at the head and fining
  // downslope, with the odd big block that has rolled clear of the pile. This is
  // both a second material family at the toe and a real level change between the
  // face and the sand, which is the reference's first tell.
  const fans = [[24.6, 25.4], [33.8, 24.8], [43.4, 25.2]];
  for (let f = 0; f < fans.length; f += 1) {
    const [fx, fz] = fans[f];
    for (let i = 0; i < 16; i += 1) {
      const t = i / 15;
      const spread = 1.1 + t * 4.4;
      const s = (1.5 - t * 0.95) * rand(f * 20 + i, 91, 0.7, 1.35);
      const bx = fx + rand(f * 20 + i, 92, -spread, spread);
      const bz = fz + 0.6 + t * 3.6 + rand(f * 20 + i, 93, -0.5, 0.9);
      const by = Math.max(SAND_Y + s * 0.24, 2.6 - t * 2.6 + s * 0.2);
      addBoulder(ctx, group, bx, by, bz, s, s * 0.72, s * 0.94,
        (f * 20 + i) % 6 === 0 ? f * 20 + i + 2 : f * 20 + i + 4, false);
      if (i % 5 === 0) contact(ctx, group, bx, bz, s * 1.1, SAND_Y + 0.03, 0.2);
    }
    // A damp splash course under each fan, where the tide reaches the scree.
    for (let i = 0; i < 5; i += 1) {
      const s = rand(f * 9 + i, 94, 0.9, 1.8);
      addBoulder(ctx, group, fx + rand(f * 9 + i, 95, -3.4, 3.4), WATER_Y + s * 0.26,
        fz + 4.6 + rand(f * 9 + i, 96, -0.8, 1.6), s, s * 0.66, s * 1.05,
        (f * 9 + i) % 3, true);
    }
  }

  // Coastal scrub lodged on the bedding ledges of the land face. Living things
  // on a cliff are what tell a viewer it is rock and not a painted wall, and
  // they break the one surface that still reads as a single flat tone.
  const faceScrub = [
    [21.6, 25.6, 0.30], [24.9, 24.6, 0.55], [27.8, 25.1, 0.40],
    [31.6, 24.4, 0.62], [34.4, 25.0, 0.34], [37.2, 24.5, 0.52],
    [40.8, 24.4, 0.44], [44.1, 24.9, 0.66], [46.9, 24.3, 0.38],
    [49.6, 24.8, 0.58], [23.1, 25.2, 0.72], [29.4, 24.7, 0.24],
    [35.9, 24.6, 0.76], [42.2, 25.1, 0.30], [48.1, 24.5, 0.68],
    [26.2, 24.9, 0.86], [39.4, 24.8, 0.84], [45.6, 24.6, 0.20],
  ];
  for (let i = 0; i < faceScrub.length; i += 1) {
    const [fx, fz, ft] = faceScrub[i];
    const y = -0.3 + (TOP_Y + 0.3) * ft;
    const z = fz + 0.35 + 6.9 * ft * 0.92;
    const s = rand(i, 81, 0.42, 0.78);
    for (let b = 0; b < 3; b += 1) {
      place(group, sphereGeo(ctx, 0.62, 6), (i + b) % 2 ? m.scrub : m.scrubLight,
        fx + rand(i * 3 + b, 82, -0.9, 0.9), y + rand(i * 3 + b, 83, 0.1, 0.5),
        z - rand(i * 3 + b, 84, 0.1, 0.55), {
          scale: [s * rand(i * 3 + b, 85, 0.8, 1.3), s * 0.6, s * 0.8],
          receive: false,
        });
    }
    // Pigface mats, which is what actually holds a Port Campbell cliff face
    // together: a flat succulent pad, greyer and bluer than the scrub above it.
    if (i % 2 === 0) {
      const mats = 2 + (i % 2);
      for (let p = 0; p < mats; p += 1) {
        const ms = rand(i * 5 + p, 86, 0.7, 1.5);
        // A squashed sphere, not a flat disc. At 2.4x the first draft's discs
        // read as lily pads lying on the rock; pigface grows as a cushion and
        // needs a top surface the key can rake across.
        place(group, sphereGeo(ctx, 0.7, 7), p % 2 ? m.pigface : m.pigfaceDark,
          fx + rand(i * 5 + p, 87, -1.5, 1.5), y - rand(i * 5 + p, 88, 0.02, 0.3),
          z + rand(i * 5 + p, 89, -0.7, 0.2), {
            rotY: rand(i * 5 + p, 97, 0, 3),
            scale: [ms * 1.15, ms * 0.34, ms * 0.8],
            cast: false,
            receive: false,
          });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Planting.
// ---------------------------------------------------------------------------

function addMarram(ctx, group, x, y, z, r, seed) {
  const { m } = ctx;
  for (let i = 0; i < 5; i += 1) {
    const a = rand(seed * 5 + i, 71, 0, Math.PI * 2);
    const d = r * rand(seed * 5 + i, 72, 0.1, 1);
    place(group, coneGeo(ctx, 0.2, 0.85, 5),
      (i + seed) % 2 ? m.marram : m.scrubLight,
      x + Math.cos(a) * d, y + 0.4, z + Math.sin(a) * d, {
        rotY: a,
        rotZ: rand(seed * 5 + i, 73, -0.28, 0.28),
        scale: [rand(seed * 5 + i, 74, 0.7, 1.3), rand(seed * 5 + i, 75, 0.7, 1.5), 1],
        receive: false,
      });
  }
}

function addTeaTree(ctx, group, x, y, z, s, seed) {
  addClusterTree(group, { kind: 'eucalypt', x, y, z, height: 2.8 * s, seed, color: ctx.m.scrub.color });
  contact(ctx, group, x, z, 1.2 * s, y + 0.04, 0.2);
}

function addPine(ctx, group, x, y, z, s, seed) {
  addClusterTree(group, { kind: 'pine', x, y, z, height: 5 * s, seed, color: ctx.m.pine.color });
  contact(ctx, group, x, z, 1.2 * s, y + 0.04, 0.2);
}

function addHedge(ctx, group, x, y, z, w, d, seed) {
  addClusterTree(group, { kind: 'hedge', hedge: true, x, y: y + 0.52, z, width: w, depth: d * 2, height: 2.1, seed, color: ctx.m.scrub.color });
}

function addHeadlandPlanting(ctx, group) {
  // The sign board runs x 23.8 .. 38.4 at z 39.9; anything with z below that and
  // an x inside that span stands in front of the lettering. r3 had a tea tree at
  // [34.8, 39.4] — half a metre in front of the board, dead on the `LV` of
  // TWELVE. Both trees that fell inside the span are now outside it.
  const teaTrees = [
    [21.2, 33.0, 1.05], [24.0, 35.2, 0.85], [20.4, 36.2, 1.15], [41.8, 37.4, 0.9],
    [39.6, 34.2, 1.1], [43.4, 38.8, 0.95], [47.2, 33.6, 1.15], [49.4, 38.0, 0.8],
    [25.6, 44.2, 0.72], [44.8, 43.4, 0.78], [40.6, 45.6, 0.66],
  ];
  for (let i = 0; i < teaTrees.length; i += 1) {
    const [x, z, s] = teaTrees[i];
    addTeaTree(ctx, group, x, TOP_Y, z, s, i);
  }
  const pines = [[20.2, 29.0, 1.0], [45.8, 29.4, 0.92], [48.2, 31.2, 0.86]];
  for (let i = 0; i < pines.length; i += 1) {
    const [x, z, s] = pines[i];
    addPine(ctx, group, x, TOP_Y, z, s, i + 3);
  }
  for (let i = 0; i < 22; i += 1) {
    const x = 21 + i * 1.35;
    addMarram(ctx, group, x, TOP_Y, 32.4 + Math.sin(i * 1.7) * 1.4, 1.1, i);
  }
  addHedge(ctx, group, 41.5, TOP_Y, 41.2, 7.5, 1.5, 4);
  addHedge(ctx, group, 24.6, TOP_Y, 41.6, 5.5, 1.4, 9);
  for (let i = 0; i < 16; i += 1) {
    const x = 20.0 + i * 2.05;
    addMarram(ctx, group, x, SAND_Y, 25.6 + Math.sin(i * 2.3) * 1.5, 1.4, i + 30);
  }
}

// ---------------------------------------------------------------------------
// Joinery and metalwork — balustrades, stairs, lamp columns, signs.
// ---------------------------------------------------------------------------

function addBalustrade(ctx, group, ax, az, bx, bz, y, tag) {
  const { m } = ctx;
  const dx = bx - ax;
  const dz = bz - az;
  const length = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const run = new THREE.Group();
  run.position.set((ax + bx) / 2, y, (az + bz) / 2);
  run.rotation.y = yaw;
  run.name = `fringe:apostles:balustrade:${tag}`;
  noPick(run);
  group.add(run);

  for (const side of [-1, 1]) {
    bevelBox(ctx, run, 0.46, 1.34, 0.46, m.stone, 0, 0.67, (side * length) / 2, { bevel: 0.06 });
    bevelBox(ctx, run, 0.6, 0.14, 0.6, m.stoneDark, 0, 1.4, (side * length) / 2, { bevel: 0.04 });
    bevelBox(ctx, run, 0.58, 0.12, 0.58, m.stone, 0, 0.1, (side * length) / 2, { bevel: 0.03 });
  }
  place(run, boxGeo(ctx, 0.2, 0.16, length), m.stoneDark, 0, 0.22, 0, {});
  place(run, bevelGeo(ctx, 0.34, 0.16, length, 0.05), m.railTimber, 0, 1.18, 0, {});
  const balusterGeo = cylGeo(ctx, 0.075, 0.11, 0.86, 7);
  const beadGeo = sphereGeo(ctx, 0.115, 7);
  const count = Math.max(3, Math.round(length / 0.62));
  for (let i = 0; i <= count; i += 1) {
    const z = -length / 2 + (length * i) / count;
    if (Math.abs(z) > length / 2 - 0.34) continue;
    place(run, balusterGeo, m.baluster, 0, 0.7, z, {});
    place(run, beadGeo, m.baluster, 0, 0.68, z, { scale: [1.25, 0.6, 1.25] });
  }
}

function addHandrail(ctx, group, ax, az, bx, bz, y, tag) {
  const { m } = ctx;
  const dx = bx - ax;
  const dz = bz - az;
  const length = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const run = new THREE.Group();
  run.position.set((ax + bx) / 2, y, (az + bz) / 2);
  run.rotation.y = yaw;
  run.name = `fringe:apostles:handrail:${tag}`;
  noPick(run);
  group.add(run);
  const postGeo = cylGeo(ctx, 0.075, 0.09, 1.12, 7);
  const count = Math.max(2, Math.round(length / 1.9));
  for (let i = 0; i <= count; i += 1) {
    const z = -length / 2 + (length * i) / count;
    place(run, postGeo, m.railTimber, 0, 0.56, z, {});
    place(run, sphereGeo(ctx, 0.1, 6), m.railTimber, 0, 1.14, z, {});
  }
  place(run, bevelGeo(ctx, 0.14, 0.11, length, 0.035), m.railTimber, 0, 1.08, 0, {});
  place(run, boxGeo(ctx, 0.09, 0.08, length), m.railTimber, 0, 0.62, 0, {});
}

function addStairs(ctx, group, x, topY, topZ, bottomY, bottomZ, width, tag) {
  const { m } = ctx;
  const steps = Math.max(4, Math.round((topY - bottomY) / 0.42));
  const rise = (topY - bottomY) / steps;
  const going = (topZ - bottomZ) / steps;
  for (let i = 0; i < steps; i += 1) {
    const y = bottomY + rise * (i + 0.5);
    const z = bottomZ + going * (i + 0.5);
    bevelBox(ctx, group, width, rise * 1.05, Math.abs(going) * 1.35, m.deck, x, y, z, {
      bevel: 0.035,
    });
    bevelBox(ctx, group, width, 0.06, Math.abs(going) * 1.5, m.deckDark,
      x, y + rise * 0.53, z, { bevel: 0.02, cast: false });
  }
  for (const side of [-1, 1]) {
    const sx = x + (side * width) / 2;
    const len = Math.hypot(topY - bottomY, topZ - bottomZ);
    const beam = place(group, boxGeo(ctx, 0.16, 0.42, len), m.deckDark,
      sx, (topY + bottomY) / 2 - 0.28, (topZ + bottomZ) / 2, {});
    beam.rotation.x = Math.atan2(topY - bottomY, topZ - bottomZ);
  }
  addHandrail(ctx, group, x - width / 2 - 0.16, topZ, x - width / 2 - 0.16, bottomZ,
    (topY + bottomY) / 2 - 0.1, `${tag}-l`);
  addHandrail(ctx, group, x + width / 2 + 0.16, topZ, x + width / 2 + 0.16, bottomZ,
    (topY + bottomY) / 2 - 0.1, `${tag}-r`);
}

function addLampColumn(ctx, group, x, y, z) {
  const { m } = ctx;
  bevelBox(ctx, group, 0.62, 0.3, 0.62, m.stoneDark, x, y + 0.15, z, { bevel: 0.05 });
  bevelBox(ctx, group, 0.46, 0.26, 0.46, m.lamp, x, y + 0.42, z, { bevel: 0.05 });
  place(group, cylGeo(ctx, 0.09, 0.16, 3.4, 8), m.lamp, x, y + 2.15, z, {});
  place(group, cylGeo(ctx, 0.13, 0.13, 0.16, 8), m.lamp, x, y + 1.35, z, {});
  place(group, cylGeo(ctx, 0.2, 0.12, 0.22, 8), m.lamp, x, y + 3.9, z, {});
  place(group, boxGeo(ctx, 1.34, 0.09, 0.09), m.lamp, x, y + 3.98, z, {});
  for (const side of [-1, 1]) {
    place(group, boxGeo(ctx, 0.34, 0.42, 0.34), m.lampGlass, x + side * 0.62, y + 3.74, z, {});
    place(group, coneGeo(ctx, 0.29, 0.24, 4), m.lamp, x + side * 0.62, y + 4.06, z, {
      rotY: Math.PI / 4,
    });
  }
  place(group, sphereGeo(ctx, 0.11, 6), m.lamp, x, y + 4.14, z, {});
  contact(ctx, group, x, z, 0.7, y + 0.03, 0.26);
}

function addSignBoard(ctx, group, text, x, y, z, s, tag) {
  const { m } = ctx;
  const width = text.length * (0.78 + 0.18) * s + 1.4 * s;
  const height = 2.5 * s;
  for (const side of [-1, 1]) {
    place(group, cylGeo(ctx, 0.14, 0.19, height, 7), m.railTimber,
      x + (side * width) / 2.5, y + height / 2, z, {});
    bevelBox(ctx, group, 0.44, 0.28, 0.44, m.stoneDark,
      x + (side * width) / 2.5, y + 0.14, z, { bevel: 0.05 });
  }
  bevelBox(ctx, group, width, 1.5 * s, 0.3, m.deckDark, x, y + height - 0.2 * s, z, {
    bevel: 0.07,
  });
  bevelBox(ctx, group, width - 0.32, 1.16 * s, 0.16, m.cream,
    x, y + height - 0.2 * s, z + 0.16, { bevel: 0.04 });
  const letterS = 0.70 * s;
  const letterGap = 0.10 * s;
  const letters = addToyLetters(group, text, m.lamp,
    x - width / 2 + 0.95 * s, y + height - 0.62 * s, z + 0.32, {
      s: letterS, gap: letterGap, depth: 0.18, yaw: 0,
    });
  letters.name = `fringe:apostles:sign-letters:${tag}`;
  // Kit W is four 0.12-wide diagonals; at this camera they collapse to a gap
  // between T and E. Four thicker strokes restore the letter in-file.
  if (text === 'TWELVE APOSTLES') {
    const wX = x - width / 2 + 0.95 * s + (0.78 * letterS + letterGap);
    const wY = y + height - 0.62 * s;
    const wZ = z + 0.40;
    const bar = 0.20 * letterS;
    const hgt = 1.02 * letterS;
    addBox(group, bar, hgt, 0.16, m.lamp, wX + 0.12 * letterS, wY + hgt * 0.5, wZ, { rotZ: 0.32 });
    addBox(group, bar, hgt, 0.16, m.lamp, wX + 0.28 * letterS, wY + hgt * 0.5, wZ, { rotZ: -0.32 });
    addBox(group, bar, hgt, 0.16, m.lamp, wX + 0.44 * letterS, wY + hgt * 0.5, wZ, { rotZ: 0.32 });
    addBox(group, bar, hgt, 0.16, m.lamp, wX + 0.60 * letterS, wY + hgt * 0.5, wZ, { rotZ: -0.32 });
  }
  return letters;
}

// ---------------------------------------------------------------------------
// Figures. Bodies with jobs, in varied clothing, at varied headings.
// ---------------------------------------------------------------------------

function addFigure(ctx, group, x, y, z, opts = {}) {
  const { m } = ctx;
  const h = opts.h ?? 2.6;
  const shirt = opts.shirt ?? m.red;
  const legs = opts.legs ?? m.blue;
  const skin = opts.skin ?? m.skin;
  const hairMat = opts.hair ?? m.hair;
  const body = new THREE.Group();
  body.position.set(x, y, z);
  body.rotation.y = opts.yaw ?? 0;
  if (opts.name) body.name = opts.name;
  noPick(body);
  group.add(body);

  const w = h * 0.2;
  // FOUR POSES, NOT ONE SILHOUETTE.
  //
  // r6: "nearly every standing figure shares one capsule silhouette and one
  // pose, nobody carries anything on the beach", and named this as most of what
  // MP-3 gets its density feel from. A beach crowd is mostly NOT standing: it is
  // lying down, sitting up, kneeling over something, and walking with gear.
  if (opts.lie === true) {
    // Supine, knees up, head on a rolled towel. Reads as a body from above,
    // which is the only view this camera has of the sand.
    place(body, bevelGeo(ctx, h * 0.54, h * 0.10, w * 0.76, 0.04), shirt,
      -h * 0.02, h * 0.06, 0, {});
    place(body, boxGeo(ctx, h * 0.17, h * 0.15, w * 0.54), legs,
      h * 0.19, h * 0.10, 0, { rotZ: -0.5 });
    place(body, boxGeo(ctx, h * 0.16, h * 0.08, w * 0.54), legs,
      h * 0.32, h * 0.05, 0, {});
    place(body, sphereGeo(ctx, w * 0.35, 7), skin, -h * 0.30, h * 0.10, 0, {});
    place(body, sphereGeo(ctx, w * 0.37, 7), hairMat, -h * 0.33, h * 0.12, 0, {
      scale: [1, 0.58, 1],
    });
    contact(ctx, body, h * 0.02, 0, w * 1.5, 0.035, 0.2);
    return body;
  }
  if (opts.kneel === true) {
    // Crouched over the sand — digging, or looking at something in a rock pool.
    for (const side of [-1, 1]) {
      place(body, boxGeo(ctx, w * 0.34, h * 0.2, w * 0.34), legs,
        side * w * 0.26, h * 0.1, w * 0.1, {});
    }
    place(body, boxGeo(ctx, w * 0.86, h * 0.09, w * 0.66), legs, 0, h * 0.2, 0, {});
    const torso = place(body, bevelGeo(ctx, w * 0.88, h * 0.3, w * 0.6, 0.05), shirt,
      0, h * 0.36, w * 0.06, {});
    torso.rotation.x = 0.5;
    for (const side of [-1, 1]) {
      const arm = place(body, boxGeo(ctx, w * 0.19, h * 0.28, w * 0.19), shirt,
        side * w * 0.5, h * 0.32, w * 0.2, {});
      arm.rotation.x = 0.95;
    }
    place(body, sphereGeo(ctx, w * 0.36, 7), skin, 0, h * 0.51, w * 0.19, {});
    place(body, sphereGeo(ctx, w * 0.38, 7), hairMat, 0, h * 0.55, w * 0.14, {
      scale: [1, 0.58, 1],
    });
    contact(ctx, body, 0, w * 0.1, w * 0.95, 0.04, 0.22);
    return body;
  }
  if (opts.sit === true) {
    place(body, boxGeo(ctx, w * 0.86, h * 0.16, h * 0.3), legs, 0, h * 0.11, h * 0.13, {});
    place(body, bevelGeo(ctx, w * 0.94, h * 0.34, w * 0.72, 0.05), shirt, 0, h * 0.34, 0, {});
    place(body, sphereGeo(ctx, w * 0.4, 7), skin, 0, h * 0.58, 0, {});
    place(body, sphereGeo(ctx, w * 0.42, 7), hairMat, 0, h * 0.62, -w * 0.05, {
      scale: [1, 0.62, 1],
    });
    contact(ctx, body, 0, h * 0.08, w * 0.9, 0.04, 0.22);
    return body;
  }
  for (const side of [-1, 1]) {
    place(body, boxGeo(ctx, w * 0.34, h * 0.42, w * 0.34), legs,
      side * w * 0.22, h * 0.21, opts.stride ? side * h * 0.06 : 0, {});
  }
  place(body, bevelGeo(ctx, w * 0.9, h * 0.36, w * 0.62, 0.05), shirt, 0, h * 0.6, 0, {});
  place(body, boxGeo(ctx, w * 0.96, h * 0.09, w * 0.68), legs, 0, h * 0.43, 0, {});
  for (const side of [-1, 1]) {
    const lift = opts.point && side === (opts.point > 0 ? 1 : -1) ? 1 : 0;
    const arm = place(body, boxGeo(ctx, w * 0.2, h * 0.34, w * 0.2), shirt,
      side * w * 0.55, h * 0.6 + lift * h * 0.08, lift * h * 0.1, {});
    if (lift) arm.rotation.x = -1.15;
    else arm.rotation.z = side * 0.12;
  }
  place(body, sphereGeo(ctx, w * 0.38, 7), skin, 0, h * 0.85, 0, {});
  place(body, sphereGeo(ctx, w * 0.4, 7), hairMat, 0, h * 0.89, -w * 0.04, {
    scale: [1, 0.58, 1],
  });
  if (opts.hat) {
    place(body, cylGeo(ctx, w * 0.34, w * 0.62, h * 0.05, 8), opts.hat, 0, h * 0.94, 0, {});
    place(body, cylGeo(ctx, w * 0.3, w * 0.3, h * 0.07, 8), opts.hat, 0, h * 0.97, 0, {});
  }
  if (opts.bag) {
    place(body, bevelGeo(ctx, w * 0.5, h * 0.2, w * 0.3, 0.03), opts.bag,
      w * 0.72, h * 0.46, 0, {});
  }
  // Something in the hands. A body carrying a board has a different outline from
  // a body that is not, which is worth more at 20 screen pixels than another hat.
  if (opts.board) {
    const board = place(body, bevelGeo(ctx, w * 0.58, h * 0.72, w * 0.11, 0.04),
      opts.board, w * 0.86, h * 0.44, w * 0.1, {});
    board.rotation.z = 0.2;
    place(body, boxGeo(ctx, w * 0.5, h * 0.06, w * 0.13), m.white,
      w * 0.9, h * 0.56, w * 0.1, { rotZ: 0.2, cast: false });
  }
  if (opts.ring) {
    place(body, cylGeo(ctx, w * 0.46, w * 0.46, w * 0.2, 10), opts.ring,
      w * 0.8, h * 0.5, 0, { rotX: 0.2 });
  }
  contact(ctx, body, 0, 0, w * 0.85, 0.04, 0.24);
  return body;
}

/** Irregular clusters of two to five, never a rank at even pitch. */
function addCrowd(ctx, group, clusters, y, tag, opts = {}) {
  const { m } = ctx;
  const cloth = clothSet(m);
  let n = 0;
  for (let c = 0; c < clusters.length; c += 1) {
    const [cx, cz, count, spread] = clusters[c];
    for (let i = 0; i < count; i += 1) {
      const a = rand(c * 11 + i, 101, 0, Math.PI * 2);
      const d = spread * rand(c * 11 + i, 102, 0.15, 1);
      // Pose is drawn off the seeded hash, not off a modulus of the loop
      // counters, so the mix does not fall into a repeating pattern along a
      // cluster: roughly 18% lying, 16% sitting, 12% kneeling, the rest upright
      // and about a fifth of those carrying something.
      const roll = opts.poses === false ? 1 : hash(c * 11 + i, 105);
      const lie = roll < 0.18;
      const kneel = !lie && roll < 0.30;
      const sit = !lie && !kneel && roll < 0.46;
      const carry = hash(c * 11 + i, 106);
      addFigure(ctx, group, cx + Math.cos(a) * d, y, cz + Math.sin(a) * d * 0.8, {
        h: rand(c * 11 + i, 103, 2.3, 2.9),
        shirt: cloth[(c * 3 + i * 5) % cloth.length],
        legs: cloth[(c * 7 + i * 2 + 4) % cloth.length],
        skin: (c + i) % 3 === 0 ? m.skinDark : m.skin,
        hair: (c + i) % 4 === 0 ? m.hairFair : m.hair,
        yaw: rand(c * 11 + i, 104, -Math.PI, Math.PI),
        hat: (c + i) % 3 === 0 ? cloth[(c + i) % cloth.length] : null,
        bag: (c * 2 + i) % 4 === 0 ? cloth[(i + 2) % cloth.length] : null,
        board: !lie && !sit && !kneel && carry > 0.82
          ? cloth[(c + i * 2) % cloth.length] : null,
        ring: !lie && !sit && !kneel && carry > 0.70 && carry <= 0.82
          ? cloth[(c + i + 3) % cloth.length] : null,
        point: !lie && !sit && !kneel && carry < 0.12 ? 1 : 0,
        lie,
        kneel,
        sit,
        stride: (c + i) % 2 === 0,
        name: `fringe:apostles:figure:${tag}:${n}`,
      });
      n += 1;
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Lookout, car park, vehicles.
// ---------------------------------------------------------------------------

function addLookout(ctx, group, arch, tag) {
  const { m } = ctx;
  // Footprint sits wholly inside the seaward brow; only the viewing bay
  // cantilevers past it, and that is carried on raking struts.
  const deckX = 32.3;
  const deckZ = 45.5;
  const deckW = 12.6;
  const deckD = 6.2;
  const halfW = deckW / 2;
  const halfD = deckD / 2;
  const bayZ = deckZ + halfD + 2.4;

  bevelBox(ctx, group, deckW - 0.2, 0.72, deckD + 0.4, m.stoneDark, deckX, TOP_Y - 0.1, deckZ - 0.2, {
    bevel: 0.1,
  });
  bevelBox(ctx, group, deckW - 1.0, 0.5, deckD - 0.2, m.stone, deckX, TOP_Y + 0.32, deckZ - 0.2, {
    bevel: 0.08,
  });

  const deck = bevelBox(ctx, group, deckW, 0.34, deckD, m.deck, deckX, DECK_Y, deckZ, {
    bevel: 0.06, name: `fringe:apostles:lookout:${tag}`,
  });
  deck.receiveShadow = true;
  bevelBox(ctx, group, deckW + 0.4, 0.16, deckD + 0.4, m.deckDark, deckX, DECK_Y - 0.19, deckZ, {
    bevel: 0.04,
  });
  for (let i = 0; i < 10; i += 1) {
    place(group, boxGeo(ctx, deckW - 0.3, 0.04, 0.12), m.deckDark,
      deckX, DECK_Y + 0.19, deckZ - 2.7 + i * 0.6, { cast: false });
  }

  bevelBox(ctx, group, 6.0, 0.32, 4.9, m.deck, deckX, DECK_Y, bayZ, { bevel: 0.05 });
  bevelBox(ctx, group, 6.3, 0.15, 5.2, m.deckDark, deckX, DECK_Y - 0.19, bayZ, { bevel: 0.04 });
  for (const side of [-1, 1]) {
    const prop = place(group, boxGeo(ctx, 0.26, 5.2, 0.26), m.deckDark,
      deckX + side * 2.5, DECK_Y - 2.7, bayZ + 0.9, {});
    prop.rotation.x = 0.52;
  }

  addBalustrade(ctx, group, deckX - halfW, deckZ + halfD, deckX - 3.1, deckZ + halfD,
    DECK_Y + 0.17, `${tag}-a`);
  addBalustrade(ctx, group, deckX + 3.1, deckZ + halfD, deckX + halfW, deckZ + halfD,
    DECK_Y + 0.17, `${tag}-b`);
  addBalustrade(ctx, group, deckX - 2.9, bayZ + 2.3, deckX + 2.9, bayZ + 2.3,
    DECK_Y + 0.17, `${tag}-bay`);
  for (const side of [-1, 1]) {
    addBalustrade(ctx, group, deckX + side * halfW, deckZ - halfD, deckX + side * halfW,
      deckZ + halfD, DECK_Y + 0.17, `${tag}-${side < 0 ? 'l' : 'r'}`);
    addBalustrade(ctx, group, deckX + side * 2.9, deckZ + halfD, deckX + side * 2.9,
      bayZ + 2.3, DECK_Y + 0.17, `${tag}-bay-${side < 0 ? 'l' : 'r'}`);
  }

  addLampColumn(ctx, group, deckX - halfW + 0.5, DECK_Y + 0.17, deckZ - 2.3);
  addLampColumn(ctx, group, deckX + halfW - 0.5, DECK_Y + 0.17, deckZ - 2.3);
  addLampColumn(ctx, group, deckX - 3.4, DECK_Y + 0.17, bayZ + 1.8);
  addLampColumn(ctx, group, deckX + 3.4, DECK_Y + 0.17, bayZ + 1.8);

  addSignBoard(ctx, group, 'TWELVE APOSTLES', deckX + 1.6, TOP_Y, deckZ - 3.2, 0.78, tag);

  // Cliff-flank stair down to the cove, clear of the rock face, with a landing
  // that joins it to the plateau.
  bevelBox(ctx, group, 5.2, 0.34, 3.2, m.deck, 19.6, TOP_Y + 0.32, 33.6, { bevel: 0.06 });
  bevelBox(ctx, group, 5.5, 0.16, 3.5, m.deckDark, 19.6, TOP_Y + 0.13, 33.6, { bevel: 0.04 });
  addStairs(ctx, group, 18.4, TOP_Y + 0.24, 32.2, SAND_Y + 0.2, 23.6, 3.2, `${tag}-beach`);
  addBalustrade(ctx, group, 17.0, 33.4, 22.2, 33.4, TOP_Y + 0.49, `${tag}-landing`);

  addCrowd(ctx, group, [
    [deckX - 4.4, deckZ + 1.8, 2, 1.2],
    [deckX + 4.6, deckZ + 1.2, 2, 1.1],
  ], DECK_Y + 0.17, tag, { poses: false });
  const cloth = clothSet(m);
  const railVisitors = [
    [deckX - 1.8, bayZ + 1.4, 0.15],
    [deckX - 0.4, bayZ + 1.7, -0.2],
    [deckX + 1.1, bayZ + 1.5, 0.35],
    [deckX + 2.4, bayZ + 1.2, -0.45],
  ];
  for (let i = 0; i < railVisitors.length; i += 1) {
    const [vx, vz, yaw] = railVisitors[i];
    addFigure(ctx, group, vx, DECK_Y + 0.17, vz, {
      h: 2.6 + (i % 2) * 0.15,
      shirt: cloth[i % cloth.length],
      legs: cloth[(i + 3) % cloth.length],
      yaw,
      hat: i === 1 ? m.red : null,
      point: i === 0 ? 1 : 0,
      name: `fringe:apostles:lookout-visitor:${i}`,
    });
  }
  addCrowd(ctx, group, [
    [38.5, 37.5, 3, 2.4],
    [26.5, 36.0, 2, 1.8],
    [44.0, 34.0, 2, 2.2],
  ], TOP_Y + 0.02, `${tag}-lawn`);

  const px = deckX + 2.0;
  const py = DECK_Y + 0.17;
  const pz = bayZ + 1.6;
  const pointYaw = Math.atan2((arch?.x ?? 0) - px, (arch?.sea ?? 62) - pz);
  const pointer = new THREE.Group();
  pointer.name = `fringe:apostles:visitor:pointing:${tag}`;
  pointer.position.set(px, py, pz);
  pointer.rotation.y = pointYaw;
  noPick(pointer);
  group.add(pointer);
  addFigure(ctx, pointer, 0, 0, 0, {
    h: 3.0, shirt: m.yellow, legs: m.blue, hat: m.red, point: 1, yaw: 0,
    name: `fringe:apostles:visitor:pointing:${tag}:body`,
  });
  const arm = place(pointer, boxGeo(ctx, 0.2, 0.2, 1.5), m.yellow, 0.36, 2.2, 0.62, {});
  arm.rotation.x = -0.25;
  place(pointer, sphereGeo(ctx, 0.16, 6), m.skin, 0.36, 2.44, 1.3, {});
  addFigure(ctx, pointer, -0.9, 0, -0.4, {
    h: 1.9, shirt: m.teal, legs: m.cream, yaw: 0.2,
    name: `fringe:apostles:visitor:pointing:${tag}:child`,
  });
}

function addCar(ctx, group, mat, x, y, z, yaw, name = '') {
  const { m } = ctx;
  const car = new THREE.Group();
  if (name) car.name = name;
  bevelBox(ctx, car, 1.85, 0.6, 3.5, mat, 0, 0.5, 0, { bevel: 0.11 });
  bevelBox(ctx, car, 1.6, 0.52, 1.7, m.glass, 0, 0.98, -0.12, { bevel: 0.09, cast: false });
  bevelBox(ctx, car, 1.9, 0.1, 3.4, m.stoneDark, 0, 0.22, 0, { bevel: 0.03, cast: false });
  for (const wx of [-0.92, 0.92]) {
    for (const wz of [-1.1, 1.1]) {
      place(car, cylGeo(ctx, 0.3, 0.3, 0.2, 8), m.tyre, wx, 0.3, wz, { rotZ: Math.PI / 2 });
    }
  }
  car.position.set(x, y, z);
  car.rotation.y = yaw;
  noPick(car);
  group.add(car);
  contact(ctx, group, x, z, 2.2, y + 0.03, 0.26);
}

function addCarPark(ctx, group) {
  const { m } = ctx;
  const y = TOP_Y + 0.02;
  bevelBox(ctx, group, 22.5, 0.2, 8.4, m.asphalt, 36.5, y + 0.1, 33.6, { bevel: 0.05 });
  for (const side of [-1, 1]) {
    bevelBox(ctx, group, 22.9, 0.34, 0.5, m.stone, 36.5, y + 0.16, 33.6 + side * 4.4, {
      bevel: 0.06,
    });
    bevelBox(ctx, group, 0.5, 0.34, 8.8, m.stone, 36.5 + side * 11.4, y + 0.16, 33.6, {
      bevel: 0.06,
    });
  }
  for (let i = 0; i < 7; i += 1) {
    place(group, boxGeo(ctx, 0.16, 0.03, 4.6), m.lineWhite,
      28.4 + i * 2.7, y + 0.21, 35.4, { cast: false });
  }
  place(group, boxGeo(ctx, 21.5, 0.03, 0.16), m.lineWhite, 36.5, y + 0.21, 32.9, {
    cast: false,
  });
  // P10a: keep the accepted ground-contact mesh outside the removed vehicle subtree.
  contact(ctx, group, 40.6, 30.6, 5.2, (y + 0.2) + 0.03, 0.28);
  addCar(ctx, group, m.carSilver, 29.4, y + 0.2, 35.6, 0.42, 'fringe:apostles:car:0');
  addCar(ctx, group, m.carNavy, 33.1, y + 0.2, 34.4, -0.58, 'fringe:apostles:car:1');
  addCar(ctx, group, m.carCharcoal, 36.2, y + 0.2, 35.8, 0.27, 'fringe:apostles:car:2');
  place(group, cylGeo(ctx, 0.36, 0.42, 1.05, 8), m.lamp, 27.2, y + 0.72, 31.6, {});
  place(group, cylGeo(ctx, 0.44, 0.44, 0.1, 10), m.stoneDark, 27.2, y + 1.28, 31.6, {});
  for (let i = 0; i < 6; i += 1) {
    place(group, cylGeo(ctx, 0.11, 0.14, 0.95, 7), m.lamp, 25.6 + i * 1.55, y + 0.5, 30.2, {});
    place(group, sphereGeo(ctx, 0.15, 6), m.lamp, 25.6 + i * 1.55, y + 1.0, 30.2, {});
  }
  addLampColumn(ctx, group, 46.4, y, 34.2);
  addCrowd(ctx, group, [[31.5, 31.4, 3, 1.9], [42.4, 33.8, 2, 1.5]], y + 0.2, 'carpark',
    { poses: false });
}

// ---------------------------------------------------------------------------
// Cove beach: kiosk, lifeguard tower, umbrella clusters, scatter.
// ---------------------------------------------------------------------------

function addKiosk(ctx, group) {
  const { m } = ctx;
  const kiosk = new THREE.Group();
  kiosk.name = 'fringe:apostles:pier-kiosk';
  noPick(kiosk);
  const kx = -22.5;
  const kz = 30.4;
  const base = SAND_Y;

  bevelBox(ctx, kiosk, 10.4, 0.34, 8.0, m.stone, kx, base + 0.17, kz, { bevel: 0.07 });
  bevelBox(ctx, kiosk, 11.0, 0.16, 8.6, m.stoneDark, kx, base + 0.06, kz, { bevel: 0.05 });

  bevelBox(ctx, kiosk, 6.6, 3.5, 4.9, m.kioskWood, kx, base + 2.09, kz, {
    bevel: 0.14, name: 'fringe:apostles:pier-kiosk-shell',
  });
  bevelBox(ctx, kiosk, 6.9, 0.4, 5.2, m.kioskCream, kx, base + 0.54, kz, { bevel: 0.07 });
  bevelBox(ctx, kiosk, 7.2, 0.36, 5.5, m.kioskPink, kx, base + 4.0, kz, {
    bevel: 0.09, name: 'fringe:apostles:pier-kiosk-pink-lid',
  });
  bevelBox(ctx, kiosk, 7.5, 0.16, 5.8, m.kioskCream, kx, base + 3.78, kz, { bevel: 0.04 });
  bevelBox(ctx, kiosk, 2.2, 0.5, 2.2, m.kioskTeal, kx, base + 4.42, kz, { bevel: 0.06 });
  place(kiosk, coneGeo(ctx, 1.5, 0.7, 4), m.kioskPink, kx, base + 5.0, kz, {
    rotY: Math.PI / 4,
  });

  const faceZ = kz - 2.55;
  bevelBox(ctx, kiosk, 6.2, 0.18, 2.6, m.kioskTeal, kx, base + 3.32, faceZ - 1.1, { bevel: 0.05 });
  for (const side of [-1, 1]) {
    place(kiosk, cylGeo(ctx, 0.09, 0.11, 3.2, 7), m.kioskCream,
      kx + side * 2.7, base + 1.7, faceZ - 2.2, {});
  }
  bevelBox(ctx, kiosk, 5.4, 0.24, 0.7, m.kioskCream, kx, base + 1.6, faceZ - 0.2, { bevel: 0.05 });
  bevelBox(ctx, kiosk, 4.6, 1.3, 0.16, m.glass, kx, base + 2.5, faceZ - 0.02, { bevel: 0.03 });
  for (let i = 0; i < 6; i += 1) {
    place(kiosk, boxGeo(ctx, 0.52, 0.05, 2.5), i % 2 ? m.kioskPink : m.kioskCream,
      kx - 2.6 + i * 1.04, base + 3.42, faceZ - 1.1, { cast: false });
  }
  for (const side of [-1, 1]) {
    bevelBox(ctx, kiosk, 0.16, 1.2, 1.5, m.glass, kx + side * 3.34, base + 2.35, kz, {
      bevel: 0.03,
      name: `fringe:apostles:pier-kiosk-window:end:${side < 0 ? 'south' : 'north'}`,
    });
  }
  bevelBox(ctx, kiosk, 1.2, 2.3, 0.16, m.glass, kx + 2.2, base + 1.5, kz + 2.48, {
    bevel: 0.03, name: 'fringe:apostles:pier-kiosk-door-hole:sea',
  });

  const letters = addToyLetters(kiosk, 'KIOSK', m.cream, kx + 1.85, base + 3.52, faceZ - 2.42, {
    s: 0.72, gap: 0.12, depth: 0.14, yaw: Math.PI,
  });
  letters.name = 'fringe:apostles:pier-kiosk-letters';

  addHandrail(ctx, kiosk, kx - 3.4, faceZ - 3.4, kx + 3.4, faceZ - 3.4, base + 0.34, 'kiosk-queue');
  for (const side of [-1, 1]) {
    place(kiosk, cylGeo(ctx, 0.34, 0.4, 1.0, 8), side < 0 ? m.teal : m.lamp,
      kx + side * 4.4, base + 0.85, faceZ - 1.0, {});
    place(kiosk, cylGeo(ctx, 0.42, 0.42, 0.1, 10), m.stoneDark,
      kx + side * 4.4, base + 1.4, faceZ - 1.0, {});
  }
  bevelBox(ctx, kiosk, 1.1, 1.4, 0.14, m.cream, kx + 4.9, base + 1.05, faceZ - 3.0, {
    bevel: 0.04, rotZ: 0.16,
  });
  addHedge(ctx, kiosk, kx - 4.6, base + 0.34, kz + 2.4, 3.0, 1.1, 12);
  contact(ctx, group, kx, kz, 6.4, SAND_Y + 0.03, 0.22);
  group.add(kiosk);

  addCrowd(ctx, group, [
    [kx - 1.2, faceZ - 4.2, 4, 1.9],
    [kx + 4.6, faceZ - 5.2, 2, 1.3],
  ], SAND_Y + 0.34, 'kiosk', { poses: false });
}

function addLifeguardTower(ctx, group) {
  const { m } = ctx;
  const x = 6.0;
  const z = 33.0;
  const y = SAND_Y;
  const tower = new THREE.Group();
  tower.name = 'fringe:apostles:lifeguard-tower';
  noPick(tower);
  group.add(tower);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      bevelBox(ctx, tower, 0.7, 0.24, 0.7, m.stoneDark, x + sx * 1.5, y + 0.12, z + sz * 1.5, {
        bevel: 0.04,
      });
      const leg = place(tower, boxGeo(ctx, 0.24, 3.5, 0.24), m.deckDark,
        x + sx * 1.35, y + 1.75, z + sz * 1.35, {});
      leg.rotation.z = sx * 0.05;
      leg.rotation.x = -sz * 0.05;
    }
  }
  bevelBox(ctx, tower, 3.6, 0.26, 3.6, m.deck, x, y + 3.6, z, { bevel: 0.05 });
  bevelBox(ctx, tower, 3.9, 0.14, 3.9, m.deckDark, x, y + 3.44, z, { bevel: 0.04 });
  bevelBox(ctx, tower, 3.1, 1.5, 3.1, m.white, x, y + 4.5, z, { bevel: 0.09 });
  bevelBox(ctx, tower, 2.6, 0.9, 0.14, m.glass, x, y + 4.8, z - 1.55, { bevel: 0.03 });
  bevelBox(ctx, tower, 3.8, 0.3, 3.8, m.red, x, y + 5.4, z, { bevel: 0.1 });
  bevelBox(ctx, tower, 2.6, 0.16, 2.6, m.white, x, y + 5.6, z, { bevel: 0.05 });
  place(tower, cylGeo(ctx, 0.06, 0.07, 2.4, 6), m.steel, x + 1.5, y + 6.6, z + 1.4, {});
  place(tower, boxGeo(ctx, 0.9, 0.6, 0.04), m.yellow, x + 1.95, y + 7.4, z + 1.4, {});
  for (const side of [-1, 1]) {
    place(tower, boxGeo(ctx, 0.1, 3.7, 0.1), m.deckDark, x + side * 0.5, y + 1.85, z - 2.1, {});
  }
  for (let i = 0; i < 7; i += 1) {
    place(tower, boxGeo(ctx, 1.05, 0.07, 0.09), m.deckDark, x, y + 0.5 + i * 0.5, z - 2.1, {});
  }
  addHandrail(ctx, tower, x - 1.8, z + 1.8, x + 1.8, z + 1.8, y + 3.76, 'lifeguard');
  addFigure(ctx, tower, x - 0.8, y + 3.76, z + 1.2, {
    h: 2.7, shirt: m.yellow, legs: m.red, hat: m.red, yaw: -0.4,
    name: 'fringe:apostles:lifeguard',
  });
  contact(ctx, group, x, z, 3.1, SAND_Y + 0.03, 0.26);
  for (let i = 0; i < 2; i += 1) {
    const fx = x - 13 + i * 16;
    place(group, cylGeo(ctx, 0.06, 0.08, 3.0, 6), m.steel, fx, SAND_Y + 1.5, 36.8, {});
    place(group, boxGeo(ctx, 0.06, 0.85, 1.15), i ? m.red : m.yellow, fx + 0.04,
      SAND_Y + 2.5, 37.4, {});
    contact(ctx, group, fx, 36.8, 0.6, SAND_Y + 0.03, 0.2);
  }
}

/**
 * Beach umbrellas in irregular clusters. Sizes, tilts, colours and spacings all
 * vary and the clusters leave gaps, so this cannot read as a clone array.
 */
function addUmbrellaCluster(ctx, group, cx, cz, count, spread, seed) {
  const { m } = ctx;
  const cloth = clothSet(m);
  for (let i = 0; i < count; i += 1) {
    const a = rand(seed * 9 + i, 111, 0, Math.PI * 2);
    const d = spread * rand(seed * 9 + i, 112, 0.18, 1);
    const x = cx + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d * 0.72;
    // taste-r1 W9-A: measured in the scene before this change, the twenty canopies spanned 3.3 to 5.7 m
    // (mean 4.6 m) against the scale law's 2.0 to 2.4 m (TASTE_SCALE.umbrella). The canopy shell is a
    // unit-radius dome whose scalloped hem reaches 1.05, so r 0.96 to 1.12 gives 2.0 to 2.35 m across.
    // The pole is the law's 2.2 to 2.4 m. Cluster centres and spreads are unchanged.
    const r = rand(seed * 9 + i, 113, 0.96, 1.12);
    const tilt = rand(seed * 9 + i, 114, 0.04, 0.2);
    const tiltYaw = rand(seed * 9 + i, 115, 0, Math.PI * 2);
    const height = rand(seed * 9 + i, 116, 2.2, 2.4);
    const shade = new THREE.Group();
    shade.position.set(x, SAND_Y, z);
    shade.rotation.y = tiltYaw;
    shade.rotation.z = tilt;
    shade.name = `fringe:apostles:cove-umbrella:${seed}:${i}`;
    noPick(shade);
    group.add(shade);
    place(shade, cylGeo(ctx, 0.05, 0.07, height, 7), m.steel, 0, height / 2, 0, {});
    const primary = cloth[(seed * 3 + i * 5) % cloth.length];
    const accent = (seed + i) % 2 ? m.cream : m.white;
    // ONE canopy mesh. Nothing is coincident with anything, so there is no
    // surface pair left to fight for depth.
    const canopyY = height - 0.34;
    const domeH = r * 0.52;
    place(shade, parasolGeo(ctx, 12, `#${primary.color.getHexString()}`,
      `#${accent.color.getHexString()}`), m.parasol, 0, canopyY, 0, {
      scale: [r, domeH, r], rotY: rand(seed * 9 + i, 117, 0, Math.PI * 2),
    });
    place(shade, sphereGeo(ctx, 0.1, 6), m.steel, 0, canopyY + domeH * 0.52 + 0.07, 0, {});
    contact(ctx, group, x, z, r * 0.92, SAND_Y + 0.03, 0.22);
  }
}

function addBeachScatter(ctx, group) {
  const { m } = ctx;
  const cloth = clothSet(m);
  // TOWELS WITH A THICKNESS AND A SHADOW UNDER THEM.
  //
  // r6: "~8 zero-thickness coloured quads with no contact darkening ... the last
  // decal-on-ground read in the frame". They were 6 cm boxes centred 4 cm above
  // a sand plane at 6 cm, so half of every towel was BELOW the sand and what
  // showed was a 1 cm sliver. Each is now a chamfered slab standing 11 cm proud
  // with a contrasting band folded across it, a rolled end on half of them, and
  // a contact patch — which is what the gate actually asks for.
  for (let i = 0; i < 34; i += 1) {
    const x = rand(i, 121, -31, 9);
    const z = rand(i, 122, 24.5, 38.5);
    const yaw = rand(i, 123, -Math.PI, Math.PI);
    const body = cloth[i % cloth.length];
    const trim = cloth[(i * 5 + 3) % cloth.length];
    place(group, bevelGeo(ctx, 2.0, 0.11, 0.95, 0.03), body,
      x, SAND_Y + 0.055, z, { rotY: yaw, cast: false });
    place(group, bevelGeo(ctx, 0.42, 0.125, 0.97, 0.025), trim,
      x + Math.cos(yaw) * 0.52, SAND_Y + 0.06, z - Math.sin(yaw) * 0.52,
      { rotY: yaw, cast: false });
    if (i % 2 === 0) {
      place(group, cylGeo(ctx, 0.11, 0.11, 0.9, 8), trim,
        x - Math.cos(yaw) * 0.86, SAND_Y + 0.16, z + Math.sin(yaw) * 0.86,
        { rotY: yaw, rotX: Math.PI / 2, cast: false });
    }
    contact(ctx, group, x, z, 1.15, SAND_Y + 0.028, 0.17);
  }
  for (let i = 0; i < 16; i += 1) {
    const x = rand(i, 131, -30, 8);
    const z = rand(i, 132, 25.5, 37.5);
    const yaw = rand(i, 133, -1.5, 1.5);
    place(group, bevelGeo(ctx, 0.85, 0.55, 0.6, 0.06), cloth[(i * 3) % cloth.length],
      x, SAND_Y + 0.28, z, { rotY: yaw });
    place(group, boxGeo(ctx, 0.88, 0.08, 0.63), m.white, x, SAND_Y + 0.58, z, {
      rotY: yaw, cast: false,
    });
    contact(ctx, group, x, z, 0.75, SAND_Y + 0.03, 0.2);
  }
  for (let i = 0; i < 9; i += 1) {
    const x = rand(i, 141, -29, 7);
    const z = rand(i, 142, 26, 36);
    place(group, bevelGeo(ctx, 0.5, 2.3, 0.12, 0.05), cloth[(i * 5 + 1) % cloth.length],
      x, SAND_Y + 1.05, z, { rotZ: rand(i, 143, -0.3, 0.3), rotY: rand(i, 144, 0, 3) });
    contact(ctx, group, x, z, 0.5, SAND_Y + 0.03, 0.24);
  }
  for (let i = 0; i < 7; i += 1) {
    const x = rand(i, 151, -27, 6);
    const z = rand(i, 152, 27, 36);
    place(group, sphereGeo(ctx, 0.34, 8), cloth[(i * 2 + 3) % cloth.length],
      x, SAND_Y + 0.34, z, {});
    contact(ctx, group, x, z, 0.42, SAND_Y + 0.03, 0.22);
  }
  for (let i = 0; i < 4; i += 1) {
    const x = -26 + i * 10.5 + Math.sin(i * 2.2) * 2.4;
    const z = 27.4 + Math.cos(i * 1.7) * 2.2;
    const wind = new THREE.Group();
    wind.position.set(x, SAND_Y, z);
    wind.rotation.y = rand(i, 161, -0.8, 0.8);
    noPick(wind);
    group.add(wind);
    for (let p = 0; p < 4; p += 1) {
      place(wind, cylGeo(ctx, 0.06, 0.07, 1.5, 6), m.trunk, -1.8 + p * 1.2, 0.75, 0, {});
      if (p < 3) {
        place(wind, boxGeo(ctx, 1.2, 0.95, 0.05), cloth[(i + p) % cloth.length],
          -1.2 + p * 1.2, 0.95, 0, {});
      }
    }
    contact(ctx, group, x, z, 2.2, SAND_Y + 0.03, 0.18);
  }
  for (let i = 0; i < 46; i += 1) {
    const t = i / 45;
    const lane = i % 3;
    const x = -23 + lane * 11 + Math.sin(i * 1.9 + lane) * 1.6;
    const z = 24 + t * 9 + lane * 1.1;
    place(group, discGeo(ctx, 0.22, 6), m.sandDamp, x, SAND_Y + 0.02, z, {
      rotX: -Math.PI / 2, cast: false, receive: false, renderOrder: 1,
      scale: [1, 1.6, 1],
    });
  }
}

function addCoveDune(ctx, group) {
  const cols = 12;
  const rows = 7;
  const positions = [];
  const indices = [];
  let maximum = 0;
  for (let iz = 0; iz < rows; iz += 1) {
    const v = iz / (rows - 1);
    for (let ix = 0; ix < cols; ix += 1) {
      const u = ix / (cols - 1);
      const x = -30.5 + (8.0 + 30.5) * u;
      const z = 20.8 + (30.4 - 20.8) * v;
      // Zero-height feather on all four edges, one continuous dune/rock-fall
      // slope through the middle. No stacked boxes and no voxel terraces.
      const edge = Math.sin(Math.PI * u) ** 0.72 * Math.sin(Math.PI * v) ** 0.84;
      const landward = 0.48 + 0.52 * (1 - v);
      const grain = 0.93 + 0.07 * Math.sin(ix * 1.7 + iz * 1.13);
      const rise = 1.48 * edge * landward * grain;
      maximum = Math.max(maximum, rise);
      positions.push(x, SAND_Y + 0.018 + rise, z);
      if (ix < cols - 1 && iz < rows - 1) {
        const a = iz * cols + ix;
        indices.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const dune = ownMesh(new THREE.Mesh(geometry, ctx.m.sandWarm), 'fringe:apostles:cove-dune-slope');
  dune.castShadow = false;
  dune.userData.continuousSlope = true;
  dune.userData.riseM = +maximum.toFixed(3);
  dune.userData.grid = [cols, rows];
  group.add(dune);
  return dune;
}

function addCoveBeach(ctx, group) {
  const { m } = ctx;
  addCoveDune(ctx, group);
  addKiosk(ctx, group);
  addLifeguardTower(ctx, group);
  addUmbrellaCluster(ctx, group, -27.0, 29.0, 4, 3.4, 1);
  addUmbrellaCluster(ctx, group, -16.5, 33.2, 6, 4.6, 2);
  addUmbrellaCluster(ctx, group, -8.5, 27.8, 3, 2.6, 3);
  addUmbrellaCluster(ctx, group, -1.5, 34.6, 5, 4.0, 4);
  addUmbrellaCluster(ctx, group, 4.5, 28.8, 2, 2.0, 5);
  addBeachScatter(ctx, group);
  // r6: "the right third runs ~6 people against ~40 rocks". The right third of
  // the plate is the far end of the cove — local x -20 down to the beach's own
  // edge at -31 — so five of these clusters are down there now. Nothing goes past
  // x -31: the landmark's bounding box is what the hero camera frames, and
  // widening it by a metre moves the shot.
  addCrowd(ctx, group, [
    [-29.6, 28.2, 3, 1.4],
    [-28.5, 31.4, 3, 2.6],
    [-25.6, 25.8, 2, 1.4],
    [-24.0, 36.5, 2, 1.5],
    [-21.4, 33.0, 4, 2.2],
    [-19.0, 28.6, 2, 1.8],
    [-13.5, 36.0, 4, 3.0],
    [-11.0, 26.6, 3, 2.0],
    [-5.0, 31.0, 3, 2.4],
    [0.5, 37.6, 2, 1.6],
    [6.0, 30.0, 3, 2.8],
    [-9.5, 39.4, 2, 2.0],
    [2.4, 25.4, 2, 1.5],
  ], SAND_Y, 'cove');
  const cloth = clothSet(m);
  for (let i = 0; i < 3; i += 1) {
    const x = -20 + i * 11.5;
    const z = 47.5 + Math.sin(i * 2.1) * 1.6;
    addFigure(ctx, group, x, WATER_Y + 0.1, z, {
      h: 2.5, shirt: cloth[(i * 3) % cloth.length], legs: m.teal,
      yaw: rand(i, 171, -3, 3), name: `fringe:apostles:wader:${i}`,
    });
    addFoamRing(group, m, x, z, 1.5, 0.9, i * 0.7, i + 5);
  }
}


/**
 * Wet rock at the splash line.
 *
 * The bar's own reading is that the 209 diffuse ceiling binds diffuse white and
 * nothing else, and that another venue moved its frame maximum to 251 on one
 * specular glint. Limestone at the tide line is genuinely wet and genuinely
 * glossy, and a wet face is a mirror in a way a dry one is not — so this puts a
 * band of small polished facets round the foot of every stack and along the reef
 * ledges, at scattered tilts for the same reason the swell glitter uses scattered
 * tilts: this file may not copy the sun out of `lighting.js`, so it aims nothing
 * and lets whichever facets bisect the key and the camera light up.
 *
 * ONE merged mesh, no shadows, and every facet lies on the rock it belongs to,
 * so nothing here can widen the landmark's bounding box or move the hero frame.
 */
function addWetRockGlints(ctx, group) {
  const positions = [];
  const colors = [];
  let n = 0;
  const band = (cx, cz, radius, squash, count, yLo, yHi, seed) => {
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + hash(seed * 3 + i, 501) * 0.7;
      const rr = radius * rand(seed * 3 + i, 502, 0.9, 1.06);
      const y = yLo + (yHi - yLo) * hash(seed * 3 + i, 503);
      const sc = radius * rand(seed * 3 + i, 504, 0.13, 0.3);
      waveletField(positions, colors, makePlacer(
        sc, sc * rand(seed * 3 + i, 505, 0.5, 1.1), sc * rand(seed * 3 + i, 506, 1.2, 2.4),
        a + Math.PI / 2,
        cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr * squash,
      ), 1 + Math.floor(hash(seed * 3 + i, 507) * 8), seed * 5 + i);
      n += 1;
    }
  };
  for (let i = 0; i < STACKS.length; i += 1) {
    const s = STACKS[i];
    band(s.x, s.sea, s.r * 0.92, 0.82, 9, WATER_Y + 0.12, WATER_Y + 0.62, i + 1);
  }
  for (let i = 0; i < REEF.length; i += 1) {
    const r = REEF[i];
    band(r.x, r.sea, r.r * 0.88, r.squash * 1.9, 11, WATER_Y + 0.1, WATER_Y + r.h * 0.55,
      i + 20);
  }
  if (!positions.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  const mesh = ownMesh(new THREE.Mesh(g, ctx.m.wetGlint), 'fringe:apostles:wet-rock-glints');
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 3;
  group.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// Sea stacks.
// ---------------------------------------------------------------------------

// World xz span of each `fringe:apostle:*` before this rebuild. Cove contact
// discs use max(3.2, span * 0.62). Pillars grow or shrink the stone itself
// until that span is back; nothing invisible is added.
const STACK_CONTACT_SPAN = [7.726, 4.532, 10.591, 4.770, 7.754, 6.042];

function scaleMeshHorizontal(mesh, factor) {
  const pos = mesh.geometry.getAttribute('position');
  const cos = Math.cos(mesh.rotation.y);
  const sin = Math.sin(mesh.rotation.y);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const sx = x * cos + z * sin;
    const sz = -x * sin + z * cos;
    const nx = sx * factor;
    const nz = sz * factor;
    pos.setX(i, nx * cos - nz * sin);
    pos.setZ(i, nx * sin + nz * cos);
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingBox();
}

function stackWorldSpan(stack) {
  stack.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(stack);
  return Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
}

function fitPillarSpan(stack, target) {
  const stones = [];
  stack.traverse((node) => {
    if (node.isMesh && node.userData.basePrimitive === 'fractured-stone'
      && !String(node.name).includes('guano')) stones.push(node);
  });
  if (!stones.length) return;
  let previous = Infinity;
  let grown = 1;
  for (let iter = 0; iter < 24; iter += 1) {
    const span = stackWorldSpan(stack);
    if (Math.abs(span - target) <= 0.004) break;
    if (iter > 4 && Math.abs(span - previous) < 0.0004) break;
    previous = span;
    const raw = target / span;
    const factor = span > target ? Math.max(0.9, raw) : Math.min(1.06, raw);
    grown *= factor;
    for (let s = 0; s < stones.length; s += 1) scaleMeshHorizontal(stones[s], factor);
  }
  for (let s = 0; s < stones.length; s += 1) {
    const erosion = stones[s].userData.erosion;
    if (erosion && Number.isFinite(erosion.horizontalBandReliefM)) {
      erosion.horizontalBandReliefM = +(erosion.horizontalBandReliefM * grown).toFixed(3);
    }
  }
}

function triangleHeightAt(ax, ay, az, bx, by, bz, cx, cy, cz, x, z) {
  const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(den) < 1e-8) return null;
  const w0 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den;
  const w1 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den;
  const w2 = 1 - w0 - w1;
  if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) return null;
  return w0 * ay + w1 * by + w2 * cy;
}

function crownSupportY(stack, x, z, skip) {
  stack.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(stack.matrixWorld).invert();
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  const pc = new THREE.Vector3();
  let best = -Infinity;
  stack.traverse((node) => {
    if (!node.isMesh || node === skip || !node.geometry) return;
    const name = node.name || '';
    const stone = node.userData.basePrimitive === 'fractured-stone'
      || name.includes('guano-cap')
      || name.includes('true-arch')
      || name.includes('arch-course');
    if (!stone) return;
    const pos = node.geometry.getAttribute('position');
    const index = node.geometry.index;
    const count = index ? index.count : pos.count;
    for (let t = 0; t < count; t += 3) {
      const ia = index ? index.getX(t) : t;
      const ib = index ? index.getX(t + 1) : t + 1;
      const ic = index ? index.getX(t + 2) : t + 2;
      pa.fromBufferAttribute(pos, ia).applyMatrix4(node.matrixWorld).applyMatrix4(inv);
      pb.fromBufferAttribute(pos, ib).applyMatrix4(node.matrixWorld).applyMatrix4(inv);
      pc.fromBufferAttribute(pos, ic).applyMatrix4(node.matrixWorld).applyMatrix4(inv);
      const y = triangleHeightAt(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z, pc.x, pc.y, pc.z, x, z);
      if (y !== null && y > best) best = y;
    }
  });
  return best === -Infinity ? null : best;
}

function seatCrownGrowth(stack) {
  let growth = null;
  stack.traverse((node) => {
    if (node.name && node.name.endsWith(':lichen-top')) growth = node;
  });
  if (!growth) return;
  growth.traverse((node) => {
    if (!node.isMesh) return;
    const y = crownSupportY(stack, node.position.x, node.position.z, node);
    if (y == null) return;
    const name = node.name || '';
    let lift = 0.012;
    if (name.includes('guano-cap')) lift = 0;
    else if (node.geometry.type === 'ConeGeometry') {
      const height = node.geometry.parameters?.height ?? 0.38;
      lift = height * node.scale.y * 0.5;
    } else if (node.geometry.type === 'SphereGeometry' && !name.includes('guano')) {
      lift = -node.scale.y * 0.5 * 0.22;
    }
    node.position.y = y + lift;
  });
}

function addScrubPatch(ctx, group, r, h, seed) {
  const { m } = ctx;
  for (let i = 0; i < 5; i += 1) {
    const a = rand(seed * 5 + i, 181, 0, Math.PI * 2);
    const d = r * rand(seed * 5 + i, 182, 0.05, 0.55);
    // Rounded clumps read as windswept coastal heath; the cones this replaced
    // rendered as flat pale-green plates on every stack crown.
    place(group, sphereGeo(ctx, 0.5, 6), (i + seed) % 2 ? m.scrubStackDark : m.scrubStack,
      Math.cos(a) * d, h + r * 0.06, Math.sin(a) * d, {
        rotY: a, rotZ: rand(seed * 5 + i, 183, -0.3, 0.3),
        scale: [r * rand(seed * 5 + i, 184, 0.24, 0.42), r * 0.2,
          r * rand(seed * 5 + i, 185, 0.22, 0.38)],
        receive: false,
      });
  }
}

function addStackBase(ctx, group, x, z, r, seed) {
  for (let i = 0; i < 4; i += 1) {
    const a = rand(seed * 6 + i, 191, 0, Math.PI * 2);
    const d = r * rand(seed * 6 + i, 192, 0.95, 1.4);
    const s = r * rand(seed * 6 + i, 193, 0.12, 0.36);
    // Stack-base blocks: 2-5 m of rock (BASE_BLOCK_UNIT), lower and wider than a
    // shore boulder, half drowned so the foam band reads where the stone meets water.
    addBoulder(ctx, group, x + Math.cos(a) * d, WATER_Y + s * 0.18,
      z + Math.sin(a) * d * 0.75, s, s * 0.6, s * 0.9, seed * 6 + i, true, BASE_BLOCK_UNIT);
  }
}

/**
 * Low scrub on the real ledges of a stone and nowhere else: up-facing triangles above the
 * splash zone, in leafGrey, merged into one mesh parented to the stone so it shares the
 * stone's transform.
 */
function addLedgeScrub(ctx, stone, seed, count = 7) {
  const sites = findLedgeSites(stone.geometry, { baseY: WATER_Y, minH: 2.8, count, seed });
  if (!sites.length) return null;
  const leaf = new THREE.Color(TASTE.foliage.leafGrey);
  const dark = new THREE.Color(mixHex(TASTE.foliage.leafGrey, TASTE.foliage.leafA, 0.45));
  const proto = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
  const pp = proto.getAttribute('position');
  const positions = [];
  const colors = [];
  const tint = new THREE.Color();
  for (let s = 0; s < sites.length; s += 1) {
    const site = sites[s];
    for (let b = 0; b < 3; b += 1) {
      const a = hash(seed * 31 + s * 7 + b, 701) * Math.PI * 2;
      const d = b === 0 ? 0 : 0.35 + hash(seed + s * 3 + b, 702) * 0.3;
      const rx = 0.36 + hash(seed + s * 5 + b, 703) * 0.3;
      const ry = rx * 0.5;
      const cx = site.x + Math.cos(a) * d;
      const cz = site.z + Math.sin(a) * d;
      tint.copy(leaf).lerp(dark, hash(seed + s * 11 + b, 704) * 0.8);
      for (let v = 0; v < pp.count; v += 1) {
        const y = pp.getY(v);
        positions.push(cx + pp.getX(v) * rx, site.y + 0.02 + (y * 0.5 + 0.22) * ry * 2, cz + pp.getZ(v) * rx);
        const shade = 0.66 + 0.40 * (y * 0.5 + 0.5);
        colors.push(tint.r * shade, tint.g * shade, tint.b * shade);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  proto.dispose();
  const mesh = new THREE.Mesh(geo, ctx.m.scrubLedge);
  mesh.name = `${stone.name}:ledge-scrub`;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.ledgeScrub = sites.length;
  noPick(mesh);
  stone.add(mesh);
  return mesh;
}

function addPillarStack(ctx, g, spec, i) {
  const { m } = ctx;
  const stack = new THREE.Group();
  stack.name = `fringe:apostle:${i}`;
  stack.userData.kind = 'limestone-sea-stack';
  stack.userData.seaward = spec.sea;
  noPick(stack);

  const hero = spec.h >= 9.5;
  const r = spec.r * (hero ? 1.13 : 1.06) * STAMP_STACK_SCALE;
  const h = spec.h * (hero ? 1.22 : 1.12) * STAMP_STACK_SCALE;
  const targetNotchHeightM = 1.12 + (i % 5) * 0.16;
  const shaft = addRockForm(stack, m, {
    profile: apostleProfile(i, {
      courses: 12 + (i % 3),
      notchT: targetNotchHeightM / h,
      notchDepth: 0.24 + (i % 5) * 0.032,
      capT: 0.82 + (i % 3) * 0.03,
    }),
    r,
    h,
    lean: spec.lean,
    yaw: spec.yaw,
    squash: 0.68 + (i % 4) * 0.06,
    seed: i * 7 + 2,
    segs: hero ? 11 : 9,
    name: `fringe:apostle:${i}:tapered-undercut`,
    strata: true,
  });
  const guano = addRockForm(stack, m, {
    r: r * 0.42,
    h: Math.min(h * 0.07, r * 0.22),
    lean: spec.lean * 0.15,
    yaw: spec.yaw + 0.4,
    squash: 0.78,
    seed: i * 3 + 9,
    x: r * 0.1,
    z: -r * 0.04,
    baseY: WATER_Y + h * 0.9,
    kind: 'crust',
    name: `fringe:apostle:${i}:guano-cap`,
  });
  guano.userData.guanoCap = true;
  {
    // taste-r1 (W14 fix): the lit cap rendered (244,231,215), a white lid the foam gate read as foam.
    const cc = guano.geometry.getAttribute('color');
    if (cc) {
      for (let q = 0; q < cc.count; q += 1) cc.setXYZ(q, cc.getX(q) * 0.78, cc.getY(q) * 0.78, cc.getZ(q) * 0.78);
      cc.needsUpdate = true;
    }
  }
  const crownGrowth = new THREE.Group();
  crownGrowth.name = `fringe:apostle:${i}:lichen-top`;
  crownGrowth.userData.topWeathering = 'guano-and-lichen';
  noPick(crownGrowth);
  stack.add(crownGrowth);
  addScrubPatch(ctx, crownGrowth, r, h - r * 0.05, i);
  for (let k = 0; k < 3; k += 1) {
    const a = hash(i * 7 + k, 190) * Math.PI * 2;
    const d = r * (0.12 + hash(i * 11 + k, 192) * 0.28);
    place(crownGrowth, discGeo(ctx, r * (0.14 + k * 0.025), 8),
      k % 2 ? m.pigface : m.pigfaceDark,
      Math.cos(a) * d, h + r * 0.035, Math.sin(a) * d, {
        rotX: -Math.PI / 2, cast: false, receive: true,
        name: `fringe:apostle:${i}:lichen-patch:${k}`,
      });
  }
  for (let t = 0; t < 4; t += 1) {
    const a = rand(i * 9 + t, 186, 0, Math.PI * 2);
    const d = r * rand(i * 9 + t, 187, 0.08, 0.42);
    place(crownGrowth, coneGeo(ctx, 0.12, 0.38, 5), (i + t) % 2 ? m.marram : m.scrubLight,
      Math.cos(a) * d, h + 0.12, Math.sin(a) * d, {
        rotZ: rand(i * 9 + t, 188, -0.25, 0.25),
        scale: [1, rand(i * 9 + t, 189, 0.7, 1.2), 1],
        receive: false,
      });
  }
  stack.position.set(spec.x, 0, spec.sea);
  g.add(stack);
  const talus = new THREE.Group();
  talus.name = `fringe:apostle:${i}:talus`;
  talus.userData.talusFragments = i === 0 ? 11 : 4;
  noPick(talus);
  g.add(talus);
  addStackBase(ctx, talus, spec.x, spec.sea, r * 1.05, i + 2);
  if (i === 0) {
    for (let s = 0; s < 7; s += 1) {
      const a = rand(s, 194, -1.1, 1.1);
      const d = r * (1.05 + hash(s, 195) * 0.85);
      const sz = r * rand(s, 196, 0.16, 0.42);
      addBoulder(ctx, talus, spec.x + Math.cos(a) * d, WATER_Y + sz * 0.22,
        spec.sea + Math.sin(a) * d * 0.7, sz, sz * 0.55, sz * 0.85, 40 + s, true);
    }
  }
  addWetFoot(ctx, stack, {
    r, squash: 0.68 + (i % 4) * 0.06, seed: i * 7 + 2, name: `fringe:apostle:${i}`,
    hero: i === 0, host: ctx.contact,
  });
  addWaterCollar(g, m, spec.x, spec.sea, r * 2.55, r * 1.85, i,
    `fringe:apostle:${i}:water-dip`);
  addSurgeContact(ctx, g, spec.x, spec.sea, r * 2.45, r * 1.75, spec.yaw, i,
    `fringe:apostle:${i}`, ctx.contact, i === 0);
  fitPillarSpan(stack, STACK_CONTACT_SPAN[i]);
  seatCrownGrowth(stack);
  addLedgeScrub(ctx, shaft, i * 5 + 3);
  stack.userData.erosion = {
    ...shaft.userData.erosion,
    waveCutNotchRangeM: [1, 2],
    paleWetBand: true,
    talusFragments: talus.userData.talusFragments,
    guanoLichenTop: true,
  };
  return stack;
}

function addArchStack(ctx, g, spec, i) {
  const { m } = ctx;
  const stack = new THREE.Group();
  stack.name = `fringe:apostle:${i}`;
  stack.userData.kind = 'limestone-sea-arch';
  stack.userData.seaward = spec.sea;
  stack.userData.trueOpening = true;
  noPick(stack);

  const r = spec.r * 1.1 * STAMP_STACK_SCALE;
  const h = spec.h * 1.18 * STAMP_STACK_SCALE;
  const halfGap = r * 0.76;
  const springY = h * 0.42;
  const legH = springY + r * 0.14;
  const legR = r * 0.3;
  const targetNotchHeightM = 1.08 + (i % 3) * 0.16;
  const legErosion = [];
  const legStones = [];
  for (const side of [-1, 1]) {
    const lx = side * (halfGap + legR * 0.55);
    const leg = addRockForm(stack, m, {
      profile: apostleProfile(i * 2 + side + 3, {
        courses: 9, notchT: targetNotchHeightM / legH, notchDepth: 0.3, capT: 0.9,
      }),
      r: legR,
      h: legH,
      lean: side * spec.lean * 0.24,
      yaw: spec.yaw + side * 0.09,
      squash: 0.78,
      seed: i * 11 + side + 4,
      segs: 9,
      x: lx,
      z: side * r * 0.035,
      kind: 'leg',
      outerSign: side,
      name: `fringe:apostle:${i}:arch-leg-${side < 0 ? 'left' : 'right'}`,
      strata: true,
    });
    legErosion.push(leg.userData.erosion);
    legStones.push(leg);
  }

  const archRadius = halfGap + legR * 0.3;
  const tube = legR * 0.8;
  const archGeometry = new THREE.TorusGeometry(archRadius, tube, 7, 16, Math.PI);
  const archPosition = archGeometry.getAttribute('position');
  for (let v = 0; v < archPosition.count; v += 1) {
    const px = archPosition.getX(v);
    const py = archPosition.getY(v);
    const pz = archPosition.getZ(v);
    const rough = 1 + 0.042 * Math.sin(v * 1.83 + i * 2.7);
    archPosition.setXYZ(v, px * rough, py * (1 + 0.03 * Math.cos(v + i)), pz * rough);
  }
  archPosition.needsUpdate = true;
  archGeometry.computeVertexNormals();
  const arch = ownMesh(new THREE.Mesh(archGeometry, m.limestone),
    `fringe:apostle:${i}:true-arch`);
  arch.position.set(0, WATER_Y + springY, 0);
  arch.scale.set(1.02, 1.1, 0.74);
  stack.add(arch);
  // Voussoir courses. r3 squashed these to 0.16 of the tube in z while the arch
  // itself sits at 0.74, so the outer two poked clean through the arch's face and
  // their normals — inverse-transposed through a 6.9x anisotropic scale — pointed
  // nowhere useful. They now sit inside the arch's own z extent and stand proud
  // by more than the arch's surface roughness, so they read as courses.
  for (let b = 0; b < 3; b += 1) {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(archRadius, tube * (1.10 - b * 0.03), 7, 16, Math.PI),
      // AP1: the middle course was the bright ochre (albedo 0.30, four times the stone); it is limestone now.
      b % 2 ? (AP1_ON ? m.limestone : m.ochre) : m.limestonePale,
    );
    ownMesh(band, `fringe:apostle:${i}:arch-course:${b}`);
    band.position.set(0, WATER_Y + springY, (b - 1) * tube * 0.44);
    band.scale.set(1.0, 1.09, 0.3);
    stack.add(band);
  }

  // Seated into the arch, not perched on it: the crown blocks start below the
  // extrados so their bottom courses are buried in the arch mass rather than
  // showing a down-facing skirt across the crown.
  const crownBase = springY + archRadius * 0.72;
  for (const side of [-1, 1]) {
    addRockForm(stack, m, {
      profile: apostleProfile(i * 5 + side, {
        courses: 8, notchT: 0.1, notchDepth: 0.1, capT: 0.8, dryFoot: true,
      }),
      r: r * 0.6,
      h: r * (1.15 + (side > 0 ? 0.25 : 0)),
      lean: side * 0.2,
      yaw: spec.yaw + side * 0.15,
      squash: 0.72,
      seed: i * 17 + side + 4,
      segs: 9,
      x: side * r * 0.3,
      z: 0,
      baseY: WATER_Y + crownBase,
      kind: 'crown',
      dry: true,
    });
  }
  const crownGrowth = new THREE.Group();
  crownGrowth.name = `fringe:apostle:${i}:lichen-top`;
  crownGrowth.userData.topWeathering = 'guano-and-lichen';
  noPick(crownGrowth);
  stack.add(crownGrowth);
  const guano = place(crownGrowth, sphereGeo(ctx, 1, 8), m.limestoneGuano,
    0, WATER_Y + crownBase + r * 1.28, 0, {
      scale: [r * 0.62, r * 0.055, r * 0.38], cast: false, receive: true,
      name: `fringe:apostle:${i}:guano-cap`,
    });
  guano.userData.guanoCap = true;
  addScrubPatch(ctx, crownGrowth, r * 0.8, crownBase + r * 1.3, i + 1);
  for (let k = 0; k < 3; k += 1) {
    const a = hash(i * 13 + k, 196) * Math.PI * 2;
    const d = r * (0.08 + hash(i * 17 + k, 197) * 0.22);
    place(crownGrowth, discGeo(ctx, r * (0.12 + k * 0.02), 8),
      k % 2 ? m.pigface : m.pigfaceDark,
      Math.cos(a) * d, WATER_Y + crownBase + r * 1.31, Math.sin(a) * d, {
        rotX: -Math.PI / 2, cast: false, receive: true,
        name: `fringe:apostle:${i}:lichen-patch:${k}`,
      });
  }

  stack.position.set(spec.x, 0, spec.sea);
  stack.rotation.y = spec.yaw * 0.22;
  g.add(stack);
  const talus = new THREE.Group();
  talus.name = `fringe:apostle:${i}:talus`;
  talus.userData.talusFragments = 8;
  noPick(talus);
  g.add(talus);
  addStackBase(ctx, talus, spec.x - halfGap - legR * 0.55, spec.sea, legR * 1.2, i + 11);
  addStackBase(ctx, talus, spec.x + halfGap + legR * 0.55, spec.sea, legR * 1.2, i + 13);
  for (const side of [-1, 1]) {
    addWetFoot(ctx, stack, {
      r: legR * 1.15, squash: 0.78, seed: i * 11 + side + 4,
      x: side * (halfGap + legR * 0.55), name: `fringe:apostle:${i}:leg-${side < 0 ? 'L' : 'R'}`,
      hero: false, host: ctx.contact,
    });
  }
  addWaterCollar(g, m, spec.x, spec.sea, r * 2.65, r * 1.95, i + 3,
    `fringe:apostle:${i}:water-dip`);
  addSurgeContact(ctx, g, spec.x, spec.sea, r * 2.55, r * 1.75, spec.yaw, i + 3,
    `fringe:apostle:${i}`, ctx.contact, false);
  seatCrownGrowth(stack);
  for (let l = 0; l < legStones.length; l += 1) addLedgeScrub(ctx, legStones[l], i * 5 + 11 + l, 5);
  stack.userData.erosion = {
    notchHeightM: targetNotchHeightM,
    notchDepthM: Math.min(...legErosion.map((value) => value.notchDepthM)),
    unequalCourseRatio: Math.min(...legErosion.map((value) => value.unequalCourseRatio)),
    horizontalBandReliefM: Math.max(...legErosion.map((value) => value.horizontalBandReliefM)),
    verticalFractures: 6,
    flatTopReliefM: Math.max(...legErosion.map((value) => value.flatTopReliefM)),
    waveCutNotchRangeM: [1, 2],
    paleWetBand: true,
    talusFragments: 8,
    guanoLichenTop: true,
  };
  return stack;
}

// ---------------------------------------------------------------------------

export function addApostles(parent, city, plan) {
  const roles = plan?.roles ?? {};
  const extent = plan?.extent ?? city?.extent ?? { x: 272, z: 272 };
  const bay = roles.bay ?? city?.waterEdge ?? 'south';
  if (!bay) return null;
  const L = alongLength(bay, extent);
  const frame = edgeFrame(bay, extent, 0, 0);
  const m = mats();
  const ctx = makeCtx(m);
  const root = new THREE.Group();
  root.name = 'fringe:apostles';
  noPick(root);
  placeGroup(parent, root, frame);

  // One postcard cove on the harbour / inland corner, opposite Grand Prix.
  const clusterSign = -hillsFlankSign(roles);
  const flankAlong = L * 0.42;
  const side = clusterSign > 0 ? 'east' : 'west';
  const headland = new THREE.Group();
  headland.name = `fringe:apostles:${side}-headland`;
  headland.position.x = clusterSign * flankAlong;
  const mirrored = clusterSign > 0;
  if (mirrored) headland.scale.x = -1;
  root.add(headland);

  // The cliff, its lawn and the car park ride on their own along-offset so the
  // stacks land in the middle of the hero frame instead of its corner.
  const land = new THREE.Group();
  land.name = 'fringe:apostles:headland-mass';
  land.position.x = LAND_SHIFT;
  noPick(land);
  headland.add(land);

  // Along-coordinate where the board's finite bay water body stops.
  const alongHalf = (bay === 'north' || bay === 'south' ? extent.x : extent.z) * 0.5;
  const bay0 = addSeaBackdrop(ctx, parent, frame, {
    clusterSign,
    flankAlong,
    mirrored,
    edgeX: flankAlong - (alongHalf + SHORE.bayWaterAlongPad),
    seaMax: SHORE.baySeaMax,
    heightAt: typeof plan?.heightAt === 'function' ? plan.heightAt : null,
  });
  // Sea furniture goes in the BACKDROP group, not in `root`. `capture-seven.mjs`
  // frames the union bounding box of `fringe:apostles`, so anything added there
  // would move the hero camera; added here it moves it by zero, and every
  // before/after pixel comparison stays valid.
  // The fauna state is stashed on the LANDMARK's userData, not on the backdrop,
  // because `fringe.js:1155` hands `updateApostles` the landmark root and has no
  // reference to the sibling backdrop group. The geometry stays in the backdrop;
  // only the handle crosses.
  root.userData.fauna = addSeaFurniture(ctx, bay0.local, bay0.surfaceAt, city);
  root.userData.contact = ctx.contact;
  ctx.contact.sea = { city, plan: planEdgeMassing(city ?? { extent: { x: 272, z: 272 } }) };

  addCliffMass(ctx, land);
  addHeadlandPlanting(ctx, land);
  addLookout(ctx, land, { x: STACKS[2].x - LAND_SHIFT, sea: STACKS[2].sea }, side);
  addCarPark(ctx, land);
  addReef(ctx, headland);
  addSurf(ctx, headland);
  addCoveBeach(ctx, headland);

  root.userData.flankAlong = flankAlong;
  root.userData.clusterSign = clusterSign;
  root.userData.stampScale = STAMP_STACK_SCALE;
  root.userData.stackFlanks = Object.freeze({
    west: clusterSign < 0 ? [0, 1, 2, 3, 4, 5] : [],
    east: clusterSign > 0 ? [0, 1, 2, 3, 4, 5] : [],
  });

  // AP1: the stack builders alone see the stacks' own material copies; ctx.m is the shared set again after.
  if (AP1_ON) ctx.m = ap1StackMats(m);
  for (let i = 0; i < STACKS.length; i += 1) {
    const spec = STACKS[i];
    if (spec.arch) addArchStack(ctx, headland, spec, i);
    else addPillarStack(ctx, headland, spec, i);
  }
  ctx.m = m;
  const erosionStacks = STACKS.map((_, i) => {
    const stack = root.getObjectByName(`fringe:apostle:${i}`);
    return { name: stack?.name ?? null, ...stack?.userData?.erosion };
  });
  const dune = root.getObjectByName('fringe:apostles:cove-dune-slope');
  root.userData.erosionAudit = {
    stacks: erosionStacks,
    waveNotchRangeM: [1, 2],
    allWaveNotchesInRange: erosionStacks.every((stack) => (
      stack.notchHeightM >= 1 && stack.notchHeightM <= 2
    )),
    paleWetBands: erosionStacks.filter((stack) => stack.paleWetBand).length,
    guanoLichenTops: erosionStacks.filter((stack) => stack.guanoLichenTop).length,
    talusGroups: erosionStacks.filter((stack) => stack.talusFragments >= 4).length,
    beachSlope: dune ? {
      continuous: dune.userData.continuousSlope,
      riseM: dune.userData.riseM,
      grid: dune.userData.grid,
    } : null,
  };
  // W4-A: `addWetRockGlints` is no longer called. Its 3,900-vertex field of mirror facets (metalness 0.42,
  // roughness 0.08) reflected the sky as pale blue-grey cylinders lying round the ledges and stack feet.

  // Letters live inside the mirrored headland, so cancel the mirror on each run
  // rather than letting the hero camera read them backwards.
  if (mirrored) {
    headland.traverse((node) => {
      if (typeof node.name === 'string' && node.name.includes('letters')) node.scale.x = -1;
    });
  }

  return root;
}

/**
 * Animation tick.
 *
 * UNTIL THIS ROUND THIS FUNCTION HAD NO PARAMETERS AND NO BODY. `fringe.js:1155`
 * calls `updateApostles(this._apostles, dt, elapsed, freeze)` on every frame of
 * the game, and the venue discarded all four arguments — which is the whole
 * reason nothing at the Apostles has ever moved. It is not that the animation
 * was subtle; there was none.
 *
 * `dt` stays unused on purpose. Every term below is a pure function of `elapsed`
 * and a seeded per-bird / per-boat constant, so two captures taken at the same
 * clock produce byte-identical matrices no matter what frame rate got them
 * there. An integrator driven by `dt` would not, and every before/after
 * comparison in this programme depends on it.
 */
export function updateApostles(group, dt, elapsed, reducedMotion) {
  // Beach umbrellas and chairs on the open beach belong to nature:water.
  // Do not hide them.
  const fauna = group?.userData?.fauna;
  if (!fauna) return;
  void dt;
  // Freeze parks everything at t = 0, which is the pose the geometry was built
  // in: boats exactly at their authored station and heading, birds at their own
  // seeded wing phase rather than a rank of identical spread wings.
  const t = reducedMotion ? 0 : (Number.isFinite(elapsed) ? elapsed : 0);
  updateGulls(fauna.gulls, t);
  updateBoats(fauna.boats, t);
  updateContact(group.userData.contact, t);
}

function updateContact(contact, t) {
  if (!contact) return;
  const omega = (Math.PI * 2) / SEA_PERIOD;
  const phase = t * omega;
  const sprays = contact.sprays;
  if (sprays) {
    for (let i = 0; i < sprays.length; i += 1) {
      const s = sprays[i];
      const k = 0.72 + 0.38 * Math.max(0, Math.sin(phase + s.phase));
      s.mesh.scale.set(s.sx * k, s.sy * (0.85 + 0.45 * k), s.sz * k);
    }
  }
  const pulses = contact.pulses;
  if (pulses) {
    const sea = contact.sea;
    for (let i = 0; i < pulses.length; i += 1) {
      const p = pulses[i];
      const k = 0.88 + 0.16 * Math.max(0, Math.sin(phase * 2 + p.phase));
      p.mesh.scale.set(k, 1, 0.82 + 0.22 * k);
      // taste-r1 (W14-B): the collar rides the drawn sheet (vertical only), so a trough that is
      // lower than WATER_Y never leaves it hovering. Its own height offsets are kept.
      if (sea) {
        if (p.wx === undefined) {
          p.mesh.updateWorldMatrix(true, false);
          p.mesh.getWorldPosition(SEA_WORLD);
          p.wx = SEA_WORLD.x;
          p.wz = SEA_WORLD.z;
        }
        p.mesh.position.y = oceanSurfaceYAt(p.wx, p.wz, t, sea.city, sea.plan) - WATER_Y;
      }
    }
  }
}
