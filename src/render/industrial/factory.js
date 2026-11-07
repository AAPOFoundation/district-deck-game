// District Deck V3.32 — Lane A: `factory-light`, the light-industrial process plant.
//
// Governing spec: docs/next-phase/V332-INDUSTRIAL-AAA-SPEC.md, which inherits
// docs/next-phase/V320-RESIDENTIAL-AAA-SPEC.md §2 (the ten graded dimensions), §3 (the hard
// constraints) and §6 (the eight method rules) verbatim. The contract this file codes against is
// work/v332-briefs/CONTRACT.md.
//
// WHAT A LIGHT-INDUSTRIAL PLANT IS, AS A COMPOSITION.
//
// A shed with a process in it, and the process is what you can see from outside. The reference
// pack (`mvp/_reviews/industrial/_reference-mp/mp-factory-*.png`) reads, from the street: a
// hall with north-lit roof glazing; a lower plant end beside it; a dock platform with two
// shuttered bays under one canopy; a stack on a masonry pedestal clearing everything; and a
// working yard with a boundary, a truck gate, stored goods and paint on the ground. Every one
// of those is a graded item here, so every one of them is modelled.
//
// THE MASSING, AND WHY IT IS THREE PIECES RATHER THAN ONE BOX.
//
//   hall           x ∈ [leftX, plantX0]   full depth   eaves 8.4 m, north-lit roof
//   plant bay      x ∈ [plantX0, rightX]  front 2/3    eaves 5.4 m, louvred, cowled
//   plant compound x ∈ [plantX0, rightX]  rear 1/3     dwarf wall, stack pedestal, condensers
//
// V320 §2.1 makes blank-wall articulation part of silhouette and names it as a rule: "no
// elevation may be a large undifferentiated plane." The placeholder this replaces was one box
// 11.7 × 16.1 × 8.4 and every elevation failed that sentence. Three pieces at three heights give
// the silhouette two steps before any ornament is hung on it, and they give the stack somewhere
// to stand that is not the middle of a roof.
//
// SALTS. 200–399 and nothing else — core owns 0–99, the yard kit 100–199, Lane B 400–599.
// Straying costs the other lane its variation (V332 §6). Calls INTO the yard kit pass yard-range
// salts, which is that kit's own namespace and is what the scaffold's placeholder did.
//
// SHARED FILES ARE NOT THIS LANE'S TO EDIT. Round 1 routed around three defects in `core.js`;
// the CORE REPAIR seat has since fixed all three, and round 2 deletes the workarounds rather
// than leaving them to rot — `pipeChain` is gone and `pipeRun` is called with whole polylines
// again, the `plateDrop` fudge is gone and the yard kit takes the `y` it now accepts, and
// `northLitRoof`'s docstring records what survives of the local roof build and why.

import * as THREE from 'three';
import {
  // primitives
  applyMetreUv, box, slab, rotBox, cyl, taper, prism, skillion, moulding,
  COPING_PROFILE,
  // industrial primitives
  corrugatedPanel, portalFrame, pipeRun, ladderCaged, externalStair, louvreScreen,
  rollerDoor, dockBumper, gutterAndDownpipe,
  // the yard kit
  PLATE, boardPlate,
  hardstandSlab, apron, palisadeFence, chainLinkFence, industrialGate, bollard, wheelStop,
  kerb, serviceGrate, palletStack, stillage, drumCluster, skipBin, gasBottleCage, crateStack,
  signPlate, weedLine,
  // plumbing
  emit, requestWear, p1RoofBreakers,
} from './core.js';

/* ────────────────────────────── local dimensional constants ────────────────────────────── */

/**
 * The lot datum. Everything this file builds stands on the board plate's deck.
 *
 * `boardPlate` puts its deck top at `PLATE.rise` and `hardstandSlab` lays the wearing surface on
 * top of that, so the paving a truck drives on is at `PLATE.rise + 0.02`. Round 1 seated the
 * plate 0.12 m DOWN to keep a yard kit that only accepted `y = 0` on its authored datum; the
 * CORE REPAIR seat has since given all fifteen yard helpers a `y`, so the fudge is deleted and
 * the datum moves the other way — the yard kit is passed `y: PLATE.rise` and the whole building
 * is raised onto the same deck by `raisedContext` below.
 */
const GROUND = PLATE.rise;
/** Top of the wearing surface, for anything that sits ON the paving rather than in it. */
const PAVE = 0.02;

/** Dock floor, and therefore the platform height and the shutter sill. Trailer-bed height. */
const DOCK_FLOOR = 1.05;
/**
 * The dock aperture is DERIVED, not authored, and the two numbers that drive it are the two the
 * r1 critic measured against `mp-factory-dock`.
 *
 *   aperture width ÷ height   ours 0.75   reference 0.89
 *   pier between the two bays  ours 1.5 % of frame   reference 6 %
 *
 * `DOOR_RATIO` fixes the first outright: the clear height follows the clear width. `PIER_W` is
 * the second, in metres rather than in frame percentage — 1.10 m against a ~3.15 m leaf is 35 %
 * of a door width, where the reference's 6 ÷ 20.85 is 29 %. Both then have to FIT: the leaf is
 * clamped to whatever the hall frontage has left once the pier and the two end piers are taken
 * out, so a façade whose width jitter runs narrow shrinks the door rather than spilling the
 * platform past the shell.
 */
const DOOR_RATIO = 0.89;
const PIER_W = 1.10;
/**
 * Solid frontage held at each end of the dock zone, so the bays are IN a wall.
 *
 * 0.60 rather than the 0.95 the first draft of this pass carried, and the difference is not
 * taste. The leaf is what is left after the piers, so every centimetre of end pier comes off the
 * aperture: at 0.95 the derived leaf came out at 2.70 m — NARROWER than r1's authored 3.00 —
 * and a round that fixed the aperture RATIO by shrinking the aperture is a round that made the
 * dock smaller while claiming to make it bigger. At 0.60 the leaf lands at 3.02–3.27 m, wider
 * than r1 on every façade, with the centre pier still at 1.10.
 */
const END_PIER_W = 0.60;
/** Depth of the concrete dock platform in front of the wall. */
const PLATFORM_D = 1.75;
/** Eaves of the low plant end. The step down from 8.4 is half the silhouette. */
const PLANT_H = 5.40;
/** Depth of the open plant compound at the rear of the plant end. */
const COMPOUND_D = 5.00;
/** Height of the dwarf wall around that compound. */
const COMPOUND_WALL_H = 2.35;
/** Clear paving between the boundary fence and the plate edge — the perimeter footpath. */
const VERGE_W = 1.05;

/* ─────────────────────────────────── local helpers ─────────────────────────────────── */

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * A straight member between two arbitrary points — guy stays, braces, hand rails on a rake.
 *
 * `core.js` has no two-point member: `pipeRun` is the nearest thing and it caps both ends with
 * 48-triangle spheres, which is right for a pipe and wrong for a 20 mm stay wire. Built the same
 * way `pipeRun` builds its skew leg (unit-vector quaternion onto the segment), and it calls
 * `applyMetreUv` itself because it is raw BufferGeometry — the UV convention at the head of
 * `core.js` is binding, and a raw geometry that skips it samples one texel.
 */
