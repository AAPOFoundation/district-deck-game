// District Deck V3.40 — `bungalow-californian`, the 1920s Californian bungalow.
//
// Read ./CONTRACT.md before editing. This file assembles; it never creates a material and never
// invents a member size that `house-kit.js` or `house-detail.js` already publishes.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE MASSING, AND WHY IT IS NOT ONE ROOF
//
// The body is about 12.5 × 10.8 and `env.ridgeY` is authored at 5.50. One hip or gable over the
// 10.8 m depth at 26° puts a ridge 6.6 m up; over the width it is worse. Either is a tall house
// wearing a bungalow's ornament. So the plan is broken into four masses and `roofIntersection`
// solves where they meet:
//
//   PRIMARY   a broad low HIP, ridge along X, over the front 6.10 m of the plan at 22°. Ridge
//             5.086. This is the eave line the whole frontage reads against, and its 0.95
//             overhang carries the rafter tails.
//   GABLE A   the dominant street gable — ridge along Z, 26°, rising out of the primary's front
//             pitch and landing on `env.ridgeY` EXACTLY, because its span is solved backwards
//             from the target rather than authored and hoped for. Shingle courses over a moulded
//             belt, heavy barge boards, four knee brackets a rake.
//   GABLE C   the porch gable — smaller, lower, and projecting 0.54 m forward of gable A's rake
//             plane. Its own soffit slab is the porch ceiling at 3.21 on `shadow`.
//   REAR      a lower service wing on a wall 0.62 m shorter, hipped at 22°, ridge 4.09, so both
//             flanks and the rear carry a real step in the roofline rather than a blank plane.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE WIDTH, AND WHY IT IS NOT `env.bodyW`
//
// `env.bodyW` is up to 13.82 and `KIT_METRICS.overhang['bungalow-californian']` is 0.95, so a
// roof over the full footprint reaches ±7.86 on a lot plate that ends at ±7.50. The eaves would
// hang off the tile — the one thing a three-quarter plate cannot forgive. The wall plane is
// therefore set at `lotW / 2 − 0.30 − overhang`, which puts the walls at ±6.25 (83 % of the tile,
// the "about four fifths" §7.4 asks for) and the EAVE at ±7.20, exactly on the lawn edge where
// the chamfer begins. The overhang is kept — it is the archetype — and the footprint yields.

import {
  KIT_METRICS,
  floorPlate,
  wallShell,
  hipRoof,
  gableRoof,
  eaves,
  roofIntersection,
  verandahFrame,
  chimney,
} from './house-kit.js';
import {
  casementBank,
  frontDoor,
  rafterTails,
  kneeBracket,
  taperedPier,
  shingleCourses,
  ventGrille,
  chimneyCap,
  gutterAndDownpipe,
} from './house-detail.js';
import {
  lotSurface,
  path,
  boundary,
  gate,
  planting,
  letterbox,
  kerbAndFootpath,
} from './garden.js';

const DEG = Math.PI / 180;

/** Salt band owned by this file — CONTRACT.md §5. 1800–1899, and nothing outside it. */
const SALT = Object.freeze({
  gableOffset: 1800,
  chimneyZ: 1801,
  windowJitter: 1810,   // 1810–1839, one per placed opening
});

/**
 * Authored numbers, in one readable block so a critic can check the massing without running it.
 * Everything below is derived from these and from `ctx.env`; nothing is written twice.
 */
