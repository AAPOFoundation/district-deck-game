// Block-core playground. Two variants:
//   0 classic — bay swing, wave slide, spring rider, bench
//   1 adventure — climbing cube, tube slide, nest/spinner, seesaw
//
// BC2 (true size, default; `?pgtoys=0` restores the two above exactly). Three variants:
//   0 classic   — double swing (belt + cradle), combination tower with slide, two spring riders
//   1 adventure — two towers and a bridge, a rope net, slide, seesaw, roundabout
//   2 nature    — double swing, spring rider, sandpit, log steppers, balance log, drink tap
// Every variant: softfall with a timber edge, a shade sail on four posts, seating on concrete
// pads, a 1.2 m charcoal pool-style fence with a gate, a gate path and bins.

import * as THREE from 'three';
import { CORE_GROUND } from '../kit.js';
import { derivePlaygroundPalette, playgroundLookOn } from '../toys.js';

export function buildPlayground(ctx) {
  // BC2: the true-size rebuild is the default; `?pgtoys=0` keeps everything below as it was.
  if (playgroundLookOn()) {
    buildTrueSizePlayground(ctx);
    return;
  }
  ctx.pad('turf', 15.4, 0.10, 0.15);
  ctx.box('softfall', 8.4, 0.16, 8.0, 0, 0.20, 0.15);
  ctx.box('concrete', 8.8, 0.16, 0.32, 0, 0.28, -3.85);
  ctx.box('concrete', 8.8, 0.16, 0.32, 0, 0.28, 4.15);
  ctx.box('concrete', 0.32, 0.16, 7.8, -4.2, 0.28, 0.15);
  ctx.box('concrete', 0.32, 0.16, 7.8, 4.2, 0.28, 0.15);
  ctx.chainLink({
    halfX: 7.15, halfZ: 7.15, h: 1.12, post: 'steel', rail: 'steel', gate: true, mesh: true,
  });

  if (ctx.variant === 0) classic(ctx);
  else adventure(ctx);

  ctx.slatBench(3.55, 3.65, 8);
  ctx.wheeledBin(-4.55, 3.85, 'paintG');
  ctx.wheeledBin(4.55, 3.55, 'paintG');
}

function classic(ctx) {
  const sx = -2.65;
  const sz = 0.25;
  for (const side of [-1, 1]) {
    ctx.cylEx('paintY', 0.11, 0.11, 2.95, sx + side * 0.95, 1.58, sz - 1.1, { roll: 18, segments: 10 });
    ctx.cylEx('paintY', 0.11, 0.11, 2.95, sx + side * 0.95, 1.58, sz + 1.1, { roll: -18, segments: 10 });
    ctx.cyl('steel', 0.16, 0.16, 0.10, sx + side * 0.95, 0.22, sz - 1.28, 8);
    ctx.cyl('steel', 0.16, 0.16, 0.10, sx + side * 0.95, 0.22, sz + 1.28, 8);
  }
  ctx.cylEx('paintY', 0.10, 0.10, 2.20, sx, 2.92, sz, { roll: 90, segments: 10 });
  ctx.toy({
    kind: 'double-swing', id: 'swings', x: sx, z: sz, y: 1.18,
    sx: 1.55, sy: 1.45, sz: 0.65, label: 'Swing',
  });

  const lx = 2.25;
  const lz = -0.45;
  ctx.box('paintB', 1.55, 1.85, 1.55, lx, 1.10, lz);
  ctx.box('paintB', 1.65, 0.10, 1.65, lx, 2.06, lz);
  ctx.box('paintB', 0.14, 0.55, 1.55, lx - 0.70, 2.28, lz);
  ctx.box('paintB', 0.14, 0.55, 1.55, lx + 0.70, 2.28, lz);
  ctx.box('paintB', 1.55, 0.55, 0.14, lx, 2.28, lz - 0.70);
  ctx.box('paintY', 0.85, 0.10, 0.85, lx, 2.08, lz);

  ctx.box('paintB', 0.18, 1.65, 1.65, lx - 1.15, 1.00, lz + 0.05);
  ctx.box('paintB', 0.18, 1.65, 1.65, lx - 0.55, 1.00, lz + 0.05);
  for (let i = 0; i < 6; i += 1) {
    ctx.box('paintY', 0.52, 0.08, 0.22, lx - 0.85, 0.28 + i * 0.24, lz - 0.55 + i * 0.22);
  }

  ctx.waveChute(lx + 0.05, 1.72, lz + 0.55, { segs: 6, yaw: 0 });

  ctx.box('steel', 0.10, 1.05, 0.10, lx - 0.62, 2.58, lz - 0.62);
  ctx.box('steel', 0.10, 1.05, 0.10, lx + 0.62, 2.58, lz - 0.62);
  ctx.box('steel', 0.10, 1.05, 0.10, lx - 0.62, 2.58, lz + 0.62);
  ctx.box('steel', 0.10, 1.05, 0.10, lx + 0.62, 2.58, lz + 0.62);
  ctx.box('steel', 1.35, 0.07, 1.35, lx, 3.14, lz);

  ctx.toy({
    kind: 'spring-rider', id: 'rider', x: -2.55, z: 2.25, y: 0.18,
    sx: 0.9, sy: 1.1, sz: 0.8, label: 'Spring rider',
  });
  ctx.toy({
    kind: 'spring-rider', id: 'rider-b', x: -1.25, z: 2.55, y: 0.18, yaw: 35,
    sx: 0.9, sy: 1.1, sz: 0.8, label: 'Spring rider',
  });
}

