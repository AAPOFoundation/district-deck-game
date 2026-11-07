// District Deck V3.70 — modern joinery. Deep-set openings, chunky frame section, glass depth.
//
// **What changed at V3.70 and why.** The V3.60 window was a stack of planks all sitting within
// 0.22 m of the wall face: a `-0.22` back plank in `shadow`, a `+0.015` architrave, four sash
// members at `-0.03` and a pane at `-0.14`. Nothing returned INTO the opening, so the wall had
// no thickness at the hole and the whole assembly read as a card laid on the elevation — §2.2's
// "flat blue card", and the single fault the programme brief ranks as the biggest craft gap.
//
// The reference plate's openings do three things this file now does:
//
//  1. **The opening has a lining.** Two jamb returns, a head return and a sill return run from
//     the wall face back to the frame. They are what casts the shadow that says "this is a hole
//     in a thick wall" rather than "this is a rectangle painted on a wall".
//  2. **The frame has section.** A chunky member standing proud of the render by ~50 mm at
//     model scale, deep enough to catch its own highlight along the top edge.
//  3. **The glass sits behind both.** The pane is set back far enough from the face that the
//     reveal shades its top and one side, and the ramped pane material (`modern-surfaces.js`
//     `GLASS_RAMP`) carries a sky value at the head and a room value at the sill.
//
// Two LODs, because the part budget is not the same problem on a detached house with nine
// openings and a six-storey bar with sixty-six. `lod: 'full'` builds the whole assembly;
// `lod: 'lean'` keeps the lining, the frame ring, the proud sill and the pane, and drops the
// separate sash, the head drip and the mullion. Lean is the same part count the V3.60 window
// cost and spends it on reveals instead of on sash members nobody can resolve at six storeys.

import { box } from '../core.js';

/**
 * Punched-opening tally, per assemble.
 *
 * §3.4 as amended requires an id to report its PUNCHED opening count beside its triangle count
 * so the 18k allowance is auditable rather than assumed. r1's probe printed `model.openings`,
 * which is the INTERACTIVE count — 5 / 3 / 9 / 6 / 13 / 10 against real punched counts of
 * 12 / 12 / 21 / 12 / 98 / 67 — so the audit trail the clause asks for did not exist, and read
 * alone the probe said no id qualified for the allowance. Counting here is exact by
 * construction: every punched opening in this lane builds exactly one reveal lining, and
 * nothing else calls these three functions.
 */
export const PUNCHED = { windows: 0, doors: 0, garages: 0 };

export function resetPunchedCount() {
  PUNCHED.windows = 0;
  PUNCHED.doors = 0;
  PUNCHED.garages = 0;
}

const FRAME = 0.16;
// Reveal: how far the opening's lining runs back from the wall face before it meets the frame.
// MODERN_METRICS.wallDepth is 0.30, so 0.20 keeps the lining inside the wall it is lining.
const REVEAL = 0.20;
const LINING = 0.055;
// Frame section, and how far it stands proud of the render.
const FRAME_T = 0.13;
const FRAME_PROUD = 0.05;
// The pane, measured back from the wall face. Behind the reveal AND behind the frame, so the
// head lining and one jamb always shade a corner of it.
const GLASS_IN = 0.24;
const SASH_IN = 0.175;
// The room behind. Far enough back that it never z-fights the pane.
const ROOM_IN = 0.46;
const SILL = 0.16;

function part(geometry, material) {
  return { geometry, material };
}

function withOpening(opts) {
  const src = opts?.opening;
  if (!src) return opts;
  const c = src.centre ?? [0, 0, 0];
  const n = src.outward ?? [0, 0, 1];
  return {
    x: c[0], y: c[1], z: c[2],
    w: src.w, h: src.h,
    facing: Math.atan2(n[0], n[2]),
    ...opts,
  };
}

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
  return [
    o.x + b.ux * u + b.nx * n,
    o.y + v,
    o.z + b.uz * u + b.nz * n,
  ];
}

