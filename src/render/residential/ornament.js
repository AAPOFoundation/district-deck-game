// District Deck V3.20 — residential ornament library.
//
// The period detail every residential lane hangs on its envelope: cast-iron lace, turned
// posts, moulded architraves, corbelled chimneys, cornices, gutters and roof capping. The
// reference plates are eighty per cent this file; a lane that draws only walls and roofs
// fails V320-RESIDENTIAL-AAA-SPEC §2.5 no matter how well the envelope is proportioned.
//
// ── the one convention ────────────────────────────────────────────────────────────────
// Every exported component returns a PART BUNDLE: a plain object whose keys are palette
// bucket names from `ctx.p` and whose values are arrays of geometries.
//
//     const b = laceFrieze(ctx, { width: 4.2, x: 0, y: 3.1, z: front });
//     emit(ctx, b);                          // pushes b.iron with ctx.p.iron
//     emit(ctx, b, { iron: 'joinery' });     // same lace, painted cream instead
//
// One shape for one-bucket and many-bucket components alike, because the call site should
// never have to remember which is which. The caller always pushes — `emit` is the only
// thing in this file that touches `ctx.push`, and nothing here ever calls `materials.get`.
//
// Buckets used here: wall, wallAlt, roof, roofTrim, trim, joinery, iron, glass, shadow.
// That is exactly PALETTE_BUCKET_CAP. `ground` and `foliage` belong to curtilage.js, so no
// component reaches for them — a lane that pays for both would breach the cap. Where an
// ornament wants stone or bluestone it takes `wallAlt` and the lane remaps if it disagrees.
//
// ── the frame ─────────────────────────────────────────────────────────────────────────
// Everything is authored facing +Z, the street. An option named `z` is the FACE the
// ornament seats against and projection grows toward +Z; `x` is the centre of a run; `y`
// is documented per component (a sill line, a soffit line, a springing line). To put a
// front-facing component on a side elevation, build it and turn it:
//
//     emit(ctx, turnBundle(gutterRun(ctx, {...}), { x: cx, z: cz, angle: Math.PI / 2 }));
//
// ── scale ─────────────────────────────────────────────────────────────────────────────
// One world unit is one metre. A person is 1.7. Working sizes, so nothing reads as a toy:
//   lace bar 0.036 · lace drop 0.52 · verandah post radius 0.06 · balustrade 0.85
//   window 1.45 tall · sill projection 0.14 · brick course 0.08 · dentil 0.11
//   downpipe radius 0.05 · gutter 0.16 deep · chimney pot 0.50 tall · fence 1.1
//
// ── quality ───────────────────────────────────────────────────────────────────────────
// Every component reads `ctx.q`. 'high' is the full article; 'medium' halves segment and
// motif counts and drops the finest layer; 'low' returns a cheap silhouette-preserving
// stand-in, or an empty bundle for ornament that is sub-pixel at board distance.
//
// ── determinism ───────────────────────────────────────────────────────────────────────
// No clock, no Math.random. A component only varies when the caller passes no explicit
// style, and then only through `ctx.v` with the `salt` option. Salts are per-component
// constants so two components on the same building never draw the same number; a lane
// placing several of one component passes `salt: BASE + index` to break the tie itself.

import * as THREE from 'three';
import {
  box, slab, rotBox, cyl, taper, ball, skillion,
  CORNICE_PROFILE, PLINTH_PROFILE, emit as coreEmit,
} from './core.js';

/* ──────────────────────────────── bundle plumbing ─────────────────────────────────── */

// Compatibility for the ornament regression page.  There is one emit implementation only:
// lanes import it directly from core.js, while the lab reaches this re-export dynamically.
export const emit = coreEmit;

/** Fold several bundles into one, so a composite component returns a single object. */
export function mergeBundles(...list) {
  const out = {};
  for (const b of list) {
    if (!b) continue;
    for (const key of Object.keys(b)) {
      const geos = b[key];
      if (!geos || !geos.length) continue;
      if (!out[key]) out[key] = [];
      out[key].push(...geos);
    }
  }
  return out;
}

/**
 * Rotate a whole bundle about the vertical axis through (x, z) — the side-elevation move.
 * Mutates in place and returns the same object: the bundle was minted by the component one
 * line earlier, so cloning the geometry would only be a copy nobody asked for.
 */
export function turnBundle(parts, { x = 0, z = 0, angle = 0 } = {}) {
  if (!parts || !angle) return parts;
  for (const key of Object.keys(parts)) {
    for (const g of parts[key]) {
      if (!g) continue;
      g.translate(-x, 0, -z);
      g.rotateY(angle);
      g.translate(x, 0, z);
      g.computeBoundingBox();
    }
  }
  return parts;
}

/** Pick a value by quality tier. */
export function lod(ctx, high, mid, low) {
  if (ctx.q === 'high') return high;
  if (ctx.q === 'low') return low;
  return mid;
}

/* ────────────────────────────── local geometry helpers ────────────────────────────── */

// core.js finishes its primitives with a second UV set for lightmaps. The dispatcher strips
// every attribute but position/normal/uv before merging and re-adds uv2 to the merged
// result, so anything added here would be built and thrown away in the same frame.
function tag(geometry, name) {
  geometry.name = name;
  geometry.computeBoundingBox();
  return geometry;
}

/** A single vertical triangular face. Residential materials are double-sided in the lab. */
function triangleFace(width, height, x, yBase, z, name) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    x - width / 2, yBase, z,
    x, yBase + height, z,
    x + width / 2, yBase, z,
  ], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0.5, 1, 1, 0], 2));
  g.computeVertexNormals();
  return tag(g, name);
}

/**
 * A straight bar between two points in the XY plane at depth `z` — the atom of every
 * pierced pattern in this file. The length carries half a thickness of overrun so bars
 * meeting at an angle close their mitre instead of showing daylight at the joint.
 */
function bar(x0, y0, x1, y1, z, thick, depth, name = 'bar') {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return null;
  return rotBox(len + thick * 0.6, thick, depth, (x0 + x1) / 2, (y0 + y1) / 2, z,
    { z: Math.atan2(dy, dx) }, name);
}

/**
 * A circular arc as a chain of tangent bars, in the XY plane at depth `z`. Piercing is what
 * separates lace from a grille, and an arc built this way keeps a clean polyline silhouette
 * at any segment count — which matters because arcs here are usually the outer edge.
 */
function arcBars(cx, cy, z, radius, a0, a1, segs, thick, depth, name = 'arc') {
  const out = [];
  const n = Math.max(1, segs | 0);
  const step = (a1 - a0) / n;
  const chord = 2 * radius * Math.sin(Math.abs(step) / 2) + thick * 0.6;
  for (let i = 0; i < n; i += 1) {
    const am = a0 + step * (i + 0.5);
    out.push(rotBox(chord, thick, depth,
      cx + Math.cos(am) * radius, cy + Math.sin(am) * radius, z,
      { z: am + Math.PI / 2 }, name));
  }
  return out;
}

/** Where a ray from (cx,cy) leaves the box [x0,x1] × (−∞, yTop]. Fan rays land on it. */
function rayExit(cx, cy, angle, x0, x1, yTop) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let t = Infinity;
  if (dy > 1e-6) t = Math.min(t, (yTop - cy) / dy);
  if (dx > 1e-6) t = Math.min(t, (x1 - cx) / dx);
  if (dx < -1e-6) t = Math.min(t, (x0 - cx) / dx);
  if (!Number.isFinite(t)) t = 0;
  return [cx + dx * t, cy + dy * t];
}

/**
 * The paired cast scroll: two quarter-coves facing each other across one cell, springing off
 * the stiles at (x0, y − r) and (x1, y − r) and meeting the head rail at y. Together with the
 * rail they draw the round head of an arch; a run of them is a pierced arcade.
 *
 * What this replaces swept 255° in as few as two chords, which draws a V and not a curl — on
 * `v330-r1-terrace/terrace-carlton-heritage--detail.png` it reads as a row of hooks under a
 * row of spikes. Sweeping a true quarter instead means the outline is made only of verticals
 * and arcs, so it cannot collapse to a point at any segment count, and the same call serves
 * the frieze band, the balcony field and the spandrel above a bracket.
 */
function scrollPair(list, {
  x0, x1, y, z, radius, thick, depth, segments = 2, name = 'lace-scroll',
} = {}) {
  const n = Math.max(2, Math.min(6, segments | 0));
  const r = Math.max(0.02, Math.min(radius, (x1 - x0) * 0.5));
  for (const [x, hand] of [[x0, 1], [x1, -1]]) {
    const cx = x + hand * r;
    const a0 = hand > 0 ? Math.PI : 0;
    const a1 = Math.PI * 0.5;
    push(list, arcBars(cx, y - r, z, r, a0, a1, n, thick, depth, name));
  }
}

/** A dark, recessed arched pane for the Boom terrace's tall sash windows. */
function archedPane(width, height, x, y, z, name = 'arched-window-glass') {
  const half = width / 2;
  const shoulder = Math.max(0.06, height - half);
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0);
  shape.lineTo(-half, shoulder);
  shape.absarc(0, shoulder, half, Math.PI, 0, false);
  shape.lineTo(half, 0);
  shape.closePath();
  const g = new THREE.ShapeGeometry(shape, 12);
  g.translate(x, y, z);
  g.computeVertexNormals();
  return tag(g, name);
}

/**
 * An n-sided prism, optionally battered. Four sides at rotY = π/4 gives a square section
 * with axis-aligned faces; eight at π/8 gives the stop-chamfered shaft of a timber post.
 */
function prism(sides, rBottom, rTop, height, x, yBase, z, rotY = 0, name = 'prism') {
  const g = new THREE.CylinderGeometry(rTop, rBottom, height, Math.max(3, sides | 0), 1, false);
  if (rotY) g.rotateY(rotY);
  g.translate(x, yBase + height / 2, z);
  g.computeVertexNormals();
  return tag(g, name);
}

/** A turned solid of revolution from a [radius, heightOffset] profile — posts, pots, urns. */
function lathe(profile, x, yBase, z, segments, name = 'lathe') {
  const pts = [];
  for (const [r, t] of profile) pts.push(new THREE.Vector2(Math.max(1e-3, r), yBase + t));
  const g = new THREE.LatheGeometry(pts, Math.max(3, segments | 0));
  g.translate(x, 0, z);
  return tag(g, name);
}