function adventure(ctx) {
  const cx = -1.4;
  const cz = -0.35;
  ctx.box('paintG', 2.5, 0.28, 2.5, cx, 0.28, cz);
  for (const [dx, dz] of [[-1.09, -1.09], [1.09, -1.09], [-1.09, 1.09], [1.09, 1.09]]) {
    ctx.box('paintG', 0.36, 2.15, 0.36, cx + dx, 1.28, cz + dz);
  }
  ctx.box('paintG', 2.5, 0.32, 0.36, cx, 2.28, cz - 1.09);
  ctx.box('paintG', 2.5, 0.32, 0.36, cx, 2.28, cz + 1.09);
  ctx.box('paintG', 0.36, 0.32, 2.5, cx - 1.09, 2.28, cz);
  ctx.box('paintG', 0.36, 0.32, 2.5, cx + 1.09, 2.28, cz);
  ctx.box('paintG', 0.36, 0.55, 2.5, cx - 1.09, 0.48, cz);
  ctx.box('paintG', 2.5, 0.55, 0.36, cx, 0.48, cz - 1.09);
  ctx.box('paintY', 2.2, 0.12, 2.2, cx, 2.40, cz);
  ctx.box('paintG', 0.22, 0.35, 2.5, cx - 1.09, 2.52, cz);
  ctx.box('paintG', 0.22, 0.35, 2.5, cx + 1.09, 2.52, cz);
  ctx.ladder(cx, cz + 1.45, 2.15, 0, 'steel');
  ctx.ladder(cx - 1.45, cz, 2.15, 90, 'steel');

  ctx.box('paintY', 1.05, 0.12, 1.05, cx + 1.15, 2.42, cz + 0.15);
  ctx.waveChute(0.85, 1.85, cz + 0.35, { segs: 6, yaw: 0 });

  ctx.box('paintR', 0.55, 0.42, 0.55, -2.15, 0.38, 2.35);
  ctx.box('steel', 0.18, 0.28, 0.18, -2.15, 0.62, 2.35);
  ctx.toy({
    kind: 'seesaw', id: 'seesaw', x: -2.15, z: 2.35, y: 0.16,
    sx: 2.8, sy: 1.0, sz: 0.6, label: 'Seesaw',
  });
  ctx.toy({
    kind: 'spinner', id: 'roundabout', x: 2.15, z: 2.05, y: 0.16,
    sx: 2.2, sy: 1.2, sz: 2.2, label: 'Roundabout',
  });
}


// ---------------------------------------------------------------------------------------
// BC2 — true-size playground. Metres; the softfall surface is the reference for every toy.
// ---------------------------------------------------------------------------------------

const DEG = Math.PI / 180;
const SOFT = 0.28;          // softfall top
const G = CORE_GROUND;      // concrete pads and the bench helper's datum (0.26)
const FENCE_HALF = 7.15;
const TURF = 0.175;         // top of the 15.4 m turf pad (pad centre 0.10, 0.15 thick)
// Taste fix (r1) base-stain layers: 15-20 V darker ground at every contact, as flat planes a
// few millimetres proud of the ground they darken. Each layer has its own height so two stains
// never share a plane (no z-fight where they overlap); none floats more than 0.02 m.
const STAIN_Y = Object.freeze({
  band: TURF + 0.003, pad: TURF + 0.006, cross: TURF + 0.009, fence: TURF + 0.012, post: TURF + 0.015,
  soft: SOFT + 0.004,
});

