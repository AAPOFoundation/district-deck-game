// District Deck V3.41 — MP9 lane E: `school-high` (HIGH SCHOOL).
//
// Spec: `docs/next-phase/V341-MP9-BUILDINGS-SPEC.md` §6E — postwar Melbourne high school.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS REPLACES, AND WHY THE PLAN IS THE WHOLE ARGUMENT
//
// `school-high`, `missionary-school` and `officer-school` were all `civic/school.js` — ONE
// primary-school model with three different signs. The baseline plate for this subject
// (`mvp/_reviews/mp9/r0-baseline/school-high--three-quarter.png`) is a chain of three low
// single-storey pavilions strung down a 31 m lot: long, horizontal, domestic in height, with a
// ball court and a play structure. That plate is the thing this model must not resemble.
//
// The primary school's own header carries the finding that governs every composition in this kit
// and it is quoted rather than paraphrased because three rounds were lost to ignoring it:
//
//     "Column position in the plate is u ≈ 0.756x − 0.654z … Anything closer than about 8 u
//      merges. Three bays at 4.0 m centres are 3.0 u apart. They could not have separated."
//
// and its envelope note adds the second half — a mass's own width in columns is
// `0.756w + 0.654(d + 0.8)`, and on the 1 × 2 lot "roughly 28 u a building can occupy".
//
// ── THE ENVELOPE. 1 × 1 AND 3 STOREYS, WHICH IS WHAT THE SIM ALREADY BELIEVES. ──
//
// The inherited `SCHOOL_ENVELOPE` is `[1, 2], storeys: 2`. `core/content.js:225` authors
// `school-high` as `footprint: [1, 1], storeys: 3`, and landuse, permits and pricing read THAT.
// So the rendered envelope was contradicting the sim on both numbers: the lab was drawing this
// subject on a 15 × 31 m pad at two storeys while every rule in the game treated it as a 15 × 15
// parcel at three. `HIGH_SCHOOL_ENVELOPE` is re-authored to `[1, 1], storeys: 3` — the spec's own
// row, and the one the board will actually clamp the building onto.
//
// That halves the lot, and it is a gain rather than a cost. Before a critic reads a single roof,
// the two schools differ in FORMAT: the primary school is a 15 × 31 strip and this is a 15 × 15
// square. Nothing else on the board is a square civic lot carrying a three-storey mass.
//
// ── EVERY PLAN NUMBER IS DERIVED, NOT AUTHORED INTO THE ENVELOPE. ──
//
// `civic/index.js scaleEnvelope` multiplies any envelope key ending in `W`, `X` or `Gap` by
// `lotW / 15` and any key ending in `Z` or `D` by `lotD / 31`. On a 1 × 1 lot that second factor
// is **0.484** — so an envelope authored the way `school.js` authors its own would have every
// depth in this building silently halved. The envelope therefore carries only counts and VERTICAL
// dimensions (none of whose names end in a scaled suffix), and `layout()` derives the plan from
// the measured `E.lotW` / `E.lotD`. The model is correct on whatever parcel it lands on and
// nothing here depends on a nominal that is not this subject's own.
//
// ── THE SILHOUETTE ARGUMENT, WITH THE COLUMN ARITHMETIC ──
//
// The primary school buys three teeth with a 31 m depth. A 15 m square cannot buy two the same
// way: the lot spans u ∈ [−10.58, +10.58] corner to corner and a classroom block alone eats
// 11 u of it. So the separation is bought in HEIGHT, on the u axis, exactly as §6E instructs —
// "the composition must go UP and BACK, and the stair tower plus the gym ridge are what give it
// two teeth in the plate."
//
//   mass                centre (x, z)      u        span            top (above plate deck)
//   ───────────────────────────────────────────────────────────────────────────────────────
//   STAIR TOWER         (−4.95, +4.60)    −6.75   −9.19 … −4.32     13.15   ← tooth 1
//   CLASSROOM SLAB      (−1.80, +0.95)    −1.98   −7.63 … +3.67      9.90   ← the notch floor
//   GYMNASIUM           (+3.15, −5.05)    +5.68   +1.25 … +10.12    11.60   ← tooth 2
//
//   tower ↔ gym centres              12.43 u   (the school's own accepted gaps are 8.12 / 8.84)
//   clear band owned by the slab      5.57 u   (u −4.32 … +1.25, ~29 columns of a 110-column
//                                               reduction; the school's clear gaps were 3.07)
//
//   profile:   13.15 ──┐            ┌── 11.60
//                      └── 9.90 ────┘
//   notch depth, left  (13.15 − 9.90) / 13.15 = 0.247
//   notch depth, right (11.60 − 9.90) / 11.60 = 0.147
//   the r4 school critic re-measured its accepted teeth at notch depths 0.155 and 0.117.
//
// AND NO PIECE OF LOT FURNITURE CAN OWN A TOOTH ON THIS SUBJECT. That failure cost the primary
// school two rounds — its comb was being certified by a flagpole. Here the three masses own
// u ∈ [−9.19, +10.12] continuously and the lot itself only spans ±9.87 at the plantable corners,
// so every column in the frame already has a building over it at 9.90 m or more. The flagpole is
// 7.5 m at u −5.37, the street tree 5.4 m at u −5.75, the tallest tree 4.6 m: none of them comes
// within 2 m of the profile it stands under. The comb is architecture by construction.
//
// ── AND IT IS NOT THE PRIMARY SCHOOL SCALED UP ──
//
//   primary school                       high school
//   three low pavilions in a chain        one upright slab with one vertical incident
//   ridge 4.1–6.2 m, all horizontal       parapet 9.9 m, tower 13.2 m, gym arch 11.6 m
//   gable / skillion / glazed monitor     flat parapet + expressed frame + segmental arch
//   punched sashes and a roof monitor     a horizontal ribbon per floor, spandrel panels
//   picket fence, play structure, sail    palisade fence, bus bay, tiered stand, no play kit
//   15 × 31 strip                         15 × 15 square
//
// Salt namespace 3400–3499.
// ══════════════════════════════════════════════════════════════════════════════════════════════

import {
  slab, box, rotBox, part, cyl, taper,
  CIVIC_METRICS, hole, volume, rampSolid, seamSkillion, arcEndPlate,
  plinthCourse, stringCourse, downpipe, louvreScreen, steelRail,
  boardPlate, lawn, paverRun, sealedSlab, lineMarks, lineCircle, fenceRun, gate,
  inst, shrubMass, hedgeRun, canopyTree, plantedBed, bench, bikeRack, bin,
  wallLamp, goalPost, flagpole, barrelRoof,
} from './core.js';
import { civicWindow, civicDoor, entryCanopy, glazedEntry, noticeCase } from './openings.js';

const M = CIVIC_METRICS;
const Y0 = M.plateRise;

/** Vertical dimensions only. See the header: any key ending W/X/Gap/Z/D would be lot-scaled. */
export const HIGH_SCHOOL_ENVELOPE = Object.freeze({
  footprint: [1, 1],
  storeys: 3,
  /** Postwar classroom floor-to-floor. Three of these plus the parapet is the notch floor. */
  storeyRise: 3.05,
  parapet: 0.75,
  /** The gym is one tall room, so its eave is above the slab's second floor. */
  gymEave: 8.60,
  gymArch: 2.55,
  towerTop: 12.30,
  colaHeight: 2.90,
});

export function buildHighSchool(ctx) {
  const E = ctx.env;
  const L = layout(E);
  lotAndFrontage(ctx, E, L);
  classroomSlab(ctx, E, L);
  stairTower(ctx, E, L);
  gymnasium(ctx, E, L);
  coveredWalkway(ctx, E, L);
  grounds(ctx, E, L);
  inhabit(ctx, E, L);
}

/* ─────────────────────────────────────── the plan ─────────────────────────────────── */

/**
 * Every plan dimension, derived from the measured lot rather than authored against a nominal.
 *
 * The numbers below are metres on a 15 × 15 parcel and scale linearly on each axis if the sim
 * hands the builder a different one. The bands are laid out so that no two masses interpenetrate
 * and no ground surface overlaps another — the primary-school lane paid a round for 3.58 m² of
 * coincident ground plane and this file is laid out to make that impossible to reintroduce.
 *
 *   z +7.42 … +6.55   footpath, bus bay, kerb            (0.87 deep — clear of paverRun's 0.30 guard)
 *   z +6.50           the palisade boundary and the gate
 *   z +6.40 … +3.50   entry forecourt, name wall, bike shelter, flagpole
 *   z +3.30 … −1.40   THE CLASSROOM SLAB                 (the tower laps forward to +5.90)
 *   z −1.45 … −2.85   the covered walkway strip
 *   z −2.85 … −7.05   the hard court (west) and THE GYMNASIUM (east)
 */
