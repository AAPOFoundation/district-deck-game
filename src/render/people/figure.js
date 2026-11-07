// District Deck V3.32 — figure geometry.
//
// Lane A. Owns torso, pelvis, shoulder, neck and limb-segment geometry, the rest pose those
// segments hang in, and the ground contact decal the figure stands on. Head and hair are lane B
// (`head.js`); garments, footwear, headwear and handheld props are lane C (`wardrobe.js`).
//
// Vertical datum: every builder returns geometry centred on its own origin, and the rig
// (`rig.js`) places that origin. Nothing here knows where the ground is — except `buildRestPose`,
// which is the bind pose the rig deviates from and is therefore stated in figure-local metres
// measured up from the sole.
//
// r01 rebuild. What was here before was a box on two boxes: one torso block, one leg block with a
// shoe pad merged into it, one arm block with a hand nub merged into it, and a flat shoulder
// plate. It had no pelvis, no neck, no knee, no elbow and no ankle, so nothing above the rig
// could bend a joint that the geometry did not contain. The segment set below is the one named in
// the r01 shared brief §2, and every length is derived from `PROPORTIONS` rather than authored,
// so the six-head contract cannot drift out of this file.
//
// Salt namespace 100–199. Deterministic: no clock, no `Math.random`.

import * as THREE from 'three';
import {
  AUTHORED_STATURE, DEFAULT_BUILD, FIGURE_SCALE, PROPORTIONS, UP, domeRings, mergeParts,
  profileSolid, resolveBuild,
} from './core.js';

/**
 * One r01-authored metre, against **whatever anatomy this builder was handed**. The three trunk
 * ring stacks below carry hand-measured vertical offsets — 90 mm under the crotch, 200 mm over the
 * waist — beside altitudes read out of `p`, and lane C calls the same three functions with
 * `AUTHORED_PROPORTIONS`. Reading the stature off the argument rather than off the module is what
 * lets one table serve both, at the right size for each. g03.
 */
const r01 = (p) => p.height / AUTHORED_STATURE;
import { ARCHETYPE_BUILD, ARCHETYPE_STYLE, buildFor, styleFor } from './cast.js';

/** Ring counts. Torso masses carry the silhouette, so they get the segments; limbs read at 10. */
const TRUNK_SEGMENTS = 12;
const LIMB_SEGMENTS = 10;

/**
 * The cast's own ring counts, named so a reduced build states what it is reducing *from*.
 *
 * **Every builder below takes its radial count as an argument, and that is lane G's r06 change.**
 * The ambient street carries two hundred pedestrians against a per-figure ceiling of 1 300
 * triangles (§3) while the cast body measures 2 502, so an ambient figure cannot be the cast
 * figure and cannot be a second authored figure either — a fork drifts from the cast inside one
 * round and the whole point of the lane is that the two read as one species. It is the same ring
 * tables at a lower radial count, which is a *sampling* difference rather than a shape one: an
 * eight-sided thigh and a ten-sided thigh are the same thigh.
 *
 * Nothing about the cast moves. Every parameter defaults to the constant that was hard-coded
 * where it now sits, so `buildPelvisGeometry(PROPORTIONS)` returns the identical buffer it
 * returned before this was added.
 */
export const RING_COUNTS = Object.freeze({
  trunk: TRUNK_SEGMENTS,
  limb: LIMB_SEGMENTS,
  /** The dome that fills a knee, an elbow and a shoulder from the child side. */
  limbCapSteps: 2,
  hand: 8,
  handCapSteps: 2,
  foot: 8,
  /** The boot last is a wedge rather than a stack, so it carries its own count. */
  footLast: 10,
  contact: 18,
  /** P1C posed kit (`figures.js` createFigureGroup) — rounded LOD0. */
  kitHead: 6,
  kitLimb: 4,
  kitHair: 4,
  kitJoint: 3,
});

/**
 * Every slot this lane produces geometry for, in draw order back to front. `index.js` builds its
 * batch from this list and `rig.js` poses against these names; the r01 shared brief §2 is the
 * one place they are agreed.
 */
export const FIGURE_SLOTS = Object.freeze([
  'contact',
  'pelvis', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR',
  'torso', 'chest', 'upperArmL', 'upperArmR', 'forearmL', 'forearmR', 'handL', 'handR',
  'neck',
]);

/**
 * The quadruped slot set, shared brief §2. Named here so `index.js` and `rig.js` agree without
 * either of them holding the list.
 */
export const DOG_SLOTS = Object.freeze([
  'contact', 'dogBody', 'dogHead', 'dogLegFL', 'dogLegFR', 'dogLegRL', 'dogLegRR', 'dogTail',
  'dogNose', 'dogEyeL', 'dogEyeR',
]);

// ——— trunk ————————————————————————————————————————————————————————————————————————————
// Four widths, §2.1, all derived in `core.js` from `SPAN` and floored by `MASS_CONTRACT`:
// shoulder 1.600, chest 1.056, waist 0.840, hip 1.032. The chest overhangs the waist and the
// waist is narrower than the hip, so the outline has a passage at each of them rather than one
// tapering mass — `shoulderOverWaist` 1.90, `chestOverWaist` 1.26, `hipOverWaist` 1.23.

/**
 * The pelvis: hip mass from the crotch up to the waist, widest at the hip line. Carries the
 * thighs, and its own top tucks inside the torso so a bend at the waist never opens a seam.
 */
export function pelvisRings(p = PROPORTIONS) {
  const { y, width, depth } = p;
  const base = y.pelvisCentre;
  const k = r01(p);
  // r06 seat A: fuller seat and hip shelf so the trunk lands on a real pelvis rather than a
  // narrow hinge under a belly. Depth leads breadth — the waist above still has to stay the
  // narrowest outline passage.
  return [
    { y: y.crotch - 0.09 * k - base, w: width.hip * 0.90, d: depth.hip * 0.96 },
    { y: y.crotch + 0.06 * k - base, w: width.hip * 0.98, d: depth.hip * 1.04 },
    { y: y.hip - base, w: width.hip * 1.04, d: depth.hip * 1.08 },
    { y: y.waist - 0.06 * k - base, w: width.hip * 0.94, d: depth.hip * 1.00 },
    { y: y.waist + 0.10 * k - base, w: width.waist * 1.06, d: depth.waist * 1.08 },
  ];
}

export function buildPelvisGeometry(p = PROPORTIONS, { segments = TRUNK_SEGMENTS } = {}) {
  return profileSolid(pelvisRings(p), segments);
}

/**
 * The waist barrel: the narrowest passage of the outline, between the hip and the ribcage.
 *
 * **r04 adds the belly ring, and it is a depth, not a breadth.** §2.1 needs the waist to stay the
 * narrowest passage across, so the mass a trunk gains between the hip and the ribs has to go
 * front-to-back.
 *
 * **r07 seat A — soft section, not stripe barrel.** r06's single 1.38-depth ring still read as a
 * lathed drum of stacked facets on the hi-vis. Two depth-led belly rings hang over the belt the
 * way the Monopoly Plus builder's gut drapes: waist stays the narrowest *outline* passage
 * (breadth ≤ 1.00× at the cinch); the mass is front-to-back so cloth can bend over it.
 */
export function torsoRings(p = PROPORTIONS) {
  const { y, width, depth } = p;
  const base = y.torsoCentre;
  const k = r01(p);
  return [
    // Seat of the gut — just above the hip / belt line so hi-vis drapes over the overhang.
    { y: y.hip - 0.01 * k - base, w: width.waist * 1.10, d: depth.waist * 1.34 },
    // Soft belly peak: depth-led (not a wider stripe) — Monopoly gut language.
    { y: y.hip + 0.07 * k - base, w: width.waist * 1.14, d: depth.waist * 1.68 },
    // Still soft above the peak, easing into the cinch (not a hard ledge).
    { y: y.hip + 0.15 * k - base, w: width.waist * 1.08, d: depth.waist * 1.48 },
    { y: y.waist - 0.05 * k - base, w: width.waist * 1.02, d: depth.waist * 1.12 },
    // Narrowest outline passage — the belt sits under the belly, not mid-barrel.
    { y: y.waist - base, w: width.waist, d: depth.waist },
    // Gentle rise into the ribs; keep breadth quiet so the cinch survives.
    { y: y.waist + 0.10 * k - base, w: width.waist * 1.04, d: depth.waist * 1.10 },
  ];
}

