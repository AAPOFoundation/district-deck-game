// District Deck: real tree and plant forms (wave eleven, lane W11-A).
//
// Pure geometry builders, no scene access, no Math.random. Every builder takes
// `{ variant, seed, tier }` and returns a merged, indexed BufferGeometry with
// `position`, `normal` and `color`. The `color` attribute is a MULTIPLIER around 1
// (baked occlusion and per-lobe tint jitter), so the instance colour or material
// colour still sets the hue. There is no `uv` and no alpha anywhere: every surface
// is a closed, lit solid (or, for blades, a strip meant for a double-sided material).
//
// Same inputs give byte-identical buffers; `tests/tree-forms.test.mjs` hashes them.
//
// THE LOBE RULE (eucalypt and cypress crowns, brief W11-A section 3): each lobe is
// an icosphere (midpoint subdivision: level 1 = 80 faces, level 2 = 320), stretched,
// flattened underneath and displaced by two octaves of value noise (12 to 18% of its
// radius). Neighbouring lobes overlap by at least 30% of the smaller radius so a crown
// is one mass, and faces that end up inside a neighbouring lobe are dropped (they can
// never be seen), which is what lets the backdrop tier carry six to nine lobes inside
// 520 triangles. Normals are blended 66% toward the lobe's ellipsoid normal so the
// shading is soft. Occlusion in `color`: lobe undersides 30% darker, the crown interior
// darker than its rim, creases between lobes darker, upper lobes lightest.

import * as THREE from 'three';
import { TASTE } from './taste-tokens.js';

const TAU = Math.PI * 2;

/** Triangle ceilings from the brief (section 5), enforced by the builders. */
export const FORM_BUDGET = Object.freeze({
  eucalypt: Object.freeze({ backdrop: 520, hero: 2400 }),
  cypress: Object.freeze({ backdrop: 380, hero: 2400 }),
  plane: Object.freeze({ backdrop: 520, hero: 2400 }),
  norfolk: Object.freeze({ backdrop: 520, hero: 2400 }),
  weeping: Object.freeze({ backdrop: 520, hero: 2400 }),
  snowGum: Object.freeze({ backdrop: 520, hero: 2400 }),
  shrub: Object.freeze({ backdrop: 120, hero: 2400 }),
});

/**
 * taste-r1 (W21-A): the crown-card switch. 1 builds the eucalypt, cypress and plane crowns as Pocket Reserve builds its
 * trees: a core (the lobes shrunk to `core` of their radius about their centres and darkened to `coreDark`) with alpha-masked
 * leaf-cluster cards hung on the old shell (`MeshAcc.toGeometry` appends them, so `fitBudget` still sees the core only).
 * 0 restores wave twenty exactly: no extra attribute, no extra vertex, the same buffers and hashes. A form takes
 * `cards: false` to opt out (the windbreak rows and any merged geometry do, because a merge drops the card attributes).
 */
export const CROWN_CARDS = 1;
export const CROWN_CARD_PARAMS = {
  core: 0.86, // taste-r1 (W21 review): 0.64 left thin, twiggy crowns with the branch skeleton showing (stations 11 and 18); the crown keeps its mass and the cards fray it
  // radius of the core lobes, as a fraction of the old lobe
  coreDark: 0.88, // value of the core against the old crown
  minCards: 8,
  maxCards: 15, // two triangles each: at most 28 per tree
  sizeLo: 1.2, // card width in lobe radii
  sizeHi: 1.9,
  shell: 1.0, // card centre on the old shell, as a fraction of the lobe radius
  tiltLo: 25, // elevation of the card's normal above the horizontal (the plane leans 90 minus this from horizontal)
  tiltHi: 60,
  tone: 1.03, // (W21 review) 1.14 read as pale paper cut-outs against the core
  // card value against the old crown value
};
/** Triangles held back from a form's ceiling for its cards (15 quads at most). */
const CARD_TRIS = 30;
let cardsActive = CROWN_CARDS;
/** For tests and the orchestrator's A/B: switch the cards for forms built from now on (the shipped value is CROWN_CARDS). */
export function setCrownCards(v) { cardsActive = v ? 1 : 0; }
export function crownCardsActive() { return cardsActive; }

/**
 * taste-r1 (W25): a switch read from node (`DD_<NAME>=0`) or from the page (`?<param>=0`); anything else is on.
 * The three crown switches below and venue-trees.js's AUTUMN_SET use it; 0 restores wave twenty-four exactly.
 */
export function crownSwitch(envName, param) {
  if (typeof process !== 'undefined' && process?.env?.[envName] !== undefined) return Number(process.env[envName]) > 0 ? 1 : 0;
  return typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get(param) === '0' ? 0 : 1;
}

/**
 * taste-r1 (W25): CROWN_GREENS. 1 gives each crown species its own hue and value (TASTE.foliage.crownGreens: eucalypt grey-olive,
 * cypress dark blue-green, plane and elm a fresh mid green, weeping silvery, shrubs yellower), as a multiplier in the crown's
 * vertex colour (the target over the instance colour the caller gives the species, tint included, so the crown wears the target). One
 * form differs from the next of its species by up to 5 degrees of hue either way and 5 percent of value (variant and seed
 * decide), and each lobe and card by up to 3 degrees of hue. Browser: `?crownGreens=0`; node: `DD_CROWN_GREENS=0`;
 * tests may call `setCrownGreens`. 0 restores wave twenty-four exactly: the same buffers and hashes.
 */
export const CROWN_GREENS = crownSwitch('DD_CROWN_GREENS', 'crownGreens');
let greensActive = CROWN_GREENS;
export function setCrownGreens(v) { greensActive = v ? 1 : 0; }
export function crownGreensActive() { return greensActive; }
export const CROWN_GREEN_PARAMS = {
  formHueDeg: 5, // form to form, either way
  formValue: 0.05, // form to form, either way (a spread of 10 percent)
  cardHueDeg: 3, // lobe to lobe and card to card, either way
};

/**
 * taste-r1 (W26): CROWN_SHADE_WARM. A crown's shaded half is lit by the sky alone and receives about 0.07 of the lit half's red,
 * 0.14 of its green and 0.33 of its blue, so the olive albedo read teal there and the pale bark read lavender. 1 does two
 * things: foliage-detail.js warms the cool light (fill, rim, sky, diffuse and reflection) on fragments turned away from the key
 * (`CROWN_SHADE_WARM_PARAMS`; a fragment facing the key is not touched), and the eucalypt's bark multiplier is taken to the
 * browner TASTE.foliage.trunkPale. Browser: `?crownShadeWarm=0`; node: `DD_CROWN_SHADE_WARM=0`; tests may call
 * `setCrownShadeWarm`. 0 restores the earlier shader text, buffers and hashes.
 */
export const CROWN_SHADE_WARM = crownSwitch('DD_CROWN_SHADE_WARM', 'crownShadeWarm');
let shadeWarmActive = CROWN_SHADE_WARM;
export function setCrownShadeWarm(v) { shadeWarmActive = v ? 1 : 0; }
export function crownShadeWarmActive() { return shadeWarmActive; }
export const CROWN_SHADE_WARM_PARAMS = {
  lift: [1.35, 1.0, 0.45], // multiplier on the cool light (fill, rim, sky) in full shade (luminance about held: red up, blue down)
  spec: [1.0, 0.8, 0.45], // multiplier on the sky's reflection in full shade (the ground's shadeWarm pattern)
  lo: 0.0, // n.l against the key at and under which a fragment is in full shade
  hi: 0.25, // n.l at and over which a fragment is lit and untouched
};
/**
 * taste W43: TRUNK_BARK. 1 takes the eucalypt's pale bark to TASTE.foliage.trunkBark (a warm grey-tan, H 34, S 24, the luminance of
 * trunkPale) and, in foliage-detail.js, gives bark on the hinterland trees a luminance mottle of irregular patches and faint
 * vertical streaks from world position, fading out between 40 m and 120 m from the camera. It needs CROWN_SHADE_WARM (it replaces
 * that switch's bark token). Browser: `?trunkBark=0`; node: `DD_TRUNK_BARK=0`; tests may call `setTrunkBark`. 0 restores
 * wave forty-two exactly: the same buffers and shader text.
 */
export const TRUNK_BARK = crownSwitch('DD_TRUNK_BARK', 'trunkBark');
let trunkBarkOn = TRUNK_BARK;
export function setTrunkBark(v) { trunkBarkOn = v ? 1 : 0; }
export function trunkBarkActive() { return trunkBarkOn; }
const BARK_PALE_LIN = { v: null, tb: null };
/** The caller's pale bark multiplier (rockLight pulled 45% to the trunk token, over the instance colour) taken to the warm token. */
function warmBark(bark) {
  if (!shadeWarmActive || bark === DEFAULT_BARK) return bark;
  const key = trunkBarkOn ? 'tb' : 'v';
  if (!BARK_PALE_LIN[key]) {
    const old = new THREE.Color(TASTE.ground.rockLight).lerp(new THREE.Color(TASTE.foliage.trunk), 0.45);
    const nw = new THREE.Color(trunkBarkOn ? TASTE.foliage.trunkBark : TASTE.foliage.trunkPale);
    BARK_PALE_LIN[key] = [nw.r / old.r, nw.g / old.g, nw.b / old.b];
  }
  return bark.map((b, ch) => b * BARK_PALE_LIN[key][ch]);
}
/**
 * The instance colour each caller gives a species today: [token, token to blend toward, blend, the caller's green tint]. The
 * tint turns every species toward the same yellow-green (all four sit within 2 degrees of hue after it), so the target below is
 * taken over the tinted colour: a crown wears the target as it stands, and the tint no longer pulls the species together.
 */
const GREEN_BASE = {
  plane: [TASTE.foliage.leafB, TASTE.foliage.leafA, 0.30, [0.97, 1.10, 0.54]],
  eucalypt: [TASTE.foliage.leafGrey, TASTE.foliage.leafB, 0.75, [0.95, 1.12, 0.52]],
  cypress: [TASTE.foliage.leafA, null, 0, [1.0, 1.12, 0.55]],
  weeping: [TASTE.foliage.leafGrey, TASTE.foliage.leafB, 0.45, [0.95, 1.12, 0.55]],
  shrub: [TASTE.foliage.leafA, null, 0, [1, 1, 1]], // the fringe tints a tuft with the token alone
};

/**
 * taste-r1 (W25): CROWN_CARD_TIERS. 1 lets the far tier (every form but `tier: 'hero'`, which is the near one) carry about half
 * the cards, each larger so the outline holds; the near tier keeps today's count. Browser: `?crownCardTiers=0`; node:
 * `DD_CROWN_CARD_TIERS=0`; tests may call `setCrownCardTiers`. 0 restores wave twenty-four exactly.
 */
export const CROWN_CARD_TIERS = crownSwitch('DD_CROWN_CARD_TIERS', 'crownCardTiers');
let tiersActive = CROWN_CARD_TIERS;
export function setCrownCardTiers(v) { tiersActive = v ? 1 : 0; }
export function crownCardTiersActive() { return tiersActive; }
export const CROWN_CARD_TIER_PARAMS = {
  farShare: 0.5, // the far tier keeps this share of the near cards (the near sequence, spread evenly, so the kept cards stand where they stood)
  farMin: 6, // but never fewer than this (the near tier's floor is 8)
  farSizeMax: 1.38, // card width against the near card: the root of the count ratio (half the cards cover as much at 1.41), never above this
};

/** A deterministic unit from two integers (no draw from a form's own generator, so a switch at 0 keeps every sequence). */
function hash01(a, b = 0) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const GREEN_CACHE = new Map();
const LINEAR_TMP = { r: 0, g: 0, b: 0 };
function greenBase(species) {
  let b = GREEN_CACHE.get(species);
  if (b) return b;
  const spec = GREEN_BASE[species];
  const target = TASTE.foliage.crownGreens[species];
  if (!spec || !target) return null;
  const old = new THREE.Color(spec[0]);
  if (spec[1]) old.lerp(new THREE.Color(spec[1]), spec[2]);
  old.r *= spec[3][0]; old.g *= spec[3][1]; old.b *= spec[3][2];
  const t = new THREE.Color(target).getRGB(LINEAR_TMP, THREE.SRGBColorSpace);
  const mx = Math.max(t.r, t.g, t.b); const mn = Math.min(t.r, t.g, t.b); const d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === t.r) h = ((t.g - t.b) / d + 6) % 6;
    else if (mx === t.g) h = (t.b - t.r) / d + 2;
    else h = (t.r - t.g) / d + 4;
  }
  b = { old: [old.r, old.g, old.b], h: h * 60, s: mx ? d / mx : 0, v: mx };
  GREEN_CACHE.set(species, b);
  return b;
}

/** The multiplier (linear rgb) that takes the caller's species colour to the target, turned `dh` degrees and scaled `gv` in value. */
function greenMul(base, dh, gv) {
  const h = (((base.h + dh) % 360) + 360) % 360 / 60;
  const v = base.v * gv; const c = v * base.s; const x = c * (1 - Math.abs((h % 2) - 1)); const m = v - c;
  const k = Math.floor(h) % 6;
  const rgb = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][k];
  const lin = new THREE.Color().setRGB(rgb[0] + m, rgb[1] + m, rgb[2] + m, THREE.SRGBColorSpace);
  return [lin.r / base.old[0], lin.g / base.old[1], lin.b / base.old[2]];
}

/**
 * What the switches change for one crown: `green` (the species base and the form's own roll), `far` (fewer, larger cards) and
 * `tones` (autumn tones, each { w, mul: [r, g, b] } ordered from low in the crown to high; the caller builds them over its own
 * autumn colour). null when no switch applies, so a crown built with all three at 0 takes no new branch.
 */
function crownLook(species, variant, seed, tier, tones) {
  const far = !!tiersActive && tier !== 'hero';
  const tn = tones && tones.length ? tones : null;
  const v3 = ((variant % 3) + 3) % 3;
  const salt = strHash(`${species}:${v3}:${seed}`);
  let green = null;
  const base = greensActive && !tn ? greenBase(species) : null;
  if (base) {
    const P = CROWN_GREEN_PARAMS;
    const u = (v3 / 3 + hash01(strHash(species), seed)) % 1;
    const w = (u * 2.7 + 0.3) % 1;
    green = { base, dh: (u - 0.5) * 2 * P.formHueDeg, gv: 1 + (w - 0.5) * 2 * P.formValue };
  }
  if (!green && !far && !tn) return null;
  let tot = 0; const mean = [0, 0, 0];
  if (tn) {
    for (const t of tn) tot += t.w;
    for (const t of tn) for (let ch = 0; ch < 3; ch += 1) mean[ch] += t.mul[ch] * t.w / tot;
  }
  return { green, far, tones: tn, tot, mean, salt };
}

/**
 * The colour multiplier of one lobe or card (`key` an integer, `hf` its height in the crown 0..1), or null. Autumn tones are
 * picked by a hash with a lean toward the low tones low in the crown; `blend` below 1 pulls a pick toward the tones' mean (the core).
 */
function lookMul(look, key, hf, blend = 1) {
  if (!look) return null;
  if (look.tones) {
    const u = Math.min(0.999, Math.max(0, hash01(key, look.salt) + (hf - 0.5) * 0.35)) * look.tot;
    let acc = 0; let pick = look.tones[look.tones.length - 1];
    for (const t of look.tones) { acc += t.w; if (u < acc) { pick = t; break; } }
    return blend >= 1 ? pick.mul : look.mean.map((m, ch) => m + (pick.mul[ch] - m) * blend);
  }
  if (!look.green) return null;
  const g = look.green;
  return greenMul(g.base, g.dh + (hash01(key, look.salt) - 0.5) * 2 * CROWN_GREEN_PARAMS.cardHueDeg, g.gv);
}

/* ------------------------------------------------------------------ *
 * Deterministic helpers
 * ------------------------------------------------------------------ */

