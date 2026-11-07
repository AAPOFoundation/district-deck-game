// District Deck: the coast spine (taste-r1 wave 74, shore rebuild phase 1a). One closed curve for the waterline per seed, one signed
// distance field baked from it, and one sampling rule written twice (JS here, GLSL below) with the same arithmetic.
//
// NO READER IS SWITCHED. Nothing in the picture, the ground, the shelf, the ocean or the game logic reads this module in this phase.
// `COAST_SPINE` (`?coastSpine=1`, node `DD_COAST_SPINE=1`) only makes `WaterSurface` build the field and hold it as `water.coastSpine`, with
// its two GPU textures (phase 1b); `getCoastSpine(city)` builds it for any seed whatever the switch says (the tests do). With
// `?coastSpineDebug=1` as well, two named debug meshes draw the curve and the texture path's d = 0 / +-5 / +-10 m lines over the picture.
//
// The curve, in world metres, with the land inside the polygon. It runs: the port-side natural leg (far to near), a fillet, the port's
// cope line, the fillet that closes the beach's port-side board end, the beach (source A's line with only its three static sines), the fillet
// at the beach's other end, the bay-side natural leg out to its far end with the creek's notch, and a closure through the land far from
// the coast. The closure gives the polygon its sign and is left out of every distance. Each natural leg runs straight on for 150 m past its
// last valid rim point (still labelled natural), which takes the closure out of the field's domain so the field stays continuous to its edge.
//
//   beach    A's static line, 47.6 m from the wall's centre line; the two board-end fillets (the caps) carry this label
//   natural  today's rim brow, the zero of `coastRimAt(...).qm`, traced at 2 m
//   port     the drawn cope line, `QUAY_SEAWARD + COPE_Z` = 38.5 m from the port's board edge, ONLY where the quay is drawn (wave 79, P0: the
//            terminal's span, `quaySpanOf`); the cope line past either end of the quay is the same curve, labelled natural
//   creek    a plain notch inland along the creek's bed where the creek centre line meets the natural shore (phase 3 refines it)
//   closure  not a coast: it closes the polygon through the land and is ignored by every distance
//
// A vertex's label is the label of the segment that starts at it.

import * as THREE from 'three';
import { WATER_FACE, WATER_Y, SAND_Y, coastMeanderStaticAt } from './water/contract.js';
// Wave 75 (beach profile): the section constants of the shelf, read from sand.js inside functions only (sand.js imports this module back, so nothing
// here may touch them at load).
import { SAND_A8, SAND_PM1, SHELF_FACE, BED_FLOOR, PROFILE_U, faceFallAt } from './water/sand.js';
import { SHORE, edgeAxes, shorePoint, alongLength } from './shore.js';
import { fringeRolesOf, harbourAlongSign } from '../core/fringe-venues.js';
import { QUAY_SEAWARD, COPE_Z } from './fringe/ships.js';
import {
  COAST_FAR, COAST_RIM, coastRimAt, creekCentreAt, planEdgeMassing,
} from './edge-massing.js';

const ENV = (typeof process !== 'undefined' && process?.env) ? process.env : {};
const QS = (typeof location !== 'undefined' && location?.search) ? new URLSearchParams(location.search) : null;

/**
 * The switch (default OFF) and the one cap radius knob. `?coastSpine=1` / `DD_COAST_SPINE=1` builds the field and exposes it on the water
 * surface (`water.coastSpine`); no reader changes with it on or off. `?coastSpineCapR=` / `DD_COAST_SPINE_CAP_R=` is the radius, in metres, of
 * the fillets that close the beach's two board ends onto the land (default 24, which is half the 47.6 m circle the shelf's cap turned
 * before; the rounding is chosen by eye from a labelled sheet in a later phase).
 */
const SPINE_ON = ENV.DD_COAST_SPINE !== undefined
  ? (Number(ENV.DD_COAST_SPINE) > 0 ? 1 : 0)
  : (QS && QS.get('coastSpine') === '1' ? 1 : 0);
export const COAST_SPINE = Object.freeze({
  on: SPINE_ON,
  /**
   * `?coastSpineDebug=1` / `DD_COAST_SPINE_DEBUG=1` (it needs the switch on): the curve line and the d = 0 / +-5 / +-10 m lines of the
   * texture path, drawn over the picture. `2` is the same with the plane drawing one constant colour (the per-fragment cost comparison).
   */
  debug: (() => {
    if (!SPINE_ON) return 0;
    const v = ENV.DD_COAST_SPINE_DEBUG !== undefined ? Number(ENV.DD_COAST_SPINE_DEBUG) : (QS ? Number(QS.get('coastSpineDebug')) : 0);
    return v === 1 || v === 2 ? v : 0;
  })(),
  capR: (() => {
    const v = ENV.DD_COAST_SPINE_CAP_R !== undefined ? Number(ENV.DD_COAST_SPINE_CAP_R) : (QS ? Number(QS.get('coastSpineCapR')) : NaN);
    return Number.isFinite(v) && v >= 2 && v <= 120 ? v : 24;
  })(),
  /**
   * Wave 75: `?coastSpineBeachOffset=` / `DD_COAST_SPINE_BEACH_OFFSET`, metres, positive seaward, default 0 (0 whenever the switch is off). It moves
   * the beach stretch's zero for every reader of phase 2a (the shelf's front, the bed's t = 0 zero, `coastProfile`): a reader's front is
   * `d - beachOffset`, so a point `beachOffset` metres seaward of the curve is its zero. The owner's choice of which line stays.
   */
  beachOffset: (() => {
    if (!SPINE_ON) return 0;
    const v = ENV.DD_COAST_SPINE_BEACH_OFFSET !== undefined ? Number(ENV.DD_COAST_SPINE_BEACH_OFFSET) : (QS && QS.get('coastSpineBeachOffset') !== null ? Number(QS.get('coastSpineBeachOffset')) : 0);
    return Number.isFinite(v) && Math.abs(v) <= 12 ? v : 0;
  })(),
});

export const COAST_LABEL = Object.freeze({ beach: 0, natural: 1, port: 2, creek: 3, closure: 4, none: 255 });
export const COAST_LABEL_NAMES = Object.freeze(['beach', 'natural', 'port', 'creek', 'closure']);
/** The field is clamped to this many metres either side of the curve. */
export const COAST_SPINE_CLAMP = 64;
/** Metres per texel (single level). */
export const COAST_SPINE_TEXEL = 1;
/** Wave 75 fix 2: the width (metres along the curve) of the band, centred on each change of label, over which the beach weight runs from 0 to 1. */
export const COAST_LABEL_BLEND = Object.freeze({ band: 8 });
/** The port's cope line, metres seaward of the port's board edge (`fringe/ships.js`: the quay's 32 plus the cope's 6.5). */
export const COAST_PORT_COPE_M = QUAY_SEAWARD + COPE_Z;
/**
 * Wave 79 (P0): the port label's blend. Across `band` m along the curve, centred on each end of the quay (each change of port against the rest),
 * the port weight runs from 0 to 1 by a smoothstep through 0.5 at the end's vertex, as the beach weight does at its changes. JS only: no shader reads it.
 */
export const COAST_PORT_BLEND = Object.freeze({ band: COAST_LABEL_BLEND.band });
/** The quay frame's constants as `fringe/port.js` states them (QUAY_ALONG_K :145, the container berth's alongK :84, the terminal's CX - 94 .. CX + 108 :12497-12498); a twin of `LAND_EDGE_QUAY`, pinned equal by tests/coast-spine-quay.test.mjs. */
export const COAST_PORT_QUAY = Object.freeze({ alongK: 0.28, containerAlongK: 0.14, x0: -94, x1: 108 });
/** The creek's plain notch: plateau half width, smooth rise (both along the shore, perpendicular to the creek), and depth inland, metres. */
export const CREEK_NOTCH = Object.freeze({ halfFlat: 6, rise: 8, depth: 26 });
const BEACH_EXT = 160;
const STEP_NATURAL = 2;
const STEP_BEACH = 2;
const STEP_PORT = 4;
const STEP_ARC = 0.75;
const STEP_NOTCH = 0.5;
/** The natural legs run straight on past the last valid rim point by this much (labelled natural), so the field stays continuous to the edge of the domain. */
const LEG_EXTENSION = 150;
/**
 * Passes of a [1 2 1] / 4 average over the traced natural legs (ends fixed). The qm = 0 contour has real kinks of 2 to 4 m radius (a narrow
 * inlet's tip, a spike where the rim noise steps), finer than a 2 m trace or a 1 m texel can hold; two passes keep wavelengths over about 30 m
 * within 8 % and leave the kinks at a radius of about 8 m. `buildCoastCurve(..., { smooth: 0 })` is the raw trace (the measurements use both).
 */
const NATURAL_SMOOTH_PASSES = 2;

function smoothPolyline(pts, passes) {
  let p = pts;
  for (let k = 0; k < passes; k += 1) {
    const q = p.slice();
    for (let i = 1; i < p.length - 1; i += 1) q[i] = { x: (p[i - 1].x + 2 * p[i].x + p[i + 1].x) / 4, z: (p[i - 1].z + 2 * p[i].z + p[i + 1].z) / 4 };
    p = q;
  }
  return p;
}

const EDGE_N = Object.freeze({ north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] });
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/* ───────────────────────── float16 ───────────────────────── */

const F64 = new Float64Array(1);
const U32D = new Uint32Array(F64.buffer);

/** Round-to-nearest-even number -> IEEE half bits (rounded once, from the double). */
export function floatToHalf(v) {
  if (v !== v) return 0x7e00;
  F64[0] = v;
  const hi = U32D[1]; const lo = U32D[0];
  const sign = (hi >>> 16) & 0x8000;
  const exp = (hi >>> 20) & 0x7ff;
  if (exp === 0x7ff) return sign | 0x7c00;
  const e = exp - 1023 + 15;
  if (e >= 31) return sign | 0x7c00;
  if (e <= 0) {
    // half subnormals (and the smallest normal): a multiple of 2^-24, rounded to even in double arithmetic
    const x = Math.abs(v) * 16777216;
    const f = Math.floor(x); const d = x - f;
    const r = d < 0.5 ? f : d > 0.5 ? f + 1 : (f % 2 === 0 ? f : f + 1);
    return sign | r;
  }
  const m10 = (hi & 0xfffff) >>> 10;
  const remHi = hi & 0x3ff;
  let h = (e << 10) | m10;
  if (remHi > 0x200 || (remHi === 0x200 && (lo !== 0 || (m10 & 1)))) h += 1;
  return sign | h;
}

let HALF_TABLE = null;
/** Half bits -> number (a 65,536-entry table, built on first use). */
export function halfToFloat(h) {
  if (!HALF_TABLE) {
    HALF_TABLE = new Float32Array(65536);
    for (let i = 0; i < 65536; i += 1) {
      const s = (i & 0x8000) ? -1 : 1;
      const e = (i >> 10) & 0x1f;
      const m = i & 0x3ff;
      HALF_TABLE[i] = e === 0 ? s * m * 5.960464477539063e-8 : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * 2 ** (e - 15);
    }
  }
  return HALF_TABLE[h];
}

/* ───────────────────────── small polyline kit ───────────────────────── */

function poly(pts) {
  const cum = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i += 1) cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return { pts, cum, len: cum[pts.length - 1] };
}

function locate(P, s) {
  const { cum, pts } = P;
  let i;
  if (s <= 0) i = 0;
  else if (s >= P.len) i = pts.length - 2;
  else {
    let lo = 0; let hi = pts.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
    i = lo;
  }
  const seg = cum[i + 1] - cum[i] || 1e-12;
  return { i, u: (s - cum[i]) / seg };
}

