// @ts-check
/**
 * water/surf.js (W14): the ONE wave clock and the shoaling table.
 *
 * Lane W14-A copies this file to mvp/src/render/water/surf.js as its first edit and owns it.
 * Lane W14-B imports `SURF`, `surfShoreClockAt`, `surfShoreClockGlsl`, `surfEnvelopeAt` and
 * `surfEnvelopeGlsl` and nothing else. Those five names never change meaning.
 *
 * Phase of swell train i at a point (shore frame: `along`, `front` metres seaward of the
 * waterline as the ocean shader already has them; S = true shore distance in metres):
 *
 *     phi_i = omega_i * t + k_i * (D.x * along + D.y * (front + 0.35 * wob(along))) + E_i(S)
 *
 * The crest is at sin(phi) = 1. The time term is POSITIVE, so a crest moves toward smaller
 * `front`: onshore. E_i(S) is the extra phase a train gains by slowing over the bay's bed law
 * h(S) = 9 (S / 120)^0.7 (Eckart dispersion, along-shore wavenumber conserved, so crests turn
 * parallel to the shore as they come in). E is 0 at the waterline and levels off offshore.
 * Revised after the challenge: the table bed follows the beach shelf lane B draws (1 in 15 to
 * 1.3 m, meeting the bay law between 14 and 34 m), and the table gives PHASE and GAIN only.
 * The breaking cap is the caller's and uses the real bed: amp <= 0.39 * min(table h, uBedDepth).
 * No three.js import: node tests and both shader stages read the same Float32Array.
 */
import { WATER_LAW } from './law.js';
import { ddValueNoise } from './contract.js';

const G = 9.81;
const TAU = Math.PI * 2;

const TRAINS = WATER_LAW.waves.ocean.swell.map((s) => {
  const heading = ((WATER_LAW.waves.prevailingDeg + s.headingDeg) * Math.PI) / 180;
  const k = TAU / s.len;
  return Object.freeze({ len: s.len, amp: s.amp, k, omega: Math.sqrt(G * k), dx: Math.sin(heading), dy: Math.cos(heading) });
});

export const SURF = Object.freeze({
  trains: Object.freeze(TRAINS),
  /** Seconds between crests of the carrier (train 0, 24 m): the swash period. */
  period: TAU / TRAINS[0].omega,
  lutSize: 256,
  /** The table spans 0..frontMax metres of shore distance on u = sqrt(S / frontMax). */
  frontMax: 224,
  bed: Object.freeze({ max: 9, ramp: 120, power: 0.7, floor: 0.45, shelfSlope: 0.066, shelfCap: 1.3, shelfFull: 14, shelfGone: 34 }),
  /** Shoaling gain is Green's law from refDepth, capped. Breaking is the caller's: amp <= 0.39 h. */
  refDepth: 5.4,
  gainCap: 1.6,
  breakGamma: 0.78,
  wobK: 0.35,
  /**
   * Height the port basin sheet is DRAWN at today (the vertex clip the wave keeps inside the
   * basin, so no port static moves). Lane B's hull waterline band keys to it.
   */
  basinSheetY: 0.002,
});

const smooth01 = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** The drawn beach shelf (lane B): metres of water at S metres seaward of the still waterline. */
export function surfShelfDepthAt(S) {
  const b = SURF.bed;
  return Math.min(b.shelfSlope * Math.max(0, S), b.shelfCap);
}

/**
 * Bed depth the table assumes at shore distance S (metres): the shelf inside 14 m, the bay law
 * beyond 34 m, the same blend `physicalSeabedDepthAt` uses between. Floored at 0.45 m so the
 * carrier never shortens below about 8 m (the mesh could not carry it) and celerity never reaches 0.
 */
export function surfDepthAt(S) {
  const b = SURF.bed;
  const s = Math.max(0, S);
  const bay = b.max * (s / b.ramp) ** b.power;
  const shelf = surfShelfDepthAt(s);
  return Math.max(b.floor, shelf + (bay - shelf) * smooth01(b.shelfFull, b.shelfGone, s));
}

/** Eckart's explicit dispersion: wavenumber of a wave of angular frequency omega in depth h. */
export function surfWavenumber(omega, h) {
  const k0 = (omega * omega) / G;
  return k0 / Math.sqrt(Math.tanh(k0 * Math.max(h, 1e-3)));
}

