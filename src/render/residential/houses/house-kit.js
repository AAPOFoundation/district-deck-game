// District Deck V3.40 — seat KIT. Envelope and mass for the four detached houses.
//
// Governing spec: docs/next-phase/V340-RESIDENTIAL-HOUSES-FROM-SCRATCH-SPEC.md
// Module contract:  ./CONTRACT.md  (§6 fixes every signature below; this file implements them)
//
// What this file owns: the roof solver (hip, gable, intersecting, conical, bullnose), wall
// shells with openings PUNCHED THROUGH, the verandah and porch structural systems, the floor
// plate and plinth, chimney shafts, the eaves, and the vertical datum every other seat reads.
//
// ── The vertical datum, stated once (CONTRACT.md §3) ───────────────────────────────────────
//   lot plate top      y = 0
//   lawn / path        y = 0
//   finished floor     y = env.floorY
//   wall shells        env.floorY → env.floorY + env.wallH
//   roofs SPRING FROM  env.floorY + env.wallH
// Nothing in this file invents a second datum, and `floorPlate` publishes the step-down anchor
// so GARDEN lands its steps on the same number rather than on a guess.
//
// ── The corrugation and the tile course are MODELLED, in geometry ──────────────────────────
// `../texture-atlas.js` was tuned on the assumption that this lane models both rhythms:
// NORMAL_STRENGTH.corrugated is 0.85 and .tile is 1.6, against a 2.5 default, and the albedo
// generator's corrugated branch contributes only a sheet-scale breakup. If the rib is not in
// the geometry the roof renders as a flat grey sheet — the exact baseline defect.
//
// ── TWO UV CONVENTIONS, and which surfaces get which ───────────────────────────────────────
//
// ROOF SKINS ARE NORMALISED 0..1 PER PLANE. The atlas repeats its family tile against the UVs
// the geometry carries:
//   corrugated [4.0, 1.8] — ten authored ribs per tile × 4 = FORTY units of shallow undulation
//                           across one roof plane, expected to sit under about TWENTY modelled
//                           ribs. Two ribs of relief per modelled rib: a breakup under a rib,
//                           not a second corrugation. Any other count beats against it.
//   tile       [3.0, 1.3] — seven courses per tile × 1.3 = about NINE courses across a plane.
// The rib and course counts here are therefore PER PLANE, and both ratios are exactly integer
// (2.00 and 1.01). Making roof UVs metric would move those ratios and bring the beat back, so
// the roof skins stay normalised. See KIT_METRICS.
//
// WALL SURFACES ARE METRIC. A family whose cadence is authored per tile rather than in world
// units lays the same number of courses across whatever v-range the caller spans — so
// `weatherboard [3.0, 1.35]`, with BOARDS = 18 in the atlas generator, lays 18 × 1.35 = 24.3
// courses over a normalised elevation. That is 111 mm on a 2.7 m wall and 49 mm on a 1.2 m
// gable panel, and the second one is not a weatherboard, it is a ruled hatch. Every wall
// surface this file generates therefore carries uv = metres / UV_METRES, so a course is the
// same physical size on every panel regardless of its size. `worldSpaceBrick` already does
// this for brick and clinker; this is the same fix for every other wall family.
//
// UV_METRES is set to 2.70 — the wall height the current cadence was tuned against — so the
// 2.7 m case is unchanged and only the short panels move. See KIT_METRICS.uvMetresPerUnit.
//
// ── Chunky beats fussy (preamble finding 2) ────────────────────────────────────────────────
// Every member below is deliberately oversized against its real-world counterpart. The numbers
// are in KIT_METRICS so seat DETAIL can size its ornament to sit against them and so a critic
// can check one against a plate without reading the code.

import * as THREE from 'three';
import { box, slab, hash32 } from '../core.js';

/* ═══════════════════════════════════ published numbers ═══════════════════════════════════ */

/**
 * Every dimension another seat might need to agree with, in one readable place.
 * Lengths are board units (metres). Angles are degrees where named `Deg`.
 */
export const KIT_METRICS = Object.freeze({
  // ── UV convention ──────────────────────────────────────────────────────────────────────
  // Metres of real surface per 1.0 uv unit, on WALL surfaces only (wall shells, drum facets,
  // base courses, gable panels, wall breasts). Roof skins stay normalised 0..1 per plane —
  // see the file header for why. Read this rather than assuming: with metric wall UVs an
  // atlas `repeat` is now "family tiles per 2.70 m of wall", a physical control, so a family
  // can be retuned to any real module without touching geometry.
  uvMetresPerUnit: 2.70,
  uvMetresRoof: null,              // roof skins are normalised, not metric — no constant
  // What that produces with the atlas as authored, for the record:
  //   weatherboard [3.0, 1.35], BOARDS = 18 → 24.3 courses per uv unit → 111 mm per course,
  //   identically on a 2.7 m wall and on a 1.2 m gable panel.
  weatherboardCoursePitch: 0.1111,

  // Roof rhythm — counts are PER PLANE because the atlas repeat is per normalised primitive.
  corrugationRibs: Object.freeze({ high: 20, mid: 10, low: 5 }),
  corrugationRibDepth: 0.060,      // crest above trough, modelled along the plane normal
  tileCourses: Object.freeze({ high: 9, mid: 6, low: 4 }),
  tileCourseStep: 0.075,           // the tile nose standing proud of the pan
  tileCourseRun: 0.86,             // fraction of a course gauge that is pan, rest is the riser

  // Members. All oversized on purpose.
  fasciaDepth: 0.34,               // fascia board face height
  fasciaThickness: 0.13,
  bargeDepth: 0.40,                // barge/rake board — heavier than the fascia, as in mp-*
  bargeThickness: 0.15,
  soffitThickness: 0.09,
  ridgeCapWidth: 0.30,
  ridgeCapRise: 0.15,
  hipCapWidth: 0.26,
  hipCapRise: 0.13,
  reveal: 0.22,                    // opening reveal depth — the shadow §2.9 grades
  wallPlate: 0.16,                 // wall top cap
  plinthProud: 0.11,
  baseCourseProud: 0.055,
  stringCourseDepth: 0.17,
  beamDepth: 0.38,                 // verandah / porch beam face
  beamThickness: 0.22,
  postSize: 0.20,                  // plain structural post; DETAIL's turnedPost replaces it
  deckThickness: 0.14,
  breastProud: 0.28,               // blank-wall articulation
  chimneyCorbel: 0.075,

  // Segment counts.
  bullnoseSegments: 9,             // curve rows on the bullnose, plus one straight row behind
  bullnoseSweepDeg: 100,           // the front edge tucks 10° past vertical
  coneSides: 8,                    // an octagonal drum takes an octagonal cone, not a square cap
  coneCourses: 8,

  // Per-archetype defaults the builders may override.
  overhang: Object.freeze({
    'bungalow-californian': 0.95,  // the overhang IS the archetype
    'bungalow-brighton': 0.52,
    'heritage-federation-villa': 0.58,
    'cottage-federation': 0.46,
  }),
  pitchDeg: Object.freeze({
    'bungalow-californian': 26,    // broad and low
    'bungalow-brighton': 38,       // steep front gable
    'heritage-federation-villa': 34,
    'cottage-federation': 30,
  }),
  covering: Object.freeze({
    'bungalow-californian': 'tile',
    'bungalow-brighton': 'tile',
    'heritage-federation-villa': 'tile',
    'cottage-federation': 'corrugated',
  }),
});

/** Salt range owned by this module — CONTRACT.md §5. */
const SALT_BASE = 1000;
const SALT_TOP = 1199;
const salted = (n) => SALT_BASE + (Math.abs(n | 0) % (SALT_TOP - SALT_BASE + 1));

const DEG = Math.PI / 180;
const EPS = 1e-7;

/**
 * Metres of wall per uv unit. Wall surfaces map uv = metres / UV_METRES so a family whose
 * cadence is authored per tile lands at one physical size on every panel. Set to the 2.70 m
 * wall height the atlas cadence was tuned against, so that case is unchanged.
 */
const UV_METRES = KIT_METRICS.uvMetresPerUnit;
/** uv for a wall surface, from a distance in metres. */
const uvM = (metres) => metres / UV_METRES;

/* ══════════════════════════════════ small vector helpers ═════════════════════════════════ */

const v3 = (x, y, z) => [x, y, z];
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vmul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const vlen = (a) => Math.hypot(a[0], a[1], a[2]);
function vnorm(a) {
  const l = vlen(a);
  return l < EPS ? [0, 1, 0] : [a[0] / l, a[1] / l, a[2] / l];
}
const vlerp = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/* ═════════════════════════════════ geometry construction ═════════════════════════════════ */

/** A Part, per CONTRACT.md §1. */
const part = (geometry, material) => ({ geometry, material });

/**
 * Build a non-indexed BufferGeometry from a triangle soup with flat per-face normals.
 * Flat normals are the point: a corrugation rib only reads if its two flanks take light
 * differently, and a smoothed rib is a flat sheet with a gradient on it.
 */