function facePlank(b, o, { u = 0, v = 0, n = 0, w, h, t }, name) {
  const [x, y, z] = at(b, o, u, v, n);
  const g = box(w, h, t, 0, 0, 0, name);
  g.rotateY(b.yaw);
  g.translate(x, y, z);
  return g;
}

/**
 * The lining of a punched opening: two jamb returns, a head return, a sill return.
 *
 * These are the members that give the wall thickness at the hole. They run from the wall face
 * (`n = 0`) back to `n = -REVEAL`, and they are the reason the assembly reads as a hole rather
 * than a card. Everything else — the frame, the sash, the pane — sits behind them.
 */
function revealLining(b, o, { w, h, mat, lean = false }, id, out) {
  const back = -REVEAL / 2;
  out.push(part(facePlank(b, o, {
    n: back, w: LINING, h: h + LINING * 2, t: REVEAL, u: -w / 2 - LINING / 2,
  }, `${id}-reveal-l`), mat));
  out.push(part(facePlank(b, o, {
    n: back, w: LINING, h: h + LINING * 2, t: REVEAL, u: w / 2 + LINING / 2,
  }, `${id}-reveal-r`), mat));
  out.push(part(facePlank(b, o, {
    n: back, w: w + LINING * 2, h: LINING, t: REVEAL, v: h / 2 + LINING / 2,
  }, `${id}-reveal-head`), mat));
  // The sill return is the one lining member that is never in shadow and never in silhouette:
  // it faces up, into the sun, and the proud trim sill sits directly under it. It is the first
  // thing to go when the budget is the constraint, and it costs nothing legible.
  if (lean) return;
  out.push(part(facePlank(b, o, {
    n: back, w: w + LINING * 2, h: LINING, t: REVEAL, v: -h / 2 - LINING / 2,
  }, `${id}-reveal-sill`), mat));
}