export function buildTorsoGeometry(p = PROPORTIONS, { segments = TRUNK_SEGMENTS } = {}) {
  return profileSolid(torsoRings(p), segments);
}

/**
 * The ribcage and the deltoid seat. The top ring rounds back in toward the neck so the trapezius
 * slopes rather than ending in a plate — the flat shoulder bar it replaces is what made the old
 * figure read as a box with a domino on it.
 *
 * The upper arms sit at the outside of the widest ring, so the pair of them and this mass make
 * the shoulder span between them. That is why `SEGMENT.armOffsetX` is derived from
 * `WIDTH.shoulder` and the arm diameter rather than authored.
 */
export function chestRings(p = PROPORTIONS) {
  const { y, width, depth } = p;
  const base = y.chestCentre;
  // **r04: the deltoid ring is now wider than the chest.** It was `shoulder − upperArm.top`,
  // which on the pre-r04 numbers came out at 1.103 against a chest of 1.109 — the trunk therefore
  // reached the shoulder line at its own chest width and the arms made the whole of the span, so
  // there was a notch of daylight between the ribcage and each upper arm and the shoulder read as
  // two balls stuck on a barrel. Burying only half the arm's diameter puts a real deltoid shelf
  // between them and the shoulder becomes one mass. It costs no triangle: the ring already exists.
  // r07/r08: bury more of the (thinner) diameter — shoulder joint inside shoulder mass.
  // Shelf stays wider than the chest ring below it; r08 steps bury further as the arm thins.
  const deltoid = width.shoulder - p.segment.upperArm.top * 0.58;
  const k = r01(p);
  return [
    { y: y.waist - base, w: width.waist * 1.03, d: depth.waist * 1.08 },
    // **This ring is mirrored by `wardrobe.js` `trunkAt`.** Lane C reads the same stop from the
    // ring table (via import) so it moves when this moves — no parallel factor to keep in sync.
    // Depth-led ribcage: chest overhangs the waist the way a gut/chest loads a belt, not a plank.
    { y: y.waist + 0.18 * k - base, w: width.chest * 0.94, d: depth.chest * 1.14 },
    { y: y.chest - base, w: width.chest * 1.02, d: depth.chest * 1.18 },
    { y: y.shoulderJoint - base, w: deltoid, d: depth.chest * 1.02 },
    { y: y.shoulder - base, w: deltoid * 0.88, d: depth.chest * 0.84 },
    { y: y.neckBase - base, w: width.neck * 2.5, d: depth.neck * 1.75 },
  ];
}

export function buildChestGeometry(p = PROPORTIONS, { segments = TRUNK_SEGMENTS } = {}) {
  return profileSolid(chestRings(p), segments);
}

/**
 * **The waist barrel and the ribcage as one swept solid, for a build that cannot afford two
 * draws.** Authored about `y.chestCentre`, so a batch poses it at the `chest` slot and drops
 * `torso` from its slot set entirely.
 *
 * It is the two ring tables above concatenated, not a third table: every ring comes from
 * `torsoRings` or `chestRings` and moves when they move, so the reduced trunk cannot drift into
 * a different body from the cast's. The torso rings at and above the waist are the two the chest
 * table restates — the chest's own bottom ring runs `waist × 1.02` against the torso's `waist ×
 * 1.00` at the same altitude — so they are dropped rather than duplicated and the outline is
 * unchanged.
 *
 * **What it costs, and it is not nothing.** `rig.js` solves `torso` and `chest` with separate
 * quaternions, so the waist articulation between them is lost: the whole upper trunk turns with
 * the shoulders. The pelvis keeps its own slot, so the counter-rotation §2.7 grades — shoulders
 * against hips — survives, and it is the one that reads. At the ambient station a trunk is about
 * fifteen pixels wide and the torso-to-chest differential is under one of them.
 */
export function buildTrunkGeometry(p = PROPORTIONS, { segments = TRUNK_SEGMENTS } = {}) {
  const { y } = p;
  const rebase = (rings, from) => rings.map((ring) => ({
    ...ring, y: ring.y + from - y.chestCentre,
  }));
  const belly = rebase(torsoRings(p), y.torsoCentre)
    .filter((ring) => ring.y + y.chestCentre < y.waist - 1e-9);
  return profileSolid([...belly, ...rebase(chestRings(p), y.chestCentre)], segments);
}

/**
 * A real neck: short and thick in the stylised register, flaring into the trapezius at the
 * bottom, and long enough that ambient occlusion has a junction to darken. Both ends are buried,
 * the bottom inside the chest and the top inside the jaw, so a head turn never opens a gap.
 */
export function neckRings(p = PROPORTIONS) {
  const { neck } = p.segment;
  const half = p.natural.neck * 0.5;
  // Unit diameter, natural length: the neck is a span like a limb, so it takes the span
  // convention and a solver can stretch it between the chest and the skull.
  const deep = neck.depth / neck.width;
  return [
    { y: -half, w: 1.55, d: 1.45 * deep },
    { y: -half + p.natural.neck * 0.30, w: 1.06, d: 1.06 * deep },
    { y: half - p.natural.neck * 0.24, w: 1.0, d: deep },
    { y: half, w: 0.96, d: 0.98 * deep },
  ];
}

export function buildNeckGeometry(p = PROPORTIONS, { segments = TRUNK_SEGMENTS } = {}) {
  return profileSolid(neckRings(p), segments);
}

// ——— limbs ————————————————————————————————————————————————————————————————————————————
// Each segment is authored at unit diameter between its joints, origin at the midpoint, +Y toward
// the parent joint, and closed with a dome at each end.
//
// **The two ends do not get the same dome, and that is the r02 change.** `core.js`'s
// `capsuleSolid` takes one `capRise` as a fraction of segment length and derives the other end
// from the taper, which put a hemisphere below every lower joint: the shin's bottom cap rose
// 0.20 × 0.80 m × (0.175 / 0.27) ≈ **105 mm below the ankle**, in trouser colour, at a diameter
// (0.200 m) wider than the boot it was inside (0.174 m at that height). The wardrobe seat found
// it as a boot that had been swallowed and it was misdiagnosed as a wardrobe fault for a round.
// The forearm's was worse in kind — 74 mm past the wrist, which is where the "second sleeve end,
// lower down, reading as a bracelet" on all five hero plates came from.
//
// The dome is only load-bearing at the *upper* joint of each segment, where it fills the knee,
// the elbow and the shoulder from the child side while the parent's flat end sits inside it. So
// the top keeps its ball and the bottom gets a chamfer, authored here rather than in core so no
// other lane's geometry moves.

/**
 * A limb segment: a tapered shaft between two joints, domed at the top and chamfered at the
 * bottom. Both rises are fractions of `length`, for the reason `core.js` states — the instance
 * scale is (thickness, length / natural, thickness), so a rise expressed in radii is stretched by
 * the length.
 */
function limbSolid({
  length, top, bottom, riseTop, riseBottom, radialSegments = LIMB_SEGMENTS,
  capSteps = RING_COUNTS.limbCapSteps,
}) {
  const half = length * 0.5;
  const steps = Math.max(1, Math.round(capSteps));
  const rings = [
    ...domeRings(-half, bottom, bottom, riseBottom * length, -1, steps),
    { y: -half, w: bottom, d: bottom },
    { y: half, w: top, d: top },
    ...domeRings(half, top, top, riseTop * length, 1, steps),
  ];
  return profileSolid(rings, radialSegments, { capBottom: false, capTop: false });
}

/**
 * The shared leg segment. One geometry, four instances a figure — thigh and shin differ by the
 * instance scale the rest pose hands them, so a knee and an ankle cost no draw.
 *
 * `riseBottom` 0.042 puts the shin's lower close 34 mm below the ankle instead of 105, which is
 * inside the boot at every height the boot is wider than the shin. The knee is still a ball,
 * because the shin's *top* dome rises 0.115 × 0.80 = 92 mm into the thigh above it.
 */
