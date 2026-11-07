// Shared site plant — hoarding, skip, cabin, portaloo, cones, excavator, pump, crane.
// Toy-scale Monopoly Plus silhouettes. Nested groups where a joint must move.

import * as THREE from 'three';
import { box, cyl, sphere, cone, capsule } from './kit.js';

export function addHoarding(ctx, { gate = true } = {}) {
  const { w, d, palette: P } = ctx;
  const g = ctx.layer('hoarding');
  // Hip-high toy corral. A 2.5 m crate is the #1 critic kill.
  const h = 1.15;
  const thick = 0.07;
  const outerW = w + 1.05;
  const outerD = d + 1.05;
  const sides = [
    { x: 0, z: -outerD / 2, rw: outerW, rd: thick, gateSide: true },
    { x: 0, z: outerD / 2, rw: outerW, rd: thick, gateSide: false },
    { x: -outerW / 2, z: 0, rw: thick, rd: outerD, gateSide: false },
    { x: outerW / 2, z: 0, rw: thick, rd: outerD, gateSide: false },
  ];
  for (const s of sides) {
    const run = new THREE.Group();
    run.position.set(s.x, 0, s.z);
    g.add(run);
    if (gate && s.gateSide) {
      // Wide street opening so the camera reads the site, not the fence.
      const opening = Math.min(4.6, outerW * 0.42);
      const wing = (outerW - opening) / 2;
      box(run, wing, h, thick, P.plywood, -outerW / 2 + wing / 2, h / 2, 0);
      box(run, wing, h, thick, P.plywood, outerW / 2 - wing / 2, h / 2, 0);
      const leafL = box(run, 1.15, h * 0.94, thick * 0.9, P.plywood, -opening / 2 + 0.15, h * 0.47, -0.55, { rotY: 0.72 });
      const leafR = box(run, 1.15, h * 0.94, thick * 0.9, P.plywood, opening / 2 - 0.15, h * 0.47, -0.55, { rotY: -0.72 });
      ctx.tap(leafL, 'hoarding', { label: 'gate-l' });
      ctx.tap(leafR, 'hoarding', { label: 'gate-r' });
      box(run, opening * 0.7, 0.18, 0.08, P.black, 0, 0.09, -0.18, { cast: false });
    } else {
      box(run, s.rw, h, s.rd, P.plywood, 0, h / 2, 0);
    }
    const along = s.rw > s.rd;
    const stripeLen = along ? s.rw * 0.94 : s.rd * 0.94;
    const flashY = h * 0.68;
    for (let i = 0; i < 8; i += 1) {
      const t = (i / 7 - 0.5) * 0.92;
      const mat = i % 2 === 0 ? P.hazard : P.hazardBlk;
      if (along) box(run, stripeLen / 8.2, 0.22, thick + 0.025, mat, t * stripeLen, flashY, 0.02, { cast: false });
      else box(run, thick + 0.025, 0.22, stripeLen / 8.2, mat, 0.02, flashY, t * stripeLen, { cast: false });
    }
    if (along) box(run, stripeLen, 0.08, s.rd + 0.02, P.black, 0, 0.12, 0, { cast: false });
    else box(run, s.rw + 0.02, 0.08, stripeLen, P.black, 0, 0.12, 0, { cast: false });
    ctx.tap(run, 'hoarding', { label: `hoard-${s.x}-${s.z}` });
  }
  for (const [px, pz] of [
    [-outerW / 2, -outerD / 2], [outerW / 2, -outerD / 2],
    [-outerW / 2, outerD / 2], [outerW / 2, outerD / 2],
  ]) {
    box(g, 0.22, h + 0.45, 0.22, P.plate, px, (h + 0.45) / 2, pz);
    box(g, 0.32, 0.08, 0.32, P.hazard, px, h + 0.42, pz, { cast: false });
  }
}

