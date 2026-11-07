/**
 * taste W82 (TRACK_GATES, phase G3b part 2): the farm gateway, drawn at every split part 1 listed on `FringeLayer._trackGates`.
 *
 * The city's gate (civic/core.js) is a closed metal pedestrian gate in the civic palette; this is the fringe's own: two 0.18 m square
 * timber posts, 1.55 m above the ground and sunk 0.1 m, each on the run's line 0.15 m toward the gap from its end (so 7.3 m apart across
 * a square crossing, and 7.6 / sin(angle) - 0.3 m along the run at an oblique one), and two open leaves of 3.6 m by 1.15 m (five rails, a
 * hanging stile, a slamming stile, one diagonal brace from the hanging stile's foot to the slamming stile's head), each hung on its own
 * post with its lowest rail 0.15 m above the ground there and swung 100 degrees from closed to whichever side keeps it clear. If neither
 * side is clear a leaf of a fence (rail or parcel) lies back along the fence 0.2 m off its line; any other leaf is left off and counted
 * with its reason. A leaf is a parallelogram: the stiles stand upright and the rails follow the ground, lifted where it would otherwise
 * come within 0.05 m of the lowest rail. All the posts and leaves are one merged mesh (one draw call) in the post-and-rail fence's timber: the caller
 * draws it with `makeRailFenceMaterial()` (fringe/farm-models.js), and the vertex colours are the fence's own grey multipliers (`RAIL_FENCE_TONES`).
 * Part 1's list holds only fitted splits (both ends 3.6 to 4.2 m from the centreline, the centre within 0.5 m), so every entry gets its two posts. Nothing here runs unless TRACK_GATES is on.
 *
 * W82 fix 2: a gateway over two tracks (`g.pair`) has leaves of (post to post)/2 less 0.05 m, 3.6 to 4.8 m. A leaf that no swing clears lies back along a fence the gateway
 * merged (`g.merged`, a parcel or rail fence beside a hedge): hung 0.2 m off that fence's own end, along its line away from the gap. A post that stands in a hedge's, the
 * brow's or a windbreak's end is moved toward the gap until it is clear of it (`post.shift`). The timber of each gateway comes from `timberOf(g)` (the run it stands in).
 */
import * as THREE from 'three';
import { RAIL_FENCE_TONES as TONE } from './farm-models.js';

export const GATE_KIT = {
  postM: 0.18, postAbove: 1.55, postSink: 0.10, inM: 0.15,
  leafLen: 3.6, leafH: 1.15, lowRail: 0.15, swingDeg: 100, rails: 5,
  railH: 0.075, railT: 0.05, stileW: 0.08, stileT: 0.06, braceW: 0.06, braceT: 0.04,
  trackClear: 3.4, objClear: 0.3, groundClear: 0.05, leafHalfT: 0.05, backOff: 0.2, maxTris: 200,
  leafMax: 4.8, postClear: 0.1, leafPostClear: 0.05, postShiftMax: 1.0, mergeReach: 6,
  // W83 (item 1): a run-out keeps `runOutClear` off every planted and crest tree's own trunk (its triangles within 1.6 m of the root, FringeLayer._gateTrunkTris), and a shrub or tuft planted after the gating
  // is dropped when its footprint comes within `runOutClear` of a drawn run-out.
  runOutClear: 0.3,
  // W83 (part 3): the area a leaf sweeps from closed to open (a sector of the leaf's length about its hinge) keeps `sweepClear` off every shrub, tuft and trunk (the leaf's half thickness counted)
  sweepClear: 0.1,
};
const HEDGE_KINDS = new Set(['hedge', 'brow', 'windbreak']);
const FENCE_KINDS = new Set(['rail-fence', 'parcel-fence']);