function pointAt(P, s) {
  const { i, u } = locate(P, s);
  const a = P.pts[i]; const b = P.pts[i + 1];
  return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
}

/** Unit tangent over a 2 m chord about arclength s, in the direction of increasing arclength. */
function tangentAt(P, s) {
  const a = pointAt(P, Math.max(0, s - 1));
  const b = pointAt(P, Math.min(P.len, s + 1));
  const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
}

/** Points of P between arclengths s0 and s1 (s0 < s1), with exact end points. */
function slice(P, s0, s1) {
  const out = [pointAt(P, s0)];
  for (let i = 0; i < P.pts.length; i += 1) if (P.cum[i] > s0 + 1e-9 && P.cum[i] < s1 - 1e-9) out.push(P.pts[i]);
  out.push(pointAt(P, s1));
  return out;
}

function segHit(a, b, c, d) {
  const r = { x: b.x - a.x, z: b.z - a.z };
  const s = { x: d.x - c.x, z: d.z - c.z };
  const den = r.x * s.z - r.z * s.x;
  if (Math.abs(den) < 1e-12) return null;
  const qx = c.x - a.x; const qz = c.z - a.z;
  const t = (qx * s.z - qz * s.x) / den;
  const u = (qx * r.z - qz * r.x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null;
}

/** All crossings of two polylines as { sP, sQ, x, z }, in order along P. */
function crossings(P, Q) {
  const out = [];
  for (let i = 0; i < P.pts.length - 1; i += 1) {
    const a = P.pts[i]; const b = P.pts[i + 1];
    const minX = Math.min(a.x, b.x); const maxX = Math.max(a.x, b.x);
    const minZ = Math.min(a.z, b.z); const maxZ = Math.max(a.z, b.z);
    for (let j = 0; j < Q.pts.length - 1; j += 1) {
      const c = Q.pts[j]; const d = Q.pts[j + 1];
      if (Math.max(c.x, d.x) < minX || Math.min(c.x, d.x) > maxX || Math.max(c.z, d.z) < minZ || Math.min(c.z, d.z) > maxZ) continue;
      const h = segHit(a, b, c, d);
      if (h) {
        out.push({
          sP: P.cum[i] + h.t * (P.cum[i + 1] - P.cum[i]),
          sQ: Q.cum[j] + h.u * (Q.cum[j + 1] - Q.cum[j]),
          x: a.x + (b.x - a.x) * h.t, z: a.z + (b.z - a.z) * h.t,
        });
      }
    }
  }
  return out;
}

/** P resampled to a step (the vertices of the input are not kept; the output's first and last points are P's). */
function resample(pts, step) {
  const P = poly(pts);
  const n = Math.max(1, Math.round(P.len / step));
  const out = [];
  for (let k = 0; k <= n; k += 1) out.push(pointAt(P, (k / n) * P.len));
  return out;
}

function extendEnd(pts, length, step = 2) {
  const P = poly(pts);
  const t = tangentAt(P, P.len);
  const e = pts[pts.length - 1];
  const out = pts.slice();
  for (let s = step; s <= length + 1e-9; s += step) out.push({ x: e.x + t.x * s, z: e.z + t.z * s });
  return out;
}

/* ───────────────────────── the sources the curve is built from ───────────────────────── */

function seaOf(edge, x, z, extent) {
  if (edge === 'south') return z - extent.z;
  if (edge === 'north') return -z;
  if (edge === 'east') return x - extent.x;
  return -x;
}

function edgeBase(edge, extent) {
  if (edge === 'north') return [extent.x / 2, 0];
  if (edge === 'south') return [extent.x / 2, extent.z];
  if (edge === 'west') return [0, extent.z / 2];
  return [extent.x, extent.z / 2];
}

/**
 * The bay's shore frame, the one `water.js` builds for the shelf: origin on the seawall's centre line (the board edge plus
 * `SHORE.wallOffset` seaward), `n` seaward, `a` the unit vector of increasing `along` (`ddAlong(w) = dot(w.xz, a)`).
 */
export function bayFrame(edge, extent) {
  const n = EDGE_N[edge];
  const base = edgeBase(edge, extent);
  const O = [base[0] + n[0] * SHORE.wallOffset, base[1] + n[1] * SHORE.wallOffset];
  const a = [n[1], -n[0]];
  const length = edge === 'north' || edge === 'south' ? extent.x : extent.z;
  return { edge, n, a, O, alongC: O[0] * a[0] + O[1] * a[1], half: length / 2, length };
}

/** Source A's line, at t = 0 with only its three static sines: the world point at a given `along`. */
export function beachStaticPoint(fr, along) {
  const s = WATER_FACE + coastMeanderStaticAt(along);
  const d = along - fr.alongC;
  return { x: fr.O[0] + fr.a[0] * d + fr.n[0] * s, z: fr.O[1] + fr.a[1] * d + fr.n[1] * s };
}

/** Zero crossings of the rim coordinate `qm` on a circle about the board centre (the legs' far starts). */
function rimAt(x, z, extent, plan, far) {
  const r = coastRimAt(x, z, extent, plan, undefined, far);
  return r.valid ? r : null;
}

function rimGrad(x, z, extent, plan, far) {
  const d = 1;
  const a = rimAt(x + d, z, extent, plan, far); const b = rimAt(x - d, z, extent, plan, far);
  const c = rimAt(x, z + d, extent, plan, far); const e = rimAt(x, z - d, extent, plan, far);
  if (!a || !b || !c || !e) return null;
  const gx = (a.qm - b.qm) / (2 * d); const gz = (c.qm - e.qm) / (2 * d);
  const m = Math.hypot(gx, gz);
  return m > 1e-4 ? { gx, gz, m } : null;
}

function rimStarts(extent, plan, radius, far) {
  const cx = extent.x * 0.5; const cz = extent.z * 0.5; const N = 1440;
  const at = (a) => rimAt(cx + Math.sin(a) * radius, cz + Math.cos(a) * radius, extent, plan, far);
  const out = [];
  let prev = at(0); let prevA = 0;
  for (let i = 1; i <= N; i += 1) {
    const a = (i / N) * Math.PI * 2;
    const cur = at(a);
    if (prev && cur && (prev.qm <= 0) !== (cur.qm <= 0)) {
      let lo = prevA; let hi = a; let qLo = prev.qm;
      for (let k = 0; k < 16; k += 1) {
        const mid = 0.5 * (lo + hi); const m = at(mid);
        if (!m) break;
        if ((m.qm <= 0) === (qLo <= 0)) { lo = mid; qLo = m.qm; } else hi = mid;
      }
      const am = 0.5 * (lo + hi);
      out.push({ x: cx + Math.sin(am) * radius, z: cz + Math.cos(am) * radius });
    }
    prev = cur; prevA = a;
  }
  return out;
}

/** The qm = 0 contour from a far start inward, every `step` metres (the walk `fringe/coast-rim.js` makes, at the spine's pitch). */
function traceRim(start, extent, plan, step, far) {
  const cx = extent.x * 0.5; const cz = extent.z * 0.5;
  const pts = []; const heading = { x: 0, z: 0 };
  let x = start.x; let z = start.z;
  for (let i = 0; i < 1500; i += 1) {
    const g = rimGrad(x, z, extent, plan, far);
    if (!g) break;
    const r0 = rimAt(x, z, extent, plan, far);
    if (!r0) break;
    x -= (g.gx / (g.m * g.m)) * r0.qm;
    z -= (g.gz / (g.m * g.m)) * r0.qm;
    const g2 = rimGrad(x, z, extent, plan, far);
    if (!g2) break;
    const r1 = rimAt(x, z, extent, plan, far);
    if (!r1) break;
    if (r1.gate < 0.003 && !(far && Math.hypot(x - cx, z - cz) >= COAST_RIM.rFade0)) break;
    pts.push({ x, z });
    let tx = -g2.gz / g2.m; let tz = g2.gx / g2.m;
    const flip = i === 0 ? tx * (x - cx) + tz * (z - cz) > 0 : tx * heading.x + tz * heading.z < 0;
    if (flip) { tx = -tx; tz = -tz; }
    heading.x = tx; heading.z = tz;
    x += tx * step; z += tz * step;
  }
  return pts;
}

/** Where the creek's centre line meets the natural shore (the qm zero), with the landward unit direction along the bed. */
function creekMouth(extent, plan) {
  const edge = plan?.hills ?? plan?.landEdges?.[0];
  if (!edge) return null;
  const far = COAST_FAR.on === 1;
  const at = (u) => {
    const c = creekCentreAt(u);
    if (edge === 'south') return { x: u, z: extent.z + c };
    if (edge === 'north') return { x: u, z: -c };
    if (edge === 'east') return { x: extent.x + c, z: u };
    return { x: -c, z: u };
  };
  const qmOf = (u) => { const p = at(u); const r = rimAt(p.x, p.z, extent, plan, far); return r ? r.qm : null; };
  const uc = edge === 'south' || edge === 'north' ? extent.x / 2 : extent.z / 2;
  let best = null;
  let prevU = null; let prevQ = null;
  for (let u = uc - 1100; u <= uc + 1500; u += 3) {
    const q = qmOf(u);
    if (q !== null && prevQ !== null && (prevQ <= 0) !== (q <= 0)) {
      let lo = prevU; let hi = u; let qLo = prevQ;
      for (let k = 0; k < 24; k += 1) {
        const mid = 0.5 * (lo + hi); const m = qmOf(mid);
        if (m === null) break;
        if ((m <= 0) === (qLo <= 0)) { lo = mid; qLo = m; } else hi = mid;
      }
      const um = 0.5 * (lo + hi);
      if (!best || Math.abs(um - uc) < Math.abs(best.u - uc)) best = { u: um };
    }
    prevU = u; prevQ = q;
  }
  if (!best) return null;
  const M = at(best.u);
  const a = at(best.u - 1); const b = at(best.u + 1);
  let qx = b.x - a.x; let qz = b.z - a.z;
  const l = Math.hypot(qx, qz) || 1; qx /= l; qz /= l;
  const qa = rimAt(M.x + qx * 6, M.z + qz * 6, extent, plan, far); const qb = rimAt(M.x - qx * 6, M.z - qz * 6, extent, plan, far);
  if (qa && qb && qa.qm > qb.qm) { qx = -qx; qz = -qz; }
  return { x: M.x, z: M.z, qx, qz, u: best.u, edge };
}

/* ───────────────────────── fillet and notch ───────────────────────── */

/**
 * A cubic blend that closes a corner. X arrives at the junction (arclength sX), Y leaves it (sY). The blend starts and ends on the two
 * curves with their own tangents there (t1 at p1, t2 at p2), and its handles are those of a circular arc of radius Rk over the turn between
 * t1 and t2. Where a leg itself curves (the rim leg beside the bay end bends at about 12 m radius), the tangents at p1 and p2 turn by more than
 * the junction's angle, and handles built from the junction's tangent make a tighter arc than the knob (11.8 m for 24 m on seed 1). So the two
 * start distances are solved until the tangent lines from p1 and p2 meet at Rk * tan(turn / 2) from each, and Rk is then trimmed (a fixed
 * point, a few steps) until the finished arc's length over its total turn is the knob R: the arc has the knob's radius whatever the legs do.
 * `radius` is measured on the finished arc, `radiusKnob` is R.
 */
function fillet(X, sX, Y, sY, R) {
  const tX = tangentAt(X, sX); const tY = tangentAt(Y, sY);
  const delta0 = Math.atan2(tX.x * tY.z - tX.z * tY.x, tX.x * tY.x + tX.z * tY.z);
  if (Math.abs(delta0) < 1e-3) return { rt: 0, sX1: sX, sY2: sY, arc: [pointAt(X, sX)], delta: delta0, centre: null, radius: 0, radiusKnob: R, clipped: false };
  const capX = sX - 1; const capY = Y.len - sY - 1;
  // The effective radius of an arc: its length over the total turn of its chords.
  const radiusOf = (pts) => {
    let len = 0; let turn = 0;
    for (let k = 1; k < pts.length; k += 1) {
      len += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
      if (k >= 2) {
        const ax = pts[k - 1].x - pts[k - 2].x; const az = pts[k - 1].z - pts[k - 2].z; const bx = pts[k].x - pts[k - 1].x; const bz = pts[k].z - pts[k - 1].z;
        turn += Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz));
      }
    }
    return turn > 0 ? len / turn : 0;
  };
  const solve = (Rk) => {
    let rt1 = Rk * Math.tan(Math.abs(delta0) / 2); let rt2 = rt1;
    let st = null; let clipped = false;
    for (let it = 0; it < 60; it += 1) {
      clipped = rt1 > capX || rt2 > capY;
      rt1 = Math.max(0.05, Math.min(rt1, capX)); rt2 = Math.max(0.05, Math.min(rt2, capY));
      const sX1 = sX - rt1; const sY2 = sY + rt2;
      const p1 = pointAt(X, sX1); const p2 = pointAt(Y, sY2);
      const t1 = tangentAt(X, sX1); const t2 = tangentAt(Y, sY2);
      const cr = t1.x * t2.z - t1.z * t2.x;
      const delta = Math.atan2(cr, t1.x * t2.x + t1.z * t2.z);
      st = { sX1, sY2, p1, p2, t1, t2, delta };
      if (Math.abs(cr) < 1e-6) break;
      const wx = p2.x - p1.x; const wz = p2.z - p1.z;
      const a = (wx * t2.z - wz * t2.x) / cr;            // distance along t1 from p1 to the meeting point of the two tangent lines
      const b = (t1.x * wz - t1.z * wx) / cr;            // distance back along t2 from p2 to it
      const T = Rk * Math.tan(Math.abs(delta) / 2);
      if (Math.abs(a - T) < 1e-4 && Math.abs(b - T) < 1e-4) break;
      rt1 += 0.8 * (T - a); rt2 += 0.8 * (T - b);
    }
    const { p1, p2, t1, t2, delta } = st;
    const ad = Math.abs(delta);
    const h = (4 / 3) * Math.tan(ad / 4) * Rk;
    const c1 = { x: p1.x + t1.x * h, z: p1.z + t1.z * h };
    const c2 = { x: p2.x - t2.x * h, z: p2.z - t2.z * h };
    const n = Math.max(4, Math.ceil((ad * R) / STEP_ARC));
    const arc = [];
    for (let k = 0; k <= n; k += 1) {
      const u = k / n; const v = 1 - u;
      arc.push({
        x: v * v * v * p1.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * p2.x,
        z: v * v * v * p1.z + 3 * v * v * u * c1.z + 3 * v * u * u * c2.z + u * u * u * p2.z,
      });
    }
    return { st, arc, clipped, radius: radiusOf(arc) };
  };
  let Rk = R; let res = solve(Rk);
  for (let it = 0; it < 8 && !res.clipped && Math.abs(res.radius - R) > 2e-3 * R; it += 1) {
    Rk *= R / res.radius;
    res = solve(Rk);
  }
  const { st, arc, clipped, radius } = res;
  const { sX1, sY2, p1, t1, delta } = st;
  const side = delta > 0 ? 1 : -1;
  return {
    rt: Math.max(sX - sX1, sY2 - sY), sX1, sY2, arc, delta, radius, radiusKnob: R, clipped,
    centre: { x: p1.x - t1.z * radius * side, z: p1.z + t1.x * radius * side },
  };
}

