// District Deck V3.40 — seat DETAIL. Joinery and period ornament for the four detached houses.
//
// Governing spec: docs/next-phase/V340-RESIDENTIAL-HOUSES-FROM-SCRATCH-SPEC.md §2.3, §2.5
// Module contract: ./CONTRACT.md §6 — the exports below are exactly the ones it names.
//
// Written from the reference pack, not from the stashed lane. Nothing here reads
// `../ornament.js`, `../curtilage.js` or `../_stash/federation-v330-stashed.js`, and nothing
// here routes a material by inspecting a geometry name.
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// THE THREE THINGS THIS FILE EXISTS TO GET RIGHT
//
// 1. `taperedPier` runs WIDE AT THE BOTTOM. The stashed lane called
//    `THREE.CylinderGeometry(radiusTop, radiusBottom, …)` with the base width first and
//    produced a funnel standing on a brick block — 0.56 m at the head against 0.30 m at the
//    foot, measured on the plate at 79 px against 49 px. This file never touches
//    CylinderGeometry for a pier: it goes through `taper(rBottom, rTop, …)` from ../core.js,
//    whose argument order reads the way a builder thinks, and then clamps the head width so
//    a caller who passes the two the wrong way round still gets a pier standing up.
//
// 2. Ornament must differ in VALUE from the surface it is mounted on. The cottage's frieze
//    was measured absent — flat green, no modulation at the batten pitch — because the
//    valance head, the beam bead and the beam all resolved to one material. Every component
//    below states the bucket it takes and the ground it is read against, and the rule is the
//    contract's: ornament on `joinery` where the ground is `trim` or `wall`, on `trim` where
//    the ground is `joinery` or `shadow`.
//
// 3. A proud board needs a lit arris as well as a shadow. `shingleCourses` leans each course
//    back into the panel so its butt overhangs the course below and its exposed face turns
//    toward the key. The shadow under the butt and the highlight along the face are then
//    both geometry, and neither depends on what the SURFACES seat does with the albedo.
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// PLACEMENT CONVENTION, held by every export in this file
//
// Face-mounted components take a point ON THE WALL FACE and a `facing`:
//
//   facing   'front' (+Z, the street) | 'back' (-Z) | 'left' (-X) | 'right' (+X)
//            …or a number, the yaw of the outward normal in radians, so a canted bay facet
//            at 38° is expressed exactly the way a flat elevation is.
//
//   u        along the wall, left→right as seen from outside
//   v        up (world Y)
//   n        out of the wall, away from the building
//
// For an opening, `{x, y, z}` is the wall-face point at the CENTRE of the opening and
// `w`/`h` are the opening's size, so `architrave`, `sill` and the sash all agree without
// anyone re-deriving a datum. `sill`, `chimneyCap` and `shingleCourses` take a different
// datum and each says so on its own signature.
//
// BETTER STILL, PASS KIT'S OWN RECORD. `wallShell` and `polyShell` publish `out.openings`,
// and every opening component here accepts one as `opts.opening` and takes the datum, the
// size and the facing straight off it:
//
//   const shell = kit.wallShell(ctx, {…});
//   ctx.add(shell);
//   ctx.add(doubleHungSash(ctx, { opening: shell.openings[0], lights: 2 }));
//
// A sash that recomputes its own wall-face point drifts from the hole that was actually
// punched. The same goes for `verandahFrame().frame` / `.anchors` and `chimney().shaft`:
// read the published measurement rather than solving a beam soffit or a post position twice.
//
// Member weights that KIT also owns are imported from `KIT_METRICS`, not re-chosen here.
//
// Salts: 1200–1499 (CONTRACT.md §5). Variation comes from `ctx.v` and nowhere else — no
// Math.random, no clock, no module-level mutable state.

import * as THREE from 'three';
import { box, slab, cyl, taper, ball, bullnose } from '../core.js';
import { KIT_METRICS } from './house-kit.js';

/* ───────────────────────────────── member weights ─────────────────────────────────────
 *
 * Every number below is in metres and every one of them is heavier than its real-world
 * counterpart. A 30 mm architrave is invisible at board altitude. Chunky beats fussy.
 *
 * WHERE KIT PUBLISHES A NUMBER, THIS FILE READS IT RATHER THAN CHOOSING ITS OWN. `reveal`,
 * `postSize`, `fasciaThickness` and the roof relief depths all come from `KIT_METRICS`, so a
 * member that changes in the KIT seat changes here on the next import instead of drifting
 * apart over a round. The derived numbers state the relation in code, not in a comment.
 *
 * Exported frozen so a critic can read the intent without running the renderer — the same
 * courtesy `HOUSE_SURFACE_SCHEME` does for colour.
 */
export const DETAIL_MEMBERS = Object.freeze({
  /** Opening reveal, straight off KIT. Glazing, sashes and shadow boards all live inside it. */
  reveal: KIT_METRICS.reveal,                     // 0.22
  glassInset: KIT_METRICS.reveal * 0.60,          // 0.132 — the pane, inside the liner
  shadowInset: KIT_METRICS.reveal - 0.035,        // 0.185 — the board behind it, still inside
  sashProudOfGlass: 0.055,

  architraveFace: 0.19,      // outer board. 0.55 × KIT's 0.34 fascia — a 0.16 board read thin
  architraveProud: 0.075,    // …standing off the wall face
  architraveBead: 0.075,     // inner bead — the second weight in the moulding
  architraveBeadProud: 0.115,
  headCapHeight: 0.12,       // projecting head cap over the architrave
  headCapProud: 0.16,
  sillHeight: 0.17,
  sillProud: 0.20,
  sillEar: 0.12,             // sill overhang beyond the architrave, each side
  dripHeight: 0.065,         // drip bead under the sill's outer edge
  sashStile: 0.10,           // double-hung stile / rail
  meetingRail: 0.14,
  glazingBar: 0.05,
  casementMullion: 0.12,
  casementTransom: 0.13,
  leadlightCame: 0.035,
  valanceHeadRail: 0.155,    // the heavy weight above the pierced field
  valanceBottomRail: 0.06,
  valanceSpindle: 0.105,     // spindle diameter at the bulb
  valancePitch: 0.20,        // spindle spacing, measured off detail-federation-verandah-fretwork
  valanceCusp: 0.06,         // cusped-arch board, face width
  bracketMember: 0.062,
  // The post matches KIT's plain post exactly, because DETAIL's turnedPost REPLACES it and a
  // turned post beside a plain one on the same verandah must be the same stick.
  postShaft: KIT_METRICS.postSize,                // 0.20 shaft diameter
  postBase: KIT_METRICS.postSize * 1.70,          // 0.34 square plinth — KIT's base slab
  postCapital: KIT_METRICS.postSize * 1.55,       // 0.31 square capital block
  pierBaseWidth: 0.58,       // ← wide.  Measured 134 px on detail-tapered-porch-piers.png
  pierHeadWidth: 0.35,       // ← narrow. Measured  80 px on the same plate; ratio 0.60
  pierPedestalHeight: 0.78,  // brick pedestal, 0.41 of the pier's full standing height
  pierCapProud: 0.075,
  shingleCourse: 0.24,       // course height
  shingleProud: 0.055,       // butt projection off the gable face
  battenWidth: 0.10,
  battenProud: 0.045,
  strapWidth: 0.155,
  strapProud: 0.055,
  rafterTailWidth: 0.115,
  rafterTailDepth: 0.145,
  bedMouldDepth: 0.13,       // the run KIT's `eaves` deliberately leaves to this seat
  bedMouldProud: 0.10,
  kneeBracketMember: 0.165,
  // Cresting sits ON KIT's ridge cap (0.30 × 0.15 rise), so a fin must clear that rise.
  crestingFin: 0.045,
  crestingHeight: KIT_METRICS.ridgeCapRise + 0.09,   // 0.24
  // The gutter hangs on KIT's fascia and must stand clear of a MODELLED corrugation rib
  // (0.060 deep) or a tile nose (0.075 proud), not flush with a plane.
  gutterFace: 0.20,
  gutterProud: KIT_METRICS.fasciaThickness + 0.05,   // 0.18
  hoodRibDepth: KIT_METRICS.corrugationRibDepth,     // 0.060, matched to the roof planes
  downpipeRadius: 0.058,
  louvreBlade: 0.05,
});

/**
 * Normalise a KIT opening record into this file's placement convention.
 *
 * `wallShell` and `polyShell` publish `out.openings` as frozen records carrying `centre`,
 * `outward`, `uAxis`, `w`, `h`, `sillY`, `headY` and `reveal`. Passing one as `opts.opening`
 * is the correct way to place joinery: a sash that recomputes its own wall-face point drifts
 * from the hole that was actually punched, and this lane has lost rounds to exactly that.
 *
 * An explicit opt always wins over the record.
 */
function withOpening(opts) {
  const src = opts?.opening;
  if (!src) return opts;
  const c = src.centre ?? [0, 0, 0];
  const n = src.outward ?? [0, 0, 1];
  return {
    x: c[0], y: c[1], z: c[2],
    w: src.w, h: src.h,
    // My basis has nx = sin(r), nz = cos(r); KIT's `outward` is that same unit vector.
    facing: Math.atan2(n[0], n[2]),
    ...opts,
  };
}

/* Salt bands inside 1200–1499, one per component family, so adding a member to one never
 * shifts another's variation. Bands marked `reserved` carry no variation today; they are
 * held so that adding one later cannot move an existing component's numbers. */
const SALT = Object.freeze({
  valance: 1200,
  bracket: 1230,   // reserved
  post: 1250,
  pier: 1280,      // reserved — the pier is fully determined, and jittering a batter is how
                   // an inverted pier hides
  shingle: 1300,
  sash: 1340,
  casement: 1380,
  bay: 1400,
  door: 1420,      // reserved
  rafter: 1430,    // reserved — a rafter run must stay on an even pitch
  crest: 1450,     // reserved
  chimney: 1470,   // reserved
  gutter: 1480,
  vent: 1490,      // reserved
});

/** Keep a placed component's salt inside its own band. */
function saltAt(base, index, span = 18) {
  return base + (Math.abs(index | 0) % span);
}

/* ─────────────────────────────── frames and primitives ────────────────────────────── */

const FACING_YAW = Object.freeze({
  front: 0,
  back: Math.PI,
  left: -Math.PI / 2,
  right: Math.PI / 2,
});

/**
 * The wall frame. `r` is the yaw of the outward normal; `u` runs along the wall and `n` out
 * of it. One number describes a flat elevation and a canted bay facet alike.
 */
function basis(facing) {
  const r = typeof facing === 'number' ? facing : (FACING_YAW[facing] ?? 0);
  return {
    r,
    ux: Math.cos(r), uz: -Math.sin(r),
    nx: Math.sin(r), nz: Math.cos(r),
  };
}

/** World position of the frame point (u, v, n) taken from origin `o`. */
function at(b, o, u, v, n) {
  return [
    o.x + b.ux * u + b.nx * n,
    (o.y ?? 0) + v,
    o.z + b.uz * u + b.nz * n,
  ];
}

