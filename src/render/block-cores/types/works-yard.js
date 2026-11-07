// Block-core works yard. Two variants:
//   0 council depot — yellow corrugated shed, open roller, skip, pallets
//   1 compound — open-bay workshop, pipe rack, drums, hoarding
//
// taste-r1 W10-C: asphalt yard ground, worn-white bay outline at the roller bay, one drain,
// stains, and stores (skips, pallets, drums, steel lockers) grouped against the fence and the
// shed instead of scattered across the pad.

import { CORE_HARDSTAND as G, deriveWorksYardPalette } from '../kit.js';

export function buildWorksYard(ctx) {
  ctx.palette = deriveWorksYardPalette(ctx.palette);
  ctx.hardstand({ fill: 'yard', kerb: true });
  ctx.chainLink({
    halfX: 7.2, halfZ: 7.2, h: 1.45, gate: true, gateWidth: 2.8, barb: true, mesh: true,
  });
  ctx.sign(0, 7.1, 0, 'paintY');
  ctx.paintLine(0, 5.4, 2.8, 90);
  ctx.oilSpot(4.8, 4.2, 1.1);
  ctx.oilSpot(-3.2, 3.6, 0.85);
  ctx.oilSpot(2.2, -4.4, 0.7);
  ctx.letterBar('DIESEL', 5.15, 1.18, 4.55, { scale: 0.58 });
  if (ctx.variant === 0) depot(ctx);
  else compound(ctx);
}

function depot(ctx) {
  ctx.corrugatedShed({
    x: -2.4, z: -1.9, w: 7.4, d: 5.2, h: 3.15, yaw: 0,
    wall: 'paintY', roof: 'steel',
    bay: true, bayW: 2.7, bayH: 2.2,
    sign: 'WORKS', apron: 'yard',
  });
  ctx.torus('steel', 0.32, 0.08, -2.55, 0.55, 0.35);
  ctx.box('steel', 0.55, 0.85, 0.55, -1.85, 0.58, 0.15);
  ctx.bayLines(-2.4, 0.7, 3.4, 2.4, 0);
  ctx.yardDrain(2.0, 0.6, 8.0, 0);
  ctx.yardPatch(-2.2, 3.4, 2.2, 1.2, 6);
  // Skips along the east fence, pallets and drums against the shed walls.
  ctx.skip(6.3, 2.2, 90);
  ctx.skip(6.3, -0.2, 90);
  ctx.skip(6.3, -2.6, 90, 'soil');
  ctx.pallet(-6.65, -1.9, 3, { yaw: 90 });
  ctx.pallet(-6.65, -0.6, 2, { yaw: 90 });
  ctx.pallet(-6.65, 0.7, 4, { yaw: 90 });
  ctx.drum(-5.1, -4.9, 'paintO');
  ctx.drum(-4.45, -4.6, 'paintO');
  ctx.drum(-0.2, -4.9, 'paintR');
  ctx.drum(0.45, -4.6, 'paintO');
  ctx.box('soil', 2.35, 0.85, 1.15, 3.0, 0.60, -5.9);
  ctx.box('soil', 1.85, 0.95, 1.15, 5.0, 0.64, -5.9);
}

function compound(ctx) {
  ctx.corrugatedShed({
    x: 2.6, z: -2.4, w: 6.2, d: 4.6, h: 2.95, yaw: 180,
    wall: 'paintY', roof: 'steel',
    bay: true, bayW: 2.5, bayH: 2.05,
    sign: 'WORKS', apron: 'yard',
  });
  ctx.box('steel', 2.5, 0.45, 0.10, 2.6, 2.45, -4.68);
  ctx.box('steel', 0.10, 2.0, 0.10, 1.4, 1.2, -4.68);
  ctx.box('steel', 0.10, 2.0, 0.10, 3.8, 1.2, -4.68);
  ctx.box('paintY', 0.10, 2.15, 6.4, -6.7, 1.22, 0.6);
  ctx.box('paintY', 5.2, 2.15, 0.10, -4.1, 1.22, -6.7);
  ctx.box('steel', 0.12, 2.2, 0.12, -6.7, 1.25, -6.7);
  for (let i = 0; i < 4; i += 1) {
    ctx.pipe(-5.2 + i * 0.38, 0.42, -3.2, -5.2 + i * 0.38, 0.42, 3.1, 0.10, 'steel');
  }
  ctx.box('steel', 1.7, 1.05, 0.14, -4.65, 0.7, -3.25);
  ctx.box('steel', 1.7, 1.05, 0.14, -4.65, 0.7, 3.15);
  ctx.bayLines(2.6, -4.7, 3.2, 1.8, 180);
  ctx.yardDrain(-1.0, 0.8, 8.0, 0);
  ctx.yardPatch(3.2, 2.4, 2.0, 1.1, -4);
  ctx.skip(-2.2, 6.3, 0);
  ctx.drum(5.6, 4.6, 'paintO');
  ctx.drum(6.25, 4.25, 'paintR');
  ctx.pallet(6.5, 2.4, 3, { yaw: 90 });
  ctx.pallet(6.5, 1.1, 2, { yaw: 90 });
  for (const x of [-1.4, 0.0, 1.4]) {
    ctx.cyl('paintY', 0.16, 0.20, 0.55, x, 0.42, 5.5, 8);
    ctx.cyl('paintR', 0.07, 0.07, 0.28, x, 0.78, 5.5, 6);
  }
}