export function buildLimbSegmentGeometry(p = PROPORTIONS, {
  segments = LIMB_SEGMENTS, capSteps = RING_COUNTS.limbCapSteps,
} = {}) {
  /**
   * **r2: a belly in the upper third, and it is one ring spent only where a ring is affordable.**
   *
   * The r1 critic read the shin off `walk--architect.png` as "a uniform-diameter stick with no
   * calf belly", and a straight taper from knee to ankle is exactly that. The swell sits at 28 %
   * up from the lower joint, which is where a gastrocnemius sits on a shin — and, because thigh
   * and shin are one mesh at two instance scales, where a vastus sits on a thigh. One profile
   * serves both because both are fullest just below their upper joint.
   *
   * A ring costs `segments × 2` triangles on every instance, and there are four of them a figure.
   * At the cast's 10 rings that is 80 triangles against 4 390 of headroom; at the crowd's 8 it is
   * 64 against a budget this round has to *reclaim* into. So the belly is spent above the cast's
   * own ring count and the street and the ring keep the straight taper, which is the reclaim-
   * before-you-spend rule read the only way it can be read when three tiers share one builder.
   */
  const belly = segments >= 10 ? 1.055 : 1;
  if (belly === 1) {
    return limbSolid({
      length: p.natural.leg, top: 1, bottom: p.limb.legTaper, riseTop: 0.115, riseBottom: 0.042,
      radialSegments: segments, capSteps,
    });
  }
  const length = p.natural.leg;
  const half = length * 0.5;
  const top = 1;
  const bottom = p.limb.legTaper;
  const steps = Math.max(1, Math.round(capSteps));
  // 0.28 up from the lower joint, at the taper's own diameter there, swollen by `belly`.
  const bellyY = -half + length * 0.28;
  const bellyW = (bottom + (top - bottom) * 0.28) * belly;
  const rings = [
    ...domeRings(-half, bottom, bottom, 0.042 * length, -1, steps),
    { y: -half, w: bottom, d: bottom },
    { y: bellyY, w: bellyW, d: bellyW },
    { y: half, w: top, d: top },
    ...domeRings(half, top, top, 0.115 * length, 1, steps),
  ];
  return profileSolid(rings, segments, { capBottom: false, capTop: false });
}

/**
 * The sleeve segment: fuller at the shoulder, tapering to the elbow.
 *
 * **The taper is a contract now, not a preference.** It ran at 0.81 against a forearm at 0.70,
 * and with the pre-r04 diameters the forearm's elbow (0.240) came out *wider* than the upper
 * arm's (0.230). Three separate blind critics wrote down some version of "torso, upper arm and
 * forearm all roughly the same diameter", and that pair of numbers is what they were reading.
 * `MASS_CONTRACT.upperArmOverForearm` now floors the mid-segment ratio at 1.50.
 *
 * **r07 seat A — no sleeve balloon.** r06's high shoulder dome (`riseTop` 0.150) plus a fat
 * constant-section shaft read as inflated pads beside the torso. Lower dome + a mid-shaft ring
 * so the deltoid swells then soft-tapers into the elbow (same `limbSolid` family, one extra ring).
 *
 * **r08 seat A — residual short-sleeve cuff pad.** r07 left a boxy cuff mass at the lower
 * shaft. Monotone taper into the elbow (no mid-lower barrel) and a lower deltoid dome so the
 * joint sits inside the shoulder shelf; short-sleeve shell is sized off `upperArm.bottom` in
 * wardrobe, so the elbow step is what shrinks the cuff without a new draw family.
 */
export function buildUpperArmGeometry(p = PROPORTIONS, {
  segments = LIMB_SEGMENTS, capSteps = RING_COUNTS.limbCapSteps,
} = {}) {
  const length = p.natural.upperArm;
  const half = length * 0.5;
  const top = 1;
  const bottom = p.limb.armTaper;
  // Soft deltoid swell then a real taper into the elbow — not a constant-diameter tube with a
  // ball on top (that was the r06 balloon). Lower third stays ≤ elbow so the short cuff cannot
  // wrap a mid-shaft barrel.
  const steps = Math.max(1, Math.round(capSteps));
  const riseTop = 0.062 * length;
  const riseBottom = 0.042 * length;
  const rings = [
    ...domeRings(-half, bottom, bottom, riseBottom, -1, steps),
    { y: -half, w: bottom, d: bottom },
    { y: -half * 0.28, w: bottom * 1.04, d: bottom * 1.04 },
    { y: half * 0.18, w: top * 0.88, d: top * 0.88 },
    { y: half, w: top, d: top },
    ...domeRings(half, top, top, riseTop, 1, steps),
  ];
  return profileSolid(rings, segments, { capBottom: false, capTop: false });
}

/**
 * The forearm, **with the hand on the end of it**: skin from the sleeve hem to the knuckles.
 *
 * The hand was its own family until r02 and it bought nothing, because `rig.js` already poses the
 * hand with `arm.foreQ` — the forearm's own quaternion — so the wrist has never articulated in
 * this kit. One family for two rigidly-related masses is the reclaim that pays for the fifth
 * quadruped draw, and it costs no triangles and no articulation that existed.
 *
 * `handL` / `handR` stay in the pose. They are not drawn any more, but `wardrobe.js` hangs a
 * briefcase, a clipboard, a jerry can and a tote off them, and `index.js` resolves an anchor from
 * the pose rather than from the batch.
 */
export function buildForearmGeometry(p = PROPORTIONS, {
  segments = LIMB_SEGMENTS, capSteps = RING_COUNTS.limbCapSteps,
  handSegments = RING_COUNTS.hand, handCapSteps = RING_COUNTS.handCapSteps,
} = {}) {
  const arm = limbSolid({
    length: p.natural.forearm, top: 1, bottom: p.limb.foreTaper, riseTop: 0.145, riseBottom: 0.048,
    radialSegments: segments, capSteps,
  });
  return mergeTwo(
    arm,
    buildHandGeometry(p, { merged: true, segments: handSegments, capSteps: handCapSteps }),
  );
}

/**
 * A closed hand mass, origin at the wrist, hanging down −Y. Not a cube: the palm is deeper than
 * it is thick and it rounds off at the knuckles, which is the whole of what reads at board
 * altitude.
 *
 * **r08 seat A — thumb break.** Palm stays the same `profileSolid` family; a second short solid
 * is merged on (same as foot upper+last) so the distal outline is no longer a closed mitt.
 * One silhouette-readable plane is enough; no new draw family — still rides the forearm mesh.
 */