function strHash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(key) {
  let a = strHash(key);
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lattice(ix, iy, iz, s) {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(iz, 0x9e3779b1) ^ Math.imul(s | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

/** Smooth value noise in [-1, 1]. */
function vnoise(x, y, z, s) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const l = (a, b, c) => lattice(xi + a, yi + b, zi + c, s);
  const x00 = l(0, 0, 0) + (l(1, 0, 0) - l(0, 0, 0)) * u;
  const x10 = l(0, 1, 0) + (l(1, 1, 0) - l(0, 1, 0)) * u;
  const x01 = l(0, 0, 1) + (l(1, 0, 1) - l(0, 0, 1)) * u;
  const x11 = l(0, 1, 1) + (l(1, 1, 1) - l(0, 1, 1)) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

/** Two octaves, in about [-0.9, 0.9]. */
function fbm2(x, y, z, s) {
  return 0.68 * vnoise(x, y, z, s) + 0.32 * vnoise(x * 2.13 + 7.1, y * 2.13 + 3.3, z * 2.13 + 1.9, s + 101);
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
function sstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Area-weighted smooth vertex normals for an indexed triangle soup. `faces` is [[a,b,c],...]. */
function vertexNormals(pos, faces) {
  const n = new Float64Array(pos.length);
  for (const [a, b, c] of faces) {
    const ax = pos[a * 3]; const ay = pos[a * 3 + 1]; const az = pos[a * 3 + 2];
    const e1x = pos[b * 3] - ax; const e1y = pos[b * 3 + 1] - ay; const e1z = pos[b * 3 + 2] - az;
    const e2x = pos[c * 3] - ax; const e2y = pos[c * 3 + 1] - ay; const e2z = pos[c * 3 + 2] - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) {
      n[v * 3] += nx; n[v * 3 + 1] += ny; n[v * 3 + 2] += nz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

/** Plain-array mesh accumulator; `toGeometry` produces the typed, indexed result. */
class MeshAcc {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.idx = [];
  }

  get vcount() {
    return this.pos.length / 3;
  }

  get tris() {
    return this.idx.length / 3;
  }

  add(p) {
    if (p.cards) this.cards = p.cards;
    const base = this.vcount;
    for (let i = 0; i < p.pos.length; i += 1) this.pos.push(p.pos[i]);
    for (let i = 0; i < p.nor.length; i += 1) this.nor.push(p.nor[i]);
    for (let i = 0; i < p.col.length; i += 1) this.col.push(p.col[i]);
    for (let i = 0; i < p.idx.length; i += 1) this.idx.push(p.idx[i] + base);
  }

  toGeometry(meta = {}) {
    const g = new THREE.BufferGeometry();
    let cardAttr = null;
    if (this.cards) {
      const n0 = this.vcount;
      const cd = cardPrim(this.cards, this.pos, n0);
      if (cd) {
        for (let i = 0; i < cd.pos.length; i += 1) this.pos.push(cd.pos[i]);
        for (let i = 0; i < cd.nor.length; i += 1) this.nor.push(cd.nor[i]);
        for (let i = 0; i < cd.col.length; i += 1) this.col.push(cd.col[i]);
        for (let i = 0; i < cd.idx.length; i += 1) this.idx.push(cd.idx[i] + n0);
        cardAttr = { a: new Float32Array(this.vcount * 4), uv: new Float32Array(this.vcount * 2) };
        cardAttr.a.set(cd.a, n0 * 4);
        cardAttr.uv.set(cd.uv, n0 * 2);
        meta = { ...meta, cards: cd.idx.length / 3 };
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    const IndexArray = this.vcount > 65535 ? Uint32Array : Uint16Array;
    g.setIndex(new THREE.BufferAttribute(new IndexArray(this.idx), 1));
    if (cardAttr) {
      g.setAttribute('aCard', new THREE.BufferAttribute(cardAttr.a, 4));
      g.setAttribute('uv', new THREE.BufferAttribute(cardAttr.uv, 2));
    }
    g.computeBoundingBox();
    g.computeBoundingSphere();
    g.userData.treeForm = { ...meta, triangles: this.tris, vertices: this.vcount };
    return g;
  }
}

/* ------------------------------------------------------------------ *
 * Icosphere (shared vertices, midpoint subdivision)
 * ------------------------------------------------------------------ */

const ICO_CACHE = new Map();

function icoSphere(level) {
  const cached = ICO_CACHE.get(level);
  if (cached) return cached;
  const t = (1 + Math.sqrt(5)) / 2;
  const raw = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t],
    [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  const verts = raw.map((v) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  });
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4],
    [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let l = 0; l < level; l += 1) {
    const cache = new Map();
    const next = [];
    const mid = (a, b) => {
      const k = a < b ? a * 65536 + b : b * 65536 + a;
      let m = cache.get(k);
      if (m === undefined) {
        const va = verts[a];
        const vb = verts[b];
        const x = va[0] + vb[0];
        const y = va[1] + vb[1];
        const z = va[2] + vb[2];
        const len = Math.hypot(x, y, z);
        verts.push([x / len, y / len, z / len]);
        m = verts.length - 1;
        cache.set(k, m);
      }
      return m;
    };
    for (const [a, b, c] of faces) {
      const ab = mid(a, b);
      const bc = mid(b, c);
      const ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  // Make every face wind counter-clockwise seen from outside.
  faces = faces.map(([a, b, c]) => {
    const va = verts[a]; const vb = verts[b]; const vc = verts[c];
    const e1 = [vb[0] - va[0], vb[1] - va[1], vb[2] - va[2]];
    const e2 = [vc[0] - va[0], vc[1] - va[1], vc[2] - va[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const m = [va[0] + vb[0] + vc[0], va[1] + vb[1] + vc[1], va[2] + vb[2] + vc[2]];
    return n[0] * m[0] + n[1] * m[1] + n[2] * m[2] >= 0 ? [a, b, c] : [a, c, b];
  });
  const out = { verts, faces };
  ICO_CACHE.set(level, out);
  return out;
}

/* ------------------------------------------------------------------ *
 * Lobes
 * ------------------------------------------------------------------ */

const NORMAL_BLEND = 0.84;

/**
 * One lobe's surface: displaced, flattened-underneath icosphere with soft normals.
 * `L`: { c:[x,y,z], r:[rx,ry,rz], flat, amp, seed, facetYaw, axisYaw, tilt, off:[3], dome }.
 */
function lobeRaw(L, level) {
  const { verts, faces } = icoSphere(level);
  const n = verts.length;
  const pos = new Float64Array(n * 3);
  const sph = new Float64Array(n * 3);
  const uy = new Float64Array(n);
  const cf = Math.cos(L.facetYaw); const sf = Math.sin(L.facetYaw);
  const ca = Math.cos(L.axisYaw); const sa = Math.sin(L.axisYaw);
  const ct = Math.cos(L.tilt); const st = Math.sin(L.tilt);
  for (let i = 0; i < n; i += 1) {
    const v = verts[i];
    let x = v[0] * cf + v[2] * sf;
    let z = -v[0] * sf + v[2] * cf;
    let y = v[1];
    const y2 = y * ct - z * st;
    const z2 = y * st + z * ct;
    y = y2; z = z2;
    const fq = L.freq ?? 1.7;
    // Two octaves from fbm2 plus a small third at four times the frequency, so the
    // silhouette is lumpy at the vertex scale and the faces do not read as a rock.
    const noise = fbm2(x * fq + L.off[0], y * fq + L.off[1], z * fq + L.off[2], L.seed)
      + 0.16 * vnoise(x * fq * 4.1 + L.off[2], y * fq * 4.1 + L.off[0], z * fq * 4.1 + L.off[1], L.seed + 211);
    const k = 1 + L.amp * noise * 1.12;
    const ys = y * (L.flat + (1 - L.flat) * sstep(-0.5, 0.35, y));
    const lx = x * L.r[0] * k;
    let ly = ys * L.r[1] * k;
    const lz = z * L.r[2] * k;
    if (L.dome && y < 0) ly = 0;
    // A droop sags the rim of a flat plate (Norfolk whorls) toward the ground.
    if (L.droop) ly -= L.droop * ((lx / L.r[0]) ** 2 + (lz / L.r[2]) ** 2) * L.r[0] * 0.5;
    const wx = lx * ca + lz * sa;
    const wz = -lx * sa + lz * ca;
    pos[i * 3] = L.c[0] + wx;
    pos[i * 3 + 1] = L.c[1] + ly;
    pos[i * 3 + 2] = L.c[2] + wz;
    // The undisplaced ellipsoid's normal at this direction.
    const ryEff = L.r[1] * (y < 0 ? Math.max(0.2, L.flat) : 1);
    const gx = lx / (L.r[0] * L.r[0]);
    const gy = ly / (ryEff * ryEff);
    const gz = lz / (L.r[2] * L.r[2]);
    const sx = gx * ca + gz * sa;
    const sz = -gx * sa + gz * ca;
    const sl = Math.hypot(sx, gy, sz) || 1;
    sph[i * 3] = sx / sl; sph[i * 3 + 1] = gy / sl; sph[i * 3 + 2] = sz / sl;
    uy[i] = y;
  }
  const nf = vertexNormals(pos, faces);
  const nor = new Float64Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    const bx = nf[i * 3] * (1 - NORMAL_BLEND) + sph[i * 3] * NORMAL_BLEND;
    const by = nf[i * 3 + 1] * (1 - NORMAL_BLEND) + sph[i * 3 + 1] * NORMAL_BLEND;
    const bz = nf[i * 3 + 2] * (1 - NORMAL_BLEND) + sph[i * 3 + 2] * NORMAL_BLEND;
    const l = Math.hypot(bx, by, bz) || 1;
    nor[i * 3] = bx / l; nor[i * 3 + 1] = by / l; nor[i * 3 + 2] = bz / l;
  }
  return { pos, nor, uy, faces };
}

/** Distance of point p from lobe `L`'s centre in units of its own radii (1 = on the surface). */
function ellipDist(L, x, y, z) {
  const dx = (x - L.c[0]) / L.r[0];
  const dy = (y - L.c[1]) / (y < L.c[1] ? L.r[1] * Math.max(0.35, L.flat) : L.r[1]);
  const dz = (z - L.c[2]) / L.r[2];
  return Math.hypot(dx, dy, dz);
}

/**
 * All lobes of a crown as one primitive: interior faces dropped, vertices compacted,
 * occlusion baked into the colour multiplier.
 */
function crownPrim(full, level, o) {
  // W21-A: with cards the crown is a darker core at `core` of each lobe's radius and the cards hang on the old shell.
  const cardsOn = !!o.cards && !!cardsActive;
  const P = CROWN_CARD_PARAMS;
  const lobes = cardsOn ? full.map((L) => ({ ...L, r: [L.r[0] * P.core, L.r[1] * P.core, L.r[2] * P.core] })) : full;
  const raws = lobes.map((L) => lobeRaw(L, L.level ?? level));
  const prim = { pos: [], nor: [], col: [], idx: [] };
  if (cardsOn) prim.cards = { lobes: full, tone: (o.tone ?? 1) * P.tone, frame: o.crown, scale: o.cardScale ?? 1, look: o.look };
  const inside = o.insideThreshold ?? 0.80;
  const gain = (o.tone ?? 1) * (cardsOn ? P.coreDark : 1);
  const crown = o.crown;
  for (let li = 0; li < lobes.length; li += 1) {
    const L = lobes[li];
    const raw = raws[li];
    const keep = [];
    for (const f of raw.faces) {
      if (L.dome && raw.uy[f[0]] <= 0.001 && raw.uy[f[1]] <= 0.001 && raw.uy[f[2]] <= 0.001) continue;
      // Backdrop crowns are never seen from below the horizon (the rig stops at 22 degrees
      // of elevation), so a lobe's downward-facing cap is dropped there.
      if (o.cullDown !== undefined && !L.keepBottom && (raw.uy[f[0]] + raw.uy[f[1]] + raw.uy[f[2]]) / 3 < o.cullDown) continue;
      const cx = (raw.pos[f[0] * 3] + raw.pos[f[1] * 3] + raw.pos[f[2] * 3]) / 3;
      const cy = (raw.pos[f[0] * 3 + 1] + raw.pos[f[1] * 3 + 1] + raw.pos[f[2] * 3 + 1]) / 3;
      const cz = (raw.pos[f[0] * 3 + 2] + raw.pos[f[1] * 3 + 2] + raw.pos[f[2] * 3 + 2]) / 3;
      let buried = false;
      for (let lj = 0; lj < lobes.length && !buried; lj += 1) {
        if (lj !== li && ellipDist(lobes[lj], cx, cy, cz) < inside) buried = true;
      }
      if (!buried) keep.push(f);
    }
    const remap = new Map();
    const base = prim.pos.length / 3;
    const tint = L.tint ?? [1, 1, 1];
    const lm = o.look ? lookMul(o.look, L.seed, 0.5, 0.85) : null; // W25: CROWN_GREENS and AUTUMN_SET colour the core as well (a lobe takes most of its own autumn tone)
    for (const f of keep) {
      const out = [];
      for (const v of f) {
        let m = remap.get(v);
        if (m === undefined) {
          m = prim.pos.length / 3;
          remap.set(v, m);
          const x = raw.pos[v * 3]; const y = raw.pos[v * 3 + 1]; const z = raw.pos[v * 3 + 2];
          prim.pos.push(x, y, z);
          prim.nor.push(raw.nor[v * 3], raw.nor[v * 3 + 1], raw.nor[v * 3 + 2]);
          // Occlusion multiplier.
          let k = 1 - o.under * sstep(0.18, -0.65, raw.uy[v]) * 1;
          if (crown) {
            const ex = Math.hypot((x - crown.cx) / crown.rxz, (z - crown.cz) / crown.rxz);
            const ey = (y - crown.cy) / crown.ry;
            const e = Math.hypot(ex, ey * 0.85);
            k *= 1 - o.interior + o.interior * sstep(0.30, 0.98, e);
            k *= 0.90 + 0.17 * clamp((y - crown.bottom) / Math.max(0.1, crown.top - crown.bottom), 0, 1);
          }
          let occ = 0;
          for (let lj = 0; lj < lobes.length; lj += 1) {
            if (lj === li) continue;
            const q = ellipDist(lobes[lj], x, y, z);
            if (q < 1.28) occ = Math.max(occ, (1.28 - q) / 0.28);
          }
          k *= 1 - o.crease * Math.min(1, occ);
          k *= 0.95 + 0.08 * Math.max(0, raw.nor[v * 3 + 1]);
          // Foliage mottling: low-contrast clump noise in value, so a lobe reads as leaves, not stone.
          k *= 1 + (o.mottle ?? 0.10) * vnoise(x * 0.85, y * 0.85, z * 0.85, L.seed);
          k = Math.max(0.22, k) * gain;
          if (lm) prim.col.push(k * tint[0] * lm[0], k * tint[1] * lm[1], k * tint[2] * lm[2]);
          else prim.col.push(k * tint[0], k * tint[1], k * tint[2]);
        }
        out.push(m);
      }
      prim.idx.push(out[0] - 0, out[1] - 0, out[2] - 0);
    }
    void base;
  }
  return prim;
}

/**
 * W21-A: the leaf-cluster cards of one crown. Each card is a square quad of 1.0 to 1.55 lobe radii centred on the old
 * shell of a lobe (the lobes are shared out by volume), its plane tilted so that its normal rises 25 to 60 degrees above the
 * horizontal toward the lobe's outward direction (the plane is never flat and never upright), rolled about its normal.
 * The vertex normal is the lobe's own outward direction (a little raised), so a card shades like the sphere it sits on.
 * Returns the buffers of the cards and per-vertex `a` = (1, outer 0..1, cell 0..3, roll seed) and `uv` (cell local).
 */
function cardPrim(cs, pos, n0) {
  void n0;
  const P = CROWN_CARD_PARAMS;
  const lobes = cs.lobes;
  if (!lobes.length) return null;
  let topY = -Infinity;
  for (let i = 1; i < pos.length; i += 3) topY = Math.max(topY, pos[i]);
  const R = makeRng(`cards:${lobes.length}:${lobes[0].seed}:${lobes[lobes.length - 1].seed}`);
  const far = !!cs.look?.far; // W25: CROWN_CARD_TIERS
  const T = CROWN_CARD_TIER_PARAMS;
  const N = clamp(lobes.length + 4, P.minCards, P.maxCards);
  const vols = lobes.map(lobeVolume);
  const total = vols.reduce((a, b) => a + b, 0);
  const cum = []; vols.reduce((a, b, i) => { cum[i] = a + b; return a + b; }, 0);
  const counts = new Array(lobes.length).fill(0);
  const out = { pos: [], nor: [], col: [], idx: [], a: [], uv: [] };
  const frame = cs.frame ?? crownFrame(lobes);
  const span = Math.max(0.1, frame.top - frame.bottom);
  let li = 0;
  const RAD = Math.PI / 180;
  const cands = [];
  for (let j = 0; j < N; j += 1) {
    const u = ((j + 0.5) / N) * total;
    while (li < lobes.length - 1 && cum[li] < u) li += 1;
    const L = lobes[li];
    const c = counts[li]; counts[li] += 1;
    const rxz = (L.r[0] + L.r[2]) * 0.5;
    let placed = null;
    for (let attempt = 0; attempt < 4 && !placed; attempt += 1) {
      const a = R() * TAU + c * 2.4 + attempt * 1.3;
      const el = (c === 0 ? 55 + R() * 25 : 14 + R() * 46) * RAD;
      const d = [Math.cos(el) * Math.cos(a), Math.sin(el), Math.cos(el) * Math.sin(a)];
      // taste-r1 (W21 review): a narrow form (the cypress, card scale under 1) keeps its cards inside the old shell so the column does not fatten.
      const shellK = (cs.scale ?? 1) < 1 ? Math.min(P.shell, 0.90) : P.shell;
      const ctr = [L.c[0] + d[0] * rxz * shellK, L.c[1] + d[1] * L.r[1] * shellK, L.c[2] + d[2] * rxz * shellK];
      let buried = false;
      for (let lj = 0; lj < lobes.length && !buried; lj += 1) if (lj !== li && ellipDist(lobes[lj], ctr[0], ctr[1], ctr[2]) < 0.92) buried = true;
      if (!buried) placed = { a, d, ctr };
    }
    const k1 = R(); const k2 = R(); const k3 = R(); const k4 = R(); const k5 = R();
    if (!placed) continue;
    cands.push({ j, li, L, rxz, placed, k1, k2, k3, k4, k5 });
  }
  // W25 CROWN_CARD_TIERS: the far tier keeps about half of the placed cards (never fewer than farMin), spread evenly through the sequence, each wider by the root of the count ratio.
  const nc = cands.length;
  const keepN = far ? Math.min(nc, Math.max(T.farMin, Math.ceil(nc * T.farShare))) : nc;
  const farSize = far && keepN ? Math.min(T.farSizeMax, Math.sqrt(nc / keepN)) : 1;
  for (let q0 = 0; q0 < nc; q0 += 1) {
    if (far && Math.floor(((q0 + 1) * keepN) / nc) === Math.floor((q0 * keepN) / nc)) continue;
    const { j, li, L, rxz, placed, k1, k2, k3, k4, k5 } = cands[q0];
    const { a, d, ctr } = placed;
    const en = (P.tiltLo + (P.tiltHi - P.tiltLo) * k1) * RAD;
    const n = [Math.cos(en) * Math.cos(a), Math.sin(en), Math.cos(en) * Math.sin(a)];
    let u0 = [n[2], 0, -n[0]];
    const ul = Math.hypot(u0[0], u0[2]) || 1; u0 = [u0[0] / ul, 0, u0[2] / ul];
    const v0 = [n[1] * u0[2] - n[2] * u0[1], n[2] * u0[0] - n[0] * u0[2], n[0] * u0[1] - n[1] * u0[0]];
    const psi = k2 * TAU; const cp = Math.cos(psi); const sp = Math.sin(psi);
    const ux = [u0[0] * cp + v0[0] * sp, u0[1] * cp + v0[1] * sp, u0[2] * cp + v0[2] * sp];
    const vx = [-u0[0] * sp + v0[0] * cp, -u0[1] * sp + v0[1] * cp, -u0[2] * sp + v0[2] * cp];
    const dn = d[0] * n[0] + d[1] * n[1] + d[2] * n[2];
    let g = [d[0] - n[0] * dn, d[1] - n[1] * dn, d[2] - n[2] * dn];
    const gl = Math.hypot(g[0], g[1], g[2]);
    g = gl > 0.15 ? [g[0] / gl, g[1] / gl, g[2] / gl] : u0;
    const size = ((rxz + L.r[1]) * 0.5) * (P.sizeLo + (P.sizeHi - P.sizeLo) * k3) * (cs.scale ?? 1) * farSize;
    if (farSize > 1) { const pull = size * (1 - 1 / farSize) * 0.50; ctr[0] -= d[0] * pull; ctr[1] -= d[1] * pull; ctr[2] -= d[2] * pull; } // W25: a wider far card is drawn in by half the growth, so the outline holds
    const h = size * 0.5;
    const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]].map(([sx, sy, uu, vv]) => ({
      p: [ctr[0] + (ux[0] * sx + vx[0] * sy) * h, ctr[1] + (ux[1] * sx + vx[1] * sy) * h, ctr[2] + (ux[2] * sx + vx[2] * sy) * h], uu, vv,
    }));
    let maxY = -Infinity;
    for (const q of corners) maxY = Math.max(maxY, q.p[1]);
    const drop = Math.max(0, maxY - (topY - 0.02));
    const nl = Math.hypot(d[0], d[1] + 0.25, d[2]);
    const nrm = [d[0] / nl, (d[1] + 0.25) / nl, d[2] / nl];
    const tint = L.tint ?? [1, 1, 1];
    const hf = clamp((ctr[1] - frame.bottom) / span, 0, 1);
    const base = cs.tone * (0.90 + 0.18 * hf) * (0.94 + 0.12 * k4);
    const cell = Math.min(3, Math.floor(k5 * 4));
    const cm = cs.look ? lookMul(cs.look, j * 131 + li * 7 + 1, hf) : null; // W25: CROWN_GREENS and AUTUMN_SET colour the card
    const v0i = out.pos.length / 3;
    for (const q of corners) {
      const p = [q.p[0], q.p[1] - drop, q.p[2]];
      out.pos.push(p[0], p[1], p[2]);
      out.nor.push(nrm[0], nrm[1], nrm[2]);
      if (cm) out.col.push(base * tint[0] * cm[0], base * tint[1] * cm[1], base * tint[2] * cm[2]);
      else out.col.push(base * tint[0], base * tint[1], base * tint[2]);
      const outer = clamp(0.5 + ((p[0] - ctr[0]) * g[0] + (p[1] + drop - ctr[1]) * g[1] + (p[2] - ctr[2]) * g[2]) / size * 0.9, 0, 1);
      out.a.push(1, outer, cell, k2);
      out.uv.push(q.uu, q.vv);
    }
    out.idx.push(v0i, v0i + 1, v0i + 2, v0i, v0i + 2, v0i + 3);
  }
  return out.idx.length ? out : null;
}

function makeLobe(R, spec) {
  return {
    c: spec.c,
    r: spec.r,
    flat: spec.flat ?? 0.58,
    amp: spec.amp ?? (0.12 + R() * 0.06),
    freq: spec.freq ?? 1.7,
    seed: Math.floor(R() * 100000),
    facetYaw: R() * TAU,
    axisYaw: spec.axisYaw ?? R() * TAU,
    tilt: (R() - 0.5) * 0.9,
    off: [R() * 40, R() * 40, R() * 40],
    dome: !!spec.dome,
    droop: spec.droop ?? 0,
    keepBottom: !!spec.keepBottom,
    primary: !!spec.primary,
    tint: (() => {
      const j1 = (R() - 0.5) * 2;
      const j2 = (R() - 0.5) * 2;
      return [1 + 0.04 * j2 + 0.06 * j1, 1 + 0.06 * j1, 1 - 0.05 * j2 + 0.05 * j1];
    })(),
  };
}

function lobeVolume(L) {
  return L.r[0] * L.r[1] * L.r[2];
}

function crownFrame(lobes) {
  let vx = 0; let vy = 0; let vz = 0; let vs = 0;
  let top = -Infinity; let bottom = Infinity;
  for (const L of lobes) {
    const w = lobeVolume(L);
    vx += L.c[0] * w; vy += L.c[1] * w; vz += L.c[2] * w; vs += w;
    top = Math.max(top, L.c[1] + L.r[1] * 1.1);
    bottom = Math.min(bottom, L.c[1] - L.r[1] * Math.max(0.35, L.flat) * 1.05);
  }
  const cx = vx / vs; const cy = vy / vs; const cz = vz / vs;
  let rxz = 0.5;
  for (const L of lobes) rxz = Math.max(rxz, Math.hypot(L.c[0] - cx, L.c[2] - cz) + Math.max(L.r[0], L.r[2]));
  return { cx, cy, cz, rxz, ry: Math.max(0.5, (top - bottom) * 0.5), top, bottom };
}

/* ------------------------------------------------------------------ *
 * Tubes (trunks, limbs)
 * ------------------------------------------------------------------ */

/**
 * A tapered tube through `path` ([{x,y,z,r}, ...]) with `sides` sides. Radii wobble a
 * little (roots and limbs are never round). `colorAt(t, angle, p)` returns the colour
 * multiplier. `capTop` closes the last ring with a fan.
 */
function tubePrim(path, sides, { wobble = 0.06, seed = 0, colorAt, capTop = false, phase = 0, flatBase = false } = {}) {
  const prim = { pos: [], nor: [], col: [], idx: [] };
  const faces = [];
  const m = path.length;
  const ref0 = new THREE.Vector3();
  for (let i = 0; i < m; i += 1) {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(m - 1, i + 1)];
    const t = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
    ref0.set(Math.abs(t.z) < 0.9 ? 0 : 1, 0, Math.abs(t.z) < 0.9 ? 1 : 0);
    const u = new THREE.Vector3().crossVectors(t, ref0).normalize();
    const v = new THREE.Vector3().crossVectors(t, u).normalize();
    for (let k = 0; k < sides; k += 1) {
      const ang = phase + (k / sides) * TAU;
      const px = path[i].x; const py = path[i].y; const pz = path[i].z;
      const w = 1 + wobble * vnoise(Math.cos(ang) * 1.3 + i * 0.9, py * 0.7, Math.sin(ang) * 1.3, seed);
      const r = path[i].r * w;
      const x = px + (u.x * Math.cos(ang) + v.x * Math.sin(ang)) * r;
      const y = (flatBase && i === 0) ? py : py + (u.y * Math.cos(ang) + v.y * Math.sin(ang)) * r;
      const z = pz + (u.z * Math.cos(ang) + v.z * Math.sin(ang)) * r;
      prim.pos.push(x, y, z);
      const c = colorAt ? colorAt(i / Math.max(1, m - 1), ang, { x, y, z }) : [1, 1, 1];
      prim.col.push(c[0], c[1], c[2]);
    }
  }
  for (let i = 0; i < m - 1; i += 1) {
    for (let k = 0; k < sides; k += 1) {
      const k2 = (k + 1) % sides;
      const a = i * sides + k; const b = i * sides + k2;
      const c = (i + 1) * sides + k; const d = (i + 1) * sides + k2;
      faces.push([a, b, c], [b, d, c]);
    }
  }
  if (capTop) {
    const last = path[m - 1];
    const ci = prim.pos.length / 3;
    prim.pos.push(last.x, last.y + last.r * 0.35, last.z);
    const cc = colorAt ? colorAt(1, 0, last) : [1, 1, 1];
    prim.col.push(cc[0], cc[1], cc[2]);
    const o = (m - 1) * sides;
    for (let k = 0; k < sides; k += 1) faces.push([o + k, o + (k + 1) % sides, ci]);
  }
  const nrm = vertexNormals(prim.pos, faces);
  for (let i = 0; i < nrm.length; i += 1) prim.nor.push(nrm[i]);
  for (const f of faces) prim.idx.push(f[0], f[1], f[2]);
  return prim;
}

/** Bark colour multiplier along a bole: darker litter at the foot, paler above, a little noise. */
function barkColor(bark, seed, footDark = 0.72) {
  return (t, ang, p) => {
    const foot = lerp(footDark, 1, sstep(0, 0.16, t));
    const n = 1 + 0.07 * vnoise(p.x * 1.1, p.y * 0.8, p.z * 1.1, seed);
    const k = foot * n;
    return [bark[0] * k, bark[1] * k, bark[2] * k];
  };
}

/** Default bark multiplier: the old brown against a green instance colour. Call sites pass their own. */
const DEFAULT_BARK = Object.freeze([1.85, 0.55, 1.05]);

/**
 * Fit a crown to its triangle ceiling: first lower the smallest satellite lobes one
 * icosphere level at a time, then drop the smallest satellites, never the primaries.
 */
function fitBudget(set, level, budget, build, minLobes) {
  let cur = set.slice();
  let acc = build(cur);
  while (acc.tris > budget) {
    const down = cur.filter((L) => !L.primary && (L.level ?? level) > 0).sort((a, b) => lobeVolume(a) - lobeVolume(b))[0];
    if (down) {
      down.level = (down.level ?? level) - 1;
      acc = build(cur);
      continue;
    }
    if (cur.length <= minLobes) break;
    const sat = cur.filter((L) => !L.primary).sort((a, b) => lobeVolume(a) - lobeVolume(b))[0];
    if (!sat) break;
    cur = cur.filter((L) => L !== sat);
    acc = build(cur);
  }
  return { set: cur, acc };
}

/* ------------------------------------------------------------------ *
 * Eucalypt (river red gum)
 * ------------------------------------------------------------------ */

const EUC_VARIANTS = [
  { limbs: 3, fork: 0.30, leader: true },
  { limbs: 4, fork: 0.26, leader: false },
  { limbs: 3, fork: 0.33, leader: true },
];

function bendPath(a, b, bowX, bowY, bowZ, radii, count) {
  const path = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const bow = Math.sin(t * Math.PI);
    path.push({
      x: lerp(a.x, b.x, t) + bowX * bow,
      y: lerp(a.y, b.y, t) + bowY * bow,
      z: lerp(a.z, b.z, t) + bowZ * bow,
      r: lerp(radii[0], radii[1], t),
    });
  }
  return path;
}

/** Point on the quadratic curve a -> c -> b. */
function quad(a, c, b, t) {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    z: u * u * a.z + 2 * u * t * c.z + t * t * b.z,
  };
}

/**
 * Eucalypt, river red gum character. About 19 m: a thick pale bole (about 1.0 m through at
 * breast height, with a root flare) that forks low into 3 or 4 heavy tapering limbs which
 * spread, and foliage in rounded hanging clumps at several heights (limb ends high, further
 * clumps hung 3 to 6 m below them), so the crown is about as deep as it is wide, with sky gaps.
 */
export function eucalyptForm({ variant = 0, seed = 0, tier = 'backdrop', bark = DEFAULT_BARK, tone = 1, cards = true, autumn = null } = {}) {
  bark = warmBark(bark); // W26 CROWN_SHADE_WARM
  const hero = tier === 'hero';
  const V = EUC_VARIANTS[((variant % 3) + 3) % 3];
  const R = makeRng(`eucalypt:${variant}:${seed}`);
  const H = 19.2;
  const level = hero ? 2 : 1;
  const forkH = H * (V.fork + (R() - 0.5) * 0.02);
  const rb = 0.50 + R() * 0.06;
  const leanAz = R() * TAU;
  const lean = 0.30 + R() * 0.40;
  const wob = R() * TAU;

  const centre = (y) => {
    const f = Math.pow(clamp(y / forkH, 0, 1), 1.6);
    const s = 0.12 * Math.sin(y * 0.55 + wob) * Math.min(1, y / 2);
    return [Math.cos(leanAz) * lean * f + Math.cos(wob) * s, Math.sin(leanAz) * lean * f + Math.sin(wob) * s];
  };
  const trunkRadius = (y) => {
    const taper = 1 - 0.26 * clamp((y - 1.3) / Math.max(1, forkH - 1.3), 0, 1);
    const flare = y < 0.8 ? 1 + 0.6 * Math.pow(1 - y / 0.8, 2) : 1;
    return rb * taper * flare;
  };
  const trunkTop = { x: centre(forkH)[0], y: forkH, z: centre(forkH)[1] };

  const lobes = [];
  const limbPlans = [];
  const a0 = R() * TAU;
  for (let i = 0; i < V.limbs; i += 1) {
    // Uneven spacing and reach: a river red gum is lopsided, and yaw has to reach the silhouette.
    const az = a0 + (V.limbs === 4 ? [0, 1.1, 2.7, 4.4][i] : (i * TAU) / V.limbs) + (R() - 0.5) * 0.9;
    const reach = (V.limbs === 4 ? 3.0 : 3.5) + R() * (V.limbs === 4 ? 2.8 : 1.8);
    const yE = H * (0.64 + R() * 0.14);
    const rx = 2.4 + R() * 0.6;
    const ry = rx * (0.80 + R() * 0.14);
    const end = new THREE.Vector3(trunkTop.x + Math.cos(az) * reach, yE, trunkTop.z + Math.sin(az) * reach);
    const endLobe = makeLobe(R, {
      c: [end.x, end.y, end.z], r: [rx, ry, rx * (0.88 + R() * 0.2)], primary: true,
      flat: 0.72, amp: 0.16 + R() * 0.07, freq: 2.3,
    });
    lobes.push(endLobe);
    // A clump hung well below the limb end, on a side branch from mid-limb.
    const az2 = az + (R() < 0.5 ? -1 : 1) * (0.55 + R() * 0.5);
    const hx = trunkTop.x + Math.cos(az2) * (reach * 0.78 + 0.6);
    const hz = trunkTop.z + Math.sin(az2) * (reach * 0.78 + 0.6);
    const hy = yE - (3.6 + R() * 2.2);
    const hr = 1.8 + R() * 0.5;
    const hangLobe = makeLobe(R, {
      c: [hx, hy, hz], r: [hr, hr * (0.95 + R() * 0.2), hr * (0.9 + R() * 0.2)],
      flat: 0.80, amp: 0.17 + R() * 0.07, freq: 2.5,
    });
    lobes.push(hangLobe);
    limbPlans.push({ az, reach, endLobe, hangLobe, r0: (0.40 + R() * 0.06) * (V.limbs === 4 ? 0.88 : 1), key: i });
  }
  // The crown top, and a fill clump near the axis at mid height.
  const topR = 2.0 + R() * 0.5;
  const topLobe = makeLobe(R, {
    c: [trunkTop.x + (R() - 0.5) * 1.6, H - topR * 0.8, trunkTop.z + (R() - 0.5) * 1.6],
    r: [topR, topR * 0.8, topR * 0.95], primary: true, flat: 0.7, amp: 0.18, freq: 2.4,
  });
  lobes.push(topLobe);
  if (V.leader) {
    const fr = 1.8 + R() * 0.4;
    lobes.push(makeLobe(R, {
      c: [trunkTop.x + (R() - 0.5) * 3, H * (0.56 + R() * 0.06), trunkTop.z + (R() - 0.5) * 3],
      r: [fr, fr * 0.95, fr], flat: 0.8, amp: 0.17, freq: 2.5,
    }));
  }
  // Bring the crown top to the nominal height.
  let top = -Infinity;
  for (const L of lobes) top = Math.max(top, L.c[1] + L.r[1] * 1.08);
  const lift = H - top;
  for (const L of lobes) L.c[1] += lift;

  if (tier === 'far') {
    // W27 CREST_TREES: the far tier, 120 triangles or fewer. The trunk, its fork and the same three or four crown masses at the same
    // places (the limb-end lobes, and the crown top on a three-limbed variant), each one a bare icosahedron: at 500 m and more a
    // crown is 20 to 40 px and this keeps the species' outline and the hang of its masses.
    const masses = limbPlans.map((lp) => lp.endLobe);
    if (V.limbs === 3) masses.push(topLobe);
    let top2 = -Infinity;
    for (const L of masses) top2 = Math.max(top2, L.c[1] + L.r[1] * 1.08);
    const drop = H - top2;
    const place = (L) => ({ ...L, c: [L.c[0], L.c[1] + drop, L.c[2]], r: [L.r[0] * 1.16, L.r[1] * 1.10, L.r[2] * 1.16], level: 0 });
    const far = masses.map(place);
    const acc = new MeshAcc();
    acc.add(tubePrim([0, forkH].map((y) => ({ x: centre(y)[0], y, z: centre(y)[1], r: trunkRadius(y) })), 4, { wobble: 0, seed: 11 + variant, colorAt: barkColor(bark, 5 + variant), capTop: true, phase: R0(variant), flatBase: true }));
    limbPlans.forEach((lp, i) => {
      const e = far[i];
      const start = { x: trunkTop.x, y: forkH - 0.1, z: trunkTop.z, r: lp.r0 };
      acc.add(tubePrim([start, { x: e.c[0], y: e.c[1] - e.r[1] * 0.3, z: e.c[2], r: lp.r0 * 0.5 }], 3, { wobble: 0, seed: 21 + lp.key, colorAt: barkColor(bark, 7 + lp.key, 0.95) }));
    });
    acc.add(crownPrim(far, 0, {
      under: 0.30, interior: 0.25, crease: 0.22, crown: crownFrame(far), tone, cards: false, cullDown: -0.62, look: crownLook('eucalypt', variant, seed, 'backdrop', autumn),
    }));
    return acc.toGeometry({ kind: 'eucalypt', variant, tier, height: H, lobes: far.length });
  }

  const budget = (hero ? FORM_BUDGET.eucalypt.hero : FORM_BUDGET.eucalypt.backdrop) - (cards && cardsActive ? CARD_TRIS : 0); // W21-A: the cards come on top of the core
  const woodSides = hero ? 7 : 5;
  const build = (lobeSet) => {
    const acc = new MeshAcc();
    const frame = crownFrame(lobeSet);
    const ys = hero
      ? [0, 0.3, 0.7, 1.3, 2.4, forkH * 0.55, forkH * 0.8, forkH]
      : [0, 0.7, forkH * 0.55, forkH];
    const trunkPath = ys.map((y) => {
      const c = centre(y);
      return { x: c[0], y, z: c[1], r: trunkRadius(y) };
    });
    acc.add(tubePrim(trunkPath, 7, { wobble: 0.10, seed: 11 + variant, colorAt: barkColor(bark, 5 + variant), capTop: true, phase: R0(variant), flatBase: true }));
    for (const lp of limbPlans) {
      const endL = lp.endLobe;
      if (lobeSet.includes(endL)) {
        const start = { x: trunkTop.x + Math.cos(lp.az) * 0.12, y: forkH - 0.1, z: trunkTop.z + Math.sin(lp.az) * 0.12 };
        const end = { x: endL.c[0], y: endL.c[1] - endL.r[1] * 0.25, z: endL.c[2] };
        // Out first, then up: the limb spreads from the fork and bends skyward.
        const ctrl = { x: start.x + (end.x - start.x) * 0.72, y: start.y + (end.y - start.y) * 0.28, z: start.z + (end.z - start.z) * 0.72 };
        const n = hero ? 6 : 3;
        const path = [];
        for (let k = 0; k < n; k += 1) {
          const t = k / (n - 1);
          const p = quad(start, ctrl, end, t);
          path.push({ ...p, r: lp.r0 * (1 - 0.62 * t) });
        }
        acc.add(tubePrim(path, woodSides, { wobble: 0.08, seed: 21 + lp.key, colorAt: barkColor(bark, 7 + lp.key, 0.95) }));
        const hang = lp.hangLobe;
        if (lobeSet.includes(hang)) {
          const q = quad(start, ctrl, end, 0.5);
          const e2 = { x: hang.c[0], y: hang.c[1] + hang.r[1] * 0.1, z: hang.c[2] };
          acc.add(tubePrim(bendPath({ ...q }, e2, 0, 0.3, 0, [lp.r0 * 0.36, lp.r0 * 0.2], hero ? 4 : 2), woodSides, { wobble: 0.08, seed: 33 + lp.key, colorAt: barkColor(bark, 9 + lp.key, 0.97) }));
        }
      }
    }
    if (V.leader && lobeSet.includes(topLobe)) {
      const start = { x: trunkTop.x, y: forkH - 0.1, z: trunkTop.z };
      const end = { x: topLobe.c[0], y: topLobe.c[1] - topLobe.r[1] * 0.3, z: topLobe.c[2] };
      acc.add(tubePrim(bendPath(start, end, 0.25, 0, 0.25, [rb * 0.5, rb * 0.22], hero ? 5 : 3), woodSides, { wobble: 0.08, seed: 47, colorAt: barkColor(bark, 11, 0.97) }));
    }
    acc.add(crownPrim(lobeSet, level, {
      under: 0.30, interior: 0.25, crease: 0.22, crown: frame, tone, cards, cullDown: hero ? undefined : -0.62, look: crownLook('eucalypt', variant, seed, tier, autumn),
    }));
    return acc;
  };
  if (hero) for (const L of lobes) if (L.primary) L.level = 2;
  const { set, acc } = fitBudget(lobes, level, budget, build, 6);
  return acc.toGeometry({ kind: 'eucalypt', variant, tier, height: H, lobes: set.length });
}

function R0(variant) {
  return variant * 0.7;
}

/* ------------------------------------------------------------------ *
 * Cypress (Monterey cypress, the windbreak tree)
 * ------------------------------------------------------------------ */

const CYP_VARIANTS = [
  // core radii bottom to top (m), vertical stretch, lean at the crown (m), side lobes, flat-topped?
  { core: [2.7, 2.5, 2.0, 1.2], stretch: 1.45, lean: 0.5, sides: 3, flatTop: false },
  { core: [3.3, 2.8, 2.2, 1.3], stretch: 1.35, lean: 0.8, sides: 3, flatTop: false },
  { core: [3.0, 3.1, 3.0, 2.6], stretch: 1.05, lean: 1.7, sides: 3, flatTop: true },
];

/**
 * Cypress: 13 m, dense and dark, a broad irregular cone foliaged almost to the ground
 * from a stack of tall core lobes broken by lower side lobes (7 lobes in all), with a
 * short stout trunk just visible. Variant 2 is the older flat-topped, wind-leaning form.
 */
export function cypressForm({ variant = 0, seed = 0, tier = 'backdrop', bark = DEFAULT_BARK, tone = 1, cards = true, autumn = null } = {}) {
  const hero = tier === 'hero';
  const V = CYP_VARIANTS[((variant % 3) + 3) % 3];
  const R = makeRng(`cypress:${variant}:${seed}`);
  const H = 13.3;
  const level = hero ? 2 : 1;
  const leanAz = R() * TAU;
  const flat = 0.88;
  const nC = V.core.length;
  const core = V.core.map((r0, i) => {
    const r = r0 * (0.93 + R() * 0.14);
    const flatTopLobe = V.flatTop && i === nC - 1;
    return { r, rx: r * (0.94 + R() * 0.12), rz: r * (0.94 + R() * 0.12), ry: flatTopLobe ? r * 0.62 : r * V.stretch };
  });
  // Stack: the first lobe's underside 0.75 m off the ground, the last lobe's apex at H.
  const y0 = 0.75 + core[0].ry * flat;
  const yTop = H - core[nC - 1].ry * 1.07;
  const lobes = [];
  const coreSpecs = core.map((l, i) => {
    const t = i / (nC - 1);
    const cy = lerp(y0, yTop, Math.pow(t, 1.05));
    const f = Math.pow(t, 1.6);
    const cx = Math.cos(leanAz) * V.lean * f + (R() - 0.5) * 0.35 * l.r;
    const cz = Math.sin(leanAz) * V.lean * f + (R() - 0.5) * 0.35 * l.r;
    const spec = makeLobe(R, { c: [cx, cy, cz], r: [l.rx, l.ry, l.rz], flat, primary: i === 0 || i === nC - 1, amp: 0.16 + R() * 0.07, freq: 2.4 });
    spec.t = t; spec.coreR = l.r;
    return spec;
  });
  lobes.push(...coreSpecs);
  // Side lobes: lower and mid height, off to one side each, so the outline is lumpy.
  const nS = hero ? V.sides + 1 : V.sides;
  const sa0 = R() * TAU;
  for (let k = 0; k < nS; k += 1) {
    const t = 0.10 + (k / Math.max(1, nS - 1)) * 0.5 + (R() - 0.5) * 0.08;
    const cyk = lerp(y0, yTop, t);
    // Core radius at that height, by interpolation.
    const ci = clamp(t * (nC - 1), 0, nC - 1);
    const rCore = lerp(core[Math.floor(ci)].r, core[Math.min(nC - 1, Math.ceil(ci))].r, ci - Math.floor(ci));
    const az = V.flatTop ? leanAz + (R() - 0.5) * 1.6 : sa0 + k * 2.4 + (R() - 0.5) * 0.6;
    const rs = rCore * (0.58 + R() * 0.14);
    const dist = rCore * (0.72 + R() * 0.14);
    const f = Math.pow(t, 1.6);
    const cx = Math.cos(leanAz) * V.lean * f + Math.cos(az) * dist;
    const cz = Math.sin(leanAz) * V.lean * f + Math.sin(az) * dist;
    lobes.push(makeLobe(R, { c: [cx, cyk, cz], r: [rs, rs * (V.stretch * 0.8), rs * (0.9 + R() * 0.2)], flat, amp: 0.17 + R() * 0.07, freq: 2.5 }));
  }
  const specs = lobes;

  if (tier === 'far') {
    // W27 CREST_TREES: the far tier, 120 triangles or fewer: the four stacked core masses (the cone) and the three side lobes, each a
    // bare icosahedron, on a short four-sided stem.
    const far = [...coreSpecs, ...lobes.slice(nC)].map((L) => ({ ...L, r: [L.r[0] * 1.14, L.r[1] * 1.08, L.r[2] * 1.14], level: 0 }));
    const acc = new MeshAcc();
    acc.add(tubePrim([0, 3.0].map((y) => ({ x: Math.cos(leanAz) * V.lean * 0.3 * Math.pow(y / (H * 0.55), 1.5), y, z: Math.sin(leanAz) * V.lean * 0.3 * Math.pow(y / (H * 0.55), 1.5), r: 0.40 * (y ? 0.8 : 1.2) })), 4, { wobble: 0, seed: 40 + variant, colorAt: barkColor(bark, 13 + variant, 0.7), flatBase: true }));
    acc.add(crownPrim(far, 0, {
      under: 0.30, interior: 0.34, crease: 0.24, crown: crownFrame(far), tone, cards: false, insideThreshold: 0.78, cullDown: -0.55, look: crownLook('cypress', variant, seed, 'backdrop', autumn),
    }));
    return acc.toGeometry({ kind: 'cypress', variant, tier, height: H, lobes: far.length });
  }

  const budget = (hero ? FORM_BUDGET.cypress.hero : FORM_BUDGET.cypress.backdrop) - (cards && cardsActive ? CARD_TRIS : 0); // W21-A: the cards come on top of the core
  const trunkLean = (y) => {
    const f = Math.pow(clamp(y / (H * 0.55), 0, 1), 1.5);
    return [Math.cos(leanAz) * V.lean * 0.3 * f, Math.sin(leanAz) * V.lean * 0.3 * f];
  };
  const build = (set) => {
    const acc = new MeshAcc();
    const frame = crownFrame(set);
    const ys = hero ? [0, 0.35, 0.9, 2.0, 3.6, 5.6] : [0, 0.9, 3.0];
    const path = ys.map((y) => {
      const c = trunkLean(y);
      const flare = y < 0.6 ? 1 + 0.35 * (1 - y / 0.6) : 1;
      return { x: c[0], y, z: c[1], r: 0.40 * flare * (1 - 0.35 * clamp(y / 5.6, 0, 1)) };
    });
    acc.add(tubePrim(path, 7, { wobble: 0.10, seed: 40 + variant, colorAt: barkColor(bark, 13 + variant, 0.7), flatBase: true }));
    acc.add(crownPrim(set, level, {
      under: 0.30, interior: 0.34, crease: 0.24, crown: frame, tone, cards, cardScale: 0.62, insideThreshold: 0.78, cullDown: hero ? undefined : -0.55, look: crownLook('cypress', variant, seed, tier, autumn),
    }));
    return acc;
  };
  if (hero) for (const L of specs) if (L.primary) L.level = 2;
  const { set, acc } = fitBudget(specs, level, budget, build, 5);
  return acc.toGeometry({ kind: 'cypress', variant, tier, height: H, lobes: set.length });
}

/* ------------------------------------------------------------------ *
 * Scrub: a low shrub mass, unit footprint 1 x 1 m, 0.866 m high so the fringe's
 * instance scale (len, height/0.866, width) gives real metres.
 * ------------------------------------------------------------------ */

export function scrubForm({ variant = 0, seed = 0, tier = 'backdrop', tone = 0.62, bark = [1.7, 0.85, 0.6] } = {}) {
  void tier;
  const R = makeRng(`scrub:${variant}:${seed}`);
  const n = [5, 6, 4][((variant % 3) + 3) % 3];
  // 4 to 6 small domed lobes (0.5 to 1.1 m once the fringe's ~3.2 m horizontal scale is
  // applied) on a ring plan, uneven in height, so the mass is lumpy and not two boulders.
  const lobes = [];
  const a0 = R() * TAU;
  for (let i = 0; i < n; i += 1) {
    const a = a0 + (i * TAU) / n + (R() - 0.5) * 0.6;
    const d = i === 0 ? 0.04 * R() : 0.20 + R() * 0.16;
    const rx = 0.17 + R() * 0.12;
    const hgt = (i === 0 ? 0.80 : 0.34 + R() * 0.42);
    const L = makeLobe(R, { c: [Math.cos(a) * d, -0.05, Math.sin(a) * d], r: [rx, hgt, rx * (0.85 + R() * 0.3)], flat: 1, dome: true, primary: i < 2 });
    L.amp = 0.24 + R() * 0.06;
    L.freq = 3.0;
    lobes.push(L);
  }
  const frame = crownFrame(lobes);
  const stems = [];
  for (let k = 0; k < 2; k += 1) {
    const a = a0 + 0.9 + k * 2.6 + R() * 0.6;
    const d = 0.05 + R() * 0.12;
    stems.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, lx: Math.cos(a + 0.6) * 0.09, lz: Math.sin(a + 0.6) * 0.09, top: 0.62 + R() * 0.18 });
  }
  const build = (set) => {
    const acc = new MeshAcc();
    for (const st of stems) {
      const path = [0, 0.5, 1].map((t) => ({ x: st.x + st.lx * t * t, y: -0.05 + (st.top + 0.05) * t, z: st.z + st.lz * t * t, r: 0.014 * (1 - 0.55 * t) }));
      acc.add(tubePrim(path, 4, { wobble: 0.1, seed: 61 + k0(st), colorAt: barkColor(bark, 3, 0.8), flatBase: true }));
    }
    acc.add(crownPrim(set, 1, { under: 0.34, interior: 0.2, crease: 0.22, crown: { ...frame, bottom: -0.05, top: 0.866 }, tone, insideThreshold: 0.8 }));
    return acc;
  };
  const { set, acc } = fitBudget(lobes, 1, 150, build, 4);
  return acc.toGeometry({ kind: 'scrub', variant, tier, lobes: set.length });
}

function k0(st) {
  return Math.round(st.x * 100);
}

/* ------------------------------------------------------------------ *
 * taste-r1 (W22-A): scrub and tussock tufts. The crown-card construction at shrub size, for the hinterland's low layer.
 * A shrub is a small dark core with leaf-cluster cards hung round it; a tussock is a fan of tall narrow cards from the
 * ground. Both are built in a unit footprint (shrub 1 m across, tussock 1 m tall) and instanced at one uniform scale so
 * the cards keep their shape. The cards carry `aCard` and `uv`, so applyFoliageDetail(mat, { puff, cards }) paints them
 * and crownCardDepthMaterial() casts their shadow.
 * ------------------------------------------------------------------ */

/** Height of a shrub variant over its width. */
export const TUFT_SHRUB_RATIO = Object.freeze([0.50, 0.58, 0.66]);

export function tuftForm({ kind = 'shrub', variant = 0 } = {}) {
  const v = ((variant % 3) + 3) % 3;
  const R = makeRng(`tuft:${kind}:${v}`);
  const cardsOn = !!cardsActive;
  const pos = []; const nor = []; const col = []; const idx = []; const a4 = []; const uv = [];
  // W25 CROWN_GREENS: a shrub is yellower (the target over leafA, which the fringe tints a tuft with), a degree or two apart by variant.
  const yb = kind === 'shrub' && greensActive ? greenBase('shrub') : null;
  const ym = yb ? greenMul(yb, (v - 1) * 2.5, 1) : [1, 1, 1];
  const addCard = (corners, nrm, tone, outerOf, cell, roll) => {
    const v0 = pos.length / 3;
    for (let i = 0; i < 4; i += 1) {
      const c = corners[i];
      pos.push(c.p[0], c.p[1], c.p[2]);
      nor.push(nrm[0], nrm[1], nrm[2]);
      col.push(tone * ym[0], tone * ym[1], tone * ym[2]);
      a4.push(1, outerOf(c), cell, roll);
      uv.push(c.u, c.v);
    }
    idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
  };
  if (kind === 'shrub') {
    const H = TUFT_SHRUB_RATIO[v];
    const n = 5;
    const rb = cardsOn ? 0.25 : 0.5;
    const rm = cardsOn ? 0.26 : 0.52;
    const ring = (r, y, off) => {
      const out = [];
      for (let i = 0; i < n; i += 1) {
        const a = off + (i * TAU) / n + (R() - 0.5) * 0.25;
        out.push(pos.length / 3);
        const rr = r * (0.9 + R() * 0.2);
        pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
      }
      return out;
    };
    const off0 = R() * TAU;
    const b = ring(rb, 0, off0);
    const m = ring(rm, H * 0.40, off0 + 0.3);
    const top = pos.length / 3; pos.push(0, H * (cardsOn ? 0.62 : 0.78), 0);
    for (let i = 0; i < n; i += 1) {
      const i1 = (i + 1) % n;
      idx.push(b[i], b[i1], m[i1], b[i], m[i1], m[i]);
      idx.push(m[i], m[i1], top);
    }
    const coreEnd = pos.length / 3;
    const cy = H * 0.34;
    for (let i = 0; i < coreEnd; i += 1) {
      const x = pos[i * 3]; const y = pos[i * 3 + 1] - cy; const z = pos[i * 3 + 2];
      const l = Math.hypot(x, y, z) || 1;
      nor.push(x / l, y / l, z / l);
      col.push((cardsOn ? 0.85 : 0.78) * ym[0], (cardsOn ? 0.85 : 0.78) * ym[1], (cardsOn ? 0.85 : 0.78) * ym[2]);
      a4.push(0, 0, 0, 0);
      uv.push(0, 0);
    }
    if (cardsOn) {
      const nc = 8 + v; // 8, 9, 10
      const low = Math.ceil(nc * 0.62);
      const RAD = Math.PI / 180;
      for (let j = 0; j < nc; j += 1) {
        const isLow = j < low;
        const lj = isLow ? j : j - low;
        const cnt = isLow ? low : nc - low;
        const az = (lj / cnt) * TAU + (isLow ? 0 : 0.9) + off0 + (R() - 0.5) * 0.7;
        const el = (isLow ? 6 + R() * 20 : 50 + R() * 26) * RAD;
        const d = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
        const shell = 0.27 + R() * 0.04;
        const ctr = [d[0] * shell, H * 0.2 + d[1] * H * 0.62, d[2] * shell];
        const en = ((isLow ? 22 + R() * 20 : 55 + R() * 20)) * RAD;
        const nn = [Math.cos(en) * Math.cos(az), Math.sin(en), Math.cos(en) * Math.sin(az)];
        let u0 = [nn[2], 0, -nn[0]];
        const ul = Math.hypot(u0[0], u0[2]) || 1; u0 = [u0[0] / ul, 0, u0[2] / ul];
        const v0 = [nn[1] * u0[2], nn[2] * u0[0] - nn[0] * u0[2], -nn[1] * u0[0]];
        const psi = R() * TAU; const cp = Math.cos(psi); const sp = Math.sin(psi);
        const ux = [u0[0] * cp + v0[0] * sp, u0[1] * cp + v0[1] * sp, u0[2] * cp + v0[2] * sp];
        const vx = [-u0[0] * sp + v0[0] * cp, -u0[1] * sp + v0[1] * cp, -u0[2] * sp + v0[2] * cp];
        const size = 0.56 + R() * 0.16;
        const h = size * 0.5;
        const dn = d[0] * nn[0] + d[1] * nn[1] + d[2] * nn[2];
        let g = [d[0] - nn[0] * dn, d[1] - nn[1] * dn, d[2] - nn[2] * dn];
        const gl = Math.hypot(g[0], g[1], g[2]);
        g = gl > 0.15 ? [g[0] / gl, g[1] / gl, g[2] / gl] : u0;
        const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]].map(([sx, sy, uu, vv]) => ({
          p: [ctr[0] + (ux[0] * sx + vx[0] * sy) * h, ctr[1] + (ux[1] * sx + vx[1] * sy) * h, ctr[2] + (ux[2] * sx + vx[2] * sy) * h],
          u: uu, v: vv,
        }));
        const nl = Math.hypot(d[0], d[1] + 0.25, d[2]);
        const nrm = [d[0] / nl, (d[1] + 0.25) / nl, d[2] / nl];
        const outerOf = (c) => clamp(0.5 + ((c.p[0] - ctr[0]) * g[0] + (c.p[1] - ctr[1]) * g[1] + (c.p[2] - ctr[2]) * g[2]) / size * 0.9, 0, 1);
        addCard(corners, nrm, 0.84 + R() * 0.08, outerOf, Math.min(3, Math.floor(R() * 4)), R());
      }
      // The whole form fits its height: cards never stand above H.
      let maxY = 0; let minY = 0;
      for (let i = 0; i < pos.length; i += 3) { maxY = Math.max(maxY, pos[i + 1]); minY = Math.min(minY, pos[i + 1]); }
      if (maxY > H || minY < -0.03) {
        for (let i = 1; i < pos.length; i += 3) pos[i] = -0.03 + (pos[i] - minY) / Math.max(1e-3, maxY - minY) * (H + 0.03);
      }
    }
  } else {
    // A tussock: 3 to 5 narrow cards leaning out from a point on the ground. Unit height 1 m.
    const nb = 5 + v;
    const RAD = Math.PI / 180;
    const off = R() * TAU;
    if (cardsOn) {
      for (let j = 0; j < nb; j += 1) {
        const az = off + (j * TAU) / nb + (R() - 0.5) * 0.8;
        const lean = (10 + R() * 28) * RAD;
        const len = 0.62 + R() * 0.28;
        const wid = 0.50 + R() * 0.16;
        const bx = Math.cos(az) * 0.05; const bz = Math.sin(az) * 0.05;
        const t = [Math.sin(lean) * Math.cos(az), Math.cos(lean), Math.sin(lean) * Math.sin(az)];
        const b = [-Math.sin(az), 0, Math.cos(az)];
        const sink = -0.06;
        const bot = [bx - t[0] * 0.06, sink, bz - t[2] * 0.06];
        const topc = [bx + t[0] * len, t[1] * len, bz + t[2] * len];
        const corners = [
          { p: [bot[0] - b[0] * wid * 0.22, bot[1], bot[2] - b[2] * wid * 0.22], u: 0, v: 0 },
          { p: [bot[0] + b[0] * wid * 0.22, bot[1], bot[2] + b[2] * wid * 0.22], u: 1, v: 0 },
          { p: [topc[0] + b[0] * wid * 0.5, topc[1], topc[2] + b[2] * wid * 0.5], u: 1, v: 1 },
          { p: [topc[0] - b[0] * wid * 0.5, topc[1], topc[2] - b[2] * wid * 0.5], u: 0, v: 1 },
        ];
        const nl = Math.hypot(Math.cos(az) * 0.55, 0.85, Math.sin(az) * 0.55);
        const nrm = [Math.cos(az) * 0.55 / nl, 0.85 / nl, Math.sin(az) * 0.55 / nl];
        const outerOf = (c) => (c.v > 0.5 ? 1 : 0);
        addCard(corners, nrm, 0.80 + R() * 0.08, outerOf, Math.min(3, Math.floor(R() * 4)), R());
      }
    } else {
      // Cards switched off: a low cone, five sides.
      const apex = pos.length / 3; pos.push(0, 0.7, 0);
      const ring = [];
      for (let i = 0; i < 5; i += 1) { ring.push(pos.length / 3); pos.push(Math.cos(off + (i * TAU) / 5) * 0.35, 0, Math.sin(off + (i * TAU) / 5) * 0.35); }
      for (let i = 0; i < 5; i += 1) idx.push(ring[i], ring[(i + 1) % 5], apex);
      for (let i = 0; i < pos.length / 3; i += 1) {
        const x = pos[i * 3]; const y = pos[i * 3 + 1]; const z = pos[i * 3 + 2];
        const l = Math.hypot(x, y - 0.1, z) || 1;
        nor.push(x / l, (y - 0.1) / l, z / l); col.push(0.8, 0.8, 0.8); a4.push(0, 0, 0, 0); uv.push(0, 0);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(idx), 1));
  const hasCards = cardsOn && a4.some((x, i) => i % 4 === 0 && x === 1);
  if (hasCards) {
    g.setAttribute('aCard', new THREE.BufferAttribute(new Float32Array(a4), 4));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  }
  g.computeBoundingBox();
  g.computeBoundingSphere();
  g.userData.treeForm = { kind: `tuft-${kind}`, variant: v, triangles: idx.length / 3, vertices: pos.length / 3, cards: hasCards ? a4.filter((x, i) => i % 4 === 0 && x === 1).length / 4 : 0 };
  return g;
}

