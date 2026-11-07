// District Deck V3.41 — MP9 lane G: `officer-school`. Military officer training school.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE PLAN IS THE IDENTITY, AND THE PLAN IS A VOID IN FRONT OF A SYMMETRICAL BLOCK.
//
// Until this file, `school-high`, `missionary-school` and `officer-school` were all
// `civic/school.js` — ONE primary-school model with three different words on a sign plate. The
// baseline plate for this lane is `r0-baseline/school-high--three-quarter.png`, which is that
// primary school: a chain of three low domestic-scale pavilions stepping down a lot, with a ball
// court and a play structure. Nothing in it is military and nothing in it is symmetrical.
//
//   THE SILHOUETTE ARGUMENT, r1
//
//   1. THE PARADE GROUND IS THE IDENTITY. A large formal sealed rectangle — 11.8 × 10.15 m, with
//      a painted saluting line, a reviewing dais, two flag masts and a formed-up squad — owns the
//      near half of the lot. Nothing else on the board is a formal paved VOID. Read from above,
//      which is how a board is read, a parade ground in front of a symmetrical block is a
//      military school and nothing else. Its cost in the plate is stated below and it is paid
//      deliberately: the officer school's signature is 7.4 plate-columns of near-empty deck.
//   2. STRICT SYMMETRY ABOUT x = 0. Two sibling lanes are building the other two schools
//      concurrently and both are asymmetric by construction — lane E is a slab with an offset
//      glazed stair tower, lane F is a chapel-and-schoolroom L with a spire. This one is a
//      Palladian three-part front: gabled end pavilions, a colonnaded verandah, a pedimented
//      centrepiece with a clock and a crest, a hipped roof with paired brick chimneys, and a
//      louvred cupola on the ridge dead centre. All three must be sortable in profile alone and
//      symmetry is what sorts this one.
//   3. THE DRILL HALL IS THE BACK SHOULDER. Wide-span faceted barrel, high clerestory bands,
//      taller than the barracks hip and lower than the centrepiece, joined to the block by a low
//      link so the two masses read as one establishment rather than two buildings.
//
//   THE PLATE-COLUMN ARITHMETIC, WHICH `school.js` PAID THREE ROUNDS TO LEARN
//
//   `civic/school.js`'s header is the single most important craft finding in this kit: column
//   position in the harness's own `three-quarter` station is `u ≈ 0.756x − 0.654z`, and TWO
//   MASSES CLOSER THAN ABOUT 8 u MERGE INTO ONE TOOTH. Separation is a plan decision and no
//   amount of roof work reaches it. Three rounds were lost there trying to fix a silhouette with
//   pitches and staggers when the fault was three bays at 4.0 m centres — 3.0 u apart.
//
//   So the same arithmetic, run on this plan before a line of it was written. The lot is
//   x ∈ [−7.5, 7.5], z ∈ [−15.5, 15.5]; 15 m of width is worth 11.34 u and 31 m of depth is
//   worth 20.27 u, and the whole model spans u −15.81 … +15.81. +z is SCREEN LEFT (the camera
//   sits at +x, +z, so the lot's front reads left and its rear reads right).
//
//     mass                     x extent        z extent         u extent        centre
//     ─────────────────────────────────────────────────────────────────────────────────
//     gate group               −6.95 … +3.40   +12.9 … +14.30   −14.57 … −5.86   −10.2
//     parade furniture         −3.90 … +6.65   +7.50 … +10.60   −8.86 … −1.90     −5.4
//     BARRACKS BLOCK           −6.80 … +6.80   −7.40 … −0.95    −4.52 … +9.98     +2.7
//     DRILL HALL               −6.40 … +6.40   −15.20 … −9.40   +1.31 … +14.78    +8.1
//
//   TWO FINDINGS, AND THE SECOND ONE IS THE HONEST ONE.
//
//   (a) The parade reads. The gap between the gate group's right edge (−5.86) and the barracks'
//       left edge (−4.52) is 1.3 u of overlap, but neither of those is a SKYLINE mass: the guard
//       box is 2.6 m, the dais 0.6 m, the boom 1.2 m. What occupies u −14.6 … −4.5 at skyline
//       height is nothing at all except two 9.2 m flag masts at u −8.86 and −3.57 and a 4.4 m
//       obelisk at −1.90. That is 10.1 plate-columns — a third of the model's width — of empty
//       deck under a clear sky, bounded at the far left by a guard box and a fence. A void that
//       wide, that flat and that deliberately PAINTED is a silhouette event, and it is the one
//       the primary school, the high school and the mission school structurally cannot have.
//
//   (b) The barracks and the drill hall DO NOT separate, and that is a decision rather than an
//       oversight. Their u extents overlap from +1.31 to +9.98; the drill hall clears the
//       barracks' right edge by only 4.80 u, which is below school.js's 8 u threshold, so at
//       board zoom they merge into one tooth. Getting to 8 u would need the hall 12.2 m further
//       back on a lot with 5.8 m of room left, or off the axis — and off the axis is exactly the
//       property this subject is being built to have. So the separation is bought VERTICALLY and
//       in ROOF FORM instead: barracks eaves +7.00, main hip ridge +8.48, pavilion gable apexes
//       +8.47, DRILL HALL BARREL APEX +9.50, pediment apex +9.85, CUPOLA APEX +12.03. A faceted
//       barrel a metre above two hips and two gables is a different roof at any zoom, and the
//       cupola on the centreline is what tells a reader which mass is the front one.
//
// Envelope: `content.js` authors `officer-school` as `footprint: [1, 2]`, `storeys: 2` and those
// are sim inputs that landuse, permits and pricing read. Nothing here changes them.
//
// PALETTE NOTE FOR THE ORCHESTRATOR — `surfaces.js` has no `CIVIC_SURFACE_SCHEME` entry for this
// id, so `civicPalette` falls through to `hospital-district`: `wall` is the RENDER family and
// `wallAlt` is the BRICK family. This file therefore inverts the usual assignment and puts the
// masonry field on `wallAlt` (brick) with `wall` and `trim` carrying the cement dressings, which
// gets a red-brick-with-cream-trim barracks out of a hospital's palette. The request is in the
// lane report; nothing here depends on it landing.
//
// Salt namespace 3600–3699.
// ══════════════════════════════════════════════════════════════════════════════════════════════

import {
  slab, box, rotBox, cyl, taper, part, inst,
  CIVIC_METRICS, hole, volume, triPlate, arcEndPlate, chamferSlab,
  seamGable, plinthCourse, stringCourse, downpipe, steelRail, louvreScreen,
  boardPlate, lawn, paverRun, sealedSlab, lineMarks, fenceRun,
  shrubMass, leafClump, bench, bin, flagpole,
} from './core.js';
import { civicDoor } from './openings.js';

const M = CIVIC_METRICS;
const Y0 = M.plateRise;

export const OFFICER_SCHOOL_ENVELOPE = Object.freeze({
  footprint: Object.freeze([1, 2]),
  storeys: 2,
});

/* ─────────────────────────────── the authored plan, in metres ────────────────────────────── */
/**
 * Every number below is authored against the 15 × 31 m parcel a `[1, 2]` footprint resolves to
 * after the setback lattice, and is clamped against the MEASURED lot at run time so nothing
 * leaves the pad on a parcel that turns out to be a single tile (`index.js` `scaleEnvelope` only
 * moves keys it can name, and a plan this interlocked has to clamp itself).
 */
function plan(env) {
  const halfW = env.lotW / 2;
  const halfD = env.lotD / 2;
  const sx = Math.min(1, env.lotW / 15);
  const sz = Math.min(1, env.lotD / 31);
  const k = Math.min(sx, sz);

  // ── the barracks block ──────────────────────────────────────────────────────────────────
  const rangeW = 13.1 * sx;              // the main two-storey range
  const rangeD = 5.4 * sz;
  const rangeBack = -7.40 * sz;
  const rangeFront = rangeBack + rangeD;
  const pavW = 2.8 * sx;                 // end pavilions: proud 0.25 on the flank, 1.05 on front
  const pavX = rangeW / 2 + 0.25 * sx - pavW / 2;
  const pavBack = rangeBack + 0.60 * sz; // buried inside the range's dark room — no coplanar face
  const pavFront = -0.95 * sz;
  const bayW = 3.4 * sx;                 // the pedimented centrepiece
  const podiumH = 0.55;
  const storey0 = 3.60;
  const storey1 = 3.40;
  const floor0 = Y0 + podiumH;
  const floor1 = floor0 + storey0;

  // ── the verandah ────────────────────────────────────────────────────────────────────────
  const veranW = (rangeW / 2 - pavW - 0.25 * sx) * 2;     // the clear run between the pavilions
  // The column line, and 2.35 m is the crush decision described on `verandah()`. Measured from
  // the range's front wall at z = −2.00, not from the centrepiece, which breaks 1.05 m forward.
  const veranZ = 0.35 * sz;
  const deckFront = veranZ + 0.33 * sz;

  // ── the drill hall ──────────────────────────────────────────────────────────────────────
  const hallW = 12.8 * sx;
  const hallD = 5.8 * sz;
  const hallBack = Math.max(-halfD + 0.30, -15.20 * sz);
  const hallFront = hallBack + hallD;
  const hallWallY = Y0 + 6.30;

  // ── the parade ground and the approach ──────────────────────────────────────────────────
  const stepFront = deckFront + 0.75 * sz;
  const paradeBack = stepFront;
  const paradeFront = 12.20 * sz;
  // 12.0 m. r1 authored 11.0 and the plate says that is wrong: the parade sat NARROWER than the
  // 13.6 m block behind it, so the void read as a forecourt rather than as the larger formal
  // space the block faces. The margin, verge and hedge come down to fit rather than the parade.
  const paradeW = Math.min(12.0 * sx, env.lotW - 2.9 * sx);
  const apronFront = Math.min(halfD - 1.20, 14.20 * sz);
  const fenceZ = Math.min(halfD - 0.75, 14.30 * sz);
  const daisZ = 8.50 * sz;               // the dispatcher's fascia board lands here; see `dais()`
  const saluteZ = 7.40 * sz;

  return {
    halfW, halfD, sx, sz, k,
    rangeW, rangeD, rangeBack, rangeFront, pavW, pavX, pavBack, pavFront, bayW,
    podiumH, storey0, storey1, floor0, floor1, eaveY: Y0 + podiumH + storey0 + storey1,
    veranW, veranZ, deckFront,
    hallW, hallD, hallBack, hallFront, hallWallY,
    stepFront, paradeBack, paradeFront, paradeW, apronFront, fenceZ, daisZ, saluteZ,
  };
}

export function buildOfficerSchool(ctx) {
  const env = ctx.env;
  const g = plan(env);

  ctx.add(boardPlate(ctx, { width: env.lotW, depth: env.lotD }));

  groundPlane(ctx, g, env);
  paradeGround(ctx, g);
  approach(ctx, g);
  barracks(ctx, g);
  verandah(ctx, g);
  centrepiece(ctx, g);
  roofscape(ctx, g);
  drillHall(ctx, g);
  furniture(ctx, g);
}