function memberBetween(ax, ay, az, bx, by, bz, radius, name, segments = 6) {
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
 * The same context with a vertical offset applied to everything pushed through it.
 *
 * THE PROBLEM THIS SOLVES, STATED PLAINLY. The building is authored with its ground at y = 0 —
 * `DOCK_FLOOR` is 1.05 m above the surface a trailer stands on, a base plate is 90 mm above the
 * slab it is grouted to, a step riser is a fifth of the dock floor. The board plate puts its
 * deck at `PLATE.rise`. Adding `PLATE.rise` to a hundred and twenty authored heights would be a
 * hundred and twenty chances to add it to the wrong one, and the failure mode is silent: a base
 * plate 140 mm under the paving looks exactly like a base plate nobody modelled.
 *
 * So the offset is applied once, at the boundary, and the authored numbers keep meaning what
 * they say. `emit` and every helper read `ctx.push`, so wrapping that one method catches the
 * shared kit as well as this file's own geometry. The translation is exact and deterministic —
 * it is one `translate` per geometry, in the order the builder emits them.
 *
 * The YARD KIT is deliberately NOT built through this wrapper: those helpers take their own `y`
 * and are handed `PLATE.rise` directly, which is the datum the CORE REPAIR seat added them for.
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
 * Solid runs of wall left between a list of openings, along one axis.
 *
 * This is the residential lane's `facadeShell` idea in its industrial form and it exists for
 * V320 §2.3: an opening has to be a HOLE IN A WALL, not a dark decal stuck on a continuous
 * plane. Building the wall as the segments between the openings means the reveal, the jamb
 * return and the soffit have real wall thickness beside them, and the raking light finds it.
 *
 * @param {number} from  low coordinate of the run
 * @param {number} to    high coordinate of the run
 * @param {Array<[number, number]>} holes  [lo, hi] pairs, in the same coordinate
 * @returns {Array<[number, number]>} the solid spans, in order
 */
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
 * A run of profiled sheet on a vertical plane, in the four orientations a shed needs.
 *
 * `side` is the outward normal: '+z' (frontage), '-z' (rear), '+x' / '-x' (flanks). The sheet's
 * ribs are geometry rather than a normal map — see the note on `corrugatedPanel` in `core.js`;
 * the atlas deliberately does not paint a second rib rhythm, so nothing here adds one.
 */
function claddingRun(ctx, { side, along0, along1, y0, y1, plane, name }) {
  const width = along1 - along0;
  const height = y1 - y0;
  if (width < 0.08 || height < 0.08) return;
  const alongMid = (along0 + along1) / 2;
  const yMid = (y0 + y1) / 2;
  const euler = side === '+z' ? null
    : side === '-z' ? { y: Math.PI }
      : { y: (side === '+x' ? 1 : -1) * Math.PI / 2 };
  const x = (side === '+z' || side === '-z') ? alongMid : plane;
  const z = (side === '+z' || side === '-z') ? plane : alongMid;
  ctx.push(corrugatedPanel({ width, height, x, y: yMid, z, euler, name }), ctx.p.cladding);
}

/**
 * A glazed opening that reads as a hole: shadow board, recessed pane, mullions, head and sill.
 *
 * V320 §2.3 in full. "Glass is never a flat blue rectangle and never a matte black one" — the
 * palette's pane is #151b1f at roughness 0.30 with a real environment response, so what this
 * has to supply is the DEPTH: a dark board a hand's width behind the glass, a pane set back
 * from the wall face, glazing bars in the pale paint value in front of it, and a head and sill
 * whose value is neither the wall's nor the glass's.
 *
 * `axis` is 'x' for an opening in a ±Z elevation and 'z' for one in a ±X elevation.
 */
function glazedOpening(ctx, {
  axis = 'x', centre, y, width, height, plane, facing = 1, bars = null, name = 'glazing',
}) {
  const { p } = ctx;
  const barCount = bars ?? Math.max(1, Math.round(width / 1.35) - 1);
  const put = (w, h, d, off, yy, depth, material, tag) => {
    const x = axis === 'x' ? centre + off : plane + facing * depth;
    const z = axis === 'x' ? plane + facing * depth : centre + off;
    const sx = axis === 'x' ? w : d;
    const sz = axis === 'x' ? d : w;
    ctx.push(box(sx, h, sz, x, yy, z, tag), material);
  };
  // The board behind, which is what turns a pane into a depth rather than a colour.
  put(width - 0.06, height - 0.06, 0.08, 0, y, -0.30, p.shadow, `${name}-board`);
  // The pane, set back into the reveal.
  put(width - 0.14, height - 0.14, 0.05, 0, y, -0.13, p.glass, `${name}-pane`);
  // Reveal returns, so the opening has thickness on all four sides.
  for (const s of [-1, 1]) {
    put(0.10, height, 0.30, s * (width / 2 - 0.05), y, -0.15, p.wallAlt, `${name}-reveal-jamb`);
  }
  put(width, 0.10, 0.30, 0, y + height / 2 - 0.05, -0.15, p.wallAlt, `${name}-reveal-head`);
  // Glazing bars in the pale paint, in front of the pane. A shed window is a grid, and the grid
  // is the thing that survives to the mid distance.
  for (let i = 1; i <= barCount; i += 1) {
    const off = -width / 2 + (width * i) / (barCount + 1);
    put(0.06, height - 0.16, 0.06, off, y, -0.06, p.trim, `${name}-bar`);
  }
  put(width - 0.16, 0.055, 0.06, 0, y, -0.06, p.trim, `${name}-transom`);
  // Head and stooled sill in the secondary masonry, both projecting past the wall face.
  put(width + 0.34, 0.20, 0.22, 0, y + height / 2 + 0.13, 0.05, p.wallAlt, `${name}-head`);
  put(width + 0.34, 0.12, 0.30, 0, y - height / 2 - 0.07, 0.08, p.wallAlt, `${name}-sill`);
}

/**
 * A personnel door in a real reveal, with a wired-glass vision panel, a threshold and a hood.
 *
 * A shed nobody can walk into is a construction-logic failure (V320 §2.2) before any ornament
 * is hung on it, and the reference pack puts this door beside the dock on every plate.
 */
function personnelDoor(ctx, { x, z, facing = 1, yBase = 0, name = 'personnel-door' }) {
  const { p } = ctx;
  const h = 2.14;
  const w = 0.98;
  ctx.push(box(w + 0.18, h + 0.10, 0.34, x, yBase + h / 2, z - facing * 0.16, `${name}-reveal`), p.shadow);
  ctx.push(box(w, h, 0.06, x, yBase + h / 2, z + facing * 0.02, `${name}-leaf`), p.trim);
  ctx.push(box(w * 0.42, 0.44, 0.05, x, yBase + h - 0.42, z + facing * 0.05, `${name}-vision`), p.glass);
  // Two sunk panels under the vision light. r1 shipped this leaf as a plain pale rectangle and
  // the critic named it — V320 §2.3 asks for panelled doors, and on a steel door the panel is a
  // pressed recess, which is a value step rather than a moulding.
  for (const py of [0.52, 1.14]) {
    ctx.push(box(w * 0.66, 0.46, 0.035, x, yBase + py, z + facing * 0.045,
      `${name}-panel`), p.shadow);
  }
  for (const s of [-1, 1]) {
    ctx.push(box(0.09, h + 0.10, 0.16, x + s * (w / 2 + 0.06), yBase + h / 2, z + facing * 0.03,
      `${name}-jamb`), p.steel);
  }
  ctx.push(slab(w + 0.34, 0.16, 0.22, x, yBase + h + 0.05, z + facing * 0.04, `${name}-head`), p.wallAlt);
  ctx.push(box(0.055, 0.30, 0.07, x + w * 0.34, yBase + 1.02, z + facing * 0.07, `${name}-handle`), p.steel);
  // A hood, because a door on an elevation with no eaves over it gets one.
  ctx.push(skillion(w + 0.60, 0.07, x, z + facing * 0.05, yBase + h + 0.46,
    z + facing * 0.62, yBase + h + 0.30, `${name}-hood`), p.steel);
  ctx.push(slab(w + 0.50, 0.14, 0.30, x, yBase - 0.14, z + facing * 0.30, `${name}-threshold`), p.wallAlt);
}

/**
 * North-lit roof over the hall — sawtooth on façades 1 and 3, closed mono on 0 and 2 (§2d).
 *
 * ROUND 2 REBUILT THIS SURFACE, BECAUSE IT IS 30–40 % OF THE THREE-QUARTER FRAME AND THE R1
 * CRITIC SCORED FIVE DIMENSIONS THROUGH IT. What was on the r1 plate, measured at 6×: a pale
 * capping running the full length of every rake and every riser head, in `trim` — the brightest
 * value the palette owns, on the largest plane the subject has; a tan/grey seam where the
 * monitor head met the deck; and four soft dark ellipses drifting across the sheet with no
 * gutter, valley or fixing under them. Three changes answer all three:
 *
 *   1. EVERY CAPPING MEMBER MOVED FROM `trim` TO `steel`. A verge flashing, a valley gutter, a
 *      riser head and a cill are galvanised steel on a real shed and they are DARK on every
 *      factory plate in `_reference-mp/`. The only pale things left on the roof are the glazing
 *      mullions, which is the one place §2.3 wants a value break, and the r1 critic scored the
 *      clerestory as the best opening on the subject.
 *   2. THE GABLE TRIANGLES ARE CLAD, NOT SHEETED. The mono's closing wedge used to be one
 *      `steel` prism, so its two end triangles — 4 m tall at the ridge — rendered as a warm tan
 *      plane above an olive wall, which is exactly the seam the critic measured. A gable end IS
 *      the wall continuing past the eaves, so it takes the wall's material and the roof plane
 *      alone stays dark.
 *   3. THE PLANE IS BROKEN. §2.1 names the blank-plane rule and `mp-factory-mono-shed` answers
 *      it with a monitor, three cowls and a valley. The deck now carries sheet-lap battens at a
 *      real sheet length, a roof hatch with its guard rail, and cowls sized to be seen — r1's
 *      were 0.68 m across and read as white specks.
 *
 * The moss that made the ellipses is switched off at the bucket in `directWear`, and the reason
 * is in the shader rather than in the amplitude: `ddMoss` gates on `ddUpFace`, and a modelled
 * rib gives half its facets an up-facing normal whose xz component points away from the sun, so
 * a directive meant for a shaded valley paints alternating rib flanks across an open pitch.
 *
 * WHAT SURVIVES AS A LOCAL BUILD, NOW THAT `core.js: sawtoothRoof` IS REPAIRED. The helper's two
 * r1 defects — a downward-facing ribbed pitch and glazing floating a whole `rise` over an open
 * riser — are fixed upstream, and this function's sawtooth branch now agrees with it on both
 * (ribs up, glazing seated in a closed riser, facing +Z). Two things keep the local build: the
 * helper has no MONO branch, and the mono monitor is half of this subject's product contract;
 * and the helper routes its cappings to `trim`, which is the defect this round exists to remove.
 * A lane cannot re-bucket a shared helper's output per-part — `emit`'s remap is per bundle key,
 * and the helper puts glazing bars and valley gutters in the same key.
 */
function northLitRoof(ctx, { x0, x1, zFront, zBack, yBase, mode, teeth, rise }) {
  const { p } = ctx;
  const width = x1 - x0;
  const cx = (x0 + x1) / 2;
  const depth = zFront - zBack;
  /**
   * THE ROOF SHEET TAKES THE DARK PAINT, NOT THE WALL SHEET'S VALUE.
   *
   * V320 §2.8 asks for value separation before hue, and lists roof separately from wall for
   * exactly this reason. Both are profiled steel, so both wanted `cladding` — and on the first
   * plate the pitches, the walls and the plant end all came out at one lightness and the whole
   * upper half of the subject read as a single pale mass. Every factory plate in the reference
   * pack has a dark roof over a coloured wall. `steel` is the dark bucket, it is already paid
   * for, and a dark roof over pale sheet costs nothing and buys the silhouette its top edge.
   */
  const roofSheet = p.steel;
  /**
   * ROOF RIB PITCH IS COARSER THAN WALL RIB PITCH, AND THAT IS A LEGIBILITY DECISION.
   *
   * At the wall's 0.42 m the roof's ribs subtend two or three pixels each at board altitude and
   * the sheet reads as noise — which is what the r1 critic saw as an aliased checker, and it is
   * also why directed staining could not read on top of it. Roof sheeting really is a deeper,
   * wider profile than wall cladding, so 0.62 is honest as well as legible, and it costs a third
   * fewer triangles on the largest panel either subject owns.
   */
  const ROOF_RIB = 0.62;

  /**
   * One glazed riser: valley gutter, spandrel, jambs, shadow board, pane, mullions, head.
   *
   * The pane starts above a SOLID SPANDREL rather than at the valley. A north light that runs
   * gutter-to-head is a glass wall, and on the first plate two of those over an 8.5 m hall read
   * as a greenhouse rather than as a roof with windows in it — the reference teeth all carry a
   * sheeted skirt under the glazing.
   */
  const riser = (zPlane, h, tag, footY = yBase) => {
    const spandrel = Math.min(0.62, h * 0.26);
    const glazeH = h - spandrel;
    const glazeY = footY + spandrel + glazeH / 2;
    ctx.push(slab(width, 0.16, 0.34, cx, footY - 0.03, zPlane - 0.14, `${tag}-valley`), p.steel);
    ctx.push(corrugatedPanel({
      width, height: spandrel, x: cx, y: footY + spandrel / 2, z: zPlane, name: `${tag}-spandrel`,
    }), p.cladding);
    ctx.push(box(width - 0.10, glazeH - 0.06, 0.10, cx, glazeY, zPlane - 0.24, `${tag}-board`), p.shadow);
    ctx.push(box(width - 0.22, glazeH - 0.18, 0.05, cx, glazeY, zPlane - 0.09, `${tag}-pane`), p.glass);
    const mullions = Math.max(2, Math.round(width / 1.55));
    for (let m = 1; m < mullions; m += 1) {
      ctx.push(box(0.075, glazeH - 0.12, 0.08, x0 + (width * m) / mullions, glazeY, zPlane - 0.02,
        `${tag}-mullion`), p.trim);
    }
    ctx.push(box(width - 0.22, 0.06, 0.08, cx, glazeY, zPlane - 0.02, `${tag}-transom`), p.trim);
    for (const s of [-1, 1]) {
      ctx.push(box(0.10, h, 0.26, cx + s * (width / 2 - 0.05), footY + h / 2, zPlane - 0.12,
        `${tag}-jamb`), p.steel);
    }
    ctx.push(slab(width + 0.14, 0.15, 0.40, cx, footY + h - 0.02, zPlane - 0.16, `${tag}-head`), p.steel);
    ctx.push(slab(width - 0.20, 0.09, 0.20, cx, footY + spandrel, zPlane - 0.06, `${tag}-cill`), p.steel);
  };

  if (mode === 'sawtooth') {
    const n = Math.max(1, teeth | 0);
    const bay = depth / n;
    const angle = Math.atan2(rise, bay);
    const pitchLen = Math.hypot(bay, rise);
    for (let i = 0; i < n; i += 1) {
      const zR = zFront - i * bay;
      riser(zR - 0.06, rise, `tooth-${i}`);
      // The pitch: high at the riser head (+Z), falling to the next valley (−Z). Rotation is
      // −(π/2 + angle) so the PROFILED face is the one the sky sees — which is what the repaired
      // `core.js: sawtoothRoof` now does too, and the two agree by construction.
      ctx.push(corrugatedPanel({
        width, height: pitchLen, ribPitch: ROOF_RIB, x: cx, y: yBase + rise / 2, z: zR - bay / 2,
        euler: { x: -(Math.PI / 2 + angle) }, name: `tooth-${i}-pitch`,
      }), roofSheet);
      // The tooth's own gable at each flank — a right triangle, high at the riser, in the WALL
      // material, because a gable is the flank continuing past the eaves.
      for (const s of [-1, 1]) {
        ctx.push(prism(0.12, bay, rise, cx + s * (width / 2 - 0.05), yBase, zR - bay / 2,
          `tooth-${i}-gable`, 0.5), p.cladding);
      }
      // Purlins under the pitch: the sheet bears on something, and they read through the bay.
      for (const t of [0.32, 0.72]) {
        ctx.push(rotBox(width - 0.20, 0.10, 0.18, cx, yBase + rise * (1 - t) + 0.10, zR - bay * t,
          { x: -angle }, `tooth-${i}-purlin`), p.steel);
      }
      // Verge flashing down each rake, which is what stops a pitch ending in a raw edge.
      //
      // RAKE SIGN. `rotBox`'s Z-length member obeys y' = −z·sinθ, so the +Z end of a member
      // rotated by +angle goes DOWN. This pitch is HIGH at +Z, so the rake is −angle. The first
      // plate carried +angle and the two verges crossed the roof as a pale X — the giveaway that
      // a rotation sign is wrong is that the flashing does not follow the sheet it flashes.
      for (const s of [-1, 1]) {
        ctx.push(rotBox(0.11, 0.08, pitchLen, cx + s * (width / 2 + 0.01), yBase + rise / 2,
          zR - bay / 2, { x: -angle }, `tooth-${i}-verge`), p.steel);
      }
      ctx.push(slab(width + 0.16, 0.13, 0.30, cx, yBase + rise + 0.04, zR,
        `tooth-${i}-ridge-cap`), p.steel);
      const skyX = cx + (i % 2 === 0 ? -1 : 1) * width * 0.20;
      const skyZ = zR - bay * 0.40;
      const skyY = yBase + rise * 0.40;
      ctx.push(slab(1.70, 0.20, 1.05, skyX, skyY, skyZ, `p1-roof-skylight-kerb`), p.wallAlt);
      ctx.push(slab(1.42, 0.05, 0.82, skyX, skyY + 0.20, skyZ, `p1-roof-skylight-pane`), p.glass);
      ctx.push(slab(width * (0.20 + (i % 3) * 0.07), 0.02, 0.55,
        cx + ((i % 2) ? 0.35 : -0.35), yBase + rise * 0.26 + 0.04, zR - bay * 0.55,
        'p1-roof-patina-band'), p.shadow);
      // One cowl per tooth, on the pitch rather than on the ridge, where a real extract goes.
      roofCowl(ctx, {
        x: cx + (i % 2 === 0 ? -1 : 1) * width * 0.22, z: zR - bay * 0.46,
        y: yBase + rise * 0.55, radius: 0.52, name: `tooth-${i}-cowl`,
      });
    }
    return { crown: yBase + rise, frontHigh: yBase + rise };
  }

  // CLOSED MONO. The envelope's `rise` is the whole roof zone, and it is spent as a shallow
  // deck rising away from the street plus a north-light monitor standing on its high edge —
  // which is the second factory typology in the reference pack (`mp-factory-mono-shed.png`).
  // Spending all 5.4–5.6 m on a single wedge instead puts a 14 m blind gable over the dock and
  // buries the stack, and §2d wants the stack board-legible.
  const deckRise = rise * 0.62;
  const monitorH = rise * 0.38;
  const angle = Math.atan2(deckRise, depth);
  const pitchLen = Math.hypot(depth, deckRise);
  const midZ = (zFront + zBack) / 2;
  const deckAt = (z) => yBase + deckRise * ((zFront - z) / Math.max(0.5, depth));
  // The wedge closes the two gable ends, the back face and the soffit in one 8-triangle
  // primitive, and it is CLAD rather than sheeted — see (2) in the note above. The sheet laid on
  // its slope is what carries the rib, and it is the only dark thing in the roof zone.
  ctx.push(prism(width, depth, deckRise, cx, yBase, midZ, 'mono-solid', -0.5), p.cladding);
  ctx.push(corrugatedPanel({
    width: width - 0.04, height: pitchLen, ribPitch: ROOF_RIB, x: cx,
    y: yBase + deckRise / 2 + 0.03,
    z: midZ, euler: { x: angle - Math.PI / 2 }, name: 'mono-pitch',
  }), roofSheet);
  // Rake sign, mirrored: the mono is high at −Z, so its +Z end goes down and the rake is +angle.
  for (const s of [-1, 1]) {
    ctx.push(rotBox(0.11, 0.08, pitchLen, cx + s * (width / 2 + 0.01), yBase + deckRise / 2,
      midZ, { x: angle }, 'mono-verge'), p.steel);
  }
  /* — BREAKING THE PLANE (§2.1). Sheet laps at 6 m, which is the length sheet comes in; the
       batten over each lap is the horizontal that stops a 16 m slope reading as one surface. — */
  const laps = Math.max(1, Math.round(depth / 6.0)) - 1;
  for (let i = 1; i <= laps; i += 1) {
    const lz = zFront - (depth * i) / (laps + 1);
    ctx.push(rotBox(width - 0.06, 0.07, 0.22, cx, deckAt(lz) + 0.10, lz, { x: angle },
      'mono-sheet-lap'), p.steel);
  }
  // Three cowls in a row along the slope, as `mp-factory-mono-shed` carries them, sized to be
  // seen at board altitude rather than to be correct in millimetres.
  for (let i = 0; i < 3; i += 1) {
    const cz = zFront - depth * (0.30 + i * 0.20);
    roofCowl(ctx, {
      x: cx + (i - 1) * width * 0.24, y: deckAt(cz) + 0.02, z: cz, radius: 0.50,
      name: `mono-cowl-${i}`,
    });
  }
  // A roof hatch with its guard rail. It is reached from inside — a shed's roof access is a
  // vertical ladder in the corner of the hall — so it does not pretend to serve the external
  // flank ladder, which stops at the gutter where a gutter ladder stops.
  const hatchZ = zFront - depth * 0.14;
  const hatchY = deckAt(hatchZ);
  ctx.push(slab(1.05, 0.22, 1.05, cx - width * 0.30, hatchY, hatchZ, 'roof-hatch-kerb'), p.wallAlt);
  ctx.push(rotBox(1.02, 0.07, 1.02, cx - width * 0.30, hatchY + 0.30, hatchZ - 0.24,
    { x: -0.55 }, 'roof-hatch-leaf'), p.steel);
  for (const s of [-1, 1]) {
    ctx.push(box(0.06, 1.00, 0.06, cx - width * 0.30 + s * 0.62, hatchY + 0.50, hatchZ + 0.60,
      'roof-hatch-stanchion'), p.steel);
  }
  ctx.push(box(1.30, 0.06, 0.06, cx - width * 0.30, hatchY + 0.98, hatchZ + 0.60,
    'roof-hatch-rail'), p.steel);
  // The monitor STANDS ON THE HIGH EDGE OF THE DECK, and its foot is the deck height at that z
  // rather than the eaves. The first plate passed the eaves and the monitor came out a metre and
  // a half BELOW the roof it is supposed to stand on, with its cap floating three metres over
  // the top of it — the pale plank hanging off the back of the shed on the façade-0 plate.
  const monitorZ = zBack + 0.95;
  const deckAtMonitor = deckAt(monitorZ);
  riser(monitorZ, monitorH, 'monitor', deckAtMonitor);
  ctx.push(skillion(width + 0.24, 0.10, cx, monitorZ, deckAtMonitor + monitorH + 0.16,
    zBack + 0.02, deckAtMonitor + monitorH - 0.02, 'monitor-cap'), roofSheet);
  return { crown: deckAtMonitor + monitorH, frontHigh: yBase };
}

/**
 * A ventilator cowl on a roof: kerb, throat, and the mushroom cap that names it.
 *
 * THE CAP IS DARK. r1 put it in `trim` and the reference's cowls are charcoal on every factory
 * plate; at 0.34 m radius the pale cap read as a white speck on a dark slope, which fails §2.5's
 * value test from the opposite direction to the usual one — ornament so bright it reads as a
 * defect rather than as a cowl. Dark, and half again as big, it breaks the silhouette instead.
 */
function roofCowl(ctx, { x, y, z, radius = 0.50, name = 'cowl' }) {
  const { p } = ctx;
  ctx.push(slab(radius * 2.1, 0.18, radius * 2.1, x, y, z, `${name}-kerb`), p.wallAlt);
  ctx.push(taper(radius, radius * 0.86, 0.62, x, y + 0.18, z, `${name}-throat`, 8), p.steel);
  ctx.push(taper(radius * 1.42, radius * 0.26, 0.36, x, y + 0.80, z, `${name}-cap`, 8), p.steel);
  // The drip ring sits UNDER the cap and takes the dark paint. Seated above it in `trim` — which
  // is where the first r2 plate had it — a 0.74 m pale disc rings each cowl and the three of them
  // become the brightest objects on the roof, which is the same §2.8 failure the gates were
  // scored for, relocated. Under the cap it reads as the lip a cowl actually has.
  ctx.push(cyl(radius * 1.40, 0.07, x, y + 0.74, z, 'y', `${name}-drip`, 8), p.steel);
}

/** Air-cooled condenser: a cased bank with a guarded fan on top. Plant that names the plant. */
function condenserUnit(ctx, { x, y, z, width = 1.70, depth = 1.10, height = 0.86, name = 'condenser' }) {
  const { p } = ctx;
  // The case is DARK and only the fan guards are pale. In `trim` the case is a white box on a
  // roof deck — the first r2 plate put one on the plant roof and it read as the brightest thing
  // between the stack and the dock. A condenser is a painted steel case with bright guards.
  ctx.push(slab(width, height, depth, x, y, z, `${name}-case`), p.steel);
  ctx.push(slab(width + 0.10, 0.09, depth + 0.10, x, y + height, z, `${name}-deck`), p.steel);
  for (const s of [-1, 1]) {
    ctx.push(cyl(depth * 0.34, 0.10, x + s * width * 0.25, y + height + 0.14, z, 'y',
      `${name}-fan`, 8), p.steel);
    ctx.push(cyl(depth * 0.36, 0.04, x + s * width * 0.25, y + height + 0.22, z, 'y',
      `${name}-guard`, 8), p.trim);
  }
  for (const s of [-1, 1]) {
    ctx.push(box(0.09, 0.34, 0.09, x + s * width * 0.42, y - 0.17, z, `${name}-foot`), p.steel);
  }
}

/**
 * Cable tray on brackets, with a junction box — §2a names it, and it is the cheapest ornament
 * on the list: a tray, three cables and a box, all in the dark paint against pale sheet.
 */
function cableTray(ctx, { z0, z1, y, plane, facing = -1, name = 'cable-tray' }) {
  const { p } = ctx;
  const length = Math.abs(z1 - z0);
  const zMid = (z0 + z1) / 2;
  const x = plane + facing * 0.16;
  ctx.push(box(0.16, 0.045, length, x, y - 0.09, zMid, `${name}-base`), p.steel);
  for (const s of [-1, 1]) {
    ctx.push(box(0.035, 0.13, length, x + s * 0.075, y - 0.03, zMid, `${name}-side`), p.steel);
  }
  for (const off of [-0.05, 0, 0.05]) {
    ctx.push(cyl(0.022, length, x + off, y - 0.05, zMid, 'z', `${name}-cable`, 5), p.trim);
  }
  const brackets = Math.max(2, Math.round(length / 2.2));
  for (let i = 0; i <= brackets; i += 1) {
    const bz = z0 + ((z1 - z0) * i) / brackets;
    ctx.push(box(0.20, 0.05, 0.05, plane + facing * 0.10, y - 0.11, bz, `${name}-bracket`), p.steel);
  }
  ctx.push(box(0.16, 0.34, 0.26, plane + facing * 0.10, y - 0.62, z0 + (z1 - z0) * 0.34,
    `${name}-junction-box`), p.trim);
  ctx.push(cyl(0.028, 0.52, plane + facing * 0.14, y - 0.36, z0 + (z1 - z0) * 0.34, 'y',
    `${name}-gland`, 6), p.steel);
}

/**
 * The process stack: masonry pedestal, banded shaft, cleaning door, cap, guy stays and a ladder.
 *
 * §2d requires it and requires it BOARD-LEGIBLE, which is a height relationship rather than a
 * number: `env.stackHeight` is 12.4–13.2 m and the closed-mono roof crown is 13.8–14.0 m, so a
 * shaft standing on the slab would be SHORTER THAN THE ROOF on two of the four façades and the
 * one element the product contract makes mandatory would disappear. The reference pack solves
 * it the way industry does — the shaft stands on a masonry pedestal (`mp-factory-light.png` and
 * `mp-factory-mono-shed.png` both show one) — so the pedestal is sized here to hold the cap a
 * fixed clearance over whatever the roof crown turned out to be.
 */
function processStack(ctx, { x, z, shaftH, pedestalH, anchors = [], name = 'stack' }) {
  const { p } = ctx;
  const r = 0.60;
  const top = pedestalH + shaftH;

  // Pedestal: brick, on a splayed concrete footing, with a coping the shaft sits on.
  ctx.push(slab(2.30, 0.26, 2.30, x, 0, z, `${name}-footing`), p.wallAlt);
  ctx.push(slab(1.94, pedestalH - 0.26, 1.94, x, 0.26, z, `${name}-pedestal`), p.wall);
  ctx.push(moulding(2.14, 0.30, x, pedestalH, z, 'x', COPING_PROFILE, `${name}-coping`), p.wallAlt);
  // ...and the coping is a run in x only, so the two returns close it in z.
  for (const s of [-1, 1]) {
    ctx.push(slab(2.14, 0.30, 0.34, x, pedestalH, z + s * 0.90, `${name}-coping-return`), p.wallAlt);
  }

  // Shaft, banded. The bands are the ornament: dark shaft, pale bands, and they are what makes
  // a cylinder read as a built stack rather than as a pipe.
  ctx.push(taper(r, r * 0.86, shaftH, x, pedestalH, z, `${name}-shaft`, 10), p.steel);
  const bands = Math.max(3, Math.round(shaftH / 2.6));
  for (let i = 1; i <= bands; i += 1) {
    const by = pedestalH + (shaftH * i) / (bands + 1);
    const br = r * (1 - 0.14 * (i / (bands + 1)));
    ctx.push(cyl(br + 0.055, 0.16, x, by, z, 'y', `${name}-band`, 10), p.trim);
  }
  // Cleaning door at the foot of the shaft, with its two hinges and a dog.
  ctx.push(box(0.52, 0.66, 0.09, x, pedestalH + 0.86, z + r * 0.94, `${name}-cleaning-door`), p.trim);
  for (const s of [-1, 1]) {
    ctx.push(box(0.10, 0.11, 0.06, x - 0.22, pedestalH + 0.86 + s * 0.22, z + r * 0.99,
      `${name}-hinge`), p.steel);
  }
  ctx.push(cyl(0.035, 0.16, x + 0.20, pedestalH + 0.86, z + r * 1.02, 'z', `${name}-dog`, 6), p.steel);
  // Cap: a weather cone on three legs over the flue mouth, not a lid on a tube.
  ctx.push(cyl(r * 0.92, 0.20, x, top + 0.10, z, 'y', `${name}-mouth`, 10), p.trim);
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    ctx.push(box(0.06, 0.42, 0.06, x + Math.cos(a) * r * 0.8, top + 0.40, z + Math.sin(a) * r * 0.8,
      `${name}-cap-leg`), p.steel);
  }
  ctx.push(taper(r * 1.42, r * 0.18, 0.46, x, top + 0.58, z, `${name}-cap`, 10), p.trim);

  /* — Guy stays. EACH ONE ENDS ON A STRUCTURE THIS FILE ACTUALLY BUILT, and that is the r1
       critic's finding repaired rather than restated: "the stack's three guy wires cross the
       brick base and leave frame with no anchor." r1 swung them on a circle at a fixed 2.55 m
       reach and the circle did not know the compound wall was there, so two of three passed
       through masonry to a pad on the far side of it. The caller now hands over three points it
       has already built — two lengths of compound coping and a bracket on the hall's east flank
       — and each wire runs collar-to-cleat with a turnbuckle at its own two-thirds point. — */
  const stayY = pedestalH + shaftH * 0.86;
  ctx.push(cyl(r * 0.90, 0.13, x, stayY, z, 'y', `${name}-stay-collar`, 10), p.steel);
  anchors.forEach((a, i) => {
    const dx = a.x - x; const dz = a.z - z;
    const len = Math.hypot(dx, dz) || 1;
    const wire = memberBetween(x + (dx / len) * r, stayY, z + (dz / len) * r, a.x, a.y, a.z,
      0.024, `${name}-stay-${i}`);
    if (wire) ctx.push(wire, p.steel);
    // The cleat the wire is made off to, standing on whatever it lands on.
    ctx.push(box(0.20, 0.22, 0.20, a.x, a.y + 0.10, a.z, `${name}-stay-cleat`), p.steel);
    // The turnbuckle, two-thirds of the way down, says the wire is tensioned rather than draped.
    const t = 0.66;
    ctx.push(box(0.085, 0.30, 0.085,
      x + (dx / len) * r + (a.x - x - (dx / len) * r) * t,
      stayY + (a.y - stayY) * t,
      z + (dz / len) * r + (a.z - z - (dz / len) * r) * t, `${name}-turnbuckle`), p.trim);
  });

  // Access ladder, caged above the regulation height, landing on the pedestal coping.
  emit(ctx, ladderCaged({
    x, z: z + r + 0.06, yBase: pedestalH + 0.30, yTop: top - 0.60,
    cageFrom: pedestalH + 2.5, name: `${name}-ladder`,
  }));
}

