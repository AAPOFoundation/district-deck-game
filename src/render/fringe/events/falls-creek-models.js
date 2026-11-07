// Falls Creek model builders (wave twelve). Pure geometry: every function returns merged
// BufferGeometry (position, normal, colour) built from named parts that meet, with baked
// vertex occlusion in the colour attribute (undersides and creases darker). Deterministic:
// index maths only, no Math.random. Metres throughout; an adult is 1.70 m.
//
// Colour attribute is a multiplier on the owning material (see `vc`), so the token
// colours in falls-creek.js stay in charge of hue and the geometry only carries value.

import * as THREE from 'three';

const fract = (v) => v - Math.floor(v);
const hash = (a, b = 0, c = 0) => fract(Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + 1.3) * 43758.5453123);
const shash = (a, b = 0, c = 0) => hash(a, b, c) * 2 - 1;
const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
const mix = (a, b, t) => a + (b - a) * t;
const vnoise = (x, y, z, sd = 0) => {
  const xi = Math.floor(x); const yi = Math.floor(y); const zi = Math.floor(z);
  const fx = x - xi; const fy = y - yi; const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx); const v = fy * fy * (3 - 2 * fy); const w = fz * fz * (3 - 2 * fz);
  let acc = 0;
  for (let dx = 0; dx < 2; dx += 1) for (let dy = 0; dy < 2; dy += 1) for (let dz = 0; dz < 2; dz += 1) {
    acc += hash(xi + dx + sd * 7, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  }
  return acc;
};
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / ((e1 - e0) || 1e-6), 0, 1); return t * t * (3 - 2 * t); };

/** A material clone that reads the colour attribute; cached so meshes share it. */
const VC = new WeakMap();
export function vc(mat) {
  let m = VC.get(mat);
  if (!m) {
    m = mat.clone();
    m.vertexColors = true;
    m.userData.vertexOcclusion = true;
    VC.set(mat, m);
  }
  return m;
}

/* ------------------------------------------------------------------ *
 * Triangle soup with flat normals and a per-vertex value.
 * ------------------------------------------------------------------ */
class Soup {
  constructor() { this.p = []; this.c = []; }

  tri(a, b, c, ka = 1, kb = ka, kc = ka) {
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.c.push(ka, ka, ka, kb, kb, kb, kc, kc, kc);
  }

  /** Convex solid: faces are index lists (3 or 4+), wound to face away from the centroid. */
  solid(v, faces, k = 1) {
    const cen = [0, 0, 0];
    for (const p of v) { cen[0] += p[0]; cen[1] += p[1]; cen[2] += p[2]; }
    cen[0] /= v.length; cen[1] /= v.length; cen[2] /= v.length;
    const kf = typeof k === 'function' ? k : (typeof k === 'number' ? () => k : (i) => k[i]);
    for (const f of faces) {
      const a = v[f[0]]; const b = v[f[1]]; const c = v[f[2]];
      const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
      const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const out = nx * (a[0] - cen[0]) + ny * (a[1] - cen[1]) + nz * (a[2] - cen[2]);
      const idx = out < 0 ? f.slice().reverse() : f;
      for (let i = 1; i < idx.length - 1; i += 1) {
        const i0 = idx[0]; const i1 = idx[i]; const i2 = idx[i + 1];
        this.tri(v[i0], v[i1], v[i2], kf(i0, v[i0]), kf(i1, v[i1]), kf(i2, v[i2]));
      }
    }
  }

