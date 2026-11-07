// District Deck V3.70 — civic joinery.
//
// Everything here obeys §2.2: the pane sits a real distance behind the outer wall face, the
// frame is a member with visible section, and the void behind the pane is a dark room rather
// than a wall-coloured card. The reveal is built as FOUR returns rather than one inset box, so
// the head, sill and both jambs each cast their own shadow into the opening — that is what makes
// the recess read at board altitude, and it is the single difference between these and the flat
// window cards the 2026-08-17 baseline shipped.
//
// Interactive leaves (`opening.parts`) never enter the merged mesh; `index.js` keeps them
// separate so `board.js` can hinge them. Salt namespace 200–299.

import { box, part, CIVIC_METRICS } from './core.js';

const M = CIVIC_METRICS;

/** Wall-face basis. `facing` is a yaw in radians or one of the four cardinal names. */
function basis(facing) {
  const yaw = typeof facing === 'number' ? facing : (
    facing === 'back' ? Math.PI
      : facing === 'left' ? -Math.PI / 2
        : facing === 'right' ? Math.PI / 2
          : 0
  );
  const nx = Math.sin(yaw);
  const nz = Math.cos(yaw);
  return { nx, nz, ux: nz, uz: -nx, yaw };
}

function at(b, o, u, v, n) {
  return [o.x + b.ux * u + b.nx * n, o.y + v, o.z + b.uz * u + b.nz * n];
}

/** A plank in the wall face's own frame: `u` across, `v` up, `n` outward from the wall plane. */
function plank(b, o, { u = 0, v = 0, n = 0, w, h, t }, name) {
  const [x, y, z] = at(b, o, u, v, n);
  const g = box(w, h, t, 0, 0, 0, name);
  g.rotateY(b.yaw);
  g.translate(x, y, z);
  g.computeBoundingBox();
  return g;
}

/**
 * The four-sided reveal. `depth` is how far the recess runs back from the outer face.
 *
 * Emitted in the shadow bucket, which is the darkest family on the model, so the return faces
 * that catch no key light land on a genuine dark rather than on a lifted mid grey.
 *
 * There is no back plate. `volume()` already puts a dark room behind every shelled wall, so a
 * fifth plank here was drawing a second dark surface a few centimetres in front of the first —
 * ninety-odd openings across the three subjects, twelve triangles each, for a face that is
 * occluded by the pane in every view.
 */
function reveal(ctx, b, o, { w, h, depth = M.reveal, jambs = true, name = 'reveal' }) {
  const p = ctx.p;
  const t = 0.09;
  const out = [
    part(plank(b, o, { v: h / 2 - t / 2, n: -depth / 2, w: w + t * 2, h: t, t: depth }, `${name}-head`), p.shadow),
    part(plank(b, o, { v: -h / 2 + t / 2, n: -depth / 2, w: w + t * 2, h: t, t: depth }, `${name}-sill`), p.shadow),
  ];
  if (jambs) {
    out.push(part(plank(b, o, { u: -w / 2 - t / 2, n: -depth / 2, w: t, h, t: depth }, `${name}-jamb-l`), p.shadow));
    out.push(part(plank(b, o, { u: w / 2 + t / 2, n: -depth / 2, w: t, h, t: depth }, `${name}-jamb-r`), p.shadow));
  }
  return out;
}

/**
 * A punched civic window: chunky precast head and sill with real section, a dark reveal, a
 * charcoal frame with mullions and transoms, and a ramped pane set back behind them.
 *
 * `x, y, z` is the CENTRE of the opening on the outer wall face.
 */
