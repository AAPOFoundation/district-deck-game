// District Deck — hills-fringe events. Toy register. Presentation only. No Math.random.
// Split out of events.js so Rod Laver / Grand Prix / Falls Creek can be worked independently.

import * as THREE from 'three';
import { addBox, addCyl, addSphere, addCone, noPick } from '../kit.js';
import { createCityFringeMaterial } from '../../materials.js';
import { TASTE, TASTE_BOUNDARY, hexToHsv } from '../../taste-tokens.js';
function std(color, extra) { return createCityFringeMaterial(color, extra, 'fringe/events/shared.js'); }

/** Shared palette for all three event venues. */
export function mats() {
  return {
    seat: std('#1a4f9c', { roughness: 0.62, metalness: 0.08 }),
    seatDark: std('#12366e', { roughness: 0.64, metalness: 0.08 }),
    court: std('#2f9a45', { roughness: 0.62, metalness: 0.04 }),
    courtLine: std('#f2f0ea', { roughness: 0.45, metalness: 0.06 }),
    roof: std('#d8dde4', { roughness: 0.38, metalness: 0.42 }),
    roofDark: std('#9aa3ae', { roughness: 0.4, metalness: 0.46 }),
    conc: std('#c8c2b4', { roughness: 0.86, metalness: 0.04 }),
    plaza: std('#b8b4aa', { roughness: 0.9, metalness: 0.03 }),
    glass: std('#1a2836', { roughness: 0.14, metalness: 0.38 }),
    white: std('#f0eeea', { roughness: 0.48, metalness: 0.06 }),
    asphalt: std('#2a2c30', { roughness: 0.92, metalness: 0.03 }),
    kerb: std('#c45a2a', { roughness: 0.55, metalness: 0.08 }),
    grass: std('#3d6a38', { roughness: 0.96, metalness: 0.02 }),
    gpGrass: std('#2f6a30', { roughness: 0.96, metalness: 0.02 }),
    berm: std('#426a38', { roughness: 0.98, metalness: 0.01 }),
    lake: new THREE.MeshBasicMaterial({ color: '#071e26', toneMapped: false }),
    lakeKerb: std('#16353c', { roughness: 0.82, metalness: 0.02 }),
    lakeBed: std('#101719', { roughness: 1, metalness: 0 }),
    stand: std('#c4282a', { roughness: 0.52, metalness: 0.08 }),
    standW: std('#efeae2', { roughness: 0.5, metalness: 0.06 }),
    tyre: std('#161616', { roughness: 0.92, metalness: 0.02 }),
    papaya: std('#e85a18', { roughness: 0.42, metalness: 0.14 }),
    silver: std('#c8ccd2', { roughness: 0.32, metalness: 0.48 }),
    red: std('#c8181c', { roughness: 0.4, metalness: 0.16 }),
    snow: std('#eef4f8', { roughness: 0.72, metalness: 0.04 }),
    snowDark: std('#c5d2dc', { roughness: 0.78, metalness: 0.04 }),
    rock: std('#77746d', { roughness: 0.94, metalness: 0.02 }),
    rockDark: std('#54555a', { roughness: 0.96, metalness: 0.02 }),
    timber: std('#6a4a30', { roughness: 0.78, metalness: 0.04 }),
    timberLight: std('#8a6844', { roughness: 0.74, metalness: 0.04 }),
    pine: std('#2a4a32', { roughness: 0.92, metalness: 0.02 }),
    steel: std('#5a626a', { roughness: 0.38, metalness: 0.55 }),
    hiVis: std('#e6b01a', { roughness: 0.55, metalness: 0.12 }),
    marshalGreen: std('#21834f', { roughness: 0.58, metalness: 0.06 }),
    marshalOrange: std('#f06a18', { roughness: 0.55, metalness: 0.08 }),
    marshalHat: std('#ffd000', { roughness: 0.48, metalness: 0.08 }),
    navy: std('#2c4568', { roughness: 0.62, metalness: 0.08 }),
    cream: std('#e6dcc8', { roughness: 0.55, metalness: 0.06 }),
  };
}

