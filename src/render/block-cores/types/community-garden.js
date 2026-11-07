// Block-core community garden. Two variants:
//   0 raised beds + orange shed + tank
//   1 denser allotment, potting bench, compost crate

export function buildCommunityGarden(ctx) {
  ctx.pad('turf', 15.4, 0.10, 0.15);
  ctx.box('path', 2.15, 0.05, 13.4, 0, 0.19, 0);
  ctx.box('path', 13.4, 0.05, 2.15, 0, 0.19, 0);
  ctx.box('soil', 2.4, 0.03, 0.55, 0, 0.21, 5.8);
  for (let i = 0; i <= 6; i += 1) {
    const t = -7.0 + i * (14 / 6);
    ctx.box('timber', 0.44, 1.32, 0.44, t, 0.80, -7.0);
    ctx.box('path', 0.50, 0.10, 0.50, t, 1.48, -7.0);
    if (!(i === 3)) {
      ctx.box('timber', 0.44, 1.32, 0.44, t, 0.80, 7.0);
      ctx.box('path', 0.50, 0.10, 0.50, t, 1.48, 7.0);
    }
    ctx.box('timber', 0.44, 1.32, 0.44, -7.0, 0.80, t);
    ctx.box('path', 0.50, 0.10, 0.50, -7.0, 1.48, t);
    ctx.box('timber', 0.44, 1.32, 0.44, 7.0, 0.80, t);
    ctx.box('path', 0.50, 0.10, 0.50, 7.0, 1.48, t);
  }
  for (const y of [0.46, 1.10]) {
    ctx.box('timber', 14.2, 0.34, 0.34, 0, y, -7.0);
    ctx.box('timber', 5.7, 0.34, 0.34, -4.15, y, 7.0);
    ctx.box('timber', 5.7, 0.34, 0.34, 4.15, y, 7.0);
    ctx.box('timber', 0.34, 0.34, 14.2, -7.0, y, 0);
    ctx.box('timber', 0.34, 0.34, 14.2, 7.0, y, 0);
  }
  if (ctx.variant === 0) beds(ctx);
  else allotment(ctx);
}

function galvanisedTank(ctx, x, z) {
  ctx.cyl('brick', 1.02, 1.02, 1.48, x, 0.88, z, 14);
  const cx = x + 0.98;
  const cz = z + 0.98;
  for (let row = 0; row < 3; row += 1) {
    const y = 0.30 + row * 0.50;
    for (let i = -1; i <= 1; i += 1) {
      ctx.box(
        'brick', 0.74, 0.40, 0.36,
        cx + i * 0.66 * -0.707, y, cz + i * 0.66 * 0.707,
        45,
      );
    }
    if (row < 2) {
      ctx.box('concrete', 2.25, 0.09, 0.42, cx, y + 0.245, cz, 45);
    }
  }
  ctx.cyl('steel', 0.78, 0.78, 1.85, x, 2.58, z, 14);
  ctx.cyl('steel', 0.82, 0.82, 0.07, x, 2.15, z, 14);
  ctx.cyl('steel', 0.82, 0.82, 0.07, x, 2.72, z, 14);
  ctx.cyl('steel', 0.82, 0.82, 0.07, x, 3.42, z, 14);
  ctx.cyl('steel', 0.22, 0.22, 0.22, x, 3.75, z, 8);
  ctx.box('paintY', 0.78, 0.34, 0.34, x, 2.28, z + 1.18);
  ctx.box('paintY', 0.26, 0.26, 0.26, x, 2.48, z + 1.18);
  ctx.cyl('paintB', 0.11, 0.11, 0.46, x, 2.04, z + 1.36, 8);
  ctx.cyl('paintB', 0.14, 0.10, 0.14, x, 1.82, z + 1.36, 8);
  ctx.toy({
    kind: 'tap', id: 'tank-tap', x, z: z + 1.12, y: 1.78,
    sx: 0.45, sy: 0.45, sz: 0.45, label: 'Tank tap',
  });
}