export function addSpoil(ctx, count = 4, layer = 'spoil') {
  const { palette: P } = ctx;
  const g = ctx.layer(layer);
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2 + ctx.u(`sp-a:${i}`) * 0.4;
    const r = 2.1 + ctx.u(`sp-r:${i}`) * 1.4;
    const h = 0.45 + ctx.u(`sp-h:${i}`) * 0.55;
    const rad = 0.7 + ctx.u(`sp-rad:${i}`) * 0.55;
    const x = Math.cos(a) * r * (ctx.w * 0.12);
    const z = Math.sin(a) * r * (ctx.d * 0.12);
    const mat = i % 2 ? P.dirt : P.dirtWet;
    // Hemispheres, not ice-cream cones — a spoil heap is a mound.
    sphere(g, rad, 8, mat, x, h * 0.28, z);
    sphere(g, rad * 0.62, 7, mat, x + rad * 0.35, h * 0.22, z + rad * 0.15);
    if (i % 2 === 0) {
      sphere(g, 0.11 + ctx.u(`sp-s:${i}`) * 0.08, 5, P.concrete, x + 0.22, 0.14, z - 0.12, { cast: false });
    }
  }
}

export function addSkip(ctx, xMul = 0.4, zMul = -0.4) {
  const { w, d, palette: P } = ctx;
  const g = new THREE.Group();
  g.position.set(w * xMul, 0, d * zMul);
  ctx.group.add(g);
  // Open hopper: thick walls flare out so the well reads from 38°. No lid.
  box(g, 1.62, 0.12, 0.92, P.skip, 0, 0.16, 0);
  box(g, 2.05, 1.18, 0.16, P.skip, 0, 0.76, 0.60, { rotX: 0.22 });
  box(g, 2.05, 1.18, 0.16, P.skip, 0, 0.76, -0.60, { rotX: -0.22 });
  box(g, 0.16, 1.18, 1.22, P.skip, 0.94, 0.76, 0, { rotZ: -0.22 });
  box(g, 0.16, 1.18, 1.22, P.skip, -0.94, 0.76, 0, { rotZ: 0.22 });
  box(g, 2.28, 0.08, 0.16, P.skip, 0, 1.32, 0.78);
  box(g, 2.28, 0.08, 0.16, P.skip, 0, 1.32, -0.78);
  box(g, 0.16, 0.08, 1.56, P.skip, 1.14, 1.32, 0);
  box(g, 0.16, 0.08, 1.56, P.skip, -1.14, 1.32, 0);
  box(g, 0.16, 0.42, 0.16, P.steelDark, -1.16, 1.08, 0.80);
  box(g, 0.16, 0.42, 0.16, P.steelDark, 1.16, 1.08, 0.80);
  box(g, 0.16, 0.42, 0.16, P.steelDark, -1.16, 1.08, -0.80);
  box(g, 0.16, 0.42, 0.16, P.steelDark, 1.16, 1.08, -0.80);
  sphere(g, 0.38, 7, P.dirt, 0.06, 0.46, 0.04);
  sphere(g, 0.26, 6, P.dirtWet, -0.32, 0.40, -0.10);
  sphere(g, 0.22, 6, P.dirt, 0.28, 0.38, -0.18);
  for (let i = 0; i < 11; i += 1) {
    const mat = i % 3 === 0 ? P.brick : (i % 2 ? P.concrete : P.brickDark);
    box(
      g,
      0.26 + ctx.u(`sk:${i}`) * 0.18,
      0.14 + ctx.u(`skh:${i}`) * 0.14,
      0.20 + ctx.u(`skd:${i}`) * 0.14,
      mat,
      -0.55 + (i % 3) * 0.42 + (ctx.u(`skx:${i}`) - 0.5) * 0.08,
      0.42 + ctx.u(`sky:${i}`) * 0.38,
      -0.28 + Math.floor(i / 3) * 0.18 + (ctx.u(`skz:${i}`) - 0.5) * 0.06,
      { rotY: ctx.u(`skr:${i}`) * 1.4, rotZ: (i % 4) * 0.12 },
    );
  }
  ctx.tap(g, 'skip', { label: 'skip' });
  return g;
}