function layout(E) {
  const sx = E.lotW / 15;
  const sz = E.lotD / 15;
  const X = (v) => v * sx;
  const Z = (v) => v * sz;
  const rise = E.storeyRise ?? 3.05;
  return {
    sx,
    sz,
    X,
    Z,
    rise,
    wallTop: rise * (E.storeys ?? 3),
    parapet: E.parapet ?? 0.75,
    kerbZ: Z(7.42),
    fenceZ: Z(6.50),
    gateX: X(2.30),
    slab: { x: X(-1.80), z: Z(0.95), w: X(10.20), d: Z(4.70) },
    tower: { x: X(-4.95), z: Z(4.60), w: X(3.50), d: Z(2.60) },
    gym: { x: X(3.15), z: Z(-5.05), w: X(7.50), d: Z(4.10) },
    court: { x: X(-4.575), z: Z(-4.875), w: X(4.75), d: Z(4.05) },
    link: { x: X(-2.775), z: Z(-2.15), w: X(8.35), d: Z(1.40) },
    yard: { x: X(5.275), z: Z(0.275), w: X(3.35), d: Z(6.25) },
    fore: { x: X(1.975), z: Z(4.95), w: X(9.95), d: Z(2.90) },
    stand: { x: X(-1.50), z: Z(-4.90), w: X(1.20), d: Z(3.40) },
  };
}

/* ─────────────────────────────────── the glazing ──────────────────────────────────── */

/**
 * A classroom glazing band, built locally, because the crush finding lives in this object and the
 * two things that cause it are both fixed in `openings.js` where a lane may not reach.
 *
 * ── r3: MEASURED, NOT GUESSED. ──
 *
 * `mvp/_reviews/mp9/measure-plate.py` put r2 at **12.395 % crushed, p05 0.9** against Monopoly
 * Plus at 1.045 / 29.8. A per-cell crush map over the r2 plate localises it exactly: every glazed
 * band on the model is a solid black rectangle, and together they are most of the fault.
 *
 * The cause is two constants a lane cannot edit. `CIVIC_GLASS.base` is `#3a3936`
 * (`surfaces.js:641`) — a dark grey, `transparent: false`, `depthWrite: true`, so nothing behind
 * the pane contributes anything and r2's pale interior liner could never have helped. And
 * `ribbonBand` sets the pane at `M.reveal * 1.15` = **0.28 m** behind the outer face, on a wall
 * whose normal points away from the key. A dark albedo receiving neither key nor sky resolves to
 * zero, and no interior fixes it.
 *
 * [SEEN] on `_refs-mp/mp-civic-blue.png`, which is the answer: the Monopoly Plus civic building's
 * windows are PALE — cream and pale green panels at roughly the wall's own value, framed in stone
 * — and its deepest portico shade is a warm mid-brown. There is no black window anywhere in the
 * frame, and the vaulted roof lanterns are the brightest thing on the building.
 *
 * So three changes, and each is a modelling decision rather than a grade one:
 *
 *   1. THE SET-BACK COMES FROM 0.28 TO 0.11. A pane near the face sees sky, and `glass` carries
 *      `envBase 0.84` — the highest in the table, raised at the hospital's r4 for this exact
 *      failure with the note "value is the wrong dial for a term that is already multiplied by
 *      nearly zero". The dial that works is how much environment the pane can see.
 *   2. THE MULLIONS ARE PALE AND THEY STAND PROUD. `ribbonBand` puts its fins in `metal`, inside
 *      the recess, where they are as dark as the pane between them. Here they are `trim` — the
 *      palest bucket, `envBase 0.70`, the only one with a `shade.floor` — standing 20 mm outside
 *      the wall face so the key reaches them. One black band becomes lights separated by lit
 *      members, which is what a postwar school elevation IS and what the reference does.
 *   3. A HOPPER PANEL takes the top 0.30 m of every band in `trim`. Every Australian school
 *      classroom has one over its windows; it also means no band is glass from head to sill.
 *
 * `lean` drops the jambs, the hopper and the end stiles on faces the graded stations never see.
 */
function schoolRibbon(ctx, {
  x, y, z, w, h, face = 'front', bays = 5, lean = false, hopper = true, transomStep = 0,
  id = 'rib',
}) {
  const { p } = ctx;
  const runX = face === 'front' || face === 'back';
  const n = (face === 'front' || face === 'right') ? 1 : -1;
  const at = (run, hh, t, du, dy, dd, nm) => (runX
    ? box(run, hh, t, x + du, y + dy, z + n * dd, `${id}-${nm}`)
    : box(t, hh, run, x + n * dd, y + dy, z + du, `${id}-${nm}`));
  const set = 0.11;
  const out = [];
  // The reveal: head, sill and (unless lean) both jambs, each a return into a SHALLOW recess.
  out.push(part(at(w + 0.18, 0.09, set + 0.03, 0, h / 2 - 0.045, -(set / 2), 'rev-h'), p.shadow));
  out.push(part(at(w + 0.18, 0.09, set + 0.03, 0, -h / 2 + 0.045, -(set / 2), 'rev-s'), p.shadow));
  if (!lean) {
    for (const side of [-1, 1]) {
      out.push(part(at(0.09, h, set + 0.03, side * (w / 2 + 0.045), 0, -(set / 2), 'rev-j'), p.shadow));
    }
  }
  // Precast head and sill with real section — the spandrel banding of the elevation.
  out.push(part(at(w + 0.32, 0.22, 0.28, 0, h / 2 + 0.14, 0.09, 'head'), p.trim));
  out.push(part(at(w + 0.32, 0.20, 0.32, 0, -h / 2 - 0.13, 0.12, 'sill'), p.trim));
  out.push(part(at(w, h, 0.05, 0, 0, -set, 'pane'), p.glass));
  if (hopper && ctx.mid) {
    out.push(part(at(w - 0.04, 0.30, 0.07, 0, h / 2 - 0.16, -set + 0.05, 'hopper'), p.trim));
    out.push(part(at(w, 0.09, 0.13, 0, h / 2 - 0.33, -0.02, 'hopper-rail'), p.trim));
  }
  if (ctx.mid) {
    const cols = Math.max(2, bays);
    for (let i = 1; i < cols; i += 1) {
      out.push(part(at(0.10, h, 0.17, -w / 2 + (i / cols) * w, 0, -0.055, 'mull'), p.trim));
    }
    if (!lean) {
      for (const side of [-1, 1]) {
        out.push(part(at(0.12, h, 0.17, side * (w / 2 - 0.06), 0, -0.055, 'stile'), p.trim));
      }
    }
    if (transomStep > 0) {
      for (let ty = -h / 2 + transomStep; ty < h / 2 - 0.12; ty += transomStep) {
        out.push(part(at(w, 0.11, 0.15, 0, ty, -0.035, 'transom'), p.trim));
      }
    }
  }
  ctx.add(out);
}

/* ────────────────────────────── the interior behind the glass ─────────────────────── */

/**
 * A room shell and a floor, in the PALE bucket instead of the shadow bucket.
 *
 * ── r2: THIS IS THE CRUSH FINDING, AND IT IS THE LARGEST SINGLE FIX ON THIS SUBJECT. ──
 *
 * The orchestrator's round-1 census measures Monopoly Plus at 1.0-1.8 % of subject pixels under
 * luma 12 and this lane's r1 plate at **10.602 %, p05 0.9**. [SEEN] on
 * `laneE-r1/school-high--three-quarter.png`: the classroom elevation carries nine horizontal
 * glazing bands and every one of them is a black stripe. That is where the crush is, and its cause
 * is `volume()`'s own room box — `core.js:566` builds it in `ctx.p.shadow`, which is the `metal`
 * alias, the darkest family on the model. A surface with the model's darkest albedo, receiving no
 * key, no fill and almost no environment, seen through a 0.28 m reveal AND behind a pane, is three
 * multipliers of darkness on one pixel. It cannot resolve to anything but zero.
 *
 * §2.9's own wording is the target: "a verandah is a mid-shadow perhaps two stops under the sunlit
 * façade, with the wall, the door and the post bases still readable — not a void." A classroom
 * behind glass is the same object.
 *
 * So the shell is `trim` — the palest bucket, `envBase 0.70`, the highest in `CIVIC_RESPONSE`, and
 * the ONLY bucket carrying an explicit `shade.floor`, which exists to lift exactly these faces.
 * `volume` is called with `room: false` and this stands in its place. Same two primitives, same
 * triangle count, three stops of value.
 */
function litRoom(ctx, { x, z, w, d, y0, y1, name }) {
  const { p } = ctx;
  const t = CIVIC_METRICS.wallDepth;
  const inset = t * 1.04;
  return [
    part(box(
      Math.max(0.2, w - inset * 2), Math.max(0.2, y1 - y0 - 0.10), Math.max(0.2, d - inset * 2),
      x, (y0 + y1) / 2, z, `${name}-room`,
    ), p.trim),
    part(box(
      Math.max(0.2, w - t), 0.12, Math.max(0.2, d - t), x, y0 + 0.06, z, `${name}-floor`,
    ), p.ground),
  ];
}

/* ─────────────────────────────── the lot and the street ───────────────────────────── */

