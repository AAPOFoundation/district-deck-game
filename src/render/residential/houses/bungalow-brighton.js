// District Deck V3.40 — seat B-BAY. `bungalow-brighton`, the 1930s bayside Brighton bungalow.
//
// Governing spec: docs/next-phase/V340-RESIDENTIAL-HOUSES-FROM-SCRATCH-SPEC.md §7
// Module contract: ./CONTRACT.md — §4 (the nine buckets) and §6a (the Wave A rulings).
//
// Subject:  _reference-v340/like-bungalow-brighton-front.png / -threequarter.png
// Bar:      _reference-mp/mp-bungalow-brighton.png / --front / --street
// Details:  _reference-v340/detail-leadlight-bay-window.png,
//           _reference-v340/detail-clinker-brick-chimney.png
//
// ── The archetype, and how it is kept apart from the Californian ──────────────────────────
//
// The two bungalows are graded against each other in silhouette alone (§2.1), so every massing
// number here is chosen against the Californian's and stated as a number rather than as an
// adjective:
//
//                              Brighton (this file)       Californian
//   width : height to ridge    11.90 : 6.40 = 1.86        13.5 : 5.50 = 2.45
//   roof pitch                 38°  (steep)               26°  (broad and low)
//   eave overhang              0.52                       0.95
//   street gables              one dominant at 6.40 and   two broad ones, near-equal,
//                              one small porch gable at   both spanning most of the
//                              4.85 — 1.55 apart          frontage
//   front projection           a faceted BAY, 0.52 proud  a RECESSED porch bank
//   chimney pot head           7.76, 1.36 over the ridge  a low stack beside the ridge
//
// Thrown into outline this reads as one tall steep triangle with a small steep triangle beside
// it and a tall stack on the flank; the Californian reads as two wide shallow triangles under
// deep eaves. A critic who cannot separate them has a defect to report, not a preference.
//
// ── The roof, which is the whole geometric problem ────────────────────────────────────────
//
// `env.ridgeY` is an absolute authored target of 6.40 against a spring line at 3.53, so the
// roof has 2.87 of rise to work with. One hip over the 11.3 m body depth at 38° would rise
// 4.82 and land the ridge at 8.35. CONTRACT §6a.4 is explicit: break the plan into wings.
//
// So the pitch is fixed at KIT's 38° and every SPAN is solved backwards from the rise:
//
//   halfSpan = rise / tan(38°)
//   front block depth = 2·halfSpan − 2·overhang = 6.31
//
// which lands the main hip's ridge on `env.ridgeY` to three decimals on every façade, and the
// street gable's own span is solved the same way from its own spring line so its apex lands
// there too. Behind them a shallower rear block takes a lower hip (ridge 5.48) whose front
// eave meets the main roof's rear eave fascia to fascia. Four roof masses, two of them solved
// by `roofIntersection` into real climbing valleys.
//
// ── Four Wave A hazards this file works around rather than reporting late ─────────────────
//
// 1. Every KIT roof call pushes an UNGATED horizontal soffit slab at `springY − 0.07`, so two
//    masses sharing a spring line z-fight across a plane the size of the building. The four
//    springs here are held at 3.530 (main hip and rear hip, whose plans only ABUT), 3.690
//    (street gable, +0.16) and 3.180 (porch gable, −0.35).
// 2. `gableRoof`'s `gablePanelInset` is measured from the RAKE plane, not the wall. It is now
//    chosen for the POCKET it leaves rather than for where the face lands — see `plan()`.
// 3. `gutterAndDownpipe` puts the downpipe in the gutter's own plane, so the datum is the WALL
//    face and `projection` carries the gutter out to the eave.
// 4. `shingleCourses`' `gableRake` wants the rake's rise per unit run, so it is passed a
//    measured slope and not the documented 2h/w.
//
// ── What the V3.40-r2 plate cost, and what is still outstanding ───────────────────────────
//
// Five defects were called on `v340-r2/bungalow-brighton--three-quarter.png`. Four are repaired
// here and each repair carries its own measured note at the call site: the two gables' rear
// panels standing through the main hip (`panelEnds`), both gable faces sitting too deep in
// their own barge pockets (`gablePanelInset`, `porchRakeFrontZ`), three tiled roof faces short
// enough for KIT's covering to wind its top courses inside-out (`tiledHalfSpanFloor`), and the
// bay growing through GARDEN's hedge and through its own roof (`YARD_CLEAR`, `roof: true`).
//
// TWO ARE NOT MINE AND ARE NOT WORKED AROUND HERE:
//
//   `house-detail.js` → `strapwork()` rakes its two rake plates and two apex braces with an
//   INVERTED tilt sign, so each runs from the middle of the gable base outward and upward and
//   leaves the triangle. Measured on every façade: each rake plate's far end stands 2.427 clear
//   of the roof surface behind it. `braces: false` below removes two of the four; the two rake
//   plates cannot be suppressed from a call site. `heritage-federation-villa` shares it.
//
//   `garden.js` → `hedgeRun()` builds each run as one axis-aligned box plus an inset crown box
//   plus two end balls, so the boundary reads as a plastic slab. Nothing this file passes
//   reaches it — the style comes from GARDEN's own table and the dimensions are its defaults.
//
// Salts: 1900–1999 (CONTRACT §5). No Math.random, no clock, no module-level mutable state.