/* ------------------------------------------------------------------ *
 * Blades: reeds and dune grass
 * ------------------------------------------------------------------ */

/**
 * A strip bent outward through `pts` ([{x,y,z,w}]): quads along the length and a point
 * at the tip. Single-sided; pair it with a double-sided material.
 */
function bladePrim(pts, dirX, dirZ, twist, colorAt) {
  const prim = { pos: [], nor: [], col: [], idx: [] };
  // Width direction: perpendicular to the outward direction, twisted.
  const wx0 = -dirZ; const wz0 = dirX;
  const ct = Math.cos(twist); const st = Math.sin(twist);
  const wx = wx0 * ct; const wz = wz0 * ct; const wy = st * 0.6;
  const wl = Math.hypot(wx, wy, wz) || 1;
  const m = pts.length;
  for (let i = 0; i < m; i += 1) {
    const p = pts[i];
    const t = i / (m - 1);
    const c = colorAt(t);
    if (p.w <= 0) {
      prim.pos.push(p.x, p.y, p.z);
      prim.col.push(c[0], c[1], c[2]);
    } else {
      prim.pos.push(p.x - (wx / wl) * p.w, p.y - (wy / wl) * p.w, p.z - (wz / wl) * p.w);
      prim.pos.push(p.x + (wx / wl) * p.w, p.y + (wy / wl) * p.w, p.z + (wz / wl) * p.w);
      prim.col.push(c[0], c[1], c[2], c[0], c[1], c[2]);
    }
  }
  // Indices.
  let o = 0;
  const faces = [];
  for (let i = 0; i < m - 1; i += 1) {
    const aW = pts[i].w > 0;
    const bW = pts[i + 1].w > 0;
    if (aW && bW) {
      faces.push([o, o + 1, o + 2], [o + 1, o + 3, o + 2]);
      o += 2;
    } else if (aW && !bW) {
      faces.push([o, o + 1, o + 2]);
      o += 2;
    }
  }
  const nrm = vertexNormals(prim.pos, faces);
  for (let i = 0; i < nrm.length; i += 1) prim.nor.push(nrm[i]);
  for (const f of faces) prim.idx.push(f[0], f[1], f[2]);
  return prim;
}