/* ═══════════════════════════════ the lot ═══════════════════════════════════════════════════ */

/**
 * The green surround §6G asks for, plus the rear service yard.
 *
 * WEAR DOCTRINE, AND IT IS A COMPOSITION RATHER THAN A FILTER. The reference README is explicit
 * that uniform dirt scores zero and that what reads is a CLEAN surface immediately beside a dirty
 * one. A barracks supplies that for free and it is the reason the ground is split into two
 * materials: the parade is swept concrete with crisp repainted marking and `patches: 0`, and the
 * approach apron and the rear service yard eight metres away are patched asphalt with oil marks.
 */
function groundPlane(ctx, g, env) {
  const { p } = ctx;
  // The verge runs from the outer edge of the brick margin to just inside the plate rim.
  const vergeIn = g.paradeW / 2 + 0.72;
  const vergeOut = env.lotW / 2 - 0.10;
  const bandX = (vergeIn + vergeOut) / 2;
  const bandW = Math.max(0.5, vergeOut - vergeIn);
  for (const side of [-1, 1]) {
    ctx.add(lawn(ctx, {
      x: side * bandX, z: (g.paradeBack + g.paradeFront) / 2,
      w: bandW, d: g.paradeFront - g.paradeBack + 1.4 * g.sz,
      tufts: 10, salt: 3600 + (side > 0 ? 6 : 0), name: `os-verge${side > 0 ? 'r' : 'l'}`,
    }));
    // ── A BRICK PAVER MARGIN, AND IT IS THERE FOR A MEASURED REASON. ──
    //
    // The round-1 broadcast's warning for this subject verbatim: *"a large flat sealed rectangle
    // is the easiest surface in this programme to land as a dead grey field."* The parade is
    // 11.8 × 10.15 m of one concrete value, and the surround is where that field is broken
    // without touching the void itself: a laid brick margin in `wallAlt` between the kerb and
    // the grass gives the near half of the lot a warm, jointed, per-unit-varied band on both
    // flanks, at the one place a viewer's eye travels along.
    ctx.add(paverRun(ctx, {
      x0: side * (g.paradeW / 2 + 0.16), x1: side * (g.paradeW / 2 + 0.72),
      z0: g.paradeBack + 0.4, z1: g.paradeFront - 0.4,
      unit: 0.62, joint: 0.05, material: p.wallAlt, name: `os-margin${side > 0 ? 'r' : 'l'}`,
    }));
    // Clipped hedging down both flanks of the parade — the green surround, and the one soft
    // silhouette on an otherwise entirely rectilinear lot.
    hedge(ctx, {
      x: side * (g.paradeW / 2 + 1.08 * g.sx), z: (g.paradeBack + g.paradeFront) / 2,
      len: (g.paradeFront - g.paradeBack) * 0.86, axis: 'z', h: 0.92, d: 0.54,
      salt: 3612 + (side > 0 ? 9 : 0), name: `os-hedge${side > 0 ? 'r' : 'l'}`,
    });
  }

  // The rear service yard, between the barracks and the drill hall and down the hall's flanks.
  ctx.add(sealedSlab(ctx, {
    x: 0, z: (g.hallFront + g.rangeBack) / 2, w: env.lotW - 1.2, d: g.rangeBack - g.hallFront,
    material: p.ground, kerb: false, joints: true, patches: 0, name: 'os-yard',
  }));
  // WEAR IS A REPAIR WITH AN EDGE, AND IT IS NOT ALLOWED TO BE BLACK. `sealedSlab`'s own
  // `patches` alternate `p.shadow` and `p.wallAlt`, and on the r1 plate the shadow one is a
  // near-black rectangle lying on a pale apron — which reads as a hole in the deck rather than
  // as a patch. The reference doctrine is a CLEAN surface immediately beside a dirty one, and
  // the clean surface here is the swept parade. So the yard and the approach get their repairs
  // in the brick bucket only: a warm mid patch with a crisp edge, one value step off the
  // concrete, and the parade twelve metres away stays spotless.
  if (!ctx.mid) return;
  const yz = (g.hallFront + g.rangeBack) / 2;
  for (const [px, pz, pw, pd] of [
    [-3.9, yz + 0.15, 2.7, 1.05], [2.6, yz - 0.25, 3.3, 0.9],
    [-1.2, g.apronFront - 1.9, 3.1, 0.85], [4.1, g.apronFront - 1.2, 2.2, 0.75],
  ]) {
    ctx.add([part(slab(pw, 0.024, pd, px, Y0 + 0.075, pz, 'os-patch'), p.wallAlt)]);
  }
}

/**
 * §6G's first clause. A large sealed rectangle with a painted saluting line, a dais and flag
 * masts, occupying the near half of the lot.
 *
 * The marking set is the whole argument. An unmarked slab of concrete is a car park; a saluting
 * line running the full width, a centre line on the axis, a company perimeter and a rank of file
 * markers are a parade ground, and every one of them is 9 mm of paint standing on a surface it
 * intersects by 20 mm (`lineMarks`' own seating rule) rather than a kerb laid on top of it.
 */
function paradeGround(ctx, g) {
  const { p } = ctx;
  const cz = (g.paradeBack + g.paradeFront) / 2;
  const dz = g.paradeFront - g.paradeBack;
  ctx.add(sealedSlab(ctx, {
    x: 0, z: cz, w: g.paradeW, d: dz, material: p.ground,
    kerb: true, joints: true, patches: 0, name: 'os-parade',
  }));

  const top = Y0 + 0.08;
  const hw = g.paradeW / 2;
  const segs = [];
  // The saluting line — the widest and thickest mark on the lot, across the full parade.
  segs.push([0, g.saluteZ, g.paradeW - 0.9, 0.22]);
  // Company perimeter, inset half a metre.
  segs.push([0, g.paradeBack + 0.65, g.paradeW - 1.3, 0.13]);
  segs.push([0, g.paradeFront - 0.65, g.paradeW - 1.3, 0.13]);
  segs.push([-hw + 0.65, cz, 0.13, dz - 1.3]);
  segs.push([hw - 0.65, cz, 0.13, dz - 1.3]);
  // The centre line, on the axis of symmetry, from the barracks steps to the saluting line.
  segs.push([0, (g.paradeBack + g.saluteZ) / 2, 0.14, g.saluteZ - g.paradeBack - 0.5]);
  ctx.add(lineMarks(ctx, { segments: segs, y: top, wear: 0.08, name: 'os-parade-mark' }));

  // File markers: the row of short bars a squad forms up on.
  if (ctx.mid) {
    const files = [];
    for (let i = -3; i <= 3; i += 1) files.push([i * 1.0, g.paradeBack + 1.35, 0.10, 0.56]);
    for (let i = -3; i <= 3; i += 1) files.push([i * 1.0, g.saluteZ - 1.15, 0.10, 0.44]);
    ctx.add(lineMarks(ctx, { segments: files, y: top, wear: 0.22, name: 'os-file-mark' }));
  }

  dais(ctx, g, top);
  for (const side of [-1, 1]) {
    ctx.add(flagpole(ctx, { x: side * 3.5 * g.sx, z: g.daisZ, h: 9.2, name: `os-mast${side > 0 ? 'r' : 'l'}` }));
  }
  squad(ctx, g);
}

/**
 * The reviewing dais, and it is placed where it is for a reason that is not architectural.
 *
 * `civic/index.js` appends an `INSTITUTION_FASCIA` sign board to this archetype at
 * `x: 0, z: min(lotD × 0.42, 8.5)` — 8.5 m on a `[1, 2]` parcel — and a lane may not edit that
 * file. A noticeboard on two posts standing alone in the middle of a parade ground is wrong in a
 * way a critic would name in one line. So the dais is built AROUND it at the same station: two
 * stone steps and a rail at the saluting position, with the board reading as the unit honour
 * board standing on it. The object the dispatcher inserts becomes part of the composition
 * instead of litter in it.
 */
function dais(ctx, g, surfaceY) {
  const { p } = ctx;
  const z = g.daisZ;
  ctx.add([
    part(slab(4.10, 0.26, 2.30, 0, Y0 + 0.04, z, 'os-dais-low'), p.metal),
    part(slab(3.40, 0.28, 1.70, 0, Y0 + 0.30, z, 'os-dais-high'), p.metal),
    part(slab(3.52, 0.09, 1.82, 0, Y0 + 0.58, z, 'os-dais-cap'), p.trim),
  ]);
  ctx.add(steelRail(ctx, { x: 0, y: Y0 + 0.67, z: z - 0.78, w: 3.30, axis: 'x', h: 0.92, name: 'os-dais-rail' }));
  // Painted box around the saluting base, so the dais sits in a mark rather than on bare deck.
  ctx.add(lineMarks(ctx, {
    segments: [
      [0, z - 1.60, 5.20, 0.12], [0, z + 1.60, 5.20, 0.12],
      [-2.54, z, 0.12, 3.20], [2.54, z, 0.12, 3.20],
    ],
    y: surfaceY, wear: 0.10, name: 'os-dais-mark',
  }));
}

/**
 * A formed-up squad. Twenty-one cadets in three ranks, dressed on the file markers.
 *
 * §2's fifth property is that the lot is INHABITED, and this is the cheapest true statement the
 * subject can make: nothing else on the board has people standing in ranks. Twenty-four
 * triangles a figure, hashed off its own file so no two are the same height or exactly on the
 * mark, because a rank of identical instances at a perfect pitch is the fault the r4 school
 * critic sorted a blind pair on.
 */
function squad(ctx, g) {
  if (!ctx.mid) return;
  const { p } = ctx;
  const out = [];
  const ranks = ctx.detail ? 3 : 2;
  const figure = (tag, x, z, h, lead = false) => {
    const jx = x + (inst(ctx, tag, 1) - 0.5) * 0.09;
    const jz = z + (inst(ctx, tag, 3) - 0.5) * 0.07;
    // Legs, torso, head, cap. Four boxes, and the SHOULDER STEP is what makes the silhouette a
    // person rather than a post: r1 built one 0.40 m box the whole height and at 4x the plate
    // reads a rank of bollards. A figure is narrow at the legs, wider at the shoulders and much
    // narrower again at the head, and the head is pale against a dark tunic.
    out.push(part(slab(0.22, h * 0.46, 0.19, jx, Y0, jz, `${tag}-legs`), p.metal));
    out.push(part(slab(0.36, h * 0.36, 0.23, jx, Y0 + h * 0.46, jz, `${tag}-tunic`),
      lead ? p.accent : p.metal));
    out.push(part(slab(0.17, h * 0.13, 0.17, jx, Y0 + h * 0.82, jz, `${tag}-head`), p.trim));
    out.push(part(slab(0.23, h * 0.05, 0.23, jx, Y0 + h * 0.95, jz, `${tag}-cap`), p.metal));
  };
  for (let r = 0; r < ranks; r += 1) {
    const z = g.paradeBack + 2.55 + r * 1.05;
    for (let f = -3; f <= 3; f += 1) {
      const tag = `os-cadet-${r}-${f}`;
      figure(tag, f * 1.08, z, 1.66 + (inst(ctx, tag, 2) - 0.5) * 0.12);
    }
  }
  // The instructor, out on the flank facing the ranks — one figure that is not on the grid, and
  // the one place a saturated tunic belongs.
  figure('os-instr', -4.55, g.paradeBack + 3.4, 1.74, true);
  ctx.add(out);
}