function lotAndFrontage(ctx, E, L) {
  const { p } = ctx;
  const half = E.lotW / 2;
  const { fenceZ, kerbZ } = L;

  ctx.add(boardPlate(ctx, { width: E.lotW, depth: E.lotD }));

  // ── THE FOOTPATH AND THE BUS BAY, AND THE 0.30 m GUARD IS WHY IT IS 0.87 m DEEP. ──
  //
  // `paverRun` returns an empty array below 0.30 m in either dimension (`core.js:1043`), silently,
  // and the primary-school lane painted a pedestrian crossing onto bare plate for four rounds
  // because a 0.25 m apron was swallowed by that guard with no error. §6E asks for "a bus bay in
  // the kerb", which needs a real strip of ground between the boundary and the plate edge, so the
  // palisade line is set 1.0 m inboard rather than at the usual 0.45 and the footpath is 0.87 m of
  // flat paving with the bay bars painted on it. Flat, because paint on a field that modulates
  // ±11 mm is either buried or floating (the same lane's r7 finding).
  ctx.add(paverRun(ctx, {
    x0: -half + 0.06, x1: half - 0.06, z0: fenceZ + 0.05, z1: kerbZ, unit: 1.70, joint: 0.035, flat: true,
    name: 'footpath',
  }));
  const bayBars = [];
  for (let i = 0; i < 5; i += 1) {
    bayBars.push([L.X(0.9 + i * 1.35), kerbZ - L.Z(0.30), L.X(0.86), L.Z(0.15)]);
  }
  ctx.add(lineMarks(ctx, {
    segments: bayBars, y: Y0 + 0.09, wear: 0.22, name: 'bus-bay-mark',
  }));
  // The bus-stop flag and a waiting bench. The bay is a marking; the pole is what makes it read.
  const stopX = L.X(6.10);
  ctx.add([
    part(taper(0.09, 0.07, 2.55, stopX, Y0 + 0.09, kerbZ - L.Z(0.34), 'stop-post', 7), p.metal),
    part(box(0.62, 0.46, 0.09, stopX, Y0 + 2.42, kerbZ - L.Z(0.34), 'stop-flag'), p.accent),
    part(box(0.68, 0.52, 0.05, stopX, Y0 + 2.42, kerbZ - L.Z(0.30), 'stop-flag-edge'), p.trim),
    part(box(0.40, 0.16, 0.05, stopX, Y0 + 2.30, kerbZ - L.Z(0.39), 'stop-legend'), p.trim),
  ]);
  ctx.add(bench(ctx, { x: L.X(4.40), z: kerbZ - L.Z(0.36), w: 1.60, axis: 'x', name: 'stop-bench' }));

  // ── THE BOUNDARY IS PALISADE, NOT PICKET, AND THAT IS AN IDENTITY DECISION. ──
  //
  // The primary school's own note says its picket run is "the one boundary on the board a player
  // reads as protective". A high school's is a 1.9 m steel palisade with a vehicle gate — taller,
  // thinner, and unmistakably not the same object at any zoom. Sorting the three schools apart is
  // §6's contract and the fence is free evidence.
  ctx.add(fenceRun(ctx, {
    x1: -half + 0.35, z1: fenceZ, x2: L.gateX - L.X(1.55), z2: fenceZ,
    style: 'palisade', h: 1.86, name: 'fence-w',
  }));
  ctx.add(fenceRun(ctx, {
    x1: L.gateX + L.X(1.55), z1: fenceZ, x2: half - 0.35, z2: fenceZ,
    style: 'palisade', h: 1.86, name: 'fence-e',
  }));
  ctx.add(gate(ctx, {
    x: L.gateX, z: fenceZ, width: L.X(3.0), h: 1.86, style: 'palisade', name: 'front-gate',
  }));
  // Flank and rear boundary: a low palisade rather than the full street height, so the yard reads
  // as enclosed from above without four walls of steel eating the triangle budget.
  for (const side of [-1, 1]) {
    ctx.add(fenceRun(ctx, {
      x1: side * (half - 0.35), z1: fenceZ - 0.12, x2: side * (half - 0.35), z2: -(E.lotD / 2 - 0.35),
      style: 'palisade', h: 1.10, material: p.trim, name: `fence-flank${side}`,
    }));
  }
  ctx.add(fenceRun(ctx, {
    x1: -(half - 0.35), z1: -(E.lotD / 2 - 0.35), x2: half - 0.35, z2: -(E.lotD / 2 - 0.35),
    style: 'palisade', h: 1.10, material: p.trim, name: 'fence-rear',
  }));

  // The entry forecourt. Laid clear of the stair tower's footprint on the west, because a paver
  // field whose top sits 90 mm above the deck running under a plinth whose base starts 20 mm
  // below it is a coincident-surface fault, and it is invisible until a critic photographs it.
  ctx.add(paverRun(ctx, {
    x0: L.X(-3.05), x1: L.X(6.95), z0: L.Z(3.50), z1: L.Z(6.40), unit: 1.85, joint: 0.035, name: 'forecourt',
  }));
  ctx.add(paverRun(ctx, {
    x0: L.X(-6.95), x1: L.X(-3.15), z0: L.Z(5.98), z1: L.Z(6.40), unit: 1.40, joint: 0.035, name: 'fore-w',
  }));
  // Green between the tower and the west boundary — the one soft frontage on a hard lot.
  ctx.add(lawn(ctx, {
    x: L.X(-5.05), z: L.Z(4.72), w: L.X(3.80), d: L.Z(2.20), tufts: 9, salt: 3400, name: 'front-lawn',
  }));
  ctx.add(hedgeRun(ctx, {
    x: L.X(-5.05), z: L.Z(6.15), w: L.X(3.60), d: L.Z(0.62), h: 0.74, salt: 3418,
  }));
  ctx.add(plantedBed(ctx, {
    x: L.X(6.20), z: L.Z(4.10), w: L.X(1.30), d: L.Z(1.90), salt: 3424, shrubs: 2,
  }));

  // §6E — "a name wall in relief letters". Masonry, standing on the forecourt, facing the street.
  nameWall(ctx, {
    x: L.X(3.10), z: L.Z(3.70), w: L.X(4.60), h: 1.30, name: 'name-wall',
  });
  // §6E — a flagpole. 7.5 m, standing in the columns the tower already owns (u −5.37 against the
  // tower's −9.19 … −4.32), and 5.65 m shorter than the profile above it. It cannot be a tooth.
  ctx.add(flagpole(ctx, { x: L.X(-2.60), z: L.Z(5.20), h: 7.5 }));

  // §6E — a mature street tree. On the footpath, in the tower's columns, 5.4 m against 13.15.
  ctx.add(canopyTree(ctx, {
    x: L.X(-1.60), z: L.Z(6.95), h: 5.40, canopy: 1.70, salt: 3430,
    clearance: (E.lotD / 2) - L.Z(6.95) + 0.9,
  }));
  ctx.add(canopyTree(ctx, {
    x: L.X(-5.40), z: L.Z(5.05), h: 4.60, canopy: 1.42, salt: 3444,
    clearance: E.lotW / 2 - 0.35 - Math.abs(L.X(-5.40)),
  }));
  ctx.add(canopyTree(ctx, {
    x: L.X(5.90), z: L.Z(2.05), h: 4.40, canopy: 1.34, salt: 3458,
    clearance: E.lotW / 2 - 0.35 - Math.abs(L.X(5.90)),
  }));

  // §6E — a bike shelter. A skillion on four posts with two hoop racks under it.
  bikeShelter(ctx, L, { x: L.X(5.35), z: L.Z(5.30), w: L.X(2.90), d: L.Z(1.90) });

  // The east service drive: sealed, jointed, with the bin rank and the one parked vehicle on it.
  ctx.add(sealedSlab(ctx, {
    x: L.yard.x, z: L.yard.z, w: L.yard.w, d: L.yard.d, kerb: true, joints: true, patches: 2,
    name: 'drive',
  }));
  ctx.add(lineMarks(ctx, {
    segments: [
      [L.X(5.30), L.Z(-1.55), L.X(2.90), L.Z(0.11)],
      [L.X(5.30), L.Z(-2.35), L.X(2.90), L.Z(0.11)],
    ],
    y: Y0 + 0.08, wear: 0.25, name: 'bay-mark',
  }));
}

/* ───────────────────────────── the three-storey classroom slab ────────────────────── */

/**
 * §6E — "A three-storey classroom block on the street with a horizontal window band per floor,
 * spandrel panels between them, an expressed concrete frame".
 *
 * THE FRAME IS BUILT AS A FRAME. Five piers stand 0.34 m proud of the wall face over the full
 * height, a floor band runs between them at every level, and the glazing is ONE ribbon per floor
 * with mullion fins in the recess. That is not decoration: `ribbonBand`'s own note records that a
 * ribbon built as N separate windows "costs four times the triangles and reads as a punch grid,
 * which is the wrong building", and a punch grid is precisely what the missionary school and the
 * officer school in the two lanes either side of this one are supposed to be.
 *
 * The spandrels are the second masonry (`wallAlt`, a brick), which is what stops the elevation
 * being one render value from plinth to parapet — the fault §2.9 exists to catch.
 */