/** Softfall rectangles laid so far on this context, so a post can find the ground it stands in. */
const softRects = new WeakMap();
function onSoftfall(ctx, x, z) {
  return (softRects.get(ctx) ?? []).some(([x0, x1, z0, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
}

/** Flat stain rectangle (2 triangles) at height `y`. */
function stainRect(ctx, x, z, w, d, y, bucket = 'stainTurf') {
  const geometry = new THREE.PlaneGeometry(w, d, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(x, y, z);
  ctx.push(bucket, geometry);
}

/** Flat stain disc (8 triangles) at a post foot, on whichever ground the point stands in. */
function stainDisc(ctx, x, z, r) {
  const soft = onSoftfall(ctx, x, z);
  const geometry = new THREE.CircleGeometry(r, 8);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(x, soft ? STAIN_Y.soft : STAIN_Y.post, z);
  ctx.push(soft ? 'stainSoft' : 'stainTurf', geometry);
}

function rod(ctx, bucket, a, b, r, seg = 6, open = false) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const geometry = new THREE.CylinderGeometry(r, r, len, seg, 1, open);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len),
  ));
  geometry.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  ctx.push(bucket, geometry);
}

/** A box with no top or bottom face (8 triangles): pickets and thin uprights. */
function prism(ctx, bucket, w, h, d, x, y, z) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  const idx = Array.from(geometry.index.array);
  geometry.setIndex([...idx.slice(0, 12), ...idx.slice(24)]);
  geometry.clearGroups();
  geometry.translate(x, y, z);
  ctx.push(bucket, geometry);
}

/** Concrete pad flush with the core datum, for benches, tables, bins and the gate path. */
function slabPad(ctx, x, z, w, d, stainY = STAIN_Y.pad) {
  ctx.box('concrete', w, 0.10, d, x, G - 0.05, z);
  if (stainY !== null) stainRect(ctx, x, z, w + 0.3, d + 0.3, stainY);
}

/** Softfall field with a 150 mm timber sleeper edge standing 60 mm proud of the surface. */
function softfall(ctx, x0, x1, z0, z1, bucket = 'softfall') {
  const w = x1 - x0;
  const d = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  ctx.box(bucket, w, 0.16, d, cx, SOFT - 0.08, cz);
  const e = 0.15;
  const h = 0.22;
  const y = SOFT + 0.06 - h / 2;
  ctx.box('timber', w + e * 2, h, e, cx, y, z0 - e / 2);
  ctx.box('timber', w + e * 2, h, e, cx, y, z1 + e / 2);
  ctx.box('timber', e, h, d, x0 - e / 2, y, cz);
  ctx.box('timber', e, h, d, x1 + e / 2, y, cz);
  if (!softRects.has(ctx)) softRects.set(ctx, []);
  softRects.get(ctx).push([x0, x1, z0, z1]);
  // Taste fix (r1): worn lawn along the sleeper edge, 0.25 m wide outside the timber.
  stainRect(ctx, cx, cz, w + (e + 0.25) * 2, d + (e + 0.25) * 2, STAIN_Y.band);
}

/**
 * 1.2 m pool-style fence: posts at 2.4 m, two rails, pickets. Taste fix (r1): dark Colorbond
 * (Woodland Grey) powder-coat in its own `fence` bucket instead of `soil` charcoal, and a
 * 0.3 m strip of worn lawn under the line.
 */