/** §6G's frontage clause: a boom gate with a guard box, painted kerbs and clipped hedging. */
function approach(ctx, g) {
  const { p } = ctx;
  const apronZ = (g.paradeFront + g.apronFront) / 2;
  ctx.add(sealedSlab(ctx, {
    x: 0, z: apronZ, w: g.halfW * 2 - 1.0, d: g.apronFront - g.paradeFront,
    material: p.ground, kerb: false, joints: true, patches: 0, name: 'os-apron',
  }));
  ctx.add(paverRun(ctx, {
    x0: -3.0, x1: 3.0, z0: g.paradeFront - 0.1, z1: g.apronFront,
    unit: 1.15, flat: true, name: 'os-drive',
  }));
  // Painted kerb bars either side of the entry, and a stop line under the boom.
  ctx.add(lineMarks(ctx, {
    segments: [
      [-4.6, apronZ, 0.16, g.apronFront - g.paradeFront - 0.5],
      [4.6, apronZ, 0.16, g.apronFront - g.paradeFront - 0.5],
      [0, g.apronFront - 1.25, 5.6, 0.20],
    ],
    y: Y0 + 0.08, wear: 0.26, name: 'os-kerb-mark',
  }));

  // Boundary: palisade either side of a pair of capped brick piers.
  for (const side of [-1, 1]) {
    ctx.add(fenceRun(ctx, {
      x1: side * 3.70, z1: g.fenceZ, x2: side * (g.halfW - 0.20), z2: g.fenceZ,
      style: 'palisade', h: 1.85, material: p.trim,
      name: `os-fence${side > 0 ? 'r' : 'l'}`,
    }));
    ctx.add([
      part(slab(0.74, 2.55, 0.74, side * 3.35, Y0, g.fenceZ, 'os-pier'), p.wallAlt),
      part(slab(0.92, 0.16, 0.92, side * 3.35, Y0 + 2.55, g.fenceZ, 'os-pier-cap'), p.trim),
      part(chamferSlab(0.70, 0.70, 0.46, 0, side * 3.35, Y0 + 2.71, g.fenceZ, 'os-pier-finial', 0.24), p.trim),
    ]);
  }

  guardBox(ctx, g, -5.05, g.fenceZ - 1.05);
  boom(ctx, g, -3.55, g.fenceZ - 1.30);

  // Clipped cones flanking the entry, and a memorial obelisk on the parade's edge.
  for (const [cx, dz, ch] of [[5.15, 0.15, 2.05], [6.50, 0.00, 1.75], [-6.55, 0.10, 1.90]]) {
    clippedCone(ctx, cx, g.fenceZ - 1.35 + dz, Y0, ch, `os-gcone${Math.round(cx * 10)}`);
  }
  obelisk(ctx, g, 6.45, 10.60);
}

/* ═══════════════════════════════ the barracks ══════════════════════════════════════════════ */

/**
 * A symmetrical two-storey brick barracks facing the parade: a strict window grid, end pavilions
 * that break forward on the front AND on the flank, a raised podium and a hipped roof.
 *
 * THE END PAVILIONS ARE PROUD ON TWO FACES AND THAT IS A MODELLING RULE, NOT A STYLE ONE. A
 * breakfront flush with the range's flank puts two same-material wall planes on the same
 * coordinate, which is §1.2's z-fight in the most visible face on the model. Projecting 0.25 m
 * sideways as well as 1.05 m forward makes the two faces genuinely different planes, and it is
 * also what an end pavilion does.
 */
function barracks(ctx, g) {
  const { p } = ctx;
  const cz = (g.rangeBack + g.rangeFront) / 2;
  const y0 = g.floor0;
  const y1 = g.eaveY;

  // The podium. Everything on this half of the lot stands on it and it is the reason no wall
  // meets the board deck.
  ctx.add([
    part(slab(g.rangeW + 0.90, g.podiumH, (g.pavFront - g.rangeBack) + 0.70, 0, Y0,
      (g.rangeBack + g.pavFront) / 2 - 0.10, 'os-podium'), p.metal),
    part(slab(g.rangeW + 1.18, 0.13, (g.pavFront - g.rangeBack) + 0.96, 0, Y0,
      (g.rangeBack + g.pavFront) / 2 - 0.10, 'os-podium-toe'), p.metal),
  ]);

  // ── the main range ──────────────────────────────────────────────────────────────────────
  const winW = 0.98;
  const winH = 1.86;
  const frontX = [-3.42, -2.32, 2.32, 3.42];
  const front = [];
  for (const x of frontX) {
    front.push(hole(x, y0 + 0.95, winW, winH, 'win'));
    front.push(hole(x, g.floor1 + 0.90, winW, winH, 'win'));
  }
  // NO OPENINGS ON THE RANGE'S FLANKS. The end pavilions break 0.25 m past them and cover the
  // range's side walls for all but a 0.60 m sliver at the rear, so a window punched here is a
  // reveal, a frame and a pane built entirely inside the pavilion's own solid — invisible, and
  // two same-material faces 0.25 m apart into the bargain. The whole flank grid is on the
  // pavilions, which is also where the elevation wants it.
  ctx.add(volume(ctx, {
    material: p.wallAlt, x: 0, zFront: g.rangeFront, zBack: g.rangeBack, width: g.rangeW,
    y0, y1, front, room: true, name: 'os-range',
  }));
  ctx.add(plinthCourse(ctx, {
    x: 0, z: cz, w: g.rangeW, d: g.rangeD, yBase: y0 - 0.02, h: 0.72, proud: 0.13,
    material: p.metal, name: 'os-range-plinth',
  }));
  ctx.add(stringCourse(ctx, {
    x: 0, z: cz, w: g.rangeW, d: g.rangeD, y: g.floor1 - 0.30, thick: 0.26, proud: 0.14,
    material: p.wall, faces: 'flr', name: 'os-range-string',
  }));
  // The cornice, and it is the one band that runs the whole front unbroken.
  ctx.add(stringCourse(ctx, {
    x: 0, z: cz, w: g.rangeW, d: g.rangeD, y: y1 - 0.34, thick: 0.34, proud: 0.22,
    material: p.trim, name: 'os-range-cornice',
  }));
  for (const x of frontX) {
    for (const y of [y0 + 0.95, g.floor1 + 0.90]) {
      barrackWindow(ctx, {
        x, y: y + winH / 2, z: g.rangeFront, w: winW, h: winH,
        facing: 'front', bars: 2, id: `os-rw${Math.round(x * 10)}-${Math.round(y * 10)}`,
      });
    }
  }

  // ── the end pavilions ───────────────────────────────────────────────────────────────────
  const pavCZ = (g.pavBack + g.pavFront) / 2;
  const pavD = g.pavFront - g.pavBack;
  const pavFlankZ = [g.pavFront - 1.35, g.pavFront - 3.15, g.pavFront - 4.95];
  for (const side of [-1, 1]) {
    const px = side * g.pavX;
    const pFront = [
      hole(px, y0 + 0.95, 1.22, winH, 'win'),
      hole(px, g.floor1 + 0.90, 1.22, winH, 'win'),
    ];
    const outer = [];
    for (const z of pavFlankZ) {
      outer.push(hole(z, y0 + 0.95, winW, winH, 'win'));
      outer.push(hole(z, g.floor1 + 0.90, winW, winH, 'win'));
    }
    ctx.add(volume(ctx, {
      material: p.wallAlt, x: px, zFront: g.pavFront, zBack: g.pavBack, width: g.pavW,
      y0, y1: y1 + 0.35, front: pFront,
      left: side < 0 ? outer : [], right: side > 0 ? outer : [],
      room: true, name: `os-pav${side > 0 ? 'r' : 'l'}`,
    }));
    ctx.add(plinthCourse(ctx, {
      x: px, z: pavCZ, w: g.pavW, d: pavD, yBase: y0 - 0.02, h: 0.72, proud: 0.13,
      material: p.metal, name: `os-pav-plinth${side}`,
    }));
    ctx.add(stringCourse(ctx, {
      x: px, z: pavCZ, w: g.pavW, d: pavD, y: g.floor1 - 0.30, thick: 0.26, proud: 0.14,
      material: p.wall, faces: side > 0 ? 'fr' : 'fl', name: `os-pav-string${side}`,
    }));
    // Quoins: the corner dressing that makes a brick pavilion read as a designed end rather than
    // as a cut. Six blocks a corner, alternating proud, in the render family against the brick.
    if (ctx.mid) {
      for (const cx of [px - g.pavW / 2, px + g.pavW / 2]) {
        for (let i = 0; i < 7; i += 1) {
          const qy = y0 + 0.30 + i * 1.00;
          if (qy > y1 + 0.10) continue;
          const qw = i % 2 === 0 ? 0.62 : 0.40;
          ctx.add([part(box(qw, 0.44, 0.30, cx, qy, g.pavFront + 0.02, `os-quoin${i}`), p.wall)]);
        }
      }
    }
    barrackWindow(ctx, {
      x: px, y: y0 + 0.95 + winH / 2, z: g.pavFront, w: 1.22, h: winH,
      facing: 'front', bars: 2, id: `os-pf${side}a`,
    });
    barrackWindow(ctx, {
      x: px, y: g.floor1 + 0.90 + winH / 2, z: g.pavFront, w: 1.22, h: winH,
      facing: 'front', bars: 2, id: `os-pf${side}b`,
    });
    for (const z of pavFlankZ) {
      for (const y of [y0 + 0.95, g.floor1 + 0.90]) {
        barrackWindow(ctx, {
          x: px + side * g.pavW / 2, y: y + winH / 2, z, w: winW, h: winH,
          facing: side > 0 ? 'right' : 'left', bars: 2,
          id: `os-pfl${side}-${Math.round(z * 10)}-${Math.round(y * 10)}`,
        });
      }
    }
    ctx.add(downpipe(ctx, {
      x: px + side * (g.pavW / 2 + 0.10), z: g.pavFront - 0.35, y0: Y0 + 0.10, y1: y1 + 0.30,
      name: `os-dp${side}`,
    }));
  }
}

