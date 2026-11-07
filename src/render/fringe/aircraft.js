// Procedural 1:4 A380 / 747 / private-jet airframes. +Z nose, y=0 tyre contact.
//
// This module also hosts the chamfer/hull/geometry-cache helpers the Tullamarine
// venue uses. They live here rather than in kit.js because kit.js is shared with
// the other fringe builders and must not move under them.

import * as THREE from 'three';
import { TASTE } from '../taste-tokens.js';

/* ------------------------------------------------------------------ *
 * Solids
 * ------------------------------------------------------------------ */

/**
 * Flat-shaded convex solid from a point list and a face list. Winding is fixed
 * automatically by testing each facet normal against the shape centroid, so the
 * caller never has to get the vertex order right.
 */
export function hullGeometry(pts, faces) {
  let cx = 0; let cy = 0; let cz = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; cz += p[2]; }
  cx /= pts.length; cy /= pts.length; cz /= pts.length;
  const tris = [];
  for (const f of faces) {
    for (let i = 2; i < f.length; i += 1) tris.push([f[0], f[i - 1], f[i]]);
  }
  const pos = new Float32Array(tris.length * 9);
  let w = 0;
  for (const [i0, i1, i2] of tris) {
    const a = pts[i0]; const b = pts[i1]; const c = pts[i2];
    const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const gx = (a[0] + b[0] + c[0]) / 3 - cx;
    const gy = (a[1] + b[1] + c[1]) / 3 - cy;
    const gz = (a[2] + b[2] + c[2]) / 3 - cz;
    const order = (nx * gx + ny * gy + nz * gz) < 0 ? [c, b, a] : [a, b, c];
    for (const v of order) { pos[w] = v[0]; pos[w + 1] = v[1]; pos[w + 2] = v[2]; w += 3; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * A cuboid with all twelve edges cut back by `bevel`. Non-indexed so every
 * facet is flat-shaded: the bevel strips read as crisp highlight lines.
 * 44 triangles.
 */
export function bevelBoxGeometry(w, h, d, bevel) {
  const b = Math.max(0.008, Math.min(bevel, w * 0.45, h * 0.45, d * 0.45));
  const hx = w / 2; const hy = h / 2; const hz = d / 2;
  const pts = [];
  const key = (sx, sy, sz, k) => (
    (((sx > 0 ? 1 : 0) * 4) + ((sy > 0 ? 1 : 0) * 2) + (sz > 0 ? 1 : 0)) * 3 + k
  );
  for (let i = 0; i < 24; i += 1) pts.push([0, 0, 0]);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        pts[key(sx, sy, sz, 0)] = [sx * hx, sy * (hy - b), sz * (hz - b)];
        pts[key(sx, sy, sz, 1)] = [sx * (hx - b), sy * hy, sz * (hz - b)];
        pts[key(sx, sy, sz, 2)] = [sx * (hx - b), sy * (hy - b), sz * hz];
      }
    }
  }
  const faces = [];
  for (const s of [-1, 1]) {
    faces.push([key(s, -1, -1, 0), key(s, 1, -1, 0), key(s, 1, 1, 0), key(s, -1, 1, 0)]);
    faces.push([key(-1, s, -1, 1), key(1, s, -1, 1), key(1, s, 1, 1), key(-1, s, 1, 1)]);
    faces.push([key(-1, -1, s, 2), key(1, -1, s, 2), key(1, 1, s, 2), key(-1, 1, s, 2)]);
  }
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) {
      faces.push([key(-1, sy, sz, 1), key(1, sy, sz, 1), key(1, sy, sz, 2), key(-1, sy, sz, 2)]);
    }
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      faces.push([key(sx, -1, sz, 0), key(sx, 1, sz, 0), key(sx, 1, sz, 2), key(sx, -1, sz, 2)]);
    }
  }
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      faces.push([key(sx, sy, -1, 0), key(sx, sy, 1, 0), key(sx, sy, 1, 1), key(sx, sy, -1, 1)]);
    }
  }
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        faces.push([key(sx, sy, sz, 0), key(sx, sy, sz, 1), key(sx, sy, sz, 2)]);
      }
    }
  }
  return hullGeometry(pts, faces);
}

/**
 * A tapered, swept, dihedral lifting surface, or an exact sub-slice of one.
 * Root sits at x = 0 and the tip runs out to x = side*span, translated aft and up.
 *
 * `t0..t1` are spanwise fractions and `c0..c1` are chord fractions measured back
 * from the leading edge, so a dark leading edge or a livery tip band is a PIECE
 * of the wing rather than a plate laid on it. That is the same architecture that
 * closed the r4 fin veto: adjacent slices share an exact plane, so there is no
 * separate solid to notch the outline and nothing to z-fight along.
 *
 * Called with the defaults it returns the whole wing, vertex for vertex identical
 * to the single solid this replaced.
 */
export function wingSliceGeometry(opts, t0 = 0, t1 = 1, c0 = 0, c1 = 1) {
  const {
    rootChord, tipChord, span, sweep = 0.5, dihedral = 0.06,
    rootT = 0.5, tipT = 0.18, side = 1, twistZ = 0,
  } = opts;
  const sec = (t) => {
    const chord = rootChord + (tipChord - rootChord) * t;
    const zLE = -Math.tan(sweep) * span * t + twistZ * t + chord * 0.55;
    return {
      x: side * span * t,
      y: Math.tan(dihedral) * span * t,
      zF: zLE - chord * c0,
      zB: zLE - chord * c1,
      h: (rootT + (tipT - rootT) * t) * 0.5,
    };
  };
  const a = sec(t0);
  const b = sec(t1);
  const pts = [
    [a.x, a.y + a.h, a.zF], [a.x, a.y + a.h, a.zB],
    [a.x, a.y - a.h, a.zB], [a.x, a.y - a.h, a.zF],
    [b.x, b.y + b.h, b.zF], [b.x, b.y + b.h, b.zB],
    [b.x, b.y - b.h, b.zB], [b.x, b.y - b.h, b.zF],
  ];
  const faces = [
    [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5], [0, 3, 2, 1], [4, 5, 6, 7],
  ];
  return hullGeometry(pts, faces);
}

/** The whole lifting surface. */
export function wingGeometry(opts) {
  return wingSliceGeometry(opts, 0, 1, 0, 1);
}

/**
 * One slice of a swept vertical fin, between height fractions t0 and t1 of the
 * full fin. Root sits in the XZ plane and the fin rises in Y.
 *
 * Livery bands are built as stacked slices rather than as plates laid over the
 * fin. A plate wide enough to be seen has to be thicker than the fin it sits on,
 * which is exactly the white-slab-through-the-crimson-tail the r4 critic found
 * at 11x. Slices share an exact plane, so there is nothing to notch.
 */
export function finBandGeometry(opts, t0 = 0, t1 = 1) {
  const { rootChord, tipChord, height, sweep = 0.7, rootT = 0.42, tipT = 0.20 } = opts;
  const tan = Math.tan(sweep);
  const sec = (t) => ({
    y: height * t,
    zc: -tan * height * t,
    c: rootChord + (tipChord - rootChord) * t,
    h: (rootT + (tipT - rootT) * t) * 0.5,
  });
  const a = sec(t0);
  const b = sec(t1);
  const pts = [
    [a.h, a.y, a.zc + a.c * 0.5], [a.h, a.y, a.zc - a.c * 0.5],
    [-a.h, a.y, a.zc - a.c * 0.5], [-a.h, a.y, a.zc + a.c * 0.5],
    [b.h, b.y, b.zc + b.c * 0.5], [b.h, b.y, b.zc - b.c * 0.5],
    [-b.h, b.y, b.zc - b.c * 0.5], [-b.h, b.y, b.zc + b.c * 0.5],
  ];
  const faces = [
    [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5], [0, 3, 2, 1], [4, 5, 6, 7],
  ];
  return hullGeometry(pts, faces);
}

/** Swept vertical fin, rooted in the XZ plane and rising in Y. */
export function finGeometry(opts) {
  return finBandGeometry(opts, 0, 1);
}