function poolFence(ctx, { gateHalf = 0.55 } = {}) {
  const F = 'fence';
  const half = FENCE_HALF;
  const base = 0.12;
  const top = 1.375;
  const sides = [
    [[-half, -half], [half, -half]],
    [[half, -half], [half, half]],
    [[half, half], [-half, half]],
    [[-half, half], [-half, -half]],
  ];
  for (const [[ax, az], [bx, bz]] of sides) {
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    const bays = 6;
    for (let i = 0; i < bays; i += 1) {
      const t = i / bays;
      ctx.box(F, 0.065, top - base + 0.03, 0.065, ax + ux * len * t, (base + top + 0.03) / 2, az + uz * len * t);
    }
    for (const ry of [0.30, 1.30]) {
      const along = Math.abs(ux) > 0.5;
      ctx.box(F, along ? len : 0.04, 0.04, along ? 0.04 : len, (ax + bx) / 2, ry, (az + bz) / 2);
    }
    const n = Math.round(len / 0.2);
    for (let i = 1; i < n; i += 1) {
      const x = ax + ux * len * (i / n);
      const z = az + uz * len * (i / n);
      prism(ctx, F, 0.018, 1.10, 0.018, x, 0.25 + 0.55, z);
    }
  }
  for (const s of [-1, 1]) {
    ctx.box(F, 0.09, top - base + 0.06, 0.09, s * gateHalf, (base + top + 0.06) / 2, half);
  }
  ctx.box('steel', 0.06, 0.10, 0.05, gateHalf - 0.08, 1.12, half + 0.04);
  const strip = 0.3;
  stainRect(ctx, 0, -half, half * 2 + strip, strip, STAIN_Y.fence);
  stainRect(ctx, 0, half, half * 2 + strip, strip, STAIN_Y.fence);
  stainRect(ctx, -half, 0, strip, half * 2 - strip, STAIN_Y.fence);
  stainRect(ctx, half, 0, strip, half * 2 - strip, STAIN_Y.fence);
}

/**
 * Shade sail on four posts: a 4 x 4 hypar with concave catenary edges and a 0.18 m sag.
 * Taste fix (r1):
 *   - every corner ends ON its post: the post stands 0.06 m outside the corner, so the corner
 *     fixing sits 0.01 m inside the 70 mm post's skin, and the post runs 0.22 m above it;
 *     there is no free tension rod to end in mid-air;
 *   - the underside is its own sheet 60 mm below the top one (it used to be a coincident
 *     reversed copy, which is what drew the ring and stripe shadow acne: the shadow pass drew
 *     the underside at exactly the top face's depth), and a hem band closes the edge;
 *   - its own `sail` bucket (sage shade cloth at the roofing value), and a stain at each foot.
 */
const SAIL_GAP = 0.06;
function shadeSail(ctx, corners, bucket = 'sail') {
  const geometry = new THREE.PlaneGeometry(1, 1, 4, 4);
  const pos = geometry.attributes.position;
  const c = corners.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4, a[2] + p[2] / 4], [0, 0, 0]);
  const [c00, c10, c11, c01] = corners;
  for (let i = 0; i < pos.count; i += 1) {
    const u = pos.getX(i) + 0.5;
    const v = pos.getY(i) + 0.5;
    const p = [0, 1, 2].map((k) => (1 - u) * (1 - v) * c00[k] + u * (1 - v) * c10[k] + u * v * c11[k] + (1 - u) * v * c01[k]);
    const pull = 0.12 * (Math.sin(Math.PI * u) * Math.abs(2 * v - 1) ** 3 + Math.sin(Math.PI * v) * Math.abs(2 * u - 1) ** 3);
    p[0] += (c[0] - p[0]) * pull;
    p[2] += (c[2] - p[2]) * pull;
    p[1] -= 0.18 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
    pos.setXYZ(i, p[0], p[1], p[2]);
  }
  const flip = (g) => {
    const idx = Array.from(g.index.array);
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  };
  geometry.computeVertexNormals();
  let ny = 0;
  for (let i = 0; i < geometry.attributes.normal.count; i += 1) ny += geometry.attributes.normal.getY(i);
  if (ny < 0) flip(geometry);
  const under = geometry.clone();
  under.translate(0, -SAIL_GAP, 0);
  flip(under);
  ctx.push(bucket, geometry);
  ctx.push(bucket, under);

  // Hem: one quad per perimeter segment between the two sheets, wound to face outward.
  const ring = [];
  for (let ix = 0; ix < 4; ix += 1) ring.push(ix);              // top row, left to right
  for (let iy = 0; iy < 4; iy += 1) ring.push(iy * 5 + 4);      // right column, down
  for (let ix = 4; ix > 0; ix -= 1) ring.push(20 + ix);         // bottom row, right to left
  for (let iy = 4; iy > 0; iy -= 1) ring.push(iy * 5);          // left column, up
  const hp = [];
  const huv = [];
  const hidx = [];
  for (let k = 0; k < ring.length; k += 1) {
    const i = ring[k];
    const j = ring[(k + 1) % ring.length];
    const a = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const b = [pos.getX(j), pos.getY(j), pos.getZ(j)];
    const base = hp.length / 3;
    hp.push(...a, ...b, b[0], b[1] - SAIL_GAP, b[2], a[0], a[1] - SAIL_GAP, a[2]);
    huv.push(0, 1, 1, 1, 1, 0, 0, 0);
    // Outward test: the quad normal against the horizontal offset of the segment from centre.
    const ex = b[0] - a[0];
    const ez = b[2] - a[2];
    const nx = -ez; // (b - a) x (down) = (-ez, 0, ex) up to sign for the (a, b, b') winding
    const nz = ex;
    const ox = (a[0] + b[0]) / 2 - c[0];
    const oz = (a[2] + b[2]) / 2 - c[2];
    const out = nx * ox + nz * oz;
    if (out >= 0) hidx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else hidx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const hem = new THREE.BufferGeometry();
  hem.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
  hem.setAttribute('uv', new THREE.Float32BufferAttribute(huv, 2));
  hem.setIndex(hidx);
  hem.computeVertexNormals();
  ctx.push(bucket, hem);

  for (const p of corners) {
    const dx = p[0] - c[0];
    const dz = p[2] - c[2];
    const l = Math.hypot(dx, dz);
    const px = p[0] + (dx / l) * 0.06;
    const pz = p[2] + (dz / l) * 0.06;
    const top = p[1] + 0.22;
    const foot = 0.12;
    ctx.cyl('steel', 0.07, 0.07, top - foot, px, (top + foot) / 2, pz, 8);
    ctx.cyl('steel', 0.085, 0.085, 0.03, px, top + 0.015, pz, 8);   // cap
    ctx.box('steel', 0.05, 0.08, 0.05, p[0] + (dx / l) * 0.02, p[1] - SAIL_GAP / 2, p[2] + (dz / l) * 0.02); // corner plate
    stainDisc(ctx, px, pz, 0.24);
  }
}

