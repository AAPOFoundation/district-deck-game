// District Deck — wave modelling + animation (vertex side of the water program).
// Owner seat: WAVES. Contract: ./contract.js — read it before editing.
//
// Responsibility
//   • the water mesh tessellation (graded: dense in the surf zone, coarse offshore)
//   • a shoaling Gerstner swell spectrum with a proper cross-shore phase field
//   • shoaling: Green's-law growth, Snell refraction, cnoidal crest skew, a
//     forward-pitched face at the break, and dissipation into a spent bore
//   • the analytic surface normal, steepness, crest and fold signals that the
//     fragment side (surface.js / foam.js) shades from
//
// It must NOT decide colour or foam coverage — it reports physics, they shade it.
//
// ── Model notes (why it is built this way) ──────────────────────────────────
//
// PHASE FIELD. A shoaling wave cannot use `k_local · x` for its phase: the local
// wavenumber grows toward the beach while x shrinks, and the product is not
// monotone — over part of the surf zone the crests actually run backwards. This
// build integrates the cross-shore wavenumber instead,
//
//     S(along, front) = κ‖·along + ∫₀^front k_⊥(f) df − ω t
//
// with κ‖ = k₀·d₀.x held constant (Snell's law for a straight coast, which is
// also what turns the crests parallel to the beach as they shoal) and
// k_⊥ = −√(k(f)² − κ‖²). The integral is a five-node quadrature with the nodes
// clustered on the shore end, where the integrand actually varies. ω is the
// deep-water value and stays constant per component, so the period is conserved
// and the crest speed falls out as √(gh) in the shallows on its own.
//
// PROFILE. Shoaling waves are cnoidal, not sinusoidal: a peaked crest well above
// still water and a long flat trough a little below it. Each component uses
//
//     y = 2A·(u^P − m(P)),   u = ½ + ½·sin S,   m(P) = mean of u^P
//
// which is exactly sin S at P = 1 and grows sharper as P rises toward the break.
// The asymmetry is also what makes the tight trough budget affordable: the floor
// is only 0.57 m under still water, and a cnoidal wave spends most of its
// amplitude above the line, not below it.
//
// TROUGHS. water.js hard-clamps at WATER_FLOOR_Y. A clamped trough is a flat
// spot, so the sum is passed through a soft floor (a shifted softplus) that is
// the identity until it approaches the limit and then asymptotes above it. The
// same call returns the derivative gain, so the analytic normal stays exact.
//
// ── R02: the horizontal budget (why the close range used to boil) ───────────
//
// R01 shipped a per-component cap on the Gerstner Q and on the forward pitch,
// and no cap at all on their SUM. Measured over the surf zone that sum reached
// 3.5 m of horizontal displacement against a 0.95 m mesh row: every vertex was
// being thrown three to four rows out of place, the sheet folded through itself
// continuously, and at `03-surf-macro` range the picture boiled — luma
// autocorrelation +0.10 at 83 ms and +0.05 at 167 ms on the board.
//
// The forward-pitch term was the larger half of it and the reason is structural:
// `lean·A·u^P` is non-negative, so six components' pitch terms all push the same
// way and add linearly, where the Gerstner cosine is zero-mean and partly
// cancels. It also carried a DC offset (mean u^P), which translated the whole
// surf sheet ~1.5 m shoreward of the position every `front`-keyed gate in
// foam.js and surface.js assumes.
//
// Both are fixed here. The pitch is zero-mean (`u^P − mean`), and the total
// horizontal excursion is held under a fraction of the local mesh row by one
// shared scale applied to every component's Q and pitch before the phase loop.
// The budget follows the mesh, so it is tight where the rows are fine and loose
// in the far field where one row is metres across. Nothing in the ELEVATION
// field is touched by any of it — the shore-normal relief that W-R01d was about
// is carried by `prof`, `ddCrestSkew` and `ddCrestCeiling`, none of which move.
//
// BREAKING. R01 gated `fold` on a pure depth band, which made the plunge line —
// and therefore foam.js's bore edge — a dead-straight depth contour. It is now
// the classic depth-limited criterion, local wave height over local depth, so
// the break line is ragged, breathes with the sets, and moves with the water
// rather than with a ruler.
//
// SAMPLING. `crest` and `fold` are computed per VERTEX and interpolated. A u⁴
// crest peak is ~26 % of a period wide and the old `fold` gate was ~4.5 %, so on
// the short components both were narrower than the row spacing and neither
// survived reconstruction. Both are now band-limited to the mesh: the crest
// exponent and the fold gate width are derived from how many rows the local
// wavelength actually spans.

import * as THREE from 'three';
import { BATHY, WATER_EXTENT, WATER_FACE, depthAt } from './contract.js';

/** Wavelength compression factor at zero depth (shallow-water limit). */
const LEN_FLOOR = 0.19;
/** Soft trough asymptote, metres below still water (hard floor is 0.57 m). */
const TROUGH_FLOOR = 0.50;
/** Knee width of the trough compressor. */
const TROUGH_KNEE = 0.09;
/** Quadrature nodes for the cross-shore phase integral. */
const PHASE_STEPS = 5;
/** Seaward extent of the finest mesh band (the break), in `front` metres. */
const SURF_BAND = 34;
/** Seaward extent of the second mesh band, in `front` metres. */
const FINE_BAND = 96;
/** Vertical crest/trough asymmetry reached in the surf zone. */
const CREST_SKEW = 0.40;
/** Extra surf-zone amplitude over the open bay. */
const SURF_PUNCH = 1.32;
/** Depth-limited crest ceiling: base (m), slope per metre of depth, knee. */
const CREST_CAP = [0.40, 0.72, 0.28];
/** Peak horizontal excursion allowed, as a fraction of the local mesh row. */
const HORIZ_BUDGET = 0.62;
/** Along-shore bed variation (fraction of depth) that bends the refraction. */
const BED_VARY = 0.17;

