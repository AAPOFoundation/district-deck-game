// District Deck — foam, shore break and swash. W-R50 shore-whitecap pass.
// Rollback: ./_stash/W-R49/   Owner seat: FOAM. Contract: ./contract.js.
//
// Responsibility
//   • crest foam driven by wave physics (steepness + fold), not by a distance band
//   • the breaking lip: where the wave trips it throws over and the crest goes white
//   • whitewater bore running shoreward off the break, decaying as it goes
//   • swash / backwash on the sand, and the residual lace it leaves behind
//   • `ddSwashWet` — the wetness field the BEACH SAND also samples, so the dark
//     wet band and the water edge are the same event seen twice
//
// ─────────────────────────────────────────────────────────────────────────────
// HOW THIS WORKS — the wave clock
// ─────────────────────────────────────────────────────────────────────────────
// Everything hangs off one scalar. In shallow water a wave travels at
// c = sqrt(g·h); with the contract's ramp bathymetry h ∝ x^0.78 that integrates
// to a closed-form travel time τ(front) — the seconds a shore-bound wave still
// needs to reach the waterline. Then
//
//     clock = (t + τ(front)) / T + alongPhase(along)
//
// is constant along a crest and advances one whole number per wave. So
//
//     floor(clock)  = WHICH wave this is (a stable identity to hash against)
//     fract(clock)·T = seconds since that wave's front passed this exact sample
//
// That gives four things the previous pass could not have:
//
//   1. Travel. Any pattern keyed to `clock` is locked to its wave and marches
//      shoreward with it, accelerating and stretching exactly as the wave does.
//   2. A leading edge. fract(clock) = 0 is the bore front — the brightest,
//      hardest foam in the picture. Everything behind it is age, and age decays.
//   3. Discrete events. Hashing the wave identity against along-shore position
//      decides which stretches of THIS wave break and which do not. Long
//      stretches return zero, and that is the clean water between breakers.
//   4. One shared event. The swash samples the same clock at the waterline, so
//      a run-up is a specific breaking wave arriving — not an unrelated timer.
//
// Failure modes previous rounds shipped, all of which the critic checks for:
//   – a continuous white ribbon parallel to the shore (reads as a painted line)
//        → killed by ddBreakSeg: most of the shoreline is not breaking at any
//          one moment, and the trip distance varies stretch to stretch
//   – foam on open water with no wave under it
//        → caps are gated on steep × crest, everything else on the trip point
//   – a hard-edged alpha cut where foam stops
//        → every seaward/lateral falloff is exponential or a wide smoothstep;
//          only the shoreward leading edge is sharp, and it is pixel-widened
//   – foam that does not move shoreward with the wave that made it
//        → the bubble raft is sampled in (along, clock), i.e. the wave's frame
//   – chalk-white flat fill with no bubble structure or thickness variation
//        → the raft carves holes in COVERAGE, not just brightness, and colour
//          runs veil → film → aerated white with thickness

import * as THREE from 'three';
import { SHORE } from '../shore.js';
import { WATER_FACE } from './contract.js';
import { surfShoreClockGlsl, surfEnvelopeGlsl } from './surf.js';

/**
 * R13b swash contract. The beach-foam layer owns waterline white; the
 * shelf only uses this reach for WETNESS (dark sand), never for foam.
 * Reach is NOT scaled by `frame.length + cornerWrapR`.
 *
 * R15: characteristic `reachHigh` stays the sand-envelope pin (9.5).
 * Live per-segment run-up is `RUN_UP` (3–14 m), keyed to the macro swell.
 */
export const SWASH = Object.freeze({
  reachHigh: 9.5,
  reachLow: 7.0,
  pocket: 0.06,
  foamRetired: true,
  wrapMatch: 0.15,
});

/**
 * R15 per-segment run-up. Shared by foam.js (wet band) and outer-ocean.js
 * (authored foam layer). Must stay in lockstep with the GLSL #defines.
 */
/**
 * taste-r1 (W20-A): the waterline as one fringe. The leading edge of a tongue on the beach is a soft band `lipM` metres wide (was a 0.30 m line) torn by a noise
 * (`tearKeep` is the share it keeps in a hole), and the lace behind it runs `laceM` metres seaward (was 2 m), brightest at the front and thinning into the water.
 * `gain` 0 restores the 0.30 m line and the 2 m lace; the values below are the full effect.
 */
export const FRINGE = Object.freeze({ gain: 1, lipM: 1.0, edgeSoftM: 0.30, tearKeep: 0.15, laceM: 3.4, laceTail: 0.55 });
const FR_G = FRINGE.gain;
const FR_LIP_W = 0.30 + (FRINGE.lipM - 0.30) * FR_G;
const FR_SOFT = 0.04 + (FRINGE.edgeSoftM - 0.04) * FR_G;
const FR_LACE_END = 2.0 + (FRINGE.laceM - 2.0) * FR_G;
const FR_LACE_START = 0.35 + 0.55 * FR_G;

/**
 * taste-w25 (foam): the waterline as a torn line of lace with gaps, in both weathers. 1 narrows the lip, tears it harder in shorter runs
 * along the shore, slows the lace's drift and (sand.js) lowers the lip and lace gain in rain; 0 restores wave twenty-five's fringe exactly
 * (the `today` column). The shader is built once at load, so the switch is read once. Browser: `?foamTorn=0`; node: `DD_FOAM_TORN=0`.
 */
export const FOAM_TORN = (typeof process !== 'undefined' && process?.env?.DD_FOAM_TORN !== undefined)
  ? Number(process.env.DD_FOAM_TORN) > 0 ? 1 : 0
  : (typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('foamTorn') === '0' ? 0 : 1);
