// Farm models for the hinterland: cattle, sheep, sheds, bales, fences, dry-stone walls and the dam bank.
//
// Pure geometry builders: no scene access, no globals, deterministic (the same arguments give
// byte-identical buffers). Every function returns one merged, indexed BufferGeometry with
// `position`, `normal` and `color`. Dimensions are real metres; the caller places instances at
// scale 1 (or a small variation) and grounds them on the lowest vertices of the geometry.
//
// Vertex colour contract, per model (the materials are made at the call sites in fringe.js):
//   stock, bale, fence, wall : a multiplier around 1.0 (occlusion and part tone) on top of the
//                              instance colour or the material colour;
//   shed                     : real linear colours from the taste tokens (as the old shed did),
//                              taken down by the fringe lighting gain, times occlusion;
//   dam bank                 : real linear colours handed in by the caller.
import * as THREE from 'three';
import { TASTE } from '../taste-tokens.js';

const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ */
/* Mesher: accumulates vertices, colours and triangles                  */
/* ------------------------------------------------------------------ */

class Mesher {
  constructor() { this.pos = []; this.col = []; this.idx = []; }

  get count() { return this.pos.length / 3; }

  v(x, y, z, c) {
    this.pos.push(x, y, z);
    this.col.push(c[0], c[1], c[2]);
    return this.count - 1;
  }

  t(a, b, c) { this.idx.push(a, b, c); }

  q(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }

