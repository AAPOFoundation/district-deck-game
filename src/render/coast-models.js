// Coast models: the boat shed, beach kiosk, queue figures, volleyball court, esplanade pier and planter shrubs.
//
// Pure geometry builders: no scene access, no globals, no clock; the same arguments give byte-identical buffers.
// Every builder returns merged, indexed BufferGeometry (`position`, `normal`, `uv`, `uv2`, `color`) in real metres.
// `color` is a multiplier around 1.0 (baked occlusion and part tone) on top of the material colour: the call sites
// switch `vertexColors` on for the materials these geometries use. `uv` is a metric box projection (one unit is
// four metres) so library textures keep a believable scale on every face.
//
// Local frames are given per builder; the call sites place the geometry and never rescale it.
import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/* small vector helpers (plain arrays, no allocation of THREE objects)  */
/* ------------------------------------------------------------------ */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const centroid = (pts) => {
  const c = [0, 0, 0];
  for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  return mul(c, 1 / pts.length);
};

/** Linear RGB triple from a hex string (colour management on, as the materials are). */
export function lin(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

/* ------------------------------------------------------------------ */
/* Mesher                                                               */
/* ------------------------------------------------------------------ */
export class Mesher {
  constructor({ uvScale = 0.25 } = {}) {
    this.pos = []; this.nor = []; this.col = []; this.uv = []; this.idx = [];
    this.uvScale = uvScale;
    this.aoCfg = null;
  }

  get triangles() { return this.idx.length / 3; }

  /** Occlusion by height: vertical faces darken towards y0 (to `low`), undersides take `under`, tops stay 1. */
  ao(y0, y1, low = 0.62, under = 0.55) { this.aoCfg = { y0, y1, low, under }; return this; }

  _shade(c, y, ny) {
    const a = this.aoCfg;
    if (!a) return c;
    let k;
    if (ny > 0.7) k = 1;
    else if (ny < -0.7) k = a.under;
    else {
      const t = clamp01((y - a.y0) / Math.max(1e-6, a.y1 - a.y0));
      k = a.low + (1 - a.low) * t * t * (3 - 2 * t);
    }
    return [c[0] * k, c[1] * k, c[2] * k];
  }

  /**
   * One planar convex polygon. `c` is [r,g,b], an array of per-vertex [r,g,b], or fn(x,y,z) -> [r,g,b].
   * `hint` is a direction the face normal must lean towards (faces of convex solids pass "centre to face").
   */
  face(pts, c, hint = null) {
    if (pts.length < 3) return;
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i]; const b = pts[(i + 1) % pts.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) return;
    nx /= l; ny /= l; nz /= l;
    let order = pts.map((_, i) => i);
    if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) {
      order = order.reverse();
      nx = -nx; ny = -ny; nz = -nz;
    }
    const perVertex = Array.isArray(c[0]);
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    const base = this.pos.length / 3;
    for (const i of order) {
      const p = pts[i];
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      let col = typeof c === 'function' ? c(p[0], p[1], p[2]) : perVertex ? c[i] : c;
      col = this._shade(col, p[1], ny);
      this.col.push(col[0], col[1], col[2]);
      const s = this.uvScale;
      if (ax >= ay && ax >= az) this.uv.push(p[2] * s, p[1] * s);
      else if (ay >= az) this.uv.push(p[0] * s, p[2] * s);
      else this.uv.push(p[0] * s, p[1] * s);
    }
    for (let i = 1; i < pts.length - 1; i += 1) this.idx.push(base, base + i, base + i + 1);
  }

  /** Axis-aligned box; `skip` is a string of face tags from 'px nx py ny pz nz'. */
  box(x0, y0, z0, x1, y1, z1, c, skip = '') {
    const f = (tag, pts, hint) => { if (!skip.includes(tag)) this.face(pts, c, hint); };
    f('px', [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0]);
    f('nx', [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], [-1, 0, 0]);
    f('py', [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0]);
    f('ny', [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]);
    f('pz', [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);
    f('nz', [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1]);
  }

  /** Convex solid from vertex list and face index lists; normals lean away from the centroid. `skip` lists face numbers. */
  convex(verts, faces, c, skip = []) {
    const ctr = centroid(verts);
    faces.forEach((fi, n) => {
      if (skip.includes(n)) return;
      const pts = fi.map((i) => verts[i]);
      this.face(pts, c, sub(centroid(pts), ctr));
    });
  }

  /**
   * A square-section member from a to b. `w` is its extent along `wDir` (made perpendicular to the member),
   * `h` the extent along the other cross-section axis. Four long faces; end caps when `caps`.
   */
  beam(a, b, wDir, w, h, c, caps = false) {
    const d = unit(sub(b, a));
    let u = sub(wDir, mul(d, dot(wDir, d)));
    if (len(u) < 1e-6) u = cross(d, [0, 1, 0]);
    u = unit(u);
    const v = unit(cross(d, u));
    const k = (p, su, sv) => add(p, add(mul(u, su * w / 2), mul(v, sv * h / 2)));
    const A = [k(a, -1, -1), k(a, 1, -1), k(a, 1, 1), k(a, -1, 1)];
    const B = [k(b, -1, -1), k(b, 1, -1), k(b, 1, 1), k(b, -1, 1)];
    const ctr = mix(a, b, 0.5);
    for (let i = 0; i < 4; i += 1) {
      const j = (i + 1) % 4;
      const pts = [A[i], A[j], B[j], B[i]];
      this.face(pts, c, sub(centroid(pts), ctr));
    }
    if (caps) {
      this.face(A, c, mul(d, -1));
      this.face(B, c, d);
    }
  }

  /** Vertical frustum: radius r0 at y0, r1 at y0 + h, `seg` flat sides. */
  cyl(cx, y0, cz, r0, r1, h, seg, c, { top = true, bottom = false, rot = 0 } = {}) {
    const ring = (r, y) => Array.from({ length: seg }, (_, i) => {
      const a = rot + (i / seg) * Math.PI * 2;
      return [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
    });
    const A = ring(r0, y0); const B = ring(r1, y0 + h);
    const ctr = [cx, y0 + h / 2, cz];
    for (let i = 0; i < seg; i += 1) {
      const j = (i + 1) % seg;
      const pts = [A[i], A[j], B[j], B[i]];
      this.face(pts, c, sub(centroid(pts), ctr));
    }
    if (top && r1 > 1e-4) this.face(B, c, [0, 1, 0]);
    if (bottom && r0 > 1e-4) this.face(A, c, [0, -1, 0]);
  }

  /**
   * A closed-ring loft with shared vertices and radial (smooth) normals: rings is an array of point arrays of equal
   * length; `c` is fn(x,y,z)->[r,g,b] or a [r,g,b]. Caps are flat fans.
   */
  loft(rings, c, { capStart = false, capEnd = false } = {}) {
    const n = rings[0].length;
    const base = this.pos.length / 3;
    const ctrs = rings.map((r) => centroid(r));
    rings.forEach((ring, ri) => {
      ring.forEach((p) => {
        const nn = unit(sub(p, ctrs[ri]));
        this.pos.push(p[0], p[1], p[2]);
        this.nor.push(nn[0], nn[1], nn[2]);
        let col = typeof c === 'function' ? c(p[0], p[1], p[2]) : c;
        col = this._shade(col, p[1], nn[1] * 0.5);
        this.col.push(col[0], col[1], col[2]);
        const s = this.uvScale;
        this.uv.push((p[0] + p[2]) * s, p[1] * s);
      });
    });
    // winding: test the first quad against the radial normal of its first vertex
    const p00 = rings[0][0]; const p01 = rings[0][1]; const p10 = rings[1][0];
    const gn = cross(sub(p01, p00), sub(p10, p00));
    const flip = dot(gn, sub(p00, ctrs[0])) < 0;
    for (let r = 0; r < rings.length - 1; r += 1) {
      for (let i = 0; i < n; i += 1) {
        const j = (i + 1) % n;
        const a = base + r * n + i; const b = base + r * n + j;
        const cc = base + (r + 1) * n + j; const d = base + (r + 1) * n + i;
        if (flip) this.idx.push(a, d, cc, a, cc, b);
        else this.idx.push(a, b, cc, a, cc, d);
      }
    }
    if (capStart) this.face(rings[0], c, sub(ctrs[0], ctrs[1]));
    if (capEnd) this.face(rings[rings.length - 1], c, sub(ctrs[rings.length - 1], ctrs[rings.length - 2]));
  }

  /** UV sphere (ellipsoid) with shared vertices and smooth normals. */
  ellipsoid(cx, cy, cz, rx, ry, rz, seg, rings, c) {
    const base = this.pos.length / 3;
    const rows = [];
    for (let r = 0; r <= rings; r += 1) {
      const phi = (r / rings) * Math.PI;
      const y = Math.cos(phi); const rr = Math.sin(phi);
      if (r === 0 || r === rings) rows.push([[cx, cy + ry * y, cz]]);
      else rows.push(Array.from({ length: seg }, (_, i) => {
        const a = (i / seg) * Math.PI * 2;
        return [cx + Math.cos(a) * rr * rx, cy + ry * y, cz + Math.sin(a) * rr * rz];
      }));
    }
    for (const row of rows) {
      for (const p of row) {
        const nn = unit([(p[0] - cx) / (rx * rx), (p[1] - cy) / (ry * ry), (p[2] - cz) / (rz * rz)]);
        this.pos.push(p[0], p[1], p[2]);
        this.nor.push(nn[0], nn[1], nn[2]);
        let col = typeof c === 'function' ? c(p[0], p[1], p[2], nn) : c;
        col = this._shade(col, p[1], nn[1] * 0.5);
        this.col.push(col[0], col[1], col[2]);
        const s = this.uvScale;
        this.uv.push((p[0] + p[2]) * s, p[1] * s);
      }
    }
    // vertex ids follow emission order
    let k = base;
    const table = rows.map((row) => row.map(() => k++));
    const north = table[0][0]; const south = table[rings][0];
    for (let i = 0; i < seg; i += 1) {
      const j = (i + 1) % seg;
      this.idx.push(north, table[1][j], table[1][i]);
      for (let r = 1; r < rings - 1; r += 1) {
        const a = table[r][i]; const b = table[r][j]; const cc = table[r + 1][j]; const d = table[r + 1][i];
        this.idx.push(a, b, cc, a, cc, d);
      }
      this.idx.push(south, table[rings - 1][i], table[rings - 1][j]);
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    const uv = new THREE.Float32BufferAttribute(this.uv, 2);
    g.setAttribute('uv', uv);
    g.setAttribute('uv2', uv);
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

/* ------------------------------------------------------------------ */
/* shared tones (multipliers on the material colour)                    */
/* ------------------------------------------------------------------ */
const W = [1, 1, 1];
const TRIM = [1.32, 1.28, 1.16];
const DARK = [0.07, 0.065, 0.06];

/* ------------------------------------------------------------------ */
/* Boat shed                                                            */
/* ------------------------------------------------------------------ */
// Local frame: origin at the shed centre on the ground plane (world y = 0), +x seaward (the door end), +z along the
// shore, y up in world metres. Footprint 10 x 8 m, concrete base to 1.45 m (the esplanade wall top), weatherboard walls
// to a 12.7 degree gable roof with a 0.3 m overhang, sliding door half open on the water gable, and a concrete slipway
// with two timber runners that leaves the esplanade deck edge (local x 7.2) for the sand.
export const BOAT_SHED = Object.freeze({ hx: 5, hz: 4, floorY: 1.45, ridgeY: 4.4, slope: 0.225, slipFrom: 7.2, slipTo: 15.4 });

export function buildBoatShed() {
  const { hx, hz, floorY, ridgeY, slope, slipFrom, slipTo } = BOAT_SHED;
  const roofTop = (z) => ridgeY - slope * Math.abs(z);
  const wallApex = ridgeY - 0.07 + 0.035;               // gable apex: inside the slab thickness
  const wallTop = roofTop(hz) - 0.035;                  // eave wall top: inside the slab thickness
  const hC = 0.3286;                                    // course height; 7 courses make the 2.30 m door
  const doorW = 1.8; const doorTop = floorY + 7 * hC;
  // board boundaries up to `top`; a last course shorter than 12 cm is folded into the one below
  const bounds = (top) => { const b = [floorY]; while (top - b[b.length - 1] > hC + 0.12) b.push(b[b.length - 1] + hC); b.push(top); return b; };
  const db = 0.035;                                     // board lower edge stands this far proud

  const timber = new Mesher().ao(floorY, floorY + 1.1, 0.7, 0.5);
  const roof = new Mesher().ao(3.2, 4.4, 0.85, 0.5);
  const conc = new Mesher().ao(-0.3, 1.45, 0.62, 0.5);

  // --- concrete base, lip, steps-free (the porch would leave the footprint) ---
  const baseC = lin('#ffffff');
  conc.box(-hx, -0.3, -hz, hx, floorY, hz, baseC, 'ny');
  conc.box(-hx - 0.06, 1.34, -hz - 0.06, hx + 0.06, floorY, hz + 0.06, [1.22, 1.22, 1.22], 'ny');
  // panel joints on the landward face and the two sides (dark inset strips)
  for (const zj of [-1.35, 1.35]) conc.box(-hx - 0.012, 0.0, zj - 0.025, -hx + 0.004, 1.32, zj + 0.025, [0.5, 0.5, 0.5], 'ny nx');
  for (const sz of [-1, 1]) {
    conc.box(-2.5 - 0.025, 0.0, sz * (hz + 0.012), -2.5 + 0.025, 1.32, sz * (hz - 0.004), [0.5, 0.5, 0.5], 'ny');
  }

  // --- weatherboard courses ---
  const course = (A, B, n, ylo, yhi, tone) => {
    // A, B: [x, z] on the wall plane (board top edge); n: outward [x, z]; lower edge stands db proud.
    const P = (p, d, y) => [p[0] + n[0] * d, y, p[1] + n[1] * d];
    timber.face([P(A, db, ylo), P(B, db, ylo), P(B, 0, yhi), P(A, 0, yhi)], tone, [n[0], 0.15, n[1]]);
    timber.face([P(A, 0, yhi), P(B, 0, yhi), P(B, db, yhi), P(A, db, yhi)], mul(tone, 0.8), [0, -1, 0]);
  };
  const toneOf = (k) => mul(W, 0.93 + 0.07 * (((k * 5) % 3) / 2));
  // side walls (z = +-hz), eave height
  for (const sz of [-1, 1]) {
    const bs = bounds(wallTop);
    for (let k = 0; k < bs.length - 1; k += 1) {
      const ylo = bs[k]; const yhi = bs[k + 1];
      course([-hx, sz * hz], [hx, sz * hz], [0, sz], ylo, yhi, toneOf(k + (sz > 0 ? 2 : 0)));
    }
  }
  // gable walls (x = +-hx): trapezoid courses clipped to the rake; the water gable has the door gap
  const halfW = (y) => Math.min(hz, (wallApex - y) / slope);
  for (const sx of [-1, 1]) {
    const bs = bounds(wallApex);
    for (let k = 0; k < bs.length - 1; k += 1) {
      const ylo = bs[k]; const yhi = bs[k + 1];
      const wlo = halfW(ylo); const whi = halfW(yhi);
      const tone = toneOf(k + 1 + (sx > 0 ? 1 : 0));
      const P = (z, d, y) => [sx * hx + sx * d, y, z];
      const quad = (zLoLeft, zLoRight, zHiLeft, zHiRight) => {
        timber.face([P(zLoLeft, db, ylo), P(zLoRight, db, ylo), P(zHiRight, 0, yhi), P(zHiLeft, 0, yhi)], tone, [sx, 0.15, 0]);
        timber.face([P(zHiLeft, 0, yhi), P(zHiRight, 0, yhi), P(zHiRight, db, yhi), P(zHiLeft, db, yhi)], mul(tone, 0.8), [0, -1, 0]);
      };
      if (sx > 0 && k < 7) {
        // left and right of the door gap; the wall is a full 4 m half-width below the eave
        quad(-wlo, -doorW, -whi, -doorW);
        quad(doorW, wlo, doorW, whi);
      } else {
        quad(-wlo, wlo, -whi, whi);
      }
    }
  }
  // corner boards
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const xa = sx > 0 ? hx - 0.075 : -hx - 0.06; const xb = sx > 0 ? hx + 0.06 : -hx + 0.075;
    const za = sz > 0 ? hz - 0.075 : -hz - 0.06; const zb = sz > 0 ? hz + 0.06 : -hz + 0.075;
    timber.box(xa, floorY, za, xb, wallTop, zb, TRIM, 'ny py');
  }
  // windows on the side walls: painted frame, raised dark pane, projecting sill
  for (const sz of [-1, 1]) {
    const xc = -2.4; const y0 = floorY + 0.95; const y1 = y0 + 0.8;
    const sk = sz > 0 ? 'nx px nz' : 'nx px pz';
    const zr = (a, b) => (sz > 0 ? [hz + a, hz + b] : [-hz - b, -hz - a]);
    let [za, zb] = zr(0, 0.06);
    timber.box(xc - 0.55, y0 - 0.07, za, xc + 0.55, y1 + 0.07, zb, TRIM, sk);
    timber.face(sz > 0
      ? [[xc - 0.43, y0, hz + 0.075], [xc + 0.43, y0, hz + 0.075], [xc + 0.43, y1, hz + 0.075], [xc - 0.43, y1, hz + 0.075]]
      : [[xc - 0.43, y0, -hz - 0.075], [xc + 0.43, y0, -hz - 0.075], [xc + 0.43, y1, -hz - 0.075], [xc - 0.43, y1, -hz - 0.075]], DARK, [0, 0, sz]);
    [za, zb] = zr(0, 0.14);
    timber.box(xc - 0.62, y0 - 0.13, za, xc + 0.62, y0 - 0.07, zb, TRIM, 'nx px ny');
  }

  // --- door on the water gable (x = +hx): frame, dark interior, two leaves on a track ---
  const xw = hx + 0.055;
  timber.box(hx - 0.03, floorY, -doorW - 0.13, xw + 0.0, doorTop + 0.07, -doorW, TRIM, 'ny nx');
  timber.box(hx - 0.03, floorY, doorW, xw + 0.0, doorTop + 0.07, doorW + 0.13, TRIM, 'ny nx');
  timber.box(hx - 0.03, doorTop, -doorW - 0.13, xw + 0.0, doorTop + 0.07, doorW + 0.13, TRIM, 'ny nx');
  const xi = hx - 1.7;
  timber.face([[xi, floorY, -doorW], [xi, doorTop, -doorW], [xi, doorTop, doorW], [xi, floorY, doorW]], DARK, [1, 0, 0]);
  timber.face([[xi, floorY, -doorW], [hx, floorY, -doorW], [hx, doorTop, -doorW], [xi, doorTop, -doorW]], DARK, [0, 0, 1]);
  timber.face([[xi, floorY, doorW], [hx, floorY, doorW], [hx, doorTop, doorW], [xi, doorTop, doorW]], DARK, [0, 0, -1]);
  timber.face([[xi, doorTop, -doorW], [hx, doorTop, -doorW], [hx, doorTop, doorW], [xi, doorTop, doorW]], DARK, [0, -1, 0]);
  const leafTone = [0.62, 0.8, 0.72];
  const leaf = (z0, z1) => {
    const x0 = xw + 0.05; const x1 = x0 + 0.075;
    timber.box(x0, floorY + 0.05, z0, x1, doorTop - 0.04, z1, leafTone, 'nx ny');
    const bw = (z1 - z0) / 4;
    for (let i = 1; i < 3; i += 1) {
      timber.box(x1, floorY + 0.05, z0 + i * bw * 4 / 3 - 0.04, x1 + 0.03, doorTop - 0.04, z0 + i * bw * 4 / 3 + 0.04, mul(leafTone, 0.82), 'nx ny py');
    }
  };
  leaf(-0.04, 1.93);       // closed leaf
  leaf(-3.93, -1.96);      // the other leaf slid back over the wall
  timber.box(xw + 0.04, doorTop + 0.1, -3.97, xw + 0.2, doorTop + 0.17, 1.97, [0.5, 0.5, 0.5], 'ny nx');   // track
  for (const zh of [-3.7, -2.0, 0.2, 1.7]) timber.box(xw + 0.14, doorTop - 0.04, zh - 0.03, xw + 0.2, doorTop + 0.1, zh + 0.03, [0.5, 0.5, 0.5], 'ny');

  // --- threshold platform and slipway ---
  timber.box(hx, 1.34, -2.3, hx + 1.35, floorY, 2.3, [1.12, 1.05, 0.95], 'nx ny');
  const top0 = 1.34; const top1 = 0.10; const zs = 1.7; const yb = -0.28;
  const V = [[slipFrom, top0, -zs], [slipFrom, top0, zs], [slipTo, top1, zs], [slipTo, top1, -zs],
    [slipFrom, yb, -zs], [slipFrom, yb, zs], [slipTo, yb, zs], [slipTo, yb, -zs]];
  conc.convex(V, [[0, 1, 2, 3], [1, 5, 6, 2], [0, 3, 7, 4], [3, 2, 6, 7], [4, 5, 6, 7], [0, 1, 5, 4]], [1.08, 1.08, 1.08], [4, 5]);
  const yOn = (x) => top0 + (top1 - top0) * (x - slipFrom) / (slipTo - slipFrom);
  for (const zk of [-zs + 0.06, zs - 0.06]) {
    timber.beam([slipFrom, yOn(slipFrom) + 0.06, zk], [slipTo + 0.2, yOn(slipTo + 0.2) + 0.06, zk], [0, 0, 1], 0.14, 0.14, [0.8, 0.78, 0.74]);
  }
  for (const zr of [-0.75, 0.75]) {
    timber.beam([slipFrom + 0.05, yOn(slipFrom + 0.05) + 0.07, zr], [slipTo + 0.4, yOn(slipTo + 0.4) + 0.05, zr], [0, 0, 1], 0.16, 0.12, [0.62, 0.55, 0.48]);
  }

  // --- roof: two ribbed slabs, ridge cap, fascia and gutter, barge boards ---
  const ox = hx + 0.3; const oz = hz + 0.35; const th = 0.07;
  for (const sz of [-1, 1]) {
    const T = [[-ox, ridgeY, 0], [ox, ridgeY, 0], [ox, roofTop(oz), sz * oz], [-ox, roofTop(oz), sz * oz]];
    const B = T.map((p) => [p[0], p[1] - th, p[2]]);
    roof.convex([...T, ...B], [[0, 1, 2, 3], [4, 5, 6, 7], [3, 2, 6, 7], [1, 2, 6, 5], [0, 3, 7, 4], [0, 1, 5, 4]], [1, 1, 1], [5]);
    const rows = 7;
    for (let i = 0; i < rows; i += 1) {
      const x = -ox + 0.45 + (i * (2 * ox - 0.9)) / (rows - 1);
      const z0 = 0.18; const z1 = oz - 0.12;
      const y = (z) => roofTop(z);
      const a = [x - 0.07, y(z0), sz * z0]; const b = [x + 0.07, y(z0), sz * z0];
      const a2 = [x - 0.07, y(z1), sz * z1]; const b2 = [x + 0.07, y(z1), sz * z1];
      const apex0 = [x, y(z0) + 0.05, sz * z0]; const apex1 = [x, y(z1) + 0.05, sz * z1];
      roof.face([a, apex0, apex1, a2], [1.1, 1.1, 1.1], [-1, 1, 0]);
      roof.face([b, b2, apex1, apex0], [1.1, 1.1, 1.1], [1, 1, 0]);
    }
    // eave fascia board (painted timber) and a metal gutter in front of it
    const zf0 = sz > 0 ? oz - 0.06 : -oz; const zf1 = sz > 0 ? oz : -oz + 0.06;
    timber.box(-ox, roofTop(oz) - 0.27, zf0, ox, roofTop(oz) - 0.02, zf1, TRIM, 'ny');
    const zg0 = sz > 0 ? oz : -oz - 0.1; const zg1 = sz > 0 ? oz + 0.1 : -oz;
    roof.box(-ox + 0.04, roofTop(oz) - 0.2, zg0, ox - 0.04, roofTop(oz) - 0.07, zg1, [0.7, 0.72, 0.72], 'nx px');
  }
  // ridge cap
  {
    const apex = [[-ox, ridgeY + 0.1, 0], [ox, ridgeY + 0.1, 0]];
    const sl = [[-ox, roofTop(0.32) + 0.012, -0.32], [ox, roofTop(0.32) + 0.012, -0.32]];
    const sr = [[-ox, roofTop(0.32) + 0.012, 0.32], [ox, roofTop(0.32) + 0.012, 0.32]];
    roof.face([sl[0], sl[1], apex[1], apex[0]], [1.12, 1.12, 1.12], [0, 1, -1]);
    roof.face([sr[0], apex[0], apex[1], sr[1]], [1.12, 1.12, 1.12], [0, 1, 1]);
    roof.face([sl[0], apex[0], sr[0]], [1, 1, 1], [-1, 0, 0]);
    roof.face([sl[1], sr[1], apex[1]], [1, 1, 1], [1, 0, 0]);
  }
  // barge boards along the rakes
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const xb = sx * (ox + 0.025);
    timber.beam([xb, roofTop(oz) - 0.05, sz * oz], [xb, ridgeY - 0.04, 0], [1, 0, 0], 0.05, 0.2, TRIM);
  }
  // vent louvre in each gable
  timber.box(hx, 3.85, -0.4, hx + 0.05, 4.1, 0.4, TRIM, 'ny nx');
  timber.box(-hx - 0.05, 3.85, -0.4, -hx, 4.1, 0.4, TRIM, 'ny px');

  return { timber: timber.geometry(), roof: roof.geometry(), concrete: conc.geometry(), triangles: timber.triangles + roof.triangles + conc.triangles };
}

/* ------------------------------------------------------------------ */
/* Beach kiosk                                                          */
/* ------------------------------------------------------------------ */
// Local frame: origin at the kiosk centre on the sand, +z toward the sea (the hatch side), +x along the shore.
// 3.6 x 2.2 m footprint, 2.4 m walls, low gable roof with a 0.35 m overhang, a 2.2 x 1.05 m serving hatch with a timber
// counter shelf on corbels, a striped awning on two brackets, a menu board, a queue rail and a roof sign.
export function buildKiosk() {
  const wall = new Mesher().ao(0, 1.3, 0.7, 0.5);
  const roof = new Mesher().ao(2.2, 2.8, 0.85, 0.5);
  const awning = new Mesher();
  const timber = new Mesher().ao(0, 1.0, 0.75, 0.5);
  const metal = new Mesher().ao(0, 0.6, 0.7, 0.5);
  const sign = new Mesher();
  const C = [1, 1, 1];
  const ridgeY = 2.78; const slope = 0.30; const th = 0.08;
  const roofTop = (z) => ridgeY - slope * Math.abs(z);
  const topY = 2.38;

  // plinth slab and body
  wall.box(-1.95, -0.06, -1.25, 1.95, 0.08, 1.25, [0.72, 0.72, 0.7], 'ny');
  wall.box(-1.8, 0.08, -1.1, 1.8, topY, 0.98, C, 'ny pz py');
  const front = (x0, y0, x1, y1, skip) => wall.box(x0, y0, 0.98, x1, y1, 1.1, C, skip);
  front(-1.8, 0.08, -1.1, topY, 'ny nz py');
  front(1.1, 0.08, 1.8, topY, 'ny nz py');
  front(-1.1, 0.08, 1.1, 0.95, 'ny nz nx px py');
  front(-1.1, 2.0, 1.1, topY, 'ny nz nx px py');
  wall.face([[-1.1, 0.95, 0.985], [1.1, 0.95, 0.985], [1.1, 2.0, 0.985], [-1.1, 2.0, 0.985]], DARK, [0, 0, 1]);
  // gable fill under the roof overhang
  for (const sx of [-1, 1]) {
    wall.face([[sx * 1.8, topY, -1.1], [sx * 1.8, topY, 1.1], [sx * 1.8, ridgeY - th + 0.03, 0]], C, [sx, 0, 0]);
  }
  // roof: two slabs, fascias
  const ox = 2.15; const oz = 1.55;
  for (const sz of [-1, 1]) {
    const T = [[-ox, ridgeY, 0], [ox, ridgeY, 0], [ox, roofTop(oz), sz * oz], [-ox, roofTop(oz), sz * oz]];
    const B = T.map((p) => [p[0], p[1] - th, p[2]]);
    roof.convex([...T, ...B], [[0, 1, 2, 3], [4, 5, 6, 7], [3, 2, 6, 7], [1, 2, 6, 5], [0, 3, 7, 4], [0, 1, 5, 4]], C, [5]);
    const z0 = sz > 0 ? oz - 0.05 : -oz; const z1 = sz > 0 ? oz : -oz + 0.05;
    roof.box(-ox, roofTop(oz) - 0.2, z0, ox, roofTop(oz) - 0.02, z1, [1.2, 1.12, 1.1], 'ny nx px');
  }
  // counter shelf on corbels
  timber.box(-1.3, 0.98, 0.96, 1.3, 1.04, 1.52, C, 'nz');
  for (const sx of [-1, 1]) timber.beam([sx * 1.0, 0.7, 1.1], [sx * 1.0, 0.98, 1.46], [1, 0, 0], 0.07, 0.06, [0.8, 0.8, 0.8]);
  // awning: seven stripes, a front valance, brackets
  const aw = (z) => 2.12 - (z - 1.1) * (0.30 / 0.9);
  const stripeA = [1, 1, 1]; const stripeB = [0.62, 0.54, 0.54];
  const nS = 7; const wA = 2.8 / nS;
  for (let i = 0; i < nS; i += 1) {
    const x0 = -1.4 + i * wA; const x1 = x0 + wA;
    const tone = i % 2 ? stripeB : stripeA;
    awning.face([[x0, aw(1.1), 1.1], [x1, aw(1.1), 1.1], [x1, aw(2.0), 2.0], [x0, aw(2.0), 2.0]], tone, [0, 1, 0.3]);
    awning.face([[x0, aw(2.0), 2.0], [x1, aw(2.0), 2.0], [x1, aw(2.0) - 0.16, 2.0], [x0, aw(2.0) - 0.16, 2.0]], mul(tone, 0.9), [0, 0, 1]);
  }
  awning.face([[-1.4, aw(1.1) - 0.04, 1.1], [1.4, aw(1.1) - 0.04, 1.1], [1.4, aw(2.0) - 0.04, 2.0], [-1.4, aw(2.0) - 0.04, 2.0]], [0.45, 0.42, 0.42], [0, -1, 0]);
  for (const sx of [-1, 1]) {
    awning.face([[sx * 1.4, aw(1.1), 1.1], [sx * 1.4, aw(1.1) - 0.04, 1.1], [sx * 1.4, aw(2.0) - 0.16, 2.0], [sx * 1.4, aw(2.0), 2.0]], [0.7, 0.66, 0.66], [sx, 0, 0]);
  }
  for (const sx of [-1, 1]) metal.beam([sx * 1.25, 1.55, 1.1], [sx * 1.25, aw(1.95) - 0.05, 1.95], [1, 0, 0], 0.045, 0.045, C);
  // menu board left of the hatch
  metal.box(-1.72, 1.08, 1.1, -1.18, 2.0, 1.15, [0.9, 0.9, 0.9], 'ny nz');
  awning.face([[-1.68, 1.12, 1.152], [-1.22, 1.12, 1.152], [-1.22, 1.96, 1.152], [-1.68, 1.96, 1.152]], [0.95, 0.95, 0.9], [0, 0, 1]);
  for (let i = 0; i < 4; i += 1) {
    const y = 1.78 - i * 0.17;
    awning.face([[-1.62, y, 1.158], [-1.62 + 0.3 + (i % 2) * 0.08, y, 1.158], [-1.62 + 0.3 + (i % 2) * 0.08, y + 0.05, 1.158], [-1.62, y + 0.05, 1.158]], [0.25, 0.23, 0.22], [0, 0, 1]);
  }
  // queue rail in front of the counter: two posts, top and mid bars
  for (const sx of [-1, 1]) metal.box(sx * 1.55 - 0.035, 0, 1.72, sx * 1.55 + 0.035, 0.95, 1.79, C, 'ny');
  metal.beam([-1.55, 0.92, 1.755], [1.55, 0.92, 1.755], [0, 1, 0], 0.05, 0.05, C);
  metal.beam([-1.55, 0.5, 1.755], [1.55, 0.5, 1.755], [0, 1, 0], 0.04, 0.04, [0.85, 0.85, 0.85]);
  // litter bin at the east flank
  metal.cyl(2.25, 0, 0.55, 0.22, 0.2, 0.72, 6, [0.9, 0.95, 0.9]);
  // roof sign
  metal.box(-1.25, 2.58, -0.36, -1.15, 3.45, -0.26, C, 'ny');
  sign.box(-1.95, 3.35, -0.35, -0.45, 3.95, -0.27, C, 'ny');

  const parts = { wall, roof, awning, timber, metal, sign };
  const out = { triangles: 0 };
  for (const [k, m] of Object.entries(parts)) { out[k] = m.geometry(); out.triangles += m.triangles; }
  return out;
}

/* ------------------------------------------------------------------ */
/* Jointed adult figure (feet at y = 0, facing +z)                       */
/* ------------------------------------------------------------------ */
export const FIGURE_SKINS = ['#c8946c', '#a9744f', '#d3a47e', '#85583b'];
export const FIGURE_HAIRS = ['#2e2420', '#4a3426', '#6d5134', '#8d7a5c'];
export const FIGURE_SHORTS = ['#4f6572', '#6a5f55', '#55654f', '#6f5a52'];

/**
 * Pose arrays: arm = [splay, pitch, elbow] (radians; splay outward, pitch forward, elbow bends the forearm forward),
 * leg = [pitch, knee] (hip pitch forward, knee bends the shin backward). `shirt` is a linear [r,g,b].
 */
export function buildFigure(o = {}) {
  const skin = lin(o.skin ?? FIGURE_SKINS[0]);
  const hair = lin(o.hair ?? FIGURE_HAIRS[0]);
  const shirt = o.shirt ?? lin('#8a6f66');
  const shorts = lin(o.shorts ?? FIGURE_SHORTS[0]);
  const lean = o.lean ?? 0.05;
  const headYaw = o.headYaw ?? 0;
  const armL = o.armL ?? [0.1, 0.05, 0.25];
  const armR = o.armR ?? [0.1, 0.05, 0.25];
  const legL = o.legL ?? [0.0, 0.0];
  const legR = o.legR ?? [0.0, 0.0];
  const m = new Mesher().ao(0, 0.5, 0.8, 0.5);
  const hipY = 0.9;
  const dirOf = (side, splay, pitch) => unit([side * Math.sin(splay), -Math.cos(splay) * Math.cos(pitch), Math.cos(splay) * Math.sin(pitch)]);
  const ringAt = (c, d, r, n = 6, squash = 1) => {
    let e1 = cross(d, [1, 0, 0]);
    if (len(e1) < 1e-4) e1 = cross(d, [0, 0, 1]);
    e1 = unit(e1);
    const e2 = unit(cross(d, e1));
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return add(c, add(mul(e1, Math.cos(a) * r), mul(e2, Math.sin(a) * r * squash)));
    });
  };
  // legs first: the lowest sole sets the ground
  const legJoints = [-1, 1].map((side) => {
    const [pitch, knee] = side < 0 ? legL : legR;
    const hip = [side * 0.09, hipY, 0.0];
    const d1 = dirOf(side * 0.3, 0.03, pitch);
    const d2 = dirOf(side * 0.3, 0.02, pitch - knee);
    const kneeP = add(hip, mul(d1, 0.43));
    const ankle = add(kneeP, mul(d2, 0.40));
    return { side, hip, d1, d2, kneeP, ankle };
  });
  const dy = -Math.min(...legJoints.map((j) => j.ankle[1] - 0.07));
  const up = (p) => [p[0], p[1] + dy, p[2]];
  const leanZ = (y) => Math.sin(lean) * Math.max(0, y - 0.9);
  // legs
  for (const j of legJoints) {
    const hip = up(j.hip); const kneeP = up(j.kneeP); const ankle = up(j.ankle);
    const hem = add(hip, mul(j.d1, 0.25)); const hemB = add(hip, mul(j.d1, 0.29));
    const calf = add(kneeP, mul(j.d2, 0.15));
    const rings = [
      ringAt(hip, j.d1, 0.09), ringAt(hem, j.d1, 0.082), ringAt(hemB, j.d1, 0.08),
      ringAt(kneeP, unit(add(j.d1, j.d2)), 0.06), ringAt(calf, j.d2, 0.058), ringAt(ankle, j.d2, 0.038),
    ];
    const hemY = (p) => len(sub(p, hip));
    m.loft(rings, (x, y, z) => (hemY([x, y, z]) < 0.27 ? shorts : skin));
    // bare foot
    m.box(ankle[0] - 0.048, ankle[1] - 0.07, ankle[2] - 0.075, ankle[0] + 0.048, ankle[1], ankle[2] + 0.19, skin, 'py');
  }
  // torso
  const tor = (y, rx, rz) => Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    return [Math.cos(a) * rx, y + dy, leanZ(y) + Math.sin(a) * rz];
  });
  const torso = [tor(1.40, 0.195, 0.105), tor(1.24, 0.172, 0.116), tor(1.0, 0.146, 0.096), tor(0.9, 0.165, 0.108)];
  m.loft(torso, (x, y) => (y - dy > 0.97 ? shirt : shorts));
  m.face(torso[0], skin, [0, 1, 0]);
  // neck and head
  const neckBase = [0, 1.40 + dy, leanZ(1.4)];
  const neckTop = [0, 1.51 + dy, leanZ(1.51) + 0.012];
  m.loft([ringAt(neckBase, [0, 1, 0], 0.046), ringAt(neckTop, [0, 1, 0], 0.042)], skin);
  const hc = [0, 1.585 + dy, leanZ(1.585) + 0.02];
  const cy = Math.cos(headYaw); const sy = Math.sin(headYaw);
  m.ellipsoid(hc[0], hc[1], hc[2], 0.078, 0.108, 0.094, 8, 4, (x, y, z, nn) => {
    const fz = nn[2] * cy - nn[0] * sy;
    return (nn[1] > 0.4 || fz < -0.1) ? hair : skin;
  });
  // arms
  for (const side of [-1, 1]) {
    const [splay, pitch, elbow] = side < 0 ? armL : armR;
    const sh = [side * 0.205, 1.365 + dy, leanZ(1.365)];
    const d1 = dirOf(side, splay, pitch);
    const d2 = dirOf(side, splay * 0.6, pitch + elbow);
    const mid = add(sh, mul(d1, 0.15)); const el = add(sh, mul(d1, 0.30)); const wr = add(el, mul(d2, 0.27));
    const rings = [ringAt(sh, d1, 0.06), ringAt(mid, d1, 0.054), ringAt(el, unit(add(d1, d2)), 0.045), ringAt(wr, d2, 0.034)];
    m.loft(rings, (x, y, z) => (len(sub([x, y, z], sh)) < 0.1 ? shirt : skin));
    m.beam(wr, add(wr, mul(d2, 0.17)), [1, 0, 0], 0.08, 0.036, skin, true);
  }
  const g = m.geometry();
  g.userData.triangles = m.triangles;
  return g;
}

