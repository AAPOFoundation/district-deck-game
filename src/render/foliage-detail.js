// W19-A: a leaf surface for the lobed crowns, in the material and not in the geometry.
//
// Pocket Reserve (veg-triplanar.ts) gives a smooth clump its leaf look with a world-space triplanar lookup, a
// height and cavity term and a foot darkening. This brings the same idea across: a luminance pack
// (assets/coast/foliage-lum.png, R fine leaves, G broad clumps, B relief; see scripts/qa/taste/textures/pack-foliage.py)
// is read in world space by planes, at two scales for the fine layer and one for the broad layer, and modulates the
// diffuse light and dark, a small hue shift, an underside term and the shading normal.
//
// Leaf against bark needs no new attribute: the forms colour bark with a multiplier whose R is well above its G, and
// crowns with a near neutral occlusion value, so the raw `color` attribute marks the two apart in the vertex shader.
//
// `FOLIAGE_DETAIL.gain` is the switch: at 0 `applyFoliageDetail` returns the material untouched and the frame is as it was.

import * as THREE from 'three';
import { COAST_DETAIL_GLSL, loadCoastPack } from './coast-textures.js';
import { crownCardsActive, crownShadeWarmActive, trunkBarkActive, crownSwitch, CROWN_SHADE_WARM_PARAMS } from './tree-forms.js';

export const FOLIAGE_DETAIL = {
  gain: 1,
  fineM: 1.6, // metres per repeat of the fine tile: leaf clusters of about 0.3 to 0.6 m
  broadM: 5.5, // metres per repeat of the broad layer: mottling of 2 to 4 m
  lumFine: 0.80, // light and dark from the leaf clusters
  lumBroad: 0.85, // light and dark from the broad clumps
  mottle: 1.25, // light and dark from the lobe-sized clumps (value noise, 1 to 4 m)
  under: 0.42, // darkening of downward faces (and a lift of upward ones, so the mean holds)
  hue: 0.8, // strength of the sunlit yellow-green to shaded blue-green shift
  bump: 0.9, // bend of the shading normal from the relief channel
  fadeNear: 70, // metres from the camera where the fine layer starts to fade
  fadeFar: 240,
  warmHue: 0, // hue shift kept on warm (autumn) crowns, as a fraction of the green-crown shift
  warmLum: 0.4, // mottle and broad light-and-dark kept on warm crowns
  warmBump: 0.5, // normal bend kept on warm crowns
  barkRatioLo: 1.28, // raw vertex colour r / g below this is leaf
  barkRatioHi: 1.5, // above this is bark
  // taste-r1 (W20): the outline switch. Each leaf vertex of a material made with `{ puff: true }` is pushed along its own
  // normal by a signed noise of its world position (lobes swell and pinch), by at most `puffReach` of its distance from the
  // trunk axis. 0 is off: the program is then the one W19 compiled. Bark never moves (same colour-ratio mask as the leaf).
  puff: 1,
  puffReach: 0.12, // cap on the push, as a fraction of the vertex's distance from the trunk axis (the crown's radius there)
  puffBigM: 2.4, // metres per cell of the coarse noise
  puffSmallM: 0.9, // metres per cell of the fine noise
  puffDark: 0.20, // darkening in the pinches (a pinch is a gap between leaf masses)
  puffEdge: 0.45, // ragged rim: leaf fragments seen at a grazing angle (n.v below this, varied by a fine noise) are dropped; 0 is off
  // taste-r1 (W21-A): the leaf-cluster cards of a crown (tree-forms.js CROWN_CARDS builds them; this paints them). The material
  // reads the card atlas (assets/coast/crown-cards.png: R mask, G tone, B depth), tests the alpha with alpha-to-coverage and
  // keeps the cover of a far card by blending from a sharpened edge to the plain alpha as the mip level rises.
  cardTone: 0.75, // how much of the atlas tone (mean 1) a card wears
  cardInner: 0.76, // value of the inner end of a card (the end nearest the core)
  cardOuter: 1.10, // value of the outer end
  cardDepth: 0.30, // darkening deep inside a mass (the depth channel)
  cardDetail: 0.5, // share of the world-space leaf detail a card keeps
  cardMip: 1.0, // mip level where the sharpened edge begins to give way to plain alpha (it is gone 2 levels later)
  cardGain: 2.0, // slope of the alpha at coarse mips ((alpha - 0.12) * gain), so a far card keeps its cover
  // taste W43 (TRUNK_BARK): the river red gum's bark, a luminance term from world position on the bark side of the leaf mask, for the
  // materials that ask (`opts.trunkBark`, the hinterland trees) while tree-forms.js has TRUNK_BARK on. Irregular patches of 0.3 to 0.8 m
  // and faint vertical streaks of 0.1 to 0.2 m; weak on the faces of leaning limbs, where a vertical streak would band across the limb.
  barkGain: 0.25, // largest light or dark swing, as a fraction of the albedo
  barkFadeNear: 40, // metres from the camera where the bark term starts to fade
  barkFadeFar: 120, // and where it is gone
  barkPatchM: 0.62, // metres per cell of the patch noise (a second octave at half)
  barkStreakM: 0.18, // metres per cell across a streak; a streak is 6 times as tall
};

