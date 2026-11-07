// District Deck V3.32 — garments, footwear, headwear and handheld props.
//
// Lane C. Owns everything the figure wears or carries, as *modelled geometry with real
// thickness* — V3.32 §2.5. Which archetype wears which kit and in what colours is `cast.js`
// (lane F); what a piece is made of is `materials.js` (lane E); the segments it hangs on are
// `figure.js` (lane A) and the pose that moves them is `rig.js` (lane D).
//
// ## Three unit shapes, many instances
//
// An `InstancedMesh` carries one geometry, so "a modelled garment per archetype" cannot come
// from a per-archetype mesh without a draw call per archetype. It comes instead from **many
// instances of a very small number of unit shapes**: r01b took that number from one to two, and
// r02 to three.
//
// r01 authored every piece as a **brick**, and the r01-seat1 hero plate is what a wardrobe of
// bricks looks like on an anatomy of swept profiles: a hard hat that is a takeaway container
// balanced on a skull, a hi-vis vest that is four slabs of cargo strapped to a chest, a tool belt
// that is a plank entering one hip and leaving the other, and a trouser hem that is a lit shelf
// at the ankle. None of those is a dimension error. A box has four corners and a flat lit top
// face, and a body has neither, so a box laid against a body reads as a separate object however
// close its numbers are.
//
// So there are now three:
//
//   * **`brick`** — the unit box. Still right for everything genuinely flat or genuinely boxy: a
//     coat's front edge, a lapel, a jerry can, a clipboard, a badge, a strap, a phone.
//   * **`shell`** — a unit rounded solid of elliptical section (`buildShellGeometry`). Right for
//     everything that *wraps* something: a belt round a hip, a cuff round a forearm, a hem round
//     a shin, a vest round a ribcage, a knee on a knee, a boot round an ankle. It has no corner to
//     stand proud of a curved body and no flat top face to catch the key as a shelf.
//   * **`dome`** — a unit crown (`buildDomeGeometry`). For the two pieces that have to be
//     *continuous over a skull*: the hard hat's crown and the peaked cap's.
//
// r01b argued a dome was two shells stacked, on V3.32 §3's "a segment on an existing family
// before a new family". It is not: a shell is a cylinder through the middle fifty-six per cent of
// its height and tapers to 0.84 at both rims, so the junction of two carries a taper and a fresh
// bulge, and the r01 critic read the result off the enlarged builder as a stacked-disc ziggurat —
// *"this is not merely soft, it is a wedding cake"*. r02 pays one draw for the shape.
//
// ## The rule the r02 plates kept teaching
//
// **Where a garment's rim meets a body decides whether its edge is a curve or a sawtooth.** A
// shell closes to 0.84 of its width across the top twenty-two per cent of its height, so its rim
// draws an intersection wherever it passes through the mass inside it, and how ragged that
// intersection looks is set by the *angle* the two surfaces cross at. A ten-sided garment against
// a twelve-sided body disagrees with itself about its own radius by up to 46 mm; divide that by
// the rate the two surfaces separate and you have the amplitude of the zigzag. The r01b hi-vis
// crossed the chest at 0.46 per metre and wandered a hundred millimetres. The fix is never a
// wider garment — the rim is a fraction of the width, so widening moves both terms — it is a
// **shorter section**, because the taper zone shortens with it and the rim then closes steeply.
// Three vest sections at 218 mm cross at 2.9 per metre and the same disagreement moves the edge
// sixteen millimetres.
//
// ## Anchors and units
//
// A piece hangs from a named segment slot and `index.js` composes it against that slot's solved
// world transform, so wardrobe follows the gait without this lane knowing anything about it.
// The slot names are the shared brief §2 contract that lane A produces and lane D poses:
//
//   `root` the sole    `pelvis` `torso` `chest` `neck` `head`
//   `thighL/R` `shinL/R` `footL/R`    `upperArmL/R` `forearmL/R` `handL/R`
//
// **Offsets and sizes are metres at build 1, in the anchor's own frame** — the same convention
// `figure.js`'s `buildRestPose` states its bind pose in, read off `PROPORTIONS` rather than
// authored, so the six-head contract cannot drift out of lane A and into this file. `index.js`
// applies the build multipliers before rotating, exactly as it does for the bind pose.
//
// Every altitude below is derived from `PROPORTIONS.y`, every girth from `PROPORTIONS.width` /
// `.depth`, and every limb station from `PROPORTIONS.segment`. That is the whole of the r01b
// re-anchor: the r01 wardrobe was authored against the anatomy that preceded lane A's rebuild,
// so its garments sat on a body that no longer existed. A garment that reads a proportion moves
// with the next anatomy change instead of being stranded by it.
//
// A limb segment's frame has +Y running toward its parent joint, so a sleeve cuff on
// `forearmL` at `y: +0.14` is fourteen centimetres up the forearm toward the elbow, and skin
// continues below it into the wrist and the hand. That is §2.5's sleeve test, in one number.
//
// Salt namespace 300–399. Deterministic: no clock, no `Math.random`.

import * as THREE from 'three';
import {
  AUTHORED_PROPORTIONS, FIGURE_SCALE, mergeParts, profileSolid, unitFrom,
} from './core.js';
// Lane A's own ring stacks and its own bind pose, read rather than mirrored — see `trunkStacks`
// and `surfacesFor` for why neither is copied.
import { buildRestPose, chestRings, pelvisRings, torsoRings } from './figure.js';
import { buildFor } from './cast.js';

/** Salts this lane owns. V3.32 §5: 300–399, and no other lane reads them. */
export const WARDROBE_SALT = Object.freeze({
  PRESS: 311,
  DRAPE: 312,
});

/** Unit brick. Flat panels, straps, plates and genuinely boxy props are instances of this. */
export function buildBrickGeometry() {
  return new THREE.BoxGeometry(1, 1, 1);
}

/**
 * How far a shell's rim closes in from its own widest section. **The single number that decides
 * whether a band can sit on a body at all**, and r04 moves it from 0.84 to 0.955.
 *
 * The arithmetic, because it is short and it governs eight garments. A band round a body has two
 * constraints that pull against each other: its **rim** must be at least as wide as the mass
 * inside it, or the body draws an intersection curve through the rim and comes out the other
 * side; and its **middle** must not stand far proud of that mass, or the annulus between the two
 * is a lit shelf. Write the body's half-width as `H` and the band's full width as `W`:
 *
 *     rim clears the body        RIM · W / 2  ≥  H
 *     middle is not a shelf      W / 2  ≤  H + relief
 *
 * Together those give `relief ≥ H · (1/RIM − 1)`. At RIM 0.84 a belt on a 430 mm hip half-width
 * needs **82 mm** of relief before its rim clears, and 82 mm of relief is the shelf. There was no
 * belt, no coat hem, no tool belt and no tape band this shape could carry: r03's hem lip stood
 * 48 mm proud with its rim 37 mm *inside* the pelvis, which is why `hero--squatter.png` shows a
 * mustard band with a lit top face, a cut end, and a wedge of navy trouser punched through the
 * middle of its own run. At RIM 0.968 the same hip needs **18 mm**, which is four pixels at hero
 * distance and reads as a change of surface.
 *
 * The taper zone shortens with it, 22 per cent of the height to 12, so the annulus is steeper as
 * well as narrower: on a 125 mm belt it goes from a 74 mm shelf lying at 20° to a 20 mm bevel at
 * 53°.
 *
 * **What it costs.** Four rings and ten radial segments either way — 80 triangles, one draw, no
 * change to any budget. What it costs is *softness on tall pieces*: a 340 mm beanie crown rounded
 * over 75 mm of its own height at 0.84 becomes one rounded over 41 mm at 0.955, which is a
 * chamfered drum rather than a bag. Two pieces relied on that softness and both move to `dome`
 * below, which is the shape for a thing that has to be continuous over a skull and was already
 * paid for.
 *
 * Widest at its own middle and rounded into both rims, so an instance scaled to
 * `(width, height, depth)` wraps whatever is inside it and presents no corner and no flat lit
 * top face. Scaled squat it is a belt, a cuff, a hem, a tape band or a sole; scaled tall it is a
 * vest or a boot; scaled shallow and wide it is a hat brim.
 *
 * Ten radial segments in plan: what has to be round is the **plan** — the section a belt, a cuff
 * or a hat brim presents to the camera — not the elevation. Ten against lane A's twelve-segment
 * trunk and ten-segment limbs; eight was tried first and read as a visibly octagonal hat.
 */
export const SHELL_RIM = 0.968;

export function buildShellGeometry() {
  return profileSolid([
    { y: -0.50, w: SHELL_RIM, d: SHELL_RIM },
    { y: -0.38, w: 1.00, d: 1.00 },
    { y: 0.38, w: 1.00, d: 1.00 },
    { y: 0.50, w: SHELL_RIM, d: SHELL_RIM },
  ], 10);
}

/**
 * Unit **dome** — a crown. Flared at its base, rounded over the top, closed at a pole.
 *
 * The third shape, and r02 bought it with a measured defect rather than with an opinion. A hard
 * hat's crown was two shells stacked, on the argument that a segment is cheaper than a family. It
 * is, and the shape it produced was a wedding cake: a shell is a *cylinder* through the middle
 * fifty-six per cent of its height and tapers to 0.84 at both rims, so stacking two puts a rim
 * taper and a fresh bulge at the junction and the crown reads as two tiers with a step between
 * them. The r01b builder hero shows four visible steps from brim to crest. No arrangement of two
 * shells removes the step, because the step is the shell's own profile.
 *
 * One geometry, ten radial by five rings, 100 triangles, one draw. It carries the hard hat's crown
 * and the peaked cap's, which are the two pieces on the cast that have to be continuous over a
 * skull.
 */
export function buildDomeGeometry() {
  return profileSolid([
    { y: -0.50, w: 0.97, d: 0.97 },
    { y: -0.24, w: 1.00, d: 1.00 },
    { y: 0.10, w: 0.94, d: 0.94 },
    { y: 0.36, w: 0.72, d: 0.72 },
    { y: 0.50, w: 0.30, d: 0.30 },
  ], 10);
}

/** The three unit shapes, by the name `piece()` tags a garment with. */
export const WARDROBE_SHAPES = Object.freeze({
  brick: buildBrickGeometry,
  shell: buildShellGeometry,
  dome: buildDomeGeometry,
});

/**
 * Legacy shared accessory volume — the hard-hat silhouette every role used to be issued and
 * re-scale into a briefcase, a bag, a cap or a roll. **Nothing draws it any more**: r01 reclaimed
 * its draw call for the wardrobe families below. It is kept exported because removing a symbol
 * another lane may still import is a merge conflict rather than a fix.
 */
export function buildAccessoryGeometry() {
  const brim = new THREE.BoxGeometry(1.05, 0.1, 1.05);
  brim.translate(0, -0.12, 0.02);
  const dome = new THREE.BoxGeometry(0.68, 0.34, 0.68);
  dome.translate(0, 0.08, 0);
  const peak = new THREE.BoxGeometry(0.42, 0.08, 0.32);
  peak.translate(0, -0.1, 0.52);
  const ridge = new THREE.BoxGeometry(0.12, 0.12, 0.55);
  ridge.translate(0, 0.22, 0);
  return mergeParts([brim, dome, peak, ridge], new THREE.BoxGeometry(0.7, 0.32, 0.7));
}

/**
 * Semantic badge — chest chip at rest, dog-find prop when a find is pending.
 *
 * **Halved in width and thinned to a third in r03, against a probe rather than an opinion.** The
 * r02 critic recorded *"the same white triangle pair on the architect and on the arsonist —
 * identical geometry on two unrelated garments"* and read it as a wardrobe defect. It is not a
 * garment: colouring this family magenta and re-capturing `hero--architect` put the magenta
 * exactly where the white triangles were. They are the two **front corners of this box** cutting
 * out through lane A's elliptical chest — a flat plate inside a curved solid pokes at its corners
 * first, and the intersection of a box corner with an ellipse is a triangle. It shows worst on the
 * two narrowest figures in the cast (architect width 0.94, arsonist 0.96) because the trunk they
 * are buried in is the smallest, which is exactly the pair the critic named.
 *
 * `rig.js` (lane D) places this at the chest origin with a 0.5 instance scale, so the containment
 * is a property of the *geometry* and belongs here. At 0.40 × 0.50 × 0.06 the scaled plate is
 * 200 × 250 × 30 mm and its front face sits 30 mm inside the narrowest chest section any build in
 * the cast presents. Nothing else changes: the four `FIND_PROP` sizes in `rig.js` are absolute
 * instance scales on this unit box, so a dropped paddle or plan set keeps its footprint and
 * becomes a thinner plate, which is what a dropped sheet of paper should be anyway.
 */
export function buildBadgeGeometry() {
  return new THREE.BoxGeometry(0.40, 0.50, 0.06);
}

/**
 * Headwear kinds, and whether the piece replaces the crown. `rig.js` reads `hidesHair` so the
 * hair mass scales away under a hard hat, a cap, a beanie or a hood instead of poking through
 * the brim. Every one of the four still shows hair or a sweatband at the temples, authored as
 * its own piece below, because the register requires it.
 *
 * Handheld kinds are gone from this table on purpose: a hand is not headwear, and the only
 * reason a briefcase was ever listed beside a hard hat was that both were the same mesh.
 */
export const ACCESSORY_KINDS = Object.freeze({
  hardhat: Object.freeze({ hidesHair: true }),
  cap: Object.freeze({ hidesHair: true }),
  beanie: Object.freeze({ hidesHair: true }),
  hood: Object.freeze({ hidesHair: true }),
});

/** True when headwear of this kind replaces the crown. */
export function hidesHair(accessoryKind) {
  return ACCESSORY_KINDS[accessoryKind]?.hidesHair === true;
}

// **Which headwear kind each kit installs now lives in `cast.js`** as `ARCHETYPE_ACCESSORY`.
// It moved in r04 to break an import cycle: this file reads lane A's trunk rings so a garment can
// be seated against the mesh that renders rather than against a copy of it, lane A reads `cast.js`
// for build variation, and `cast.js` used to read this table back out of here. Which role wears
// which hat is an identity question and `cast.js` is the identity lane, so that is where it goes.

/** Handheld / dropped props a dog find puts in the badge slot, by find kind. */
export const FIND_PROP_COLOURS = Object.freeze({
  'lost-auction-paddle': '#f2b84b',
  'builders-dropped-plans': '#e8dfc7',
  'council-time-capsule': '#8c6845',
  'tram-ticket-from-nowhere': '#5ca8c9',
});

/**
 * The draw sheet: one instanced family per (material batch × unit shape), with the per-figure
 * instance ceiling each carries.
 *
 * Capacities are the fattest kit's measured usage plus one, not a guess — `mvp/tests` and the
 * scratch probe both read `buildWardrobe` across the whole cast and count. A kit that authors
 * past a ceiling is truncated at the write rather than bleeding into the next figure.
 *
 * Eight families rather than seven. `prop:dome` is r02's one added draw and it carries the two
 * crowns on the cast that have to be continuous over a skull; the reasoning and the defect that
 * bought it are in `buildDomeGeometry`.
 *
 * **Reclaimed before spent, V3.32 §7.5, and r03 reclaims again.** Deleting the two full-height
 * front edges from every open coat took the fattest `accent:brick` kit from 7 to 5, and moving the
 * architect's glasses off the retro-reflective family and the drawing roll's two end caps out of
 * existence took `trim:brick` from 5 to 2. Those two returned 60 triangles; the hi-vis vest's new
 * top tape band spends 80 of them. The sheet measures **3 088** triangles against r02's 3 068, for
 * a figure of 6 338 against a §3 ceiling of 7 000.
 *
 * The fattest kit per family, re-measured by `wardrobeUsage()` after the r04 rebuild: accent
 * shell 13, prop shell 10 (the builder's brim, belt, pouches and two boots), accent brick 5,
 * prop brick 4, hivis shell 4 (three vest sections and the bleached top band), trim shell 2,
 * trim brick 2, prop dome 1. Every capacity is that number plus one, so a kit that grows by a
 * piece is still drawn rather than silently truncated.
 *
 * **r04 spends nothing and reclaims two.** The hi-vis vest's fourth `hivis` section is the
 * bleached top band that replaced two `accent` shoulder pads, and the `accent` count fell with
 * the two `chest`-anchored sleeve-head shells becoming `upperArm` bands. Eight families, 26
 * draws, unchanged.
 */