export const FOAM_TORN_TUNE = Object.freeze(FOAM_TORN ? {
  lipW: 0.55, soft: 0.18, tearKeep: 0.04, alongA: 0.8, alongB: 0.35, lo: 0.47, hi: 0.55, cutKeep: 0.15, cutLen: 2.5, laceDrift: 0.5,
  maskLen: 1.1, laceLo: 0.46, laceHi: 0.68, packAlong: 5.5, packAcross: 4.0, packSharp: 1, packLo: 0.35, packHi: 0.65, rainLip: 0.70, rainLace: 0.60,
} : {
  lipW: FR_LIP_W, soft: FR_SOFT, tearKeep: FRINGE.tearKeep, alongA: 1.2, alongB: 0.5, lo: 0.40, hi: 0.58, cutKeep: 0.35, cutLen: 4.5, laceDrift: 1.0,
  maskLen: 1.5, laceLo: 0.42, laceHi: 0.72, packAlong: 9.0, packAcross: 6.0, packSharp: 0, packLo: 0.0, packHi: 1.0, rainLip: 1.0, rainLace: 1.0,
});
const FT = FOAM_TORN_TUNE;

export const RUN_UP = Object.freeze({
  // W14-B: 2 to 5 m as a rule, 7 to 9 m only at a group peak (was 3 to 14).
  min: 2,
  max: 9,
  segMean: 21,
  segJitter: 9,
  swellLen: 72,
  swellOmega: 0.42,
  swellDirX: 0.13862,
  lagMin: 1,
  lagMax: 2,
});