import {
  KIT_METRICS,
  floorPlate,
  wallShell,
  hipRoof,
  gableRoof,
  roofIntersection,
  verandahFrame,
  chimney,
} from './house-kit.js';
import {
  DETAIL_MEMBERS,
  leadlightBay,
  frontDoor,
  doubleHungSash,
  casementBank,
  taperedPier,
  strapwork,
  shingleCourses,
  ventGrille,
  finial,
  chimneyCap,
  gutterAndDownpipe,
} from './house-detail.js';
import {
  lotSurface,
  path,
  boundary,
  gate,
  planting,
  streetTree,
  letterbox,
  services,
  kerbAndFootpath,
} from './garden.js';
import { slab } from '../core.js';

const DEG = Math.PI / 180;

/** Salt band owned by this archetype — CONTRACT §5. */
const SALT = Object.freeze({
  chimney: 1900,
  flankWindow: 1910,   // +0..3, one per front-block flank opening
  rearWindow: 1920,    // +0..3, one per rear-block opening
  porch: 1930,         // reserved: the porch is fully determined and jitter would unsquare it
});

const clamp = (x, lo, hi) => (x < lo ? lo : (x > hi ? hi : x));

/**
 * Clear front yard, measured off GARDEN's emitted geometry rather than guessed.
 *
 * `garden.boundary` gives this archetype the `brick-hedge` style, and `hedgeRun` puts
 * `hedge-front-*-body` at z 5.420 → 6.020, y 0.000 → 0.880 on every façade (`lotD` and
 * `frontSetback` are constants, so `env.frontZ` is 4.800 on all four). Nothing this file emits
 * below y 1.02 may cross z 5.420, and the V3.40-r2 plate shows what happens when it does: the
 * bay's own brick plinth ran to z 5.700, 0.280 inside the hedge, and the hedge crossed the bay.
 */
const YARD_CLEAR = 0.62;

/**
 * The shortest slope a tiled KIT roof face can close at `high`, as a function of pitch.
 *
 * `roofFace` → `foldedSurface` orients each quad against `vnorm(mid − interior)`, and for the
 * riser quads of a tile course that reference degenerates near the ridge: the riser's own
 * outward normal is `−step·ê_s + Δs·ê_n` with `Δs = (1 − tileCourseRun)/courses · L`, so once
 * `step·sin(pitch) > Δs·cos(pitch)` the reference picks the inward normal and the top courses
 * are wound inside-out. Under `side: FrontSide` they vanish and the face opens a slot parallel
 * to its ridge. Rearranged, a face is closed only while
 *
 *     halfSpan (overhang included)  >  courses · step / (1 − tileCourseRun) · sin(pitch)
 *                                   =  4.821 · sin(pitch)   at high (9 courses, 0.075, 0.86)
 *
 * Measured against the r2 build, which had five tiled masses: main hip 3.719 > 2.966 closed;
 * street gable 3.469 > 2.966 closed; rear hip 2.297 < 2.966 OPEN (2 of 36 triangles inverted);
 * porch gable 1.786 < 2.966 OPEN (4/36); bay hip 0.640 < 2.113 at 26° OPEN (4/36). Five faces,
 * five correct predictions, and after the three repairs below the whole build is clean at every
 * façade and every quality.
 *
 * The fix belonged in `house-kit.js`, and it has since landed: `foldedSurface` now orients every
 * quad against the face's own `sample(...).n` rather than a ray from an interior point. A direct
 * audit over 48 builds — every archetype, façade and quality, 572,064 triangles, with each face's
 * plane recovered by PCA over its own vertices so nothing the file wrote is trusted — counted
 * **32 inverted triangles before and 0 after**, at zero triangle-count cost.
 *
 * SO THIS GUARD IS RETIRED, and the two subsidiary masses take tile again.
 *
 * That is a real gain rather than tidying: while the workaround stood, this archetype's rear hip
 * and porch gable carried NO modelled course rhythm at all — flat terracotta against a main hip
 * with nine courses per plane — purely because of a winding bug two files away. The law that
 * chose them is preserved above as the record of how the bug was found, and it now predicts
 * nothing that happens, which is the point.
 */

/**
 * Every line in the building, solved once from `ctx.env` so no two components can disagree
 * about where a plane is. Pure: same env, same numbers.
 *
 * `bellcastY` is where the clinker base course meets the roughcast render, and it is 1.34
 * because `house-surfaces.js` publishes `ARCHETYPE_WEAR['bungalow-brighton'].bellcast = 1.34`
 * and phases its grime band on that number. Geometry and wear agree by construction.
 */