/**
 * §6G: a colonnade or covered verandah along the barracks front at ground level.
 *
 * ── THE VERANDAH IS THE ONE PLACE THIS SUBJECT CAN LOSE ON CRUSH, AND IT IS BUILT AGAINST THAT.
 *
 * The MP9 round-1 census measured our lanes crushing 7–13 % of subject pixels below luma 12
 * against 1.2–1.8 % on every Monopoly Plus frame, and named a colonnaded verandah as exactly
 * where that bites: *"a verandah is a mid-shadow perhaps two stops under the sunlit façade, with
 * the wall, the door and the post bases still readable — not a void."* Four decisions here are
 * that finding rather than a style preference, and none of them costs a triangle:
 *
 *   1. IT IS 2.35 m DEEP, NOT 3.15. Depth is how much sky the back wall is allowed to see, and
 *      it is the single largest term. A shallower verandah is also the correct one on a 5.4 m
 *      range — a 3 m one belongs on a homestead.
 *   2. THE DECK AND THE COLUMNS ARE IN `trim`, THE LIGHTEST BUCKET ON THE MODEL. A verandah floor
 *      is the surface directly under the opening, so it is the brightest thing in the recess and
 *      it bounces the whole space up. `ground` at #565655 put a mid-dark slab there instead.
 *   3. THERE IS A LINED SOFFIT. The roof's underside is the largest single face a viewer sees
 *      into from a three-quarter station, and an unlined one is the pitch's own dark back. A
 *      painted lining board in `trim` is what an Australian verandah actually has.
 *   4. SIX COLUMNS, 0.34 m SQUARE, NOT EIGHT AT 0.44. Every column is an occluder; the rhythm
 *      still reads at six and 22 % more sky reaches the wall.
 */
function verandah(ctx, g) {
  const { p } = ctx;
  const bayHalf = g.bayW / 2;
  const runHalf = g.veranW / 2;
  const bayFront = g.pavFront;
  const deckBack = g.rangeFront - 0.10;

  // The verandah floor, and a nosing so the deck edge has a shadow line.
  ctx.add([
    part(slab(g.veranW + 0.60, g.podiumH, g.deckFront - deckBack, 0, Y0,
      (deckBack + g.deckFront) / 2, 'os-veran-deck'), p.trim),
    part(slab(g.veranW + 0.86, 0.11, g.deckFront - deckBack + 0.26, 0, Y0,
      (deckBack + g.deckFront) / 2, 'os-veran-nose'), p.wall),
  ]);

  // Six square columns on plinths with moulded caps. An even count so the middle bay is open and
  // the entrance is on the axis rather than behind a shaft.
  const colX = [-3.85, -2.31, -0.77, 0.77, 2.31, 3.85].map((v) => v * g.sx);
  const colTop = g.floor0 + 3.20;
  for (const x of colX) {
    ctx.add([
      part(slab(0.50, 0.20, 0.50, x, g.floor0, g.veranZ, 'os-col-base'), p.trim),
      part(slab(0.34, colTop - g.floor0 - 0.20, 0.34, x, g.floor0 + 0.20, g.veranZ, 'os-col'), p.trim),
      part(slab(0.48, 0.16, 0.48, x, colTop, g.veranZ, 'os-col-cap'), p.wall),
      part(slab(0.40, 0.10, 0.40, x, colTop + 0.16, g.veranZ, 'os-col-abac'), p.trim),
    ]);
  }
  const beamY = colTop + 0.26;
  ctx.add([
    part(slab(g.veranW + 0.44, 0.32, 0.34, 0, beamY, g.veranZ, 'os-veran-beam'), p.trim),
    part(slab(g.veranW + 0.60, 0.13, 0.46, 0, beamY + 0.32, g.veranZ, 'os-veran-fascia'), p.wall),
  ]);

  // Two roof depths, because the centrepiece breaks forward THROUGH the verandah. A single
  // rectangle here would either leave a slot open to the sky beside the bay or bury the bay.
  // Each run is emitted twice: the sheet on top and a lining board 0.16 m under it, which is the
  // face a three-quarter station actually looks into.
  const wallPlate = beamY + 0.62;
  for (const [x0, x1, zb] of [
    [-runHalf - 0.20, -bayHalf, g.rangeFront + 0.05],
    [bayHalf, runHalf + 0.20, g.rangeFront + 0.05],
    [-bayHalf, bayHalf, bayFront + 0.05],
  ]) {
    const w = x1 - x0;
    if (w < 0.2) continue;
    const zf = g.veranZ + 0.20;
    const run = zf - zb;
    const fall = wallPlate - (beamY + 0.34);
    const ang = Math.atan2(fall, run);
    const len = Math.hypot(fall, run) + 0.10;
    const cx = (x0 + x1) / 2;
    const cy = (wallPlate + beamY + 0.34) / 2;
    const cz2 = (zb + zf) / 2;
    ctx.add([
      part(rotBox(w, 0.15, len, cx, cy, cz2, { x: -ang }, 'os-veran-roof'), p.accent),
      part(rotBox(w - 0.10, 0.08, len - 0.14, cx, cy - 0.17, cz2, { x: -ang },
        'os-veran-soffit'), p.trim),
      // A gutter on the front edge, so the roof terminates on a member rather than as a plank
      // cantilevered into the air — which is what the r1 plate shows it doing.
      part(box(w, 0.15, 0.16, cx, beamY + 0.44, zf + 0.06, 'os-veran-gutter'), p.metal),
    ]);
  }

  // The entrance itself, on the axis, behind the open middle bay.
  ctx.add(civicDoor(ctx, {
    x: 0, y: g.floor0, z: bayFront, w: 1.42, h: 2.52, facing: 'front',
    accent: true, id: 'os-entry', label: 'Officer school entrance',
  }));

  // The steps down to the parade, with cheek walls that land on the deck.
  const stepW = 3.60 * g.sx;
  for (let i = 0; i < 3; i += 1) {
    const h = g.podiumH / 3;
    ctx.add([part(slab(stepW - i * 0.24, h, 0.30, 0, Y0 + (2 - i) * h,
      g.deckFront + 0.16 + i * 0.30, 'os-step'), p.metal)]);
  }
  for (const side of [-1, 1]) {
    ctx.add([
      part(slab(0.34, g.podiumH + 0.26, 1.10, side * (stepW / 2 + 0.16), Y0,
        g.deckFront + 0.50, 'os-cheek'), p.wallAlt),
      part(slab(0.46, 0.12, 1.22, side * (stepW / 2 + 0.16), Y0 + g.podiumH + 0.26,
        g.deckFront + 0.50, 'os-cheek-cap'), p.trim),
    ]);
    // Two clipped cones in a kerbed box each side of the steps. `mp-civic-blue` and
    // `mp-mansion-portico` both line the base of the building with small dark conifers, and it is
    // the cheapest thing on either frame: it breaks the podium's long horizontal, it puts green
    // against masonry where the eye lands, and it is what a barracks entrance actually has.
    const bx = side * 3.25 * g.sx;
    const bz = g.deckFront + 0.62;
    ctx.add([
      part(slab(2.05, 0.34, 1.15, bx, Y0, bz, 'os-entbed'), p.trim),
      part(slab(1.75, 0.12, 0.88, bx, Y0 + 0.30, bz, 'os-entbed-soil'), p.wallAlt),
    ]);
    for (const dx of [-0.52, 0.52]) {
      clippedCone(ctx, bx + dx, bz, Y0 + 0.42, 1.55, `os-cone${side}${dx > 0 ? 'a' : 'b'}`);
    }
  }
}

/**
 * §6G: a central pedimented entrance bay with a clock and a crest.
 *
 * The centrepiece is 0.55 m taller than the range at the eaves, carries its own entablature, and
 * puts a real triangular pediment 1.35 m above the main hip ridge. It is the object that
 * announces the axis, and everything in it — pilasters, entablature, raking cornice, tympanum
 * clock, crest — is modelled section rather than a painted band.
 */
function centrepiece(ctx, g) {
  const { p } = ctx;
  const bayFront = g.pavFront;
  const bayCZ = (g.pavBack + bayFront) / 2;
  const bayD = bayFront - g.pavBack;
  const y0 = g.floor0;
  const bayTop = g.eaveY + 0.55;
  const winH = 1.86;

  const front = [
    hole(0, y0, 1.42, 2.52, 'door'),
    hole(-1.02 * g.sx, y0 + 0.95, 0.70, winH * 0.86, 'win'),
    hole(1.02 * g.sx, y0 + 0.95, 0.70, winH * 0.86, 'win'),
    hole(0, g.floor1 + 0.80, 1.05, 2.10, 'win'),
    hole(-1.15 * g.sx, g.floor1 + 0.90, 0.66, 1.86, 'win'),
    hole(1.15 * g.sx, g.floor1 + 0.90, 0.66, 1.86, 'win'),
  ];
  ctx.add(volume(ctx, {
    material: p.wallAlt, x: 0, zFront: bayFront, zBack: g.pavBack, width: g.bayW,
    y0, y1: bayTop, front, room: true, name: 'os-bay',
  }));
  ctx.add(plinthCourse(ctx, {
    x: 0, z: bayCZ, w: g.bayW, d: bayD, yBase: y0 - 0.02, h: 0.72, proud: 0.14,
    material: p.metal, name: 'os-bay-plinth',
  }));

  // TWO engaged pilasters, not four. r1 put four at 1.10 m centres on a 3.4 m bay: at 4x on the
  // plate they read as a picket fence and the tripartite window group between them disappeared
  // into the striping. An order has a pilaster at each END of the bay it frames and nothing in
  // between, and the pair is 0.46 m wide rather than 0.30 so each one has a shadow of its own.
  for (const x of [-1.52, 1.52].map((v) => v * g.sx)) {
    ctx.add([
      part(slab(0.56, 0.22, 0.26, x, y0, bayFront + 0.13, 'os-pil-base'), p.trim),
      part(slab(0.46, bayTop - y0 - 0.60, 0.20, x, y0 + 0.22, bayFront + 0.10, 'os-pil'), p.wall),
      part(slab(0.62, 0.24, 0.30, x, bayTop - 0.38, bayFront + 0.15, 'os-pil-cap'), p.trim),
    ]);
  }
  // Window dressings on the first-floor group — a real head and sill on each light.
  barrackWindow(ctx, {
    x: 0, y: g.floor1 + 0.80 + 1.05, z: bayFront, w: 1.05, h: 2.10,
    facing: 'front', bars: 2, id: 'os-bay-w0',
  });
  for (const x of [-1.15 * g.sx, 1.15 * g.sx]) {
    barrackWindow(ctx, {
      x, y: g.floor1 + 0.90 + 0.93, z: bayFront, w: 0.66, h: 1.86,
      facing: 'front', bars: 1, id: `os-bay-w${x > 0 ? 'r' : 'l'}`,
    });
    barrackWindow(ctx, {
      x: x * 0.886, y: y0 + 0.95 + winH * 0.43, z: bayFront, w: 0.70, h: winH * 0.86,
      facing: 'front', bars: 1, id: `os-bay-g${x > 0 ? 'r' : 'l'}`,
    });
  }

  // Entablature, then the pediment. The raking cornice is two rotated members, so the triangle
  // has a moulded edge rather than a cut one.
  const entY = bayTop;
  ctx.add([
    part(slab(g.bayW + 0.52, 0.26, bayD + 0.34, 0, entY, bayCZ, 'os-ent-arch'), p.wall),
    part(slab(g.bayW + 0.62, 0.34, bayD + 0.44, 0, entY + 0.26, bayCZ, 'os-ent-frieze'), p.trim),
    part(slab(g.bayW + 0.80, 0.22, bayD + 0.62, 0, entY + 0.60, bayCZ, 'os-ent-cornice'), p.trim),
  ]);
  const pedY = entY + 0.82;
  const pedW = g.bayW + 0.72;
  const pedRise = 1.48;
  ctx.add([
    part(triPlate(pedW, pedRise, 0.44, 0, pedY, bayFront + 0.10, 'os-pediment'), p.wall),
    part(triPlate(pedW - 0.46, pedRise * 0.72, 0.20, 0, pedY + 0.09, bayFront + 0.34,
      'os-tympanum'), p.wallAlt),
  ]);
  const rake = Math.atan2(pedRise, pedW / 2);
  for (const side of [-1, 1]) {
    ctx.add([part(rotBox(Math.hypot(pedRise, pedW / 2) + 0.18, 0.19, 0.56,
      side * pedW / 4, pedY + pedRise / 2 + 0.02, bayFront + 0.20,
      { z: -side * rake }, 'os-ped-rake'), p.trim)]);
  }
  ctx.add([part(slab(0.42, 0.46, 0.42, 0, pedY + pedRise + 0.02, bayFront + 0.18,
    'os-ped-acroterion'), p.trim)]);

  clockFace(ctx, { x: 0, y: pedY + pedRise * 0.44, z: bayFront + 0.46, r: 0.56, name: 'os-clock' });
  crest(ctx, { x: 0, y: g.floor1 - 0.52, z: bayFront + 0.10, w: 0.86, h: 1.04, name: 'os-crest' });
}