export const FOAM_GLSL = /* glsl */ `
  #ifndef DD_FOAM
  #define DD_FOAM

  uniform vec3  uFoamColor;      // fresh aerated white — the wall of a bore
  uniform vec3  uFoamShadow;     // film between bubbles, keeps white off chalk
  uniform vec3  uFoamTint;       // the thinnest veil, still mostly water
  uniform float uFoamBreakGain;  // the throwing lip at the trip point
  uniform float uFoamBoreGain;   // whitewater running shoreward
  uniform float uFoamCapGain;    // whitecaps shed off unbroken crests
  uniform float uFoamSwashGain;  // run-up lip + sheet on the sand
  uniform float uFoamLaceGain;   // stranded bubble lace after the backwash
  uniform float uSwashReach;     // metres of run-up — SHARED VALUE with sand.js

  // ── Wave-clock constants ───────────────────────────────────────────────────
  // Deliberately #defines and not uniforms. sand.js compiles this same block
  // into the beach material and uploads only the uniform set it already knows
  // about; a uniform it never sets reads back as 0, and a zero wave period
  // would divide the swash field by zero and silently blank the wet band.
  // RULE: anything on the ddSwashWet path must be a #define, or a uniform
  // sand.js already uploads. New uniforms are legal only inside ddFoam.
  // RULE: never declare float/vec sample/half/filter/buffer/input/output
  // — WebGL 1 skips the shader with a silent ERROR.
  // W14-B: ONE CLOCK. The swell carrier (train 0) is the only wave clock in
  // the game; the sand's swash keys to it, so a tongue lands when a crest of
  // the sea in front of it reaches the waterline. The two blocks below come
  // from water/surf.js and need nothing but ddValueNoise (declared above).
  ${surfShoreClockGlsl()}
  ${surfEnvelopeGlsl()}
  #define DD_WAVE_T      DD_SURF_T  // seconds between crests reaching the sand
  #define DD_TAU_X0      2.6     // metres — softens celerity at the waterline
  #define DD_SWASH_SCALE 1.00    // uSwashReach → peak run-up actually drawn
  #define DD_HASH_WRAP   512.0   // keeps wave ids inside float32 hash precision
  #define DD_RUN_MIN     ${RUN_UP.min.toFixed(1)}
  #define DD_RUN_MAX     ${RUN_UP.max.toFixed(1)}
  #define DD_SEG_MEAN    ${RUN_UP.segMean.toFixed(1)}
  #define DD_SEG_JITTER  ${RUN_UP.segJitter.toFixed(1)}
  #define DD_SWELL_LEN   ${RUN_UP.swellLen.toFixed(1)}
  #define DD_SWELL_OMEGA ${RUN_UP.swellOmega.toFixed(2)}
  #define DD_SWELL_DIRX  ${RUN_UP.swellDirX.toFixed(5)}

  /** Celerity coefficient: c(x) = A·x^0.39 for the contract's ramp bathymetry. */
  float ddCelerityA() {
    return sqrt(9.81 * max(uBathyMaxDepth, 0.5)) / pow(max(uBathyRamp, 1.0), 0.39);
  }

  /** Seconds a shore-bound wave at this front distance still needs to reach shore. */
  float ddTau(float front) {
    float x = max(front, 0.0) + DD_TAU_X0;
    return (pow(x, 0.61) - pow(DD_TAU_X0, 0.61)) / (0.61 * ddCelerityA());
  }

  /** Inverse of ddDepth ignoring the bar — front distance at a given depth. */
  float ddFrontAtDepth(float d) {
    return uBathyRamp * pow(clamp(d / max(uBathyMaxDepth, 0.5), 0.0, 1.0), 1.28205);
  }

  /**
   * Slow along-shore drift of the crest phase. Refraction pulls shore waves
   * near-parallel to the beach, so this stays under a third of a period —
   * enough that the break line is never a ruler, not so much that crests read
   * as diagonal streaks.
   */
  float ddAlongPhase(float along) {
    return (ddValueNoise(vec2(along * 0.0125, 4.70)) - 0.5) * 0.30
         + (ddValueNoise(vec2(along * 0.0460, 17.3)) - 0.5) * 0.11;
  }

  /** The shared wave clock. See the header block for what it means. */
  float ddWaveClock(float along, float front, float t) {
    return (t + ddTau(front)) / DD_WAVE_T + ddAlongPhase(along);
  }

  /** Wave identity wrapped so the hash stays inside float32 precision. */
  float ddWaveId(float clock) { return mod(floor(clock), DD_HASH_WRAP); }

  /**
   * How hard the wave with this id breaks at this point along the beach.
   * Zero over long stretches on purpose — that is the clean water between
   * breaking events, and it is the whole answer to the wallpaper defect.
   */
  float ddBreakSeg(float id, float along) {
    // Cells ~38 m / 14 m so a hero plate can hold three discrete events
    // with unbroken water between them. Threshold 0.56 left one wallpaper slab.
    float cell = floor(along * 0.0318 + id * 0.17);
    float inCell = fract(along * 0.0318 + id * 0.17);
    float peak = smoothstep(0.08, 0.28, inCell) * (1.0 - smoothstep(0.56, 0.86, inCell));
    float on = smoothstep(0.02, 0.16, ddValueNoise(vec2(cell * 1.91, id * 2.33)));
    float set = 0.70 + 0.30 * ddValueNoise(vec2(id * 0.31, 2.13));
    return clamp(peak * on * set * 1.95, 0.0, 1.0);
  }

  /**
   * Where that stretch trips over, in metres seaward of the waterline.
   * A bigger section feels bottom in deeper water (the γ = H/h limit), so the
   * break line staggers in and out by twenty-odd metres along the beach.
   */
  float ddBreakFront(float seg, float id, float along) {
    float j = ddValueNoise(vec2(along * 0.038, id * 5.13 + 7.7));
    // Range chosen so the biggest sections trip out near the offshore bar and
    // the smallest almost on the sand: about 8 m to 42 m. It also puts roughly
    // one and a half waves inside the surf zone, so there is always whitewater
    // somewhere rather than a dead beat between sets.
    float d = mix(0.72, 3.05, clamp(seg * 0.62 + j * 0.55, 0.0, 1.0));
    return ddFrontAtDepth(d);
  }

  // ── Swash ──────────────────────────────────────────────────────────────────

  struct DDSwash {
    float wet;    // 0..1 bed wetness — this is exactly what ddSwashWet returns
    float edge;   // front-distance of the tongue's leading edge, metres (<= 0)
    float run;    // 0..1 how much water is on the sand at this instant
    float phase;  // 0..1 through run-up → full reach → drained
    float power;  // 0..1 strength of the wave doing the running
    float id;     // wrapped wave identity, for anything that needs to hash it
  };

  /**
   * R15 irregular along-shore cell. Spacing 12–30 m (mean 21, boundary
   * jitter ±4.5 → neighbour delta 21±9). Seeded, not a ruler.
   */
  float ddFoamSegId(float along) {
    float mean = DD_SEG_MEAN;
    float amp = DD_SEG_JITTER;
    float i = floor(along / mean);
    float seg = i;
    for (int k = -2; k <= 2; k++) {
      float j = i + float(k);
      float b0 = j * mean + (ddHash21(vec2(j, 1.1)) - 0.5) * amp;
      float b1 = (j + 1.0) * mean + (ddHash21(vec2(j + 1.0, 1.1)) - 0.5) * amp;
      if (along >= b0 && along < b1) {
        seg = j;
        break;
      }
    }
    return seg;
  }

  /**
   * W14-B reach of the wave that LANDS at time t: 2 to 5 m as a rule, 7 to 9 m
   * only at a group peak. The envelope is the sea's own (surf.js, one
   * expression for the water and the sand), so the tongues run farthest when
   * the swell group in front of the beach is at its peak. Name kept: p10-ocean
   * reads it.
   */
  float ddSwellRunUp(float along, float t) {
    float env = ddSurfEnvelope(along, 0.0, t);
    float g = smoothstep(0.5, 1.0, env);
    float r = mix(2.0, 5.0, g) + 4.0 * smoothstep(0.93, 1.0, env);
    return clamp(r, DD_RUN_MIN, DD_RUN_MAX);
  }

  /**
   * Run-up distance of the wave that lands at time t. The id argument is kept
   * so a stale caller still compiles.
   */
  float ddSwashReachAt(float id, float along, float t) {
    return ddSwellRunUp(along, t) * (1.0 + 0.0 * id);
  }

  /**
   * One tongue of the swash. k = 0 is the newest wave, k = 1 the one before:
   * wave n drains over the whole of the following period while wave n + 1
   * advances, so two tongues are on the sand at once.
   *   .x  leading edge, metres of front (<= 0, negative up the beach)
   *   .y  0..1 how far the tongue has run
   *   .z  0..1 lip strength: while it advances and for the first third of the drain
   *   .w  its reach in metres
   * The clock is the shore clock minus a quarter: a crest lands when it passes
   * an integer, so clock - floor(clock) is the wave's age in periods.
   */
  vec4 ddTongue(float along, float t, float clock, float k) {
    float cyc = floor(clock);
    float ph = clock - cyc + k;
    float id = mod(cyc - k, DD_HASH_WRAP);
    // Reach is fixed at the instant the wave landed, so a tongue keeps its
    // length for as long as it drains.
    float tw = t - ph * DD_WAVE_T;
    float reach = ddSwashReachAt(id, along, tw)
      * (0.80 + 0.40 * ddValueNoise(vec2(along * 0.085, id * 3.7 + 1.3)));
    reach = min(reach, DD_RUN_MAX);
    float run = smoothstep(0.0, 0.22, ph) * (1.0 - smoothstep(0.30, 1.90, ph));
    float lip = smoothstep(0.0, 0.05, ph) * (1.0 - smoothstep(0.65, 0.90, ph));
    return vec4(-run * reach, run, lip, reach);
  }

  /**
   * The swash field, evaluated at the waterline clock so a run-up belongs to a
   * specific wave of the sea in front of it. Front is signed distance seaward
   * of the meandered waterline: negative up the beach, positive under water.
   */
  DDSwash ddSwashAt(float along, float front, float t) {
    float clock = ddSurfShoreClock(along, t) - 0.25;
    float id = ddWaveId(clock);
    float ph = fract(clock);

    // Two tongues; the further edge is the one that wets the sand.
    vec4 tA = ddTongue(along, t, clock, 0.0);
    vec4 tB = ddTongue(along, t, clock, 1.0);
    float edge = min(tA.x, tB.x);
    float run = max(tA.y, tB.y);
    float reach = tA.w;

    // Wet from the tongue's leading edge seaward. Everything past the
    // waterline is submerged, so this saturates to 1 out in the water.
    float tongue = smoothstep(edge - 0.45, edge + 0.20, front);

    // Soak: the dark band the tongues leave behind follows the high-water
    // mark of the last one or two waves.
    // W14-B fix: every key here is CONTINUOUS in along and in time. The old
    // keys (floor(clock) of the previous wave and a per-cell hash for the lag)
    // jumped wherever the wave clock crossed an integer or a 12-30 m cell
    // boundary, which drew straight cross-shore steps in the wet band.
    float prevClock = clock - 1.0;
    float lagCyc = 1.0 + smoothstep(0.35, 0.65, ddValueNoise(vec2(along * 0.045, 4.6)));
    float soakReach = max(tA.w * (1.0 - 0.28 * ph), ddSwashReachAt(prevClock, along, t - DD_WAVE_T * lagCyc));
    float soakJit = ddValueNoise(vec2(along * 0.032, prevClock * 1.7 + 3.2)) * 4.0
                  + ddValueNoise(vec2(along * 0.086, prevClock * 4.1 + 8.6)) * 2.4
                  + ddValueNoise(vec2(along * 0.190, prevClock * 2.6 + 1.1)) * 1.4;
    // W14: 0.3-0.8 m high-frequency tear so the wet-band terminator is not a
    // contour of constant front (the "straight hard shoreline").
    float wetBreak = mix(0.30, 0.80, ddValueNoise(vec2(along * 1.72, prevClock * 3.4 + 2.1)));
    float wetSign = ddValueNoise(vec2(along * 3.15, prevClock * 5.2 + 8.8)) * 2.0 - 1.0;
    float wetEdgeJit = wetBreak * wetSign;
    float soakPocket = 0.82 + 0.18 * ddValueNoise(vec2(along * 0.028, prevClock * 2.2));
    // W14-B: the dry-to-wet step is about 2.5 m wide. The old ramp ran 8 to
    // 16 m (soakJit alone added up to 7.8 m) and read as a 15 to 20 m smear.
    float soakShift = (soakJit - 3.9) * 0.25;
    float soak = smoothstep(-soakReach - 1.5 + soakShift + wetEdgeJit,
                            -soakReach + 0.3 + soakShift + wetEdgeJit * 0.35, front)
      * mix(0.70, 1.0, soakPocket);

    DDSwash o;
    o.wet = clamp(max(tongue, soak * 0.90), 0.0, 1.0);
    o.edge = edge;
    o.run = run;
    o.phase = ph;
    o.power = ddBreakSeg(id, along);
    o.id = id;
    return o;
  }

  /**
   * 0..1 bed wetness. ALSO CONSUMED BY sand.js for the wet band on the beach —
   * the dark fringe and the water's own swash have to be one event or the join
   * lies. Returns 1 under standing water (front >= ~0), 1 inside the current
   * run-up tongue, and a 0.62 soak tail up to the recent high-water mark.
   */
  float ddSwashWet(float along, float front, float t) {
    return ddSwashAt(along, front, t).wet;
  }

  /**
   * W14-B what the tongues paint on the sand, drawn by the sand itself.
   *   .x  sheen: the film between the leading edge and the still waterline
   *   .y  lip: 0.20 to 0.35 m of foam at the leading edge, present while the
   *       tongue advances and for the first third of its drain
   *   .z  lace: 1 to 2 m behind the lip, at most half covered, in tongues
   *   .w  run: how far the tongue has run, 0..1 (scales the shallow tint)
   * px is the metres one pixel covers in the shore frame: the lip is never
   * narrower than a pixel and a half, and its opacity is scaled to match.
   */
  vec4 ddSwashSurface(float along, float front, float t, float px) {
    float clock = ddSurfShoreClock(along, t) - 0.25;
    float sheen = 0.0;
    float lip = 0.0;
    float lace = 0.0;
    float runMax = 0.0;
    for (int i = 0; i < 2; i++) {
      float k = float(i);
      vec4 tg = ddTongue(along, t, clock, k);
      float e = tg.x;
      float live = smoothstep(0.02, 0.12, tg.y);
      // Between the leading edge and the still waterline.
      float film = smoothstep(e - 0.10, e + 0.45, front)
        * (1.0 - smoothstep(-0.25, 0.35, front)) * live;
      sheen = max(sheen, film);
      // The lip: at least a pixel and a half wide, opacity scaled to match.
      float w = max(${FT.lipW.toFixed(2)}, px * 2.2);
      float lipM = smoothstep(e - ${FT.soft.toFixed(2)}, e + ${FT.soft.toFixed(2)}, front)
        * (1.0 - smoothstep(e + w * 0.55, e + w, front));
      // taste-r1 (W20-A): the fringe is torn along its length and across it, never dashed (it keeps ${FT.tearKeep.toFixed(2)} of itself in a hole; taste-w25 FOAM_TORN: shorter runs along the shore, a narrower lip).
      float tearL = 0.6 * ddValueNoise(vec2(along / ${FT.alongA.toFixed(2)} + k * 5.0, (front - e) / 0.45 + 2.0)) + 0.4 * ddValueNoise(vec2(along / ${FT.alongB.toFixed(2)} + 9.0 + k, (front - e) / 0.25 + 6.0));
      lipM *= mix(1.0, mix(${FT.tearKeep.toFixed(2)}, 1.0, smoothstep(${FT.lo.toFixed(2)}, ${FT.hi.toFixed(2)}, tearL)), ${FR_G.toFixed(2)});
      lipM *= mix(1.0, mix(${FT.cutKeep.toFixed(2)}, 1.0, ddValueNoise(vec2(along / ${FT.cutLen.toFixed(2)} + 17.0 + k * 3.0, 1.3))), ${FR_G.toFixed(2)});
      lip = max(lip, lipM * tg.z * live * min(1.0, 0.30 / w + 0.45) * ${(1 - 0.30 * FR_G).toFixed(2)});
      // Lace: broken into tongues by a two-octave noise at 1.5 m.
      float tw = t - (clock - floor(clock) + k) * DD_WAVE_T;
      vec2 lp = vec2(along, front - e) / ${FT.maskLen.toFixed(2)};
      float mask = 0.6 * ddValueNoise(lp * vec2(1.0, 0.8) + vec2(tw * ${(0.05 * FT.laceDrift).toFixed(3)}, 3.0 + k))
                 + 0.4 * ddValueNoise(lp * 2.1 + vec2(11.0, tw * ${(0.07 * FT.laceDrift).toFixed(3)} + k));
      float broken = smoothstep(${FT.laceLo.toFixed(2)}, ${FT.laceHi.toFixed(2)}, mask);
#ifdef DD_SWASH_PACK
      // The foam pack's swash channel (Pocket Reserve foam-lace): torn cross-shore tongues, in place of
      // value noise once the pack has loaded. The sand declares the sampler; the ocean does not.
      broken = mix(broken, ddSandLaceMask(vec2(along * (1.0 / ${FT.packAlong.toFixed(1)}) + k * 0.31, (front - e) * (1.0 / ${FT.packAcross.toFixed(1)})
        + tw * ${(0.004 * FT.laceDrift).toFixed(4)})), DD_SWASH_READY);
      broken = mix(broken, smoothstep(${FT.packLo.toFixed(2)}, ${FT.packHi.toFixed(2)}, broken), ${FT.packSharp.toFixed(1)} * DD_SWASH_READY);
#endif
      float band = smoothstep(e + 0.05, e + ${FR_LACE_START.toFixed(2)}, front)
        * (1.0 - smoothstep(e + 1.0, e + ${FR_LACE_END.toFixed(2)}, front));
      // taste-r1 (W20-A): brightest at the front and thinning seaward (the sand shows between the holes).
      band *= 1.0 - ${(FRINGE.laceTail * FR_G).toFixed(2)} * smoothstep(e + 0.4, e + ${FR_LACE_END.toFixed(2)}, front);
      lace = max(lace, band * broken * live * mix(0.35, 0.5, tg.z));
      runMax = max(runMax, tg.y);
    }
    return vec4(sheen, lip, lace, runMax);
  }

  /**
   * Swash foam coverage at a point: .x = the live run-up (bright lip plus the
   * torn sheet behind it), .y = bubble lace stranded by the backwash. Both are
   * un-gained so either caller can weight them.
   *
   * Split out of ddFoam on purpose. The water plane passes UNDER the beach a
   * few metres inland of the waterline, so the top of a run-up drawn on the
   * water gets sliced off against the sand with a hard geometric edge. The
   * beach could draw that part correctly. sand.js does not call this yet —
   * it only takes ddSwashWet — and the ask is written up in the seat report.
   *
   * The detail argument is 1 near the camera and falls to 0 where fine noise
   * would alias; pass 1.0 if you have no derivative estimate to hand.
   */
  vec2 ddSwashFoam(float along, float front, float t, float detail) {
    // R13b: retired from the live path. The beach-foam layer (arcs + lace +
    // wharf lap) is the only white-foam painter at the waterline. Gains-to-0
    // was not enough — the mix in sand.js painted cream over pale swash
    // albedo. Signature kept so a stale caller cannot fail to compile.
    return vec2(0.0) * (along * 0.0 + front * 0.0 + t * 0.0 + detail * 0.0);
  }

  // ── Foam ───────────────────────────────────────────────────────────────────

  struct DDFoam {
    float cover;
    vec3  color;
    float alpha;
  };

  struct DDFoamIn {
    vec3  world;
    vec3  flatWorld;
    float front;
    float depth;
    float crest;
    float steep;
    float fold;
    float shoal;
    float along;
    float t;
  };

  DDFoam ddFoam(DDFoamIn fi) {
    float t = fi.t;
    float along = fi.along;
    float front = fi.front;

    // Screen footprint in metres. Detail finer than a couple of pixels does not
    // resolve into bubbles, it averages into the grey wash that reads as
    // wallpaper — so those octaves are retired with distance rather than
    // allowed to smear.
    float px = max(fwidth(fi.flatWorld.x), fwidth(fi.flatWorld.z));
    float detail = 1.0 - smoothstep(0.30, 1.45, px);

    // ── Which wave, how old, and did it break here ────────────────────────
    float clock = ddWaveClock(along, front, t);
    float id = ddWaveId(clock);
    float cyc = fract(clock);
    // Metre-scale tear on the leading edge only. Without this, clock's
    // along-shore octaves sit at 80 m / 22 m and every close framing sees a
    // ruler-straight bore terminator (foam critic M1).
    float edgeJit = (ddValueNoise(vec2(along * 0.42, id * 3.10 + 19.3)) - 0.5) * 1.15
                  + (ddValueNoise(vec2(along * 1.10, id * 5.70 + 8.1)) - 0.5) * 0.55
                  + (ddValueNoise(vec2(along * 2.80, id * 2.20 + 1.4)) - 0.5) * 0.28;
    float cycE = fract(clock + edgeJit);
    float age = cyc * DD_WAVE_T;                 // seconds since the front passed
    float seg = ddBreakSeg(id, along);
    float xBreak = ddBreakFront(seg, id, along);

    // The leading edge. Sharp, but never narrower than a pixel or it crawls.
    float cw = max(fwidth(clock), 0.0015);
    float lead = 1.0 - smoothstep(0.0, max(0.060, cw * 1.7), cycE);
    float leadWide = 1.0 - smoothstep(0.0, max(0.145, cw * 2.6), cycE);

    // A stretch of shoreline either breaks or it does not. A soft ramp on seg
    // spreads a weak grey haze over everything, which is the wallpaper defect
    // wearing a different hat; hardening it is what makes the events discrete.
    float segHard = smoothstep(0.22, 0.50, seg);
    // Foam lives on the crest TOP. Painting the steep face is the icicle drip.
    float onCrest = smoothstep(0.28, 0.68, fi.crest);

    // ── 1. The breaking lip ───────────────────────────────────────────────
    // Where the wave trips it throws forward and the crest goes white. A tight
    // patch at the trip point on the leading face — a curl, never a band.
    float u = (front - xBreak) / 5.1;
    float atTrip = exp(-u * u);
    float lipTex = ddValueNoise(vec2(along * 0.38, clock * 6.4))
                 * 0.55 + ddValueNoise(vec2(along * 1.15, clock * 3.1)) * 0.45;
    float lip = atTrip * segHard * onCrest * mix(leadWide, lead, 0.55)
      * (0.38 + 0.58 * fi.fold)
      * smoothstep(0.52, 0.84, lipTex)
      * mix(0.12, 1.0, smoothstep(0.44, 0.78, ddValueNoise(vec2(along * 0.92, clock * 4.2))));
    float segMid = ddBreakSeg(id + 1.0, along + 19.0);
    float segFar = ddBreakSeg(id + 2.0, along - 27.0);
    float xMid = ddBreakFront(segMid, id + 1.0, along + 19.0);
    float xFar = ddBreakFront(segFar, id + 2.0, along - 27.0);
    float uMid = (front - xMid) / 4.4;
    float uFar = (front - xFar) / 4.4;
    float lipMid = exp(-uMid * uMid) * smoothstep(0.22, 0.50, segMid) * onCrest
      * (0.40 + 0.50 * fi.fold)
      * smoothstep(0.54, 0.86, ddValueNoise(vec2(along * 0.34, clock * 5.1)))
      * mix(0.12, 1.0, smoothstep(0.42, 0.76, ddValueNoise(vec2(along * 1.05, clock * 3.3))));
    float lipFar = exp(-uFar * uFar) * smoothstep(0.22, 0.50, segFar) * onCrest
      * (0.38 + 0.48 * fi.fold)
      * smoothstep(0.54, 0.86, ddValueNoise(vec2(along * 0.29, clock * 4.4)))
      * mix(0.12, 1.0, smoothstep(0.44, 0.78, ddValueNoise(vec2(along * 0.88, clock * 2.7))));

    // ── 2. Whitewater bore ────────────────────────────────────────────────
    // Shoreward of the trip point the wave is a moving wall of aerated water.
    float tripped = smoothstep(xBreak + 3.5, xBreak - 3.0, front);
    // Energy bleeds away across the flats; a big section carries further.
    float spent = exp(-max(xBreak - front, 0.0) / (22.0 + 40.0 * seg));
    // It stands up again crossing the shallows, but only a little. The beach
    // shelf currently writes depth while translucent, so it slices the water
    // plane off along a straight line a few metres seaward of the waterline;
    // saturated white running into that slice reads as a painted edge. Keeping
    // the inner bore mid-tone costs some punch and buys a survivable join.
    // (Sorting note is in the seat report — the fix is not in this file.)
    // Shoreward terminator must wobble at metre scale. A constant-front fade
    // is the machine-cut M1 ruler the surf-macro plate keeps confessing.
    float landJit = (ddValueNoise(vec2(along * 0.55, id * 2.40 + 4.1)) - 0.5) * 16.4
                  + (ddValueNoise(vec2(along * 1.35, id * 6.10 + 9.8)) - 0.5) * 8.8
                  + (ddValueNoise(vec2(along * 3.10, id * 3.30 + 2.2)) - 0.5) * 4.6;
    spent *= 1.0 + 0.28 * smoothstep(14.0 + landJit, 2.2 + landJit * 0.50, front);
    // Aeration decays behind the front. A bore is METRES of white, so the
    // constant is seconds, not a spike, and it never quite reaches zero before
    // the next wave — that residue is what a real surf zone sits in.
    float aer = mix(0.07, 1.0, exp(-age / (3.40 + 3.60 * seg)));
    aer = max(aer, lead);

    // Bubble raft sampled in (along, clock) — the wave's own frame, so the
    // texture travels with the water that made it instead of churning in place.
    // Two layers, and the first is deliberately anisotropic: whitewater is
    // striated ALONG the crest in long thin bands, and an isotropic blob field
    // on its own is what makes foam read as cloud pasted on the water.
    vec2 bandP = vec2(along * 0.085, clock * 26.0);
    float bands = ddValueNoise(bandP) * 0.62
                + mix(0.5, ddValueNoise(bandP * 2.30 + 7.7), detail) * 0.38;
    vec2 raftP = vec2(along * 0.34, clock * 8.5);
    float bubbles = ddValueNoise(raftP) * 0.46
                  + mix(0.5, ddValueNoise(raftP * 3.10 + 41.7), detail) * 0.32
                  + mix(0.5, ddValueNoise(raftP * 8.70 + 63.1), detail) * 0.22;
    float raft = bands * 0.52 + bubbles * 0.48;
    // Holes are carved in COVERAGE, not brightness, and they OPEN WITH AGE:
    // the wall behind the front is near-solid, and it tears into lace as it
    // runs out of air. Both thresholds ride the aeration, so a fresh bore is
    // white sheet and an old one is a bubble net with water showing through.
    float old = 1.0 - aer;
    float bite = smoothstep(0.22 + 0.42 * old, 0.62 + 0.30 * old, raft);
    // Open more holes as the raft reaches the waterline so the shoreward
    // edge dissolves instead of ending on a contour of constant front.
    float nearJoin = smoothstep(12.0, 1.2, front);
    // W-R50: keep holes at the join, but do not erase the arriving wall.
    bite *= 1.0 - nearJoin * 0.58 * (1.0 - raft);
    float boreRaw = tripped * segHard * spent * aer * mix(0.10, 1.0, bite);
    // Split the result into water or white instead of leaving the average. A
    // soft mid-tone spread thinly over the whole surf zone is exactly the
    // wallpaper read; the same energy concentrated into fewer, harder patches
    // reads as waves breaking. Sparser AND brighter, from one curve.
    float th = 0.10 + 0.34 * raft;
    float bore = smoothstep(th, 0.66, boreRaw);
    // Shoreward terminator must dissolve into holes, not fade on a front contour.
    // Metre-scale tear so the left third of the surf-macro plate cannot take a
    // straightedge. Hardness stays on the seaward lip (frontEdge), not here.
    float joinTear = smoothstep(0.16, 0.64,
      ddValueNoise(vec2(along * 0.92, id * 2.2 + 5.1)) * 0.55
      + ddValueNoise(vec2(along * 2.40, front * 0.35 + id)) * 0.45);
    // The bore front itself. In a real surf zone this is the hardest, whitest
    // line in the picture and everything behind it is a thinning film; without
    // it the whitewater is a soft patch with no direction of travel. Pinned to
    // one pixel minimum so it stays an edge instead of crawling. Driven from
    // the torn clock so the terminator is not a contour of constant phase.
    float frontEdge = (1.0 - smoothstep(0.0, max(0.040, cw * 2.2), cycE))
      * tripped * onCrest * smoothstep(0.38, 0.72, seg) * (0.07 + 0.11 * spent)
      * mix(0.00, 0.10, joinTear)
      * mix(bite, 1.0, 0.04)
      * smoothstep(0.50, 0.84, ddValueNoise(vec2(along * 0.62, id * 3.4)));
    // W-R50: keep mid-surf bore as mass. Shoreward of ~8 m, dissolve into
    // holes rather than dimming on a front contour (that dimmer IS the ruler).
    // Face residual is the surf-macro icicle. Keep mass on the crest top.
    bore = max(bore * 0.70, frontEdge) * mix(0.14, 1.0, onCrest);
    bore *= mix(0.55, 1.0, joinTear);
    float edgeEat = smoothstep(0.16, 0.70,
      ddValueNoise(vec2(along * 1.28, id * 4.15)) * 0.58
      + ddValueNoise(vec2(along * 2.95, id * 1.62 + 8.4)) * 0.42);
    bore *= mix(edgeEat, 1.0, smoothstep(5.0, 16.0, front));
    float laceBite = smoothstep(0.20, 0.72,
      ddValueNoise(vec2(along * 0.74, id * 6.05)) * 0.50
      + ddValueNoise(vec2(along * 1.90, id * 2.80 + 4.4)) * 0.50);
    bore *= mix(mix(0.18, 1.0, laceBite), 1.0, smoothstep(3.0, 13.0, front));
    // Do not apply joinFade as a second front-distance dimmer. The torn bites
    // above are the shoreward terminator.

    // ── 3. Pre-shore spill (whitecaps on the last unbroken crests) ────────
    // Open-bay wind caps are wallpaper (M8). What we want is cream on ridges
    // that are already shoaling, 12–48 m out, before they trip. Discrete
    // patches, locked to this wave's clock, not a shore-parallel comb.
    float spillZone = smoothstep(11.0, 17.0, front)
                    * (1.0 - smoothstep(48.0, 66.0, front));
    // Crest TOP only. Gating on high steep painted the plunging face and
    // projected as the surf-macro icicles.
    float spillGate = smoothstep(0.48, 0.78, fi.crest)
                    * (1.0 - smoothstep(0.58, 0.86, fi.steep))
                    * (1.0 - tripped * segHard);
    vec2 spillP = vec2(along * 0.20, clock * 5.6);
    float spillN = ddValueNoise(spillP) * 0.56
                 + mix(0.5, ddValueNoise(spillP * 2.85 + 4.2), detail) * 0.44;
    float spillCell = ddValueNoise(vec2(along * 0.036 + id * 0.13, front * 0.030 + id * 0.7));
    float spillPatch = smoothstep(0.46, 0.74, spillCell);
    float spillRaw = spillZone * spillGate * spillPatch
      * smoothstep(0.48, 0.78, spillN)
      * (0.40 + 0.70 * fi.shoal);
    float spill = smoothstep(0.18, 0.58, spillRaw);

    // Residual open-bay specks stay tiny so M8 does not return.
    vec2 capP = (fi.flatWorld.xz + uShoreNormal.xz * (t * 2.4)) * 0.30;
    float capN = ddValueNoise(capP) * 0.62
               + mix(0.5, ddValueNoise(capP * 3.3 + 5.9), detail) * 0.38;
    float capGate = smoothstep(0.50, 0.88, fi.steep) * smoothstep(0.46, 0.84, fi.crest);
    float capPatch = smoothstep(0.62, 0.86, ddValueNoise(
      vec2(along * 0.018 + t * 0.003, front * 0.014 - t * 0.008)));
    float capsOff = capGate * smoothstep(0.66, 0.90, capN) * capPatch
      * (1.0 - smoothstep(0.12, 0.50, fi.shoal)) * 0.10;
    float caps = spill + capsOff;

    // ── 4. Swash / arrival ────────────────────────────────────────────────
    // R13b: retired. Layer owns waterline white; shelf owns wet sand.
    vec2 swash = ddSwashFoam(along, front, t, detail);
    float arrival = 0.0;
    float sandLift = 0.0;

    // ── Composite ─────────────────────────────────────────────────────────
    float raw = caps * uFoamCapGain
      + (lip + lipMid * 0.16 + lipFar * 0.08) * uFoamBreakGain
      + bore * uFoamBoreGain
      + swash.x * uFoamSwashGain * sandLift
      + swash.y * uFoamLaceGain * sandLift
      + arrival * uFoamSwashGain * 1.25 * sandLift;
    // taste-r1 (W15 fix): the city beach's surf foam ends softly before the board end, where the hinterland rim takes the shore on
    // (it ended as a sliver of tight parallel white lines at x 286 to 293, z 311 to 314). East shelf only. Switch-off: rimFoamFade = 1.0.
    float rimFoamFade = uShoreNormal.x < 0.70 ? 1.0 : 1.0 - smoothstep(286.0, 304.0, fi.flatWorld.z);
    raw *= rimFoamFade;
    float cover = clamp(raw, 0.0, 0.58);

    vec3 col = mix(uFoamTint, uFoamShadow, smoothstep(0.02, 0.14, raw));
    col = mix(col, uFoamColor, smoothstep(0.04, 0.22, raw));
    // Inter-bubble shading so the white has body rather than being a flat fill.
    col *= 0.88 + 0.24 * mix(0.5, raft, detail);
    // The wall of a fresh bore catches sky; drained lace does not.
    col *= 1.0 + 0.14 * lead * tripped;

    DDFoam o;
    o.cover = cover;
    o.color = col;
    o.alpha = cover;
    return o;
  }

  #endif
`;