export function buildHandGeometry(p = PROPORTIONS, {
  merged = false, segments = RING_COUNTS.hand, capSteps = RING_COUNTS.handCapSteps,
} = {}) {
  const { hand, forearm } = p.segment;
  // Merged into the forearm the hand rides that segment's instance scale — x and z by the
  // forearm's own diameter, y by `length / natural`, which is 1 for a rigid bone. Dividing the
  // authored width and depth through by that diameter is what keeps a hand a hand when it is
  // drawn by a family that was sized for a wrist.
  const kx = merged ? 1 / forearm.top : 1;
  const wrist = merged ? -p.natural.forearm * 0.5 : 0;
  // r06 seat A: a closed fist, not a tapered nub. Palm is deeper than it is thick and the
  // knuckle mass sits proud of the wrist so the arm becomes a hand at board altitude rather
  // than ending in a pale sausage.
  const rings = [
    ...domeRings(
      wrist - hand.length, hand.width * 0.92 * kx, hand.depth * 0.90 * kx, hand.depth * 0.55, -1,
      Math.max(1, Math.round(capSteps)),
    ),
    { y: wrist - hand.length, w: hand.width * 0.92 * kx, d: hand.depth * 0.90 * kx },
    { y: wrist - hand.length * 0.55, w: hand.width * 1.08 * kx, d: hand.depth * 1.14 * kx },
    // The knuckle-taper ring. It is what makes the back of the fist fall away toward the wrist
    // instead of meeting it in one cone, and at the cast's station it reads. At six radial
    // segments it costs 12 triangles a hand and two hands ride every figure, and the crowd and the
    // street are the two tiers that owe triangles this round. Same reclaim, same reasoning, same
    // count boundary as the thumb below.
    ...(segments <= 6 ? [] : [
      { y: wrist - hand.length * 0.22, w: hand.width * 1.00 * kx, d: hand.depth * 1.06 * kx },
    ]),
    { y: wrist, w: hand.width * 0.78 * kx, d: hand.depth * 0.88 * kx },
  ];
  const palm = profileSolid(rings, segments, { capBottom: false, capTop: !merged });
  /**
   * **r2 reclaim: the thumb is a cast affordance and the street does not pay for it.**
   *
   * It is a three-ring solid with both caps closed — 32 triangles at six radial segments, and the
   * hand is merged into the forearm, so it lands twice on every figure. At the cast's station it
   * is doing exactly what r08 spent it on: one readable break so the distal outline is not a
   * closed mitt. At the crowd's and the street's it is under a pixel, and those two are the tiers
   * that have to *reclaim* triangles this round rather than spend them. §7 rule 5, and the counts
   * are the same counts the tiers already carry: cast `hand` is 8, crowd and street are 6.
   */
  if (segments <= 6) return palm;
  // Thumb: elongated shaft past the radial edge (+X) and proud in +Z — a silhouette plane, not
  // a second knuckle ball. Shared L/R geometry; one readable break is the r08 closer.
  const tw = hand.width * 0.32 * kx;
  const td = hand.depth * 0.36 * kx;
  const baseY = wrist - hand.length * 0.10;
  const tipY = wrist - hand.length * 0.62;
  // Palm half-width ≈ 0.54 × hand.width × kx; tip must clear it by a full thumb radius.
  const ox = hand.width * 1.05 * kx;
  const oz = hand.depth * 0.95 * kx;
  const thumbSeg = Math.max(5, Math.min(segments, 6));
  const thumb = profileSolid([
    { y: baseY, w: tw * 1.10, d: td * 1.00, x: ox * 0.38, z: oz * 0.28 },
    { y: baseY - (baseY - tipY) * 0.40, w: tw, d: td, x: ox * 0.78, z: oz * 0.72 },
    { y: tipY, w: tw * 0.52, d: td * 0.48, x: ox * 1.12, z: oz * 1.18 },
  ], thumbSeg, { capBottom: true, capTop: true });
  return mergeTwo(palm, thumb);
}

/**
 * The foot, origin at the ankle joint and sole flush at −`foot.height`, so the rig places the
 * ankle and §2.2's "sole of the loaded foot is at ground level" is a placement rather than a
 * fudge. Clearly longer than it is wide — §2.1 names that as the token test, and the old shoe pad
 * was 2.05 × 2.2 leg-radii, which is wider than it is long.
 */
export function buildFootGeometry(p = PROPORTIONS, {
  segments = RING_COUNTS.foot, lastSegments = RING_COUNTS.footLast,
} = {}) {
  const { foot } = p.segment;
  const heel = -foot.heel;
  const toe = foot.length - foot.heel;
  const sole = -foot.height;
  // r06 seat A: ankle collar + last that read as a boot. The upper is a short shaft around the
  // ankle; the last is the long wedge that carries the sole, the toe box and the heel counter.
  // A single tall stack was reading as a dark rectangular block under the shin.
  const upper = profileSolid([
    { y: sole + foot.height * 0.18, w: foot.width * 0.82, d: foot.length * 0.30 },
    { y: sole + foot.height * 0.55, w: foot.width * 0.92, d: foot.length * 0.36 },
    { y: 0, w: foot.width * 0.78, d: foot.length * 0.28 },
    { y: foot.height * 0.30, w: foot.width * 0.64, d: foot.length * 0.24 },
  ], segments);
  // Sole wider and longer than the shaft; toe box raised and rounded; heel sits aft of the ankle.
  const last = profileSolid([
    { y: sole, w: foot.width * 0.96, d: foot.length * 1.02 },
    { y: sole + foot.height * 0.28, w: foot.width * 1.00, d: foot.length * 1.00 },
    { y: sole + foot.height * 0.52, w: foot.width * 0.90, d: foot.length * 0.88 },
    { y: sole + foot.height * 0.78, w: foot.width * 0.72, d: foot.length * 0.62 },
  ], lastSegments);
  last.translate(0, 0, (toe + heel) * 0.5 + foot.length * 0.04);
  const merged = mergeTwo(upper, last);
  return merged;
}

/** Two geometries into one buffer. Local to this lane; `mergeParts` is core's and disposes. */
function mergeTwo(a, b) {
  const positionA = a.getAttribute('position');
  const positionB = b.getAttribute('position');
  const uvA = a.getAttribute('uv');
  const uvB = b.getAttribute('uv');
  const indexA = a.getIndex();
  const indexB = b.getIndex();
  const position = new Float32Array(positionA.count * 3 + positionB.count * 3);
  position.set(positionA.array, 0);
  position.set(positionB.array, positionA.count * 3);
  const uv = new Float32Array(uvA.count * 2 + uvB.count * 2);
  uv.set(uvA.array, 0);
  uv.set(uvB.array, uvA.count * 2);
  const index = [];
  for (let i = 0; i < indexA.count; i += 1) index.push(indexA.getX(i));
  for (let i = 0; i < indexB.count; i += 1) index.push(indexB.getX(i) + positionA.count);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  a.dispose();
  b.dispose();
  return geometry;
}

/**
 * The soft warm contact puddle that seats the figure on the ground. Pre-rotated flat, so the
 * rig composes it with an identity quaternion.
 */