const smooth01 = (t) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };

/**
 * The creek's plain notch: the shore's own points, moved inland along the creek's bed (direction q) by depth * w(e), where e is the
 * distance across the bed. The shore stays a graph over e, so the notch cannot fold; it is a plateau of 2 * halfFlat with a smooth rise.
 */
function applyNotch(pts, mouth, cfg) {
  const P = poly(pts);
  const ex = -mouth.qz; const ez = mouth.qx;
  const eOf = (p) => (p.x - mouth.x) * ex + (p.z - mouth.z) * ez;
  const tot = cfg.halfFlat + cfg.rise;
  let near = 0; let bd = Infinity;
  for (let i = 0; i < pts.length; i += 1) { const d = Math.hypot(pts[i].x - mouth.x, pts[i].z - mouth.z); if (d < bd) { bd = d; near = i; } }
  if (bd > 4) return null;
  const tc = tangentAt(P, P.cum[near]);
  if (Math.abs(tc.x * mouth.qz - tc.z * mouth.qx) < 0.3) return null;
  // The zone: from where e leaves -(tot + 2) to where it passes +(tot + 2), walked outward from the nearest vertex.
  let lo = near; while (lo > 0 && Math.abs(eOf(pts[lo])) <= tot + 2) lo -= 1;
  let hi = near; while (hi < pts.length - 1 && Math.abs(eOf(pts[hi])) <= tot + 2) hi += 1;
  if (lo === 0 || hi === pts.length - 1) return null;
  const s0 = P.cum[lo]; const s1 = P.cum[hi];
  const dense = [];
  for (let s = s0; s <= s1 + 1e-9; s += 0.1) {
    const p = pointAt(P, Math.min(s, s1));
    const w = smooth01((tot - Math.abs(eOf(p))) / cfg.rise);
    dense.push({ x: p.x + mouth.qx * cfg.depth * w, z: p.z + mouth.qz * cfg.depth * w });
  }
  const zone = resample(dense, STEP_NOTCH);
  const wOf = (p) => smooth01((tot - Math.abs(eOf(p))) / cfg.rise);
  let first = zone.findIndex((p) => wOf(p) > 1e-6);
  let last = zone.length - 1; while (last > 0 && wOf(zone[last]) <= 1e-6) last -= 1;
  first = Math.max(0, first - 1); last = Math.min(zone.length - 1, last + 1);
  return {
    before: pts.slice(0, lo).concat(zone.slice(0, first + 1)),
    notch: zone.slice(first, last + 1),
    after: zone.slice(last).concat(pts.slice(hi + 1)),
  };
}

/**
 * Wave 79 (P0): where the quay is drawn, on the cope line. The terminal's frame as `fringe/port.js` builds it (origin `QUAY_SEAWARD` seaward of
 * the port edge and `0.28 L` along, yawed to face the sea; the apron spans `CX - 94 .. CX + 108` along it, the cope at `COPE_Z`), as the two ends of
 * the cope in world metres. Null with no port. (Seed 0: x 268.92 and 66.92 at z -38.5; the mesh measures 66.94 to 268.94, 0.02 m wider.)
 */
export function quaySpanOf(city) {
  const roles = fringeRolesOf(city);
  const edge = roles?.yarraEdge;
  if (!edge) return null;
  const extent = city.extent;
  const L = alongLength(edge, extent);
  const sign = harbourAlongSign(roles);
  const sea = edgeAxes(edge).seaward;
  const o = shorePoint(edge, extent, QUAY_SEAWARD, sign * L * COAST_PORT_QUAY.alongK);
  const las = edge === 'south' || edge === 'west' ? 1 : -1;
  const CX = las * sign * (COAST_PORT_QUAY.containerAlongK - COAST_PORT_QUAY.alongK) * L;
  const yaw = Math.atan2(sea.x, sea.z); const co = Math.cos(yaw); const si = Math.sin(yaw);
  const at = (lx) => ({ x: o.x + co * lx + si * COPE_Z, z: o.z - si * lx + co * COPE_Z });
  return { edge, yaw, origin: { x: o.x, z: o.z }, lx0: CX + COAST_PORT_QUAY.x0, lx1: CX + COAST_PORT_QUAY.x1, a: at(CX + COAST_PORT_QUAY.x0), b: at(CX + COAST_PORT_QUAY.x1) };
}

/* ───────────────────────── the curve ───────────────────────── */

/**
 * Build the closed curve for a city and its plan. Returns null when the city has no water edge.
 * @returns {{ xz: Float64Array, label: Uint8Array, n: number, bounds: object, info: object }}
 */
