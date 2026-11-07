// Wave 78 (phase 2b lane 2, COAST_SPINE on only): the wet-edge decal on the coast spine's field.
//
// Today's decal (`buildWetEdgeGeometry`, outer-ocean.js) is the marching-squares contour of the ocean depth bake's 8-bit SDF on the bake's cells,
// seated on the old shelf. With the switch on the sea sheet's alpha 0.5 lies on d's zero and the sand is the spine path's section, so that
// contour floats. Here, inside the beach weight, the band is traced on d itself (the field's 1 m texels), seated on the sand as the GPU draws it
// (the shelf mesh's own vertices at `beachSection`'s height, interpolated across its triangles: `drawnSandSurface`), and its opacity is a ramp on d.
//
// Everything is in "front" metres, positive seaward: front = d - beachOffset, the front the sand and the sheet read. The band's nominal edges
// (an edge is where the band's opacity is half of its plateau):
//   landward LANDWARD = -2.05  today's band is 0.40 to 2.05 m landward of its contour; a smoothstep `feather` m wide, centred on it
//   seaward  SEAWARD          where the band hands over to the sheet: the band's alpha is what the plateau's cover (PLATEAU) leaves after the sheet's alpha
//                             (a smoothstep over -edgeM..edgeM of front - centreM, aqua.js) has taken its share, so the combined cover of the band
//                             and the sheet over it never dips below the plateau's until the sheet alone is above it (about -0.12 at the half point)
// Nothing here is read with the switch off.
import { COAST_SPINE, BEACH_EXTENT, COAST_LABEL_BLEND, SPINE_WATER, activeCoastSpine, sampleCoastD, coastSpineWaterWeight, halfToFloat, SEA_SHEET_Y } from '../coast-spine.js';
import { SHORE } from '../shore.js';
import { SPINE_EDGE } from './aqua.js';
import { beachSection, buildBeachGeometry } from './sand.js';
import { cornerMaskAt } from './foam.js';