/**
 * taste W63: CROWN_RIM. The crowns' ragged-rim discard (the last block of the normal stage below) drops core fragments seen at a
 * grazing angle where a two-octave world-space noise says so: cells of 0.75 m and 0.36 m (about 2 px at the close cameras), strength
 * `puffEdge`. 1 (the default) reads the knobs below. Their defaults are the earlier values except the strength, which is 0 (no rim):
 * picked by eye from a sheet of six settings at f1, g2 and station 12 (wave sixty-three, column B), since the rim's bites read as a
 * dirty, pixel-ragged outline that shimmers in motion, and the crown cards (W21) now carry the leafy edge;
 * `?crownRimEdge=` (strength), `?crownRimCellA=` and `?crownRimCellB=` (cell sizes in metres), `?crownRimWB=` (the fine octave's weight,
 * the coarse one has 1 minus it) and `?crownRimSoft=` (the width, in n.v, over which the rim feeds alpha to coverage instead of
 * discarding outright; 0 is the hard discard; it acts only on a material with alpha-to-coverage, i.e. the crowns with cards, and
 * the scene target's MSAA turns the alpha into samples). Node: `DD_CROWN_RIM_EDGE` and the like. `?crownRim=0` (node `DD_CROWN_RIM=0`)
 * ignores every knob and restores the earlier shader text, uniforms and cache key exactly.
 */
export const CROWN_RIM = crownSwitch('DD_CROWN_RIM', 'crownRim');
let crownRimOn = CROWN_RIM;
export function setCrownRim(v) { crownRimOn = v ? 1 : 0; }
export function crownRimActive() { return crownRimOn; }
function rimKnob(envName, param, dflt) {
  let raw;
  if (typeof process !== 'undefined' && process?.env?.[envName] !== undefined) raw = process.env[envName];
  else if (typeof location !== 'undefined' && location?.search) raw = new URLSearchParams(location.search).get(param);
  const n = raw === undefined || raw === null || raw === '' ? NaN : Number(raw);
  return Number.isFinite(n) ? n : dflt;
}
export const CROWN_RIM_PARAMS = {
  edge: rimKnob('DD_CROWN_RIM_EDGE', 'crownRimEdge', 0), // strength (n.v threshold scale); 0 is no rim (the default); the earlier rim is FOLIAGE_DETAIL.puffEdge
  cellA: rimKnob('DD_CROWN_RIM_CELLA', 'crownRimCellA', 0.75), // metres per cell, coarse octave
  cellB: rimKnob('DD_CROWN_RIM_CELLB', 'crownRimCellB', 0.36), // metres per cell, fine octave
  wB: rimKnob('DD_CROWN_RIM_WB', 'crownRimWB', 0.4), // weight of the fine octave; the coarse one has 1 - wB
  soft: rimKnob('DD_CROWN_RIM_SOFT', 'crownRimSoft', 0), // width in n.v of the coverage ramp (cards only); 0 discards outright
};
const rimNum = (v) => { const t = String(+Number(v).toFixed(4)); return /[.e]/.test(t) ? t : `${t}.0`; };

/**
 * taste W68: CARD_EDGE. A crown card is shaded with its lobe's outward normal (tree-forms.js, the vertex normal), not its plane's, so a
 * card seen edge-on (88 to 89 degrees from the view ray, 7 to 12 m wide) is lit like a patch of sphere and draws a long, flat, light
 * strip across the crown (g2-gateway-three, about 1.5 times as bright as the crown around it). 1 (the default) reads the knobs below:
 * `?cardEdgeLo=` and `?cardEdgeHi=` fade a card fragment's alpha (so its coverage, under alpha-to-coverage) by smoothstep(lo, hi, |n.v|),
 * n the card's plane normal from the screen derivatives of the view position; hi at or under lo is no fade; the default is 0.30 to 0.50. `?cardEdgeNormal=`
 * mixes the shading normal toward the plane normal (turned to the lobe normal's side) by that amount; 0 is the lobe's normal (the default).
 * Node: `DD_CARD_EDGE_LO`, `DD_CARD_EDGE_HI`, `DD_CARD_EDGE_NORMAL`. The knobs live in one shared uniform (`CARD_EDGE_UNIFORMS.uCardEdge`,
 * x lo, y hi, z normal mix) that every crown material reads, so a sheet can change them between shots. `?cardEdge=0` (node
 * `DD_CARD_EDGE=0`) restores the earlier shader text, uniforms and cache key exactly.
 */
