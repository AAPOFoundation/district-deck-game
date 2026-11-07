// District Deck: the land edge (taste-r1 wave 78, port and farm plan, phase L1). One signed distance from the city's land out into the
// farmland, one precinct weight, a baked field of both read by the coast spine's own sampling rule, and a debug overlay.
//
// NO READER IS SWITCHED. Nothing in the picture, the ground, the fringe or the game logic reads this module in this phase. `LAND_EDGE`
// (`?landEdge=1`, node `DD_LAND_EDGE=1`) needs `COAST_SPINE` and only lets `WaterSurface` build the debug overlay when `?landEdgeDebug=1`
// (`DD_LAND_EDGE_DEBUG=1`) is also given; with it off, no field is baked and no texture is made. `?landEdgeRound=1` (`DD_LAND_EDGE_ROUND=1`)
// draws the overlay with rounded corners (the sheet's square-against-round comparison); the default is Chebyshev corners.
//
// The land is the board rectangle [0, ex] x [0, ez] plus the venue precincts. `landEdgeAt` is the exact union's signed distance (negative
// inside, metres); `boardEdgeAt` is the board alone, which is `out` as the 22 spellings in edge-massing.js, fringe.js, fringe/coast-rim.js and
// outer-ocean.js write it. `precinctWeight` is a smooth union of the board and every precinct: the members' signed distances go through a polynomial soft
// minimum (`PRECINCT_BAND.k` m, C1, exactly `min` where two members differ by more than k) and then 1 - smoothstep over `PRECINCT_BAND.width` m centred on the edge, so the weight is 0.5 on the edge,
// 0 farther than half a band out and 1 farther than half a band in. A precinct's id is a CPU lookup (`precinctIdAt`), never per fragment.
//
// Precincts: the seats of `PRECINCT_SEAT_IDS` as discs of the seat's radius, and a 96-bearing edge table where one exists (Rod Laver's
// `JOIN_TABLE`, `fringe/events/rod-laver.js:1120`, read by `fringe/venue-ground.js:226,252-261` as `uVjTable`), which replaces its disc.
// The table is in the venue's local frame (bearing a = atan2(x, z) of the local point, radius by linear interpolation between the 96 entries,
// the shader's own `venueEdgeR`); `harvestPrecinctTables` reads it and the frame off the mesh that carries it.
//
// The quay: on the port stretch the land edge yields to the quay, so `quayMaskAt` is 1 inside the quay's frame (from the board rim to the
// cope, along the terminal's span) and 0 elsewhere. It does not alter `landEdgeAt`; a reader (phase L2) multiplies by (1 - mask).
//
// The bake: 800 m x 800 m at 1 m, float16, two layers (d clamped to +-64 m, the weight), laid out as the spine's field so that its
// `sampleHalfField` (exported for this) and `ddCoastSpineD` (`COAST_SPINE_GLSL`) read both unchanged. The analytic JS here is the tests' oracle.
import * as THREE from 'three';
import { fringeRolesOf, harbourAlongSign } from '../core/fringe-venues.js';
import { edgeAxes, shorePoint, alongLength } from './shore.js';
import { QUAY_SEAWARD, COPE_Z } from './fringe/ships.js';
import { ringSeatsFromCity } from './edge-massing.js';
import { COAST_SPINE, COAST_SPINE_GLSL, floatToHalf, sampleHalfField } from './coast-spine.js';

const ENV = (typeof process !== 'undefined' && process?.env) ? process.env : {};
const QS = (typeof location !== 'undefined' && location?.search) ? new URLSearchParams(location.search) : null;
const flag = (envKey, qsKey) => (ENV[envKey] !== undefined ? Number(ENV[envKey]) > 0 : !!(QS && QS.get(qsKey) === '1'));
// taste-r1 W79 close: the spine's switch read here as coast-spine.js reads it, not from `COAST_SPINE` at load, since edge-massing.js imports this
// file and coast-spine.js imports edge-massing.js (a module that loads coast-spine.js first met `COAST_SPINE` before its initialisation).
const SPINE_ON = ENV.DD_COAST_SPINE !== undefined ? Number(ENV.DD_COAST_SPINE) > 0 : !!(QS && QS.get('coastSpine') === '1');
const LAND_ON = SPINE_ON && flag('DD_LAND_EDGE', 'landEdge');

/** The switch (default OFF; it needs `COAST_SPINE`), the debug overlay and the rounded-corner variant of the overlay. */
// taste-r1 W79 (L2): the readers. `?landEdgeReaders=tray,sheet,venue,farm` (node `DD_LAND_EDGE_READERS`; default all four) names the ones that read the land edge
// once `LAND_EDGE` is on; `?landEdgePlateau=1` / `?landEdgeHump=1` (node `DD_LAND_EDGE_PLATEAU`, `DD_LAND_EDGE_HUMP`) take the 0.44 m plateau step and the hump out
// (0 keeps both, the default under the switch).
const READERS_RAW = String(ENV.DD_LAND_EDGE_READERS !== undefined ? ENV.DD_LAND_EDGE_READERS : (QS && QS.get('landEdgeReaders')) || 'tray,sheet,venue,farm').split(',');
const readerOn = (name) => (LAND_ON && READERS_RAW.includes(name) ? 1 : 0);
export const LAND_EDGE = Object.freeze({
  on: LAND_ON ? 1 : 0,
  debug: LAND_ON && flag('DD_LAND_EDGE_DEBUG', 'landEdgeDebug') ? 1 : 0,
  round: LAND_ON && flag('DD_LAND_EDGE_ROUND', 'landEdgeRound') ? 1 : 0,
  readers: Object.freeze({ tray: readerOn('tray'), sheet: readerOn('sheet'), venue: readerOn('venue'), farm: readerOn('farm') }),
  plateau: LAND_ON && flag('DD_LAND_EDGE_PLATEAU', 'landEdgePlateau') ? 1 : 0,
  hump: LAND_ON && flag('DD_LAND_EDGE_HUMP', 'landEdgeHump') ? 1 : 0,
});

