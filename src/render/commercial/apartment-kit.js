// District Deck V3.70 — the apartment succession family (lane L4).
//
// V370 §4/L4: "The apartment rungs are a succession ladder — apartment-low → mid → midrise →
// permit should read as the same street getting denser, not as four unrelated boxes: a shared
// material family with a genuinely different height, bay rhythm and roofline at each rung."
//
// THIS FILE IS THE SHARED HALF OF THAT SENTENCE. Everything the four rungs hold in common —
// the dark brick base, the pale render field, the cream string courses, the black steel
// balustrades, the recessed entry with its canopy and batten screen, the lot with its paved
// path, its fence, its bin store and its planting — is written once, here. `apartment-low.js`
// and `apartments.js` supply only the half that must differ.
//
// THE LADDER, stated as a table so a critic can check the claim rather than take it:
//
//   rung                storeys  height  bays  base  balcony grammar          roofline
//   apartment-low          4      15.3    3      1   one centre-bay slab      pitched seamed gable
//   apartment-permit       5      18.1    4      1   checkerboard projecting  flat parapet + overrun
//   apartment-midrise      7      22.9    4      2   continuous band + fins   set-back top + terrace
//   apartment-mid          8      26.6    5      2   full stack + glazed core parapet crown + plant
//
// Height, bay count, balcony grammar and roofline all move together, and each rung differs from
// its neighbours on all four. The MATERIAL does not move: one street, four ages of it.
//
// Salts 5700–5799 (family) — the rung files use 5800–5899.

import { RECESS } from './surfaces.js';
import {
  METRICS, part, box, slab, cyl, gridWindow, recessFaces,
  hole, openWall, plinthCourse, stringCourse,
  commercialDoor, brickCourses, streaks,
  boardPlinth, lawnTufts, paverPath, paverField, kerbAndFootpath,
  shrubMass, canopyTree, hedgeRun, plantedBed, picketFence, binStore, bikeRack,
  battenScreen, lamp, countAperture,
} from './core.js';

// `gridWindow` lives in core.js so the office and the shop can spend it on their flanks too.
export { gridWindow };

const S = 5700;

/** Per-rung geometry. Read with the table in the file header. */
export const LADDER = Object.freeze({
  'apartment-low': Object.freeze({
    storeys: 4, bays: 3, baseStoreys: 1, storeyH: 3.20,
    balcony: 'centre', roofline: 'gable', winW: 1.72, sideWins: 2,
  }),
  'apartment-permit': Object.freeze({
    storeys: 5, bays: 4, baseStoreys: 1, storeyH: 3.18,
    balcony: 'checker', roofline: 'parapet-overrun', winW: 1.48, sideWins: 2,
  }),
  'apartment-midrise': Object.freeze({
    storeys: 7, bays: 4, baseStoreys: 2, storeyH: 3.15,
    balcony: 'band', roofline: 'setback-terrace', winW: 1.42, sideWins: 2,
  }),
  'apartment-mid': Object.freeze({
    storeys: 8, bays: 5, baseStoreys: 2, storeyH: 3.16,
    balcony: 'stack', roofline: 'crown-plant', winW: 1.30, sideWins: 2,
  }),
});

/**
 * A full-height glazed bay: the sliding door and side light an apartment opens onto its balcony
 * through. Recessed spandrel below, dark room behind, chunky frame in front of the glass.
 */