/** A cylinder between two arbitrary points — downpipes, hip rolls, knee braces. */
function pipeBetween(x0, y0, z0, x1, y1, z1, radius, segments, name = 'pipe') {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return null;
  const g = new THREE.CylinderGeometry(radius, radius, len, Math.max(3, segments | 0), 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
  g.applyQuaternion(q);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  g.computeVertexNormals();
  return tag(g, name);
}

/**
 * A stack of profiled bands whose BACKS all sit on the plane `z` and which grow forward.
 * core's `moulding` centres each band on `z`, which buries half a cornice inside the wall
 * and makes the real projection depend on the band — a run seated on a face needs its own
 * loop. Profile entries are [heightFraction, projectionWeight]; the heaviest weight gets
 * the full `projection`.
 */
function bandRun(length, height, x, yBase, z, projection, profile, name = 'band') {
  const out = [];
  let maxW = 0;
  for (const [, w] of profile) maxW = Math.max(maxW, w);
  if (maxW <= 0) return out;
  let y = yBase;
  for (const [hf, w] of profile) {
    const h = height * hf;
    const proj = projection * (w / maxW);
    if (h > 1e-4 && proj > 1e-4) out.push(slab(length, h, proj, x, y, z + proj / 2, name));
    y += h;
  }
  return out;
}

/**
 * The same profile turned upright: bands stacked across X, running the full height in Y.
 * An architrave jamb reads as a moulding only if its section steps sideways, not upward.
 */
function bandRunUpright(height, width, xEdge, yBase, z, projection, profile, hand, name = 'band') {
  const out = [];
  let maxW = 0;
  for (const [, w] of profile) maxW = Math.max(maxW, w);
  if (maxW <= 0) return out;
  let x = xEdge;
  for (const [wf, w] of profile) {
    const bw = width * wf;
    const proj = projection * (w / maxW);
    if (bw > 1e-4 && proj > 1e-4) {
      out.push(box(bw, height, proj, x + hand * bw / 2, yBase + height / 2, z + proj / 2, name));
    }
    x += hand * bw;
  }
  return out;
}

/** A brace or rafter in the ZY plane — the members `bar` cannot reach. */
function strutZY(x, y0, z0, y1, z1, w, t, name = 'strut') {
  const dy = y1 - y0;
  const dz = z1 - z0;
  const len = Math.hypot(dy, dz);
  if (len < 1e-4) return null;
  return rotBox(w, t, len + t * 0.6, x, (y0 + y1) / 2, (z0 + z1) / 2,
    { x: Math.atan2(-dy, dz) }, name);
}

/** Same bands turned to run in Z against a side wall at plane `x`, growing toward `hand`. */
function bandRunSide(length, height, x, yBase, z, projection, profile, hand, name = 'band') {
  const out = [];
  let maxW = 0;
  for (const [, w] of profile) maxW = Math.max(maxW, w);
  if (maxW <= 0) return out;
  let y = yBase;
  for (const [hf, w] of profile) {
    const h = height * hf;
    const proj = projection * (w / maxW);
    if (h > 1e-4 && proj > 1e-4) {
      out.push(slab(proj, h, length, x + hand * proj / 2, y, z, name));
    }
    y += h;
  }
  return out;
}

function push(list, geo) {
  if (Array.isArray(geo)) {
    for (const g of geo) if (g) list.push(g);
  } else if (geo) list.push(geo);
}

/** Moulded architrave section — flat face, quirk, bead. */
const ARCHITRAVE_PROFILE = Object.freeze([[0.34, 0.62], [0.28, 1.0], [0.38, 0.78]]);
/** Sill section — weathered top, drip below. */
const SILL_PROFILE = Object.freeze([[0.55, 1.0], [0.45, 0.72]]);
/** String course — a chamfered band and its bed. */
const STRING_PROFILE = Object.freeze([[0.30, 0.55], [0.44, 1.0], [0.26, 0.72]]);

export { CORNICE_PROFILE, PLINTH_PROFILE };

/* ═══════════════════════════════════ cast iron ════════════════════════════════════ */

/** Frieze motif families. A street row picks per house, so no two neighbours match. */
export const LACE_MOTIFS = Object.freeze(['fan', 'ogee', 'trellis', 'quatrefoil']);

function isCarltonHeritage(ctx) {
  return ctx.archetypeId === 'terrace-carlton-heritage';
}

function isFederationVilla(ctx) {
  return ctx.archetypeId === 'heritage-federation-villa';
}

function isFederationCottage(ctx) {
  return ctx.archetypeId === 'cottage-federation';
}

function isBrightonBungalow(ctx) {
  return ctx.archetypeId === 'bungalow-brighton';
}

function isCalifornianBungalow(ctx) {
  return ctx.archetypeId === 'bungalow-californian';
}

/**
 * The reference arch module, in metres.
 *
 * `mp-terrace-single` and `mp-terrace-carlton-heritage` both run ONE round-headed arch per
 * roughly 1.6 m of verandah, and our post bays are wider than the reference's — 2.01 m on
 * `terrace-single`, 3.16 m on Carlton and `terrace-double`. Tying the arch count to the post
 * count therefore gives Carlton a single 3.1 m opening (a pergola), and tying it to a small
 * module gives the comb this round is here to remove. Tying it to the reference's own
 * absolute module gives one arch on the narrow bay and two on the wide one, which is what the
 * plates show.
 */
const LACE_ARCH_PITCH = 1.58;

/**
 * The Victorian verandah frieze: a heavy head rail, one heavy round-headed arch per reference
 * module, and a fine filigree spandrel behind it. `y` is the beam soffit — the frieze hangs
 * below it. One call per post bay; the lane sizes `width` to the bay.
 *
 * ── why this is not the r1 arcade ──────────────────────────────────────────────────────
 * r1 replaced a degenerate polyline arch with a true quarter-cove arcade at a 0.40–0.54 m
 * pitch, and the diagnosis was right. The member was not. The cove was drawn at `t × 0.78`
 * = 25 mm, which is 1.5–2.5 px at the 59–85 px/m these plates measure, so what survived
 * onto `v330-r1-final` was the legs and the beads: straight bars at one weight with diamond
 * drops. §2.5 grades the plate, and on the plate that is a comb — the exact finding the
 * round set out to close, reintroduced at a finer gauge.
 *
 * So the members are sized against the plate first. Measured on `mp-terrace-single` at
 * ~85 px/m: head rail ~105 mm, arch rib ~65 mm, filigree ~25 mm, post ~150 mm. Three weights
 * that are genuinely different, and the heaviest of them is 40 % of a post. That is the
 * proportion reproduced here — `heavy` is 70 mm, the rail 80 mm, the field 28–37 mm — and it
 * is checked against px/m before it ships, not after.
 *
 * @returns {{iron: THREE.BufferGeometry[]}}
 */
export function laceFrieze(ctx, {
  width, x = 0, y = 0, z = 0,
  depth = 0.055, drop = 0.52,
  motif = null, bar: barThick = null,
  pendants = true, salt = 301,
} = {}) {
  const out = { iron: [] };
  if (!(width > 0.24) || !(drop > 0.14)) return out;

  // The fine weight — the spandrel filigree, and nothing structural.
  const t = Math.max(0.028, barThick ?? lod(ctx, 0.028, 0.032, 0.037));
  // The heavy weight — the arch rib and the legs.
  //
  // The critic's prescription was `t × 2.2` = 70 mm, which is 4.9–7.0 px horizontally at the
  // 71–100 px/m these detail plates measure, against 1.9 px for what it replaces. Measured on
  // the first capture of this round the VERTICAL scale is 52 px/m — the studio camera looks
  // down at the frieze, so a horizontal member's thickness foreshortens by about 0.63 — and
  // the crown bar came out at 3.6 px. 78 mm puts it back over four, which is where a member
  // stops merging into the rail above it.
  const heavy = Math.max(0.078, t * 2.4);
  const relief = Math.max(0.05, depth);
  // The head rail is the heaviest member: it is what the panel hangs from, and in both
  // reference plates it is visibly thicker than the arch it carries.
  const railT = Math.max(0.072, heavy * 1.16);
  const x0 = x - width / 2;
  const x1 = x + width / 2;

  push(out.iron, slab(width, railT, relief * 1.2, x, y - railT, z, 'lace-top-rail'));
  const yTop = y - railT;
  const yBot = y - drop;
  const panelH = yTop - yBot;
  if (panelH < 0.10) return out;

  const dense = ctx.q === 'high';
  const heritage = isCarltonHeritage(ctx);
  void (motif ?? ctx.v.pick(salt, LACE_MOTIFS));

  // NO continuous bottom rail. The reference frieze has none: its lower edge IS the scalloped
  // line of the arch soffits, and a straight bar drawn across that line is the second horizontal
  // that made this band read as a comb clamped between two rails.
  const cells = laceArcade(out.iron, {
    x0, x1, yBot, yTop, z, t, heavy, depth: relief,
    pitch: LACE_ARCH_PITCH,
    // A quarter-arc at two segments is two straight facets — a chamfer, not a curve. At the
    // radii this arch uses (~0.30 m) two segments put a 23 mm flat at the crown, which is 2 px.
    // Four segments cost 24 triangles per cell and are what makes it read as cast.
    segs: dense ? 5 : (ctx.q === 'low' ? 3 : 4),
    beadCourse: ctx.q !== 'low',
    // The end stiles are reclaim, not omission. The lane calls this once per POST bay and
    // insets it 40 mm, so a stile at either end stands inside a 230 mm post and is never on
    // any plate. Both reference plates spring the arch straight off the post capital and have
    // no stile there at all; a `terrace-single` bay is one arch between two posts with nothing
    // vertical in it. Carlton keeps the one standard it earns, at mid-bay between its two arches.
    endLegs: false,
    // At `q: 'low'` — Carlton's upper verandah, the most distant band in the set — the fine
    // concentric arc inside each haunch is the first layer to stop resolving, and it is what
    // pays for the balustrade's third cove segment on the same archetype.
    haunchFill: ctx.q !== 'low',
    coveName: heritage ? 'carlton-lace-arch' : 'lace-arch',
  });
  const cellW = width / cells;

  if (pendants) {
    // The fringe, now on the ARCH grid rather than the old 0.4 m one — a turned drop where a
    // standard lands, and on the same reclaim as the stiles: the bay-end drops sat on the post
    // face and read as lumps on the r1 detail plate.
    const beadW = heavy * 1.35;
    for (let i = 1; i < cells; i += 1) {
      const bx = x0 + cellW * i;
      push(out.iron, rotBox(beadW, beadW, relief, bx, yBot - beadW * 0.34, z,
        { z: Math.PI / 4 }, 'lace-drop'));
    }
  }
  return out;
}

/**
 * The reference frieze, built at reference scale.
 *
 * A run of legs at the reference arch module, each springing a HEAVY quarter-cove haunch into
 * a heavy soffit bar, so every cell is one wide flat-headed arch with curved haunches and a
 * pendant keystone — and the rectangle above that soffit line is filled with a fine crossed
 * filigree that reads as texture rather than as structure. Three weights, deliberately far
 * apart: rail and rib at 70–80 mm, legs at 63 mm, field at 28–37 mm.
 *
 * Two measurements decided the composition, and both are on the plates.
 *
 * **The void, not the member, is what survives to the row.** At the row's 18.8 px/m a 70 mm
 * rib is 1.3 px and a 25 mm one is 0.5 px, so no member reads at that distance whatever its
 * gauge; what reads is daylight. Five cells per bay at 0.40 m pitch gives voids of 6 × 6 px
 * separated by sub-pixel bars, which resolves to one grey smear — the black slot §2.10 was
 * failing on. One arch per 1.58 m gives a void 30 px wide and 6 px high at the same distance,
 * and a hole that size is a hole.
 *
 * **The proportion is the reference's, not a smaller version of it.** `mp-terrace-single`
 * runs a haunch radius of about half the half-bay and leaves the middle two thirds of each
 * arch flat; `mp-terrace-carlton-heritage` is flatter still. A cove radius clamped to the
 * panel height reproduces that without any per-archetype literal.
 *
 * @returns {number} the number of cells laid, so a caller can hang a fringe on the same grid.
 */
function laceArcade(list, {
  x0, x1, yBot, yTop, z, t, heavy, depth, pitch, segs = 4,
  endLegs = true, haunchFill = true, beadCourse = true,
  coveName = 'lace-arch', legName = 'lace-stile', soffitName = 'lace-soffit',
  bossName = 'lace-keystone', fieldName = 'lace-field',
} = {}) {
  const span = x1 - x0;
  const h = yTop - yBot;
  if (!(span > 0.06) || !(h > 0.05)) return 1;
  const rib = heavy ?? Math.max(0.062, t * 2.2);
  const cells = Math.max(1, Math.round(span / Math.max(0.30, pitch)));
  const cw = span / cells;
  // The haunch. Radius is whichever runs out first: 42 % of the cell, or 66 % of the panel.
  // On every archetype in the set the panel is what runs out, which is why the arch is
  // flat-headed rather than semicircular — as it is in both reference plates.
  const r = Math.max(0.10, Math.min(cw * 0.42, h * 0.66));
  const yHead = yBot + r;

  for (let i = endLegs ? 0 : 1; i <= (endLegs ? cells : cells - 1); i += 1) {
    push(list, box(rib * 0.92, h, depth, x0 + cw * i, (yTop + yBot) / 2, z, legName));
  }

  for (let i = 0; i < cells; i += 1) {
    const a = x0 + cw * i;
    const b = a + cw;
    // Two quarter-coves at the heavy gauge. Each leaves its leg vertically and arrives at the
    // soffit line horizontally, so the outline is made only of verticals and arcs and cannot
    // collapse to a point at any segment count.
    for (const [xe, hand] of [[a, 1], [b, -1]]) {
      const cx = xe + hand * r;
      push(list, arcBars(cx, yHead - r, z, r,
        hand > 0 ? Math.PI : 0, Math.PI * 0.5, segs, rib, depth, coveName));
    }
    // The flat crown between the two haunches, at the same gauge, so the arch reads as one
    // continuous rib from post to post rather than two brackets facing each other.
    const flat = cw - 2 * r;
    if (flat > rib) {
      push(list, box(flat + rib * 0.6, rib, depth, a + cw / 2, yHead, z, soffitName));
      // The keystone drop. In `mp-terrace-single` a cast boss hangs at every crown, and it is
      // the one place the frieze goes heavier than its own rib.
      push(list, rotBox(rib * 1.5, rib * 1.5, depth, a + cw / 2, yHead - rib * 0.85, z,
        { z: Math.PI / 4 }, bossName));
      // The fringe, along the arch soffit — small cusps hanging off the crown bar.
      //
      // This is the density that a 0.42 m band cannot get from a spandrel field. `drop` is a
      // lane parameter and the reference's band is half as deep again as ours, so the strip
      // above the crown is 0.12 m: a bead course fits there and a scroll field does not. What
      // does fit is a scalloped lower edge, which is where §2.5's "fringe" lives anyway and
      // which sits on the one line of the frieze that has open sky under it.
      const cusps = Math.max(2, Math.round(flat / 0.28));
      const cw2 = flat / cusps;
      for (let k = 0; k < cusps; k += 1) {
        const px = a + r + cw2 * (k + 0.5);
        if (Math.abs(px - (a + cw / 2)) < rib * 1.1) continue;
        push(list, rotBox(rib * 0.95, rib * 0.95, depth * 0.9, px, yHead - rib * 0.55, z,
          { z: Math.PI / 4 }, fieldName));
      }
    }
    // Filigree inside each haunch — a concentric arc close enough to the rib to read as a
    // beaded inner edge rather than as a second, thinner arch.
    if (haunchFill) {
      for (const [xe, hand] of [[a, 1], [b, -1]]) {
        const cx = xe + hand * r;
        push(list, arcBars(cx, yHead - r, z, r * 0.70,
          hand > 0 ? Math.PI : 0, Math.PI * 0.5, Math.max(2, segs - 2), t * 1.2, depth, fieldName));
      }
    }
  }

  // The spandrel band: the strip between the arch soffit line and the head rail. This is the
  // layer that makes the band read as cast filigree at hero distance, and it is deliberately
  // the layer that does NOT carry the read at board distance — it sits above the arch, so
  // losing it to the pixel grid costs the silhouette nothing.
  //
  // A run of turned roundels rather than a crossed lattice, because the strip the lane's
  // `drop` leaves above the arch is 80–140 mm: a diagonal drawn across a cell four times wider
  // than it is tall lies down almost flat and draws a second head rail. A bead course at this
  // proportion is also what `mp-terrace-single` puts directly under its rail.
  const bandH = yTop - yHead - rib * 0.5;
  if (bandH > 0.045) {
    const yb = yHead + rib * 0.5;
    if (beadCourse) {
      // Pitch follows the BEAD, not a constant: the bead can only be as tall as the strip the
      // lane's `drop` leaves above the arch, so a fixed pitch gives a row of dots on one
      // archetype and a solid bar on another. 2.2 × the bead is a dentil rhythm, about 45 %
      // coverage, and that is as dense as this course can be and still be paid for — a Carlton
      // frieze span is 3.08 m and every extra bead on it is charged eight times over.
      const beadPitch = Math.min(0.34, Math.max(0.16, bandH * 2.2));
      const fCells = Math.max(2, Math.round(span / beadPitch));
      const fw = span / fCells;
      const bw = Math.min(bandH * 0.98, fw * 0.80);
      for (let i = 0; i < fCells; i += 1) {
        push(list, rotBox(bw, bw, depth, x0 + fw * (i + 0.5), (yb + yTop) / 2, z,
          { z: Math.PI / 4 }, fieldName));
      }
    } else {
      // At `q: 'low'` a nineteen-bead course across a 3.08 m span costs 228 triangles per span
      // and eight spans of it is most of what the balustrade fix needs on the same archetype.
      // One fine sub-rail keeps a third weight in the band and gives the head rail a moulded
      // two-line profile for twelve.
      push(list, slab(span, rib * 0.42, depth * 0.9, x0 + span / 2, yb, z, fieldName));
    }
  }
  return cells;
}

function laceMotif(list, family, bx0, bx1, yBot, yTop, z, t, depth,
  dense, heritage = false, compact = false) {
  const cx = (bx0 + bx1) / 2;
  const cy = (yBot + yTop) / 2;
  const w = bx1 - bx0;
  const h = yTop - yBot;
  if (w < 0.06 || h < 0.06) return;

  // The balustrade field — a run of round-headed cells between fine mullions, and NOT the
  // frieze arch scaled down. The frieze wants one wide flat-headed opening per bay because it
  // is a band read against sky; a balustrade is read against a lit wall and wants tall narrow
  // openings, which is what both reference plates show.
  //
  // The r1 field was two cells per 1.05 m panel with the cove at `segments: 2`. A quarter-arc
  // at two segments is two 45° facets, so a pair of them draws a flat top with a chamfer at
  // each corner: on `v330-r2-ornament-before/terrace-carlton-heritage--detail.png` the openings
  // read as blunt cut-outs, exactly as the blind critic called them. Cells are now sized off
  // the panel HEIGHT so they come out taller than wide, and the cove takes three segments —
  // at the resulting 0.23 m radius that is a 8 mm deviation from a true arc, under a pixel.
  const cellPitch = Math.max(0.24, h * 0.62);
  const cells = Math.max(1, Math.round(w / cellPitch));
  const cw = w / cells;
  const mull = t * (compact ? 1.15 : 1.3);
  const yFoot = yBot + t * 0.6;
  const inner = yTop - yFoot;
  // Interior mullions only — the caller stands a standard at each panel edge, so an edge
  // mullion is a second vertical inside the first. Dropping them across the run is what buys
  // the third cove segment that closes the "flat-headed holes with 45-degree corners" finding.
  for (let i = 1; i < cells; i += 1) {
    push(list, box(mull, inner, depth, bx0 + cw * i, (yTop + yFoot) / 2, z,
      heritage ? 'carlton-bal-mullion' : 'bal-mullion'));
  }
  const r = Math.min(cw * 0.5, inner * 0.58);
  for (let i = 0; i < cells; i += 1) {
    scrollPair(list, {
      x0: bx0 + cw * i, x1: bx0 + cw * (i + 1), y: yTop, z, radius: r,
      thick: t, depth, segments: dense ? 4 : 3,
      name: heritage ? 'carlton-scroll' : 'lace-scroll',
    });
  }

  if (compact || heritage) return;

  // The common skeleton is the authored panel for this round. Keeping the older family
  // branches below as documentation preserves the motif vocabulary without paying for a
  // second, nearly coincident layer of bars in the same bay.
  return;

  if (family === 'fan') {
    const rays = dense ? 7 : 5;
    for (let i = 0; i < rays; i += 1) {
      const a = Math.PI * (0.13 + 0.74 * (i / (rays - 1)));
      const [ex, ey] = rayExit(cx, yBot, a, bx0, bx1, yTop);
      push(list, bar(cx, yBot, ex, ey, z, t * 0.85, depth, 'lace-ray'));
    }
    const r = Math.min(h * 0.66, w * 0.44);
    push(list, arcBars(cx, yBot, z, r, Math.PI * 0.10, Math.PI * 0.90, dense ? 8 : 5, t * 0.85, depth, 'lace-fan-arc'));
    if (dense) {
      push(list, arcBars(cx, yBot, z, r * 0.52, Math.PI * 0.08, Math.PI * 0.92, 5, t * 0.75, depth, 'lace-fan-inner'));
    }
    push(list, ball(t * 1.6, cx, yBot + t, z, 'lace-boss', 6));
    return;
  }

  if (family === 'ogee') {
    // Two arcs struck from the opposite springings meet at 0.866·w — a pointed arch that
    // fills the bay, where a semicircle of half the bay would leave the top rail stranded.
    const R = Math.min(w, h / 0.866);
    const apex = Math.min(yTop, yBot + R * 0.866);
    const half = Math.acos(Math.min(1, (w / 2) / R));
    push(list, arcBars(bx0, yBot, z, R, 0, Math.PI / 2 - half, dense ? 6 : 4, t, depth, 'lace-ogee-l'));
    push(list, arcBars(bx1, yBot, z, R, Math.PI, Math.PI / 2 + half, dense ? 6 : 4, t, depth, 'lace-ogee-r'));
    if (dense || heritage) {
      const r2 = R * 0.64;
      const innerSegs = heritage && !dense ? 3 : 4;
      push(list, arcBars(bx0, yBot, z, r2, 0, Math.PI / 2 - half, innerSegs, t * 0.8, depth, 'lace-ogee-il'));
      push(list, arcBars(bx1, yBot, z, r2, Math.PI, Math.PI / 2 + half, innerSegs, t * 0.8, depth, 'lace-ogee-ir'));
      push(list, bar(cx, apex - h * 0.30, cx, apex, z, t * 0.8, depth, 'lace-ogee-stem'));
    }
    push(list, ball(t * 1.5, cx, apex - t, z, 'lace-ogee-boss', 6));
    // Spandrels, or the corners above the arch read as holes rather than piercing.
    push(list, bar(bx0, yTop, bx0 + w * 0.30, yTop - h * 0.26, z, t * 0.75, depth, 'lace-spandrel'));
    push(list, bar(bx1, yTop, bx1 - w * 0.30, yTop - h * 0.26, z, t * 0.75, depth, 'lace-spandrel'));
    return;
  }

  if (family === 'trellis') {
    push(list, bar(bx0, yBot, bx1, yTop, z, t * 0.85, depth, 'lace-diag'));
    push(list, bar(bx0, yTop, bx1, yBot, z, t * 0.85, depth, 'lace-diag'));
    push(list, bar(bx0, cy, bx1, cy, z, t * 0.8, depth, 'lace-mid'));
    push(list, ball(t * 2.0, cx, cy, z, 'lace-ring', 6));
    if (dense) {
      const r = Math.min(w, h) * 0.24;
      push(list, arcBars(cx, yTop, z, r, Math.PI * 1.15, Math.PI * 1.85, 4, t * 0.7, depth, 'lace-quad'));
      push(list, arcBars(cx, yBot, z, r, Math.PI * 0.15, Math.PI * 0.85, 4, t * 0.7, depth, 'lace-quad'));
    }
    return;
  }

  // quatrefoil
  const rq = Math.min(w, h) * 0.27;
  const lobes = [[cx - rq, cy], [cx + rq, cy], [cx, cy - rq], [cx, cy + rq]];
  const spans = [[Math.PI * 0.62, Math.PI * 1.38], [-Math.PI * 0.38, Math.PI * 0.38],
    [Math.PI * 1.12, Math.PI * 1.88], [Math.PI * 0.12, Math.PI * 0.88]];
  for (let i = 0; i < 4; i += 1) {
    push(list, arcBars(lobes[i][0], lobes[i][1], z, rq, spans[i][0], spans[i][1],
      dense ? 5 : 3, t * 0.85, depth, 'lace-lobe'));
  }
  push(list, ball(t * 1.7, cx, cy, z, 'lace-boss', 6));
  if (dense) {
    push(list, bar(bx0, yBot, cx - rq * 1.1, cy - rq * 1.1, z, t * 0.7, depth, 'lace-tie'));
    push(list, bar(bx1, yBot, cx + rq * 1.1, cy - rq * 1.1, z, t * 0.7, depth, 'lace-tie'));
    push(list, bar(bx0, yTop, cx - rq * 1.1, cy + rq * 1.1, z, t * 0.7, depth, 'lace-tie'));
    push(list, bar(bx1, yTop, cx + rq * 1.1, cy + rq * 1.1, z, t * 0.7, depth, 'lace-tie'));
  }
}

/**
 * The corner bracket where the frieze dies into a post. Cast heavier than the frieze and to
 * a different pattern — the reference reads wrong the moment a bracket is just more frieze.
 * `x` is the post face, `y` the beam soffit; `hand` +1 sweeps toward +X, −1 toward −X.
 */
export function laceBracket(ctx, {
  x = 0, y = 0, z = 0, size = 0.55, hand = 1, depth = 0.06, bar: barThick = null,
} = {}) {
  const out = { iron: [] };
  if (!(size > 0.12)) return out;
  const t = (barThick ?? 0.036) * 1.45;
  const s = size;
  if (ctx.q === 'low') {
    // Returning nothing at the low tier is why Carlton's upper verandah — which the lane
    // builds at `q: 'low'` — had posts meeting the beam at a bare right angle. In every `mp-`
    // plate a bracket springs off each capital into the frieze, and that spring is most of
    // what makes a colonnade read as a verandah. Three members carry it for 36 triangles.
    const bx = x + hand * s;
    push(out.iron, bar(x, y - s * 0.86, bx, y, z, t, depth, 'bracket-rake'));
    push(out.iron, box(t * 1.7, s * 0.62, depth * 1.1, x + hand * t, y - s * 0.31, z,
      'bracket-cleat'));
    push(out.iron, box(s * 0.86, t * 1.5, depth * 1.1, x + hand * s * 0.43, y - t, z,
      'bracket-head'));
    return out;
  }
  const cx = x + hand * s;
  const cy = y - s;
  const a0 = hand > 0 ? Math.PI : 0;
  const a1 = Math.PI / 2;
  const dense = ctx.q === 'high';

  push(out.iron, arcBars(cx, cy, z, s, a0, a1, dense ? 7 : 4, t * 1.25, depth, 'bracket-rim'));
  // Radial fill between the corner and the rim: this is the bracket's body, not decoration.
  const rays = dense ? 4 : 2;
  for (let i = 1; i <= rays; i += 1) {
    const f = i / (rays + 1);
    const a = a0 + (a1 - a0) * f;
    push(out.iron, bar(x, y, cx + Math.cos(a) * s, cy + Math.sin(a) * s, z, t * 0.8, depth, 'bracket-ray'));
  }
  // The scroll — a curl tightening into the corner.
  if (dense) {
    for (let k = 0; k < 3; k += 1) {
      const r = s * (0.62 - k * 0.17);
      const span = (a1 - a0) * (0.82 - k * 0.16);
      push(out.iron, arcBars(cx, cy, z, r, a0 + (a1 - a0) * 0.09, a0 + span, 4, t * 0.7, depth, 'bracket-scroll'));
    }
    push(out.iron, ball(t * 1.9, cx + Math.cos(a0) * s * 0.22, cy + Math.sin(a0) * s * 0.22, z, 'bracket-eye', 6));
  }
  push(out.iron, box(t * 1.8, s * 0.9, depth * 1.1, x + hand * t, y - s * 0.45, z, 'bracket-cleat'));
  push(out.iron, box(s * 0.9, t * 1.6, depth * 1.1, x + hand * s * 0.45, y - t, z, 'bracket-head'));
  return out;
}

/**
 * The low cast-iron balustrade between verandah posts. `yBase` is the verandah deck.
 *
 * ── the solid fraction is the defect ───────────────────────────────────────────────────
 * At Carlton's `q: 'low'` this ran a 100 mm bottom rail, a 100 mm top rail and a 90 mm cap:
 * 0.29 m of unbroken metal out of an 0.88 m band, and the pierced remainder was two cells per
 * 1.05 m panel. On `v330-r2-ornament-before/terrace-carlton-heritage--detail.png` the cap and
 * top rail together are a solid black bar as deep as the openwork under them, and §2.5's
 * "continuous pierced filigree" cannot be read off a band that is a third metal before a
 * single standard is drawn.
 *
 * `mp-terrace-carlton-heritage` runs a slim cap over a slim top rail and gives the rest to the
 * field. Here that is 0.163 m of rail — 19 % rather than 33 % — which lifts the pierced height
 * from 0.55 m to 0.70 m at no triangle cost at all, because thinning a slab is free.
 */
export function laceBalustrade(ctx, {
  width, x = 0, yBase = 0, z = 0, height = 0.86, depth = 0.05, salt = 311,
} = {}) {
  const out = { iron: [] };
  if (!(width > 0.2) || !(height > 0.2)) return out;

  const railT = 0.056;
  const capT = 0.052;
  const yTopRail = yBase + height - capT - railT;
  push(out.iron, slab(width, railT, depth * 1.1, x, yBase + 0.030, z, 'bal-bottom-rail'));
  push(out.iron, slab(width, railT, depth * 1.1, x, yTopRail, z, 'bal-top-rail'));
  // The cap keeps its projection — it is the member that reads as the handrail in profile —
  // but not its section.
  push(out.iron, slab(width, capT, depth * 1.55, x, yTopRail + railT, z, 'bal-cap'));

  const clear = yTopRail - (yBase + 0.030 + railT);
  if (clear <= 0.02) return out;

  // A balustrade is a run of pierced cast panels, not a comb. The standards carry the load
  // path and are the middle weight: heavier than the field, lighter than the cap.
  const panelPitch = lod(ctx, 0.68, 0.82, 1.02);
  const n = Math.max(2, Math.round(width / panelPitch));
  const t = lod(ctx, 0.030, 0.033, 0.036);
  const standT = t * 2.1;
  const panelW = width / n;
  const innerBot = yBase + 0.030 + railT + t * 0.45;
  const innerTop = yTopRail - t * 0.30;
  for (let i = 0; i <= n; i += 1) {
    const bx = x - width / 2 + panelW * i;
    push(out.iron, box(standT, clear, depth, bx, yBase + 0.030 + railT + clear / 2, z, 'bal-standard'));
    if (i < n) {
      const bx0 = bx + standT * 0.55;
      const bx1 = bx + panelW - standT * 0.55;
      laceMotif(out.iron, 'ogee', bx0, bx1, innerBot, innerTop, z, t,
        Math.max(0.05, depth), ctx.q === 'high', false, true);
    }
  }
  void salt;
  return out;
}

/**
 * The contemporary answer: slim black steel, top and bottom rail, close verticals or a run
 * of horizontal wires. Lane D's balconies.
 */
export function steelBalustrade(ctx, {
  width, x = 0, yBase = 0, z = 0, height = 1.05, depth = 0.04, style = 'vertical',
} = {}) {
  const out = { iron: [] };
  if (!(width > 0.2) || !(height > 0.2)) return out;
  const t = lod(ctx, 0.026, 0.034, 0.045);
  push(out.iron, slab(width, 0.05, depth * 1.3, x, yBase + height - 0.05, z, 'steel-top-rail'));
  push(out.iron, slab(width, 0.04, depth * 1.2, x, yBase + 0.02, z, 'steel-bottom-rail'));

  if (style === 'wire') {
    const rows = lod(ctx, 7, 5, 3);
    for (let i = 1; i <= rows; i += 1) {
      const ry = yBase + 0.06 + ((height - 0.16) * i) / (rows + 1);
      push(out.iron, box(width, t * 0.7, t * 0.7, x, ry, z, 'steel-wire'));
    }
  } else {
    const pitch = lod(ctx, 0.11, 0.16, 0.24);
    const n = Math.max(2, Math.round(width / pitch));
    for (let i = 0; i <= n; i += 1) {
      const bx = x - width / 2 + (width * i) / n;
      push(out.iron, box(t, height - 0.11, depth * 0.8, bx, yBase + 0.06 + (height - 0.11) / 2, z, 'steel-picket'));
    }
  }
  const postT = t * 2.6;
  push(out.iron, box(postT, height, depth * 1.1, x - width / 2, yBase + height / 2, z, 'steel-post'));
  push(out.iron, box(postT, height, depth * 1.1, x + width / 2, yBase + height / 2, z, 'steel-post'));
  return out;
}

/* ══════════════════════════════ posts, piers and beams ════════════════════════════ */

/**
 * Turned profiles as [radiusMultiple, heightFraction]. Both carry two swellings, because a
 * single-bulge shaft reads as a bollard and a straight one reads as a stick.
 */
const TURNED_PROFILES = Object.freeze({
  // Melbourne cast-iron verandah column. The old profile ran 1.02 → 1.00 → 0.90 through the
  // whole shaft: a straight tube with no entasis to catch a highlight, which is why the r1
  // plates show a black stick whatever segment count it was drawn at. The turning has to be
  // exaggerated to survive the plate — a post is ten pixels wide in the hero view and sits
  // against a dark verandah, so a 14 % bulge is not a bulge. This one carries a collar bead at
  // 1.52, a belly at 1.22 and a neck at 0.92, a third of the shaft width between them, and
  // the beads stay just inside the 1.55 half-width of the base block so nothing overhangs it.
  // The head flare is gone because `turnedPost` now models the capital as its own bell and
  // abacus, and a profile ending in a flare put a wider shaft above a narrower cap.
  cast: Object.freeze([
    [1.45, 0.000], [1.45, 0.030], [1.10, 0.058],
    [1.52, 0.096], [1.06, 0.136],
    [1.22, 0.330], [1.14, 0.560], [0.92, 0.780],
    [1.46, 0.836], [1.00, 0.878], [0.90, 1.000],
  ]),
  // Federation turned timber: a bead pair low, a longer swelling shaft, a necked head.
  timber: Object.freeze([
    [1.50, 0.000], [1.50, 0.046], [1.08, 0.078],
    [1.52, 0.112], [1.04, 0.150], [1.48, 0.184], [1.02, 0.222],
    [1.20, 0.470], [1.10, 0.690], [0.90, 0.800],
    [1.50, 0.850], [0.98, 0.892], [0.88, 1.000],
  ]),
});

/**
 * A verandah post that is never a plain rectangle: a square base block, a turned shaft with
 * two swellings, a capital and a square abacus the beam actually lands on.
 * Returns under `iron`; a timber lane emits with `{ iron: 'joinery' }` or `{ iron: 'trim' }`.
 */
export function turnedPost(ctx, {
  x = 0, yBase = 0, z = 0, height = 2.75, radius = 0.062, profile = 'cast',
} = {}) {
  const out = { iron: [] };
  if (!(height > 0.2) || !(radius > 0.005)) return out;
  if (isFederationVilla(ctx) && profile === 'timber') {
    // The villa caller remaps this bundle's `iron` key into `trim`. Keep that target material
    // pale here just as the square-post branch does; otherwise a turned timber post inherits
    // the palette's dark joinery green and disappears into the verandah recess.
    ctx.p.trim.color.set('#d9c9aa');
    ctx.p.trim.roughness = 0.90;
    ctx.p.trim.metalness = 0.0;
    ctx.p.trim.envMapIntensity = 0.18;
    ctx.p.trim.needsUpdate = true;
  }

  // §2.5, and the r1 plates. `mp-terrace-single` and `mp-cottage-federation` both show a post
  // whose SILHOUETTE steps four times between deck and beam: a square plinth, a base block, a
  // swelling shaft, and a moulded capital under a square abacus the beam bears on. Ours had a
  // base and an abacus but nothing at the head, and — the actual fault — the low tier returned
  // a four-sided prism outright, so Carlton's posts, which the lane builds at `q: 'low'`, were
  // literally rectangular sticks. A stepped silhouette is what separates a column from a bar
  // at board altitude; the turning inside it is the hero-distance payoff, not the read.
  const blockW = radius * 3.1;
  const plinthH = Math.min(0.09, height * 0.038);
  const baseH = Math.min(0.14, height * 0.058);
  const abacusH = Math.min(0.075, height * 0.032);
  const capH = Math.min(0.14, height * 0.058);

  push(out.iron, slab(blockW * 1.18, plinthH, blockW * 1.18, x, yBase, z, 'post-plinth'));
  push(out.iron, slab(blockW, baseH, blockW, x, yBase + plinthH, z, 'post-base'));

  const abacusY = yBase + height - abacusH;
  push(out.iron, slab(blockW * 1.26, abacusH, blockW * 1.26, x, abacusY, z, 'post-abacus'));

  const shaftBase = yBase + plinthH + baseH;
  const shaftH = abacusY - capH - shaftBase;
  if (shaftH <= 0.05) {
    push(out.iron, prism(8, radius * 1.2, radius * 1.2, Math.max(0.05, abacusY - shaftBase),
      x, shaftBase, z, Math.PI / 8, 'post-shaft'));
    return out;
  }

  // The bell capital. It flares from the shaft neck out to the abacus, so the beam load has a
  // visible path down onto the column instead of a square block sitting on a tube.
  push(out.iron, taper(radius * 1.05, blockW * 0.62, capH, x, abacusY - capH, z,
    'post-capital', lod(ctx, 8, 8, 6)));

  const raw = TURNED_PROFILES[profile] ?? TURNED_PROFILES.cast;
  const pts = ctx.q === 'high'
    ? raw
    : raw.filter((_, i) => i % 2 === 0 || i === raw.length - 1);
  const scaled = pts.map(([r, t]) => [r * radius, t * shaftH]);
  push(out.iron, lathe(scaled, x, shaftBase, z, lod(ctx, 8, 8, 6), 'post-shaft'));
  return out;
}

/**
 * The Federation and bungalow post: a squared timber shaft whose middle is chamfered to an
 * octagon and stopped short of both ends. Built as three sections rather than cut, because
 * a stop-chamfer is a subtraction and there is no CSG in this kit.
 */
export function timberPost(ctx, {
  x = 0, yBase = 0, z = 0, height = 2.4, size = 0.16, stop = null, plinth = true,
} = {}) {
  const out = { trim: [], boundary: [], wall: [], wallAlt: [] };
  const edge = ctx.archetypeId === 'cottage-federation' ? out.boundary : out.trim;
  if (!(height > 0.2) || !(size > 0.02)) return out;

  if (isFederationVilla(ctx)) {
    // Federation joinery is a light painted system. Keeping the existing material object
    // preserves batching while lifting posts, lattice, architraves and gate pickets together
    // out of the black verandah recess.
    ctx.p.trim.color.set('#d9c9aa');
    ctx.p.trim.roughness = 0.90;
    ctx.p.trim.metalness = 0.0;
    ctx.p.trim.envMapIntensity = 0.18;
    ctx.p.trim.needsUpdate = true;
    // Ref-13 uses a stop-chamfered 140 mm shaft between a broad plinth and capital.  Return
    // the complete post here so the generic square-stick path below cannot add a second cap.
    const plinthH = 0.30;
    const capitalH = 0.16;
    const shaftSize = 0.14;
    const shaftH = Math.max(0.24, height - plinthH - capitalH);
    push(out.trim, slab(0.24, plinthH, 0.24, x, yBase, z, 'villa-post-base-plinth'));
    if (ctx.q === 'low') {
      push(out.trim, slab(shaftSize, shaftH, shaftSize, x, yBase + plinthH, z,
        'villa-post-chamfered-shaft'));
    } else {
      const flatRadius = (shaftSize / 2) / Math.cos(Math.PI / 8);
      push(out.trim, prism(8, flatRadius, flatRadius, shaftH, x, yBase + plinthH, z,
        Math.PI / 8, 'villa-post-chamfered-shaft'));
    }
    push(out.trim, slab(0.26, capitalH, 0.26, x, yBase + plinthH + shaftH, z,
      'villa-post-moulded-capital'));
    if (ctx.q !== 'low') {
      push(out.trim, slab(0.22, 0.04, 0.22, x, yBase + plinthH + shaftH - 0.04, z,
        'villa-post-capital-neck'));
    }
    return out;
  }

  // Brighton's porch is carried by four squat rendered piers on clinker plinths. The lane
  // calls this helper twice at the outer support axes, so each call authors that support and
  // its one 1.8 m inboard partner: four piers without changing the lane roster. Keep the
  // clinker in wallAlt, render in wall and the oversailing cap in trim so the assembly stays
  // inside the existing palette.
  if (isBrightonBungalow(ctx)) {
    const hand = x < 0 ? 1 : -1;
    for (const px of [x, x + hand * 1.80]) {
      push(out.wallAlt, slab(0.42, 0.90, 0.42, px, yBase, z, 'brighton-pier-clinker-plinth'));
      // A 100 mm base moulding mediates between the clinker pedestal and the rendered
      // batter. The whole support terminates 20 mm below the beam soffit; the 100 mm cap is
      // therefore visible as a bearing transition instead of a cream sliver through timber.
      const baseMouldH = 0.10;
      const capH = 0.10;
      const assemblyTop = yBase + height - 0.02;
      const shaftBase = yBase + 0.90 + baseMouldH;
      const shaftH = Math.max(0.30, assemblyTop - capH - shaftBase);
      push(out.trim, slab(0.38, baseMouldH, 0.38, px, yBase + 0.90, z,
        'brighton-pier-base-moulding'));
      const frusta = ctx.q === 'high' ? 4 : 2;
      for (let i = 0; i < frusta; i += 1) {
        const t = (i + 0.5) / frusta;
        const w = 0.32 + (0.26 - 0.32) * t;
        push(out.wall, slab(w, shaftH / frusta, w, px,
          shaftBase + i * shaftH / frusta, z, 'brighton-pier-rendered-taper'));
      }
      push(out.trim, slab(0.33, capH, 0.33, px, shaftBase + shaftH, z,
        'brighton-pier-cap'));
    }
    return out;
  }

  if (isFederationCottage(ctx)) {
    // `mp-cottage-federation` carries its verandah on TURNED posts — a square base block, a
    // swelling shaft with a bead pair low, a moulded capital and a square head under the beam.
    // This branch used to force the generic square stick down to 90 mm, which is thinner than
    // any Federation verandah post was ever cut and is the "plain bar" read on the r1 plate.
    // The turning is the cottage's only piece of lathe work and it sits at eye height in the
    // hero view, so it is where the triangles reclaimed from the fret lobes go.
    const blockW = 0.16;
    const plinthH = 0.075;
    const baseH = 0.105;
    const headH = 0.06;
    const capH = 0.10;
    const headY = yBase + height - headH;
    push(edge, slab(blockW * 1.12, plinthH, blockW * 1.12, x, yBase, z, 'post-plinth'));
    push(out.trim, slab(blockW, baseH, blockW, x, yBase + plinthH, z, 'cottage-post-base-block'));
    push(edge, slab(blockW * 1.16, headH, blockW * 1.16, x, headY, z, 'post-cap'));
    const shaftBase = yBase + plinthH + baseH;
    const shaftH = headY - capH - shaftBase;
    if (shaftH > 0.10) {
      const r = 0.056;
      push(out.trim, taper(r * 1.05, blockW * 0.60, capH, x, headY - capH, z,
        'cottage-post-capital', ctx.q === 'low' ? 6 : 8));
      const raw = TURNED_PROFILES.timber;
      const pts = ctx.q === 'low' ? raw.filter((_, i) => i % 2 === 0 || i === raw.length - 1) : raw;
      push(out.trim, lathe(pts.map(([pr, pt]) => [pr * r, pt * shaftH]), x, shaftBase, z,
        ctx.q === 'low' ? 6 : 8, 'cottage-post-turned-shaft'));
    } else {
      push(out.trim, prism(8, 0.06, 0.06, Math.max(0.05, headY - shaftBase), x, shaftBase, z,
        Math.PI / 8, 'cottage-post-shaft'));
    }
    return out;
  }

  const stopH = stop ?? Math.min(0.42, height * 0.20);
  const capH = Math.min(0.09, height * 0.05);
  let y = yBase;
  let clear = height;

  if (plinth) {
    const plinthH = isFederationCottage(ctx) ? 0.09 : Math.min(0.14, height * 0.06);
    const plinthW = isFederationCottage(ctx) ? 0.14 : size * 1.34;
    push(edge, slab(plinthW, plinthH, plinthW, x, y, z, 'post-plinth'));
    y += plinthH;
    clear -= plinthH;
  }
  push(out.trim, slab(size, stopH, size, x, y, z, 'post-stop'));
  push(out.trim, slab(size, stopH, size, x, yBase + height - capH - stopH, z, 'post-stop'));
  const capW = isFederationCottage(ctx) ? 0.14 : size * 1.22;
  const resolvedCapH = isFederationCottage(ctx) ? 0.07 : capH;
  push(edge, slab(capW, resolvedCapH, capW, x, yBase + height - resolvedCapH, z, 'post-cap'));

  const midH = clear - stopH * 2 - capH;
  if (midH > 0.05) {
    // Flat-to-flat of an octagon is 2r·cos(22.5°); solve for r so the chamfered shaft sits
    // exactly inside the square stops instead of poking through their corners.
    const r = (size / 2) / Math.cos(Math.PI / 8);
    push(out.trim, ctx.q === 'low'
      ? slab(size, midH, size, x, y + stopH, z, 'post-shaft')
      : prism(8, r, r, midH, x, y + stopH, z, Math.PI / 8, 'post-shaft'));
  }
  if (ctx.q === 'high' && !isFederationCottage(ctx)) {
    push(edge, slab(size * 1.1, 0.045, size * 1.1, x, y + stopH - 0.045, z, 'post-neck'));
    push(edge, slab(size * 1.1, 0.045, size * 1.1, x, yBase + height - capH - stopH, z, 'post-neck'));
  }
  return out;
}

/**
 * The battered clinker-brick pier of a Californian bungalow. Stepped rather than smoothly
 * tapered: the steps land on brick courses, so the batter and the coursing are the same
 * statement instead of fighting each other.
 * Returns the shaft under `wall` — remap to `wallAlt` when the pier is a darker clinker
 * than the house wall, which is the usual case.
 */
export function taperedPier(ctx, {
  x = 0, yBase = 0, z = 0, height = 1.35, baseW = 0.86, topW = 0.68, baseD = null, topD = null,
  cap = true,
} = {}) {
  const out = { wall: [], trim: [] };
  if (!(height > 0.1) || !(baseW > 0.05)) return out;

  const bd = baseD ?? baseW;
  const td = topD ?? topW;
  const plinthH = Math.min(0.12, height * 0.10);
  push(out.wall, slab(baseW * 1.07, plinthH, bd * 1.07, x, yBase, z, 'pier-plinth'));

  const capH = cap ? Math.min(0.11, height * 0.09) : 0;
  const bands = lod(ctx, 6, 4, 1);
  const shaftH = height - plinthH - capH;
  for (let i = 0; i < bands; i += 1) {
    const f0 = i / bands;
    const f1 = (i + 0.5) / bands;
    const w = baseW + (topW - baseW) * f1;
    const d = bd + (td - bd) * f1;
    push(out.wall, slab(w, shaftH / bands, d, x, yBase + plinthH + shaftH * f0, z, 'pier-course'));
  }
  if (cap) {
    push(out.trim, slab(topW * 1.16, capH * 0.62, td * 1.16, x, yBase + height - capH, z, 'pier-cap'));
    push(out.trim, slab(topW * 1.05, capH * 0.38, td * 1.05, x, yBase + height - capH * 0.38, z, 'pier-cap-weather'));
  }
  return out;
}

/**
 * The beam the frieze hangs from and the posts carry. Small, but the verandah has no
 * construction logic without it — a frieze floating under a roof is the first thing a
 * critic names.
 */
export function verandahBeam(ctx, {
  width, x = 0, y = 0, z = 0, depth = 0.16, height = 0.20,
} = {}) {
  const out = { trim: [], wallAlt: [] };
  if (!(width > 0.2)) return out;
  push(out.trim, slab(width, height, depth, x, y, z - depth / 2, 'verandah-beam'));
  if (ctx.q !== 'low') {
    push(out.trim, slab(width, 0.04, depth * 1.25, x, y + height, z - depth * 0.62, 'verandah-beam-cap'));
    push(out.trim, slab(width, 0.035, depth * 1.15, x, y - 0.035, z - depth * 0.57, 'verandah-beam-bead'));
  }
  if (isCalifornianBungalow(ctx)) {
    // Two solid brick cheeks make the raised porch an outdoor room. The 1.60 m central
    // opening is the stair/gate axis; both walls meet the battered piers and carry a rendered
    // coping rather than leaving a floating deck edge.
    const opening = Math.min(1.60, width - 0.40);
    const run = Math.max(0.20, (width - opening) / 2);
    const yBase = y - 2.10;
    for (const hand of [-1, 1]) {
      const cx = x + hand * (opening / 2 + run / 2);
      push(out.wallAlt, slab(run, 0.85, 0.35, cx, yBase, z + 0.02,
        'californian-porch-balustrade'));
      push(out.trim, slab(run + 0.04, 0.09, 0.42, cx, yBase + 0.85, z + 0.02,
        'californian-balustrade-coping'));
    }
  }
  return out;
}

/* ═════════════════════════════════ timber fretwork ═══════════════════════════════ */

/** Valance patterns. 'batten' is the Federation default; 'scallop' the Edwardian cottage. */
export const VALANCE_STYLES = Object.freeze(['batten', 'scallop', 'lattice']);

/**
 * The cut-out timber valance of a Federation verandah — the timber cousin of the lace
 * frieze. `y` is the beam soffit and the valance hangs below it.
 */
export function fretworkValance(ctx, {
  width, x = 0, y = 0, z = 0, depth = 0.04, drop = 0.34,
  style = null, salt = 321,
} = {}) {
  const out = { trim: [] };
  if (!(width > 0.24) || !(drop > 0.08)) return out;

  const headH = Math.min(0.13, drop * 0.36);
  push(out.trim, slab(width, headH, depth * 1.5, x, y - headH, z, 'valance-head'));
  const yTop = y - headH;
  const field = drop - headH;
  if (field <= 0.03) return out;
  if (ctx.q === 'low') return out;

  if (isFederationCottage(ctx)) {
    // A run of turned battens, not a chevron of 18 mm chords.
    //
    // The chords were 18 mm at a 110 mm pitch. On `cottage-federation--three-quarter.png` the
    // verandah is about 59 px per metre, so each member rendered ONE PIXEL wide and the whole
    // frieze — 2 064 triangles of it — did not appear on the plate at all. §2.5 scores
    // ornament that does not read as absent, and it was right to. `mp-cottage-federation`
    // shows a frieze whose members you can count: a heavy head, a run of battens about a
    // third as wide as their gap, and an alternating drop that gives the lower edge a rhythm.
    // Widening the member and halving the count reads better AND returns ~1 200 triangles.
    const pitch = 0.145;
    const cells = Math.max(3, Math.round(width / pitch));
    const step = width / cells;
    const t = 0.042;
    const archDrop = Math.min(field, 0.20);
    for (let i = 0; i <= cells; i += 1) {
      const bx = x - width / 2 + i * step;
      const long = i % 3 === 0;
      const h = long ? archDrop : archDrop * 0.58;
      push(out.trim, box(t, h, depth, bx, yTop - h / 2, z, 'cottage-frieze-batten'));
    }
    // The foot rail catches the short battens, so the run has a continuous lower line with a
    // longer batten breaking it every third bay rather than a free-hanging comb.
    push(out.trim, slab(width, 0.022, depth * 1.1, x, yTop - archDrop * 0.58, z,
      'cottage-frieze-foot'));
    return out;
  }

  const kind = style ?? ctx.v.pick(salt, VALANCE_STYLES);
  const dense = ctx.q === 'high';
  const x0 = x - width / 2;

  if (kind === 'batten') {
    // The Federation frieze is a picket run, not a pattern: close pitch, alternating drop.
    const pitch = dense ? 0.098 : 0.15;
    const n = Math.max(3, Math.round(width / pitch));
    const bw = Math.min(0.052, (width / n) * 0.52);
    for (let i = 0; i <= n; i += 1) {
      const bx = x0 + (width * i) / n;
      const long = i % 4 === 0;
      const h = long ? field : field * 0.62;
      push(out.trim, box(bw, h, depth, bx, yTop - h / 2, z, 'valance-batten'));
      if (long && dense) {
        // The turned drop is socketed into the batten, not suspended below it.  Its stem
        // overlaps the batten by 0.04 so material or rail-thickness changes cannot open a gap.
        const stemH = 0.10;
        push(out.trim, box(0.03, stemH, Math.max(0.05, depth), bx,
          yTop - h - stemH / 2 + 0.04, z, 'valance-drop-stem'));
        push(out.trim, ball(bw * 0.62, bx, yTop - h - stemH + 0.04, z,
          'valance-drop', 6));
      }
    }
    return out;
  }

  if (kind === 'lattice') {
    const pitch = dense ? 0.17 : 0.26;
    const n = Math.max(2, Math.round(width / pitch));
    const t = 0.036;
    for (let i = 0; i < n; i += 1) {
      const a = x0 + (width * i) / n;
      const b = x0 + (width * (i + 1)) / n;
      push(out.trim, bar(a, yTop, b, yTop - field, z, t, depth, 'valance-lat'));
      push(out.trim, bar(a, yTop - field, b, yTop, z, t, depth, 'valance-lat'));
    }
    push(out.trim, slab(width, 0.04, depth, x, yTop - field, z, 'valance-foot'));
    return out;
  }

  // scallop — arched cut-outs between narrow stiles, the shape a fretsaw actually makes.
  const bays = Math.max(2, Math.round(width / (dense ? 0.34 : 0.48)));
  const bayW = width / bays;
  const t = 0.038;
  for (let i = 0; i <= bays; i += 1) {
    push(out.trim, box(t * 1.6, field, depth, x0 + bayW * i, yTop - field / 2, z, 'valance-stile'));
  }
  for (let i = 0; i < bays; i += 1) {
    const bcx = x0 + bayW * (i + 0.5);
    const r = Math.min(bayW * 0.46, field * 0.9);
    push(out.trim, arcBars(bcx, yTop - field + r, z, r, Math.PI, Math.PI * 2, dense ? 6 : 4, t, depth, 'valance-scallop'));
    if (dense) push(out.trim, box(t, field - r, depth, bcx, yTop - (field - r) / 2, z, 'valance-mullion'));
  }
  return out;
}

/**
 * The timber corner bracket of a Federation verandah — straight raking edge, scalloped
 * inner edge. Deliberately not the cast-iron bracket: sawn timber has flat cuts and curves
 * struck from one centre, where cast iron scrolls.
 */
export function fretBracket(ctx, {
  x = 0, y = 0, z = 0, size = 0.42, hand = 1, depth = 0.038,
} = {}) {
  const out = { trim: [] };
  if (ctx.q === 'low' || !(size > 0.1)) return out;
  // The cottage bracket was cut down to 300 mm on 45 mm members, which renders under three
  // pixels wide on its own hero plate and therefore scores as absent under §2.5. Its share of
  // the triangles the frieze just gave back buys it back to a size a critic can see.
  const cottage = isFederationCottage(ctx);
  if (cottage) size = 0.40;
  const t = cottage ? 0.060 : 0.045;
  const ex = x + hand * size;
  const ey = y - size;

  push(out.trim, box(t * 1.5, size, depth * 1.2, x + hand * t * 0.75, y - size / 2, z, 'fret-cleat'));
  push(out.trim, box(size, t * 1.5, depth * 1.2, x + hand * size / 2, y - t * 0.75, z, 'fret-head'));
  push(out.trim, bar(x, ey, ex, y, z, t * 1.2, depth, 'fret-rake'));
  if (ctx.q === 'high') {
    // The scalloped inner edge, which is the whole point of a fretsawn bracket: the raking
    // edge is straight, and the cuts are struck from centres along it, so the bracket has real
    // holes in it. What was here was three closed rings of radius 0.05 sitting ON the raking
    // bar — 180 triangles that resolve to a smudge and made the bracket read as the flat plate
    // the brief names. `mp-cottage-federation` shows daylight through the fret.
    const scallops = 3;
    for (let i = 0; i < scallops; i += 1) {
      const f = (i + 0.5) / scallops;
      const px = x + hand * size * (f * 0.86 + 0.08);
      const py = y - size * (1 - f) * 0.86 - size * 0.08;
      const r = size * 0.21;
      // Half-arcs opening away from the rake, so each one bites a real void out of the
      // triangle between the rake and the corner rather than closing one.
      const a0 = hand > 0 ? Math.PI * 0.20 : Math.PI * 0.80;
      const a1 = hand > 0 ? Math.PI * 1.10 : -Math.PI * 0.10;
      push(out.trim, arcBars(px, py, z, r, a0, a1, 2, t * 0.62, depth, 'fret-scallop'));
    }
    push(out.trim, bar(x + hand * t, y - size * 0.5, ex - hand * size * 0.5, ey + size * 0.5, z, t * 0.7, depth, 'fret-tie'));
    if (cottage) {
      // Turned spindles filling the head of the bracket. At 45 mm diameter these were the
      // same sub-pixel problem as the frieze; 70 mm is what the reference turns them at.
      for (let i = -1; i <= 1; i += 1) {
        push(out.trim, cyl(0.035, 0.22, x + hand * (0.125 + i * 0.075),
          y - 0.26, z, 'y', 'cottage-bracket-spindle', 6));
      }
    }
  }
  return out;
}

/** Era-keyed verandah ornament.  Lanes pass the archetype year; no style inference leaks out. */
export function periodFrieze(ctx, {
  era = 1888, width, x = 0, y = 0, z = 0, depth = 0.06, salt = 323,
} = {}) {
  const year = Number.parseInt(era, 10);
  const resolved = Number.isFinite(year) ? year : 1888;
  const familySalt = 300 + (Math.abs(salt | 0) % 100);
  if (resolved < 1900) return laceFrieze(ctx, {
    width, x, y, z, depth, salt: familySalt,
  });
  if (resolved <= 1915) return fretworkValance(ctx, {
    width, x, y, z, depth, drop: 0.34,
    style: ctx.v.pick(familySalt, ['batten', 'scallop']), salt: familySalt,
  });

  const out = { trim: [] };
  if (!(width > 0.24)) return out;
  if (isCalifornianBungalow(ctx)) {
    // Ref-04 has one deep exposed porch beam, with purlin ends at the gable cheeks.  It has
    // no Federation dentil/valance rhythm.  Keep all six ends in the same trim bucket and
    // socket them 20 mm into the beam so they read as carpentry rather than loose blocks.
    push(out.trim, slab(width, 0.14, 0.22, x, y - 0.14, z - 0.02,
      'californian-exposed-porch-beam'));
    for (const hand of [-1, 1]) {
      for (let i = 0; i < 3; i += 1) {
        // All three ends remain socketed through the beam depth; the earlier vertical stack
        // put the lower two in open air below the beam and read as detached tan blocks.
        push(out.trim, box(0.24, 0.09, 0.09,
          x + hand * (width / 2 + 0.06), y - 0.07,
          z - 0.08 + i * 0.08, `californian-gable-purlin-end-${hand}-${i}`));
      }
    }
    return out;
  }
  // Post-1920 bungalows use a plain stop-chamfered beam, exposed joist ends and a shallow
  // shingle infill.  It deliberately carries no pendant or cast scroll vocabulary.
  push(out.trim, slab(width, 0.18, Math.max(0.16, depth * 2), x, y - 0.18, z,
    'bungalow-chamfered-beam'));
  push(out.trim, rotBox(width, 0.035, 0.035, x, y - 0.175,
    z + Math.max(0.16, depth * 2) / 2, { x: Math.PI / 4 }, 'bungalow-beam-chamfer'));
  // A 25 mm bead gives the beam a finer lower termination than either the brackets or posts.
  push(out.trim, cyl(0.0125, width, x, y - 0.19, z + 0.082, 'x',
    'bungalow-beam-bead', lod(ctx, 8, 6, 5)));
  const intervals = Math.max(2, Math.round(width / 0.30));
  for (let i = 0; i <= intervals; i += 1) {
    const bx = x - width / 2 + (width * i) / intervals;
    push(out.trim, box(0.07, 0.07, 0.20, bx, y - 0.225, z - 0.02, 'exposed-joist-end'));
  }
  const shingles = Math.max(3, Math.round(width / 0.26));
  for (let i = 0; i < shingles; i += 1) {
    const sw = width / shingles;
    const bx = x - width / 2 + sw * (i + 0.5);
    push(out.trim, rotBox(sw * 0.92, 0.08, 0.16, bx, y - 0.33,
      z - 0.01, { z: (i % 2 === 0 ? 1 : -1) * 0.02 }, 'shingle-infill'));
  }
  return out;
}

/** Fine Federation verandah lattice: fascia > bracket > 28 mm crossed members. */
export function federationLatticeFrieze(ctx, {
  width, x = 0, y = 0, z = 0, depth = 0.045, pitch = 0.16, drop = 0.30,
} = {}) {
  const out = { trim: [], iron: [] };
  if (isFederationVilla(ctx)) {
    pitch = 0.11;
    drop = 0.26;
  }
  if (!(width > pitch) || ctx.q === 'low') return out;
  const member = 0.028;
  const buildPanel = (panelX, panelW, panelIndex = 0) => {
    if (!(panelW > pitch)) return;
    push(out.trim, slab(panelW, 0.11, Math.max(depth, 0.045), panelX, y, z,
      `federation-lattice-fascia-${panelIndex}`));
    const cells = Math.max(2, Math.round(panelW / pitch));
    const step = panelW / cells;
    for (let i = 0; i < cells; i += 1) {
      const x0 = panelX - panelW / 2 + i * step;
      const x1 = x0 + step;
      push(out.trim, bar(x0, y, x1, y - drop, z + depth / 2, member, depth,
        `federation-lattice-diagonal-${panelIndex}`));
      push(out.trim, bar(x0, y - drop, x1, y, z + depth / 2, member, depth,
        `federation-lattice-diagonal-${panelIndex}`));
    }
    push(out.trim, box(panelW, member, depth, panelX, y - drop, z + depth / 2,
      `federation-lattice-lower-rail-${panelIndex}`));
  };

  if (isFederationVilla(ctx)) {
    // addCottageVerandah authors four posts on a stable schedule. Reconstruct that schedule
    // from the frieze width, then stop each bay 60 mm clear of the adjacent 140 mm post face.
    const verandahW = width + 0.08;
    const postXs = [
      x - verandahW / 2 + 0.22,
      x - verandahW * 0.18,
      x + verandahW * 0.18,
      x + verandahW / 2 - 0.22,
    ];
    const panelInset = 0.14 / 2 + 0.06;
    for (let i = 0; i < postXs.length - 1; i += 1) {
      const a = postXs[i] + panelInset;
      const b = postXs[i + 1] - panelInset;
      buildPanel((a + b) / 2, b - a, i);
    }
    // Cast-iron corner brackets occupy their own hierarchy at every post/beam junction.
    // Each has a post cleat, a beam cleat and a diagonal whose ends overlap both cleats. The
    // former L ended 300 mm below the beam and only grazed the post on a tangent, which is the
    // set of floating black hooks visible on the villa detail plate.
    for (const [i, px] of postXs.entries()) {
      const hand = i < postXs.length / 2 ? 1 : -1;
      const innerX = px + hand * 0.30;
      push(out.iron, box(0.055, 0.34, 0.060, px + hand * 0.018, y - 0.17,
        z + depth, 'villa-bracket-post-cleat'));
      push(out.iron, box(0.34, 0.055, 0.065, px + hand * 0.17, y - 0.028,
        z + depth, 'villa-bracket-beam-cleat'));
      push(out.iron, bar(px + hand * 0.018, y - 0.31, innerX, y - 0.04,
        z + depth, 0.050, 0.060, 'villa-cast-iron-corner-bracket'));
    }
    return out;
  }

  buildPanel(x, width, 0);
  return out;
}

/* ═══════════════════════════════════ openings ════════════════════════════════════ */
//
// THE OPENING CONTRACT. Every component in this section assumes the lane LEFT THE HOLE —
// that the wall is drawn as piers and spandrels around the opening, not as one solid box
// with a window pasted on. Spec §2.3 asks for reveal depth, and reveal depth is a hole; a
// lane that skips this gets a flat blue rectangle no amount of architrave will rescue.
//
// Convention for the whole section: `x` centres the opening, `y` is the SILL (the bottom of
// the hole), `z` is the outer wall face, and the opening runs y … y + height.

/**
 * The dark lining of a punched opening: four returns from the wall face back to the glass
 * line, plus the room behind. Emitted on its own when a lane wants a blocked-up or
 * shuttered opening; `doubleHungWindow` and `frontDoor` already include it.
 */
export function openingLiner(ctx, {
  x = 0, y = 0, z = 0, width = 1.0, height = 1.45, reveal = 0.22, back = true,
} = {}) {
  const out = { shadow: [] };
  if (!(width > 0.05) || !(height > 0.05)) return out;
  const d = Math.max(0.06, reveal);
  const t = 0.055;
  const zc = z - d / 2;
  push(out.shadow, box(t, height, d, x - width / 2 + t / 2, y + height / 2, zc, 'reveal-jamb'));
  push(out.shadow, box(t, height, d, x + width / 2 - t / 2, y + height / 2, zc, 'reveal-jamb'));
  push(out.shadow, box(width, t, d, x, y + height - t / 2, zc, 'reveal-head'));
  push(out.shadow, box(width, t, d, x, y + t / 2, zc, 'reveal-sill'));
  // The room. Without it a transparent pane shows the wall interior and the window turns
  // into a light patch at exactly the angle a board camera looks from.
  if (back) push(out.shadow, box(width, height, 0.04, x, y + height / 2, z - d - 0.14, 'reveal-back'));
  void ctx;
  return out;
}

/** Sash patterns. 'colonial' is the Federation top sash; 'casement' the bungalow bank. */
export const SASH_STYLES = Object.freeze(['1over1', '2over2', '6over6', 'colonial', 'casement']);
/** Curtain states. Varying these across a row is what makes five houses look inhabited. */
export const CURTAIN_STYLES = Object.freeze(['full', 'upper', 'parted', 'none']);

/**
 * The window itself. Glass sits `reveal` behind the wall face, a pale curtain sits behind
 * the glass, and the frame stands between them — that stack, and not the frame profile, is
 * what makes ref-01's windows read as rooms rather than as painted rectangles.
 */
export function doubleHungWindow(ctx, {
  x = 0, y = 0, z = 0, width = 1.05, height = 1.45,
  reveal = 0.22, sash = '2over2', curtain = null, salt = 341,
} = {}) {
  const out = { shadow: [], joinery: [], trim: [], glass: [], roof: [] };
  if (!(width > 0.12) || !(height > 0.12)) return out;

  const d = Math.max(0.18, reveal);
  const liner = openingLiner(ctx, { x, y, z, width, height, reveal: d });
  out.shadow.push(...liner.shadow);

  const zGlass = z - d;
  const gw = width - 0.10;
  const gh = height - 0.10;
  // Carlton's tall 6-over-6 openings carry the arched head through the glazing, not just
  // through the surrounding trim. The rectangular reveal remains structural; the shaped
  // pane leaves the upper corners in shadow and gives the window a real masonry opening.
  const boomArch = isCarltonHeritage(ctx) && sash === '6over6';
  push(out.glass, boomArch
    ? archedPane(gw, gh, x, y + 0.05, zGlass, 'arched-window-glass')
    : box(gw, gh, 0.03, x, y + height / 2, zGlass, 'window-glass'));

  // A minority of rooms are lit behind the glazing. The light card shares the existing
  // joinery bucket, so this adds no material bucket, and the salt keeps the occupancy pattern
  // stable across captures without turning every bay into a showroom.
  if (ctx.q !== 'low' && ctx.v.chance(salt + 7, 0.20)) {
    push(out.trim, box(gw * 0.90, gh * 0.86, 0.025, x, y + height / 2,
      zGlass + 0.006, 'warm-room-plane'));
  }

  const drape = curtain ?? ctx.v.pick(salt, CURTAIN_STYLES);
  if (drape !== 'none' && ctx.q !== 'low') {
    const cz = zGlass - 0.07;
    if (drape === 'parted') {
      const pw = gw * 0.28;
      push(out.joinery, box(pw, gh * 0.94, 0.02, x - gw / 2 + pw / 2, y + height / 2, cz, 'window-curtain'));
      push(out.joinery, box(pw, gh * 0.94, 0.02, x + gw / 2 - pw / 2, y + height / 2, cz, 'window-curtain'));
    } else {
      const ch = drape === 'upper' ? gh * 0.52 : gh * 0.94;
      push(out.joinery, box(gw * 0.94, ch, 0.02, x, y + height - 0.05 - ch / 2, cz, 'window-curtain'));
    }
  }

  const zf = zGlass + 0.025;
  const fw = lod(ctx, 0.072, 0.085, 0.10);
  push(out.joinery, box(width - 0.02, fw, 0.055, x, y + 0.05 + fw / 2, zf, 'sash-bottom'));
  push(out.joinery, box(width - 0.02, fw, 0.055, x, y + height - 0.05 - fw / 2, zf, 'sash-top'));
  push(out.joinery, box(fw, height - 0.10, 0.055, x - gw / 2 + fw / 2, y + height / 2, zf, 'sash-stile'));
  push(out.joinery, box(fw, height - 0.10, 0.055, x + gw / 2 - fw / 2, y + height / 2, zf, 'sash-stile'));

  if (sash !== 'casement') {
    // The meeting rail is the single detail that says double-hung; it is deeper than the
    // glazing bars because two sashes overlap there.
    push(out.joinery, box(gw, fw * 1.25, 0.075, x, y + height * 0.52, zf + 0.012, 'meeting-rail'));
  }
  if (ctx.q === 'low' || sash === '1over1') return out;

  const bt = fw * 0.62;
  const yMid = y + height * 0.52;
  const vBars = (x0, y0, y1, count) => {
    for (let i = 1; i <= count; i += 1) {
      push(out.joinery, box(bt, y1 - y0, 0.045, x0 - gw / 2 + (gw * i) / (count + 1), (y0 + y1) / 2, zf, 'glazing-bar'));
    }
  };
  if (sash === '2over2') {
    vBars(x, y + 0.06, yMid, 1);
    vBars(x, yMid, y + height - 0.06, 1);
  } else if (sash === '6over6') {
    vBars(x, y + 0.06, yMid, 2);
    vBars(x, yMid, y + height - 0.06, 2);
    if (ctx.q === 'high') {
      push(out.joinery, box(gw, bt, 0.045, x, (y + 0.06 + yMid) / 2, zf, 'glazing-bar'));
      push(out.joinery, box(gw, bt, 0.045, x, (yMid + y + height - 0.06) / 2, zf, 'glazing-bar'));
    }
  } else if (sash === 'colonial') {
    // Multi-pane over plate: the Federation signature, and cheaper than 6-over-6.
    vBars(x, yMid, y + height - 0.06, 2);
    push(out.joinery, box(gw, bt, 0.045, x, (yMid + y + height - 0.06) / 2, zf, 'glazing-bar'));
  } else if (sash === 'casement') {
    vBars(x, y + 0.06, y + height - 0.06, 1);
    if (ctx.q === 'high') {
      push(out.joinery, box(gw, bt, 0.045, x, y + height * 0.62, zf, 'glazing-bar'));
    }
  }

  if (isFederationVilla(ctx) && ctx.q !== 'low' && (sash === '6over6' || sash === 'colonial')) {
    // Leadlight is restricted to the top sash. The three hues reuse buckets already present
    // on the villa (roof ruby, glass green-charcoal, trim amber-cream), so the coloured margin
    // lights read under the key without creating a tenth draw bucket.
    const topBottom = yMid + 0.04;
    const top = y + height - 0.08;
    const border = Math.min(0.09, gw * 0.16);
    const paneDepth = 0.018;
    push(out.trim, box(gw, border, paneDepth, x, top - border / 2, zf + 0.012,
      'villa-leadlight-margin-top'));
    push(out.trim, box(gw, border, paneDepth, x, topBottom + border / 2, zf + 0.012,
      'villa-leadlight-margin-bottom'));
    push(out.glass, box(border, top - topBottom, paneDepth, x - gw / 2 + border / 2,
      (top + topBottom) / 2, zf + 0.014, 'villa-leadlight-margin-green'));
    push(out.roof, box(border, top - topBottom, paneDepth, x + gw / 2 - border / 2,
      (top + topBottom) / 2, zf + 0.014, 'villa-leadlight-margin-ruby'));
    const diamond = Math.min(gw * 0.30, (top - topBottom) * 0.42);
    for (const hand of [-1, 1]) {
      push(out.trim, rotBox(diamond, 0.035, paneDepth, x,
        (top + topBottom) / 2 + hand * diamond * 0.22, zf + 0.018,
        { z: hand * Math.PI / 4 }, 'villa-leadlight-diamond'));
    }
  }
  return out;
}

/**
 * A bank of lights under one head — the bungalow triple casement, the villa bay. Mullions
 * are structural members, so they sit proud of the glass line and read as timber.
 */
export function windowBank(ctx, {
  x = 0, y = 0, z = 0, width = 2.4, height = 1.25, lights = 3,
  reveal = 0.20, sash = 'casement', mullion = 0.11, salt = 351,
} = {}) {
  const out = { wall: [], shadow: [], joinery: [], trim: [], glass: [], roof: [] };
  const n = Math.max(1, lights | 0);
  if (!(width > 0.2)) return out;
  const lightW = (width - mullion * (n - 1)) / n;
  if (lightW <= 0.1) return out;

  for (let i = 0; i < n; i += 1) {
    const lx = x - width / 2 + lightW / 2 + i * (lightW + mullion);
    const one = doubleHungWindow(ctx, {
      x: lx, y, z, width: lightW, height, reveal, sash, salt: salt + i,
    });
    out.shadow.push(...one.shadow);
    out.joinery.push(...one.joinery);
    out.trim.push(...one.trim);
    out.glass.push(...one.glass);
    out.roof.push(...one.roof);
    if (i < n - 1) {
      const mx = lx + lightW / 2 + mullion / 2;
      push(out.joinery, box(mullion, height, reveal * 0.8, mx, y + height / 2, z - reveal * 0.4, 'mullion'));
    }
  }
  if (isCalifornianBungalow(ctx)) {
    const sillW = width + 0.08;
    push(out.trim, slab(sillW, 0.075, 0.16, x, y - 0.075, z + 0.08,
      'californian-projecting-sill'));
    for (const hand of [-1, 1]) {
      push(out.trim, slab(0.10, 0.10, 0.14,
        x + hand * Math.max(0.10, sillW / 2 - 0.20), y - 0.175, z + 0.07,
      'californian-sill-corbel'));
    }
  }
  if (isBrightonBungalow(ctx) && ctx.q !== 'low' && salt === 272) {
    // The 3.20 m four-light bank is the unique projecting Brighton bay. Its gable face is
    // authored by the lane immediately above this bank, so this signature lets the shared
    // component add the missing half-timber work without decorating the smaller wall banks.
    // The lane's street gable is 3.0 m wide, springs at the main eave datum and has its
    // street face 145 mm behind the canted bay glazing. The old decoration used the WINDOW
    // head as its spring and z + 450 mm as its face, which put five cream bars below and in
    // front of a still-brick tympanum. Cover that brick triangle with the existing roughcast
    // wall bucket, then put the carpentry on its real plane.
    const gableW = 2.82;
    const gableH = 0.87;
    const gableBase = 0.14 + ctx.env.wallH;
    const faceZ = z - 0.145 + 0.012;
    push(out.wall, triangleFace(gableW, gableH, x, gableBase, faceZ,
      'brighton-gable-roughcast-overlay'));

    // Six 90 mm battens at 480 mm centres, clipped in height to the rake. The lower edge
    // overlaps the tie beam by 20 mm, so no strip begins in open air.
    for (let i = 0; i < 6; i += 1) {
      const offset = (i - 2.5) * 0.48;
      const h = Math.max(0.16, gableH * (1 - Math.abs(offset) / (gableW / 2)));
      push(out.joinery, box(0.09, h + 0.02, 0.03, x + offset,
        gableBase + (h + 0.02) / 2 - 0.02, faceZ + 0.020,
        'brighton-gable-vertical-batten'));
    }
    push(out.joinery, box(gableW - 0.18, 0.10, 0.03, x, gableBase + 0.05,
      faceZ + 0.020, 'brighton-gable-tie-strap'));

    // A shallow dark louvre at the apex. Three blades are enough to read as ventilation at
    // plate scale without spending the triangles reclaimed from the planting.
    push(out.shadow, slab(0.58, 0.24, 0.025, x, gableBase + 0.45,
      faceZ + 0.026, 'brighton-gable-apex-vent-recess'));
    for (let i = 0; i < 3; i += 1) {
      push(out.joinery, slab(0.52, 0.035, 0.035, x, gableBase + 0.49 + i * 0.065,
        faceZ + 0.044, 'brighton-gable-apex-louvre'));
    }

    // The finial is part of the silhouette: 180 mm across and 420 mm high with three beads,
    // seated through the ridge rather than represented by the former 70 mm pin.
    const apexY = gableBase + gableH - 0.04;
    push(out.joinery, lathe([
      [0.055, 0], [0.055, 0.06], [0.09, 0.095], [0.052, 0.14],
      [0.085, 0.19], [0.048, 0.24], [0.075, 0.29], [0.038, 0.36], [0.012, 0.42],
    ], x, apexY, faceZ, 8, 'brighton-gable-three-bead-finial'));
  }
  return out;
}

/** Head treatments for a moulded surround. */
export const SURROUND_STYLES = Object.freeze(['flat', 'segmental', 'arched', 'plain']);

/**
 * The moulded architrave around an opening: jambs, a sill carried on two console brackets,
 * and a head — flat with a cornice, or arched with a keystone. Returns the surround only;
 * the window or door is a separate call so a lane can put a surround on a blank panel.
 */
export function windowSurround(ctx, {
  x = 0, y = 0, z = 0, width = 1.05, height = 1.45,
  style = 'flat', projection = 0.085, jamb = 0.165, keystone = true,
  sill = true, brackets = true, depth = null,
} = {}) {
  const out = { trim: [] };
  if (!(width > 0.1) || !(height > 0.1)) return out;
  if (isFederationCottage(ctx)) {
    // The cottage had drifted to ten measured buckets because `boundary` alone pointed at
    // the roof-metal material while every other painted timber used `trim`. Collapse that
    // paint system before the first boundary-remapped surround is emitted; geometry and the
    // protected fence remain intact, while the olive joinery becomes one coherent system.
    ctx.p.boundary = ctx.p.trim;
  }
  const proj = depth ?? (isCarltonHeritage(ctx) && (style === 'arched' || style === 'segmental')
    ? Math.max(projection, 0.16) : projection);
  const jw = ctx.q === 'low' ? jamb * 1.15 : jamb;

  if (ctx.q === 'low') {
    push(out.trim, box(width + jw * 2, height + jw, proj, x, y + height / 2, z + proj / 2, 'surround-band'));
    if (sill) push(out.trim, slab(width + jw * 2.6, 0.09, proj * 1.6, x, y - 0.09, z + proj * 0.8, 'sill'));
    return out;
  }

  // Jambs run the full height and the head lands on them — the load path a mason would use.
  push(out.trim, bandRunUpright(height, jw, x - width / 2, y, z, proj, ARCHITRAVE_PROFILE, -1, 'jamb'));
  push(out.trim, bandRunUpright(height, jw, x + width / 2, y, z, proj, ARCHITRAVE_PROFILE, 1, 'jamb'));

  const yHead = y + height;
  if (style === 'flat') {
    const hw = width + jw * 2.5;
    push(out.trim, slab(hw, jw * 0.95, proj * 1.1, x, yHead, z + proj * 0.55, 'head-lintel'));
    push(out.trim, bandRun(hw * 1.04, 0.13, x, yHead + jw * 0.95, z, proj * 1.7, CORNICE_PROFILE, 'head-cornice'));
    if (keystone) push(out.trim, slab(jw * 1.15, jw * 1.45, proj * 1.5, x, yHead - jw * 0.2, z + proj * 0.75, 'keystone'));
  } else if (style === 'segmental' || style === 'arched') {
    const span = width + jw;
    const rise = style === 'arched' ? span / 2 : Math.max(0.12, span * 0.22);
    const R = (span * span / 4 + rise * rise) / (2 * rise);
    const cy = yHead + rise - R;
    const half = Math.asin(Math.min(1, (span / 2) / R));
    const segs = lod(ctx, style === 'arched' ? 8 : 8, 6, 4);
    push(out.trim, arcBars(x, cy, z + proj / 2, R + jw * 0.42, Math.PI / 2 - half, Math.PI / 2 + half, segs, jw, proj, 'head-arch'));
    // Tympanum fill in stepped courses, hidden behind the arch band: a smooth solid would
    // cost four times the triangles for an edge nobody ever sees.
    const fills = lod(ctx, 5, 3, 2);
    for (let i = 0; i < fills; i += 1) {
      const yi = yHead + (rise * (i + 0.5)) / fills;
      const hw = Math.sqrt(Math.max(0, R * R - (yi - cy) * (yi - cy)));
      push(out.trim, slab(hw * 2, rise / fills + 0.006, proj * 0.55, x, yHead + (rise * i) / fills, z + proj * 0.27, 'head-fill'));
    }
    if (keystone) {
      push(out.trim, slab(jw * 1.1, rise * 0.42 + jw * 0.7, proj * 1.55, x, yHead + rise - jw * 0.35, z + proj * 0.78, 'keystone'));
    }
    push(out.trim, slab(jw * 1.6, jw * 0.5, proj * 1.2, x - span / 2, yHead - jw * 0.25, z + proj * 0.6, 'impost'));
    push(out.trim, slab(jw * 1.6, jw * 0.5, proj * 1.2, x + span / 2, yHead - jw * 0.25, z + proj * 0.6, 'impost'));
  }

  if (sill) {
    const sw = width + jw * 3.0;
    push(out.trim, bandRun(sw, 0.115, x, y - 0.115, z, proj * 1.75, SILL_PROFILE, 'sill'));
    if (brackets && ctx.q === 'high') {
      for (const bx of [x - sw / 2 + 0.11, x + sw / 2 - 0.11]) {
        push(out.trim, slab(0.13, 0.10, proj * 1.35, bx, y - 0.215, z + proj * 0.68, 'sill-bracket'));
        push(out.trim, slab(0.11, 0.075, proj * 0.85, bx, y - 0.29, z + proj * 0.43, 'sill-bracket-foot'));
      }
    }
  }
  return out;
}

/**
 * The little roof over a window — the cottage side light, the bungalow casement bank. Built
 * on brackets so it lands on something.
 */
export function windowHood(ctx, {
  x = 0, y = 0, z = 0, width = 1.4, projection = 0.42, style = 'skillion', rise = 0.16,
  fasciaHeight = 0.09, bracketHeight = 0.34, bracketWidth = 0.06,
  scroll = false,
} = {}) {
  const out = { trim: [], roofTrim: [] };
  if (!(width > 0.15) || ctx.q === 'low') {
    if (width > 0.15) push(out.roofTrim, slab(width, 0.05, projection, x, y, z + projection / 2, 'hood'));
    return out;
  }
  const zf = z + projection;
  push(out.roofTrim, style === 'bullnose'
    ? slab(width, 0.05, projection, x, y + rise * 0.5, z + projection / 2, 'hood-deck')
    : skillion(width, 0.055, x, z, y + rise, zf, y, 'hood-deck'));
  push(out.trim, slab(width + 0.06, fasciaHeight, 0.05, x, y - fasciaHeight, zf, 'hood-fascia'));
  for (const bx of [x - width / 2 + 0.09, x + width / 2 - 0.09]) {
    push(out.trim, box(bracketWidth, bracketHeight, 0.07, bx,
      y - bracketHeight / 2, z + 0.035, 'hood-cleat'));
    push(out.trim, strutZY(bx, y - bracketHeight, z + 0.04,
      y + rise - 0.06, zf - 0.05, bracketWidth, bracketWidth, 'hood-brace'));
    if (scroll && ctx.q === 'high') {
      push(out.trim, cyl(0.04, bracketWidth, bx, y - bracketHeight + 0.045,
        z + 0.09, 'x', 'hood-scroll', 8));
    }
  }
  return out;
}

/** Door styles. 'arched' carries a radiating fanlight; 'panelled' a rectangular one. */
export const DOOR_STYLES = Object.freeze(['panelled', 'arched', 'flush']);

/**
 * The front door: leaf, raised panels, architrave, fanlight, knob and threshold. The
 * fanlight is backed with a pale plane rather than glazed dark, because a lit hallway
 * behind the door is what stops a terrace frontage reading as a mausoleum.
 */
export function frontDoor(ctx, {
  x = 0, y = 0, z = 0, width = 1.0, height = 2.12,
  style = 'panelled', reveal = 0.18, fanlight = 0.36, sidelight = false, salt = 361,
} = {}) {
  const out = { shadow: [], trim: [], joinery: [], glass: [], iron: [], wallAlt: [] };
  if (!(width > 0.3) || !(height > 0.6)) return out;

  if (isFederationVilla(ctx)) {
    z += 0.16;
    height = 2.50;
    fanlight = Math.max(0.40, fanlight);
  }
  if (isCalifornianBungalow(ctx)) {
    width = 0.90;
    height = 2.05;
    fanlight = 0;
  }

  const arched = style === 'arched';
  const fan = Math.max(0, fanlight);
  const leafH = height - fan;
  const d = Math.max(0.14, reveal);
  out.shadow.push(...openingLiner(ctx, { x, y, z, width, height, reveal: d }).shadow);

  // The leaf sits back in the reveal; its face is the plane every other door part measures
  // from, so a lane changing `reveal` moves the whole assembly together.
  const zLeaf = z - d + 0.05;
  push(isFederationVilla(ctx) ? out.iron : out.trim,
    box(width - 0.07, leafH - 0.03, 0.075, x, y + leafH / 2, zLeaf, 'door-leaf'));

  if (isCalifornianBungalow(ctx) && ctx.q !== 'low') {
    const lowerTop = y + 1.05;
    const panelW = (width - 0.20) / 3;
    for (let i = 0; i < 3; i += 1) {
      const px = x - (width - 0.20) / 2 + panelW * (i + 0.5);
      push(out.trim, box(panelW - 0.035, 0.72, 0.035, px, y + 0.47,
        zLeaf + 0.055, 'californian-door-raised-panel'));
      push(out.shadow, box(panelW - 0.005, 0.75, 0.02, px, y + 0.47,
        zLeaf + 0.04, 'californian-door-panel-quirk'));
    }
    push(out.trim, box(width - 0.07, 0.09, 0.065, x, lowerTop, zLeaf + 0.055,
      'californian-door-lock-rail'));
    const upperH = Math.max(0.40, leafH - 1.14);
    push(out.glass, box(width - 0.18, upperH, 0.025, x, lowerTop + 0.09 + upperH / 2,
      zLeaf + 0.052, 'californian-door-upper-glass'));
    for (let i = 1; i < 4; i += 1) {
      push(out.trim, box(0.045, upperH, 0.045,
        x - (width - 0.18) / 2 + ((width - 0.18) * i) / 4,
        lowerTop + 0.09 + upperH / 2, zLeaf + 0.075,
        'californian-door-upper-bar'));
    }
  } else if (isFederationVilla(ctx) && ctx.q !== 'low') {
    const lowerH = Math.min(0.90, leafH * 0.46);
    for (const row of [0, 1]) {
      for (const hand of [-1, 1]) {
        push(out.trim, box(width * 0.34, lowerH * 0.38, 0.035,
          x + hand * width * 0.20, y + 0.18 + row * lowerH * 0.43,
          zLeaf + 0.055, 'villa-door-raised-panel'));
      }
    }
    const upperY = y + lowerH + 0.10;
    const upperH = Math.max(0.34, leafH - lowerH - 0.18);
    push(out.wallAlt, box(width - 0.20, upperH, 0.02, x, upperY + upperH / 2,
      zLeaf + 0.048, 'villa-door-warm-leadlight'));
    push(out.glass, box(width - 0.18, upperH, 0.018, x, upperY + upperH / 2,
      zLeaf + 0.070, 'villa-door-leadlight-glass'));
    for (let i = 1; i < 4; i += 1) {
      push(out.trim, box(0.035, upperH, 0.035,
        x - (width - 0.18) / 2 + ((width - 0.18) * i) / 4,
        upperY + upperH / 2, zLeaf + 0.084, 'villa-door-leadlight-bar'));
    }
    push(out.trim, rotBox(width * 0.30, 0.035, 0.035, x,
      upperY + upperH * 0.52, zLeaf + 0.086, { z: Math.PI / 4 },
      'villa-door-leadlight-diamond'));
    push(out.trim, rotBox(width * 0.30, 0.035, 0.035, x,
      upperY + upperH * 0.52, zLeaf + 0.086, { z: -Math.PI / 4 },
      'villa-door-leadlight-diamond'));
  } else if (style !== 'flush' && ctx.q !== 'low') {
    const rows = ctx.q === 'high' ? 3 : 2;
    const cols = 2;
    const pw = (width - 0.07) * 0.36;
    const ph = ((leafH - 0.03) / rows) * 0.62;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const px = x + (c === 0 ? -1 : 1) * (width - 0.07) * 0.20;
        const py = y + ((leafH - 0.03) * (r + 0.5)) / rows;
        push(out.trim, box(pw, ph, 0.035, px, py, zLeaf + 0.055, 'door-panel'));
        if (ctx.q === 'high') push(out.shadow, box(pw + 0.03, ph + 0.03, 0.02, px, py, zLeaf + 0.04, 'door-panel-quirk'));
      }
    }
  }

  if (fan > 0.06) {
    const zf = zLeaf + 0.01;
    const fw = width - 0.10;
    // Pale backing first, glazing in front: the fanlight then reads lit from any angle.
    push(out.joinery, box(fw, fan - 0.05, 0.02, x, y + leafH + fan / 2, zf - 0.05, 'fanlight-glow'));
    if (isFederationVilla(ctx)) {
      // The entry alone receives a warm point behind its fanlight. wallAlt is already the
      // villa's amber-red masonry accent, so this creates the focal glow without a new
      // material bucket or a globally emissive glass material.
      push(out.wallAlt, box(fw * 0.92, fan - 0.09, 0.02, x,
        y + leafH + fan / 2, zf - 0.075, 'villa-entry-warm-card'));
    }
    push(out.glass, box(fw, fan - 0.05, 0.025, x, y + leafH + fan / 2, zf, 'fanlight-glass'));
    push(out.joinery, box(width, 0.075, 0.08, x, y + leafH, zf + 0.02, 'fanlight-transom'));
    if (ctx.q !== 'low') {
      if (arched) {
        const rays = lod(ctx, 7, 5, 3);
        const r = fan * 1.6;
        for (let i = 0; i < rays; i += 1) {
          const a = Math.PI * (0.14 + 0.72 * (i / (rays - 1)));
          const [ex, ey] = rayExit(x, y + leafH, a, x - fw / 2, x + fw / 2, y + leafH + fan - 0.04);
          push(out.joinery, bar(x, y + leafH, ex, ey, zf + 0.02, 0.038, 0.05, 'fanlight-bar'));
        }
        push(out.joinery, arcBars(x, y + leafH, zf + 0.02, Math.min(r * 0.42, fan * 0.62), Math.PI * 0.1, Math.PI * 0.9, lod(ctx, 6, 4, 3), 0.034, 0.05, 'fanlight-arc'));
      } else {
        for (let i = 1; i <= 2; i += 1) {
          push(out.joinery, box(0.038, fan - 0.06, 0.05, x - fw / 2 + (fw * i) / 3, y + leafH + fan / 2, zf + 0.02, 'fanlight-bar'));
        }
      }
    }
  }

  if (sidelight && ctx.q !== 'low') {
    const sw = width * 0.20;
    for (const sx of [x - width / 2 - sw * 0.72, x + width / 2 + sw * 0.72]) {
      push(out.joinery, box(sw * 0.9, leafH * 0.82, 0.02, sx, y + leafH * 0.52, zLeaf - 0.06, 'sidelight-glow'));
      push(out.glass, box(sw * 0.78, leafH * 0.78, 0.03, sx, y + leafH * 0.52, zLeaf + 0.01, 'sidelight-glass'));
      push(out.joinery, box(sw * 0.96, leafH * 0.86, 0.05, sx, y + leafH * 0.52, zLeaf - 0.015, 'sidelight-frame'));
    }
  }

  // Architrave: an arched door takes an arched surround, or the head fights the fanlight.
  const surround = windowSurround(ctx, {
    x, y, z, width, height,
    style: arched ? 'arched' : 'flat',
    projection: 0.09, jamb: 0.17, keystone: true, sill: false, brackets: false,
  });
  out.trim.push(...surround.trim);

  if (isFederationVilla(ctx)) {
    // Projecting cream jambs and segmental hood pull the door out of the verandah shadow.
    for (const hand of [-1, 1]) {
      push(out.trim, slab(0.14, height, 0.16, x + hand * (width / 2 + 0.07), y,
        z + 0.08, 'villa-entry-projecting-jamb'));
    }
    const hoodY = y + height + 0.03;
    push(out.trim, slab(width + 0.50, 0.14, 0.22, x, hoodY, z + 0.11,
      'villa-entry-segmental-hood'));
    const matSize = 1.30;
    const cell = matSize / 8;
    for (let iz = 0; iz < 8; iz += 1) {
      for (let ix = 0; ix < 8; ix += 1) {
        const bucket = (ix + iz) % 2 === 0 ? out.wallAlt : out.shadow;
        push(bucket, slab(cell - 0.01, 0.018, cell - 0.01,
          x - matSize / 2 + cell * (ix + 0.5), y + 0.008,
          z + 0.18 + cell * (iz + 0.5), 'villa-entry-tessellated-mat'));
      }
    }
  }

  const knobY = y + leafH * 0.46;
  const knobX = x + (ctx.v.chance(salt, 0.5) ? 1 : -1) * (width * 0.30);
  push(out.iron, ball(0.05, knobX, knobY, zLeaf + 0.09, 'door-knob', 8));
  if (ctx.q === 'high') {
    push(out.iron, box(0.13, 0.035, 0.03, x, knobY + 0.24, zLeaf + 0.055, 'letterplate'));
    push(out.iron, box(0.05, 0.02, 0.025, knobX, knobY - 0.12, zLeaf + 0.05, 'door-escutcheon'));
  }
  // The threshold. A door that meets the ground with no step is the flattest thing on a
  // frontage, and every reference plate has one.
  push(out.wallAlt, slab(width + 0.30, 0.075, d + 0.20, x, y - 0.075, z - d / 2 + 0.10, 'threshold'));
  return out;
}