function plan(ctx) {
  const e = ctx.env;
  const overhang = KIT_METRICS.overhang[ctx.id] ?? 0.52;
  const pitchDeg = KIT_METRICS.pitchDeg[ctx.id] ?? 38;
  const tanP = Math.tan(pitchDeg * DEG);
  const springY = e.floorY + e.wallH;
  const rise = Math.max(1.2, e.ridgeY - springY);

  /* ── the front block, whose hip IS the authored ridge ──────────────────────────────── */
  const mainD = clamp((rise / tanP) * 2 - overhang * 2, 3.4, e.bodyD - 3.2);
  const mainZ = e.frontZ - mainD / 2;
  // Derived AFTER the clamp, so a façade jitter that moves a span bends the pitch rather than
  // the ridge. `env.ridgeY` is a target, not a suggestion.
  const mainPitch = Math.atan(rise / ((mainD + overhang * 2) / 2)) / DEG;

  /* ── the rear block: narrower, one whole span shorter, its own lower hip ───────────── */
  const rearD = e.bodyD - mainD;
  const rearW = Math.max(4.0, e.bodyW - 1.30);       // a 0.65 step on each flank
  const rearZ = e.backZ + rearD / 2;
  const rearRoofD = Math.max(1.0, rearD - overhang * 2);
  const rearRoofZ = (e.frontZ - mainD + e.backZ) / 2 - overhang;
  const rearRidge = springY + tanP * (rearRoofD + overhang * 2) / 2;
  const rearPitch = rearRidge > e.ridgeY - 0.55
    ? Math.atan((rise - 0.55) / ((rearRoofD + overhang * 2) / 2)) / DEG
    : pitchDeg;

  /* ── the street gable ──────────────────────────────────────────────────────────────── */
  // +0.16 on the spring keeps its soffit slab off the main hip's (hazard 1) and lifts its
  // eaves clear of the main roof so the valleys are cut on visible geometry.
  const gableSpring = springY + 0.16;
  const gableRise = e.ridgeY - gableSpring;
  const gableW = clamp((gableRise / tanP) * 2 - overhang * 2, 3.4, e.bodyW - 4.2);
  const gablePitch = Math.atan(gableRise / ((gableW + overhang * 2) / 2)) / DEG;
  // Set in so the gable's +X EAVE lands on the +X wall plane: the gable panel is a triangle
  // spanning eave to eave, and any other offset hangs a sliver of roughcast off the corner.
  const gableX = e.bodyW / 2 - gableW / 2 - overhang;
  // The ridge runs from the street rake back to the main ridge line, where it dies at the
  // same height. `gableEnds:[1]` suppresses the rear panel, whose opening is then buried.
  const gableD = Math.max(0.8, (e.frontZ + overhang) - mainZ - overhang * 2);
  const gableZ = e.frontZ - gableD / 2;

  /* ── the entry porch: a recess in the -X end of the frontage under its own small gable ─
   *
   * Recessed, not projecting, and that is measured rather than stylistic: GARDEN's clipped
   * hedge occupies z 5.42–6.02 and the front wall is at 4.80, so the clear front yard is 0.62
   * and a pier pedestal is 0.80. A projecting porch puts its footings inside the hedge.       */
  // `porchBayW` is the master: the clear width of the recess, flank wall to return wall. The
  // gable's SPAN INCLUDING ITS OVERHANG is set equal to it, so both eaves land on a wall and
  // the gable's apex, its finial, the porch floor and the two piers all share one centre line.
  const porchBayW = clamp(e.bodyW * 0.30, 3.0, 4.2);
  const porchD = 1.25;                                  // the recess depth
  const porchOver = 0.34;
  const porchW = Math.max(1.6, porchBayW - porchOver * 2);
  const porchX = -e.bodyW / 2 + porchBayW / 2;
  const porchSpring = springY - 0.35;
  const porchApex = porchSpring + tanP * porchBayW / 2;
  // 0.42, not the 1.05 of the first build. The rake only has to oversail the pier caps, which
  // stand at z 4.945, and every centimetre it projects past that is a centimetre of pocket
  // between the barge board and the gable face behind it. At 1.05 the face sat 0.855 behind
  // the barge's inner arris inside a `shadow`-lined channel and the whole triangle crushed to
  // a hole on the r2 plate; at 0.42 the pocket is 0.265 and the shingle field is lit.
  const porchRakeFrontZ = e.frontZ + 0.42;
  // The rear rake runs back far enough to be buried under the main roof, so the suppressed
  // rear panel cannot be seen, and so its soffit slab roofs the whole recess.
  const porchRakeBackZ = e.frontZ - porchD - 0.30;
  const porchRoofD = Math.max(0.6, (porchRakeFrontZ - porchRakeBackZ) - porchOver * 2);
  const porchZ = (porchRakeFrontZ + porchRakeBackZ) / 2;
  // Where the panel actually lands, published so the shingle field and the belt read it rather
  // than each re-deriving it. `gablePanelInset` is measured back from the RAKE, so the face is
  // at `porchRakeFrontZ − inset`; 0.34 puts it 0.08 proud of the porch beam's own front face
  // (z 4.800), which is what the courses stand on.
  const porchPanelInset = 0.34;
  const porchFaceZ = porchRakeFrontZ - porchPanelInset;
  // The beam's top is held 0.12 under the porch gable's spring so the gable's own soffit slab
  // passes above it rather than through its face.
  const beamY = porchSpring - KIT_METRICS.beamDepth - 0.12;

  return {
    overhang,
    pitchDeg,
    tanP,
    springY,
    rise,
    bellcastY: 1.34,
    baseCourseH: 1.34 - e.floorY,
    mainD,
    mainZ,
    mainPitch,
    rearD,
    rearW,
    rearZ,
    rearRoofD,
    rearRoofZ,
    rearPitch,
    gableSpring,
    gableW,
    gableX,
    gableD,
    gableZ,
    gablePitch,
    // 0.24, not the 0.52 the first build used. `gablePanelInset` is measured back from the RAKE
    // plane, so 0.52 stood the roughcast face on the wall line at z 4.800 with the barge board
    // at 5.245 → 5.395: a 0.45-deep pocket lined on both rakes with `shadow`. On the r2 plate
    // that pocket is the reason the gable reads as an opening rather than as a face. At 0.24
    // the face is at z 5.080, the pocket is 0.165, and the panel still lands on the gable's own
    // soffit plane (y 3.620 → 3.670, z 1.647 → 5.320) rather than on air.
    gablePanelInset: 0.24,
    gableFaceZ: e.frontZ + overhang - 0.24,
    porchW,
    porchBayW,
    porchD,
    porchX,
    porchZ,
    porchOver,
    porchRoofD,
    porchSpring,
    porchApex,
    porchRakeFrontZ,
    porchPanelInset,
    porchFaceZ,
    beamY,
    // Shell A is the main frontage; shell B is the recessed porch bay behind it. They overlap
    // by 0.06 in X so their shared elevation is BURIED in both rather than coplanar in both.
    shellAW: e.bodyW - porchBayW,
    shellAX: porchBayW / 2,
    shellBW: porchBayW + 0.06,
    shellBX: -e.bodyW / 2 + (porchBayW + 0.06) / 2,
    shellBD: mainD - porchD,
    shellBZ: mainZ - porchD / 2,
    doorX: -e.bodyW / 2 + porchBayW / 2,
    doorZ: e.frontZ - porchD,
    sillY: 1.44,
    windowH: 1.42,
  };
}

