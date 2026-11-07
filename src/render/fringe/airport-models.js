// Airport ground kit: hotel, multi-storey car park, jet bridge, ground-support vehicles.
//
// Pure geometry builders: no scene access, no globals, no randomness (the same arguments give
// byte-identical buffers). Every model returns `{ [materialKey]: BufferGeometry }`: one merged, indexed
// geometry per airport material (`mats[materialKey]` in airport.js) with `position`, `normal` and
// `color`. The colour is a baked occlusion multiplier around 1.0 (undersides, creases at the foot of a
// wall and under overhangs are darker); the call site clones each material once with `vertexColors`.
// Dimensions are real metres, y = 0 is the ground the model stands on.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const cl01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const sm = (t) => { const c = cl01(t); return c * c * (3 - 2 * c); };

const BOX_FACES = [
  ['pz', [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [0, 0, 1]],
  ['nz', [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], [0, 0, -1]],
  ['px', [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], [1, 0, 0]],
  ['nx', [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], [-1, 0, 0]],
  ['py', [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]], [0, 1, 0]],
  ['ny', [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]], [0, -1, 0]],
];

/**
 * Accumulates faces per material key. Every emitted face is wound to match its stated outward
 * normal, so callers never think about winding. Occlusion is baked per vertex from the final y.
 */
export class Mesher {
  constructor({ ground = 0, footH = 1.8, foot = 0.62, underK = 0.52 } = {}) {
    this.bufs = new Map();
    this.ground = ground;
    this.footH = footH;
    this.foot = foot;
    this.underK = underK;
    this.mat = new THREE.Matrix4();
    this.nmat = new THREE.Matrix3();
    this.stack = [];
  }

  /** Run `fn` with the next parts placed by `matrix` (applied after any enclosing placement). */
  within(matrix, fn) {
    this.stack.push([this.mat, this.nmat]);
    this.mat = this.mat.clone().multiply(matrix);
    this.nmat = new THREE.Matrix3().getNormalMatrix(this.mat);
    fn();
    [this.mat, this.nmat] = this.stack.pop();
    return this;
  }

  /** Translate, then yaw about y. */
  at(x, y, z, ry, fn) {
    const m = new THREE.Matrix4().makeTranslation(x, y, z);
    if (ry) m.multiply(new THREE.Matrix4().makeRotationY(ry));
    return this.within(m, fn);
  }

  buf(key) {
    let b = this.bufs.get(key);
    if (!b) { b = { pos: [], nor: [], col: [], idx: [] }; this.bufs.set(key, b); }
    return b;
  }

  footF(y) { return this.foot + (1 - this.foot) * sm((y - this.ground) / this.footH); }

  shade(y, ny, o) {
    const k = o.k ?? 1;
    if (ny > 0.65) return k * (o.kTop ?? 1);
    if (ny < -0.65) return k * this.underK * (o.kBot ?? 1) * (o.noFoot ? 1 : 0.55 + 0.45 * this.footF(y));
    let f = o.noFoot ? 1 : this.footF(y);
    if (o.hd) {
      const h = o.hdH ?? 1.0;
      f *= 1 - o.hd * sm((y - (o.hdY - h)) / h);
    }
    return k * f;
  }

  /** Planar convex polygon, `pts` in the current frame, `n` its outward normal in that frame. */
  face(key, pts, n, o = {}) {
    const nrm = new THREE.Vector3(n[0], n[1], n[2]).applyMatrix3(this.nmat).normalize();
    this.emit(key, pts, pts.map(() => nrm), o);
  }

  /** Convex polygon with a normal per vertex (curved surfaces). */
  faceS(key, pts, ns, o = {}) {
    this.emit(key, pts, ns.map((n) => new THREE.Vector3(n[0], n[1], n[2]).applyMatrix3(this.nmat).normalize()), o);
  }

  emit(key, pts, ns, o) {
    const b = this.buf(key);
    const P = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(this.mat));
    const avg = new THREE.Vector3();
    for (const n of ns) avg.add(n);
    // wind to the stated normal
    let order = P.map((_, i) => i);
    for (let i = 2; i < P.length; i += 1) {
      const g = new THREE.Vector3().subVectors(P[i - 1], P[0]).cross(new THREE.Vector3().subVectors(P[i], P[0]));
      if (g.lengthSq() > 1e-12) {
        if (g.dot(avg) < 0) order = order.reverse();
        break;
      }
    }
    const base = b.pos.length / 3;
    for (const i of order) {
      const p = P[i];
      const n = ns[i];
      const c = this.shade(p.y, n.y, o);
      b.pos.push(p.x, p.y, p.z);
      b.nor.push(n.x, n.y, n.z);
      b.col.push(c, c, c);
    }
    for (let i = 1; i < order.length - 1; i += 1) b.idx.push(base, base + i, base + i + 1);
  }

  /** Axis-aligned (optionally yawed) box, centre x,y,z, size w,h,d. `o.skip` lists hidden faces: 'nz ny py'. */
  box(key, w, h, d, x, y, z, o = {}) {
    const hx = w / 2;
    const hy = h / 2;
    const hz = d / 2;
    const ry = o.ry ?? 0;
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    const skip = o.skip ?? '';
    for (const [tag, corners, nn] of BOX_FACES) {
      if (skip.includes(tag)) continue;
      const pts = corners.map(([a, bb, cc]) => {
        const u = a * hx;
        const t = cc * hz;
        return [x + u * c + t * s, y + bb * hy, z - u * s + t * c];
      });
      this.face(key, pts, [nn[0] * c + nn[2] * s, nn[1], -nn[0] * s + nn[2] * c], o);
    }
    return this;
  }

  /** A flat panel facing +z (a window pane, a sign plate). */
  panel(key, w, h, x, y, z, o = {}) {
    this.face(key, [[x - w / 2, y - h / 2, z], [x + w / 2, y - h / 2, z], [x + w / 2, y + h / 2, z], [x - w / 2, y + h / 2, z]], [0, 0, 1], o);
    return this;
  }

  /** Upright cylinder or frustum, centre x,y,z. `o.caps`: 't', 'b', 'tb' (default), ''. */
  cyl(key, rTop, rBot, h, seg, x, y, z, o = {}) {
    const caps = o.caps ?? 'tb';
    const slope = (rBot - rTop) / h;
    const ring = (r, yy) => Array.from({ length: seg }, (_, i) => { const a = (i / seg) * TAU + (o.phase ?? 0); return [x + r * Math.cos(a), yy, z + r * Math.sin(a)]; });
    const top = ring(rTop, y + h / 2);
    const bot = ring(rBot, y - h / 2);
    for (let i = 0; i < seg; i += 1) {
      const j = (i + 1) % seg;
      const a0 = (i / seg) * TAU + (o.phase ?? 0);
      const a1 = ((i + 1) / seg) * TAU + (o.phase ?? 0);
      this.faceS(key, [bot[i], bot[j], top[j], top[i]], [
        [Math.cos(a0), slope, Math.sin(a0)], [Math.cos(a1), slope, Math.sin(a1)],
        [Math.cos(a1), slope, Math.sin(a1)], [Math.cos(a0), slope, Math.sin(a0)],
      ], o);
    }
    if (rTop > 0 && caps.includes('t')) this.face(key, top, [0, 1, 0], o);
    if (rBot > 0 && caps.includes('b')) this.face(key, bot, [0, -1, 0], o);
    return this;
  }

  /** Cylinder lying along x (`axis` 'x') or z. */
  cylA(axis, key, r, len, seg, x, y, z, o = {}) {
    const m = new THREE.Matrix4().makeTranslation(x, y, z);
    m.multiply(axis === 'x' ? new THREE.Matrix4().makeRotationZ(Math.PI / 2) : new THREE.Matrix4().makeRotationX(Math.PI / 2));
    this.within(m, () => this.cyl(key, r, o.rEnd ?? r, len, seg, 0, 0, 0, { ...o, phase: (o.phase ?? 0) + Math.PI / seg }));
    return this;
  }

  /**
   * Prism: the polygon `pts` ([u, v]) swept along the third axis from -depth/2 to +depth/2. Edges where the
   * outline turns by less than `o.crease` degrees (38) share a smooth normal, so a rounded outline shades round.
   * `o.caps` is 'pn' (both ends, default), 'p', 'n' or ''.
   */
  extrude(key, pts, depth, o = {}) {
    let P = pts.map((p) => [p[0], p[1]]);
    let area = 0;
    for (let i = 0; i < P.length; i += 1) { const q = P[(i + 1) % P.length]; area += P[i][0] * q[1] - q[0] * P[i][1]; }
    if (area < 0) P = P.reverse();
    const n = P.length;
    const hz = depth / 2;
    const en = P.map((p, i) => {
      const q = P[(i + 1) % n];
      const du = q[0] - p[0];
      const dv = q[1] - p[1];
      const L = Math.hypot(du, dv) || 1;
      return [dv / L, -du / L];
    });
    const cosC = Math.cos(((o.crease ?? 38) * Math.PI) / 180);
    const blend = (a, b) => {
      if (a[0] * b[0] + a[1] * b[1] > cosC) { const x = a[0] + b[0]; const y = a[1] + b[1]; const L = Math.hypot(x, y) || 1; return [x / L, y / L]; }
      return a;
    };
    for (let i = 0; i < n; i += 1) {
      const p = P[i];
      const q = P[(i + 1) % n];
      const e0 = en[(i + n - 1) % n];
      const e1 = en[i];
      const e2 = en[(i + 1) % n];
      const nA = blend(e1, e0);
      const nB = blend(e1, e2);
      this.faceS(key, [[p[0], p[1], -hz], [q[0], q[1], -hz], [q[0], q[1], hz], [p[0], p[1], hz]],
        [[nA[0], nA[1], 0], [nB[0], nB[1], 0], [nB[0], nB[1], 0], [nA[0], nA[1], 0]], o);
    }
    const caps = o.caps ?? 'pn';
    if (caps) {
      const tris = THREE.ShapeUtils.triangulateShape(P.map((p) => new THREE.Vector2(p[0], p[1])), []);
      for (const [a, b, c] of tris) {
        if (caps.includes('p')) this.face(key, [[P[a][0], P[a][1], hz], [P[b][0], P[b][1], hz], [P[c][0], P[c][1], hz]], [0, 0, 1], o);
        if (caps.includes('n')) this.face(key, [[P[a][0], P[a][1], -hz], [P[b][0], P[b][1], -hz], [P[c][0], P[c][1], -hz]], [0, 0, -1], o);
      }
    }
    return this;
  }

  /** A plan polygon ([x, z]) extruded upward from y0 to y1. */
  prism(key, ring, y0, y1, o = {}) {
    const m = new THREE.Matrix4().makeTranslation(0, (y0 + y1) / 2, 0).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    this.within(m, () => this.extrude(key, ring.map(([x, z]) => [x, -z]), y1 - y0, { ...o, caps: o.caps ?? 'pn' }));
    return this;
  }

  geometries() {
    const out = {};
    for (const [key, b] of this.bufs) {
      if (!b.idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.setIndex(b.idx);
      g.computeBoundingBox();
      g.computeBoundingSphere();
      out[key] = g;
    }
    return out;
  }
}