  /** Oriented box: centre, full sizes, optional yaw/pitch/roll, value at the bottom and top. */
  box(cx, cy, cz, sx, sy, sz, o = {}) {
    const hx = sx / 2; const hy = sy / 2; const hz = sz / 2;
    const e = new THREE.Euler(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, 'YXZ');
    const m = new THREE.Matrix4().makeRotationFromEuler(e);
    const v = [];
    for (const x of [-hx, hx]) for (const y of [-hy, hy]) for (const z of [-hz, hz]) {
      const t = new THREE.Vector3(x, y, z).applyMatrix4(m);
      v.push([cx + t.x, cy + t.y, cz + t.z, y < 0 ? 0 : 1]);
    }
    const kb = o.kb ?? o.k ?? 1; const kt = o.kt ?? o.k ?? 1;
    // index = x*4 + y*2 + z
    this.solid(v, [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]],
      (i, p) => (p[3] ? kt : kb));
  }

  /** Square-section beam between two points. */
  beam(a, b, w, o = {}) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = d.length();
    if (len < 1e-5) return;
    d.divideScalar(len);
    const up = Math.abs(d.y) > 0.92 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(d, up).normalize().multiplyScalar(w / 2);
    const s = new THREE.Vector3().crossVectors(d, u).normalize().multiplyScalar((o.h ?? w) / 2);
    const w1 = o.w1 ?? 1; // taper of the b end
    const v = [];
    for (const end of [0, 1]) {
      const p = end ? b : a; const sc = end ? w1 : 1;
      for (const [su, ss] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        v.push([p[0] + (u.x * su + s.x * ss) * sc, p[1] + (u.y * su + s.y * ss) * sc, p[2] + (u.z * su + s.z * ss) * sc, end]);
      }
    }
    const ka = o.ka ?? o.k ?? 1; const kb = o.kb ?? o.k ?? 1;
    this.solid(v, [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]],
      (i, p) => (p[3] ? kb : ka));
  }

  /** n-sided tapered prism between two points (limbs, poles, wheels). */
  prism(a, b, r0, r1, n = 6, o = {}) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = d.length();
    if (len < 1e-5) return;
    d.divideScalar(len);
    const up = Math.abs(d.y) > 0.92 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(d, up).normalize();
    const s = new THREE.Vector3().crossVectors(d, u).normalize();
    const v = [];
    const ph = o.phase ?? 0;
    for (const end of [0, 1]) {
      const p = end ? b : a; const r = end ? r1 : r0;
      for (let i = 0; i < n; i += 1) {
        const t = ph + (i / n) * Math.PI * 2;
        v.push([p[0] + (u.x * Math.cos(t) + s.x * Math.sin(t)) * r, p[1] + (u.y * Math.cos(t) + s.y * Math.sin(t)) * r,
          p[2] + (u.z * Math.cos(t) + s.z * Math.sin(t)) * r, end]);
      }
    }
    const faces = [];
    for (let i = 0; i < n; i += 1) faces.push([i, (i + 1) % n, n + ((i + 1) % n), n + i]);
    if (!o.open) {
      faces.push(Array.from({ length: n }, (_, i) => i));
      faces.push(Array.from({ length: n }, (_, i) => n + i));
    }
    const ka = o.ka ?? o.k ?? 1; const kb = o.kb ?? o.k ?? 1;
    this.solid(v, faces, (i, p) => (p[3] ? kb : ka));
  }

  /** A triangle with full per-vertex colour (linear rgb arrays). */
  triRGB(a, b, c, ca, cb, cc) {
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.rgb ??= [];
    while (this.rgb.length < (this.p.length / 3 - 3) * 3) this.rgb.push(1, 1, 1);
    this.rgb.push(...ca, ...cb, ...cc);
    this.c.push(1, 1, 1, 1, 1, 1, 1, 1, 1);
  }

  /** Tapered prism whose colour is a tone times a value ramp. */
  prismRGB(a, b, r0, r1, n, tone, k0, k1, open) {
    const tmp = new Soup();
    tmp.prism(a, b, r0, r1, n, { ka: k0, kb: k1, open });
    for (let i = 0; i < tmp.p.length; i += 9) {
      const v = (j) => [tmp.p[i + j * 3], tmp.p[i + j * 3 + 1], tmp.p[i + j * 3 + 2]];
      const k = (j) => tmp.c[i + j * 3];
      const col = (j) => [tone.r * k(j), tone.g * k(j), tone.b * k(j)];
      this.triRGB(v(0), v(1), v(2), col(0), col(1), col(2));
    }
  }

  /** Geometry whose colour attribute is the per-vertex rgb gathered by triRGB. */
  geometryRGB() {
    const g = this.geometry();
    if (this.rgb) {
      while (this.rgb.length < this.p.length) this.rgb.push(1, 1, 1);
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.rgb), 3));
    }
    return g;
  }

  geometry() {
    const n = this.p.length / 3;
    const nor = new Float32Array(n * 3);
    const P = this.p;
    for (let i = 0; i < n; i += 3) {
      const ax = P[i * 3]; const ay = P[i * 3 + 1]; const az = P[i * 3 + 2];
      const bx = P[i * 3 + 3] - ax; const by = P[i * 3 + 4] - ay; const bz = P[i * 3 + 5] - az;
      const cx = P[i * 3 + 6] - ax; const cy = P[i * 3 + 7] - ay; const cz = P[i * 3 + 8] - az;
      let nx = by * cz - bz * cy; let ny = bz * cx - bx * cz; let nz = bx * cy - by * cx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      for (let k = 0; k < 3; k += 1) { nor[(i + k) * 3] = nx; nor[(i + k) * 3 + 1] = ny; nor[(i + k) * 3 + 2] = nz; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }

  get empty() { return this.p.length === 0; }
}

const tris = (g) => (g ? (g.index ? g.index.count : g.attributes.position.count) / 3 : 0);
export { tris as geometryTriangles };

/* ------------------------------------------------------------------ *
 * Rocks. Bedded blocks, a flat base, a half-flat top, anisotropic and
 * sheared per variant: not an icosahedron. Extents are +-1 in x and z and
 * y in [-1, 0.9], so the scale conventions of the old 20-triangle stone hold.
 * ------------------------------------------------------------------ */
function displaceBlock(p, seed) {
  const A = shash(seed, 1.1); const B = shash(seed, 2.3); const S = shash(seed, 3.7);
  let { x, y, z } = p;
  const l = Math.hypot(x, y, z) || 1;
  const k = 0.72;
  x = mix(x, (x / l) * 1.1, k); y = mix(y, (y / l) * 1.1, k); z = mix(z, (z / l) * 1.1, k);
  const q = shash(Math.round(p.x * 6) + seed * 13, Math.round(p.y * 6), Math.round(p.z * 6));
  const r = 1 + 0.24 * q + 0.12 * Math.sin(p.x * 2.6 + p.z * 1.9 + seed);
  x *= r * (1 + 0.22 * A); z *= r * (1 + 0.22 * B); y *= r;
  if (y > 0.28) y = 0.28 + (y - 0.28) * 0.35;
  if (y < -0.5) y = -0.5 + (y + 0.5) * 0.4;
  x += y * 0.22 * S; z += y * 0.12 * shash(seed, 9.1);
  // a bedding step: the upper third sits slightly proud on one side
  if (y > 0.05) { x += 0.08 * A; }
  p.set(x, y, z);
}

function rockGeometry(seed, kind) {
  let base;
  if (kind === 'pebble') base = new THREE.IcosahedronGeometry(1, 0);
  else base = new THREE.BoxGeometry(2, 2, 2, 2, 2, 2);
  const pos = base.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    if (kind === 'pebble') {
      const q = shash(Math.round(v.x * 5) + seed * 7, Math.round(v.y * 5), Math.round(v.z * 5));
      v.multiplyScalar(1 + 0.22 * q);
      v.y *= 0.62; v.x += v.y * 0.15 * shash(seed, 2); v.y = Math.max(v.y, -0.55);
    } else if (kind === 'slab') {
      displaceBlock(v, seed);
      v.y *= 0.45; v.x *= 1.25; v.z *= 0.9;
    } else displaceBlock(v, seed);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  // normalise: x,z to +-1, y to [-1, 0.9]
  base.computeBoundingBox();
  const bb = base.boundingBox;
  const sx = 1 / Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x));
  const sz = 1 / Math.max(Math.abs(bb.min.z), Math.abs(bb.max.z));
  const sy = (kind === 'slab' ? 0.55 : 1.9) / (bb.max.y - bb.min.y);
  const y0 = kind === 'slab' ? -0.35 : -1.0;
  for (let i = 0; i < pos.count; i += 1) {
    pos.setXYZ(i, pos.getX(i) * sx, (pos.getY(i) - bb.min.y) * sy + y0, pos.getZ(i) * sz);
  }
  base.deleteAttribute('uv');
  base.deleteAttribute('normal');
  const geo = base.index ? base : base;
  geo.computeVertexNormals();
  const nor = geo.getAttribute('normal');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    const k = (0.56 + 0.44 * smooth(-1.0, 0.35, y)) * (0.88 + 0.12 * Math.max(0, nor.getY(i)));
    col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  geo.userData.shared = true;
  return geo;
}

const ROCKS = { block: [], pebble: [], slab: [] };
export function rockBlock(i) {
  const k = ((i % 6) + 6) % 6;
  return (ROCKS.block[k] ??= rockGeometry(11 + k * 5, 'block'));
}
export function rockPebble(i) {
  const k = ((i % 4) + 4) % 4;
  return (ROCKS.pebble[k] ??= rockGeometry(31 + k * 3, 'pebble'));
}
export function rockSlab(i) {
  const k = ((i % 3) + 3) % 3;
  return (ROCKS.slab[k] ??= rockGeometry(51 + k * 7, 'slab'));
}

/** A stack of bedded blocks stepping back and up: one weathered outcrop 5 to 9 m across. */
export function buildOutcrop(seed, w = 7, h = 4.6, d = 5) {
  const S = new Soup();
  const layers = 3 + (seed % 2);
  let y = -0.4;
  for (let k = 0; k < layers; k += 1) {
    const t = k / layers;
    const lh = (h / layers) * (0.85 + 0.3 * hash(seed, k, 1));
    const lw = w * (1 - t * 0.38) * (0.9 + 0.2 * hash(seed, k, 2));
    const ld = d * (1 - t * 0.34) * (0.9 + 0.2 * hash(seed, k, 3));
    const ox = shash(seed, k, 4) * w * 0.07 + t * w * 0.06;
    const oz = shash(seed, k, 5) * d * 0.07 - t * d * 0.10;
    const rock = rockSlab(seed + k);
    const pos = rock.getAttribute('position'); const col = rock.getAttribute('color'); const idx = rock.index;
    const place = (i) => {
      const x = pos.getX(i) * lw / 2 + ox;
      const yy = y + (pos.getY(i) + 0.35) * (lh / 0.55) * 1.0;
      const z = pos.getZ(i) * ld / 2 + oz;
      return [x, yy, z];
    };
    const rot = shash(seed, k, 6) * 0.12;
    const cr = Math.cos(rot); const sr = Math.sin(rot);
    const at = (i) => { const p = place(i); return [p[0] * cr + p[2] * sr, p[1], -p[0] * sr + p[2] * cr]; };
    const n = idx ? idx.count : pos.count;
    for (let f = 0; f < n; f += 3) {
      const i0 = idx ? idx.getX(f) : f; const i1 = idx ? idx.getX(f + 1) : f + 1; const i2 = idx ? idx.getX(f + 2) : f + 2;
      S.tri(at(i0), at(i1), at(i2), col.getX(i0) * (0.78 + 0.22 * t), col.getX(i1) * (0.78 + 0.22 * t), col.getX(i2) * (0.78 + 0.22 * t));
    }
    y += lh * 0.82;
  }
  return S.geometry();
}