/** A closed prism (seed head) from `a` to `b`, `sides` sides, with a cap on top. */
function headPrim(a, b, r, sides, col) {
  const path = [{ x: a.x, y: a.y, z: a.z, r: r * 0.85 }, { x: b.x, y: b.y, z: b.z, r }];
  return tubePrim(path, sides, { wobble: 0.1, seed: 77, colorAt: () => col, capTop: true });
}

/**
 * Bulrush at a dam or creek: 10 thin tapered blades, 1.2 to 2.2 m once the fringe's
 * height multiplier (0.7 to 1.35) is applied to the 1.65 m unit, bent outward, with
 * three brown seed-head cylinders. `headMul` is the seed-head colour multiplier against
 * the reed material colour (brown against dark green by default).
 */
export function reedForm({ variant = 0, seed = 0, tier = 'backdrop', headMul = [4.4, 0.66, 0.66] } = {}) {
  void tier;
  const R = makeRng(`reeds:${variant}:${seed}`);
  const acc = new MeshAcc();
  const n = 10;
  const heads = [];
  for (let i = 0; i < n; i += 1) {
    const a = i * 2.399 + R() * 0.5;
    const dx = Math.cos(a); const dz = Math.sin(a);
    const r0 = 0.03 + R() * 0.10;
    const h = 1.65 * (0.78 + R() * 0.3);
    const lean = 0.10 + R() * 0.26;
    const w0 = 0.042 + R() * 0.012;
    const pts = [0, 0.38, 0.72, 1].map((f, k) => {
      const out = lean * f * f * h * (k === 3 ? 1.15 : 1);
      return {
        x: dx * (r0 + out), y: h * f - (k === 3 ? lean * 0.05 * h : 0), z: dz * (r0 + out),
        w: k === 3 ? 0 : w0 * (1 - 0.55 * f),
      };
    });
    acc.add(bladePrim(pts, dx, dz, (R() - 0.5) * 1.2, (t) => {
      const k = 0.55 + 0.6 * t;
      return [k * 1.0, k * 1.05, k * 0.85];
    }));
    if (heads.length < 3 && i % 3 === 0) {
      const p = pts[2];
      heads.push({ a: { x: p.x, y: p.y, z: p.z }, b: { x: p.x + dx * 0.02, y: p.y + 0.27, z: p.z + dz * 0.02 } });
    }
  }
  for (const hd of heads) acc.add(headPrim(hd.a, hd.b, 0.034, 5, headMul));
  return acc.toGeometry({ kind: 'reeds', variant });
}