export function civicWindow(ctx, {
  x, y, z, w = 1.6, h = 1.8, facing = 'front',
  lights = 2, transom = false, sill = true, head = true, lean = false,
  interactive = false, id = 'window', label = 'Window',
}) {
  const p = ctx.p;
  const b = basis(facing);
  const o = { x, y, z };
  const fixed = [];
  const leaf = [];

  fixed.push(...reveal(ctx, b, o, { w, h, jambs: !lean, name: `${id}-rev` }));
  if (head) {
    fixed.push(part(plank(b, o, {
      v: h / 2 + 0.10, n: 0.06, w: w + 0.34, h: 0.20, t: 0.22,
    }, `${id}-head`), p.trim));
  }
  if (sill) {
    fixed.push(part(plank(b, o, {
      v: -h / 2 - 0.10, n: 0.09, w: w + 0.34, h: M.sill, t: 0.28,
    }, `${id}-sill`), p.trim));
  }
  const push = (g, m) => leaf.push(part(g, m));
  const f = M.frame;
  const inset = -M.reveal + 0.05;
  push(plank(b, o, { n: inset, w: f, h, t: 0.10, u: -w / 2 + f / 2 }, `${id}-stile-l`), p.metal);
  push(plank(b, o, { n: inset, w: f, h, t: 0.10, u: w / 2 - f / 2 }, `${id}-stile-r`), p.metal);
  if (!lean) {
    push(plank(b, o, { n: inset, w, h: f, t: 0.10, v: h / 2 - f / 2 }, `${id}-rail-t`), p.metal);
    push(plank(b, o, { n: inset, w, h: f, t: 0.10, v: -h / 2 + f / 2 }, `${id}-rail-b`), p.metal);
  }
  if (transom && ctx.mid) {
    push(plank(b, o, { n: inset, w, h: 0.10, t: 0.09, v: h * 0.22 }, `${id}-transom`), p.metal);
  }
  if (lights > 1 && ctx.mid && !lean) {
    for (let i = 1; i < lights; i += 1) {
      const u = -w / 2 + (w * i) / lights;
      push(plank(b, o, { n: inset + 0.005, w: 0.085, h: h - f * 2, t: 0.08, u }, `${id}-mull-${i}`), p.metal);
    }
  }
  push(plank(b, o, {
    n: -M.reveal - 0.02, w: w - f * 1.7, h: h - f * 1.7, t: 0.04,
  }, `${id}-pane`), p.glass);

  const [px, py, pz] = at(b, o, -w / 2 + 0.03, 0, 0);
  const opening = interactive ? {
    id,
    kind: 'casement',
    label,
    pivot: { x: px, y: py, z: pz },
    axis: 'y',
    openAngle: -1.0,
    parts: leaf,
    pick: { cx: w * 0.45, cy: 0, cz: 0, w, h, d: 0.36 },
  } : null;

  return { parts: interactive ? fixed : fixed.concat(leaf), opening };
}

/**
 * A horizontal glazing band — the hospital's ward floors and the community hall's clerestory.
 *
 * A ribbon is not a row of windows and must not be built as one: the wall above and below it is
 * a spandrel that runs unbroken, the reveal is a single continuous recess, and the rhythm comes
 * from mullion fins standing in the recess. Built as N separate windows it costs four times the
 * triangles and reads as a punch grid, which is the wrong building.
 */
export function ribbonBand(ctx, {
  x, y, z, w, h, facing = 'front', bays = 6, fins = true, lean = false, id = 'ribbon',
  depth = M.reveal * 1.15,
}) {
  const p = ctx.p;
  const b = basis(facing);
  const o = { x, y, z };
  const out = [];
  // `lean` drops the jamb returns and the internal frame rails. A ribbon that runs the full width
  // of its face HAS no jambs — it dies into the corner — and on a face the graded stations never
  // see, the two frame rails inside a 24 cm recess are four triangles apiece of nothing. Measured
  // on the ward tower: eighteen of its twenty-four bands are on such faces, and the four planks
  // each was drawing came to 864 triangles, nine per cent of the whole building.
  // `depth` defaults to the old recess. Callers that pass it want a deeper return; fins stay on
  // the original metric so an omitted depth is unchanged.
  out.push(...reveal(ctx, b, o, { w, h, depth, jambs: !lean, name: `${id}-rev` }));
  // Precast head and sill, running the whole band. These are the spandrel banding that gives a
  // ward tower its horizontal read.
  out.push(part(plank(b, o, {
    v: h / 2 + 0.13, n: 0.10, w: w + 0.20, h: 0.26, t: 0.30,
  }, `${id}-head`), p.trim));
  out.push(part(plank(b, o, {
    v: -h / 2 - 0.13, n: 0.13, w: w + 0.20, h: 0.26, t: 0.34,
  }, `${id}-sill`), p.trim));
  out.push(part(plank(b, o, {
    n: -depth - 0.02, w, h, t: 0.05,
  }, `${id}-pane`), p.glass));
  // Frame head/foot inside the recess, so the pane is held rather than floating in a slot.
  if (!lean) {
    out.push(part(plank(b, o, {
      n: -depth + 0.06, w, h: 0.10, t: 0.09, v: h / 2 - 0.05,
    }, `${id}-frame-t`), p.metal));
    out.push(part(plank(b, o, {
      n: -depth + 0.06, w, h: 0.10, t: 0.09, v: -h / 2 + 0.05,
    }, `${id}-frame-b`), p.metal));
  }
  if (fins && ctx.mid) {
    const n = Math.max(2, bays);
    for (let i = 0; i <= n; i += 1) {
      const u = -w / 2 + (i / n) * w;
      out.push(part(plank(b, o, {
        n: -M.reveal * 0.55, w: 0.11, h, t: M.reveal * 1.2, u,
      }, `${id}-fin`), p.metal));
    }
  }
  return { parts: out, opening: null };
}

