// Port models: the gable end of the transit shed, forklift, reach stacker, terminal truck, loading arm,
// oil tank, work-boat rigs and the apron worker.
//
// Pure geometry builders: no scene access, no globals, deterministic (the same arguments give byte-identical
// buffers). A `Kit` collects primitives per material key and returns one merged, indexed BufferGeometry per
// key with `position`, `normal`, `uv` and `color`. The colour is a baked occlusion multiplier (undersides and
// the foot of every wall darker), so the call site clones the port's own material with `vertexColors` on
// (`emitKit`) and every colour still comes from the port's paint, which `capPortPaint` caps afterwards.
//
// Frames: every builder works in the frame of the node it is added to (y up from the standing surface,
// forward = +z for vehicles). Dimensions are game metres: the port's plant is the container module's 0.95.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const DOWN_OCC = 0.6;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------ */
/* Kit                                                                  */
/* ------------------------------------------------------------------ */

export class Kit {
  /**
   * @param {object} o  `baseY` the standing surface in kit space; `fade` how high the contact darkening reaches;
   *                    `floor` the occlusion multiplier at the foot (1 = none).
   */
  constructor(name = 'kit', { baseY = 0, fade = 0.9, floor = 0.62 } = {}) {
    this.name = name;
    this.baseY = baseY;
    this.fade = fade;
    this.floor = floor;
    this.m = new THREE.Matrix4();
    this.stack = [];
    this.buckets = new Map();
  }