export const WARDROBE_PLAN = Object.freeze([
  Object.freeze({ batch: 'accent', shape: 'brick', capacity: 6 }),
  // **r3 re-cuts three capacities and the sheet does not move.** The hi-vis vest's two panels
  // became four when the single chord was split at the trunk's own step (see `hiVisVest`), which
  // is two more `hivis:shell` instances a figure. Measured across every kit, `accent:shell` peaks
  // at 13 of 15 and `trim:shell` at 2 of 4, so one slot comes off each and the vest is paid for
  // out of provisioning nobody uses: 7 098 → 6 938 tris a figure, which is r2's number exactly.
  // §7.5, reclaim before you spend.
  Object.freeze({ batch: 'accent', shape: 'shell', capacity: 14 }),
  Object.freeze({ batch: 'hivis', shape: 'shell', capacity: 7 }),
  Object.freeze({ batch: 'trim', shape: 'brick', capacity: 3 }),
  Object.freeze({ batch: 'trim', shape: 'shell', capacity: 3 }),
  Object.freeze({ batch: 'prop', shape: 'brick', capacity: 5 }),
  Object.freeze({ batch: 'prop', shape: 'shell', capacity: 11 }),
  Object.freeze({ batch: 'prop', shape: 'dome', capacity: 2 }),
]);

/** Batch × shape key, the one place the two halves of a family name are joined. */
export const familyKey = (batch, shape) => `${batch}:${shape}`;

/** Per-figure instance ceiling per family, keyed `batch:shape`. */
export const WARDROBE_CAPACITY = Object.freeze(Object.fromEntries(
  WARDROBE_PLAN.map(({ batch, shape, capacity }) => [familyKey(batch, shape), capacity]),
));

/** The batches this lane draws through, in draw order back to front. */
export const WARDROBE_BATCHES = Object.freeze(['accent', 'hivis', 'trim', 'prop']);

/**
 * What a piece is *for*, declared where it is authored rather than inferred by whatever is
 * checking it. **This field is the r04 answer to §7.12 inside this lane.**
 *
 * The r03 seating probe decided what to measure with a list of exclusions written above the
 * loop — skip anything that is not a brick, skip anything behind the figure, skip anything more
 * than 260 mm off the centre line, skip the pelvis — and every one of those lines was a guess
 * about intent standing in for a statement of it. Five families fell through the gaps and the
 * probe reported a confident number about the rest. A piece now says what it is, and
 * `_r04a-wardrobe-probe.mjs` applies the rule for that role to every piece in the cast:
 *
 *   * `relief`  trim lying on a surface — a placket, a lapel, a seam, a fold, a strap, a badge.
 *               Must be part buried in its host, must not stand proud enough to show a lit side
 *               face, and no end of it may terminate out in the air.
 *   * `band`    a ring round a body part — a belt, a cuff, a collar, a tape, a hem, a brim, a
 *               quilting channel. The host must be inside it at every station of its own run,
 *               and it must not stand proud enough to show a lit annulus.
 *   * `wrap`    a garment volume that contains what it covers — a vest section, a coat skirt, a
 *               boot, a crown, a hood. Must contain its host; the protrusion is the garment's
 *               own bulk and is not a defect.
 *   * `carried` a prop held or hung — a briefcase, a can, a bag, a bedroll, a phone. Must touch
 *               the hand or the body part that carries it; standing clear of the trunk is the
 *               point of it.
 *   * `mounted` hardware on another piece — a buckle, a latch, a clip, a screen, an aerial. Must
 *               be buried in the piece it is mounted on, and is not measured against the body.
 */
export const PIECE_ROLES = Object.freeze(['relief', 'band', 'wrap', 'carried', 'mounted']);

/** One modelled piece. `tone` names a colour on the palette `cast.js` handed in. */
function piece(batch, anchor, pos, size, tone, extra = {}) {
  return {
    batch,
    shape: extra.shape ?? 'brick',
    role: extra.role ?? 'relief',
    anchor,
    // **The one place world scale enters lane C. g03.** Everything above is authored against
    // `AUTHORED_PROPORTIONS`, so a `P.y.chest` and a hand-measured 0.072 are in the same units
    // all the way down; this carries the pair of them onto the figure the board actually draws.
    // Angles are not lengths and are left alone.
    x: pos[0] * FIGURE_SCALE, y: pos[1] * FIGURE_SCALE, z: pos[2] * FIGURE_SCALE,
    w: size[0] * FIGURE_SCALE, h: size[1] * FIGURE_SCALE, d: size[2] * FIGURE_SCALE,
    yaw: extra.yaw ?? 0,
    pitch: extra.pitch ?? 0,
    roll: extra.roll ?? 0,
    tone,
  };
}

/** A piece on the rounded shell: anything that wraps a body part rather than sitting beside it. */
function soft(batch, anchor, pos, size, tone, extra = {}) {
  return piece(batch, anchor, pos, size, tone, { role: 'wrap', ...extra, shape: 'shell' });
}

/** A ring round a body part, sized through `bandOn` so its rim clears what is inside it. */
function band(batch, anchor, pos, size, tone, extra = {}) {
  return piece(batch, anchor, pos, size, tone, { role: 'band', ...extra, shape: 'shell' });
}

/** A crown: continuous over the top, with nothing stacked on it. */
function dome(batch, anchor, pos, size, tone, extra = {}) {
  return piece(batch, anchor, pos, size, tone, { role: 'wrap', ...extra, shape: 'dome' });
}

// —— shared sub-assemblies ———————————————————————————————————————————————————————————————
// A coat, a suit jacket and a uniform tunic are the same construction problem with different
// numbers, so each is written once and issued with a different palette and a different cut.

/**
 * The anatomy this file dresses, **at the stature the file was authored against** — see
 * `core.js` `AUTHORED_PROPORTIONS`. Every length below, derived or hand-measured, is in those
 * units, and `piece()` carries the finished garment onto the figure the board draws.
 */
const P = AUTHORED_PROPORTIONS;
/** Trunk anchors are `torso`, whose origin is the waist barrel's centre. */
const TORSO0 = P.y.torsoCentre;
const CHEST0 = P.y.chestCentre;
const PELVIS0 = P.y.pelvisCentre;

// —— relief, and the arithmetic that makes it relief rather than a batten ——————————————————
//
// **The r02 finding, stated as a number.** A trim piece was placed at a *constant* z of
// `depth.chest/2 + plane` and run the full height of the trunk. The trunk is neither a cylinder
// nor a prism: it is an elliptical stack that is 600 mm deep at the chest and 480 mm at the waist,
// and it curves away in x as well. So a 300 mm-wide pair of front edges at `plane` 0.048 stood
// **52 mm** clear of the body at the chest, **83 mm** clear at the waist, and further still at the
// hip — with a cast shadow behind every one. The critic read the result as battens, a stud frame
// and a luggage rack, and the read is correct: none of those pieces touched the garment they were
// trim on.
//
// The two functions below are the whole fix. `frontZ` asks where the surface actually is at a
// lateral station, so a piece can be seated *on* it; `bandZ` returns the z a band of a given
// height should sit at so that it is sunk into the surface at its middle and still proud of it at
// both ends, together with the pitch that keeps it following the taper. A piece placed through
// them is attached along its whole length by construction, and its shadow is a contact shadow.
//
// Both read `PROPORTIONS` only. Lane A's ring stack multiplies those by between 0.90 and 1.12,
// which is a smaller error than the inset, so a lane A change cannot strand a garment here.

/**
 * How far inside its own ring radius lane A's twelve-sided trunk actually is, between vertices.
 * Trim lands on a face; a band has to clear a vertex. The two numbers differ by 3.4 per cent of
 * the radius, which is 18 mm at the chest and is most of what an r03 relief piece stood proud by.
 */
const TRUNK_FACET = Math.cos(Math.PI / 12);

// —— the build a garment is seated against ————————————————————————————————————————————————
//
// **r05: this file used to size every piece in absolute metres off the build-1 tables, and that
// one fact was blocking two dimensions at once.**
//
// `figure.js` `buildRestPose` carries an archetype's mass on the per-slot instance scale — a
// heavier trunk, a thicker limb, a wider foot. `rig.js` holds those *surfaces* at build 1 today
// (`MASS_SURFACES`) for exactly one reason: a surface that moves while the clothes do not takes
// the clothes inside the body with it. Measured before this block existed, adopting the surfaces
// put **28 of 56 trunk-seated pieces inside the body, worst 250 mm** on the builder, and stood the
// architect's garments 100 mm off a trunk that had shrunk under them. The same hold is why
// `SOCKET_KEEP` has to cap the arm seat, and therefore why the heaviest man in the cast is not the
// widest figure on the plate.
//
// Everything below is the answer, and it is one idea: **a wardrobe piece is sized and placed
// against the surface of the figure that actually wears it.**
//
// ## Why the multipliers are read back rather than restated
//
// `resolveBuild` returns `trunk`, `limb`, `foot`, `head` and `shoulders`, and `buildRestPose` then
// *distributes* them — the ribcage takes a 0.45/0.55 blend of girth and span, the trunk masses
// take girth alone in x and z and nothing in y, the head barely moves. Restating that distribution
// here would be a hand-copied table of exactly the kind `trunkStacks` exists to have stopped
// copying: correct on the day it is written and silently wrong after the next lane A retune. So
// the ratio is *measured* off lane A's own two poses — the archetype's and the shared base's — and
// a lane A change to how mass is distributed moves this file with it and needs no edit here.
//
// Note what the ratios say about the axes, because it is load-bearing: the trunk slots scale x and
// z and **not y**, so an altitude on the trunk is build-invariant and a lateral station is not.
// The head scales on all three. A limb's `scale.y` is its own bone length over `natural`, which no
// build changes, so limbs scale in girth only. Hands are `ONE()` at every build, which is why a
// held prop's own size is left alone below.

/** The bind pose for one build, memoised. Lane A's function, called with lane F's record. */
const REST_AT = new Map();
const buildKey = (build) => (build
  ? `${build.girth ?? 1}:${build.shoulderSpan ?? build.shoulders ?? 1}:${build.weight ?? 0.5}`
  : 'base');
function restFor(build) {
  const key = buildKey(build);
  let rest = REST_AT.get(key);
  // `P`, not the live proportions: this pose is read for the *ratios* in `surfacesFor` and for
  // the trunk ring stacks in `trunkStacks`, and the stacks are lateral stations this file places
  // authored metres against.
  if (!rest) { rest = buildRestPose(P, { build }); REST_AT.set(key, rest); }
  return rest;
}

/**
 * The build this file is currently seating against.
 *
 * `buildWardrobe` installs it for the duration of one synchronous kit build and restores it after,
 * so a kit function and every helper it calls agree about whose body they are dressing without
 * threading a parameter through forty call sites. Deterministic and re-entrant: the build is a
 * pure function of the kit id, the install is not observable outside one call, and any caller that
 * wants a different body passes it explicitly to `trunkAt`.
 */
let ACTIVE_BUILD = null;

/**
 * How far each surface a garment is seated against has moved from the shared base, per axis.
 *
 * @param {object|null} build  `cast.js` `buildFor()` record, or null for the shared base
 * @returns {object} ratios: `trunk`/`pelvis`/`torso`/`chest` as `{x, z}`, and scalars for
 *                   `neck`, `head`, `limb` (arms), `leg`, `foot`
 */
const SURFACE_AT = new Map();
export function surfacesFor(build = ACTIVE_BUILD) {
  const key = buildKey(build);
  let surface = SURFACE_AT.get(key);
  if (surface) return surface;
  const at = restFor(build);
  const base = restFor(null);
  const r = (slot, axis) => at[slot].scale[axis] / base[slot].scale[axis];
  surface = Object.freeze({
    pelvis: Object.freeze({ x: r('pelvis', 'x'), z: r('pelvis', 'z') }),
    torso: Object.freeze({ x: r('torso', 'x'), z: r('torso', 'z') }),
    chest: Object.freeze({ x: r('chest', 'x'), z: r('chest', 'z') }),
    neck: r('neck', 'x'),
    head: r('head', 'x'),
    limb: r('upperArmL', 'x'),
    leg: r('thighL', 'x'),
    foot: r('footL', 'x'),
  });
  SURFACE_AT.set(key, surface);
  return surface;
}

/** The surfaces of the figure being dressed right now. */
const wear = () => surfacesFor(ACTIVE_BUILD);

/**
 * Scale a piece authored on a limb, a foot or a head.
 *
 * A garment on a limb is `body × build + clearance`, never `(body + clearance) × build`: the cloth
 * is the same thickness on a heavy man as on a lean one and only the arm inside it changes. Every
 * caller below therefore scales the *body* term and leaves its own clearance alone, which is the
 * same decomposition `bandOn` already makes on the trunk.
 */
const onLimb = (radius) => radius * wear().limb;
const onLeg = (radius) => radius * wear().leg;
const onFoot = (size) => size * wear().foot;

/** Where an elliptical section's front surface is, at a lateral station. */
export function frontZ(x, halfWidth, halfDepth) {
  const t = Math.min(1, Math.abs(x) / halfWidth);
  return halfDepth * Math.sqrt(Math.max(0, 1 - t * t));
}

/**
 * The three trunk ring stacks, **read out of `figure.js` rather than mirrored from it**.
 *
 * ## Why this import exists
 *
 * r03 held a five-stop table here, hand-copied from lane A's rings, with a comment naming the one
 * stop that could go stale. Two things then went wrong at once. The table never mentioned the
 * *pelvis*, which is the outermost trunk mass from the hip up to about `waist + 0.07`, so every
 * band seated across the hip was seated against a surface 12 mm narrower and 15 mm shallower than
 * the one that renders — and that is the squatter's belt with a wedge of trouser punched through
 * it. And the stop the comment named did go stale: lane A re-cut the deltoid ring in the same
 * round this was written.
 *
 * Lane A exports `pelvisRings`, `torsoRings` and `chestRings`. Reading them is not a lane
 * violation — nothing here edits lane A's file, and the alternative is a copy that is correct on
 * the day it is written and silently wrong afterwards. The r04 girth pass moved every one of
 * these rings, added a belly ring to the torso and re-cut the deltoid, and this file needed no
 * edit to follow it. The probe still checks the result against the built mesh, because an import
 * proves the numbers agree and not that the interpolation between them does.
 */
const trunkStacks = () => [pelvisRings(P), torsoRings(P), chestRings(P)]
  .map((rings, i) => {
    const base = [P.y.pelvisCentre, P.y.torsoCentre, P.y.chestCentre][i];
    return rings.map((r) => [base + r.y, r.w, r.d]);
  });

let TRUNK_STACKS = null;

/** Half-width and half-depth of one ring stack at an altitude, or null outside its own span. */
function stackAt(stack, y) {
  if (y < stack[0][0] || y > stack[stack.length - 1][0]) return null;
  for (let i = 1; i < stack.length; i += 1) {
    if (y <= stack[i][0]) {
      const t = (y - stack[i - 1][0]) / (stack[i][0] - stack[i - 1][0]);
      return {
        hw: (stack[i - 1][1] + (stack[i][1] - stack[i - 1][1]) * t) * 0.5,
        hd: (stack[i - 1][2] + (stack[i][2] - stack[i - 1][2]) * t) * 0.5,
      };
    }
  }
  return { hw: stack[0][1] * 0.5, hd: stack[0][2] * 0.5 };
}

/**
 * Half-width and half-depth of the **outermost** trunk surface at an altitude, **on one build**.
 *
 * Outermost, not nearest: three masses overlap over most of the trunk and a garment sits on
 * whichever of them is furthest out. That is the r03 correction.
 *
 * ## The `build` argument, which is the r05 change
 *
 * The three masses do not scale together. `figure.js` gives the pelvis and the torso girth alone
 * and the ribcage a blend of girth and shoulder span, so on the builder the chest goes out 1.41×
 * while the pelvis goes 1.475× and the two cross over where they overlap; taking one factor for
 * the trunk would put his coat skirt inside his hips to close his lapels. Each stack therefore
 * carries its own pair, read off lane A's bind pose by `surfacesFor`.
 *
 * `sx` and `sz` are how far the surface at this altitude has moved from the shared base — the
 * number a caller needs to place an **authored lateral station**, because an x written in this
 * file is a fraction of a trunk rather than an absolute metre, and a lapel that stays at 160 mm
 * while the chest goes to 1.41× is a lapel that has walked toward the sternum.
 *
 * @param {number} y            world altitude, build-1 metres (trunk masses take no y scale)
 * @param {object|null} build   `cast.js` `buildFor()` record; defaults to the kit being dressed
 * @returns {{hw:number, hd:number, sx:number, sz:number}}
 */
export function trunkAt(y, build = ACTIVE_BUILD) {
  TRUNK_STACKS ??= trunkStacks();
  const surface = surfacesFor(build);
  const factor = [surface.pelvis, surface.torso, surface.chest];
  let hw = 0;
  let hd = 0;
  let hw1 = 0;
  let hd1 = 0;
  for (let i = 0; i < TRUNK_STACKS.length; i += 1) {
    const at = stackAt(TRUNK_STACKS[i], y);
    if (!at) continue;
    hw = Math.max(hw, at.hw * factor[i].x);
    hd = Math.max(hd, at.hd * factor[i].z);
    hw1 = Math.max(hw1, at.hw);
    hd1 = Math.max(hd1, at.hd);
  }
  if (hw > 0) return { hw, hd, sx: hw / hw1, sz: hd / hd1 };
  // Below the crotch and above the neck base the trunk has ended; hold the nearest ring so a
  // caller that walks off the end gets the last real surface rather than a zero.
  const low = y < P.y.crotch;
  const stack = low ? TRUNK_STACKS[0] : TRUNK_STACKS[2];
  const ring = low ? stack[0] : stack[stack.length - 1];
  const end = low ? surface.pelvis : surface.chest;
  return { hw: ring[1] * 0.5 * end.x, hd: ring[2] * 0.5 * end.z, sx: end.x, sz: end.z };
}

