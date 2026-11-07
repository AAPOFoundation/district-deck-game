// Swing family — four variants. Shared kit only.
// MP bar (refs/3.jpg): yellow tubular A-frame, fat link chains, candy-red U-buckets.
// Frame is always sun. Seats are always a red U. Entry kit colour is ignored.
import {
  EXTRA, VOXEL_COLOURS, LEVEL_H,
  mat, box, cyl, boundsOf,
} from './_kit.js';
import { spanOf, variantIndexOf } from '../../core/playground-builder.js';
import * as THREE from 'three';

const STEEL = { metal: 0.58 };
const PAINT = { rough: 0.54 };
const PLASTIC = { rough: 0.38 };
const FRAME = VOXEL_COLOURS.sun;
/** Candy-red plastic. Untextured so the 20-px blob stays a flag, not wine paint. */
const SEAT = VOXEL_COLOURS.toyRed;
const LINK = '#c8cfd5';

const LINK_GEOM = new THREE.TorusGeometry(0.042, 0.019, 8, 10);
LINK_GEOM.scale(1, 1.52, 1);

/**
 * Front-view U extruded in depth. Two fat arms + scooped floor ARE the silhouette.
 * No sphere dish — that collapsed to an oval at 20 px.
 */
function makeUScoop(scale) {
  const X = (v) => v * scale;
  const Y = (v) => v * scale;
  const s = new THREE.Shape();
  s.moveTo(X(0.48), Y(0.00));
  s.lineTo(X(0.48), Y(0.78));
  s.lineTo(X(0.28), Y(0.78));
  s.lineTo(X(0.28), Y(0.20));
  s.quadraticCurveTo(X(0.18), Y(0.08), X(0.00), Y(0.06));
  s.quadraticCurveTo(X(-0.18), Y(0.08), X(-0.28), Y(0.20));
  s.lineTo(X(-0.28), Y(0.78));
  s.lineTo(X(-0.48), Y(0.78));
  s.lineTo(X(-0.48), Y(0.00));
  s.lineTo(X(0.48), Y(0.00));
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.68 * scale,
    bevelEnabled: true,
    bevelThickness: 0.022 * scale,
    bevelSize: 0.018 * scale,
    bevelSegments: 2,
    curveSegments: 8,
    steps: 1,
  });
  g.translate(0, 0, -0.34 * scale);
  return g;
}

const SCOOP_SHELL = makeUScoop(1.34);
const SCOOP_WELL = makeUScoop(1.04);
const NEST_GEOM = new THREE.LatheGeometry([
  new THREE.Vector2(0.018, 0.000),
  new THREE.Vector2(0.260, 0.018),
  new THREE.Vector2(0.380, 0.120),
  new THREE.Vector2(0.440, 0.300),
  new THREE.Vector2(0.490, 0.520),
  new THREE.Vector2(0.460, 0.560),
  new THREE.Vector2(0.400, 0.400),
  new THREE.Vector2(0.240, 0.080),
  new THREE.Vector2(0.018, 0.030),
], 16);
const NEST_RING = new THREE.TorusGeometry(0.30, 0.020, 6, 12);

const SCOOP_MATS = new Map();

function scoopMat(colour, extras = {}) {
  const side = extras.side ?? THREE.DoubleSide;
  const key = `${colour}:${extras.rough ?? 0.38}:${extras.metal ?? 0.05}:${extras.tint ?? 1}:${side}`;
  if (!SCOOP_MATS.has(key)) {
    const m = mat(colour, extras).clone();
    m.side = side;
    SCOOP_MATS.set(key, m);
  }
  return SCOOP_MATS.get(key);
}

