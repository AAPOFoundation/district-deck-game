// Southern Cross station models: the metro set, the V/Line set and the PTV bus (plus, further down, the hall).
//
// Pure geometry builders: no scene access, no globals, deterministic (the same arguments give byte-identical
// buffers). Every builder returns an object of merged, indexed BufferGeometry keyed by material slot, each with
// `position`, `normal` and `color`. The colour is the livery colour (taken from the existing transit paints by the
// caller) times a baked occlusion term, so the materials are plain white `vertexColors` standards.
// Dimensions are real metres in the vehicle's own frame: x along the vehicle (nose towards +x), y up from the
// top of the rail (or kerb), z across. Scale law: an adult is 1.70 m, a rail gauge is 1.435 m.
import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/* Colour                                                              */
/* ------------------------------------------------------------------ */

const _c = new THREE.Color();
export const rgbOf = (hex) => { _c.set(hex); return [_c.r, _c.g, _c.b]; };
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

/** The existing transit paints (transit.js `transitMats`), as linear rgb triples. */
export function defaultPalette() {
  const h = rgbOf;
  return {
    tyre: h(0x191a1c), rim: h(0x9aa0a6), bogie: h(0x33383d),
    metroBlue: h(0x3F6A96), metroDark: h(0x2F4A6A), metroSill: h(0x375B83), metroSilver: h(0xB4BABF), doorYellow: h(0xC9A23F),
    roofGrey: h(0xA7ADB2), roofGrime: h(0x9ba1a7), glassDark: h(0x2b3f52), silver: h(0xB9BFC4), steel: h(0x5c646c),
    vlinePurple: h(0x6B4A82), vlineDeep: h(0x3F2E4E), vlineGold: h(0xC9A23F), vlineGrey: h(0x8d8f96), vlineRoof: h(0x8a8493),
    vlineRoofPod: h(0x565061), vlinePodCap: h(0x3a3740), vlinePodVent: h(0x8e8a94),
    busOrange: h(0xC48550), busWhite: h(0xD9D6CE), bumper: h(0x373b40), interior: h(0x39424c),
  };
}

/** Palette from a transit material set (reads each material's colour; falls back to the default for any missing). */
export function paletteFromMats(mats) {
  const p = defaultPalette();
  for (const k of Object.keys(p)) {
    const m = mats?.[k];
    if (m?.color) p[k] = [m.color.r, m.color.g, m.color.b];
  }
  return p;
}

/* ------------------------------------------------------------------ */
/* Mesher                                                              */
/* ------------------------------------------------------------------ */

const isNum = (v) => typeof v === 'number';
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp = (t, a = 0, b = 1) => Math.max(a, Math.min(b, t));