/**
 * An authored lateral station, moved on to the build being dressed.
 *
 * Written as its own function rather than inlined because it is the half of the r05 change that
 * is easy to forget: `trunkAt` alone fixes the *depth* a piece is seated at and leaves every
 * placket, lapel, strap and pouch sitting at the millimetre it was authored at on a body that is
 * now half as wide again.
 */
const across = (x, y, build = ACTIVE_BUILD) => x * trunkAt(y, build).sx;

/**
 * Size a **band** so that it clears what is inside it at both rims and stands `relief` proud at
 * its middle — the two constraints written out at `SHELL_RIM`, solved rather than guessed.
 *
 * `relief` is a floor, not a target: where the host is wide enough that the requested relief
 * would leave the rim inside the body, the band opens up until the rim clears, and the returned
 * `relief` says how much it actually stands. A caller that wants to know whether its band is a
 * change of surface or a shelf reads that number.
 */
function bandOn(hw, hd, relief = 0.022, { clearance = 1.004 } = {}) {
  const need = Math.max(hw, hd) * (clearance / SHELL_RIM - 1);
  const r = Math.max(relief, need);
  return { w: (hw + r) * 2, d: (hd + r) * 2, relief: r };
}

/** A band round the trunk at a world altitude: the size, ready to spread into `band()`. */
function trunkBand(y, relief = 0.022) {
  const { hw, hd } = trunkAt(y);
  return bandOn(hw, hd, relief);
}

/**
 * Seat a vertical band of trim on the trunk: the depth to build it at, the z of its centre, and
 * the pitch that keeps its face parallel to the surface it lies on.
 *
 * **A band is specified by how far it stands proud and how far it is buried, not by a thickness
 * and an offset.** `relief` is the cloth that shows; `bury` is the tail that guarantees contact.
 * The piece is `relief + bury` deep, so the back face is inside the body everywhere the fit is
 * good and the front face is proud everywhere — which is §2.5's test stated as two numbers a
 * reader can check.
 *
 * The pitch is a chord through the surface at the band's two ends, and the trunk is not straight,
 * so `bury` also has to absorb the sag between chord and curve. That sag is 11 to 23 mm over the
 * runs used here and `bury` is 34 to 40, which is the margin. **The one thing that must not
 * happen is a band whose span crosses the waist in both directions** — the trunk is concave there,
 * a chord sits *outside* the surface at the pinch, and no `bury` fixes a band that is proud in the
 * middle and gone at both ends. Every caller below runs from at or below the waist upward.
 */
function bandZ(x, yLow, yHigh, {
  relief = 0.020, bury = 0.036, xHigh = null, roll = 0, hug = false,
} = {}) {
  const lo = trunkAt(yLow);
  const hi = trunkAt(yHigh);
  // **The stations move with the body, and the solve reports where they landed.** A caller hands
  // in the x it authored on the shared base; what comes back is the x on the build being dressed,
  // so the piece is placed at the station its own seat was solved for and the two cannot disagree.
  // Both are needed: a rolled piece is seated from two different stations at its two ends.
  const lowX = x * lo.sx;
  const highX = (xHigh ?? x) * hi.sx;
  // **Seat against the polygon, not against the ellipse it is inscribed in.** `trunkAt` returns
  // the radius lane A's ring *vertices* sit at, which is what a band has to clear; but the faces
  // between those vertices lie `cos(15°)` inside it — **18 mm** on a 530 mm chest half-width —
  // and a flat piece of trim lands on a face, not on a vertex. r03 seated every placket, lapel
  // and strap against the vertex radius, so a placket authored 9 mm proud measured 31 mm on the
  // r04 probe and the r03 critic read a white panel with two lit side faces on four heroes.
  // Seating on the face radius puts the same piece flush where it lands and buried where it
  // crosses a vertex, which is what `bury` is for.
  const zLow = frontZ(Math.abs(lowX), lo.hw, lo.hd) * TRUNK_FACET;
  const zHigh = frontZ(Math.abs(highX), hi.hw, hi.hd) * TRUNK_FACET;
  const span = Math.max(0.04, yHigh - yLow);
  // **The roll term, bought by the probe rather than by eye.** A rolled piece does not run up its
  // own y axis: under Euler YXZ its long axis is `(−sin r, cos r cos p, cos r sin p)`, so a lapel
  // at half a radian of roll walks 80 mm sideways over its own length into a surface that has
  // fallen 90 mm away. Seating it from a single lateral station tilted the plane at a twentieth of
  // the slope it needed, and `mvp/tests/_r03a-relief-probe.mjs` measured the result at 5 mm of
  // daylight at one end and 8 mm buried at the other. The end stations are passed in and the pitch
  // is solved for the *rolled* run, which is what puts the plane back on the body.
  const sin = Math.min(0.9, Math.max(-0.9, (zHigh - zLow) / (Math.max(0.2, Math.cos(roll)) * span)));
  /**
   * **`hug`: seat the plane against the crest of the run, not against its chord. r3.**
   *
   * The chord through the two end stations lies *inside* a convex run by the sagitta of that run
   * — 11 mm on the vest's belt-to-chest panel — so a piece seated on the chord and given `relief`
   * millimetres of standoff has `relief − sag` at its middle and `relief` at its ends. When the
   * sag exceeds the relief the middle of the piece is inside the body and only its rims are
   * drawn, which is exactly what happened to the hi-vis panels in r2 (89–92 % buried, 0 mm face
   * clearance, and `v370-l2-r3-shows.mjs` measuring 4.1–5.7 % of each panel on the plate).
   *
   * With `hug` the run is sampled and the plane pushed out until its *closest* approach to the
   * surface is `relief`. The middle then carries the authored standoff and the ends carry
   * `relief + sag`, which is a garment hem standing off a shirt rather than a plate hovering over
   * a chest. It costs nothing at run time — nine `frontZ` evaluations at build.
   *
   * Off by default: every other caller runs over a short or nearly straight span where the sag is
   * a millimetre or two, and moving them is a change nobody measured.
   */
  let sag = 0;
  if (hug) {
    for (let k = 1; k < 9; k += 1) {
      const f = k / 9;
      const y = yLow + (yHigh - yLow) * f;
      const at = trunkAt(y);
      const zSurface = frontZ(Math.abs((x + ((xHigh ?? x) - x) * f) * at.sx), at.hw, at.hd) * TRUNK_FACET;
      const zPlane = zLow + (zHigh - zLow) * f;
      if (zSurface - zPlane > sag) sag = zSurface - zPlane;
    }
  }
  return {
    depth: relief + bury,
    z: (zLow + zHigh) * 0.5 + sag + (relief - bury) * 0.5,
    pitch: Math.asin(sin),
    /** The seated plane, so a piece can be stacked on this one instead of on the body. */
    zLow: zLow + sag,
    zHigh: zHigh + sag,
    relief,
    sag,
    /** The stations this seat was solved at, on the build being dressed. */
    x: lowX,
    xHigh: highX,
    /** The lateral scale at the piece's own mid-height, for sizing its width. */
    sx: (lo.sx + hi.sx) * 0.5,
  };
}
// The head origin is the midpoint of chin and crown, so the crown line is at `+headHeight/2`
// local and lane B's cranium tops out below it at +0.313. Headwear altitudes below are read off
// that skull rather than off the crown line, which is why they look low against the head box.

/**
 * A jacket, coat or tunic.
 *
 * **The trunk itself is the garment; these pieces are what make it read as one.** Two earlier
 * versions built the coat as panels enclosing the body — first one full-height box, then two
 * bands — and both came back off the hero plate as a carton with a head on it. The reason is
 * structural rather than dimensional: lane A's chest mass already has the trapezius slope and the
 * chest-over-waist overhang that §2.1 grades, and a panel shell hides all of it behind four flat
 * vertical faces. So `cast.js` gives the chest and waist segments the garment's own colour, and
 * what is modelled here is only what a body cannot be: a collar standing on the neck, a sleeve
 * head over each shoulder, two front edges with a real opening between them, a placket of shirt
 * in that opening, lapels, a skirt below the hip where there is no body to carry the cloth, and a
 * hem a plane away from all of it.
 *
 * The collar, the sleeve heads and the skirt are shells because each of them wraps something. The
 * placket and the lapels stay bricks because each of them genuinely is a flat plane of cloth with
 * an edge — but each is now seated through `bandZ`, so the plane it lies in is the plane of the
 * body under it.
 *
 * `front` is `'open'`, `'closed'` or `'none'`. An open coat parts over a placket of shirt; a
 * closed uniform tunic has a button seam and no opening at all; `'none'` is for a tunic worn under
 * a vest, where the whole front is covered and any strip drawn on it can only fight the garment
 * above.
 *
 * **r03: the two full-height front edges are gone, and that is the round's largest single
 * deletion.** They were a pair of 90 × 50 mm bricks running shoulder to hem at a *constant* z on a
 * trunk that loses 120 mm of depth over that span, so they stood between 50 and 100 mm clear of
 * the body along most of their length with daylight and a cast shadow behind them. They were on
 * eight of eleven figures and they are most of what the r02 critic graded as battens, a stud frame
 * and four planks down a coat front. A coat's front edge is not a bar in front of a chest; it is
 * where the cloth stops, and what says so is the placket showing between the two halves and the
 * lapels turning back at the top. Both of those are kept, both are now relief, and the plank pair
 * that carried nothing is not replaced.
 *
 * `lapelStyle` is `'notch'`, `'peak'`, `'shawl'` or `null`, and it exists because §2.6 grades a
 * cast that cannot be paired by outline. One lapel kit on four office figures is a mannequin
 * redressed however good the kit is.
 */