/** Circular arc points (x, y) from angle a0 to a1 (radians), `n` segments, inclusive. */
function arc(cx, cy, r, a0, a1, n) {
  return Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
}

/* ------------------------------------------------------------------------------------------------ *
 * Hotel
 * ------------------------------------------------------------------------------------------------ */

/** Geometry constants shared with the call site (sign lettering, forecourt shade). Origin: tower centre, ground. */
export const HOTEL = Object.freeze({
  W: 14.0, D: 9.5, FLOOR: 2.9, FLOORS: 4,
  PW: 18.4, PZ0: -5.4, PZ1: 6.4, H0: 4.2, H1: 7.2,
  TOP: 7.2 + 2.9 * 4,
  CAN_X: 12.8, CAN_Z0: 6.4, CAN_Z1: 11.9, CAN_COL_Z: 11.0, FASCIA_Y: 3.7, FASCIA_H: 1.4,
  SIGN: Object.freeze({ x: -2.0, y: 7.2 + 2.9 * 4 + 1.1, zFace: 5.13, w: 7.6, h: 1.9 }),
});

/**
 * Two-storey glazed podium with a porte-cochere, a four-floor room block with recessed windows and
 * spandrels, a deep roof cornice, a parapet sign band and a roof of plant. About 3.6k triangles.
 */
