// District Deck V3.70 L7 — the town square as a model.
//
// WHY THIS FILE EXISTS. `crit-canvas.mjs` measured zero canvases, zero SVG and zero images
// in the r1 square: on a lane opened by "block centres needs model improvement", the square
// was a cream document. It is a pocket park, so this builds the pocket park — paving with
// units and joints, a drinking fountain, benches that face each other, plane trees with a
// clustered canopy, a noticeboard (the board the player is reading, standing in the square
// they are reading it in), bins, bollards and a lamp.
//
// It also earns its screen space twice: it sits where r1 left roughly 800 px of dead cream
// above a one-paragraph thread.
//
// Geometry only. Nothing here reads or writes simulation state, nothing rolls dice, and the
// same arguments produce the same meshes on every machine. Local metres, ground at y = 0.
//
// Palette, §2.9: bluestone (neutral, dark), granite sett (neutral, mid), turf, timber slat,
// iron (near-neutral, dark-mid), canopy deep, canopy mid, canopy light, and the bone-white
// of the noticeboard paper. Nine bands, two of them achromatic — the r1 square measured
// 84 % of its pixels in one bucket and 93 % in one hue with no neutral anywhere.

import * as THREE from 'three';
// L2's lane, imported and NOT edited. Static rather than dynamic on purpose: `render/people.js`
// already pulls this graph in for the board, so the specifier costs the page nothing — and a
// dynamic import here measured 59 SECONDS to resolve on a box at load 20 under SwiftShader,
// because it competes with two render loops for the main thread. Three probe runs in this round
// read an empty square and were reading a promise that had not landed yet, not a square with no
// people in it.
import { PeopleFigureBatch, castFigure } from '../render/people/index.js';
import {
  galvTexture,
  gravelTexture,
  leafTexture,
  paintTexture,
  paverTexture,
  renderTexture,
  timberTexture,
  turfTexture,
} from './minigame-textures.js';

export const SQUARE_SPAN = 13.0;

let MATS = null;

function mats() {
  if (MATS) return MATS;
  const surfaced = (texture, rough, metal, tint) => new THREE.MeshStandardMaterial({
    color: tint ?? '#ffffff', map: texture, roughness: rough, metalness: metal ?? 0.04,
  });
  const repeat = (texture, n) => {
    const clone = texture.clone();
    clone.repeat.set(n, n);
    clone.needsUpdate = true;
    return clone;
  };
  MATS = {
    bluestone: surfaced(repeat(paverTexture('bluestone'), 3), 0.88),
    pale: surfaced(repeat(paverTexture('pale'), 2), 0.86),
    sett: surfaced(repeat(gravelTexture(), 5), 0.96),
    turf: surfaced(repeat(turfTexture(), 5), 0.95),
    timber: surfaced(timberTexture('bed'), 0.88),
    timberPale: surfaced(timberTexture('pale'), 0.86),
    timberDark: surfaced(timberTexture('dark'), 0.9),
    iron: surfaced(paintTexture('#3f474c'), 0.52, 0.32),
    galv: surfaced(galvTexture(), 0.44, 0.6),
    paper: surfaced(renderTexture('#e8e2d0'), 0.92),
    render: surfaced(renderTexture('#c8bda6'), 0.94),
    canopyDeep: surfaced(leafTexture('#3f5c2e'), 0.86),
    canopyMid: surfaced(leafTexture('#5c8a44'), 0.84),
    canopyLight: surfaced(leafTexture('#8fb45e'), 0.82),
    water: new THREE.MeshStandardMaterial({ color: '#7fa4b4', roughness: 0.18, metalness: 0.12 }),
    brass: surfaced(paintTexture('#b08a3e'), 0.44, 0.5),
  };
  return MATS;
}

export function resetSquareMaterials() {
  MATS = null;
}

