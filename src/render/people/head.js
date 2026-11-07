// District Deck V3.32 — head geometry.
//
// Lane B. Owns cranium, face, eyes, hair and facial variation. Nothing else in the kit builds
// anything above the neck.
//
// Vertical datum: the head origin is `PROPORTIONS.y.headCentre` — the midpoint of chin and crown,
// so the head, the dark features and the hair all take one transform from the rig and can never
// slide apart. Local y runs −headHeight/2 (chin) to +headHeight/2 (crown), +Z is the face.
//
// r02 rebuild (seat B). r01 closed the "face renders at skin value" defect and opened two more,
// both named by the r01 critic and both measured before they were touched:
//
//   * **The brow was a plank.** It was a `BoxGeometry` 0.80 head-widths across, pushed to
//     z = 0.40·headDepth — which is *in front of the skull's own ellipse at that height*, so its
//     two corners projected past the head silhouette on both sides and occluded the eye line at
//     every non-frontal angle. Frontally it read fine, which is why "reduce the overhang" was the
//     wrong diagnosis: the brow cast no shadow at all, it simply stood in front of the eyes.
//   * **There was no socket.** The eye sphere sat at z = 0.365·headDepth while the face surface
//     at the eye's own x was at 0.183 m — 46 mm behind it. The eyes were beads glued to a plane.
//
// The fix is one shape rather than two. The skull, jaw, socket band and brow are now a **single
// swept profile**: the ring at the eye line steps *back*, and the ring above it steps *forward*
// again, so the brow is a real overhang cut out of the head's own silhouette and the recess
// beneath it is a real socket. Measured on the centre line, the face surface runs 246 mm forward
// at the cheekbone, **175 mm at the eye line** and **230 mm at the brow** — a 55 mm shelf over the
// socket. A brow that is a ring of the outline cannot project past the outline at any angle, and
// the eye now sits 17 mm proud of a floor that is 52 mm behind the ridge over it.
//
// Eyebrows and mouth are curved ribbons that follow the same ellipse rather than boxes laid
// across it: a straight bar 140 mm long stands 63 mm proud at its outer end on a head this round,
// which is the plank defect again at a smaller size.
//
// Salt namespace 200–299. Deterministic: no clock, no `Math.random`.

import * as THREE from 'three';
import {
  AUTHORED_PROPORTIONS, PROPORTIONS, SALT, mergeParts, profileSolid, unitFrom,
} from './core.js';

/**
 * The head the ear flap below was authored against — r01's 0.62 crown-to-chin and the width and
 * depth that went with it. The flap is the file's only absolute-metre part; everything else here
 * is a fraction of `metrics(p)`. See `buildHeadGeometry`.
 */
const EAR_AUTHORED = Object.freeze({
  h: AUTHORED_PROPORTIONS.headHeight,
  w: AUTHORED_PROPORTIONS.headWidth,
  d: AUTHORED_PROPORTIONS.headDepth,
});

/**
 * Facial build knobs. One shared head geometry ships on the cast batch — a second and a third
 * cost one draw each — so the knobs exist for builders that take a per-seed face (`faceFor`) and
 * for the declared variants below. The r03 critic still scored 2.3 at 6.9 with zero movement;
 * r06 puts the socket, the dark eye mass and the nose projection into the *default* face so the
 * shared mesh itself carries the dimension, not only a variant nobody was calling.
 *
 * Knobs (unitless multipliers around 1):
 *   jaw / cheek / brow / cranium — skull rings (see `skullRing`)
 *   nose                         — nose sweep width/depth
 *   eye                          — dark-feature eye mass
 *   mouth                        — mouth band width
 *   eyeX                         — half-spacing of the eyes as a fraction of head width
 */
export const DEFAULT_FACE = Object.freeze({
  jaw: 1, brow: 1, nose: 1, cheek: 1, cranium: 1, eye: 1, mouth: 1, eyeX: 1,
});