export function hotelModel() {
  const m = new Mesher({ ground: 0, footH: 2.6, foot: 0.58 });
  const { W: TW, D: TD, FLOOR: F, FLOORS: NF, PW, PZ0, PZ1, H0, H1, TOP } = HOTEL;
  const PD = PZ1 - PZ0;
  const PCZ = (PZ0 + PZ1) / 2;

  /* plinth and podium shell */
  m.box('stoneDark', PW + 0.5, 0.45, PD + 0.5, 0, 0.225, PCZ, { skip: 'ny py' });
  m.box('hotelWall', PW - 0.5, H1 - 0.7, PD - 0.5, 0, (H1 - 0.25 + 0.45) / 2, PCZ, { skip: 'ny py' });
  m.box('hotelSlab', PW, 0.25, PD, 0, H1 - 0.125, PCZ, { skip: 'ny', kBot: 0.9 });

  /* podium front: lobby glazing between corner piers, deep transom beam, glazed function floor */
  for (const s of [-1, 1]) {
    m.box('hotelWall', 1.1, H0 - 0.45, 0.7, s * (PW / 2 - 0.55), (H0 + 0.45) / 2, PZ1 - 0.35, { skip: 'ny py nz' });
    m.box('hotelWall', 1.0, 1.6, 0.42, s * (PW / 2 - 0.5), 6.0, PZ1 - 0.21, { skip: 'ny py nz' });
  }
  m.panel('hotelGlass', 16.2, 3.25, 0, 2.225, PZ1 - 0.45, { k: 0.9 });
  m.box('hotelFrame', 16.2, 0.35, 0.6, 0, 4.0, PZ1 - 0.32, { skip: 'nz py', hd: 0.3, hdY: 4.2, hdH: 0.6 });
  for (let i = 0; i <= 12; i += 1) {
    const x = -8.1 + i * 1.35;
    if (Math.abs(x) < 2.1) continue;
    m.box('hotelFrame', 0.09, 3.25, 0.12, x, 2.225, PZ1 - 0.4, { skip: 'nz ny py' });
  }
  m.box('hotelFrame', 16.2, 0.09, 0.14, 0, 3.1, PZ1 - 0.4, { skip: 'nz ny py' });
  m.box('hotelSlab', PW + 0.3, 1.0, 0.5, 0, H0 + 0.5, PZ1 - 0.15, { skip: 'nz py', hd: 0.0 });
  m.panel('hotelGlass', 16.8, 1.6, 0, 6.0, PZ1 - 0.36, { k: 0.85 });
  for (let i = 0; i <= 12; i += 1) m.box('hotelFrame', 0.08, 1.6, 0.1, -8.4 + i * 1.4, 6.0, PZ1 - 0.3, { skip: 'nz ny py' });
  m.box('hotelSlab', PW + 0.3, 0.4, 0.45, 0, 7.0, PZ1 - 0.2, { skip: 'nz py' });

  /* podium sides and back: punched windows in a concrete wall, sill and head cast proud */
  const punched = (cx, cy, w, h, depthAxis) => {
    // `depthAxis` is the wall's outward normal as a yaw: 0 front, PI back, +PI/2 right, -PI/2 left
    m.at(cx[0], cy, cx[1], depthAxis, () => {
      m.panel('hotelGlass', w, h, 0, 0, 0.03, { k: 0.85 });
      m.box('hotelSlab', w + 0.3, 0.12, 0.2, 0, -h / 2 - 0.06, 0.08, { skip: 'nz ny' });
      m.box('hotelSlab', w + 0.3, 0.12, 0.2, 0, h / 2 + 0.06, 0.08, { skip: 'nz py', hd: 0 });
    });
  };
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k += 1) punched([s * PW / 2, PZ0 + 1.9 + k * 2.9], 6.0, 1.4, 1.1, s * Math.PI / 2);
    for (let k = 0; k < 2; k += 1) punched([s * PW / 2, PZ0 + 3.2 + k * 5.2], 2.4, 0.9, 0.7, s * Math.PI / 2);
  }
  for (let k = 0; k < 6; k += 1) punched([-7.4 + k * 3.0, PZ0], 6.0, 1.9, 1.1, Math.PI);
  m.box('dark', 3.4, 3.0, 0.08, 5.6, 1.95, PZ0 - 0.04, { skip: 'pz' });
  m.box('hotelSlab', 3.9, 0.2, 0.5, 5.6, 3.55, PZ0 - 0.1, { skip: 'pz ny' });
  for (let i = 0; i < 6; i += 1) m.box('hotelFrame', 3.2, 0.06, 0.06, 5.6, 1.1 + i * 0.4, PZ0 - 0.1, { skip: 'pz' });
  m.box('tPlant', 2.4, 1.3, 0.5, -5.8, 0.85 + 0.0, PZ0 - 0.25, {});

  /* podium roof terrace: parapet, planters, a plant unit */
  m.box('hotelSlab', PW + 0.1, 1.0, 0.3, 0, H1 + 0.5, PZ1 - 0.2, { skip: 'ny' });
  m.box('hotelSlab', PW + 0.1, 1.0, 0.3, 0, H1 + 0.5, PZ0 + 0.15, { skip: 'ny' });
  for (const s of [-1, 1]) m.box('hotelSlab', 0.3, 1.0, PD - 0.3, s * (PW / 2 - 0.1), H1 + 0.5, PCZ, { skip: 'ny' });
  for (const x of [-6.2, -2.1, 2.1, 6.2]) {
    m.box('hotelFrame', 2.6, 0.55, 0.85, x, H1 + 0.275, 5.45, { skip: 'ny' });
    m.box('hedge', 2.4, 0.5, 0.7, x, H1 + 0.8, 5.45, { skip: 'ny', noFoot: true });
  }
  m.box('metal', 1.9, 0.95, 1.3, 7.6, H1 + 0.475, -3.4, { skip: 'ny' });
  m.cyl('dark', 0.5, 0.5, 0.1, 10, 7.6, H1 + 1.0, -3.4, { caps: 't', noFoot: true });

  /* the room block: inner wall, then per floor a spandrel, a head band, piers and recessed glazing */
  m.box('hotelFrame', TW - 0.6, TOP - H1, TD - 0.6, 0, (H1 + TOP) / 2, 0, { skip: 'ny py' });
  const face = (Wd, bays, yaw, ox, oz) => m.at(ox, 0, oz, yaw, () => {
    const pitch = Wd / bays;
    for (let k = 0; k < NF; k += 1) {
      const y0 = H1 + k * F;
      const top = k === NF - 1;
      m.box('hotelSlab', Wd, 0.95, 0.4, 0, y0 + 0.475, -0.12, { skip: 'nz ny' });
      m.box('hotelFrame', Wd, 0.32, 0.3, 0, y0 + F - 0.16, -0.15, { skip: 'nz py', hd: top ? 0.35 : 0, hdY: y0 + F, hdH: 0.7 });
      for (let i = 0; i <= bays; i += 1) {
        const u = i === 0 ? -Wd / 2 + 0.45 : i === bays ? Wd / 2 - 0.45 : -Wd / 2 + i * pitch;
        m.box('hotelWall', 0.9, F - 1.27, 0.3, u, y0 + 0.95 + (F - 1.27) / 2, -0.15, { skip: 'nz ny py', hd: top ? 0.3 : 0, hdY: y0 + F, hdH: 0.9 });
      }
      for (let i = 0; i < bays; i += 1) {
        const u = -Wd / 2 + (i + 0.5) * pitch;
        m.panel('hotelGlass', pitch - 0.9, F - 1.27, u, y0 + 0.95 + (F - 1.27) / 2, -0.27, { k: 0.9 });
        m.box('hotelFrame', 0.07, F - 1.27, 0.1, u, y0 + 0.95 + (F - 1.27) / 2, -0.22, { skip: 'nz ny py' });
      }
    }
  });
  face(TW, 4, 0, 0, TD / 2);
  face(TW, 4, Math.PI, 0, -TD / 2);
  face(TD, 3, Math.PI / 2, TW / 2, 0);
  face(TD, 3, -Math.PI / 2, -TW / 2, 0);

  /* roof: deep cornice, parapet, sign band, plant, lift overrun, chillers, mast */
  m.box('hotelSlab', TW + 0.9, 0.5, TD + 0.9, 0, TOP - 0.25, 0, { kBot: 0.95 });
  const pz = TD / 2 + 0.45 - 0.25;
  m.box('hotelSlab', TW + 0.4, 0.9, 0.3, 0, TOP + 0.45, pz, { skip: 'ny' });
  m.box('hotelSlab', TW + 0.4, 0.9, 0.3, 0, TOP + 0.45, -pz, { skip: 'ny' });
  for (const s of [-1, 1]) m.box('hotelSlab', 0.3, 0.9, TD + 0.4, s * (TW / 2 + 0.25), TOP + 0.45, 0, { skip: 'ny' });
  m.box('hotelSlab', HOTEL.SIGN.w + 0.5, 2.4, 0.34, HOTEL.SIGN.x, TOP + 1.2, pz + 0.0, { skip: 'ny' });
  m.box('board', HOTEL.SIGN.w, HOTEL.SIGN.h, 0.05, HOTEL.SIGN.x, HOTEL.SIGN.y, HOTEL.SIGN.zFace - 0.025, { skip: 'nz ny py nx px' });
  m.box('hotelSlab', HOTEL.SIGN.w + 0.5, 0.12, 0.42, HOTEL.SIGN.x, TOP + 2.46, pz, { skip: 'ny' });
  // plant enclosure with louvres
  m.box('tPlant', 5.6, 2.2, 3.6, -3.4, TOP + 1.1, -1.6, { skip: 'ny' });
  for (let i = 0; i < 8; i += 1) {
    m.box('tFrame', 5.0, 0.08, 0.14, -3.4, TOP + 0.35 + i * 0.24, 0.24, { skip: 'nz ny' });
    m.box('tFrame', 0.14, 0.08, 3.0, -0.62, TOP + 0.35 + i * 0.24, -1.6, { skip: 'nx ny' });
  }
  m.box('steel', 5.9, 0.14, 3.9, -3.4, TOP + 2.27, -1.6, { skip: 'ny' });
  // lift overrun
  m.box('hotelWall', 3.2, 2.8, 3.0, 3.0, TOP + 1.4, -1.8, { skip: 'ny' });
  m.box('hotelSlab', 3.6, 0.22, 3.4, 3.0, TOP + 2.91, -1.8, { skip: 'ny' });
  m.box('dark', 1.0, 2.0, 0.06, 3.0, TOP + 1.0, -0.27, { skip: 'nz' });
  // chillers
  for (const [x, z] of [[5.6, -2.4], [5.6, 0.3]]) {
    m.box('metal', 1.6, 1.1, 1.9, x, TOP + 0.55, z, { skip: 'ny' });
    m.cyl('dark', 0.55, 0.55, 0.1, 10, x, TOP + 1.14, z, { caps: 't', noFoot: true });
    for (let i = 0; i < 3; i += 1) m.box('steel', 0.04, 0.5, 1.7, x - 0.81, TOP + 0.4, z - 0.0, { skip: 'nx', ry: 0 });
  }
  // mast
  m.cyl('rail', 0.05, 0.06, 2.4, 6, -6.0, TOP + 1.2, 3.0, { caps: 't' });
  m.box('rail', 1.0, 0.05, 0.05, -6.0, TOP + 1.9, 3.0, {});
  m.box('red', 0.2, 0.2, 0.2, -6.0, TOP + 2.5, 3.0, { noFoot: true });
  m.box('stoneDark', 0.5, 0.3, 0.5, -6.0, TOP + 0.15, 3.0, { skip: 'ny' });

  /* porte-cochere: deep fascia beam, slab, round columns on plinths */
  const { CAN_X, CAN_Z0, CAN_Z1, CAN_COL_Z, FASCIA_Y, FASCIA_H } = HOTEL;
  const cd = CAN_Z1 - CAN_Z0;
  m.box('hotelSlab', CAN_X, 0.38, cd, 0, 4.2 - 0.19, (CAN_Z0 + CAN_Z1) / 2, { skip: 'nz', kBot: 0.9 });
  m.box('hotelSlab', CAN_X, FASCIA_H, 0.4, 0, FASCIA_Y + FASCIA_H / 2 - 0.3 + 0.3, CAN_Z1 - 0.2, { skip: 'nz' });
  m.box('tRoof', CAN_X - 0.3, 0.06, cd - 0.4, 0, 4.23 + 0.0, (CAN_Z0 + CAN_Z1) / 2 - 0.1, { skip: 'ny' });
  m.box('board', 6.2, 0.95, 0.05, 0, FASCIA_Y + FASCIA_H / 2, CAN_Z1 + 0.025, { skip: 'nz ny py nx px' });
  for (const x of [-5.6, -1.9, 1.9, 5.6]) {
    m.cyl('hotelWall', 0.26, 0.26, 3.5, 10, x, 0.3 + 1.75, CAN_COL_Z, { caps: '' });
    m.cyl('stoneDark', 0.36, 0.4, 0.3, 10, x, 0.45, CAN_COL_Z, { caps: 't' });
    m.box('hotelSlab', 0.66, 0.16, 0.66, x, 3.92, CAN_COL_Z, { skip: 'py' });
  }
  for (let i = 0; i < 4; i += 1) m.box('lampGlass', 0.45, 0.04, 0.45, -4.8 + i * 3.2, 3.76, CAN_Z0 + 2.9, { skip: 'py nx px nz pz', noFoot: true });
  return m.geometries();
}