/**
 * A board in a wall frame: `w` along u, `h` up, `t` through the wall.
 *
 * `tilt` rakes it inside the elevation plane (a barge board, a cusped arch, a bracket
 * spoke). `lean` pitches it about the u axis (a shingle course leaning back, a rafter
 * brace rising outward). Then the whole thing is yawed onto the elevation.
 *
 * `../core.js` has `box` and `rotBox`, and both are used below where they fit. Neither
 * expresses "rake in the elevation plane, then yaw onto a facet", because `rotBox` applies
 * its Euler in x → y → z order about world axes, which puts the yaw in the middle. This is
 * the same BoxGeometry with the three rotations in the order a piece of joinery needs.
 */
function plank(b, o, { u = 0, v = 0, n = 0, w, h, t, tilt = 0, lean = 0 }, name) {
  const g = new THREE.BoxGeometry(w, h, t);
  if (lean) g.rotateX(lean);
  if (tilt) g.rotateZ(tilt);
  if (b.r) g.rotateY(b.r);
  const [x, y, z] = at(b, o, u, v, n);
  g.translate(x, y, z);
  g.computeVertexNormals();
  g.name = name;
  return g;
}

/** A Part. Components return arrays of these; a lane assembles, a component never pushes. */
function part(geometry, material) {
  return { geometry, material };
}

/** Pull a bucket off ctx.p, falling back so a half-built palette cannot crash a build. */
function bucket(ctx, key, override) {
  if (override) return override;
  const p = ctx?.p ?? {};
  return p[key] ?? p.trim ?? p.wall ?? null;
}

/* ═══════════════════════════════════ 1. OPENINGS ══════════════════════════════════════ */

/**
 * Moulded architrave: two jambs, a head, and a projecting head cap.
 *
 * BUCKET `trim` (pale). Ground is `wall`, and the sash inside it is `joinery` (dark), so the
 * architrave is the pale step between a mid wall and a dark opening — the middle rung of the
 * value ladder the baseline plates were missing.
 *
 * Two member weights: a 0.16 m outer board standing 0.065 m proud, and a 0.065 m inner bead
 * standing 0.105 m proud, so the moulding has a real profile rather than one flat face.
 *
 * @param {object} ctx
 * @param {{x:number,y:number,z:number,w:number,h:number,facing?:string|number,
 *          material?:object, headCap?:boolean, weight?:number}} opts
 *        `x,y,z` is the wall-face point at the opening centre; `w,h` the opening size.
 * @returns {Array<{geometry:object, material:object}>}
 */
export function architrave(ctx, rawOpts) {
  const opts = withOpening(rawOpts);
  const {
    x, y, z, w, h, facing = 'front', material, headCap = true, weight,
  } = opts;
  const b = basis(facing);
  const o = { x, y, z };
  const mat = bucket(ctx, 'trim', material);
  const out = [];

  const face = weight ?? DETAIL_MEMBERS.architraveFace;
  const proud = DETAIL_MEMBERS.architraveProud;
  const bead = DETAIL_MEMBERS.architraveBead;
  const beadProud = DETAIL_MEMBERS.architraveBeadProud;

  const halfW = w / 2;
  const halfH = h / 2;
  const jambU = halfW + face / 2;
  const headV = halfH + face / 2;
  const jambH = h + face * 2;

  out.push(part(plank(b, o, { u: -jambU, n: proud / 2, w: face, h: jambH, t: proud }, 'architrave-jamb-left'), mat));
  out.push(part(plank(b, o, { u: jambU, n: proud / 2, w: face, h: jambH, t: proud }, 'architrave-jamb-right'), mat));
  out.push(part(plank(b, o, { v: headV, n: proud / 2, w: w + face * 2, h: face, t: proud }, 'architrave-head'), mat));

  // The second weight. Dropped below `high`: the frame survives, the profile does not.
  if (ctx?.detail) {
    const beadU = halfW + bead / 2;
    out.push(part(plank(b, o, { u: -beadU, n: beadProud / 2, w: bead, h: h + bead * 2, t: beadProud }, 'architrave-bead-left'), mat));
    out.push(part(plank(b, o, { u: beadU, n: beadProud / 2, w: bead, h: h + bead * 2, t: beadProud }, 'architrave-bead-right'), mat));
    out.push(part(plank(b, o, { v: halfH + bead / 2, n: beadProud / 2, w: w + bead * 2, h: bead, t: beadProud }, 'architrave-bead-head'), mat));
  }

  if (headCap) {
    const capH = DETAIL_MEMBERS.headCapHeight;
    const capProud = DETAIL_MEMBERS.headCapProud;
    out.push(part(plank(b, o, {
      v: headV + face / 2 + capH / 2, n: capProud / 2,
      w: w + face * 2 + 0.10, h: capH, t: capProud,
    }, 'architrave-head-cap'), mat));
  }
  return out;
}

/**
 * Projecting sill with a real overhang and a drip.
 *
 * BUCKET `trim` (pale). Ground is `wall` below and `joinery` above. The drip bead under the
 * outer edge is what gives the sill a shadow of its own instead of a painted line.
 *
 * `y` here is the TOP of the sill, i.e. the bottom edge of the opening. Every other opening
 * component takes the opening centre; this one is called out because it does not.
 */
export function sill(ctx, rawOpts) {
  const opts = withOpening(rawOpts);
  // A sill's datum is the opening's BOTTOM, not its centre, so a KIT record needs `sillY`.
  if (rawOpts?.opening && rawOpts.y === undefined) opts.y = rawOpts.opening.sillY;
  const {
    x, y, z, w, facing = 'front', material,
    ear = DETAIL_MEMBERS.sillEar,
    proj = DETAIL_MEMBERS.sillProud,
    height = DETAIL_MEMBERS.sillHeight,
    drip = true,
  } = opts;
  const b = basis(facing);
  const o = { x, y, z };
  const mat = bucket(ctx, 'trim', material);
  const out = [];
  const width = w + ear * 2;

  out.push(part(plank(b, o, {
    v: -height / 2, n: proj / 2 - 0.03, w: width, h: height, t: proj,
  }, 'sill-board'), mat));

  // The drip. Small, and it is the reason the sill reads as a sill: it puts a hard shadow
  // under the projection instead of letting the board wash into the wall below it.
  if (drip) {
    const dripH = DETAIL_MEMBERS.dripHeight;
    out.push(part(plank(b, o, {
      v: -height - dripH / 2, n: proj - 0.075, w: width - 0.05, h: dripH, t: 0.085,
    }, 'sill-drip'), mat));
  }
  return out;
}

/**
 * A pane and the shadow board behind it — shared by every opening below.
 *
 * The shadow board is not decoration. Glass with a lit backdrop reads as a decal; glass with
 * a dark surface behind it reads as a hole with a room in it. It is never a curtain: the
 * stashed lane modelled drapes as opaque joinery cards and rendered a near-white slab in one
 * opening and clean glass in the next on the same elevation.
 *
 * BOTH BOARDS LIVE INSIDE KIT'S 0.22 m REVEAL. The pane sits 0.132 m back and the shadow
 * board 0.185 m back, so nothing this component emits pushes through the back of the liner
 * that `wallShell` punched. Those two numbers are derived from `KIT_METRICS.reveal` rather
 * than authored, so a reveal that changes carries the glazing with it.
 *
 * The `shadow` bucket is shared with the verandah ceiling, the opening liners and — per the
 * orchestrator — the garden bed soil. It must be a dark warm neutral that answers light, not
 * a near-black card; that is the SURFACES seat's call and this component depends on it.
 */
function glazing(ctx, b, o, {
  u = 0, v = 0, w, h,
  inset = DETAIL_MEMBERS.glassInset,
  depth = DETAIL_MEMBERS.shadowInset - DETAIL_MEMBERS.glassInset,
}, tag) {
  const out = [];
  const glass = bucket(ctx, 'glass');
  const shade = ctx?.p?.shadow ?? null;
  if (glass) {
    out.push(part(plank(b, o, { u, v, n: -inset, w, h, t: 0.03 }, `${tag}-pane`), glass));
  }
  if (shade) {
    out.push(part(plank(b, o, {
      u, v, n: -inset - depth, w: w + 0.06, h: h + 0.06, t: 0.05,
    }, `${tag}-shadow-board`), shade));
  }
  return out;
}

/**
 * Leadlight: a diagonal lattice with a small centred quarry, in the plane of the glass.
 *
 * BUCKET `joinery` (dark). Ground is `glass`, which the SURFACES seat ramps across the
 * pane's height, so the cames read as a dark pattern against a moving field. `high` only; at
 * `mid` the toplight is plain glass in its frame, which is a plausible window rather than a
 * hole where the pattern was.
 */
function leadlight(ctx, b, o, {
  u = 0, v = 0, w, h, inset = DETAIL_MEMBERS.glassInset - 0.015, salt = SALT.sash,
}, tag) {
  if (!ctx?.detail) return [];
  const mat = ctx?.p?.joinery ?? null;
  if (!mat || w <= 0.08 || h <= 0.08) return [];
  const came = DETAIL_MEMBERS.leadlightCame;
  const diag = Math.hypot(w, h);
  const ang = Math.atan2(h, w);
  const out = [];

  out.push(part(plank(b, o, { u, v, n: -inset, w: diag, h: came, t: 0.03, tilt: ang }, `${tag}-came-a`), mat));
  out.push(part(plank(b, o, { u, v, n: -inset, w: diag, h: came, t: 0.03, tilt: -ang }, `${tag}-came-b`), mat));

  // The coloured quarry at the crossing — read at board altitude as a bright knot rather
  // than as four separate pieces of glass.
  const d = Math.min(w, h) * 0.34;
  const scale = ctx.v ? ctx.v.range(saltAt(salt, 7), 0.82, 1.12) : 1;
  out.push(part(plank(b, o, {
    u, v, n: -inset + 0.012, w: d * scale, h: d * scale, t: 0.03, tilt: Math.PI / 4,
  }, `${tag}-quarry`), mat));

  return out;
}

/**
 * Federation double-hung sash: two sashes, a meeting rail, moulded architrave, projecting
 * sill, glass and a shadow board.
 *
 * BUCKETS `joinery` sashes (dark, against `glass` and the pale `trim` architrave), `trim`
 * architrave and sill, `glass` pane, `shadow` board behind it.
 *
 * Members: stile / rail 0.095 m standing 0.055 m proud of the glass, meeting rail 0.13 m,
 * glazing bars 0.05 m. `lights` puts vertical bars in the upper sash; `leadlight: true` puts
 * a lattice in it instead, which is the villa's principal-window treatment.
 */