function classroomSlab(ctx, E, L) {
  const { p } = ctx;
  const S = L.slab;
  const zF = S.z + S.d / 2;
  const zB = S.z - S.d / 2;
  const top = Y0 + L.wallTop;
  const rise = L.rise;

  // The exposed street elevation is everything east of the tower, which laps x −6.70 … −3.20.
  const openX = L.X(-3.20);
  const ribW = L.X(5.78);
  const ribC = L.X(0.05);
  const ribH = 1.70;
  const entryW = L.X(3.00);
  const entryX = L.X(1.85);
  const entryH = 2.85;
  const g0W = Math.max(1.2, (entryX - entryW / 2) - (openX + 0.30));
  const g0C = (openX + 0.30 + (entryX - entryW / 2)) / 2;

  const front = [
    hole(entryX, Y0, entryW, entryH, 'door'),
    hole(g0C, Y0 + 1.15, g0W, ribH, 'ribbon'),
    hole(ribC, Y0 + rise + 1.15, ribW, ribH, 'ribbon'),
    hole(ribC, Y0 + rise * 2 + 1.15, ribW, ribH, 'ribbon'),
  ];
  const backW = S.w - L.X(2.20);
  const back = [hole(S.x + L.X(-3.10), Y0, 1.86, 2.42, 'door')];
  for (let f = 0; f < 3; f += 1) {
    back.push(hole(S.x + L.X(0.55), Y0 + f * rise + 1.15, backW - L.X(1.6), ribH, 'ribbon'));
  }
  const flankW = S.d - L.Z(1.50);
  const right = [];
  const left = [];
  for (let f = 0; f < 3; f += 1) {
    right.push(hole(S.z, Y0 + f * rise + 1.15, flankW, ribH, 'ribbon'));
    if (f > 0) left.push(hole(S.z, Y0 + f * rise + 1.15, flankW, ribH, 'ribbon'));
  }

  ctx.add(volume(ctx, {
    material: p.wallAlt, sideMaterial: p.wallAlt,
    x: S.x, zFront: zF, zBack: zB, width: S.w, y0: Y0, y1: top,
    front, back, left, right, room: false, name: 'blk',
  }));
  ctx.add(litRoom(ctx, { x: S.x, z: S.z, w: S.w, d: S.d, y0: Y0, y1: top, name: 'blk' }));
  ctx.add(plinthCourse(ctx, {
    x: S.x, z: S.z, w: S.w, d: S.d, yBase: Y0 - 0.02, h: 0.82, proud: 0.13,
    material: p.wall, name: 'blk-plinth',
  }));

  // THE EXPRESSED FRAME. Five piers over the exposed street bay, standing 0.34 proud so they
  // clear the ribbon's own sill (which projects 0.28), plus a floor band at every level. The band
  // is `stringCourse` on the front and the two flanks and NOT on the back, because a projecting
  // course whose face is buried in the walkway roof is twelve triangles of nothing.
  const piers = 5;
  const bayRun = (S.x + S.w / 2 - 0.22) - (openX + 0.22);
  for (let i = 0; i < piers; i += 1) {
    const px = openX + 0.22 + (i / (piers - 1)) * bayRun;
    ctx.add([
      part(slab(L.X(0.44), L.wallTop + 0.16, 0.34, px, Y0, zF + 0.17, 'blk-pier'), p.wall),
      part(slab(L.X(0.50), 0.16, 0.40, px, Y0 + L.wallTop, zF + 0.20, 'blk-pier-cap'), p.trim),
    ]);
  }
  for (let f = 1; f <= 3; f += 1) {
    ctx.add(stringCourse(ctx, {
      x: S.x, z: S.z, w: S.w, d: S.d, y: Y0 + f * rise - 0.08, thick: 0.20, proud: 0.12,
      faces: f === 3 ? 'fbrl' : 'frl', name: `blk-band${f}`,
    }));
  }
  // SPANDREL PANELS between the head of one ribbon and the sill of the next, in the second
  // masonry. This is the surface that carries the building's warm value against the render.
  for (let f = 0; f < 3; f += 1) {
    const y = Y0 + f * rise + 2.85;
    const h = rise - ribH + 0.05;
    ctx.add([
      part(box(ribW - L.X(0.30), h, 0.16, ribC, y + h / 2, zF + 0.08, 'blk-spandrel'), p.wall),
      part(box(backW - L.X(1.9), h, 0.14, S.x + L.X(0.55), y + h / 2, zB - 0.07,
        'blk-spandrel-b'), p.wall),
    ]);
  }

  // The glazing. One band per floor per elevation; the ones on faces the graded stations never
  // reach take `lean`, which drops the jamb returns and the two internal frame rails.
  schoolRibbon(ctx, {
    x: g0C, y: Y0 + 1.15 + ribH / 2, z: zF, w: g0W, h: ribH, bays: 3, id: 'blk-r0',
  });
  for (let f = 1; f < 3; f += 1) {
    schoolRibbon(ctx, {
      x: ribC, y: Y0 + f * rise + 1.15 + ribH / 2, z: zF, w: ribW, h: ribH, bays: 6,
      id: `blk-r${f}`,
    });
  }
  for (let f = 0; f < 3; f += 1) {
    schoolRibbon(ctx, {
      x: S.x + L.X(0.55), y: Y0 + f * rise + 1.15 + ribH / 2, z: zB, w: backW - L.X(1.6), h: ribH,
      bays: 6, face: 'back', lean: true, hopper: false, id: `blk-b${f}`,
    });
    schoolRibbon(ctx, {
      x: S.x + S.w / 2, y: Y0 + f * rise + 1.15 + ribH / 2, z: S.z, w: flankW, h: ribH,
      bays: 3, face: 'right', id: `blk-e${f}`,
    });
    if (f > 0) {
      schoolRibbon(ctx, {
        x: S.x - S.w / 2, y: Y0 + f * rise + 1.15 + ribH / 2, z: S.z, w: flankW, h: ribH,
        bays: 3, face: 'left', lean: true, hopper: false, id: `blk-w${f}`,
      });
    }
  }

  // The main entrance, on the forecourt, under a canopy with the notice case beside it.
  ctx.add(glazedEntry(ctx, {
    x: entryX, y: Y0, z: zF, w: entryW, h: entryH, doorW: 1.86, doorH: 2.38,
    id: 'blk-entry', label: 'Main entrance', sidelights: 2,
  }));
  ctx.add(entryCanopy(ctx, {
    x: entryX, y: Y0 + 3.12, z: zF, w: entryW + 1.10, proj: 1.60, id: 'blk-eyebrow',
  }));
  ctx.add(noticeCase(ctx, {
    x: entryX + entryW / 2 + 0.95, y: Y0 + 1.62, z: zF, w: 1.15, h: 0.95,
  }));
  ctx.add(wallLamp(ctx, { x: entryX - entryW / 2 - 0.85, y: Y0 + 2.72, z: zF + 0.05 }));
  ctx.add(civicDoor(ctx, {
    x: S.x + L.X(-3.10), y: Y0, z: zB, w: 1.86, h: 2.42, facing: 'back',
    id: 'blk-rear-door', label: 'Rear exit',
  }));

  // The parapet, its roof deck, and the plant behind it. A flat parapet is the notch floor and it
  // has to be flat: a monitor or a ridge here would close the gap between the two teeth.
  ctx.add(parapetWithPlant(ctx, L, {
    x: S.x, z: S.z, w: S.w, d: S.d, y: top, parapet: L.parapet,
  }));
  // ── r2: THE NAME GOES ON THE PARAPET AS WELL AS ON THE WALL. ──
  //
  // [SEEN] on the r1 plate the name wall is a 1.3 m object at the bottom of the frame behind a
  // 1.86 m palisade, and the building above it reads as an office block. The one cue that sorts a
  // school from an office at board zoom is a name in relief across the top of the street
  // elevation, and the parapet is 0.75 m of blank render already paid for.
  reliefLegend(ctx, {
    x: S.x + L.X(0.60), y: top + L.parapet * 0.46, z: zF + 0.20, run: L.X(6.20), h: 0.42,
    glyphs: 10, axis: 'z', name: 'blk-name',
  });
  for (const [dx, dz] of [[S.w / 2 - 0.24, zF + 0.10], [-S.w / 2 + 0.24, zF + 0.10]]) {
    ctx.add(downpipe(ctx, { x: S.x + dx, z: dz, y0: Y0, y1: top + 0.30, name: 'blk-dp' }));
  }
}

/**
 * The parapet, its deck, and the plant behind it.
 *
 * `parapetRoof` puts the deck in the roof bucket by default, and its own note records why the
 * community foyer moved off it: at that scale the metal family's albedo "reads as a GRATE rather
 * than as a membrane roof". A 10 × 4.7 m school roof is larger again, so the deck is `ground` —
 * the concrete family, which has no directional rib — and the plant standing on it is what breaks
 * the plane.
 */