function ss01(e0, e1, x) { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

/** The sea sheet's alpha cap on the spine path at a front (aqua.js: smoothstep(-edgeM, edgeM, front - centreM)). */
export function sheetAlpha(front) { return ss01(-SPINE_WATER.edgeM, SPINE_WATER.edgeM, front - SPINE_EDGE.centreM); }

/** The decal's alpha on its plateau: the factor in the wet-edge material (outer-ocean.js, `0.44 * vWetBeach.y`). */
const PLATEAU = 0.44;

// The seaward hand-over: the band's share (0 to 1 of the plateau) that, with the sheet's alpha over it, keeps the combined cover at the plateau's.
function seawardShare(front) {
  const s = sheetAlpha(front);
  return Math.max(0, Math.min(1, (1 - (1 - PLATEAU) / Math.max(1 - s, 1e-6)) / PLATEAU));
}

function bisect(lo, hi, above) { // the front where `above(front)` turns false, between a front where it holds (lo) and one where it does not (hi)
  for (let i = 0; i < 60; i += 1) { const m = (lo + hi) / 2; if (above(m)) lo = m; else hi = m; }
  return Math.round(((lo + hi) / 2) * 1e6) / 1e6;
}

const SEAWARD = bisect(-SPINE_WATER.edgeM + SPINE_EDGE.centreM, SPINE_EDGE.centreM + SPINE_WATER.edgeM * 0.2, (f) => seawardShare(f) > 0.5); // the share is 0.5
const SEAWARD_END = bisect(SEAWARD, SPINE_EDGE.centreM + SPINE_WATER.edgeM * 0.2, (f) => seawardShare(f) > 0); // the share reaches 0: the sheet alone is at the plateau's cover

// The cross-section's vertices (front m): through each ramp at most 0.09 m apart, and 0.1036 m between on the plateau. The sand's relief floor
// (`beachReliefFloor`, a max) is a convex kink in the section, and a chord across a kink lies above the sand: the denser the vertices, the less the
// decal stands off it. The seaward ramp runs from SEAWARD_END (about -0.005: the sheet alone is at the plateau's cover, the band's alpha 0, and the sand's
// front still under the sheet's zero) to -0.5 (the sheet's fade has not begun); the nominal seaward edge is one of the vertices.
function WET_EDGE_KNOTS() {
  const out = [];
  for (let k = 0; k <= 6; k += 1) out.push(SEAWARD_END + (-0.5 - SEAWARD_END) * (k / 6));
  if (!out.some((v) => Math.abs(v - SEAWARD) < 0.015)) out.push(SEAWARD);
  out.sort((a, b) => b - a);
  for (let k = 1; k < 11; k += 1) out.push(-0.5 - (1.3 / 11) * k); // -0.618 .. -1.682, 0.118 m apart, then the landward ramp
  for (let k = 0; k < 5; k += 1) out.push(-1.80 - 0.125 * k); // -1.80 .. -2.30, the landward edge at -2.05
  return out.map((v) => Math.round(v * 1e6) / 1e6);
}

export const WET_EDGE_SPINE = Object.freeze({
  /** Nominal front (m) of the band's seaward edge: where its opacity is half of the plateau (the hand-over to the sheet). */
  seaward: SEAWARD,
  /** Front (m) where the band's alpha reaches 0 on the seaward side (the sheet alone is at the plateau's cover). */
  seawardEnd: SEAWARD_END,
  /** Nominal front (m) of the band's landward edge. */
  landward: -2.05,
  /** Width (m) of the landward edge's smoothstep, centred on the edge. */
  feather: 0.5,
  /** The decal's plateau alpha (the material's factor). */
  plateau: PLATEAU,
  /**
   * The lift over the drawn sand (was 0.010 over the section). A flat decal triangle cuts the shelf's creases (the relief floor is a max, and the rows are
   * about 0.9 m apart): measured against the drawn surface at 66 points in every band triangle, both seeds, offsets 0 and +2, the decal's chord stands
   * between 0.0105 under and 0.0064 over its vertices' own height, so a lift of 0.012 keeps it between +0.0015 and +0.0185 over the sand (never under, at most 0.02).
   */
  lift: 0.012,
  /** Row spacing along the contour, m (rows are spread evenly over each chain, so the true spacing is at most this). */
  rowStep: 1.0,
  /** Rows halve up to this many times (to 0.0625 m) where the chord between two rows stands off the drawn sand by more than `tol` m at any of 7 points. */
  maxSplit: 4,
  tol: 0.003,
  /** The reference contour the rows start on (the band's middle), front m. */
  level: -1.23,
  /** Where the cross-section's vertices lie (front m), seaward to landward. */
  knots: Object.freeze(WET_EDGE_KNOTS()),
  /** A band triangle whose opacity (0 to 1 of the plateau) is under this at all three vertices is not emitted (the corner mask's gate takes the band's opacity to 0 over its feather). */
  dropBelow: 0.01,
  /** The old decal's quads are dropped where the spine weight is at least this, since the band replaces them. */
  replaceWeight: 0.5,
});

/** The band's opacity (0 to 1, plateau 1) as a function of the front: half at each nominal edge; the landward edge a smoothstep `feather` m wide, the seaward the hand-over to the sheet. */
export function wetBandOpacity(front, spec = WET_EDGE_SPINE) {
  const h = spec.feather * 0.5;
  return ss01(spec.landward - h, spec.landward + h, front) * seawardShare(front);
}

/**
 * The combined cover at a front, the band's alpha with the sheet's alpha over it: 1 - (1 - band)(1 - sheet). With `dip` the deepest valley in the
 * profile from front `from` to `to` (how far the cover falls below the lower of its highest values on either side of a point).
 */
export function wetCoverProfile(from = -3, to = 1, step = 0.01, spec = WET_EDGE_SPINE) {
  const pts = [];
  for (let f = from; f <= to + 1e-9; f += step) {
    const band = spec.plateau * wetBandOpacity(f, spec); const sheet = sheetAlpha(f);
    pts.push({ front: Math.round(f * 1e6) / 1e6, band, sheet, cover: 1 - (1 - band) * (1 - sheet) });
  }
  const left = []; const right = [];
  let m = 0; for (let i = 0; i < pts.length; i += 1) { m = Math.max(m, pts[i].cover); left[i] = m; }
  m = 0; for (let i = pts.length - 1; i >= 0; i -= 1) { m = Math.max(m, pts[i].cover); right[i] = m; }
  let dip = 0; let dipAt = null;
  for (let i = 0; i < pts.length; i += 1) { const v = Math.min(left[i], right[i]) - pts[i].cover; if (v > dip) { dip = v; dipAt = pts[i].front; } }
  return { pts, dip, dipAt };
}

/**
 * The band's weight at a world point: the spine weight (`coastSpineWaterWeight`: the beach label, ended by the board's extent over `BEACH_EXTENT.feather`
 * m) times an end ramp, so the band's ends fade over the beach weight's blend (`COAST_LABEL_BLEND.band`, 8 m): 0 where the sheet's override ends (the
 * feather past the board's end), 1 from the blend's width inside it. Where the weight is under 1 the old decal's contour stands in (it is
 * dropped inside the city shelf's footprint, so the band simply ends).
 * (Wave 78, second fix pass: taking the weight to 1 at the replace weight instead, so the band is whole where the old quads end, put the band over the sheet
 * where d is positive at the board's ends, 541 to 10,479 vertices (`aboveSheet`) and opacity steps to 0.95: not kept. The ramp stays.)
 */
export function wetBandWeight(field, x, z) {
  const w = coastSpineWaterWeight(x, z, field);
  const fr = field.curve?.info?.frame;
  if (!(w > 0) || !fr) return w;
  const inside = Math.max(fr.half, 1) - Math.abs(x * fr.a[0] + z * fr.a[1] - fr.alongC);
  return w * ss01(-BEACH_EXTENT.feather, COAST_LABEL_BLEND.band - BEACH_EXTENT.feather, inside);
}

/**
 * The sand as the GPU draws it. The shelf is a mesh (`buildBeachGeometry`, the vertices jittered off their lattice) whose vertex stage lifts each vertex to the
 * section's height; between vertices the triangles are flat. `beachSection` is that height at a point, so it is right at the vertices and off the drawn surface
 * between them (the rows are about 0.9 m apart across the shore, and the section has kinks): up to +0.055 m and -0.053 m inside the band. This builds the same mesh
 * (water.js `_buildSandShelf`: the same length, inland and seaward, placed on the bay's frame, yawed to its normal), takes `beachSection` at its vertices only
 * (lazily, once each), and answers `yAt(x, z)` by interpolating across the triangle that contains the point. Null if the field is not the active one
 * (`beachSection` reads the active field) or has no frame.
 */
const DRAWN_CACHE = new WeakMap();
export function drawnSandSurface(field, quality = 'high') {
  const fr = field?.curve?.info?.frame;
  if (!fr || !fr.length || !isActiveField(field)) return null;
  let perField = DRAWN_CACHE.get(field);
  if (!perField) { perField = new Map(); DRAWN_CACHE.set(field, perField); }
  if (perField.has(quality)) return perField.get(quality);
  // water.js:328-336 (_buildSandShelf): inland, seaward and the along length of the shelf mesh.
  const geom = buildBeachGeometry({
    alongLength: fr.length + (SHORE.cornerWrapR ?? 88),
    inland: Math.max(0.5, SHORE.wallDeep * 0.25 - 3),
    seaward: SHORE.waterFromWall + 14,
    quality,
  });
  const pos = geom.getAttribute('position').array;
  const idx = geom.index.array;
  const nVert = geom.userData.beachVertexCount - geom.userData.cornerPropCount; // the shelf's own vertices come first; the corner props follow
  // Only the shelf's own triangles (the props' indices are offset past the shelf's vertices).
  const tris = [];
  for (let t = 0; t + 2 < idx.length; t += 3) if (idx[t] < nVert && idx[t + 1] < nVert && idx[t + 2] < nVert) tris.push(idx[t], idx[t + 1], idx[t + 2]);
  const cell = 2;
  const grid = new Map();
  const key = (i, j) => i * 100003 + j;
  for (let t = 0; t < tris.length; t += 3) {
    let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity;
    for (let k = 0; k < 3; k += 1) { const v = tris[t + k]; x0 = Math.min(x0, pos[v * 3]); x1 = Math.max(x1, pos[v * 3]); z0 = Math.min(z0, pos[v * 3 + 2]); z1 = Math.max(z1, pos[v * 3 + 2]); }
    for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i += 1) {
      for (let j = Math.floor(z0 / cell); j <= Math.floor(z1 / cell); j += 1) {
        const kk = key(i, j); const l = grid.get(kk);
        if (l) l.push(t); else grid.set(kk, [t]);
      }
    }
  }
  const hv = new Float64Array(nVert).fill(NaN);
  const vertexY = (v) => {
    if (!(hv[v] === hv[v])) { // NaN: not yet taken
      const lx = pos[v * 3]; const lz = pos[v * 3 + 2];
      hv[v] = beachSection(fr.O[0] + fr.a[0] * lx + fr.n[0] * lz, fr.O[1] + fr.a[1] * lx + fr.n[1] * lz).y;
    }
    return hv[v];
  };
  const eps = -1e-7;
  const surface = {
    quality, triangles: tris.length / 3, vertices: nVert,
    /** World Y of the drawn sand at a world point; NaN outside the shelf mesh. */
    yAt(x, z) {
      const lx = (x - fr.O[0]) * fr.a[0] + (z - fr.O[1]) * fr.a[1];
      const lz = (x - fr.O[0]) * fr.n[0] + (z - fr.O[1]) * fr.n[1];
      const list = grid.get(key(Math.floor(lx / cell), Math.floor(lz / cell)));
      if (!list) return NaN;
      for (const t of list) {
        const a = tris[t]; const b = tris[t + 1]; const c = tris[t + 2];
        const ax = pos[a * 3]; const az = pos[a * 3 + 2];
        const v0x = pos[b * 3] - ax; const v0z = pos[b * 3 + 2] - az; const v1x = pos[c * 3] - ax; const v1z = pos[c * 3 + 2] - az;
        const den = v0x * v1z - v1x * v0z;
        if (Math.abs(den) < 1e-12) continue;
        const px = lx - ax; const pz = lz - az;
        const u = (px * v1z - v1x * pz) / den; const w = (v0x * pz - px * v0z) / den;
        if (u < eps || w < eps || 1 - u - w < eps) continue;
        return vertexY(a) * (1 - u - w) + vertexY(b) * u + vertexY(c) * w;
      }
      return NaN;
    },
  };
  perField.set(quality, surface);
  return surface;
}

