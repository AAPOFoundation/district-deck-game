import { clusterCanopyPart } from '../../foliage.js';
// District Deck V3.40 — seat GARDEN.  The lot: plate, lawn, beds, path, steps, boundary, gate,
// planting, street tree, letterbox, services, kerb and footpath.
//
// Governing spec:  docs/next-phase/V340-RESIDENTIAL-HOUSES-FROM-SCRATCH-SPEC.md
// Module contract: ./CONTRACT.md §6 — the nine exports below are fixed and this file adds none.
//
// Why this file is written the way it is.  Beside the Monopoly-Plus plates the V3.40 baseline
// loses the blind pair on the LOT, before a critic has reached the building: a small house
// marooned on a wide navy slab carrying a road and a footpath, with a handful of thin isolated
// blobs for a garden.  Every reference lot is a saturated green tile with a crisp dark chamfered
// edge, the building filling about four fifths of it, dense rounded shrub masses standing in real
// dark beds, and the street band reduced to a narrow strip at one edge.  Every number below is
// chosen against that reading, and the widened envelope fractions in `index.js` mean the margins
// here assume a BIG building — the front yard on the villa and the Californian is about one board
// unit deep, not four.
//
// Datum (CONTRACT.md §3): the top face of the lot plate is y = 0.  Lawn, path, footpath and bed
// soil sit on it; the plate body and its chamfer hang below it.  Nothing here invents a datum.
//
// Materials (CONTRACT.md §4), and this module mints none of them:
//   shadow   plate body, chamfer, bed soil, bluestone kerb, tree pits
//   garden   lawn, shrub masses, hedges, grass tufts
//   trim     path, steps, footpath, wall capping, pier caps, pickets, meter box, flower accents
//   wallAlt  masonry: front wall, piers, brick path edging, letterbox body
//   joinery  fence posts and rails, palisade bars, the gate leaf, bins
//   timber   tree trunks, the letterbox post
// Six of the nine buckets; `wall`, `roof` and `glass` belong to the building.  No tenth bucket.
//
// Alignment note for the four archetype seats: `boundary`, `gate`, `path` and `letterbox` share
// one axis.  Pass the SAME `x` to all four (the front door's x), or pass none to all four and
// take the per-archetype default.  Mixing the two is the one way to get a gate that does not line
// up with its own path.
//
// Determinism: every jitter comes from `ctx.v` on salts 1600–1799 and nowhere else.

import * as THREE from 'three';
import { box, slab, rotBox, cyl, taper, ball } from '../core.js';

/* ─────────────────────────────── lot constants, in board units ─────────────────────────── */

/** Chamfer inset in plan.  The dark rim that makes the plate read as a board tile. */
const RIM = 0.30;
/** Chamfer fall.  0.30 across / 0.24 down ≈ 39°, which catches a highlight at board altitude. */
const RIM_FALL = 0.24;
/** Plate thickness below the lawn. */
const PLATE_H = 0.52;
/** Street band depth.  Present, and deliberately subordinate: 5% of the plate, on one edge. */
const FOOTPATH_D = 0.78;
/** Lawn edge → boundary centre line.  Members are ≤0.22 half-thick so their outer face is flush. */
const BOUNDARY_INSET = 0.22;
/** Clear gate opening. */
const GATE_W = 1.30;
/**
 * Containment margin.  NOTHING this module emits, other than the plate body and its chamfer —
 * which ARE the edge — may come closer than this to the lot boundary at ±lotW/2.
 *
 * Found the hard way: the street tree's canopy was sailing 0.38 past the street edge over empty
 * backdrop, and side- and rear-bed shrub lobes could reach 0.13 past the lateral edges. Every
 * Monopoly-Plus reference plate is a self-contained tile with nothing crossing its chamfer, and
 * an overhang also inflates the lab's fit box so the building gets framed smaller to accommodate
 * foliage hanging over nothing — which works directly against the finding this seat exists to
 * close.
 */
const PLATE_MARGIN = 0.12;

/**
 * Default path / gate axis per archetype, as a fraction of the body half-width.  Overridden by
 * the archetype seat passing the real door x; these only have to be plausible on their own.
 */
const DEFAULT_PATH_F = Object.freeze({
  'bungalow-californian': 0.00,   // porch across most of the frontage, door central
  'bungalow-brighton': -0.42,     // entry porch to one side, bay window to the other
  'heritage-federation-villa': -0.36, // entry beside the corner tower
  'cottage-federation': 0.32,     // verandah beside the projecting front room
});

/** Boundary treatment per archetype.  This is an identity cue, not a generic fence. */
const BOUNDARY_STYLE = Object.freeze({
  'cottage-federation': 'picket',
  'bungalow-californian': 'brick-wall',
  'bungalow-brighton': 'brick-hedge',
  'heritage-federation-villa': 'pier-palisade',
});

/**
 * Half-width of the post or pier that terminates a run at the gate.  The boundary's runs stop
 * this far OUTSIDE the opening so that `GATE_W` is a CLEAR opening in every style — otherwise a
 * 0.48 brick pier eats a quarter of it from each side and the gate leaf is modelled inside its
 * own pier, which is 24 triangles that nobody ever sees.
 */
const STYLE_END_HALF = Object.freeze({
  picket: 0.09,
  'brick-wall': 0.24,
  'brick-hedge': 0.22,
  'pier-palisade': 0.26,
});

/**
 * Quality tiers.  Planting is where this lane can spend 8 000 triangles without noticing.
 *
 * `hedgeStep` is the extrusion station spacing along a hedge run and `hedgeArc` the number of
 * intermediate points in its top arris — two levers that between them set the whole cost of the
 * clipped hedge, which is otherwise the most expensive thing on a Brighton lot.
 */
const TIER = Object.freeze({
  high: {
    lobes: 3, seg: 8, clusters: 15, picketPitch: 0.32, palisadePitch: 0.30, heads: true,
    hedgeStep: 0.42, hedgeArc: 2, hedgeSwell: 1.00,
  },
  mid: {
    lobes: 2, seg: 6, clusters: 9, picketPitch: 0.38, palisadePitch: 0.36, heads: true,
    hedgeStep: 0.62, hedgeArc: 1, hedgeSwell: 0.80,
  },
  low: {
    lobes: 1, seg: 5, clusters: 5, picketPitch: 0.46, palisadePitch: 0.44, heads: false,
    hedgeStep: 0.95, hedgeArc: 0, hedgeSwell: 0.55,
  },
});

/* ────────────────────────────────────── small helpers ──────────────────────────────────── */

function clamp(x, lo, hi) {
  return x < lo ? lo : (x > hi ? hi : x);
}

/** @returns {{geometry: THREE.BufferGeometry, material: THREE.Material}} */
function mk(geometry, material) {
  return { geometry, material };
}

/**
 * Keep a body of half-extent `half` centred on `v` inside ±`lim`, by moving it rather than
 * shrinking it — a shrub pulled 0.1 off the edge is still a shrub, a shrub scaled to fit is a
 * pebble.  Applied to every sphere, accent and canopy this module emits.
 */
function containAxis(v, half, lim) {
  const bound = Math.max(0, lim - half);
  return clamp(v, -bound, bound);
}

function tier(ctx) {
  if (ctx.detail) return TIER.high;
  if (ctx.mid) return TIER.mid;
  return TIER.low;
}

/**
 * A hand-built triangle soup.
 *
 * `uvs` is optional.  Without it the surface is projected flat off X/Z at 0.25 units per texel,
 * which is right for the lawn, the bed soil and the plate chamfer — every one of them a broadly
 * horizontal surface.  It is wrong for anything with vertical faces, which is why the hedge hands
 * its own unwrap in: a plan projection would smear the foliage cell into vertical streaks down
 * both long sides of the run.
 */