/** The entrance doors: a revolving drum between swing doors, in the recessed lobby bay. */
export function hotelDoorModel() {
  const m = new Mesher({ ground: 0, footH: 1.2, foot: 0.75 });
  const z = HOTEL.PZ1 - 1.0;
  m.cyl('glass', 1.25, 1.25, 2.5, 14, 0, 0.45 + 1.25, z, { caps: '', noFoot: true });
  m.cyl('dark', 1.32, 1.32, 0.14, 14, 0, 0.45 + 2.57, z, { caps: 'tb' });
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI + Math.PI / 4;
    m.box('dark', 2.4, 2.4, 0.06, 0, 0.45 + 1.25, z, { ry: a, skip: '' });
  }
  for (const s of [-1, 1]) {
    m.box('dark', 0.1, 2.9, 0.1, s * 3.55, 0.45 + 1.45, HOTEL.PZ1 - 0.45, { skip: 'ny' });
    m.box('dark', 0.1, 2.9, 0.1, s * 1.9, 0.45 + 1.45, HOTEL.PZ1 - 0.45, { skip: 'ny' });
    m.box('dark', 1.7, 0.1, 0.1, s * 2.72, 0.45 + 2.9, HOTEL.PZ1 - 0.45, { skip: 'ny' });
    m.box('dark', 0.05, 0.5, 0.05, s * 2.05, 0.45 + 1.2, HOTEL.PZ1 - 0.5, {});
  }
  return m.geometries();
}

/* ------------------------------------------------------------------------------------------------ *
 * Multi-storey car park
 * ------------------------------------------------------------------------------------------------ */

/** Positions the call site needs to stand cars and dress the top deck: surface height at x on level i. */
export function carParkLevels({ w = 30, decks = 3, slope = 0.04 } = {}) {
  const BASE = 1.35;
  const FLOOR = 3.0;
  return { slope, surface: (i, x) => BASE + FLOOR * i + slope * (w / 2 - x), top: BASE + FLOOR * decks };
}

/**
 * Open-deck car park with ramped floors: every deck falls 7% toward the +x entry end, so the slab edges read as
 * parallel diagonals. Columns on a 5 m grid, slab edge beams under 1.1 m spandrel upstands with a coping, two
 * stair-and-lift cores on the rear face, a solid base with vent slots and a cut for the entry ramp, light poles
 * and bay lines on the roof deck. Local origin: footprint centre at ground. Front (the road) is +z.
 */