function jacket({
  tone, collar, top = P.y.shoulder, hem = P.y.hip, plane = 0.035, gap = 0.03, flare = 0.03,
  lapel = null, placket = null, frontW = 0.30, sleeveHead = true, front = 'open', edge = null,
  lapelStyle = 'notch',
}) {
  const out = [];
  const trunkHem = Math.max(hem, P.y.hip - 0.04);
  const edgeTone = edge ?? lapel ?? tone;

  // —— the front ————————————————————————————————————————————————————————————————————
  //
  // One centre band, seated on the surface rather than in front of it, and a mode.
  //
  // It runs from just under the waist to the chest rather than shoulder to hem, and that span is
  // load-bearing rather than aesthetic: the trunk pinches at the waist and swells again at the
  // chest, so any band that starts below the pinch and ends above it sits on a chord that leaves
  // the surface at the pinch and rejoins it at both ends. Above the chest the trapezius turns too
  // hard for a flat strip; that is the lapels' ground and they are short enough to lie on it.
  const frontTop = Math.min(top, P.y.chest);
  // **r05 raises the bottom of this run above the pinch, and that is the placket notch.**
  //
  // The r03 critic read *"a white panel whose notched swallow-tail bottom terminates in mid-air"*
  // on four heroes; r04 narrowed the panel and the notch survived, correctly diagnosed as a flat
  // brick's bottom corners exiting a curved trunk and therefore not something relief could reach.
  // The measurement that closes it is the trunk's own depth profile: half-depth falls from 380 mm
  // at the hip to a minimum of **344 mm at `waist + 0.044`** and rises again to 408 at the chest.
  // A run from `waist − 0.10` spans that minimum, so its chord passes **36 mm outside** the
  // surface at the pinch against a 55 mm tail — and the two bottom corners, another 7 mm back on
  // the ellipse, are the part of it that comes out. Started above the pinch the same chord sits
  // 8 mm *inside* a monotonically swelling surface and there is no corner left to exit.
  //
  // It closes the second carried finding as a consequence rather than as a second fix. A placket
  // is the shirt showing in a jacket's opening; run from below the navel it was a 546 mm pale
  // panel from the sternum to the belly, which is what two critics have now read as *"the jacket
  // ends at the sternum, exposing the undershirt"*. At 352 mm it starts at the chest and stops at
  // the top of the waist, with the lapels either side of it, which is where a shirt shows.
  const frontLow = Math.max(trunkHem, P.y.waist + 0.095);
  const frontH = frontTop - frontLow;
  const frontMid = (frontTop + frontLow) * 0.5 - TORSO0;
  if (frontH > 0.04 && front !== 'none') {
    if (front === 'closed') {
      // A button seam on a closed tunic: 14 mm of cloth showing on a 34 mm tail, so the piece
      // reads as a seam rather than as a strip glued on. It stays *under* anything worn over the
      // tunic, which is why the policeman's is suppressed entirely.
      // **r3: `hug`.** Same fault as the hi-vis panels, one piece over — the run crosses the
      // step between the waist barrel and the chest mass, so a chord seat put the whole seam
      // inside the body. `v370-l2-r3-shows.mjs` read this piece and the placket below it at
      // **0.0 cm² drawn on eight archetypes**.
      const seat = bandZ(0, frontLow, frontTop, { relief: 0.010, bury: 0.034, hug: true });
      out.push(piece(
        'accent', 'torso', [0, frontMid, seat.z], [0.062 * seat.sx, frontH, seat.depth], edgeTone,
        { pitch: seat.pitch },
      ));
    } else if (placket) {
      // The shirt in the opening, on the body rather than a plane in front of it.
      //
      // Sized three times now and every time off a plate. r01b made it a 60 mm ribbon inside a
      // 300 mm opening and the r01 critic read it as a fluorescent tube; the r02 pass filled the
      // opening at 280 mm on a *constant* z and the rival developer came back wearing a blank
      // cream clipboard taped to his chest, which is the same defect as the battens beside it.
      // Seated into the surface it stops being a panel and becomes the shirt.
      // **Ten millimetres of relief, not twenty, and it is the r03 plate that says so.** At 20 mm
      // the broker and the developer both came back with a pale rectangle whose *side* faces were
      // lit — a card taped to a chest, which is the r02 charge arriving one piece later. The
      // placket is the only trim on the cast in a tone thirty points off its host, so it is the one
      // piece whose thickness reads before its shape does. Ten millimetres against a chord sag of
      // three leaves it attached everywhere and turns a slab into a change of surface.
      //
      // **r04 narrows it, and the reason is the notch rather than the thickness.** The r03 critic
      // read this piece off four heroes as *"a white panel whose notched swallow-tail bottom
      // terminates in mid-air"*, and the swallow tail is the two bottom corners of a flat brick
      // cutting out through a curved trunk — the same mechanism this file already recorded on the
      // badge plate, where the intersection of a box corner with an ellipse is a triangle. A
      // 207 mm panel puts its corners 104 mm off the centre line, where the trunk's own surface
      // has already fallen 11 mm back, so 10 mm of relief at the middle is 21 mm at the corner
      // and the corner is what the eye finds. 0.60 of the opening rather than 0.74 keeps the
      // corners inside the surface; the shirt reads by value, and it did not need the width.
      const seat = bandZ(0, frontLow, frontTop, { relief: 0.009, bury: 0.055, hug: true });
      out.push(piece(
        'accent', 'torso', [0, frontMid, seat.z], [frontW * 0.60 * seat.sx, frontH, seat.depth],
        placket, { pitch: seat.pitch },
      ));
    }
  }

  // —— the skirt ————————————————————————————————————————————————————————————————————
  //
  // Below the hip there is no body under the coat, so the cloth is modelled. Two shells rather
  // than one, the upper close to the hip and the lower flared, because r01b's single shell from
  // hip to mid-thigh was one rigid drum with a clean horizontal hem and came off the plate as a
  // kilt — at lineup scale the rival developer read as a figure in a dress. A coat that narrows
  // under the hip and opens again at the hem has a waist in its outline, which is what §2.1
  // grades and what the drum threw away.
  const skirtTop = P.y.hip - 0.06;
  // **A coat is "long" when it continues past the hip mass, not when it clears an arbitrary
  // 80 mm.** r03's threshold sat inside the band the short kits' hems occupy, so lowering a hem
  // by a hand's width flipped a jacket into a skirted coat. It is the crotch now, which is where
  // there stops being a body under the cloth and the cloth has to be modelled — the sentence this
  // whole passage is written from.
  const long = hem < P.y.crotch - 0.02;
  if (long) {
    const split = hem + (skirtTop - hem) * 0.45;
    // Below the hip there is no body to ask, so the skirt is sized off the hip it hangs from and
    // that hip is the pelvis, which carries the build. Only the body term scales: `plane` and
    // `flare` are cloth and are the same on every figure.
    const hip = trunkAt(P.y.hip);
    const wTop = P.width.hip * hip.sx + plane * 2 - 0.02;
    const dTop = P.depth.hip * hip.sz + plane * 2;
    const wLow = P.width.hip * hip.sx + plane * 2 + flare;
    const dLow = P.depth.hip * hip.sz + plane * 2 + flare + 0.03;
    out.push(
      soft('accent', 'torso', [0, (skirtTop + split) * 0.5 - TORSO0, -0.010], [wTop, skirtTop - split, dTop], tone),
      soft('accent', 'torso', [0, (split + hem) * 0.5 - TORSO0, -0.014], [wLow, split - hem, dLow], tone),
      // One fold, down the centre front, where a coat's opening actually falls. Sunk into the
      // skirt's own surface for the same reason everything else here is: the r02 ridge stood
      // 30 mm off a shell that is already turning away, and it read as a navy batten running from
      // the chest through the hem flange to mid-thigh.
      // Short, and inside the shell's own cylindrical middle. Run full height it crossed both rim
      // tapers, where a shell has already closed to 0.84 of its width — so the fold stood 35 mm
      // proud at top and bottom and read on the r03 plate as a pale bar hanging past the hem. The
      // r02 critic called the same object a navy batten running through the flange.
      // Sunk 34 mm rather than 20 into a shell that is 4.5 per cent narrower at its own rims than
      // at its middle, and shortened to 0.46 of the skirt so both of its ends stay inside the
      // cylindrical zone. At 0.56 the r04 probe measured the top end 71 mm out in the air.
      piece('accent', 'torso', [0.01 * hip.sx, (skirtTop + hem) * 0.5 - TORSO0, dLow * 0.5 - 0.034],
        [0.05, (skirtTop - hem) * 0.46, 0.052], edgeTone),
    );
  }
  // **The hem lip is gone from long coats and halved on short ones — the r02 "triple stacked hem
  // flange" and the "hip flange on four".**
  //
  // A long coat's hem was a third ring 50 mm wider than the skirt section above it, so the
  // developer's outline stepped *out* twice below the hip and the critic read a tutu. The lower
  // skirt section already ends in a rim; that rim is the hem, and it needs nothing on top of it.
  //
  // A short jacket still needs one, because below it the pelvis carries the trouser colour and
  // there has to be an edge where the coat stops.
  //
  // **r04 sizes it off the body instead of off the hip proportion, and that closes the r03
  // critic's whole "belt family".** The r03 lip was `hip + 2·plane + 16 mm` wide whatever was
  // underneath it, and what is underneath it is the *pelvis*, which lane A carries out to its own
  // full width from the hip up to past the waist. On the squatter that put a 944 mm ring on an
  // 845 mm mass: **49 mm proud with a lit top face**, and its own rim closed to 793 mm, 52 mm
  // *inside* the pelvis, so the trouser came out through the middle of the band's run. That is
  // the mustard belt with a cut end and a wedge of navy punched through it, and the separate tab
  // beside it is the far side of the same ring reappearing. `trunkBand` asks the trunk how wide
  // it is at the lip's own altitude and returns the smallest ring whose rim still clears — 22 mm
  // of relief instead of 49, with nothing punching through it.
  if (!long) {
    const lipY = hem + 0.062;
    const fit = trunkBand(lipY, 0.012);
    out.push(band(
      'accent', 'torso', [0, lipY - TORSO0, 0], [fit.w, 0.130, fit.d], tone,
    ));
  }
  // The collar sits ON the neck: its anchor is the neck segment, so a head turn carries it.
  //
  // 1.30 of the neck, not 1.62. The neck measures 268 mm across where the collar sits and r01b
  // put a 413 mm ring on it — fifty-four per cent proud, standing clear all round, and the r01
  // critic read it off three separate heroes as a lifebuoy. A collar is a garment thickness of
  // cloth turned up round a neck; it is also *lower*, so its bottom disappears into the
  // trapezius instead of floating at mid-throat.
  //
  // Sized through `bandOn` in r04 like every other ring on the figure. The neck flares into the
  // trapezius, so the collar is fitted to the flare rather than to the shaft: 1.55 of the neck
  // width is lane A's own bottom ring.
  // 1.20 of the neck, at the collar's own altitude. Lane A's neck flares to 1.55 at its bottom
  // ring and closes to 1.06 by a third of the way up, and r04's first pass sized the collar to
  // the flare — which is inside the chest — so it stood 69 mm proud of the shaft it is actually
  // round. 1.20 is the surface at the station the collar sits at.
  // 1.16 of the neck, over a 120 mm run that stays on the shaft. Lane A's neck flares from 1.06
  // to 1.55 across its bottom 90 mm, and a ring cannot fit a cone: r03 ran the collar 150 mm tall
  // straight across that flare, so it stood 24 mm proud at the top and had the trapezius coming
  // out through it at the bottom. Shorter and higher, it is on the shaft along its whole run and
  // its own bottom rim is still inside the chest.
  const neck = wear().neck;
  const collarFit = bandOn(P.width.neck * 1.16 * 0.5 * neck, P.depth.neck * 1.16 * 0.5 * neck, 0.010);
  out.push(band(
    'accent', 'neck', [0, -0.056, 0.008 * neck], [collarFit.w, 0.120, collarFit.d], collar ?? tone,
  ));
  // **The sleeve head, moved off the shoulder and on to the arm. This is the r03 critic's
  // "shoulder-cap family", which he found on all eleven figures.**
  //
  // It was one shell per side anchored to the *chest* at x ±447, 325 mm across — so it reached
  // 610 mm off the centre line against a deltoid ring that ends at 468, and 143 mm of it hung out
  // past the shoulder in the air with a seam along its bottom. On the builder it reads as a khaki
  // cube, on the agent, broker, developer, architect and policeman as a grey plate, and on every
  // one of them it breaks the shoulder line §2.1 grades.
  //
  // The piece it was standing in for no longer has a job: lane A's chest tops out at the deltoid
  // width and the upper arm is seated inside it, so there is no daylight at the glenohumeral
  // joint to bridge. What a set-in sleeve actually is, is a *seam round the top of the arm*, and
  // that is what this is now — a band on `upperArm`, 14 mm proud of the sleeve, inside the
  // shoulder silhouette rather than hanging off it.
  if (sleeveHead) {
    const armFit = bandOn(onLimb(P.segment.upperArm.top * 0.5), onLimb(P.segment.upperArm.top * 0.5), 0.013);
    for (const side of ['upperArmL', 'upperArmR']) {
      out.push(band(
        'accent', side, [0, P.segment.upperArm.length * 0.5 - 0.075, 0],
        [armFit.w, 0.135, armFit.d], tone,
      ));
    }
  }
  if (lapel && front !== 'closed' && lapelStyle) {
    // **Relief, and four of them rather than one.**
    //
    // r01b and the r02 pass both set the lapels 60 mm proud on a constant plane, and the r02
    // critic read the same pair on the agent, the architect, the broker, the arsonist and the
    // family — one kit on eight figures, which is §2.6's own defect. Two things change. Each lapel
    // is seated by `bandZ` against the surface it lies on, so it is turned back off the coat
    // rather than hung beside a neck. And the cut differs by role: a notch is short and steep on a
    // working suit, a peak is long and laid flatter on an expensive coat, a shawl is one
    // continuous roll with no notch in it at all.
    const cut = {
      notch: { height: 0.28, roll: 0.34, drop: 0.14, spread: 0.008, width: 1.00 },
      peak: { height: 0.34, roll: 0.42, drop: 0.11, spread: 0.020, width: 1.22 },
      shawl: { height: 0.32, roll: 0.16, drop: 0.13, spread: -0.012, width: 1.34 },
    }[lapelStyle] ?? { height: 0.28, roll: 0.34, drop: 0.14, spread: 0.008, width: 1.00 };
    const edgeW = Math.min(0.090, 0.055 + frontW * 0.11) * cut.width;
    const x = frontW * 0.5 + gap - 0.008 + cut.spread;
    const midY = top - cut.drop - cut.height * 0.5;
    // A positive roll carries the *bottom* of the lapel outboard and its top inboard, which is
    // what a lapel does — it opens away from the button and closes at the collar.
    // **16 mm of relief in r04, not 27.** The r03 plate puts these on the property agent as two
    // dark bars with a lit side face and both ends cut in mid-air, and 27 mm is why: a lapel is a
    // fold of the same cloth turned back on itself, so it is one garment thickness proud and no
    // more. The bury goes up by the same amount, so the tail that holds it on is unchanged.
    const swing = Math.sin(cut.roll) * cut.height * 0.5;
    const seat = bandZ(x + swing, midY - cut.height * 0.5, midY + cut.height * 0.5,
      // **r3 tried `hug` here and backed it out, and the measurement is why.** The architect's
      // pair is 100 % buried on `_r04a` and drew 0.0 cm², so the same crest seat that rescued the
      // placket should apply. It does not: a lapel carries a `roll`, its plane walks laterally
      // over its own run, and hugging the crest of that walk took **six** lapels across the cast
      // over the 26 mm proud ceiling and cut two ends in mid-air. Trading two SWALLOWED pieces
      // for six PROUD ones is trading a §2.5 absence for a §1.2 major, so the seat stands and the
      // architect's lapels are named as still open. The fix is a rolled-run crest solve, which is
      // a `bandZ` change and not a number change.
      { relief: 0.016, bury: 0.054, xHigh: x - swing, roll: cut.roll });
    // The station and the width both travel with the chest. A lapel held at its build-1 metre on
    // the builder's 1.41× ribcage is a lapel that has walked 66 mm toward his own sternum, which
    // is §2.6 read as a garment that does not belong to the body wearing it.
    for (const side of [-1, 1]) {
      out.push(piece(
        'accent', 'torso', [side * x * seat.sx, midY - TORSO0, seat.z],
        [edgeW * seat.sx, cut.height, seat.depth],
        lapel, { roll: side * cut.roll, pitch: seat.pitch },
      ));
    }
  }
  return out;
}

/**
 * An under-layer showing below an outer one: a body and a stepped hem. Two shells.
 *
 * The two flat side panels this replaces are why the r01 critic read the squatter's chest as a
 * wooden crate: 50 mm bricks standing at the widest point of the waist, with the coat's own front
 * edges beside them, cut the whole torso into vertical slats with dark gaps between. An
 * under-layer is not visible at the sides of a coat that is wider than it. It is visible *below*
 * the coat, which is what a stepped hem is, and that is the only place it is modelled now.
 */
function layer({ tone, top = P.y.hip - 0.10, hem = P.y.hip - 0.22, plane = 0.008 }) {
  const height = top - hem;
  const midY = (top + hem) * 0.5 - TORSO0;
  // Sized off the pelvis at the layer's own altitude rather than off the hip proportion. The r03
  // body ran `hip + 2·plane + 20 mm` over a mass that has already narrowed below the hip, and its
  // *corner* is the saturated cyan triangle the r03 critic found at (712, 865) on
  // `hero--squatter.png` floating on a navy trouser and attached to nothing: it is this shell's
  // rim, closed to 0.84 of its width, coming out through the pelvis on the far side.
  const bodyFit = trunkBand((top + hem) * 0.5, 0.014 + plane);
  const hemFit = trunkBand(hem + 0.048, 0.020 + plane);
  return [
    soft('accent', 'torso', [0, midY, -0.004], [bodyFit.w, height, bodyFit.d], tone),
    // The stepped hem. Its job is one visible edge of a second garment below the first, so it is
    // a band on the same fit rather than a wider ring stacked on the body one.
    band('accent', 'torso', [0, hem - TORSO0 + 0.048, 0], [hemFit.w, 0.115, hemFit.d], tone),
  ];
}

/**
 * The sleeve, on the forearm, and where it ends.
 *
 * §2.5's test is *"a sleeve ends at a wrist and the hand continues past it in skin"*, and both
 * earlier readings of it failed on the same count: they put a **band** on a bare forearm and left
 * the real sleeve end up at the elbow, where the garment-coloured upper arm meets skin. Every
 * figure in the cast therefore had two sleeve ends per arm, and the r01 critic read the lower one
 * as a bracelet on all five heroes.
 *
 * There is one end per arm now, and which end depends on the garment:
 *
 *   * `long` — the sleeve continues over the forearm in the garment's own colour and stops 50 mm
 *     short of the wrist, its lower rim gathering as a cuff. Order down the arm: shoulder, sleeve,
 *     elbow, sleeve, cuff, wrist, hand. The only skin below the shoulder is wrist and hand.
 *   * `short` — the sleeve stops on the *upper* arm above the elbow and the whole forearm is skin,
 *     which is what a trades shirt does and what the reference builder wears.
 *
 * Two shells either way, so the change costs nothing. `dirt` tones the cuff for a work garment;
 * §2.8 puts wear where hands go, and the cuff is where hands go.
 */
function sleeves(tone, { kind = 'long', dirt = null } = {}) {
  if (kind === 'short') {
    const half = P.segment.upperArm.length * 0.5;
    return ['upperArmL', 'upperArmR'].map((side) => soft(
      'accent', side, [0, -half + 0.055, 0],
      [P.segment.upperArm.bottom + 0.055, 0.105, P.segment.upperArm.bottom + 0.055], dirt ?? tone,
    ));
  }
  // **The sleeve now covers the elbow, and that closes the r02 "hard ring at the forearm on
  // office figures as well as trades".**
  //
  // Measured rather than guessed. `figure.js` closes a limb with a dome that overhangs its joint
  // by `capRise` of the segment length — 0.21 × 558 mm = **117 mm** above the forearm's own shaft
  // top. The r02 sleeve started at the shaft top, so on every long-sleeved figure in the cast
  // there were 117 mm of bare skin dome between the garment-coloured upper arm and the sleeve: a
  // pale band across the middle of a dark forearm, which is the bracelet, and it is skin rather
  // than wear. The sleeve is raised 100 mm to bury it. Its rim closes to 0.84 of 280 mm = 235 mm
  // against a dome 124 mm across at that station, so it clears rather than sawing.
  const half = P.segment.forearm.length * 0.5;
  const low = -half + 0.055;
  const high = half + 0.100;
  const height = high - low;
  return ['forearmL', 'forearmR'].map((side) => soft(
    'accent', side, [0, (low + high) * 0.5, 0],
    [P.segment.forearm.top + 0.040, height, P.segment.forearm.top + 0.040], dirt ?? tone,
  ));
}

/**
 * A trouser hem breaking over the boot, plus the dirt §2.8 asks for on a work leg.
 *
 * ## The knee band, and why the sign inverted
 *
 * **r02 reported this patch as "always darker than its host" and the plate refutes it: measured
 * off `hero--cheap-builder.png` the band runs L\* 44 to 49 against a trouser at 40 above and 45
 * below, with a hard step at each edge and a saturated blue facet on its outer corner.** The
 * authored albedo was never the problem — `#49412d` is eight points *under* the trouser it sits
 * on. Three things inverted it, and all three are geometry rather than colour:
 *
 *   1. **It was a 150 mm shell, so it was mostly rim.** A shell closes to 0.84 of its width across
 *      the top and bottom twenty-two per cent of its height, which on a 150 mm section is a 33 mm
 *      taper closing 23 mm of radius — a **35° annular facet** at each end, on a leg whose own
 *      sides are vertical. A facet tilted 35° toward a high key does not render at its albedo. It
 *      is the same mechanism this file already recorded at the boot toe, where three attempts at a
 *      toecap all came back cream and the piece was deleted for it.
 *   2. **It was a ring.** Dirt on a knee is on the front of one; a band that continues round the
 *      calf is a pad or a bandage, which is exactly what the critic named.
 *   3. **It drew on `accent` against a host on `legGarment`** — different roughness, different
 *      environment and a different grain — so even at a matched value it would have read as a
 *      separate object rather than as a mark on the trouser.
 *
 * ## What replaces it
 *
 * One tall section per leg, from inside the knee to inside the boot, standing **7 mm** proud. Its
 * top rim is buried under the thigh's own overhanging dome (`capRise` puts that 130 mm below the
 * knee joint) and its bottom rim is buried inside the boot shaft, so **neither rim is exposed at
 * any point** and there is no annular facet anywhere on it. What is visible is 700 mm of trouser
 * in a darker value with soft vertical shading, which is what §2.8 asks for — *"a broad soft patch
 * of a different value, read at a glance"* — and it is where a work trouser actually dirties.
 * Office archetypes pass no dirt tone and get none, which is the pressed-against-unpressed
 * distinction the dimension exists for.
 *
 * The hem then genuinely breaks over the boot. It was 220 mm across, sitting 100 mm up the shin,
 * against a boot shaft 269 mm across — narrower than the boot and stopping clear above it, which
 * is why the r02 critic found the break on nobody. It is now 285 mm and drops to overlap the
 * shaft, so the cloth bunches on the leather instead of stepping away from it.
 *
 * ## r04: the hem comes off the dirt tone, and that is what stops the patch being a gaiter
 *
 * The geometry above survived r03's critic and the value did not: he measured the builder's patch
 * at **−27 L\*** against its host where the round had claimed −13, and said that at that
 * magnitude it stops reading as dirt and reads as a gaiter. `cast.js` carries the value half of
 * that correction. The half that lives here is the *extent*: r03 gave the hem band the same
 * `patch` tone as the leg, so the dark ran from below the knee into the boot with nothing between
 * them, and `value-hero--cheap-builder.png` shows one unbroken black mass from knee to floor. A
 * trouser hem is the part of the leg that bunches on the boot; it is not the dirtiest part of it.
 * The hem draws in the trouser's own tone now, so there is a band of clean cloth between the
 * patch and the leather and the patch has a bottom edge that is cloth rather than boot.
 */