/* ------------------------------------------------------------------ *
 * Strata ledge: a bedded rock band along a contour, stepping back in treads that
 * snow lies on, tapering to nothing at both ends, with a flat bench where the
 * terrain catches up. Inputs are plain functions of the ground so this stays pure.
 * ------------------------------------------------------------------ */
export function buildStrataLedge({ pts, ground, uphill, riser = 2.6, seed = 0 }) {
  const rock = new Soup(); const snow = new Soup();
  const n = pts.length;
  if (n < 4) return { rock: rock.geometry(), snow: snow.geometry() };
  const bands = 3 + (seed % 2);
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const [x, z] = pts[i];
    const [ux, uz] = uphill(x, z);
    const g0 = ground(x, z);
    const taper = smooth(0, 3.2, i) * smooth(0, 3.2, n - 1 - i);
    const lump = 0.72 + 0.28 * Math.sin(i * 0.37 + seed * 1.7) + 0.2 * Math.sin(i * 0.91 + seed);
    const R = Math.max(0.06, riser * clamp(lump, 0.35, 1.25) * taper);
    const w = [];
    let sum = 0;
    for (let k = 0; k < bands; k += 1) { const q = 0.6 + 0.8 * hash(Math.floor(i / 2), k, seed); w.push(q); sum += q; }
    const row = { x, z, ux, uz, g0, R, H: [-0.4], D: [shash(i * 0.5, seed, 3) * 0.12] };
    let hh = 0; let dd = row.D[0];
    for (let k = 0; k < bands; k += 1) {
      hh += (R * w[k]) / sum;
      row.H.push(hh);
      dd += (0.3 * R) / bands + shash(Math.floor(i / 2), k, seed + 5) * 0.16 + 0.04;
      row.D.push(dd);
    }
    // bench back: march uphill until the ground meets the top
    const top = g0 + R;
    let back = 5;
    for (let s = 0.6; s <= 9; s += 0.6) {
      if (ground(x + ux * (dd + s), z + uz * (dd + s)) >= top - 0.05) { back = s; break; }
    }
    row.back = back;
    rows.push(row);
  }
  const P = (r, k, tread) => {
    // k indexes the profile; face point k is (D[k], H[k]); tread end uses D[k+1] at H[k+1]
    const dd = r.D[k]; const hh = r.H[k];
    void tread;
    return [r.x + r.ux * dd, r.g0 + hh, r.z + r.uz * dd];
  };
  for (let i = 0; i < n - 1; i += 1) {
    const a = rows[i]; const b = rows[i + 1];
    for (let k = 0; k < bands; k += 1) {
      // face k: bottom (k, H[k]) to top (H[k+1]) at D[k] ... the face sits at D[k] while the tread steps to D[k+1]
      const a0 = [a.x + a.ux * a.D[k], a.g0 + a.H[k], a.z + a.uz * a.D[k]];
      const a1 = [a.x + a.ux * a.D[k], a.g0 + a.H[k + 1], a.z + a.uz * a.D[k]];
      const b0 = [b.x + b.ux * b.D[k], b.g0 + b.H[k], b.z + b.uz * b.D[k]];
      const b1 = [b.x + b.ux * b.D[k], b.g0 + b.H[k + 1], b.z + b.uz * b.D[k]];
      const out = [-(a.ux + b.ux) / 2, 0, -(a.uz + b.uz) / 2];
      const lo = 0.66 + 0.1 * k; const hi = 0.92 + 0.04 * k;
      quadOut(rock, a0, b0, b1, a1, out, lo, lo, hi, hi);
      // tread: snow, from the face top to the next face line
      const a2 = [a.x + a.ux * a.D[k + 1], a.g0 + a.H[k + 1] + 0.02, a.z + a.uz * a.D[k + 1]];
      const b2 = [b.x + b.ux * b.D[k + 1], b.g0 + b.H[k + 1] + 0.02, b.z + b.uz * b.D[k + 1]];
      quadOut(snow, a1, b1, b2, a2, [0, 1, 0], 0.92, 0.92, 0.84, 0.84);
    }
    // bench: flat snow from the last tread back to where the terrain meets it
    const kk = bands;
    const a3 = [a.x + a.ux * a.D[kk], a.g0 + a.H[kk] + 0.02, a.z + a.uz * a.D[kk]];
    const b3 = [b.x + b.ux * b.D[kk], b.g0 + b.H[kk] + 0.02, b.z + b.uz * b.D[kk]];
    const a4 = [a.x + a.ux * (a.D[kk] + a.back), a.g0 + a.H[kk] - 0.06, a.z + a.uz * (a.D[kk] + a.back)];
    const b4 = [b.x + b.ux * (b.D[kk] + b.back), b.g0 + b.H[kk] - 0.06, b.z + b.uz * (b.D[kk] + b.back)];
    quadOut(snow, a3, b3, b4, a4, [0, 1, 0], 0.9, 0.9, 0.95, 0.95);
  }
  return { rock: rock.geometry(), snow: snow.geometry() };
}

function quadOut(S, a, b, c, d, out, ka, kb, kc, kd) {
  const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
  const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
  const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (nx * out[0] + ny * out[1] + nz * out[2] < 0) {
    S.tri(a, d, c, ka, kd, kc); S.tri(a, c, b, ka, kc, kb);
  } else {
    S.tri(a, b, c, ka, kb, kc); S.tri(a, c, d, ka, kc, kd);
  }
}

/* ------------------------------------------------------------------ *
 * Chalets. One builder, three silhouettes (hut, A-frame, two-storey with balcony),
 * plus a lodge scale. Local frame: origin at the footprint centre on the ground,
 * ridge along x, +z the front. Parts come back per material key.
 * ------------------------------------------------------------------ */
const CHALET_KINDS = {
  hut: { W: 5.6, D: 4.6, plinth: 0.7, wallH: 2.4, pitch: 42, over: 0.6 },
  aframe: { W: 5.4, D: 5.6, plinth: 0.45, wallH: 0.8, pitch: 57, over: 0.45, aframe: true },
  lodge2: { W: 7.4, D: 5.8, plinth: 0.9, wallH: 4.2, pitch: 40, over: 0.8, balcony: true },
  lodge: { W: 16, D: 8.6, plinth: 1.25, wallH: 4.0, pitch: 40, over: 1.15, balcony: true, cross: true, big: true },
};