const uOf = (S) => Math.sqrt(Math.min(1, Math.max(0, S / SURF.frontMax)));
const sOf = (u) => SURF.frontMax * u * u;

/**
 * Two rows of RGBA float, `lutSize` wide.
 * Row 0: R, G, B = E_0, E_1, E_2 (radians), A = seconds for the carrier to run from S to the shore.
 * Row 1: R = shoaling gain (1..gainCap), G = carrier wavelength at S (metres),
 *        B = carrier celerity over its deep-water celerity (0..1), A = table depth h(S) (metres).
 */
export function bakeSurfLut() {
  const n = SURF.lutSize;
  const data = new Float32Array(n * 2 * 4);
  const acc = [0, 0, 0];
  let tau = 0;
  let prevS = 0;
  const steps = 24;
  for (let i = 0; i < n; i += 1) {
    const S = sOf(i / (n - 1));
    for (let j = 0; j < steps; j += 1) {
      const s = prevS + ((j + 0.5) / steps) * (S - prevS);
      const ds = (S - prevS) / steps;
      const h = surfDepthAt(s);
      for (let t = 0; t < 3; t += 1) {
        const tr = TRAINS[t];
        const k = surfWavenumber(tr.omega, h);
        const ka = tr.k * tr.dx;
        const kf = Math.sqrt(Math.max(k * k - ka * ka, 0.04 * k * k));
        acc[t] += (kf - tr.k * tr.dy) * ds;
      }
      tau += (surfWavenumber(TRAINS[0].omega, h) / TRAINS[0].omega) * ds;
    }
    prevS = S;
    const h = surfDepthAt(S);
    const k0 = surfWavenumber(TRAINS[0].omega, h);
    const o = i * 4;
    data[o] = acc[0]; data[o + 1] = acc[1]; data[o + 2] = acc[2]; data[o + 3] = tau;
    const p = (n + i) * 4;
    data[p] = Math.min(SURF.gainCap, Math.max(1, (SURF.refDepth / h) ** 0.25));
    data[p + 1] = TAU / k0;
    data[p + 2] = Math.min(1, TRAINS[0].k / k0);
    data[p + 3] = h;
  }
  return { data, width: n, height: 2 };
}

let cached = null;
/** CPU twin of the two texture fetches: linear in u, exactly as a LinearFilter sampler reads it. */
export function surfLutAt(S, lut = (cached ??= bakeSurfLut())) {
  const n = lut.width;
  const x = uOf(S) * (n - 1);
  const i = Math.min(n - 2, Math.floor(x));
  const f = x - i;
  const at = (row, c) => {
    const a = lut.data[(row * n + i) * 4 + c];
    return a + (lut.data[(row * n + i + 1) * 4 + c] - a) * f;
  };
  return { e: [at(0, 0), at(0, 1), at(0, 2)], tau: at(0, 3), gain: at(1, 0), len: at(1, 1), slow: at(1, 2), depth: at(1, 3) };
}

/** The along-shore bend both stages already use, so macro crests are not a comb. */
export const surfWob = (along) => Math.sin(along * 0.019 + 0.6) * 4.2 + Math.sin(along * 0.047 + 1.9) * 1.8;

/** Phase (radians) of train i. `S` defaults to `front` (true on the straight east beach). */
export function surfPhaseAt(i, along, front, t, S = front, lut = undefined) {
  const tr = TRAINS[i];
  return tr.omega * t + tr.k * (tr.dx * along + tr.dy * (front + SURF.wobK * surfWob(along))) + surfLutAt(Math.max(0, S), lut).e[i];
}

/**
 * The swash clock: carrier cycles at the waterline (front 0, S 0). A crest lands on the sand
 * each time this passes n + 0.25 (sin(phi) = 1). Uniform-free on purpose (see foam.js rule).
 */
export function surfShoreClockAt(along, t) {
  return surfPhaseAt(0, along, 0, t, 0) / TAU;
}

const ENV = WATER_LAW.waves.envelope;

/**
 * The swell group envelope, ONE expression for the sea (lane A) and the swash reach (lane B).
 * Two octaves of value noise drifting ONSHORE at `WATER_LAW.waves.envelope.drift` m/s (the sign is
 * fixed here; the speed is read from the law at import, so nobody hard-codes it). 0.45 to 1.0
 * before `gain` (the rain factor, `uSea.y` in the ocean; lane B passes nothing).
 */
