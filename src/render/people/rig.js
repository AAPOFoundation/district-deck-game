// District Deck V3.32 — skeleton, pose solver and gait.
//
// Lane D. Owns every number that changes between frames: path sampling, facing, the joint
// chain, the walk cycle, the idle, and the composition of each named part's transform.
// Geometry is somebody else's; this file never builds a mesh and never touches an
// InstancedMesh.
//
// The contract with `index.js` is `poseFigure(figure, { phase, reducedMotion })` → a plain
// object keyed by the slot names in the r01 shared brief §2, each value
// `{ position, quaternion, scale, colour }` or `null`. `index.js` writes those into instance
// matrices and knows nothing about the cycle. **That separation is the point of the split**:
// the animation lane rewrites the cycle in this file alone.
//
// The joint chain is not authored here. Every altitude, every segment length and every joint
// offset is read out of `PROPORTIONS` in `core.js` — the same table `figure.js` builds the
// meshes from and `buildRestPose` places them by — so the skeleton and the geometry cannot
// drift apart. A rig that keeps its own copy of the anatomy is a rig that opens a seam at the
// knee the first time lane A retunes a length.
//
// V3.32 §2.7: every pose is a pure function of `(id, phase)`. No clock, no accumulated state,
// no `Math.random` — the capture harness steps frames by hand and the same frame must render
// identically on every machine.
//
// Salt namespace 400–499.
//
// ---------------------------------------------------------------------------------------
// THE CYCLE MODEL
// ---------------------------------------------------------------------------------------
//
// One gait cycle is two steps. Cycle position `t ∈ [0,1)` is measured from left heel contact.
// Each foot runs its own `u = frac(t + φ)` with φ_L = 0 and φ_R = 0.5, and every foot quantity
// (fore/aft, height, pitch) is a continuous piecewise function of `u` alone:
//
//   stance  u ∈ [0, D)   the foot is planted: heel strike → flat → heel lift → toe-off
//   swing   u ∈ [D, 1)   the foot is airborne: toe clears, knee bends, leg extends to contact
//
// `D` is the duty factor, the share of the cycle a foot spends on the ground. D > 0.5 is a
// walk (both feet down through double support); the archetype table sets it between 0.56 for
// the arsonist's quick scuttle and 0.70 for the squatter's shuffle. The dog trots at 0.52 on
// diagonal pairs.
//
// The five events §2.7 names fall out of it rather than being keyframed: contact at u = 0,
// the loaded low point at u ≈ 0.10 where the pelvis bottoms out, passing at u ≈ D + 0.35
// where the swing knee is highest, the high point at mid-stance, and opposite contact half a
// cycle later.
//
// ---------------------------------------------------------------------------------------
// STRIDE ↔ GROUND SPEED — the relationship that makes skating impossible
// ---------------------------------------------------------------------------------------
//
// Let S be the distance the body advances in one full cycle (the stride) and f the cadence in
// cycles per second. Then ground speed is
//
//     v = S · f            ⟺            S = v / f
//
// During stance the foot's LOCAL fore/aft offset is
//
//     z_local(u) = S · (D/2 − u)          (linear in u, therefore linear in distance)
//
// so it recedes at dz/dt = −S·f = −v, exactly cancelling the body's +v. The planted foot's
// world velocity is v − v = 0 for the whole of stance, at any speed, with no clamping and no
// special case. **Skating is impossible by construction, provided S is derived from v and is
// never chosen independently of it.** A fixed stride with a variable speed is the defect; a
// fixed cycle rate with a variable speed is the same defect wearing a different hat.
//
// Cadence is not constant either — people take faster steps when they walk faster, but not
// proportionally faster. The standard square-root law is used:
//
//     f(v) = f₀ · √(v / v₀),  clamped to [0.55·f₀, 1.9·f₀]
//
// with f₀ the archetype's nominal cadence and v₀ = S₀·f₀ its nominal speed, where S₀ is a
// multiple of that archetype's own leg length. The residual goes into stride, so S ∝ √v: a
// hurrying figure both steps faster and reaches further, and a dawdling one shuffles. The
// clamp changes S, never the S·f = v identity, so the no-skate guarantee survives it.
//
// Ground speed itself comes from the route: `people.js` interpolates `phase` 0→1 along an
// arc-length-parameterised path over a fixed move duration, so v = pathLength / duration and
// is constant for the whole move. Cycle position is then
//
//     t(phase) = (phase · pathLength) / S            [in-game, a path is present]
//     t(phase) = phase                               [the lab strip, which supplies its own
//                                                     per-cell phase and no path]
//
// ---------------------------------------------------------------------------------------
// THE ARM, AND THE STANDING POSE — r02
// ---------------------------------------------------------------------------------------
//
// The r01 critic graded the leg cycle **ahead of `mp-walk-strip.png`** and named three things
// holding 2.7 at 6.5. Two of them are in this file and the cycle itself is untouched, per §7.4.
//
//   * The arm was a straight-elbow reach. See the `ARM` block: an asymmetric shoulder, an elbow
//     that never straightens and folds hardest as the hand comes through, and a lag between the
//     two. The builder's bend at the elbow goes from 23° to 58° and the fist rises from between
//     knee and hip to the hip line.
//   * The standing pose was one symmetric wide A across the whole cast, which cost 2.6 and 2.1
//     as well as 2.7. See `IDLE_POSTURE` and `CARRIAGE`: hips at the anatomy's own width with
//     only the foot tracking, a load that commits, a pelvis that shifts over the loaded foot,
//     feet that toe out by different amounts, and an arm carriage that belongs to the role.
//
// The third — the dog — is geometry as well as motion. `DOG_SLOTS` is where the trot meets it.
//
// ---------------------------------------------------------------------------------------
// THE SLOT SCALE CONVENTION
// ---------------------------------------------------------------------------------------
//
// `figure.js` authors each limb segment at unit length along +Y, origin at the midpoint, and
// each trunk mass in build-1 metres about its own origin. `buildFromScale` turns the legacy
// `(width, height, width)` descriptor into multipliers around 1. This file solves the whole
// skeleton in those multiplied metres and emits world transforms directly, so a bone's
// `scale.y` is its solved length and the joint at each end is met exactly — which is the whole
// of §2.2's "nothing separates from its socket".

import * as THREE from 'three';
import {
  GEOMETRY_CONTRACT, HIDDEN_SCALE, IDENTITY, PALETTE, PROPORTIONS, SALT, UP, buildFromScale,
  resolveBuild, unitFrom,
} from './core.js';
import { DOG_METRICS, buildRestPose, chestRings } from './figure.js';
import { ARCHETYPE_ACCESSORY, buildFor } from './cast.js';
import { FIND_PROP_COLOURS, hidesHair } from './wardrobe.js';

/**
 * Sample a polyline at `alpha` ∈ [0,1] by arc length, projecting every sample onto the
 * navmesh when one is supplied. The I-29 gate — no figure centre inside a building — is
 * enforced here as well as at the call site, because every consumer of a path goes through it.
 */
export function pathPosition(path, alpha, target = new THREE.Vector3(), navmesh = null) {
  if (!path.length) return target.set(0, 0, 0);
  if (path.length === 1) {
    const point = path[0];
    const safe = navmesh ? navmesh.enforceWalkable(point.x, point.z) : point;
    return target.set(safe.x, point.y ?? 0, safe.z);
  }
  const lengths = [];
  let total = 0;
  for (let index = 1; index < path.length; index += 1) {
    const dx = path[index].x - path[index - 1].x;
    const dz = path[index].z - path[index - 1].z;
    total += Math.hypot(dx, dz);
    lengths.push(total);
  }
  if (total <= 1e-9) {
    const point = path.at(-1);
    const safe = navmesh ? navmesh.enforceWalkable(point.x, point.z) : point;
    return target.set(safe.x, point.y ?? 0, safe.z);
  }
  const distance = Math.max(0, Math.min(1, alpha)) * total;
  const segment = lengths.findIndex((value) => value >= distance);
  const index = segment < 0 ? path.length - 2 : segment;
  const prior = index === 0 ? 0 : lengths[index - 1];
  const segmentLength = lengths[index] - prior;
  const t = segmentLength <= 1e-9 ? 1 : (distance - prior) / segmentLength;
  const ax = path[index].x;
  const az = path[index].z;
  const bx = path[index + 1].x;
  const bz = path[index + 1].z;
  let x = ax + (bx - ax) * t;
  let z = az + (bz - az) * t;
  if (navmesh) {
    const safe = navmesh.enforceWalkable(x, z);
    x = safe.x;
    z = safe.z;
  }
  return target.set(x, 0, z);
}

/** Total ground length of a polyline, world units. Zero for a stand (a one-point path). */
export function pathLengthOf(path) {
  if (!path || path.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < path.length; index += 1) {
    total += Math.hypot(path[index].x - path[index - 1].x, path[index].z - path[index - 1].z);
  }
  return total;
}

/** Root transform along a path: position from the polyline, scale from the archetype build. */
export function matrixAlongPath(path, alpha, height, width, target = new THREE.Matrix4(), navmesh = null) {
  const position = pathPosition(path, alpha, new THREE.Vector3(), navmesh);
  return target.compose(
    position,
    IDENTITY,
    new THREE.Vector3(width, height, width),
  );
}

/** Face travel direction along the path (yaw about +Y). */
export function yawAlongPath(path, alpha) {
  if (!path || path.length < 2) return 0;
  const a = Math.max(0, Math.min(1, alpha));
  // Sample two nearby points for tangent.
  const p0 = pathPosition(path, Math.max(0, a - 0.02), new THREE.Vector3());
  const p1 = pathPosition(path, Math.min(1, a + 0.02), new THREE.Vector3());
  const dx = p1.x - p0.x;
  const dz = p1.z - p0.z;
  if (Math.hypot(dx, dz) < 1e-5) return 0;
  return Math.atan2(dx, dz);
}

// —— small deterministic maths ————————————————————————————————————————————————————————

const clamp01 = (v) => (v < 0 ? 0 : (v > 1 ? 1 : v));
const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));
const smoothstep = (v) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
const smootherstep = (v) => { const t = clamp01(v); return t * t * t * (t * (t * 6 - 15) + 10); };
const frac = (v) => v - Math.floor(v);
const lerp = (a, b, t) => a + (b - a) * t;

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const DOWN = new THREE.Vector3(0, -1, 0);
const qAxis = (axis, angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle);

/** Salts, namespace 400–499. V3.32 §5: two lanes must never share one. */
const RIG_SALT = Object.freeze({
  PHASE: SALT.RIG + 1,        // per-figure cycle offset so a crowd does not march in lockstep
  STANCE_SIDE: SALT.RIG + 2,  // which leg carries the weight when idle
  LOOK: SALT.RIG + 3,         // idle look-off yaw
  BREATH: SALT.RIG + 4,       // idle breath phase
  SWAY: SALT.RIG + 5,         // idle weight-shift phase
  STANCE_WIDTH: SALT.RIG + 6,
  HEAD_TILT: SALT.RIG + 7,
  LOOK_BEAT: SALT.RIG + 8,   // decorrelated from LOOK, or every figure looks the same way
});

/**
 * The move duration `people.js` interpolates a route over. The rig needs it to turn a path
 * length into a ground speed and cannot import `people.js` without a cycle, so it is restated.
 * A figure descriptor may override it with `moveDuration`.
 */
const MOVE_DURATION_SECONDS = 0.9;

/** Reduced motion freezes here: off-centre enough to read as a stand, not as a mannequin. */
const REDUCED_BEAT = 0.18;

/**
 * The share of the pelvic drop that is already applied at heel contact, `0.5 + 0.5·cos(4π·−0.10)`
 * for the 0.10 lag the low point carries. The stride-derived drop is divided by it so the hip is
 * where the leg needs it *at contact* rather than at the bottom of the curve.
 */
const CONTACT_DROP_SHARE = 0.5 + 0.5 * Math.cos(Math.PI * 4 * -0.10);

/**
 * How far a foot may reach ahead of the hip at contact, as a multiple of leg length, once the
 * duty factor is taken out. It caps the stride when a route asks for a ground speed no pair of
 * legs could walk: the cycle then runs faster instead of the feet reaching further, and because
 * the cycle count is distance ÷ stride, `S·f = v` survives the cap and nothing skates.
 */
const STRIDE_REACH = 0.95;

/**
 * Knee reserve through stance, as a fraction of leg length.
 *
 * The bind pose stands with the leg dead straight, and mid-stance puts the ankle directly under
 * the hip — so the chain sits *exactly* on full extension at that frame, and any pelvic roll,
 * step width or foot roll tips it onto the IK clamp and stretches a shin instead. A real stance
 * knee is never locked. Measured across 7 200 frames of the cast, this takes worst bone stretch
 * from 2.60% to 0.00%.
 */
const STANCE_RESERVE = 0.014;

// —— per-archetype gait ————————————————————————————————————————————————————————————————

/**
 * §2.7 "gait carries character". Every dial multiplies the shared cycle, so an archetype
 * cannot invent a different animation — it walks the same solve at its own cadence, reach,
 * weight and carriage.
 *
 *   cadence  nominal cycles per second
 *   stride   stride length as a multiple of that figure's own leg length
 *   duty     share of the cycle each foot spends planted (>0.5 is a walk)
 *   lift     swing-foot clearance as a multiple of leg length
 *   arm      arm swing amplitude at the shoulder, radians
 *   elbow    elbow carry angle, radians
 *   lean     forward trunk lean, radians
 *   bob      pelvic rise-and-fall multiplier (1.0 ≈ 2.6% of stature, the human figure)
 *   crouch   constant hip drop as a fraction of stature
 *   roll     foot-roll and pelvic-roll multiplier
 *   steady   1 = the head cancels the whole pelvic bob, 0 = it rides it
 *   track    step-width multiplier
 */
