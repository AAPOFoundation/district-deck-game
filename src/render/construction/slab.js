// Stage 1 — formwork, rebar mesh, starter bars, wet pour, pump truck.

import { box, cyl } from './kit.js';
import { addPortaloo, addPumpTruck, addSkip, addTrafficCones } from './plant.js';

export function buildSlab(ctx) {
  if (ctx.fit) return buildFittedSlab(ctx);
  const { w, d, palette: P } = ctx;

  const pitHold = ctx.layer('pit-hold');
  box(pitHold, w * 0.7, 0.08, d * 0.66, P.dirtWet, 0, -0.55, 0, { receive: true, cast: false });
  box(pitHold, w * 0.7, 0.85, 0.16, P.dirt, 0, -0.4, -d * 0.33, { receive: true });
  box(pitHold, w * 0.7, 0.85, 0.16, P.dirt, 0, -0.4, d * 0.33, { receive: true });

  const form = ctx.layer('formwork');
  const edgeH = 0.52;
  box(form, w * 0.95, 0.16, d * 0.95, P.concrete, 0, 0.06, 0, { receive: true, cast: false });
  box(form, w * 0.97, edgeH, 0.12, P.plate, 0, edgeH / 2, -d * 0.49);
  box(form, w * 0.97, edgeH, 0.12, P.plate, 0, edgeH / 2, d * 0.49);
  box(form, 0.12, edgeH, d * 0.97, P.plate, -w * 0.49, edgeH / 2, 0);
  box(form, 0.12, edgeH, d * 0.97, P.plate, w * 0.49, edgeH / 2, 0);
  for (const [x, z] of [
    [-w * 0.49, -d * 0.49], [w * 0.49, -d * 0.49],
    [-w * 0.49, d * 0.49], [w * 0.49, d * 0.49],
  ]) {
    const stake = box(form, 0.1, 0.95, 0.1, P.pine, x, 0.48, z);
    ctx.tap(stake, 'formwork', { label: `stake-${x}` });
  }
  // Soldiers + walers
  for (let i = 0; i < 6; i += 1) {
    const t = i / 5 - 0.5;
    box(form, 0.08, 0.85, 0.08, P.pine, t * w * 0.9, 0.42, -d * 0.49 - 0.08);
    box(form, 0.08, 0.85, 0.08, P.pine, t * w * 0.9, 0.42, d * 0.49 + 0.08);
  }

  const rebar = ctx.layer('rebar');
  // Three rust mesh pads, not a site-wide candy cage.
  const pads = [
    [-w * 0.22, -d * 0.18],
    [w * 0.18, -d * 0.12],
    [0.05, d * 0.16],
  ];
  for (let p = 0; p < pads.length; p += 1) {
    const [ox, oz] = pads[p];
    const pw = 2.6;
    const pd = 2.15;
    for (let i = 0; i < 6; i += 1) {
      box(rebar, 0.055, 0.05, pd, P.rebar, ox - pw / 2 + i * (pw / 5), 0.28, oz, { cast: false });
    }
    for (let j = 0; j < 5; j += 1) {
      box(rebar, pw, 0.05, 0.055, P.rebar, ox, 0.32, oz - pd / 2 + j * (pd / 4), { cast: false });
    }
    // A few chairs, not a forest of dowels.
    for (const [cx, cz] of [[-0.7, -0.5], [0.7, 0.4], [0.1, -0.2]]) {
      cyl(rebar, 0.03, 0.03, 0.22, 5, P.rebar, ox + cx, 0.22, oz + cz, { cast: false });
    }
  }

  const pour = ctx.layer('pour');
  box(pour, w * 0.92, 0.18, d * 0.92, P.slab, 0, 0.12, 0, { cast: false, receive: true });
  // Wet slurry sits ON the mesh — a blob, not a postage stamp.
  const wet = box(pour, w * 0.48, 0.1, d * 0.38, P.wet, -0.1, 0.36, -0.08, {
    cast: false, receive: true,
  });
  box(pour, w * 0.28, 0.07, d * 0.22, P.wet, 0.35, 0.34, 0.15, { cast: false, receive: true });
  ctx.rig('wet', wet);
  addTrafficCones(ctx, [
    [-0.8, -0.4],
    [0.6, 0.2],
  ]);

  const cure = ctx.layer('cure');
  box(cure, w * 0.92, 0.24, d * 0.92, P.slab, 0, 0.14, 0, { cast: false, receive: true });

  addPumpTruck(ctx, 0.38, 0.32);
  addPortaloo(ctx);
  addSkip(ctx, 0.44, -0.42);
  addTrafficCones(ctx, [
    [-w * 0.5, -d * 0.54],
    [0, -d * 0.55],
    [w * 0.5, -d * 0.54],
  ]);
}

function buildFittedSlab(ctx) {
  const { fit: { w, d }, palette: P } = ctx;
  const form = ctx.fitLayer('formwork');
  for (const sign of [-1, 1]) {
    box(form, w + 0.24, 0.42, 0.12, P.plate, 0, 0.21, sign * (d / 2 + 0.06));
    box(form, 0.12, 0.42, d, P.plate, sign * (w / 2 + 0.06), 0.21, 0);
  }
  const rebar = ctx.fitLayer('rebar');
  for (let i = 0; i < 9; i++) {
    box(rebar, 0.05, 0.05, d - 0.3, P.rebar, (i / 8 - 0.5) * (w - 0.3), 0.16, 0);
    box(rebar, w - 0.3, 0.05, 0.05, P.rebar, 0, 0.2, (i / 8 - 0.5) * (d - 0.3));
  }
  const pour = ctx.fitLayer('pour');
  box(pour, w, 0.18, d, P.slab, 0, 0.09, 0, { receive: true, cast: false });
  ctx.rig('wet', box(pour, w * 0.45, 0.08, d * 0.4, P.wet, 0, 0.24, 0));
  const cure = ctx.fitLayer('cure');
  box(cure, w, 0.24, d, P.slab, 0, 0.12, 0, { receive: true, cast: false });
  addPumpTruck(ctx, 0.38, 0.32); addPortaloo(ctx); addSkip(ctx, 0.44, -0.42);
  addTrafficCones(ctx, [[-ctx.w * 0.5, -ctx.d * 0.54], [ctx.w * 0.5, -ctx.d * 0.54]]);
}
