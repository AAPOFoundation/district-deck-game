import { ddHash21 } from './contract.js';
import { WATER_LAW } from './law.js';

const CHOP = WATER_LAW.waves.ocean.chop;
const PREVAILING = WATER_LAW.waves.prevailingDeg;

/**
 * Shading-only slope. Not a sea spectrum.
 * WATER LAW NOTE: the fragment shader's chop is now four crossing sinusoidal
 * wavelets around one 3 m wavelength (`ddWaterSlopeCalm`), because a value-noise
 * lattice shows square cells under a tight specular lobe. `waterSlopeField`
 * below stays as the noise-gradient slope-variance budget model the footprint
 * tests pin; it is no longer a sample-for-sample mirror of the shader.
 * The model it keeps: rotated value-noise gradients. A pixel footprint in metres resolves
 * each wavelength continuously; the dropped fraction is slope-energy carried
 * into roughness, not a camera-distance fade.
 * longKeep scales only the Gerstner horizontal when detail weight is positive.
 */
export const WATER_SLOPE = Object.freeze({
  // The 24 m swell lives in the vertex Gerstner and keeps most of its normal.
  longKeep: 0.8,
  // Presets scale amplitude only (round-one gate, ruling 1): a sheltered basin keeps both
  // chop wavelengths and runs their slope at this fraction of the open-water value.
  basinScale: 1,
  basinAmp: 0.5,
  // Slope amplitude of one chop wavelet as a fraction of amp / metres.
  waveletSlope: 0.38,
  resolveLo: 0.18,
  resolveHi: 0.55,
  glintBase: 0.46,
  glintCeil: 0.78,
  pmremBase: 0.72,
  pmremCeil: 0.92,
  // The water law keeps two octaves in total (TASTE-BIBLE section 6): the
  // swell is the vertex Gerstner and this single 3 m chop is the second. The
  // amplitude gives a slope of 0.04 m over 3 m once the noise gradient (rms
  // 0.545) is applied. The old 11 / 4.6 / 1.9 m trio was the soft blurred
  // ripple relief the owner called unrealistic.
  octaves: Object.freeze([
    Object.freeze({ metres: 3, amp: 0.33, turn: 0.55 }),
  ]),
});

/**
 * E[gx²+gy²] for independent Uniform[0,1] noise corners.
 * E[du²]=6/5 and E[(1-u)²+u²]=26/35, so each axis is (6/5)*(1/6)*(26/35)=26/175.
 * The live hash is only approximately uniform; this is that corner model.
 */
export const NOISE_SLOPE_VARIANCE = 52 / 175;

