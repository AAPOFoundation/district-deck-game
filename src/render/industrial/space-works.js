// District Deck V3.41 — MP9 lane D: `space-works`, the contemporary aerospace pad works.
//
// Spec: `docs/next-phase/V341-MP9-BUILDINGS-SPEC.md` §6D. Lane brief: `mvp/_reviews/mp9/LANE-BRIEF.md`.
// Round-1 orchestrator finding: `mvp/_reviews/mp9/LEDGER.md` — see THE VALUE LADDER below.
//
// WHAT THIS REPLACES. `space-works` was `factory-light` geometry with the words SPACE WORKS on a
// sign plate — the same shed as `cattle-abattoir` and `dairy-processor`. Four subjects on the board
// were one shed with four different words on it. This file gives the subject its own model.
//
// THE SPLIT WITH THE FACTORY IS THE CONTRACT, AND IT IS ENFORCED BY WHAT IS ABSENT.
//
//   | | factory-light | space-works |
//   | vertical | banded process stack on a masonry pedestal | the HIGH BAY itself |
//   | roof     | sawtooth or closed mono, north-lit          | shallow curved standing seam |
//   | opening  | two roller-shuttered dock bays at 1.05 m    | ONE full-height vertical door slot |
//   | wall     | metal cladding over a masonry base          | white insulated panel over precast |
//   | annex    | plant compound, condensers, drums            | test stand, flame trench, cryo pair |
//   | yard     | asphalt, oil bloom, stored goods             | pale concrete pad, hatching, compass rose |
//   | wear     | rust, salt bloom, chalk, tide pools          | tyre scrub and flame scorch ONLY |
//
// **A STACK IS FORBIDDEN.** §6D says so in as many words and it is the one line that keeps the two
// subjects apart at board altitude. Nothing in this file emits a chimney, a flue, a banded shaft or
// a guyed vertical of any kind. The two aerial finials on the high-bay roof are 55 mm rod.
//
// THE MASSING, AND WHY IT IS AN L RATHER THAN A BOX.
//
//   high bay        x ∈ [-2.1, +5.7]   z ∈ [backZ, frontZ]        15.4 m walls, curved roof to 17.1
//   clean-room wing x ∈ [-6.0, -2.1]   z ∈ [-4.0, frontZ + 6.2]    6.6 m walls, parapet to 7.35
//   rear pad        z ∈ [-14.1, backZ]  test stand, flame trench, propellant and cryo tanks
//   front pad       z ∈ [frontZ, +14.1] hatching, compass rose, transporter, gate, guard hut
//
// The wing runs six metres forward of the bay, so the frontage has a real plan step, and the two
// masses are separated by an 8.8 m height step as well. `civic/school.js` measured that two masses
// closer than about 8 u in plate columns merge into one tooth; a height step of that size cannot.
//
// THE CAMERA IS AT +X, +Z. `industrial-lab.js` `VIEWS['three-quarter']` puts the eye at
// `centre + (sin 0.20π, ·, cos 0.20π) · h` — front and RIGHT flank. So the gantry crane rail hangs
// off the high bay's +X flank where it is seen, the wing's ribbon glazing runs on the elevations
// that project past the bay, and the transporter stands on the near half of the pad.
//
// ── THE VALUE LADDER, AND IT IS THE ROUND-1 FINDING WRITTEN AS BUCKET ASSIGNMENTS ──────────────
//
// The orchestrator censused our plates against three Monopoly Plus frames on the same statistics.
// Two numbers came back and both of them are decided in this file rather than in the rig:
//
//   - **We crush 7–13 % of subject pixels below luma 12; every reference crushes 1.2–1.8 %.**
//     Monopoly Plus has no true blacks. Our `international-exchange` baseline reaches 1.09 % out of
//     the same rig, so a lifted shadow is reachable from inside the kit — it lives in how much
//     AREA the near-black buckets are given. `steel` is authored #333a3e with a measured p05 of
//     15–22; `shadow` is its alias. So on this subject the near-black buckets carry FITTINGS ONLY:
//     brackets, ropes, hinges, grate infill, the door reveal, the scorch. Every STRUCTURE that
//     would have been steel — the test stand frame, the gantry girder, the light masts — is
//     `cladding`, the mid-grey sheet family, which is the same silhouette two value steps up.
//   - **Our saturation is 22–24 % against 27–42 %, and every reference sits warm at r−b +23…+43.**
//     A white campus is the subject most likely to land cold and grey by accident. Two answers,
//     both of which the contract already wanted: the company mark is bigger and it is on the DOOR
//     — a saturated full-height red slot in a white wall, which is more board-legible than the
//     dark slot the first draft drew and cheaper in crush — and the designed frontage §6D calls
//     for becomes a continuous lawn band on all four verges rather than a token strip.
//
// The other half of that finding is the opposite trap: `international-exchange` gets its 1.09 % by
// being uniform (median 226.7, p05 65.9), and a flat building scores no better than a crushed one.
// So the ladder is five real steps and every mass sits on a different one:
//
//   trim      #b4bab6–#cfd2cb   HIGH BAY panel, canister, mullions, handrails, hatching  ← brightest
//   wallAlt   #9c9992           CLEAN-ROOM WING panel, plinths, copings, trench, saddles
//   ground    #a9a59c           the pad and the plate deck
//   cladding  #7c888c–#9ea6a2   roofs, tank shells, test stand frame, gantry girder, masts
//   wall      #75392a–#a5553a   THE COMPANY MARK: door leaves, accent band, chevron, roundel, boom
//   steel     #2c3236–#3d3430   fittings only, and `shadow` is its alias
//   glass     #151b1f           the ribbon, the hut, the pane behind the door
//   foliage   #7f963c–#96a94e   the lawn ring
//   goods     #9d7f56–#b39169   the timber transport cradles at the door
//
// WEAR IS AMENDED, DELIBERATELY. §2c's doctrine is clean-beside-dirty; §6D amends it here to
// "minimal and directed: tyre scrub on the pad and scorch at the flame trench, and nothing else".
// `requestWear` below dials rust, salt bloom, moss and oil off every bucket, because the default
// program is authored for a Melbourne meatworks and on a white panel it renders as dirt.
//
// SALTS 3300–3399 and nothing else. Lane C holds 3200–3299, lane E 3400–3499.
// Deterministic: every number comes from `ctx.v`. No `Math.random`, no clock.

import * as THREE from 'three';
import {
  // primitives
  applyMetreUv, box, slab, rotBox, cyl, taper, ball, moulding,
  COPING_PROFILE,
  // industrial primitives
  pipeRun, ladderCaged, externalStair, louvreScreen,
  // the yard kit
  PLATE, boardPlate, hardstandSlab, meshPanelFence, industrialGate, bollard,
  kerb, serviceGrate, crateStack, palletStack, lawnPanel, raisedPlanter, bollardLight,
  // plumbing
  emit, requestWear,
} from './core.js';

/* ────────────────────────────── local dimensional constants ────────────────────────────── */

/** The lot datum: everything stands on the board plate's deck, exactly as the factory does. */
const GROUND = PLATE.rise;
/** Clear ground between the boundary fence and the plate edge, street and rear. */
const VERGE_STREET = 1.05;
/** Narrower on the flanks, because the high bay needs the width and a footpath does not. */
const VERGE_FLANK = 0.80;

/**
 * High bay: wall height, and 12.60 is a MEASURED number rather than an authored one.
 *
 * r1 stood the hall 15.4 m on a 7.7 × 9.5 footprint and the plate came back reading as a tower
 * with a barrel roof — a signal box, or a rail car stood on end. The statistic behind that read is
 * the APPARENT width at the three-quarter station: two faces project as
 * `w·cos 36° + d·sin 36°`, which was 11.8 m against a 17.1 m crest, i.e. 1 : 1.45. The reference
 * masses in `mp-modern-white` and `mp-industrial-strip` sit between 1 : 0.8 and 1 : 1.2. Lowering
 * the crest to 13.7 and deepening the plan to 11.5 puts this at 12.9 : 13.7, i.e. 1 : 1.06 — the
 * same mass, read as a HALL rather than as a tower, at no cost to board legibility.
 */
const BAY_H = 12.60;
/** Rise of the curved roof. Shallower than r1's: a deep arc on a wide mass reads as a bus roof. */
const BAY_ROOF_RISE = 1.10;
/** Precast plinth under the panel. A launch hall stands on a plinth, not on the pad. */
const BAY_PLINTH = 1.15;
/** Gantry crane rail elevation on the bay's +X flank. Under the eaves, over the wing parapet. */
const RAIL_Y = 10.30;

/** Clean-room wing: wall height, parapet head, plinth. */
const WING_H = 6.60;
const WING_PARAPET = 7.35;
const WING_PLINTH = 0.75;
/** Ribbon glazing sill and head. One line at 3.4 m, unbroken, is the wing's whole job. */
const RIB_SILL = 3.40;
const RIB_HEAD = 5.20;

/** Flame trench: lip above the pad, and floor below it. */
const TRENCH_LIP = 0.30;
/**
 * −0.62 and not deeper, and the number is the board plate rather than the trench.
 *
 * `boardPlate` puts its deck between −0.16 and +0.14 and its dark rim bottoms out at −0.94. A cut
 * deeper than that breaks through the UNDERSIDE of the plate, which is invisible on the board and
 * unmissable in a hero plate shot from any elevation that sees under the rim. 0.62 below the deck
 * plus a 0.30 lip reads as a metre of trench, which is what it has to look like.
 */
const TRENCH_FLOOR = -0.62;

/* ─────────────────────────────────── local helpers ─────────────────────────────────── */

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * The same context with a vertical offset applied to everything pushed through it.
 *
 * Copied from `factory.js` with its reasoning, because the reasoning is a bug fix. The building is
 * authored with its ground at y = 0 — a plinth cap is 1.15 m above the pad, a saddle is 0.9 m, a
 * frost band is 1.4 m — and the board plate puts its deck at `PLATE.rise`. Adding `PLATE.rise` to
 * two hundred authored heights is two hundred chances to add it to the wrong one, and the failure
 * is silent: a saddle 140 mm under the paving looks exactly like a saddle nobody modelled.
 *
 * THE YARD KIT IS NOT BUILT THROUGH THIS WRAPPER. Those helpers take their own `y` and are handed
 * `GROUND` directly, so `padAndCurtilage` takes the UNRAISED context. Passing the raised one would
 * apply the datum twice and put the kerb 140 mm in the air.
 */
function raisedContext(ctx, dy) {
  if (!dy) return ctx;
  return {
    ...ctx,
    push(geometry, material) {
      if (!material) return;
      const list = Array.isArray(geometry) ? geometry : [geometry];
      for (const g of list) {
        if (!g) continue;
        g.translate(0, dy, 0);
        g.computeBoundingBox();
        ctx.push(g, material);
      }
    },
  };
}