/** Wall vents: the subfloor air brick and the gable louvre. Small, and always noticed. */
export function ventGrille(ctx, {
  x = 0, y = 0, z = 0, width = 0.34, height = 0.22, style = 'airbrick', depth = 0.05,
} = {}) {
  const out = { shadow: [], trim: [] };
  if (!(width > 0.04) || !(height > 0.04)) return out;
  push(out.shadow, box(width, height, depth * 0.7, x, y + height / 2, z - depth * 0.3, 'vent-void'));
  if (ctx.q === 'low') return out;

  if (style === 'louvre') {
    const blades = lod(ctx, 5, 3, 2);
    for (let i = 0; i < blades; i += 1) {
      const by = y + (height * (i + 0.5)) / blades;
      push(out.trim, rotBox(width * 0.92, 0.035, depth * 0.9, x, by, z - depth * 0.1, { x: -0.5 }, 'vent-blade'));
    }
    push(out.trim, box(width + 0.05, 0.045, depth * 1.2, x, y + height + 0.02, z, 'vent-head'));
    push(out.trim, box(width + 0.05, 0.045, depth * 1.2, x, y - 0.02, z, 'vent-sill'));
  } else {
    const cols = lod(ctx, 5, 3, 2);
    const rows = lod(ctx, 3, 2, 1);
    for (let i = 1; i < cols; i += 1) {
      push(out.trim, box(0.022, height * 0.9, depth * 0.5, x - width / 2 + (width * i) / cols, y + height / 2, z - depth * 0.15, 'vent-bar'));
    }
    for (let i = 1; i < rows; i += 1) {
      push(out.trim, box(width * 0.9, 0.022, depth * 0.5, x, y + (height * i) / rows, z - depth * 0.15, 'vent-bar'));
    }
  }
  // A border, not a plate: a solid frame face would seal the void the vent exists to show.
  const ft = 0.035;
  push(out.trim, box(width + ft * 2, ft, depth * 0.5, x, y + height + ft / 2, z, 'vent-frame'));
  push(out.trim, box(width + ft * 2, ft, depth * 0.5, x, y - ft / 2, z, 'vent-frame'));
  push(out.trim, box(ft, height, depth * 0.5, x - width / 2 - ft / 2, y + height / 2, z, 'vent-frame'));
  push(out.trim, box(ft, height, depth * 0.5, x + width / 2 + ft / 2, y + height / 2, z, 'vent-frame'));
  return out;
}