/**
 * Marram clump: 14 arching blades, unit 0.65 m (the fringe's height multiplier 0.55 to
 * 1.3 then gives 0.36 to 0.85 m), widest and darkest at the foot, straw at the tips.
 */
export function duneGrassForm({ variant = 0, seed = 0, tier = 'backdrop' } = {}) {
  void tier;
  const R = makeRng(`dune:${variant}:${seed}`);
  const acc = new MeshAcc();
  const n = 14;
  for (let i = 0; i < n; i += 1) {
    const a = i * 2.399 + R() * 0.6;
    const dx = Math.cos(a); const dz = Math.sin(a);
    const r0 = 0.02 + R() * 0.08;
    const h = 0.65 * (0.78 + R() * 0.38);
    const arch = 0.45 + R() * 0.45;
    const w0 = 0.034 + R() * 0.01;
    const f = [0, 0.4, 0.78, 1];
    const pts = f.map((s, k) => ({
      x: dx * (r0 + arch * h * s * s * (k === 3 ? 1.15 : 1)),
      y: h * (s - 0.22 * s * s * s * (k === 3 ? 1.35 : 1)),
      z: dz * (r0 + arch * h * s * s * (k === 3 ? 1.15 : 1)),
      w: k === 3 ? 0 : w0 * (1 - 0.6 * s),
    }));
    acc.add(bladePrim(pts, dx, dz, (R() - 0.5) * 1.0, (t) => {
      const k = 0.52 + 0.62 * t;
      return [k * (0.95 + 0.2 * t), k, k * (1 - 0.18 * t)];
    }));
  }
  return acc.toGeometry({ kind: 'dune-grass', variant });
}

/* ------------------------------------------------------------------ *
 * Hedge run: a clipped farm hedge along a polyline, ground-following
 * ------------------------------------------------------------------ */

/**
 * taste W28: HEDGEROW_FORM. 1 breaks the hinterland hedge's bar: the ridge steps between 1.4 and 3.2 m in runs of 4 to 10 m (each run
 * with its own width and a little of its own hue and value), a gateway of 2.2 to 3.4 m stands about every 30 m, and an emergent shrub
 * or small tree swells out of the line about every 20 to 40 m (taller, wider, a shade fresher). fringe.js asks the same switch for a
 * shade face that stays olive (a yellower, more saturated albedo, the crown shade warming on the material) and a lighter contact
 * ribbon. Browser: `?hedgerowForm=0`; node: `DD_HEDGEROW_FORM=0`; tests may call `setHedgerowForm`. 0 restores wave twenty-seven.
 */
export const HEDGEROW_FORM = crownSwitch('DD_HEDGEROW_FORM', 'hedgerowForm');
let hedgerowActive = HEDGEROW_FORM;
export function setHedgerowForm(v) { hedgerowActive = v ? 1 : 0; }
export function hedgerowFormActive() { return hedgerowActive; }
export const HEDGEROW_FORM_PARAMS = {
  ridge: [1.4, 3.2], // m, the run's own ridge height
  runM: [4, 10], // m, a run of one ridge height
  blendM: 0.8, // half-length of the step between two runs
  gapEveryM: 30, gapM: [2.2, 3.4], // gateways: mean spacing and width
  lumpEveryM: [20, 40], // emergent shrub or tree: spacing
  hueRun: 0.014, litRun: 0.12, // run to run, hue either way and value either way
};

/**
 * taste W29: HEDGEROW_TIDY. 1 mends three faults of wave twenty-eight's hedgerows. (1) A hedge or the rim brow that crosses a farm track or
 * a road gets a gateway there (`crossings` of hedgeRunGeometry: the track's width plus a metre each side, wherever the run's section comes within
 * that, so a hedge that crosses it slantwise, or ends or begins on it, is cut too; fringe.js cuts the contact ribbon at the same stretches). (2) An emergent lump keeps the hedge's own olive: it is no yellower than the run it
 * stands on, a little lighter at most, and its dome carries less displacement and less vertex jitter (the five rings of a lump stand a
 * metre apart, so the 0.4 m displacement and the 10 percent jitter were drawn afresh at every vertex: a speckle). (3) The brow asks for
 * coarser rings (`ringM`, `lumpRings`), under half its triangles. (4) A hedge's crown (its sunlit top) is 0.68 of the value it was (`crownK`). Browser: `?hedgerowTidy=0`; node: `DD_HEDGEROW_TIDY=0`; tests may call
 * `setHedgerowTidy`. 0 restores wave twenty-eight's picture exactly. Needs HEDGEROW_FORM (with that at 0 this changes nothing).
 */
export const HEDGEROW_TIDY = crownSwitch('DD_HEDGEROW_TIDY', 'hedgerowTidy');
let hedgerowTidyOn = HEDGEROW_TIDY;
export function setHedgerowTidy(v) { hedgerowTidyOn = v ? 1 : 0; }
export function hedgerowTidyActive() { return hedgerowTidyOn; }
/**
 * taste W30: HEDGEROW_TRIM. 1 trims what HEDGEROW_TIDY left. (1) A gateway under a metre is dropped (the hedge runs through). (2) A gateway is held
 * to the stretch where the section's contact ribbon (1.5 m each side of the line) comes within the track's own half width, a metre more each side,
 * measured along the hedge (a hedge that stands on a footprint along its whole length, or begins on one, has no shorter gateway: it is already ended there). (3) A run whose hue has stepped yellower than `hueMax` (degrees) is
 * brought back to it and its crown value taken down a little (`yellowL`), so a short hedge no longer reads pale lime over the eucalypt crowns.
 * Browser: `?hedgerowTrim=0`; node: `DD_HEDGEROW_TRIM=0`; tests may call `setHedgerowTrim`. 0 restores wave twenty-nine's picture exactly. Off with HEDGEROW_TIDY.
 */
export const HEDGEROW_TRIM = crownSwitch('DD_HEDGEROW_TRIM', 'hedgerowTrim');
let hedgerowTrimOn = HEDGEROW_TRIM;
export function setHedgerowTrim(v) { hedgerowTrimOn = v ? 1 : 0; }
export function hedgerowTrimActive() { return hedgerowTrimOn; }
export const HEDGEROW_TRIM_PARAMS = {
  minCutM: 1, // a gateway shorter than this is dropped
  padM: 0.7, // m each side of the stretch where the ribbon's wide edge meets the footprint (the hedge's end cap reaches 0.35 m past a piece; the sample step is 0.25)
  clearM: 0.1, // m the ribbon's edge stands clear of the footprint
  hueMax: 0.225, // the hue (0..1, 81 degrees, a little under the crowns' median) no hedge vertex stands yellower than
  crownTrim: 1, // the whole-hedge darkening of the first pass is off: only a pale, yellow run is taken down (hueMax, yellowL)
  domeDark: 0.12, // a lump's crown value is taken down by this share at its centre (TIDY lifted it by 0.04)
  yellowL: 0.66, // the crown value times this, in proportion to the hue taken back (full at yellowSpan)
  yellowSpan: 0.0222, // 8 degrees
};
export const HEDGEROW_TIDY_PARAMS = {
  gateAddM: 1, // m each side of the track the gateway stands open
  gateStepM: 0.25, // m along the run between the samples that find where its section meets a track (the edge is then bisected)
  lumpLit: [1.03, 1.04], // a shrub's and a tree lump's value over its run (was 1.06, 1.08)
  domeLit: 0.04, // the dome's own lift on the crown (was 0.12)
  lumpDisp: 0.04, // the lump's added displacement (was 0.20)
  lumpJit: 0.35, // the share of the vertex jitter a lump keeps at its centre
  hedgeCrownK: 0.68, // the crown's value (a hedge's sunlit top) times this: the top is darker than the lit flank's own albedo, as the sun is nearer its normal
  browRingM: 5.2, // the brow's ring spacing (the hedge's own is 2.05)
  browLumpRings: [-0.7, 0, 0.7], // the brow's rings under a lump, in lump half-lengths (the hedge's own are five)
};

// Cross-section, lateral (units of half-width) and vertical (fraction of height).
// The body (v 0.26 to 0.62) is the full 1.8 m, the foot is 10% wider (battered sides) and the
// shoulder is rounded over (v 0.82 and 0.95) into a crown that is level at the two crown points.
const HEDGE_PROFILE = Object.freeze([
  [-1.10, 0.00], [-1.00, 0.26], [-1.00, 0.62], [-0.90, 0.82], [-0.62, 0.95], [0, 1.0],
  [0.62, 0.95], [0.90, 0.82], [1.00, 0.62], [1.00, 0.26], [1.10, 0.00],
]);
const HEDGE_RING = 1.75;
// taste W28 (HEDGEROW_FORM): the hedgerow form's gateways and lumps add caps, so its rings stand a little further apart and a run stays
// inside the 140 triangles per 10 m the section was budgeted at (tree-forms.test.mjs).
const HEDGE_RING_FORM = 2.05;
const HEDGE_GAP = 1.2;
const SUN_X = 0.433;
const SUN_Z = -0.901;

function profileNormal(i) {
  const a = HEDGE_PROFILE[Math.max(0, i - 1)];
  const b = HEDGE_PROFILE[Math.min(HEDGE_PROFILE.length - 1, i + 1)];
  const du = b[0] - a[0]; const dv = b[1] - a[1];
  const l = Math.hypot(du, dv) || 1;
  return [-dv / l, du / l];
}

/**
 * `chains` are arrays of runs, each run an array of `{x, z, yaw, len, hue}` items in
 * order (the fringe's `chainLineItems` output). `sampleY(x, z)` is the ground. Returns
 * one merged geometry with ABSOLUTE vertex colours (HSL like the strip it replaces),
 * darker at the foot and on the shade face.
 *
 * Each run is cut into pieces by the odd 1.2 m gap (a gateway) and every piece is closed with
 * a rounded cap (one tapered ring and a fan). Rings stand about 1.75 m apart and are
 * displaced by two octaves of noise (0.15 m, more in a taller unclipped section), which
 * gives 110 to 140 triangles per 10 m. The first ring of a piece is nominal (1.8 x 2.2 m,
 * no lumps) and the vertex order is main rings first, caps after.
 */