export function pointInPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0];
    const zi = pts[i][1];
    const xj = pts[j][0];
    const zj = pts[j][1];
    const crosses = ((zi > z) !== (zj > z));
    if (!crosses) continue;
    const atX = (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi;
    if (x < atX) inside = !inside;
  }
  return inside;
}
export function orientation(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
export function pointOnSegment(point, a, b) {
  if (Math.abs(orientation(a, b, point)) > 1e-6) return false;
  return point[0] >= Math.min(a[0], b[0]) - 1e-6
    && point[0] <= Math.max(a[0], b[0]) + 1e-6
    && point[1] >= Math.min(a[1], b[1]) - 1e-6
    && point[1] <= Math.max(a[1], b[1]) + 1e-6;
}
export function segmentsIntersect(a, b, c, d) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0))
    && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return true;
  return (Math.abs(abC) <= 1e-6 && pointOnSegment(c, a, b))
    || (Math.abs(abD) <= 1e-6 && pointOnSegment(d, a, b))
    || (Math.abs(cdA) <= 1e-6 && pointOnSegment(a, c, d))
    || (Math.abs(cdB) <= 1e-6 && pointOnSegment(b, c, d));
}
export function segmentTouchesPoly(a, b, poly) {
  if (pointInPoly(a[0], a[1], poly) || pointInPoly(b[0], b[1], poly)) return true;
  for (let i = 0; i < poly.length; i += 1) {
    if (segmentsIntersect(a, b, poly[i], poly[(i + 1) % poly.length])) return true;
  }
  return false;
}
export function polygonsOverlap(a, b) {
  if (a.some(([x, z]) => pointInPoly(x, z, b))) return true;
  if (b.some(([x, z]) => pointInPoly(x, z, a))) return true;
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      if (segmentsIntersect(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) {
        return true;
      }
    }
  }
  return false;
}

export function addPine(g, m, x, y, z, s, name = '') {
  const pine = new THREE.Group();
  pine.name = name;
  addCyl(pine, 0.18 * s, 0.28 * s, 1.4 * s, 5, m.timber, 0, 0.7 * s, 0, { lodFamily: 'tree' });
  addCone(pine, 1.15 * s, 2.4 * s, 6, m.pine, 0, 2.3 * s, 0, { lodFamily: 'tree' });
  addCone(pine, 0.85 * s, 1.8 * s, 6, m.pine, 0, 3.5 * s, 0, { lodFamily: 'tree' });
  pine.position.set(x, y, z);
  noPick(pine);
  g.add(pine);
  return pine;
}

// ---------------------------------------------------------------------------
// Albert Park circuit — the single source of truth for BOTH event venues
// ---------------------------------------------------------------------------
//
// Board-AAA lane 5 found Rod Laver's precinct standing on the Albert Park racing
// surface: 23,646 world vertices inside the carriageway triangles, across the
// estate shelf, the batter, the bank belt, the ring path, the boundary fence,
// the balustrade, and 700 tree trunks and 278 conifers. Two hero critics passed
// it because the depth order hides the road under the lawn at both hero cameras.
// It is still two venues occupying the same ground.
//
// Rod Laver has to keep out of the corridor the circuit defines, and the only
// honest way to do that is to read the circuit the other venue actually builds.
// Copying the control polygon into `rod-laver.js` is the failure the bar names
// twice ("never hard-copy another module's default value" / "grep for the import
// statement, not the identifier") — a copy that is correct today is a defect
// waiting for the next change to the original, and this one would fail silently
// by putting a park back on a racetrack. So the polygon lives HERE, `grand-prix.js`
// imports it to build the running surface, and `rod-laver.js` imports it to stay
// off it. There is exactly one copy.

/** Circuit control polygon, in the `fringe:grand-prix` group's local frame.
 *  Every edge is >= 12.6 m so no corner fillet drops below the 3.4 m inner
 *  offset the kerbs need. Travel runs A -> B -> C ... */
export const GP_CIRCUIT = Object.freeze([
  [-25, -25], [11, -25], [27, -16], [30, 5], [24, 22],
  [10, 33], [-4, 33], [-17, 27], [-28, 15], [-31, -6],
].map((p) => Object.freeze(p)));
export const GP_CORNER_R = Object.freeze([7.6, 8.4, 6.2, 8.2, 7.0, 6.2, 6.0, 6.4, 7.2, 8.8]);
export const GP_TRACK_HALF_W = 2.75;
export const GP_KERB_W = 0.62;

