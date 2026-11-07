// District Deck: the swash on the coast spine (taste-r1 wave 78, shore rebuild phase 2b lane 3). Read only with `COAST_SPINE` on (`?coastSpine=1`); with it
// off nothing here is called, and the shader text, the cache keys and every CPU position are today's.
//
// The old shelf front carried two moving sines (`ddCoastLine` in contract.js, `coastLineAt` in interact.js): t x 0.14 and t x 0.21, together +-0.87 m. They moved
// the sand's edge. With the switch on the sand's front is d and stands still, so that motion goes where decision 5 of SHORE-PLAN puts it: into the swash. The
// tongues' still line (their start, front 0) is d's zero and the tongue's start moves by the drift, over a shore that does not:
//
//     swash front = front - w * drift(along, t)     (the old front was still - drift)
//
// `w` is the beach weight the sand's front is mixed by (`ddWrapFront`: `legacy + (spine - legacy) * w`). Where w is under 1 the front already carries the old
// front's own drift, by (1 - w), so the swash adds only the w share: the front's drift and the swash's make one whole drift there, as today's (fix 1, W78).
//
// `?coastSpineSwashDrift=` / `DD_COAST_SPINE_SWASH_DRIFT` is the owner's paired-sheet knob: 1 (the default) puts the drift in the swash, 0 leaves it out
// (the tongues start on d's zero and stay on it). The GLSL and the CPU function below are one expression, and `tests/_coast-spine-glsl-swash-probe.mjs`
// holds them equal on the GPU. The sand's `ddSwashWet`, `ddSwashSurface`, run-up envelope and sheen read the weighted swash front (`ddSpineSwashFront(.., w)`); the taps read `spineTapFront`.

import { COAST_SPINE, activeCoastSpine, coastSpineFront, sampleCoastW } from '../coast-spine.js';
import { WATER_FACE } from './contract.js';

const ENV = (typeof process !== 'undefined' && process?.env) ? process.env : {};
const QS = (typeof location !== 'undefined' && location?.search) ? new URLSearchParams(location.search) : null;

/** The two moving sines of the old front, [frequency, time rate, phase, amplitude]; the sums `ddCoastLine` and `coastLineAt` add to the static meander. */
export const SWASH_DRIFT_SINES = Object.freeze([
  Object.freeze({ freq: 0.0110, rate: -0.14, phase: 0, amp: 0.55 }),
  Object.freeze({ freq: 0.0281, rate: 0.21, phase: 1.1, amp: 0.32 }),
]);

export const SWASH_SPINE = Object.freeze({
  /** 1: the drift is in the swash; 0: left out. Anything else in [0, 1] is a fraction (the paired sheet uses 0 and 1). */
  drift: (() => {
    const v = ENV.DD_COAST_SPINE_SWASH_DRIFT !== undefined ? Number(ENV.DD_COAST_SPINE_SWASH_DRIFT)
      : (QS && QS.get('coastSpineSwashDrift') !== null ? Number(QS.get('coastSpineSwashDrift')) : 1);
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 1;
  })(),
});

/** Metres the old front's moving terms add to the waterline at `along` and time `t`, times `knob`. */
export function spineSwashDriftAt(along, t, knob = SWASH_SPINE.drift) {
  let m = 0;
  for (const s of SWASH_DRIFT_SINES) m += Math.sin(along * s.freq + t * s.rate + s.phase) * s.amp;
  return knob * m;
}

/** The beach weight the sand's front is mixed by, at a world point: `sampleCoastW` clamped to [0, 1] (the twin of `ddSpineSwashWeight`). */
export function spineSwashWeightAt(x, z, field = activeCoastSpine()) {
  if (!field) return 0;
  const w = sampleCoastW(field, x, z);
  return w <= 0 ? 0 : w >= 1 ? 1 : w;
}

/** The front the swash functions read: `front` (the sand's front, already `legacy + (spine - legacy) * w`) less the drift's w share. */
export function spineSwashFront(front, along, t, w = 1, knob = SWASH_SPINE.drift) {
  return front - w * spineSwashDriftAt(along, t, knob);
}

/** The GLSL of the two functions above, the knob fixed in the text (`COAST_SPINE` on only; it is never added to a shader otherwise). */
export function swashSpineGlsl(knob = SWASH_SPINE.drift) {
  const f = (v) => Number(v).toFixed(4);
  const [a, b] = SWASH_DRIFT_SINES;
  return /* glsl */ `
  float ddSpineSwashDrift(float along, float t) {
    return ${f(knob)} * (sin(along * ${f(a.freq)} + t * ${f(a.rate)}) * ${f(a.amp)} + sin(along * ${f(b.freq)} + t * ${f(b.rate)} + ${f(b.phase)}) * ${f(b.amp)});
  }
  float ddSpineSwashWeight(vec2 xz) { return clamp(ddCoastSpineD(uCoastSpineW, uCoastSpineRect, xz), 0.0, 1.0); }
  float ddSpineSwashFront(float front, float along, float t, float w) { return front - w * ddSpineSwashDrift(along, t); }
`;
}

/**
 * What the low-quality foam layer (`FOAM_LAYER_FRAG`, outer-ocean.js) needs before `COAST_SPINE_GLSL` and `COAST_WATER_FRONT_GLSL` can stand in it: that
 * stage has the bay frame (`uBayOrigin`, `uBayNormal`: the wall's origin and the seaward normal, which are the water frame's `uShoreOrigin` and `uShoreNormal`)
 * but not `SHORE_COMMON_GLSL`, so the two names are macros on them and `ddCoastLine` is the old meander at the shore frame's `uWaterFace`, the same sum as the
 * contract's (only the t = 0 call, the cap circle's, is made).
 */
export const FOAM_SPINE_PRELUDE_GLSL = /* glsl */ `
  #define uShoreOrigin uBayOrigin
  #define uShoreNormal uBayNormal
  float ddCoastLine(float along, float t) {
    float m = sin(along * 0.0080) * 2.10
            + sin(along * 0.0191 + 1.7) * 1.15
            + sin(along * 0.0413 + 0.55) * 0.52;
    m += sin(along * 0.0110 - t * 0.14) * 0.55
       + sin(along * 0.0281 + t * 0.21 + 1.1) * 0.32;
    return ${WATER_FACE.toFixed(4)} + m;
  }
`;

/**
 * The tap's front (`hit.front`, the stored `tap.front`): inside the beach weight the spine's front through the CPU sampler, outside it `oldFront` (the
 * caller's `shore - coastLineAt(along, t)`). The same arithmetic as the shelf's `beachSection`, with the t = 0 meander for the board-end cap circle.
 */
export function spineTapFront(x, z, oldFront, field = activeCoastSpine(), coastLine = null) {
  if (!field || !COAST_SPINE.on) return oldFront;
  const line = coastLine ?? ((along) => meanderT0(along));
  return coastSpineFront(x, z, field, line, oldFront);
}

/** `coastLineAt(along, 0)` (interact.js) without importing it: the old meander at t = 0. */
function meanderT0(along) {
  return WATER_FACE
    + Math.sin(along * 0.0080) * 2.10
    + Math.sin(along * 0.0191 + 1.7) * 1.15
    + Math.sin(along * 0.0413 + 0.55) * 0.52
    + Math.sin(along * 0.0110) * 0.55
    + Math.sin(along * 0.0281 + 1.1) * 0.32;
}

export default SWASH_SPINE;