/**
 * A two-triangle horizontal quad for paint on the pad.
 *
 * `core.js` has `yardQuad` and does not export it, and a painted mark is the one thing this lot
 * needs a hundred of — hatching bars, a compass rose, a stop line, scorch, scrub. A `slab` costs
 * twelve triangles for a mark that is two, and at this count that is the difference between a
 * hatched apron and a triangle budget. Raw BufferGeometry, so it calls `applyMetreUv` itself: the
 * UV convention at the head of `core.js` is binding and a raw geometry that skips it samples one
 * texel of the atlas.
 *
 * Winding is verified against the centroid — the normal is +Y, so a mark is visible from above and
 * culled from below, which is correct for paint.
 */
function paintQuad(w, d, x, y, z, name = 'mark', turn = 0) {
  const hw = w / 2; const hd = d / 2;
  const c = Math.cos(turn); const s = Math.sin(turn);
  const pt = (px, pz) => [x + px * c - pz * s, y, z + px * s + pz * c];
  const a = pt(-hw, -hd); const b = pt(hw, -hd); const cc = pt(hw, hd); const dd = pt(-hw, hd);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(
    [...a, ...cc, ...b, ...a, ...dd, ...cc], 3,
  ));
  g.computeVertexNormals();
  g.name = name;
  applyMetreUv(g);
  g.computeBoundingBox();
  return g;
}

/**
 * A straight member between two arbitrary points — braces, hoist ropes, vent lines, stays.
 *
 * Same construction as `factory.js`'s: a unit-vector quaternion onto the segment. `pipeRun` is the
 * nearest thing `core.js` exports and it caps both ends with 48-triangle spheres, which is right
 * for a process pipe and wrong for a 75 mm brace on a test stand that carries twenty-four of them.
 */
function memberBetween(ax, ay, az, bx, by, bz, radius, name, segments = 5) {
  const dx = bx - ax; const dy = by - ay; const dz = bz - az;
  const length = Math.hypot(dx, dy, dz);
  if (length < 0.02) return null;
  const g = new THREE.CylinderGeometry(radius, radius, length, segments, 1, false);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize(),
  );
  g.applyQuaternion(quat);
  g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  g.computeVertexNormals();
  g.name = name;
  applyMetreUv(g);
  g.computeBoundingBox();
  return g;
}

/**
 * A cone lying along an arbitrary axis — the payload shroud's nose, and nothing else needs one.
 *
 * `core.js`'s `taper` builds along +Y and translates with no rotation parameter, so a nose cone on
 * a horizontal canister cannot be had from it. The first draft of this file called `taper` anyway
 * and would have stood a 1.6 m cone on end in the middle of the shroud.
 */
function coneAlong(rBase, rTip, ax, ay, az, bx, by, bz, name, segments = 14) {
  const dx = bx - ax; const dy = by - ay; const dz = bz - az;
  const length = Math.hypot(dx, dy, dz);
  if (length < 0.02) return null;
  const g = new THREE.CylinderGeometry(rTip, rBase, length, segments, 1, false);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize(),
  );
  g.applyQuaternion(quat);
  g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  g.computeVertexNormals();
  g.name = name;
  applyMetreUv(g);
  g.computeBoundingBox();
  return g;
}

/** Solid runs of wall left between a list of openings, along one axis. From `factory.js`. */
function solidSpans(from, to, holes) {
  const sorted = holes
    .map(([a, b]) => [Math.min(a, b), Math.max(a, b)])
    .sort((a, b) => a[0] - b[0]);
  const spans = [];
  let cursor = from;
  for (const [lo, hi] of sorted) {
    if (lo - cursor > 0.06) spans.push([cursor, Math.min(lo, to)]);
    cursor = Math.max(cursor, hi);
  }
  if (to - cursor > 0.06) spans.push([cursor, to]);
  return spans.filter(([a, b]) => b - a > 0.06);
}

/**
 * The panel joint grid on one elevation of an insulated-panel wall.
 *
 * §2a wants ornament that is geometry and continuous. A white panel wall has exactly one ornament
 * and it is the JOINT: a recessed line every 1.25 m vertically and every panel course horizontally.
 * Drawn as thin proud strips rather than as cut recesses, because a 45 mm reveal cut into a 340 mm
 * wall costs eight boxes per joint and reads identically at board altitude.
 *
 * TWO THINGS CHANGED AFTER r1 AND BOTH ARE FROM THE PLATE. The joints ride `wallAlt`, one value
 * step under the panel, not `shadow` — r1 drew them near-black and the round-1 census fines exactly
 * that. And the pitch went from 1.25 m to 3.20: at 1.25 a 11.5 m flank carried nine dark verticals
 * plus five courses, and the WINDOWLESS integration hall that the whole silhouette argument rests
 * on came back reading as a glazed curtain wall. `mp-modern-white`'s pale block carries almost no
 * surface line at all; its ornament is the massing and one dark band.
 *
 * `axis` is 'x' for a ±Z elevation and 'z' for a ±X one. `holes` are spans along the axis the
 * verticals must skip, so a joint line never crosses the door slot.
 */
function panelJoints(ctx, {
  axis = 'x', a0, a1, y0, y1, plane, facing = 1, pitch = 3.20, course = 3.60,
  holes = [], name = 'joint',
}) {
  const { p } = ctx;
  const t = 0.05;
  const out = [];
  const n = Math.max(1, Math.round((a1 - a0) / pitch));
  for (let i = 1; i < n; i += 1) {
    const a = a0 + ((a1 - a0) * i) / n;
    if (holes.some(([lo, hi]) => a > lo - 0.12 && a < hi + 0.12)) continue;
    out.push(axis === 'x'
      ? box(t, y1 - y0, t * 1.5, a, (y0 + y1) / 2, plane + facing * t * 0.7, `${name}-v`)
      : box(t * 1.5, y1 - y0, t, plane + facing * t * 0.7, (y0 + y1) / 2, a, `${name}-v`));
  }
  const m = Math.max(1, Math.round((y1 - y0) / course));
  for (let i = 1; i < m; i += 1) {
    const y = y0 + ((y1 - y0) * i) / m;
    out.push(axis === 'x'
      ? box(a1 - a0, t, t * 1.5, (a0 + a1) / 2, y, plane + facing * t * 0.7, `${name}-h`)
      : box(t * 1.5, t, a1 - a0, plane + facing * t * 0.7, y, (a0 + a1) / 2, `${name}-h`));
  }
  ctx.push(out, p.wallAlt);
}

/**
 * A shallow curved roof: an arc of flat facets across X, running the full depth in Z.
 *
 * §6D asks for "a shallow curved or mono roof", and the curve is the half that separates this
 * silhouette from every gable and every sawtooth on the board. The profile is a parabola rather
 * than a circular arc, because a parabola through three points is one line of arithmetic and at a
 * 1.7 m rise over 7.8 m the two are within 30 mm of each other.
 *
 * Standing seams ride the facets, two per facet, in the light bucket — that is the ornament, and on
 * a roof plane this size it is what stops the roof reading as a grey card.
 */
function curvedRoof(ctx, {
  x0, x1, z0, z1, yBase, rise, facets = 7, deck = 0.24, overhang = 0.26, name = 'roof',
}) {
  const { p, detail } = ctx;
  const w = x1 - x0;
  const zc = (z0 + z1) / 2;
  const d = (z1 - z0) + overhang * 2;
  const yAt = (t) => yBase + rise * (1 - (2 * t - 1) ** 2);
  const sheets = []; const seams = [];
  for (let i = 0; i < facets; i += 1) {
    const t0 = i / facets; const t1 = (i + 1) / facets;
    const xa = x0 - overhang + (w + overhang * 2) * t0;
    const xb = x0 - overhang + (w + overhang * 2) * t1;
    const ya = yAt(t0); const yb = yAt(t1);
    const len = Math.hypot(xb - xa, yb - ya);
    const ang = Math.atan2(yb - ya, xb - xa);
    sheets.push(rotBox(len, deck, d, (xa + xb) / 2, (ya + yb) / 2, zc, { z: ang }, `${name}-facet`));
    if (!detail) continue;
    for (const f of [0.28, 0.72]) {
      const sx = xa + (xb - xa) * f;
      const sy = ya + (yb - ya) * f;
      seams.push(rotBox(0.07, 0.09, d, sx, sy + deck / 2 + 0.03, zc, { z: ang }, `${name}-seam`));
    }
  }
  ctx.push(sheets, p.cladding);
  if (seams.length) ctx.push(seams, p.trim);

  // The two ends, stepped under the arc so the curve is closed by wall rather than by air.
  const ends = [];
  for (const zEnd of [z0, z1]) {
    const zPlane = zEnd === z0 ? z0 + 0.16 : z1 - 0.16;
    for (let i = 0; i < facets; i += 1) {
      const t = (i + 0.5) / facets;
      const xa = x0 + w * (i / facets);
      const xb = x0 + w * ((i + 1) / facets);
      const h = yAt(t) - yBase;
      if (h < 0.05) continue;
      ends.push(slab(xb - xa, h, 0.32, (xa + xb) / 2, yBase, zPlane, `${name}-end`));
    }
  }
  ctx.push(ends, p.trim);
}

/* ─────────────────────────────────── the high bay ─────────────────────────────────── */

/**
 * The integration hall, and it is the whole silhouette.
 *
 * §6D: "a tall, wide, windowless integration hall with a shallow curved or mono roof, standing head
 * and shoulders above everything else on the lot, with a full-height vertical door slot and an
 * external gantry crane rail on its flank."
 *
 * WINDOWLESS IS LOAD-BEARING. Every other industrial subject on the board carries a punch grid or a
 * north light; the one thing that makes a high bay read as a high bay at board altitude is that the
 * wall is blank apart from one vertical cut in it. So there is no glazing on this mass at all — the
 * ornament is the coarse panel seam, the corner pilasters, the company mark and the rail.
 */
