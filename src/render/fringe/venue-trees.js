// District Deck: venue trees on the shared tree forms (wave thirteen, lane W13-A).
//
// The airport, Southern Cross, Grand Prix and Melbourne Park used to plant "a sphere on a
// trunk" (leaf-cluster cards, three stacked ellipsoids). This module stands the real forms of
// `tree-forms.js` in their place, with the same colour law the hinterland trees use
// (`fringe.js#_plantTrees`): a white-ish material that carries the species token in linear light
// at the fringe's lighting gain, and the form's own vertex `color` as a multiplier (baked
// occlusion, lobe tint, and a bark multiplier that is the bark token divided by the leaf colour).
//
// Pure geometry plus materials; no scene reads, no Math.random. A kit is made once per venue
// build (`createVenueTreeKit()`), so a layer that is disposed takes its materials with it.
//
//   const trees = createVenueTreeKit();
//   trees.tree(group, { species: 'plane', x, y, z, height: 11, seed: 3, roll: 0.4 });  // one named Mesh
//   trees.field(group, items, 'fringe:grand-prix-form-trees');                         // InstancedMesh per form
//
// Species heights (brief W13-A): plane 9 to 14 m, eucalypt 12 to 20 m, cypress 10 to 15 m,
// weeping 7 to 10 m. Nothing shorter than 6 m.

import * as THREE from 'three';
import { treeForm, crownCardsActive, crownSwitch } from '../tree-forms.js';
import { applyFoliageDetail, crownCardDepthMaterial } from '../foliage-detail.js'; // W19-A; W21-A cards
import { TASTE } from '../taste-tokens.js';

/** The lighting gain the hinterland trees use (fringe.js TREE_GAIN): the grade lifts everything. */
export const VENUE_TREE_GAIN = 0.34;
/** Foliage multiplier inside the forms, as fringe.js TREE_FORM_TONE. */
export const VENUE_TREE_TONE = 0.80;

/**
 * taste-r1 (W20): the switch for the venue trees' variety. 1 gives every tree a size factor of 0.7 to 1.3 on its
 * height (a fifth small understorey trees, a tenth tall ones), a value roll of 0.90 to 1.10 and a hue lean of a few
 * degrees toward yellow or blue-green; 0 restores the W19 sizes (height as the caller gave it) and the 0.96 to 1.04 roll.
 */
export const VENUE_TREE_VARIETY = 1;
/** Hue lean at full strength, in degrees (toward yellow-green one way, toward blue-green the other). */
export const VENUE_TREE_LEAN_DEG = 7;
/** A tree whose item carries `keepSmall` never takes a size factor above this (stands, courts, path lights). */
export const VENUE_TREE_KEEP_SMALL = 1.0;

export const VENUE_TREE_HEIGHT = Object.freeze({
  plane: Object.freeze([9, 14]),
  eucalypt: Object.freeze([12, 20]),
  cypress: Object.freeze([10, 15]),
  weeping: Object.freeze([7, 10]),
});

const lin = (hex) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};

const F = TASTE.foliage;

/** Per species: the leaf colour (tokens, optional blend), the green tint, and which bark it wears. */
const SPECIES = Object.freeze({
  plane: Object.freeze({ a: F.leafB, b: F.leafA, mix: 0.30, tint: [0.97, 1.10, 0.54], bark: 'pale' }),
  eucalypt: Object.freeze({ a: F.leafGrey, b: F.leafB, mix: 0.75, tint: [0.95, 1.12, 0.52], bark: 'pale' }),
  cypress: Object.freeze({ a: F.leafA, b: null, mix: 0, tint: [1.0, 1.12, 0.55], bark: 'dark' }),
  weeping: Object.freeze({ a: F.leafGrey, b: F.leafB, mix: 0.45, tint: [0.95, 1.12, 0.55], bark: 'mid' }),
});
const AUTUMN_TINT = Object.freeze([1.0, 0.98, 0.9]);

/**
 * taste-r1 (W25): the switch for the autumn crowns. 1 mixes TASTE.foliage.autumnSet (some leaves still green, russet, copper,
 * amber, old gold) card by card inside one autumn crown, where a crown is one flat ochre otherwise; the tree keeps the leafAutumn
 * instance colour and each card carries its tone as a multiplier on it. 0 restores wave twenty-four exactly. Browser:
 * `?autumnSet=0`; node: `DD_AUTUMN_SET=0`; tests may call `setAutumnSet`.
 */
