// Block-core sewerage plant. Two variants:
//   0 clarifiers — twin circular tanks, walkway, valve cluster
//   1 pump house — brick plant, steel tank, stack, grit channel

export function buildSewerage(ctx) {
  ctx.hardstand({ fill: 'yard', kerb: true });
  ctx.chainLink({
    halfX: 7.2, halfZ: 7.2, h: 1.35, gate: true, gateWidth: 2.6, barb: true,
  });
  ctx.sign(0, 7.1, 0, 'paintY');
  ctx.box('paintY', 0.65, 0.85, 0.06, 2.5, 1.55, 7.12);
  ctx.box('steel', 0.65, 0.08, 0.08, 2.5, 1.12, 7.12);
  ctx.gratedDrain(0, 6.2, 5.6, 90);

  if (ctx.variant === 0) clarifiers(ctx);
  else pumpHouse(ctx);
}

function clarifiers(ctx) {
  tank(ctx, -3.15, -1.15, 2.65);
  tank(ctx, 3.05, -1.45, 2.45);
  ctx.pipeRun(
    [[-3.15, 0.72, 1.5], [0, 0.72, 1.5], [3.05, 0.72, 1.0]],
    0.20, 'paintO',
  );
  ctx.pipeShoe(0, 0.18, 1.5, 0.20);
  ctx.pipeRun(
    [[-3.15, 0.55, -3.7], [-6.1, 0.55, -3.7], [-6.1, 0.55, 4.4]],
    0.16, 'paintG',
  );
  ctx.pipeRun(
    [[3.05, 0.55, -3.8], [5.9, 0.55, -3.8], [5.9, 0.55, 4.2]],
    0.16, 'paintG',
  );
  ctx.pipeShoe(-6.1, 0.18, 0.4, 0.16);
  ctx.pipeShoe(5.9, 0.18, 0.2, 0.16);

  ctx.box('brick', 3.2, 2.05, 2.6, 5.2, 1.18, 4.7);
  ctx.pitchedRoof('steel', 3.4, 2.8, 5.2, 2.25, 4.7, 0);
  ctx.box('steel', 0.95, 1.55, 0.35, 5.2, 0.98, 5.85);
  ctx.box('timber', 1.15, 1.75, 0.10, 5.2, 1.05, 6.08);
  ctx.box('timber', 0.12, 1.55, 0.08, 4.72, 1.0, 6.10);
  ctx.box('timber', 0.12, 1.55, 0.08, 5.68, 1.0, 6.10);
  ctx.box('glass', 0.55, 0.48, 0.08, 4.15, 1.55, 6.02);
  ctx.box('steel', 0.62, 0.06, 0.06, 4.15, 1.82, 6.06);
  ctx.box('steel', 0.62, 0.06, 0.06, 4.15, 1.28, 6.06);
  ctx.box('paintG', 0.35, 0.85, 0.22, 4.7, 0.62, 5.4);
  ctx.pipeRun(
    [[5.2, 0.72, 3.4], [2.2, 0.72, 3.4], [2.2, 0.72, 1.5]],
    0.14, 'paintR',
  );
  ctx.cyl('steel', 0.16, 0.16, 1.15, 6.2, 2.85, 4.5, 8);
  ctx.cone('steel', 0.20, 0.14, 6.2, 3.48, 4.5, 8);

  ctx.box('steel', 1.35, 1.15, 0.85, -5.7, 0.75, 4.5);
  ctx.box('paintY', 1.15, 0.08, 0.08, -5.7, 1.35, 4.95);
  ctx.box('glass', 0.55, 0.35, 0.04, -5.7, 0.95, 4.94);
  ctx.box('concrete', 0.85, 0.22, 0.85, -4.35, 0.28, 4.5);
  ctx.cyl('steel', 0.10, 0.10, 0.35, -4.35, 0.48, 4.5, 8);
  ctx.toy({
    kind: 'valve', id: 'v1', x: -4.35, z: 4.5, y: 0.55,
    sx: 0.6, sy: 0.6, sz: 0.6, label: 'Valve',
  });
  ctx.box('concrete', 0.85, 0.22, 0.85, -3.45, 0.28, 4.5);
  ctx.cyl('steel', 0.10, 0.10, 0.35, -3.45, 0.48, 4.5, 8);
  ctx.toy({
    kind: 'valve', id: 'v2', x: -3.45, z: 4.5, y: 0.55,
    sx: 0.6, sy: 0.6, sz: 0.6, label: 'Valve',
  });
  ctx.toy({
    kind: 'hatch', id: 'hatch', x: 0.1, z: 3.5, y: 0.20,
    sx: 0.9, sy: 0.4, sz: 0.9, label: 'Hatch',
  });

  ctx.drum(-5.8, -4.8, 'paintO');
  ctx.drum(-5.05, -4.6, 'steel');
  ctx.box('steel', 1.15, 0.95, 0.85, 5.8, 0.62, -5.0);
}

function tank(ctx, x, z, r) {
  ctx.cyl('concrete', r, r, 0.85, x, 0.55, z, 20);
  ctx.cyl('concrete', r + 0.08, r + 0.08, 0.12, x, 0.98, z, 20);
  ctx.cyl('paintB', r - 0.06, r - 0.06, 0.14, x, 1.04, z, 18);
  ctx.cyl('water', r - 0.18, r - 0.18, 0.08, x, 1.10, z, 16);
  ctx.cyl('steel', 0.22, 0.22, 0.45, x, 1.12, z, 8);
  ctx.box('steel', r * 1.15, 0.06, 0.42, x, 1.18, z);
  ctx.box('steel', 0.42, 0.06, r * 1.15, x, 1.18, z);
  ctx.box('steel', r * 1.15, 0.08, 0.18, x, 1.26, z);
  ctx.box('steel', 0.18, 0.08, r * 1.15, x, 1.26, z);
  ctx.box('steel', 0.05, 0.18, r * 1.05, x + 0.10, 1.34, z);
  ctx.box('steel', 0.05, 0.18, r * 1.05, x - 0.10, 1.34, z);
  ctx.box('steel', r * 1.05, 0.18, 0.05, x, 1.34, z + 0.10);
  ctx.box('steel', r * 1.05, 0.18, 0.05, x, 1.34, z - 0.10);
  ctx.cyl('steel', 0.08, 0.08, 0.28, x + r * 0.55, 1.28, z, 6);
  ctx.cyl('steel', 0.08, 0.08, 0.28, x - r * 0.55, 1.28, z, 6);
}