// ---------- 2D distances ----------
function segSegDist(p, q, r, s) {
  const ox = q[0] - p[0]; const oz = q[1] - p[1]; const ex = s[0] - r[0]; const ez = s[1] - r[1];
  const den = ox * ez - oz * ex;
  if (Math.abs(den) > 1e-12) {
    const t = ((r[0] - p[0]) * ez - (r[1] - p[1]) * ex) / den; const u = ((r[0] - p[0]) * oz - (r[1] - p[1]) * ox) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  const pd = (a, b0, b1) => {
    const dx = b1[0] - b0[0]; const dz = b1[1] - b0[1];
    const u = Math.max(0, Math.min(1, ((a[0] - b0[0]) * dx + (a[1] - b0[1]) * dz) / (dx * dx + dz * dz || 1e-12)));
    return Math.hypot(a[0] - b0[0] - dx * u, a[1] - b0[1] - dz * u);
  };
  return Math.min(pd(p, r, s), pd(q, r, s), pd(r, p, q), pd(s, p, q));
}
function inTri(x, z, t) {
  const d = (t.x1 - t.x0) * (t.z2 - t.z0) - (t.x2 - t.x0) * (t.z1 - t.z0);
  if (Math.abs(d) < 1e-12) return false;
  const a = ((x - t.x0) * (t.z2 - t.z0) - (t.x2 - t.x0) * (z - t.z0)) / d;
  const b = ((t.x1 - t.x0) * (z - t.z0) - (x - t.x0) * (t.z1 - t.z0)) / d;
  return a >= 0 && b >= 0 && a + b <= 1;
}
export function segTriDist(p, q, t) {
  if (inTri(p[0], p[1], t) || inTri(q[0], q[1], t)) return 0;
  const A = [t.x0, t.z0]; const B = [t.x1, t.z1]; const C = [t.x2, t.z2];
  return Math.min(segSegDist(p, q, A, B), segSegDist(p, q, B, C), segSegDist(p, q, C, A));
}

// W83 (part 3): the area a leaf sweeps, a sector (apex P, radius R, from unit c0 to unit d through the side sv; 180 degrees or less, so convex), and its plan distance to a triangle.
export function sectorDist(x, z, S) { // from a point to the sector
  const vx = x - S.P[0]; const vz = z - S.P[1]; const len = Math.hypot(vx, vz);
  const cr = S.c0[0] * S.d[1] - S.c0[1] * S.d[0];
  // a half turn (a `back` leaf, closed to its opposite): the side `sv` names. A leaf record keeps `dir` to 4 decimals, so its cross product with `closed` is not 0 but up to about 1e-4 (5.4e-6 at (-426.73, 161.69), seed 0): within 1e-3 (0.06 degree, 4 mm at the longest leaf) it is the half turn, else the sign of the product would name the side opposite `sv`
  const inside = Math.abs(cr) < 1e-3 ? vx * S.sv[0] + vz * S.sv[1] >= 0 : (S.c0[0] * vz - S.c0[1] * vx) * Math.sign(cr) >= 0 && (vx * S.d[1] - vz * S.d[0]) * Math.sign(cr) >= 0;
  if (inside) return Math.max(0, len - S.R);
  const ray = (u) => { const t = Math.max(0, Math.min(S.R, vx * u[0] + vz * u[1])); return Math.hypot(vx - u[0] * t, vz - u[1] * t); };
  return Math.min(ray(S.c0), ray(S.d));
}
export function sectorTriDist(S, T) {
  if (inTri(S.P[0], S.P[1], T)) return 0;
  const V = [[T.x0, T.z0], [T.x1, T.z1], [T.x2, T.z2]]; let best = Infinity;
  for (let i = 0; i < 3; i += 1) {
    const A = V[i]; const B = V[(i + 1) % 3]; let lo = 0; let hi = 1;
    for (let k = 0; k < 36; k += 1) { // the distance to a convex set is convex along an edge: ternary search
      const m1 = lo + (hi - lo) / 3; const m2 = hi - (hi - lo) / 3;
      if (sectorDist(A[0] + (B[0] - A[0]) * m1, A[1] + (B[1] - A[1]) * m1, S) < sectorDist(A[0] + (B[0] - A[0]) * m2, A[1] + (B[1] - A[1]) * m2, S)) hi = m2; else lo = m1;
    }
    best = Math.min(best, sectorDist(A[0] + (B[0] - A[0]) * lo, A[1] + (B[1] - A[1]) * lo, S), sectorDist(A[0], A[1], S));
  }
  return best;
}

// ---------- the drawn things a leaf must keep off ----------
const OBSTACLE_MESHES = [
  ['hedge', /^fringe:hinterland-hedges$/], ['brow', /^fringe:hinterland-rim-brow$/], ['windbreak', /^fringe:hinterland-windbreaks$/],
  ['rail-fence', /^fringe:hinterland-fences$/], ['parcel-fence', /^fringe:hinterland-parcel-fences$/], ['wall', /^fringe:hinterland-walls(-tumbled)?$/],
  ['bale', /^fringe:hinterland-bales$/], ['shrub', /^fringe:hinterland-(shrub|paddock-shrubs)$/], ['trunk', /^fringe:(trees|crest)-[ae](:variant-\d)?$/], ['tuft', /^fringe:hinterland-(tussock|paddock-tufts)$/],
  ['windrow', /^fringe:hinterland-windrows$/], ['scrub', /^fringe:hinterland-scrub$/], ['shed', /^fringe:hinterland-sheds/],
];
/**
 * The world-space triangles (projected on the ground plane, with their height range) of the hedges, the brow, the windbreaks, the rail
 * and parcel fences, the walls, the bales, the shrubs, the sheds and the tree trunks (the instance's triangles within 1.6 m of its
 * root), in a 4 m grid. `query(x0, z0, x1, z1)` returns the triangles whose box meets the rectangle.
 */
export function collectGateObstacles(root) {
  const tris = [];
  const m = new THREE.Matrix4(); const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const hit = OBSTACLE_MESHES.find(([, re]) => re.test(o.name));
    if (!hit) return;
    const kind = hit[0];
    const pos = o.geometry.attributes.position; const idx = o.geometry.index; const nT = (idx ? idx.count : pos.count) / 3;
    let baseY = Infinity;
    if (kind === 'trunk') for (let i = 0; i < pos.count; i += 1) baseY = Math.min(baseY, pos.getY(i));
    const n = o.isInstancedMesh ? o.count : 1;
    for (let k = 0; k < n; k += 1) {
      if (o.isInstancedMesh) { o.getMatrixAt(k, m); if (m.elements[0] === 0 && m.elements[5] === 0 && m.elements[10] === 0) continue; /* W83: a dropped instance */ m.premultiply(o.matrixWorld); } else m.copy(o.matrixWorld);
      const sy = Math.hypot(m.elements[4], m.elements[5], m.elements[6]) || 1;
      const cut = kind === 'trunk' ? baseY + 1.6 / sy : Infinity;
      for (let t = 0; t < nT; t += 1) {
        const i0 = idx ? idx.getX(t * 3) : t * 3; const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1; const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        if (kind === 'trunk' && Math.min(pos.getY(i0), pos.getY(i1), pos.getY(i2)) > cut) continue;
        a.fromBufferAttribute(pos, i0).applyMatrix4(m); b.fromBufferAttribute(pos, i1).applyMatrix4(m); c.fromBufferAttribute(pos, i2).applyMatrix4(m);
        tris.push({ k: kind, n: o.name, x0: a.x, z0: a.z, x1: b.x, z1: b.z, x2: c.x, z2: c.z, y0: Math.min(a.y, b.y, c.y), y1: Math.max(a.y, b.y, c.y),
          bx0: Math.min(a.x, b.x, c.x), bx1: Math.max(a.x, b.x, c.x), bz0: Math.min(a.z, b.z, c.z), bz1: Math.max(a.z, b.z, c.z) });
      }
    }
  });
  const CELL = 4; const grid = new Map();
  const key = (gx, gz) => (gx + 16384) * 32768 + (gz + 16384);
  for (const t of tris) for (let gx = Math.floor(t.bx0 / CELL); gx <= Math.floor(t.bx1 / CELL); gx += 1) for (let gz = Math.floor(t.bz0 / CELL); gz <= Math.floor(t.bz1 / CELL); gz += 1) {
    const kk = key(gx, gz); const l = grid.get(kk); if (l) l.push(t); else grid.set(kk, [t]);
  }
  const query = (x0, z0, x1, z1) => {
    const out = new Set();
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx += 1) for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz += 1) for (const t of grid.get(key(gx, gz)) ?? []) out.add(t);
    return [...out];
  };
  return { count: tris.length, query };
}