/**
 * Graded water mesh.
 *
 * Four bands: a coarse landward apron that never displaces; a SURF band from
 * just landward of the waterline out past the plunge line, at the finest rows in
 * the mesh — this is where the lip lives and a lip is a metre-scale fold, so it
 * needs rows well under a metre; a mid band across the rest of the shelf and the
 * offshore bar; then geometric coarsening out to the far edge.
 *
 * R01 ran one 0.95 m fine band from the waterline to front 96. That is enough
 * for a swell and not enough for a break: an overturning lip is ~0.7 m across,
 * so at 0.95 m rows it fell between two vertices and could not be represented at
 * all. Splitting the band buys the break real resolution and pays for it out of
 * the shelf, where nothing needs sub-metre rows.
 *
 * @param {string} quality
 */
export function meshGrading(quality = 'high') {
  const low = quality === 'low';
  const medium = quality === 'medium';
  return {
    surfStep: low ? 1.9 : medium ? 1.05 : 0.62,
    midStep: low ? 3.0 : medium ? 1.8 : 1.15,
    apronStep: low ? 5.0 : medium ? 3.4 : 2.2,
    maxStep: low ? 12.0 : medium ? 6.0 : 3.5,
    growth: low ? 1.16 : medium ? 1.075 : 1.045,
    alongSegs: low ? 84 : medium ? 136 : 204,
  };
}

export function buildWaterGeometry({ alongLength, inlandPad, quality = 'high' }) {
  const g = meshGrading(quality);
  const { surfStep, midStep, apronStep, maxStep, growth, alongSegs } = g;

  const start = -inlandPad;
  const end = WATER_EXTENT;
  // Surf band brackets the meandering waterline and the whole plunge line.
  const surfFrom = Math.max(start + apronStep, WATER_FACE - 14);
  const surfTo = Math.min(end - 1, WATER_FACE + SURF_BAND);
  const midTo = Math.min(end - 1, WATER_FACE + FINE_BAND);

  const rowsZ = [start];
  let z = start;
  while (z < surfFrom - 1e-4) {
    z = Math.min(z + apronStep, surfFrom);
    rowsZ.push(z);
  }
  while (z < surfTo - 1e-4) {
    z = Math.min(z + surfStep, surfTo);
    rowsZ.push(z);
  }
  while (z < midTo - 1e-4) {
    z = Math.min(z + midStep, midTo);
    rowsZ.push(z);
  }
  let step = midStep;
  while (z < end - 1e-4) {
    step = Math.min(step * growth, maxStep);
    z = Math.min(z + step, end);
    rowsZ.push(z);
  }

  const rows = rowsZ.length;
  const seaSegs = rows - 1;
  const cols = alongSegs + 1;
  const count = cols * rows;
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const halfAlong = alongLength / 2;
  const span = end - start;

  for (let r = 0; r < rows; r += 1) {
    const s = rowsZ[r];
    const v = (s - start) / span;
    for (let c = 0; c < cols; c += 1) {
      const a = -halfAlong + (alongLength * c) / alongSegs;
      const i = r * cols + c;
      // Break the regular lattice so shallow overlap with the beach
      // cannot light as a taupe waffle.
      const jit = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453;
      const j = jit - Math.floor(jit);
      positions[i * 3] = a + (j - 0.5) * 0.92;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = s + (j - 0.5) * 0.28;
      uvs[i * 2] = c / alongSegs;
      uvs[i * 2 + 1] = v;
    }
  }

  const indices = new Uint32Array(seaSegs * alongSegs * 6);
  let w = 0;
  for (let r = 0; r < seaSegs; r += 1) {
    for (let c = 0; c < alongSegs; c += 1) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      indices[w] = a; indices[w + 1] = d; indices[w + 2] = b;
      indices[w + 3] = b; indices[w + 4] = d; indices[w + 5] = e;
      w += 6;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, 0, (start + end) / 2),
    Math.max(alongLength, span),
  );
  return { geometry, seawardStart: start, rows };
}

/**
 * Directional swell spectrum. Each entry is one Gerstner component:
 *   dir      unit vector in (along, seaward) — the seaward component is negative
 *   len      deep-water wavelength (m); what you SEE offshore is len × ~0.65
 *            because a 9 m bay is not deep water for a long swell
 *   amp      deep-water amplitude (m), before Green's-law shoaling gain
 *   steep    Gerstner Q weight (crest sharpness)
 *   shoreBias 0 = open-sea swell, 1 = only present in the surf zone
 *   group    how strongly the travelling set envelope modulates this component;
 *            sets modulate swell, not wind ripple
 *
 * Sorted long → short. Nothing shorter than ~6 m: the mesh is 0.62 m across the
 * break and 1.6 m along the shore, and the previous 2.9 m component aliased into
 * the salt-and-pepper dither that read as mesh noise in the open bay.
 *
 * TWO TRAINS. R01's six components spread 2°–36° of deep-water obliquity but put
 * 78 % of the energy in the two most shore-normal of them, so the R01 critic's
 * FFT of the mid-field found five components inside a ±2° spread: one train, and
 * an unnaturally regular one. § 6.1's 9-band wants two or three trains at
 * differing angles interfering. The 23 m entry is that second train — long
 * enough to survive the mesh in the far field, oblique enough (32°) to cross the
 * primary visibly, and heavy enough to be seen doing it.
 */
export const SWELL = Object.freeze([
  { dir: [0.04, -1.0], len: 41.0, amp: 0.212, steep: 1.00, shoreBias: 0.00, group: 1.00 },
  { dir: [-0.14, -1.0], len: 27.0, amp: 0.118, steep: 0.95, shoreBias: 0.00, group: 0.80 },
  { dir: [0.62, -1.0], len: 23.0, amp: 0.104, steep: 0.90, shoreBias: 0.00, group: 0.85 },
  { dir: [0.23, -1.0], len: 18.0, amp: 0.080, steep: 0.85, shoreBias: 0.06, group: 0.55 },
  { dir: [-0.33, -1.0], len: 12.0, amp: 0.054, steep: 0.68, shoreBias: 0.15, group: 0.30 },
  { dir: [0.50, -1.0], len: 8.0, amp: 0.035, steep: 0.52, shoreBias: 0.22, group: 0.10 },
  { dir: [-0.72, -1.0], len: 5.4, amp: 0.021, steep: 0.38, shoreBias: 0.28, group: 0.00 },
]);