function parapetWithPlant(ctx, L, { x, z, w, d, y, parapet }) {
  const { p } = ctx;
  const out = [];
  out.push(part(slab(w - 0.20, 0.14, d - 0.20, x, y, z, 'blk-deck'), p.ground));
  const t = 0.24;
  for (const [pw, pd, px, pz] of [
    [w + t, t, x, z + d / 2 + t / 2],
    [w + t, t, x, z - d / 2 - t / 2],
    [t, d, x + w / 2 + t / 2, z],
    [t, d, x - w / 2 - t / 2, z],
  ]) {
    out.push(part(slab(pw, parapet, pd, px, y, pz, 'blk-para'), p.wall));
    out.push(part(slab(pw + 0.14, 0.13, pd + 0.14, px, y + parapet, pz, 'blk-coping'), p.trim));
  }
  ctx.add(out);
  if (!ctx.mid) return;
  // Rooftop plant on rails behind the parapet: two units, a duct run and a louvred screen.
  const py = y + 0.14;
  ctx.add([
    part(slab(L.X(1.55), 0.16, L.Z(1.05), x + L.X(1.30), py, z, 'blk-plant-base'), p.metal),
    part(slab(L.X(1.35), 0.72, L.Z(0.86), x + L.X(1.30), py + 0.16, z, 'blk-plant'), p.trim),
    part(slab(L.X(1.05), 0.16, L.Z(0.90), x + L.X(3.40), py, z + L.Z(0.30), 'blk-plant-base'), p.metal),
    part(slab(L.X(0.90), 0.58, L.Z(0.74), x + L.X(3.40), py + 0.16, z + L.Z(0.30), 'blk-plant'), p.trim),
    part(box(L.X(2.30), 0.30, L.Z(0.30), x + L.X(2.35), py + 0.62, z - L.Z(0.10), 'blk-duct'), p.metal),
  ]);
  ctx.add(louvreScreen(ctx, {
    x: x + L.X(-2.60), y: py, z: z - L.Z(0.20), w: L.X(2.20), h: 0.92, axis: 'x', name: 'blk-screen',
  }));
}

/* ───────────────────────────────── the stair tower ────────────────────────────────── */

/**
 * §6E — "a projecting stair tower with vertical glazing that breaks the block. The stair tower is
 * the primary school's opposite: that building is a chain of low pavilions, this one is a single
 * upright slab with one vertical incident."
 *
 * IT IS THE TALLEST THING ON THE LOT AND ITS COLUMNS ARE ITS OWN. It stands at u −6.75, 12.4 u
 * clear of the gym's centre, and it rises 3.25 m above the parapet it interrupts. That is tooth
 * one, and unlike the primary school's it is a building rather than a mast.
 *
 * THE STAIR IS INSIDE IT AND YOU CAN SEE IT. `room: false`, because `volume`'s dark room box would
 * fill the shaft and hide the flights; the mass is closed on three sides by its own walls and by
 * the slab's front wall standing in it, and a shadow plane guarantees the flights read against a
 * dark ground rather than against a lit one. Six flights and three landings, 108 triangles, and it
 * is the single object that says STAIR TOWER instead of LIFT SHAFT.
 */
function stairTower(ctx, E, L) {
  const { p } = ctx;
  const T = L.tower;
  const zF = T.z + T.d / 2;
  const zB = T.z - T.d / 2;
  const top = Y0 + (E.towerTop ?? 12.30);
  const slotW = T.w - L.X(1.08);
  const slotY = Y0 + 0.95;
  const slotH = (E.towerTop ?? 12.30) - 1.60;
  // r2: the flank slot narrows from `d − 1.0` to `d − 1.6`. Full-height glazing on three faces of
  // an open shaft makes the tower see-through — the east slot looks straight out of the west one —
  // and on the r1 plate it read as an office curtain wall wrapping a corner rather than as a
  // stair. A stair tower is glazed on its FACE and slotted on its flanks.
  const sideW = T.d - L.Z(1.60);

  ctx.add(volume(ctx, {
    material: p.wall, sideMaterial: p.wall,
    x: T.x, zFront: zF, zBack: zB, width: T.w, y0: Y0, y1: top,
    front: [hole(T.x, slotY, slotW, slotH, 'ribbon')],
    right: [hole(T.z, slotY, sideW, slotH, 'ribbon')],
    left: [hole(T.z, slotY, sideW, slotH, 'ribbon')],
    room: false, name: 'twr',
  }));
  ctx.add(plinthCourse(ctx, {
    x: T.x, z: T.z, w: T.w, d: T.d, yBase: Y0 - 0.02, h: 0.82, proud: 0.13,
    material: p.wallAlt, name: 'twr-plinth',
  }));
  // ── THE SHAFT BACKING IS BRICK, NOT THE SHADOW BUCKET, AND THAT IS THE CRUSH FINDING APPLIED. ──
  //
  // The orchestrator's round-1 census measures Monopoly Plus at 1.2-1.8 % of subject pixels under
  // luma 12 against our lanes' 7-13 %, and names recessed geometry as where we manufacture it.
  // A 2.4 m deep glazed shaft is exactly that geometry. A `shadow`-bucket plane behind the glass
  // would be an unlit surface in the darkest family on the model seen through a reveal — three
  // multipliers on the same pixel. The backing is the second masonry instead, so the shaft bottoms
  // out on a warm mid value and the pale flights still read against it.
  ctx.add([
    part(box(T.w - 0.62, slotH + 0.30, 0.10, T.x, slotY + slotH / 2, zB + 0.42, 'twr-shaft'), p.trim),
  ]);
  // r2: two more of the same, inboard of the flank slots, so a slot on any face bottoms out on a
  // pale surface 0.5 m behind the glass rather than on the sky through the far wall.
  for (const side of [-1, 1]) {
    ctx.add([
      part(box(0.10, slotH + 0.30, T.d - 0.55, T.x + side * (T.w / 2 - 0.52),
        slotY + slotH / 2, T.z, 'twr-liner'), p.trim),
    ]);
  }
  stairFlights(ctx, L, {
    x: T.x, z: T.z, w: T.w - L.X(1.90), d: T.d - L.Z(0.90), y0: Y0 + 0.30, flights: 6,
    rise: L.rise / 2,
  });

  // r3: the slot is the same construction as a classroom band — shallow set-back, pale mullions
  // standing proud, a transom at every half flight — because it failed the crush census for the
  // same reason and it is the tallest single glass area on the model.
  schoolRibbon(ctx, {
    x: T.x, y: slotY + slotH / 2, z: zF, w: slotW, h: slotH, bays: 3, hopper: false,
    transomStep: L.rise / 2, id: 'twr-slot',
  });
  for (const [face, px] of [['right', T.x + T.w / 2], ['left', T.x - T.w / 2]]) {
    schoolRibbon(ctx, {
      x: px, y: slotY + slotH / 2, z: T.z, w: sideW, h: slotH, bays: 2, hopper: false,
      lean: face === 'left', transomStep: L.rise / 2, face, id: `twr-slot-${face}`,
    });
  }

  // The crown: a projecting coping, a lift-and-tank overrun set back behind it, and a louvred
  // face on the overrun. Top lands at 13.15 above the deck.
  ctx.add([
    part(slab(T.w + 0.40, 0.30, T.d + 0.36, T.x, top, T.z, 'twr-coping'), p.trim),
    part(slab(T.w - L.X(1.30), 0.55, T.d - L.Z(0.90), T.x, top + 0.30, T.z - L.Z(0.10),
      'twr-overrun'), p.wallAlt),
    part(slab(T.w - L.X(1.00), 0.12, T.d - L.Z(0.60), T.x, top + 0.85, T.z - L.Z(0.10),
      'twr-overrun-cap'), p.trim),
  ]);
  ctx.add(louvreScreen(ctx, {
    x: T.x, y: top + 0.34, z: T.z - L.Z(0.10) + (T.d - L.Z(0.90)) / 2, w: T.w - L.X(1.60), h: 0.46,
    axis: 'x', blades: 3, name: 'twr-louvre',
  }));
  ctx.add(downpipe(ctx, {
    x: T.x + T.w / 2 - 0.16, z: zF + 0.06, y0: Y0, y1: top + 0.24, name: 'twr-dp',
  }));
  ctx.add(civicDoor(ctx, {
    x: T.x - T.w / 2, y: Y0, z: T.z - L.Z(0.55), w: 1.10, h: 2.32, facing: 'left',
    id: 'twr-door', label: 'Stair exit', interactive: false,
  }));
}

/**
 * A run of stair flights and half landings inside a shaft. Pale concrete, so it reads through the
 * glazing against the shadow plane behind it.
 */
function stairFlights(ctx, L, { x, z, w, d, y0, flights, rise }) {
  const { p } = ctx;
  const out = [];
  const run = d * 0.78;
  const angle = Math.atan2(rise, run);
  const len = Math.hypot(rise, run);
  for (let i = 0; i < flights; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const yBase = y0 + i * rise;
    out.push(part(rotBox(w * 0.44, 0.16, len, x + side * w * 0.26, yBase + rise / 2, z,
      { x: side * angle }, 'twr-flight'), p.trim));
    out.push(part(slab(w * 0.94, 0.16, d * 0.20, x, yBase + rise - 0.16,
      z + (side < 0 ? -1 : 1) * d * 0.39, 'twr-landing'), p.trim));
    if (!ctx.detail) continue;
    out.push(part(rotBox(0.07, 0.07, len, x + side * w * 0.46, yBase + rise / 2 + 0.90, z,
      { x: side * angle }, 'twr-rail'), p.metal));
  }
  ctx.add(out);
}