export const CARD_EDGE = crownSwitch('DD_CARD_EDGE', 'cardEdge');
let cardEdgeOn = CARD_EDGE;
export function setCardEdge(v) { cardEdgeOn = v ? 1 : 0; }
export function cardEdgeActive() { return cardEdgeOn; }
export const CARD_EDGE_PARAMS = {
  lo: rimKnob('DD_CARD_EDGE_LO', 'cardEdgeLo', 0.30), // |n.v| where a card starts to show (orchestrator's pick, column F of the w68 sheet)
  hi: rimKnob('DD_CARD_EDGE_HI', 'cardEdgeHi', 0.50), // |n.v| where it is whole; hi at or under lo is no fade
  normal: rimKnob('DD_CARD_EDGE_NORMAL', 'cardEdgeNormal', 0), // share of the plane normal in the shading normal
};
export const CARD_EDGE_UNIFORMS = { uCardEdge: { value: new THREE.Vector3(CARD_EDGE_PARAMS.lo, CARD_EDGE_PARAMS.hi, CARD_EDGE_PARAMS.normal) } };

const BASE_KEY = 'ddfol1';

const PUFF_GLSL = `
float ddPuffH(ivec3 p) {
  uvec3 q = uvec3(p) * uvec3(1597334673u, 3812015801u, 2798796415u);
  uint n = (q.x ^ q.y ^ q.z) * 1597334673u;
  n ^= n >> 15u;
  n *= 2246822519u;
  n ^= n >> 13u;
  return float(n >> 8u) * (1.0 / 16777216.0);
}
float ddPuffNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  vec3 u = f * f * (3.0 - 2.0 * f);
  ivec3 c = ivec3(i);
  float a = mix(mix(ddPuffH(c), ddPuffH(c + ivec3(1, 0, 0)), u.x), mix(ddPuffH(c + ivec3(0, 1, 0)), ddPuffH(c + ivec3(1, 1, 0)), u.x), u.y);
  float b = mix(mix(ddPuffH(c + ivec3(0, 0, 1)), ddPuffH(c + ivec3(1, 0, 1)), u.x), mix(ddPuffH(c + ivec3(0, 1, 1)), ddPuffH(c + ivec3(1, 1, 1)), u.x), u.y);
  return mix(a, b, u.z) * 2.0 - 1.0;
}`;

// W21-A: the vertex half of a card, shared by the colour and the depth material. `card` is the aCard attribute (x flag, y
// outer end 0..1, z cell 0..3, w roll seed) and `cuv` the card's own uv; the cell and the turn in the plane come from the
// instance position, so two trees of one form hang different clusters. `cl` is the centred card coordinate (a disc of radius
// 0.5 holds the mask), `cc` the cell origin in the atlas.
const CARD_VERT_GLSL = `
void ddCardVertex(vec4 card, vec2 cuv, out vec2 cl, out vec2 cc) {
  #ifdef USE_INSTANCING
    vec3 o = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
  #else
    vec3 o = modelMatrix[3].xyz;
  #endif
  ivec3 q = ivec3(floor(o * 3.0));
  float h1 = ddPuffH(q);
  float h2 = ddPuffH(q + ivec3(7, 3, 11));
  float cell = mod(card.z + floor(h1 * 4.0), 4.0);
  cc = vec2(mod(cell, 2.0), floor(cell / 2.0)) * 0.5;
  float ang = h2 * 6.2831853;
  vec2 p = cuv - 0.5;
  float cs = cos(ang);
  float sn = sin(ang);
  cl = vec2(p.x * cs - p.y * sn, p.x * sn + p.y * cs);
}`;

let cardDepth = null;
/**
 * W21-A: the shadow caster of a mesh whose crowns carry cards. A square quad would throw a square shadow, so the depth pass
 * reads the same mask and drops what the card drops. Core faces keep the back-face-only rule of the W20 shadow pass.
 */