/**
 * W85 (apron west): the venues' reach. Under the venue reader each venue's footprint (the Box3 of its group, harvested with the lawn) grown by `m` metres, with corners of
 * radius `corner * m`, joins the soft union as a member, so the mown apron stands `m` m past the airport, the station, the Rod Laver and the Grand Prix on whatever side they
 * sit and on any seed. `?landEdgeVenueReach=<m>` (node `DD_LAND_EDGE_VENUE_REACH`) sets `m`, bounded to [0, 120] (the 800 m field holds every member up to 120); 0 takes the reach out
 * (the W79 apron and lawns alone). Always 0 with the switch or the venue reader off.
 */
const REACH_RAW = ENV.DD_LAND_EDGE_VENUE_REACH !== undefined ? ENV.DD_LAND_EDGE_VENUE_REACH : (QS && QS.get('landEdgeVenueReach'));
const REACH_NUM = REACH_RAW === null || REACH_RAW === undefined || REACH_RAW === '' ? NaN : Number(REACH_RAW);
export const VENUE_REACH = Object.freeze({
  max: 120,
  default: 60,
  corner: 0.5,
  m: readerOn('venue') ? Math.min(120, Math.max(0, Number.isFinite(REACH_NUM) ? REACH_NUM : 60)) : 0,
});

/** The overlay's iso-lines, metres out: the board's edge, the crust's inner ring, the land ramp, the end of the tray band's blend. */
export const LAND_EDGE_ISO = Object.freeze([0, 2.6, 14, 24.5]);
/** The precinct weight: the soft minimum's width `k` (polynomial, exact `min` where two members differ by more than `k`; the iso-line moves at most k/4 = 0.1 m along the gradient where two edges meet, up to 0.3 m across a steep crossing) and the band's width, metres. The weight is 0.5 on the edge, 0 at +width/2, 1 at -width/2. */
export const PRECINCT_BAND = Object.freeze({ width: 12, k: 0.4 });
/**
 * W79 fix 4 (L2), the city's mown apron: under the venue reader the turf weight is the soft union of a band along the board's land edge (the board offset `width` m outward, always
 * round at its corners, off where the quay holds) and the drawn lawns. `width` 93 m makes the band's weight integral equal today's two rectangles' (63,062 m2 within 300 m of the board, dry
 * land, seed 0; 62,900 m2 at 93 m; `W/land-readers-fix-4/p/area.mjs`). Its 0.5 line sits `width` m out, the weight 1 inside width - 6 and 0 beyond width + 6.
 */
export const APRON = Object.freeze({ width: 93 });
/** The baked field: side in metres (800 x 800 texels at 1 m), and the clamp of d in metres (float16 steps are 0.031 m in [32, 64)). */
export const LAND_EDGE_FIELD = Object.freeze({ size: 800, texel: 1, clamp: 64 });
/** The seats that are venue precincts (the corner hubs and the edge gates are landform seats, not city land). */
export const PRECINCT_SEAT_IDS = Object.freeze(['rod-laver', 'grand-prix', 'southern-cross', 'tullamarine', 'falls-creek']);
/** The quay frame's constants as `fringe/port.js` states them (QUAY_ALONG_K :145, the container berth's alongK :84, the terminal's CX - 94 .. CX + 108 :12497-12498). */
export const LAND_EDGE_QUAY = Object.freeze({ alongK: 0.28, containerAlongK: 0.14, x0: -94, x1: 108 });

const TAU = Math.PI * 2;
const ss01 = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/* ───────────────────────── the model (analytic) ───────────────────────── */

/** The quay's frame for a city: origin and yaw as `edgeFrame` gives, the terminal's local span, and the back (board rim) and cope in local z. Null with no port. */
export function quayFrameOf(city) {
  const roles = fringeRolesOf(city);
  const edge = roles?.yarraEdge;
  if (!edge) return null;
  const extent = city.extent;
  const L = alongLength(edge, extent);
  const sign = harbourAlongSign(roles);
  const sea = edgeAxes(edge).seaward;
  const o = shorePoint(edge, extent, QUAY_SEAWARD, sign * L * LAND_EDGE_QUAY.alongK);
  const las = edge === 'south' || edge === 'west' ? 1 : -1;
  const CX = las * sign * (LAND_EDGE_QUAY.containerAlongK - LAND_EDGE_QUAY.alongK) * L;
  return { edge, x: o.x, z: o.z, yaw: Math.atan2(sea.x, sea.z), lx0: CX + LAND_EDGE_QUAY.x0, lx1: CX + LAND_EDGE_QUAY.x1, lzBack: -QUAY_SEAWARD, lzCope: COPE_Z };
}

/** The precinct table's radius at local bearing a (radians, a = atan2(x, z)): the shader's `venueEdgeR`. */
export function tableRadius(table, a, smooth = false) {
  const n = table.length;
  const f = a / TAU; const u = (f - Math.floor(f)) * n;
  const i0 = Math.floor(u);
  const k0 = i0 % n; const k1 = (i0 + 1) % n;
  const t = u - i0;
  // W79 fix 3 (L2): a dense outline (a harvested lawn, OUTLINE_NODES entries) is always linear between its nodes, so a lawn's corners are not rounded off or overshot; the smooth read is for the 96-node table.
  if (!smooth || n > 96) return table[k0] + (table[k1] - table[k0]) * t;
  // W79 (L2): Catmull-Rom through the same 96 nodes. The linear table has a crease at every node, and the 1 m bake's bilinear read of the weight
  // across a crease sat 0.27 m off the edge (L1, 0.031 in weight at Rod Laver); a C1 edge has none. Differs from the linear edge by at most |second difference| / 8.
  const km = (i0 + n - 1) % n; const kp = (i0 + 2) % n;
  const p0 = table[km]; const p1 = table[k0]; const p2 = table[k1]; const p3 = table[kp];
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}

