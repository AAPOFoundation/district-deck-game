// District Deck V3.40 — `heritage-federation-villa`, the Federation Queen Anne villa of ~1905.
//
// Governing spec: docs/next-phase/V340-RESIDENTIAL-HOUSES-FROM-SCRATCH-SPEC.md §7
// Module contract: ./CONTRACT.md — §2 the context, §4 the nine buckets, §6a the Wave A rulings.
//
// This seat assembles; it does not invent components and it creates no material. Everything is
// built out of `house-kit.js`, `house-detail.js` and `garden.js`, and every bucket is taken off
// `ctx.p` by its contract name.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE FRONTAGE, LEFT TO RIGHT, AND WHY IT IS LAID OUT THIS WAY
//
//   [ verandah bay L ] [ projecting gabled wing ] [ verandah bay R + front door ] [ corner tower ]
//
// `_reference-v340/like-heritage-federation-villa-front.png` is the subject: an octagonal corner
// tower under a conical terracotta roof at one end, a gabled wing with timber strapwork inboard
// of it, and a verandah on turned posts running between them. The two Monopoly-Plus bar plates
// carry the same four elements in a mirrored arrangement.
//
// The wing sits BETWEEN two verandah bays rather than inside one. That is deliberate and it is
// the fix for the second named failure of this archetype: the stashed lane put the projecting
// wing in the middle of the verandah, so the beam, the bullnose and the frieze all ran straight
// through it. Here each bay terminates against the wing's own eave line with a measured gap
// (`WING_CLEAR`), so beam, frieze and post all die at a junction and nothing passes through a
// wall. The numbers are asserted in `assertions` below and reported.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE ROOF, AND WHY IT IS ONE HIP RATHER THAN A COLLECTION
//
// `env.ridgeY` is an absolute authored target (7.15) — CONTRACT §6a.4. Rather than pick a pitch
// and hope, the main hip's pitch is SOLVED from the target:
//
//     pitch = atan( (ridgeY - springY) / (planDepth / 2) )
//
// so `mainRoof.form.ridgeY === env.ridgeY` to floating-point on every façade, whatever the
// per-façade jitter does to `bodyD`. The verandah is *under* that hip's front slope — there is no
// second verandah roof — which is exactly what the reference shows and what keeps a 3.4 m beam
// soffit possible under a 3.95 m wall plate. The gabled wing and the tower cone then break
// through that slope, and `roofIntersection` solves the wing's valleys.
//
// THE CONSEQUENCE THE R2 PLATE PAID FOR, AND WHAT IT COSTS TO KEEP THE HIP. A roof that covers
// the verandah reaches its own eave 0.58 m in FRONT of the frontage, so anything springing from
// `wallTopY` at the frontage is under the roof rather than on it — which is why r2's wing gable
// arrived as barge boards lying flat on the tiles. The wing therefore does not spring from the
// main wall plate: its wall carries on up and its gable springs from a line solved against
// `mainRoof.form.heightAt` at the wing's own face plane, so panel, strapwork and barges stand
// clear of the roof by construction. §4 carries the measurements. The alternative — cutting the
// hip back to the core and giving the verandah its own roof, which is how B-COTTAGE does it —
// would move the main roof out from under the tower's clearance solve and drop the drum by
// about a metre, and the tower is the archetype.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE TOWER TRANSITION — the first named failure of this archetype
//
// An octagonal drum cannot be capped by square slabs. The stashed lane's cap oversailed 177 mm at
// the flats and 683 mm at four corners the tower does not have. Here:
//
//   · the drum is `kit.polyShell` — 8 facets, circumradius TOWER_R, rotation π/8;
//   · its wall plate is a FACETED ring built from the same 8 corners at radius TOWER_R+CAP_PROUD,
//     so the oversail is CAP_PROUD radially on all eight flats and all eight arrises, and there
//     are no corners anywhere that the drum does not have;
//   · the cone is `kit.conicalRoof` given the DRUM'S OWN radius and side count and the same
//     rotation, so its eave circle is TOWER_R + CONE_OVER — a real eave overhang measured from
//     the drum's diameter, not a bounding box — and its eight arrises are angularly coincident
//     with the drum's eight arrises.
//
// The drum's height is then SOLVED rather than authored: the cone's eave circle is sampled
// against the main hip's own `heightAt` solver and the drum is raised until the whole circle
// clears the main roof by `CONE_CLEAR`. A cone that springs below the roof it stands in front of
// is the interpenetration this archetype has been failing on.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// VALUE, and the two orchestrator rulings this seat was given
//
//   · gable strapwork is DARK GREEN on cream roughcast — `detail.strapwork` already defaults to
//     `joinery`, and this file does not override it;
//   · the verandah frieze is CREAM against a dark recess — `detail.fretworkValance` already
//     builds the field on `trim` with a `shadow` recess board behind it, and this file does not
//     override that either, nor does it pass `recess: false`.
//
// The one value decision this seat does make is that every FASCIA and BARGE runs on `joinery`
// rather than the KIT default of `trim`. `like-...-front.png` paints them dark green, and it is
// what puts a dark band directly above the cream frieze — the ladder the DETAIL seat's own report
// says the reference carries: dark fascia, cream head rail, cream pierced field on a dark recess.
// Against a `wall` gable panel at L* 69 a `trim` barge is 12 L* of separation and a `joinery`
// barge is 47.
//
// Salts: 2000–2099 (CONTRACT §5). This file introduces no jitter of its own — its variation is
// the per-façade envelope and the per-façade palette — so it reads `ctx.v` nowhere and two runs
// of one seed are byte-identical by construction.