/* ══════════════════════════ classical mouldings and parapets ══════════════════════ */

/**
 * A moulded cornice seated on the wall face at `z`, running along X from `y` upward.
 * `returns` continues the run around both corners for a short distance; without it a
 * cornice dies in mid-air at the party wall and the whole facade reads as a flat card.
 */
export function corniceRun(ctx, {
  x = 0, y = 0, z = 0, length, height = 0.26, projection = 0.30,
  profile = CORNICE_PROFILE, returns = 0,
} = {}) {
  const out = { trim: [] };
  if (!(length > 0.05)) return out;
  const prof = ctx.q === 'low' ? [[1, 1]] : profile;
  push(out.trim, bandRun(length, height, x, y, z, projection, prof, 'cornice'));
  if (returns > 0.02 && ctx.q !== 'low') {
    // Extend the return forward by the projection so the outside corner closes cleanly
    // instead of leaving a notch the size of the cornice itself.
    const d = returns + projection;
    const zc = z - returns / 2 + projection / 2;
    push(out.trim, bandRunSide(d, height, x - length / 2, y, zc, projection, prof, -1, 'cornice-return'));
    push(out.trim, bandRunSide(d, height, x + length / 2, y, zc, projection, prof, 1, 'cornice-return'));
  }
  return out;
}