function highBay(ctx, geom) {
  const { p, v, detail, mid } = ctx;
  const { bayX0, bayX1, bayZ0, bayZ1, doorX0, doorX1, doorH, wingZ0 } = geom;
  const bayW = bayX1 - bayX0;
  const bayD = bayZ1 - bayZ0;
  const cx = (bayX0 + bayX1) / 2;
  const cz = (bayZ0 + bayZ1) / 2;
  const doorCx = (doorX0 + doorX1) / 2;
  const doorW = doorX1 - doorX0;

  /* — 1. plinth. Precast, with a moulded cap the panel lands on. Pad → plinth → panel is three
         value steps in 1.3 m, which is the ladder §2.8 asks for at the height a viewer's eye lands
         on first, and it is the move every reference frame makes under every mass. — */
  ctx.push(slab(bayW + 0.34, 0.22, bayD + 0.34, cx, -0.04, cz, 'bay-footing'), p.wallAlt);
  ctx.push(slab(bayW + 0.22, BAY_PLINTH - 0.16, bayD + 0.22, cx, 0.10, cz, 'bay-plinth'), p.wallAlt);
  ctx.push(moulding(bayW + 0.34, 0.16, cx, BAY_PLINTH - 0.06, bayZ1 + 0.11, 'x', COPING_PROFILE,
    'bay-plinth-cap'), p.wallAlt);
  ctx.push(slab(0.30, 0.16, bayD + 0.34, bayX1 + 0.13, BAY_PLINTH - 0.06, cz,
    'bay-plinth-cap-flank'), p.wallAlt);
  ctx.push(slab(0.30, 0.16, bayD + 0.34, bayX0 - 0.13, BAY_PLINTH - 0.06, cz,
    'bay-plinth-cap-west'), p.wallAlt);

  /* — 2. the panel shell.
         THE CORE IS HELD OUT OF THE DOOR ZONE, AND r1 IS WHY. The first version built one solid
         core across the whole footprint and then set the leaves 0.54 m behind the front skin — i.e.
         INSIDE the core, which is white and opaque. What the r1 plate shows in the opening is the
         core's own face, framed by the jambs, and the red slot that the whole colour argument rests
         on never rendered at all. The core is now built as the spans either side of the slot below
         the head, so the opening is a genuine void with the leaves standing in it. — */
  const skin = 0.34;
  const doorHole = [doorX0 - 0.18, doorX1 + 0.18];
  const headTop = doorH + 0.66;
  for (const [a, b] of solidSpans(bayX0, bayX1, [doorHole])) {
    ctx.push(slab(b - a, headTop - BAY_PLINTH, bayD - skin, (a + b) / 2, BAY_PLINTH, cz - skin / 2,
      'bay-core-pier'), p.trim);
    ctx.push(slab(b - a, headTop - BAY_PLINTH, skin, (a + b) / 2, BAY_PLINTH, bayZ1 - skin / 2,
      'bay-front-pier'), p.trim);
    ctx.push(slab(b - a, BAY_PLINTH, skin, (a + b) / 2, 0, bayZ1 - skin / 2, 'bay-front-plinth'),
      p.wallAlt);
  }
  // Over the head: one continuous mass across the whole plan, which is what carries the roof.
  ctx.push(slab(bayW, BAY_H - headTop, bayD, cx, headTop, cz, 'bay-core-head'), p.trim);
  // Behind the slot: the hall's own back wall, so the opening looks into a lit interior face rather
  // than through the building.
  ctx.push(slab(doorW + 0.40, headTop - BAY_PLINTH, 0.34, doorCx, BAY_PLINTH, bayZ1 - 1.55,
    'bay-slot-back'), p.wallAlt);

  /* — 3. corner pilasters. The cheapest ornament on a blank wall, and the one that gives the mass an
         edge highlight in raking light instead of a mitre. — */
  for (const [px, pz] of [
    [bayX1 - 0.26, bayZ1 - 0.26], [bayX1 - 0.26, bayZ0 + 0.26],
    [bayX0 + 0.26, bayZ1 - 0.26], [bayX0 + 0.26, bayZ0 + 0.26],
  ]) {
    ctx.push(box(0.56, BAY_H - BAY_PLINTH, 0.56, px, BAY_PLINTH + (BAY_H - BAY_PLINTH) / 2, pz,
      'bay-pilaster'), p.trim);
  }

  /* — 4. the panel seams (§2a). Coarse, and one value step under the panel. — */
  if (mid) {
    panelJoints(ctx, {
      axis: 'x', a0: bayX0 + 0.40, a1: bayX1 - 0.40, y0: BAY_PLINTH, y1: BAY_H,
      plane: bayZ1, facing: 1, holes: [doorHole], name: 'bay-front-seam',
    });
    panelJoints(ctx, {
      axis: 'z', a0: bayZ0 + 0.40, a1: bayZ1 - 0.40, y0: BAY_PLINTH, y1: BAY_H,
      plane: bayX1, facing: 1, name: 'bay-flank-seam',
    });
  }

  /* — 5. THE DOOR SLOT, and it is the identity opening the way the two shuttered bays are the
         factory's. Five parts, front to back: two guide rails standing proud of the wall, the two
         bi-parting leaves in the company colour, a dark centre joint, precast jamb returns, and a
         head beam with a hood. The leaves stand 0.16 m behind the skin face and NOT half a metre,
         which is the r1 repair — a reveal deep enough to shadow the door out is a reveal that
         throws away the one saturated plane on the elevation. — */
  const leafZ = bayZ1 - 0.30;
  for (const s of [-1, 1]) {
    ctx.push(slab(0.34, doorH + 0.36, 0.40, doorCx + s * (doorW / 2 + 0.17), 0, bayZ1 - 0.18,
      'bay-door-jamb'), p.wallAlt);
    ctx.push(slab(0.22, doorH + 0.24, 0.30, doorCx + s * (doorW / 2 + 0.24), 0, bayZ1 + 0.10,
      'bay-door-guide'), p.cladding);
  }
  const leafW = doorW / 2 - 0.09;
  for (const s of [-1, 1]) {
    const lx = doorCx + s * (doorW / 4 + 0.03);
    ctx.push(slab(leafW, doorH - 0.10, 0.22, lx, 0.05, leafZ, 'bay-door-leaf'), p.wall);
    if (!mid) continue;
    const ribs = Math.max(4, Math.round((doorH - 0.4) / 1.75));
    const rib = [];
    for (let i = 1; i < ribs; i += 1) {
      rib.push(slab(leafW - 0.14, 0.11, 0.09, lx, 0.05 + ((doorH - 0.10) * i) / ribs, leafZ + 0.14,
        'bay-door-rib'));
    }
    ctx.push(rib, p.trim);
  }
  ctx.push(slab(0.13, doorH - 0.10, 0.16, doorCx, 0.05, leafZ + 0.08, 'bay-door-meet'), p.shadow);
  ctx.push(slab(doorW + 1.06, 0.68, 0.76, doorCx, doorH, bayZ1 - 0.22, 'bay-door-head'), p.cladding);
  ctx.push(slab(doorW + 1.40, 0.20, 1.06, doorCx, doorH + 0.68, bayZ1 - 0.06, 'bay-door-hood'), p.trim);
  ctx.push(slab(doorW + 0.70, 0.06, 1.00, doorCx, 0.0, bayZ1 + 0.50, 'bay-door-threshold'), p.wallAlt);

  /* — 6. THE COMPANY MARK. §6D allows one saturated accent, and the round-1 census says our
         saturation is 16 % against a reference band of 27–42 %, so the mark is drawn at the size a
         livery is actually drawn at rather than as a pinstripe: a banded panel under the eaves on
         both seen elevations, one full-height stripe on the flank, and a roundel over the door. — */
  const bandY = BAY_H - 2.65;
  const bandH = 1.90;
  ctx.push(slab(bayW + 0.06, bandH, 0.20, cx, bandY, bayZ1 + 0.04, 'bay-accent-front'), p.wall);
  ctx.push(slab(0.20, bandH, bayD + 0.06, bayX1 + 0.04, bandY, cz, 'bay-accent-flank'), p.wall);
  for (const dy of [-0.10, bandH]) {
    ctx.push(slab(bayW + 0.12, 0.10, 0.24, cx, bandY + dy, bayZ1 + 0.05, 'bay-accent-reveal'), p.trim);
    ctx.push(slab(0.24, 0.10, bayD + 0.12, bayX1 + 0.05, bandY + dy, cz, 'bay-accent-reveal'), p.trim);
  }
  // The livery stripe: one full-height block on the flank, between the plinth and the band, sited on
  // the length of flank the wing does not stand in front of. r1 drew three raked bars here and they
  // read as sticks leaning on a wall rather than as a mark.
  const stripeZ = Math.min(wingZ0 - 1.00, cz + 1.20);
  ctx.push(slab(0.20, bandY - BAY_PLINTH - 0.30, 3.10, bayX1 + 0.04, BAY_PLINTH + 0.15, stripeZ,
    'bay-livery-stripe'), p.wall);
  for (const s of [-1, 1]) {
    ctx.push(slab(0.24, bandY - BAY_PLINTH - 0.30, 0.14, bayX1 + 0.05, BAY_PLINTH + 0.15,
      stripeZ + s * 1.62, 'bay-livery-edge'), p.trim);
  }
  if (mid) {
    const ry = doorH + 1.90;
    ctx.push(cyl(1.16, 0.16, doorCx, ry, bayZ1 + 0.06, 'z', 'bay-roundel-ring', 16), p.trim);
    ctx.push(cyl(0.86, 0.20, doorCx, ry, bayZ1 + 0.08, 'z', 'bay-roundel', 16), p.wall);
  }

  /* — 7. the roof. Curved, seamed, and carrying nothing that could be mistaken for a stack. — */
  curvedRoof(ctx, {
    x0: bayX0, x1: bayX1, z0: bayZ0, z1: bayZ1, yBase: BAY_H, rise: BAY_ROOF_RISE,
    facets: detail ? 7 : 5, name: 'bay-roof',
  });
  ctx.push(slab(bayW + 0.62, 0.34, 0.28, cx, BAY_H - 0.20, bayZ1 + 0.26, 'bay-fascia'), p.trim);
  ctx.push(slab(0.28, 0.34, bayD + 0.62, bayX1 + 0.26, BAY_H - 0.20, cz, 'bay-fascia'), p.trim);
  ctx.push(slab(0.28, 0.34, bayD + 0.62, bayX0 - 0.26, BAY_H - 0.20, cz, 'bay-fascia'), p.trim);
  if (detail) {
    for (const s of [-1, 1]) {
      ctx.push(cyl(0.055, 2.80, cx + s * bayW * 0.30, BAY_H + BAY_ROOF_RISE + 1.20, cz + s * 1.5,
        'y', 'bay-aerial', 5), p.steel);
    }
  }

  /* — 8. THE EXTERNAL GANTRY CRANE RAIL on the +X flank (§6D), which is the flank the three-quarter
         camera is on. It runs the whole depth at 10.30 m — over the wing's parapet for the length
         the wing stands against, and against open sky for the rest — so the whole run reads.
         The girder is `cladding` and the trolley carries the company colour: the round-1 census says
         a 12 m member at the top of the silhouette is exactly the area a near-black bucket must stop
         taking. — */
  const railX = bayX1 + 0.72;
  const brackets = [];
  const nB = detail ? 6 : 4;
  for (let i = 0; i < nB; i += 1) {
    const bz = bayZ0 + 0.9 + ((bayD - 1.8) * i) / (nB - 1);
    brackets.push(slab(0.92, 0.34, 0.36, bayX1 + 0.46, RAIL_Y - 0.34, bz, 'bay-rail-bracket'));
    const diag = memberBetween(bayX1 + 0.06, RAIL_Y - 1.70, bz, bayX1 + 0.86, RAIL_Y - 0.30, bz,
      0.08, 'bay-rail-brace');
    if (diag) brackets.push(diag);
  }
  ctx.push(brackets, p.cladding);
  ctx.push(slab(0.42, 0.56, bayD - 0.4, railX, RAIL_Y, cz, 'bay-rail-girder'), p.cladding);
  ctx.push(slab(0.60, 0.10, bayD - 0.4, railX, RAIL_Y + 0.56, cz, 'bay-rail-top'), p.trim);
  ctx.push(slab(0.60, 0.10, bayD - 0.4, railX, RAIL_Y - 0.10, cz, 'bay-rail-flange'), p.trim);
  if (mid) {
    ctx.push(slab(0.58, 0.08, bayD - 0.6, railX + 0.44, RAIL_Y + 0.66, cz, 'bay-rail-walkway'),
      p.cladding);
    const rails = []; const stanchions = [];
    for (const hy of [0.56, 1.08]) {
      rails.push(slab(0.07, 0.07, bayD - 0.6, railX + 0.68, RAIL_Y + 0.70 + hy, cz,
        'bay-rail-handrail'));
    }
    for (let i = 0; i < 5; i += 1) {
      const sz = cz - (bayD - 1.2) / 2 + ((bayD - 1.2) * i) / 4;
      stanchions.push(slab(0.07, 1.14, 0.07, railX + 0.68, RAIL_Y + 0.70, sz, 'bay-rail-stanchion'));
    }
    ctx.push(rails, p.trim);
    ctx.push(stanchions, p.cladding);

    const tz = cz + v.range(3301, -2.4, 2.4);
    ctx.push(slab(1.36, 0.88, 1.12, railX, RAIL_Y + 0.66, tz, 'bay-crane-trolley'), p.wall);
    ctx.push(slab(1.50, 0.22, 1.26, railX, RAIL_Y + 1.54, tz, 'bay-crane-cap'), p.trim);
    ctx.push(cyl(0.30, 1.04, railX, RAIL_Y + 1.10, tz, 'x', 'bay-crane-drum', 10), p.cladding);
    const hookY = RAIL_Y - v.range(3302, 4.2, 5.8);
    for (const s of [-1, 1]) {
      const rope = memberBetween(railX + s * 0.26, RAIL_Y + 0.58, tz, railX + s * 0.10, hookY + 0.44,
        tz, 0.035, 'bay-crane-rope', 4);
      if (rope) ctx.push(rope, p.steel);
    }
    ctx.push(slab(0.54, 0.46, 0.36, railX, hookY, tz, 'bay-crane-block'), p.trim);
    ctx.push(taper(0.16, 0.06, 0.40, railX, hookY - 0.40, tz, 'bay-crane-hook', 6), p.steel);
  }
  emit(ctx, ladderCaged({
    x: bayX1 + 0.32, z: bayZ0 + 0.62, yBase: 0.05, yTop: RAIL_Y + 0.62, facing: 1,
    name: 'bay-rail-ladder',
  }), { steel: 'cladding' });
}