// ---------- the merged mesh ----------
class Merge {
  constructor() { this.p = []; this.n = []; this.c = []; this.i = []; this.v = 0; this.tris = 0; }
  quad(P, nrm, cols) {
    const base = this.v;
    for (let k = 0; k < 4; k += 1) { this.p.push(P[k][0], P[k][1], P[k][2]); this.n.push(nrm[0], nrm[1], nrm[2]); this.c.push(cols[k][0], cols[k][1], cols[k][2]); }
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.v += 4; this.tris += 2;
  }
  /** A box, `map(a, b, t)` taking its three unit-box parameters to the world; `skip` names the faces left out (t0 t1 u0 u1 y0 y1). */
  box(map, ra, rb, rt, c0, c1, skip = []) {
    const co = (ia, ib, it) => map(ia ? ra[1] : ra[0], ib ? rb[1] : rb[0], it ? rt[1] : rt[0]);
    const cl = (ib) => (ib ? c1 : c0);
    const ctr = [0, 0, 0];
    for (let ia = 0; ia < 2; ia += 1) for (let ib = 0; ib < 2; ib += 1) for (let it = 0; it < 2; it += 1) { const q = co(ia, ib, it); ctr[0] += q[0] / 8; ctr[1] += q[1] / 8; ctr[2] += q[2] / 8; }
    const faces = {
      t0: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], t1: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
      u0: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], u1: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]],
      y0: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], y1: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]],
    };
    for (const [name, cs] of Object.entries(faces)) {
      if (skip.includes(name)) continue;
      let P = cs.map(([ia, ib, it]) => co(ia, ib, it)); let C = cs.map(([, ib]) => cl(ib));
      const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]]; const e2 = [P[3][0] - P[0][0], P[3][1] - P[0][1], P[3][2] - P[0][2]];
      let nr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const fc = [(P[0][0] + P[2][0]) / 2, (P[0][1] + P[2][1]) / 2, (P[0][2] + P[2][2]) / 2];
      if (nr[0] * (fc[0] - ctr[0]) + nr[1] * (fc[1] - ctr[1]) + nr[2] * (fc[2] - ctr[2]) < 0) { P = [P[0], P[3], P[2], P[1]]; C = [C[0], C[3], C[2], C[1]]; nr = [-nr[0], -nr[1], -nr[2]]; }
      const l = Math.hypot(nr[0], nr[1], nr[2]) || 1;
      this.quad(P, [nr[0] / l, nr[1] / l, nr[2] / l], C);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    return g;
  }
}