export function doubleHungSash(ctx, rawOpts) {
  const opts = withOpening(rawOpts);
  const {
    x, y, z, w, h, facing = 'front', material,
    lights = 0, leadlight: lead = false, frame = true, index = 0, sillOpts = null,
  } = opts;
  const b = basis(facing);
  const o = { x, y, z };
  const mat = bucket(ctx, 'joinery', material);
  const out = [];

  const stile = DETAIL_MEMBERS.sashStile;
  const meet = DETAIL_MEMBERS.meetingRail;
  const inset = DETAIL_MEMBERS.glassInset;
  const proud = inset - DETAIL_MEMBERS.sashProudOfGlass;
  const halfW = w / 2;
  const halfH = h / 2;
  const upperH = h * 0.5;

  out.push(...glazing(ctx, b, o, { w: w - 0.02, h: h - 0.02, inset }, 'sash'));

  out.push(part(plank(b, o, { u: -halfW + stile / 2, n: -proud, w: stile, h, t: 0.07 }, 'sash-stile-left'), mat));
  out.push(part(plank(b, o, { u: halfW - stile / 2, n: -proud, w: stile, h, t: 0.07 }, 'sash-stile-right'), mat));
  out.push(part(plank(b, o, { v: halfH - stile / 2, n: -proud, w, h: stile, t: 0.07 }, 'sash-head-rail'), mat));
  out.push(part(plank(b, o, { v: -halfH + stile / 2, n: -proud, w, h: stile, t: 0.07 }, 'sash-bottom-rail'), mat));
  out.push(part(plank(b, o, { v: halfH - upperH, n: -proud + 0.012, w, h: meet, t: 0.085 }, 'sash-meeting-rail'), mat));

  if (lead) {
    out.push(...leadlight(ctx, b, o, {
      v: halfH - upperH / 2,
      w: w - stile * 2,
      h: upperH - stile - meet / 2,
      salt: saltAt(SALT.sash, index),
    }, 'sash-upper'));
  } else if (lights > 0 && ctx?.mid) {
    const bar = DETAIL_MEMBERS.glazingBar;
    const step = (w - stile * 2) / (lights + 1);
    for (let i = 1; i <= lights; i += 1) {
      out.push(part(plank(b, o, {
        u: -halfW + stile + step * i, v: halfH - upperH / 2,
        w: bar, h: upperH - stile, t: 0.05, n: -proud + 0.01,
      }, `sash-glazing-bar-${i}`), mat));
    }
  }

  if (frame) {
    out.push(...architrave(ctx, { x, y, z, w, h, facing }));
    out.push(...sill(ctx, {
      x, y: y - halfH, z, w: w + DETAIL_MEMBERS.architraveFace * 2, facing,
      ...(sillOpts ?? {}),
    }));
  }
  return out;
}

/**
 * Californian casement bank: N casements under a continuous head, each with a leadlight
 * toplight over a plain lower sash. The bank is the archetype's window — a single opening
 * repeated four times along the frontage is the read this component exists to prevent.
 *
 * BUCKETS `joinery` mullions, transom and casement frames; `trim` architrave and sill;
 * `glass`; `shadow` behind.
 *
 * Members: mullion 0.115 m, transom 0.125 m, casement stile 0.095 m. `toplightF` is the
 * fraction of the opening height given to the toplights — 0.28, which is what the reference
 * banks measure.
 */
export function casementBank(ctx, rawOpts) {
  const opts = withOpening(rawOpts);
  const {
    x, y, z, w, h, facing = 'front', material,
    lights = 3, toplightF = 0.28, toplights = true, frame = true, index = 0,
  } = opts;
  const b = basis(facing);
  const o = { x, y, z };
  const mat = bucket(ctx, 'joinery', material);
  const out = [];

  const n = Math.max(1, Math.round(lights));
  const stile = DETAIL_MEMBERS.sashStile;
  const mull = DETAIL_MEMBERS.casementMullion;
  const tran = DETAIL_MEMBERS.casementTransom;
  const inset = DETAIL_MEMBERS.glassInset;
  const proud = inset - DETAIL_MEMBERS.sashProudOfGlass;
  const halfW = w / 2;
  const halfH = h / 2;
  const topH = toplights ? h * toplightF : 0;
  const transomV = halfH - topH;

  out.push(...glazing(ctx, b, o, { w: w - 0.02, h: h - 0.02, inset }, 'casement'));

  out.push(part(plank(b, o, { u: -halfW + stile / 2, n: -proud, w: stile, h, t: 0.075 }, 'casement-jamb-left'), mat));
  out.push(part(plank(b, o, { u: halfW - stile / 2, n: -proud, w: stile, h, t: 0.075 }, 'casement-jamb-right'), mat));
  out.push(part(plank(b, o, { v: halfH - stile / 2, n: -proud, w, h: stile, t: 0.075 }, 'casement-head'), mat));
  out.push(part(plank(b, o, { v: -halfH + stile / 2, n: -proud, w, h: stile, t: 0.075 }, 'casement-cill-rail'), mat));

  const step = w / n;
  for (let i = 1; i < n; i += 1) {
    out.push(part(plank(b, o, {
      u: -halfW + step * i, n: -proud + 0.008, w: mull, h, t: 0.09,
    }, `casement-mullion-${i}`), mat));
  }

  if (toplights) {
    out.push(part(plank(b, o, {
      v: transomV, n: -proud + 0.014, w, h: tran, t: 0.095,
    }, 'casement-transom'), mat));
    for (let i = 0; i < n; i += 1) {
      out.push(...leadlight(ctx, b, o, {
        u: -halfW + step * (i + 0.5), v: transomV + topH / 2,
        w: step - mull - 0.04, h: topH - tran * 0.5 - 0.04,
        salt: saltAt(SALT.casement, index * 4 + i),
      }, `casement-toplight-${i}`));
    }
  }

  if (frame) {
    out.push(...architrave(ctx, { x, y, z, w, h, facing }));
    out.push(...sill(ctx, {
      x, y: y - halfH, z, w: w + DETAIL_MEMBERS.architraveFace * 2, facing,
      proj: DETAIL_MEMBERS.sillProud + 0.02,
    }));
  }
  return out;
}

/**
 * Brighton's faceted projecting bay — the archetype's loudest cue after the roof.
 *
 * Three facets: a front light and two splayed returns, each glazed, with leadlight in the
 * upper sashes. `carcass` (default true) builds the bay's apron and spandrel so the
 * component stands up on its own; a builder seat that has already run `wallShell` for the
 * bay box passes `carcass: false`. `roof` (default true) caps it with its own small tiled
 * roof in the `roof` bucket.
 *
 * BUCKETS `joinery` sashes, mullions and transoms; `trim` sill band, head band and corner
 * posts; `glass`; `shadow`; `wall` spandrel; `wallAlt` apron; `roof` cap. No tenth bucket.
 */
export function leadlightBay(ctx, rawOpts) {
  const opts = withOpening(rawOpts);
  const {
    x, y, z, w, h, facing = 'front', projection = 0.62,
    frontF = 0.58, sillV = null, carcass = true, roof = true, index = 0,
  } = opts;
  const b = basis(facing);
  const o = { x, y, z };
  const mat = bucket(ctx, 'joinery');
  const trim = bucket(ctx, 'trim');
  const out = [];

  const frontW = w * frontF;
  const wing = (w - frontW) / 2;
  const wingLen = Math.hypot(wing, projection);
  const wingAng = Math.asin(projection / Math.max(wingLen, 1e-4));
  const halfH = h / 2;
  const baseV = sillV ?? -halfH;

  // Facet frames, expressed through the same basis machinery as a flat elevation.
  const facets = [
    { r: b.r, cu: 0, cn: projection, width: frontW, tag: 'front' },
    { r: b.r - wingAng, cu: -(frontW + wing) / 2, cn: projection / 2, width: wingLen, tag: 'left' },
    { r: b.r + wingAng, cu: (frontW + wing) / 2, cn: projection / 2, width: wingLen, tag: 'right' },
  ];

  const stile = DETAIL_MEMBERS.sashStile;
  const tran = DETAIL_MEMBERS.casementTransom;
  const topH = h * 0.30;
  const inset = DETAIL_MEMBERS.glassInset * 0.82;
  const proud = inset - 0.05;

  for (let i = 0; i < facets.length; i += 1) {
    const f = facets[i];
    const fb = basis(f.r);
    const [fx, fy, fz] = at(b, o, f.cu, 0, f.cn);
    const fo = { x: fx, y: fy, z: fz };
    const fw = f.width;
    const glassW = Math.max(0.3, fw - 0.22);
    const halfFW = fw / 2;

    out.push(...glazing(ctx, fb, fo, { w: glassW, h: h - 0.16, inset }, `bay-${f.tag}`));

    out.push(part(plank(fb, fo, { u: -halfFW + stile / 2, n: -proud, w: stile, h, t: 0.08 }, `bay-${f.tag}-stile-left`), mat));
    out.push(part(plank(fb, fo, { u: halfFW - stile / 2, n: -proud, w: stile, h, t: 0.08 }, `bay-${f.tag}-stile-right`), mat));
    out.push(part(plank(fb, fo, { v: halfH - stile / 2, n: -proud, w: fw, h: stile, t: 0.08 }, `bay-${f.tag}-head`), mat));
    out.push(part(plank(fb, fo, { v: halfH - topH, n: -proud + 0.014, w: fw, h: tran, t: 0.095 }, `bay-${f.tag}-transom`), mat));
    out.push(...leadlight(ctx, fb, fo, {
      v: halfH - topH / 2, w: glassW - 0.06, h: Math.max(0.1, topH - tran * 0.6),
      salt: saltAt(SALT.bay, index * 3 + i),
    }, `bay-${f.tag}-toplight`));

    // The heavy cream band under the glazing and the head band over it. `trim` on both, and
    // they are what makes the bay read as one object rather than as three windows.
    out.push(part(plank(fb, fo, {
      v: baseV - DETAIL_MEMBERS.sillHeight / 2, n: DETAIL_MEMBERS.sillProud / 2 - 0.02,
      w: fw + 0.10, h: DETAIL_MEMBERS.sillHeight, t: DETAIL_MEMBERS.sillProud,
    }, `bay-${f.tag}-sill-band`), trim));
    out.push(part(plank(fb, fo, {
      v: halfH + 0.09, n: 0.06, w: fw + 0.10, h: 0.18, t: 0.14,
    }, `bay-${f.tag}-head-band`), trim));

    if (carcass) {
      const wallMat = ctx?.p?.wall ?? null;
      const brickMat = ctx?.p?.wallAlt ?? null;
      const apronH = Math.max(0.30, halfH + baseV + 0.85);
      if (brickMat) {
        out.push(part(plank(fb, fo, {
          v: baseV - DETAIL_MEMBERS.sillHeight - apronH / 2, n: -0.03,
          w: fw, h: apronH, t: 0.26,
        }, `bay-${f.tag}-apron`), brickMat));
      }
      if (wallMat) {
        out.push(part(plank(fb, fo, {
          v: halfH + 0.30, n: -0.03, w: fw, h: 0.34, t: 0.26,
        }, `bay-${f.tag}-spandrel`), wallMat));
      }
    }
  }

  // Corner posts on the arrises, so the facets meet in a member rather than in a seam.
  if (ctx?.mid && trim) {
    for (const s of [-1, 1]) {
      const [px, , pz] = at(b, o, s * frontW / 2, 0, projection);
      out.push(part(box(0.14, h + 0.30, 0.14, px, y, pz,
        `bay-corner-post-${s > 0 ? 'right' : 'left'}`), trim));
    }
  }

  // Corbels under the sill band. `detail-leadlight-bay-window.png` carries three of them,
  // and they are what stops the bay reading as a box glued to a wall: the sill band visibly
  // lands on something.
  if (ctx?.detail && trim) {
    for (const s of [-1, 0, 1]) {
      out.push(part(plank(b, o, {
        u: s * frontW * 0.42, v: baseV - DETAIL_MEMBERS.sillHeight - 0.11,
        n: projection + 0.02, w: 0.11, h: 0.22, t: 0.16,
      }, `bay-sill-corbel-${s + 1}`), trim));
    }
  }

  if (roof) {
    const roofMat = ctx?.p?.roof ?? null;
    if (roofMat) {
      // Two steps rather than a solved hip: at board altitude the bay roof is read as a
      // small dark cap with an overhang, and a real hip solver on a 2.6 m bay costs more
      // triangles than the silhouette returns. The KIT seat's `hipRoof` is available to an
      // archetype seat that wants the proper thing — pass `roof: false` and call it.
      out.push(part(plank(b, o, {
        v: halfH + 0.30, n: projection / 2 + 0.02, w: w + 0.34, h: 0.16, t: projection + 0.34,
      }, 'bay-roof-eaves'), roofMat));
      out.push(part(plank(b, o, {
        v: halfH + 0.45, n: projection / 2, w: w * 0.80, h: 0.15, t: (projection + 0.34) * 0.66,
      }, 'bay-roof-upper'), roofMat));

      // Modillion blocks under the eaves plate — the run of small pale blocks the plate
      // shows around all three facets, and the cheapest read on the whole component.
      if (ctx?.detail && trim) {
        const runW = w + 0.30;
        const n = Math.max(4, Math.round(runW / 0.34));
        const mStep = runW / n;
        for (let i = 0; i <= n; i += 1) {
          out.push(part(plank(b, o, {
            u: -runW / 2 + mStep * i, v: halfH + 0.17, n: projection + 0.12,
            w: 0.085, h: 0.13, t: 0.17,
          }, `bay-eave-block-${i}`), trim));
        }
      }
    }
  }
  return out;
}

