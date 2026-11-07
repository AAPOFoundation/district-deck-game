// taste-r1 W14-C: the hinterland coast ribbon. The ground sheets are 10 to 15 m quads, so they cannot
// carry a 5 m bluff, a rock platform and a step; they end at the brow (the q channel of the ring height
// texture) and this strip, laid on `surroundHeightAt`, draws everything seaward of it, in tokens.
//
// Pure functions of position and seed: the contour is found by marching and tracing the coast
// coordinate `coastRimAt(...).qm`, no randomness, no clock.
import * as THREE from 'three';
import { TASTE } from '../taste-tokens.js';
import { WATER_Y } from '../water/contract.js';
import { COAST_RIM, COAST_FAR, BANK_SECTION, RING_SEAM, coastRimAt, surroundHeightAt, drawnCrustHeightAt, LANDFORM_TRIAL } from '../edge-massing.js';
import { COAST_DETAIL_GLSL, loadCoastPack } from '../coast-textures.js';

/** Rows across the ribbon, in metres of coast coordinate. The two landward rows overlap the sheet. */
// taste-r1 (W16-C): 12, 15 and 20.5 dropped (all lie on a straight run of the profile) and 27, 33, 40 added in place of 26: the
// cove sand beside the city beach is above the water to Q 27, so a ribbon that stopped at 26 ended on dry sand in a ruled line.
// The last row stands 3 to 4 m under the water, and the waterline wander below moves the shore inside rows 27 to 40.
export const COAST_RIM_ROWS = Object.freeze([-3, -1.5, 0, 3, 5, 7, 9, 16, 19.5, 22, 27, 33, 40]);
export const COAST_RIM_STEP = 3;
export const COAST_RIM_TRI_CAP = 8000;
// taste-r1 W15-C1: 0.03 -> 0.10. The wet-edge decal (outer-ocean.js) lies within 0.02 m of the ribbon along x 316.5 to
// 319.6, z 301 to 340 and drew through it as the straight grey stripe; the ribbon now stands clear of it.
const RIM_LIFT = 0.10;
const WW = Object.freeze([4, 6, 3, 3]); // amplitudes of the 38 m, 15 m and 6.5 m cells in Q metres, then the overall gain
const WANDER_GAIN = WW[3];
// taste-r1 (W16-C): the board-end dive began at x 319.5 (the old wet-edge decal stood there; W15 fix removed it), so the slab west of it ended
// on a ruled line above the water; it now begins at x 290 so the slab shelves into the water like the strip beside it.
const DIVE_X0 = 290;

// taste-r1 (W33, COAST_FAR): the far ribbon's rows are laid on a ruler in metres, not on the coast coordinate's own spacing. The coordinate (a smoothstep
// of the planar distance plus the shore warp) packs its contours 1.4 times closer where the warp climbs, so the dry sand pinched from 12 m to 5.5 m
// (west leg, r 619 to 629), and where the contour turns the raw gradient swung 58 degrees in three stations and the rows splayed (the ribbon 36 to 56 m wide at
// r 716). The ruler: coast coordinate Q in metres from the brow (Q 0) along a seaward direction smoothed over the leg, the waterline row 9.2 m out
// (dry sand 10 to 12 m from the landward row), the last row 34 m out (the width the straight runs of the ribbon had, 36.5 m).
const FAR_RULER_Q = Object.freeze([-3, 0, 14.4, 40]);
const FAR_RULER_M = Object.freeze([-2.55, 0, 9.2, 34]);
function farRuler(q) {
  const n = FAR_RULER_Q.length;
  let k = 0;
  while (k < n - 2 && q > FAR_RULER_Q[k + 1]) k += 1;
  return FAR_RULER_M[k] + (FAR_RULER_M[k + 1] - FAR_RULER_M[k]) * ((q - FAR_RULER_Q[k]) / (FAR_RULER_Q[k + 1] - FAR_RULER_Q[k]));
}
/** The leg's seaward unit direction averaged over about 16 m either side (a Gaussian of 5 stations), so a turn of the contour spreads over the run and no row fans out. */
function smoothedSeaward(leg, sigma = 5, half = 15) {
  return leg.map((_, i) => {
    let sx = 0;
    let sz = 0;
    for (let j = -half; j <= half; j += 1) {
      const q = leg[Math.min(leg.length - 1, Math.max(0, i + j))];
      const wgt = Math.exp(-(j * j) / (2 * sigma * sigma));
      sx += q.gx * wgt;
      sz += q.gz * wgt;
    }
    const m = Math.hypot(sx, sz) || 1;
    return { x: sx / m, z: sz / m };
  });
}

/**
 * taste-r1 (W36, COAST_FAR.steady): relax one row's heights along the leg until no neighbouring pair differs by more than `maxStep`. Each over-steep pair gives up
 * half its excess to each side (to the free side alone when the other is held), so the mean is kept; held stations (the board end, the port) never move.
 */
