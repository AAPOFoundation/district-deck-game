// District Deck V3.41 — MP9 lane F: `missionary-school` (MISSION SCHOOL).
//
// Spec: `docs/next-phase/V341-MP9-BUILDINGS-SPEC.md` §6F — nineteenth-century mission school,
// chapel and bellcote. Salt namespace 3500–3599.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE SILHOUETTE ARGUMENT, WORKED IN PLATE COLUMNS BEFORE ANY GEOMETRY WAS WRITTEN.
//
// `school.js`'s header is the most expensive finding in this directory and it is inherited here
// rather than rediscovered: column position at the harness's `three-quarter` station is
//
//     u ≈ 0.756·x − 0.654·z
//
// so the 15 m of lot width is worth 11.3 u and the 31 m of depth is worth 20.3 u, a mass further
// BACK appears further RIGHT, and two masses whose centres are closer than about 8 u merge into
// one tooth. That lane lost three rounds doing roof work on a fault that lived in the plan.
//
// The consequence for this subject is not obvious and it decided the plan. A courtyard between a
// chapel and a schoolroom range is a strip of open ground, and a strip that runs along the
// direction (0.865, 1) — back-left to front-right — has CONSTANT u and therefore produces no
// notch at all, however wide it is. Only a courtyard that separates the two masses in
// `0.756x − 0.654z` reads as a gap. So the chapel goes front-and-WEST and the schoolroom range
// goes rear-and-EAST, which is also the right building: a mission compound is a chapel on the
// street with the school behind it round a court.
//
//   MASS                       plan extent (x, z)              u extent          centre u
//   chapel nave + roof         x −7.47…−1.43,  z −2.02…+9.62   −11.94 … −0.03      −5.85
//   bell turret + spire        x −5.45…−3.45,  z +9.20…+11.10  −11.38 …  −8.63     −9.99
//   schoolroom range + roof    x −1.35…+7.25,  z −7.45…−15.35    +3.85 … +15.52    +9.68
//   cloister walk (low, 3.5 m) x −1.90…+0.75,  z −7.90…−1.60    −0.39 …  +5.74     +2.68
//
//   Δu between the two ROOFED masses' centres     = 15.53 u   (rule asks > 8)
//   clear sky between chapel roof and range roof  =  3.88 u   (11.0 m of skyline falls to 3.5 m)
//
// The cloister is deliberately parked in that 3.88 u band at 3.5 m, which is `school.js`'s own
// covered-walkway move: the gap still reads as a gap because the thing in it is a third of the
// height of the things either side of it, and the courtyard stops being an empty hole.
//
//   1. THE SPIRE IS THE IDENTITY AND IT IS OFF-CENTRE. The bell turret stands on the street gable
//      at u −9.99, near the LEFT edge of the chapel's own band, and its cross finial tops out at
//      15.9 m against a chapel ridge of 10.9 m and a schoolroom ridge of 9.6 m. The profile is a
//      spike, a steep gable, a deep valley and a long low range — read left to right — and no
//      other subject on this board has a spike.
//   2. THE PITCH IS THE SECOND HALF OF THE SORT. 50° on the chapel against the high school's flat
//      slab and the officer school's hipped barracks. Lane E is upright and glazed, lane G is
//      symmetrical and horizontal, and this one is steep and asymmetric.
//   3. THE ORNAMENT IS MODELLED. Every arch on the lot is a real two-centred arch: the spandrel
//      above the opening is built as the complement of the arc so the punched rectangle reads as
//      a point, and a ring of radiating voussoirs in cream stone sits proud of it. Buttresses are
//      stepped with weathered set-offs, quoins alternate, the slate is coursed, the bellcote has
//      an open belfry stage with a bell in it.
//
// Colour: red brick (`wallAlt`) as the field with cream banding, quoins and dressings (`wall` and
// `trim`), blue-grey slate (`roof`), a bluestone plinth and boundary wall (`metal`). §6F asks for
// the board's warmest heritage subject and the palette request in the report is how it gets the
// last of the way there.
// ══════════════════════════════════════════════════════════════════════════════════════════════

import {
  slab, box, rotBox, cyl, part, chamferSlab, triPlate, triPlateZ, gableSolidZ, leafClump,
  CIVIC_METRICS, hole, volume, seamGable,
  plinthCourse, stringCourse, downpipe,
  boardPlate, lawn, paverRun, sealedSlab, fenceRun, gate,
  inst, shrubMass, hedgeRun, canopyTree, plantedBed, tussock, bench, bin, bikeRack,
  wallLamp,
} from './core.js';
import { civicWindow, noticeCase } from './openings.js';

const M = CIVIC_METRICS;
const Y0 = M.plateRise;
const WD = M.wallDepth;

export const MISSIONARY_SCHOOL_ENVELOPE = Object.freeze({
  footprint: Object.freeze([1, 2]),
  storeys: 2,
});

export default function buildMissionarySchool(ctx) {
  const E = ctx.env;
  // Authored against the 1 × 2 parcel (15 × 31 m after the setback lattice). Plan coordinates
  // ride the measured lot so nothing overhangs a clamped parcel; heights never scale.
  const sx = E.lotW / 15;
  const sz = E.lotD / 31;
  const G = {
    sx,
    sz,
    X: (v) => v * sx,
    Z: (v) => v * sz,
    lotW: E.lotW,
    lotD: E.lotD,
  };

  ctx.add(boardPlate(ctx, { width: E.lotW, depth: E.lotD }));
  groundAndBoundary(ctx, G);
  chapel(ctx, G);
  bellTurret(ctx, G);
  schoolRange(ctx, G);
  cloister(ctx, G);
  courtyard(ctx, G);
  frontage(ctx, G);
}

/* ══════════════════════════════ local primitives this kit lacks ═════════════════════════════ */

/**
 * A wall face expressed in its own (u, v) coordinates, so an arch can be built once and used on
 * a +z gable, a −x flank and the four faces of a belfry without four copies of the arithmetic.
 *
 * `axis` is the OUTWARD NORMAL axis ('z' or 'x'); `face` is +1 or −1; `plane` is the outer face's
 * coordinate on that axis. `u` is x when the normal runs along z, and z when it runs along x.
 * `n` is how far a piece's outer surface stands proud of the wall face — negative recesses it.
 */
function facePlane(axis, face, plane) {
  const alongZ = axis === 'z';
  return {
    /** Axis-aligned piece: `lu` across the face, `lv` up it, `ln` through it. */
    b(u, y, n, lu, lv, ln, name) {
      const off = face * (n - ln / 2);
      return alongZ
        ? box(lu, lv, ln, u, y, plane + off, name)
        : box(ln, lv, lu, plane + off, y, u, name);
    },
    /** Same piece rotated by `phi` in the face's own plane (+u toward +v). */
    r(u, y, n, lu, lv, ln, phi, name) {
      const off = face * (n - ln / 2);
      return alongZ
        ? rotBox(lu, lv, ln, u, y, plane + off, { z: phi }, name)
        : rotBox(ln, lv, lu, plane + off, y, u, { x: -phi }, name);
    },
  };
}

/**
 * A two-centred (pointed) arch profile.
 *
 * `sharp` is the striking radius as a multiple of the span: 1.0 is the equilateral arch of a
 * doorway, 1.25–1.35 the acute lancet of a chapel window. Both centres sit on the springing line
 * at ∓(R − a), so the curve leaves the impost vertically and meets its twin at a point.
 */
function archProfile(w, sharp) {
  const a = w / 2;
  const R = w * sharp;
  const c = R - a;
  const rise = Math.sqrt(Math.max(0.0001, R * R - c * c));
  return {
    a,
    R,
    c,
    rise,
    thetaMax: Math.atan2(rise, c),
    /** Height of the intrados above the springing at in-plane offset `du` from the axis. */
    h: (du) => Math.sqrt(Math.max(0, R * R - (Math.abs(du) + c) ** 2)),
  };
}

/**
 * The masonry ABOVE a two-centred arch inside its own punched rectangle.
 *
 * This is what makes the opening pointed. `volume()`/`openWall()` punch rectangles and nothing
 * else, so a lancet punched as a rectangle is a slot; the spandrel fill is the complement of the
 * arc, built column by column and always taking the HIGHER of the two intrados heights across
 * each column so the fill can never intrude into the opening. The voussoir ring then covers the
 * step edges, which is why six columns read as a smooth curve at board zoom.
 */