function soup(name) {
  const pos = [];
  const nrm = [];
  const uvs = [];
  return {
    /** One triangle. `n` is the intended outward normal; winding is corrected against it. */
    tri(a, b, c, uvA, uvB, uvC, n) {
      const e1 = vsub(b, a);
      const e2 = vsub(c, a);
      const face = vcross(e1, e2);
      const area = vlen(face);
      if (area < 1e-9) return;              // degenerate — a hip apex cell, drop it
      let fn = vmul(face, 1 / area);
      let p1 = b; let p2 = c; let t1 = uvB; let t2 = uvC;
      if (n && vdot(fn, n) < 0) {
        p1 = c; p2 = b; t1 = uvC; t2 = uvB;
        fn = vmul(fn, -1);
      }
      pos.push(a[0], a[1], a[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
      for (let i = 0; i < 3; i += 1) nrm.push(fn[0], fn[1], fn[2]);
      uvs.push(uvA[0], uvA[1], t1[0], t1[1], t2[0], t2[1]);
    },
    /** A quad, corners in order round the face. */
    quad(a, b, c, d, uvA, uvB, uvC, uvD, n) {
      this.tri(a, b, c, uvA, uvB, uvC, n);
      this.tri(a, c, d, uvA, uvC, uvD, n);
    },
    get triangles() { return pos.length / 9; },
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.name = name;
      g.computeBoundingBox();
      return g;
    },
    get empty() { return pos.length === 0; },
  };
}

/**
 * A box from a centre and three orthogonal half-extent vectors. The basis must be
 * right-handed (a0 × a1 = a2) — every face is then wound counter-clockwise from outside.
 * This is the workhorse for members that do not sit on a world axis: valley flashings, hip
 * cappings, rake boards, cone arrises.
 */
function frameBox(centre, a0, a1, a2, name, metric = false) {
  const s = soup(name);
  const c = (i, j, k) => vadd(centre, vadd(vmul(a0, i), vadd(vmul(a1, j), vmul(a2, k))));
  const n0 = vnorm(a0); const n1 = vnorm(a1); const n2 = vnorm(a2);
  // `metric` is opt-in and set only where the box carries a WALL family, so every trim and
  // roof member keeps the 0..1 mapping it has today and no other seat sees a change.
  const l0 = vlen(a0) * 2; const l1 = vlen(a1) * 2; const l2 = vlen(a2) * 2;
  const quadUv = (a, b) => (metric
    ? [[0, 0], [uvM(a), 0], [uvM(a), uvM(b)], [0, uvM(b)]]
    : [[0, 0], [1, 0], [1, 1], [0, 1]]);
  const f = (p, q, r, t, n, uv) => s.quad(p, q, r, t, uv[0], uv[1], uv[2], uv[3], n);
  const uv0 = quadUv(l1, l2); const uv1 = quadUv(l2, l0); const uv2 = quadUv(l0, l1);
  f(c(1, -1, -1), c(1, 1, -1), c(1, 1, 1), c(1, -1, 1), n0, uv0);
  f(c(-1, -1, -1), c(-1, -1, 1), c(-1, 1, 1), c(-1, 1, -1), vmul(n0, -1), uv0);
  f(c(-1, 1, -1), c(-1, 1, 1), c(1, 1, 1), c(1, 1, -1), n1, uv1);
  f(c(-1, -1, -1), c(1, -1, -1), c(1, -1, 1), c(-1, -1, 1), vmul(n1, -1), uv1);
  f(c(-1, -1, 1), c(1, -1, 1), c(1, 1, 1), c(-1, 1, 1), n2, uv2);
  f(c(-1, -1, -1), c(-1, 1, -1), c(1, 1, -1), c(1, -1, -1), vmul(n2, -1), uv2);
  return s.build();
}

/**
 * A member running from p0 to p1 with a rectangular section: `width` across the run in the
 * horizontal sense, `thickness` perpendicular to both. 12 triangles.
 */
function barAlong(p0, p1, width, thickness, name) {
  const dir = vsub(p1, p0);
  const len = vlen(dir);
  if (len < 1e-5) return null;
  const e0 = vmul(dir, 1 / len);
  let side = vcross(e0, [0, 1, 0]);
  if (vlen(side) < 1e-4) side = vcross(e0, [1, 0, 0]);
  const e1 = vnorm(side);
  const e2 = vnorm(vcross(e0, e1));         // right-handed: e0 × e1 = e2
  const centre = vlerp(p0, p1, 0.5);
  return frameBox(centre, vmul(e0, len / 2), vmul(e1, width / 2), vmul(e2, thickness / 2), name);
}

/**
 * A folded surface: the one generator behind every roof skin in this file.
 *
 * `sample(u, v) -> {p, n}` gives the underlying smooth surface. `us` and `vs` are sample rows
 * carrying an offset along the surface normal; a corrugation folds in u, a tile course folds
 * in v, and a bullnose puts the curve in v while the rib still folds in u.
 *
 * UVs come straight from (u, v) in 0..1 — the atlas repeats its family tile against normalised
 * primitive UVs, so anything else would put the shader's rhythm at the wrong pitch.
 *
 * ── WHY THE WINDING REFERENCE IS THE SURFACE NORMAL AND NEVER A DIRECTION FROM AN INTERIOR
 *    POINT. This put a hole in the Brighton roof and it is worth stating so nobody puts it back.
 *
 * Every cell of a fold — the pan, the riser, the rib crest, the rib flank — is a quad on the
 * SMOOTH surface displaced along that surface's own normal at its two edges. Write the cell as
 * a step of `Δt` along the surface and `Δoff` out along ê_n; its outward normal is then
 * `-Δoff·ê_t + Δt·ê_n`, whose dot with ê_n is `Δt` — POSITIVE for every cell of every fold,
 * whatever the pitch, the step and the count. So `sample().n` is always a valid reference and it
 * cannot mis-pick. Measured across the four archetypes at three qualities the worst case is
 * +0.447 (a tile riser), against the +1.000 of a pan.
 *
 * A direction from an interior point is NOT a valid reference, because it answers a different
 * question: it says which way is out of the BUILDING, not which way is out of the SURFACE. On a
 * tile course the two disagree. The riser faces down-slope — it is the underside of the next
 * course's nose, and it is the shadow line the mp plates read as horizontal banding — so once
 * `step·sin(pitch) > Δs·cos(pitch)` with `Δs = (1 − tileCourseRun)/courses · L`, its true
 * outward normal tips BELOW horizontal. Near the ridge `mid − interior` is nearly vertical, the
 * dot goes negative, and `soup.tri` dutifully reverses a quad that was already correct. Under
 * `side: FrontSide` those triangles are culled and you see the sky through the roof.
 *
 * Rearranged, that made a tiled face closed only while
 *
 *     halfSpan (overhang included) > courses · tileCourseStep / (1 − tileCourseRun) · sin(pitch)
 *
 * — 4.821·sin(pitch) at `high` — so at 38° NO subsidiary roof under about 3.0 m of half span
 * could be tiled at all, and `mid` and `low` hid it behind a longer `Δs`. That constraint is
 * gone; `bungalow-brighton`'s `tiledHalfSpanFloor()` guard and the `covering: 'plain'` fallbacks
 * behind it are now belt-and-braces rather than load-bearing, and can be retired by that seat.
 *
 * `interior` stays a parameter of `roofFace` because it does real work THERE — it fixes the sign
 * of a planar face's normal, which a corner ordering alone cannot, and one sign for a whole face
 * is exactly the question an interior point can answer.
 */
function foldedSurface({ sample, us, vs, name }) {
  const s = soup(name);
  const grid = [];
  for (let j = 0; j < vs.length; j += 1) {
    const row = [];
    for (let i = 0; i < us.length; i += 1) {
      const { p, n } = sample(us[i].t, vs[j].t);
      row.push(vadd(p, vmul(n, (us[i].off || 0) + (vs[j].off || 0))));
    }
    grid.push(row);
  }
  for (let j = 0; j + 1 < vs.length; j += 1) {
    for (let i = 0; i + 1 < us.length; i += 1) {
      const a = grid[j][i]; const b = grid[j][i + 1];
      const c = grid[j + 1][i + 1]; const d = grid[j + 1][i];
      const ref = sample(us[i].t, vs[j].t).n;
      s.quad(
        a, b, c, d,
        [us[i].t, vs[j].t], [us[i + 1].t, vs[j].t],
        [us[i + 1].t, vs[j + 1].t], [us[i].t, vs[j + 1].t],
        ref,
      );
    }
  }
  return s.empty ? null : s.build();
}

/** Rib columns across a plane: `ribs` ribs → 2·ribs cells, crest and trough alternating. */
function ribColumns(ribs, depth) {
  const cols = [];
  const n = Math.max(2, ribs * 2);
  for (let i = 0; i <= n; i += 1) cols.push({ t: i / n, off: i % 2 === 0 ? 0 : depth });
  return cols;
}

/** A single unfolded axis. */
const flatRows = () => [{ t: 0, off: 0 }, { t: 1, off: 0 }];

/**
 * Tile courses up a slope: each course is a pan running from a proud nose up to flush, then a
 * riser back out to proud. The riser is what casts the course shadow the mp plates read as
 * horizontal banding.
 */
function courseRows(courses, step) {
  const rows = [];
  const n = Math.max(1, courses);
  for (let k = 0; k < n; k += 1) {
    rows.push({ t: k / n, off: step });
    rows.push({ t: (k + KIT_METRICS.tileCourseRun) / n, off: 0 });
  }
  rows.push({ t: 1, off: 0 });
  return rows;
}

/** How many ribs / courses this quality level gets. */
function ribCount(ctx) {
  const q = ctx?.q === 'low' ? 'low' : (ctx?.q === 'mid' ? 'mid' : 'high');
  return KIT_METRICS.corrugationRibs[q];
}
function courseCount(ctx) {
  const q = ctx?.q === 'low' ? 'low' : (ctx?.q === 'mid' ? 'mid' : 'high');
  return KIT_METRICS.tileCourses[q];
}

/** The covering a roof gets when the caller did not say. */
function coveringOf(ctx, given) {
  if (given === 'corrugated' || given === 'tile' || given === 'plain') return given;
  return KIT_METRICS.covering[ctx?.id] ?? 'corrugated';
}

/**
 * Skin one planar roof face. `corners` are [eaveLeft, eaveRight, ridgeRight, ridgeLeft];
 * a hip end passes the two ridge corners equal and the apex cells drop out as degenerate.
 *
 * `interior` is a point under the roof, and its ONE job is the sign of this face's normal: the
 * cross product of two corner edges is outward or inward depending on which way round the caller
 * listed its corners, and nothing in the corner list itself says which. It is deliberately not
 * handed on to `foldedSurface` — see the note there for the hole that put in the roof.
 */
function roofFace(ctx, corners, covering, name, interior, tileCourseStep = KIT_METRICS.tileCourseStep) {
  const [a, b, c, d] = corners;
  const sample = (u, v) => {
    const lo = vlerp(a, b, u);
    const hi = vlerp(d, c, u);
    const p = vlerp(lo, hi, v);
    let n = vnorm(vcross(vsub(b, a), vsub(d, a)));
    if (vlen(vsub(c, d)) < 1e-5) n = vnorm(vcross(vsub(b, a), vsub(c, a)));
    if (interior && vdot(n, vsub(p, interior)) < 0) n = vmul(n, -1);
    return { p, n };
  };
  if (covering === 'corrugated') {
    return foldedSurface({
      sample,
      us: ribColumns(ribCount(ctx), KIT_METRICS.corrugationRibDepth),
      vs: flatRows(),
      name,
    });
  }
  if (covering === 'tile') {
    return foldedSurface({
      sample,
      us: flatRows(),
      vs: courseRows(courseCount(ctx), tileCourseStep),
      name,
    });
  }
  return foldedSurface({ sample, us: flatRows(), vs: flatRows(), name });
}

/**
 * A four-slab ring around a w × d rectangle, each slab standing `proud` outside the face.
 * Plinth caps, string courses, chimney corbels, chimney flashing skirts.
 */
function bandRing(w, d, x, z, yBase, h, proud, name) {
  const W = w + proud * 2;
  const D = d + proud * 2;
  return [
    slab(W, h, proud, x, yBase, z + d / 2 + proud / 2, `${name}-front`),
    slab(W, h, proud, x, yBase, z - d / 2 - proud / 2, `${name}-back`),
    slab(proud, h, D - proud * 2, x + w / 2 + proud / 2, yBase, z, `${name}-right`),
    slab(proud, h, D - proud * 2, x - w / 2 - proud / 2, yBase, z, `${name}-left`),
  ];
}

/* ═════════════════════════════════════ 1. the lot plate ══════════════════════════════════ */

/**
 * The board tile the house and its garden stand on: a dark slab whose top edge is chamfered,
 * exactly the plinth every Monopoly-Plus plate sits on.
 *
 * The soil face is at y = -0.02 and the chamfer's top ring lands at y = 0.00, so GARDEN's lawn
 * at y = 0 sits flush inside a crisp dark lip and no two horizontal faces are coplanar. Nothing
 * here paints lawn — that is `garden.lotSurface`.
 */
export function lotPlate(ctx, opts = {}) {
  const { env, p } = ctx;
  const chamfer = opts.chamfer ?? 0.20;
  const depth = opts.depth ?? 0.55;
  const w = opts.w ?? env.lotW;
  const d = opts.d ?? env.lotD;
  const x = opts.x ?? 0;
  const z = opts.z ?? 0;
  const material = opts.material ?? p.shadow;
  const soilY = -0.02;
  const bevelBase = -chamfer * 0.75;

  const s = soup('lot-plate');
  const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const hw = w / 2; const hd = d / 2;
  const iw = hw - chamfer; const id = hd - chamfer;

  // Vertical sides, full size, from the underside up to the bevel spring.
  const sides = [
    { a: v3(x - hw, -depth, z + hd), b: v3(x + hw, -depth, z + hd), n: v3(0, 0, 1) },
    { a: v3(x + hw, -depth, z - hd), b: v3(x - hw, -depth, z - hd), n: v3(0, 0, -1) },
    { a: v3(x + hw, -depth, z + hd), b: v3(x + hw, -depth, z - hd), n: v3(1, 0, 0) },
    { a: v3(x - hw, -depth, z - hd), b: v3(x - hw, -depth, z + hd), n: v3(-1, 0, 0) },
  ];
  for (const e of sides) {
    s.quad(
      e.a, e.b, v3(e.b[0], bevelBase, e.b[2]), v3(e.a[0], bevelBase, e.a[2]),
      uv[0], uv[1], uv[2], uv[3], e.n,
    );
  }
  // The chamfer ring: full size at the bevel spring, inset by `chamfer` at y = 0.
  const outer = [
    [v3(x - hw, bevelBase, z + hd), v3(x + hw, bevelBase, z + hd),
      v3(x + iw, 0, z + id), v3(x - iw, 0, z + id), v3(0, 0.6, 0.8)],
    [v3(x + hw, bevelBase, z - hd), v3(x - hw, bevelBase, z - hd),
      v3(x - iw, 0, z - id), v3(x + iw, 0, z - id), v3(0, 0.6, -0.8)],
    [v3(x + hw, bevelBase, z + hd), v3(x + hw, bevelBase, z - hd),
      v3(x + iw, 0, z - id), v3(x + iw, 0, z + id), v3(0.8, 0.6, 0)],
    [v3(x - hw, bevelBase, z - hd), v3(x - hw, bevelBase, z + hd),
      v3(x - iw, 0, z + id), v3(x - iw, 0, z - id), v3(-0.8, 0.6, 0)],
  ];
  for (const [a, b, c, e, n] of outer) s.quad(a, b, c, e, uv[0], uv[1], uv[2], uv[3], vnorm(n));
  // Soil, 20 mm under the lip.
  s.quad(
    v3(x - iw, soilY, z + id), v3(x + iw, soilY, z + id),
    v3(x + iw, soilY, z - id), v3(x - iw, soilY, z - id),
    uv[0], uv[1], uv[2], uv[3], v3(0, 1, 0),
  );
  // Underside, so the plate is a closed solid at a low camera.
  s.quad(
    v3(x - hw, -depth, z - hd), v3(x + hw, -depth, z - hd),
    v3(x + hw, -depth, z + hd), v3(x - hw, -depth, z + hd),
    uv[0], uv[1], uv[2], uv[3], v3(0, -1, 0),
  );

  const out = [part(s.build(), material)];
  out.surface = Object.freeze({ soilY, lipY: 0, inset: chamfer, w, d, x, z });
  return out;
}

/* ═══════════════════════════════════ 2. the floor plate ══════════════════════════════════ */

/**
 * Plinth and finished floor. Runs y = 0 → `height` (default env.floorY), so the building
 * stands ON the lot rather than above it, and publishes the step-down anchor GARDEN needs.
 */
export function floorPlate(ctx, opts = {}) {
  const { env, p } = ctx;
  const w = opts.w ?? env.bodyW;
  const d = opts.d ?? env.bodyD;
  const x = opts.x ?? 0;
  const z = opts.z ?? (env.frontZ - d / 2);
  const height = opts.height ?? env.floorY;
  const material = opts.material ?? p.wallAlt;
  const capMaterial = opts.capMaterial ?? p.trim;
  const proud = opts.proud ?? KIT_METRICS.plinthProud;
  const out = [];

  // The plinth block itself, standing proud of the wall above it.
  out.push(part(slab(w + proud * 2, height, d + proud * 2, x, 0, z, 'plinth-block'), material));

  // A two-step cap so the wall above lands on a shadowed ledge rather than on a colour change.
  if (opts.cap !== false && height > 0.22) {
    const capH = 0.11;
    for (const g of bandRing(w + proud * 2, d + proud * 2, x, z, height - capH * 2, capH,
      0.075, 'plinth-cap-lower')) out.push(part(g, capMaterial));
    for (const g of bandRing(w + proud * 2, d + proud * 2, x, z, height - capH, capH,
      0.035, 'plinth-cap-upper')) out.push(part(g, capMaterial));
  }

  // Underfloor vent line: a shadow band under the cap. Cheap, and it stops the plinth reading
  // as a solid painted skirting.
  if (ctx.mid !== false && height > 0.34) {
    for (const g of bandRing(w + proud * 2, d + proud * 2, x, z, height * 0.34, 0.10,
      0.012, 'plinth-vent-line')) out.push(part(g, p.shadow));
  }

  out.anchor = Object.freeze({
    floorY: height, frontZ: z + d / 2 + proud, w, d, x, z, proud,
  });
  return out;
}

/* ═════════════════════════════════════ 3. wall shells ════════════════════════════════════ */

const FACE_FRAMES = Object.freeze({
  front: { out: [0, 0, 1], u: [1, 0, 0], along: 'x' },
  back: { out: [0, 0, -1], u: [-1, 0, 0], along: 'x' },
  right: { out: [1, 0, 0], u: [0, 0, -1], along: 'z' },
  left: { out: [-1, 0, 0], u: [0, 0, 1], along: 'z' },
});

const faceKey = (f) => {
  if (f === '+z' || f === 'front' || f === undefined) return 'front';
  if (f === '-z' || f === 'back' || f === 'rear') return 'back';
  if (f === '+x' || f === 'right' || f === 'east') return 'right';
  return 'left';
};

/**
 * One elevation, with its openings cut out of the surface rather than drawn on it.
 *
 * The partition is a guillotine on the openings' u-edges: every band between two consecutive
 * cuts is a full-height strip minus the openings that span it, so an elevation with three
 * windows costs about thirteen quads and no opening is a decal.
 */
function punchedFace({
  origin, uAxis, vAxis, width, height, holes, outward, name,
}) {
  const s = soup(name);
  const at = (u, v) => vadd(origin, vadd(vmul(uAxis, u), vmul(vAxis, v)));
  // METRIC, not normalised: `u` and `v` are already metres along the elevation, so the course
  // cadence is the same physical size on a 13 m flank and on a 1.2 m gable panel.
  const uvAt = (u, v) => [uvM(u), uvM(v)];
  const cuts = new Set([0, width]);
  for (const h of holes) {
    cuts.add(Math.max(0, Math.min(width, h.u0)));
    cuts.add(Math.max(0, Math.min(width, h.u1)));
  }
  const uu = [...cuts].sort((a, b) => a - b);
  for (let i = 0; i + 1 < uu.length; i += 1) {
    const ua = uu[i]; const ub = uu[i + 1];
    if (ub - ua < 1e-5) continue;
    const spanning = holes
      .filter((h) => h.u0 <= ua + 1e-6 && h.u1 >= ub - 1e-6)
      .sort((a, b) => a.v0 - b.v0);
    let v = 0;
    for (const h of spanning) {
      const v0 = Math.max(v, Math.min(height, h.v0));
      if (v0 - v > 1e-5) {
        s.quad(at(ua, v), at(ub, v), at(ub, v0), at(ua, v0),
          uvAt(ua, v), uvAt(ub, v), uvAt(ub, v0), uvAt(ua, v0), outward);
      }
      v = Math.max(v, Math.min(height, h.v1));
    }
    if (height - v > 1e-5) {
      s.quad(at(ua, v), at(ub, v), at(ub, height), at(ua, height),
        uvAt(ua, v), uvAt(ub, v), uvAt(ub, height), uvAt(ua, height), outward);
    }
  }
  return s.empty ? null : s.build();
}

/** The four inward faces of an opening plus the liner that closes it. */
function openingReveal({ origin, uAxis, vAxis, outward, hole, depth, name }) {
  const s = soup(name);
  const at = (u, v, back) => vadd(
    vadd(origin, vadd(vmul(uAxis, u), vmul(vAxis, v))),
    vmul(outward, -back),
  );
  const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const { u0, u1, v0, v1 } = hole;
  const inU = vmul(uAxis, -1);
  // jamb at u0 — faces toward +u
  s.quad(at(u0, v0, 0), at(u0, v0, depth), at(u0, v1, depth), at(u0, v1, 0),
    uv[0], uv[1], uv[2], uv[3], vmul(inU, -1));
  // jamb at u1 — faces toward -u
  s.quad(at(u1, v0, 0), at(u1, v1, 0), at(u1, v1, depth), at(u1, v0, depth),
    uv[0], uv[1], uv[2], uv[3], inU);
  // head, facing down
  s.quad(at(u0, v1, 0), at(u0, v1, depth), at(u1, v1, depth), at(u1, v1, 0),
    uv[0], uv[1], uv[2], uv[3], vmul(vAxis, -1));
  // sill seat, facing up and falling 30 mm outward so it sheds
  const drop = vmul(vAxis, -0.03);
  s.quad(
    vadd(at(u0, v0, 0), drop), vadd(at(u1, v0, 0), drop), at(u1, v0, depth), at(u0, v0, depth),
    uv[0], uv[1], uv[2], uv[3], vAxis,
  );
  // liner: the opening is closed at the back of the reveal, so nothing sees through the house
  s.quad(at(u0, v0, depth), at(u1, v0, depth), at(u1, v1, depth), at(u0, v1, depth),
    uv[0], uv[1], uv[2], uv[3], outward);
  return s.build();
}

/**
 * A wall shell: four elevations, punched, with a base course and a wall plate.
 *
 * `openings: [{x, y, w, h, face, reveal}]`
 *   x     — offset of the opening's CENTRE from the face's centre, measured left-to-right as
 *           you look at that elevation from outside.
 *   y     — the sill, in WORLD y (the datum in CONTRACT.md §3, not a local height).
 *   face  — 'front' | 'back' | 'left' | 'right' (or '+z' / '-z' / '+x' / '-x').
 *
 * `base` is the world y the shell starts at, and defaults to env.floorY.
 *
 * Returns Part[] with `.openings` — the resolved reveal rectangles in world space, so seat
 * DETAIL can seat a sash inside the hole instead of measuring it a second time.
 */
export function wallShell(ctx, opts = {}) {
  const { env, p } = ctx;
  const w = opts.w ?? env.bodyW;
  const d = opts.d ?? env.bodyD;
  const x = opts.x ?? 0;
  const z = opts.z ?? (env.frontZ - d / 2);
  const base = opts.base ?? env.floorY;
  const height = opts.height ?? env.wallH;
  const material = opts.material ?? p.wall;
  const revealDepth = opts.reveal ?? KIT_METRICS.reveal;
  const faces = opts.faces ?? ['front', 'back', 'left', 'right'];
  const articulate = opts.articulate ?? 'auto';
  const bc = opts.baseCourse ?? null;
  const bcHeight = bc ? Math.min(bc.height ?? 0.9, height * 0.8) : 0;
  const bcMaterial = bc ? (bc.material ?? p.wallAlt) : null;
  const bcProud = bc ? (bc.proud ?? KIT_METRICS.baseCourseProud) : 0;
  const out = [];
  const resolved = [];

  const half = { front: d / 2, back: d / 2, right: w / 2, left: w / 2 };
  const spanOf = { front: w, back: w, right: d, left: d };

  for (const key of faces.map(faceKey)) {
    const frame = FACE_FRAMES[key];
    const span = spanOf[key];
    const outward = frame.out;
    const holes = [];
    for (const o of (opts.openings ?? [])) {
      if (faceKey(o.face) !== key) continue;
      const ow = o.w ?? 1.2;
      const oh = o.h ?? 1.5;
      const sill = o.y ?? (base + 0.95);
      const u = span / 2 + (o.x ?? 0) - ow / 2;
      holes.push({
        u0: Math.max(0.06, u),
        u1: Math.min(span - 0.06, u + ow),
        v0: Math.max(0.02, sill - base),
        v1: Math.min(height - 0.10, sill + oh - base),
        reveal: o.reveal ?? revealDepth,
        src: o,
      });
    }

    // Shell surface, split into base course and field so the brick band is a real band with a
    // real return rather than a stripe printed on one plane. Preamble finding 1 lives here.
    const runs = bc
      ? [
        { y0: 0, y1: bcHeight, mat: bcMaterial, proud: bcProud, tag: 'base' },
        { y0: bcHeight, y1: height, mat: material, proud: 0, tag: 'field' },
      ]
      : [{ y0: 0, y1: height, mat: material, proud: 0, tag: 'field' }];

    for (const run of runs) {
      const runH = run.y1 - run.y0;
      if (runH < 1e-4) continue;
      const originBase = vadd(
        vadd([x, base + run.y0, z], vmul(outward, half[key] + run.proud)),
        vmul(frame.u, -span / 2),
      );
      const clipped = holes
        .map((h) => ({
          ...h,
          v0: Math.max(h.v0, run.y0) - run.y0,
          v1: Math.min(h.v1, run.y1) - run.y0,
        }))
        .filter((h) => h.v1 - h.v0 > 1e-4);
      const g = punchedFace({
        origin: originBase,
        uAxis: frame.u,
        vAxis: [0, 1, 0],
        width: span,
        height: runH,
        holes: clipped,
        outward,
        name: `wall-${key}-${run.tag}`,
      });
      if (g) out.push(part(g, run.mat));
      // The base course's return, so its proud face is not a floating skin.
      if (run.proud > 0) {
        const retOrigin = vadd(
          vadd([x, base + run.y1, z], vmul(outward, half[key])),
          vmul(frame.u, -span / 2),
        );
        const s = soup(`wall-${key}-base-return`);
        s.quad(
          retOrigin,
          vadd(retOrigin, vmul(frame.u, span)),
          vadd(vadd(retOrigin, vmul(frame.u, span)), vmul(outward, run.proud)),
          vadd(retOrigin, vmul(outward, run.proud)),
          [0, 0], [uvM(span), 0], [uvM(span), uvM(run.proud)], [0, uvM(run.proud)], [0, 1, 0],
        );
        out.push(part(s.build(), run.mat));
      }
    }

    // Reveals, one per opening. This is what §2.9 grades as ambient occlusion for free.
    for (const h of holes) {
      const origin = vadd(
        vadd([x, base, z], vmul(outward, half[key])),
        vmul(frame.u, -span / 2),
      );
      const proudHere = bc && h.v0 < bcHeight - 1e-4 ? bcProud : 0;
      const g = openingReveal({
        origin: vadd(origin, vmul(outward, proudHere)),
        uAxis: frame.u,
        vAxis: [0, 1, 0],
        outward,
        hole: h,
        depth: h.reveal + proudHere,
        name: `opening-reveal-${key}`,
      });
      out.push(part(g, p.shadow));
      const centreU = (h.u0 + h.u1) / 2 - span / 2;
      const centre = vadd(
        vadd([x, base + (h.v0 + h.v1) / 2, z], vmul(outward, half[key] + proudHere)),
        vmul(frame.u, centreU),
      );
      resolved.push(Object.freeze({
        face: key,
        centre,
        outward,
        uAxis: frame.u,
        w: h.u1 - h.u0,
        h: h.v1 - h.v0,
        sillY: base + h.v0,
        headY: base + h.v1,
        reveal: h.reveal,
        src: h.src,
      }));
    }

    // Blank-wall articulation — a named rule inside §2.1. A flank with nothing on it gets a
    // shallow breast, so no elevation on this board is a large undifferentiated plane.
    const blank = holes.length === 0 && span >= 3.4;
    const wantBreast = articulate === 'breast' || (articulate === 'auto' && blank);
    if (wantBreast) {
      const bw = span * 0.34;
      const proudBy = KIT_METRICS.breastProud;
      const centre = vadd(
        vadd([x, base + height / 2, z], vmul(outward, half[key] + proudBy / 2)),
        vmul(frame.u, ctx.v ? ctx.v.range(salted(11), -span * 0.10, span * 0.10) : 0),
      );
      const a0 = vmul(frame.u, bw / 2);
      const a1 = [0, height / 2, 0];
      const a2 = vmul(outward, proudBy / 2);
      // metric = true: the breast carries the wall family, so its courses must match the flank
      // it stands on. Two shells sharing a `base` also align, because each run's v starts at 0
      // at the same world height.
      const rh = vdot(vcross(a0, a1), a2) > 0
        ? frameBox(centre, a0, a1, a2, `wall-${key}-breast`, true)
        : frameBox(centre, a1, a0, a2, `wall-${key}-breast`, true);
      out.push(part(rh, material));
      // A shoulder on top of it, so the breast lands under the eaves as a member and not as a
      // slab that stops dead. Chunky on purpose.
      const shoulderY = base + height - 0.13;
      const sc = vadd(
        vadd([centre[0], shoulderY + 0.065, centre[2]], vmul(outward, 0.05)),
        [0, 0, 0],
      );
      const s0 = vmul(frame.u, bw / 2 + 0.09);
      const s1 = [0, 0.065, 0];
      const s2 = vmul(outward, proudBy / 2 + 0.05);
      out.push(part(
        vdot(vcross(s0, s1), s2) > 0
          ? frameBox(sc, s0, s1, s2, `wall-${key}-breast-shoulder`)
          : frameBox(sc, s1, s0, s2, `wall-${key}-breast-shoulder`),
        opts.breastCapMaterial ?? p.trim,
      ));
    }
  }

  // The string course between base and field: a real moulded band, on trim, and the single
  // cheapest piece of value separation on the frontage.
  if (bc && bc.moulding !== false) {
    const mat = bc.mouldingMaterial ?? p.trim;
    const y = base + bcHeight;
    for (const g of bandRing(w, d, x, z, y - 0.04, 0.13, bcProud + 0.075, 'string-course-lower')) {
      out.push(part(g, mat));
    }
    for (const g of bandRing(w, d, x, z, y + 0.09, 0.09, bcProud + 0.040, 'string-course-upper')) {
      out.push(part(g, mat));
    }
  }

  // Wall plate: the top of the shell, so the roof lands on something.
  if (opts.cap !== false) {
    const capH = KIT_METRICS.wallPlate;
    for (const g of bandRing(w, d, x, z, base + height - capH, capH, 0.05, 'wall-plate')) {
      out.push(part(g, opts.capMaterial ?? p.trim));
    }
  }

  out.openings = resolved;
  out.body = Object.freeze({
    w, d, x, z, base, height, topY: base + height, baseCourseTop: base + bcHeight,
  });
  return out;
}

/**
 * A faceted drum — the Federation villa's corner tower. `wallShell` is rectangular by
 * construction and an octagonal drum capped by square slabs is a documented repeat failure of
 * this archetype, so the drum is its own primitive and `conicalRoof` springs from the same
 * radius this returns.
 */
export function polyShell(ctx, opts = {}) {
  const { env, p } = ctx;
  const radius = opts.radius ?? 1.9;
  const sides = Math.max(3, opts.sides ?? KIT_METRICS.coneSides);
  const x = opts.x ?? 0;
  const z = opts.z ?? env.frontZ - radius;
  const base = opts.base ?? env.floorY;
  const height = opts.height ?? env.wallH;
  const material = opts.material ?? p.wall;
  const arc = opts.arc ?? Math.PI * 2;
  const rot = opts.rotation ?? Math.PI / sides;
  const bc = opts.baseCourse ?? null;
  const bcHeight = bc ? Math.min(bc.height ?? 0.9, height * 0.7) : 0;
  const out = [];
  const openings = [];

  const facets = Math.max(1, Math.round((arc / (Math.PI * 2)) * sides));
  const corner = (i, r) => {
    const a = rot + (arc * i) / facets - arc / 2;
    return [x + Math.sin(a) * r, 0, z + Math.cos(a) * r];
  };
  const runs = bc
    ? [
      { y0: base, y1: base + bcHeight, mat: bc.material ?? p.wallAlt, proud: KIT_METRICS.baseCourseProud },
      { y0: base + bcHeight, y1: base + height, mat: material, proud: 0 },
    ]
    : [{ y0: base, y1: base + height, mat: material, proud: 0 }];

  for (let i = 0; i < facets; i += 1) {
    const c0 = corner(i, radius);
    const c1 = corner(i + 1, radius);
    const mid = vmul(vadd(c0, c1), 0.5);
    const outward = vnorm([mid[0] - x, 0, mid[2] - z]);
    const span = vlen(vsub(c1, c0));
    const uAxis = vnorm(vsub(c1, c0));
    const holes = [];
    for (const o of (opts.openings ?? [])) {
      if ((o.facet ?? -1) !== i) continue;
      const ow = o.w ?? 1.0; const oh = o.h ?? 1.7;
      const sill = o.y ?? base + 0.95;
      const u = span / 2 + (o.x ?? 0) - ow / 2;
      holes.push({
        u0: Math.max(0.10, u),
        u1: Math.min(span - 0.10, u + ow),
        v0: Math.max(0.02, sill - base),
        v1: Math.min(height - 0.12, sill + oh - base),
        reveal: o.reveal ?? KIT_METRICS.reveal,
        src: o,
      });
    }
    for (const run of runs) {
      const runH = run.y1 - run.y0;
      if (runH < 1e-4) continue;
      const origin = vadd(vadd(c0, [0, run.y0, 0]), vmul(outward, run.proud));
      const clipped = holes
        .map((h) => ({
          ...h,
          v0: Math.max(h.v0 + base, run.y0) - run.y0,
          v1: Math.min(h.v1 + base, run.y1) - run.y0,
        }))
        .filter((h) => h.v1 - h.v0 > 1e-4);
      const g = punchedFace({
        origin,
        uAxis,
        vAxis: [0, 1, 0],
        width: span,
        height: runH,
        holes: clipped,
        outward,
        name: `drum-facet-${i}`,
      });
      if (g) out.push(part(g, run.mat));
      if (run.proud > 0) {
        // The base course's return, so its proud face is not a floating skin on the drum.
        const rs = soup(`drum-base-return-${i}`);
        const r0 = vadd(c0, [0, run.y1, 0]);
        rs.quad(
          r0, vadd(r0, vmul(uAxis, span)),
          vadd(vadd(r0, vmul(uAxis, span)), vmul(outward, run.proud)),
          vadd(r0, vmul(outward, run.proud)),
          [0, 0], [uvM(span), 0], [uvM(span), uvM(run.proud)], [0, uvM(run.proud)], [0, 1, 0],
        );
        out.push(part(rs.build(), run.mat));
      }
    }
    for (const h of holes) {
      const g = openingReveal({
        origin: vadd(c0, [0, base, 0]),
        uAxis,
        vAxis: [0, 1, 0],
        outward,
        hole: h,
        depth: h.reveal,
        name: `drum-reveal-${i}`,
      });
      out.push(part(g, p.shadow));
      openings.push(Object.freeze({
        facet: i,
        centre: vadd(vadd(c0, [0, base + (h.v0 + h.v1) / 2, 0]),
          vmul(uAxis, (h.u0 + h.u1) / 2)),
        outward,
        uAxis,
        w: h.u1 - h.u0,
        h: h.v1 - h.v0,
        sillY: base + h.v0,
        headY: base + h.v1,
        reveal: h.reveal,
        src: h.src,
      }));
    }
  }
  // Wall plate: a faceted cap ring, not a square slab. `conicalRoof` springs from `radius`,
  // so the drum, its plate and its cone all read one diameter.
  if (opts.cap !== false) {
    const capH = KIT_METRICS.wallPlate;
    const capProud = opts.capProud ?? 0.09;
    const cs = soup('drum-wall-plate');
    const y0 = base + height - capH;
    const y1 = base + height;
    for (let i = 0; i < facets; i += 1) {
      const a0 = corner(i, radius + capProud);
      const a1 = corner(i + 1, radius + capProud);
      const n = vnorm([(a0[0] + a1[0]) / 2 - x, 0, (a0[2] + a1[2]) / 2 - z]);
      cs.quad(
        vadd(a0, [0, y0, 0]), vadd(a1, [0, y0, 0]),
        vadd(a1, [0, y1, 0]), vadd(a0, [0, y1, 0]),
        [0, 0], [1, 0], [1, 1], [0, 1], n,
      );
      cs.quad(
        vadd(a0, [0, y1, 0]), vadd(a1, [0, y1, 0]),
        vadd(corner(i + 1, radius), [0, y1, 0]), vadd(corner(i, radius), [0, y1, 0]),
        [0, 0], [1, 0], [1, 1], [0, 1], [0, 1, 0],
      );
    }
    out.push(part(cs.build(), opts.capMaterial ?? p.trim));
  }

  out.openings = openings;
  out.drum = Object.freeze({
    radius, sides: facets, x, z, base, height, topY: base + height, rotation: rot,
  });
  return out;
}

/* ══════════════════════════════════════ 4. the eaves ═════════════════════════════════════ */

/**
 * Fascia, soffit and bed mould along one or more eave lines.
 *
 * The overhang is modelled as three real surfaces — a board with a face you can see, a lit
 * horizontal soffit, and the shadow line where they meet — because §2.9 grades the eaves
 * shadow directly and DETAIL hangs rafter tails and knee brackets off the numbers here.
 *
 * `edges: [{ from:[x,y,z], to:[x,y,z], outward:[nx,0,nz] }]`, or pass `{ w, d, x, z, y }` and
 * the four eaves of that rectangle are built for you.
 */
export function eaves(ctx, opts = {}) {
  const { p } = ctx;
  const overhang = opts.overhang ?? 0.6;
  const fasciaDepth = opts.fasciaDepth ?? KIT_METRICS.fasciaDepth;
  const fasciaThickness = opts.fasciaThickness ?? KIT_METRICS.fasciaThickness;
  const wantSoffit = opts.soffit !== false;
  const fasciaMaterial = opts.material ?? p.trim;
  const soffitMaterial = opts.soffitMaterial ?? p.shadow;
  const out = [];

  let edges = opts.edges;
  if (!Array.isArray(edges)) {
    const src = edges && typeof edges === 'object' ? edges : opts;
    const w = src.w ?? ctx.env.bodyW;
    const d = src.d ?? ctx.env.bodyD;
    const x = src.x ?? 0;
    const z = src.z ?? (ctx.env.frontZ - d / 2);
    const y = src.y ?? (ctx.env.floorY + ctx.env.wallH);
    edges = [
      { from: [x - w / 2, y, z + d / 2], to: [x + w / 2, y, z + d / 2], outward: [0, 0, 1] },
      { from: [x + w / 2, y, z - d / 2], to: [x - w / 2, y, z - d / 2], outward: [0, 0, -1] },
      { from: [x + w / 2, y, z + d / 2], to: [x + w / 2, y, z - d / 2], outward: [1, 0, 0] },
      { from: [x - w / 2, y, z - d / 2], to: [x - w / 2, y, z + d / 2], outward: [-1, 0, 0] },
    ];
  }

  for (const [i, e] of edges.entries()) {
    const a = e.from; const b = e.to;
    const dir = vsub(b, a);
    const len = vlen(dir);
    if (len < 0.05) continue;
    const outward = vnorm(e.outward ?? vnorm(vcross([0, 1, 0], dir)));
    const ext = e.extend ?? 0;
    const p0 = vadd(a, vmul(vnorm(dir), -ext));
    const p1 = vadd(b, vmul(vnorm(dir), ext));
    // Fascia — the face hangs BELOW the eave line so the roof edge sits on top of it.
    const fasciaMid = vadd(
      vlerp(p0, p1, 0.5),
      vadd(vmul(outward, fasciaThickness / 2), [0, -fasciaDepth / 2, 0]),
    );
    const g = barAlong(
      vadd(fasciaMid, vmul(vnorm(dir), -(vlen(vsub(p1, p0)) / 2))),
      vadd(fasciaMid, vmul(vnorm(dir), vlen(vsub(p1, p0)) / 2)),
      fasciaThickness, fasciaDepth, `eave-fascia-${i}`,
    );
    if (g) out.push(part(g, fasciaMaterial));
    if (wantSoffit && overhang > 0.05) {
      const soffitY = -fasciaDepth + KIT_METRICS.soffitThickness;
      const inset = overhang + 0.14;
      const sMid = vadd(vlerp(p0, p1, 0.5), [0, soffitY, 0]);
      const centre = vadd(sMid, vmul(outward, -inset / 2 + fasciaThickness / 2));
      const a0 = vmul(vnorm(dir), vlen(vsub(p1, p0)) / 2);
      const a1 = vmul(outward, inset / 2);
      const a2 = [0, KIT_METRICS.soffitThickness / 2, 0];
      const rh = vdot(vcross(a0, a1), a2) > 0
        ? frameBox(centre, a0, a1, a2, `eave-soffit-${i}`)
        : frameBox(centre, a1, a0, a2, `eave-soffit-${i}`);
      out.push(part(rh, soffitMaterial));
    }
  }
  return out;
}

/* ══════════════════════════════════════ 5. the roofs ═════════════════════════════════════ */

/** Plane record used by `roofIntersection` and by `chimney`'s through-roof solve. */
function planeOf(pointOnPlane, normal) {
  const n = vnorm(normal);
  return { n, h: vdot(n, pointOnPlane) };
}

function ridgeCap(ctx, p0, p1, covering, material, name) {
  if (covering === 'tile') {
    // A barrel capping, half sunk into the roof: the chunky round ridge every mp tile plate has.
    const len = vlen(vsub(p1, p0));
    const mid = vlerp(p0, p1, 0.5);
    const dir = vnorm(vsub(p1, p0));
    const g = new THREE.CylinderGeometry(
      KIT_METRICS.ridgeCapWidth / 2, KIT_METRICS.ridgeCapWidth / 2, len, 8, 1, false,
    );
    g.rotateZ(Math.PI / 2);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(dir[0], dir[1], dir[2]),
    );
    g.applyQuaternion(q);
    g.translate(mid[0], mid[1] + KIT_METRICS.ridgeCapRise * 0.35, mid[2]);
    g.computeVertexNormals();
    g.name = name;
    return part(g, material);
  }
  const g = barAlong(
    vadd(p0, [0, KIT_METRICS.ridgeCapRise * 0.4, 0]),
    vadd(p1, [0, KIT_METRICS.ridgeCapRise * 0.4, 0]),
    KIT_METRICS.ridgeCapWidth, KIT_METRICS.ridgeCapRise, name,
  );
  return g ? part(g, material) : null;
}