/** @param {string} quality */
export function foamUniforms(quality = 'high') {
  const srgb = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  return {
    uFoamColor: { value: srgb('#f3efe4') },
    uFoamShadow: { value: srgb('#d4d2c6') },
    uFoamTint: { value: srgb('#c5cfc8') },
    uFoamBreakGain: { value: 2.10 },
    uFoamBoreGain: { value: 0.92 },
    uFoamCapGain: { value: 0.52 },
    // R13b: shelf is not a white-foam painter. Gains stay at 0 so a stale
    // mix cannot resurrect runLip / sheet / lace.
    uFoamSwashGain: { value: 0.0 },
    uFoamLaceGain: { value: 0.0 },
    // Must stay in step with the duplicate literal in sand.js — the beach and
    // the water have to compute an identical swash reach or the join lies.
    uSwashReach: { value: quality === 'low' ? SWASH.reachLow : SWASH.reachHigh },
  };
}

/**
 * CPU mirror of the wrap-aware shelf front. Main span is `shore - waterFace`.
 * Past each board end the waterline is a circular cap around the corner, so
 * a sample at the east waterline X, 40 m past the north board, is NOT front=0
 * (that straight-shelf lie was the stretched north-wrap tongue).
 */
export function wrapFrontAt(along, shore, opts = {}) {
  const alongHalfM = Number.isFinite(opts.alongHalf) ? opts.alongHalf : 136;
  const centre = Number(opts.alongCentre) || 0;
  const waterFace = Number.isFinite(opts.waterFace) ? opts.waterFace : WATER_FACE;
  const extra = Math.abs((Number(along) || 0) - centre) - alongHalfM;
  if (extra <= 0) return (Number(shore) || 0) - waterFace;
  return Math.hypot(extra, Number(shore) || 0) - waterFace;
}

