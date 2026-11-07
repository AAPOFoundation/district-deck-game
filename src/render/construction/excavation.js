// Intra-quarter excavation — on-pad recess, berm ring, soldier piles, timber shoring, trench box.
// Board table is y=0; the well is an on-pad recess. Inherited demo-rubble (y≈0.30) is buried by the floor.

import * as THREE from 'three';
import { box, cyl, sphere } from './kit.js';

function hPile(parent, P, x, z, h, alongX) {
  const y = h / 2;
  if (alongX) {
    box(parent, 0.24, h, 0.055, P.rebar, x, y, z);
    box(parent, 0.055, h, 0.18, P.rebar, x, y, z);
  } else {
    box(parent, 0.055, h, 0.24, P.rebar, x, y, z);
    box(parent, 0.18, h, 0.055, P.rebar, x, y, z);
  }
  box(parent, 0.26, 0.05, 0.26, P.steel, x, h + 0.02, z);
}

function lagging(parent, P, alongX, cx, cz, length, yMid, h) {
  const bw = 0.28;
  const step = 0.32;
  const n = Math.max(5, Math.floor(length / step));
  const span = (n - 1) * step;
  for (let i = 0; i < n; i += 1) {
    const t = -span / 2 + i * step;
    const mat = i % 3 === 0 ? P.pine : (i % 2 ? P.plate : P.timber);
    if (alongX) box(parent, bw, h, 0.08, mat, cx + t, yMid, cz);
    else box(parent, 0.08, h, bw, mat, cx, yMid, cz + t);
  }
}

function walerRun(parent, P, alongX, cx, cz, length, y, tapCtx, label) {
  const t = 0.18;
  const h = 0.22;
  const mesh = alongX
    ? box(parent, length * 0.94, h, t, P.timber, cx, y, cz)
    : box(parent, t, h, length * 0.94, P.timber, cx, y, cz);
  if (tapCtx) tapCtx.tap(mesh, 'beam', { label });
  return mesh;
}

function trenchBox(ctx, parent, P, x, floorTop, z) {
  const g = new THREE.Group();
  g.position.set(x, floorTop, z);
  parent.add(g);
  const bw = 2.2;
  const bd = 1.32;
  const bh = 0.8;
  box(g, bw - 0.14, 0.08, bd - 0.14, P.plastic, 0, 0.05, 0);
  box(g, bw, bh, 0.1, P.plastic, 0, bh / 2, bd / 2 - 0.04);
  box(g, bw, bh, 0.1, P.plastic, 0, bh / 2, -bd / 2 + 0.04);
  box(g, 0.1, bh, bd, P.plastic, bw / 2 - 0.04, bh / 2, 0);
  box(g, 0.1, bh, bd, P.plastic, -bw / 2 + 0.04, bh / 2, 0);
  box(g, bw + 0.08, 0.1, 0.14, P.hazard, 0, bh + 0.02, bd / 2);
  box(g, bw + 0.08, 0.1, 0.14, P.hazard, 0, bh + 0.02, -bd / 2);
  box(g, 0.14, 0.1, bd + 0.08, P.hazard, bw / 2, bh + 0.02, 0);
  box(g, 0.14, 0.1, bd + 0.08, P.hazard, -bw / 2, bh + 0.02, 0);
  for (let i = 0; i < 5; i += 1) {
    const t = (i / 4 - 0.5) * 0.84;
    const mat = i % 2 ? P.hazardBlk : P.hazard;
    box(g, 0.34, 0.24, 0.04, mat, t * bw, bh * 0.52, bd / 2 + 0.04, { cast: false });
    box(g, 0.34, 0.24, 0.04, mat, t * bw, bh * 0.52, -bd / 2 - 0.04, { cast: false });
  }
  ctx.tap(g, 'skip', { label: 'trench-box' });
}