export function buildContactGeometry(p = PROPORTIONS, { segments = RING_COUNTS.contact } = {}) {
  const geometry = new THREE.CircleGeometry(p.contactR, segments);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

// ——— the dog ——————————————————————————————————————————————————————————————————————————
//
// Purpose-built quadruped geometry, authored in **world metres about each part's own origin**,
// facing +Z. There was none before: `quadrupedRestPose` laid the human trunk on its side and read
// a muzzle out of the human skull, which is the "beige tardigrade with a pink slab for a head and
// a cream beak" the r01 critic could not grade. The reference plate `mp-dog.png` is the target —
// a barrel ribcage deeper than the loin, a real muzzle, ears, four legs with a hock, and a tail.
//
// The whole animal sweeps along its own axis. `profileSolid` sweeps along +Y, so a body and a
// muzzle are authored standing up and then rotated a quarter turn about X, which maps +Y → +Z and
// the ring's `z` offset → −Y. Ring `z` in those two builders is therefore **negative height**, and
// `-DOG.<height>` is what the tables below read.

/**
 * How far every authored dog metre below is carried, and why the animal moves with the people.
 *
 * The whole quadruped is written in world metres rather than in fractions of anything, and it was
 * written against the r01 3.72 m human — a 0.657 m withers beside him, which is 0.177 of the
 * person walking it and reads as the stocky terrier `mp-dog.png` shows. Held at 0.657 against a
 * 1.84 m owner it becomes 0.357 of him: a Great Dane on a lead. Carried on the same factor it
 * lands at 0.325 m, which is a real Jack Russell and the same 0.177 the r02 seat graded. The
 * table is the animal's *shape*; this is its size. g03.
 */
const DOG_SCALE = FIGURE_SCALE;

/**
 * The dog's datums in world metres, at the archetype's own build.
 *
 * Exported because the gait lane needs the same numbers to solve a trot against them, and a
 * second copy of a joint altitude in another file is how the r01 rig and the r01 geometry ended
 * up on two different conventions. Every length is stated as the r02 seat measured it and taken
 * through `DOG_SCALE` in one place at the bottom, so the numbers still read against that round's
 * report and no consumer can pick up an unscaled one.
 */
const DOG_AUTHORED = Object.freeze({
  /** Top of the shoulder above the ground. */
  withers: 0.657,
  /** Body sweep, rump aft to the base of the skull. */
  rear: -0.330,
  front: 0.412,
  /** Where the legs hang from, and how far apart. */
  shoulderZ: 0.175,
  hipZ: -0.215,
  legFrontX: 0.085,
  legRearX: 0.092,
  /**
   * Joint-to-joint on one leg. The natural length a solver stretches against.
   *
   * 0.36 against a 0.657 withers is 55 per cent of the animal in leg, and the first r02 dog ran
   * 61 per cent — enough to read as a whippet on the hero plate against a reference that is a
   * stocky terrier. The height came out of the leg and went into the ribcage.
   */
  legNatural: 0.360,
  legTop: 0.360,
  /** Head origin: the middle of the skull, carried up and forward of the withers. */
  headY: 0.788,
  headZ: 0.418,
  /**
   * The head is authored at the terrier's own scale and then taken up by this. A dog's head is a
   * bigger fraction of the animal than a person's is of a person, and the first r02 pass read as
   * a whippet partly because the skull was authored at the human kit's restraint.
   */
  headScale: 1.16,
  headPitch: -0.06,
  tailRootY: 0.618,
  tailRootZ: -0.330,
  tailNatural: 0.240,
});

/** `headScale` is a multiplier and `headPitch` is radians; neither is a length. */
const DOG_RATIOS = new Set(['headScale', 'headPitch']);
export const DOG_METRICS = Object.freeze(Object.fromEntries(
  Object.entries(DOG_AUTHORED).map(([key, value]) => [
    key, DOG_RATIOS.has(key) ? value : value * DOG_SCALE,
  ]),
));

/** Turn a standing profile into one that runs along +Z. */
function alongZ(geometry) {
  geometry.rotateX(Math.PI * 0.5);
  return geometry;
}

/**
 * Carry a quadruped mesh authored in r01 metres onto the board's scale. `buildDogDarkGeometry` is
 * the one builder that does NOT take it: that blob is authored at unit diameter and sized by the
 * bind pose, so scaling it here and there would square the factor.
 */
function dogScaled(geometry) {
  geometry.scale(DOG_SCALE, DOG_SCALE, DOG_SCALE);
  return geometry;
}

/**
 * The dog's trunk: neck, withers, ribcage, loin and haunch as one swept solid.
 *
 * §2.1's four-passage test applies to a quadruped as much as to a person, so the chest is
 * genuinely deeper than the loin (335 mm against 235) and the haunch is genuinely wider than the
 * waist above the stifle. Origin at the world origin of the standing dog, so the bind pose places
 * it with a plain translation and the rig can pitch and roll it about the shoulder line.
 */
export function buildDogBodyGeometry() {
  //  sweep(z)  width   depth(vertical)   centre height
  const rings = [
    { y: -0.330, w: 0.200, d: 0.230, h: 0.520 },   // rump
    { y: -0.265, w: 0.300, d: 0.330, h: 0.500 },   // haunch, the widest passage aft
    { y: -0.145, w: 0.230, d: 0.290, h: 0.498 },   // loin, the narrowest
    { y: -0.015, w: 0.255, d: 0.320, h: 0.490 },
    { y: 0.120, w: 0.292, d: 0.378, h: 0.476 },    // ribcage: the deepest passage
    { y: 0.225, w: 0.272, d: 0.350, h: 0.480 },
    { y: 0.295, w: 0.230, d: 0.290, h: 0.512 },    // withers
    { y: 0.336, w: 0.200, d: 0.262, h: 0.572 },    // the neck leaves the shoulder
    { y: 0.376, w: 0.178, d: 0.232, h: 0.644 },
    { y: 0.412, w: 0.166, d: 0.208, h: 0.712 },    // buried inside the skull
  ];
  // Authored at the r01 animal's own metres and taken to the board's scale in one place, the
  // same way `DOG_METRICS` is. g03.
  return dogScaled(alongZ(profileSolid(
    rings.map(({ y, w, d, h }) => ({ y, w, d, z: -h })), 10,
  )));
}

/**
 * The dog's head: skull, muzzle and two pricked ears, merged. Origin at the middle of the skull,
 * +Z forward, so a head that leads the trot turns about its own centre.
 */
export function buildDogHeadGeometry() {
  const parts = [];
  // Skull — a rounded wedge, wider at the cheek than at the crown, with a jaw under it so the
  // muzzle leaves a face rather than a flat disc.
  parts.push(profileSolid([
    { y: -0.095, w: 0.100, d: 0.125, z: 0.020 },
    { y: -0.040, w: 0.156, d: 0.180, z: 0.000 },
    { y: 0.030, w: 0.172, d: 0.182, z: -0.014 },
    { y: 0.086, w: 0.126, d: 0.132, z: -0.032 },
  ], 8));
  // Muzzle — a tapered box running forward and a shade down from the stop, tip squared off. This
  // is the single part that decides whether a critic can name the animal.
  const muzzle = alongZ(profileSolid([
    { y: 0.008, w: 0.124, d: 0.132, z: 0.000 },
    { y: 0.086, w: 0.108, d: 0.108, z: 0.010 },
    { y: 0.158, w: 0.094, d: 0.090, z: 0.017 },
  ], 6));
  muzzle.translate(0, -0.030, 0.032);
  parts.push(muzzle);
  // Ears — thin pricked triangles, set at the back corners of the skull and canted outward.
  for (const side of [-1, 1]) {
    const ear = profileSolid([
      { y: 0.000, w: 0.078, d: 0.074, z: 0.000 },
      { y: 0.042, w: 0.062, d: 0.052, z: -0.008 },
      { y: 0.088, w: 0.022, d: 0.020, z: -0.018 },
    ], 4);
    ear.rotateZ(side * -0.24);
    ear.translate(side * 0.066, 0.052, -0.056);
    parts.push(ear);
  }
  return dogScaled(mergeParts(parts, new THREE.SphereGeometry(0.09, 8, 6)));
}

/**
 * One dog leg, shared by all four. Authored in the limb convention — origin at the midpoint,
 * `DOG.legNatural` long, +Y toward the body — so a solver poses it with `boneAt` unchanged.
 *
 * The hock is in the geometry rather than in a second segment: one extra ring offset 30 mm aft at
 * 40 per cent height gives the rear legs their angle for four instances and no second slot pair.
 * The bind pose turns the front pair a half turn about Y so the same bend reads as an elbow.
 */
export function buildDogLegGeometry() {
  return dogScaled(profileSolid([
    { y: -0.180, w: 0.090, d: 0.122, z: 0.014 },   // paw, longer than it is wide
    { y: -0.152, w: 0.082, d: 0.100, z: 0.010 },   // pastern
    { y: -0.092, w: 0.066, d: 0.074, z: -0.006 },  // cannon
    { y: -0.014, w: 0.084, d: 0.104, z: -0.018 },  // hock, set aft
    { y: 0.090, w: 0.108, d: 0.146, z: -0.004 },
    { y: 0.180, w: 0.124, d: 0.180, z: 0.010 },    // buried in the trunk
  ], 6));
}

/** The tail: a tapered cone authored along +Y from its root, `DOG.tailNatural` long. */
export function buildDogTailGeometry() {
  return dogScaled(profileSolid([
    { y: 0.000, w: 0.082, d: 0.082, z: 0 },
    { y: 0.088, w: 0.068, d: 0.070, z: 0.006 },
    { y: 0.170, w: 0.050, d: 0.054, z: 0.014 },
    { y: 0.240, w: 0.026, d: 0.028, z: 0.024 },
  ], 6));
}

/**
 * The dark features the dog carries: one nose and two eyes, three instances of one rounded blob
 * in the dark-feature material.
 *
 * A single geometry at three scales rather than three geometries, because §3 asks for a segment
 * on a family before a family, and because a nose and an eye on a stylised dog are the same
 * organ — a wet dark bulb. It is authored at unit diameter so the bind pose states each size.
 */
export function buildDogDarkGeometry() {
  return profileSolid([
    { y: -0.50, w: 0.62, d: 0.62, z: 0 },
    { y: -0.16, w: 1.00, d: 1.00, z: 0 },
    { y: 0.24, w: 0.92, d: 0.92, z: 0 },
    { y: 0.50, w: 0.52, d: 0.52, z: 0 },
  ], 6);
}

// ——— the rest pose ————————————————————————————————————————————————————————————————————

const slot = (position, quaternion, scale) => ({ position, quaternion, scale });

/**
 * Aim a segment authored along +Y from `origin` toward `direction`, and report where it lands.
 * `direction` points from the parent joint toward the child joint, so a hanging limb points −Y.
 */
function segment(origin, direction, length, thickness, natural) {
  const dir = direction.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().negate());
  const position = origin.clone().addScaledVector(dir, length * 0.5);
  const end = origin.clone().addScaledVector(dir, length);
  return {
    // The span convention: X and Z carry the diameter, Y carries `world / natural`.
    transform: slot(position, quaternion, new THREE.Vector3(thickness, length / natural, thickness)),
    end,
  };
}