function smooth01(e0, e1, x) {
  const d = e1 - e0;
  if (Math.abs(d) < 1e-12) return x >= e1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - e0) / d));
  return t * t * (3 - 2 * t);
}

/**
 * CPU of the P13-W NE-corner mask. 1 at world x > 262 ∧ z < 8, 0 outside
 * a 12 m smoothstep. Mid-beach samples at (280, 120) and (300, 200) are 0.
 */
export function cornerMaskAt(x, z) {
  const x1 = SHORE.cornerMaskX;
  const z0 = SHORE.cornerMaskZ;
  const feat = SHORE.cornerMaskFeather;
  const mx = smooth01(x1 - feat, x1, Number(x));
  const mz = 1 - smooth01(z0, z0 + feat, Number(z));
  return Math.max(0, Math.min(1, mx * mz));
}

/**
 * Sand-frame wrap front at a world XZ sample (east-bay defaults: origin
 * 274.8 / 136, alongHalf 136). Same circular cap as `ddWrapFront`.
 */
export function cornerWrapLineAt(x, z, opts = {}) {
  const originX = Number.isFinite(opts.originX) ? opts.originX : 274.8;
  const originZ = Number.isFinite(opts.originZ) ? opts.originZ : 136;
  const shore = Number(x) - originX;
  const along = -Number(z);
  const centre = -originZ;
  return wrapFrontAt(along, shore, {
    alongHalf: Number.isFinite(opts.alongHalf) ? opts.alongHalf : 136,
    alongCentre: centre,
    waterFace: opts.waterFace,
  });
}