function dumpHeap(ctx, parent, P, x, base, z) {
  // One lumpy dump on remaining grade — not a ring of identical muffins.
  sphere(parent, 1.22, 8, P.dirt, x, base + 0.52, z);
  sphere(parent, 0.92, 7, P.dirtWet, x + 0.58, base + 0.38, z + 0.28);
  sphere(parent, 0.7, 7, P.mud, x + 0.12, base + 0.32, z - 0.4);
  sphere(parent, 0.54, 6, P.dirt, x + 0.22, base + 0.7, z - 0.32);
  sphere(parent, 0.44, 6, P.dirtWet, x + 0.88, base + 0.26, z - 0.06);
  sphere(parent, 0.36, 5, P.dirt, x - 0.18, base + 0.76, z + 0.16);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + ctx.u(`ex-st:${i}`) * 0.5;
    const r = 0.42 + ctx.u(`ex-sr:${i}`) * 0.5;
    box(
      parent,
      0.14 + (i % 3) * 0.06,
      0.09 + (i % 2) * 0.05,
      0.12,
      i % 3 === 0 ? P.brick : P.concrete,
      x + Math.cos(a) * r,
      base + 0.48 + ctx.u(`ex-sy:${i}`) * 0.16,
      z + Math.sin(a) * r * 0.8,
      { rotY: a, cast: false },
    );
  }
}

