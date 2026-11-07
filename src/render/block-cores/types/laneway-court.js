// Block-core laneway court. Two variants:
//   0 L-service alley — three wall rollers + mural + bins
//   1 loading pocket — two rollers, dock, canopy off the wall
//
// taste-r1 W10-C: the yard is asphalt service ground (see `hardstand`), with a drain, two or
// three stains, worn-white bay outlines at the roller doors, council-size bins and pallets
// grouped against the walls. The old pale pad, 4 x 4 joint grid, lime lines and pastel bins
// read as a roofless building's floor plan.

import { CORE_HARDSTAND as G } from '../kit.js';

export function buildLanewayCourt(ctx) {
  ctx.hardstand({ fill: 'yard', kerb: true });
  if (ctx.variant === 0) muralLane(ctx);
  else loadingLane(ctx);
}

function muralLane(ctx) {
  ctx.box('brick', 8.4, 3.45, 0.62, -2.5, 1.85, -6.95);
  ctx.box('brick', 3.2, 3.45, 0.62, 5.85, 1.85, -6.95);
  ctx.box('brick', 14.8, 0.75, 0.62, 0, 3.20, -6.95);

  ctx.box('brick', 0.62, 3.25, 1.50, -7.08, 1.75, -6.45);
  ctx.box('brick', 0.62, 3.25, 0.70, -7.08, 1.75, -3.05);
  ctx.box('brick', 0.62, 3.25, 4.00, -7.08, 1.75, 1.55);
  ctx.box('brick', 0.62, 0.70, 10.8, -7.08, 3.10, -1.55);

  // Paint-on-brick wash: yellow is the wall, brick units read through, no cards.
  ctx.box('paintY', 8.35, 3.60, 0.06, -2.50, 1.95, -6.61);
  ctx.box('paintY', 3.55, 3.60, 0.06, 5.90, 1.95, -6.61);
  ctx.box('paintY', 2.70, 1.20, 0.06, 2.85, 3.08, -6.61);
  ctx.box('paintY', 0.18, 2.45, 0.10, 1.70, 1.42, -6.50);
  ctx.box('paintY', 0.18, 2.45, 0.10, 4.00, 1.42, -6.50);
  ctx.box('paintY', 0.10, 3.40, 2.55, -6.74, 1.85, -5.85);
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 22; col += 1) {
      if ((row + col) % 3 === 1) continue;
      const px = -6.35 + col * 0.58 + (row % 2) * 0.28;
      if (px > 1.55 && px < 4.15) continue;
      const py = 0.55 + row * 0.34;
      ctx.box('brick', 0.50, 0.14, 0.03, px, py, -6.575);
    }
  }
  ctx.boxEx('paintO', 6.4, 2.85, 0.05, -2.4, 1.85, -6.568, { yaw: 3 });
  ctx.boxEx('soil', 5.6, 2.25, 0.045, 0.8, 1.55, -6.564, { yaw: -4 });
  ctx.boxEx('paintY', 4.8, 1.65, 0.04, 4.2, 2.15, -6.560, { yaw: 5 });
  ctx.boxEx('soil', 3.4, 1.35, 0.04, -4.2, 2.45, -6.558, { yaw: -6 });
  for (const [px, h, mat] of [
    [-5.15, 2.25, 'paintY'], [-3.85, 1.95, 'paintO'], [-2.55, 2.15, 'paintY'],
    [-1.25, 1.65, 'soil'], [0.05, 1.45, 'paintO'], [5.15, 1.85, 'paintY'],
    [6.25, 1.55, 'soil'],
  ]) {
    ctx.box(mat, 0.28, h, 0.06, px, 0.22, -6.585);
    ctx.box(mat, 0.38, 0.16, 0.07, px, 0.18, -6.580);
  }
  ctx.box('paintY', 0.55, 2.35, 0.16, 1.78, 1.28, -6.52);
  ctx.box('paintR', 0.48, 1.25, 0.18, 1.88, 0.82, -6.50);
  ctx.box('paintY', 0.50, 2.05, 0.16, 3.92, 1.18, -6.52);
  ctx.box('soil', 0.42, 1.05, 0.16, 3.82, 0.72, -6.50);
  ctx.box('soil', 0.40, 1.55, 0.12, 1.95, 1.05, -6.50);
  // Ground marks: one drain falling to a grate, a repair patch, three stains.
  ctx.yardDrain(0.3, 1.1, 9.0, 0);
  ctx.yardPatch(1.7, -1.5, 2.1, 1.2, 4);
  ctx.oilSpot(-1.4, 2.4, 0.7);
  ctx.oilSpot(3.3, 0.4, 0.55);
  ctx.oilSpot(-0.2, -2.6, 0.45);
  ctx.bayLines(2.85, -6.62, 2.9, 2.6, 0);
  ctx.bayLines(-6.72, -4.55, 2.9, 2.6, 90);
  ctx.bayLines(-6.72, -1.55, 2.9, 2.6, 90);

  ctx.rollerInWall(-6.72, 0.22, -4.55, {
    w: 2.15, h: 2.25, yaw: 90, bucket: 'steel', open: 0.22, sill: 'yard',
  });
  ctx.rollerInWall(-6.72, 0.22, -1.55, {
    w: 2.15, h: 2.30, yaw: 90, bucket: 'soil', open: 0, sill: 'yard',
  });
  ctx.rollerInWall(2.85, 0.22, -6.62, {
    w: 2.35, h: 2.25, yaw: 0, bucket: 'paintO', open: 0.16, sill: 'yard',
  });

  ctx.wallPack(-6.55, 2.85, -4.45, 90);
  ctx.wallPack(-6.55, 2.95, -1.85, 90);
  ctx.wallPack(3.55, 2.85, -6.55, 0);

  // Stores, grouped against walls and by the doors. Bins: three east of the north door, three
  // down the west wall. Pallets: two stacks on the north wall, two along the south kerb. One
  // skip against the east kerb.
  ctx.wheeledBin(4.75, -6.18, 'soil', { lid: 'paintR', ground: G });
  ctx.wheeledBin(5.45, -6.18, 'paintG', { lid: 'paintO', ground: G });
  ctx.wheeledBin(6.15, -6.18, 'soil', { lid: 'paintG', ground: G });
  ctx.wheeledBin(-6.38, 1.1, 'paintG', { lid: 'paintO', yaw: 90, ground: G });
  ctx.wheeledBin(-6.38, 1.8, 'soil', { lid: 'paintR', yaw: 90, ground: G });
  ctx.wheeledBin(-6.38, 2.5, 'soil', { lid: 'paintG', yaw: 90, ground: G });
  ctx.pallet(-2.6, -6.12, 4);
  ctx.pallet(-1.3, -6.12, 3);
  ctx.pallet(2.0, 7.05, 2);
  ctx.pallet(3.35, 7.05, 3, { yaw: 90 });
  ctx.skip(6.85, 3.0, 90);
  ctx.toy({
    kind: 'roller', id: 'door-c', x: 2.85, z: -6.62, y: 0.22, yaw: 0,
    sx: 2.4, sy: 2.2, sz: 0.4, label: 'Roller door',
  });
}