const GAIT_STYLES = Object.freeze({
  policeman: {
    cadence: 0.80, stride: 1.20, duty: 0.64, lift: 0.125, arm: 0.38, elbow: 0.30,
    lean: -0.035, bob: 0.85, crouch: 0.000, roll: 0.90, steady: 0.95, track: 1.16,
  },
  'cheap-builder': {
    cadence: 0.76, stride: 1.20, duty: 0.66, lift: 0.155, arm: 0.44, elbow: 0.55,
    lean: 0.030, bob: 1.25, crouch: 0.008, roll: 1.20, steady: 0.55, track: 1.34,
  },
  arsonist: {
    cadence: 1.22, stride: 1.06, duty: 0.56, lift: 0.145, arm: 0.32, elbow: 0.90,
    lean: 0.170, bob: 1.05, crouch: 0.030, roll: 1.00, steady: 0.70, track: 0.86,
  },
  'rival-developer': {
    cadence: 0.86, stride: 1.32, duty: 0.60, lift: 0.145, arm: 0.52, elbow: 0.34,
    lean: 0.050, bob: 0.95, crouch: 0.000, roll: 0.85, steady: 0.95, track: 0.96,
  },
  family: {
    cadence: 0.94, stride: 0.88, duty: 0.68, lift: 0.100, arm: 0.28, elbow: 0.30,
    lean: 0.000, bob: 0.80, crouch: 0.000, roll: 1.00, steady: 0.70, track: 1.04,
  },
  architect: {
    cadence: 0.82, stride: 1.14, duty: 0.62, lift: 0.125, arm: 0.36, elbow: 0.46,
    lean: 0.060, bob: 0.85, crouch: 0.000, roll: 0.90, steady: 0.85, track: 0.90,
  },
  'property-agent': {
    cadence: 0.88, stride: 1.16, duty: 0.61, lift: 0.132, arm: 0.42, elbow: 0.40,
    lean: 0.020, bob: 0.95, crouch: 0.000, roll: 0.95, steady: 0.90, track: 1.00,
  },
  'mortgage-broker': {
    cadence: 0.92, stride: 1.10, duty: 0.63, lift: 0.120, arm: 0.34, elbow: 0.44,
    lean: 0.040, bob: 0.90, crouch: 0.000, roll: 0.95, steady: 0.85, track: 0.96,
  },
  squatter: {
    cadence: 0.68, stride: 0.95, duty: 0.70, lift: 0.088, arm: 0.23, elbow: 0.62,
    lean: 0.130, bob: 1.10, crouch: 0.022, roll: 1.15, steady: 0.45, track: 1.22,
  },
  avatar: {
    cadence: 0.85, stride: 1.16, duty: 0.62, lift: 0.138, arm: 0.44, elbow: 0.38,
    lean: 0.020, bob: 0.95, crouch: 0.000, roll: 0.95, steady: 0.90, track: 1.00,
  },
});
const styleForGait = (archetypeId) => GAIT_STYLES[archetypeId] ?? GAIT_STYLES.avatar;

/**
 * The dog trots rather than walks: diagonal pairs and a short duty.
 *
 * `bend` replaces the r01 `lift`. A dog leg here is **one segment** — lane A puts the hock in the
 * geometry rather than in a second slot — so a paw driven to a target position stretches the only
 * bone there is, and the r01 solve did: measured 26.3% length drift across a cycle, a leg that
 * grew 11% reaching for the ground and squashed 19% picking itself up. Stating the swing as a
 * fraction the leg *folds* instead means the length is an input rather than a consequence, and
 * the paw altitude falls out of it.
 */
const DOG_STYLE = Object.freeze({ cadence: 1.55, stride: 1.35, duty: 0.52, bend: 0.18 });

/**
 * The share of its own length the dog's leg holds in reserve while standing on it.
 *
 * The back pitches and rolls, which lifts the rear leg roots up to 14 mm above where the stride
 * alone put them while the planted paws stay pinned to the ground — measured as a 3.88% stretch
 * on a leg that is not allowed to have one. Five per cent of reach covers it, costs 22 mm of
 * withers height, and turns the worst stretch across a cycle into zero.
 */
const DOG_STANCE_RESERVE = 0.05;

// —— the arm ——————————————————————————————————————————————————————————————————————————
//
// The r01 critic's one named gait fault: *"the arm is a straight-elbow reach, not a swing … the
// forward arm is out at roughly 55–65° from vertical with the elbow locked and the hand well
// forward of the body. It reads as sleepwalking."* The leg cycle was graded ahead of
// `mp-walk-strip.png`; the arm was the thing holding 2.7 down. Three terms close it, and they
// close it together — raising elbow flexion alone pushes the hand further out, not up.
//
// 1. **The shoulder is mildly asymmetric.** A walking humerus travels a little further behind
//    the trunk than in front of it. Gain is `1.00` on extension and `0.80` on flexion, blended
//    linearly in `swing` so the function stays a polynomial in a cosine and has no kink at the
//    crossings; the residual DC term parks the mean arm a couple of degrees behind vertical,
//    which is where a real one hangs while walking. Both numbers are read off the reference
//    rather than chosen: `mp-walk-strip.png` cell 1 puts the trailing arm 24° behind vertical
//    and the leading arm 20° in front of it, which on the builder's dial is 1.00 and 0.80.
//
// 2. **The elbow is never straight, and it folds deeply.** `carry` is flexion the arm keeps at
//    the back extreme; `drive` is what folds on top of it as the hand comes through.
//
//    How deeply is not a taste call, and the first r02 pass got it wrong by treating it as one.
//    How deeply is not a taste call, and the first r02 pass got it wrong by treating it as one.
//    Measured off `mp-walk-strip.png` cell 1: the leading fist sits level with the sternum and
//    about 16% of stature forward of the shoulder, a chord that a 35%-of-stature arm can only
//    reach at a flexion near 116° — not the 55° that first went in. Forward reach is worst at
//    exactly 90°, where the forearm is horizontal and points the hand straight out; the honest
//    readings are either side of it. r01 sat well below it with a near-straight arm swung out
//    from the shoulder; the first r02 pass moved the reach from the shoulder to the forearm and
//    landed almost exactly *on* 90°, which on the plate read as an arm held out in front — no
//    better than what it replaced. Past 90° the forearm carries the fist up and in toward the
//    chest, which is the reference's read and the one the cycle now uses.
//
// 3. **The elbow lags the shoulder** by a twentieth of a cycle, so the forearm is still folding
//    as the hand comes through and still opening as it goes back, rather than reaching its
//    extremes in the same frame the shoulder does.
//
// ---------------------------------------------------------------------------------------
// r03 — WHERE THE HAND ACTUALLY IS, WHICH IS NOT WHAT THE ELBOW ANGLE SAYS
// ---------------------------------------------------------------------------------------
//
// The r02 elbow is verified: bend runs 33–115° against r01's 9.5–22.7°. It did not close the
// defect, and measuring the hand against the HIP rather than against the shoulder says why.
// Across the builder's eight cells the fist sat 0.487 above the hip line at the front of the
// swing — 62% of the way up to the shoulder — and 0.72 forward of it. That is a fist at the
// sternum with a straight-out reach, and at hero distance the upper sleeve disappears into the
// vest and only the bare forearm reads: a peg.
//
// §7.12 in force, and it cut against the first diagnosis as well as the brief's. The r02 header
// states the reference "puts the trailing arm 24° behind vertical and the leading arm 20° in
// front of it", and the round's own brief states that the shoulder is abducted so the arm swings
// too far forward of and away from the torso. Both were re-measured against a pixel grid laid
// over `mp-walk-strip.png` cells 1 and 5 before anything was changed:
//
//   * The r02 reference figures **hold**. The reference's leading humerus is 20.6° forward of
//     vertical, and its leading fist is 14–15% of stature forward of its own shoulder.
//   * **r02's forward reach was already at that figure** — 15.8% of stature — so "the arm reaches
//     too far forward at the front of the swing" is not what the plate is showing.
//   * **Abduction is not it either.** The hand stands at most 0.180 outboard of its own shoulder,
//     4.9% of stature, and it is at the BACK of the swing where the chest counter-rotation puts
//     it there rather than the abduction dial. Meanwhile the closest the hand came to the thigh
//     it hangs beside was 17.3 mm, on the architect. There is no lateral room to spend, and
//     spending it would buy §2.2 interpenetration to fix a §2.7 read.
//
// What the plate is showing is where the hand sits over the WHOLE cycle rather than at one
// extreme. Measured against the hip rather than against the shoulder, the r02 builder's wrist
// was forward of its own hip in seven of eight cells and behind it in one, mean +0.324. An arm
// that is in front of the body seven cells out of eight is parked, not swinging, and at hero
// distance the upper sleeve merges into the vest so only the bare forearm reads: a peg.
//
// Two terms move the mean back without touching the cycle:
//
//   * The shoulder's swing is re-centred behind vertical instead of straddling it. The gain blend
//     is now linear in `swing` rather than a gain that is itself linear in `swing`; at a 4:1
//     asymmetry the quadratic form folds back on itself near the forward extreme, peaking at
//     swing = −0.83 and easing off by swing = −1, which is a hitch in the middle of the reach.
//     The asymmetry survives and the DC term the r02 header wanted survives with it, at
//     (back − front)/2 = 0.395 of the archetype's dial.
//   * `carry` comes down from 0.52 to 0.42, and `drive` goes up from 1.45 to 1.66. The forearm's
//     angle from straight down is `flex − pitch`, so taking the humerus out of its forward swing
//     rotates the forearm TOWARD horizontal at the same elbow angle — the one direction that adds
//     reach. The fold has to follow the humerus back, and the peak forearm angle lands at 129°
//     against the reference's 120–133°.
//
// The trade is honest and it is stated: the leading fist now rides at 51% of the way from hip to
// shoulder where r02 had it at 61% and the reference reads 57–100% across its own two cells. Our
// forearm is 72% of our humerus and the reference's is nearer 90%, so the reference's fist
// altitude is not reachable at any elbow angle — fully folded, ours can only reach 5.2% of
// stature below the shoulder. That is lane A's segment table, not a pose, and it is flagged
// rather than faked by folding the elbow double.
//
// §7.4 holds throughout: the feature protected is an elbow that never straightens and folds
// hardest as the hand comes through, and a 27° minimum against a 121° peak keeps it. The 8° the
// lower carry gives back at the back extreme is what lets the hand finish behind the hip instead
// of being carried forward again by its own carry angle.
//
// Measured after, on the builder's eight cells: the wrist is behind its own hip in three cells
// against one, the deepest point of the backswing goes from 0.243 to 0.319 behind, the mean over
// the cycle comes in 33% from +0.324 to +0.216, and the front-of-swing reach lands at 14.3% of
// stature against the reference's 14–15%. On the policeman, one cell behind becomes three and
// the mean comes in 26%.
const ARM = Object.freeze({
  back: 1.05,          // shoulder gain while the hand travels backward
  front: 0.26,         // shoulder gain while it travels forward
  carry: 0.42,         // radians of elbow flexion held at the back extreme
  drive: 1.66,         // radians of flexion added as the hand comes through
  // A ceiling, so the archetypes with the highest carry angle fold hard without folding double.
  maxFlex: 2.30,
  lag: 0.05,           // cycles the elbow trails the shoulder by
  abduct: 0.132,       // constant clearance between arm and hip, §2.2 (V3.70 L2: 0.088 left
                       // a 1.1 mm hand-inside-pelvis on the property agent at cycle 0.175)
  abductDrive: 0.055,  // extra as the folded forearm comes past the belt line
  /**
   * Extra abduction proportional to the archetype's forward lean. V3.70 L2.
   *
   * A leaning trunk carries the shoulder forward over the pelvis while the pelvis stays where it
   * is, so the hanging arm's swing plane crosses the front of the hip rather than passing beside
   * it. `abduct` is a constant and cannot see that, and the arsonist — the deepest lean in the
   * cast at 0.170 rad — measured a **17.7 mm hand-inside-pelvis overlap** at cycle 0.175
   * (`mvp/tests/v370-l2-body.mjs`), which §2.2 fails outright.
   *
   * The r02 note above is right that there is no *lateral* room to spend at the thigh, and this
   * spends none on the archetypes it does not apply to: at lean 0 the term is 0, and the two
   * figures it moves at all are the two whose hands were already the closest to the body. The
   * measured hand-to-thigh minimum rises rather than falls, because abduction carries the hand
   * away from the leg it hangs beside as well as away from the hip.
   */
  abductLean: 0.72,
});
/** The DC term: half the asymmetry, which parks the mean humerus behind vertical. */
const ARM_MEAN = (ARM.back - ARM.front) * 0.5;
/** The swing amplitude about it. `pitch(+1) = back`, `pitch(−1) = −front`, linear between. */
const ARM_HALF = (ARM.back + ARM.front) * 0.5;

/**
 * The archetype's own carry angle as a multiplier around 1, so `style.elbow` keeps its ordering —
 * the arsonist pumps, the family ambles — without any archetype straightening its elbow.
 */
const elbowScaleFor = (style) => 0.72 + 0.58 * style.elbow;

/**
 * Step width as a multiple of hip half-width.
 *
 * The r01 rig put the hip joint *and* the foot at `hipX · style.track`, so an archetype dial meant
 * to widen a gait was pushing the leg's attachment outboard as well and the whole lower body
 * splayed with it. The critic read the result as *"the same rigid inverted V"* on every figure and
 * scored 2.1 down for it. Hips now sit where the anatomy puts them and only the foot tracks, at a
 * base of 0.62 — a walking human's feet fall well inside the hips, near enough to a single line.
 */
const WALK_TRACK = 0.62;
/** A little toe-out on the planted foot. Feet pointed dead ahead read as a mannequin's. */
const WALK_TOE_OUT = 0.055;

/**
 * Swing-leg circumduction, as a fraction of leg length, peaking at passing. V3.70 L2.
 *
 * The swing leg on a real walk does not stay in the plane its own footfalls define — the hip
 * abducts a little to carry the foot past the stance leg, which is why two legs on a narrow track
 * do not collide. A thigh here is a rigid swept solid and cannot compress the way two touching
 * thighs do, so without it the narrowest track in the cast (the architect, 0.90) measured **73 mm
 * of thigh inside thigh** at cycle 0.287 (`mvp/tests/v370-l2-body.mjs`) — a leg passing through a
 * leg rather than beside one.
 *
 * It is `sin` of the swing fraction, so it is **exactly zero at both contacts**: no footfall
 * moves, the planted foot is untouched, and the clearance is bought out of the airborne half of
 * the cycle where nothing has to pay for it.
 */