const T = Object.freeze({
  roofCourseStep: 0.030,  // R140: tile noses subordinate to the four coherent roof planes
  fasciaDepth: 0.20, fasciaThickness: 0.09, bargeDepth: 0.24, bargeThickness: 0.10,
  pitchGable: 26,          // KIT_METRICS.pitchDeg['bungalow-californian']
  pitchHip: 22,            // the hips sit shallower so the street gable is the tallest thing
  rearOverhang: 0.72,
  porchOverhang: 0.55,

  frontDepth: 6.10,        // primary hip plan depth; the rest of the body is the rear wing
  porchDepth: 2.60,        // recess behind the front wall plane
  porchProud: 0.35,        // deck, beam and piers stand this far IN FRONT of the wall plane
  porchHalfW: 2.60,        // the porch opening runs x −2.60 … +2.60
  rearDrop: 0.62,          // how much shorter the rear wing's wall is

  gableSetBack: 0.24,      // gable A's rake plane, behind the primary's front eave
  gablePanelInset: 0.14,   // measured from the RAKE PLANE, not from a wall — see notes below
  gableBaseClear: 0.16,    // gable A's spring above the hip skin at its own panel plane
  porchProject: 0.30,      // gable C's rake plane, in front of the primary's front eave
  porchPanelInset: 0.24,
  porchGableW: 4.20,
  porchBeamY: 2.86,        // beam soffit
  porchBeamDepth: 0.30,    // subordinate beam beneath the porch roof

  pierBaseW: 0.68,         // > pierHeadW. taperedPier clamps anyway; these are the intended pair
  pierHeadW: 0.42,
  pierPedestal: 1.38,      // clinker pedestal, base-course height, so the masonry lines up
  pierPedestalW: 0.78,
  pierX: 1.30,             // piers either side of the entry gap
  dwarfWallH: 1.34,        // brick porch wall, from the GROUND, between pier and return

  // Round 2. The clinker band was 1.02 above the floor with the window sills sitting straight on
  // it, so the street elevation ran brick from the ground to the glazing with a 0.28 strip of
  // render under the plate and nothing between the bellcast and the sills. Brick was 47 % of the
  // elevation. Now 0.78 of clinker (40 %), a 0.12 render reveal above the bellcast, and shorter
  // windows leaving 0.53 of render under the wall plate.
  baseCourseH: 0.78,       // clinker base course height above the floor
  sillH: 0.90,             // window sill above the floor — 0.12 of render above the bellcast
  winH: 1.42,              // street bank height; head at 2.94 against a 3.47 plate
  winHSmall: 1.34,         // flank and porch banks

  rafterPitch: 0.58,       // tail spacing; DETAIL's default is 0.62 and this eave is deep
  rafterDepth: 0.48,       // projection into a 0.95 overhang
  // Round 2. Was 0.55, standing off a gable field only 1.72 high. The blocks and the brackets are
  // the only things that genuinely shadow that field, and they were doing it across its whole
  // area. `detail-rafter-tails-brackets.png` shows the blocks projecting about the barge's own
  // thickness past its face, not half a metre.
  rakeBlockDepth: 0.16,
  shingleCourse: 0.185,    // nine courses up the street gable

  chimneyW: 0.95,
  chimneyD: 1.70,
  chimneyAboveRoof: 1.20,
  chimneyAboveRidge: 0.50,
});

/**
 * Every line of the building, derived once. Pure: same ctx, same numbers, so the report and the
 * geometry cannot disagree and a second consumer never recomputes a spring line.
 */
function massing(ctx) {
  const e = ctx.env;
  const OH = KIT_METRICS.overhang[ctx.id] ?? 0.95;
  const kG = Math.tan(T.pitchGable * DEG);
  const kH = Math.tan(T.pitchHip * DEG);

  const halfW = Math.min(e.bodyW / 2, e.lotW / 2 - 0.30 - OH);
  const wallW = halfW * 2;
  const FZ = e.frontZ;
  const BZ = e.backZ;
  const bodyD = FZ - BZ;
  const SY = e.floorY + e.wallH;

  const frontD = Math.min(T.frontDepth, bodyD - 3.20);
  const rearD = bodyD - frontD;

  // ── primary hip ────────────────────────────────────────────────────────────────────────
  const hipZ = FZ - frontD / 2;
  const hipRidgeY = SY + (kH * (frontD + OH * 2)) / 2;
  const eaveX = halfW + OH;
  const eaveFrontZ = FZ + OH;
  const eaveBackZ = FZ - frontD - OH;
  /** The hip's front pitch, as a height, at any z in front of its ridge. */
  const hipFrontY = (z) => SY + kH * (eaveFrontZ - z);

  // ── rear wing ──────────────────────────────────────────────────────────────────────────
  const rearSY = SY - T.rearDrop;
  const rearZ = FZ - frontD - rearD / 2;
  const rearRidgeY = rearSY + (kH * (rearD + T.rearOverhang * 2)) / 2;
  const rearEaveX = halfW + T.rearOverhang;
  const rearEaveBackZ = BZ - T.rearOverhang;

  // ── gable A: the street gable ──────────────────────────────────────────────────────────
  // `gableRoof` insets its panel from the RAKE PLANE, so a 0.14 inset behind a rake that stands
  // 0.24 behind the primary's eave puts the gable face at eave − 0.38. The spring line is then
  // solved so the panel's bottom edge, and the moulded belt under it, clear the hip skin at
  // that exact z — not at the rake plane, which is where a 0.16 default would have buried it.
  const gableFrontZ = eaveFrontZ - T.gableSetBack;
  const gablePanelZ = gableFrontZ - T.gablePanelInset;
  const gableSpringY = hipFrontY(gablePanelZ) + T.gableBaseClear;
  const gableRidgeY = e.ridgeY;                              // 5.50, authored, hit exactly
  // Solved BACKWARDS from the target, at KIT's own pitch, so the ridge cannot drift by facade.
  const gableB = ((gableRidgeY - gableSpringY) * 2) / kG;    // roof width including both eaves
  const gableW = gableB - OH * 2;
  const gableRearZ = hipZ;                                   // dies at the primary's ridge
  const gableA = gableFrontZ - gableRearZ;                   // ridge length including both rakes
  const gableD = gableA - OH * 2;
  const gableZ = (gableFrontZ + gableRearZ) / 2;
  const gableX = 0.45 + (ctx.v ? ctx.v.range(SALT.gableOffset, -0.24, 0.24) : 0);

  // ── gable C: the porch gable ───────────────────────────────────────────────────────────
  // Its panel has to stand IN FRONT of the primary's front eave, because its spring line (3.28,
  // the beam top) is below the eave line (3.47) and anything behind the eave is inside the hip.
  const porchSpringY = T.porchBeamY + T.porchBeamDepth;
  const porchB = T.porchGableW + T.porchOverhang * 2;
  const porchRidgeY = porchSpringY + (kG * porchB) / 2;
  const porchFrontZ = eaveFrontZ + T.porchProject;
  const porchPanelZ = porchFrontZ - T.porchPanelInset;
  const porchRearZ = FZ - T.porchDepth - 0.40;
  const porchA = porchFrontZ - porchRearZ;
  const porchD = porchA - T.porchOverhang * 2;
  const porchZ = (porchFrontZ + porchRearZ) / 2;
  const porchFront = FZ + T.porchProud;      // deck / beam / pier front edge

  // ── wall blocks ────────────────────────────────────────────────────────────────────────
  const bayW = halfW - T.porchHalfW;             // the walled bay each side of the porch
  const bayX = T.porchHalfW + bayW / 2;
  const midD = frontD - T.porchDepth;
  const midZ = FZ - T.porchDepth - midD / 2;

  // ── chimney ────────────────────────────────────────────────────────────────────────────
  // Outside the wall plane by 0.73, so the shaft IS the flank's breast, and inside the eave by
  // 0.22 so it passes through the hip end rather than clipping the fascia.
  const chimX = -(halfW + T.chimneyW / 2 - 0.22);
  const chimZ = hipZ - 2.10 + (ctx.v ? ctx.v.range(SALT.chimneyZ, -0.22, 0.22) : 0);

  return {
    OH, kG, kH, halfW, wallW, FZ, BZ, bodyD, SY,
    frontD, rearD, hipZ, hipRidgeY, eaveX, eaveFrontZ, eaveBackZ, hipFrontY,
    rearSY, rearZ, rearRidgeY, rearEaveX, rearEaveBackZ,
    gableFrontZ, gableRearZ, gablePanelZ, gableSpringY, gableRidgeY, gableB, gableW,
    gableA, gableD, gableZ, gableX,
    porchSpringY, porchB, porchRidgeY, porchFrontZ, porchPanelZ, porchRearZ,
    porchA, porchD, porchZ, porchFront,
    bayW, bayX, midD, midZ,
    chimX, chimZ,
    sillY: e.floorY + T.sillH,
    brickTop: e.floorY + T.baseCourseH,
  };
}