/* ═══════════════════════════════════════ the building ════════════════════════════════════ */

export default function build(ctx) {
  const e = ctx.env;
  const p = ctx.p;
  const g = plan(ctx);
  const jitter = (salt, amount) => (ctx.v ? ctx.v.range(salt, -amount, amount) : 0);

  /* ── 1. the lot. GARDEN owns the plate and the chamfer; `kit.lotPlate` is NOT called
   *      (CONTRACT §6a.1 — calling both emits the board tile twice and z-fights it). ── */
  ctx.add(lotSurface(ctx));
  ctx.add(kerbAndFootpath(ctx, { x: g.doorX }));

  /* ── 2. floor plates and wall shells ───────────────────────────────────────────────── */

  ctx.add(floorPlate(ctx, { w: g.shellAW, d: g.mainD, x: g.shellAX, z: g.mainZ, height: e.floorY }));
  ctx.add(floorPlate(ctx, { w: g.shellBW, d: g.shellBD, x: g.shellBX, z: g.shellBZ, height: e.floorY }));
  ctx.add(floorPlate(ctx, { w: g.rearW, d: g.rearD, x: 0, z: g.rearZ, height: e.floorY }));

  // Openings. `x` is the centre offset from the face's own centre, left to right as you look
  // at that elevation from outside (CONTRACT §6a.8); `y` is the sill in world Y.
  const win = (face, x, w = 1.12, h = g.windowH) => ({ face, x, w, h, y: g.sillY });

  // Shell A — the main frontage, the +X flank with the chimney, and the porch return.
  const front = wallShell(ctx, {
    w: g.shellAW,
    d: g.mainD,
    x: g.shellAX,
    z: g.mainZ,
    base: e.floorY,
    height: e.wallH,
    articulate: 'none',           // the chimney and the porch recess do this elevation's work
    // Roughcast render over a dark clinker base course, and NO string course: the subject and
    // the bar both run clinker straight into render with a 0.055 return, and a moulded band
    // here would cross the bay's own sill band 0.16 higher up.
    baseCourse: { height: g.baseCourseH, material: p.wallAlt, moulding: false },
    openings: [
      win('right', -2.10 + jitter(SALT.flankWindow, 0.18)),
      win('right', 1.55 + jitter(SALT.flankWindow + 1, 0.18)),
      win('left', -1.35 + jitter(SALT.flankWindow + 2, 0.18), 1.02, 1.24),
      win('back', 2.20 + jitter(SALT.flankWindow + 3, 0.20), 0.98, 1.24),
    ],
  });
  ctx.add(front);

  // Shell B — the porch bay, its front wall 1.25 back from the frontage. The door is on it.
  const porchBay = wallShell(ctx, {
    w: g.shellBW,
    d: g.shellBD,
    x: g.shellBX,
    z: g.shellBZ,
    base: e.floorY,
    height: e.wallH,
    faces: ['front', 'left'],     // its right face is buried in shell A, its back in the rear
    articulate: 'none',
    baseCourse: { height: g.baseCourseH, material: p.wallAlt, moulding: false },
    openings: [
      { face: 'front', x: -0.03, w: 1.12, h: 2.30, y: e.floorY },
      win('left', 0.35 + jitter(SALT.flankWindow + 4, 0.16), 0.92, 1.24),
    ],
  });
  ctx.add(porchBay);

  const rear = wallShell(ctx, {
    w: g.rearW,
    d: g.rearD,
    x: 0,
    z: g.rearZ,
    base: e.floorY,
    height: e.wallH,
    // The front face is buried inside the front blocks, which are both wider and taller;
    // building it costs triangles and earns an `auto` breast nobody will ever see.
    faces: ['back', 'left', 'right'],
    articulate: 'none',
    baseCourse: { height: g.baseCourseH, material: p.wallAlt, moulding: false },
    openings: [
      win('back', -2.05 + jitter(SALT.rearWindow, 0.16)),
      win('back', 2.05 + jitter(SALT.rearWindow + 1, 0.16)),
      win('left', -1.20 + jitter(SALT.rearWindow + 2, 0.18), 0.98, 1.24),
      win('left', 1.30 + jitter(SALT.rearWindow + 3, 0.18), 0.86, 1.10),
      win('right', -1.30 + jitter(SALT.rearWindow + 4, 0.18), 0.98, 1.24),
      win('right', 1.20 + jitter(SALT.rearWindow + 5, 0.18), 0.86, 1.10),
    ],
  });
  ctx.add(rear);

  /* ── 3. the roofs ─────────────────────────────────────────────────────────────────────
   *
   * Four masses at four spring lines: 3.530 main hip, 3.530 rear hip (its plan ABUTS the
   * main hip's rather than overlapping it, so the two ungated soffit slabs share an edge and
   * no face), 3.690 street gable, 3.180 porch gable.                                       */

  const mainRoof = hipRoof(ctx, {
    w: e.bodyW,
    d: g.mainD,
    x: 0,
    z: g.mainZ,
    springY: g.springY,
    pitch: g.mainPitch,
    overhang: g.overhang,
    covering: 'tile',
  });
  ctx.add(mainRoof);

  // The rear hip's half span is (rearRoofD + 2·overhang)/2 = 2.297 against a floor of
  // 4.821·sin(38°) = 2.968, so its tile courses invert near the ridge and open a slot the width
  // of the building — the pale bar the r2 plate shows lying just over the main ridge. Nothing
  // in the caller's gift closes it: the span is what the plan leaves after the front block has
  // taken its 6.307, and dropping the pitch under 28.4° to get inside the floor would put a
  // shallow roof beside a 38° one. `plain` has no risers to invert.
  const rearTiled = true; // winding bug fixed in house-kit.js; see the note at tiledHalfSpanFloor
  const rearRoof = hipRoof(ctx, {
    w: g.rearW,
    d: g.rearRoofD,
    x: 0,
    z: g.rearRoofZ,
    springY: g.springY,
    pitch: g.rearPitch,
    overhang: g.overhang,
    covering: rearTiled ? 'tile' : 'plain',
  });
  ctx.add(rearRoof);

  // The street gable. `ridgeAxis: 'z'` puts the gable END on the street.
  const streetGable = gableRoof(ctx, {
    w: g.gableW,
    d: g.gableD,
    x: g.gableX,
    z: g.gableZ,
    springY: g.gableSpring,
    pitch: g.gablePitch,
    overhang: g.overhang,
    ridgeAxis: 'z',
    gableEnds: [1],
    // KIT split the barge from the panel after Wave B reported it, and `panelEnds` now defaults
    // to BOTH ends whatever `gableEnds` says. That default is right for a free-standing gable
    // and wrong here: this gable dies into the main hip, and its rear panel is inset 0.52
    // FORWARD of the rake it belongs to, so it lands at z 2.167 where the main hip's own
    // surface is only 5.994 — the apex stood 0.346 through the tiles as a pale triangle, and
    // the rear rake soffit with it at 0.286 on `shadow`. Checked before suppressing: at the
    // rear rake plane (z 1.647, the main ridge line) every point of this gable's opening lies
    // under the main hip surface, worst case 0.262 at x 5.932, so there is no hole to leave.
    panelEnds: [1],
    covering: 'tile',
    gablePanelMaterial: p.wall,   // roughcast standing IN the gable, not roof carried up it
    // Measured from the RAKE plane — see `gablePanelInset` in `plan()` for why it is 0.24.
    gablePanelInset: g.gablePanelInset,
  });
  ctx.add(streetGable);

  const porchGable = gableRoof(ctx, {
    w: g.porchW,
    d: g.porchRoofD,
    x: g.porchX,
    z: g.porchZ,
    springY: g.porchSpring,
    pitch: g.pitchDeg,
    overhang: g.porchOver,
    ridgeAxis: 'z',
    gableEnds: [1],
    // Same suppression as the street gable, same check: at the rear rake plane (z 3.250) the
    // main hip surface is 4.680 at this gable's own left eave and 5.188 over its apex, against
    // an opening that tops out at 4.575 — buried on every façade, so no hole. Left in, the rear
    // panel landed at z 4.250 and stood 0.083 through the main roof as a pale sliver.
    panelEnds: [1],
    // Half span (porchBayW/2) is 1.786 against a floor of 4.821·sin(38°) = 2.968, so the tile
    // courses invert near the ridge — see `tiledHalfSpanFloor`. This one is 2.9 m from the
    // camera on the front plate, so the slot is not a back-of-house problem.
    covering: 'tile',
    gablePanelMaterial: p.wall,
    gablePanelInset: g.porchPanelInset,
  });
  ctx.add(porchGable);

  // Valleys. Both gables die into the main hip's front pitch, so both pairs are real climbing
  // lines rather than two solids left to the depth buffer.
  ctx.add(roofIntersection(ctx, { primary: mainRoof, secondary: streetGable }));
  ctx.add(roofIntersection(ctx, { primary: mainRoof, secondary: porchGable }));

  /* ── 4. the street gable's face — roughcast, dark strapwork, a vent and a clay finial ── */

  const gableForm = streetGable.form;
  // Where `gablePanelInset` actually put the panel — derived from the inset rather than written
  // down beside it, because the r2 round moved the inset and a hard-coded face plane would have
  // left the strapwork, the vent and the shingle belt standing 0.28 behind their own wall.
  const gableFaceZ = g.gableFaceZ;
  const gableRise = gableForm.ridgeY - g.gableSpring;
  const gableSpan = gableForm.plan.w;                // eave to eave, overhang included

  // The strapwork field, solved against the panel KIT ACTUALLY EMITTED rather than against the
  // pitch. `gableRoof` builds the panel from `(±(hb − 0.02), springY)` to `(0, ridgeY − 0.06)`,
  // so its edge is shallower than `tan(pitch)`; a field laid out on the pitch runs its outer
  // verticals through the rake. `strapwork` tops each vertical at `h + strapWidth/2 − |u|·rake`,
  // which is why the half-width carries the `strapWidth/(2·rake)` term — with it the tallest
  // vertical lands ON the panel edge instead of 0.070 over it.
  const panelHalf = gableSpan / 2 - 0.02;
  const panelRake = (gableForm.ridgeY - 0.06 - g.gableSpring) / panelHalf;
  const strapHalf = panelHalf - DETAIL_MEMBERS.strapWidth / (2 * panelRake);

  // `braces: false`. Two reasons, and the second one is the smaller.
  //
  // 1. DETAIL's `strapwork` rakes its brace planks with `tilt: s · braceAng`, the same sign it
  //    uses on the rake plates, and both signs are inverted (see the report). A brace therefore
  //    runs from the apex end DOWN and OUTWARD instead of up and inward, and its outer end
  //    stands 0.359 clear of the roof surface behind it.
  // 2. The subject carries a bottom plate, two rake plates and six verticals in this gable and
  //    no apex brace at all — `like-bungalow-brighton-threequarter.png`, and the bar plate
  //    agrees. The brace is a villa cue.
  //
  // The two rake PLATES carry the same inversion and cannot be suppressed from here; they are
  // the two 2.429-clear members on the r2 plate and they are DETAIL's to fix.
  ctx.add(strapwork(ctx, {
    x: g.gableX,
    y: g.gableSpring,
    z: gableFaceZ,
    w: strapHalf * 2,
    h: strapHalf * panelRake - DETAIL_MEMBERS.strapWidth / 2,
    facing: 'front',
    bays: ctx.detail ? 7 : 5,
    braces: false,
  }));

  if (ctx.mid) {
    ctx.add(ventGrille(ctx, {
      x: g.gableX,
      y: g.gableSpring + gableRise * 0.55,
      z: gableFaceZ + 0.02,
      w: 0.46,
      h: 0.72,
      facing: 'front',
      louvres: 5,
    }));
  }

  // Terracotta, not the dark joinery default: the subject and the bar both carry a clay finial
  // on the clay roof.
  ctx.add(finial(ctx, {
    x: g.gableX,
    y: gableForm.ridgeY,
    z: e.frontZ + g.overhang - 0.13,
    height: 0.82,
    material: p.roof,
  }));

  /* ── 5. the porch gable's face — terracotta scallop courses, as the bar plate shows ──── */

  // Where `gablePanelInset` actually put the porch panel, taken off `plan()` so the two cannot
  // disagree. z 4.880 — 0.080 proud of the porch beam's own front face at 4.800, which is what
  // the bottom course and its belt stand on.
  const porchFaceZ = g.porchFaceZ;
  // ONE correction, not two. The width compensation that used to sit here has been removed
  // because the defect it worked around is fixed at source.
  //
  // `shingleCourses` used to trim each course to the gable triangle measured at the course's
  // CENTRE and then draw it `step·1.16` tall, so every course's top corners stood `0.58·step·rake`
  // outside the triangle it had been trimmed to — 0.073 of terracotta above the panel's own rake
  // edge here, and 0.1402 on an uncompensated caller. This file bought that back by pre-shrinking
  // the panel width by exactly the overshoot.
  //
  // `shingleCourses` now trims at each course's own TOP edge, so an uncompensated caller measures
  // +0.0024 — the board's thickness tipping through its lean, not the trim. Keeping the shrink on
  // top of the fix double-counted it and pulled the courses 0.127 INSIDE the panel edge on each
  // side, which is a visible bare margin rather than a safe one. Width is now the panel's own.
  //
  //   rake — still the panel's MEASURED edge slope rather than `tan(pitch)`. KIT drops the panel
  //          apex 0.06 below the ridge, so the real edge is shallower than the roof's own pitch,
  //          and a field trimmed to `tan(38°)` is trimmed to a triangle taller than the one it
  //          stands in. That correction is unrelated to the trim datum and stays.
  const porchPanelH = g.porchApex - g.porchSpring - 0.19;
  const porchPanelRake = (porchGable.form.ridgeY - 0.06 - g.porchSpring)
    / (porchGable.form.plan.w / 2);
  const porchPanelW = porchGable.form.plan.w;
  ctx.add(shingleCourses(ctx, {
    x: g.porchX,
    y: g.porchSpring + porchPanelH / 2,
    z: porchFaceZ,
    w: porchPanelW,
    h: porchPanelH,
    facing: 'front',
    style: 'shingle',
    // The rake's rise per unit run, which is what the arithmetic wants; the documented 2h/w
    // is only the same number for an untrimmed triangle. Taken off the emitted panel rather
    // than off the pitch, for the reason above.
    gableRake: porchPanelRake,
    // Clay, not the joinery default. These are roof tiles hung on a gable face, made of the
    // same material as the roof above them, and the bar plate paints them terracotta.
    material: p.roof,
    belt: true,
    index: 0,
  }));
  ctx.add(finial(ctx, {
    x: g.porchX,
    y: g.porchApex,
    z: g.porchRakeFrontZ - 0.11,
    height: 0.46,
    material: p.roof,
  }));

  /* ── 6. the porch: floor, beam, two heavy tapered piers, and the door ───────────────── */

  const porch = verandahFrame(ctx, {
    // Wall to wall: a floor narrower than the recess leaves a strip of lawn showing under the
    // porch roof at the flank.
    w: g.porchBayW,
    d: g.porchD,
    x: g.porchX,
    z: e.frontZ - g.porchD / 2,
    floorY: e.floorY,
    beamY: g.beamY,
    postStyle: 'none',
    posts: false,
    returns: true,
    // The porch gable's own ungated soffit slab at 3.11 IS this ceiling, and a second one at
    // `beamY + beamDepth − 0.09` would overlap it.
    ceiling: false,
  });
  ctx.add(porch);

  // Squat and heavy, against the Californian's tall open bank. The pedestals are clinker and
  // stand on the LOT at y = 0, so the porch floor abuts them rather than carrying them.
  const pierZ = e.frontZ - 0.28;
  const pierStand = g.beamY;                          // ground to the beam soffit
  const pierPedestal = pierStand * 0.41;              // DETAIL's measured 41 %
  // Pedestal cap 0.09 + pier cap 0.10 + the abacus `detail` adds on top of it, so the pier's
  // topmost member lands ON the beam soffit at every quality instead of inside the beam.
  const pierShaft = Math.max(0.4, pierStand - pierPedestal - (ctx.detail ? 0.25 : 0.19));
  for (const [i, s] of [-1, 1].entries()) {
    ctx.add(taperedPier(ctx, {
      x: g.porchX + s * (g.porchBayW / 2 - 0.44),
      z: pierZ,
      base: 0,
      height: pierShaft,
      pedestal: pierPedestal,
      baseWidth: 0.66,
      headWidth: 0.42,
      pedestalWidth: 0.80,
      index: i,
    }));
  }

  const doorOpening = porchBay.openings.find((o) => o.face === 'front');
  if (doorOpening) {
    ctx.add(frontDoor(ctx, {
      opening: doorOpening,
      fanlight: false,      // the hole is 2.30 tall and a fanlight would sit on the wall face
      panels: 4,
    }));
  }

  /* ── 7. the bay — the archetype's loudest cue after the roof ────────────────────────── */

  const bayW = clamp(g.gableW * 0.56, 2.6, 3.8);
  // 1.26, up from 1.20, and this is as tall as the bay can be. The ceiling is not taste: the
  // main hip's front eave crosses the whole frontage with its soffit at y 3.235 and its fascia
  // from 3.190, and `leadlightBay`'s cap tops out at `sill + h + 0.525`. 1.26 lands the cap at
  // 3.125 with 0.110 of daylight under the soffit; 1.31 closes that to 0.025 and 1.40 drives
  // the cap through the fascia. Head goes 2.540 → 2.600.
  const bayH = 1.26;
  // 0.52, down from 0.62, and this is as PROUD as the bay can be — see `YARD_CLEAR`. The bay's
  // deepest member is the brick plinth below, which has to finish inside z 5.420 or the hedge
  // grows through it, and on the r2 plate it did.
  const bayProj = Math.min(0.52, YARD_CLEAR - 0.10);
  // A bay stands on its own brick base. `leadlightBay`'s apron stops 0.32 above the lot, so
  // without this the whole component floats — §2 rule 2, and the cheapest possible fix. The
  // plinth follows the bay's own footprint (+0.06, +0.14) rather than oversailing it by 0.34,
  // which is what put its front face at z 5.700 against a hedge face at 5.420.
  const plinthD = Math.min(bayProj + 0.06, YARD_CLEAR - 0.02);
  const plinthCapD = Math.min(bayProj + 0.14, YARD_CLEAR + 0.01);
  ctx.push(
    slab(bayW + 0.30, e.floorY + 0.04, plinthD, g.gableX, 0,
      e.frontZ + plinthD / 2 - 0.06, 'bay-plinth'),
    p.wallAlt,
  );
  ctx.push(
    slab(bayW + 0.40, 0.10, plinthCapD, g.gableX, e.floorY + 0.04,
      e.frontZ + plinthCapD / 2 - 0.09, 'bay-plinth-cap'),
    p.trim,
  );
  ctx.add(leadlightBay(ctx, {
    x: g.gableX,
    y: g.bellcastY + bayH / 2,
    z: e.frontZ,
    w: bayW,
    h: bayH,
    projection: bayProj,
    frontF: 0.58,
    facing: 'front',
    carcass: true,
    // DETAIL's own two-slab cap, not the solved hip the first build gave it, and the swap is
    // measured on three counts.
    //
    // 1. The carcass and the cap are one design. `carcass` puts a 0.34 spandrel at
    //    `halfH + 0.30`, exactly where `roof:true` puts its eaves plate, and the upper slab
    //    covers its head. A separately solved hip at `sill + h + 0.20` left the spandrel
    //    standing 0.163 through its own roof.
    // 2. A hip over this footprint cannot be closed. Its half span is 0.640 against
    //    `tiledHalfSpanFloor(26°)` = 2.113, so 4 of its 36 covering triangles came out wound
    //    inside-out at every quality and the cap was see-through in strips.
    // 3. `roof:true` is the only path to the modillion blocks, and `detail-leadlight-bay-
    //    window.png` is mostly modillion blocks: a run of pale `trim` studs under a terracotta
    //    eave is the read that separates a bay from a hole in a wall at board altitude.
    roof: true,
    index: 0,
  }));

  /* ── 8. flank and rear joinery ──────────────────────────────────────────────────────── */

  let sashIndex = 0;
  for (const opening of [...front.openings, ...porchBay.openings, ...rear.openings]) {
    if (opening.face === 'front') continue;           // the door, placed above
    // The wide flank pair takes a casement bank with leadlight toplights; the narrow ones take
    // double-hung sashes. Both are period-correct here, and the mix stops the flanks reading
    // as one window stamped eight times.
    if (opening.w > 1.05) {
      ctx.add(casementBank(ctx, { opening, lights: 2, toplightF: 0.30, index: sashIndex }));
    } else {
      ctx.add(doubleHungSash(ctx, { opening, lights: 2, index: sashIndex }));
    }
    sashIndex += 1;
  }

  /* ── 9. the chimney — tall is the point, and it gives a compact house its vertical ───── */

  const chimW = 1.00;
  const chimD = 1.36;
  const chimX = e.bodyW / 2 + 0.12;                   // half in the wall, half proud of it
  const chimZ = g.mainZ + 0.60 + jitter(SALT.chimney, 0.30);
  // Authored rather than taken from KIT's default, which is generous on this envelope. The
  // brick head stands 0.55 over the ridge and the pot 1.36; the bar plate measures 0.34 and
  // 0.82, the subject rather more, and this archetype's brief calls the height an identity cue.
  const chimTop = e.ridgeY + 0.55;
  ctx.add(chimney(ctx, {
    x: chimX,
    z: chimZ,
    base: 0,
    w: chimW,
    d: chimD,
    top: chimTop,
    throughRoof: mainRoof,
  }));
  ctx.add(chimneyCap(ctx, {
    x: chimX,
    y: chimTop,
    z: chimZ,
    w: chimW,
    d: chimD,
    pots: 1,
    potHeight: 0.46,
    potRadius: 0.12,
    render: false,      // clinker corbel under a clay pot; the subject has no rendered capping
  }));

  /* ── 10. rainwater. Gutter on the eave, downpipe against the WALL, shoe on the ground ─── */

  const gutterProj = g.overhang + 0.09;
  ctx.add(gutterAndDownpipe(ctx, {
    x: e.bodyW / 2,
    y: g.springY,
    z: g.mainZ,
    run: g.mainD + g.overhang * 2,
    facing: 'right',
    projection: gutterProj,
    downpipes: 'end',
    index: 0,
  }));
  ctx.add(gutterAndDownpipe(ctx, {
    x: -e.bodyW / 2,
    y: g.springY,
    z: g.mainZ,
    run: g.mainD + g.overhang * 2,
    facing: 'left',
    projection: gutterProj,
    downpipes: 'start',
    index: 1,
  }));
  ctx.add(gutterAndDownpipe(ctx, {
    x: 0,
    y: g.springY,
    z: e.backZ,
    run: g.rearW + g.overhang * 2,
    facing: 'back',
    projection: gutterProj,
    downpipes: 'both',
    index: 2,
  }));

  /* ── 11. the rest of the lot ────────────────────────────────────────────────────────── */

  // One axis for the path, the gate, the boundary opening and the letterbox: the door's.
  ctx.add(path(ctx, { x: g.doorX, deckZ: e.frontZ, width: 1.06 }));
  ctx.add(boundary(ctx, { x: g.doorX }));       // brick wall + clipped hedge — the bayside cue
  ctx.add(gate(ctx, { x: g.doorX }));
  ctx.add(planting(ctx, { density: 1.7 }));     // the lane-wide density, so four lots read as one street
  ctx.add(streetTree(ctx));
  ctx.add(letterbox(ctx, { x: g.doorX }));
  ctx.add(services(ctx, { side: -1 }));         // off the chimney flank

  return ctx.parts;
}