export function crownCardDepthMaterial() {
  if (cardDepth) return cardDepth;
  const { texture, ready } = loadCoastPack('crown');
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  m.userData.crownCardDepth = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uCardPack = { value: texture };
    shader.uniforms.uCardReady = ready;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aCard;
varying vec4 vCardA;
varying vec2 vCardL;
varying vec2 vCardC;
${PUFF_GLSL}
${CARD_VERT_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vCardA = aCard;
ddCardVertex(aCard, uv, vCardL, vCardC);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uCardPack;
uniform float uCardReady;
varying vec4 vCardA;
varying vec2 vCardL;
varying vec2 vCardC;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
if (vCardA.x > 0.5) {
  float ca = texture2D(uCardPack, vCardC + (vCardL + 0.5) * 0.5).r * (1.0 - smoothstep(0.47, 0.5, length(vCardL)));
  if (ca * uCardReady < 0.5) discard;
} else if (gl_FrontFacing) discard;`);
  };
  m.customProgramCacheKey = () => 'ddcarddepth1';
  cardDepth = m;
  return m;
}

/**
 * Patch a MeshStandardMaterial. `opts.lite` drops the second fine lookup (low quality tier).
 * `opts.puff` (W20) also breaks the crown outline in the vertex stage (see FOLIAGE_DETAIL.puff); only crown forms whose
 * coincident vertices share a normal may ask for it.
 * Returns the same material. Chains with an existing onBeforeCompile.
 */
export function applyFoliageDetail(material, opts = {}) {
  if (!material || !(FOLIAGE_DETAIL.gain > 0) || material.userData.foliageDetail) return material;
  const { texture, ready } = loadCoastPack('foliage');
  const lite = !!opts.lite;
  const puff = !!opts.puff && FOLIAGE_DETAIL.puff > 0;
  // W21-A: the card path only for crown forms that ask (`opts.cards`) while tree-forms.js has the cards switched on.
  const cards = puff && !!opts.cards && !!crownCardsActive();
  const crown = cards ? loadCoastPack('crown') : null;
  // taste-r1 (W26): CROWN_SHADE_WARM, for crown materials only (those asking for cards): warm the sky's share on shaded fragments.
  // taste W28 (HEDGEROW_FORM): the hinterland hedge's material asks for the same warming (`opts.shadeWarm`) without cards or puff.
  const shade = (puff && !!opts.cards && !!crownShadeWarmActive()) || !!opts.shadeWarm;
  // taste W43 (TRUNK_BARK): the bark term only for the materials that ask; off, the shader text and the cache key are as before.
  const bark = puff && !!opts.trunkBark && !!trunkBarkActive();
  // taste W63 (CROWN_RIM): the rim's knobs only for a crown material; off, the shader text, uniforms and cache key are as before.
  const rim = puff && !!crownRimActive();
  const rimP = CROWN_RIM_PARAMS;
  const rimSoft = rim && cards && rimP.soft > 0;
  // taste W68 (CARD_EDGE): the cards' edge-on fade and plane-normal mix, for crown materials with cards only; off, the shader text, uniforms and cache key are as before.
  const edge = cards && !!cardEdgeActive();
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey ? material.customProgramCacheKey.bind(material) : null;
  const F = FOLIAGE_DETAIL;
  const uniforms = {
    uFolPack: { value: texture },
    uFolReady: ready,
    uFolGain: { value: F.gain },
    uFolFine: { value: F.fineM },
    uFolBroad: { value: F.broadM },
    uFolLum: { value: new THREE.Vector2(F.lumFine, F.lumBroad) },
    uFolUnder: { value: F.under },
    uFolHue: { value: F.hue },
    uFolMottle: { value: F.mottle },
    uFolBump: { value: F.bump },
    uFolFade: { value: new THREE.Vector2(F.fadeNear, F.fadeFar) },
    uFolWarm: { value: new THREE.Vector3(F.warmHue, F.warmLum, F.warmBump) },
    uFolRatio: { value: new THREE.Vector2(F.barkRatioLo, F.barkRatioHi) },
    uFolPuff: { value: new THREE.Vector4(F.puff * F.puffReach, 1 / F.puffBigM, 1 / F.puffSmallM, F.puffDark * F.puff) },
    uFolEdge: { value: (rim ? CROWN_RIM_PARAMS.edge : F.puffEdge) * F.puff },
    uBark: { value: new THREE.Vector4(bark ? F.barkGain : 0, F.barkFadeNear, F.barkFadeFar, F.barkStreakM) },
    ...(cards ? {
      uCardPack: { value: crown.texture },
      uCardReady: crown.ready,
      uCardTone: { value: new THREE.Vector4(F.cardTone, F.cardInner, F.cardOuter, F.cardDepth) },
      uCardMip: { value: new THREE.Vector3(F.cardMip, F.cardGain, F.cardDetail) },
      ...(edge ? CARD_EDGE_UNIFORMS : {}),
    } : {}),
  };
  material.userData.foliageDetail = uniforms;
  if (cards) {
    // Alpha-tested, never blended: the alpha goes to the sample mask. A card is seen from both sides, a core face from the front only (see the fragment stage).
    material.alphaToCoverage = true;
    material.side = THREE.DoubleSide;
    material.userData.crownCards = true;
  }

  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vFolW;
varying vec3 vFolN;
varying float vFolR;
varying float vFolP;${bark ? '\nvarying float vBarkL;' : ''}
${puff ? `uniform vec4 uFolPuff;
uniform vec2 uFolRatio;
${PUFF_GLSL}` : ''}
${cards ? `attribute vec4 aCard;
varying vec4 vCardA;
varying vec2 vCardL;
varying vec2 vCardC;
${CARD_VERT_GLSL}` : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec4 fp = vec4(transformed, 1.0);
  vec3 fo = objectNormal;
  #ifdef USE_INSTANCING
    fp = instanceMatrix * fp;
    fo = mat3(instanceMatrix) * fo;
  #endif
  vFolW = (modelMatrix * fp).xyz;
  vFolN = mat3(modelMatrix) * fo;
  #ifdef USE_COLOR
    vFolR = color.r / max(color.g, 0.02);
  #else
    vFolR = 0.0;
  #endif
  vFolP = 0.0;${bark ? '\n  // W43: 0 on the bole, 1 on a limb that spreads well away from the trunk axis (its vertical streaks are then dropped).\n  vBarkL = smoothstep(0.18, 0.5, length(transformed.xz) / max(transformed.y, 3.0));' : ''}
  ${cards ? `vCardA = aCard;
  ddCardVertex(aCard, uv, vCardL, vCardC);` : ''}
  ${puff ? `{
    // W20: swell and pinch along the vertex's own normal. The noise reads the world position of the unmoved vertex, so
    // it does not swim and two vertices at one place (they share a normal in these forms) move together: no cracks.
    float leafM = 1.0 - smoothstep(uFolRatio.x, uFolRatio.y, vFolR);
    ${cards ? 'leafM *= 1.0 - aCard.x;' : ''}
    vec3 pw = vFolW;
    float d = ddPuffNoise(pw * uFolPuff.y) * 0.80 + ddPuffNoise(pw * uFolPuff.z + 17.3) * 0.20;
    d = clamp(d * 2.3, -1.0, 1.0);
    float reach = uFolPuff.x * max(length(transformed.xz), 1.2);
    transformed += objectNormal * (d * reach * leafM);
    vFolP = clamp(-d, 0.0, 1.0) * leafM;
  }` : ''}
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
${COAST_DETAIL_GLSL}
uniform sampler2D uFolPack;
uniform float uFolReady;
uniform float uFolGain;
uniform float uFolFine;
uniform float uFolBroad;
uniform vec2 uFolLum;
uniform float uFolUnder;
uniform float uFolHue;
uniform float uFolMottle;
uniform float uFolBump;
uniform vec2 uFolFade;
uniform vec2 uFolRatio;
uniform vec3 uFolWarm;
varying vec3 vFolW;
varying vec3 vFolN;
varying float vFolR;
varying float vFolP;${bark ? '\nuniform vec4 uBark;\nvarying float vBarkL;' : ''}
${puff ? 'uniform vec4 uFolPuff;\nuniform float uFolEdge;' : ''}
${cards ? `uniform sampler2D uCardPack;
uniform float uCardReady;
uniform vec4 uCardTone;
uniform vec3 uCardMip;${edge ? '\nuniform vec3 uCardEdge;\nvec3 ddCardPN = vec3(0.0, 0.0, 1.0);' : ''}
varying vec4 vCardA;
varying vec2 vCardL;
varying vec2 vCardC;` : ''}
float ddFolK = 0.0;
vec2 ddFolDH = vec2(0.0);
vec3 ddFolTri(vec3 p, vec3 b) {
  return texture2D(uFolPack, p.zy).rgb * b.x + texture2D(uFolPack, p.xz).rgb * b.y + texture2D(uFolPack, p.xy).rgb * b.z;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 fn = normalize(vFolN);
  vec3 fb = pow(abs(fn), vec3(3.0));
  fb /= (fb.x + fb.y + fb.z);
  vec3 fw = vFolW;
  vec2 wr = vec2(fw.x + fw.y * 0.6, fw.z - fw.y * 0.45) / 5.0;
  vec3 warp = vec3(ddCoastNoise(wr), ddCoastNoise(wr + vec2(19.3, 7.1)), ddCoastNoise(wr + vec2(3.7, 41.9))) - 0.5;
  vec3 fine1 = ddFolTri((fw + warp * 0.55) / uFolFine, fb);
  float lumF = fine1.r * (255.0 / 128.0);
  ${lite ? '' : `vec3 rw = vec3(0.7986 * fw.x + 0.6018 * fw.z, fw.y, -0.6018 * fw.x + 0.7986 * fw.z);
  vec3 fine2 = ddFolTri(rw / (uFolFine * 1.37) + 0.31, fb);
  lumF = (lumF + fine2.r * (255.0 / 128.0)) * 0.5;
  lumF = 1.0 + (lumF - 1.0) * 1.35;`}
  vec3 bw = vec3(0.6018 * fw.x - 0.7986 * fw.z, fw.y, 0.7986 * fw.x + 0.6018 * fw.z);
  float lumB = ddFolTri(bw / uFolBroad + 0.17, fb).g * (255.0 / 128.0);
  vec3 mp = vec3(fw.x + fw.y * 0.35, fw.y * 1.25, fw.z - fw.y * 0.2);
  float nA = ddCoastNoise(vec2(mp.x + mp.y * 0.7, mp.z - mp.y * 0.5) / 2.9 + 11.0);
  float nB = ddCoastNoise(vec2(mp.x - mp.y * 0.4, mp.z + mp.y * 0.8) / 1.25 + 47.0);
  float nC = ddCoastNoise(vec2(mp.x + mp.z * 0.3, mp.y * 1.6 + mp.z * 0.4) / 0.62 + 5.0);
  float px = length(fwidth(fw));
  float wB = 1.0 - smoothstep(0.22, 0.65, px / 1.25);
  float wC = 1.0 - smoothstep(0.22, 0.65, px / 0.62);
  nB = mix(0.5, nB, wB);
  nC = mix(0.5, nC, wC);
  float mot = (nA * 0.42 + nB * 0.38 + nC * 0.20 - 0.5) * 3.0;
  float fade = 1.0 - smoothstep(uFolFade.x, uFolFade.y, length(vViewPosition));
  float leaf = 1.0 - smoothstep(uFolRatio.x, uFolRatio.y, vFolR);
  float k = leaf * uFolGain * uFolReady;
  ${cards ? 'k *= mix(1.0, uCardMip.z, step(0.5, vCardA.x));' : ''}
  float warm = smoothstep(1.02, 1.25, diffuseColor.r / max(diffuseColor.g, 1e-3)) * leaf;
  float wLum = mix(1.0, uFolWarm.y, warm);
  float s = 1.0 + ((lumF - 1.0) * uFolLum.x * fade + (lumB - 1.0) * uFolLum.y + mot * uFolMottle) * wLum;
  s = clamp(s, 0.45, 1.6);
  float under = mix(1.0 - uFolUnder, 1.0 + 0.4 * uFolUnder, smoothstep(-0.6, 0.8, fn.y));
  float t = clamp(0.5 + (s - 1.0) * 1.1 + (fn.y - 0.3) * 0.25, 0.0, 1.0);
  vec3 tint = mix(vec3(1.0), mix(vec3(0.95, 0.985, 1.05), vec3(1.05, 1.015, 0.94), t), uFolHue * mix(1.0, uFolWarm.x, warm));
  diffuseColor.rgb *= mix(vec3(1.0), tint * s * under, k);
  ${puff ? 'diffuseColor.rgb *= 1.0 - uFolPuff.w * vFolP * leaf;' : ''}${bark ? `
  {
    // taste W43 (TRUNK_BARK): river red gum mottle, luminance only, on the bark side of the leaf mask. The tubes carry no uv, so
    // the noise reads the world position, projected on the two vertical planes by the horizontal part of the normal (a vertical
    // tube has no seam and nothing swims). Patches of 0.3 to 0.8 m (two octaves) and streaks one cell across and six tall; the
    // streaks go where the surface is a trunk and not a limb (faces turned up or down, and spreading limbs, lose them), and
    // fade as a pixel nears a streak's width. Faded to nothing between uBark.y and uBark.z metres from the camera.
    float bf = (1.0 - leaf) * uBark.x * (1.0 - smoothstep(uBark.y, uBark.z, length(vViewPosition)));
    if (bf > 0.0005) {
      float bh = max(fn.x * fn.x + fn.z * fn.z, 1e-4);
      float bz = fn.z * fn.z / bh;
      float bx = 1.0 - bz;
      float bm = ${F.barkPatchM.toFixed(3)};
      float bs = uBark.w;
      float p1 = ddCoastNoise(vec2(fw.x, fw.y * 0.8) / bm + 3.1) * bz + ddCoastNoise(vec2(fw.z, fw.y * 0.8) / bm + 8.7) * bx;
      float p2 = ddCoastNoise(vec2(fw.x, fw.y * 0.9) / (bm * 0.5) + 21.0) * bz + ddCoastNoise(vec2(fw.z, fw.y * 0.9) / (bm * 0.5) + 14.4) * bx;
      float st = ddCoastNoise(vec2(fw.x / bs, fw.y / (bs * 6.0)) + 5.0) * bz + ddCoastNoise(vec2(fw.z / bs, fw.y / (bs * 6.0)) + 31.0) * bx;
      float sw = (1.0 - smoothstep(0.3, 0.75, abs(fn.y))) * (1.0 - vBarkL) * (1.0 - smoothstep(0.3 * bs, 0.65 * bs, px));
      float bd = (p1 - 0.5) + (p2 - 0.5) * 0.5 + (st - 0.5) * 0.7 * sw;
      diffuseColor.rgb *= 1.0 + clamp(bd / 0.25, -1.0, 1.0) * bf;
    }
  }` : ''}
  float h = fine1.b * (255.0 / 128.0) * fade + (nB * 0.8 + nC * 0.5) * 2.2;
  ddFolDH = vec2(dFdx(h), dFdy(h)) * uFolBump * mix(1.0, uFolWarm.z, warm);
  ddFolK = k${cards ? ' * (1.0 - step(0.5, vCardA.x))' : ''};
  ${cards ? `{
    // W21-A: a card is a painted leaf mass. The atlas gives its mask, tone and depth; the inner end is darker and the outer end
    // lighter; the alpha is sharpened to a one-pixel edge near the camera and gives way to plain alpha at coarse mips, so a far
    // card keeps its cover (alpha-to-coverage turns that alpha into samples).${edge ? `
    // taste W68 (CARD_EDGE): the card's plane normal from the derivatives of the view position (outside the branch, so the
    // derivatives are taken in uniform flow); the fade and the normal mix below read it.
    vec3 cePn = cross(dFdx(vViewPosition), dFdy(vViewPosition));
    ddCardPN = cePn * inversesqrt(max(dot(cePn, cePn), 1e-20));` : ''}
    if (vCardA.x > 0.5) {
      float cr = length(vCardL);
      vec2 auv = vCardC + (vCardL + 0.5) * 0.5;
      vec3 ct = texture2D(uCardPack, auv).rgb;
      vec2 gx = dFdx(auv) * 512.0;
      vec2 gy = dFdy(auv) * 512.0;
      float lod = 0.5 * log2(max(max(dot(gx, gx), dot(gy, gy)), 1e-4));
      float am = ct.r;
      float sharp = clamp((am - 0.5) / max(fwidth(am), 0.03) + 0.5, 0.0, 1.0);
      float plain = clamp((am - 0.12) * uCardMip.y, 0.0, 1.0);
      float ca = mix(sharp, plain, smoothstep(uCardMip.x, uCardMip.x + 2.0, lod));
      ca *= (1.0 - smoothstep(0.47, 0.5, cr)) * uCardReady;${edge ? `
      // taste W68 (CARD_EDGE): a card seen edge-on gives its alpha (its coverage) away; hi at or under lo is no fade.
      if (uCardEdge.y > uCardEdge.x) ca *= smoothstep(uCardEdge.x, uCardEdge.y, abs(dot(ddCardPN, normalize(vViewPosition))));` : ''}
      if (ca < 0.004) discard;
      float grad = mix(uCardTone.y, uCardTone.z, smoothstep(0.0, 1.0, vCardA.y));
      float tone = mix(1.0, ct.g * (255.0 / 128.0), uCardTone.x);
      diffuseColor.rgb *= tone * grad * (1.0 - uCardTone.w * ct.b);
      diffuseColor.a = ca;
    } else if (!gl_FrontFacing) discard;
  }` : ''}
}`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
${cards ? (edge ? `if (vCardA.x > 0.5) {
  normal = normalize(vNormal);
  // taste W68 (CARD_EDGE): toward the card's plane normal, turned to the lobe normal's side.
  if (uCardEdge.z > 0.0) normal = normalize(mix(normal, ddCardPN * (dot(ddCardPN, normal) < 0.0 ? -1.0 : 1.0), uCardEdge.z));
}` : 'if (vCardA.x > 0.5) normal = normalize(vNormal);') : ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 sx = normalize(dFdx(-vViewPosition));
  vec3 sy = normalize(dFdy(-vViewPosition));
  vec3 r1 = cross(sy, normal);
  vec3 r2 = cross(normal, sx);
  float det = dot(sx, r1) * faceDirection;
  vec3 grad = sign(det) * (ddFolDH.x * r1 + ddFolDH.y * r2);
  normal = normalize(mix(normal, normalize(abs(det) * normal - grad), ddFolK));
  ${puff ? `{
    // W20: a ragged rim. Leaf seen edge-on is dropped where a fine world-space noise says so, so the outline is
    // made of leaf masses and gaps; the sky and the crown behind show through the gaps.
    float ndv = abs(dot(normal, normalize(vViewPosition)));
    float leafE = 1.0 - smoothstep(uFolRatio.x, uFolRatio.y, vFolR);
    vec3 ew = vFolW;
    // taste-r1 (W20 review): 0.34 m and 0.15 m were under a pixel at the venue cameras, so the rim was a saw-tooth that would shimmer in motion; gaps of 0.75 m and 0.36 m span two to three pixels.
    float en = ddCoastNoise(vec2(ew.x + ew.y * 0.8, ew.z - ew.y * 0.6) / ${rim ? rimNum(rimP.cellA) : '0.75'}) * ${rim ? rimNum(1 - rimP.wB) : '0.6'} + ddCoastNoise(vec2(ew.z + ew.y * 0.5, ew.x + ew.y * 0.3) / ${rim ? rimNum(rimP.cellB) : '0.36'} + 9.0) * ${rim ? rimNum(rimP.wB) : '0.4'};
    float edgeFade = 1.0 - smoothstep(500.0, 1200.0, length(vViewPosition));
${rimSoft ? `    // taste W63 (CROWN_RIM): over ${rimNum(rimP.soft)} of n.v the rim gives its alpha to coverage (the core fragment is half there at the threshold) instead of dropping the fragment.
    if (leafE > 0.5 && vCardA.x < 0.5) {
      float rimA = clamp((ndv - uFolEdge * edgeFade * (0.15 + 1.0 * en) * 1.0 * uFolReady) / ${rimNum(rimP.soft)} + 0.5, 0.0, 1.0);
      if (rimA < 0.004) discard;
      diffuseColor.a *= rimA;
    }
` : `    if (leafE > 0.5 ${cards ? '&& vCardA.x < 0.5 ' : ''}&& ndv < uFolEdge * edgeFade * (0.15 + 1.0 * en) * 1.0 * uFolReady) discard;
`}  }` : ''}
}`);
    if (shade) {
      // taste-r1 (W26): a fragment turned away from the key (the rig's first directional light, the only shadow caster) is lit by
      // the cool fill, rim and sky terms alone; they are warmed there (diffuse and reflection), so olive leaf stays olive and
      // bark stays brown in shade. A fragment facing the key (n.l at CROWN_SHADE_WARM_PARAMS.hi and over) is not touched.
      const P = CROWN_SHADE_WARM_PARAMS;
      const v3 = (a) => a.map((v) => v.toFixed(2)).join(', ');
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
#if NUM_DIR_LIGHTS > 0
{
  float fsShade = 1.0 - smoothstep(${P.lo.toFixed(3)}, ${P.hi.toFixed(3)}, dot(normal, directionalLights[0].direction));
  vec3 fsLift = mix(vec3(1.0), vec3(${v3(P.lift)}), fsShade);
  reflectedLight.directDiffuse *= fsLift;
  reflectedLight.indirectDiffuse *= fsLift;
  reflectedLight.indirectSpecular *= mix(vec3(1.0), vec3(${v3(P.spec)}), fsShade);
}
#endif`);
    }
  };
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|${BASE_KEY}${lite ? 'L' : 'F'}${puff ? 'P' : ''}${cards ? 'C' : ''}${edge ? 'E' : ''}${bark ? `B${F.barkPatchM}` : ''}${rim && (rimP.cellA !== 0.75 || rimP.cellB !== 0.36 || rimP.wB !== 0.4 || rimSoft) ? `R${rimP.cellA}_${rimP.cellB}_${rimP.wB}_${rimSoft ? rimP.soft : 0}` : ''}${shade ? `W${CROWN_SHADE_WARM_PARAMS.lift.join('_')}${CROWN_SHADE_WARM_PARAMS.spec.join('_')}${CROWN_SHADE_WARM_PARAMS.lo}_${CROWN_SHADE_WARM_PARAMS.hi}` : ''}`;
  material.needsUpdate = true;
  return material;
}