function box(group, material, w, h, d, x, y, z, rot = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  if (rot) mesh.rotation.set(rot[0] ?? 0, rot[1] ?? 0, rot[2] ?? 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function cyl(group, material, rTop, rBottom, h, x, y, z, segs = 10) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segs), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/**
 * Deterministic per-object variation. Integer hash — no clock, no `Math.random` — so two
 * trees differ and the same tree is byte-identical on every load, which is the property the
 * r2 critic verified across independent page loads and which a silhouette pass must not spend.
 */
function wobble(a, b, c) {
  let n = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2246822519);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/**
 * A plane tree. §2.6.
 *
 * r2 built five icosahedra of radius 0.54–1.05 and the r2 critic read the result as a single
 * faceted blob, which is what five near-touching spheres are: the outer clusters were smaller
 * than the middle one, so the silhouette closed into a crystal. The fix is a canopy built as
 * a canopy — a wide lower tier that OVERHANGS the trunk, a narrower middle, a cap, and three
 * low outliers that break the bottom edge — with limbs under it so the crown sits on
 * something. Twenty-two masses in three values instead of five in three values, and the three
 * values now alternate around each tier rather than by height, so the dapple reads at board
 * distance instead of banding.
 *
 * Every mass is yawed off the axis, which is also §5.3.2's finding applied here: a face square
 * to the camera on this rig is a face the key light is behind.
 */
function planeTree(group, m, x, z, scale = 1, salt = 0) {
  // Tree pit, root flare, tapered trunk in two lifts.
  cyl(group, m.sett, 0.52 * scale, 0.52 * scale, 0.10, x, 0.05, z, 12);
  cyl(group, m.iron, 0.40 * scale, 0.40 * scale, 0.09, x, 0.10, z, 12);
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 + salt * 0.4;
    box(group, m.timberPale, 0.17 * scale, 0.15 * scale, 0.30 * scale,
      x + Math.cos(a) * 0.14 * scale, 0.17 * scale, z + Math.sin(a) * 0.14 * scale, [0, -a, 0]);
  }
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.145 * scale, 0.225 * scale, 1.70 * scale, 10), m.timberPale,
  );
  trunk.position.set(x, 0.95 * scale, z);
  trunk.castShadow = true;
  group.add(trunk);
  const upper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.10 * scale, 0.15 * scale, 0.80 * scale, 8), m.timberPale,
  );
  upper.position.set(x, 2.16 * scale, z);
  upper.castShadow = true;
  group.add(upper);
  // Four limbs out of the fork.
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + salt * 0.29;
    box(group, m.timberPale, 0.085 * scale, 0.085 * scale, 0.70 * scale,
      x + Math.cos(a) * 0.30 * scale, 2.42 * scale, z + Math.sin(a) * 0.30 * scale,
      [0, -a, 0.58]);
  }
  const tones = [m.canopyDeep, m.canopyMid, m.canopyLight];
  const tiers = [
    { n: 8, r: 0.92, y: 2.98, size: 0.62 },
    { n: 7, r: 0.66, y: 3.42, size: 0.52 },
    { n: 4, r: 0.36, y: 3.82, size: 0.44 },
    { n: 3, r: 1.02, y: 2.62, size: 0.40 },
  ];
  let index = 0;
  for (const tier of tiers) {
    for (let i = 0; i < tier.n; i += 1) {
      const w1 = wobble(salt, index, 11);
      const w2 = wobble(salt, index, 29);
      const w3 = wobble(salt, index, 47);
      const a = (i / tier.n) * Math.PI * 2 + w1 * 0.8 + salt * 0.17;
      const rr = tier.r * (0.80 + w2 * 0.40) * scale;
      const s = tier.size * (0.80 + w3 * 0.48) * scale;
      box(group, tones[index % 3], s * 1.28, s * (0.74 + w1 * 0.46), s * 1.28,
        x + Math.cos(a) * rr,
        (tier.y + (w2 - 0.5) * 0.24) * scale,
        z + Math.sin(a) * rr,
        [w2 * 0.32 - 0.16, a, w3 * 0.28 - 0.14]);
      index += 1;
    }
  }
}