function triSoup(positions, name, uvs = null) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  if (uvs) {
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  } else {
    const uv = new Float32Array((positions.length / 3) * 2);
    for (let i = 0, j = 0; i < positions.length; i += 3, j += 2) {
      uv[j] = positions[i] * 0.25;
      uv[j + 1] = positions[i + 2] * 0.25;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  g.name = name;
  g.computeBoundingBox();
  return g;
}

function tri(out, a, b, c) {
  out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
}

/**
 * The plate's chamfer: a mitred bevel ring, outer edge low, inner edge at the lawn.
 * Eight triangles for the single strongest silhouette cue on the whole tile.
 */
function bevelRing(halfW, halfD, inset, yTop, yBottom, name) {
  const o = [[-halfW, -halfD], [halfW, -halfD], [halfW, halfD], [-halfW, halfD]];
  const i = o.map(([x, z]) => [x - Math.sign(x) * inset, z - Math.sign(z) * inset]);
  const pos = [];
  for (let k = 0; k < 4; k += 1) {
    const k2 = (k + 1) % 4;
    const a = [o[k][0], yBottom, o[k][1]];
    const b = [o[k2][0], yBottom, o[k2][1]];
    const c = [i[k2][0], yTop, i[k2][1]];
    const d = [i[k][0], yTop, i[k][1]];
    tri(pos, a, c, b);
    tri(pos, a, d, c);
  }
  return triSoup(pos, name);
}

/** Four-sided pyramid — picket heads, palisade spearheads.  Six triangles. */
function pyramid(w, d, h, x, yBase, z, name) {
  const hw = w / 2;
  const hd = d / 2;
  const a = [x - hw, yBase, z - hd];
  const b = [x + hw, yBase, z - hd];
  const c = [x + hw, yBase, z + hd];
  const e = [x - hw, yBase, z + hd];
  const t = [x, yBase + h, z];
  const pos = [];
  tri(pos, a, t, b);
  tri(pos, b, t, c);
  tri(pos, c, t, e);
  tri(pos, e, t, a);
  tri(pos, a, b, c);
  tri(pos, a, c, e);
  return triSoup(pos, name);
}

/* ──────────────────────────────────────── the yard ─────────────────────────────────────── */

/**
 * Every line on the lot, derived once from `ctx.env` and `ctx.id` so that nine functions called
 * independently by an archetype seat still agree with each other.  Pure: same ctx, same numbers.
 */
function yard(ctx) {
  const e = ctx.env;
  const hw = e.lotW / 2;
  const hd = e.lotD / 2;
  const lawnHalfW = hw - RIM;
  const lawnHalfD = hd - RIM;

  const footOuter = lawnHalfD;                       // kerb line, on the plate
  const footInner = footOuter - FOOTPATH_D;
  const frontLine = footInner - BOUNDARY_INSET;      // boundary centre line, street side
  const sideLine = lawnHalfW - BOUNDARY_INSET;
  const backLine = -(lawnHalfD - BOUNDARY_INSET);

  const bodyHalfW = e.bodyW / 2;
  const frontYard = frontLine - e.frontZ;
  const sideMargin = sideLine - bodyHalfW;
  const backYard = e.backZ - backLine;

  const pathX = clamp(
    (DEFAULT_PATH_F[ctx.id] ?? 0) * bodyHalfW,
    -(lawnHalfW - GATE_W - 0.5),
    lawnHalfW - GATE_W - 0.5,
  );

  // Side returns stop clear in front of the building, so a boundary never jams itself against a
  // wall on the two archetypes whose envelope leaves only 0.25 of side margin.
  const returnDepth = clamp(frontLine - (e.frontZ + 0.25), 0, 2.4);

  const style = BOUNDARY_STYLE[ctx.id] ?? 'picket';
  // A hedged boundary already occupies the strip behind the wall, so the beds stand off it.
  const hedged = style === 'brick-hedge';

  const beds = [];
  const bedOuter = frontLine - (hedged ? 0.84 : 0.13);
  const bedD = clamp(bedOuter - (e.frontZ + 0.16), 0.34, 0.66);
  const bedZ = bedOuter - bedD / 2;
  const gapL = [-lawnHalfW + 0.14, pathX - GATE_W / 2 - 0.28];
  const gapR = [pathX + GATE_W / 2 + 0.28, lawnHalfW - 0.14];
  // A front bed only exists if there is front yard left to put it in.  Better no bed than a bed
  // inside the front wall, which is how a lot stops reading as a property.
  const frontBedFits = bedOuter - (e.frontZ + 0.10) >= 0.30;
  if (frontBedFits && gapL[1] - gapL[0] > 0.85) {
    beds.push({
      id: 'front-left', axis: 'x', x: (gapL[0] + gapL[1]) / 2, z: bedZ,
      w: gapL[1] - gapL[0], d: bedD, len: gapL[1] - gapL[0],
    });
  }
  if (frontBedFits && gapR[1] - gapR[0] > 0.85) {
    beds.push({
      id: 'front-right', axis: 'x', x: (gapR[0] + gapR[1]) / 2, z: bedZ,
      w: gapR[1] - gapR[0], d: bedD, len: gapR[1] - gapR[0],
    });
  }
  if (sideMargin >= 0.62 && !hedged) {
    const bw = clamp(sideMargin - 0.34, 0.32, 0.60);
    const z0 = frontLine - 0.95;
    const z1 = Math.max(backLine + 0.35, e.backZ + 0.10);
    if (z0 - z1 > 1.2) {
      for (const s of [-1, 1]) {
        beds.push({
          id: s < 0 ? 'side-west' : 'side-east', axis: 'z',
          x: s * (sideLine - 0.13 - bw / 2), z: (z0 + z1) / 2,
          w: bw, d: z0 - z1, len: z0 - z1,
        });
      }
    }
  }
  if (backYard >= 0.62) {
    const bd = clamp(backYard - 0.30, 0.30, 0.60);
    beds.push({
      id: 'rear', axis: 'x', x: 0, z: backLine + 0.13 + bd / 2,
      w: (lawnHalfW - 0.9) * 2, d: bd, len: (lawnHalfW - 0.9) * 2,
    });
  }

  return {
    hw, hd, lawnHalfW, lawnHalfD,
    footOuter, footInner, frontLine, sideLine, backLine,
    bodyHalfW, frontYard, sideMargin, backYard,
    pathX, returnDepth, beds, style,
  };
}

function axisX(ctx, opts, y) {
  const raw = opts.x ?? opts.pathX ?? opts.gateX ?? opts.doorX ?? y.pathX;
  return clamp(raw, -(y.lawnHalfW - GATE_W - 0.5), y.lawnHalfW - GATE_W - 0.5);
}

/* ──────────────────────────────────────── 1. the plate ─────────────────────────────────── */

/**
 * The lot's field: plate body, chamfered edge, saturated lawn, and the bed soil the planting
 * stands in.  This is the single cheapest fix in the programme and the largest visual gap.
 *
 * @param {object} ctx
 * @param {{chamfer?: number, plate?: boolean, beds?: boolean}} [opts]
 *   `chamfer` is the FALL of the bevel (default 0.24); the plan inset is fixed at 0.30 because
 *   the footpath and boundary lines are measured from it.  `plate: false` emits lawn and beds
 *   only, for a seat that has already called `house-kit.lotPlate`.
 */
export function lotSurface(ctx, opts = {}) {
  const p = ctx.p;
  const y = yard(ctx);
  const out = [];
  const fall = clamp(opts.chamfer ?? RIM_FALL, 0.10, 0.40);

  if (opts.plate !== false) {
    out.push(mk(
      slab(ctx.env.lotW, PLATE_H - fall, ctx.env.lotD, 0, -PLATE_H, 0, 'lot-plate-body'),
      p.shadow,
    ));
    out.push(mk(
      bevelRing(y.hw, y.hd, RIM, 0, -fall, 'lot-plate-chamfer'),
      p.shadow,
    ));
  }

  // The lawn is the tile's field and it runs edge to edge under the chamfer's inner lip.
  out.push(mk(
    slab(y.lawnHalfW * 2, 0.30, y.lawnHalfD * 2, 0, -0.30, 0, 'lot-lawn-field'),
    p.garden,
  ));

  if (opts.beds !== false) {
    for (const bed of y.beds) {
      out.push(mk(
        slab(bed.w, 0.16, bed.d, bed.x, -0.10, bed.z, `bed-soil-${bed.id}`),
        p.shadow,
      ));
    }
  }
  return out;
}

/* ──────────────────────────────────── 2. path and steps ────────────────────────────────── */

/**
 * Footpath → gate → steps → threshold, with a real join at every end.
 *
 * @param {object} ctx
 * @param {{x?: number, width?: number, deckZ?: number, floorY?: number, steps?: boolean,
 *          edging?: boolean}} [opts]
 *   `deckZ` is the +Z edge of the verandah deck or porch floor the flight climbs to; it defaults
 *   to `env.frontZ`, which is right for a recessed porch and wrong for a projecting verandah, so
 *   an archetype with a projecting verandah must pass it.
 */
export function path(ctx, opts = {}) {
  const p = ctx.p;
  const y = yard(ctx);
  const out = [];
  const x = axisX(ctx, opts, y);
  const w = opts.width ?? 1.06;
  const deckZ = opts.deckZ ?? ctx.env.frontZ;
  const floorY = Math.max(0.14, opts.floorY ?? ctx.env.floorY);

  // Fit the flight into whatever front yard the envelope actually left.
  let risers = clamp(Math.round(floorY / 0.19), 2, 4);
  const avail = Math.max(0.42, y.frontLine - 0.20 - deckZ);
  if (avail / risers < 0.20) risers = Math.max(2, Math.floor(avail / 0.20));
  const tread = clamp(avail / risers, 0.20, 0.38);
  const riserH = floorY / risers;
  const flightD = opts.steps === false ? 0 : risers * tread;

  if (opts.steps !== false) {
    const stepW = w + 0.42;
    for (let i = 0; i < risers; i += 1) {
      const h = riserH * (i + 1);
      const depth = tread * (risers - i);
      out.push(mk(
        slab(stepW, h, depth, x, 0, deckZ + depth / 2, `path-step-${i}`),
        p.trim,
      ));
    }
  }

  // The path runs from the footpath's inner edge to the bottom riser and touches both.
  const z0 = y.footInner - 0.04;
  const z1 = deckZ + flightD;
  if (z0 - z1 > 0.10) {
    out.push(mk(
      slab(w, 0.12, z0 - z1, x, -0.08, (z0 + z1) / 2, 'path-slab'),
      p.trim,
    ));
    if (opts.edging !== false && ctx.mid) {
      for (const s of [-1, 1]) {
        out.push(mk(
          slab(0.11, 0.14, z0 - z1, x + s * (w / 2 + 0.055), -0.09, (z0 + z1) / 2,
            `path-edging-${s < 0 ? 'west' : 'east'}`),
          p.wallAlt,
        ));
      }
    }
  }
  return out;
}

/* ────────────────────────────────────── 3. the boundary ────────────────────────────────── */

function runBox(run, u, along, across, h, yBase, name, offset = 0) {
  const f = run.fixed + offset * run.inSign;
  return run.axis === 'x'
    ? slab(along, h, across, u, yBase, f, name)
    : slab(across, h, along, f, yBase, u, name);
}

function runPoint(run, u, offset = 0) {
  const f = run.fixed + offset * run.inSign;
  return run.axis === 'x' ? { x: u, z: f } : { x: f, z: u };
}

/**
 * Infill positions that FILL a bay rather than sitting centred in it.
 *
 * The obvious `floor(len / pitch)` centred on the bay leaves a hole beside every post — 0.37 of
 * one at a 2.0 bay — and a picket fence with a gap at each post reads as a broken fence.  This
 * takes the clear width between the two members that bound the bay, picks the nearest whole
 * number of pickets to the target pitch, and spreads them across it, so the end gap is never
 * larger than the gap between two pickets.
 */
function fillPositions(mid, len, clear, pitch) {
  const usable = len - clear * 2;
  if (usable < pitch * 0.5) return [];
  const n = Math.max(1, Math.round(usable / pitch));
  const step = usable / n;
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(mid - usable / 2 + step * (i + 0.5));
  return out;
}

function runSpots(run, maxSpacing) {
  const a = Math.min(run.a, run.b);
  const b = Math.max(run.a, run.b);
  const n = Math.max(2, Math.ceil((b - a) / maxSpacing) + 1);
  const spots = [];
  for (let i = 0; i < n; i += 1) spots.push(a + ((b - a) * i) / (n - 1));
  return spots;
}

/** Timber picket fence — cream pickets on dark posts and rails.  cottage-federation. */
function picketRun(ctx, run, out, salt) {
  const p = ctx.p;
  const t = tier(ctx);
  const postH = 1.06;
  const spots = runSpots(run, 2.6);
  for (let i = 0; i < spots.length; i += 1) {
    if ((i === 0 && run.skipStart) || (i === spots.length - 1 && run.skipEnd)) continue;
    const tall = (i === 0 && run.gateStart) || (i === spots.length - 1 && run.gateEnd);
    const h = tall ? postH + 0.22 : postH;
    out.push(mk(runBox(run, spots[i], 0.18, 0.18, h, 0, `fence-post-${i}`), p.joinery));
    out.push(mk(runBox(run, spots[i], 0.27, 0.27, 0.07, h, `fence-post-cap-${i}`), p.trim));
    const c = runPoint(run, spots[i]);
    out.push(mk(ball(0.085, c.x, h + 0.13, c.z, `fence-post-finial-${i}`, 6), p.trim));
  }
  for (let i = 0; i < spots.length - 1; i += 1) {
    const a = spots[i];
    const b = spots[i + 1];
    const len = b - a;
    const mid = (a + b) / 2;
    for (const [ry, tag] of [[0.30, 'low'], [0.74, 'high']]) {
      out.push(mk(
        runBox(run, mid, len, 0.07, 0.10, ry, `fence-rail-${tag}-${i}`, 0.055),
        p.joinery,
      ));
    }
    const us = fillPositions(mid, len, 0.16, t.picketPitch);
    for (let k = 0; k < us.length; k += 1) {
      const u = us[k];
      out.push(mk(runBox(run, u, 0.13, 0.07, 0.88, 0, `picket-${i}-${k}`), p.trim));
      if (t.heads) {
        const c = runPoint(run, u);
        out.push(mk(pyramid(0.13, 0.07, 0.11, c.x, 0.88, c.z, `picket-head-${i}-${k}`), p.trim));
      }
    }
  }
  void salt;
}

/** Low masonry wall with pale rendered capping and piers.  Californian and Brighton. */
function brickWallRun(ctx, run, out, { wallH, wallT, pierW, pierH }) {
  const p = ctx.p;
  const spots = runSpots(run, 3.1);
  for (let i = 0; i < spots.length - 1; i += 1) {
    const a = spots[i];
    const b = spots[i + 1];
    const len = b - a;
    const mid = (a + b) / 2;
    out.push(mk(runBox(run, mid, len, wallT, wallH, 0, `boundary-wall-${i}`), p.wallAlt));
    out.push(mk(
      runBox(run, mid, len, wallT + 0.12, 0.11, wallH, `boundary-wall-capping-${i}`),
      p.trim,
    ));
  }
  for (let i = 0; i < spots.length; i += 1) {
    if ((i === 0 && run.skipStart) || (i === spots.length - 1 && run.skipEnd)) continue;
    out.push(mk(runBox(run, spots[i], pierW, pierW, pierH, 0, `boundary-pier-${i}`), p.wallAlt));
    out.push(mk(
      runBox(run, spots[i], pierW + 0.13, pierW + 0.13, 0.14, pierH, `boundary-pier-cap-${i}`),
      p.trim,
    ));
  }
}

/** Piers, a low wall between them and palisade infill above.  heritage-federation-villa. */
function pierPalisadeRun(ctx, run, out) {
  const p = ctx.p;
  const t = tier(ctx);
  const wallH = 0.52;
  const capTop = wallH + 0.10;
  const barTop = 1.12;
  const pierH = 1.10;
  const spots = runSpots(run, 3.4);
  for (let i = 0; i < spots.length - 1; i += 1) {
    const a = spots[i];
    const b = spots[i + 1];
    const len = b - a;
    const mid = (a + b) / 2;
    out.push(mk(runBox(run, mid, len, 0.28, wallH, 0, `boundary-wall-${i}`), p.wallAlt));
    out.push(mk(runBox(run, mid, len, 0.36, 0.10, wallH, `boundary-capping-${i}`), p.trim));
    out.push(mk(
      runBox(run, mid, len, 0.09, 0.09, barTop - 0.09, `palisade-top-rail-${i}`),
      p.joinery,
    ));
    const us = fillPositions(mid, len, 0.30, t.palisadePitch);
    for (let k = 0; k < us.length; k += 1) {
      const u = us[k];
      out.push(mk(
        runBox(run, u, 0.075, 0.075, barTop - capTop, capTop, `palisade-bar-${i}-${k}`),
        p.joinery,
      ));
      if (t.heads) {
        const c = runPoint(run, u);
        out.push(mk(
          pyramid(0.075, 0.075, 0.10, c.x, barTop, c.z, `palisade-spear-${i}-${k}`),
          p.joinery,
        ));
      }
    }
  }
  for (let i = 0; i < spots.length; i += 1) {
    if ((i === 0 && run.skipStart) || (i === spots.length - 1 && run.skipEnd)) continue;
    out.push(mk(runBox(run, spots[i], 0.52, 0.52, pierH, 0, `boundary-pier-${i}`), p.wallAlt));
    out.push(mk(
      runBox(run, spots[i], 0.66, 0.66, 0.15, pierH, `boundary-pier-cap-${i}`),
      p.trim,
    ));
  }
}

/* ─────────────────────────────────── the clipped hedge ─────────────────────────────────── */

/**
 * Top-arris radius and crown dome, both as a fraction of the hedge's depth.
 *
 * The arris is the whole fix.  A clipped hedge photographs as a flat top over flat sides with a
 * SOFT corner between them — the shears cannot hold a knife edge on foliage — and the reference
 * tile shows exactly that: a broad matte top, a rolled arris that catches a graded highlight, and
 * a rounded return at the end of the run.  A box capped flat at both arrises is a plastic beam,
 * which is what the r2 plate shows.  0.18 of the depth is 0.108 on the front hedge: a real roll at
 * board altitude, with 64 % of the top still flat, so the thing reads as clipped rather than as a
 * hose.  It was drawn at 0.24 first and rendered as a bolster.
 *
 * The dome is the same argument in the other axis and an order of magnitude smaller — 0.030 on the
 * front hedge.  A clipped top is very slightly crowned, and that crown is what stops the top face
 * returning one identical normal, and therefore one identical highlight, down its whole length.
 */
const HEDGE_ARRIS_F = 0.18;
const HEDGE_DOME_F = 0.05;
/**
 * Height modulation amplitude, as a fraction of the hedge's height: ±0.049 on the 0.98 front
 * hedge, ±5 %.  Enough that the clipped top measures a spread of 0.057–0.090 along a run against
 * the flat slab's 0.000, and little enough that it still reads as clipped rather than as scrub.
 */
const HEDGE_SWELL_F = 0.05;
/** Modulation wavelength, in board units.  Low frequency: growth, not noise. */
const HEDGE_WAVE = 2.60;
/** Spacing at which a run breaks for a knot.  Matches `brickWallRun`'s pier spacing exactly. */
const HEDGE_BREAK = 3.10;

/**
 * The clipped top's height at a point along a run, keyed to that point's WORLD position.
 *
 * World, and not run-local, is the point.  `boundary` splits the frontage at the gate and stops
 * each run half a pier clear of it, so one frontage is two separate `hedgeRun` calls — and the r2
 * plate reads them as two unrelated boxes in line. Sampling one continuous curve in world space
 * makes them two lengths of the same hedge, interrupted by a gate.  Three incommensurate terms,
 * summing to unit amplitude, so the wave does not repeat inside a lot.
 */
function hedgeCrownY(u, height, swell, phase) {
  const a = (u / HEDGE_WAVE) * Math.PI * 2;
  const w = 0.55 * Math.sin(a + phase[0])
    + 0.29 * Math.sin(a * 2.37 + phase[1])
    + 0.16 * Math.sin(a * 4.11 + phase[2]);
  return height + swell * w;
}

/**
 * Half a clipped hedge's cross-section, mirrored, as `[acrossOffset, dropFromCrown]` pairs
 * running left ground → crown → right ground.  A `null` drop marks the two points that sit on the
 * lawn rather than on the modulated top.
 *
 * `arc` is the number of intermediate points in each arris, so the whole profile is
 * `7 + 2 · arc` points, `6 + 2 · arc` edges, and the extruded cost is `12 + 4 · arc` triangles
 * per span — 20 at high, 16 at mid, 12 at low.
 */
function hedgeSection(halfD, arris, dome, arc) {
  const r = clamp(arris, 0.02, halfD * 0.9);
  const pts = [[-halfD, null], [-halfD, -(dome + r)]];
  for (let j = 1; j <= arc; j += 1) {
    const t = (Math.PI / 2) * (j / (arc + 1));
    pts.push([-halfD + r * (1 - Math.cos(t)), -(dome + r * (1 - Math.sin(t)))]);
  }
  pts.push([-halfD + r, -dome], [0, 0]);
  for (let i = pts.length - 2; i >= 0; i -= 1) pts.push([-pts[i][0], pts[i][1]]);
  return pts;
}

/**
 * The stations an extrusion is sampled at.  Interior stations sit on a GLOBAL lattice of `step`,
 * so where one run ends and the next begins the two sample the same crown curve at the same
 * places and the join does not step.  The two run ends are always stations.
 */
function hedgeStations(a, b, step) {
  const stations = [a];
  const k0 = Math.ceil((a + 1e-6) / step);
  const k1 = Math.floor((b - 1e-6) / step);
  for (let k = k0; k <= k1; k += 1) stations.push(k * step);
  stations.push(b);
  if (stations.length >= 5) return stations;
  // A short run — a wall return, or the stub beside a gate — would otherwise get two spans and no
  // modulation at all.  Subdivide it evenly instead; it shares no join with anything.
  const n = Math.max(3, Math.ceil((b - a) / step));
  const even = [];
  for (let i = 0; i <= n; i += 1) even.push(a + ((b - a) * i) / n);
  return even;
}

/**
 * One hedge run as a single extruded mass: flat clipped sides, a rolled top arris, a shallow
 * crown across the depth, and a top that rises and falls along the length.
 *
 * One geometry, and deliberately so.  The previous shape was a body box with a second box inset
 * on top of it, which put a machined ledge down both sides of every run — and two coplanar side
 * faces where the crown met the body.  An extrusion has neither.
 */
function hedgeMass(run, out, material, { a, b, halfD, height, offset, arris, dome, arc, step, swell, phase, tag }) {
  const sec = hedgeSection(halfD, arris, dome, arc);
  const stations = hedgeStations(a, b, step);
  const f = run.fixed + offset * run.inSign;
  const alongX = run.axis === 'x';
  // The unwrap: `u` runs along the hedge, `v` is arc length up and over the section, both at the
  // 0.25 units-per-texel the lawn and the beds use, so the foliage cell is the same size on the
  // hedge as it is on the grass beside it.
  const arcLen = [0];
  for (let i = 1; i < sec.length; i += 1) {
    const y0 = sec[i - 1][1] === null ? 0 : height + sec[i - 1][1];
    const y1 = sec[i][1] === null ? 0 : height + sec[i][1];
    arcLen.push(arcLen[i - 1] + Math.hypot(sec[i][0] - sec[i - 1][0], y1 - y0));
  }

  const pos = [];
  const uv = [];
  const at = (u, i, top) => {
    const t = sec[i][0];
    const y = sec[i][1] === null ? 0 : top + sec[i][1];
    return alongX ? [u, y, f + t] : [f + t, y, u];
  };
  const put = (v3, u, i) => {
    pos.push(v3[0], v3[1], v3[2]);
    // The 0.35 skew shears `u` slightly with the section offset, so the two long faces do not
    // sample one identical column of the foliage cell as an exact mirror of each other.
    uv.push((u + sec[i][0] * 0.35) * 0.25, arcLen[i] * 0.25);
  };
  const face = (va, ia, ua, vb, ib, ub, vc, ic, uc) => {
    put(va, ua, ia); put(vb, ub, ib); put(vc, uc, ic);
  };

  for (let s = 0; s < stations.length - 1; s += 1) {
    const u0 = stations[s];
    const u1 = stations[s + 1];
    const y0 = hedgeCrownY(u0, height, swell, phase);
    const y1 = hedgeCrownY(u1, height, swell, phase);
    for (let i = 0; i < sec.length - 1; i += 1) {
      const A = at(u0, i, y0);
      const B = at(u1, i, y1);
      const C = at(u1, i + 1, y1);
      const D = at(u0, i + 1, y0);
      if (alongX) {
        face(A, i, u0, C, i + 1, u1, B, i, u1);
        face(A, i, u0, D, i + 1, u0, C, i + 1, u1);
      } else {
        face(A, i, u0, B, i, u1, C, i + 1, u1);
        face(A, i, u0, C, i + 1, u1, D, i + 1, u0);
      }
    }
  }
  // The two ends, fanned from the section's first point.  A run that stops at a gate or a corner
  // shows its section, and an open end reads as a hole in the mass from the low camera.
  for (const [u, isEnd] of [[stations[0], false], [stations[stations.length - 1], true]]) {
    const top = hedgeCrownY(u, height, swell, phase);
    const P0 = at(u, 0, top);
    for (let i = 1; i < sec.length - 1; i += 1) {
      const P1 = at(u, i, top);
      const P2 = at(u, i + 1, top);
      if (alongX === isEnd) face(P0, 0, u, P1, i, u, P2, i + 1, u);
      else face(P0, 0, u, P2, i + 1, u, P1, i, u);
    }
  }
  out.push(mk(triSoup(pos, `${tag}-mass`, uv), material));
}

/**
 * A clipped hedge as one confident mass — the bayside cue, and never a row of balls.
 *
 * Three things carry it, and the r2 plate had none of them.  The mass is extruded rather than
 * boxed, so its arris is rolled and its top is very slightly crowned.  The top height is a slow
 * wave in world space, so the surface stops returning one flat highlight down a nine-unit run and
 * two runs either side of a gate stay one hedge.  And a knot sits at every break in the run rather
 * than only at its two extremities, so the foliage swells over each brick pier the way a hedge
 * grown around one actually does.
 *
 * The knots hold the run's measured envelope exactly: radius is half the depth, so a knot is
 * TANGENT to both long faces and adds nothing across.  That matters twice over — `hedge-front-*`
 * is the part that sets Brighton's own +X plate margin, and `bungalow-brighton.js` measures its
 * front-yard clearance off this run's z band.
 */
function hedgeRun(ctx, run, out, { height = 0.98, depth = 0.60, offset = 0.48, tag = 'hedge' }) {
  const p = ctx.p;
  const t = tier(ctx);
  const a = Math.min(run.a, run.b);
  const b = Math.max(run.a, run.b);
  if (b - a < 0.6) return;
  const halfD = depth * 0.5;
  const swell = height * HEDGE_SWELL_F * t.hedgeSwell;
  const phase = [
    ctx.v.range(1770, 0, Math.PI * 2),
    ctx.v.range(1771, 0, Math.PI * 2),
    ctx.v.range(1772, 0, Math.PI * 2),
  ];
  hedgeMass(run, out, p.garden, {
    a, b, halfD, height, offset, swell, phase, tag,
    arris: depth * HEDGE_ARRIS_F,
    dome: depth * HEDGE_DOME_F,
    arc: t.hedgeArc,
    step: t.hedgeStep,
  });
  // Knots.  `runSpots` returns the two ends and every break between them, at the same spacing
  // `brickWallRun` puts its piers at, so on a front run a knot lands on every pier.
  const spots = runSpots(run, HEDGE_BREAK);
  for (let i = 0; i < spots.length; i += 1) {
    const u = spots[i];
    const end = i === 0 || i === spots.length - 1;
    const c = runPoint(run, u, offset);
    const top = hedgeCrownY(u, height, swell, phase) + (end ? 0.02 : 0.06);
    out.push(mk(ball(halfD, c.x, top - halfD, c.z, `${tag}-knot-${i}`, t.seg), p.garden));
  }
}

/**
 * The front boundary, in the period's own material, with an opening for the gate.
 *
 * cottage-federation      timber pickets (trim) on dark posts and rails (joinery), shaped heads
 * bungalow-californian    low red-brick wall with pale rendered capping and brick piers
 * bungalow-brighton       the same wall, lower, with a clipped hedge behind and along the sides
 * heritage-federation-villa  piers with a low wall between and palisade infill — kept LOW, because
 *                         the baseline's full-height brick compound hides the building it frames
 *
 * @param {object} ctx
 * @param {{x?: number, gateW?: number, style?: string, returns?: boolean, hedge?: boolean}} [opts]
 */
export function boundary(ctx, opts = {}) {
  const y = yard(ctx);
  const out = [];
  const style = opts.style ?? y.style;
  const gateX = axisX(ctx, opts, y);
  const gateW = opts.gateW ?? GATE_W;

  const endHalf = STYLE_END_HALF[style] ?? 0.09;
  const runs = [];
  const left = {
    axis: 'x', fixed: y.frontLine, inSign: -1,
    a: -y.sideLine, b: gateX - gateW / 2 - endHalf, gateEnd: true,
  };
  const right = {
    axis: 'x', fixed: y.frontLine, inSign: -1,
    a: gateX + gateW / 2 + endHalf, b: y.sideLine, gateStart: true,
  };
  if (left.b - left.a > 0.5) runs.push(left);
  if (right.b - right.a > 0.5) runs.push(right);
  if (opts.returns !== false && y.returnDepth > 0.5) {
    for (const s of [-1, 1]) {
      runs.push({
        axis: 'z', fixed: s * y.sideLine, inSign: -s,
        a: y.frontLine, b: y.frontLine - y.returnDepth,
        skipStart: true,
      });
    }
  }

  // Brighton's hedge is the side boundary as well as the front one, where the envelope leaves
  // room for it, and it runs the FULL depth rather than stopping with the wall return.  Decided
  // before the run loop because it decides what the wall's own side returns get: running a second
  // hedge along a return that the full-depth side hedge already covers left two interpenetrating
  // masses of different depth and different height on one line, 0.05 apart in plan — half the
  // reason the r2 boundary reads as a row of boxes rather than as one hedge.
  const sideHedge = (opts.hedge ?? style === 'brick-hedge') && y.sideMargin >= 0.72;

  for (let i = 0; i < runs.length; i += 1) {
    const run = runs[i];
    if (style === 'picket') picketRun(ctx, run, out, 1640 + i);
    else if (style === 'pier-palisade') pierPalisadeRun(ctx, run, out);
    else if (style === 'brick-hedge') {
      brickWallRun(ctx, run, out, { wallH: 0.52, wallT: 0.30, pierW: 0.44, pierH: 0.76 });
      if (!(sideHedge && run.axis === 'z')) hedgeRun(ctx, run, out, { tag: `hedge-front-${i}` });
    } else brickWallRun(ctx, run, out, { wallH: 0.60, wallT: 0.30, pierW: 0.48, pierH: 0.84 });
  }

  if (sideHedge) {
    for (const s of [-1, 1]) {
      hedgeRun(ctx, {
        axis: 'z', fixed: s * y.sideLine, inSign: -s,
        a: y.frontLine - 0.1, b: Math.max(y.backLine + 0.3, ctx.env.backZ),
      }, out, { height: 0.92, depth: 0.55, offset: 0.34, tag: `hedge-side-${s < 0 ? 'w' : 'e'}` });
    }
  }
  return out;
}

/* ─────────────────────────────────────────── 4. gate ───────────────────────────────────── */

/**
 * The gate leaf, hung in the opening `boundary` left for it.  The two posts or piers either side
 * of the opening belong to `boundary` — they are part of the fence — so this emits the leaf,
 * its hinges and its latch and nothing else.
 *
 * @param {object} ctx
 * @param {{x?: number, gateW?: number, height?: number}} [opts]
 */
export function gate(ctx, opts = {}) {
  const p = ctx.p;
  const y = yard(ctx);
  const out = [];
  const x = axisX(ctx, opts, y);
  // `boundary` leaves GATE_W clear between the post or pier faces, so the leaf is the opening
  // less a hanging gap at each side, whatever the style.
  const gw = (opts.gateW ?? GATE_W) - 0.10;
  const h = opts.height ?? 0.94;
  const z = y.frontLine;
  const picketStyle = y.style === 'picket';

  for (const [ry, tag] of [[0.16, 'low'], [h - 0.24, 'high']]) {
    out.push(mk(slab(gw, 0.11, 0.08, x, ry, z - 0.06, `gate-rail-${tag}`), p.joinery));
  }
  out.push(mk(
    rotBox(Math.hypot(gw, h - 0.30), 0.09, 0.07, x, h / 2 - 0.02, z - 0.06,
      { z: Math.atan2(h - 0.30, gw) }, 'gate-brace'),
    p.joinery,
  ));
  const bars = picketStyle ? 4 : 5;
  const pitch = gw / bars;
  for (let i = 0; i < bars; i += 1) {
    const bx = x - gw / 2 + pitch * (i + 0.5);
    if (picketStyle) {
      out.push(mk(slab(0.13, h - 0.06, 0.07, bx, 0.06, z, `gate-picket-${i}`), p.trim));
      if (tier(ctx).heads) {
        out.push(mk(pyramid(0.13, 0.07, 0.10, bx, h, z, `gate-picket-head-${i}`), p.trim));
      }
    } else {
      out.push(mk(slab(0.075, h - 0.06, 0.075, bx, 0.06, z, `gate-bar-${i}`), p.joinery));
    }
  }
  out.push(mk(slab(0.08, h, 0.09, x - gw / 2, 0.04, z - 0.03, 'gate-stile-hanging'), p.joinery));
  out.push(mk(slab(0.08, h, 0.09, x + gw / 2, 0.04, z - 0.03, 'gate-stile-latch'), p.joinery));
  if (ctx.mid) {
    out.push(mk(slab(0.10, 0.14, 0.13, x + gw / 2 + 0.05, 0.52, z - 0.03, 'gate-latch'), p.trim));
  }
  return out;
}

/* ───────────────────────────────────────── 5. planting ─────────────────────────────────── */

/**
 * One shrub: overlapping spheres of two or three radii.  A single sphere reads as a ball on a
 * lawn; three overlapping ones read as a shrub, and the overlap is what gives ambient occlusion
 * the job a second green material would otherwise have had to do.
 */
function shrubCluster(ctx, out, { x, z, r, salt, base = 0.06, lim = Infinity }) {
  const p = ctx.p;
  const t = tier(ctx);
  const v = ctx.v;
  const cx = containAxis(x, r, lim);
  const cz = containAxis(z, r, lim);
  out.push(mk(ball(r, cx, base + r * 0.62, cz, `shrub-${salt}-core`, t.seg), p.garden));
  for (let i = 1; i < t.lobes; i += 1) {
    const a = v.range(salt + i, 0, Math.PI * 2);
    const lr = r * (i === 1 ? 0.72 : 0.58);
    const d = r * v.range(salt + 10 + i, 0.50, 0.78);
    out.push(mk(
      ball(lr,
        containAxis(cx + Math.cos(a) * d, lr, lim),
        base + lr * 0.66 + r * 0.16,
        containAxis(cz + Math.sin(a) * d, lr, lim),
        `shrub-${salt}-lobe-${i}`, Math.max(5, t.seg - 1)),
      p.garden,
    ));
  }
}

/**
 * Beds, shrub masses, flowering accents and grass tufts.
 *
 * Density is capped by quality and spent round-robin across the beds, so thinning at `mid` and
 * `low` empties every bed evenly instead of leaving one bed full and three bare.
 *
 * @param {object} ctx
 * @param {{density?: number, flowers?: boolean, tufts?: boolean, hedges?: boolean}} [opts]
 *   `hedges` defaults to false — Brighton's hedge is emitted by `boundary`, because it is the
 *   boundary; ask for it here only if a seat wants a hedge somewhere else.
 */
/** R140: two entrance-framing shrub groups and one low rear group, in existing soil beds.
 * Closed, overlapping leaf volumes reuse the unchanged garden atlas bucket; no F2 cards.
 * Their broad asymmetry is geometric, and the fence/gate/path/soil geometry stays authored.
 */
function bungalowEntryPlanting(ctx) {
  const y = yard(ctx),out = [],seg = ctx.detail ? 10 : ctx.mid ? 7 : 5;
  const addLobe = (bed, x, rx, ry, rz, cy, label) => {
    const cx = clamp(x, bed.x-bed.w/2+rx, bed.x+bed.w/2-rx);
    const cz = bed.z;const g = ball(1,0,0,0,label,seg);
    g.scale(rx,ry,rz);g.translate(cx,cy,cz);
    out.push(mk(g,ctx.p.garden));
  };
  for(const bed of y.beds.filter(b=>b.id.startsWith('front-'))){
    const left=bed.id==='front-left',centre=bed.x+(left?-.42:.50),height=left?.90:.81;
    addLobe(bed,centre,.90,height-.03,.44,height,'r140-entry-shrub-core-'+bed.id);
    addLobe(bed,centre-.74,.54,height-.23,.38,height-.20,'r140-entry-shrub-low-'+bed.id);
    addLobe(bed,centre+.70,.57,height-.15,.39,height-.12,'r140-entry-shrub-return-'+bed.id);
  }
  const rear=y.beds.find(b=>b.id==='rear');if(rear){
    addLobe(rear,-2.10,1.00,.40,.40,.43,'r140-rear-shrub-core');
    addLobe(rear,-1.22,.55,.33,.34,.36,'r140-rear-shrub-return');
  }
  return out;
}

export function planting(ctx, opts = {}) {
  if (ctx.id === 'bungalow-californian' && opts.composition === 'bungalow-entry-r140') return bungalowEntryPlanting(ctx);
  const p = ctx.p;
  const y = yard(ctx);
  const t = tier(ctx);
  const out = [];
  const density = Math.max(0.1, opts.density ?? 1);
  const cap = Math.max(1, Math.round(t.clusters * density));

  // Raising `density` raises the cap, but the cap is not always what binds: on Brighton and the
  // villa the envelope leaves only two beds, so the SLOT POOL runs out first and a builder asking
  // for 1.7 measurably received nothing. Above the default the slots tighten with it. At exactly
  // density 1 this arithmetic is the identity (spacing 1.05, ceiling 7), so every build already
  // measured by an archetype seat is byte-identical.
  const spacing = 1.05 / clamp(density, 1, 2);
  const slotCeiling = density > 1 ? 12 : 7;

  // Candidate slots, bed by bed, in a fixed order.
  const perBed = [];
  for (let b = 0; b < y.beds.length; b += 1) {
    const bed = y.beds[b];
    const along = bed.axis === 'x' ? bed.w : bed.d;
    const across = bed.axis === 'x' ? bed.d : bed.w;
    const n = clamp(Math.floor(along / spacing), 1, slotCeiling);
    const slots = [];
    for (let i = 0; i < n; i += 1) {
      const f = n === 1 ? 0.5 : (i + 0.5) / n;
      // Unique per slot, and derived offsets below (+40 max) stay inside the 1600–1799 band.
      const salt = 1690 + ((b * 7 + i) % 28);
      const j = (ctx.v.unit(salt) - 0.5) * (along / n) * 0.42;
      const k = (ctx.v.unit(salt + 1) - 0.5) * across * 0.34;
      const u = (bed.axis === 'x' ? bed.x - bed.w / 2 : bed.z - bed.d / 2) + along * f + j;
      slots.push({
        x: bed.axis === 'x' ? u : bed.x + k,
        z: bed.axis === 'x' ? bed.z + k : u,
        // Shrub scale answers to its bed: a 0.44 mass in a 0.40 bed stands half in the wall.
        r: clamp(ctx.v.range(salt + 2, 0.27, 0.44), 0.24, Math.max(0.30, across * 0.92)),
        salt,
      });
    }
    perBed.push(slots);
  }

  const taken = [];
  for (let round = 0; taken.length < cap; round += 1) {
    let any = false;
    for (const slots of perBed) {
      if (round >= slots.length) continue;
      any = true;
      taken.push(slots[round]);
      if (taken.length >= cap) break;
    }
    if (!any) break;
  }

  // Nothing crosses the plate edge.  A rear- or side-bed mass whose lobe reached 0.13 past the
  // lawn was the lateral half of the same fault the street tree had at the street edge.
  const lim = y.hd - PLATE_MARGIN;
  for (const s of taken) shrubCluster(ctx, out, { ...s, lim });

  // Small pale accents in the beds.  They are `trim`, not a tenth bucket, and they read as
  // flowers because they are pale and tiny against dark soil and mid-green foliage.
  if ((opts.flowers ?? true) && ctx.detail) {
    for (let i = 0; i < Math.min(6, taken.length); i += 1) {
      const s = taken[i];
      for (let k = 0; k < 3; k += 1) {
        const a = ctx.v.range(s.salt + 20 + k, 0, Math.PI * 2);
        const d = s.r * ctx.v.range(s.salt + 30 + k, 0.95, 1.5);
        out.push(mk(
          box(0.10, 0.09, 0.10,
            containAxis(s.x + Math.cos(a) * d, 0.05, lim), 0.12,
            containAxis(s.z + Math.sin(a) * d, 0.05, lim),
            `flower-${s.salt}-${k}`),
          p.trim,
        ));
      }
    }
  }

  // Grass tufts — three thin blades, leaning apart.
  if ((opts.tufts ?? true) && ctx.detail) {
    for (let i = 0; i < Math.min(4, taken.length); i += 1) {
      const s = taken[(i * 3) % taken.length];
      const a0 = ctx.v.range(s.salt + 40, 0, Math.PI * 2);
      const d = s.r * 1.55;
      const tx = containAxis(s.x + Math.cos(a0) * d, 0.16, lim);
      const tz = containAxis(s.z + Math.sin(a0) * d, 0.16, lim);
      for (let k = 0; k < 3; k += 1) {
        out.push(mk(
          rotBox(0.055, 0.34, 0.055, tx + (k - 1) * 0.05, 0.20, tz,
            { z: (k - 1) * 0.34, x: 0.14 }, `grass-tuft-${i}-${k}`),
          p.garden,
        ));
      }
    }
  }

  if (opts.hedges) {
    hedgeRun(ctx, {
      axis: 'x', fixed: y.backLine, inSign: 1,
      a: -y.lawnHalfW + 0.6, b: y.lawnHalfW - 0.6,
    }, out, { height: 0.9, depth: 0.55, offset: 0.3, tag: 'hedge-rear' });
  }
  return out;
}

/* ──────────────────────────────────────── 6. street tree ───────────────────────────────── */

/**
 * A lollipop street tree standing in the footpath band, outside the boundary, with its canopy
 * clear of the building and — this is the part that was wrong — **entirely inside the plate**.
 *
 * Three changes hold the containment, in the order they cost the least:
 *   1. the trunk stands at `footInner + 0.30`, the garden side of the footpath band rather than
 *      its centre, which buys 0.17 without touching the canopy;
 *   2. the canopy is centred 0.16 further inboard again, a lean over the garden, which is what a
 *      street tree pruned back off a road actually does and costs nothing;
 *   3. the two satellite lobes are offset with `-|sin|`, so they lean toward the lot and can
 *      never push the silhouette street-side of the core.
 * Radius then only has to give up 0.10 (0.78–0.92 → 0.68–0.82), and is hard-clamped against the
 * plate afterwards so a caller passing `radius` cannot reopen the defect.
 *
 * @param {object} ctx
 * @param {{count?: number, x?: number, height?: number, radius?: number}} [opts]
 */
export function streetTree(ctx, opts = {}) {
  const p = ctx.p;
  const y = yard(ctx);
  const t = tier(ctx);
  const out = [];
  const lim = y.hd - PLATE_MARGIN;
  const trunkZ = clamp(y.footInner + 0.30, y.footInner + 0.24, y.footOuter - 0.24);
  const canopyZ = trunkZ - 0.16;
  const count = opts.count ?? (ctx.mid ? 2 : 1);
  const xs = opts.x !== undefined
    ? [opts.x]
    : (count >= 2
      ? [-(y.lawnHalfW - 2.0), y.lawnHalfW - 2.0]
      : [-(y.lawnHalfW - 2.0)]);

  for (let i = 0; i < xs.length; i += 1) {
    const salt = 1740 + i * 4;
    const x = containAxis(xs[i], 0.30, lim);
    const h = opts.height ?? ctx.v.range(salt, 1.65, 1.95);
    // The canopy may never reach the plate edge, whatever the caller asks for.
    const r = Math.min(opts.radius ?? ctx.v.range(salt + 1, 0.68, 0.82), lim - canopyZ);
    out.push(mk(slab(0.52, 0.10, 0.52, x, -0.04, trunkZ, `tree-pit-${i}`), p.shadow));
    out.push(mk(taper(0.16, 0.115, h, x, 0.02, trunkZ, `tree-trunk-${i}`, 7), p.timber));
    out.push(mk(
      ball(r, containAxis(x, r, lim), h + r * 0.62, canopyZ, `tree-canopy-${i}`, t.seg),
      p.garden,
    ));
    for (let k = 2; k <= t.lobes; k += 1) {
      const a = ctx.v.range(salt + k, 0, Math.PI * 2);
      const lr = r * (k === 2 ? 0.68 : 0.60);
      const d = r * (k === 2 ? 0.62 : 0.66);
      out.push(mk(
        ball(lr,
          containAxis(x + Math.cos(a) * d, lr, lim),
          h + r * (k === 2 ? 1.06 : 0.34),
          // Lean inward over the garden, never street-side of the core.
          containAxis(canopyZ - Math.abs(Math.sin(a)) * d, lr, lim),
          `tree-canopy-${i}-${k === 2 ? 'b' : 'c'}`, Math.max(5, t.seg - 1)),
        p.garden,
      ));
    }
  }
  return out.map(p => /canopy|clump/.test(p.geometry.name) ? clusterCanopyPart(p) : p);
}

/* ───────────────────────────────────────── 7. letterbox ────────────────────────────────── */

/**
 * A letterbox on a post, standing in the fence line beside the gate — not near it, in it.
 *
 * @param {object} ctx
 * @param {{x?: number, side?: number}} [opts]
 */
export function letterbox(ctx, opts = {}) {
  const p = ctx.p;
  const y = yard(ctx);
  const out = [];
  const gateX = axisX(ctx, opts, y);
  const side = opts.side ?? (gateX > 0 ? -1 : 1);
  const x = clamp(gateX + side * 0.92, -(y.lawnHalfW - 0.4), y.lawnHalfW - 0.4);
  const z = y.frontLine - 0.10;

  out.push(mk(slab(0.13, 0.98, 0.13, x, 0, z, 'letterbox-post'), p.timber));
  out.push(mk(slab(0.36, 0.30, 0.28, x, 0.94, z, 'letterbox-body'), p.wallAlt));
  out.push(mk(slab(0.44, 0.07, 0.36, x, 1.24, z, 'letterbox-cap'), p.trim));
  out.push(mk(box(0.24, 0.055, 0.05, x, 1.10, z + 0.15, 'letterbox-slot'), p.joinery));
  return out;
}

/* ────────────────────────────────────────── 8. services ────────────────────────────────── */

/**
 * Meter box, garden tap and bins — inside the boundary and against something.  Where the
 * envelope leaves no side yard (the villa and the Californian sit within 0.25 of the boundary)
 * the bins are omitted rather than pushed through a fence.
 *
 * @param {object} ctx
 * @param {{side?: number, bins?: boolean}} [opts]
 */
export function services(ctx, opts = {}) {
  const p = ctx.p;
  const y = yard(ctx);
  const e = ctx.env;
  const out = [];
  const side = opts.side ?? (ctx.v.unit(1760) < 0.5 ? -1 : 1);
  const wallX = side * (y.bodyHalfW + 0.09);

  // Meter box, mounted on the flank wall a little back from the frontage.
  const meterZ = clamp(e.frontZ - 1.7, e.backZ + 0.5, e.frontZ - 0.4);
  out.push(mk(slab(0.17, 0.58, 0.42, wallX, 0.62, meterZ, 'meter-box'), p.trim));
  out.push(mk(slab(0.19, 0.06, 0.46, wallX, 1.20, meterZ, 'meter-box-hood'), p.trim));

  if (ctx.detail) {
    const tapZ = clamp(meterZ - 1.3, e.backZ + 0.3, e.frontZ - 0.3);
    out.push(mk(cyl(0.045, 0.46, wallX, 0.23, tapZ, 'y', 'tap-riser', 6), p.trim));
    out.push(mk(cyl(0.035, 0.20, wallX + side * 0.12, 0.44, tapZ, 'x', 'tap-spout', 6), p.trim));
    out.push(mk(slab(0.46, 0.05, 0.46, wallX + side * 0.05, -0.02, tapZ, 'tap-pad'), p.shadow));
  }

  if (opts.bins !== false && ctx.mid) {
    let bx = null;
    let bz = null;
    if (y.sideMargin >= 0.62) {
      bx = side * (y.bodyHalfW + 0.32);
      bz = clamp(e.backZ + 0.9, e.backZ + 0.5, e.frontZ - 1.0);
    } else if (y.backYard >= 0.78) {
      bx = side * Math.min(y.bodyHalfW - 0.6, 2.2);
      bz = e.backZ - 0.42;
    }
    if (bx !== null) {
      for (let i = 0; i < 2; i += 1) {
        const ox = i * 0.52 * (bx > 0 ? -1 : 1);
        out.push(mk(slab(0.46, 0.78, 0.44, bx + ox, 0, bz, `bin-${i}`), p.joinery));
        out.push(mk(slab(0.50, 0.07, 0.48, bx + ox, 0.78, bz, `bin-lid-${i}`), p.trim));
      }
    }
  }
  return out;
}

/* ─────────────────────────────────── 9. kerb and footpath ──────────────────────────────── */

/**
 * The street band: a concrete footpath with a dark bluestone kerb along the plate's street edge.
 * Present, and subordinate — 0.78 of a 15-unit plate, on one edge, against a baseline that gave
 * half the plate to a road.
 *
 * @param {object} ctx
 * @param {{joints?: boolean, crossover?: boolean, x?: number}} [opts]
 */
export function kerbAndFootpath(ctx, opts = {}) {
  const p = ctx.p;
  const y = yard(ctx);
  const out = [];
  const w = y.lawnHalfW * 2;
  const zc = (y.footInner + y.footOuter) / 2;

  out.push(mk(slab(w, 0.11, FOOTPATH_D, 0, -0.075, zc, 'footpath-slab'), p.trim));
  out.push(mk(
    slab(w, 0.22, 0.20, 0, -0.10, y.footOuter - 0.10, 'kerb-bluestone'),
    p.shadow,
  ));

  if ((opts.joints ?? true) && ctx.detail) {
    const n = 5;
    for (let i = 1; i < n; i += 1) {
      const x = -w / 2 + (w * i) / n;
      out.push(mk(
        box(0.055, 0.03, FOOTPATH_D, x, 0.030, zc, `footpath-joint-${i}`),
        p.shadow,
      ));
    }
  }
  if (opts.crossover !== false) {
    const x = axisX(ctx, opts, y);
    // Exactly the band, not wider: at FOOTPATH_D + 0.12 the crossover oversailed the lawn edge
    // onto the chamfer by 0.04.
    out.push(mk(
      slab(1.26, 0.13, FOOTPATH_D, x, -0.09, zc - 0.02, 'footpath-crossover'),
      p.trim,
    ));
  }
  return out;
}
