// Melbourne Park and Rod Laver props: bus, vans, shelter, fountain, roundabout, planting bed.
//
// Pure geometry builders: no scene access, no globals, deterministic (the same arguments give
// byte-identical buffers). Every builder returns an object of merged, indexed BufferGeometry
// parts with `position`, `normal` and `color`. Dimensions are real metres, origin on the ground at
// the model centre, +x is the front of a vehicle, +z is the serving or open side.
//
// Vertex colour contract:
//   * vehicle `body` and `trim` parts carry real linear colours (paint, stripe, rubber) times a
//     height-based ambient occlusion ramp, and are drawn with a white vertexColors material;
//   * every other part (stone, water, steel, glass, leaves) carries only the occlusion multiplier
//     (grey, about 0.6 to 1.0) and is drawn with a vertexColors clone of the venue material of the
//     same name, so the tone stays on the venue's own tokens.
import * as THREE from 'three';
import { TASTE } from '../../taste-tokens.js';

const TAU = Math.PI * 2;

/** The vehicle paint list of the street and the apron (airport.js GSE_PAINT, authored after the grade). */
export const VEHICLE_PAINT = Object.freeze({
  white: '#A09C94',
  silver: '#92969A',
  charcoal: '#3C3E42',
  navy: TASTE.accent.navy,
  maroon: TASTE.accent.maroon,
  olive: TASTE.accent.olive,
  gold: '#9E8035',
});

const lin = (hex, k = 1) => { const c = new THREE.Color(hex); return [c.r * k, c.g * k, c.b * k]; };
const WHITE = [1, 1, 1];
const sstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
function hash(a, b = 0) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + 1013904223) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* ------------------------------------------------------------------ */
/* Mesher                                                               */
/* ------------------------------------------------------------------ */

class Mesher {
  constructor(o = {}) {
    this.pos = []; this.col = []; this.idx = []; this.tf = null;
    this.aoLow = o.aoLow ?? 0.6;
    this.aoSpan = o.aoSpan ?? 1.0;
    this._p = new THREE.Vector3();
  }

  get count() { return this.pos.length / 3; }

  /** Vertex at model coordinates; colour is `c` times the ground occlusion ramp times `k`. */
  v(x, y, z, c = WHITE, k = 1) {
    const p = this._p.set(x, y, z);
    if (this.tf) p.applyMatrix4(this.tf);
    const ao = k * (this.aoLow + (1 - this.aoLow) * sstep(0, this.aoSpan, p.y));
    this.pos.push(p.x, p.y, p.z);
    this.col.push(c[0] * ao, c[1] * ao, c[2] * ao);
    return this.pos.length / 3 - 1;
  }

  q(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }

  t(a, b, c) { this.idx.push(a, b, c); }

  /** Run `fn` with the model transform `matrix` applied to every vertex it emits. */
  use(matrix, fn) {
    const saved = this.tf;
    this.tf = saved ? saved.clone().multiply(matrix) : matrix;
    fn();
    this.tf = saved;
  }

  /**
   * Run `fn`, then make the triangles it emitted face outward. For a closed surface the
   * area-weighted sum of n . (centre of face - c) is 3V, positive when outward, for convex and
   * concave solids alike, so one test per solid is enough.
   */
  solid(fn) {
    const start = this.idx.length;
    fn();
    const end = this.idx.length;
    let cx = 0; let cy = 0; let cz = 0; let n = 0;
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
      const a = this.idx[i] * 3; const b = this.idx[i + 1] * 3; const c = this.idx[i + 2] * 3;
      const ux = this.pos[b] - this.pos[a]; const uy = this.pos[b + 1] - this.pos[a + 1]; const uz = this.pos[b + 2] - this.pos[a + 2];
      const vx = this.pos[c] - this.pos[a]; const vy = this.pos[c + 1] - this.pos[a + 1]; const vz = this.pos[c + 2] - this.pos[a + 2];
      const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
      const mx = (this.pos[a] + this.pos[b] + this.pos[c]) / 3 - cx;
      const my = (this.pos[a + 1] + this.pos[b + 1] + this.pos[c + 1]) / 3 - cy;
      const mz = (this.pos[a + 2] + this.pos[b + 2] + this.pos[c + 2]) / 3 - cz;
      score += nx * mx + ny * my + nz * mz;
    }
    if (score < 0) {
      for (let i = start; i < end; i += 3) {
        const tmp = this.idx[i + 1]; this.idx[i + 1] = this.idx[i + 2]; this.idx[i + 2] = tmp;
      }
    }
  }

  geometry() {
    if (!this.idx.length) return null;
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

const mRotX = (a) => new THREE.Matrix4().makeRotationX(a);
const mRotY = (a) => new THREE.Matrix4().makeRotationY(a);
const mRotZ = (a) => new THREE.Matrix4().makeRotationZ(a);
const mMove = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);

/* ------------------------------------------------------------------ */
/* Primitives                                                           */
/* ------------------------------------------------------------------ */

/**
 * Axis aligned box. Options: c colour, k occlusion multiplier, skip a list of faces to leave
 * out ('+x' '-x' '+y' '-y' '+z' '-z'; the ones nobody can see).
 */