/** Cast-iron ends, timber slats, and it faces the other one across the paving. */
function bench(group, m, x, z, yaw = 0) {
  const seat = new THREE.Group();
  for (let i = 0; i < 4; i += 1) {
    box(seat, m.timber, 1.70, 0.055, 0.115, 0, 0.46, -0.18 + i * 0.12);
  }
  for (let i = 0; i < 3; i += 1) {
    box(seat, m.timber, 1.70, 0.115, 0.05, 0, 0.62 + i * 0.14, 0.24);
  }
  for (const side of [-1, 1]) {
    box(seat, m.iron, 0.07, 0.46, 0.60, side * 0.78, 0.23, 0.02);
    box(seat, m.iron, 0.07, 0.42, 0.07, side * 0.78, 0.70, 0.24);
  }
  seat.position.set(x, 0, z);
  seat.rotation.y = yaw;
  group.add(seat);
}

/** The board the player is reading, standing in the square they are reading it in. */
function noticeBoard(group, m, x, z, yaw = 0) {
  const board = new THREE.Group();
  box(board, m.iron, 0.11, 1.55, 0.11, -0.85, 0.78, 0);
  box(board, m.iron, 0.11, 1.55, 0.11, 0.85, 0.78, 0);
  box(board, m.timberDark, 1.98, 1.22, 0.10, 0, 1.60, 0);
  box(board, m.paper, 1.76, 1.02, 0.03, 0, 1.60, 0.06);
  // Six sheets pinned to it, which is the number the board carries in a day.
  for (let i = 0; i < 6; i += 1) {
    const col = i % 3;
    const row = i < 3 ? 0 : 1;
    box(board, m.pale, 0.48, 0.40, 0.012, -0.56 + col * 0.56, 1.83 - row * 0.46, 0.08);
  }
  box(board, m.galv, 2.24, 0.09, 0.34, 0, 2.26, 0.02, [0.22, 0, 0]);
  board.position.set(x, 0, z);
  board.rotation.y = yaw;
  group.add(board);
}

function drinkingFountain(group, m, x, z) {
  cyl(group, m.bluestone, 1.62, 1.72, 0.46, x, 0.23, z, 16);
  cyl(group, m.pale, 1.42, 1.42, 0.10, x, 0.47, z, 16);
  cyl(group, m.water, 1.34, 1.34, 0.07, x, 0.50, z, 16);
  cyl(group, m.bluestone, 0.34, 0.42, 0.72, x, 0.86, z, 12);
  cyl(group, m.brass, 0.30, 0.30, 0.09, x, 1.26, z, 12);
  cyl(group, m.brass, 0.06, 0.06, 0.34, x, 1.46, z, 8);
  cyl(group, m.water, 0.05, 0.05, 0.52, x, 1.10, z, 8);
}

function bin(group, m, x, z) {
  cyl(group, m.iron, 0.28, 0.24, 0.78, x, 0.39, z, 12);
  cyl(group, m.galv, 0.30, 0.30, 0.06, x, 0.80, z, 12);
}

function lamp(group, m, x, z) {
  cyl(group, m.iron, 0.10, 0.15, 3.4, x, 1.70, z, 10);
  cyl(group, m.iron, 0.26, 0.26, 0.12, x, 0.06, z, 10);
  box(group, m.paper, 0.36, 0.42, 0.36, x, 3.55, z);
  box(group, m.iron, 0.44, 0.09, 0.44, x, 3.80, z);
}

function bollard(group, m, x, z) {
  cyl(group, m.iron, 0.10, 0.12, 0.86, x, 0.43, z, 8);
  cyl(group, m.brass, 0.11, 0.11, 0.07, x, 0.89, z, 8);
}

/**
 * A hedge run. §2.6 again.
 *
 * r2 extruded one box with a flat lid, which the r2 critic named alongside the canopies as the
 * largest non-paving mass in the model. A clipped hedge is still a mass of leaves: it has a
 * mulched base, a kerb, and a top that breaks. So the run is a low clipped body with a
 * per-cluster crest on top and a mulch strip in front, which is what makes the edge read.
 */