function trouserBreak(tone, { dirt = null } = {}) {
  const half = P.segment.shin.length * 0.5;
  const out = [];
  // Both rims are buried, and both clearances are arithmetic rather than taste. The top rim closes
  // to 0.84 × 288 = 242 mm at 45 mm above the knee joint, where the thigh's overhanging dome
  // measures 254 mm, so the two cross 6 mm apart — under two pixels at hero distance, at the one
  // station on the leg where the eye already expects a break. The bottom rim sits 50 mm above the
  // shin's own end, inside both the hem below it and the boot shaft below that.
  const low = -half + 0.050;
  const high = half + 0.045;
  /**
   * **r3: both of these were still in metres, and neither of them was drawn.**
   *
   * The widths here — 0.288, 0.285, 0.292, 0.296 — read as millimetres in the comment above and
   * are the r04 numbers this file used before the r05 note at `piece()` moved every size onto
   * `AUTHORED_PROPORTIONS`. `piece()` now multiplies by `FIGURE_SCALE = 0.4946`, so a "288 mm"
   * patch is built 162 mm across against a shin **236 mm** across: 31 % narrower than the leg it
   * is worn on, at every station of its run.
   *
   * Measured with `mvp/tests/v370-l2-r3-shows.mjs`: **0.0 cm² drawn on twenty pieces across ten
   * archetypes** — every trouser hem and every dirt patch in the cast. `_r04a` books them as
   * SWALLOWED, which is 20 of the 28 SWALLOWED flags the r2 critic named without attributing, and
   * §2.8's wear cannot be on the plate when the piece that carries it is inside the leg.
   *
   * The shin's own authored diameter is `P.segment.shin.top`, which is exactly what `rig.js`
   * hands the slot as its instance scale, so the sizes come off it plus a relief — the pattern
   * `sleeves()` already uses two functions up. The hem takes the larger relief so it bunches over
   * the patch rather than into it.
   */
  const shinW = P.segment.shin.top;
  for (const side of ['shinL', 'shinR']) {
    if (dirt) {
      out.push(soft('accent', side, [0, (low + high) * 0.5, 0.004],
        [shinW + 0.030, high - low, shinW + 0.034], dirt));
    }
    out.push(soft('accent', side, [0, -half + 0.052, 0.008],
      [shinW + 0.048, 0.190, shinW + 0.052], tone));
  }
  return out;
}

/**
 * The boot. Four shells a foot: a shaft round the ankle, a vamp over the whole last, a rubber
 * sole under it and a scuffed toe cap at the front.
 *
 * **The defect nobody had named until the r01 critic did.** Every figure in the cast wore what
 * read as an open sandal over a dark sock: a dark upper, a maroon block and a pale tan strap lying
 * across the toe box. It is three objects and a hole. The r01b boot's upper was 255 mm deep on a
 * 375 mm foot and centred behind the ankle, so **the front half of lane A's foot mesh was never
 * inside the boot at all** — it emerged as a separate wedge, and because that mesh draws on the
 * leather family at roughness 0.52 against the boot's 0.60, a near-black last lit by a blue-white
 * sky rendered blue in front of a brown boot. The toecap was then a 112 mm band laid across the
 * top of it, ten points lighter, which is the tan strap.
 *
 * The vamp now runs the full length of the last and contains it at every station — checked in
 * plan, where both are ellipses, and in elevation, where the last tops out 36 mm below the ankle
 * and the vamp's flat band covers it.
 *
 * **The separate toe cap is gone, and that is the second correction — a trade, taken on evidence.**
 * Three r02 plates in a row put a pale band back across the toe box. Ten points above the upper
 * gave a cream wedge; five points above gave a smaller cream wedge; four points *below* still gave
 * a cream sliver, because the value of the piece was never the mechanism. The toe is where a
 * boot's grazing facets are, a separate shell there stands ten millimetres proud of the vamp by
 * construction, and a proud ring on a strongly lit convex tip takes a specular lobe that no
 * albedo in the palette survives. §2.8 asks for a scuffed toecap and this lane cannot deliver one
 * as geometry without re-drawing the defect §2.5 exists to catch, so the boot is three shells in
 * two tones and its wear is carried by the `prop` grain and the sole break. That is one §2.8 point
 * given up to close a §2.5 finding the critic recorded across all five heroes.
 *
 * `toecap` stays in the signature and in the palette: `index.js` `DOG_SLOT_TONE` uses it for paws.
 */
function boots(upper, sole) {
  const f = P.segment.foot;
  const out = [];
  for (const side of ['footL', 'footR']) {
    out.push(
      // Shaft: wider than the shin's overhanging bottom cap, tall enough to bury it.
      soft('prop', side, [0, -0.020, 0.015], [f.width * 1.38, 0.260, f.length * 0.80], upper),
      // Vamp: the whole last, heel to toe, one mass with the shaft. 1.23 of the foot's length
      // rather than 1.07 — at 1.07 the last's own tip stood 27 mm past the vamp's and rendered
      // on the leather family, which is the blue chip on the r02 first-pass toe.
      // 1.42 of the foot's width and 1.30 of its length. The r04 probe still measured four foot
      // vertices outside this vamp — the toe of lane A's last, which draws on the leather family
      // at a higher environment than the boot and is the saturated blue chip both the r02 and the
      // r03 critics found on the toe box. It is the last that has to be inside the boot, and the
      // probe is the thing that can say whether it is.
      soft('prop', side, [0, -0.052, 0.086], [f.width * 1.46, 0.205, f.length * 1.34], upper),
      // Sole: flush with the ground at −foot.height, and the darkest rung on the figure.
      soft('prop', side, [0, -f.height + 0.0285, (f.length - f.heel) * 0.29],
        [f.width * 1.44, 0.062, f.length * 1.22], sole),
    );
  }
  return out;
}

/**
 * The skull, as the four numbers every piece of headwear on this cast is authored from.
 *
 * **r04 derives these; r03 wrote them down.** The r03 file carried "the cranium tops out at
 * +0.313 local and is 510 mm across at its widest" in prose and then set a hard-hat crown to
 * 520 mm and a hood to 600 against it. Lane A's r04 girth pass took the head from 500 mm across
 * to **558** and lane B re-cut the skull rings under it, so on the plate every crown on the cast
 * would have had the skull coming through it and the r02 "row of orange teeth" would have been
 * back on four figures at once. Nothing here is a measurement of a plate any more: `crown` is
 * lane B's own top ring, `wide` its widest, `brow` the shelf the brim has to clear.
 */
const SKULL = Object.freeze({
  wide: P.width.head * 0.5,            // t 0.680, the cranium's widest ring
  deep: P.depth.head * 0.86 * 0.5,     // t 0.545, the deepest ring
  back: P.depth.head * -0.030,         // the cranium sits back of the head origin
  // **The crown is `t 0.840 + rise`, not `t 0.840`.** Lane B's `skullProfile` closes the head
  // with two quarter-arc rings above its last table ring, `0.160` of head height each, so the
  // cranium tops out on the six-head datum at half the head's own height — 100 mm above where
  // the ring table stops. The r04 first pass read the table and put every crown on the cast
  // 100 mm too low, and the probe came back with eleven to thirty-one skull vertices standing out
  // through four different hats. This is the datum.
  crown: P.headHeight * 0.50,
  brow: P.headHeight * 0.045,          // t 0.545, the top of the brow shelf
  front: P.depth.head * 0.264,         // the brow's own front face
});

/**
 * A hard hat: a crown, a brim, a crest and a sweatband at the temples.
 *
 * The crown is a `dome`, which is the shape that is continuous over a skull; the brim is a flange
 * and the flange has to overhang the crown by enough to cast on the face, which is why it is a
 * `wrap` rather than a `band` — its protrusion is the point of it and not a defect.
 *
 * Every altitude is read off `SKULL` rather than authored, so the hat follows the head.
 */
function hardHat(shell, sweat) {
  const crown = bandOn(SKULL.wide, SKULL.deep, 0.036);
  const sweatFit = bandOn(SKULL.wide, SKULL.deep, 0.044);
  return [
    dome('prop', 'head', [0, SKULL.crown - 0.074, SKULL.back], [crown.w, 0.400, crown.d], shell),
    // The brim clears the brow rather than passing through the temple, and it reaches past the
    // brow's front face, which is what puts its shadow on the eyes. Its underside sits at
    // `brow + 0.041`, 13 mm above lane B's brow shelf.
    soft('prop', 'head', [0, SKULL.brow + 0.178, 0.014],
      [crown.w * 1.15, 0.058, crown.d * 1.10], shell),
    piece('prop', 'head', [0, SKULL.crown + 0.072, SKULL.back], [0.078, 0.062, 0.400], shell,
      { role: 'mounted' }),
    // The sweatband — §2.5's "hair visible at the temples or a sweatband where the hair would
    // be", on a head whose hair is suppressed under a crown-replacing piece. It sits *below* the
    // brim and *behind* the brow.
    // **The sweatband goes above the brow, and the r04 plate is why this line is here.** At
    // `brow − 0.024` it ran straight through the eye line and `hero--cheap-builder.png` came back
    // with a hard pale bar across the face and the brow ridge poking out through it — a worse
    // object than the bare temples it was added to close. Lane B's brow shelf tops out at
    // `0.045 · headHeight`; the band sits on top of that and under the brim, which is where the
    // sweat band of a hard hat is.
    band('accent', 'head', [0, SKULL.brow + 0.128, SKULL.back],
      [sweatFit.w, 0.058, sweatFit.d], sweat),
  ];
}

/** A peaked cap: a crown, a band round the head, a peak over the brow, and a badge plate. */
function peakedCap(shell, badge) {
  const crown = bandOn(SKULL.wide, SKULL.deep, 0.030);
  const rim = bandOn(SKULL.wide, SKULL.deep, 0.036);
  return [
    dome('prop', 'head', [0, SKULL.crown - 0.098, SKULL.back], [crown.w, 0.375, crown.d], shell),
    band('prop', 'head', [0, SKULL.brow + 0.132, SKULL.back * 0.6], [rim.w, 0.085, rim.d], shell),
    // The peak. Shorter and higher than r03's: the r03 critic read it in profile as *"a thin
    // black blade projecting half a head-length forward"*, and 205 mm of reach off a head that is
    // 597 mm deep is most of that. It clears the brow shelf by 60 mm.
    piece('prop', 'head', [0, SKULL.brow + 0.150, SKULL.front + 0.040], [0.385, 0.046, 0.165],
      shell, { pitch: -0.14, role: 'mounted' }),
    piece('trim', 'head', [0, SKULL.brow + 0.196, SKULL.front - 0.020], [0.100, 0.078, 0.032],
      badge, { role: 'mounted' }),
  ];
}

/**
 * A beanie: a knitted crown and a rolled brim, hair showing at the temples below it.
 *
 * **r04 gives the crown the `dome` shape and the fez goes with it.** r02 and r03 both built it as
 * a shell, and a shell scaled to 340 mm is a cylinder through the middle with a rim rolled over
 * the top — which is a pillbox. The r02 critic named it, the r03 critic named it again in the
 * same words, and widening it twice did not touch the cause, because the cause is that a beanie
 * has to be *continuous over a skull* and that is the one thing this file already owns a shape
 * for. `dome` was bought in r02 for the hard hat's crown and the cap's, it has a spare instance
 * on every kit that is not one of those two, and it costs this round nothing.
 *
 * The trade is the material: `dome` is drawn on the `prop` batch, so a knitted crown renders at
 * roughness 0.66 against the wool's 0.95. A slightly waxier beanie is a smaller fault than a fez
 * on the one figure in the cast whose headwear is her whole board read, and the roll below it
 * stays on `accent` so the two-material break reads as a knitted brim on a felted crown.
 */
function beanie(tone, roll) {
  const bag = bandOn(SKULL.wide, SKULL.deep, 0.040);
  const rim = bandOn(SKULL.wide, SKULL.deep, 0.052);
  return [
    dome('prop', 'head', [0, SKULL.crown - 0.108, SKULL.back], [bag.w, 0.470, bag.d], tone),
    // The roll. Sized through `bandOn` off lane B's skull rather than authored: at r02's 545 mm
    // its own rim closed to 458 mm inside a 501 mm cranium and the skull came through it as a row
    // of orange teeth, and r03's answer was to widen the whole ring to 615 mm, which cleared the
    // teeth by standing 57 mm proud all round. At a 0.955 rim the same clearance costs 34 mm.
    band('accent', 'head', [0, SKULL.brow + 0.126, SKULL.back], [rim.w, 0.128, rim.d], roll),
  ];
}

/**
 * A hood worn up: a crown, a body that wraps the skull and drops behind it, a front rim and the
 * fringe under it.
 *
 * **The two cheek panels and the back slab are gone.** The r02 critic read the hood as *"a
 * rectangular box around the head with two flaps projecting past the silhouette"*, and the
 * arithmetic agrees: each cheek was a 100 × 540 × 500 mm brick at x ±300 on a skull 500 mm across,
 * so 50 mm of flat plank stood clear of the head on each side over a height most of the head's
 * own, and the back slab reached 520 mm behind the head origin. A hood is one soft bag; it is
 * three pieces now, each of which wraps what it covers.
 *
 * r04 moves the crown to `dome` for the same reason the beanie's moved: at a 0.955 rim a shell
 * scaled 600 × 250 presents a 573 mm flat ellipse at the top of the head, and a hood is not
 * flat-topped. The body below it stays a shell, because a bag that drops behind a skull is
 * exactly what a shell is for — and it is sized off `SKULL` now, so the r04 girth pass does not
 * leave the head standing out through it.
 */
function hood(tone, lining, fringe) {
  const bag = bandOn(SKULL.wide, SKULL.deep, 0.058);
  const rim = bandOn(SKULL.wide, SKULL.deep, 0.050);
  return [
    dome('prop', 'head', [0, SKULL.crown - 0.140, SKULL.back - 0.030], [bag.w, 0.450, bag.d * 1.06], tone),
    soft('accent', 'head', [0, SKULL.brow - 0.100, SKULL.back - 0.070],
      [bag.w, 0.470, bag.d * 1.04], tone),
    band('accent', 'head', [0, SKULL.brow + 0.148, 0.048], [rim.w, 0.130, rim.d * 0.86], lining),
    piece('accent', 'head', [0, SKULL.brow + 0.114, SKULL.front - 0.030], [0.36, 0.075, 0.075],
      fringe, { role: 'mounted' }),
  ];
}

/**
 * Size a garment **section** so that it contains the trunk over its whole span and its own rims
 * still clear it. Walked rather than solved, because the trunk is neither monotonic nor smooth.
 */
function sectionFit(yLow, yHigh, relief) {
  let hw = 0;
  let hd = 0;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const at = trunkAt(yLow + (yHigh - yLow) * t);
    hw = Math.max(hw, at.hw);
    hd = Math.max(hd, at.hd);
  }
  return bandOn(hw, hd, relief);
}

/**
 * A tape **sewn to a section**, rather than a hoop hung near one.
 *
 * The whole of this is two inequalities. A tape has to show, so its middle is wider than the
 * fabric under it; and its rims have to disappear, so its rims are *narrower* than that fabric.
 * With a rim at `SHELL_RIM` the two together put the tape's width between `W` and `W / SHELL_RIM`
 * — a window 4.7 per cent wide — and 1.022 sits in the middle of it, which on a 1 100 mm section
 * is a tape standing **12 mm** proud with both rims inside the cloth.
 *
 * The tape and the section are instances of the same unit shape at the same radial count, so
 * their cross-sections are similar ten-sided polygons at the same angles and the curve where one
 * enters the other is exact. That is why a tape can be sunk into a vest and cannot be sunk into a
 * *body*: lane A's trunk is twelve-sided, and ten against twelve is the disagreement that drew
 * the r01b sawtooth.
 */
const TAPE_FIT = 1.022;