function pumpHouse(ctx) {
  ctx.box('brick', 5.6, 2.75, 4.4, -2.5, 1.52, -1.35);
  ctx.pitchedRoof('steel', 5.9, 4.7, -2.5, 2.95, -1.35, 0);
  ctx.box('brick', 0.85, 1.15, 0.75, -0.6, 3.55, -1.35);
  ctx.box('soil', 0.55, 0.45, 0.55, -0.6, 4.22, -1.35);
  ctx.box('paintG', 0.95, 1.65, 0.08, -2.5, 1.05, 0.92);
  ctx.box('timber', 1.05, 1.85, 0.06, -2.5, 1.12, 0.88);
  ctx.box('concrete', 1.25, 0.16, 0.55, -2.5, 0.24, 1.15);
  ctx.box('glass', 0.95, 0.72, 0.06, -4.25, 1.85, 0.88);
  ctx.box('paintY', 1.05, 0.08, 0.05, -4.25, 2.25, 0.90);
  ctx.box('paintY', 1.05, 0.08, 0.05, -4.25, 1.45, 0.90);
  ctx.box('steel', 0.06, 0.72, 0.05, -4.25, 1.85, 0.90);
  ctx.box('glass', 0.95, 0.72, 0.06, -0.75, 1.85, 0.88);
  ctx.box('paintY', 1.05, 0.08, 0.05, -0.75, 2.25, 0.90);
  ctx.box('paintY', 1.05, 0.08, 0.05, -0.75, 1.45, 0.90);

  ctx.cyl('steel', 1.55, 1.55, 3.55, 4.25, 1.95, -1.55, 16);
  ctx.cyl('steel', 1.62, 1.62, 0.12, 4.25, 0.32, -1.55, 16);
  ctx.cyl('steel', 1.62, 1.62, 0.10, 4.25, 1.35, -1.55, 16);
  ctx.cyl('steel', 1.62, 1.62, 0.10, 4.25, 2.45, -1.55, 16);
  ctx.cyl('steel', 1.62, 1.62, 0.12, 4.25, 3.72, -1.55, 16);
  ctx.cone('steel', 0.85, 0.45, 4.25, 4.05, -1.55, 10);
  ctx.cyl('steel', 0.16, 0.16, 0.55, 4.25, 4.38, -1.55, 8);

  ctx.pipeRun(
    [[0.25, 0.95, -1.2], [2.2, 0.95, -1.2], [2.2, 0.95, -1.55], [2.7, 0.95, -1.55]],
    0.18, 'paintG',
  );
  ctx.pipeRun(
    [[4.25, 1.85, 0.05], [4.25, 1.85, 3.2], [4.25, 0.55, 3.2], [-5.5, 0.55, 3.2], [-5.5, 0.55, -1.2], [-5.3, 0.95, -1.2]],
    0.18, 'paintG',
  );
  ctx.pipeRun(
    [[4.25, 0.72, -1.55], [6.1, 0.72, -1.55], [6.1, 0.72, 4.6], [1.6, 0.72, 4.6]],
    0.20, 'paintR',
  );
  ctx.pipeShoe(4.25, 0.18, 3.2, 0.18);
  ctx.pipeShoe(-5.5, 0.18, 1.0, 0.18);
  ctx.pipeShoe(6.1, 0.18, 1.6, 0.20);

  ctx.box('concrete', 6.8, 0.62, 1.55, 0.3, 0.46, 4.7);
  ctx.box('paintG', 6.1, 0.14, 1.05, 0.3, 0.66, 4.7);
  ctx.box('water', 5.6, 0.08, 0.85, 0.3, 0.74, 4.7);
  ctx.box('concrete', 0.18, 0.45, 1.45, -2.6, 0.55, 4.7);
  ctx.box('concrete', 0.18, 0.45, 1.45, 3.2, 0.55, 4.7);
  ctx.box('concrete', 0.55, 0.55, 0.45, 2.55, 0.72, 5.55);
  ctx.cyl('steel', 0.10, 0.10, 0.28, 2.55, 1.05, 5.55, 8);
  ctx.toy({
    kind: 'valve', id: 'bypass', x: 2.55, z: 5.55, y: 1.12,
    sx: 0.6, sy: 0.6, sz: 0.6, label: 'Valve',
  });
  ctx.box('concrete', 0.55, 0.35, 0.55, 2.4, 0.32, 0.15);
  ctx.cyl('steel', 0.10, 0.10, 0.28, 2.4, 0.55, 0.15, 8);
  ctx.toy({
    kind: 'valve', id: 'main', x: 2.4, z: 0.15, y: 0.62,
    sx: 0.6, sy: 0.6, sz: 0.6, label: 'Valve',
  });
  ctx.toy({
    kind: 'hatch', id: 'grit', x: -2.2, z: 4.7, y: 0.72,
    sx: 0.8, sy: 0.35, sz: 0.8, label: 'Hatch',
  });
  ctx.drum(-5.9, 5.4, 'paintO');
  ctx.drum(5.8, 5.5, 'paintR');
}
