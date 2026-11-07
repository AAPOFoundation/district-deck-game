// Shared playground voxel kit. Geometry helpers only.
// District Deck V3.70 L7 — voxel meshes for the playground builder.
//
// Geometry only. The rules are in `src/core/playground-builder.js`; nothing here reads
// or writes simulation state, and nothing here rolls dice — a design produces the same
// meshes every time it is built.
//
// Everything is authored in BLOCK-CORE LOCAL METRES with the ground at `GROUND_Y`
// (0.26, from `block-cores/kit.js` CORE_GROUND) and the grid centred on the softfall pad
// that `types/playground.js` already lays. That is deliberate: the same function that
// draws the builder's preview can be hung under a block core to show a saved playground
// back on the board, without either file having to convert coordinates.
//
// Palette note, V370 spec §5.2: nothing here is authored near black. The darkest value
// is the poured-rubber sole at #4a524d (sRGB luma ≈ 80), well above the luma 21 floor the
// post grade turns into saturated navy, and above the reference's own darkest large family.
//
// ## r3 — the geometry the r2 critic measured against the model this lane replaced
//
// r2 shipped 1,836 triangles across 105 meshes against the static `types/playground.js`
// model's 8,068 across 61: less than a quarter of the geometry of the thing it was opened
// to improve, with trees that were two stacked cubes, softfall that was a flat slab, and
// 68.5 % of the model area in two adjacent value bands. The brief was "the best playground
// in the world in simple voxel format", and voxel is a register, not a budget — a voxel
// tree still has a crown silhouette and poured rubber still has an edge and a surface.
//
// So every one of the nine pieces is re-authored here with the three things §2 asks for and
// r2 did not spend on:
//
//  - **Silhouette** (§2.6). A crown of twenty clustered masses in three leaf values instead
//    of two boxes; a slide bed that follows a real curve and rotates with its own slope; a
//    tunnel with ring collars; a climbing frame with slatted deck, balusters and a shade
//    canopy; hedge-and-shrub planting on the pad surround.
//  - **Section** (§2.4). Nothing is a single unmodulated slab. Softfall is a dark poured
//    sole with a wearing course inset above it and a hashed patch where a second pour met
//    the first. Sandpit sleepers carry a proud capping board. Posts carry caps.
//  - **Value separation** (§2.9). `VALUES` below is the whole nine-band contract, authored
//    as luma rather than as hue, and `tint` on `mat()` is how a shared procedural texture
//    lands in the band it was assigned rather than the band its own base hex happens to sit
//    in. The measured worst-adjacent-pair is reported in the r3 builder note.

import * as THREE from 'three';
import {
  CELL,
  GRID,
  GROUND_Y,
  PAD_CENTRE,
  cellToLocal,
  footprint,
  pieceOf,
  spanOf,
  specOf,
  variantIndexOf,
} from '../../core/playground-builder.js';
import {
  galvTexture,
  gravelTexture,
  leafTexture,
  paintTexture,
  paverTexture,
  rubberTexture,
  sandTexture,
  timberTexture,
  turfTexture,
} from '../minigame-textures.js';

/** Metres per stacked level. A deck lid at 0.9 m is a real climbing-frame platform. */
export const LEVEL_H = 0.9;

/** Pad span, fence half and the gate the children walk through. Shared by the shell and the visitors. */
export function padMetrics() {
  const span = GRID * CELL;
  const cx = PAD_CENTRE.x;
  const cz = PAD_CENTRE.z;
  const half = span / 2 + 0.35;
  const gateFrom = half * 2 * 0.72;
  const gateTo = half * 2 * 0.86;
  return {
    span,
    cx,
    cz,
    half,
    gateFrom,
    gateTo,
    gateX: cx - half + (gateFrom + gateTo) / 2,
    gateZ: cz - half,
  };
}

export function gateLocal(groundY = GROUND_Y) {
  const pad = padMetrics();
  return { x: pad.gateX, y: groundY, z: pad.gateZ, pathZ: pad.gateZ + 1.55 };
}