  /**
   * Run `fn`, then make the triangles it emitted face outward. A part is judged by the
   * area-weighted sign of (face normal . face centre - part centre), which is right for
   * convex and gently bent solids (limbs, barrels, boxes, frusta).
   */
  solid(fn) {
    const start = this.idx.length;
    fn();
    const end = this.idx.length;
    let cx = 0, cy = 0, cz = 0, n = 0;
    const seen = new Set();
    for (let i = start; i < end; i += 1) {
      const k = this.idx[i];
      if (seen.has(k)) continue;
      seen.add(k);
      cx += this.pos[k * 3]; cy += this.pos[k * 3 + 1]; cz += this.pos[k * 3 + 2]; n += 1;
    }
    if (!n) return;
    cx /= n; cy /= n; cz /= n;
    let score = 0;
    for (let i = start; i < end; i += 3) {
      const a = this.idx[i] * 3, b = this.idx[i + 1] * 3, c = this.idx[i + 2] * 3;
      const ux = this.pos[b] - this.pos[a], uy = this.pos[b + 1] - this.pos[a + 1], uz = this.pos[b + 2] - this.pos[a + 2];
      const vx = this.pos[c] - this.pos[a], vy = this.pos[c + 1] - this.pos[a + 1], vz = this.pos[c + 2] - this.pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const mx = (this.pos[a] + this.pos[b] + this.pos[c]) / 3 - cx;
      const my = (this.pos[a + 1] + this.pos[b + 1] + this.pos[c + 1]) / 3 - cy;
      const mz = (this.pos[a + 2] + this.pos[b + 2] + this.pos[c + 2]) / 3 - cz;
      score += nx * mx + ny * my + nz * mz;
    }
    if (score < 0) {
      for (let i = start; i < end; i += 3) {
        const tmp = this.idx[i + 1];
        this.idx[i + 1] = this.idx[i + 2];
        this.idx[i + 2] = tmp;
      }
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const grey = (t) => [t, t, t];
const mul = (c, t) => [c[0] * t, c[1] * t, c[2] * t];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const linear = (hex, k = 1) => { const c = new THREE.Color(hex); return [c.r * k, c.g * k, c.b * k]; };

/** A small deterministic generator (mulberry32). */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/* ------------------------------------------------------------------ */
/* Primitives                                                           */
/* ------------------------------------------------------------------ */

/**
 * A box or frustum standing on y = cy: base half extents (hx0, hz0), top half extents
 * (hx1, hz1), height h, top offset (ox, oz), rotated by yaw about Y. Hard edges. Options:
 * `bottom` (default false) closes the underside, `top` (default true) closes the top.
 */
function frustum(m, cx, cy, cz, hx0, hz0, hx1, hz1, h, c0, c1, o = {}) {
  const yaw = o.yaw ?? 0, ox = o.ox ?? 0, oz = o.oz ?? 0;
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const at = (x, y, z) => [cx + x * cs + z * sn, cy + y, cz - x * sn + z * cs];
  const ring = (hx, hz, y, dx, dz) => [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([x, z]) => at(x + dx, y, z + dz));
  const B = ring(hx0, hz0, 0, 0, 0);
  const T = ring(hx1, hz1, h, ox, oz);
  m.solid(() => {
    for (let k = 0; k < 4; k += 1) {
      const k2 = (k + 1) % 4;
      const a = m.v(B[k][0], B[k][1], B[k][2], c0);
      const b = m.v(B[k2][0], B[k2][1], B[k2][2], c0);
      const c = m.v(T[k2][0], T[k2][1], T[k2][2], c1);
      const d = m.v(T[k][0], T[k][1], T[k][2], c1);
      m.q(a, b, c, d);
    }
    if (o.top !== false) m.q(...T.map((p) => m.v(p[0], p[1], p[2], c1)));
    if (o.bottom) m.q(...B.map((p) => m.v(p[0], p[1], p[2], c0)));
  });
}

/** An oriented box between two points: used for beams, rails, braces and stays. */
function beam(m, p0, p1, ha, hb, c0, c1 = c0, ref = [0, 0, 1], o = {}) {
  tube(m, [{ p: p0, a: ha, b: hb, c: c0 }, { p: p1, a: ha, b: hb, c: c1 }], { ref, sides: 4, capStart: o.capStart ?? true, capEnd: o.capEnd ?? true });
}

/**
 * A tube through points. Each point: { p: [x,y,z], a, b, c } where a and b are the half
 * extents across the tube and c is a vertex colour. The frame is built from the path tangent
 * and `ref`. `sides` 4 gives a box section aligned to the frame, 5+ a rounded section.
 */
function tube(m, pts, o = {}) {
  const sides = o.sides ?? 4;
  const ref0 = o.ref ?? [0, 0, 1];
  const rings = [];
  for (let i = 0; i < pts.length; i += 1) {
    const prev = pts[Math.max(0, i - 1)].p, next = pts[Math.min(pts.length - 1, i + 1)].p;
    // `flatEnd`: the last ring lies level, so a foot ends flat on y whatever the leg's lean.
    const T = o.flatEnd && i === pts.length - 1 ? [0, -1, 0] : norm(sub(next, prev));
    let ref = ref0;
    if (Math.abs(T[0] * ref[0] + T[1] * ref[1] + T[2] * ref[2]) > 0.95) ref = [1, 0, 0];
    const A = norm(cross(T, ref));
    const B = cross(T, A);
    const pt = pts[i];
    const verts = [];
    for (let k = 0; k < sides; k += 1) {
      let u, w;
      if (sides === 4) { [u, w] = [[1, 1], [1, -1], [-1, -1], [-1, 1]][k]; } else { const ang = (k / sides) * TAU; u = Math.cos(ang); w = Math.sin(ang); }
      verts.push([
        pt.p[0] + A[0] * u * pt.a + B[0] * w * pt.b,
        pt.p[1] + A[1] * u * pt.a + B[1] * w * pt.b,
        pt.p[2] + A[2] * u * pt.a + B[2] * w * pt.b,
      ]);
    }
    rings.push({ verts, c: pt.c });
  }
  m.solid(() => {
    const ids = rings.map((r) => r.verts.map((p) => m.v(p[0], p[1], p[2], r.c)));
    for (let i = 0; i < ids.length - 1; i += 1) {
      for (let k = 0; k < sides; k += 1) { const k2 = (k + 1) % sides; m.q(ids[i][k], ids[i][k2], ids[i + 1][k2], ids[i + 1][k]); }
    }
    const cap = (r) => {
      const ctr = r.verts.reduce((s, p) => [s[0] + p[0] / sides, s[1] + p[1] / sides, s[2] + p[2] / sides], [0, 0, 0]);
      const cc = mul(r.c, 0.92);
      const ci = m.v(ctr[0], ctr[1], ctr[2], cc);
      const vi = r.verts.map((p) => m.v(p[0], p[1], p[2], cc));
      for (let k = 0; k < sides; k += 1) m.t(ci, vi[k], vi[(k + 1) % sides]);
    };
    if (o.capStart !== false) cap(rings[0]);
    if (o.capEnd !== false) cap(rings[rings.length - 1]);
  });
}

/**
 * A lofted body: rings of an eight-sided section swept along a path in the XY plane (the
 * animal's side view), each with its own pitch. Ring: { x, y, w, hu, hd, pitch, a, b, c, tone }.
 * w is the half width (Z), hu and hd the half heights above and below the centre (along the
 * ring's up axis). The section is a flat-topped octagon: top half width a, side height b,
 * belly half width c (fractions of w and of hu or hd).
 */
const AO8 = [1.0, 0.93, 0.72, 0.50, 0.50, 0.72, 0.93, 1.0];

function bodyLoft(m, rings, o = {}) {
  const shaped = rings.map((r) => {
    const a = r.a ?? 0.58, b = r.b ?? 0.38, c = r.c ?? 0.5;
    const cp = Math.cos(r.pitch ?? 0), sp = Math.sin(r.pitch ?? 0);
    const U = [-sp, cp, 0];
    const tpl = [[a, 1], [1, b], [1, -b], [c, -1], [-c, -1], [-1, -b], [-1, b], [-a, 1]];
    const verts = tpl.map(([u, v]) => {
      const up = v > 0 ? v * r.hu : v * r.hd;
      return [r.x + U[0] * up, r.y + U[1] * up, u * r.w];
    });
    const tone = r.tone ?? 1;
    const colors = AO8.map((s, k) => {
      let t = s * tone;
      if (r.belly !== undefined && (k === 3 || k === 4)) t *= r.belly;
      return r.tint ? mul(r.tint(k), t) : grey(t);
    });
    return { verts, colors, tone };
  });
  m.solid(() => {
    const ids = shaped.map((r) => r.verts.map((p, k) => m.v(p[0], p[1], p[2], r.colors[k])));
    for (let i = 0; i < ids.length - 1; i += 1) {
      for (let k = 0; k < 8; k += 1) { const k2 = (k + 1) % 8; m.q(ids[i][k], ids[i][k2], ids[i + 1][k2], ids[i + 1][k]); }
    }
    const cap = (r) => {
      const ctr = r.verts.reduce((s, p) => [s[0] + p[0] / 8, s[1] + p[1] / 8, s[2] + p[2] / 8], [0, 0, 0]);
      const cc = grey((o.capTone ?? 0.8) * r.tone);
      const ci = m.v(ctr[0], ctr[1], ctr[2], cc);
      const vi = r.verts.map((p) => m.v(p[0], p[1], p[2], cc));
      for (let k = 0; k < 8; k += 1) m.t(ci, vi[k], vi[(k + 1) % 8]);
    };
    if (o.capStart !== false) cap(shaped[0]);
    if (o.capEnd !== false) cap(shaped[shaped.length - 1]);
  });
}

/* ------------------------------------------------------------------ */
/* Cattle                                                               */
/* ------------------------------------------------------------------ */

// Coat tints. Stock is coloured by the instance colour (the coat, set at the call site) times the
// vertex colour. A Hereford carries its white face, brisket, socks and tail switch in the vertex
// colour as per-channel multipliers (white over red-brown, so they are above 1); an Angus and a
// fawn use the plain geometry, which has only occlusion and part tone. A sheep's wool is the
// instance colour and its dark face and legs are multipliers (dark over wool).
const lin3 = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const ratio = (a, b) => { const A = lin3(a), B = lin3(b); return [B[0] / A[0], B[1] / A[1], B[2] / A[2]]; };
export const STOCK_COATS = Object.freeze({
  angus: '#2B2623', hereford: '#7A5040', fawn: '#B59A72', wool: '#CFC8B6', dark: '#3A332C', white: '#D9D0BE',
});
const HF_WHITE = ratio(STOCK_COATS.hereford, STOCK_COATS.white);
const WOOL_DARK = ratio(STOCK_COATS.wool, STOCK_COATS.dark);
const mixV = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Rings: x, y (centre), w (half width), hu, hd, pitch, tone. A Hereford or Angus build:
// about 2.4 m nose to rump, 1.37 m at the withers, 0.7 m across the barrel.
const COW_BODY_STAND = [
  { x: -1.03, y: 1.12, w: 0.150, hu: 0.13, hd: 0.15, tone: 0.82 },
  { x: -0.98, y: 1.14, w: 0.270, hu: 0.21, hd: 0.23, tone: 0.90 },
  { x: -0.78, y: 1.12, w: 0.335, hu: 0.24, hd: 0.32, c: 0.55, tone: 1.0 },
  { x: -0.45, y: 1.06, w: 0.350, hu: 0.27, hd: 0.40, c: 0.5, tone: 1.0 },
  { x: -0.05, y: 1.01, w: 0.365, hu: 0.31, hd: 0.45, c: 0.5, tone: 1.0 },
  { x: 0.30, y: 1.03, w: 0.335, hu: 0.34, hd: 0.46, c: 0.5, tone: 1.0 },
  { x: 0.56, y: 1.05, w: 0.240, hu: 0.30, hd: 0.40, tone: 0.95 },
];
const COW_BODY_LIE = [
  { x: -1.06, y: 0.52, w: 0.140, hu: 0.18, hd: 0.42, c: 0.8, tone: 0.80 },
  { x: -0.98, y: 0.56, w: 0.260, hu: 0.26, hd: 0.46, c: 0.8, tone: 0.90 },
  { x: -0.78, y: 0.58, w: 0.350, hu: 0.30, hd: 0.48, c: 0.85, tone: 1.0 },
  { x: -0.45, y: 0.52, w: 0.370, hu: 0.32, hd: 0.42, c: 0.9, tone: 1.0 },
  { x: -0.05, y: 0.51, w: 0.385, hu: 0.32, hd: 0.41, c: 0.9, tone: 1.0 },
  { x: 0.30, y: 0.54, w: 0.340, hu: 0.34, hd: 0.44, c: 0.85, tone: 1.0 },
  { x: 0.56, y: 0.50, w: 0.240, hu: 0.30, hd: 0.40, c: 0.7, tone: 0.95 },
];

// Neck and head: [x, y, w, hu, hd, pitch, tone] for the two neck rings; the head is three rings
// along an axis from the poll, with pitch and length given by the pose.
const COW_POSE = {
  stand: { neck: [[0.72, 1.10, 0.200, 0.22, 0.26, -0.20], [0.85, 1.06, 0.150, 0.16, 0.20, -0.40]], poll: [0.95, 1.07], pitch: -0.72 },
  graze: { neck: [[0.72, 0.98, 0.200, 0.22, 0.26, -0.80], [0.84, 0.80, 0.150, 0.16, 0.20, -1.05]], poll: [0.93, 0.62], pitch: -1.35 },
  lie: { neck: [[0.72, 0.74, 0.200, 0.22, 0.26, 0.45], [0.85, 0.94, 0.150, 0.16, 0.20, 0.15]], poll: [0.95, 1.03], pitch: -0.40 },
};
// The head is its own block: wider at the cheeks than the neck is at the throat, a deep jaw,
// then a broad shallow muzzle. d is the distance along the head axis from the poll.
const COW_HEAD = [
  { d: -0.04, w: 0.125, hu: 0.120, hd: 0.150, a: 0.7, b: 0.5, c: 0.55, tone: 0.95 },
  { d: 0.09, w: 0.180, hu: 0.140, hd: 0.190, a: 0.72, b: 0.5, c: 0.55, tone: 1.02 },
  { d: 0.30, w: 0.138, hu: 0.098, hd: 0.128, a: 0.72, b: 0.5, c: 0.65, tone: 1.12 },
  { d: 0.41, w: 0.150, hu: 0.078, hd: 0.098, a: 0.85, b: 0.5, c: 0.80, tone: 1.4 },
];

const HOOF = 0.33;
const LEG_UP = 0.74;

function cowLegs(m, pose, hf) {
  const hoofC = grey(HOOF);
  const legC = (t) => grey(t);
  const sock = (t) => (hf ? mul(HF_WHITE, t) : grey(t));
  if (pose === 'lie') {
    for (const s of [1, -1]) {
      // Forelegs folded forward under the chin, hind legs folded to the side.
      const fo = s > 0 ? 0.0 : 0.14;
      tube(m, [
        { p: [0.34, 0.40, 0.20 * s], a: 0.105, b: 0.10, c: legC(0.62) },
        { p: [0.64 + fo, 0.12, 0.19 * s], a: 0.080, b: 0.075, c: legC(0.70) },
        { p: [0.90 + fo, 0.07, 0.18 * s], a: 0.056, b: 0.054, c: sock(0.80) },
        { p: [1.02 + fo, 0.04, 0.18 * s], a: 0.070, b: 0.060, c: hoofC },
      ], { ref: [0, 0, 1], capStart: false });
      tube(m, [
        { p: [-0.70, 0.42, 0.28 * s], a: 0.14, b: 0.115, c: legC(0.62) },
        { p: [-1.00, 0.14, 0.34 * s], a: 0.085, b: 0.078, c: legC(0.70) },
        { p: [-0.70, 0.07, 0.43 * s], a: 0.056, b: 0.054, c: sock(0.80) },
        { p: [-0.55, 0.04, 0.44 * s], a: 0.070, b: 0.060, c: hoofC },
      ], { ref: [0, 0, 1], capStart: false });
    }
    return;
  }
  const step = pose === 'graze' ? 0.16 : 0.07;
  for (const s of [1, -1]) {
    const f = s > 0 ? step : -step * 0.5;
    const bk = s > 0 ? -0.04 : 0.05;
    // Forelegs: a straight forearm, a knee, a thin cannon, a hoof block.
    tube(m, [
      { p: [0.34 + f, 0.94, 0.19 * s], a: 0.125, b: 0.100, c: legC(0.70) },
      { p: [0.36 + f, 0.50, 0.19 * s], a: 0.085, b: 0.075, c: legC(0.84) },
      { p: [0.35 + f, 0.115, 0.19 * s], a: 0.058, b: 0.056, c: sock(0.80) },
      { p: [0.37 + f, 0.0, 0.19 * s], a: 0.085, b: 0.066, c: hoofC },
    ], { ref: [0, 0, 1], capStart: false, capEnd: false, flatEnd: true });
    // Hind legs: the hock is the rearmost point, the cannon runs down and a little forward.
    tube(m, [
      { p: [-0.78 + bk, 0.92, 0.20 * s], a: 0.165, b: 0.125, c: legC(0.62) },
      { p: [-0.99 + bk, 0.54, 0.20 * s], a: 0.092, b: 0.080, c: legC(0.86) },
      { p: [-0.92 + bk, 0.115, 0.20 * s], a: 0.058, b: 0.056, c: sock(0.80) },
      { p: [-0.90 + bk, 0.0, 0.20 * s], a: 0.085, b: 0.066, c: hoofC },
    ], { ref: [0, 0, 1], capStart: false, capEnd: false, flatEnd: true });
  }
}

/**
 * One beef animal: 'stand', 'graze' (neck down, muzzle at the grass) or 'lie' (legs folded,
 * body on the ground). Nose to rump about 2.4 m, 1.37 m at the withers when standing.
 */
export function makeCattleGeometry(pose = 'stand', coat = 'plain') {
  const m = new Mesher();
  const hf = coat === 'hereford';
  const body = (pose === 'lie' ? COW_BODY_LIE : COW_BODY_STAND).map((r) => ({ ...r, pitch: 0 }));
  const P = COW_POSE[pose];
  const neck = P.neck.map(([x, y, w, hu, hd, pitch], i) => ({ x, y, w, hu, hd, pitch, a: 0.62, b: 0.42, c: 0.6, tone: i ? 0.92 : 0.97 }));
  const dir = [Math.cos(P.pitch), Math.sin(P.pitch)];
  const head = COW_HEAD.map((h) => ({
    x: P.poll[0] + dir[0] * h.d, y: P.poll[1] + dir[1] * h.d, w: h.w, hu: h.hu, hd: h.hd,
    pitch: P.pitch, a: h.a, b: h.b, c: h.c, tone: h.tone,
  }));
  const rings = [...body, ...neck, ...head];
  if (hf) {
    // White face, throat, brisket and underline over the red-brown coat: per ring a weight for
    // the whole section and one for the belly vertices (and a fraction of the lower flanks).
    const wAll = [0, 0, 0, 0, 0, 0, 0, 0.45, 0.8, 0.95, 1, 1, 1];
    const wBelly = [0, 0, 0, 0.2, 0.55, 0.9, 1, 1, 1, 1, 1, 1, 1];
    rings.forEach((r, i) => {
      if (i >= 9) r.tone = Math.min(r.tone, 1.0);
      r.tint = (k) => mixV([1, 1, 1], HF_WHITE, Math.max(wAll[i], k === 3 || k === 4 ? wBelly[i] : k === 2 || k === 5 ? wBelly[i] * 0.4 : 0));
    });
  }
  bodyLoft(m, rings, { capTone: 0.85 });
  cowLegs(m, pose, hf);

  // Ears: a flat leaf held out and a little back from the poll, drooping.
  const [px, py] = P.poll;
  for (const s of [1, -1]) {
    tube(m, [
      { p: [px - 0.03, py + 0.10, 0.10 * s], a: 0.056, b: 0.018, c: grey(0.78) },
      { p: [px - 0.07, py + 0.085, 0.29 * s], a: 0.042, b: 0.011, c: grey(0.58) },
    ], { ref: [0, 1, 0], capStart: false });
  }

  // Tail: a thin rope from the tail head, hanging behind the rump, ending in a switch.
  const ty = pose === 'lie' ? 0.62 : 1.20;
  const tail = pose === 'lie'
    ? [[-1.08, ty, 0.0], [-1.18, 0.38, 0.04], [-1.15, 0.12, 0.10], [-1.14, 0.06, 0.14]]
    : [[-1.08, ty, 0.0], [-1.14, 0.82, 0.0], [-1.14, 0.52, 0.0], [-1.13, 0.40, 0.0]];
  tube(m, [
    { p: tail[0], a: 0.030, b: 0.030, c: grey(0.8) },
    { p: tail[1], a: 0.022, b: 0.022, c: grey(0.7) },
    { p: tail[2], a: 0.034, b: 0.040, c: hf ? mul(HF_WHITE, 0.62) : grey(0.42) },
    { p: tail[3], a: 0.012, b: 0.014, c: hf ? mul(HF_WHITE, 0.55) : grey(0.36) },
  ], { ref: [0, 0, 1], capStart: false });
  return m.geometry();
}

/* ------------------------------------------------------------------ */
/* Sheep                                                                */
/* ------------------------------------------------------------------ */

const SHEEP_X = 1.0;
const SHEEP_BODY = [
  { x: -0.44, y: 0.50, w: 0.090, hu: 0.10, hd: 0.11, tone: 0.86 },
  { x: -0.34, y: 0.51, w: 0.185, hu: 0.185, hd: 0.20, tone: 0.95 },
  { x: -0.06, y: 0.50, w: 0.225, hu: 0.22, hd: 0.235, tone: 1.0 },
  { x: 0.36, y: 0.50, w: 0.180, hu: 0.19, hd: 0.20, tone: 0.97 },
  { x: 0.45, y: 0.49, w: 0.090, hu: 0.11, hd: 0.12, tone: 0.9 },
];

/** A sheep: a woolly lozenge, thin dark legs, a small dark face. 'stand' or 'graze'. */
export function makeSheepGeometry(pose = 'stand') {
  const m = new Mesher();
  const body = SHEEP_BODY.map((r) => ({ ...r, x: r.x * SHEEP_X, pitch: 0, a: 0.72, b: 0.5, c: 0.62 }));
  // Neck and a small dark head, one more loft step each; the wool tone falls away to the face.
  const H = pose === 'graze'
    ? [{ x: 0.52, y: 0.50, w: 0.080, hu: 0.095, hd: 0.100, pitch: -0.7, dark: 0.45 },
      { x: 0.60, y: 0.34, w: 0.058, hu: 0.062, hd: 0.075, pitch: -1.2, dark: 1 },
      { x: 0.63, y: 0.17, w: 0.034, hu: 0.040, hd: 0.046, pitch: -1.35, dark: 1 }]
    : [{ x: 0.52, y: 0.58, w: 0.080, hu: 0.095, hd: 0.100, pitch: -0.25, dark: 0.45 },
      { x: 0.62, y: 0.57, w: 0.058, hu: 0.062, hd: 0.075, pitch: -0.55, dark: 1 },
      { x: 0.70, y: 0.50, w: 0.034, hu: 0.040, hd: 0.046, pitch: -0.65, dark: 1 }];
  const head = H.map((r) => ({
    ...r, x: r.x * 1.0, a: 0.7, b: 0.5, c: 0.6, tone: 1.0,
    tint: () => mixV([1, 1, 1], WOOL_DARK, r.dark),
  }));
  body[body.length - 1] = { ...body[body.length - 1], x: 0.43 * SHEEP_X, w: 0.12, hu: 0.14, hd: 0.15, tone: 0.9 };
  bodyLoft(m, [...body, ...head], { capTone: 0.8 });

  // Legs: thin and dark, a wool skirt above them.
  for (const s of [1, -1]) {
    for (const lx of [0.30 * SHEEP_X, -0.28 * SHEEP_X]) {
      tube(m, [
        { p: [lx, 0.36, 0.095 * s], a: 0.040, b: 0.040, c: mul(WOOL_DARK, 0.95) },
        { p: [lx + 0.01, 0.0, 0.095 * s], a: 0.027, b: 0.027, c: mul(WOOL_DARK, 0.75) },
      ], { ref: [0, 0, 1], capStart: false, capEnd: false, flatEnd: true });
    }
  }
  // Ears and a tail stub.
  const e = head[1];
  for (const s of [1, -1]) {
    tube(m, [
      { p: [e.x - 0.01, e.y + 0.04, 0.05 * s], a: 0.026, b: 0.010, c: mul(WOOL_DARK, 0.9) },
      { p: [e.x - 0.05, e.y + 0.025, 0.14 * s], a: 0.020, b: 0.007, c: mul(WOOL_DARK, 0.8) },
    ], { ref: [0, 1, 0], capStart: false, capEnd: false });
  }
  tube(m, [
    { p: [-0.49 * SHEEP_X, 0.52, 0], a: 0.045, b: 0.045, c: grey(0.8) },
    { p: [-0.52 * SHEEP_X, 0.34, 0], a: 0.030, b: 0.030, c: grey(0.7) },
  ], { ref: [0, 0, 1], capStart: false });
  return m.geometry();
}

/* ------------------------------------------------------------------ */
/* Round hay bale                                                       */
/* ------------------------------------------------------------------ */

/**
 * A round bale 1.5 m across and 1.2 m wide, axis along local X: a 14-sided drum with a
 * bevelled, slightly dished end, a faint diagonal band tone in the wrap, and a flat spot
 * where it sits. Lowest point y = -0.70, so the caller grounds it on that flat.
 */
export function makeBaleGeometry() {
  const m = new Mesher();
  const N = 14, R = 0.75, HALF = 0.585, RIM = 0.60, DISH = 0.565, RR = 0.66, FLAT = -0.70;
  const wrap = (k, e) => 0.90 + 0.10 * Math.sin((k + e * 1.6) * 1.3);
  const pt = (x, r, k) => {
    const th = (k + 0.5) * TAU / N;
    return [x, Math.max(FLAT, -r * Math.cos(th)), r * Math.sin(th)];
  };
  const shade = (y) => Math.min(1, 0.60 + (y - FLAT) * 0.34);
  m.solid(() => {
    const A = [], B = [], RA = [], RB = [];
    for (let k = 0; k < N; k += 1) {
      const a = pt(-HALF, R, k), b = pt(HALF, R, k);
      A.push(m.v(...a, grey(wrap(k, 0) * shade(a[1]))));
      B.push(m.v(...b, grey(wrap(k, 1) * shade(b[1]))));
      const ra = pt(-RIM, RR, k), rb = pt(RIM, RR, k);
      RA.push(m.v(...ra, grey(0.80 * shade(ra[1]))));
      RB.push(m.v(...rb, grey(0.80 * shade(rb[1]))));
    }
    const ca = m.v(-DISH, 0, 0, grey(0.66)), cb = m.v(DISH, 0, 0, grey(0.66));
    for (let k = 0; k < N; k += 1) {
      const k2 = (k + 1) % N;
      m.q(A[k], A[k2], B[k2], B[k]);
      m.q(A[k], RA[k], RA[k2], A[k2]);
      m.q(B[k], B[k2], RB[k2], RB[k]);
      m.t(ca, RA[k2], RA[k]);
      m.t(cb, RB[k], RB[k2]);
    }
  });
  return m.geometry();
}

/* ------------------------------------------------------------------ */
/* Post-and-rail fence                                                  */
/* ------------------------------------------------------------------ */

/**
 * One 8 m run of post-and-rail fence, along local X from -4 to +4: posts 1.3 m high and about
 * 0.11 m square at 2.67 m centres (leaning a degree or so, no two alike), a heavier strainer post
 * with a stay at the start, and three timber rails (0.10 x 0.04 m) on the stock side. The run
 * ends on the post that the next run's strainer encloses, so a continuous boundary has no gaps
 * and no coplanar overlaps.
 */
export function makeFenceGeometry() {
  const m = new Mesher();
  const rnd = rng(2207);
  const xs = [-4, -4 + 8 / 3, -4 + 16 / 3, 4];
  xs.forEach((x, i) => {
    const strainer = i === 0;
    const h = strainer ? 1.40 : 1.30 - rnd() * 0.04;
    const hx = strainer ? 0.085 : 0.058;
    const ox = (rnd() - 0.5) * 0.045, oz = (rnd() - 0.5) * 0.045;
    frustum(m, x, 0, 0, hx, hx, hx * 0.90, hx * 0.90, h, grey(0.60), grey(1.08), { ox, oz, yaw: rnd() * 0.4 });
  });
  for (const y of [0.42, 0.82, 1.20]) {
    beam(m, [-4, y, 0.082], [4, y, 0.082], 0.020, 0.050, grey(1.16), grey(1.16), [0, 1, 0], { capStart: false, capEnd: false });
  }
  beam(m, [-3.96, 1.20, 0.0], [-2.80, 0.05, 0.0], 0.038, 0.038, grey(1.0), grey(0.7), [0, 0, 1], { capStart: false, capEnd: false });
  return m.geometry();
}

/**
 * taste W82 fix (TRACK_GATES): the post-and-rail fence's timber, made here once for the fence (fringe.js, `fringe:hinterland-fences`) and the farm gateways
 * (fringe/track-gate.js, `fringe:hinterland-track-gates`). The token is the material colour (a dark weathered brown, '#3a342c'), the vertex colours are
 * grey multipliers on it: `RAIL_FENCE_TONES` are the ones `makeFenceGeometry` bakes (posts grey(0.60) at the foot to grey(1.08) at the head, rails grey(1.16),
 * the stay grey(1.0) to grey(0.7)). Each call gives a new material with every parameter the fence has.
 */
export const RAIL_FENCE_COLOUR = '#3a342c';
export const RAIL_FENCE_TONES = Object.freeze({ postFoot: 0.60, postHead: 1.08, rail: 1.16, stayHead: 1.0, stayFoot: 0.7 });
export function makeRailFenceMaterial() {
  return new THREE.MeshStandardMaterial({ color: RAIL_FENCE_COLOUR, vertexColors: true, roughness: 0.92, metalness: 0.04 });
}
/**
 * taste W82 fix 2 (TRACK_GATES, `?trackGateTone=`): the farm gateways' tones. `silver` is a weathered silver-grey timber in the rail fence's material
 * (every parameter of `makeRailFenceMaterial` but the colour); `galv` a galvanised steel grey with a little metalness. `run` and `rail` draw as the fences do:
 * `rail` is `makeRailFenceMaterial()` itself; `run` is a white material that takes each gateway's timber from its vertex colours (fringe.js), with the parcel
 * fence's roughness (0.94, metalness 0) once a gateway stands in a hedge, the brow or a parcel fence, the rail fence's (0.92, 0.04) when all stand in rail fences.
 * W83: the `silver` and `galv` tokens come down about a fifth (they drew as painted white from above: rendered p90 luminance 172 to 208 and 208 to 235, against `run`'s 151 to 178
 * and the ground's 100 to 130); the vertex colours multiply them by `RAIL_FENCE_TONES`, 0.60 (post foot) to 1.16 (rails), so a drawn gateway runs from 0.60 to 1.16 times the token.
 * `galv` keeps its roughness 0.55 and metalness 0.35.
 */
export const GATE_TONE_TOKENS = Object.freeze({ silver: '#77736b', galv: '#7c807f' });
export function makeGateMaterial(tone, { parcelRuns = true } = {}) {
  if (tone === 'rail') return makeRailFenceMaterial();
  if (tone === 'silver') { const m = makeRailFenceMaterial(); m.color.set(GATE_TONE_TOKENS.silver); return m; }
  if (tone === 'galv') return new THREE.MeshStandardMaterial({ color: GATE_TONE_TOKENS.galv, vertexColors: true, roughness: 0.55, metalness: 0.35 });
  return new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: parcelRuns ? 0.94 : 0.92, metalness: parcelRuns ? 0 : 0.04 });
}

/**
 * taste-r1 (W25, PARCEL_FENCES): one 8 m run of post-and-wire stock fence, along local X from -4 to +4. Five weathered grey
 * posts at 2 m (1.2 m high, 0.15 m at the foot, no two leaning alike) carry three strands of wire at 0.38, 0.75 and 1.14 m,
 * each a 0.03 m vertical ribbon (draw it double-sided). Neighbouring runs share their end post. 74 triangles.
 * taste-r1 (W26, FENCE_CARRY): `palette` ({ post, wire }, linear RGB triples) bakes the weathered tokens into the vertex colours (the
 * caller then draws it with a white material); without it the vertex colours are W25's greys and the caller's '#a29f94' material applies.
 */
export function makeWireFenceGeometry(palette = null) {
  const m = new Mesher();
  const rnd = rng(2519);
  const HEIGHT = 1.2;
  const postTone = (t) => (palette ? mul(palette.post, t) : grey(t));
  const wireTone = palette ? palette.wire : grey(0.40);
  for (let i = 0; i < 5; i += 1) {
    const x = -4 + i * 2, h = HEIGHT - rnd() * 0.07;
    const ox = (rnd() - 0.5) * 0.05, oz = (rnd() - 0.5) * 0.05;
    frustum(m, x, 0, 0, 0.075, 0.065, 0.058, 0.052, h, postTone(0.78), postTone(1.12), { ox, oz, yaw: rnd() * 0.5 });
  }
  for (const y of [0.38, 0.75, 1.14]) {
    for (let i = 0; i < 4; i += 1) {
      const x0 = -4 + i * 2, x1 = x0 + 2;
      m.q(m.v(x0, y - 0.022, 0.07, wireTone), m.v(x1, y - 0.022, 0.07, wireTone),
        m.v(x1, y + 0.022, 0.07, wireTone), m.v(x0, y + 0.022, 0.07, wireTone));
    }
  }
  return m.geometry();
}

/* ------------------------------------------------------------------ */
/* Dry-stone wall                                                       */
/* ------------------------------------------------------------------ */

/** A stone set on its edge: a ridged wedge (two slopes, two end triangles), 6 triangles. */
function wedge(m, cx, y0, cz, w, d, h, yaw, shift, c0, c1) {
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const at = (x, y, z) => [cx + x * cs + z * sn, y, cz - x * sn + z * cs];
  const B = [at(-w / 2, y0, -d / 2), at(w / 2, y0, -d / 2), at(w / 2, y0, d / 2), at(-w / 2, y0, d / 2)];
  const R0 = at(-w * 0.3, y0 + h, shift), R1 = at(w * 0.3, y0 + h, shift);
  m.solid(() => {
    const v = (p, c) => m.v(p[0], p[1], p[2], c);
    m.q(v(B[0], c0), v(B[1], c0), v(R1, c1), v(R0, c1));
    m.q(v(B[2], c0), v(B[3], c0), v(R0, c1), v(R1, c1));
    m.t(v(B[3], c0), v(B[0], c0), v(R0, c1));
    m.t(v(B[1], c0), v(B[2], c0), v(R1, c1));
  });
}

/**
 * One 9 m run of basalt dry-stone wall, along local X from -4.5 to +4.5: a faced wall 0.93 m
 * high, 0.6 m at the base battering to 0.4 m at the top, four courses told apart by alternating
 * tone bands and a few vertical joint ticks, and a coping course of 18 upright wedge stones
 * standing 0.12 to 0.20 m above the top, so the whole stands about 1.1 m. `tumbled` drops a 3 m
 * section of the faced wall to a spill and leaves six loose stones on the ground.
 */
export function makeStoneWallGeometry(tumbled = false) {
  const m = new Mesher();
  const rnd = rng(tumbled ? 4417 : 4409);
  const ST = 7, X0 = -4.5, DX = 1.5, BODY = 0.93;
  const half = (y) => 0.30 - 0.10 * (y / BODY);
  const courseTone = [0.60, 0.84, 0.68, 0.90];
  const st = [];
  for (let i = 0; i < ST; i += 1) {
    const end = i === 0 || i === ST - 1;
    const dip = tumbled ? [0, 0, 0.12, 0.40, 0.12, 0, 0][i] : 0;
    st.push({
      x: X0 + i * DX,
      top: BODY + (rnd() - 0.5) * 0.06 - (end ? 0.06 : 0) - dip,
      k: end ? 0.88 : 1,
      j: Array.from({ length: 10 }, () => (rnd() - 0.5) * 0.03),
      tone: Array.from({ length: 4 }, () => (rnd() - 0.5) * 0.10),
    });
  }
  const topAt = (x) => {
    const f = Math.max(0, Math.min(ST - 1.0001, (x - X0) / DX));
    const i = Math.floor(f), t = f - i;
    return st[i].top * (1 - t) + st[i + 1].top * t;
  };
  for (const side of [1, -1]) {
    for (let band = 0; band < 4; band += 1) {
      facing(m, [0, 0, side], () => {
        const ids = st.map((s) => {
          const yLo = s.top * (band / 4), yHi = s.top * ((band + 1) / 4);
          const wLo = half(yLo) * s.k + s.j[band * 2], wHi = half(yHi) * s.k + s.j[band * 2 + 1];
          const tone = courseTone[band] + s.tone[band];
          return [m.v(s.x, yLo, side * wLo, grey(tone * (band === 0 ? 0.72 : 1))), m.v(s.x, yHi, side * wHi, grey(tone))];
        });
        for (let i = 0; i < ST - 1; i += 1) m.q(ids[i][0], ids[i + 1][0], ids[i + 1][1], ids[i][1]);
      });
    }
    // Joint ticks: a few thin dark verticals standing a hair off the face.
    for (let n = 0; n < 4; n += 1) {
      const x = X0 + 0.7 + rnd() * 7.6, band = Math.floor(rnd() * 4);
      if (tumbled && Math.abs(x) < 1.8) continue;
      const top = topAt(x), yLo = top * (band / 4) + 0.03, yHi = top * ((band + 1) / 4) - 0.03;
      const zLo = side * (half(yLo) + 0.014), zHi = side * (half(yHi) + 0.014);
      facing(m, [0, 0, side], () => {
        m.q(m.v(x - 0.014, yLo, zLo, grey(0.30)), m.v(x + 0.014, yLo, zLo, grey(0.30)), m.v(x + 0.014, yHi, zHi, grey(0.30)), m.v(x - 0.014, yHi, zHi, grey(0.30)));
      });
    }
  }
  // Top of the faced wall under the coping.
  facing(m, [0, 1, 0], () => {
    const L = st.map((s) => m.v(s.x, s.top, -half(s.top) * s.k, grey(0.74)));
    const R = st.map((s) => m.v(s.x, s.top, half(s.top) * s.k, grey(0.74)));
    for (let i = 0; i < ST - 1; i += 1) m.q(L[i], L[i + 1], R[i + 1], R[i]);
  });
  // Ends.
  for (const [i, dir] of [[0, -1], [ST - 1, 1]]) {
    const s = st[i], wB = half(0) * s.k, wT = half(s.top) * s.k;
    facing(m, [dir, 0, 0], () => {
      m.q(m.v(s.x, 0, -wB, grey(0.55)), m.v(s.x, 0, wB, grey(0.55)), m.v(s.x, s.top, wT, grey(0.8)), m.v(s.x, s.top, -wT, grey(0.8)));
    });
  }
  // Coping: 18 upright wedge stones along the top, none over the gap in the tumbled run.
  const N = 18;
  for (let i = 0; i < N; i += 1) {
    const x = X0 + 0.25 + (8.5 * i) / (N - 1) + (rnd() - 0.5) * 0.12;
    const w = 0.25 + rnd() * 0.10, d = 0.17 + rnd() * 0.09, h = 0.12 + rnd() * 0.08;
    const yaw = (rnd() - 0.5) * 0.5, shift = (rnd() - 0.5) * 0.07, dz = (rnd() - 0.5) * 0.06, tone = 0.84 + rnd() * 0.20;
    if (tumbled && Math.abs(x) < 1.6) continue;
    wedge(m, x, topAt(x) - 0.03, dz, w, d, h + 0.03, yaw, shift, grey(tone * 0.80), grey(tone * 1.05));
  }
  if (tumbled) {
    // Six loose stones where the wall has come down.
    const r = rng(77);
    for (let k = 0; k < 6; k += 1) {
      const side = k % 2 ? 1 : -1;
      const w = 0.22 + r() * 0.14, d = 0.18 + r() * 0.12, h = 0.12 + r() * 0.10;
      wedge(m, -1.3 + k * 0.52 + (r() - 0.5) * 0.2, 0, side * (0.36 + r() * 0.34), w, d, h, r() * 3, (r() - 0.5) * 0.06, grey(0.62), grey(0.92));
    }
  }
  return m.geometry();
}

/* ------------------------------------------------------------------ */
/* Farm sheds                                                           */
/* ------------------------------------------------------------------ */

/**
 * Orient the triangles emitted by `fn` so they face `dir` (for open sheets: roofs and walls).
 */
function facing(m, dir, fn) {
  const start = m.idx.length;
  fn();
  let score = 0;
  for (let i = start; i < m.idx.length; i += 3) {
    const a = m.idx[i] * 3, b = m.idx[i + 1] * 3, c = m.idx[i + 2] * 3;
    const ux = m.pos[b] - m.pos[a], uy = m.pos[b + 1] - m.pos[a + 1], uz = m.pos[b + 2] - m.pos[a + 2];
    const vx = m.pos[c] - m.pos[a], vy = m.pos[c + 1] - m.pos[a + 1], vz = m.pos[c + 2] - m.pos[a + 2];
    score += (uy * vz - uz * vy) * dir[0] + (uz * vx - ux * vz) * dir[1] + (ux * vy - uy * vx) * dir[2];
  }
  if (score < 0) {
    for (let i = start; i < m.idx.length; i += 3) { const t = m.idx[i + 1]; m.idx[i + 1] = m.idx[i + 2]; m.idx[i + 2] = t; }
  }
}

/** Colour tokens for the shed, taken down by the fringe lighting gain (as the old shed did). */
function shedTones() {
  const gain = 0.26;
  return {
    concrete: linear(TASTE.built.concrete, gain),
    timber: linear(TASTE.built.timber, gain),
    iron: linear(TASTE.built.roofIron, gain),
    ironWall: linear(TASTE.built.roofIron, gain * 1.06),
    ridge: linear(TASTE.built.roofIron, gain * 1.25),
  };
}

/**
 * A corrugated sheet: ribs run along V (down a slope or up a wall), repeating along U.
 * O is the corner, U and V are full-length vectors, N the outward unit normal, `n` periods
 * of depth `depth`. Colour `col` is lit at the crests and shaded in the troughs, with an
 * occlusion ramp `ao0` to `ao1` along V.
 */
function corrugated(m, O, U, V, N, n, depth, col, ao0 = 1, ao1 = 1) {
  facing(m, N, () => {
    let prev = null;
    for (let i = 0; i <= 2 * n; i += 1) {
      const u = i / (2 * n), d = (i % 2) * depth, f = i % 2 ? 1.0 : 0.80;
      const base = [O[0] + U[0] * u + N[0] * d, O[1] + U[1] * u + N[1] * d, O[2] + U[2] * u + N[2] * d];
      const a = m.v(base[0], base[1], base[2], mul(col, f * ao0));
      const b = m.v(base[0] + V[0], base[1] + V[1], base[2] + V[2], mul(col, f * ao1));
      if (prev) m.q(prev[0], a, b, prev[1]);
      prev = [a, b];
    }
  });
}

/**
 * A ribbed wall: from (x0, z0) along (dx, dz) for `len`, from y0 up to ytop(u), ribs repeating
 * every len / n, facing (nx, nz).
 */
function ribbedWall(m, x0, z0, dx, dz, len, y0, ytop, n, depth, nx, nz, col) {
  facing(m, [nx, 0, nz], () => {
    let prev = null;
    for (let i = 0; i <= 2 * n; i += 1) {
      const u = (i / (2 * n)) * len, d = (i % 2) * depth, f = i % 2 ? 1.0 : 0.80;
      const x = x0 + dx * u + nx * d, z = z0 + dz * u + nz * d;
      const a = m.v(x, y0, z, mul(col, f * 0.74));
      const b = m.v(x, ytop(u), z, mul(col, f * 1.0));
      if (prev) m.q(prev[0], a, b, prev[1]);
      prev = [a, b];
    }
  });
}

/** A flat quad (a, b, c, d) with its own colours, facing `dir`. */
function flatQuad(m, dir, pts, cols) {
  facing(m, dir, () => { m.q(...pts.map((p, i) => m.v(p[0], p[1], p[2], cols[i] ?? cols[0]))); });
}

/** A fan polygon (convex) facing `dir`. */
function flatFan(m, dir, pts, col) {
  facing(m, dir, () => {
    const ids = pts.map((p) => m.v(p[0], p[1], p[2], col));
    for (let i = 1; i < ids.length - 1; i += 1) m.t(ids[0], ids[i], ids[i + 1]);
  });
}

function shedRoofSlope(m, tones, { x0, x1, zEave, yEave, zRidge, yRidge, ribPeriod = 0.5 }) {
  // The roof sheet runs along x; ribs run down the slope. V points from the eave to the ridge.
  const len = x1 - x0;
  const V = [0, yRidge - yEave, zRidge - zEave];
  const Vl = Math.hypot(V[1], V[2]);
  let N = norm(cross([1, 0, 0], V));
  if (N[1] < 0) N = [-N[0], -N[1], -N[2]];
  const n = Math.max(2, Math.round(len / ribPeriod / 1));
  const O = [x0, yEave, zEave];
  corrugated(m, O, [len, 0, 0], V, N, n, 0.035, tones.iron, 0.88, 1.0);
  // Underside: dark, a little below the ribs.
  const dn = [-N[0], -N[1], -N[2]];
  const off = 0.06;
  const u0 = [x0 + dn[0] * off, yEave + dn[1] * off, zEave + dn[2] * off];
  const u1 = [x1 + dn[0] * off, u0[1], u0[2]];
  const v0 = [u0[0] + V[0], u0[1] + V[1], u0[2] + V[2]], v1 = [u1[0] + V[0], u1[1] + V[1], u1[2] + V[2]];
  const dark = mul(tones.iron, 0.42);
  flatQuad(m, dn, [u0, u1, v1, v0], [dark]);
  // Eave skirt: closes the sheet's edge at the eave.
  const eaveOut = norm([0, -V[2] * 0 - Math.abs(V[1]) * 0, -V[2] > 0 ? -1 : 1]);
  const e0 = [x0, yEave, zEave], e1 = [x1, yEave, zEave];
  const e2 = [x1, u0[1], u0[2]], e3 = [x0, u0[1], u0[2]];
  flatQuad(m, [0, -0.3, zEave > zRidge ? 1 : -1], [e0, e1, e2, e3], [mul(tones.iron, 0.75)]);
  // Gable-end skirts along the slope.
  for (const [xx, dir] of [[x0, -1], [x1, 1]]) {
    const p0 = [xx, yEave, zEave], p1 = [xx, yEave + V[1], zEave + V[2]];
    const q0 = [xx, u0[1], u0[2]], q1 = [xx, v0[1], v0[2]];
    flatQuad(m, [dir, 0, 0], [p0, p1, q1, q0], [mul(tones.iron, 0.7)]);
  }
  return { Vl, N };
}

function post(m, x, z, h, tones, hx = 0.11, y0 = 0.10) {
  frustum(m, x, y0, z, hx, hx, hx * 0.92, hx * 0.92, h, mul(tones.timber, 0.55), mul(tones.timber, 1.0));
}

function guttersAndPipe(m, tones, { x0, x1, z, y, pipeX, zSign }) {
  beam(m, [x0, y, z], [x1, y, z], 0.075, 0.055, mul(tones.iron, 0.62), mul(tones.iron, 0.62), [0, 1, 0], { capStart: true, capEnd: true });
  if (pipeX !== undefined) {
    frustum(m, pipeX, 0.10, z + zSign * 0.02, 0.040, 0.040, 0.040, 0.040, y - 0.10, mul(tones.iron, 0.55), mul(tones.iron, 0.70));
  }
}

/** The concrete apron the shed stands on, with a dark interior shade laid on it. */
function slab(m, tones, { x0, x1, zBack, zFront, frontApron = 0.9 }) {
  const y0 = -0.10, y1 = 0.10;
  const zb = zBack - 0.25, zf = zFront + frontApron;
  frustum(m, (x0 + x1) / 2, y0, (zb + zf) / 2, (x1 - x0) / 2 + 0.25, (zf - zb) / 2, (x1 - x0) / 2 + 0.22, (zf - zb) / 2 - 0.03, y1 - y0, mul(tones.concrete, 0.75), mul(tones.concrete, 1.0));
  // The shaded floor under the roof: a dark multiply band, as occlusion laid on the slab.
  flatQuad(m, [0, 1, 0], [[x0, y1 + 0.004, zBack], [x0, y1 + 0.004, zFront], [x1, y1 + 0.004, zFront], [x1, y1 + 0.004, zBack]], [mul(tones.concrete, 0.52)]);
}

/**
 * A Victorian hay or machinery shed in a 12 x 8 m plan (x along the length, z across),
 * 3.6 m to the eave and 5.2 m to the ridge for the gable form: a portal frame of 4 m bays,
 * corrugated iron on three sides, the long front (+z) open, a gable roof with a 0.4 m
 * overhang, ridge cap, gutters, one downpipe and a concrete apron. Variants:
 *   'gable'    the hay shed;
 *   'skillion' a machinery shed with a single-pitch roof and two sliding doors on the front;
 *   'leanto'   a shorter gable with a lean-to skillion on the +x end.
 */
export function makeShedGeometry(variant = 'gable') {
  const m = new Mesher();
  const T = shedTones();
  const W = 4.0;
  const gable = variant === 'gable' || variant === 'leanto';
  const xR = variant === 'leanto' ? 3.0 : 6.0;
  const xL = -6.0;
  const EAVE = 3.6, RIDGE = 5.2;

  slab(m, T, { x0: xL, x1: 6.0, zBack: -W, zFront: W });

  if (gable) {
    // Roof: two slopes with a 0.4 m overhang and a ridge cap.
    const ov = 0.4, slope = (RIDGE - EAVE) / W;
    const yEave = EAVE - ov * slope;
    shedRoofSlope(m, T, { x0: xL - ov, x1: xR + ov, zEave: W + ov, yEave, zRidge: 0, yRidge: RIDGE + 0.04 });
    shedRoofSlope(m, T, { x0: xL - ov, x1: xR + ov, zEave: -(W + ov), yEave, zRidge: 0, yRidge: RIDGE + 0.04 });
    beam(m, [xL - ov - 0.02, RIDGE + 0.07, 0], [xR + ov + 0.02, RIDGE + 0.07, 0], 0.30, 0.045, T.ridge, T.ridge, [0, 1, 0]);
    // Walls: the back (-z), and the gable ends.
    const wLen = xR - xL;
    ribbedWall(m, xR, -W, -1, 0, wLen, 0.10, () => EAVE, Math.round(wLen / 0.8), 0.045, 0, -1, T.ironWall);
    const gz = (u) => EAVE + (RIDGE - EAVE) * (1 - Math.abs(u - W) / W);
    ribbedWall(m, xL, -W, 0, 1, 2 * W, 0.10, gz, 10, 0.045, -1, 0, T.ironWall);
    ribbedWall(m, xR, W, 0, -1, 2 * W, 0.10, gz, 10, 0.045, 1, 0, T.ironWall);
    // Dark linings so the open front looks into a shed, not through a sheet.
    const lin = mul(T.iron, 0.30);
    flatQuad(m, [0, 0, 1], [[xR, 0.10, -W + 0.07], [xL, 0.10, -W + 0.07], [xL, EAVE, -W + 0.07], [xR, EAVE, -W + 0.07]], [lin]);
    flatFan(m, [1, 0, 0], [[xL + 0.07, 0.10, -W], [xL + 0.07, 0.10, W], [xL + 0.07, EAVE, W], [xL + 0.07, RIDGE, 0], [xL + 0.07, EAVE, -W]], lin);
    if (variant === 'gable') flatFan(m, [-1, 0, 0], [[xR - 0.07, 0.10, W], [xR - 0.07, 0.10, -W], [xR - 0.07, EAVE, -W], [xR - 0.07, RIDGE, 0], [xR - 0.07, EAVE, W]], lin);
    // Portal frames at 4 m bays: front posts, rafters, and girts on the back wall.
    const bays = Math.max(2, Math.round(wLen / 4));
    for (let i = 0; i <= bays; i += 1) {
      const x = xL + 0.20 + (wLen - 0.40) * (i / bays);
      post(m, x, W - 0.15, EAVE - 0.10, T);
      beam(m, [x, EAVE - 0.02, W - 0.15], [x, RIDGE - 0.08, 0], 0.045, 0.10, mul(T.timber, 0.55), mul(T.timber, 0.70), [1, 0, 0], { capStart: false, capEnd: false });
      beam(m, [x, EAVE - 0.02, -W + 0.15], [x, RIDGE - 0.08, 0], 0.045, 0.10, mul(T.timber, 0.55), mul(T.timber, 0.70), [1, 0, 0], { capStart: false, capEnd: false });
    }
    for (const y of [1.3, 2.5]) beam(m, [xR - 0.1, y, -W + 0.15], [xL + 0.1, y, -W + 0.15], 0.05, 0.05, mul(T.timber, 0.5), mul(T.timber, 0.5), [0, 1, 0], { capStart: false, capEnd: false });
    // Gutters and one downpipe.
    const slopeY = EAVE - ov * slope - 0.10;
    guttersAndPipe(m, T, { x0: xL - ov, x1: xR + ov, z: W + ov + 0.01, y: slopeY, pipeX: xR - 0.05, zSign: 1 });
    guttersAndPipe(m, T, { x0: xL - ov, x1: xR + ov, z: -(W + ov + 0.01), y: slopeY });
  } else {
    // Skillion: high at the back, low at the front, with two sliding doors.
    const HIGH = 4.6, LOW = 3.3, ov = 0.4, k = (HIGH - LOW) / (2 * W);
    const yBack = HIGH + ov * k, yFront = LOW - ov * k;
    shedRoofSlope(m, T, { x0: xL - ov, x1: xR + ov, zEave: W + ov, yEave: yFront, zRidge: -(W + ov), yRidge: yBack });
    const wLen = xR - xL;
    ribbedWall(m, xR, -W, -1, 0, wLen, 0.10, () => HIGH, Math.round(wLen / 0.8), 0.045, 0, -1, T.ironWall);
    const hz = (u) => HIGH - (HIGH - LOW) * (u / (2 * W));
    ribbedWall(m, xL, -W, 0, 1, 2 * W, 0.10, hz, 10, 0.045, -1, 0, T.ironWall);
    ribbedWall(m, xR, W, 0, -1, 2 * W, 0.10, (u) => hz(2 * W - u), 10, 0.045, 1, 0, T.ironWall);
    const lin = mul(T.iron, 0.30);
    flatQuad(m, [0, 0, 1], [[xR, 0.10, -W + 0.07], [xL, 0.10, -W + 0.07], [xL, HIGH, -W + 0.07], [xR, HIGH, -W + 0.07]], [lin]);
    flatQuad(m, [1, 0, 0], [[xL + 0.07, 0.10, -W], [xL + 0.07, 0.10, W], [xL + 0.07, LOW, W], [xL + 0.07, HIGH, -W]], [lin]);
    flatQuad(m, [-1, 0, 0], [[xR - 0.07, 0.10, W], [xR - 0.07, 0.10, -W], [xR - 0.07, HIGH, -W], [xR - 0.07, LOW, W]], [lin]);
    // Front: four posts, a door rail, two sliding leaves (one drawn across the other).
    for (let i = 0; i <= 3; i += 1) post(m, xL + 0.20 + (wLen - 0.40) * (i / 3), W - 0.10, LOW - 0.15, T);
    beam(m, [xL + 0.1, LOW - 0.22, W + 0.10], [xR - 0.1, LOW - 0.22, W + 0.10], 0.05, 0.06, mul(T.timber, 0.6), mul(T.timber, 0.6), [0, 1, 0]);
    const leaf = (xa, xb, z) => ribbedWall(m, xa, z, 1, 0, xb - xa, 0.18, () => LOW - 0.34, Math.round((xb - xa) / 0.75), 0.04, 0, 1, mul(T.ironWall, 0.9));
    leaf(xL + 0.2, -0.3, W + 0.05);
    leaf(-3.4, 2.6, W + 0.17);
    // Slope-side beams under the roof.
    for (let i = 0; i <= 3; i += 1) {
      const x = xL + 0.20 + (wLen - 0.40) * (i / 3);
      beam(m, [x, LOW - 0.1, W - 0.10], [x, HIGH - 0.1, -W + 0.15], 0.045, 0.10, mul(T.timber, 0.5), mul(T.timber, 0.6), [1, 0, 0], { capStart: false, capEnd: false });
    }
    guttersAndPipe(m, T, { x0: xL - ov, x1: xR + ov, z: W + ov + 0.01, y: yFront - 0.10, pipeX: xR - 0.05, zSign: 1 });
  }

  if (variant === 'leanto') {
    // A lean-to against the +x gable end: one pitch falling away from the main wall.
    const hiX = xR, loX = 6.4, yHi = 3.35, yLo = 2.65;
    const V = [loX - hiX, yLo - yHi, 0];
    // Roof sheet: ribs run down the slope (x), repeating along z.
    const O = [hiX, yHi, -(W + 0.4)];
    const U = [0, 0, 2 * (W + 0.4)];
    let N = norm(cross(U, V));
    if (N[1] < 0) N = [-N[0], -N[1], -N[2]];
    corrugated(m, O, U, V, N, 8, 0.035, T.iron, 1.0, 0.92);
    const dn = [-N[0], -N[1], -N[2]];
    const off = 0.06;
    flatQuad(m, dn, [[hiX, yHi - off, -(W + 0.4)], [hiX, yHi - off, W + 0.4], [loX, yLo - off, W + 0.4], [loX, yLo - off, -(W + 0.4)]], [mul(T.iron, 0.42)]);
    flatQuad(m, [1, -0.2, 0], [[loX, yLo, -(W + 0.4)], [loX, yLo, W + 0.4], [loX, yLo - off, W + 0.4], [loX, yLo - off, -(W + 0.4)]], [mul(T.iron, 0.7)]);
    // Back wall, end wall, and two front posts.
    ribbedWall(m, 6.0, -W, -1, 0, 6.0 - xR, 0.10, () => 2.9, 4, 0.045, 0, -1, T.ironWall);
    const eh = (u) => 2.9 - 0.3 * (u / (2 * W)) * 0;
    ribbedWall(m, 6.0, -W, 0, 1, 2 * W, 0.10, eh, 10, 0.045, 1, 0, T.ironWall);
    post(m, 5.85, W - 0.15, 2.65, T);
    post(m, 3.35, W - 0.15, 3.1, T);
    beam(m, [3.35, 2.9, W - 0.15], [5.85, 2.65, W - 0.15], 0.05, 0.10, mul(T.timber, 0.55), mul(T.timber, 0.6), [0, 1, 0]);
    beam(m, [loX, yLo - 0.10, -(W + 0.4)], [loX, yLo - 0.10, W + 0.4], 0.075, 0.055, mul(T.iron, 0.62), mul(T.iron, 0.62), [0, 1, 0]);
  }
  return m.geometry();
}

/* ------------------------------------------------------------------ */
/* Farm dam bank                                                        */
/* ------------------------------------------------------------------ */

const smooth = (t) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };

/**
 * The earth around a farm dam, as one ring mesh. `dams` is a list of
 * { x, z, level, crest, edge(angle) -> radius, groundY(x, z) }; the water is a separate mesh
 * on the same outline. Seen from the water outward: a wet mud lip, a flat shore, then either
 * a grassed crest that steps down a 1:3 batter to the paddock (a raised wall wherever the
 * ground falls away) or, in two stock-access sectors, a trampled margin of bare soil 1 to 3 m
 * wide where the crest is cut down to a ramp.
 *
 * `colors`: linear RGB arrays { mud, crest, skirt, soil }, already at the paddock's gain.
 * `seg`: angular segments, the same count the water uses.
 */
export function makeDamBankGeometry(dams, { seg = 48, colors }) {
  const positions = [], cols = [], indices = [];
  const R = 6;
  let base = 0;
  dams.forEach((dam, di) => {
    const rnd = rng(9100 + di * 17 + Math.round(dam.x * 3 + dam.z * 5));
    const a1 = rnd() * TAU, a2 = a1 + 2.0 + rnd() * 1.6;
    const trample = (a) => {
      let t = 0;
      for (const c of [a1, a2]) {
        let d = Math.abs(((a - c + Math.PI) % TAU + TAU) % TAU - Math.PI);
        t = Math.max(t, smooth(1 - d / 0.62));
      }
      return t;
    };
    const { x: dx, z: dz, level, crest, edge, groundY } = dam;
    for (let i = 0; i <= seg; i += 1) {
      const a = (i / seg) * TAU, sn = Math.sin(a), cs = Math.cos(a);
      const e = edge(a);
      const t = trample(a);
      const mw = 0.9 + 2.1 * t;
      const cy = crest + (level + 0.10 - crest) * t;
      const crestW = 0.55 * (1 - t) + 0.15;
      const r3 = e + mw + crestW;
      const gAt = (r) => groundY(dx + sn * r, dz + cs * r);
      const h = Math.max(0.12, cy - gAt(r3 + 0.6));
      const batter = 3 * h * (1 - 0.35 * t) + 0.4;
      const radii = [e, e + 0.30 + 0.25 * t, e + mw, r3, r3 + batter * 0.5, r3 + batter];
      const wob = 0.9 + 0.2 * Math.sin(a * 11 + di);
      for (let ring = 0; ring < R; ring += 1) {
        const r = radii[ring];
        const gx = dx + sn * r, gz = dz + cs * r;
        const g = gAt(r);
        let y, c;
        if (ring === 0) { y = level + 0.02; c = colors.mud; }
        else if (ring === 1) { y = level + 0.05; c = mix(colors.mud, colors.soil, 0.45 + 0.4 * t); }
        else if (ring === 2) { y = cy; c = mix(mix(colors.crest, colors.soil, 0.2), colors.soil, t); }
        else if (ring === 3) { y = cy; c = mix(colors.crest, colors.soil, t * 0.75); }
        else if (ring === 4) { y = Math.max(g + 0.04, cy - h * 0.5); c = mix(colors.crest, colors.skirt, 0.6); }
        else { y = Math.min(cy - 0.02, g + 0.03); c = colors.skirt; }
        // Hoof-worked ground carries a little tone noise.
        const k = ring === 2 || ring === 1 ? wob * (1 - 0.1 * t * Math.sin(a * 37)) : 1;
        positions.push(gx, y, gz);
        cols.push(c[0] * k, c[1] * k, c[2] * k);
      }
    }
    for (let i = 0; i < seg; i += 1) {
      for (let ring = 0; ring < R - 1; ring += 1) {
        const a0 = base + i * R + ring, b0 = base + (i + 1) * R + ring;
        indices.push(a0, b0 + 1, b0, a0, a0 + 1, b0 + 1);
      }
    }
    base = positions.length / 3;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