  /** Enter a local frame (translation, then yaw about y, pitch about x, roll about z). */
  push(x = 0, y = 0, z = 0, { ry = 0, rx = 0, rz = 0 } = {}) {
    this.stack.push(this.m.clone());
    const t = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
      new THREE.Vector3(1, 1, 1),
    );
    this.m.multiply(t);
    return this;
  }

  pop() {
    this.m = this.stack.pop();
    return this;
  }

  _bucket(key) {
    let b = this.buckets.get(key);
    if (!b) {
      b = { pos: [], nor: [], occ: [], idx: [] };
      this.buckets.set(key, b);
    }
    return b;
  }

  _vert(b, p, n, occ) {
    const k = n.y < -0.5 ? DOWN_OCC : 1;
    b.pos.push(p.x, p.y, p.z);
    b.nor.push(n.x, n.y, n.z);
    b.occ.push(occ * k);
    return b.pos.length / 3 - 1;
  }

  /** A triangle that faces the way its vertex normals say, whatever order it was given in. */
  _tri(b, i, j, k) {
    const P = b.pos;
    _a.set(P[j * 3] - P[i * 3], P[j * 3 + 1] - P[i * 3 + 1], P[j * 3 + 2] - P[i * 3 + 2]);
    _b.set(P[k * 3] - P[i * 3], P[k * 3 + 1] - P[i * 3 + 1], P[k * 3 + 2] - P[i * 3 + 2]);
    _c.crossVectors(_a, _b);
    const N = b.nor;
    const dot = _c.x * (N[i * 3] + N[j * 3] + N[k * 3])
      + _c.y * (N[i * 3 + 1] + N[j * 3 + 1] + N[k * 3 + 1])
      + _c.z * (N[i * 3 + 2] + N[j * 3 + 2] + N[k * 3 + 2]);
    if (_c.lengthSq() < 1e-14) return;
    if (dot >= 0) b.idx.push(i, j, k);
    else b.idx.push(i, k, j);
  }

  /** Convex flat polygon in the current frame. `centre` (local) orients it outward; `normal` (local) fixes it. */
  poly(key, pts, { centre = null, normal = null, occ = 1 } = {}) {
    const b = this._bucket(key);
    const P = pts.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2])).applyMatrix4(this.m));
    const n = new THREE.Vector3();
    if (normal) {
      n.copy(normal).transformDirection(this.m);
    } else {
      for (let i = 0; i < P.length; i += 1) {
        const p = P[i];
        const q = P[(i + 1) % P.length];
        n.x += (p.y - q.y) * (p.z + q.z);
        n.y += (p.z - q.z) * (p.x + q.x);
        n.z += (p.x - q.x) * (p.y + q.y);
      }
      n.normalize();
      if (centre) {
        const C = (centre.isVector3 ? centre.clone() : new THREE.Vector3(centre[0], centre[1], centre[2])).applyMatrix4(this.m);
        const mid = new THREE.Vector3();
        for (const p of P) mid.add(p);
        mid.multiplyScalar(1 / P.length).sub(C);
        if (n.dot(mid) < 0) n.negate();
      }
    }
    const ix = P.map((p) => this._vert(b, p, n, occ));
    for (let i = 1; i < ix.length - 1; i += 1) this._tri(b, ix[0], ix[i], ix[i + 1]);
    return this;
  }

  /**
   * Axis-aligned box centred on (cx, cy, cz). `bevel` cuts every edge; `occ` darkens the part (inside of frames).
   * A bevel is 44 triangles against 12, so it goes on the parts that catch the key light.
   */
  box(key, cx, cy, cz, sx, sy, sz, { bevel = 0, occ = 1 } = {}) {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const C = [cx, cy, cz];
    const V = (x, y, z) => [cx + x, cy + y, cz + z];
    // A bevel is a highlight on an edge you can see, so a member under 0.3 m keeps its plain edges.
    const b = Math.min(sx, sy, sz) < 0.3 ? 0 : Math.min(bevel, hx * 0.45, hy * 0.45, hz * 0.45);
    const o = { centre: C, occ };
    const S = [-1, 1];
    if (b < 1e-4) {
      for (const s of S) {
        this.poly(key, [V(s * hx, -hy, -hz), V(s * hx, hy, -hz), V(s * hx, hy, hz), V(s * hx, -hy, hz)], o);
        this.poly(key, [V(-hx, s * hy, -hz), V(hx, s * hy, -hz), V(hx, s * hy, hz), V(-hx, s * hy, hz)], o);
        this.poly(key, [V(-hx, -hy, s * hz), V(hx, -hy, s * hz), V(hx, hy, s * hz), V(-hx, hy, s * hz)], o);
      }
      return this;
    }
    const vx = (ix, iy, iz) => V(ix * hx, iy * (hy - b), iz * (hz - b));
    const vy = (ix, iy, iz) => V(ix * (hx - b), iy * hy, iz * (hz - b));
    const vz = (ix, iy, iz) => V(ix * (hx - b), iy * (hy - b), iz * hz);
    for (const s of S) {
      this.poly(key, [vx(s, -1, -1), vx(s, 1, -1), vx(s, 1, 1), vx(s, -1, 1)], o);
      this.poly(key, [vy(-1, s, -1), vy(1, s, -1), vy(1, s, 1), vy(-1, s, 1)], o);
      this.poly(key, [vz(-1, -1, s), vz(1, -1, s), vz(1, 1, s), vz(-1, 1, s)], o);
    }
    for (const sa of S) {
      for (const sb of S) {
        this.poly(key, [vx(sa, sb, -1), vx(sa, sb, 1), vy(sa, sb, 1), vy(sa, sb, -1)], o);
        this.poly(key, [vx(sa, -1, sb), vx(sa, 1, sb), vz(sa, 1, sb), vz(sa, -1, sb)], o);
        this.poly(key, [vy(-1, sa, sb), vy(1, sa, sb), vz(1, sa, sb), vz(-1, sa, sb)], o);
        for (const sc of S) this.poly(key, [vx(sa, sb, sc), vy(sa, sb, sc), vz(sa, sb, sc)], o);
      }
    }
    return this;
  }

  /** A box whose foot stands on `y0` rather than being centred: the common case for plant. */
  stand(key, cx, y0, cz, sx, sy, sz, o = {}) {
    return this.box(key, cx, y0 + sy / 2, cz, sx, sy, sz, o);
  }

  /**
   * Cylinder or frustum about `axis` ('y' | 'x' | 'z') through (cx, cy, cz), `h` long. Smooth around, hard at the caps.
   */
  cyl(key, cx, cy, cz, rTop, rBot, h, seg = 10, { axis = 'y', caps = true, occ = 1, phase = 0 } = {}) {
    const rot = axis === 'x' ? { rz: -Math.PI / 2 } : axis === 'z' ? { rx: Math.PI / 2 } : {};
    this.push(cx, cy, cz, rot);
    const prof = [];
    if (caps) prof.push([0, -h / 2]);
    prof.push([rBot, -h / 2], [rTop, h / 2]);
    if (caps) prof.push([0, h / 2]);
    this.lathe(key, prof, 0, 0, 0, seg, { occ, phase });
    this.pop();
    return this;
  }

  /**
   * Surface of revolution about local y. `profile` is [radius, y] pairs listed so the surface faces outward when
   * walked from the bottom of the axis, out and up (counter-clockwise in the radius-y plane). Hard edges between
   * profile segments, smooth round the ring.
   */
  lathe(key, profile, cx = 0, cy = 0, cz = 0, seg = 12, { occ = 1, phase = 0 } = {}) {
    const b = this._bucket(key);
    this.push(cx, cy, cz);
    const N = new THREE.Vector3();
    const P = new THREE.Vector3();
    for (let s = 0; s < profile.length - 1; s += 1) {
      const [r0, y0] = profile[s];
      const [r1, y1] = profile[s + 1];
      const dr = r1 - r0;
      const dy = y1 - y0;
      const len = Math.hypot(dr, dy);
      if (len < 1e-6 || (r0 < 1e-6 && r1 < 1e-6)) continue;
      const nr = dy / len;
      const ny = -dr / len;
      const ring0 = [];
      const ring1 = [];
      for (let i = 0; i <= seg; i += 1) {
        const a = phase + (i / seg) * TAU;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        N.set(ca * nr, ny, sa * nr).transformDirection(this.m);
        ring0.push(this._vert(b, P.set(ca * r0, y0, sa * r0).applyMatrix4(this.m), N, occ));
        ring1.push(this._vert(b, P.set(ca * r1, y1, sa * r1).applyMatrix4(this.m), N, occ));
      }
      for (let i = 0; i < seg; i += 1) {
        if (r0 < 1e-6) this._tri(b, ring0[i], ring1[i + 1], ring1[i]);
        else if (r1 < 1e-6) this._tri(b, ring0[i], ring0[i + 1], ring1[i]);
        else {
          this._tri(b, ring0[i], ring0[i + 1], ring1[i + 1]);
          this._tri(b, ring0[i], ring1[i + 1], ring1[i]);
        }
      }
    }
    this.pop();
    return this;
  }

  /**
   * A flat 2D profile extruded along an axis. `pts` are [u, v] pairs: axis 'x' reads (z, y), axis 'z' reads (x, y),
   * axis 'y' reads (x, z). The profile may be concave and may run either way round.
   */
  prism(key, pts, axis, a0, a1, { occ = 1 } = {}) {
    const b = this._bucket(key);
    let poly = pts.map((p) => [p[0], p[1]]);
    let area = 0;
    for (let i = 0; i < poly.length; i += 1) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      area += p[0] * q[1] - q[0] * p[1];
    }
    if (area < 0) poly = poly.reverse();
    const at = (u, v, a) => (axis === 'x' ? new THREE.Vector3(a, v, u) : axis === 'z' ? new THREE.Vector3(u, v, a) : new THREE.Vector3(u, a, v));
    const dirOf = (du, dv) => (axis === 'x' ? new THREE.Vector3(0, dv, du) : axis === 'z' ? new THREE.Vector3(du, dv, 0) : new THREE.Vector3(du, 0, dv));
    for (let i = 0; i < poly.length; i += 1) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const du = q[0] - p[0];
      const dv = q[1] - p[1];
      if (Math.hypot(du, dv) < 1e-6) continue;
      const n = dirOf(dv, -du).normalize();
      this.poly(key, [at(p[0], p[1], a0), at(q[0], q[1], a0), at(q[0], q[1], a1), at(p[0], p[1], a1)], { normal: n, occ });
    }
    const tris = THREE.ShapeUtils.triangulateShape(poly.map((p) => new THREE.Vector2(p[0], p[1])), []);
    const capN = axis === 'x' ? new THREE.Vector3(1, 0, 0) : axis === 'z' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    for (const [capA, capSign] of [[a1, 1], [a0, -1]]) {
      const nn = capN.clone().multiplyScalar(capSign).transformDirection(this.m);
      const ix = poly.map((p) => this._vert(b, at(p[0], p[1], capA).applyMatrix4(this.m), nn, occ));
      for (const t of tris) this._tri(b, ix[t[0]], ix[t[1]], ix[t[2]]);
    }
    return this;
  }

  /** A box between two points, `w` across its local x and `d` across its local z. */
  strut(key, from, to, w, d, { bevel = 0, occ = 1 } = {}) {
    const A = new THREE.Vector3(...from);
    const B = new THREE.Vector3(...to);
    const Y = B.clone().sub(A);
    const len = Y.length();
    if (len < 1e-5) return this;
    Y.divideScalar(len);
    const ref = Math.abs(Y.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const X = new THREE.Vector3().crossVectors(Y, ref).normalize();
    const Z = new THREE.Vector3().crossVectors(X, Y);
    const M = new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(A.clone().add(B).multiplyScalar(0.5));
    this.stack.push(this.m.clone());
    this.m.multiply(M);
    this.box(key, 0, 0, 0, w, len, d, { bevel, occ });
    this.pop();
    return this;
  }

  /**
   * A wheel about the x axis: tyre, rim face and a hub cap on the outer side. `side` is the direction the hub faces.
   */
  wheel(tyreKey, hubKey, cx, cy, cz, R, W, { side = 1, seg = 10, hub = true } = {}) {
    this.push(cx, cy, cz, { rz: -Math.PI / 2 });
    const h = W / 2;
    this.lathe(tyreKey, [[0.6 * R, -h], [R, -0.32 * W], [R, 0.32 * W], [0.6 * R, h]], 0, 0, 0, seg);
    this.pop();
    if (hub) {
      this.push(cx + side * (h - 0.004), cy, cz, { rz: -Math.PI / 2 });
      const prof = [[0.62 * R, 0], [0, side * 0.09 * W]];
      if (side < 0) prof.reverse();
      this.lathe(hubKey, prof, 0, 0, 0, Math.max(7, seg - 2));
      this.pop();
    }
    return this;
  }

  /** Merged geometry per material key, with the baked occlusion as the `color` attribute. */
  geometries() {
    const out = new Map();
    for (const [key, b] of this.buckets) {
      if (!b.idx.length) continue;
      const n = b.pos.length / 3;
      const col = new Float32Array(n * 3);
      const uv = new Float32Array(n * 2);
      for (let i = 0; i < n; i += 1) {
        const y = b.pos[i * 3 + 1];
        const g = this.floor + (1 - this.floor) * smooth(this.baseY, this.baseY + this.fade, y);
        const c = Math.min(1, b.occ[i] * g);
        col[i * 3] = c;
        col[i * 3 + 1] = c;
        col[i * 3 + 2] = c;
        const nx = Math.abs(b.nor[i * 3]);
        const ny = Math.abs(b.nor[i * 3 + 1]);
        const nz = Math.abs(b.nor[i * 3 + 2]);
        const x = b.pos[i * 3];
        const z = b.pos[i * 3 + 2];
        if (ny >= nx && ny >= nz) { uv[i * 2] = x * 0.4; uv[i * 2 + 1] = z * 0.4; }
        else if (nx >= nz) { uv[i * 2] = z * 0.4; uv[i * 2 + 1] = y * 0.4; }
        else { uv[i * 2] = x * 0.4; uv[i * 2 + 1] = y * 0.4; }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(b.idx);
      g.computeBoundingBox();
      g.computeBoundingSphere();
      out.set(key, g);
    }
    return out;
  }

  triangles() {
    let t = 0;
    for (const b of this.buckets.values()) t += b.idx.length / 3;
    return t;
  }
}

/* ------------------------------------------------------------------ */
/* Emitting a kit into the scene graph                                  */
/* ------------------------------------------------------------------ */

const AO_MATERIALS = new WeakMap();

/** The port's material with the baked occlusion switched on. One clone per source material, kept for the process. */
export function occludedMaterial(mat) {
  let m = AO_MATERIALS.get(mat);
  if (!m) {
    m = mat.clone();
    m.vertexColors = true;
    if (mat.name) m.name = mat.name;
    AO_MATERIALS.set(mat, m);
  }
  return m;
}

/**
 * One mesh per material key, added to `group`. `mats[key]` is the port's own material; a missing key falls back to
 * `fallback[key]` and then to `steelDark`, so an unmapped colour is a grey and never an exception.
 */
export function emitKit(group, kit, mats, { name = kit.name, fallback = {}, cast = true, receive = true } = {}) {
  const meshes = [];
  for (const [key, geo] of kit.geometries()) {
    const src = mats[key] ?? mats[fallback[key]] ?? mats.steelDark;
    const mesh = new THREE.Mesh(geo, occludedMaterial(src));
    mesh.name = `${name}:${key}`;
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.raycast = () => {};
    mesh.userData.portModel = name;
    mesh.userData.ownsGeometry = true;
    group.add(mesh);
    meshes.push(mesh);
  }
  return meshes;
}

/* ------------------------------------------------------------------ */
/* Counterbalance forklift                                              */
/* ------------------------------------------------------------------ */

/**
 * A 3 t counterbalance truck, 1.2 m wide, 3.4 m long over the forks, 2.1 m to the top of the guard. +z is forward.
 * The animation addresses `mast-left`, `mast-right` (inner rails, lifted 0.55 per unit) and `fork-left`,
 * `fork-right` (carriage halves with their forks, lifted 1.35 per unit), so those are separate kits.
 */
export function buildForklift() {
  const body = new Kit('forklift', { baseY: 0, fade: 0.7 });
  // Wheels: big drive tyres forward, small steer tyres under the counterweight.
  for (const sx of [-1, 1]) {
    body.wheel('rubber', 'steelPale', sx * 0.44, 0.34, 0.33, 0.34, 0.26, { side: sx, seg: 10 });
    body.wheel('rubber', 'steelPale', sx * 0.4, 0.27, -1.0, 0.27, 0.2, { side: sx, seg: 10 });
  }
  // Chassis between the wheels, then the engine bay and the counterweight that closes the tail.
  body.stand('yellowDark', 0, 0.3, -0.35, 0.82, 0.34, 1.7, { bevel: 0.03 });
  body.stand('yellow', 0, 0.58, 0.05, 1.0, 0.5, 0.78, { bevel: 0.05 });
  // Front fenders over the drive wheels and the floor plate.
  for (const sx of [-1, 1]) {
    body.stand('yellow', sx * 0.46, 0.72, 0.33, 0.3, 0.06, 0.82, { bevel: 0.015 });
    body.stand('yellowDark', sx * 0.5, 0.3, -0.35, 0.06, 0.4, 1.6, { bevel: 0.01 });
  }
  // Counterweight: tail profile in (z, y), a sloped top and a rounded rear.
  body.prism('yellow', [
    [-0.85, 0.34], [-1.38, 0.38], [-1.46, 0.6], [-1.46, 1.0], [-1.34, 1.22], [-1.0, 1.28], [-0.85, 1.28],
  ], 'x', -0.55, 0.55);
  // Seat deck, seat and backrest.
  body.stand('yellowDark', 0, 0.9, -0.52, 0.92, 0.2, 0.9, { bevel: 0.03 });
  body.stand('grease', 0, 1.12, -0.5, 0.5, 0.14, 0.48, { bevel: 0.03 });
  body.push(0, 1.26, -0.76, { rx: -0.12 });
  body.stand('grease', 0, 0, 0, 0.48, 0.5, 0.12, { bevel: 0.03 });
  body.pop();
  // Dash, steering column and wheel.
  body.stand('yellowDark', 0, 0.82, 0.18, 0.7, 0.42, 0.32, { bevel: 0.03 });
  body.push(0, 1.32, 0.12, { rx: -0.55 });
  body.cyl('grease', 0, 0.14, 0, 0.026, 0.026, 0.3, 6);
  body.pop();
  body.push(0, 1.52, 0.0, { rx: -0.55 });
  body.cyl('grease', 0, 0, 0, 0.17, 0.17, 0.03, 12);
  body.pop();
  // Overhead guard: four posts, a plate roof with cross bars.
  for (const [px, pz, y0] of [[-0.46, -0.98, 1.28], [0.46, -0.98, 1.28], [-0.47, 0.3, 1.14], [0.47, 0.3, 1.14]]) {
    body.stand('steelDark', px, y0, pz, 0.07, 2.06 - y0, 0.07);
  }
  body.stand('steelDark', 0, 2.06, -0.34, 1.04, 0.05, 1.42, { bevel: 0.012 });
  for (let i = 0; i < 6; i += 1) body.stand('steelDark', 0, 2.1, -0.95 + i * 0.25, 1.0, 0.04, 0.05);
  for (const sx of [-1, 1]) body.stand('steelDark', sx * 0.5, 2.06, -0.34, 0.05, 0.06, 1.42);
  // Beacon on a stub, tail lamps and a headlamp pair.
  body.cyl('steelDark', 0, 2.12, -0.96, 0.05, 0.07, 0.06, 8);
  body.cyl('beacon', 0, 2.2, -0.96, 0.09, 0.09, 0.14, 8);
  for (const sx of [-1, 1]) {
    body.stand('beacon', sx * 0.4, 0.72, -1.475, 0.18, 0.1, 0.03);
    body.stand('lamp', sx * 0.32, 0.88, 0.58, 0.14, 0.1, 0.06);
  }
  // Tilt cylinders from the chassis to the mast.
  for (const sx of [-1, 1]) {
    body.strut('steelPale', [sx * 0.26, 0.78, 0.22], [sx * 0.26, 1.12, 0.5], 0.07, 0.07);
  }
  // Fixed mast: outer channels with two cross ties.
  for (const sx of [-1, 1]) {
    body.stand('steelDark', sx * 0.26, 0.12, 0.5, 0.14, 1.75, 0.14, { bevel: 0.015 });
    body.stand('steelPale', sx * 0.26, 0.12, 0.4, 0.1, 1.75, 0.04);
  }
  body.stand('steelDark', 0, 0.3, 0.5, 0.52, 0.1, 0.1);
  body.stand('steelDark', 0, 1.78, 0.5, 0.52, 0.1, 0.1);
  // Moving mast rails.
  const mastL = new Kit('forklift-mast-l', { baseY: 0, fade: 0.7 });
  const mastR = new Kit('forklift-mast-r', { baseY: 0, fade: 0.7 });
  mastL.stand('steelPale', -0.26, 0.19, 0.6, 0.11, 1.8, 0.1, { bevel: 0.012 });
  mastR.stand('steelPale', 0.26, 0.19, 0.6, 0.11, 1.8, 0.1, { bevel: 0.012 });
  // Carriage halves with their forks and the load backrest.
  const forkL = new Kit('forklift-fork-l', { baseY: 0, fade: 0.7 });
  const forkR = new Kit('forklift-fork-r', { baseY: 0, fade: 0.7 });
  for (const [k, sx] of [[forkL, -1], [forkR, 1]]) {
    k.stand('steelDark', sx * 0.24, 0.42, 0.7, 0.47, 0.13, 0.07);
    k.stand('steelDark', sx * 0.24, 0.12, 0.7, 0.47, 0.1, 0.07);
    k.stand('steelDark', sx * 0.38, 0.1, 0.7, 0.1, 0.44, 0.05);
    k.stand('steelDark', sx * 0.08, 0.1, 0.7, 0.1, 0.44, 0.05);
    // Fork: a heel standing on the carriage and a blade with a tapered tip.
    k.stand('steelPale', sx * 0.28, 0.095, 0.79, 0.14, 0.12, 0.12, { bevel: 0.01 });
    k.prism('steelPale', [[0.74, 0.095], [1.8, 0.095], [1.95, 0.135], [1.95, 0.17], [1.8, 0.215], [0.74, 0.215]], 'x', sx * 0.28 - 0.07, sx * 0.28 + 0.07);
    // Backrest: two uprights and a rail above the carriage.
    k.stand('steelDark', sx * 0.4, 0.5, 0.69, 0.045, 0.82, 0.05);
    k.stand('steelDark', sx * 0.06, 0.5, 0.69, 0.045, 0.82, 0.05);
    k.stand('steelDark', sx * 0.23, 1.3, 0.69, 0.42, 0.045, 0.05);
  }
  forkL.stand('steelDark', -0.23, 0.9, 0.69, 0.42, 0.045, 0.05);
  forkR.stand('steelDark', 0.23, 0.9, 0.69, 0.42, 0.045, 0.05);
  return { body, mastL, mastR, forkL, forkR };
}

/* ------------------------------------------------------------------ */
/* Reach stacker                                                        */
/* ------------------------------------------------------------------ */

/**
 * A Kalmar-class reach stacker, 4.0 m over the body, wheels 1.43 m. +z is forward, the cab is front left and the
 * boom pivots on the rear right and runs forward. The head of the boom (`head`) is where the spreader hangs, so the
 * caller passes the point the machine has always hung it from and the boom is built to arrive there.
 *
 * @param {{ boomAngle: number, head: {x:number, y:number, z:number}, tineY: number, boxW: number }} p
 */
export function buildReachStacker({ boomAngle, head, tineY, boxW }) {
  const k = new Kit('stacker', { baseY: 0, fade: 1.2 });
  const WR = 0.71;
  const WW = 0.62;
  const WX = 1.72;
  const WZ = 3.09;
  // Wheels, with hub caps.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) k.wheel('rubber', 'steelPale', sx * WX, WR, sz * WZ, WR, WW, { side: sx, seg: 12 });
  }
  // Axle housings and the lower tub.
  for (const sz of [-1, 1]) k.stand('steelDark', 0, 0.45, sz * WZ, 2.6, 0.5, 0.5, { bevel: 0.04 });
  k.stand('yellowDark', 0, 0.95, 0, 2.9, 0.78, 6.7, { bevel: 0.06 });
  // Upper body: central tub, side pods between the wheel arches, and fenders over the wheels.
  k.stand('yellow', 0, 1.65, 0, 3.0, 1.18, 7.0, { bevel: 0.07 });
  for (const sx of [-1, 1]) {
    k.stand('yellow', sx * 1.75, 1.45, 0, 0.55, 1.38, 4.3, { bevel: 0.05 });
    for (const sz of [-1, 1]) {
      k.stand('yellowDark', sx * 1.72, 1.5, sz * 3.09, 0.78, 0.1, 1.8, { bevel: 0.03 });
      k.stand('yellowDark', sx * 1.72, 1.4, sz * 3.09 + sz * 0.95, 0.78, 0.2, 0.12, { bevel: 0.02 });
    }
  }
  // Rear: engine hood with a sloped top and the counterweight block.
  k.prism('yellow', [[-3.5, 2.83], [-3.5, 3.3], [-3.2, 3.42], [-2.1, 3.42], [-1.5, 3.1], [-0.9, 2.83]], 'x', -1.8, 1.8);
  k.stand('yellowDark', 0, 1.65, -3.52, 3.9, 1.4, 0.26, { bevel: 0.04 });
  k.stand('hazard', 0, 1.9, -3.67, 2.6, 0.3, 0.05);
  for (const sx of [-1, 1]) k.stand('beacon', sx * 1.5, 2.45, -3.67, 0.35, 0.18, 0.05);
  // Hood vents and exhaust.
  for (let i = 0; i < 4; i += 1) k.stand('steelDark', -0.6, 3.4, -3.0 + i * 0.32, 1.0, 0.05, 0.1);
  k.cyl('steelDark', -1.3, 3.9, -2.4, 0.1, 0.12, 1.2, 8);
  k.cyl('steelPale', -1.3, 4.52, -2.4, 0.14, 0.1, 0.1, 8);
  // Fuel tank and a step up to the cab on the left side.
  k.cyl('steelDark', -1.98, 1.15, -1.1, 0.34, 0.34, 1.7, 10, { axis: 'z' });
  for (let i = 0; i < 3; i += 1) k.stand('steelPale', -2.15, 1.0 + i * 0.5, 1.3 - i * 0.05, 0.4, 0.05, 0.5);
  k.stand('steelDark', -2.3, 1.0, 1.25, 0.05, 1.7, 0.05);
  // Cab: a raked-front body, glass on the front and both sides, a roof with a lip, light bar and beacon.
  const cb = 3.0;
  const ch = 2.0;
  const cx0 = -1.9;
  const cx1 = -0.34;
  const cxm = (cx0 + cx1) / 2;
  k.stand('yellowDark', cxm, 2.83, 1.97, 1.62, 0.17, 2.24, { bevel: 0.03 });
  k.prism('cladWhite', [[0.92, cb], [3.0, cb], [3.0, cb + 0.7], [2.76, cb + ch], [0.92, cb + ch]], 'x', cx0, cx1);
  // Glass set 2 cm proud of the faces: the raked windscreen, the two doors and the rear window.
  k.poly('glass', [[cx0 + 0.1, cb + 0.78, 2.99], [cx1 - 0.1, cb + 0.78, 2.99], [cx1 - 0.1, cb + ch - 0.1, 2.78], [cx0 + 0.1, cb + ch - 0.1, 2.78]],
    { normal: new THREE.Vector3(0, 0.12, 1) });
  for (const [x, sx] of [[cx0, -1], [cx1, 1]]) k.stand('glass', x + sx * 0.012, cb + 0.62, 1.95, 0.03, ch - 0.82, 1.75);
  k.stand('glass', cxm, cb + 0.7, 0.915, 1.3, ch - 0.9, 0.03);
  k.stand('cladWhite', cxm, cb + ch, 1.9, 1.84, 0.13, 2.7, { bevel: 0.04 });
  k.stand('steelDark', cxm, cb + ch + 0.13, 2.7, 1.2, 0.1, 0.1);
  k.cyl('beacon', cxm, cb + ch + 0.3, 1.5, 0.1, 0.1, 0.16, 8);
  // Pedestal and the boom: pivot on the rear right, built to arrive at the head.
  const px = 0.8;
  const pz = -2.45;
  const sin = Math.sin(boomAngle);
  const cos = Math.cos(boomAngle);
  const dz = head.z - pz;
  // The pivot lies on the line through the head along the boom direction at the pedestal's z.
  const len = dz / cos;
  const py = head.y - len * sin;
  k.stand('yellowDark', px, 2.83, pz, 1.7, py - 2.83 + 0.2, 1.7, { bevel: 0.06 });
  for (const sx of [-1, 1]) k.stand('yellowDark', px + sx * 0.78, py - 0.7, pz, 0.2, 1.4, 1.5, { bevel: 0.03 });
  k.cyl('steelPale', px, py, pz, 0.26, 0.26, 1.82, 10, { axis: 'x' });
  const dir = [0, sin, cos];
  const at = (t, up = 0) => [px, py + dir[1] * t + cos * up, pz + dir[2] * t - sin * up];
  const mainEnd = len * 0.6;
  k.strut('yellow', at(0), at(mainEnd), 1.0, 1.18, { bevel: 0.06 });
  k.strut('yellowPale', at(len * 0.46), at(len - 0.35), 0.78, 0.92, { bevel: 0.05 });
  // Boom head: a sheave block and its cheeks.
  k.push(head.x, head.y, head.z, { rx: -boomAngle });
  k.stand('steelDark', 0, -0.62, -0.1, 1.25, 1.0, 1.2, { bevel: 0.05 });
  k.cyl('steelPale', 0, -0.1, 0.2, 0.5, 0.5, 0.9, 12, { axis: 'x' });
  k.pop();
  // Lift ram from the body to the underside of the main section.
  k.strut('steelPale', [px - 0.25, 2.95, -1.3], at(len * 0.36, -0.75), 0.3, 0.3);
  k.strut('steelDark', [px - 0.25, 2.95, -1.3], at(len * 0.2, -0.45), 0.4, 0.4);
  // The spreader hangs from the head. It is built in the spreader's own frame.
  // Inside the volume the machine's spreader has always swept: a top bar the width of the box plus a headblock's
  // overhang, a hanging arm and a twist-lock foot at each end. The motion sweep reads this as one swept body.
  const sp = new Kit('stacker-spreader', { baseY: -tineY - 1.2, fade: 0.4, floor: 0.8 });
  sp.stand('steelDark', 0, -0.49, 0, boxW * 1.12, 0.46, 0.86, { bevel: 0.04 });
  for (const sx of [-1, 1]) {
    const x = sx * boxW * 0.47;
    sp.stand('steelPale', sx * boxW * 0.5, -0.5, 0, 0.3, 0.44, 0.88);
    sp.stand('yellowDark', x, -tineY + 0.2, 0, 0.4, tineY - 0.69, 0.5, { bevel: 0.03 });
    sp.stand('steelPale', x, -tineY, 0, 0.5, 0.2, 0.62, { bevel: 0.03 });
  }
  return { body: k, spreader: sp, pivot: { x: px, y: py, z: pz }, length: len };
}