/** Unit direction from a splay about Z (outward) and a pitch about X (forward), hanging down. */
function hang(splay, pitch, side) {
  return new THREE.Vector3(
    Math.sin(splay) * side,
    -Math.cos(splay) * Math.cos(pitch),
    Math.sin(pitch),
  ).normalize();
}

const ONE = () => new THREE.Vector3(1, 1, 1);
const NONE = () => new THREE.Quaternion();

/**
 * Trunk masses take girth in x and z and nothing in y: a heavier figure is not a taller one, and
 * the six-head lock is not this dimension's to spend.
 */
const trunkScale = (m) => new THREE.Vector3(m.trunk, 1, m.trunk);
/**
 * The ribcage takes a blend of girth and shoulder span, because its top ring IS the deltoid shelf
 * and its bottom ring is the waist. Scaling it by girth alone leaves the shoulder line behind
 * when a build widens; scaling it by span alone inflates a lean archetype's ribs.
 */
const chestScale = (m) => {
  const k = m.trunk * 0.45 + m.shoulders * 0.55;
  return new THREE.Vector3(k, 1, m.trunk);
};

/**
 * The bind pose: where every segment sits on a figure that is standing still, in figure-local
 * metres measured up from the sole, before the root transform and the build multipliers.
 *
 * This is the anatomy contract in placed form. `rig.js` deviates from it — a stride rotates a
 * thigh about its hip, a swing rotates an upper arm about its shoulder — and `index.js` falls
 * back to it whole when the rig has not solved a slot. Keeping it here rather than in the rig is
 * what stops the joint chain and the geometry drifting apart: the same numbers that shape a
 * thigh place it.
 *
 * ## `build`, and how per-archetype mass gets in
 *
 * **New in r04.** One geometry set serves eleven archetypes, so an archetype's mass cannot be a
 * second mesh — the cast is at its 26-draw ceiling. It rides here instead, on the per-slot
 * **instance scale**: `rig.js` replaces only `scale.y` on a bone and keeps the x and z this
 * function hands it, so a thicker thigh, a heavier trunk and a wider arm seat are all a bind-pose
 * scale and cost nothing but arithmetic.
 *
 * Pass `cast.js`'s own `buildFor(personId, archetypeId)` record — `{ shoulderSpan, girth, weight,
 * posture, stance }` — and `resolveBuild` turns it into the four multipliers applied below. Omit
 * it and every archetype is built at `DEFAULT_BUILD`, which is what the delivered pipeline does
 * today; see `MASS_TARGET` for exactly what that costs and which two callers close it.
 */
export function buildRestPose(p = PROPORTIONS, { quadruped = false, mul = null, build = null } = {}) {
  if (quadruped) return quadrupedRestPose(mul ?? { width: 1, height: 1 });
  const { y, segment: seg, natural } = p;
  const m = resolveBuild(build ?? DEFAULT_BUILD);
  const pose = {
    // 20 mm of depth-buffer clearance, and the one length in this function that is NOT a figure
    // metre: it stops the decal z-fighting with the ground, which is a renderer property and not
    // an anatomical one. Left where it is on purpose. g03.
    contact: slot(new THREE.Vector3(0, 0.02, 0), NONE(), new THREE.Vector3(m.trunk, 1, m.trunk)),
    pelvis: slot(new THREE.Vector3(0, y.pelvisCentre, 0), NONE(), trunkScale(m)),
    torso: slot(new THREE.Vector3(0, y.torsoCentre, 0), NONE(), trunkScale(m)),
    chest: slot(new THREE.Vector3(0, y.chestCentre, 0), NONE(), chestScale(m)),
    // §2.1: the head sits forward of the spine, not centred on it. The neck leans with it.
    // The six z offsets in this function are authored millimetres off the r02–r04 plates rather
    // than fractions of anything, so they carry across on `FIGURE_SCALE`; left raw they would put
    // a head twice as far forward of its own spine on a figure half the height. g03.
    neck: slot(
      new THREE.Vector3(0, y.neckCentre, 0.022 * FIGURE_SCALE), NONE(),
      new THREE.Vector3(
        seg.neck.width * m.trunk, seg.neck.length / natural.neck, seg.neck.width * m.trunk,
      ),
    ),
    // Crown-to-chin is one sixth of crown-to-sole, and this is the placement that makes it so.
    // `head.js` authors about this origin; hair and the dark features take the same transform.
    // The head barely moves with mass: a heavy man has the same skull as a lean one, and scaling
    // it with the body is what turns a heavy figure into a giant.
    head: slot(new THREE.Vector3(0, y.headCentre, 0.038 * FIGURE_SCALE), NONE(), new THREE.Vector3(m.head, m.head, m.head)),
  };

  for (const side of [-1, 1]) {
    const suffix = side < 0 ? 'L' : 'R';
    const loaded = side < 0;                     // the left leg carries; the right is free
    // Legs: near vertical, with the free leg a shade out and a shade forward.
    //
    // r01 splayed both legs 3.2° out of the hip and turned both feet 4.9° out, and the r01 critic
    // read the result off the lineup as "every figure in the cast stands in an identical
    // symmetric wide A" against a reference lineup with **zero** figures posed that way. Symmetry
    // is the tell more than width is: a person at rest loads one leg and lets the other drift, so
    // the two halves of the pose are given different numbers here rather than mirrored ones.
    // A positive splay brings the foot *inward*, toward the midline. The loaded leg takes the
    // body's weight under its own centre of mass and so runs further in; the free leg drifts out
    // and a little forward and does almost nothing.
    const hip = new THREE.Vector3(
      side * seg.thigh.offsetX * 0.94 * m.trunk * m.stance, y.crotch, 0.01 * FIGURE_SCALE,
    );
    const thigh = segment(
      hip, hang(loaded ? 0.046 : -0.014, loaded ? 0.012 : -0.034, -side),
      seg.thigh.length, seg.thigh.top * m.limb, natural.leg,
    );
    const shin = segment(
      thigh.end, hang(loaded ? 0.014 : -0.008, loaded ? -0.008 : 0.030, -side),
      seg.shin.length, seg.shin.top * m.limb, natural.leg,
    );
    pose[`thigh${suffix}`] = thigh.transform;
    pose[`shin${suffix}`] = shin.transform;
    pose[`foot${suffix}`] = slot(
      new THREE.Vector3(shin.end.x, y.ankle, shin.end.z + (loaded ? 0.006 : 0.036) * FIGURE_SCALE),
      new THREE.Quaternion().setFromAxisAngle(UP, side * (loaded ? 0.028 : 0.058)),
      new THREE.Vector3(m.foot, 1, m.foot),
    );

    // Arms: hanging, not held out. A perfectly vertical arm buries its own shoulder ball in the
    // ribcage and reads as a slab edge, so the upper arm keeps a little abduction — but the
    // forearm now comes back *in* toward the thigh and carries a real elbow break, instead of
    // continuing the splay and parking the hand a hand's width off the hip.
    //
    // **The arm seat is where per-archetype mass shows most and it is driven by girth**, not by
    // shoulder span alone — `resolveBuild.armSeat`. A heavy man's arms are held out by the torso
    // they hang beside, which is why the reference builder is the widest figure in his pack while
    // carrying the same shoulder line as the men next to him.
    const shoulder = new THREE.Vector3(
      side * seg.armOffsetX * m.armSeat, y.shoulderJoint, 0.005 * FIGURE_SCALE,
    );
    const upper = segment(
      shoulder, hang(loaded ? 0.062 : 0.078, loaded ? 0.030 : 0.062, side),
      seg.upperArm.length, seg.upperArm.top * m.limb, natural.upperArm,
    );
    const fore = segment(
      upper.end, hang(loaded ? -0.055 : -0.038, loaded ? 0.235 : 0.290, side),
      seg.forearm.length, seg.forearm.top * m.limb, natural.forearm,
    );
    pose[`upperArm${suffix}`] = upper.transform;
    pose[`forearm${suffix}`] = fore.transform;
    pose[`hand${suffix}`] = slot(
      fore.end.clone(),
      new THREE.Quaternion().setFromAxisAngle(UP, side * 0.10),
      ONE(),
    );
  }
  return pose;
}