/**
 * A hipped roof. Springs from `springY` — the datum, not a local zero — and overhangs the plan
 * by `overhang` on all four sides.
 *
 * Returns Part[] with `.form`: plan, spring height, rise, the plane set, the eave lines and a
 * `heightAt(x, z)` solver, all of which `roofIntersection`, `chimney` and DETAIL read.
 */
export function hipRoof(ctx, opts = {}) {
  const { env, p } = ctx;
  const w = opts.w ?? env.bodyW;
  const d = opts.d ?? env.bodyD;
  const x = opts.x ?? 0;
  const z = opts.z ?? (env.frontZ - d / 2);
  const springY = opts.springY ?? (env.floorY + env.wallH);
  const pitch = (opts.pitch ?? KIT_METRICS.pitchDeg[ctx.id] ?? 30) * DEG;
  const overhang = opts.overhang ?? KIT_METRICS.overhang[ctx.id] ?? 0.5;
  const material = opts.material ?? p.roof;
  const covering = coveringOf(ctx, opts.covering);
  const W = w + overhang * 2;
  const D = d + overhang * 2;
  const rise = Math.tan(pitch) * (D / 2);
  const ridgeY = springY + rise;
  const ridgeLen = Math.max(W * 0.12, Math.min(opts.ridgeLen ?? (W - D), W * 0.94));
  const rl = ridgeLen / 2;
  const hw = W / 2; const hd = D / 2;
  const interior = [x, springY - 1.5, z];
  const out = [];

  const eL = (sx, sz) => [x + sx * hw, springY, z + sz * hd];
  const rP = (sx) => [x + sx * rl, ridgeY, z];

  const faces = [
    { c: [eL(-1, 1), eL(1, 1), rP(1), rP(-1)], n: 'front' },
    { c: [eL(1, -1), eL(-1, -1), rP(-1), rP(1)], n: 'back' },
    { c: [eL(1, 1), eL(1, -1), rP(1), rP(1)], n: 'right' },
    { c: [eL(-1, -1), eL(-1, 1), rP(-1), rP(-1)], n: 'left' },
  ];
  for (const f of faces) {
    const g = roofFace(ctx, f.c, covering, `hip-pitch-${f.n}`, interior, opts.tileCourseStep);
    if (g) out.push(part(g, material));
  }

  // Ridge and the four hip arrises. A hip that is only a crease in a skin does not read as one.
  const rc = ridgeCap(ctx, rP(-1), rP(1), covering, material, 'hip-ridge-cap');
  if (rc) out.push(rc);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
    const g = barAlong(eL(sx, sz), rP(sx), KIT_METRICS.hipCapWidth, KIT_METRICS.hipCapRise,
      `hip-arris-${sx}-${sz}`);
    if (g) out.push(part(g, material));
  }

  // Soffit: one plane at the spring line closing the roof from below, 20 mm clear of the wall
  // plate so nothing z-fights.
  out.push(part(
    slab(W, 0.05, D, x, springY - 0.07, z, 'hip-soffit-plane'), opts.soffitMaterial ?? p.shadow,
  ));

  if (opts.fascia !== false) {
    out.push(...eaves(ctx, {
      w: W, d: D, x, z, y: springY,
      overhang,
      material: opts.fasciaMaterial ?? p.trim,
      fasciaDepth: opts.roofFasciaDepth, fasciaThickness: opts.roofFasciaThickness,
      soffitMaterial: opts.soffitMaterial ?? p.shadow,
      soffit: opts.soffit !== false,
    }));
  }

  const run = (W - ridgeLen) / 2;
  const dz = rise / (D / 2);
  const dx = run > 1e-4 ? rise / run : Infinity;
  const planes = [
    // ±Z pitches: y falls by `rise` over D/2, so n ∝ (0, D/2, ±rise).
    planeOf(eL(0, 1), [0, D / 2, rise]),
    planeOf(eL(0, -1), [0, D / 2, -rise]),
  ];
  if (run > 1e-4) {
    // ±X hips: y falls by `rise` over `run`, so n ∝ (±rise, run, 0).
    planes.push(planeOf(eL(1, 0), [rise, run, 0]));
    planes.push(planeOf(eL(-1, 0), [-rise, run, 0]));
  }
  out.form = Object.freeze({
    kind: 'hip',
    plan: { w: W, d: D, x, z },
    springY,
    ridgeY,
    rise,
    pitch,
    overhang,
    covering,
    ridge: { from: rP(-1), to: rP(1) },
    eaveLines: [
      { from: eL(-1, 1), to: eL(1, 1), outward: [0, 0, 1] },
      { from: eL(1, -1), to: eL(-1, -1), outward: [0, 0, -1] },
      { from: eL(1, 1), to: eL(1, -1), outward: [1, 0, 0] },
      { from: eL(-1, -1), to: eL(-1, 1), outward: [-1, 0, 0] },
    ],
    planes,
    heightAt(px, pz) {
      const ax = Math.abs(px - x); const az = Math.abs(pz - z);
      if (ax > hw || az > hd) return null;
      let y = springY + (hd - az) * dz;
      if (Number.isFinite(dx) && ax > rl) y = Math.min(y, springY + (hw - ax) * dx);
      return Math.min(y, ridgeY);
    },
  });
  return out;
}