export function hedgeRunGeometry(chains, {
  sampleY, seed = 0, width = 1.8, height = 2.2, hue0 = 0.205, sat = 0.32, lit = 0.21, shade = 0.12,
  shadeHue = null, shadeSat = null, form = hedgerowActive, lumpClear = null,
  // taste W29 (HEDGEROW_TIDY): `crossings` are [x0, z0, x1, z1, width] tracks and roads a gateway opens at; `ringM` and `lumpRings` coarsen the rings.
  tidy = hedgerowTidyOn, crossings = null, ringM = null, lumpRings = null, crownK = 1, trim = hedgerowTrimOn,
  // taste W82 (TRACK_GATES): `{ kind, out: [], postM, capM, minPiece, stubM, nearM, dropped }`. The gap at a track is the band (the track's half width + postM) about its centreline, measured
  // on the run's centre, each side a cap (capM) wider so the cap's tip stands on the band's edge; a piece under minPiece (stubM less the two caps) near a track is not drawn.
  gates = null,
} = {}) {
  const acc = new MeshAcc();
  const FP = HEDGEROW_FORM_PARAMS;
  const TP = HEDGEROW_TIDY_PARAMS;
  const TP2 = HEDGEROW_TRIM_PARAMS;
  const tidyOn = !!(tidy && form);
  const trimOn = tidyOn && !!trim; // taste W30
  const trimLog = [];
  const hScale = height / 2.2;
  const P = HEDGE_PROFILE.length;
  const col = new THREE.Color();
  const halfW = width * 0.5;
  const crownL = Math.min(0.92, (lit + shade) * 0.5 + lit * 0.42) * (form && tidy ? crownK : 1) * (form && tidy && trim ? HEDGEROW_TRIM_PARAMS.crownTrim : 1);
  let runCount = 0;
  let pieceCount = 0;
  const gateways = [];
  const gateCuts = []; // taste W29: [chain, s0, s1] arc lengths along a chain's stations, for the contact ribbon to be cut at
  for (let c = 0; c < chains.length; c += 1) {
    const run = chains[c];
    if (!run.length) continue;
    const first = run[0];
    const last = run[run.length - 1];
    const stations = [];
    stations.push({ x: first.x - Math.sin(first.yaw) * (first.len ?? 8) * 0.5, z: first.z - Math.cos(first.yaw) * (first.len ?? 8) * 0.5, hue: first.hue ?? 0 });
    for (const it of run) stations.push({ x: it.x, z: it.z, hue: it.hue ?? 0 });
    stations.push({ x: last.x + Math.sin(last.yaw) * (last.len ?? 8) * 0.5, z: last.z + Math.cos(last.yaw) * (last.len ?? 8) * 0.5, hue: last.hue ?? 0 });
    if (stations.length < 2) continue;
    const cum = [0];
    for (let i = 0; i < stations.length - 1; i += 1) cum.push(cum[i] + Math.hypot(stations[i + 1].x - stations[i].x, stations[i + 1].z - stations[i].z));
    const total = cum[cum.length - 1];
    if (total < 1) continue;
    if (gates && crossings?.length && total + 2 * gates.capM < gates.stubM && stations.some((st) => crossings.some((q) => {
      const ex = q[2] - q[0]; const ez = q[3] - q[1]; const u = clamp(((st.x - q[0]) * ex + (st.z - q[1]) * ez) / (ex * ex + ez * ez || 1e-9), 0, 1);
      return Math.hypot(st.x - q[0] - ex * u, st.z - q[1] - ez * u) <= gates.nearM;
    }))) { gates.dropped += 1; gates.dropAt.push([+stations[0].x.toFixed(1), +stations[0].z.toFixed(1)]); continue; } // taste W82 (TRACK_GATES): a whole run under 4 m within 8 m of a track
    // Point, hue and station index at arc length s; beyond the ends the end segments extend.
    const at = (s) => {
      let i = 0;
      while (i < stations.length - 2 && cum[i + 1] < s) i += 1;
      const a = stations[i]; const b = stations[i + 1];
      const f = (s - cum[i]) / Math.max(1e-6, cum[i + 1] - cum[i]);
      return { x: lerp(a.x, b.x, f), z: lerp(a.z, b.z, f), hue: a.hue, i };
    };
    const key = Math.round(first.x * 3.1 + first.z * 1.7) | 0;
    const R = makeRng(`hedge:${seed}:${key}`);
    // Features in groups of about 3.5 m: 1 = taller unclipped section, 2 = a 1.2 m gap.
    const groups = Math.max(1, Math.round(total / 3.5));
    const feature = [];
    for (let g = 0; g < groups; g += 1) {
      const roll = R();
      const edge = g < 2 || g > groups - 3;
      feature.push(form ? 0 : edge ? 0 : roll < 0.15 ? 1 : roll < 0.20 && total >= 18 ? 2 : 0);
    }
    // Pieces: cut at each gap, keeping every piece at least 4 m long.
    const pieces = [];
    const gateRaw = [];
    let a0 = 0;
    // HEDGEROW_FORM: own stream, so the plain path's draws are untouched. Runs of one ridge height, gateways, emergent lumps.
    const fr = form ? { runs: [], gaps: [], lumps: [] } : null;
    if (fr) {
      const FR = makeRng(`hedgeform:${seed}:${key}`);
      for (let s0 = 0; s0 < total - 1e-6;) {
        let len = FP.runM[0] + FR() * (FP.runM[1] - FP.runM[0]);
        if (total - (s0 + len) < 3) len = total - s0;
        const u = FR();
        const rh = u < 0.35 ? 1.4 + 0.5 * FR() : u < 0.75 ? 2.0 + 0.6 * FR() : 2.7 + 0.5 * FR();
        const rw = clamp(0.85 + 0.3 * ((rh - 1.4) / 1.8) + (FR() - 0.5) * 0.3, 0.78, 1.3);
        fr.runs.push({ s0, s1: s0 + len, h: rh * hScale, w: rw, dh: (FR() - 0.5) * 2 * FP.hueRun, dl: 1 + (FR() - 0.5) * 2 * FP.litRun });
        s0 += len;
      }
      for (let sg = 9 + FR() * 18; sg < total - 8; sg += FP.gapEveryM * (0.75 + 0.5 * FR())) {
        fr.gaps.push({ c: sg, w: FP.gapM[0] + FR() * (FP.gapM[1] - FP.gapM[0]) });
      }
      // taste W29 (HEDGEROW_TIDY): a gateway wherever the run's section (its centre and the two edges of its foot) comes within a track's
      // half width and a metre of the track: a run that crosses it, but also one that ends or begins on it (the plan splits a hedge at a
      // track, and a chain that stops 0.4 m short of the centreline crosses nothing). No draw from FR, so the rest is as it was.
      if (tidyOn && crossings?.length) {
        const hwF = halfW * 1.1; // the foot's half width at a piece's end (the nominal section)
        let bx0 = Infinity; let bx1 = -Infinity; let bz0 = Infinity; let bz1 = -Infinity;
        for (const st of stations) { bx0 = Math.min(bx0, st.x); bx1 = Math.max(bx1, st.x); bz0 = Math.min(bz0, st.z); bz1 = Math.max(bz1, st.z); }
        const raw = [];
        for (const [x0, z0, x1, z1, tw, trk] of crossings) {
          const reach = tw * 0.5 + (gates ? gates.postM : TP.gateAddM);
          const near = reach + hwF + 1;
          if (Math.max(x0, x1) + near < bx0 || Math.min(x0, x1) - near > bx1 || Math.max(z0, z1) + near < bz0 || Math.min(z0, z1) - near > bz1) continue;
          const ex = x1 - x0; const ez = z1 - z0;
          const l2 = ex * ex + ez * ez;
          if (l2 < 1e-9) continue;
          const dTrack = (qx, qz) => {
            const u = clamp(((qx - x0) * ex + (qz - z0) * ez) / l2, 0, 1);
            return Math.hypot(qx - x0 - ex * u, qz - z0 - ez * u);
          };
          const bad = (s) => {
            const q = at(s);
            const ah = at(Math.min(total, s + 0.6)); const bh = at(Math.max(0, s - 0.6));
            let tx = ah.x - bh.x; let tz = ah.z - bh.z;
            const tl = Math.hypot(tx, tz) || 1;
            tx /= tl; tz /= tl;
            // taste W82 (TRACK_GATES): the run's centre against the band (so a tip stands on its edge), and no corner of the ring on the track's own width, which a shallow crossing needs
            if (gates) return dTrack(q.x, q.z) < reach || dTrack(q.x - tz * hwF, q.z + tx * hwF) < tw * 0.5 || dTrack(q.x + tz * hwF, q.z - tx * hwF) < tw * 0.5;
            return dTrack(q.x, q.z) < reach || dTrack(q.x - tz * hwF, q.z + tx * hwF) < reach || dTrack(q.x + tz * hwF, q.z - tx * hwF) < reach;
          };
          const edge = (sa, sb) => { // where the state flips between sa and sb
            const wasBad = bad(sa);
            let lo = sa; let hi = sb;
            for (let k = 0; k < 8; k += 1) { const mid = (lo + hi) * 0.5; if (bad(mid) === wasBad) lo = mid; else hi = mid; }
            return (lo + hi) * 0.5;
          };
          // taste W30 (HEDGEROW_TRIM): the stretch [lo, hi] is held to where the ribbon's edges come within the track's own half width, a metre more each side.
          const pushRaw = (lo, hi) => {
            if (gates) { raw.push([lo - gates.capM, hi + gates.capM, [x0, z0, x1, z1], reach, trk]); return; }
            if (!trimOn) { raw.push([lo, hi]); return; }
            const half = tw * 0.5 + TP2.clearM; const rib = (width + 1.2) * 0.5 * 1.35; // the contact ribbon's wide edge (fringe.js makeStripContact: 1.35 of the half width)
            let tl = null; let th = null;
            for (let s = lo; s < hi + TP.gateStepM; s += TP.gateStepM) {
              const sc = Math.min(hi, s);
              const q = at(sc); const ah = at(Math.min(total, sc + 0.6)); const bh = at(Math.max(0, sc - 0.6));
              let tx = ah.x - bh.x; let tz = ah.z - bh.z;
              const tl2 = Math.hypot(tx, tz) || 1;
              tx /= tl2; tz /= tl2;
              if (dTrack(q.x, q.z) < half || dTrack(q.x - tz * rib, q.z + tx * rib) < half || dTrack(q.x + tz * rib, q.z - tx * rib) < half) { if (tl === null) tl = sc; th = sc; }
            }
            trimLog.push({ c, x0, z0, x1, z1, tw, dLo: +dTrack(at(lo).x, at(lo).z).toFixed(2), dMid: +dTrack(at((lo + hi) * 0.5).x, at((lo + hi) * 0.5).z).toFixed(2), dHi: +dTrack(at(hi).x, at(hi).z).toFixed(2), raw: [+lo.toFixed(2), +hi.toFixed(2)], tight: tl === null ? null : [+tl.toFixed(2), +th.toFixed(2)] });
            if (tl === null) return;
            raw.push([Math.max(lo, tl - TP2.padM), Math.min(hi, th + TP2.padM)]);
          };
          let from = null; let prev = 0; let prevBad = bad(0);
          if (prevBad) from = 0;
          for (let s = 0; s < total;) {
            const sn = Math.min(total, s + TP.gateStepM);
            const nb = bad(sn);
            if (nb !== prevBad) {
              const e = edge(s, sn);
              if (nb) from = e; else { pushRaw(from, e); from = null; }
            }
            prevBad = nb; prev = sn; s = sn;
          }
          if (from !== null) pushRaw(from, prev);
        }
        if (raw.length) {
          raw.sort((p, q) => p[0] - q[0]);
          // Merge runs of cuts, and take in a stub (under 1.5 m: it is not drawn) between two of them or at either end of the run.
          const cuts = [];
          const gMin = gates ? gates.minPiece : 1.5;
          for (const [lo, hi, src, rch, trk] of raw) {
            const last2 = cuts[cuts.length - 1];
            if (last2 && lo - last2[1] < gMin) { if (gates && lo - last2[1] > 0.05) { gates.dropped += 1; gates.dropAt.push([+at(last2[1]).x.toFixed(1), +at(last2[1]).z.toFixed(1)]); } last2[1] = Math.max(last2[1], hi); last2[4] = last2[4] || trk; } else cuts.push([lo, hi, src, rch, trk]);
          }
          if (trimOn && !gates) for (let k = cuts.length - 1; k >= 0; k -= 1) if (cuts[k][1] - cuts[k][0] < TP2.minCutM) cuts.splice(k, 1); // taste W30: a gateway under a metre is not cut (the hedge runs through)
          if (cuts.length && cuts[0][0] < gMin) { if (gates && cuts[0][0] > 0.05) { gates.dropped += 1; gates.dropAt.push([+at(0).x.toFixed(1), +at(0).z.toFixed(1)]); } cuts[0][0] = 0; }
          if (cuts.length && total - cuts[cuts.length - 1][1] < gMin) { if (gates && total - cuts[cuts.length - 1][1] > 0.05) { gates.dropped += 1; gates.dropAt.push([+at(total).x.toFixed(1), +at(total).z.toFixed(1)]); } cuts[cuts.length - 1][1] = total; }
          const forced = cuts.map(([lo, hi]) => ({ c: (lo + hi) * 0.5, w: hi - lo, forced: true }));
          if (gates) for (const cut of cuts) if (cut[4]) gateRaw.push({ lo: cut[0], hi: cut[1] }); // taste W82 fix: the final cuts at a farm track (after merging), judged once the pieces are known
          for (const fg of forced) {
            const q = at(fg.c);
            gateways.push({ x: +q.x.toFixed(1), z: +q.z.toFixed(1), w: +fg.w.toFixed(1) });
            gateCuts.push([c, +(fg.c - fg.w * 0.5).toFixed(3), +(fg.c + fg.w * 0.5).toFixed(3)]);
          }
          fr.gaps = fr.gaps.filter((gp) => !forced.some((fg) => Math.abs(fg.c - gp.c) < (fg.w + gp.w) * 0.5 + 2)).concat(forced).sort((p, q) => p.c - q.c);
        }
      }
      for (let c = 8 + FR() * 14; c < total - 6; c += FP.lumpEveryM[0] + FR() * (FP.lumpEveryM[1] - FP.lumpEveryM[0])) {
        const tree = FR() < 0.3;
        const half = tree ? 2.4 + FR() * 0.9 : 1.9 + FR() * 0.9;
        const lp = {
          c, half, tree,
          add: (tree ? 1.9 + FR() * 1.4 : 0.8 + FR() * 0.8) * hScale,
          bw: tree ? 0.55 + FR() * 0.4 : 0.3 + FR() * 0.3,
          sideL: 0.8 + FR() * 0.4, sideR: 0.8 + FR() * 0.4,
          // taste W28 (hedges-2): the tree lump's hue shift 0.006 -> 0.003 and value 1.14 -> 1.08, so none reads as an ochre blotch.
          dh: (tree ? 0.003 : -0.004) + (FR() - 0.5) * 0.008, dl: tree ? 1.08 : 1.06,
        };
        // taste W29 (HEDGEROW_TIDY): the lump's value 1.06 and 1.08 -> 1.03 and 1.04 (the dome's own lift is cut below as well).
        if (tidyOn) lp.dl = tree ? TP.lumpLit[1] : TP.lumpLit[0];
        if (c - lp.half < 2 || c + lp.half > total - 2) continue;
        if (fr.gaps.some((gp) => Math.abs(gp.c - c) < gp.w * 0.5 + lp.half + 0.8)) continue;
        // taste W28 (hedges-2): no lump within 3 m of a farm track or water (`lumpClear(x, z)` is true where one stands).
        if (lumpClear && [-lp.half, 0, lp.half].some((o) => { const q = at(c + o); return lumpClear(q.x, q.z); })) continue;
        fr.lumps.push(lp);
      }
      const runAt = (s, key2) => {
        let i = 0;
        while (i < fr.runs.length - 1 && fr.runs[i].s1 <= s) i += 1;
        const r = fr.runs[i];
        const B = FP.blendM;
        let v = r[key2];
        if (i > 0 && s - r.s0 < B) v = lerp(fr.runs[i - 1][key2], r[key2], sstep(-B, B, s - r.s0));
        else if (i < fr.runs.length - 1 && r.s1 - s < B) v = lerp(fr.runs[i + 1][key2], r[key2], sstep(-B, B, r.s1 - s));
        return v;
      };
      fr.at = runAt;
      fr.lumpAt = (s) => {
        for (const lp of fr.lumps) {
          const d = Math.abs(s - lp.c);
          if (d < lp.half) return { lp, k: Math.sqrt(Math.max(0, 1 - (d / lp.half) * (d / lp.half))) };
        }
        return null;
      };
      for (const gp of fr.gaps) {
        if (gp.forced) { // taste W29: a gateway at a track stands wherever it falls; a stub under 1.5 m is not drawn
          if (gp.c - gp.w * 0.5 - a0 >= (gates ? gates.minPiece : 1.5)) pieces.push([a0, gp.c - gp.w * 0.5]);
          a0 = Math.max(a0, gp.c + gp.w * 0.5);
          continue;
        }
        if (gp.c - gp.w * 0.5 - a0 < 4 || total - (gp.c + gp.w * 0.5) < 4) continue;
        pieces.push([a0, gp.c - gp.w * 0.5]);
        a0 = gp.c + gp.w * 0.5;
      }
    } else {
      for (let g = 0; g < groups; g += 1) {
        if (feature[g] !== 2) continue;
        const sg = ((g + 0.5) / groups) * total;
        if (sg - HEDGE_GAP * 0.5 - a0 < 4 || total - (sg + HEDGE_GAP * 0.5) < 4) { feature[g] = 0; continue; }
        pieces.push([a0, sg - HEDGE_GAP * 0.5]);
        a0 = sg + HEDGE_GAP * 0.5;
      }
    }
    if (!fr?.gaps.some((gp) => gp.forced) || total - a0 >= (gates ? gates.minPiece : 1.5)) pieces.push([a0, total]);
    for (const { lo, hi } of gateRaw) { // taste W82 fix (TRACK_GATES): a final cut at a farm track. A piece on both sides is a split (the candidate goes to gates.out; the resolver fits it or says why not), on one side only the run ends at the track
      const before = pieces.some((q) => Math.abs(q[1] - lo) < 0.01); const after = pieces.some((q) => Math.abs(q[0] - hi) < 0.01);
      if (before && after) { const A = at(lo + gates.capM); const B = at(hi - gates.capM); gates.out.push({ kind: gates.kind, a: [A.x, A.z], b: [B.x, B.z] }); } else if (before || after) { // a chain that stops in the band: the plan splits a hedge at a track, so the other side may be another chain (paired by the caller)
        const s0 = before ? lo + gates.capM : hi - gates.capM; const dr = before ? 1 : -1;
        const P = at(s0); const Q = at(s0 + dr * 0.6); const R2 = at(s0 - dr * 0.6); const tl2 = Math.hypot(Q.x - R2.x, Q.z - R2.z) || 1;
        gates.halves.push({ tip: [P.x, P.z], t: [(Q.x - R2.x) / tl2, (Q.z - R2.z) / tl2] });
      }
    }
    for (const [pa, pb] of pieces) {
      const m = Math.max(2, Math.round((pb - pa) / (tidyOn && ringM ? ringM : form ? HEDGE_RING_FORM : HEDGE_RING)));
      const ring = (s, wS, hS, lumpS) => {
        const p = at(clamp(s, 0, total));
        const ahead = at(clamp(s + 0.6, 0, total)); const behind = at(clamp(s - 0.6, 0, total));
        let dx = ahead.x - behind.x; let dz = ahead.z - behind.z;
        const l = Math.hypot(dx, dz) || 1;
        dx /= l; dz /= l;
        // Beyond the run end the ring continues along the end tangent.
        const over = s < 0 ? s : s > total ? s - total : 0;
        const rx = p.x + dx * over; const rz = p.z + dz * over;
        const px = -dz; const pz = dx;
        const y = sampleY?.(rx, rz) ?? 0;
        const g = Math.min(groups - 1, Math.max(0, Math.floor((s / total) * groups)));
        const gf = clamp(((s / total) * groups) - g, 0, 1);
        const win = Math.sin(Math.PI * gf);
        const feat = feature[g];
        const eb = sstep(0, 2.6, Math.min(s - pa, pb - s)) * lumpS;
        let h = height + 0.10 * eb * (0.68 * vnoise(rx * 0.55, 0.3, rz * 0.55, seed + 3) + 0.32 * vnoise(rx * 1.4, 0.9, rz * 1.4, seed + 4));
        let wMul = 1 + (-0.12 + 0.26 * (0.5 + 0.5 * vnoise(rx * 0.32, 1.1, rz * 0.32, seed + 5))) * eb;
        let lump = 0.15;
        let wL = 1; let wR = 1; let hueOff = 0; let lMul = 1; let domeK = 0;
        if (feat === 1) { h += 0.55 * win * eb; wMul *= 1 + 0.2 * win * eb; lump = 0.15 + 0.07 * win; }
        if (fr) {
          // The run's own ridge (the ridge noise doubled to 0.2 m), width, hue and value; then an emergent lump over it.
          const sc = clamp(s, 0, total);
          h = fr.at(sc, 'h') + 2 * (h - height);
          wMul = fr.at(sc, 'w') * (1 + (wMul - 1) * 0.8);
          hueOff = fr.at(sc, 'dh'); lMul = fr.at(sc, 'dl');
          lump = 0.19;
          const lk = fr.lumpAt(sc);
          if (lk) {
            const { lp, k } = lk;
            domeK = k;
            h += lp.add * k;
            wMul *= 1 + lp.bw * k;
            wL = lerp(1, lp.sideL, k); wR = lerp(1, lp.sideR, k);
            // taste W28 (hedges-2): a lump (a tree most of all) stands at most 4.5 m tall and 1.8 m either side of the line (the dome's own 0.4 m displacement included).
            h = Math.min(h, 4.1);
            const wm = halfW * wMul * Math.max(wL, wR);
            if (wm > 1.4) wMul *= 1.4 / wm;
            lump = 0.19 + (tidyOn ? TP.lumpDisp : 0.2) * k;
            hueOff += lp.dh * k; lMul *= lerp(1, lp.dl, k);
            // taste W29 (HEDGEROW_TIDY): no yellower than the hedge's own olive (a yellower run's shade face reads warm to the foliage shader
            // and loses its cool shift, so a lump on a yellow run was the tan blotch of h4).
            if (tidyOn) hueOff = lerp(hueOff, Math.max(hueOff, 0), k);
          }
          // taste W28: a piece still starts and ends at the nominal section (1.8 x 2.2 m), as the base form does, so pieces meet a gateway
          // and one another at one size; the run's own ridge and width come in over the first 2.6 m.
          const en = sstep(0, 2.6, Math.min(s - pa, pb - s));
          h = lerp(height, h, en); wMul = lerp(1, wMul, en); wL = lerp(1, wL, en); wR = lerp(1, wR, en);
        }
        h = Math.max(0.4, h) * hS;
        const w = halfW * wMul * wS;
        const leftLit = px * SUN_X + pz * SUN_Z > 0;
        const base = acc.vcount + pos.length / 3;
        for (let k = 0; k < P; k += 1) {
          const [u, v] = HEDGE_PROFILE[k];
          const n2 = profileNormal(k);
          const uw = u * w * (u > 0 ? wR : wL);
          let ox = px * uw;
          let oz = pz * uw;
          let oy = v * h;
          // Two octaves along the run and up the face, none at the foot.
          const qx = rx * 1.15 + u * 2.1; const qy = oy * 1.1; const qz = rz * 1.15 + u * 2.1;
          const dn = 0.66 * vnoise(qx, qy, qz, seed + 9) + 0.34 * vnoise(qx * 2.3 + 5, qy * 2.3, qz * 2.3 + 5, seed + 10);
          const disp = lump * eb * sstep(0.05, 0.45, v) * dn;
          ox += px * n2[0] * disp; oz += pz * n2[0] * disp; oy += n2[1] * disp;
          let py;
          if (v === 0) {
            const bx = rx + ox; const bz = rz + oz;
            const gg = sampleY?.(bx, bz);
            py = (gg === null || gg === undefined ? y : Math.min(y, gg)) - 0.03;
          } else py = y + oy;
          pos.push(rx + ox, py, rz + oz);
          nor.push(px * n2[0], n2[1], pz * n2[0]);
          const litSide = (u > 0) === leftLit ? lit : shade;
          const topT = sstep(0.55, 0.97, v);
          let L = lerp(litSide, crownL, topT);
          L *= lerp(0.46, 1, sstep(0, 0.42, v));
          L *= 1 + 0.10 * (tidyOn ? 1 - (1 - TP.lumpJit) * domeK : 1) * vnoise(rx * 1.3 + u, oy * 1.2, rz * 1.3, seed + 13);
          let hh = hue0 + p.hue * 0.05;
          let ss = sat;
          if (fr) {
            // Shade face (the side the sun is not on, below the crown): yellower and more saturated, so the sky's blue leaves it olive.
            const shK = shadeHue === null ? 0 : (litSide === shade ? 1 : 0) * (1 - topT);
            if (shK > 0) { hh = lerp(hh, shadeHue + p.hue * 0.05, shK); ss = lerp(ss, shadeSat ?? sat, shK); }
            hh += hueOff;
            // taste W30 (HEDGEROW_TRIM): no vertex stands yellower than the hue ceiling (a short run that stepped to 88 degrees read pale lime), and the
            // value a run or a lump adds over the hedge's own lit flank is not taken (the run's value can only darken it); the dome's crown takes `domeDark` off instead of a lift (a dome turns its crown to the key, and read 7 to 10 L* over the eucalypts).
            let lM = lMul;
            if (trimOn) {
              const over = Math.max(0, hh - TP2.hueMax);
              hh -= over;
              // the yellow run's crown (the lit top) takes the value cut in full, its flanks in part; a run at the crowns' own hue and value is as it was
              lM = Math.min(1, lMul) * (1 - (1 - TP2.yellowL) * Math.min(1, over / TP2.yellowSpan) * (0.4 + 0.6 * topT));
            }
            L *= lM * (1 + (trimOn ? -TP2.domeDark : tidyOn ? TP.domeLit : 0.12) * domeK * topT);
          }
          col.setHSL(clamp(hh, 0, 1), clamp(ss * (v === 0 ? 1.05 : 1), 0, 1), clamp(L, 0, 0.95), THREE.SRGBColorSpace);
          cols.push(col.r, col.g, col.b);
        }
        return base;
      };
      const pos = []; const nor = []; const cols = []; const faces = [];
      const rings = [];
      if (fr) {
        // Base rings 1.75 m apart, but a lump gets five of its own (the dome needs them) in place of the base rings under it.
        const at2 = [];
        const wins = fr.lumps.filter((lp) => lp.c - lp.half > pa && lp.c + lp.half < pb);
        for (let k = 0; k <= m; k += 1) {
          const sk = pa + ((pb - pa) * k) / m;
          if (k > 0 && k < m && wins.some((lp) => Math.abs(sk - lp.c) < lp.half * 1.15)) continue;
          at2.push(sk);
        }
        const lumpF = tidyOn && lumpRings ? lumpRings : [-0.85, -0.45, 0, 0.45, 0.85];
        for (const lp of wins) for (const f of lumpF) at2.push(lp.c + lp.half * f);
        at2.sort((a, b) => a - b);
        for (const sk of at2) rings.push(ring(sk, 1, 1, 1));
      } else {
        for (let k = 0; k <= m; k += 1) rings.push(ring(pa + ((pb - pa) * k) / m, 1, 1, 1));
      }
      const capA = ring(pa - 0.35, 0.52, 0.62, 0);
      const capB = ring(pb + 0.35, 0.52, 0.62, 0);
      const base0 = acc.vcount;
      const rel = (r) => r - base0;
      const order = [rel(capA), ...rings.map(rel), rel(capB)];
      for (let i = 0; i < order.length - 1; i += 1) {
        for (let k = 0; k < P - 1; k += 1) {
          const a = order[i] + k; const b = order[i + 1] + k;
          faces.push([a, b, a + 1], [a + 1, b, b + 1]);
        }
      }
      for (let k = 1; k < P - 1; k += 1) {
        faces.push([rel(capA), rel(capA) + k, rel(capA) + k + 1]);
        faces.push([rel(capB), rel(capB) + k + 1, rel(capB) + k]);
      }
      // Orientation: the crown quad of the first interval must face up.
      {
        const [a, b, c2] = faces[5 * 2];
        const e1 = [pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]];
        const e2 = [pos[c2 * 3] - pos[a * 3], pos[c2 * 3 + 1] - pos[a * 3 + 1], pos[c2 * 3 + 2] - pos[a * 3 + 2]];
        const ny = e1[2] * e2[0] - e1[0] * e2[2];
        if (ny < 0) for (const f of faces) { const t = f[1]; f[1] = f[2]; f[2] = t; }
      }
      const sm = vertexNormals(pos, faces);
      for (let i = 0; i < nor.length; i += 3) {
        const bx = sm[i] * 0.6 + nor[i] * 0.4; const by = sm[i + 1] * 0.6 + nor[i + 1] * 0.4; const bz = sm[i + 2] * 0.6 + nor[i + 2] * 0.4;
        const ll = Math.hypot(bx, by, bz) || 1;
        nor[i] = bx / ll; nor[i + 1] = by / ll; nor[i + 2] = bz / ll;
      }
      acc.add({ pos, nor, col: cols, idx: faces.flat() });
      pieceCount += 1;
    }
    runCount += 1;
  }
  const hedgeGeo = acc.toGeometry({ kind: 'hedge', runs: runCount, pieces: pieceCount });
  if (gateways.length) { hedgeGeo.userData.treeForm.gateways = gateways; hedgeGeo.userData.treeForm.gateCuts = gateCuts; }
  if (trimLog.length) hedgeGeo.userData.treeForm.trimLog = trimLog; // taste W29: [{x, z, w}] where a gateway opens at a track
  return hedgeGeo;
}