export function surfEnvelopeAt(along, front, t, gain = 1) {
  const py = front + t * ENV.drift;
  const n = ENV.weights[0] * ddValueNoise(along / ENV.octaves[0] + 3.1, py / ENV.octaves[0] + 7.7)
    + ENV.weights[1] * ddValueNoise(along / ENV.octaves[1] + 11.3, py / ENV.octaves[1] + 1.9);
  return (ENV.min + (ENV.max - ENV.min) * smooth01(0.20, 0.80, n)) * gain;
}

/** GLSL twin. Needs `ddValueNoise(vec2)` declared before it (the contract chunk); no uniforms. */
export function surfEnvelopeGlsl() {
  return /* glsl */ `
    #ifndef DD_SURF_ENVELOPE
    #define DD_SURF_ENVELOPE
    float ddSurfEnvelope(float along, float front, float t) {
      vec2 p = vec2(along, front + t * ${ENV.drift.toFixed(2)});
      float n = ${ENV.weights[0].toFixed(2)} * ddValueNoise(p / ${ENV.octaves[0].toFixed(1)} + vec2(3.1, 7.7))
        + ${ENV.weights[1].toFixed(2)} * ddValueNoise(p / ${ENV.octaves[1].toFixed(1)} + vec2(11.3, 1.9));
      return mix(${ENV.min.toFixed(2)}, ${ENV.max.toFixed(2)}, smoothstep(0.20, 0.80, n));
    }
    #endif
  `;
}

/**
 * taste-r1 (W15-A1): per-train wander and group amplitude in the open sea. One shared envelope kept the three trains perfectly
 * locked, so their crests beat into a regular pattern with a five-bin spectrum. Each train now has its own slow phase wander
 * (`rad` radians of value noise at `scale` metres, up to about a third of the train's wavenumber in gradient: crests curve and
 * part without tearing into cells) and its own group amplitude (0.2 to 1.0 on `envScale` metres, drifting onshore with the
 * groups). Both fade in with distance from the shore, 0 inside 120 m and full from 240 m, the same window the sea's front bend
 * uses, so the shoaling table, the breaker lines (inside 34 m), the swash and the port basin never see them.
 */
export const SURF_OPEN = Object.freeze({
  from: 120,
  to: 240,
  // taste-r1 (W16-A): wander 1.6 / 1.9 / 2.2 and 1.5 / 1.7 / 1.9 rad -> 2.6 / 3.0 / 3.4 and 2.4 / 2.7 / 3.0 (undo: the old values). Within an 80 m window a train
  // held one wavelength to within a few percent (five-bin share 36 to 62 against 12, one heading); the stronger wander lets each train's spacing drift by
  // 15 to 30% across the bay without tearing its crests (the phase stays a smooth noise).
  rad: Object.freeze([2.6, 3.0, 3.4]),
  rad2: Object.freeze([2.4, 2.7, 3.0]),
  scale2: 28,
  scale: Object.freeze([95, 70, 55]),
  /**
   * taste-r1 (W15 fix): each crest is finite. The group amplitude of a train is read in the train's own frame: `crestScale` metres along
   * its crests (60 to 150 m) and `travelScale` metres along its travel direction (100 to 250 m), moving at the train's group speed
   * (half its phase speed), so a crest starts, swells and dies over a few hundred metres instead of running across the frame.
   */
  crestScale: Object.freeze([120, 90, 70]),
  travelScale: Object.freeze([230, 170, 130]),
  /** Second octave of the group noise at 0.4 of both scales, weight 0.3: crests end raggedly, not on one smooth curve. */
  fineShare: 0.3,
  fineScale: 0.4,
  /**
   * taste-r1 (W16-A): the group noise is thresholded between `envLo` and `envHi` (smoothstep, was 0.30 and 0.70 hard-coded) and floored at `envMin` (was 0.30):
   * a third to a half of the sea sits near the floor between sets, so the sets read as sets. Undo: envMin 0.30, envLo 0.30, envHi 0.70.
   */
  envMin: 0.15,
  envLo: 0.35,
  envHi: 0.70,
});