function spandrelFill(ctx, F, { u, spring, w, prof, cols, material, name }) {
  const out = [];
  const step = w / cols;
  for (let i = 0; i < cols; i += 1) {
    const u0 = -prof.a + i * step;
    const u1 = u0 + step;
    const hi = Math.max(prof.h(u0), prof.h(u1));
    const gap = prof.rise - hi;
    if (gap < 0.03) continue;
    out.push(part(F.b(u + u0 + step / 2, spring + hi + gap / 2, 0, step + 0.006, gap, WD,
      `${name}-spandrel`), material));
  }
  return out;
}

/**
 * The radiating voussoir ring of a two-centred arch, plus an optional hood mould over it.
 *
 * Blocks radiate from the arch's own striking centres rather than sitting tangentially, because
 * that is what a voussoir does and because a radial block's outer end automatically widens the
 * ring toward the crown, which is the read a hood needs.
 */
function voussoirRing(ctx, F, {
  u, spring, prof, depth = 0.17, thick = 0.24, segs = 6, material, hood = false, name,
}) {
  const out = [];
  const dTheta = prof.thetaMax / segs;
  for (const s of [1, -1]) {
    for (let i = 0; i < segs; i += 1) {
      const th = (i + 0.5) * dTheta;
      const rMid = prof.R + depth / 2;
      const cu = u - s * prof.c;
      const bu = cu + s * rMid * Math.cos(th);
      const bv = spring + rMid * Math.sin(th);
      const phi = Math.atan2(Math.sin(th), s * Math.cos(th));
      out.push(part(F.r(bu, bv, 0.07, depth * 1.02, prof.R * dTheta * 1.10, thick, phi,
        `${name}-vsr`), material));
      if (!hood) continue;
      const rH = prof.R + depth + 0.055;
      out.push(part(F.r(cu + s * rH * Math.cos(th), spring + rH * Math.sin(th), 0.13,
        0.13, prof.R * dTheta * 1.12, 0.17, phi, `${name}-hood`), material));
    }
  }
  return out;
}

/**
 * A complete pointed-arch opening: the punched rectangle, the spandrel that makes it a point, a
 * voussoir ring, a stone sill, the glazing behind it and its tracery.
 *
 * Returns `{ hole, parts }`. The caller hands `hole` to `volume()` and adds `parts` itself,
 * because the wall shell and its dressing are emitted by different calls and have to agree on
 * the same rectangle exactly or the glass floats in a slot of the wrong size.
 */
function lancet(ctx, {
  axis, face, plane, u, sill, w, shaft, sharp = 1.28, name,
  glazed = true, tracery = false, leaf = null, hood = true,
}) {
  const { p } = ctx;
  const F = facePlane(axis, face, plane);
  const prof = archProfile(w, sharp);
  const spring = sill + shaft;
  const total = shaft + prof.rise;
  const cols = ctx.detail ? 8 : 5;
  const segs = ctx.detail ? 6 : 4;
  const parts = [];

  parts.push(...spandrelFill(ctx, F, {
    u, spring, w, prof, cols, material: p.wallAlt, name,
  }));
  parts.push(...voussoirRing(ctx, F, {
    u, spring, prof, depth: 0.16, thick: 0.26, segs, material: p.trim, hood: hood && ctx.mid, name,
  }));
  // Jamb dressings run from the sill to the springing, so the stone surround is continuous.
  for (const s of [-1, 1]) {
    parts.push(part(F.b(u + s * (prof.a + 0.11), sill + shaft / 2, 0.07, 0.22, shaft, 0.26,
      `${name}-jamb`), p.trim));
  }
  parts.push(part(F.b(u, sill - 0.10, 0.15, w + 0.52, 0.20, 0.32, `${name}-sill`), p.trim));
  parts.push(part(F.b(u, sill - 0.26, 0.09, w + 0.36, 0.13, 0.22, `${name}-sillcap`), p.wall));

  if (glazed) {
    // The pane follows the opening: a rectangle to the springing and a triangular head above it,
    // approximated by three stepped plates so no glass leaves the arch.
    parts.push(part(F.b(u, sill + shaft / 2, -0.19, w - 0.10, shaft, 0.05, `${name}-pane`), p.glass));
    const steps = ctx.mid ? 3 : 2;
    for (let i = 0; i < steps; i += 1) {
      const v0 = spring + (i / steps) * prof.rise;
      const v1 = spring + ((i + 1) / steps) * prof.rise;
      const du = arcHalfWidth(prof, v1 - spring);
      if (du < 0.05) continue;
      parts.push(part(F.b(u, (v0 + v1) / 2, -0.19, du * 2 - 0.06, v1 - v0, 0.05,
        `${name}-pane-head`), p.glass));
    }
    // Frame: two stiles, a transom on the springing line and a centre mullion.
    for (const s of [-1, 1]) {
      parts.push(part(F.b(u + s * (prof.a - 0.06), sill + shaft / 2, -0.13, 0.10, shaft, 0.09,
        `${name}-stile`), p.metal));
    }
    parts.push(part(F.b(u, spring, -0.13, w - 0.08, 0.09, 0.09, `${name}-transom`), p.metal));
    if (tracery && ctx.mid) {
      parts.push(part(F.b(u, sill + shaft / 2, -0.12, 0.09, shaft, 0.09, `${name}-mull`), p.metal));
      // Plate tracery in the head: a small ring on the axis, built from six radiating chords.
      const rr = Math.min(prof.rise * 0.34, prof.a * 0.52);
      for (let i = 0; i < 6; i += 1) {
        const th = (i / 6) * Math.PI;
        parts.push(part(F.r(u, spring + prof.rise * 0.42, -0.11, rr * 1.9, 0.07, 0.08, th,
          `${name}-tracery`), p.metal));
      }
    }
  }
  if (leaf) {
    parts.push(part(F.b(u, sill + shaft / 2, -0.10, w - 0.16, shaft - 0.04, 0.10,
      `${name}-leaf`), leaf));
    parts.push(part(F.b(u, sill + shaft * 0.30, -0.02, w - 0.44, shaft * 0.26, 0.05,
      `${name}-leaf-panel`), p.metal));
  }
  return { hole: hole(u, sill, w, total, 'lancet'), parts };
}

/** Half-width of a two-centred arch at height `dv` above its springing. */
function arcHalfWidth(prof, dv) {
  const inner = prof.R * prof.R - dv * dv;
  if (inner <= 0) return 0;
  return Math.max(0, Math.sqrt(inner) - prof.c);
}

/**
 * A stepped buttress with a weathered set-off — the member that makes a masonry wall read as
 * pre-industrial. Two stages, a sloped weathering between them and a sloped head into the wall.
 */
function buttress(ctx, {
  axis, face, plane, u, base, w, proj, h, name,
}) {
  const { p } = ctx;
  const out = [];
  const midH = h * 0.58;
  const upW = w * 0.80;
  const upP = proj * 0.62;
  const at = (du, y, hh, ww, pp, nm) => (axis === 'z'
    ? slab(ww, hh, pp, u + du, y, plane + face * (pp / 2 - 0.02), nm)
    : slab(pp, hh, ww, plane + face * (pp / 2 - 0.02), y, u + du, nm));
  out.push(part(at(0, base, midH, w, proj, `${name}-low`), p.wallAlt));
  // The set-off: a shallow sloped cap that sheds water back to the wall. A box with a rotated
  // cap on it reads as weathering at board zoom and costs twenty-four triangles.
  out.push(part(at(0, base + midH, 0.16, w + 0.10, proj + 0.08, `${name}-offcap`), p.trim));
  out.push(part(axis === 'z'
    ? rotBox(w + 0.10, 0.13, proj * 1.02, u, base + midH + 0.26, plane + face * (proj * 0.52),
      { x: -face * 0.38 }, `${name}-weather`)
    : rotBox(proj * 1.02, 0.13, w + 0.10, plane + face * (proj * 0.52), base + midH + 0.26,
      u, { z: face * 0.38 }, `${name}-weather`), p.trim));
  out.push(part(at(0, base + midH + 0.16, h - midH - 0.16, upW, upP, `${name}-up`), p.wallAlt));
  out.push(part(at(0, base + h - 0.14, 0.15, upW + 0.10, upP + 0.08, `${name}-cap`), p.trim));
  out.push(part(axis === 'z'
    ? rotBox(upW + 0.10, 0.12, upP * 1.5, u, base + h + 0.16, plane + face * (upP * 0.66),
      { x: -face * 0.62 }, `${name}-head`)
    : rotBox(upP * 1.5, 0.12, upW + 0.10, plane + face * (upP * 0.66), base + h + 0.16,
      u, { z: face * 0.62 }, `${name}-head`), p.trim));
  return out;
}