function isActiveField(field) { return activeCoastSpine() === field; }

// Marching squares. Corners are bottom-left, bottom-right, top-right, top-left; entries name the two cell edges (0 bottom, 1 right, 2 top, 3 left)
// each case joins. The same table as buildWetEdgeGeometry's.
const CASES = [
  [], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[3, 2], [0, 1]],
  [[0, 2]], [[3, 2]], [[2, 3]], [[0, 2]], [[0, 3], [1, 2]],
  [[1, 2]], [[1, 3]], [[0, 1]], [[3, 0]], [],
];

/** The cells to scan: the world rectangle of the beach's frame (along the board's extent plus a margin, across the shore) as a texel range. */
function scanRange(field) {
  const fr = field.curve?.info?.frame;
  if (!fr) return null;
  const margin = 8;
  const a0 = fr.alongC - Math.max(fr.half, 1) - margin; const a1 = fr.alongC + Math.max(fr.half, 1) + margin;
  const s0 = 12; const s1 = 96;
  let xMin = Infinity; let xMax = -Infinity; let zMin = Infinity; let zMax = -Infinity;
  for (const al of [a0, a1]) {
    for (const sh of [s0, s1]) {
      // beachSection's frame: along = p . a, shore = (p - O) . n, so p = a * along + n * (shore + O . n).
      const on = fr.O[0] * fr.n[0] + fr.O[1] * fr.n[1];
      const x = fr.a[0] * al + fr.n[0] * (sh + on); const z = fr.a[1] * al + fr.n[1] * (sh + on);
      xMin = Math.min(xMin, x); xMax = Math.max(xMax, x); zMin = Math.min(zMin, z); zMax = Math.max(zMax, z);
    }
  }
  const t = field.texel;
  return {
    i0: Math.max(0, Math.floor((xMin - field.x0) / t) - 1), i1: Math.min(field.w - 2, Math.ceil((xMax - field.x0) / t) + 1),
    j0: Math.max(0, Math.floor((zMin - field.z0) / t) - 1), j1: Math.min(field.h - 2, Math.ceil((zMax - field.z0) / t) + 1),
  };
}