/** The row of small blocks under a cornice. Reads as shadow rhythm long before as blocks. */
export function dentilCourse(ctx, {
  x = 0, y = 0, z = 0, length, size = 0.105, pitch = 0.20, height = 0.13, projection = 0.13,
  bed = true,
} = {}) {
  const out = { trim: [] };
  if (!(length > 0.05)) return out;
  if (ctx.q === 'low') {
    push(out.trim, slab(length, height, projection * 0.55, x, y, z + projection * 0.28, 'dentil-band'));
    return out;
  }
  const p = ctx.q === 'high' ? pitch : pitch * 1.5;
  // Count intervals, then place a full member at BOTH ends.  The old centre-of-cell run
  // always stopped at a half-gap and looked broken where it met the corner return.
  const intervals = Math.max(2, Math.round(length / p));
  const step = length / intervals;
  const memberW = Math.max(0.06, Math.min(size, step * 0.62));
  const relief = Math.max(0.05, projection);
  for (let i = 0; i <= intervals; i += 1) {
    const dx = x - length / 2 + step * i;
    push(out.trim, slab(memberW, Math.max(0.06, height), relief, dx, y,
      z + relief / 2, 'dentil'));
  }
  if (bed) {
    push(out.trim, slab(length + memberW, 0.055, relief * 0.62, x, y - 0.055,
      z + relief * 0.31, 'dentil-bed'));
    push(out.trim, slab(length + memberW, 0.06, relief * 1.12, x,
      y + Math.max(0.06, height), z + relief * 0.56, 'dentil-cap'));
  }
  return out;
}