function makePrecinct(id, x, z, radius, table = null, yaw = 0, smooth = false) {
  let rmax = radius;
  if (table) { rmax = 0; for (let k = 0; k < table.length; k += 1) rmax = Math.max(rmax, table[k]); if (smooth && table.length <= 96) rmax *= 1.03; }
  return { id, x, z, radius, table, yaw, cos: Math.cos(yaw), sin: Math.sin(yaw), rmax, smooth };
}

/** A precinct's signed distance (negative inside): the radial excess over its edge radius at that bearing. */
export function precinctDist(P, x, z) {
  const dx = x - P.x; const dz = z - P.z;
  const r = Math.hypot(dx, dz);
  if (!P.table) return r - P.radius;
  const lx = dx * P.cos - dz * P.sin; const lz = dx * P.sin + dz * P.cos;
  return r - tableRadius(P.table, Math.atan2(lx, lz), P.smooth);
}

/**
 * The model for a city. `seats` default to `ringSeatsFromCity(city)`; `tables` is a list of { id, x, z, yaw, table } (Rod Laver's, harvested from the
 * page) that replace the discs of the same id; `round` selects Euclidean corners (default Chebyshev).
 */
export function buildLandEdgeModel(city, { seats = null, tables = [], round = false, smooth = false, apron = LAND_EDGE.readers.venue ? APRON.width : 0, reach = VENUE_REACH.m } = {}) {
  const extent = city.extent;
  const list = seats ?? ringSeatsFromCity(city);
  const precincts = [];
  const boxes = [];
  for (const s of list) {
    if (s.kind !== 'land' || !PRECINCT_SEAT_IDS.includes(s.id)) continue;
    const t = tables.find((q) => q.id === s.id);
    precincts.push(t ? makePrecinct(s.id, t.x, t.z, t.radius ?? s.radius, Float64Array.from(t.table), t.yaw, smooth) : makePrecinct(s.id, s.x, s.z, s.radius));
    // W85: a harvested venue brings its footprint; a venue the page has not drawn (no scene, Falls Creek) has none and keeps its disc alone
    if (t?.foot && reach > 0) boxes.push(makeReachBox(s.id, t.foot, reach));
  }
  const model = { extent: { x: extent.x, z: extent.z }, round: !!round, precincts, quay: quayFrameOf(city), band: PRECINCT_BAND, apron };
  if (boxes.length) model.reach = { m: reach, corner: VENUE_REACH.corner, boxes };
  return model;
}

/** W85: a venue's reach member, its footprint { x0, x1, z0, z1 } grown by `m`: the centre, the half extents of the box inside the rounded corners, and the corner radius. */
function makeReachBox(id, foot, m) {
  const c = VENUE_REACH.corner * m;
  return { id, x: (foot.x0 + foot.x1) / 2, z: (foot.z0 + foot.z1) / 2, hx: (foot.x1 - foot.x0) / 2 + m - c, hz: (foot.z1 - foot.z0) / 2 + m - c, c, foot: { x0: foot.x0, x1: foot.x1, z0: foot.z0, z1: foot.z1 } };
}

/** W85: a reach member's signed distance (negative inside): the rounded box of the grown footprint. */
export function reachDist(B, x, z) {
  const qx = Math.abs(x - B.x) - B.hx; const qz = Math.abs(z - B.z) - B.hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - B.c;
}

/** The board alone, signed (negative inside): `Math.max(-z, z - ez, -x, x - ex)` with Chebyshev corners, the Euclidean distance at the corners with `round`. */
export function boardEdgeAt(x, z, model = ACTIVE) {
  const e = model.extent;
  const dx = Math.max(-x, x - e.x); const dz = Math.max(-z, z - e.z);
  if (model.round && dx > 0 && dz > 0) return Math.hypot(dx, dz);
  return dx > dz ? dx : dz;
}

/** The land edge: the exact union's signed distance in metres, positive outward into the farmland (board and every precinct). */
export function landEdgeAt(x, z, model = ACTIVE) {
  let d = boardEdgeAt(x, z, model);
  for (const P of model.precincts) { const q = precinctDist(P, x, z); if (q < d) d = q; }
  return d;
}

/** The polynomial soft minimum of two signed distances: `min(a, b)` less h^2 k / 4, h = max(k - |a - b|, 0) / k. */
export function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }

/** The apron's signed distance: the board's Euclidean (round-cornered) distance less the apron's width; the board's own edge where the model has no apron or the quay holds. */
export function apronEdgeAt(x, z, model, board = boardEdgeAt(x, z, model)) {
  const w = model.apron;
  if (!(w > 0) || (model.quay && quayMaskAt(x, z, model))) return board;
  const e = model.extent;
  const dx = Math.max(-x, x - e.x); const dz = Math.max(-z, z - e.z);
  return (dx > 0 && dz > 0 ? Math.hypot(dx, dz) : dx > dz ? dx : dz) - w;
}

/**
 * The soft minimum of the members' signed distances (the board with its apron first, then each precinct, then each venue's reach), folded with `smin` of width `band.k`.
 * W85: the one fold. `bakeLandEdge` calls it too, with `far` (a precinct farther than `far` m past its `rmax` takes the lower bound `r - rmax`, as the bake always did) and `dmin`
 * (a one-slot array that takes the min over the board and the precincts: the exact land edge's d, which the reach does not enter). The reach yields to the quay as the apron does.
 */
