// Stage 0 — demolition. Remaining masonry stubs, individual bricks, excavator, spoil.

import { box } from './kit.js';
import { addExcavator, addSkip, addSpoil, addTrafficCones } from './plant.js';

export function buildDemolition(ctx) {
  const { w, d, palette: P } = ctx;
  const pad = ctx.layer('demo-pad');
  box(pad, w * 0.96, 0.1, d * 0.96, P.dirt, 0, 0.04, 0, { receive: true, cast: false });
  // Mud smears
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    box(
      pad,
      1.1 + ctx.u(`mdw:${i}`) * 0.8,
      0.04,
      0.7 + ctx.u(`mdd:${i}`) * 0.5,
      i % 2 ? P.dirt : P.dirtWet,
      Math.cos(a) * w * 0.22,
      0.07,
      Math.sin(a) * d * 0.22,
      { rotY: a, cast: false, receive: true },
    );
  }

  const walls = ctx.layer('demo-walls');
  // Partial brick walls — the Monopoly Plus "half house still standing" read.
  box(walls, w * 0.58, 2.45, 0.42, P.brick, -w * 0.06, 1.25, -d * 0.16);
  box(walls, 0.42, 1.95, d * 0.4, P.brick, -w * 0.34, 1.0, 0.04);
  box(walls, w * 0.2, 1.05, 0.36, P.brickDark, w * 0.26, 0.55, -d * 0.2, { rotY: 0.32 });
  // Jagged top course
  for (let i = 0; i < 7; i += 1) {
    const t = i / 6 - 0.5;
    box(
      walls,
      0.28,
      0.18 + ctx.u(`crs:${i}`) * 0.45,
      0.42,
      i % 2 ? P.brick : P.brickDark,
      t * w * 0.52,
      2.45 + ctx.u(`crh:${i}`) * 0.2,
      -d * 0.16,
    );
  }

  const rubble = ctx.layer('demo-rubble');
  box(rubble, w * 0.55, 0.28, d * 0.42, P.concrete, 0.12, 0.16, 0.06, { receive: true });
  box(rubble, w * 0.28, 0.48, d * 0.22, P.concrete, w * 0.2, 0.28, d * 0.14, { rotY: 0.38 });
  for (let i = 0; i < 28; i += 1) {
    const a = (i / 28) * Math.PI * 2 + ctx.u(`rb:${i}`);
    const r = 0.8 + (i % 6) * 0.32;
    box(
      rubble,
      0.24 + (i % 3) * 0.08,
      0.1 + (i % 2) * 0.08,
      0.12 + (i % 4) * 0.05,
      i % 3 === 0 ? P.brick : (i % 2 ? P.concrete : P.brickDark),
      Math.cos(a) * r * (w * 0.13),
      0.14 + ctx.u(`rby:${i}`) * 0.12,
      Math.sin(a) * r * (d * 0.13),
      { rotY: a * 0.4, rotZ: (i % 5) * 0.15 },
    );
  }

  addSpoil(ctx, 5, 'demo-spoil');
  addExcavator(ctx, 0.18, 0.08);
  addSkip(ctx, 0.4, -0.38);
  addTrafficCones(ctx, [
    [-w * 0.46, -d * 0.5],
    [w * 0.08, -d * 0.52],
    [w * 0.48, -d * 0.2],
    [w * 0.46, d * 0.12],
    [-w * 0.2, -d * 0.48],
  ]);
}