/* ─────────────────────────────── the clean-room wing ─────────────────────────────── */

/**
 * §6D: "a clean-room wing: white insulated panel, a horizontal ribbon of dark glazing, a visitor
 * entry with a canopy and flag masts."
 *
 * IT MOVED TO THE +X SIDE AFTER r1, AND THE PLATE IS THE REASON. On the −X flank the whole wing —
 * its ribbon, its entry, its canopy, its masts, half the ornament budget on this subject — sat on
 * the two elevations the three-quarter station never sees, and the r1 plate shows a grey sliver
 * behind the hall. Here its long +X elevation and its +Z end are both square to the camera, and it
 * projects six metres forward of the bay so the frontage has a real plan step.
 *
 * The panel is `wallAlt`, not `trim`. §6D calls both masses white; two masses at ONE albedo beside
 * each other is the `international-exchange` failure the orchestrator measured — a uniform building,
 * median 226, which scores no better than a crushed one. One clean value step apart, and the high
 * bay stays the brighter object, which is what the contract wants it to be.
 */
function cleanRoomWing(ctx, geom) {
  const { p, detail, mid } = ctx;
  const { wingX0, wingX1, wingZ0, wingZ1, bayZ1 } = geom;
  const w = wingX1 - wingX0;
  const d = wingZ1 - wingZ0;
  const cx = (wingX0 + wingX1) / 2;
  const cz = (wingZ0 + wingZ1) / 2;

  ctx.push(slab(w + 0.28, 0.18, d + 0.28, cx, -0.03, cz, 'wing-footing'), p.wallAlt);
  ctx.push(slab(w + 0.16, WING_PLINTH - 0.12, d + 0.16, cx, 0.06, cz, 'wing-plinth'), p.wallAlt);
  ctx.push(slab(w + 0.26, 0.10, d + 0.26, cx, WING_PLINTH - 0.06, cz, 'wing-plinth-cap'), p.wallAlt);
  // Core held back on the two glazed elevations (+X and +Z) and full on the two blind ones.
  ctx.push(slab(w - 0.34, WING_H - WING_PLINTH, d - 0.34, cx - 0.17, WING_PLINTH, cz - 0.17,
    'wing-core'), p.wallAlt);
  ctx.push(slab(0.34, WING_H - WING_PLINTH, d, wingX0 + 0.17, WING_PLINTH, cz, 'wing-west'), p.wallAlt);
  ctx.push(slab(w, WING_H - WING_PLINTH, 0.34, cx, WING_PLINTH, wingZ0 + 0.17, 'wing-rear'), p.wallAlt);

  /**
   * A ribbon of glazing built as a real opening: spandrel under, head band over, precast sill and
   * lintel standing proud, a shadow board deep in the reveal, the pane in front of it, mullions in
   * front of that. Everything lands INSIDE `plane` — the first draft placed the skin at
   * `plane + facing·d/2` and would have built the whole ribbon outboard of the wall it is in.
   */
  const ribbon = (axis, plane, facing, a0, a1, spandrelHoles, name) => {
    const len = a1 - a0;
    const mid0 = (a0 + a1) / 2;
    const put = (ww, hh, dd, aa, yy, off, tag, mat) => ctx.push(
      axis === 'x' ? slab(ww, hh, dd, aa, yy, plane - facing * off, tag)
        : slab(dd, hh, ww, plane - facing * off, yy, aa, tag),
      mat,
    );
    for (const [ha, hb] of solidSpans(a0, a1, spandrelHoles)) {
      put(hb - ha, RIB_SILL - WING_PLINTH, 0.34, (ha + hb) / 2, WING_PLINTH, 0.17,
        `${name}-spandrel`, p.wallAlt);
    }
    put(len, WING_H - RIB_HEAD, 0.34, mid0, RIB_HEAD, 0.17, `${name}-head`, p.wallAlt);
    put(len + 0.12, 0.17, 0.46, mid0, RIB_SILL - 0.17, 0.10, `${name}-sill`, p.trim);
    put(len + 0.12, 0.15, 0.46, mid0, RIB_HEAD, 0.10, `${name}-lintel`, p.trim);
    put(len, RIB_HEAD - RIB_SILL, 0.10, mid0, RIB_SILL, 0.31, `${name}-board`, p.shadow);
    put(len - 0.12, RIB_HEAD - RIB_SILL - 0.08, 0.06, mid0, RIB_SILL + 0.04, 0.21,
      `${name}-pane`, p.glass);
    if (!mid) return;
    const bars = Math.max(2, Math.round(len / 1.55));
    for (let i = 1; i < bars; i += 1) {
      const a = a0 + (len * i) / bars;
      ctx.push(axis === 'x'
        ? slab(0.10, RIB_HEAD - RIB_SILL, 0.18, a, RIB_SILL, plane - facing * 0.14, `${name}-mullion`)
        : slab(0.18, RIB_HEAD - RIB_SILL, 0.10, plane - facing * 0.14, RIB_SILL, a, `${name}-mullion`),
      p.trim);
    }
  };

  const ex = cx + 0.10;
  ribbon('z', wingX1, 1, wingZ0 + 0.34, wingZ1 - 0.34, [], 'wing-ribbon-flank');
  ribbon('x', wingZ1, 1, wingX0 + 0.34, wingX1 - 0.34, [[ex - 1.90, ex + 1.90]], 'wing-ribbon-front');

  if (mid) {
    panelJoints(ctx, {
      axis: 'z', a0: wingZ0 + 0.4, a1: wingZ1 - 0.4, y0: WING_PLINTH, y1: RIB_SILL - 0.26,
      plane: wingX1, facing: 1, pitch: 2.60, course: 1.60, name: 'wing-flank-seam',
    });
  }

  /* — parapet, coping, and the accent fascia that ties the wing to the bay. — */
  for (const [ww, hh, dd, ax, az] of [
    [w + 0.16, WING_PARAPET - WING_H, 0.30, cx, wingZ1 + 0.01],
    [0.30, WING_PARAPET - WING_H, d + 0.16, wingX1 + 0.01, cz],
    [w + 0.16, WING_PARAPET - WING_H, 0.30, cx, wingZ0 - 0.01],
    [0.30, WING_PARAPET - WING_H, d + 0.16, wingX0 - 0.01, cz],
  ]) ctx.push(slab(ww, hh, dd, ax, WING_H, az, 'wing-parapet'), p.wallAlt);
  ctx.push(slab(w + 0.26, 0.38, 0.16, cx, WING_PARAPET - 0.46, wingZ1 + 0.13, 'wing-accent'), p.wall);
  ctx.push(slab(0.16, 0.38, d + 0.26, wingX1 + 0.13, WING_PARAPET - 0.46, cz, 'wing-accent'), p.wall);
  ctx.push(slab(w + 0.50, 0.14, d + 0.50, cx, WING_PARAPET, cz, 'wing-coping'), p.trim);
  ctx.push(slab(w - 0.20, 0.12, d - 0.20, cx, WING_H - 0.02, cz, 'wing-deck'), p.cladding);

  /* — ROOFTOP PLANT (§6D: "chiller banks on rails, a duct run, a cable tray, no chimney"). — */
  const railZ = [cz - d * 0.26, cz + d * 0.14];
  const plantRails = [];
  for (const rz of railZ) {
    plantRails.push(slab(w - 1.1, 0.18, 0.30, cx, WING_H + 0.10, rz - 0.64, 'wing-plant-rail'));
    plantRails.push(slab(w - 1.1, 0.18, 0.30, cx, WING_H + 0.10, rz + 0.64, 'wing-plant-rail'));
  }
  ctx.push(plantRails, p.wallAlt);
  const chillers = []; const fans = [];
  for (let i = 0; i < (detail ? 4 : 2); i += 1) {
    const rz = railZ[i % 2];
    const ox = cx + (i < 2 ? -0.92 : 0.92);
    chillers.push(slab(1.54, 0.94, 1.70, ox, WING_H + 0.28, rz, 'wing-chiller'));
    if (!detail) continue;
    for (const fz of [-0.44, 0.44]) {
      fans.push(cyl(0.34, 0.10, ox, WING_H + 1.26, rz + fz, 'y', 'wing-chiller-fan', 10));
    }
  }
  ctx.push(chillers, p.trim);
  ctx.push(fans, p.cladding);
  ctx.push(slab(0.72, 0.68, d - 2.8, cx - w * 0.26, WING_H + 0.38, cz + 0.4, 'wing-duct'), p.cladding);
  ctx.push(slab(0.88, 0.18, 0.88, cx - w * 0.26, WING_H + 1.06, cz - d * 0.34, 'wing-duct-cap'),
    p.cladding);
  if (mid) {
    emit(ctx, louvreScreen({
      x: cx + w * 0.18, y: WING_H + 0.30, z: cz + d * 0.40, width: 2.20, height: 1.30, facing: 1,
      name: 'wing-plant-screen',
    }), { steel: 'cladding' });
  }

  /* — THE VISITOR ENTRY, on the +Z end, addressed to the pedestrian court. — */
  const ez = wingZ1;
  ctx.push(slab(3.46, 3.20, 0.30, ex, 0.02, ez - 0.15, 'wing-entry-reveal'), p.wall);
  ctx.push(slab(2.96, 2.82, 0.14, ex, 0.06, ez - 0.06, 'wing-entry-board'), p.shadow);
  ctx.push(slab(2.70, 2.54, 0.08, ex, 0.10, ez + 0.03, 'wing-entry-glass'), p.glass);
  for (const s of [-1, 1]) {
    ctx.push(slab(0.12, 2.54, 0.16, ex + s * 0.72, 0.10, ez + 0.07, 'wing-entry-stile'), p.trim);
  }
  ctx.push(slab(3.80, 0.22, 1.90, ex, 3.34, ez + 0.85, 'wing-entry-canopy'), p.trim);
  ctx.push(slab(3.88, 0.10, 1.98, ex, 3.56, ez + 0.85, 'wing-entry-canopy-cap'), p.wallAlt);
  for (const s of [-1, 1]) {
    ctx.push(cyl(0.10, 3.34, ex + s * 1.62, 1.67, ez + 1.55, 'y', 'wing-entry-column', 8), p.cladding);
  }
  void bayZ1;
}