/**
 * taste-r1 (W26-A): SWELL_WANDER. At station 21 (240 m) the dark cells of the open sea are drawn by the SHADE term (zeroing it takes the five-bin share from 49-57% to 15% and the
 * luminance SD from 4.3 to 2.0; flattening the normal, switching the sets and lulls off or the phase wander off leaves it at 56-57%): the three trains' slopes cross on a diamond grid
 * because the 14 m train's slope (0.027) is 72% of the carrier's (0.038) and the 31 m train's 39%. With the switch on: (1) each train's phase is bent by one more, slow noise field
 * (`slowRad` radians at `slowM` metres: 200, 125 and 100 m; the carrier's reaches a whole wavelength, 2 pi, so its crests bend and part, the other two a third to a half of theirs) and the 95 and 28 m wander keeps `midKeep` and `fastKeep` of its radians, so crests
 * drift and part over hundreds of metres and the crossings stop repeating (the phase is one expression for the vertex and fragment stages and the CPU twin, so displacement and shade stay
 * in step); (2) each train's group envelope is cut into runs (`crestScale` 110, 80 and 60 m along the crest, `travelScale` 45 m for the carrier, a wavelength and a half, so neighbouring bands are cut at different places, with soft ends and a floor `envMin` of 0.45); (3) the SHADE (not the height, not the normal) weighs the trains `shadeW`
 * (aqua.js, sea.js `ddSeaSwellShade`): the carrier keeps the lead (0.65 of its slope against 0.6 and 0.4 of the others', about a third and two fifths of the carrier's drawn slope), the lull lift weighs the trains 0.5, 0.3 and 0.2 (`groupK`, read in aqua.js), no boost. Browser: `?swellWander=0`; node: `DD_SWELL_WANDER=0`.
 * 0 restores the shader text of wave twenty-five exactly.
 */
export const SWELL_WANDER = (typeof process !== 'undefined' && process?.env?.DD_SWELL_WANDER !== undefined)
  ? Number(process.env.DD_SWELL_WANDER) > 0 ? 1 : 0
  : (typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('swellWander') === '0' ? 0 : 1);
export const SWELL_WANDER_TUNE = Object.freeze({
  midKeep: 1.0,
  fastKeep: 0.45,
  slowRad: Object.freeze([6.28, 3.0, 2.6]),
  slowM: Object.freeze([200, 125, 100]),
  crestScale: Object.freeze([110, 80, 60]),
  travelScale: Object.freeze([45, 130, 100]),
  envLo: 0.33,
  envHi: 0.59,
  envMin: 0.45,
  /** Shade weight of each train (slope x weight: 0.025, 0.009, 0.011) and the weights of the lull lift (aqua.js groupK). */
  shadeW: Object.freeze([0.65, 0.6, 0.4]),
  groupK: Object.freeze([0.5, 0.3, 0.2]),
  shadeBoost: 1.0,
});
/**
 * taste-r1 (W27): SWELL_FAR_MIX. At station 10 (430 m from its target) the far half of the open sea (beyond about 280 m from the camera) read as evenly spaced parallel ribs, the carrier's bands
 * standing alone in a row. Tried first and rejected by the frame: blending the shade weights (0.65, 0.6, 0.4) back to the per-train weights of wave twenty-five (1, 1, 1) left the ribs and brought
 * a cross-hatch back. Kept: the shared weights stay, and between `fromM` and `toM` of camera distance the SHADE (never the height or the normal) breaks the ribs, both grown with distance:
 * (1) each train's phase takes one more noise (`phRad` radians at `phM` m) so the spacing between bands is uneven, and (2) a set-and-lull envelope per train (`lullM` m along the crest, `lullTravelM` m
 * along travel, floor `lullMin`, edges `lullLo` to `lullHi` of the noise) runs the bands in groups with calm gaps. Browser: `?swellFarMix=0`; node: `DD_SWELL_FAR_MIX=0`. 0 restores the shader text of wave twenty-six exactly.
 */
export const SWELL_FAR_MIX = SWELL_WANDER > 0 ? ((typeof process !== 'undefined' && process?.env?.DD_SWELL_FAR_MIX !== undefined)
  ? Number(process.env.DD_SWELL_FAR_MIX) > 0 ? 1 : 0
  : (typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('swellFarMix') === '0' ? 0 : 1)) : 0;