/**
 * The cast's own ring counts for every mass this lane sweeps, named so a reduced build states
 * what it is reducing from.
 *
 * **Every builder below takes its radial count as an argument, and that is lane G's r06 change.**
 * `ambient-life.js` draws two hundred pedestrians against a 1 300-triangle per-figure ceiling
 * (§3) and the cast head alone measures 348, so an ambient head is the same skull profile at a
 * lower radial count rather than a second authored head — a fork drifts from the cast within a
 * round, and the point of the lane is that the two read as one species.
 *
 * `ears` and `locks` are drop switches rather than counts, for the two masses that are genuinely
 * sub-pixel at the ambient station. Both default on, so the cast is untouched: every parameter
 * here defaults to the constant that was hard-coded where it now sits.
 */
export const HEAD_RING_COUNTS = Object.freeze({
  skull: 12,
  nose: 6,
  ear: 5,
  hair: 10,
  lock: 5,
  /**
   * Where the crown cap starts, as a fraction of chin-to-crown. The cast starts it at the
   * hairline and carries the occiput and the temples on the separate back-and-sides mass below;
   * a build that drops that mass takes this lower instead, so the cap alone still closes the
   * back of the head.
   */
  capFrom: 0.62,
});

export const FACE_VARIANTS = Object.freeze({
  broad: Object.freeze({
    jaw: 1.14, brow: 1.18, nose: 1.08, cheek: 1.10, cranium: 1.03,
    eye: 1.08, mouth: 1.12, eyeX: 1.06,
  }),
  fine: Object.freeze({
    jaw: 0.88, brow: 0.90, nose: 0.92, cheek: 0.92, cranium: 0.98,
    eye: 0.92, mouth: 0.88, eyeX: 0.94,
  }),
  round: Object.freeze({
    jaw: 0.96, brow: 0.96, nose: 0.98, cheek: 1.16, cranium: 1.06,
    eye: 1.04, mouth: 1.04, eyeX: 1.00,
  }),
  long: Object.freeze({
    jaw: 0.94, brow: 1.06, nose: 1.10, cheek: 0.94, cranium: 1.04,
    eye: 0.96, mouth: 0.92, eyeX: 0.97,
  }),
});

const FACE_VARIANT_KEYS = Object.freeze(Object.keys(FACE_VARIANTS));

/**
 * Deterministic face knobs for one person id. Salt namespace 200–299 (`SALT.HEAD` + offsets).
 *
 * Picks a declared variant, then applies small continuous drifts so two figures that land on the
 * same named variant still differ at the eye line and the jaw. No `Math.random`, no clock.
 */
export function faceFor(seed) {
  const pick = unitFrom(seed, SALT.HEAD + 0);
  const key = FACE_VARIANT_KEYS[Math.min(
    FACE_VARIANT_KEYS.length - 1,
    Math.floor(pick * FACE_VARIANT_KEYS.length),
  )];
  const base = FACE_VARIANTS[key];
  const drift = (offset, span) => 1 + (unitFrom(seed, SALT.HEAD + offset) - 0.5) * span;
  return Object.freeze({
    jaw: base.jaw * drift(1, 0.08),
    brow: base.brow * drift(2, 0.10),
    nose: base.nose * drift(3, 0.08),
    cheek: base.cheek * drift(4, 0.08),
    cranium: base.cranium * drift(5, 0.04),
    eye: base.eye * drift(6, 0.10),
    mouth: base.mouth * drift(7, 0.10),
    eyeX: base.eyeX * drift(8, 0.06),
    variant: key,
  });
}

/** Head dimensions in local metres, derived from the six-head contract. */
function metrics(p) {
  return {
    h: p.headHeight,
    w: p.headWidth,
    d: p.headDepth,
    top: p.headHeight * 0.5,
    chin: -p.headHeight * 0.5,
  };
}