/* ───────────────────────────────── the gymnasium ──────────────────────────────────── */

/**
 * §6E — "A gymnasium at the rear, taller floor-to-floor than the classrooms, with high clerestory
 * windows and a mono or barrel roof."
 *
 * THE ARCH IS THE SECOND TOOTH AND IT IS WHY IT IS AN ARCH. The classroom parapet is flat at
 * 9.90 and the gym springs at 8.60 and arcs to 11.60, so the profile steps DOWN from the tower to
 * the slab and back UP over the gym. A gable here would put a triangle on the board beside the
 * primary school's two, and a skillion would repeat its junior wing; a segmental arch on a
 * double-height hall repeats neither, and §6E names it.
 *
 * ONE TALL ROOM, SO NO FLOOR LINE. The wall carries a base course, ONE string course at 4.35 m as
 * a wall break rather than a floor, and a clerestory ribbon at 6.90 m — above head height, which
 * is what a hall's glazing is. The primary school's own r6 note is the reason the string course
 * is not at a storey height: "a horizontal at floor level is the strongest two-storey cue a brick
 * box has", and this mass must not read as two levels.
 */
function gymnasium(ctx, E, L) {
  const { p } = ctx;
  const G = L.gym;
  const zF = G.z + G.d / 2;
  const zB = G.z - G.d / 2;
  const eave = E.gymEave ?? 8.60;
  const top = Y0 + eave;
  const clerY = Y0 + 6.60;
  const clerH = 1.45;
  const clerW = G.w - L.X(1.60);
  const flankW = G.d - L.Z(1.20);

  const front = [
    hole(G.x - G.w / 2 + L.X(1.35), Y0, 2.10, 2.62, 'door'),
    hole(G.x + L.X(0.55), clerY, clerW - L.X(1.2), clerH, 'ribbon'),
  ];
  const back = [hole(G.x, clerY, clerW - L.X(1.2), clerH, 'ribbon')];
  const right = [hole(G.z, clerY, flankW, clerH, 'ribbon')];
  const left = [hole(G.z, clerY, flankW, clerH, 'ribbon')];

  ctx.add(volume(ctx, {
    material: p.wallAlt, sideMaterial: p.wallAlt,
    x: G.x, zFront: zF, zBack: zB, width: G.w, y0: Y0, y1: top,
    front, back, left, right, room: false, name: 'gym',
  }));
  ctx.add(litRoom(ctx, { x: G.x, z: G.z, w: G.w, d: G.d, y0: Y0, y1: top, name: 'gym' }));
  ctx.add(plinthCourse(ctx, {
    x: G.x, z: G.z, w: G.w, d: G.d, yBase: Y0 - 0.02, h: 1.05, proud: 0.13,
    material: p.wall, name: 'gym-plinth',
  }));
  ctx.add(stringCourse(ctx, {
    x: G.x, z: G.z, w: G.w, d: G.d, y: Y0 + 4.35, thick: 0.22, proud: 0.13, faces: 'frl',
    name: 'gym-band',
  }));
  // A brick panel between the base course and the string course on the two seen elevations, so
  // the tallest blank wall on the lot is two materials rather than one.
  ctx.add([
    part(box(G.w - L.X(1.10), 3.10, 0.15, G.x, Y0 + 2.72, zF + 0.075, 'gym-panel'), p.wall),
    part(box(0.15, 3.10, G.d - L.Z(0.90), G.x + G.w / 2 + 0.075, Y0 + 2.72, G.z,
      'gym-panel-e'), p.wall),
  ]);

  // ── r2: THE VAULT HAD NO ENDS, AND IT WAS THE WORST THING ON THE r1 PLATE. ──
  //
  // [SEEN] on `laneE-r1/school-high--three-quarter.png`: the arch reads as a detached croissant
  // hovering over the lot with a black cavern under its west end. `barrelRoof` emits five facets,
  // two fascias and two gutters and NOTHING AT EITHER END — the primary school's gables are closed
  // by the CALLER (`school.js` adds `triPlateZ` tympana and says so), and a barrel carries the same
  // obligation. An open drum seen end-on is a hole through the envelope, which is §1.2's major, and
  // it is also the largest single black region in the r1 census.
  //
  // `arcEndPlate` is the primitive for it. The plate's span is the WALL width rather than the
  // roof's, and its rise is 0.94 of the roof's, so the tympanum sits inside the vault's own solid
  // at every point instead of breaking through it at the crown — the discipline `school.js` states
  // for its own gable infill.
  // ── r3: THE END PLATE HAS TO BE THE ROOF'S OWN ARC, AND r2 PROVED IT THE EXPENSIVE WAY. ──
  //
  // r2 closed the drum with `arcEndPlate(w, rise × 0.94)` on the reasoning that the primary school
  // keeps its gable infill inside the roof's solid. That reasoning is right for a TRIANGLE and
  // wrong for an ARC. `barrelRoof` strikes its circle through `span = w + 2·overhang`, so at
  // overhang 0.34 the roof arc passes through (±4.09, 8.94) with r 4.554, while a plate struck
  // through (±3.75, 8.94) with r 4.132 sits BELOW it everywhere except the crown — 0.58 m below at
  // the springing. The crush map on the r2 plate shows exactly that: a magenta crescent hugging the
  // inside of the arc from ten o'clock down to eight. Closing an arch with a smaller arch leaves a
  // lune, and a lune is still a hole.
  //
  // Two arcs of the SAME span through the SAME springing points cannot cross. So the overhang comes
  // down to 0.14, the plate takes `w + 0.28` — the roof's own span — and its rise is 0.10 shy of
  // the roof's, which puts it below the roof's centre-arc at the crown and exactly on it at the
  // ends, where the roof's own 0.16 thickness covers it.
  const arch = E.gymArch ?? 2.55;
  const archOver = 0.14;
  ctx.add(barrelRoof(ctx, {
    w: G.w, d: G.d, x: G.x, z: G.z, springY: top, rise: arch, facets: 6,
    overhang: archOver, name: 'gym-arch',
  }));
  for (const [pz, mat, nm] of [
    [zF - 0.20, p.trim, 'gym-tymp-f'], [zB + 0.20, p.wall, 'gym-tymp-b'],
  ]) {
    ctx.add([part(arcEndPlate(G.w + archOver * 2, arch - 0.10, 0.38, G.x, top, pz, nm, 11), mat)]);
  }
  // A louvred vent in the street tympanum — the object that stops a 7.5 m arc of brick being one
  // flat field, and what a hall's roof space is actually ventilated by.
  ctx.add(louvreScreen(ctx, {
    x: G.x, y: top + 0.38, z: zF - 0.02, w: L.X(1.80), h: 0.82, axis: 'x', blades: 4,
    name: 'gym-vent',
  }));
  ctx.add([
    part(box(L.X(2.05), 0.16, 0.15, G.x, top + 0.30, zF - 0.02, 'gym-vent-sill'), p.trim),
    part(box(L.X(2.05), 0.16, 0.15, G.x, top + 1.28, zF - 0.02, 'gym-vent-head'), p.trim),
  ]);

  schoolRibbon(ctx, {
    x: G.x + L.X(0.55), y: clerY + clerH / 2, z: zF, w: clerW - L.X(1.2), h: clerH, bays: 6,
    hopper: false, id: 'gym-cler-f',
  });
  schoolRibbon(ctx, {
    x: G.x, y: clerY + clerH / 2, z: zB, w: clerW - L.X(1.2), h: clerH, bays: 5, face: 'back',
    lean: true, hopper: false, id: 'gym-cler-b',
  });
  schoolRibbon(ctx, {
    x: G.x + G.w / 2, y: clerY + clerH / 2, z: G.z, w: flankW, h: clerH, bays: 3, face: 'right',
    hopper: false, id: 'gym-cler-e',
  });
  schoolRibbon(ctx, {
    x: G.x - G.w / 2, y: clerY + clerH / 2, z: G.z, w: flankW, h: clerH, bays: 3, face: 'left',
    lean: true, hopper: false, id: 'gym-cler-w',
  });
  ctx.add(civicDoor(ctx, {
    x: G.x - G.w / 2 + L.X(1.35), y: Y0, z: zF, w: 2.10, h: 2.62, id: 'gym-door',
    label: 'Gymnasium',
  }));
  ctx.add(wallLamp(ctx, { x: G.x - G.w / 2 + L.X(1.35) + 1.60, y: Y0 + 3.05, z: zF + 0.05 }));
  ctx.add(civicWindow(ctx, {
    x: G.x + L.X(2.30), y: Y0 + 2.10, z: zF, w: 1.30, h: 1.55, lights: 2, interactive: true,
    id: 'gym-sash', label: 'Gymnasium window',
  }));
  ctx.add(downpipe(ctx, {
    x: G.x + G.w / 2 - 0.20, z: zF + 0.08, y0: Y0, y1: top + 0.16, name: 'gym-dp',
  }));
  ctx.add(downpipe(ctx, {
    x: G.x - G.w / 2 + 0.20, z: zF + 0.08, y0: Y0, y1: top + 0.16, name: 'gym-dp',
  }));
}

