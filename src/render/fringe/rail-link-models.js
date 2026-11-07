// Airport rail link models: viaduct, rail embankment, two-car shuttle unit and maintenance yard.
//
// Pure geometry builders: no scene access, no globals, deterministic (the same arguments give
// byte-identical buffers). Every builder returns merged, indexed BufferGeometry objects with
// `position`, `normal` and `color`. Dimensions are real metres, in the link root's local frame
// (x along the corridor, y up, z across). The caller makes the materials: the vertex colour is the
// real linear colour from the taste tokens (taken down by TONE for the fringe lighting gain) times
// a baked occlusion term, so the materials are plain white `vertexColors` standards.
//
// Scale law used throughout: an adult is 1.70 m, a platform is 1.0 m above rail, a gauge is 1.435 m,
// a contact wire is 5.2 m over rail, a metro door is 1.3 m wide and 2.0 m tall.
import * as THREE from 'three';
import { TASTE } from '../taste-tokens.js';

/* ------------------------------------------------------------------ */
/* Colour                                                              */
/* ------------------------------------------------------------------ */

/** The fringe lights a standard material 4-5x brighter than its albedo; this takes the tokens back down. */
const TONE = 0.66;
const _c = new THREE.Color();
const rgb = (hex, k = TONE) => { _c.set(hex); return [_c.r * k, _c.g * k, _c.b * k]; };
const scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (t) => Math.max(0, Math.min(1, t));

const P = {
  conc: rgb(TASTE.built.concrete, 0.74),
  concLight: rgb(TASTE.built.kerb, 0.80),
  concDark: rgb(TASTE.built.concrete, 0.50),
  deck: rgb(TASTE.built.concrete, 0.66),
  paving: rgb(TASTE.built.kerb, 0.70),
  ballast: rgb('#8c8377', 0.56),
  ballastDark: rgb('#5d5749', 0.58),
  sleeper: rgb('#6a5a48', 0.70),
  sleeperAlt: rgb('#7d6d58', 0.70),
  steel: rgb('#8d949a', 0.80),
  steelDark: rgb('#4d5359', 0.80),
  steelLight: rgb('#b9bec2', 0.78),
  railHead: rgb('#a3a8ab', 0.80),
  wire: rgb('#2b2f33', 0.90),
  insulator: rgb('#c9c2b2', 0.70),
  gold: rgb(TASTE.accent.gold, 0.90),
  navy: rgb(TASTE.accent.navy, 0.90),
  red: rgb(TASTE.accent.red, 0.90),
  doorBlue: rgb(TASTE.venue.courtPlay, 0.88),
  glass: rgb('#1d2a36', 1.0),
  body: rgb(TASTE.built.marking, 0.86),
  roofSilver: rgb('#c4c9cc', 0.78),
  under: rgb('#2a2e33', 1.0),
  grassA: rgb(TASTE.ground.grassLush, 0.50),
  grassB: rgb(TASTE.ground.grassDry, 0.50),
  soil: rgb(TASTE.ground.soil, 0.50),
  track: rgb(TASTE.ground.track, 0.52),
  post: rgb('#6d5a43', 0.72),
  wireFence: rgb('#8b8f92', 0.80),
  chain: rgb('#9aa0a4', 0.74),
  wall: rgb('#c4bba6', 0.74),
  wallDark: rgb('#a89f8b', 0.72),
  roofIron: rgb(TASTE.built.roofIron, 0.74),
  roofSlate: rgb(TASTE.built.roofSlate, 0.80),
  timber: rgb(TASTE.built.timber, 0.64),
  hiVis: rgb(TASTE.accent.gold, 0.96),
  warm: rgb('#fff2cf', 1.0),
};

/* ------------------------------------------------------------------ */
/* Mesher                                                              */
/* ------------------------------------------------------------------ */

const isNum = (v) => typeof v === 'number';

/** Accumulates flat-shaded polygons with per-vertex colour. */
export class Mesher {
  constructor(o = {}) { this.pos = []; this.nor = []; this.col = []; this.idx = []; this.uv = o.uv ? [] : null; }

  get tris() { return this.idx.length / 3; }