/** Alternating cream quoins up a brick corner. Twelve triangles a block, and it is ornament. */
function quoins(ctx, { x, z, h, base, blocks = 7, w = 0.52, name }) {
  const { p } = ctx;
  const out = [];
  const step = h / blocks;
  for (let i = 0; i < blocks; i += 1) {
    const long = i % 2 === 0;
    out.push(part(slab(long ? w * 1.5 : w * 0.72, step * 0.62, long ? w * 0.72 : w * 1.5,
      x, base + i * step + step * 0.19, z, `${name}-q`), p.wall));
  }
  return out;
}

/**
 * Slate coursing laid across a pitched roof.
 *
 * `seamGable`'s battens are a standing-seam metal roof's ribs and this subject is slated, so the
 * gable is built with `seams: false` and the lap lines are laid here instead: strips parallel to
 * the ridge, sitting on the roof's own plane, at the roof's own pitch. On a 50° pitch the courses
 * are the only thing that stops four square metres of one value reading as a card.
 */
function slateCourses(ctx, {
  x, z, span, run, springY, pitch, overhang, ridge = 'z', courses = 8, material, name,
}) {
  const { p } = ctx;
  const mat = material ?? p.metal;
  const out = [];
  const rad = (pitch * Math.PI) / 180;
  const acrossZ = ridge === 'x';
  const half = ((acrossZ ? run : span) / 2) + overhang;
  const rise = Math.tan(rad) * half;
  const len = (acrossZ ? span : run) + overhang * 2;
  const slopeLen = half / Math.cos(rad);
  const apexY = springY + rise;
  const n = ctx.detail ? courses : Math.max(3, Math.round(courses * 0.6));
  for (const side of [1, -1]) {
    for (let i = 1; i <= n; i += 1) {
      const s = (i / (n + 1)) * slopeLen;
      const along = s * Math.cos(rad);
      const up = s * Math.sin(rad);
      const nx = side * Math.sin(rad) * 0.085;
      const ny = Math.cos(rad) * 0.085;
      if (acrossZ) {
        out.push(part(rotBox(len, 0.075, 0.11, x, apexY - up + ny, z + side * along + nx,
          { x: side * rad }, `${name}-course`), mat));
      } else {
        out.push(part(rotBox(0.11, 0.075, len, x + side * along + nx, apexY - up + ny, z,
          { z: -side * rad }, `${name}-course`), mat));
      }
    }
  }
  return out;
}

/** A dark cypress — a stack of narrowing leaf clumps on a short bole. §6F asks for two. */
function cypress(ctx, { x, z, h = 5.2, r = 0.72, y = Y0, name = 'cyp' }) {
  const { p } = ctx;
  const out = [part(cyl(0.11, h * 0.20, x, y + h * 0.10, z, 'y', `${name}-bole`, 6), p.trim)];
  const n = ctx.detail ? 7 : 5;
  const radii = [];
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    radii.push(r * (1.0 - t * 0.70) * (0.88 + inst(ctx, `${name}${i}`, 3521) * 0.24));
  }
  // `leafClump` renormalises a perturbed octahedron, so its true extent is up to a third under
  // the authored radius. Stepping by 0.52 of the two radii guarantees an overlap at every seed.
  let cy = y + h * 0.20;
  for (let i = 0; i < n; i += 1) {
    if (i > 0) cy += (radii[i - 1] + radii[i]) * 0.52;
    out.push(part(leafClump(radii[i],
      x + (inst(ctx, `${name}${i}`, 3522) - 0.5) * r * 0.20,
      cy,
      z + (inst(ctx, `${name}${i}`, 3523) - 0.5) * r * 0.20,
      `${name}-c${i}`, 0, `${name}|${i}`), p.garden));
  }
  return out;
}

/** A cast-iron lamp standard — a fluted post, a moulded base and a glazed lantern. */
function lampStandard(ctx, { x, z, y = Y0, h = 3.4, name = 'lamp' }) {
  const { p } = ctx;
  return [
    part(slab(0.46, 0.16, 0.46, x, y, z, `${name}-plinth`), p.metal),
    part(slab(0.34, 0.30, 0.34, x, y + 0.16, z, `${name}-base`), p.metal),
    part(cyl(0.075, h - 0.46, x, y + 0.46 + (h - 0.46) / 2, z, 'y', `${name}-post`, 6), p.metal),
    part(slab(0.24, 0.10, 0.24, x, y + h, z, `${name}-collar`), p.metal),
    part(box(0.30, 0.42, 0.30, x, y + h + 0.31, z, `${name}-lantern`), p.glass),
    part(box(0.20, 0.34, 0.34, x, y + h + 0.31, z, `${name}-lantern-b`), p.glass),
    part(chamferSlab(0.40, 0.40, 0.26, 0, x, y + h + 0.52, z, `${name}-cap`, 0.17), p.metal),
    part(box(0.06, 0.16, 0.06, x, y + h + 0.86, z, `${name}-finial`), p.metal),
  ];
}

/** A three-dimensional cross finial, legible from any azimuth. */
function crossFinial(ctx, { x, y, z, h = 0.86, arm = 0.44, t = 0.11, name = 'finial' }) {
  const { p } = ctx;
  return [
    part(box(t, h, t, x, y + h / 2, z, `${name}-shaft`), p.trim),
    part(box(arm, t, t, x, y + h * 0.70, z, `${name}-arm-x`), p.trim),
    part(box(t, t, arm, x, y + h * 0.70, z, `${name}-arm-z`), p.trim),
    part(slab(t * 1.9, 0.09, t * 1.9, x, y - 0.05, z, `${name}-foot`), p.trim),
  ];
}

/* ═══════════════════════════════════ the lot and its ground ════════════════════════════════ */

function groundAndBoundary(ctx, G) {
  const { p } = ctx;
  const { X, Z } = G;
  const halfW = G.lotW / 2;
  const halfD = G.lotD / 2;
  const bx = halfW - 0.30;
  const bz = halfD - 0.32;

  // A mission compound is walled. Low bluestone with a moulded capping on every boundary, an
  // iron palisade on the street half only — the reference plates put their expensive fencing on
  // the frontage and a plain wall everywhere else.
  fenceWall(ctx, { x1: -bx, z1: bz, x2: X(-5.9), z2: bz, name: 'bd-front-w' });
  fenceWall(ctx, { x1: X(-3.0), z1: bz, x2: X(2.1), z2: bz, name: 'bd-front-c' });
  fenceWall(ctx, { x1: X(3.7), z1: bz, x2: bx, z2: bz, name: 'bd-front-e' });
  fenceWall(ctx, { x1: -bx, z1: -bz, x2: bx, z2: -bz, name: 'bd-rear' });
  fenceWall(ctx, { x1: -bx, z1: bz, x2: -bx, z2: -bz, name: 'bd-west' });
  fenceWall(ctx, { x1: bx, z1: bz, x2: bx, z2: -bz, name: 'bd-east' });

  ctx.add(fenceRun(ctx, {
    x1: -bx, z1: bz, x2: X(-5.9), z2: bz, style: 'palisade',
    y: Y0 + 0.83, h: 0.92, name: 'pal-front-w',
  }));
  ctx.add(fenceRun(ctx, {
    x1: X(-3.0), z1: bz, x2: X(2.1), z2: bz, style: 'palisade',
    y: Y0 + 0.83, h: 0.92, name: 'pal-front-c',
  }));
  ctx.add(fenceRun(ctx, {
    x1: X(3.7), z1: bz, x2: bx, z2: bz, style: 'palisade',
    y: Y0 + 0.83, h: 0.92, name: 'pal-front-e',
  }));

  // Gravel forecourt across the street frontage, lawn behind it on the open east side.
  ctx.add(lawn(ctx, {
    x: X(0.4), z: Z(11.9), w: X(13.6), d: Z(4.4), tufts: 18, salt: 3500, name: 'verge-lawn',
  }));
  ctx.add(lawn(ctx, {
    x: X(3.4), z: Z(4.6), w: X(7.2), d: Z(10.0), tufts: 16, salt: 3502, name: 'front-lawn',
  }));
  ctx.add(lawn(ctx, {
    x: X(-4.5), z: Z(-8.6), w: X(5.0), d: Z(11.4), tufts: 10, salt: 3506, name: 'west-lawn',
  }));
  void Z;
}

