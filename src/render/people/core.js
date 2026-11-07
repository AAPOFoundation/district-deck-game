// District Deck V3.32 — shared figure primitives.
//
// Lane: shared. Owned by no seat; every other module in `people/` depends on it, so a change
// here moves every figure on the board. See `docs/next-phase/V332-HUMAN-AAA-SPEC.md` §5.
//
// This file holds what more than one lane needs and nothing else:
//   * deterministic variation — `hash32` / `unitFrom`, and the salt namespaces that keep one
//     lane's new draw from shifting another lane's existing variation;
//   * the proportion contract — `PARTY_ANIMALS` re-exported so `actors.js` stays the published
//     contract, plus the derived per-segment dimensions the geometry lanes build against;
//   * the neutral palette (garment-independent values: trouser, hair, badge plate, contact);
//   * `geometryTriangles`, `instanced`, `mergeParts` and the `emit` Part collector.
//
// **Import `emit` from here and nowhere else.** The residential programme lost a round to two
// shared modules exporting incompatible functions of that name; a lane that imports both then
// cannot bind twice. V3.32 §5 restates the rule for this kit.
//
// Deterministic: no `Math.random`, no `Date.now`, no clock. V3.32 §3.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PARTY_ANIMALS, BODY_ARCHETYPES } from '../actors.js';

// `actors.js` remains the published silhouette contract for anything outside this kit.
// Re-exported rather than copied so there is exactly one source for the proportions.
export { PARTY_ANIMALS, BODY_ARCHETYPES };

/**
 * Salt namespaces, V3.32 §5. Two lanes must never share a salt: a collision means one lane's
 * new variation silently re-rolls another lane's, and the regression shows up as "the cast
 * changed" in a round nobody touched the cast.
 */
export const SALT = Object.freeze({
  CORE: 0,
  FIGURE: 100,
  HEAD: 200,
  WARDROBE: 300,
  RIG: 400,
  MATERIALS: 500,
  CAST: 600,
  AMBIENT: 700,
});