function box(m, x0, y0, z0, x1, y1, z1, o = {}) {
  const c = o.c ?? WHITE; const k = o.k ?? 1;
  const skip = o.skip ?? [];
  const faces = {
    '+x': [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
    '-x': [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
    '+y': [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
    '-y': [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
    '+z': [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
    '-z': [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
  };
  for (const [name, quad] of Object.entries(faces)) {
    if (skip.includes(name)) continue;
    const kk = name === '-y' ? k * 0.7 : k;
    m.q(...quad.map((p) => m.v(p[0], p[1], p[2], c, kk)));
  }
}

const boxC = (m, cx, cy, cz, w, h, d, o) => box(m, cx - w / 2, cy - h / 2, cz - d / 2, cx + w / 2, cy + h / 2, cz + d / 2, o);

/** A box between two parallel rotations is awkward; a tilted box is the model-space transform. */
function tilt(m, matrix, fn) { m.use(matrix, fn); }

/** Cylinder or frustum along `axis` ('y' default, 'x', 'z') centred on (cx, cy, cz), capped. */
function cyl(m, cx, cy, cz, rTop, rBot, h, segs, o = {}) {
  const c = o.c ?? WHITE; const k = o.k ?? 1; const axis = o.axis ?? 'y';
  const at = (u, v, w) => {
    if (axis === 'z') return [cx + u, cy + w, cz + v];
    if (axis === 'x') return [cx + v, cy + u, cz + w];
    return [cx + u, cy + v, cz + w];
  };
  m.solid(() => {
    const top = []; const bot = [];
    for (let i = 0; i < segs; i += 1) {
      const a = (i / segs) * TAU; const s = Math.sin(a); const co = Math.cos(a);
      const pb = at(co * rBot, -h / 2, s * rBot); const pt = at(co * rTop, h / 2, s * rTop);
      bot.push(m.v(pb[0], pb[1], pb[2], c, k)); top.push(m.v(pt[0], pt[1], pt[2], c, k));
    }
    for (let i = 0; i < segs; i += 1) { const j = (i + 1) % segs; m.q(bot[i], bot[j], top[j], top[i]); }
    for (const [ring, vy, rr, on] of [[top, h / 2, rTop, o.capTop !== false], [bot, -h / 2, rBot, o.capBottom !== false]]) {
      if (!on || rr <= 1e-5) continue;
      const mid = at(0, vy, 0);
      const cm = m.v(mid[0], mid[1], mid[2], c, k);
      const rim = [];
      for (let i = 0; i < segs; i += 1) {
        const a = (i / segs) * TAU; const p = at(Math.cos(a) * rr, vy, Math.sin(a) * rr);
        rim.push(m.v(p[0], p[1], p[2], c, k));
      }
      for (let i = 0; i < segs; i += 1) m.t(cm, rim[i], rim[(i + 1) % segs]);
    }
  });
}

/** A convex or star-shaped polygon (x, y) extruded between z0 and z1. */
function prismZ(m, pts, z0, z1, o = {}) {
  const c = o.c ?? WHITE; const k = o.k ?? 1;
  m.solid(() => {
    const n = pts.length;
    for (let i = 0; i < n; i += 1) {
      const a = pts[i]; const b = pts[(i + 1) % n];
      m.q(m.v(a[0], a[1], z0, c, k), m.v(b[0], b[1], z0, c, k), m.v(b[0], b[1], z1, c, k), m.v(a[0], a[1], z1, c, k));
    }
    let gx = 0; let gy = 0;
    for (const p of pts) { gx += p[0]; gy += p[1]; }
    gx /= n; gy /= n;
    const caps = o.caps ?? 'both';
    for (const z of [z0, z1]) {
      if (caps === 'none' || (caps === 'z1' && z !== z1) || (caps === 'z0' && z !== z0)) continue;
      const cm = m.v(gx, gy, z, c, k);
      const ring = pts.map((p) => m.v(p[0], p[1], z, c, k));
      for (let i = 0; i < n; i += 1) {
        if (z === z1) m.t(cm, ring[i], ring[(i + 1) % n]); else m.t(cm, ring[(i + 1) % n], ring[i]);
      }
    }
  });
}

/**
 * Loft a closed cross-section (z, y) along x. `profile` points are [z, y, smooth]; a smooth point
 * shares its vertex between the two edges that meet there, a sharp one keeps a crease. Each
 * segment between two stations gets its own rings, so the long faces stay flat. A station is
 * [x, scaleZ, scaleY, dy]; scaling is about (z = 0, y = pivot).
 */
function loftX(m, profile, stations, o = {}) {
  const c = o.c ?? WHITE; const k = o.k ?? 1; const pivot = o.pivot ?? 0;
  const n = profile.length;
  const ringPts = (st) => profile.map(([z, y]) => [st[0], pivot + (y - pivot) * (st[2] ?? 1) + (st[3] ?? 0), z * (st[1] ?? 1)]);
  m.solid(() => {
    for (let s = 0; s < stations.length - 1; s += 1) {
      const A = ringPts(stations[s]); const B = ringPts(stations[s + 1]);
      const mk = (pts) => {
        const prev = []; const next = [];
        for (let i = 0; i < n; i += 1) {
          const p = pts[i];
          const id = m.v(p[0], p[1], p[2], c, k);
          prev[i] = id;
          next[i] = profile[i][2] ? id : m.v(p[0], p[1], p[2], c, k);
        }
        return { prev, next };
      };
      const ra = mk(A); const rb = mk(B);
      for (let i = 0; i < n; i += 1) {
        const j = (i + 1) % n;
        m.q(ra.next[i], ra.prev[j], rb.prev[j], rb.next[i]);
      }
    }
    for (const [st, flip] of [[stations[0], true], [stations[stations.length - 1], false]]) {
      const pts = ringPts(st);
      let gy = 0; let gz = 0;
      for (const p of pts) { gy += p[1]; gz += p[2]; }
      gy /= n; gz /= n;
      const cm = m.v(st[0], gy, gz, c, k);
      const ring = pts.map((p) => m.v(p[0], p[1], p[2], c, k));
      for (let i = 0; i < n; i += 1) {
        if (flip) m.t(cm, ring[(i + 1) % n], ring[i]); else m.t(cm, ring[i], ring[(i + 1) % n]);
      }
    }
  });
}

/** Rounded rectangle cross-section (z, y), corner radius r, `arc` points per corner. */
function roundRect(zHalf, y0, y1, r, arc = 2, smooth = true) {
  const pts = [];
  const corner = (cz, cy, a0) => {
    for (let i = 0; i <= arc; i += 1) {
      const a = a0 + (i / arc) * (Math.PI / 2);
      pts.push([cz + Math.cos(a) * r, cy + Math.sin(a) * r, smooth && i > 0 && i < arc]);
    }
  };
  corner(zHalf - r, y1 - r, 0);
  corner(-(zHalf - r), y1 - r, Math.PI / 2);
  corner(-(zHalf - r), y0 + r, Math.PI);
  corner(zHalf - r, y0 + r, Math.PI * 1.5);
  return pts.reverse();
}

/**
 * Surface of revolution about the vertical axis through (cx, cz). `poly` is a CLOSED loop of
 * [r, y]; `smooth` shares the ring vertices between consecutive edges (domes), otherwise every
 * edge keeps its crease (stepped basins).
 */
function lathe(m, cx, cy, cz, poly, segs, o = {}) {
  const c = o.c ?? WHITE; const k = o.k ?? 1;
  const n = poly.length;
  let area = 0;
  for (let i = 0; i < n; i += 1) { const p = poly[i]; const q = poly[(i + 1) % n]; area += p[0] * q[1] - q[0] * p[1]; }
  const sign = area >= 0 ? 1 : -1;
  const ring = (r, y) => {
    const ids = [];
    for (let i = 0; i < segs; i += 1) {
      const a = (i / segs) * TAU;
      ids.push(m.v(cx + Math.cos(a) * r, cy + y, cz + Math.sin(a) * r, c, k));
    }
    return ids;
  };
  const shared = o.smooth ? poly.map(([r, y]) => (r < 1e-4 ? null : ring(r, y))) : null;
  const apex = poly.map(([r, y]) => (r < 1e-4 ? m.v(cx, cy + y, cz, c, k) : null));
  const da = TAU / segs;
  for (let e = 0; e < n; e += 1) {
    if (o.skip?.includes(e)) continue;
    const f = e; const g = (e + 1) % n;
    const [rA, yA] = poly[f]; const [rB, yB] = poly[g];
    if (rA < 1e-4 && rB < 1e-4) continue;
    const A = rA < 1e-4 ? null : (shared ? shared[f] : ring(rA, yA));
    const B = rB < 1e-4 ? null : (shared ? shared[g] : ring(rB, yB));
    // winding of the first triangle against the edge's outward normal (dy, -dr) in the (r, y) plane
    const P = (r, y, a) => [r * Math.cos(a), y, r * Math.sin(a)];
    const t0 = !A ? [P(0, yA, 0), P(rB, yB, da), P(rB, yB, 0)]
      : (!B ? [P(rA, yA, 0), P(rA, yA, da), P(0, yB, 0)] : [P(rA, yA, 0), P(rA, yA, da), P(rB, yB, da)]);
    const u = [t0[1][0] - t0[0][0], t0[1][1] - t0[0][1], t0[1][2] - t0[0][2]];
    const w = [t0[2][0] - t0[0][0], t0[2][1] - t0[0][1], t0[2][2] - t0[0][2]];
    const nrm = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const dr = rB - rA; const dy = yB - yA; const am = da / 2;
    const want = [sign * dy * Math.cos(am), -sign * dr, sign * dy * Math.sin(am)];
    const flip = nrm[0] * want[0] + nrm[1] * want[1] + nrm[2] * want[2] < 0;
    for (let i = 0; i < segs; i += 1) {
      const j = (i + 1) % segs;
      if (!A) { if (flip) m.t(apex[f], B[i], B[j]); else m.t(apex[f], B[j], B[i]); }
      else if (!B) { if (flip) m.t(A[j], A[i], apex[g]); else m.t(A[i], A[j], apex[g]); }
      else if (flip) m.q(A[i], B[i], B[j], A[j]);
      else m.q(A[i], A[j], B[j], B[i]);
    }
  }
}

/** A lumpy shrub: a deduplicated icosphere, jittered by position so shared corners stay shared. */
function blob(m, cx, cy, cz, rx, ry, rz, seed, o = {}) {
  const c = o.c ?? WHITE; const k = o.k ?? 1; const detail = o.detail ?? 1; const jit = o.jit ?? 0.2;
  const ico = new THREE.IcosahedronGeometry(1, detail);
  const pa = ico.getAttribute('position');
  const keyOf = (x, y, z) => `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
  const map = new Map();
  const ids = [];
  m.solid(() => {
    for (let i = 0; i < pa.count; i += 1) {
      const x = pa.getX(i); const y = pa.getY(i); const z = pa.getZ(i);
      const key = keyOf(x, y, z);
      let id = map.get(key);
      if (id === undefined) {
        const h = 1 + (hash(Math.round((x + 2) * 977 + (y + 2) * 331), seed) - 0.5) * jit * 2;
        const yy = y < -0.2 ? -0.2 : y; // flat-ish underside sits in the soil
        id = m.v(cx + x * rx * h, cy + yy * ry * h, cz + z * rz * h, c, k);
        map.set(key, id);
      }
      ids.push(id);
    }
    for (let i = 0; i < ids.length; i += 3) m.t(ids[i], ids[i + 1], ids[i + 2]);
  });
  ico.dispose();
}

/** Chamfered-top box (a box with the two long top edges cut by `b`), long axis x. */
function bevelBoxX(m, x0, x1, z0, z1, y0, y1, b, o = {}) {
  const zc = (z0 + z1) / 2; const hz = (z1 - z0) / 2;
  const prof = [[-hz, y0, false], [hz, y0, false], [hz, y1 - b, false], [hz - b, y1, false], [-hz + b, y1, false], [-hz, y1 - b, false]]
    .map(([z, y, s]) => [z + zc, y, s]);
  loftX(m, prof, [[x0], [x1]], o);
}

/** A flat disc facing +z (facing > 0) or -z, as a fan. */
function discZ(m, cx, cy, z, r, segs, facing, o = {}) {
  const c = o.c ?? WHITE; const k = o.k ?? 1;
  const cm = m.v(cx, cy, z, c, k);
  const ring = [];
  for (let i = 0; i < segs; i += 1) {
    const a = (i / segs) * TAU;
    ring.push(m.v(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z, c, k));
  }
  for (let i = 0; i < segs; i += 1) {
    if (facing > 0) m.t(cm, ring[i], ring[(i + 1) % segs]); else m.t(cm, ring[(i + 1) % segs], ring[i]);
  }
}

/** Wheel: a tyre capped on the outside only, a hub disc and (optionally) a cap; axis z. */
function wheel(parts, x, y, side, r, width, zOuter, segs = 8, withCap = true) {
  const zc = side * (zOuter - width / 2);
  // a low-poly tyre whose lowest point is a flat edge is widened so that the edge, not the circle, meets the ground
  const rr = segs % 4 === 0 ? r : r / Math.cos(Math.PI / segs);
  cyl(parts.trim, x, y, zc, rr, rr, width, segs, { axis: 'z', c: lin('#17181a'), capTop: side > 0, capBottom: side < 0 });
  discZ(parts.steel, x, y, side * (zOuter + 0.012), r * 0.52, Math.max(6, segs - 2), side);
  if (withCap) discZ(parts.steel, x, y, side * (zOuter + 0.03), r * 0.2, 5, side, { k: 0.7 });
}

/** Wheel arch: a D-shaped dark plate behind the tyre, closed on its outer face only. */
function arch(m, x, yAxle, side, r, zIn, zOut, floor = 0.08, arcStep = 40) {
  const pts = [[x - r, floor], [x - r, yAxle]];
  for (let a = 150; a >= 30; a -= arcStep) pts.push([x + Math.cos((a * Math.PI) / 180) * r, yAxle + Math.sin((a * Math.PI) / 180) * r]);
  pts.push([x + r, yAxle], [x + r, floor]);
  prismZ(m, pts, side * zIn, side * zOut, { c: lin('#1b1c1f'), k: 0.9, caps: 'z1' });
}

function newParts() {
  return {
    body: new Mesher({ aoLow: 0.6, aoSpan: 1.1 }),
    glass: new Mesher({ aoLow: 1, aoSpan: 1 }),
    trim: new Mesher({ aoLow: 0.7, aoSpan: 1.0 }),
    steel: new Mesher({ aoLow: 0.8, aoSpan: 1.0 }),
  };
}
function finish(parts) {
  const out = {};
  for (const [name, mesher] of Object.entries(parts)) { const g = mesher.geometry(); if (g) out[name] = g; }
  return out;
}

/** A slab proud of a side wall at z = side * wall: x0..x1, y0..y1, `proud` metres thick. */
function panel(m, side, wall, x0, x1, y0, y1, proud, o = {}) {
  const za = side * (wall - 0.012); const zb = side * (wall + proud);
  // a thin plate is seen face on: only its outward face is built unless the caller keeps the rest
  const skip = proud <= 0.04 && !o.keep ? ['-x', '+x', '-y', '+y', '-z', '+z'].filter((f) => f !== (side > 0 ? '+z' : '-z')) : [side > 0 ? '-z' : '+z'];
  box(m, x0, y0, Math.min(za, zb), x1, y1, Math.max(za, zb), { ...o, skip: [...skip, ...(o.skip ?? [])] });
}

/* ------------------------------------------------------------------ */
/* Bus: 12 x 2.5 x 3.3 m, rounded roof, door recesses, arches            */
/* ------------------------------------------------------------------ */

/**
 * Interchange bus. +x is the front, the doors are on -z (the kerb side in a left-hand country).
 * Options: paint, accent (hex).
 */
export function buildBus(o = {}) {
  const P = newParts();
  const paint = lin(o.paint ?? VEHICLE_PAINT.white);
  const accent = lin(o.accent ?? VEHICLE_PAINT.navy);
  const dark = lin('#202226'); const rubber = lin('#17181a');
  const hw = 1.25;
  const body = P.body; const glass = P.glass; const trim = P.trim; const steel = P.steel;

  // shell: sides, rounded shoulders and a crowned roof, bevelled nose and tail
  const prof = [
    [-1.19, 0.40, false], [-hw, 0.52, false], [-hw, 2.56, false], [-1.185, 2.82, true], [-1.0, 3.0, true],
    [-0.74, 3.07, true], [0, 3.1, true], [0.74, 3.07, true], [1.0, 3.0, true], [1.185, 2.82, true],
    [hw, 2.56, false], [hw, 0.52, false], [1.19, 0.40, false],
  ];
  loftX(body, prof, [[-6.0, 0.95, 0.93, 0.05], [-5.7, 1, 1, 0], [5.55, 1, 1, 0], [6.0, 0.95, 0.9, 0.04]], { c: paint, pivot: 0.4 });
  // lower skirt in the accent colour, a window band and pillars on both sides
  for (const s of [-1, 1]) {
    panel(body, s, hw, -5.85, 5.7, 0.52, 0.98, 0.014, { c: accent, k: 1 });
    panel(trim, s, hw, -5.55, 5.95, 1.2, 2.5, 0.01, { c: dark });
  }
  const winsFar = [[-5.4, -4.0], [-3.9, -2.5], [-2.4, -1.0], [-0.9, 0.5], [0.6, 2.0], [2.1, 3.5], [3.6, 5.0], [5.1, 5.9]];
  const winsKerb = [[-5.4, -4.0], [-3.9, -2.5], [-2.4, -0.8], [0.85, 2.2], [2.3, 3.75], [5.45, 5.9]];
  for (const [x0, x1] of winsFar) panel(glass, 1, hw, x0, x1, 1.3, 2.46, 0.03);
  for (const [x0, x1] of winsKerb) panel(glass, -1, hw, x0, x1, 1.3, 2.46, 0.03);
  // two doors on the kerb side, recessed look: dark frame, two glass leaves, a step strip
  for (const [x0, x1] of [[-0.7, 0.75], [3.9, 5.3]]) {
    panel(trim, -1, hw, x0, x1, 0.5, 2.52, 0.02, { c: rubber, k: 0.8 });
    const xm = (x0 + x1) / 2;
    panel(glass, -1, hw, x0 + 0.07, xm - 0.02, 0.98, 2.44, 0.04);
    panel(glass, -1, hw, xm + 0.02, x1 - 0.07, 0.98, 2.44, 0.04);
    panel(body, -1, hw, x0 + 0.07, x1 - 0.07, 0.58, 0.95, 0.03, { c: paint, k: 0.75 });
    panel(steel, -1, hw, x0 + 0.05, x1 - 0.05, 0.5, 0.55, 0.06);
  }
  // wheel arches, tyres and hubs
  for (const s of [-1, 1]) {
    for (const ax of [3.25, -3.1]) {
      arch(trim, ax, 0.52, s, 0.68, hw - 0.02, hw + 0.035);
      wheel(P, ax, 0.52, s, 0.52, 0.32, hw + 0.085, 10);
    }
  }
  // roof: a rounded air-conditioning pod and two hatches
  bevelBoxX(body, -3.4, 1.4, -0.72, 0.72, 3.06, 3.3, 0.09, { c: lin(VEHICLE_PAINT.silver), k: 1 });
  box(body, 2.2, 3.1, -0.45, 3.1, 3.2, 0.45, { c: lin(VEHICLE_PAINT.silver), k: 0.9 });
  // nose: windscreen, destination blind, bumper, lamps, grille, wipers
  tilt(glass, mMove(6.03, 1.775, 0).multiply(mRotZ(0.07)), () => box(glass, -0.015, -0.775, -1.12, 0.015, 0.775, 1.12));
  box(trim, 5.99, 0.98, -1.15, 6.02, 2.58, 1.15, { c: dark, k: 0.9, skip: ['-x'] });
  box(trim, 5.99, 2.6, -0.95, 6.06, 2.8, 0.95, { c: dark, k: 1 });
  box(body, 6.05, 2.66, -0.8, 6.07, 2.74, 0.8, { c: lin('#d9c27a'), k: 1.2 });
  box(trim, 5.9, 0.42, -1.2, 6.14, 0.78, 1.2, { c: rubber });
  for (const s of [-1, 1]) {
    box(body, 6.0, 0.86, s * 0.72 - 0.17, 6.06, 1.0, s * 0.72 + 0.17, { c: lin('#d8d4c4'), k: 1.1 });
    box(trim, 6.0, 0.8, s * 0.45 - 0.1, 6.02, 0.92, s * 0.45 + 0.1, { c: dark });
    // wiper and mirror on a steel arm
    box(steel, 6.04, 1.1, s * 0.5 - 0.01, 6.065, 1.9, s * 0.5 + 0.01, { k: 0.8 });
    box(steel, 5.7, 2.2, s * 1.25, 5.74, 2.26, s * 1.62, { k: 0.9 });
    box(trim, 5.66, 1.8, s * 1.58 - 0.06, 5.78, 2.5, s * 1.58 + 0.06, { c: dark });
  }
  // tail: lamps, rear window, bumper, engine louvres
  box(trim, -6.14, 0.42, -1.2, -5.9, 0.78, 1.2, { c: rubber });
  box(glass, -6.03, 1.7, -0.9, -5.98, 2.6, 0.9);
  box(trim, -6.05, 1.0, -0.9, -6.0, 1.5, 0.9, { c: dark, k: 0.8 });
  for (const s of [-1, 1]) box(body, -6.05, 0.86, s * 0.95 - 0.12, -6.0, 1.3, s * 0.95 + 0.12, { c: lin('#8a2f26'), k: 1 });
  return finish(P);
}

/* ------------------------------------------------------------------ */
/* Food van: step van 2.2 x 5 x 2.6 m with hatch, awning and counter     */
/* ------------------------------------------------------------------ */

function awning(P, paint, x0, x1, zWall, yTop, drop, reach, stripes) {
  // sloped canvas in alternating paint and cream stripes, a valance and two arms
  const cream = lin('#d8d2c2'); const paintC = lin(paint);
  const slope = Math.atan2(drop, reach);
  const len = Math.hypot(reach, drop);
  const w = (x1 - x0) / stripes;
  for (let i = 0; i < stripes; i += 1) {
    const col = i % 2 ? cream : paintC;
    const ends = [i === 0 ? null : '-x', i === stripes - 1 ? null : '+x'].filter(Boolean);
    tilt(P.body, mMove(0, yTop, zWall).multiply(mRotX(slope)), () => {
      box(P.body, x0 + i * w, -0.025, 0, x0 + (i + 1) * w, 0.015, len, { c: col, k: 1.05, skip: ['-z', '-y', ...ends] });
    });
    box(P.body, x0 + i * w, yTop - drop - 0.2, zWall + reach, x0 + (i + 1) * w, yTop - drop + 0.02, zWall + reach + 0.03,
      { c: i % 2 ? paintC : cream, k: 1, skip: ['-z', '-y', '+y', '-x', '+x'] });
  }
  for (const x of [x0 + 0.08, x1 - 0.08]) {
    tilt(P.steel, mMove(0, yTop - 0.06, zWall).multiply(mRotX(slope)), () => {
      box(P.steel, x - 0.02, -0.02, 0, x + 0.02, 0.02, len, { skip: ['-z', '+z', '-y', '-x', '+x'] });
    });
  }
}

/**
 * Food van (step van). +x front, hatch and awning on +z. Options: paint, accent (hex).
 */
export function buildFoodVan(o = {}) {
  const P = newParts();
  const paint = lin(o.paint ?? VEHICLE_PAINT.gold);
  const accent = lin(o.accent ?? VEHICLE_PAINT.charcoal);
  const dark = lin('#202226'); const rubber = lin('#17181a');
  const body = P.body; const glass = P.glass; const trim = P.trim; const steel = P.steel;
  // main slab and the two skin slabs, which give the roof edge a step and the side a reveal
  const prof = [[-2.5, 0.42], [2.5, 0.42], [2.5, 1.0], [2.4, 1.28], [2.0, 1.42], [1.55, 2.42], [1.42, 2.6], [-2.4, 2.6], [-2.5, 2.5]];
  const skin = [[-2.5, 0.42], [2.5, 0.42], [2.5, 1.0], [2.4, 1.28], [2.0, 1.42], [1.58, 2.5], [-2.4, 2.5], [-2.5, 2.42]];
  prismZ(body, prof, -1.0, 1.0, { c: paint });
  prismZ(body, skin, 1.0, 1.1, { c: paint, caps: 'z1' });
  prismZ(body, skin, -1.1, -1.0, { c: paint, caps: 'z0' });
  // lower accent band on both sides
  for (const s of [-1, 1]) panel(body, s, 1.1, -2.46, 2.0, 0.62, 0.9, 0.012, { c: accent });
  // windscreen and cab windows
  const th = Math.atan2(0.45, 1.0);
  tilt(glass, mMove(1.775 + 0.02 * Math.cos(th), 1.92 + 0.02 * Math.sin(th), 0).multiply(mRotZ(th)), () => {
    box(glass, -0.015, -0.56, -0.92, 0.015, 0.56, 0.92);
  });
  for (const s of [-1, 1]) panel(glass, s, 1.1, 1.0, 1.6, 1.5, 2.25, 0.03);
  // serving hatch on +z: dark reveal, glass shutter half raised, counter shelf, menu board
  panel(trim, 1, 1.1, -1.7, 0.5, 1.2, 2.25, 0.016, { c: rubber, k: 0.7 });
  panel(glass, 1, 1.1, -1.62, 0.42, 1.5, 2.17, 0.03);
  box(steel, -1.78, 1.18, 1.1, 0.58, 1.25, 1.5, { skip: ['-z'] });
  box(steel, -1.78, 1.1, 1.46, 0.58, 1.18, 1.5, { skip: ['-z', '+y', '-y'], k: 0.9 });
  panel(trim, 1, 1.1, -2.36, -1.8, 1.4, 2.12, 0.02, { c: dark });
  for (let i = 0; i < 3; i += 1) panel(body, 1, 1.1, -2.28, -1.9, 1.55 + i * 0.18, 1.6 + i * 0.18, 0.03, { c: lin('#d8d2c2') });
  awning(P, o.awning ?? o.paint ?? VEHICLE_PAINT.gold, -1.8, 0.62, 1.1, 2.4, 0.4, 0.62, 4);
  // wheel arches, tyres, hubs
  for (const s of [-1, 1]) {
    for (const ax of [1.65, -1.4]) {
      arch(trim, ax, 0.37, s, 0.5, 1.09, 1.135, 0.08, 60);
      wheel(P, ax, 0.37, s, 0.37, 0.26, 1.19, 6, false);
    }
  }
  // roof: extractor box and a flue
  bevelBoxX(body, -1.9, -0.5, -0.45, 0.45, 2.58, 2.86, 0.07, { c: lin(VEHICLE_PAINT.silver) });
  cyl(P.steel, -0.2, 2.78, -0.2, 0.08, 0.1, 0.36, 5, { capBottom: false });
  // front: bumper, lamps, grille; rear: bumper, lamps, door seam; mirrors
  box(trim, 2.46, 0.42, -1.06, 2.64, 0.7, 1.06, { c: rubber });
  for (const s of [-1, 1]) {
    box(body, 2.495, 0.76, s * 0.78 - 0.14, 2.55, 0.94, s * 0.78 + 0.14, { c: lin('#d8d4c4'), k: 1.1 });
    box(body, -2.54, 0.8, s * 0.92 - 0.1, -2.5, 1.2, s * 0.92 + 0.1, { c: lin('#8a2f26') });
    box(trim, 1.86, 1.55, s * 1.31 - 0.05, 1.98, 2.15, s * 1.31 + 0.05, { c: dark });
  }
  box(trim, -2.58, 0.42, -1.06, -2.44, 0.66, 1.06, { c: rubber });
  return finish(P);
}

/**
 * Food truck on a cab-over light truck chassis: a separate cab and a box body on a frame.
 * +x front, hatch and awning on +z. Options: paint, accent, awning (hex).
 */
export function buildBoxTruck(o = {}) {
  const P = newParts();
  const paint = lin(o.paint ?? VEHICLE_PAINT.maroon);
  const accent = lin(o.accent ?? VEHICLE_PAINT.charcoal);
  const cabPaint = lin(o.cab ?? VEHICLE_PAINT.white);
  const dark = lin('#202226'); const rubber = lin('#17181a');
  const body = P.body; const glass = P.glass; const trim = P.trim; const steel = P.steel;
  // chassis rails and a deck under the box
  box(trim, -2.85, 0.5, -0.72, 2.75, 0.74, -0.52, { c: rubber, k: 0.8 });
  box(trim, -2.85, 0.5, 0.52, 2.75, 0.74, 0.72, { c: rubber, k: 0.8 });
  // box body: rounded edges, roof overhang
  loftX(body, roundRect(1.1, 0.74, 3.05, 0.14, 2), [[-2.85], [0.95]], { c: paint });
  box(body, -2.9, 3.0, -1.14, 1.0, 3.08, 1.14, { c: lin(VEHICLE_PAINT.silver), k: 1.05 });
  for (const s of [-1, 1]) panel(body, s, 1.1, -2.8, 0.9, 0.9, 1.15, 0.012, { c: accent });
  // cab: sloped windscreen, side glass, lamps, bumper
  const cab = [[1.1, 0.78], [2.7, 0.78], [2.7, 1.45], [2.6, 1.7], [2.42, 2.34], [1.1, 2.4]];
  prismZ(body, cab, -0.97, 0.97, { c: cabPaint });
  const th = Math.atan2(0.18, 0.64);
  tilt(glass, mMove(2.52, 2.0, 0).multiply(mRotZ(th)), () => box(glass, -0.015, -0.34, -0.82, 0.015, 0.34, 0.82));
  for (const s of [-1, 1]) {
    panel(glass, s, 0.97, 1.5, 2.3, 1.55, 2.25, 0.03);
    box(body, 2.695, 0.9, s * 0.72 - 0.14, 2.75, 1.08, s * 0.72 + 0.14, { c: lin('#d8d4c4'), k: 1.1 });
    box(trim, 2.31, 1.6, s * 1.19 - 0.05, 2.43, 2.2, s * 1.19 + 0.05, { c: dark });
  }
  box(trim, 2.66, 0.5, -1.0, 2.84, 0.78, 1.0, { c: rubber });
  // hatch, counter, awning, menu board on the box body
  panel(trim, 1, 1.1, -2.2, -0.1, 1.55, 2.5, 0.016, { c: rubber, k: 0.7 });
  panel(glass, 1, 1.1, -2.12, -0.18, 1.8, 2.42, 0.03);
  box(steel, -2.28, 1.48, 1.1, 0.02, 1.55, 1.46, { skip: ['-z'] });
  panel(trim, 1, 1.1, 0.25, 0.8, 1.7, 2.4, 0.02, { c: dark });
  for (let i = 0; i < 3; i += 1) panel(body, 1, 1.1, 0.33, 0.7, 1.85 + i * 0.18, 1.9 + i * 0.18, 0.03, { c: lin('#d8d2c2') });
  awning(P, o.awning ?? o.paint ?? VEHICLE_PAINT.maroon, -2.3, 0.1, 1.1, 2.75, 0.42, 0.64, 4);
  // rear: step, lamps, roller-door seam; roof vent
  box(trim, -2.95, 0.5, -1.0, -2.8, 0.78, 1.0, { c: rubber });
  for (const s of [-1, 1]) box(body, -2.915, 0.85, s * 0.92 - 0.1, -2.88, 1.25, s * 0.92 + 0.1, { c: lin('#8a2f26') });
  bevelBoxX(body, -1.7, -0.5, -0.4, 0.4, 3.06, 3.3, 0.07, { c: lin(VEHICLE_PAINT.silver) });
  // wheels: single front, dual-look rear (a wider tyre), arches
  for (const s of [-1, 1]) {
    arch(trim, 1.75, 0.42, s, 0.56, 0.95, 0.99, 0.1, 60);
    wheel(P, 1.75, 0.42, s, 0.42, 0.24, 1.03, 6, false);
    arch(trim, -1.6, 0.42, s, 0.56, 1.1, 1.145, 0.1, 60);
    wheel(P, -1.6, 0.42, s, 0.42, 0.34, 1.19, 6, false);
  }
  return finish(P);
}

/* ------------------------------------------------------------------ */
/* Bus shelter: canopy on four posts, 0.3 m fascia, bench, glass back    */
/* ------------------------------------------------------------------ */

/**
 * Interchange shelter, 5.6 x 2.6 x 2.8 m on a kerbed slab. The open side faces +z. Options: paint.
 */
export function buildShelter(o = {}) {
  const P = newParts();
  const paint = lin(o.paint ?? VEHICLE_PAINT.navy);
  const concrete = lin(TASTE.built.concrete, 1);
  const body = P.body; const glass = P.glass; const trim = P.trim; const steel = P.steel;
  const hx = 2.8; const hz = 1.3;
  // slab with a raised edge
  box(body, -hx - 0.2, 0, -hz - 0.2, hx + 0.2, 0.14, hz + 0.2, { c: concrete, k: 1 });
  box(body, -hx - 0.1, 0.14, -hz - 0.1, hx + 0.1, 0.18, hz + 0.1, { c: concrete, k: 1.05 });
  // four posts, plus two centre posts behind the glass
  for (const x of [-hx + 0.1, hx - 0.1]) {
    for (const z of [-hz + 0.1, hz - 0.1]) box(steel, x - 0.06, 0.18, z - 0.06, x + 0.06, 2.55, z + 0.06, {});
  }
  // canopy: a shallow shed roof falling to the back, with a 0.3 m fascia round all four edges
  tilt(body, mMove(0, 2.58, 0).multiply(mRotX(-0.045)), () => {
    box(body, -hx - 0.18, 0, -hz - 0.28, hx + 0.18, 0.07, hz + 0.28, { c: lin(VEHICLE_PAINT.silver), k: 1.1 });
    box(body, -hx - 0.2, -0.22, hz + 0.26, hx + 0.2, 0.08, hz + 0.32, { c: paint, k: 1 });
    box(body, -hx - 0.2, -0.22, -hz - 0.32, hx + 0.2, 0.08, -hz - 0.26, { c: paint, k: 0.9 });
    for (const s of [-1, 1]) box(body, s * (hx + 0.2) - 0.03, -0.22, -hz - 0.3, s * (hx + 0.2) + 0.03, 0.08, hz + 0.3, { c: paint, k: 0.95 });
    box(trim, -hx - 0.1, -0.025, -hz - 0.2, hx + 0.1, 0.0, hz + 0.2, { c: lin('#5a5d62'), k: 0.7, skip: ['+y'] });
  });
  // back and end glazing in a steel frame
  box(steel, -hx + 0.1, 0.42, -hz + 0.07, hx - 0.1, 0.5, -hz + 0.15, {});
  box(steel, -hx + 0.1, 2.12, -hz + 0.07, hx - 0.1, 2.2, -hz + 0.15, {});
  for (let i = 0; i < 5; i += 1) {
    const x = -hx + 0.16 + (i * (2 * hx - 0.32)) / 4;
    box(steel, x - 0.04, 0.5, -hz + 0.07, x + 0.04, 2.12, -hz + 0.15, {});
    if (i < 4) {
      const x1 = -hx + 0.16 + ((i + 1) * (2 * hx - 0.32)) / 4;
      box(glass, x + 0.04, 0.5, -hz + 0.09, x1 - 0.04, 2.12, -hz + 0.12, { skip: ['-y', '+y'] });
    }
  }
  box(glass, -hx + 0.12, 0.5, -hz + 0.16, -hx + 0.15, 2.12, hz - 0.14, { skip: ['-y', '+y'] });
  box(steel, -hx + 0.1, 0.42, -hz + 0.15, -hx + 0.18, 0.5, hz - 0.1, {});
  // lightbox at the open end, timetable board on the back
  box(trim, hx - 0.16, 0.5, -hz + 0.2, hx - 0.06, 2.2, hz - 0.16, { c: lin('#202226') });
  box(body, hx - 0.06, 0.62, -hz + 0.3, hx - 0.03, 2.08, hz - 0.26, { c: lin('#d8d4c4'), k: 1.15 });
  // bench: timber slats on two steel stands, and a perch rail
  for (const x of [-1.5, 0, 1.5]) box(steel, x - 0.03, 0.18, -hz + 0.3, x + 0.03, 0.46, -hz + 0.7, {});
  const timber = lin(TASTE.built.timber, 1);
  box(body, -2.0, 0.46, -hz + 0.28, 2.0, 0.5, -hz + 0.5, { c: timber });
  box(body, -2.0, 0.46, -hz + 0.52, 2.0, 0.5, -hz + 0.72, { c: timber });
  box(steel, -1.9, 0.9, -hz + 0.2, 1.9, 0.94, -hz + 0.28, {});
  // a bin and the stop pole at the open end
  cyl(P.steel, -hx + 0.55, 0.45, hz - 0.35, 0.2, 0.2, 0.9, 8, { k: 0.8 });
  cyl(P.steel, hx + 0.55, 1.35, hz - 0.1, 0.04, 0.04, 2.7, 6, {});
  box(trim, hx + 0.4, 2.3, hz - 0.12, hx + 0.7, 2.7, hz - 0.08, { c: paint });
  return finish(P);
}

/* ------------------------------------------------------------------ */
/* Fountain                                                             */
/* ------------------------------------------------------------------ */

/**
 * Terrace fountain: a stepped apron, a basin with a 0.5 m lip, a plinth, two bowls and a jet.
 * Parts: stone (basin, apron, plinth, bowls), cap (coping), water (surface and jet).
 */
export function buildFountain() {
  const stone = new Mesher({ aoLow: 0.62, aoSpan: 1.2 });
  const cap = new Mesher({ aoLow: 0.8, aoSpan: 1.2 });
  const water = new Mesher({ aoLow: 0.9, aoSpan: 2 });
  // apron: two shallow steps around the basin (the underside is never seen)
  lathe(stone, 0, 0, 0, [[0, 0], [3.65, 0], [3.65, 0.07], [3.4, 0.07], [3.4, 0.14], [0, 0.14]], 20, { skip: [0] });
  // basin wall with a battered inside, floor at 0.26, lip top at 0.5 (the coping is a separate cap)
  lathe(stone, 0, 0, 0, [[0, 0.14], [3.1, 0.14], [3.1, 0.43], [2.6, 0.43], [2.5, 0.26], [0, 0.26]], 20, { skip: [0, 2] });
  lathe(cap, 0, 0, 0, [[2.55, 0.43], [3.2, 0.43], [3.2, 0.5], [2.55, 0.5]], 20, { skip: [0] });
  // plinth, pedestal, lower bowl, stem, upper bowl
  lathe(stone, 0, 0, 0, [[0, 0.26], [1.15, 0.26], [1.15, 0.5], [0.95, 0.5], [0.95, 0.62], [0.55, 0.62], [0.5, 1.55], [0, 1.55]], 14, { skip: [0] });
  lathe(stone, 0, 0, 0, [[0, 1.5], [0.95, 1.62], [1.5, 1.95], [1.5, 2.02], [1.38, 2.02], [0.7, 1.82], [0.3, 1.78], [0.28, 2.2], [0, 2.2]], 16);
  lathe(stone, 0, 0, 0, [[0, 2.15], [0.62, 2.28], [0.95, 2.52], [0.95, 2.58], [0.85, 2.58], [0.4, 2.42], [0, 2.4]], 14);
  // water surface, the pool in the lower bowl, and the jet: a column that flares into a crown
  lathe(water, 0, 0, 0, [[0, 0.36], [2.5, 0.36], [2.5, 0.37], [0, 0.37]], 20, { skip: [0, 1] });
  lathe(water, 0, 0, 0, [[0.7, 1.97], [1.4, 1.97], [1.4, 2.0], [0.7, 2.0]], 16, { skip: [0, 1, 3] });
  lathe(water, 0, 0, 0, [[0, 2.5], [0.2, 2.55], [0.14, 3.05], [0.34, 3.5], [0.2, 3.62], [0.04, 3.9], [0.02, 3.62], [0, 3.5]], 7, { smooth: true });
  return { stone: stone.geometry(), cap: cap.geometry(), water: water.geometry() };
}

/* ------------------------------------------------------------------ */
/* Roundabout island                                                    */
/* ------------------------------------------------------------------ */

/**
 * Gate roundabout, 17.6 m across. Parts: tarmac (carriageway disc with its edge), line (ring
 * marking), kerb (island kerb, a proper 0.2 m stand), soil, turf (the mound), plinth (stone),
 * leafA/leafB/leafC (shrub lobes).
 */
export function buildRoundabout() {
  const tarmac = new Mesher({ aoLow: 0.85, aoSpan: 1 });
  const line = new Mesher({ aoLow: 1, aoSpan: 1 });
  const kerb = new Mesher({ aoLow: 0.7, aoSpan: 0.5 });
  const turf = new Mesher({ aoLow: 0.78, aoSpan: 0.9 });
  const plinth = new Mesher({ aoLow: 0.62, aoSpan: 1.2 });
  const leaf = [new Mesher({ aoLow: 0.62, aoSpan: 0.9 }), new Mesher({ aoLow: 0.62, aoSpan: 0.9 }), new Mesher({ aoLow: 0.62, aoSpan: 0.9 })];
  // carriageway disc with a rolled edge, and a white ring line
  lathe(tarmac, 0, 0, 0, [[0, 0], [8.8, 0], [8.8, 0.06], [8.5, 0.09], [0, 0.09]], 28, { skip: [0] });
  lathe(line, 0, 0, 0, [[7.55, 0.09], [7.7, 0.09], [7.7, 0.1], [7.55, 0.1]], 28, { skip: [0, 1, 3] });
  // island: a kerb ring with a face and a top, then the mound
  lathe(kerb, 0, 0, 0, [[4.7, 0.09], [4.7, 0.3], [4.3, 0.32], [4.3, 0.09]], 28, { skip: [2, 3] });
  lathe(turf, 0, 0, 0, [[0, 0.82], [0.9, 0.78], [1.9, 0.66], [2.9, 0.5], [3.7, 0.4], [4.3, 0.3], [4.3, 0.2], [0, 0.2]], 28, { smooth: true, skip: [6] });
  // central plinth: stepped stone, a block and a cap
  lathe(plinth, 0, 0, 0, [[0, 0.8], [1.5, 0.76], [1.5, 0.92], [1.2, 0.92], [1.2, 1.1], [0.8, 1.1], [0.8, 2.3], [0.9, 2.3], [0.9, 2.42], [0, 2.42]], 10);
  // shrub lobes in three greens: a ring of six large ones, then smaller ones round them
  let seed = 1;
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * TAU + 0.2;
    const r = 2.6 + (hash(i, 31) - 0.5) * 0.3;
    blob(leaf[i % 3], Math.cos(a) * r, 0.5, Math.sin(a) * r, 0.78, 0.6, 0.78, seed += 1, { detail: 1, jit: 0.2 });
    blob(leaf[(i + 1) % 3], Math.cos(a + 0.5) * (r + 0.9), 0.36, Math.sin(a + 0.5) * (r + 0.9), 0.5, 0.36, 0.5, seed += 1, { detail: 0, jit: 0.25 });
    blob(leaf[(i + 2) % 3], Math.cos(a + 0.5) * 1.75, 0.78, Math.sin(a + 0.5) * 1.75, 0.4, 0.3, 0.4, seed += 1, { detail: 0, jit: 0.25 });
  }
  const g = (mesher) => mesher.geometry();
  return {
    tarmac: g(tarmac), line: g(line), kerb: g(kerb), turf: g(turf), plinth: g(plinth),
    leafA: g(leaf[0]), leafB: g(leaf[1]), leafC: g(leaf[2]),
  };
}

/* ------------------------------------------------------------------ */
/* Precinct planting: hedge run, planting bed                           */
/* ------------------------------------------------------------------ */

/** A clipped hedge run 2.6 x 0.9 x 0.85 m, centred, soft shoulders, 24 triangles. Plain position and normal. */
export function buildHedgeRun() {
  const m = new Mesher({ aoLow: 1, aoSpan: 1 });
  const prof = [[-0.425, -0.45, false], [0.425, -0.45, false], [0.445, 0.05, false], [0.31, 0.45, false], [-0.31, 0.45, false], [-0.445, 0.05, false]];
  loftX(m, prof, [[-1.3], [1.3]], {});
  return m.geometry();
}

/**
 * A raised planting bed 3.0 x 1.3 m on the ground: a stone kerb frame 0.28 m high, a mounded soil
 * top and a run of shrub lobes. Parts: kerb, soil, leafA, leafB. Origin at the foot of the kerb.
 */
export function buildPlantingBed() {
  const kerb = new Mesher({ aoLow: 0.7, aoSpan: 0.4 });
  const soil = new Mesher({ aoLow: 0.75, aoSpan: 0.5 });
  const leafA = new Mesher({ aoLow: 0.6, aoSpan: 0.8 });
  const leafB = new Mesher({ aoLow: 0.6, aoSpan: 0.8 });
  const t = 0.14; const hx = 1.5; const hz = 0.65; const h = 0.28;
  for (const s of [-1, 1]) {
    box(kerb, -hx, 0, s > 0 ? hz - t : -hz, hx, h, s > 0 ? hz : -hz + t, { skip: ['-y'] });
    box(kerb, s > 0 ? hx - t : -hx, 0, -hz + t, s > 0 ? hx : -hx + t, h, hz - t, { skip: ['-y', '+z', '-z'] });
  }
  loftX(soil, [[-0.52, 0.06, false], [0.52, 0.06, false], [0.42, 0.34, false], [-0.42, 0.34, false]], [[-1.36], [1.36]], {});
  const lobes = [
    [-1.0, 0.1, 0.5, 0.36, leafA], [-0.4, -0.12, 0.44, 0.34, leafB], [0.2, 0.1, 0.5, 0.4, leafA],
    [0.75, -0.08, 0.42, 0.32, leafB], [1.1, 0.12, 0.34, 0.3, leafA],
  ];
  lobes.forEach(([x, z, r, hgt, mesh], i) => blob(mesh, x, 0.36, z, r, hgt, r * 0.9, 90 + i, { detail: 0, jit: 0.22 }));
  const g = (mesher) => mesher.geometry();
  return { kerb: g(kerb), soil: g(soil), leafA: g(leafA), leafB: g(leafB) };
}
