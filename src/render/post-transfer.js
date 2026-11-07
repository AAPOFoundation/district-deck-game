// Measurement twins of the shipped and grade-3 board transfers. No game imports.
// Exposure, AgX and the run's solar LUT (default gradeSplit), followed by each
// variant's near-field display tail, with atmosphere on. Vignette, grain, bloom,
// haze and rain stay out: they are not functions of one scene-linear value.

import {
  BASE_EXPOSURE, ENVIRONMENT_EXPOSURE_COMPENSATION, GRADE_TRANSFER, GRADE_3, bakeGradeLut, parsePlayExposureMul,
} from './post.js';
import { parseLightGain, solarProfile } from './lighting.js';
import { P23_LIGHT_PHOTO, R9_ATMOS } from './v4-p1-polish.js';

const AGX_IN = [
  [0.8566271533, 0.0951212405, 0.0482516061],
  [0.1373189729, 0.7612419906, 0.1014390365],
  [0.1118982130, 0.0767994186, 0.8113023684],
];
const AGX_OUT = [
  [1.1271005818, -0.1106066431, -0.0164939387],
  [-0.1413297635, 1.1578237022, -0.0164939387],
  [-0.1413297635, -0.1106066431, 1.2519364066],
];
const AGX_MIN_EV = -12.47393;
const AGX_MAX_EV = 4.026069;

const mul3 = (m, v) => [0, 1, 2].map((i) => m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2]);
const agxContrast = (x) => {
  const x2 = x * x;
  const x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
};

function agx(rgb) {
  let colour = mul3(AGX_IN, rgb.map((v) => Math.max(0, v)));
  colour = colour.map((v) => Math.min(AGX_MAX_EV, Math.max(AGX_MIN_EV, Math.log2(Math.max(v, 1e-10)))));
  colour = colour.map((v) => (v - AGX_MIN_EV) / (AGX_MAX_EV - AGX_MIN_EV));
  colour = colour.map(agxContrast);
  return mul3(AGX_OUT, colour).map((v) => Math.min(1, Math.max(0, v)));
}

let baked = null;
function solarLut(timeOfDay) {
  const time = Number.isFinite(timeOfDay) ? timeOfDay : 0.5;
  if (baked?.time === time) return baked;
  const texture = bakeGradeLut(solarProfile(time).grade);
  // Only the most recent CPU bake is retained; no renderer or GPU texture is needed.
  baked = { data: texture.image.data, size: texture.image.width, time };
  texture.dispose();
  return baked;
}

function sampleLut(rgb, timeOfDay) {
  const { data, size } = solarLut(timeOfDay);
  const scale = (size - 1) / size;
  const offset = 1 / (2 * size);
  const f = rgb.map((v) => {
    const coord = Math.min(1, Math.max(0, v)) * scale + offset;
    return Math.min(size - 1, Math.max(0, coord * size - 0.5));
  });
  const i0 = f.map((v) => Math.floor(v));
  const i1 = i0.map((v) => Math.min(size - 1, v + 1));
  const t = f.map((v, channel) => v - i0[channel]);
  const texel = (x, y, z, channel) => data[((z * size + y) * size + x) * 4 + channel] / 255;
  return [0, 1, 2].map((channel) => {
    let acc = 0;
    for (let dz = 0; dz < 2; dz += 1) {
      for (let dy = 0; dy < 2; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          const weight = (dx ? t[0] : 1 - t[0]) * (dy ? t[1] : 1 - t[1]) * (dz ? t[2] : 1 - t[2]);
          acc += weight * texel(dx ? i1[0] : i0[0], dy ? i1[1] : i0[1], dz ? i1[2] : i0[2], channel);
        }
      }
    }
    return acc;
  });
}

const lumaOf = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

function srgbEncode(c) {
  const clamped = Math.min(1, Math.max(0, c));
  return clamped < 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** 0.41666 - 0.055;
}

function gradeShoulder(display) {
  const gMax = Math.max(display[0], display[1], display[2]);
  const start = GRADE_TRANSFER.shoulder.start;
  const range = GRADE_TRANSFER.shoulder.range;
  const shoulderEx = Math.max(gMax - start, 0);
  const rolled = Math.min(gMax, start) + range * (1 - Math.exp(-shoulderEx / range));
  const scale = rolled / Math.max(gMax, 0.00001);
  return display.map((v) => v * scale);
}