/**
 * Taste bible section 8: each fringe precinct owns one convex ground polygon and
 * polygons never overlap; neighbours share a 10 m blend zone. The circuit used to
 * sit at x = 8 (events frame), 52 m inside Rod Laver's own ground. GP_SHIFT_X is
 * the move, in metres along the events frame x axis: Rod Laver's outer bank ends
 * at x 158.5 world, the Grand Prix ground now starts at x 170, which leaves the
 * 10 m blend. 57 rather than the bible's 50 because 50 leaves 4.7 m.
 *
 * It is a DEPENDENCY of `edge-massing.js RING_LAYOUT.grandPrix.lx`, which has to
 * read GP_ORIGIN_X + GP_SHIFT_X (65) or the crust seat dish stays under the old
 * site. `addGrandPrix` places its group from EVENT_ANCHOR, and Rod Laver's
 * circuit keep-out reads the same pair, so there is one number in this lane.
 */
export const GP_ORIGIN_X = 8;
export const GP_SHIFT_X = 57;

/**
 * Venue ground and dressing end here. The events frame sits `eventsSeaward` (28 m)
 * outside the city edge, so the edge is local z = -28; the bible's 6 m tray band
 * (z 272-278 world) is kept clear, plus 1 m so a cut ground edge is not on the band line.
 */
export const VENUE_SETBACK_Z = -RING_LAYOUT.eventsSeaward + TASTE_BOUNDARY.trayBand + 1;

/** Where each event venue's own group sits in the `fringe:events` frame.
 *  `events.js` adds all three at this root, so a bearing/radius in one venue's
 *  local frame converts to another's by differencing these two pairs. */
export const EVENT_ANCHOR = Object.freeze({
  rodLaver: Object.freeze([-38, 36]),
  grandPrix: Object.freeze([GP_ORIGIN_X + GP_SHIFT_X, 78]),
  fallsCreek: null,
});

/** Quadratic corner rounding of a closed control polygon. */
export function roundLoop(points, radii, per) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const p = points[(i + n - 1) % n];
    const v = points[i];
    const q = points[(i + 1) % n];
    const ax = v[0] - p[0];
    const az = v[1] - p[1];
    const aL = Math.hypot(ax, az) || 1;
    const bx = q[0] - v[0];
    const bz = q[1] - v[1];
    const bL = Math.hypot(bx, bz) || 1;
    const r = Math.min(radii[i] ?? 5.5, aL * 0.46, bL * 0.46);
    const s = [v[0] - (ax / aL) * r, v[1] - (az / aL) * r];
    const e = [v[0] + (bx / bL) * r, v[1] + (bz / bL) * r];
    for (let k = 0; k <= per; k += 1) {
      const t = k / per;
      const mt = 1 - t;
      out.push([
        mt * mt * s[0] + 2 * mt * t * v[0] + t * t * e[0],
        mt * mt * s[1] + 2 * mt * t * v[1] + t * t * e[1],
      ]);
    }
  }
  return out;
}

/**
 * First hit of a ray against a 2D capsule (segment + radius), or Infinity.
 * Exact — no marching. A marched version was written first and rejected: with a
 * 1 m step it can step straight over a grazing corner clip, which is precisely
 * the case this is used to rule out, and an instrument that cannot see its own
 * failure mode is worse than none.
 */
function rayCapsule(ox, oz, dx, dz, ax, az, bx, bz, R) {
  let best = Infinity;
  const ux = bx - ax;
  const uz = bz - az;
  const L = Math.hypot(ux, uz);
  if (L > 1e-9) {
    const nx = -uz / L;
    const nz = ux / L;
    const mx = ox - ax;
    const mz = oz - az;
    const perp0 = mx * nx + mz * nz;
    const perpV = dx * nx + dz * nz;
    const along0 = (mx * ux + mz * uz) / L;
    const alongV = (dx * ux + dz * uz) / L;
    if (Math.abs(perpV) > 1e-9) {
      for (const s of [R, -R]) {
        const t = (s - perp0) / perpV;
        if (t < 0 || t >= best) continue;
        const al = along0 + alongV * t;
        if (al >= 0 && al <= L) best = t;
      }
    }
  }
  for (const cap of [[ax, az], [bx, bz]]) {
    const mx = ox - cap[0];
    const mz = oz - cap[1];
    const b = mx * dx + mz * dz;
    const c = mx * mx + mz * mz - R * R;
    const disc = b * b - c;
    if (disc < 0) continue;
    const sq = Math.sqrt(disc);
    for (const t of [-b - sq, -b + sq]) if (t >= 0 && t < best) best = t;
  }
  return best;
}