/* ───────────────────────────── the rear pad and the test stand ───────────────────────────── */

/**
 * §6D: "a test stand on the rear pad: a steel frame, a flame trench with a deflector, a horizontal
 * propellant tank on saddles, a cryo tank pair with frost bands and vent lines."
 *
 * This is the identity half of the contract. The high bay says "big hall for something tall"; the
 * flame trench and the cryo pair say what the something is. Nothing else on the board is a sunken
 * lined trench with a deflector in it, and it is the reason a stranger can name this lot.
 *
 * ALL FOUR ITEMS STAND IN THE +X CORRIDOR, WHICH IS AN OCCLUSION DECISION. r1 put them on the rear
 * pad behind a hall that spans the lot, and from a camera at azimuth 0.20π every one of them is
 * behind that hall. The corridor between the wing's flank and the boundary runs the full depth on
 * the camera's own side, so a sight line from the stand leaves the lot sideways past the wing rather
 * than through the bay. The rear pad is still where they are — it is which side of it that moved.
 *
 * THE FRAME IS `cladding`. A test stand is painted steel, and the census says a lattice of near-black
 * members ten metres up is precisely the geometry that takes crush from 2 % to 12 %.
 */
function rearPad(ctx, geom) {
  const { p, v, detail, mid } = ctx;
  const { trenchX0, trenchX1, trenchZ0, trenchZ1, bayX0, bayZ0 } = geom;
  const tW = trenchX1 - trenchX0;
  const tD = trenchZ1 - trenchZ0;
  const tcx = (trenchX0 + trenchX1) / 2;
  const tcz = (trenchZ0 + trenchZ1) / 2;

  /* — 1. THE FLAME TRENCH. Four lined walls proud of the pad, a floor between them, and a deflector
         ramp closing the +X end so the exhaust is thrown toward −X. The floor is precast rather than
         a black void: a trench that reads as a hole is a hole in the census too. — */
  ctx.push(slab(tW + 1.30, 0.30, tD + 1.30, tcx, TRENCH_FLOOR - 0.30, tcz, 'trench-raft'), p.wallAlt);
  ctx.push(paintQuad(tW, tD, tcx, TRENCH_FLOOR + 0.02, tcz, 'trench-floor'), p.wallAlt);
  for (const s of [-1, 1]) {
    ctx.push(slab(0.46, TRENCH_LIP - TRENCH_FLOOR, tD + 0.92, tcx + s * (tW / 2 + 0.23),
      TRENCH_FLOOR, tcz, 'trench-wall'), p.wallAlt);
    ctx.push(slab(tW + 0.92, TRENCH_LIP - TRENCH_FLOOR, 0.46, tcx,
      TRENCH_FLOOR, tcz + s * (tD / 2 + 0.23), 'trench-wall'), p.wallAlt);
    ctx.push(slab(0.58, 0.10, tD + 1.12, tcx + s * (tW / 2 + 0.23), TRENCH_LIP, tcz,
      'trench-coping'), p.trim);
    ctx.push(slab(tW + 1.12, 0.10, 0.58, tcx, TRENCH_LIP, tcz + s * (tD / 2 + 0.23),
      'trench-coping'), p.trim);
  }
  // `prism`'s ridge only runs along X, so the deflector is a raked slab with a backing block.
  ctx.push(rotBox(2.30, 0.34, tD - 0.20, trenchX1 - 0.86, TRENCH_FLOOR + 0.86, tcz, { z: -0.62 },
    'trench-deflector'), p.wallAlt);
  ctx.push(slab(1.00, 1.50, tD - 0.20, trenchX1 - 0.40, TRENCH_FLOOR, tcz, 'trench-deflector-back'),
    p.wallAlt);
  ctx.push(paintQuad(1.25, tD - 0.30, trenchX0 + 0.75, TRENCH_FLOOR + 0.05, tcz, 'trench-burn'),
    p.shadow);

  /* — 2. THE TEST STAND. Four columns on the trench corners, three ring-beam levels with X braces, a
         work platform at 5.2 m, a top deck with a handrail, a hold-down ring, a stair and a ladder. — */
  const standH = 9.60;
  const corners = []; const bases = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const lx = tcx + sx * (tW / 2 + 0.62);
      const lz = tcz + sz * (tD / 2 + 0.62);
      corners.push([lx, lz]);
      bases.push(slab(0.50, 0.38, 0.50, lx, 0.0, lz, 'stand-base'));
    }
  }
  ctx.push(bases, p.wallAlt);
  const frame = [];
  for (const [lx, lz] of corners) frame.push(slab(0.36, standH, 0.36, lx, 0.38, lz, 'stand-column'));
  for (const by of [3.20, 6.50, standH + 0.22]) {
    frame.push(slab(tW + 1.60, 0.28, 0.26, tcx, by, tcz - (tD / 2 + 0.62), 'stand-beam'));
    frame.push(slab(tW + 1.60, 0.28, 0.26, tcx, by, tcz + (tD / 2 + 0.62), 'stand-beam'));
    frame.push(slab(0.26, 0.28, tD + 1.24, tcx - (tW / 2 + 0.62), by, tcz, 'stand-beam'));
    frame.push(slab(0.26, 0.28, tD + 1.24, tcx + (tW / 2 + 0.62), by, tcz, 'stand-beam'));
  }
  if (mid) {
    const ax = tcx - (tW / 2 + 0.62); const bx = tcx + (tW / 2 + 0.62);
    const az = tcz - (tD / 2 + 0.62); const bz = tcz + (tD / 2 + 0.62);
    for (const [y0, y1] of [[0.38, 3.20], [3.48, 6.50], [6.78, standH]]) {
      for (const zz of [az, bz]) {
        for (const [q0, q1] of [[[ax, y0], [bx, y1]], [[bx, y0], [ax, y1]]]) {
          const m = memberBetween(q0[0], q0[1], zz, q1[0], q1[1], zz, 0.08, 'stand-brace');
          if (m) frame.push(m);
        }
      }
      for (const xx of [ax, bx]) {
        for (const [q0, q1] of [[[az, y0], [bz, y1]], [[bz, y0], [az, y1]]]) {
          const m = memberBetween(xx, q0[1], q0[0], xx, q1[1], q1[0], 0.08, 'stand-brace');
          if (m) frame.push(m);
        }
      }
    }
  }
  ctx.push(frame, p.cladding);
  ctx.push(slab(tW + 1.96, 0.16, 1.20, tcx, 5.20, tcz + tD / 2 + 0.62, 'stand-platform'), p.cladding);
  ctx.push(slab(tW + 1.96, 0.18, tD + 1.66, tcx, standH + 0.50, tcz, 'stand-deck'), p.cladding);
  ctx.push(slab(tW + 1.42, 0.10, tD + 1.12, tcx, standH + 0.68, tcz, 'stand-deck-grate'), p.steel);
  if (mid) {
    const rails = []; const posts = [];
    for (const hy of [0.54, 1.08]) {
      rails.push(slab(tW + 1.96, 0.07, 0.07, tcx, standH + 0.68 + hy, tcz - (tD / 2 + 0.76), 'stand-rail'));
      rails.push(slab(tW + 1.96, 0.07, 0.07, tcx, standH + 0.68 + hy, tcz + (tD / 2 + 0.76), 'stand-rail'));
      rails.push(slab(0.07, 0.07, tD + 1.66, tcx - (tW / 2 + 0.94), standH + 0.68 + hy, tcz, 'stand-rail'));
      rails.push(slab(0.07, 0.07, tD + 1.66, tcx + (tW / 2 + 0.94), standH + 0.68 + hy, tcz, 'stand-rail'));
      rails.push(slab(tW + 1.96, 0.07, 0.07, tcx, 5.36 + hy, tcz + tD / 2 + 1.16, 'stand-rail'));
    }
    for (let i = 0; i < 5; i += 1) {
      const sx = tcx - (tW / 2 + 0.94) + ((tW + 1.88) * i) / 4;
      posts.push(slab(0.07, 1.16, 0.07, sx, standH + 0.68, tcz - (tD / 2 + 0.76), 'stand-post'));
      posts.push(slab(0.07, 1.16, 0.07, sx, standH + 0.68, tcz + (tD / 2 + 0.76), 'stand-post'));
      posts.push(slab(0.07, 1.22, 0.07, sx, 5.36, tcz + tD / 2 + 1.16, 'stand-post'));
    }
    ctx.push(rails, p.trim);
    ctx.push(posts, p.cladding);
  }
  ctx.push(cyl(1.24, 0.24, tcx, standH + 0.82, tcz, 'y', 'stand-holddown', 14), p.wall);
  ctx.push(cyl(0.96, 0.28, tcx, standH + 0.86, tcz, 'y', 'stand-holddown-throat', 14), p.shadow);
  emit(ctx, externalStair({
    x: tcx - tW / 2 - 1.58, z: tcz - tD / 2 - 0.10, yBase: 0.05, yTop: 5.20, width: 1.00,
    facing: -1, name: 'stand-stair',
  }), { steel: 'cladding' });
  emit(ctx, ladderCaged({
    x: tcx + tW / 2 + 0.66, z: tcz + tD / 2 + 0.30, yBase: 0.05, yTop: standH + 0.72, facing: 1,
    name: 'stand-ladder',
  }), { steel: 'cladding' });

  /* — 3. THE HORIZONTAL PROPELLANT TANK ON SADDLES, lying across the corridor so its length is
         square to the camera rather than pointing at it. — */
  const ptx = geom.propX;
  const ptz = geom.propZ;
  const ptLen = 4.20;
  const ptR = 1.00;
  ctx.push(cyl(ptR, ptLen, ptx, 2.20, ptz, 'x', 'prop-tank', 14), p.cladding);
  for (const s of [-1, 1]) {
    ctx.push(ball(ptR, ptx + s * ptLen / 2, 2.20, ptz, 'prop-tank-dome', 12), p.cladding);
    const sx = ptx + s * (ptLen / 2 - 0.72);
    ctx.push(slab(0.72, 1.00, 2.24, sx, 0, ptz, 'prop-saddle'), p.wallAlt);
    ctx.push(slab(0.80, 0.14, 2.38, sx, 1.00, ptz, 'prop-saddle-cap'), p.wallAlt);
    ctx.push(cyl(ptR + 0.07, 0.24, sx, 2.20, ptz, 'x', 'prop-strap', 14), p.trim);
  }
  ctx.push(slab(0.16, 0.30, 2.10, ptx + ptLen * 0.16, 2.18, ptz, 'prop-band'), p.wall);
  if (mid) {
    emit(ctx, pipeRun({
      points: [
        { x: ptx + ptLen / 2 + 0.30, y: 2.20, z: ptz + ptR + 0.08 },
        { x: ptx + ptLen / 2 + 0.30, y: 2.20, z: ptz + ptR + 0.90 },
        { x: ptx + ptLen / 2 + 0.30, y: 0.44, z: ptz + ptR + 0.90 },
        { x: ptx - 0.60, y: 0.44, z: ptz + ptR + 0.90 },
      ],
      radius: 0.11, name: 'prop-fill',
    }), { steel: 'cladding' });
    ctx.push(slab(0.84, 0.48, 0.84, ptx - 0.60, 0, ptz + ptR + 0.90, 'prop-fill-plinth'), p.wallAlt);
    emit(ctx, pipeRun({
      points: [
        { x: ptx - 1.10, y: 3.24, z: ptz },
        { x: ptx - 1.10, y: 4.70, z: ptz },
        { x: ptx - 1.10, y: 4.70, z: tcz + tD / 2 + 0.62 },
      ],
      radius: 0.10, name: 'prop-vent',
    }), { steel: 'cladding' });
  }

  /* — 4. THE CRYO TANK PAIR, with frost bands and vent lines. Shell in the grey sheet bucket and the
         bands in light paint: a frost band the same value as the tank is not a frost band, and the
         whole point of the detail is the value break at the liquid level. — */
  for (let i = 0; i < 2; i += 1) {
    const cxx = geom.cryoX + i * 2.30;
    const czz = geom.cryoZ;
    const r = 0.82;
    const h = 4.70;
    ctx.push(cyl(r + 0.24, 0.44, cxx, 0.22, czz, 'y', 'cryo-base', 14), p.wallAlt);
    ctx.push(cyl(r, h, cxx, 0.44 + h / 2, czz, 'y', 'cryo-shell', 14), p.cladding);
    ctx.push(ball(r, cxx, 0.44 + h, czz, 'cryo-dome', 12), p.cladding);
    for (let b = 0; b < 3; b += 1) {
      ctx.push(cyl(r + 0.04, 0.36, cxx, 1.05 + b * 0.62, czz, 'y', 'cryo-frost', 14), p.trim);
    }
    if (!mid) continue;
    emit(ctx, pipeRun({
      points: [
        { x: cxx, y: 0.44 + h + r * 0.75, z: czz },
        { x: cxx, y: 6.20, z: czz },
        { x: cxx, y: 6.20, z: czz - 1.45 },
        { x: cxx, y: 0.62, z: czz - 1.45 },
      ],
      radius: 0.085, name: 'cryo-vent',
    }), { steel: 'cladding' });
    ctx.push(slab(0.78, 0.54, 0.78, cxx, 0, czz - 1.45, 'cryo-valve-plinth'), p.wallAlt);
    if (detail) {
      emit(ctx, ladderCaged({
        x: cxx + r + 0.16, z: czz, yBase: 0.44, yTop: 0.44 + h, facing: 1, name: 'cryo-ladder',
      }), { steel: 'cladding' });
    }
  }

  /* — 5. the control cubicle, on the far side of the hall from the trench, which is where a
         blockhouse goes. — */
  const cbx = bayX0 + 1.55;
  const cbz = bayZ0 - 1.90;
  ctx.push(slab(2.60, 0.20, 2.10, cbx, -0.02, cbz, 'cubicle-plinth'), p.wallAlt);
  ctx.push(slab(2.30, 2.45, 1.80, cbx, 0.18, cbz, 'cubicle'), p.trim);
  ctx.push(slab(2.62, 0.16, 2.12, cbx, 2.63, cbz, 'cubicle-cap'), p.wallAlt);
  ctx.push(slab(1.50, 0.70, 0.10, cbx, 1.44, cbz - 0.92, 'cubicle-window'), p.glass);
  ctx.push(slab(2.30, 0.22, 0.14, cbx, 2.30, cbz - 0.93, 'cubicle-band'), p.wall);

  /* — 6. SCORCH. The only wear on the rear pad, directed off the −X end of the trench, which is the
         end the deflector throws toward. §6D allows this mark and the tyre scrub, and nothing else
         on this lot carries dirt. — */
  const scorch = [];
  for (let i = 0; i < 5; i += 1) {
    const t = i / 4;
    scorch.push(paintQuad(1.15 - t * 0.32, tD * (0.90 - t * 0.36), trenchX0 - 0.60 - t * 1.20,
      0.028 + i * 0.0006, tcz, 'trench-scorch', v.range(3310 + i, -0.09, 0.09)));
  }
  ctx.push(scorch, p.shadow);
}