export function glazedBay(ctx, {
  x, z, w, y0, y1, spandrelH = 0.95, facing = 1,
  interactive = false, id = 'slider', label = 'Balcony door',
}) {
  countAperture('glazedBay');
  const p = ctx.p;
  const out = [];
  const h = y1 - y0;
  if (h < 0.8 || w < 0.5) return out;
  const setback = 0.26;
  out.push(part(box(w, spandrelH, 0.24, x, y0 + spandrelH / 2, z - facing * 0.09, 'gb-spandrel'), p.wall));
  out.push(part(box(w + 0.12, 0.11, 0.28, x, y0 + spandrelH, z - facing * 0.05, 'gb-cill'), p.trim));
  const gy0 = y0 + spandrelH;
  const gh = y1 - gy0 - 0.14;
  // Behind the glass, not around it — see the note on `gridWindow` in core.js.
  out.push(part(box(w - 0.04, gh + 0.10, 0.10, x, gy0 + gh / 2, z - facing * (setback + 0.14), 'gb-room'), p.shadow, RECESS.interior));
  out.push(part(box(w - 0.18, gh, 0.05, x, gy0 + gh / 2, z - facing * (setback + 0.10), 'gb-glass'), p.glass));
  // ── r10: THE BLACK L, AND WHERE IT COMES FROM ─────────────────────────────────────────────
  //
  // This is the member the r9 critic photographed: "a hard black L down the left jamb and across
  // the head" of every bay on `apartment-permit`, 88.077 % literal zero over a 8 x 65 px band.
  // The stiles and the head were 0.13-0.16 m deep boxes sitting 0.26 m BACK in the reveal, so
  // the 0.26 m of wall cut face in front of them had nothing on it at all, and the members
  // themselves were `joinery` inside a hole — §5.3's arithmetic, unmodified since r1.
  //
  // Same three boxes, given the reveal's own depth and pulled forward to just inside the wall
  // face, so each is a lining AND a frame. Zero triangles, and it is the only way to line 19
  // bays on a subject with 222 triangles of headroom.
  //
  // AND THE STILE IS 0.15 WIDE, SEATED ON THE OPENING'S OWN EDGE. At 0.13 centred 0.07 in it
  // left a 5 mm strip of the wall's raw cut face standing between the lining and the pane, and
  // a column profile across one aperture on the first r10 plate found exactly that: every
  // sample across the opening came off literal zero except two adjacent columns at 43.6 % and
  // 78.2 %, which is a 3 px vertical line and not a distribution. A wall cut face belongs to the
  // `openWall` boxes and can never carry a member floor, so the lining has to COVER it. 0.15
  // wide from the edge inward does; zero triangles.
  const JD = setback + 0.10;
  const JN = z - facing * (JD / 2 + 0.01);
  out.push(part(box(0.15, gh, JD, x - w / 2 + 0.075, gy0 + gh / 2, JN, 'gb-stile-l'), p.joinery, 1));
  out.push(part(box(0.15, gh, JD, x + w / 2 - 0.075, gy0 + gh / 2, JN, 'gb-stile-r'), p.joinery, 1));
  out.push(part(box(w, 0.13, JD, x, gy0 + 0.06, JN, 'gb-rail-lo'), p.joinery, 1));
  out.push(part(box(w, 0.14, JD, x, y1 - 0.07, JN, 'gb-head'), p.trim, 1));
  // A centre mullion only where the bay is wide enough to need one. On the five-bay rung every
  // bay is under two metres and thirty-two of these were pure cost.
  if (ctx.detail && w > 2.0) {
    out.push(part(box(0.10, gh, 0.11, x, gy0 + gh / 2, z - facing * setback, 'gb-mull'), p.joinery, RECESS.sash));
  }
  if (!interactive) return out;
  // §3.5 — a street opening the player can open. An apartment's is the balcony slider, and it
  // SLIDES: the leaf is the pane and its two stiles, translating half a bay along x.
  const leaf = [
    part(box(w * 0.48, gh - 0.06, 0.05, x - w * 0.24, gy0 + gh / 2, z - facing * (setback + 0.04), `${id}-leaf`), p.glass),
    part(box(0.10, gh - 0.06, 0.10, x - w * 0.48, gy0 + gh / 2, z - facing * (setback + 0.02), `${id}-stile-a`), p.joinery),
    part(box(0.10, gh - 0.06, 0.10, x, gy0 + gh / 2, z - facing * (setback + 0.02), `${id}-stile-b`), p.joinery),
  ];
  return {
    parts: out,
    opening: {
      id,
      kind: 'slider',
      label,
      pivot: { x, y: gy0 + gh / 2, z: z - facing * setback },
      axis: 'x',
      openAngle: 0,
      slide: { axis: 'x', distance: w * 0.46 },
      parts: leaf,
      pick: { cx: -w * 0.24, cy: 0, cz: 0, w: w * 0.5, h: gh, d: 0.4 },
    },
  };
}

/**
 * The recessed common entry: a two-storey void, a canopy, a batten screen, the entry doors,
 * a lamp, a number plate and an intercom. Every rung has it and it is always at `entryX`.
 */