const CORRIDOR_CACHE = new Map();

/**
 * Radius, on each local bearing, at which a ray from `origin` first enters the
 * Albert Park carriageway-plus-kerb corridor. `origin` is in the venue's OWN
 * local frame and `anchor` names which venue that is, so the caller never has to
 * do the frame arithmetic. Returns `(angleRadians) => metres`, Infinity where
 * the ray never meets the circuit.
 *
 * The table is built once per (anchor, margin) at 0.25 deg and read by nearest
 * bin. That is a derivation from live geometry re-evaluated on every build, not
 * a baked constant: change `GP_CIRCUIT` and every consumer moves with it.
 */
export function gpCorridorLimit(anchorName, margin = 0.35, bins = 1440) {
  const key = `${anchorName}|${margin}|${bins}`;
  const hit = CORRIDOR_CACHE.get(key);
  if (hit) return hit;
  const anchor = EVENT_ANCHOR[anchorName];
  if (!anchor) throw new Error(`gpCorridorLimit: unknown anchor ${anchorName}`);
  // origin of the asking venue expressed in the circuit's own local frame
  const ox = anchor[0] - EVENT_ANCHOR.grandPrix[0];
  const oz = anchor[1] - EVENT_ANCHOR.grandPrix[1];
  const loop = roundLoop(GP_CIRCUIT, GP_CORNER_R, 9);
  const R = GP_TRACK_HALF_W + GP_KERB_W + margin;
  const table = new Float64Array(bins);
  for (let b = 0; b < bins; b += 1) {
    const a = (b / bins) * Math.PI * 2;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    let best = Infinity;
    for (let i = 0; i < loop.length; i += 1) {
      const p = loop[i];
      const q = loop[(i + 1) % loop.length];
      const t = rayCapsule(ox, oz, dx, dz, p[0], p[1], q[0], q[1], R);
      if (t < best) best = t;
    }
    table[b] = best;
  }
  const fn = (a) => {
    const t = a / (Math.PI * 2);
    let b = Math.round((t - Math.floor(t)) * bins) % bins;
    if (b < 0) b += bins;
    return table[b];
  };
  fn.table = table;
  CORRIDOR_CACHE.set(key, fn);
  return fn;
}

// ---------------------------------------------------------------------------
// WHICH GROUND ACTUALLY RENDERS — the contract a venue apron has to build on
// ---------------------------------------------------------------------------
//
// `fringe.js:15-28` states it in the file itself: `fringe:annulus-near`,
// `annulus-far`, `expansion` and `alpine` are all HIDDEN at runtime by
// `water.js` and `edge-massing.js`, so `heightWorld()` / `terrainHeightAt()`
// "describe a surface NOBODY SEES". The ground under every plate outside the
// board is `world:edge-massing:crust` — height `surroundHeightAt()` — plus
// `fringe.js`'s own hinterland overlay `hinterlandLiftAt()`.
//
// Board-AAA lane 5 r1 sized a 25 m apron and a 40 m paddock belt against
// `terrainHeightAt`, and both landed underground. Measured on the r1 geometry
// against the rendered field (`mvp/_reviews/board-aaa/_r2-ground-probe.mjs`):
// carriageway 92.8% of vertices below, lawn 99.7%, car park 100%, coaches 94%,
// Grand Prix paddock belt 77%; median depth 2.9 m. Only the trees and the lamp
// columns were tall enough to break the surface, which is exactly what the r1
// plate shows — an avenue of trees standing in a field with no road between
// them. The venue's own outer courses drown the same way past r 60.
//
// A venue module has no `city` and therefore cannot evaluate `surroundHeightAt`,
// so it cannot sample that field. What it CAN do is stay inside the radius where
// the field is pinned to a constant by two independent mechanisms:
//
//   * `edge-massing.js applySeatDish` pulls the crust to `plateBase - 0.10` for
//     every point within `seat.radius` of a landmark seat, blending out over the
//     next 16 m. The seat centre for an events venue is the venue's own origin
//     and the radius is authored in `RING_LAYOUT`.
//   * `fringe.js seatClearAt` zeroes the hinterland overlay's mask — and with it
//     the overlay's whole lift — inside `seat.radius * 0.85`.
//
// Inside the smaller of the two the rendered ground is a constant. Measured over
// bearings 200..330 at Rod Laver it is exactly -0.100 m out to r 48 and still
// only +0.030 m at r 54, against an estate deck at +0.455. Beyond that it climbs
// fast: +0.29 at 58, +1.13 at 62, +3.67 at 66.
//
// `RING_LAYOUT` is imported rather than copied. Move a seat radius in
// `edge-massing.js` and every apron built through here moves with it — the same
// single-source rule that put `GP_CIRCUIT` in this file.
import { RING_LAYOUT } from '../../edge-massing.js';