function foldUnion(model, x, z, board, far, dmin) {
  const k = model.band.k;
  let s = apronEdgeAt(x, z, model, board);
  let m = board;
  const P = model.precincts;
  for (let n = 0; n < P.length; n += 1) {
    let q;
    if (far < Infinity) { const r = Math.hypot(x - P[n].x, z - P[n].z); q = r - P[n].rmax > far ? r - P[n].rmax : precinctDist(P[n], x, z); } else q = precinctDist(P[n], x, z);
    if (q < m) m = q;
    s = smin(s, q, k);
  }
  const R = model.reach;
  if (R && !(model.quay && quayMaskAt(x, z, model))) for (let n = 0; n < R.boxes.length; n += 1) s = smin(s, reachDist(R.boxes[n], x, z), k);
  if (dmin) dmin[0] = m;
  return s;
}
export function softUnion(x, z, model) { return foldUnion(model, x, z, boardEdgeAt(x, z, model), Infinity, null); }

/** The precinct weight: 0 in the farmland, 1 inside the board or a precinct, a smooth union over `PRECINCT_BAND.width` m (0.5 on the edge). */
export function precinctWeight(x, z, model = ACTIVE) {
  const h = model.band.width / 2;
  return 1 - ss01(-h, h, softUnion(x, z, model));
}

/**
 * W85 fix 1: true on a venue's reach ground that W79's mown ground did not hold: the weight with the reach is `min` or more and the weight without it is less. The farm items W79 kept off venue
 * ground (the plan-time pasture check reads a model that has no footprints yet) are kept off this too, from the clear filter at mesh time. False when the model has no reach, and for a point
 * farther than half a band (and one `smin` width) past every grown box, where the reach adds nothing.
 */
const NO_REACH = new WeakMap();
export function onVenueReach(x, z, model, min) {
  const R = model && model.reach;
  if (!R) return false;
  const e = model.band.width / 2 + model.band.k;
  let near = false;
  for (const B of R.boxes) { if (Math.abs(x - B.x) <= B.hx + B.c + e && Math.abs(z - B.z) <= B.hz + B.c + e) { near = true; break; } }
  if (!near || precinctWeight(x, z, model) < min) return false;
  let w0 = NO_REACH.get(model);
  if (!w0) { w0 = { ...model, reach: null }; NO_REACH.set(model, w0); }
  return precinctWeight(x, z, w0) < min;
}

/** CPU only: the id of the precinct whose edge the point is inside, the deepest first; 'board' inside the board only; null in the farmland. */
export function precinctIdAt(x, z, model = ACTIVE) {
  let best = null; let bd = 0;
  for (const P of model.precincts) { const q = precinctDist(P, x, z); if (q < bd) { bd = q; best = P.id; } }
  if (best) return best;
  return boardEdgeAt(x, z, model) < 0 ? 'board' : null;
}

/** 1 inside the quay's frame (board rim to cope, the terminal's span), else 0: where the land edge yields to the quay. */
export function quayMaskAt(x, z, model = ACTIVE) {
  const q = model.quay;
  if (!q) return 0;
  const dx = x - q.x; const dz = z - q.z;
  const c = Math.cos(q.yaw); const s = Math.sin(q.yaw);
  const lx = dx * c - dz * s; const lz = dx * s + dz * c;
  return lx >= q.lx0 && lx <= q.lx1 && lz >= q.lzBack && lz <= q.lzCope ? 1 : 0;
}

let ACTIVE = null;
export function setActiveLandEdge(model) { ACTIVE = LAND_EDGE.on ? (model ?? null) : null; return ACTIVE; }
export function activeLandEdge() { return ACTIVE; }

/* ───────────────────────── the bake ───────────────────────── */

/**
 * Bake the model to an 800 x 800 field at 1 m, centred on the bounding box of the board and the precincts: `data` (d, clamped to +-64 m) and
 * `weight`, as `Uint16Array` half floats, plus `mask` (the quay mask, a byte per texel; JS only). Each texel holds the analytic value at its centre.
 */
export function bakeLandEdge(model, { size = LAND_EDGE_FIELD.size, clamp = LAND_EDGE_FIELD.clamp } = {}) {
  const t0 = now();
  const ap = model.apron > 0 ? model.apron + 6 : 0;
  let minX = -ap; let minZ = -ap; let maxX = model.extent.x + ap; let maxZ = model.extent.z + ap;
  for (const P of model.precincts) { minX = Math.min(minX, P.x - P.rmax); maxX = Math.max(maxX, P.x + P.rmax); minZ = Math.min(minZ, P.z - P.rmax); maxZ = Math.max(maxZ, P.z + P.rmax); }
  // W85: the reach members' grown boxes (the weight is 0 from half a band past their edge)
  if (model.reach) for (const B of model.reach.boxes) { const e = model.band.width / 2; minX = Math.min(minX, B.x - B.hx - B.c - e); maxX = Math.max(maxX, B.x + B.hx + B.c + e); minZ = Math.min(minZ, B.z - B.hz - B.c - e); maxZ = Math.max(maxZ, B.z + B.hz + B.c + e); }
  const x0 = Math.round((minX + maxX) / 2 - size / 2); const z0 = Math.round((minZ + maxZ) / 2 - size / 2);
  const w = size; const h = size;
  const data = new Uint16Array(w * h); const weight = new Uint16Array(w * h); const mask = new Uint8Array(w * h);
  const hb = model.band.width / 2;
  const far = clamp + 6;
  const dmin = new Float64Array(1);
  for (let j = 0; j < h; j += 1) {
    const z = z0 + j + 0.5;
    for (let i = 0; i < w; i += 1) {
      const x = x0 + i + 0.5;
      const u = foldUnion(model, x, z, boardEdgeAt(x, z, model), far, dmin);
      const m = dmin[0];
      const idx = j * w + i;
      data[idx] = floatToHalf(m > clamp ? clamp : m < -clamp ? -clamp : m);
      weight[idx] = floatToHalf(1 - ss01(-hb, hb, u));
      mask[idx] = quayMaskAt(x, z, model);
    }
  }
  return {
    data, weight, mask, x0, z0, w, h, texel: LAND_EDGE_FIELD.texel, clamp, model,
    stats: { bakeMs: now() - t0, texels: w * h, bytes: data.byteLength + weight.byteLength + mask.byteLength, dataBytes: data.byteLength, weightBytes: weight.byteLength, maskBytes: mask.byteLength, precincts: model.precincts.length },
  };
}