/**
 * A gabled roof. `ridgeAxis` is 'x' (pitches face ±Z, gable ends at ±X) or 'z'.
 *
 * The gable END is emitted as a wall panel inset behind the rake, because in every one of these
 * four buildings the gable face is a WALL standing in the gable — shingles, strapwork or
 * battens go on it — and not a continuation of the roof skin.
 */
export function gableRoof(ctx, opts = {}) {
  const { env, p } = ctx;
  const w = opts.w ?? env.bodyW;
  const d = opts.d ?? env.bodyD;
  const x = opts.x ?? 0;
  const z = opts.z ?? (env.frontZ - d / 2);
  const springY = opts.springY ?? (env.floorY + env.wallH);
  const pitch = (opts.pitch ?? KIT_METRICS.pitchDeg[ctx.id] ?? 30) * DEG;
  const overhang = opts.overhang ?? KIT_METRICS.overhang[ctx.id] ?? 0.5;
  const material = opts.material ?? p.roof;
  const covering = coveringOf(ctx, opts.covering);
  const axis = opts.ridgeAxis === 'z' ? 'z' : 'x';
  const rakeOver = opts.rakeOverhang ?? overhang;

  // Work in (a = along the ridge, b = across the span), then map to world.
  const A = (axis === 'x' ? w : d) + rakeOver * 2;
  const B = (axis === 'x' ? d : w) + overhang * 2;
  const rise = Math.tan(pitch) * (B / 2);
  const ridgeY = springY + rise;
  const m = axis === 'x'
    ? (a, y, b) => [x + a, y, z + b]
    : (a, y, b) => [x + b, y, z + a];
  const ha = A / 2; const hb = B / 2;
  const interior = [x, springY - 1.5, z];
  const out = [];

  const faces = [
    [m(-ha, springY, hb), m(ha, springY, hb), m(ha, ridgeY, 0), m(-ha, ridgeY, 0)],
    [m(ha, springY, -hb), m(-ha, springY, -hb), m(-ha, ridgeY, 0), m(ha, ridgeY, 0)],
  ];
  for (const [i, c] of faces.entries()) {
    const g = roofFace(ctx, c, covering, `gable-pitch-${i}`, interior, opts.tileCourseStep);
    if (g) out.push(part(g, material));
  }

  const rc = ridgeCap(ctx, m(-ha, ridgeY, 0), m(ha, ridgeY, 0), covering, material,
    'gable-ridge-cap');
  if (rc) out.push(rc);

  // Soffit plane.
  out.push(part(
    axis === 'x'
      ? slab(A, 0.05, B, x, springY - 0.07, z, 'gable-soffit-plane')
      : slab(B, 0.05, A, x, springY - 0.07, z, 'gable-soffit-plane'),
    opts.soffitMaterial ?? p.shadow,
  ));

  // Eave fascias on the two long sides only — the gable ends take barge boards instead.
  if (opts.fascia !== false) {
    out.push(...eaves(ctx, {
      edges: [
        { from: m(-ha, springY, hb), to: m(ha, springY, hb), outward: axis === 'x' ? [0, 0, 1] : [1, 0, 0] },
        { from: m(ha, springY, -hb), to: m(-ha, springY, -hb), outward: axis === 'x' ? [0, 0, -1] : [-1, 0, 0] },
      ],
      overhang,
      material: opts.fasciaMaterial ?? p.trim,
      fasciaDepth: opts.roofFasciaDepth, fasciaThickness: opts.roofFasciaThickness,
      soffitMaterial: opts.soffitMaterial ?? p.shadow,
      soffit: opts.soffit !== false,
    }));
  }

  // Barge boards on both rakes — the heaviest member on the frontage in every mp plate.
  //
  // `gableEnds` used to drive the barge, the apex block AND the closing panel together, so a
  // cross gable dying into a larger roof could have a barge only at its visible end or a panel
  // at both, never one of each. B-CALI and B-BAY both reported it and neither could fix it.
  // The three are now separable:
  //
  //   gableEnds   — unchanged, and still the only thing a simple caller needs
  //   bargeEnds   — which ends get a barge board and apex block (defaults to gableEnds)
  //   panelEnds   — which ends get a closing panel (defaults to BOTH, always)
  //
  // The panel default is deliberately NOT gableEnds. An open triangle is wrong in every case,
  // and a panel at a buried end costs one triangle and cannot be seen; a missing one is a hole
  // in the building from any camera that gets behind it. `gableEnd: false` still suppresses
  // every panel for a caller that genuinely wants the opening.
  const ends = opts.gableEnds ?? [-1, 1];
  const bargeEnds = opts.bargeEnds ?? ends;
  const panelEnds = opts.panelEnds ?? [-1, 1];
  const bargeD = opts.bargeDepth ?? KIT_METRICS.bargeDepth;
  const bargeT = opts.bargeThickness ?? KIT_METRICS.bargeThickness;
  for (const sgn of bargeEnds) {
    const aPos = sgn * ha;
    for (const sb of [-1, 1]) {
      const g = barAlong(
        m(aPos, springY - bargeD * 0.45, sb * hb),
        m(aPos, ridgeY - bargeD * 0.45, 0),
        bargeT, bargeD, `gable-barge-${sgn}-${sb}`,
      );
      if (g) out.push(part(g, opts.bargeMaterial ?? p.trim));
    }
    // apex block where the two rakes meet, so the barge does not die in a point
    out.push(part(
      box(bargeT * 1.5, bargeD * 1.1, bargeT * 1.5,
        ...m(aPos, ridgeY - bargeD * 0.3, 0), `gable-apex-block-${sgn}`),
      opts.bargeMaterial ?? p.trim,
    ));
  }

  // The gable panel: a wall standing in the gable, inset so the barge stands proud of it.
  if (opts.gableEnd !== false) {
    const inset = opts.gablePanelInset ?? 0.16;
    const panelMat = opts.gablePanelMaterial ?? p.wall;
    const rakeSoffitMat = opts.rakeSoffitMaterial ?? p.shadow;
    for (const sgn of panelEnds) {
      const aPos = sgn * (ha - inset);
      const s = soup(`gable-panel-${sgn}`);
      const nOut = axis === 'x' ? [sgn, 0, 0] : [0, 0, sgn];
      // The panel spans the full rake, eave corner to eave corner, so the roof edge lands on it
      // rather than on a gap. Its bottom edge is what DETAIL's belt / shingle courses sit above.
      const bl = m(aPos, springY, -hb + 0.02);
      const br = m(aPos, springY, hb - 0.02);
      const ap = m(aPos, ridgeY - 0.06, 0);
      // METRIC uv. This panel is exactly the short-span case the normalised mapping got wrong:
      // spanning 0..1 here laid the full course count over a 1–2 m rise and turned the
      // weatherboard into a ruled hatch. Now it carries the same course pitch as the walls.
      const panelW = vlen(vsub(br, bl));
      const panelH = ridgeY - 0.06 - springY;
      s.tri(
        bl, br, ap,
        [0, 0], [uvM(panelW), 0], [uvM(panelW / 2), uvM(panelH)],
        nOut,
      );
      out.push(part(s.build(), panelMat));

      // THE RAKE SOFFIT. The panel stands `inset` behind the rake plane, so the roof overhangs
      // it by that much along both rakes — and nothing lined the underside. A 0.50 rake inset
      // left a 0.50-deep channel open along each rake, bounded by the barge outboard, the panel
      // inboard and the roof skin above, with no floor: the barge then reads as a stick in
      // front of a dark slot, which is what "floating in front of nothing" is. Two quads per
      // rake close it — the lining and the cap at its eave end.
      if (opts.rakeSoffit !== false && inset > 0.02) {
        const drop = bargeD * 0.30;
        const s2 = soup(`gable-rake-soffit-${sgn}`);
        const nb = (sb) => (axis === 'x' ? [0, 0, sb] : [sb, 0, 0]);
        for (const sb of [-1, 1]) {
          const oEave = m(sgn * ha, springY - drop, sb * hb);
          const oApex = m(sgn * ha, ridgeY - drop, 0);
          const iEave = m(aPos, springY - drop, sb * hb);
          const iApex = m(aPos, ridgeY - drop, 0);
          s2.quad(oEave, oApex, iApex, iEave,
            [0, 0], [1, 0], [1, 1], [0, 1], [0, -1, 0]);
          s2.quad(
            oEave, iEave, vadd(iEave, [0, drop, 0]), vadd(oEave, [0, drop, 0]),
            [0, 0], [1, 0], [1, 1], [0, 1], nb(sb),
          );
        }
        out.push(part(s2.build(), rakeSoffitMat));
      }
    }
  }

  const dbz = rise / (B / 2);
  out.form = Object.freeze({
    kind: 'gable',
    axis,
    plan: axis === 'x' ? { w: A, d: B, x, z } : { w: B, d: A, x, z },
    springY,
    ridgeY,
    rise,
    pitch,
    overhang,
    covering,
    ridge: { from: m(-ha, ridgeY, 0), to: m(ha, ridgeY, 0) },
    eaveLines: [
      { from: m(-ha, springY, hb), to: m(ha, springY, hb), outward: axis === 'x' ? [0, 0, 1] : [1, 0, 0] },
      { from: m(ha, springY, -hb), to: m(-ha, springY, -hb), outward: axis === 'x' ? [0, 0, -1] : [-1, 0, 0] },
    ],
    rakes: ends.map((sgn) => ({
      apex: m(sgn * ha, ridgeY, 0),
      left: m(sgn * ha, springY, -hb),
      right: m(sgn * ha, springY, hb),
    })),
    planes: [
      planeOf(m(0, springY, hb), axis === 'x' ? [0, B / 2, rise] : [rise, B / 2, 0]),
      planeOf(m(0, springY, -hb), axis === 'x' ? [0, B / 2, -rise] : [-rise, B / 2, 0]),
    ],
    heightAt(px, pz) {
      const a = axis === 'x' ? px - x : pz - z;
      const b = axis === 'x' ? pz - z : px - x;
      if (Math.abs(a) > ha || Math.abs(b) > hb) return null;
      return springY + (hb - Math.abs(b)) * dbz;
    },
  });
  return out;
}