/** Fraction of a seat radius inside which `fringe.js` zeroes its overlay lift. */
export const SEAT_OVERLAY_CLEAR = 0.85;

/**
 * Radii a venue may build ground on, derived from its own crust seat.
 * `key` is a `RING_LAYOUT` key (`rodLaver`, `grandPrix`, `fallsCreek`, ...).
 */
/**
 * The crust seat's offset from a venue's own group origin, in that group's frame
 * (`RING_LAYOUT.<key>.sx / sz`), in the shape `userData.venueTerrainAnchor` takes.
 *
 * Publishing it keeps the one-plan drift gate honest when a venue's ground is
 * trimmed: the setback and the east trim remove geometry from one side of a venue,
 * which would move its AABB centre, but the hill under it has not moved. The anchor
 * is local, so RELOCATING the group (as GP_SHIFT_X does) still shows as drift until
 * `RING_LAYOUT.<key>.lx` follows it, which is the gate doing its job.
 */
export function venueSeatAnchor(key) {
  const spec = RING_LAYOUT[key];
  if (!spec) throw new Error(`venueSeatAnchor: no RING_LAYOUT.${key}`);
  return [spec.sx ?? 0, 0, spec.sz ?? 0];
}

export function venueGroundLimit(key) {
  const spec = RING_LAYOUT[key];
  if (!spec) throw new Error(`venueGroundLimit: no RING_LAYOUT.${key}`);
  const seatR = spec.radius;
  return Object.freeze({
    seatR,
    /** Both the dish and the overlay mask are pinned inside this radius. */
    flatR: seatR * SEAT_OVERLAY_CLEAR,
    /** The dish alone still holds out to here; the overlay may add up to ~0.4 m. */
    dishR: seatR,
  });
}

// ---------------------------------------------------------------------------
// DISPLAY TRANSFER, round two. Why the register holds VALUE as well as saturation.
// ---------------------------------------------------------------------------
//
// Round one compressed hue and saturation and let value float, and the precinct came out
// at V 88-98 on screen (gate ruling 3). Measured round two, from a calibration chart of
// flat patches lit by the real sun at the 110 m camera (clear sky): a fringe standard
// material renders far above its albedo. Black albedo already shows V 35 (sky fill and the
// grade's toe), albedo V 12 shows 46, 20 shows 57, 30 shows 72, 40 shows 83, 50 shows 92.
// Saturation arrives at about 0.45 of the albedo's up to S 100 (a token S 43 needs albedo
// S 95 to read S 43), and neutrals keep theirs. So a token is not a material colour: the
// material takes `venueAlbedo(token)`, the colour whose lit result lands on the token.
const DISPLAY_TO_ALBEDO_V = [[34, 2], [46, 12], [57, 20], [72, 30], [83, 40], [92, 50], [98, 70]];

/** Albedo V (percent) whose lit result on screen is `vDisplay`. Piecewise linear over the chart. */
export function venueAlbedoV(vDisplay) {
  const t = DISPLAY_TO_ALBEDO_V;
  if (vDisplay <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i += 1) {
    if (vDisplay <= t[i][0]) {
      const k = (vDisplay - t[i - 1][0]) / (t[i][0] - t[i - 1][0]);
      return t[i - 1][1] + (t[i][1] - t[i - 1][1]) * k;
    }
  }
  return t[t.length - 1][1];
}

/** Albedo saturation that lands on display saturation `sDisplay`: x1 for neutrals, up to x2.2 for chroma. */
export function venueAlbedoS(sDisplay) {
  const k = clampN((sDisplay - 10) / 20, 0, 1);
  return Math.min(100, sDisplay * (1 + 1.2 * k * k * (3 - 2 * k)));
}

/** Albedo (sRGB, 0..1 channels) for an on-screen colour given as H (deg), S and V (percent). */
export function venueAlbedoRgb(h, sDisplay, vDisplay, out = { r: 0, g: 0, b: 0 }) {
  return hsvToRgb(h, venueAlbedoS(sDisplay), venueAlbedoV(vDisplay), out);
}