/* ------------------------------------------------------------------ */
/* Terminal truck                                                       */
/* ------------------------------------------------------------------ */

/**
 * A cab-over prime mover and a skeletal 40 ft container chassis, 2.4 m wide and 15.7 m long, front at -z. The load
 * (a plain slab the port's container pass dresses) stays with the caller, standing on the twist-lock pads at
 * `bedY`, so this builder leaves its footprint clear.
 */
export function buildTerminalTruck({ boxLen, boxW, bedY }) {
  const k = new Kit('truck', { baseY: 0, fade: 1.0 });
  const R = 0.48;
  const zFront = -8.5;
  const zDrive = -6.45;
  const trailerAxles = [2.3, 3.5, 4.7];
  // Tyres: a front pair, dual drive tyres, three trailer pairs.
  for (const sx of [-1, 1]) {
    k.wheel('rubber', 'steelPale', sx * 1.06, R, zFront, R, 0.3, { side: sx, seg: 8 });
    k.wheel('rubber', 'steelPale', sx * 1.09, R, zDrive, R, 0.26, { side: sx, seg: 8 });
    k.wheel('rubber', 'steelDark', sx * 0.8, R, zDrive, R, 0.26, { side: sx, seg: 8, hub: false });
    for (const z of trailerAxles) k.wheel('rubber', 'steelPale', sx * 1.06, R, z, R, 0.3, { side: sx, seg: 8 });
  }
  // Axles.
  for (const z of [zFront, zDrive, ...trailerAxles]) k.box('steelDark', 0, R, z, 2.0, 0.16, 0.16);
  // Cab-over: side profile in (z, y), extruded across the cab.
  k.prism('cladBlue', [
    [-9.1, 0.95], [-9.1, 1.95], [-8.82, 2.12], [-8.42, 2.82], [-6.7, 2.82], [-6.55, 2.7], [-6.55, 0.95],
  ], 'x', -1.14, 1.14);
  // Windscreen, side glass and a cab skirt, set 2 cm proud of the profile.
  k.poly('glass', [[-0.95, 2.2, -8.802], [0.95, 2.2, -8.802], [0.95, 2.76, -8.482], [-0.95, 2.76, -8.482]], { normal: new THREE.Vector3(0, 0.5, -0.87) });
  for (const sx of [-1, 1]) k.stand('glass', sx * 1.155, 1.92, -7.85, 0.025, 0.74, 1.15);
  k.stand('cladBlue', 0, 0.75, -8.95, 2.3, 0.28, 0.4, { bevel: 0.04 });
  k.stand('steelPale', 0, 0.6, -9.2, 2.42, 0.22, 0.28, { bevel: 0.04 });
  // Grille, headlamps and the cab's rear panel.
  k.stand('steelDark', 0, 1.15, -9.14, 1.3, 0.62, 0.06);
  for (const sx of [-1, 1]) k.stand('lamp', sx * 0.88, 1.35, -9.14, 0.28, 0.2, 0.06);
  k.stand('steelDark', 0, 2.82, -7.7, 2.1, 0.22, 1.0, { bevel: 0.05 });
  k.prism('steelPale', [[-6.55, 2.8], [-6.55, 3.15], [-7.1, 2.82]], 'x', -1.0, 1.0);
  // Cab steps and mirrors.
  for (const sx of [-1, 1]) {
    k.stand('steelPale', sx * 1.0, 0.45, -8.0, 0.42, 0.05, 0.55);
    k.stand('steelPale', sx * 1.0, 0.82, -8.0, 0.42, 0.05, 0.55);
    k.strut('steelDark', [sx * 1.14, 2.35, -8.6], [sx * 1.2, 2.3, -8.7], 0.04, 0.04);
    k.stand('steelDark', sx * 1.22, 1.95, -8.76, 0.06, 0.6, 0.16);
  }
  k.cyl('beacon', 0, 3.03, -7.5, 0.1, 0.1, 0.16, 8);
  // Exhaust stack behind the cab, on the left.
  k.cyl('steelPale', -0.95, 2.1, -6.4, 0.08, 0.08, 2.4, 8);
  // Chassis: two rails from the cab to the rear, cross members, the fifth wheel and the trailer skeleton.
  const frameTop = 1.34;
  for (const sx of [-1, 1]) {
    k.stand('steelDark', sx * 0.62, 0.98, -0.1, 0.2, 0.32, 12.6, { bevel: 0.02 });
    k.stand('steelPale', sx * 0.62, 1.3, -0.1, 0.3, 0.04, 12.4);
    // Tank and toolbox on the tractor's frame.
  }
  k.cyl('steelPale', -0.84, 1.0, -5.3, 0.3, 0.3, 1.5, 10, { axis: 'z' });
  for (let z = -5.6; z <= 5.9; z += 2.3) k.stand('steelDark', 0, 1.0, z, 1.44, 0.2, 0.2);
  k.cyl('steelDark', 0, 1.34, -5.4, 0.52, 0.52, 0.1, 12);
  k.stand('steelPale', 0, 1.36, -5.2, 0.4, 0.06, 0.9);
  // Twist-lock pads under the box's corners and mid-points.
  for (const z of [-boxLen * 0.5 + 0.25, boxLen * 0.5 - 0.25]) {
    for (const sx of [-1, 1]) k.stand('steelPale', sx * (boxW * 0.5 - 0.12), frameTop + 0.04, z, 0.3, bedY - frameTop - 0.04, 0.4, { bevel: 0.015 });
  }
  // Landing legs, mudguards over the trailer wheels, mudflaps, the rear underride bar and the lamps.
  for (const sx of [-1, 1]) {
    k.stand('steelPale', sx * 1.0, 0.12, -3.6, 0.14, 0.9, 0.14);
    k.stand('steelDark', sx * 1.0, 0.04, -3.6, 0.36, 0.08, 0.36);
    k.stand('steelDark', sx * 1.06, 1.12, 3.5, 0.3, 0.07, 3.0);
    k.stand('rubber', sx * 1.12, 0.45, 5.3, 0.04, 0.55, 0.5);
    k.stand('rubber', sx * 1.12, 0.4, -5.85, 0.04, 0.55, 0.5);
    k.stand('steelDark', sx * 0.62, 0.7, -7.7, 0.2, 0.3, 2.8);
    k.stand('beacon', sx * 0.95, 0.85, 6.18, 0.22, 0.12, 0.04);
  }
  k.stand('steelDark', 0, 0.55, 6.1, 2.2, 0.16, 0.14, { bevel: 0.02 });
  for (const sx of [-1, 1]) k.stand('steelDark', sx * 0.9, 0.55, 5.85, 0.1, 0.55, 0.3);
  return { body: k };
}