/** A base course spec, identical on every shell so the masonry band runs round the building. */
function baseCourse(ctx) {
  return {
    height: T.baseCourseH,
    material: ctx.p.wallAlt,
    proud: KIT_METRICS.baseCourseProud,
    moulding: true,
    mouldingMaterial: ctx.p.trim,
  };
}

/** Place joinery into every hole a shell actually punched, rather than guessing at coordinates. */
function glazeShell(ctx, shell, specs, indexBase) {
  let i = 0;
  for (const opening of shell.openings ?? []) {
    const spec = specs[i] ?? specs[specs.length - 1] ?? {};
    if (spec.kind === 'door') {
      ctx.add(frontDoor(ctx, { opening, fanlight: false, sidelights: false, panels: 4 }));
    } else {
      ctx.add(casementBank(ctx, { opening, lights: spec.lights ?? 2, index: indexBase + i }));
    }
    i += 1;
  }
}

/**
 * Rafter tails plus their bed mould along a level eave.
 *
 * `y` is 0.35 under the eave line, which puts the tails just below KIT's eave soffit (it sits
 * 0.25 under) so their ends read as ends rather than as blocks let into a board.
 */
function levelEave(ctx, { x, y, z, run, facing }) {
  return rafterTails(ctx, {
    x, y, z, run, facing,
    pitch: T.rafterPitch,
    depth: T.rafterDepth,
    bedMould: true,
  });
}

/** Blocks marching up a gable rake, under the barge board — the mp pack's loudest rake cue. */
function rakeBlocks(ctx, { apexX, apexY, half, z, k, sign }) {
  return rafterTails(ctx, {
    x: apexX + (sign * half) / 2,
    y: apexY - (k * half) / 2,
    z,
    run: half,
    facing: 'front',
    rake: -sign * k,
    drop: 0.13,
    depth: T.rakeBlockDepth,
    pitch: T.rafterPitch + 0.08,
    bedMould: false,
  });
}

/**
 * Knee brackets down one gable rake.
 *
 * The drop is solved against the rake height at each station so no bracket's leg finishes below
 * the gable it hangs from — the "dies in mid-air" failure §7.5 names.
 */