/* ─────────────────────────────────────── the yard ─────────────────────────────────────── */

/**
 * The working yard (§2b), which is graded as hard as the building.
 *
 * "A hardstand that is not a lawn… a boundary in the era's own material… a gate wide enough for
 * the truck the dock implies… bollards, a wheel stop, a kerb, a service pit… stored goods that
 * name the use… signage." All of it, and the planting is a weed line rather than a garden.
 *
 * Yard-kit calls carry YARD-RANGE salts (100–199), which is that kit's own namespace; this
 * lane's own `v` calls stay in 200–399. Salts are spread so two objects that both READ their
 * salt never overlap — several yard helpers ignore theirs, and those may collide harmlessly.
 */
function factoryYard(ctx, geom) {
  const { env, p, v } = ctx;
  const inset = env.boundaryInset;
  const plateHalfW = env.lotW / 2 - inset;
  const plateHalfD = env.lotD / 2 - inset;
  // The boundary is held INSIDE the plate edge by a footpath's width, which is the single
  // largest curtilage change this round — see the note on the perimeter below.
  const halfW = plateHalfW - VERGE_W;
  const halfD = plateHalfD - VERGE_W;
  const { leftX, rightX, plantX0, dockZoneW, bayPitch } = geom;
  const dockCx = geom.dockCx;
  /** Yard datum: everything the kit lays stands on the board plate's deck. */
  const Y = PLATE.rise;

  /* — The gate is held as far off the dock axis AS THE FRONTAGE ALLOWS, and the honest answer is
       "not entirely". A 15 m lot with an 8 m dock zone leaves about 3.6 m of frontage east of
       the bays, and a truck gate is 5.2 m; the two overlap and pretending otherwise puts the
       hanging post outside the boundary.

       r1's 6.6 m gate at a 0.55 m margin was sized against a fence on the plate edge. Moving the
       boundary inboard by a footpath's width took 2.1 m out of the frontage, and the r1 clamp
       resolved with its lower bound ABOVE its upper bound — `clamp` returns the lower bound in
       that case, so the east hanging post would have landed 0.95 m outside the fence, standing
       on the footpath. Narrower and clamped the other way round: the upper bound wins, because
       staying on the parcel is not negotiable and gate width is.

       The leaves also open wider than r1's. An open gate is what a yard with a dock looks like
       during a delivery, and both leaves swinging inward clear the dock elevation. — */
  const gateHalf = 2.60;
  const gateCx = Math.min(halfW - gateHalf - 0.60,
    Math.max(dockCx + dockZoneW / 2 + 0.20, rightX - 2.55));

  /**
   * The board plate goes down FIRST, under everything, on its own datum.
   *
   * Every plate in `_reference-mp/` stands its subject on a thick base with a clean dark
   * chamfered edge; `blind-pair.mjs` flood-fills only the BACKDROP, so the plate survives into
   * the composite as subject geometry and a building on a grey pad against a building on a
   * board piece hands a critic a tell that has nothing to do with either building.
   *
   * ROUND 1'S `plateDrop` FUDGE IS DELETED. It seated the plate 0.12 m down because only two of
   * seventeen yard helpers accepted a `y` and raising the surface would have buried the kerb.
   * All seventeen take one now, so the plate sits where it was designed to sit, the kit is
   * passed `PLATE.rise`, and the building is raised onto the same deck by `raisedContext`.
   */
  emit(ctx, boardPlate(ctx, {
    width: env.lotW - inset * 2, depth: env.lotD - inset * 2, salt: 168,
  }));

  emit(ctx, hardstandSlab(ctx, {
    x: 0, z: 0, width: env.lotW - inset * 2, depth: env.lotD - inset * 2, y: Y,
    mode: env.hardstand, patches: 5, salt: 100,
  }));

  /* — THE PERIMETER, WHICH IS WHERE §2.10 AND HALF OF §2.6 ACTUALLY LIVE.
       r1 ran the fence along the plate edge on black asphalt, so the lot ended in a dark line
       against a dark line and the street plate had no kerb, no footpath and no boundary that
       could continue past a neighbour. Every reference plate does the same three things: a PALE
       PAVED RING outside the fence, a KERB at its outer edge, and the dark plate rim below
       that. The ring is four concrete slabs in `wallAlt` — the palest bucket on the subject —
       so the lot edge is a value step rather than a colour change, and it runs the full width
       of the plate on all four sides so two of these side by side share one continuous line. — */
  const ringOut = 0.03;
  const pave = (w, d, x, z, name) => ctx.push(
    slab(w, 0.05, d, x, Y + 0.015, z, name), p.wallAlt,
  );
  pave(plateHalfW * 2 - ringOut, VERGE_W + 0.30, 0, plateHalfD - (VERGE_W + 0.30) / 2, 'verge-street');
  pave(plateHalfW * 2 - ringOut, VERGE_W, 0, -plateHalfD + VERGE_W / 2, 'verge-rear');
  for (const s of [-1, 1]) {
    pave(VERGE_W, plateHalfD * 2 - (VERGE_W * 2 + 0.30), s * (plateHalfW - VERGE_W / 2),
      -0.15, 'verge-flank');
  }
  // The kerb sits at the OUTER edge of the footpath, where a kerb is, and runs the whole width.
  emit(ctx, kerb(ctx, {
    x1: -plateHalfW, z1: plateHalfD - 0.06, x2: plateHalfW, z2: plateHalfD - 0.06, y: Y, salt: 128,
  }));

  // The apron falls to the dock and carries the paint: one line per bay edge plus a stop line
  // where the trailer's rear axle finishes. Sized to the dock zone, not to the building.
  const apronZ = env.frontZ + env.apronD * 0.36;
  const apronD = env.apronD * 0.72;
  emit(ctx, apron(ctx, {
    x: dockCx, z: apronZ, width: dockZoneW + 1.3, depth: apronD, bays: env.dockBays,
    y: Y, salt: 104,
  }));

  /* — MORE PAINT THAN THE HELPER LAYS. §2b grades "painted bay markings and a stop line", and
       on the first board-altitude plate the helper's two 110 mm lines on grey asphalt were the
       only paint on a 14 × 13 m yard and did not read at all. Paint is the cheapest legible
       thing on a hardstand — a pale value on the darkest surface in the model — so the dock
       approach gets the hatching, the edge lines and the walkway a working yard is marked with.
       All of it is 14 mm proud of the wearing surface, in the light-paint bucket. — */
  const paintY = Y + PAVE;
  const paint = [];
  const paintSlab = (w, d, x, z, name) => paint.push(slab(w, 0.014, d, x, paintY, z, name));
  paintSlab(dockZoneW + 1.0, 0.24, dockCx, env.frontZ + apronD * 0.92, 'apron-stop-line');
  // Keep-clear hatching in front of the two bays: raked bars, not a solid block.
  for (let i = 0; i < 7; i += 1) {
    const hx = dockCx - dockZoneW / 2 + (dockZoneW * i) / 6;
    paint.push(rotBox(0.16, 0.014, 2.30, hx, paintY + 0.007, env.frontZ + 2.95,
      { y: 0.62 }, 'apron-hatch'));
  }
  // Edge lines down both sides of the truck run, from the gate to the stop line.
  for (const s of [-1, 1]) {
    paintSlab(0.13, apronD * 1.05, dockCx + s * (dockZoneW / 2 + 0.55), apronZ + 0.4, 'apron-edge-line');
  }
  // A marked walkway from the personnel door out to the gate, in two lines the way a yard
  // marks one, so the yard has a route through it as well as a surface.
  const walkZ = env.frontZ + 1.15;
  for (const off of [-0.62, 0.62]) {
    paintSlab(Math.abs(gateCx - plantX0) + 1.4, 0.11,
      (gateCx + plantX0) / 2 + 0.2, walkZ + off, 'walkway-line');
  }
  paintSlab(0.11, halfD - walkZ - 1.0, gateCx - 0.62, (walkZ + halfD - 1.0) / 2 + 0.5, 'walkway-line');
  paintSlab(0.11, halfD - walkZ - 1.0, gateCx + 0.62, (walkZ + halfD - 1.0) / 2 + 0.5, 'walkway-line');
  ctx.push(paint, p.trim);

  /* — Asphalt joints across the rear of the yard. `hardstandSlab` in asphalt mode lays patch
       repairs and nothing else, so the far third had no line in it at any scale — the flat grey
       field §2b forbids. Three seams put a grid under the patches for the price of six tris. — */
  for (let i = 0; i < 3; i += 1) {
    ctx.push(slab(halfW * 2 - 0.4, 0.012, 0.06, 0, Y + PAVE - 0.004,
      -halfD + (halfD * 2 * (i + 1)) / 4.6, 'yard-joint'), p.shadow);
  }

  /* — boundary. Palisade to the street because that is the elevation a passer-by touches;
       chain-link with a top rail down the flanks and the rear, which is what a Melbourne yard
       actually does and is a third of the triangles per metre.

       THE GATE AND THE CHAIN-LINK ARE RE-BUCKETED TO `steel`. Both helpers put their frame,
       brace, straining wires and mesh in `trim` — the palest value on the subject — and the r1
       critic measured the two gate leaves at luminance ≥ 228 and named them the brightest
       objects in the plate, against §2.8's "iron is never cream". Every fence and gate in
       `_reference-mp/` is near-black. `emit`'s remap costs nothing, because `steel` is already
       one of the nine. — */
  const IRON = { trim: 'steel' };
  emit(ctx, palisadeFence(ctx, {
    x1: -halfW, z1: halfD, x2: gateCx - gateHalf, z2: halfD, y: Y, salt: 114,
  }));
  emit(ctx, palisadeFence(ctx, {
    x1: gateCx + gateHalf, z1: halfD, x2: halfW, z2: halfD, y: Y, salt: 115,
  }));
  emit(ctx, industrialGate(ctx, {
    x: gateCx, z: halfD - 0.10, width: gateHalf * 2, y: Y,
    openFraction: v.range(216, 0.52, 0.72), salt: 119,
  }), IRON);
  for (const side of [-1, 1]) {
    emit(ctx, chainLinkFence(ctx, {
      x1: side * halfW, z1: halfD - 0.05, x2: side * halfW, z2: -halfD, y: Y,
      salt: 116 + (side > 0 ? 1 : 0),
    }), IRON);
  }
  emit(ctx, chainLinkFence(ctx, {
    x1: -halfW, z1: -halfD, x2: halfW, z2: -halfD, y: Y, salt: 118,
  }), IRON);

  /* — traffic furniture. Bollards guard what a reversing trailer would otherwise hit: the two
       dock corners, the gate jambs and the switchroom. Wheel stops sit where the apron ends. — */
  const bollardSpots = [
    [dockCx - dockZoneW / 2 - 0.55, env.frontZ + 1.05],
    [dockCx + dockZoneW / 2 + 0.55, env.frontZ + 1.05],
    [plantX0 + 0.55, env.frontZ + 1.35],
    [rightX - 0.55, env.frontZ + 1.35],
    // Held a bollard's footing inside the fence line: `bollard` lays a 0.31 m footing, so a
    // spot on the boundary puts the pad through the palisade.
    [Math.max(gateCx - gateHalf - 0.55, -halfW + 0.42), halfD - 1.15],
    [Math.min(gateCx + gateHalf + 0.55, halfW - 0.42), halfD - 1.15],
  ];
  bollardSpots.forEach(([bx, bz], i) => emit(ctx, bollard(ctx, {
    x: bx, z: bz, y: Y, salt: 120 + i,
  })));
  emit(ctx, wheelStop(ctx, {
    x: dockCx - bayPitch / 2, z: env.frontZ + env.apronD * 0.60, y: Y, salt: 126,
  }));
  emit(ctx, wheelStop(ctx, {
    x: dockCx + bayPitch / 2, z: env.frontZ + env.apronD * 0.60, y: Y, salt: 127,
  }));
  // A channel grate across the apron in front of the dock, and a pit out in the yard, because
  // §2b asks for a service pit and a downpipe that lands on a drain rather than on asphalt.
  // The channel is 4.2 m rather than the dock's full width: `serviceGrate` cuts one bar every
  // 100 mm, so a 7 m channel was 948 triangles — a tenth of the ornament budget on a drain.
  emit(ctx, serviceGrate(ctx, {
    x: dockCx, z: env.frontZ + 2.55, width: 4.20, depth: 0.42, y: Y, salt: 130,
  }));
  emit(ctx, serviceGrate(ctx, { x: leftX + 1.4, z: env.frontZ + 6.4, y: Y, salt: 131 }));

  /* — stored goods, which are what say what the shed is FOR (§2b). A dock with nothing near it
       is a modelled hole, so the goods cluster at the dock and thin out toward the boundary. — */
  //
  // THE GOODS ARE SPREAD DOWN THE TWO SIDES OF THE YARD, NOT PILED AT THE WALL, and round 2
  // pushed four of them into the FAR THIRD. r1's own seat report called that third thin and the
  // critic scored curtilage 3.0 partly on it: on a 31 m lot the eleven metres nearest the street
  // carried one crate stack and nothing else, so the composition ran out before the plate did.
  // What keeps the middle clear is the truck: it comes through the gate at +X and swings across
  // to the dock at −X, so that diagonal is the one band nothing stands in.
  emit(ctx, palletStack(ctx, {
    x: leftX + 1.05, z: env.frontZ + 1.55, count: 6, y: Y,
    rotationY: v.range(204, -0.24, 0.24), salt: 136,
  }));
  emit(ctx, palletStack(ctx, {
    x: -halfW + 1.15, z: env.frontZ + 7.20, count: 4, y: Y,
    rotationY: v.range(205, -0.30, 0.30), salt: 142,
  }));
  emit(ctx, palletStack(ctx, {
    x: -halfW + 1.30, z: halfD - 2.40, count: 3, y: Y,
    rotationY: Math.PI / 2 + v.range(218, -0.26, 0.26), salt: 143,
  }));
  emit(ctx, crateStack(ctx, {
    x: Math.max(dockCx - dockZoneW / 2 - 1.35, leftX + 1.55), z: env.frontZ + 3.85,
    columns: 2, rows: 2, y: Y, rotationY: v.range(206, -0.22, 0.22), salt: 164,
  }));
  emit(ctx, crateStack(ctx, {
    x: halfW - 1.55, z: env.frontZ + 9.10, columns: 2, rows: 2, y: Y,
    rotationY: Math.PI / 2 + v.range(212, -0.20, 0.20), salt: 172,
  }));
  emit(ctx, stillage(ctx, {
    x: rightX - 1.05, z: env.frontZ + 3.10, y: Y, rotationY: v.range(207, -0.20, 0.20), salt: 146,
  }));
  emit(ctx, stillage(ctx, {
    x: -halfW + 1.35, z: env.frontZ + 10.35, y: Y,
    rotationY: v.range(213, -0.24, 0.24), salt: 150,
  }));
  emit(ctx, drumCluster(ctx, {
    x: rightX - 2.55, z: env.frontZ + 5.35, count: 5, y: Y, salt: 148,
  }));
  emit(ctx, drumCluster(ctx, {
    x: halfW - 1.45, z: env.frontZ + 6.10, count: 3, y: Y, salt: 154,
  }));
  emit(ctx, drumCluster(ctx, {
    x: halfW - 1.60, z: halfD - 2.15, count: 4, y: Y, salt: 155,
  }));
  emit(ctx, skipBin(ctx, {
    x: -halfW + 2.30, z: env.frontZ + 4.55, y: Y,
    rotationY: v.range(208, -0.14, 0.14), salt: 160,
  }));
  emit(ctx, gasBottleCage(ctx, {
    x: rightX - 1.15, z: env.frontZ + 7.65, y: Y,
    rotationY: Math.PI / 2 + v.range(209, -0.12, 0.12), salt: 162,
  }));

  /* — signage: a street number at the gate, a name-plate on the frontage, a bay number on each
       dock face and a hazard placard on the gas store (§2b lists all four). — */
  emit(ctx, signPlate(ctx, {
    x: Math.min(gateCx + gateHalf + 1.05, halfW - 0.45), y: 1.55, z: halfD - 0.42, groundY: Y,
    width: 0.60, height: 0.60, mount: 'post', kind: 'number', salt: 180,
  }));
  emit(ctx, signPlate(ctx, {
    x: rightX - 1.15, y: 2.05, z: env.frontZ + 7.65 + 0.52, groundY: Y,
    width: 0.46, height: 0.46,
    mount: 'wall', wallPlane: env.frontZ + 7.65 + 0.44, kind: 'hazard', salt: 181,
  }));

  /* — planting is incidental. Weeds at the fence base, and along the footpath joint outside it,
       which is where the reference plates carry theirs. — */
  emit(ctx, weedLine(ctx, {
    x1: -halfW + 0.28, z1: -halfD + 0.42, x2: halfW - 0.28, z2: -halfD + 0.42, y: Y, salt: 186,
  }));
  emit(ctx, weedLine(ctx, {
    x1: -halfW + 0.30, z1: -halfD + 0.6, x2: -halfW + 0.30, z2: halfD - 1.2, y: Y,
    density: 0.24, salt: 188,
  }));
  emit(ctx, weedLine(ctx, {
    x1: halfW - 0.30, z1: env.frontZ + 1.0, x2: halfW - 0.30, z2: halfD - 1.4, y: Y,
    density: 0.22, salt: 190,
  }));
  emit(ctx, weedLine(ctx, {
    x1: -plateHalfW + 0.35, z1: halfD + 0.16, x2: plateHalfW - 0.35, z2: halfD + 0.16,
    y: Y + 0.04, density: 0.20, height: 0.22, salt: 192,
  }));
}