  /**
   * One flat convex polygon (fan triangulated). `hint` is any vector pointing to the outside:
   * the winding is flipped to agree with it, so callers never reason about handedness.
   */
  poly(pts, cols, hint, uvs) {
    const n = pts.length;
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < n; i += 1) {
      const a = pts[i], b = pts[(i + 1) % n];
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-10) return;
    nx /= len; ny /= len; nz /= len;
    let order = pts.map((_, i) => i);
    if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { order = order.reverse(); nx = -nx; ny = -ny; nz = -nz; }
    const base = this.pos.length / 3;
    for (const i of order) {
      const p = pts[i];
      const c = isNum(cols[0]) ? cols : cols[i];
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      this.col.push(c[0], c[1], c[2]);
      if (this.uv) { const t = uvs ? uvs[i] : [0, 0]; this.uv.push(t[0], t[1]); }
    }
    for (let i = 1; i < n - 1; i += 1) this.idx.push(base, base + i, base + i + 1);
  }

  /** Triangle fan from `centre` over a closed ring (any star-shaped outline). */
  fan(ring, centre, col, hint) {
    const n = ring.length;
    for (let i = 0; i < n; i += 1) this.poly([centre, ring[i], ring[(i + 1) % n]], col, hint);
  }

  /**
   * Axis-aligned box. `ao` is the colour factor at the foot (1 at the top); the underside is darker.
   * `skip` is a string of faces to leave out ('-y' for a box standing on something).
   */
  box(x0, x1, y0, y1, z0, z1, col, o = {}) {
    const ao = o.ao ?? 0.84;
    const hgt = (y1 - y0) || 1;
    const f = (y) => ao + (1 - ao) * clamp01((y - y0) / hgt);
    const skip = o.skip ?? '';
    const top = o.top ?? col;
    const shade = (c, y, k = 1) => { const m = f(y) * k; return [c[0] * m, c[1] * m, c[2] * m]; };
    const face = (key, pts, hint, c, k = 1) => {
      if (skip.includes(key)) return;
      this.poly(pts, pts.map((p) => shade(c, p[1], k)), hint);
    };
    face('+x', [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0], col);
    face('-x', [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], [-1, 0, 0], col);
    face('+z', [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], col);
    face('-z', [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1], col);
    face('+y', [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0], top);
    face('-y', [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], col, 0.7);
  }

  /**
   * A loft between closed 2D rings along an axis. `rings` is [{ s, pts: [[u, v], ...] }] with the same
   * point count; axis 'x' maps (u, v) to (z, y), axis 'y' to (x, z), axis 'z' to (x, y).
   * `edgeCol(seg, edge, mid)` gives the colour of one band; faces looking down are darkened.
   */
  loft(axis, rings, edgeCol, o = {}) {
    const to3 = (s, u, v) => (axis === 'x' ? [s, v, u] : axis === 'y' ? [u, s, v] : [u, v, s]);
    const dir = axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1];
    const aoY = o.aoY; // [y0, height, minFactor]
    const f = (y) => (aoY ? aoY[2] + (1 - aoY[2]) * clamp01((y - aoY[0]) / aoY[1]) : 1);
    const down = o.down ?? 0.68;
    const cen = rings.map((r) => {
      let cu = 0, cv = 0;
      for (const p of r.pts) { cu += p[0]; cv += p[1]; }
      return [cu / r.pts.length, cv / r.pts.length];
    });
    for (let k = 0; k + 1 < rings.length; k += 1) {
      const A = rings[k], B = rings[k + 1];
      const n = A.pts.length;
      for (let e = 0; e < n; e += 1) {
        const a = A.pts[e], b = A.pts[(e + 1) % n], c = B.pts[(e + 1) % n], d = B.pts[e];
        const mu = (a[0] + b[0] + c[0] + d[0]) / 4 - (cen[k][0] + cen[k + 1][0]) / 2;
        const mv = (a[1] + b[1] + c[1] + d[1]) / 4 - (cen[k][1] + cen[k + 1][1]) / 2;
        const hint = to3(0, mu, mv);
        const pts = [to3(A.s, a[0], a[1]), to3(A.s, b[0], b[1]), to3(B.s, c[0], c[1]), to3(B.s, d[0], d[1])];
        const base = edgeCol(k, e, pts);
        if (!base) continue;
        const lookDown = hint[1] < -Math.hypot(hint[0], hint[2]) * 0.5 ? down : 1;
        this.poly(pts, pts.map((p) => scale(base, f(p[1]) * lookDown)), hint);
      }
    }
    if (o.caps !== false) {
      const capCol = o.capCol ?? [0.1, 0.1, 0.1];
      const ends = [[rings[0], cen[0], -1], [rings[rings.length - 1], cen[rings.length - 1], 1]];
      for (const [r, c, sgn] of ends) {
        const ring3 = r.pts.map((p) => to3(r.s, p[0], p[1]));
        this.fan(ring3, to3(r.s, c[0], c[1]), capCol, [dir[0] * sgn, dir[1] * sgn, dir[2] * sgn]);
      }
    }
  }

  /** A bar of rectangular section between two points (w across `up` x axis, h along up). */
  bar(p0, p1, w, h, col, o = {}) {
    const a = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const L = Math.hypot(a[0], a[1], a[2]);
    if (L < 1e-6) return;
    a[0] /= L; a[1] /= L; a[2] /= L;
    let up = [0, 1, 0];
    if (Math.abs(a[1]) > 0.97) up = [1, 0, 0];
    const s = [a[1] * up[2] - a[2] * up[1], a[2] * up[0] - a[0] * up[2], a[0] * up[1] - a[1] * up[0]];
    const sl = Math.hypot(s[0], s[1], s[2]);
    s[0] /= sl; s[1] /= sl; s[2] /= sl;
    const t = [s[1] * a[2] - s[2] * a[1], s[2] * a[0] - s[0] * a[2], s[0] * a[1] - s[1] * a[0]];
    const corner = (p, i, j) => [
      p[0] + s[0] * w * 0.5 * i + t[0] * h * 0.5 * j,
      p[1] + s[1] * w * 0.5 * i + t[1] * h * 0.5 * j,
      p[2] + s[2] * w * 0.5 * i + t[2] * h * 0.5 * j,
    ];
    const ring = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    const hints = [t, [-s[0], -s[1], -s[2]], [-t[0], -t[1], -t[2]], s];
    const shadeEnd = o.ao ?? 1;
    for (let e = 0; e < 4; e += 1) {
      const [i0, j0] = ring[e], [i1, j1] = ring[(e + 1) % 4];
      const q = [corner(p0, i0, j0), corner(p0, i1, j1), corner(p1, i1, j1), corner(p1, i0, j0)];
      const k = hints[e][1] < -0.5 ? 0.78 : 1;
      this.poly(q, q.map((p) => scale(col, k * (p[1] < Math.min(p0[1], p1[1]) + 0.01 ? shadeEnd : 1))), hints[e]);
    }
    if (o.caps) {
      this.poly(ring.map(([i, j]) => corner(p0, i, j)), col, [-a[0], -a[1], -a[2]]);
      this.poly(ring.map(([i, j]) => corner(p1, i, j)), col, a);
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

const ngon = (n, rx, rz, cu = 0, cv = 0, rot = 0) => {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const a = rot + (i / n) * Math.PI * 2;
    out.push([cu + Math.cos(a) * rx, cv + Math.sin(a) * rz]);
  }
  return out;
};

/** Upright n-gon frustum: rx/rz are half sizes at the foot and the top. */
function frustum(m, cx, cz, y0, y1, rx0, rz0, rx1, rz1, n, col, o = {}) {
  const ring = (y, rx, rz) => ({ s: y, pts: ngon(n, rx, rz, cx, cz, o.rot ?? Math.PI / n) });
  m.loft('y', [ring(y0, rx0, rz0), ring(y1, rx1, rz1)], () => col, {
    aoY: [y0, Math.max(0.4, (y1 - y0) * 0.8), o.ao ?? 0.8], capCol: o.capCol ?? col, caps: o.caps !== false,
  });
}

/** Wheel or roller with its axis along z. */
function cylZ(m, cx, cy, z0, z1, r, n, col, o = {}) {
  m.loft('z', [{ s: z0, pts: ngon(n, r, r, cx, cy) }, { s: z1, pts: ngon(n, r, r, cx, cy) }], () => col, { capCol: o.capCol ?? col });
}

/* ------------------------------------------------------------------ */
/* Shared railway parts                                                */
/* ------------------------------------------------------------------ */

const GAUGE_HALF = 0.7175;

/** Ballast bed, sleepers and rails along x. Returns nothing; adds to the two meshers. */
function permanentWay(M, S, o) {
  const { x0, x1, z, yBase, pitch = 0.9, bedTop = 0.205, bedHalf = 1.75, shoulder = 2.55, seed = 0 } = o;
  // ballast bed with shoulders (profile in z, y)
  const ringB = [[-shoulder, yBase], [shoulder, yBase], [bedHalf, yBase + bedTop], [-bedHalf, yBase + bedTop]].map(([u, v]) => [u + z, v]);
  M.loft('x', [{ s: x0, pts: ringB }, { s: x1, pts: ringB }], (k, e) => (e === 2 ? P.ballast : P.ballastDark), { caps: true, capCol: P.ballastDark, down: 0.8 });
  // sleepers
  const n = Math.max(2, Math.floor((x1 - x0 - 0.6) / pitch));
  const yS0 = yBase + bedTop - 0.02;
  const yS1 = yS0 + 0.22;
  for (let i = 0; i < n; i += 1) {
    const x = x0 + 0.3 + (i + 0.5) * ((x1 - x0 - 0.6) / n);
    const wob = (((i * 7919 + seed * 104729) % 13) - 6) * 0.004;
    const c = (i + seed) % 5 === 0 ? P.sleeperAlt : P.sleeper;
    M.box(x - 0.13 + wob, x + 0.13 + wob, yS0, yS1, z - 1.25, z + 1.25, c, { skip: '-y', ao: 0.86 });
  }
  // rails: foot, web, head as three thin boxes each
  for (const s of [-1, 1]) {
    const zc = z + s * GAUGE_HALF;
    S.box(x0 + 0.1, x1 - 0.1, yS1, yS1 + 0.035, zc - 0.075, zc + 0.075, P.steelDark, { skip: '-y', ao: 0.9 });
    S.box(x0 + 0.1, x1 - 0.1, yS1 + 0.035, yS1 + 0.125, zc - 0.025, zc + 0.025, P.steelDark, { skip: '-y', ao: 1 });
    S.box(x0 + 0.1, x1 - 0.1, yS1 + 0.125, yS1 + 0.18, zc - 0.04, zc + 0.04, P.railHead, { skip: '-y', ao: 1 });
  }
  return yS1 + 0.18;
}

/** A buffer stop: two raked posts, a beam and a hi-vis face. Faces +x when dir = 1. */
function bufferStop(S, M, x, z, yRail, dir) {
  for (const s of [-1, 1]) {
    const zc = z + s * GAUGE_HALF;
    S.bar([x, yRail - 0.12, zc], [x + dir * 0.18, yRail + 0.78, zc], 0.2, 0.16, P.steelDark, { caps: true });
  }
  S.box(x + dir * 0.10 - 0.12, x + dir * 0.10 + 0.12, yRail + 0.62, yRail + 0.86, z - 1.05, z + 1.05, P.steel, { ao: 0.9 });
  M.box(x + dir * 0.10 - 0.13, x + dir * 0.10 + 0.13, yRail + 0.70, yRail + 0.80, z - 1.06, z + 1.06, P.hiVis, { ao: 1 });
  M.box(x - 0.25, x + 0.25, yRail - 0.22, yRail - 0.1, z - 1.2, z + 1.2, P.concDark, { skip: '-y', ao: 0.8 });
}

/* ------------------------------------------------------------------ */
/* Viaduct                                                             */
/* ------------------------------------------------------------------ */

/**
 * Elevated box-girder viaduct for a single electrified track (25 kV AC overhead line), a platform with
 * canopy and a small station building, hammerhead piers on pile caps and abutment blocks.
 *
 *   o.span       deck length between the abutment faces, m
 *   o.yTop       top of the girder slab, m
 *   o.pierX      pier positions along x
 *   o.supportAt  (x, z) -> the surface a foundation stands on
 *   o.platformX  [x0, x1] of the platform; the canopy covers all but its western 5 m
 * Returns { matte, steel, info } where info carries the datum heights the rest of the link uses.
 */
export function buildViaduct(o) {
  const { span, yTop, pierX, supportAt } = o;
  const M = new Mesher();
  const S = new Mesher();
  const half = span * 0.5 + 0.3;
  const depth = 1.7;
  const ySoffit = yTop - depth;
  const bearing = 0.15;

  /* --- box girder, one piece per span, with a 0.10 m shadow gap over each pier --- */
  const G = [[-4.0, yTop], [4.0, yTop], [4.0, yTop - 0.24], [2.95, yTop - 0.52], [2.3, ySoffit], [-2.3, ySoffit], [-2.95, yTop - 0.52], [-4.0, yTop - 0.24]];
  const gCol = (k, e) => [P.deck, P.conc, P.concDark, P.concDark, P.under, P.concDark, P.concDark, P.conc][e];
  const edges = [-half, ...pierX, half];
  const pieces = [];
  for (let i = 0; i + 1 < edges.length; i += 1) {
    pieces.push([edges[i] + (i > 0 ? 0.05 : 0), edges[i + 1] - (i + 2 < edges.length ? 0.05 : 0)]);
  }
  for (const [xa, xb] of pieces) {
    M.loft('x', [{ s: xa, pts: G }, { s: xb, pts: G }], gCol, { capCol: P.under, down: 0.62 });
    // parapets, coping and pilasters
    for (const s of [-1, 1]) {
      const z0 = s > 0 ? 3.72 : -4.0;
      const z1 = s > 0 ? 4.0 : -3.72;
      M.box(xa, xb, yTop, yTop + 1.05, z0, z1, P.conc, { skip: '-y', ao: 0.78 });
      M.box(xa, xb, yTop + 1.05, yTop + 1.16, z0 - 0.06, z1 + 0.06, P.concLight, { ao: 0.9 });
      const nP = Math.max(2, Math.round((xb - xa) / 6));
      for (let i = 0; i < nP; i += 1) {
        const x = xa + (i + 0.5) * ((xb - xa) / nP);
        const zo = s > 0 ? z1 : z0;
        M.box(x - 0.26, x + 0.26, yTop - 0.35, yTop + 1.05, s > 0 ? zo : zo - 0.1, s > 0 ? zo + 0.1 : zo, P.concLight, { skip: '-y', ao: 0.7 });
      }
    }
  }

  /* --- deck furniture: cable trough on the city side, track on ballast --- */
  const masts = o.mastX ?? [-34, 0, 34];
  const bays = [];
  const trough = (xa, xb) => { if (xb - xa > 0.4) { M.box(xa, xb, yTop, yTop + 0.3, -3.58, -3.12, P.concDark, { skip: '-y', ao: 0.8 }); M.box(xa + 0.02, xb - 0.02, yTop + 0.3, yTop + 0.34, -3.62, -3.08, P.concLight, { ao: 1 }); } };
  let cursor = -half + 0.5;
  for (const mx of masts) { trough(cursor, mx - 0.8); cursor = mx + 0.8; }
  trough(cursor, half - 0.5);
  void bays;

  // The ballast bed runs the whole deck; the expansion gaps are bridged by the sleepers and rails.
  const railTop = permanentWay(M, S, { x0: -half + 0.35, x1: half - 0.35, z: 0, yBase: yTop, pitch: 0.9, shoulder: 2.55, seed: 3 });

  /* --- hammerhead piers on pile caps --- */
  const capUnder = ySoffit - bearing;
  const hammerH = 1.35;
  const info = { railTop, yTop, ySoffit, piers: [] };
  for (const px of pierX) {
    const g = supportAt(px, 0);
    const colTop = capUnder - hammerH;
    const colH = colTop - (g + 0.5);
    if (colH < 1.2) {
      // Short bay: a retaining block rather than a column.
      M.box(px - 1.7, px + 1.7, g - 0.4, capUnder, -2.6, 2.6, P.conc, { ao: 0.7 });
      M.box(px - 1.9, px + 1.9, capUnder - 0.3, capUnder, -2.9, 2.9, P.concLight, { ao: 0.9 });
    } else {
      M.box(px - 2.3, px + 2.3, g - 0.15, g + 0.55, -2.3, 2.3, P.concDark, { ao: 0.62 });
      frustum(M, px, 0, g + 0.55, colTop + 0.02, 0.95, 1.4, 0.78, 1.2, 8, P.conc, { ao: 0.62 });
      const H = [[-2.85, capUnder], [2.85, capUnder], [2.85, capUnder - 0.36], [1.15, capUnder - hammerH], [-1.15, capUnder - hammerH], [-2.85, capUnder - 0.36]];
      M.loft('x', [{ s: px - 0.95, pts: H }, { s: px + 0.95, pts: H }], (k, e) => (e === 3 ? P.concDark : e === 0 ? P.concLight : P.conc), { capCol: P.conc, down: 0.6 });
    }
    for (const s of [-1, 1]) M.box(px - 0.3, px + 0.3, capUnder, capUnder + bearing, s * 2.0 - 0.28, s * 2.0 + 0.28, P.under, { ao: 1 });
    // deck drainage: a downpipe on each outer web, clipped at the soffit, running to the pile cap
    if (colH >= 1.2) {
      for (const s of [-1, 1]) {
        S.bar([px + 1.15, yTop - 0.7, s * 2.72], [px + 1.15, g + 0.5, s * 2.72], 0.1, 0.1, P.steelDark, {});
        S.box(px + 1.15 - 0.09, px + 1.15 + 0.09, yTop - 0.78, yTop - 0.66, s * 2.72 - 0.09, s * 2.72 + 0.09, P.steel, { ao: 1 });
        S.box(px + 1.15 - 0.09, px + 1.15 + 0.09, ySoffit + 0.3, ySoffit + 0.42, s * 2.4 - 0.09, s * 2.4 + 0.09, P.steel, { ao: 1 });
      }
    }
    info.piers.push({ x: px, ground: g });
  }

  /* --- abutment blocks and buffer stops --- */
  for (const sx of [-1, 1]) {
    const x = sx * (half - 1.3);
    const g = supportAt(x, 0);
    M.box(x - 1.7, x + 1.7, g - 0.4, capUnder, -3.6, 3.6, P.conc, { ao: 0.62 });
    M.box(x - 1.9, x + 1.9, capUnder - 0.32, capUnder, -3.8, 3.8, P.concLight, { ao: 0.9 });
    M.box(x - 2.0, x + 2.0, g - 0.45, g + 0.35, -3.9, 3.9, P.concDark, { ao: 0.6 });
    for (const s of [-1, 1]) M.box(x - 0.3, x + 0.3, capUnder, capUnder + bearing, s * 2.0 - 0.28, s * 2.0 + 0.28, P.under, { ao: 1 });
    bufferStop(S, M, sx * (half - 0.6), 0, yTop + 0.205 + 0.2, -sx);
    info.piers.push({ x, ground: g, abutment: true });
  }

  /* --- platform, canopy and station building (city side is -z, the platform is on +z) --- */
  const [px0, px1] = o.platformX ?? [-22.5, -3.0];
  const yPlat = railTop + 1.0;
  M.box(px0, px1, yTop, yPlat, 1.62, 3.72, P.concLight, { skip: '-y', ao: 0.78, top: P.paving });
  M.box(px0, px1, yPlat - 0.1, yPlat + 0.02, 1.54, 1.70, P.concLight, { ao: 1 });
  M.box(px0 + 0.1, px1 - 0.1, yPlat + 0.02, yPlat + 0.04, 1.62, 2.22, P.gold, { skip: '-y', ao: 1 });
  // end guard rails on the platform
  for (const x of [px0 + 0.1, px1 - 0.1]) {
    S.box(x - 0.04, x + 0.04, yPlat, yPlat + 1.05, 1.72, 1.80, P.steel, { skip: '-y', ao: 0.9 });
    S.box(x - 0.04, x + 0.04, yPlat, yPlat + 1.05, 3.6, 3.68, P.steel, { skip: '-y', ao: 0.9 });
    S.box(x - 0.04, x + 0.04, yPlat + 0.95, yPlat + 1.03, 1.72, 3.68, P.steel, { ao: 1 });
  }
  const cx0 = px0 + 5.1, cx1 = px1 - 0.4;
  const postZ = 3.25;
  const roofY = (z) => 12.36 + ((12.78 - 12.36) / 2.15) * (z - 1.80);
  const nPost = 4;
  const postXs = [];
  for (let i = 0; i < nPost; i += 1) postXs.push(cx0 + 0.8 + (i / (nPost - 1)) * (cx1 - cx0 - 1.6));
  const postTop = roofY(postZ);
  for (const x of postXs) {
    S.box(x - 0.09, x + 0.09, yPlat + 0.04, postTop, postZ - 0.09, postZ + 0.09, P.steel, { skip: '-y', ao: 0.82 });
    S.box(x - 0.24, x + 0.24, yPlat, yPlat + 0.05, postZ - 0.24, postZ + 0.24, P.steelDark, { ao: 1 });
    S.box(x - 0.14, x + 0.14, postTop - 0.1, postTop, postZ - 0.14, postZ + 0.14, P.steelDark, { ao: 1 });
  }
  const R = [[1.80, 12.50], [3.95, 12.92], [3.95, 12.78], [1.80, 12.36]];
  S.loft('x', [{ s: cx0, pts: R }, { s: cx1, pts: R }], (k, e) => (e === 0 ? P.roofSilver : e === 2 ? P.steelDark : P.steel), { capCol: P.steel, down: 0.6 });
  M.box(cx0, cx1, 12.14, 12.56, 1.72, 1.84, P.navy, { ao: 0.9 });
  const nRib = Math.max(3, Math.round((cx1 - cx0) / 2.0));
  for (let i = 0; i <= nRib; i += 1) {
    const x = cx0 + 0.15 + (i / nRib) * (cx1 - cx0 - 0.3);
    S.bar([x, 12.53, 1.85], [x, 12.95, 3.92], 0.07, 0.05, P.steelLight, {});
  }
  // benches and a lollipop sign
  for (const x of [px0 + 7.5, px0 + 13.2]) {
    M.box(x - 0.85, x + 0.85, yPlat + 0.42, yPlat + 0.48, 2.78, 3.2, P.timber, { ao: 0.9 });
    M.box(x - 0.85, x + 0.85, yPlat + 0.50, yPlat + 0.92, 3.16, 3.2, P.timber, { ao: 0.9 });
    for (const dx of [-0.7, 0.7]) S.box(x + dx - 0.03, x + dx + 0.03, yPlat, yPlat + 0.42, 2.8, 3.18, P.steelDark, { skip: '-y', ao: 0.9 });
  }
  S.box(px0 + 9.9 - 0.04, px0 + 9.9 + 0.04, yPlat, yPlat + 2.3, 2.1, 2.18, P.steelDark, { skip: '-y', ao: 0.9 });
  M.box(px0 + 9.9 - 0.04, px0 + 9.9 + 0.04, yPlat + 1.55, yPlat + 2.35, 1.5, 2.5, P.navy, { ao: 1 });
  // stairs from the platform's west end down to the deck walkway
  {
    const nS = 6;
    const rise = (yPlat - (yTop + 0.02)) / nS;
    for (let i = 0; i < nS; i += 1) {
      const xa = px0 - 0.32 * (i + 1), xb = px0 - 0.32 * i;
      M.box(xa, xb, yTop, yPlat - rise * (i + 1), 2.0, 3.5, P.concLight, { skip: '-y', ao: 0.85 });
    }
    for (const z of [1.95, 3.55]) S.box(px0 - 1.92, px0, yPlat - 0.06 + 0.0, yPlat + 0.02, z - 0.03, z + 0.03, P.steel, { ao: 1 });
  }
  // canopy lamps and the name board on the fascia
  for (const x of postXs) M.box(x - 0.45, x + 0.45, 12.30, 12.36, 2.1, 2.32, P.warm, { ao: 1 });
  M.box((cx0 + cx1) / 2 - 1.3, (cx0 + cx1) / 2 + 1.3, 12.24, 12.50, 1.68, 1.72, P.gold, { ao: 1 });
  // small station building at the western end of the platform
  {
    const bx0 = px0 + 0.4, bx1 = px0 + 4.5;
    const wy0 = yPlat, wy1 = yPlat + 2.6;
    M.box(bx0, bx1, wy0, wy1, 1.95, 3.7, P.wall, { skip: '-y', ao: 0.76 });
    M.box(bx0 - 0.28, bx1 + 0.28, wy1, wy1 + 0.2, 1.7, 3.95, P.roofSlate, { ao: 0.9 });
    M.box(bx0 - 0.28, bx1 + 0.28, wy1 + 0.2, wy1 + 0.26, 1.7, 3.95, P.roofIron, { ao: 1 });
    M.box(bx0 + 0.7, bx0 + 1.8, wy0, wy0 + 2.1, 1.91, 1.95, P.under, { skip: '-y', ao: 1 });
    for (const wx of [bx0 + 2.4, bx0 + 3.4]) M.box(wx, wx + 0.8, wy0 + 1.0, wy0 + 1.9, 1.92, 1.95, P.glass, { ao: 1 });
    M.box(bx0 + 0.5, bx1 - 0.1, wy1 - 0.34, wy1 - 0.08, 1.92, 1.96, P.navy, { ao: 1 });
    M.box(bx0 - 0.04, bx0 + 0.18, wy0, wy1, 1.9, 3.74, P.wallDark, { skip: '-y', ao: 0.8 });
  }

  /* --- overhead line equipment: 25 kV AC, masts every ~34 m on the city side --- */
  const contactY = railTop + 5.2;
  const mastZ = -2.95;
  const stag = (i) => (i % 2 ? 0.2 : -0.2);
  masts.forEach((mx) => {
    S.box(mx - 0.30, mx + 0.30, yTop, yTop + 0.07, mastZ - 0.27, mastZ + 0.27, P.steelDark, { ao: 1 });
    frustum(S, mx, mastZ, yTop + 0.07, contactY + 1.0, 0.15, 0.20, 0.10, 0.14, 4, P.steelLight, { ao: 0.8, rot: Math.PI / 4 });
    frustum(S, mx, mastZ, yTop + 0.07, yTop + 1.2, 0.20, 0.25, 0.16, 0.20, 4, P.steelDark, { ao: 0.8, rot: Math.PI / 4 });
    S.bar([mx, contactY + 0.68, mastZ], [mx, contactY + 0.66, -0.15], 0.09, 0.09, P.steel, { caps: true });
    S.bar([mx, contactY - 0.1, mastZ], [mx, contactY + 0.62, -0.85], 0.06, 0.06, P.steel, { caps: true });
    S.bar([mx, contactY + 0.66, -0.15], [mx, contactY + 0.08, 0.0], 0.05, 0.05, P.steel, { caps: true });
    cylZ(S, mx, contactY + 0.68, mastZ + 0.2, mastZ + 0.62, 0.11, 6, P.insulator);
  });
  const sagY = (t) => 0.42 * 4 * t * (1 - t);
  for (let b = 0; b + 1 < masts.length; b += 1) {
    const xa = masts[b], xb = masts[b + 1];
    const segs = 6;
    for (let k = 0; k < segs; k += 1) {
      const t0 = k / segs, t1 = (k + 1) / segs;
      const xa0 = xa + (xb - xa) * t0, xa1 = xa + (xb - xa) * t1;
      S.bar([xa0, contactY + 0.66 - sagY(t0), 0.0], [xa1, contactY + 0.66 - sagY(t1), 0.0], 0.05, 0.05, P.wire, {});
      const z0 = stag(b) + (stag(b + 1) - stag(b)) * t0, z1 = stag(b) + (stag(b + 1) - stag(b)) * t1;
      S.bar([xa0, contactY, z0], [xa1, contactY, z1], 0.05, 0.05, P.wire, {});
    }
    for (const t of [0.25, 0.5, 0.75]) {
      const x = xa + (xb - xa) * t;
      S.bar([x, contactY + 0.66 - sagY(t), 0.0], [x, contactY, stag(b) + (stag(b + 1) - stag(b)) * t], 0.025, 0.025, P.wire, {});
    }
  }
  info.contactY = contactY;
  info.mastX = masts;
  info.platform = { x0: px0, x1: px1, y: yPlat };
  return { matte: M.geometry(), steel: S.geometry(), info };
}

/* ------------------------------------------------------------------ */
/* Rail embankment                                                     */
/* ------------------------------------------------------------------ */

/**
 * A raised rail bank with 1:2 batters: flat crest carrying one ballasted track, grass batters, a cess
 * drain and a post-and-wire fence at each toe, end batters at 1:2, buffer stops on the track.
 *
 *   o.x0, o.x1      crest extent along x (the bank is longer by the end batters)
 *   o.zc            crest centre line
 *   o.height        crest height over the highest toe, m
 *   o.groundAt      (x, z) -> ground height, so the toes sit on the crust
 */
export function buildEmbankment(o) {
  const { x0, x1, zc, height, groundAt } = o;
  const M = new Mesher();
  const S = new Mesher();
  const F = new Mesher();
  const crestHalf = 3.2;
  const slope = 2; // run per metre of rise
  const berm = 1.2;
  // crest height: over the highest ground in the footprint, so the crest is level
  let gMax = -Infinity;
  for (let x = x0 - 14; x <= x1 + 14; x += 4) for (let z = zc - 20; z <= zc + 20; z += 4) gMax = Math.max(gMax, groundAt(x, z));
  const yC = gMax + height;
  // The skin is a stack of rings round the crest rectangle: crest, quarter, half (berm starts), berm
  // end, three quarters, toe. Every point carries its own outward run so each slope is 1:2 over the
  // ground it actually stands on, and the toe lands on the sampled crust.
  const nSt = Math.max(4, Math.round((x1 - x0) / 4));
  const xs = [];
  for (let i = 0; i <= nSt; i += 1) xs.push(x0 + ((x1 - x0) * i) / nSt);
  const zlo = zc - crestHalf, zhi = zc + crestHalf;
  const base = [];
  base.push({ cx: x0, cz: zlo, ux: -1, uz: -1 });
  for (let i = 1; i < nSt; i += 1) base.push({ cx: xs[i], cz: zlo, ux: 0, uz: -1 });
  base.push({ cx: x1, cz: zlo, ux: 1, uz: -1 });
  base.push({ cx: x1, cz: zc, ux: 1, uz: 0 });
  base.push({ cx: x1, cz: zhi, ux: 1, uz: 1 });
  for (let i = nSt - 1; i >= 1; i -= 1) base.push({ cx: xs[i], cz: zhi, ux: 0, uz: 1 });
  base.push({ cx: x0, cz: zhi, ux: -1, uz: 1 });
  base.push({ cx: x0, cz: zc, ux: -1, uz: 0 });
  for (const p of base) {
    let run = slope * height + berm;
    for (let i = 0; i < 5; i += 1) run = slope * (yC - groundAt(p.cx + p.ux * run, p.cz + p.uz * run)) + berm;
    p.run = Math.max(berm + 0.8, run);
    p.gToe = groundAt(p.cx + p.ux * p.run, p.cz + p.uz * p.run) - 0.03;
    p.H = yC - p.gToe;
  }
  const levels = [[0, 0], [0.25, 0], [0.5, 0], [0.5, 1], [0.75, 1], [1, 1]];
  const ringPt = (p, [f, b]) => {
    const off = (p.H * slope) * f + (b ? berm : 0);
    const y = f >= 1 ? p.gToe : yC - p.H * f;
    return [p.cx + p.ux * off, y, p.cz + p.uz * off];
  };
  const grass = (x, y, z, f) => {
    const n = Math.sin(x * 0.61 + z * 0.37) * 0.5 + Math.sin(x * 0.23 - z * 0.71 + y) * 0.5 + Math.sin(x * 1.7 + z * 1.3) * 0.18;
    const dry = clamp01(0.14 + n * 0.26 + f * 0.10);
    return scale(mix(P.grassA, P.grassB, dry), (1.0 - 0.30 * f) * 0.86);
  };
  const nB = base.length;
  for (let k = 0; k + 1 < levels.length; k += 1) {
    const bermBand = levels[k][0] === 0.5 && levels[k][1] === 0 && levels[k + 1][1] === 1;
    for (let i = 0; i < nB; i += 1) {
      const A = base[i], B = base[(i + 1) % nB];
      const q = [ringPt(A, levels[k]), ringPt(B, levels[k]), ringPt(B, levels[k + 1]), ringPt(A, levels[k + 1])];
      const hx = (A.ux + B.ux) * 0.5, hz = (A.uz + B.uz) * 0.5;
      const f0 = levels[k][0], f1 = levels[k + 1][0];
      const cols = q.map((pt, j) => (bermBand ? scale(P.track, 0.9) : grass(pt[0], pt[1], pt[2], j < 2 ? f0 : f1)));
      M.poly(q, cols, [hx, 1, hz]);
    }
  }
  // the end batters' crest faces are closed by the crest slab below; foot lines for the drain and fence:
  const foot = (x, side) => {
    let run = slope * height + berm;
    for (let i = 0; i < 5; i += 1) run = slope * (yC - groundAt(x, zc + side * (crestHalf + run))) + berm;
    const z = zc + side * (crestHalf + run);
    return [z, groundAt(x, z) - 0.03];
  };
  const footL = xs.map((x) => foot(x, -1));
  const footR = xs.map((x) => foot(x, 1));
  // a maintenance stair of concrete treads down the seaward batter, over the berm, to the toe
  {
    const sxm = x0 + (x1 - x0) * 0.36;
    const [zf, gf] = foot(sxm, 1);
    const H = yC - gf;
    const runUp = slope * H * 0.5;
    const zTop = zc + crestHalf;
    const treads = [];
    const nUp = Math.max(4, Math.round((H * 0.5) / 0.3));
    for (let k = 0; k < nUp; k += 1) { const t = (k + 0.5) / nUp; treads.push([zTop + runUp * t, yC - H * 0.5 * t]); }
    for (let k = 0; k < nUp; k += 1) { const t = (k + 0.5) / nUp; treads.push([zTop + runUp + berm + runUp * t, yC - H * 0.5 - H * 0.5 * t]); }
    for (const [z, y] of treads) {
      M.box(sxm - 0.6, sxm + 0.6, y - 0.02, y + 0.1, z - 0.22, z + 0.22, P.concLight, { ao: 0.8 });
    }
    M.box(sxm - 0.6, sxm + 0.6, yC - H * 0.5 - 0.04, yC - H * 0.5 + 0.04, zTop + runUp, zTop + runUp + berm, P.concLight, { ao: 0.9 });
    for (const dx of [-0.66, 0.66]) {
      const a = treads[0], b = treads[nUp - 1];
      S.bar([sxm + dx, a[1] + 0.95, a[0] - 0.2], [sxm + dx, b[1] + 0.95, b[0] + 0.2], 0.05, 0.05, P.steel, {});
      const c = treads[nUp], d = treads[treads.length - 1];
      S.bar([sxm + dx, c[1] + 0.95, c[0] - 0.2], [sxm + dx, d[1] + 0.95, d[0] + 0.2], 0.05, 0.05, P.steel, {});
      for (const t of [a, b, c, d]) S.box(sxm + dx - 0.025, sxm + dx + 0.025, t[1], t[1] + 0.95, t[0] - 0.025, t[0] + 0.025, P.steel, { skip: '-y', ao: 0.9 });
    }
  }
  // crest: gravel formation under the ballast bed, walkway shoulder each side
  M.box(x0, x1, yC - 0.2, yC, zc - crestHalf, zc + crestHalf, P.track, { ao: 0.9, skip: '-y' });
  const railTop = permanentWay(M, S, { x0: x0 + 0.5, x1: x1 - 0.5, z: zc, yBase: yC, pitch: 1.1, bedHalf: 1.7, shoulder: 2.7, seed: 7 });
  for (const sx of [-1, 1]) bufferStop(S, M, sx < 0 ? x0 + 0.8 : x1 - 0.8, zc, yC + 0.205 + 0.2, -sx);
  // trackside cabinet and a signal post on the crest
  const cabX = x0 + (x1 - x0) * 0.62;
  M.box(cabX - 0.6, cabX + 0.6, yC, yC + 1.15, zc + 2.45, zc + 3.0, P.wall, { skip: '-y', ao: 0.8 });
  M.box(cabX - 0.66, cabX + 0.66, yC + 1.15, yC + 1.25, zc + 2.4, zc + 3.05, P.roofSlate, { ao: 1 });
  const sigX = x0 + (x1 - x0) * 0.28;
  S.box(sigX - 0.05, sigX + 0.05, yC, yC + 3.6, zc - 2.55, zc - 2.45, P.steelDark, { skip: '-y', ao: 0.8 });
  M.box(sigX - 0.2, sigX + 0.2, yC + 3.0, yC + 3.75, zc - 2.7, zc - 2.3, P.under, { ao: 1 });
  M.box(sigX - 0.1, sigX + 0.1, yC + 3.48, yC + 3.62, zc - 2.3, zc - 2.26, P.red, { ao: 1 });
  M.box(sigX - 0.1, sigX + 0.1, yC + 3.12, yC + 3.26, zc - 2.3, zc - 2.26, P.warm, { ao: 1 });
  // cess drain and post-and-wire fence on each toe
  for (const side of [-1, 1]) {
    const foots = side < 0 ? footL : footR;
    for (let i = 0; i < xs.length; i += 1) {
      const fA = foots[i];
      const px = xs[i], pz = fA[0] + side * 2.1, pg = groundAt(px, pz);
      F.box(px - 0.05, px + 0.05, pg - 0.05, pg + 1.25, pz - 0.05, pz + 0.05, P.post, { skip: '-y', ao: 0.78 });
      if (i + 1 >= xs.length) continue;
      const fB = foots[i + 1];
      const drain = [[xs[i], fA[1] + 0.02, fA[0] + side * 0.55], [xs[i + 1], fB[1] + 0.02, fB[0] + side * 0.55], [xs[i + 1], fB[1] + 0.02, fB[0] + side * 1.15], [xs[i], fA[1] + 0.02, fA[0] + side * 1.15]];
      M.poly(drain, scale(P.soil, 0.55), [0, 1, 0]);
      M.box(xs[i], xs[i + 1], Math.min(fA[1], fB[1]) - 0.02, Math.max(fA[1], fB[1]) + 0.1, fA[0] + side * 0.5 - 0.05, fA[0] + side * 0.5 + 0.05, P.concLight, { ao: 0.8 });
      const qx = xs[i + 1], qz = fB[0] + side * 2.1, qg = groundAt(qx, qz);
      for (const hf of [0.5, 1.0]) F.bar([px, pg + hf, pz], [qx, qg + hf, qz], 0.025, 0.025, P.wireFence, {});
    }
  }
  return { matte: M.geometry(), steel: S.geometry(), fence: F.geometry(), info: { yCrest: yC, railTop, crestHalf } };
}

/* ------------------------------------------------------------------ */
/* Two-car light metro unit                                            */
/* ------------------------------------------------------------------ */

const HALF = [[0, 0.95], [1.22, 0.95], [1.40, 1.15], [1.40, 1.55], [1.40, 2.55], [1.40, 2.78], [1.22, 3.15], [0.70, 3.38], [0, 3.46]];

/** Full closed ring of the body section, scaled in width and squeezed between yLo and yHi. */
function bodyRing(sz, yLo, yHi) {
  const y0 = HALF[0][1], y1 = HALF[HALF.length - 1][1];
  const m = (p) => [p[0] * sz, yLo + ((p[1] - y0) / (y1 - y0)) * (yHi - yLo)];
  const right = HALF.map(m);
  const left = HALF.slice(1, HALF.length - 1).map(m).map((p) => [-p[0], p[1]]).reverse();
  return [...right, ...left]; // v0..v8 right side (floor centre to roof centre), then v9..v15 left side coming down
}

/**
 * One articulated two-car rail shuttle 11.5 m long, 2.8 m wide, 3.5 m high on the 1.435 m gauge, y = 0 at
 * the rail head, x along the track. Rounded cabs with a wrap windscreen, window band, one double door a side
 * per car, three bogies with wheels, roof equipment and a raised pantograph reaching `contactY`.
 */
export function buildShuttle(o = {}) {
  const contactY = o.contactY ?? 5.2;
  const B = new Mesher(); // body, matte
  const S = new Mesher(); // steel and running gear
  const L = 5.75;
  // stations from the nose of car A (x < 0); kinds describe the segment that follows the station
  const carA = [
    { x: -L, sz: 0.62, lo: 1.12, hi: 3.02, kind: 'cab' },
    { x: -5.30, sz: 0.86, lo: 1.0, hi: 3.28, kind: 'cab' },
    { x: -4.55, sz: 1.0, lo: 0.95, hi: 3.46, kind: 'win' },
    { x: -3.30, sz: 1.0, lo: 0.95, hi: 3.46, kind: 'door' },
    { x: -1.95, sz: 1.0, lo: 0.95, hi: 3.46, kind: 'win' },
    { x: -0.62, sz: 1.0, lo: 0.95, hi: 3.46, kind: 'end' },
    { x: -0.28, sz: 0.96, lo: 1.0, hi: 3.36, kind: 'bel' },
  ];
  const stations = [...carA, ...carA.slice().reverse().map((s) => ({ ...s, x: -s.x }))];
  // kinds[k] describes the segment between station k and k + 1
  const kinds = ['cab', 'cab', 'win', 'door', 'win', 'end', 'bel', 'end', 'win', 'door', 'win', 'cab', 'cab'];
  const rings = stations.map((s) => ({ s: s.x, pts: bodyRing(s.sz, s.lo, s.hi) }));
  const edgeCol = (k, e) => {
    const kk = e <= 7 ? e : 15 - e;
    const kind = kinds[k] ?? 'win';
    if (kind === 'bel') return kk >= 6 ? P.concDark : P.under;
    if (kk === 0) return P.under;
    if (kk === 1 || kk === 2) return P.navy;
    if (kk === 3) return kind === 'win' || kind === 'cab' ? P.glass : kind === 'door' ? P.doorBlue : P.body;
    if (kk === 4) return P.body;
    return P.roofSilver;
  };
  B.loft('x', rings, edgeCol, { aoY: [0.9, 1.4, 0.82], capCol: P.body, caps: false });
  // nose caps with the wrap windscreen, destination blind and lamps
  for (const [x, sgn] of [[-L, -1], [L, 1]]) {
    const r = bodyRing(0.62, 1.12, 3.02);
    const ring3 = r.map((p) => [x, p[1], p[0]]);
    B.fan(ring3, [x, 2.0, 0], P.body, [sgn, 0, 0]);
    const v3 = r[3], v4 = r[4], l3 = r[12], l4 = r[11];
    B.poly([[x + sgn * 0.012, v3[1] + 0.12, -(v3[0]) * 0.92], [x + sgn * 0.012, v3[1] + 0.12, v3[0] * 0.92], [x + sgn * 0.012, v4[1] - 0.04, v4[0] * 0.92], [x + sgn * 0.012, v4[1] - 0.04, -(v4[0]) * 0.92]], P.glass, [sgn, 0, 0]);
    void l3; void l4;
    B.box(x + (sgn > 0 ? 0 : -0.03), x + (sgn > 0 ? 0.03 : 0), 2.60, 2.78, -0.48, 0.48, P.under, { ao: 1 });
    for (const zs of [-1, 1]) B.box(x + (sgn > 0 ? 0 : -0.04), x + (sgn > 0 ? 0.04 : 0), 1.20, 1.34, zs * 0.50 - 0.08, zs * 0.50 + 0.08, P.warm, { ao: 1 });
    B.box(x + (sgn > 0 ? -0.04 : -0.01), x + (sgn > 0 ? 0.01 : 0.04), 1.04, 1.12, -0.58, 0.58, P.gold, { ao: 1 });
  }
  // window pillars, door leaves and glass, side stripe
  for (const sgn of [-1, 1]) {
    const zf = sgn * 1.40;
    const zo = (d) => (sgn > 0 ? [zf, zf + d] : [zf - d, zf]);
    for (const dx of [-1, 1]) {
      // pillars between window panes
      for (const px of [-3.925, -1.285].map((v) => v * dx)) {
        const [za, zb] = zo(0.035);
        B.box(px - 0.06, px + 0.06, 1.55, 2.55, za, zb, P.body, { ao: 1 });
      }
      // a double-leaf door
      const dc = dx * 2.625;
      for (const lf of [-1, 1]) {
        const [za, zb] = zo(0.04);
        B.box(dc + lf * 0.34 - 0.30, dc + lf * 0.34 + 0.30, 1.18, 2.74, za, zb, P.doorBlue, { ao: 0.9 });
        const [ga, gb] = zo(0.055);
        B.box(dc + lf * 0.34 - 0.20, dc + lf * 0.34 + 0.20, 1.62, 2.50, ga, gb, P.glass, { ao: 1 });
      }
      const [sa, sb] = zo(0.02);
      B.box(dx > 0 ? 0.6 : -5.0, dx > 0 ? 5.0 : -0.6, 1.50, 1.58, sa, sb, P.gold, { ao: 1 });
    }
  }
  // roof: two air-conditioning units, a horn box and the pantograph base on car A
  for (const dx of [-1, 1]) {
    B.box(dx * 2.6 - 0.85, dx * 2.6 + 0.85, 3.34, 3.62, -0.55, 0.55, P.roofSilver, { skip: '-y', ao: 0.8 });
    for (let i = 0; i < 3; i += 1) B.box(dx * 2.6 - 0.8 + i * 0.55, dx * 2.6 - 0.62 + i * 0.55, 3.62, 3.67, -0.5, 0.5, P.steelDark, { ao: 1 });
  }
  B.box(0.0 - 0.4, 0.4, 3.30, 3.46, -0.3, 0.3, P.steelDark, { ao: 0.9 });
  // pantograph on car A (x = -2.6): base insulators, frame, lower arm, upper arm, collector head
  {
    const px = -2.6, base = 3.50;
    for (const zs of [-1, 1]) {
      S.box(px - 0.12, px + 0.12, base - 0.08, base + 0.06, zs * 0.5 - 0.06, zs * 0.5 + 0.06, P.insulator, { ao: 1 });
      S.bar([px - 0.1, base + 0.06, zs * 0.5], [px + 0.55, base + 0.95, zs * 0.34], 0.08, 0.08, P.steel, { caps: true });
      S.bar([px + 0.55, base + 0.95, zs * 0.34], [px - 0.1, contactY - 0.12, zs * 0.28], 0.07, 0.07, P.steel, { caps: true });
    }
    S.box(px - 0.2, px + 0.2, base + 0.04, base + 0.1, -0.62, 0.62, P.steelDark, { ao: 1 });
    S.box(px - 0.08, px + 0.08, contactY - 0.16, contactY - 0.04, -0.28, 0.28, P.steel, { ao: 1 });
    S.box(px - 0.12, px + 0.12, contactY - 0.06, contactY, -0.88, 0.88, P.steelLight, { ao: 1 });
  }
  // under-floor equipment boxes and three bogies
  for (const x of [-1.9, 1.9]) S.box(x - 0.95, x + 0.95, 0.62, 0.95, -0.85, 0.85, P.under, { ao: 0.8 });
  for (const bx of [-3.9, 0, 3.9]) {
    for (const zs of [-1, 1]) S.box(bx - 1.15, bx + 1.15, 0.40, 0.58, zs * 0.95 - 0.07, zs * 0.95 + 0.07, P.steelDark, { ao: 0.9 });
    S.box(bx - 0.09, bx + 0.09, 0.42, 0.62, -0.95, 0.95, P.steelDark, { ao: 0.9 });
    for (const dx of [-0.9, 0.9]) {
      S.box(bx + dx - 0.04, bx + dx + 0.04, 0.40, 0.46, -0.78, 0.78, P.steelDark, { ao: 1 });
      for (const zs of [-1, 1]) cylZ(S, bx + dx, 0.43, zs * GAUGE_HALF - 0.065, zs * GAUGE_HALF + 0.065, 0.43, 10, P.steelDark, { capCol: P.steel });
    }
    S.box(bx - 0.55, bx + 0.55, 0.55, 0.88, -0.35, 0.35, P.steel, { ao: 0.8 });
  }
  return { body: B.geometry(), steel: S.geometry(), info: { length: 2 * L, width: 2.8, height: 3.46 + 0.3 } };
}

/* ------------------------------------------------------------------ */
/* Maintenance yard                                                    */
/* ------------------------------------------------------------------ */

/**
 * The maintenance compound: a gabled workshop shed with eaves, ribbed roof, gutters and a roller door; a
 * short siding with a buffer stop; sleeper stack, skip bin, drums, a light mast; a chain-link perimeter with
 * a gate. About 11.2 x 8.8 m, origin on the pad centre, y = 0 on the pad.
 */
export function buildYard() {
  const M = new Mesher();
  const S = new Mesher();
  const F = new Mesher({ uv: true });
  const T = M; // the sleeper stack joins the shed mesh: a separate 3 m mesh would be baked into the always-visible static batch
  const hw = 5.6, hd = 4.4;
  // workshop shed against the north fence
  const sx0 = -4.9, sx1 = 0.1, sz0 = 0.6, sz1 = 3.7, eave = 2.5, ridge = 3.4;
  M.box(sx0 - 0.2, sx1 + 0.2, 0, 0.14, sz0 - 0.2, sz1 + 0.2, P.concLight, { ao: 0.8 });
  M.box(sx0, sx1, 0.14, eave, sz0, sz1, P.wall, { ao: 0.7, skip: '-y' });
  M.box(sx0 - 0.02, sx1 + 0.02, 0.14, 0.5, sz0 - 0.02, sz1 + 0.02, P.wallDark, { ao: 0.8, skip: '-y' });
  const zm = (sz0 + sz1) / 2;
  const ov = 0.36, gov = 0.3;
  const roofRing = [[sz0 - ov, eave - 0.06], [zm, ridge], [sz1 + ov, eave - 0.06]];
  M.loft('x', [{ s: sx0 - gov, pts: roofRing }, { s: sx1 + gov, pts: roofRing }], (k, e) => (e === 0 ? P.roofIron : e === 1 ? P.roofSlate : P.under), { capCol: P.wallDark, down: 0.55 });
  // gable fill and ridge cap
  M.box(sx0 - gov, sx1 + gov, ridge - 0.04, ridge + 0.1, zm - 0.14, zm + 0.14, P.roofSilver, { ao: 1 });
  // roof ribs down the slope
  const nR = 9;
  for (let i = 0; i <= nR; i += 1) {
    const x = sx0 - gov + 0.2 + (i / nR) * (sx1 - sx0 + 2 * gov - 0.4);
    S.bar([x, eave - 0.02, sz0 - ov], [x, ridge + 0.02, zm], 0.06, 0.05, P.roofSilver, {});
    S.bar([x, eave - 0.02, sz1 + ov], [x, ridge + 0.02, zm], 0.06, 0.05, P.roofSilver, {});
  }
  // gutters and a downpipe
  for (const zz of [sz0 - ov + 0.02, sz1 + ov - 0.02]) S.box(sx0 - gov, sx1 + gov, eave - 0.16, eave - 0.02, zz - 0.07, zz + 0.07, P.steelDark, { ao: 0.9 });
  S.box(sx1 + 0.02, sx1 + 0.12, 0.14, eave - 0.1, sz0 + 0.04, sz0 + 0.14, P.steelDark, { skip: '-y', ao: 0.8 });
  // roller door and a man door on the face towards the siding, a window on the gable
  M.box(sx0 + 0.5, sx0 + 2.9, 0.14, 2.2, sz0 - 0.06, sz0, P.steelLight, { skip: '-y', ao: 0.85 });
  for (let i = 1; i < 7; i += 1) M.box(sx0 + 0.5, sx0 + 2.9, 0.14 + i * 0.3, 0.17 + i * 0.3, sz0 - 0.08, sz0 - 0.06, P.steel, { ao: 1 });
  M.box(sx1 - 1.3, sx1 - 0.4, 0.14, 2.05, sz0 - 0.06, sz0, P.doorBlue, { skip: '-y', ao: 0.9 });
  M.box(sx1 - 1.15, sx1 - 0.55, 1.2, 1.8, sz0 - 0.075, sz0 - 0.06, P.glass, { ao: 1 });
  M.box(sx1, sx1 + 0.05, 1.1, 1.9, zm - 0.5, zm + 0.5, P.glass, { ao: 1 });
  M.box(sx1 - 1.8, sx1 - 1.5, 2.1, 2.2, sz0 - 0.07, sz0, P.hiVis, { ao: 1 });
  // siding: ballast, sleepers, rails and a buffer stop, entering through the west gate
  const trackZ = -1.9, tx0 = -hw - 1.2, tx1 = 4.2;
  const rt = permanentWay(M, S, { x0: tx0, x1: tx1, z: trackZ, yBase: 0, pitch: 0.75, shoulder: 2.0, bedHalf: 1.5, seed: 5 });
  bufferStop(S, M, tx1 - 0.2, trackZ, 0.205 + 0.2, -1);
  void rt;
  // sleeper stack and a skip bin
  for (let c = 0; c < 4; c += 1) {
    for (let k = 0; k < 3; k += 1) {
      const cross = c % 2 === 0;
      const o = (k - 1) * 0.3;
      const col = (c + k) % 3 === 0 ? P.sleeperAlt : P.sleeper;
      if (cross) T.box(1.5 - 1.0, 1.5 + 1.0, 0.04 + c * 0.2, 0.22 + c * 0.2, 2.6 + o - 0.12, 2.6 + o + 0.12, col, { ao: 0.84 });
      else T.box(1.5 + o - 0.12, 1.5 + o + 0.12, 0.04 + c * 0.2, 0.22 + c * 0.2, 2.6 - 1.0, 2.6 + 1.0, col, { ao: 0.84 });
    }
  }
  M.box(3.1, 4.9, 0.12, 0.9, 0.9, 2.1, P.roofSlate, { ao: 0.7 });
  M.box(3.0, 5.0, 0.9, 1.0, 0.8, 2.2, P.steelDark, { ao: 1 });
  // oil drums on a pallet
  M.box(2.9, 4.1, 0.0, 0.12, 3.1, 4.0, P.timber, { ao: 0.7 });
  for (const [dx, dz] of [[3.2, 3.35], [3.8, 3.35], [3.5, 3.78]]) frustum(S, dx, dz, 0.12, 0.96, 0.27, 0.27, 0.27, 0.27, 8, P.red, { ao: 0.7 });
  // floodlight mast at the north-east corner
  frustum(S, hw - 0.5, hd - 0.5, 0, 4.4, 0.10, 0.10, 0.06, 0.06, 6, P.steelLight, { ao: 0.8 });
  S.box(hw - 0.5 - 0.35, hw - 0.5 + 0.35, 4.4, 4.52, hd - 0.5 - 0.18, hd - 0.5 + 0.18, P.steelDark, { ao: 1 });
  S.box(hw - 0.5 - 0.3, hw - 0.5 + 0.3, 4.34, 4.4, hd - 0.5 - 0.15, hd - 0.5 + 0.15, P.warm, { ao: 1 });
  // chain-link perimeter: posts, top rail, mesh panels; gaps for the siding (west) and a gate (south)
  const sides = [
    { a: [-hw, -hd], b: [hw, -hd], gap: [1.2, 3.4] },
    { a: [hw, -hd], b: [hw, hd], gap: null },
    { a: [hw, hd], b: [-hw, hd], gap: null },
    { a: [-hw, hd], b: [-hw, -hd], gap: [-3.3, -0.5] },
  ];
  sides.forEach((sd, si) => {
    const dx = sd.b[0] - sd.a[0], dz = sd.b[1] - sd.a[1];
    const len = Math.hypot(dx, dz);
    const nb = Math.round(len / 2.0);
    const ux = dx / len, uz = dz / len;
    for (let i = 0; i <= nb; i += 1) {
      const t = (i / nb) * len;
      const px = sd.a[0] + ux * t, pz = sd.a[1] + uz * t;
      F.box(px - 0.05, px + 0.05, 0, 2.0, pz - 0.05, pz + 0.05, P.steel, { skip: '-y', ao: 0.8 });
      if (i === nb) continue;
      const t2 = ((i + 1) / nb) * len;
      const qx = sd.a[0] + ux * t2, qz = sd.a[1] + uz * t2;
      const cx = (px + qx) / 2, cz = (pz + qz) / 2;
      // skip the panel in the opening
      const along = si % 2 === 0 ? cx : cz;
      if (sd.gap && along > Math.min(...sd.gap) && along < Math.max(...sd.gap)) continue;
      const th = 0.03;
      const p0 = [px, 0.12, pz], p1 = [qx, 0.12, qz], p2 = [qx, 1.9, qz], p3 = [px, 1.9, pz];
      const nrm = [-uz, 0, ux];
      const off = (p, s) => [p[0] + nrm[0] * th * s, p[1], p[2] + nrm[2] * th * s];
      // chain-link: the texture's alpha is the mesh, 0.3 m per diamond course
      const uv = [[0, 0], [(len / nb) / 0.3, 0], [(len / nb) / 0.3, 1.78 / 0.3], [0, 1.78 / 0.3]];
      F.poly([off(p0, 1), off(p1, 1), off(p2, 1), off(p3, 1)], P.chain, nrm, uv);
      F.poly([off(p0, -1), off(p1, -1), off(p2, -1), off(p3, -1)], P.chain, [-nrm[0], 0, -nrm[2]], uv);
      F.bar([px, 1.96, pz], [qx, 1.96, qz], 0.06, 0.06, P.steel, {});
      F.bar([px, 0.1, pz], [qx, 0.1, qz], 0.05, 0.05, P.steel, {});
    }
  });
  // signage board by the gate
  S.box(2.0, 2.08, 0, 1.8, -hd - 0.1, -hd - 0.02, P.steelDark, { skip: '-y', ao: 0.8 });
  M.box(1.5, 2.6, 1.3, 1.9, -hd - 0.14, -hd - 0.1, P.hiVis, { ao: 1 });
  return { matte: M.geometry(), steel: S.geometry(), fence: F.geometry() };
}