function rakeBrackets(ctx, { apexX, apexY, springY, z, k, stations, span }) {
  const out = [];
  for (const sign of [-1, 1]) {
    for (const t of stations) {
      const head = apexY - k * t - 0.10;
      const drop = Math.min(0.92, Math.max(0.34, (head - springY - 0.06) * 0.62));
      if (head - drop < springY - 0.02) continue;
      out.push(...kneeBracket(ctx, {
        x: apexX + sign * t, y: head, z, span, drop, facing: 'front',
      }));
    }
  }
  return out;
}

/**
 * A gutter whose downpipe lands on the wall it is meant to cross.
 *
 * `gutterAndDownpipe` puts the pipe at `r + 0.02` from the datum plane it is given, so a datum
 * on the eave line hangs the pipe 0.95 clear of the building. The datum here is the WALL FACE
 * and `projection` carries the gutter out to the fascia instead.
 */
function eaveGutter(ctx, { x, y, z, run, facing, overhang, downpipes, index }) {
  return gutterAndDownpipe(ctx, {
    x, y, z, run, facing, downpipes, index,
    projection: overhang + KIT_METRICS.fasciaThickness + 0.05,
    groundY: 0,
  });
}

export default function build(ctx) {
  const m = massing(ctx);
  const e = ctx.env;
  const p = ctx.p;

  /* ═══════════════════════════════ 1. the lot ══════════════════════════════════════════ */
  // GARDEN owns the plate and the chamfer — CONTRACT §6a.1. `kit.lotPlate` is never called.
  ctx.add(lotSurface(ctx));
  ctx.add(kerbAndFootpath(ctx));
  // The porch deck stands 0.35 PROUD of the wall plane, so the flight has to climb to that
  // edge rather than to `env.frontZ`, which is the default and would leave a 0.35 gap.
  ctx.add(path(ctx, { deckZ: m.porchFront }));
  ctx.add(boundary(ctx));             // low red brick wall with pale capping and brick piers
  ctx.add(gate(ctx));
  ctx.add(letterbox(ctx));
  // Density 1.7 is a lane-wide decision, not a per-archetype taste: all four lots pass the same
  // number so a row of them reads as one street. Finding 6 is sparse planting.
  ctx.add(planting(ctx, { composition: 'bungalow-entry-r140' }));

  /* ═══════════════════════════════ 2. floor and walls ══════════════════════════════════ */
  ctx.add(floorPlate(ctx, {
    w: m.wallW, d: m.bodyD, x: 0, z: m.FZ - m.bodyD / 2, height: e.floorY,
  }));

  // The two walled bays either side of the porch. Their inner faces are the porch returns and
  // are deliberately plain — the reference paints them as flat render over clinker.
  for (const sign of [-1, 1]) {
    const shell = wallShell(ctx, {
      w: m.bayW,
      d: T.porchDepth,
      x: sign * m.bayX,
      z: m.FZ - T.porchDepth / 2,
      base: e.floorY,
      height: e.wallH,
      material: p.wall,
      baseCourse: baseCourse(ctx),
      faces: ['front', 'left', 'right'],
      openings: [
        { face: 'front', x: 0, y: m.sillY, w: Math.min(2.70, m.bayW - 0.85), h: T.winH },
        { face: sign < 0 ? 'left' : 'right', x: 0, y: m.sillY, w: 1.05, h: T.winHSmall },
      ],
    });
    ctx.add(shell);
    glazeShell(ctx, shell, [{ lights: 3 }, { lights: 2 }], SALT.windowJitter + (sign < 0 ? 0 : 2));
  }

  // The main block behind the porch. Its front face is the porch's back wall and carries the
  // door; its flanks carry the banks that stop either elevation being a plane.
  const mid = wallShell(ctx, {
    w: m.wallW,
    d: m.midD,
    x: 0,
    z: m.midZ,
    base: e.floorY,
    height: e.wallH,
    material: p.wall,
    baseCourse: baseCourse(ctx),
    faces: ['front', 'left', 'right', 'back'],
    articulate: 'none',
    openings: [
      { face: 'front', x: 0, y: e.floorY, w: 1.05, h: 2.24 },
      { face: 'front', x: -1.60, y: m.sillY, w: 1.05, h: T.winHSmall },
      { face: 'front', x: 1.60, y: m.sillY, w: 1.05, h: T.winHSmall },
      // Left flank: one bank only, and forward of the chimney breast.
      { face: 'left', x: 0.95, y: m.sillY, w: 1.85, h: T.winHSmall },
      { face: 'right', x: 0.95, y: m.sillY, w: 1.85, h: T.winHSmall },
      { face: 'right', x: -0.95, y: m.sillY, w: 1.85, h: T.winHSmall },
    ],
  });
  ctx.add(mid);
  glazeShell(ctx, mid, [
    { kind: 'door' }, { lights: 2 }, { lights: 2 }, { lights: 3 }, { lights: 3 }, { lights: 3 },
  ], SALT.windowJitter + 4);

  // The rear service wing, on a wall 0.62 shorter. This is what steps both flanks and the rear.
  const rear = wallShell(ctx, {
    w: m.wallW,
    d: m.rearD,
    x: 0,
    z: m.rearZ,
    base: e.floorY,
    height: e.wallH - T.rearDrop,
    material: p.wall,
    baseCourse: baseCourse(ctx),
    faces: ['back', 'left', 'right'],
    openings: [
      { face: 'back', x: -4.00, y: m.sillY, w: 1.65, h: 1.02 },
      { face: 'back', x: -1.55, y: m.sillY, w: 1.15, h: 1.02 },
      { face: 'back', x: 1.10, y: e.floorY, w: 0.95, h: 2.05 },
      { face: 'back', x: 3.55, y: m.sillY, w: 1.65, h: 1.02 },
      { face: 'left', x: -1.10, y: m.sillY, w: 1.65, h: 1.02 },
      { face: 'left', x: 1.10, y: m.sillY, w: 1.65, h: 1.02 },
      { face: 'right', x: -1.10, y: m.sillY, w: 1.65, h: 1.02 },
      { face: 'right', x: 1.10, y: m.sillY, w: 1.65, h: 1.02 },
    ],
  });
  ctx.add(rear);
  glazeShell(ctx, rear, [
    { lights: 3 }, { lights: 2 }, { kind: 'door' }, { lights: 3 },
    { lights: 3 }, { lights: 3 }, { lights: 3 }, { lights: 3 },
  ], SALT.windowJitter + 10);

  /* ═══════════════════════════════ 3. the roofs ════════════════════════════════════════ */
  // PRIMARY. `fascia:false` because the eave is emitted below with the porch gable cut out of
  // it — a continuous fascia bar would run straight through gable C.
  const hip = hipRoof(ctx, {
    tileCourseStep: T.roofCourseStep, roofFasciaDepth: T.fasciaDepth, roofFasciaThickness: T.fasciaThickness,
    bargeDepth: T.bargeDepth, bargeThickness: T.bargeThickness,
    w: m.wallW,
    d: m.frontD,
    x: 0,
    z: m.hipZ,
    springY: m.SY,
    pitch: T.pitchHip,
    overhang: m.OH,
    fascia: false,
  });
  ctx.add(hip);

  const rearRoof = hipRoof(ctx, {
    tileCourseStep: T.roofCourseStep, roofFasciaDepth: T.fasciaDepth, roofFasciaThickness: T.fasciaThickness,
    bargeDepth: T.bargeDepth, bargeThickness: T.bargeThickness,
    w: m.wallW,
    d: m.rearD,
    x: 0,
    z: m.rearZ,
    springY: m.rearSY,
    pitch: T.pitchHip,
    overhang: T.rearOverhang,
    fascia: false,
  });
  ctx.add(rearRoof);

  // GABLE A — the dominant street gable. No fascia and no eave soffit: a gable rising out of a
  // hip has no eave of its own, its rakes land on the primary's eave line, and a fascia here
  // would hang below the hip skin as a bar in mid-air. Both ends are closed, because the rear
  // rake clears the primary's ridge by ~0.4 and an open triangle there is a hole.
  const gable = gableRoof(ctx, {
    tileCourseStep: T.roofCourseStep, roofFasciaDepth: T.fasciaDepth, roofFasciaThickness: T.fasciaThickness,
    bargeDepth: T.bargeDepth, bargeThickness: T.bargeThickness,
    w: m.gableW,
    d: m.gableD,
    x: m.gableX,
    z: m.gableZ,
    springY: m.gableSpringY,
    pitch: T.pitchGable,
    overhang: m.OH,
    rakeOverhang: m.OH,
    ridgeAxis: 'z',
    // KIT has split these. The barge and apex block belong to the STREET end only — a barge at
    // the rear was a pale board standing over the primary's ridge with no gable under it. The
    // closing panel now defaults to both ends, which is what I wanted all along and had to buy
    // with a rear barge before the split.
    bargeEnds: [1],
    gablePanelInset: T.gablePanelInset,
    gablePanelMaterial: p.wall,
    fascia: false,
    soffit: false,
  });
  ctx.add(gable);

  // GABLE C — the porch gable. Keeps its fascia (it projects past the primary's eave and that
  // edge is seen) but drops the eave soffit boards, which would otherwise hang into the porch
  // below the ceiling. Its own soffit slab IS the porch ceiling, at 3.21 on `shadow`.
  const porchGable = gableRoof(ctx, {
    tileCourseStep: T.roofCourseStep, roofFasciaDepth: T.fasciaDepth, roofFasciaThickness: T.fasciaThickness,
    bargeDepth: T.bargeDepth, bargeThickness: T.bargeThickness,
    w: T.porchGableW,
    d: m.porchD,
    x: 0,
    z: m.porchZ,
    springY: m.porchSpringY,
    pitch: T.pitchGable,
    overhang: T.porchOverhang,
    rakeOverhang: T.porchOverhang,
    ridgeAxis: 'z',
    bargeEnds: [1],
    gablePanelInset: T.porchPanelInset,
    gablePanelMaterial: p.wall,
    soffit: false,
  });
  ctx.add(porchGable);

  ctx.add(roofIntersection(ctx, { primary: hip, secondary: gable, coveringRelief: T.roofCourseStep }));
  ctx.add(roofIntersection(ctx, { primary: hip, secondary: porchGable, coveringRelief: T.roofCourseStep }));

  /* ═══════════════════════════════ 4. eaves, tails, gutters ═══════════════════════════ */
  const pGabHalf = m.porchB / 2;
  ctx.add(eaves(ctx, {
    fasciaDepth: T.fasciaDepth, fasciaThickness: T.fasciaThickness,
    overhang: m.OH,
    material: p.trim,
    soffitMaterial: p.shadow,
    edges: [
      {
        from: [-m.eaveX, m.SY, m.eaveFrontZ],
        to: [-m.eaveX, m.SY, m.eaveBackZ],
        outward: [-1, 0, 0],
        extend: 0.08,
      },
      {
        from: [m.eaveX, m.SY, m.eaveBackZ],
        to: [m.eaveX, m.SY, m.eaveFrontZ],
        outward: [1, 0, 0],
        extend: 0.08,
      },
      {
        from: [-m.eaveX, m.SY, m.eaveFrontZ],
        to: [-pGabHalf, m.SY, m.eaveFrontZ],
        outward: [0, 0, 1],
      },
      {
        from: [pGabHalf, m.SY, m.eaveFrontZ],
        to: [m.eaveX, m.SY, m.eaveFrontZ],
        outward: [0, 0, 1],
      },
    ],
  }));
  ctx.add(eaves(ctx, {
    fasciaDepth: T.fasciaDepth, fasciaThickness: T.fasciaThickness,
    overhang: T.rearOverhang,
    material: p.trim,
    soffitMaterial: p.shadow,
    edges: [
      {
        from: [-m.rearEaveX, m.rearSY, m.FZ - m.frontD],
        to: [-m.rearEaveX, m.rearSY, m.rearEaveBackZ],
        outward: [-1, 0, 0],
      },
      {
        from: [m.rearEaveX, m.rearSY, m.rearEaveBackZ],
        to: [m.rearEaveX, m.rearSY, m.FZ - m.frontD],
        outward: [1, 0, 0],
      },
      {
        from: [m.rearEaveX, m.rearSY, m.rearEaveBackZ],
        to: [-m.rearEaveX, m.rearSY, m.rearEaveBackZ],
        outward: [0, 0, -1],
        extend: 0.08,
      },
    ],
  }));

  const tailY = m.SY - 0.35;
  const rearTailY = m.rearSY - 0.35;
  // The left flank's run stops at the chimney breast rather than running through it.
  const chimNear = m.chimZ + T.chimneyD / 2 + 0.12;
  ctx.add(levelEave(ctx, {
    x: -m.halfW,
    y: tailY,
    z: (chimNear + (m.FZ - 0.05)) / 2,
    run: Math.max(0.6, m.FZ - 0.05 - chimNear),
    facing: 'left',
  }));
  ctx.add(levelEave(ctx, {
    x: m.halfW, y: tailY, z: m.hipZ, run: m.frontD - 0.10, facing: 'right',
  }));
  for (const sign of [-1, 1]) {
    ctx.add(levelEave(ctx, {
      x: sign * m.bayX, y: tailY, z: m.FZ, run: m.bayW - 0.12, facing: 'front',
    }));
  }
  ctx.add(levelEave(ctx, {
    x: -m.halfW, y: rearTailY, z: m.rearZ, run: m.rearD - 0.10, facing: 'left',
  }));
  ctx.add(levelEave(ctx, {
    x: m.halfW, y: rearTailY, z: m.rearZ, run: m.rearD - 0.10, facing: 'right',
  }));
  ctx.add(levelEave(ctx, {
    x: 0, y: rearTailY, z: m.BZ, run: m.wallW - 0.30, facing: 'back',
  }));

  // Gutters, each on its own wall face so the downpipe runs down that wall. The two flank
  // downpipes are placed at ends that clear the chimney breast and the rear wing's roof.
  ctx.add(eaveGutter(ctx, {
    x: -m.halfW,
    y: m.SY,
    z: m.hipZ,
    run: m.frontD,
    facing: 'left',
    overhang: m.OH,
    downpipes: 'end',
    index: 0,
  }));
  ctx.add(eaveGutter(ctx, {
    x: m.halfW,
    y: m.SY,
    z: m.hipZ,
    run: m.frontD,
    facing: 'right',
    overhang: m.OH,
    downpipes: 'end',
    index: 2,
  }));
  for (const sign of [-1, 1]) {
    const a = sign * pGabHalf;
    const b = sign * m.eaveX;
    ctx.add(eaveGutter(ctx, {
      x: (a + b) / 2,
      y: m.SY,
      z: m.FZ,
      run: Math.abs(b - a),
      facing: 'front',
      overhang: m.OH,
      downpipes: 'none',
      index: 4 + (sign > 0 ? 1 : 0),
    }));
  }
  for (const sign of [-1, 1]) {
    ctx.add(eaveGutter(ctx, {
      x: sign * m.halfW,
      y: m.rearSY,
      z: m.rearZ,
      run: m.rearD,
      facing: sign < 0 ? 'left' : 'right',
      overhang: T.rearOverhang,
      downpipes: 'none',
      index: 6 + (sign > 0 ? 1 : 0),
    }));
  }
  ctx.add(eaveGutter(ctx, {
    x: 0,
    y: m.rearSY,
    z: m.BZ,
    run: m.wallW - 0.40,
    facing: 'back',
    overhang: T.rearOverhang,
    downpipes: 'end',
    index: 8,
  }));

  /* ═══════════════════════════════ 5. the two gable faces ═════════════════════════════ */
  // Gable A: shingle courses over a `trim` belt, filling the WHOLE gable. The shingle panel is a
  // WALL standing in the gable, never the roof material wearing a gable-shaped hat.
  // `gableRake` is the rake's rise per unit run, so every course is cut to the triangle it
  // stands in.
  //
  // ROUND 2 — THE FIELD MOVES OFF `joinery` AND ONTO `wall`, and this is the call to overrule if
  // a critic disagrees. CONTRACT §4 assigns "gable shingle courses" to `joinery` and DETAIL
  // defaults there. SURFACES authored Californian `joinery` at effective L 27.9 — the darkest
  // bucket on the building bar glass — and the r2 plate is the result: a 7.04 × 1.72 field at
  // accent value, inside a frame at L 82.0, reads as a hole punched through the archetype's
  // loudest cue. §4's own rule for `joinery` is that it is "the dark accent", and an accent is
  // not a field.
  //
  // `wall` is the right bucket for three reasons and not only because it is lighter. §4 already
  // assigns "the gable render faces" to it, so the courses and the panel they stand on now agree.
  // At effective L 66.0 it puts the field 35.9 above the roof (30.1) and 16.0 below the barge
  // (82.0) — the mid rung this frontage did not have. And DETAIL built these courses to read by
  // relief rather than albedo (0.055 proud, leaned back 0.075 rad, a lit arris over a cast
  // shadow), which is exactly the property that survives losing the hue contrast.
  //
  // What this costs: the olive of the mp bar and the cedar of the subject plate both go, and the
  // field now differs from the wall below it only by relief. The ideal answer is a timber-family
  // material at a mid value; the nine buckets do not contain one — `timber` is authored at L 30.9,
  // within 0.8 of the roof, so putting shingles there trades a black gable for a gable the value
  // of the roof above it, which is the named "gable-shaped hat" failure by value if not by
  // material. IF SURFACES LIFTS `timber` TO ABOUT L 50 THIS SHOULD MOVE TO `timber`, and it is a
  // one-argument change here. That decision is not mine — it is in `house-surfaces.js`.
  const gableRise = m.gableRidgeY - m.gableSpringY;
  ctx.add(shingleCourses(ctx, {
    x: m.gableX,
    y: m.gableSpringY + gableRise / 2,
    z: m.gablePanelZ,
    w: m.gableB,
    h: gableRise,
    courseH: T.shingleCourse,
    facing: 'front',
    style: 'shingle',
    gableRake: m.kG,
    material: p.wall,
    belt: true,
    index: 0,
  }));

  // Gable C: a batten panel low in the face with a louvred vent above it, which is what
  // `detail-tapered-porch-piers.png` shows. The panel is a rectangle inscribed under the rake
  // (`gableRake: 0`, width solved at its own head) rather than a full triangle, so the vent has
  // clear render to sit in. No belt — the porch beam under it is the base it stands on.
  const porchRise = m.porchRidgeY - m.porchSpringY;
  const battenH = Math.min(0.62, porchRise * 0.45);
  const battenTop = m.porchSpringY + battenH;
  const battenW = ((m.porchRidgeY - battenTop) * 2) / m.kG;
  ctx.add(shingleCourses(ctx, {
    x: 0,
    y: m.porchSpringY + battenH / 2,
    z: m.porchPanelZ,
    w: battenW,
    h: battenH,
    facing: 'front',
    style: 'batten',
    gableRake: 0,
    material: p.wall,     // same call as gable A — the two gable faces must agree
    belt: false,
    index: 1,
  }));
  ctx.add(ventGrille(ctx, {
    x: 0, y: battenTop + 0.30, z: m.porchPanelZ, w: 0.55, h: 0.44, facing: 'front', louvres: 5,
  }));

  // Rake blocks and knee brackets. The brackets are the heaviest ornament on this archetype and
  // they are meant to look structural — four per rake on the street gable, two on the porch.
  if (ctx.mid) {
    for (const sign of [-1, 1]) {
      ctx.add(rakeBlocks(ctx, {
        apexX: m.gableX,
        apexY: m.gableRidgeY,
        half: m.gableB / 2,
        z: m.gablePanelZ,
        k: m.kG,
        sign,
      }));
      ctx.add(rakeBlocks(ctx, {
        apexX: 0,
        apexY: m.porchRidgeY,
        half: m.porchB / 2,
        z: m.porchPanelZ,
        k: m.kG,
        sign,
      }));
    }
  }
  ctx.add(rakeBrackets(ctx, {
    apexX: m.gableX,
    apexY: m.gableRidgeY,
    springY: m.gableSpringY,
    z: m.gablePanelZ,
    k: m.kG,
    stations: ctx.detail ? [1.15, 2.55] : [1.90],
    span: 0.42,
  }));
  ctx.add(rakeBrackets(ctx, {
    apexX: 0,
    apexY: m.porchRidgeY,
    springY: m.porchSpringY,
    z: m.porchPanelZ,
    k: m.kG,
    stations: [1.35],
    span: 0.34,
  }));

  /* ═══════════════════════════════ 6. the porch ═══════════════════════════════════════ */
  const porchDeckD = T.porchDepth + T.porchProud;
  const frame = verandahFrame(ctx, {
    w: T.porchHalfW * 2,
    d: porchDeckD,
    x: 0,
    z: m.porchFront - porchDeckD / 2,
    floorY: e.floorY,
    beamY: T.porchBeamY,
    beamDepth: T.porchBeamDepth,
    beamThickness: KIT_METRICS.beamThickness,
    postStyle: 'none',
    posts: [-T.pierX, T.pierX],
    deck: true,
    ceiling: false,          // gable C's own soffit slab is the ceiling, 0.07 lower
    returns: true,
  });
  ctx.add(frame);

  // Tapered rendered piers on clinker pedestals. WIDE AT THE BOTTOM: 0.68 base, 0.42 head, a
  // ratio of 0.62. The shaft head lands exactly on the beam soffit, so the beam is the pier's
  // capital and no cap slab can float in a gap at `mid` or `low`.
  const pierZ = m.porchFront - T.pierPedestalW / 2;
  for (const anchor of frame.anchors ?? []) {
    ctx.add(taperedPier(ctx, {
      x: anchor.x,
      z: pierZ,
      base: 0,
      pedestal: T.pierPedestal,
      pedestalWidth: T.pierPedestalW,
      height: T.porchBeamY - (T.pierPedestal + 0.09),
      baseWidth: T.pierBaseW,
      headWidth: T.pierHeadW,
      cap: false,
    }));
  }

  // A knee bracket where the beam lands on each porch return, so the beam is carried at both
  // ends rather than dying into a wall face.
  for (const sign of [-1, 1]) {
    ctx.add(kneeBracket(ctx, {
      x: sign * T.porchHalfW,
      y: T.porchBeamY + 0.04,
      z: m.porchFront - 0.30,
      span: 0.34,
      drop: 0.58,
      facing: sign < 0 ? 'right' : 'left',
    }));
  }

  // The clinker dwarf wall between each pier and its return, capped pale, standing from the
  // GROUND so the masonry reads as one band with the base course and the pedestals.
  for (const sign of [-1, 1]) {
    const inner = T.pierX + T.pierPedestalW / 2;
    const w = T.porchHalfW - inner;
    if (w >= 0.35) {
      ctx.add(wallShell(ctx, {
        w,
        d: 0.46,
        x: sign * (inner + w / 2),
        z: m.porchFront - 0.23,
        base: 0,
        height: T.dwarfWallH,
        material: p.wallAlt,
        capMaterial: p.trim,
        articulate: 'none',
      }));
    }
  }

  /* ═══════════════════════════════ 7. the chimney ═════════════════════════════════════ */
  // Left flank, passing THROUGH the primary's hip end. The head is authored against the roof
  // surface the solver actually returns rather than left to the kit's default, which clears the
  // ridge by 0.85 and puts a pot 1.6 m over it.
  const roofYAtChimney = hip.form?.heightAt?.(m.chimX, m.chimZ) ?? m.SY;
  const chimTop = Math.max(
    m.hipRidgeY + T.chimneyAboveRidge,
    roofYAtChimney + T.chimneyAboveRoof,
  );
  ctx.add(chimney(ctx, {
    x: m.chimX,
    z: m.chimZ,
    base: 0,
    w: T.chimneyW,
    d: T.chimneyD,
    top: chimTop,
    throughRoof: hip,
  }));
  ctx.add(chimneyCap(ctx, {
    x: m.chimX,
    y: chimTop,
    z: m.chimZ,
    w: T.chimneyW,
    d: T.chimneyD,
    pots: 1,
    potHeight: 0.30,
    potRadius: 0.13,
    render: true,
  }));
}