/* ------------------------------------------------------------------ */
/* Beach volleyball court                                               */
/* ------------------------------------------------------------------ */
// Local frame: origin at the net centre on the sand, +x along the net, +z toward the sea. Posts 6.4 m apart, a 1.0 m
// tall net band hung between top and bottom tapes with side tapes, guy lines to the sand, court lines 6 x 11 m.
export function buildVolleyball() {
  const metal = new Mesher().ao(0, 0.8, 0.75, 0.5);
  const net = new Mesher();
  const line = new Mesher();
  const C = [1, 1, 1];
  const px = 3.2;
  for (const sx of [-1, 1]) {
    metal.cyl(sx * px, 0.0, 0, 0.055, 0.045, 2.56, 6, C);
    metal.box(sx * px - 0.16, 0, -0.16, sx * px + 0.16, 0.035, 0.16, [0.8, 0.8, 0.8], 'ny');
    metal.beam([sx * px, 2.45, 0], [sx * (px + 1.5), 0.02, sx * 0.55 + 0.4], [0, 1, 0], 0.014, 0.014, [1.3, 1.3, 1.2]);
  }
  net.box(-px, 2.40, -0.025, px, 2.48, 0.025, [1, 1, 1], 'nx px');
  net.box(-px, 1.45, -0.02, px, 1.49, 0.02, [0.95, 0.95, 0.95], 'nx px');
  // the mesh: a pleated sheet (alternate columns stand 2 cm fore and aft), dark under the white tapes
  const cols = 12; const cw = (2 * px) / cols;
  for (let i = 0; i < cols; i += 1) {
    const x0 = -px + i * cw; const x1 = x0 + cw;
    const z0 = (i % 2 ? 1 : -1) * 0.02; const z1 = -z0;
    const t = i % 2 ? 0.36 : 0.48;
    net.face([[x0, 1.49, z0], [x1, 1.49, z1], [x1, 2.40, z1], [x0, 2.40, z0]], [t, t, t], [0, 0, 1]);
    net.face([[x0, 1.49, z0 - 0.012], [x1, 1.49, z1 - 0.012], [x1, 2.40, z1 - 0.012], [x0, 2.40, z0 - 0.012]], [t, t, t], [0, 0, -1]);
  }
  for (const sx of [-1, 1]) net.box(sx * px - 0.025, 1.45, -0.03, sx * px + 0.025, 2.48, 0.03, [0.95, 0.95, 0.95], 'ny');
  // court lines: flat tapes on the sand
  const hw = 3.0; const hl = 5.5; const lw = 0.05;
  const strip = (x0, z0, x1, z1) => line.face([[x0, 0.014, z0], [x1, 0.014, z0], [x1, 0.014, z1], [x0, 0.014, z1]], C, [0, 1, 0]);
  strip(-hw, -hl, hw, -hl + lw); strip(-hw, hl - lw, hw, hl);
  strip(-hw, -hl, -hw + lw, hl); strip(hw - lw, -hl, hw, hl);
  const out = { metal: metal.geometry(), net: net.geometry(), line: line.geometry() };
  out.triangles = metal.triangles + net.triangles + line.triangles;
  return out;
}