/** A bluestone boundary wall with piers and a capping. Wraps `fenceRun`'s `wall` style. */
function fenceWall(ctx, { x1, z1, x2, z2, name }) {
  ctx.add(fenceRun(ctx, {
    x1, z1, x2, z2, style: 'wall', h: 1.18, material: ctx.p.metal, name,
  }));
}

/* ═════════════════════════════════════════ the chapel ══════════════════════════════════════ */

const CHAPEL = {
  cx: -4.20, w: 5.2, cz: 4.20, d: 10.0, eave: 7.0, pitch: 50, over: 0.42,
};

function chapel(ctx, G) {
  const { p } = ctx;
  const { X, Z } = G;
  const cx = X(CHAPEL.cx);
  const w = X(CHAPEL.w);
  const cz = Z(CHAPEL.cz);
  const d = Z(CHAPEL.d);
  const zF = cz + d / 2;
  const zB = cz - d / 2;
  const eaveY = Y0 + CHAPEL.eave;
  const rad = (CHAPEL.pitch * Math.PI) / 180;
  const half = w / 2 + CHAPEL.over;
  const rise = Math.tan(rad) * half;

  // ── the openings, described once and used twice ──
  const flankZ = [cz + d * 0.28, cz, cz - d * 0.28];
  const front = [];
  const back = [];
  const left = [];
  const right = [];
  const dress = [];

  for (const [side, plane, bucket] of [[-1, cx - w / 2, left], [1, cx + w / 2, right]]) {
    for (let i = 0; i < flankZ.length; i += 1) {
      const L = lancet(ctx, {
        axis: 'x', face: side, plane, u: flankZ[i],
        sill: Y0 + 2.35, w: 1.06, shaft: 2.55, sharp: 1.30, tracery: i === 1,
        name: `ch-fl${side > 0 ? 'e' : 'w'}${i}`,
      });
      bucket.push(L.hole);
      dress.push(...L.parts);
    }
  }
  // Street gable: a lancet either side of the tower porch.
  for (const s of [-1, 1]) {
    const L = lancet(ctx, {
      axis: 'z', face: 1, plane: zF, u: cx + s * X(1.62),
      sill: Y0 + 3.20, w: 0.86, shaft: 2.00, sharp: 1.34, name: `ch-gw${s > 0 ? 'e' : 'w'}`,
    });
    front.push(L.hole);
    dress.push(...L.parts);
  }
  // Sanctuary end: a stepped triplet, the tallest single window on the lot.
  const trip = [[-1.30, 1.90], [0, 2.60], [1.30, 1.90]];
  for (let i = 0; i < trip.length; i += 1) {
    const L = lancet(ctx, {
      axis: 'z', face: -1, plane: zB, u: cx + X(trip[i][0]),
      sill: Y0 + 2.60, w: 0.84, shaft: trip[i][1], sharp: 1.34, tracery: i === 1,
      name: `ch-east${i}`,
    });
    back.push(L.hole);
    dress.push(...L.parts);
  }

  ctx.add(volume(ctx, {
    material: p.wallAlt, x: cx, zFront: zF, zBack: zB, width: w,
    y0: Y0, y1: eaveY, front, back, left, right, room: true, name: 'chapel',
  }));
  ctx.add(dress);

  // Bluestone plinth, two cream banding courses and a corbelled eaves table. The banding is the
  // polychrome §6F asks for and it is modelled section, not a painted stripe.
  ctx.add(plinthCourse(ctx, {
    x: cx, z: cz, w, d, yBase: Y0 - 0.02, h: 0.86, proud: 0.15,
    material: p.metal, name: 'chapel-plinth',
  }));
  for (const [y, th, pr, mat] of [
    [Y0 + 2.02, 0.30, 0.055, p.wall],
    [Y0 + 4.58, 0.24, 0.050, p.wall],
    [Y0 + 6.62, 0.26, 0.080, p.trim],
  ]) {
    ctx.add(stringCourse(ctx, {
      x: cx, z: cz, w, d, y, thick: th, proud: pr, material: mat, name: 'chapel-band',
    }));
  }
  if (ctx.detail) {
    for (const sx2 of [-1, 1]) {
      for (const sz2 of [-1, 1]) {
        ctx.add(quoins(ctx, {
          x: cx + sx2 * (w / 2 - 0.08), z: cz + sz2 * (d / 2 - 0.08),
          base: Y0 + 0.90, h: 5.6, blocks: 9, w: 0.46, name: `chapel-qn${sx2}${sz2}`,
        }));
      }
    }
  }

  // Buttresses. Deep on the west flank where the camera reads them against the sky, shallow on
  // the east flank because that face carries the notch and every centimetre of projection there
  // is spent out of the 3.88 u of clear sky between the chapel and the range.
  for (let i = 0; i < flankZ.length; i += 1) {
    ctx.add(buttress(ctx, {
      axis: 'x', face: -1, plane: cx - w / 2, u: flankZ[i] + Z(1.35),
      base: Y0, w: Z(0.68), proj: 0.60, h: 5.3, name: `ch-bw${i}`,
    }));
    ctx.add(buttress(ctx, {
      axis: 'x', face: 1, plane: cx + w / 2, u: flankZ[i] + Z(1.35),
      base: Y0, w: Z(0.62), proj: 0.34, h: 5.0, name: `ch-be${i}`,
    }));
  }
  for (const s of [-1, 1]) {
    ctx.add(buttress(ctx, {
      axis: 'z', face: -1, plane: zB, u: cx + s * (w / 2 - 0.34),
      base: Y0, w: X(0.72), proj: 0.62, h: 5.5, name: `ch-bb${s}`,
    }));
  }

  // Roof: 50°, slated, with the courses laid on the plane rather than metal battens.
  ctx.add(seamGable(ctx, {
    w, d, x: cx, z: cz, springY: eaveY, pitch: CHAPEL.pitch, overhang: CHAPEL.over,
    ridge: 'z', seams: false, material: p.metal, name: 'chapel-roof',
  }));
  ctx.add(slateCourses(ctx, {
    x: cx, z: cz, span: w, run: d, springY: eaveY, pitch: CHAPEL.pitch,
    overhang: CHAPEL.over, ridge: 'z', courses: 9, material: p.roof, name: 'chapel-slate',
  }));
  // Ridge cresting — the small repeated vertical that says ecclesiastical at thumbnail size.
  if (ctx.mid) {
    const n = Math.max(6, Math.round(d / 0.86));
    for (let i = 0; i < n; i += 1) {
      const cz2 = cz - d / 2 + (i + 0.5) * (d / n);
      ctx.add(part(box(0.09, 0.26, 0.13, cx, eaveY + rise + 0.24, cz2, 'chapel-crest'), p.metal));
    }
  }
  // Gable tympana, inside the roof plane by construction.
  ctx.add(part(triPlate(w, rise, WD, cx, eaveY, zF - WD / 2 - 0.01, 'chapel-tymp-s'), p.wallAlt));
  ctx.add(part(triPlate(w, rise, WD, cx, eaveY, zB + WD / 2 + 0.01, 'chapel-tymp-n'), p.wallAlt));
  ctx.add(crossFinial(ctx, {
    x: cx, y: eaveY + rise + 0.14, z: zB + 0.10, h: 0.74, arm: 0.38, t: 0.10, name: 'chapel-xn',
  }));

  // A wheel window in the street gable, modelled as a recess, a ring and six spokes.
  const wy = eaveY + rise * 0.44;
  const wr = Math.min(0.86, w * 0.18);
  const Fg = facePlane('z', 1, zF);
  ctx.add(part(Fg.b(cx, wy, 0.02, wr * 2.10, wr * 2.10, 0.16, 'ch-wheel-recess'), p.shadow));
  ctx.add(part(Fg.b(cx, wy, -0.02, wr * 1.86, wr * 1.86, 0.06, 'ch-wheel-glass'), p.glass));
  const rings = ctx.detail ? 8 : 6;
  for (let i = 0; i < rings; i += 1) {
    const th = (i / rings) * Math.PI * 2;
    ctx.add(part(Fg.r(cx + Math.cos(th) * wr, wy + Math.sin(th) * wr, 0.09,
      wr * 0.86, 0.16, 0.20, th + Math.PI / 2, 'ch-wheel-ring'), p.trim));
    if (i % 2 === 0) {
      ctx.add(part(Fg.r(cx, wy, 0.04, wr * 1.7, 0.10, 0.10, th, 'ch-wheel-spoke'), p.trim));
    }
  }

  ctx.add(downpipe(ctx, {
    x: cx - w / 2 - 0.12, z: zF - 0.55, y0: Y0, y1: eaveY - 0.10, name: 'chapel-dp-w',
  }));
  ctx.add(downpipe(ctx, {
    x: cx + w / 2 + 0.12, z: zB + 0.55, y0: Y0, y1: eaveY - 0.10, name: 'chapel-dp-e',
  }));
}