function paintBox(group, colour, w, h, d, x, y, z, extras = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), scoopMat(colour, extras));
  mesh.position.set(x, y, z);
  if (extras.rot) mesh.rotation.set(extras.rot[0] ?? 0, extras.rot[1] ?? 0, extras.rot[2] ?? 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

export function buildSwing(group, entry, base, _colour) {
  const v = variantIndexOf(entry.variant);
  if (v === 1) return buildSwingBasket(group, entry, base);
  if (v === 2) return buildSwingNest(group, entry, base);
  if (v === 3) return buildSwingExtra(group, entry, base);
  return buildSwingBay(group, entry, base);
}

function metrics(entry, base) {
  const b = boundsOf(entry);
  const { w } = spanOf(entry.id, entry.yaw ?? 0, entry.variant);
  const alongX = w > 1;
  const beamY = base + LEVEL_H * 2 - 0.16;
  // A-frames splay into the reserved swing-clear cells, not the 1-cell footprint.
  const depth = alongX ? b.d : b.w;
  const spread = depth < 1.4 ? 0.70 : Math.min(0.84, depth * 0.40);
  return { b, alongX, beamY, spread };
}

function addMesh(group, geom, colour, x, y, z, extras = {}) {
  const usePaint = extras.double || colour === SEAT;
  const mesh = new THREE.Mesh(geom, usePaint ? scoopMat(colour, extras) : mat(colour, extras));
  mesh.position.set(x, y, z);
  if (extras.rot) mesh.rotation.set(extras.rot[0] ?? 0, extras.rot[1] ?? 0, extras.rot[2] ?? 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function seatPair(b, alongX) {
  const span = alongX ? b.w : b.d;
  const off = Math.min(0.74, span * 0.32);
  return alongX
    ? [[b.cx - off, b.cz], [b.cx + off, b.cz]]
    : [[b.cx, b.cz - off], [b.cx, b.cz + off]];
}

/** One A-end: two leaned sun tubes, black foot plates, fat yellow spreader, apex elbows. */
function aFrame(group, px, pz, base, beamY, alongX, spread) {
  const rise = beamY - base;
  const legLen = Math.hypot(spread, rise);
  const lean = Math.atan2(spread, rise);
  const midY = (base + beamY) / 2;
  for (const s of [-1, 1]) {
    const fx = alongX ? px : px + s * spread;
    const fz = alongX ? pz + s * spread : pz;
    const mx = alongX ? px : px + s * (spread * 0.5);
    const mz = alongX ? pz + s * (spread * 0.5) : pz;
    const rot = alongX ? [-s * lean, 0, 0] : [0, 0, s * lean];
    cyl(group, FRAME, 0.066, legLen, mx, midY, mz, 8, { ...PAINT, rot });
    box(group, EXTRA.rubberSole, 0.42, 0.050, 0.42, fx, base + 0.024, fz, { rough: 0.92, tint: 0.72 });
    for (const dx of [-0.11, 0.11]) {
      for (const dz of [-0.11, 0.11]) {
        cyl(group, VOXEL_COLOURS.steel, 0.020, 0.022, fx + dx, base + 0.056, fz + dz, 5, STEEL);
      }
    }
    cyl(group, FRAME, 0.082, 0.08, fx, base + 0.070, fz, 8, PAINT);
  }
  box(group, FRAME,
    alongX ? 0.16 : 0.22, 0.14, alongX ? 0.22 : 0.16,
    px, beamY, pz, PAINT);
  for (const s of [-1, 1]) {
    cyl(group, FRAME, 0.090, 0.12,
      alongX ? px : px + s * 0.04,
      beamY,
      alongX ? pz + s * 0.04 : pz,
      8, PAINT);
  }
  const t = 0.34;
  const braceY = base + rise * t;
  const braceLen = spread * (1 - t) * 2;
  cyl(group, FRAME, 0.060, braceLen, px, braceY, pz, 8, {
    ...PAINT,
    rot: alongX ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2],
  });
}

function paintBeam(group, b, alongX, beamY, inset = 0.08) {
  const len = (alongX ? b.w : b.d) - inset * 2;
  const rot = alongX ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0];
  cyl(group, FRAME, 0.074, len, b.cx, beamY, b.cz, 8, { ...PAINT, rot });
  for (const s of [-1, 1]) {
    const x = alongX ? b.cx + s * (len / 2) : b.cx;
    const z = alongX ? b.cz : b.cz + s * (len / 2);
    cyl(group, FRAME, 0.092, 0.10, x, beamY, z, 8, { ...PAINT, rot });
    box(group, FRAME,
      alongX ? 0.14 : 0.20, 0.14, alongX ? 0.20 : 0.14,
      x, beamY, z, PAINT);
  }
}

/** Yellow bar between the two buckets — the MP two-seater reads even small. */
function seatSpreader(group, a, c, alongX, y) {
  const dx = c[0] - a[0];
  const dz = c[2] - a[2];
  const len = Math.hypot(dx, dz) * 0.70;
  const mx = (a[0] + c[0]) / 2;
  const mz = (a[2] + c[2]) / 2;
  cyl(group, FRAME, 0.050, len, mx, y, mz, 8, {
    ...PAINT,
    rot: alongX ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0],
  });
  const xw = alongX ? 0.15 : 0.034;
  const zw = alongX ? 0.034 : 0.15;
  box(group, EXTRA.rubberSole, xw, 0.028, zw, mx, y + 0.042, mz, {
    rough: 0.92, tint: 0.70, rot: [0, 0.55, 0],
  });
  box(group, EXTRA.rubberSole, xw, 0.028, zw, mx, y + 0.042, mz, {
    rough: 0.92, tint: 0.70, rot: [0, -0.55, 0],
  });
}