function loadingLane(ctx) {
  ctx.box('brick', 4.2, 3.25, 0.62, -5.3, 1.75, -6.95);
  ctx.box('brick', 1.6, 3.25, 0.62, 0.7, 1.75, -6.95);
  ctx.box('brick', 2.0, 3.25, 0.62, 6.4, 1.75, -6.95);
  ctx.box('brick', 14.8, 0.75, 0.62, 0, 3.05, -6.95);
  ctx.box('brick', 0.62, 3.15, 2.4, -7.05, 1.70, -5.65);
  ctx.box('brick', 0.62, 3.15, 4.4, -7.05, 1.70, -0.2);
  ctx.box('brick', 0.62, 0.75, 8.8, -7.05, 2.95, -2.55);

  ctx.box('paintG', 4.6, 2.15, 0.08, -1.4, 1.85, -6.62);
  ctx.box('paintY', 1.8, 1.05, 0.07, -2.2, 2.15, -6.58);
  ctx.box('paintR', 1.4, 0.85, 0.07, -0.4, 1.45, -6.58);
  ctx.box('paintG', 0.45, 0.85, 0.06, -1.5, 1.15, -6.56);

  ctx.rollerInWall(-6.68, 0.22, -3.55, {
    w: 2.15, h: 2.2, yaw: 90, bucket: 'paintO', open: 0.1, sill: 'yard',
  });
  ctx.rollerInWall(-2.1, 0.22, -6.62, {
    w: 2.55, h: 2.25, yaw: 0, bucket: 'steel', open: 0.35, sill: 'yard',
  });
  ctx.rollerInWall(3.6, 0.22, -6.62, {
    w: 2.35, h: 2.15, yaw: 0, bucket: 'steel', open: 0, sill: 'yard',
  });
  ctx.box('steel', 8.6, 0.16, 2.8, 0.6, 3.05, -5.15);
  ctx.box('steel', 0.16, 2.75, 0.16, -3.5, 1.5, -4.0);
  ctx.box('steel', 0.16, 2.75, 0.16, 4.7, 1.5, -4.0);
  ctx.box('yard', 3.4, 0.55, 1.45, -2.1, 0.42, -5.35);
  ctx.box('paintO', 3.4, 0.10, 0.16, -2.1, 0.70, -4.65);

  ctx.wallPack(-2.1, 2.85, -6.55, 0);
  ctx.wallPack(3.6, 2.85, -6.55, 0);

  // Ground marks: a drain with its grate, a patch, two stains, bay outlines at the two doors
  // that open onto the yard (the dock has its platform instead).
  ctx.yardDrain(1.4, 1.6, 8.0, 0);
  ctx.yardPatch(-1.2, 1.8, 2.0, 1.1, -5);
  ctx.oilSpot(3.2, 1.6, 0.7);
  ctx.oilSpot(-0.6, -1.4, 0.5);
  ctx.bayLines(-6.68, -3.55, 2.9, 2.4, 90);
  ctx.bayLines(3.6, -6.62, 2.9, 2.4, 0);

  // Bins east of the north door, pallets down the west wall and along the south kerb.
  ctx.wheeledBin(5.7, -6.18, 'soil', { lid: 'paintR', ground: G });
  ctx.wheeledBin(6.4, -6.18, 'paintG', { lid: 'paintO', ground: G });
  ctx.wheeledBin(7.1, -6.18, 'soil', { lid: 'paintG', ground: G });
  ctx.pallet(-6.2, 0.0, 3, { yaw: 90 });
  ctx.pallet(-6.2, 1.3, 2, { yaw: 90 });
  ctx.pallet(4.0, 7.05, 2);
  ctx.pallet(5.4, 7.05, 1);
  ctx.box('timber', 1.15, 0.85, 0.85, -4.4, 0.60, 2.6);
  ctx.box('soil', 1.05, 0.06, 0.75, -4.4, 1.06, 2.6);
  ctx.toy({
    kind: 'roller', id: 'dock', x: -2.1, z: -6.55, y: 0.22,
    sx: 2.6, sy: 2.2, sz: 0.4, label: 'Roller door',
  });
}