/**
 * ══ r10: §5.4's SECOND LEVER — ENTRY TREATMENT ═════════════════════════════════════════════
 *
 * "Entry treatment was the second named lever and is also unchanged across the four." (r9 §8.)
 * §5.4 named four levers, ruled AGAINST buying separation with a width step, and said to take it
 * from fenestration rhythm, entry treatment, roofline and lot treatment instead. Two were used.
 * These are the other two, and both are free.
 *
 * Every entry keeps the same PARTS — void, head, jambs, canopy, screen, door, number, intercom,
 * lamp — so the count and the account do not move. What moves is the FORM, which is what a
 * viewer sorts on:
 *
 *   porch      interwar: a deep hood on brackets, low and wide, screen full height beside it
 *   blade      postwar: the thin projecting slab on two ties (the r9 shape, kept for one rung)
 *   portal     1990s: no canopy at all — the opening is cut two storeys into the mass
 *   frame      contemporary: a projecting portal frame standing proud of the wall
 */
const ENTRY_FORM = Object.freeze({
  porch: { proj: 1.75, drop: 0.95, thick: 0.30, ties: 'bracket', screenW: 1.25, screenPitch: 0.26 },
  blade: { proj: 1.35, drop: 0.55, thick: 0.20, ties: 'rod', screenW: 0.95, screenPitch: 0.20 },
  portal: { proj: 0.0, drop: 0.40, thick: 0.16, ties: 'none', screenW: 1.55, screenPitch: 0.14 },
  frame: { proj: 0.85, drop: 0.20, thick: 0.42, ties: 'frame', screenW: 0.70, screenPitch: 0.11 },
});