/**
 * The bullnose verandah roof — the cottage's signature, and the thing the baseline lost by
 * drawing a flat skillion there.
 *
 * The profile is a short straight fall from the wall, then a quarter-circle of `drop` radius
 * carried 10° past vertical so the front edge tucks under. The corrugation rib FOLLOWS THE
 * CURVE rather than stopping at it: the rib is in u (across the width) and the curve is in v.
 * Both ends are capped, because the curve is read in section.
 */
export function bullnoseRoof(ctx, opts = {}) {
  const { env, p } = ctx;
  const w = opts.w ?? env.bodyW * 0.9;
  const x = opts.x ?? 0;
  const zFront = opts.zFront ?? env.frontZ + 2.2;
  const zBack = opts.zBack ?? env.frontZ;
  const springY = opts.springY ?? (env.floorY + env.wallH - 0.35);
  const drop = opts.drop ?? 0.85;
  const material = opts.material ?? p.roof;
  const covering = coveringOf(ctx, opts.covering ?? 'corrugated');
  const segs = Math.max(4, opts.segments ?? KIT_METRICS.bullnoseSegments);
  const sweep = (opts.sweepDeg ?? KIT_METRICS.bullnoseSweepDeg) * DEG;
  const thickness = opts.thickness ?? 0.11;
  const fall = opts.fall ?? 0.16;              // straight run falls 16% before the curve starts
  const depth = Math.max(0.6, zFront - zBack);
  const R = Math.min(drop, depth * 0.55);
  const zCurve = zFront - R * Math.sin(Math.min(sweep, Math.PI / 2));
  const straight = Math.max(0.05, zCurve - zBack);
  const yCurve = springY - straight * fall;
  const out = [];

  // Profile: v = 0 at the wall, v = 1 at the front lip.
  const straightFrac = straight / (straight + R * sweep);
  function profile(v) {
    if (v <= straightFrac) {
      const t = straightFrac < 1e-6 ? 0 : v / straightFrac;
      return {
        z: zBack + straight * t,
        y: springY - straight * fall * t,
        n: vnorm([0, 1, fall]),
      };
    }
    const t = (v - straightFrac) / Math.max(1e-6, 1 - straightFrac);
    const a = sweep * t;
    return {
      z: zCurve + R * Math.sin(a),
      y: yCurve - R * (1 - Math.cos(a)),
      // The `fall * cos(a)` term blends the straight run's normal into the curve's at a = 0, so
      // the rib crest does not kink where the skillion meets the bullnose.
      n: vnorm([0, Math.cos(a), Math.sin(a) + fall * Math.cos(a)]),
    };
  }

  const vs = [{ t: 0, off: 0 }];
  for (let k = 0; k <= segs; k += 1) {
    vs.push({ t: straightFrac + ((1 - straightFrac) * k) / segs, off: 0 });
  }

  const sample = (u, v) => {
    const pr = profile(v);
    return { p: [x - w / 2 + w * u, pr.y, pr.z], n: pr.n };
  };
  // The rib folds in u and the curve lives in v, which is the whole point: the corrugation
  // FOLLOWS the bullnose round rather than stopping where the curve begins.
  const us = covering === 'plain'
    ? flatRows()
    : ribColumns(ribCount(ctx), KIT_METRICS.corrugationRibDepth);

  const top = foldedSurface({ sample, us, vs, name: 'bullnose-skin' });
  if (top) out.push(part(top, material));

  // Underside, unribbed and on shadow: the verandah ceiling reads dark under a lit curve.
  const under = foldedSurface({
    sample: (u, v) => {
      const s = sample(u, v);
      return { p: vadd(s.p, vmul(s.n, -thickness)), n: vmul(s.n, -1) };
    },
    us: flatRows(),
    vs,
    name: 'bullnose-soffit',
  });
  if (under) out.push(part(under, opts.soffitMaterial ?? p.shadow));

  // End caps — the section that makes the curve read as a curve.
  for (const sgn of [-1, 1]) {
    const s = soup(`bullnose-end-${sgn}`);
    const n = [sgn, 0, 0];
    const u = sgn > 0 ? 1 : 0;
    for (let k = 0; k + 1 < vs.length; k += 1) {
      const p0 = sample(u, vs[k].t);
      const p1 = sample(u, vs[k + 1].t);
      const q0 = vadd(p0.p, vmul(p0.n, -thickness));
      const q1 = vadd(p1.p, vmul(p1.n, -thickness));
      s.quad(p0.p, p1.p, q1, q0, [0, 0], [1, 0], [1, 1], [0, 1], n);
    }
    out.push(part(s.build(), opts.endMaterial ?? p.trim));
  }

  // The front lip: a bull-nosed edge bead so the sheet has a visible thickness at the tuck.
  const lipA = sample(0, 1);
  const lipB = sample(1, 1);
  const lip = barAlong(
    vadd(lipA.p, vmul(lipA.n, -thickness / 2)),
    vadd(lipB.p, vmul(lipB.n, -thickness / 2)),
    0.10, thickness * 1.5, 'bullnose-lip',
  );
  if (lip) out.push(part(lip, opts.lipMaterial ?? p.trim));

  const frontLip = sample(0.5, 1);
  out.form = Object.freeze({
    kind: 'bullnose',
    plan: { w, d: depth, x, z: (zFront + zBack) / 2 },
    springY,
    ridgeY: springY,
    covering,
    segments: segs,
    radius: R,
    frontEdge: { y: frontLip.p[1], z: frontLip.p[2] },
    eaveLines: [{ from: lipA.p, to: lipB.p, outward: [0, 0, 1] }],
    heightAt(px, pz) {
      if (Math.abs(px - x) > w / 2 || pz < zBack || pz > zFront) return null;
      let lo = 0; let hi = 1;
      for (let i = 0; i < 24; i += 1) {
        const mid = (lo + hi) / 2;
        if (profile(mid).z < pz) lo = mid; else hi = mid;
      }
      return profile((lo + hi) / 2).y;
    },
  });
  return out;
}