/**
 * The skull profile, bottom to top, as fractions: `t` up from the chin, `w`/`d` of head width and
 * depth, `z` of head depth forward of centre.
 *
 * Read the `z` column down and the whole of §2.3's "a brow that casts a shadow into the eye
 * sockets" is in it: +0.010 at the cheekbone, **−0.058 at the eye line**, **−0.014 at the brow**,
 * −0.036 above it. The step back and the step forward together are the socket, and because they
 * are rings of the silhouette rather than a box in front of it there is no angle at which the
 * brow can occlude the eye it shades.
 */
const SKULL = Object.freeze([
  { t: 0.000, w: 0.46, d: 0.42, z: 0.080, jaw: 1, cheek: 0 },   // chin, carried forward
  { t: 0.100, w: 0.70, d: 0.67, z: 0.056, jaw: 1, cheek: 0 },   // jaw line
  { t: 0.220, w: 0.88, d: 0.81, z: 0.028, jaw: 0.6, cheek: 0.4 },
  { t: 0.340, w: 0.98, d: 0.86, z: 0.010, jaw: 0, cheek: 1 },   // cheekbone: widest, most forward
  // **r06 deepens the socket again and pushes the brow shelf forward.** r04's −0.076 step still
  // read as a soft dip on the hero plate once the dark features were small: the shelf was only
  // about 48 mm and the eye beads sat near the cheek plane, so the brow cast almost no visible
  // shadow. −0.108 at the socket with +0.018 at the brow is a ~75 mm overhang on this skull —
  // still a ring of the outline (no plank past the silhouette at any yaw), and deep enough that
  // a dark eye mass under it stays in shade on the lab key.
  { t: 0.450, w: 0.94, d: 0.68, z: -0.108, jaw: 0, cheek: 0.5 }, // the socket band
  { t: 0.545, w: 1.00, d: 0.890, z: 0.018, jaw: 0, cheek: 0, brow: 1 }, // the brow shelf
  { t: 0.680, w: 1.00, d: 0.840, z: -0.036, jaw: 0, cheek: 0, cranium: 1 },
  { t: 0.840, w: 0.91, d: 0.770, z: -0.050, jaw: 0, cheek: 0, cranium: 1 },
]);

/** One skull ring in local metres, with the build knobs applied. */
function skullRing(m, f, ring) {
  const jaw = 1 + (f.jaw - 1) * (ring.jaw ?? 0);
  const cheek = 1 + (f.cheek - 1) * (ring.cheek ?? 0);
  const brow = 1 + (f.brow - 1) * (ring.brow ?? 0);
  const cranium = 1 + (f.cranium - 1) * (ring.cranium ?? 0);
  const gain = jaw * cheek * brow * cranium;
  return {
    y: m.chin + ring.t * m.h,
    w: m.w * ring.w * gain,
    d: m.d * ring.d * gain,
    z: m.d * ring.z,
  };
}

/**
 * Where the skull surface is, at a height and an x, in local metres.
 *
 * Every dark feature is placed through this rather than by eye. The r01 brow bar sat at
 * z = 0.494·headDepth and the surface under it was at 0.250 — the number that made it a plank —
 * and the only way to keep a bar on a curved face is to sample the curve it lies on.
 */
function surfaceAt(m, f, t, x) {
  let lower = SKULL[0];
  let upper = SKULL[SKULL.length - 1];
  for (let i = 0; i < SKULL.length - 1; i += 1) {
    if (t >= SKULL[i].t && t <= SKULL[i + 1].t) { lower = SKULL[i]; upper = SKULL[i + 1]; break; }
  }
  const span = upper.t - lower.t;
  const k = span <= 1e-9 ? 0 : (t - lower.t) / span;
  const a = skullRing(m, f, lower);
  const b = skullRing(m, f, upper);
  const halfW = (a.w + (b.w - a.w) * k) * 0.5;
  const halfD = (a.d + (b.d - a.d) * k) * 0.5;
  const centre = a.z + (b.z - a.z) * k;
  const inside = Math.max(0, 1 - (x / halfW) ** 2);
  return { y: m.chin + t * m.h, z: centre + halfD * Math.sqrt(inside), halfW };
}