/* ------------------------------------------------------------------ *
 * Venue and city species (W11-A pass 2): plane, Norfolk Island pine, weeping tree, snow
 * gum, garden shrub. Same lobe rule, tiers and budgets as the eucalypt and cypress.
 * ------------------------------------------------------------------ */

const mod3 = (v) => ((v % 3) + 3) % 3;

/** Lobes on a horizontal ring around (cx, cz) at height y. */
function ringOfLobes(R, lobes, { cx, cz, y, ring, n, r, ry, rz = 1, a0 = 0, flat = 0.75, amp = 0.15, freq = 2.3, primary = false, jitter = 0.35 }) {
  for (let i = 0; i < n; i += 1) {
    const a = a0 + (i * TAU) / n + (R() - 0.5) * jitter;
    const d = ring * (0.85 + R() * 0.3);
    const rr = r * (0.88 + R() * 0.24);
    lobes.push(makeLobe(R, {
      c: [cx + Math.cos(a) * d, y + (R() - 0.5) * 0.5, cz + Math.sin(a) * d],
      r: [rr, rr * ry * (0.92 + R() * 0.16), rr * rz * (0.9 + R() * 0.2)],
      flat, amp: amp + R() * 0.05, freq, primary,
    }));
  }
}

/** Out first, then up: a limb from `start` to `end` as a tapering tube. */
function limbTube(start, end, r0, taper, n, sides, bark, key, seed) {
  const ctrl = { x: start.x + (end.x - start.x) * 0.72, y: start.y + (end.y - start.y) * 0.30, z: start.z + (end.z - start.z) * 0.72 };
  const path = [];
  for (let k = 0; k < n; k += 1) {
    const t = k / (n - 1);
    path.push({ ...quad(start, ctrl, end, t), r: r0 * (1 - taper * t) });
  }
  return tubePrim(path, sides, { wobble: 0.08, seed, colorAt: barkColor(bark, key, 0.95) });
}

const PLANE_VARIANTS = [
  { H: 10.6, limbs: 3, fork: 0.26, leader: true },
  { H: 11.8, limbs: 4, fork: 0.28, leader: false },
  { H: 12.9, limbs: 3, fork: 0.30, leader: true },
];

/**
 * London plane, 9 to 14 m: a stout pale bole (25 to 30% of the height) forking into 3 or 4
 * limbs under a dense round-oval crown of 8 to 11 overlapping lobes, widest at mid height.
 */
export function planeForm({ variant = 0, seed = 0, tier = 'backdrop', bark = DEFAULT_BARK, tone = 1, cards = true, autumn = null } = {}) {
  const hero = tier === 'hero';
  const V = PLANE_VARIANTS[mod3(variant)];
  const R = makeRng(`plane:${variant}:${seed}`);
  const H = V.H * (0.98 + R() * 0.04);
  const s = H / 11.5;
  const level = hero ? 2 : 1;
  const forkH = H * V.fork;
  const rb = 0.27 + R() * 0.05;
  const leanAz = R() * TAU;
  const lean = 0.15 + R() * 0.25;
  const centre = (y) => {
    const f = Math.pow(clamp(y / forkH, 0, 1), 1.6);
    return [Math.cos(leanAz) * lean * f, Math.sin(leanAz) * lean * f];
  };
  const trunkRadius = (y) => rb * (1 - 0.2 * clamp((y - 1.2) / Math.max(1, forkH - 1.2), 0, 1)) * (y < 0.7 ? 1 + 0.5 * Math.pow(1 - y / 0.7, 2) : 1);
  const top0 = { x: centre(forkH)[0], y: forkH, z: centre(forkH)[1] };
  const lobes = [];
  const a0 = R() * TAU;
  ringOfLobes(R, lobes, { cx: top0.x, cz: top0.z, y: H * 0.52, ring: 1.9 * s, n: V.limbs, r: 1.9 * s, ry: 0.88, a0, flat: 0.8 });
  ringOfLobes(R, lobes, { cx: top0.x, cz: top0.z, y: H * 0.69, ring: 2.5 * s, n: 4, r: 2.3 * s, ry: 0.9, a0: a0 + 0.5, flat: 0.78, primary: true });
  ringOfLobes(R, lobes, { cx: top0.x, cz: top0.z, y: H * 0.86, ring: 1.2 * s, n: V.limbs === 4 ? 2 : 3, r: 1.75 * s, ry: 0.9, a0: a0 + 1.1, flat: 0.75 });
  const apex = makeLobe(R, { c: [top0.x, H - 1.2 * s, top0.z], r: [1.5 * s, 1.35 * s, 1.5 * s], primary: true, flat: 0.75, amp: 0.15, freq: 2.4 });
  lobes.push(apex);
  let top = -Infinity;
  for (const L of lobes) top = Math.max(top, L.c[1] + L.r[1] * 1.08);
  const lift = H - top;
  for (const L of lobes) L.c[1] += lift;
  const lower = lobes.slice(0, V.limbs);
  const budget = (hero ? FORM_BUDGET.plane.hero : FORM_BUDGET.plane.backdrop) - (cards && cardsActive ? CARD_TRIS : 0); // W21-A: the cards come on top of the core
  const build = (set) => {
    const acc = new MeshAcc();
    const ys = hero ? [0, 0.3, 0.7, 1.3, forkH * 0.5, forkH * 0.78, forkH] : [0, 0.7, forkH * 0.5, forkH];
    const path = ys.map((y) => { const c = centre(y); return { x: c[0], y, z: c[1], r: trunkRadius(y) }; });
    acc.add(tubePrim(path, 7, { wobble: 0.10, seed: 71 + variant, colorAt: barkColor(bark, 21 + variant), capTop: true, flatBase: true }));
    lower.forEach((L, i) => {
      if (!set.includes(L)) return;
      const a = Math.atan2(L.c[2] - top0.z, L.c[0] - top0.x);
      const start = { x: top0.x + Math.cos(a) * 0.1, y: forkH - 0.1, z: top0.z + Math.sin(a) * 0.1 };
      const end = { x: L.c[0], y: L.c[1] - L.r[1] * 0.3, z: L.c[2] };
      acc.add(limbTube(start, end, 0.19 + R0(i) * 0.01, 0.62, hero ? 6 : 3, hero ? 7 : 5, bark, 31 + i, 81 + i));
    });
    if (V.leader && set.includes(apex)) {
      acc.add(tubePrim(bendPath({ x: top0.x, y: forkH - 0.1, z: top0.z }, { x: apex.c[0], y: apex.c[1] - apex.r[1] * 0.3, z: apex.c[2] }, 0.2, 0, 0.2, [0.17, 0.07], hero ? 5 : 3), hero ? 7 : 5, { wobble: 0.08, seed: 91, colorAt: barkColor(bark, 41, 0.97) }));
    }
    acc.add(crownPrim(set, level, { under: 0.30, interior: 0.30, crease: 0.22, crown: crownFrame(set), tone, cards, cullDown: hero ? undefined : -0.62, look: crownLook('plane', variant, seed, tier, autumn) }));
    return acc;
  };
  if (hero) for (const L of lobes) if (L.primary) L.level = 2;
  const { set, acc } = fitBudget(lobes, level, budget, build, 7);
  return acc.toGeometry({ kind: 'plane', variant, tier, height: H, lobes: set.length });
}

const NORFOLK_VARIANTS = [
  { H: 16.5, whorls: 6, rmax: 3.0 },
  { H: 19.5, whorls: 7, rmax: 3.4 },
  { H: 22.5, whorls: 8, rmax: 3.8 },
];

/**
 * Norfolk Island pine, 14 to 24 m: a dead-straight trunk, bare for the lowest fifth, then 6 to
 * 8 regular whorls of flattened, drooping branch plates that shrink to a pointed top, with the
 * trunk showing in the gaps between tiers.
 */
export function norfolkForm({ variant = 0, seed = 0, tier = 'backdrop', bark = DEFAULT_BARK, tone = 1 } = {}) {
  const hero = tier === 'hero';
  const V = NORFOLK_VARIANTS[mod3(variant)];
  const R = makeRng(`norfolk:${variant}:${seed}`);
  const H = V.H * (0.98 + R() * 0.04);
  const level = hero ? 2 : 1;
  const lobes = [];
  const y0 = H * 0.22;
  const y1 = H * 0.9;
  for (let i = 0; i < V.whorls; i += 1) {
    const t = i / (V.whorls - 1);
    const y = lerp(y0, y1, t);
    const rw = V.rmax * Math.pow(1 - 0.9 * t, 0.9) + 0.35;
    const ry = 0.13 * rw + 0.28;
    lobes.push(makeLobe(R, {
      c: [(R() - 0.5) * 0.1, y, (R() - 0.5) * 0.1], r: [rw, ry, rw * (0.94 + R() * 0.08)],
      flat: 0.9, amp: 0.09 + R() * 0.03, freq: 2.0, axisYaw: i * 0.8 + R() * 0.3,
    }));
    lobes[lobes.length - 1].droop = 0.30;
  }
  const spire = makeLobe(R, { c: [0, H - 1.25, 0], r: [0.55, 1.45, 0.55], flat: 1, amp: 0.08, freq: 2.0, primary: true });
  lobes.push(spire);
  const budget = hero ? FORM_BUDGET.norfolk.hero : FORM_BUDGET.norfolk.backdrop;
  const build = (set) => {
    const acc = new MeshAcc();
    const rAt = (y) => 0.40 * (1 - 0.9 * Math.pow(y / H, 1.1)) * (y < 0.6 ? 1 + 0.25 * (1 - y / 0.6) : 1);
    const ys = hero ? [0, 0.4, 1.2, y0, H * 0.4, H * 0.6, H * 0.8, H * 0.97] : [0, 0.6, y0, H * 0.55, H * 0.97];
    acc.add(tubePrim(ys.map((y) => ({ x: 0, y, z: 0, r: Math.max(0.05, rAt(y)) })), hero ? 8 : 6, { wobble: 0.03, seed: 101 + variant, colorAt: barkColor(bark, 51 + variant, 0.8), flatBase: true }));
    acc.add(crownPrim(set, level, { under: 0.30, interior: 0.30, crease: 0.12, crown: crownFrame(set), tone, cullDown: hero ? undefined : -0.30, mottle: 0.07 }));
    return acc;
  };
  if (hero) for (const L of lobes) L.level = 2;
  const { set, acc } = fitBudget(lobes, level, budget, build, 5);
  return acc.toGeometry({ kind: 'norfolk', variant, tier, height: H, lobes: set.length });
}

const WEEPING_VARIANTS = [
  { H: 7.6, curtains: 7 },
  { H: 8.7, curtains: 8 },
  { H: 9.6, curtains: 7 },
];

/**
 * Peppercorn or willow character, 7 to 10 m: a short thick trunk under a rounded dome whose
 * lobes sag into hanging curtains that end 1 to 2 m above the ground.
 */