/* ------------------------------------------------------------------ */
/* Gable end of the transit shed                                        */
/* ------------------------------------------------------------------ */

/**
 * The shed's gable-end assembly, outside the end wall at x = 0 (the wall's outer face) and spanning `dep` across z
 * (centred on z = 0). The wall, its gable infill, the hazard band and the numbered board belong to the port's
 * warehouse; this is what the gable end of that building also carries: the portal-frame columns standing proud of
 * the cladding, a sliding door hung on its track under a loading canopy, the apex louvre, a window band above the
 * number board, a flue up the face, bollards and a plinth.
 *
 * @param {{ dep:number, eaves:number, ridge:number }} p  heights above the standing surface (y = 0)
 */
export function buildShedGable({ dep, eaves, ridge }) {
  const k = new Kit('shed-gable', { baseY: 0, fade: 1.4, floor: 0.55 });
  const hd = dep / 2;
  // Plinth along the foot of the wall, with a drain channel in front of the door.
  k.stand('concreteDark', 0.2, 0, 0, 0.4, 0.3, dep + 0.3, { bevel: 0.05 });
  k.stand('concreteWet', 1.6, 0, 2.4, 1.6, 0.05, 4.2);
  // Portal columns: web and flanges standing proud of the cladding, a base plate, a haunch under the rafter.
  const cx = 0.62;
  const colH = eaves - 0.15;
  for (const sz of [-1, 1]) {
    const z = sz * (hd - 0.34);
    k.stand('steelDark', cx, 0.16, z, 0.14, colH - 0.16, 0.5, { bevel: 0.01 });
    k.stand('steelPale', cx + 0.11, 0.16, z, 0.1, colH - 0.16, 0.5, { bevel: 0.01 });
    k.stand('steelPale', cx - 0.11, 0.16, z, 0.1, colH - 0.16, 0.5, { bevel: 0.01 });
    k.stand('steelDark', cx, 0.0, z, 0.56, 0.16, 0.74, { bevel: 0.03 });
    for (const bz of [-0.27, 0.27]) k.cyl('steelPale', cx, 0.2, z + bz, 0.045, 0.045, 0.09, 6);
    // Brackets tie each column back to the wall at two heights.
    for (const by of [2.2, 5.0]) k.stand('steelDark', cx - 0.3, by, z, 0.6, 0.14, 0.22);
    k.prism('steelPale', [[0, colH], [-sz * 1.2, colH], [0, colH - 0.9]].map(([u, v]) => [z + u, v]), 'x', cx - 0.12, cx + 0.12);
  }
  // Eaves girt across the gable above the columns, standing off the wall on its cleats.
  k.stand('steelDark', cx, eaves - 0.35, 0, 0.2, 0.3, dep - 0.5, { bevel: 0.02 });
  // Apex louvre: a framed panel in the gable triangle with sloped slats.
  const lv = ridge - 1.15;
  k.prism('steelDark', [[-1.1, lv - 0.7], [1.1, lv - 0.7], [0, lv + 0.75]], 'x', 0.0, 0.16);
  for (let i = 0; i < 5; i += 1) {
    const hw = 0.95 * (1 - (i * 0.22 + 0.1) / 1.4);
    k.stand('steelPale', 0.16, lv - 0.55 + i * 0.22, 0, 0.1, 0.12, hw * 2, { bevel: 0.01 });
  }
  // Window band above the number board: three lights in one frame, flush with the wall.
  const wy = Math.min(6.45, eaves - 1.05);
  k.stand('steelPale', 0.05, wy - 0.1, 0, 0.18, 0.12, 7.9);
  k.stand('steelPale', 0.05, wy + 0.86, 0, 0.18, 0.12, 7.9);
  for (let i = 0; i < 3; i += 1) k.stand('glass', 0.03, wy, (i - 1) * 2.6, 0.08, 0.96, 2.3);
  for (let i = 0; i < 4; i += 1) k.stand('steelPale', 0.05, wy - 0.1, (i - 1.5) * 2.6, 0.18, 1.18, 0.14);
  // Sliding door hung off the wall on a top track: a ribbed leaf with a bottom guide.
  const dz = 2.4;
  const dx = 0.58;
  k.stand('steelDark', dx, 0.1, dz, 0.2, 4.4, 3.7, { bevel: 0.02 });
  k.stand('cladBlue', dx + 0.13, 0.14, dz, 0.1, 4.32, 3.56, { bevel: 0.02 });
  for (let i = 0; i < 5; i += 1) k.stand('steelPale', dx + 0.21, 0.2, dz - 1.45 + i * 0.725, 0.06, 4.2, 0.12);
  k.stand('steelPale', dx + 0.2, 2.15, dz, 0.07, 0.14, 3.56);
  k.stand('steelDark', dx - 0.02, 4.55, dz - 0.5, 0.26, 0.22, 6.6, { bevel: 0.02 });
  for (const hz of [-1.5, 0.4, 2.1]) {
    k.stand('steelPale', dx - 0.02, 4.4, dz + hz, 0.14, 0.4, 0.16);
    k.stand('steelDark', 0.3, 4.55, dz + hz, 0.5, 0.2, 0.16);
  }
  k.stand('steelDark', dx, 0.0, dz - 0.5, 0.18, 0.1, 6.6);
  k.stand('steelDark', dx - 0.24, 0.0, dz + 1.9, 0.1, 4.55, 0.16);
  k.stand('steelDark', dx - 0.24, 0.0, dz - 1.9, 0.1, 4.55, 0.16);
  k.stand('lamp', 0.3, 4.9, dz + 2.5, 0.2, 0.2, 0.2, { bevel: 0.03 });
  // Loading canopy over the door: a deep fascia, a sloping soffit and two columns with raked struts.
  const cy = 5.25;
  const cz0 = dz - 2.2;
  const cz1 = dz + 2.2;
  k.prism('steelPale', [[cz0, cy], [cz1, cy], [cz1, cy + 0.2], [cz0, cy + 0.36]], 'x', 0.0, 2.3);
  k.stand('cladBlue', 2.3, cy - 0.05, (cz0 + cz1) / 2, 0.16, 0.5, cz1 - cz0, { bevel: 0.03 });
  for (const z of [cz0 + 0.12, cz1 - 0.12]) {
    k.stand('steelDark', 2.15, 0.0, z, 0.22, cy - 0.05, 0.22, { bevel: 0.02 });
    k.stand('steelDark', 2.15, 0.0, z, 0.5, 0.1, 0.5);
    k.strut('steelDark', [0.5, cy - 1.25, z], [2.05, cy - 0.08, z], 0.14, 0.14);
  }
  // Bollards and a wheel stop on the apron in front of the door.
  for (const z of [dz - 1.6, dz + 1.6]) {
    k.cyl('yellow', 2.9, 0.45, z, 0.1, 0.1, 0.9, 8);
    k.cyl('steelDark', 2.9, 0.05, z, 0.17, 0.17, 0.1, 8);
  }
  // Flue up the gable face with brackets, a rain cap and a cowl: the stack on the ridge line.
  const fz = -hd * 0.64;
  k.cyl('steelWork', 0.62, (ridge + 2.4) / 2, fz, 0.34, 0.38, ridge + 2.4, 12);
  for (const by of [1.4, 4.4, 7.4]) k.stand('steelDark', 0.3, by, fz, 0.7, 0.1, 0.2);
  k.cyl('steelPale', 0.62, ridge + 2.5, fz, 0.5, 0.5, 0.12, 12);
  k.cyl('steelDark', 0.62, ridge + 2.78, fz, 0.0, 0.44, 0.46, 12);
  // Pallet stack and a skip against the foot of the wall, so the wall has a foreground.
  for (let i = 0; i < 4; i += 1) k.stand('rustDark', 1.0, i * 0.18, -hd + 1.4, 1.25, 0.16, 1.1, { bevel: 0.02 });
  k.stand('steelDark', 1.3, 0.0, -hd + 3.0, 1.3, 0.9, 1.9, { bevel: 0.04 });
  k.stand('steelPale', 1.3, 0.9, -hd + 3.0, 1.4, 0.08, 2.0, { bevel: 0.02 });
  return { body: k };
}