export function framedWindow(ctx, raw = {}) {
  PUNCHED.windows += 1;
  const opts = withOpening(raw);
  const {
    x, y, z, w = 1.4, h = 1.6, facing = 'front',
    lights = 2, interactive = false, id = 'window', label = 'Window',
  } = opts;
  // The default comes off the context, so an archetype declares its own opening budget once in
  // `index.js` instead of every call site remembering to pass it. An interactive opening is
  // always full: the player is going to tap it and watch the leaf swing, and a sash-less leaf
  // swinging open is a worse read than the triangles are worth.
  const lod = opts.lod ?? (interactive ? 'full' : ctx.lod ?? 'full');
  const lean = lod === 'lean';
  const p = ctx.p;
  const b = basis(facing);
  const o = { x, y, z };
  const frameParts = [];
  const leafParts = [];

  // 1. The lining. Deep-set is a geometric claim, and this is the geometry that makes it.
  //
  // **r12 — the lining is `trim`, not `shadow`.** §5.3 is explicit that this move has been paid
  // for once already by L4 and that lanes should apply it rather than re-derive it: "L4 moved
  // every reveal return, interior backer, lobby and stair core from the `shadow` family to
  // `trim` for the same arithmetic reason — all at zero triangles." The r11 critic's dark map put
  // it beyond argument on this lane: "every window on every id is outlined in red-to-yellow
  // reveal return." The return is the surface that has to hold value inside a hole, and no
  // albedo lights a reveal — it has to carry its value, which means the bucket with the high
  // albedo and its own emissive floor, not the bucket named after darkness.
  revealLining(b, o, { w, h, mat: p.trim, lean }, id, frameParts);

  // 2. The room behind. Set well back so the pane never fights it, and dark enough that a lit
  //    pane reads as glass with something behind it rather than as a painted panel.
  //    On the lean ids every window is punched through a `volume()`, which already builds a
  //    shadow-bucket room core behind the wall, so a per-window backing plane is a second dark
  //    box in the same place — 12 triangles each, times sixty-six openings, for nothing.
  if (!lean) {
    frameParts.push(part(facePlank(b, o, {
      n: -ROOM_IN, w: w + 0.02, h: h + 0.02, t: 0.10,
    }, `${id}-room`), p.shadow));
  }

  // 3. The frame. A chunky member standing proud of the render, with real section — the top
  //    edge catches its own highlight and the bottom edge casts onto the reveal below it.
  const fo = FRAME_PROUD - FRAME_T / 2;
  const jamb = 0.115;
  frameParts.push(part(facePlank(b, o, {
    n: fo, w: jamb, h: h + jamb * 2, t: FRAME_T, u: -w / 2 - jamb / 2,
  }, `${id}-frame-l`), p.joinery));
  frameParts.push(part(facePlank(b, o, {
    n: fo, w: jamb, h: h + jamb * 2, t: FRAME_T, u: w / 2 + jamb / 2,
  }, `${id}-frame-r`), p.joinery));
  frameParts.push(part(facePlank(b, o, {
    n: fo, w: w + jamb * 2, h: jamb, t: FRAME_T, v: h / 2 + jamb / 2,
  }, `${id}-frame-head`), p.joinery));
  // The bottom frame member is dropped on `lean`. The proud sill sits directly under it and
  // reads as the horizontal at that line; the frame rail behind it is 12 triangles per opening
  // that nothing resolves, and on `apartment-modern-courtyard` that is 936 triangles — a fifth
  // of what the id has to give back to get inside §3.4's raised cap without gutting a reveal.
  if (!lean) {
    frameParts.push(part(facePlank(b, o, {
      n: fo, w: w + jamb * 2, h: jamb, t: FRAME_T, v: -h / 2 - jamb / 2,
    }, `${id}-frame-sill`), p.joinery));
  }

  // 4. The rendered sill, proud of the frame and wider than the opening, so water runs off it
  //    and so the elevation gets a horizontal at every window head height.
  // The sill and the head drip are `wallAlt`, not `trim`.
  //
  // On the r7 plate every opening on every id carried a near-white sill and a near-white drip.
  // Measured, the trim band and the wall band landed one code value apart — 198,181,158 against
  // 197,180,157 — which is §2.9 failing on the two largest populations at once, and the read it
  // produces is a Federation elevation with a modern roof on it. The reference's modern
  // openings have NO contrasting sill: a chunky dark frame sits in a rendered reveal and the
  // sill is the same masonry as the wall below.
  frameParts.push(part(facePlank(b, o, {
    v: -h / 2 - jamb - SILL / 2 + 0.02, n: 0.09, w: w + 0.34, h: SILL, t: 0.24,
  }, `${id}-sill`), p.wallAlt));
  if (!lean) {
    frameParts.push(part(facePlank(b, o, {
      v: h / 2 + jamb + 0.07, n: 0.07, w: w + 0.30, h: 0.10, t: 0.20,
    }, `${id}-drip`), p.wallAlt));
  }

  const pushLeaf = (geo, mat) => leafParts.push(part(geo, mat));
  if (!lean) {
    // 5. The sash, behind the frame. Only the full LOD carries it: at six storeys a sash
    //    stile is a sub-pixel member and it costs the same as a reveal that does read.
    pushLeaf(facePlank(b, o, { n: -SASH_IN, w: FRAME * 0.7, h, t: 0.07, u: -w / 2 + FRAME * 0.35 }, `${id}-stile-l`), p.joinery);
    pushLeaf(facePlank(b, o, { n: -SASH_IN, w: FRAME * 0.7, h, t: 0.07, u: w / 2 - FRAME * 0.35 }, `${id}-stile-r`), p.joinery);
    pushLeaf(facePlank(b, o, { n: -SASH_IN, w, h: FRAME * 0.7, t: 0.07, v: h / 2 - FRAME * 0.35 }, `${id}-rail-t`), p.joinery);
    pushLeaf(facePlank(b, o, { n: -SASH_IN, w, h: FRAME * 0.7, t: 0.07, v: -h / 2 + FRAME * 0.35 }, `${id}-rail-b`), p.joinery);
    if (lights > 1 && ctx.mid) {
      for (let i = 1; i < lights; i += 1) {
        const u = -w / 2 + (w * i) / lights;
        pushLeaf(facePlank(b, o, { n: -SASH_IN + 0.01, w: 0.07, h: h - FRAME, t: 0.06, u }, `${id}-mull-${i}`), p.joinery);
      }
    }
  }
  pushLeaf(facePlank(b, o, {
    n: -GLASS_IN, w: lean ? w - 0.05 : w - FRAME * 1.2, h: lean ? h - 0.05 : h - FRAME * 1.2, t: 0.03,
  }, `${id}-pane`), p.glass);

  const hingeU = -w / 2 + 0.02;
  const [px, py, pz] = at(b, o, hingeU, 0, 0);
  const opening = interactive ? {
    id,
    kind: 'casement',
    label,
    pivot: { x: px, y: py, z: pz },
    axis: 'y',
    openAngle: -1.05,
    parts: leafParts,
    pick: { cx: w * 0.45, cy: 0, cz: 0, w, h, d: 0.35 },
  } : null;

  return { parts: interactive ? frameParts : frameParts.concat(leafParts), opening };
}