export function carParkModel({ w = 30, d = 15, decks = 3, slope = 0.04 } = {}) {
  const m = new Mesher({ ground: 0, footH: 1.6, foot: 0.6 });
  const SLAB = 0.34;
  const UP = 1.1;
  const { surface: S, top } = carParkLevels({ w, decks, slope });
  const entryX = w / 2 - 4.5;
  const entryHalf = 2.8;
  const rampBack = d / 2 - 7.0;
  const rampFront = d / 2 + 0.7;
  const gap = [entryX - entryHalf, entryX + entryHalf];
  // a sloping band: polygon (x, y) between xa..xb, from yLo(x) to yHi(x), extruded across z0..z1
  const band = (key, xa, xb, lo, hi, z0, z1, o = {}) => m.at(0, 0, (z0 + z1) / 2, 0, () => m.extrude(key, [[xa, lo(xa)], [xb, lo(xb)], [xb, hi(xb)], [xa, hi(xa)]], z1 - z0, o));
  // x ranges of the front edge, with the ramp opening cut on the lowest deck
  const frontRuns = (i) => (i === 0 ? [[-w / 2, gap[0]], [gap[1], w / 2]] : [[-w / 2, w / 2]]);

  /* base podium: a solid wedge under the lowest deck, cut for the entry ramp, with vent slots */
  const baseTop = (x) => S(0, x) - SLAB;
  band('stoneDark', -w / 2 - 0.25, w / 2 + 0.25, () => 0, baseTop, -d / 2 - 0.25, rampBack, { noFoot: false });
  for (const [a, b] of [[-w / 2 - 0.25, gap[0]], [gap[1], w / 2 + 0.25]]) band('stoneDark', a, b, () => 0, baseTop, rampBack, d / 2 + 0.25, {});
  for (let k = 0; k < 8; k += 1) {
    const x = -w / 2 + 1.8 + k * ((w - 3.6) / 7);
    if (x > gap[0] - 1.3 && x < gap[1] + 1.3) continue;
    m.box('dark', 1.0, 0.3, 0.05, x, 0.45, d / 2 + 0.27, { skip: 'nz ny py nx px', noFoot: true });
  }
  /* entry ramp: a fill wedge with kerbs */
  const yRamp = S(0, entryX);
  m.at(entryX, 0, 0, -Math.PI / 2, () => m.extrude('asphalt', [[rampFront, 0], [rampBack, 0], [rampBack, yRamp], [rampFront, 0.025]], entryHalf * 2, {}));
  for (const s of [-1, 1]) {
    m.at(entryX + s * (entryHalf + 0.17), 0, 0, -Math.PI / 2, () => m.extrude('stoneDark', [[rampFront, 0], [rampBack, 0], [rampBack, yRamp + 0.3], [rampFront, 0.3]], 0.34, {}));
  }

  /* decks: slab, edge beams below, spandrel upstands and coping above */
  for (let i = 0; i <= decks; i += 1) {
    const lo = (x) => S(i, x) - SLAB;
    const hi = (x) => S(i, x);
    if (i === 0) {
      band('concrete', -w / 2, w / 2, lo, hi, -d / 2, rampBack, { noFoot: true, kBot: 0.85 });
      for (const [a, b] of [[-w / 2, gap[0]], [gap[1], w / 2]]) band('concrete', a, b, lo, hi, rampBack, d / 2, { noFoot: true, kBot: 0.85 });
    } else {
      band('concrete', -w / 2, w / 2, lo, hi, -d / 2, d / 2, { noFoot: true, kBot: 0.8 });
    }
    // edge beams under the slab on the two long faces and the ends
    const beam = (x) => S(i, x) - SLAB - 0.3;
    for (const [a, b] of frontRuns(i)) band('stoneDark', a, b, beam, lo, d / 2 - 0.3, d / 2, { noFoot: true, k: 0.95 });
    band('stoneDark', -w / 2, w / 2, beam, lo, -d / 2, -d / 2 + 0.3, { noFoot: true, k: 0.95 });
    for (const s of [-1, 1]) m.box('stoneDark', 0.3, 0.3, d - 0.6, s * (w / 2 - 0.15), S(i, s * w / 2) - SLAB - 0.15, 0, { skip: 'py', noFoot: true, k: 0.92 });
    // upstands and copings
    for (const [a, b] of frontRuns(i)) {
      band('stone', a, b, hi, (x) => S(i, x) + UP, d / 2 - 0.25, d / 2, { noFoot: true });
      band('rail', a, b, (x) => S(i, x) + UP, (x) => S(i, x) + UP + 0.1, d / 2 - 0.32, d / 2 + 0.03, { noFoot: true });
    }
    band('stone', -w / 2, w / 2, hi, (x) => S(i, x) + UP, -d / 2, -d / 2 + 0.25, { noFoot: true });
    band('rail', -w / 2, w / 2, (x) => S(i, x) + UP, (x) => S(i, x) + UP + 0.1, -d / 2 - 0.03, -d / 2 + 0.32, { noFoot: true });
    for (const s of [-1, 1]) {
      const xe = s * (w / 2 - 0.125);
      m.box('stone', 0.25, UP, d - 0.5, xe, S(i, s * w / 2) + UP / 2, 0, { skip: 'ny', noFoot: true });
      m.box('rail', 0.34, 0.1, d + 0.06, s * (w / 2 - 0.17), S(i, s * w / 2) + UP + 0.05, 0, { skip: 'ny', noFoot: true });
    }
  }

  /* the rear wall inside each open level: a dark ground behind the columns so the slots between decks read as openings */
  for (let i = 0; i < decks; i += 1) {
    band('dark', -w / 2 + 0.25, w / 2 - 0.25, (x) => S(i, x) + UP, (x) => S(i + 1, x) - SLAB - 0.3, -d / 2 + 0.25, -d / 2 + 0.4, { noFoot: true, k: 0.9 });
  }

  /* columns on a ~5 m grid down both long faces, through every deck */
  const n = Math.round((w - 1.6) / 5) + 1;
  for (let c = 0; c < n; c += 1) {
    const x = -w / 2 + 0.8 + (c * (w - 1.6)) / (n - 1);
    for (const sz of [-1, 1]) {
      if (sz === 1 && x > gap[0] - 0.9 && x < gap[1] + 0.9) continue;
      const y0 = S(0, x) - 0.02;
      const y1 = S(decks, x) - SLAB;
      m.box('stoneDark', 0.55, y1 - y0, 0.55, x, (y0 + y1) / 2, sz * (d / 2 - 0.85), { skip: 'ny py', noFoot: true, k: 0.94 });
    }
  }
  if (true) { // portal posts either side of the ramp opening
    for (const s of [-1, 1]) m.box('stoneDark', 0.55, S(0, entryX) + 0.6, 0.55, entryX + s * (entryHalf + 0.6), (S(0, entryX) + 0.6) / 2, d / 2 - 0.5, { skip: 'ny py', k: 0.9 });
  }

  /* the two cores: stairs and lift behind the rear upstand, slit windows and a door on every level */
  const core = (xc) => {
    const zc = -d / 2 + 1.7;
    const ytop = S(decks, xc) + 2.2;
    m.box('stone', 4.0, ytop, 3.4, xc, ytop / 2, zc, { skip: 'ny py' });
    m.box('concrete', 4.3, 0.22, 3.7, xc, ytop + 0.11, zc, { skip: 'ny', kBot: 0.9 });
    m.box('stoneDark', 2.2, 0.8, 1.8, xc - 0.4, ytop + 0.22 + 0.4, zc - 0.5, { skip: 'ny' });
    m.box('concrete', 2.5, 0.14, 2.1, xc - 0.4, ytop + 0.22 + 0.87, zc - 0.5, { skip: 'ny' });
    for (let i = 0; i <= decks; i += 1) {
      const y = S(i, xc);
      m.panel('dark', 1.4, 2.1, xc + 0.8, y + 1.05, zc + 1.715, { noFoot: true });
      m.panel('dark', 0.55, 1.5, xc - 1.3, y + 1.6, zc + 1.715, { noFoot: true });
      m.box('concrete', 1.7, 0.1, 0.22, xc + 0.8, y + 2.15, zc + 1.78, { skip: 'nz ny' });
    }
    m.panel('dark', 0.6, 1.2, xc, ytop - 0.6, zc + 1.715, { noFoot: true });
  };
  core(-w / 2 + 2.3);
  core(w / 2 - 2.3);

  /* roof deck: bay lines on both rows, four light poles */
  const nrm = [slope / Math.hypot(1, slope), 1 / Math.hypot(1, slope), 0];
  const lineQuad = (x, z0, z1) => {
    const a = x - 0.06;
    const b = x + 0.06;
    m.face('mark', [[a, S(decks, a) + 0.02, z0], [b, S(decks, b) + 0.02, z0], [b, S(decks, b) + 0.02, z1], [a, S(decks, a) + 0.02, z1]], nrm, { noFoot: true });
  };
  const step = 2.6;
  for (let x = -w / 2 + 2.2; x < w / 2 - 1.5; x += step) {
    lineQuad(x, d / 2 - 0.6 - 5.0, d / 2 - 0.6);
    lineQuad(x, -d / 2 + 0.6, -d / 2 + 0.6 + 5.0);
  }
  m.face('mark', [[-w / 2 + 1.0, S(decks, -w / 2 + 1.0) + 0.02, d / 2 - 5.8 - 0.06], [w / 2 - 1.0, S(decks, w / 2 - 1.0) + 0.02, d / 2 - 5.8 - 0.06],
    [w / 2 - 1.0, S(decks, w / 2 - 1.0) + 0.02, d / 2 - 5.8 + 0.06], [-w / 2 + 1.0, S(decks, -w / 2 + 1.0) + 0.02, d / 2 - 5.8 + 0.06]], nrm, { noFoot: true });
  for (const [px, sz] of [[-w / 4, 1], [w / 4, 1], [-w / 4, -1], [w / 4, -1]]) {
    const pz = sz * (d / 2 - 0.65);
    const y = S(decks, px);
    m.box('dark', 0.34, 0.12, 0.34, px, y + 0.06, pz, { skip: 'ny', noFoot: true });
    m.cyl('steel', 0.06, 0.09, 3.4, 7, px, y + 1.7, pz, { caps: 't', noFoot: true });
    m.box('steel', 0.08, 0.08, 1.0, px, y + 3.36, pz - sz * 0.5, { noFoot: true });
    m.box('lampGlass', 0.42, 0.08, 0.3, px, y + 3.3, pz - sz * 0.95, { skip: 'py', noFoot: true, k: 1 });
  }
  /* a parking sign at the ramp */
  const sx = entryX + entryHalf + 1.7;
  m.cyl('steel', 0.05, 0.05, 2.8, 6, sx, 1.4, d / 2 + 1.2, { caps: 't' });
  m.box('navy', 1.1, 1.1, 0.05, sx, 2.85, d / 2 + 1.2, { skip: 'nz ny' });
  m.box('white', 0.12, 0.7, 0.03, sx - 0.2, 2.85, d / 2 + 1.24, { noFoot: true });
  m.box('white', 0.4, 0.12, 0.03, sx + 0.0, 3.14, d / 2 + 1.24, { noFoot: true });
  m.box('white', 0.4, 0.12, 0.03, sx + 0.0, 2.84, d / 2 + 1.24, { noFoot: true });
  m.box('white', 0.12, 0.3, 0.03, sx + 0.2, 2.99, d / 2 + 1.24, { noFoot: true });
  return m.geometries();
}

/* ------------------------------------------------------------------------------------------------ *
 * Jet bridge
 * ------------------------------------------------------------------------------------------------ */

const OCT = (hw, hh, c) => [[-hw + c, -hh], [hw - c, -hh], [hw, -hh + c], [hw, hh - c], [hw - c, hh], [-hw + c, hh], [-hw, hh - c], [-hw, -hh + c]];

/**
 * A passenger bridge: a fixed rotunda against the terminal wall on a column, a two-section telescoping
 * tunnel on the slope, a cab with a docking bellows toward the aircraft, a wheeled bogie under the cab end
 * and an access stair on the outboard flank. x = 0 on the bridge centre line, z is the airport's z (absolute),
 * y = 0 is the apron. `stairSide` is the outboard side (+1 or -1); the bellows face the other way.
 */