/* ------------------------------------------------------------------ */
/* Esplanade pier                                                       */
/* ------------------------------------------------------------------ */
// Local frame: x seaward from the pier's first plank (x = 0), z across the pier, y world metres. Deck boards in 1.2 m
// units with real kerfs, a 0.28 m edge fascia with a dark shadow line under it, seven transverse joists on two long
// bearers, seven pairs of piles (instanced from `pile`) cross-braced with a waler and a diagonal, a handrail on posts
// every 3.2 m, and a lower landing with a step at the sea end. `pilePositions` are [x, z] of every pile base.
export function buildPier({ length = 44, width = 5.4, deckTop = 1.34, plankT = 0.11, floorY = -0.55 } = {}) {
  const deck = new Mesher().ao(deckTop - 0.35, deckTop, 0.7, 0.5);
  const structure = new Mesher().ao(-0.6, 1.1, 0.7, 0.5);
  const bearers = new Mesher().ao(0.6, 1.2, 0.8, 0.5);
  const joists = new Mesher().ao(0.9, 1.2, 0.85, 0.5);
  const fascia = new Mesher().ao(deckTop - 0.3, deckTop, 0.8, 0.5);
  const shadow = new Mesher();
  const rails = new Mesher().ao(deckTop, deckTop + 1.0, 0.8, 0.5);
  const concrete = new Mesher().ao(0, 0.6, 0.7, 0.5);
  const sand = new Mesher();
  const pile = new Mesher().ao(0, 1.5, 0.62, 0.5);
  const C = [1, 1, 1];
  const hw = width / 2;
  const xMain = length - 3.2;
  const pz = 0.34 * width;
  const stations = 7;
  const pileTop = deckTop - plankT - 0.12 - 0.22 + 0.02;
  const pileBase = floorY - 0.05;

  // pile: one hexagonal tapered post, base at y = 0
  pile.cyl(0, 0, 0, 0.2, 0.17, pileTop - pileBase, 6, C, { top: false });

  // deck boards
  const boardTone = (i) => {
    const h = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    const j = h - Math.floor(h);
    return (i % 2 ? 0.84 : 1.0) * (0.95 + 0.1 * j);
  };
  deck.box(0, deckTop - plankT, -hw + 0.05, 0.9, deckTop, hw - 0.05, [1.1, 1.1, 1.1], 'ny nz pz nx');
  const pitch = 1.2; const gap = 0.07;
  const nBoards = Math.floor((xMain - 0.9) / pitch);
  for (let i = 0; i < nBoards; i += 1) {
    const x0 = 0.9 + i * pitch + gap; const x1 = 0.9 + (i + 1) * pitch;
    const t = boardTone(i);
    deck.box(x0, deckTop - plankT, -hw + 0.05, x1, deckTop, hw - 0.05, [t, t, t], 'ny nz pz');
  }
  // the kerf floor: a dark tread under the boards so gaps read as slots, not holes
  deck.face([[0.9, deckTop - plankT + 0.002, -hw + 0.05], [xMain, deckTop - plankT + 0.002, -hw + 0.05], [xMain, deckTop - plankT + 0.002, hw - 0.05], [0.9, deckTop - plankT + 0.002, hw - 0.05]], [0.18, 0.15, 0.12], [0, 1, 0]);

  // edge fascia (0.28 m) and the dark shadow line beneath it
  for (const sz of [-1, 1]) {
    const z0 = sz > 0 ? hw - 0.05 : -hw - 0.06 + 0.11; const z1 = sz > 0 ? hw + 0.06 : -hw + 0.05;
    fascia.box(0, deckTop - 0.28, Math.min(z0, z1), xMain, deckTop + 0.015, Math.max(z0, z1), C, 'nx px');
    const s0 = sz > 0 ? hw - 0.03 : -hw - 0.04; const s1 = sz > 0 ? hw + 0.04 : -hw + 0.03;
    shadow.box(0, deckTop - 0.36, s0, xMain, deckTop - 0.28, s1, [0.25, 0.22, 0.2], 'nx px py');
  }
  // joists and bearers
  for (let j = 0; j < stations; j += 1) {
    const xc = 0.6 + (j + 0.5) * ((xMain - 0.6) / stations);
    joists.box(xc - 0.11, deckTop - plankT - 0.12, -hw + 0.12, xc + 0.11, deckTop - plankT, hw - 0.12, C, 'nz pz py nx px');
  }
  for (const sz of [-1, 1]) {
    bearers.box(0.2, deckTop - plankT - 0.34, sz * pz - 0.13, xMain - 0.1, deckTop - plankT - 0.12, sz * pz + 0.13, C, 'nx px py');
  }
  // piles in pairs, with a waler and a diagonal brace at every station
  const pilePositions = [];
  for (let j = 0; j < stations; j += 1) {
    const xc = 0.6 + (j + 0.5) * ((xMain - 0.6) / stations);
    for (const sz of [-1, 1]) pilePositions.push([xc, sz * pz]);
    structure.beam([xc, 0.28, -pz], [xc, 0.28, pz], [1, 0, 0], 0.13, 0.13, [0.85, 0.85, 0.85]);
    const dirn = j % 2 ? 1 : -1;
    structure.beam([xc + 0.01, -0.25, dirn * pz], [xc + 0.01, 0.82, -dirn * pz], [1, 0, 0], 0.11, 0.11, [0.9, 0.9, 0.9]);
  }
  // lower landing at the sea end: one step down from the deck, then the landing slab on two more piles
  const landTop = deckTop - 0.55;
  structure.box(xMain, landTop - 0.4, -hw + 0.15, xMain + 0.45, deckTop - 0.28, hw - 0.15, [0.9, 0.9, 0.9], 'nx ny');
  deck.box(xMain, deckTop - 0.28, -hw + 0.15, xMain + 0.45, deckTop - 0.18, hw - 0.15, [1.05, 1.05, 1.05], 'ny nx');
  deck.box(xMain + 0.45, landTop - 0.1, -hw + 0.15, length, landTop, hw - 0.15, [0.92, 0.92, 0.92], 'ny nx');
  for (const sz of [-1, 1]) pilePositions.push([length - 0.5, sz * pz]);
  // handrail: posts at 3.2 m on both sides from the boardwalk edge to the step, top and mid rails
  const rx0 = 5.4; const rx1 = xMain - 0.2;
  for (const sz of [-1, 1]) {
    const zr = sz * (hw - 0.12);
    const nP = Math.floor((rx1 - rx0) / 3.2) + 1;
    for (let i = 0; i < nP; i += 1) {
      const x = rx0 + i * ((rx1 - rx0) / (nP - 1));
      rails.box(x - 0.05, deckTop, zr - 0.05, x + 0.05, deckTop + 0.96, zr + 0.05, C, 'ny py');
    }
    rails.beam([rx0, deckTop + 0.96, zr], [rx1, deckTop + 0.96, zr], [0, 0, 1], 0.1, 0.07, [1.12, 1.12, 1.12]);
    rails.beam([rx0, deckTop + 0.5, zr], [rx1, deckTop + 0.5, zr], [0, 0, 1], 0.07, 0.05, C);
  }
  // masonry sill and cope where the pier leaves the esplanade, and the drift of sand against it
  concrete.box(-1.5, 0.0, -hw + 0.2, -0.5, 0.62, hw - 0.2, C, 'ny');
  concrete.box(-0.32, 0.03, -hw - 0.1, 0.0, 0.21, hw + 0.1, [1.15, 1.15, 1.15], 'ny');
  {
    const w = hw - 0.15;
    const V = [[-0.66, -0.03, -w], [-0.16, -0.03, -w], [-0.16, 0.13, -w], [-0.66, -0.03, w], [-0.16, -0.03, w], [-0.16, 0.13, w]];
    sand.convex(V, [[0, 1, 2], [3, 5, 4], [0, 2, 5, 3], [1, 4, 5, 2], [0, 3, 4, 1]], C, [4]);
  }
  const out = { pilePositions, pileHeight: pileTop - pileBase, pileBase };
  const parts = { deck, structure, bearers, joists, fascia, shadow, rails, concrete, sand };
  out.triangles = 0;
  for (const [k, mm] of Object.entries(parts)) { out[k] = mm.geometry(); out.triangles += mm.triangles; }
  out.pile = pile.geometry();
  out.pileTriangles = pile.triangles;
  return out;
}