/**
 * The chains of the iso-line `front = level` on the field's texels, where the spine weight (`coastSpineWaterWeight`) is above 0 at the segment's
 * midpoint. Each chain is an array of [x, z]. The line is traced on the field's own samples (1 m texels), never on the bake.
 */
export function traceFrontLine(field, level, { beachOffset = COAST_SPINE.beachOffset } = {}) {
  const range = scanRange(field);
  if (!range) return [];
  const { w, x0, z0, texel, data } = field;
  const val = (i, j) => halfToFloat(data[j * w + i]) - beachOffset - level;
  const pointCache = new Map();
  const edgeKey = (e, i, j) => (e === 0 ? (j * w + i) * 2 : e === 2 ? ((j + 1) * w + i) * 2 : e === 3 ? (j * w + i) * 2 + 1 : (j * w + i + 1) * 2 + 1);
  const edgePt = (e, i, j, v) => {
    const key = edgeKey(e, i, j);
    let p = pointCache.get(key);
    if (p) return key;
    // The two texels the edge joins, a to b.
    const [ia, ja, ib, jb, va, vb] = e === 0 ? [i, j, i + 1, j, v[0], v[1]]
      : e === 1 ? [i + 1, j, i + 1, j + 1, v[1], v[2]]
        : e === 2 ? [i + 1, j + 1, i, j + 1, v[2], v[3]] : [i, j + 1, i, j, v[3], v[0]];
    const den = va - vb;
    const t = Math.abs(den) < 1e-9 ? 0.5 : Math.max(0, Math.min(1, va / den));
    p = [x0 + (ia + 0.5 + (ib - ia) * t) * texel, z0 + (ja + 0.5 + (jb - ja) * t) * texel];
    pointCache.set(key, p);
    return key;
  };
  const segs = [];
  for (let j = range.j0; j <= range.j1; j += 1) {
    for (let i = range.i0; i <= range.i1; i += 1) {
      const v = [val(i, j), val(i + 1, j), val(i + 1, j + 1), val(i, j + 1)];
      let mask = 0;
      for (let k = 0; k < 4; k += 1) if (v[k] >= 0) mask |= 1 << k;
      if (mask === 0 || mask === 15) continue;
      for (const [ea, eb] of CASES[mask]) {
        const ka = edgePt(ea, i, j, v); const kb = edgePt(eb, i, j, v);
        const pa = pointCache.get(ka); const pb = pointCache.get(kb);
        if (ka === kb) continue;
        if (coastSpineWaterWeight((pa[0] + pb[0]) * 0.5, (pa[1] + pb[1]) * 0.5, field) <= 0) continue;
        segs.push([ka, kb]);
      }
    }
  }
  // Chain the segments that share a cell edge into polylines.
  const adj = new Map();
  segs.forEach((s, idx) => { for (const k of s) { const l = adj.get(k); if (l) l.push(idx); else adj.set(k, [idx]); } });
  const used = new Uint8Array(segs.length);
  const chains = [];
  const walk = (startKey) => {
    const keys = [startKey];
    let cur = startKey;
    for (;;) {
      const nextSeg = (adj.get(cur) ?? []).find((s) => !used[s]);
      if (nextSeg === undefined) break;
      used[nextSeg] = 1;
      const s = segs[nextSeg];
      cur = s[0] === cur ? s[1] : s[0];
      keys.push(cur);
    }
    if (keys.length > 1) chains.push(keys.map((k) => pointCache.get(k)));
  };
  for (const [k, l] of adj) if (l.length === 1) walk(k); // the open ends first
  for (let s = 0; s < segs.length; s += 1) if (!used[s]) walk(segs[s][0]); // then any closed loop
  return chains;
}