export function addPortaloo(ctx, xMul = -0.42, zMul = 0.4) {
  const { w, d, palette: P } = ctx;
  const g = new THREE.Group();
  g.position.set(w * xMul, 0, d * zMul);
  ctx.group.add(g);
  box(g, 1.18, 0.12, 1.18, P.black, 0, 0.06, 0, { cast: false });
  box(g, 1.02, 2.02, 1.02, P.plastic, 0, 1.12, 0);
  for (const [cx, cz] of [[0.46, 0.46], [0.46, -0.46], [-0.46, 0.46], [-0.46, -0.46]]) {
    cyl(g, 0.10, 0.10, 2.02, 8, P.plastic, cx, 1.12, cz);
  }
  box(g, 1.16, 0.08, 1.16, P.white, 0, 2.16, 0);
  cyl(g, 0.50, 0.36, 0.18, 10, P.white, 0, 2.26, 0);
  cyl(g, 0.10, 0.10, 0.16, 8, P.plastic, 0.22, 2.40, 0.10, { cast: false });
  box(g, 0.64, 1.62, 0.06, P.looDoor, 0, 0.98, 0.54);
  box(g, 0.72, 0.07, 0.05, P.plastic, 0, 1.80, 0.56);
  box(g, 0.07, 1.62, 0.05, P.plastic, -0.34, 0.98, 0.56);
  box(g, 0.07, 1.62, 0.05, P.plastic, 0.34, 0.98, 0.56);
  for (let i = 0; i < 5; i += 1) {
    box(g, 0.40, 0.045, 0.04, P.plastic, 0, 1.62 - i * 0.09, 0.58, { cast: false });
  }
  box(g, 0.05, 0.16, 0.08, P.steel, 0.22, 1.02, 0.58);
  for (let i = 0; i < 4; i += 1) {
    box(g, 0.04, 0.055, 0.32, P.steelDark, 0.54, 1.88 - i * 0.09, 0, { cast: false });
  }
  ctx.tap(g, 'portaloo', { label: 'loo' });
  return g;
}

export function addSiteCabin(ctx, xMul = -0.42, zMul = 0.42) {
  const { w, d, palette: P } = ctx;
  const g = new THREE.Group();
  g.position.set(w * xMul, 0.42, d * zMul);
  ctx.group.add(g);
  box(g, 2.85, 0.10, 0.12, P.steelDark, 0, -0.22, 0.46);
  box(g, 2.85, 0.10, 0.12, P.steelDark, 0, -0.22, -0.46);
  box(g, 0.55, 0.10, 0.14, P.steel, -1.62, -0.20, 0);
  cyl(g, 0.06, 0.06, 0.16, 6, P.steel, -1.88, -0.20, 0, { rotZ: Math.PI / 2 });
  box(g, 2.78, 1.52, 1.58, P.cabin, 0, 0.58, 0);
  box(g, 2.98, 0.12, 1.78, P.cabin, 0, 1.40, 0);
  box(g, 2.70, 0.10, 0.08, P.white, 0, 1.12, 0.80, { cast: false });
  box(g, 2.70, 0.10, 0.08, P.white, 0, 1.12, -0.80, { cast: false });
  box(g, 0.52, 1.12, 0.06, P.black, 0.88, 0.46, 0.82, { cast: false });
  box(g, 0.22, 0.28, 0.04, P.glassCab, 0.88, 0.82, 0.86, { cast: false });
  box(g, 0.58, 0.46, 0.05, P.glassCab, -0.15, 0.78, 0.82, { cast: false });
  box(g, 0.50, 0.46, 0.05, P.glassCab, -0.82, 0.78, 0.82, { cast: false });
  box(g, 0.58, 0.46, 0.05, P.glassCab, 0.88, 0.78, -0.82, { cast: false });
  box(g, 0.58, 0.46, 0.05, P.glassCab, -0.15, 0.78, -0.82, { cast: false });
  box(g, 0.50, 0.46, 0.05, P.glassCab, -0.82, 0.78, -0.82, { cast: false });
  box(g, 0.48, 0.07, 0.30, P.steel, 0.88, -0.14, 1.02);
  box(g, 0.42, 0.07, 0.26, P.steel, 0.88, 0.04, 0.94);
  for (const x of [-1.05, 0.0, 1.05]) {
    for (const z of [-0.86, 0.86]) {
      cyl(g, 0.26, 0.26, 0.18, 8, P.track, x, -0.30, z, { rotZ: Math.PI / 2 });
      cyl(g, 0.11, 0.11, 0.20, 8, P.steel, x, -0.30, z, { rotZ: Math.PI / 2 });
    }
  }
  ctx.tap(g, 'cabin', { label: 'cabin' });
  return g;
}