/* ─────────────────────────────────── the wear program ─────────────────────────────────── */

/**
 * Direct the wear (§2c) — the dimension these subjects can actually win.
 *
 * V320 §2.7 records wear as the lowest-scoring dimension in the programme's history and never
 * once above 2.1, on houses, where honest age is subtle. A factory is not subtle. What matters
 * is that every mark goes SOMEWHERE REAL: `dropA` / `dropB` are the coordinates of two fixings
 * this file actually builds, `headY` is the gutter line, `plinthY` is the splash line and
 * `dockZ` is where a trailer stands rather than where the wall is. Uniform dirt is a filter and
 * scores zero, so each bucket gets only the marks its material really carries.
 *
 * `requestWear` amends a whole BUCKET, which is what a nine-bucket contract means.
 */
function directWear(ctx, geom) {
  const { env, p } = ctx;
  const { dropA, dropB, groundY } = geom;
  const gutterY = env.eaveH + groundY + 0.06;
  const bandTop = env.plinthH + groundY + 0.26;
  const trailerZ = env.frontZ + 3.1;
  const common = { dropA, dropB };

  /**
   * ROUND 2 IS A MASK PASS, NOT AN AMPLITUDE PASS, AND THE DISTINCTION IS THE WHOLE JOB.
   *
   * The CORE REPAIR seat raised every ceiling 2–3× and added seven per-mark gains, and said
   * plainly in the same breath that where a mark's MASK is narrow or badly placed, amplitude
   * cannot buy legibility. Read against `texture-atlas.js` rather than against intent, three of
   * r1's eight directives could not have rendered a pixel:
   *
   *   • `ddGrime` is gated to `ddY < ~1.62 m`. Factory CLADDING starts at 2.86 m. r1 asked that
   *     bucket for `grimeBand: 0.95` and the shader could not have drawn any of it. It is 0 here
   *     and the mark is spent on brick and concrete instead, which is where a truck's mirror
   *     actually reaches.
   *   • `ddOxide` needs `ddVertical`, so no amount of `rustBleed` reaches a roof plane. The roof
   *     had `rustBleed: 1.0` and got nothing, while `mossValley: 0.18` — which gates on
   *     `ddUpFace` and on an xz normal pointing away from the sun — could only land on the
   *     ALTERNATING RIB FLANKS of an open pitch, banded at the 6 m period of its own sine. That
   *     is a filter wearing the name of a valley, so moss is off on this bucket; nothing on this
   *     subject has a north valley for it. (Stated carefully, because it is easy to over-claim:
   *     switching moss off did NOT remove every soft dark patch from the roof. What survives
   *     tracks the three cowls and the monitor one-for-one and moves with the sun, so it is
   *     cast shadow from roof furniture at the rig's shadow-map softness, not this program.)
   *   • `ddStation` is a ±0.13 m window around `dropA` / `dropB` measured ALONG the elevation. r1
   *     put `dropB` at x = 1.90, which is inside the second dock opening — a streak with no wall
   *     under it. Both stations are now derived from the frontage's solid spans in
   *     `buildFactory`, so each lands on a pier on the front AND on visible flank at the same
   *     coordinate, and this file bolts a real fixing at both on all four elevations.
   *
   * Gains then go where a mask is honest and narrow: a 0.26 m streak wants depth, not width.
   */

  // Profiled sheet. This is the mark the reference pack leads with: oxide out of the gutter
  // joint at the two stations, running three metres down a pale wall. Grime is off — see above.
  requestWear(p.cladding, {
    ...common, headY: gutterY,
    rustBleed: 1.0, rustGain: 2.8,
    grimeBand: 0.0,
    chalk: 0.85, chalkGain: 1.7,
    mossValley: 0.0, saltBloom: 0.0,
  });
  // Brick base, 0.14–2.74 m: the one surface on the subject the grime band lands squarely on,
  // and the only one salt bloom can rise out of. The joint that bleeds here is the flashing at
  // the top of the base rather than the eaves, so `headY` is the band course.
  requestWear(p.wall, {
    ...common, headY: bandTop,
    rustBleed: 0.85, rustGain: 2.2,
    /* — GRIME IS HELD AT 1.3, AND THE CEILING IS NOT THE REASON.
         `ddGrime` modulates along the elevation by `pow(sin(ddAlong * 2.6 + seed), 2)`, which is
         a 2.4 m period. At gain 2.1 the flank plate came back with a row of dark circles down
         the brick base at even 2.4 m spacing — legible, directed nowhere, and unmistakably a
         function rather than weather. §2c scores that at zero, and the r1 critic's whole
         complaint about wear was that the marks read as a render artefact. So the periodic mark
         stays under the threshold where its rhythm shows, and the depth goes into the marks that
         have a PLACE: the oxide at the two fixing stations, and the tyre and oil at the dock. — */
    grimeBand: 1.0, grimeGain: 1.3,
    // 1.4 rather than the 2.6 this pass first carried. Salt bloom ADDS light, and at 2.6 on a
    // 2.6 m brick base the lift and the grime band together made the base read as blotched
    // rather than weathered. Efflorescence is a tide, and a tide has one edge.
    saltBloom: 1.0, saltGain: 1.4, plinthY: groundY + 0.85,
    chalk: 0.30, mossValley: 0.0,
  });
  // Concrete: the dock platform face, the band course, the lintels, the perimeter footpath and
  // every footing. The platform face is 1.05 m of pale concrete directly under a trailer, so it
  // takes the splash line, the scrub and the tide, and almost no oxide.
  requestWear(p.wallAlt, {
    ...common, headY: bandTop,
    rustBleed: 0.50, rustGain: 1.8,
    grimeBand: 1.0, grimeGain: 1.4,
    saltBloom: 1.0, saltGain: 1.5, plinthY: groundY + 0.95,
    chalk: 0.22,
    tyreScrub: 0.70, tyreGain: 1.8, oilBloom: 0.55, oilGain: 1.6, dockZ: trailerZ,
  });
  // The apron. Tyre scrub arcs and an oil bloom in front of the bays, and NOTHING at the back
  // of the yard — the clean far corner is what makes the near corner read as used.
  requestWear(p.ground, {
    tyreScrub: 1.0, tyreGain: 2.2, oilBloom: 1.0, oilGain: 1.9,
    grimeBand: 0.0, saltBloom: 0.30,
    dockZ: trailerZ, horizontalOnly: true,
  });
  // Structural steel, the stack, the fences, the shutters and the roof. Oxide is the whole
  // story and the stations are the base plates and the ladder ties this file bolts to the wall.
  //
  // `shadowFloor` is raised from 0.030 to 0.048 because this bucket owns the dock reveals, and
  // the r1 critic measured the plate's minimum luminance at 1.5 inside them against the
  // reference's 7.7. §2.9 prohibits crush as hard as it prohibits blowout; a dock opening has to
  // stay a readable dark rather than become a hole.
  requestWear(p.steel, {
    ...common, headY: gutterY,
    rustBleed: 1.0, rustGain: 2.6,
    grimeBand: 0.70, grimeGain: 1.2, plinthY: groundY + 0.55,
    chalk: 0.12, saltBloom: 0.35,
    tyreScrub: 0.0, oilBloom: 0.0, mossValley: 0.0,
    shadowFloor: 0.048,
  });
  // Light paint chalks hardest, because it is the thing on the building with pigment in it.
  requestWear(p.trim, {
    ...common, headY: gutterY,
    rustBleed: 0.95, rustGain: 2.4,
    grimeBand: 0.85, grimeGain: 1.3, plinthY: groundY + 0.60,
    chalk: 1.0, chalkGain: 1.6,
    saltBloom: 0.20,
  });
  // Glazing: grime only, and it is a factory roof light so there is a lot of it.
  requestWear(p.glass, {
    ...common, headY: gutterY, grimeBand: 1.0, grimeGain: 1.4, rustBleed: 0.34, chalk: 0.0,
    shadowFloor: 0.022,
  });
  // Timber in a yard greys and gets forklift-marked at deck height.
  requestWear(p.goods, { grimeBand: 0.70, grimeGain: 1.6, chalk: 0.34, saltBloom: 0.0 });
}