/* ------------------------------------------------------------------ */
/* Esplanade seawall run and seaward steps                              */
/* ------------------------------------------------------------------ */
// Wall run, local frame: x seaward (0 at the wall centre), z along the run (centred), y up. A battered concrete face on a
// stepped toe, with panel joints every `jointPitch` metres and a weep hole between them, under a coping with a chamfered,
// overhanging nose. Returns the wall mass and the coping as two geometries.
export function buildWallRun({ length, deep = 3.4, wallH = 1.42, jointPitch = 3.6 } = {}) {
  const wall = new Mesher().ao(-0.05, wallH, 0.68, 0.5);
  const cope = new Mesher();
  const z0 = -length / 2; const z1 = length / 2;
  const back = -deep / 2; const topX = deep / 2 - 0.1;
  const top = wallH - 0.02; const batter = 0.1;
  const faceX = (y) => topX + (top - y) / (top + 0.05) * batter;
  const toe = 0.24; const toeY = 0.2;
  const sb = back - 0.08;                                  // landward base course, 8 cm proud
  const prof = [[sb, -0.05], [toe + topX + 0.1, -0.05], [toe + topX + 0.1, toeY], [faceX(toeY), toeY], [topX, top], [back, top], [back, toeY], [sb, toeY]];
  const ctr = [0, top * 0.5, 0];
  // The run is built bay by bay (one panel between joints), so no face is longer than a panel and the
  // geometry stays local: a bay is the unit a portrait or a mischief hit can address.
  const nBays = Math.max(1, Math.round(length / jointPitch));
  const bayL = length / nBays;
  const cy0 = wallH - 0.06; const cy1 = wallH + 0.16; const ox = deep / 2 + 0.05; const ch = 0.1;
  const cp = [[-ox, cy0], [ox, cy0], [ox, cy1 - ch], [ox - ch, cy1], [-ox + ch, cy1], [-ox, cy1 - ch]];
  const cctr = [0, (cy0 + cy1) / 2, 0];
  for (let b = 0; b < nBays; b += 1) {
    const zA = z0 + b * bayL; const zB = zA + bayL;
    const t = 0.94 + 0.06 * (((b * 7) % 3) / 2);
    for (let i = 0; i < prof.length; i += 1) {
      if (i === 4) continue;                                // the top is under the coping
      const a = prof[i]; const c = prof[(i + 1) % prof.length];
      const mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, 0];
      const col = (i === 2 || i === 6) ? [1.12 * t, 1.12 * t, 1.12 * t] : [t, t, t];
      wall.face([[a[0], a[1], zA], [c[0], c[1], zA], [c[0], c[1], zB], [a[0], a[1], zB]], col, sub(mid, ctr));
    }
    // panel joint at the bay start and a weep hole at its middle, both inset dark on the battered face
    if (b > 0) {
      const yb = 0.24; const yt = top - 0.08;
      wall.face([[faceX(yb) + 0.012, yb, zA - 0.022], [faceX(yb) + 0.012, yb, zA + 0.022], [faceX(yt) + 0.012, yt, zA + 0.022], [faceX(yt) + 0.012, yt, zA - 0.022]], [0.32, 0.31, 0.3], [1, 0, 0]);
      wall.face([[back - 0.012, toeY + 0.04, zA - 0.022], [back - 0.012, toeY + 0.04, zA + 0.022], [back - 0.012, yt, zA + 0.022], [back - 0.012, yt, zA - 0.022]], [0.32, 0.31, 0.3], [-1, 0, 0]);
    }
    {
      const zw = (zA + zB) / 2; const yw = 0.5;
      wall.face([[faceX(yw) + 0.012, yw, zw - 0.045], [faceX(yw) + 0.012, yw, zw + 0.045], [faceX(yw + 0.09) + 0.012, yw + 0.09, zw + 0.045], [faceX(yw + 0.09) + 0.012, yw + 0.09, zw - 0.045]], [0.16, 0.15, 0.14], [1, 0, 0]);
    }
    for (let i = 0; i < cp.length; i += 1) {
      const a = cp[i]; const c = cp[(i + 1) % cp.length];
      const mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, 0];
      const k = i === 3 ? 1.08 * t : t;
      cope.face([[a[0], a[1], zA], [c[0], c[1], zA], [c[0], c[1], zB], [a[0], a[1], zB]], [k, k, k], sub(mid, cctr));
    }
  }
  // the two run ends (they are the sides of a stair well)
  // (the profile is concave at the toe, so each end is two convex pieces)
  for (const [zc, nz] of [[z0, -1], [z1, 1]]) {
    wall.face([prof[0], prof[1], prof[2], prof[7]].map((p) => [p[0], p[1], zc]), [1, 1, 1], [0, 0, nz]);
    wall.face([prof[6], prof[3], prof[4], prof[5]].map((p) => [p[0], p[1], zc]), [1, 1, 1], [0, 0, nz]);
  }
  cope.face(cp.map((p) => [p[0], p[1], z0]), [1, 1, 1], [0, 0, -1]);
  cope.face(cp.map((p) => [p[0], p[1], z1]), [1, 1, 1], [0, 0, 1]);
  return { wall: wall.geometry(), cope: cope.geometry(), triangles: wall.triangles + cope.triangles, bays: nBays };
}