export function weepingForm({ variant = 0, seed = 0, tier = 'backdrop', bark = DEFAULT_BARK, tone = 1, autumn = null } = {}) {
  const hero = tier === 'hero';
  const V = WEEPING_VARIANTS[mod3(variant)];
  const R = makeRng(`weeping:${variant}:${seed}`);
  const H = V.H * (0.98 + R() * 0.04);
  const s = H / 8.5;
  const level = hero ? 2 : 1;
  const forkH = 1.9 * s;
  const rb = 0.32 + R() * 0.04;
  const lobes = [];
  const domeY = H * 0.70;
  const dome = makeLobe(R, { c: [0, domeY, 0], r: [3.0 * s, 1.7 * s, 3.0 * s], primary: true, flat: 0.7, amp: 0.15, freq: 2.2 });
  lobes.push(dome);
  ringOfLobes(R, lobes, { cx: 0, cz: 0, y: domeY - 0.2, ring: 1.9 * s, n: 3, r: 1.9 * s, ry: 0.85, a0: R() * TAU, flat: 0.7, primary: true });
  // Curtains: tall lobes on the dome's skirt, their lower ends 1 to 2 m off the ground.
  const a0 = R() * TAU;
  for (let i = 0; i < V.curtains; i += 1) {
    const a = a0 + (i * TAU) / V.curtains + (R() - 0.5) * 0.3;
    const d = (2.7 + R() * 0.5) * s;
    const bottom = 1.1 + R() * 0.8;
    const topY = H * 0.68;
    const hh = (topY - bottom) * 0.5;
    const rt = (0.95 + R() * 0.25) * s;
    lobes.push(makeLobe(R, {
      c: [Math.cos(a) * d, bottom + hh, Math.sin(a) * d], r: [rt, hh, rt * 1.2],
      flat: 0.92, amp: 0.15 + R() * 0.05, freq: 2.4, axisYaw: a + Math.PI / 2,
    }));
  }
  let top = -Infinity;
  for (const L of lobes) top = Math.max(top, L.c[1] + L.r[1] * 1.08);
  const lift = H - top;
  for (const L of lobes) if (L.r[1] < 2.0 * s && L.c[1] > domeY - 0.5) L.c[1] += lift;
  const budget = hero ? FORM_BUDGET.weeping.hero : FORM_BUDGET.weeping.backdrop;
  const build = (set) => {
    const acc = new MeshAcc();
    const ys = hero ? [0, 0.3, 0.8, forkH * 0.6, forkH] : [0, 0.7, forkH];
    acc.add(tubePrim(ys.map((y) => ({ x: 0, y, z: 0, r: rb * (1 - 0.18 * clamp(y / forkH, 0, 1)) * (y < 0.7 ? 1 + 0.5 * Math.pow(1 - y / 0.7, 2) : 1) })), 7, { wobble: 0.10, seed: 111 + variant, colorAt: barkColor(bark, 61 + variant), capTop: true, flatBase: true }));
    for (let i = 0; i < 3; i += 1) {
      const L = lobes[1 + i];
      if (!set.includes(L)) continue;
      const a = Math.atan2(L.c[2], L.c[0]);
      acc.add(limbTube({ x: Math.cos(a) * 0.1, y: forkH - 0.1, z: Math.sin(a) * 0.1 }, { x: L.c[0], y: L.c[1] - L.r[1] * 0.3, z: L.c[2] }, 0.2, 0.6, hero ? 5 : 3, hero ? 7 : 5, bark, 71 + i, 121 + i));
    }
    acc.add(crownPrim(set, level, { under: 0.28, interior: 0.28, crease: 0.20, crown: crownFrame(set), tone, cullDown: hero ? undefined : -0.62, look: crownLook('weeping', variant, seed, tier, autumn) }));
    return acc;
  };
  if (hero) for (const L of lobes) if (L.primary) L.level = 2;
  const { set, acc } = fitBudget(lobes, level, budget, build, 6);
  return acc.toGeometry({ kind: 'weeping', variant, tier, height: H, lobes: set.length });
}

const SNOW_VARIANTS = [
  { H: 5.6, stems: 2 },
  { H: 6.6, stems: 3 },
  { H: 7.6, stems: 3 },
];

/**
 * Snow gum, 5 to 8 m: two or three twisted, leaning stems from the base carrying sparse,
 * flattened lobes at their ends and on side branches.
 */
export function snowGumForm({ variant = 0, seed = 0, tier = 'backdrop', bark = DEFAULT_BARK, tone = 1 } = {}) {
  const hero = tier === 'hero';
  const V = SNOW_VARIANTS[mod3(variant)];
  const R = makeRng(`snowgum:${variant}:${seed}`);
  const H = V.H * (0.98 + R() * 0.04);
  const level = hero ? 2 : 1;
  const a0 = R() * TAU;
  const stems = [];
  const lobes = [];
  for (let i = 0; i < V.stems; i += 1) {
    const az = a0 + (i * TAU) / V.stems + (R() - 0.5) * 0.7;
    const lean = 0.30 + R() * 0.22;
    const yTop = (i === 0 ? H - 1.0 : H - 1.0 - R() * 1.6);
    const phase = R() * TAU;
    const r0 = 0.20 + R() * 0.06;
    const ox = Math.cos(az + 1.2) * 0.12; const oz = Math.sin(az + 1.2) * 0.12;
    const pt = (t) => {
      const d = Math.tan(lean) * yTop * Math.pow(t, 1.25);
      const tw = 0.30 * Math.sin(t * 5.2 + phase) * Math.min(1, t * 2);
      return { x: ox + Math.cos(az) * d - Math.sin(az) * tw, y: yTop * t, z: oz + Math.sin(az) * d + Math.cos(az) * tw };
    };
    stems.push({ pt, r0, az, key: i });
    const end = pt(1);
    const rx = 1.5 + R() * 0.5;
    lobes.push(makeLobe(R, { c: [end.x + Math.cos(az) * 0.2, end.y + 0.55, end.z + Math.sin(az) * 0.2], r: [rx, rx * 0.5, rx * 0.92], flat: 0.55, amp: 0.20, freq: 2.4, primary: true }));
    const mid = pt(0.64);
    const az2 = az + (R() < 0.5 ? -1 : 1) * (1.0 + R() * 0.6);
    const rs = 0.95 + R() * 0.35;
    const sideLobe = makeLobe(R, { c: [mid.x + Math.cos(az2) * 1.5, mid.y + 0.7 + R() * 0.5, mid.z + Math.sin(az2) * 1.5], r: [rs, rs * 0.52, rs * 0.95], flat: 0.55, amp: 0.2, freq: 2.5 });
    lobes.push(sideLobe);
    stems[stems.length - 1].side = sideLobe;
    stems[stems.length - 1].midPt = mid;
  }
  const budget = hero ? FORM_BUDGET.snowGum.hero : FORM_BUDGET.snowGum.backdrop;
  const build = (set) => {
    const acc = new MeshAcc();
    for (const st of stems) {
      const n = hero ? 13 : 4;
      const path = [];
      for (let k = 0; k < n; k += 1) {
        const t = k / (n - 1);
        path.push({ ...st.pt(t), r: st.r0 * (1 - 0.72 * t) });
      }
      acc.add(tubePrim(path, hero ? 8 : 5, { wobble: 0.09, seed: 131 + st.key, colorAt: barkColor(bark, 81 + st.key, 0.9), flatBase: true }));
      if (st.side && set.includes(st.side)) {
        const e = { x: st.side.c[0], y: st.side.c[1] - st.side.r[1] * 0.3, z: st.side.c[2] };
        acc.add(tubePrim(bendPath(st.midPt, e, 0, 0.2, 0, [st.r0 * 0.34, st.r0 * 0.17], hero ? 4 : 2), hero ? 6 : 4, { wobble: 0.08, seed: 141 + st.key, colorAt: barkColor(bark, 91 + st.key, 0.95) }));
      }
    }
    acc.add(crownPrim(set, level, { under: 0.28, interior: 0.18, crease: 0.2, crown: crownFrame(set), tone, cullDown: hero ? undefined : -0.5 }));
    return acc;
  };
  if (hero) for (const L of lobes) L.level = 2;
  const { set, acc } = fitBudget(lobes, level, budget, build, V.stems + 1);
  return acc.toGeometry({ kind: 'snowGum', variant, tier, height: H, lobes: set.length });
}

const SHRUB_VARIANTS = [
  { H: 1.3, n: 3 },
  { H: 1.6, n: 4 },
  { H: 1.9, n: 5 },
];

/**
 * Garden shrub, 1 to 2 m: 3 to 5 domed lobes on a ring plan, stood on y = 0 (the base is
 * flat and 4 cm under the soil). The hero tier is the same shrub with a dense crown of
 * smaller lobes at icosphere level 2.
 */
export function shrubForm({ variant = 0, seed = 0, tier = 'backdrop', tone = 0.9 } = {}) {
  const hero = tier === 'hero';
  const V = SHRUB_VARIANTS[mod3(variant)];
  const R = makeRng(`shrub:${variant}:${seed}`);
  const H = V.H * (0.97 + R() * 0.06);
  const lobes = [];
  const n = hero ? V.n + 19 : V.n;
  const a0 = R() * TAU;
  for (let i = 0; i < n; i += 1) {
    const big = i < V.n;
    const a = a0 + (i * TAU) / V.n * (big ? 1 : 0.83) + (R() - 0.5) * 0.5;
    const d = big ? (i === 0 ? 0.05 : 0.30 + R() * 0.14) * H : (0.34 + R() * 0.3) * H;
    const rr = big ? (0.40 + R() * 0.08) * H : (0.20 + R() * 0.08) * H;
    const hh = big ? H * (i === 0 ? 0.92 : 0.52 + R() * 0.26) : H * (0.30 + R() * 0.3);
    const L = makeLobe(R, { c: [Math.cos(a) * d, -0.04, Math.sin(a) * d], r: [rr, hh, rr * (0.9 + R() * 0.2)], flat: 1, dome: true, primary: i < 2, amp: 0.15 + R() * 0.05, freq: 2.6 });
    lobes.push(L);
  }
  const budget = hero ? FORM_BUDGET.shrub.hero : FORM_BUDGET.shrub.backdrop;
  const build = (set) => {
    const acc = new MeshAcc();
    acc.add(crownPrim(set, hero ? 2 : 1, { under: 0.30, interior: 0.2, crease: 0.2, crown: { ...crownFrame(set), bottom: -0.04, top: H }, tone, insideThreshold: 0.8, look: crownLook('shrub', variant, seed, tier, null) }));
    return acc;
  };
  if (hero) for (const L of lobes) L.level = 2;
  const { set, acc } = fitBudget(lobes, hero ? 2 : 1, budget, build, 3);
  return acc.toGeometry({ kind: 'shrub', variant, tier, height: H, lobes: set.length });
}

/**
 * One import for every tree and shrub form. Real sizes, in metres, y up, standing on y = 0:
 *
 * | species   | height   | crown across | character                                       |
 * |-----------|----------|--------------|-------------------------------------------------|
 * | eucalypt  | 19       | 12 to 14     | thick pale bole, low heavy limbs, hanging clumps|
 * | cypress   | 13       | 6 to 8       | dense lumpy cone, foliaged nearly to the ground |
 * | plane     | 10.5 to 13 | 9 to 10    | stout pale bole, dense round-oval crown         |
 * | norfolk   | 16.5 to 22.5 | 6 to 8   | straight trunk, 6 to 8 drooping whorl plates    |
 * | weeping   | 7.5 to 9.5 | 7 to 8     | dome with curtains ending 1 to 2 m above ground |
 * | snowGum   | 5.5 to 7.5 | 4 to 6     | 2 or 3 twisted leaning stems, flat sparse lobes |
 * | shrub     | 1.2 to 1.9 | 1.5 to 2   | 3 to 5 domed lobes; hero tier a dense bed shrub |
 *
 * Tiers: `backdrop` is at most 520 triangles (shrub 120); `hero` is 1,400 to 2,400.
 * `variant` 0 to 2, `seed` any integer; the same inputs give identical buffers. `bark` and `tone`
 * are colour multipliers on the instance colour (see the fringe's `treeFormOptions`).
 */
export function treeForm(species, opts = {}) {
  const fn = TREE_FORMS[species];
  if (!fn) throw new Error(`treeForm: unknown species "${species}" (${Object.keys(TREE_FORMS).join(', ')})`);
  return fn(opts);
}

const TREE_FORMS = Object.freeze({
  eucalypt: eucalyptForm,
  cypress: cypressForm,
  plane: planeForm,
  norfolk: norfolkForm,
  weeping: weepingForm,
  snowGum: snowGumForm,
  shrub: shrubForm,
});

/** The species `treeForm` accepts. */
export const TREE_FORM_SPECIES = Object.freeze(Object.keys(TREE_FORMS));

/* ------------------------------------------------------------------ *
 * Windbreak: a row of backdrop cypress, crowns touching, along polylines
 * ------------------------------------------------------------------ */

/**
 * Walk each run (`stations`: [{x, z}]) at `spacing` metres and stand a backdrop
 * cypress at every stop, seated on `sampleY`. Returns one merged geometry whose colour
 * attribute already carries the species colour (`tint`, linear rgb), because a merged
 * mesh has no instance colour. `avoid` ([{x,z}]) lists trees already standing; a stop
 * within `avoidRadius` of one is skipped.
 */
export function windbreakRowGeometry(runs, {
  sampleY, seed = 0, spacing = 5.5, tint = [1, 1, 1], avoid = [], avoidRadius = 3.2, forms,
  // taste W82 (TRACK_GATES): `{ dist(x, z, limit), band, stubM, nearM, dropped, stubs }`. A tree with a vertex inside the band is skipped (after its draws, so no other tree moves); a
  // cluster of trees (centres within 8 m) whose extent is under stubM within nearM of a track is not drawn.
  gates = null,
} = {}) {
  const acc = new MeshAcc();
  const kept = gates ? [] : null;
  const cache = forms ?? [0, 1, 2].map((v) => cypressForm({ variant: v, seed: 0, tier: 'backdrop', cards: false }));
  let trees = 0;
  for (let r = 0; r < runs.length; r += 1) {
    const st = runs[r];
    if (st.length < 2) continue;
    const R = makeRng(`windbreak:${seed}:${Math.round(st[0].x)}:${Math.round(st[0].z)}`);
    let total = 0;
    for (let i = 0; i < st.length - 1; i += 1) total += Math.hypot(st[i + 1].x - st[i].x, st[i + 1].z - st[i].z);
    const count = Math.max(1, Math.round(total / spacing));
    for (let n = 0; n < count; n += 1) {
      // Position along the run.
      const target = ((n + 0.5) / count) * total + (R() - 0.5) * spacing * 0.18;
      let acc2 = 0;
      let px = st[0].x; let pz = st[0].z;
      for (let i = 0; i < st.length - 1; i += 1) {
        const segLen = Math.hypot(st[i + 1].x - st[i].x, st[i + 1].z - st[i].z);
        if (acc2 + segLen >= target || i === st.length - 2) {
          const f = clamp((target - acc2) / (segLen || 1), 0, 1);
          px = lerp(st[i].x, st[i + 1].x, f); pz = lerp(st[i].z, st[i + 1].z, f);
          break;
        }
        acc2 += segLen;
      }
      px += (R() - 0.5) * 0.9; pz += (R() - 0.5) * 0.9;
      const variant = Math.floor(R() * 3);
      const yaw = R() * TAU;
      const k = 0.88 + R() * 0.26;
      if (avoid.some((a) => Math.hypot(a.x - px, a.z - pz) < avoidRadius)) continue;
      const geo = cache[variant];
      const gp = geo.getAttribute('position'); const gn = geo.getAttribute('normal'); const gc = geo.getAttribute('color');
      // Seat on the lowest ground under the foot.
      let y = sampleY ? sampleY(px, pz) : 0;
      if (sampleY) for (const [ox, oz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) y = Math.min(y, sampleY(px + ox, pz + oz));
      const cy = Math.cos(yaw); const sy = Math.sin(yaw);
      const pos = []; const nor = []; const col = [];
      for (let i = 0; i < gp.count; i += 1) {
        const x = gp.getX(i) * k; const yy = gp.getY(i) * k; const z = gp.getZ(i) * k;
        pos.push(px + x * cy + z * sy, y - 0.12 + yy, pz - x * sy + z * cy);
        const nx = gn.getX(i); const nz = gn.getZ(i);
        nor.push(nx * cy + nz * sy, gn.getY(i), -nx * sy + nz * cy);
        col.push(gc.getX(i) * tint[0], gc.getY(i) * tint[1], gc.getZ(i) * tint[2]);
      }
      const idx = [];
      const gi = geo.index;
      for (let i = 0; i < gi.count; i += 1) idx.push(gi.getX(i));
      if (kept) {
        const cd = gates.dist(px, pz, gates.band + 6);
        if (cd < gates.band || (cd <= gates.band + 6 && Array.from({ length: pos.length / 3 }, (_, v) => gates.dist(pos[v * 3], pos[v * 3 + 2], gates.band + 0.01)).some((d) => d < gates.band))) { gates.dropped += 1; continue; }
        kept.push({ px, pz, rec: { pos, nor, col, idx } });
        continue;
      }
      acc.add({ pos, nor, col, idx });
      trees += 1;
    }
  }
  if (kept) { // taste W82 (TRACK_GATES): the stubs, then the trees in order
    const n = kept.length; const par = kept.map((_, i) => i); const f = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) if (Math.hypot(kept[i].px - kept[j].px, kept[i].pz - kept[j].pz) <= 8) par[f(j)] = f(i);
    const groups = new Map(); kept.forEach((_, i) => { const r = f(i); const l = groups.get(r); if (l) l.push(i); else groups.set(r, [i]); });
    const gone = new Set();
    for (const g2 of groups.values()) {
      if (!g2.some((i) => gates.dist(kept[i].px, kept[i].pz, gates.nearM + 6) <= gates.nearM + 6)) continue;
      const P = g2.flatMap((i) => { const ps = kept[i].rec.pos; return Array.from({ length: ps.length / 3 }, (_, v) => [ps[v * 3], ps[v * 3 + 2]]); });
      if (!P.some((q) => gates.dist(q[0], q[1], gates.nearM) <= gates.nearM)) continue;
      let mx = 0; let mz = 0; for (const q of P) { mx += q[0]; mz += q[1]; } mx /= P.length; mz /= P.length;
      let sxx = 0; let sxz = 0; let szz = 0; for (const q of P) { const a = q[0] - mx; const b = q[1] - mz; sxx += a * a; sxz += a * b; szz += b * b; }
      const th = 0.5 * Math.atan2(2 * sxz, sxx - szz); const ax = Math.cos(th); const az = Math.sin(th);
      let lo = Infinity; let hi = -Infinity; for (const q of P) { const sv = (q[0] - mx) * ax + (q[1] - mz) * az; lo = Math.min(lo, sv); hi = Math.max(hi, sv); }
      if (hi - lo < gates.stubM) { for (const i of g2) gone.add(i); gates.stubs += g2.length; }
    }
    kept.forEach((k, i) => { if (gone.has(i)) return; acc.add(k.rec); trees += 1; });
  }
  const g = acc.toGeometry({ kind: 'windbreak-row', trees });
  g.userData.treeForm.trees = trees;
  return g;
}

/** Summary of a built form, for the report and the tests. */
export function formStats(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  return {
    tris: geo.index.count / 3,
    verts: geo.getAttribute('position').count,
    size: [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map((v) => +v.toFixed(2)),
    min: b.min.toArray().map((v) => +v.toFixed(2)),
    max: b.max.toArray().map((v) => +v.toFixed(2)),
  };
}