export function addTrafficCones(ctx, positions) {
  const { palette: P } = ctx;
  const g = ctx.layer('cones');
  for (let i = 0; i < positions.length; i += 1) {
    const [x, z] = positions[i];
    const c = new THREE.Group();
    c.position.set(x, 0, z);
    g.add(c);
    box(c, 0.50, 0.10, 0.50, P.black, 0, 0.05, 0, { cast: false });
    cone(c, 0.22, 0.86, 8, P.orange, 0, 0.53, 0);
    cyl(c, 0.148, 0.168, 0.11, 8, P.white, 0, 0.48, 0, { cast: false });
    ctx.tap(c, 'cone', { label: `cone-${i}` });
  }
}

/**
 * Toy excavator with turret / boom / stick / bucket joints.
 * Hydraulic rams are visual only (posed with the cycle).
 */
export function addExcavator(ctx, xMul = 0.26, zMul = 0.26) {
  const { w, d, palette: P } = ctx;
  const root = new THREE.Group();
  root.position.set(w * xMul, 0, d * zMul);
  root.name = 'cs:excavator';
  ctx.group.add(root);

  // Two track pontoons. Grousers sit on the TOP and outer faces so a 38° camera sees treads.
  for (const z of [-0.94, 0.94]) {
    const side = z > 0 ? 1 : -1;
    box(root, 3.62, 0.50, 0.78, P.track, 0, 0.36, z);
    cyl(root, 0.34, 0.34, 0.76, 8, P.track, -1.62, 0.36, z, { rotZ: Math.PI / 2 });
    cyl(root, 0.34, 0.34, 0.76, 8, P.track, 1.62, 0.36, z, { rotZ: Math.PI / 2 });
    for (let i = -6; i <= 6; i += 1) {
      box(root, 0.16, 0.09, 0.84, P.steelDark, i * 0.26, 0.65, z, { cast: false });
      box(root, 0.14, 0.20, 0.08, P.steelDark, i * 0.26, 0.36, z + side * 0.43, { cast: false });
    }
  }
  box(root, 2.15, 0.18, 1.58, P.steelDark, 0.05, 0.58, 0);
  cyl(root, 0.52, 0.52, 0.14, 10, P.steel, 0.08, 0.70, 0);

  const turret = new THREE.Group();
  turret.position.set(0.12, 0.78, 0);
  root.add(turret);
  // Rear hood + counterweight (+X). Cab and boom share the -X work end.
  box(turret, 1.72, 0.82, 1.46, P.yellow, 0.28, 0.46, 0);
  box(turret, 0.62, 0.62, 1.46, P.yellowDark, 0.98, 0.34, 0);
  for (let i = 0; i < 4; i += 1) {
    box(turret, 0.07, 0.04, 0.52, P.steelDark, 0.05 + i * 0.16, 0.88, 0.12, { cast: false });
  }
  cyl(turret, 0.07, 0.07, 0.42, 6, P.steelDark, 0.72, 1.08, -0.42);
  box(turret, 0.70, 0.55, 0.22, P.yellow, -0.50, 0.55, 0.18);

  // Cab: glass house offset +Z beside the boom.
  box(turret, 0.94, 0.12, 0.88, P.yellow, -0.42, 0.80, 0.70);
  box(turret, 0.08, 0.78, 0.08, P.yellow, -0.84, 1.22, 1.08);
  box(turret, 0.08, 0.78, 0.08, P.yellow, -0.84, 1.22, 0.32);
  box(turret, 0.08, 0.78, 0.08, P.yellow, -0.02, 1.22, 1.08);
  box(turret, 0.08, 0.78, 0.08, P.yellow, -0.02, 1.22, 0.32);
  box(turret, 1.00, 0.10, 0.94, P.yellow, -0.42, 1.66, 0.70);
  box(turret, 0.05, 0.66, 0.78, P.glassCab, -0.90, 1.24, 0.70, { cast: false });
  box(turret, 0.78, 0.52, 0.05, P.glassCab, -0.42, 1.28, 1.12, { cast: false });
  box(turret, 0.78, 0.52, 0.05, P.glassCab, -0.42, 1.28, 0.28, { cast: false });
  box(turret, 0.05, 0.46, 0.70, P.glassCab, 0.06, 1.26, 0.70, { cast: false });
  sphere(turret, 0.11, 6, P.orange, -0.40, 1.20, 0.70, { cast: false });
  box(turret, 0.20, 0.26, 0.16, P.white, -0.40, 1.00, 0.70, { cast: false });
  sphere(turret, 0.08, 6, P.orange, 0.15, 1.52, 0.22, { cast: false });

  const boom = new THREE.Group();
  boom.position.set(-0.78, 0.96, 0);
  turret.add(boom);
  // Members lie along local -X. Dogleg is mesh-only; rotation.z is the lift joint.
  box(boom, 0.46, 0.48, 0.46, P.yellowDark, 0, 0, 0);
  cyl(boom, 0.18, 0.18, 0.50, 8, P.steelDark, 0, 0, 0, { rotX: Math.PI / 2, cast: false });
  box(boom, 1.48, 0.48, 0.42, P.yellow, -0.70, 0.26, 0, { rotZ: -0.48 });
  box(boom, 1.38, 0.42, 0.38, P.yellow, -1.92, 0.66, 0, { rotZ: -0.14 });
  box(boom, 0.90, 0.20, 0.08, P.yellowDark, -0.62, 0.36, 0.24, { rotZ: -0.48, cast: false });
  box(boom, 0.90, 0.20, 0.08, P.yellowDark, -0.62, 0.36, -0.24, { rotZ: -0.48, cast: false });

  const stick = new THREE.Group();
  stick.position.set(-2.58, 0.70, 0);
  boom.add(stick);
  box(stick, 0.40, 0.40, 0.40, P.yellowDark, 0, 0, 0);
  box(stick, 1.82, 0.36, 0.34, P.yellow, -0.90, -0.04, 0);
  box(stick, 1.20, 0.16, 0.08, P.yellowDark, -0.72, 0.14, 0.20, { cast: false });

  const bucket = new THREE.Group();
  bucket.position.set(-1.78, -0.08, 0);
  stick.add(bucket);
  box(bucket, 0.16, 0.54, 0.90, P.yellowDark, 0.04, 0.04, 0);
  box(bucket, 0.64, 0.12, 0.90, P.yellowDark, -0.28, -0.22, 0);
  box(bucket, 0.64, 0.50, 0.10, P.yellow, -0.28, 0.02, 0.40);
  box(bucket, 0.64, 0.50, 0.10, P.yellow, -0.28, 0.02, -0.40);
  for (const tz of [-0.34, -0.12, 0.12, 0.34]) {
    box(bucket, 0.22, 0.10, 0.12, P.steelDark, -0.68, -0.24, tz);
  }

  cyl(boom, 0.07, 0.07, 1.15, 6, P.steel, -0.72, -0.18, 0.20, { rotZ: 0.42, cast: false });
  cyl(stick, 0.06, 0.06, 0.95, 6, P.steel, -0.50, 0.22, 0.18, { rotZ: -0.32, cast: false });

  const rig = { root, turret, boom, stick, bucket, tapYaw: 0 };
  ctx.rig('excavator', rig);
  ctx.tap(root, 'excavator', { label: 'excavator' });
  return rig;
}

