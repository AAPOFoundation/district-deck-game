// Block-core pocket park. Two variants:
//   0 oval lawn — hoggin loop, facing benches, shrubs
//   1 formal — fountain, radiating paths, hedge boxes

export function buildPocketPark(ctx) {
  ctx.pad('turf', 15.4, 0.10, 0.15);
  ctx.box('path', 2.4, 0.05, 2.2, 0, 0.20, 5.9);
  ctx.slatBench(0, 5.55, 0, { w: 1.7 });
  ctx.box('concrete', 15.4, 0.10, 0.18, 0, 0.20, -7.6);
  ctx.box('concrete', 15.4, 0.10, 0.18, 0, 0.20, 7.6);
  ctx.box('concrete', 0.18, 0.10, 15.1, -7.6, 0.20, 0);
  ctx.box('concrete', 0.18, 0.10, 15.1, 7.6, 0.20, 0);
  if (ctx.variant === 0) oval(ctx);
  else formal(ctx);
}

function oval(ctx) {
  ctx.box('path', 9.6, 0.06, 1.35, 0, 0.19, -3.5);
  ctx.box('path', 9.6, 0.06, 1.35, 0, 0.19, 3.5);
  ctx.box('path', 1.35, 0.06, 8.4, -4.1, 0.19, 0);
  ctx.box('path', 1.35, 0.06, 8.4, 4.1, 0.19, 0);
  ctx.box('concrete', 9.8, 0.05, 0.12, 0, 0.22, -4.2);
  ctx.box('concrete', 9.8, 0.05, 0.12, 0, 0.22, 4.2);
  ctx.box('concrete', 0.12, 0.05, 8.6, -4.8, 0.22, 0);
  ctx.box('concrete', 0.12, 0.05, 8.6, 4.8, 0.22, 0);
  ctx.box('turf', 6.4, 0.07, 5.5, 0, 0.22, 0);

  ctx.fountain(0, 0, { figure: true });

  ctx.slatBench(-3.15, 1.85, 0);
  ctx.slatBench(3.15, 1.85, 0);
  ctx.slatBench(0, -3.15, 180);

  for (const [x, z, s] of [
    [-5.2, -5.0, 1.55], [5.25, -4.9, 1.45], [-5.15, 5.15, 1.42], [5.15, 5.15, 1.35],
  ]) {
    ctx.topiary(x, 0.22, z, s);
  }
  ctx.box('soil', 1.85, 0.14, 0.72, -2.35, 0.24, -1.85);
  ctx.box('soil', 1.65, 0.14, 0.68, 2.15, 0.24, 1.75);
  ctx.lantern(-5.6, 0.2);
  ctx.lantern(5.6, 0.2);
}

function formal(ctx) {
  ctx.box('path', 1.45, 0.06, 12.6, 0, 0.19, 0);
  ctx.box('path', 12.6, 0.06, 1.45, 0, 0.19, 0);
  ctx.box('concrete', 1.65, 0.05, 0.12, 0, 0.22, -6.3);
  ctx.box('concrete', 1.65, 0.05, 0.12, 0, 0.22, 6.3);
  ctx.fountain(0, 0, { figure: true });

  for (const [x, z] of [[-4.6, -4.6], [4.6, -4.6], [-4.6, 4.6], [4.6, 4.6]]) {
    ctx.box('soil', 2.35, 0.26, 2.35, x, 0.30, z);
    ctx.topiary(x, 0.46, z, 1.45);
    ctx.topiary(x + 0.55, 0.42, z + 0.4, 0.95);
  }
  for (const [x, z, yaw] of [
    [-2.35, 3.55, 0], [2.35, 3.55, 0], [-2.35, -3.55, 180], [2.35, -3.55, 180],
  ]) {
    ctx.slatBench(x, z, yaw, { w: 1.7 });
  }
  ctx.lantern(-5.8, 0);
  ctx.lantern(5.8, 0);
  ctx.toy({
    kind: 'tap', id: 'jet', x: 0, z: 0, y: 1.72,
    sx: 0.6, sy: 0.6, sz: 0.6, label: 'Fountain',
  });
}