/* ─────────────────────────────── the transporter and the tug ─────────────────────────────── */

/**
 * §6D: "a transporter trailer with a shrouded payload canister".
 *
 * Lane-brief item 5 is that the lot is INHABITED, and a vehicle does more for that than any amount
 * of paint. This one also explains the door slot: a canister 2.5 m across standing 1.4 m up needs an
 * opening 3.5 m wide and ten tall, and the opening it needs is the one in the wall behind it.
 *
 * SHORTENED AFTER r1. At a 9.2 m deck plus a prime mover the assembly measured 12.3 m against 11.6 m
 * of pad between the hall's face and the boundary, and the r1 plate shows the tug standing off the
 * end of the board plate in open field.
 */
function transporter(ctx, { x, z, y = 0, name = 'transporter' }) {
  const { p, detail, mid } = ctx;
  const len = 7.60;
  const deckY = y + 1.14;
  ctx.push(slab(2.42, 0.36, len, x, deckY - 0.36, z, `${name}-chassis`), p.cladding);
  ctx.push(slab(2.60, 0.14, len - 0.30, x, deckY, z, `${name}-deck`), p.trim);
  const wheels = []; const hubs = []; const bogies = [];
  for (let i = 0; i < 4; i += 1) {
    const wz = z - len / 2 + 1.10 + i * 1.80;
    for (const s of [-1, 1]) {
      wheels.push(cyl(0.45, 0.34, x + s * 1.16, y + 0.45, wz, 'x', `${name}-wheel`, 10));
      if (detail) hubs.push(cyl(0.18, 0.36, x + s * 1.16, y + 0.45, wz, 'x', `${name}-hub`, 8));
    }
    if (mid) bogies.push(slab(2.12, 0.30, 0.46, x, y + 0.72, wz, `${name}-bogie`));
  }
  ctx.push(wheels, p.steel);
  if (hubs.length) ctx.push(hubs, p.trim);
  if (bogies.length) ctx.push(bogies, p.cladding);

  const cR = 1.24;
  const cy = deckY + 0.22 + cR;
  const body = len - 2.30;
  ctx.push(cyl(cR, body, x, cy, z - 0.30, 'z', `${name}-canister`, 16), p.trim);
  const nose = coneAlong(cR, 0.28, x, cy, z - 0.30 + body / 2, x, cy, z - 0.30 + body / 2 + 1.55,
    `${name}-nose`, 16);
  if (nose) ctx.push(nose, p.trim);
  ctx.push(ball(cR * 0.97, x, cy, z - 0.30 - body / 2, `${name}-tail`, 12), p.trim);
  const straps = []; const cradles = [];
  for (let i = 0; i < 3; i += 1) {
    const sz = z - 2.00 + i * 1.90;
    straps.push(cyl(cR + 0.05, 0.24, x, cy, sz, 'z', `${name}-strap`, 16));
    if (mid) cradles.push(slab(2.30, 0.62, 0.32, x, deckY + 0.14, sz, `${name}-cradle`));
  }
  ctx.push(straps, p.cladding);
  if (cradles.length) ctx.push(cradles, p.cladding);
  if (mid) {
    ctx.push(cyl(cR + 0.04, 0.72, x, cy, z + 1.85, 'z', `${name}-flash`, 16), p.wall);
    ctx.push(slab(0.46, 0.10, body - 1.00, x, cy + cR + 0.02, z - 0.36, `${name}-walkway`), p.cladding);
  }

  const tz = z + len / 2 + 1.52;
  ctx.push(slab(2.30, 0.90, 2.80, x, y + 0.44, tz, `${name}-tug-body`), p.wall);
  ctx.push(slab(1.90, 1.04, 1.32, x, y + 1.34, tz + 0.22, `${name}-tug-cab`), p.trim);
  ctx.push(slab(1.72, 0.72, 0.10, x, y + 1.54, tz + 0.86, `${name}-tug-glass`), p.glass);
  const tw = [];
  for (const sz2 of [-0.88, 0.94]) {
    for (const s of [-1, 1]) {
      tw.push(cyl(0.42, 0.36, x + s * 1.06, y + 0.42, tz + sz2, 'x', `${name}-tug-wheel`, 10));
    }
  }
  ctx.push(tw, p.steel);
}

/* ───────────────────────────────── the pad and the curtilage ───────────────────────────────── */

/**
 * The composed ground. Lane-brief item 4: "every building stands on a designed plinth — balustrade,
 * retaining wall, lawn band, paved apron, planting, lamps. Never a bare slab under a box."
 *
 * THE FRONT PAD IS TWO COURTS, and that is what the plan step in front of the wing is for. West of
 * the hall's centre line is the VEHICLE court: the crossover, the boom, the hatched apron aligned to
 * the door slot, the transporter standing on it. East, in front of the clean-room wing, is the
 * PEDESTRIAN court: the compass rose, the flag masts, the entry lights, the planting. Two legible
 * uses on one lot is the "small scene" the lane brief grades, and it is what the reference frames do.
 *
 * **TAKES THE UNRAISED CONTEXT.** The yard kit carries its own `y` and is handed `GROUND` directly.
 */