export function modernDoor(ctx, raw = {}) {
  PUNCHED.doors += 1;
  const opts = withOpening(raw);
  const {
    x, y, z, w = 1.08, h = 2.22, facing = 'front',
    interactive = true, id = 'door', label = 'Front door',
    timber = true, accent = false,
  } = opts;
  const p = ctx.p;
  const b = basis(facing);
  const o = { x, y, z };
  const frameParts = [];
  const leafParts = [];

  // A doorway is a hole in a thick wall before it is anything else. Same lining as the window,
  // so a door and the window beside it agree about how deep the wall is — and, from r12, the
  // same bucket for the same reason (see `framedWindow`). The r11 critic booked "both front doors
  // are near-black voids" on `townhouse-modern-render` and named the cause as the crush; this is
  // the surface that was carrying it.
  revealLining(b, o, { w, h, mat: p.trim }, id, frameParts);
  const dfo = FRAME_PROUD - FRAME_T / 2;
  const djamb = 0.135;
  frameParts.push(part(facePlank(b, o, {
    n: dfo, w: djamb, h: h + djamb, t: FRAME_T, u: -w / 2 - djamb / 2,
  }, `${id}-frame-l`), p.joinery));
  frameParts.push(part(facePlank(b, o, {
    n: dfo, w: djamb, h: h + djamb, t: FRAME_T, u: w / 2 + djamb / 2,
  }, `${id}-frame-r`), p.joinery));
  frameParts.push(part(facePlank(b, o, {
    n: dfo, w: w + djamb * 2, h: djamb, t: FRAME_T, v: h / 2 + djamb / 2,
  }, `${id}-frame-h`), p.joinery));
  frameParts.push(part(facePlank(b, o, {
    v: -h / 2 - 0.06, n: 0.12, w: w + 0.40, h: 0.13, t: 0.30,
  }, `${id}-threshold`), p.wallAlt));
  frameParts.push(part(facePlank(b, o, {
    n: -ROOM_IN, w: w - 0.04, h: h - 0.04, t: 0.08,
  }, `${id}-void`), p.shadow));

  const leafMat = timber || accent ? p.timber : p.joinery;
  leafParts.push(part(facePlank(b, o, {
    n: -0.22, w, h, t: 0.10,
  }, `${id}-leaf`), leafMat));
  if (ctx.mid) {
    // Two recessed panels rather than one applied slab: the shadow line between them is what
    // reads at board zoom, and a single centred rectangle reads as a sticker.
    for (const [v, ph] of [[h * 0.20, h * 0.34], [-h * 0.22, h * 0.30]]) {
      leafParts.push(part(facePlank(b, o, {
        n: -0.17, w: w - 0.26, h: ph, t: 0.04, v,
      }, `${id}-panel`), p.shadow));
    }
  }
  if (ctx.detail) {
    const [kx, ky, kz] = at(b, o, w * 0.34, 0.02, -0.12);
    leafParts.push(part(box(0.08, 0.30, 0.08, kx, ky, kz, `${id}-handle`), p.trim));
  }

  const hingeU = -w / 2 + 0.03;
  const [px, py, pz] = at(b, o, hingeU, 0, 0);
  const opening = interactive ? {
    id,
    kind: 'door',
    label,
    pivot: { x: px, y: py, z: pz },
    axis: 'y',
    openAngle: -1.15,
    parts: leafParts,
    pick: { cx: w * 0.48, cy: 0, cz: 0, w, h, d: 0.4 },
  } : null;

  return { parts: interactive ? frameParts : frameParts.concat(leafParts), opening };
}