export function buildChalet(kind = 'hut', seed = 0, override = {}) {
  const K = { ...CHALET_KINDS[kind], ...override };
  const { W, D, plinth, wallH, over } = K;
  const tp = Math.tan((K.pitch * Math.PI) / 180);
  const cp = Math.cos((K.pitch * Math.PI) / 180);
  const floorY = plinth;
  const eaveY = floorY + wallH;
  const ridgeY = eaveY + (D / 2) * tp;
  const go = K.big ? 0.8 : 0.5; // gable overhang
  const P = {
    stone: new Soup(), timber: new Soup(), timberDark: new Soup(), timberPale: new Soup(),
    roof: new Soup(), snow: new Soup(), trim: new Soup(), glass: new Soup(), steel: new Soup(),
  };
  const th = 0.2;

  // plinth: stone, coursed, bedded 1.4 m into the slope
  P.stone.box(0, (floorY - 2.4) / 2, 0, W + 0.24, floorY + 2.4, D + 0.24, { kb: 0.5, kt: 0.92 });
  for (const f of [0.34, 0.68]) P.stone.box(0, floorY * f, 0, W + 0.32, 0.07, D + 0.32, { k: 0.78 });
  P.stone.box(0, floorY - 0.05, 0, W + 0.42, 0.12, D + 0.42, { k: 1 });

  // walls, string course, corner posts
  P.timber.box(0, floorY + wallH / 2, 0, W, wallH, D, { kb: 0.74, kt: 0.98 });
  if (wallH > 1.5) P.timberDark.box(0, floorY + wallH * 0.5, 0, W + 0.1, 0.1, D + 0.1, { k: 0.85 });
  if (K.wallH > 3.5) P.timberDark.box(0, floorY + wallH * 0.5 + 0.0, 0, W + 0.13, 0.16, D + 0.13, { k: 0.8 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    P.timberPale.box(sx * (W / 2 + 0.02), floorY + wallH / 2, sz * (D / 2 + 0.02), 0.24, wallH + 0.04, 0.24, { kb: 0.7, kt: 1 });
  }
  // wall-top plate under the eave
  P.timberDark.box(0, eaveY - 0.08, 0, W + 0.2, 0.16, D + 0.2, { k: 0.7 });

  // gable infill, one each end
  for (const sx of [-1, 1]) {
    const x0 = sx * (W / 2 - 0.12); const x1 = sx * (W / 2 + 0.12);
    const v = [];
    for (const x of [x0, x1]) { v.push([x, eaveY - 0.02, -D / 2], [x, eaveY - 0.02, D / 2], [x, ridgeY - 0.12, 0]); }
    P.timber.solid(v, [[0, 1, 2], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]], (i, p) => 0.7 + 0.3 * smooth(eaveY, ridgeY, p[1]));
    // vertical battens and a gable light
    for (const b of [-1, 0, 1]) {
      const zb = b * (D / 2 - 0.9);
      const hb = (ridgeY - eaveY) * (1 - Math.abs(zb) / (D / 2)) - 0.35;
      if (hb > 0.2) P.timberPale.box(sx * (W / 2 + 0.16), eaveY + hb / 2, zb, 0.08, hb, 0.1, { kb: 0.8, kt: 1 });
    }
    if (K.aframe) {
      // the whole gable is glazed
      const hg = (ridgeY - eaveY) * 0.62; const wg = D * 0.55;
      P.glass.box(sx * (W / 2 + 0.2), eaveY + hg / 2 + 0.25, 0, 0.05, hg, wg * (1 - 0.35 * hg / (ridgeY - eaveY)), { k: 1 });
      P.trim.box(sx * (W / 2 + 0.2), eaveY + 0.2, 0, 0.12, 0.1, wg + 0.15, { k: 0.9 });
      P.trim.box(sx * (W / 2 + 0.2), eaveY + hg * 0.55, 0, 0.12, 0.07, wg * 0.8, { k: 0.95 });
    } else {
      P.glass.box(sx * (W / 2 + 0.2), eaveY + 0.8, 0, 0.06, 0.6, 0.6, { k: 1 });
    }
  }

  // roof planes: a slab 0.2 thick, eave overhang `over`, gable overhang `go`
  const roofX = W / 2 + go;
  for (const sg of [-1, 1]) {
    const ez = sg * (D / 2 + over); const ey = eaveY - over * tp;
    const dz = (D / 2 + over) / 1; // horizontal run ridge->eave edge
    const up = th / cp;
    const v = [
      [-roofX, ridgeY, 0], [roofX, ridgeY, 0], [roofX, ey, ez], [-roofX, ey, ez],
      [-roofX, ridgeY - up, 0], [roofX, ridgeY - up, 0], [roofX, ey - up, ez], [-roofX, ey - up, ez],
    ];
    P.roof.solid(v, [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]],
      (i) => (i < 4 ? 0.86 + 0.14 * (i < 2 ? 1 : 0.8) : 0.5));
    // fascia and rafter tails along the eave
    P.trim.box(0, ey - up - 0.04, ez, roofX * 2 + 0.06, 0.24, 0.1, { k: 0.8 });
    const tails = K.big ? 9 : 3;
    for (let t = 0; t < tails; t += 1) {
      const tx = -roofX + 0.3 + (t / (tails - 1)) * (roofX * 2 - 0.6);
      P.timberDark.box(tx, ey - up - 0.14 + 0.02, ez - sg * 0.18, 0.12, 0.14, 0.5, { k: 0.7 });
    }
    // snow cap: from the ridge down 78 percent of the slope, thick, lip overhanging the barge
    const f = 0.64; const sh = 0.3 * (K.big ? 1.2 : 1);
    const zE = ez * f; const yE = ridgeY + (ey - ridgeY) * f;
    const sv = [
      [-roofX - 0.12, ridgeY + 0.04, 0], [roofX + 0.12, ridgeY + 0.04, 0], [roofX + 0.12, yE + 0.04, zE], [-roofX - 0.12, yE + 0.04, zE],
      [-roofX - 0.08, ridgeY + sh, 0], [roofX + 0.08, ridgeY + sh, 0], [roofX + 0.08, yE + sh * 0.7, zE - sg * 0.12], [-roofX - 0.08, yE + sh * 0.7, zE - sg * 0.12],
    ];
    P.snow.solid(sv, [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]],
      (i) => (i < 4 ? 0.8 : 1));
    // barge boards up the gable-end edges
    for (const sx of [-1, 1]) {
      P.trim.beam([sx * roofX, ey - up * 0.6, ez], [sx * roofX, ridgeY - up * 0.3 + 0.04, 0], 0.1, { h: 0.26, k: 0.85 });
    }
    void dz;
  }
  // ridge: cap beam and snow crest across both planes
  P.timberDark.box(0, ridgeY + 0.02, 0, roofX * 2 + 0.12, 0.2, 0.3, { k: 0.9 });
  P.snow.box(0, ridgeY + 0.16, 0, roofX * 2 + 0.2, 0.26, 0.62, { kb: 0.9, kt: 1 });

  // chimney through the rear slope
  const chx = W * 0.26; const chz = -D * 0.2;
  const chTop = ridgeY + 1.0 + (K.big ? 0.6 : 0);
  P.stone.box(chx, (floorY + chTop) / 2, chz, 0.8, chTop - floorY, 0.8, { kb: 0.6, kt: 0.95 });
  P.stone.box(chx, chTop + 0.06, chz, 1.02, 0.16, 1.02, { k: 0.9 });
  P.snow.box(chx, chTop + 0.2, chz, 0.9, 0.14, 0.9, { k: 1 });
  P.steel.box(chx, chTop + 0.42, chz, 0.34, 0.3, 0.34, { k: 0.7 });

  // front: door, windows, canopy
  const fz = D / 2;
  const wl = 2.2;
  const doorX = K.big ? 4.6 : -W * 0.18;
  const dz0 = K.cross ? fz + wl : fz;
  if (K.cross) {
    // a front-gabled wing over the entrance: walls, gable infill, a lower ridge that breaks out of the main roof
    const cx = doorX; const cw = 5.2;
    const weave = eaveY - 0.5; const wRidge = weave + (cw / 2) * tp;
    P.timber.box(cx, floorY + (weave - floorY) / 2, fz + wl / 2 - 0.05, cw, weave - floorY, wl + 0.1, { kb: 0.74, kt: 0.98 });
    P.stone.box(cx, (floorY - 2.4) / 2, fz + wl / 2 - 0.05, cw + 0.24, floorY + 2.4, wl + 0.34, { kb: 0.5, kt: 0.92 });
    P.stone.box(cx, floorY - 0.05, fz + wl / 2 - 0.05, cw + 0.42, 0.12, wl + 0.5, { k: 1 });
    const gv = [];
    for (const z of [fz + wl - 0.12, fz + wl + 0.12]) { gv.push([cx - cw / 2, weave - 0.02, z], [cx + cw / 2, weave - 0.02, z], [cx, wRidge - 0.12, z]); }
    P.timber.solid(gv, [[0, 1, 2], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]], (i, p) => 0.7 + 0.3 * smooth(weave, wRidge, p[1]));
    P.glass.box(cx, weave + 0.85, fz + wl + 0.2, 1.7, 1.3, 0.06, { k: 1 });
    P.trim.box(cx, weave + 0.85, fz + wl + 0.15, 1.95, 1.55, 0.08, { k: 0.85 });
    const z0 = 0.6; const z1 = fz + wl + 0.55; const wover = 0.5;
    for (const sg of [-1, 1]) {
      const ex = cx + sg * (cw / 2 + wover); const ey = weave - wover * tp; const up2 = th / cp;
      const v = [[cx, wRidge, z0], [cx, wRidge, z1], [ex, ey, z1], [ex, ey, z0],
        [cx, wRidge - up2, z0], [cx, wRidge - up2, z1], [ex, ey - up2, z1], [ex, ey - up2, z0]];
      P.roof.solid(v, [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], (i) => (i < 4 ? 0.9 : 0.5));
      const f = 0.62;
      const exs = cx + (ex - cx) * f; const eys = wRidge + (ey - wRidge) * f;
      const sv = [[cx, wRidge + 0.04, z0 - 0.0], [cx, wRidge + 0.04, z1 + 0.08], [exs, eys + 0.04, z1 + 0.08], [exs, eys + 0.04, z0],
        [cx, wRidge + 0.3, z0], [cx, wRidge + 0.3, z1 + 0.08], [exs, eys + 0.22, z1 + 0.08], [exs, eys + 0.22, z0]];
      P.snow.solid(sv, [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], (i) => (i < 4 ? 0.8 : 1));
      P.trim.beam([ex, ey - up2 * 0.6, z1], [cx, wRidge - up2 * 0.3 + 0.04, z1], 0.1, { h: 0.26, k: 0.85 });
    }
    P.snow.box(cx, wRidge + 0.16, (z0 + z1) / 2, 0.6, 0.26, z1 - z0, { kb: 0.9, kt: 1 });
    P.timberDark.box(cx, wRidge + 0.02, (z0 + z1) / 2, 0.3, 0.2, z1 - z0, { k: 0.9 });
  }
  P.trim.box(doorX, floorY + 1.1, dz0 + 0.04, 1.2, 2.2, 0.1, { k: 0.85 });
  P.timberDark.box(doorX, floorY + 1.05, dz0 + 0.1, 0.95, 2.05, 0.1, { kb: 0.6, kt: 0.9 });
  P.stone.box(doorX, floorY - 0.12, dz0 + 0.5, 1.6, 0.2, 0.9, { kb: 0.6, kt: 0.95 });
  P.trim.box(doorX, floorY + 2.4, dz0 + 0.4, 1.9, 0.12, 1.0, { rx: 0.2, k: 0.85 });
  P.snow.box(doorX, floorY + 2.52, dz0 + 0.4, 1.8, 0.14, 0.95, { rx: 0.2, k: 1 });
  for (const sx of [-1, 1]) P.timberPale.box(doorX + sx * 0.8, floorY + 1.15, dz0 + 0.88, 0.1, 2.3, 0.1, { kb: 0.7, kt: 1 });
  const winY = floorY + wallH * (K.wallH > 3.5 ? 0.28 : 0.55);
  const wins = K.big ? [-5.6, -1.9] : (K.wallH > 3.5 ? [-W * 0.3, W * 0.3] : [W * 0.2]);
  const addWin = (x, y, ww, hh, z) => {
    P.trim.box(x, y, z + 0.04, ww + 0.26, hh + 0.26, 0.1, { k: 0.9 });
    P.glass.box(x, y, z + 0.1, ww, hh, 0.06, { k: 1 });
    P.timberDark.box(x, y, z + 0.14, 0.07, hh, 0.05, { k: 0.8 });
    P.trim.box(x, y - hh / 2 - 0.16, z + 0.14, ww + 0.4, 0.1, 0.26, { k: 0.9 });
    for (const sx of [-1, 1]) P.timberDark.box(x + sx * (ww / 2 + 0.34), y, z + 0.1, 0.32, hh + 0.1, 0.06, { k: 0.75 });
  };
  for (const wx of wins) addWin(wx, winY, K.big ? 1.9 : 0.95, K.big ? 1.5 : 0.9, fz);
  if (K.wallH > 3.5) { // upper floor windows and the balcony
    const uy = floorY + wallH * 0.74;
    const bw = K.big ? 9.2 : W * 0.82; const bcx = K.big ? -3.4 : 0; const by = floorY + wallH * 0.5 - 0.3; const bd = K.big ? 1.6 : 1.4;
    P.timberPale.box(bcx, by, fz + bd / 2, bw, 0.14, bd, { kb: 0.6, kt: 1 });
    P.timberDark.box(bcx, by - 0.24, fz + bd - 0.1, bw, 0.16, 0.16, { k: 0.7 });
    const nb = Math.max(6, Math.round(bw / 0.46));
    for (let b = 0; b <= nb; b += 1) {
      const bx = bcx - bw / 2 + (b / nb) * bw;
      P.timberPale.box(bx, by + 0.58, fz + bd - 0.08, 0.07, 1.0, 0.07, { kb: 0.8, kt: 1 });
    }
    P.timberPale.box(bcx, by + 1.1, fz + bd - 0.08, bw + 0.1, 0.1, 0.14, { k: 1 });
    P.timberPale.box(bcx, by + 0.18, fz + bd - 0.08, bw, 0.06, 0.07, { k: 0.9 });
    for (const sx of [-1, 1]) {
      P.timberPale.box(bcx + sx * bw / 2, by + 0.58, fz + bd / 2, 0.07, 1.0, 0.07, { k: 1 });
      P.timberPale.box(bcx + sx * bw / 2, by + 1.1, fz + bd / 2, 0.1, 0.1, bd, { k: 1 });
      P.timberDark.box(bcx + sx * (bw / 2 - 0.1), by - 0.78, fz + bd - 0.12, 0.2, 1.3, 0.2, { kb: 0.6, kt: 0.9 });
      P.timberDark.beam([bcx + sx * (bw / 2 - 0.1), by - 0.3, fz + bd - 0.12], [bcx + sx * (bw / 2 - 0.1), by - 0.1, fz + 0.1], 0.1, { k: 0.8 });
    }
    const ux = K.big ? [-5.6, -1.9] : [-W * 0.3, W * 0.3];
    for (const wx of ux) addWin(wx, uy, K.big ? 1.9 : 0.95, K.big ? 1.3 : 0.9, fz);
  }
  // a woodpile against the end wall and a snow drift bedding the plinth
  if (!K.big) {
    P.timberPale.box(-W / 2 - 0.36, floorY + 0.2, -0.2, 0.46, 0.36, 1.1, { kb: 0.6, kt: 0.95 });
    P.timberPale.box(-W / 2 - 0.36, floorY + 0.52, -0.2, 0.42, 0.28, 0.8, { kb: 0.7, kt: 1 });
  }
  if (K.aframe) {
    // a small deck across the glazed gable
    P.timberPale.box(0, floorY + 0.12, D / 2 + 0.9, W * 0.9, 0.14, 1.5, { kb: 0.6, kt: 1 });
  }
  const out = {};
  for (const [key, soup] of Object.entries(P)) if (!soup.empty) out[key] = soup.geometry();
  return { parts: out, size: { W: W + 2 * go, D: D + 2 * over, H: ridgeY + 1 }, ridgeY, eaveY, floorY, chimney: [chx, chTop + 0.5, chz], kind };
}