function compostCrate(ctx, x, z) {
  ctx.box('timber', 1.35, 0.95, 1.15, x, 0.62, z);
  ctx.box('timber', 1.35, 0.08, 0.08, x, 1.12, z - 0.52);
  ctx.box('timber', 1.35, 0.08, 0.08, x, 1.12, z + 0.52);
  ctx.box('soil', 1.15, 0.22, 0.95, x, 1.05, z);
  ctx.box('foliage', 0.35, 0.22, 0.12, x + 0.2, 1.18, z);
  ctx.box('steel', 0.06, 0.55, 0.06, x - 0.35, 1.35, z + 0.15);
  ctx.box('steel', 0.22, 0.06, 0.06, x - 0.35, 1.62, z + 0.15);
}

function beds(ctx) {
  ctx.raisedBed(-3.5, -3.15, 4.2, 2.9, 0);
  ctx.raisedBed(3.3, -3.15, 4.2, 2.9, 1);
  ctx.raisedBed(-3.5, 2.85, 4.2, 2.9, 2);
  ctx.raisedBed(1.15, 5.55, 2.4, 1.7, 1);
  ctx.corrugatedShed({
    x: 4.9, z: 5.15, w: 3.4, d: 2.8, h: 2.35, yaw: 0,
    wall: 'paintO', roof: 'paintO', bay: false, door: true, sign: '',
  });
  ctx.boxEx('timber', 0.10, 1.55, 0.10, 3.55, 0.95, 6.38, { roll: -14 });
  ctx.boxEx('steel', 0.58, 0.10, 0.16, 3.55, 1.68, 6.55, { roll: -14 });
  galvanisedTank(ctx, 5.15, -4.85);
  compostCrate(ctx, -5.5, 5.35);
}

function allotment(ctx) {
  ctx.raisedBed(-3.6, -3.35, 3.8, 2.5, 1);
  ctx.raisedBed(3.4, -3.35, 3.8, 2.5, 2);
  ctx.raisedBed(-3.6, 2.45, 3.8, 2.5, 0);
  ctx.raisedBed(3.4, 2.45, 3.8, 2.5, 1);
  ctx.corrugatedShed({
    x: -5.15, z: 5.25, w: 3.1, d: 2.5, h: 2.2, yaw: 0,
    wall: 'paintO', roof: 'paintO', bay: false, door: true,
  });
  galvanisedTank(ctx, 5.15, -4.85);
  compostCrate(ctx, 5.3, 5.3);
  ctx.boxEx('timber', 0.12, 1.70, 0.12, -3.25, 0.98, 4.55, { roll: 32 });
  ctx.boxEx('steel', 0.68, 0.12, 0.20, -3.25, 1.78, 4.85, { roll: 32 });
  ctx.boxEx('steel', 0.08, 0.28, 0.08, -3.50, 1.68, 4.80, { roll: 32 });
  ctx.boxEx('steel', 0.08, 0.28, 0.08, -3.00, 1.68, 4.80, { roll: 32 });
  ctx.boxEx('timber', 0.12, 1.55, 0.12, -2.75, 0.92, 4.25, { roll: 38 });
  ctx.boxEx('paintY', 0.42, 0.14, 0.24, -2.75, 1.62, 4.55, { roll: 38 });
  ctx.box('timber', 2.2, 0.10, 0.85, -4.4, 0.82, -5.5);
  ctx.box('timber', 0.10, 0.68, 0.10, -5.3, 0.48, -5.7);
  ctx.box('timber', 0.10, 0.68, 0.10, -3.5, 0.48, -5.3);
  ctx.box('soil', 0.45, 0.28, 0.45, -4.8, 1.02, -5.45);
  ctx.box('paintG', 0.32, 0.22, 0.32, -4.1, 1.00, -5.4);
}