/**
 * A full-height glazed entry screen with a pair of doors that swing.
 *
 * The two leaves are one opening record — a hospital's automatic doors open together — so a tap
 * opens the pair, which is what the object actually does.
 */
export function glazedEntry(ctx, {
  x, y, z, w = 4.6, h = 3.4, facing = 'front', doorW = 2.1, doorH = 2.35,
  id = 'entry', label = 'Entrance', sidelights = 2, interactive = true,
}) {
  const p = ctx.p;
  const b = basis(facing);
  const o = { x, y: y + h / 2, z };
  const fixed = [];
  const leaf = [];

  fixed.push(...reveal(ctx, b, o, { w, h, depth: M.reveal * 1.2, name: `${id}-rev` }));
  // Portal surround with real section — jambs, a deep head and a threshold that lands on the pad.
  for (const side of [-1, 1]) {
    fixed.push(part(plank(b, o, {
      u: side * (w / 2 + 0.16), n: 0.08, w: 0.32, h: h + 0.34, t: 0.30,
    }, `${id}-jamb`), p.trim));
  }
  fixed.push(part(plank(b, o, {
    v: h / 2 + 0.17, n: 0.10, w: w + 0.80, h: 0.34, t: 0.36,
  }, `${id}-head`), p.trim));
  fixed.push(part(plank(b, o, {
    v: -h / 2 - 0.06, n: 0.14, w: w + 0.60, h: 0.14, t: 0.44,
  }, `${id}-threshold`), p.ground));

  // Screen: mullions, a transom over the doors, and glazing behind them.
  const inset = -M.reveal * 1.2 - 0.02;
  fixed.push(part(plank(b, o, { n: inset, w, h, t: 0.05 }, `${id}-screen`), p.glass));
  const cols = Math.max(2, sidelights + 2);
  for (let i = 0; i <= cols; i += 1) {
    const u = -w / 2 + (i / cols) * w;
    fixed.push(part(plank(b, o, {
      n: inset + 0.09, w: 0.13, h, t: 0.12, u,
    }, `${id}-mull`), p.metal));
  }
  fixed.push(part(plank(b, o, {
    n: inset + 0.09, w, h: 0.14, t: 0.11, v: -h / 2 + doorH + 0.10,
  }, `${id}-transom`), p.metal));
  fixed.push(part(plank(b, o, {
    n: inset + 0.09, w, h: 0.14, t: 0.11, v: h / 2 - 0.07,
  }, `${id}-headrail`), p.metal));

  // The pair of leaves.
  const half = doorW / 2;
  for (const side of [-1, 1]) {
    const cu = side * half / 2;
    leaf.push(part(plank(b, o, {
      u: cu, v: -h / 2 + doorH / 2, n: inset + 0.16, w: half, h: doorH, t: 0.09,
    }, `${id}-leaf`), p.metal));
    leaf.push(part(plank(b, o, {
      u: cu, v: -h / 2 + doorH / 2 + 0.12, n: inset + 0.20, w: half - 0.20, h: doorH - 0.52, t: 0.04,
    }, `${id}-leaf-glass`), p.glass));
    leaf.push(part(plank(b, o, {
      u: cu - side * (half / 2 - 0.14), v: -h / 2 + doorH * 0.5, n: inset + 0.24,
      w: 0.06, h: doorH * 0.42, t: 0.06,
    }, `${id}-pull`), p.trim));
  }

  const [px, py, pz] = at(b, o, -doorW / 2, -h / 2 + doorH / 2, 0);
  const opening = interactive ? {
    id,
    kind: 'door',
    label,
    pivot: { x: px, y: py, z: pz },
    axis: 'y',
    openAngle: -1.15,
    parts: leaf,
    pick: { cx: doorW * 0.5, cy: 0, cz: 0, w: doorW, h: doorH, d: 0.45 },
  } : null;

  return { parts: interactive ? fixed : fixed.concat(leaf), opening };
}

/**
 * A single or double leaf door in a masonry opening — a classroom door, a hall side exit, a
 * plant-room door. The leaf takes the accent bucket when `accent` is set, which is where a civic
 * lot's saturated colour belongs: on the thing a person actually touches.
 */