/**
 * The horizontal band that breaks a facade into storeys — a sill course, an impost band,
 * an art-deco render stripe. Remap to `wallAlt` when the band is a contrasting brick.
 */
export function stringCourse(ctx, {
  x = 0, y = 0, z = 0, length, height = 0.16, projection = 0.09, profile = STRING_PROFILE,
} = {}) {
  const out = { trim: [] };
  if (!(length > 0.05)) return out;
  const prof = ctx.q === 'low' ? [[1, 1]] : profile;
  push(out.trim, bandRun(length, height, x, y, z, projection, prof, 'string-course'));
  return out;
}

/* ═════════════════════════ shared interwar and contemporary hierarchy ═════════════ */

/** A soldier-brick head, three brick courses tall, with a full brick at each jamb. */
export function soldierCourse(ctx, {
  x = 0, y = 0, z = 0, width = 1.2, brickW = 0.09, courseH = 0.075,
  projection = 0.06,
} = {}) {
  const out = { wallAlt: [], shadow: [] };
  if (!(width > 0.18)) return out;
  const relief = Math.max(0.05, projection);
  const intervals = Math.max(2, Math.round(width / Math.max(0.06, brickW)));
  const step = width / intervals;
  const member = Math.max(0.06, Math.min(brickW, step * 0.82));
  const h = Math.max(0.06, courseH) * 3;
  for (let i = 0; i <= intervals; i += 1) {
    const bx = x - width / 2 + step * i;
    push(out.wallAlt, slab(member, h, relief, bx, y, z + relief / 2, 'soldier-brick'));
  }
  push(out.shadow, slab(width + member, 0.018, relief + 0.012, x, y - 0.018,
    z + relief / 2, 'soldier-shadow-arris'));
  return out;
}

/** Two continuous stepped brick courses, with optional returns around both corners. */
export function corbelledBrickCourse(ctx, {
  x = 0, y = 0, z = 0, length = 2.0, lower = 0.06, upper = 0.12,
  courseH = 0.09, returns = 0,
} = {}) {
  const out = { wallAlt: [] };
  if (!(length > 0.12)) return out;
  const h = Math.max(0.06, courseH);
  push(out.wallAlt, slab(length, h, lower, x, y, z + lower / 2, 'corbel-course-lower'));
  push(out.wallAlt, slab(length, h, upper, x, y + h, z + upper / 2, 'corbel-course-upper'));
  if (returns > 0.04) {
    for (const hand of [-1, 1]) {
      const ex = x + hand * length / 2;
      push(out.wallAlt, slab(lower, h, returns, ex + hand * lower / 2, y,
        z - returns / 2 + lower / 2, 'corbel-return-lower'));
      push(out.wallAlt, slab(upper, h, returns, ex + hand * upper / 2, y + h,
        z - returns / 2 + upper / 2, 'corbel-return-upper'));
    }
  }
  return out;
}

/** A visibly recessed brick panel: dark field behind a projecting brick perimeter. */
export function recessedBrickPanel(ctx, {
  x = 0, y = 0, z = 0, width = 0.9, height = 0.6, recess = 0.05,
  border = 0.08,
} = {}) {
  const out = { shadow: [], wallAlt: [] };
  if (!(width > border * 2) || !(height > border * 2)) return out;
  push(out.shadow, box(width - border * 2, height - border * 2, Math.max(0.02, recess),
    x, y + height / 2, z - recess / 2, 'recessed-brick-field'));
  push(out.wallAlt, box(width, border, 0.06, x, y + border / 2, z + 0.03, 'brick-panel-border'));
  push(out.wallAlt, box(width, border, 0.06, x, y + height - border / 2, z + 0.03, 'brick-panel-border'));
  push(out.wallAlt, box(border, height - border * 2, 0.06, x - width / 2 + border / 2,
    y + height / 2, z + 0.03, 'brick-panel-border'));
  push(out.wallAlt, box(border, height - border * 2, 0.06, x + width / 2 - border / 2,
    y + height / 2, z + 0.03, 'brick-panel-border'));
  return out;
}

/** Projecting parapet cap with a continuous underside drip groove. */
export function parapetCap(ctx, {
  x = 0, y = 0, z = 0, length = 2.0, wallDepth = 0.28, overhang = 0.06,
  height = 0.12,
} = {}) {
  const out = { trim: [], shadow: [] };
  if (!(length > 0.12)) return out;
  const capD = Math.max(0.28, wallDepth) + overhang * 2;
  push(out.trim, slab(length + overhang * 2, height, capD, x, y,
    z + (capD - wallDepth) / 2, 'parapet-cap'));
  push(out.shadow, box(length, 0.025, 0.025, x, y + 0.025,
    z + capD - wallDepth / 2 - 0.025, 'parapet-drip-groove'));
  return out;
}

/** Medium-scale lintel with enough section to cast a band over an opening. */
export function expressedLintel(ctx, {
  x = 0, y = 0, z = 0, width = 1.2, height = 0.12, depth = 0.10,
} = {}) {
  const out = { trim: [] };
  if (!(width > 0.12)) return out;
  const relief = Math.max(0.10, depth);
  push(out.trim, slab(width + 0.20, Math.max(0.08, height), relief, x, y,
    z + relief / 2, 'expressed-lintel'));
  push(out.trim, rotBox(width + 0.24, 0.028, 0.028, x, y + 0.014,
    z + relief + 0.010, { x: Math.PI / 4 }, 'lintel-lower-chamfer'));
  return out;
}

/** Coarse entry hierarchy: reveal frame, supported canopy, number plate and sconces. */
export function entryPortal(ctx, {
  x = 0, y = 0, z = 0, width = 2.6, height = 3.0, frame = 0.25,
  canopyDepth = 1.6, canopyHeight = 0.10, number = true, sconces = true,
} = {}) {
  const out = { trim: [], roof: [], iron: [], shadow: [] };
  if (!(width > frame * 2) || !(height > frame)) return out;
  const relief = 0.25;
  for (const hand of [-1, 1]) push(out.trim, box(frame, height, relief,
    x + hand * (width / 2 - frame / 2), y + height / 2, z + relief / 2, 'portal-jamb'));
  push(out.trim, slab(width, frame, relief, x, y + height - frame, z + relief / 2,
    'portal-head'));
  const canopyY = y + height - frame * 0.30;
  push(out.roof, slab(width + 0.50, Math.max(0.10, canopyHeight), canopyDepth,
    x, canopyY, z + canopyDepth / 2, 'entry-canopy'));
  for (const hand of [-1, 1]) {
    const bx = x + hand * (width * 0.34);
    push(out.iron, strutZY(bx, canopyY - 0.60, z + 0.04,
      canopyY, z + Math.min(0.60, canopyDepth * 0.48), 0.12, 0.12, 'canopy-bracket'));
  }
  if (number) push(out.trim, box(0.40, 0.30, 0.06,
    x + width / 2 - frame / 2, y + height * 0.62, z + relief + 0.03, 'number-plate'));
  if (sconces) for (const hand of [-1, 1]) {
    const sx = x + hand * (width / 2 + 0.18);
    push(out.iron, box(0.25, 0.35, 0.12, sx, y + 2.40, z + 0.06, 'entry-sconce'));
    push(out.shadow, box(0.12, 0.18, 0.04, sx, y + 2.40, z + 0.14, 'entry-sconce-face'));
  }
  return out;
}

/** Fine opening reglet: a dark 0.06 reveal line on jambs and head. */
export function revealReglet(ctx, {
  x = 0, y = 0, z = 0, width = 1.2, height = 1.6, thickness = 0.06,
} = {}) {
  const out = { shadow: [] };
  const t = Math.max(0.06, thickness);
  push(out.shadow, box(t, height, t, x - width / 2, y + height / 2, z + t / 2, 'reveal-reglet'));
  push(out.shadow, box(t, height, t, x + width / 2, y + height / 2, z + t / 2, 'reveal-reglet'));
  push(out.shadow, box(width + t, t, t, x, y + height, z + t / 2, 'reveal-reglet'));
  return out;
}

export function projectingSill(ctx, {
  x = 0, y = 0, z = 0, width = 1.2, projection = 0.12,
} = {}) {
  const out = { wallAlt: [] };
  push(out.wallAlt, slab(width + 0.18, 0.10, projection, x, y,
    z + projection / 2, 'projecting-sill'));
  return out;
}

export function balconyDripNose(ctx, {
  x = 0, y = 0, z = 0, width = 2.6, depth = 0.20,
} = {}) {
  const out = { wallAlt: [], shadow: [] };
  push(out.wallAlt, slab(width, 0.20, depth, x, y, z + depth / 2, 'balcony-drip-nose'));
  push(out.shadow, box(width * 0.94, 0.025, 0.025, x, y + 0.025,
    z + depth + 0.01, 'balcony-drip-groove'));
  return out;
}

export function eaveSoffitFascia(ctx, {
  x = 0, y = 0, z = 0, length = 2.6, projection = 0.25,
} = {}) {
  const out = { roof: [], trim: [] };
  push(out.roof, slab(length, 0.08, projection, x, y, z - projection / 2, 'eave-soffit'));
  push(out.trim, slab(length, 0.25, 0.08, x, y, z + 0.04, 'eave-fascia'));
  return out;
}

export function timberBattenScreen(ctx, {
  x = 0, y = 0, z = 0, width = 1.8, height = 2.4, pitch = 0.09,
  depth = 0.09,
} = {}) {
  const out = { trim: [] };
  if (!(width > 0.12) || !(height > 0.12)) return out;
  const intervals = Math.max(2, Math.round(width / Math.max(0.09, pitch)));
  const step = width / intervals;
  const battenW = Math.max(0.04, Math.min(0.06, step * 0.55));
  for (let i = 0; i <= intervals; i += 1) push(out.trim, box(battenW, height,
    Math.max(0.06, depth), x - width / 2 + step * i, y + height / 2, z, 'timber-batten'));
  push(out.trim, box(width, 0.08, depth, x, y + 0.04, z, 'screen-bottom-rail'));
  push(out.trim, box(width, 0.08, depth, x, y + height - 0.04, z, 'screen-top-rail'));
  return out;
}