/**
 * Double-swing A-frame: 114 mm beam centred at 2.88 m, 89 mm legs splayed 1.15 m. Review fix 3:
 * galvanised steel by default, so paint stays on the seats (accents under 4 m2 a variant).
 */
function swingBay(ctx, sx, sz, { frame = 'steel', seat = 'paintR' } = {}) {
  const beamY = 2.88;
  ctx.cylEx(frame, 0.057, 0.057, 2.9, sx, beamY, sz, { roll: 90, segments: 10 });
  for (const side of [-1, 1]) {
    const x = sx + side * 1.38;
    for (const zs of [-1, 1]) {
      rod(ctx, frame, [x, SOFT - 0.04, sz + zs * 1.15], [x, beamY, sz], 0.045, 8);
      stainDisc(ctx, x, sz + zs * 1.15, 0.2);
    }
  }
  const y = 0.35;
  ctx.toy({
    kind: 'double-swing', id: 'swings', x: sx, z: sz, y,
    pivot: beamY - 0.057 - y, surface: y - SOFT, seat,
    sx: 2.0, sy: 2.5, sz: 0.8, label: 'Swing',
  });
}

/**
 * Combination tower: four 114 mm posts, a dark perforated deck, two guard panels, a top
 * rail, a stainless slide at 30 degrees with a 0.5 m run-out, and a ladder.
 * `slideYaw` / `ladderYaw` are the compass directions of those two faces (0 = +z).
 */