/* ═════════════════════════════ the bell turret and its spire ═══════════════════════════════ */

function bellTurret(ctx, G) {
  const { p } = ctx;
  const { X, Z } = G;
  const cx = X(CHAPEL.cx);
  const zF = Z(CHAPEL.cz) + Z(CHAPEL.d) / 2;
  const tw = X(2.00);
  const td = Z(1.90);
  const cz = zF + td / 2;
  const shaftTop = Y0 + 10.60;
  const belfryTop = Y0 + 12.30;
  const corniceTop = belfryTop + 0.30;
  const spireTop = corniceTop + 2.20;

  // Ground stage: a porch with a moulded pointed doorway, so the tower is entered rather than
  // decorative and the chapel's front door is under its own spire.
  const doorway = lancet(ctx, {
    axis: 'z', face: 1, plane: cz + td / 2, u: cx,
    sill: Y0, w: X(1.34), shaft: 2.05, sharp: 1.02, glazed: false, leaf: p.accent,
    name: 'turret-door',
  });
  const belfryHoles = [];
  const belfryDress = [];
  for (const [axis, face, plane, u] of [
    ['z', 1, cz + td / 2, cx], ['z', -1, cz - td / 2, cx],
    ['x', -1, cx - tw / 2, cz], ['x', 1, cx + tw / 2, cz],
  ]) {
    const L = lancet(ctx, {
      axis, face, plane, u,
      sill: Y0 + 10.95, w: (axis === 'z' ? tw : td) * 0.50, shaft: 0.62, sharp: 1.22,
      glazed: false, hood: false, name: `belfry-${axis}${face}`,
    });
    belfryHoles.push({ axis, face, hole: L.hole });
    belfryDress.push(...L.parts);
  }

  ctx.add(volume(ctx, {
    material: p.wallAlt, x: cx, zFront: cz + td / 2, zBack: cz - td / 2, width: tw,
    y0: Y0, y1: shaftTop,
    front: [doorway.hole],
    left: [], right: [], back: [], room: true, name: 'turret',
  }));
  ctx.add(doorway.parts);
  ctx.add(plinthCourse(ctx, {
    x: cx, z: cz, w: tw, d: td, yBase: Y0 - 0.02, h: 0.86, proud: 0.16,
    material: p.metal, name: 'turret-plinth',
  }));
  for (const y of [Y0 + 3.35, Y0 + 5.90, Y0 + 8.30]) {
    ctx.add(stringCourse(ctx, {
      x: cx, z: cz, w: tw, d: td, y, thick: 0.26, proud: 0.065,
      material: p.wall, name: 'turret-band',
    }));
  }
  // Corner pilasters carry the eye up the shaft and give the tower a section at every azimuth.
  for (const sx2 of [-1, 1]) {
    for (const sz2 of [-1, 1]) {
      ctx.add(part(slab(0.32, shaftTop - Y0 - 0.70, 0.32,
        cx + sx2 * (tw / 2 - 0.02), Y0 + 0.70, cz + sz2 * (td / 2 - 0.02),
        'turret-pilaster'), p.wall));
    }
  }
  // A tall lancet on each free face of the shaft, blind, so the tower is not a plain brick post.
  for (const [axis, face, plane, u, ww] of [
    ['x', -1, cx - tw / 2, cz, td * 0.42],
    ['x', 1, cx + tw / 2, cz, td * 0.42],
    ['z', 1, cz + td / 2, cx, tw * 0.42],
  ]) {
    const F = facePlane(axis, face, plane);
    const prof = archProfile(ww, 1.30);
    ctx.add(part(F.b(u, Y0 + 6.90 + 0.85, 0.02, ww, 1.70, 0.14, 'turret-blind'), p.shadow));
    ctx.add(voussoirRing(ctx, F, {
      u, spring: Y0 + 8.60, prof, depth: 0.12, thick: 0.20, segs: ctx.detail ? 5 : 3,
      material: p.trim, hood: false, name: 'turret-blind',
    }));
    ctx.add(spandrelFill(ctx, F, {
      u, spring: Y0 + 8.60, w: ww, prof, cols: 5, material: p.wallAlt, name: 'turret-blind',
    }));
  }

  // Belfry stage: open arches on all four faces with the bell hanging inside.
  ctx.add(volume(ctx, {
    material: p.wallAlt, x: cx, zFront: cz + td / 2, zBack: cz - td / 2, width: tw,
    y0: shaftTop, y1: belfryTop,
    front: belfryHoles.filter((b) => b.axis === 'z' && b.face === 1).map((b) => b.hole),
    back: belfryHoles.filter((b) => b.axis === 'z' && b.face === -1).map((b) => b.hole),
    left: belfryHoles.filter((b) => b.axis === 'x' && b.face === -1).map((b) => b.hole),
    right: belfryHoles.filter((b) => b.axis === 'x' && b.face === 1).map((b) => b.hole),
    room: false, name: 'belfry',
  }));
  ctx.add(belfryDress);
  ctx.add(part(box(tw - 0.44, belfryTop - shaftTop - 0.20, td - 0.44,
    cx, (shaftTop + belfryTop) / 2, cz, 'belfry-void'), p.shadow));
  // The bell: a tapered body on a headstock, visible through the arches.
  ctx.add([
    part(box(tw - 0.30, 0.14, 0.16, cx, shaftTop + 1.34, cz, 'bell-stock'), p.trim),
    part(chamferSlab(0.62, 0.62, 0.62, 0.19, cx, shaftTop + 0.56, cz, 'bell', 0), p.accent),
    part(slab(0.20, 0.22, 0.20, cx, shaftTop + 1.16, cz, 'bell-crown'), p.metal),
  ]);
  ctx.add(stringCourse(ctx, {
    x: cx, z: cz, w: tw, d: td, y: shaftTop - 0.10, thick: 0.26, proud: 0.13,
    material: p.trim, name: 'belfry-sill',
  }));

  // Corbelled cornice, then a steep pyramidal spire with hip ribs and the cross finial.
  ctx.add(part(slab(tw + 0.40, 0.20, td + 0.40, cx, belfryTop, cz, 'turret-cornice'), p.trim));
  ctx.add(part(slab(tw + 0.24, 0.14, td + 0.24, cx, belfryTop + 0.20, cz, 'turret-coping'), p.wall));
  if (ctx.mid) {
    const nb = 6;
    for (const s of [-1, 1]) {
      for (let i = 0; i < nb; i += 1) {
        const u = -tw / 2 + (i + 0.5) * (tw / nb);
        ctx.add(part(slab(0.16, 0.20, 0.16, cx + u, belfryTop - 0.24, cz + s * (td / 2 + 0.08),
          'turret-corbel'), p.trim));
      }
      for (let i = 0; i < nb; i += 1) {
        const u = -td / 2 + (i + 0.5) * (td / nb);
        ctx.add(part(slab(0.16, 0.20, 0.16, cx + s * (tw / 2 + 0.08), belfryTop - 0.24, cz + u,
          'turret-corbel'), p.trim));
      }
    }
  }
  const spireW = tw + 0.10;
  const spireD = td + 0.10;
  ctx.add(part(chamferSlab(spireW, spireD, spireTop - corniceTop, 0,
    cx, corniceTop, cz, 'turret-spire', Math.min(spireW, spireD) / 2 - 0.055), p.metal));
  if (ctx.mid) {
    const hipH = spireTop - corniceTop;
    for (const sx2 of [-1, 1]) {
      for (const sz2 of [-1, 1]) {
        ctx.add(part(rotBox(0.10, Math.hypot(hipH, spireW / 2) * 1.02, 0.10,
          cx + sx2 * spireW / 4, corniceTop + hipH / 2, cz + sz2 * spireD / 4,
          { z: sx2 * Math.atan2(spireW / 2, hipH), x: -sz2 * Math.atan2(spireD / 2, hipH) },
          'turret-hip'), p.trim));
      }
    }
  }
  ctx.add(crossFinial(ctx, {
    x: cx, y: spireTop - 0.05, z: cz, h: 0.90, arm: 0.46, t: 0.115, name: 'spire-cross',
  }));
  ctx.add(wallLamp(ctx, {
    x: cx - tw / 2 - 0.05, y: Y0 + 2.60, z: cz, facing: -1, axis: 'x', name: 'turret-lamp-w',
  }));
  ctx.add(wallLamp(ctx, {
    x: cx + tw / 2 + 0.05, y: Y0 + 2.60, z: cz, facing: 1, axis: 'x', name: 'turret-lamp-e',
  }));
  ctx.add(noticeCase(ctx, {
    x: cx + tw / 2 + X(1.70), y: Y0 + 1.75, z: zF - 0.16, w: 1.10, h: 0.90,
    facing: 'front', id: 'mission-notice',
  }));
}