/** The baked d at a world point: the spine's `sampleHalfField` (bilinear over texel centres, clamped at the edge). Metres, within +-64. */
export function sampleLandEdgeD(field, x, z) { return sampleHalfField(field, field.data, x, z); }
/** The baked precinct weight at a world point, by the same rule. */
export function sampleLandEdgeW(field, x, z) { return sampleHalfField(field, field.weight, x, z); }

/* ───────────────────────── the GPU twin ───────────────────────── */

export const LAND_EDGE_UNIFORM_NAMES = Object.freeze({ d: 'uLandEdgeD', weight: 'uLandEdgeW', rect: 'uLandEdgeRect' });

/** R16F + Nearest textures of the two layers, made once and held on the field (`field.gpu`). */
export function createLandEdgeTextures(field) {
  if (field.gpu) return field.gpu;
  const d = new THREE.DataTexture(field.data, field.w, field.h, THREE.RedFormat, THREE.HalfFloatType);
  const weight = new THREE.DataTexture(field.weight, field.w, field.h, THREE.RedFormat, THREE.HalfFloatType);
  for (const t of [d, weight]) {
    t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.unpackAlignment = 1;
    t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  }
  d.name = 'land-edge:d'; weight.name = 'land-edge:weight';
  field.gpu = { d, weight };
  return field.gpu;
}

export function landEdgeUniforms(field) {
  const gpu = createLandEdgeTextures(field);
  return {
    [LAND_EDGE_UNIFORM_NAMES.d]: { value: gpu.d },
    [LAND_EDGE_UNIFORM_NAMES.weight]: { value: gpu.weight },
    [LAND_EDGE_UNIFORM_NAMES.rect]: { value: new THREE.Vector4(field.x0, field.z0, field.w, field.h) },
  };
}

export function disposeLandEdgeTextures(field) {
  if (!field?.gpu) return;
  field.gpu.d.dispose(); field.gpu.weight.dispose(); field.gpu = null;
}

/** The uniforms and the two readers; the sampler is the spine's `ddCoastSpineD` (put `COAST_SPINE_GLSL` first). */
export const LAND_EDGE_UNIFORMS_GLSL = /* glsl */ `
  uniform highp sampler2D ${LAND_EDGE_UNIFORM_NAMES.d};
  uniform highp sampler2D ${LAND_EDGE_UNIFORM_NAMES.weight};
  uniform vec4 ${LAND_EDGE_UNIFORM_NAMES.rect};
  float ddLandEdgeAt(vec2 xz) { return ddCoastSpineD(${LAND_EDGE_UNIFORM_NAMES.d}, ${LAND_EDGE_UNIFORM_NAMES.rect}, xz); }
  float ddPrecinctWeightAt(vec2 xz) { return ddCoastSpineD(${LAND_EDGE_UNIFORM_NAMES.weight}, ${LAND_EDGE_UNIFORM_NAMES.rect}, xz); }
`;

/* ───────────────────────── W79 (L2): the readers ───────────────────────── */

let CITY_KEY = null; let TABLES = []; let UNI = null;
const FALLBACK = new Map();

/** The model with no precinct, for a reader that runs before any plan: the board alone, by the switch's corner. */
function boardOnlyModel(extent) {
  const key = `${extent.x}|${extent.z}|${LAND_EDGE.round}`;
  if (!FALLBACK.has(key)) FALLBACK.set(key, { extent: { x: extent.x, z: extent.z }, round: !!LAND_EDGE.round, precincts: [], quay: null, band: PRECINCT_BAND, apron: LAND_EDGE.readers.venue ? APRON.width : 0, sig: 'board' });
  return FALLBACK.get(key);
}

/**
 * Called by `planEdgeMassing` (only when `LAND_EDGE.on`): the active model for this city, from the plan's seats, Rod Laver's table once the scene has it
 * (kept for later calls without a scene) and a smoothed table (`tableRadius` smooth). A change of model re-bakes the shared field in place.
 */
export function landEdgeForPlan(city, seats, scene = null) {
  if (!LAND_EDGE.on) return null;
  const extent = city?.extent ?? { x: 272, z: 272 };
  const key = `${city?.seed ?? 0}|${extent.x}|${extent.z}|${city?.waterEdge ?? ''}`;
  if (key !== CITY_KEY) { CITY_KEY = key; TABLES = []; }
  for (const q of seats) LAWN_CENTRES.set(q.id, { x: q.x, z: q.z });
  if (scene) { const t = harvestPrecinctTables(scene); if (t.length) TABLES = t; }
  const sig = `${key}|${seats.map((q) => `${q.id}:${q.x.toFixed(2)},${q.z.toFixed(2)},${q.radius.toFixed(2)}`).join(';')}|${TABLES.map((t) => `${t.id}:${t.x.toFixed(2)},${t.z.toFixed(2)}`).join(';')}${VENUE_REACH.m > 0 ? `|reach:${VENUE_REACH.m}:${TABLES.map((t) => (t.foot ? `${t.id}:${t.foot.x0.toFixed(1)},${t.foot.x1.toFixed(1)},${t.foot.z0.toFixed(1)},${t.foot.z1.toFixed(1)}` : '')).join(';')}` : ''}`;
  if (ACTIVE && ACTIVE.sig === sig) return ACTIVE;
  const model = buildLandEdgeModel({ ...city, extent }, { seats, tables: TABLES, round: !!LAND_EDGE.round, smooth: true });
  model.sig = sig;
  ACTIVE = model;
  if (UNI) syncLandField();
  return model;
}