export const SWELL_FAR_MIX_TUNE = Object.freeze({
  fromM: 280,
  toM: 450,
  phRad: Object.freeze([2.4, 1.6, 1.2]),
  phM: Object.freeze([55, 45, 40]),
  lullM: Object.freeze([90, 70, 60]),
  lullTravelM: Object.freeze([60, 90, 70]),
  lullMin: 0.12,
  lullLo: 0.36,
  lullHi: 0.62,
});
/**
 * taste-r1 (W28): SWELL_FAR_TUNE. After wave twenty-seven a few faint, evenly spaced ribs still stood in the farthest water at station 10 (the upper left quarter of the open sea, beyond about 450 m of camera distance).
 * Shade only again (the height and the normal are not touched). Between `fromM` and `toM` of camera distance (farK2, 0 to 1) the carrier and the other two trains take one more phase noise at a shorter scale
 * (`phRad` radians at `phM` m), the lull floor falls from `lullMin` of SWELL_FAR_MIX_TUNE to `lullMin` here, its edges rise to `lullLo` and `lullHi` and its cells shrink to `lullScale` (more and shorter calm gaps), and the far shade (aqua.js SEA_FAR_SHADE) keeps `keepMul` of its value there, so a rib that is left
 * is a group with calm gaps and not a row. Browser: `?swellFarTune=0`; node: `DD_SWELL_FAR_TUNE=0`. 0 restores the shader text of wave twenty-seven exactly.
 */
export const SWELL_FAR_TUNE = SWELL_FAR_MIX > 0 ? ((typeof process !== 'undefined' && process?.env?.DD_SWELL_FAR_TUNE !== undefined)
  ? Number(process.env.DD_SWELL_FAR_TUNE) > 0 ? 1 : 0
  : (typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('swellFarTune') === '0' ? 0 : 1)) : 0;
export const SWELL_FAR_TUNE_P = Object.freeze({
  fromM: 430,
  toM: 485,
  phRad: Object.freeze([3.0, 2.2, 1.6]),
  phM: Object.freeze([40, 34, 30]),
  lullMin: 0.0,
  lullLo: 0.44,
  lullHi: 0.66,
  lullScale: 0.7,
  keepMul: 0.8,
});
/**
 * taste-r1 (W29): SWELL_FAR_BREAK. After wave twenty-eight the far water at station 10 (upper left quarter, 430 to 525 m from the camera) still carried faint, evenly spaced ribs: the carrier's bands
 * keep one wavelength across every calm patch (each train's lull cell is its own, the phase noise is smooth, so the projected band profile still repeats), and a lull of one train is
 * filled by the others'. Shade only again, on the farK2 ramp of SWELL_FAR_TUNE_P (so nothing nearer than 430 m moves): (1) the three trains share the carrier's lull (`lullShare` of the way to the carrier's own noise),
 * so a calm gap is calm for the whole shade; (2) each lull cell (cells `lullScale` of the wave-twenty-seven cell, in the carrier's group frame, its grid bent by a slow noise of `warp`) takes its own phase offset (`groupPh` radians per train,
 * one constant per cell, so fronts stay straight and parallel inside a group), and every train's lull falls to 0 over `seamW` of a cell at each cell edge, so the calm gap hides the step; a smooth offset bent the fronts into curled wisps.
 * The lull edges `lullLo` and `lullHi` are wave twenty-eight's. Browser: `?swellFarBreak=0`; node: `DD_SWELL_FAR_BREAK=0`.
 * 0 restores the shader text of wave twenty-eight exactly.
 */
export const SWELL_FAR_BREAK = SWELL_FAR_TUNE > 0 ? ((typeof process !== 'undefined' && process?.env?.DD_SWELL_FAR_BREAK !== undefined)
  ? Number(process.env.DD_SWELL_FAR_BREAK) > 0 ? 1 : 0
  : (typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('swellFarBreak') === '0' ? 0 : 1)) : 0;
const FB_DEFAULT = Object.freeze({
  lullShare: 0.7,
  lullScale: 0.7,
  lullLo: 0.44,
  lullHi: 0.66,
  groupPh: [5.0, 5.0, 5.0],
  seamW: 0.18,
  warp: 0.7,
});
export const SWELL_FAR_BREAK_P = Object.freeze({ ...FB_DEFAULT, groupPh: Object.freeze(FB_DEFAULT.groupPh) });
const q2 = (v) => Number(v.toFixed(2));
const WT = SWELL_WANDER_TUNE;
/** The wander and crest numbers the twins read: the wave-sixteen ones with the switch off, the wave-twenty-six ones with it on. */
const PH_RAD = SWELL_WANDER > 0 ? SURF_OPEN.rad.map((v) => q2(v * WT.midKeep)) : SURF_OPEN.rad;
const PH_RAD2 = SWELL_WANDER > 0 ? SURF_OPEN.rad2.map((v) => q2(v * WT.fastKeep)) : SURF_OPEN.rad2;
const CREST_M = SWELL_WANDER > 0 ? WT.crestScale : SURF_OPEN.crestScale;
const TRAVEL_M = SWELL_WANDER > 0 ? WT.travelScale : SURF_OPEN.travelScale;
const ENV_LO = SWELL_WANDER > 0 ? WT.envLo : SURF_OPEN.envLo;
const ENV_HI = SWELL_WANDER > 0 ? WT.envHi : SURF_OPEN.envHi;
const ENV_MIN = SWELL_WANDER > 0 ? WT.envMin : SURF_OPEN.envMin;
/** The slow field: noise at `slowM[i]` metres, +-`slowRad[i]` radians; 0 with the switch off. */
const slowPhase = (i, along, front) => (SWELL_WANDER > 0
  ? WT.slowRad[i] * (2 * ddValueNoise(along / WT.slowM[i] + 7.9 * i + 3.3, front / WT.slowM[i] + 2.7 * i + 11.1) - 1)
  : 0);