function toneCurve(display) {
  const luma = lumaOf(display);
  const input = P23_LIGHT_PHOTO.toneInput;
  const output = P23_LIGHT_PHOTO.toneOutput;
  let toneValue = output[0];
  for (let i = 0; i < input.length - 1; i += 1) {
    const span = input[i + 1] - input[i];
    const t = span === 0 ? 0 : Math.min(1, Math.max(0, (luma * 255 - input[i]) / span));
    toneValue += (output[i + 1] - output[i]) * t;
  }
  const scale = (toneValue / 255) / Math.max(luma, 0.00001);
  let toned = display.map((v) => v * scale);
  const tonedLuma = lumaOf(toned);
  const sat = P23_LIGHT_PHOTO.toneSaturation;
  toned = toned.map((v) => tonedLuma + (v - tonedLuma) * sat);
  if (toned[1] > toned[0] && toned[1] > toned[2]) {
    const greenSat = (toned[1] - Math.min(toned[0], toned[2])) / Math.max(toned[1], 0.00001);
    const greenMin = toned[1] * (1 - P23_LIGHT_PHOTO.toneGreenSaturationMax);
    if (greenSat > P23_LIGHT_PHOTO.toneGreenSaturationMax) toned = toned.map((v) => Math.max(v, greenMin));
  }
  toned = toned.map((v) => Math.max(0, v));
  const hi = Math.max(toned[0], toned[1], toned[2], 0.00001);
  toned = toned.map((v) => v * Math.min(1, P23_LIGHT_PHOTO.toneHighlightMax / hi));
  return toned;
}

/** uExposure the board bakes at this time of day, including a lightGain exposure and ?exposure=. */
export function boardExposure(search = '', timeOfDay = 0.5) {
  const time = Number.isFinite(timeOfDay) ? timeOfDay : 0.5;
  const gradeExposure = solarProfile(time).grade.exposure;
  const gain = parseLightGain(search ?? '');
  const gainE = !gain ? 1 : Number.isFinite(gain.exposure) ? gain.exposure : Number.isFinite(gain.e) ? gain.e : 1;
  return BASE_EXPOSURE * gradeExposure * gainE * parsePlayExposureMul(search ?? '') * ENVIRONMENT_EXPOSURE_COMPENSATION;
}

/** Display V (0–100) of one scene-linear grey through the shipped transfer. */
export function postTransfer(linear, { exposure, timeOfDay = 0.5 } = {}) {
  const scale = Number.isFinite(exposure) ? exposure : boardExposure('', timeOfDay);
  const value = Number.isFinite(linear) ? linear : 0;
  let colour = agx([value * scale, value * scale, value * scale]);
  colour = sampleLut(colour, timeOfDay);
  const lift = 1 + (R9_ATMOS.nearContrast - 1) * (lumaOf(colour) - 0.38);
  colour = colour.map((v) => v * lift);
  colour = colour.map((v) => {
    const excess = Math.max(v - R9_ATMOS.shoulderStart, 0);
    return v - excess * excess / (excess + R9_ATMOS.shoulderRange);
  });
  const display = toneCurve(gradeShoulder(colour.map(srgbEncode)));
  return Math.max(display[0], display[1], display[2]) * 100;
}