export function jetBridgeModel({ zWall, zDock, dockY = 3.6, riseFrom = 4.3, stairSide = 1, vent = false } = {}) {
  const m = new Mesher({ ground: 0, footH: 1.8, foot: 0.62 });
  const dock = -stairSide;
  const R = 1.5;
  const zr = zWall + R;
  const hAt = (z) => riseFrom + ((dockY - riseFrom) * (z - zr)) / (zDock - zr);
  const sl = (dockY - riseFrom) / (zDock - zr);
  const phi = -Math.atan(sl);
  const cabZ0 = zDock - 1.2;
  const cabZ1 = zDock + 1.2;
  const CW = 1.2; // cab half-width: with the bellows the cab stands 0.3 m proud of its flank

  /* rotunda on a column, with a window band, a floor lip and a roof cap */
  const rb = riseFrom - 1.35;
  m.box('concrete', 1.9, 0.3, 1.9, 0, 0.15, zr, { skip: 'ny' });
  m.cyl('steel', 0.5, 0.6, rb - 0.3, 9, 0, 0.3 + (rb - 0.3) / 2, zr, { caps: '' });
  m.cyl('shell', R, R, 2.9, 14, 0, rb + 1.45, zr, { caps: '', hd: 0.25, hdY: rb + 2.9, hdH: 0.6 });
  m.cyl('shellRib', R + 0.06, R + 0.06, 0.22, 14, 0, rb + 0.11, zr, { caps: 'b' });
  m.cyl('glass', R + 0.02, R + 0.02, 0.85, 14, 0, riseFrom + 0.55, zr, { caps: '', noFoot: true });
  m.cyl('fascia', R + 0.16, R + 0.12, 0.2, 14, 0, rb + 3.0, zr, { caps: 't' });
  m.cyl('shellRib', 0.5, 0.7, 0.18, 10, 0, rb + 3.2, zr, { caps: 't' });

  /* tunnel: two telescoping sections along the sloped centre line, a collar at the join */
  const zA0 = zr + 0.4;
  const zEnd = cabZ0 + 0.3;
  const zJoin = zA0 + (zEnd - zA0) * 0.56;
  const section = (z0, z1, hw, hh, key, glassKey) => {
    const zm = (z0 + z1) / 2;
    const len = (z1 - z0) * Math.hypot(1, sl);
    const mat = new THREE.Matrix4().makeTranslation(0, hAt(zm), zm).multiply(new THREE.Matrix4().makeRotationX(phi));
    m.within(mat, () => {
      m.extrude(key, OCT(hw, hh, 0.38), len, { noFoot: true, hd: 0 });
      for (const s of [-1, 1]) {
        m.face(glassKey, [[s * (hw + 0.012), -0.02, -len / 2 + 0.3], [s * (hw + 0.012), -0.02, len / 2 - 0.3], [s * (hw + 0.012), 0.78, len / 2 - 0.3], [s * (hw + 0.012), 0.78, -len / 2 + 0.3]], [s, 0, 0], { noFoot: true });
        const ribs = Math.max(2, Math.round((len - 0.6) / 0.9));
        for (let r = 0; r <= ribs; r += 1) {
          const zz = -len / 2 + 0.3 + (r * (len - 0.6)) / ribs;
          m.box('shellRib', 0.06, 0.86, 0.09, s * (hw + 0.02), 0.38, zz, { skip: 'ny py', noFoot: true });
        }
      }
      m.box('shellRib', hw * 1.1, 0.07, len * 0.96, 0, hh + 0.035, 0, { skip: 'ny', noFoot: true });
    });
  };
  section(zA0, zJoin, 1.25, 1.2, 'shell', 'glass');
  section(zJoin - 0.3, zEnd, 1.1, 1.1, 'fascia', 'glass');
  {
    const mat = new THREE.Matrix4().makeTranslation(0, hAt(zJoin), zJoin).multiply(new THREE.Matrix4().makeRotationX(phi));
    m.within(mat, () => m.extrude('shellRib', OCT(1.33, 1.28, 0.42), 0.2, { noFoot: true }));
  }

  /* cab: chamfered plan, roof lip, windscreen, side lights, bellows toward the aircraft */
  const cy0 = dockY - 1.25;
  const cy1 = dockY + 1.45;
  const ring = (e = 0) => [[-CW - e, cabZ0 - e], [CW + e, cabZ0 - e], [CW + e, cabZ1 - 0.55 + e * 0.4], [CW - 0.55 + e, cabZ1 + e], [-CW + 0.55 - e, cabZ1 + e], [-CW - e, cabZ1 - 0.55 + e * 0.4]];
  m.prism('shell', ring(), cy0, cy1, { noFoot: true, hd: 0.3, hdY: cy1, hdH: 0.5 });
  m.prism('shellRib', ring(0.1), cy1, cy1 + 0.14, { noFoot: true });
  m.prism('dark', ring(-0.04), cy0 - 0.2, cy0 + 0.02, { noFoot: true });
  m.panel('glass', 1.0, 1.1, 0, dockY + 0.45, cabZ1 + 0.012, { noFoot: true });
  for (const s of [-1, 1]) {
    const cx0 = CW - 0.55 + 0.1;
    const cx1 = CW - 0.1;
    m.face('glass', [[s * cx0, dockY - 0.1, cabZ1 - 0.1 + 0.009], [s * cx1, dockY - 0.1, cabZ1 - 0.45 + 0.009], [s * cx1, dockY + 1.0, cabZ1 - 0.45 + 0.009], [s * cx0, dockY + 1.0, cabZ1 - 0.1 + 0.009]], [s * 0.7, 0, 0.7], { noFoot: true });
    if (s !== dock) m.face('glass', [[s * (CW + 0.012), dockY - 0.1, cabZ0 + 0.35], [s * (CW + 0.012), dockY - 0.1, cabZ1 - 0.75], [s * (CW + 0.012), dockY + 1.0, cabZ1 - 0.75], [s * (CW + 0.012), dockY + 1.0, cabZ0 + 0.35]], [s, 0, 0], { noFoot: true });
  }
  m.box('shellRib', 2.5, 0.08, 0.5, 0, dockY + 1.2, cabZ1 + 0.2, { skip: 'ny' });
  m.box('navy', 1.6, 0.4, 0.05, 0, dockY - 0.75, cabZ1 + 0.03, { skip: 'nz ny py' });
  for (let i = 0; i < 3; i += 1) {
    m.cylA('x', i % 2 ? 'shellRib' : 'dark', 0.98 + 0.03 * i, 0.11, 10, dock * (CW + 0.06 + i * 0.1), dockY + 0.2, zDock - 0.1, { caps: i === 2 ? 't' : '', noFoot: true });
  }
  if (vent) {
    m.cyl('chrome', 0.62, 0.66, 0.34, 12, 0, cy1 + 0.31, zDock, { caps: 'tb', noFoot: true });
    m.cyl('cowl', 0.25, 0.55, 0.3, 12, 0, cy1 + 0.63, zDock, { caps: 't', noFoot: true });
  }

  /* bogie: telescoping columns from the tunnel to a wheeled beam */
  const zb = cabZ0 - 0.7;
  const tubeBottom = hAt(zb) - 1.1 - 0.0;
  for (const s of [-1, 1]) {
    m.box('shellRib', 0.3, 0.9, 0.3, s * 0.7, tubeBottom - 0.38, zb, { skip: 'py', noFoot: true });
    m.box('steel', 0.36, tubeBottom - 0.45 - 0.9 + 0.2, 0.36, s * 0.7, (tubeBottom - 0.88 + 0.85) / 2 - 0.0, zb, { skip: 'py', noFoot: false });
  }
  m.box('steel', 2.7, 0.3, 0.52, 0, 0.74, zb, { skip: 'ny' });
  m.box('metal', 0.7, 0.4, 0.6, 0, 1.1, zb, { skip: 'ny' });
  for (const s of [-1, 1]) {
    m.cylA('x', 'tyre', 0.42, 0.36, 10, s * 1.0, 0.42, zb, { noFoot: false });
    m.cylA('x', 'steel', 0.2, 0.4, 8, s * 1.0, 0.42, zb, { noFoot: true });
    m.box('steel', 0.4, 0.06, 0.62, s * 1.0, 0.94, zb, { skip: 'ny' });
  }

  /* outboard stair: twelve treads, two stringers, rail posts and a landing at the rotunda */
  const xs = stairSide * 1.95;
  const zL = zr - 0.3;
  const rise = 0.25;
  const run = 0.26;
  const nT = 12;
  m.box('steel', 1.0, 0.06, 1.0, xs, nT * rise - 0.03, zL - 0.2, { skip: 'ny' });
  m.box('rail', 0.1, 0.06, 0.8, stairSide * 1.52, nT * rise - 0.03, zL - 0.2, { noFoot: true });
  for (let i = 0; i < nT; i += 1) {
    m.box('rail', 0.95, 0.05, 0.3, xs, rise * (i + 1) - 0.025, zL + run * (nT - 1 - i) + run * 0.5 + 0.1, { skip: 'ny' });
  }
  const ang = Math.atan2(rise, run);
  const slen = Math.hypot(nT * rise, nT * run) + 0.05;
  for (const s of [-1, 1]) {
    const mat = new THREE.Matrix4().makeTranslation(xs + s * 0.48, (nT * rise) / 2 + 0.12, zL + (nT * run) / 2 + 0.1).multiply(new THREE.Matrix4().makeRotationX(ang));
    m.within(mat, () => m.box('steel', 0.06, 0.26, slen, 0, 0, 0, { skip: '' }));
  }
  for (let i = 0; i <= 4; i += 1) {
    const t = i / 4;
    const y = nT * rise * (1 - t);
    m.box('rail', 0.05, 0.95, 0.05, xs + stairSide * 0.5, y + 0.475, zL + t * nT * run + 0.1, { skip: 'ny' });
  }
  {
    const mat = new THREE.Matrix4().makeTranslation(xs + stairSide * 0.5, (nT * rise) / 2 + 1.0, zL + (nT * run) / 2 + 0.1).multiply(new THREE.Matrix4().makeRotationX(ang));
    m.within(mat, () => m.box('rail', 0.05, 0.05, slen, 0, 0, 0, { skip: '' }));
  }
  return m.geometries();
}