/**
 * A hi-vis vest: three fluorescent sections that wrap the ribcage, two retro-reflective tapes
 * sewn into them, and a bleached band across the top of the bib (§2.8's "hi-vis is faded on the
 * shoulders").
 *
 * ## r04 — the top tape was a free hoop, and the two shoulder pads were pads
 *
 * The r03 critic read three things off `hero--cheap-builder.png` and all three are here. *"The
 * top tape's left end is a visible cut end face hanging over the blue shirt. The tape is a free
 * hoop sitting above the bib on the shirt, not a band on the bib."* *"All three tapes show a lit
 * under-face along their full length."* And *"khaki cubes on both shoulders with a visible seam
 * and a dark under-edge, belonging to no garment."*
 *
 * The tapes first. r03 put each one **on a seam between two sections** so that it would cover the
 * join, and a seam is precisely where a shell has closed to its rim — so a tape that covers a
 * seam has to be wider than the section on both sides of it, and the top one had to be wider than
 * the *chest* as well, at 1 100 mm against a 950 mm bib. That is the free hoop, and its 75 mm
 * overhang lit from above is the under-face on all three. What made covering the seam necessary
 * was the 0.84 rim letting the body through it; at 0.955 the sections clear the trunk outright,
 * the seams have nothing to hide, and a tape can go where a tape goes — in the middle of a panel,
 * `TAPE_FIT` proud of it, both rims inside the cloth.
 *
 * The pads second. They were two `accent` shells at x ±316 standing 50 mm above the deltoid, and
 * the fade they carried is real — §2.8 asks for it by name — but a pad on a shoulder is not how a
 * vest fades. The bleach is on the *top of the garment*, so it is the top band of the bib now, in
 * the same fluorescent family as the fabric below it and in the `faded` tone. The trade is that
 * the fade no longer changes material as well as value, which is one of the two things r03 bought
 * with the pads; against it, the shoulder line is lane A's again on all eleven figures, which is
 * a §2.1 finding the critic raised against every one of them.
 */
function hiVisVest(fabric, tape, faded) {
  /**
   * ## r2 (V3.70 L2) — it was never a vest. It was three hoops.
   *
   * Every note above is about *where the hoops sit*. None of them asks the question the r1 critic
   * asked, which is whether a hoop is a vest at all. It is not, and the plate says so without
   * needing an opinion: on `walk--cheap-builder.png` the garment reads as **four stacked flat
   * discs standing clear of the torso, with a hard horizontal bottom flange projecting past the
   * waist and a flat unshaded interior plane visible on the underside**, and the blue sleeve
   * passes *behind* it rather than through an armhole. Graded a §1.2 major — a floating element
   * with no support — and named by the r1 builder itself as the worst thing on its own plate.
   *
   * Three closed sections wrapping the ribcage is what a **cummerbund** is. `mp-cheap-builder.png`
   * has none of it. What it has, itemised because "make it a vest" is not a brief:
   *
   *   * two front panels with a **front edge** each, open all the way down, the grey tee visible
   *     between them from collarbone to belt;
   *   * a back panel, and the two joined **over the shoulder**, not round the chest;
   *   * an **armhole** — the panel's outer edge stops inboard of the deltoid, and the sleeve and
   *     the bare arm below it pass through the gap rather than behind the garment;
   *   * one horizontal reflective band on each front panel, which does **not** cross the opening;
   *   * the fade on top of the shoulder, where a vest actually bleaches.
   *
   * So the construction is now four `hivis` pieces and two `trim`, which is what the hoops cost,
   * and the cast is **triangle-neutral on this rebuild** — §7.5, reclaim before you spend, on a
   * figure measuring 6 938 against a 7 000 ceiling with no room to spend anything.
   *
   * The one closed ring left is the **shoulder yoke**, and it is closed because that is the one
   * height at which a vest is closed: over the trapezius, front panel meeting back panel. It
   * carries the `faded` tone, so §2.8's bleach is on the surface that faces the sun instead of on
   * a band across the chest. Below it the garment is open, and the opening is the point.
   *
   * The panels are `relief` rather than `wrap`, and that is a statement about what they are: a
   * panel lies *on* a chest, it does not contain one. `_r04a-wardrobe-probe.mjs` measures a
   * `relief` piece for burial and for a lit side face, which is the right test for a panel and
   * the wrong one for a hoop.
   */
  const yokeY = P.y.chest + 0.062;
  /**
   * **r3: the panel is two stacked sections, and the split is where the trunk steps.**
   *
   * Sampled at the panel's own lateral station, `frontZ` over the r2 run reads 0.368 at the belt,
   * 0.422 at a fifth of the way up, then a plateau at 0.480–0.500 across the chest and a fall back
   * to 0.420 in the shoulder taper. That is not a curve with a sagitta; it is **two masses with a
   * step between them**, and a single chord across it sits 92 units inside the chest plateau. No
   * value of `relief` inside the 26 mm proud ceiling can lift a panel out of a 92-unit hole — the
   * two constraints are incompatible on that span, which is why r2's search terminated at a
   * garment that was not drawn.
   *
   * Split at the step, each section carries its own `bandZ` seat and its own sagitta, and both
   * bounds hold at once. Measured after the split, whole-run sag 0.0918 becomes 0.0000 on the
   * lower section and 0.0322 on the upper.
   *
   * The top also comes down from `chest + 0.115` to `chest + 0.055`: the old top ran 24 units
   * above the shoulder yoke into the taper, which is most of the upper section's remaining sag and
   * none of the vest a viewer sees, because the yoke covers 2.786–2.844 on this figure.
   */
  const panelTop = P.y.chest + 0.055;
  const panelSplit = P.y.chest - 0.250;
  // **The hem stops at the belt, and that is the plate rather than a probe workaround.** On
  // `mp-cheap-builder.png` the orange ends exactly at the tool belt; nothing hangs below it. It
  // also happens to be the one thing `bandZ`'s own note says a vertical run must do — the trunk is
  // concave at the waist, so a chord from the hip to the chest sits *outside* the surface at the
  // pinch and stands proud there by the sag whatever the bury is. Measured: 39–44 mm proud against
  // a 26 mm limit on a hip-to-chest run, and no depth or yaw change moved it, because the fault is
  // the span. Above the waist the surface is monotonic and the sag is a few millimetres.
  const panelLow = P.y.waist - 0.005;
  const midY = (panelTop + panelLow) * 0.5;
  const surf = trunkAt(midY);

  // The armhole is this number: the panel's outer edge stops here, and the deltoid seat sits at
  // `SEGMENT.armOffsetX`, so the gap between them is where an arm passes. A panel run to the full
  // chest half-width is what buried the sleeve behind the garment.
  const panelOuter = surf.hw * 0.42;
  const panelInner = surf.hw * 0.17;   // half the front opening
  const panelW = panelOuter - panelInner;
  const panelX = (panelOuter + panelInner) * 0.5;
  /**
   * **Seated through `bandZ`, and the first two passes were not.**
   *
   * A panel placed at one z with one depth is the r02 batten, and this file already knows it:
   * the trunk loses ~120 mm of depth between chest and hip and pinches at the waist, so a chord
   * that touches at the chest stands 50 mm clear at the belt. `_r04a-wardrobe-probe.mjs` read
   * exactly that back — three panels PROUD at 35–50 mm with a lit side face — and it read it
   * back twice, because thinning the piece does not move a chord that is in the wrong plane.
   * `bandZ` solves the depth, the z of the centre and the pitch that keeps the face parallel to
   * the surface it lies on, which is the same helper the coat's plackets and the lapels use.
   */
  /**
   * **r3: the relief has a floor as well as a ceiling, and r2 was driven into the floor.**
   *
   * r2 read `RELIEF_LIMIT_MM = 26` as the only bound and took the panels down to 0.0092 / 0.0084,
   * which cleared every `_r04a` rule and **stopped drawing the garment**: the r2 critic measured
   * the two front panels at 89 % and 92 % buried with a face clearance of 0 mm, and fluorescent
   * area on the plate fell 88.2 % at lineup distance and 79.0 % at board zoom. `mvp/tests/
   * v370-l2-r3-shows.mjs` says the same thing without a capture — the panels drew **21.9, 24.5
   * and 80.4 cm²**, so each front panel put *less* orange on the plate than the 80 cm² reflective
   * tape sitting on top of it.
   *
   * The fault is not the number, it is that `proud` is an upper bound with nothing under it. A
   * chord run from the belt to above the chest sags inside a trunk that bulges in the middle of
   * its run, so the relief has to cover the sagitta of its own span before any of it is cloth
   * that shows. Measured on this figure the sag is ~11 mm, which is why 9.2 mm of relief left the
   * middle of the panel at zero and only its rims outside.
   *
   * So the seat is authored against the *shown area* rather than against the proud ceiling, and
   * both bounds are now checked in the same run. See §1 of the r3 report for the sweep.
   */
  /**
   * The back sections stop lower than the front, and that is measured rather than stylistic: at
   * `x = 0` the trunk is at its deepest, so the same run carries a larger sagitta, and the upper
   * back section seated to `panelTop` measured **32 mm proud** against the 26 mm ceiling. Ending
   * it at the yoke line puts it at 20 and loses nothing — the yoke is the piece that crosses the
   * shoulder, front to back, and it is drawn over this one.
   */
  const backTop = P.y.chest + 0.012;
  const sections = [
    { low: panelLow, high: panelSplit, backHigh: panelSplit },
    { low: panelSplit, high: panelTop, backHigh: backTop },
  ].map(({ low, high, backHigh }) => ({
    low,
    high,
    backHigh,
    mid: (low + high) * 0.5,
    backMid: (low + backHigh) * 0.5,
    seat: bandZ(panelX, low, high, { relief: 0.0104, bury: 0.050, hug: true }),
    backSeat: bandZ(0, low, backHigh, { relief: 0.0096, bury: 0.050, hug: true }),
  }));
  /**
   * **And yawed onto the tangent, which is the term that actually dominated.**
   *
   * Halving `relief` moved the probe's PROUD reading by 3 mm, which is the measurement saying the
   * fault is not depth. It is **width**: the trunk is an ellipse, and a flat panel spanning x from
   * 0.15 to 0.62 of the half-width crosses a surface that falls 0.21 × half-depth over that run.
   * Seated at the outer edge it floats 140 mm at the inner; seated at the inner it buries the
   * outer. No `bury` fixes a chord that is in the wrong *plane*, which is the same sentence
   * `bandZ`'s own note writes about the vertical axis — this is the horizontal one.
   *
   * The normal of an ellipse `(hw sin t, hd cos t)` is `(sin t / hw, cos t / hd)`, so the panel is
   * turned onto it and the residual error is second-order over its own half-width instead of
   * first-order over the chest.
   */
  const sinT = Math.min(0.97, panelX / surf.hw);
  const panelYaw = Math.atan2(sinT / surf.hw, Math.sqrt(1 - sinT * sinT) / surf.hd);

  // Sized across its own run rather than at one altitude: the chest is still widening under the
  // shoulder line, and a ring taken at a single y is the ring the trunk pokes through.
  const yoke = trunkBand(yokeY - 0.029, 0.010);

  return [
    // Back panel, in two sections on the same split as the front. Wide enough to reach both
    // armholes and no wider, so the outline over the shoulder is lane A's shoulder line rather
    // than a slab hung across it.
    ...sections.map((s) => piece('hivis', 'chest', [0, s.backMid - CHEST0, -s.backSeat.z],
      [panelOuter * 1.72, s.backHigh - s.low, s.backSeat.depth], fabric,
      { shape: 'shell', role: 'relief', pitch: -s.backSeat.pitch })),
    // The two front panels, and the gap between them is the garment.
    ...sections.flatMap((s) => [-1, 1].map((side) => piece(
      'hivis', 'chest', [side * panelX, s.mid - CHEST0, s.seat.z],
      [panelW, s.high - s.low, s.seat.depth], fabric,
      { shape: 'shell', role: 'relief', pitch: s.seat.pitch, yaw: side * panelYaw },
    ))),
    /**
     * The shoulder yoke: the one closed run, at the one height a vest closes, in the faded tone
     * so §2.8's bleach sits on the surface that faces the sun rather than on a band across the
     * chest.
     *
     * **It is a `wrap`, and that is the role vocabulary's own answer rather than a way round the
     * `band` rule.** `PIECE_ROLES` lists "a vest section" under `wrap` — a garment volume that
     * contains what it covers, whose protrusion is the garment's own bulk. The yoke is the one
     * piece of this vest that genuinely contains the trunk; the three panels lie *on* a chest and
     * are `relief`, which is why they are measured for burial and a lit side face and the yoke is
     * measured for containment.
     */
    soft('hivis', 'chest', [0, yokeY - CHEST0, 0.004], [yoke.w, 0.058, yoke.d], faded),
    // One reflective band a panel, sitting on the cloth and stopping at the front edge — the r04
    // note's own two inequalities, applied to a panel instead of to a hoop. Seated at its own
    // short run so it lies in the panel's plane rather than in the panel's chord.
    ...[-1, 1].map((side) => {
      /**
       * **Seated on the panel, not on the chest — r3.**
       *
       * The tape was seated against the trunk with its own `bandZ` call, which was correct while
       * the panel under it was flush with the trunk and wrong the moment the panel was lifted onto
       * its crest: the panel's face then stood outboard of the tape and `v370-l2-r3-shows.mjs`
       * read the tape at **0.2 cm² drawn, 99 % buried** — the r2 fault with the two pieces swapped.
       * A tape lies on cloth, so its seat is the cloth's plane.
       */
      const s = sections[1];
      const tapeLow = s.low + 0.030;
      const tapeHigh = tapeLow + 0.066;
      const tapeMid = (tapeLow + tapeHigh) * 0.5;
      const slope = (s.seat.zHigh - s.seat.zLow) / Math.max(0.04, s.high - s.low);
      const panelFace = s.seat.zLow + slope * (tapeMid - s.low) + s.seat.relief;
      const tapeRelief = 0.0060;
      const tapeBury = 0.0200;
      return piece('trim', 'chest',
        [side * panelX, tapeMid - CHEST0, panelFace + (tapeRelief - tapeBury) * 0.5],
        [panelW * 0.94, tapeHigh - tapeLow, tapeRelief + tapeBury], tape,
        { shape: 'shell', role: 'relief', pitch: s.seat.pitch, yaw: side * panelYaw });
    }),
  ];
}

/**
 * A stab vest over a uniform tunic: a bib, a body, a shoulder yoke either side and a hem band.
 *
 * The r01 critic graded the policeman's vest as *"four planar slabs in a 2×2 grid hung in front of
 * the chest, with a visible air gap, a hard cast shadow onto the shirt behind and the shirt fully
 * visible past its right edge"*, and the diagnosis is that **there was no vest**. What the critic
 * was reading is `jacket`'s two front edges drawn in two bands, on a figure whose §1 archetype line
 * asks for a vest and whose kit never modelled one. §2.5's test is a garment that follows a body,
 * so the policeman is issued one, in the same two-section construction the hi-vis uses and for the
 * same reason.
 *
 * **r04: the two yoke pads are gone and the bib carries the shoulder itself.** They were the
 * policeman's share of the r03 critic's shoulder-cap finding — *"grey plates on the agent,
 * broker, developer, architect and policeman"* — two 250 mm shells laid across the top of the
 * trapezius with their own rims showing. A stab vest does reach over the shoulder, so the bib
 * reaches there instead: it runs to 60 mm under the glenohumeral joint, which puts the armhole
 * where an armhole is and leaves the shoulder line to lane A.
 */
function stabVest(fabric, trimTone) {
  const bibTop = P.y.shoulderJoint - 0.060;
  const bibLow = P.y.waist - 0.090;
  const bodyTop = P.y.waist - 0.065;
  const bodyLow = P.y.waist - 0.330;
  const bib = sectionFit(bibLow, bibTop, 0.026);
  const body = sectionFit(bodyLow, bodyTop, 0.024);
  return [
    soft('accent', 'chest', [0, (bibLow + bibTop) * 0.5 - CHEST0, 0.004], [bib.w, bibTop - bibLow, bib.d], fabric),
    soft('accent', 'chest', [0, (bodyLow + bodyTop) * 0.5 - CHEST0, 0.004], [body.w, bodyTop - bodyLow, body.d], fabric),
    band('trim', 'chest', [0, (bodyLow + bodyTop) * 0.5 - CHEST0, 0.004],
      [body.w * TAPE_FIT, 0.058, body.d * TAPE_FIT], trimTone),
  ];
}

// —— props ———————————————————————————————————————————————————————————————————————————————
// Each has its own silhouette, because at board altitude the prop is half the role read. Every
// one hangs off `handL`, `handR`, `chest` or `pelvis`, so it travels with the limb that holds it.