/* ------------------------------------------------------------------ */
/* Oil loading arm                                                      */
/* ------------------------------------------------------------------ */

/**
 * A marine loading arm in three frames. The pedestal (frame: the deck at its foot, +z toward the ship) carries
 * the swivel yoke; the inboard limb turns on the yoke's pin at `pedestal` above the deck and runs `inboard` along +z;
 * the outboard limb turns on the inboard's far end and runs `outboard`, ending in a coupling whose lowest point is
 * 1.46 m below its axis (the port aims that point at the manifold). All limbs run along their own +z.
 */
export function buildLoadingArm({ pedestal, inboard, outboard }) {
  const root = new Kit('arm-root', { baseY: 0, fade: 1.2, floor: 0.6 });
  // Base plate, bolts, plinth, slew ring.
  root.stand('steelDark', 0, 0, 0, 2.4, 0.18, 2.4, { bevel: 0.04 });
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU + 0.2;
    root.cyl('steelPale', Math.cos(a) * 0.92, 0.25, Math.sin(a) * 0.92, 0.09, 0.09, 0.14, 6);
  }
  root.cyl('concreteDark', 0, 0.35, 0, 0.8, 0.96, 0.34, 16);
  root.cyl('grease', 0, 0.62, 0, 0.74, 0.74, 0.2, 16);
  root.cyl('steelPale', 0, 0.76, 0, 0.68, 0.68, 0.1, 16);
  // Column: tapered, white, with two red bands and a service platform ring.
  root.lathe('armGloss', [[0.0, 0.8], [0.62, 0.8], [0.5, pedestal - 0.1], [0.0, pedestal - 0.1]], 0, 0, 0, 16);
  for (const f of [0.34, 0.66]) root.cyl('cladRed', 0, pedestal * f + 0.2, 0, 0.58 - f * 0.1, 0.58 - f * 0.1, 0.16, 16, { caps: false });
  root.cyl('steelDark', 0, pedestal - 0.02, 0, 0.62, 0.62, 0.16, 16);
  // Yoke: two cheek plates on the swivel head, carrying the limb's pin.
  for (const sx of [-1, 1]) root.stand('steelDark', sx * 0.46, pedestal - 0.12, 0, 0.14, 0.9, 0.9, { bevel: 0.02 });
  root.cyl('steelPale', 0, pedestal, 0, 0.12, 0.12, 1.1, 8, { axis: 'x' });
  // Riser: a hard-piped line up the quay side into the swivel, with flanges, and the valve and inlet at the foot.
  root.cyl('steelPale', 0.72, 0.28 + (pedestal - 0.5) / 2, -0.55, 0.19, 0.19, pedestal - 0.5, 10);
  for (const y of [0.4, 1.0, 1.6]) root.cyl('cladRed', 0.72, y, -0.55, 0.27, 0.27, 0.1, 10);
  root.strut('steelPale', [0.72, pedestal - 0.22, -0.55], [0.1, pedestal - 0.04, -0.12], 0.19, 0.19);
  root.stand('steelDark', 0.72, 0.0, -1.4, 0.5, 0.62, 0.5, { bevel: 0.04 });
  root.cyl('steelPale', 0.72, 0.5, -0.98, 0.19, 0.19, 0.95, 8, { axis: 'z' });
  root.cyl('cladRed', 0.72, 0.84, -1.4, 0.22, 0.22, 0.05, 10);
  root.cyl('steelDark', 0.72, 0.68, -1.4, 0.04, 0.04, 0.3, 6);
  // Access ladder up the column's back.
  for (const sx of [-1, 1]) root.stand('steelPale', sx * 0.2, 0.2, 0.68, 0.05, pedestal - 0.6, 0.05);
  for (let i = 0; i < 7; i += 1) root.stand('steelPale', 0, 0.45 + i * 0.22, 0.68, 0.4, 0.04, 0.04);

  const inb = new Kit('arm-inboard', { baseY: -1.0, fade: 0.2, floor: 0.9 });
  // Hub on the pin, the limb and its flanged joints.
  inb.cyl('steelPale', 0, 0, 0, 0.4, 0.4, 0.78, 12, { axis: 'x' });
  inb.cyl('grease', 0, 0, 0, 0.46, 0.46, 0.2, 12, { axis: 'x' });
  inb.cyl('armGloss', 0, 0, inboard / 2, 0.25, 0.25, inboard, 10, { axis: 'z' });
  for (const f of [0.38, 0.72]) inb.cyl('cladRed', 0, 0, inboard * f, 0.3, 0.3, 0.22, 10, { axis: 'z' });
  inb.cyl('steelPale', 0, 0, inboard - 0.2, 0.34, 0.34, 0.4, 10, { axis: 'x' });
  // Counterweight on a tail frame behind the pin, with a lifting eye.
  inb.stand('steelDark', 0, -0.45, -1.2, 0.9, 0.9, 1.7, { bevel: 0.06 });
  inb.stand('cladRed', 0, 0.46, -1.2, 0.5, 0.06, 0.9);
  for (const sx of [-1, 1]) inb.strut('steelDark', [sx * 0.2, 0, -0.3], [sx * 0.3, -0.1, -0.5], 0.14, 0.14);
  // King post over the pin, a stay to the limb and a stay to the counterweight.
  inb.strut('steelPale', [0, 0.2, 0.9], [0, 1.15, 0.9], 0.16, 0.16);
  inb.strut('steelDark', [0, 1.15, 0.9], [0, 0.22, inboard * 0.55], 0.09, 0.09);
  inb.strut('steelDark', [0, 1.15, 0.9], [0, 0.46, -1.5], 0.09, 0.09);
  // Balance cylinder under the limb.
  inb.strut('steelPale', [0.38, -0.22, 0.4], [0.38, -0.1, inboard * 0.45], 0.2, 0.2);

  const out = new Kit('arm-outboard', { baseY: -1.5, fade: 0.2, floor: 0.9 });
  out.cyl('steelPale', 0, 0, 0, 0.42, 0.42, 0.55, 10, { axis: 'x' });
  out.cyl('grease', 0, 0, 0, 0.5, 0.5, 0.18, 10, { axis: 'x' });
  out.cyl('armGloss', 0, 0, outboard / 2, 0.21, 0.21, outboard, 10, { axis: 'z' });
  out.cyl('cladRed', 0, 0, outboard * 0.45, 0.28, 0.28, 0.2, 10, { axis: 'z' });
  // Small counterweight at the knuckle so the limb balances on it.
  out.stand('steelDark', 0, -0.3, -0.7, 0.5, 0.5, 0.7, { bevel: 0.04 });
  // Swivel at the tip, a hard drop and the coupling: lowest point 1.46 m under the axis.
  out.cyl('cladRed', 0, -0.15, outboard, 0.34, 0.34, 0.16, 10);
  out.cyl('steelPale', 0, -0.78, outboard, 0.2, 0.2, 1.1, 8);
  out.cyl('steelDark', 0, -1.36, outboard, 0.26, 0.31, 0.2, 10);
  return { root, inboard: inb, outboard: out };
}