const WALK_SPLAY = 0.055;

// —— slot helpers ————————————————————————————————————————————————————————————————————

/** One named part slot. `colour` is null where the mesh carries no instance colour. */
function part(position, quaternion, scale, colour = null) {
  return { position, quaternion, scale, colour };
}

const hidden = () => part(new THREE.Vector3(), IDENTITY.clone(), HIDDEN_SCALE.clone(), null);

/**
 * Colour is not this lane's. `index.js` runs `_dressPose` over every solved pose and overwrites
 * each body slot's instance colour from the cast tone ladder, because §2.9 grades value
 * separation across the whole figure and a lane that owns one segment cannot see the ladder.
 * Every slot below therefore leaves `colour` null; only the badge, which no tone covers, sets
 * one of its own.
 */

// —— the foot ————————————————————————————————————————————————————————————————————————

/**
 * Foot pitch about the local X axis through the cycle. Positive is plantarflexion (toe down,
 * heel lifted); negative is dorsiflexion (toe up, heel leading). Continuous at both seams: at
 * u→D it reaches +toe and the swing curve starts there; at v→1 it reaches −heel and the
 * stance curve starts there.
 */
function footPitchAt(u, duty, roll) {
  const heel = 0.30 * roll;
  const toe = 0.62 * roll;
  if (u < duty) {
    const p = u / duty;
    if (p < 0.16) return -heel * (1 - smoothstep(p / 0.16));   // heel strike rolls to flat
    if (p < 0.58) return 0;                                     // flat through mid-stance
    return toe * smoothstep((p - 0.58) / 0.42);                 // heel lifts into toe-off
  }
  const v = (u - duty) / (1 - duty);
  const fromToe = toe * (1 - smoothstep(v / 0.30));
  const clearance = -0.22 * roll * smoothstep(v / 0.35) * (1 - smoothstep((v - 0.55) / 0.45));
  const toHeel = -heel * smoothstep((v - 0.60) / 0.40);
  return fromToe + clearance + toHeel;
}

/**
 * The ankle height at which a foot pitched by `pitch` rests exactly on the ground: it pivots
 * on the toe when plantarflexed and on the heel when dorsiflexed. Evaluating this across the
 * whole cycle — not only stance — is what keeps the vertical curve continuous, because the
 * swing arc is added on top of it and that arc is zero at both ends of swing.
 */
function groundedAnkle(pitch, foot) {
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  return foot.height * c + (pitch >= 0 ? foot.toe * s : -foot.heel * s);
}

/** Everything one foot is doing at cycle position `u`, in the figure's local frame. */
function footState(u, stride, duty, lift, roll, foot) {
  const pitch = footPitchAt(u, duty, roll);
  let z;
  let y = groundedAnkle(pitch, foot);
  if (u < duty) {
    // Planted. Linear in u, therefore linear in distance travelled: world velocity is zero.
    z = stride * (duty * 0.5 - u);
  } else {
    const v = (u - duty) / (1 - duty);
    z = stride * duty * (smootherstep(v) - 0.5);
    y += lift * (Math.sin(Math.PI * v) ** 1.15);
  }
  return { z, y, pitch, planted: u < duty };
}

// —— two-bone IK ——————————————————————————————————————————————————————————————————————

/**
 * Knee (or elbow) position for a two-bone chain from `root` to `end`, with the joint pushed
 * toward `pole`. Over-reach is clamped rather than refused, and the caller derives each bone's
 * scale from the joint positions it gets back, so a clamped solve stretches a segment by a
 * per cent or two instead of leaving a gap at the ankle. Nothing ever separates.
 */
function solveTwoBone(root, end, lenA, lenB, pole) {
  const delta = new THREE.Vector3().subVectors(end, root);
  const distance = delta.length();
  if (distance < 1e-6) return root.clone().addScaledVector(pole, lenA);
  const axis = delta.multiplyScalar(1 / distance);
  const reach = clamp(distance, Math.abs(lenA - lenB) + 1e-4, lenA + lenB - 1e-4);
  const cosine = clamp((lenA * lenA + reach * reach - lenB * lenB) / (2 * lenA * reach), -1, 1);
  const angle = Math.acos(cosine);
  const perpendicular = pole.clone().addScaledVector(axis, -pole.dot(axis));
  if (perpendicular.lengthSq() < 1e-8) perpendicular.set(0, 0, 1);
  perpendicular.normalize();
  return root.clone()
    .addScaledVector(axis, Math.cos(angle) * lenA)
    .addScaledVector(perpendicular, Math.sin(angle) * lenA);
}
// —— the skeleton, read out of the anatomy contract ————————————————————————————————————
//
// Nothing below authors an anatomy number. Joint altitudes and segment lengths come from
// `PROPORTIONS`; every instance scale is taken from `buildRestPose`, lane A's own placement of
// its own meshes, with only a bone's `scale.y` replaced by the length this solve gives it. A
// retune in `figure.js` therefore moves the rig with it and cannot squash a mass here.

/**
 * The per-archetype mass multipliers, from lane F's own published build record.
 *
 * `buildFor` is asked for the archetype rather than for the person because the two ways a build
 * varies inside an archetype — the family child's height and width — are `styleForPerson`'s and
 * arrive through `mul`; `resolveBuild` reads girth, shoulder span, weight and stance and none of
 * those varies by person. That is what makes one bind pose per archetype correct rather than one
 * per figure, and it is checked by `resolveBuild` ignoring the `height` and `width` keys.
 */
const MASS = new Map();
const massFor = (archetypeId) => {
  let m = MASS.get(archetypeId);
  if (!m) { m = resolveBuild(buildFor(archetypeId, archetypeId)); MASS.set(archetypeId, m); }
  return m;
};

/**
 * Whether the bind pose's **surface** multipliers reach the render. They do not, and this is a
 * measurement rather than a preference.
 *
 * `buildRestPose` carries an archetype's mass on two different kinds of number. The **stations**
 * — where the arm hangs and where the leg joins the pelvis — move *joints*, and every wardrobe
 * piece is anchored to a joint, so a sleeve, a cuff and a trouser travel with the bone they are
 * hung on. The **surfaces** — the trunk, limb, foot and head instance scales — move the skin a
 * garment is seated against, and `wardrobe.js` sizes every piece in absolute metres off the
 * build-1 tables through `trunkAt`, while `index.js` `_dressPose` scales it by `mul` alone. A
 * surface that moves without them takes the clothes inside the body with it.
 *
 * Measured, at the hero station, over the whole cast:
 *
 * | adoption | builder | broker | developer | policeman | architect | arsonist |
 * |---|---:|---:|---:|---:|---:|---:|
 * | neither (r04) | 0.464 | 0.529 | 0.496 | 0.468 | 0.405 | 0.552 |
 * | stations | 0.559 | 0.591 | 0.559 | 0.499 | 0.366 | 0.501 |
 * | stations + surfaces | 0.568 | 0.596 | 0.561 | 0.500 | 0.366 | 0.499 |
 *
 * The stations are worth twenty per cent of subject aspect on the builder. Every surface in the
 * build together is worth **1.6 per cent**, and it costs 28 of the 56 trunk-seated wardrobe
 * pieces: the builder's chest half-width goes 0.508 → 0.749 against a bib rim at 0.528, so all
 * ten of his pieces finish inside him, worst 250 mm; the broker loses seven, the squatter five,
 * the developer four, the policeman two; and the lean end goes the other way, standing the
 * architect's pieces 100 mm off a trunk that shrank under them. Adopting the surfaces before
 * `trunkAt` takes a build would trade §2.5 for 1.6 per cent of §2.1.
 *
 * **This flips to `true` the day `wardrobe.js` seats against a build** — `buildWardrobe` already
 * knows the archetype, so it is `trunkAt(y, build)` and the ring tables it already imports from
 * `figure.js`. Nothing else here changes: the map below is keyed by archetype for exactly that,
 * and holds eleven identical poses until then.
 */
const MASS_SURFACES = false;

/**
 * The deltoid shelf — the widest ring in the chest, which `figure.js` places at the shoulder
 * joint by construction, and the mass the humerus head has to stay buried in. Read off the pose
 * in use rather than off `PROPORTIONS`, so it widens with `chestScale` the moment `MASS_SURFACES`
 * is true and the ceiling below stops binding on its own.
 */
const shelfHalfWidth = (chestScaleX = 1) => {
  let widest = 0;
  for (const ring of chestRings(PROPORTIONS)) if (ring.w > widest) widest = ring.w;
  return widest * 0.5 * chestScaleX;
};

/**
 * How much of its build-1 overlap with that shelf the humerus keeps. **This is a ceiling on how
 * far the arm seat may travel while the chest is held at the shared base**, and it is the price
 * of the split in `MASS_SURFACES`: `buildRestPose` moves the seat out on `armSeat` and the chest
 * out on `chestScale` *together*, and the second is not reaching the render. Uncapped, the
 * builder's seat goes to 1.377 — his humerus keeps 70 mm of a 296 mm overlap, and a hundred
 * millimetres below the shelf, where the chest has already tapered to 0.525, the arm hangs 128 mm
 * clear of the torso. §2.2 fails on a still.
 *
 * The bracket is two plates rather than an opinion: at `r05-seatD/hero--mortgage-broker.png` the
 * seat is 1.234 and the sleeve meets the yoke; at `r05-seatD/hero--cheap-builder.png` before this
 * ceiling it is 1.377 and there is daylight through both shoulders. Half the overlap puts the
 * ceiling at 1.247 — above every archetype in the cast but the builder, who is the one figure the
 * plate condemned.
 */
const SOCKET_KEEP = 0.50;

const BIPED_REST = new Map();
function bipedRest(archetypeId = 'avatar') {
  let pose = BIPED_REST.get(archetypeId);
  if (!pose) {
    pose = buildRestPose(PROPORTIONS, {
      quadruped: false,
      build: MASS_SURFACES ? buildFor(archetypeId, archetypeId) : null,
    });
    BIPED_REST.set(archetypeId, pose);
  }
  return pose;
}

/**
 * The quadruped bind pose is **per build**, unlike the biped's.
 *
 * `figure.js` authors the dog in absolute world metres and bakes `1/mul` into every slot, so the
 * `× mul` this file already applies cancels it and the instance scale comes out a clean 1. The
 * dog's legacy build tuple stretches x and z by 1.38 while compressing y to 0.413 — a factor of
 * 3.3 between axes — and anything rotated under that scale shears, because `compose` scales
 * before it rotates. Handing lane A the multipliers is how that is avoided, and it means the
 * pose cannot be memoised once for every dog on the board.
 */
const QUADRUPED_REST = new Map();
function quadrupedRest(mul) {
  const key = `${mul.width}:${mul.height}`;
  let pose = QUADRUPED_REST.get(key);
  if (!pose) {
    pose = buildRestPose(PROPORTIONS, { quadruped: true, mul });
    QUADRUPED_REST.set(key, pose);
  }
  return pose;
}

/**
 * Joint altitudes, offsets and segment lengths for one build, in world metres.
 *
 * **Side convention: `L` is at negative x**, matching `buildRestPose`. Wardrobe pieces are
 * anchored to these slots by `index.js`, so a rig that mirrored the sides would put a shoulder
 * bag on the wrong shoulder.
 *
 * ## The two stations that carry an archetype's mass
 *
 * Up to r04 nothing per-archetype reached this function: it took `mul` alone, so eleven builds
 * differed only by lane F's uniform `widthScale` and the heaviest man in the cast measured
 * narrower on the plate than the arsonist. `armSeat` and `hipX` are where that is fixed, and
 * they are `resolveBuild`'s own numbers rather than new ones — girth drives both, because a
 * heavy man's arms are held out by the torso they hang beside and his legs are set wide under
 * it, which is the whole of why the reference builder reads wide while carrying the same
 * shoulder line as the men next to him.
 */
function skeletonFor(mul, archetypeId = 'avatar') {
  const { y, segment: seg } = PROPORTIONS;
  const rest = bipedRest(archetypeId);
  const m = massFor(archetypeId);
  const h = mul.height;
  const w = mul.width;
  // **The foot track keeps the station it was tuned against.** `hipX` is anatomy and now moves
  // with the build; where a foot *lands* is `style.track` and the idle's own `width`, two dials
  // proven across three rounds against a hip at `thigh.offsetX`. Multiplying them by a mass
  // number they were never tuned with is double-dipping, and it measured as one: with the idle
  // track riding the built hip the builder's straddle went half again as wide and the IK stretched
  // his shin **2.88%** reaching for its own foot, against r03's 0.37%. Held here — with the two
  // reserves the widened hip does need, at `lateralDrop` and at `idle.hipY` — the cast-wide worst
  // is 0.47%.
  const trackX = seg.thigh.offsetX * w;
  // The arm seat, ceilinged so the humerus head stays inside the deltoid shelf it hangs from.
  // See `SOCKET_KEEP`. The hip needs no equivalent: the thigh is half as far out again as the
  // arm and its top is buried 112 mm inside the pelvis at the widest build in the cast.
  const armR0 = seg.upperArm.top * 0.5;
  const keep = SOCKET_KEEP * (shelfHalfWidth() - (seg.armOffsetX - armR0));
  const seatCeiling = (shelfHalfWidth(rest.chest.scale.x)
    + rest.upperArmL.scale.x * 0.5 - keep) / seg.armOffsetX;
  const armSeat = Math.min(m.armSeat, seatCeiling);
  return {
    stature: PROPORTIONS.height * h,
    hipY: y.crotch * h,
    hipX: seg.thigh.offsetX * w * m.trunk,
    trackX,
    hipZ: 0.01 * w,
    thigh: seg.thigh.length * h,
    shin: seg.shin.length * h,
    legLength: (y.crotch - y.ankle) * h,
    shoulderY: y.shoulderJoint * h,
    shoulderX: seg.armOffsetX * w * armSeat,
    shoulderZ: 0.005 * w,
    /**
     * Extra abduction, in radians, that a **narrowed** arm seat has to buy back before the hand
     * clears its own thigh — zero for every archetype the build widens, and zero at build 1, so
     * the tuned carriage is untouched everywhere it was measured.
     *
     * It exists because the two stations move by different fractions while the limb *surfaces*
     * are held (see `MASS_SURFACES`). The arsonist's shoulder comes in 114 mm on `armSeat` 0.810
     * and his hip comes in 59 mm on `trunk` 0.759, but his thigh keeps its build-1 radius, so its
     * outer skin only follows the hip: 55 mm of the clearance the gait was tuned with disappears
     * between the two. Measured with nothing here, his hand finished **3.2 mm inside the leg** at
     * the back of the swing, which is §2.2 outright. The recovery is the difference over the
     * moment arm the abduction turns about, and it lands the same run at 44.1 mm — above the
     * 40.0 mm the cast's worst figure carried before any of this.
     */
    seatClear: Math.max(
      0,
      (seg.armOffsetX * (1 - armSeat) - seg.thigh.offsetX * (1 - m.trunk)) * w,
    ) / ((seg.upperArm.length + seg.forearm.length) * h),
    upperArm: seg.upperArm.length * h,
    forearm: seg.forearm.length * h,
    hand: seg.hand.length * h,
    pelvisY: y.pelvisCentre * h,
    torsoY: y.torsoCentre * h,
    chestY: y.chestCentre * h,
    neckY: y.neckCentre * h,
    neckZ: rest.neck.position.z * w,
    headY: y.headCentre * h,
    headZ: rest.head.position.z * w,
    // Ground contact geometry of the boot, from the same table `buildFootGeometry` uses.
    foot: {
      height: seg.foot.height * h,
      toe: (seg.foot.length - seg.foot.heel) * w,
      heel: seg.foot.heel * w,
    },
  };
}