/**
 * A conical roof over a faceted drum — the villa tower.
 *
 * `sides` and `radius` are the DRUM's own, so the cone springs from the drum's diameter plus
 * the eave overhang and not from a square bounding box. Terracotta coursing is modelled as
 * stacked frusta with a proud nose at each course, matching the tile rhythm elsewhere.
 */
export function conicalRoof(ctx, opts = {}) {
  const { env, p } = ctx;
  const radius = opts.radius ?? 1.9;
  const sides = Math.max(3, opts.sides ?? KIT_METRICS.coneSides);
  const x = opts.x ?? 0;
  const z = opts.z ?? env.frontZ - radius;
  const springY = opts.springY ?? (env.floorY + env.wallH);
  const height = opts.height ?? radius * 1.55;
  const overhang = opts.overhang ?? 0.34;
  const material = opts.material ?? p.roof;
  const rot = opts.rotation ?? Math.PI / sides;
  const courses = Math.max(3, opts.courses ?? KIT_METRICS.coneCourses);
  const nose = opts.nose ?? KIT_METRICS.tileCourseStep;
  const R = radius + overhang;
  const out = [];
  const s = soup('cone-skin');

  const ring = (r, y) => {
    const pts = [];
    for (let i = 0; i <= sides; i += 1) {
      const a = rot + (i / sides) * Math.PI * 2;
      pts.push([x + Math.sin(a) * r, y, z + Math.cos(a) * r]);
    }
    return pts;
  };
  const apex = [x, springY + height, z];
  for (let k = 0; k < courses; k += 1) {
    const t0 = k / courses;
    const t1 = (k + 1) / courses;
    const r0 = R * (1 - t0); const r1 = R * (1 - t1);
    const y0 = springY + height * t0; const y1 = springY + height * t1;
    const a0 = ring(r0 + nose, y0);
    const aFlush = ring(r0, y0);
    const a1 = ring(r1, y1);
    for (let i = 0; i < sides; i += 1) {
      const n = vnorm([
        (a0[i][0] + a0[i + 1][0]) / 2 - x, R / Math.max(height, 0.4),
        (a0[i][2] + a0[i + 1][2]) / 2 - z,
      ]);
      s.quad(a0[i], a0[i + 1], a1[i + 1], a1[i],
        [i / sides, t0], [(i + 1) / sides, t0], [(i + 1) / sides, t1], [i / sides, t1], n);
      // the nose underside — this is the shadow that makes a course a course
      s.quad(aFlush[i], a0[i], a0[i + 1], aFlush[i + 1],
        [i / sides, t0], [i / sides, t0], [(i + 1) / sides, t0], [(i + 1) / sides, t0],
        [0, -1, 0]);
    }
  }
  out.push(part(s.build(), material));

  // The eight arrises, capped. An octagonal cone without them is a smooth funnel.
  const base = ring(R, springY);
  for (let i = 0; i < sides; i += 1) {
    const g = barAlong(base[i], apex, KIT_METRICS.hipCapWidth * 0.8,
      KIT_METRICS.hipCapRise * 0.8, `cone-arris-${i}`);
    if (g) out.push(part(g, material));
  }

  // Eave: a fascia ring at the spring line, following the facets.
  if (opts.fascia !== false) {
    const edges = [];
    for (let i = 0; i < sides; i += 1) {
      edges.push({
        from: base[i],
        to: base[i + 1],
        outward: vnorm([
          (base[i][0] + base[i + 1][0]) / 2 - x, 0, (base[i][2] + base[i + 1][2]) / 2 - z,
        ]),
      });
    }
    out.push(...eaves(ctx, {
      edges,
      overhang,
      fasciaDepth: KIT_METRICS.fasciaDepth * 0.8,
      material: opts.fasciaMaterial ?? p.trim,
      soffitMaterial: opts.soffitMaterial ?? p.shadow,
    }));
  }

  out.form = Object.freeze({
    kind: 'cone',
    plan: { w: R * 2, d: R * 2, x, z },
    springY,
    ridgeY: springY + height,
    apex,
    radius: R,
    sides,
    covering: 'tile',
    heightAt(px, pz) {
      const r = Math.hypot(px - x, pz - z);
      if (r > R) return null;
      return springY + height * (1 - r / R);
    },
  });
  return out;
}