/* ------------------------------------------------------------------ */
/* Oil storage tank                                                     */
/* ------------------------------------------------------------------ */

/**
 * A fixed-roof storage tank of radius `r` and shell height `h`, standing on its ring wall at y = 0: five welded
 * courses with their laps, a toe band, a wind girder with a walkway, a rolled top rim, a coned roof with rafters
 * and a vent, a spiral stair to the roof, the shell nozzles and a drain pipe.
 */
export function buildOilTank({ r, h }) {
  const k = new Kit('oil-tank', { baseY: 0, fade: 1.6, floor: 0.6 });
  const y0 = 0.34;
  const top = y0 + h;
  k.cyl('concreteDark', 0, 0.2, 0, r + 0.35, r + 0.45, 0.4, 20);
  // Courses, bottom to top, each a little smaller than the one below, with a lap ring at each joint.
  const n = 5;
  const hc = h / n;
  for (let i = 0; i < n; i += 1) {
    const rr = r - i * 0.03;
    const key = i === 0 ? 'rustDark' : 'tank';
    k.cyl(key, 0, y0 + hc * (i + 0.5), 0, rr, rr, hc, 20, { caps: false });
    if (i > 0) k.cyl('steelPale', 0, y0 + hc * i, 0, rr + 0.045, rr + 0.045, 0.09, 20, { caps: false });
  }
  k.cyl('tankBand', 0, y0 + h * 0.62, 0, r - 0.05, r - 0.05, 0.55, 20, { caps: false });
  // Wind girder: a walkway ring with a rail.
  const gy = y0 + h * 0.78;
  k.lathe('steelPale', [[r - 0.1, gy - 0.1], [r + 0.62, gy - 0.1], [r + 0.62, gy], [r - 0.1, gy]], 0, 0, 0, 20);
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * TAU + 0.31;
    k.stand('steelPale', Math.cos(a) * (r + 0.58), gy, Math.sin(a) * (r + 0.58), 0.06, 1.0, 0.06);
  }
  k.cyl('steelPale', 0, gy + 0.95, 0, r + 0.6, r + 0.6, 0.06, 20, { caps: false });
  // Vertical shell stiffeners from the toe to the girder.
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * TAU + 0.11;
    k.stand('tankWeld', Math.cos(a) * (r + 0.05), y0 + 1.0, Math.sin(a) * (r + 0.05), 0.15, gy - y0 - 1.0, 0.12);
  }
  // Rolled top rim and the roof: a cone with rafters, a crown and the vent.
  k.cyl('steelPale', 0, top + 0.06, 0, r + 0.16, r + 0.16, 0.2, 20, { caps: false });
  k.cyl('tankWeld', 0, top + 0.2, 0, r + 0.1, r + 0.1, 0.1, 20, { caps: false });
  const rise = r * 0.14;
  k.lathe('tank', [[r - 0.05, top + 0.24], [0, top + 0.24 + rise]], 0, 0, 0, 20);
  k.cyl('steelPale', 0, top + 0.24 + rise, 0, r * 0.2, r * 0.2, 0.26, 12);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU + 0.19;
    k.push(0, 0, 0, { ry: -a });
    k.strut('tankWeld', [r * 0.2, top + 0.3 + rise * 0.8, 0], [r - 0.1, top + 0.3, 0], 0.16, 0.06);
    k.pop();
  }
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU;
    k.stand('steelPale', Math.cos(a) * (r + 0.08), top + 0.26, Math.sin(a) * (r + 0.08), 0.06, 0.9, 0.06);
  }
  k.cyl('steelPale', 0, top + 1.15, 0, r + 0.1, r + 0.1, 0.06, 20, { caps: false });
  // Vent: a flange, a stand pipe and a gooseneck with a screened hood.
  k.cyl('steelPale', 0, top + 0.5 + rise, 0, 0.26, 0.26, 0.1, 10);
  k.cyl('steelDark', 0, top + 0.82 + rise, 0, 0.18, 0.18, 0.6, 8);
  k.strut('steelDark', [0, top + 1.1 + rise, 0], [0.42, top + 1.22 + rise, 0], 0.18, 0.18);
  k.cyl('steelDark', 0.42, top + 1.05 + rise, 0, 0.18, 0.18, 0.34, 8);
  k.cyl('steelPale', 0.42, top + 0.85 + rise, 0, 0.24, 0.29, 0.18, 10);
  // Spiral stair: a stringer wound three quarters of the way round, with a rail and posts, to a roof landing.
  const sr = r + 0.62;
  const steps = 18;
  const a0 = 2.35;
  const sweep = 4.7;
  const yS0 = y0 + 0.2;
  const yS1 = top + 0.28;
  const at = (i, up = 0) => {
    const t = i / steps;
    const a = a0 + sweep * t;
    return [Math.cos(a) * sr, yS0 + (yS1 - yS0) * t + up, Math.sin(a) * sr];
  };
  for (let i = 0; i < steps; i += 1) {
    k.strut('concrete', at(i), at(i + 1), 0.8, 0.1);
    k.strut('steelPale', at(i, 1.0), at(i + 1, 1.0), 0.06, 0.06);
    if (i % 2 === 0) k.stand('steelPale', at(i)[0] * (sr + 0.38) / sr, at(i)[1], at(i)[2] * (sr + 0.38) / sr, 0.06, 1.0, 0.06);
  }
  // Nozzle manifold at the toe: two valves, a blind flange and the pipe that leaves the bund.
  const nz = r + 0.42;
  k.cyl('steelPale', 0, 0.5, nz + 1.3, 0.13, 0.13, 2.6, 8, { axis: 'z' });
  for (const dx of [-0.55, 0.55]) {
    k.cyl('steelPale', dx, 0.62, nz, 0.16, 0.16, 1.0, 8);
    k.cyl('cladRed', dx, 1.14, nz, 0.26, 0.26, 0.07, 10, { axis: 'z' });
    k.cyl('steelDark', dx, 1.14, nz + 0.16, 0.05, 0.05, 0.3, 6, { axis: 'z' });
  }
  // A foam chamber on the shell under the rim and a drain on the far side.
  k.stand('cladRed', r - 0.12, top - 0.8, 0, 0.36, 0.7, 0.4, { bevel: 0.03 });
  k.cyl('steelPale', -r - 0.22, 0.45, 0, 0.1, 0.1, 0.9, 8);
  k.cyl('concreteWet', 0, 0.13, 0, r + 0.9, r + 1.2, 0.03, 20);
  return { body: k };
}