/**
 * Panelled front door, with an optional fanlight and sidelights.
 *
 * BUCKETS `timber` leaf and raised panels (CONTRACT §4 puts the front door on the warm
 * unpainted timber bucket); `trim` architrave, transom, threshold and knob; `joinery`
 * fanlight bars; `glass` and `shadow` for the light.
 *
 * The panels stand 0.055 m proud of the leaf on all four sides, so each has a lit top arris
 * as well as a shadow underneath. A panel drawn as a recessed line is a door with a pattern
 * printed on it.
 */
export function frontDoor(ctx, rawOpts) {
  const opts = withOpening(rawOpts);
  const {
    x, y, z, w = 1.06, h = 2.24, facing = 'front', material,
    fanlight = true, sidelights = false, panels = 4,
  } = opts;
  const b = basis(facing);
  const o = { x, y, z };
  const timber = bucket(ctx, 'timber', material);
  const trim = bucket(ctx, 'trim');
  const joinery = ctx?.p?.joinery ?? null;
  const out = [];

  const halfW = w / 2;
  const halfH = h / 2;
  const leafN = -0.10;

  out.push(part(plank(b, o, { n: leafN, w, h, t: 0.11 }, 'door-leaf'), timber));

  const cols = 2;
  const rows = Math.max(1, Math.round(panels / cols));
  const marginU = 0.15;
  const marginV = 0.17;
  const cellW = (w - marginU * (cols + 1)) / cols;
  const cellH = (h - marginV * (rows + 1)) / rows;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      out.push(part(plank(b, o, {
        u: -halfW + marginU * (c + 1) + cellW * (c + 0.5),
        v: -halfH + marginV * (r + 1) + cellH * (r + 0.5),
        n: leafN + 0.055, w: cellW, h: cellH, t: 0.05,
      }, `door-panel-${r}-${c}`), timber));
    }
  }

  if (fanlight) {
    const fh = 0.42;
    const fv = halfH + fh / 2 + 0.09;
    out.push(...glazing(ctx, b, o, {
      v: fv, w: w - 0.10, h: fh - 0.06,
    }, 'door-fanlight'));
    if (joinery && ctx?.mid) {
      for (let i = -1; i <= 1; i += 1) {
        out.push(part(plank(b, o, {
          u: i * (w * 0.24), v: fv, n: -0.05,
          w: DETAIL_MEMBERS.glazingBar, h: fh - 0.06, t: 0.05,
        }, `door-fanlight-bar-${i + 1}`), joinery));
      }
    }
    out.push(part(plank(b, o, {
      v: halfH + 0.045, n: -0.02, w: w + 0.06, h: 0.09, t: 0.14,
    }, 'door-transom'), trim));
  }

  if (sidelights) {
    for (const s of [-1, 1]) {
      const su = s * (halfW + 0.30);
      const tag = s > 0 ? 'right' : 'left';
      out.push(...glazing(ctx, b, o, {
        u: su, v: 0.10, w: 0.34, h: h - 0.5,
      }, `door-sidelight-${tag}`));
      out.push(part(plank(b, o, {
        u: su, v: -halfH + 0.24, n: -0.05, w: 0.40, h: 0.48, t: 0.09,
      }, `door-sidelight-panel-${tag}`), timber));
    }
  }

  const frameW = sidelights ? w + 1.02 : w;
  out.push(...architrave(ctx, {
    x, y, z, w: frameW, h: h + (fanlight ? 0.52 : 0), facing,
  }));

  // Threshold, so the door meets the deck in a member instead of dying at a line.
  out.push(part(plank(b, o, {
    v: -halfH - 0.06, n: 0.06, w: frameW + 0.22, h: 0.12, t: 0.30,
  }, 'door-threshold'), trim));

  if (ctx?.detail && trim) {
    const [kx, ky, kz] = at(b, o, halfW - 0.17, -0.05, leafN + 0.10);
    out.push(part(ball(0.048, kx, ky, kz, 'door-knob', 6), trim));
  }
  return out;
}

/**
 * A hood over an opening — the corrugated skillion on the cottage's flank window, or a
 * bullnose where the archetype calls for one.
 *
 * BUCKETS `roof` sheet (dark, against a pale wall, so the hood reads as a solid object at
 * board altitude), `trim` fascia and brackets.
 *
 * The sheet carries its own corrugation ribs at `high`. The shared atlas supplies no rhythm
 * for the corrugated family — the KIT seat models it as geometry on the roof planes — so a
 * hood emitted as one smooth slab would be the one piece of iron on the building with no rib
 * in it.
 */
export function windowHood(ctx, rawOpts) {
  const opts = withOpening(rawOpts);
  const {
    x, y, z, w, facing = 'front', material,
    projection = 0.62, drop = 0.22, style = 'skillion', brackets = true, ribs = true,
  } = opts;
  const b = basis(facing);
  const o = { x, y, z };
  const roofMat = bucket(ctx, 'roof', material);
  const trim = bucket(ctx, 'trim');
  const out = [];
  const hoodW = w + 0.30;
  const slopeLen = Math.hypot(projection, drop);
  const slopeAng = Math.atan2(drop, projection);

  if (style === 'bullnose') {
    // core's bullnose is authored in world Z; build it at the origin and yaw it on.
    const geos = bullnose(hoodW, 0, projection, y - drop, 0, y, 0.09, 'window-hood', 5);
    for (const g of geos) {
      if (b.r) g.rotateY(b.r);
      g.translate(o.x, 0, o.z);
      g.computeVertexNormals();
      out.push(part(g, roofMat));
    }
  } else {
    out.push(part(plank(b, o, {
      v: -drop / 2, n: projection / 2, w: hoodW, h: 0.09, t: slopeLen,
      lean: slopeAng,
    }, 'window-hood-sheet'), roofMat));

    if (ribs && ctx?.detail) {
      const ribPitch = 0.145;
      const n = Math.max(3, Math.round(hoodW / ribPitch));
      const ribStep = hoodW / n;
      for (let i = 0; i <= n; i += 1) {
        out.push(part(plank(b, o, {
          u: -hoodW / 2 + ribStep * i, v: -drop / 2 + 0.045, n: projection / 2,
          w: DETAIL_MEMBERS.hoodRibDepth, h: DETAIL_MEMBERS.hoodRibDepth,
          t: slopeLen, lean: slopeAng,
        }, `window-hood-rib-${i}`), roofMat));
      }
    }
  }

  out.push(part(plank(b, o, {
    v: -drop - 0.02, n: projection, w: hoodW, h: 0.13, t: 0.10,
  }, 'window-hood-fascia'), trim));

  if (brackets && ctx?.mid) {
    for (const s of [-1, 1]) {
      const bu = s * (hoodW / 2 - 0.14);
      const tag = s > 0 ? 'right' : 'left';
      out.push(part(plank(b, o, {
        u: bu, v: -drop - 0.24, n: projection * 0.5, w: 0.10, h: 0.10, t: projection,
      }, `window-hood-bracket-arm-${tag}`), trim));
      const braceLen = Math.hypot(projection, 0.46);
      out.push(part(plank(b, o, {
        u: bu, v: -drop - 0.47, n: projection / 2, w: 0.09, h: 0.09, t: braceLen,
        lean: -Math.atan2(0.46, projection),
      }, `window-hood-bracket-brace-${tag}`), trim));
    }
  }
  return out;
}

/**
 * Louvred gable vent.
 *
 * BUCKETS `trim` frame (pale; on a pale gable face it still reads because the frame projects
 * 0.10 m and casts), `joinery` blades (dark), `shadow` behind. The blades are what make it a
 * vent; a framed rectangle with nothing in it is a blocked-up window.
 */
export function ventGrille(ctx, rawOpts) {
  const opts = withOpening(rawOpts);
  const {
    x, y, z, w = 0.52, h = 0.62, facing = 'front', material, louvres = 5,
  } = opts;
  const b = basis(facing);
  const o = { x, y, z };
  const trim = bucket(ctx, 'trim', material);
  const joinery = ctx?.p?.joinery ?? null;
  const shade = ctx?.p?.shadow ?? null;
  const out = [];
  const fw = 0.09;

  if (shade) {
    out.push(part(plank(b, o, { n: -0.03, w: w - 0.02, h: h - 0.02, t: 0.06 }, 'vent-back'), shade));
  }
  out.push(part(plank(b, o, { u: -w / 2 - fw / 2, n: 0.05, w: fw, h: h + fw * 2, t: 0.10 }, 'vent-frame-left'), trim));
  out.push(part(plank(b, o, { u: w / 2 + fw / 2, n: 0.05, w: fw, h: h + fw * 2, t: 0.10 }, 'vent-frame-right'), trim));
  out.push(part(plank(b, o, { v: h / 2 + fw / 2, n: 0.05, w: w + fw * 2, h: fw, t: 0.10 }, 'vent-frame-head'), trim));
  out.push(part(plank(b, o, { v: -h / 2 - fw / 2, n: 0.05, w: w + fw * 2, h: fw, t: 0.10 }, 'vent-frame-cill'), trim));

  if (ctx?.mid && joinery) {
    const n = ctx.detail ? louvres : Math.max(2, Math.round(louvres / 2));
    const step = h / (n + 0.4);
    for (let i = 0; i < n; i += 1) {
      out.push(part(plank(b, o, {
        v: -h / 2 + step * (i + 0.7), n: 0.035,
        w: w - 0.03, h: DETAIL_MEMBERS.louvreBlade, t: 0.09,
        lean: 0.42,   // blades pitched down and out, so each one casts on the one below
      }, `vent-louvre-${i}`), joinery));
    }
  }
  return out;
}