const N_SWELL = SWELL.length;

export const WAVES_GLSL = /* glsl */ `
  #ifndef DD_WAVES
  #define DD_WAVES

  #define DD_SWELL ${N_SWELL}
  #define DD_PHASE_STEPS ${PHASE_STEPS}
  #define DD_LEN_FLOOR ${LEN_FLOOR.toFixed(3)}
  #define DD_SURF_BAND ${SURF_BAND.toFixed(1)}
  #define DD_FINE_BAND ${FINE_BAND.toFixed(1)}

  uniform vec2  uSwellDir[DD_SWELL];
  uniform float uSwellLen[DD_SWELL];
  uniform float uSwellAmp[DD_SWELL];
  uniform float uSwellSteep[DD_SWELL];
  uniform float uSwellBias[DD_SWELL];
  uniform float uSwellGroup[DD_SWELL];
  uniform float uWaveScale;     // global amplitude multiplier (quality / art dial)
  uniform float uWaveChoppy;    // global Gerstner Q multiplier
  uniform float uWaveSharp;     // cnoidal exponent reached in the surf zone
  uniform float uCrestSkew;     // vertical crest/trough asymmetry in the surf
  uniform float uSurfPunch;     // extra surf-zone amplitude over the open bay
  uniform vec3  uCrestCap;      // depth-limited crest ceiling: base, slope, knee
  uniform vec4  uMeshStep;      // surf row step, mid row step, growth/m, max step
  uniform float uWaveLean;      // forward pitch of the crest face near the break
  uniform float uCrestWob;      // metres of along-shore crest-line bend
  uniform float uGroupFloor;    // amplitude of the smallest set (0..1)
  uniform float uFoldGain;
  uniform float uFoldLead;      // radians the plunge sits shoreward of the crest
  uniform float uTroughFloor;   // soft asymptote below still water (m)
  uniform float uTroughKnee;
  uniform float uBreakDepth;    // depth at which a wave is fully broken
  uniform float uHorizBudget;   // peak horizontal excursion, in mesh rows
  uniform float uBedVary;       // along-shore bed variation, fraction of depth
  uniform vec2  uBreakGamma;    // H/h gate: onset, fully broken
  uniform float uLipThrow;      // lip overhang, in local wave heights

  struct DDWave {
    vec3  offset;
    vec3  normal;
    float steep;
    float crest;
    float fold;
    float shoal;
  };

  /**
   * Mean of ((1 + sin x) / 2)^P over a period — the DC term the cnoidal profile
   * has to subtract so raising P sharpens the crest without lifting the sheet.
   * Exact values are C(2P,P)/4^P; this fit is within 2% over P ∈ [1, 4].
   */
  float ddProfileMean(float P) { return inversesqrt(3.14159265 * P + 0.5); }

  /**
   * Vertical crest skew on the SUMMED elevation. Real surf sits high and short
   * over long shallow troughs, and the trough is the side with a hard budget:
   * only 0.57 m before the table cloth. Raising the per-component cnoidal
   * exponent far enough to buy that headroom flattens the whole mid-wave into
   * glass, so the asymmetry is taken here instead, after the sum, where it only
   * scales the two halves. Uses y/sqrt(y²+w²) rather than tanh — this program
   * compiles as GLSL ES 1.00 and tanh does not exist there.
   */
  float ddCrestSkew(float y, float s, float w, out float dgain) {
    float r = inversesqrt(y * y + w * w);
    float v = y * r;
    dgain = 1.0 + s * v * (2.0 - v * v);
    return y * (1.0 + s * v);
  }

  /**
   * Depth-limited crest ceiling. A wave cannot stand much taller than the water
   * it is standing in; without this, rare alignments of six components throw a
   * two-metre peak into half a metre of swash. Soft, so it shaves the tail
   * rather than clipping a plateau across the top of every crest.
   */
  float ddCrestCeiling(float y, float cap, float knee, out float dgain) {
    float a = (cap - y) / knee;
    if (a > 10.0) { dgain = 1.0; return y; }
    float e = exp(a);
    dgain = e / (1.0 + e);
    return cap - knee * log(1.0 + e);
  }

  /**
   * Soft floor: identity well above -L, asymptotic to -L below it, smooth
   * throughout. dgain is dOut/dIn so the analytic normal stays exact.
   */
  float ddSoftFloor(float y, float L, float knee, out float dgain) {
    float a = (y + L) / knee;
    if (a > 10.0) { dgain = 1.0; return y; }
    float e = exp(a);
    dgain = e / (1.0 + e);
    return knee * log(1.0 + e) - L;
  }

  /**
   * Travelling set envelope. Three slow waves beating against each other, moving
   * shoreward at roughly the group velocity and drifting along the beach, so the
   * surf arrives in trains rather than as one endless conveyor.
   */
  float ddSetEnvelope(float along, float front, float t) {
    float g1 = sin(front * 0.0262 + along * 0.0134 + t * 0.086);
    float g2 = sin(front * 0.0171 - along * 0.0231 + t * 0.0553 + 1.90);
    float g3 = sin(front * 0.0094 + along * 0.0392 + t * 0.0331 + 3.70);
    return clamp(0.5 + 0.5 * (0.46 * g1 + 0.34 * g2 + 0.20 * g3), 0.0, 1.0);
  }

  /**
   * Along-shore crest-line bend, in metres of extra travel. Applied to every
   * component through its own k, so all crests bow together the way a real
   * refracting train does instead of each one wandering off on its own.
   */
  void ddCrestWobble(float along, float t, float amt, out float w, out float dw) {
    float a1 = along * 0.0268 + t * 0.038;
    float a2 = along * 0.0611 - t * 0.027 + 2.10;
    float a3 = along * 0.1180 + t * 0.017 + 4.40;
    w = amt * (0.62 * sin(a1) + 0.27 * sin(a2) + 0.11 * sin(a3));
    dw = amt * (0.016616 * cos(a1) + 0.016497 * cos(a2) + 0.012980 * cos(a3));
  }

  /**
   * Local mesh row spacing — the mirror of buildWaterGeometry's four bands.
   * Every band-limiting decision in this file is measured against it, so it has
   * to track the real geometry rather than a single remembered number.
   */
  float ddRowStep(float front) {
    float base = mix(uMeshStep.x, uMeshStep.y,
      smoothstep(DD_SURF_BAND - 6.0, DD_SURF_BAND + 6.0, front));
    return clamp(base + uMeshStep.z * (front - DD_FINE_BAND), base, uMeshStep.w);
  }

  /**
   * Along-shore bed variation, as a multiplier on the contract's 1-D depth.
   *
   * The contract's bathymetry is a function of front alone, so refraction keyed
   * off it can only ever be a function of distance from the beach: the R01 critic
   * measured crest orientation agreeing to 0.7° across three along-shore samples
   * at equal depth, which is what a 1-D bed gives you by construction. Real
   * shorefaces carry bars and rip channels, and the crest lines bend over them.
   *
   * This is used ONLY inside the phase integral, so it bends the crests without
   * claiming a depth that surface.js's colour ramp does not know about. Periods
   * are 182 / 87 / 49 m along the beach — short enough to vary inside one frame,
   * where the contract's coastline meander (785 / 329 / 152 m) is not.
   */
  float ddBedMod(float along, float f) {
    return 1.0 + uBedVary * (
      0.55 * sin(along * 0.0345 + f * 0.010)
      + 0.30 * sin(along * 0.0718 - f * 0.017 + 2.3)
      + 0.15 * sin(along * 0.1290 + 1.1));
  }

  /** d(ddCoastLine)/d(along) — the crests lean with the meandering waterline. */
  float ddCoastSlope(float along, float t) {
    return 0.016800 * cos(along * 0.0080)
      + 0.021965 * cos(along * 0.0191 + 1.7)
      + 0.021476 * cos(along * 0.0413 + 0.55)
      + 0.006050 * cos(along * 0.0110 - t * 0.14)
      + 0.008992 * cos(along * 0.0281 + t * 0.21 + 1.1);
  }

  /**
   * Gerstner sum in the shore frame.
   * @param p     flat position as (along, seaward) metres
   * @param front signed distance seaward of the waterline
   * @param depth still-water depth at this sample
   */
  DDWave ddWaves(vec2 p, float front, float depth, float t) {
    DDWave o;
    o.offset = vec3(0.0);
    o.normal = vec3(0.0, 1.0, 0.0);
    o.steep = 0.0;
    o.crest = 0.0;
    o.fold = 0.0;
    o.shoal = ddShoalEnv(depth);

    float along = p.x;
    // Amplitude has to be gone by the waterline — nothing lifts over the beach.
    float land = smoothstep(-0.8, 5.5, front);
    if (land <= 0.0) return o;

    float shoal = o.shoal;
    float bd = max(uBreakDepth, 0.2);
    // Energy left in the wave: full offshore, collapsing to a spent bore inshore.
    // The floor is 0.30, not R01's 0.12. A broken wave does not become flat
    // water, it becomes a bore, and at 0.12 the inshore third of the surf zone
    // had no relief left for foam to sit on or for shoaling to be read off.
    float spent = smoothstep(bd * 0.16, bd * 1.35, depth);
    // Crest sharpening follows the shoaling envelope. Even the open bay carries a
    // little Stokes skew; the surf zone goes properly cnoidal.
    float sharpEnv = smoothstep(0.08, 0.86, shoal);
    float P = mix(1.10, uWaveSharp, sharpEnv);
    // Surf-zone envelopes: extra amplitude and extra crest skew as the bed rises.
    float surfEnv = smoothstep(0.12, 0.94, shoal);
    float punch = mix(1.0, uSurfPunch, surfEnv);
    float skewEnv = mix(0.16, 1.0, surfEnv);
    float Pm1 = P - 1.0;
    float pmean = ddProfileMean(P);

    float setEnv = ddSetEnvelope(along, front, t);
    float wob;
    float dwob;
    ddCrestWobble(along, t, uCrestWob * (0.45 + 0.85 * shoal), wob, dwob);
    float coastSlope = ddCoastSlope(along, t);
    float foldC = cos(uFoldLead);
    float foldS = sin(uFoldLead);
    float rowStep = ddRowStep(front);

    // Shared quadrature for the cross-shore phase integral. Nodes are clustered
    // on the shore end (f = front·σ²) because that is where the bed bends.
    float fx = max(front, 0.0);
    float sqNode[DD_PHASE_STEPS];
    float wNode[DD_PHASE_STEPS];
    for (int j = 0; j < DD_PHASE_STEPS; j++) {
      float sg = (float(j) + 0.5) / float(DD_PHASE_STEPS);
      float fj = fx * sg * sg;
      sqNode[j] = sqrt(max(ddDepth(fj) * ddBedMod(along, fj), 0.02));
      wNode[j] = fx * 2.0 * sg / float(DD_PHASE_STEPS);
    }
    float sqLocal = sqrt(max(depth * ddBedMod(along, fx), 0.02));

    // ── Pass 1 ────────────────────────────────────────────────────────────
    // Amplitude, wavenumbers and the two steepness weights, per component. The
    // sums they feed cannot be known inside a single loop, and both the
    // horizontal budget and the breaking criterion need them.
    float aAmp[DD_SWELL];
    float aKloc[DD_SWELL];
    float aKsea[DD_SWELL];
    float aXsea[DD_SWELL];
    float aQ[DD_SWELL];
    float aLean[DD_SWELL];
    float ampSq = 0.0;
    float ampSum = 0.0;
    float hSum = 0.0;

    for (int i = 0; i < DD_SWELL; i++) {
      float len0 = uSwellLen[i];
      float k0 = 6.28318530718 / len0;
      float dx0 = uSwellDir[i].x;
      float dx2 = dx0 * dx0;
      float invHalf = inversesqrt(0.5 * len0);

      // Local shoaling: L/L0 = mix(floor, 1, sqrt(h / (L0/2))).
      float relS = min(sqLocal * invHalf, 1.0);
      float invR = 1.0 / (DD_LEN_FLOOR + (1.0 - DD_LEN_FLOOR) * relS);
      float kLoc = k0 * invR;
      // Snell: the along-shore wavenumber is conserved, so the cross-shore part
      // has to make up the difference. This is what squares the crests to the beach.
      float kSea = -k0 * sqrt(max(invR * invR - dx2, 0.03));

      // Green's law growth, then dissipation once the wave is breaking. Capped
      // so the trough compressor is never the thing holding the surface up.
      float grow = min(pow(max(relS * relS, 0.030), -0.25), 2.10);
      float amp = uSwellAmp[i] * uWaveScale * punch * grow * mix(0.30, 1.0, spent);
      amp *= mix(1.0, shoal, uSwellBias[i]);
      amp *= mix(1.0, mix(uGroupFloor, 1.0, setEnv), uSwellGroup[i]);
      amp *= land;
      // Mesh Nyquist. Three rows per wavelength is above Nyquist and still
      // reconstructs as a staircase beating against the grid. Raised from R01's
      // 3.0-6.0 to 3.4-6.6 — a harder fade was tried at 4.2-7.6 and cost 14 % of
      // the open bay's shore-normal relief for no measurable gain, because an
      // ablation (uWaveScale = 0) showed the far-bay lattice does not come from
      // this file at all.
      amp *= smoothstep(3.4, 6.6, 6.28318530718 / (max(abs(kSea), 1e-3) * rowStep));
      aAmp[i] = amp;
      aKloc[i] = kLoc;
      aKsea[i] = kSea;
      aQ[i] = 0.0;
      aLean[i] = 0.0;
      aXsea[i] = 0.0;
      if (amp < 0.0006) continue;

      // Accumulated cross-shore phase — monotone by construction.
      float xsea = 0.0;
      for (int j = 0; j < DD_PHASE_STEPS; j++) {
        float ij = 1.0 / (DD_LEN_FLOOR + (1.0 - DD_LEN_FLOOR) * min(sqNode[j] * invHalf, 1.0));
        xsea -= wNode[j] * k0 * sqrt(max(ij * ij - dx2, 0.03));
      }
      aXsea[i] = xsea;

      // Gerstner Q, capped short of the loop-forming limit.
      float akl = amp * kLoc;
      float q = min(uSwellSteep[i] * uWaveChoppy, 0.95 / max(akl * 3.2, 0.30));
      // Forward pitch: shift the crest downwave so the shoreward face stands up
      // and the seaward back stretches out. Peaks at the crest, where the
      // Gerstner term is zero, so the two never fight for the same budget.
      float lean = min(uWaveLean * sharpEnv * uSwellSteep[i],
        0.95 / max(akl * P * 0.5, 0.12));
      aQ[i] = q;
      aLean[i] = lean;
      ampSum += amp;
      ampSq += amp * amp;
      // Worst-case horizontal excursion this component can contribute. The pitch
      // term is one-signed, so across components it adds rather than cancelling —
      // which is exactly how R01 reached 3.5 m on a 0.95 m mesh.
      hSum += amp * (q + lean * (1.0 - pmean));
    }

    // ── Shared horizontal budget ──────────────────────────────────────────
    // One scale for every component, so the sheet cannot fold through itself
    // however the phases line up. Soft rather than a min(), because a kink here
    // would print itself on the water as a band.
    float hBudget = uHorizBudget * rowStep;
    float hRel = hSum / max(hBudget, 1e-4);
    float hScale = inversesqrt(1.0 + hRel * hRel);

    // ── Breaking: depth-limited, not depth-keyed ──────────────────────────
    // H/h, the classic criterion, in place of R01's band around a fixed depth.
    // Because H carries the set envelope and the along-shore bed variation, the
    // break line is ragged, moves with the water and comes and goes with the
    // sets — where a depth band is a contour and prints a straight edge.
    float Hloc = 2.7 * sqrt(ampSq);
    float gamma = Hloc / max(depth, 0.12);
    float breaking = smoothstep(uBreakGamma.x, uBreakGamma.y, gamma)
      * smoothstep(bd * 3.6, bd * 1.20, depth);

    // ── Pass 2: phase, profile, displacement, analytic tangents ───────────
    vec3 tA = vec3(1.0, 0.0, 0.0); // d/d(along)
    vec3 tB = vec3(0.0, 0.0, 1.0); // d/d(seaward)
    float ySum = 0.0;
    float crestAcc = 0.0;
    float crestW = 0.0;
    float foldAcc = 0.0;
    // Primary-train phase and direction, kept for the lip.
    float ph0 = 0.0;
    vec2 kv0 = vec2(0.0, -1.0);
    vec2 dh0 = vec2(0.0, -1.0);
    float lipW = 0.5;

    for (int i = 0; i < DD_SWELL; i++) {
      float amp = aAmp[i];
      if (amp < 0.0006) continue;
      float k0 = 6.28318530718 / uSwellLen[i];
      float dx0 = uSwellDir[i].x;
      float kLoc = aKloc[i];
      float kSea = aKsea[i];
      float q = aQ[i] * hScale;
      float lean = aLean[i] * hScale;

      float omega = sqrt(9.81 * k0); // deep-water dispersion: period is conserved
      float ph = k0 * dx0 * along + aXsea[i] + kSea * wob - omega * t;
      float sp = sin(ph);
      float cp = cos(ph);

      // Cnoidal profile: peaked crest, long flat trough. P = 1 is a pure sine.
      float u = 0.5 + 0.5 * sp;
      float uPm1 = pow(max(u, 1e-4), Pm1);
      float uP = uPm1 * u;
      float prof = 2.0 * (uP - pmean);
      float dprof = P * uPm1 * cp;

      // Local wave vector, including the crest bend and the meandering coast.
      vec2 kv = vec2(k0 * dx0 + kSea * (dwob - coastSlope), kSea);
      float kmag = max(length(kv), 1e-4);
      vec2 dh = kv / kmag;

      // Rows of mesh across one cross-shore wavelength. Everything below that is
      // band-limited against reads it: a feature narrower than a couple of rows
      // is not carried by the vertices and cannot survive interpolation.
      float perRow = 6.28318530718 / (max(abs(kSea), 1e-3) * rowStep);

      // Pitch is zero-mean. The DC term R01 carried here translated the whole
      // surf sheet ~1.5 m shoreward of the flat position that every front-keyed
      // gate downstream assumes, and the analytic derivative never included it.
      float H = q * amp * cp + lean * amp * (uP - pmean);
      float dH = -q * amp * sp + lean * amp * P * uPm1 * 0.5 * cp;

      o.offset.x += H * dh.x;
      o.offset.z += H * dh.y;
      ySum += amp * prof;

      tA.x += dH * kv.x * dh.x;
      tA.y += amp * dprof * kv.x;
      tA.z += dH * kv.x * dh.y;
      tB.x += dH * kv.y * dh.x;
      tB.y += amp * dprof * kv.y;
      tB.z += dH * kv.y * dh.y;

      // Crest proximity from the profile, not a phase average — but only as
      // sharp as the mesh can carry. A u⁴ peak spans ~26 % of a period; on the
      // short components that is under two rows, so it renders as flicker rather
      // than as a crest. Both powers are normalised by their own mean so the
      // gate below means the same thing whichever end of the blend is in force.
      float u2 = u * u;
      float meshOK = smoothstep(7.0, 15.0, perRow);
      crestAcc += amp * mix(u2 / 0.375, u2 * u2 / 0.2734, meshOK);
      crestW += amp;

      // Folding = horizontal compression at the lip, led shoreward of the crest.
      // foam.js throws the breaking lip from this, so it has to be a LINE — but a
      // line narrower than the row spacing is not a line, it is scattered flecks.
      // The gate width is therefore set in metres, not in phase: about 1.5 rows,
      // clamped so it never widens into wallpaper. Uses the UNSCALED q, because
      // it reports how hard the water is being compressed, not how far this build
      // is willing to move a vertex.
      float sf = sp * foldC - cp * foldS;
      float wPhase = clamp(1.5 * rowStep * abs(kSea), 0.30, 1.05);
      float kf = 1.3862944 / (wPhase * wPhase);
      foldAcc += aQ[i] * amp * kLoc * uSwellGroup[i] * exp(min(kf * (sf - 1.0), 0.0));

      if (i == 0) {
        ph0 = ph;
        kv0 = kv;
        dh0 = dh;
        lipW = clamp(1.25 * rowStep * abs(kSea), 0.22, 0.95);
      }
    }

    // ── The lip ───────────────────────────────────────────────────────────
    // One narrow, phase-locked throw on the primary train, inside the breaking
    // band. It is deliberately outside the shared budget and bounded separately,
    // because an overturning crest IS a local fold — it has to move about one row
    // forward over about one row of width or it cannot overhang. Confining it to
    // the primary keeps it one line per wave instead of one per component, and
    // confining it to the breaking band keeps the rest of the sheet single-valued.
    float sLip = sin(ph0 - uFoldLead);
    float kLip = 1.3862944 / (lipW * lipW);
    float lipBump = exp(min(kLip * (sLip - 1.0), 0.0));
    float lipPeak = min(uLipThrow * ampSum, 2.20 * rowStep) * breaking;
    float lipAmt = lipPeak * lipBump;
    float dLip = lipPeak * lipBump * kLip * cos(ph0 - uFoldLead);

    o.offset.x += lipAmt * dh0.x;
    o.offset.z += lipAmt * dh0.y;
    // The lip pitches down as it throws, so the crest apex leads and drops.
    ySum -= lipAmt * 0.32;

    tA.x += dLip * kv0.x * dh0.x;
    tA.y -= 0.32 * dLip * kv0.x;
    tA.z += dLip * kv0.x * dh0.y;
    tB.x += dLip * kv0.y * dh0.x;
    tB.y -= 0.32 * dLip * kv0.y;
    tB.z += dLip * kv0.y * dh0.y;

    float skewGain;
    float ySkew = ddCrestSkew(ySum, uCrestSkew * skewEnv, 0.22, skewGain);
    float capGain;
    float yCap = ddCrestCeiling(ySkew, uCrestCap.x + uCrestCap.y * depth, uCrestCap.z, capGain);
    float floorGain;
    o.offset.y = ddSoftFloor(yCap, uTroughFloor, uTroughKnee, floorGain);
    float dgain = skewGain * capGain * floorGain;
    tA.y *= dgain;
    tB.y *= dgain;

    vec3 n = normalize(cross(tB, tA));
    // Under the lip the sheet is genuinely overturned and the geometric normal
    // points down. Flipping it outright shades the underside as if it were the
    // top; leaving it down sends Fresnel to 1 and paints sky on it. Laying it
    // over to near-horizontal keeps the fold's own facing, which is the honest
    // read of a vertical wall of water, and keeps every downstream dot(N, up)
    // inside the range the other modules were written against.
    if (n.y < 0.06) n = normalize(vec3(n.x, 0.06, n.z));
    o.normal = n;

    float slope = length(n.xz) / max(n.y, 0.08);
    o.steep = smoothstep(0.070, 0.42, slope);
    o.crest = smoothstep(0.88, 2.49, crestAcc / max(crestW, 1e-4));
    o.fold = clamp(foldAcc * uFoldGain, 0.0, 1.0) * breaking;
    return o;
  }

  #endif
`;