// Seaward flight, local frame: x seaward from the deck edge (0), z across (centred), y world metres. Closed risers under
// overhanging treads, two raked stringers; the last tread lands on the sand.
export function buildSeawardStair({ steps = 8, run = 0.52, width = 2.2, deckTop = 1.34, sandY = 0.06 } = {}) {
  const m = new Mesher().ao(sandY, deckTop, 0.72, 0.5);
  const rise = (deckTop - sandY) / steps;
  const hw = width / 2;
  const tread = 0.055;
  for (let i = 0; i < steps; i += 1) {
    const x0 = i * run; const x1 = x0 + run; const yTop = deckTop - rise * (i + 1);
    const t = i % 2 ? 0.86 : 1.0;
    m.box(x0, yTop - tread, -hw, x1 + 0.04, yTop, hw, [t, t, t], 'nx ny');
    m.face([[x1, yTop - rise, -hw], [x1, yTop - rise, hw], [x1, yTop - tread, hw], [x1, yTop - tread, -hw]], [0.66, 0.62, 0.58], [1, 0, 0]);
  }
  for (const sz of [-1, 1]) {
    m.beam([0, deckTop - 0.12, sz * (hw + 0.03)], [steps * run, sandY - 0.12, sz * (hw + 0.03)], [0, 0, 1], 0.05, 0.3, [0.58, 0.55, 0.5]);
  }
  return { stair: m.geometry(), triangles: m.triangles };
}