/** The five-scale contemporary kit as one palette-keyed bundle. */
export function contemporaryDetailSet(ctx, {
  x = 0, y = 0, z = 0, openingW = 1.2, openingH = 1.6,
  run = 2.6, screenW = 1.8, screenH = 2.4, salt = 381,
} = {}) {
  // Reserve the 380s for this family even when a lane passes its own bay index.
  void (380 + (Math.abs(salt | 0) % 20));
  return mergeBundles(
    revealReglet(ctx, { x, y, z, width: openingW, height: openingH }),
    projectingSill(ctx, { x, y, z, width: openingW }),
    balconyDripNose(ctx, { x, y: y - 0.20, z, width: run }),
    eaveSoffitFascia(ctx, { x, y: y + openingH + 0.36, z, length: run }),
    timberBattenScreen(ctx, { x: x + run * 0.28, y, z: z + 0.08,
      width: screenW, height: screenH }),
  );
}

/**
 * Quoins wrapping a vertical corner. `x, z` is the arris; `hand` +1 when the side wall runs
 * toward +X. Courses alternate which face gets the long stone, which is the interlock a
 * real corner has and the thing that stops quoins reading as stuck-on tiles.
 */
export function quoins(ctx, {
  x = 0, yBase = 0, z = 0, hand = 1, height = 6.0,
  course = 0.40, long = 0.64, short = 0.34, projection = 0.05,
} = {}) {
  const out = { trim: [] };
  if (!(height > course)) return out;
  const c = ctx.q === 'low' ? course * 2 : course;
  const n = Math.max(1, Math.floor(height / c));
  for (let i = 0; i < n; i += 1) {
    const y = yBase + c * i;
    const h = c * 0.86;
    const frontLen = i % 2 === 0 ? long : short;
    const sideLen = i % 2 === 0 ? short : long;
    push(out.trim, slab(frontLen, h, projection, x - hand * frontLen / 2, y, z + projection / 2, 'quoin-front'));
    push(out.trim, slab(projection, h, sideLen, x + hand * projection / 2, y, z - sideLen / 2, 'quoin-side'));
  }
  return out;
}

/** Parapet crowns. Every frontage in ref-01 wears one of these. */
export const PEDIMENT_STYLES = Object.freeze(['segmental', 'triangular', 'scroll', 'plain']);
/** What sits in the tympanum. */
export const PEDIMENT_MOTIFS = Object.freeze(['rosette', 'shell', 'panel', 'none']);

/**
 * The crown of a boom-style parapet. `y` is the springing line — the top of the parapet
 * wall the pediment rises from — and the motif fills the tympanum. Returns the tympanum
 * field under `wall` so it takes the house colour, exactly as the reference row does.
 */
export function parapetPediment(ctx, {
  x = 0, y = 0, z = 0, width, height = 0.62, depth = 0.22,
  style = null, motif = null, salt = 371,
} = {}) {
  const out = { trim: [], wall: [], iron: [] };
  if (!(width > 0.3) || !(height > 0.1)) return out;
  const kind = style ?? ctx.v.pick(salt, PEDIMENT_STYLES);
  const sign = motif ?? ctx.v.pick(salt + 1, PEDIMENT_MOTIFS);
  const t = 0.115;

  // The springing blocks. They carry the pediment and stop it floating on the parapet.
  push(out.trim, slab(t * 2.1, height * 0.34, depth * 1.25, x - width / 2, y, z + depth * 0.62, 'pediment-pier'));
  push(out.trim, slab(t * 2.1, height * 0.34, depth * 1.25, x + width / 2, y, z + depth * 0.62, 'pediment-pier'));

  if (kind === 'plain' || ctx.q === 'low') {
    push(out.wall, slab(width, height * 0.72, depth * 0.7, x, y, z + depth * 0.35, 'pediment-field'));
    push(out.trim, bandRun(width * 1.05, height * 0.24, x, y + height * 0.72, z, depth, CORNICE_PROFILE, 'pediment-cornice'));
    return out;
  }

  if (kind === 'triangular') {
    const apex = y + height;
    const fills = lod(ctx, 6, 4, 2);
    for (let i = 0; i < fills; i += 1) {
      const f = (i + 0.5) / fills;
      push(out.wall, slab(width * (1 - f) + t, height / fills + 0.006, depth * 0.6,
        x, y + (height * i) / fills, z + depth * 0.3, 'pediment-field'));
    }
    push(out.trim, bar(x - width / 2, y, x, apex, z + depth * 0.72, t, depth * 0.85, 'pediment-rake'));
    push(out.trim, bar(x + width / 2, y, x, apex, z + depth * 0.72, t, depth * 0.85, 'pediment-rake'));
    push(out.trim, slab(width * 1.06, t * 0.85, depth * 1.05, x, y - t * 0.85, z + depth * 0.52, 'pediment-bed'));
    push(out.trim, slab(t * 1.5, t * 1.2, depth * 1.1, x, apex - t * 0.4, z + depth * 0.55, 'pediment-apex'));
    pedimentMotif(out, ctx, sign, x, y + height * 0.34, z + depth * 0.5, Math.min(width * 0.17, height * 0.30), t);
    return out;
  }

  // segmental and scroll share the arch; scroll adds volutes at the springing.
  const span = width;
  const rise = height;
  const R = (span * span / 4 + rise * rise) / (2 * rise);
  const cy = y + rise - R;
  const half = Math.asin(Math.min(1, (span / 2) / R));
  const segs = lod(ctx, 8, 8, 5);
  const fills = lod(ctx, 6, 4, 2);
  for (let i = 0; i < fills; i += 1) {
    const yi = y + (rise * (i + 0.5)) / fills;
    const hw = Math.sqrt(Math.max(0, R * R - (yi - cy) * (yi - cy)));
    push(out.wall, slab(hw * 2, rise / fills + 0.006, depth * 0.6, x, y + (rise * i) / fills, z + depth * 0.3, 'pediment-field'));
  }
  push(out.trim, arcBars(x, cy, z + depth * 0.72, R + t * 0.5, Math.PI / 2 - half, Math.PI / 2 + half, segs, t, depth * 0.85, 'pediment-arch'));
  if (ctx.q === 'high') {
    push(out.trim, arcBars(x, cy, z + depth * 0.9, R + t * 1.35, Math.PI / 2 - half * 0.98, Math.PI / 2 + half * 0.98, segs, t * 0.42, depth * 0.5, 'pediment-arch-bead'));
  }
  push(out.trim, slab(width * 1.06, t * 0.85, depth * 1.05, x, y - t * 0.85, z + depth * 0.52, 'pediment-bed'));

  if (kind === 'scroll' && ctx.q !== 'low') {
    for (const hand of [-1, 1]) {
      const sx = x + hand * (span / 2 + t * 0.6);
      for (let k = 0; k < 3; k += 1) {
        const r = height * (0.30 - k * 0.08);
        push(out.trim, arcBars(sx, y + height * 0.22, z + depth * 0.75, r,
          hand > 0 ? -Math.PI * 0.5 : Math.PI * 0.5, hand > 0 ? Math.PI * 0.62 : Math.PI * 0.38,
          4, t * 0.6, depth * 0.6, 'pediment-volute'));
      }
    }
  }
  pedimentMotif(out, ctx, sign, x, y + rise * 0.34, z + depth * 0.55, Math.min(width * 0.16, rise * 0.40), t);
  return out;
}

function pedimentMotif(out, ctx, sign, x, y, z, r, t) {
  if (sign === 'none' || ctx.q === 'low' || r < 0.05) return;
  if (sign === 'panel') {
    push(out.trim, box(r * 2.6, r * 1.5, 0.05, x, y, z, 'pediment-panel'));
    push(out.wall, box(r * 2.2, r * 1.1, 0.03, x, y, z + 0.035, 'pediment-panel-field'));
    return;
  }
  if (sign === 'shell') {
    const ribs = lod(ctx, 9, 6, 4);
    for (let i = 0; i < ribs; i += 1) {
      const a = Math.PI * (0.08 + 0.84 * (i / (ribs - 1)));
      push(out.trim, bar(x, y - r * 0.5, x + Math.cos(a) * r, y - r * 0.5 + Math.sin(a) * r, z, t * 0.45, 0.05, 'shell-rib'));
    }
    push(out.trim, arcBars(x, y - r * 0.5, z, r, Math.PI * 0.06, Math.PI * 0.94, lod(ctx, 8, 5, 3), t * 0.5, 0.05, 'shell-rim'));
    return;
  }
  // rosette — the sun on the centre frontage of ref-01.
  const petals = lod(ctx, 12, 8, 6);
  for (let i = 0; i < petals; i += 1) {
    const a = (Math.PI * 2 * i) / petals;
    push(out.trim, bar(x + Math.cos(a) * r * 0.34, y + Math.sin(a) * r * 0.34,
      x + Math.cos(a) * r, y + Math.sin(a) * r, z, t * 0.42, 0.055, 'rosette-petal'));
  }
  push(out.trim, arcBars(x, y, z, r * 0.34, 0, Math.PI * 2, lod(ctx, 10, 7, 5), t * 0.4, 0.05, 'rosette-ring'));
  push(out.trim, ball(r * 0.26, x, y, z + 0.04, 'rosette-boss', 8));
}

/**
 * Art-deco horizontal reliefs — the stacked speed lines beside the windows in ref-05.
 * `taperEnds` shortens each successive line, which is what makes them read as motion.
 */
export function speedLines(ctx, {
  x = 0, y = 0, z = 0, length = 0.7, count = 3, height = 0.055, gap = 0.055,
  projection = 0.05, taperEnds = 0.16, align = 0,
} = {}) {
  const out = { trim: [] };
  if (!(length > 0.05) || ctx.q === 'low') return out;
  const n = Math.max(1, count | 0);
  const h = Math.max(0.06, height);
  const relief = Math.max(0.05, projection);
  for (let i = 0; i < n; i += 1) {
    const len = length * (1 - taperEnds * i);
    if (len <= 0.04) break;
    // `align` −1 keeps the left ends flush, +1 the right, 0 centres them.
    const cx = x + align * (length - len) / 2;
    const base = y + (h + gap) * i;
    push(out.trim, slab(len, h, relief, cx, base, z + relief / 2, 'speed-line'));
    // A 0.02 lower arris projects beyond the face and catches a stable raking shadow, so the
    // line reads as moulded relief rather than a painted stripe.
    push(out.trim, rotBox(len, 0.028, 0.028, cx, base + 0.014,
      z + relief + 0.010, { x: Math.PI / 4 }, 'speed-line-lower-chamfer'));
  }
  return out;
}

/**
 * The ziggurat parapet of an interwar block: symmetric steps rising to a centre panel, with
 * vertical reeding at the top. `y` is the top of the parapet wall.
 */
export function steppedParapet(ctx, {
  x = 0, y = 0, z = 0, width = 2.2, height = 0.75, steps = 3, depth = 0.28, reeds = true,
} = {}) {
  const out = { trim: [], wall: [] };
  if (!(width > 0.2) || !(height > 0.08)) return out;
  const n = Math.max(1, ctx.q === 'low' ? 1 : steps | 0);
  for (let i = 0; i < n; i += 1) {
    const f = i / n;
    const w = width * (1 - f * 0.58);
    const h = height / n;
    push(out.wall, slab(w, h + 0.01, depth, x, y + h * i, z + depth / 2 - 0.02, 'deco-step'));
    push(out.trim, slab(w * 1.02, 0.05, depth * 1.12, x, y + h * (i + 1) - 0.05, z + depth * 0.56 - 0.02, 'deco-step-cap'));
  }
  if (reeds && ctx.q === 'high') {
    const topW = width * (1 - ((n - 1) / n) * 0.58) * 0.6;
    const count = Math.max(3, Math.round(topW / 0.09));
    for (let i = 0; i < count; i += 1) {
      const rx = x - topW / 2 + (topW * (i + 0.5)) / count;
      push(out.trim, box(0.035, height * 0.5, 0.045, rx, y + height * 0.62, z + depth + 0.01, 'deco-reed'));
    }
  }
  return out;
}

/* ════════════════════════════════ finials and urns ═══════════════════════════════ */

/** Finial styles. */
export const FINIAL_STYLES = Object.freeze(['spike', 'ball', 'acorn']);

/**
 * The spike or ball on a gable apex, a fence pier, a parapet pier. Returned under `iron`;
 * a rendered pier cap wants `{ iron: 'trim' }`.
 */
export function finial(ctx, {
  x = 0, yBase = 0, z = 0, height = 0.42, radius = 0.055, style = 'spike', salt = 381,
} = {}) {
  const out = { iron: [], roof: [] };
  if (!(height > 0.06)) return out;

  if (isFederationVilla(ctx) && height >= 0.80) {
    // The tower finial is called at the top of the existing cone, which gives this shared
    // component the one reliable datum needed to sleeve that smooth cone with seven stepped
    // octagonal shingle courses. Each lower radius projects 35 mm past the course above; the
    // lowest course flares to a 1.78 m bell foot.
    const courseH = 2.03 / 7;
    const topRadius = 0.16;
    for (let i = 0; i < 7; i += 1) {
      const fromBottom = i / 6;
      const lower = i === 0 ? 1.78 : 1.62 + (topRadius - 1.62) * fromBottom + 0.035;
      const upper = i === 6 ? topRadius : 1.62 + (topRadius - 1.62) * ((i + 1) / 7);
      push(out.roof, taper(lower, Math.max(0.14, upper), courseH,
        x, yBase - 2.03 + i * courseH, z, 'villa-tower-shingle-course', 8));
    }
  }
  const kind = style ?? ctx.v.pick(salt, FINIAL_STYLES);
  const segs = lod(ctx, 8, 6, 5);
  push(out.iron, slab(radius * 3.0, height * 0.14, radius * 3.0, x, yBase, z, 'finial-base'));
  const y = yBase + height * 0.14;

  if (ctx.q === 'low') {
    push(out.iron, prism(4, radius * 1.5, radius * 0.3, height * 0.86, x, y, z, Math.PI / 4, 'finial-spike'));
    return out;
  }
  if (kind === 'ball') {
    push(out.iron, taper(radius * 1.4, radius * 0.9, height * 0.30, x, y, z, 'finial-neck', segs));
    push(out.iron, ball(radius * 1.9, x, y + height * 0.30 + radius * 1.6, z, 'finial-ball', segs));
    push(out.iron, taper(radius * 0.5, radius * 0.22, height * 0.16, x, y + height * 0.30 + radius * 3.1, z, 'finial-tip', segs));
    return out;
  }
  if (kind === 'acorn') {
    push(out.iron, taper(radius * 1.5, radius * 1.15, height * 0.24, x, y, z, 'finial-cup', segs));
    push(out.iron, lathe([[radius * 1.15, 0], [radius * 1.5, height * 0.16], [radius * 1.2, height * 0.42],
      [radius * 0.55, height * 0.62], [radius * 0.06, height * 0.70]], x, y + height * 0.24, z, segs, 'finial-acorn'));
    return out;
  }
  push(out.iron, ball(radius * 1.7, x, y + radius * 1.4, z, 'finial-knop', segs));
  push(out.iron, taper(radius * 1.05, radius * 0.16, height * 0.62, x, y + radius * 2.6, z, 'finial-spike', segs));
  if (ctx.q === 'high') push(out.iron, ball(radius * 0.75, x, y + radius * 2.6 + height * 0.30, z, 'finial-bead', 6));
  return out;
}

/**
 * A parapet or gatepost urn. Turned rather than assembled, because the profile is the whole
 * point of an urn and stacked boxes would read as a wedding cake.
 */
export function urn(ctx, { x = 0, yBase = 0, z = 0, height = 0.62, radius = 0.16 } = {}) {
  const out = { trim: [] };
  if (!(height > 0.1)) return out;
  const plinthH = height * 0.17;
  push(out.trim, slab(radius * 2.5, plinthH, radius * 2.5, x, yBase, z, 'urn-plinth'));
  if (ctx.q === 'low') {
    push(out.trim, prism(6, radius * 0.9, radius * 0.7, height - plinthH, x, yBase + plinthH, z, 0, 'urn-body'));
    return out;
  }
  const h = height - plinthH;
  const profile = [
    [radius * 0.42, 0], [radius * 0.52, h * 0.06], [radius * 0.34, h * 0.14],
    [radius * 0.62, h * 0.26], [radius * 0.94, h * 0.46], [radius * 0.98, h * 0.60],
    [radius * 0.74, h * 0.76], [radius * 0.86, h * 0.86], [radius * 1.00, h * 0.94],
    [radius * 0.92, h],
  ];
  const pts = ctx.q === 'high' ? profile : profile.filter((_, i) => i % 2 === 0 || i === profile.length - 1);
  push(out.trim, lathe(pts, x, yBase + plinthH, z, lod(ctx, 8, 8, 6), 'urn-body'));
  return out;
}

/* ═════════════════════════════ roof edge, water, eaves ═══════════════════════════ */

/**
 * The eave line: a fascia board and the gutter on it. `y` is the TOP of the gutter and `z`
 * the fascia plane. Ogee is the period section; quad is the contemporary one.
 */
export function gutterRun(ctx, {
  x = 0, y = 0, z = 0, length, style = 'ogee', depth = 0.13, fascia = true, fasciaDrop = 0.20,
} = {}) {
  const out = { joinery: [], roofTrim: [] };
  if (!(length > 0.05)) return out;
  if (fascia) push(out.joinery, slab(length, fasciaDrop, 0.05, x, y - fasciaDrop, z, 'fascia'));

  if (ctx.q === 'low' || style === 'quad') {
    push(out.roofTrim, slab(length, 0.14, depth, x, y - 0.14, z + depth / 2, 'gutter'));
    if (ctx.q !== 'low') push(out.roofTrim, slab(length, 0.035, depth * 1.15, x, y - 0.035, z + depth * 0.57, 'gutter-bead'));
    return out;
  }
  // Ogee: a deep back, a kicked lower face and a bead. Three parts, one profile, and the
  // shadow it throws under the eave is worth more than the section itself.
  push(out.roofTrim, slab(length, 0.135, 0.035, x, y - 0.15, z + 0.02, 'gutter-back'));
  push(out.roofTrim, slab(length, 0.085, depth, x, y - 0.085, z + depth / 2, 'gutter-face'));
  push(out.roofTrim, rotBox(length, 0.055, depth * 0.75, x, y - 0.135, z + depth * 0.62, { x: 0.62 }, 'gutter-ogee'));
  push(out.roofTrim, slab(length, 0.035, depth * 1.2, x, y - 0.035, z + depth * 0.58, 'gutter-bead'));
  return out;
}

/**
 * A downpipe from a gutter outlet to a shoe at the ground, with the swan neck that steps it
 * back from the fascia to the wall. `z` is the wall face; the pipe stands proud of it.
 */
export function downpipe(ctx, {
  x = 0, z = 0, fromY = 0, toY = 0, radius = 0.05, swan = 0.16, brackets = 2, shoe = true,
} = {}) {
  const out = { roofTrim: [], wallAlt: [] };
  const drop = fromY - toY;
  if (!(drop > 0.2)) return out;
  const segs = lod(ctx, 8, 6, 5);
  const zPipe = z + radius + 0.03;
  const zHead = zPipe + (ctx.q === 'low' ? 0 : swan);

  if (ctx.q === 'low') {
    push(out.roofTrim, cyl(radius, drop, x, (fromY + toY) / 2, zPipe, 'y', 'downpipe', 5));
    return out;
  }
  push(out.roofTrim, cyl(radius * 1.35, 0.09, x, fromY - 0.045, zHead, 'y', 'downpipe-outlet', segs));
  const neckTop = fromY - 0.09;
  const neckBot = neckTop - swan * 1.1;
  push(out.roofTrim, pipeBetween(x, neckTop, zHead, x, neckBot, zPipe, radius, segs, 'downpipe-swan'));
  push(out.roofTrim, cyl(radius, neckBot - toY - (shoe ? 0.12 : 0), x, (neckBot + toY + (shoe ? 0.12 : 0)) / 2, zPipe, 'y', 'downpipe', segs));

  const n = Math.max(0, brackets | 0);
  for (let i = 0; i < n; i += 1) {
    const by = toY + ((neckBot - toY) * (i + 0.7)) / (n + 0.4);
    push(out.roofTrim, box(radius * 3.4, 0.05, radius + 0.05, x, by, z + (radius + 0.05) / 2, 'downpipe-strap'));
  }
  if (shoe) {
    push(out.roofTrim, pipeBetween(x, toY + 0.16, zPipe, x, toY + 0.05, zPipe + 0.11, radius * 1.05, segs, 'downpipe-shoe'));
    push(out.wallAlt, slab(radius * 5.0, 0.05, radius * 5.0, x, toY, zPipe + 0.06, 'downpipe-gully'));
  }
  return out;
}