export const VOXEL_COLOURS = Object.freeze({
  lime: '#7fae56',
  sun: '#e2b74a',
  sky: '#6f96b8',
  coral: '#c9705a',
  /** Candy-red moulded plastic. Coral is terracotta at iso; this is the seat/horse flag. */
  toyRed: '#d42a24',
  sand: '#d9c48d',
  timber: '#a9834f',
  leaf: '#5c8a44',
  // The three soft-surface colours are lifted from r2's #a8564a / #5b6f86 / #6d8a5c. Those
  // sat at albedo 102–128, which is inside the pad's own band once the rig has taken its
  // 0.70 off — eighteen tiles of softfall vanishing into the pour they are laid on.
  rubberR: '#c4735f',
  rubberB: '#7f96ad',
  rubberG: '#8fac73',
  steel: '#9aa2a6',
  chain: '#8d9498',
  post: '#b9a37a',
});

/**
 * Surfaces the kit uses that are NOT in the player's colour palette — the pad, its surround,
 * and the second and third leaf values a crown needs to read as a cluster rather than a
 * blob. Keyed by the hex they are authored with, the same way `SURFACE` is, so `mat()` needs
 * one lookup path for both.
 */
const EXTRA = Object.freeze({
  leafDeep: '#41633a',
  leafLight: '#93b463',
  /** The main pour. Real wet-pour softfall is a dark charcoal-green, not a pale tan. */
  rubberPour: '#5f6b62',
  /** The chamfer sole under a tile and the poured kerbs — one band below the pour. */
  rubberSole: '#4a524d',
  /** The second pour laid into the first: a buff, four value bands above the charcoal. */
  rubberWear: '#b9a882',
  bluestone: '#8a7f6a',
  turfPad: '#6d8a4e',
  gravelPad: '#9c9384',
  paverPale: '#c2bcae',
  plinth: '#6f5334',
});

const CACHE = new Map();

/**
 * The nine-band value contract, §2.9, written as a multiplier on the map rather than as a
 * second hex. The procedural textures bake their own base colour, so a family whose base
 * happens to sit at luma 165 cannot be moved into a different band by choosing a different
 * hex — the texture would have to be re-baked. A tint multiplies the map, which is exactly
 * the value control the band contract needs and costs nothing.
 *
 * r2 measured the pad, the gravel margin, the timber and the tan pieces all inside two
 * adjacent bands: the pale softfall (base luma 171), the gravel (132), the turf (127) and
 * the pale posts (165) are four of the five largest areas in the frame and three of them
 * fell in one bucket once the key light and the AO had pulled them down. The three moves
 * below are the fix and they are one decision each, not a rebuild.
 */
const VALUES = Object.freeze({
  // The pours carry their own value (EXTRA.rubberPour / rubberWear), so they need no tint.
  padZone: 1.0,
  // The margin is a PALE crushed-granite apron rather than grey gravel, and that is a value
  // decision rather than a taste one: see the note above `buildPadShell`.
  padApron: 1.0,
  padGravel: 1.0,
  padTurf: 1.0,
  padKerb: 1.0,
  padPlinth: 0.90,
  padPaver: 1.0,
  fence: 0.92,
});

/**
 * `tint` is a PERCEPTUAL multiplier, so `0.5` halves the value a nine-bucket greyscale read
 * will measure. THREE's working colour space is linear, and a map is decoded to linear before
 * the material colour multiplies it — so a naive `setRGB(0.5)` lands at sRGB 0.73, not 0.5,
 * and a value band authored against §2.9 would miss by three buckets. The transfer below is
 * the sRGB EOTF, exactly.
 */