// Landward flight through a wall well, local frame: x from the board toward the deck (0 at the first riser), z across
// (centred), y world metres from the board (0) to the deck. Solid stepped blocks with a closed riser each and a
// 3 cm nosing, not floating slabs.
export function buildLandStair({ steps = 10, rise = 0.14, run = 0.3, width = 2.15 } = {}) {
  const m = new Mesher().ao(0, steps * rise, 0.7, 0.5);
  const hw = width / 2;
  for (let i = 0; i < steps; i += 1) {
    const x0 = i * run; const x1 = x0 + run; const top = rise * (i + 1);
    const t = i % 2 ? 0.92 : 1.0;
    // tread with a nosing over the riser, and the block below it
    m.box(x0 - 0.03, top - 0.05, -hw, x1, top, hw, [1.1 * t, 1.1 * t, 1.1 * t], 'ny px');
    m.box(x0, -0.05, -hw, x1, top - 0.05, hw, [t, t, t], 'ny px py nx');
    m.face([[x0, rise * i, -hw], [x0, rise * i, hw], [x0, top - 0.05, hw], [x0, top - 0.05, -hw]], [0.85 * t, 0.85 * t, 0.85 * t], [-1, 0, 0]);
  }
  return { stair: m.geometry(), triangles: m.triangles };
}