/** Accumulates polygons, boxes, bars, cylinders and lofts with per-vertex colour and baked occlusion. */
export class Mesher {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.idx = []; }

  get tris() { return this.idx.length / 3; }

  vert(p, n, c) {
    this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]); this.col.push(c[0], c[1], c[2]);
    return this.pos.length / 3 - 1;
  }

  /** One flat convex polygon, fan-triangulated. `hint` is any vector pointing outward: the winding follows it. */
  poly(pts, cols, hint) {
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
    let N = [nx / len, ny / len, nz / len];
    let order = pts.map((_, i) => i);
    if (hint && dot(N, hint) < 0) { order = order.reverse(); N = scl(N, -1); }
    const base = this.pos.length / 3;
    for (const i of order) this.vert(pts[i], N, isNum(cols[0]) ? cols : cols[i]);
    for (let i = 1; i < n - 1; i += 1) this.idx.push(base, base + i, base + i + 1);
  }

  quad(a, b, c, d, cols, hint) { this.poly([a, b, c, d], cols, hint); }

  /**
   * Axis-aligned box. `ao` is the colour factor at the foot (1 at the top); `skip` lists faces to leave out,
   * for example '-y-z' for a panel that stands on a body.
   */
  box(x0, x1, y0, y1, z0, z1, col, o = {}) {
    const ao = o.ao ?? 0.82;
    const skip = o.skip ?? '';
    const lo = mul(col, ao), mid = mul(col, 0.5 + 0.5 * ao);
    const f = (tag, pts, cs, hint) => { if (!skip.includes(tag)) this.poly(pts, cs, hint); };
    f('+y', [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], col, [0, 1, 0]);
    f('-y', [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], lo, [0, -1, 0]);
    f('+x', [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [mid, col, col, mid], [1, 0, 0]);
    f('-x', [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], [mid, col, col, mid], [-1, 0, 0]);
    f('+z', [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [mid, mid, col, col], [0, 0, 1]);
    f('-z', [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [mid, mid, col, col], [0, 0, -1]);
  }

  /** Square-section bar between two points (`t` thick, or {tu,tv}). */
  bar(p0, p1, t, col, o = {}) {
    const d = sub(p1, p0);
    const L = Math.hypot(...d);
    if (L < 1e-6) return;
    const dn = scl(d, 1 / L);
    let u = cross(dn, [0, 1, 0]);
    if (Math.hypot(...u) < 1e-3) u = cross(dn, [1, 0, 0]);
    u = norm(u);
    const v = norm(cross(u, dn));
    const hu = (o.tu ?? t) / 2, hv = (o.tv ?? t) / 2;
    const ring = (p) => [
      addv(p, addv(scl(u, hu), scl(v, hv))), addv(p, addv(scl(u, -hu), scl(v, hv))),
      addv(p, addv(scl(u, -hu), scl(v, -hv))), addv(p, addv(scl(u, hu), scl(v, -hv))),
    ];
    const A = ring(p0), B = ring(p1);
    const mid = scl(addv(p0, p1), 0.5);
    const lo = mul(col, o.ao ?? 0.82);
    for (let k = 0; k < 4; k += 1) {
      const k2 = (k + 1) % 4;
      const c = scl(addv(addv(A[k], A[k2]), addv(B[k], B[k2])), 0.25);
      const dark = sub(c, mid)[1] < -0.01;
      this.poly([A[k], A[k2], B[k2], B[k]], dark ? lo : col, sub(c, mid));
    }
    if (!o.open) {
      this.poly(A, col, scl(dn, -1));
      this.poly(B, col, dn);
    }
  }

  /**
   * Cylinder (or cone frustum) on an axis-aligned axis: smooth sides, optional caps. `capCol` may be a
   * [centre, rim] pair for a hub-and-tyre shading on a wheel face.
   */
  cyl(c, axis, r0, r1, len, segs, col, o = {}) {
    const ax = axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1];
    const u = axis === 'x' ? [0, 1, 0] : axis === 'y' ? [0, 0, 1] : [1, 0, 0];
    const v = cross(ax, u);
    const half = len / 2;
    const ringAt = (k, rr, s) => {
      const a = (k / segs) * Math.PI * 2 + (o.phase ?? 0);
      const dir = addv(scl(u, Math.cos(a)), scl(v, Math.sin(a)));
      return { p: addv(addv(c, scl(ax, s * half)), scl(dir, rr)), n: dir };
    };
    const aoLo = o.ao ?? 1;
    for (let k = 0; k < segs; k += 1) {
      const A = ringAt(k, r0, -1), B = ringAt(k + 1, r0, -1), C = ringAt(k + 1, r1, 1), D = ringAt(k, r1, 1);
      const base = this.pos.length / 3;
      const cl = o.sideCol ?? col;
      for (const q of [A, B, C, D]) this.vert(q.p, q.n, cl);
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const cap = (s, rr) => {
      const ctr = addv(c, scl(ax, s * half));
      const base = this.pos.length / 3;
      const cc = o.capCol ?? [col, col];
      this.vert(ctr, scl(ax, s), cc[0]);
      for (let k = 0; k < segs; k += 1) this.vert(ringAt(k, rr, s).p, scl(ax, s), cc[1]);
      for (let k = 0; k < segs; k += 1) {
        const a = base + 1 + k, b = base + 1 + ((k + 1) % segs);
        if (s > 0) this.idx.push(base, a, b); else this.idx.push(base, b, a);
      }
    };
    if (o.capA !== false) cap(-1, r0);
    if (o.capB !== false) cap(1, r1);
    void aoLo;
  }

  /**
   * Smooth lofted surface through rings P[i][j] (each [x, y, z]). Normals are smooth across rings and across the
   * profile except at the `hardI` / `hardJ` indices, which are creases. `cell(i, j)` returns the colour of the
   * cell between rings i and i+1 and profile points j and j+1, or null to leave it open; `ao(i, j)` scales a
   * vertex colour. Winding follows the outside, found from the ring centroids.
   */
  loft(P, o = {}) {
    const R = P.length, C = P[0].length;
    const closed = o.closed !== false;
    const nj = closed ? C : C - 1;
    const hardI = o.hardI ?? (() => false), hardJ = o.hardJ ?? (() => false);
    const cellCol = o.cell ?? (() => [1, 1, 1]);
    const aoFn = o.ao ?? (() => 1);
    const cen = P.map((ring) => {
      const s = [0, 0, 0];
      for (const p of ring) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; }
      return scl(s, 1 / ring.length);
    });
    const at = (i, j) => P[i][((j % C) + C) % C];
    const cells = [];
    let vote = 0;
    for (let i = 0; i < R - 1; i += 1) {
      for (let j = 0; j < nj; j += 1) {
        const p0 = at(i, j), p1 = at(i + 1, j), p2 = at(i + 1, j + 1), p3 = at(i, j + 1);
        const nrm = cross(sub(p2, p0), sub(p3, p1));
        const area = Math.hypot(...nrm) * 0.5;
        if (area < 1e-8) continue;
        const ctr = scl(addv(addv(p0, p1), addv(p2, p3)), 0.25);
        vote += Math.sign(dot(nrm, sub(ctr, scl(addv(cen[i], cen[i + 1]), 0.5)))) * area;
        cells.push({ i, j, p: [p0, p1, p2, p3], nrm });
      }
    }
    const sgn = o.flip ? -1 : (vote >= 0 ? 1 : -1);
    const acc = new Map();
    const keyOf = (i, j, di, dj) => {
      const ri = i + di, rj = (j + dj) % C;
      return `${ri}|${rj}|${hardI(ri) ? di : ''}|${hardJ(rj) ? dj : ''}`;
    };
    for (const cl of cells) {
      for (const [di, dj] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const k = keyOf(cl.i, cl.j, di, dj);
        const a = acc.get(k) ?? [0, 0, 0];
        acc.set(k, addv(a, cl.nrm));
      }
    }
    for (const cl of cells) {
      const col = cellCol(cl.i, cl.j);
      if (!col) continue;
      const base = this.pos.length / 3;
      [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([di, dj], q) => {
        const n = scl(norm(acc.get(keyOf(cl.i, cl.j, di, dj))), sgn);
        this.vert(cl.p[q], n, mul(col, aoFn(cl.i + di, (cl.j + dj) % C)));
      });
      if (sgn > 0) this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }

  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }
}

/** One Mesher per material slot, built to geometries at the end. */
class Kit {
  constructor(slots) { this.m = {}; for (const s of slots) this.m[s] = new Mesher(); }

  get tris() { return Object.values(this.m).reduce((t, m) => t + m.tris, 0); }

  build() {
    const out = {};
    for (const [k, m] of Object.entries(this.m)) if (m.tris) out[k] = m.build();
    return out;
  }
}

/** Triangles in a built slot set. */
export function slotTris(slots) {
  return Object.values(slots).reduce((t, g) => t + (g.index ? g.index.count : g.attributes.position.count) / 3, 0);
}

const SLOTS = ['paint', 'metal', 'glass', 'matte', 'lamp', 'tail', 'dest'];

/* ------------------------------------------------------------------ */
/* Running gear                                                        */
/* ------------------------------------------------------------------ */

const GAUGE_HALF = 0.72; // the rails in addTracks sit at z +- 0.72

/** A wheel: eight-sided tyre with its outer face shaded from hub to rim. */
function wheel(K, pal, x, y, z, r, width, outer) {
  K.m.matte.cyl([x, y, z], 'z', r, r, width, 8, pal.tyre, {
    capA: outer < 0, capB: outer > 0, capCol: [pal.rim, mul(pal.tyre, 1.25)], phase: Math.PI / 8,
  });
}

/** Bogie: side frames, bolster, motor, axles and four wheels on the real rail line. */
function bogie(K, pal, cx, r, wheelbase = 1.9) {
  const f = pal.bogie;
  for (const s of [1, -1]) {
    K.m.matte.box(cx - wheelbase / 2 - 0.25, cx + wheelbase / 2 + 0.25, r + 0.04, r + 0.26, s * 0.88 - 0.05, s * 0.88 + 0.05, f, { ao: 0.7, skip: '-y' });
    for (const dx of [-1, 1]) {
      K.m.matte.box(cx + dx * wheelbase / 2 - 0.13, cx + dx * wheelbase / 2 + 0.13, r - 0.13, r + 0.13, s * 0.86 - 0.07, s * 0.86 + 0.07, mul(f, 0.8), { ao: 0.6, skip: '-y' });
    }
  }
  K.m.matte.box(cx - 0.55, cx + 0.55, r + 0.08, r + 0.46, -0.7, 0.7, mul(f, 0.7), { ao: 0.55 });
  for (const dx of [-1, 1]) {
    K.m.metal.box(cx + dx * wheelbase / 2 - 0.045, cx + dx * wheelbase / 2 + 0.045, r - 0.045, r + 0.045, -0.78, 0.78, pal.steel, { ao: 0.7 });
    for (const s of [1, -1]) wheel(K, pal, cx + dx * wheelbase / 2, r, s * GAUGE_HALF, r, 0.14, s);
  }
}

/* ------------------------------------------------------------------ */
/* Rail cars                                                           */
/* ------------------------------------------------------------------ */

/**
 * Half-profile of a car cross-section, bottom centre to top centre, as [z, y] with a hard-edge flag.
 * The ring is these points, then their mirror. Index 0 and the last are on the centre line.
 */
function carProfile(c) {
  const { core, panel, yUnder, floor, belt, winTop, eave, crown } = c;
  return [
    { p: [0, yUnder], hard: false },
    { p: [panel * 0.72, yUnder], hard: true },
    { p: [panel * 0.90, floor - 0.1], hard: true },
    { p: [core, floor], hard: true },
    { p: [core, belt], hard: true },
    { p: [core, winTop + 0.1], hard: true },
    { p: [core * 0.965, eave], hard: false },
    { p: [core * 0.80, eave + 0.17], hard: false },
    { p: [core * 0.48, crown - 0.04], hard: false },
    { p: [0, crown], hard: false },
  ];
}

/** Ring of 3D points at x for the car profile (mirrored, 2n-2 points, index k and 2(n-1)-k mirror). */
function carRing(prof, xAt) {
  const n = prof.length;
  const ring = [];
  for (let k = 0; k < n; k += 1) ring.push(xAt(prof[k].p[0], prof[k].p[1], 1));
  for (let k = n - 2; k >= 1; k -= 1) ring.push(xAt(prof[k].p[0], prof[k].p[1], -1));
  return ring;
}

/**
 * Builds one rail set (cars end to end, along x, centred on the origin).
 * cfg: see METRO and VLINE below.
 */
function buildSet(cfg, pal) {
  const K = new Kit(SLOTS);
  const c = cfg;
  const prof = carProfile(c);
  const n = prof.length;
  const ringN = 2 * (n - 1);
  const mirror = (k) => ringN - k;
  const total = c.cars.reduce((t, car) => t + car.len, 0) + c.gap * (c.cars.length - 1);
  let cursor = -total / 2;
  const car = [];
  for (const spec of c.cars) { car.push({ ...spec, x0: cursor, x1: cursor + spec.len, cx: cursor + spec.len / 2 }); cursor += spec.len + c.gap; }
  const hardJ = (j) => { const k = j < n ? j : mirror(j); return k >= 1 && k <= 5; };

  for (let ci = 0; ci < car.length; ci += 1) {
    const cr = car[ci];
    const cabEnds = [];
    if (cr.cab === -1 || cr.cab === 2) cabEnds.push(-1);
    if (cr.cab === 1 || cr.cab === 2) cabEnds.push(1);
    const bodyA = cr.x0 + (cabEnds.includes(-1) ? c.noseLen : 0);
    const bodyB = cr.x1 - (cabEnds.includes(1) ? c.noseLen : 0);

    // --- the shell: nose rings, body, nose rings
    const rings = [];
    const ringMeta = [];
    const addRingAt = (x) => { rings.push(carRing(prof, (z, y, s) => [x, y, z * s])); ringMeta.push({ nose: false }); };
    const addNose = (end) => {
      const xEnd = end < 0 ? cr.x0 : cr.x1;
      const list = [];
      for (const t of c.noseT) {
        list.push(carRing(prof, (z, y, s) => {
          const sc = Math.cbrt(Math.max(0, 1 - t * t * t));
          const h = clamp((y - c.floor) / (c.crown - c.floor));
          const yy = y > c.floor ? c.floor + (y - c.floor) * (1 - c.noseDrop * t * t) : y;
          const off = c.noseLen * t - c.noseRake * t * Math.pow(h, 1.5);
          return [xEnd - end * (c.noseLen - off), yy, z * s * sc];
        }));
      }
      return list;
    };
    if (cabEnds.includes(-1)) { const nl = addNose(-1); for (let k = nl.length - 1; k >= 0; k -= 1) { rings.push(nl[k]); ringMeta.push({ nose: true, end: -1, k }); } }
    addRingAt(bodyA); addRingAt(bodyB);
    if (cabEnds.includes(1)) { const nl = addNose(1); for (let k = 0; k < nl.length; k += 1) { rings.push(nl[k]); ringMeta.push({ nose: true, end: 1, k }); } }
    const noseCell = (i) => ringMeta[i].nose || ringMeta[i + 1].nose;
    K.m.paint.loft(rings, {
      closed: true,
      hardJ,
      cell: (i, j) => {
        const k = j < n - 1 ? j : mirror(j + 1);
        const kk = Math.min(k, n - 2);
        // edges: 0 underside, 1 under-skirt slope, 2 floor step, 3 belt..., see carProfile
        const wall = kk === 3 || kk === 4;
        if (kk === 0) return c.col.under;
        if (kk === 1) return c.col.skirt;
        if (kk === 2) return c.col.skirt;
        if (kk === 3) return noseCell(i) ? c.col.body : c.col.wall;
        if (kk === 4) return noseCell(i) ? c.col.glass : c.col.wall;
        void wall;
        if (kk === 5) return c.col.upper;
        return c.col.roof;
      },
      ao: (i, j) => {
        const k = j < n ? j : mirror(j);
        return k <= 1 ? 0.55 : k === 2 ? 0.7 : k === 3 ? 0.86 : 1;
      },
    });

    // --- the cab fronts: a cap in three bands (skirt, body, glass), the lights and the destination board
    for (const end of cabEnds) {
      const tl = c.noseT.length - 1;
      const xEnd = end < 0 ? cr.x0 : cr.x1;
      const ring = carRing(prof, (z, y, s) => {
        const t = c.noseT[tl];
        const sc = Math.cbrt(Math.max(0, 1 - t * t * t));
        const h = clamp((y - c.floor) / (c.crown - c.floor));
        const yy = y > c.floor ? c.floor + (y - c.floor) * (1 - c.noseDrop * t * t) : y;
        const off = c.noseLen * t - c.noseRake * t * Math.pow(h, 1.5);
        return [xEnd - end * (c.noseLen - off), yy, z * s * sc];
      });
      const pick = (ks) => ks.map((k) => ring[k]);
      const hint = [end, 0, 0];
      K.m.matte.poly(pick([0, 1, 2, 3, mirror(3), mirror(2), mirror(1)]), mul(c.col.skirt, 0.9), hint);
      K.m.paint.poly(pick([3, 4, mirror(4), mirror(3)]), c.col.body, hint);
      K.m.glass.poly(pick([4, 5, 6, mirror(6), mirror(5), mirror(4)]), c.col.glass, hint);
      K.m.paint.poly(pick([6, 7, 8, 9, mirror(8), mirror(7), mirror(6)]), c.col.roof, hint);
      // face furniture, placed on the cap plane
      const face = (z, y) => {
        const t = c.noseT[tl];
        const sc = Math.cbrt(Math.max(0, 1 - t * t * t));
        const h = clamp((y - c.floor) / (c.crown - c.floor));
        const yy = y > c.floor ? c.floor + (y - c.floor) * (1 - c.noseDrop * t * t) : y;
        const off = c.noseLen * t - c.noseRake * t * Math.pow(h, 1.5);
        return [xEnd - end * (c.noseLen - off), yy, z * sc];
      };
      const zl = (c.core * 0.62);
      for (const s of [1, -1]) {
        const a = face(s * zl, c.floor + 0.34);
        K.m.lamp.box(a[0] - 0.02, a[0] + 0.07 * end + 0.02 * -end * 0, a[1] - 0.07, a[1] + 0.07, a[2] - 0.11, a[2] + 0.11, [1, 1, 1], { ao: 1 });
        const b = face(s * zl, c.floor + 0.62);
        K.m.tail.box(Math.min(b[0], b[0] + 0.05 * end), Math.max(b[0], b[0] + 0.05 * end), b[1] - 0.045, b[1] + 0.045, b[2] - 0.08, b[2] + 0.08, [1, 1, 1], { ao: 1 });
      }
      const d = face(0, c.winTop - 0.06);
      const dw = c.core * 0.62;
      K.m.dest.box(Math.min(d[0], d[0] + 0.07 * end), Math.max(d[0], d[0] + 0.07 * end), d[1] - 0.12, d[1] + 0.12, -dw, dw, [1, 1, 1], { ao: 1 });
      // coupler cover and a dark bumper bar under the skirt
      const bm = face(0, c.floor - 0.2);
      K.m.matte.box(Math.min(bm[0], bm[0] + 0.28 * end), Math.max(bm[0], bm[0] + 0.28 * end), c.yUnder - 0.12, c.floor - 0.08, -c.core * 0.55, c.core * 0.55, c.col.bumper, { ao: 0.6 });
      // centre gangway door, a dark inset strip in the glass
      K.m.glass.box(Math.min(d[0], d[0] + 0.015 * end) - 0.0, Math.max(d[0], d[0] + 0.015 * end), c.floor + 0.55, c.winTop - 0.4, -0.02, 0.02, mul(c.col.glass, 0.5), { ao: 1 });
    }

    // --- side bays: window bays, door bays
    const bays = c.bays(ci, bodyA, bodyB, cr);
    for (const s of [1, -1]) {
      const zIn = s * c.core, zOut = s * c.panel;
      const skipIn = s > 0 ? '-z' : '+z';
      const zlo = Math.min(zIn, zOut), zhi = Math.max(zIn, zOut);
      for (const b of bays) {
        if (b.kind === 'win') {
          K.m.paint.box(b.x0, b.x1, c.floor, c.belt, zlo, zhi, c.col.lower, { ao: 0.72, skip: `${skipIn}-y` });
          K.m.paint.box(b.x0, b.x1, c.winTop, c.winTop + 0.2, Math.min(zIn, s * (c.panel - 0.02)), Math.max(zIn, s * (c.panel - 0.02)), c.col.upper, { ao: 0.8, skip: `${skipIn}-y` });
          const g = zIn + s * 0.025;
          K.m.glass.quad([b.x0 + 0.05, c.belt + 0.03, g], [b.x1 - 0.05, c.belt + 0.03, g], [b.x1 - 0.05, c.winTop - 0.03, g], [b.x0 + 0.05, c.winTop - 0.03, g], c.col.glass, [0, 0, s]);
          if (b.x1 - b.x0 > 1.7) {
            const mx = (b.x0 + b.x1) / 2;
            K.m.paint.box(mx - 0.05, mx + 0.05, c.belt, c.winTop, Math.min(zIn, s * (c.panel - 0.03)), Math.max(zIn, s * (c.panel - 0.03)), c.col.pillar, { ao: 0.85, skip: `${skipIn}-y` });
          }
        } else if (b.kind === 'door') {
          const mx = (b.x0 + b.x1) / 2, hw = (b.x1 - b.x0) / 2;
          const lz0 = s * (c.core + 0.02), lz1 = s * (c.core + 0.075);
          K.m.paint.box(mx - hw + 0.04, mx - 0.015, c.floor + 0.05, c.winTop + 0.02, Math.min(lz0, lz1), Math.max(lz0, lz1), c.col.door, { ao: 0.75, skip: `${skipIn}-y` });
          K.m.paint.box(mx + 0.015, mx + hw - 0.04, c.floor + 0.05, c.winTop + 0.02, Math.min(lz0, lz1), Math.max(lz0, lz1), c.col.door, { ao: 0.75, skip: `${skipIn}-y` });
          for (const dx of [-1, 1]) {
            const gx0 = dx < 0 ? mx - hw + 0.16 : mx + 0.12, gx1 = dx < 0 ? mx - 0.12 : mx + hw - 0.16;
            K.m.glass.quad([gx0, c.belt + 0.1, lz1 + s * 0.006], [gx1, c.belt + 0.1, lz1 + s * 0.006], [gx1, c.winTop - 0.14, lz1 + s * 0.006], [gx0, c.winTop - 0.14, lz1 + s * 0.006], c.col.glass, [0, 0, s]);
          }
          for (const jx of [b.x0, b.x1 - 0.07]) K.m.paint.box(jx, jx + 0.07, c.floor, c.winTop + 0.2, Math.min(zIn, zOut), Math.max(zIn, zOut), c.col.jamb, { ao: 0.75, skip: `${skipIn}-y` });
          K.m.paint.box(b.x0, b.x1, c.winTop + 0.02, c.winTop + 0.2, Math.min(zIn, s * (c.panel - 0.02)), Math.max(zIn, s * (c.panel - 0.02)), c.col.upper, { ao: 0.8, skip: `${skipIn}-y` });
          K.m.paint.box(b.x0 + 0.07, b.x1 - 0.07, c.winTop + 0.0, c.winTop + 0.04, Math.min(zIn, zOut) * 0 + Math.min(lz0, lz1), Math.max(lz0, lz1), c.col.jamb, { ao: 1, skip: `${skipIn}-y` });
        }
      }
      // belt line and a drip rail above the glass, one long strip each
      const ex0 = bodyA + 0.1, ex1 = bodyB - 0.1;
      if (c.col.belt) K.m.metal.box(ex0, ex1, c.belt - 0.035, c.belt + 0.02, Math.min(zIn, s * (c.panel + 0.012)), Math.max(zIn, s * (c.panel + 0.012)), c.col.belt, { ao: 1, skip: `${skipIn}-y` });
      if (c.col.stripe) K.m.paint.box(ex0, ex1, c.floor + 0.12, c.floor + 0.2, Math.min(zIn, s * (c.panel + 0.008)), Math.max(zIn, s * (c.panel + 0.008)), c.col.stripe, { ao: 1, skip: `${skipIn}-y` });
    }

    // --- under the floor and on the roof
    for (const bx of c.bogies(ci, bodyA, bodyB, cr)) bogie(K, pal, bx, c.wheelR, c.wheelbase);
    for (const e of c.under(ci, bodyA, bodyB, cr)) {
      K.m.matte.box(e.x - e.l / 2, e.x + e.l / 2, c.yUnder - e.h, c.yUnder + 0.02, e.z - e.w / 2, e.z + e.w / 2, e.col ?? pal.bogie, { ao: 0.55, skip: '+y' });
    }
    c.roof(K, pal, ci, bodyA, bodyB, cr);
  }

  // --- gangways between cars: a dark bellows frame and a coupling bar
  for (let ci = 0; ci < car.length - 1; ci += 1) {
    const a = car[ci].x1, b = car[ci + 1].x0;
    K.m.matte.box(a - 0.02, b + 0.02, c.floor + 0.12, c.winTop + 0.12, -c.core * 0.82, c.core * 0.82, c.col.gangway, { ao: 0.7 });
    K.m.matte.box(a - 0.02, b + 0.02, c.winTop + 0.12, c.winTop + 0.34, -c.core * 0.6, c.core * 0.6, mul(c.col.gangway, 1.15), { ao: 0.8, skip: '-y' });
    K.m.matte.box(a - 0.1, b + 0.1, c.yUnder - 0.08, c.yUnder + 0.1, -0.22, 0.22, pal.bogie, { ao: 0.6 });
  }
  return K;
}

/* ------------------------------------------------------------------ */
/* The metro set                                                       */
/* ------------------------------------------------------------------ */

function splitBays(a, b, doorCentres, doorW) {
  const out = [];
  let x = a;
  for (const d of doorCentres) {
    const d0 = d - doorW / 2, d1 = d + doorW / 2;
    if (d0 - x > 0.18) out.push({ kind: 'win', x0: x, x1: d0 });
    out.push({ kind: 'door', x0: d0, x1: d1 });
    x = d1;
  }
  if (b - x > 0.18) out.push({ kind: 'win', x0: x, x1: b });
  return out;
}

/** Roof equipment box with a dark grille on top: it is a piece of plant, not a painted rectangle. */
function plantBox(K, pal, x, y, z, l, w, h, body, grille) {
  K.m.paint.box(x - l / 2, x + l / 2, y, y + h, z - w / 2, z + w / 2, body, { ao: 0.78, skip: '-y' });
  K.m.metal.box(x - l / 2 + 0.08, x + l / 2 - 0.08, y + h, y + h + 0.045, z - w / 2 + 0.08, z + w / 2 - 0.08, grille, { ao: 1, skip: '-y' });
  for (let k = -2; k <= 2; k += 1) K.m.metal.box(x + k * (l / 6) - 0.025, x + k * (l / 6) + 0.025, y + h + 0.045, y + h + 0.09, z - w / 2 + 0.12, z + w / 2 - 0.12, mul(grille, 1.35), { ao: 1, skip: '-y' });
}

/** Pantograph in its lowered, station-stop posture: a base frame, two folded arms and the collector head. */
function pantograph(K, pal, x, y) {
  K.m.metal.box(x - 0.7, x + 0.7, y, y + 0.1, -0.78, 0.78, pal.steel, { ao: 0.7 });
  for (const s of [1, -1]) {
    K.m.metal.bar([x - 0.45, y + 0.1, s * 0.7], [x + 0.18, y + 0.42, s * 0.62], 0.075, pal.steel);
    K.m.metal.bar([x + 0.18, y + 0.42, s * 0.62], [x - 0.3, y + 0.62, s * 0.56], 0.07, pal.steel);
    K.m.matte.box(x - 0.52, x - 0.38, y + 0.1, y + 0.2, s * 0.7 - 0.07, s * 0.7 + 0.07, pal.bogie, { ao: 0.7 });
  }
  K.m.metal.box(x - 0.5, x + 0.12, y + 0.6, y + 0.65, -0.82, 0.82, pal.silver, { ao: 0.9 });
  K.m.matte.box(x - 0.3, x - 0.1, y + 0.65, y + 0.71, -0.8, 0.8, pal.bogie, { ao: 1, skip: '-y' });
}

export const METRO = {
  cars: [{ len: 7.9, cab: -1 }, { len: 7.9, cab: 0 }, { len: 7.9, cab: 1 }],
  gap: 0.34,
  core: 1.2, panel: 1.31,
  yUnder: 0.66, floor: 1.02, belt: 1.92, winTop: 2.84, eave: 3.06, crown: 3.4,
  noseLen: 1.7, noseRake: 0.8, noseDrop: 0.22, noseT: [0.34, 0.6, 0.8, 0.92, 0.975],
  wheelR: 0.44, wheelbase: 1.9,
  doorW: 1.3,
};

/**
 * PTV metro set (X'Trapolis-like): three cars, 24.4 m, 2.62 m over the panels, 3.4 m to the roof crown.
 * Returns { paint, metal, glass, matte, lamp, tail, dest } geometries.
 */
export function buildMetroTrain(pal = defaultPalette()) {
  const cfg = {
    ...METRO,
    col: {
      under: pal.bogie, skirt: pal.metroDark, wall: pal.interior, body: pal.metroBlue, glass: pal.glassDark, upper: pal.metroBlue,
      roof: pal.roofGrey, lower: pal.metroBlue, door: pal.doorYellow, jamb: pal.metroDark, pillar: pal.metroSill,
      belt: pal.metroSilver, stripe: null, gangway: mul(pal.bogie, 1.1), bumper: pal.bumper,
    },
    bays: (ci, a, b, car) => {
      const len = b - a;
      const d = ci === 0 ? [a + len * 0.30, a + len * 0.78] : ci === 2 ? [a + len * 0.22, a + len * 0.70] : [a + len * 0.25, a + len * 0.75];
      return splitBays(a, b, d, METRO.doorW);
    },
    bogies: (ci, a, b) => [(a + b) / 2 - 2.35, (a + b) / 2 + 2.35],
    under: (ci, a, b) => [
      { x: (a + b) / 2 - 0.9, l: 1.5, w: 0.8, h: 0.34, z: 0.38 },
      { x: (a + b) / 2 + 0.9, l: 1.2, w: 0.7, h: 0.3, z: -0.4, col: mul(pal.bogie, 1.2) },
    ],
    roof: (K, p, ci, a, b) => {
      const m = (a + b) / 2;
      const crown = METRO.crown;
      if (ci === 1) pantograph(K, p, m, crown - 0.02);
      plantBox(K, p, ci === 1 ? m - 2.1 : m - 1.2, crown - 0.04, 0, 1.7, 1.0, 0.2, p.roofGrey, p.vlinePodCap);
      plantBox(K, p, ci === 1 ? m + 2.1 : m + 1.9, crown - 0.04, 0, 1.2, 0.9, 0.16, p.roofGrime, p.vlinePodCap);
    },
  };
  return buildSet(cfg, pal).build();
}

/* ------------------------------------------------------------------ */
/* The V/Line set                                                      */
/* ------------------------------------------------------------------ */

export const VLINE = {
  cars: [{ len: 9.4, cab: -1 }, { len: 9.2, cab: 0 }, { len: 8.8, cab: 1 }],
  gap: 0.3,
  core: 1.25, panel: 1.37,
  yUnder: 0.7, floor: 1.06, belt: 1.98, winTop: 2.9, eave: 3.12, crown: 3.5,
  noseLen: 2.1, noseRake: 1.0, noseDrop: 0.2, noseT: [0.34, 0.6, 0.8, 0.92, 0.975],
  wheelR: 0.46, wheelbase: 2.0,
  doorW: 1.2,
};

/** V/Line VLocity-like diesel set: purple and gold, 28 m, big wraparound cab windscreens, roof pods and exhausts. */
export function buildVLineTrain(pal = defaultPalette()) {
  const cfg = {
    ...VLINE,
    col: {
      under: pal.bogie, skirt: pal.vlineGrey, wall: pal.interior, body: pal.vlinePurple, glass: pal.glassDark, upper: pal.silver,
      roof: pal.vlineRoof, lower: pal.vlinePurple, door: pal.vlineDeep, jamb: pal.vlineGrey, pillar: pal.silver,
      belt: pal.vlineGold, stripe: pal.vlineDeep, gangway: mul(pal.bogie, 1.1), bumper: pal.bumper,
    },
    bays: (ci, a, b) => {
      const len = b - a;
      const d = ci === 0 ? [a + len * 0.34, a + len * 0.82] : ci === 2 ? [a + len * 0.2, a + len * 0.68] : [a + len * 0.22, a + len * 0.76];
      return splitBays(a, b, d, VLINE.doorW);
    },
    bogies: (ci, a, b) => [(a + b) / 2 - 3.1, (a + b) / 2 + 3.1],
    under: (ci, a, b) => [
      { x: (a + b) / 2 - 0.6, l: 2.0, w: 0.9, h: 0.38, z: 0.3 },
      { x: (a + b) / 2 + 1.2, l: 1.3, w: 0.8, h: 0.3, z: -0.35, col: mul(pal.bogie, 1.2) },
    ],
    roof: (K, p, ci, a, b) => {
      const m = (a + b) / 2;
      const crown = VLINE.crown;
      for (const rx of [m - 2.4, m + 2.4]) plantBox(K, p, rx, crown - 0.05, -0.1, 1.7, 1.2, 0.26, p.vlineRoofPod, p.vlinePodCap);
      K.m.matte.box(m - 2.8, m + 2.8, crown - 0.04, crown + 0.06, 0.45, 0.8, mul(p.vlineRoof, 0.8), { ao: 0.7, skip: '-y' });
      for (const sx of [-3.4, 0.1, 3.4]) K.m.metal.cyl([m + sx, crown + 0.14, -0.62], 'y', 0.15, 0.19, 0.28, 8, p.silver, { ao: 1 });
    },
  };
  return buildSet(cfg, pal).build();
}

/* ------------------------------------------------------------------ */
/* The PTV bus                                                         */
/* ------------------------------------------------------------------ */

/**
 * 12 m low-floor route bus: one smooth body (rounded roof, inset window band, a belt line), real wheel arches
 * cut into the sides with the wheels sitting in them, and two door recesses a side. 2.5 x 12.0 x 3.3 m.
 */
export function buildPtvBus(pal = defaultPalette()) {
  const K = new Kit(SLOTS);
  const LEN = 12.0, HALF = LEN / 2;
  const NOSE = 0.55;
  const AXLES = [-2.75, 3.2];
  const ARCH_HALF = 0.62;
  const DOORS = [{ a: -0.4, b: 0.85 }, { a: 4.15, b: 5.2 }];
  const prof = [
    [1.10, 0.40], [1.24, 0.55], [1.25, 1.10], [1.19, 1.13], [1.19, 2.47], [1.25, 2.52], [1.04, 3.05], [0.60, 3.26], [0.0, 3.32],
  ];
  const n = prof.length;
  const ringN = 2 * n - 1;
  const mirror = (k) => ringN - 1 - k; // 0..n-1 then mirrors of n-2..0 at n..ringN-1
  const kOf = (j) => (j < n ? j : ringN - j - 1);
  const crownY = 3.32;
  const ringAt = (x, nose, end) => {
    const pts = [];
    const place = (z, y, s) => {
      if (!nose) return [x, y, z * s];
      const t = nose;
      const sc = Math.cbrt(Math.max(0, 1 - t * t * t));
      const h = clamp((y - 0.55) / (crownY - 0.55));
      const yy = y > 0.55 ? 0.55 + (y - 0.55) * (1 - 0.06 * t * t) : y;
      const off = NOSE * t - (end > 0 ? 0.30 : 0.10) * t * Math.pow(h, 1.4);
      return [end * (HALF - NOSE + off), yy, z * s * sc];
    };
    for (let k = 0; k < n; k += 1) pts.push(place(prof[k][0], prof[k][1], 1));
    for (let k = n - 2; k >= 0; k -= 1) pts.push(place(prof[k][0], prof[k][1], -1));
    return pts;
  };
  const NT = { rear: [0.92, 0.6], front: [0.6, 0.92] };
  const stations = [];
  const add = (st) => stations.push(st);
  add({ x: -HALF, t: NT.rear[0], end: -1 }); add({ x: -HALF, t: NT.rear[1], end: -1 });
  add({ x: -HALF + NOSE });
  const interior = [];
  for (const ax of AXLES) interior.push({ a: ax - ARCH_HALF, b: ax + ARCH_HALF, kind: 'arch', ax });
  for (const d of DOORS) interior.push({ a: d.a, b: d.b, kind: 'door' });
  interior.sort((p, q) => p.a - q.a);
  const spans = []; // [stationIndexA, stationIndexB, item]
  for (const it of interior) {
    add({ x: it.a }); const ia = stations.length - 1;
    add({ x: it.b }); spans.push([ia, stations.length - 1, it]);
  }
  add({ x: HALF - NOSE });
  add({ x: HALF, t: NT.front[0], end: 1 }); add({ x: HALF, t: NT.front[1], end: 1 });
  const P = stations.map((st) => ringAt(st.x, st.t ?? 0, st.end ?? 0));
  const skip = new Map();
  for (const [ia, , it] of spans) skip.set(ia, it);
  const cellColour = (j) => {
    const k = j < n - 1 ? j : ringN - j - 2;
    return [pal.bumper, pal.busOrange, pal.busWhite, pal.busWhite, pal.busWhite, pal.busOrange, pal.busWhite, pal.busWhite][Math.min(k, 7)];
  };
  K.m.paint.loft(P, {
    closed: true,
    hardJ: (j) => { const k = kOf(j); return k >= 1 && k <= 5; },
    cell: (i, j) => {
      const it = skip.get(i);
      const k = j < n - 1 ? j : ringN - j - 2;
      if (it?.kind === 'arch' && k <= 1) return null;
      if (it?.kind === 'door' && k >= 1 && k <= 4) return null;
      return cellColour(j);
    },
    ao: (i, j) => { const k = kOf(j); return k === 0 ? 0.55 : k === 1 ? 0.78 : 1; },
  });

  // --- wheel arches: a wheel-well half cylinder, filler corners, the wheel sitting in it
  for (const ax of AXLES) {
    for (const s of [1, -1]) {
      const zo = s * 1.25, zi = s * 0.84;
      const arc = [];
      const SEG = 6;
      for (let k = 0; k <= SEG; k += 1) {
        const th = Math.PI * (k / SEG);
        arc.push([ax + Math.cos(th) * 0.6, 0.5 + Math.sin(th) * 0.6]);
      }
      for (let k = 0; k < SEG; k += 1) {
        const a = arc[k], b = arc[k + 1];
        K.m.matte.quad([a[0], a[1], zo], [b[0], b[1], zo], [b[0], b[1], zi], [a[0], a[1], zi],
          [mul(pal.bogie, 0.9), mul(pal.bogie, 0.9), mul(pal.bogie, 0.4), mul(pal.bogie, 0.4)], [0, -1, 0]);
      }
      // back plate of the well and the corner fillers on the wall plane
      K.m.matte.poly(arc.map((q) => [q[0], q[1], zi]), mul(pal.bogie, 0.35), [0, 0, s]);
      for (const sd of [-1, 1]) {
        const c0 = [ax + sd * ARCH_HALF, 1.10, zo];
        const c1 = [ax + sd * ARCH_HALF, 0.5, zo];
        // sd>0: arc from angle 0 (right) up to the top; sd<0: from the top (index SEG/2) to the left
        const ring = [c0, c1, ...(sd < 0 ? arc.slice(SEG / 2) : arc.slice(0, SEG / 2 + 1).reverse()).map((q) => [q[0], q[1], zo])];
        K.m.paint.poly(ring, pal.busOrange, [0, 0, s]);
      }
      // the wheel: a tyre with its face just inside the body line, plus a rim disc
      const wz = s * 0.98;
      K.m.matte.cyl([ax, 0.5, wz], 'z', 0.5, 0.5, 0.3, 10, pal.tyre, { capA: s < 0, capB: s > 0, capCol: [pal.rim, mul(pal.tyre, 1.25)], phase: Math.PI / 10 });
    }
    K.m.metal.box(ax - 0.06, ax + 0.06, 0.44, 0.56, -1.0, 1.0, pal.steel, { ao: 0.7 });
  }

  // --- door recesses: a dark back wall with two glass leaves, jambs and a sill ledge
  for (const d of DOORS) {
    for (const s of [1, -1]) {
      const zb = s * 1.12, zo = s * 1.25;
      const y0 = 0.62, y1 = 2.5;
      K.m.matte.quad([d.a, y0, zb], [d.b, y0, zb], [d.b, y1, zb], [d.a, y1, zb], mul(pal.interior, 0.7), [0, 0, s]);
      const mx = (d.a + d.b) / 2;
      for (const [x0, x1] of [[d.a + 0.1, mx - 0.03], [mx + 0.03, d.b - 0.1]]) {
        K.m.glass.quad([x0, 0.92, zb + s * 0.006], [x1, 0.92, zb + s * 0.006], [x1, y1 - 0.12, zb + s * 0.006], [x0, y1 - 0.12, zb + s * 0.006], pal.glassDark, [0, 0, s]);
      }
      K.m.paint.quad([d.a, y0, zb], [d.a, y0, zo], [d.a, y1, zo], [d.a, y1, zb], mul(pal.busWhite, 0.8), [1, 0, 0]);
      K.m.paint.quad([d.b, y0, zb], [d.b, y0, zo], [d.b, y1, zo], [d.b, y1, zb], mul(pal.busWhite, 0.8), [-1, 0, 0]);
      K.m.paint.quad([d.a, y0, zb], [d.b, y0, zb], [d.b, y0, zo], [d.a, y0, zo], mul(pal.busWhite, 0.7), [0, 1, 0]);
      K.m.paint.quad([d.a, y1, zb], [d.b, y1, zb], [d.b, y1, zo], [d.a, y1, zo], mul(pal.busWhite, 0.55), [0, -1, 0]);
    }
  }

  // --- window panes along the inset band, between the doors and clear of the corners
  const panes = [];
  const spanWin = [[-HALF + 0.75, DOORS[0].a - 0.15], [DOORS[0].b + 0.15, DOORS[1].a - 0.15], [DOORS[1].b + 0.15, HALF - 0.8]];
  for (const [a, b] of spanWin) {
    const cnt = Math.max(1, Math.round((b - a) / 1.3));
    const w = (b - a) / cnt;
    for (let k = 0; k < cnt; k += 1) panes.push([a + k * w + 0.05, a + (k + 1) * w - 0.05]);
  }
  for (const s of [1, -1]) {
    const zg = s * 1.196;
    for (const [a, b] of panes) K.m.glass.quad([a, 1.22, zg], [b, 1.22, zg], [b, 2.4, zg], [a, 2.4, zg], pal.glassDark, [0, 0, s]);
  }

  // --- the two ends: fascia, windscreen, rear window, lights, bumpers, destination board
  const end = (e, front) => {
    const ring = P[front ? P.length - 1 : 0];
    const pick = (ks) => ks.map((k) => ring[k]);
    const hint = [e, 0, 0];
    K.m.paint.poly(pick([0, 1, 2, mirror(2), mirror(1), mirror(0)].filter((k, i, a) => a.indexOf(k) === i)), pal.busOrange, hint);
    K.m.glass.poly(pick(front ? [2, 3, 4, 5, mirror(5), mirror(4), mirror(3), mirror(2)] : [3, 4, mirror(4), mirror(3)]), pal.glassDark, hint);
    K.m.paint.poly(pick(front ? [5, 6, 7, 8, mirror(7), mirror(6), mirror(5)] : [4, 5, 6, 7, 8, mirror(7), mirror(6), mirror(5), mirror(4)]), pal.busWhite, hint);
    const xo = e * (HALF + 0.02);
    K.m.matte.box(Math.min(xo, xo + e * 0.3), Math.max(xo, xo + e * 0.3), 0.40, 0.74, -1.17, 1.17, pal.bumper, { ao: 0.6 });
    for (const s of [1, -1]) {
      if (front) K.m.lamp.box(xo - 0.0, xo + e * 0.06, 0.82, 0.96, s * 0.82 - 0.17, s * 0.82 + 0.17, [1, 1, 1], { ao: 1 });
      else K.m.tail.box(xo - 0.0, xo + e * 0.05, 0.84, 1.0, s * 0.92 - 0.1, s * 0.92 + 0.1, [1, 1, 1], { ao: 1 });
    }
    if (front) K.m.dest.box(xo - 0.1, xo + 0.02, 2.58, 2.86, -0.8, 0.8, [1, 1, 1], { ao: 1 });
  };
  end(1, true); end(-1, false);

  // --- mirrors, roof pod, rear lamp cluster
  for (const s of [1, -1]) {
    K.m.metal.bar([HALF - 0.9, 2.15, s * 1.25], [HALF - 0.62, 2.05, s * 1.58], 0.045, pal.steel);
    K.m.matte.box(HALF - 0.72, HALF - 0.52, 1.7, 2.4, s * 1.56 - 0.04, s * 1.56 + 0.04, pal.bumper, { ao: 0.7 });
  }
  plantBox(K, pal, -3.2, crownY - 0.02, 0, 2.2, 1.2, 0.22, pal.busWhite, pal.bogie);
  plantBox(K, pal, 0.6, crownY - 0.03, 0, 0.9, 0.9, 0.16, pal.busWhite, pal.bogie);
  return K.build();
}

/* ------------------------------------------------------------------ */
/* The hall: branching columns and portal ribs                         */
/* ------------------------------------------------------------------ */

const WHITE = [1, 1, 1];

/**
 * Branching tree columns for the dune hall. Returns geometries keyed by the station material that draws them
 * (`steel`, `steelDark`, `steelWarm`, `bluestone`, `bluestoneCap`); colour comes from those materials.
 * Each column stands on a stepped stone pad, rises as a tapered shaft, swells into a node, and forks into four
 * arms (two across the hall, two along it) that land on the soffit line, found from the same dune function that
 * shapes the roof. `spots` is [{ x, z, spreadZ, spreadX }].
 */
export function buildHallColumns({ dune, plat, spots, soffit = 0.8 }) {
  const K = new Kit(['steel', 'steelDark', 'steelWarm', 'bluestone', 'bluestoneCap']);
  for (const s of spots) {
    const { x, z } = s;
    const sz = s.spreadZ ?? 2.3, sx = s.spreadX ?? 2.6;
    const topY = dune.y(x, z) - soffit - 0.05;
    const forkY = topY - 3.3;
    const node = forkY - 0.05;
    K.m.bluestoneCap.box(x - 0.82, x + 0.82, plat - 0.02, plat + 0.3, z - 0.82, z + 0.82, WHITE, { ao: 0.7, skip: '-y' });
    K.m.bluestone.box(x - 0.66, x + 0.66, plat + 0.3, plat + 0.8, z - 0.66, z + 0.66, WHITE, { ao: 0.75, skip: '-y' });
    K.m.steelDark.cyl([x, plat + 0.87, z], 'y', 0.52, 0.52, 0.14, 10, WHITE, { capA: false });
    K.m.steel.cyl([x, (plat + 0.9 + node) / 2, z], 'y', 0.3, 0.46, node - plat - 0.9, 10, WHITE, { capA: false, capB: false });
    K.m.steelDark.cyl([x, node - 0.1, z], 'y', 0.42, 0.5, 0.2, 10, WHITE);
    K.m.steelWarm.cyl([x, node + 0.14, z], 'y', 0.5, 0.3, 0.3, 10, WHITE);
    for (const [ax, az] of [[sx, 0], [-sx, 0], [0, sz], [0, -sz]]) {
      const land = [x + ax, dune.y(x + ax, z + az) - soffit - 0.05, z + az];
      K.m.steel.bar([x, node + 0.2, z], land, 0.24, WHITE, { ao: 0.9 });
      K.m.steelDark.box(land[0] - 0.22, land[0] + 0.22, land[1] - 0.04, land[1] + 0.1, land[2] - 0.22, land[2] + 0.22, WHITE, { ao: 0.8 });
    }
  }
  return K.build();
}

/**
 * Open-end portal: a pair of flanking jambs, a lintel rail and a stone kerb in place of the glazed gable. The
 * opening follows the dune profile, so the wave shows in silhouette. `x` is the end plane, `dir` +1 or -1.
 */
export function buildHallPortal({ dune, plat, halfW, x, dir, rib = 0.34 }) {
  const K = new Kit(['steel', 'steelDark', 'mullion', 'bluestone', 'bluestoneCap']);
  const N = 14;
  const inner = halfW - 0.25;
  const pts = [];
  for (let j = 0; j <= N; j += 1) {
    const z = -inner + (j / N) * inner * 2;
    pts.push([x, dune.y(x, z) - 0.62, z]);
  }
  for (let j = 0; j < N; j += 1) K.m.steel.bar(pts[j], pts[j + 1], rib, WHITE, { ao: 0.85, tv: rib * 1.4 });
  // jambs at the ends of the rib and a few hangers down to the stone kerb rail
  for (const j of [0, N]) K.m.steelDark.bar([x, plat + 2.2, pts[j][2]], pts[j], 0.3, WHITE, { ao: 0.8 });
  for (let j = 2; j < N; j += 3) K.m.steelDark.bar(pts[j], [x, pts[j][1] - 1.1, pts[j][2]], 0.12, WHITE, { ao: 0.9 });
  // kerb rail: a low stone wall with a coping and slim posts, so the concourse is edged and not walled
  K.m.bluestone.box(x - 0.5, x + 0.5, plat, plat + 1.05, -halfW + 0.2, halfW - 0.2, WHITE, { ao: 0.7, skip: '-y' });
  K.m.bluestoneCap.box(x - 0.62, x + 0.62, plat + 1.05, plat + 1.22, -halfW + 0.1, halfW - 0.1, WHITE, { ao: 0.85, skip: '-y' });
  for (let k = 0; k <= 8; k += 1) {
    const z = -halfW + 0.6 + (k / 8) * (halfW * 2 - 1.2);
    K.m.mullion.box(x - 0.09, x + 0.09, plat + 1.22, plat + 3.2, z - 0.07, z + 0.07, WHITE, { ao: 0.9, skip: '-y' });
  }
  K.m.steelDark.box(x - 0.1, x + 0.1, plat + 3.14, plat + 3.28, -halfW + 0.6 - 0.1, halfW - 0.6 + 0.1, WHITE, { ao: 1, skip: '-y' });
  void dir;
  return K.build();
}

/**
 * Longitudinal truss under the soffit at z: top and bottom chords as bars, uprights every other bay and a
 * warren web. One merged geometry per material, 12 triangles a member.
 */
export function buildHallTruss({ dune, halfL, z, depth, thick, n = 20 }) {
  const K = new Kit(['steel', 'steelDark', 'steelWarm']);
  const top = [], bot = [];
  for (let i = 0; i <= n; i += 1) {
    const x = -halfL * 0.94 + (i / n) * halfL * 1.88;
    const y = dune.y(x, z) - 0.78;
    top.push([x, y, z]); bot.push([x, y - depth, z]);
  }
  for (let i = 0; i < n; i += 1) {
    K.m.steel.bar(top[i], top[i + 1], thick, WHITE, { ao: 0.9 });
    K.m.steel.bar(bot[i], bot[i + 1], thick * 0.9, WHITE, { ao: 0.7 });
  }
  for (let i = 0; i <= n; i += 2) K.m.steelDark.bar(top[i], bot[i], thick * 0.62, WHITE, { ao: 0.9 });
  for (let i = 0; i < n; i += 2) {
    K.m.steelWarm.bar(bot[i], top[i + 1], thick * 0.5, WHITE, { ao: 0.9 });
    if (i + 2 <= n) K.m.steelWarm.bar(top[i + 1], bot[i + 2], thick * 0.5, WHITE, { ao: 0.9 });
  }
  return K.build();
}

/** Transverse arch ribs under the soffit at each x in `xs`, with short hangers. */
export function buildHallRibs({ dune, halfW, xs, thick }) {
  const K = new Kit(['steel', 'steelWarm']);
  const n = 12;
  const inner = halfW - 2.2;
  for (const x of xs) {
    const pts = [];
    for (let j = 0; j <= n; j += 1) {
      const z = -inner + (j / n) * inner * 2;
      pts.push([x, dune.y(x, z) - 0.8, z]);
    }
    for (let j = 0; j < n; j += 1) K.m.steel.bar(pts[j], pts[j + 1], thick, WHITE, { ao: 0.9 });
    for (let j = 2; j < n - 1; j += 3) K.m.steelWarm.bar(pts[j], [x, pts[j][1] - 0.85, pts[j][2]], thick * 0.55, WHITE, { ao: 0.9 });
  }
  return K.build();
}

/** A square-section bar between two points as one small geometry (12 triangles), for the hall's rails and stays. */
export function barGeo(p0, p1, thick) {
  const m = new Mesher();
  m.bar(p0, p1, thick, WHITE, { ao: 0.9 });
  return m.tris ? m.build() : null;
}

/**
 * An open long side: a low stone kerb with a coping, slim posts at about 3 m and a head beam under the roof's
 * clerestory band at `topY`, in place of a glazed wall. `z` is the side's plane.
 */
export function buildHallOpenSide({ halfL, z, plat, topY, bays = 16 }) {
  const K = new Kit(['steelDark', 'mullion', 'bluestone', 'bluestoneCap']);
  const x0 = -halfL + 0.4, x1 = halfL - 0.4;
  K.m.bluestone.box(x0, x1, plat, plat + 1.05, z - 0.42, z + 0.42, WHITE, { ao: 0.7, skip: '-y' });
  K.m.bluestoneCap.box(x0 - 0.1, x1 + 0.1, plat + 1.05, plat + 1.2, z - 0.52, z + 0.52, WHITE, { ao: 0.85, skip: '-y' });
  for (let k = 0; k <= bays; k += 1) {
    const x = x0 + (k / bays) * (x1 - x0);
    K.m.mullion.box(x - 0.09, x + 0.09, plat + 1.2, topY - 0.2, z - 0.09, z + 0.09, WHITE, { ao: 0.9, skip: '-y' });
  }
  K.m.steelDark.box(x0, x1, topY - 0.2, topY + 0.02, z - 0.2, z + 0.2, WHITE, { ao: 0.8 });
  K.m.steelDark.box(x0, x1, plat + 3.0, plat + 3.1, z - 0.07, z + 0.07, WHITE, { ao: 1 });
  return K.build();
}