function padAndCurtilage(ctx, geom) {
  const { p, v, detail, mid } = ctx;
  const {
    edgeX, edgeZ, fenceX, fenceZ, bayX0, bayZ1, doorX0, doorX1,
    wingX0, wingX1, wingZ1, gateX0, gateX1,
  } = geom;
  const Y = GROUND;

  /* — 1. plate, pad, verge, kerb. The plate goes down first, under everything. — */
  emit(ctx, boardPlate(ctx, { width: edgeX * 2, depth: edgeZ * 2, salt: 3330 }));
  emit(ctx, hardstandSlab(ctx, {
    x: 0, z: 0, width: edgeX * 2, depth: edgeZ * 2, y: Y, mode: 'concrete',
    jointPitch: 4.30, patches: 1, cracks: 2, tidePools: 0, salt: 3331,
  }));

  /* — 2. THE LAWN RING, and it is now the whole verge rather than a strip in it.
         Two findings meet here. Lane-brief item 4 wants a designed plinth, and §6D makes this the
         one industrial subject whose frontage is landscaped on purpose rather than left to weeds.
         And the round-1 census puts our saturation at 16.2 % against a reference band of 27–42 %:
         `foliage` is authored #7f963c–#96a94e, the most saturated and among the warmest albedos in
         the palette, and eighty square metres of it round the lot moves that statistic further than
         any paint on the pad can. A paved footpath is kept on the street verge only, where a
         footpath actually belongs. — */
  const footpathW = 0.46;
  ctx.push(slab(edgeX * 2 - 0.03, 0.05, footpathW, 0, Y + 0.015, edgeZ - footpathW / 2,
    'verge-footpath'), p.wallAlt);
  for (const [lx0, lx1] of solidSpans(-edgeX + 0.10, edgeX - 0.10,
    [[gateX0 - 0.55, gateX1 + 0.55]])) {
    if (lx1 - lx0 < 1.2) continue;
    lawnPanel(ctx, {
      x: (lx0 + lx1) / 2, z: edgeZ - footpathW - (VERGE_STREET - footpathW) / 2,
      width: lx1 - lx0, depth: VERGE_STREET - footpathW - 0.06, y: Y, density: 0.72,
      salt: 3333, name: 'verge-lawn-street',
    });
  }
  lawnPanel(ctx, {
    x: 0, z: -edgeZ + VERGE_STREET / 2, width: edgeX * 2 - 1.4, depth: VERGE_STREET - 0.10, y: Y,
    density: 0.66, salt: 3336, name: 'verge-lawn-rear',
  });
  for (const s of [-1, 1]) {
    lawnPanel(ctx, {
      x: s * (edgeX - VERGE_FLANK / 2), z: -0.15, width: VERGE_FLANK - 0.10,
      depth: edgeZ * 2 - (VERGE_STREET * 2 + 1.6), y: Y, density: 0.62,
      salt: 3337 + (s > 0 ? 1 : 0), name: 'verge-lawn-flank',
    });
  }
  emit(ctx, kerb(ctx, {
    x1: -edgeX, z1: edgeZ - 0.06, x2: edgeX, z2: edgeZ - 0.06, y: Y, salt: 3332,
  }));

  /* — 3. THE PAINTED PAD. Keep-clear hatching aligned to the door slot, a stop line and arrows on
         the crossover, and a lane edge each side of it.
         THE HATCH BARS ALTERNATE THE COMPANY COLOUR AND WHITE. White paint on pale concrete is a
         four-level step and at board altitude it is not a mark at all; a red-and-white hatched
         keep-clear is what a pad actually carries, it is legible at thumbnail, and it is twelve
         square metres on the saturation statistic the census says we are short on. — */
  const py = Y + 0.024;
  const white = []; const red = [];
  const hx0 = doorX0 - 0.42; const hx1 = doorX1 + 0.42;
  const hz0 = bayZ1 + 1.00; const hz1 = bayZ1 + 6.70;
  const hw = hx1 - hx0; const hd = hz1 - hz0;
  white.push(paintQuad(hw, 0.18, (hx0 + hx1) / 2, py, hz0, 'pad-hatch-edge'));
  white.push(paintQuad(hw, 0.18, (hx0 + hx1) / 2, py, hz1, 'pad-hatch-edge'));
  white.push(paintQuad(0.18, hd, hx0, py, (hz0 + hz1) / 2, 'pad-hatch-edge'));
  white.push(paintQuad(0.18, hd, hx1, py, (hz0 + hz1) / 2, 'pad-hatch-edge'));
  const bars = detail ? 9 : 5;
  for (let i = 0; i < bars; i += 1) {
    const t = (i + 0.5) / bars;
    const q = paintQuad(0.30, Math.hypot(hw, hd) * 0.88, hx0 + hw * t, py + 0.0006,
      (hz0 + hz1) / 2, 'pad-hatch-bar', -Math.atan2(hw, hd));
    (i % 2 ? white : red).push(q);
  }
  white.push(paintQuad(gateX1 - gateX0 - 0.40, 0.28, (gateX0 + gateX1) / 2, py, fenceZ - 1.50,
    'pad-stop-line'));
  for (const ax of [(gateX0 + gateX1) / 2 - 1.15, (gateX0 + gateX1) / 2 + 1.15]) {
    white.push(paintQuad(0.24, 1.80, ax, py, fenceZ - 3.40, 'pad-arrow-shaft'));
    white.push(paintQuad(0.68, 0.68, ax, py + 0.0006, fenceZ - 2.32, 'pad-arrow-head', Math.PI / 4));
  }
  for (const lx of [gateX0 - 0.20, gateX1 + 0.20]) {
    white.push(paintQuad(0.15, fenceZ - bayZ1 - 2.2, lx, py, (fenceZ + bayZ1) / 2 + 0.6, 'pad-lane-line'));
  }
  ctx.push(white, p.trim);
  ctx.push(red, p.wall);

  /* — THE COMPASS ROSE (§6D), on the pedestrian court in front of the wing, which is the one part of
       the pad with a clear circle of ground on it. — */
  const rx = geom.roseX; const rz = geom.roseZ; const rr = geom.roseR;
  const rose = [];
  const seg = detail ? 24 : 14;
  for (let i = 0; i < seg; i += 1) {
    const a = (i / seg) * Math.PI * 2;
    const arc = (Math.PI * 2 * rr) / seg + 0.06;
    rose.push(paintQuad(arc, 0.15, rx + Math.cos(a) * rr, py, rz + Math.sin(a) * rr,
      'pad-rose-ring', -a + Math.PI / 2));
  }
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const len = i % 2 === 0 ? rr * 0.94 : rr * 0.52;
    rose.push(paintQuad(0.17, len, rx + Math.cos(a) * len / 2, py + 0.0006,
      rz + Math.sin(a) * len / 2, 'pad-rose-ray', -a + Math.PI / 2));
  }
  ctx.push(rose, p.trim);
  ctx.push(cyl(0.40, 0.03, rx, py + 0.003, rz, 'y', 'pad-rose-hub', 12), p.wall);

  /* — 4. TYRE SCRUB. §6D's other permitted mark, where the transporter turns off the crossover. In
         `cladding` and not in a dark bucket: scrub on pale concrete is a grey smear, and the census
         says a black one on the brightest plane on the board is the last thing this subject can
         afford. — */
  const scrub = [];
  for (let i = 0; i < 4; i += 1) {
    scrub.push(paintQuad(v.range(3348 + i, 2.2, 3.7), 0.42,
      (gateX0 + gateX1) / 2 + v.range(3344 + i, -1.9, 1.9),
      py - 0.0008, fenceZ - 5.4 - i * 1.40, 'pad-scrub', v.range(3340 + i, 0.28, 1.02)));
  }
  ctx.push(scrub, p.cladding);

  /* — 5. THE BOUNDARY. Welded mesh panel, which is what a modern secure campus has, and a different
         fence from the factory's palisade and the bond store's chain link. — */
  for (const [x1, z1, x2, z2] of [
    [-fenceX, -fenceZ, -fenceX, fenceZ],
    [fenceX, -fenceZ, fenceX, fenceZ],
    [-fenceX, -fenceZ, fenceX, -fenceZ],
  ]) {
    emit(ctx, meshPanelFence(ctx, {
      x1, z1, x2, z2, y: Y, height: 2.35, salt: 3350, name: 'boundary',
    }), { steel: 'cladding' });
  }
  for (const [a, b] of solidSpans(-fenceX, fenceX, [[gateX0, gateX1]])) {
    emit(ctx, meshPanelFence(ctx, {
      x1: a, z1: fenceZ, x2: b, z2: fenceZ, y: Y, height: 2.35, salt: 3351, name: 'boundary-street',
    }), { steel: 'cladding' });
  }
  emit(ctx, industrialGate(ctx, {
    x: (gateX0 + gateX1) / 2, z: fenceZ, y: Y, width: gateX1 - gateX0, height: 2.35, axis: 'x',
    openFraction: 0.66, salt: 3352, name: 'site-gate',
  }), { steel: 'cladding' });

  /* — 6. THE SECURITY GATE FURNITURE (§6D: "a security gate with a boom and a guard hut"). The boom
         pivots on the EAST side of the crossover and reaches west, because the hut and the pedestrian
         court are both east and a counterweight swinging the other way lands outside the fence. — */
  const hutX = gateX1 + 1.42;
  const hutZ = fenceZ - 1.95;
  ctx.push(slab(2.70, 0.20, 2.50, hutX, Y - 0.02, hutZ, 'guard-hut-plinth'), p.wallAlt);
  ctx.push(slab(2.44, 2.74, 2.24, hutX, Y + 0.18, hutZ, 'guard-hut'), p.trim);
  ctx.push(slab(2.90, 0.18, 2.70, hutX, Y + 2.92, hutZ, 'guard-hut-roof'), p.wallAlt);
  ctx.push(slab(2.08, 0.92, 0.10, hutX, Y + 1.44, hutZ + 1.15, 'guard-hut-glass'), p.glass);
  ctx.push(slab(0.10, 0.92, 1.88, hutX - 1.25, Y + 1.44, hutZ, 'guard-hut-glass'), p.glass);
  if (mid) ctx.push(slab(2.24, 0.22, 0.14, hutX, Y + 2.44, hutZ + 1.18, 'guard-hut-band'), p.wall);
  const pivotX = gateX1 + 0.55;
  const boomLen = (gateX1 - gateX0) + 0.80;
  ctx.push(slab(0.48, 1.30, 0.48, pivotX, Y, fenceZ - 0.60, 'boom-post'), p.cladding);
  ctx.push(slab(0.62, 0.48, 0.62, pivotX, Y + 1.30, fenceZ - 0.60, 'boom-head'), p.trim);
  const boomParts = [[], []];
  const segs = 6;
  for (let i = 0; i < segs; i += 1) {
    const bw = boomLen / segs;
    boomParts[i % 2].push(slab(bw, 0.16, 0.16, pivotX - bw * (i + 0.5), Y + 1.42, fenceZ - 0.60,
      'boom-arm'));
  }
  ctx.push(boomParts[0], p.wall);
  ctx.push(boomParts[1], p.trim);
  ctx.push(slab(0.72, 0.36, 0.36, pivotX + 0.54, Y + 1.38, fenceZ - 0.60, 'boom-counterweight'),
    p.steel);
  for (const bx of [gateX0 - 0.32, gateX1 + 0.32]) {
    emit(ctx, bollard(ctx, {
      x: bx, z: fenceZ - 1.25, y: Y, height: 1.05, salt: 3355, name: 'gate-bollard',
    }));
  }

  /* — 7. THE PEDESTRIAN COURT: flag masts, entry lights and two planted tubs in front of the wing. — */
  for (let i = 0; i < 3; i += 1) {
    const fx = wingX0 + 0.60;
    const fz = wingZ1 + 2.10 + i * 1.75;
    ctx.push(slab(0.62, 0.22, 0.62, fx, Y, fz, 'flag-base'), p.wallAlt);
    ctx.push(taper(0.11, 0.07, 6.60, fx, Y + 0.22, fz, 'flag-mast', 6), p.trim);
    if (detail) {
      ctx.push(slab(0.98, 0.62, 0.05, fx + 0.53, Y + 5.55, fz, 'flag'), i === 1 ? p.wall : p.trim);
    }
  }
  if (mid) {
    for (const px of [wingX0 + 1.90, wingX1 - 0.55]) {
      raisedPlanter(ctx, {
        x: px, z: wingZ1 + 1.15, width: 1.35, depth: 1.35, y: Y, h: 0.50,
        salt: px > 4 ? 3334 : 3335, specimens: 2, name: 'entry-planter',
      });
    }
  }
  if (detail) {
    for (const bx of [wingX0 + 1.90, wingX1 - 0.55]) {
      bollardLight(ctx, { x: bx, z: wingZ1 + 2.55, y: Y, h: 0.98, salt: 3365, name: 'entry-light' });
    }
  }

  /* — 8. MAST LIGHTING (§6D). Columns in `cladding`: four 9 m near-black tapers standing against a
         pale field is the exact geometry the round-1 census fines us for. — */
  for (let i = 0; i < geom.masts.length; i += 1) {
    const [mx, mz] = geom.masts[i];
    const h = 9.00 + v.range(3360 + i, -0.5, 0.5);
    ctx.push(slab(0.74, 0.42, 0.74, mx, Y, mz, 'mast-base'), p.wallAlt);
    ctx.push(taper(0.21, 0.11, h, mx, Y + 0.42, mz, 'mast-column', 8), p.cladding);
    ctx.push(slab(2.14, 0.18, 0.36, mx, Y + 0.42 + h, mz, 'mast-head'), p.cladding);
    if (!mid) continue;
    for (const lx of [-0.74, 0, 0.74]) {
      ctx.push(rotBox(0.58, 0.16, 0.42, mx + lx, Y + 0.42 + h - 0.17, mz, { x: 0.42 }, 'mast-lamp'),
        p.trim);
    }
  }

  /* — 9. TRANSPORT CRADLES at the door, which is where a hall that moves large objects keeps its
         timber. `goods` is otherwise unused on this subject and it is the warmest albedo in the
         palette after the accent — the round-1 census asks for both. — */
  emit(ctx, crateStack(ctx, {
    x: bayX0 + 1.10, z: bayZ1 + 2.20, y: Y, columns: 2, rows: 2, crateW: 1.15, crateH: 0.86,
    crateD: 1.00, rotationY: v.range(3370, -0.16, 0.16), salt: 3370, name: 'cradle-crate',
  }));
  emit(ctx, palletStack(ctx, {
    x: bayX0 + 1.20, z: bayZ1 + 4.30, y: Y, count: 5, rotationY: v.range(3372, -0.20, 0.20),
    salt: 3372, name: 'cradle-pallet',
  }));

  emit(ctx, serviceGrate(ctx, { x: bayX0 + 2.9, z: bayZ1 + 9.2, y: Y, salt: 3366, name: 'pad-grate' }));
  emit(ctx, serviceGrate(ctx, { x: fenceX - 1.9, z: -11.2, y: Y, salt: 3367, name: 'pad-grate' }));
  for (const s of [-1, 1]) {
    emit(ctx, bollard(ctx, {
      x: (doorX0 + doorX1) / 2 + s * ((doorX1 - doorX0) / 2 + 0.95), z: bayZ1 + 1.30, y: Y,
      height: 1.15, salt: 3368, name: 'door-bollard',
    }));
  }
  void wingX1;
}