/**
 * The roofscape: a hipped main range, two front-facing gabled pavilions, paired brick chimneys
 * and a louvred cupola on the axis.
 *
 * A hip is a rectangular frustum, which is exactly `chamferSlab` with `insetTop` set to the plan
 * run of the pitch — the run is the same on all four sides, so the four planes come out at one
 * pitch by construction and there is no corner to mitre by hand. The residual top face is 0.5 m
 * across, which is the ridge, and it is where the chimneys and the cupola are seated.
 */
function roofscape(ctx, g) {
  const { p } = ctx;
  const cz = (g.rangeBack + g.rangeFront) / 2;
  const ov = 0.45;
  const baseW = g.rangeW + ov * 2;
  const baseD = g.rangeD + ov * 2;
  const runIn = baseD / 2 - 0.25;
  const rise = runIn * Math.tan((27 * Math.PI) / 180);
  const eave = g.eaveY;

  // ── THE ROOF IS TERRACOTTA TILE AND NOT THE `roof` BUCKET, AND THAT IS THE ROUND-1 CENSUS. ──
  //
  // `civicPalette` has no scheme for this id, so it falls through to `hospital-district`, whose
  // `roof` is #404041 — a near-black plane. The MP9 census measured exactly that failure on the
  // abattoir baseline ("the whole roof plane crushes to near-black, which is a §2.9 failure on
  // its own and is a thing no Monopoly Plus frame does") and put our crush at 7–13 % against a
  // reference band of 1.2–1.8 %, our saturation at 22–24 % against 27–42 %, and our warmth at
  // r − b −3 … +20 against +23 … +43.
  //
  // A hipped roof is the largest single surface on this model. Putting it in `roof` spends that
  // area on the darkest, flattest bucket in the palette; putting it in `accent` — #d0573b, the
  // only saturated colour the fallback scheme has — spends it on a TERRACOTTA TILED HIP, which
  // is what a postwar Melbourne brick institution actually has, is what `mp-mansion-portico` and
  // `mp-villa-terracotta` both have, and is the one move available inside a palette this lane may
  // not edit that pushes crush, saturation and warmth the same way at once. §2.10's "one
  // saturated colour on small areas" was authored for school-blue on a school; it is not a reason
  // to keep a black roof on a subject measured 15 points under the saturation bar.
  //
  // The value break the accent then owes the composition is paid by the drill hall, whose barrel
  // is a light galvanised sheet (`barrelShell`, `trim`), and by the eaves lining below.
  ctx.add([
    part(slab(baseW + 0.10, 0.26, baseD + 0.10, 0, eave - 0.16, cz, 'os-eave-fascia'), p.trim),
    part(slab(baseW + 0.26, 0.16, baseD + 0.26, 0, eave + 0.02, cz, 'os-eave-gutter'), p.metal),
    // The eaves lining. An overhang's underside is a face the key never reaches, so it is left
    // in the roof's own dark unless it is lined — and a lined eave is what the building has.
    part(slab(baseW - 0.16, 0.10, baseD - 0.16, 0, eave + 0.05, cz, 'os-eave-soffit'), p.trim),
    part(chamferSlab(baseW, baseD, rise, 0, 0, eave + 0.16, cz, 'os-hip', runIn), p.accent),
    part(slab(baseW - runIn * 2 + 0.34, 0.16, baseD - runIn * 2 + 0.34, 0, eave + 0.16 + rise,
      cz, 'os-hip-ridge'), p.trim),
  ]);
  // Seam battens across the two long slopes, so the hip is a sheeted roof rather than a wedge.
  if (ctx.mid) {
    const slopeLen = Math.hypot(runIn, rise);
    const pitch = Math.atan2(rise, runIn);
    const n = Math.max(6, Math.round(baseW / 1.05));
    for (const side of [-1, 1]) {
      for (let i = 0; i < n; i += 1) {
        const x = -baseW / 2 + runIn * 0.5 + (i + 0.5) * ((baseW - runIn) / n);
        if (Math.abs(x) > baseW / 2 - runIn * 0.4) continue;
        ctx.add([part(rotBox(0.055, 0.08, slopeLen, x, eave + 0.20 + rise / 2,
          cz + side * (baseD / 2 - runIn / 2) * 0.55, { x: side * pitch }, 'os-hip-seam'), p.metal)]);
      }
    }
  }

  // The two front-facing gabled pavilion roofs, springing 0.35 m above the main eaves.
  const pavCZ = (g.pavBack + g.pavFront) / 2;
  const pavD = g.pavFront - g.pavBack;
  const gRise = Math.tan((32 * Math.PI) / 180) * (g.pavW / 2 + 0.40);
  for (const side of [-1, 1]) {
    const px = side * g.pavX;
    ctx.add(seamGable(ctx, {
      w: g.pavW, d: pavD, x: px, z: pavCZ, springY: g.eaveY + 0.35, pitch: 32,
      overhang: 0.40, ridge: 'z', seamPitch: 0.72, material: p.accent,
      name: `os-pav-roof${side}`,
    }));
    // The pavilion's own eaves lining, for the same reason as the main hip's.
    ctx.add([part(slab(g.pavW + 0.62, 0.10, pavD + 0.62, px, g.eaveY + 0.30, pavCZ,
      `os-pav-soffit${side}`), p.trim)]);
    // Tympanum infill on the gable end, apex below the roof's own so it is inside at every point.
    ctx.add([part(triPlate(g.pavW - 0.10, gRise * 0.86, 0.30, px, g.eaveY + 0.35,
      g.pavFront - 0.16, `os-pav-tymp${side}`), p.wallAlt)]);
    ctx.add([part(box(g.pavW + 0.86, 0.22, 0.24, px, g.eaveY + 0.30, g.pavFront + 0.36,
      `os-pav-barge${side}`), p.trim)]);
    // Paired brick chimneys — one stack on each pavilion ridge, one on each main slope.
    chimney(ctx, px, pavCZ - pavD * 0.18, g.eaveY + 0.35 + gRise - 0.55, 1.75);
  }
  for (const side of [-1, 1]) {
    chimney(ctx, side * 2.55 * g.sx, cz, g.eaveY + 0.16 + rise - 0.45, 1.95);
  }

  cupola(ctx, g, cz, g.eaveY + 0.16 + rise);
}

/* ═══════════════════════════════ the drill hall ════════════════════════════════════════════ */