function relaxRow(y, free, maxStep) {
  const n = y.length;
  for (let it = 0; it < 4000; it += 1) {
    let worst = 0;
    for (let i = 0; i < n - 1; i += 1) {
      const d = y[i + 1] - y[i];
      const ex = Math.abs(d) - maxStep;
      if (ex <= 0) continue;
      if (ex > worst) worst = ex;
      const s = d > 0 ? 1 : -1;
      if (free[i] && free[i + 1]) { y[i] += s * ex * 0.5; y[i + 1] -= s * ex * 0.5; } else if (free[i]) y[i] += s * ex; else if (free[i + 1]) y[i + 1] -= s * ex;
    }
    if (worst < 0.004) break;
  }
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
function hash2(x, z) {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

// The ribbon is lit like the paddocks beside it, so its tokens carry the gains that put the lit pixel where
// the brief wants it: the brow row is the paddock palette's own dry grass (`PADDOCK_GAIN` 0.20 and tint,
// fringe.js), so the farm-side row sits within 3 L* of the paddock; sand and rock are measured from pixels
// (rendered L* 89 at gain 1 against a cap of 72 to 80 for sand and 55 to 68 for the lit rock face).
// W14 fix: x 0.865 (the paddock fade target is 0.93 of the dry token in sqrt space) so the brow row is not a pale stripe.
const GRASS_GAIN = [0.20 * 0.92 * 0.865, 0.20 * 0.865, 0.20 * 1.08 * 0.865];
// taste-r1 W15-C1: 0.62 -> 0.25. The rim sand rendered L* 83 to 87 at 0.62 and 83 at 0.46 (the tone-map shoulder
// flattens the first cut); the brief wants 72 to 78, within 4 L* of the city beach.
const SAND_GAIN = 0.22; // taste-r1 (W16-C): 0.25 -> 0.22, the rim sand read L* 79 at station 01 against the brief's 70 to 76
const ROCK_GAIN = 0.19;
const scaled = (hex, g) => {
  const c = new THREE.Color(hex);
  const k = Array.isArray(g) ? g : [g, g, g];
  return c.setRGB(c.r * k[0], c.g * k[1], c.b * k[2], THREE.LinearSRGBColorSpace);
};
const TOK = {
  grassDry: scaled(TASTE.ground.grassDry, GRASS_GAIN),
  rockLight: scaled(TASTE.ground.rockLight, ROCK_GAIN),
  rockDark: scaled(TASTE.ground.rockDark, ROCK_GAIN),
  sandDry: scaled(TASTE.ground.sandDry, SAND_GAIN),
  sandWet: scaled(TASTE.ground.sandWet, SAND_GAIN),
};

/** The linear dry-sand token the ribbon carries; the paddock sheet thins its grass toward it near coves. */
export const COAST_RIM_SAND = TOK.sandDry;

/**
 * taste-r1 (W61): RIBBON_SAND. The ribbon's dry sand is the token (`ground.sandDry`) at SAND_GAIN, lit and tone-mapped, and it
 * rendered duller and pinker than the city beach's shelf beside it (about rgb 209,186,158 against 227,190,142 at station 18). `mul` is a
 * per-channel linear factor on that dry sand, one value for the whole ribbon, that keeps its luminance and puts its hue and saturation
 * where the shelf's are. The wet sand, the rock mix, the lip and the rows' shading are untouched. `?ribbonSand=0` / `DD_RIBBON_SAND=0`
 * restores the previous colours exactly.
 */
export const RIBBON_SAND = Object.freeze({
  on: (typeof process !== 'undefined' && process?.env?.DD_RIBBON_SAND !== undefined)
    ? (Number(process.env.DD_RIBBON_SAND) > 0 ? 1 : 0)
    : ((typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('ribbonSand') === '0') ? 0 : 1),
  mul: Object.freeze([1.19, 1.075, 0.755]),
});

/**
 * The sand luminance of the ribbon and of the paddock sheet's last metres: one source so the two meet
 * without a seam. Needs COAST_DETAIL_GLSL (guarded, so both chunks may include it). `ready` is the pack's flag.
 */
export const COAST_RIM_SAND_GLSL = `
float ddRimSandLum(sampler2D pack, float ready, vec2 xz) {
  float a = ddCoastLum(pack, vec3(1.0, 0.0, 0.0), xz, 6.0);
  float b = ddCoastLum(pack, vec3(1.0, 0.0, 0.0), xz + vec2(11.7, 4.3), 1.9);
  return mix(1.0, a, 0.85 * ready) * mix(1.0, b, 0.8 * ready);
}`;

/** Vertex colour for a point on the ribbon. `up` is metres above still water; `bw` the cove weight. */
export function coastRimColour(qm, up, bw, jitter, out = new THREE.Color()) {
  // Rock coast: dry grass on the brow, the lit face in rockLight, the platform in between, rockDark
  // under the waterline and a toe 10 L* darker in the lowest 0.5 to 1 m.
  const rock = new THREE.Color().copy(TOK.grassDry);
  rock.lerp(TOK.rockLight, smooth(0.5, 4.5, qm));
  rock.lerp(TOK.rockDark, 0.45 * smooth(5, 9, qm));
  rock.lerp(TOK.rockLight, 0.35 * smooth(9, 12, qm));
  rock.lerp(TOK.rockDark, 0.75 * smooth(18, 23, qm));
  const toe = 1 - 0.28 * (1 - smooth(0.0, 0.9, up));
  rock.multiplyScalar(toe);
  // Pocket beach: dry sand above the swash, wet sand below it.
  // taste-r1 W15-C1: the cove is sand from its landward edge (the paddock sheet thins its grass over sand
  // before it, in ground-detail.js), and it is wet only toward the water. Before this the wet-sand lerp ran on
  // `up` alone, so a low brow made the whole landward edge wet sand against the grass.
  const sand = new THREE.Color().copy(TOK.sandDry);
  if (RIBBON_SAND.on) sand.setRGB(sand.r * RIBBON_SAND.mul[0], sand.g * RIBBON_SAND.mul[1], sand.b * RIBBON_SAND.mul[2], THREE.LinearSRGBColorSpace);
  sand.lerp(TOK.sandWet, smooth(0.55, 0.0, up) * smooth(3, 12, qm));
  // taste-r1 (W16-C): the grey of the sand's far rows is for rows under the water (the strip now stays above the water to Q 27
  // beside the city beach, where it drew as a grey-lilac band across dry sand), and the sand a metre or so above the
  // water is 14 % darker, the wet band the open rim has.
  sand.lerp(TOK.rockDark, 0.4 * smooth(14, 22, qm) * smooth(0.3, -0.2, up));
  out.copy(rock).lerp(sand, bw);
  out.multiplyScalar(1 - 0.14 * bw * smooth(0.18, 0.0, up));
  return out.multiplyScalar(jitter);
}

function rimAt(x, z, extent, plan, far = COAST_FAR.on === 1) {
  // taste-r1 (W32, COAST_FAR): the ribbon's field runs on past r 616 (the plain fall's own coast coordinate, `far`).
  const r = coastRimAt(x, z, extent, plan, undefined, far);
  return r.valid ? r : null;
}

function gradAt(x, z, extent, plan, far) {
  const d = 1.0;
  const a = rimAt(x + d, z, extent, plan, far);
  const b = rimAt(x - d, z, extent, plan, far);
  const c = rimAt(x, z + d, extent, plan, far);
  const e = rimAt(x, z - d, extent, plan, far);
  if (!a || !b || !c || !e) return null;
  const gx = (a.qm - b.qm) / (2 * d);
  const gz = (c.qm - e.qm) / (2 * d);
  const m = Math.hypot(gx, gz);
  return m > 1e-4 ? { gx, gz, m } : null;
}

/** Zero crossings of the coast coordinate on a circle about the board centre. */
function startPoints(extent, plan, radius, far = COAST_FAR.on === 1) {
  const cx = extent.x * 0.5;
  const cz = extent.z * 0.5;
  const N = 1440;
  const at = (a) => rimAt(cx + Math.sin(a) * radius, cz + Math.cos(a) * radius, extent, plan, far);
  const out = [];
  let prev = at(0);
  let prevA = 0;
  for (let i = 1; i <= N; i += 1) {
    const a = (i / N) * Math.PI * 2;
    const cur = at(a);
    if (prev && cur && (prev.qm <= 0) !== (cur.qm <= 0)) {
      let lo = prevA;
      let hi = a;
      let qLo = prev.qm;
      for (let k = 0; k < 16; k += 1) {
        const mid = 0.5 * (lo + hi);
        const m = at(mid);
        if (!m) break;
        if ((m.qm <= 0) === (qLo <= 0)) { lo = mid; qLo = m.qm; } else hi = mid;
      }
      const am = 0.5 * (lo + hi);
      out.push({ x: cx + Math.sin(am) * radius, z: cz + Math.cos(am) * radius });
    }
    prev = cur;
    prevA = a;
  }
  return out;
}

/** March the contour qm = 0 inward from a start point, every `step` metres. */
function traceLeg(start, extent, plan, step, maxSteps = 900, far = COAST_FAR.on === 1) {
  const cx = extent.x * 0.5;
  const cz = extent.z * 0.5;
  const pts = [];
  const heading = { x: 0, z: 0 };
  let x = start.x;
  let z = start.z;
  for (let i = 0; i < maxSteps; i += 1) {
    const g = gradAt(x, z, extent, plan, far);
    if (!g) break;
    // Project onto the contour.
    const r0 = rimAt(x, z, extent, plan, far);
    if (!r0) break;
    x -= (g.gx / (g.m * g.m)) * r0.qm;
    z -= (g.gz / (g.m * g.m)) * r0.qm;
    const g2 = gradAt(x, z, extent, plan, far);
    if (!g2) break;
    const r1 = rimAt(x, z, extent, plan, far);
    if (!r1) break;
    // W32: beyond r 560 the leg runs on at gate 0 (the far field); it still stops where the gate closes beside the board.
    if (r1.gate < 0.003 && !(far && Math.hypot(x - cx, z - cz) >= COAST_RIM.rFade0)) break;
    pts.push({ x, z, gx: g2.gx / g2.m, gz: g2.gz / g2.m, m: g2.m });
    // Tangent, oriented inward (toward the board centre).
    let tx = -g2.gz / g2.m;
    let tz = g2.gx / g2.m;
    // First step: toward the board centre. After that: whichever way keeps the previous heading, so a
    // stretch of contour that runs across the radius cannot flip the walk back on itself.
    const flip = i === 0 ? tx * (x - cx) + tz * (z - cz) > 0 : tx * heading.x + tz * heading.z < 0;
    if (flip) { tx = -tx; tz = -tz; }
    heading.x = tx;
    heading.z = tz;
    x += tx * step;
    z += tz * step;
  }
  return pts;
}

/**
 * The ribbon. Returns `null` when the plan has no hinterland coast.
 * `quality` low gets no ribbon at all (the plan carries no hinterland there).
 */
export function buildCoastRim({ extent, plan, seed = 0, step = COAST_RIM_STEP, liftAt = null } = {}) {
  if (!extent || !plan?.waterEdges) return null;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  // taste-r1 W15-C1: start at r 612 (gate 0.014), not 600 (gate 0.2): the far end tapers to nothing instead of a cut.
  // taste-r1 (W32, COAST_FAR): the legs start where the ribbon's width has closed (r 746), not at r 612: the beach passes the ring.
  const starts = startPoints(extent, plan, COAST_FAR.on ? COAST_FAR.width[1] - 2 : COAST_RIM.rFade1 - 4);
  const rowsN = COAST_RIM_ROWS.length;
  let legs = starts.map((s) => traceLeg(s, extent, plan, step)).filter((l) => l.length > 2);
  let tris = legs.reduce((n, l) => n + (l.length - 1) * (rowsN - 1) * 2, 0);
  if (tris > COAST_RIM_TRI_CAP) {
    const k = Math.ceil((tris / COAST_RIM_TRI_CAP) * 10) / 10;
    legs = starts.map((s) => traceLeg(s, extent, plan, step * k)).filter((l) => l.length > 2);
    tris = legs.reduce((n, l) => n + (l.length - 1) * (rowsN - 1) * 2, 0);
  }
  if (!legs.length) return null;
  // W32: the boulder seeds are the old legs' (r 612 start, the old width), so no instance set moves.
  let oldSeeds = null;
  if (COAST_FAR.on) {
    oldSeeds = [];
    const sOld = startPoints(extent, plan, COAST_RIM.rFade1 - 4, false);
    for (const leg of sOld.map((q) => traceLeg(q, extent, plan, step, 900, false)).filter((l) => l.length > 2)) {
      for (let i = 0; i < leg.length; i += 5) {
        const colRim = rimAt(leg[i].x, leg[i].z, extent, plan, false);
        const wfO = smooth(0.0, 0.55, colRim ? colRim.gate : 0) * smooth(0, 1, Math.min(i, leg.length - 1 - i) / 10);
        if (wfO > 0.9) oldSeeds.push({ x: leg[i].x, z: leg[i].z, gx: leg[i].gx, gz: leg[i].gz, i });
      }
    }
  }

  const positions = [];
  const colours = [];
  const coves = [];
  const qs = [];
  const indices = [];
  const tmp = new THREE.Color();
  let boulderSeeds = [];
  const farCx = extent.x * 0.5;
  const farCz = extent.z * 0.5;
  for (const leg of legs) {
    const base = positions.length / 3;
    const steadyOn = COAST_FAR.on && COAST_FAR.steady > 0;
    const stationR = [];
    const colArgs = [];
    const seaDir = COAST_FAR.on ? smoothedSeaward(leg) : null;
    for (let i = 0; i < leg.length; i += 1) {
      const p = leg[i];
      // taste-r1 W15-C1: both ends of a leg (the board end beside the city beach and the r 560 to 616 fade) taper:
      // the rows close up onto the landward row as the gate closes, so the ribbon narrows to nothing and no
      // cross-cut end is left standing (verdict regression 2: a flat slab with a hard cut and a white corner).
      const colRim = rimAt(p.x, p.z, extent, plan);
      // taste-r1 (W18): and a leg that stops where the coast field turns invalid (the port corridor term) closes over its last
      // ten columns (30 m), so the strip does not end in a full-width straight cut.
      const endTaper = smooth(0, 1, Math.min(i, leg.length - 1 - i) / 10);
      const wfOld = smooth(0.0, 0.55, colRim ? colRim.gate : 0) * endTaper;
      // W32: the width closes between COAST_FAR.width radii (the old closing at 560 to 616 made the mound at the leg's start).
      // The board end keeps its 0.55 (the beach beside the city does not change); the far end closes over the whole of `width` (72 m of radius), not its last 0.55 of it.
      const wf = COAST_FAR.on && colRim && colRim.gateW !== undefined ? smooth(0.0, 0.55, colRim.gateOut) * smooth(0.0, 1.0, colRim.gateR) * endTaper : wfOld;
      // W32 (COAST_FAR): the station's radius and the height of its brow row (row 2), which the section below hangs from.
      const farRp = COAST_FAR.on ? Math.hypot(p.x - farCx, p.z - farCz) : 0;
      let farBrow = 0;
      for (let k = 0; k < rowsN; k += 1) {
        const Q = COAST_RIM_ROWS[0] + (COAST_RIM_ROWS[k] - COAST_RIM_ROWS[0]) * wf;
        // Walk along the seaward gradient until the coordinate reads Q.
        let t = Q / p.m;
        let x = p.x + p.gx * t;
        let z = p.z + p.gz * t;
        for (let it = 0; it < 2; it += 1) {
          const r = rimAt(x, z, extent, plan);
          if (!r) break;
          t += (Q - r.qm) / p.m;
          x = p.x + p.gx * t;
          z = p.z + p.gz * t;
        }
        // taste-r1 (W33, COAST_FAR): from r 560 to 584 the row moves onto the ruler (see FAR_RULER_Q): the station's own point plus the metres of the row's
        // (width-closed) coordinate along the smoothed seaward direction. The row's Q, its section heights and its colour are as before.
        if (COAST_FAR.on) {
          const fr = smooth(COAST_FAR.section[0], COAST_FAR.section[1], farRp);
          if (fr > 0) {
            const mr = farRuler(Q);
            x = lerp(x, p.x + seaDir[i].x * mr, fr);
            z = lerp(z, p.z + seaDir[i].z * mr, fr);
          }
        }
        const rim = rimAt(x, z, extent, plan);
        // taste-r1 (W16-C): the waterline wander. Beside the city beach the cove's own shore is a smooth contour of the coast
        // coordinate with no shore noise (the noise is zero in a cove), so the sand met the water on a ruled line. The drawn
        // height of row Q is read at coast coordinate Qe = Q - dq, where dq is a three-scale wander (38 m, 15 m and 6.5 m
        // cells, up to 6 m, one sigma about 2.5 m) brought in over Q 3 to 9 (the shore lies at Q 14 beside the open rim and 27 in the cove) and out again before the last row, so the strip
        // still ends under water and the waterline on it meanders by dq. The ground FUNCTION is untouched; this is the
        // drawn strip only, weighted by the cove weight (the rock coast keeps its platform). Switch-off: WANDER_GAIN 0.
        const outB = Math.max(-z, z - extent.z, -x, x - extent.x);
        // taste-r1 (W16-C): the dive's reach is 22 to 120 m from the board (was 22 to 62), so the whole slab shelves into the water.
        const shelfW = 1 - smooth(0.4, 0.95, smooth(COAST_RIM.gateLo, 120, outB));
        let Qe = Q;
        let y0;
        const wanderW = rim && !rim.far ? Math.max(rim.bw * 0.5, shelfW) * smooth(0.0, 0.5, shelfW + rim.bw) : 0;
        // W32: under the rim profile the shore lies at Q 14 to 27, on the plain fall at Q 0: the wander's Q-weights read Q + 14 * (1 - gate) (gate 1 is the old text).
        const Qw = COAST_FAR.on && rim ? Q + 14 * (1 - rim.gate) : Q;
        if (wanderW > 0 && Qw > 3 && WANDER_GAIN > 0) {
          const dq = 2 * WANDER_GAIN * (WW[0] * noise3(x / 38 + seed, 1.7, z / 38) + WW[1] * noise3(x / 15 + seed, 5.3, z / 15) + WW[2] * noise3(x / 6.5 + seed, 9.1, z / 6.5))
            * smooth(3, 9, Qw) * (1 - smooth(28, COAST_RIM_ROWS[rowsN - 1] - 2, Qw)) * wanderW;
          // soft caps: a seaward wander over 5 m of Q lifted the ground of the brow into a dune with a hole in it (it4, x 368, z 357)
          Qe = Q - (dq > 0 ? 4 * Math.tanh(dq / 4) : 8 * Math.tanh(dq / 8));
          let ts = Qe / p.m;
          let xs = p.x + p.gx * ts;
          let zs = p.z + p.gz * ts;
          for (let it = 0; it < 2; it += 1) {
            const r = rimAt(xs, zs, extent, plan);
            if (!r) break;
            ts += (Qe - r.qm) / p.m;
            xs = p.x + p.gx * ts;
            zs = p.z + p.gz * ts;
          }
          y0 = surroundHeightAt(xs, zs, extent, plan);
        } else {
          y0 = surroundHeightAt(x, z, extent, plan);
        }
        // The sheet landward of the brow stands on the crust PLUS the overlay's own relief (up to a few
        // metres); the ribbon carries that relief to the brow and fades it down the face, so there is
        // no step where the sheet ends.
        const lift = liftAt ? liftAt(x, z) * (1 - smooth(0, 9, Q)) : 0;
        let y = y0 + lift + (k < 2 ? 0.15 : RIM_LIFT);
        // The board end: the ribbon is the city beach's own sand there. Its seaward rows dive on a 1 in 80 slope
        // from the brow toward the shelf (SAND_Y 0.06) and below the still water, so the water meets sand along a
        // shoreline, not along a 0.3 m edge (the shelf ends at z 342, the ribbon runs on past it). The ground
        // FUNCTION is untouched; this is the drawn strip only. The cove relief below breaks the line up.
        // Only east of x 320: the old wet-edge decal runs along x 316.5 to 319.6 (see RIM_LIFT) and shows through
        // wherever the ribbon stands lower than the ground it was drawn on, so the dive starts clear of it.
        if (shelfW > 0 && Qe > 4) {
          // taste-r1 (W16-C): over Q 4 to 18 the strip stands ON the 1 in 80 profile, not under it (the cove ground is flat within
          // 0.1 m of the water there, so a profile that only ever lowered it left the waterline to chance); beyond Q 26 it is the lower of the two.
          const prof = 0.12 - 0.0125 * (Qe - 4);
          y = lerp(y, lerp(prof, Math.min(y, prof), smooth(18, 26, Q)), shelfW * smooth(DIVE_X0, DIVE_X0 + 12, x));
        }
        if (COAST_FAR.on) {
          // W32 (COAST_FAR): beyond r 616 the landward rows stand on the DRAWN crust (its chord, not the true ground) with the ribbon's lift, so no crust
          // facet cuts the sand, joined over r 600 to 616 as the sheet's last band is (`RING_SEAM` seats it on the same chord). From r 560 the rows past the brow take one
          // cross-section whatever the gate: the brow's height (at most the cove's sand top) falling in a straight line to the waterline at coast
          // coordinate `dryQ` (about 11 m of dry sand), and on under the water at 1 in 9; the section closes onto the brow with the width (`wf`), so the
          // sand narrows to nothing at the far end. The bluff (rows 0 to 2) fades with the gate as before.
          if (k < 3) {
            const cj = smooth(RING_SEAM.seatFrom, RING_SEAM.seatTo, farRp);
            if (cj > 0) y = lerp(y, drawnCrustHeightAt(x, z, extent, plan) + (k < 2 ? 0.15 : RIM_LIFT), cj);
            if (k === 2) farBrow = y;
          } else {
            const fb = smooth(COAST_FAR.section[0], COAST_FAR.section[1], farRp);
            if (fb > 0) {
              const wl = WATER_Y + RIM_LIFT;
              const top = Math.max(wl, Math.min(farBrow, WATER_Y + COAST_RIM.beachTop + RIM_LIFT));
              const Q0 = COAST_RIM_ROWS[k];
              const ySec = Q0 <= COAST_FAR.dryQ ? lerp(top, wl, (Q0 - 3) / (COAST_FAR.dryQ - 3)) : wl - (Q0 - COAST_FAR.dryQ) / 9;
              y = lerp(y, lerp(farBrow, ySec, wf), fb);
            }
          }
        }
        if (rim && rim.bw > 0 && Q > 1) y += rim.bw * 0.07 * 2 * noise3(x / 9 + seed, 0.5, z / 9);
        // taste-r1 (W16): the tip of the beach shelf mesh (nature:beach-shelf:east:patch:1) at about x 330.4, z 326.3 showed as a brown
        // triangle in the water once the slab shelved under it. The shelf now sinks its own tip (ddCoveCut in water/sand.js); a sand
        // cape stood over it for one iteration and read as a brown mound in the bay.
        positions.push(x, y, z);
        // taste-r1 (W33, COAST_FAR): the far ribbon is sand whatever the cove noise says (the rock weight made it a grey-lilac band beside the sand of the crust
        // where it passes the ring, r 600 and on), whole by r 600.
        const bwc = COAST_FAR.on ? Math.max(rim ? rim.bw : 0, smooth(560, 600, farRp)) : (rim ? rim.bw : 0);
        const jit = 0.97 + 0.06 * hash2(x * 0.7 + seed, z * 0.7);
        coastRimColour(Q, y - WATER_Y, bwc, jit, tmp);
        colours.push(tmp.r, tmp.g, tmp.b);
        if (steadyOn) colArgs.push(Q, bwc, jit);
        coves.push(bwc);
        qs.push(Q);
      }
      if (BANK_SECTION.on && COAST_FAR.on) {
        // taste-r1 (W52, BANK_SECTION): where the ground's bluff still stands at the toe (r 500 to 584, before the section is whole) rows 3 to 5 are eased onto a ramp that
        // meets row 6 flat (a smoothstep from the brow row's height at coordinate 0 to row 6's at 9: the row 2 to row 3 drop stays near a quarter of the fall).
        // The weight is how far the brow row stands over row 6 (0 under 2 m, whole over 4 m), so a station whose brow is down on the beach does not move; where the section has already
        // lowered rows 3 to 5 under a high brow (r 560 to 578) the parabola stands them back up to a slope of about 45 degrees, so no row 3 foot is left under the brow.
        const v0 = base + i * rowsN;
        const yb2 = positions[(v0 + 2) * 3 + 1];
        const yb6 = positions[(v0 + 6) * 3 + 1];
        const eb = smooth(BANK_SECTION.from[0], BANK_SECTION.from[1], farRp) * (1 - smooth(BANK_SECTION.to[0], BANK_SECTION.to[1], farRp))
          * smooth(BANK_SECTION.drop[0], BANK_SECTION.drop[1], yb2 - yb6);
        if (eb > 0 && yb2 > yb6) {
          for (let k = 3; k < 6; k += 1) {
            const u = (COAST_RIM_ROWS[k] - COAST_RIM_ROWS[2]) / (COAST_RIM_ROWS[6] - COAST_RIM_ROWS[2]);
            const vi = v0 + k;
            positions[vi * 3 + 1] = lerp(positions[vi * 3 + 1], yb6 + (yb2 - yb6) * (1 - u * u * (3 - 2 * u)), eb);
            const jb = 0.97 + 0.06 * hash2(positions[vi * 3] * 0.7 + seed, positions[vi * 3 + 2] * 0.7);
            coastRimColour(qs[vi], positions[vi * 3 + 1] - WATER_Y, coves[vi], jb, tmp);
            colours[vi * 3] = tmp.r;
            colours[vi * 3 + 1] = tmp.g;
            colours[vi * 3 + 2] = tmp.b;
          }
        }
      }
      if (!COAST_FAR.on && i % 5 === 0 && wfOld > 0.9) boulderSeeds.push({ x: p.x, z: p.z, gx: p.gx, gz: p.gz, i });
      if (steadyOn) stationR.push(farRp);
    }
    if (steadyOn) {
      // taste-r1 (W36, COAST_FAR.steady): see COAST_FAR. Heights only, then the colour of each vertex is read again at its new height (the wet-sand band keys on it).
      const free = stationR.map((r) => r >= COAST_FAR.steadyFrom);
      const ys = new Float64Array(leg.length);
      for (let k = 0; k < rowsN; k += 1) {
        for (let i = 0; i < leg.length; i += 1) ys[i] = positions[(base + i * rowsN + k) * 3 + 1];
        relaxRow(ys, free, COAST_FAR.steadyStep);
        for (let i = 0; i < leg.length; i += 1) positions[(base + i * rowsN + k) * 3 + 1] = ys[i];
      }
      for (let v = 0; v < leg.length * rowsN; v += 1) {
        if (!free[Math.floor(v / rowsN)]) continue;
        coastRimColour(colArgs[v * 3], positions[(base + v) * 3 + 1] - WATER_Y, colArgs[v * 3 + 1], colArgs[v * 3 + 2], tmp);
        colours[(base + v) * 3] = tmp.r;
        colours[(base + v) * 3 + 1] = tmp.g;
        colours[(base + v) * 3 + 2] = tmp.b;
      }
    }
    const first = indices.length;
    for (let i = 0; i < leg.length - 1; i += 1) {
      for (let k = 0; k < rowsN - 1; k += 1) {
        const a = base + i * rowsN + k;
        const b = a + 1;
        const c = a + rowsN;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
    // Wind every triangle of this leg to face up: the leg's tangent runs either way round.
    let ny = 0;
    for (let f = first; f < indices.length; f += 3) {
      const ia = indices[f] * 3;
      const ib = indices[f + 1] * 3;
      const ic = indices[f + 2] * 3;
      const ux = positions[ib] - positions[ia];
      const uy = positions[ib + 1] - positions[ia + 1];
      const uz = positions[ib + 2] - positions[ia + 2];
      const vx = positions[ic] - positions[ia];
      const vy = positions[ic + 1] - positions[ia + 1];
      const vz = positions[ic + 2] - positions[ia + 2];
      ny += uz * vx - ux * vz;
    }
    if (ny < 0) {
      for (let f = first; f < indices.length; f += 3) {
        const tmpI = indices[f + 1];
        indices[f + 1] = indices[f + 2];
        indices[f + 2] = tmpI;
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geo.setAttribute('aCove', new THREE.Float32BufferAttribute(coves, 1));
  geo.setAttribute('aQ', new THREE.Float32BufferAttribute(qs, 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0.0,
    envMapIntensity: 0.26,
    fog: true,
  });
  mat.userData.envIntensityBase = 0.26;
  attachCoastRimDetail(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'fringe:hinterland-coast-rim';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.renderOrder = -15;
  mesh.userData.coastRim = {
    triangles: indices.length / 3,
    legs: legs.map((l) => l.length),
    lengthM: legs.reduce((n, l) => n + (l.length - 1) * step, 0),
    buildMs: typeof performance !== 'undefined' ? performance.now() - t0 : 0,
    rows: COAST_RIM_ROWS,
    seeds: oldSeeds ?? boulderSeeds,
  };
  return mesh;
}

// ---------------------------------------------------------------------------------------------
// Boulders: basalt blocks on the rock platform. Pocket Reserve's `blockRockGeo`
// (`src/view/civ7/veg-triplanar.ts:692`, an icosahedron cut by 8 to 10 planes and flattened below) at
// detail 1 (80 triangles), placed with the run mask and cubed-hash sizes of `shore-detail.ts:222-236`
// and sunk by 0.35 of their radius. Pure functions of the seed.

function hash01(n) {
  const h = Math.sin(n * 127.1) * 43758.5453;
  return h - Math.floor(h);
}
function noise3(x, y, z) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);
  const at = (i, j, k) => hash01(i * 12.9898 + j * 78.233 + k * 37.719);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(at(x0, y0, z0), at(x0 + 1, y0, z0), sx), l(at(x0, y0 + 1, z0), at(x0 + 1, y0 + 1, z0), sx), sy),
    l(l(at(x0, y0, z0 + 1), at(x0 + 1, y0, z0 + 1), sx), l(at(x0, y0 + 1, z0 + 1), at(x0 + 1, y0 + 1, z0 + 1), sx), sy),
    sz,
  ) - 0.5;
}

/** A fractured block: a lumpy core cut by a tilted top and five to seven side breaks, flat below. */
export function coastBlockGeo(seed) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.getAttribute('position');
  const v = new THREE.Vector3();
  const o = seed * 3.7;
  const h = (k) => hash01(seed * 7.3 + k);
  const cuts = [[(h(1) - 0.5) * 0.6, 1, (h(2) - 0.5) * 0.6, 0.4 + h(3) * 0.2]];
  const ns = 5 + Math.floor(h(4) * 3);
  for (let i = 0; i < ns; i += 1) {
    const a = ((i + h(i + 5) * 0.7) * Math.PI * 2) / ns;
    cuts.push([Math.cos(a), (h(i + 11) - 0.35) * 0.7, Math.sin(a), 0.6 + h(i + 17) * 0.22]);
  }
  for (let i = 0; i < 2; i += 1) {
    cuts.push([Math.cos(h(i + 23) * 6.3), 1.1, Math.sin(h(i + 23) * 6.3), 0.7 + h(i + 29) * 0.1]);
  }
  for (const c of cuts) {
    const l = Math.hypot(c[0], c[1], c[2]);
    for (let k = 0; k < 3; k += 1) c[k] /= l;
  }
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i).normalize();
    v.multiplyScalar(0.85 + (noise3(v.x * 1.9 + o, v.y * 2.3 + o, v.z * 1.7 + o) + 0.5) * 0.35);
    for (let pass = 0; pass < 2; pass += 1) {
      for (const [nx, ny, nz, d] of cuts) {
        const e = v.x * nx + v.y * ny + v.z * nz - d;
        if (e > 0) v.set(v.x - nx * e, v.y - ny * e, v.z - nz * e);
      }
    }
    pos.setXYZ(i, v.x * 1.25, v.y < 0 ? v.y * 0.45 : v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export const COAST_BOULDER_CAP = 40;

/**
 * At most 40 blocks, 1.2 to 3 m across, in loose runs on at most 30% of the rim and only on rock
 * coast (never in a cove). `ribbon` is the mesh `buildCoastRim` returned (its `userData.coastRim.seeds`).
 */
export function buildCoastBoulders({ extent, plan, ribbon, seed = 0 }) {
  const seeds = ribbon?.userData?.coastRim?.seeds;
  if (!seeds?.length) return null;
  const spots = [];
  for (const s of seeds) {
    if (spots.length >= COAST_BOULDER_CAP) break;
    // A run mask: boulders stand in runs with bare platform between them.
    if (Math.sin(s.x * 0.071 - 0.7) * Math.sin(s.z * 0.063 + 1.9) < 0.15) continue;
    const key = s.x * 0.37 + s.z * 0.91 + seed;
    const q = 11 + hash01(key + 3) * 5;
    const m = Math.hypot(s.gx, s.gz) || 1;
    let x = s.x + (s.gx / m) * q * 1.2;
    let z = s.z + (s.gz / m) * q * 1.2;
    for (let it = 0; it < 2; it += 1) {
      const r = coastRimAt(x, z, extent, plan);
      if (!r.valid) break;
      x += (s.gx / m) * (q - r.qm) * 1.1;
      z += (s.gz / m) * (q - r.qm) * 1.1;
    }
    const rim = coastRimAt(x, z, extent, plan);
    if (!rim.valid || rim.bw > 0.3) continue;
    // Cubed hash, as shore-detail.ts does: mostly small, a few large.
    const radius = 0.6 + 0.9 * hash01(key + 7) ** 3;
    const along = (hash01(key + 11) - 0.5) * 6;
    x += (-s.gz / m) * along;
    z += (s.gx / m) * along;
    spots.push({ x, z, radius, yaw: hash01(key + 13) * Math.PI * 2, shape: Math.floor(hash01(key + 17) * 3) });
  }
  if (!spots.length) return null;
  const geos = [0, 1, 2].map((k) => coastBlockGeo(31 + k * 7));
  const group = new THREE.Group();
  group.name = 'fringe:coast-rim-boulders';
  const mat = new THREE.MeshStandardMaterial({
    color: '#ffffff', roughness: 0.95, metalness: 0, flatShading: true, envMapIntensity: 0.26,
  });
  mat.userData.envIntensityBase = 0.26;
  // taste-r1 W15-C1: the blocks carry the rock pack's luminance (`rock` and `drystone` channels, the same lookup the
  // ribbon's rock face uses) under their basalt token, so they read as the same stone as the platform they stand on.
  const rockPack = loadCoastPack('rock');
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBlRock = { value: rockPack.texture };
    shader.uniforms.uBlRockReady = rockPack.ready;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBlWorld;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
vBlWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
vBlWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uBlRock;
uniform float uBlRockReady;
varying vec3 vBlWorld;
${COAST_DETAIL_GLSL}`)
      .replace('#include <roughnessmap_fragment>', `
{
  vec2 blUv = vec2(vBlWorld.x + vBlWorld.z, vBlWorld.y * 1.6);
  diffuseColor.rgb *= mix(1.0, ddCoastLum(uBlRock, vec3(0.0, 0.6, 0.4), blUv, 2.6), 0.9 * uBlRockReady);
}
#include <roughnessmap_fragment>`);
  };
  mat.customProgramCacheKey = () => 'coast-rim-boulders-w15c1-v1';
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let triangles = 0;
  for (let k = 0; k < 3; k += 1) {
    const mine = spots.filter((s) => s.shape === k);
    if (!mine.length) continue;
    const mesh = new THREE.InstancedMesh(geos[k], mat, mine.length);
    mesh.name = `fringe:coast-rim-boulders-${k}`;
    mine.forEach((s, i) => {
      const y = surroundHeightAt(s.x, s.z, extent, plan);
      dummy.position.set(s.x, y - 0.35 * s.radius, s.z);
      dummy.rotation.set(0, s.yaw, 0);
      dummy.scale.set(s.radius, s.radius * 0.8, s.radius);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      col.set(TASTE.ground.rockDark).multiplyScalar(0.9 + 0.2 * hash01(s.x * 0.31 + s.z * 0.17));
      mesh.setColorAt(i, col);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    triangles += (geos[k].getAttribute('position').count / 3) * mine.length;
    group.add(mesh);
  }
  group.userData.coastBoulders = { count: spots.length, triangles, spots };
  return group;
}

/**
 * Luminance detail under the vertex colour: the `rock` and `drystone` channels of the rock pack on the
 * rock coast (one `ddCoastLum`, two fetches) and the `sandDry` channel of the coast pack in the coves
 * (two more). Hue stays on the token; only value moves. Every term is multiplied by the pack's `ready`.
 * The lookup runs in (x + z, y) so a steep face is not stretched into one streak.
 */
function attachCoastRimDetail(material) {
  const rock = loadCoastPack('rock');
  const coast = loadCoastPack('coast');
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRimRock = { value: rock.texture };
    shader.uniforms.uRimRockReady = rock.ready;
    shader.uniforms.uRimCoast = { value: coast.texture };
    shader.uniforms.uRimCoastReady = coast.ready;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCove;\nattribute float aQ;\nvarying float vCove;\nvarying float vRimQ;\nvarying vec3 vRimWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCove = aCove;\nvRimQ = aQ;\nvRimWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uRimRock;
uniform float uRimRockReady;
uniform sampler2D uRimCoast;
uniform float uRimCoastReady;
varying float vCove;
varying float vRimQ;
varying vec3 vRimWorld;
${COAST_DETAIL_GLSL}
${COAST_RIM_SAND_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  // taste-r1 W15-C1: the landward three metres are a dithered edge, not a line. The paddock sheet is still drawn
  // under qm -1, so where this strip lets go the sheet shows through, and the strip's edge, which followed the
  // 3 m columns as a scallop, becomes a ragged fringe a metre or two deep. Fully drawn from qm -1.2 on.
  float rimCoverQ = smoothstep(-3.0, -1.2, vRimQ);
  float rimDither = 0.6 * ddCoastNoise(vRimWorld.xz / 0.9) + 0.4 * ddCoastNoise(vRimWorld.xz / 3.1 + vec2(5.1, 2.3));
  if (rimCoverQ < 0.999 && rimDither > rimCoverQ) discard;
}`)
      .replace('#include <roughnessmap_fragment>', `
{
  vec2 rimUv = vec2(vRimWorld.x + vRimWorld.z, vRimWorld.y * 1.6);
  float rimRock = mix(1.0, ddCoastLum(uRimRock, vec3(0.0, 0.6, 0.4), rimUv, 5.0), 0.85 * uRimRockReady);
  float rimSand = ddRimSandLum(uRimCoast, uRimCoastReady, vRimWorld.xz);
  // taste-r1 (W16-C): two more scales of sand surface (a 3.7 m swell and a 1.3 m ripple) so a slab of open sand is never one tone.
  rimSand *= 1.0 + 0.16 * (ddCoastNoise(vRimWorld.xz / 3.7 + vec2(1.7, 8.3)) - 0.5) + 0.12 * (ddCoastNoise(vRimWorld.xz / 1.3 + vec2(6.1, 2.2)) - 0.5);
  diffuseColor.rgb *= mix(rimRock, rimSand, clamp(vCove, 0.0, 1.0));
}
#include <roughnessmap_fragment>`);
  };
  material.customProgramCacheKey = () => 'coast-rim-detail-w16c-v1';
  material.needsUpdate = true;
}

/**
 * taste-r1 (W22-B): LANDFORM_BOULDERS. Blocks from the coast kit on the trial ridge, half sunk, at the foot of the scarp and
 * along the crest. `count` is the switch (0 builds nothing); the group is only built while the trial landform is on.
 * `footShare` of them stand at the scarp foot. `groundAt(x, z)` is the built sheet's sampler.
 */
export const LANDFORM_BOULDERS = { count: 26, footShare: 0.65, radius: [1.1, 3.0] };

export function buildRidgeBoulders({ groundAt, seed = 0 }) {
  const T = LANDFORM_TRIAL;
  if (!(T.gain > 0) || !(LANDFORM_BOULDERS.count > 0) || typeof groundAt !== 'function') return null;
  const at = (s, t) => [T.cx + s * T.ax - t * T.az, T.cz + s * T.az + t * T.ax];
  const spots = [];
  const nFoot = Math.round(LANDFORM_BOULDERS.count * LANDFORM_BOULDERS.footShare);
  for (let i = 0; i < LANDFORM_BOULDERS.count; i += 1) {
    const foot = i < nFoot;
    const k = seed * 13.1 + i * 7.77;
    // runs: bunch them along the ridge with bare ground between
    const s = (foot ? -78 + (i / Math.max(1, nFoot - 1)) * 150 : -70 + ((i - nFoot) / Math.max(1, LANDFORM_BOULDERS.count - nFoot - 1)) * 120) + (hash01(k + 1) - 0.5) * 16;
    let t;
    if (foot) {
      // where the scarp's skirt falls to about a metre over the plain beyond it
      const far = groundAt(...at(s, 72)) ?? 0;
      t = 50;
      for (let tt = 30; tt <= 70; tt += 2) {
        const g = groundAt(...at(s, tt));
        if (g !== null && g - far < 1.2) { t = tt + (hash01(k + 2) - 0.3) * 7; break; }
      }
    } else {
      let best = -Infinity;
      t = 0;
      for (let tt = -16; tt <= 16; tt += 2) {
        const g = groundAt(...at(s, tt));
        if (g !== null && g > best) { best = g; t = tt; }
      }
      t += (hash01(k + 3) - 0.5) * 6;
    }
    const [x, z] = at(s, t);
    const y = groundAt(x, z);
    if (y === null) continue;
    const radius = LANDFORM_BOULDERS.radius[0] + (LANDFORM_BOULDERS.radius[1] - LANDFORM_BOULDERS.radius[0]) * hash01(k + 7) ** 2;
    spots.push({ x, y, z, radius, yaw: hash01(k + 13) * Math.PI * 2, shape: Math.floor(hash01(k + 17) * 3) });
  }
  if (!spots.length) return null;
  const geos = [0, 1, 2].map((q) => coastBlockGeo(31 + q * 7));
  const group = new THREE.Group();
  group.name = 'fringe:ridge-boulders';
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, metalness: 0, flatShading: true, envMapIntensity: 0.26 });
  mat.userData.envIntensityBase = 0.26;
  const rockPack = loadCoastPack('rock');
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBlRock = { value: rockPack.texture };
    shader.uniforms.uBlRockReady = rockPack.ready;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBlWorld;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
vBlWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
vBlWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uBlRock;
uniform float uBlRockReady;
varying vec3 vBlWorld;
${COAST_DETAIL_GLSL}`)
      .replace('#include <roughnessmap_fragment>', `
{
  vec2 blUv = vec2(vBlWorld.x + vBlWorld.z, vBlWorld.y * 1.6);
  diffuseColor.rgb *= mix(1.0, ddCoastLum(uBlRock, vec3(0.0, 0.6, 0.4), blUv, 2.6), 0.9 * uBlRockReady);
}
#include <roughnessmap_fragment>`);
  };
  mat.customProgramCacheKey = () => 'ridge-boulders-w22b-v1';
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let triangles = 0;
  for (let q = 0; q < 3; q += 1) {
    const mine = spots.filter((sp) => sp.shape === q);
    if (!mine.length) continue;
    const mesh = new THREE.InstancedMesh(geos[q], mat, mine.length);
    mesh.name = `fringe:ridge-boulders-${q}`;
    mine.forEach((sp, i) => {
      dummy.position.set(sp.x, sp.y - 0.4 * sp.radius, sp.z);
      dummy.rotation.set(0, sp.yaw, 0);
      dummy.scale.set(sp.radius, sp.radius * 0.8, sp.radius);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      // the cool rockDark token lit to near white on this lit slope; a warm brown-grey at a third of its value sits in the paddock's range
      col.set('#52493f').multiplyScalar(0.80 + 0.30 * hash01(sp.x * 0.31 + sp.z * 0.17));
      mesh.setColorAt(i, col);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    triangles += (geos[q].getAttribute('position').count / 3) * mine.length;
    group.add(mesh);
  }
  group.userData.ridgeBoulders = { count: spots.length, triangles, spots };
  return group;
}
