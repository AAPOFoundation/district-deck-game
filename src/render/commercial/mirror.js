// District Deck V3.70 — the corner shop's SECOND HAND (lane L4).
//
// THE OWNER'S INSTRUCTION: "create a mirror image of each corner shop so its correctly
// positioned on the corners."
//
// WHY A ROTATION CANNOT DO THIS. A corner shop's form is HANDED. The 45 degree splay addresses
// the intersection, the shopfront returns down one street and the dwelling / service side runs
// down the other. Every corner-shop builder in this lane authors the splay at building-local
// (+X, +Z) and the second shopfront on the +X wall — i.e. RIGHT-handed, with the secondary
// street at local +X. Turning that model 90 degrees puts the splay on the correct diagonal and
// the shopfront on the wrong street. Only a reflection produces the other hand.
//
// WHICH HAND A PARCEL NEEDS, and this is the half of the brief that measurement contradicted.
// The brief says a block's four corners "are two mirror-image pairs". The CORNERS are. The four
// MODELS are not, because the hand depends on which of a corner's two streets `frontage()`
// picks as primary, and `frontage()` (mvp/src/core/grid.js) pushes candidates in the order
// south, east, north, west and takes sides[0]. In this coordinate system that push order IS the
// compass cycle: a model facing south has east at its local +X, facing east has north, facing
// north has west, facing west has south. So a corner whose secondary side is the SUCCESSOR of
// its primary in that cycle is right-handed, and only the corner that wraps is left-handed.
// Exhaustively, over the four corner tiles of a block (TILES_PER_BLOCK = 3):
//
//     t(0,0)  north+west   primary north  rot 180  ->  right
//     t(2,0)  east+north   primary east   rot  90  ->  right
//     t(2,2)  south+east   primary south  rot   0  ->  right
//     t(0,2)  south+west   primary south  rot   0  ->  LEFT
//
// Measured on the real generator by `mvp/tests/l4mir-corners.mjs` across seeds 0, 7 and
// 2599919623: 26 corner-shop parcels, 26 on a corner, 22 right and 4 left. So the incumbent
// right-handed-only model addressed the wrong street on 4 of 26, not on half of them.
//
// §3.3 — THIS FILE IS STRICTLY DOWNSTREAM OF THE SIM. `handForParcel` READS `tx`, `tz` and
// `rotation` off a parcel record that `city.js` already stores and writes nothing back. No new
// simulation state, no roll, no cached side-channel: the hand is a pure function of fields the
// parcel has carried since it was frozen.
//
// THE ROUTE, and why it is this one. Mirroring by negative scale on a transform inverts triangle
// winding, and under `FrontSide` culling the whole building renders inside-out — a defect this
// lane has already shipped once (a prism with six of eight triangles wound inward, 35.1 % of it
// backface-culled). A per-instance `material.side` flip is unavailable anyway: `index.js` merges
// by material, so the left hand and the right hand of one subject would share one material and
// one side. So the reflection is applied to the GEOMETRY and the winding is repaired in the same
// pass — index order reversed on an indexed geometry, triangle vertices swapped across every
// attribute on a non-indexed one (this lane has hand-wound solids, `core.js buildTri`), and the
// normal component along the reflection axis negated. The cost is zero triangles and zero
// buckets: it is the same geometry, reflected. Nothing is duplicated and no material is added.
//
// THE ONE THING A REFLECTION GETS WRONG, AND IT IS NOT WINDING. Text is chiral. `reliefLetters`
// (mvp/src/render/signage/index.js) builds real letterforms out of stroke prisms, and
// `shop-corner-modern` carries a MILK BAR run on its frontage. Reflected once, it reads
// backwards. Every such run is therefore reflected a SECOND time, across the vertical plane
// through its own centroid whose normal is the run's principal horizontal axis. Two reflections
// compose to a rotation, so the letters end up upright, in reading order, at the mirrored
// position — and their winding is restored by the second flip rather than by a special case.

import { TILES_PER_BLOCK } from '../../core/grid.js';

/**
 * The subjects whose form is handed. `shoptop-mixed` is deliberately NOT here: it shares
 * `shopGround()` with `shop-corner`, it is not in `city.js`'s `CORNER_ONLY_IDS`, and a shared
 * helper is the one place a change reaches a subject nobody asked about. Gating on this set is
 * what makes "shoptop-mixed is byte-identical" a property of the code rather than of the caller.
 */
export const HANDED_IDS = Object.freeze([
  'shop-corner', 'shop-corner-victorian', 'shop-corner-deco', 'shop-corner-modern',
  'childcare-centre', 'medical-centre', 'petrol-station',
]);

const HANDED = new Set(HANDED_IDS);

/** `grid.js frontage()` push order, which is also the compass cycle in this frame. */
const CYCLE = ['south', 'east', 'north', 'west'];
const SIDE_BY_ROTATION = Object.freeze({ 0: 'south', 90: 'east', 180: 'north', 270: 'west' });