/**
 * The dog, standing.
 *
 * **Why this takes `mul`.** `index.js` multiplies every local position by
 * `(mul.width, mul.height, mul.width)` and folds the same triple into the instance scale, and the
 * dog's legacy build tuple is `(height 0.64, width 1.38)` against a reference height of 1.55 —
 * so x and z are stretched 1.38× while y is compressed to 0.413×, a factor of 3.3 between them.
 * Anything authored in even units renders three times too long and wide, which is the r01 dog's
 * squat sausage silhouette; anything *rotated* also shears, because `compose` applies scale before
 * rotation. Both faults disappear if the pose hands back the inverse: every slot below carries
 * `1/mul` as its scale and `position/mul` as its place, so the product `index.js` writes is
 * exactly the world metre the geometry was authored in, and the instance scale is a clean 1.
 *
 * A solver adopting the dog slots calls `buildRestPose(PROPORTIONS, { quadruped: true, mul })`
 * with the figure's own multipliers and then works in world metres throughout.
 *
 * The legacy biped keys are kept, at a hidden scale, purely so a rig that has not adopted the
 * quadruped slots can still read `rest.head`, `rest.chest` and the four leg slots without
 * throwing. `index.js` discards a dog pose that does not carry `dogBody` and falls back here.
 */
function quadrupedRestPose(mul = { width: 1, height: 1 }) {
  const w = mul.width || 1;
  const h = mul.height || 1;
  const at = (x, y, z) => new THREE.Vector3(x / w, y / h, z / w);
  const unit = () => new THREE.Vector3(1 / w, 1 / h, 1 / w);
  const sized = (x, y, z) => new THREE.Vector3(x / w, y / h, z / w);
  const d = DOG_METRICS;

  const headQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), d.headPitch);
  const headOrigin = new THREE.Vector3(0, d.headY, d.headZ);
  // Head-local metres are authored at the r01 animal's scale, exactly like the geometry they sit
  // on, so they take `DOG_SCALE` before they meet an already-scaled `headOrigin`. g03.
  const onHead = (x, y, z) => {
    const v = new THREE.Vector3(x, y, z)
      .multiplyScalar(d.headScale * DOG_SCALE).applyQuaternion(headQ).add(headOrigin);
    return at(v.x, v.y, v.z);
  };
  const headUnit = () => new THREE.Vector3(
    d.headScale / w, d.headScale / h, d.headScale / w,
  );

  // 20 mm of z-fight clearance again, and it does not scale; the 50 mm forward is where the
  // animal's mass sits over its own feet and does.
  const pose = {
    contact: slot(at(0, 0.02, 0.05 * DOG_SCALE), NONE(), sized(0.40, 1, 0.62)),
    dogBody: slot(at(0, 0, 0), NONE(), unit()),
    dogHead: slot(at(0, d.headY, d.headZ), headQ.clone(), headUnit()),
    // The tail carries up and aft, the way the reference plate's does.
    dogTail: slot(
      at(0, d.tailRootY, d.tailRootZ),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.62),
      unit(),
    ),
    // A wet dark nose on the end of the muzzle, and two eyes at the stop beside it. Placed in
    // head-local metres and carried through the head's own rotation, so a solver that turns the
    // head turns these with it by applying the same transform.
    dogNose: slot(
      onHead(0, -0.014, 0.184), headQ.clone(),
      sized(0.052 * DOG_SCALE, 0.040 * DOG_SCALE, 0.044 * DOG_SCALE),
    ),
  };
  for (const side of [-1, 1]) {
    // Set into the skull behind the stop, not on the muzzle. The first r02 dog put three dark
    // bulbs of one size in a row along the snout and they read as three eyes.
    pose[`dogEye${side < 0 ? 'L' : 'R'}`] = slot(
      onHead(side * 0.058, 0.040, 0.038), headQ.clone(),
      sized(0.030 * DOG_SCALE, 0.030 * DOG_SCALE, 0.030 * DOG_SCALE),
    );
  }

  // Four legs. The front pair is turned a half turn about Y so the shared hock reads as an elbow
  // pointing aft on the rear legs and forward on the front ones.
  const half = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI);
  const legs = [
    ['dogLegFL', -d.legFrontX, d.shoulderZ, true],
    ['dogLegFR', d.legFrontX, d.shoulderZ, true],
    ['dogLegRL', -d.legRearX, d.hipZ, false],
    ['dogLegRR', d.legRearX, d.hipZ, false],
  ];
  for (const [name, x, z, front] of legs) {
    pose[name] = slot(
      at(x, d.legTop - d.legNatural * 0.5, z),
      front ? half.clone() : NONE(),
      unit(),
    );
  }

  // —— legacy compatibility ————————————————————————————————————————————————————————————
  // Hidden placeholders. `rig.js` still reads `rest.head`, `rest.chest`, `rest.thighL/R` and
  // `rest.shinL/R` without guarding, and a throw inside `poseFigure` takes the whole board down
  // rather than degrading one archetype. These give it real numbers and no pixels.
  const ghost = (y, z) => slot(at(0, y, z), NONE(), new THREE.Vector3(0.001, 0.001, 0.001));
  pose.head = ghost(d.headY, d.headZ);
  pose.chest = ghost(d.withers, d.shoulderZ);
  pose.torso = null;
  pose.pelvis = null;
  pose.neck = null;
  pose.face = null;
  pose.hair = null;
  pose.badge = null;
  for (const side of ['L', 'R']) {
    pose[`thigh${side}`] = ghost(d.legTop - d.legNatural * 0.5, d.hipZ);
    pose[`shin${side}`] = ghost(d.legTop - d.legNatural * 0.5, d.shoulderZ);
    pose[`foot${side}`] = null;
    pose[`hand${side}`] = null;
    pose[`upperArm${side}`] = null;
    pose[`forearm${side}`] = null;
  }
  return pose;
}

// ——— the mass contract, per archetype ——————————————————————————————————————————————————
//
// `core.js` `assertMassContract()` proves the shared girth ratios. This is the other half: what
// each archetype's built figure actually measures, against what the reference says it should.
//
// **Why it exists.** `assertSixHeads()` has guarded height since r01 and height has never drifted.
// Nothing guarded girth, and girth is what every blind round lost on — subject aspect sorted our
// cast from the reference in 5 of 5 pairs and nobody could see it, because there was no number to
// see. Everything below runs at import.

/** Where the hero plate is shot from. `people-lab.js` `STATIONS.hero` plus the figure's own yaw. */
const HERO = Object.freeze({ yaw: -0.62, el: 0.17 });

/** figure-local metres → hero-plate axes. Near-orthographic: the hero lens is 12°. */
function toScreen(x, yy, z, yaw, el) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: x * c + z * s, y: yy * Math.cos(el) - (-x * s + z * c) * Math.sin(el) };
}

/** Widen a running extent by a ring of half-width `hw` and half-depth `hd` centred on (x, y, z). */
function spanRing(out, ring, origin, sx, sz, yaw, el) {
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    const px = origin.x + (ring.x ?? 0) * sx + Math.cos(a) * ring.w * 0.5 * sx;
    const pz = origin.z + (ring.z ?? 0) * sz + Math.sin(a) * ring.d * 0.5 * sz;
    const p = toScreen(px, origin.y + ring.y, pz, yaw, el);
    if (p.x < out.x0) out.x0 = p.x;
    if (p.x > out.x1) out.x1 = p.x;
  }
}

/** Widen a running extent by a sphere: under this lens a sphere projects to its own circle. */
function spanBall(out, point, radius, yaw, el) {
  const p = toScreen(point.x, point.y, point.z, yaw, el);
  if (p.x - radius < out.x0) out.x0 = p.x - radius;
  if (p.x + radius > out.x1) out.x1 = p.x + radius;
}

/**
 * Subject aspect of the **built** figure — the width-for-height of its own silhouette at the hero
 * station, which is the quantity the blind harness measures off a matted plate.
 *
 * Walked over the same ring tables and the same bind pose the geometry is built from, so it
 * cannot drift from what renders: change a trunk ring and this moves with it. Height is
 * crown-to-sole rather than the plate's bounding box, because headwear belongs to lane C and mass
 * does not; `BIND_TO_PLATE` carries that difference and `_r04b-mass-probe.mjs` re-derives it.
 */