/** Bracket styles: 'scroll' the classical console, 'knee' the bungalow brace, 'block'. */
export const BRACKET_STYLES = Object.freeze(['scroll', 'knee', 'block']);

/**
 * The bracket under an eave or a cornice. `x, y, z` is the point where it meets the wall at
 * the top; the bracket hangs below and projects forward.
 */
export function eavesBracket(ctx, {
  x = 0, y = 0, z = 0, size = 0.38, style = 'scroll', width = 0.11, projection = null,
} = {}) {
  const out = { trim: [] };
  if (!(size > 0.05)) return out;
  const proj = projection ?? size * 0.9;
  if (ctx.q === 'low') {
    push(out.trim, box(width, size * 0.8, proj, x, y - size * 0.4, z + proj / 2, 'bracket'));
    return out;
  }

  if (style === 'knee') {
    if (isCalifornianBungalow(ctx)) {
      // A Californian knee is a bearing assembly, not a decorative triangular wedge.  The
      // back faces of the leg, arm and corbel enter the wall/rafter plane by 30 mm so neither
      // studio AO nor a shallow camera angle can open an air gap at the construction joint.
      const memberD = 0.12;
      const legH = 0.55;
      const armL = 0.42;
      const seatZ = size > 0.50 ? ctx.env.frontZ - 1.54 : z;
      const wallCentreZ = seatZ + memberD / 2 - 0.03;
      push(out.trim, box(0.10, legH, memberD, x, y - legH / 2, wallCentreZ,
        'californian-knee-vertical-leg'));
      push(out.trim, box(0.10, 0.12, armL, x, y - 0.06,
        seatZ + armL / 2 - 0.03, 'californian-knee-top-arm'));
      push(out.trim, strutZY(x, y - legH + 0.05, seatZ + 0.06,
        y - 0.08, seatZ + armL - 0.04, 0.09, 0.09, 'californian-knee-diagonal-strut'));
      push(out.trim, box(0.14, 0.10, 0.10, x, y - legH - 0.05,
        seatZ + 0.05 - 0.03, 'californian-knee-corbel-seat'));
      return out;
    }
    // Other bungalow families retain the existing compact post/arm/diagonal bracket.
    push(out.trim, box(width, size, width, x, y - size / 2, z + width / 2, 'knee-post'));
    push(out.trim, box(width, width, proj, x, y - width / 2, z + proj / 2, 'knee-beam'));
    push(out.trim, strutZY(x, y - size, z + width, y - width, z + proj,
      width * 0.85, width * 0.85, 'knee-brace'));
    if (ctx.q === 'high') push(out.trim, ball(width * 0.22, x + width * 0.55,
      y - size * 0.62, z + proj * 0.42, 'knee-bolt', 6));
    return out;
  }
  if (style === 'block') {
    push(out.trim, box(width, size * 0.72, proj, x, y - size * 0.36, z + proj / 2, 'modillion'));
    push(out.trim, box(width * 1.25, 0.045, proj * 1.12, x, y - 0.02, z + proj * 0.56, 'modillion-cap'));
    push(out.trim, rotBox(width, 0.05, proj * 0.5, x, y - size * 0.72, z + proj * 0.3, { x: -0.7 }, 'modillion-stop'));
    return out;
  }

  // scroll — a console: a back plate, a curved front edge, a volute at the bottom.
  push(out.trim, box(width, size, 0.055, x, y - size / 2, z + 0.028, 'console-back'));
  push(out.trim, box(width, 0.055, proj, x, y - 0.028, z + proj / 2, 'console-top'));
  const segs = lod(ctx, 6, 4, 3);
  // Build about the local origin before turning XY into ZY.  Building at world `x` and then
  // translating by `x` again was the source of the orphan cream arc beside Carlton.
  const bars = arcBars(0, y - size + proj * 0.55, 0, proj * 0.62,
    -Math.PI * 0.5, Math.PI * 0.10, segs, 0.06, width, 'console-curve');
  for (const g of bars) {
    // Built in XY then laid into ZY: the console's curve runs front-to-back, not across.
    g.rotateY(Math.PI / 2);
    g.translate(x, 0, z + proj * 0.42);
    tag(g, 'console-curve');
    push(out.trim, g);
  }
  if (ctx.q === 'high') {
    push(out.trim, cyl(width * 0.42, width * 1.1, x, y - size + proj * 0.18, z + proj * 0.30, 'x', 'console-volute', 8));
  }
  return out;
}

/**
 * Exposed rafter ends along an eave — the bungalow and Federation signature. Cut square to
 * the wall, angled to the pitch, so the run reads as structure rather than as a comb.
 */
export function rafterTails(ctx, {
  x = 0, y = 0, z = 0, length, projection = 0.42, pitch = 0.42,
  size = 0.09, spacing = 0.46, profiled = false,
} = {}) {
  const californian = isCalifornianBungalow(ctx);
  const californianFlank = californian && Math.abs(pitch) > 0.01;
  const out = californianFlank ? { joinery: [] } : { trim: [] };
  const tails = californianFlank ? out.joinery : out.trim;
  if (!(length > 0.05) || ctx.q === 'low') return out;
  // The lane also calls this helper for a zero-pitch front/rear "gable tail" run. On the
  // Californian that produces four loose rods beyond the rake, not rafters or through-purlins.
  // Keep the real nonzero-pitch flank run and suppress only that malformed duplicate.
  if (californian && !californianFlank) return out;
  if (isBrightonBungalow(ctx)) {
    projection = 0.18;
    spacing = 0.45;
    size = 0.045;
    profiled = false;
  }
  if (californianFlank) {
    projection = 0.46;
    spacing = 0.46;
    size = 0.075;
    profiled = false;
  }
  const step = ctx.q === 'high' ? spacing : spacing * 1.6;
  const n = Math.max(2, Math.round(length / step));
  const rise = Math.tan(pitch) * projection;
  for (let i = 0; i <= n; i += 1) {
    const rx = x - length / 2 + (length * i) / n;
    const depth = californianFlank ? 0.16 : isBrightonBungalow(ctx) ? 0.09 : profiled ? 0.17 : size * 1.35;
    push(tails, strutZY(rx, y, z, y - rise, z + projection, size, depth, 'rafter-tail'));
    if (ctx.q === 'high') {
      if (profiled) {
        const tipRun = Math.min(0.20, projection * 0.46);
        const tipRise = Math.tan(pitch) * tipRun;
        push(tails, strutZY(rx, y - rise + tipRise, z + projection - tipRun,
          y - rise, z + projection, size, 0.11, 'rafter-profiled-tip'));
        push(tails, cyl(0.04, size, rx, y - rise + 0.04,
          z + projection - 0.055, 'x', 'rafter-quarter-round-undercut', 6));
      } else {
        // The Californian tail ends in a 90 mm long 45-degree rising cut. A small wedge is
        // enough to change the grazing-angle silhouette from a vertical dentil to a rafter.
        const cutH = californianFlank ? 0.09 : size * 1.5;
        push(tails, rotBox(size * 1.1, cutH, californianFlank ? 0.09 : size * 0.5, rx,
          y - rise + (californianFlank ? 0.02 : -size * 0.2),
          z + projection - (californianFlank ? 0.045 : 0),
          { x: californianFlank ? Math.PI / 4 : 0 }, 'rafter-cut'));
      }
    }
  }
  return out;
}

/**
 * The capping roll along a ridge. Segmented into individual caps with a hair of daylight
 * between them, which is the difference between a terracotta ridge and a plastic tube.
 */
export function roofRidgeCap(ctx, {
  x = 0, y = 0, z = 0, length, radius = 0.085, axis = 'x', bed = true,
} = {}) {
  const out = { roofTrim: [], iron: [] };
  if (!(length > 0.05)) return out;
  const segs = lod(ctx, 6, 5, 4);
  if (bed) {
    push(out.roofTrim, axis === 'x'
      ? slab(length, 0.05, radius * 2.1, x, y - 0.05, z, 'ridge-bed')
      : slab(radius * 2.1, 0.05, length, x, y - 0.05, z, 'ridge-bed'));
  }
  if (axis === 'x' && isBrightonBungalow(ctx) && length > 4.0) {
    push(out.roofTrim, taper(0.075, 0.025, 0.30, x, y + radius * 0.45, z,
      'brighton-ridge-finial', 6));
    push(out.roofTrim, ball(0.065, x, y + 0.18, z, 'brighton-ridge-finial-knop', 6));
  }
  if (ctx.q === 'low') {
    push(out.roofTrim, cyl(radius, length, x, y + radius * 0.5, z, axis, 'ridge-cap', 5));
    return out;
  }
  const capLen = ctx.q === 'high' ? 0.42 : 0.62;
  const n = Math.max(1, Math.round(length / capLen));
  const step = length / n;
  for (let i = 0; i < n; i += 1) {
    const o = -length / 2 + step * (i + 0.5);
    push(out.roofTrim, cyl(radius, step * 0.94,
      axis === 'x' ? x + o : x, y + radius * 0.5, axis === 'x' ? z : z + o, axis, 'ridge-cap', segs));
  }
  if (axis === 'x' && isFederationVilla(ctx) && length > 2.0 && ctx.q !== 'low') {
    const pitch = 0.09;
    const count = Math.max(2, Math.floor(length / pitch));
    const step = length / count;
    push(out.iron, slab(length, 0.012, 0.012, x, y + 0.16, z,
      'villa-ridge-cresting-top-rail'));
    for (let i = 0; i <= count; i += 1) {
      const px = x - length / 2 + i * step;
      push(out.iron, slab(0.006, 0.16, 0.006, px, y, z,
        'villa-ridge-cresting-upright'));
    }
  }
  return out;
}

/**
 * The roll caps down the hips of a tiled or slated roof — the four diagonals in ref-02.
 * Takes the same numbers as core's `hip()` so a lane calls both with one set of values.
 */
export function roofTileRolls(ctx, {
  w, d, height, ridgeLen, x = 0, yBase = 0, z = 0, radius = 0.08, ridge = true,
} = {}) {
  const out = { roofTrim: [] };
  if (!(w > 0.1) || !(d > 0.1) || !(height > 0.02)) return out;
  const hw = w / 2;
  const hd = d / 2;
  const hr = Math.max(0, Math.min(ridgeLen ?? 0, w * 0.98)) / 2;
  const yTop = yBase + height;
  const segs = lod(ctx, 6, 5, 4);
  const caps = lod(ctx, 5, 3, 1);

  if (ridge && hr > 0.02) {
    push(out.roofTrim, roofRidgeCap(ctx, { x, y: yTop, z, length: hr * 2, radius, axis: 'x' }).roofTrim);
  }
  // Four hips, ridge end to eave corner. Subdivided so each run reads as laid caps and so
  // the merge does not carry one very long thin box per hip.
  const ends = [
    [x - hr, yTop, z, x - hw, yBase, z - hd],
    [x - hr, yTop, z, x - hw, yBase, z + hd],
    [x + hr, yTop, z, x + hw, yBase, z - hd],
    [x + hr, yTop, z, x + hw, yBase, z + hd],
  ];
  for (const [ax, ay, az, bx, by, bz] of ends) {
    for (let i = 0; i < caps; i += 1) {
      const t0 = i / caps;
      const t1 = (i + 0.94) / caps;
      push(out.roofTrim, pipeBetween(
        ax + (bx - ax) * t0, ay + (by - ay) * t0 + radius * 0.4, az + (bz - az) * t0,
        ax + (bx - ax) * t1, ay + (by - ay) * t1 + radius * 0.4, az + (bz - az) * t1,
        radius, segs, 'hip-roll'));
    }
  }
  return out;
}

/**
 * A chimney: shaft, corbelled cap, terracotta pots.
 *
 * The one component the header promised and the file did not reach. It matters more than its
 * size suggests — a terrace roofline without a chimney reads as a shed, and in ref-01 the
 * five chimneys are what give the row its skyline. `baseY` should sit INSIDE the roof solid,
 * not on top of it, so the shaft emerges through the pitch rather than balancing on it.
 *
 * Pots take `roofTrim` rather than a bucket of their own: terracotta against a brick shaft is
 * the read, and the palette has no ninth slot to spend on it.
 *
 * @param {object} ctx
 * `wallFace` is the Z plane of the masonry elevation that carries the stack.  When supplied,
 * a breast continues from `wallBaseY` to the roof penetration; this is the construction-safe
 * path for new callers.  Legacy callers still receive the full roof stack while their lane is
 * migrated, rather than silently losing a skyline-critical component.
 *
 * @param {{x?:number, z?:number, baseY?:number, height?:number, width?:number, depth?:number,
 *          pots?:number, salt?:number, capOnly?:boolean, wallFace?:number,
 *          wallBaseY?:number}} options
 */
export function chimney(ctx, {
  x = 0, z = 0, baseY = 0, height = 2.2, width = 0.9, depth = 0.62,
  pots = null, salt = 331, capOnly = false, wallFace = null, wallBaseY = 0,
} = {}) {
  const masonryKey = ctx.archetypeId?.startsWith('terrace')
    || ctx.archetypeId === 'walkup-flats' || ctx.archetypeId === 'art-deco-flats'
    ? 'wall'
    : (ctx.archetypeId === 'cottage-federation' || ctx.archetypeId === 'heritage-federation-villa')
      ? 'wallAlt' : 'trim';
  const out = { [masonryKey]: [], roofTrim: [], shadow: [] };
  const masonry = out[masonryKey];
  if (!(height > 0.3) || !(width > 0.1)) return out;

  const brighton = isBrightonBungalow(ctx);
  const stackW = brighton ? 0.90 : Math.max(0.95, width);
  const stackD = brighton ? 0.45 : Math.max(0.55, depth);
  const stackH = brighton ? Math.max(3.0, height) : Math.max(1.72, height);
  const capH = 0.20;
  const shaftH = stackH - capH;
  const variantSalt = 300 + (Math.abs(salt | 0) % 100);

  if (!capOnly) {
    push(masonry, slab(stackW, shaftH, stackD, x, baseY, z, 'chimney-shaft'));
    // Moulded base and flashing physically seat the shaft into the roof.  The wide, shallow
    // apron hides the pitch-intersection seam that made the old stack look balanced on top.
    push(masonry, slab(stackW + 0.20, 0.10, stackD + 0.20, x, baseY, z,
      'chimney-base-plinth'));
    push(out.roofTrim, slab(stackW + 0.16, 0.08, stackD + 0.16, x, baseY - 0.015, z,
      'chimney-flashing-apron'));
    if (brighton) {
      const apron = 0.30;
      push(out.roofTrim, rotBox(stackW + apron * 2, 0.035, apron, x, baseY + 0.02,
        z + stackD / 2 + apron / 2, { x: -Math.PI / 9 }, 'brighton-lead-apron-front'));
      push(out.roofTrim, rotBox(stackW + apron * 2, 0.035, apron, x, baseY + 0.02,
        z - stackD / 2 - apron / 2, { x: Math.PI / 9 }, 'brighton-lead-apron-back'));
      for (const hand of [-1, 1]) {
        push(out.roofTrim, rotBox(apron, 0.035, stackD + apron * 2,
          x + hand * (stackW / 2 + apron / 2), baseY + 0.02, z,
          { z: hand * Math.PI / 9 }, 'brighton-lead-apron-side'));
      }
      push(masonry, slab(stackW + 0.06, 0.12, stackD + 0.06, x,
        baseY + shaftH - 0.60, z, 'brighton-rendered-chimney-band'));
    }

    if (Number.isFinite(wallFace) && baseY > wallBaseY) {
      const breastD = Math.abs(z - wallFace) + stackD / 2;
      const breastZ = (z + wallFace) / 2;
      push(masonry, slab(stackW, baseY - wallBaseY + 0.05, breastD,
        x, wallBaseY, breastZ, 'chimney-breast'));
      push(masonry, slab(stackW + 0.16, 0.12, breastD + 0.08,
        x, wallBaseY, breastZ, 'chimney-breast-plinth'));
    }

    // Mortar course shadows give the shaft a brick scale without paying for separate bricks.
    // The lines wrap the visible front and both returns, so the three-quarter view never sees
    // a textured front pasted onto blank flanks.
    if (ctx.q !== 'low') {
      const courses = Math.max(6, Math.floor(shaftH / 0.16));
      for (let i = 1; i < courses; i += 1) {
        const cy = baseY + (shaftH * i) / courses;
        push(out.shadow, box(stackW + 0.012, 0.012, 0.014, x, cy,
          z + stackD / 2 + 0.006, 'chimney-bed-joint'));
        push(out.shadow, box(0.014, 0.012, stackD, x - stackW / 2 - 0.006, cy,
          z, 'chimney-bed-joint-return'));
        push(out.shadow, box(0.014, 0.012, stackD, x + stackW / 2 + 0.006, cy,
          z, 'chimney-bed-joint-return'));
      }
    }
  }

  if (ctx.q === 'low') {
    // At board altitude the corbel is two pixels. The cap still has to exist, because the
    // silhouette break at the top is the whole reason the chimney reads at all.
    push(out.roofTrim, slab(stackW + 0.20, capH, stackD + 0.20, x,
      baseY + shaftH, z, 'chimney-cap'));
    return out;
  }

  // Two explicit oversailing courses: first 0.12, then another 0.08.  Their fixed increments
  // preserve the heavy brick silhouette even when a legacy caller asks for a narrow vent box.
  const steps = 2;
  let y = baseY + shaftH;
  for (let i = 0; i < steps; i += 1) {
    const oversail = i === 0 ? 0.12 : 0.20;
    const h = capH / steps;
    push(masonry, slab(stackW + oversail * 2, h, stackD + oversail * 2,
      x, y, z, 'chimney-corbel'));
    y += h;
  }
  // Pots land on a recessed slab inset from the cap, rather than directly on the stack top.
  push(out.roofTrim, slab(stackW + 0.30, 0.06, stackD + 0.30, x, y, z,
    'chimney-capping'));
  y += 0.06;
  push(masonry, slab(stackW - 0.16, 0.06, stackD - 0.16, x, y, z,
    'chimney-pot-bed'));
  y += 0.06;

  if (brighton) {
    push(masonry, taper(Math.max(stackW, stackD) * 0.62,
      Math.max(stackW, stackD) * 0.48, 0.16, x, y - 0.18, z,
      'brighton-chimney-flaunching', 4));
  }

  const n = pots ?? ctx.v.int(variantSalt, 2, 3);
  const potH = lod(ctx, 0.42, 0.38, 0.35);
  const potR = Math.max(0.11, Math.min(0.14, stackW / (n * 2.8)));
  const segs = lod(ctx, 8, 6, 5);
  for (let i = 0; i < n; i += 1) {
    const px = n === 1 ? x : x - stackW * 0.28 + (stackW * 0.56 * i) / (n - 1);
    // Slight per-pot height variation, because a row of identical pots is the tell of a
    // stamped model — and salt+i so two pots on one chimney never draw the same number.
    const h = potH * ctx.v.range(300 + ((variantSalt - 300 + 1 + i) % 100), 0.92, 1.08);
    push(out.roofTrim, taper(potR, potR * 0.86, h, px, y, z, 'chimney-pot', segs));
    if (ctx.q === 'high') {
      push(out.roofTrim, cyl(potR * 1.12, 0.05, px, y + h - 0.02, z, 'y', 'chimney-pot-rim', segs));
      // The flue mouth. A dark disc set down inside the rim is cheaper than a hollow pot and
      // reads the same at every distance the board ever shows.
      push(out.shadow, cyl(potR * 0.72, 0.02, px, y + h - 0.06, z, 'y', 'chimney-flue', segs));
    }
  }
  return out;
}