/* ------------------------------------------------------------------ */
/* Planter shrub lobe                                                   */
/* ------------------------------------------------------------------ */
// A unit-diameter lumpy lobe on the 20-face icosahedron's vertex count: the 12 corners are pushed in and out by a
// deterministic jitter, normals are spherical, and the colour attribute darkens the underside so overlapping lobes
// read as one massed shrub with shade in it. Instances place and tint it as before.
export function buildShrubLobe() {
  const g = new THREE.IcosahedronGeometry(0.5, 0);
  const pos = g.attributes.position;
  const key = (i) => `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
  const jitter = new Map();
  const v = new THREE.Vector3();
  const nrm = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const k = key(i);
    if (!jitter.has(k)) {
      const f = Math.sin(jitter.size * 7.31 + 1.7) * 43758.5453;
      jitter.set(k, 0.78 + 0.44 * (f - Math.floor(f)));
    }
    v.fromBufferAttribute(pos, i).normalize();
    const r = 0.5 * jitter.get(k);
    pos.setXYZ(i, v.x * r, v.y * r * 0.92, v.z * r);
    nrm.setXYZ(i, v.x, v.y, v.z);
    const shade = 0.58 + 0.42 * Math.min(1, Math.max(0, (v.y + 0.55) / 1.2));
    col[i * 3] = shade; col[i * 3 + 1] = shade; col[i * 3 + 2] = shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