/** A chain as arclength: `pointAt(s)` is the point at s metres along it. */
function arclength(chain) {
  const cum = [0];
  for (let k = 1; k < chain.length; k += 1) cum.push(cum[k - 1] + Math.hypot(chain[k][0] - chain[k - 1][0], chain[k][1] - chain[k - 1][1]));
  const total = cum[cum.length - 1];
  let seg = 0;
  const pointAt = (s) => {
    seg = Math.min(seg, chain.length - 2);
    while (seg > 0 && cum[seg] > s) seg -= 1;
    while (seg < chain.length - 2 && cum[seg + 1] < s) seg += 1;
    const span = cum[seg + 1] - cum[seg];
    const t = span > 0 ? (s - cum[seg]) / span : 0;
    return [chain[seg][0] + (chain[seg + 1][0] - chain[seg][0]) * t, chain[seg][1] + (chain[seg + 1][1] - chain[seg][1]) * t];
  };
  return { total, pointAt };
}

/**
 * Append the band to the decal's buffers: `positions` (x, y, z per vertex), `beachResponse` (x = 1, the beach look; y = the opacity the shader
 * multiplies in) and `indices`; `wetShelf` too (a 1 per vertex) when the caller keeps that attribute. Heights are the drawn sand's (`beachSection`,
 * the spine path while the field is active) plus `lift`, and never above the sheet at a knot whose front is positive (none is, today). Rows start `rowStep` m apart along
 * the contour and halve (to `maxSplit` times) wherever a chord between two rows stands off the drawn sand by more than `tol` at any of 7 points along it:
 * the shelf's triangles are flat between their edges, and the chord must not cut a kink. Returns the quads emitted.
 */