/** §6G: a drill hall behind, wide-span with a curved roof and high windows. */
function drillHall(ctx, g) {
  const { p } = ctx;
  const cz = (g.hallBack + g.hallFront) / 2;
  const y1 = g.hallWallY;
  const hw = g.hallW / 2;
  const bandH = 1.45;
  const bandY = y1 - 1.05 - bandH / 2;

  const front = [
    hole(0, Y0 + 0.10, 4.20 * g.sx, 3.90, 'gate'),
    hole(-4.30 * g.sx, Y0 + 1.10, 1.10, 1.90, 'win'),
    hole(4.30 * g.sx, Y0 + 1.10, 1.10, 1.90, 'win'),
  ];
  // THREE HIGH SQUARE WINDOWS PER FLANK, NOT A RIBBON. `ribbonBand` shares `civicWindow`'s
  // construction — a `p.shadow` reveal in front of a `p.glass` pane in front of a dark room — and
  // on the r1 plate the drill hall's flank owned 11.8 % of every crushed pixel on the model. A
  // nineteenth-century drill hall has punched clerestory lights between its buttresses anyway.
  // Four buttress piers make three bays; a light sits at the middle of each bay so no pier ever
  // stands in front of an opening.
  const pierZ = [0, 1, 2, 3].map((i) => g.hallBack + 0.62 + i * ((g.hallD - 1.24) / 3));
  const clerZ = [0, 1, 2].map((i) => (pierZ[i] + pierZ[i + 1]) / 2);
  const clerW = 1.05;
  const flank = clerZ.map((z) => hole(z, bandY - bandH / 2, clerW, bandH, 'win'));
  ctx.add(volume(ctx, {
    material: p.wallAlt, x: 0, zFront: g.hallFront, zBack: g.hallBack, width: g.hallW,
    y0: Y0, y1, front, left: flank, right: flank, room: true, name: 'os-hall',
  }));
  ctx.add(plinthCourse(ctx, {
    x: 0, z: cz, w: g.hallW, d: g.hallD, yBase: Y0 - 0.02, h: 0.78, proud: 0.13,
    material: p.metal, name: 'os-hall-plinth',
  }));
  // Buttress piers down both flanks — the structural rhythm a wide-span hall has and a shed
  // does not, and the thing that stops a 12.8 m brick box reading as a warehouse.
  for (const side of [-1, 1]) {
    for (const z of pierZ) {
      ctx.add([
        part(slab(0.44, y1 - Y0 - 0.9, 0.50, side * (hw + 0.20), Y0 + 0.10, z, 'os-hall-pier'), p.wallAlt),
        part(slab(0.56, 0.14, 0.62, side * (hw + 0.20), y1 - 0.80, z, 'os-hall-pier-cap'), p.trim),
      ]);
    }
    for (const z of clerZ) {
      barrackWindow(ctx, {
        x: side * hw, y: bandY, z, w: clerW, h: bandH,
        facing: side > 0 ? 'right' : 'left', bars: 2, blind: 0.30,
        id: `os-hallc${side}-${Math.round(z * 10)}`,
      });
    }
  }
  // The vehicle door onto the yard: a ribbed roller shutter in the metalwork bucket.
  const doorW = 4.20 * g.sx;
  ctx.add([part(box(doorW, 3.90, 0.14, 0, Y0 + 0.10 + 1.95, g.hallFront - 0.16,
    'os-hall-shutter'), p.metal)]);
  if (ctx.mid) {
    for (let i = 0; i < 7; i += 1) {
      ctx.add([part(box(doorW - 0.10, 0.09, 0.09, 0, Y0 + 0.40 + i * 0.50, g.hallFront - 0.06,
        'os-hall-rib'), p.trim)]);
    }
  }
  ctx.add([
    part(slab(doorW + 0.70, 0.30, 0.46, 0, Y0 + 4.00, g.hallFront + 0.02, 'os-hall-lintel'), p.trim),
    part(slab(doorW + 1.30, 0.20, 0.36, 0, Y0 + 4.30, g.hallFront + 0.02, 'os-hall-hood'), p.wall),
    part(slab(doorW + 1.30, 0.10, 0.52, 0, Y0 + 4.50, g.hallFront + 0.10, 'os-hall-hood-cap'), p.roof),
  ]);
  for (const x of [-4.30 * g.sx, 4.30 * g.sx]) {
    barrackWindow(ctx, {
      x, y: Y0 + 1.10 + 0.95, z: g.hallFront, w: 1.10, h: 1.90,
      facing: 'front', bars: 2, id: `os-hallw${x > 0 ? 'r' : 'l'}`,
    });
  }

  // The barrel. Wide-span, faceted, seamed, with brick arch ends closing it.
  //
  // `core.js`'s `barrelRoof` is bound to `p.roof` — #404041 under the fallback scheme — and the
  // round-1 census is explicit that a large near-black roof plane is the biggest single gap to
  // the reference. So the shell is built locally in `trim`, which is a GALVANISED SHEET drill
  // hall roof: correct for the building, the lightest bucket on the model, and the value break
  // the terracotta hips need behind them. Same facet count, same seam rhythm, same fascia.
  const rise = 3.20;
  barrelShell(ctx, {
    w: g.hallW, d: g.hallD, x: 0, z: cz, springY: y1, rise, facets: 7, overhang: 0.40,
    material: p.trim, name: 'os-hall-barrel',
  });
  for (const side of [-1, 1]) {
    ctx.add([part(arcEndPlate(g.hallW - 0.06, rise * 0.94, 0.34, 0, y1,
      cz + side * (g.hallD / 2 - 0.20), 'os-hall-arch', 8), p.wallAlt)]);
  }
  // Two ridge ventilators on the apex — the detail that reads as a hall roof and not a tunnel.
  if (ctx.mid) {
    for (const dz of [-0.28, 0.28]) {
      const vz = cz + dz * g.hallD;
      ctx.add([
        part(slab(1.90, 0.72, 0.90, 0, y1 + rise - 0.34, vz, 'os-vent'), p.wall),
        part(slab(2.20, 0.14, 1.16, 0, y1 + rise + 0.38, vz, 'os-vent-cap'), p.trim),
      ]);
      ctx.add(louvreScreen(ctx, {
        x: 0, y: y1 + rise - 0.24, z: vz + 0.47, w: 1.66, h: 0.52, axis: 'x', blades: 3,
        name: 'os-vent-lv',
      }));
    }
  }

  // The link between the block and the hall, so the two masses are one establishment.
  const linkZ = (g.hallFront + g.rangeBack) / 2;
  const linkD = g.rangeBack - g.hallFront;
  if (linkD > 0.6) {
    ctx.add(volume(ctx, {
      material: p.wallAlt, x: 0, zFront: g.rangeBack + 0.20, zBack: g.hallFront - 0.20,
      width: 3.60 * g.sx, y0: Y0, y1: Y0 + 3.40, room: true, name: 'os-link',
    }));
    ctx.add([
      part(slab(4.10 * g.sx, 0.18, linkD + 0.9, 0, Y0 + 3.40, linkZ, 'os-link-roof'), p.roof),
      part(slab(4.34 * g.sx, 0.12, linkD + 1.14, 0, Y0 + 3.58, linkZ, 'os-link-coping'), p.trim),
    ]);
  }

  // The boiler-house stack at the hall's rear corner — the model's right-hand vertical, matching
  // the flag masts at its left. Slim, brick, corbelled, and NOT a factory chimney: it stops
  // 0.10 m above the barrel apex rather than towering over it.
  const sx2 = Math.min(g.halfW - 0.75, 6.55);
  ctx.add([
    part(slab(1.55, 2.70, 2.10, sx2 - 0.10, Y0, g.hallBack + 1.55, 'os-plant'), p.wallAlt),
    part(slab(1.80, 0.16, 2.34, sx2 - 0.10, Y0 + 2.70, g.hallBack + 1.55, 'os-plant-cap'), p.trim),
    part(slab(0.80, 8.55, 0.80, sx2, Y0, g.hallBack + 0.95, 'os-stack'), p.wallAlt),
    part(slab(1.00, 0.34, 1.00, sx2, Y0 + 8.55, g.hallBack + 0.95, 'os-stack-corbel'), p.trim),
    part(slab(0.72, 0.40, 0.72, sx2, Y0 + 8.89, g.hallBack + 0.95, 'os-stack-cap'), p.metal),
  ]);
}

/* ═══════════════════════════════ lot furniture ═════════════════════════════════════════════ */

function furniture(ctx, g) {
  const { p } = ctx;
  // Lamp standards down both edges of the parade.
  for (const side of [-1, 1]) {
    for (const z of [g.paradeBack + 2.4, g.paradeFront - 1.6]) {
      lampStandard(ctx, side * (g.paradeW / 2 + 1.05), z, `os-lamp${side}${Math.round(z)}`);
    }
  }
  if (!ctx.mid) return;
  ctx.add(bench(ctx, { x: -(g.paradeW / 2 + 1.15), z: g.paradeBack + 4.6, w: 1.8, axis: 'z', name: 'os-bench' }));
  ctx.add(bin(ctx, { x: -(g.paradeW / 2 + 1.15), z: g.paradeBack + 6.1, name: 'os-bin' }));
  // NO CANOPY TREES ON THIS LOT, AND THE REASON IS ARITHMETIC RATHER THAN TASTE. `canopyTree`'s
  // own header measures its crown reaching about 1.8 x `canopy`, so a 1.30 m canopy occupies a
  // 4.7 m circle. The only unbuilt ground left here is the 2.0 m service yard between the block
  // and the hall and a 0.9 m verge, and a tree in either walks straight into a wall or off the
  // tile — which is the exact fault `overhang.mjs` exists for. The verge carries clipped hedge
  // and cones instead, which is what a parade ground's surround actually has.
}

/* ═══════════════════════════════ local primitives ══════════════════════════════════════════ */
/*
 * Everything below is a primitive `civic/core.js` does not have. §3 of the programme spec is
 * explicit that a lane writes local helpers rather than editing the shared kit, so these live
 * here and nothing outside this file changes.
 */


/* ══════════════════ THE WINDOW, AND WHY THIS SUBJECT BUILDS ITS OWN ═══════════════════════════
 *
 * [MEASURED] on `laneG-r1/officer-school--three-quarter.png` with `measure-plate.py` and a crush
 * map at luma 12: the plate came back at **7.375 % crush against a 2.0 % target**, and a
 * four-region attribution put **60.7 % of every crushed pixel inside the barracks block**, at
 * 12.26 % of that region. The crush map is unambiguous about what those pixels are — every red
 * blob on the building is a window.
 *
 * The cause is structural rather than incidental, and it is worth stating exactly because it
 * applies to every civic subject:
 *
 *   `openings.js` `civicWindow` builds a four-sided reveal in `p.shadow`, which aliases the
 *   metalwork bucket, and `volume()` builds a dark room behind it in the same bucket. The pane
 *   is `p.glass`, which `surfaces.js:975` authors OPAQUE (`transparent = false`,
 *   `opacity = 1.0`) and warm-neutral-DARK at `envBase 0.22`. So an opening is: a dark pane, set
 *   0.26 m back inside a recess whose four returns are the darkest family on the model, in front
 *   of a dark box. Every surface a viewer can see through that hole is in the bottom bucket and
 *   none of them can be reached by the key. The result is a black rectangle, and there are
 *   twenty-nine of them.
 *
 *   That is exactly the r1 census finding — *"crush lives in albedo on your dark buckets, in how
 *   much sky a recess is allowed to see, and in how deep your self-shadowing geometry is cut"* —
 *   and every one of those three terms is in this one object.
 *
 * `mp-mansion-portico` and `mp-civic-blue` both have thirty-odd windows and crush 1.2 %. Their
 * windows are not black: the reveal is PALE STONE, the glazing is broken into small lights by
 * pale bars, and something light — a blind, a curtain head, a reflected sky — occupies the top
 * of every opening. So this subject builds its own sash to those four properties, and a lane may
 * do that because a lane may not edit `openings.js`:
 *
 *   1. THE REVEAL IS RENDER, NOT SHADOW. A brick building with cement dressings has a rendered
 *      reveal; painting the return the colour of the darkest bucket on the model was never right
 *      for it and it is the largest single term.
 *   2. THE RECESS IS 0.16 m, NOT 0.26. Depth is how much sky the pane sees. 0.16 m still throws
 *      a head and a sill shadow at this scale — the modelled relief §2.2 asks for survives.
 *   3. A HOLLAND BLIND OCCUPIES THE TOP 38 % OF EVERY OPENING, in `trim`. It is what an
 *      institutional sash actually has, it is the reference's own move, and it converts more
 *      than a third of every pane from the darkest bucket to the lightest one.
 *   4. THE SASH IS PALE AND IT STANDS PROUD OF THE GLASS. Two stiles, two rails, a meeting rail
 *      and two glazing bars in `trim`, 30 mm in front of the pane so each casts its own line.
 *
 * A light BACK PANEL closes the opening 0.28 m in, in front of `volume()`'s own dark room, so
 * what is seen past the glass is a lit soffit rather than the room box. Nothing is removed from
 * the envelope: the hole is still punched, the room is still there, and the pane is still glass.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Wall-face basis: `n` is outward from the face, `u` across it. */
function faceBasis(facing) {
  if (facing === 'right') return { nx: 1, nz: 0, ux: 0, uz: -1, yaw: Math.PI / 2 };
  if (facing === 'left') return { nx: -1, nz: 0, ux: 0, uz: 1, yaw: -Math.PI / 2 };
  return { nx: 0, nz: 1, ux: 1, uz: 0, yaw: 0 };
}