/* ───────────────────────────────────── the builder ────────────────────────────────────── */

/**
 * `factory-light` — light-industrial process plant.
 *
 * Order of construction is the order the thing is built in, and that is not decoration: the
 * shell has to know where its openings are before the openings are filled, and the yard has to
 * know where the dock is before the paint goes on the ground.
 */
function buildFactory(rootCtx) {
  // THE BUILDING IS RAISED ONTO THE BOARD PLATE'S DECK HERE, ONCE. Everything below is authored
  // with its ground at y = 0 and lands at y = GROUND. See `raisedContext`.
  const ctx = raisedContext(rootCtx, GROUND);
  const { env, p, v } = ctx;
  const { bodyW, bodyD, frontZ, backZ, eaveH, plinthH } = env;
  const leftX = -bodyW / 2;
  const rightX = bodyW / 2;
  const midZ = (frontZ + backZ) / 2;

  /* — 1. the three pieces (§2.1 blank-wall articulation) — */
  const plantW = clamp(bodyW * 0.27, 2.85, 3.35);
  const plantX0 = rightX - plantW;
  const plantCx = rightX - plantW / 2;
  const plantZBack = backZ + COMPOUND_D;
  const hallW = plantX0 - leftX;
  const hallCx = leftX + hallW / 2;
  const dockCx = hallCx;
  const bandY = plinthH;
  const bandH = 0.26;
  const bandTop = bandY + bandH;

  /* — 1b. THE DOCK APERTURE, DERIVED FROM WHAT THE FRONTAGE HAS LEFT.
         r1 authored 3.00 × 3.90 with a 0.70 m pier and the critic measured both against
         `mp-factory-dock`: aperture 0.75 where the reference is 0.89, pier 1.5 % of frame where
         the reference is 6 %. Fixing that by editing two constants would have worked on façade
         0 and spilled the platform past the shell on façade 3, because `bodyW` carries a ±1.6 %
         jitter and the plant end takes 27 % of it. So the leaf is what is left after the centre
         pier and the two end piers, clamped, and the clear height follows from `DOOR_RATIO`. — */
  const doorW = clamp((hallW - PIER_W - END_PIER_W * 2) / 2, 2.70, 3.30);
  const doorH = doorW / DOOR_RATIO;
  const bayPitch = doorW + PIER_W;
  const dockZoneW = Math.min(hallW - 0.10, bayPitch + doorW + 0.80);

  /* — 1c. THE TWO WEAR STATIONS, PICKED OFF THE FRONTAGE RATHER THAN OUT OF THE AIR.
         `texture-atlas.js` stations its oxide streak at `dropA` / `dropB` measured ALONG
         whichever elevation a fragment sits on — z on the ±X faces, x on the ±Z faces — inside a
         window of about ±0.13 m. So a station is only worth having if it is SOLID WALL on the
         front and INSIDE the flank's z range at the same number, and r1's `dropB` at x = 1.90
         was neither: it fell inside the second dock opening. These two are the centre pier
         between the bays and the west end pier, both solid on every façade by construction, and
         both inside [backZ, frontZ] so the flanks get the same two streaks. Every one of them
         has a downpipe, a pipe leg or a vent bracket built at it below. — */
  const dropA = dockCx;
  const dropB = leftX + END_PIER_W * 0.5;

  const geom = {
    leftX, rightX, plantX0, plantCx, hallCx, hallW, dockCx, plantZBack,
    doorW, doorH, bayPitch, dockZoneW, dropA, dropB, groundY: GROUND,
  };

  /* — 2. footing and masonry base. The base is the §2d "masonry base" line and it is what the
         cladding stops on; the band course is the flashing the oxide bleeds out of. — */
  ctx.push(slab(bodyW + 0.34, 0.30, bodyD + 0.34, 0, -0.06, midZ, 'footing'), p.wallAlt);
  // Bay centres. `bayPitch` is centre-to-centre, so the two bays straddle the hall centreline
  // at ± half of it. (The first draft multiplied it instead, which put the bays 7.4 m apart on
  // an 8.5 m hall and pushed the platform, its steps and the bumpers through the boundary
  // fence — measured at |x| = 7.36 on a lot whose fence line is 7.15.)
  const bayX = [dockCx - bayPitch / 2, dockCx + bayPitch / 2];
  // Openings that interrupt the base: the two dock shutters (their sills are at DOCK_FLOOR,
  // below the band) and the personnel door on the plant frontage.
  const shutterHoles = bayX.map((bx) => [bx - doorW / 2 - 0.14, bx + doorW / 2 + 0.14]);
  const personnelHole = [plantCx - 1.30, plantCx - 0.28];
  // The mass of the base, held back from the frontage so the front skin can be built around
  // its openings — V320 §2.3: an opening is a hole in a wall, so the wall has to stop at it.
  ctx.push(slab(bodyW, plinthH, bodyD - 0.36, 0, 0, midZ - 0.18, 'base-core'), p.wall);
  // Front skin, below the shutter sills: solid except where the personnel door goes through.
  for (const [a, b] of solidSpans(leftX, rightX, [personnelHole])) {
    ctx.push(slab(b - a, DOCK_FLOOR, 0.36, (a + b) / 2, 0, frontZ - 0.18, 'base-front-low'), p.wall);
  }
  // Front skin, from the sills to the band: the piers between all three openings.
  for (const [a, b] of solidSpans(leftX, rightX, [...shutterHoles, personnelHole])) {
    ctx.push(slab(b - a, plinthH - DOCK_FLOOR, 0.36, (a + b) / 2, DOCK_FLOOR, frontZ - 0.18,
      'base-front-pier'), p.wall);
  }
  /* — Band course: a projecting precast string the cladding lands on.
       IT IS BUILT AS SPANS ON THE FRONTAGE, and that is a construction-logic repair rather than
       a refinement. r1 laid it as one box the size of the whole body, so a 260 mm pale precast
       string ran STRAIGHT ACROSS BOTH DOCK OPENINGS at 2.60 m — visible on the r2 dock plate as
       a light band through the middle of two shutters, which is the "string course crossing an
       opening" case V320 §2.2 names outright. The three other elevations are unbroken at this
       height and stay single runs. — */
  for (const [a, b] of solidSpans(leftX, rightX, shutterHoles)) {
    ctx.push(slab(b - a, bandH, 0.36, (a + b) / 2, bandY, frontZ + 0.06, 'band-course-front'),
      p.wallAlt);
  }
  ctx.push(slab(bodyW + 0.16, bandH, 0.36, 0, bandY, backZ - 0.06, 'band-course-rear'), p.wallAlt);
  for (const s of [-1, 1]) {
    ctx.push(slab(0.36, bandH, bodyD - 0.30, s * (bodyW / 2 + 0.06), bandY, midZ,
      'band-course-flank'), p.wallAlt);
  }

  /* — 3. the hall shell. Cladding is built as the SPANS BETWEEN the openings so an opening is
         a hole in a wall rather than a dark card on a plane (V320 §2.3). — */
  const headY = DOCK_FLOOR + doorH + 0.55;   // above the shutter hoods
  // Frontage, from the band to the shutter heads: piers only.
  for (const [a, b] of solidSpans(leftX, plantX0, shutterHoles)) {
    claddingRun(ctx, {
      side: '+z', along0: a, along1: b, y0: bandTop, y1: headY, plane: frontZ, name: 'hall-front-pier',
    });
  }
  // Frontage, above the heads: one continuous run across the whole hall.
  claddingRun(ctx, {
    side: '+z', along0: leftX, along1: plantX0, y0: headY, y1: eaveH, plane: frontZ, name: 'hall-front-head',
  });
  // Rear elevation, and the two flanks. The +X flank is only clad above the plant roof, because
  // below that it is inside the plant bay: reclaim before you spend (V320 §6.5).
  claddingRun(ctx, {
    side: '-z', along0: leftX, along1: rightX, y0: bandTop, y1: eaveH, plane: backZ, name: 'rear',
  });
  claddingRun(ctx, {
    side: '-x', along0: backZ, along1: frontZ, y0: bandTop, y1: eaveH, plane: leftX, name: 'hall-flank-w',
  });
  claddingRun(ctx, {
    side: '+x', along0: plantZBack, along1: frontZ, y0: PLANT_H, y1: eaveH, plane: plantX0,
    name: 'hall-flank-e-high',
  });
  claddingRun(ctx, {
    side: '+x', along0: backZ, along1: plantZBack, y0: bandTop, y1: eaveH, plane: plantX0,
    name: 'hall-flank-e-low',
  });
  /* — Corner flashings. A shed's corner is a folded capping, and without it two sheets meet in a
       seam that reads as a modelling error at every distance.
       THEY ARE DARK. In `trim` a 0.18 m capping running the full 5.5 m of every corner is five
       white columns down an olive elevation, and on the first r2 plate the plant's front corner
       was the loudest object on the building. The reference's corner cappings are the same value
       as its gutters and darker than its cladding, so the corner reads as an edge rather than as
       a highlight. — */
  for (const [cx, cz] of [[leftX, frontZ], [leftX, backZ], [plantX0, backZ], [rightX, frontZ], [rightX, backZ]]) {
    ctx.push(box(0.15, eaveH - bandTop, 0.15, cx, (bandTop + eaveH) / 2, cz, 'corner-flashing'), p.steel);
  }

  /* — 4. the roof (§2d) — */
  const roof = northLitRoof(ctx, {
    x0: leftX, x1: plantX0, zFront: frontZ, zBack: backZ, yBase: eaveH,
    mode: env.roofMode, teeth: env.teeth, rise: env.roofRise,
  });
  p1RoofBreakers(ctx, {
    x: (leftX + plantX0) / 2,
    z0: backZ,
    z1: frontZ,
    width: Math.max(4, plantX0 - leftX),
    yAt: () => eaveH + env.roofRise * 0.38,
    ridgeZ: env.roofMode === 'sawtooth' ? null : backZ + 0.4,
    ridgeY: roof.crown,
    name: 'p1-roof',
    salt: 240,
  });
  /* — Eaves gutter and THREE downpipes, one at each wear station on each elevation that has a
       gutter. Both land on a drain — `gutterAndDownpipe` emits the drain because a shoe pointing
       at bare asphalt is the same defect one step further down.

       THE STATIONS ARE THE POINT. §2.7 scores an oxide streak with no fixing above it as a
       texturing bug, so `dropB` (the west end pier) takes the frontage's downpipe and `dropA`
       (the centre pier between the two bays) takes a second one running from the canopy gutter,
       which is where a real dock sheds its canopy water. The flank gutter drops at the same two
       numbers in z. — */
  emit(ctx, gutterAndDownpipe({
    x: hallCx, y: eaveH + 0.10, z: frontZ + 0.18, runLength: hallW, axis: 'x',
    dropAt: dropB, wallPlane: frontZ, name: 'front-rainwater',
  }));
  emit(ctx, gutterAndDownpipe({
    x: leftX - 0.18, y: eaveH + 0.10, z: midZ, runLength: bodyD * 0.94, axis: 'z',
    dropAt: dropB, wallPlane: leftX, facing: -1, name: 'flank-rainwater',
  }));
  // The flank's second fixing, at `dropA`: a bracketed pipe stub off the wall rather than a
  // second full gutter, because one elevation only has one eave to drain.
  ctx.push(cyl(0.075, eaveH - 1.30, leftX - 0.16, (eaveH - 1.30) / 2 + 0.16, dropA, 'y',
    'flank-station-pipe', 8), p.trim);
  for (const cy of [1.35, 3.60, 5.85]) {
    ctx.push(box(0.30, 0.08, 0.09, leftX - 0.08, cy, dropA, 'flank-station-collar'), p.steel);
  }
  ctx.push(slab(0.46, 0.08, 0.46, leftX - 0.16, 0.02, dropA, 'flank-station-drain'), p.wallAlt);

  /* — 4b. THE REAR ELEVATION, which V320 §2.1 grades as hard as the frontage.
       "No elevation may be a large undifferentiated plane… The board shows isolated buildings as
       well as rows, so a terrace cannot rely on neighbours to hide a flank it never modelled."
       On the first flank plate the rear was 11.6 × 5.5 m of ribbed sheet over brick with nothing
       whatever on it — the front and the west flank had taken all the ornament. A shed's back
       carries the things nobody puts on a frontage: extract louvres, a fire exit, a rainwater
       head, roof vents and the expressed frame. — */
  if (env.roofMode === 'sawtooth') {
    // The sawtooth's back is its low end, so the gutter belongs here; a mono's back is its high
    // side and sheds forward, so it gets a rainwater head rather than a full run.
    emit(ctx, gutterAndDownpipe({
      x: 0, y: eaveH + 0.10, z: backZ - 0.16, runLength: bodyW * 0.92, axis: 'x',
      dropAt: dropA, wallPlane: backZ, facing: -1, name: 'rear-rainwater',
    }));
  } else {
    ctx.push(box(0.52, 0.44, 0.34, dropA, eaveH - 0.30, backZ - 0.18, 'rear-rainwater-head'), p.trim);
    ctx.push(cyl(0.065, eaveH - 0.65, dropA, (eaveH - 0.55) / 2, backZ - 0.20, 'y',
      'rear-downpipe', 8), p.trim);
    ctx.push(slab(0.44, 0.07, 0.44, dropA, 0.02, backZ - 0.34, 'rear-drain'), p.wallAlt);
  }
  /* — LOUVRES ARE DARK. The helper puts its blades in `trim`, and on the r1 and r2 plates six
       pale screens read as white venetian blinds stuck to an olive wall — the single loudest
       ornament on the elevation, in a bucket §2.8 reserves for paint. A louvred plant screen is
       a dark grille on every reference plate; the blade shading carries the rhythm without the
       value. Same one-key remap as the gate and the chain-link. — */
  const GRILLE = { trim: 'steel' };
  for (let i = 0; i < 2; i += 1) {
    emit(ctx, louvreScreen({
      x: leftX + bodyW * (0.26 + i * 0.34), y: 5.65, z: backZ - 0.04,
      width: 1.35, height: 1.45, facing: -1, name: `rear-louvre-${i}`,
    }), GRILLE);
  }
  personnelDoor(ctx, { x: leftX + bodyW * 0.13, z: backZ - 0.02, facing: -1, name: 'rear-exit' });
  // Expressed frame on the back too, so the structure reads all the way round the shed.
  for (const cx of [leftX + bodyW * 0.30, leftX + bodyW * 0.68]) {
    ctx.push(box(0.22, eaveH - 0.30, 0.30, cx, (eaveH - 0.30) / 2, backZ - 0.17, 'rear-column'), p.steel);
    ctx.push(slab(0.56, 0.09, 0.56, cx, 0.04, backZ - 0.17, 'rear-column-baseplate'), p.steel);
    ctx.push(slab(0.78, 0.22, 0.78, cx, -0.18, backZ - 0.17, 'rear-column-footing'), p.wallAlt);
  }
  // Two extract stacks off the back wall, capped, on their own brackets — AT THE TWO WEAR
  // STATIONS, so the rear elevation's oxide streaks have the same kind of fixing over them that
  // the front and the flanks do.
  for (const vx of [dropA, dropB]) {
    ctx.push(cyl(0.13, 4.10, vx, eaveH - 1.55, backZ - 0.42, 'y', 'rear-vent', 8), p.steel);
    ctx.push(taper(0.22, 0.06, 0.30, vx, eaveH + 0.55, backZ - 0.42, 'rear-vent-cowl', 8), p.steel);
    for (const vy of [eaveH - 3.1, eaveH - 0.6]) {
      ctx.push(box(0.09, 0.09, 0.40, vx, vy, backZ - 0.24, 'rear-vent-bracket'), p.steel);
    }
  }

  /* — 5. the plant end and its compound (§2d annex: plant / substation) — */
  ctx.push(slab(plantW, PLANT_H - bandTop, frontZ - plantZBack, plantCx, bandTop,
    (frontZ + plantZBack) / 2, 'plant-core'), p.cladding);
  claddingRun(ctx, {
    side: '+z', along0: plantX0, along1: rightX, y0: bandTop, y1: PLANT_H, plane: frontZ, name: 'plant-front',
  });
  claddingRun(ctx, {
    side: '+x', along0: plantZBack, along1: frontZ, y0: bandTop, y1: PLANT_H, plane: rightX, name: 'plant-flank',
  });
  claddingRun(ctx, {
    side: '-z', along0: plantX0, along1: rightX, y0: bandTop, y1: PLANT_H, plane: plantZBack, name: 'plant-rear',
  });
  // Plant roof: a shallow fall to the flank with a fascia, cowls and a condenser bank on it.
  ctx.push(skillion(plantW + 0.30, 0.16, plantCx, plantX0, PLANT_H + 0.22, rightX, PLANT_H - 0.02,
    'plant-roof'), p.cladding);
  // Fascia dark, gutter pale: the fascia is a 3.4 m board across the plant's whole frontage and
  // in `trim` it was a white bar under the roof edge; the gutter beside it is a 0.16 m line and
  // is exactly the kind of small pale accent §2.5 wants ornament to be.
  ctx.push(slab(plantW + 0.34, 0.20, 0.22, plantCx, PLANT_H - 0.04, frontZ + 0.12, 'plant-fascia'), p.steel);
  ctx.push(slab(0.16, 0.18, frontZ - plantZBack, rightX + 0.12, PLANT_H - 0.08, (frontZ + plantZBack) / 2,
    'plant-gutter'), p.trim);
  roofCowl(ctx, { x: plantCx - 0.55, y: PLANT_H + 0.16, z: frontZ - 2.05, radius: 0.42, name: 'plant-cowl-a' });
  roofCowl(ctx, { x: plantCx + 0.35, y: PLANT_H + 0.12, z: frontZ - 4.65, radius: 0.42, name: 'plant-cowl-b' });
  condenserUnit(ctx, { x: plantCx, y: PLANT_H + 0.32, z: frontZ - 7.30, width: plantW - 0.70 });
  // A guard rail round the plant roof, which is what the external stair arrives at. r1 landed
  // the stair on a bare deck — a stair to an unguarded roof is the §2.2 case one storey up.
  for (const [rx, rz, rw, rd] of [
    [plantCx, frontZ + 0.02, plantW + 0.20, 0.06],
    [plantX0 + 0.05, (frontZ + plantZBack) / 2, 0.06, frontZ - plantZBack],
  ]) {
    ctx.push(box(rw, 0.06, rd, rx, PLANT_H + 1.05, rz, 'plant-guard-rail'), p.steel);
    ctx.push(box(rw, 0.05, rd, rx, PLANT_H + 0.62, rz, 'plant-guard-rail'), p.steel);
  }
  for (let i = 0; i < 4; i += 1) {
    ctx.push(box(0.07, 1.05, 0.07, plantX0 + 0.05 + (plantW - 0.10) * (i / 3), PLANT_H + 0.55,
      frontZ + 0.02, 'plant-guard-post'), p.steel);
  }

  // Louvred plant screens — §2a names them, and they are the one opening type a plant room has.
  for (let i = 0; i < 2; i += 1) {
    emit(ctx, louvreScreen({
      x: plantCx + (i === 0 ? -0.72 : 0.72), y: 3.55, z: frontZ + 0.04,
      width: 1.16, height: 1.55, name: `plant-louvre-front-${i}`,
    }), GRILLE);
  }
  emit(ctx, louvreScreen({
    x: rightX + 0.04, y: 3.40, z: frontZ - 3.10, width: 2.10, height: 1.70,
    name: 'plant-louvre-flank',
  }), GRILLE);
  // The flank screen is built in the ±Z plane by the helper, so it is turned by hand: the helper
  // has no axis argument and adding one is a core edit this lane does not own.
  // (The screen above is authored at the flank plane and reads as a return; a second run on the
  // hall's west flank gives that elevation the same relief.)
  for (let i = 0; i < 3; i += 1) {
    emit(ctx, louvreScreen({
      x: leftX - 0.02, y: 6.15, z: frontZ - 2.4 - i * 3.35, width: 1.05, height: 1.20,
      name: `hall-louvre-${i}`,
    }), GRILLE);
  }
  // The works office: two industrial windows on the west flank at the dock end. Until these
  // went in, the only glass on the subject was the roof lights and two door vision panels, so
  // V320 §2.3 — reveal, head, sill, joinery of a different value, a pane with a shadow board
  // behind it — had nothing on a WALL to be graded on. A shed has an office at the dock end
  // because that is where the paperwork meets the truck.
  for (let i = 0; i < 2; i += 1) {
    glazedOpening(ctx, {
      axis: 'z', centre: frontZ - 1.15 - i * 2.55, y: 4.15, width: 1.95, height: 1.55,
      plane: leftX, facing: -1, name: `office-window-${i}`,
    });
  }

  // The compound at the rear of the plant end: dwarf wall, coping, substation, condensers.
  ctx.push(slab(plantW + 0.06, COMPOUND_WALL_H, 0.34, plantCx, 0, plantZBack - 0.17,
    'compound-wall-n'), p.wall);
  ctx.push(slab(0.34, COMPOUND_WALL_H, plantZBack - backZ, rightX - 0.17, 0,
    (plantZBack + backZ) / 2, 'compound-wall-e'), p.wall);
  ctx.push(moulding(plantW + 0.06, 0.20, plantCx, COMPOUND_WALL_H, plantZBack - 0.17, 'x',
    COPING_PROFILE, 'compound-coping-n'), p.wallAlt);
  ctx.push(moulding(plantZBack - backZ, 0.20, rightX - 0.17, COMPOUND_WALL_H,
    (plantZBack + backZ) / 2, 'z', COPING_PROFILE, 'compound-coping-e'), p.wallAlt);
  // Substation cabinet, on its own plinth, with a louvred face and a warning plate.
  const subX = plantX0 + 0.85;
  const subZ = plantZBack - 1.35;
  ctx.push(slab(1.55, 0.22, 1.05, subX, 0, subZ, 'substation-plinth'), p.wallAlt);
  ctx.push(slab(1.32, 1.85, 0.86, subX, 0.22, subZ, 'substation-case'), p.trim);
  ctx.push(slab(1.44, 0.13, 0.98, subX, 2.07, subZ, 'substation-lid'), p.steel);
  emit(ctx, louvreScreen({
    x: subX, y: 1.05, z: subZ + 0.44, width: 1.00, height: 0.86, blade: 0.11, name: 'substation-louvre',
  }), GRILLE);
  condenserUnit(ctx, {
    x: plantCx + 0.30, y: 0.42, z: backZ + 1.55, width: 1.55, depth: 1.05, name: 'yard-condenser',
  });

  /* — 6. the dock (§2d: TWO bays) — */
  const platformW = dockZoneW;
  const platformZ = frontZ + PLATFORM_D / 2;
  ctx.push(slab(platformW, DOCK_FLOOR, PLATFORM_D, dockCx, 0, platformZ, 'dock-platform'), p.wallAlt);
  ctx.push(slab(platformW + 0.12, 0.08, PLATFORM_D + 0.06, dockCx, DOCK_FLOOR - 0.08, platformZ,
    'dock-nosing'), p.wallAlt);
  ctx.push(slab(platformW + 0.14, 0.05, 0.12, dockCx, DOCK_FLOOR - 0.05, frontZ + PLATFORM_D,
    'dock-edge-angle'), p.steel);
  // A poured concrete standing area in front of the platform, before the asphalt starts.
  //
  // Two reasons, and the second is why it is here rather than in the yard: a dock apron IS
  // concrete because asphalt creeps under a trailer leg, and — V320 §2.9 — the factory's yard
  // is asphalt by the kit's own material identity, so the dock zone was the darkest surface in
  // the model sitting under the darkest object in it (a dark canopy on dark shutters). The
  // whole bay read as one crushed mass on the first board plate. A pale slab under it puts a
  // mid-value back into the one place the product contract is graded from.
  ctx.push(slab(platformW + 1.30, 0.10, 2.35, dockCx, PAVE - 0.08, frontZ + PLATFORM_D + 1.16,
    'dock-standing-slab'), p.wallAlt);
  ctx.push(slab(platformW + 1.30, 0.02, 0.10, dockCx, PAVE, frontZ + PLATFORM_D + 2.33,
    'dock-slab-joint'), p.shadow);
  for (let i = 0; i < env.dockBays; i += 1) {
    const bx = bayX[i] ?? dockCx;
    const openFraction = i === 1 ? v.range(210, 0.44, 0.62) : 0;
    // THE SHUTTER TAKES THE DARK PAINT. `rollerDoor` routes its curtain, laths and hood to
    // `trim`, which is the pale bucket — correct for a gutter, wrong for a roller door. On the
    // first plate two pale shutters on pale sheet collapsed the whole frontage into one value,
    // which is exactly what V320 §2.8 fails: "value separation before hue". Every shutter in
    // the reference pack is near-black. Re-bucketing costs nothing, because `steel` is already
    // paid for; the lintel and jamb returns stay in the masonry value so the reveal still reads.
    emit(ctx, rollerDoor({
      x: bx, yBase: DOCK_FLOOR, z: frontZ, width: doorW, height: doorH, reveal: 0.34,
      openFraction, name: `dock-${i}`,
    }), { trim: 'steel', steel: 'steel', shadow: 'shadow', wallAlt: 'wallAlt' });
    /* — Behind a part-open shutter there has to be something, or the bay is a black hole.
         r1 put racking behind the open bay and the critic still read it as a flat dark plane,
         and the reason is measurable rather than aesthetic: `base-core` is SOLID MASONRY to
         2.60 m, so anything sited "inside the shed" below that height is buried in brick and
         renders nothing. A roller door open 30–52 % shows its TOP, from about 2.5 m to the head
         at 4.4 m — the one band r1's racking did not occupy.
         So the interior is composed against the opening that actually exists: a dark board that
         stops the eye seeing straight through to the far cladding, two rack frames inside the
         visible window, and a load on the beam. `mp-factory-dock` does the same thing with a
         half-raised shutter onto racking, and it is the single strongest thing in that plate. — */
    if (openFraction > 0.2) {
      const sillY = DOCK_FLOOR + doorH * (1 - openFraction);
      const headTop = DOCK_FLOOR + doorH;
      const openH = headTop - sillY;
      const midY = (sillY + headTop) / 2;
      ctx.push(box(doorW + 0.24, openH + 0.60, 0.12, bx, midY, frontZ - 1.62,
        `dock-${i}-interior-board`), p.shadow);
      for (const s of [-1, 1]) {
        ctx.push(box(0.10, openH + 0.50, 0.10, bx + s * (doorW / 2 - 0.34), midY, frontZ - 1.05,
          'dock-rack-upright'), p.steel);
      }
      for (const ry of [0.26, openH - 0.30]) {
        ctx.push(box(doorW - 0.58, 0.11, 0.09, bx, sillY + ry, frontZ - 1.05,
          'dock-rack-beam'), p.steel);
      }
      ctx.push(box(doorW - 0.86, openH * 0.40, 0.86, bx, sillY + openH * 0.30, frontZ - 1.22,
        'dock-rack-load'), p.goods);
      ctx.push(box(doorW - 1.05, openH * 0.26, 0.72, bx + 0.10, headTop - openH * 0.22,
        frontZ - 1.20, 'dock-rack-load-upper'), p.goods);
    }
    for (const s of [-1, 1]) {
      emit(ctx, dockBumper({
        x: bx + s * (doorW / 2 + 0.30), y: 0.70, z: frontZ + PLATFORM_D, height: 0.50,
        name: `dock-${i}-bumper`,
      }));
    }
    emit(ctx, signPlate(ctx, {
      x: bx, y: 0.56, z: frontZ + PLATFORM_D + 0.05, width: 0.40, height: 0.44,
      mount: 'wall', wallPlane: frontZ + PLATFORM_D, kind: 'bay', salt: 182 + i,
    }));
  }
  // Steps off the platform at the west end, with a rail — a dock is worked on foot as well.
  // Held inboard of the boundary: at `platformW / 2 + 0.62` the flight measured |x| = 7.36 on a
  // lot whose fence line is 7.15, so the steps came through the palisade.
  const stepX = Math.max(dockCx - platformW / 2 - 0.62, leftX - 0.42);
  for (let i = 0; i < 5; i += 1) {
    ctx.push(slab(1.05, DOCK_FLOOR / 5, 0.28, stepX, (DOCK_FLOOR * i) / 5,
      frontZ + PLATFORM_D - 0.30 - i * 0.28, 'dock-step'), p.wallAlt);
  }
  for (const s of [-1, 1]) {
    ctx.push(box(0.05, 1.02, 1.60, stepX + s * 0.50, DOCK_FLOOR * 0.60, frontZ + PLATFORM_D - 0.70,
      'dock-step-rail'), p.steel);
  }
  // The canopy over both bays: a ribbed falling plate on diagonal stays, with a fascia and a
  // pale drip edge. Sat at +1.05 m over the shutter heads on the first plate it read as a shelf
  // floating clear of the building with a metre of blank wall under it; the reference canopies
  // sit tight over the hoods, which is also where a canopy that is meant to keep rain off a
  // trailer bed actually goes.
  const canopyY = DOCK_FLOOR + doorH + 0.78;
  const canopyOut = frontZ + 1.52;
  ctx.push(skillion(platformW + 0.50, 0.12, dockCx, frontZ + 0.06, canopyY, canopyOut, canopyY - 0.30,
    'dock-canopy'), p.steel);
  const canopyLen = Math.hypot(canopyOut - frontZ - 0.06, 0.30);
  ctx.push(corrugatedPanel({
    width: platformW + 0.46, height: canopyLen, x: dockCx,
    y: canopyY - 0.09, z: (frontZ + 0.06 + canopyOut) / 2,
    euler: { x: Math.atan2(0.30, canopyOut - frontZ - 0.06) - Math.PI / 2 }, name: 'dock-canopy-sheet',
  }), p.steel);
  ctx.push(slab(platformW + 0.56, 0.26, 0.16, dockCx, canopyY - 0.46, canopyOut, 'dock-canopy-fascia'), p.steel);
  ctx.push(slab(platformW + 0.60, 0.07, 0.20, dockCx, canopyY - 0.22, canopyOut, 'dock-canopy-drip'), p.trim);
  for (let i = 0; i < 4; i += 1) {
    const sx = dockCx - platformW / 2 + (platformW * i) / 3;
    const stay = memberBetween(sx, canopyY + 1.10, frontZ + 0.10, sx, canopyY - 0.26, canopyOut - 0.12,
      0.045, 'dock-canopy-stay');
    if (stay) ctx.push(stay, p.steel);
    ctx.push(box(0.20, 0.20, 0.09, sx, canopyY + 1.10, frontZ + 0.06, 'dock-canopy-stay-plate'), p.steel);
  }
  /* — The centre pier is wear station `dropA`, so it carries a real fixing rather than a bare
       streak: the dock's services drop. A conduit from the canopy soffit down to an isolator on
       the pier, on collars, with the bulkhead light it feeds under the canopy. §2a lists cable
       trays and conduit as factory ornament, and this is the one place on the frontage where
       everything a dock needs — light, isolator, a switch a driver can reach — is grouped.
       It starts at the canopy and ends at a box, which is §2.2 satisfied at both ends. — */
  const dropRunTop = canopyY - 0.42;
  const dropRunBase = DOCK_FLOOR + 0.85;
  ctx.push(cyl(0.055, dropRunTop - dropRunBase, dropA, (dropRunTop + dropRunBase) / 2,
    frontZ + 0.13, 'y', 'dock-conduit', 8), p.steel);
  for (const cy of [dropRunBase + 0.55, dropRunTop - 0.55]) {
    ctx.push(box(0.20, 0.06, 0.08, dropA, cy, frontZ + 0.09, 'dock-conduit-collar'), p.steel);
  }
  ctx.push(box(0.42, 0.56, 0.20, dropA, dropRunBase - 0.22, frontZ + 0.14, 'dock-isolator'), p.trim);
  ctx.push(box(0.10, 0.14, 0.09, dropA + 0.24, dropRunBase - 0.22, frontZ + 0.18,
    'dock-isolator-handle'), p.steel);
  ctx.push(box(0.52, 0.16, 0.22, dropA, canopyY - 0.30, frontZ + 0.34, 'dock-lamp-body'), p.steel);
  ctx.push(box(0.40, 0.09, 0.16, dropA, canopyY - 0.40, frontZ + 0.34, 'dock-lamp-lens'), p.trim);
  personnelDoor(ctx, { x: plantCx - 0.79, z: frontZ, facing: 1 });

  /* — 7. expressed steel (§2a). Portal frames inside, and the end frame expressed on the
         outside of the frontage the way the reference detail plate shows it. — */
  const frames = ctx.mid ? 3 : 2;
  for (let i = 0; i < frames; i += 1) {
    const fz = backZ + (bodyD * (i + 0.6)) / (frames + 0.2);
    emit(ctx, portalFrame({
      span: hallW * 0.94, x: hallCx, eaveH: eaveH - 0.35, z: fz,
      mono: env.roofMode !== 'sawtooth', apexRise: env.roofMode === 'sawtooth' ? 1.2 : 1.6,
      name: `portal-${i}`,
    }));
  }
  // Expressed columns on the frontage: shaft, base plate, holding-down bolts, haunch bracket.
  // The base plate sits ABOVE the paving rather than level with it — 90 mm of plate at the same
  // height as the wearing surface is a plate nobody can see, and §2a lists bolted expression.
  for (const cx of [leftX + 0.34, hallCx, plantX0 - 0.34]) {
    ctx.push(box(0.24, eaveH - 0.42, 0.34, cx, (eaveH - 0.42) / 2 + 0.24, frontZ + 0.19,
      'expressed-column'), p.steel);
    ctx.push(slab(0.62, 0.10, 0.62, cx, PAVE + 0.12, frontZ + 0.19, 'expressed-baseplate'), p.steel);
    ctx.push(slab(0.86, 0.14, 0.86, cx, PAVE - 0.02, frontZ + 0.19, 'expressed-column-footing'), p.wallAlt);
    for (const s of [-1, 1]) {
      ctx.push(cyl(0.038, 0.15, cx + s * 0.22, PAVE + 0.24, frontZ + 0.19, 'y',
        'holding-down-bolt', 6), p.trim);
    }
    ctx.push(rotBox(0.80, 0.20, 0.30, cx, eaveH - 0.62, frontZ + 0.19, { z: 0.42 }, 'expressed-haunch'), p.steel);
  }

  /* — 8. the process: pipe runs, cable tray, stack, access. Every run STARTS somewhere and ENDS
         somewhere (V320 §2.2), and the vertical legs land on the two wear stations.

         `pipeChain` IS GONE. It existed because `core.js: pipeRun` extrapolated its flange and
         bracket stationing backwards off every leg after the first, which put fittings twelve
         metres above a run that never exceeded y 6.0 and spilled the assembled box to |x| =
         10.35. The CORE REPAIR seat fixed it, measured (10 flanges → 4, 13 bracket plates → 6),
         so the whole polyline goes over in one call again and the elbows come back as the
         helper's own spheres rather than as this file's boxes.

         The front run is also BIGGER. `mp-factory-light` and `mp-factory-detail` both lead on a
         flanged pipe cluster — the r1 critic called external pipe runs "the reference's single
         most characteristic detail" and scored ornament 3.0 partly for their absence at this
         scale. Two parallel pipes at 0.155 and 0.10 m read as a process; one at 0.13 reads as a
         handrail. — */
  /* — BOTH RUNS START IN A PLINTH AND END IN A VESSEL, because the first r2 plate showed what
       the alternative looks like: `pipeRun` caps a free end with a blank flange, and two of them
       came back as bright spheres hanging in the middle of the dock elevation with a metre of
       air between each pipe and the plinth it was supposed to rise out of. Measured off the
       assembled geometry — plinth top y 0.58, pipe foot y 1.65, cap sphere 1.58–2.00. A pipe
       that starts in mid-air is the single most common construction-logic failure on an
       industrial model and this file had two of them in one elevation. Feet are now inside the
       plinth and heads inside the receiver, and both caps are off. — */
  const runY = eaveH - 1.15;
  const runZ = frontZ + 0.42;
  const vesselX = plantX0 - 0.55;
  const vesselY = DOCK_FLOOR;
  const vesselH = 2.05;
  emit(ctx, pipeRun({
    points: [
      { x: leftX + 0.85, y: 0.45, z: runZ },
      { x: leftX + 0.85, y: runY, z: runZ },
      { x: vesselX, y: runY, z: runZ },
      { x: vesselX, y: vesselY + vesselH - 0.45, z: runZ },
    ],
    radius: 0.155, bracketTo: 'z', bracketPlane: frontZ,
    bracketEvery: 2.4, flangeEvery: 3.1, capStart: false, capEnd: false, name: 'front-main',
  }));
  emit(ctx, pipeRun({
    points: [
      { x: leftX + 1.40, y: 0.45, z: runZ + 0.30 },
      { x: leftX + 1.40, y: runY - 0.42, z: runZ + 0.30 },
      { x: vesselX, y: runY - 0.42, z: runZ + 0.30 },
      { x: vesselX, y: vesselY + vesselH - 0.70, z: runZ + 0.30 },
    ],
    radius: 0.10, bracketTo: null, flangeEvery: 4.2,
    capStart: false, capEnd: false, name: 'front-secondary',
  }));
  ctx.push(slab(1.65, 0.42, 0.95, leftX + 1.12, PAVE, runZ + 0.15, 'front-main-plinth'), p.wallAlt);
  // The receiver both runs discharge into, standing on the dock platform on its own saddle.
  ctx.push(cyl(0.36, vesselH, vesselX, vesselY + vesselH / 2, runZ + 0.15, 'y',
    'receiver-shell', 10), p.steel);
  ctx.push(taper(0.36, 0.28, 0.24, vesselX, vesselY + vesselH, runZ + 0.15, 'receiver-dome', 10), p.steel);
  ctx.push(cyl(0.42, 0.10, vesselX, vesselY + 0.05, runZ + 0.15, 'y', 'receiver-base-ring', 10), p.trim);
  for (const sy of [0.55, 1.55]) {
    ctx.push(box(0.10, 0.09, 0.62, vesselX, vesselY + sy, runZ - 0.20, 'receiver-strap'), p.steel);
  }
  // A valve station on the west leg — a wheel, a body and a gauge, which is what a detail plate
  // is for and what `mp-factory-detail` puts at the front of its frame.
  ctx.push(box(0.34, 0.42, 0.34, leftX + 0.85, 2.45, runZ, 'valve-body'), p.steel);
  ctx.push(cyl(0.30, 0.06, leftX + 0.85, 2.45, runZ + 0.30, 'z', 'valve-wheel', 10), p.trim);
  ctx.push(cyl(0.05, 0.26, leftX + 0.85, 2.45, runZ + 0.18, 'z', 'valve-spindle', 6), p.steel);
  ctx.push(cyl(0.14, 0.09, leftX + 1.40, 2.95, runZ + 0.30, 'z', 'pressure-gauge', 10), p.trim);
  // A second, smaller run on the west flank, dropping at the same station as the flank pipe.
  emit(ctx, pipeRun({
    points: [
      { x: leftX - 0.46, y: 2.10, z: dropB },
      { x: leftX - 0.46, y: eaveH - 2.35, z: dropB },
      { x: leftX - 0.46, y: eaveH - 2.35, z: backZ + 1.85 },
    ],
    radius: 0.095, bracketTo: 'x', bracketPlane: leftX, bracketEvery: 2.6, name: 'flank-process',
  }));
  ctx.push(slab(0.58, 0.34, 0.58, leftX - 0.46, PAVE, dropB, 'flank-process-plinth'), p.wallAlt);
  // Plant-to-stack duct: the reason the stack is where it is.
  const stackX = plantCx;
  const stackZ = backZ + 2.35;
  emit(ctx, pipeRun({
    points: [
      { x: plantCx, y: PLANT_H + 0.55, z: plantZBack - 1.05 },
      { x: plantCx, y: PLANT_H + 0.55, z: stackZ + 1.15 },
      { x: stackX, y: PLANT_H + 1.60, z: stackZ + 0.75 },
    ],
    radius: 0.22, flangeEvery: 2.2, name: 'flue-duct',
  }));
  if (ctx.mid) cableTray(ctx, { z0: frontZ - 1.4, z1: backZ + 2.2, y: 4.35, plane: leftX, facing: -1 });

  const roofCrown = Math.max(roof.crown, PLANT_H + 1.2);
  const pedestalH = clamp(roofCrown + 2.35 - env.stackHeight, 1.20, 4.40);
  processStack(ctx, {
    x: stackX, z: stackZ, shaftH: env.stackHeight, pedestalH,
    // Three points this file has already built: two lengths of compound coping and a bracket on
    // the hall's east flank. Nothing here is a pad invented for the wire to end on.
    anchors: [
      { x: plantCx - plantW * 0.30, y: COMPOUND_WALL_H + 0.20, z: plantZBack - 0.17 },
      { x: rightX - 0.17, y: COMPOUND_WALL_H + 0.20, z: backZ + 1.15 },
      { x: plantX0 + 0.14, y: PLANT_H + 1.35, z: backZ + 3.30 },
    ],
  });

  // Access: an external stair to the plant roof and a caged ladder to the hall eaves. The
  // ladder's foot sits at `dropA` on the flank, which is a wear station, so the flank's second
  // oxide streak runs out of a fixing rather than out of nothing.
  emit(ctx, externalStair({
    x: rightX - 0.72, z: frontZ - 1.05, yTop: PLANT_H + 0.30, facing: -1, width: 1.00,
    name: 'plant-stair',
  }));
  emit(ctx, ladderCaged({
    x: leftX - 0.30, z: dropA, yBase: PAVE, yTop: eaveH - 0.30, facing: -1, name: 'hall-ladder',
  }));
  // The name-plate, above the canopy where a name-plate goes.
  emit(ctx, signPlate(ctx, {
    x: hallCx + hallW * 0.26, y: eaveH - 1.95, z: frontZ + 0.10, width: 2.05, height: 0.62,
    mount: 'wall', wallPlane: frontZ, kind: 'name', salt: 184,
  }));

  /* — 9. the yard, and then the wear that ties the two together.
         BOTH TAKE THE UNRAISED CONTEXT. The yard kit carries its own `y` and is handed
         `PLATE.rise` directly; `directWear` pushes no geometry at all and reads `ctx.p`, which
         the wrapper shares by reference. Passing the raised context to either would apply the
         datum twice. — */
  factoryYard(rootCtx, geom);
  directWear(rootCtx, geom);
}