function tower(ctx, x, z, {
  deck = 1.2, size = 1.3, slideYaw = 0, ladderYaw = 180, panel = 'timber', slide = true, ladder = true,
  openYaws = [], accent = null,
} = {}) {
  const half = size / 2 - 0.06;
  const deckY = SOFT + deck;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.cyl('steel', 0.057, 0.057, deck + 1.0 + 0.04, x + dx * half, SOFT + (deck + 1.0) / 2 - 0.02, z + dz * half, 8);
    stainDisc(ctx, x + dx * half, z + dz * half, 0.17);
  }
  ctx.box('soil', size - 0.04, 0.05, size - 0.04, x, deckY - 0.025, z);
  const faces = [0, 90, 180, 270];
  for (const yaw of faces) {
    const fx = Math.sin(yaw * DEG);
    const fz = Math.cos(yaw * DEG);
    const ex = x + fx * half;
    const ez = z + fz * half;
    const open = (slide && yaw === slideYaw) || (ladder && yaw === ladderYaw) || openYaws.includes(yaw);
    // Taste fix (r1): `fz` is 6e-17 at yaw 90 and -2e-16 at 270, which is truthy, so the side
    // panels used to lie ACROSS the tower; test the axis by magnitude. `accent` paints one face.
    const alongX = Math.abs(fz) > 0.5;
    const pw = alongX ? size - 0.18 : 0.03;
    const pd = alongX ? 0.03 : size - 0.18;
    if (!open) ctx.box(panel, pw, 0.66, pd, ex, deckY + 0.45, ez);
    // Taste fix (r2): the accent is a painted skin, one outward quad 4 mm proud of the panel's
    // upper half, on every face in `accent.yaws`. The lab plates see the +x and +z faces and
    // c01 (az 180) sees -z, so v0 paints yaw 90 and yaw 180. Counting the skin's one face keeps
    // each variant's paint under 4 m2 (r1's band was a 0.03 m box painted on all six faces).
    const yaws = accent ? (accent.yaws ?? [accent.yaw]) : [];
    if (!open && yaws.includes(yaw)) {
      const skin = new THREE.PlaneGeometry(size - 0.18, 0.33, 1, 1);
      skin.rotateY(yaw * DEG);
      skin.translate(ex + fx * 0.019, deckY + 0.615, ez + fz * 0.019);
      ctx.push(accent.bucket, skin);
    }
    const a = [ex - fz * half, deckY + 0.95, ez - fx * half];
    const b = [ex + fz * half, deckY + 0.95, ez + fx * half];
    rod(ctx, 'steel', a, b, 0.024, 6, true);
  }
  if (slide) {
    const fx = Math.sin(slideYaw * DEG);
    const fz = Math.cos(slideYaw * DEG);
    const drop = deck - 0.30;
    const run = drop / Math.tan(30 * DEG);
    const len = Math.hypot(run, drop);
    const sx0 = x + fx * (size / 2);
    const sz0 = z + fz * (size / 2);
    const mx = sx0 + fx * run / 2;
    const mz = sz0 + fz * run / 2;
    const my = deckY - drop / 2;
    ctx.boxEx('steel', 0.46, 0.03, len, mx, my - 0.015, mz, { pitch: 30, yaw: slideYaw });
    ctx.boxEx('steel', 0.46, 0.03, 0.5, sx0 + fx * (run + 0.25), SOFT + 0.30 - 0.015, sz0 + fz * (run + 0.25), { yaw: slideYaw });
    for (const s of [-1, 1]) {
      const ox = fz * s * 0.245;
      const oz = -fx * s * 0.245;
      ctx.boxEx('steel', 0.03, 0.16, len, mx + ox, my + 0.05, mz + oz, { pitch: 30, yaw: slideYaw });
      ctx.boxEx('steel', 0.03, 0.12, 0.5, sx0 + fx * (run + 0.25) + ox, SOFT + 0.33, sz0 + fz * (run + 0.25) + oz, { yaw: slideYaw });
      ctx.cyl('steel', 0.03, 0.03, 0.29, sx0 + fx * (run + 0.45) + ox, SOFT + 0.135, sz0 + fz * (run + 0.45) + oz, 6);
    }
  }
  if (ladder) {
    const fx = Math.sin(ladderYaw * DEG);
    const fz = Math.cos(ladderYaw * DEG);
    ctx.ladder(x + fx * (size / 2 + 0.04), z + fz * (size / 2 + 0.04), deck, ladderYaw, 'steel', { y0: SOFT });
  }
}

function seesawStand(ctx, x, z) {
  for (const zs of [-0.19, 0.19]) {
    rod(ctx, 'steel', [x - 0.32, SOFT, z + zs], [x, SOFT + 0.55, z + zs], 0.03, 6);
    rod(ctx, 'steel', [x + 0.32, SOFT, z + zs], [x, SOFT + 0.55, z + zs], 0.03, 6);
    ctx.box('steel', 0.10, 0.10, 0.06, x, SOFT + 0.55, z + zs);
    for (const sx of [-0.32, 0.32]) stainDisc(ctx, x + sx, z + zs, 0.12);
  }
  ctx.toy({
    kind: 'seesaw', id: 'seesaw', x, z, y: SOFT,
    sx: 3.2, sy: 1.0, sz: 0.6, label: 'Seesaw',
  });
}