/** The model a CPU reader uses: the active one, or the board alone. */
export function landModelFor(extent) { return ACTIVE && ACTIVE.extent.x === extent.x && ACTIVE.extent.z === extent.z ? ACTIVE : boardOnlyModel(extent); }

/**
 * The tray band's distance (metres out, replacing the Chebyshev `out`): the land edge's board distance, square or round by the switch, and a huge value where the
 * quay holds (the band yields to it). The precincts are NOT in it: a far pad's d would put the band's 60 m height cap round the pad (the hills round Falls Creek).
 */
export function landBandOut(x, z, extent) {
  const m = landModelFor(extent);
  if (m.quay && quayMaskAt(x, z, m)) return 1e9;
  return boardEdgeAt(x, z, m);
}

/** The precinct weight on the CPU (the one weight every venue-ground reader reads). */
export function landWeightAt(x, z, extent) { return precinctWeight(x, z, landModelFor(extent)); }

/**
 * The overlay sheet's start radius along bearing `az` from the board's centre: the radius where the board's land edge reaches `pad` metres out
 * (3.4 for the sheet, +12 for the scatter's keep-clear), by the switch's corner. Closed form: Chebyshev is max(|r sin| - hx, |r cos| - hz) = pad.
 */
export function landStartRadius(az, extent, pad) {
  const hx = extent.x * 0.5; const hz = extent.z * 0.5;
  const sx = Math.abs(Math.sin(az)); const cz = Math.abs(Math.cos(az));
  if (!LAND_EDGE.round) {
    const a = sx > 1e-9 ? (hx + pad) / sx : Infinity; const b = cz > 1e-9 ? (hz + pad) / cz : Infinity;
    return Math.min(a, b);
  }
  // Euclid at the corner: the first r where the edge (a straight offset on the faces, a circle round the corner) is pad out.
  const rx = sx > 1e-9 ? (hx + pad) / sx : Infinity; const rz = cz > 1e-9 ? (hz + pad) / cz : Infinity;
  const faceR = Math.min(rx, rz);
  // inside the corner square (both overshoot) the distance is the hypot: solve |(r sx - hx, r cz - hz)| = pad
  const A = sx * sx + cz * cz; const B = -2 * (sx * hx + cz * hz); const C = hx * hx + hz * hz - pad * pad;
  const disc = B * B - 4 * A * C;
  // W79 fix 4 (L2): a ray that never comes within `pad` of the corner has no root (disc <= 0): the face's radius stands. The earlier `Infinity` there passed the corner test
  // (Infinity * sx >= hx), so the sheet's and the ribbon's start radius were Infinity on almost every bearing under `landEdgeRound=1` (NaN rows; the page never reached ready).
  if (!(disc > 0)) return faceR;
  const rc = (-B + Math.sqrt(disc)) / (2 * A);
  return rc * sx >= hx && rc * cz >= hz ? rc : faceR;
}

/**
 * The farm window (W79): the scan `surveyedPaddocks` makes from the inland gateway and the world rectangle `edge-massing.js` keeps clear of landform, as one
 * statement. `core/city.js` and `edge-massing.js` both read it. Distance from the board's edge 140..350 m, along the edge -160..160 m, step 5 m.
 */
export const FARM_WINDOW = Object.freeze(LAND_EDGE.readers.farm
  // W79 fix 3 (L2): the farm reader is consulted here, in the one place. Both states hold the values the two readers carried before (140, 350, -160, 160, 5), so the farm reader moves nothing today; a later window changes the first line only.
  ? { dist0: 140, dist1: 350, along0: -160, along1: 160, step: 5 }
  : { dist0: 140, dist1: 350, along0: -160, along1: 160, step: 5 });

/** The shared uniforms of the baked field, made on first use (a board-only field if no plan has run) and re-baked in place when the model changes. */
export function landFieldUniforms(extent = { x: 272, z: 272 }) {
  if (!ACTIVE) ACTIVE = boardOnlyModel(extent);
  if (!UNI) {
    UNI = { [LAND_EDGE_UNIFORM_NAMES.d]: { value: null }, [LAND_EDGE_UNIFORM_NAMES.weight]: { value: null }, [LAND_EDGE_UNIFORM_NAMES.rect]: { value: new THREE.Vector4() } };
    syncLandField();
  }
  return UNI;
}
function syncLandField() {
  const field = bakeLandEdge(ACTIVE);
  const old = UNI._gpuField ?? null;
  const u = landEdgeUniforms(field);
  UNI[LAND_EDGE_UNIFORM_NAMES.d].value = u[LAND_EDGE_UNIFORM_NAMES.d].value;
  UNI[LAND_EDGE_UNIFORM_NAMES.weight].value = u[LAND_EDGE_UNIFORM_NAMES.weight].value;
  UNI[LAND_EDGE_UNIFORM_NAMES.rect].value.copy(u[LAND_EDGE_UNIFORM_NAMES.rect].value);
  UNI._gpuField = field;
  if (old) disposeLandEdgeTextures(old);
}

/* ───────────────────────── the page: harvest and debug overlay ───────────────────────── */