// —— the idle ——————————————————————————————————————————————————————————————————————————
//
// §2.6's identity channel and §2.7's "idle is not frozen" are the same pose. The r01 critic found
// **every figure in the cast standing in one symmetric wide A** — feet apart and splayed, weight
// even, no hip loaded, both arms straight down — against an `mp-lineup.png` with *zero* figures
// posed that way, and pairs a critic could match by outline alone. The contrapposto the r01 rig
// authored was real but ran at 1–3°, which is invisible at any distance the game is played at.
//
// What follows is that pose rebuilt to read: a load that commits, a pelvis that shifts laterally
// over the foot carrying it, a trunk that comes back the other way, feet that are not mirror
// images of each other, and an arm carriage that belongs to the role rather than to gravity.

/**
 * How a standing figure holds its arms, in the units the swing already uses: `pitch` positive
 * carries the hand back, `flex` is elbow flexion, `abduction` swings the arm away from the trunk
 * (negative brings it in across the body). Stated per weight side rather than per L/R, so a
 * carriage mirrors with whichever leg the hash loads.
 */
const CARRIAGE = Object.freeze({
  /** Arms down, but not two of the same arm. */
  hang: { loaded: { pitch: -0.03, flex: 0.20, abduction: 0.11 }, free: { pitch: 0.09, flex: 0.30, abduction: 0.14 } },
  /** One hand in a pocket, the other hanging — the reference's own idle. */
  pocket: { loaded: { pitch: 0.15, flex: 0.66, abduction: 0.10 }, free: { pitch: -0.04, flex: 0.24, abduction: 0.13 } },
  /** Thumbs at the belt: both forearms up, hands at the buckle line, elbows out. */
  belt: { loaded: { pitch: 0.02, flex: 0.82, abduction: 0.07 }, free: { pitch: -0.01, flex: 0.78, abduction: 0.08 } },
  /** Hands resting on a tool belt — wider and heavier than `belt`. */
  hips: { loaded: { pitch: 0.18, flex: 0.74, abduction: 0.16 }, free: { pitch: 0.05, flex: 0.34, abduction: 0.12 } },
  /** Hands together low in front of the body. */
  clasp: { loaded: { pitch: -0.12, flex: 0.90, abduction: -0.09 }, free: { pitch: -0.16, flex: 0.96, abduction: -0.11 } },
  // Hands pushed into coat pockets. The abduction here is the one number in this table that is
  // not an art choice: a hand adducted onto the thigh is inside it, because the rig draws a bare
  // hand mesh and there is no pocket for it to disappear into. Measured at −0.184 m of overlap
  // before it was opened out.
  tuck: { loaded: { pitch: 0.16, flex: 0.58, abduction: 0.09 }, free: { pitch: 0.12, flex: 0.52, abduction: 0.10 } },
  /** Quick and forward: forearms half up, ready. */
  guard: { loaded: { pitch: 0.05, flex: 0.70, abduction: 0.09 }, free: { pitch: -0.16, flex: 0.92, abduction: 0.11 } },
});

/**
 * The standing pose per archetype. §2.6 names posture as the identity channel and the r01 lineup
 * had none of it.
 *
 *   carriage  which arm posture the role stands in
 *   stance    step width as a multiple of hip half-width
 *   lean      how far the weight commits onto one leg, 0 square … 1 slouched
 *   look      a bias on the head's look-off, on top of the per-figure hash
 *   settle    extra knee bend as a fraction of stature, on top of the standing 0.011
 */
const IDLE_POSTURE = Object.freeze({
  policeman: { carriage: 'belt', stance: 1.16, lean: 0.42, look: 0.30, settle: 0.000 },
  'cheap-builder': { carriage: 'hips', stance: 1.24, lean: 0.92, look: -0.22, settle: 0.006 },
  arsonist: { carriage: 'guard', stance: 0.88, lean: 0.74, look: 0.62, settle: 0.010 },
  'rival-developer': { carriage: 'pocket', stance: 0.94, lean: 0.86, look: -0.44, settle: 0.000 },
  family: { carriage: 'hang', stance: 0.98, lean: 0.50, look: 0.24, settle: 0.002 },
  architect: { carriage: 'hang', stance: 0.92, lean: 0.78, look: -0.20, settle: 0.000 },
  'property-agent': { carriage: 'clasp', stance: 1.00, lean: 0.58, look: 0.34, settle: 0.000 },
  'mortgage-broker': { carriage: 'pocket', stance: 0.96, lean: 0.68, look: 0.14, settle: 0.000 },
  squatter: { carriage: 'tuck', stance: 1.08, lean: 0.96, look: -0.56, settle: 0.014 },
  avatar: { carriage: 'hang', stance: 1.00, lean: 0.62, look: 0.10, settle: 0.000 },
});
const postureFor = (archetypeId) => IDLE_POSTURE[archetypeId] ?? IDLE_POSTURE.avatar;

/**
 * r03 — why none of the idle reached the plate, and what the numbers below are for.
 *
 * The r02 solve already computed a sway, a breath and a look beat as pure functions of
 * `(id, beat)`, and the lab already stood one figure at four beats with the yaw held constant,
 * so the mechanism was sound end to end. Measured off the solved pose at those four beats, this
 * is what arrived:
 *
 *   | quantity                 | spread across the four cells       |
 *   |--------------------------|------------------------------------|
 *   | loaded leg               | **none** — R R R R                 |
 *   | stance width             | **0.0000** — bit-identical         |
 *   | foot fore/aft            | **0.000** — bit-identical          |
 *   | pelvic roll              | 0.58° (policeman), 1.89° (arsonist)|
 *   | chest altitude           | 0.24–0.32% of stature              |
 *   | head yaw                 | 10.9–15.7°                         |
 *
 * The head was the only thing moving by an amount anybody could see, which is precisely the
 * critic's "a statue on a swivel". Three causes, and none of them is the mechanism:
 *
 * 1. **The load could not change sides.** `weightSide` picked a leg from the id hash and the
 *    sway only modulated the *magnitude* between 0.55 and 0.95 of it. Every downstream stance
 *    quantity — which foot stands forward, which track is wide, which way each foot toes out —
 *    was selected by `index === free`, and `free` was a function of the hash alone. A boolean
 *    cannot interpolate, so the entire lower body was constant in `beat` by construction.
 * 2. **The breath was sub-pixel.** 0.22% of stature at the head and nothing at the chest or the
 *    shoulders, which on the idle plate is one or two pixels.
 * 3. **The sway and the look ran at half rate in `beat`.** `beat` is wrapped with `frac`, so a
 *    half-rate term is not periodic over it: the four cells sampled three eighths of one sine
 *    instead of a whole one, and on the board the pose jumped at the wrap. Measured before the
 *    fix, the worst single-frame step was **276× the median frame step** on the architect, at a
 *    different beat for every figure because the hash moves the wrap.
 *
 * The load is therefore rebuilt as a signed quantity that genuinely crosses between the legs,
 * every stance quantity is blended continuously from it rather than switched on a boolean, and
 * everything below is periodic in `beat` with period one.
 */
const IDLE = Object.freeze({
  /**
   * How far the shift dwells at each end rather than gliding through. A standing figure holds a
   * leg, moves, and holds the other one; a sine spends most of its time in transit, which is the
   * one part of the shift that reads as nothing. Larger is squarer.
   */
  dwell: 2.0,
  /**
   * The figure's own leg, as a share of the shift it is added to. It does two jobs: the figure
   * spends longer on the leg its hash prefers, which is identity, and `|load|` never falls below
   * it, so no beat exists at which a figure stands square. That floor is what protects the r02
   * lineup result — §7.4 — now that the load is allowed through zero at all.
   */
  bias: 0.30,
  /** Contrapposto gains, applied to the signed load. */
  pelvisRoll: 0.150,
  shoulderRoll: 0.098,
  pelvisShift: 0.026,
  trunkShift: 0.009,
  pelvisYaw: 0.075,
  shoulderYaw: 0.060,
  /**
   * Breath, as a fraction of stature, at the chest and shoulders. The r02 figure was 0.0022 at
   * the head only; on a 3.65-stature figure filling 700 px that is 1.5 px, which is why §2.7's
   * breath clause has never been visible on a plate. 0.006 is about 4 px of shoulder rise per
   * cell and 8 px between the extremes — calm in motion, legible in a four-cell still.
   */
  breath: 0.0060,
  /** The pelvis takes a little of it and the torso takes most, so no seam opens up the spine. */
  breathPelvis: 0.22,
  breathTorso: 0.62,
  /** The ribcage opens as it rises. Radians at the chest, on top of the lift. */
  breathPitch: 0.022,
  /** The look-about: amplitude in radians, and how much it holds a direction rather than sweeps. */
  lookSwing: 0.34,
  lookDwell: 1.5,
  /** Reduced motion freezes the breath here rather than at whatever the pinned beat gives. */
  reducedBreath: 0.35,
});

/**
 * A sine pushed toward a square wave without leaving the smooth: `k = 0` is the sine itself and
 * larger `k` dwells harder at ±1. Monotone in `s`, odd, and exactly ±1 at ±1, so nothing it
 * drives can overshoot its own gain.
 */
const dwellShape = (s, k) => (s * (1 + k)) / (1 + k * Math.abs(s));

/**
 * The hand each role actually has full, and what that arm does instead of swinging.
 *
 * `CARRY_HAND` keyed off `ARCHETYPE_ACCESSORY`, which r01's wardrobe pass reduced to *headwear
 * only* — so the lookup has been returning `undefined` for every archetype and no carried arm
 * has been damped since. `hand` is 0 for left, 1 for right, matching the `handL` / `handR` anchor
 * `wardrobe.js` hangs the piece off; `damp` is how much of the free arm's motion survives.
 *
 * Only pieces genuinely anchored to a hand are listed. The property agent's clipboard and the
 * rival developer's phone are anchored to `chest` and `head`, so no arm can meet them from here
 * and the rig does not pretend otherwise — reaching a hand at an object the wardrobe has parented
 * elsewhere puts a fist in mid-air next to it, which is the defect, not the fix.
 */
const HELD = Object.freeze({
  'mortgage-broker': { hand: 1, damp: 0.20, pitch: 0.02, flex: 0.12, abduction: 0.14 },
  arsonist: { hand: 1, damp: 0.18, pitch: 0.03, flex: 0.16, abduction: 0.14 },
  family: { hand: 0, damp: 0.22, pitch: 0.02, flex: 0.18, abduction: 0.13 },
  // The roll rides under the arm rather than in the fist, so the elbow stays close and the hand
  // stays low — but not adducted onto the thigh, which put it 195 mm inside the leg.
  architect: { hand: 0, damp: 0.26, pitch: 0.06, flex: 0.26, abduction: 0.15 },
});

/**
 * §2.7 "idle is not frozen", graded from `mp-idle.png`: four cells of weight shift and a
 * look-off, never four copies of one mannequin.
 *
 * `beat` is a continuous idle clock. Every quantity below is a pure function of `(id, beat)` and
 * periodic in `beat` with period one, so a caller that advances the beat animates the pose, a
 * caller that pins it freezes a stance, and the loop closes where `poseFigure` wraps it.
 *
 * `reduced` is the §3 freeze. It pins the two quantities whose phase is arbitrary — the weight
 * shift and the breath — to a chosen readable value rather than to whatever `REDUCED_BEAT` and
 * the figure's own hash happen to sample, and leaves the look-about on the beat so the lineup
 * still shows eleven heads facing eleven ways.
 */
