// Stage 2 — timber frame. Chunky Monopoly Plus sticks so the skeleton reads at orbit.
// Every stud / joist / rafter is a tap-sway member.

import * as THREE from 'three';
import { box, fitRoof, fitBeam } from './kit.js';
import { addPortaloo, addSiteCabin, addTrafficCones } from './plant.js';

function studWall(ctx, parent, {
  alongW, x, z, length, y0, storeyH, level, opening = false,
}) {
  const { palette: P } = ctx;
  const stud = 0.2;
  const count = Math.max(5, Math.floor(length / 0.7));
  for (let i = 0; i <= count; i += 1) {
    const t = i / count - 0.5;
    const px = alongW ? t * length : x;
    const pz = alongW ? z : t * length;
    if (level === 0 && alongW && z < 0 && Math.abs(t) < 0.08) continue;
    const isWindow = opening && alongW && z < 0
      && (Math.abs(t - 0.24) < 0.05 || Math.abs(t + 0.22) < 0.05);
    const pivot = new THREE.Group();
    parent.add(pivot);
    pivot.position.set(px, y0, pz);
    if (isWindow) {
      box(pivot, stud, storeyH * 0.28, stud, P.pine, 0, storeyH * 0.16, 0);
      box(pivot, stud, storeyH * 0.26, stud, P.pine, 0, storeyH * 0.8, 0);
    } else {
      box(pivot, stud, storeyH * 0.9, stud, P.pine, 0, storeyH * 0.46, 0);
    }
    ctx.tap(pivot, 'beam', { label: `stud-${level}-${alongW ? 'w' : 'd'}-${i}` });
  }
  if (alongW) {
    box(parent, length, 0.14, 0.16, P.plate, 0, y0 + 0.08, z);
    box(parent, length, 0.14, 0.16, P.plate, 0, y0 + storeyH * 0.9, z);
    box(parent, length * 0.92, 0.1, 0.1, P.plate, 0, y0 + storeyH * 0.48, z);
  } else {
    box(parent, 0.16, 0.14, length, P.plate, x, y0 + 0.08, 0);
    box(parent, 0.16, 0.14, length, P.plate, x, y0 + storeyH * 0.9, 0);
    box(parent, 0.1, 0.1, length * 0.92, P.plate, x, y0 + storeyH * 0.48, 0);
  }
}

export function buildFrame(ctx) {
  if (ctx.fit) return buildFittedFrame(ctx);
  const { w, d, height, storeys, palette: P } = ctx;

  const slab = ctx.layer('slab-hold');
  box(slab, w * 0.94, 0.22, d * 0.94, P.slab, 0, 0.11, 0, { cast: false, receive: true });

  const levels = Math.max(1, Math.min(storeys, 4));
  const storeyH = Math.min(3.05, (height * 0.78) / levels);
  const inset = 0.38;

  const l0 = ctx.layer('frame-l0');
  const l1 = ctx.layer('frame-l1');
  const roof = ctx.layer('frame-roof');
  const brace = ctx.layer('frame-brace');

  for (let level = 0; level < levels; level += 1) {
    const parent = level === 0 ? l0 : l1;
    const y0 = 0.24 + level * storeyH;
    const walls = [
      { alongW: true, z: -d * inset, x: 0 },
      { alongW: true, z: d * inset, x: 0 },
      { alongW: false, x: -w * inset, z: 0 },
      { alongW: false, x: w * inset, z: 0 },
    ];
    for (const wall of walls) {
      const length = wall.alongW ? w * 0.82 : d * 0.82;
      studWall(ctx, parent, {
        alongW: wall.alongW,
        x: wall.x,
        z: wall.z,
        length,
        y0,
        storeyH,
        level,
        opening: true,
      });
    }
    if (level < levels - 1) {
      for (let i = 0; i < 7; i += 1) {
        const x = -w * 0.34 + i * (w * 0.11);
        const joist = new THREE.Group();
        parent.add(joist);
        joist.position.set(x, y0 + storeyH * 0.95, 0);
        box(joist, 0.12, 0.18, d * 0.78, P.plate, 0, 0, 0);
        ctx.tap(joist, 'joist', { label: `joist-${i}` });
      }
    }
  }

  const wallTop = 0.24 + levels * storeyH;
  const rise = Math.min(1.65, w * 0.22);
  const ridgeY = wallTop + rise;
  box(roof, 0.16, 0.16, d * 0.72, P.pine, 0, ridgeY, 0);
  const rafterLen = Math.hypot(w * 0.38, rise);
  const pitch = Math.atan2(rise, w * 0.38);
  for (let k = 0; k < 6; k += 1) {
    const z = -d * 0.3 + k * (d * 0.12);
    const truss = new THREE.Group();
    roof.add(truss);
    truss.position.set(0, wallTop, z);
    box(truss, rafterLen, 0.13, 0.13, P.pine, -w * 0.19, rise * 0.5, 0, { rotZ: pitch });
    box(truss, rafterLen, 0.13, 0.13, P.pine, w * 0.19, rise * 0.5, 0, { rotZ: -pitch });
    box(truss, w * 0.32, 0.1, 0.1, P.plate, 0, rise * 0.38, 0);
    ctx.tap(truss, 'truss', { label: `truss-${k}` });
  }

  // Diagonal braces
  for (const sign of [-1, 1]) {
    box(brace, w * 0.36, 0.1, 0.1, P.plate, sign * w * 0.12, 0.24 + storeyH * 0.45, -d * inset, {
      rotZ: sign * 0.55,
    });
  }

  addSiteCabin(ctx);
  addPortaloo(ctx, 0.42, 0.4);
  addTrafficCones(ctx, [
    [-w * 0.5, -d * 0.54],
    [w * 0.5, -d * 0.54],
  ]);
}