/* ─────────────────────────────────── mischief staging ─────────────────────────────────── */

/**
 * Authored damage kit for `factory-light` (V332 §3a).
 *
 * §3a requires a damaged state that is LEGIBLE AS THE THING IT WAS — "a factory sheds cladding
 * sheets off its portal frame and drops the stack cap" — and requires it to ship in the same
 * round as the geometry.
 *
 * WHY THIS IS AUTHORED RATHER THAN DERIVED, and what the orchestrator has to do with it.
 * `mischief.js: voxelKitFromModel` reads `model.parts`, and `index.js` merges parts BY MATERIAL
 * before returning them — so a derived kit for this subject is nine AABBs, one per palette
 * bucket, each spanning everything drawn in that bucket. The `steel` box alone would enclose the
 * boundary fence, the stack and the dock canopy in one 15 × 16 × 31 m block. That is the
 * "generic pile of boxes" §3a rules out, and it is a property of the merge rather than of this
 * lane's geometry.
 *
 * So this exports the authored alternative, in the exact shape `board.js` already accepts as its
 * `voxelKit` option, ordered bottom-up the way `finaliseVoxelKit` orders a derived one (the peel
 * stages drop the top pieces first — cladding sheets, then the stack cap, before the shell).
 * NOTHING CALLS IT YET: no building of any kind is registered as a mischief target in `board.js`
 * today, and adding that registration is a shared-file edit this lane does not own. It is asked
 * for in this seat's report.
 *
 * @param {{size?: THREE.Vector3}} model the assembled model, for its measured bounds
 * @param {{colours?: Record<string, string>}} [opts]
 * @returns {Array<{position: THREE.Vector3, scale: THREE.Vector3, colour: THREE.Color,
 *                  rotation: null, shape: string}>}
 */