export function apartmentEntry(ctx, { x, z, w = 3.0, h = 4.4, id = 'apt', form = 'blade' }) {
  const p = ctx.p;
  const out = [];
  const openings = [];
  const F = ENTRY_FORM[form] ?? ENTRY_FORM.blade;
  // r10 — the common entry is a two-storey hole in the base of every rung and it renders as
  // one. Lining level, not interior: a lobby is lit from the street and the reference plate
  // shows a floor and a back wall through the opening rather than a black rectangle.
  out.push(part(box(w, h, 0.75, x, h / 2, z - 0.42, `${id}-void`), p.shadow, 1));
  out.push(part(slab(w - 0.2, 0.10, 0.70, x, 0.0, z - 0.42, `${id}-lobby-floor`), p.paving, 1));
  // ── r12: THE ENTRY SURROUND'S OWN REVEAL FACES ────────────────────────────────────────────
  //
  // The void and the lobby floor behind them have carried the floor since r10 and these two did
  // not, which is why `apartment-midrise`'s ground entry still measured 33.0 % literal zero in a
  // 17.1 px blob at (641,717)-(754,797) — the biggest single mass on the subject. The head's
  // underside and each jamb's inward cheek ARE the reveal of a two-storey opening; they are just
  // not called `-ret`. Per face, so the head's weathering top and the jambs' street faces are
  // untouched.
  out.push(part(recessFaces(box(w + 0.30, 0.22, 0.34, x, h + 0.05, z - 0.02, `${id}-head`),
    1, ['ny']), p.trim));
  for (const side of [-1, 1]) {
    // On `portal` the whole two-storey opening is cut into the mass with NO canopy over it, so
    // the jamb's street face is inside the recess too and `l4r12-members.mjs` measures it at sky
    // visibility 0.156 — the same as the cheek beside it. On the other three forms that face
    // stands in the open under a hood and must not carry a floor, which is why this is a form
    // test and not a blanket tag.
    const faces = [side < 0 ? 'px' : 'nx'];
    if (F.proj <= 0.05) faces.push('pz');
    out.push(part(recessFaces(
      box(0.30, h + 0.16, 0.36, x + side * (w / 2 + 0.15), (h + 0.16) / 2, z - 0.02, `${id}-jamb`),
      1, faces,
    ), p.wallAlt));
  }
  // Canopy over the door. Same four members on every rung; four different objects.
  const proj = F.proj;
  const cy = h - F.drop;
  if (proj > 0.05) {
    out.push(part(slab(w + 1.0, F.thick, proj, x, cy, z + proj / 2, `${id}-canopy`), p.trim));
    out.push(part(slab(w + 1.06, 0.08, 0.12, x, cy - F.thick * 0.25, z + proj, `${id}-canopy-nose`), p.roof));
    out.push(part(box(w + 0.9, 0.08, proj - 0.2, x, cy - F.thick * 0.25, z + proj / 2, `${id}-canopy-soffit`), p.shadow, RECESS.soffit));
  } else {
    // `portal` has no canopy: the two members become a deep reveal head and its lit soffit, so
    // the opening reads as cut into the mass rather than sheltered by something stuck on it.
    out.push(part(slab(w + 0.6, F.thick, 0.62, x, cy, z - 0.24, `${id}-canopy`), p.trim));
    out.push(part(box(w + 0.4, 0.08, 0.55, x, cy - 0.12, z - 0.26, `${id}-canopy-soffit`), p.shadow, 1));
  }
  for (const side of [-1, 1]) {
    if (F.ties === 'rod') {
      const rod = Math.hypot(proj - 0.25, 0.95);
      out.push(part(box(0.05, 0.05, rod, x + side * (w / 2 + 0.05), h - 0.10,
        z + (proj - 0.25) / 2, `${id}-canopy-tie`), p.joinery));
    } else if (F.ties === 'bracket') {
      // A hood on timber brackets — the interwar entry, and the members are the same two boxes.
      out.push(part(box(0.16, 0.62, proj * 0.72, x + side * (w / 2 + 0.16), cy - 0.40,
        z + proj * 0.40, `${id}-canopy-tie`), p.joinery));
    } else if (F.ties === 'frame') {
      // A portal frame standing proud: two legs to the ground, which is the contemporary tell.
      out.push(part(box(0.24, cy + F.thick / 2, 0.34, x + side * (w / 2 + 0.30),
        (cy + F.thick / 2) / 2, z + proj - 0.17, `${id}-canopy-tie`), p.trim));
    }
  }
  // Batten screen beside the door — the modern-Melbourne entry tell.
  out.push(...battenScreen(ctx, {
    x: x - w / 2 + F.screenW * 0.55, y: 0.0, z: z - 0.06,
    w: F.screenW, h: h - (form === 'portal' ? 0.55 : 1.1), pitch: F.screenPitch,
  }));
  const door = commercialDoor(ctx, {
    x: x + 0.55, y: 1.24, z: z - 0.10, w: 1.20, h: 2.44,
    id: `${id}-entry`, label: 'Apartment entry', glazed: true, leafMaterial: p.joinery,
  });
  out.push(...door.parts);
  if (door.opening) openings.push(door.opening);
  out.push(part(box(0.60, 0.44, 0.06, x + 1.65, 2.30, z - 0.06, `${id}-number`), p.trim));
  out.push(part(box(0.16, 0.30, 0.07, x - 0.25, 1.55, z - 0.06, `${id}-intercom`), p.joinery));
  out.push(...lamp(ctx, { x: x - w / 2 - 0.15, y: 2.55, z: z + 0.16 }));
  return { parts: out, openings };
}

/**
 * The lot every rung stands on: board tray, lawn with tufts, footpath and kerb, a paved path
 * from a gate to the entry, a low fence with a gate, planted beds, two trees, a hedge to the
 * rear boundary, a bin store and a bike rack.
 *
 * This is §2.1, §2.6, §2.7 and §2.8 in one call, so no rung can forget one of them.
 */
const LOT_ERA = Object.freeze({
  // fence   the boundary: `picket` timber palisade, `wall` a masonry dwarf wall with piers,
  //         `palisade` a fine steel bar fence with no plinth, `planter` no fence at all.
  // path    paver unit and width — a small brick unit reads interwar, a wide slab contemporary.
  // habit   the street tree.       hedge   the side-boundary form.     entry  the entry form.
  'apartment-low': { fence: 'picket', fenceH: 1.06, pitch: 0.40, unit: 0.68, pathW: 1.30,
    habit: 'round', hedge: 'clipped', entry: 'porch', forecourt: false },
  'apartment-permit': { fence: 'wall', fenceH: 0.92, pitch: 0.52, unit: 1.55, pathW: 1.55,
    habit: 'columnar', hedge: 'loose', entry: 'blade', forecourt: false },
  'apartment-midrise': { fence: 'palisade', fenceH: 1.24, pitch: 0.38, unit: 1.20, pathW: 1.85,
    habit: 'vase', hedge: 'grass', entry: 'portal', forecourt: true },
  'apartment-mid': { fence: 'planter', fenceH: 0.62, pitch: 0.62, unit: 1.95, pathW: 2.30,
    habit: 'open', hedge: 'grass', entry: 'frame', forecourt: true },
});