export function civicDoor(ctx, {
  x, y, z, w = 1.12, h = 2.28, facing = 'front', accent = true,
  vision = true, interactive = true, id = 'door', label = 'Door',
}) {
  const p = ctx.p;
  const b = basis(facing);
  const o = { x, y: y + h / 2, z };
  const fixed = [];
  const leaf = [];

  fixed.push(...reveal(ctx, b, o, { w, h, depth: M.reveal * 0.9, name: `${id}-rev` }));
  for (const side of [-1, 1]) {
    fixed.push(part(plank(b, o, {
      u: side * (w / 2 + 0.10), n: 0.05, w: 0.20, h: h + 0.24, t: 0.22,
    }, `${id}-jamb`), p.trim));
  }
  fixed.push(part(plank(b, o, {
    v: h / 2 + 0.12, n: 0.07, w: w + 0.52, h: 0.24, t: 0.26,
  }, `${id}-head`), p.trim));
  fixed.push(part(plank(b, o, {
    v: -h / 2 - 0.05, n: 0.12, w: w + 0.44, h: 0.12, t: 0.40,
  }, `${id}-threshold`), p.ground));

  const inset = -M.reveal * 0.9 + 0.07;
  leaf.push(part(plank(b, o, { n: inset, w, h, t: 0.10 }, `${id}-leaf`), accent ? p.accent : p.metal));
  if (ctx.mid) {
    leaf.push(part(plank(b, o, {
      n: inset + 0.06, w: w - 0.24, h: h * 0.30, t: 0.04, v: -h * 0.24,
    }, `${id}-panel`), p.metal));
  }
  if (vision) {
    leaf.push(part(plank(b, o, {
      n: inset + 0.06, w: w - 0.34, h: h * 0.30, t: 0.04, v: h * 0.22,
    }, `${id}-vision`), p.glass));
  }
  if (ctx.detail) {
    leaf.push(part(plank(b, o, {
      u: w * 0.30, v: -0.02, n: inset + 0.09, w: 0.07, h: 0.34, t: 0.07,
    }, `${id}-pull`), p.trim));
  }

  const [px, py, pz] = at(b, o, -w / 2 + 0.03, 0, 0);
  const opening = interactive ? {
    id,
    kind: 'door',
    label,
    pivot: { x: px, y: py, z: pz },
    axis: 'y',
    openAngle: -1.15,
    parts: leaf,
    pick: { cx: w * 0.48, cy: 0, cz: 0, w, h, d: 0.42 },
  } : null;

  return { parts: interactive ? fixed : fixed.concat(leaf), opening };
}

/** A shallow projecting canopy over a door or a bay, on brackets. Nothing floats. */
export function entryCanopy(ctx, {
  x, y, z, w = 3.4, proj = 1.5, facing = 'front', material = null, id = 'canopy',
}) {
  const p = ctx.p;
  const b = basis(facing);
  const o = { x, y, z };
  const face = material ?? p.accent;
  const out = [];
  out.push(part(plank(b, o, { n: proj / 2, w, h: 0.16, t: proj }, `${id}-deck`), p.metal));
  out.push(part(plank(b, o, { n: proj + 0.02, w: w + 0.14, h: 0.32, t: 0.14 }, `${id}-fascia`), face));
  for (const side of [-1, 1]) {
    out.push(part(plank(b, o, {
      u: side * (w / 2 - 0.16), v: -0.34, n: proj * 0.42, w: 0.11, h: 0.72, t: proj * 0.80,
    }, `${id}-bracket`), p.metal));
  }
  return out;
}

/** A glazed notice case fixed to a wall — the community centre's front page. */
export function noticeCase(ctx, { x, y, z, w = 1.3, h = 1.0, facing = 'front', id = 'notice' }) {
  const p = ctx.p;
  const b = basis(facing);
  const o = { x, y, z };
  return [
    part(plank(b, o, { n: 0.06, w: w + 0.12, h: h + 0.12, t: 0.14 }, `${id}-case`), p.metal),
    part(plank(b, o, { n: 0.13, w, h, t: 0.04 }, `${id}-pane`), p.glass),
    part(plank(b, o, { n: 0.10, w: w * 0.34, h: h * 0.44, t: 0.02, u: -w * 0.24, v: h * 0.10 },
      `${id}-paper`), p.trim),
    part(plank(b, o, { n: 0.10, w: w * 0.28, h: h * 0.34, t: 0.02, u: w * 0.26, v: -h * 0.12 },
      `${id}-paper-b`), p.trim),
  ];
}