export function factoryMischiefKit(model, opts = {}) {
  const size = model?.size;
  // Fall back to the authored envelope when the caller has no measured size, so the kit is
  // never null: a null kit silently drops the subject out of mischief altogether.
  const w = Math.max(4, size?.x ?? 14.3);
  const h = Math.max(4, size?.y ?? 15.0);
  const d = Math.max(4, size?.z ?? 30.3);
  // Tints track `core.js: CLADDING_COLOURS['factory-light']` and `WALL_FACADE_COLOURS`. The clad
  // value was `#8f9f9a` until the CORE REPAIR seat measured the old list as a grey-cyan a
  // quarter-turn of the wheel from the reference and retuned it to olive; a damage kit still
  // painting the old hue would drop sheets in a colour the building never had.
  const c = {
    clad: '#6c7350', wall: '#8f4b34', steel: '#333a3e', trim: '#c6cac5',
    ground: '#4e4d4b', glass: '#151b1f', ...(opts.colours ?? {}),
  };
  const parts = [];
  const put = (x, y, z, sx, sy, sz, tint) => parts.push({
    position: new THREE.Vector3(x, y, z),
    scale: new THREE.Vector3(sx, sy, sz),
    colour: new THREE.Color(tint),
    rotation: null,
    shape: 'box',
  });

  // Slab and masonry base — the pieces that stay put.
  put(0, 0.08, 0, w * 0.95, 0.16, d * 0.95, c.ground);
  put(0, 0.55, -d * 0.10, w * 0.80, 1.10, d * 0.52, c.wall);
  put(0, 1.90, -d * 0.10, w * 0.80, 1.50, d * 0.52, c.wall);
  // Dock platform, canopy, bumpers.
  put(-w * 0.14, 0.52, d * 0.16, w * 0.56, 1.05, 1.75, c.trim);
  put(-w * 0.14, 5.90, d * 0.19, w * 0.58, 0.14, 2.15, c.steel);
  // Portal frames — the structure the sheets come off. Four columns and a rafter line.
  for (const s of [-1, 1]) {
    put(s * w * 0.30, 4.20, -d * 0.02, 0.24, 8.40, 0.46, c.steel);
    put(s * w * 0.30, 4.20, -d * 0.30, 0.24, 8.40, 0.46, c.steel);
  }
  put(-w * 0.10, 8.30, -d * 0.14, w * 0.62, 0.30, d * 0.48, c.steel);
  // Cladding sheets, as sheets: eight of them around the shell, each a real panel rather than a
  // slice of a box, so the peel drops recognisable sheet.
  for (let i = 0; i < 4; i += 1) {
    const z = -d * 0.34 + (d * 0.46 * i) / 3;
    put(-w * 0.31, 5.60, z, 0.10, 5.20, d * 0.13, c.clad);
    put(w * 0.11, 5.60, z, 0.10, 5.20, d * 0.13, c.clad);
  }
  put(-w * 0.12, 6.90, d * 0.155, w * 0.56, 3.00, 0.12, c.clad);
  // Roof: pitch sheets and the glazed north light.
  put(-w * 0.12, 9.60, -d * 0.18, w * 0.58, 0.16, d * 0.24, c.clad);
  put(-w * 0.12, 9.60, d * 0.06, w * 0.58, 0.16, d * 0.24, c.clad);
  put(-w * 0.12, 10.20, d * 0.15, w * 0.56, 2.40, 0.12, c.glass);
  // Plant end and its cowls.
  put(w * 0.26, 2.90, d * 0.02, w * 0.22, 5.40, d * 0.36, c.clad);
  put(w * 0.24, 5.90, d * 0.05, 0.80, 0.90, 0.80, c.trim);
  // The stack: pedestal, shaft in two lifts, and the cap that drops first.
  put(w * 0.26, 1.20, -d * 0.40, 1.94, 2.40, 1.94, c.wall);
  put(w * 0.26, 6.20, -d * 0.40, 1.20, 6.60, 1.20, c.steel);
  put(w * 0.26, 11.40, -d * 0.40, 1.20, 4.00, 1.20, c.steel);
  put(w * 0.26, h - 0.60, -d * 0.40, 1.60, 0.90, 1.60, c.trim);

  parts.sort((a, b) => a.position.y - b.position.y);
  return parts;
}

/* ─────────────────────────────────────── the export ───────────────────────────────────── */

/** archetypeId → builder(ctx). `index.js` spreads this into `INDUSTRIAL_BUILDERS`. */
export const FACTORY_BUILDERS = Object.freeze({
  'factory-light': buildFactory,
  // V4.0 Wave 2 — space-works reuses the factory kit with an authored fascia plate.
  'space-works': buildFactory,
  // V4.0 Wave 3 — dairy / abattoir reuse the factory plant kit.
  'dairy-processor': buildFactory,
  'cattle-abattoir': buildFactory,
});