/**
 * @param {string} quality
 * @returns {Record<string, { value: unknown }>}
 */
export function wavesUniforms(quality = 'high') {
  const dirs = SWELL.map((s) => {
    const [x, y] = s.dir;
    const l = Math.hypot(x, y) || 1;
    return new THREE.Vector2(x / l, y / l);
  });
  const low = quality === 'low';
  const medium = quality === 'medium';
  const grading = meshGrading(quality);
  return {
    uSwellDir: { value: dirs },
    uSwellLen: { value: SWELL.map((s) => s.len) },
    uSwellAmp: { value: SWELL.map((s) => s.amp) },
    uSwellSteep: { value: SWELL.map((s) => s.steep) },
    uSwellBias: { value: SWELL.map((s) => s.shoreBias) },
    uSwellGroup: { value: SWELL.map((s) => s.group) },
    uWaveScale: { value: low ? 0.80 : medium ? 0.93 : 1.0 },
    uWaveChoppy: { value: 1.35 },
    uWaveSharp: { value: 2.8 },
    uCrestSkew: { value: CREST_SKEW },
    uSurfPunch: { value: SURF_PUNCH },
    uCrestCap: { value: new THREE.Vector3(...CREST_CAP) },
    uMeshStep: {
      value: new THREE.Vector4(
        grading.surfStep, grading.midStep, grading.growth - 1, grading.maxStep,
      ),
    },
    // 1.55, not R01's 3.30. The absolute value matters much less now that the
    // budget below governs the sum, but a pitch weight this far above the
    // Gerstner Q spends the whole budget on one-signed displacement and leaves
    // the orbital motion nothing.
    uWaveLean: { value: 1.55 },
    uCrestWob: { value: 4.2 },
    uGroupFloor: { value: 0.42 },
    uFoldGain: { value: 5.6 },
    uFoldLead: { value: 0.45 },
    uTroughFloor: { value: TROUGH_FLOOR },
    uTroughKnee: { value: TROUGH_KNEE },
    uBreakDepth: { value: BATHY.breakDepth },
    uHorizBudget: { value: HORIZ_BUDGET },
    uBedVary: { value: low ? 0.0 : BED_VARY },
    // H/h onset and fully-broken. Textbook depth-limited breaking sits near 0.78
    // for a solitary wave; these are lower because H here is a spectral RMS
    // height, not a single wave's crest-to-trough.
    uBreakGamma: { value: new THREE.Vector2(0.34, 0.72) },
    uLipThrow: { value: low ? 0.0 : 1.60 },
  };
}