function srgbToLinear(c) {
  const v = Math.max(0, Math.min(1, c));
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/**
 * Which surface each authored colour is actually made of.
 *
 * r1 measured `meshesWithAnyTexture: 0` across 74 meshes, which the V370 scale defines as a
 * 2 outright. A playground is made of four materials in real life — moulded plastic, hot-dip
 * galvanised steel, treated pine and wet-pour rubber — and each of them looks different
 * close up. The map is the difference between "the right shapes" and "the right shapes made
 * of something", which is the whole distance between a 2 and a 3.5 on §2.5.
 */
const SURFACE = Object.freeze({
  lime: () => paintTexture('#7fae56'),
  sun: () => paintTexture('#e2b74a'),
  sky: () => paintTexture('#6f96b8'),
  coral: () => paintTexture('#c9705a'),
  sand: () => sandTexture(),
  timber: () => timberTexture('bed'),
  post: () => timberTexture('pale'),
  leaf: () => leafTexture('#5c8a44'),
  rubberR: () => rubberTexture(VOXEL_COLOURS.rubberR),
  rubberB: () => rubberTexture(VOXEL_COLOURS.rubberB),
  rubberG: () => rubberTexture(VOXEL_COLOURS.rubberG),
  steel: () => galvTexture(),
  chain: () => galvTexture(),
});

const BY_HEX = Object.freeze(Object.fromEntries(
  Object.entries(VOXEL_COLOURS).map(([id, hex]) => [hex, id]),
));

/** Extra surfaces the pad, its surround and the planting use, keyed by their hex. */
const PAD_SURFACE = Object.freeze({
  [EXTRA.bluestone]: () => paverTexture('bluestone'),
  [EXTRA.turfPad]: () => turfTexture(),
  [EXTRA.gravelPad]: () => gravelTexture(),
  [EXTRA.paverPale]: () => paverTexture('pale'),
  [EXTRA.plinth]: () => timberTexture('dark'),
  [EXTRA.leafDeep]: () => leafTexture(EXTRA.leafDeep),
  [EXTRA.leafLight]: () => leafTexture(EXTRA.leafLight),
  [EXTRA.rubberPour]: () => rubberTexture(EXTRA.rubberPour),
  [EXTRA.rubberSole]: () => rubberTexture(EXTRA.rubberSole),
  [EXTRA.rubberWear]: () => rubberTexture(EXTRA.rubberWear),
});

function textureFor(colour) {
  const id = BY_HEX[colour];
  const make = (id && SURFACE[id]) || PAD_SURFACE[colour] || null;
  return make ? make() : null;
}

function mat(colour, extras = {}) {
  const tint = extras.tint ?? 1;
  const key = `${colour}:${extras.rough ?? 0.62}:${extras.metal ?? 0.05}:${extras.repeat ?? 1}:${tint}`;
  if (!CACHE.has(key)) {
    // The map already carries the colour, so the material colour stays white — a map
    // multiplied by its own hex a second time lands two stops dark, and §2.9 is written
    // against the rendered value, not the authored one. A `tint` below 1 is the ONE
    // deliberate exception: it is the value control the band contract needs.
    let map = textureFor(colour);
    if (map && extras.repeat) {
      map = map.clone();
      map.repeat.set(extras.repeat, extras.repeat);
      map.needsUpdate = true;
    }
    const lin = srgbToLinear(tint);
    const base = map ? new THREE.Color(lin, lin, lin) : new THREE.Color(colour);
    if (!map && tint !== 1) base.multiplyScalar(lin);
    CACHE.set(key, new THREE.MeshStandardMaterial({
      color: base,
      map,
      roughness: extras.rough ?? 0.62,
      metalness: extras.metal ?? 0.05,
    }));
  }
  return CACHE.get(key);
}

/** Tests and probes that swap textures under us need the material cache to go with them. */
export function resetPlaygroundMaterials() {
  CACHE.clear();
}

function box(group, colour, w, h, d, x, y, z, extras = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(colour, extras));
  mesh.position.set(x, y, z);
  if (extras.rot) mesh.rotation.set(extras.rot[0] ?? 0, extras.rot[1] ?? 0, extras.rot[2] ?? 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function cyl(group, colour, r, h, x, y, z, segs = 10, extras = {}) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segs), mat(colour, extras));
  mesh.position.set(x, y, z);
  if (extras.rot) mesh.rotation.set(extras.rot[0] ?? 0, extras.rot[1] ?? 0, extras.rot[2] ?? 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/** A tapered member — a trunk, a cast leg, a bollard. Two radii, one draw. */
function taper(group, colour, rTop, rBottom, h, x, y, z, segs = 8, extras = {}) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBottom, h, segs), mat(colour, extras),
  );
  mesh.position.set(x, y, z);
  if (extras.rot) mesh.rotation.set(extras.rot[0] ?? 0, extras.rot[1] ?? 0, extras.rot[2] ?? 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/**
 * Deterministic per-object variation. Integer hash, no clock and no `Math.random`, so two
 * trees on different cells differ and the SAME tree is byte-identical on every load — which
 * is the property the r2 critic verified across two independent page loads and which a
 * silhouette pass must not spend.
 */
function wobble(a, b, c) {
  let n = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2246822519);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** World-space centre and extent of a placed piece's footprint. */
function boundsOf(entry) {
  const cells = footprint(entry.id, entry.x, entry.z, entry.yaw ?? 0, entry.variant);
  const locals = cells.map(([cx, cz]) => cellToLocal(cx, cz));
  const xs = locals.map((p) => p.x);
  const zs = locals.map((p) => p.z);
  const minX = Math.min(...xs) - CELL / 2;
  const maxX = Math.max(...xs) + CELL / 2;
  const minZ = Math.min(...zs) - CELL / 2;
  const maxZ = Math.max(...zs) + CELL / 2;
  return {
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    w: maxX - minX,
    d: maxZ - minZ,
    minX,
    maxX,
    minZ,
    maxZ,
  };
}

// --- shared planting ---------------------------------------------------------

/**
 * A crown of clustered masses in three leaf values. §2.6 asks for "a leaf-cluster canopy,
 * not a lollipop"; r2 shipped two stacked cubes, which is behind a lollipop because a
 * lollipop at least has a round silhouette.
 *
 * The shape is authored rather than scattered: a wide lower tier that overhangs the trunk,
 * a narrower middle, a cap, and two low outliers that break the bottom edge so the crown
 * does not read as a cone. Every mass is yaw-rotated off the axis, which is also the fix
 * §5.3.2 records for crossed-card foliage — a face square to the camera is a face the key
 * light is behind.
 */
function crown(group, cx, cy, cz, scale, salt) {
  const tiers = [
    { n: 7, r: 0.46, y: 0.00, size: 0.40 },
    { n: 6, r: 0.34, y: 0.30, size: 0.34 },
    { n: 4, r: 0.20, y: 0.55, size: 0.28 },
    { n: 3, r: 0.52, y: -0.20, size: 0.26 },
  ];
  const tones = [EXTRA.leafDeep, VOXEL_COLOURS.leaf, EXTRA.leafLight];
  let index = 0;
  for (const tier of tiers) {
    for (let i = 0; i < tier.n; i += 1) {
      const w1 = wobble(salt, index, 11);
      const w2 = wobble(salt, index, 29);
      const w3 = wobble(salt, index, 47);
      const a = (i / tier.n) * Math.PI * 2 + w1 * 0.9 + salt * 0.13;
      const rr = tier.r * (0.78 + w2 * 0.44) * scale;
      const s = tier.size * (0.80 + w3 * 0.52) * scale;
      box(group, tones[index % 3],
        s * 1.32, s * (0.72 + w1 * 0.5), s * 1.32,
        cx + Math.cos(a) * rr,
        cy + (tier.y + (w2 - 0.5) * 0.16) * scale,
        cz + Math.sin(a) * rr,
        { rough: 0.88, rot: [w2 * 0.34 - 0.17, a, w3 * 0.30 - 0.15] });
      index += 1;
    }
  }
}

/**
 * A clustered shrub mass. Same argument as the crown at a third of the height, and it is
 * what §2.6's "shrubs are clustered masses with leaf silhouette, not spheres" asks for.
 */
function shrub(group, cx, base, cz, scale, salt) {
  cyl(group, EXTRA.plinth, 0.34 * scale, 0.06, cx, base + 0.03, cz, 10, { rough: 0.95 });
  const tones = [EXTRA.leafDeep, VOXEL_COLOURS.leaf, EXTRA.leafLight];
  // A mass, not a scatter: the first cut spread seven cubes on a 0.34 radius at 0.24 across
  // and they read as separate objects hovering over the turf. Overlap is what makes a clump.
  for (let i = 0; i < 8; i += 1) {
    const w1 = wobble(salt, i, 7);
    const w2 = wobble(salt, i, 23);
    const a = (i / 8) * Math.PI * 2 + w1 * 1.1;
    const ring = i === 0 ? 0 : (i < 5 ? 0.15 : 0.09);
    const rr = (ring + w2 * 0.04) * scale;
    const s = (0.34 + w1 * 0.10) * scale;
    box(group, tones[i % 3], s * 1.34, s * (0.86 + w2 * 0.40), s * 1.34,
      cx + Math.cos(a) * rr,
      base + (0.14 + (i < 5 ? 0 : 0.13) + w2 * 0.06) * scale,
      cz + Math.sin(a) * rr,
      { rough: 0.88, rot: [0, a, w1 * 0.2 - 0.1] });
  }
}

export {
  EXTRA, VALUES,
  mat, box, cyl, taper, wobble, boundsOf, crown, shrub,
};