/* ------------------------------------------------------------------ */
/* Work boat rig                                                        */
/* ------------------------------------------------------------------ */

/**
 * Everything a small work boat carries above its hull, in the boat's own frame (bow at +x, y absolute): the
 * wheelhouse with a raked front and a window ribbon, a rubbing strake along each side, rail stanchions standing
 * on the bulwark, cleats and a bitt, a foredeck hatch and winch, and, when asked, the stern A-frame.
 *
 * @param {object} p  `L`, `B`, `scale`; `deck` the deck height; `bulwark` the bulwark height; `sheerY(t)`, `xAt(t, v)`,
 *                    `hbAtX(x, v)` from the hull's grid; `aframe`; `kind` 'tender' | 'punt'
 */
export function buildWorkBoatRig({ L, B, scale, deck, bulwark, sheerY, xAt, hbAtX, aframe = false, kind = 'tender' }) {
  const k = new Kit(`boat-${kind}`, { baseY: deck - 0.3, fade: 0.5, floor: 0.8 });
  const s = scale;
  const houseX = L * 0.2;
  const houseL = L * 0.24;
  const houseW = B * 0.7;
  const houseH = 1.62 * s;
  const y0 = deck + 0.04;
  // Wheelhouse: side profile with a raked front, glass on the three faces, a roof with a lip.
  const fwd = houseL / 2;
  k.prism('cladWhite', [
    [houseX - fwd, y0], [houseX + fwd, y0], [houseX + fwd - 0.12 * s, y0 + houseH * 0.46], [houseX + fwd - 0.34 * s, y0 + houseH],
    [houseX - fwd, y0 + houseH],
  ].map(([u, v]) => [u, v]), 'z', -houseW / 2, houseW / 2);
  for (const sz of [-1, 1]) k.stand('glass', houseX - 0.05, y0 + houseH * 0.4, sz * (houseW / 2 + 0.012), houseL * 0.72, houseH * 0.44, 0.03);
  k.poly('glass', [
    [houseX + fwd - 0.12 * s + 0.02, y0 + houseH * 0.5, -houseW * 0.42],
    [houseX + fwd - 0.12 * s + 0.02, y0 + houseH * 0.5, houseW * 0.42],
    [houseX + fwd - 0.34 * s + 0.02, y0 + houseH * 0.92, houseW * 0.42],
    [houseX + fwd - 0.34 * s + 0.02, y0 + houseH * 0.92, -houseW * 0.42],
  ], { normal: new THREE.Vector3(0.9, 0.4, 0) });
  k.stand('cladWhite', houseX, y0 + houseH, 0, houseL + 0.36, 0.12, houseW + 0.3, { bevel: 0.02 });
  k.stand('steelDark', houseX - fwd * 0.6, y0 + houseH + 0.12, 0, 0.5, 0.18, 0.8);
  // Rubbing strake along each side at the deck line, stepped between the hull stations.
  const stations = 12;
  const tA = 0.1;
  const tB = 0.93;
  const edge = (t) => {
    const x = xAt(t, 1);
    return [x, sheerY(t) + bulwark, hbAtX(x, 1)];
  };
  for (const sz of [-1, 1]) {
    for (let i = 0; i < stations; i += 1) {
      const a = edge(tA + (tB - tA) * (i / stations));
      const b = edge(tA + (tB - tA) * ((i + 1) / stations));
      k.strut('rubber', [a[0], a[1] - 0.18 * s, sz * (a[2] + 0.03)], [b[0], b[1] - 0.18 * s, sz * (b[2] + 0.03)], 0.14, 0.12);
      // Stanchion every other station, standing on the bulwark top, with a top rail between them.
      if (i % 2 === 0 && Math.abs(a[0] - houseX) > houseL * 0.62 + 0.3) {
        k.stand('steelPale', a[0], a[1], sz * (a[2] - 0.1), 0.05, 0.55 * s, 0.05);
        const c = edge(tA + (tB - tA) * ((i + 2) / stations));
        k.strut('steelPale', [a[0], a[1] + 0.55 * s, sz * (a[2] - 0.1)], [c[0], c[1] + 0.55 * s, sz * (c[2] - 0.1)], 0.045, 0.045);
      }
    }
  }
  // Cleats, a towing bitt aft and a foredeck hatch with its winch.
  for (const [cx, cz] of [[L * 0.36, 0.5 * B * 0.3], [L * 0.36, -0.5 * B * 0.3], [-L * 0.36, 0.5 * B * 0.3], [-L * 0.36, -0.5 * B * 0.3]]) {
    k.stand('steelDark', cx, deck + 0.04, cz, 0.3, 0.14, 0.12);
  }
  k.cyl('steelDark', -L * 0.4, deck + 0.35, 0, 0.12, 0.12, 0.7, 8);
  k.stand('steelDark', L * 0.31, deck + 0.04, 0, 0.9, 0.3, 0.8, { bevel: 0.03 });
  k.stand('steelPale', L * 0.31, deck + 0.34, 0, 0.8, 0.05, 0.7);
  k.cyl('steelPale', L * 0.38, deck + 0.25, 0, 0.17, 0.17, 0.42, 8, { axis: 'z' });
  if (kind === 'punt') {
    // Thwarts across the open waist, an engine box aft and a pipe cradle.
    for (const tx of [-L * 0.12, L * 0.0]) k.stand('rustDark', tx, deck + 0.3, 0, 0.3, 0.07, B * 0.72);
    k.stand('steelDark', -L * 0.34, deck + 0.04, 0, 0.8, 0.6, 0.9, { bevel: 0.03 });
    k.stand('steelPale', -L * 0.34, deck + 0.64, 0, 0.7, 0.05, 0.8);
  }
  if (aframe) {
    // A-frame over the stern: two raked legs standing on pads, a head beam, sheaves and a stay forward.
    const aZ = hbAtX(-L * 0.34, 1) * 0.78;
    const apexY = deck + 4.15 * s;
    const headZ = aZ * 0.62;
    for (const sz of [-1, 1]) {
      k.stand('steelDark', -L * 0.3, deck + 0.04, sz * aZ, 0.7, 0.2, 0.7, { bevel: 0.03 });
      k.strut('orange', [-L * 0.3, deck + 0.24, sz * aZ], [-L * 0.42, apexY, sz * headZ], 0.34, 0.34);
      k.strut('orange', [-L * 0.18, deck + 0.24, sz * aZ * 0.9], [-L * 0.38, apexY - 0.7, sz * headZ * 1.05], 0.16, 0.16);
      k.stand('steelDark', -L * 0.18, deck + 0.04, sz * aZ * 0.9, 0.4, 0.2, 0.4);
    }
    k.stand('orange', -L * 0.42, apexY - 0.34, 0, 0.34, 0.34, headZ * 2.5);
    k.stand('steelDark', -L * 0.42, apexY - 0.84, 0, 0.42, 0.5, 0.42, { bevel: 0.05 });
    k.cyl('steelDark', -L * 0.42, deck + 1.2 * s + 0.23, 0, 0.17, 0.17, 0.46, 8);
  }
  return { body: k };
}

// @@END-OF-PORT-MODELS