/**
 * ── DO NOT FLOAT ANYTHING ON THIS. IT MIRRORS A SHADER THAT IS NOT COMPILED. ──
 *
 * It is a faithful CPU mirror of `WAVES_GLSL` / `ddWaves`, and `WAVES_GLSL` has
 * no live consumer: the only modules that import it are the two `_stash/`
 * rollback copies of `water.js`. The sheet the board actually draws is
 * `outer-ocean.js: OCEAN_VERT`, whose `ddBaySwell` runs a different spectrum —
 * 3 components at 72/32/14 m summing to 2.380 m against this file's 7 at
 * 41…5.4 m summing to 0.624 m — over a different bathymetry (`oceanDepthAt`,
 * not contract `BATHY`).
 *
 * Measured at the Apostles boat stations over a 24 s sweep, this function and
 * the drawn surface differ by **0.13x in the shallows to 1.91x offshore**, and
 * they are **uncorrelated in phase** (r = −0.04 at zero lag, best r = 0.15 at
 * any lag). The mean ratio is 0.98x, which is the trap: it looks calibrated and
 * is an artefact of averaging a gain that is not constant. No single gain and no
 * single phase offset can reconcile the two. Receipts:
 * `mvp/_reviews/board-aaa/probe-wave-parity.mjs`.
 *
 * To float something on the sea the camera sees, use
 * `outer-ocean.js: oceanSurfaceYAt(x, z, t, city)` — the drawn stack, the drawn
 * depth, and the sheltered-harbour envelope, sampled at a world point.
 *
 * Kept, not deleted, because `fringe/apostles.js` imports it today and this
 * seat does not edit that file. It is correct for what it mirrors; it simply
 * mirrors something the board stopped drawing.
 *
 * Original contract, still accurate for `WAVES_GLSL`: mirrors ddWaves' spectrum,
 * shoaling, set envelope, cnoidal profile and soft floor; amplitude-only (no
 * Gerstner horizontal term) because callers want "height at this XZ".
 *
 * @param {number} along
 * @param {number} seaward shore distance from the seawall face
 * @param {number} front distance seaward of the waterline
 * @param {number} t
 * @param {number} scale
 */