export function garageDoor(ctx, raw = {}) {
  PUNCHED.garages += 1;
  const opts = withOpening(raw);
  const {
    x, y, z, w = 2.4, h = 2.1, facing = 'front',
    interactive = true, id = 'garage', label = 'Garage door',
  } = opts;
  const p = ctx.p;
  const b = basis(facing);
  const o = { x, y, z };
  const frameParts = [];
  const leafParts = [];
  // `trim`, from r12 — same clause, same arithmetic as `framedWindow`.
  revealLining(b, o, { w, h, mat: p.trim }, id, frameParts);
  const gfo = FRAME_PROUD - FRAME_T / 2;
  frameParts.push(part(facePlank(b, o, {
    n: gfo, w: 0.13, h: h + 0.26, t: FRAME_T, u: -w / 2 - 0.065,
  }, `${id}-frame-l`), p.joinery));
  frameParts.push(part(facePlank(b, o, {
    n: gfo, w: 0.13, h: h + 0.26, t: FRAME_T, u: w / 2 + 0.065,
  }, `${id}-frame-r`), p.joinery));
  frameParts.push(part(facePlank(b, o, {
    n: gfo, w: w + 0.26, h: 0.13, t: FRAME_T, v: h / 2 + 0.065,
  }, `${id}-frame-h`), p.joinery));
  frameParts.push(part(facePlank(b, o, {
    n: -ROOM_IN, w: w - 0.06, h: h - 0.06, t: 0.08,
  }, `${id}-void`), p.shadow));
  leafParts.push(part(facePlank(b, o, {
    n: -0.20, w, h, t: 0.09,
  }, `${id}-leaf`), p.trim));
  if (ctx.mid) {
    // Panel-lift joints, cut IN rather than applied on. A rib standing proud of a sectional
    // door is backwards: the joint between panels is a shadow gap.
    for (const v of [-0.32, -0.10, 0.12, 0.34]) {
      leafParts.push(part(facePlank(b, o, {
        n: -0.155, w: w - 0.04, h: 0.055, t: 0.04, v: v * h,
      }, `${id}-joint`), p.shadow));
    }
  }
  const [px, py, pz] = at(b, o, 0, h / 2, 0);
  const opening = interactive ? {
    id,
    kind: 'slider',
    label,
    pivot: { x: px, y: py, z: pz },
    axis: 'x',
    openAngle: 0,
    slide: { axis: 'y', distance: h * 0.82 },
    parts: leafParts,
    pick: { cx: 0, cy: -h * 0.4, cz: 0, w, h, d: 0.35 },
  } : null;
  return { parts: interactive ? frameParts : frameParts.concat(leafParts), opening };
}