function buildFittedFrame(ctx) {
  const { fit, palette: P } = ctx;
  const { w, d, eave, ridge, form } = fit;
  const slab = ctx.fitLayer('slab-hold');
  box(slab, w, 0.22, d, P.slab, 0, 0.11, 0, { cast: false, receive: true });
  const levels = Math.max(1, ctx.storeys);
  const storeyH = (eave - 0.24) / levels;
  const l0 = ctx.fitLayer('frame-l0'), l1 = ctx.fitLayer('frame-l1');
  const roof = ctx.fitLayer('frame-roof'), brace = ctx.fitLayer('frame-brace');
  for (let level = 0; level < levels; level++) {
    const parent = level === 0 ? l0 : l1;
    const y0 = 0.24 + level * storeyH;
    for (const alongW of [true, false]) for (const sign of [-1, 1]) {
      studWall(ctx, parent, { alongW, x: sign * (w / 2 - 0.1), z: sign * (d / 2 - 0.1),
        length: (alongW ? w : d) - 0.2, y0, storeyH: storeyH / 0.9, level, opening: true });
    }
    if (level < levels - 1) for (let i = 0; i < 7; i++) {
      const joist = box(parent, 0.12, 0.18, d, P.plate, (i / 6 - 0.5) * (w - 0.2), y0 + storeyH, 0);
      ctx.tap(joist, 'joist', { label: `joist-${level}-${i}` });
    }
  }
  const { along, across, ridgeHalf, point } = fitRoof(fit);
  if (form === 'flat') {
    for (let i = 0; i < 8; i++) {
      const u = (i / 7 - 0.5) * (along - 0.2);
      fitBeam(roof, point(u, eave, -across / 2), point(u, eave, across / 2), 0.16, P.plate, 'cs:flat-joist');
    }
  } else {
    fitBeam(roof, point(-ridgeHalf, ridge, 0), point(ridgeHalf, ridge, 0), 0.16, P.pine, 'cs:ridge');
    for (let i = 0; i < 6; i++) {
      const u = (i / 5 - 0.5) * ridgeHalf * 2;
      const truss = new THREE.Group(); roof.add(truss);
      for (const sign of [-1, 1]) fitBeam(truss, point(u, eave, sign * across / 2), point(u, ridge, 0), 0.13, P.pine);
      fitBeam(truss, point(u, eave, -across / 2), point(u, eave, across / 2), 0.1, P.plate);
      ctx.tap(truss, 'truss', { label: `truss-${i}` });
    }
    if (form === 'hip') for (const end of [-1, 1]) for (const side of [-1, 1]) {
      fitBeam(roof, point(end * along / 2, eave, side * across / 2), point(end * ridgeHalf, ridge, 0), 0.13, P.pine, 'cs:hip-rafter');
    }
  }
  for (const sign of [-1, 1]) fitBeam(brace, [-w * 0.3, 0.35, sign * (d / 2 - 0.1)], [w * 0.3, 0.24 + storeyH * 0.8, sign * (d / 2 - 0.1)], 0.1, P.plate);
  addSiteCabin(ctx); addPortaloo(ctx, 0.42, 0.4);
  addTrafficCones(ctx, [[-ctx.w * 0.5, -ctx.d * 0.54], [ctx.w * 0.5, -ctx.d * 0.54]]);
}