/** Grade 3 display-block stages, exposed for CPU measurement checks (RGB in 0–1). */
export function grade3DisplayStages(colour, overrides = GRADE_3) {
  const encoded = colour.map(v => srgbEncode(Math.max(0, v) ** 2.2));
  const gMax = Math.max(...encoded);
  const { start, range } = overrides.shoulder;
  const rolled = Math.min(gMax, start) + range * (1 - Math.exp(-Math.max(gMax - start, 0) / range));
  const shoulder = encoded.map(v => v * rolled / Math.max(gMax, 0.00001));
  const grey = lumaOf(shoulder);
  const saturated = shoulder.map(v => Math.max(0, grey + (v - grey) * overrides.saturation));
  let greenLimited = saturated.slice();
  if (saturated[1] > saturated[0] && saturated[1] > saturated[2]) {
    const greenSat = (saturated[1] - Math.min(saturated[0], saturated[2])) / Math.max(saturated[1], 0.00001);
    const greenMax = Number(P23_LIGHT_PHOTO.toneGreenSaturationMax.toFixed(2));
    if (greenSat > greenMax) greenLimited = saturated.map(v => Math.max(v, saturated[1] * (1 - greenMax)));
  }
  const hiMax = Math.max(...greenLimited);
  const hiSat = (hiMax - Math.min(...greenLimited)) / Math.max(hiMax, 0.00001);
  const t = Math.min(1, Math.max(0, (hiSat - 0.07) / (0.14 - 0.07)));
  const hiCap = overrides.neutralCap + (overrides.cap - overrides.neutralCap) * t * t * (3 - 2 * t);
  const display = greenLimited.map(v => v * Math.min(1, hiCap / Math.max(hiMax, 0.00001)));
  return { encoded, shoulder, saturated, greenLimited, display };
}

/** Display V (0–100) of scene-linear grey through grade 3, near-field atmosphere on.
 * The material albedo gain, sky gain and hemisphere multiplier belong to the caller.
 * Keeps the R9 near contrast/saturation; drops its shoulder and the shipped display tail.
 */
export function postTransferGrade3(linear, { exposure, overrides = GRADE_3, timeOfDay = 0.5 } = {}) {
  const scale = (Number.isFinite(exposure) ? exposure : boardExposure('', timeOfDay)) * overrides.exposure;
  const value = Number.isFinite(linear) ? linear : 0;
  let colour = sampleLut(agx([value * scale, value * scale, value * scale]), timeOfDay);
  const lift = 1 + (R9_ATMOS.nearContrast - 1) * (lumaOf(colour) - 0.38);
  colour = colour.map(v => v * lift);
  const grey = lumaOf(colour);
  colour = colour.map(v => grey + (v - grey) * Number(R9_ATMOS.nearSaturation.toFixed(1)));
  return Math.max(...grade3DisplayStages(colour, overrides).display) * 100;
}

/** Sample V on an inclusive 0.002–4 log2 grid; remaining options go to the transfer. */
export function transferTable(fn, { pointsPerStop = 32, ...opts } = {}) {
  if (!Number.isFinite(pointsPerStop) || pointsPerStop < 8) throw new RangeError('pointsPerStop must be at least 8');
  const min = 0.002, max = 4;
  const stops = Math.log2(max / min), intervals = Math.ceil(stops * pointsPerStop);
  return Array.from({ length: intervals + 1 }, (_, i) => {
    const linear = i === intervals ? max : min * 2 ** (stops * i / intervals);
    return { linear, V: fn(linear, opts) };
  });
}

/** Secant dV/stop, located at each log interval's midpoint (V linearly interpolated).
 * The highlight plateau starts at the first interval AFTER the peak with slope < 2;
 * a low-slope dark toe is not a plateau. Null means none occurs within the table.
 */
export function peakSlope(table) {
  if (!Array.isArray(table) || table.length < 2) throw new RangeError('peakSlope needs at least two samples');
  const slopes = [];
  for (let i = 0; i < table.length; i++) {
    const row = table[i], prev = table[i - 1];
    if (!(row.linear > 0) || !Number.isFinite(row.linear) || !Number.isFinite(row.V)
      || (prev && row.linear <= prev.linear)) throw new RangeError('peakSlope needs finite, increasing positive samples');
    if (prev) slopes.push({ linear: Math.sqrt(prev.linear * row.linear), V: (prev.V + row.V) / 2,
      slope: (row.V - prev.V) / Math.log2(row.linear / prev.linear) });
  }
  let peak = 0;
  for (let i = 1; i < slopes.length; i++) if (slopes[i].slope > slopes[peak].slope) peak = i;
  const plateau = slopes.slice(peak + 1).find(row => row.slope < 2);
  return { ...slopes[peak], plateauOnset: plateau ? { linear: plateau.linear, V: plateau.V } : null };
}