/* ------------------------------------------------------------------------------------------------ *
 * Ground-support vehicles. Length along x, width along z, y up, origin on the ground at mid-length.
 * ------------------------------------------------------------------------------------------------ */

/** A wheel with its axis along z: tyre, plus a hub disc on each outer face. */
function wheelZ(m, x, y, z, r, w, seg = 10) {
  m.cylA('z', 'tyre', r, w, seg, x, y, z, { noFoot: false });
  for (const s of [-1, 1]) {
    const pts = Array.from({ length: 8 }, (_, i) => [x + r * 0.56 * Math.cos((i / 8) * TAU), y + r * 0.56 * Math.sin((i / 8) * TAU), z + s * (w / 2 + 0.012)]);
    m.face('steel', pts, [0, 0, s], { noFoot: true });
  }
}

/**
 * Pushback tug or baggage tractor. `paint` is the body colour slot (the call site passes the vehicle paint),
 * 'dark' trim, 'tyre', 'steel' hubs and hitch, 'glass', 'yellow' beacon. Cab forward (-x), hitch at +x.
 * variant 'pushback': an enclosed cab with raked windscreen. variant 'baggage': an open driver's seat under a
 * canopy on four posts. Wheels sit in arches cut through the body.
 */
export function tugModel({ variant = 'pushback' } = {}) {
  const m = new Mesher({ ground: 0, footH: 0.9, foot: 0.62 });
  const AR = 0.52;
  const AY = 0.3;
  const wx = [-1.05, 0.95];
  const arcs = wx.map((cx) => arc(cx, AY, AR, Math.PI, 0, 8));
  const body = [[-1.72, 0.3], ...arcs[0], ...arcs[1], [1.72, 0.3], [1.72, 0.92], [1.55, 1.12], [-1.4, 1.12], [-1.72, 0.95]];
  m.extrude('paint', body, 1.86, { crease: 30 });
  // front: bumper, grille, lamps; rear: bumper, counterweight, tow hitch
  m.box('dark', 0.2, 0.3, 1.96, -1.82, 0.44, 0, { skip: 'ny' });
  m.box('dark', 0.04, 0.34, 1.2, -1.745, 0.78, 0, { skip: 'nx ny py' });
  for (const s of [-1, 1]) m.box('lampGlass', 0.05, 0.14, 0.3, -1.745, 0.9, s * 0.66, { skip: 'px', noFoot: true });
  m.box('dark', 0.22, 0.3, 1.96, 1.83, 0.44, 0, { skip: 'ny' });
  m.box('dark', 0.8, 0.2, 1.7, 1.0, 1.22, 0, { skip: 'ny' });
  m.box('steel', 0.5, 0.12, 0.24, 2.1, 0.5, 0, { skip: 'ny' });
  m.cyl('steel', 0.05, 0.05, 0.26, 6, 2.2, 0.52, 0, { caps: 'tb' });
  for (const s of [-1, 1]) {
    m.box('red', 0.04, 0.12, 0.28, 1.945, 0.8, s * 0.7, { skip: 'nx', noFoot: true });
    m.box('dark', 0.5, 0.05, 0.2, -0.45, 0.7, s * 0.97, { skip: 'ny' });
  }
  if (variant === 'pushback') {
    m.extrude('paint', [[-1.4, 1.12], [0.18, 1.12], [0.18, 2.22], [-0.95, 2.22], [-1.4, 1.5]], 1.5, { crease: 30 });
    m.face('glass', [[-1.405, 1.55, -0.62], [-1.405, 1.55, 0.62], [-0.955, 2.16, 0.62], [-0.955, 2.16, -0.62]], [-0.8, 0.59, 0], { noFoot: true });
    for (const s of [-1, 1]) m.face('glass', [[-1.28, 1.58, s * 0.762], [0.08, 1.58, s * 0.762], [0.08, 2.12, s * 0.762], [-0.93, 2.12, s * 0.762]], [0, 0, s], { noFoot: true });
    m.face('glass', [[0.186, 1.56, -0.55], [0.186, 1.56, 0.55], [0.186, 2.12, 0.55], [0.186, 2.12, -0.55]], [1, 0, 0], { noFoot: true });
    m.box('paint', 1.7, 0.07, 1.62, -0.5, 2.255, 0, { skip: 'ny' });
    m.box('yellow', 0.3, 0.16, 0.3, -0.3, 2.37, 0, { skip: 'ny', noFoot: true });
    for (const s of [-1, 1]) {
      m.box('dark', 0.05, 0.05, 0.22, -1.3, 1.9, s * 0.93, { noFoot: true });
      m.box('dark', 0.08, 0.3, 0.16, -1.3, 1.85, s * 1.05, { noFoot: true });
    }
  } else {
    for (const [x, z] of [[-1.05, -0.74], [-1.05, 0.74], [0.65, -0.74], [0.65, 0.74]]) m.box('dark', 0.06, 1.03, 0.06, x, 1.12 + 0.515, z, { skip: 'ny', noFoot: true });
    m.box('paint', 1.9, 0.08, 1.72, -0.2, 2.19, 0, { skip: 'ny' });
    m.box('yellow', 0.3, 0.16, 0.3, -0.3, 2.31, 0, { skip: 'ny', noFoot: true });
    m.face('glass', [[-1.06, 1.35, -0.7], [-1.06, 1.35, 0.7], [-1.06, 2.15, 0.7], [-1.06, 2.15, -0.7]], [-1, 0, 0], { noFoot: true });
    m.box('dark', 0.5, 0.12, 0.8, -0.05, 1.2, 0, { skip: 'ny', noFoot: true });
    m.box('dark', 0.1, 0.55, 0.8, 0.28, 1.5, 0, { skip: 'ny', noFoot: true });
    m.box('dark', 0.05, 0.5, 0.05, -0.75, 1.4, 0, { noFoot: true });
    m.box('dark', 0.34, 0.04, 0.34, -0.8, 1.64, 0, { noFoot: true });
    for (let i = 0; i < 3; i += 1) m.box('dark', 0.5, 0.02, 0.9, -1.0 + i * 0.0, 1.13 + 0.0, 0, { skip: 'ny', noFoot: true });
  }
  for (const x of wx) for (const s of [-1, 1]) wheelZ(m, x, 0.4, s * 0.76, 0.4, 0.34, 10);
  return m.geometries();
}