export function buildCoastCurve(city, plan = planEdgeMassing(city), { capR = COAST_SPINE.capR, smooth = NATURAL_SMOOTH_PASSES } = {}) {
  const t0 = now();
  const extent = city.extent;
  const bayEdge = plan.waterEdges[0]; const portEdge = plan.waterEdges[1];
  if (!city.waterEdge || !bayEdge || !portEdge) return null;
  const far = COAST_FAR.on === 1;
  const fr = bayFrame(bayEdge, extent);
  const np = EDGE_N[portEdge]; const nb = EDGE_N[bayEdge];

  // The beach: A's static line, port-side end first. sigma is the sign of d(along) along the path.
  const sigma = Math.sign(fr.a[0] * -np[0] + fr.a[1] * -np[1]) || 1;
  const aStart = fr.alongC - sigma * fr.half;
  const beachPts = [];
  for (let k = -BEACH_EXT; k <= fr.length + BEACH_EXT + 1e-9; k += STEP_BEACH) beachPts.push(beachStaticPoint(fr, aStart + sigma * k));
  const BE = poly(beachPts);
  const sBoardEnd = BEACH_EXT + fr.length;

  // The port's cope line, directed toward the bay.
  const pbase = edgeBase(portEdge, extent);
  const up = [np[1], -np[0]];
  const dp = (up[0] * nb[0] + up[1] * nb[1]) >= 0 ? up : [-up[0], -up[1]];
  const pc = [pbase[0] + np[0] * COAST_PORT_COPE_M, pbase[1] + np[1] * COAST_PORT_COPE_M];
  const portPts = [];
  for (let k = -2600; k <= 2600 + 1e-9; k += 100) portPts.push({ x: pc[0] + dp[0] * k, z: pc[1] + dp[1] * k });
  const PL = poly(portPts);
  // Wave 79 (P0): the quay's two ends as arclengths along the port line (it starts at k = -2600). The port label is true between them only.
  const quay = quaySpanOf(city);
  const sQuay = quay ? [quay.a, quay.b].map((e) => 2600 + (e.x - pc[0]) * dp[0] + (e.z - pc[1]) * dp[1]).sort((p, q) => p - q) : null;

  // The natural legs, far to near.
  const radius = far ? COAST_FAR.width[1] - 2 : COAST_RIM.rFade1 - 4;
  let legs = rimStarts(extent, plan, radius, far).map((s) => traceRim(s, extent, plan, STEP_NATURAL, far)).filter((l) => l.length > 2);
  if (legs.length !== 2) throw new Error(`coast spine: ${legs.length} natural legs for seed ${city.seed}`);
  const score = (leg) => { const e = leg[leg.length - 1]; return seaOf(portEdge, e.x, e.z, extent) - seaOf(bayEdge, e.x, e.z, extent); };
  legs = legs.map((l) => smoothPolyline(l, smooth)).sort((p, q) => score(q) - score(p));
  const LP = poly(extendEnd(legs[0], 300));               // port-side leg, far -> near
  const LBraw = legs[1].slice().reverse();                // bay-side leg, near -> far
  const tIn = tangentAt(poly(legs[1].slice().reverse().slice(0, 6)), 0);
  const LBpts = [];
  for (let s = 300; s > 0; s -= 2) LBpts.push({ x: LBraw[0].x - tIn.x * s, z: LBraw[0].z - tIn.z * s });
  const LB = poly(LBpts.concat(LBraw));

  // Junctions.
  const jc = crossings(BE, PL).filter((c) => c.sP > 0).sort((p, q) => p.sP - q.sP)[0];
  const jp = crossings(LP, PL).sort((p, q) => q.sP - p.sP)[0];
  const jb = crossings(BE, LB).filter((c) => c.sP >= sBoardEnd - 1).sort((p, q) => p.sP - q.sP)[0];
  if (!jc || !jp || !jb) throw new Error(`coast spine: missing junction for seed ${city.seed} (${!!jc} ${!!jp} ${!!jb})`);

  const fP = fillet(LP, jp.sP, PL, jp.sQ, capR);
  const fC = fillet(PL, jc.sQ, BE, jc.sP, capR);
  const fB = fillet(BE, jb.sP, LB, jb.sQ, capR);
  if (fP.sY2 > fC.sX1 - 1) throw new Error('coast spine: the port line is shorter than its two fillets');
  if (fC.sY2 > fB.sX1 - 1) throw new Error('coast spine: the beach is shorter than its two fillets');

  // Sections, in order.
  const sec = [];
  let legPort = slice(LP, 0, fP.sX1);
  let legBay = slice(LB, fB.sY2, LB.len);
  legPort = resample(legPort, STEP_NATURAL);
  legBay = resample(legBay, STEP_NATURAL);
  // The creek's notch on whichever leg holds the mouth.
  const mouth = creekMouth(extent, plan);
  let notch = null;
  if (mouth) {
    for (const which of ['bay', 'port']) {
      const pts = which === 'bay' ? legBay : legPort;
      const r = applyNotch(pts, mouth, CREEK_NOTCH);
      if (r) {
        notch = { which, mouth };
        if (which === 'bay') legBay = r; else legPort = r;
        break;
      }
    }
  }
  const natural = (pts) => ({ label: COAST_LABEL.natural, pts });
  if (notch && notch.which === 'port') {
    sec.push(natural(legPort.before), { label: COAST_LABEL.creek, pts: legPort.notch }, natural(legPort.after));
  } else sec.push(natural(legPort));
  sec.push({ label: COAST_LABEL.natural, pts: fP.arc, fillet: 'port-leg' });
  // The cope line is one straight curve from the port-leg fillet to the corner fillet; the label is port only inside the quay's span, natural beyond it.
  const qa = sQuay ? Math.min(Math.max(sQuay[0], fP.sY2), fC.sX1) : fP.sY2;
  const qb = sQuay ? Math.min(Math.max(sQuay[1], fP.sY2), fC.sX1) : fC.sX1;
  const stretch = (s0, s1, label) => { if (s1 - s0 > 1e-6) sec.push({ label, pts: resample(slice(PL, s0, s1), STEP_PORT) }); };
  if (!(qb - qa > 1e-6)) stretch(fP.sY2, fC.sX1, sQuay ? COAST_LABEL.natural : COAST_LABEL.port);
  else { stretch(fP.sY2, qa, COAST_LABEL.natural); stretch(qa, qb, COAST_LABEL.port); stretch(qb, fC.sX1, COAST_LABEL.natural); }
  sec.push({ label: COAST_LABEL.beach, pts: fC.arc, fillet: 'corner' });
  sec.push({ label: COAST_LABEL.beach, pts: slice(BE, fC.sY2, fB.sX1) });
  sec.push({ label: COAST_LABEL.beach, pts: fB.arc, fillet: 'bay-end' });
  if (notch && notch.which === 'bay') {
    sec.push(natural(legBay.before), { label: COAST_LABEL.creek, pts: legBay.notch }, natural(legBay.after));
  } else sec.push(natural(legBay));

  // The bounds of the field are those of the coast proper; the legs then run straight on for LEG_EXTENSION beyond the last valid rim
  // point, which takes the closure out of the domain, so the field is continuous to its edge.
  let minX = Infinity; let minZ = Infinity; let maxX = -Infinity; let maxZ = -Infinity;
  for (const s of sec) for (const p of s.pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const lastLeg = poly(sec[sec.length - 1].pts);
  const tB = tangentAt(lastLeg, lastLeg.len);
  const tP0 = tangentAt(poly(sec[0].pts), 0);
  const endB = sec[sec.length - 1].pts[sec[sec.length - 1].pts.length - 1];
  const endP = sec[0].pts[0];
  const extB = []; const extP = [];
  for (let s = STEP_NATURAL; s <= LEG_EXTENSION + 1e-9; s += STEP_NATURAL) {
    extB.push({ x: endB.x + tB.x * s, z: endB.z + tB.z * s });
    extP.unshift({ x: endP.x - tP0.x * s, z: endP.z - tP0.z * s });
  }
  sec[sec.length - 1].pts = sec[sec.length - 1].pts.concat(extB);
  sec[0].pts = extP.concat(sec[0].pts);
  // The closure through the land (distance-free): out along the legs' far tangents, round a point far behind the land.
  const farB = sec[sec.length - 1].pts[sec[sec.length - 1].pts.length - 1];
  const farP = sec[0].pts[0];
  const land = { x: -(nb[0] + np[0]), z: -(nb[1] + np[1]) };
  const ll = Math.hypot(land.x, land.z) || 1;
  const cx = extent.x / 2; const cz = extent.z / 2;
  sec.push({
    label: COAST_LABEL.closure,
    pts: [
      farB,
      { x: farB.x + tB.x * 60, z: farB.z + tB.z * 60 },
      { x: cx + (land.x / ll) * 2600, z: cz + (land.z / ll) * 2600 },
      { x: farP.x - tP0.x * 60, z: farP.z - tP0.z * 60 },
      farP,
    ],
  });

  // Flatten: every section keeps all its points but the last (the next section's first).
  const px = []; const lab = []; const filletAt = {};
  for (const s of sec) {
    if (s.fillet) filletAt[s.fillet] = [px.length, px.length + s.pts.length - 1];
    for (let i = 0; i < s.pts.length - 1; i += 1) { px.push(s.pts[i]); lab.push(s.label); }
  }
  const n = px.length;
  const xz = new Float64Array(n * 2);
  const label = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) { xz[2 * i] = px[i].x; xz[2 * i + 1] = px[i].z; label[i] = lab[i]; }
  return {
    seed: city.seed ?? 0, bayEdge, portEdge, extent, capR, xz, label, n,
    bounds: { minX, minZ, maxX, maxZ },
    info: {
      frame: fr, sigma,
      junctions: { port: { x: jp.x, z: jp.z }, corner: { x: jc.x, z: jc.z }, bay: { x: jb.x, z: jb.z } },
      // Wave 79: the quay's two ends (world), their arclengths along the port line, and the port stretch's arclength range there after clipping to the fillets.
      quay: quay ? { a: quay.a, b: quay.b, sA: sQuay[0], sB: sQuay[1], portFrom: qa, portTo: qb, filletFrom: fP.sY2, filletTo: fC.sX1, dir: { x: dp[0], z: dp[1] } } : null,
      fillets: [
        { name: 'port-leg', centre: fP.centre, radius: fP.radius, radiusKnob: fP.radiusKnob, clipped: fP.clipped, delta: fP.delta, vertices: filletAt['port-leg'] },
        { name: 'corner', centre: fC.centre, radius: fC.radius, radiusKnob: fC.radiusKnob, clipped: fC.clipped, delta: fC.delta, vertices: filletAt.corner },
        { name: 'bay-end', centre: fB.centre, radius: fB.radius, radiusKnob: fB.radiusKnob, clipped: fB.clipped, delta: fB.delta, vertices: filletAt['bay-end'] },
      ],
      creek: mouth ? { x: mouth.x, z: mouth.z, qx: mouth.qx, qz: mouth.qz, onLeg: notch ? notch.which : null } : null,
      extensionVertices: 2 * Math.round(LEG_EXTENSION / STEP_NATURAL),
      buildMs: now() - t0,
    },
  };
}

/* ───────────────────────── the field ───────────────────────── */

/**
 * Bake the signed distance (metres, positive seaward, clamped to +-64) and a label byte at 1 m per texel over the curve's bounding box
 * plus the clamp. The distance is exact to the curve's segments: each segment writes the squared distance into the texels within the
 * clamp of it (a capsule scan, so nothing is brute force over every segment and texel); the sign is the polygon's, from a scanline
 * parity per row. Closure segments give sign only. The result is a `Uint16Array` of half floats and a `Uint8Array` of labels.
 */