/** Albedo hex whose lit result lands on the token hex. `valueScale` is a variance multiplier on the token's V. */
export function venueAlbedo(token, valueScale = 1, hueShift = 0) {
  const { h, s, v } = hexToHsv(token);
  const rgb = venueAlbedoRgb(h + hueShift, s, clampN(v * valueScale, 0, 98));
  const to = (x) => Math.round(clampN(x, 0, 1) * 255).toString(16).padStart(2, '0');
  return `#${to(rgb.r)}${to(rgb.g)}${to(rgb.b)}`;
}

/** Linear mix of two token hexes in sRGB, as a token hex. */
export function mixToken(a, b, t) {
  const A = new THREE.Color(a).convertLinearToSRGB();
  const B = new THREE.Color(b).convertLinearToSRGB();
  const m = A.lerp(B, t).convertSRGBToLinear();
  return `#${m.getHexString()}`;
}

/**
 * taste-r1 (W20-C): the venues' turf joins the country around it. 1 brings the lit lawn one step above the
 * paddock (not two or three), gives the turf the paddock's grass grain, wears Rod Laver's outer stretch into
 * the paddock's colour in tongues and patches and drops the polygon discs the shader replaces (rod-laver.js,
 * grand-prix.js). 0 restores LIFT 1.48, the disc scatter and the old edge.
 */
export const VENUE_LAWN_JOIN = 1;
/**
 * taste-r1 (W20-C): precinct rocks stand as two outcrops of half-sunk stones in a grey-brown whose lit value
 * is no higher than the paddock's, and the stones between the venues are thinned to a quarter. 0 restores
 * the even scatter and its colours.
 */
export const VENUE_ROCK_OUTCROPS = 1;
/**
 * taste-r1 (W26): VENUE_HEDGE_TONE. Melbourne Park's clipped hedges took the leaf token through `venueAlbedo`, which lands
 * a display value of 43 on an albedo value of 9.5 (#101901). A hedge is mostly side faces in shade, so the runs along the ring
 * path drew as black bars at station 11. 1 scales the token's value by `VENUE_HEDGE_VALUE` (albedo #294003, a dark olive).
 * 0 restores the earlier colour. Browser: `?venueHedgeTone=0`; node: `DD_VENUE_HEDGE_TONE=0`.
 */
export const VENUE_HEDGE_TONE = (typeof process !== 'undefined' && process?.env?.DD_VENUE_HEDGE_TONE !== undefined)
  ? (Number(process.env.DD_VENUE_HEDGE_TONE) > 0 ? 1 : 0)
  : (typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('venueHedgeTone') === '0' ? 0 : 1);
export const VENUE_HEDGE_VALUE = 1.5;
/** Lit lawn target: paddock + 6..9 L*, chroma at most 1.15x the paddock's, hue within 6 degrees (station 11 measure). */
export const VENUE_JOIN_TUNE = Object.freeze({ lift: 1.3, dryMix: 0, greyMix: 0.3, grey: '#6C7C5E', worn: 0.86, rock: 0.32 });
/** The join's lawn token: the lush grass pulled toward a desaturated green-grey. */
export function venueLawnToken() {
  const T = VENUE_JOIN_TUNE;
  return mixToken(mixToken(TASTE.ground.grassLush, TASTE.ground.grassDry, T.dryMix), T.grey, T.greyMix);
}

/** Material authored straight from a token: lit result on the token, no city-finish snapping, register-proof. */
export function venueMaterial(token, extra = {}, valueScale = 1, hueShift = 0) {
  const material = new THREE.MeshStandardMaterial({ color: venueAlbedo(token, valueScale, hueShift), ...extra });
  material.userData.tasteRegistered = true;
  material.userData.tasteToken = token;
  return material;
}