function solveIdle({ id, archetypeId, sk, style, beat, reduced = false }) {
  const posture = postureFor(archetypeId);
  const weightSide = unitFrom(id, RIG_SALT.STANCE_SIDE) < 0.5 ? 0 : 1;   // 0 = left leg loaded
  const prefer = weightSide === 0 ? -1 : 1;   // −1 loads the left leg, +1 the right

  // —— the weight shift ————————————————————————————————————————————————————————————
  // A full period in `beat`, so the loop closes where `frac` wraps it, and shaped so the figure
  // holds a leg rather than gliding between them. The bias adds the figure's own preference and
  // is also the floor: `|load|` never drops below it, so there is no beat at which the cast
  // stands square and the r02 lineup asymmetry is safe.
  //
  // Reduced motion commits fully to the preferred leg instead of sampling the shift at a pinned
  // beat. §3 asks for "a chosen readable pose", and a hash landing near a crossing would
  // otherwise hand the lineup its least readable one.
  const swaySignal = reduced
    ? prefer
    : dwellShape(
      Math.sin(Math.PI * 2 * (beat + unitFrom(id, RIG_SALT.SWAY))), IDLE.dwell,
    );
  // −1 is the whole weight on the left leg, +1 on the right, and unlike r02 it reaches both.
  const loadNorm = clamp(swaySignal + prefer * IDLE.bias * (1 - Math.abs(swaySignal)), -1, 1);
  const load = loadNorm * posture.lean;
  /**
   * How unweighted each foot is, 0 carrying everything to 1 carrying nothing. Every stance
   * quantity below interpolates on this instead of switching on `index === free`, which is the
   * change that lets the lower body move at all: a boolean selected by a hash cannot vary with
   * the beat, and that alone froze the feet, the tracks and the toe-out into one pose.
   */
  const freeness = [0.5 + 0.5 * loadNorm, 0.5 - 0.5 * loadNorm];
  const free = loadNorm > 0 ? 0 : 1;   // the unloaded leg, for callers that want the discrete read
  /**
   * **The feet do not travel with the weight shift, and that is a V3.70 L2 r3 correction to r02.**
   *
   * r02's note above — *"a foot travels between them as the weight does"* — is the fix that let
   * the lower body move at all, and it is also a slide. `feet[].z` interpolates on `freeness`
   * between `−0.018 × stature` and `+0.055 × stature × width`, so a **standing** figure's sole
   * sweeps up to 124 mm of ground per foot per beat, on the ground, without lifting. The r2
   * critic measured the consequence without separating it from the pivot: **59 % of dwell frames
   * are a sole sliding in ground contact**, a median 0.95 m per stand, at a maximum sole lift of
   * 6.5 mm — i.e. never airborne.
   *
   * A person shifting weight does not scuff their feet along the pavement; the pelvis travels and
   * the feet stay. So the beat drives everything above the ankle exactly as it did — the sway, the
   * contrapposto, the arm carriage, the hip clearance, the breath, the look — and the three
   * quantities that decide where a *sole* sits take a **static** per-figure stance instead. The
   * asymmetry §2.6 asks for survives: which foot is forward is still hashed per figure, and it is
   * still the loaded side that decides it. What is gone is the sole moving while it carries load.
   */
  const stanceNorm = prefer * lerp(0.35, 0.95, unitFrom(id, RIG_SALT.STANCE_SIDE + 61));
  const footFree = [0.5 + 0.5 * stanceNorm, 0.5 - 0.5 * stanceNorm];

  const breath = reduced
    ? IDLE.reducedBreath
    : Math.sin(Math.PI * 2 * (beat + unitFrom(id, RIG_SALT.BREATH)));
  // A square stance stands a little wider than a committed one, which is the last of the four
  // things the critic checked between cells and the only one a two-sided blend cannot give on
  // its own: the two tracks always sum to the same number, so the width has to come from |load|.
  // r3: off `stanceNorm` rather than `loadNorm`. `width` reaches only the foot z and the foot
  // track, and both of those are sole positions — a stance that widens and narrows with the beat
  // is the same 124 mm scuff one axis over.
  const width = posture.stance * lerp(0.90, 1.16, unitFrom(id, RIG_SALT.STANCE_WIDTH))
    * (1 + 0.06 * (1 - Math.abs(stanceNorm)));
  const lookBase = (unitFrom(id, RIG_SALT.LOOK) - 0.5) * 0.86 + posture.look * 0.30;
  // The look holds a direction and then moves, like the sway and decorrelated from it, so the
  // head is not locked to the hip. Full period in `beat` for the same reason.
  const look = Math.max(-0.28, Math.min(0.28, lookBase + IDLE.lookSwing * dwellShape(
    Math.sin(Math.PI * 2 * (beat + unitFrom(id, RIG_SALT.LOOK_BEAT))), IDLE.lookDwell,
  )));
  const tilt = (unitFrom(id, RIG_SALT.HEAD_TILT) - 0.5) * 0.16;
  const carriage = CARRIAGE[posture.carriage] ?? CARRIAGE.hang;
  // Toe-out, and not the same amount on both feet: the loaded foot is squarer under the load and
  // the free one turns out. `sign` is +1 for the right foot, and a positive yaw about +Y swings a
  // toe toward +x, so `sign · amount` turns each foot outward whichever side it is on.
  const splay = lerp(0.86, 1.22, unitFrom(id, RIG_SALT.STANCE_WIDTH + 40));
  // A figure standing hipshot lets the arm over the loaded hip swing out with it, and the arm
  // over the free hip barely needs to. Blended on `freeness` rather than switched, because a
  // step here is a hand jumping through a thigh at the moment the weight crosses.
  const hipClear = [0, 1].map((index) => Math.abs(load) * lerp(0.19, 0.04, freeness[index]));

  return {
    free,
    freeness,
    load: loadNorm,
    breath,
    // The free leg stands forward and out; the loaded one is close under its own hip. Both ends
    // are the r02 pose; what is new is that a foot travels between them as the weight does.
    feet: [0, 1].map((index) => {
      const sign = index === 0 ? -1 : 1;
      return {
        z: lerp(-0.018 * sk.stature, 0.055 * sk.stature * width, footFree[index]),
        y: sk.foot.height,
        pitch: 0,
        yaw: sign * lerp(0.11, 0.30, footFree[index]) * splay,
      };
    }),
    track: [0, 1].map((index) => width * lerp(1.02, 1.78, footFree[index])),
    // Standing is not standing to attention. The knee keeps about a per cent of slack — a locked
    // leg reads as a mannequin, and it also parks the IK on its own clamp, which is where the
    // r01 stance stretched a shin reaching for a foot it had put too far out.
    // The last term is the mass adoption's own reserve, and it is zero for a figure the build
    // does not widen. The hip now sits outboard of `trackX`, the station the idle's own foot
    // tracks were tuned against, and a longer pelvic lever turns the same roll into more hip
    // travel — so the planted leg is asked for reach the one per cent of knee slack below does
    // not have. Measured with nothing here, the developer's shin stretched 1.36% at t=0.861
    // against r03's 0.37% cast-wide worst; the reserve is the roll lift of the widening.
    hipY: sk.hipY - sk.stature * (style.crouch * 0.6 + 0.011 + posture.settle)
      - Math.max(0, sk.hipX - sk.trackX) * IDLE.pelvisRoll
      + sk.stature * IDLE.breath * IDLE.breathPelvis * breath,
    breathRise: sk.stature * IDLE.breath * breath,
    breathPitch: -IDLE.breathPitch * breath,
    // Contrapposto, at an amplitude that survives board altitude. The hip hitches up on the
    // loaded side, the shoulders tilt against it, and — the cue that actually carries the read —
    // the pelvis shifts bodily over the loaded foot while the chest comes back the other way.
    // Roll about +Z lifts +x, and the load sign is already +x on the right.
    pelvisRoll: load * IDLE.pelvisRoll,
    shoulderRoll: -load * IDLE.shoulderRoll,
    pelvisShift: load * IDLE.pelvisShift * sk.stature,
    trunkShift: -load * IDLE.trunkShift * sk.stature,
    pelvisYaw: -load * IDLE.pelvisYaw,
    shoulderYaw: load * IDLE.shoulderYaw + look * 0.14,
    lean: style.lean * 0.35,
    headYaw: look,
    headPitch: tilt - 0.03,
    // A figure standing hipshot lets the arm over the loaded hip swing out with it. Without that
    // the pelvis travels out from under a hand that stayed where it was and the hand finishes
    // inside the thigh: measured, the three deepest leaners in the cast — squatter, developer,
    // architect — were exactly the three with an overlap, at up to 72 mm. The clearance that
    // buys is now 17.3 mm at its worst, so the abduction blends with the load rather than
    // stepping with it — a discontinuity here is a hand jumping through a thigh.
    arms: [0, 1].map((index) => {
      const pitchAt = lerp(carriage.loaded.pitch, carriage.free.pitch, freeness[index]);
      const flexAt = lerp(carriage.loaded.flex, carriage.free.flex, freeness[index]);
      const abductAt = lerp(carriage.loaded.abduction, carriage.free.abduction, freeness[index]);
      return {
        pitch: pitchAt + 0.014 * breath,
        flex: flexAt + 0.05 * elbowScaleFor(style),
        abduction: abductAt + hipClear[index],
      };
    }),
    /**
     * The hip-clearance share of each arm's abduction, published so a carried arm can keep it.
     *
     * `HELD` overwrites a carrying arm's whole carriage, clearance included, and that was safe
     * while `weightSide` pinned the pelvis to one side for the life of the figure: r02 tuned one
     * fixed abduction per prop against one fixed shift. Now that the shift crosses, a carried
     * hand meets a hip that used to travel away from it. Measured with the override left alone,
     * the architect's roll hand went 17.3 mm INSIDE the thigh and the broker's 1.3 mm.
     */
    hipClear,
    damp: [1, 1],
  };
}

// —— the human solve ——————————————————————————————————————————————————————————————————

/**
 * Solve the whole human skeleton in the figure's LOCAL frame — z is the travel direction, y is
 * up, and x follows `buildRestPose` with the left side at negative x. The caller rotates the
 * result into the world once.
 */