/* ───────────────────────── the covered walkway between them ───────────────────────── */

/**
 * §6E — "A covered walkway connecting them across a hard court."
 *
 * ITS HEIGHT IS A SILHOUETTE DECISION AND IT IS NOT THE ONE THE PRIMARY SCHOOL MADE. There the
 * walkway crosses the notch bands and had to stay under them; here it stands at 2.90 m in columns
 * whose profile is 9.90 m of classroom slab, so it cannot reach a notch at any height and it is
 * set at the height a school walkway actually is. It carries no ground slab of its own — it stands
 * on the yard — because two ground surfaces at one height over one plan is a z-fight and that is
 * the exact fault the primary school's r5 found under its own walkway.
 */
function coveredWalkway(ctx, E, L) {
  const { p } = ctx;
  const yLow = Y0 + (E.colaHeight ?? 2.90);
  const S = L.slab;
  const G = L.gym;
  const zN = S.z - S.d / 2 - 0.05;
  const zS = G.z + G.d / 2 + 0.05;
  const d = zN - zS;
  const cz = (zN + zS) / 2;
  const x0 = L.X(-6.20);
  const x1 = L.X(0.90);
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const fall = 0.24;

  ctx.add([part(rampSolid(w, d, fall, cx, yLow, cz, -1, 'cola-wedge'), p.trim)]);
  ctx.add(seamSkillion(ctx, {
    w, d, x: cx, z: cz, lowY: yLow, fall: -fall, overhang: 0.26, seamPitch: 1.05, name: 'cola',
  }));
  const posts = Math.max(3, Math.round(w / 2.4));
  for (let i = 0; i < posts; i += 1) {
    const px = x0 + 0.35 + (i / (posts - 1)) * (w - 0.70);
    ctx.add([
      part(slab(0.15, yLow - Y0 - 0.10, 0.15, px, Y0, zS + 0.16, 'cola-post'), p.metal),
      part(slab(0.28, 0.12, 0.28, px, Y0, zS + 0.16, 'cola-foot'), p.ground),
    ]);
  }
  ctx.add([
    part(box(w, 0.22, 0.16, cx, yLow - 0.16, zS + 0.16, 'cola-beam'), p.trim),
  ]);
  if (ctx.mid) {
    const batts = Math.max(4, Math.round(w / 1.1));
    for (let i = 0; i < batts; i += 1) {
      const bx = x0 + (i + 0.5) * (w / batts);
      ctx.add([part(box(0.09, 0.10, d - 0.10, bx, yLow - 0.30, cz, 'cola-batten'), p.trim)]);
    }
  }
}

/* ───────────────────────────────────── the grounds ────────────────────────────────── */

/**
 * §6E — "an asphalt court with painted markings and two rings, a small ball-sport goal, tiered
 * seating steps, a rubbish-bin rank."
 */
function grounds(ctx, E, L) {
  const { p } = ctx;
  const C = L.court;

  // The walkway strip and the court are two rectangles that SHARE AN EDGE rather than overlap.
  ctx.add(sealedSlab(ctx, {
    x: L.link.x, z: L.link.z, w: L.link.w, d: L.link.d, kerb: false, joints: false, patches: 1,
    name: 'link',
  }));
  ctx.add(sealedSlab(ctx, {
    x: C.x, z: C.z, w: C.w, d: C.d, kerb: false, joints: true, patches: 3, name: 'court',
  }));

  // Markings. `y` is the top of a `sealedSlab` laid on the deck, and the paint embeds into it.
  const mY = Y0 + 0.08;
  const inset = 0.30;
  const cw = C.w - inset * 2;
  const cd = C.d - inset * 2;
  const segs = [
    [C.x, C.z + cd / 2, cw, 0.11],
    [C.x, C.z - cd / 2, cw, 0.11],
    [C.x - cw / 2, C.z, 0.11, cd],
    [C.x + cw / 2, C.z, 0.11, cd],
    [C.x, C.z, cw, 0.11],
  ];
  // Two keys, under the two rings.
  for (const kx of [C.x - cw * 0.26, C.x + cw * 0.26]) {
    segs.push([kx - L.X(0.80), C.z - cd / 2 + L.Z(0.90), 0.10, L.Z(1.80)]);
    segs.push([kx + L.X(0.80), C.z - cd / 2 + L.Z(0.90), 0.10, L.Z(1.80)]);
    segs.push([kx, C.z - cd / 2 + L.Z(1.80), L.X(1.70), 0.10]);
  }
  ctx.add(lineMarks(ctx, { segments: segs, y: mY, wear: 0.20, name: 'court-line' }));
  ctx.add(lineCircle(ctx, { x: C.x, z: C.z, r: Math.min(cw, cd) * 0.22, bars: 10, y: mY }));

  // §6E — TWO RINGS. `goalPost` faces along z, so both stand on the rear line facing the court,
  // which is what a schoolyard practice pair actually is.
  for (const gx of [C.x - cw * 0.26, C.x + cw * 0.26]) {
    ctx.add(goalPost(ctx, { x: gx, z: C.z - cd / 2 - L.Z(0.18), facing: 1, h: 3.05 }));
  }
  // §6E — a small ball-sport goal, against the west boundary at the far end of the court.
  ballGoal(ctx, L, { x: C.x - C.w / 2 + L.X(0.55), z: C.z + L.Z(0.30), h: 2.05, w: L.Z(2.40) });

  // §6E — tiered seating steps, facing the court from the east, between it and the gym.
  tieredStand(ctx, L, {
    x: L.stand.x, z: L.stand.z, w: L.stand.w, d: L.stand.d, tiers: 3, facing: -1,
  });

  // §6E — a rubbish-bin rank, on the service drive.
  for (let i = 0; i < 3; i += 1) {
    ctx.add(bin(ctx, { x: L.X(6.35), z: L.Z(0.55 - i * 0.85), name: `rank${i}` }));
  }
  ctx.add([part(slab(L.X(0.16), 1.05, L.Z(2.60), L.X(6.72), Y0, L.Z(-0.30), 'rank-rail'), p.metal)]);

  // Planting against the rear boundary, where the court's west end meets the fence.
  for (const [sx, sz, r] of [
    [L.X(-6.45), L.Z(-2.05), 0.48], [L.X(-6.55), L.Z(-6.35), 0.52], [L.X(-0.15), L.Z(-1.95), 0.44],
  ]) {
    ctx.add(shrubMass(ctx, { x: sx, z: sz, r, h: 0.84 }));
  }
}

/* ─────────────────────────────────── local components ─────────────────────────────── */

/**
 * §6E — a name wall in relief letters. Masonry with a coping, standing on the forecourt.
 *
 * THE LETTERS ARE BLOCKS OF UNEQUAL WIDTH, NOT A LEGEND BAR. `core.js`'s signage note derives the
 * board scale as 7.33 px/m, so a 0.46 m letter is 3.4 px and a 4.3 m band of them is 31 px — which
 * is a WORD at board zoom and individual letters at the detail station. That two-scale read is the
 * same argument `iconRoundel` makes for its disc-in-disc, applied to a name.
 */
function nameWall(ctx, { x, z, w, h, name }) {
  const { p } = ctx;
  const out = [
    part(slab(w + 0.30, 0.18, 0.62, x, Y0 - 0.02, z, `${name}-toe`), p.wallAlt),
    part(slab(w, h, 0.44, x, Y0 + 0.14, z, `${name}-wall`), p.wallAlt),
    part(slab(w + 0.20, 0.14, 0.58, x, Y0 + 0.14 + h, z, `${name}-coping`), p.trim),
    part(slab(w - 0.30, 0.10, 0.10, x, Y0 + 0.30, z + 0.26, `${name}-base-line`), p.trim),
  ];
  ctx.add(out);
  reliefLegend(ctx, {
    x, y: Y0 + 0.14 + h * 0.60, z: z + 0.265, run: w - 0.60, h: 0.42, glyphs: 9,
    name: `${name}-l`,
  });
}

/**
 * A run of relief letters on a face. Blocks of unequal width with real gaps, standing proud.
 *
 * `core.js`'s signage note derives the board scale at 7.33 px/m, so a 0.42 m letter is 3.1 px and
 * a 6.2 m run of them is 45 px — a WORD at board zoom and individual letters at the detail
 * station. That two-scale read is the argument `iconRoundel` makes for its disc-in-disc, applied
 * to a name. It is also why this is not a legend bar: a bar says "there is text here", and a school
 * on a board has to say "this is a school".
 */
function reliefLegend(ctx, { x, y, z, run, h, glyphs = 10, axis = 'z', name = 'legend' }) {
  const { p } = ctx;
  const widths = [];
  for (let i = 0; i < glyphs; i += 1) {
    widths.push(0.62 + inst(ctx, `${name}-g${i}`, 3462) * 0.55);
  }
  const total = widths.reduce((a, b) => a + b, 0);
  const gap = 0.30;
  const k = (run - gap * (glyphs - 1)) / total;
  const out = [];
  let cursor = (axis === 'z' ? x : z) - run / 2;
  for (let i = 0; i < glyphs; i += 1) {
    const gw = Math.max(0.12, widths[i] * k);
    out.push(part(axis === 'z'
      ? box(gw, h, 0.09, cursor + gw / 2, y, z, `${name}-glyph`)
      : box(0.09, h, gw, x, y, cursor + gw / 2, `${name}-glyph`), p.trim));
    cursor += gw + gap;
  }
  ctx.add(out);
}