/**
 * Convex loft between two upright rectangular sections given in aircraft-local
 * coordinates. Used for wing-body fairings, tail-cone fairings and spine
 * stripes — anything that has to follow a body that is changing width.
 */
export function loftGeometry(a, b) {
  const pts = [
    [-a.halfW, a.yBot, a.z], [a.halfW, a.yBot, a.z], [a.halfW, a.yTop, a.z], [-a.halfW, a.yTop, a.z],
    [-b.halfW, b.yBot, b.z], [b.halfW, b.yBot, b.z], [b.halfW, b.yTop, b.z], [-b.halfW, b.yTop, b.z],
  ];
  const faces = [
    [0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5],
  ];
  return hullGeometry(pts, faces);
}

/** Deterministic geometry pool so repeated dressing shares buffers. */
export function makeGeoCache() {
  const store = new Map();
  const take = (k, build) => {
    let g = store.get(k);
    if (!g) { g = build(); store.set(k, g); }
    return g;
  };
  const r2 = (v) => Math.round(v * 100) / 100;
  return {
    box(w, h, d) {
      return take(`b|${r2(w)}|${r2(h)}|${r2(d)}`, () => new THREE.BoxGeometry(w, h, d));
    },
    bevel(w, h, d, b) {
      return take(`v|${r2(w)}|${r2(h)}|${r2(d)}|${r2(b)}`, () => bevelBoxGeometry(w, h, d, b));
    },
    cyl(rt, rb, h, s) {
      return take(`c|${r2(rt)}|${r2(rb)}|${r2(h)}|${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
    },
    sphere(r, s) {
      return take(`s|${r2(r)}|${s}`, () => new THREE.SphereGeometry(r, s, Math.max(4, s >> 1)));
    },
    cone(r, h, s) {
      return take(`n|${r2(r)}|${r2(h)}|${s}`, () => new THREE.ConeGeometry(r, h, s));
    },
    size() { return store.size; },
  };
}

/** Place a mesh on a pooled geometry. */
export function put(group, geo, mat, x, y, z, opts = {}) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  if (opts.rotX) mesh.rotation.x = opts.rotX;
  if (opts.rotY) mesh.rotation.y = opts.rotY;
  if (opts.rotZ) mesh.rotation.z = opts.rotZ;
  if (opts.scale) mesh.scale.setScalar(opts.scale);
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  if (opts.name) mesh.name = opts.name;
  mesh.raycast = () => {};
  group.add(mesh);
  return mesh;
}

/* ------------------------------------------------------------------ *
 * taste-r1 W8-D: 1:4 airframes
 *
 * The bible puts every big machine at one ratio on all three axes: A380 18 x 20 x 6 m,
 * 747 17.5 x 16 x 4.9 m, private jet 5 x 4.5 x 1.5 m. Each airframe below is ONE
 * vertex-coloured mesh built from lofted sections rather than a pile of boxes and
 * cylinders: a superelliptic fuselage section that closes into a nose and an upswept tail,
 * swept tapered wings with an aerofoil section, nacelles turned on a lathe, a swept fin and
 * tailplane, a window band and a livery stripe laid as decals, and an under-wing shadow
 * tone in the vertex colours. Local frame: +z nose, +x starboard, y = 0 at the tyres, the
 * origin at the middle of the fuselage. This builder is retained for af1Form=0 identity.
 * ------------------------------------------------------------------ */

const hexRgb = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const spow = (v, p) => Math.sign(v) * Math.abs(v) ** p;

// Paint, from the bible's tokens. Body is built.marking (V 85); the shadow tones are the same
// paint in shade, not a second colour.
const PAINT = Object.freeze({
  body: hexRgb(TASTE.built.marking),
  wingTop: hexRgb('#c3c0b8'),
  shade: hexRgb('#87857f'),
  windows: hexRgb('#39434d'),
  glass: hexRgb('#2c353e'),
  metal: hexRgb('#7a7b79'),
  fan: hexRgb('#3b3d3f'),
  gear: hexRgb('#46484a'),
  tyre: hexRgb('#1f2022'),
});

function newAcc() { return { pos: [], nrm: [], col: [], idx: [] }; }

/**
 * Append an nu x nv grid of points (index j * nu + i) with smooth normals. `wrap` closes the
 * u direction. Winding is fixed against `ref`, a point the surface faces away from (or
 * toward, when `inward`).
 */
function addGrid(acc, P, C, nu, nv, wrap, ref, inward = false) {
  const n = nu * nv;
  const nr = new Float64Array(n * 3);
  const tris = [];
  const iu = wrap ? nu : nu - 1;
  for (let j = 0; j < nv - 1; j += 1) {
    for (let i = 0; i < iu; i += 1) {
      const a = j * nu + i;
      const b = j * nu + ((i + 1) % nu);
      const c = (j + 1) * nu + ((i + 1) % nu);
      const d = (j + 1) * nu + i;
      tris.push([a, b, c], [a, c, d]);
    }
  }
  const live = [];
  for (const t of tris) {
    const [a, b, c] = t;
    const ux = P[b * 3] - P[a * 3]; const uy = P[b * 3 + 1] - P[a * 3 + 1]; const uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3]; const vy = P[c * 3 + 1] - P[a * 3 + 1]; const vz = P[c * 3 + 2] - P[a * 3 + 2];
    const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
    if (nx * nx + ny * ny + nz * nz < 1e-14) continue;
    live.push(t);
    for (const v of t) { nr[v * 3] += nx; nr[v * 3 + 1] += ny; nr[v * 3 + 2] += nz; }
  }
  let cx = 0; let cy = 0; let cz = 0;
  if (ref) {
    [cx, cy, cz] = ref;
  } else {
    for (let v = 0; v < n; v += 1) { cx += P[v * 3]; cy += P[v * 3 + 1]; cz += P[v * 3 + 2]; }
    cx /= n; cy /= n; cz /= n;
  }
  let side = 0;
  for (let v = 0; v < n; v += 1) {
    side += nr[v * 3] * (P[v * 3] - cx) + nr[v * 3 + 1] * (P[v * 3 + 1] - cy) + nr[v * 3 + 2] * (P[v * 3 + 2] - cz);
  }
  const flip = (side < 0) !== inward ? -1 : 1;
  const base = acc.pos.length / 3;
  for (let v = 0; v < n; v += 1) {
    const l = Math.hypot(nr[v * 3], nr[v * 3 + 1], nr[v * 3 + 2]) || 1;
    acc.pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
    acc.nrm.push(flip * nr[v * 3] / l, flip * nr[v * 3 + 1] / l, flip * nr[v * 3 + 2] / l);
    acc.col.push(C[v * 3], C[v * 3 + 1], C[v * 3 + 2]);
  }
  for (const [a, b, c] of live) {
    if (flip > 0) acc.idx.push(base + a, base + b, base + c);
    else acc.idx.push(base + a, base + c, base + b);
  }
}

/** Flat-shaded axis-aligned box. */
function addSlab(acc, cx, cy, cz, sx, sy, sz, col) {
  const hx = sx / 2; const hy = sy / 2; const hz = sz / 2;
  const faces = [
    [[1, 0, 0], [[hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz]]],
    [[-1, 0, 0], [[-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, -hz]]],
    [[0, 1, 0], [[-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz]]],
    [[0, -1, 0], [[-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]]],
    [[0, 0, 1], [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]],
    [[0, 0, -1], [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]]],
  ];
  for (const [nrm, pts] of faces) {
    const base = acc.pos.length / 3;
    for (const p of pts) {
      acc.pos.push(cx + p[0], cy + p[1], cz + p[2]);
      acc.nrm.push(nrm[0], nrm[1], nrm[2]);
      acc.col.push(col[0], col[1], col[2]);
    }
    acc.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

/** Surface of revolution about `axis` through `o`. prof = [[t along the axis, radius]...]. */
function addLathe(acc, o, axis, prof, seg, colours, ref, inward = false, phase = 0) {
  const ax = new THREE.Vector3(...axis).normalize();
  const helper = Math.abs(ax.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const e1 = new THREE.Vector3().crossVectors(ax, helper).normalize();
  const e2 = new THREE.Vector3().crossVectors(ax, e1).normalize();
  const nv = prof.length;
  const P = new Float64Array(seg * nv * 3);
  const C = new Float64Array(seg * nv * 3);
  for (let j = 0; j < nv; j += 1) {
    const [t, r] = prof[j];
    const col = colours[Math.min(j, colours.length - 1)];
    for (let i = 0; i < seg; i += 1) {
      const a = (i / seg) * Math.PI * 2 + phase;
      const k = (j * seg + i) * 3;
      P[k] = o[0] + ax.x * t + (Math.cos(a) * e1.x + Math.sin(a) * e2.x) * r;
      P[k + 1] = o[1] + ax.y * t + (Math.cos(a) * e1.y + Math.sin(a) * e2.y) * r;
      P[k + 2] = o[2] + ax.z * t + (Math.cos(a) * e1.z + Math.sin(a) * e2.z) * r;
      C[k] = col[0]; C[k + 1] = col[1]; C[k + 2] = col[2];
    }
  }
  const mid = prof[nv >> 1][0];
  addGrid(acc, P, C, seg, nv, true, ref ?? [o[0] + ax.x * mid, o[1] + ax.y * mid, o[2] + ax.z * mid], inward);
}

/* Aerofoil ring: trailing edge to leading edge over the top, then back along the underside. */
const AF_UP = [1, 0.88, 0.72, 0.54, 0.36, 0.2, 0.09, 0.025];
const afHalf = (x) => 5 * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1015 * x ** 4);

/**
 * Loft through sections. A section is { o: leading-edge point, c: unit chord direction,
 * n: unit thickness direction, chord, tc, top, bot, le }; the ring is the aerofoil.
 */
function addLoft(acc, secs, capEnd = true, coarse = false) {
  const AF_UP = coarse ? [1, 0.72, 0.2, 0.025] : [1, 0.88, 0.72, 0.54, 0.36, 0.2, 0.09, 0.025];
  const AF_LO = [...AF_UP].reverse();
  const AF_N = AF_UP.length + 1 + AF_LO.length;
  const nv = secs.length;
  const P = new Float64Array(AF_N * nv * 3);
  const C = new Float64Array(AF_N * nv * 3);
  const centre = (j) => {
    let x = 0; let y = 0; let z = 0;
    for (let i = 0; i < AF_N; i += 1) { x += P[(j * AF_N + i) * 3]; y += P[(j * AF_N + i) * 3 + 1]; z += P[(j * AF_N + i) * 3 + 2]; }
    return [x / AF_N, y / AF_N, z / AF_N];
  };
  for (let j = 0; j < nv; j += 1) {
    const s = secs[j];
    for (let i = 0; i < AF_N; i += 1) {
      let xc; let up;
      if (i < AF_UP.length) { xc = AF_UP[i]; up = 1.12; } else if (i === AF_UP.length) { xc = 0; up = 0; } else { xc = AF_LO[i - AF_UP.length - 1]; up = -0.82; }
      const th = s.chord * s.tc * afHalf(xc) * up;
      const k = (j * AF_N + i) * 3;
      P[k] = s.o[0] + s.c[0] * s.chord * xc + s.n[0] * th;
      P[k + 1] = s.o[1] + s.c[1] * s.chord * xc + s.n[1] * th;
      P[k + 2] = s.o[2] + s.c[2] * s.chord * xc + s.n[2] * th;
      const col = i === AF_UP.length ? s.le : (up > 0 ? s.top : s.bot);
      C[k] = col[0]; C[k + 1] = col[1]; C[k + 2] = col[2];
    }
  }
  const c0 = centre(0);
  const c1 = centre(nv - 1);
  addGrid(acc, P, C, AF_N, nv, true, [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2, (c0[2] + c1[2]) / 2]);
  if (capEnd) {
    // Tip cap: the last ring fanned to its own centre, facing away from the root.
    const j = nv - 1;
    const Q = new Float64Array(AF_N * 2 * 3);
    const D = new Float64Array(AF_N * 2 * 3);
    for (let i = 0; i < AF_N; i += 1) {
      const k = (j * AF_N + i) * 3;
      Q.set([P[k], P[k + 1], P[k + 2]], i * 3);
      Q.set(c1, (AF_N + i) * 3);
      D.set([C[k], C[k + 1], C[k + 2]], i * 3);
      D.set([C[k], C[k + 1], C[k + 2]], (AF_N + i) * 3);
    }
    addGrid(acc, Q, D, AF_N, 2, true, c0);
  }
}

/** Fuselage section at station z: width, top and bottom heights from the spec's profile. */
function fuselageAt(f, z) {
  const zNose = f.L / 2;
  const zTail = -f.L / 2;
  const zf = zNose - f.noseL;
  const za = zTail + f.tailL;
  let w = f.W; let yTop = f.cy + f.H; let yBot = f.cy - f.H;
  if (f.hump) {
    const k = smooth(f.hump.z0, f.hump.z0 + f.hump.ramp, z) * (1 - smooth(f.hump.z1 - f.hump.ramp2, f.hump.z1, z));
    yTop += f.hump.h * k;
  }
  if (z > zf) {
    const u = Math.min(1, (z - zf) / f.noseL);
    const q = Math.max(0, 1 - u ** f.noseP) ** (1 / f.noseP);
    const drop = f.noseDroop * f.H * u * u;
    w *= q;
    const mid = (yTop + yBot) / 2 - drop;
    const half = ((yTop - yBot) / 2) * q;
    yTop = mid + half; yBot = mid - half;
  } else if (z < za) {
    const u = Math.min(1, (za - z) / f.tailL);
    const q = Math.max(f.tailTip, 1 - u ** 1.7);
    const rise = f.tailRise * f.H * u ** 1.8;
    w *= q;
    const mid = (yTop + yBot) / 2 + rise;
    const half = ((yTop - yBot) / 2) * q * 0.84;
    yTop = mid + half; yBot = mid - half;
  }
  return { w, yTop, yBot, cy: (yTop + yBot) / 2, hh: (yTop - yBot) / 2 };
}

/** The ring point of the fuselage at station z and ring angle phi, pushed out by `off`. */
function fusePoint(f, z, phi, off = 0) {
  const s = fuselageAt(f, z);
  let x = s.w * spow(Math.cos(phi), 2 / f.n);
  let y = s.hh * spow(Math.sin(phi), 2 / f.n);
  if (off) {
    const l = Math.hypot(x, y) || 1;
    x += (x / l) * off; y += (y / l) * off;
  }
  return [x, s.cy + y, z];
}

function fuselageStations(f, nStations) {
  const zTail = -f.L / 2;
  const zf = f.L / 2 - f.noseL;
  const za = zTail + f.tailL;
  const nNose = Math.round(nStations * 0.34);
  const nTail = Math.round(nStations * 0.34);
  const nBody = nStations - nNose - nTail;
  const zs = [];
  for (let k = 0; k < nTail; k += 1) zs.push(zTail + (1 - Math.cos((k / nTail) * Math.PI / 2)) * f.tailL * 0.999);
  for (let k = 0; k < nBody; k += 1) zs.push(za + (zf - za) * (k / nBody));
  for (let k = 0; k <= nNose; k += 1) zs.push(zf + Math.sin((k / nNose) * Math.PI / 2) * f.noseL * 0.9995);
  return zs;
}

function addFuselage(acc, f, nu, nStations, paint = PAINT, bellyMix = 0.92) {
  const zs = fuselageStations(f, nStations);
  const nv = zs.length;
  const P = new Float64Array(nu * nv * 3);
  const C = new Float64Array(nu * nv * 3);
  for (let j = 0; j < nv; j += 1) {
    for (let i = 0; i < nu; i += 1) {
      const phi = (i / nu) * Math.PI * 2;
      const p = fusePoint(f, zs[j], phi);
      const k = (j * nu + i) * 3;
      P[k] = p[0]; P[k + 1] = p[1]; P[k + 2] = p[2];
      // Belly in the shadow tone, fading up the flank.
      const col = mixRgb(paint.body, paint.shade, smooth(0.05, -0.75, Math.sin(phi)) * bellyMix);
      C[k] = col[0]; C[k + 1] = col[1]; C[k + 2] = col[2];
    }
  }
  addGrid(acc, P, C, nu, nv, true, [0, f.cy, 0]);
}

/** A band laid on the fuselage between two ring angles over a run of stations. */
function addFuseBand(acc, f, zA, zB, phiA, phiB, off, col, nz = 28, nphi = 2) {
  const P = new Float64Array((nphi + 1) * (nz + 1) * 3);
  const C = new Float64Array((nphi + 1) * (nz + 1) * 3);
  for (let j = 0; j <= nz; j += 1) {
    const z = zA + (zB - zA) * (j / nz);
    for (let i = 0; i <= nphi; i += 1) {
      const p = fusePoint(f, z, phiA + (phiB - phiA) * (i / nphi), off);
      const k = (j * (nphi + 1) + i) * 3;
      P[k] = p[0]; P[k + 1] = p[1]; P[k + 2] = p[2];
      C[k] = col[0]; C[k + 1] = col[1]; C[k + 2] = col[2];
    }
  }
  addGrid(acc, P, C, nphi + 1, nz + 1, false, [0, f.cy, (zA + zB) / 2]);
}

function addWing(acc, w, side, accent) {
  const ts = [0, w.kinkT, (w.kinkT + 1) / 2 + 0.06, 1];
  const secs = ts.map((t) => {
    const x = w.rootX + (w.halfSpan - w.rootX) * t;
    const chord = t <= w.kinkT
      ? w.rootChord + (w.kinkChord - w.rootChord) * (t / w.kinkT)
      : w.kinkChord + (w.tipChord - w.kinkChord) * ((t - w.kinkT) / (1 - w.kinkT));
    return {
      o: [side * x, w.yRoot + Math.tan(w.dihedral) * (x - w.rootX), w.zLE - Math.tan(w.sweepLE) * (x - w.rootX)],
      c: [0, 0, -1],
      n: [0, 1, 0],
      chord,
      tc: w.tc[0] + (w.tc[2] - w.tc[0]) * t,
      top: PAINT.wingTop,
      bot: PAINT.shade,
      le: mixRgb(PAINT.wingTop, PAINT.shade, 0.35),
    };
  });
  addLoft(acc, secs, true);
  if (w.winglet) {
    const tip = secs[secs.length - 1];
    const wl = [0, 1].map((k) => ({
      o: [tip.o[0] + side * 0.02, tip.o[1] + k * w.winglet - 0.04, tip.o[2] - k * w.winglet * 0.6],
      c: [0, 0, -1],
      n: [1, 0, 0],
      chord: tip.chord * (k ? 0.45 : 1.0),
      tc: 0.1,
      top: accent, bot: accent, le: accent,
    }));
    addLoft(acc, wl, true);
  }
}

function addTail(acc, t, accent, paint = PAINT, coarse = false) {
  const fin = t.fin;
  addLoft(acc, [0, 0.5, 1].map((k) => ({
    o: [0, fin.yRoot + fin.height * k, fin.zLE - Math.tan(fin.sweep) * fin.height * k],
    c: [0, 0, -1],
    n: [1, 0, 0],
    chord: fin.rootChord + (fin.tipChord - fin.rootChord) * k,
    tc: fin.tc,
    top: accent, bot: accent, le: accent,
  })), true, coarse);
  const st = t.stab;
  for (const side of [-1, 1]) {
    addLoft(acc, [0, 0.55, 1].map((k) => {
      const x = st.rootX + (st.halfSpan - st.rootX) * k;
      return {
        o: [side * x, st.y + Math.tan(st.dihedral) * (x - st.rootX), st.zLE - Math.tan(st.sweep) * (x - st.rootX)],
        c: [0, 0, -1],
        n: [0, 1, 0],
        chord: st.rootChord + (st.tipChord - st.rootChord) * k,
        tc: st.tc,
        top: paint.wingTop, bot: paint.shade, le: mixRgb(paint.wingTop, paint.shade, 0.35),
      };
    }), true, coarse);
  }
}

function addNacelle(acc, x, y, z, r, ln) {
  const o = [x, y, z];
  const cowl = [
    [ln * 0.5, r * 0.80], [ln * 0.47, r * 0.92], [ln * 0.36, r * 1.0], [ln * 0.10, r * 1.0],
    [-ln * 0.20, r * 0.92], [-ln * 0.40, r * 0.74], [-ln * 0.50, r * 0.60],
  ];
  addLathe(acc, o, [0, 0, 1], cowl, 16,
    [PAINT.metal, PAINT.body, PAINT.body, PAINT.body, PAINT.body, PAINT.shade, PAINT.metal], [x, y, z]);
  // Intake wall (faces the axis), fan face, spinner and the exhaust nozzle with its plug.
  addLathe(acc, o, [0, 0, 1], [[ln * 0.5, r * 0.80], [ln * 0.40, r * 0.74], [ln * 0.34, r * 0.74]], 16,
    [PAINT.metal, PAINT.fan, PAINT.fan], [x, y, z], true);
  addLathe(acc, o, [0, 0, 1], [[ln * 0.34, r * 0.74], [ln * 0.34, r * 0.30], [ln * 0.34, r * 0.06]], 16,
    [PAINT.fan, PAINT.fan, PAINT.metal], [x, y, z - ln]);
  addLathe(acc, o, [0, 0, 1], [[ln * 0.34, r * 0.16], [ln * 0.42, r * 0.08], [ln * 0.46, 0.0]], 12,
    [PAINT.metal], [x, y, z - ln]);
  addLathe(acc, o, [0, 0, 1], [[-ln * 0.50, r * 0.60], [-ln * 0.46, r * 0.5], [-ln * 0.40, r * 0.3], [-ln * 0.62, 0.02]], 14,
    [PAINT.fan, PAINT.metal, PAINT.metal, PAINT.shade], [x, y, z + ln]);
}

function addWheel(acc, x, y, z, r, w) {
  addLathe(acc, [x, y, z], [1, 0, 0], [[-w / 2, 0], [-w / 2, r], [w / 2, r], [w / 2, 0]], 10,
    [PAINT.tyre, PAINT.tyre, PAINT.tyre, PAINT.metal], [x, y, z]);
}

function addStrut(acc, x, y0, y1, z, r) {
  addLathe(acc, [x, 0, z], [0, 1, 0], [[y0, r], [y1, r * 0.8]], 6, [PAINT.gear], [x, 0, z]);
}

function addGear(acc, wheelR, wheelW, nose, main) {
  addStrut(acc, 0, wheelR, nose.top, nose.z, wheelR * 0.18);
  for (const dx of [-1, 1]) addWheel(acc, dx * wheelR * 0.62, wheelR, nose.z, wheelR * 0.86, wheelW * 0.8);
  for (const m of main) {
    const rows = m.rows ?? 1;
    for (const side of [-1, 1]) {
      const x = side * m.x;
      addStrut(acc, x, wheelR, m.top, m.z, wheelR * 0.24);
      addSlab(acc, x, wheelR * 1.5, m.z, wheelR * 2.2, wheelR * 0.3, wheelR * 2.5 * (rows - 1) + wheelR * 1.6, PAINT.gear);
      for (let r = 0; r < rows; r += 1) {
        const dz = rows === 1 ? 0 : (r - (rows - 1) / 2) * wheelR * 2.5;
        for (const dx of [-1, 1]) addWheel(acc, x + dx * wheelR * 0.62, wheelR, m.z + dz, wheelR, wheelW);
      }
    }
  }
}

const AIRFRAMES = Object.freeze({
  a380: {
    nu: 30, stations: 46, accentKey: 'red',
    f: {
      L: 18.0, W: 0.90, H: 1.05, cy: 1.77, n: 2.45, noseL: 3.5, tailL: 6.0, noseP: 2.1, noseDroop: 0.30,
      tailRise: 0.85, tailTip: 0.045,
    },
    wing: {
      rootX: 0.40, halfSpan: 9.93, zLE: 1.7, yRoot: 1.20, rootChord: 4.7, kinkT: 0.40, kinkChord: 3.1,
      tipChord: 1.1, sweepLE: 0.62, dihedral: 0.10, tc: [0.135, 0.115, 0.095], winglet: 0.55,
    },
    tail: {
      fin: { yRoot: 2.2, height: 3.8, rootChord: 3.5, tipChord: 1.3, zLE: -3.7, sweep: 0.70, tc: 0.11 },
      stab: { y: 2.05, rootX: 0.4, halfSpan: 3.8, rootChord: 2.4, tipChord: 0.8, zLE: -5.8, sweep: 0.62, dihedral: 0.12, tc: 0.10 },
    },
    engines: [{ x: 3.1, r: 0.43, ln: 1.9, dz: 0.30 }, { x: 6.3, r: 0.40, ln: 1.8, dz: 0.30 }],
    windows: { zA: 7.4, zB: -6.2, deck: [0.10, 0.28], upper: { zA: 6.4, zB: -3.4, phi: [0.60, 0.74] }, stripe: [-0.12, -0.05] },
    cockpit: [1.05, 2.15],
    gear: { wheelR: 0.175, wheelW: 0.13, nose: { z: 5.3, top: 1.0 }, main: [{ x: 2.3, z: -1.0, top: 1.30, rows: 2 }, { x: 0.7, z: -1.9, top: 0.90, rows: 2 }] },
  },
  '747': {
    nu: 28, stations: 42, accentKey: 'navy',
    f: {
      L: 17.5, W: 0.80, H: 0.88, cy: 1.50, n: 2.45, noseL: 3.2, tailL: 5.4, noseP: 2.0, noseDroop: 0.30,
      tailRise: 0.85, tailTip: 0.045, hump: { z0: 1.8, ramp: 1.8, z1: 7.6, ramp2: 2.6, h: 0.36 },
    },
    wing: {
      rootX: 0.36, halfSpan: 7.98, zLE: 1.6, yRoot: 1.0, rootChord: 3.9, kinkT: 0.42, kinkChord: 2.4,
      tipChord: 0.85, sweepLE: 0.69, dihedral: 0.10, tc: [0.13, 0.11, 0.09], winglet: 0.45,
    },
    tail: {
      fin: { yRoot: 1.85, height: 3.0, rootChord: 3.0, tipChord: 1.15, zLE: -3.7, sweep: 0.72, tc: 0.10 },
      stab: { y: 1.8, rootX: 0.35, halfSpan: 3.3, rootChord: 2.1, tipChord: 0.7, zLE: -5.9, sweep: 0.63, dihedral: 0.11, tc: 0.10 },
    },
    engines: [{ x: 2.8, r: 0.35, ln: 1.55, dz: 0.30 }, { x: 5.6, r: 0.33, ln: 1.5, dz: 0.30 }],
    windows: { zA: 6.6, zB: -5.8, deck: [0.10, 0.28], upper: { zA: 6.9, zB: 2.6, phi: [0.78, 0.92] }, stripe: [-0.12, -0.05] },
    cockpit: [0.95, 2.05],
    gear: { wheelR: 0.16, wheelW: 0.12, nose: { z: 5.0, top: 0.95 }, main: [{ x: 1.9, z: -1.0, top: 1.12, rows: 2 }, { x: 0.65, z: -1.8, top: 0.82, rows: 2 }] },
  },
  'private-jet': {
    nu: 30, stations: 44, accentKey: 'gold',
    f: {
      L: 5.0, W: 0.26, H: 0.27, cy: 0.56, n: 2.3, noseL: 1.35, tailL: 1.9, noseP: 2.1, noseDroop: 0.35,
      tailRise: 0.7, tailTip: 0.06,
    },
    wing: {
      rootX: 0.12, halfSpan: 2.21, zLE: 0.35, yRoot: 0.42, rootChord: 1.15, kinkT: 0.5, kinkChord: 0.75,
      tipChord: 0.4, sweepLE: 0.55, dihedral: 0.07, tc: [0.12, 0.105, 0.09], winglet: 0.2,
    },
    tail: {
      fin: { yRoot: 0.55, height: 0.95, rootChord: 1.0, tipChord: 0.55, zLE: -1.3, sweep: 0.62, tc: 0.10 },
      stab: { y: 1.5, rootX: 0.04, halfSpan: 0.8, rootChord: 0.62, tipChord: 0.28, zLE: -1.84, sweep: 0.5, dihedral: 0.02, tc: 0.09 },
    },
    engines: [{ x: 0.42, r: 0.11, ln: 0.62, y: 0.78, z: -1.3, rear: true }],
    windows: { zA: 1.6, zB: -1.5, deck: [0.10, 0.30], stripe: [-0.14, -0.06] },
    cockpit: [0.45, 0.85],
    gear: { wheelR: 0.075, wheelW: 0.06, nose: { z: 1.6, top: 0.30 }, main: [{ x: 0.3, z: -0.25, top: 0.50, rows: 1 }] },
  },
});

/** One vertex-coloured BufferGeometry for an airframe: position, normal, colour, index. */
function buildBaselineAirframe(kind, livery = {}) {
  const sp = AIRFRAMES[kind] ?? AIRFRAMES['private-jet'];
  const accent = hexRgb(livery.accent ?? TASTE.accent[sp.accentKey]);
  const acc = newAcc();
  const { f } = sp;
  addFuselage(acc, f, sp.nu, sp.stations);
  // Window bands, the livery stripe and the windscreen, laid a few mm proud of the skin.
  const wd = sp.windows;
  const flipPhi = (pair, port) => (port ? [Math.PI - pair[1], Math.PI - pair[0]] : pair);
  for (const port of [false, true]) {
    const [da, db] = flipPhi(wd.deck, port);
    addFuseBand(acc, f, wd.zA, wd.zB, da, db, 0.006, PAINT.windows, 36);
    if (wd.upper) {
      const [ua, ub] = flipPhi(wd.upper.phi, port);
      addFuseBand(acc, f, wd.upper.zA, wd.upper.zB, ua, ub, 0.006, PAINT.windows, 28);
    }
    const [sa, sb] = flipPhi(wd.stripe, port);
    addFuseBand(acc, f, wd.zA + 0.5, wd.zB - 0.2, sa, sb, 0.005, accent, 36);
  }
  addFuseBand(acc, f, f.L / 2 - f.noseL * 0.66, f.L / 2 - f.noseL * 0.34, sp.cockpit[0], sp.cockpit[1], 0.006, PAINT.glass, 4, 6);
  addWing(acc, sp.wing, 1, accent);
  addWing(acc, sp.wing, -1, accent);
  addTail(acc, sp.tail, accent);
  for (const e of sp.engines) {
    for (const side of [-1, 1]) {
      const x = side * e.x;
      let y; let z;
      if (e.rear) {
        y = e.y; z = e.z;
        // Stub from the fuselage flank to the nacelle.
        addSlab(acc, side * (f.W * 0.9 + (e.x - f.W) * 0.45), y - 0.02, z, e.x - f.W * 0.8, 0.07, 0.34, PAINT.body);
      } else {
        const w = sp.wing;
        const wy = w.yRoot + Math.tan(w.dihedral) * (e.x - w.rootX);
        z = w.zLE - Math.tan(w.sweepLE) * (e.x - w.rootX) + e.dz;
        y = Math.max(sp.gear.wheelR + 0.25, wy - 0.34 - e.r * 0.70);
        // Pylon from the nacelle crown up into the wing.
        addSlab(acc, x, (y + e.r + wy) / 2 - 0.02, z - 0.1, 0.10, Math.max(0.05, wy - (y + e.r) + 0.10), e.ln * 0.5, PAINT.body);
      }
      addNacelle(acc, x, y, z, e.r, e.ln);
    }
  }
  addGear(acc, sp.gear.wheelR, sp.gear.wheelW, sp.gear.nose, sp.gear.main);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.col, 3));
  geo.setIndex(acc.idx);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

// AF1: values are deliberately URL-addressable for the serial capture stage.
export const AF1_DEFAULTS = Object.freeze({
  af1BodyV: 83,
  af1BodyS: 10,
  af1FinS: 24,
  af1AccentS: 52,
  af1AccentWidth: 1,
  af1BellyDrop: 10,
  af1ShadeFill: 1,
  af1LodDistance: 85,
});
const AF1_LIMITS = { af1BodyV: [70, 90], af1BodyS: [4, 16], af1FinS: [15, 29],
  af1AccentS: [30, 60], af1AccentWidth: [0.4, 1.6], af1BellyDrop: [6, 16],
  af1ShadeFill: [0.3, 1.8], af1LodDistance: [55, 140] };

export function airframeOptions(options = {}) {
  const q = new URLSearchParams(options.search ?? globalThis.location?.search ?? '');
  const out = { form: options.form ?? q.get('af1Form') !== '0', tier: options.tier ?? q.get('af1Tier') ?? 'near' };
  for (const [key, value] of Object.entries(AF1_DEFAULTS)) {
    const raw = options[key] ?? q.get(key);
    const number = raw === null || raw === '' ? value : Number(raw);
    out[key] = Number.isFinite(number) ? Math.max(AF1_LIMITS[key][0], Math.min(AF1_LIMITS[key][1], number)) : value;
  }
  return out;
}

function hsvRgb(h, s, v) {
  s /= 100; v /= 100;
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  const rgb = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return new THREE.Color().setRGB(...rgb.map(n => n + m), THREE.SRGBColorSpace).toArray();
}

function formPaint(sp, livery, opt) {
  const source = new THREE.Color(livery.accent ?? TASTE.accent[sp.accentKey]);
  const hsl = source.getHSL({}, THREE.SRGBColorSpace);
  return { ...PAINT, body: hsvRgb(40, opt.af1BodyS, opt.af1BodyV),
    shade: hsvRgb(40, opt.af1BodyS, opt.af1BodyV - opt.af1BellyDrop),
    wingTop: hsvRgb(40, 12, 75), seam: hsvRgb(40, 12, 57),
    fin: hsvRgb(hsl.h * 360, opt.af1FinS, 56), accent: hsvRgb(hsl.h * 360, opt.af1AccentS, 62),
    soot: hsvRgb(35, 12, 42), walkway: hsvRgb(40, 12, 62) };
}

function finishAirframe(acc, parts, opt) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.col, 3));
  geo.setIndex(acc.idx);
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  geo.userData.af1 = { tier: opt.tier, parts, scale: 0.25 };
  return geo;
}

/** Polygon fan, and narrow outline strips, evaluated directly on the loft skin. */
function skinPolygon(acc, f, points, colour, outline = false) {
  const mapped = points.map(([z, phi]) => fusePoint(f, z, phi, 0.004));
  if (outline) {
    const centre = points.reduce((a, p) => [a[0] + p[0] / points.length, a[1] + p[1] / points.length], [0, 0]);
    const inner = points.map(p => fusePoint(f, centre[0] + (p[0] - centre[0]) * 0.945,
      centre[1] + (p[1] - centre[1]) * 0.96, 0.0045));
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      addGrid(acc, [...mapped[i], ...mapped[j], ...inner[i], ...inner[j]], [...colour, ...colour, ...colour, ...colour],
        2, 2, false, [0, f.cy, points[i][0]]);
    }
  } else {
    // Six corners give the small panes a chamfer without a separate material or texture.
    const base = acc.pos.length / 3;
    const a = new THREE.Vector3(...mapped[0]), b = new THREE.Vector3(...mapped[1]), c = new THREE.Vector3(...mapped[2]);
    const normal = b.sub(a).cross(c.sub(a)).normalize();
    const outward = new THREE.Vector3(mapped[0][0], mapped[0][1] - f.cy, 0);
    const flip = normal.dot(outward) < 0;
    if (flip) normal.negate();
    for (const p of mapped) { acc.pos.push(...p); acc.nrm.push(...normal.toArray()); acc.col.push(...colour); }
    for (let i = 1; i < points.length - 1; i++) acc.idx.push(base, base + (flip ? i + 1 : i), base + (flip ? i : i + 1));
  }
}

function roundedSkinRect(acc, f, z, phi, width, height, colour, port, outline) {
  const start = acc.pos.length / 3;
  const section = fuselageAt(f, z);
  const y = fusePoint(f, z, phi)[1];
  const angle = yy => Math.asin(Math.min(0.98, Math.max(-0.98,
    spow((yy - section.cy) / section.hh, f.n / 2))));
  const lo = angle(y - height / 2), hi = angle(y + height / 2), dz = width / 2, dp = (hi - lo) * 0.14;
  const points = [[z - dz * 0.75, lo], [z + dz * 0.75, lo], [z + dz, lo + dp],
    [z + dz, hi - dp], [z + dz * 0.75, hi], [z - dz * 0.75, hi], [z - dz, hi - dp], [z - dz, lo + dp]];
  skinPolygon(acc, f, points.map(([zz, p]) => [zz, port ? Math.PI - p : p]), colour, outline);
  return { start, end: acc.pos.length / 3 };
}

function addFormWindows(acc, sp, paint, far, kind) {
  const wd = sp.windows, f = sp.f;
  const detail = { doors: [], cockpitPanes: [] };
  const doors = kind === 'a380' ? [[6.8, 3.5, -0.5, -4.8], [5.6, 2.5, -0.4, -2.8]]
    : kind === '747' ? [[6, 3.5, 0.6, -2.5, -5.0], [3.1]] : [[1.1]];
  for (const port of [false, true]) {
    for (const [deck, row] of [wd, wd.upper].entries()) {
      if (!row) continue;
      const pair = row.phi ?? row.deck, phi = (pair[0] + pair[1]) / 2;
      if (far) {
        const phis = port ? [Math.PI - pair[1], Math.PI - pair[0]] : pair;
        addFuseBand(acc, f, row.zA, row.zB, ...phis, 0.005, paint.windows, 9, 1);
      } else {
        const pitch = kind === 'private-jet' ? 0.28 : 0.24;
        for (let z = row.zB + pitch; z < row.zA - pitch; z += pitch) {
          if (doors[deck]?.some(d => Math.abs(d - z) < 0.22)) continue;
          roundedSkinRect(acc, f, z, phi, kind === 'private-jet' ? 0.10 : 0.095, 0.115, paint.windows, port, false);
        }
        for (const z of doors[deck] ?? []) detail.doors.push(roundedSkinRect(acc, f, z, phi - (deck ? 0.05 : 0.12),
          kind === 'private-jet' ? 0.20 : 0.27, kind === 'private-jet' ? 0.36 : 0.48, paint.seam, port, true));
      }
    }
    // Three separate panes on each side, following the nose with visible mullions.
    for (let i = 0; i < (far ? 1 : 3); i++) {
      const z = f.L / 2 - f.noseL * (far ? 0.54 : 0.40 + i * 0.115);
      const phi = kind === '747' ? 0.68 : 0.43;
      const w = f.noseL * (far ? 0.32 : 0.10);
      const points = [[z + w / 2, phi - 0.12], [z - w / 2, phi - 0.10],
        [z - w * 0.43, phi + 0.15], [z + w * 0.34, phi + 0.19]];
      const start = acc.pos.length / 3;
      skinPolygon(acc, f, points.map(([zz, p]) => [zz, port ? Math.PI - p : p]), paint.glass);
      detail.cockpitPanes.push({ start, end: acc.pos.length / 3 });
    }
  }
  return detail;
}

function wingSection(w, side, t, paint) {
  const x = w.rootX + (w.halfSpan - w.rootX) * t;
  return { o: [side * x, w.yRoot + Math.tan(w.dihedral) * (x - w.rootX), w.zLE - Math.tan(w.sweepLE) * (x - w.rootX)],
    c: [0, 0, -1], n: [0, 1, 0],
    chord: t <= w.kinkT ? w.rootChord + (w.kinkChord - w.rootChord) * t / w.kinkT
      : w.kinkChord + (w.tipChord - w.kinkChord) * (t - w.kinkT) / (1 - w.kinkT),
    tc: w.tc[0] + (w.tc[2] - w.tc[0]) * t, top: paint.wingTop, bot: paint.shade,
    le: mixRgb(paint.wingTop, paint.body, 0.30) };
}

function wingPoint(w, side, t, c, lift = 0.002) {
  // Interpolate the actual loft triangle. Analytic thickness between stations would
  // float above the triangulated skin, especially near the swept root.
  const ts = [0, w.kinkT, (w.kinkT + 1) / 2 + 0.06, 1];
  const tj = Math.max(1, ts.findIndex(x => x >= t)), t0 = ts[tj - 1], t1 = ts[tj];
  const xs = [0, ...AF_UP].sort((a, b) => a - b);
  const ci = Math.max(1, xs.findIndex(x => x >= c)), ca = xs[ci - 1], cb = xs[ci];
  const point = (span, chord) => {
    const s = wingSection(w, side, span, PAINT);
    return [s.o[0], s.o[1] + s.chord * s.tc * afHalf(chord) * 1.12, s.o[2] - s.chord * chord];
  };
  const a = point(t0, cb), b = point(t0, ca), d = point(t1, ca), e = point(t1, cb);
  const u = (cb - c) / (cb - ca), v = (t - t0) / (t1 - t0);
  const out = a.map((value, i) => u >= v ? value * (1 - u) + b[i] * (u - v) + d[i] * v
    : value * (1 - v) + d[i] * u + e[i] * (v - u));
  out[1] += lift;
  return out;
}

function wingRibbon(acc, w, side, t0, t1, c0, c1, paint) {
  const ts = [t0, w.kinkT, (w.kinkT + 1) / 2 + 0.06, t1].filter(t => t >= t0 && t <= t1).sort((a, b) => a - b);
  const p = [], c = [];
  for (const t of ts) for (const chord of [c0, c1]) { p.push(...wingPoint(w, side, t, chord)); c.push(...paint); }
  addGrid(acc, p, c, 2, ts.length, false, [0, -20, 0]);
}

/** Elliptical lathed fairing, with inverse-transpose normals after the oval scale. */
function addPod(acc, centre, length, width, height, paint, segments = 8) {
  const start = acc.pos.length;
  addLathe(acc, centre, [0, 0, 1], [[-length / 2, 0], [-length * 0.2, 1], [length * 0.25, 0.85], [length / 2, 0]],
    segments, [paint], centre);
  for (let k = start; k < acc.pos.length; k += 3) {
    acc.pos[k] = centre[0] + (acc.pos[k] - centre[0]) * width;
    acc.pos[k + 1] = centre[1] + (acc.pos[k + 1] - centre[1]) * height;
    const nx = acc.nrm[k] / width, ny = acc.nrm[k + 1] / height, nz = acc.nrm[k + 2], l = Math.hypot(nx, ny, nz) || 1;
    acc.nrm[k] = nx / l; acc.nrm[k + 1] = ny / l; acc.nrm[k + 2] = nz / l;
  }
}

function addFormWing(acc, sp, side, paint, far, kind) {
  const w = sp.wing;
  const secs = [0, w.kinkT, (w.kinkT + 1) / 2 + 0.06, 1].map(t => wingSection(w, side, t, paint));
  addLoft(acc, secs, true, far);
  const tip = secs.at(-1);
  if (w.winglet) addLoft(acc, [0, 1].map(k => ({ o: [tip.o[0] + side * 0.02,
    tip.o[1] + k * w.winglet - 0.04, tip.o[2] - k * w.winglet * 0.6], c: [0, 0, -1], n: [1, 0, 0],
    chord: tip.chord * (k ? 0.45 : 1), tc: 0.1, top: paint.fin, bot: paint.fin, le: paint.fin })), true, far);
  if (far) return;
  const size = kind === 'private-jet' ? 0.28 : 1;
  for (const t of kind === 'a380' ? [0.2, 0.38, 0.57, 0.75] : kind === '747' ? [0.22, 0.44, 0.68] : [0.3, 0.65]) {
    const s = wingSection(w, side, t, paint);
    addPod(acc, [s.o[0], s.o[1] - 0.08 * size, s.o[2] - s.chord + 0.14 * size],
      0.95 * size, 0.065 * size, 0.095 * size, paint.wingTop);
  }
  // Slat, flap and outboard aileron joints sit 2 mm proud; the pale adjacent lip catches the key.
  for (const chord of [0.20, 0.72]) {
    wingRibbon(acc, w, side, 0.08, 0.96, chord, chord + 0.006, paint.seam);
    wingRibbon(acc, w, side, 0.08, 0.96, chord + 0.006, chord + 0.009, paint.body);
  }
  wingRibbon(acc, w, side, 0.68, 0.684, 0.72, 1, paint.seam);
  wingRibbon(acc, w, side, 0.03, 0.11, 0.28, 0.78, paint.walkway);
}

function addFormEngine(acc, sp, e, side, paint, far) {
  const f = sp.f, w = sp.wing, x = side * e.x;
  const wy = w.yRoot + Math.tan(w.dihedral) * (e.x - w.rootX);
  const y = e.rear ? e.y : Math.max(sp.gear.wheelR + 0.25, wy - 0.34 - e.r * 0.70);
  const z = e.rear ? e.z : w.zLE - Math.tan(w.sweepLE) * (e.x - w.rootX) + e.dz;
  const seg = far ? 8 : 12, r = e.r, ln = e.ln, o = [x, y, z];
  addLoft(acc, [0, 0.5, 1].map(t => ({ o: e.rear
    ? [side * (f.W * 0.8 + (e.x - f.W * 0.8) * t), y + 0.015, z + ln * 0.3 - t * ln * 0.12]
    : [x, y + r * 0.78 + (wy - y - r * 0.78) * t, z + ln * (0.12 - 0.28 * t)],
    c: [0, 0, -1], n: e.rear ? [0, 1, 0] : [1, 0, 0], chord: ln * (0.64 - t * 0.18), tc: 0.13,
    top: paint.body, bot: paint.shade, le: paint.body })), true, far);
  addLathe(acc, o, [0, 0, 1], far ? [[ln * 0.5, r * 0.8], [ln * 0.28, r], [-ln * 0.22, r * 0.9], [-ln * 0.5, r * 0.60]]
    : [[ln * 0.5, r * 0.8], [ln * 0.47, r * 0.92], [ln * 0.30, r], [-ln * 0.10, r], [-ln * 0.38, r * 0.76], [-ln * 0.50, r * 0.60]],
    seg, far ? [paint.metal, paint.body, paint.body, paint.soot] : [paint.metal, paint.body, paint.body, paint.body, paint.shade, paint.soot], o);
  addLathe(acc, o, [0, 0, 1], [[ln * 0.5, r * 0.8], [ln * 0.34, r * 0.7]], seg, [paint.metal, paint.fan], o, true);
  addLathe(acc, o, [0, 0, 1], [[ln * 0.34, r * 0.7], [ln * 0.34, r * 0.16], [ln * 0.44, 0]], seg,
    [paint.fan, paint.metal, paint.metal], [x, y, z - ln]);
  addLathe(acc, o, [0, 0, 1], [[-ln * 0.50, r * 0.6], [-ln * 0.40, r * 0.30], [-ln * 0.62, 0.02]], seg,
    [paint.soot, paint.metal, paint.soot], [x, y, z + ln]);
}

function addFormWheel(acc, x, z, r, w, far, wheels) {
  const start = acc.pos.length / 3, seg = far ? 8 : 12;
  // Two angular samples straddle the bottom. Four vertices land on a real flat patch.
  const y = r * Math.cos(Math.PI / seg) * 0.995;
  const profile = far ? [[-w / 2, 0], [-w / 2, r], [w / 2, r], [w / 2, 0]]
    : [[-w / 2, 0], [-w / 2, r * 0.86], [-w * 0.32, r], [w * 0.32, r], [w / 2, r * 0.86], [w / 2, 0]];
  addLathe(acc, [x, y, z], [1, 0, 0], profile, seg,
    [PAINT.metal, PAINT.tyre, PAINT.tyre, PAINT.tyre, PAINT.tyre, PAINT.metal], [x, y, z], false, Math.PI / seg);
  for (let k = start * 3 + 1; k < acc.pos.length; k += 3) acc.pos[k] = Math.max(0, acc.pos[k]);
  wheels.push({ start, end: acc.pos.length / 3, x, z, radius: r });
}

function addFormGear(acc, sp, kind, far, paint) {
  const g = sp.gear, r = g.wheelR, wheels = [];
  addStrut(acc, 0, r * 0.8, g.nose.top, g.nose.z, r * 0.18);
  for (const side of [-1, 1]) addFormWheel(acc, side * r * 0.62, g.nose.z, r * 0.86, g.wheelW * 0.8, far, wheels);
  for (const [i, m] of g.main.entries()) for (const side of [-1, 1]) {
    const rows = kind === 'a380' && i === 1 ? 3 : (m.rows ?? 1), x = side * m.x;
    addStrut(acc, x, r, m.top, m.z, r * 0.24);
    addSlab(acc, x, r * 1.35, m.z, r * 2.2, r * 0.22, r * (2.3 * (rows - 1) + 1.2), paint.gear);
    for (let row = 0; row < rows; row++) for (const dx of [-1, 1])
      addFormWheel(acc, x + dx * r * 0.62, m.z + (row - (rows - 1) / 2) * r * 2.3, r, g.wheelW, far, wheels);
    if (!far) addSlab(acc, x + side * r * 0.75, m.top - r * 0.6, m.z, 0.015, r * 1.4, r * 3.6, paint.shade);
  }
  if (!far) for (const side of [-1, 1]) addSlab(acc, side * r * 0.9, g.nose.top - r * 0.45,
    g.nose.z, 0.012, r * 0.95, r * 3.0, paint.body);
  return wheels;
}

/** Near detail is traded against redundant ring tessellation, never added to a toy shell. */
export function buildAirframeGeometry(kind, livery = {}, options = {}) {
  const opt = airframeOptions(options);
  if (!opt.form) return buildBaselineAirframe(kind, livery);
  const sp = AIRFRAMES[kind] ?? AIRFRAMES['private-jet'], f = sp.f, far = opt.tier === 'far';
  const paint = formPaint(sp, livery, opt), acc = newAcc(), parts = {};
  const part = (name, fn) => { const start = acc.idx.length; const value = fn(); parts[name] = { start, count: acc.idx.length - start }; return value; };
  part('fuselage', () => addFuselage(acc, f, far ? 12 : 24, far ? 16 : kind === 'private-jet' ? 28 : 34, paint, 1));
  const detail = part('windows-doors-cockpit', () => addFormWindows(acc, sp, paint, far, kind));
  part('livery', () => {
    for (const port of [false, true]) {
      const centre = (sp.windows.stripe[0] + sp.windows.stripe[1]) / 2;
      const half = (sp.windows.stripe[1] - sp.windows.stripe[0]) * 0.5 * opt.af1AccentWidth;
      const pair = port ? [Math.PI - centre - half, Math.PI - centre + half] : [centre - half, centre + half];
      addFuseBand(acc, f, sp.windows.zA + 0.5, sp.windows.zB - 0.2, ...pair, 0.005, paint.accent, far ? 9 : 24, 1);
    }
  });
  part('wings-fairings-seams', () => { for (const side of [-1, 1]) addFormWing(acc, sp, side, paint, far, kind); });
  part('tail', () => addTail(acc, sp.tail, paint.fin, paint, far));
  part('engines-pylons-soot', () => { for (const e of sp.engines) for (const side of [-1, 1]) addFormEngine(acc, sp, e, side, paint, far); });
  const wheels = part('gear', () => addFormGear(acc, sp, kind, far, paint));
  part('belly-fairing', () => addPod(acc, [0, f.cy - f.H + f.W * 0.24, -sp.wing.rootChord * 0.20],
    sp.wing.rootChord * 1.35, f.W * 1.14, f.W * 0.28, paint.shade, far ? 8 : 12));
  part('apu', () => {
    const z = -f.L / 2, s = fuselageAt(f, z), r = f.W * f.tailTip;
    addLathe(acc, [0, s.cy, z + 0.03], [0, 0, -1], [[-0.03, r * 1.05], [0.028, r * 0.80], [0.026, 0]],
      far ? 6 : 10, [paint.shade, paint.metal, paint.fan], [0, s.cy, z + 1]);
  });
  if (!far) part('panel-radome-seams', () => {
    const zs = [f.L / 2 - f.noseL * 0.28, -f.L / 2 + f.tailL * 0.4, 0, f.L * 0.23];
    for (const z of zs) addFuseBand(acc, f, z - 0.003, z + 0.003, 0, Math.PI * 2, 0.003, paint.seam, 1, 24);
  });
  // The generic 20 m jet's kept T-tail was 3.1 cm taller than the declared 1.50 m envelope.
  if (kind === 'private-jet') for (let k = 1; k < acc.pos.length; k += 3) {
    acc.pos[k] *= 1.5 / 1.5308643579483032;
    const nx = acc.nrm[k - 1], ny = acc.nrm[k] * 1.5308643579483032 / 1.5, nz = acc.nrm[k + 1], l = Math.hypot(nx, ny, nz) || 1;
    acc.nrm[k - 1] = nx / l; acc.nrm[k] = ny / l; acc.nrm[k + 1] = nz / l;
  }
  const geo = finishAirframe(acc, parts, opt);
  geo.userData.af1.wheels = wheels;
  geo.userData.af1.detail = detail;
  return geo;
}

const formMaterials = new WeakMap();
const fallbackMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.08 });
function formMaterial(source, opt) {
  let variants = formMaterials.get(source);
  if (!variants) { variants = new Map(); formMaterials.set(source, variants); }
  if (variants.has(opt.af1ShadeFill)) return variants.get(opt.af1ShadeFill);
  const mat = source.clone();
  mat.name = 'af1-painted-airframe'; mat.vertexColors = true;
  mat.roughness = 0.62; mat.metalness = 0.05; mat.emissive.set(0); mat.emissiveIntensity = 0; mat.emissiveMap = null;
  mat.color.set('#ffffff');
  const originalCompile = source.onBeforeCompile, originalKey = source.customProgramCacheKey;
  mat.onBeforeCompile = function(shader, renderer) {
    originalCompile.call(this, shader, renderer);
    shader.uniforms.af1ShadeFill = { value: opt.af1ShadeFill };
    shader.fragmentShader = 'uniform float af1ShadeFill;\n' + shader.fragmentShader.replace('#include <lights_fragment_end>',
      '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse *= af1ShadeFill;');
  };
  mat.customProgramCacheKey = function() { return `${originalKey.call(source)}:af1-form`; };
  variants.set(opt.af1ShadeFill, mat);
  mat.addEventListener('dispose', () => variants.delete(opt.af1ShadeFill));
  return mat;
}

/** One draw at either distance. THREE's LOD update runs before colour and shadow lists. */
export function addPlane(kind, mats, livery = {}, options = {}) {
  const opt = airframeOptions(options), g = opt.form ? new THREE.LOD() : new THREE.Group();
  g.name = `fringe:plane:${kind}`; g.userData.kind = kind;
  const source = mats.airframe ?? fallbackMaterial;
  const near = buildAirframeGeometry(kind, livery, { ...opt, tier: 'near' });
  const mesh = new THREE.Mesh(near, opt.form ? formMaterial(source, opt) : source);
  // Existing batch and generic-LOD classifiers recognise craft / hull ownership.
  mesh.name = opt.form ? `plane:${kind}:aircraft:hull` : `plane:${kind}:airframe`;
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.raycast = () => {}; g.add(mesh);
  if (opt.form) {
    const far = buildAirframeGeometry(kind, livery, { ...opt, tier: 'far' });
    let disposed = false;
    const disposeOther = other => { if (disposed) return; disposed = true; other.dispose(); };
    near.addEventListener('dispose', () => disposeOther(far)); far.addEventListener('dispose', () => disposeOther(near));
    const origin = new THREE.Vector3(), eye = new THREE.Vector3();
    const forced = options.tier ?? new URLSearchParams(options.search ?? globalThis.location?.search ?? '').get('af1Tier');
    g.raycast = () => {};
    g.update = camera => {
      const distance = origin.setFromMatrixPosition(g.matrixWorld).distanceTo(eye.setFromMatrixPosition(camera.matrixWorld)) / camera.zoom;
      const threshold = opt.af1LodDistance + (mesh.geometry === far ? -5 : 5);
      mesh.geometry = forced === 'far' || (forced !== 'near' && distance > threshold) ? far : near;
    };
    if (forced === 'far') mesh.geometry = far;
  }
  return g;
}