import { KIT_METRICS } from './house-kit.js';
import * as kit from './house-kit.js';
import * as detail from './house-detail.js';
import * as garden from './garden.js';

const DEG = Math.PI / 180;

/** DETAIL's architrave face width, read rather than copied — a hood spans the architrave too. */
const DETAIL_ARCHITRAVE = detail.DETAIL_MEMBERS.architraveFace;

/**
 * Every authored number for this archetype, in one readable place, in board units (metres).
 * Anything that could be derived from `KIT_METRICS`, `DETAIL_MEMBERS` or `ctx.env` is derived in
 * `build` instead of being copied here — CONTRACT §6a.5.
 */
const VILLA = Object.freeze({
  verandahDepth: 2.55,        // core front wall → verandah deck edge (= env.frontZ)
  baseCourse: 0.62,           // red brick above the floor; render above it, moulding between

  sillRise: 0.66,             // window sill above the finished floor → 1.36 world
  windowH: 1.54,              // principal double-hung under the verandah
  windowW: 1.15,
  flankWindowH: 1.62,
  flankWindowW: 1.10,
  doorOpeningH: 2.40,
  doorOpeningW: 1.40,
  doorLeafH: 1.86,
  doorLeafW: 1.24,

  beamDrop: 0.52,             // beam SOFFIT below the wall plate → 3.43 world
  valanceDrop: 0.46,
  // Denser than DETAIL_MEMBERS.valancePitch (0.20). `detail-federation-verandah-fretwork.png`
  // measures a frieze whose drops nearly touch, and a comb at 0.20 reads sparse beside it.
  valancePitch: 0.16,
  bracketSize: 0.46,

  wingWidth: 3.60,
  wingEaveOverhang: 0.14,     // ±X — small on purpose: it is what the verandah beam stops clear of
  // ±Z — the barge projection read from the street. This is now a CEILING, not the value: the
  // rake is solved in `build` so the barge's foot lands on the main roof's own surface instead
  // of hanging over it. See "the wing stands on the main roof" below.
  wingRakeMax: 0.50,
  wingPitchDeg: 38,
  // How far past the point where its own ridge sinks under the main hip the wing's roof runs on.
  // Long enough to bury the back panel; short enough that `roofIntersection`'s saddle flashing
  // lands where the ridge actually dies rather than 4 m further back on open tiles.
  wingRoofTail: 0.70,
  // Verandah BEAM END → wing eave line, and the beam's own half-thickness is subtracted from the
  // bay before this is applied. `verandahFrame` runs its beam `w + beamThickness` wide, so a bay
  // laid out to the eave line puts 110 mm of beam inside the wing — which is the collision this
  // archetype was told to stop making.
  junctionClear: 0.13,

  towerRadius: 1.70,          // circumradius of the octagonal drum
  towerSides: 8,
  towerInset: 0.04,           // drum's outer arris inside the body's own wall plane
  towerProject: 0.30,         // drum's front facet beyond the verandah deck edge
  towerCapProud: 0.09,        // faceted wall-plate oversail, radial, identical on flats and arrises
  coneOverhang: 0.30,         // cone eave beyond the DRUM'S radius
  coneHeight: 2.10,
  coneClear: 0.14,            // cone eave above the main hip surface, minimum, solved
  towerWindowH: 2.60,
  towerWindowW: 0.88,
  towerUpperBandRise: 0.36,   // cream band above the tower's window heads
  towerFinialH: 0.72,

  chimneyW: 1.02,
  chimneyD: 0.80,
  chimneyHeadRise: 0.34,      // SHAFT head above env.ridgeY; the cap and pots go above that
  chimneyPotH: 0.38,
  gableFinialH: 0.80,
  hipFinialH: 0.56,
});

/* ═══════════════════════════════════════ helpers ═══════════════════════════════════════════ */

/** Evenly spaced post centres across a bay, inclusive of both ends. */
function bayPosts(x0, x1, count) {
  const out = [];
  const n = Math.max(2, count);
  for (let i = 0; i < n; i += 1) out.push(x0 + ((x1 - x0) * i) / (n - 1));
  return out;
}

/**
 * The world position and outward yaw of one facet of a `polyShell` drum.
 *
 * `polyShell` lays corner `i` at `rot + 2πi/sides - π` measured with x = sin(a)·r, z = cos(a)·r,
 * so facet `i` faces `rot + (2i+1)π/sides - π`. Reading it off the drum rather than re-deriving
 * it is the difference between a modillion that sits on a facet and one that sits in the air.
 */
function facetFrame(drumForm, i) {
  const { x, z, radius, sides, rotation } = drumForm;
  const yaw = rotation + ((2 * i + 1) * Math.PI) / sides - Math.PI;
  const apothem = radius * Math.cos(Math.PI / sides);
  return {
    yaw,
    x: x + Math.sin(yaw) * apothem,
    z: z + Math.cos(yaw) * apothem,
    chord: 2 * radius * Math.sin(Math.PI / sides),
    apothem,
  };
}

/* ════════════════════════════════════════ the build ════════════════════════════════════════ */