/** The rung's era row, so a caller can ask for its entry form without re-deriving the table. */
export function lotEra(id) {
  return LOT_ERA[id] ?? LOT_ERA['apartment-permit'];
}

export function apartmentLot(ctx, { entryX, frontZ, backZ, halfW, salt = S, id = null }) {
  const { env, p } = ctx;
  const add = (produced) => ctx.add(produced);
  const padHalfW = env.lotW / 2;
  const padHalfD = env.lotD / 2;
  const inner = METRICS.rim;
  const walkZ = padHalfD - inner - 1.30;
  const fenceZ = walkZ - 0.42;
  // ── r10 / §5.4: THE LOT IS NO LONGER ONE LOT FOUR TIMES ───────────────────────────
  //
  // r9 §8, and it is the largest single gap it names: "Same tray, same fence, same single
  // lollipop tree, same two extruded prisms, same footpath, same kerb. Lot triangle counts are
  // 2,924 / 2,928 / 2,990 / 3,038 — within 4 % across four rungs." §5.4 named lot treatment as
  // one of its four levers and ruled that the separation must come from levers like it rather
  // than from a width step. It is the cheapest half-point left in the lane.
  //
  // Four ERAS of front garden, built from the primitives that were already here. The triangle
  // counts stay inside the 3,500 lot allowance on every rung and they now DIFFER, which is the
  // point: a lot that is a fifth of every board tile should not be the same fifth four times.
  const era = LOT_ERA[id] ?? LOT_ERA['apartment-permit'];

  add(boardPlinth(ctx, { lawn: !era.forecourt }));
  add(kerbAndFootpath(ctx));
  add(paverPath(ctx, {
    x: entryX, z0: frontZ - 0.05, z1: fenceZ + 0.55, width: era.pathW, unit: era.unit,
  }));
  if (era.fence === 'wall') {
    // A postwar block has a rendered dwarf wall with piers, not a picket fence.
    //
    // BUILT FROM `picketFence`'s OWN NAMES, NOT FROM `pierWall`. `pierWall` emits `pier` and
    // `pier-cap`, and `office.js:175` uses those same two literals for its BUILDING piers — so
    // the lane's two §3.4 classifiers disagree about them, and routing a boundary wall through
    // that name put `apartment-permit` 186 triangles over on one instrument and inside its cap
    // on the other. That is MAJ-12's exact species and the ruling on it is that the fix belongs
    // in the geometry name. `fence-plinth`, `fence-post`, `post-cap` and `picket-cap` are lot on
    // both instruments and mean one thing each.
    add(picketFence(ctx, {
      z: fenceZ, x0: -padHalfW + inner, x1: padHalfW - inner,
      h: era.fenceH, gapX: entryX, gapW: 1.70, pitch: era.pitch, masonry: true,
    }));
  } else if (era.fence === 'planter') {
    // And a contemporary one has no fence at all — a raised planter edge defines the boundary.
    const runs = [[-padHalfW + inner, entryX - 1.35], [entryX + 1.35, padHalfW - inner]];
    for (const [a, b] of runs) {
      if (b - a < 0.5) continue;
      add([
        part(slab(b - a, era.fenceH, 0.72, (a + b) / 2, 0.0, fenceZ, 'fence-plinth'), p.wallAlt),
        part(slab(b - a + 0.10, 0.10, 0.82, (a + b) / 2, era.fenceH, fenceZ, 'picket-cap'), p.trim),
      ]);
      add(hedgeRun(ctx, {
        x0: a + 0.4, z0: fenceZ, x1: b - 0.4, z1: fenceZ, h: 0.54, w: 0.52, form: 'grass',
      }));
    }
  } else {
    add(picketFence(ctx, {
      z: fenceZ, x0: -padHalfW + inner, x1: padHalfW - inner,
      h: era.fenceH, gapX: entryX, gapW: 1.50, pitch: era.pitch,
      // A 1990s steel palisade stands on the ground, not on a masonry plinth.
      plinth: era.fence !== 'palisade',
    }));
  }
  // A forecourt rung pays for its paving out of its lawn: the front garden is a paved apron
  // rather than grass, which is what a 1990s midrise and a contemporary block actually have.
  if (era.forecourt) {
    add(paverField(ctx, {
      x: 0, z: (frontZ + fenceZ) / 2 + 0.1, w: padHalfW * 2 - inner * 2 - 0.6,
      d: Math.max(0.9, fenceZ - frontZ - 0.2), unit: era.unit + 0.35, bed: false,
    }));
  }

  // Front beds either side of the path.
  //
  // THESE ARE SIZED TO THE ROOM THAT IS ACTUALLY LEFT, not to a fixed offset from the entry.
  // The first version placed them at `entryX ± 2.9` with an authored width, and because
  // `entryX` is the first bay's centre and the body width carries a façade jitter, the left
  // bed's kerb landed at x = −8.06 on façade 3 of `apartment-permit` — off the 16 m tile
  // entirely. The probe caught it; the fix is to derive rather than to nudge the constant.
  const bedZ = (frontZ + fenceZ) / 2;
  const bedD = Math.max(0.9, Math.min(1.5, (fenceZ - frontZ) - 0.55));
  for (const side of [-1, 1]) {
    const pathEdge = entryX + side * 0.95;
    const lotEdge = side * (padHalfW - inner - 0.35);
    const w = Math.abs(lotEdge - pathEdge) - 0.30;
    if (w < 1.0) continue;
    add(plantedBed(ctx, {
      x: (pathEdge + lotEdge) / 2, z: bedZ, w, d: bedD,
      plants: w > 3.4 ? 3 : 2, salt: salt + (side > 0 ? 20 : 10),
    }));
  }
  add(canopyTree(ctx, {
    x: -padHalfW + inner + 1.2, z: frontZ - 1.4,
    h: era.habit === 'columnar' ? 4.6 : era.habit === 'open' ? 4.1 : 3.6,
    canopy: era.habit === 'columnar' ? 0.78 : era.habit === 'vase' ? 1.15 : 1.0,
    habit: era.habit, pit: era.forecourt,
  }));
  add(canopyTree(ctx, {
    x: padHalfW - inner - 1.2, z: backZ + 1.6,
    h: era.habit === 'columnar' ? 4.0 : 3.2, canopy: 0.88, habit: era.habit,
  }));
  // Side yards: a hedge each side, and the downpipe run lands on them.
  for (const side of [-1, 1]) {
    add(hedgeRun(ctx, {
      x0: side * (padHalfW - inner - 0.55), z0: frontZ - 1.0,
      x1: side * (padHalfW - inner - 0.55), z1: backZ + 0.6, h: 0.82, w: 0.55,
      form: era.hedge,
    }));
  }
  // Rear: the things that say people live here.
  const yardZ = (backZ - 0.4 + (-padHalfD + inner)) / 2;
  add(paverField(ctx, { x: 0, z: yardZ, w: halfW * 1.5, d: 1.9, unit: 1.34, bed: false }));
  add(binStore(ctx, { x: -halfW + 1.5, z: yardZ, w: 2.3, d: 1.25, h: 1.5 }));
  add(bikeRack(ctx, { x: halfW - 2.1, z: yardZ, hoops: 3, spacing: 0.78 }));
  add(shrubMass(ctx, { x: 0.4, z: yardZ - 0.2, r: 0.48, h: 0.66 }));
  add(hedgeRun(ctx, {
    x0: -padHalfW + inner + 0.4, z0: -padHalfD + inner + 0.42,
    x1: padHalfW - inner - 0.4, z1: -padHalfD + inner + 0.42, h: 0.92, form: era.hedge,
  }));
  add(lawnTufts(ctx, {
    count: 11, salt: salt + 40,
    avoid: [
      { x: 0, z: (frontZ + backZ) / 2, w: halfW * 2 + 2.0, d: (frontZ - backZ) + 2.0 },
      { x: entryX, z: (frontZ + fenceZ) / 2, w: 2.2, d: 4.0 },
      { x: 0, z: yardZ, w: halfW * 2, d: 2.6 },
      { x: 0, z: walkZ, w: env.lotW, d: 1.8 },
    ],
  }));
}