function facePlank(b, o, { u = 0, v = 0, n = 0, w, h, t }, name) {
  const gm = box(w, h, t, 0, 0, 0, name);
  gm.rotateY(b.yaw);
  gm.translate(o.x + b.ux * u + b.nx * n, o.y + v, o.z + b.uz * u + b.nz * n);
  gm.computeBoundingBox();
  return gm;
}

/**
 * A double-hung barracks sash in a masonry opening. `x, y, z` is the CENTRE of the opening on
 * the outer wall face; the caller has already punched a matching `hole()` in the volume.
 */
function barrackWindow(ctx, {
  x, y, z, w = 1.0, h = 1.86, facing = 'front', bars = 2, blind = 0.38, id = 'sash',
}) {
  const { p } = ctx;
  const b = faceBasis(facing);
  const o = { x, y, z };
  const rec = 0.16;
  const out = [];
  const pl = (spec, nm, mat) => out.push(part(facePlank(b, o, spec, `${id}-${nm}`), mat));

  // Rendered reveal: head, sill and two jambs, all in the render family.
  pl({ v: h / 2 - 0.045, n: -rec / 2, w: w + 0.18, h: 0.09, t: rec }, 'rev-head', p.wall);
  pl({ v: -h / 2 + 0.045, n: -rec / 2, w: w + 0.18, h: 0.09, t: rec }, 'rev-sill', p.wall);
  pl({ u: -w / 2 - 0.045, n: -rec / 2, w: 0.09, h, t: rec }, 'rev-jamb-l', p.wall);
  pl({ u: w / 2 + 0.045, n: -rec / 2, w: 0.09, h, t: rec }, 'rev-jamb-r', p.wall);
  // Chunky precast head and sill standing proud, which is the modelled section §2.2 asks for.
  pl({ v: h / 2 + 0.12, n: 0.07, w: w + 0.40, h: 0.22, t: 0.24 }, 'head', p.trim);
  pl({ v: -h / 2 - 0.11, n: 0.10, w: w + 0.40, h: 0.20, t: 0.30 }, 'sill', p.trim);
  // The lit back panel, in front of `volume()`'s dark room.
  pl({ n: -0.28, w: w + 0.04, h: h + 0.04, t: 0.06 }, 'back', p.wall);
  // The pane.
  pl({ n: -rec - 0.02, w: w - 0.10, h: h - 0.10, t: 0.05 }, 'pane', p.glass);
  // The Holland blind, in the lightest bucket, hung from the head.
  pl({
    v: h / 2 - (h * blind) / 2 - 0.09, n: -rec + 0.02,
    w: w - 0.16, h: h * blind, t: 0.04,
  }, 'blind', p.trim);
  // The sash: stiles, rails, meeting rail and glazing bars, proud of the glass.
  const f = 0.11;
  const sn = -rec + 0.05;
  pl({ u: -w / 2 + f / 2, n: sn, w: f, h, t: 0.09 }, 'stile-l', p.trim);
  pl({ u: w / 2 - f / 2, n: sn, w: f, h, t: 0.09 }, 'stile-r', p.trim);
  pl({ v: h / 2 - f / 2, n: sn, w, h: f, t: 0.09 }, 'rail-t', p.trim);
  pl({ v: -h / 2 + f / 2, n: sn, w, h: f, t: 0.09 }, 'rail-b', p.trim);
  pl({ v: -h * 0.06, n: sn, w, h: 0.10, t: 0.08 }, 'meet', p.trim);
  if (ctx.mid) {
    for (let i = 1; i <= bars; i += 1) {
      pl({ u: -w / 2 + (w * i) / (bars + 1), n: sn, w: 0.07, h: h - f * 2, t: 0.07 },
        `bar${i}`, p.trim);
    }
  }
  ctx.add(out);
}

/**
 * A faceted barrel shell with a material of its own. `core.js`'s `barrelRoof` is bound to
 * `p.roof`, and this subject needs its widest roof plane in a light bucket — see the call site.
 */
function barrelShell(ctx, {
  w, d, x = 0, z, springY, rise, facets = 7, overhang = 0.40, material = null, name = 'barrel',
}) {
  const { p } = ctx;
  const mat = material ?? p.roof;
  const out = [];
  const span = w + overhang * 2;
  const run = d + overhang * 2;
  const r = ((span * span) / 4 + rise * rise) / (2 * rise);
  const cy = springY + rise - r;
  const half = Math.asin(Math.min(1, (span / 2) / r));
  const t = 0.16;
  for (let i = 0; i < facets; i += 1) {
    const a0 = -half + (i / facets) * half * 2;
    const a1 = -half + ((i + 1) / facets) * half * 2;
    const am = (a0 + a1) / 2;
    const px0 = Math.sin(a0) * r; const py0 = cy + Math.cos(a0) * r;
    const px1 = Math.sin(a1) * r; const py1 = cy + Math.cos(a1) * r;
    const len = Math.hypot(px1 - px0, py1 - py0);
    const mx = x + (px0 + px1) / 2;
    const my = (py0 + py1) / 2;
    out.push(part(rotBox(len, t, run, mx, my, z, { z: -am }, `${name}-facet`), mat));
    if (ctx.mid) {
      const n = Math.max(3, Math.round(run / (M.seamPitch * 1.9)));
      for (let k = 0; k < n; k += 1) {
        const u = -run / 2 + (k + 0.5) * (run / n);
        out.push(part(rotBox(len, 0.07, 0.05, mx, my + 0.10, z + u, { z: -am },
          `${name}-seam`), p.metal));
      }
    }
  }
  for (const side of [1, -1]) {
    out.push(part(box(0.22, 0.24, run + 0.08, x + side * span / 2, springY - 0.02, z,
      `${name}-fascia`), p.wall));
    out.push(part(box(0.24, 0.18, run + 0.04, x + side * (span / 2 + 0.18), springY + 0.14, z,
      `${name}-gutter`), p.metal));
  }
  ctx.add(out);
}


/**
 * A clipped conifer: a stacked cone of leaf clumps on a short trunk.
 *
 * `shrubMass` is a four-lobe BALL and it is the wrong plant here — r1 used it at h 1.72 and the
 * plate shows a grey lump. The reference's base planting is a row of narrow dark cypress, whose
 * whole value is a tall narrow silhouette against masonry, so this stacks four clumps on a
 * shrinking radius up one stem and takes its jitter from the cone's own tag.
 */
function clippedCone(ctx, x, z, y, h, name) {
  const { p } = ctx;
  const out = [part(slab(0.13, h * 0.20, 0.13, x, y, z, `${name}-stem`), p.wallAlt)];
  const tiers = ctx.detail ? 4 : 3;
  for (let i = 0; i < tiers; i += 1) {
    const t = i / tiers;
    const r = h * 0.30 * (1 - t * 0.72) * (0.90 + inst(ctx, name, 10 + i) * 0.20);
    out.push(part(leafClump(r, x + (inst(ctx, name, 20 + i) - 0.5) * h * 0.05,
      y + h * (0.20 + t * 0.74) + r * 0.42,
      z + (inst(ctx, name, 30 + i) - 0.5) * h * 0.05,
      `${name}-tier`, 0, `${name}-${i}`), p.garden));
  }
  ctx.add(out);
}

/** A clipped hedge that can run along Z. `core.js`'s `hedgeRun` is X-only. */
function hedge(ctx, { x, z, len, axis = 'x', h = 0.90, d = 0.68, salt = 3610, name = 'hedge' }) {
  const { p, v } = ctx;
  const out = [];
  const segs = 4;
  for (let i = 0; i < segs; i += 1) {
    const t = -len / 2 + (i + 0.5) * (len / segs);
    const sl = (len / segs) * 1.12;
    const sh = h * v.range(salt + i, 0.88, 1.06);
    const sd = d * v.range(salt + i + 20, 0.86, 1.10);
    out.push(part(axis === 'x'
      ? slab(sl, sh, sd, x + t, Y0, z + v.range(salt + i + 40, -0.05, 0.05), `${name}-body`)
      : slab(sd, sh, sl, x + v.range(salt + i + 40, -0.05, 0.05), Y0, z + t, `${name}-body`),
    p.garden));
  }
  ctx.add(out);
  if (!ctx.mid) return;
  const n = Math.max(4, Math.round(len / 0.95));
  for (let i = 0; i < n; i += 1) {
    const t = -len / 2 + (i + 0.5) * (len / n);
    ctx.add(shrubMass(ctx, {
      x: axis === 'x' ? x + t : x, z: axis === 'x' ? z : z + t,
      r: v.range(salt + i + 60, 0.26, 0.36), h: 0.34, y: Y0 + h * 0.80,
      seed: `${name}-crown-${i}`, name: `${name}-crown`,
    }));
  }
}

/** A twin-flue brick chimney stack with a corbelled cap and pots. */
function chimney(ctx, x, z, yBase, h) {
  const { p } = ctx;
  ctx.add([
    part(slab(1.24, h, 0.66, x, yBase, z, 'os-chim'), p.wallAlt),
    part(slab(1.44, 0.20, 0.84, x, yBase + h, z, 'os-chim-corbel'), p.trim),
    part(slab(1.30, 0.14, 0.72, x, yBase + h + 0.20, z, 'os-chim-cap'), p.trim),
  ]);
  if (!ctx.mid) return;
  for (const dx of [-0.32, 0.32]) {
    ctx.add([part(cyl(0.15, 0.44, x + dx, yBase + h + 0.56, z, 'y', 'os-chim-pot', 7), p.wallAlt)]);
  }
}

/** The louvred cupola on the axis — the model's crown, and the mark that names the centreline. */
function cupola(ctx, g, cz, ridgeY) {
  const { p } = ctx;
  const base = ridgeY - 0.55;
  const w = 1.70;
  ctx.add([
    part(slab(w + 0.44, 0.26, w + 0.44, 0, base, cz, 'os-cup-plinth'), p.trim),
    part(slab(w, 1.86, w, 0, base + 0.26, cz, 'os-cup-body'), p.wall),
    part(slab(w + 0.36, 0.22, w + 0.36, 0, base + 2.12, cz, 'os-cup-cornice'), p.trim),
  ]);
  for (const [axis, dx, dz] of [['x', 0, w / 2 + 0.02], ['x', 0, -w / 2 - 0.02],
    ['z', w / 2 + 0.02, 0], ['z', -w / 2 - 0.02, 0]]) {
    ctx.add(louvreScreen(ctx, {
      x: dx, y: base + 0.44, z: cz + dz, w: w - 0.34, h: 1.42,
      axis: axis === 'x' ? 'x' : 'z', blades: 4, name: 'os-cup-lv',
    }));
  }
  const capY = base + 2.34;
  ctx.add([
    part(chamferSlab(w + 0.30, w + 0.30, 1.05, 0, 0, capY, cz, 'os-cup-cap', (w + 0.30) / 2 - 0.09), p.accent),
    part(taper(0.13, 0.05, 0.62, 0, capY + 1.05, cz, 'os-cup-finial', 6), p.trim),
    // A BALL AND A PENNANT, NOT A CROSS. r1 crossed two equal bars on the finial and on the plate
    // that is a Christian cross on the ridge of a military school — wrong for this subject and
    // the identifying mark of lane F's chapel four metres away on the same board. A weathervane
    // is an ARROW: one long member with a tail, and a ball under it.
    part(cyl(0.13, 0.13, 0, capY + 1.67, cz, 'y', 'os-cup-ball', 8), p.trim),
    part(box(0.86, 0.05, 0.05, 0.06, capY + 1.94, cz, 'os-cup-vane'), p.metal),
    part(triPlate(0.34, 0.30, 0.04, 0.40, capY + 1.94, cz, 'os-cup-vane-tail'), p.metal),
  ]);
}