// ---------------------------------------------------------------------------
// TASTE REGISTER: one pass over a finished venue that puts every large-area colour on a
// token (docs/art-direction/taste/TASTE-BIBLE.md section 2, and ruling 3).
// ---------------------------------------------------------------------------
//
// Rod Laver alone carries about 480 hand-typed hex values and the circuit about as
// many. The named surfaces (turf, paving, courts, asphalt, tents, roofs, seating) are
// set on their tokens where the material is made; this maps what is left, by colour class,
// at the end of `addEvents`, and now holds the displayed value:
//
//   * whites          S under 16, V above 90 -> canvas/marking token, V 84 on screen
//   * cool greys      S under 16, H 185-262  -> warm neutral S 8, V kept within 36-78
//   * stone, paving   H 20-55, S 12-32, V 50+ -> concrete: S 12, V 58-70 on screen
//   * greens          H 55-150               -> ground and foliage band: H 64-92, S 28-46,
//                                               V 44-58 on screen (the lime was S 78-84, V 90+)
//   * blues, teals    H 150-262, S 30+       -> court band: H 200-215, S at most 62, V 44-62
//   * mustard         H 36-55, S 50+, V 62+  -> S at most 52, V at most 74
//   * everything else with S above 60        -> S 60, V 28-80 (vehicle cap)
//
// Ordering inside each class is kept, so a lawn that was five tones is still five tones.
const _taste = { r: 0, g: 0, b: 0 };
const _tasteA = new THREE.Color();
const _tasteB = new THREE.Color();
const _tasteT = new THREE.Color();
function clampN(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

function hsvToRgb(h, s, v, out) {
  const S = s / 100;
  const V = v / 100;
  const c = V * S;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) { r = c; g = x; } else if (hp < 2) { r = x; g = c; } else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; } else if (hp < 5) { r = x; b = c; } else { r = c; b = x; }
  const m = V - c;
  out.r = r + m;
  out.g = g + m;
  out.b = b + m;
  return out;
}

/** Map one sRGB colour (0..1 channels) into the bible's bands. Pure, writes `out`. */
export function tasteConformRgb(r, g, b, out = { r: 0, g: 0, b: 0 }, foliage = false) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-9) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s0 = max === 0 ? 0 : (d / max) * 100;
  const v0 = max * 100;
  const h0 = h;
  if (s0 < 16) {
    if (v0 > 90) {
      // A white: the canvas token, below the pure-white band on screen.
      const t = hexToHsv(TASTE.venue.canvas);
      return venueAlbedoRgb(t.h, t.s, 84, out);
    }
    if (h0 >= 185 && h0 <= 262 && v0 >= 14) {
      return venueAlbedoRgb(42, Math.min(s0, 8), clampN(v0 * 0.95, 36, 78), out);
    }
    return (out.r = r, out.g = g, out.b = b, out);
  }
  if (h0 >= 55 && h0 < 150) {
    // Merged foliage canopies carry their own shading and render near their albedo (measured round
    // two: the display transfer made them black), so they take the green band as albedo directly.
    if (foliage) {
      return hsvToRgb(clampN(74 + (h0 - 95) * 0.3, 64, 92), clampN(s0 * 0.9, 24, 48), clampN(38 + (v0 - 12) * 0.38, 38, 58), out);
    }
    return venueAlbedoRgb(
      clampN(74 + (h0 - 95) * 0.3, 64, 92), clampN(s0 * 0.5, 28, 46), clampN(66 + (v0 - 12) * 0.2, 66, 76), out,
    );
  }
  if (h0 >= 150 && h0 <= 262 && s0 >= 30) {
    // The sky fill and the shadow tint push blues about 12 degrees toward violet on screen: aim lower.
    return venueAlbedoRgb(clampN(h0, 200, 215) - 16, Math.min(s0 * 0.8, 62), clampN(v0 * 0.85, 52, 66), out);
  }
  if (h0 >= 36 && h0 < 55 && s0 >= 50 && v0 >= 62) {
    return hsvToRgb(h0, Math.min(s0, 52), Math.min(v0, 74), out);
  }
  if (h0 >= 20 && h0 <= 55 && s0 > 12 && s0 <= 32 && v0 >= 50) {
    return venueAlbedoRgb(h0, 12, clampN(v0 * 0.85, 58, 70), out);
  }
  if (s0 > 60) {
    return hsvToRgb(h0, 60, clampN(v0, 28, 80), out);
  }
  return (out.r = r, out.g = g, out.b = b, out);
}

const _vcMean = new WeakMap();
function vertexColourMean(geometry) {
  let mean = _vcMean.get(geometry);
  if (mean) return mean;
  mean = new THREE.Color(1, 1, 1);
  const c = geometry?.attributes?.color;
  if (c && c.count) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < c.count; i += 1) { r += c.getX(i); g += c.getY(i); b += c.getZ(i); }
    mean.setRGB(r / c.count, g / c.count, b / c.count, THREE.LinearSRGBColorSpace);
  }
  _vcMean.set(geometry, mean);
  return mean;
}