/** The trailing baggage dolly: deck on a frame, side rails, a bulkhead, bags, four small wheels and an A-frame drawbar. */
export function baggageDollyModel() {
  const m = new Mesher({ ground: 0, footH: 0.8, foot: 0.64 });
  m.box('steel', 3.0, 0.1, 0.12, 0, 0.5, -0.7, { skip: 'ny' });
  m.box('steel', 3.0, 0.1, 0.12, 0, 0.5, 0.7, { skip: 'ny' });
  m.box('dark', 3.0, 0.07, 1.62, 0, 0.58, 0, { skip: 'ny' });
  for (const s of [-1, 1]) {
    m.box('steel', 3.0, 0.06, 0.05, 0, 0.96, s * 0.79, { skip: 'ny' });
    for (const x of [-1.45, 0, 1.45]) m.box('steel', 0.05, 0.36, 0.05, x, 0.79, s * 0.79, { skip: 'ny' });
  }
  m.box('steel', 0.08, 0.9, 1.5, 1.46, 1.03, 0, { skip: 'ny' });
  const bags = [
    ['gseCharcoal', 0.9, 0.42, 0.62, -0.95, 0.83, -0.38], ['gseNavy', 0.8, 0.48, 0.6, -0.95, 0.86, 0.36], ['gseMaroon', 0.7, 0.4, 0.6, -0.1, 0.82, -0.4],
    ['gseSilver', 0.85, 0.5, 0.62, -0.05, 0.87, 0.38], ['gseCharcoal', 0.75, 0.4, 0.62, 0.85, 0.82, -0.38], ['gseNavy', 0.8, 0.44, 0.6, 0.8, 0.84, 0.38],
    ['gseMaroon', 0.6, 0.36, 0.55, -0.9, 1.24, -0.3], ['gseSilver', 0.7, 0.38, 0.55, 0.05, 1.28, 0.34],
  ];
  for (const [key, w, h, d, x, y, z] of bags) m.box(key, w, h, d, x, y, z, { noFoot: true, k: 0.95 });
  for (const x of [-1.05, 1.05]) for (const s of [-1, 1]) {
    wheelZ(m, x, 0.3, s * 0.72, 0.3, 0.2, 8);
    m.box('steel', 0.78, 0.05, 0.3, x, 0.64, s * 0.72, { skip: 'ny' });
  }
  for (const s of [-1, 1]) m.box('steel', 0.95, 0.07, 0.1, -1.95, 0.5, s * 0.27, { ry: -s * 0.3, skip: 'ny' });
  m.box('steel', 0.3, 0.1, 0.2, -2.38, 0.5, 0, { skip: 'ny' });
  return m.geometries();
}

/**
 * Low-floor apron bus: 9 m long, 2.5 m wide, 3.1 m high with a rounded roof, wheel arches cut through the
 * body, wide double doors and a window band on both sides. Front is +x.
 */
export function apronBusModel() {
  const m = new Mesher({ ground: 0, footH: 1.1, foot: 0.64 });
  const AX = [-2.9, 3.1];
  const AYc = 0.5;
  const AR = 0.62;
  const a0 = Math.PI + Math.asin(0.16 / AR);
  const a1 = -Math.asin(0.16 / AR);
  const body = [[-4.48, 0.34], ...arc(AX[0], AYc, AR, a0, a1, 10), ...arc(AX[1], AYc, AR, a0, a1, 10), [4.48, 0.34], [4.55, 0.55], [4.55, 2.3], [4.35, 2.66], [3.9, 2.72],
    [-3.9, 2.72], [-4.35, 2.66], [-4.55, 2.3], [-4.55, 0.55]];
  m.extrude('paint', body, 2.5, { crease: 30 });
  // roof: a shallow lens along the length
  const lens = [[-1.25, 2.72], [1.25, 2.72]];
  for (let k = 1; k <= 8; k += 1) { const z = 1.25 - (2.5 * k) / 9; lens.push([z, 2.72 + 0.17 * (1 - (z / 1.25) ** 2)]); }
  lens.push([0, 2.89]);
  const lensPts = [[-1.25, 2.72]];
  for (let k = 1; k <= 8; k += 1) { const z = -1.25 + (2.5 * k) / 9; lensPts.push([z, 2.72 + 0.17 * (1 - (z / 1.25) ** 2)]); }
  lensPts.push([1.25, 2.72]);
  m.at(0, 0, 0, -Math.PI / 2, () => m.extrude('paint', lensPts, 7.8, { crease: 40 }));
  for (const x of [-1.9, 1.5]) m.box('steel', 1.7, 0.22, 1.3, x, 3.0, 0, { skip: 'ny' });
  // underframe
  m.box('dark', 8.7, 0.2, 2.2, 0, 0.26, 0, { skip: 'py' });
  // windows both sides; doors: two double leaves
  for (const s of [-1, 1]) {
    const z = s * 1.256;
    const win = (x0, x1, y0 = 1.25, y1 = 2.35) => m.face('glass', [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], [0, 0, s], { noFoot: true, k: 0.9 });
    for (const [x0, x1] of [[-4.25, -3.55], [-3.4, -2.2], [-2.05, -1.55], [1.9, 2.7], [2.85, 3.75], [3.9, 4.3]]) win(x0, x1);
    for (const [x0, x1] of [[-1.4, -0.7], [-0.62, 0.05], [0.25, 0.92], [1.0, 1.65]]) win(x0, x1, 0.72, 2.35);
    for (const x of [-1.45, 0.15, 1.7]) m.box('dark', 0.07, 1.7, 0.06, x, 1.55, z, { skip: 'nz ny py', noFoot: true });
    m.box('dark', 3.2, 0.07, 0.06, 0.1, 2.38, z, { skip: 'nz ny py', noFoot: true });
    m.box('steel', 3.0, 0.05, 0.12, 0.1, 0.62, s * 1.28, { skip: 'ny' });
    m.box('dark', 0.05, 0.28, 0.06, -0.33, 1.45, z, { skip: 'nz ny py', noFoot: true });
    m.box('dark', 0.05, 0.28, 0.06, 1.33, 1.45, z, { skip: 'nz ny py', noFoot: true });
    // wheel arch trims: dark flare over each arch
    for (const ax of AX) m.box('dark', 1.35, 0.06, 0.1, ax, 1.14, s * 1.29, { skip: 'ny', noFoot: true });
    wheelZ(m, AX[0], 0.5, s * 1.0, 0.5, 0.42, 10);
    wheelZ(m, AX[1], 0.5, s * 1.0, 0.5, 0.42, 10);
    m.box('lampGlass', 0.05, 0.2, 0.32, 4.575, 0.85, s * 0.95, { skip: 'nx', noFoot: true });
    m.box('red', 0.05, 0.2, 0.3, -4.575, 0.85, s * 0.95, { skip: 'px', noFoot: true });
    m.box('dark', 0.05, 0.3, 0.12, 4.3, 1.9, s * 1.4, { noFoot: true });
    m.box('dark', 0.12, 0.34, 0.08, 4.3, 1.85, s * 1.32, { noFoot: true });
  }
  m.face('glass', [[4.562, 1.1, -1.05], [4.562, 1.1, 1.05], [4.562, 2.4, 1.05], [4.562, 2.4, -1.05]], [1, 0, 0], { noFoot: true, k: 0.9 });
  m.face('glass', [[-4.562, 1.3, -0.9], [-4.562, 1.3, 0.9], [-4.562, 2.35, 0.9], [-4.562, 2.35, -0.9]], [-1, 0, 0], { noFoot: true, k: 0.9 });
  m.box('dark', 0.05, 0.22, 1.5, 4.57, 2.52, 0, { skip: 'nx ny py', noFoot: true });
  m.box('dark', 0.26, 0.4, 2.44, 4.62, 0.52, 0, { skip: 'ny' });
  m.box('dark', 0.26, 0.4, 2.44, -4.62, 0.52, 0, { skip: 'ny' });
  return m.geometries();
}

// @@END