function smooth01(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Analytic gradient of `ddValueNoise`, in noise-space units. */
export function valueNoiseGrad(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const dux = 6 * fx * (1 - fx);
  const duy = 6 * fy * (1 - fy);
  const a = ddHash21(ix, iy);
  const b = ddHash21(ix + 1, iy);
  const c = ddHash21(ix, iy + 1);
  const d = ddHash21(ix + 1, iy + 1);
  const ab = a + (b - a) * ux;
  const cd = c + (d - c) * ux;
  const gx = dux * ((b - a) * (1 - uy) + (d - c) * uy);
  const gy = (cd - ab) * duy;
  return [Number.isFinite(gx) ? gx : 0, Number.isFinite(gy) ? gy : 0];
}

/** 1 when the wavelength is large versus the pixel, 0 when it is unresolved. */
export function slopeResolve(metres, footprint) {
  const foot = Math.max(0, Number(footprint) || 0);
  return 1 - smooth01(metres * WATER_SLOPE.resolveLo, metres * WATER_SLOPE.resolveHi, foot);
}

function rotate(x, z, turn) {
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  return [c * x - s * z, s * x + c * z];
}

/** (amp/metres)² times the corner-model gradient variance. Not a sea spectrum. */
export function octaveSlopeBudget(amp, metres) {
  const scale = amp / metres;
  return scale * scale * NOISE_SLOPE_VARIANCE;
}

/** keep² of the budget stays in the normal; the rest is unresolved. Sum is the budget. */
export function splitSlopeVariance(budget, keep) {
  const k = Math.min(1, Math.max(0, Number(keep) || 0));
  const resolved = budget * k * k;
  return { resolved, unresolved: budget - resolved };
}

export function weightedSlopeVariance(unresolved, weight) {
  const w = Math.max(0, Number(weight) || 0);
  return Math.max(0, Number(unresolved) || 0) * w * w;
}

/** α = sqrt(α0² + σ²), clamped. σ² is mean-square slope, the small-angle Beckmann proxy. */
export function roughnessFromSlopeVariance(baseline, sigma2, ceil) {
  const extra = Math.max(0, Number(sigma2) || 0);
  return Math.min(ceil, Math.sqrt(baseline * baseline + extra));
}

/**
 * @returns {{ slope: [number, number], resolved: number, unresolved: number }}
 * resolved + unresolved is the slope-variance budget before chop weight.
 */
export function waterSlopeField(p, t, footprint) {
  const time = Number.isFinite(Number(t)) ? Number(t) : 0;
  let sx = 0;
  let sz = 0;
  let resolved = 0;
  let unresolved = 0;
  for (let i = 0; i < WATER_SLOPE.octaves.length; i += 1) {
    const octave = WATER_SLOPE.octaves[i];
    const keep = slopeResolve(octave.metres, footprint);
    const budget = octaveSlopeBudget(octave.amp, octave.metres);
    const split = splitSlopeVariance(budget, keep);
    resolved += split.resolved;
    unresolved += split.unresolved;
    const drifted = rotate(p[0] + time * 0.35, p[1] - time * 0.22, octave.turn);
    const grad = valueNoiseGrad(drifted[0] / octave.metres, drifted[1] / octave.metres);
    const back = rotate(grad[0], grad[1], -octave.turn);
    const scale = octave.amp / octave.metres;
    sx += back[0] * scale * keep;
    sz += back[1] * scale * keep;
  }
  return { slope: [sx, sz], resolved, unresolved };
}

export function waterSlopeGlsl() {
  const line = (octave) => `vec3(${octave.metres.toFixed(1)}, ${octave.amp.toFixed(2)}, ${octave.turn.toFixed(2)})`;
  return `
    vec2 ddValueNoiseGrad(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      vec2 du = 6.0 * f * (1.0 - f);
      float a = ddHash21(i);
      float b = ddHash21(i + vec2(1.0, 0.0));
      float c = ddHash21(i + vec2(0.0, 1.0));
      float d = ddHash21(i + vec2(1.0, 1.0));
      float ab = mix(a, b, u.x);
      float cd = mix(c, d, u.x);
      float gx = du.x * mix(b - a, d - c, u.y);
      float gy = (cd - ab) * du.y;
      return vec2(gx, gy);
    }
    float ddSlopeResolve(float metres, float footprint) {
      return 1.0 - smoothstep(metres * ${WATER_SLOPE.resolveLo.toFixed(2)}, metres * ${WATER_SLOPE.resolveHi.toFixed(2)}, max(footprint, 0.0));
    }
    // Seaward unit vector (x, z) of the shore frame; the fragment stage sets it before the chop call.
    vec2 ddChopSea = vec2(0.0, 1.0);
    // calm 0 is the open-water preset; calm 1 is the sheltered basin. Presets scale amplitude
    // only (water law): the basin runs the same two components at ${WATER_SLOPE.basinAmp.toFixed(2)} of their slope.
    vec3 ddWaterSlopeCalm(vec2 p, float t, float footprint, float calm) {
      // Chop is two components, ${CHOP[0].len.toFixed(1)} m and ${CHOP[1].len.toFixed(1)} m, at +35 and -35 degrees off the swell,
      // each at its deep-water speed. Two crossing sinusoids carry no noise lattice, which
      // would show square cells under a tight specular lobe. It feeds the specular normal only.
      vec2 slope = vec2(0.0);
      float unresolved = 0.0;
      float ampScale = mix(1.0, ${WATER_SLOPE.basinAmp.toFixed(2)}, clamp(calm, 0.0, 1.0));
      vec2 sAlong = vec2(ddChopSea.y, -ddChopSea.x);
      for (int i = 0; i < 2; i++) {
        float lam = i == 0 ? ${CHOP[0].len.toFixed(2)} : ${CHOP[1].len.toFixed(2)};
        float heading = radians(${PREVAILING.toFixed(1)} + (i == 0 ? ${CHOP[0].headingDeg.toFixed(1)} : ${CHOP[1].headingDeg.toFixed(1)}));
        // Slope amplitude of one component is amp x 2 pi / lambda.
        float sw = (i == 0 ? ${CHOP[0].amp.toFixed(3)} : ${CHOP[1].amp.toFixed(3)}) * 6.28318530718 / lam * ampScale;
        vec2 d = sAlong * sin(heading) + ddChopSea * cos(heading);
        float k = 6.28318530718 / lam;
        float c = sqrt(9.81 / k);
        float keep = ddSlopeResolve(lam, footprint);
        unresolved += 0.5 * sw * sw * (1.0 - keep * keep);
        // taste-r1 (W14-A D1): + c * t, so the chop travels onshore with the swell and the swash.
        float ph = k * (dot(d, p) + c * t) + float(i) * 1.9;
        slope += d * (sw * cos(ph) * keep);
      }
      return vec3(slope, unresolved);
    }
    vec3 ddWaterSlope(vec2 p, float t, float footprint) {
      return ddWaterSlopeCalm(p, t, footprint, 0.0);
    }
  `;
}