/**
 * The tympanum clock. Two discs and two hands, sized against the derived board scale in
 * `core.js`'s signage note: at 7.33 px/m a 1.12 m dial is 8 px and its 0.09 m hands are 0.7 px —
 * so the DIAL carries the board-zoom read and the hands are the detail-station payoff, which is
 * the same ordering `iconRoundel` is built on.
 */
function clockFace(ctx, { x, y, z, r = 0.56, name = 'clock' }) {
  const { p } = ctx;
  ctx.add([
    part(cyl(r, 0.14, x, y, z, 'z', `${name}-surround`, 12), p.trim),
    part(cyl(r * 0.80, 0.10, x, y, z + 0.07, 'z', `${name}-dial`, 12), p.wall),
    part(box(0.075, r * 0.98, 0.06, x, y + r * 0.16, z + 0.12, `${name}-hand-m`), p.metal),
    part(rotBox(r * 0.62, 0.075, 0.06, x + r * 0.20, y, z + 0.12, { z: 0.55 }, `${name}-hand-h`), p.metal),
    part(cyl(0.07, 0.08, x, y, z + 0.15, 'z', `${name}-boss`, 6), p.metal),
  ]);
  if (!ctx.detail) return;
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    ctx.add([part(box(0.07, 0.13, 0.05, x + Math.cos(a) * r * 0.63, y + Math.sin(a) * r * 0.63,
      z + 0.11, `${name}-mark`), p.metal)]);
  }
}

/** The unit crest — a shield on the entrance bay, in the one saturated bucket the palette has. */
function crest(ctx, { x, y, z, w = 0.86, h = 1.04, name = 'crest' }) {
  const { p } = ctx;
  ctx.add([
    part(slab(w + 0.16, h + 0.16, 0.10, x, y - 0.08, z + 0.04, `${name}-frame`), p.trim),
    part(slab(w, h * 0.66, 0.14, x, y, z + 0.06, `${name}-field`), p.accent),
    part(chamferSlab(w, w, h * 0.36, 0, x, y + h * 0.66, z + 0.06, `${name}-point`, w / 2 - 0.07), p.accent),
    part(box(w * 0.72, 0.10, 0.05, x, y + h * 0.44, z + 0.14, `${name}-bar`), p.trim),
    part(box(w * 0.34, 0.10, 0.05, x, y + h * 0.22, z + 0.14, `${name}-bar2`), p.trim),
  ]);
}

/** The guard box at the gate: a small hipped hut, glazed on the two faces that watch the drive. */
function guardBox(ctx, g, x, z) {
  const { p } = ctx;
  const w = 1.90;
  const y1 = Y0 + 2.62;
  ctx.add([
    part(slab(w + 0.44, 0.20, w + 0.44, x, Y0 - 0.02, z, 'os-guard-pad'), p.ground),
    part(slab(w, y1 - Y0 - 0.18, w, x, Y0 + 0.18, z, 'os-guard-body'), p.wallAlt),
    part(slab(w + 0.10, 0.34, w + 0.10, x, Y0 + 0.18, z, 'os-guard-plinth'), p.metal),
    part(slab(w + 0.36, 0.16, w + 0.36, x, y1, z, 'os-guard-fascia'), p.trim),
    part(chamferSlab(w + 0.52, w + 0.52, 0.64, 0, x, y1 + 0.16, z, 'os-guard-hip',
      (w + 0.52) / 2 - 0.16), p.accent),
    // The glazed watch faces — one to the drive (+x) and one to the road (+z).
    //
    // r2: these were two 1.05 x 1.46 m panes of `p.glass` sunk 0.03 m into a brick box, and on
    // the r1 plate they are two of the blackest rectangles on the model at 4x. A sentry box is
    // glazed almost to the corner and it has a pale frame; the pane now sits AT the face rather
    // than behind it, and it is divided by a painted frame and a transom that between them own
    // more of the opening than the glass does.
    part(box(0.06, 1.05, w - 0.44, x + w / 2 + 0.01, Y0 + 1.62, z, 'os-guard-glass-x'), p.glass),
    part(box(w - 0.44, 1.05, 0.06, x, Y0 + 1.62, z + w / 2 + 0.01, 'os-guard-glass-z'), p.glass),
    part(box(0.08, 0.16, w - 0.44, x + w / 2 + 0.04, Y0 + 1.86, z, 'os-guard-tran'), p.trim),
    part(box(w - 0.44, 0.16, 0.08, x, Y0 + 1.86, z + w / 2 + 0.04, 'os-guard-tran2'), p.trim),
    part(box(0.08, 1.05, 0.10, x + w / 2 + 0.04, Y0 + 1.62, z - w / 2 + 0.28, 'os-guard-mull'), p.trim),
    part(box(0.10, 1.05, 0.08, x - w / 2 + 0.28, Y0 + 1.62, z + w / 2 + 0.04, 'os-guard-mull2'), p.trim),
    part(box(0.12, 0.13, w - 0.30, x + w / 2 + 0.04, Y0 + 2.18, z, 'os-guard-head'), p.trim),
    part(box(w - 0.30, 0.13, 0.12, x, Y0 + 2.18, z + w / 2 + 0.04, 'os-guard-head2'), p.trim),
    part(box(0.14, 0.15, w - 0.30, x + w / 2 + 0.05, Y0 + 1.06, z, 'os-guard-sill'), p.trim),
    part(box(w - 0.30, 0.15, 0.14, x, Y0 + 1.06, z + w / 2 + 0.05, 'os-guard-sill2'), p.trim),
  ]);
}

/** The boom: a counterweighted arm in red-and-white bands on a pivot post. */
function boom(ctx, g, x, z) {
  const { p } = ctx;
  const y = Y0 + 1.14;
  const len = 6.30;
  ctx.add([
    part(slab(0.30, 1.32, 0.30, x, Y0, z, 'os-boom-post'), p.metal),
    part(slab(0.46, 0.14, 0.46, x, Y0 + 1.32, z, 'os-boom-cap'), p.trim),
    part(box(0.44, 0.34, 0.34, x - 0.42, y, z, 'os-boom-weight'), p.metal),
  ]);
  const bands = 7;
  for (let i = 0; i < bands; i += 1) {
    const seg = len / bands;
    ctx.add([part(box(seg + 0.02, 0.15, 0.15, x + 0.25 + (i + 0.5) * seg, y, z, 'os-boom-arm'),
      i % 2 === 0 ? p.accent : p.trim)]);
  }
  ctx.add([part(slab(0.18, 0.94, 0.18, x + 0.25 + len, Y0, z, 'os-boom-rest'), p.metal)]);
}

/**
 * A memorial obelisk on a three-step base. §6G's "memorial gun or obelisk".
 *
 * r2: r1 built a CONE. `chamferSlab(0.92, …, insetTop 0.26)` takes a 0.92 m shaft down to 0.40 m
 * over 2.90 m — a 5-degree batter is an obelisk, a 10-degree one is a traffic cone, and at 4x on
 * the r1 plate that is exactly what it read as. An obelisk is a nearly parallel shaft with a
 * short PYRAMIDION on top, and the two have to be separate objects with a moulding between them.
 * It is also in `wall` and `trim` rather than `metal`, because a war memorial is pale stone and a
 * dark grey spike on a parade ground reads as a headstone.
 */
function obelisk(ctx, g, x, z) {
  const { p } = ctx;
  ctx.add([
    part(slab(1.66, 0.22, 1.66, x, Y0, z, 'os-mem-step0'), p.trim),
    part(slab(1.34, 0.22, 1.34, x, Y0 + 0.22, z, 'os-mem-step1'), p.trim),
    part(slab(1.06, 0.34, 1.06, x, Y0 + 0.44, z, 'os-mem-die'), p.wall),
    part(slab(1.20, 0.13, 1.20, x, Y0 + 0.78, z, 'os-mem-cap'), p.trim),
    part(chamferSlab(0.72, 0.72, 2.62, 0, x, Y0 + 0.91, z, 'os-mem-shaft', 0.08), p.wall),
    part(slab(0.72, 0.10, 0.72, x, Y0 + 3.53, z, 'os-mem-neck'), p.trim),
    part(chamferSlab(0.60, 0.60, 0.46, 0, x, Y0 + 3.63, z, 'os-mem-pyramidion', 0.28), p.wall),
    part(box(0.54, 0.40, 0.06, x, Y0 + 1.78, z + 0.32, 'os-mem-plaque'), p.accent),
  ]);
}

/**
 * A lamp standard: a fluted post on a moulded base with a square glazed lantern.
 *
 * r2: r1 put SIX of these at 4.07 m with a 0.62 m conical hood down both flanks of the parade,
 * and on the plate they read as a row of pale mushrooms standing in front of the façade — the
 * loudest wrong object in the frame. A parade-ground standard is short, dark-painted and has a
 * SQUARE glazed lantern with a small pyramid cap; the hood is the part that was doing the
 * damage and it is now smaller than the lantern under it. Four, not six, and 2.95 m.
 */
function lampStandard(ctx, x, z, name) {
  const { p } = ctx;
  const h = 2.72;
  const topY = Y0 + 0.26 + h;
  ctx.add([
    part(slab(0.40, 0.26, 0.40, x, Y0, z, `${name}-base`), p.metal),
    part(taper(0.095, 0.062, h, x, Y0 + 0.26, z, `${name}-post`, 7), p.metal),
    part(slab(0.24, 0.10, 0.24, x, topY, z, `${name}-collar`), p.metal),
    part(box(0.26, 0.44, 0.26, x, topY + 0.32, z, `${name}-lantern`), p.glass),
    part(box(0.30, 0.06, 0.30, x, topY + 0.10, z, `${name}-lantern-foot`), p.trim),
    part(chamferSlab(0.34, 0.34, 0.20, 0, x, topY + 0.54, z, `${name}-cap`, 0.13), p.metal),
  ]);
  if (!ctx.mid) return;
  for (const [dx, dz] of [[0.11, 0], [-0.11, 0], [0, 0.11], [0, -0.11]]) {
    ctx.add([part(box(dz ? 0.22 : 0.05, 0.44, dz ? 0.05 : 0.22, x + dx, topY + 0.32, z + dz,
      `${name}-lantern-frame`), p.trim)]);
  }
}

export default buildOfficerSchool;