/* ------------------------------------------------------------------ *
 * Chairlift: a lattice tower, a chair, a station bull wheel.
 * Tower local frame: +z along the lift line, x lateral, y up from the ground.
 * ------------------------------------------------------------------ */
export function buildLiftTower(h, seed = 0) {
  const steel = new Soup(); const dark = new Soup(); const stone = new Soup();
  const hb = 0.8; const ht = 0.36; // half widths at the foot and the head
  const foot = (sx, sz) => [sx * hb, 0.4, sz * hb];
  const head = (sx, sz) => [sx * ht, h - 0.55, sz * ht];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    steel.beam(foot(sx, sz), head(sx, sz), 0.2, { w1: 0.7, ka: 0.7, kb: 1 });
  }
  const panels = 3;
  const at = (t, sx, sz) => {
    const w = mix(hb, ht, t);
    return [sx * w, mix(0.4, h - 0.55, t), sz * w];
  };
  for (let p = 0; p < panels; p += 1) {
    const t0 = p / panels; const t1 = (p + 1) / panels;
    const faces = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [fx, fz] of faces) {
      const side = (t, s) => (fx ? at(t, fx, s) : at(t, s, fz));
      steel.beam(side(t0, -1), side(t1, 1), 0.075, { k: 0.85 });
      steel.beam(side(t0, 1), side(t1, -1), 0.075, { k: 0.85 });
      steel.beam(side(t1, -1), side(t1, 1), 0.08, { k: 0.9 });
    }
  }
  // cross arm carrying two sheave trains
  dark.box(0, h - 0.3, 0, 5.8, 0.34, 0.5, { kb: 0.65, kt: 1 });
  steel.box(0, h - 0.62, 0, 5.2, 0.14, 0.2, { k: 0.8 });
  for (const sx of [-1, 1]) {
    const cx = sx * 2.4;
    dark.box(cx, h - 0.72, 0, 0.3, 0.5, 2.5, { kb: 0.6, kt: 0.95 });
    for (let w = 0; w < 4; w += 1) {
      const z = -0.93 + w * 0.62;
      dark.prism([cx - 0.09, h - 0.98, z], [cx + 0.09, h - 0.98, z], 0.3, 0.3, 6, { k: 0.8 });
    }
    // snow load on the arm
    // (kept thin so steel shows)
  }
  const snow = new Soup();
  snow.box(0, h - 0.08, 0, 5.2, 0.14, 0.4, { kb: 0.9, kt: 1 });
  // footing: concrete pad with a chamfered cap
  stone.box(0, -0.4, 0, 2.6, 1.8, 2.6, { kb: 0.55, kt: 0.95 });
  stone.box(0, 0.58, 0, 2.2, 0.16, 2.2, { k: 0.95 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    dark.box(sx * hb, 0.7, sz * hb, 0.4, 0.22, 0.4, { k: 0.75 });
  }
  void seed;
  return { steel: steel.geometry(), dark: dark.geometry(), stone: stone.geometry(), snow: snow.geometry() };
}