/** Whether this archetype has two hands at all. */
export function isHanded(archetypeId) {
  return HANDED.has(archetypeId);
}

/** Normalise whatever the caller passed. Anything unrecognised is the authored hand. */
export function normaliseHand(hand) {
  return hand === 'left' ? 'left' : 'right';
}

/** Which block sides a tile touches, from its position in the block. */
function sidesOf(tx, tz, tilesPerBlock) {
  const last = tilesPerBlock - 1;
  const out = [];
  if (tz === last) out.push('south');
  if (tx === last) out.push('east');
  if (tz === 0) out.push('north');
  if (tx === 0) out.push('west');
  return out;
}

/**
 * The hand a parcel's corner requires — 'right' (the authored form) or 'left' (its mirror).
 *
 * Read-only. `tx`, `tz` and `rotation` are already on every parcel `city.js` freezes, and a
 * parcel that is not a corner keeps the authored hand rather than being guessed at.
 *
 * @param {{tx?:number, tz?:number, rotation?:number, corner?:boolean}} parcel
 * @returns {'left'|'right'}
 */
export function handForParcel(parcel, tilesPerBlock = TILES_PER_BLOCK) {
  if (!parcel) return 'right';
  const { tx, tz, rotation } = parcel;
  if (!Number.isInteger(tx) || !Number.isInteger(tz)) return 'right';
  const sides = sidesOf(tx, tz, tilesPerBlock);
  if (sides.length < 2) return 'right';
  const primary = SIDE_BY_ROTATION[((rotation % 360) + 360) % 360];
  if (!primary || !sides.includes(primary)) return 'right';
  const secondary = sides.find((s) => s !== primary);
  const successor = CYCLE[(CYCLE.indexOf(primary) + 1) % 4];
  return secondary === successor ? 'right' : 'left';
}

/* ─────────────────────────── the reflection itself ─────────────────────────── */

/** Swap vertices 0 and 2 of every triangle of a non-indexed attribute array, in place. */
function swapTriangles(array, itemSize, count) {
  for (let t = 0; t + 2 < count; t += 3) {
    for (let c = 0; c < itemSize; c += 1) {
      const i0 = t * itemSize + c;
      const i2 = (t + 2) * itemSize + c;
      const tmp = array[i0];
      array[i0] = array[i2];
      array[i2] = tmp;
    }
  }
}

/**
 * Reflect a geometry across the VERTICAL plane through (cx, cz) with horizontal unit normal
 * (nx, nz), and repair the winding the reflection inverted.
 *
 * Positions and normals both take the reflection (for a pure reflection the normal matrix is the
 * matrix itself). The winding repair is the whole point of this function existing: without it the
 * solid is wound inward and `FrontSide` culls it.
 */
export function reflectGeometry(geometry, { nx = 1, nz = 0, cx = 0, cz = 0 } = {}) {
  if (!geometry) return geometry;
  const pos = geometry.getAttribute('position');
  if (!pos) return geometry;
  const len = Math.hypot(nx, nz) || 1;
  const ux = nx / len;
  const uz = nz / len;

  const pa = pos.array;
  for (let i = 0; i < pos.count; i += 1) {
    const j = i * pos.itemSize;
    const d = (pa[j] - cx) * ux + (pa[j + 2] - cz) * uz;
    pa[j] -= 2 * d * ux;
    pa[j + 2] -= 2 * d * uz;
  }
  pos.needsUpdate = true;

  const nrm = geometry.getAttribute('normal');
  if (nrm) {
    const na = nrm.array;
    for (let i = 0; i < nrm.count; i += 1) {
      const j = i * nrm.itemSize;
      const d = na[j] * ux + na[j + 2] * uz;
      na[j] -= 2 * d * ux;
      na[j + 2] -= 2 * d * uz;
    }
    nrm.needsUpdate = true;
  }

  if (geometry.index) {
    // An indexed geometry re-winds by reversing each triangle's index triple. Vertex data is
    // untouched, so `userData.ddRecessVerts` — which is indexed BY VERTEX — stays valid.
    const ia = geometry.index.array;
    for (let i = 0; i + 2 < ia.length; i += 3) {
      const tmp = ia[i];
      ia[i] = ia[i + 2];
      ia[i + 2] = tmp;
    }
    geometry.index.needsUpdate = true;
  } else {
    // A hand-wound solid has no index, so the vertices themselves are permuted — and every
    // per-vertex array has to take the SAME permutation or the attributes desynchronise.
    for (const name of Object.keys(geometry.attributes)) {
      const a = geometry.attributes[name];
      swapTriangles(a.array, a.itemSize, a.count);
      a.needsUpdate = true;
    }
    const per = geometry.userData?.ddRecessVerts;
    if (per && per.length === pos.count) swapTriangles(per, 1, per.length);
  }
  geometry.computeBoundingBox();
  // clone() keeps a sphere built before the move. Raycaster trusts it and can miss every
  // triangle. A null sphere stays null so the first native raycast fills it from the new vertices.
  if (geometry.boundingSphere) geometry.computeBoundingSphere();
  return geometry;
}