export function bakeCoastField(curve, { clamp = COAST_SPINE_CLAMP } = {}) {
  const t0 = now();
  const { xz, label, n, bounds } = curve;
  const m = clamp + 2;
  const x0 = Math.floor(bounds.minX - m); const z0 = Math.floor(bounds.minZ - m);
  const w = Math.ceil(bounds.maxX + m) - x0; const h = Math.ceil(bounds.maxZ + m) - z0;
  const N = w * h;
  const clamp2 = clamp * clamp;
  const d2 = new Float32Array(N).fill(clamp2 + 1);
  const lab = new Uint8Array(N).fill(COAST_LABEL.none);
  // Wave 75 fix 2: the beach weight. The curve's arc length gives each foot point a position s; the weight is 1 along the beach label, 0
  // along the rest, and across `COAST_LABEL_BLEND.band` m centred on each change of beach against the rest it runs by a smoothstep through
  // 0.5 at the change's vertex. A texel takes the weight at its nearest segment's foot point, so it varies along the curve and not across it.
  const arc = new Float64Array(n + 1);
  for (let i = 0; i < n; i += 1) { const k = (i + 1) % n; arc[i + 1] = arc[i] + Math.hypot(xz[2 * k] - xz[2 * i], xz[2 * k + 1] - xz[2 * i + 1]); }
  const perimeter = arc[n];
  const changes = [];
  for (let i = 0; i < n; i += 1) {
    const prev = label[(i + n - 1) % n]; const cur = label[i];
    if (prev === COAST_LABEL.closure || cur === COAST_LABEL.closure) continue;
    if ((prev === COAST_LABEL.beach) !== (cur === COAST_LABEL.beach)) changes.push({ s: arc[i], up: cur === COAST_LABEL.beach ? 1 : -1 });
  }
  const wt = new Float32Array(N);
  const bandHalf = COAST_LABEL_BLEND.band / 2;
  // Wave 79 (P0): the port weight, the same rule at each change of port against the rest (the quay's two ends), across `COAST_PORT_BLEND.band`.
  const changesP = [];
  for (let i = 0; i < n; i += 1) {
    const prev = label[(i + n - 1) % n]; const cur = label[i];
    if (prev === COAST_LABEL.closure || cur === COAST_LABEL.closure) continue;
    if ((prev === COAST_LABEL.port) !== (cur === COAST_LABEL.port)) changesP.push({ s: arc[i], up: cur === COAST_LABEL.port ? 1 : -1 });
  }
  const wp = new Float32Array(changesP.length ? N : 0);
  const bandHalfP = COAST_PORT_BLEND.band / 2;

  for (let i = 0; i < n; i += 1) {
    if (label[i] === COAST_LABEL.closure) continue;
    const k = (i + 1) % n;
    const ax = xz[2 * i]; const az = xz[2 * i + 1]; const bx = xz[2 * k]; const bz = xz[2 * k + 1];
    const dx = bx - ax; const dz = bz - az;
    const l2 = dx * dx + dz * dz || 1e-12;
    const inv = 1 / l2;
    const minZ = Math.min(az, bz); const maxZ = Math.max(az, bz);
    const minX = Math.min(ax, bx); const maxX = Math.max(ax, bx);
    const j0 = Math.max(0, Math.floor(minZ - clamp - z0 - 0.5)); const j1 = Math.min(h - 1, Math.ceil(maxZ + clamp - z0 - 0.5));
    const lb = label[i];
    const segLen = arc[i + 1] - arc[i];
    const base = lb === COAST_LABEL.beach ? 1 : 0;
    const baseP = lb === COAST_LABEL.port ? 1 : 0;
    const nearP = changesP.filter((c) => [0, -perimeter, perimeter].some((o) => c.s + o > arc[i] - bandHalfP && c.s + o < arc[i + 1] + bandHalfP));
    const segWeightP = (t) => {
      const sPos = arc[i] + t * segLen;
      for (const c of nearP) for (const o of [0, -perimeter, perimeter]) {
        const u = (sPos - (c.s + o)) / COAST_PORT_BLEND.band;
        if (Math.abs(u) < 0.5) return ss01(0, 1, 0.5 + c.up * u);
      }
      return baseP;
    };
    const near = changes.filter((c) => [0, -perimeter, perimeter].some((o) => c.s + o > arc[i] - bandHalf && c.s + o < arc[i + 1] + bandHalf));
    const segWeight = (t) => {
      const sPos = arc[i] + t * segLen;
      for (const c of near) for (const o of [0, -perimeter, perimeter]) {
        const u = (sPos - (c.s + o)) / COAST_LABEL_BLEND.band;
        if (Math.abs(u) < 0.5) return ss01(0, 1, 0.5 + c.up * u);
      }
      return base;
    };
    for (let j = j0; j <= j1; j += 1) {
      const zc = z0 + j + 0.5;
      const gz = zc < minZ ? minZ - zc : zc > maxZ ? zc - maxZ : 0;
      const rx = Math.sqrt(Math.max(0, clamp2 - gz * gz));
      const i0 = Math.max(0, Math.ceil(minX - rx - x0 - 0.5)); const i1 = Math.min(w - 1, Math.floor(maxX + rx - x0 - 0.5));
      const row = j * w;
      const pz = zc - az;
      for (let ii = i0; ii <= i1; ii += 1) {
        const px = x0 + ii + 0.5 - ax;
        let t = (px * dx + pz * dz) * inv;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - t * dx; const ez = pz - t * dz;
        const e2 = ex * ex + ez * ez;
        const idx = row + ii;
        if (e2 < d2[idx]) {
          d2[idx] = e2; lab[idx] = lb; wt[idx] = near.length ? segWeight(t) : base;
          if (wp.length) wp[idx] = nearP.length ? segWeightP(t) : baseP;
        }
      }
    }
  }

  // Sign: scanline parity at the row centres over every edge (closure included), land inside.
  const cnt = new Int32Array(h + 1);
  const edges = [];
  for (let i = 0; i < n; i += 1) {
    const k = (i + 1) % n;
    const az = xz[2 * i + 1]; const bz = xz[2 * k + 1];
    if (az === bz) continue;
    const zl = Math.min(az, bz); const zh = Math.max(az, bz);
    // rows with zl <= zc < zh
    const jA = Math.max(0, Math.ceil(zl - z0 - 0.5)); const jB = Math.min(h - 1, Math.ceil(zh - z0 - 0.5) - 1);
    if (jB < jA) continue;
    edges.push(i, jA, jB);
    for (let j = jA; j <= jB; j += 1) cnt[j + 1] += 1;
  }
  for (let j = 0; j < h; j += 1) cnt[j + 1] += cnt[j];
  const cx = new Float64Array(cnt[h]);
  const fill = cnt.slice(0, h);
  for (let e = 0; e < edges.length; e += 3) {
    const i = edges[e]; const k = (i + 1) % n;
    const ax = xz[2 * i]; const az = xz[2 * i + 1]; const bx = xz[2 * k]; const bz = xz[2 * k + 1];
    const slope = (bx - ax) / (bz - az);
    for (let j = edges[e + 1]; j <= edges[e + 2]; j += 1) cx[fill[j]++] = ax + (z0 + j + 0.5 - az) * slope;
  }
  const HP = floatToHalf(clamp); const HN = floatToHalf(-clamp);
  const data = new Uint16Array(N);
  const weight = new Uint16Array(N);
  const portWeight = new Uint16Array(N);
  const inside = new Uint8Array(w);
  for (let j = 0; j < h; j += 1) {
    const a = cnt[j]; const b = cnt[j + 1];
    // insertion sort of this row's crossings
    for (let p = a + 1; p < b; p += 1) { const v = cx[p]; let q = p - 1; while (q >= a && cx[q] > v) { cx[q + 1] = cx[q]; q -= 1; } cx[q + 1] = v; }
    inside.fill(0);
    for (let p = a; p + 1 < b; p += 2) {
      const i0 = Math.max(0, Math.ceil(cx[p] - x0 - 0.5)); const i1 = Math.min(w - 1, Math.ceil(cx[p + 1] - x0 - 0.5) - 1);
      for (let ii = i0; ii <= i1; ii += 1) inside[ii] = 1;
    }
    const row = j * w;
    for (let ii = 0; ii < w; ii += 1) {
      const e2 = d2[row + ii];
      if (e2 > clamp2) data[row + ii] = inside[ii] ? HN : HP;
      else { const d = Math.sqrt(e2); data[row + ii] = floatToHalf(inside[ii] ? -d : d); weight[row + ii] = floatToHalf(wt[row + ii]); if (wp.length) portWeight[row + ii] = floatToHalf(wp[row + ii]); }
    }
  }
  const labelCounts = {};
  for (const name of COAST_LABEL_NAMES) labelCounts[name] = 0;
  for (let i = 0; i < n; i += 1) labelCounts[COAST_LABEL_NAMES[label[i]]] += 1;
  return {
    data, labels: lab, weight, portWeight, x0, z0, w, h, texel: COAST_SPINE_TEXEL, clamp, curve,
    stats: {
      bakeMs: now() - t0, curveMs: curve.info.buildMs, texels: N, bytes: data.byteLength + lab.byteLength + weight.byteLength,
      dataBytes: data.byteLength, labelBytes: lab.byteLength, weightBytes: weight.byteLength, vertices: n, vertexLabels: labelCounts,
    },
  };
}

/**
 * The one sampling rule. Bilinear over the texel centres (the half-texel offset), clamped at the edge: the same arithmetic as
 * `ddCoastSpineD` in `COAST_SPINE_GLSL`. Metres, positive seaward, within +-64.
 */
export function sampleCoastD(field, x, z) { return sampleHalfField(field, field.data, x, z); }
/** The beach weight (0 to 1) at a world point, by the one sampling rule (the same bilinear read as `sampleCoastD`, on the weight texels). */
export function sampleCoastW(field, x, z) { return sampleHalfField(field, field.weight, x, z); }
/** Wave 79 (P0): the port weight (0 to 1): 1 along the quay's span, 0 elsewhere, a smoothstep across `COAST_PORT_BLEND.band` m at each end. By the same rule; JS only. */
export function sampleCoastPortW(field, x, z) { return sampleHalfField(field, field.portWeight, x, z); }
export function sampleHalfField(field, data, x, z) {
  const { w, h, x0, z0, texel } = field;
  const px = (x - x0) / texel - 0.5; const pz = (z - z0) / texel - 0.5;
  const fi = Math.floor(px); const fj = Math.floor(pz);
  const fx = px - fi; const fz = pz - fj;
  const ia = fi < 0 ? 0 : fi > w - 1 ? w - 1 : fi; const ib = fi + 1 < 0 ? 0 : fi + 1 > w - 1 ? w - 1 : fi + 1;
  const ja = fj < 0 ? 0 : fj > h - 1 ? h - 1 : fj; const jb = fj + 1 < 0 ? 0 : fj + 1 > h - 1 ? h - 1 : fj + 1;
  const d00 = halfToFloat(data[ja * w + ia]); const d10 = halfToFloat(data[ja * w + ib]);
  const d01 = halfToFloat(data[jb * w + ia]); const d11 = halfToFloat(data[jb * w + ib]);
  return (d00 * (1 - fx) + d10 * fx) * (1 - fz) + (d01 * (1 - fx) + d11 * fx) * fz;
}

/** The same rule in GLSL ES 3.00. `tex` is the field as R16F (one texel per metre), `rect` is (x0, z0, width, height). No shader uses it yet. */
export const COAST_SPINE_GLSL = /* glsl */ `
  #ifndef DD_COAST_SPINE
  #define DD_COAST_SPINE
  const float DD_COAST_SPINE_TEXEL = ${COAST_SPINE_TEXEL.toFixed(1)};
  const float DD_COAST_SPINE_CLAMP = ${COAST_SPINE_CLAMP.toFixed(1)};
  float ddCoastSpineD(sampler2D tex, vec4 rect, vec2 xz) {
    vec2 p = (xz - rect.xy) / DD_COAST_SPINE_TEXEL - 0.5;
    vec2 i0 = floor(p);
    vec2 f = p - i0;
    ivec2 hi = ivec2(rect.zw) - 1;
    ivec2 a = clamp(ivec2(i0), ivec2(0), hi);
    ivec2 b = clamp(ivec2(i0) + 1, ivec2(0), hi);
    float d00 = texelFetch(tex, ivec2(a.x, a.y), 0).r;
    float d10 = texelFetch(tex, ivec2(b.x, a.y), 0).r;
    float d01 = texelFetch(tex, ivec2(a.x, b.y), 0).r;
    float d11 = texelFetch(tex, ivec2(b.x, b.y), 0).r;
    return mix(mix(d00, d10, f.x), mix(d01, d11, f.x), f.y);
  }
  #endif
`;

function nearestSegment(curve, x, z) {
  const { xz, label, n } = curve;
  let best = Infinity; let lb = COAST_LABEL.none; let seg = -1; let tt = 0;
  for (let i = 0; i < n; i += 1) {
    if (label[i] === COAST_LABEL.closure) continue;
    const k = (i + 1) % n;
    const ax = xz[2 * i]; const az = xz[2 * i + 1];
    const dx = xz[2 * k] - ax; const dz = xz[2 * k + 1] - az;
    let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1e-12);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const e = (x - ax - t * dx) ** 2 + (z - az - t * dz) ** 2;
    if (e < best) { best = e; lb = label[i]; seg = i; tt = t; }
  }
  return { d: Math.sqrt(best), label: lb, seg, t: tt };
}

/** The label byte of the texel holding (x, z): the texel rule alone, as a shader reads it (no neighbour fallback); 255 outside the field. */
export function coastLabelByteAt(field, x, z) {
  const i = Math.floor((x - field.x0) / field.texel); const j = Math.floor((z - field.z0) / field.texel);
  return i >= 0 && j >= 0 && i < field.w && j < field.h ? field.labels[j * field.w + i] : COAST_LABEL.none;
}