/**
 * A skillion — lean-to roofs, window hoods, the back-of-house articulation §2.1 asks for.
 * Not in the contract's required list; it is here because "a rear lean-to" is one of the named
 * ways to stop a flank being a large undifferentiated plane, and every builder needs it.
 */
export function skillionRoof(ctx, opts = {}) {
  const { env, p } = ctx;
  const w = opts.w ?? env.bodyW * 0.5;
  const x = opts.x ?? 0;
  const zHigh = opts.zHigh ?? env.frontZ;
  const zLow = opts.zLow ?? env.frontZ + 1.6;
  const yHigh = opts.yHigh ?? (env.floorY + env.wallH);
  const yLow = opts.yLow ?? (yHigh - 0.55);
  const material = opts.material ?? p.roof;
  const covering = coveringOf(ctx, opts.covering);
  const out = [];
  const corners = [
    [x - w / 2, yLow, zLow], [x + w / 2, yLow, zLow],
    [x + w / 2, yHigh, zHigh], [x - w / 2, yHigh, zHigh],
  ];
  const interior = [x, Math.min(yHigh, yLow) - 1.2, (zHigh + zLow) / 2];
  const g = roofFace(ctx, corners, covering, 'skillion-skin', interior);
  if (g) out.push(part(g, material));
  out.push(part(
    slab(w, 0.05, Math.abs(zLow - zHigh), x, Math.min(yHigh, yLow) - 0.10,
      (zHigh + zLow) / 2, 'skillion-soffit'),
    opts.soffitMaterial ?? p.shadow,
  ));
  if (opts.fascia !== false) {
    out.push(...eaves(ctx, {
      edges: [{
        from: [x - w / 2, yLow, zLow], to: [x + w / 2, yLow, zLow],
        outward: [0, 0, Math.sign(zLow - zHigh) || 1],
      }],
      overhang: 0.16,
      material: opts.fasciaMaterial ?? p.trim,
    }));
  }
  const grad = (yHigh - yLow) / Math.max(1e-4, zLow - zHigh);
  out.form = Object.freeze({
    kind: 'skillion',
    plan: { w, d: Math.abs(zLow - zHigh), x, z: (zHigh + zLow) / 2 },
    springY: Math.min(yHigh, yLow),
    ridgeY: Math.max(yHigh, yLow),
    covering,
    heightAt(px, pz) {
      if (Math.abs(px - x) > w / 2) return null;
      const lo = Math.min(zHigh, zLow); const hi = Math.max(zHigh, zLow);
      if (pz < lo || pz > hi) return null;
      return yHigh + (pz - zHigh) * grad;
    },
  });
  return out;
}

/* ═══════════════════════════════════ 6. roof intersection ════════════════════════════════ */

/** Where two planes meet: direction and a point. Returns null when they are parallel. */
function planePlaneLine(A, B) {
  const dir = vcross(A.n, B.n);
  const dd = vdot(dir, dir);
  if (dd < 1e-9) return null;
  const p = vmul(
    vadd(vmul(vcross(B.n, dir), A.h), vmul(vcross(dir, A.n), B.h)),
    1 / dd,
  );
  return { p, dir: vmul(dir, 1 / Math.sqrt(dd)) };
}

/** Clip a parametric line to an axis-aligned box, returning [tMin, tMax] or null. */
function clipToBox(origin, dir, lo, hi) {
  let tMin = -Infinity; let tMax = Infinity;
  for (let i = 0; i < 3; i += 1) {
    if (Math.abs(dir[i]) < 1e-7) {
      if (origin[i] < lo[i] - 1e-4 || origin[i] > hi[i] + 1e-4) return null;
    } else {
      const t0 = (lo[i] - origin[i]) / dir[i];
      const t1 = (hi[i] - origin[i]) / dir[i];
      tMin = Math.max(tMin, Math.min(t0, t1));
      tMax = Math.min(tMax, Math.max(t0, t1));
    }
  }
  return tMax - tMin > 1e-4 ? [tMin, tMax] : null;
}

const formOf = (x) => (x && x.form ? x.form : x);

/**
 * Real valleys where two roofs meet, and the flashing that closes them.
 *
 * Two roof solids that interpenetrate and leave the intersection to the depth buffer read as
 * exactly that. This solves the plane pair properly, clips the line to the SECONDARY's plan and
 * to the height band between the two spring lines, and lays a lead flashing along it with a
 * shadow gutter under it. The saddle where the secondary ridge dies into the primary plane gets
 * its own flashing so the ridge does not end in mid-air.
 */