/* ───────────────────────────────────── the builder ────────────────────────────────────── */

/**
 * `space-works` — contemporary aerospace pad works.
 *
 * Order is the order the thing is built in: the plate and the pad first, then the two masses, then
 * the rear pad's plant, then the vehicle that ties the door to the gate.
 */
function buildSpaceWorks(rootCtx) {
  const ctx = raisedContext(rootCtx, GROUND);
  const { env, p } = ctx;

  const edgeX = env.lotW / 2 - env.boundaryInset;   // 7.15 on a 1-tile frontage
  const edgeZ = env.lotD / 2 - env.boundaryInset;   // 15.15 on a 2-tile depth
  const fenceX = edgeX - VERGE_FLANK;
  const fenceZ = edgeZ - VERGE_STREET;

  /* — THE PLAN, AND EVERY LINE OF IT IS AN OCCLUSION DECISION TAKEN OFF THE r1 PLATE.
       `industrial-lab.js` puts the three-quarter eye at azimuth 0.20π — front and RIGHT — so +X and
       +Z are the two seen sides and everything at −X behind the hall is invisible at the station the
       programme grades. r1 put the wing at −X and the whole rear plant behind a hall that spanned the
       lot, and the plate shows a grey sliver and two tank tops for six named contract items.
       So: the hall sits WEST with its door and its mark on the +Z face; the wing runs down the EAST
       side, low, with both of its glazed elevations square to the camera; and the corridor between
       the wing and the boundary carries the trench, the stand and the tanks on the camera's own side
       of the lot, where a sight line leaves past the wing instead of through the hall. — */
  const bayX1 = 1.45;                               // the dispatcher's sign plate ends at x = +1.3
  const bayX0 = -fenceX + 0.15;
  const bayW = bayX1 - bayX0;
  const bayD = clamp(env.bodyD * 0.72, 11.00, 11.90);
  const bayZ1 = env.frontZ;                         // the sign plate lands on this face
  const bayZ0 = bayZ1 - bayD;

  /* — THE DOOR SLOT SITS WEST OF THE DISPATCHER'S SIGN PLATE, and that is not a preference.
       `industrial/index.js` mounts a 2.6 m plate at x ∈ [−1.3, +1.3], y 3.4, z = frontZ + 0.06 for
       every FARM_KIT / INSTITUTION_KIT subject and it is not this lane's file to move. East of the
       plate this frontage has 0.15 m; west of it, four and a half metres. — */
  const doorX1 = -1.55;
  const doorW = clamp(bayW * 0.46, 3.20, 3.60);
  const doorX0 = doorX1 - doorW;
  const doorH = clamp(BAY_H * 0.84, 10.00, 10.80);

  const wingX0 = bayX1;
  const wingX1 = fenceX - 0.15;
  const wingZ1 = bayZ1 + 6.20;
  const wingZ0 = -2.00;

  // The corridor: x ∈ [wingX0, fenceX], z south of the wing. Everything §6D puts on the rear pad
  // stands in it, sized so the stand's deck and handrail stay inboard of the boundary.
  const trenchX0 = wingX0 + 1.00;
  const trenchX1 = trenchX0 + 2.90;
  const trenchZ1 = -9.60;
  const trenchZ0 = trenchZ1 - 3.40;

  const geom = {
    edgeX, edgeZ, fenceX, fenceZ,
    bayX0, bayX1, bayZ0, bayZ1, doorX0, doorX1, doorH,
    wingX0, wingX1, wingZ0, wingZ1,
    trenchX0, trenchX1, trenchZ0, trenchZ1,
    propX: (trenchX0 + trenchX1) / 2 + 0.30,
    propZ: -6.90,
    cryoX: wingX0 + 1.30,
    cryoZ: -4.05,
    gateX0: doorX0 - 0.60,
    gateX1: doorX1 + 0.60,
    roseX: (wingX0 + wingX1) / 2 + 0.35,
    roseZ: wingZ1 + 3.40,
    roseR: 1.45,
    masts: [
      [-fenceX + 0.90, fenceZ - 1.60],
      [-fenceX + 0.90, bayZ1 + 2.60],
      [fenceX - 0.90, -2.90],
      [-fenceX + 0.90, bayZ0 - 3.40],
    ],
  };

  /* — WEAR IS DIALLED DOWN HERE, ONCE, BEFORE ANY GEOMETRY IS EMITTED.
       `core.js: palette` authors a wear program for a Melbourne meatworks — rust bleed at 0.55–1.0,
       salt bloom at 0.95, moss in the valleys, an oil bloom on the yard. On a white insulated panel
       that renders as dirt, and §6D amends the doctrine for this subject in as many words: "wear is
       minimal and directed: tyre scrub on the pad and scorch at the flame trench, and nothing else."
       Both of those marks are GEOMETRY on this lot — the scrub quads and the scorch fan — so what
       the material program has to do is get out of their way. — */
  requestWear(p.trim, { rustBleed: 0.04, grimeBand: 0.14, saltBloom: 0.0, chalk: 0.08, mossValley: 0.0 });
  requestWear(p.wallAlt, { rustBleed: 0.05, grimeBand: 0.18, saltBloom: 0.08, chalk: 0.08, mossValley: 0.0 });
  requestWear(p.cladding, { rustBleed: 0.06, grimeBand: 0.16, saltBloom: 0.0, chalk: 0.10, mossValley: 0.0 });
  requestWear(p.wall, { rustBleed: 0.04, grimeBand: 0.14, saltBloom: 0.04, chalk: 0.10, mossValley: 0.0 });
  requestWear(p.steel, { rustBleed: 0.18, grimeBand: 0.22, chalk: 0.06 });
  requestWear(p.ground, {
    tyreScrub: 0.80, oilBloom: 0.06, saltBloom: 0.0, grimeBand: 0.0, dockZ: bayZ1 + 3.2,
  });

  padAndCurtilage(rootCtx, geom);
  highBay(ctx, geom);
  cleanRoomWing(ctx, geom);
  rearPad(ctx, geom);
  transporter(ctx, { x: (doorX0 + doorX1) / 2, z: bayZ1 + 4.60, y: 0 });
}

/* ─────────────────────────────────────── the export ───────────────────────────────────── */

export const SPACE_WORKS_BUILDERS = Object.freeze({
  'space-works': buildSpaceWorks,
});

export { buildSpaceWorks };
export default buildSpaceWorks;