export default function build(ctx) {
  const { env, p } = ctx;

  /* ── 1. the lot. GARDEN owns the plate; `kit.lotPlate` is never called (CONTRACT §6a.1) ──── */

  const W = env.bodyW;
  const D = env.bodyD;
  const FZ = env.frontZ;
  const floorY = env.floorY;
  const wallTopY = floorY + env.wallH;

  const coreFrontZ = FZ - VILLA.verandahDepth;
  const coreD = D - VILLA.verandahDepth;
  const coreZ = coreFrontZ - coreD / 2;

  const sillY = floorY + VILLA.sillRise;
  const beamSoffitY = wallTopY - VILLA.beamDrop;
  const baseCourse = { height: VILLA.baseCourse, material: p.wallAlt };

  /* ── 2. the main hip, pitch SOLVED so its ridge lands on env.ridgeY exactly ──────────────── */

  const overhang = KIT_METRICS.overhang[ctx.id];
  const planW = W + overhang * 2;
  const planD = D + overhang * 2;
  const rise = env.ridgeY - wallTopY;

  // The long slopes: pitch solved BACKWARDS from the authored target, so `form.ridgeY` lands on
  // `env.ridgeY` to floating point on every façade whatever the width/depth jitter does.
  //
  // Seat B-COTTAGE solves the plan depth instead and keeps KIT's authored pitch. That is the
  // better way in where the roof plan is free — but it is not available here: this villa's
  // verandah sits UNDER the main roof's front slope (there is no second verandah roof, which is
  // what `like-...-front.png` shows and what makes a 3.43 m beam soffit possible under a 3.95 m
  // wall plate), so the plan depth is pinned to the full body and only the pitch is free. The
  // trade is stated rather than hidden: the long slopes run about 27° against KIT's authored 34°.
  const mainPitchDeg = Math.atan2(rise, planD / 2) / DEG;

  // …and the HIP ENDS are put back on KIT's authored 34° by solving the ridge length for it, so
  // the archetype still carries its own pitch where a three-quarter camera reads it, and the
  // ridge is long enough to take a run of cresting.
  const endRun = rise / Math.tan(KIT_METRICS.pitchDeg[ctx.id] * DEG);
  const ridgeLen = Math.max(planW * 0.16, Math.min(planW - endRun * 2, planW * 0.90));

  const mainRoof = kit.hipRoof(ctx, {
    w: W,
    d: D,
    x: 0,
    z: FZ - D / 2,
    springY: wallTopY,
    pitch: mainPitchDeg,
    overhang,
    ridgeLen,
    covering: 'tile',
    // Dark green fascias and soffits: the band directly above the cream frieze.
    fasciaMaterial: p.joinery,
  });
  const main = mainRoof.form;

  /* ── 3. the tower. Drum height solved against the main hip so the cone eave clears it ────── */

  const apothem = VILLA.towerRadius * Math.cos(Math.PI / VILLA.towerSides);
  const towerX = W / 2 - apothem - VILLA.towerInset;
  const towerZ = FZ + VILLA.towerProject - apothem;
  const coneEaveR = VILLA.towerRadius + VILLA.coneOverhang;

  let drumTopY = wallTopY + 0.95;
  let coneEaveWorst = -Infinity;
  for (let i = 0; i < 32; i += 1) {
    const a = (i / 32) * Math.PI * 2;
    const y = main.heightAt(towerX + Math.sin(a) * coneEaveR, towerZ + Math.cos(a) * coneEaveR);
    if (y == null) continue;
    coneEaveWorst = Math.max(coneEaveWorst, y);
    drumTopY = Math.max(drumTopY, y + VILLA.coneClear);
  }

  // The drum stands on the LOT, not on the floor plate: it projects `towerProject` beyond the
  // plate's own front edge, and a drum based at `floorY` would have 0.70 m of nothing under its
  // front three facets. Its brick runs from the ground to the same string-course line the rest of
  // the building carries.
  const drum = kit.polyShell(ctx, {
    radius: VILLA.towerRadius,
    sides: VILLA.towerSides,
    rotation: Math.PI / VILLA.towerSides,
    x: towerX,
    z: towerZ,
    base: 0,
    height: drumTopY,
    material: p.wall,
    baseCourse: { height: floorY + VILLA.baseCourse, material: p.wallAlt },
    capMaterial: p.trim,
    capProud: VILLA.towerCapProud,
    // Facets 1–5: left flank, front-left, front, front-right, right flank. The four rear facets
    // are inside the building and take no opening.
    openings: [1, 2, 3, 4, 5].map((facet) => ({
      facet, x: 0, y: sillY, w: VILLA.towerWindowW, h: VILLA.towerWindowH,
    })),
  });

  const cone = kit.conicalRoof(ctx, {
    radius: VILLA.towerRadius,       // the DRUM'S own radius — not a bounding box
    sides: VILLA.towerSides,         // the DRUM'S own side count
    rotation: Math.PI / VILLA.towerSides,  // …and the same rotation, so the arrises coincide
    x: towerX,
    z: towerZ,
    springY: drumTopY,
    height: VILLA.coneHeight,
    overhang: VILLA.coneOverhang,
    fasciaMaterial: p.joinery,
  });
  const coneApexY = drumTopY + VILLA.coneHeight;

  /* ── 4. the projecting gabled wing, and the two verandah bays that meet it ───────────────── */

  const wingX = -W * 0.19;
  const wingHalf = VILLA.wingWidth / 2;
  const wingEaveL = wingX - wingHalf - VILLA.wingEaveOverhang;
  const wingEaveR = wingX + wingHalf + VILLA.wingEaveOverhang;
  const drumEdgeX = towerX - apothem;

  // `verandahFrame`'s beam runs `w + beamThickness` wide, so the beam's end face sits half a beam
  // thickness OUTSIDE the bay it was given. The bay is set back by that amount before the
  // junction clearance is applied, so the number below is the real beam-end-to-obstacle gap.
  const beamOversail = KIT_METRICS.beamThickness / 2;
  const junction = VILLA.junctionClear + beamOversail;

  const bayL = { x0: -W / 2 + beamOversail + 0.05, x1: wingEaveL - junction };
  const bayR = { x0: wingEaveR + junction, x1: drumEdgeX - junction };

  /* ── THE WING STANDS ON THE MAIN ROOF, AND ITS SPRING LINE IS SOLVED FOR THAT ────────────
   *
   * The r2 plate showed this wing as a tangle of barge boards lying flat on the tiles with no
   * wing beneath it. Measured cause, bbox against bbox on façade 1:
   *
   *   main hip front skin at the wing's face plane z 5.250 …… y 4.308
   *   wing gable panel                                    …… y 3.950 → 5.406 at z 5.250
   *   wing barge boards                                   …… y 3.612 → 5.443 at z 5.675–5.825
   *   main hip front skin at the barge plane z 5.750      …… y 4.057
   *
   * The wing sprang at `wallTopY`, the SAME line the main hip springs from, while sitting 0.58 m
   * BEHIND the main hip's own eave — so the main roof's front slope ran over the whole wing. The
   * panel's bottom 358 mm was inside the tiles, the strapwork's bottom 358 mm with it, and the
   * barges stood at the eave where the roof had already fallen back to 4.06, which is why they
   * read as sticks lying on the roof rather than as a gable. The wing's wall (top 3.950) was
   * entirely under the roof surface, so no wing stood at the frontage at all.
   *
   * There is no room to fix this by pushing the wing forward. GARDEN's front beds start at
   * z 5.410 and their nearest shrub core at z 5.366, and the boundary wall is at 6.060 — the
   * wing's plinth alone would be at wall + 0.11. Measured, and stated rather than worked around.
   *
   * So the wing is raised instead: its wall, and therefore its gable's spring line, stands
   * `wingStand` ABOVE the main roof's own skin at the wing's face plane. One wall plate's worth
   * (KIT_METRICS.wallPlate) is deliberate — it puts the cream cap band immediately above the
   * tiles and the gable directly on top of it, which is the junction `like-…-front.png` carries.
   * Everything above that line — panel, strapwork, barges, apex block, finial — is then clear of
   * the main roof by construction on every façade, because the stand is solved against
   * `mainRoof.form.heightAt` rather than authored.
   */
  const gableFaceZ = FZ;
  // `roofFace` offsets a tile skin along the plane normal by the course nose, so the skin sits
  // this much above the plane `heightAt` reports. Clearing the plane is not clearing the roof.
  const mainSkinLift = KIT_METRICS.tileCourseStep * Math.cos(mainPitchDeg * DEG);
  const roofSkinAt = (px, pz) => {
    const y = main.heightAt(px, pz);
    return y == null ? null : y + mainSkinLift;
  };

  const wingStand = KIT_METRICS.wallPlate;
  let wingSpringY = wallTopY;
  let wingFaceRoofY = -Infinity;
  for (let i = 0; i <= 8; i += 1) {
    const px = wingEaveL + ((wingEaveR - wingEaveL) * i) / 8;
    const y = roofSkinAt(px, gableFaceZ);
    if (y == null) continue;
    wingFaceRoofY = Math.max(wingFaceRoofY, y);
    wingSpringY = Math.max(wingSpringY, y + wingStand);
  }

  // The barge's own foot: `gableRoof` starts it `bargeDepth * 0.45` under the spring line and the
  // bar is `bargeDepth` deep across its rake, so its lowest vertex is this far below the spring.
  const bargeFootDrop = KIT_METRICS.bargeDepth * 0.45
    + KIT_METRICS.bargeDepth * 0.5 * Math.cos(VILLA.wingPitchDeg * DEG);

  // …and the rake overhang is then SOLVED rather than authored, so that foot lands on the main
  // roof instead of hanging in the air over it. The main slope falls `tan(mainPitch)` per metre
  // of z, so the plane where the roof has dropped by exactly `bargeFootDrop - wingStand` is the
  // plane the barge should stand on. `wingRakeMax` caps it; nothing raises it.
  const wingRakeOver = Math.min(
    VILLA.wingRakeMax,
    Math.max(0.20, (bargeFootDrop - wingStand) / Math.tan(mainPitchDeg * DEG)),
  );

  // The wing's roof runs back until its ridge is under the main hip, then a little further.
  const wingRise = Math.tan(VILLA.wingPitchDeg * DEG) * (wingHalf + VILLA.wingEaveOverhang);
  const wingRidgeSubZ = (FZ + overhang)
    - (wingSpringY + wingRise - wallTopY) / Math.tan(mainPitchDeg * DEG);
  const wingRoofDepth = Math.min(6.0, Math.max(2.80,
    gableFaceZ - wingRakeOver - (wingRidgeSubZ - VILLA.wingRoofTail)));

  const wingRoof = kit.gableRoof(ctx, {
    w: VILLA.wingWidth,
    d: wingRoofDepth,
    x: wingX,
    // The plan is centred so its FRONT RAKE lands at `gableFaceZ + wingRakeOver` and therefore
    // its gable panel — inset from the rake, see below — lands exactly on `gableFaceZ`. Solved
    // from the depth rather than copied, so the two cannot drift when the depth re-solves.
    z: gableFaceZ - wingRoofDepth / 2,
    ridgeAxis: 'z',
    springY: wingSpringY,
    pitch: VILLA.wingPitchDeg,
    overhang: VILLA.wingEaveOverhang,
    rakeOverhang: wingRakeOver,
    covering: 'tile',
    gableEnds: [1],                  // street end only; the back end dies inside the main roof
    fasciaMaterial: p.joinery,
    bargeMaterial: p.joinery,
    gablePanelMaterial: p.wall,
    // `gablePanelInset` is measured from the RAKE plane, not from the wall — a known open KIT
    // defect that every builder in this lane corrects for, and it must be corrected for
    // consistently on the panel AND on everything mounted on the panel. Setting it to the rake
    // overhang lands the panel on the wing's own wall plane; `gablePanelZ` in §9 then reads the
    // rake KIT published and subtracts the same number, so the strapwork lands on the panel.
    gablePanelInset: wingRakeOver,
  });
  const wing = wingRoof.form;

  const valleys = kit.roofIntersection(ctx, { primary: mainRoof, secondary: wingRoof });

  /* ── 5. shells, with every opening PUNCHED (CONTRACT §6, `wallShell`) ────────────────────── */

  // Posts first, then openings, so every street-facing window sits in the middle of a verandah
  // span rather than behind a post. `verandahFrame` is handed these same arrays, so the anchors it
  // publishes and the openings punched here cannot drift apart.
  bayL.posts = bayPosts(bayL.x0, bayL.x1, 3);
  bayR.posts = bayPosts(bayR.x0, bayR.x1, 4);
  const midSpan = (arr, i) => (arr[i] + arr[i + 1]) / 2;

  const doorX = midSpan(bayR.posts, 1);              // the middle span of the wider bay

  const win = (x, extra = {}) => ({
    x, y: sillY, w: VILLA.windowW, h: VILLA.windowH, face: 'front', ...extra,
  });

  const core = kit.wallShell(ctx, {
    w: W,
    d: coreD,
    x: 0,
    z: coreZ,
    base: floorY,
    height: env.wallH,
    material: p.wall,
    baseCourse: { ...baseCourse, moulding: true, mouldingMaterial: p.trim },
    capMaterial: p.trim,
    openings: [
      // street elevation, behind the verandah, each centred in a span
      win(midSpan(bayL.posts, 1)),
      win(midSpan(bayR.posts, 0)),
      win(midSpan(bayR.posts, 2)),
      {
        x: doorX, y: floorY, w: VILLA.doorOpeningW, h: VILLA.doorOpeningH, face: 'front',
      },
      // flanks and rear — §2.1: no elevation on this board is a blank plane
      { x: -1.9, y: sillY, w: VILLA.flankWindowW, h: VILLA.flankWindowH, face: 'left' },
      { x: 1.9, y: sillY, w: VILLA.flankWindowW, h: VILLA.flankWindowH, face: 'left' },
      { x: -1.9, y: sillY, w: VILLA.flankWindowW, h: VILLA.flankWindowH, face: 'right' },
      { x: 1.9, y: sillY, w: VILLA.flankWindowW, h: VILLA.flankWindowH, face: 'right' },
      { x: -2.6, y: sillY, w: VILLA.flankWindowW, h: 1.42, face: 'back' },
      { x: 2.6, y: sillY, w: VILLA.flankWindowW, h: 1.42, face: 'back' },
    ],
  });

  const wingShell = kit.wallShell(ctx, {
    w: VILLA.wingWidth,
    d: VILLA.verandahDepth,
    x: wingX,
    z: FZ - VILLA.verandahDepth / 2,
    base: floorY,
    // Taller than the core by `wingStand` plus the main roof's fall across the verandah: the
    // wing's wall carries the gable, so its top IS the gable's spring line. The extra height is
    // behind the main roof's eave soffit from every street camera, so the wing's visible wall
    // band and its window head clearances do not move — only the part above the tiles is new.
    height: wingSpringY - floorY,
    material: p.wall,
    baseCourse: { ...baseCourse, moulding: true, mouldingMaterial: p.trim },
    capMaterial: p.trim,
    faces: ['front', 'left', 'right'],   // the back opens into the core
    openings: [
      { x: -0.85, y: sillY, w: 1.20, h: 1.80, face: 'front' },
      { x: 0.85, y: sillY, w: 1.20, h: 1.80, face: 'front' },
      { x: 0, y: sillY, w: 0.90, h: 1.42, face: 'left' },
      { x: 0, y: sillY, w: 0.90, h: 1.42, face: 'right' },
    ],
  });

  const floor = kit.floorPlate(ctx, {
    w: W, d: D, x: 0, z: FZ - D / 2, height: floorY, material: p.wallAlt, capMaterial: p.trim,
  });

  ctx.add(floor);
  ctx.add(core);
  ctx.add(wingShell);
  ctx.add(drum);
  ctx.add(mainRoof);
  ctx.add(wingRoof);
  ctx.add(valleys);
  ctx.add(cone);

  /* ── 6. the verandah: frame, turned posts, fretwork brackets and a pierced frieze ────────── */

  let postIndex = 0;
  let valanceIndex = 0;

  for (const bay of [bayL, bayR]) {
    const w = bay.x1 - bay.x0;
    if (w < 0.9) continue;
    const cx = (bay.x0 + bay.x1) / 2;

    const frame = kit.verandahFrame(ctx, {
      x: cx,
      z: FZ - VILLA.verandahDepth / 2,
      w,
      d: VILLA.verandahDepth,
      floorY,
      beamY: beamSoffitY,
      postStyle: 'none',              // DETAIL's turned posts replace KIT's plain sticks
      posts: bay.posts,
      // The main hip's own soffit plane sits 0.45 above the beam soffit, so without this the
      // verandah reads up into a void between the beam and the roof.
      ceiling: true,
      beamMaterial: p.trim,
      ceilingMaterial: p.shadow,
      deckMaterial: p.timber,
    });
    ctx.add(frame);

    const anchors = frame.anchors;
    const postH = frame.frame.beamY - frame.frame.floorY;
    const beamFaceZ = frame.frame.zFront;

    for (let i = 0; i < anchors.length; i += 1) {
      const a = anchors[i];
      ctx.add(detail.turnedPost(ctx, {
        x: a.x, z: a.z, base: floorY, height: postH, index: postIndex,
      }));

      // Brackets only where there is a span to bridge, so nothing dies in mid-air at a bay end.
      if (ctx.mid) {
        const hands = [];
        if (i > 0) hands.push(-1);
        if (i < anchors.length - 1) hands.push(1);
        for (const hand of hands) {
          ctx.add(detail.fretworkBracket(ctx, {
            x: a.x, y: frame.frame.beamY, z: a.z,
            size: VILLA.bracketSize, facing: 'front', hand,
          }));
        }
      }
      postIndex += 1;
    }

    for (let i = 0; i + 1 < anchors.length; i += 1) {
      const run = (anchors[i + 1].x - anchors[i].x) - KIT_METRICS.postSize - 0.06;
      if (run < 0.24) continue;
      ctx.add(detail.fretworkValance(ctx, {
        x: (anchors[i].x + anchors[i + 1].x) / 2,
        y: frame.frame.beamY,
        z: beamFaceZ,
        run,
        facing: 'front',
        drop: VILLA.valanceDrop,
        style: 'spindle',
        pitch: VILLA.valancePitch,
        index: valanceIndex,
      }));
      valanceIndex += 1;
    }
  }

  /* ── 7. joinery: the door, the sashes, the tower's leadlights ────────────────────────────── */

  const front = core.openings.filter((o) => o.face === 'front');
  for (let i = 0; i < front.length; i += 1) {
    const o = front[i];
    if (Math.abs(o.centre[0] - doorX) < 0.01) continue;
    ctx.add(detail.doubleHungSash(ctx, { opening: o, leadlight: true, index: i }));
  }

  ctx.add(detail.frontDoor(ctx, {
    x: doorX,
    y: floorY + VILLA.doorLeafH / 2,
    z: coreFrontZ,
    w: VILLA.doorLeafW,
    h: VILLA.doorLeafH,
    facing: 'front',
    fanlight: true,
    panels: 4,
  }));

  for (const o of core.openings) {
    if (o.face === 'front') continue;
    ctx.add(detail.doubleHungSash(ctx, { opening: o, lights: 1 }));
    // Hoods on the rear pair: the back elevation carries no verandah and no bay, so this plus the
    // chimney breast is what stops it being the blank plane §2.1 fails a build for.
    //
    // `windowHood`'s y datum is undocumented and `withOpening` hands it the opening's CENTRE,
    // which buries the hood in the middle of the sash (found by seat B-COTTAGE). Every coordinate
    // is passed explicitly and no `opening` record is used.
    if (o.face === 'back' && ctx.mid) {
      ctx.add(detail.windowHood(ctx, {
        x: o.centre[0],
        y: o.headY + 0.30,
        z: o.centre[2],
        w: o.w + DETAIL_ARCHITRAVE * 2,
        facing: 'back',
        projection: 0.52,
        drop: 0.20,
        style: 'skillion',
      }));
    }
  }
  for (let i = 0; i < wingShell.openings.length; i += 1) {
    ctx.add(detail.doubleHungSash(ctx, {
      opening: wingShell.openings[i], leadlight: i < 2, lights: 1, index: 8 + i,
    }));
  }
  for (let i = 0; i < drum.openings.length; i += 1) {
    ctx.add(detail.doubleHungSash(ctx, {
      opening: drum.openings[i], leadlight: true, index: 12 + i,
    }));
  }

  /* ── 8. the tower's cornice run, and its string course ───────────────────────────────────── */

  const towerHeadY = sillY + VILLA.towerWindowH;
  for (let i = 0; i < VILLA.towerSides; i += 1) {
    const f = facetFrame(drum.drum, i);
    // String course: the cream band where the red brick base gives way to roughcast, carried
    // round the drum facet by facet so it turns the corners instead of cutting them.
    ctx.add(detail.sill(ctx, {
      x: f.x, y: floorY + VILLA.baseCourse, z: f.z,
      w: f.chord, facing: f.yaw, ear: 0.02, height: 0.13, proj: 0.15, drip: false,
    }));
    // The band above the window heads. Without it the drum carries 1.6 m of unbroken roughcast
    // between the architraves and the cornice, which is the one place this tower can read blank.
    ctx.add(detail.sill(ctx, {
      x: f.x, y: towerHeadY + VILLA.towerUpperBandRise, z: f.z,
      w: f.chord, facing: f.yaw, ear: 0.02, height: 0.11, proj: 0.13, drip: false,
    }));
    // Modillion blocks under the drum's faceted wall plate — `detail-terracotta-ridge-tower.png`
    // carries a run of them on every facet and they are the tower's loudest detail after the cone.
    if (ctx.detail) {
      ctx.add(detail.rafterTails(ctx, {
        x: f.x, y: drumTopY - KIT_METRICS.wallPlate, z: f.z,
        run: f.chord, facing: f.yaw,
        pitch: 0.42, depth: 0.22, width: 0.13, height: 0.20,
        bedMould: false,
      }));
    }
  }

  /* ── 9. the gable face, the ridge line and the finials ───────────────────────────────────── */

  // The panel is inset from the RAKE by `gablePanelInset`, which was set to the solved rake
  // overhang, so this resolves to the wing's own wall plane (env.frontZ). Read off the rake KIT
  // published, minus the same number that was handed to it, so the two cannot drift.
  //
  // THE STRAPWORK IS MOUNTED ON THAT PANEL AND TAKES THE SAME CORRECTION. Its y datum is the
  // panel's own base — the wing's spring line — not the main building's wall top. Using
  // `wallTopY` here (which is what r2 shipped) both dropped the strapwork 0.52 m into the main
  // roof and stretched it 0.52 m past the gable's own apex.
  const gablePanelZ = wing.rakes[0].apex[2] - wingRakeOver;
  const gableHalfSpan = (VILLA.wingWidth + VILLA.wingEaveOverhang * 2) / 2;
  const gableRise = wing.ridgeY - wing.springY;

  ctx.add(detail.strapwork(ctx, {
    x: wingX,
    y: wing.springY,
    z: gablePanelZ + 0.02,
    w: gableHalfSpan * 2 - 0.16,
    h: gableRise - 0.10,
    facing: 'front',
    bays: 4,
    // No `material` override: DETAIL defaults strapwork to `joinery`, and the orchestrator
    // confirmed dark-green-on-cream against the real building. CONTRACT §6a / report-detail.md.
  }));

  const ridgeCapTop = main.ridgeY + KIT_METRICS.ridgeCapRise
    + KIT_METRICS.ridgeCapWidth * 0.5 - KIT_METRICS.ridgeCapRise * 0.65;

  ctx.add(detail.ridgeCresting(ctx, {
    x: main.plan.x, y: ridgeCapTop, z: main.plan.z, run: ridgeLen, axis: 'x',
  }));

  // Cresting on the wing's own ridge, run over the length that actually stands clear of the main
  // roof rather than an authored 1.70. The ridge now emerges at `wingRidgeSubZ` and runs to the
  // rake, so the run is solved between the two and the comb never sinks into the tiles.
  const crestFrontZ = wing.ridge.to[2] - 0.24;
  const crestBackZ = Math.min(crestFrontZ - 0.90, wingRidgeSubZ + 0.55);
  const wingCrestRun = crestFrontZ - crestBackZ;
  ctx.add(detail.ridgeCresting(ctx, {
    x: wingX,
    y: wing.ridgeY + KIT_METRICS.ridgeCapRise + KIT_METRICS.ridgeCapWidth * 0.5
      - KIT_METRICS.ridgeCapRise * 0.65,
    z: (crestFrontZ + crestBackZ) / 2,
    run: wingCrestRun,
    axis: 'z',
  }));

  // NO KNEE BRACKETS UNDER THE GABLE'S BARGE, and this is a removal rather than an omission.
  //
  // r2 emitted two, at `y: wallTopY, z: FZ`. Measured, their outriggers occupied y 3.759–3.949
  // over z 5.250–5.890 — inside the main hip's own eave, whose soffit plane runs y 3.880–3.930
  // out to z 5.830. They were buried in the eave from the day they were written. Now that the
  // gable springs from the roof surface rather than from a wall standing proud of it, there is
  // no wall under the barge feet for a bracket to be carried by, and a bracket dropped 0.78 from
  // the new spring line would hang straight through the main roof plane. §2.2 — nothing dies in
  // mid-air, and nothing passes through a surface it should meet.

  ctx.add(detail.finial(ctx, {
    x: wingX, y: wing.ridgeY - 0.06, z: gablePanelZ, height: VILLA.gableFinialH,
    material: p.roof,
  }));
  ctx.add(detail.finial(ctx, {
    x: towerX, y: coneApexY - 0.10, z: towerZ, height: VILLA.towerFinialH, material: p.roof,
  }));
  if (ctx.mid) {
    for (const end of [main.ridge.from, main.ridge.to]) {
      ctx.add(detail.finial(ctx, {
        x: end[0], y: ridgeCapTop, z: end[2], height: VILLA.hipFinialH, material: p.roof,
      }));
    }
  }

  /* ── 10. two tall corbelled chimneys, both passing THROUGH the roof plane ────────────────── */

  const chimneys = [
    // On the rear wall, with a breast that articulates the back elevation (§2.1).
    {
      x: -W * 0.34,
      z: env.backZ + (VILLA.chimneyD / 2 + 0.17),
      breast: {
        w: VILLA.chimneyW * 1.45, d: 0.34, top: wallTopY, sign: -1,
      },
    },
    // Inboard, near the ridge, so the silhouette carries a vertical on the tower's side too.
    { x: W * 0.16, z: coreZ + coreD * 0.28, breast: null },
  ];

  // `chimney`'s default `top` is `roofY + max(1.15, (ridgeY - roofY) + 0.85)`, which is generous
  // enough that the cap and pots above it end 1.6 m over the ridge (found by seat B-COTTAGE). The
  // head is therefore authored: `chimneyHeadRise` above the ridge, so the SHAFT clears the ridge
  // by a stated amount and the cap plus pots — 0.35 of corbel and capping, then the pot —
  // finish where the reference and the bar plates put them.
  for (const c of chimneys) {
    const topY = env.ridgeY + VILLA.chimneyHeadRise;
    const shaft = kit.chimney(ctx, {
      x: c.x,
      z: c.z,
      base: 0,
      top: topY,
      w: VILLA.chimneyW,
      d: VILLA.chimneyD,
      material: p.wallAlt,
      throughRoof: mainRoof,
      shoulderMaterial: p.trim,
      ...(c.breast ? { breast: c.breast } : {}),
    });
    if (shaft.warning) console.warn(`[villa] chimney at ${c.x.toFixed(2)}: ${shaft.warning}`);
    ctx.add(shaft);
    ctx.add(detail.chimneyCap(ctx, {
      x: c.x, y: shaft.shaft.top, z: c.z,
      w: VILLA.chimneyW, d: VILLA.chimneyD,
      pots: 2, potHeight: VILLA.chimneyPotH, potMaterial: p.roof, render: true,
    }));
  }

  /* ── 11. gutters that start at a roof edge and downpipes that finish on the ground ───────── */

  if (ctx.mid) {
    // `gutterAndDownpipe` puts the downpipe in the GUTTER'S OWN PLANE, at `r + 0.02` from the
    // datum — so an eave-line datum hangs the pipe half a metre off the wall with nothing behind
    // it. Found by seat B-COTTAGE. The datum therefore goes on the WALL FACE and `projection`
    // carries the gutter out under the eave, which puts the pipe against the wall it runs down.
    //
    // The projection is `overhang - 0.10` rather than the cottage seat's `overhang + 0.09`: on
    // façade 3 this envelope puts the flank eave 8 mm inside the lot plate's own edge, so a
    // gutter face beyond the eave hangs off the tile. Stated rather than worked around.
    const flankProjection = Math.max(0.16, overhang - 0.10);
    for (const sgn of [-1, 1]) {
      ctx.add(detail.gutterAndDownpipe(ctx, {
        x: sgn * (W / 2),
        y: wallTopY,
        z: coreZ,
        run: coreD,
        facing: sgn > 0 ? 'right' : 'left',
        projection: flankProjection,
        groundY: 0,
        downpipes: 'end',
        index: sgn > 0 ? 1 : 0,
      }));
    }
    // The front eave carries a gutter and NO downpipe: it runs above the frieze, which is where
    // the reference puts it, and there is no wall under it for a pipe to cross. The two flank
    // downpipes are the ones that reach the ground.
    ctx.add(detail.gutterAndDownpipe(ctx, {
      x: 0,
      y: wallTopY - 0.05,
      z: FZ + overhang,
      run: W + overhang * 2 - 0.10,
      facing: 'front',
      projection: 0.09,
      groundY: 0,
      downpipes: 'none',
      index: 2,
    }));
  }

  /* ── 12. the lot. `garden.lotSurface`, never `kit.lotPlate` (CONTRACT §6a.1) ─────────────── */

  const lotOpts = { x: doorX };
  ctx.add(garden.lotSurface(ctx));
  ctx.add(garden.kerbAndFootpath(ctx, lotOpts));
  ctx.add(garden.path(ctx, { ...lotOpts, deckZ: FZ }));
  ctx.add(garden.boundary(ctx, lotOpts));
  ctx.add(garden.gate(ctx, lotOpts));
  // Density 1.7 is a lane-wide decision — all four archetypes pass the same value so the four lots
  // read as one street. It matters twice over here: this envelope leaves 0.28 of side margin, so
  // GARDEN gives the villa two front beds and no side beds, and GARDEN deliberately built this
  // archetype's boundary LOW so it frames rather than encloses. A low boundary only frames if
  // something is planted behind it. Note that density was a no-op on this archetype until GARDEN's
  // slot-pool fix — the cluster cap was never the binding constraint here, the slot pool was.
  ctx.add(garden.planting(ctx, { density: 1.7 }));
  ctx.add(garden.streetTree(ctx));
  ctx.add(garden.letterbox(ctx, lotOpts));
  ctx.add(garden.services(ctx));

  /* ── 13. the numbers a critic can check without opening the renderer ─────────────────────── */

  const doorHeadY = floorY + VILLA.doorOpeningH;
  return Object.freeze({
    ridgeY: main.ridgeY,
    ridgeTargetY: env.ridgeY,
    ridgeError: main.ridgeY - env.ridgeY,
    mainPitchDeg,
    hipEndPitchDeg: Math.atan2(rise, (planW - ridgeLen) / 2) / DEG,
    ridgeLen,
    chimneyHeadY: env.ridgeY + VILLA.chimneyHeadRise,
    towerX,
    towerZ,
    drumTopY,
    drumRadius: VILLA.towerRadius,
    drumCapRadius: VILLA.towerRadius + VILLA.towerCapProud,
    coneEaveRadius: coneEaveR,
    coneEaveWorstRoofY: coneEaveWorst,
    coneApexY,
    wingRidgeY: wing.ridgeY,
    wingRoofHeadroom: main.heightAt(wingX, wing.ridge.from[2]),
    // The wing junction, published so a critic can check it without a renderer.
    wingFaceZ: gableFaceZ,
    gablePanelZ,
    wingSpringY: wing.springY,
    wingStand,
    // > 0 on every façade: the gable panel's own base stands this far above the main roof's skin
    // at the panel's plane. r2 shipped this at -0.358.
    wingStandMeasured: wing.springY - wingFaceRoofY,
    wingRakeOver,
    wingRoofDepth,
    wingRidgeSubZ,
    // The barge's lowest vertex against the main roof's skin directly under it. Near zero means
    // the barge foot lands on the roof: positive floats, very negative buries.
    bargeFootY: wing.springY - bargeFootDrop,
    bargeFootRoofY: roofSkinAt(wingEaveL, gableFaceZ + wingRakeOver),
    bargeFootClearance: (wing.springY - bargeFootDrop)
      - (roofSkinAt(wingEaveL, gableFaceZ + wingRakeOver) ?? 0),
    valleys: valleys.valleys.length,
    beamSoffitY,
    doorHeadY,
    doorHeadClearance: beamSoffitY - doorHeadY,
    bayLeft: [bayL.x0, bayL.x1],
    bayRight: [bayR.x0, bayR.x1],
    wingEaves: [wingEaveL, wingEaveR],
    doorX,
  });
}