/* ══════════════════════════════════ 2. ORNAMENT ═══════════════════════════════════════ */

/**
 * Exposed rafter tails under a deep eave — the Californian's flank signature.
 *
 * BUCKET `trim` (pale). Ground is the `shadow` soffit above them and the `wall` behind, so a
 * pale tail is the correct read: dark soffit, pale tail, mid wall.
 *
 * Member 0.115 m wide × 0.145 m deep, projecting `depth` (0.46 m default), at `pitch`
 * (0.62 m). `rake` is the rise per metre along the run, so one component serves a level eave
 * and a gable rake.
 *
 * THE BED MOULD IS ALSO THIS COMPONENT'S. KIT's `eaves` publishes a soffit and a fascia and
 * deliberately emits no bed mould — the soffit edge does that work and the run was left to
 * this seat. `bedMould` (default true) lays a two-band moulding along the wall at the soffit
 * line, behind the tails, so the eave lands on the wall in a member instead of at a line. It
 * survives `low`, where the tails themselves do not: a bed mould is two boxes and it is the
 * whole difference between a wall that stops and a wall that is finished.
 */
export function rafterTails(ctx, opts) {
  const {
    x, y, z, run, facing = 'front', material,
    pitch = 0.62, depth = 0.46, rake = 0, drop = 0,
    width = DETAIL_MEMBERS.rafterTailWidth,
    height = DETAIL_MEMBERS.rafterTailDepth,
    bedMould = true,
  } = opts;
  const b = basis(facing);
  const o = { x, y, z };
  const mat = bucket(ctx, 'trim', material);
  const out = [];

  if (bedMould && !rake) {
    const bm = DETAIL_MEMBERS.bedMouldDepth;
    const bp = DETAIL_MEMBERS.bedMouldProud;
    out.push(part(plank(b, o, {
      v: -drop - bm / 2, n: bp / 2, w: run, h: bm, t: bp,
    }, 'eaves-bed-mould'), mat));
    out.push(part(plank(b, o, {
      v: -drop - bm - 0.03, n: bp * 0.34, w: run, h: 0.06, t: bp * 0.68,
    }, 'eaves-bed-mould-bead'), mat));
  }

  if (!ctx?.mid) return out;

  const step = ctx.detail ? pitch : pitch * 1.9;
  const count = Math.max(2, Math.round(run / step));
  const actual = run / count;

  for (let i = 0; i <= count; i += 1) {
    const u = -run / 2 + actual * i;
    out.push(part(plank(b, o, {
      u, v: -drop + rake * u - height / 2, n: depth / 2,
      w: width, h: height, t: depth,
    }, `rafter-tail-${i}`), mat));
  }
  return out;
}

/**
 * Craftsman knee bracket under a gable rake: an outrigger out of the wall, a drop leg down
 * the wall, and a diagonal brace between them.
 *
 * BUCKET `trim` (pale, against `wall`). Three members at 0.165 m — this is the heaviest
 * piece of ornament on the Californian and it is meant to look structural.
 *
 * `{x, y, z}` is the wall-face point where the outrigger's top meets the rake.
 */
export function kneeBracket(ctx, opts) {
  const {
    x, y, z, span = 0.62, drop = 0.86, facing = 'front', material,
    thickness = DETAIL_MEMBERS.kneeBracketMember,
  } = opts;
  const b = basis(facing);
  const o = { x, y, z };
  const mat = bucket(ctx, 'trim', material);
  const out = [];

  // Outrigger — horizontal, out of the wall, carrying the rake above it.
  out.push(part(plank(b, o, {
    v: -thickness * 0.58, n: (span + 0.10) / 2,
    w: thickness, h: thickness * 1.15, t: span + 0.10,
  }, 'knee-bracket-outrigger'), mat));

  // Drop leg against the wall.
  out.push(part(plank(b, o, {
    v: -drop / 2 - thickness * 0.5, n: thickness * 0.5,
    w: thickness, h: drop, t: thickness,
  }, 'knee-bracket-leg'), mat));

  // Diagonal brace, foot of the leg to the end of the outrigger.
  const rise = drop * 0.86;
  out.push(part(plank(b, o, {
    v: -thickness * 0.58 - rise / 2, n: span / 2,
    w: thickness * 0.86, h: thickness * 0.86, t: Math.hypot(span, rise),
    lean: -Math.atan2(rise, span),
  }, 'knee-bracket-brace'), mat));

  return out;
}

/**
 * Pierced fretwork valance.
 *
 * THIS IS THE COMPONENT THE COTTAGE HAS FAILED ON THREE TIMES, and the failure was never
 * occlusion: the valance head, the beam bead and the beam all resolved to one material, so
 * the frieze sat olive-on-olive and contrast-stretching the band found no period at all at
 * the batten pitch.
 *
 * BUCKETS — and this is a correction made after `detail-federation-verandah-fretwork.png`
 * landed, against an earlier draft of this file that painted the head rail dark:
 *
 *   head rail, moulding bead, pierced field, bottom rail → `trim` (pale). Every reference
 *       paints the whole frieze assembly one cream: mp-cottage-federation, the villa plate
 *       and the detail plate all put the dark band ABOVE the beam, on the roof fascia, which
 *       belongs to the KIT seat and not to this component. A dark head rail here would have
 *       been a value break the building does not have.
 *
 *   recess board behind the pierced field → `shadow`. CONTRACT §4 names this exact use —
 *       "the recess behind a valance" — and it is the mechanical answer to a frieze that
 *       measured flat. Every piercing now has a dark surface behind it whatever the verandah
 *       beyond happens to be doing, so the field modulates at the spindle pitch by
 *       construction rather than by luck. Pass `recess: false` where the verandah interior
 *       is already dark enough to do the job.
 *
 * The ladder across 0.5 m of elevation is therefore: dark roof fascia (KIT), pale moulded
 * head rail, pale pierced field against a dark recess, pale bottom rail.
 *
 * Three member weights: a 0.155 m head rail, a 0.105 m spindle, a 0.06 m bottom rail.
 *
 * `style`:
 *   'spindle' — Federation cottage and villa. Turned drops between two rails; the piercing
 *               is the gap. Each drop is THREE barrels at `high` — wide under the rail,
 *               waisted, a bulb, then narrow to the bottom rail — which is the profile the
 *               detail plate shows and the reason a comb of straight bars reads wrong.
 *   'cusp'    — a cusped arcade with a pendant at each cusp, for a verandah whose fringe is
 *               scrollwork rather than balusters.
 *
 * Degradation: at `mid` a spindle keeps its pitch and drops to one barrel, and a cusp loses
 * its pendant, so the ornament thins rather than gapping. At `low` the field collapses to
 * one solid board between the rails: a plain valance, which is a real thing, instead of a
 * hole where the ornament was.
 *
 * DATUM: `{x, y, z}` is the point on the verandah BEAM'S OUTER FACE at the beam's SOFFIT,
 * at the centre of the run. Everything is emitted below `y` and `drop` is the total fall
 * from the soffit to the bottom rail, so the valance cannot collide with the beam the KIT
 * seat put above it.
 */
export function fretworkValance(ctx, opts) {
  const {
    x, y, z, run, facing = 'front', material,
    drop = 0.42, style = 'spindle', pitch = null, index = 0, recess = true,
  } = opts;
  const b = basis(facing);
  const o = { x, y, z };
  const light = bucket(ctx, 'trim', material);
  const shade = ctx?.p?.shadow ?? null;
  const out = [];

  const headH = DETAIL_MEMBERS.valanceHeadRail;
  const botH = DETAIL_MEMBERS.valanceBottomRail;
  const fieldTop = -headH;
  const fieldH = Math.max(0.12, drop - headH);

  // 1. The head rail: the heavy weight, pale, standing proud of the field so it casts on it.
  out.push(part(plank(b, o, {
    v: -headH / 2, n: 0.075, w: run, h: headH, t: 0.15,
  }, 'valance-head-rail'), light));

  // 2. The recess. A dark board behind the pierced field, so every piercing has something to
  //    be a hole in. This is the fix for the frieze that measured flat.
  if (recess && shade) {
    out.push(part(plank(b, o, {
      v: -drop / 2, n: -0.075, w: run, h: drop + 0.04, t: 0.06,
    }, 'valance-recess'), shade));
  }

  if (!ctx?.mid) {
    out.push(part(plank(b, o, {
      v: fieldTop - fieldH / 2, w: run, h: fieldH, t: 0.07,
    }, 'valance-solid-field'), light));
    return out;
  }

  const basePitch = pitch ?? (style === 'cusp' ? 0.26 : DETAIL_MEMBERS.valancePitch);
  const bays = Math.max(3, Math.round(run / basePitch));
  const step = run / bays;
  const u0 = -run / 2;

  if (style === 'cusp') {
    const arcDrop = fieldH * 0.52;
    const boardLen = Math.hypot(step / 2, arcDrop);
    const ang = Math.atan2(arcDrop, step / 2);
    const cw = DETAIL_MEMBERS.valanceCusp;
    const pendantH = (fieldH - arcDrop) * 0.72;
    for (let i = 0; i < bays; i += 1) {
      const cu = u0 + step * (i + 0.5);
      // Two boards falling to the cusp and rising away from it: a continuous arcade whose
      // piercings are the arches, not a comb of parallel bars at one weight.
      out.push(part(plank(b, o, {
        u: cu - step / 4, v: fieldTop - arcDrop / 2,
        w: boardLen, h: cw, t: 0.06, tilt: -ang,
      }, `valance-cusp-a-${i}`), light));
      out.push(part(plank(b, o, {
        u: cu + step / 4, v: fieldTop - arcDrop / 2,
        w: boardLen, h: cw, t: 0.06, tilt: ang,
      }, `valance-cusp-b-${i}`), light));
      if (ctx.detail && pendantH > 0.04) {
        const [px, , pz] = at(b, o, cu, 0, 0);
        const g = taper(0.016, 0.055, pendantH, 0, y + fieldTop - arcDrop - pendantH, 0,
          `valance-pendant-${i}`, 5);
        g.translate(px, 0, pz);
        out.push(part(g, light));
      }
    }
  } else {
    // The turned drop, profiled off the detail plate: a shoulder under the rail, a waist, a
    // bulb, then a narrow foot. Three barrels at `high`, one at `mid`.
    const d = DETAIL_MEMBERS.valanceSpindle;
    const rShoulder = d * 0.46;
    const rWaist = d * 0.22;
    const rBulb = d * 0.50;
    const rFoot = d * 0.24;
    const yTop = y + fieldTop;
    // The field sits BEHIND the head rail's face (n = -0.005 against the rail's +0.075), so
    // the rail casts along the top of every spindle.
    for (let i = 0; i <= bays; i += 1) {
      const [px, , pz] = at(b, o, u0 + step * i, 0, -0.005);
      if (!ctx.detail) {
        // rBottom = bulb, rTop = shoulder → one barrel, still swelling rather than straight.
        const g = taper(rBulb, rShoulder, fieldH, 0, yTop - fieldH, 0, `valance-spindle-${i}`, 5);
        g.translate(px, 0, pz);
        out.push(part(g, light));
        continue;
      }
      const hA = fieldH * 0.34;   // shoulder → waist
      const hB = fieldH * 0.40;   // waist → bulb
      const hC = fieldH - hA - hB; // bulb → foot
      const gA = taper(rWaist, rShoulder, hA, 0, yTop - hA, 0, `valance-spindle-neck-${i}`, 5);
      gA.translate(px, 0, pz);
      out.push(part(gA, light));
      const gB = taper(rBulb, rWaist, hB, 0, yTop - hA - hB, 0, `valance-spindle-bulb-${i}`, 5);
      gB.translate(px, 0, pz);
      out.push(part(gB, light));
      const gC = taper(rFoot, rBulb, hC, 0, yTop - fieldH, 0, `valance-spindle-foot-${i}`, 5);
      gC.translate(px, 0, pz);
      out.push(part(gC, light));
    }
  }

  // 3. The bottom rail, tying the fringe and giving the field a lit bottom arris.
  out.push(part(plank(b, o, {
    v: -drop + botH / 2, n: 0.01, w: run, h: botH, t: 0.085,
  }, 'valance-bottom-rail'), light));

  // The moulding on the head rail — the second weight in the heavy member, jittered a few
  // millimetres per run so two valances on one street are not stamped from one die.
  if (ctx.detail) {
    const jitter = ctx.v ? ctx.v.range(saltAt(SALT.valance, index), -0.010, 0.010) : 0;
    out.push(part(plank(b, o, {
      v: -headH + 0.035 + jitter, n: 0.115, w: run, h: 0.05, t: 0.075,
    }, 'valance-head-moulding'), light));
  }
  return out;
}