/**
 * Builds the gateways. `gates` is part 1's list (`{ kind, a, b, run, track, at }`), `trackSegs` the track lines (`[x0, z0, x1, z1]`),
 * `obstacles` from `collectGateObstacles`, `sampleGround(x, z)`, and `timber` the linear RGB of the posts and leaves (fence timber token,
 * gain and tint already in). Returns `{ geometry, report }`; `report.gateways[i]` has the posts, the leaves (mode, side, direction, shear,
 * or the reason one is left off) and the gateway's triangles.
 */
export function buildTrackGates(gates, { trackSegs, obstacles, sampleGround, timberOf = null }) {
  const K = GATE_KIT; const M = new Merge();
  let tb = { base: [1, 1, 1], tones: TONE }; // the current gateway's timber: the linear colour and the grey multipliers of the fence it stands in
  const tone = (f) => tb.base.map((v) => v * f);
  const rad = (K.swingDeg * Math.PI) / 180;
  const report = { gateways: [], left: [], rejected: [], leaves: 0, posts: 0, swing: 0, back: 0, shearMax: 0, sweepBlocked: 0 };
  const trackNear = (p, q, lim) => trackSegs.filter((s) => Math.max(s[0], s[2]) > Math.min(p[0], q[0]) - lim && Math.min(s[0], s[2]) < Math.max(p[0], q[0]) + lim
    && Math.max(s[1], s[3]) > Math.min(p[1], q[1]) - lim && Math.min(s[1], s[3]) < Math.max(p[1], q[1]) + lim);

  gates.forEach((g, gi) => {
    const L = Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]);
    const r = [(g.b[0] - g.a[0]) / L, (g.b[1] - g.a[1]) / L]; const nrm = [-r[1], r[0]];
    const gw = { i: gi, kind: g.kind, at: g.at, posts: [], leaves: [], tris: 0, pair: !!g.pair };
    const t0 = M.tris;
    tb = timberOf ? timberOf(g) : { base: [1, 1, 1], tones: TONE };
    const TN = tb.tones;
    const ends = [
      { e: g.a, post: [g.a[0] + r[0] * K.inM, g.a[1] + r[1] * K.inM], closed: [r[0], r[1]], w: [-r[0], -r[1]], into: r },
      { e: g.b, post: [g.b[0] - r[0] * K.inM, g.b[1] - r[1] * K.inM], closed: [-r[0], -r[1]], w: [r[0], r[1]], into: [-r[0], -r[1]] },
    ];
    // W83: how far a post at E.post must move toward the gap to stand `clear` m (its corner circle, 0.09 x sqrt 2 out of the centre) off every hedge, brow or windbreak triangle
    // near it: 0 where it is clear already, `step` m at a time; null if no shift of up to postShiftMax clears it.
    const hedgeShift = (E, clear, step) => {
      const hedgeNear = obstacles.query(E.post[0] - 3, E.post[1] - 3, E.post[0] + 3, E.post[1] + 3).filter((T) => HEDGE_KINDS.has(T.k));
      if (!hedgeNear.length) return 0;
      const gy0 = sampleGround(E.post[0], E.post[1]);
      const clearAt = (px, pz) => hedgeNear.every((T) => T.y0 > gy0 + K.postAbove || T.y1 < gy0 || segTriDist([px, pz], [px, pz], T) >= K.postM * Math.SQRT1_2 + clear);
      let shift = 0;
      while (!clearAt(E.post[0] + E.into[0] * shift, E.post[1] + E.into[1] * shift) && shift < K.postShiftMax) shift += step;
      return clearAt(E.post[0] + E.into[0] * shift, E.post[1] + E.into[1] * shift) ? shift : null;
    };
    // W83: a post that carries a leaf stands 0.05 m clear of a hedge, brow or windbreak end (`hp` is where the leaf is hung); one that carries none keeps its 0.1 m (below)
    for (const E of ends) { const sh = hedgeShift(E, K.leafPostClear, 0.01); E.lshift = sh ?? 0; E.hp = [E.post[0] + E.into[0] * E.lshift, E.post[1] + E.into[1] * E.lshift]; }
    const leafLen = g.pair ? Math.min(K.leafMax, Math.max(K.leafLen, (L - 2 * K.inM - ends[0].lshift - ends[1].lshift) / 2 - 0.05)) : K.leafLen;
    // leaves: every candidate of both leaves is evaluated first (W83), then chosen
    const candsOf = ends.map((E) => {
      const cands = []; const why = [];
      for (const sg of [1, -1]) {
        const d = [E.closed[0] * Math.cos(rad) + sg * nrm[0] * Math.sin(rad), E.closed[1] * Math.cos(rad) + sg * nrm[1] * Math.sin(rad)];
        cands.push({ mode: 'swing', side: sg, d, hinge: E.hp, sv: [sg * nrm[0], sg * nrm[1]] });
      }
      if (FENCE_KINDS.has(g.kind)) for (const sg of [1, -1]) cands.push({ mode: 'back', side: sg, d: E.w, hinge: [E.hp[0] + nrm[0] * sg * K.backOff, E.hp[1] + nrm[1] * sg * K.backOff], closed: E.closed, sv: [sg * nrm[0], sg * nrm[1]] });
      for (const mr of (g.merged ?? []).filter((q) => FENCE_KINDS.has(q.kind))) { // W82 fix 2: a fence the gateway merged: a leaf the swing cannot clear lies back along it, hung off the fence's own end
        const dA = Math.hypot(mr.a[0] - E.hp[0], mr.a[1] - E.hp[1]); const dB = Math.hypot(mr.b[0] - E.hp[0], mr.b[1] - E.hp[1]);
        const atA = dA <= dB; const e = atA ? mr.a : mr.b; if (Math.min(dA, dB) > K.mergeReach) continue;
        const w = atA ? [-mr.run[0], -mr.run[1]] : [mr.run[0], mr.run[1]]; const nm = [-w[1], w[0]];
        for (const sg of [1, -1]) cands.push({ mode: 'back', side: sg, d: w, hinge: [e[0] + nm[0] * sg * K.backOff, e[1] + nm[1] * sg * K.backOff], closed: [-w[0], -w[1]], own: { kind: mr.kind, e, w, n: nm }, merged: true, sv: [sg * nm[0], sg * nm[1]] });
      }
      for (const cd of cands) {
        const P = cd.hinge; const d = cd.d; const Q = [P[0] + d[0] * leafLen, P[1] + d[1] * leafLen];
        // the ground along the leaf, the lowest rail's shear (rise per metre along the leaf)
        const hy = sampleGround(P[0], P[1]); const dn = [-d[1], d[0]];
        let mReq = -Infinity;
        for (let s = 0.15; s <= leafLen + 1e-9; s += 0.15) for (const tt of [-0.04, 0, 0.04]) {
          const gs = sampleGround(P[0] + d[0] * s + dn[0] * tt, P[1] + d[1] * s + dn[1] * tt);
          mReq = Math.max(mReq, (gs - hy - (K.lowRail - K.groundClear)) / s);
        }
        const chord = (sampleGround(Q[0], Q[1]) - hy) / leafLen;
        cd.m = Math.max(mReq, chord); cd.hy = hy;
        // the centreline of the track
        let block = null;
        for (const sgm of trackNear(P, Q, K.trackClear + 1)) if (segSegDist(P, Q, [sgm[0], sgm[1]], [sgm[2], sgm[3]]) - K.leafHalfT < K.trackClear) { block = 'track'; break; }
        if (!block) {
          const yLo = hy + K.lowRail + Math.min(0, cd.m * leafLen) - K.objClear; const yHi = hy + K.lowRail + K.leafH + Math.max(0, cd.m * leafLen) + K.objClear;
          for (const T of obstacles.query(Math.min(P[0], Q[0]) - 0.5, Math.min(P[1], Q[1]) - 0.5, Math.max(P[0], Q[0]) + 0.5, Math.max(P[1], Q[1]) + 0.5)) {
            if (T.y0 > yHi || T.y1 < yLo || T.k === 'tuft') continue; // a tuft is tested with the leaf's sweep below
            const own = cd.own ?? { kind: g.kind, e: E.e, w: E.w, n: nrm };
            if (T.k === own.kind) { // the run the leaf is hung on: what lies behind its end, close to its line
              const ok = [[T.x0, T.z0], [T.x1, T.z1], [T.x2, T.z2]].every(([x, z]) => (x - own.e[0]) * own.w[0] + (z - own.e[1]) * own.w[1] >= -0.35 && Math.abs((x - own.e[0]) * own.n[0] + (z - own.e[1]) * own.n[1]) <= 2.0);
              if (ok) continue;
            }
            if (segTriDist(P, Q, T) - K.leafHalfT < K.objClear) { block = T.k; break; }
          }
        }
        if (!block) { // W83 (part 3): the swept area, from closed to open, within `sweepClear` of a trunk
          const S = { P, R: leafLen, c0: cd.closed ?? E.closed, d, sv: cd.sv };
          const yLo2 = hy + K.lowRail + Math.min(0, cd.m * leafLen) - K.objClear; const yHi2 = hy + K.lowRail + K.leafH + Math.max(0, cd.m * leafLen) + K.objClear;
          for (const T of obstacles.query(P[0] - leafLen - 0.5, P[1] - leafLen - 0.5, P[0] + leafLen + 0.5, P[1] + leafLen + 0.5)) {
            if (T.k !== 'trunk') continue; // a shrub or tuft in the sweep is dropped after the kit (fringe.js), a trunk cannot be
            if (T.y0 > yHi2 || T.y1 < yLo2) continue;
            if (Math.hypot(Math.max(T.bx0 - P[0], 0, P[0] - T.bx1), Math.max(T.bz0 - P[1], 0, P[1] - T.bz1)) > leafLen + K.sweepClear + K.leafHalfT) continue;
            if (sectorTriDist(S, T) - K.leafHalfT < K.sweepClear) { block = T.k; cd.sweepOnly = true; break; }
          }
        }
        cd.block = block;
        if (block) why.push(`${cd.mode}${cd.side > 0 ? '+' : '-'}:${block}`);
      }
      return { cands, why };
    });
    report.sweepBlocked += candsOf.reduce((t, q) => t + q.cands.filter((c) => c.sweepOnly).length, 0);
    const freeSwings = candsOf.map((q) => q.cands.filter((c) => !c.block && c.mode === 'swing'));
    // W83: where both leaves can swing either way clear they open to the same side along the track (the side with the lesser sum of shears); otherwise as before
    const bothFree = freeSwings.every((l) => l.length === 2);
    let oneSide = 0;
    if (bothFree) { const tot = (sg) => freeSwings.reduce((t, l) => t + Math.abs(l.find((c) => c.side === sg).m), 0); oneSide = tot(1) <= tot(-1) ? 1 : -1; }
    gw.bothFree = bothFree;
    let firstSide = 0;
    for (let li = 0; li < 2; li += 1) {
      const E = ends[li]; const { cands, why } = candsOf[li];
      const ok = cands.filter((c) => !c.block);
      const pick = (list) => list.slice().sort((p, q) => Math.abs(p.m) - Math.abs(q.m) || (q.side === firstSide ? 1 : 0) - (p.side === firstSide ? 1 : 0) || q.side - p.side)[0];
      const swings = ok.filter((c) => c.mode === 'swing');
      let sel = null;
      if (bothFree) sel = swings.find((c) => c.side === oneSide);
      else if (swings.length) {
        const same = swings.find((c) => c.side === firstSide && Math.abs(c.m - Math.min(...swings.map((q) => Math.abs(q.m)))) < 0.02);
        sel = same ?? pick(swings);
      } else if (ok.length) sel = pick(ok);
      if (!sel) {
        const rec = { post: li, kind: g.kind, at: g.at, reason: why.join(' ') };
        gw.leaves.push({ post: li, mode: 'off', reason: rec.reason }); report.left.push({ gateway: gi, ...rec });
        continue;
      }
      if (!firstSide) firstSide = sel.side;
      const { d, hinge: P, hy } = sel; const dn = [-d[1], d[0]]; const m = sel.m;
      const map = (u, y, t) => [P[0] + d[0] * u + dn[0] * t, hy + y + m * u, P[1] + d[1] * u + dn[1] * t];
      const Ln = leafLen; const y0 = K.lowRail; const y1 = K.lowRail + K.leafH;
      const stH = K.stileT / 2; const rtH = K.railT / 2;
      const lv0 = M.v;
      M.box(map, [0, K.stileW], [y0, y1], [-stH, stH], tone(TN.postFoot), tone(TN.postHead), ['y0']); // hanging stile
      M.box(map, [Ln - K.stileW, Ln], [y0, y1], [-stH, stH], tone(TN.postFoot), tone(TN.postHead), ['y0']); // slamming stile
      for (let k = 0; k < K.rails; k += 1) {
        const yb = y0 + (k * (K.leafH - K.railH)) / (K.rails - 1);
        M.box(map, [K.stileW, Ln - K.stileW], [yb, yb + K.railH], [-rtH, rtH], tone(TN.rail), tone(TN.rail), ['u0', 'u1']);
      }
      { // the brace, hanging stile's foot to slamming stile's head
        const A = [K.stileW, y0]; const B = [Ln - K.stileW, y1]; const dl = Math.hypot(B[0] - A[0], B[1] - A[1]);
        const D = [(B[0] - A[0]) / dl, (B[1] - A[1]) / dl]; const Pp = [-D[1], D[0]];
        const bmap = (a, b, t) => map(A[0] + D[0] * a + Pp[0] * b, A[1] + D[1] * a + Pp[1] * b, t);
        M.box(bmap, [0, dl], [-K.braceW / 2, K.braceW / 2], [-K.braceT / 2, K.braceT / 2], tone(TN.stayFoot), tone(TN.stayHead));
      }
      gw.leaves.push({ post: li, mode: sel.mode, sv: sel.sv, merged: !!sel.merged, closed: sel.closed ?? E.closed, len: +leafLen.toFixed(3), side: sel.side, dir: [+d[0].toFixed(4), +d[1].toFixed(4)], hinge: [+P[0].toFixed(3), +P[1].toFixed(3)], hy, shear: +m.toFixed(4), tip: [P[0] + d[0] * Ln, P[1] + d[1] * Ln], vr: [lv0, M.v] });
      report.leaves += 1; report[sel.mode] += 1; report.shearMax = Math.max(report.shearMax, Math.abs(m));
    }
    // posts: 0.18 m square, the shaft top 1.55 m above the ground at its centre, the foot sunk 0.1 m. Drawn after the leaves: a post with a leaf stands 0.05 m clear of a hedge's, the brow's or a windbreak's end (W83: the leaf is hung on it there); a post with no leaf (posts only) is moved toward the gap until it is 0.1 m clear.
    ends.forEach((E, ei) => {
      const into = E.into; // toward the gap
      // a post that carries a leaf stands where the leaf is hung (`hp`, 0.05 m clear); one with none is moved on until it is 0.1 m clear
      const shift = gw.leaves[ei]?.mode === 'off' ? (hedgeShift(E, K.postClear, 0.05) ?? 0) : E.lshift;
      const post = [E.post[0] + into[0] * shift, E.post[1] + into[1] * shift];
      const gy = sampleGround(post[0], post[1]);
      const map = (u, y, t) => [post[0] + r[0] * u + nrm[0] * t, gy + y, post[1] + r[1] * u + nrm[1] * t];
      const h = K.postM / 2; const pv0 = M.v;
      M.box(map, [-h, h], [-K.postSink, K.postAbove], [-h, h], tone(TN.postFoot), tone(TN.postHead), ['y0']);
      gw.posts.push({ x: post[0], z: post[1], y: gy, top: gy + K.postAbove, foot: gy - K.postSink, end: E.e, shift: +shift.toFixed(2), leaf: gw.leaves[ei]?.mode !== 'off', vr: [pv0, M.v] });
      report.posts += 1;
    });
    gw.tris = M.tris - t0;
    report.gateways.push(gw);
  });
  report.tris = M.tris; report.maxTrisPerGateway = report.gateways.reduce((t, w) => Math.max(t, w.tris), 0);
  return { geometry: M.tris ? M.geometry() : null, report };
}