/** Group speed (m/s) of train i: half its deep-water phase speed. */
const groupSpeed = (tr) => 0.5 * tr.omega / tr.k;

/** CPU twin of `ddSurfTrains`: per-train phase offsets (radians) and amplitude factors (envMin to 1) at a shore-frame point. */
export function surfTrainTermsAt(along, front, t) {
  const o = smooth01(SURF_OPEN.from, SURF_OPEN.to, Number(front) || 0);
  const ph = [0, 0, 0];
  const en = [1, 1, 1];
  if (o <= 0) return { ph, en, open: 0 };
  for (let i = 0; i < 3; i += 1) {
    const tr = TRAINS[i];
    ph[i] = o * (PH_RAD[i] * (2 * ddValueNoise(along / SURF_OPEN.scale[i] + 3.7 * i + 1.3, front / SURF_OPEN.scale[i] + 5.1 * i + 8.9) - 1)
      + PH_RAD2[i] * (2 * ddValueNoise(along / SURF_OPEN.scale2 + 6.3 * i + 2.1, front / SURF_OPEN.scale2 + 4.4 * i + 7.7) - 1)
      + slowPhase(i, along, front));
    const across = -tr.dy * along + tr.dx * front;
    const travel = tr.dx * along + tr.dy * front + t * groupSpeed(tr);
    const fs = SURF_OPEN.fineShare; const fk = SURF_OPEN.fineScale;
    const n = (1 - fs) * ddValueNoise(across / CREST_M[i] + 9.1 * i + 4.2, travel / TRAVEL_M[i] + 2.6 * i + 6.4)
      + fs * ddValueNoise(across / (CREST_M[i] * fk) + 3.3 * i + 12.9, travel / (TRAVEL_M[i] * fk) + 7.7 * i + 1.1);
    en[i] = 1 + (ENV_MIN + (1 - ENV_MIN) * smooth01(ENV_LO, ENV_HI, n) - 1) * o;
  }
  return { ph, en, open: o };
}