/**
 * Fretwork bracket at a post head — the pierced quadrant that ties post to beam.
 *
 * BUCKET `trim` (pale). Ground is the `shadow` verandah recess behind it, so the piercings
 * between the spokes are what carries the read.
 *
 * `hand` is +1 for the bracket on the +u side of the post and -1 for the other. Members
 * 0.062 m. At `mid` the rim chords and the pendant go and two spokes remain; at `low` one
 * raking board remains, which is a plain bracket rather than an absence.
 *
 * DATUM: `{x, y, z}` is the inside corner — the POST'S CENTRE LINE at the beam's SOFFIT.
 * The bracket is emitted into the quadrant below and to the `hand` side of that point, so a
 * post with a bracket each side is two calls with `hand: 1` and `hand: -1` at one datum.
 */
export function fretworkBracket(ctx, opts) {
  const {
    x, y, z, size = 0.40, facing = 'front', material, hand = 1,
    thickness = DETAIL_MEMBERS.bracketMember,
  } = opts;
  const b = basis(facing);
  const o = { x, y, z };
  const mat = bucket(ctx, 'trim', material);
  const out = [];
  const s = hand >= 0 ? 1 : -1;

  if (!ctx?.mid) {
    out.push(part(plank(b, o, {
      u: s * size * 0.5, v: -size * 0.5, n: 0.02,
      w: size * Math.SQRT2, h: thickness, t: 0.055, tilt: s * Math.PI / 4,
    }, 'fretwork-bracket-rake'), mat));
    return out;
  }

  // Leg against the post and head under the beam: the frame the pierced field hangs in.
  out.push(part(plank(b, o, {
    u: s * thickness * 0.5, v: -size / 2, n: 0.02, w: thickness, h: size, t: 0.055,
  }, 'fretwork-bracket-leg'), mat));
  out.push(part(plank(b, o, {
    u: s * size / 2, v: -thickness * 0.5, n: 0.02, w: size, h: thickness, t: 0.055,
  }, 'fretwork-bracket-head'), mat));

  // Radial spokes from the inner corner: three at high, two at mid.
  const angles = ctx.detail ? [0.32, 0.66, 1.02] : [0.44, 0.90];
  const spokeLen = size * 0.99;
  for (let i = 0; i < angles.length; i += 1) {
    const a = angles[i];
    out.push(part(plank(b, o, {
      u: s * Math.cos(a) * spokeLen / 2, v: -Math.sin(a) * spokeLen / 2, n: 0.02,
      w: spokeLen, h: thickness * 0.82, t: 0.05, tilt: -s * a,
    }, `fretwork-bracket-spoke-${i}`), mat));
  }

  // The scroll's outer rim, as chords between the spoke tips.
  if (ctx.detail) {
    for (let i = 0; i < angles.length - 1; i += 1) {
      const p0 = [Math.cos(angles[i]) * spokeLen, -Math.sin(angles[i]) * spokeLen];
      const p1 = [Math.cos(angles[i + 1]) * spokeLen, -Math.sin(angles[i + 1]) * spokeLen];
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const tilt = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
      out.push(part(plank(b, o, {
        u: s * (p0[0] + p1[0]) / 2, v: (p0[1] + p1[1]) / 2, n: 0.02,
        w: len, h: thickness * 0.7, t: 0.05, tilt: s * tilt,
      }, `fretwork-bracket-rim-${i}`), mat));
    }

    // The turned drop pendant at the bracket's outer lower corner. Small, and it is the
    // thing `detail-federation-verandah-fretwork.png` shows that a fan of spokes does not:
    // a hanging terminal that breaks the quadrant's outline against the recess.
    const tipA = angles[angles.length - 1];
    const [dx, , dz] = at(b, o, s * Math.cos(tipA) * spokeLen, 0, 0.02);
    const dropY = y - Math.sin(tipA) * spokeLen;
    const stemH = size * 0.20;
    const stem = taper(0.026, 0.034, stemH, 0, dropY - stemH, 0, 'fretwork-bracket-pendant-stem', 5);
    stem.translate(dx, 0, dz);
    out.push(part(stem, mat));
    out.push(part(ball(0.042, dx, dropY - stemH - 0.030, dz, 'fretwork-bracket-pendant', 5), mat));
  }
  return out;
}

/**
 * Turned verandah post — FOUR ELEMENTS, NOT ONE STICK.
 *
 * `detail-federation-verandah-fretwork.png` settles the layout, and it is not where an
 * earlier draft of this file put it. The turning is concentrated in a stack of rings
 * immediately under the capital; the shaft below is long, plain and only gently tapered.
 * Reading down the plate: square moulded capital block, a flared transition, three stacked
 * turned rings, a long plain shaft, a base bead, a square plinth.
 *
 * BUCKET `trim` (pale) throughout. Its ground is the `shadow` verandah recess and the
 * `garden` beyond, and every reference paints these cream against a dark recess.
 *
 * Members: plinth 0.215 m square, shaft 0.186 m diameter at the foot narrowing to 0.158 m
 * under the neck, turned rings to 0.229 m, capital block 0.245 m square — 1.4 × the shaft,
 * which is what makes the capital read as a capital.
 *
 * `{x, z}` is the post centre, `base` its foot (the verandah deck), `height` foot to the
 * underside of the beam.
 */
export function turnedPost(ctx, opts) {
  const {
    x, z, base = 0, height = 2.55, material, index = 0,
    radius = DETAIL_MEMBERS.postShaft / 2,
  } = opts;
  const mat = bucket(ctx, 'trim', material);
  const out = [];

  const plinth = DETAIL_MEMBERS.postBase;
  const cap = DETAIL_MEMBERS.postCapital;
  const plinthH = 0.26;
  const capH = 0.16;
  const flareH = 0.11;

  out.push(part(slab(plinth, plinthH, plinth, x, base, z, 'post-plinth'), mat));
  out.push(part(slab(cap, capH, cap, x, base + height - capH, z, 'post-capital-block'), mat));

  if (!ctx?.mid) {
    const shaftH = Math.max(0.2, height - plinthH - capH);
    out.push(part(taper(radius * 1.06, radius * 0.90, shaftH, x, base + plinthH, z, 'post-shaft', 6), mat));
    return out;
  }

  const beadH = 0.075;
  const rings = ctx.detail ? 3 : 1;
  const ringH = 0.085;
  const neckH = rings * ringH;

  let yCur = base + plinthH;
  out.push(part(cyl(radius * 1.26, beadH, x, yCur + beadH / 2, z, 'y', 'post-base-bead', 6), mat));
  yCur += beadH;

  // The long plain shaft — the element the plate gives the most height to.
  const shaftH = Math.max(0.3, height - plinthH - beadH - neckH - flareH - capH);
  out.push(part(taper(radius * 1.06, radius * 0.90, shaftH, x, yCur, z, 'post-shaft', 8), mat));
  yCur += shaftH;

  // The turned neck: stacked rings of alternating diameter directly under the capital.
  const j = ctx.detail && ctx.v ? ctx.v.range(saltAt(SALT.post, index), 0.96, 1.04) : 1;
  for (let i = 0; i < rings; i += 1) {
    const swell = (i % 2 === 0 ? 1.31 : 1.12) * j;
    out.push(part(cyl(radius * swell, ringH, x, yCur + ringH / 2, z, 'y', `post-turning-${i}`, 8), mat));
    yCur += ringH;
  }

  // The flare from the round neck to the square capital, so the post visibly meets the beam
  // instead of stopping under it.
  out.push(part(taper(radius * 0.94, radius * 1.36, flareH, x, yCur, z, 'post-capital-flare', 8), mat));

  return out;
}

/**
 * Tapered porch pier — WIDE AT THE BOTTOM, NARROW AT THE TOP.
 *
 * The Californian's battered pier has been inverted four times on the stashed lane and was
 * twice reported closed while still inverted: 0.56 m at the head against 0.30 m at the foot,
 * measured on the plate at 79 px against 49 px. The cause is that
 * `THREE.CylinderGeometry(radiusTop, radiusBottom, …)` takes the TOP first.
 *
 * Two defences, both mechanical:
 *   1. This function never calls CylinderGeometry. It calls `taper(rBottom, rTop, …)` from
 *      ../core.js, whose argument order reads the way a builder thinks.
 *   2. `headWidth` is clamped to at most 0.92 × `baseWidth` before it is used, so a caller
 *      passing the two the wrong way round still gets a pier standing the right way up.
 *
 * The shaft is a four-sided frustum yawed 45°, so its faces are flat and square-on rather
 * than a round column: a Craftsman pier is a battered rectangular block, and four segments
 * is sixteen triangles. The measured bounding-box width of `pier-shaft` is `baseWidth` at
 * its foot and `headWidth` at its head, exactly — which is the assertion this archetype
 * needs to survive.
 *
 * Measured off `detail-tapered-porch-piers.png`, which is why the defaults are what they
 * are: the shaft runs 134 px across at its foot against 80 px at its head — a ratio of 0.60
 * and a gentle batter, not a funnel — on a square clinker pedestal 257 px tall against the
 * shaft's 220 px, with a flat capping slab between the two.
 *
 * BUCKETS `trim` rendered shaft and caps (pale), `wallAlt` brick pedestal (dark masonry).
 * Pale battered shaft on a dark brick block against a mid wall is the whole read.
 */