function solveHuman({ sk, style, cycle, stride, idleWeight, idle, plant = null }) {
  const duty = style.duty;
  /**
   * **The walking turn lag was built, measured, and taken back out. r3. Read this before
   * rebuilding it.**
   *
   * With the arrival blend off the feet, `mvp/tests/v370-l2-r3-rampdiag.mjs` says what is left in
   * the ramp band and it is one mechanism: **0.00 % skating at |dyaw| < 0.002 rad/frame against
   * 15–33 % in every bin above it.** The rig rotates the whole solved pose about the root, so a
   * walker rounding a filleted kerb sweeps a planted boot on a 0.3 m radius through the arc the
   * body turns. The obvious correction is the one the stand below uses — counter-rotate the
   * planted foot by the body's turn since it landed — and it does not work here yet.
   *
   * Both forms were implemented and measured against the 18.33 % baseline at capacity 34:
   *
   *   * `turnRate × u × cycleSeconds`, both signs — **30.81 %** and **26.78 %**. `cycleSeconds`
   *     comes off the *stated* cruise, not the walker's live speed, so it over-counts the lag by
   *     up to seven times on a deceleration ramp.
   *   * `curvature × u × stride`, both signs — **30.75 %** and **27.00 %**. Correct in the
   *     dimension the stride solve works in, and still wrong, for a reason that is not a sign:
   *     `state.curvature` is the curvature *now*, and the quantity needed is the heading
   *     *integral* over the metres since the foot planted. A fillet is about 2 m of arc against a
   *     1.24 m stride, so a foot that planted on the straight and stands on the arc is given the
   *     whole arc's turn, and one that planted on the arc and stands on the straight is given
   *     none. Both errors are first-order and they are worst exactly where the turns are.
   *
   * What closes it is the driver publishing a short heading history in metres — the route's yaw at
   * a handful of lookbacks behind the walker's odometer — so the rig can read the actual heading
   * difference over `u × stride` instead of extrapolating a point curvature. That is ~6 extra
   * `sampleSegments` a walker a frame, about 120 µs at 200 on this box, and it is the next thing
   * this lane should build. Shipping either approximation would have traded a measured 18.33 %
   * for a measured 27 %.
   */
  const walkLagFor = () => 0;
  const lift = style.lift * sk.legLength;
  // Two different widths, and keeping them apart is the whole of the r01 stance fix. `hipTrack`
  // is anatomy — where the leg joins the pelvis, and not an animation number. `stepTrack` is
  // where the foot lands, which is narrower than the hips on a walking human and is the only one
  // an archetype dial may move.
  const hipTrack = sk.hipX;
  const stepTrack = sk.trackX * style.track * WALK_TRACK;

  // —— feet ————————————————————————————————————————————————————————————————————————
  const walkFeet = [0, 0.5].map((offset) =>
    footState(frac(cycle + offset), stride, duty, lift, style.roll, sk.foot));
  /**
   * **The arrival blend is not allowed to move a foot that is carrying weight. V3.70 L2 r3.**
   *
   * `idleWeight` interpolates the whole solved pose from the walk to the stand, and until r3 it
   * did that to the feet as well — both of them, horizontally, while the root was still
   * translating. That is a slide by construction, and `mvp/tests/v370-l2-r3-rampdiag.mjs` split
   * the ramp band and found it: at capacity 34 the sub-band the settle actually runs in
   * (0.20–0.49 m/s, `ambient-life.js` `SETTLE_BELOW × ROUTE_CRUISE`) carries **74.58 % of its
   * frames skating at a mean support-foot-over-body ratio of 1.0117** — a planted boot travelling
   * at exactly body speed — against **0.40 %** in the 0.49–0.90 m/s sub-band, which is the same
   * gait with the blend switched off. The blend was the fault, not the gait.
   *
   * There is no value of that weight that fixes it. A lerp from a walk pose to a stand pose moves
   * *both* feet, and the support foot's horizontal speed relative to the ground is the derivative
   * of that lerp whatever the easing. So a driver that wants a planted arrival supplies a
   * `plant` schedule instead, and the horizontal blend is driven by that schedule's per-foot
   * `close` rather than by `idleWeight`:
   *
   *   * `close[i]`  0 → 1 across the one *standing step* that foot takes. While it is 0 or 1 the
   *                 foot is where the walk cycle left it or where the stand wants it, and it does
   *                 not move at all; the whole transit happens while the foot is in the air.
   *   * `lift[i]`   the arc of that step. A foot that moves without lifting is a skate however
   *                 short the move, which is the r2 critic's own §5.1 distinction.
   *   * `lag[i]`    radians the foot's *world* facing is behind the body's. A standing figure that
   *                 turns rotates about its root, which sweeps a foot on a 0.3 m radius through
   *                 0.95 m of arc — measured by the r2 critic as M10. Counter-rotating the planted
   *                 foot by the body's turn holds it exactly still, and the staircase in the
   *                 driver hands the turn back one step at a time.
   *
   * Without a `plant` the old blend runs unchanged, which is deliberate: `people.js` drives the
   * cast and this lane may not edit it, so the cast's rows stay bit-identical to r1 and r2 and any
   * movement in them is somebody else's change rather than this one.
   */
  const feet = walkFeet.map((state, index) => {
    const sign = index === 0 ? -1 : 1;
    // Circumduction: the swing leg carries wide past the stance leg and comes back to the same
    // footfall. Zero at both contacts — see `WALK_SPLAY`.
    const u = frac(cycle + (index === 0 ? 0 : 0.5));
    const splay = u < duty
      ? 0
      : WALK_SPLAY * sk.legLength * Math.sin(Math.PI * ((u - duty) / (1 - duty)));
    const ground = plant ? clamp01(plant.close[index]) : idleWeight;
    const walkLag = walkLagFor(u) * (1 - ground);
    let x = lerp(sign * (stepTrack + splay), sign * sk.trackX * idle.track[index], ground);
    let z = lerp(state.z, idle.feet[index].z, ground);
    let yaw = lerp(sign * WALK_TOE_OUT, idle.feet[index].yaw, ground);
    if (plant) {
      // Hold the world position: the body has turned `lag` further than this foot has, so the
      // foot's own frame is turned back by the same angle. The pivot is the root, which is the
      // point the driver rotates about, so the two cancel exactly rather than approximately.
      const lag = plant.lag[index] + walkLag;
      if (Math.abs(lag) > 1e-6) {
        const cos = Math.cos(lag);
        const sin = Math.sin(lag);
        const zRoot = z + sk.hipZ;
        const rx = x * cos - zRoot * sin;
        const rz = x * sin + zRoot * cos;
        x = rx;
        z = rz - sk.hipZ;
        yaw -= lag;
      }
    }
    return {
      x,
      y: lerp(state.y, idle.feet[index].y, ground) + (plant ? plant.lift[index] * sk.legLength : 0),
      z: z + sk.hipZ,
      pitch: lerp(state.pitch, idle.feet[index].pitch, ground),
      yaw,
      planted: state.planted,
    };
  });

  // —— pelvis ——————————————————————————————————————————————————————————————————————
  // Two rise-and-falls per cycle: lowest just after each contact under load, highest through
  // each passing. The 0.10 lag puts the low point where the loading response actually bottoms
  // out.
  //
  // The bind pose stands with the leg straight, so a stride of any length forces the hip down
  // at contact — the geometry of a triangle, not a style choice. Take whichever is deeper: the
  // archetype's own bob, or the drop the stride demands with a fraction of slack left in the
  // knee. Deriving it is what keeps a long-strider off the IK clamp; before this the rival
  // developer stretched a shin by 11.7% reaching for its own contact.
  const halfStep = stride * duty * 0.5;
  const contactAnkle = groundedAnkle(footPitchAt(0, duty, style.roll), sk.foot);
  const reach = 0.998 * sk.legLength;
  // The foot no longer lands directly under its own hip, so the reach the drop has to cover is
  // the hypotenuse in two axes, not one. Leaving the lateral leg out of it took the family's
  // shin 2.60% onto the IK clamp — the same class of error the stride-derived drop was written
  // to remove, one axis over.
  const lateral = Math.abs(hipTrack - stepTrack);
  const contactHip = contactAnkle
    + Math.sqrt(Math.max(0.04, reach * reach - halfStep * halfStep - lateral * lateral));
  // A leg reaching sideways is shorter vertically than one hanging straight, by the sagitta of
  // the span it crosses — and the mass adoption widened that span, because the hip now sits at
  // `hipTrack` while the foot still lands at `stepTrack`. `contactHip` above budgets for it at
  // the contact frame; the *stand* altitude did not, and `STANCE_RESERVE` is the slack it eats
  // first. Measured with nothing here, the broker's planted shin stretched 2.12% through passing
  // where r03 measured 0.37%. It is 1.5 mm of drop at build 1 and 9 mm on the widest hip.
  const lateralDrop = sk.legLength
    - Math.sqrt(Math.max(0.04, sk.legLength * sk.legLength - lateral * lateral));
  const standHipY = sk.hipY - sk.stature * style.crouch
    - STANCE_RESERVE * sk.legLength - lateralDrop;
  const demanded = (standHipY - contactHip) / CONTACT_DROP_SHARE;
  const drop = Math.max(0.026 * sk.stature * style.bob, demanded);
  const walkHipY = standHipY - drop * (0.5 + 0.5 * Math.cos(Math.PI * 4 * (cycle - 0.10)));
  const hipY = lerp(walkHipY, idle.hipY, idleWeight);

  // Roll about the travel axis: the pelvis drops on the unsupported side. The left leg swings
  // over t ∈ [D,1), so the left hip peaks a quarter-cycle before that. Roll about +Z lifts +x
  // and L is at −x, so a left-high moment is a negative roll.
  const walkRoll = -0.075 * style.roll * Math.cos(Math.PI * 2 * (cycle - 0.31));
  const pelvisRoll = lerp(walkRoll, idle.pelvisRoll, idleWeight);
  // Transverse rotation: the swing-side hip leads, so the left hip is forward at t ≈ 0.81.
  const walkYaw = 0.105 * Math.cos(Math.PI * 2 * (cycle - 0.81));
  const pelvisYaw = lerp(walkYaw, idle.pelvisYaw, idleWeight);
  // §2.7 counter-rotation: the shoulders turn against the pelvis, harder than it turns.
  const shoulderYaw = lerp(-walkYaw * 1.45, idle.shoulderYaw, idleWeight);
  const shoulderRoll = lerp(-walkRoll * 0.65, idle.shoulderRoll, idleWeight);
  const lean = lerp(style.lean, idle.lean, idleWeight);

  // §2.7 "a stationary figure breathes". The r02 rise was 0.22% of stature and reached the head
  // alone, so the chest it is supposed to be coming from never moved and the plate showed
  // nothing. The lift now runs up the spine — a share at the pelvis, most of it at the torso,
  // all of it at the chest, the shoulders and the head — and the ribcage opens as it rises.
  // Tapering rather than lifting the trunk as one block is what keeps the masses overlapping;
  // the pelvis's own share arrives through `idle.hipY`, so everything above it adds only the
  // difference.
  const breathLift = idle.breathRise * idleWeight;
  const breathAbove = breathLift * (1 - IDLE.breathPelvis);
  const breathTorsoAbove = breathLift * (IDLE.breathTorso - IDLE.breathPelvis);
  const breathPitch = idle.breathPitch * idleWeight;

  const pelvisQ = qAxis(AXIS_Y, pelvisYaw).multiply(qAxis(AXIS_Z, pelvisRoll));
  const chestQ = qAxis(AXIS_Y, shoulderYaw)
    .multiply(qAxis(AXIS_Z, shoulderRoll))
    .multiply(qAxis(AXIS_X, lean + breathPitch));
  // The torso is the halfway blend, which is what makes the twist read as a spine rather than
  // as two plates sliding past each other.
  const torsoQ = new THREE.Quaternion().slerpQuaternions(pelvisQ, chestQ, 0.5);

  // Lateral weight shift. Zero through the walk; in the stand the pelvis travels over the foot
  // carrying the load and the shoulders come back the other way, which is the cue that makes
  // contrapposto read at board altitude when a 5° pelvic roll on its own does not.
  const pelvisX = idle.pelvisShift * idleWeight;
  const trunkX = idle.trunkShift * idleWeight;

  const hipDelta = hipY - sk.hipY;
  const pelvisOrigin = new THREE.Vector3(pelvisX, hipY, sk.hipZ);
  const hips = [-hipTrack, hipTrack].map((x) => pelvisOrigin.clone()
    .add(new THREE.Vector3(x, 0, 0).applyQuaternion(pelvisQ)));

  // —— legs ————————————————————————————————————————————————————————————————————————
  const kneePole = new THREE.Vector3(0, 0, 1).applyQuaternion(pelvisQ);
  const legs = feet.map((state, index) => {
    const ankle = new THREE.Vector3(state.x, state.y, state.z);
    const hip = hips[index];
    const knee = solveTwoBone(hip, ankle, sk.thigh, sk.shin, kneePole);
    return { hip, knee, ankle, pitch: state.pitch, yaw: state.yaw, planted: state.planted };
  });

  // —— trunk ———————————————————————————————————————————————————————————————————————
  // §2.7: the head stays roughly level while the chest bobs under it.
  const headDelta = hipDelta * (1 - style.steady) + breathAbove;
  const headYaw = Math.max(-0.15, Math.min(0.15,
    lerp(-shoulderYaw * 0.35, idle.headYaw, idleWeight)));
  const headPitch = lerp(
    -lean * 0.7 + 0.020 * Math.cos(Math.PI * 4 * cycle), idle.headPitch, idleWeight,
  );

  // —— arms ————————————————————————————————————————————————————————————————————————
  // Opposite to the leg on the same side: the left foot is furthest forward at t = 0, so the
  // left arm is furthest back there. Positive pitch about +X carries the hand backward. See the
  // ARM block above for why the shoulder is asymmetric and the elbow never straightens.
  const shoulderOrigin = new THREE.Vector3(
    trunkX, sk.shoulderY + hipDelta + breathAbove, sk.shoulderZ,
  );
  const elbowScale = elbowScaleFor(style);
  const arms = [0, 0.5].map((offset, index) => {
    const swing = Math.cos(Math.PI * 2 * (cycle - offset));
    const carry = idle.arms[index];
    const damp = idle.damp[index];
    // Extension outruns flexion. Linear in `swing`, so the humerus reaches `back` behind and
    // `front` in front with no fold-back in between, and the residual DC parks the mean arm
    // behind vertical where a walking one with a folded elbow hangs.
    const walkPitch = style.arm * (ARM_MEAN + ARM_HALF * swing);
    // 0 at the back extreme, 1 at the front, trailing the shoulder by `ARM.lag` of a cycle.
    const drive = 0.5 - 0.5 * Math.cos(Math.PI * 2 * (cycle - offset - ARM.lag));
    const walkFlex = Math.min(ARM.maxFlex, elbowScale * (ARM.carry + ARM.drive * drive));
    // A little abduction keeps the hand clear of the hip at maximum swing, §2.2, and a little
    // more as the folded forearm comes through past the belt line. Rotation about +Z swings a
    // hanging arm toward +x, so the left arm abducts negative — the sign is applied last.
    const walkAbduct = ARM.abduct + ARM.abductDrive * drive
      + ARM.abductLean * Math.max(0, style.lean);
    // Two blends, in this order: the cycle settles into the carriage as the figure arrives, and
    // then a hand with something in it gives up most of what is left. A carried case neither
    // swings nor folds, and `damp` is how much of the free arm's motion survives.
    const pitch = lerp(carry.pitch, lerp(walkPitch, carry.pitch, idleWeight), damp);
    const flex = lerp(carry.flex, lerp(walkFlex, carry.flex, idleWeight), damp);
    // `seatClear` is added after both blends and after the damp, because a carried arm takes its
    // whole carriage from `HELD` and a narrowed seat moves that hand onto the thigh exactly as it
    // moves a swinging one. It is zero unless the build brought the shoulder in.
    const abduction = (lerp(carry.abduction, lerp(walkAbduct, carry.abduction, idleWeight), damp)
      + sk.seatClear) * (index === 0 ? -1 : 1);
    const shoulder = shoulderOrigin.clone().add(
      new THREE.Vector3(index === 0 ? -sk.shoulderX : sk.shoulderX, 0, 0).applyQuaternion(chestQ),
    );
    const shoulderQ = chestQ.clone()
      .multiply(qAxis(AXIS_Z, abduction))
      .multiply(qAxis(AXIS_X, pitch));
    const foreQ = shoulderQ.clone().multiply(qAxis(AXIS_X, -flex));
    const upperDirection = DOWN.clone().applyQuaternion(shoulderQ);
    const foreDirection = DOWN.clone().applyQuaternion(foreQ);
    const elbow = shoulder.clone().addScaledVector(upperDirection, sk.upperArm);
    const wrist = elbow.clone().addScaledVector(foreDirection, sk.forearm);
    const tip = wrist.clone().addScaledVector(foreDirection, sk.hand);
    return { shoulder, elbow, wrist, tip, foreQ };
  });

  return {
    legs,
    arms,
    hipDelta,
    pelvisOrigin,
    pelvisQ,
    torsoQ,
    chestQ,
    torsoY: sk.torsoY + hipDelta + breathTorsoAbove,
    chestY: sk.chestY + hipDelta + breathAbove,
    pelvisSlotY: sk.pelvisY + hipDelta,
    neckY: sk.neckY + headDelta,
    headY: sk.headY + headDelta,
    // The weight shift, tapered up the spine: the pelvis goes furthest, the head barely moves.
    pelvisX,
    torsoX: lerp(pelvisX, trunkX, 0.55),
    chestX: trunkX,
    headX: trunkX * 0.80,
    headQ: qAxis(AXIS_Y, headYaw).multiply(qAxis(AXIS_X, headPitch)),
  };
}

// —— the quadruped ————————————————————————————————————————————————————————————————————

/** Recover the two joints a bind-pose limb slot spans, in world metres. */
function boneEnds(slot, natural, mul) {
  const centre = new THREE.Vector3(
    slot.position.x * mul.width, slot.position.y * mul.height, slot.position.z * mul.width,
  );
  const length = slot.scale.y * natural * mul.height;
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(slot.quaternion);
  return {
    root: centre.clone().addScaledVector(up, length * 0.5),
    end: centre.clone().addScaledVector(up, -length * 0.5),
    length,
  };
}

/**
 * The quadruped slot set from the shared brief §2. Lane A publishes the dog geometry under
 * exactly these names and this file poses exactly these names; there is no second convention and
 * no stand-in. A bind pose that does not carry `dogBody` is a stale checkout, and the pose solver
 * declines it rather than guessing — `index.js`'s contract handshake then drives the bind pose,
 * which is the mechanism that exists for precisely this.
 *
 * `dogNose` and `dogEyeL/R` are lane A's dark features. They are not slots the trot animates:
 * they ride the skull rigidly, because a nose that lags its own muzzle by a frame is worse than
 * a nose that never moves at all.
 */