/** A skillion bike shelter with two hoop racks under it. */
function bikeShelter(ctx, L, { x, z, w, d }) {
  const { p } = ctx;
  const yLow = Y0 + 2.28;
  ctx.add([part(rampSolid(w, d, 0.30, x, yLow, z, 1, 'bike-wedge'), p.trim)]);
  ctx.add(seamSkillion(ctx, {
    w, d, x, z, lowY: yLow, fall: 0.30, overhang: 0.22, seamPitch: 0.9, name: 'bike-roof',
  }));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      ctx.add([
        part(slab(0.13, 2.18, 0.13, x + sx * (w / 2 - 0.24), Y0, z + sz * (d / 2 - 0.20),
          'bike-post'), p.metal),
      ]);
    }
  }
  ctx.add(bikeRack(ctx, { x: x - L.X(0.68), z, hoops: 3 }));
  ctx.add(bikeRack(ctx, { x: x + L.X(0.68), z, hoops: 3 }));
}

/** Tiered seating steps facing the court. `facing` is the direction the treads look. */
function tieredStand(ctx, L, { x, z, w, d, tiers, facing }) {
  const { p } = ctx;
  const out = [];
  const step = w / tiers;
  for (let i = 0; i < tiers; i += 1) {
    const h = 0.42 * (i + 1);
    const tx = x - facing * (w / 2 - step * (i + 0.5));
    out.push(part(slab(step, h, d, tx, Y0 - 0.02, z, 'stand-riser'), p.wallAlt));
    out.push(part(slab(step + 0.05, 0.09, d + 0.06, tx, Y0 - 0.02 + h, z, 'stand-tread'), p.trim));
  }
  out.push(part(slab(0.14, 0.42 * tiers + 0.55, d + 0.10, x + facing * (w / 2 + 0.07), Y0 - 0.02, z,
    'stand-cheek'), p.wallAlt));
  ctx.add(out);
  ctx.add(steelRail(ctx, {
    x: x - facing * (w / 2 + 0.10), y: Y0 + 0.02, z, w: d, axis: 'z', h: 0.96, name: 'stand-rail',
  }));
}

/** A small ball-sport goal — two posts, a crossbar and a hint of net. */
function ballGoal(ctx, L, { x, z, h, w }) {
  const { p } = ctx;
  const out = [
    part(slab(0.12, h, 0.12, x, Y0, z - w / 2, 'goal-post'), p.trim),
    part(slab(0.12, h, 0.12, x, Y0, z + w / 2, 'goal-post'), p.trim),
    part(box(0.12, 0.12, w + 0.12, x, Y0 + h, z, 'goal-bar'), p.trim),
  ];
  if (ctx.mid) {
    for (let i = 0; i < 4; i += 1) {
      const nz = z - w / 2 + (i + 0.5) * (w / 4);
      out.push(part(rotBox(0.06, h * 0.86, 0.06, x - 0.28, Y0 + h * 0.44, nz, { z: 0.30 },
        'goal-net'), p.metal));
    }
    out.push(part(box(0.60, 0.08, w, x - 0.30, Y0 + h - 0.10, z, 'goal-net-top'), p.metal));
  }
  ctx.add(out);
}

/**
 * A standing or seated figure. Four boxes, deterministic, in buckets the model already carries.
 *
 * §5 of the lane brief asks that the lot be INHABITED, and the reference frames all carry people.
 * A school without students on it is the one subject on the board where the absence is loud.
 */
function figure(ctx, { x, z, y = Y0, yaw = 0, h = 1.62, tag = 'fig', shirt = null, seated = false }) {
  const { p } = ctx;
  const s = h / 1.62;
  const tone = shirt ?? (inst(ctx, tag, 3401) > 0.5 ? p.accent : p.trim);
  const out = [];
  const yw = yaw + (inst(ctx, tag, 3403) - 0.5) * 0.9;
  if (seated) {
    out.push(part(rotBox(0.36 * s, 0.34 * s, 0.46 * s, x, y + 0.60 * s, z, { y: yw }, `${tag}-leg`), p.metal));
    out.push(part(rotBox(0.40 * s, 0.56 * s, 0.28 * s, x, y + 1.02 * s, z - 0.14 * s, { y: yw }, `${tag}-body`), tone));
    out.push(part(rotBox(0.20 * s, 0.22 * s, 0.20 * s, x, y + 1.40 * s, z - 0.14 * s, { y: yw }, `${tag}-head`), p.trim));
    ctx.add(out);
    return;
  }
  out.push(part(rotBox(0.34 * s, 0.76 * s, 0.24 * s, x, y + 0.38 * s, z, { y: yw }, `${tag}-leg`), p.metal));
  out.push(part(rotBox(0.42 * s, 0.58 * s, 0.27 * s, x, y + 1.05 * s, z, { y: yw }, `${tag}-body`), tone));
  out.push(part(rotBox(0.21 * s, 0.23 * s, 0.21 * s, x, y + 1.46 * s, z, { y: yw }, `${tag}-head`), p.trim));
  if (ctx.detail) {
    out.push(part(rotBox(0.26 * s, 0.32 * s, 0.16 * s, x, y + 1.02 * s, z - 0.20 * s, { y: yw },
      `${tag}-bag`), p.wallAlt));
  }
  ctx.add(out);
}

/** A small parked hatchback on the service drive. */
function parkedCar(ctx, L, { x, z, yaw = 0 }) {
  const { p } = ctx;
  const out = [
    part(rotBox(L.X(1.66), 0.62, L.Z(3.60), x, Y0 + 0.52, z, { y: yaw }, 'car-body'), p.accent),
    part(rotBox(L.X(1.44), 0.52, L.Z(1.90), x, Y0 + 1.06, z - L.Z(0.18), { y: yaw }, 'car-cabin'), p.trim),
    part(rotBox(L.X(1.48), 0.34, L.Z(1.72), x, Y0 + 1.04, z - L.Z(0.18), { y: yaw }, 'car-glass'), p.glass),
    part(rotBox(L.X(1.70), 0.16, L.Z(2.10), x, Y0 + 0.30, z, { y: yaw }, 'car-sill'), p.metal),
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      out.push(part(cyl(0.28, 0.20, x + sx * L.X(0.78), Y0 + 0.28, z + sz * L.Z(1.22), 'x',
        'car-wheel', 7), p.metal));
    }
  }
  ctx.add(out);
}

/* ─────────────────────────────────── inhabitation ─────────────────────────────────── */

function inhabit(ctx, E, L) {
  if (!ctx.mid) return;
  const { p } = ctx;
  const C = L.court;
  // Students on the forecourt, at the gate, under the walkway and on the stand; one adult by the
  // entrance. Positions are authored against the plan, not scattered, so nobody stands in a wall.
  figure(ctx, { x: L.X(2.40), z: L.Z(4.55), yaw: 0.4, h: 1.58, tag: 'stu-a' });
  figure(ctx, { x: L.X(3.05), z: L.Z(4.35), yaw: -0.7, h: 1.64, tag: 'stu-b', shirt: p.wallAlt });
  figure(ctx, { x: L.X(1.10), z: L.Z(5.80), yaw: 2.6, h: 1.52, tag: 'stu-c' });
  figure(ctx, { x: L.X(5.90), z: L.Z(6.05), yaw: 3.0, h: 1.70, tag: 'stu-d', shirt: p.trim });
  figure(ctx, { x: L.X(-2.20), z: L.Z(-2.15), yaw: 1.4, h: 1.60, tag: 'stu-e' });
  figure(ctx, { x: L.X(-3.05), z: L.Z(-2.05), yaw: -1.5, h: 1.55, tag: 'stu-f', shirt: p.wallAlt });
  figure(ctx, { x: C.x + L.X(0.60), z: C.z + L.Z(0.90), yaw: 2.2, h: 1.66, tag: 'stu-g' });
  figure(ctx, {
    x: L.stand.x - L.X(0.30), z: L.stand.z + L.Z(0.70), yaw: -1.6, h: 1.58, tag: 'stu-h',
    y: Y0 + 0.42, seated: true,
  });
  figure(ctx, {
    x: L.stand.x - L.X(0.30), z: L.stand.z - L.Z(0.55), yaw: -1.6, h: 1.54, tag: 'stu-i',
    y: Y0 + 0.42, seated: true, shirt: p.wallAlt,
  });
  figure(ctx, { x: L.X(4.30), z: L.Z(6.35), yaw: 1.9, h: 1.60, tag: 'stu-j', seated: true, y: Y0 + 0.42 });
  parkedCar(ctx, L, { x: L.X(5.30), z: L.Z(-1.95), yaw: 0.02 });
}

export default buildHighSchool;