/** The label (a name) of the nearest curve segment; baked inside the clamp, searched on demand beyond it. */
export function coastLabelAt(field, x, z) {
  const i = Math.floor((x - field.x0) / field.texel); const j = Math.floor((z - field.z0) / field.texel);
  {
    const b = coastLabelByteAt(field, x, z);
    if (b !== COAST_LABEL.none) {
      // Wave 75: the byte is the label at the texel's CENTRE, so a texel the label boundary runs through is wrong for the points on the far side of
      // the boundary (111 of 300 points within 0.5 m of a label change at seed 0). A texel with a different label among its eight neighbours is
      // on such a boundary: ask the curve itself. (The GPU's lookup has no such fallback: it is exact only to a texel, 0.71 m across a boundary.)
      let edge = false;
      for (let dj = -1; dj <= 1 && !edge; dj += 1) {
        for (let di = -1; di <= 1; di += 1) {
          const ii = i + di; const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= field.w || jj >= field.h) continue;
          if (field.labels[jj * field.w + ii] !== b) { edge = true; break; }
        }
      }
      if (!edge) return COAST_LABEL_NAMES[b];
    }
  }
  return COAST_LABEL_NAMES[nearestSegment(field.curve, x, z).label];
}

/** The nearest non-closure segment to a point: { d, label, seg, t } (brute force; for the tests and the measurements). */
export function exactFoot(curve, x, z) {
  return nearestSegment(curve, x, z);
}

/**
 * The exact signed distance to the curve, brute force, for the tests and the measurements: the nearest non-closure segment, signed by the
 * polygon's winding number (land negative). It shares no code with the bake.
 */
export function exactCoastD(curve, x, z) {
  const { xz, n } = curve;
  let winding = 0;
  for (let i = 0; i < n; i += 1) {
    const k = (i + 1) % n;
    const a1 = Math.atan2(xz[2 * i + 1] - z, xz[2 * i] - x);
    const a2 = Math.atan2(xz[2 * k + 1] - z, xz[2 * k] - x);
    let d = a2 - a1;
    if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
    winding += d;
  }
  const inside = Math.abs(winding) > Math.PI;
  const d = nearestSegment(curve, x, z).d;
  return inside ? -d : d;
}

/* ───────────────────────── the beach profile (wave 75, phase 2a) ───────────────────────── */

/**
 * The field the CPU readers of the shelf (`beachSection` in sand.js, and through it the bed bake in outer-ocean.js) sample, set by the water
 * surface when it builds the spine with the switch on and cleared when it is disposed. Null whenever the switch is off, so every CPU reader
 * keeps today's position exactly. One field at a time (the page has one city).
 */
let ACTIVE = null;
export function setActiveCoastSpine(field) { ACTIVE = COAST_SPINE.on ? (field ?? null) : null; return ACTIVE; }
export function activeCoastSpine() { return ACTIVE; }
/**
 * THE one front (wave 75 fix 1 and 2), read by the shelf's shader (`COAST_SHELF_FRONT_GLSL`, the same arithmetic), the bed bake and
 * `beachSection`; phase 2b's water must read it too. At a world point: `spine` is the field's d (less the beach offset) inside the board's
 * along-shore extent, and past each board end it blends to today's cap circle over `BEACH_EXTENT.feather` m (`beachExtentFront`); `oldFront` is
 * the front source A gives there. The result is `oldFront + (spine - oldFront) * w`, with w the baked beach weight (`sampleCoastW`: 1 inside the
 * beach label, 0 outside it, a smoothstep across `COAST_LABEL_BLEND.band` m along the curve at each change), so port, natural and creek keep
 * today's front exactly and the label's edge has no step. Without `oldFront` the spine front alone. NaN with no active field.
 */
export function coastSpineFront(x, z, field = ACTIVE, coastLine = null, oldFront = NaN) {
  if (!field) return NaN;
  const d = sampleCoastD(field, x, z) - COAST_SPINE.beachOffset;
  const fr = field.curve?.info?.frame;
  const spine = !coastLine || !fr ? d
    : beachExtentFront(d, x * fr.a[0] + z * fr.a[1], (x - fr.O[0]) * fr.n[0] + (z - fr.O[1]) * fr.n[1], fr.alongC, fr.half, coastLine(x * fr.a[0] + z * fr.a[1]));
  if (!Number.isFinite(oldFront)) return spine;
  const w = sampleCoastW(field, x, z);
  return w <= 0 ? oldFront : w >= 1 ? spine : oldFront + (spine - oldFront) * w;
}

/**
 * Wave 75 fix 1: the shelf's along-shore extent on the spine path is today's. Past a board end (`extra` > 0 metres along) the old front was the
 * circle `hypot(extra, shore) - coast` (47.6 m, the waterline's own reach), which is positive, and so hidden, outside it; d alone is negative over
 * all the land, so without this the shelf ran on over the grass as a tan slab. Inside the board's own span the front is d. Past it the front
 * blends to the circle, `d + (circle - d) * smoothstep(0, feather, extra)`, so beyond `feather` m the front IS today's circle (the second pass: the
 * first took the larger of the two and left a blue pond where the spine's own cap lay inside the old circle). `coast` is the
 * old meander at t = 0 (the extent keeps still), `alongC` and `half` the bay frame's centre and half length.
 */
export const BEACH_EXTENT = Object.freeze({ feather: 3.0 });
export function beachExtentFront(d, along, shore, alongC, half, coast) {
  const extra = Math.abs(along - alongC) - Math.max(half, 1);
  if (extra <= 0) return d;
  const circle = Math.hypot(extra, shore) - coast;
  return d + (circle - d) * ss01(0, BEACH_EXTENT.feather, extra);
}

/**
 * Wave 75 fix 3: how far past a board end a world point lies, as the front's own blend weight `smoothstep(0, feather, extra)`: 0 inside the
 * board's along-shore extent, 1 from `feather` m past either end. The bed's gate (`physicalSeabedDepthAt`) blends to today's by this same weight, so
 * that over the land past the caps the bed is today's and the beach's underwater slope is not drawn under the grass. 0 with no frame.
 */
export function beachExtentWeight(field, x, z) {
  const fr = field?.curve?.info?.frame;
  if (!fr) return 0;
  const extra = Math.abs(x * fr.a[0] + z * fr.a[1] - fr.alongC) - Math.max(fr.half, 1);
  return extra <= 0 ? 0 : ss01(0, BEACH_EXTENT.feather, extra);
}

/** The bed's land guard (`physicalSeabedDepthAt`): on the land side (d < 0) the shelf's correction fades to 0 as the front rises from `from` to `to` metres. */
export const BEACH_LAND_GUARD = Object.freeze({ from: 0, to: 2 });

/** The height of the drawn sea sheet, read from the sheet's own constant (`WATER_Y`, contract.js; `outer-ocean.js` and `water.js` build the sheet at it). */
export const SEA_SHEET_Y = WATER_Y;
/** Mean of `faceLenAt` (7.2 to 14.2 m): the face length the relief-free profile uses when the caller gives none. */
export const BEACH_FACE_MEAN_M = 10.7;
/**
 * The datum inputs of the corner terms (`SEA_DATUM`, branch taste/w69-sea-datum at 72399311, not merged): the sheet as the top, the clearance
 * under it (0 here, not SEA_DATUM's 0.008: wave 75 fix 3 needs y(0) within 5 mm of the sheet, and the straight beach already sits on it), the pad's seaward reach, the ceiling's fall (0.20, against 0.10 in sand.js) and the pad's landward start (-32, against -12).
 */
export const BEACH_DATUM = Object.freeze({ top: SEA_SHEET_Y, clear: 0, pad: 3.0, fall: 0.20, land: -32 });
/**
 * Relief on the spine path: the cusps, bench, dune, ridge, wrack and tooth of the shelf fade to nothing at d = 0 (gate 1 landward of `from`,
 * 0 at `to`), and the sand never sits lower than `keep` of its profile's height over the sheet, so the sand crosses the sheet at d = 0 and is
 * above it for every d < 0. Without this the cusps (+-0.34 m at the waterline) move the drawn crossing by up to 5 m.
 */