export function sampleWaveHeight(along, seaward, front, t, scale = 1) {
  const land = smoothstep01(-0.8, 5.5, front);
  if (land <= 0) return 0;
  const depth = depthAt(front);
  const shoal = 1 - smoothstep01(0.6, 5.2, depth);
  const bd = BATHY.breakDepth;
  const spent = smoothstep01(bd * 0.16, bd * 1.35, depth);
  const sharpEnv = smoothstep01(0.08, 0.86, shoal);
  const P = lerp(1.10, 2.8, sharpEnv);
  const surfEnv = smoothstep01(0.12, 0.94, shoal);
  const punch = lerp(1, SURF_PUNCH, surfEnv);
  const skewEnv = lerp(0.16, 1, surfEnv);
  const pmean = 1 / Math.sqrt(Math.PI * P + 0.5);
  const setEnv = setEnvelope(along, front, t);
  const wob = crestWobble(along, t, 4.2 * (0.45 + 0.85 * shoal));
  const fx = Math.max(front, 0);
  const sqNode = [];
  const wNode = [];
  for (let j = 0; j < PHASE_STEPS; j += 1) {
    const sg = (j + 0.5) / PHASE_STEPS;
    const fj = fx * sg * sg;
    sqNode.push(Math.sqrt(Math.max(depthAt(fj) * bedMod(along, fj), 0.02)));
    wNode.push((fx * 2 * sg) / PHASE_STEPS);
  }
  const sqLocal = Math.sqrt(Math.max(depth * bedMod(along, fx), 0.02));
  const rowStep = rowStepAt(front);

  let y = 0;
  let ampSq = 0;
  let ampSum = 0;
  let ph0 = 0;
  let kSea0 = 0.4;
  for (const s of SWELL) {
    const k0 = (2 * Math.PI) / s.len;
    const [dx0raw, dy0raw] = s.dir;
    const norm = Math.hypot(dx0raw, dy0raw) || 1;
    const dx0 = dx0raw / norm;
    const dx2 = dx0 * dx0;
    const invHalf = 1 / Math.sqrt(0.5 * s.len);
    const relS = Math.min(sqLocal * invHalf, 1);
    const invR = 1 / (LEN_FLOOR + (1 - LEN_FLOOR) * relS);
    const kSea = -k0 * Math.sqrt(Math.max(invR * invR - dx2, 0.03));
    const grow = Math.min(Math.max(relS * relS, 0.03) ** -0.25, 2.10);
    let amp = s.amp * scale * punch * grow * lerp(0.30, 1, spent);
    amp *= lerp(1, shoal, s.shoreBias);
    amp *= lerp(1, lerp(0.42, 1, setEnv), s.group);
    amp *= land;
    amp *= smoothstep01(3.4, 6.6, (2 * Math.PI) / (Math.max(Math.abs(kSea), 1e-3) * rowStep));
    if (amp < 0.0006) continue;
    let xsea = 0;
    for (let j = 0; j < PHASE_STEPS; j += 1) {
      const ij = 1 / (LEN_FLOOR + (1 - LEN_FLOOR) * Math.min(sqNode[j] * invHalf, 1));
      xsea -= wNode[j] * k0 * Math.sqrt(Math.max(ij * ij - dx2, 0.03));
    }
    const omega = Math.sqrt(9.81 * k0);
    const ph = k0 * dx0 * along + xsea + kSea * wob - omega * t;
    const u = 0.5 + 0.5 * Math.sin(ph);
    y += amp * 2 * (Math.max(u, 1e-4) ** P - pmean);
    ampSum += amp;
    ampSq += amp * amp;
    if (s === SWELL[0]) { ph0 = ph; kSea0 = kSea; }
  }
  // Lip: the vertical half of it, so anything floating on the water dips with
  // the throw instead of riding through it.
  const gamma = (2.7 * Math.sqrt(ampSq)) / Math.max(depth, 0.12);
  const breaking = smoothstep01(0.34, 0.72, gamma)
    * smoothstep01(bd * 3.6, bd * 1.20, depth);
  const lipW = Math.min(Math.max(1.25 * rowStep * Math.abs(kSea0), 0.22), 0.95);
  const lipBump = Math.exp(Math.min((1.3862944 / (lipW * lipW)) * (Math.sin(ph0 - 0.45) - 1), 0));
  y -= Math.min(1.60 * ampSum, 2.20 * rowStep) * breaking * lipBump * 0.32;
  const v = y / Math.sqrt(y * y + 0.22 * 0.22);
  const skewed = y * (1 + CREST_SKEW * skewEnv * v);
  const cap = CREST_CAP[0] + CREST_CAP[1] * depth;
  const capped = crestCeiling(skewed, cap, CREST_CAP[2]);
  return softFloor(capped, TROUGH_FLOOR, TROUGH_KNEE);
}