/** Rod Laver's 96-bearing table and its frame, read off the mesh that carries it (`material.userData.venueGround.join.table`). [] before the venue is built. */
export function harvestPrecinctTables(root) {
  const out = [];
  const g = root?.getObjectByName?.('fringe:rod-laver');
  if (g) {
    g.updateWorldMatrix(true, true);
    let found = null;
    g.traverse((n) => {
      if (found || !n.isMesh) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      for (const m of mats) { const t = m?.userData?.venueGround?.join?.table; if (t && t.length === 96) { found = { n, t }; break; } }
    });
    if (found) {
      const e = found.n.matrixWorld.elements;
      out.push({ id: 'rod-laver', x: e[12], z: e[14], yaw: Math.atan2(e[8], e[10]), table: Array.from(found.t), foot: footprintOf(g) });
    }
  }
  // W79 fix (L2): the other pads' drawn lawns, harvested as an OUTLINE_NODES-bearing outline from the seat's centre (see `lawnOutline`).
  for (const [id, name] of Object.entries(LAWN_GROUPS)) {
    const grp = root?.getObjectByName?.(name);
    if (!grp) continue;
    grp.updateWorldMatrix(true, true);
    const o = lawnOutline(grp, LAWN_CENTRES.get(id) ?? null);
    if (o) out.push({ id, x: o.x, z: o.z, yaw: 0, table: o.table, foot: footprintOf(grp) });
  }
  return out;
}

/** W85: a venue group's footprint in the world frame, { x0, x1, z0, z1 } (its Box3), or null when the group holds nothing. */
function footprintOf(group) {
  const b = new THREE.Box3().setFromObject(group);
  return Number.isFinite(b.min.x) && Number.isFinite(b.max.x) && b.max.x > b.min.x && b.max.z > b.min.z ? { x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z } : null;
}

/** The venue groups whose lawn meshes (a material that `attachVenueGround` marked `local`, not `soil`) give a pad's outline. Falls Creek draws no venue ground, so it keeps its disc. */
const LAWN_GROUPS = Object.freeze({ 'grand-prix': 'fringe:grand-prix', tullamarine: 'fringe:tullamarine', 'southern-cross': 'fringe:southern-cross' });
/** W79 fix 3 (L2): the nodes of a harvested lawn outline (0.25 degrees; the 96 of the first pass left Tullamarine up to 9.45 m off its lawn between nodes). */
export const OUTLINE_NODES = 1440;
/** The seat centres the outlines are cast from (set by `landEdgeForPlan` from the plan's seats). */
const LAWN_CENTRES = new Map();

/**
 * The drawn lawn's outline as an OUTLINE_NODES-bearing table: for each bearing a (atan2(x, z), world frame, 0 = +z) from the seat's centre, the farthest point where the ray crosses the
 * boundary of any lawn triangle (the meshes whose material is a local, non-soil venue ground: the turf, its crown and toe). Bearings the lawn does not reach get 6 m.
 * { x, z, table } or null when the group has no lawn mesh.
 */
const TURF_SKIP = /(crown|toe|verge|batter|bank|estate|soil|edge)/i;
export function lawnOutline(group, centre, nodes = OUTLINE_NODES, phase = 0) {
  const tris = [];
  group.traverse((n) => {
    if (!n.isMesh || !n.geometry || n.isInstancedMesh) return;
    const mats = Array.isArray(n.material) ? n.material : [n.material];
    if (!mats.some((m) => { const v = m?.userData?.venueGround; return v && v.local && !v.soil; })) return;
    // W79 fix 4 (L2): the turf only. The crown, toe, service verge, batter and estate meshes (named so) run up to 39 m past the turf; the turf meshes are unnamed (Tullamarine, Southern Cross) or `-turf:N` (Grand Prix).
    if (TURF_SKIP.test(n.name || '')) return;
    const pos = n.geometry.getAttribute('position'); if (!pos) return;
    const idx = n.geometry.index; const e = n.matrixWorld.elements;
    const wx = (i) => e[0] * pos.getX(i) + e[4] * pos.getY(i) + e[8] * pos.getZ(i) + e[12];
    const wz = (i) => e[2] * pos.getX(i) + e[6] * pos.getY(i) + e[10] * pos.getZ(i) + e[14];
    const cnt = idx ? idx.count : pos.count;
    for (let t = 0; t + 2 < cnt; t += 3) {
      const a = idx ? idx.getX(t) : t; const b = idx ? idx.getX(t + 1) : t + 1; const c = idx ? idx.getX(t + 2) : t + 2;
      tris.push(wx(a), wz(a), wx(b), wz(b), wx(c), wz(c));
    }
  });
  if (!tris.length) return null;
  let cx; let cz;
  if (centre) { cx = centre.x; cz = centre.z; } else { let sx = 0; let sz = 0; for (let i = 0; i < tris.length; i += 2) { sx += tris[i]; sz += tris[i + 1]; } cx = sx / (tris.length / 2); cz = sz / (tris.length / 2); }
  const N = nodes; // `nodes` and `phase` (a fraction of a node) are for a probe that casts its own bearings
  const table = new Array(N).fill(6);
  const rx = new Float64Array(N); const rz = new Float64Array(N);
  for (let k = 0; k < N; k += 1) { const a = ((k + phase) / N) * TAU; rx[k] = Math.sin(a); rz[k] = Math.cos(a); }
  for (let i = 0; i < tris.length; i += 6) {
    for (let j = 0; j < 3; j += 1) {
      const ax = tris[i + 2 * j] - cx; const az = tris[i + 2 * j + 1] - cz;
      const bx = tris[i + 2 * ((j + 1) % 3)] - cx; const bz = tris[i + 2 * ((j + 1) % 3) + 1] - cz;
      const ex = bx - ax; const ez = bz - az;
      for (let k = 0; k < N; k += 1) {
        // ray r(t) = t (rx, rz); segment a + u e: solve t, u
        const den = rx[k] * ez - rz[k] * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = (ax * ez - az * ex) / den;
        const u = (ax * rz[k] - az * rx[k]) / den;
        if (u >= 0 && u <= 1 && t > table[k]) table[k] = t;
      }
    }
  }
  return { x: cx, z: cz, table };
}