/** A hard briefcase: case, handle bar, two handle posts, a latch. */
function briefcase(shell, hardware, side = 'handR') {
  return [
    piece('prop', side, [0, -0.48, 0.02], [0.20, 0.44, 0.50], shell, { role: 'carried' }),
    // Up into the fist rather than 7 mm below it. A handle that does not touch the hand is the
    // "floating prop" charge arriving one part down the assembly.
    piece('prop', side, [0, -0.22, 0.02], [0.045, 0.11, 0.23], shell, { role: 'carried' }),
    piece('prop', side, [0, -0.30, -0.10], [0.04, 0.13, 0.04], shell, { role: 'mounted' }),
    piece('prop', side, [0, -0.30, 0.14], [0.04, 0.13, 0.04], shell, { role: 'mounted' }),
    piece('trim', side, [-0.10, -0.44, 0.02], [0.05, 0.07, 0.11], hardware, { role: 'mounted' }),
  ];
}

/**
 * A clipboard folder carried at the side: board, sheet, clip.
 *
 * Hung off a hand, not off a chest. r01b anchored it to the chest at a jaunty pitch with both
 * hands empty beside it, and the r01 critic listed it first of three props "floating unattached".
 * A prop that hangs from `handR` travels with the arm and is *in* the hand at every frame of every
 * cycle, which is the standard the briefcase and the jerry can already meet on the lineup plate.
 */
function clipboard(board, sheet, clip, side = 'handR') {
  /**
   * **r2: it was 8 mm short of the fist, and only a swept probe could say so.**
   *
   * `_r04a-wardrobe-probe.mjs` passes it, because its `carried` rule asks whether the piece is
   * within 6 mm of *any* host in the bind pose and the answer there is yes. Swept through the
   * cycle by `v370-l2-body.mjs` §4 the nearest corner of the board sits **+0.0081 m** clear of the
   * hand mass at its worst frame — the only positive number in the cast, and positive is a gap.
   * That is the same defect class as the arsonist's can, an order of magnitude smaller, and it is
   * exactly the class the r1 instrument could not see at all.
   */
  return [
    piece('prop', side, [0, -0.36, 0.02], [0.055, 0.44, 0.36], board, { roll: 0.08, role: 'carried' }),
    piece('prop', side, [0.035, -0.37, 0.02], [0.02, 0.37, 0.30], sheet, { roll: 0.08, role: 'mounted' }),
    piece('trim', side, [0.01, -0.18, 0.02], [0.07, 0.06, 0.16], clip, { roll: 0.08, role: 'mounted' }),
  ];
}

/**
 * A rolled drawing tube, held in a hand at the side, with a band round it.
 *
 * **Moved off the chest.** r02 anchored it to `chest` at x −420 with the shoulder joint at −468,
 * so the tube was inside the upper-arm mesh with no hand within half a metre of it, and the r02
 * critic graded it *"a white cube with a grey disc on its face, welded into the side of the upper
 * arm"* — worse than the floating tab r01 found. The agent's folder, the broker's briefcase and
 * the arsonist's can are all in hands and all three closed; this is the one that was not, and it
 * closes the same way. The two `trim` end caps went with it: a retro-reflective disc on the end of
 * a paper roll was never right, and on the architect it was two of the brightest objects in the
 * cast hanging at chest height.
 */
function drawingRoll(paper, tie, side = 'handL') {
  /**
   * **r2: shorter, and canted outboard, because it was passing through the coat.**
   *
   * Graded a §1.2 interpenetration on `walk--architect.png` frames 3–8 — the white roll enters at
   * the coat hem and re-emerges inside the torso. The cause is length and lean: an 0.82 tube hung
   * rigidly off a hand at 0.14 rad of cant reaches 850 mm below the wrist and swings *inboard* of
   * the coat skirt through the back half of every cycle. A drawing roll is about 600 mm of paper,
   * not 850, and a person carrying one holds it away from their leg.
   *
   * The cant is signed off the side, so the roll leans away from the body on either hand rather
   * than always the same way in world space — which is what put it inside the coat on the left.
   */
  const away = side === 'handL' ? 1 : -1;
  return [
    soft('prop', side, [away * 0.075, -0.36, 0.055], [0.145, 0.58, 0.145], paper,
      { roll: away * 0.30, role: 'carried' }),
    piece('trim', side, [away * 0.075, -0.26, 0.055], [0.165, 0.055, 0.165], tie,
      { roll: away * 0.30, shape: 'shell', role: 'mounted' }),
  ];
}

/** A battered jerry can: body, top handle, spout, cap. */
function jerryCan(shell, cap, side = 'handR') {
  /**
   * **r2: the handle is in the fist, and it was 260 mm below it.**
   *
   * Graded a §1.2 major on `walk--arsonist.png` — *"the red jerry can is a flat red slab hanging
   * in air below the coat hem, and the arm that is supposed to carry it has no hand on it, with a
   * clear gap between the two"*. `_r04a-wardrobe-probe.mjs` passed the piece, because its
   * `carried` rule asks whether the *can body* touches the hand and the can body is 490 mm down —
   * the top handle, which is the part a hand actually closes round, was never the thing measured.
   * A prop is held by its handle or it is not held.
   *
   * Everything moves up 0.16 so the handle bar sits inside the fist mass rather than under it, and
   * the can is carried outboard of the thigh instead of in line with it, which is where a person
   * carries a full can and which keeps it clear of the coat hem the roll was going through.
   */
  const away = side === 'handR' ? -1 : 1;
  return [
    piece('prop', side, [away * 0.05, -0.335, 0.02], [0.28, 0.40, 0.20], shell, { role: 'carried' }),
    piece('prop', side, [away * 0.05, -0.105, 0.02], [0.24, 0.05, 0.05], shell, { role: 'carried' }),
    piece('prop', side, [away * 0.05, -0.135, 0.10], [0.08, 0.11, 0.10], shell, { role: 'mounted' }),
    piece('trim', side, [away * 0.05, -0.065, 0.10], [0.09, 0.05, 0.09], cap, { role: 'mounted' }),
  ];
}

/**
 * A strap laid diagonally across the chest, seated through the same solver the lapels use.
 *
 * Written out because a rolled piece is the case that most rewards the roll term: at 0.70 rad this
 * one walks 190 mm sideways over its own length, and off a fixed lateral station its plane left
 * the body by 5 mm at the lower end. The r02 critic read exactly that piece as *"a diagonal
 * brace"* in a stud frame.
 */
function strapSeat(x, yCentre, height, roll, width, tone) {
  const swing = Math.sin(roll) * height * 0.5;
  const low = yCentre + CHEST0 - Math.cos(roll) * height * 0.5;
  const high = yCentre + CHEST0 + Math.cos(roll) * height * 0.5;
  // 42 mm of relief against 38 of bury, and the asymmetry is the diagonal's own doing: a chord
  // between the two ends of a 40-degree run passes 33 mm *inside* a convex chest at its middle, so
  // a strap that only stands 26 mm proud disappears through the sternum halfway along. Measured on
  // the probe, not guessed. r03 ran it at 50 and the r03 critic read the result as a bar with a
  // lit top face; 42 is the least that keeps the middle of the run on the cloth.
  const seat = bandZ(Math.abs(x) + swing, low, high,
    { relief: 0.042, bury: 0.038, xHigh: Math.abs(x) - swing, roll });
  return piece('accent', 'chest', [x, yCentre, seat.z], [width, height, seat.depth], tone,
    { roll, pitch: seat.pitch });
}

/**
 * A bedroll strapped across the back: a roll laid across the shoulders, a shoulder link, and one
 * strap crossing the chest to the opposite hip.
 *
 * **One diagonal, not two verticals.** The r02 squatter came back off the hero plate with four
 * brown vertical strips down her front — the coat's two front edges and the bedroll's two chest
 * straps, side by side at x ±130 and ±170 — which is the slat read the layer rebuild had just
 * closed, arriving from a different piece. A bedroll is carried on one strap over one shoulder,
 * and a strap that runs across a body at forty degrees can never line up with a coat edge that
 * runs down it.
 *
 * ## r04 — the roll was there and the plate says it was not, which is §7.2
 *
 * The r03 critic recorded *"the bedroll is gone; `hero--squatter.png` carries a diagonal strap
 * across the chest with nothing on either end"*, and read it as §7.4, a working feature deleted
 * with a defect. The geometry disagrees: this function has built the roll every round. The plate
 * does not, and the plate is what §7.2 grades. Two numbers say why. The roll was **700 mm** long
 * on a chest that is 880 mm across, so at the three-quarter angle every hero is shot from it is
 * completely behind the torso; and it sat at `chest depth / 2 + 160`, which with its own 115 mm
 * radius leaves **45 mm of air** between the roll and the back it is strapped to. A thing that is
 * hidden and floating is, for grading purposes, gone, and answering the critic by pointing at the
 * source would have been the wrong answer to the right finding.
 *
 * So: 1 050 mm long, which clears the torso at both ends and still sits inside the deltoids so it
 * reads as a roll rather than as a plank; seated 55 mm into the back; and the chest strap now has
 * an object at each end — the roll at the top through a shoulder link, the hip at the bottom.
 */
function bedroll(canvas, strap) {
  const z = P.depth.chest * 0.5 + 0.060;
  const shoulder = P.y.shoulderJoint - CHEST0;
  return [
    soft('prop', 'chest', [0, shoulder - 0.10, -z], [0.235, 1.050, 0.235], canvas,
      { roll: Math.PI * 0.5, role: 'carried' }),
    // The link over the shoulder: from the top of the chest strap, across the trapezius, into the
    // roll. This is the "give the strap an object at the end of it" the r03 critic asked for, and
    // it is what makes the diagonal read as carrying something rather than as a brace.
    piece('prop', 'chest', [-0.235, shoulder - 0.055, -0.055], [0.075, 0.115, 0.560], strap,
      { role: 'carried', pitch: 0.22 }),
    piece('prop', 'chest', [0.255, shoulder - 0.135, -z + 0.030], [0.070, 0.230, 0.150], strap,
      { role: 'carried' }),
    strapSeat(-0.02, -0.03, 0.52, 0.60, 0.072, strap),
  ];
}

/** A tote bag hanging from the near hand. */
function tote(canvas, handle, side = 'handL') {
  return [
    soft('prop', side, [0, -0.44, 0.02], [0.310, 0.370, 0.175], canvas, { role: 'carried' }),
    piece('prop', side, [-0.11, -0.23, 0.02], [0.04, 0.22, 0.04], handle, { role: 'carried' }),
    piece('prop', side, [0.11, -0.23, 0.02], [0.04, 0.22, 0.04], handle, { role: 'carried' }),
  ];
}

/**
 * A satchel worn on the hip with the strap across the chest.
 *
 * **r04 seats the strap.** It is the *avatar's* strap, and it is the piece the r03 critic actually
 * measured when he wrote *"a lit top face and both of its ends cut in mid-air with the teal
 * visible above and below the cut — a strap attached to nothing at either end"* against
 * `hero--avatar.png`. He filed it under the lanyard because it crosses the white panel there; the
 * white panel is the coat's placket and the strap is this. Two faults, both arithmetic. It ran on
 * a **constant** `chest depth / 2 − 32` for 600 mm of height, and the trunk loses 60 mm of depth
 * over that run, so the top end stood 30 mm off the trapezius while the bottom was buried — the
 * lit face and one of the two cut ends. And its lower end stopped at the bottom of the chest
 * segment, 300 mm above the bag it is supposed to carry. It is seated through the same solver the
 * lapels and the bedroll's strap use now, and it runs far enough down to reach the flap.
 */
function satchel(body, flap, strap) {
  return [
    // Out to the hip's own surface rather than half inside it. The pelvis is 430 mm to its side at
    // the widest, so a 200 mm bag centred at 420 was buried to its centreline and the r02 critic
    // read what was left as *"a floating cube at the hip with no strap"* — the cube being the flap
    // and the strap being lost against a coat it lay 20 mm off.
    soft('prop', 'pelvis', [0.485, 0.02, 0.10], [0.210, 0.300, 0.360], body, { role: 'carried' }),
    piece('prop', 'pelvis', [0.485, 0.155, 0.11], [0.222, 0.090, 0.372], flap, { role: 'mounted' }),
    strapSeat(0.10, -0.10, 0.72, -0.34, 0.072, strap),
  ];
}

/**
 * A phone, in a hand.
 *
 * It was at the ear, 40 mm clear of the head, with no hand anywhere near it — the r01 critic's
 * second floating prop. A phone at the ear is a *pose*, and the pose belongs to lane D; until an
 * arm is raised to hold one, a phone in a hand is honest and a phone beside a head is not.
 */
function phone(shell, screen, side = 'handR') {
  // **The r02 critic found both of the developer's hands empty, and they were not.** The phone was
  // there, at 115 × 55 × 195 mm in `#232424` on the `prop` family — the lowest environment on the
  // cast, at L\* 12, against a coat at L\* 21 and a hand shadowed above it. An object that small
  // in a tone that close to what is behind it does not exist at hero distance, and §1 asks for the
  // phone as an identity read. Half again as large, held flatter so its face catches the key, and
  // `cast.js` takes the shell off near-black.
  return [
    piece('prop', side, [0, -0.246, 0.070], [0.155, 0.062, 0.280], shell, { pitch: 0.42, role: 'carried' }),
    piece('trim', side, [0, -0.222, 0.076], [0.115, 0.020, 0.215], screen, { pitch: 0.42, role: 'mounted' }),
  ];
}

/**
 * A trades tool belt with two hanging pouches and a buckle.
 *
 * The belt is a shell round the hip and that is the whole of the fix: the r01 belt was a
 * 1.03 × 0.68 m brick laid across a 0.86 × 0.56 m elliptical pelvis, so four corners stood 90 mm
 * proud of the body and it read as a plank entering one hip and leaving the other. An ellipse
 * 75 mm larger than the hip in both axes encircles it at every angle instead.
 */
function toolBelt(leather, pouch, buckle) {
  const y = P.y.hip - PELVIS0;
  // **r04 sizes it through `bandOn` and it is 22 mm proud rather than 37, with its rim clear.**
  // `hip + 75 mm` put a 935 mm ring on the hip's own 860 mm, and its rim closed to 785 — 75 mm
  // inside the pelvis, so the trouser came out through the belt on both sides. This is the same
  // object as the squatter's mustard hem lip and it fails the same way; the r03 critic saw it on
  // her because her lip is mustard on navy and missed it on the builder because his belt is brown
  // on khaki, which is what a probe is for.
  const fit = trunkBand(P.y.hip, 0.022);
  return [
    band('prop', 'pelvis', [0, y, 0], [fit.w, 0.125, fit.d], leather),
    // Hung *off* the belt at the outside of the hip, not half sunk into it. At x ±415 on a hip
    // whose own half-width is 430 the pouches were buried to their centrelines and the two
    // exposed caps read as drawer knobs.
    soft('prop', 'pelvis', [-0.470, y - 0.160, 0.070], [0.175, 0.230, 0.215], pouch, { role: 'carried' }),
    soft('prop', 'pelvis', [0.470, y - 0.160, 0.070], [0.175, 0.230, 0.215], pouch, { role: 'carried' }),
    piece('trim', 'pelvis', [0, y, fit.d * 0.5 - 0.012], [0.095, 0.075, 0.045], buckle, { role: 'mounted' }),
  ];
}

/** Utility pouches on the front of a stab vest: flat, wide, and lying on the cloth. */
function vestPouches(pouch) {
  // On the vest, not 105 mm in front of the chest the vest is over. r03 measured this offset
  // against the bare trunk and the stab vest is 26 mm proud of it, so the pouches floated 47 mm
  // clear with nothing between them and the cloth — which the r04 probe reports as UNHELD.
  const z = P.depth.chest * 0.5 + 0.062;
  return [
    soft('prop', 'chest', [-0.205, -0.185, z], [0.235, 0.165, 0.115], pouch, { role: 'carried' }),
    soft('prop', 'chest', [0.205, -0.185, z], [0.235, 0.165, 0.115], pouch, { role: 'carried' }),
  ];
}

/**
 * A shoulder radio: a body clipped to the yoke and a short aerial above it.
 *
 * The r01 critic's third floating prop — *"a pale stick hanging in space off the shoulder with no
 * radio body"*. There was a body, on the `trim` family in the archetype's own near-black, against
 * a near-black tunic, so nothing but the brass aerial rendered. The body draws on `prop` in the
 * pouch tone now, it is twice the size, and the aerial is a third shorter and seated on it.
 */
function shoulderRadio(shell, aerial) {
  const z = P.depth.chest * 0.5 - 0.055;
  return [
    soft('prop', 'chest', [-0.300, 0.150, z], [0.135, 0.230, 0.115], shell, { role: 'carried' }),
    piece('trim', 'chest', [-0.300, 0.300, z], [0.032, 0.130, 0.032], aerial, { role: 'mounted' }),
  ];
}

/**
 * A lanyard: two cords to the collar and a blank card at the sternum.
 *
 * **r04 seats all three through `bandZ` and takes 12 mm off the card.** r03 placed the cords at
 * `frontZ` for a single lateral station and gave them no pitch, so each one stood clear at its top
 * where the trapezius turns; and the card sat at `chest depth / 2 − 24` with a 46 mm thickness, so
 * its front face was **23 mm proud with two lit side faces** — which is why the r03 critic could
 * read a swallow-tail bottom edge on it at all. A pass card is a laminate; 8 mm of relief is
 * generous for one.
 */