export function roofIntersection(ctx, opts = {}) {
  const { p } = ctx;
  const A = formOf(opts.primary);
  const B = formOf(opts.secondary);
  const out = [];
  if (!A || !B || !A.planes || !B.planes) {
    out.valleys = [];
    return out;
  }
  const material = opts.material ?? p.roof;
  const gutterMaterial = opts.gutterMaterial ?? p.shadow;
  const width = opts.width ?? 0.30;
  const lo = [
    B.plan.x - B.plan.w / 2 - 0.02,
    Math.max(A.springY, B.springY) - 0.35,
    B.plan.z - B.plan.d / 2 - 0.02,
  ];
  const hi = [
    B.plan.x + B.plan.w / 2 + 0.02,
    Math.min(A.ridgeY, B.ridgeY) + 0.02,
    B.plan.z + B.plan.d / 2 + 0.02,
  ];
  const valleys = [];
  for (const pa of A.planes) {
    for (const pb of B.planes) {
      const line = planePlaneLine(pa, pb);
      if (!line) continue;
      const range = clipToBox(line.p, line.dir, lo, hi);
      if (!range) continue;
      const q0 = vadd(line.p, vmul(line.dir, range[0]));
      const q1 = vadd(line.p, vmul(line.dir, range[1]));
      if (vlen(vsub(q1, q0)) < 0.45) continue;
      // A valley climbs; a ridge-to-plane saddle is nearly level. Keep the climbers.
      if (Math.abs(q1[1] - q0[1]) < 0.10) continue;
      // Reject lines that do not actually sit on the primary's surface at their midpoint.
      const mid = vlerp(q0, q1, 0.5);
      const onA = A.heightAt ? A.heightAt(mid[0], mid[2]) : null;
      if (onA != null && Math.abs(onA - mid[1]) > 0.30) continue;
      valleys.push([q0, q1]);
    }
  }
  // Deduplicate near-identical segments produced by symmetric plane pairs.
  const kept = [];
  for (const [q0, q1] of valleys) {
    const dup = kept.some(([r0, r1]) => vlen(vsub(q0, r0)) < 0.2 && vlen(vsub(q1, r1)) < 0.2);
    if (!dup) kept.push([q0, q1]);
  }
  // THE FLASHING MUST CLEAR THE MODELLED RELIEF, not just the plane.
  //
  // The valley line is the exact intersection of two roof PLANES — measured on the villa at
  // Δ = 0.00 against `heightAt` at every sample along both segments, so the line itself and its
  // length are right. But the roof SKINS do not lie on their planes: `roofFace` offsets them
  // along the surface normal by the covering's relief, up to +0.075 for a tile course nose and
  // +0.060 for a corrugation crest. A 0.075-thick flashing laid on the plane put its top only
  // 0.034 above the plane while the skin crests reach 0.062 above it, so the flashing sat 0.028
  // too low, every course crest stood proud of it along the whole valley, and the two
  // interpenetrating reliefs showed their raw seam through the gap. That is the tear.
  //
  // Lifting and thickening by the relief closes it; the bar still bites below the plane so no
  // gap opens under it.
  const relief = opts.coveringRelief ?? (A.covering === 'tile'
    ? KIT_METRICS.tileCourseStep
    : (A.covering === 'corrugated' ? KIT_METRICS.corrugationRibDepth : 0));
  const lift = opts.lift ?? (relief * 0.6 + 0.015);
  const flashT = 0.075 + relief;
  for (const [i, [q0, q1]] of kept.entries()) {
    const gutter = barAlong(
      vadd(q0, [0, lift - 0.085, 0]), vadd(q1, [0, lift - 0.085, 0]),
      width * 1.7, 0.08, `valley-gutter-${i}`,
    );
    if (gutter) out.push(part(gutter, gutterMaterial));
    const g = barAlong(
      vadd(q0, [0, lift, 0]), vadd(q1, [0, lift, 0]),
      width * 1.13, flashT, `valley-flashing-${i}`,
    );
    if (g) out.push(part(g, material));
  }
  // Saddle flashing where the secondary ridge meets the primary plane.
  if (B.ridge && A.heightAt) {
    for (const end of [B.ridge.from, B.ridge.to]) {
      const y = A.heightAt(end[0], end[2]);
      if (y == null) continue;
      if (Math.abs(y - end[1]) > 1.6) continue;
      // Same correction as the flashing: the saddle sat 0.042 under the skin's course crests.
      out.push(part(
        box(width * 2.2, 0.14 + relief, width * 2.2,
          end[0], Math.max(y, end[1]) - 0.05 + lift, end[2], 'valley-saddle'),
        material,
      ));
    }
  }
  out.valleys = kept;
  return out;
}

/* ═══════════════════════════════ 7. verandah and porch frames ════════════════════════════ */

/** Post anchors for a verandah of this footprint, so DETAIL can seat turned posts on them. */
export function verandahPostAnchors({ x, z, w, d, count }) {
  const n = Math.max(2, count ?? Math.round(w / 2.6) + 1);
  const anchors = [];
  const zFront = z + d / 2;
  for (let i = 0; i < n; i += 1) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    anchors.push({ x: x - w / 2 + w * t, z: zFront - 0.22, index: i });
  }
  return anchors;
}

/**
 * The verandah / porch structural system: deck, bearer, posts, beam, head plate and ceiling.
 *
 * `posts` is a count, or an array of x positions, or `false`. Plain square posts are emitted by
 * default; a builder using DETAIL's `turnedPost` or `taperedPier` passes `postStyle: 'none'`
 * and reads `.anchors` off the return.
 */
export function verandahFrame(ctx, opts = {}) {
  const { env, p } = ctx;
  const w = opts.w ?? env.bodyW * 0.8;
  const d = opts.d ?? 2.3;
  const x = opts.x ?? 0;
  const z = opts.z ?? (env.frontZ + d / 2);
  const floorY = opts.floorY ?? env.floorY;
  const beamY = opts.beamY ?? (env.floorY + env.wallH - 0.30);
  const beamDepth = opts.beamDepth ?? KIT_METRICS.beamDepth;
  const beamThickness = opts.beamThickness ?? KIT_METRICS.beamThickness;
  const postStyle = opts.postStyle ?? 'plain';
  const out = [];
  const zFront = z + d / 2;

  // Deck. Timber boards over a bearer; the bearer's shadow is what stops the deck floating.
  if (opts.deck !== false) {
    out.push(part(
      slab(w, KIT_METRICS.deckThickness, d, x, floorY - KIT_METRICS.deckThickness, z,
        'verandah-deck'),
      opts.deckMaterial ?? p.timber,
    ));
    for (const g of bandRing(w, d, x, z, floorY - KIT_METRICS.deckThickness - 0.19, 0.19, 0.045,
      'verandah-bearer')) out.push(part(g, opts.bearerMaterial ?? p.trim));
    // The dark void under the deck, from the lot plate up to the bearer.
    const voidTop = floorY - KIT_METRICS.deckThickness - 0.19;
    if (voidTop > 0.12) {
      out.push(part(
        slab(w - 0.10, voidTop - 0.02, d - 0.10, x, 0.02, z, 'verandah-underfloor'),
        p.shadow,
      ));
    }
  }

  // Beam across the front, and returns down each side.
  const beamCentreY = beamY + beamDepth / 2;
  out.push(part(
    box(w + beamThickness, beamDepth, beamThickness, x, beamCentreY, zFront - beamThickness / 2,
      'verandah-beam-front'),
    opts.beamMaterial ?? p.trim,
  ));
  if (opts.returns !== false) {
    for (const sgn of [-1, 1]) {
      out.push(part(
        box(beamThickness, beamDepth, d, x + sgn * (w / 2 - beamThickness / 2), beamCentreY, z,
          `verandah-beam-return-${sgn}`),
        opts.beamMaterial ?? p.trim,
      ));
    }
  }
  // Head plate against the wall, so the roof has something to land on at the back.
  out.push(part(
    box(w, beamDepth * 0.6, beamThickness * 0.7, x, beamCentreY, z - d / 2 + 0.08,
      'verandah-head-plate'),
    opts.beamMaterial ?? p.trim,
  ));

  // Ceiling — the shadow that makes a recessed verandah read as recessed.
  if (opts.ceiling !== false) {
    out.push(part(
      slab(w - beamThickness * 1.4, 0.07, d - beamThickness, x, beamY + beamDepth - 0.09, z,
        'verandah-ceiling'),
      opts.ceilingMaterial ?? p.shadow,
    ));
  }

  const anchors = Array.isArray(opts.posts)
    ? opts.posts.map((px, i) => ({ x: px, z: zFront - 0.22, index: i }))
    : verandahPostAnchors({
      x, z, w, d, count: typeof opts.posts === 'number' ? opts.posts : undefined,
    });

  if (postStyle !== 'none' && opts.posts !== false) {
    const size = opts.postSize ?? KIT_METRICS.postSize;
    for (const a of anchors) {
      out.push(part(
        slab(size, beamY - floorY, size, a.x, floorY, a.z, `verandah-post-${a.index}`),
        opts.postMaterial ?? p.trim,
      ));
      // capital and base blocks, oversized — a plain stick reads as a scratched line
      out.push(part(
        slab(size * 1.55, 0.16, size * 1.55, a.x, beamY - 0.16, a.z, `verandah-post-cap-${a.index}`),
        opts.postMaterial ?? p.trim,
      ));
      out.push(part(
        slab(size * 1.7, 0.20, size * 1.7, a.x, floorY, a.z, `verandah-post-base-${a.index}`),
        opts.postMaterial ?? p.trim,
      ));
    }
  }

  out.anchors = anchors;
  out.frame = Object.freeze({
    x, z, w, d, floorY, beamY,
    beamTopY: beamY + beamDepth,
    zFront,
    zBack: z - d / 2,
    beamDepth,
    beamThickness,
  });
  return out;
}

/* ═════════════════════════════════════ 8. the chimney ════════════════════════════════════ */

/**
 * A chimney shaft that PASSES THROUGH the roof plane.
 *
 * The shaft is continuous from `base` to `top`; where a roof form is supplied as `throughRoof`
 * the surface height is solved at the shaft's own plan position and a flashing apron plus a
 * shadow gusset are laid at that height, so the shaft interrupts the roof instead of floating
 * inside it, perching on it, or stopping under an eave.
 *
 * `breast: {face, wall}` adds a chimney breast down the flank — one of the named ways §2.1
 * allows a blank elevation to be articulated.
 */
export function chimney(ctx, opts = {}) {
  const { env, p } = ctx;
  const x = opts.x ?? 0;
  const z = opts.z ?? (env.frontZ - env.bodyD * 0.6);
  const base = opts.base ?? 0;
  const w = opts.w ?? 1.05;
  const d = opts.d ?? 0.78;
  const material = opts.material ?? p.wallAlt;
  const roof = formOf(opts.throughRoof);
  const roofY = roof && roof.heightAt ? roof.heightAt(x, z) : null;
  const top = opts.top ?? (roofY != null
    ? roofY + Math.max(1.15, (roof.ridgeY - roofY) + 0.85)
    : env.floorY + env.wallH + 2.2);
  const out = [];
  const notes = [];

  out.push(part(slab(w, top - base, d, x, base, z, 'chimney-shaft'), material));

  // Corbel: two brick courses stepping out under DETAIL's cap.
  const corbel = KIT_METRICS.chimneyCorbel;
  for (const g of bandRing(w, d, x, z, top - 0.46, 0.14, corbel * 0.7, 'chimney-corbel-1')) {
    out.push(part(g, material));
  }
  for (const g of bandRing(w, d, x, z, top - 0.32, 0.16, corbel * 1.35, 'chimney-corbel-2')) {
    out.push(part(g, material));
  }

  if (roofY != null) {
    if (roofY <= base + 0.05) notes.push('roof surface at or below the shaft base');
    if (top < roofY + 0.55) notes.push('shaft head is less than 0.55 above the roof surface');
    // Flashing apron and the shadow gusset that reads as a cut in the plane.
    for (const g of bandRing(w, d, x, z, roofY - 0.06, 0.26, 0.11, 'chimney-flashing')) {
      out.push(part(g, opts.flashingMaterial ?? p.roof));
    }
    for (const g of bandRing(w, d, x, z, roofY - 0.12, 0.07, 0.17, 'chimney-gusset')) {
      out.push(part(g, p.shadow));
    }
    // Back gutter on the up-slope side.
    const upslope = roof.ridge
      ? Math.sign(((roof.ridge.from[2] + roof.ridge.to[2]) / 2) - z) || -1
      : -1;
    out.push(part(
      box(w + 0.22, 0.10, 0.30, x, roofY + 0.10, z + upslope * (d / 2 + 0.16),
        'chimney-back-gutter'),
      opts.flashingMaterial ?? p.roof,
    ));
  } else if (opts.throughRoof) {
    notes.push('throughRoof supplied but the shaft plan position is outside that roof');
  }

  if (opts.breast) {
    const bw = opts.breast.w ?? w * 1.35;
    const bd = opts.breast.d ?? 0.34;
    const bTop = opts.breast.top ?? (env.floorY + env.wallH);
    const bz = opts.breast.z ?? z + (d / 2 + bd / 2) * (opts.breast.sign ?? 1);
    out.push(part(slab(bw, bTop - base, bd, opts.breast.x ?? x, base, bz, 'chimney-breast'),
      material));
    out.push(part(
      slab(bw + 0.16, 0.14, bd + 0.10, opts.breast.x ?? x, bTop - 0.14, bz,
        'chimney-breast-shoulder'),
      opts.shoulderMaterial ?? p.trim,
    ));
  }

  out.shaft = Object.freeze({
    x, z, w, d, base, top, roofY, headY: top, notes: Object.freeze(notes),
  });
  if (notes.length) out.warning = notes.join('; ');
  return out;
}

/* ══════════════════════════════════════ diagnostics ══════════════════════════════════════ */

/**
 * Count triangles in a Part[]. Used by the seat's own bench and available to a critic that
 * wants a number without loading the board.
 */
export function countTriangles(parts) {
  let n = 0;
  for (const item of parts ?? []) {
    const g = item?.geometry;
    if (!g) continue;
    n += g.index ? g.index.count / 3 : (g.attributes?.position?.count ?? 0) / 3;
  }
  return n;
}

/** A stable per-call salt inside this module's range (1000–1199), for repeated components. */
export function kitSalt(name, index = 0) {
  return salted(hash32(`kit|${name}`) + index * 7);
}