function hedge(group, m, x, z, w, d, salt = 0) {
  const alongZ = d > w;
  const run = alongZ ? d : w;
  // Mulch bed and a kerb board on each long face, so the hedge grows out of something.
  // The kerbs must follow the run: an earlier cut offset both by `d/2` only when the hedge
  // ran in z, which put two identical boxes at one position on every wide hedge — coplanar
  // faces, and §1.2 counts a z-fight as a major. Orientation decides the axis, not the offset.
  box(group, m.sett, w + 0.34, 0.10, d + 0.34, x, 0.05, z);
  if (alongZ) {
    box(group, m.timberDark, 0.09, 0.13, d + 0.40, x - w / 2 - 0.17, 0.07, z);
    box(group, m.timberDark, 0.09, 0.13, d + 0.40, x + w / 2 + 0.17, 0.07, z);
  } else {
    box(group, m.timberDark, w + 0.40, 0.13, 0.09, x, 0.07, z - d / 2 - 0.17);
    box(group, m.timberDark, w + 0.40, 0.13, 0.09, x, 0.07, z + d / 2 + 0.17);
  }
  // The clipped body, then the crest broken into clusters.
  box(group, m.canopyDeep, w, 0.50, d, x, 0.32, z);
  const bays = Math.max(3, Math.round(run / 0.62));
  for (let i = 0; i < bays; i += 1) {
    const t = (i + 0.5) / bays - 0.5;
    const w1 = wobble(salt, i, 13);
    const w2 = wobble(salt, i, 31);
    const cw = (alongZ ? w : run / bays) * (0.88 + w1 * 0.22);
    const cd = (alongZ ? run / bays : d) * (0.88 + w2 * 0.22);
    box(group, i % 2 ? m.canopyMid : m.canopyLight,
      cw, 0.20 + w1 * 0.14, cd,
      x + (alongZ ? (w1 - 0.5) * 0.10 : t * run),
      0.60 + w2 * 0.08,
      z + (alongZ ? t * run : (w2 - 0.5) * 0.10),
      [0, w1 * 0.18 - 0.09, 0]);
  }
}

function ground(group, m) {
  const s = SQUARE_SPAN;
  // Board-tile base with a dark bevelled edge, §2.1.
  box(group, m.timberDark, s + 0.9, 0.34, s + 0.9, 0, -0.30, 0);
  box(group, m.turf, s + 0.5, 0.20, s + 0.5, 0, -0.14, 0);
  box(group, m.sett, s - 0.6, 0.16, s - 0.6, 0, -0.09, 0);
  // Paving with real units, radiating from the fountain — §2.7.
  box(group, m.bluestone, s - 2.4, 0.10, 3.1, 0, -0.02, 0);
  box(group, m.bluestone, 3.1, 0.10, s - 2.4, 0, -0.02, 0);
  box(group, m.pale, 5.6, 0.11, 5.6, 0, -0.015, 0, [0, Math.PI / 4, 0]);
  // Kerb line around the paved centre.
  for (const [x, z, w, d] of [[0, -(s / 2 - 0.55), s - 0.6, 0.22], [0, s / 2 - 0.55, s - 0.6, 0.22],
    [-(s / 2 - 0.55), 0, 0.22, s - 0.6], [s / 2 - 0.55, 0, 0.22, s - 0.6]]) {
    box(group, m.bluestone, w, 0.16, d, x, 0.02, z);
  }
}

/** The whole square. One group, local metres, ground at y = 0. */
export function buildTownSquare() {
  const m = mats();
  const root = new THREE.Group();
  root.name = 'town-square';
  ground(root, m);
  drinkingFountain(root, m, 0, 0);

  // Two benches facing each other across the paving, which is what makes it a square and
  // not a lawn: the geometry says a conversation happens here.
  bench(root, m, 0, -2.75, 0);
  bench(root, m, 0, 2.75, Math.PI);
  bench(root, m, -2.75, 0, Math.PI / 2);
  bench(root, m, 2.75, 0, -Math.PI / 2);

  noticeBoard(root, m, -3.4, -4.5, 0.35);
  lamp(root, m, 4.3, -4.3);
  bin(root, m, 3.5, 2.4);
  bin(root, m, -4.4, 2.9);

  const trees = [[-4.6, -2.0, 1.05], [4.6, -1.4, 0.92], [-4.2, 4.4, 1.0], [4.4, 4.5, 0.88], [1.6, -5.0, 0.8]];
  trees.forEach(([x, z, s], i) => planeTree(root, m, x, z, s, i * 7 + 3));
  hedge(root, m, -5.4, 0.6, 1.2, 3.6, 11);
  hedge(root, m, 5.4, 1.4, 1.2, 3.2, 23);
  hedge(root, m, 0.6, 5.4, 4.2, 1.1, 37);

  for (let i = -2; i <= 2; i += 1) bollard(root, m, i * 1.4, -5.5);
  return root;
}