const DEBUG_VS = /* glsl */ `
  varying vec2 vXZ;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vXZ = w.xz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
// The overlay's fragment text is built when the overlay is (W79 close): `COAST_SPINE_GLSL` is not yet initialised when this module loads inside the import cycle.
const debugFs = () => /* glsl */ `
  varying vec2 vXZ;
  ${COAST_SPINE_GLSL}
  ${LAND_EDGE_UNIFORMS_GLSL}
  float isoLine(float d, float c, float fw) { return 1.0 - smoothstep(1.0 * fw, 2.0 * fw, abs(d - c)); }
  void main() {
    float d = ddLandEdgeAt(vXZ);
    float w = ddPrecinctWeightAt(vXZ);
    float fw = max(fwidth(d), 1e-4);
    float fww = max(fwidth(w), 1e-5);
    float aW = 1.0 - smoothstep(1.0 * fww, 2.0 * fww, abs(w - 0.5));
    float a245 = isoLine(d, 24.5, fw);
    float a14 = isoLine(d, 14.0, fw);
    float a26 = isoLine(d, 2.6, fw);
    float a0 = isoLine(d, 0.0, fw);
    vec3 col = vec3(0.0); float a = 0.0;
    col = mix(col, vec3(0.55, 0.28, 0.0), aW); a = max(a, aW);
    col = mix(col, vec3(0.55, 0.5, 0.0), a245); a = max(a, a245);
    col = mix(col, vec3(0.0, 0.5, 0.55), a14); a = max(a, a14);
    col = mix(col, vec3(0.55, 0.0, 0.55), a26); a = max(a, a26);
    col = mix(col, vec3(1.0), a0); a = max(a, a0);
    gl_FragColor = vec4(col, a);
  }
`;

/** Height of the overlay plane above y = 0, metres (the land past the lawn stands at -0.10 to +0.34 m; the pads rise to 4.6 m, stated on the sheet). */
export const LAND_EDGE_DEBUG_Y = 0.3;

/**
 * The debug overlay (`?landEdgeDebug=1`): one transparent plane over the baked field whose fragment shader reads both layers through the spine's
 * sampler and draws the iso-lines at 0 (white), 2.6 (magenta), 14 (cyan) and 24.5 m (yellow), and the precinct weight's 0.5 line (orange).
 * Seats come live from the scene on the first frame and Rod Laver's table when its venue exists (`refresh`). `dispose()` frees the plane and the field.
 */
export function buildLandEdgeDebug(city, { round = LAND_EDGE.round, y = LAND_EDGE_DEBUG_Y } = {}) {
  const group = new THREE.Group();
  group.name = 'debug:land-edge';
  // W79 fix 2 (L2): with the venue reader on, the page's own baked weight (the model `landEdgeForPlan` keeps, outlines harvested at the venues' build) is the shared field, so the
  // overlay draws the weight the ground reads (its 0.5 line is the orange one) and follows the field when it re-bakes; with it off the overlay keeps its own model and bake.
  const live = !!LAND_EDGE.readers.venue;
  let model = live ? null : buildLandEdgeModel(city, { round });
  let field = live ? null : bakeLandEdge(model);
  const uniforms = live ? landFieldUniforms(city.extent) : landEdgeUniforms(field);
  const frame = () => (live ? uniforms._gpuField : field);
  const geom = new THREE.PlaneGeometry(frame().w, frame().h);
  geom.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: DEBUG_VS, fragmentShader: debugFs(), transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = 'debug:land-edge:field';
  mesh.renderOrder = 9997;
  mesh.frustumCulled = false;
  const place = () => { const f = frame(); mesh.position.set(f.x0 + f.w / 2, y, f.z0 + f.h / 2); };
  place();
  group.add(mesh);
  const api = {
    group, mesh, get field() { return frame(); }, get model() { return live ? ACTIVE : model; }, refreshed: false, rebakes: 0,
    /** Once the venues exist (call from a render hook with the scene): live seats and Rod Laver's table, then one re-bake. */
    refresh(scene) {
      if (api.refreshed || !scene) return false;
      if (live) { api.refreshed = true; place(); return true; }
      const tables = harvestPrecinctTables(scene);
      if (!tables.length) return false;
      api.refreshed = true;
      model = buildLandEdgeModel(city, { seats: ringSeatsFromCity(city, scene), tables, round });
      const old = field;
      field = bakeLandEdge(model);
      const u = landEdgeUniforms(field);
      uniforms[LAND_EDGE_UNIFORM_NAMES.d].value = u[LAND_EDGE_UNIFORM_NAMES.d].value;
      uniforms[LAND_EDGE_UNIFORM_NAMES.weight].value = u[LAND_EDGE_UNIFORM_NAMES.weight].value;
      uniforms[LAND_EDGE_UNIFORM_NAMES.rect].value.set(field.x0, field.z0, field.w, field.h);
      place();
      disposeLandEdgeTextures(old);
      api.rebakes += 1;
      return true;
    },
    dispose() { geom.dispose(); mat.dispose(); if (!live) disposeLandEdgeTextures(field); },
  };
  mesh.onBeforeRender = (renderer, scene) => { if (live) place(); else if (!api.refreshed) api.refresh(scene); };
  return api;
}

export default LAND_EDGE;