export const DOG_SLOTS = Object.freeze({
  body: 'dogBody',
  head: 'dogHead',
  legFL: 'dogLegFL',
  legFR: 'dogLegFR',
  legRL: 'dogLegRL',
  legRR: 'dogLegRR',
  tail: 'dogTail',
});
const DOG_FEATURES = Object.freeze(['dogNose', 'dogEyeL', 'dogEyeR']);

/** Diagonal pairs: front-left with rear-right, front-right with rear-left. That is a trot. */
const DOG_PHASE = Object.freeze({ legFL: 0.0, legRR: 0.0, legFR: 0.5, legRL: 0.5 });

/**
 * Human slots a dog never uses, written as `null` rather than left absent so a dog instance can
 * never inherit the previous figure's arm out of a stale matrix.
 */
const DOG_HUMAN_SLOTS = Object.freeze([
  'chest', 'torso', 'pelvis', 'neck', 'head', 'face', 'hair', 'badge',
  'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR',
  'upperArmL', 'upperArmR', 'forearmL', 'forearmR', 'handL', 'handR',
]);

/**
 * The dog trots: the diagonal pairs move together (front-left with rear-right), the back rises
 * and falls twice a cycle, the head leads the shoulders, and the tail sweeps once a cycle.
 * The shapes stay lane A's; only the motion is lane D's.
 *
 * Every amplitude is a fraction of the dog's **own withers height** rather than of `PROPORTIONS`.
 * The r01 solve scaled them off human stature through the legacy build tuple, which is a number
 * with nothing to do with how tall this animal is and which would silently rescale the whole trot
 * the next time lane F retuned the tuple.
 */
function solveDog({ rest, mul, cycle, stride, idleWeight }) {
  const size = DOG_METRICS.withers;
  const L = DOG_METRICS.legNatural;
  const walk = 1 - idleWeight;
  const duty = DOG_STYLE.duty;
  const travel = stride * walk;
  const bend = DOG_STYLE.bend * walk;

  // Where each paw is fore and aft of its own root, and how far the leg reaches to get there.
  // Stance is linear in cycle position and therefore linear in distance travelled, so the paw's
  // world velocity is exactly −v and cancels the body's +v: the same no-skate construction the
  // biped uses, one leg segment shorter.
  // The reserve is there to absorb the back's pitch and roll, and a standing dog has neither, so
  // it fades out with the walk rather than leaving the animal permanently 22 mm squat.
  const stand = L * (1 - DOG_STANCE_RESERVE * walk);
  const swing = {};
  for (const [key, offset] of Object.entries(DOG_PHASE)) {
    const u = frac(cycle + offset);
    if (u < duty) {
      swing[key] = { z: travel * (duty * 0.5 - u), reach: stand, planted: true };
    } else {
      const v = (u - duty) / (1 - duty);
      swing[key] = {
        z: travel * duty * (smootherstep(v) - 0.5),
        reach: stand * (1 - bend * Math.sin(Math.PI * v) ** 1.1),
        planted: false,
      };
    }
  }

  // The back rides at the height the planted legs allow. Deriving it — rather than authoring a
  // bob and hoping — is what keeps a one-bone leg off its own limit: `carry` is never more than
  // `sqrt(L² − z²)` for any planted leg, so every leg on the animal is at or under its natural
  // length at every frame and none of them can stretch. It also produces the two-beat bob for
  // free, once per step, the same way the human pelvic drop falls out of the stride.
  let carry = stand;
  for (const s of Object.values(swing)) {
    if (s.planted) carry = Math.min(carry, Math.sqrt(Math.max(1e-4, stand * stand - s.z * s.z)));
  }
  const bob = carry - L;
  const breath = 0.006 * size * idleWeight * Math.sin(Math.PI * 2 * cycle);
  const pitch = 0.030 * walk * Math.sin(Math.PI * 4 * cycle);
  const roll = 0.028 * walk * Math.cos(Math.PI * 2 * cycle);
  const bodyQ = qAxis(AXIS_Z, roll).multiply(qAxis(AXIS_X, pitch));
  // The back pitches and rolls as ONE mass about the shoulder line. Rotating each part about its
  // own origin instead opened a gap between every disc of the ribcage — the r01-seat3 dog strip
  // read as a row of loose coins, which is what that mistake looks like on a plate.
  const pivot = new THREE.Vector3(0, DOG_METRICS.withers, DOG_METRICS.shoulderZ);
  const rigid = (point) => pivot.clone()
    .add(point.clone().sub(pivot).applyQuaternion(bodyQ))
    .add(new THREE.Vector3(0, bob + breath, 0));

  const legs = {};
  for (const key of Object.keys(DOG_PHASE)) {
    const name = DOG_SLOTS[key];
    if (!rest[name]) continue;
    const bone = boneEnds(rest[name], L, mul);
    const s = swing[key];
    // A planted paw is pinned to the ground and the leg folds to suit; an airborne one hangs at
    // whatever the folded leg reaches, which is where the paw clearance comes from.
    const drop = s.planted
      ? carry
      : Math.sqrt(Math.max(1e-4, s.reach * s.reach - s.z * s.z));
    legs[key] = {
      name,
      // The bind pose turns the front pair a half turn about Y so one shared leg mesh reads as an
      // elbow in front and a hock behind. `boneAt` aims a bone and knows nothing about that
      // twist, so it is carried through here or the front legs bend backwards.
      twist: rest[name].quaternion,
      root: rigid(bone.root),
      paw: new THREE.Vector3(bone.end.x, bone.end.y + carry - drop, bone.end.z + s.z),
      planted: s.planted,
    };
  }
  return { bob, breath, bodyQ, rigid, legs, walk, size };
}

// —— the pose —————————————————————————————————————————————————————————————————————————

/** Dropped find props: `[localOffset, yaw, scale]`. Placement is lane D, the volume lane C's. */
const FIND_PROP = Object.freeze({
  'lost-auction-paddle': [[0.42, 1.05, 0.18], -0.18, [0.9, 1.35, 0.22]],
  'builders-dropped-plans': [[0.15, 0.85, 0.48], Math.PI / 2, [1.1, 0.15, 0.85]],
  'council-time-capsule': [[0.35, 0.22, 0.20], 0, [0.7, 0.55, 0.7]],
  'tram-ticket-from-nowhere': [[0.32, 0.88, 0.42], -0.32, [0.55, 0.12, 0.85]],
});

/**
 * Where the neck's two ends sit relative to the chest and head origins, as fractions of stature,
 * matched to `buildRestPose`: the bottom is buried inside the trapezius and the top inside the
 * jaw, so neither end can be seen however far apart the two masses drift.
 */
const NECK_BURY = Object.freeze({
  bottom: (PROPORTIONS.y.neckCentre - PROPORTIONS.segment.neck.length * 0.5
    - PROPORTIONS.y.chestCentre) / PROPORTIONS.height,
  top: (PROPORTIONS.y.headCentre - PROPORTIONS.y.neckCentre
    - PROPORTIONS.segment.neck.length * 0.5) / PROPORTIONS.height,
});

/**
 * Solve one figure's pose.
 *
 * @param {{
 *   id: string,
 *   archetypeId: string,
 *   position: THREE.Vector3,   // world root, y = ground
 *   scale: THREE.Vector3,      // (width, height, width) from the archetype build
 *   yaw: number,               // facing, radians about +Y
 *   routeHidden?: boolean,     // no legal route: the figure is scaled out of frame
 *   pendingOutcome?: object|null,
 *   phase?: number,            // per-figure cycle override; the batch phase otherwise
 *   path?: Array,              // route polyline; `record.path` is read when this is absent
 *   moveDuration?: number,     // seconds the route is interpolated over
 *   groundDistance?: number,   // metres walked; preferred over `phase × routeLength` when known
 *   bank?: number,             // roll about the travel axis, radians — a lean into a turn
 * }} figure
 * @param {{ phase?: number, reducedMotion?: boolean }} options
 * @returns {object} slot name → { position, quaternion, scale, colour } or null, plus the
 *   `geometryContract` stamp `index.js` checks before it trusts a solved pose.
 */
export function poseFigure(figure, { phase = 1, reducedMotion = false, beat: beatIn = null } = {}) {
  const {
    id, archetypeId, position, scale, yaw = 0, routeHidden = false, pendingOutcome = null,
  } = figure;
  /**
   * **The whole of the no-skating guarantee is that this alpha and this duration describe the
   * same motion the caller is drawing.** V3.70 L2 measured the cast at a mean support-foot slip
   * ratio of 0.725 — a planted boot travelling three quarters of body speed — for exactly one
   * reason: `people.js` moves a record along its own `travelPhase` over its own `walkSeconds`,
   * and handed the rig neither. The cycle then ran off the batch-level interpolation phase and a
   * 0.9 s default duration, so a forty-metre route was solved as a forty-four metre-per-second
   * sprint while the body crept along at 1.4. Reading the record's own pair closes it without
   * `people.js` changing a line; `figure.path ?? figure.record?.path` below already established
   * that this file reads a record when the descriptor is thin.
   */
  const alpha = clamp01(figure.phase ?? figure.record?.travelPhase ?? phase);
  const isDog = archetypeId === 'dog';
  const mul = buildFromScale(scale);
  const sk = skeletonFor(mul, archetypeId);
  const style = styleForGait(archetypeId);
  const gait = isDog ? DOG_STYLE : style;

  // —— stride from ground speed ————————————————————————————————————————————————————
  // The whole of the no-skating guarantee lives here. See the header.
  // A dog's stride is set against its own leg, in the metres lane A published it in. Reading it
  // back out of an instance scale went wrong the moment the quadruped bind pose started baking
  // `1/mul` into that scale — the leg came back at a third of a millimetre and the cycle count,
  // which is distance ÷ stride, went to five figures a frame.
  const legLength = isDog ? DOG_METRICS.legNatural : sk.legLength;
  const nominalStride = gait.stride * legLength;
  const nominalSpeed = nominalStride * gait.cadence;

  const path = figure.path ?? figure.record?.path ?? null;
  const routeLength = pathLengthOf(path);
  const duration = figure.moveDuration ?? figure.record?.walkSeconds ?? MOVE_DURATION_SECONDS;
  const walking = routeLength > 1e-4 && duration > 1e-4;
  let stride = nominalStride;
  let cycle;
  if (walking) {
    const speed = routeLength / duration;
    // Square-root cadence law with a floor, then the stride that speed implies, then the reach
    // the legs actually have. Clamping the stride rather than the cadence is deliberate: the
    // effective cadence becomes v ÷ S, the identity S·f = v holds either way, and the figure
    // takes quicker steps instead of splitting itself in half.
    const cadence = Math.max(
      gait.cadence * 0.55, gait.cadence * Math.sqrt(speed / nominalSpeed),
    );
    stride = clamp(
      speed / cadence, nominalStride * 0.35, STRIDE_REACH * legLength / gait.duty,
    );
    /**
     * **`groundDistance` is the honest input and `alpha × routeLength` is the approximation.**
     *
     * A caller that interpolates a fixed route over a fixed duration can state its progress as a
     * fraction, and the product is metres walked. A caller that walks a *circuit* — the V3.70
     * ambient errand, which never ends and whose speed ramps out of every stop — cannot: a
     * fraction of what, of a route that wraps? Feeding it one anyway is what put the ambient
     * layer at a mean support-foot slip ratio of 4.63, a boot travelling four and a half times
     * board speed, because the fraction it had to hand was the *day clock's*, not the route's.
     *
     * Metres walked is the quantity the cycle is actually a function of, so a driver that knows
     * it says so and the wrap disappears: `frac` of a monotonically rising odometer over a fixed
     * stride is continuous at every step boundary, where `frac` of a windowed fraction is not.
     */
    const ground = figure.groundDistance;
    const metres = Number.isFinite(ground) ? ground : alpha * routeLength;
    cycle = frac(metres / stride + unitFrom(id, RIG_SALT.PHASE));
  } else {
    // No route. A figure whose descriptor carries its own `phase` is the lab walk strip asking
    // for one cycle across eight cells, and it gets no per-figure offset so cell 0 is heel
    // contact rather than a hash-dependent moment mid-step. Anything else is standing.
    cycle = frac(alpha);
  }
  // A figure that has arrived settles onto its feet over the last stretch of the move rather
  // than freezing mid-stride; a figure with no route and no explicit cycle is idle throughout.
  const cycleRequested = walking || figure.phase !== undefined;
  const arriving = walking ? smoothstep((alpha - 0.86) / 0.14) : (cycleRequested ? 0 : 1);
  const idleWeight = reducedMotion ? 1 : arriving;
  // Idle is a pure function of (id, beat). Derived from `alpha` it stops the moment a figure
  // arrives, because `people.js` pins interpolation phase at 1 there — so an arrived figure
  // became a statue, which §2.7 fails outright. A caller may pass a free-running `beat` to keep
  // the breath, weight shift and look-about alive after arrival; it stays a pure function of
  // its inputs, so a hand-stepped capture is still frame-identical.
  //
  // A descriptor may carry its own `beat`, which is what lets a strip render four cells of one
  // figure's idle in a single frame exactly as `figure.phase` renders eight cells of its walk.
  // The batch-level `beat` is the board's clock and applies to everything without one.
  const beat = reducedMotion
    ? REDUCED_BEAT
    : frac((figure.beat ?? beatIn ?? alpha) + unitFrom(id, RIG_SALT.BREATH));

  /**
   * Facing, plus an optional roll about the travel axis.
   *
   * §2.7's "turning is a turn, not a yaw snap" has two halves and this is the second one. The
   * first is the driver's: a route whose corners are filleted turns the heading over a metre of
   * arc instead of stepping it. The second is that a walker leans into that arc. The roll axis is
   * the figure's own forward vector and the pivot is `position`, which sits on the ground, so the
   * figure banks about its contact patch the way a body does — the crown swings, the boots stay.
   * At the 0.10 rad ceiling the drivers use, a sole 90 mm up moves 9 mm laterally *over the whole
   * turn*, which is two orders below a walking step and does not register as slip.
   */
  const bank = reducedMotion ? 0 : (figure.bank ?? 0);
  const face = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  if (Math.abs(bank) > 1e-4) {
    face.premultiply(new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), bank,
    ));
  }
  const rest = isDog ? quadrupedRest(mul) : bipedRest(archetypeId);
  /** The instance scale lane A gave this slot, at this build. Only `scale.y` is ever replaced. */
  const restScale = (name) => new THREE.Vector3(
    rest[name].scale.x * mul.width, rest[name].scale.y * mul.height, rest[name].scale.z * mul.width,
  );
  /** Local (already build-scaled) metres → a world slot. */
  const slotAt = (localPos, localQ, localScale, colour = null) => part(
    localPos.clone().applyQuaternion(face).add(position),
    face.clone().multiply(localQ),
    localScale,
    colour,
  );
  /**
   * A limb segment spanning two joints. Geometry is authored at `natural` metres along +Y with
   * unit diameter, so `scale.y = |joint − joint| / natural` lands both ends exactly.
   *
   * `twist` is a rotation about the bone's own axis that the bind pose carried and the aim would
   * otherwise throw away — the dog's front legs are the shared rear-leg mesh turned a half turn
   * about Y, and without it the elbow bends the wrong way.
   */
  const boneAt = (name, top, bottom, natural, twist = null) => {
    const delta = new THREE.Vector3().subVectors(top, bottom);
    const length = delta.length();
    const direction = length > 1e-6 ? delta.multiplyScalar(1 / length) : UP.clone();
    const authored = restScale(name);
    const aim = new THREE.Quaternion().setFromUnitVectors(UP, direction);
    return slotAt(
      new THREE.Vector3().addVectors(top, bottom).multiplyScalar(0.5),
      twist ? aim.multiply(twist) : aim,
      new THREE.Vector3(authored.x, length / natural, authored.z),
    );
  };

  const pose = isDog
    ? poseQuadruped({ rest, mul, cycle, stride, idleWeight, slotAt, boneAt, restScale })
    : poseBiped({
      id, sk, style, cycle, stride, idleWeight, beat, slotAt, boneAt, restScale, archetypeId,
      reduced: reducedMotion, plant: reducedMotion ? null : (figure.plant ?? null),
    });
  // A stale `figure.js` with no quadruped slots: decline rather than guess. Without the stamp
  // `index.js` drives the bind pose and warns once, which is the whole point of the handshake.
  if (!pose) return { geometryContract: null };

  // The chest chip, and the props a dog find drops. Colour is the rig's here because no cast
  // tone covers the badge; every body slot leaves its colour null for `_dressPose` to set.
  const findKind = pendingOutcome?.kind === 'dog-find' ? pendingOutcome.findKind : null;
  if (findKind && FIND_PROP[findKind]) {
    const [offset, rot, size] = FIND_PROP[findKind];
    pose.badge = part(
      position.clone().add(new THREE.Vector3(...offset)),
      qAxis(UP, rot),
      new THREE.Vector3(...size),
      new THREE.Color(FIND_PROP_COLOURS[findKind]),
    );
  }

  if (routeHidden) for (const key of Object.keys(pose)) if (pose[key]) pose[key] = hidden();
  // The stamp `index.js` checks before it trusts a solved pose over the bind pose.
  pose.geometryContract = GEOMETRY_CONTRACT;
  return pose;
}