function lanyard(cord, card) {
  const cordSeat = bandZ(0.11, P.y.chest - 0.03, P.y.chest + 0.29, { relief: 0.016, bury: 0.036 });
  const cardSeat = bandZ(0, P.y.chest - 0.19, P.y.chest + 0.01, { relief: 0.008, bury: 0.038 });
  return [
    piece('accent', 'chest', [-0.11, 0.14, cordSeat.z], [0.05, 0.32, cordSeat.depth], cord,
      { roll: 0.22, pitch: cordSeat.pitch }),
    piece('accent', 'chest', [0.11, 0.14, cordSeat.z], [0.05, 0.32, cordSeat.depth], cord,
      { roll: -0.22, pitch: cordSeat.pitch }),
    piece('trim', 'chest', [0, -0.09, cardSeat.z], [0.14, 0.19, cardSeat.depth], card,
      { pitch: cardSeat.pitch }),
  ];
}

/**
 * Heavy round glasses: two lens rims and a bridge.
 *
 * Off `trim` and on to `prop`. The r02 critic read these as *"two free-floating white rectangles
 * that project past the head silhouette"* and both halves of that are answered here. White,
 * because `trim` is the retro-reflective family — roughness 0.21, environment 1.30, a white
 * emissive — and a pale frame tone on it renders at L\* 90 whatever the palette says; a spectacle
 * frame is painted metal, which is what `prop` is for. Projecting, because at x ±135 the head's
 * own ellipse has already fallen back to z 0.236 and the rims sat at 0.260. Each rim is now seated
 * against the surface at its own station.
 */
function glasses(frame) {
  // Off `SKULL` in r04. r03 sampled `P.width.head / 2` and `P.depth.head / 2` as if the head were
  // an ellipse of its own bounding box, and the eye line is neither the widest nor the deepest
  // ring on it: lane B's socket band is 0.72 of the head's depth and steps 45 mm back. The rims
  // therefore sat 90 mm in front of the face they belong to, which is the r03 critic's *"a dark
  // bar projecting well past the left cheek"* on the architect.
  const x = SKULL.wide * 0.46;
  const lens = frontZ(x, SKULL.wide, P.depth.head * 0.72 * 0.5) + P.depth.head * -0.076 + 0.014;
  return [
    piece('prop', 'head', [-x, -0.028, lens], [0.155, 0.115, 0.046], frame),
    piece('prop', 'head', [x, -0.028, lens], [0.155, 0.115, 0.046], frame),
    piece('prop', 'head', [0, -0.028, lens + 0.014], [0.115, 0.028, 0.038], frame, { role: 'mounted' }),
  ];
}

/**
 * A quilted jacket's channels — the avatar reads as the crisp one in the cast.
 *
 * **This was the worst single object in the round and it is the clearest case of the class.** Three
 * 660 mm bricks at a constant `chest depth / 2 + 60 mm`: at the centre line each stood 60 mm clear
 * of the chest, and at its own ends, 330 mm out, the chest's ellipse has fallen back to 198 mm so
 * each bar stood **132 mm** clear with the dark torso visible through the gap. Crossed with the
 * coat's two front edges and its placket it made a six-bar lattice, and the r02 critic called it a
 * luggage rack.
 *
 * A quilting channel is a *tuck in the cloth*, so it goes round the body. Three shells, each 22 mm
 * proud of the chest at every angle, each closing to a rim that clears the mass inside it —
 * exactly the construction the vest's tape bands already use, which is the one piece of trim on
 * this cast the critic did not charge.
 */
function quilting(tone) {
  // Each channel is sized to the trunk at its own altitude through `bandOn`, so all three stand
  // the same relief rather than one being flush at the chest and the next a flange at the waist.
  // r03 added a flat 22 mm to the trunk's own half-dimensions, which is not enough for a 0.84 rim
  // to clear a 440 mm chest half-width — the rim closed 70 mm inside it and the torso came out
  // through every channel, which is the gap between the bars on `hero--avatar.png`.
  return [0.150, -0.030, -0.210].map((y) => {
    const fit = trunkBand(y + CHEST0, 0.020);
    return band('accent', 'chest', [0, y, 0.004], [fit.w, 0.088, fit.d], tone);
  });
}

/** A worn dog collar and its tag. */
function dogCollar(strap, tag) {
  return [
    band('trim', 'neck', [0, -0.04, 0], [0.360, 0.115, 0.360], strap),
    piece('trim', 'neck', [0, -0.13, 0.12], [0.09, 0.09, 0.05], tag, { role: 'mounted' }),
  ];
}

// —— the eleven kits —————————————————————————————————————————————————————————————————————
// One per §1 archetype. Tone names resolve against the palette `cast.js` supplies, so a kit
// describes construction and a palette describes identity, and neither has to know the other.

const KITS = {
  'property-agent': (p) => [
    // A working suit: a short notch lapel, a narrow placket, and the shortest jacket in the cast.
    ...jacket({ tone: p.outer, collar: p.shirt, edge: p.edge, hem: P.y.crotch + 0.06, plane: 0.026, gap: 0.022, lapel: p.edge, lapelStyle: 'notch', placket: p.shirt, frontW: 0.28 }),
    ...sleeves(p.outer),
    ...trouserBreak(p.trouser),
    ...boots(p.shoe, p.sole),
    ...clipboard(p.propA, p.propB, p.hardware),
  ],
  'cheap-builder': (p) => [
    ...hiVisVest(p.hivis, p.tape, p.faded),
    // Short sleeves and a bare forearm — the reference builder's own shirt, and the one archetype
    // where §2.5's sleeve end belongs on the upper arm rather than at the wrist.
    ...sleeves(p.outer, { kind: 'short', dirt: p.grime }),
    // Leg dirt and hem dirt are both *trouser* dirt, so both take `patch`. The r02 plate had this
    // as a hard ring at the knee lighter than the trouser it sat on; it is now the whole lower leg
    // at a darker value with both rims buried. See `trouserBreak`.
    ...trouserBreak(p.trouser, { dirt: p.patch }),
    ...boots(p.shoe, p.sole),
    ...hardHat(p.headwear, p.hair),
    ...toolBelt(p.propA, p.propB, p.hardware),
  ],
  architect: (p) => [
    ...jacket({ tone: p.outer, collar: p.outer, edge: p.edge, top: P.y.neckBase, hem: P.y.crotch + 0.02, plane: 0.018, gap: 0.012, frontW: 0.26, front: 'closed' }),
    ...sleeves(p.outer),
    ...trouserBreak(p.trouser),
    ...boots(p.shoe, p.sole),
    ...drawingRoll(p.propA, p.propB),
    ...glasses(p.outerDark),
  ],
  'mortgage-broker': (p) => [
    // A peak lapel, longer and laid flatter, so the broker and the agent do not share an outline
    // above the waist. §2.6 is graded from the lineup and one lapel kit on four figures is what
    // the r02 critic paired them on.
    ...jacket({ tone: p.outer, collar: p.shirt, edge: p.edge, hem: P.y.crotch + 0.10, plane: 0.030, gap: 0.026, lapel: p.edge, lapelStyle: 'peak', placket: p.shirt, frontW: 0.30 }),
    ...sleeves(p.outer),
    ...trouserBreak(p.trouser),
    ...boots(p.shoe, p.sole),
    ...briefcase(p.propA, p.hardware),
    ...lanyard(p.propB, p.hardware),
  ],
  'rival-developer': (p) => [
    // The long open overcoat: the longest silhouette in the cast, with a real front opening. Its
    // lapels and centre fold draw in `edge`, which is *lighter* than the coat rather than darker —
    // §2.9 wants a dark coat to keep its folds, and a fold is a lit edge.
    //
    // Hem raised 300 mm to mid-thigh. At knee + 0.26 the skirt was a closed bell from shoulder to
    // a clean horizontal edge below the knee, and the r01 critic read it as a kilt at hero
    // distance and as a dress at lineup scale. A long coat that stops on the thigh keeps the
    // longest silhouette in the cast and gives the legs back half their length.
    ...jacket({ tone: p.outer, collar: p.edge, edge: p.edge, hem: P.y.crotch - 0.24, plane: 0.030, gap: 0.055, flare: 0.030, lapel: p.edge, lapelStyle: 'shawl', placket: p.shirt, frontW: 0.30 }),
    ...sleeves(p.outer),
    ...trouserBreak(p.trouser),
    ...boots(p.shoe, p.sole),
    ...phone(p.propA, p.hardware),
  ],
  arsonist: (p) => [
    ...jacket({ tone: p.outer, collar: p.outer, edge: p.edge, top: P.y.neckBase, hem: P.y.crotch + 0.04, plane: 0.026, gap: 0.016, frontW: 0.27, front: 'closed' }),
    ...sleeves(p.outer, { dirt: p.grime }),
    ...trouserBreak(p.trouser, { dirt: p.patch }),
    ...boots(p.shoe, p.sole),
    ...hood(p.outer, p.outerDark, p.hair),
    ...jerryCan(p.propA, p.hardware),
  ],
  squatter: (p) => [
    // Genuinely layered: an inner garment showing below an outer one, with stepped hems.
    // Its top tucks under the coat hem, so nothing of it reads at the sides where the coat is
    // wider; what shows is 240 mm of a second garment below the first.
    ...layer({ tone: p.inner, top: P.y.hip - 0.10, hem: P.y.crotch - 0.02 }),
    ...jacket({ tone: p.outer, collar: p.edge, edge: p.edge, hem: P.y.crotch + 0.09, plane: 0.034, gap: 0.045, flare: 0.040, frontW: 0.30 }),
    ...sleeves(p.outer, { dirt: p.grime }),
    ...trouserBreak(p.trouser, { dirt: p.patch }),
    ...boots(p.shoe, p.sole),
    ...beanie(p.headwear, p.outerDark),
    ...bedroll(p.propA, p.propB),
  ],
  policeman: (p) => [
    ...jacket({ tone: p.outer, collar: p.shirt, edge: p.edge, hem: P.y.crotch + 0.08, plane: 0.030, gap: 0.010, frontW: 0.29, front: 'none' }),
    ...stabVest(p.outerDark, p.tape),
    ...sleeves(p.outer),
    ...trouserBreak(p.trouser),
    ...boots(p.shoe, p.sole),
    ...peakedCap(p.headwear, p.hardware),
    ...shoulderRadio(p.propB, p.hardware),
    ...vestPouches(p.propA),
  ],
  family: (p) => [
    // No lapel at all: an open shirt over a tee. The one adult in the cast not dressed for work.
    ...jacket({ tone: p.outer, collar: p.shirt, edge: p.edge, hem: P.y.crotch + 0.02, plane: 0.024, gap: 0.040, placket: p.shirt, frontW: 0.26, lapelStyle: null }),
    ...sleeves(p.outer),
    ...trouserBreak(p.trouser),
    ...boots(p.shoe, p.sole),
    ...tote(p.propA, p.propB),
  ],
  'site-robot': (p) => [
    // A squared gunmetal head replaces the organic skull; one shallow amber bar is the sensor.
    piece('prop', 'head', [0, 0, 0], [0.58, 0.56, 0.52], p.outer, { role: 'wrap' }),
    piece('prop', 'head', [0, 0.03, 0.285], [0.38, 0.10, 0.04], p.propA, { role: 'mounted' }),
  ],
  avatar: (p) => [
    ...jacket({ tone: p.outer, collar: p.edge, edge: p.edge, hem: P.y.crotch + 0.06, plane: 0.030, gap: 0.036, placket: p.shirt, frontW: 0.28, lapelStyle: null }),
    ...quilting(p.outerDark),
    ...sleeves(p.outer),
    ...trouserBreak(p.trouser),
    ...boots(p.shoe, p.sole),
    ...satchel(p.propA, p.hardware, p.propB),
  ],
  dog: (p) => dogCollar(p.outer, p.hardware),
};

/** Every kit id this lane builds, for the capacity probe and the tests. */
export const WARDROBE_KITS = Object.freeze(Object.keys(KITS));

/**
 * Which palette tone the **pelvis** takes, per kit. `index.js` reads it in `_dress`.
 *
 * ## The pale chest patch, and why it is a tone rather than a garment
 *
 * The r03 critic traced this one properly and handed it over already diagnosed: *"on the
 * developer, the architect, the arsonist, the agent and the broker, the jacket stops at the
 * sternum in a hard horizontal step and a large unbroken pale mass runs from there to the belt…
 * the cream belly panel is identical in r02 and r03. It is a wardrobe fault that predates r03."*
 * It is older than that again, and it is not a wardrobe fault at all in the sense of a missing
 * garment. It is a slot tone.
 *
 * Lane A draws three overlapping trunk masses, and **the pelvis is the outermost of them from the
 * hip all the way up to about `waist + 0.07`** — 415 mm of half-width at the navel against the
 * torso's 379 and the chest's 357. `index.js` `SLOT_TONE` gives the pelvis the *trouser* tone. So
 * on every figure in the cast the trouser colour covers the entire lower torso, the garment only
 * appears above the navel, and the step where one takes over from the other is the hard
 * horizontal line at the sternum. Nothing in `wardrobe.js` could have covered it, because a
 * garment section over the widest part of the pelvis that terminates at the waist has its own top
 * rim standing 58 mm out in the air — the shelf this file spends `SHELL_RIM` avoiding.
 *
 * A jacket covers the hips. So the pelvis takes the jacket's colour on every kit whose hem is
 * below the hip, the hems come down to sit just above the crotch where a jacket's hem actually
 * falls, and the trouser starts at the thigh. Two kits are named exceptions: the builder wears a
 * shirt tucked into his trousers, so his pelvis is trouser and the hi-vis skirt section is what
 * crosses it; and the squatter's under-layer already covers her hips in `inner`, so hers takes
 * the outer coat above the layer and the layer's own hem below it.
 */
export const KIT_PELVIS_TONE = Object.freeze({
  'cheap-builder': 'trouser',
  dog: 'trouser',
});

/** The tone the pelvis takes for a kit — the garment unless the kit says otherwise. */
export function pelvisToneFor(kitId) {
  return KIT_PELVIS_TONE[kitId] ?? 'outer';
}

/**
 * Build the modelled wardrobe for one figure.
 *
 * @param {string} kitId    archetype id; an unknown id falls through to the avatar's kit
 * @param {object} palette  tone table from `cast.js` — `outer`, `shirt`, `trouser`, `sole`…
 * @param {object} options  `id` for deterministic drape, `press` 0 (pressed) → 1 (unpressed)
 * @returns {Array<object>} pieces, `{ batch, shape, anchor, x…d, yaw, pitch, roll, tone }`
 */
export function buildWardrobe(kitId, palette, { id = kitId, press = 0 } = {}) {
  const build = KITS[kitId] ?? KITS.avatar;
  const pieces = build(palette);
  if (press <= 0) return pieces;
  // §2.8's "a pressed suit on office figures and an unpressed one on trades", as geometry: every
  // soft panel sits a little off square and a little slack. Rigid pieces are left alone, because
  // a hard hat does not crease.
  //
  // A third stronger than r01b. The r01 critic could not see the distinction on the plate at all
  // — *"the builder and the property agent are equally clean"* — and half of why is that a lean
  // of four degrees on a hem does not survive being looked at. It is still small enough that no
  // panel leaves the clearance it was authored with: the widest perturbed piece is the hi-vis
  // upper at 950 mm inside a 70 mm clearance, and 0.09 rad of yaw moves its corner 43 mm.
  return pieces.map((item, index) => {
    if (item.batch === 'prop' || item.batch === 'trim') return item;
    const lean = (unitFrom(`${id}:${index}`, WARDROBE_SALT.PRESS) - 0.5) * press;
    const drape = (unitFrom(`${id}:${index}`, WARDROBE_SALT.DRAPE) - 0.5) * press;
    return {
      ...item,
      yaw: item.yaw + lean * 0.18,
      roll: item.roll + drape * 0.16,
      h: item.h * (1 + drape * 0.11),
    };
  });
}

/**
 * Measured instance usage per family across the whole cast — what `WARDROBE_PLAN`'s capacities
 * are set from, so a capacity is never a guess and a kit that grows past one is caught by a test
 * rather than by a piece silently vanishing off a plate.
 *
 * @returns {Record<string, number>} `batch:shape` → the fattest kit's count
 */
export function wardrobeUsage(paletteFor) {
  const worst = {};
  for (const kitId of WARDROBE_KITS) {
    const counts = {};
    for (const item of buildWardrobe(kitId, paletteFor(kitId))) {
      const key = familyKey(item.batch, item.shape);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    for (const [key, n] of Object.entries(counts)) worst[key] = Math.max(worst[key] ?? 0, n);
  }
  return worst;
}