export function appendWetEdgeSpine(field, buffers, { spec = WET_EDGE_SPINE, beachOffset = COAST_SPINE.beachOffset, wetShelf = null, quality = 'high' } = {}) {
  const { positions, beachResponse, indices } = buffers;
  const knots = spec.knots;
  const K = knots.length;
  const drawn = drawnSandSurface(field, quality); // the shelf mesh as drawn; null (the section itself) if the field is not the active one
  const sandY = (x, z, sec) => { const y = drawn ? drawn.yAt(x, z) : NaN; return y === y ? y : sec.y; };
  const D = (x, z) => sampleCoastD(field, x, z) - beachOffset;
  const chains = traceFrontLine(field, spec.level, { beachOffset });
  const h = 0.5;
  let quads = 0;
  for (const chain of chains) {
    const arc = arclength(chain);
    if (!(arc.total > 0.05)) continue;
    // One row: the cross-section at arclength s, from the contour point along the field's gradient to each knot's front (a few secant steps).
    const rowAt = (s) => {
      const [px, pz] = arc.pointAt(s);
      const gx = (D(px + h, pz) - D(px - h, pz)) / (2 * h); const gz = (D(px, pz + h) - D(px, pz - h)) / (2 * h);
      const gl = Math.hypot(gx, gz);
      if (!(gl > 0.3)) return null;
      const ux = gx / gl; const uz = gz / gl;
      const row = { x: new Float64Array(K), z: new Float64Array(K), y: new Float64Array(K), a: new Float64Array(K), ids: new Int32Array(K).fill(-1) };
      for (let k = 0; k < K; k += 1) {
        let x = px; let z = pz;
        for (let it = 0; it < 4; it += 1) {
          const e = knots[k] - D(x, z);
          x += ux * e / gl; z += uz * e / gl;
          if (Math.abs(e) < 1e-4) break;
        }
        const sec = beachSection(x, z);
        row.x[k] = x; row.z[k] = z;
        const y = sandY(x, z, sec);
        row.y[k] = knots[k] > 0 ? Math.min(y + spec.lift, SEA_SHEET_Y) : y + spec.lift; // (every knot is under the sheet's zero; the clamp is for a spec that reaches past it)
        // The band does not draw where the sand draws its own north-east corner wetness: one minus the sand's corner mask (`cornerMaskAt`, the CPU twin of the shader's `cornerM`,
        // world x and z as the sand passes them), so the band fades over the mask's own 12 m feather and the corner keeps today's look (a corner rebuild is the shore's phase 4).
        row.a[k] = wetBandOpacity(knots[k], spec) * wetBandWeight(field, x, z) * (1 - cornerMaskAt(x, z));
      }
      return row;
    };
    const vertex = (row, k) => {
      if (row.ids[k] < 0) {
        row.ids[k] = positions.length / 3;
        positions.push(row.x[k], row.y[k], row.z[k]);
        beachResponse.push(1, row.a[k]);
        if (wetShelf) wetShelf.push(1);
      }
      return row.ids[k];
    };
    const emit = (ra, rb) => {
      for (let k = 0; k + 1 < K; k += 1) {
        // The quad's two triangles, a b c and b c d (a, b along the contour at one knot; c, d at the next): one whose opacity is under `dropBelow` at all three vertices is not emitted.
        const t1 = Math.max(ra.a[k], rb.a[k], ra.a[k + 1]) >= spec.dropBelow; const t2 = Math.max(rb.a[k], ra.a[k + 1], rb.a[k + 1]) >= spec.dropBelow;
        if (!t1 && !t2) continue;
        // The face looks up.
        const up = (ra.z[k + 1] - ra.z[k]) * (rb.x[k] - ra.x[k]) - (ra.x[k + 1] - ra.x[k]) * (rb.z[k] - ra.z[k]);
        if (t1) { const a = vertex(ra, k); const b = vertex(rb, k); const c = vertex(ra, k + 1); if (up > 0) indices.push(a, c, b); else indices.push(a, b, c); }
        if (t2) { const b = vertex(rb, k); const c = vertex(ra, k + 1); const d = vertex(rb, k + 1); if (up > 0) indices.push(b, c, d); else indices.push(b, d, c); }
        quads += 1;
      }
    };
    const span = (sa, ra, sb, rb, depth) => {
      if (!ra || !rb) return;
      if (depth < spec.maxSplit) {
        // The decal's own triangles over this span against the drawn sand: for each cell between two knots, 7 steps along the contour at 5 steps across
        // (0, 1/4, 1/2, 3/4, 1), the height of the triangle the point lies in (the quad splits on its b-c diagonal, as `emit` does) against the sand there plus
        // the lift. The shelf's triangles are flat between their edges, so the worst stand-off of a flat decal triangle is where it crosses one of them.
        let err = 0;
        for (let k = 0; k + 1 < K && err <= spec.tol; k += 1) {
          if (Math.max(ra.a[k], rb.a[k], ra.a[k + 1], rb.a[k + 1]) < spec.dropBelow) continue;
          for (let q = 1; q < 8 && err <= spec.tol; q += 1) {
            const t = q / 8;
            for (let r = 0; r < 5; r += 1) {
              const u = r / 4;
              const lower = t + u <= 1; // triangle (a, b, c) or (b, c, d)
              const w0 = lower ? 1 - t - u : t + u - 1; const wt = lower ? t : 1 - u; const wu = lower ? u : 1 - t; // weights of a|d, b|c, c|b
              const iA = lower ? [ra, k] : [rb, k + 1]; const iB = lower ? [rb, k] : [ra, k + 1]; const iC = lower ? [ra, k + 1] : [rb, k];
              const at = (arr) => iA[0][arr][iA[1]] * w0 + iB[0][arr][iB[1]] * wt + iC[0][arr][iC[1]] * wu;
              const x = at('x'); const z = at('z');
              const want = (drawn ? drawn.yAt(x, z) : beachSection(x, z).y) + spec.lift;
              if (want === want) err = Math.max(err, Math.abs(at('y') - want));
            }
          }
        }
        if (err > spec.tol) {
          const sm = (sa + sb) * 0.5;
          const rm = rowAt(sm);
          if (rm) { span(sa, ra, sm, rm, depth + 1); span(sm, rm, sb, rb, depth + 1); return; }
        }
      }
      emit(ra, rb);
    };
    const n = Math.max(1, Math.ceil(arc.total / spec.rowStep));
    let prev = rowAt(0);
    for (let r = 1; r <= n; r += 1) {
      const next = rowAt((r / n) * arc.total);
      span(((r - 1) / n) * arc.total, prev, (r / n) * arc.total, next, 0);
      prev = next;
    }
  }
  return quads;
}