/**
 * The shell every rung shares: dark brick base, pale render field over it, punched flanks and
 * rear, a proud string course at the base head and at each floor line, gutter and downpipes.
 *
 * `frontOpenings` is left to the rung, because the frontage is where the ladder differs.
 */
export function apartmentShell(ctx, {
  frontZ, backZ, halfW, storeys, storeyH, baseStoreys, sideWins = 2, winW = 1.45,
  frontOpenings = [], skipFrontWall = false,
}) {
  const { p } = ctx;
  const add = (produced) => ctx.add(produced);
  const midZ = (frontZ + backZ) / 2;
  const bodyD = frontZ - backZ;
  const wallH = storeys * storeyH;
  const baseTop = baseStoreys * storeyH;

  const left = [];
  const right = [];
  const back = [];
  const winH = 1.62;
  for (let s = 0; s < storeys; s += 1) {
    const sillY = s * storeyH + 1.02;
    for (let i = 0; i < sideWins; i += 1) {
      const u = midZ + (i - (sideWins - 1) / 2) * (bodyD * 0.42);
      left.push(hole(u, sillY, winW, winH));
      right.push(hole(u, sillY, winW, winH));
    }
    back.push(hole(-halfW * 0.45, sillY, winW, winH));
    back.push(hole(halfW * 0.45, sillY, winW, winH));
  }

  // Base — the dark brick storey (or two). Its own material, its own punched grid.
  const inBase = (o) => o.y + o.height <= baseTop + 0.01;
  const splitLeft = [left.filter(inBase), left.filter((o) => !inBase(o))];
  const splitRight = [right.filter(inBase), right.filter((o) => !inBase(o))];
  const splitBack = [back.filter(inBase), back.filter((o) => !inBase(o))];
  const splitFront = [frontOpenings.filter(inBase), frontOpenings.filter((o) => !inBase(o))];

  const band = (mat, y0, y1, l, r, b, f) => {
    add(openWall(ctx, {
      material: mat, axis: 'z', face: -1, plane: -halfW, centre: midZ, run: bodyD,
      y0, y1, depth: METRICS.wallDepth, openings: l, name: 'apt-left',
    }));
    add(openWall(ctx, {
      material: mat, axis: 'z', face: 1, plane: halfW, centre: midZ, run: bodyD,
      y0, y1, depth: METRICS.wallDepth, openings: r, name: 'apt-right',
    }));
    add(openWall(ctx, {
      material: mat, axis: 'x', face: -1, plane: backZ, centre: 0, run: halfW * 2,
      y0, y1, depth: METRICS.wallDepth, openings: b, name: 'apt-back',
    }));
    if (!skipFrontWall) {
      add(openWall(ctx, {
        material: mat, axis: 'x', face: 1, plane: frontZ, centre: 0, run: halfW * 2,
        y0, y1, depth: METRICS.wallDepth, openings: f, name: 'apt-front',
      }));
    }
  };
  band(p.wallAlt, 0, baseTop, splitLeft[0], splitRight[0], splitBack[0], splitFront[0]);
  band(p.wall, baseTop, wallH, splitLeft[1], splitRight[1], splitBack[1], splitFront[1]);
  // The dark core the punched holes look into.
  add([part(box(halfW * 2 - 0.9, wallH - 0.2, bodyD - 0.9, 0, wallH / 2, midZ, 'apt-core'), p.shadow, RECESS.interior)]);

  add(plinthCourse(ctx, { z: midZ, w: halfW * 2, d: bodyD, h: 0.52, proud: 0.14 }));
  add(stringCourse(ctx, {
    z: midZ, w: halfW * 2, d: bodyD, y: baseTop - 0.10, thick: 0.20, proud: 0.15,
  }));
  for (let s = baseStoreys + 1; s < storeys; s += 1) {
    add(stringCourse(ctx, {
      z: midZ, w: halfW * 2, d: bodyD, y: s * storeyH - 0.10, thick: 0.10, proud: 0.07,
    }));
  }
  // Bed joints on the FRONTAGE base only. r1 scribed them on the right flank too, 22 joints on
  // an elevation the plate stations do not see, and §2.5's brick variation on that face is
  // already carried by the atlas cell's own course tone.
  add(brickCourses(ctx, {
    axis: 'x', face: 1, plane: frontZ, centre: 0, run: halfW * 2,
    y0: 0.55, y1: baseTop, openings: splitFront[0], pitch: 0.78,
  }));

  // Flank articulation. The r1 `apartment-low` plate came back with a four-storey pale render
  // field carrying two small windows a floor and nothing else, which is the blank-wall read
  // §2.1 grades. A shallow expressed bay between the two window columns, capped and based,
  // gives the flank a vertical and a shadow line for four boxes a side.
  const bayD = Math.min(2.6, bodyD * 0.26);
  for (const side of [-1, 1]) {
    const px = side * (halfW + 0.11);
    add([
      part(box(0.22, wallH - baseTop - 0.20, bayD, px, (baseTop + wallH) / 2 - 0.10, midZ, 'flank-bay'), p.wall),
      part(box(0.32, 0.14, bayD + 0.18, px + side * 0.03, wallH - 0.24, midZ, 'flank-bay-cap'), p.trim),
      part(box(0.32, 0.14, bayD + 0.18, px + side * 0.03, baseTop + 0.02, midZ, 'flank-bay-base'), p.trim),
      // THE "RECESS" WAS PROUD, AND IT IS THE LOUDEST THING ON THREE OF FOUR RUNGS.
      //
      // r1 placed it at `px + side * 0.09` — 0.09 m OUTSIDE the expressed bay it sits in, and
      // 0.10 m thick, so a 1.9 m panel stood in front of the wall instead of behind it. On the
      // r3 plates it reads as a plank of dark chocolate applied to the flank of `apartment-low`,
      // `-permit` and `-midrise`, and it is the first thing the eye goes to on all three. Moved
      // 0.06 m INSIDE the bay face, where a recess belongs: the bay's own 0.22 m depth now
      // frames it and the panel reads as the shadow gap it was always named as. Zero triangles.
      part(box(0.10, wallH - baseTop - 0.60, bayD - 0.42, px - side * 0.06,
        (baseTop + wallH) / 2 - 0.10, midZ, 'flank-bay-recess'), p.shadow, RECESS.interior),
    ]);
  }

  // Flank and rear openings.
  for (const o of left) {
    add(gridWindow(ctx, { x: -halfW, y: o.y + o.height / 2, z: o.u, w: o.width, h: o.height, facing: 'left' }));
  }
  for (const o of right) {
    add(gridWindow(ctx, { x: halfW, y: o.y + o.height / 2, z: o.u, w: o.width, h: o.height, facing: 'right' }));
  }
  for (const o of back) {
    add(gridWindow(ctx, {
      x: o.u, y: o.y + o.height / 2, z: backZ, w: o.width, h: o.height, facing: 'back', lean: true,
    }));
  }
  // Rear service door.
  add(commercialDoor(ctx, {
    x: 0, y: 1.22, z: backZ, w: 1.05, h: 2.28, facing: 'back',
    id: 'apt-rear', label: 'Rear door', leafMaterial: p.joinery,
  }));

  // Rainwater, and the streaks that follow it (§2.5).
  for (const side of [-1, 1]) {
    add([
      part(cyl(0.07, wallH - 0.7, side * (halfW - 0.22), (wallH - 0.7) / 2 + 0.6, backZ + 0.5,
        'y', 'apt-dp', 8), p.joinery),
      part(box(0.22, 0.10, 0.20, side * (halfW - 0.22), 0.65, backZ + 0.5, 'apt-dp-shoe'), p.joinery),
    ]);
  }
  add(streaks(ctx, {
    plane: halfW, facing: 1, axis: 'z',
    xs: [midZ - bodyD * 0.3, midZ + bodyD * 0.25], yTop: wallH - 0.4, length: 2.6,
  }));
  return { wallH, baseTop, midZ, bodyD };
}

/** Even bay centres across the frontage. */
export function bayCentres(halfW, bays, inset = 0.55) {
  const usable = halfW * 2 - inset * 2;
  const pitch = usable / bays;
  const out = [];
  for (let i = 0; i < bays; i += 1) out.push(-halfW + inset + (i + 0.5) * pitch);
  return { centres: out, pitch };
}