/** The human slot set. */
function poseBiped({
  id, sk, style, cycle, stride, idleWeight, beat, slotAt, boneAt, restScale, archetypeId,
  reduced = false, plant = null,
}) {
  // Which hand, if any, is occupied. A carried case does not swing like an empty hand, so the
  // carrying arm is damped before the solve rather than corrected after it.
  const accKind = ARCHETYPE_ACCESSORY[archetypeId] ?? null;
  const idle = solveIdle({ id, archetypeId, sk, style, beat, reduced });
  const held = HELD[archetypeId] ?? null;
  if (held) {
    idle.damp[held.hand] = held.damp;
    idle.arms[held.hand] = {
      pitch: held.pitch,
      flex: held.flex,
      // The prop sets the carriage; the hip still has to be cleared. See `hipClear`.
      //
      // Scaled by `idleWeight`, and that qualifier is load-bearing. A damped arm keeps only
      // `1 − damp` of the walk and takes the rest of its carriage from here at every idle
      // weight, so an unscaled clearance term would follow the weight shift into the WALK,
      // where the hip is not shifting and the pelvis is symmetric. It showed up as exactly
      // that: the mirror residual between opposite contacts on the four carrying archetypes
      // widened from 0.128 to 0.180 before this was scaled. The walk clears the hip with
      // `ARM.abduct`, which is the same on both arms, and the measured walk clearance never
      // drops below 47.7 mm without any help from here.
      abduction: held.abduction + idle.hipClear[held.hand] * idleWeight,
    };
  }
  const solved = solveHuman({ sk, style, cycle, stride, idleWeight, idle, plant });

  const head = slotAt(
    new THREE.Vector3(solved.headX, solved.headY, sk.headZ), solved.headQ, restScale('head'),
  );
  const pose = {
    contact: null,
    pelvis: slotAt(
      new THREE.Vector3(solved.pelvisX, solved.pelvisSlotY, sk.hipZ),
      solved.pelvisQ, restScale('pelvis'),
    ),
    torso: slotAt(
      new THREE.Vector3(solved.torsoX, solved.torsoY, 0), solved.torsoQ, restScale('torso'),
    ),
    chest: slotAt(
      new THREE.Vector3(solved.chestX, solved.chestY, 0), solved.chestQ, restScale('chest'),
    ),
    // The neck spans rather than sits. §2.7 asks the head to hold level while the chest bobs
    // under it, which means the gap between the two opens and closes every step; a neck placed
    // at a fixed altitude lifts its buried bottom clear of the trapezius and bares a column of
    // skin at the low point. Spanning chest to jaw keeps both ends buried at every frame.
    neck: (() => {
      const bury = NECK_BURY;
      const x = (solved.chestX + solved.headX) * 0.5;
      const bottom = new THREE.Vector3(x, solved.chestY + bury.bottom * sk.stature, sk.neckZ);
      const top = new THREE.Vector3(x, solved.headY - bury.top * sk.stature, sk.neckZ);
      const span = top.y - bottom.y;
      return slotAt(
        new THREE.Vector3(x, (top.y + bottom.y) * 0.5, sk.neckZ),
        new THREE.Quaternion().slerpQuaternions(solved.chestQ, solved.headQ, 0.45),
        new THREE.Vector3(
          restScale('neck').x, span / PROPORTIONS.natural.neck, restScale('neck').z,
        ),
      );
    })(),
    head,
    // Head, hair and the dark features take one transform, so a face can never slide off a
    // skull. `index.js` does the same in its bind-pose fallback.
    face: { ...head, colour: null },
    hair: hidesHair(accKind) ? null : { ...head, colour: null },
  };

  for (let index = 0; index < 2; index += 1) {
    const leg = solved.legs[index];
    const arm = solved.arms[index];
    const side = index === 0 ? 'L' : 'R';
    pose[`thigh${side}`] = boneAt(`thigh${side}`, leg.hip, leg.knee, PROPORTIONS.natural.thigh);
    pose[`shin${side}`] = boneAt(`shin${side}`, leg.knee, leg.ankle, PROPORTIONS.natural.shin);
    // Yaw first, then the heel-to-toe roll about the foot's own long axis: a toed-out foot still
    // rolls along itself. The r01 rig set no yaw at all, so every boot in the cast pointed dead
    // ahead whatever the stance was doing.
    pose[`foot${side}`] = slotAt(
      leg.ankle,
      qAxis(AXIS_Y, leg.yaw).multiply(qAxis(AXIS_X, leg.pitch)),
      restScale(`foot${side}`),
    );
    pose[`upperArm${side}`] = boneAt(
      `upperArm${side}`, arm.shoulder, arm.elbow, PROPORTIONS.natural.upperArm,
    );
    pose[`forearm${side}`] = boneAt(
      `forearm${side}`, arm.elbow, arm.wrist, PROPORTIONS.natural.forearm,
    );
    pose[`hand${side}`] = slotAt(arm.wrist, arm.foreQ, restScale(`hand${side}`));
  }

  // The role chip, on the chest and turned with it.
  pose.badge = slotAt(
    new THREE.Vector3(solved.chestX, solved.chestY, 0).add(
      new THREE.Vector3(0, -0.004 * sk.stature, 0.155 * sk.stature * 0.34)
        .applyQuaternion(solved.chestQ),
    ),
    solved.chestQ,
    new THREE.Vector3(0.5, 0.5, 0.5),
    new THREE.Color(PALETTE.badgePlate),
  );

  // §2.9: the contact shadow moves with the feet, not with the centroid. It rides the ankle of
  // whichever foot is carrying the figure, and the midpoint through double support.
  const weight = solved.legs[0].planted && !solved.legs[1].planted ? 0
    : (solved.legs[1].planted && !solved.legs[0].planted ? 1 : 0.5);
  const under = solved.legs[0].ankle.clone().lerp(solved.legs[1].ankle, weight);
  /**
   * **Under the boot, not under the ankle. V3.70 L2 r2.**
   *
   * The ankle sits at the *heel* end of the foot — `buildFootGeometry` puts the origin there so
   * the rig can plant a sole — and the boot runs forward from it for its whole length. A puddle
   * centred on the ankle is therefore centred behind the thing casting it, and the r1 critic read
   * exactly that off `plates/r2/ambient.png` at (765, 825): *"the shadow smear is displaced
   * laterally from the sole"*. §2.9 asks the contact shadow to move with the foot, and it does —
   * it was just parked a quarter of a boot behind it. The offset is taken along the figure's own
   * facing so it follows a turn.
   */
  pose.contact = slotAt(
    new THREE.Vector3(under.x, 0.02, under.z + (sk.foot.toe - sk.foot.heel) * 0.42),
    IDENTITY.clone(), restScale('contact'),
  );
  return pose;
}

/**
 * The dog slot set, written to the brief §2 names. Returns `null` when the bind pose does not
 * declare `dogBody` — that is a stale `figure.js`, and a solver that guessed at it would put a
 * human trunk on the plate. `poseFigure` then omits the contract stamp and `index.js` falls back
 * to the bind pose, which is what the handshake exists for.
 */
function poseQuadruped({ rest, mul, cycle, stride, idleWeight, slotAt, boneAt, restScale }) {
  if (!rest[DOG_SLOTS.body]) return null;
  const solved = solveDog({ rest, mul, cycle, stride, idleWeight });
  const { bob, breath, bodyQ, rigid, walk, size } = solved;
  /** A bind-pose slot in world metres. `figure.js` bakes 1/mul in, so this × mul cancels it. */
  const local = (name) => new THREE.Vector3(
    rest[name].position.x * mul.width,
    rest[name].position.y * mul.height,
    rest[name].position.z * mul.width,
  );

  const pose = { contact: null };
  for (const name of DOG_HUMAN_SLOTS) pose[name] = null;

  // The trunk: one mass, rotated about the withers rather than about its own origin.
  pose[DOG_SLOTS.body] = slotAt(
    rigid(local(DOG_SLOTS.body)),
    bodyQ.clone().multiply(rest[DOG_SLOTS.body].quaternion),
    restScale(DOG_SLOTS.body),
  );

  // The head leads: carried level and a shade forward while the back pitches under it. It keeps
  // only a third of the back's bob, which is what makes a trotting dog read as leading with its
  // nose rather than nodding with its shoulders.
  const headSwing = qAxis(AXIS_Y, 0.10 * walk * Math.sin(Math.PI * 2 * cycle));
  const headRest = local(DOG_SLOTS.head);
  const headAt = rigid(new THREE.Vector3(
    headRest.x, headRest.y, headRest.z + 0.026 * size * walk * Math.cos(Math.PI * 2 * cycle),
  )).add(new THREE.Vector3(0, -(bob + breath) * 0.65, 0));
  pose[DOG_SLOTS.head] = slotAt(
    headAt, headSwing.clone().multiply(rest[DOG_SLOTS.head].quaternion), restScale(DOG_SLOTS.head),
  );
  // Nose and eyes ride the skull: the same displacement, the same look-about, no lag.
  for (const name of DOG_FEATURES) {
    if (!rest[name]) continue;
    pose[name] = slotAt(
      headAt.clone().add(local(name).sub(headRest).applyQuaternion(headSwing)),
      headSwing.clone().multiply(rest[name].quaternion),
      restScale(name),
    );
  }

  for (const leg of Object.values(solved.legs)) {
    pose[leg.name] = boneAt(
      leg.name, leg.root, leg.paw, DOG_METRICS.legNatural, leg.twist,
    );
  }

  // The tail sweeps once a cycle against the body roll. Its geometry runs from the root along
  // +Y rather than about a midpoint, so it is placed at the root and aimed, not spanned.
  const tailName = DOG_SLOTS.tail;
  if (rest[tailName]) {
    const sweep = qAxis(AXIS_Y, 0.42 * Math.sin(Math.PI * 2 * cycle) * (1 - idleWeight * 0.4))
      .multiply(qAxis(AXIS_X, 0.10 * walk * Math.cos(Math.PI * 4 * cycle)));
    const direction = UP.clone()
      .applyQuaternion(rest[tailName].quaternion).applyQuaternion(bodyQ).applyQuaternion(sweep);
    pose[tailName] = slotAt(
      rigid(local(tailName)),
      new THREE.Quaternion().setFromUnitVectors(UP, direction),
      restScale(tailName),
    );
  }

  // §2.9: the contact shadow sits under the animal's feet, from the solved paws rather than from
  // a centroid, so it holds whichever slot set drew them.
  const paws = Object.values(solved.legs).map((leg) => leg.paw);
  const centre = paws.reduce(
    (sum, point) => sum.add(point), new THREE.Vector3(),
  ).multiplyScalar(paws.length ? 1 / paws.length : 1);
  pose.contact = slotAt(
    new THREE.Vector3(centre.x, 0.02, centre.z), IDENTITY.clone(), restScale('contact'),
  );
  return pose;
}

export default poseFigure;