/* ═══════════════════════════════════ the schoolroom range ══════════════════════════════════ */

const RANGE = {
  cx: 2.95, w: 7.7, cz: -11.40, d: 6.8, eave: 6.6, pitch: 34, over: 0.42,
};

function schoolRange(ctx, G) {
  const { p } = ctx;
  const { X, Z } = G;
  const cx = X(RANGE.cx);
  const w = X(RANGE.w);
  const cz = Z(RANGE.cz);
  const d = Z(RANGE.d);
  const zF = cz + d / 2;
  const zB = cz - d / 2;
  const eaveY = Y0 + RANGE.eave;
  const rad = (RANGE.pitch * Math.PI) / 180;
  const half = d / 2 + RANGE.over;
  const rise = Math.tan(rad) * half;

  const front = [];
  const back = [];
  const left = [];
  const right = [];
  const dress = [];
  const winW = 1.24;
  const winH = 1.72;
  const bays = [-2.55, -0.85, 0.85, 2.55];

  // Ground floor: segmental-headed schoolroom windows. First floor: the same rhythm, square
  // headed, so the elevation has the repeated bay a school elevation IS.
  for (const b of bays) {
    front.push(hole(cx + X(b), Y0 + 4.05, winW, winH, 'win'));
    dress.push(...civicWindow(ctx, {
      x: cx + X(b), y: Y0 + 4.05 + winH / 2, z: zF, w: winW, h: winH,
      facing: 'front', lights: 2, transom: true, id: `sr-up${b}`,
    }).parts);
  }
  for (const b of [-2.55, -0.85, 2.55]) {
    const L = lancet(ctx, {
      axis: 'z', face: 1, plane: zF, u: cx + X(b),
      sill: Y0 + 1.10, w: winW, shaft: 1.72, sharp: 0.86, name: `sr-lo${b}`,
    });
    front.push(L.hole);
    dress.push(...L.parts);
  }
  // The stone-dressed doorway, clear of the cloister return so it is seen.
  const door = lancet(ctx, {
    axis: 'z', face: 1, plane: zF, u: cx + X(0.85),
    sill: Y0, w: X(1.42), shaft: 2.10, sharp: 1.00, glazed: false, leaf: p.accent,
    name: 'sr-door',
  });
  front.push(door.hole);
  dress.push(...door.parts);

  for (const b of [-2.20, 0, 2.20]) {
    back.push(hole(cx + X(b), Y0 + 1.30, winW, winH, 'win'));
    back.push(hole(cx + X(b), Y0 + 4.05, winW, winH, 'win'));
    dress.push(...civicWindow(ctx, {
      x: cx + X(b), y: Y0 + 1.30 + winH / 2, z: zB, w: winW, h: winH,
      facing: 'back', lights: 2, id: `sr-rl${b}`,
    }).parts);
    dress.push(...civicWindow(ctx, {
      x: cx + X(b), y: Y0 + 4.05 + winH / 2, z: zB, w: winW, h: winH,
      facing: 'back', lights: 2, id: `sr-ru${b}`,
    }).parts);
  }
  for (const [side, plane, bucket, facing] of [
    [-1, cx - w / 2, left, 'left'], [1, cx + w / 2, right, 'right'],
  ]) {
    for (const u of [cz + Z(1.70), cz - Z(1.70)]) {
      bucket.push(hole(u, Y0 + 4.05, winW, winH, 'win'));
      dress.push(...civicWindow(ctx, {
        x: plane, y: Y0 + 4.05 + winH / 2, z: u, w: winW, h: winH,
        facing, lights: 2, id: `sr-fl${side}${u.toFixed(1)}`,
      }).parts);
    }
  }

  ctx.add(volume(ctx, {
    material: p.wallAlt, x: cx, zFront: zF, zBack: zB, width: w, y0: Y0, y1: eaveY,
    front, back, left, right, room: true, name: 'range',
  }));
  ctx.add(dress);

  ctx.add(plinthCourse(ctx, {
    x: cx, z: cz, w, d, yBase: Y0 - 0.02, h: 0.78, proud: 0.14,
    material: p.metal, name: 'range-plinth',
  }));
  for (const [y, th, pr, mat] of [
    [Y0 + 1.86, 0.28, 0.055, p.wall],
    [Y0 + 3.52, 0.34, 0.070, p.wall],
    [Y0 + 6.24, 0.26, 0.090, p.trim],
  ]) {
    ctx.add(stringCourse(ctx, {
      x: cx, z: cz, w, d, y, thick: th, proud: pr, material: mat, name: 'range-band',
    }));
  }
  if (ctx.detail) {
    for (const sx2 of [-1, 1]) {
      for (const sz2 of [-1, 1]) {
        ctx.add(quoins(ctx, {
          x: cx + sx2 * (w / 2 - 0.08), z: cz + sz2 * (d / 2 - 0.08),
          base: Y0 + 0.82, h: 5.3, blocks: 8, w: 0.46, name: `range-qn${sx2}${sz2}`,
        }));
      }
    }
  }

  ctx.add(seamGable(ctx, {
    w, d, x: cx, z: cz, springY: eaveY, pitch: RANGE.pitch, overhang: RANGE.over,
    ridge: 'x', seams: false, material: p.metal, name: 'range-roof',
  }));
  ctx.add(slateCourses(ctx, {
    x: cx, z: cz, span: w, run: d, springY: eaveY, pitch: RANGE.pitch,
    overhang: RANGE.over, ridge: 'x', courses: 7, material: p.roof, name: 'range-slate',
  }));
  for (const s of [-1, 1]) {
    ctx.add(part(triPlateZ(d, rise, WD, cx + s * (w / 2 - WD / 2 - 0.01), eaveY, cz,
      'range-tymp'), p.wallAlt));
  }

  // Gabled dormers on the courtyard slope. Three of them break a 7.7 m run of one pitch and
  // give the range its own small rhythm above the eaves without competing with the spire.
  const dz = zF + RANGE.over;
  for (const b of [-2.40, 0, 2.40]) {
    const dx = cx + X(b);
    const dw = X(1.12);
    const dh = 1.30;
    const base = eaveY - 0.10;
    ctx.add(part(box(dw, dh, Z(1.55), dx, base + dh / 2, dz - Z(0.72), 'dormer-body'), p.trim));
    ctx.add(part(gableSolidZ(dw + 0.28, Z(1.70), 0.62, dx, base + dh, dz - Z(0.74),
      'dormer-roof'), p.metal));
    ctx.add(part(box(dw + 0.34, 0.13, 0.15, dx, base + dh - 0.03, dz + 0.05,
      'dormer-fascia'), p.trim));
    ctx.add(part(box(dw - 0.30, dh - 0.44, 0.07, dx, base + dh * 0.50, dz - 0.06,
      'dormer-pane'), p.glass));
    ctx.add(part(box(dw - 0.30, 0.08, 0.09, dx, base + dh * 0.50, dz - 0.02,
      'dormer-mull'), p.metal));
    ctx.add(part(box(dw + 0.24, 0.14, 0.24, dx, base + 0.06, dz - 0.02, 'dormer-sill'), p.trim));
  }
  ctx.add(downpipe(ctx, {
    x: cx - w / 2 + 0.24, z: zF + 0.10, y0: Y0, y1: eaveY - 0.08, name: 'range-dp-w',
  }));
  ctx.add(downpipe(ctx, {
    x: cx + w / 2 - 0.24, z: zF + 0.10, y0: Y0, y1: eaveY - 0.08, name: 'range-dp-e',
  }));
  void rad;
}