export function taperedPier(ctx, opts) {
  const {
    x, z, base = 0, height = 1.10, material, brick,
    pedestal = DETAIL_MEMBERS.pierPedestalHeight,
    baseWidth = DETAIL_MEMBERS.pierBaseWidth,
    headWidth = DETAIL_MEMBERS.pierHeadWidth,
    pedestalWidth = null,
    cap = true,
  } = opts;
  const mat = bucket(ctx, 'trim', material);
  const brickMat = brick ?? ctx?.p?.wallAlt ?? mat;
  const out = [];

  // The clamp. Not a warning a builder can ignore: an inverted pair cannot leave here.
  const bw = Math.max(0.18, baseWidth);
  const hw = Math.min(Math.max(0.12, headWidth), bw * 0.92);

  const pedW = pedestalWidth ?? bw + 0.12;
  if (pedestal > 0) {
    out.push(part(slab(pedW, pedestal, pedW, x, base, z, 'pier-pedestal'), brickMat));
    // A pale capping on the brick, so the pedestal has a lit top edge under the shaft.
    out.push(part(slab(pedW + 0.05, 0.09, pedW + 0.05, x, base + pedestal, z, 'pier-pedestal-cap'), mat));
  }

  const shaftBase = base + (pedestal > 0 ? pedestal + 0.09 : 0);
  // A four-segment cylinder is a square in plan; yaw it 45° so its faces are axis-aligned
  // and the measured width across the flats is exactly the authored width.
  const shaft = taper(bw / Math.SQRT2, hw / Math.SQRT2, height, 0, shaftBase, 0, 'pier-shaft', 4);
  shaft.rotateY(Math.PI / 4);
  shaft.translate(x, 0, z);
  shaft.computeBoundingBox();
  out.push(part(shaft, mat));

  if (cap) {
    const capW = hw + DETAIL_MEMBERS.pierCapProud * 2;
    out.push(part(slab(capW, 0.10, capW, x, shaftBase + height, z, 'pier-cap'), mat));
    if (ctx?.detail) {
      out.push(part(slab(capW + 0.07, 0.06, capW + 0.07, x, shaftBase + height + 0.10, z,
        'pier-cap-abacus'), mat));
    }
  }
  return out;
}

/**
 * Shingle or batten courses standing off a gable face.
 *
 * PROUD BOARDS WITH A LIT ARRIS, WHICH IS THE POINT. The stashed lane emitted the
 * Californian's courses as boards proud of a panel in the panel's own material, so each
 * course got a shadow underneath and nothing along its top edge: lines drawn on a wall
 * rather than courses standing off it. Here each course LEANS BACK 0.075 rad — the butt
 * stands 0.055 m off the face and the head tucks into it — so the exposed face turns toward
 * the key and the butt overhangs the course below. Both the shadow and the highlight are
 * geometry, and neither depends on what the SURFACES seat does with the albedo.
 *
 * BUCKET `joinery` (dark, saturated), per CONTRACT §4, which puts gable shingle courses on
 * the joinery bucket. Ground is the gable's `wall` face and the pale `trim` barge board
 * around it, so the panel reads as a dark field inside a pale rake. The belt under the
 * bottom course is `trim`.
 *
 * `style`:
 *   'shingle' — horizontal lapped courses at 0.24 m, the Californian gable.
 *   'batten'  — vertical battens 0.10 m wide on a 0.18 m pitch, the cottage gable.
 *
 * `{x, y, z}` is the wall-face point at the CENTRE of the panel; `w` is the panel width at
 * its base and `h` its height. `gableRake` is the rise per unit run (2h/w for a full
 * triangle); leave it 0 for a rectangular panel.
 */
export function shingleCourses(ctx, opts) {
  const {
    x, y, z, w, h, facing = 'front', material,
    style = 'shingle', courseH = DETAIL_MEMBERS.shingleCourse,
    gableRake = 0, belt = true, index = 0,
  } = opts;
  const b = basis(facing);
  const o = { x, y, z };
  const mat = bucket(ctx, 'joinery', material);
  const trim = ctx?.p?.trim ?? null;
  const out = [];
  const proud = DETAIL_MEMBERS.shingleProud;

  if (style === 'batten') {
    const pitch = ctx?.detail ? 0.18 : 0.28;
    const count = Math.max(3, Math.round(w / pitch));
    const step = w / count;
    for (let i = 0; i <= count; i += 1) {
      const u = -w / 2 + step * i;
      // Trim to the gable triangle at the batten's OUTER EDGE, not at its centreline. A batten
      // trimmed on its centre and then drawn `battenWidth` wide stands `battenWidth/2 · rake`
      // over the rake on its outer top corner — 0.047 m on the cottage. Trimming at the edge is
      // the same arithmetic half a member further out, and the corner lands on the rake instead.
      const edge = Math.abs(u) + DETAIL_MEMBERS.battenWidth / 2;
      const avail = gableRake > 0 ? Math.max(0, h - edge * gableRake) : h;
      if (avail < 0.12) continue;
      out.push(part(plank(b, o, {
        u, v: -h / 2 + avail / 2, n: DETAIL_MEMBERS.battenProud / 2,
        w: DETAIL_MEMBERS.battenWidth, h: avail, t: DETAIL_MEMBERS.battenProud,
      }, `gable-batten-${i}`), mat));
    }
  } else {
    const rows = Math.max(2, Math.round(h / courseH));
    const step = h / rows;
    // A course is drawn 1.16 × the step so its butt laps the course below it. It is therefore
    // TRIMMED AT ITS OWN TOP EDGE and not at its centre: trimming on the centre and then drawing
    // 0.58 · step taller left every course's top corners `0.58 · step · (2/gableRake)` wide of
    // the triangle they were trimmed to — 0.140 m of shingle over the rake on a 4.60 × 1.90
    // gable, on every course in the panel. Brighton absorbed it by pre-shrinking the width it
    // passed; nobody else should have to, and a caller that did not know would hang shingles in
    // the air outside its own barge board.
    const courseTall = step * 1.16;
    for (let i = 0; i < rows; i += 1) {
      const v = -h / 2 + step * (i + 0.5);
      const courseTopY = v + h / 2 + courseTall / 2;
      const avail = gableRake > 0
        ? Math.max(0, w - courseTopY * (2 / gableRake))
        : w;
      if (avail < 0.16) continue;

      out.push(part(plank(b, o, {
        v, n: proud, w: avail, h: courseTall, t: 0.075, lean: -0.075,
      }, `gable-shingle-course-${i}`), mat));

      // Two vertical joints per course at `high`, staggered course to course, so the field
      // is shingles and not weatherboards. Twenty-four triangles a course.
      if (ctx?.detail && avail > 0.7) {
        const stagger = (i % 2) * 0.5;
        for (let j = 0; j < 2; j += 1) {
          out.push(part(plank(b, o, {
            u: -avail / 2 + avail * ((j + 0.5 + stagger) / 2.5), v, n: proud + 0.03,
            w: 0.035, h: step * 1.10, t: 0.05,
          }, `gable-shingle-joint-${i}-${j}`), mat));
        }
      }
    }
  }

  // The moulded belt under the bottom course, pale, so the panel has a base to stand on. It
  // is what stops the dark field bleeding into the wall below it.
  if (belt && trim) {
    out.push(part(plank(b, o, {
      v: -h / 2 - 0.075, n: proud + 0.045, w: w + 0.10, h: 0.15, t: 0.16,
    }, 'gable-belt'), trim));
    if (ctx?.detail) {
      const j = ctx.v ? ctx.v.range(saltAt(SALT.shingle, index), -0.008, 0.008) : 0;
      out.push(part(plank(b, o, {
        v: -h / 2 - 0.18 + j, n: proud + 0.015, w: w + 0.06, h: 0.075, t: 0.11,
      }, 'gable-belt-bead'), trim));
    }
  }
  return out;
}

/**
 * Federation gable strapwork: a bottom plate, raking plates under the barge, vertical straps
 * and a pair of braces at the apex.
 *
 * BUCKET `joinery` (dark) by default. The villa's own gable paints its straps cream on cream
 * roughcast, which at board altitude is the invisible-ornament failure this lane exists to
 * end; the default is therefore the dark bucket, and the Brighton reference — dark straps on
 * white roughcast — is the read being aimed at. A builder seat that wants the cream version
 * passes `material: ctx.p.trim` explicitly and owns the consequence.
 *
 * `{x, y, z}` is the wall-face point at the CENTRE OF THE GABLE'S BOTTOM PLATE; `w` is the
 * gable's full width at that level and `h` the rise to the apex.
 */
export function strapwork(ctx, opts) {
  const {
    x, y, z, w, h, facing = 'front', material, bays = 4, braces = true,
  } = opts;
  const b = basis(facing);
  const o = { x, y, z };
  const mat = bucket(ctx, 'joinery', material);
  const out = [];
  const sw = DETAIL_MEMBERS.strapWidth;
  const proud = DETAIL_MEMBERS.strapProud;
  const rake = h / (w / 2);

  out.push(part(plank(b, o, {
    v: sw / 2, n: proud / 2, w, h: sw, t: proud,
  }, 'strapwork-bottom-plate'), mat));

  // THE RAKE PLATES, AND THE SIGN THAT RUNS THEM. `plank` applies `rotateZ(tilt)` before the
  // yaw, and on a front elevation `ux = +1`, so a POSITIVE tilt makes a plank RISE as u
  // increases. A rake FALLS as u increases — apex at u = 0, eave at u = +w/2 — so the tilt is
  // NEGATIVE for the right-hand plate and positive for the left. It was `s * rakeAng`, which
  // put each plate's ends at the middle of the gable base and one full rise above an eave
  // corner: two dark sticks climbing out of the triangle and across the roof planes behind it,
  // 2.429 m clear of the hip surface on the Brighton plate, with a torn shadow under them.
  // With `-s`, each plate runs apex → its own eave corner, which is the member it is.
  const rakeLen = Math.hypot(w / 2, h);
  const rakeAng = Math.atan2(h, w / 2);
  for (const s of [-1, 1]) {
    out.push(part(plank(b, o, {
      u: s * w / 4, v: h / 2, n: proud / 2, w: rakeLen, h: sw, t: proud, tilt: -s * rakeAng,
    }, `strapwork-rake-${s > 0 ? 'right' : 'left'}`), mat));
  }

  const n = Math.max(2, Math.round(bays));
  for (let i = 1; i < n; i += 1) {
    const u = -w / 2 + (w / n) * i;
    const top = Math.max(0, h - Math.abs(u) * rake) - sw * 0.5;
    if (top < 0.2) continue;
    out.push(part(plank(b, o, {
      u, v: sw + top / 2, n: proud / 2, w: sw, h: top, t: proud,
    }, `strapwork-strap-${i}`), mat));
  }

  if (braces && ctx?.detail) {
    // Same sign, same reason: a brace leaves the king strap high and near the centre and falls
    // outward under the rake. `s * braceAng` ran it the other way, out of the gable and 0.359 m
    // clear of the roof behind it.
    const braceLen = Math.hypot(w * 0.19, h * 0.34);
    const braceAng = Math.atan2(h * 0.34, w * 0.19);
    for (const s of [-1, 1]) {
      out.push(part(plank(b, o, {
        u: s * w * 0.095, v: h * 0.62, n: proud / 2,
        w: braceLen, h: sw * 0.78, t: proud, tilt: -s * braceAng,
      }, `strapwork-brace-${s > 0 ? 'right' : 'left'}`), mat));
    }
  }
  return out;
}