/**
 * CPU of the P13-W2 wrap-lace band. 1 on the waterline ribbon, 0 outside
 * the land/sea feathers. Mid-beach is not this path.
 */
/**
 * P13-W3 CPU of the fragment wrap-front lip. 1 inland of wrap-front,
 * 0 past `cornerLipTo` metres seaward. Mid-beach is not this path.
 */
export function cornerLipFadeAt(front) {
  return 1 - smooth01(SHORE.cornerLipFrom, SHORE.cornerLipTo, Number(front));
}

export function cornerLaceBandAt(wrapLine) {
  const a0 = SHORE.cornerLaceLand0;
  const a1 = SHORE.cornerLaceLand1;
  const b0 = SHORE.cornerLaceSea0;
  const b1 = SHORE.cornerLaceSea1;
  return smooth01(a0, a1, Number(wrapLine)) * (1 - smooth01(b0, b1, Number(wrapLine)));
}

/**
 * Metres-along the wrap cap, folded onto the east-face so foam cell / arc
 * density matches mid-beach instead of stretching with polar `along`.
 */
export function wrapLaceAlongAt(along, shore, opts = {}) {
  const alongHalfM = Number.isFinite(opts.alongHalf) ? opts.alongHalf : 136;
  const centre = Number(opts.alongCentre) || 0;
  const face = Number.isFinite(opts.waterFace) ? opts.waterFace : WATER_FACE;
  const a = Number(along) || 0;
  const extra = Math.abs(a - centre) - alongHalfM;
  if (extra <= 0) return a;
  const sh = Math.max(Number(shore) || 0, 0.05);
  const capAng = Math.atan2(extra, sh);
  if (!Number.isFinite(capAng)) return a;
  return centre + alongHalfM - capAng * face;
}

/**
 * Characteristic swash reach (metres of run-up). Independent of
 * `frame.length + cornerWrapR` — a corner along-coord matches mid-beach.
 */
export function swashReachAt(along, opts = {}) {
  const base = Number.isFinite(opts.base)
    ? opts.base
    : (opts.quality === 'low' ? SWASH.reachLow : SWASH.reachHigh);
  // Fold wrap samples onto the board end so the field cannot stretch.
  const alongHalfM = Number.isFinite(opts.alongHalf) ? opts.alongHalf : 136;
  const centre = Number(opts.alongCentre) || 0;
  const a = Number(along) || 0;
  const rel = a - centre;
  const folded = Math.abs(rel) > alongHalfM ? centre + Math.sign(rel || 1) * alongHalfM : a;
  void folded;
  return base;
}

const foam = {
  FOAM_GLSL, foamUniforms, SWASH, RUN_UP, FRINGE, wrapFrontAt, swashReachAt,
  cornerMaskAt, cornerWrapLineAt, cornerLaceBandAt, wrapLaceAlongAt,
  cornerLipFadeAt,
};
export default foam;