/* ═══════════════════════════════════════ the cloister ══════════════════════════════════════ */

/**
 * The arcaded walk that joins the chapel to the schoolroom round the court.
 *
 * It is the object that keeps the plate's notch honest: 3.55 m tall in a band where the two
 * roofed masses are 10.9 m and 9.6 m, so the skyline still falls away between them while the
 * courtyard reads as an enclosed place rather than as a hole in the lot.
 */
function cloister(ctx, G) {
  const { p } = ctx;
  const { X, Z } = G;
  const wallX = X(CHAPEL.cx) + X(CHAPEL.w) / 2;
  const pierX = X(0.45);
  const z0 = Z(RANGE.cz) + Z(RANGE.d) / 2;
  const z1 = Z(CHAPEL.cz) - Z(CHAPEL.d) / 2;
  const eave = Y0 + 3.10;
  const high = Y0 + 3.86;

  // Run A — chapel to range, arcade facing the court.
  arcadeRun(ctx, {
    axis: 'z', backAt: wallX, pierAt: pierX, from: z0, to: z1,
    eave, high, bays: 4, name: 'cloA',
  });
  // Run B — the return along the range's front, stopping clear of its doorway.
  arcadeRun(ctx, {
    axis: 'x', backAt: Z(RANGE.cz) + Z(RANGE.d) / 2, pierAt: Z(-6.20),
    from: X(2.60), to: X(6.55), eave, high, bays: 3, name: 'cloB',
  });
  void p;
}

/**
 * One lean-to arcade: a low back wall, a run of piers carrying pointed arches, a slated skillion
 * and a paved walk under it.
 *
 * `axis: 'z'` runs the walk front-to-back with the piers at `pierAt` in x; `axis: 'x'` runs it
 * across with the piers at `pierAt` in z.
 */
function arcadeRun(ctx, {
  axis, backAt, pierAt, from, to, eave, high, bays, name,
}) {
  const { p } = ctx;
  const alongZ = axis === 'z';
  const a = Math.min(from, to);
  const b = Math.max(from, to);
  const len = b - a;
  const mid = (a + b) / 2;
  const walk = Math.abs(pierAt - backAt);
  const cross = (backAt + pierAt) / 2;
  const dir = Math.sign(pierAt - backAt) || 1;

  const put = (g, m) => ctx.add(part(g, m));
  // Paving under the walk.
  ctx.add(paverRun(ctx, alongZ
    ? {
      x0: backAt, x1: pierAt, z0: a, z1: b, unit: 1.05, flat: true,
      material: p.trim, name: `${name}-floor`,
    }
    : {
      x0: a, x1: b, z0: backAt, z1: pierAt, unit: 1.05, flat: true,
      material: p.trim, name: `${name}-floor`,
    }));
  // Back wall, so the walk has a room-side face rather than open sky behind the arches.
  put(alongZ
    ? slab(0.28, high - Y0, len, backAt + dir * 0.14, Y0, mid, `${name}-back`)
    : slab(len, high - Y0, 0.28, mid, Y0, backAt + dir * 0.14, `${name}-back`), p.trim);

  const step = len / bays;
  const pierW = 0.44;
  const span = step - pierW;
  const prof = archProfile(span, 1.06);
  const impost = Y0 + 1.72;
  const F = facePlane(alongZ ? 'x' : 'z', dir, pierAt);

  for (let i = 0; i <= bays; i += 1) {
    const u = a + i * step;
    put(alongZ
      ? slab(pierW, impost - Y0 + 0.10, pierW, pierAt, Y0, u, `${name}-pier`)
      : slab(pierW, impost - Y0 + 0.10, pierW, u, Y0, pierAt, `${name}-pier`), p.wallAlt);
    put(alongZ
      ? slab(pierW + 0.20, 0.16, pierW + 0.20, pierAt, impost - 0.06, u, `${name}-cap`)
      : slab(pierW + 0.20, 0.16, pierW + 0.20, u, impost - 0.06, pierAt, `${name}-cap`), p.trim);
    put(alongZ
      ? slab(pierW + 0.16, 0.14, pierW + 0.16, pierAt, Y0, u, `${name}-base`)
      : slab(pierW + 0.16, 0.14, pierW + 0.16, u, Y0, pierAt, `${name}-base`), p.metal);
  }
  for (let i = 0; i < bays; i += 1) {
    const u = a + (i + 0.5) * step;
    ctx.add(voussoirRing(ctx, F, {
      u, spring: impost + 0.10, prof, depth: 0.15, thick: 0.42,
      segs: ctx.detail ? 5 : 3, material: p.trim, hood: false, name: `${name}-arch`,
    }));
    ctx.add(spandrelFill(ctx, F, {
      u, spring: impost + 0.10, w: span, prof, cols: ctx.detail ? 6 : 4,
      material: p.wallAlt, name: `${name}-arch`,
    }));
    // The wall above the arch heads, tying the arcade into its own eaves line.
    put(alongZ
      ? box(0.40, eave - (impost + 0.10 + prof.rise), step + 0.02, pierAt,
        (impost + 0.10 + prof.rise + eave) / 2, u, `${name}-spandrel-top`)
      : box(step + 0.02, eave - (impost + 0.10 + prof.rise), 0.40, u,
        (impost + 0.10 + prof.rise + eave) / 2, pierAt, `${name}-spandrel-top`), p.wallAlt);
  }
  // Skillion roof falling to the arcade, and a capping on the back wall.
  const roofT = 0.16;
  const lift = (high - eave);
  put(alongZ
    ? rotBox(walk + 0.62, roofT, len + 0.50, cross, (eave + high) / 2 + 0.10, mid,
      { z: -dir * Math.atan2(lift, walk) }, `${name}-pitch`)
    : rotBox(len + 0.50, roofT, walk + 0.62, mid, (eave + high) / 2 + 0.10, cross,
      { x: dir * Math.atan2(lift, walk) }, `${name}-pitch`), p.metal);
  put(alongZ
    ? box(0.22, 0.20, len + 0.52, pierAt + dir * 0.30, eave - 0.02, mid, `${name}-fascia`)
    : box(len + 0.52, 0.20, 0.22, mid, eave - 0.02, pierAt + dir * 0.30, `${name}-fascia`), p.trim);
  put(alongZ
    ? slab(0.44, 0.13, len + 0.52, backAt + dir * 0.16, high + 0.06, mid, `${name}-coping`)
    : slab(len + 0.52, 0.13, 0.44, mid, high + 0.06, backAt + dir * 0.16, `${name}-coping`), p.trim);
}