function roundabout(ctx, x, z) {
  ctx.cyl('concrete', 1.05, 1.05, 0.03, x, SOFT + 0.005, z, 16);
  stainDisc(ctx, x, z, 1.2);
  ctx.toy({
    kind: 'spinner', id: 'roundabout', x, z, y: SOFT,
    sx: 1.9, sy: 0.9, sz: 1.9, label: 'Roundabout',
  });
}

function rider(ctx, id, x, z, yaw, body) {
  ctx.cyl('concrete', 0.30, 0.30, 0.02, x, SOFT + 0.002, z, 8);
  stainDisc(ctx, x, z, 0.42);
  ctx.toy({
    kind: 'spring-rider', id, x, z, y: SOFT, yaw, body,
    sx: 0.9, sy: 1.0, sz: 0.6, label: 'Spring rider',
  });
}

/** Timber picnic setting: 1.8 m top at 0.75 m, seats at 0.45 m, splayed steel frames. */
function picnicTable(ctx, x, z) {
  slabPad(ctx, x, z, 2.5, 2.2);
  ctx.box('timber', 1.8, 0.045, 0.78, x, G + 0.75 - 0.0225, z);
  for (const s of [-1, 1]) ctx.box('timber', 1.8, 0.04, 0.28, x, G + 0.45 - 0.02, z + s * 0.58);
  for (const ex of [-0.7, 0.7]) {
    rod(ctx, 'steel', [x + ex, G, z - 0.68], [x + ex, G + 0.73, z], 0.022, 6);
    rod(ctx, 'steel', [x + ex, G, z + 0.68], [x + ex, G + 0.73, z], 0.022, 6);
    ctx.box('steel', 0.04, 0.04, 1.44, x + ex, G + 0.41, z);
  }
}

function bench(ctx, x, z, yaw) {
  slabPad(ctx, x, z, 2.3, 1.1);
  ctx.slatBench(x, z, yaw);
}

function gatePath(ctx, zEdge) {
  const z0 = zEdge;
  const z1 = FENCE_HALF - 0.05;
  slabPad(ctx, 0, (z0 + z1) / 2, 1.3, z1 - z0);
  slabPad(ctx, 0, z1 - 0.65, 3.6, 1.2, STAIN_Y.cross);
  // Review fix 3: charcoal bins (one pale lid), so the paint budget goes to the seats.
  ctx.wheeledBin(-1.3, z1 - 0.62, 'soil', { lid: 'soil' });
  ctx.wheeledBin(1.3, z1 - 0.62, 'soil', { lid: 'trim' });
}

function tap(ctx, x, z) {
  ctx.box('steel', 0.18, 0.84, 0.18, x, G + 0.42, z);
  ctx.cyl('steel', 0.17, 0.12, 0.08, x, G + 0.88, z, 10);
}

function sandpit(ctx, x, z, size = 2.6) {
  const e = 0.15;
  ctx.box('path', size, 0.20, size, x, 0.26, z);
  stainRect(ctx, x, z, size + e * 2 + 0.4, size + e * 2 + 0.4, STAIN_Y.pad);
  for (const s of [-1, 1]) {
    ctx.box('timber', size + e * 2, 0.30, e, x, 0.29, z + s * (size / 2 + e / 2));
    ctx.box('timber', e, 0.30, size, x + s * (size / 2 + e / 2), 0.29, z);
  }
}