export const AUTUMN_SET = crownSwitch('DD_AUTUMN_SET', 'autumnSet');
let autumnSetActive = AUTUMN_SET;
export function setAutumnSet(v) { autumnSetActive = v ? 1 : 0; }
export function autumnSetOn() { return autumnSetActive; }
/** Low in the crown to high, with the share of cards each tone takes. A tone's `tint` is the instance tint it wears: the green is a plane that has not turned and wears its token. */
const AUTUMN_TONES = Object.freeze([
  Object.freeze({ key: 'green', w: 0.12, tint: [1, 1, 1] }),
  Object.freeze({ key: 'russet', w: 0.24, tint: AUTUMN_TINT }),
  Object.freeze({ key: 'copper', w: 0.22, tint: AUTUMN_TINT }),
  Object.freeze({ key: 'amber', w: 0.24, tint: AUTUMN_TINT }),
  Object.freeze({ key: 'oldGold', w: 0.18, tint: AUTUMN_TINT }),
]);
let autumnTonesCache = null;
/** The tones as multipliers on the leafAutumn instance colour (linear rgb), built once. */
export function autumnTones() {
  if (!autumnTonesCache) {
    const base = lin(F.leafAutumn);
    autumnTonesCache = AUTUMN_TONES.map((t) => {
      const c = lin(F.autumnSet[t.key]);
      return { w: t.w, mul: c.map((v, ch) => (v * t.tint[ch]) / (base[ch] * AUTUMN_TINT[ch])) };
    });
  }
  return autumnTonesCache;
}

/** Leaf colour and tint of one species in linear light, before the gain. */
function leafOf(species, autumn) {
  const sp = SPECIES[species];
  if (autumn) return { rgb: lin(F.leafAutumn), tint: AUTUMN_TINT };
  const rgb = lin(sp.a);
  if (sp.b) {
    const other = lin(sp.b);
    for (let ch = 0; ch < 3; ch += 1) rgb[ch] += (other[ch] - rgb[ch]) * sp.mix;
  }
  return { rgb, tint: sp.tint };
}

/** Bark token in linear light: pale for plane and eucalypt, the trunk token for cypress. */
function barkOf(kind) {
  const trunk = new THREE.Color(F.trunk);
  if (kind === 'dark') return [trunk.r, trunk.g, trunk.b];
  const pale = new THREE.Color(TASTE.ground.rockLight);
  const c = pale.lerp(trunk, kind === 'mid' ? 0.7 : 0.45);
  return [c.r, c.g, c.b];
}

/** Options for the form: bark multiplier (bark token / instance colour) and the foliage tone. */
export function venueTreeFormOptions(species, autumn = false) {
  const sp = SPECIES[species];
  const { rgb, tint } = leafOf(species, autumn);
  const bark = barkOf(sp.bark).map((b, ch) => Math.min(6, b / Math.max(1e-4, rgb[ch] * tint[ch])));
  return autumn && autumnSetActive ? { bark, tone: VENUE_TREE_TONE, autumn: autumnTones() } : { bark, tone: VENUE_TREE_TONE };
}

/** The instance or material colour of one tree: species token, tint, gain and a small value roll. */
export function venueTreeColour(species, roll = 0.5, autumn = false, out = new THREE.Color(), lean = 0) {
  const { rgb, tint } = leafOf(species, autumn);
  const vv = VENUE_TREE_GAIN * (VENUE_TREE_VARIETY ? 0.90 + clamp01(roll) * 0.20 : 0.96 + clamp01(roll) * 0.08);
  out.setRGB(rgb[0] * vv * tint[0], rgb[1] * vv * tint[1], rgb[2] * vv * tint[2]);
  if (VENUE_TREE_VARIETY && lean !== 0 && !autumn) {
    // `lean` in -1..1: negative toward yellow (smaller hue), positive toward blue-green. Hue only; value and saturation hold.
    const hsl = out.getHSL({ h: 0, s: 0, l: 0 });
    out.setHSL(hsl.h + lean * VENUE_TREE_LEAN_DEG / 360, hsl.s, hsl.l);
  }
  return out;
}