/** GLSL twin. Needs `ddValueNoise(vec2)` declared before it; no uniforms. `ph` is added to each train's phase, `en` multiplies its amplitude. */
export function surfTrainsGlsl() {
  const f = (v) => v.toFixed(2);
  const R = PH_RAD; const S = SURF_OPEN.scale; const C = CREST_M; const V = TRAVEL_M;
  const phTerm = (i) => `${f(R[i])} * (2.0 * ddValueNoise(vec2(along / ${f(S[i])} + ${f(3.7 * i + 1.3)}, front / ${f(S[i])} + ${f(5.1 * i + 8.9)})) - 1.0) + ${f(PH_RAD2[i])} * (2.0 * ddValueNoise(vec2(along / ${f(SURF_OPEN.scale2)} + ${f(6.3 * i + 2.1)}, front / ${f(SURF_OPEN.scale2)} + ${f(4.4 * i + 7.7)})) - 1.0)${SWELL_WANDER > 0 ? ` + ${f(WT.slowRad[i])} * (2.0 * ddValueNoise(vec2(along / ${f(WT.slowM[i])} + ${f(7.9 * i + 3.3)}, front / ${f(WT.slowM[i])} + ${f(2.7 * i + 11.1)})) - 1.0)` : ''}`;
  const enTerm = (i) => {
    const tr = TRAINS[i];
    const across = `(${(-tr.dy).toFixed(6)} * along + ${tr.dx.toFixed(6)} * front)`;
    const travel = `(${tr.dx.toFixed(6)} * along + ${tr.dy.toFixed(6)} * front + t * ${groupSpeed(tr).toFixed(4)})`;
    const fs = SURF_OPEN.fineShare; const fk = SURF_OPEN.fineScale;
    return `${f(ENV_MIN)} + ${f(1 - ENV_MIN)} * smoothstep(${f(ENV_LO)}, ${f(ENV_HI)}, ${f(1 - fs)} * ddValueNoise(vec2(${across} / ${f(C[i])} + ${f(9.1 * i + 4.2)}, ${travel} / ${f(V[i])} + ${f(2.6 * i + 6.4)})) + ${f(fs)} * ddValueNoise(vec2(${across} / ${f(C[i] * fk)} + ${f(3.3 * i + 12.9)}, ${travel} / ${f(V[i] * fk)} + ${f(7.7 * i + 1.1)})))`;
  };
  return /* glsl */ `
    #ifndef DD_SURF_TRAINS
    #define DD_SURF_TRAINS
    void ddSurfTrains(float along, float front, float t, out vec3 ph, out vec3 en) {
      float o = smoothstep(${f(SURF_OPEN.from)}, ${f(SURF_OPEN.to)}, front);
      ph = vec3(0.0);
      en = vec3(1.0);
      if (o <= 0.0) return;
      ph = o * vec3(${phTerm(0)}, ${phTerm(1)}, ${phTerm(2)});
      en = mix(vec3(1.0), vec3(${enTerm(0)}, ${enTerm(1)}, ${enTerm(2)}), o);
    }
    #endif
  `;
}

/** GLSL twin of `surfShoreClockAt`, constants baked as literals. Needs nothing declared. */
export function surfShoreClockGlsl() {
  const tr = TRAINS[0];
  return /* glsl */ `
    #ifndef DD_SURF_CLOCK
    #define DD_SURF_CLOCK
    #define DD_SURF_T ${SURF.period.toFixed(5)}
    float ddSurfWob(float along) { return sin(along * 0.019 + 0.6) * 4.2 + sin(along * 0.047 + 1.9) * 1.8; }
    float ddSurfShoreClock(float along, float t) {
      return (${tr.omega.toFixed(6)} * t + ${tr.k.toFixed(6)} * (${tr.dx.toFixed(6)} * along + ${(tr.dy * SURF.wobK).toFixed(6)} * ddSurfWob(along))) / 6.28318530718;
    }
    #endif
  `;
}

/**
 * GLSL for the ocean stages. Needs `uniform sampler2D uSurfLut` bound to the bake above
 * (RGBA, THREE.FloatType because the bake is a Float32Array, exactly as uBedDepth is mounted;
 * LinearFilter, ClampToEdge, no mips, 256 x 2). HalfFloatType would need a Uint16Array.
 * ddSurfE(S).rgb = E_0..2, .a = seconds to shore. ddSurfK(S) = (gain, carrier length, slow, depth).
 */
export function surfLutGlsl() {
  return /* glsl */ `
    #ifndef DD_SURF_LUT
    #define DD_SURF_LUT
    uniform sampler2D uSurfLut;
    float ddSurfU(float S) { return sqrt(clamp(S / ${SURF.frontMax.toFixed(1)}, 0.0, 1.0)) * ${((SURF.lutSize - 1) / SURF.lutSize).toFixed(6)} + ${(0.5 / SURF.lutSize).toFixed(6)}; }
    vec4 ddSurfE(float S) { return texture2D(uSurfLut, vec2(ddSurfU(S), 0.25)); }
    vec4 ddSurfK(float S) { return texture2D(uSurfLut, vec2(ddSurfU(S), 0.75)); }
    #endif
  `;
}

export default { SURF, SURF_OPEN, SWELL_WANDER, SWELL_WANDER_TUNE, SWELL_FAR_MIX, SWELL_FAR_MIX_TUNE, SWELL_FAR_TUNE, SWELL_FAR_TUNE_P, SWELL_FAR_BREAK, SWELL_FAR_BREAK_P, surfTrainTermsAt, surfTrainsGlsl, bakeSurfLut, surfLutAt, surfPhaseAt, surfShoreClockAt, surfShoreClockGlsl, surfEnvelopeAt, surfEnvelopeGlsl, surfLutGlsl, surfDepthAt, surfShelfDepthAt, surfWavenumber, surfWob };