/** A fixed-grip chair hanging from a grip at the origin: hanger, seat, back, safety bar. Seat plate at y -2.75. */
export function buildChair() {
  const frame = new Soup(); const seat = new Soup();
  frame.prism([0, 0.18, 0], [0, -0.08, 0], 0.16, 0.16, 8, { k: 0.8 });
  frame.beam([0, -0.05, 0], [0, -2.5, 0], 0.09, { k: 0.85 });
  frame.beam([-1.15, -2.62, -0.02], [1.15, -2.62, -0.02], 0.1, { k: 0.8 });
  frame.beam([-1.1, -2.62, 0.0], [-1.1, -2.1, 0.46], 0.07, { k: 0.85 });
  frame.beam([1.1, -2.62, 0.0], [1.1, -2.1, 0.46], 0.07, { k: 0.85 });
  frame.beam([-1.1, -2.1, 0.46], [1.1, -2.1, 0.46], 0.07, { k: 0.95 });
  frame.beam([-1.0, -3.2, 0.36], [1.0, -3.2, 0.36], 0.08, { k: 0.8 });
  for (const sx of [-1, 1]) {
    frame.beam([sx * 1.12, -2.8, 0.34], [sx * 1.12, -2.05, -0.3], 0.07, { k: 0.8 });
    frame.beam([sx * 1.12, -2.8, 0.34], [sx * 1.0, -3.2, 0.36], 0.06, { k: 0.8 });
  }
  seat.box(0, -2.75, 0.02, 2.4, 0.14, 0.62, { kb: 0.55, kt: 1 });
  seat.box(0, -2.28, -0.34, 2.4, 0.95, 0.12, { rx: -0.18, kb: 0.7, kt: 1 });
  seat.box(0, -2.75, -0.32, 2.4, 0.06, 0.08, { k: 0.5 });
  return { frame: frame.geometry(), seat: seat.geometry() };
}

/** A station shed: sloped roof on four posts over a bull wheel. Frame x lateral, z along the line. */
export function buildStationShed({ W = 11, D = 8.4, H = 5.2 } = {}) {
  const steel = new Soup(); const roof = new Soup(); const snow = new Soup(); const stone = new Soup();
  const cols = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (const [sx, sz] of cols) {
    steel.box(sx * (W / 2 - 0.3), H / 2 - 0.1, sz * (D / 2 - 0.3), 0.4, H, 0.4, { kb: 0.65, kt: 0.95 });
    steel.box(sx * (W / 2 - 0.3), 0.22, sz * (D / 2 - 0.3), 0.8, 0.44, 0.8, { k: 0.7 });
    steel.beam([sx * (W / 2 - 0.3), H - 1.4, sz * (D / 2 - 0.3)], [sx * (W / 2 - 1.6), H - 0.15, sz * (D / 2 - 0.3)], 0.14, { k: 0.85 });
  }
  const tilt = 0.12;
  const hi = H + 0.5; const lo = H - 0.1;
  const v = [
    [-W / 2 - 0.5, lo, -D / 2 - 0.5], [W / 2 + 0.5, lo, -D / 2 - 0.5], [W / 2 + 0.5, hi, D / 2 + 0.5], [-W / 2 - 0.5, hi, D / 2 + 0.5],
  ];
  const up = 0.34;
  const vv = [...v, ...v.map((p) => [p[0], p[1] - up, p[2]])];
  roof.solid(vv, [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], (i) => (i < 4 ? 1 : 0.5));
  const sn = vv.map((p, i) => (i < 4 ? [p[0] * 0.94, p[1] + 0.04, p[2] * 0.94] : [p[0] * 0.94, p[1] + 0.34, p[2] * 0.94]));
  const sv = [sn[0], sn[1], sn[2], sn[3], ...sn.slice(0, 4).map((p) => [p[0], p[1] + 0.3, p[2]])];
  snow.solid(sv, [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], (i) => (i < 4 ? 0.8 : 1));
  void tilt;
  // deck and the wheel housing
  stone.box(0, 0.12, 0, W + 0.8, 0.5, D + 0.8, { kb: 0.6, kt: 0.95 });
  steel.box(W / 2 - 1.2, 1.3, 0, 1.6, 2.2, 3.2, { kb: 0.6, kt: 0.95 });
  return { steel: steel.geometry(), roof: roof.geometry(), snow: snow.geometry(), stone: stone.geometry() };
}