/** FNV-1a over the string. The same function `people.js` has always used for walk offsets. */
export function hash32(text) {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/**
 * Seed + salt → [0,1). `seed` may be a string or an already-hashed 32-bit number.
 *
 * The avalanche is the residential kit's, deliberately: XORing a salt into a hash and handing
 * the raw high bits to the caller reads only the top two or three bits once a caller takes
 * `floor(u * n)`, and adjacent salts then produce the same pick. Mixing after the XOR fixes it.
 */
export function unitFrom(seed, salt) {
  const base = typeof seed === 'number' ? seed >>> 0 : hash32(String(seed));
  let h = (base ^ Math.imul(salt, 0x9e3779b9)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

export const UP = new THREE.Vector3(0, 1, 0);
export const LOCAL_X = new THREE.Vector3(1, 0, 0);
export const IDENTITY = new THREE.Quaternion();
/** Instance scale that removes a part from the frame without costing a draw. */
export const HIDDEN_SCALE = new THREE.Vector3(0.001, 0.001, 0.001);

/**
 * Values that are not garment identity: they belong to every figure whatever its role.
 * Archetype colour, skin and the accessory palette live in `cast.js` and `wardrobe.js`.
 */
export const PALETTE = Object.freeze({
  trouser: '#1e242c',
  legs: '#2a3038',
  hair: '#2a2220',
  skin: '#e8c4a8',
  badgePlate: '#f4f0e6',
  contact: '#3a2818',
});

// ——— the six-head proportion contract ————————————————————————————————————————————————————
//
// V3.32 §2.1 and the r01 shared brief §3: crown-to-chin goes into crown-to-sole six times, for
// every adult. The ratio is derived here and nowhere else, so no lane can drift it by editing a
// metre. Every altitude and every segment length below is a fraction of total height rather than
// an authored metre, and `assertSixHeads()` proves the arithmetic at import time.
//
// Vertical datum: y = 0 is the ground the figure stands on. Dimensions are metres at build 1.
// Widths and depths are FULL widths (not radii).

/** Crown-to-chin goes into crown-to-sole this many times. Not a tunable. */
export const HEAD_COUNT = 6;

/**
 * The stature the whole kit was authored at, r01 → r05.
 *
 * Nothing is built at this number any more. It survives as the denominator of `FIGURE_SCALE`, so
 * that the handful of lengths across the kit that genuinely are authored metres — a forward
 * offset on a head, a contact radius, the dog — can say "the 38 mm the r04 plates measured" and
 * still land on today's figure. Every one of them is written `<the measured number> *
 * FIGURE_SCALE`, which is why they read the same as the round reports that set them.
 */
export const AUTHORED_STATURE = 3.72;

/**
 * Total crown-to-sole at build 1, in world metres. **g03 moves it, and this is the reasoning.**
 *
 * r01 held 3.72 because the pick proxy was a 4.2 m box and moving world scale was not that lane's
 * call. It is this lane's call, and 3.72 is about twice what the board draws around it: the board
 * is in honest metres end to end — `STOREY` 3.2, `ROAD` 16, a 3 m footpath — and the figure was
 * taller than a full storey.
 *
 * 1.84 is measured off the board's own street furniture rather than off a target for realism:
 *
 *   * **The bench decides it.** `board.js` `_buildAvenueKerbProduct` seats its planks at 0.4875 m
 *     and stands the back at 0.99 — a real bench, authored in real metres. Knee-height equals
 *     seat-height is a physical fact rather than a preference, and `y.knee` is 0.265 of stature,
 *     so the bench asks for 0.4875 / 0.265 = **1.840**. It is the tightest anchor on the board and
 *     it is the one this number is set from.
 *   * **The doors agree.** `cottage-federation.js` opens its front door 2.10 m. A 1.75 m adult
 *     under a real 2.04 m door clears by 14.2 per cent; the same clearance under 2.10 puts a
 *     figure at 1.80. The kit's terrace and shop leaf (`building-kit.js`, 2.35) and the cafe splay
 *     (2.44) are both roomier than that.
 *   * **The lamp agrees.** The avenue lamp's lantern globe rides at 3.48 m and its finial at 3.72
 *     — the figure was, precisely, as tall as the whole lamp post. A real 1.75 m person is 0.50 of
 *     a 3.5 m column; 1.84 is 0.53 of this one.
 *   * **The storey agrees.** 1.84 / 3.2 = 0.575 against a real 1.75 / 3.0 = 0.583.
 *
 * **What was rejected.** 2.00 — the stature the pre-programme placeholder pedestrians stood at —
 * clears the cottage's 2.10 m door by 100 mm, which reads as a figure filling a doorway rather
 * than walking through one, and puts the knee 40 mm above the bench it is meant to sit on. 1.75,
 * literal realism, was rejected the other way: this is a board token and the six-head lock already
 * runs a head 28 per cent larger than anatomy, so the register's readability allowance is spent on
 * the head and does not need spending twice.
 *
 * **One asset disagrees and it is the asset that is wrong.** The heritage villa's door *leaf* is
 * 1.86 m (`heritage-federation-villa.js` `VILLA.doorLeafH`) inside a 2.40 m opening with a
 * fanlight over it, where a real Federation leaf is 2.04. A 1.84 m figure clears it by 20 mm. That
 * is a building-lane number and not this lane's to move; it is recorded here so the next seat to
 * read a plate knows which of the two is under-scale.
 *
 * **75 % of the 1.84 m lock (1.38 m).** The street-furniture arithmetic above is kept as the
 * identity of the figure. Board doors and vehicle cabs still read the 1.84 m token as filling
 * the opening rather than passing through it — pick proxy is `height * 1.13`, so 2.08 m against
 * a 2.10 m cottage leaf. 0.75 of the lock (1.38 m, proxy 1.56 m) is the scale that fits a
 * doorway and a tram/car cabin without touching the six-head ratio or the wardrobe plates.
 */
const STREET_STATURE = 1.84;
/**
 * W3-A, taste bible section 4 ("base unit: one adult person is 1.70 m"). The 0.75 factor that
 * stood here (1.38 m) was measured in the live scene at 1.36 to 1.38 m for the cast and 0.94 to
 * 1.51 m for the ambient street crowd, against a band of 1.60 to 1.80 m (adult) and 1.05 to
 * 1.25 m (child), and a 1.48 m car roof beside it. The door argument above still holds at this
 * height: 1.70 / 2.1 m cottage leaf is 81 per cent, inside the bible's 75 to 80 per cent test
 * for a 2.2 m door. Every length in the kit is a fraction of `T`, so the six-head ratio and the
 * mass contract are untouched; per-build spread is set where the builds are authored (the
 * ambient `measure` table and the cast tuples), not here.
 */
const T = 1.70;

/**
 * One r01-authored metre, in today's figure's units.
 *
 * A pure scale: `assertSixHeads()` and `assertMassContract()` are ratio tests and neither moves.
 */
export const FIGURE_SCALE = T / AUTHORED_STATURE;
/** Crown-to-chin. Everything above the shoulders is measured in these. */
const H = T / HEAD_COUNT;

/** Altitudes above the sole, as fractions of total height. */
const Y = Object.freeze({
  sole: 0,
  ankle: 0.048 * T,
  knee: 0.265 * T,
  crotch: 0.480 * T,
  hip: 0.545 * T,
  waist: 0.620 * T,
  chest: 0.740 * T,
  shoulder: 0.792 * T,
  // The glenohumeral joint sits below the acromion, so the deltoid ball tops out a shade above
  // the shoulder line rather than standing proud of the trapezius like a pad.
  shoulderJoint: 0.762 * T,
  elbow: 0.605 * T,
  wrist: 0.455 * T,
  neckBase: 0.786 * T,
  chin: T - H,
  crown: T,
  // Part origins the geometry lanes author against and the rig places.
  headCentre: T - H * 0.5,
  neckCentre: 0.805 * T,
  chestCentre: 0.708 * T,
  torsoCentre: 0.594 * T,
  pelvisCentre: 0.516 * T,
});

// ——— the girth contract ————————————————————————————————————————————————————————————————
//
// **r04 seat B.** The height contract above is derived, proved at import and cannot drift. There
// was no equivalent for girth, and girth is what five successive blind pairs sorted on: subject
// aspect — the width-for-height of the figure's own bounding box — separated our cast from the
// reference in 5 of 5 pairs, at 0.427 against 0.647 on the builder and 0.399 against 0.480 on the
// policeman (`_blind/r02-figure/METRICS.json`, panels `subject`). The harness introduces none of
// it: both panels are matted, height-matched and centred, so what it measures is build.
//
// Three rounds passed without touching it because there was nothing to fail. Every width below is
// therefore stated as a **fraction of stature** rather than as a metre, exactly as every altitude
// is, and `assertMassContract()` proves the ratios at import beside `assertSixHeads()`.
//
// `SPAN` is breadth across a passage, as a fraction of crown-to-sole. `SECTION` is that passage's
// depth as a fraction of its own breadth — the number that decides whether a trunk is a plank or
// a body, and the one the r03 critic asked for by name ("the trunk deeper front-to-back than it
// is now"). `LIMB` is a segment diameter, again as a fraction of stature, stated at both joints
// so a taper is a contract rather than a preference.

/**
 * Breadth across each passage, as a fraction of crown-to-sole.
 *
 * **The trunk moved by one factor pair and the shoulder line by its own**, and that split is
 * deliberate. Measured on the r04 sweep (`mvp/tests/_r04b-mass-probe.mjs`), trunk breadth and
 * depth contribute **almost nothing** to subject aspect at the hero station — holding the whole
 * trunk at its pre-r04 girth and moving only the shoulder line changed the builder's measured
 * aspect by 0.002. The silhouette is set by where the arms hang, and the arms hang off
 * `SEGMENT.armOffsetX`, which is derived from `shoulder`.
 *
 * So `shoulder` is the mass number, and the trunk is the body read. Every trunk passage below is
 * the pre-r04 metre times **`TRUNK_BREADTH`** in x and **`TRUNK_SECTION`** in z, uniformly, so
 * lane C re-seats a garment by multiplying two numbers rather than by re-deriving a table.
 */
// r06 seat A: trunk breadth/section up together so the belly and chest gain volume without
// flattening into a plank. Breadth alone was measured as almost no subject-aspect; section is
// what makes a trunk read as a body at three-quarters (§2.1).
// r07 seat A: section only — depth-led soft gut needs more front-to-back without another
// shared-base breadth pass that would overshoot the policeman further.
const TRUNK_BREADTH = 1.28;
const TRUNK_SECTION = 1.60;
/**
 * **g03 finding, and `assertMassContract()` is what found it.** The four trunk entries below were
 * written `(<pre-r04 metre> * TRUNK_BREADTH) / T`, which is a metre wearing a fraction's clothes:
 * `WIDTH.chest` is `SPAN.chest * T`, so the T cancelled and the chest came out a constant 1.056 m
 * whatever the figure's height. Moving stature to 1.84 left a 1.84 m person with a 1.06 m chest
 * and the contract failed on load — `shoulderOverWaist` 0.942 against a floor of 1.55 — before a
 * single plate was shot. Dividing by the stature the metre was *measured at* is what makes it a
 * fraction; the numbers themselves are r04's, unchanged, and the built figure at 3.72 would be
 * identical to the one r05 signed.
 */
const OF_AUTHORED = (metres) => metres / AUTHORED_STATURE;
const SPAN = Object.freeze({
  // 0.323 before r04, 0.430 at r04. Shared base at 0.448 — the silhouette is set by where the
  // arms hang, and limb volume alone cannot close the builder's remaining gap to 0.647 without a
  // per-archetype surface scale. The policeman and developer already sit near or past their
  // reference aspects; this step buys the whole cast a little mass and leaves the builder short
  // of target by construction (see `MASS_TARGET` / `MASS_REACH` in `figure.js`).
  shoulder: 0.448,
  // r07: chest fills more of the shoulder line so arms hang from a body shelf, not as pads
  // beside a narrow barrel. Breadth only — section stays depth-led.
  chest: OF_AUTHORED(0.94 * TRUNK_BREADTH),
  waist: OF_AUTHORED(0.70 * TRUNK_BREADTH),
  hip: OF_AUTHORED(0.86 * TRUNK_BREADTH),
  neck: OF_AUTHORED(0.255 * TRUNK_BREADTH),
  // Rounder than a real skull. The reference token's head is 1.08 tall for 1.0 wide; an
  // anatomical 1.4 reads as a long face at board altitude and was the r01 first-pass note.
  // 0.134 before r04, against a reference head that measures about 0.152 of its own stature — a
  // small head on a wide body is most of what made ours read as a mannequin rather than a token.
  head: 0.150,
});

/**
 * Depth of each passage as a fraction of its own breadth. A slab is 0.5; a body is not.
 *
 * "The trunk deeper front-to-back than it is now" is the r03 critic's own wording and this is it
 * as arithmetic: the chest ran 0.682 and the waist 0.686, so at three-quarters the trunk read as
 * a board on edge with the garment painted on the front of it.
 */
const SECTION = Object.freeze({
  // Denominator tracks SPAN.chest's pre-r04 metre so depth holds when breadth steps (r07 0.94).
  chest: (0.60 * TRUNK_SECTION) / (0.94 * TRUNK_BREADTH),
  waist: (0.48 * TRUNK_SECTION) / (0.70 * TRUNK_BREADTH),
  hip: (0.56 * TRUNK_SECTION) / (0.86 * TRUNK_BREADTH),
  neck: 0.97,
  head: 1.07,
});

const WIDTH = Object.freeze({
  shoulder: SPAN.shoulder * T,
  chest: SPAN.chest * T,
  waist: SPAN.waist * T,
  hip: SPAN.hip * T,
  neck: SPAN.neck * T,
  head: SPAN.head * T,
});

const DEPTH = Object.freeze({
  chest: WIDTH.chest * SECTION.chest,
  waist: WIDTH.waist * SECTION.waist,
  hip: WIDTH.hip * SECTION.hip,
  neck: WIDTH.neck * SECTION.neck,
  head: WIDTH.head * SECTION.head,
});

/**
 * Limb diameters at each joint, as fractions of stature.
 *
 * **The taper is the finding.** Successive blind critics reached for the same words unprompted —
 * "a bundle of dowels", "torso, upper arm and forearm all roughly the same diameter", "the arm
 * ends rather than becoming a hand". They were describing arithmetic: the pre-r04 upper arm ran
 * 0.265 → 0.230 and the forearm 0.240 → 0.165, so mid-upper-arm was **1.18×** mid-forearm and the
 * two limbs read as one tube with a kink. It measures **1.57×** below. Thigh against calf was
 * 1.28 and measures 1.61. Both are floored by `MASS_CONTRACT` and neither can drift back.
 *
 * Ankle and wrist come DOWN while everything above them goes up, because a taper is a ratio and
 * a limb that thickens at both ends is a sausage.
 */
// Thigh and shin are ONE mesh at two instance scales, so they share one taper and the knee
// diameter is `LEG_TAPER × thighTop` by construction rather than by agreement. Deriving the
// three lower diameters from two numbers is what stops a knee opening a step when either moves.
// 0.620 first, and the plate refuted it. Measured off `mp-cheap-builder.png`, the reference runs
// a thigh at 0.139 of its own stature and a calf at 0.114 — a taper of **1.22**, not the 1.61 that
// a 0.620 shaft produces. Ours matched him at the thigh and came out 40 per cent thin at the calf,
// and against him on `_blind/r04-seatB/pair-builder.png` that is the whole of the remaining
// difference below the belt: he is a mass to the ankle and we were a mass on two sticks. §7 rule 2
// — closed against the plate, not against the wording of the brief.
// r06 seat A: leg and arm diameters step toward the reference builder's "mass to the ankle"
// read. Thigh was 0.135 of stature against a plate that runs ~0.14; upper arm was thin enough
// that the blind pack still sorted "bundle of dowels". Calf stays on the shared taper so the
// knee does not open a step.
// r07 seat A: kill the sleeve balloon. r06's 0.118 upper-arm top (and the short-sleeve shell
// sized off its elbow) read as inflated pads beside the torso on the builder hero. Diameter
// steps back toward r04 while the mid-arm ratio and a tighter arm seat keep the joint inside
// the deltoid shelf — width comes from the shoulder line, not from a fat tube.
// r08 seat A: residual short-sleeve cuff still puffed (`wardrobe` shells `bottom + 0.055`).
// Step elbow and forearm down together so the short cuff shrinks without collapsing the
// mid-arm ratio floor or thickening the trunk / shoulder line.
// r2 V3.70 L2 — limb volume, and the direction of the finding.
//
// V3.32 §4a measured subject aspect at 0.427 against the reference's 0.647 and the r1 report read
// it as "the figures are too thin", meaning the trunk. The r1 critic read `lineup.png` the other
// way and is right: the torsos are already **wide slabs** and it is the **limbs** that are sticks.
// Widening the trunk to chase 0.647 makes the silhouette worse, because a slab with sticks on it
// is not a body whatever its width.
//
// Measured off `mp-cheap-builder.png` rather than argued: the reference's forearm is very nearly
// as thick as its upper arm and its calf is very nearly as thick as its thigh. Ours ran an upper
// arm 1.57× its forearm and a thigh 1.39× its calf — a taper the plate does not have, and two
// floors in `MASS_CONTRACT` that held it there. Both floors move **toward** the plate rather than
// away from it, which is the same reasoning `thighOverCalf` already carries in its own note: a
// floor above the reference is a brief being delivered absolutely, §7 rule 1.
const LEG_TAPER = 0.760;
const ARM_TAPER = 0.640;
const LIMB = Object.freeze({
  thighTop: 0.1480,
  thighBottom: 0.1480 * LEG_TAPER,        // the knee
  shinTop: 0.1480 * LEG_TAPER,
  shinBottom: 0.1480 * LEG_TAPER * LEG_TAPER,  // the ankle, inside the boot
  // r08: elbow drives short-sleeve shell size; top stays under the deltoid shelf.
  upperArmTop: 0.0930,
  upperArmBottom: 0.0930 * ARM_TAPER,     // the elbow
  forearmTop: 0.0630,
  // The wrist. It was 0.0360 against a hand 0.0800 wide — a **2.22× step**, which is precisely
  // the "pale paddle on the end of a stick" the r1 critic read off `walk--architect.png`. A hand
  // is wider than a wrist; it is not three times it.
  forearmBottom: 0.0452,
  /** The taper each shared limb mesh is authored with. */
  legTaper: LEG_TAPER,
  armTaper: ARM_TAPER,
  foreTaper: 0.0360 / 0.0540,
  /**
   * Hip separation of the two thighs. Moves with the hip so the thigh stays inside the hip mass;
   * `MASS_CONTRACT.thighInsideHip` fails the build if it ever does not.
   */
  thighOffsetX: OF_AUTHORED(0.205 * TRUNK_BREADTH),
});

/**
 * Limb segments. `length` is joint-to-joint; `top`/`bottom` are diameters at those joints. The
 * shared limb primitive is authored at unit length and unit diameter, so the rig scales one
 * geometry into a thigh or a shin without a second draw.
 */
const ARM_TOP = LIMB.upperArmTop * T;
const SEGMENT = Object.freeze({
  thigh: Object.freeze({
    length: Y.crotch - Y.knee,
    top: LIMB.thighTop * T,
    bottom: LIMB.thighBottom * T,
    offsetX: LIMB.thighOffsetX * T,
  }),
  shin: Object.freeze({
    length: Y.knee - Y.ankle,
    top: LIMB.shinTop * T,
    bottom: LIMB.shinBottom * T,
    offsetX: LIMB.thighOffsetX * T,
  }),
  upperArm: Object.freeze({
    length: Y.shoulderJoint - Y.elbow, top: ARM_TOP, bottom: LIMB.upperArmBottom * T,
  }),
  forearm: Object.freeze({
    length: Y.elbow - Y.wrist, top: LIMB.forearmTop * T, bottom: LIMB.forearmBottom * T,
  }),
  // r06 seat A: a boot longer and wider so the sole and toe box read as a foot, not a block.
  // §2.1's token test is length > width; 1.48× here against 1.44 before.
  // r2: the boot widens with the calf it sits under. `footOverAnkle` caught the pair moving apart
  // on the first attempt and refused the build, which is the contract doing its job — a shin that
  // thickens under a boot that does not leaves a trouser hem breaking over nothing.
  foot: Object.freeze({ length: 0.1340 * T, width: 0.0980 * T, height: Y.ankle, heel: 0.0430 * T }),
  // Fist mass past the wrist. "The arm ends rather than becoming a hand" was the third blind
  // read; the hand must be clearly wider and deeper than the wrist it hangs off (1.48× width).
  hand: Object.freeze({ length: 0.0800 * T, width: 0.0860 * T, depth: 0.0640 * T }),
  // 0.30 m on the r01 figure. The one length in this table that was never restated as a fraction
  // of stature, so it is carried across by `FIGURE_SCALE` rather than left behind at twice the
  // neck a 1.84 m figure has.
  neck: Object.freeze({ length: 0.30 * FIGURE_SCALE, width: WIDTH.neck, depth: DEPTH.neck }),
  // Arm attachment: the deltoid seat. `(shoulder − top) / 2` puts the outer skin at the shoulder
  // half-span so the pair of arms makes the outline; the joint itself sits under the deltoid
  // shelf authored in `chestRings` (bury fraction there, not a second offset here).
  // r07 tried a 1.20× diameter bury on this seat and dropped the builder under MASS_REACH —
  // balloon dies on diameter + dome, not by collapsing the shoulder line.
  armOffsetX: (WIDTH.shoulder - ARM_TOP) * 0.5,
});

/**
 * Natural segment lengths, metres, at build 1.
 *
 * The convention the whole kit poses limbs by: a limb geometry is authored with **unit diameter
 * in X and Z** and its **length here in Y**, centred on its own origin. A poser that wants a
 * segment to span two solved joints writes
 * `scale = (diameter, |joint − joint| / natural, diameter)`, so the joints land exactly and the
 * segment stretches by nothing at rest. Thigh and shin share one geometry and therefore one
 * natural, which is why they are within a per cent of each other in the six-head layout.
 *
 * There is one of these tables. `rig.js` started r01 with a private copy in fractions of
 * `scale.y`, and the two conventions squashed every mass the solver touched until the lanes
 * converged on this one. Do not reintroduce a second copy.
 */
const NATURAL = Object.freeze({
  leg: (SEGMENT.thigh.length + SEGMENT.shin.length) * 0.5,
  thigh: (SEGMENT.thigh.length + SEGMENT.shin.length) * 0.5,
  shin: (SEGMENT.thigh.length + SEGMENT.shin.length) * 0.5,
  upperArm: SEGMENT.upperArm.length,
  forearm: SEGMENT.forearm.length,
  hand: SEGMENT.hand.length,
  neck: SEGMENT.neck.length,
});

/**
 * The geometry convention stamp.
 *
 * `figure.js` and `head.js` author in world metres about each part's own origin, with limb
 * segments in the `NATURAL` convention above. A pose solver that writes instance scales assuming
 * some other convention — unit boxes scaled by fractions of `scale.y`, say, which is what the
 * pre-r01 kit did — squashes every mass it touches. `index.js` checks for this stamp on a solved
 * pose before it trusts one, and falls back to the bind pose when it is absent, so a lane
 * mid-round cannot silently render a broken figure. A solver adopts by returning
 * `geometryContract: GEOMETRY_CONTRACT` on the pose object.
 */
export const GEOMETRY_CONTRACT = 'v332-r01-segment-metres';

/**
 * The neutral point of `cast.js`'s `ARCHETYPE_BUILD` parameter set. A figure built at these is
 * the shared base every width in `SPAN` / `LIMB` above is authored at; `cast.js` varies them per
 * archetype and geometry is never rebuilt for them, because mass is carried by the bind pose's
 * per-slot scales rather than by a second mesh.
 *
 * `weight` is a 0–1 knob on lane F's table, so its neutral point is `WEIGHT_MID`, not 1. The
 * legacy `shoulders` key is kept beside `shoulderSpan` because two callers still write it.
 */
export const WEIGHT_MID = 0.5;
export const DEFAULT_BUILD = Object.freeze({
  height: 1, girth: 1, shoulderSpan: 1, shoulders: 1, weight: WEIGHT_MID,
});

/**
 * Legacy descriptor scale. `castFigure` and `people.js` still hand the batch a
 * `(width, height, width)` vector whose height component is 1.55 for every human, because
 * `cast.js` is lane F and r01 does not edit it. `buildFromScale` normalises that tuple into
 * build multipliers around 1, so geometry authored in real metres survives either convention.
 */
export const BUILD_REFERENCE = Object.freeze({ height: 1.55, width: 1.0 });

/** `(width, height, width)` → `{ height, width }` multipliers around 1. */
export function buildFromScale(scale) {
  return {
    height: (scale?.y ?? BUILD_REFERENCE.height) / BUILD_REFERENCE.height,
    width: (scale?.x ?? BUILD_REFERENCE.width) / BUILD_REFERENCE.width,
  };
}

/**
 * Resolve an authored build into the per-slot mass multipliers the bind pose applies.
 *
 * Accepts `cast.js`'s published `ARCHETYPE_BUILD` record directly — `{ shoulderSpan, girth,
 * weight, posture, stance }` — as well as the older `{ girth, shoulders, weight }` shape, because
 * lane F publishes the first and this kit was written against the second.
 *
 * **Weight is a 0–1 knob in `ARCHETYPE_BUILD`, not a multiplier**, and reading it as one is how a
 * lean archetype would come out at a quarter of its own width. It is centred on `WEIGHT_MID` and
 * enters as a gain, so 0.5 is neutral, the builder's 0.88 adds mass and the architect's 0.26
 * takes it away.
 *
 * The distribution is the point, and it is what separates a heavy builder from a scaled-up
 * architect: weight thickens the trunk most, the limbs about half as much, and the head barely at
 * all. A head that grows with the body is a giant, not a heavy man.
 */
export function resolveBuild(params = DEFAULT_BUILD) {
  const p = params ?? DEFAULT_BUILD;
  const girth = p.girth ?? 1;
  const shoulderSpan = p.shoulderSpan ?? p.shoulders ?? 1;
  const mass = 1 + ((p.weight ?? WEIGHT_MID) - WEIGHT_MID) * 0.45;
  const trunk = girth * mass;
  return Object.freeze({
    // **No `height` here, deliberately.** `cast.js` `buildFor()` carries a raw stature (1.52 for
    // the builder) in that key while everything else on the record is a multiplier around 1, so
    // a caller that spread this object into a scale would stretch a figure fifty per cent. Height
    // comes from `buildFromScale` and is guarded by `assertSixHeads`; mass is not height.
    trunk,
    /**
     * Where the arm hangs, laterally. **Girth drives this, not shoulder span alone**, and that is
     * the whole reason the reference builder is the widest figure in his pack: a heavy man's arms
     * are pushed outboard by the torso they hang beside, and his elbows never come back to the
     * waist. Lane F's `shoulderSpan` puts the rival developer's deltoids wider than the builder's,
     * which is right for a shoulder line and wrong for a silhouette.
     */
    armSeat: shoulderSpan * 0.42 + trunk * 0.58,
    shoulders: shoulderSpan * (1 + (mass - 1) * 0.55),
    limb: 1 + (girth - 1) * 0.62 + (mass - 1) * 0.55,
    /** Hands and boots. They grow with a build, but far less than the limb above them does. */
    hand: 1 + (girth - 1) * 0.35 + (mass - 1) * 0.30,
    foot: 1 + (girth - 1) * 0.30 + (mass - 1) * 0.26,
    /** A heavy man has the same head as a lean one. This stays near 1 on purpose. */
    head: 1 + (mass - 1) * 0.12,
    stance: p.stance ?? 1,
  });
}

// ——— the mass contract ————————————————————————————————————————————————————————————————
//
// The girth equivalent of `HEAD_COUNT`. Each entry is a ratio the built figure has to satisfy at
// build 1, and `assertMassContract()` proves every one of them at import. A lane that thins a
// limb, flattens a trunk or narrows a shoulder line fails on load rather than four rounds later
// on a plate somebody has to matte.
//
// `min` is a floor and `is` an exact value; both are stated in the same units as the ratio they
// govern, so nothing here needs a second table to be read against.
export const MASS_CONTRACT = Object.freeze({
  /** Deltoid-to-deltoid over crown-to-sole. The single number the blind pairs sorted on. */
  shoulderForHeight: Object.freeze({ is: SPAN.shoulder, tol: 1e-9 }),
  /** Trunk depth over trunk breadth. Below 0.70 a chest is a plank at three-quarters. */
  chestSection: Object.freeze({ min: 0.70 }),
  waistSection: Object.freeze({ min: 0.72 }),
  /** §2.1's outline passages, as ratios rather than as an eyeball. */
  shoulderOverWaist: Object.freeze({ min: 1.55 }),
  chestOverWaist: Object.freeze({ min: 1.16 }),
  hipOverWaist: Object.freeze({ min: 1.12 }),
  /** The three reads the blind critics named, each now a floor. */
  // 1.50 until r2, and the plate refutes it exactly as it refuted the 1.61 leg taper. Measured
  // off `mp-cheap-builder.png` the reference arm runs about 1.18 — its forearm is nearly as thick
  // as its upper arm, which is what a forearm carrying a hammer looks like. The floor exists to
  // stop the pre-r04 one-tube-with-a-kink, not to manufacture a taper the register does not have.
  upperArmOverForearm: Object.freeze({ min: 1.30 }),
  // Floored at 1.34 rather than higher on purpose: the reference itself runs 1.22, and a floor
  // above the plate is a brief being delivered absolutely (§7 rule 1). It exists to stop the
  // pre-r04 sausage, not to manufacture a taper the register does not have.
  thighOverCalf: Object.freeze({ min: 1.25 }),
  handOverWrist: Object.freeze({ min: 1.22 }),
  /** A boot has to be wider than the shin inside it or the trouser hem breaks over nothing. */
  footOverAnkle: Object.freeze({ min: 1.10 }),
  /** The legs live inside the hips; a thigh outboard of the hip mass is a hinge, not a joint. */
  thighInsideHip: Object.freeze({ min: 1.02 }),
});

/** Mid-segment diameter — what a critic reads off a limb, rather than either joint alone. */
const mid = (seg) => (seg.top + seg.bottom) * 0.5;

/**
 * Every ratio `MASS_CONTRACT` governs, measured off the tables above rather than restated.
 * Exported so the probe, the ledger and the round report all read one number.
 */
export function massRatios(p = null) {
  const width = p?.width ?? WIDTH;
  const depth = p?.depth ?? DEPTH;
  const seg = p?.segment ?? SEGMENT;
  const height = p?.height ?? T;
  return {
    shoulderForHeight: width.shoulder / height,
    chestSection: depth.chest / width.chest,
    waistSection: depth.waist / width.waist,
    shoulderOverWaist: width.shoulder / width.waist,
    chestOverWaist: width.chest / width.waist,
    hipOverWaist: width.hip / width.waist,
    upperArmOverForearm: mid(seg.upperArm) / mid(seg.forearm),
    thighOverCalf: mid(seg.thigh) / mid(seg.shin),
    handOverWrist: seg.hand.width / seg.forearm.bottom,
    footOverAnkle: seg.foot.width / seg.shin.bottom,
    thighInsideHip: (width.hip * 0.5) / (seg.thigh.offsetX + seg.thigh.top * 0.5),
  };
}

/**
 * Prove the girth ratios rather than assert them in a comment. Called at import, beside
 * `assertSixHeads()`, and for the same reason: mass drifted for three rounds because nothing
 * could fail when it did.
 */
export function assertMassContract(p = null) {
  const measured = massRatios(p);
  for (const [key, rule] of Object.entries(MASS_CONTRACT)) {
    const value = measured[key];
    if (value === undefined) throw new Error(`people/core.js: mass contract has no measure for "${key}"`);
    if (rule.is !== undefined && Math.abs(value - rule.is) > (rule.tol ?? 1e-9)) {
      throw new Error(
        `people/core.js: mass contract "${key}" is ${value.toFixed(4)}, contract is ${rule.is}`,
      );
    }
    if (rule.min !== undefined && value < rule.min) {
      throw new Error(
        `people/core.js: mass contract "${key}" is ${value.toFixed(3)}, floor is ${rule.min}. `
        + 'Girth is the dimension five blind pairs sorted on; widening a limb is not optional.',
      );
    }
  }
  return true;
}

export const PROPORTIONS = Object.freeze({
  headCount: HEAD_COUNT,
  /** Crown-to-sole, metres, at build 1. */
  height: T,
  /** Crown-to-chin. `height / headHeight === headCount` by construction. */
  headHeight: H,
  headWidth: WIDTH.head,
  headDepth: DEPTH.head,
  y: Y,
  width: WIDTH,
  depth: DEPTH,
  /** The girth contract in its authored form: breadths and sections as fractions of stature. */
  span: SPAN,
  section: SECTION,
  limb: LIMB,
  segment: SEGMENT,
  natural: NATURAL,
  contract: GEOMETRY_CONTRACT,
  build: DEFAULT_BUILD,
  /** The ground puddle's radius. 0.86 m on the r01 figure, and a decal is figure-sized. */
  contactR: 0.86 * FIGURE_SCALE,

  // ——— legacy keys ————————————————————————————————————————————————————————————————————
  // `rig.js` (lane D) is another seat's file this round and still reads these three. They keep
  // their published meaning so an unmodified rig imports and runs; the segmented contract above
  // is what r01 geometry is built to.
  // `actors.js` still states this as the pre-programme placeholder's 0.05 m, which was a bob on a
  // 2 m token; it is a figure metre and it moves with the figure.
  walkBobMetres: PARTY_ANIMALS.walkBobMetres * FIGURE_SCALE,
  shoulderGeomHalfW: SEGMENT.armOffsetX,
  shoulderScaleX: 1,
  headR: H * 0.5,
});

/**
 * `PROPORTIONS` as the kit was authored: the same figure, restated at `AUTHORED_STATURE`.
 *
 * **`wardrobe.js` is the only caller and this exists for one reason.** That file states its own
 * convention as "offsets and sizes are metres at build 1", and about two thirds of its numbers
 * honour it by reading `PROPORTIONS` while the rest — a hat brim, a toolbag, a lapel's own
 * thickness, the clearance a sleeve keeps off an arm — are authored metres straight off the r02–r05
 * plates. Moving stature scales the first kind and strands the second, which the g03 drift probe
 * measured at 766 stranded values across the eleven kits: a 400 mm hard hat on a 307 mm head.
 *
 * Rather than hand-convert two hundred literals, lane C now authors entirely in r01 metres — both
 * kinds agree again — and `piece()` scales its output once, at the single funnel every garment
 * leaves through. The wardrobe a seat reads is the wardrobe r05 signed, number for number.
 *
 * Only the metric keys move. `span`, `section`, `limb` and `build` are fractions and ratios, and
 * scaling them would be the exact mistake the `SPAN` block above documents.
 */
const restated = (node, k) => Object.freeze(Object.fromEntries(
  Object.entries(node).map(([key, value]) => [
    key, typeof value === 'number' ? value * k : restated(value, k),
  ]),
));
const UNSCALE = AUTHORED_STATURE / T;
export const AUTHORED_PROPORTIONS = Object.freeze({
  ...PROPORTIONS,
  height: AUTHORED_STATURE,
  headHeight: PROPORTIONS.headHeight * UNSCALE,
  headWidth: PROPORTIONS.headWidth * UNSCALE,
  headDepth: PROPORTIONS.headDepth * UNSCALE,
  y: restated(PROPORTIONS.y, UNSCALE),
  width: restated(PROPORTIONS.width, UNSCALE),
  depth: restated(PROPORTIONS.depth, UNSCALE),
  segment: restated(PROPORTIONS.segment, UNSCALE),
  natural: restated(PROPORTIONS.natural, UNSCALE),
  contactR: PROPORTIONS.contactR * UNSCALE,
  walkBobMetres: PROPORTIONS.walkBobMetres * UNSCALE,
  shoulderGeomHalfW: PROPORTIONS.shoulderGeomHalfW * UNSCALE,
  headR: PROPORTIONS.headR * UNSCALE,
});

/**
 * Prove the ratio rather than assert it in a comment. Called at import: a lane that edits a
 * height, an altitude table or the head count and breaks six heads fails on load rather than on
 * a plate somebody has to measure.
 */
export function assertSixHeads(p = PROPORTIONS) {
  const measured = p.height / p.headHeight;
  if (Math.abs(measured - HEAD_COUNT) > 1e-9) {
    throw new Error(`people/core.js: figure is ${measured.toFixed(3)} heads, contract is ${HEAD_COUNT}`);
  }
  if (Math.abs((p.y.crown - p.y.chin) - p.headHeight) > 1e-9) {
    throw new Error('people/core.js: crown − chin is not one head');
  }
  return true;
}
assertSixHeads();
assertMassContract();

// ——— shared surface primitives ——————————————————————————————————————————————————————————
//
// Both geometry lanes want the same thing: a closed solid swept through a stack of elliptical
// rings. A torso is four rings, a limb is a shaft with a dome at each end, a jaw is a wedge of
// three. Box primitives cannot make any of them read soft at board altitude, and a lane that
// reaches for `BoxGeometry` is the reason the r01 figure was a domino on a block.

/**
 * A closed solid through a stack of elliptical rings, bottom to top.
 *
 * A ring may carry `x` / `z` offsets, which is what lets a jaw run forward as it drops and a nose
 * project past the cheek without a second merge.
 *
 * @param {{ y:number, w:number, d:number, x?:number, z?:number }[]} rings full widths, bottom → top
 * @param {number} radialSegments points around each ring
 * @param {{ capBottom?:boolean, capTop?:boolean }} caps flat fans; omit where a dome closes it
 */
export function profileSolid(rings, radialSegments = 12, { capBottom = true, capTop = true } = {}) {
  const seg = Math.max(3, Math.round(radialSegments));
  const position = [];
  const uv = [];
  const index = [];
  const ringStart = [];
  const last = rings.length - 1;

  for (let r = 0; r <= last; r += 1) {
    const ring = rings[r];
    ringStart.push(position.length / 3);
    const ox = ring.x ?? 0;
    const oz = ring.z ?? 0;
    for (let s = 0; s < seg; s += 1) {
      const t = (s / seg) * Math.PI * 2;
      position.push(ox + Math.cos(t) * ring.w * 0.5, ring.y, oz + Math.sin(t) * ring.d * 0.5);
      uv.push(s / seg, last === 0 ? 0 : r / last);
    }
  }
  for (let r = 0; r < last; r += 1) {
    const a = ringStart[r];
    const b = ringStart[r + 1];
    for (let s = 0; s < seg; s += 1) {
      const n = (s + 1) % seg;
      index.push(a + s, b + s, b + n, a + s, b + n, a + n);
    }
  }
  if (capBottom) {
    const centre = position.length / 3;
    position.push(rings[0].x ?? 0, rings[0].y, rings[0].z ?? 0);
    uv.push(0.5, 0);
    const a = ringStart[0];
    for (let s = 0; s < seg; s += 1) index.push(centre, a + s, a + ((s + 1) % seg));
  }
  if (capTop) {
    const centre = position.length / 3;
    position.push(rings[last].x ?? 0, rings[last].y, rings[last].z ?? 0);
    uv.push(0.5, 1);
    const b = ringStart[last];
    for (let s = 0; s < seg; s += 1) index.push(centre, b + ((s + 1) % seg), b + s);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Rings following a quarter ellipse, for closing a profile with a dome instead of a flat disc.
 * `direction` is +1 for a cap above `y`, −1 for one below. Returned bottom → top either way, so
 * the caller concatenates without reordering.
 */
export function domeRings(y, w, d, rise, direction = 1, steps = 3) {
  const out = [];
  for (let i = 1; i <= steps; i += 1) {
    const a = (i / steps) * (Math.PI * 0.5);
    out.push({
      y: y + direction * Math.sin(a) * rise,
      w: w * Math.cos(a),
      d: d * Math.cos(a),
    });
  }
  return direction > 0 ? out : out.reverse();
}

/**
 * A limb segment: a tapered shaft between two joints, closed with a dome at each end.
 *
 * The shaft spans exactly `length` and is centred on the origin, so the rig can set instance
 * scale y to the joint-to-joint distance and the joints land where the skeleton says. `capRise`
 * is a fraction of that same length rather than of the radius, for the same reason: the instance
 * scale is (thickness, length, thickness), so a rise expressed in radii is stretched by the
 * length and a thigh ends up half a metre past its own knee. That was the r01 first-pass defect.
 *
 * The domes overhang the joints on purpose. When the rig bends a knee the two balls stay
 * intersected and the joint reads as a joint instead of as a gap.
 */
export function capsuleSolid({
  length = 1, top, bottom, capRise = 0.21, radialSegments = 10, capSteps = 3,
}) {
  const half = length * 0.5;
  const riseTop = capRise * length;
  const riseBottom = riseTop * (bottom / top);
  const rings = [
    ...domeRings(-half, bottom, bottom, riseBottom, -1, capSteps),
    { y: -half, w: bottom, d: bottom },
    { y: half, w: top, d: top },
    ...domeRings(half, top, top, riseTop, 1, capSteps),
  ];
  return profileSolid(rings, radialSegments, { capBottom: false, capTop: false });
}

export function geometryTriangles(geometry) {
  return geometry.index
    ? geometry.index.count / 3
    : geometry.attributes.position.count / 3;
}

export function instanced(geometry, material, capacity, name, { castShadow = false, receiveShadow = false } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = name;
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

/**
 * Merge a list of authored geometries into one buffer and dispose the sources.
 *
 * Non-indexed first, because `mergeGeometries` refuses a mixed set. `fallback` is returned when
 * the merge fails, which it does only on an empty list.
 */
export function mergeParts(geometries, fallback = null) {
  const prepared = geometries.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(prepared, false);
  for (const g of geometries) g.dispose();
  return merged ?? fallback;
}

/** A Part collector: `{ geometry, material }[]` with a push that names the geometry. */
export function partCollector() {
  return {
    parts: [],
    push(geometry, material = null, name = null) {
      if (!geometry) return this;
      if (name) geometry.name = name;
      this.parts.push({ geometry, material });
      return this;
    },
  };
}

/**
 * Append what a component produced to a collector. Accepts a single Part, an array of Parts, or
 * a bundle keyed by material family. Returns how many parts landed.
 *
 * **This is the only `emit` in the kit.** V3.32 §5.
 */
export function emit(collector, produced) {
  if (!produced || !collector) return 0;
  const push = (part) => {
    if (!part?.geometry) return 0;
    collector.push(part.geometry, part.material ?? null);
    return 1;
  };
  if (Array.isArray(produced)) {
    let n = 0;
    for (const part of produced) n += push(part);
    return n;
  }
  if (produced.geometry) return push(produced);
  let n = 0;
  for (const key of Object.keys(produced)) {
    const list = produced[key];
    if (!list) continue;
    if (Array.isArray(list)) for (const part of list) n += push(part);
    else n += push(list);
  }
  return n;
}