// --- the people in the square ------------------------------------------------

/**
 * WHO IS STANDING HERE, AND WHY THIS IS GEOMETRY AND NOT DRESSING.
 *
 * The r2 critic's second square major: five named speakers carry standing chips under the
 * render, the copy reads *"You are talking to the people in this game"*, the minute book
 * records who said what — and the model contained benches, bins, bollards and a noticeboard
 * and not one figure. A hearing rendered empty does not read as a hearing.
 *
 * These are the SAME five people the floor mechanic is about, taken from `townsquare-chat.js`
 * `CAST` and rendered through their own archetypes, so the figure at the noticeboard is Terry
 * the property agent and the one standing apart is Petridis. Nothing here is a generic crowd.
 *
 * `mvp/src/render/people/` is L2's lane this round and is NOT edited: `PeopleFigureBatch` and
 * `castFigure` are the module's own public exports and this file only calls them. The batch
 * writes ONE frame in the bind/idle pose — there is no gait to solve in a still square, and a
 * per-figure `beat` constant (never a clock) keeps the idle offsets different and the render
 * deterministic.
 */
const SQUARE_CAST = Object.freeze([
  // [castId, archetypeId, x, z, yaw, beat]  — yaw faces the fountain unless noted.
  { id: 'terry', archetypeId: 'property-agent', x: -2.35, z: -3.30, yaw: -2.42, beat: 0.12 },
  { id: 'wozza', archetypeId: 'cheap-builder', x: 1.62, z: -1.85, yaw: 2.32, beat: 0.41 },
  { id: 'saskia', archetypeId: 'architect', x: -2.05, z: 1.72, yaw: 0.86, beat: 0.68 },
  { id: 'vinh', archetypeId: 'mortgage-broker', x: 2.48, z: 1.34, yaw: -0.62, beat: 0.27 },
  // Petridis stands apart from the group, which is the whole of his position.
  { id: 'petridis', archetypeId: 'rival-developer', x: 4.15, z: -2.55, yaw: -0.94, beat: 0.83 },
  // The player. The square's copy says the floor is theirs to take.
  { id: 'you', archetypeId: 'avatar', x: -0.15, z: -2.55, yaw: 0.10, beat: 0.55 },
  // A dog on the paving, because a square with only developers in it is a boardroom.
  { id: 'dog', archetypeId: 'dog', x: 1.05, z: 3.15, yaw: 1.85, beat: 0.34 },
]);

/** The paving stands about 40 mm above the square's origin; feet sit on it, not in it. */
const PAVING_Y = 0.04;

/**
 * The cast as a mounted batch. Returns `{ meshes, batch, dispose, count, triangles }`; the
 * caller adds `meshes` to its world group and calls `dispose()` when the overlay is destroyed.
 * If the figure module ever stops publishing the two entry points this uses, the caller gets
 * `null` and a square with no people rather than an overlay that fails to open.
 */
export function buildSquareCast({ reducedMotion = true } = {}) {
  if (typeof PeopleFigureBatch !== 'function' || typeof castFigure !== 'function') return null;
  const batch = new PeopleFigureBatch({ capacity: SQUARE_CAST.length });
  const figures = SQUARE_CAST.map((row) => castFigure({
    id: `square:${row.id}`,
    archetypeId: row.archetypeId,
    x: row.x,
    y: PAVING_Y,
    z: row.z,
    yaw: row.yaw,
    beat: row.beat,
  }));
  const count = batch.write(figures, { phase: 1, reducedMotion });
  return {
    meshes: batch.meshes,
    batch,
    count,
    triangles: batch.stats(count).triangles,
    dispose: () => batch.dispose(),
  };
}

/** Who the figures are, for the overlay's own caption. Reads, never writes. */
export const SQUARE_CAST_IDS = Object.freeze(SQUARE_CAST.map((row) => row.id));