/** Every geometry in the model, once each, parts and opening leaves together. */
function collectGeometries(parts, openings) {
  const seen = new Set();
  const out = [];
  const take = (list) => {
    for (const item of list ?? []) {
      const g = item?.geometry;
      if (!g || seen.has(g)) continue;
      seen.add(g);
      out.push(g);
    }
  };
  take(parts);
  for (const o of openings ?? []) take(o?.parts);
  return out;
}

/**
 * The principal horizontal axis of a set of geometries, by the 2x2 covariance of their vertices
 * in plan. For a run of letters this is the reading direction, whatever plane the run sits on —
 * X for a frontage sign, Z for a side-street sign, the chord for a sign on the 45 degree splay.
 */
function principalHorizontalAxis(geometries) {
  let n = 0; let sx = 0; let sz = 0;
  for (const g of geometries) {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i += 1) { sx += p.getX(i); sz += p.getZ(i); n += 1; }
  }
  if (!n) return null;
  const cx = sx / n; const cz = sz / n;
  let a = 0; let b = 0; let c = 0;
  for (const g of geometries) {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i += 1) {
      const dx = p.getX(i) - cx; const dz = p.getZ(i) - cz;
      a += dx * dx; b += dx * dz; c += dz * dz;
    }
  }
  const tr = a + c;
  const det = a * c - b * b;
  const disc = Math.max(0, (tr * tr) / 4 - det);
  const lambda = tr / 2 + Math.sqrt(disc);
  let ex = b; let ez = lambda - a;
  if (Math.hypot(ex, ez) < 1e-9) { ex = lambda - c; ez = b; }
  if (Math.hypot(ex, ez) < 1e-9) { ex = 1; ez = 0; }
  const len = Math.hypot(ex, ez);
  return { cx, cz, ux: ex / len, uz: ez / len };
}

/**
 * Runs of relief lettering, grouped by geometry name. `signage/index.js` names every stroke of a
 * run `${name}-seg`, so one group is one word. If that naming ever changes this returns nothing
 * and the mirrored signs read backwards — `mvp/tests/l4mir-text.mjs` asserts the group is found
 * on `shop-corner-modern` so the failure is loud rather than silent.
 */
function textRuns(parts, openings) {
  const runs = new Map();
  const take = (list) => {
    for (const item of list ?? []) {
      const g = item?.geometry;
      if (!g) continue;
      const name = String(g.name || '');
      if (!name.endsWith('-seg')) continue;
      if (!runs.has(name)) runs.set(name, []);
      runs.get(name).push(g);
    }
  };
  take(parts);
  for (const o of openings ?? []) take(o?.parts);
  return runs;
}

/**
 * Mirror an assembled commercial model into its other hand, in place.
 *
 * Geometry is reflected across the building's own x = 0 plane and re-wound; opening metadata
 * (pivot, pick, hinge sense, slide direction) is reflected with it, because a hinge that keeps
 * its old sense swings the mirrored door into the wall; and every run of relief lettering is
 * reflected a second time about its own axis so the sign still reads.
 *
 * @param {Array<{geometry:any, material:any}>} parts
 * @param {Array<any>} openings
 * @returns {{geometries:number, textRuns:number}}
 */
export function mirrorModelX(parts, openings) {
  const geoms = collectGeometries(parts, openings);
  for (const g of geoms) reflectGeometry(g, { nx: 1, nz: 0, cx: 0, cz: 0 });

  const runs = textRuns(parts, openings);
  for (const group of runs.values()) {
    const axis = principalHorizontalAxis(group);
    if (!axis) continue;
    // Normal of the second plane is the run's own reading direction, so the reflection reverses
    // the run along itself and leaves the face it sits on where the first reflection put it.
    for (const g of group) {
      reflectGeometry(g, { nx: axis.ux, nz: axis.uz, cx: axis.cx, cz: axis.cz });
    }
  }

  for (const o of openings ?? []) {
    if (!o) continue;
    if (o.pivot) o.pivot = { ...o.pivot, x: -o.pivot.x };
    if (o.pick) o.pick = { ...o.pick, cx: -(o.pick.cx ?? 0) };
    // A reflection in X conjugates a rotation about Y into its negative and leaves a rotation
    // about X alone: M R_y(a) M = R_y(-a), M R_x(a) M = R_x(a).
    if (o.axis === 'y' && typeof o.openAngle === 'number') o.openAngle = -o.openAngle;
    if (o.slide?.axis === 'x' && typeof o.slide.distance === 'number') {
      o.slide = { ...o.slide, distance: -o.slide.distance };
    }
  }
  return { geometries: geoms.length, textRuns: runs.size };
}