/** Bull wheel: rim, hub, six spokes, in the x-y plane, axis along z. */
export function buildBullWheel(r = 2.4) {
  const S = new Soup();
  const n = 14;
  const ring = (rr, k) => {
    for (let i = 0; i < n; i += 1) {
      const a0 = (i / n) * Math.PI * 2; const a1 = ((i + 1) / n) * Math.PI * 2;
      S.beam([Math.cos(a0) * rr, Math.sin(a0) * rr, 0], [Math.cos(a1) * rr, Math.sin(a1) * rr, 0], 0.26, { h: 0.5, k });
    }
  };
  ring(r, 0.85);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    S.beam([0, 0, 0], [Math.cos(a) * r, Math.sin(a) * r, 0], 0.12, { h: 0.2, k: 0.75 });
  }
  S.prism([0, 0, -0.35], [0, 0, 0.35], 0.34, 0.34, 8, { k: 0.8 });
  return S.geometry();
}

/* ------------------------------------------------------------------ *
 * Snow gum: a twisted multi-stem trunk and an open crown of overlapping lobes
 * (displaced icospheres, undersides darker), with snow lying on the upper faces.
 * Total height about 6 to 8 m at scale 1.
 * ------------------------------------------------------------------ */
function lobe(S, cx, cy, cz, rx, ry, rz, seed, k0, k1, detail = 1, tone = null) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.getAttribute('position');
  const n = pos.count;
  const P = [];
  for (let i = 0; i < n; i += 1) {
    const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
    const q = shash(Math.round(x * 4) + seed * 9, Math.round(y * 4), Math.round(z * 4));
    const r = 1 + 0.2 * q;
    P.push([cx + x * rx * r, cy + y * ry * r * (y < 0 ? 0.75 : 1), cz + z * rz * r, y]);
  }
  for (let i = 0; i < n; i += 3) {
    const yc = (P[i][3] + P[i + 1][3] + P[i + 2][3]) / 3;
    const snowy = tone && yc > 0.62; // snow lies on the top of the lobe only (about a quarter of its height)
    const kk = (j) => mix(k0, k1, smooth(-0.9, 0.8, P[i + j][3]));
    if (tone) {
      const c = (j) => {
        const base = snowy ? tone.snow : tone.leaf;
        const k = snowy ? 0.88 + 0.1 * smooth(0.6, 0.95, P[i + j][3]) : kk(j);
        return [base.r * k, base.g * k, base.b * k];
      };
      S.triRGB(P[i].slice(0, 3), P[i + 1].slice(0, 3), P[i + 2].slice(0, 3), c(0), c(1), c(2));
    } else {
      S.tri(P[i].slice(0, 3), P[i + 1].slice(0, 3), P[i + 2].slice(0, 3), kk(0), kk(1), kk(2));
    }
  }
}

/**
 * Snow gum: dark twisted multi-stem trunk (bark tone) and an open crown of overlapping lobes in
 * the leaf tone with snow on the top third of each lobe, all as vertex colour on ONE mesh and
 * one near-white material. tones: { leaf, leaf2, bark, snow } as THREE.Color (linear).
 * About 6 to 7 m tall at scale 1.
 */
export function buildSnowGum(seed = 0, load = 0.5, tones = null) {
  const T = tones ?? {
    leaf: new THREE.Color(0.2, 0.3, 0.2), bark: new THREE.Color(0.05, 0.04, 0.03), snow: new THREE.Color(0.8, 0.85, 0.9),
  };
  const S = new Soup();
  const stems = 2 + (seed % 5 === 0 ? 1 : 0);
  const tops = [];
  const bark = (a, b, r0, r1, n, k0, k1, open) => S.prismRGB(a, b, r0, r1, n, T.bark, k0, k1, open);
  for (let s = 0; s < stems; s += 1) {
    const a = (s / stems) * Math.PI * 2 + hash(seed, s, 1) * 1.2;
    const lean = 0.28 + 0.22 * hash(seed, s, 2);
    const hgt = 3.8 + 1.6 * hash(seed, s, 3);
    const twist = shash(seed, s, 4) * 0.9;
    const segs = 3;
    let p = [Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15];
    let dirA = a;
    for (let k = 0; k < segs; k += 1) {
      const t0 = k / segs; const t1 = (k + 1) / segs;
      dirA += twist * 0.5;
      const step = hgt / segs;
      const q = [p[0] + Math.cos(dirA) * lean * step * (1 + t1), p[1] + step, p[2] + Math.sin(dirA) * lean * step * (1 + t1)];
      bark(p, q, mix(0.3, 0.17, t0), mix(0.3, 0.17, t1) * 0.95, 6, 0.7 + 0.3 * t0, 0.8 + 0.2 * t1, k < segs - 1);
      p = q;
    }
    tops.push({ p, a, s });
    const lp = [p[0] * 0.55, p[1] * 0.62, p[2] * 0.55];
    const la = a + 1.4 + hash(seed, s, 7);
    const lq = [lp[0] + Math.cos(la) * 1.6, lp[1] + 1.4, lp[2] + Math.sin(la) * 1.6];
    bark(lp, lq, 0.12, 0.07, 5, 0.8, 0.95, true);
    tops.push({ p: lq, a: la, s: s + 9, small: true });
  }
  const tone = (i) => ({ leaf: i % 2 ? T.leaf2 ?? T.leaf : T.leaf, snow: T.snow });
  for (const t of tops) {
    const r = (t.small ? 0.85 : 1.22) * (0.85 + 0.3 * hash(seed, t.s, 11));
    lobe(S, t.p[0], t.p[1] + r * 0.28, t.p[2], r * 1.3, r * 0.76, r * 1.2, seed + t.s * 3, 0.5, 1.0, t.small ? 0 : 1, tone(t.s));
    if (!t.small) {
      lobe(S, t.p[0] + Math.cos(t.a + 2) * r * 0.9, t.p[1] - r * 0.2, t.p[2] + Math.sin(t.a + 2) * r * 0.9,
        r * 0.9, r * 0.6, r * 0.85, seed + t.s * 5 + 1, 0.46, 0.92, 0, tone(t.s + 1));
    }
  }
  void load;
  return S.geometryRGB();
}

/* ------------------------------------------------------------------ *
 * The figure. A jointed adult 1.70 m tall at about 300 triangles, 7.5 heads:
 * head, neck, torso, pelvis, upper and lower arms, hands, thighs, shins, feet,
 * helmet; standing and skiing poses; skis and poles as parts.
 * Returns { skin, upper, lower, gear } geometries (one value each), feet on y = 0.
 * ------------------------------------------------------------------ */