export function addPumpTruck(ctx, xMul = 0.42, zMul = 0.34) {
  const { w, d, palette: P } = ctx;
  const root = new THREE.Group();
  root.position.set(w * xMul, 0, d * zMul);
  ctx.group.add(root);
  box(root, 2.35, 0.85, 1.15, P.pump, 0.15, 0.7, 0);
  box(root, 0.95, 0.72, 1.05, P.pump, 1.35, 1.15, 0);
  box(root, 0.06, 0.42, 0.72, P.glassCab, 1.84, 1.22, 0, { cast: false });
  cyl(root, 0.22, 0.22, 0.18, 8, P.track, 1.15, 0.22, 0.52, { rotZ: Math.PI / 2 });
  cyl(root, 0.22, 0.22, 0.18, 8, P.track, 1.15, 0.22, -0.52, { rotZ: Math.PI / 2 });
  cyl(root, 0.24, 0.24, 0.18, 8, P.track, -0.65, 0.24, 0.52, { rotZ: Math.PI / 2 });
  cyl(root, 0.24, 0.24, 0.18, 8, P.track, -0.65, 0.24, -0.52, { rotZ: Math.PI / 2 });
  box(root, 0.08, 0.55, 0.08, P.steel, 0.85, 0.28, 0.62);
  box(root, 0.08, 0.55, 0.08, P.steel, 0.85, 0.28, -0.62);

  const boom = new THREE.Group();
  boom.position.set(-0.35, 1.25, 0);
  root.add(boom);
  capsule(boom, 0.1, 2.4, 7, P.pump, -1.05, 0.15, 0, { rotZ: Math.PI / 2 });
  const stick = new THREE.Group();
  stick.position.set(-2.15, 0.2, 0);
  boom.add(stick);
  capsule(stick, 0.08, 1.7, 7, P.pump, -0.7, -0.1, 0, { rotZ: Math.PI / 2 });
  const hose = cyl(stick, 0.07, 0.09, 0.85, 7, P.black, -1.55, -0.35, 0, { rotX: 0.9 });
  hose.userData.baseY = hose.position.y;
  ctx.rig('pump', { root, boom, stick, hose });
  ctx.tap(root, 'cabin', { label: 'pump' });
  return root;
}