/**
 * The size factor of one tree from its site: 0.7 to 1.3 on the height, skewed so about a fifth are small (0.7 to 0.9),
 * seven in ten ordinary (0.9 to 1.1) and a tenth tall (1.1 to 1.3). 1 when the variety switch is off or the tree is
 * flagged `keepSmall`.
 */
export function venueTreeSize(x, z, variant = 0, keepSmall = false) {
  if (!VENUE_TREE_VARIETY) return 1;
  const u = venueTreeUnit(x, z, variant, 31);
  const f = u < 0.2 ? 0.7 + u * 1.0 : u < 0.9 ? 0.9 + (u - 0.2) * (0.2 / 0.7) : 1.1 + (u - 0.9) * 2.0;
  return keepSmall ? Math.min(f, VENUE_TREE_KEEP_SMALL) : f;
}

/** Hue lean of one tree from its site, -1 to 1. */
export function venueTreeLean(x, z, variant = 0) {
  return venueTreeUnit(x, z, variant, 37) * 2 - 1;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Deterministic unit from integers, for per-tree rolls (same family as the venues' own hashes). */
export function venueTreeUnit(a, b = 0, c = 0, salt = 0) {
  let n = (Math.imul(Math.round(a * 16) | 0, 0x45d9f3b) ^ Math.imul(Math.round(b * 16) | 0, 0x119de1f3)
    ^ Math.imul((c | 0) + 17, 0x27d4eb2d) ^ Math.imul(salt | 0, 0x165667b1)) >>> 0;
  n ^= n >>> 16;
  n = Math.imul(n, 0x7feb352d);
  n ^= n >>> 15;
  n = Math.imul(n, 0x846ca68b);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

/** Height inside the species band from a 0..1 roll. */
export function venueTreeHeight(species, roll) {
  const [lo, hi] = VENUE_TREE_HEIGHT[species];
  return lo + clamp01(roll) * (hi - lo);
}

export function createVenueTreeKit() {
  const materials = new Map();
  const geometries = new Map();
  let white = null;
  const stats = { trees: 0, triangles: 0, meshes: 0 };
  const counts = {};

  const formOf = (species, variant, tier, seed, autumn) => {
    const key = `${species}:${variant}:${tier}:${seed}:${autumn ? 1 : 0}`;
    let g = geometries.get(key);
    if (!g) {
      g = treeForm(species, { variant: ((variant % 3) + 3) % 3, seed, tier, ...venueTreeFormOptions(species, autumn) });
      geometries.set(key, g);
    }
    return g;
  };

  const instanceMaterial = () => {
    if (!white) {
      white = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.95, metalness: 0 });
      white.userData.venueTree = true;
      applyFoliageDetail(white, { puff: true, cards: true }); // W21-A: cards when CROWN_CARDS is on
    }
    return white;
  };

  /** One material per species, autumn flag and value bucket, so a venue holds a handful. */
  const meshMaterial = (species, roll, autumn, lean = 0) => {
    const bucket = Math.min(3, Math.floor(clamp01(roll) * 4));
    // W20: with the variety switch on the hue lean takes three buckets as well (toward yellow, none, toward blue-green).
    const leanBucket = VENUE_TREE_VARIETY ? Math.max(-1, Math.min(1, Math.round(lean * 1.4))) : 0;
    const key = `${species}:${autumn ? 1 : 0}:${bucket}${leanBucket ? `:${leanBucket}` : ''}`;
    let m = materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: venueTreeColour(species, (bucket + 0.5) / 4, autumn, new THREE.Color(), leanBucket * 0.8),
        vertexColors: true, roughness: 0.95, metalness: 0,
      });
      m.userData.venueTree = true;
      applyFoliageDetail(m, { puff: true, cards: true });
      materials.set(key, m);
    }
    return m;
  };

  /**
   * One tree as a named Mesh standing on (x, y, z), `height` metres tall, turned `yaw`. Returns the
   * mesh. `seed` selects the form's own noise, so neighbours of one species are not clones.
   */
  const tree = (parent, {
    species, x = 0, y = 0, z = 0, height = null, variant = null, seed = null, tier = 'backdrop',
    yaw = 0, roll = 0.5, autumn = false, name = null, squash = null, keepSmall = false,
  }) => {
    // Unless the caller names a form, the n-th tree of a species in this venue takes variant n % 3
    // and seed 1 + n / 3, so every tree of a species stands a different form.
    const n = counts[species] = (counts[species] ?? -1) + 1;
    variant = variant ?? n % 3;
    seed = seed ?? 1 + Math.floor(n / 3);
    const g = formOf(species, variant, tier, seed, autumn);
    const natural = g.userData.treeForm.height;
    const h = (height ?? natural) * venueTreeSize(x, z, variant, keepSmall);
    const mesh = new THREE.Mesh(g, meshMaterial(species, roll, autumn, venueTreeLean(x, z, variant)));
    mesh.name = name ?? `venue-form-tree:${species}`;
    mesh.position.set(x, y - 0.04, z);
    mesh.rotation.y = yaw;
    // A tree stood among others is wider one way than the other (crowding, prevailing wind): the
    // crown is stretched along one horizontal axis and squeezed along the other by up to 20% (10% for a cypress), from
    // the site, so neighbours of one species are not the same silhouette from any camera.
    const sq = squash ?? (venueTreeUnit(x, z, variant, 7) - 0.5) * (species === 'cypress' ? 0.18 : 0.40);
    const k = h / natural;
    mesh.scale.set(k * (1 + sq), k, k * (1 - sq));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (crownCardsActive()) mesh.customDepthMaterial = crownCardDepthMaterial(); // W21-A: the shadow reads the card's mask
    mesh.userData.venueFormTree = { species, variant, seed, tier, height: h, triangles: g.userData.treeForm.triangles };
    parent.add(mesh);
    stats.trees += 1;
    stats.triangles += g.userData.treeForm.triangles;
    stats.meshes += 1;
    return mesh;
  };

  /**
   * Many trees as instanced meshes, one per (species, variant, tier, seed, autumn). `items`:
   * { x, y, z, species, height, yaw, variant, seed, tier, roll, autumn }. Returns the meshes.
   * `finish(mesh)` lets the caller apply its own culling and pick conventions.
   */
  const field = (parent, items, name, { finish = null } = {}) => {
    const groups = new Map();
    for (const it of items) {
      const variant = ((it.variant ?? 0) % 3 + 3) % 3;
      const tier = it.tier ?? 'backdrop';
      const seed = it.seed ?? 0;
      const key = `${it.species}:${variant}:${tier}:${seed}:${it.autumn ? 1 : 0}`;
      let list = groups.get(key);
      if (!list) groups.set(key, list = { species: it.species, variant, tier, seed, autumn: !!it.autumn, items: [] });
      list.items.push(it);
    }
    const out = [];
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const e = new THREE.Euler();
    const c = new THREE.Color();
    for (const [key, grp] of [...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const g = formOf(grp.species, grp.variant, grp.tier, grp.seed, grp.autumn);
      const natural = g.userData.treeForm.height;
      const mesh = new THREE.InstancedMesh(g, instanceMaterial(), grp.items.length);
      mesh.name = `${name}:${grp.species}:${grp.variant}${grp.tier === 'hero' ? ':hero' : ''}${grp.seed ? `:s${grp.seed}` : ''}${grp.autumn ? ':autumn' : ''}`;
      for (let i = 0; i < grp.items.length; i += 1) {
        const it = grp.items[i];
        const k = ((it.height ?? natural) / natural) * venueTreeSize(it.x, it.z, grp.variant, it.keepSmall);
        p.set(it.x, it.y - 0.04, it.z);
        e.set(0, it.yaw ?? 0, 0);
        q.setFromEuler(e);
        s.set(k, k, k);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, venueTreeColour(grp.species, it.roll ?? 0.5, grp.autumn, c, venueTreeLean(it.x, it.z, grp.variant)));
        stats.trees += 1;
        stats.triangles += g.userData.treeForm.triangles;
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (crownCardsActive()) mesh.customDepthMaterial = crownCardDepthMaterial(); // W21-A
      mesh.userData.venueFormTrees = { species: grp.species, variant: grp.variant, tier: grp.tier, count: grp.items.length };
      if (finish) finish(mesh);
      parent.add(mesh);
      out.push(mesh);
      stats.meshes += 1;
    }
    return out;
  };

  return { tree, field, formOf, stats };
}