export function buildFringeFigure({ pose = 'stand', gear = {} } = {}) {
  const skin = new Soup(); const upper = new Soup(); const lower = new Soup(); const kit = new Soup();
  const HEAD = 1.7 / 7.5;
  const legL = 0.42; const shinL = 0.40; const armU = 0.30; const armF = 0.27;
  const ski = pose === 'ski';
  const lean = ski ? 0.5 : (pose === 'carry' ? 0.06 : 0.04);
  // joint angles in the sagittal plane (positive = forward), per pose
  const hipA = ski ? 1.1 : 0.04; const kneeA = ski ? -1.3 : -0.04;
  const footY = ski ? 0.18 : 0.08; // sole under the boot (skis add thickness)
  const fk = (o, l1, l2, a1, a2, lat) => {
    const k = [o[0] + lat, o[1] - Math.cos(a1) * l1, o[2] + Math.sin(a1) * l1];
    const e = [k[0], k[1] - Math.cos(a1 + a2) * l2, k[2] + Math.sin(a1 + a2) * l2];
    return [k, e];
  };
  // legs first, so the pelvis can be placed with the feet on the ground
  const drop = Math.cos(hipA) * legL + Math.cos(hipA + kneeA) * shinL;
  const hipY = footY + drop;
  const hipZ = ski ? -(Math.sin(hipA) * legL + Math.sin(hipA + kneeA) * shinL) * 0.35 : 0;
  const sideX = 0.095;
  for (const sx of [-1, 1]) {
    const [kn, an] = fk([sx * sideX, hipY, hipZ], legL, shinL, hipA + (pose === 'carry' ? sx * 0.1 : 0), kneeA, 0);
    lower.prism([sx * sideX, hipY, hipZ], kn, 0.085, 0.062, 6, { ka: 0.9, kb: 0.85, open: true });
    lower.prism(kn, an, 0.06, 0.045, 6, { ka: 0.85, kb: 0.7, open: true });
    // boot and foot
    kit.box(sx * sideX, footY * 0.5 + 0.04, an[2] + 0.06, 0.1, footY + 0.06, 0.28, { kb: 0.6, kt: 0.95 });
    if (ski) {
      kit.box(sx * 0.13, 0.04, an[2] + 0.55, 0.1, 0.035, 1.75, { k: 0.9 });
      kit.box(sx * 0.13, 0.085, an[2] + 1.35, 0.1, 0.03, 0.26, { rx: -0.35, k: 1 });
    }
  }
  // pelvis, torso, chest
  const tl = lean;
  const pelvis = [0, hipY + 0.06, hipZ];
  lower.box(pelvis[0], pelvis[1], pelvis[2], 0.30, 0.17, 0.2, { rx: tl * 0.4, kb: 0.7, kt: 0.9 });
  const waist = [0, hipY + 0.14, hipZ];
  const neckBase = [0, waist[1] + Math.cos(tl) * 0.44, waist[2] + Math.sin(tl) * 0.44];
  upper.prism(waist, [0, (waist[1] + neckBase[1]) / 2, (waist[2] + neckBase[2]) / 2 + 0.01], 0.14, 0.17, 6, { ka: 0.7, kb: 0.9, open: true });
  upper.prism([0, (waist[1] + neckBase[1]) / 2, (waist[2] + neckBase[2]) / 2], [0, neckBase[1] - 0.02, neckBase[2]], 0.17, 0.16, 6, { ka: 0.9, kb: 1 });
  upper.box(0, neckBase[1] - 0.06, neckBase[2], 0.40, 0.1, 0.2, { rx: tl, kb: 0.85, kt: 1 });
  // neck and head
  const neckTop = [0, neckBase[1] + 0.05, neckBase[2] + (ski ? 0.06 : 0.01)];
  skin.prism([0, neckBase[1] - 0.02, neckBase[2]], neckTop, 0.05, 0.045, 6, { k: 0.85, open: true });
  const headC = [0, neckTop[1] + HEAD * 0.46, neckTop[2] + (ski ? 0.05 : 0.01)];
  skin.prism([0, headC[1] - HEAD * 0.45, headC[2]], [0, headC[1] + HEAD * 0.45, headC[2]], HEAD * 0.34, HEAD * 0.3, 8, { ka: 0.8, kb: 1 });
  skin.box(0, headC[1] - HEAD * 0.18, headC[2] + HEAD * 0.28, 0.07, 0.08, 0.08, { k: 0.95 });
  if (gear.helmet !== false) kit.prism([0, headC[1] + HEAD * 0.05, headC[2]], [0, headC[1] + HEAD * 0.5, headC[2]], HEAD * 0.37, HEAD * 0.2, 8, { ka: 0.8, kb: 1 });
  if (gear.goggles || ski) kit.box(0, headC[1] + HEAD * 0.06, headC[2] + HEAD * 0.3, HEAD * 0.62, HEAD * 0.2, 0.05, { k: 1 });
  // arms
  const shY = neckBase[1] - 0.06; const shZ = neckBase[2];
  const armA = ski ? 0.55 : (pose === 'carry' ? 0.5 : 0.1);
  const elbowA = ski ? 0.55 : (pose === 'carry' ? 1.2 : 0.2);
  for (const sx of [-1, 1]) {
    const [el, wr] = fk([sx * 0.21, shY, shZ], armU, armF, armA, elbowA, 0);
    upper.prism([sx * 0.21, shY, shZ], el, 0.062, 0.05, 6, { ka: 0.95, kb: 0.85, open: true });
    upper.prism(el, wr, 0.05, 0.04, 6, { ka: 0.85, kb: 0.8, open: true });
    skin.box(wr[0], wr[1] - 0.04, wr[2] + 0.01, 0.08, 0.1, 0.07, { k: 0.95 });
    if (ski) {
      kit.beam([wr[0], wr[1] + 0.05, wr[2]], [wr[0] * 1.05, 0.02, wr[2] - 0.55], 0.03, { k: 0.8 });
      kit.prism([wr[0] * 1.05 - 0.04, 0.03, wr[2] - 0.55], [wr[0] * 1.05 + 0.04, 0.03, wr[2] - 0.55], 0.07, 0.07, 6, { k: 0.8 });
    }
  }
  if (gear.pack) upper.box(0, neckBase[1] - 0.3, neckBase[2] - 0.17, 0.3, 0.42, 0.16, { rx: tl, kb: 0.6, kt: 0.9 });
  return { skin: skin.geometry(), upper: upper.geometry(), lower: lower.geometry(), gear: kit.geometry() };
}

/** A piste sign on two posts and a slalom pole, at real size. */
export function buildPisteSign() {
  const post = new Soup(); const panel = new Soup();
  for (const sx of [-0.55, 0.55]) post.box(sx, 0.9, 0, 0.09, 1.8, 0.09, { kb: 0.6, kt: 1 });
  panel.box(0, 1.55, 0.06, 1.5, 0.75, 0.06, { k: 1 });
  panel.box(0, 1.97, 0.06, 1.56, 0.1, 0.08, { k: 0.9 });
  return { post: post.geometry(), panel: panel.geometry() };
}

export function buildSlalomPole() {
  const S = new Soup();
  S.prism([0, 0, 0], [0, 1.85, 0], 0.028, 0.024, 5, { ka: 0.8, kb: 1 });
  const flag = new Soup();
  flag.box(0, 1.55, 0.0, 0.015, 0.32, 0.5, { k: 1 });
  return { pole: S.geometry(), flag: flag.geometry() };
}

/** A heath shrub: four overlapping rounded lobes, undersides dark, 1.4 to 2 m across at scale 1. */
const SHRUBS = [];
export function buildShrub(seed = 0) {
  const k = ((seed % 4) + 4) % 4;
  if (SHRUBS[k]) return SHRUBS[k];
  const S = new Soup();
  for (let l = 0; l < 4; l += 1) {
    const a = hash(k, l, 1) * Math.PI * 2;
    const r = 0.28 + 0.2 * hash(k, l, 2);
    const rr = 0.42 + 0.26 * hash(k, l, 3);
    lobe(S, Math.cos(a) * r * (l ? 1 : 0.2), rr * 0.55 + (l ? 0.0 : 0.12), Math.sin(a) * r * (l ? 1 : 0.2),
      rr * 1.15, rr * 0.8, rr * 1.05, k * 7 + l, 0.5, 1.0, 0);
  }
  SHRUBS[k] = S.geometry();
  SHRUBS[k].userData.shared = true;
  return SHRUBS[k];
}

/** Mesh helper for callers: geometry shared across meshes, never disposed by the caller. */
export function meshOf(geo, mat, name) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.ownsGeometry = false;
  m.raycast = () => {};
  if (name) m.name = name;
  return m;
}