/** Conform a linear-space Color in place. Returns true when it changed. */
function conformLinear(color, foliage = false) {
  color.getRGB(_taste, THREE.SRGBColorSpace);
  const r = _taste.r;
  const g = _taste.g;
  const b = _taste.b;
  tasteConformRgb(r, g, b, _taste, foliage);
  if (_taste.r === r && _taste.g === g && _taste.b === b) return false;
  color.setRGB(_taste.r, _taste.g, _taste.b, THREE.SRGBColorSpace);
  return true;
}

/**
 * Run the register over the venue subtrees in `roots`. Idempotent per material,
 * instance buffer and geometry, and it never touches a mesh outside the subtrees
 * (Falls Creek keeps the shared event palette it was authored against).
 * Returns counts, which the venue publishes on `userData.tasteRegister`.
 */
export function applyTasteRegister(roots) {
  const stats = { materials: 0, instanceBuffers: 0, instances: 0, canopyVertices: 0 };
  const driven = new Set();
  const meshes = [];
  for (const root of roots) {
    if (!root) continue;
    root.traverse((node) => { if (node.isMesh && node.material) meshes.push(node); });
  }
  // Pass 1: colours carried per instance, or baked into an owned merged canopy.
  // The material colour is the multiplier they ride on; it is left alone here so
  // E = material x vertex x instance is mapped once and divided back out.
  for (const mesh of meshes) {
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!material?.color?.isColor) continue;
    if (mesh.isInstancedMesh && mesh.instanceColor && !mesh.userData.tasteRegistered) {
      mesh.userData.tasteRegistered = true;
      const vc = material.vertexColors ? vertexColourMean(mesh.geometry) : _tasteT.setRGB(1, 1, 1);
      const gain = _tasteB.copy(material.color).multiply(vc);
      for (let i = 0; i < mesh.count; i += 1) {
        mesh.getColorAt(i, _tasteA);
        const inst = _tasteA;
        const er = gain.r * inst.r;
        const eg = gain.g * inst.g;
        const eb = gain.b * inst.b;
        const effective = _tasteT.setRGB(er, eg, eb, THREE.LinearSRGBColorSpace);
        if (!conformLinear(effective)) continue;
        inst.setRGB(
          gain.r > 1e-4 ? effective.r / gain.r : effective.r,
          gain.g > 1e-4 ? effective.g / gain.g : effective.g,
          gain.b > 1e-4 ? effective.b / gain.b : effective.b,
          THREE.LinearSRGBColorSpace,
        );
        mesh.setColorAt(i, inst);
        stats.instances += 1;
      }
      mesh.instanceColor.needsUpdate = true;
      stats.instanceBuffers += 1;
      driven.add(material);
    } else if (mesh.userData.clusterCanopy && !mesh.userData.tasteRegistered && mesh.geometry?.attributes?.color) {
      mesh.userData.tasteRegistered = true;
      const colors = mesh.geometry.attributes.color;
      const gain = material.color;
      for (let i = 0; i < colors.count; i += 1) {
        const effective = _tasteT.setRGB(
          gain.r * colors.getX(i), gain.g * colors.getY(i), gain.b * colors.getZ(i), THREE.LinearSRGBColorSpace,
        );
        if (!conformLinear(effective, true)) continue;
        colors.setXYZ(
          i,
          gain.r > 1e-4 ? effective.r / gain.r : effective.r,
          gain.g > 1e-4 ? effective.g / gain.g : effective.g,
          gain.b > 1e-4 ? effective.b / gain.b : effective.b,
        );
        stats.canopyVertices += 1;
      }
      colors.needsUpdate = true;
      driven.add(material);
    }
  }
  // Pass 2: plain material colours. Vertex-coloured and instance-driven materials
  // carry their colour elsewhere, so their base colour (white) must not be mapped.
  for (const mesh of meshes) {
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      if (!material?.color?.isColor || driven.has(material) || material.vertexColors) continue;
      if (material.userData.tasteRegistered) continue;
      // The arena's glazing is pinned to the shared event kit glass (fringe-venues.test.mjs
      // FC6), so Grand Prix and Falls Creek keep meaning the same thing by it.
      if (material.userData.fc6Register === 'kit-glass') continue;
      material.userData.tasteRegistered = true;
      if (conformLinear(material.color)) stats.materials += 1;
    }
  }
  return stats;
}