/** Free end of an extra bay — a plate and bolts, not a second A. */
function boltFlange(group, b, alongX, beamY) {
  const x = alongX ? b.minX + 0.10 : b.cx;
  const z = alongX ? b.cz : b.minZ + 0.10;
  box(group, VOXEL_COLOURS.steel,
    alongX ? 0.05 : 0.24, 0.24, alongX ? 0.24 : 0.05,
    x, beamY, z, STEEL);
  cyl(group, VOXEL_COLOURS.steel, 0.06, 0.10,
    alongX ? x + 0.04 : x, beamY, alongX ? z : z + 0.04, 8, {
      ...STEEL,
      rot: alongX ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0],
    });
  for (const u of [-0.06, 0.06]) {
    for (const v of [-0.055, 0.055]) {
      cyl(group, VOXEL_COLOURS.steel, 0.014, 0.036,
        x + (alongX ? -0.012 : u),
        beamY + v,
        z + (alongX ? u : -0.012),
        5, {
          ...STEEL,
          rot: alongX ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0],
        });
    }
  }
}

function hanger(group, x, beamY, z) {
  box(group, VOXEL_COLOURS.steel, 0.07, 0.055, 0.055, x, beamY - 0.062, z, STEEL);
  cyl(group, VOXEL_COLOURS.steel, 0.016, 0.050, x, beamY - 0.094, z, 5, STEEL);
}

function chainLinks(group, x0, y0, z0, x1, y1, z1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz);
  const n = Math.max(7, Math.round(len / 0.058));
  const horiz = Math.hypot(dx, dz);
  const linkMat = mat(LINK, STEEL);
  for (let i = 0; i < n; i += 1) {
    const t = (i + 0.5) / n;
    const ring = new THREE.Mesh(LINK_GEOM, linkMat);
    ring.position.set(x0 + dx * t, y0 + dy * t, z0 + dz * t);
    if (horiz < 1e-4) {
      ring.rotation.x = 0;
      if (i % 2 === 1) ring.rotation.y = Math.PI / 2;
    } else {
      ring.lookAt(x1, y1, z1);
      ring.rotateX(Math.PI / 2);
      if (i % 2 === 1) ring.rotateY(Math.PI / 2);
    }
    ring.castShadow = true;
    group.add(ring);
  }
}

function pairChains(group, sx, sz, beamY, attachY, alongX, half, sway = 0.14) {
  const ox = alongX ? 0 : sway;
  const oz = alongX ? sway : 0;
  for (const s of [-1, 1]) {
    const ax = alongX ? sx + s * half : sx;
    const az = alongX ? sz : sz + s * half;
    hanger(group, ax, beamY, az);
    chainLinks(group, ax, beamY - 0.10, az, ax + ox, attachY, az + oz);
  }
}

/**
 * Candy-red toddler bucket. Outer contour is a U (extrude + high back + arms).
 * Inner is still candy; a small dark sit pad is the hollow, not a wine crate.
 * Tilted so the iso camera looks in.
 */
function scoopedBucket(group, sx, sy, sz, alongX, sway = 0.14) {
  const g = new THREE.Group();
  const ox = alongX ? 0 : sway;
  const oz = alongX ? sway : 0;
  g.position.set(sx + ox, sy, sz + oz);
  g.rotation.order = 'YXZ';
  g.rotation.y = alongX ? 0.10 : Math.PI / 2 + 0.10;
  g.rotation.x = -0.28;
  g.rotation.z = 0.08;

  const shell = new THREE.Mesh(SCOOP_SHELL, scoopMat(SEAT, PLASTIC));
  shell.castShadow = true;
  shell.receiveShadow = true;
  g.add(shell);

  const liner = new THREE.Mesh(SCOOP_WELL, scoopMat(SEAT, { ...PLASTIC, tint: 0.90 }));
  liner.position.set(0, 0.05, 0.02);
  liner.castShadow = true;
  liner.receiveShadow = true;
  g.add(liner);

  // High back + side arms so the U survives a 20-pixel iso blob.
  paintBox(g, SEAT, 0.96, 0.52, 0.13, 0, 0.62, -0.34, PLASTIC);
  paintBox(g, SEAT, 0.64, 0.10, 0.12, 0, 0.90, -0.32, PLASTIC);
  for (const s of [-1, 1]) {
    paintBox(g, SEAT, 0.14, 0.28, 0.50, s * 0.42, 0.60, -0.02, PLASTIC);
    paintBox(g, SEAT, 0.12, 0.10, 0.34, s * 0.42, 0.78, 0.04, PLASTIC);
    box(g, VOXEL_COLOURS.steel, 0.050, 0.060, 0.045, s * 0.36, 0.84, -0.10, STEEL);
  }
  paintBox(g, EXTRA.rubberSole, 0.46, 0.05, 0.32, 0, 0.14, 0.04, { rough: 0.88 });
  paintBox(g, SEAT, 0.58, 0.11, 0.11, 0, 0.18, 0.32, PLASTIC);

  cyl(g, FRAME, 0.018, 0.68, 0, 0.74, -0.08, 6, { ...PAINT, rot: [0, 0, Math.PI / 2] });
  group.add(g);
  return { attachY: sy + 0.86, half: 0.36 };
}