export function addTowerCrane(ctx) {
  const { w, d, height, palette: P } = ctx;
  const mastH = Math.max(11, height + 5.5);
  const root = new THREE.Group();
  root.position.set(w * 0.48, 0, d * 0.48);
  ctx.group.add(root);
  box(root, 0.85, 0.28, 0.85, P.concrete, 0, 0.14, 0);
  for (let i = 0; i < 8; i += 1) {
    const y = 0.4 + i * (mastH / 8);
    box(root, 0.28, mastH / 8.4, 0.28, P.hazard, 0, y, 0);
    box(root, 0.08, 0.08, 0.55, P.steel, 0, y, 0, { rotY: i % 2 ? 0.7 : -0.7, cast: false });
  }
  const slew = new THREE.Group();
  slew.position.set(0, mastH, 0);
  root.add(slew);
  box(slew, 7.4, 0.18, 0.28, P.hazard, 1.6, 0, 0);
  box(slew, 2.4, 0.18, 0.22, P.hazard, -1.6, 0, 0);
  box(slew, 0.7, 0.55, 0.55, P.cabin, 0.4, -0.35, 0);
  box(slew, 0.12, 1.4, 0.12, P.steel, 3.4, -0.7, 0);
  box(slew, 0.45, 0.35, 0.45, P.steelDark, 3.4, -1.45, 0);
  ctx.rig('crane', slew);
  ctx.tap(root, 'crane', { label: 'crane' });
  return root;
}

export function addAccidentOverlay(ctx) {
  const { d, palette: P } = ctx;
  box(ctx.group, 2.6, 0.09, 0.07, P.hazard, 0, 1.25, -d / 2 - 0.55, { rotY: 0.38, cast: false });
  box(ctx.group, 2.6, 0.09, 0.07, P.firstAid, 0, 1.4, -d / 2 - 0.55, { rotY: -0.38, cast: false });
  box(ctx.group, 0.6, 0.4, 0.45, P.firstAid, -1.25, 0.28, -d / 2 - 0.22);
  box(ctx.group, 0.35, 0.08, 0.08, P.white, -1.25, 0.42, -d / 2, { cast: false });
  box(ctx.group, 0.08, 0.35, 0.08, P.white, -1.25, 0.42, -d / 2, { cast: false });
}