/* ══════════════════════════════════════ the courtyard ══════════════════════════════════════ */

function courtyard(ctx, G) {
  const { p } = ctx;
  const { X, Z } = G;
  ctx.add(sealedSlab(ctx, {
    x: X(3.6), z: Z(-3.5), w: X(6.2), d: Z(4.4), material: p.trim,
    kerb: false, joints: true, name: 'court',
  }));
  // The memorial: a stepped bluestone base, a cream shaft and a cross. §6F's memorial stone, and
  // the one object in the court that carries a vertical.
  const mx = X(3.4);
  const mz = Z(-3.6);
  ctx.add([
    part(slab(1.56, 0.22, 1.56, mx, Y0, mz, 'mem-step0'), p.metal),
    part(slab(1.18, 0.22, 1.18, mx, Y0 + 0.22, mz, 'mem-step1'), p.metal),
    part(slab(0.88, 0.26, 0.88, mx, Y0 + 0.44, mz, 'mem-die'), p.wall),
    part(chamferSlab(0.72, 0.72, 1.42, 0, mx, Y0 + 0.70, mz, 'mem-shaft', 0.09), p.wall),
    part(slab(0.52, 0.14, 0.52, mx, Y0 + 2.12, mz, 'mem-cap'), p.trim),
  ]);
  ctx.add(crossFinial(ctx, {
    x: mx, y: Y0 + 2.26, z: mz, h: 0.78, arm: 0.40, t: 0.10, name: 'mem-cross',
  }));
  ctx.add(bench(ctx, { x: X(6.10), z: Z(-3.2), w: 1.7, axis: 'z', name: 'court-bench' }));
  ctx.add(plantedBed(ctx, {
    x: X(6.20), z: Z(-5.4), w: X(1.5), d: Z(2.0), shrubs: 2, salt: 3530, name: 'court-bed',
  }));
  ctx.add(plantedBed(ctx, {
    x: X(1.30), z: Z(-2.2), w: X(1.5), d: Z(1.6), shrubs: 2, salt: 3536, name: 'court-bed2',
  }));
  ctx.add(cypress(ctx, { x: X(6.35), z: Z(-1.15), h: 4.4, r: 0.62, name: 'court-cyp' }));
  if (ctx.detail) {
    for (let i = 0; i < 5; i += 1) {
      ctx.add(tussock(ctx, {
        x: X(1.05) + ctx.v.range(3540 + i * 2, -0.3, 0.3),
        z: Z(-6.6) + ctx.v.range(3541 + i * 2, -0.9, 0.9),
        r: 0.28, h: 0.42, salt: 3550 + i * 3, name: 'court-t',
      }));
    }
  }
  ctx.add(bin(ctx, { x: X(0.95), z: Z(-6.9), name: 'court-bin' }));
}

/* ══════════════════════════════════════ the frontage ═══════════════════════════════════════ */

function frontage(ctx, G) {
  const { p } = ctx;
  const { X, Z } = G;
  const bz = G.lotD / 2 - 0.32;
  const cx = X(CHAPEL.cx);

  // The lychgate: two brick piers, a gabled roof over the opening and a pair of gates under it.
  const gz = bz - Z(0.88);
  for (const s of [-1, 1]) {
    const px = cx + s * X(1.45);
    ctx.add(part(slab(0.62, 2.42, 0.68, px, Y0, gz, 'lych-pier'), p.wallAlt));
    ctx.add(part(slab(0.78, 0.16, 0.84, px, Y0 + 2.42, gz, 'lych-piercap'), p.trim));
    ctx.add(part(slab(0.74, 0.20, 0.80, px, Y0 - 0.04, gz, 'lych-pierbase'), p.metal));
  }
  ctx.add(part(box(X(3.60), 0.26, 0.92, cx, Y0 + 2.70, gz, 'lych-beam'), p.trim));
  ctx.add(part(gableSolidZ(X(3.90), Z(2.00), 1.05, cx, Y0 + 2.83, gz, 'lych-roof'), p.metal));
  ctx.add(part(box(X(4.00), 0.14, 0.17, cx, Y0 + 2.90, gz + Z(1.02), 'lych-fascia'), p.trim));
  ctx.add(part(box(X(4.00), 0.14, 0.17, cx, Y0 + 2.90, gz - Z(1.02), 'lych-fascia'), p.trim));
  ctx.add(crossFinial(ctx, {
    x: cx, y: Y0 + 3.88, z: gz, h: 0.52, arm: 0.28, t: 0.08, name: 'lych-cross',
  }));
  ctx.add(gate(ctx, { x: cx, z: gz - Z(0.62), width: X(2.10), h: 1.28, name: 'lych-gate' }));
  ctx.add(gate(ctx, { x: X(2.90), z: bz, width: X(1.40), h: 1.28, name: 'east-gate' }));

  // Gravel walks: lychgate to the tower porch, and the east gate to the cloister.
  const porchZ = Z(CHAPEL.cz) + Z(CHAPEL.d) / 2 + Z(1.90);
  ctx.add(paverRun(ctx, {
    x0: cx - X(1.10), x1: cx + X(1.10), z0: porchZ + 0.10, z1: gz - Z(0.70),
    unit: 1.05, flat: true, material: p.trim, name: 'nave-walk',
  }));
  ctx.add(paverRun(ctx, {
    x0: X(2.20), x1: X(3.60), z0: Z(-0.60), z1: bz - Z(1.10),
    unit: 1.05, flat: true, material: p.trim, name: 'east-walk',
  }));
  ctx.add(paverRun(ctx, {
    x0: cx + X(1.10), x1: X(2.20), z0: Z(9.40), z1: Z(11.10),
    unit: 1.00, flat: true, material: p.trim, name: 'cross-walk',
  }));

  // Two dark cypress flanking the gate, as §6F asks, and two more on the east walk.
  ctx.add(cypress(ctx, { x: cx - X(2.35), z: gz - Z(1.30), h: 5.6, r: 0.78, name: 'cyp-w' }));
  ctx.add(cypress(ctx, { x: cx + X(2.35), z: gz - Z(1.30), h: 5.2, r: 0.72, name: 'cyp-e' }));
  ctx.add(cypress(ctx, { x: X(6.30), z: Z(9.60), h: 4.8, r: 0.68, name: 'cyp-ne' }));
  ctx.add(cypress(ctx, { x: X(6.30), z: Z(4.30), h: 5.1, r: 0.72, name: 'cyp-se' }));
  ctx.add(canopyTree(ctx, {
    x: X(-5.05), z: Z(-4.40), h: 5.4, canopy: 1.24, salt: 3560, name: 'yard-tree',
  }));

  ctx.add(hedgeRun(ctx, {
    x: X(3.60), z: Z(8.10), w: X(6.6), d: 0.66, h: 0.74, salt: 3566, name: 'front-hedge',
  }));
  ctx.add(plantedBed(ctx, {
    x: cx - X(2.40), z: Z(9.90), w: X(1.7), d: Z(2.0), shrubs: 2, salt: 3570, name: 'porch-bed-w',
  }));
  ctx.add(plantedBed(ctx, {
    x: cx + X(2.40), z: Z(9.90), w: X(1.7), d: Z(2.0), shrubs: 2, salt: 3576, name: 'porch-bed-e',
  }));
  ctx.add(lampStandard(ctx, { x: cx - X(1.95), z: gz - Z(2.10), h: 3.3, name: 'lamp-w' }));
  ctx.add(lampStandard(ctx, { x: cx + X(1.95), z: gz - Z(2.10), h: 3.3, name: 'lamp-e' }));
  ctx.add(bench(ctx, { x: X(5.80), z: Z(6.60), w: 1.7, axis: 'z', name: 'front-bench' }));
  ctx.add(bikeRack(ctx, { x: X(5.60), z: Z(11.50), hoops: 3, name: 'front-bikes' }));
  for (let i = 0; i < 4; i += 1) {
    ctx.add(shrubMass(ctx, {
      x: X(-6.6) + ctx.v.range(3580 + i * 2, -0.4, 0.4),
      z: Z(6.0 - i * 3.4), r: 0.56, h: 0.82, seed: `mission-shrub-${i}`,
    }));
  }
  void p;
}