function nestDish(group, sx, sy, sz) {
  addMesh(group, NEST_GEOM, SEAT, sx, sy, sz, { ...PLASTIC, double: true }).scale.set(1.18, 1.16, 1.18);
  addMesh(group, NEST_GEOM, SEAT, sx, sy + 0.04, sz, {
    ...PLASTIC, tint: 0.90, double: true,
  }).scale.set(0.90, 0.80, 0.90);
  paintBox(group, SEAT, 0.50, 0.32, 0.12, sx, sy + 0.56, sz - 0.26, PLASTIC);
  addMesh(group, new THREE.CylinderGeometry(0.16, 0.16, 0.04, 10), EXTRA.rubberSole, sx, sy + 0.06, sz, {
    rough: 0.88, double: true,
  });
}

function bothEnds(b, alongX) {
  const inset = 0.15;
  return alongX
    ? [[b.minX + inset, b.cz], [b.maxX - inset, b.cz]]
    : [[b.cx, b.minZ + inset], [b.cx, b.maxZ - inset]];
}

function hangTwo(group, b, alongX, beamY) {
  const seats = seatPair(b, alongX);
  const sy = beamY - 1.10;
  const hung = [];
  for (let i = 0; i < seats.length; i += 1) {
    const [sx, sz] = seats[i];
    const sway = 0.12 + i * 0.05;
    const { attachY, half } = scoopedBucket(group, sx, sy, sz, alongX, sway);
    pairChains(group, sx, sz, beamY, attachY, alongX, half, sway);
    const ox = alongX ? 0 : sway;
    const oz = alongX ? sway : 0;
    hung.push([sx + ox, attachY, sz + oz]);
  }
  if (hung.length === 2) seatSpreader(group, hung[0], hung[1], alongX, sy + 0.28);
}

export function buildSwingBay(group, entry, base) {
  const { b, alongX, beamY, spread } = metrics(entry, base);
  for (const [px, pz] of bothEnds(b, alongX)) {
    aFrame(group, px, pz, base, beamY, alongX, spread);
  }
  paintBeam(group, b, alongX, beamY);
  hangTwo(group, b, alongX, beamY);
}

export function buildSwingBasket(group, entry, base) {
  const { b, alongX, beamY, spread } = metrics(entry, base);
  for (const [px, pz] of bothEnds(b, alongX)) {
    aFrame(group, px, pz, base, beamY, alongX, spread);
  }
  paintBeam(group, b, alongX, beamY);
  hangTwo(group, b, alongX, beamY);
}

export function buildSwingNest(group, entry, base) {
  const { b, alongX, beamY, spread } = metrics(entry, base);
  for (const [px, pz] of bothEnds(b, alongX)) {
    aFrame(group, px, pz, base, beamY, alongX, spread);
  }
  paintBeam(group, b, alongX, beamY);
  const ringY = beamY - 0.12;
  addMesh(group, NEST_RING, VOXEL_COLOURS.steel, b.cx, ringY, b.cz, {
    ...STEEL, rot: [Math.PI / 2, 0, 0],
  });
  for (const s of [-1, 1]) {
    const hx = alongX ? b.cx + s * 0.22 : b.cx;
    const hz = alongX ? b.cz : b.cz + s * 0.22;
    hanger(group, hx, beamY, hz);
    chainLinks(group, hx, beamY - 0.09, hz, hx + 0.06, ringY + 0.02, hz + 0.06);
  }
  const sy = beamY - 0.88;
  nestDish(group, b.cx + 0.05, sy, b.cz + 0.08);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const rx = b.cx + 0.05 + Math.cos(a) * 0.46;
    const rz = b.cz + 0.08 + Math.sin(a) * 0.46;
    const tx = b.cx + Math.cos(a) * 0.30;
    const tz = b.cz + Math.sin(a) * 0.30;
    chainLinks(group, tx, ringY - 0.02, tz, rx, sy + 0.50, rz);
  }
}

export function buildSwingExtra(group, entry, base) {
  const { b, alongX, beamY, spread } = metrics(entry, base);
  const inset = 0.15;
  const end = alongX ? [b.maxX - inset, b.cz] : [b.cx, b.maxZ - inset];
  aFrame(group, end[0], end[1], base, beamY, alongX, spread);
  paintBeam(group, b, alongX, beamY);
  boltFlange(group, b, alongX, beamY);
  hangTwo(group, b, alongX, beamY);
}