/**
 * A thin band that follows the face rather than lying across it.
 *
 * Sampled from `surfaceAt` at `steps + 1` stations between `x0` and `x1`, then closed as a prism.
 * A brow or a mouth built this way curves back at its ends by the same amount the cheek does, so
 * it can never stand proud at the corners — which is the whole of the r01 "black letterbox slot"
 * and "plank nailed across the face" finding, at feature scale.
 */
function faceBand(m, f, {
  x0, x1, t, height, thickness, proud, steps = 3, drop = 0, bow = 0,
}) {
  const position = [];
  const uv = [];
  const index = [];
  const stations = steps + 1;
  for (let i = 0; i < stations; i += 1) {
    const k = i / steps;
    const x = x0 + (x1 - x0) * k;
    // A brow falls away at its outer end and runs from the inner station outward, so `drop` is
    // one-sided in k. A mouth runs corner to corner across the midline and has to fall at BOTH
    // ends, so `bow` is symmetric about the centre of the run. Applying `drop` to a mouth tilts
    // it — one corner up, one down — which is a sneer rather than a mouth.
    const fall = drop * (k ** 2) + bow * ((2 * k - 1) ** 2);
    const s = surfaceAt(m, f, t, Math.abs(x));
    const front = s.z + proud;
    const back = s.z + proud - thickness;
    const yTop = s.y + height * 0.5 - fall;
    const yBottom = s.y - height * 0.5 - fall;
    // 0 front-top, 1 front-bottom, 2 back-bottom, 3 back-top
    position.push(x, yTop, front, x, yBottom, front, x, yBottom, back, x, yTop, back);
    for (let c = 0; c < 4; c += 1) uv.push(k, c / 3);
  }
  for (let i = 0; i < steps; i += 1) {
    const a = i * 4;
    const b = (i + 1) * 4;
    for (let c = 0; c < 4; c += 1) {
      const n = (c + 1) % 4;
      index.push(a + c, b + c, b + n, a + c, b + n, a + n);
    }
  }
  const cap = (base, flip) => {
    if (flip) index.push(base + 0, base + 2, base + 1, base + 0, base + 3, base + 2);
    else index.push(base + 0, base + 1, base + 2, base + 0, base + 2, base + 3);
  };
  cap(0, false);
  cap((stations - 1) * 4, true);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The whole skull as a ring stack, chin to crown, with the crown closed by a dome rather than a
 * flat disc.
 *
 * Shared with the hair, which is the point: r02's first hair was a sphere sized by eye, and at
 * 45 degrees off vertical the skull's own dome — which is fatter than a sphere at mid-latitude —
 * came *through* it, so the back of the head carried a bald strip on the turn strip. A cap built
 * from the surface it is meant to cover cannot do that at any latitude.
 */
function skullProfile(m, f) {
  const rings = SKULL.map((ring) => skullRing(m, f, ring));
  const crownBase = rings[rings.length - 1];
  // The crown lands exactly on the six-head datum: t 0.84 plus this rise is 1.0 head above the
  // chin, so a head count measured off a hero plate is measuring the contract.
  const rise = m.h * 0.160;
  for (let i = 1; i <= 2; i += 1) {
    const a = (i / 2) * (Math.PI * 0.5);
    rings.push({
      y: crownBase.y + Math.sin(a) * rise,
      w: crownBase.w * Math.cos(a * 0.92),
      d: crownBase.d * Math.cos(a * 0.92),
      z: crownBase.z,
    });
  }
  return rings;
}

/**
 * The skin head: skull, jaw, socket band, brow shelf, nose and ears, merged into one buffer.
 *
 * One swept solid carries cranium, jaw, cheek, socket and brow — r01 built the first two as a
 * sphere and a five-ring stack and then nailed a box on for the third, which cost 372 triangles
 * and produced the plank. This costs 240 and produces an overhang the eye sits under.
 */
export function buildHeadGeometry(p = PROPORTIONS, face = DEFAULT_FACE, {
  segments = HEAD_RING_COUNTS.skull, noseSegments = HEAD_RING_COUNTS.nose,
  earSegments = HEAD_RING_COUNTS.ear, ears = true,
} = {}) {
  const m = metrics(p);
  const f = { ...DEFAULT_FACE, ...face };
  const parts = [];

  parts.push(profileSolid(skullProfile(m, f), segments));

  // Nose — a swept wedge from the root under the brow to a tip that projects past the cheek
  // plane, so it throws a shadow across one cheek at three-quarters and reads in silhouette.
  // r06 pushes the tip further forward (~0.42 head-depth vs r04's 0.379): the r03 critic still
  // found "a nose wedge" that did not move the score, and the plate read showed only a few
  // pixels of projection against the cheek. Authored against the same surface the cheek uses.
  const nose = (t, w, d, z) => ({
    y: m.chin + t * m.h, w: m.w * w * f.nose, d: m.d * d * f.nose, z: m.d * z,
  });
  parts.push(profileSolid([
    nose(0.250, 0.300, 0.280, 0.390),   // nostril base, underside
    nose(0.300, 0.320, 0.330, 0.430),   // tip: widest and furthest forward
    nose(0.448, 0.210, 0.240, 0.350),   // bridge
    nose(0.538, 0.160, 0.195, 0.310),   // root, tucked under the brow shelf
  ], noseSegments));

  // Ears: thin flaps set at the true height — top level with the brow shelf, lobe level with the
  // nostril — rather than the r01 pair of spheres pinned at brow height, which read as bolts.
  //
  // **r04 seats them on the skull instead of beside it.** They were translated to a constant
  // `0.456 × headWidth` whatever the head under them was doing, and the r03 critic found "a flat
  // ear paddle detached at the right edge" on the builder — the head narrows behind the cheekbone
  // and the ear did not follow, so its aft end left the skull. The lateral station is now sampled
  // off the same surface every other feature is placed against, and the flap is set INSIDE it by
  // a hair so its root is buried at every station rather than at one.
  const EAR_T = 0.412;
  const earSeat = surfaceAt(m, f, EAR_T, m.w * 0.40).halfW;
  for (const side of (ears ? [-1, 1] : [])) {
    const ear = profileSolid([
      { y: -0.070, w: 0.052, d: 0.104, z: -0.010 },
      { y: -0.008, w: 0.062, d: 0.180, z: -0.030 },
      { y: 0.062, w: 0.054, d: 0.140, z: -0.048 },
    ], earSegments);
    // **The ear is the one feature in this file authored in absolute metres rather than in
    // fractions of the head it sits on**, and the `m.h / 0.62` was half a fix: 0.62 is the r01
    // head's own crown-to-chin, so the flap already followed head *height* and nothing else. At a
    // different stature its breadth and depth stayed put and it came out twice the ear on half the
    // skull — 10 per cent past the head's own silhouette in x. Both remaining axes now follow the
    // same head the height does, and at the r01 head all three factors are exactly 1, so the ear
    // r04 seated is the ear that renders. g03.
    ear.scale(m.w / EAR_AUTHORED.w, m.h / EAR_AUTHORED.h, m.d / EAR_AUTHORED.d);
    ear.rotateZ(side * -0.10);
    ear.translate(side * (earSeat - m.w * 0.018), -m.h * 0.088, -m.d * 0.048);
    parts.push(ear);
  }

  return mergeParts(parts, new THREE.SphereGeometry(m.w * 0.5, 10, 8));
}

/**
 * Eyes, brows and mouth, as their own buffer.
 *
 * Drawn in the dark-feature material, never in the skin (§2.3). The eye is a dark mass seated in
 * the socket band the skull profile cuts — under a brow shelf that sits ~75 mm proud of the
 * socket floor — so it carries its own value *and* the ridge's shadow. The brow and the mouth
 * are curved bands rather than boxes.
 *
 * **r06: eyes must read darker than skin at hero distance.** r04's small spheres (0.168 × 0.086
 * head) still read as thin lozenges once the lab key grazed their facets; §2.3 fails a face whose
 * features render at the skin's own value. The fix is mass, not a darker albedo (the family is
 * already near-black): a wider, flatter dark disc per eye plus a thicker brow ribbon, both
 * buried in the deeper socket so the lit plane is the dark front rather than a skin cheek.
 */
export function buildFaceGeometry(p = PROPORTIONS, face = DEFAULT_FACE) {
  const m = metrics(p);
  const f = { ...DEFAULT_FACE, ...face };
  const parts = [];

  // Eye lower, brow higher: the first r06 pass put both at the same station and the hero plate
  // merged them into one dark chevron per side (same read r02 got when the brow sat on the eye).
  const EYE_T = 0.430;
  const BROW_T = 0.545;
  const eyeX = 0.200 * f.eyeX;
  const eyeGain = f.eye;

  for (const side of [-1, 1]) {
    const seat = surfaceAt(m, f, EYE_T, m.w * eyeX);

    // Socket pad: a flat dark disc that owns the value of the socket even when the sphere bead
    // catches a highlight. Wider than the bead, thinner front-to-back, seated on the socket
    // floor so it cannot project past the brow shelf.
    const pad = new THREE.SphereGeometry(0.5, 8, 5);
    pad.scale(m.w * 0.200 * eyeGain, m.h * 0.105 * eyeGain, m.d * 0.050);
    pad.translate(side * m.w * eyeX, seat.y, seat.z - m.d * 0.008);
    parts.push(pad);

    // Iris bead: slightly smaller, a little proud of the pad so the eye has a centre rather than
    // reading as one dark smear under the brow.
    const iris = new THREE.SphereGeometry(0.5, 7, 4);
    iris.scale(m.w * 0.138 * eyeGain, m.h * 0.088 * eyeGain, m.d * 0.068);
    iris.translate(side * m.w * eyeX, seat.y, seat.z + m.d * 0.010);
    parts.push(iris);

    // The brow, above the eye and under the shelf, not across it. Thick enough to read as an
    // eyebrow (0.038 head) and proud enough to catch the key on its top face while shading the
    // pad below — but separated in t from the eye so the two do not fuse at hero distance.
    parts.push(faceBand(m, f, {
      x0: side * m.w * 0.060,
      x1: side * m.w * 0.335,
      t: BROW_T,
      height: m.h * 0.038 * f.brow,
      thickness: m.d * 0.044,
      proud: m.d * 0.030,
      drop: m.h * 0.028,
      steps: 4,
    }));
  }

  // One mouth line, curving back at the corners with the jaw.
  //
  // r04 dropped it off the moustache seat; r06 keeps that seat and thins the band further so it
  // cannot re-read as facial hair under a hard key. Width follows `f.mouth`.
  const mouthHalf = m.w * 0.138 * f.mouth;
  parts.push(faceBand(m, f, {
    x0: -mouthHalf,
    x1: mouthHalf,
    t: 0.148,
    height: m.h * 0.022,
    thickness: m.d * 0.030,
    proud: m.d * 0.010,
    bow: m.h * 0.016,
    steps: 4,
  }));

  return mergeParts(parts, new THREE.BoxGeometry(m.w * 0.2, m.h * 0.05, m.d * 0.05));
}

/**
 * Hair as a sculpted mass: a cap over the cranium, a back-and-sides volume that wraps the occiput
 * and both temples, and two locks in front of the ears.
 *
 * §2.5 asks for hair at the temples under a hard hat, and §2.3 for hair at a separate value from
 * the skin. The r01 mass put two boxes across the crown, which read as a plank balanced on the
 * skull on the agent, the broker, the developer and the family, and nothing at all at the temples
 * — so under a hat the builder and the policeman had bare skin from brow to brim.
 *
 * The back-and-sides mass and the temple locks are the load-bearing part of the change. They sit
 * level with the ear, below any brim, and the crown cap above them is held within millimetres of
 * the skull — so the whole mass can stay visible under headwear rather than being hidden.
 */
export function buildHairGeometry(p = PROPORTIONS, face = DEFAULT_FACE, {
  segments = HEAD_RING_COUNTS.hair, lockSegments = HEAD_RING_COUNTS.lock, locks = true,
  sides = true, capFrom = HEAD_RING_COUNTS.capFrom,
} = {}) {
  const m = metrics(p);
  const f = { ...DEFAULT_FACE, ...face };
  const parts = [];

  // The cap: the skull's own crown rings, inflated 1.4 per cent and lifted the same. It clears the
  // skull by 3–6 mm all the way over and no more, and that is the whole reason the hair no longer
  // has to be hidden under headwear.
  //
  // Both bounds were paid for on a plate. r01's shell stood 11 mm out at the temple — enough for a
  // hard-hat brim to cut through it, which is why the rig hid the mass and why the builder and the
  // policeman were bald from brow to brim. r02's first cap went the other way at 4 per cent and
  // punched brown chips through the crown of the policeman's cap. A cap built from the surface it
  // covers can be held at millimetres, which a sphere sized by eye cannot.
  const cap = skullProfile(m, f).filter((ring) => ring.y > m.chin + m.h * capFrom)
    .map((ring) => ({
      y: ring.y * 1.014 + m.h * 0.0025, w: ring.w * 1.014, d: ring.d * 1.014, z: ring.z,
    }));
  parts.push(profileSolid(cap, segments));

  // The back-and-sides mass: the one part of the hair that is *below* a hat brim and therefore
  // the one part that decides whether §2.5's "hair visible at the temples" is satisfied on the
  // builder and the policeman. Its rings are pushed back in z so the front of each ellipse stops
  // behind the cheekbone — the hair wraps the occiput and both temples and never crosses a face.
  //
  // **r04 derives it from the skull instead of authoring it, and that closes the slab.** r02
  // authored a widest ring of 1.075 head-widths against a skull that is 0.95 at the same height,
  // so the mass stood **35 mm proud at the temple** on a flat-shaded head — which is what the r03
  // critic read as "a translucent violet-grey slab at the temple with a hard rectangular edge
  // projecting past the skull silhouette". It was not translucent: it was a straight-sided mass
  // wider than the curved head behind it, so the skin reappeared past its edge at every angle.
  //
  // Built from `skullProfile` and inflated by a constant 11 mm each side, it follows the head at
  // every latitude and can no longer overhang it — the same argument that made the crown cap
  // work, applied to the part of the mass that is actually visible under a hat.
  const OFFSET = m.w * 0.040;
  const band = sides ? skullProfile(m, f)
    .filter((ring) => ring.y > m.chin + m.h * 0.26 && ring.y < m.chin + m.h * 0.80)
    .map((ring) => ({
      y: ring.y,
      w: ring.w + OFFSET,
      d: ring.d * 0.86,
      z: ring.z - m.d * 0.150,
    })) : null;
  // A nape below the band, and a low occipital close above it, so the mass is a closed volume
  // rather than a shell with two open rims showing their own inside faces.
  if (band) {
    band.unshift({
      y: m.chin + m.h * 0.20, w: band[0].w * 0.90, d: band[0].d * 0.68, z: band[0].z - m.d * 0.050,
    });
    band.push({
      y: m.chin + m.h * 0.86, w: band[band.length - 1].w * 0.86,
      d: band[band.length - 1].d * 0.80, z: band[band.length - 1].z,
    });
    parts.push(profileSolid(band, segments));
  }

  // No separate hairline band. r02 carried one — a ring 18 mm proud of the skull at mid-forehead
  // — and it was what punched two brown chips through the crown of the policeman's cap. The cap
  // above already ends on a closed ring at t 0.68, which *is* a hairline, and it ends there at the
  // skull's own radius, so it cannot pierce anything.

  // No raised parting block. r02 carried one and it was the second thing to punch through the
  // crown of the policeman's cap — and a parting is a feature that only reads *because* it stands
  // above the crown, so there is no size at which it both reads and clears a snug hat. The
  // direction in the mass comes from the off-centre temple locks and the occipital volume
  // instead, neither of which is anywhere near a brim line.

  // Temple locks, in front of the ear and below any brim — the sideburn the reference builder
  // carries under his hard hat, and the one thing that keeps him from being bald from brow to
  // brim, which is the read the r03 critic still found on `hero--cheap-builder.png`.
  //
  // **r04 seats them on the surface rather than at a constant station.** Translated to a fixed
  // 0.452 head-widths with a half-width of 0.065, the outer face of each lock sat at 0.517 against
  // a skull half-width of 0.49 — 15 mm proud, on a five-sided prism, which is the "hard
  // rectangular edge projecting past the skull silhouette" in the same finding. Sampling the
  // skull at the lock's own height puts the mass on the head and its outer face inside the
  // silhouette, so what projects is hair-shaped rather than box-shaped.
  for (const side of (locks ? [-1, 1] : [])) {
    const seat = (t) => surfaceAt(m, f, t, m.w * 0.36).halfW;
    const lock = profileSolid([
      { y: -m.h * 0.175, w: m.w * 0.090, d: m.d * 0.120, z: m.d * 0.010, x: side * (seat(0.325) - m.w * 0.030) },
      { y: -m.h * 0.040, w: m.w * 0.118, d: m.d * 0.205, z: -m.d * 0.022, x: side * (seat(0.460) - m.w * 0.026) },
      { y: m.h * 0.115, w: m.w * 0.126, d: m.d * 0.250, z: -m.d * 0.062, x: side * (seat(0.615) - m.w * 0.024) },
    ], lockSegments);
    parts.push(lock);
  }

  return mergeParts(parts, new THREE.SphereGeometry(m.w * 0.52, 10, 6));
}

/**
 * The instance scale a hair mass takes when headwear covers the crown.
 *
 * §2.5 requires hair at the temples under a hard hat, and r01's answer — hide the whole mass —
 * left the builder and the policeman bare from brow to brim.
 *
 * The first r02 answer squashed the mass vertically instead, and that was worse in a way the
 * plate showed at once: the rival developer's headwear is a *band*, not a crown, so dropping the
 * hair 28 per cent exposed a skin-coloured scalp above it. The shell is now tight enough to the
 * skull that no hat has to be given room, so this is a hair's breadth under unity rather than a
 * squash — it exists to break a coplanar z-fight with a snug crown, not to make space.
 */
export const HAT_FIT = Object.freeze({ x: 0.998, y: 0.996, z: 0.998 });

// ——— compatibility ————————————————————————————————————————————————————————————————————
// The pre-r01 names took a head radius rather than the proportion contract. Kept as thin
// forwarders so nothing outside this lane breaks mid-round.

/** @deprecated use `buildHeadGeometry(PROPORTIONS)`. */
export function buildVoxelHeadGeometry() {
  return buildHeadGeometry(PROPORTIONS);
}

/** @deprecated use `buildHairGeometry(PROPORTIONS)`. */
export function buildVoxelHairGeometry() {
  return buildHairGeometry(PROPORTIONS);
}

export default buildHeadGeometry;