export const BEACH_RELIEF = Object.freeze({ from: -1.5, to: 0.0, keep: 0.5 });
function ss01(e0, e1, x) { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
export function beachReliefGate(d) { return 1 - ss01(BEACH_RELIEF.from, BEACH_RELIEF.to, d); }
/** The shader's text of the relief gate and the floor (the same arithmetic as `beachReliefGate` and `beachReliefFloor`). */
export const COAST_BEACH_RELIEF_GLSL = /* glsl */ `
  float ddSpineRelief(float front) { return 1.0 - smoothstep(${BEACH_RELIEF.from.toFixed(2)}, ${BEACH_RELIEF.to.toFixed(2)}, front); }
`;
/** The lowest local height (metres over SAND_Y) the sand may take at `d` landward of the zero, given its profile's local height `prof`. */
export function beachReliefFloor(d, prof, seaY = SEA_SHEET_Y) {
  if (!(d <= 0)) return -Infinity;
  const w = seaY - SAND_Y;
  return w + (prof - w) * BEACH_RELIEF.keep;
}

/**
 * The cross-section for one label, as functions of d (metres, positive seaward). Phase 2a: `beach` only (anything else returns null).
 * It is the shelf's present section in `water/sand.js` (`sectionLocalY` without the along-dependent relief): the dry berm and its face, the
 * submerged face at the shelf's 1:15, the bed floor, all seated on the sea sheet's height so that y(0) is the sheet's. Options:
 *   along   shore-frame along, for the face length (`faceLenAt` in sand.js has the noise; omitted, the mean 10.7 m is used)
 *   faceLen the face length in metres (overrides `along`)
 *   seaY    the sheet's height (default `SEA_SHEET_Y`)
 *   mask    the corner mask 0..1 (default 0, the straight beach); above 0 the pad's lift and the sloping ceiling apply, with `datum` as inputs
 *   datum   { top, clear, pad, fall, land } (default `BEACH_DATUM`)
 * Returns { label, d, y (world), local (over SAND_Y), depth (metres under the sheet, 0 on land), bands }. `bands` are the d at which each band
 * of `SAND_A8` is half in (its smoothstep's midpoint): the damp-to-wet edge, the swash film's, the foam band's start and end, and the dry
 * sand's seaward end (the damp band's start); every one is a constant of d on the spine path, since the shelf's front is d.
 */
export function coastProfile(d, label, opts = {}) {
  const name = typeof label === 'number' ? COAST_LABEL_NAMES[label] : label;
  if (name !== 'beach') return null;
  const seaY = opts.seaY ?? SEA_SHEET_Y;
  const len = Number.isFinite(opts.faceLen) ? opts.faceLen : BEACH_FACE_MEAN_M;
  const mask = opts.mask ?? 0;
  const dm = { ...BEACH_DATUM, ...(opts.datum ?? {}) };
  const u = PROFILE_U;
  const free = ss01(-26.0, -21.5, d);
  const bermAt = -len;
  const crestH = faceFallAt(len, u) - (SAND_Y - seaY);
  let ramp = crestH * ss01(bermAt - 6.5, bermAt, d);
  const oldAt = bermAt - 9.0 - 2.2 * 0.5;
  ramp += crestH * 0.34 * ss01(oldAt - 5.5, oldAt, d) * (1 - ss01(bermAt - 6.5, bermAt - 1.5, d));
  const x = Math.max(d - bermAt, 0);
  const profile = ramp - faceFallAt(x, u);
  let dry = profile * free;
  dry += (1 - ss01(0.35, 5.2, d + WATER_FACE)) * 0.48;
  const bed = -((SAND_Y - seaY) + Math.min(SHELF_FACE.slope * Math.max(d, 0), SHELF_FACE.cap));
  let h = Math.max(dry + (bed - dry) * ss01(0.0, SHELF_FACE.blend, d), BED_FLOOR);
  if (mask >= 0.002) {
    const landT = 1 - ss01(dm.land, 0, d);
    const seaT = 1 - ss01(0, dm.pad, d);
    const waterLift = dm.top - dm.clear - seaY;
    const lift = waterLift + (SHORE.cornerWrapLift - waterLift) * landT;
    h += lift * Math.max(seaT, landT) * mask;
    const ceil = Math.max(dm.top - dm.clear - SAND_Y - Math.max(d, 0) * dm.fall + Math.max(-d, 0) * SAND_PM1.landwardRise, BED_FLOOR);
    const gate = ss01(SAND_PM1.seaCapFrom, SAND_PM1.seaCapTo, d) * mask;
    h += (Math.min(h, ceil) - h) * gate;
  }
  const mid = (a, b) => (a + b) / 2;
  return {
    label: 'beach', d, local: h, y: SAND_Y + h, depth: Math.max(0, seaY - (SAND_Y + h)),
    bands: {
      dampFrom: SAND_A8.wetFrom, wetEdge: mid(SAND_A8.wetFrom, SAND_A8.wetTo), wetFull: SAND_A8.wetTo,
      swashEdge: mid(SAND_A8.swashFrom, SAND_A8.swashTo), foamFrom: SAND_A8.foamFrom, foamTo: SAND_A8.foamTo,
    },
  };
}

/**
 * The shelf's front on the spine path, in GLSL: `ddWrapFront` of sand.js with d from the texture. `(along, shore)` is the shore frame, so the
 * world point is rebuilt from `uShoreOrigin` and `uShoreNormal` (the inverse of `ddAlong` and `ddShoreDist`). Declares the texture, rect
 * and offset uniforms it needs; `COAST_SPINE_GLSL` must come first. The old function stays in the text as `ddWrapFrontLegacy`.
 */
export const COAST_SHELF_FRONT_GLSL = /* glsl */ `
  uniform highp sampler2D uCoastSpineD;
  uniform highp sampler2D uCoastSpineW;
  uniform vec4 uCoastSpineRect;
  uniform float uCoastSpineBeachOffset;
  vec2 ddSpineXZ(float along, float shore) {
    vec2 n = uShoreNormal.xz;
    vec2 a = vec2(uShoreNormal.z, -uShoreNormal.x);
    return uShoreOrigin.xz + n * shore + a * (along - dot(uShoreOrigin.xz, a));
  }
  float ddWrapFrontLegacy(float along, float shore, float t);
  // The one front (coastSpineFront in coast-spine.js, the same arithmetic): the beach weight w gates the spine's front against the old one.
  float ddWrapFront(float along, float shore, float t) {
    vec2 xz = ddSpineXZ(along, shore);
    float w = ddCoastSpineD(uCoastSpineW, uCoastSpineRect, xz);
    float legacy = ddWrapFrontLegacy(along, shore, t);
    if (w <= 0.0) return legacy;
    float d = ddCoastSpineD(uCoastSpineD, uCoastSpineRect, xz) - uCoastSpineBeachOffset;
    float extra = abs(along - uBayCentre) - max(uAlongHalf, 1.0);
    float spine = d;
    if (extra > 0.0) {
      float circle = length(vec2(extra, shore)) - ddCoastLine(along, 0.0);
      spine = d + (circle - d) * smoothstep(0.0, ${BEACH_EXTENT.feather.toFixed(2)}, extra);
    }
    return w >= 1.0 ? spine : legacy + (spine - legacy) * w;
  }
`;

/**
 * Wave 75 phase 2b lane 1: the sea's front. `ddSpineWaterFront(xz, oldFront, wBeach)` is `coastSpineFront` for the water's two stages (the
 * ocean's vertex stage and the aqua fragment): the same arithmetic as the shelf's `ddWrapFront` (d inside the board's along-shore extent,
 * today's cap circle past each end, gated by the baked beach weight), with `oldFront` (the packed SDF front the vertex stage reads from the depth
 * bake) in place of the shelf's old front. The spine's front is faded back to `oldFront` from `SPINE_WATER.fadeFrom` to `fadeTo` m seaward, so the
 * wave field's phase far out is today's and the d texture's 64 m clamp is never met. `wBeach` returns the beach weight (0 outside the beach label).
 * Needs `SHORE_COMMON_GLSL` (uShoreOrigin, uShoreNormal, ddCoastLine) and `COAST_SPINE_GLSL` first; declares the same uniforms as the shelf's.
 */
export const SPINE_WATER = Object.freeze({
  fadeFrom: 24, fadeTo: 56,
  /** The sheet's alpha falls to 0 over this many metres landward of the front's zero, where the sand stands above the sheet. */
  edgeM: 0.5,
  /** The shelf-cover shift (the depth the clear-shallows law reads as already under the sheet at the front's zero) falls to 0 by this front, m. */
  blendM: 8,
  /** The vertex swell is 0 up to `swellFrom` m of the front and full from `swellTo`: the mesh's cells are up to ~2 m across the shore, and a vertex that swells lifts the sheet over the cell before it (the sheet must stay at the sea level on d <= 0). */
  swellFrom: 2, swellTo: 4,
});
export const COAST_WATER_FRONT_GLSL = /* glsl */ `
  uniform highp sampler2D uCoastSpineD;
  uniform highp sampler2D uCoastSpineW;
  uniform vec4 uCoastSpineRect;
  uniform float uCoastSpineBeachOffset;
  uniform vec2 uCoastSpineExtent; // the bay frame's centre along the shore and half length (field.curve.info.frame)
  float gSpineRaw = 0.0; // the spine's own front at the last call (d inside the extent, the cap circle past it), before it is mixed with the old one
  float ddSpineWaterFront(vec2 xz, float oldFront, out float wBeach) {
    wBeach = ddCoastSpineD(uCoastSpineW, uCoastSpineRect, xz);
    gSpineRaw = oldFront;
    if (wBeach <= 0.0) { wBeach = 0.0; return oldFront; }
    wBeach = min(wBeach, 1.0);
    float d = ddCoastSpineD(uCoastSpineD, uCoastSpineRect, xz) - uCoastSpineBeachOffset;
    float along = dot(xz, vec2(uShoreNormal.z, -uShoreNormal.x));
    float shore = dot(xz - uShoreOrigin.xz, uShoreNormal.xz);
    float extra = abs(along - uCoastSpineExtent.x) - max(uCoastSpineExtent.y, 1.0);
    float spine = d;
    float extW = 0.0; // 0 inside the board's extent, 1 from feather m past either end (the bed's own rule, beachExtentWeight)
    if (extra > 0.0) {
      float circle = length(vec2(extra, shore)) - ddCoastLine(along, 0.0);
      extW = smoothstep(0.0, ${BEACH_EXTENT.feather.toFixed(2)}, extra);
      spine = d + (circle - d) * extW;
    }
    gSpineRaw = spine;
    wBeach *= 1.0 - extW; // wave 77 (fix 1): the beach's overrides end with the board: past the caps the sheet and the front are today's
    float k = wBeach * (1.0 - smoothstep(${SPINE_WATER.fadeFrom.toFixed(1)}, ${SPINE_WATER.fadeTo.toFixed(1)}, max(spine, 0.0)));
    return oldFront + (spine - oldFront) * k;
  }
`;

/** The same front on the CPU (parity reference for `ddSpineWaterFront`): `oldFront` is the packed SDF front; `coastLine` the old meander at t = 0. */
export function coastSpineWaterFront(x, z, oldFront, field = ACTIVE, coastLine = null) {
  if (!field) return oldFront;
  const w = coastSpineWaterWeight(x, z, field);
  if (w <= 0) return oldFront;
  const spine = coastSpineFront(x, z, field, coastLine);
  const k = w * (1 - ss01(SPINE_WATER.fadeFrom, SPINE_WATER.fadeTo, Math.max(spine, 0)));
  return oldFront + (spine - oldFront) * k;
}

/** The weight `ddSpineWaterFront` returns in `wBeach` (wave 77): the baked beach weight, ended by the board's extent (`beachExtentWeight`: 0 inside, 1 from `BEACH_EXTENT.feather` m past either end). */
export function coastSpineWaterWeight(x, z, field = ACTIVE) {
  if (!field) return 0;
  const w = Math.min(Math.max(sampleCoastW(field, x, z), 0), 1);
  return w <= 0 ? 0 : w * (1 - beachExtentWeight(field, x, z));
}

/* ───────────────────────── the GPU textures ───────────────────────── */

/**
 * Uniform names the GLSL below expects. The distance is a half-float texture read with `texelFetch` by integer index (four fetches and the
 * `mix` of `ddCoastSpineD`), so no path needs linear filtering or mipmaps; the label byte is an unsigned-integer texture (`usampler2D`).
 */
export const COAST_SPINE_UNIFORM_NAMES = Object.freeze({ d: 'uCoastSpineD', label: 'uCoastSpineLabel', weight: 'uCoastSpineW', rect: 'uCoastSpineRect', texel: 'uCoastSpineTexel' });

/**
 * The field as two `THREE.DataTexture`s, made once per field and held on it (`field.gpu`):
 *   d      `RedFormat` + `HalfFloatType` (R16F), `NearestFilter`, no mipmaps; the baked `Uint16Array` is the texture's data unchanged.
 *   label  `RedIntegerFormat` + `UnsignedByteType` (R8UI), `NearestFilter`, read as `usampler2D` with `texelFetch`: an exact byte (255 = none),
 *          not a normalised read that would need a times-255 and a rounding.
 * `unpackAlignment` is 1 on both: a row of 1227 texels is 2454 bytes (d) or 1227 bytes (label), not a multiple of the default 4.
 * Called only when `COAST_SPINE` is on (WaterSurface does); nothing in node or in the picture builds them otherwise.
 */
export function createCoastSpineTextures(field) {
  if (field.gpu) return field.gpu;
  const d = new THREE.DataTexture(field.data, field.w, field.h, THREE.RedFormat, THREE.HalfFloatType);
  const label = new THREE.DataTexture(field.labels, field.w, field.h, THREE.RedIntegerFormat, THREE.UnsignedByteType);
  const weight = new THREE.DataTexture(field.weight, field.w, field.h, THREE.RedFormat, THREE.HalfFloatType);
  for (const t of [d, label, weight]) {
    t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false; t.unpackAlignment = 1;
    t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
  }
  d.name = 'coast-spine:d'; label.name = 'coast-spine:label'; weight.name = 'coast-spine:weight';
  field.gpu = { d, label, weight, uniforms: null };
  return field.gpu;
}

/** The uniforms a shader needs to call the sampler: the two textures, the field's rect (x0, z0, width, height) and the texel size. Shared per field. */
export function coastSpineUniforms(field) {
  const gpu = createCoastSpineTextures(field);
  if (!gpu.uniforms) {
    gpu.uniforms = {
      [COAST_SPINE_UNIFORM_NAMES.d]: { value: gpu.d },
      [COAST_SPINE_UNIFORM_NAMES.label]: { value: gpu.label },
      [COAST_SPINE_UNIFORM_NAMES.weight]: { value: gpu.weight },
      [COAST_SPINE_UNIFORM_NAMES.rect]: { value: new THREE.Vector4(field.x0, field.z0, field.w, field.h) },
      [COAST_SPINE_UNIFORM_NAMES.texel]: { value: field.texel },
    };
  }
  return gpu.uniforms;
}

/** Free the field's GPU textures (it is called when the field leaves the cache). */
export function disposeCoastSpineTextures(field) {
  if (!field?.gpu) return;
  field.gpu.d.dispose(); field.gpu.label.dispose(); field.gpu.weight.dispose();
  field.gpu = null;
}

/**
 * The uniform declarations and the two readers that use them: `ddCoastSpineDAt(xz)` is `ddCoastSpineD` (the one sampling rule, above) on
 * the declared texture and rect; `ddCoastSpineLabelAt(xz)` is the label byte of the texel holding `xz` (0 beach, 1 natural, 2 port,
 * 3 creek, 4 closure, 255 none). Put it after `COAST_SPINE_GLSL`.
 */
export const COAST_SPINE_UNIFORMS_GLSL = /* glsl */ `
  uniform highp sampler2D ${COAST_SPINE_UNIFORM_NAMES.d};
  uniform highp usampler2D ${COAST_SPINE_UNIFORM_NAMES.label};
  uniform highp sampler2D ${COAST_SPINE_UNIFORM_NAMES.weight};
  uniform vec4 ${COAST_SPINE_UNIFORM_NAMES.rect};
  uniform float ${COAST_SPINE_UNIFORM_NAMES.texel};
  float ddCoastSpineDAt(vec2 xz) { return ddCoastSpineD(${COAST_SPINE_UNIFORM_NAMES.d}, ${COAST_SPINE_UNIFORM_NAMES.rect}, xz); }
  uint ddCoastSpineLabelAt(vec2 xz) {
    ivec2 hi = ivec2(${COAST_SPINE_UNIFORM_NAMES.rect}.zw) - 1;
    ivec2 i = clamp(ivec2(floor((xz - ${COAST_SPINE_UNIFORM_NAMES.rect}.xy) / DD_COAST_SPINE_TEXEL)), ivec2(0), hi);
    return texelFetch(${COAST_SPINE_UNIFORM_NAMES.label}, i, 0).r;
  }
`;

/* ───────────────────────── the debug overlay ───────────────────────── */

/** One colour per label for the debug curve: beach magenta, natural yellow, port orange, creek cyan. */
export const COAST_DEBUG_RGB = Object.freeze({ beach: [1, 0, 1], natural: [1, 0.92, 0], port: [1, 0.5, 0], creek: [0, 0.9, 1] });
/** Heights of the overlay above the mean sea level (`WATER_Y`), metres. */
export const COAST_DEBUG_CURVE_LIFT = 0.05;
export const COAST_DEBUG_FIELD_LIFT = 0.03;
/** The play page's grade (AgX) desaturates a linear 1.0 to a pastel; the ribbon is written at this fraction of its colour so it reads as the named hue. */
export const COAST_DEBUG_CURVE_GAIN = 0.18;

const DEBUG_CURVE_VS = /* glsl */ `
  attribute vec3 aOther;
  attribute float aSide;
  attribute vec3 aColour;
  uniform vec2 uViewport;
  uniform float uWidthPx;
  uniform float uGain;
  varying vec3 vColour;
  void main() {
    vec4 p0 = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec4 p1 = projectionMatrix * modelViewMatrix * vec4(aOther, 1.0);
    vColour = aColour * uGain;
    if (p0.w < 0.05 || p1.w < 0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vec2 s0 = p0.xy / p0.w * uViewport * 0.5;
    vec2 s1 = p1.xy / p1.w * uViewport * 0.5;
    vec2 dir = s1 - s0;
    float l = length(dir);
    dir = l > 1e-4 ? dir / l : vec2(1.0, 0.0);
    vec2 off = vec2(-dir.y, dir.x) * aSide * uWidthPx * 0.5;
    gl_Position = vec4((s0 + off) * 2.0 / uViewport * p0.w, p0.z, p0.w);
  }
`;
const DEBUG_CURVE_FS = /* glsl */ `
  varying vec3 vColour;
  void main() { gl_FragColor = vec4(vColour, 1.0); }
`;
const DEBUG_FIELD_VS = /* glsl */ `
  varying vec2 vXZ;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vXZ = w.xz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const DEBUG_FIELD_FS = /* glsl */ `
  varying vec2 vXZ;
  ${COAST_SPINE_GLSL}
  ${COAST_SPINE_UNIFORMS_GLSL}
  float coastLine(float d, float c, float fw) { return 1.0 - smoothstep(0.5 * fw, 1.5 * fw, abs(d - c)); }
  void main() {
  #ifdef COAST_DEBUG_FLAT
    gl_FragColor = vec4(1.0, 1.0, 1.0, 0.04);
  #else
    float d = ddCoastSpineDAt(vXZ);
    float fw = max(fwidth(d), 1e-4);
    float a0 = coastLine(d, 0.0, fw);
    float a5 = max(coastLine(d, 5.0, fw), coastLine(d, -5.0, fw));
    float a10 = max(coastLine(d, 10.0, fw), coastLine(d, -10.0, fw));
    float faint = max(a5 * 0.45, a10 * 0.28);
    vec3 tint = d > 0.0 ? vec3(0.78, 0.93, 1.0) : vec3(1.0, 0.89, 0.72);
    gl_FragColor = vec4(mix(tint, vec3(1.0), a0), max(a0 * 0.95, faint));
  #endif
  }
`;

/**
 * The debug overlay (`?coastSpineDebug=1`, with `?coastSpine=1`): a group of two named meshes, neither of which exists when the switch is off.
 *   debug:coast-spine:curve  the curve's vertices as a screen-space ribbon (`widthPx`) at the sea's height + 0.05 m, one colour per label,
 *                            depthTest off, renderOrder 9999.
 *   debug:coast-spine:field  a transparent plane over the field's rect at the sea's height + 0.03 m, whose fragment shader reads the texture
 *                            path (`COAST_SPINE_GLSL`) and draws a thin white line at d = 0 and faint lines at d = +-5 and +-10 m, widths by
 *                            `fwidth`. depthTest off, renderOrder 9998. `mode` 2 compiles the plane with one constant colour and no fetch.
 * `dispose()` frees both meshes' geometry and materials (never the field's textures; the cache owns those).
 */
export function buildCoastSpineDebug(field, { seaY = WATER_Y, mode = 1, widthPx = 4, gain = COAST_DEBUG_CURVE_GAIN } = {}) {
  const group = new THREE.Group();
  group.name = 'debug:coast-spine';
  const { xz, label, n } = field.curve;

  // The curve: four vertices per segment (this end and the other end, a side each), expanded on the GPU to a ribbon of constant pixel width.
  const segs = [];
  for (let i = 0; i < n; i += 1) if (label[i] !== COAST_LABEL.closure) segs.push(i);
  const pos = new Float32Array(segs.length * 4 * 3);
  const oth = new Float32Array(segs.length * 4 * 3);
  const col = new Float32Array(segs.length * 4 * 3);
  const side = new Float32Array(segs.length * 4);
  const idx = new Uint32Array(segs.length * 6);
  const y = seaY + COAST_DEBUG_CURVE_LIFT;
  segs.forEach((i, q) => {
    const k = (i + 1) % n;
    const rgb = COAST_DEBUG_RGB[COAST_LABEL_NAMES[label[i]]];
    const ends = [[xz[2 * i], xz[2 * i + 1], xz[2 * k], xz[2 * k + 1]], [xz[2 * k], xz[2 * k + 1], xz[2 * i], xz[2 * i + 1]]];
    for (let e = 0; e < 2; e += 1) {
      for (let sd = 0; sd < 2; sd += 1) {
        const v = q * 4 + e * 2 + sd;
        pos.set([ends[e][0], y, ends[e][1]], v * 3);
        oth.set([ends[e][2], y, ends[e][3]], v * 3);
        col.set(rgb, v * 3);
        side[v] = sd === 0 ? -1 : 1;
      }
    }
    // The vertex shader flips the normal at the second end, so v2 is B+ and v3 is B-: (v0, v1, v2) and (v0, v2, v3) cover the quad.
    idx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
  });
  const curveGeom = new THREE.BufferGeometry();
  curveGeom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  curveGeom.setAttribute('aOther', new THREE.BufferAttribute(oth, 3));
  curveGeom.setAttribute('aColour', new THREE.BufferAttribute(col, 3));
  curveGeom.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  curveGeom.setIndex(new THREE.BufferAttribute(idx, 1));
  const viewport = new THREE.Vector2(1920, 1080);
  const curveMat = new THREE.ShaderMaterial({
    uniforms: { uViewport: { value: viewport }, uWidthPx: { value: widthPx }, uGain: { value: gain } },
    vertexShader: DEBUG_CURVE_VS,
    fragmentShader: DEBUG_CURVE_FS,
    transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  });
  const curveMesh = new THREE.Mesh(curveGeom, curveMat);
  curveMesh.name = 'debug:coast-spine:curve';
  curveMesh.renderOrder = 9999;
  curveMesh.frustumCulled = false;
  curveMesh.onBeforeRender = (renderer) => {
    const rt = renderer.getRenderTarget();
    if (rt) viewport.set(rt.width, rt.height); else renderer.getDrawingBufferSize(viewport);
  };

  // The field plane.
  const fieldGeom = new THREE.PlaneGeometry(field.w * field.texel, field.h * field.texel);
  fieldGeom.rotateX(-Math.PI / 2);
  const fieldMat = new THREE.ShaderMaterial({
    uniforms: { ...coastSpineUniforms(field) },
    defines: mode === 2 ? { COAST_DEBUG_FLAT: 1 } : {},
    vertexShader: DEBUG_FIELD_VS,
    fragmentShader: DEBUG_FIELD_FS,
    transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  });
  const fieldMesh = new THREE.Mesh(fieldGeom, fieldMat);
  fieldMesh.name = 'debug:coast-spine:field';
  fieldMesh.renderOrder = 9998;
  fieldMesh.frustumCulled = false;
  fieldMesh.position.set(field.x0 + (field.w * field.texel) / 2, seaY + COAST_DEBUG_FIELD_LIFT, field.z0 + (field.h * field.texel) / 2);

  group.add(fieldMesh, curveMesh);
  return {
    group, curveMesh, fieldMesh,
    dispose() { curveGeom.dispose(); curveMat.dispose(); fieldGeom.dispose(); fieldMat.dispose(); },
  };
}

/* ───────────────────────── the cache ───────────────────────── */

const CACHE = new Map();
/** The cache holds the two most recently used fields (about 4.5 MB each, and their textures); the oldest is dropped and its textures freed. */
export const COAST_SPINE_CACHE_MAX = 2;

/** The cache's keys, oldest first (for the tests). */
export function coastSpineCacheKeys() {
  return [...CACHE.keys()];
}

/** Build (once per seed, edge and cap radius, two kept) the curve and the field for a city. Whatever `COAST_SPINE.on` says. */
export function getCoastSpine(city, plan = null, { capR = COAST_SPINE.capR, smooth = NATURAL_SMOOTH_PASSES } = {}) {
  if (!city?.waterEdge) return null;
  const key = `${city.seed ?? 0}|${city.waterEdge}|${city.extent.x}x${city.extent.z}|${capR}|${smooth}`;
  let f = CACHE.get(key);
  if (f) {
    CACHE.delete(key); CACHE.set(key, f);
    return f;
  }
  const curve = buildCoastCurve(city, plan ?? planEdgeMassing(city), { capR, smooth });
  f = curve ? bakeCoastField(curve) : null;
  if (f) {
    CACHE.set(key, f);
    while (CACHE.size > COAST_SPINE_CACHE_MAX) {
      const oldest = CACHE.keys().next().value;
      const dropped = CACHE.get(oldest);
      CACHE.delete(oldest);
      disposeCoastSpineTextures(dropped);
    }
  }
  return f;
}

/** The field when the switch is on, else null. */
export function coastSpineIfOn(city, plan = null) {
  return COAST_SPINE.on ? getCoastSpine(city, plan) : null;
}

export default COAST_SPINE;