/**
 * Ridge cresting — the terracotta comb along a Queen Anne ridge.
 *
 * BUCKET `roof`. It is terracotta and CONTRACT §4 puts the ridge capping on the roof bucket.
 * Unlike every other component here it does not need value separation from its ground: it is
 * read as a silhouette against the sky, not as a pattern on a surface.
 *
 * THE RIDGE CAP IS KIT'S AND THIS COMPONENT SITS ON TOP OF IT. `capping` therefore defaults
 * to FALSE — `y` is the TOP of KIT's ridge cap (`KIT_METRICS.ridgeCapRise` above the ridge
 * line) and the fins are emitted above that. Two caps in the same place is a seam, and a
 * cresting sized to a flat plane would sit down among the modelled corrugation ribs
 * (0.060 m) and tile noses (0.075 m) instead of standing over them.
 *
 * Fins 0.045 m thick × 0.15 m long at a 0.24 m pitch, 0.24 m tall — `ridgeCapRise + 0.09`,
 * so a fin clears the cap it stands on by a member's own width whatever KIT does to the cap.
 *
 * Dropped entirely at `low`; KIT's ridge cap closes the roof on its own.
 */
export function ridgeCresting(ctx, opts) {
  const {
    x, y, z, run, axis = 'x', material,
    height = DETAIL_MEMBERS.crestingHeight, pitch = 0.24, capping = false,
  } = opts;
  if (!ctx?.mid) return [];
  const mat = bucket(ctx, 'roof', material);
  const out = [];
  const alongX = axis === 'x';
  const t = DETAIL_MEMBERS.crestingFin;
  const capH = KIT_METRICS.ridgeCapRise;
  const finLen = 0.15;

  // Only for a run KIT did not cap. Normally false: `y` is already the top of KIT's cap.
  if (capping) {
    out.push(part(
      alongX ? slab(run, capH, KIT_METRICS.ridgeCapWidth, x, y, z, 'ridge-capping')
        : slab(KIT_METRICS.ridgeCapWidth, capH, run, x, y, z, 'ridge-capping'),
      mat,
    ));
  }

  const step = ctx.detail ? pitch : pitch * 1.7;
  const count = Math.max(2, Math.round(run / step));
  const actual = run / count;
  const yBase = y + (capping ? capH : 0);
  for (let i = 0; i <= count; i += 1) {
    const d = -run / 2 + actual * i;
    out.push(part(
      alongX ? slab(finLen, height, t, x + d, yBase, z, `ridge-cresting-fin-${i}`)
        : slab(t, height, finLen, x, yBase, z + d, `ridge-cresting-fin-${i}`),
      mat,
    ));
  }
  return out;
}

/**
 * Gable or tower finial: base block, turned neck, ball and spike.
 *
 * BUCKET `joinery` by default — the cottage's timber finial is painted the dark accent and
 * read against the sky and the pale barge board. A terracotta finial on the villa or on
 * Brighton passes `material: ctx.p.roof`.
 *
 * At `mid` the ball goes and the spike springs straight off the neck; at `low` the whole
 * component is one tapered spike, which still gives the gable its apex.
 */
export function finial(ctx, opts) {
  const { x, y, z, height = 0.72, material } = opts;
  const mat = bucket(ctx, 'joinery', material);
  const out = [];

  if (!ctx?.mid) {
    out.push(part(taper(0.075, 0.012, height, x, y, z, 'finial-spike', 5), mat));
    return out;
  }

  const baseH = height * 0.20;
  const neckH = height * 0.26;
  const ballR = height * 0.115;
  out.push(part(slab(0.15, baseH, 0.15, x, y, z, 'finial-base'), mat));
  out.push(part(taper(0.062, 0.042, neckH, x, y + baseH, z, 'finial-neck', 6), mat));

  let yCur = y + baseH + neckH;
  if (ctx.detail) {
    out.push(part(ball(ballR, x, yCur + ballR * 0.85, z, 'finial-ball', 6), mat));
    yCur += ballR * 1.7;
  }
  out.push(part(taper(0.040, 0.008, Math.max(0.12, y + height - yCur), x, yCur, z,
    'finial-spike', 5), mat));
  return out;
}

/**
 * Corbelled chimney cap with terracotta pots.
 *
 * BUCKETS `wallAlt` for the oversailing brick courses, `trim` for the rendered capping slab
 * (which is what the reference plates paint cream over red brick), `roof` for the pots —
 * terracotta is the roof's own material and the villa's pots are the same clay as its tiles.
 *
 * `{x, z}` is the shaft centre and `y` the TOP OF THE SHAFT. Every member is emitted above
 * it, so a chimney and its cap cannot disagree about where the shaft ended.
 */
export function chimneyCap(ctx, opts) {
  const {
    x, y, z, w = 0.86, d = 0.66, material, pots = 2, potMaterial,
    potHeight = 0.42, potRadius = 0.11, render = true,
  } = opts;
  const brickMat = material ?? ctx?.p?.wallAlt ?? bucket(ctx, 'trim');
  const trim = bucket(ctx, 'trim');
  const clay = potMaterial ?? ctx?.p?.roof ?? trim;
  const out = [];

  // Oversailing brick courses. Each is wider than the one below, so the corbel has two lit
  // top edges rather than one.
  let yCur = y;
  const courses = ctx?.detail ? 2 : 1;
  for (let i = 0; i < courses; i += 1) {
    const grow = 0.07 * (i + 1);
    out.push(part(slab(w + grow, 0.11, d + grow, x, yCur, z, `chimney-corbel-${i}`), brickMat));
    yCur += 0.11;
  }

  const capW = w + 0.07 * (courses + 1);
  const capD = d + 0.07 * (courses + 1);
  out.push(part(slab(capW, 0.13, capD, x, yCur, z, 'chimney-capping'), render ? trim : brickMat));
  yCur += 0.13;

  if (ctx?.mid && clay) {
    const n = Math.max(1, Math.round(pots));
    const spread = Math.min(w, capW) * 0.52;
    for (let i = 0; i < n; i += 1) {
      const px = n === 1 ? x : x - spread / 2 + (spread / (n - 1)) * i;
      // A real pot narrows as it rises and flares at the rim, which is what
      // `detail-clinker-brick-chimney.png` shows; a plain cylinder reads as a pipe.
      out.push(part(taper(potRadius * 1.06, potRadius * 0.86, potHeight, px, yCur, z,
        `chimney-pot-${i}`, 7), clay));
      if (ctx.detail) {
        out.push(part(taper(potRadius * 0.92, potRadius * 1.22, 0.09, px,
          yCur + potHeight - 0.045, z, `chimney-pot-rim-${i}`, 7), clay));
      }
    }
  }
  return out;
}

/**
 * Gutter and downpipe. Nothing floats and nothing dies in mid-air: the gutter runs along the
 * roof edge it is given, the downpipe leaves the gutter at one end, crosses the wall and
 * finishes on the ground in a shoe.
 *
 * BUCKET `trim` (pale). It runs between the dark roof above and the mid wall below and is
 * the line that separates them, which is the job the `trim` bucket exists for.
 *
 * Members: gutter face 0.155 m deep standing 0.16 m off the wall, downpipe radius 0.058 m.
 * The face is sized to stand clear of a MODELLED corrugation rib rather than flush with a
 * flat plane — the KIT seat cuts roof rhythm in geometry because the shared atlas supplies
 * none for the corrugated and tile families, so a gutter sized to a smooth sheet would be
 * interrupted by the ribs it is meant to catch.
 *
 * `y` is the roof edge (the top of the gutter); `groundY` is where the shoe lands, normally
 * the lot plate at 0.
 */
export function gutterAndDownpipe(ctx, opts) {
  const {
    x, y, z, run, facing = 'front', material,
    projection = DETAIL_MEMBERS.gutterProud, groundY = 0, downpipes = 'end', index = 0,
  } = opts;
  const b = basis(facing);
  const o = { x, y, z };
  const mat = bucket(ctx, 'trim', material);
  const out = [];
  const face = DETAIL_MEMBERS.gutterFace;

  out.push(part(plank(b, o, {
    v: -face / 2, n: projection, w: run, h: face, t: 0.075,
  }, 'gutter-face'), mat));
  out.push(part(plank(b, o, {
    v: -face + 0.035, n: projection / 2, w: run, h: 0.07, t: projection,
  }, 'gutter-sole'), mat));

  if (!ctx?.mid) return out;

  const r = DETAIL_MEMBERS.downpipeRadius;
  const sides = downpipes === 'both' ? [-1, 1]
    : downpipes === 'start' ? [-1]
      : downpipes === 'none' ? []
        : [1];

  for (const s of sides) {
    const u = s * (run / 2 - 0.22);
    const tag = s > 0 ? 'right' : 'left';

    out.push(part(plank(b, o, {
      u, v: -face - 0.05, n: projection / 2, w: r * 2, h: 0.10, t: projection + 0.06,
    }, `downpipe-elbow-${tag}`), mat));

    const top = y - face - 0.10;
    const len = Math.max(0.4, top - groundY - 0.08);
    const [px, , pz] = at(b, o, u, 0, r + 0.02);
    out.push(part(cyl(r, len, px, groundY + 0.08 + len / 2, pz, 'y', `downpipe-${tag}`, 6), mat));

    out.push(part(plank(b, o, {
      u, v: groundY - y + 0.06, n: r + 0.06, w: r * 2.4, h: 0.12, t: 0.22,
    }, `downpipe-shoe-${tag}`), mat));

    if (ctx.detail) {
      const t = ctx.v ? ctx.v.range(saltAt(SALT.gutter, index + (s > 0 ? 1 : 0)), 0.42, 0.58) : 0.5;
      out.push(part(plank(b, o, {
        u, v: groundY - y + len * t, n: r * 0.6, w: r * 2.6, h: 0.06, t: r * 1.6,
      }, `downpipe-strap-${tag}`), mat));
    }
  }
  return out;
}