export function buildExcavation(ctx) {
  const { w, d, palette: P } = ctx;
  const pit = ctx.layer('excavation');

  const bermW = Math.min(0.86, w * 0.09);
  const bermH = 1.14;
  const floorTop = 0.36;
  const floorH = 0.3;
  const gradeTop = 0.34;

  // Hole sits west of the stock excavator (w*0.18) so tracks stay on remaining grade.
  const eastOuterMax = w * 0.18 - 1.78;
  const westInner = -w * 0.5 + 0.16 + bermW;
  const eastInner = eastOuterMax - bermW;
  const pitW = Math.max(2.8, eastInner - westInner);
  const pitD = Math.max(3.1, Math.min(d * 0.5, d - bermW * 2 - 1.0));
  const pitX = (westInner + eastInner) / 2;
  const pitZ = -d * 0.05;

  const xL = pitX - pitW / 2;
  const xR = pitX + pitW / 2;
  const zS = pitZ - pitD / 2;
  const zN = pitZ + pitD / 2;

  // Lot apron under everything.
  box(pit, w * 0.96, 0.1, d * 0.96, P.dirt, 0, 0.05, 0, { receive: true, cast: false });

  // Remaining grade east of the cut — buries leftover demo slab beside the machine.
  const gradeW = Math.max(2.4, w * 0.52);
  box(pit, gradeW, gradeTop, d * 0.9, P.dirt, xR + bermW + gradeW / 2 - 0.05, gradeTop / 2, 0, {
    receive: true,
  });

  // Dark wet floor. Covers leftover demo-rubble (top ≈ 0.30) so the cut is not a raft.
  box(pit, pitW, floorH, pitD, P.mud, pitX, floorTop - floorH / 2, pitZ, {
    receive: true, cast: false,
  });
  box(pit, pitW * 0.72, 0.06, pitD * 0.62, P.dirtWet, pitX - 0.08, floorTop + 0.01, pitZ + 0.06, {
    receive: true, cast: false,
  });
  box(pit, pitW * 0.28, 0.04, pitD * 0.22, P.track, pitX + pitW * 0.12, floorTop + 0.03, pitZ - 0.1, {
    receive: true, cast: false,
  });

  // Continuous berm ring — earth walls around the well, not a wide pad under the excavator.
  const ringW = pitW + bermW * 2;
  box(pit, ringW, bermH, bermW, P.dirt, pitX, bermH / 2, zS - bermW / 2);
  box(pit, ringW, bermH, bermW, P.dirt, pitX, bermH / 2, zN + bermW / 2);
  box(pit, bermW, bermH, pitD, P.dirt, xL - bermW / 2, bermH / 2, pitZ);
  box(pit, bermW, bermH, pitD, P.dirt, xR + bermW / 2, bermH / 2, pitZ);

  // Inner batter — two clay terraces so the well reads as a cut, not four slabs.
  const faceH = bermH - floorTop;
  const stepH = faceH * 0.42;
  const stepY = floorTop + stepH / 2;
  box(pit, pitW, stepH, 0.36, P.dirtWet, pitX, stepY, zS + 0.16);
  box(pit, pitW, stepH, 0.36, P.dirtWet, pitX, stepY, zN - 0.16);
  box(pit, 0.36, stepH, pitD, P.dirtWet, xL + 0.16, stepY, pitZ);
  box(pit, 0.36, stepH, pitD, P.dirtWet, xR - 0.16, stepY, pitZ);

  // Foot shadow around the floor (fake AO).
  box(pit, pitW, 0.03, 0.14, P.track, pitX, floorTop + 0.01, zS + 0.08, { cast: false, receive: true });
  box(pit, pitW, 0.03, 0.14, P.track, pitX, floorTop + 0.01, zN - 0.08, { cast: false, receive: true });
  box(pit, 0.14, 0.03, pitD, P.track, xL + 0.08, floorTop + 0.01, pitZ, { cast: false, receive: true });
  box(pit, 0.14, 0.03, pitD, P.track, xR - 0.08, floorTop + 0.01, pitZ, { cast: false, receive: true });

  // Narrow access ramp on the south-east lip.
  const rampW = 1.15;
  const rampX = xR - 0.15;
  const rampZ = zS + 0.85;
  box(pit, 0.85, bermH * 0.38, rampW, P.dirt, rampX + 0.15, floorTop + bermH * 0.2, rampZ);
  box(pit, 0.55, bermH * 0.62, rampW * 0.92, P.dirtWet, rampX + 0.38, floorTop + bermH * 0.32, rampZ);

  dumpHeap(ctx, pit, P, xR + bermW + 1.55, gradeTop, zS - bermW * 0.2);

  const shore = ctx.layer('shoring');
  const pileH = bermH + 0.22;
  const lagH = faceH - 0.06;
  const lagY = floorTop + lagH / 2 + 0.02;
  const inset = 0.07;

  // Vertical timber lagging — picture-frame around the void.
  lagging(shore, P, true, pitX, zS + inset, pitW - 0.3, lagY, lagH);
  lagging(shore, P, true, pitX, zN - inset, pitW - 0.3, lagY, lagH);
  lagging(shore, P, false, xL + inset, pitZ, pitD - 0.3, lagY, lagH);
  lagging(shore, P, false, xR - inset, pitZ, pitD - 0.3, lagY, lagH);

  // Rusty H soldier piles at regular centres, including corners.
  const nLong = Math.max(4, Math.round(pitW / 1.15));
  const nShort = Math.max(3, Math.round(pitD / 1.2));
  for (let i = 0; i <= nLong; i += 1) {
    const x = xL + (i / nLong) * pitW;
    hPile(shore, P, x, zS + 0.02, pileH, true);
    hPile(shore, P, x, zN - 0.02, pileH, true);
  }
  for (let i = 1; i < nShort; i += 1) {
    const z = zS + (i / nShort) * pitD;
    hPile(shore, P, xL + 0.02, z, pileH, false);
    hPile(shore, P, xR - 0.02, z, pileH, false);
  }

  // Chunky timber walers — two rails per face, in front of the lagging.
  const yLow = floorTop + faceH * 0.32;
  const yHigh = floorTop + faceH * 0.78;
  walerRun(shore, P, true, pitX, zS + 0.16, pitW, yLow, ctx, 'waler-s-lo');
  walerRun(shore, P, true, pitX, zS + 0.16, pitW, yHigh, ctx, 'waler-s-hi');
  walerRun(shore, P, true, pitX, zN - 0.16, pitW, yLow, ctx, 'waler-n-lo');
  walerRun(shore, P, true, pitX, zN - 0.16, pitW, yHigh, ctx, 'waler-n-hi');
  walerRun(shore, P, false, xL + 0.16, pitZ, pitD, yLow, ctx, 'waler-w-lo');
  walerRun(shore, P, false, xL + 0.16, pitZ, pitD, yHigh, ctx, 'waler-w-hi');
  walerRun(shore, P, false, xR - 0.16, pitZ, pitD, yLow, ctx, 'waler-e-lo');
  walerRun(shore, P, false, xR - 0.16, pitZ, pitD, yHigh, ctx, 'waler-e-hi');

  // Pile-to-waler bolts.
  for (let i = 0; i <= nLong; i += 1) {
    const x = xL + (i / nLong) * pitW;
    cyl(shore, 0.035, 0.035, 0.1, 5, P.steel, x, yLow, zS + 0.26, { rotX: Math.PI / 2, cast: false });
    cyl(shore, 0.035, 0.035, 0.1, 5, P.steel, x, yHigh, zS + 0.26, { rotX: Math.PI / 2, cast: false });
    cyl(shore, 0.035, 0.035, 0.1, 5, P.steel, x, yLow, zN - 0.26, { rotX: Math.PI / 2, cast: false });
    cyl(shore, 0.035, 0.035, 0.1, 5, P.steel, x, yHigh, zN - 0.26, { rotX: Math.PI / 2, cast: false });
  }

  trenchBox(ctx, shore, P, pitX - pitW * 0.12, floorTop, pitZ + 0.08);
}