function buildTrueSizePlayground(ctx) {
  ctx.palette = derivePlaygroundPalette(ctx.palette);
  ctx.pad('turf', 15.4, 0.10, 0.15);
  poolFence(ctx);
  const v = ctx.variant;
  if (v === 0) {
    softfall(ctx, -6.0, 6.0, -6.0, 2.4);
    swingBay(ctx, -3.3, -3.2, { seat: 'paintR' });
    tower(ctx, 2.6, -3.3, { deck: 1.2, slideYaw: 0, ladderYaw: 270, accent: { yaws: [90, 180], bucket: 'paintB' } });
    rider(ctx, 'rider', -3.6, 0.9, 20, 'paintR');
    rider(ctx, 'rider-b', -1.6, 1.3, -30, 'paintB');
    // Taste fix (r1): a diamond over the tower alone, its axes on the detail camera's right and
    // depth directions, so no corner, edge or post comes near the swing frame (x <= -1.85).
    shadeSail(ctx, [[1.2, 3.6, -1.9], [0.9, 2.95, -5.0], [4.0, 3.6, -4.7], [4.3, 2.95, -1.6]]);
    gatePath(ctx, 2.55);
    bench(ctx, -3.4, 4.3, 180);
    picnicTable(ctx, 3.4, 4.5);
  } else if (v === 1) {
    softfall(ctx, -5.8, 5.8, -5.4, 2.2);
    tower(ctx, -3.9, -3.2, { deck: 1.5, slideYaw: 0, ladderYaw: 270, openYaws: [90] });
    tower(ctx, -0.9, -3.2, { deck: 1.5, slide: false, ladder: false, openYaws: [90, 270], accent: { yaws: [0, 180], bucket: 'paintR' } });
    for (let i = 0; i < 6; i += 1) {
      const bx = -3.18 + 0.2 + i * 0.28;
      ctx.box('timber', 0.24, 0.05, 0.6, bx, SOFT + 1.5 - 0.025, -3.2);
    }
    for (const s of [-1, 1]) rod(ctx, 'soil', [-3.25, SOFT + 2.2, -3.2 + s * 0.32], [-1.55, SOFT + 2.2, -3.2 + s * 0.32], 0.015, 4, true);
    for (let i = 0; i <= 4; i += 1) {
      const zz = -3.75 + i * 0.275;
      rod(ctx, 'soil', [-0.27, SOFT + 1.5, zz], [1.35, SOFT, zz], 0.012, 4, true);
    }
    for (let i = 1; i <= 4; i += 1) {
      const t = i / 5;
      rod(ctx, 'soil', [-0.27 + 1.62 * t, SOFT + 1.5 * (1 - t), -3.75], [-0.27 + 1.62 * t, SOFT + 1.5 * (1 - t), -2.65], 0.012, 4, true);
    }
    seesawStand(ctx, 3.4, -3.6);
    roundabout(ctx, 3.3, 0.4);
    shadeSail(ctx, [[-5.3, 3.6, -5.0], [0.3, 3.15, -5.1], [0.5, 3.65, -1.2], [-5.2, 3.15, -1.1]]);
    gatePath(ctx, 2.35);
    bench(ctx, -3.5, 4.3, 180);
    bench(ctx, 3.5, 4.3, 180);
  } else {
    softfall(ctx, -6.2, -0.4, -6.0, -0.4);
    softfall(ctx, 0.8, 6.2, -0.1, 2.6);
    swingBay(ctx, -3.4, -3.5, { seat: 'paintY' });
    rider(ctx, 'rider', -1.5, -1.4, -25, 'paintY');
    // Taste fix (r1): a 2 m sandpit under a diamond sail. Its far-right corner used to stand at
    // (5.5, -5.7), outside the detail plate; the diamond keeps every post inside it and 0.31 m
    // clear of the sandpit's timber corners.
    sandpit(ctx, 3.0, -3.0, 2.0);
    shadeSail(ctx, [[1.62, 3.45, -1.62], [1.3, 2.95, -4.7], [4.52, 3.5, -4.52], [4.7, 2.9, -1.3]]);
    [[1.4, 0.4, 0.25], [2.1, 0.9, 0.35], [2.8, 0.5, 0.45], [3.5, 1.0, 0.35], [4.2, 0.6, 0.25]]
      .forEach(([x, z, h]) => {
        ctx.cyl('timber', 0.17, 0.17, h + 0.08, x, SOFT + (h - 0.08) / 2, z, 8);
        stainDisc(ctx, x, z, 0.27);
      });
    ctx.cylEx('timber', 0.14, 0.14, 2.6, 3.7, SOFT + 0.32, 2.0, { roll: 90, segments: 8 });
    for (const dx of [-1.0, 1.0]) {
      ctx.cyl('timber', 0.16, 0.16, 0.26, 3.7 + dx, SOFT + 0.11, 2.0, 8);
      stainDisc(ctx, 3.7 + dx, 2.0, 0.26);
    }
    gatePath(ctx, 2.75);
    bench(ctx, -3.4, 4.3, 180);
    picnicTable(ctx, 3.4, 4.6);
    tap(ctx, 1.6, 6.0);
  }
}