export function bindSilhouette(p = PROPORTIONS, {
  mul = { width: 1, height: 1 }, build = null, yaw = HERO.yaw, el = HERO.el,
} = {}) {
  const pose = buildRestPose(p, { build });
  const out = { x0: Infinity, x1: -Infinity };
  const at = (name) => {
    const s = pose[name];
    return { x: s.position.x * mul.width, y: s.position.y * mul.height, z: s.position.z * mul.width };
  };
  const trunk = [['pelvis', pelvisRings(p)], ['torso', torsoRings(p)], ['chest', chestRings(p)]];
  for (const [name, rings] of trunk) {
    const origin = at(name);
    const sx = pose[name].scale.x * mul.width;
    const sz = pose[name].scale.z * mul.width;
    for (const ring of rings) spanRing(out, { ...ring, y: ring.y * mul.height }, origin, sx, sz, yaw, el);
  }
  // Limbs: a capsule's silhouette is its two end balls, and the pose already places them.
  const limbs = [
    ['thigh', p.segment.thigh, p.natural.leg], ['shin', p.segment.shin, p.natural.leg],
    ['upperArm', p.segment.upperArm, p.natural.upperArm],
    ['forearm', p.segment.forearm, p.natural.forearm],
  ];
  for (const side of ['L', 'R']) {
    for (const [key, seg, natural] of limbs) {
      const s = pose[`${key}${side}`];
      const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(s.quaternion);
      const half = s.scale.y * natural * 0.5;
      const centre = new THREE.Vector3(
        s.position.x * mul.width, s.position.y * mul.height, s.position.z * mul.width,
      );
      const top = centre.clone().addScaledVector(axis, half * mul.height);
      const bottom = centre.clone().addScaledVector(axis, -half * mul.height);
      const rTop = s.scale.x * 0.5 * mul.width;
      spanBall(out, top, rTop, yaw, el);
      spanBall(out, bottom, rTop * (seg.bottom / seg.top), yaw, el);
    }
    // The hand rides the forearm and reaches a hand's length past the wrist. It is the widest
    // point on several archetypes, so a silhouette that stops at the wrist under-reports.
    const s = pose[`forearm${side}`];
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(s.quaternion);
    const wrist = new THREE.Vector3(
      s.position.x * mul.width, s.position.y * mul.height, s.position.z * mul.width,
    ).addScaledVector(axis, -s.scale.y * p.natural.forearm * 0.5 * mul.height);
    spanBall(out, wrist, p.segment.hand.width * 0.5 * s.scale.x / p.segment.forearm.top * mul.width, yaw, el);
    // Feet: a boot is longer than it is wide and its long axis swings into the projection.
    const foot = pose[`foot${side}`];
    const fx = foot.position.x * mul.width;
    const fz = foot.position.z * mul.width;
    const fw = p.segment.foot.width * foot.scale.x * mul.width;
    const fl = p.segment.foot.length * foot.scale.z * mul.width;
    spanRing(out, { y: 0, w: fw, d: fl }, { x: fx, y: p.y.ankle * mul.height, z: fz }, 1, 1, yaw, el);
  }
  const width = out.x1 - out.x0;
  const height = p.height * mul.height;
  return { width, height, aspect: width / height };
}

/**
 * Bind-silhouette aspect → the aspect the blind harness measures off a matted hero plate.
 *
 * The two differ for reasons that are not mass: the plate's box is topped by headwear and floored
 * by a boot sole, the rig's idle carriage abducts an arm further than the bind pose does, and
 * lane C's props stand outside the body on four archetypes. One constant absorbs all of it, and
 * `mvp/tests/_r04b-mass-probe.mjs` prints the measured ratio beside it so it cannot go stale
 * quietly — the probe measures the real batch through `rig.js`, this measures the build.
 */
export const BIND_TO_PLATE = 1.200;

/**
 * The reference plates, measured. Three of the five r02 blind pairs are single figures, and these
 * are the `subject` boxes the figure fit reported for the reference panel of each:
 * `mvp/_reviews/people/_blind/r02-figure/METRICS.json`.
 */
const MASS_ANCHOR = Object.freeze({
  'cheap-builder': 562 / 868,
  policeman: 403 / 840,
  'rival-developer': 393 / 814,
});

/**
 * Per-archetype subject-aspect target, **derived rather than authored**.
 *
 * Only three archetypes have a measured reference plate, so the other eight are extrapolated
 * rather than invented: a power law in lane F's own published `ARCHETYPE_BUILD.girth`, with its
 * exponent and coefficient solved from two of the three anchors and the third left as a residual
 * that the audit prints. Girth is the driver rather than `shoulderSpan` because the table gives
 * the rival developer the widest shoulders in the cast and the reference gives him a narrower
 * silhouette than the builder — a shoulder line is not a silhouette, and obesity is.
 */
function fitMassLaw() {
  const g = (id) => ARCHETYPE_BUILD[id].girth;
  const a = 'cheap-builder';
  const b = 'policeman';
  const gamma = Math.log(MASS_ANCHOR[a] / MASS_ANCHOR[b]) / Math.log(g(a) / g(b));
  return { gamma, a0: MASS_ANCHOR[b] / g(b) ** gamma };
}
const MASS_LAW = fitMassLaw();

export const MASS_TARGET = Object.freeze(Object.fromEntries(
  Object.keys(ARCHETYPE_STYLE)
    .filter((id) => id !== 'dog')
    .map((id) => [id, MASS_LAW.a0 * ARCHETYPE_BUILD[id].girth ** MASS_LAW.gamma]),
));

/**
 * The fraction of its own target the delivery system reaches on its worst archetype.
 *
 * **This constant is the finding of r04 seat B stated as one number, and it is not a fudge
 * factor.** Per-archetype mass has exactly two ways into the render and lane A owns neither of
 * them. `rig.js` memoises one bind pose for every biped (`bipedRest()`, no build) and reads joint
 * stations straight off `PROPORTIONS`, so `buildRestPose`'s `build` argument above is never
 * supplied; and the only per-figure width that does reach the matrix is `ARCHETYPE_STYLE`'s
 * `widthScale`, which is lane F's. So a shared base is the whole of what this lane can move, and
 * a shared base cannot put the builder at 1.35× the policeman when lane F's dials put him at
 * 1.08×. The gap lands almost entirely on the heavy archetypes.
 *
 * It is a floor, not a licence: every archetype must clear `target × MASS_REACH` or the build
 * fails, so no figure may fall further behind the reference than the worst one already is. It
 * rises toward 1 as the two callers named above adopt; `massAudit()` reports where each stands.
 */
// r06 seat A raised the shared base (shoulder 0.448, limb volumes, belly depth). Floor tracks
// the worst archetype's reach so a silent thin-out fails at import rather than on a plate.
// r07 seats arms tighter (anti-balloon) — outer span may drop slightly; floor holds the cast.
export const MASS_REACH = 0.82;

/** What every archetype measures, against what it should. The round report reads exactly this. */
export function massAudit(p = PROPORTIONS) {
  return Object.keys(MASS_TARGET).map((id) => {
    const [, height, width] = styleFor(id);
    const mul = { width, height: height / 1.55 };
    const shared = bindSilhouette(p, { mul }).aspect * BIND_TO_PLATE;
    const built = bindSilhouette(p, { mul, build: buildFor(id, id) }).aspect * BIND_TO_PLATE;
    return {
      id,
      target: MASS_TARGET[id],
      delivered: shared,
      withBuild: built,
      reach: shared / MASS_TARGET[id],
      reachWithBuild: built / MASS_TARGET[id],
    };
  });
}

/**
 * Fail at import when a built figure misses its mass target, the way `assertSixHeads()` fails
 * when one misses its height. §7 rule 12: a number nobody can trip is a comment.
 */
export function assertFigureMass(p = PROPORTIONS) {
  for (const row of massAudit(p)) {
    const floor = row.target * MASS_REACH;
    if (row.delivered < floor) {
      throw new Error(
        `people/figure.js: ${row.id} measures ${row.delivered.toFixed(3)} subject aspect against a `
        + `target of ${row.target.toFixed(3)} and a floor of ${floor.toFixed(3)}. Mass is the `
        + 'dimension five blind pairs sorted on; see MASS_REACH for which dial is short.',
      );
    }
  }
  return true;
}
assertFigureMass();

export default buildRestPose;