function setEnvelope(along, front, t) {
  const g1 = Math.sin(front * 0.0262 + along * 0.0134 + t * 0.086);
  const g2 = Math.sin(front * 0.0171 - along * 0.0231 + t * 0.0553 + 1.9);
  const g3 = Math.sin(front * 0.0094 + along * 0.0392 + t * 0.0331 + 3.7);
  return clamp01(0.5 + 0.5 * (0.46 * g1 + 0.34 * g2 + 0.20 * g3));
}

function crestWobble(along, t, amt) {
  return amt * (
    0.62 * Math.sin(along * 0.0268 + t * 0.038)
    + 0.27 * Math.sin(along * 0.0611 - t * 0.027 + 2.1)
    + 0.11 * Math.sin(along * 0.1180 + t * 0.017 + 4.4)
  );
}

/** JS mirror of ddBedMod. */
function bedMod(along, f) {
  return 1 + BED_VARY * (
    0.55 * Math.sin(along * 0.0345 + f * 0.010)
    + 0.30 * Math.sin(along * 0.0718 - f * 0.017 + 2.3)
    + 0.15 * Math.sin(along * 0.1290 + 1.1)
  );
}

/** JS mirror of ddRowStep. */
function rowStepAt(front) {
  const g = meshGrading('high');
  const base = lerp(g.surfStep, g.midStep, smoothstep01(SURF_BAND - 6, SURF_BAND + 6, front));
  return Math.min(Math.max(base + (g.growth - 1) * (front - FINE_BAND), base), g.maxStep);
}

function crestCeiling(y, cap, knee) {
  const a = (cap - y) / knee;
  if (a > 10) return y;
  return cap - knee * Math.log(1 + Math.exp(a));
}

function softFloor(y, L, knee) {
  const a = (y + L) / knee;
  if (a > 10) return y;
  return knee * Math.log(1 + Math.exp(a)) - L;
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep01(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0 || 1e-6));
  return t * t * (3 - 2 * t);
}

const wavesModule = {
  buildWaterGeometry, WAVES_GLSL, wavesUniforms, sampleWaveHeight, SWELL,
};
export default wavesModule;
