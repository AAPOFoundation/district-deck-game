// District Deck — beach sand (surface, relief and wet fringe).
// Owner seat: SAND. Contract: ./contract.js — read it before editing.
//
// Responsibility
//   • the beach shelf mesh: berm crest, cusps, a slope that actually falls to
//     the water, and enough tessellation to carry relief
//   • sand shading: grain at reading distance, wind ripple, rake, shell and
//     seaweed debris, a wrack line at high tide, colour that is warm-neutral
//     rather than orange plastic
//   • the wet fringe: darker, smoother, more reflective sand that tracks the
//     ACTUAL swash (`ddSwashWet` from foam.js), including the sheen of a film
//     of water left behind after a run-up
//   • footprints and tracks near the boardwalk and around the beach props
//
// Scale note. The board is 272 m across and the camera sits at diorama
// distances (hero orbit ≈ 0.12 m per pixel, sand macro ≈ 0.02 m). Every
// frequency below is chosen for THAT viewing distance, and every high band is
// faded out by its own pixel footprint. A field that is not band-limited turns
// into salt-and-pepper the moment the camera pulls back — that was W-R01a.
//
// Datum note. SAND_Y is a shared contract: board.js lands the seawall stairs on
// it and water.js stands the umbrellas, van, bins, racks and lifeguard tower on
// it (prop bases sit within about 2 cm of the plane, between shore 7 m and
// 19 m). All macro relief is therefore gated to zero landward of front ≈ -26 m
// so nothing floats or buries. Relief lives on the berm, the face and the
// swash zone, which is empty of props.

import * as THREE from 'three';
import { W20_SHORE_GAIN } from './hull-sit.js';
import { SHORE } from '../shore.js';
import {
  SAND_Y, SHORE_COMMON_GLSL, WATER_FACE, WATER_Y,
} from './contract.js';
import { FOAM_GLSL, FOAM_TORN_TUNE, cornerMaskAt, wrapFrontAt } from './foam.js';
import { TASTE_RAIN } from '../taste-tokens.js'; // taste-w25 (foam): the rain span of the wet-sand albedo sets the foam's rain gain
import { INTERACT_GLSL } from './interact.js';
import { SURF } from './surf.js';
import { loadCoastPack } from '../coast-textures.js';
import { WATER_LAW } from './law.js';
import { SHALLOW_TONE } from './aqua.js'; // taste-r1 (W22-C): SHALLOW_TONE.cove is the one switch for the cove's inclusion
// Wave 75 (coast spine phase 2a): the shelf's front is the spine's d with the switch on. Used inside functions only (coast-spine.js imports this file back).
import {
  COAST_SPINE, COAST_SPINE_GLSL, COAST_SHELF_FRONT_GLSL, COAST_BEACH_RELIEF_GLSL,
  activeCoastSpine, coastSpineFront, sampleCoastW, beachReliefGate, beachReliefFloor, coastSpineUniforms, BEACH_RELIEF, BEACH_DATUM,
} from '../coast-spine.js';
// Wave 78 (2b-3): the drift of the old front, put into the swash (COAST_SPINE on only; inside functions only, coast-spine.js imports this file back).
import { swashSpineGlsl } from './swash-spine.js';

/**
 * R13b sand hues. Dry is quartz tan, not cream. Damp and wet are darker
 * notes of the same hue — value variation only, never a white swash paint.
 */
// TASTE-BIBLE sections 2 and 6: wet sand is ground.sand.wet (H 42), never the
// sepia shelf (H 330-20 under V 45). The old damp #8a6848 and wet #6a5040 sat at
// H 22-27, so under rain the whole 20 m wet strip read as brown-purple mud. These
// keep the hue of the dry tan and only lose value, and are lifted to compensate
// for this module's second sRGB conversion (see `srgb` in makeSandMaterial).
/** taste-r1 (W20-A): wet sand as a gradient and the pale bed under clear shallows. `gain` 0 restores the wet strip and the wet bed; `wetMax` is the most value the damp sand loses, over `wetReachM` metres, with a `wetNoiseM` metre noise on its landward edge; `oldKeep` the weight kept by the moving swash wetness; `bedAbsorb` the per-channel absorption (per metre, red first) of the light that reaches the bed under clear shallows, capped at 1.3 m; `lineKeep` the share kept of the thin white line at the still waterline (the swash fringe in foam.js is the one white edge). */
export const SAND_W20 = Object.freeze({ gain: 1, wetMax: 0.20, wetReachM: 8, wetNoiseM: 2.5, oldKeep: 0.6, bedAbsorb: [4.2, 0.70, 0.25], lineKeep: 0.15 });
/**
 * taste-w72 (corner alpha): the switch for the east shelf's sea-side hand-over at the north-east corner. The shelf's alpha has two rules: outside the corner mask `seaFade`, a dissolve keyed on submerged depth that reaches the sea about 12.8 m seaward of the waterline; inside it (`ddCornerMask` > 0.01) the lip rule, which ends 0.6 m out. The switch between them was a hard step at cornerM = 0.01 (world z 19.3 on the east shelf), so the sea's edge jumped from 12.8 m out to 0.5 m out along a straight line across the shore.
 * 1 hands the rule over continuously: a ramp `t` (0 = lip rule, 1 = seaFade) that is 0 inside the mask and rises over `reachM` metres of z past it, broken by `wanderM` metres of noise that only delays the ramp (so it is 0 at the mask edge); the lip's far end glides from `cornerLipTo` to `dmaxM` metres as t rises (the edge's seaward position, so the sea edge moves instead of the sand going translucent), and the lip's weight falls to 0 over t = `tail` to 1. `soft` > 0 ramps t over the mask's own feather (cornerM 0 to `soft`, shifted by 0.02 * `wanderM` * noise) instead of stepping at 0.01, so nothing past z 19.3 changes; use it or `reachM`, not both (they would not meet). The defaults are column D of the w72 sheet (soft 1, dmaxM 14, wanderM 4, tail 0.8); reachM 0, dmaxM 0.6, wanderM 0, tail 0, soft 0, pow 1 are the old step to the last bit; the shader reads them as uniforms, so they are live. 0 restores wave seventy-one's shader text and cache key exactly.
 * Browser: `?cornerAlpha=0`, `?cornerAlphaReach=`, `Dmax=`, `Wander=`, `Tail=`, `Soft=`, `Pow=` (`cornerAlpha` + name); node: `DD_CORNER_ALPHA=0`.
 */
export const CORNER_ALPHA = (typeof process !== 'undefined' && process?.env?.DD_CORNER_ALPHA !== undefined)
  ? Number(process.env.DD_CORNER_ALPHA) > 0 ? 1 : 0
  : (typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('cornerAlpha') === '0' ? 0 : 1);
export const CORNER_ALPHA_TUNE = Object.freeze((() => {
  const t = { reach: 0, dmax: 14, wander: 4, tail: 0.8, soft: 1, pow: 1 }; // the orchestrator's pick by eye, column D of the w72 sheet (`corner-alpha-sheet-b.jpg`); reach 0, dmax 0.6, wander 0, tail 0, soft 0 is the old step
  const q = typeof location !== 'undefined' && location?.search ? new URLSearchParams(location.search) : null;
  if (q) for (const k of Object.keys(t)) { const v = q.get('cornerAlpha' + k[0].toUpperCase() + k.slice(1)); if (v !== null && v !== '' && Number.isFinite(Number(v))) t[k] = Number(v); }
  return t;
})());
/** Live uniforms of CORNER_ALPHA (the objects the shader holds): write `.value` to retune without a reload. */
export const CORNER_ALPHA_UNIFORMS = Object.freeze({
  uCaReach: { value: CORNER_ALPHA_TUNE.reach }, uCaDmax: { value: CORNER_ALPHA_TUNE.dmax }, uCaWander: { value: CORNER_ALPHA_TUNE.wander },
  uCaTail: { value: CORNER_ALPHA_TUNE.tail }, uCaSoft: { value: CORNER_ALPHA_TUNE.soft }, uCaPow: { value: CORNER_ALPHA_TUNE.pow },
});
const CA_ZEDGE = SHORE.cornerMaskZ + SHORE.cornerMaskFeather * 0.9418; // the z where 1 - smoothstep(Z, Z + feather, z) falls to 0.01
// The two alpha blocks live out here so the GLSL literal below holds no nested template (water-modules lints for that).
const CA_ALPHA_GLSL_ON = `          // taste-w72 (CORNER_ALPHA): the lip rule hands over to seaFade through a ramp t (0 lip, 1 seaFade), not a step at cornerM 0.01.
          {
            float caMx = smoothstep(${(SHORE.cornerMaskX - SHORE.cornerMaskFeather).toFixed(1)}, ${Number(SHORE.cornerMaskX).toFixed(1)}, vSandWorld.x);
            float caN = 0.6 * ddsNoise(vec2(vSandWorld.z * 0.17, 5.3)) + 0.4 * ddsNoise(vec2(vSandWorld.z * 0.53, 9.7));
            float caTa = (uCaSoft > 0.0) ? 1.0 - smoothstep(0.0, uCaSoft, cornerM - 0.02 * uCaWander * caN) : 1.0 - step(0.01, cornerM);
            float caTb = 1.0;
            if (cornerM <= 0.01 && caMx > 0.01 && uCaReach > 0.0) {
              caTb = smoothstep(0.0, uCaReach, vSandWorld.z - ${CA_ZEDGE.toFixed(3)} - uCaWander * caN);
            }
            float caT = min(caTa, caTb);
            float caD = mix(${Number(SHORE.cornerLipTo).toFixed(2)}, max(uCaDmax, ${Number(SHORE.cornerLipTo).toFixed(2)}), pow(caT, uCaPow));
            float caLip = 1.0 - smoothstep(${Number(SHORE.cornerLipFrom).toFixed(2)}, ${Number(SHORE.cornerLipTo).toFixed(2)}, frontF * (${Number(SHORE.cornerLipTo).toFixed(2)} / caD) + edgeWob * 0.08);
            float caE = 1.0 - smoothstep(uCaTail, 1.0, caT);
            float caAlpha = (frontF < ${Number(SHORE.cornerLipFrom).toFixed(2)}) ? 1.0 : min(diffuseColor.a, caLip);
            diffuseColor.a = mix(diffuseColor.a, caAlpha, caE);
          }
`;
const CA_ALPHA_GLSL_OFF = `          if (cornerM > 0.01) {
            if (frontF < ${Number(SHORE.cornerLipFrom).toFixed(2)}) {
              diffuseColor.a = 1.0;
            } else {
              diffuseColor.a = min(diffuseColor.a, lipFade);
            }
          }
`;
export const SAND_HUES = Object.freeze({
  dry: '#c9b489',
  pale: '#d4c49a',
  damp: '#a58c62',
  wet: '#8a7852',
});

/**
 * P13-W4 sand contract.
 *
 * The W2 wind ripple was gated the wrong way round. Its footprint window was
 * LOOSENED (`ddPxS / λ ∈ [0.22, 0.55]`) so a 0.9 m train would survive to board
 * distance, and it did: the R4 blind pack read `beach-corner` and
 * `corner-close` as "repetitive sand ridges dominate the frame". Dry sand from
 * forty to ninety metres up is a soft matte field. Ripples are a one-to-two
 * metre fact. So visibility here is keyed on the CAMERA DISTANCE to the
 * fragment, the bearing swings through a low-frequency direction field, the
 * amplitude mottles to zero and back, and the three whole-beach value fields
 * share one softly-capped budget.
 *
 * `shore.js` is outside this lane's file list, so the W4 numbers live in the
 * sand module. SHORE keeps every W2 / W3 value it was pinned to.
 */
export const SAND_W4 = Object.freeze({
  /** Item 1 — ripple visibility against camera distance (metres). */
  rippleNear: 12,
  rippleQuarter: 40,
  rippleGone: 85,
  rippleFarKeep: 0.25,
  /** Item 1 — direction field: ± degrees over a 22 / 30 m cell. */
  rippleTurnDeg: 25,
  rippleTurnA: 0.045,
  rippleTurnB: 0.033,
  /** Item 1 — amplitude mottling: 0..1 over a 13 / 19 m cell. */
  rippleMottA: 0.075,
  rippleMottB: 0.052,
  /** Item 1 — total value swing of grain + ripple + mottle, softly capped. */
  microCap: 0.05,
  rippleRelief: 0.011,
  /** Item 1 — the tonal cast a rippled patch keeps once its phase is gone. */
  rippleCastAmt: 0.028,
  /**
   * The mean the ripple RELIEF was worth. Crests tip toward the sun and lees
   * stay carried by the ambient, so rippled dry sand renders about 1.6 %
   * brighter than the same sand smooth. Deleting the corduroy takes that value
   * with it — measured on the W3 mid-beach dry windows, whose difference image
   * has no spectral content but the 0.83-0.88 m ripple. Handed back as a flat
   * tone, crossfaded on the same camera-distance law, so what leaves is the
   * stripe and not the beach's value; because the crossfade conserves the mean,
   * zooming in trades the tone back for the stripes rather than stepping.
   *
   * The number is LINEAR and the receipt is sRGB, so it reads about 2.4x
   * smaller in the luma windows: 0.045 linear is ~1.2 % of measured luma.
   * Not part of the +-5 % SWING budget: it is a constant and adds no
   * structure of its own.
   */
  rippleReliefDc: 0.045,
  /** Item 2 — broad value bands, keyed on metres from the berm crest. */
  troughAt: -4.6,
  troughHalfW: 2.4,
  troughAmt: 0.055,
  bermPaleAt: -1.5,
  bermPaleHalfW: 2.6,
  bermPaleAmt: 0.15,
  /** Item 2 — damp band: a step darker than the berm, soft on both edges. */
  dampFrom: -9.5,
  dampTo: -2.6,
  dampAmt: 0.15,
  /** Item 2 — the two tide threads are faint, not scored lines. */
  driftAmtScale: 0.66,
  /** Item 2 — blown-out pale sand beside a walked lane. */
  blownAmt: 0.22,
  /** Item 4 — desire paths: 1.24–1.92 m lanes, stairs and kiosk to the water. */
  pathHalfMin: 0.62,
  pathHalfVar: 0.34,
  pathFrom: -34,
  pathTo: 2.6,
  pathDark: 0.115,
  pathRough: 0.70,
  /** Item 4 — single prints are a 25 m fact. */
  printNear: 15,
  printFar: 25,
  /** Item 3 — wet sand holds a roughness floor; the highlight is Fresnel. */
  wetRoughFloor: 0.35,
  skyTint: '#93a8bc',
  skyGain: 0.85,
  /** Item 5 — the pool has to read as water in sand from directly above. */
  poolFill: 0.95,
  poolDarken: 0.22,
  poolRimDark: 0.65,
  // P22: contiguous water and a narrow, finite wet edge; no detached halo.
  poolEdgeInner: 0.70,
  poolEdgeOuter: 0.84,
  poolRimWidth: 0.12,
  poolOuterLimit: 0.35,
});

/**
 * PM11 dry-plate contract. Albedo structure lives only at 3–8 m; all smaller
 * grain/ripple/shell energy stays in the normal-relief path. The values are
 * exported so the lint can measure the plate rather than trusting comments.
 */
export const SAND_PM11 = Object.freeze({
  toneScalesM: [3.2, 5.6, 7.8],
  toneGain: 0.055,
  legacyToneGain: 0.155,
  requiredStdReduction: 0.35,
  reliefWavelengthM: 0.30,
  reliefAmplitudeM: 0.012, // base field; L3 halves the corner's final relief gradient
  dryAlbedoGrain: 0,
});

/**
 * P13-A8 item 1a — THE SHORELINE IS NEVER ONE PIXEL.
 *
 * R6 carried two standing vetoes on the same object: at `oil-sea` and at
 * `user-corner` the wrap front is a single-pixel cut from tan sand to navy
 * water. Measured on the a7 plates with `shots-A8-wip/shoreline-scan.py` — the
 * 10 % → 90 % crossing of `(R − B)` along the local edge normal — the join is
 * **1.75 px median at oil-sea** and **5.0 px at user-corner**, on scans whose
 * two plateaus are 0.25 and −0.35 apart.
 *
 * The cause is not the alpha law, which is why widening it is not the fix.
 * W3's fragment lip is 0.6 m and analytic, and W3 was right to make it narrow:
 * the 8 m vertex lip it replaced was the cream fan. What is missing is that
 * `SHORE.cornerWetGain` is **0.40** inside the mask — W3 dialled the corner's
 * own wet band back to four tenths to kill that fan — so the last two metres of
 * sand before the water are still dry-tan, and the whole colour swing has to
 * happen inside the 0.6 m dissolve. The beach reads dry right up to the navy.
 *
 * So the transition is put back where a beach keeps it: INLAND of the front,
 * opaque, at full resolution, in three named bands.
 *
 *   wetFrom −2.6 → wetTo −0.9   darker, glossier wet sand (the wet gradient)
 *   swashFrom −1.45 → 0.0       a translucent film of water over sand
 *   foam, straddling the front  broken threads of run-up white
 *   then W3's 0.6 m dissolve, unchanged, into the ocean
 *
 * The alpha law, the 0.04 m seaward cap, the mask, W4's value bands and the
 * ripple law are all untouched: `SHORE.cornerLipFrom` / `cornerLipTo` still
 * read 0 and 0.6 and `p13-diag-fan.mjs` was re-run to prove the fan did not
 * come back. Everything below multiplies by `cornerM`, so mid-beach is not on
 * this path at all.
 */
export const SAND_A8 = Object.freeze({
  /**
   * Wet gradient: metres of wrap-front over which sand goes damp then wet.
   *
   * P16-PM1 moved `wetTo` from −1.55 to −2.30. These bands were graded while
   * the corner shelf stood 0.11–0.28 m proud of the drawn sheet across a
   * four-metre terrace (see SAND_PM1), so all of them painted on sand that was
   * not at the water and none of them could be read on a plate. With the datum
   * on the sheet the saturated band is `|wetTo|` metres wide at the waterline:
   * 2.30 m, inside the 2–3 m the section asks for, with the swash film and the
   * foam threads lying on it rather than beside it.
   */
  wetFrom: -4.0,
  wetTo: -2.30,
  wetAmt: 0.95,
  /**
   * ── P16-PM13B item 5 — THE BAND READS, MEASURED IN LUMA. ──
   *
   * PM1b residual 12 and the blind seat both say the wet band is faint, and
   * `shots-PM13B-wip/wetband.py` puts a number on it: on `a12after-corner-close`
   * the median sand 10 px landward of the water is 122.4 against 128.3 for the
   * backshore 55 px landward — **5.9 luma of separation**, and 9.0 on
   * `beach-corner`. The brief asks for 12.
   *
   * Raising `wetAmt` alone does not get there, and the reason is what the mix
   * is: `mix(col, uSandWet, x)` pulls the sand toward #6a5040, which is a HUE
   * change as much as a value change, and the standard-lit shelf then takes a
   * near-vertical key that puts most of the value back. Saturated sand is
   * darker than dry sand at every hue because the water fills the voids between
   * grains and light that would have scattered back off them does not. That is
   * a multiply, not a lerp, so there is one here — applied after the two tint
   * mixes and BEFORE the foam, which is mixed further down and therefore still
   * sits white on top of it.
   */
  wetDarken: 0.86,
  /**
   * ── THE BAND WAS DEEP ENOUGH AND FAR TOO NARROW. ──
   *
   * Profiling the frame rather than the constants settled this. Median sand
   * luma against distance landward of the water edge, `a12after-beach-corner`,
   * 1,200 columns: 112.7 at the edge, 121.3 at 10 px, 137.0 at 30 px, then flat
   * to 86 px. So the wet band ALWAYS separated by 25 luma at its darkest — it
   * simply ran out inside 30 px. At this pose the ground is seen at 36°, so the
   * saturated 2.30 m projects to about 35 px and the whole of it is inside that
   * ramp; there was no damp fringe landward of it at all, and a beach that goes
   * from saturated to bone dry in a metre reads as a painted edge.
   *
   * `wetFrom`/`wetTo` are pinned to a 1.5–2.6 m span by `p13-sand-corner`, and
   * that pin is right: the SATURATED band is 2.30 m. This is the fourth band,
   * landward of it — the damp backshore the last high tide left, 3.8 m of it,
   * at a third of the wet band's strength.
   */
  backFrom: -6.40,
  backTo: -3.10,
  /**
   * ── AND THE CONTROLLED A/B SAYS THE FRINGE COSTS MORE THAN IT PAYS. ──
   * Two shoots of the same geometry with only these five numbers changed
   * (`pm13bsandoff-*` against `pm13b-*`): at `beach-corner` the fringe deepens
   * the waterline edge from 16.2 to 19.7 luma of separation and FLATTENS the
   * band's body from 4.8 to 1.3, because the damp backshore it paints is the
   * very sand the band is being measured against. A wider gradient and a
   * shallower step is the wrong trade for a band the audit calls faint. Zero,
   * kept as a named number rather than deleted, because the next lane will
   * reach for it and should read this first.
   */
  backAmt: 0.0,
  backDarken: 1.0,
  /**
   * Swash: a film of water over sand. It saturates at `swashTo` and STAYS
   * saturated seaward of it, which is not a detail.
   *
   * ── WHY THE BANDS SIT WHERE THEY DO, MEASURED RATHER THAN CHOSEN. ──
   * The first pass put the film's full strength at the waterline (−0.05 m) and
   * the frame came back barely changed. `shots-A8-wip/edge-world.py`
   * inverse-projects the VISIBLE sand boundary at `oil-sea` through P13-W4's
   * camera model and evaluates the wrap front on it: across the veto box the
   * last sand pixel sits at front **−0.64 to +0.41**, and over most of the box
   * it is NEGATIVE. The ocean surface, which carries its own swell, takes the
   * last half-metre of a shelf that W3 caps at y ≤ 0.04 out there — so any band
   * authored inside the final 0.6 m of front is drawn where nothing is drawn.
   * Everything therefore saturates by −0.95 m and the foam holds out to the cut.
   */
  swashFrom: -1.75,
  swashTo: -0.95,
  swashAmt: 0.86,
  swashTint: '#2f4a52',
  /** How far the run-up line wanders, in metres, so it is not a circle. */
  runupWobble: 0.42,
  /**
   * Foam: threads of white that rise through the run-up and hold to the cut,
   * so whatever the water leaves visible is foam and not dry sand.
   */
  foamFrom: -1.60,
  foamMid: -0.75,
  foamTo: 0.15,
  foamFade: 0.90,
  foamAmt: 0.62,
  foamTint: '#e8eeee',
  /** Roughness the swash film runs at. Above W4's 0.35 floor by construction. */
  swashRough: 0.36,
});

/**
 * P16-W10 beach close-read. The sub-metre W4 ripple remains camera-filtered;
 * this adds a much broader, warped wind organisation that survives the plate
 * without becoming corduroy, plus the compacted trace left when individual
 * footprints have become sub-pixel. Frequencies are deliberately
 * incommensurate, so a 20 m offset cannot reproduce the field.
 */
export const SAND_W10 = Object.freeze({
  wetSkyGain: 0.96,
  plateRippleM: 4.70,
  plateCrossM: 7.30,
  plateRippleAmt: 0.014,
  trafficTraceAmt: 0.085,
  foamCrestFloor: 0.62,
  foamSpumeAmt: 0.32,
});

/**
 * P19-W15 beach landform. A shore-parallel dune ridge (0.8–1.5 m) behind the
 * berm, tussock grass on the crest, extra rock-pool dishes at the headland.
 * Landward of front −26 stays the prop datum (free gate). W10 wet band kept.
 */
export const SAND_W15 = Object.freeze({
  ridgeFront: -17.5,
  ridgeWander: 3.2,
  ridgeH0: 0.86,
  ridgeH1: 1.42,
  ridgeHalfW: 5.4,
  tussockH: 0.22,
  grassFromH: 0.62,
  grassToH: 1.12,
  grassAmt: 0.36,
  pool2Along: 14.5,
  pool2Shore: 9.4,
  pool2R: 2.15,
});

/**
 * ── P16-PM1 — ONE SECTION DATUM. ──
 *
 * The corner beach was a PLATEAU with a cliff, and the cause was one term with
 * no `front` gate in it. `ddCornerPad` added a flat `SHORE.cornerWrapLift`
 * (0.22 m) to the whole wrap cap — dry backshore, waterline and open water
 * alike — and `ddCornerSeaCap` then clamped the result back to world 0.04 over
 * 0.55 m of front. Measured on the live shelf by GPU readback
 * (`shots-PM1-wip/section.mjs`, 4 transects × 89 samples, before the fix):
 *
 *   bearing 0.55  front −2.5 … +2.0  y 0.588 → 0.296   (4.5 m of level sand)
 *   bearing 0.95  front  0.0         y 0.270           (0.107 m OVER the sea)
 *   bearing 0.95  front +2.0 → +2.5  y 0.188 → −0.012  (0.20 m in 0.5 m, 1:2.5)
 *
 * The drawn harbour sheet is 0.1628. So the sand stood a quarter of a metre
 * proud of the water across a four-metre terrace and then fell off a 1:2.5
 * face — which is the "raised sand plateau with a vertical cliff" and the
 * "pale shelf plane" in one object. Everything keyed on `front` (A8's wet
 * gradient, the swash film, the foam threads) painted on that terrace, i.e.
 * on sand that was nowhere near the water, which is why the corner has never
 * shown a wet band or a foam line however they were graded.
 *
 * The datum below replaces the flat lift with a WATERLINE-REFERENCED one:
 * full 0.22 on the dry backshore (so every prop, the promenade toe and A9's
 * 123 civilians keep the ground they were placed on), exactly `SEA_TOP` at
 * front 0, and gone by `padSeaTo` so the shelf dives under the sheet instead
 * of being clamped to it.
 */
export const SAND_PM1 = Object.freeze({
  /**
   * The drawn top of the harbour sheet the corner beach meets, in world Y.
   * DERIVED, not chosen: it is `harbourPeakYAt(0, 0)` from `outer-ocean.js`,
   * the CPU mirror of the ocean's vertex envelope inside
   * `PAINTED.harbourShelterTo`, measured at 0.1628 in P13-A11. It is a literal
   * here rather than an import because `outer-ocean.js` imports this module —
   * `p13-sand-corner.test.mjs` pins the two together so it cannot drift.
   */
  seaTop: 0.1628,
  /** Clearance the shelf keeps under the sheet at the waterline (metres). */
  seaClear: 0.008,
  /** Front at which the backshore lift is still the full `cornerWrapLift`. */
  padLandFrom: -12,
  /** Front by which the lift is gone and the shelf is bare bathymetry. */
  padSeaTo: 3.0,
  /**
   * Seaward ceiling slope. The old ceiling was a STEP (a flat 0.04 reached over
   * 0.55 m); this one starts at the sheet and falls, so the shelf can only ever
   * go down from the water and can never present a flat pale plate under it.
   * 1:10 is inside the brief's 1:8–1:12 band and clears `cornerSeawardMaxY`
   * (0.04) by front 1.23 m, so W3's contract still holds where it was aimed.
   */
  seawardFall: 0.10,
  /**
   * Landward arm of the same ceiling, 1:8 — the steepest a beach face gets, and
   * the slope W4's own scarp already runs at (`uScarpDrop` 0.50 over
   * `uScarpLen` 4.40).
   *
   * It is here because the pad was not the only term with no waterline in it.
   * `uCuspAmp` is 0.175 and `cuspEnv` is 1.0 at front 0, so the cusps put up to
   * ±0.21 m of VERTICAL wander on the waterline. Against a displaced open-bay
   * ocean that is a horn and an embayment; against the harbour's flat 0.1628
   * sheet it is a fifth of a metre of tan sand standing over navy water, which
   * is the rest of the terrace the plates show. Clipping the last 1.2 m to a
   * 1:8 face costs the sub-metre scallop inside the corner mask and keeps the
   * waterline's real ±3 m meander, which comes from `ddCoastLine` and is
   * already inside `front`.
   */
  landwardRise: 0.125,
  /** Front over which the ceiling comes in. It bites only at the waterline. */
  seaCapFrom: -1.2,
  seaCapTo: 0.0,
});

/** Extra shelf built past the requested seaward edge, purely so the alpha
 *  dissolve into the water has room to be long and soft instead of a ruler. */
const SEAWARD_APRON = 18;

/** Deepest the shelf is allowed to sink (metres below SAND_Y). W14-B: the
 *  submerged face is the 1 in 15 continuation of the beach (`SURF.bed`, 0.066
 *  m per metre to 1.3 m of water), so the lowest bed is 1.3 m under the sheet
 *  plus the 0.04 m the sheet stands over SAND_Y; the floor sits 6 cm under it.
 *  It used to be -0.66 and the sand under the sea was 0.1 to 0.3 m deep for its
 *  first 12 m, which no opacity curve could ever colour. */
const BED_FLOOR = -(SAND_Y - WATER_Y) - SURF.bed.shelfCap - 0.06;

/** W14-B: the shallow water token (ramp stop 0) as a GLSL literal, converted
 *  the way this file's own `srgb()` converts every palette colour, so it sits
 *  with SAND_HUES instead of a gamma brighter. */
const SWASH_SHALLOW_GLSL = (() => {
  const c = new THREE.Color(WATER_LAW.ramp[0][1]).convertSRGBToLinear();
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
})();

/** W14-B submerged face: water depth at `front` metres seaward of the still
 *  waterline, shared by the vertex program and its CPU twin. */
const SHELF_FACE = Object.freeze({
  slope: SURF.bed.shelfSlope,
  cap: SURF.bed.shelfCap,
  /** Metres over which the dry profile hands over to the face. */
  blend: 4.0,
});

/**
 * Along-extent of the last shelf built. `makeSandMaterial` uses it to place the
 * desire paths at the seawall stair bays; water.js builds geometry then
 * material in one synchronous pass, so this is always current. Passing
 * `alongLength` into `makeSandMaterial` overrides it — see the build report for
 * the contract ask that would remove this coupling.
 */
let lastAlongLength = 292;

/** Deterministic 0..1 hash. No RNG call — plates must reproduce. */
function hash01(i, salt) {
  const n = Math.sin((i + 1.17) * 12.9898 + salt * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Instanced-style rocks + tussock cones in the shelf local frame
 * (X = along from origin, Z = seaward). East-bay NE wrap sits at
 * along ≳ 128. Shader discards these fragments outside the P13 mask
 * so a south-water city does not grow stones on the SE beach.
 *
 * kind 1 = rock, kind 2 = tussock, kind 3 = wading child spike.
 */
function buildCornerPropArrays(alongLength) {
  const pos = [];
  const uv = [];
  const beach = [];
  const kind = [];
  const idx = [];
  const half = alongLength / 2;
  const inSpan = (along, shore) => along > -half + 2 && along < half - 2 && shore > 1.2 && shore < 58;

  const pushV = (x, y, z, k) => {
    pos.push(x, y, z);
    uv.push(0, 0);
    beach.push(0, 0);
    kind.push(k);
  };

  // Local (along, shore). East-bay wrap: along = 136 + extra.
  // Seats sit on wrap-front ≈ −3 (wet band, still opaque inside the lip).
  const rockSeeds = [
    [142.2, 44.1, 0.62, 0.48],
    [146.4, 43.4, 0.78, 0.42],
    [150.1, 42.2, 0.52, 0.58],
    [154.3, 40.7, 0.44, 0.36],
    [148.6, 41.6, 0.68, 0.50],
  ];
  const nRock = Math.min(SHORE.cornerRockCount ?? 5, rockSeeds.length);
  for (let r = 0; r < nRock; r += 1) {
    const [a0, s0, rad, ht] = rockSeeds[r];
    const along = a0 + (hash01(r, 3.1) - 0.5) * 0.8;
    const shore = s0 + (hash01(r, 7.7) - 0.5) * 0.6;
    if (!inSpan(along, shore)) continue;
    const rx = rad * (0.82 + 0.28 * hash01(r, 11.2));
    const rz = rad * (0.70 + 0.30 * hash01(r, 13.9));
    const hy = ht * (0.88 + 0.22 * hash01(r, 17.4));
    const yaw = hash01(r, 23.0) * Math.PI * 2;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const eq = [];
    for (let k = 0; k < 4; k += 1) {
      const ang = k * Math.PI * 0.5 + 0.18;
      const ex = Math.cos(ang) * rx;
      const ez = Math.sin(ang) * rz;
      eq.push([ex * cy + ez * sy, ez * cy - ex * sy]);
    }
    const i0 = pos.length / 3;
    pushV(along, hy, shore, 1);
    pushV(along, 0.02, shore, 1);
    for (let k = 0; k < 4; k += 1) pushV(along + eq[k][0], hy * 0.38, shore + eq[k][1], 1);
    const top = i0;
    const bot = i0 + 1;
    const e0 = i0 + 2;
    idx.push(top, e0, e0 + 1, top, e0 + 1, e0 + 2, top, e0 + 2, e0 + 3, top, e0 + 3, e0);
    idx.push(bot, e0 + 1, e0, bot, e0 + 2, e0 + 1, bot, e0 + 3, e0 + 2, bot, e0, e0 + 3);
  }

  const nTuss = SHORE.cornerTussockCount ?? 14;
  for (let t = 0; t < nTuss; t += 1) {
    const u = t / Math.max(nTuss - 1, 1);
    const extra = 2.2 + u * 17.5;
    const along = 136.0 + extra + (hash01(t, 31.0) - 0.5) * 1.4;
    const inner = 35.6;
    const shore = Math.sqrt(Math.max(inner * inner - extra * extra, 16))
      + (hash01(t, 37.2) - 0.5) * 1.1;
    if (!inSpan(along, shore)) continue;
    const rad = 0.18 + 0.11 * hash01(t, 41.5);
    const ht = 0.28 + 0.16 * hash01(t, 43.8);
    const i0 = pos.length / 3;
    const ring = 6;
    pushV(along, ht, shore, 2);
    for (let k = 0; k < ring; k += 1) {
      const ang = (k / ring) * Math.PI * 2 + hash01(t, 47.1);
      const rr = rad * (0.72 + 0.40 * hash01(t * 10 + k, 51.0));
      pushV(along + Math.cos(ang) * rr, 0.0, shore + Math.sin(ang) * rr, 2);
    }
    for (let k = 0; k < ring; k += 1) {
      idx.push(i0, i0 + 1 + k, i0 + 1 + ((k + 1) % ring));
    }
  }

  // Pool-rim rocks (kind 1). Seat is the tidal dish, not the wrap wet band.
  const wrapR = SHORE.cornerWrapR ?? 140;
  const alongHalfM = Math.max((alongLength - wrapR) * 0.5, 8);
  const poolA = alongHalfM + Number(SHORE.cornerPoolAlong);
  const poolS = Number(SHORE.cornerPoolShore);
  const poolR = Number(SHORE.cornerPoolR);
  const nPoolRock = SHORE.cornerPoolRimRocks ?? 4;
  const rimSeeds = [
    [0.18, 0.52, 0.38],
    [1.12, 0.44, 0.34],
    [2.35, 0.58, 0.42],
    [4.05, 0.48, 0.36],
    [5.20, 0.40, 0.30],
  ];
  for (let r = 0; r < nPoolRock; r += 1) {
    const [ang0, radMul, ht] = rimSeeds[r % rimSeeds.length];
    const ang = ang0 + hash01(r, 61.0) * 0.22;
    const rr = poolR * (0.78 + 0.16 * radMul) + (hash01(r, 67.2) - 0.5) * 0.35;
    const along = poolA + Math.cos(ang) * rr;
    const shore = poolS + Math.sin(ang) * rr * 0.72;
    if (!inSpan(along, shore)) continue;
    const rx = 0.34 + 0.16 * hash01(r, 71.4);
    const rz = 0.28 + 0.14 * hash01(r, 73.8);
    const hy = ht * (0.90 + 0.18 * hash01(r, 79.1));
    const yaw = hash01(r, 83.0) * Math.PI * 2;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const eq = [];
    for (let k = 0; k < 4; k += 1) {
      const a = k * Math.PI * 0.5 + 0.22;
      const ex = Math.cos(a) * rx;
      const ez = Math.sin(a) * rz;
      eq.push([ex * cy + ez * sy, ez * cy - ex * sy]);
    }
    const i0 = pos.length / 3;
    pushV(along, hy, shore, 1);
    pushV(along, 0.02, shore, 1);
    for (let k = 0; k < 4; k += 1) pushV(along + eq[k][0], hy * 0.40, shore + eq[k][1], 1);
    const top = i0;
    const bot = i0 + 1;
    const e0 = i0 + 2;
    idx.push(top, e0, e0 + 1, top, e0 + 1, e0 + 2, top, e0 + 2, e0 + 3, top, e0 + 3, e0);
    idx.push(bot, e0 + 1, e0, bot, e0 + 2, e0 + 1, bot, e0 + 3, e0 + 2, bot, e0, e0 + 3);
  }

  // Wading child: kind-3 spike in the dish. Deterministic seat on the rim.
  const nChild = SHORE.cornerChildCount ?? 1;
  for (let c = 0; c < nChild; c += 1) {
    const along = poolA + 0.85 + (hash01(c, 91.0) - 0.5) * 0.4;
    const shore = poolS - 0.55 + (hash01(c, 97.3) - 0.5) * 0.3;
    if (!inSpan(along, shore)) continue;
    const ht = 0.78;
    const rad = 0.11;
    const i0 = pos.length / 3;
    const ring = 5;
    pushV(along, ht, shore, 3);
    for (let k = 0; k < ring; k += 1) {
      const ang = (k / ring) * Math.PI * 2 + 0.31;
      pushV(along + Math.cos(ang) * rad, 0.02, shore + Math.sin(ang) * rad, 3);
    }
    for (let k = 0; k < ring; k += 1) {
      idx.push(i0, i0 + 1 + k, i0 + 1 + ((k + 1) % ring));
    }
  }

  return {
    count: pos.length / 3,
    pos: new Float32Array(pos),
    uv: new Float32Array(uv),
    beach: new Float32Array(beach),
    kind: new Float32Array(kind),
    idx: new Uint32Array(idx),
  };
}

/**
 * Beach shelf geometry: a graded strip from the wall toe out past the
 * waterline, dense where the berm, cusps and swash live and coarse elsewhere.
 *
 * @param {{ alongLength: number, inland: number, seaward: number, quality?: string }} o
 */
function buildAlongXs(alongLength, quality) {
  // W14-B: columns are 1.6 m on the straight and 0.8 m only where the wrap lip
  // lives (the board end plus the 50 m of arc past it); the far tail of the cap
  // is seabed and takes 2 m. The vertex normal is analytic, so shading does not
  // coarsen with the grid.
  const half = alongLength / 2;
  const wrapStep = quality === 'low' ? 1.3 : quality === 'medium' ? 0.95 : 0.8;
  const midStep = quality === 'low' ? 3.0 : quality === 'medium' ? 2.3 : 2.0;
  const tailStep = quality === 'low' ? 3.2 : quality === 'medium' ? 2.6 : 2.0;
  const wrapR = SHORE.cornerWrapR ?? 140;
  const boardHalf = Math.max((alongLength - wrapR) * 0.5, 8);
  const fineFrom = Math.min(half - 4, boardHalf - 6);
  const fineTo = Math.min(half - 4, boardHalf + 54);
  /** @type {number[]} */
  const xs = [];
  const pushRange = (x0, x1, step) => {
    const n = Math.max(1, Math.ceil((x1 - x0) / step));
    for (let i = 0; i < n; i += 1) xs.push(x0 + (x1 - x0) * (i / n));
  };
  pushRange(-half, -fineTo, tailStep);
  pushRange(-fineTo, -fineFrom, wrapStep);
  pushRange(-fineFrom, fineFrom, midStep);
  pushRange(fineFrom, fineTo, wrapStep);
  pushRange(fineTo, half, tailStep);
  xs.push(half);
  const out = [];
  for (let i = 0; i < xs.length; i += 1) {
    const x = xs[i];
    if (!out.length || Math.abs(x - out[out.length - 1]) > 0.18) out.push(x);
  }
  if (out[0] > -half + 0.01) out.unshift(-half);
  if (out[out.length - 1] < half - 0.01) out.push(half);
  return out;
}

function wrapFrontLocal(along, shore, alongHalfM) {
  const extra = Math.abs(along) - alongHalfM;
  if (extra <= 0) return shore - WATER_FACE;
  return Math.hypot(extra, shore) - WATER_FACE;
}

/**
 * Max adjacent spacing of wrap-cap verts near the waterline. Used to prove
 * the polar lip is not a 4 m n-gon.
 */
export function wrapMaxVertexSpacing(geom, alongLength) {
  const pos = geom.getAttribute('position').array;
  const kind = geom.getAttribute('aSandKind')?.array;
  const idx = geom.getIndex()?.array;
  const wrapR = SHORE.cornerWrapR ?? 140;
  const alongHalfM = Math.max((alongLength - wrapR) * 0.5, 8);
  const n = pos.length / 3;
  const onLip = new Uint8Array(n);
  let count = 0;
  for (let i = 0; i < n; i += 1) {
    if (kind && kind[i] > 0.5) continue;
    const x = pos[i * 3];
    const z = pos[i * 3 + 2];
    const extra = Math.abs(x) - alongHalfM;
    if (extra <= 0.05) continue;
    const front = wrapFrontLocal(x, z, alongHalfM);
    if (Math.abs(front) > 2.4) continue;
    onLip[i] = 1;
    count += 1;
  }
  let maxD = 0;
  let pairs = 0;
  if (idx) {
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t];
      const b = idx[t + 1];
      const c = idx[t + 2];
      const edges = [[a, b], [b, c], [c, a]];
      for (const [i, j] of edges) {
        if (!onLip[i] || !onLip[j]) continue;
        const d = Math.hypot(
          pos[i * 3] - pos[j * 3],
          pos[i * 3 + 2] - pos[j * 3 + 2],
        );
        if (d <= 0.02) continue;
        maxD = Math.max(maxD, d);
        pairs += 1;
      }
    }
  }
  return { max: maxD, count, pairs };
}

export function buildBeachGeometry({ alongLength, inland, seaward, quality = 'high' }) {
  // W14-B row stations, in shore-metres. The shelf used to be 0.27 by 1.08 m
  // (210,581 triangles) for a height field whose finest term is a 3.5 m bench.
  // `back` and `active` are PITCHES in metres. The backshore is flat sand but
  // the wrap cap's waterline arc crosses it (the cap circle meets the wall at
  // shore 0.5), so its rows stay about 0.9 m for the 1.5 m lip-spacing pin.
  const tier = quality === 'low'
    ? { back: 1.5, active: 1.4, mid: 3, off: 4 }
    : quality === 'medium'
      ? { back: 1.05, active: 1.0, mid: 4, off: 5 }
      : { back: 1.0, active: 0.9, mid: 6, off: 6 };

  // Three bands: a backshore under the props, an active band either side of
  // the waterline (ridge, berm, face, swash, first metres under water), then a
  // coarsening offshore apron that only exists to carry the alpha dissolve.
  const activeIn = Math.max(inland + 1, WATER_FACE - 26);
  const midIn = WATER_FACE + 2.4;
  const activeOut = WATER_FACE + 12;
  const outer = seaward + SEAWARD_APRON;
  /** @type {number[]} */
  const stations = [];
  const nBack = Math.max(2, Math.ceil((activeIn - inland) / tier.back));
  for (let i = 0; i < nBack; i += 1) {
    stations.push(inland + (activeIn - inland) * (i / nBack));
  }
  const nActive = Math.max(2, Math.ceil((midIn - activeIn) / tier.active));
  for (let i = 0; i <= nActive; i += 1) {
    stations.push(activeIn + (midIn - activeIn) * (i / nActive));
  }
  for (let i = 1; i <= tier.mid; i += 1) {
    stations.push(midIn + (activeOut - midIn) * (i / tier.mid));
  }
  for (let i = 1; i <= tier.off; i += 1) {
    stations.push(activeOut + (outer - activeOut) * (i / tier.off) ** 1.6);
  }

  const alongXs = buildAlongXs(alongLength, quality);
  const rows = stations.length;
  const cols = alongXs.length;
  const alongSegs = cols - 1;
  const positions = new Float32Array(cols * rows * 3);
  const uvs = new Float32Array(cols * rows * 2);
  const beach = new Float32Array(cols * rows * 2);
  const half = alongLength / 2;

  for (let r = 0; r < rows; r += 1) {
    const s = stations[r];
    const v = r / (rows - 1);
    for (let c = 0; c < cols; c += 1) {
      const u = (alongXs[c] + half) / Math.max(alongLength, 1e-6);
      const i = r * cols + c;
      // Break the regular lattice so a grazing plate cannot read as pavers.
      // Wrap-cap jitter is smaller so the circular iso-front stays smooth.
      const jit = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453;
      const j = jit - Math.floor(jit);
      const wrapJ = Math.abs(alongXs[c]) > half * 0.62 ? 0.12 : 0.42;
      positions[i * 3] = alongXs[c] + (j - 0.5) * wrapJ;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = s + (j - 0.5) * (wrapJ * 0.5);
      uvs[i * 2] = u;
      uvs[i * 2 + 1] = v;
      beach[i * 2] = u;
      beach[i * 2 + 1] = v;
    }
  }

  const indices = new Uint32Array((rows - 1) * alongSegs * 6);
  let w = 0;
  for (let r = 0; r < rows - 1; r += 1) {
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

  const extra = buildCornerPropArrays(alongLength);
  const nShelf = cols * rows;
  const nAll = nShelf + extra.count;
  const posAll = new Float32Array(nAll * 3);
  posAll.set(positions);
  posAll.set(extra.pos, nShelf * 3);
  const uvAll = new Float32Array(nAll * 2);
  uvAll.set(uvs);
  uvAll.set(extra.uv, nShelf * 2);
  const beachAll = new Float32Array(nAll * 2);
  beachAll.set(beach);
  beachAll.set(extra.beach, nShelf * 2);
  const kindAll = new Float32Array(nAll);
  kindAll.set(extra.kind, nShelf);
  const idxAll = new Uint32Array(indices.length + extra.idx.length);
  idxAll.set(indices);
  for (let i = 0; i < extra.idx.length; i += 1) idxAll[indices.length + i] = extra.idx[i] + nShelf;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(posAll, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvAll, 2));
  geometry.setAttribute('aBeach', new THREE.BufferAttribute(beachAll, 2));
  geometry.setAttribute('aSandKind', new THREE.BufferAttribute(kindAll, 1));
  geometry.setIndex(new THREE.BufferAttribute(idxAll, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  if (!geometry.boundingSphere || !Number.isFinite(geometry.boundingSphere.radius)) {
    geometry.boundingSphere = geometry.boundingSphere || new THREE.Sphere();
    geometry.boundingSphere.center.set(0, 0.2, 30);
    geometry.boundingSphere.radius = 420;
  }
  geometry.userData.beachVertexCount = nAll;
  geometry.userData.beachTriangleCount = (rows - 1) * alongSegs * 2 + extra.idx.length / 3;
  geometry.userData.cornerPropCount = extra.count;
  const wrapSpace = wrapMaxVertexSpacing(geometry, alongLength);
  geometry.userData.wrapMaxSpacing = wrapSpace.max;
  geometry.userData.wrapSpacingCount = wrapSpace.count;
  lastAlongLength = alongLength;
  return geometry;
}

/**
 * Precision-safe noise for the sand.
 *
 * The contract's ddHash21 multiplies its input by 233.34 / 851.73 BEFORE the
 * fract. The shore frame runs to about 272 m along and 80 m seaward, so a band
 * scaled to 17 cycles per metre hands the hash a lattice index near 4600, and
 * 4600 x 233 lands at 1.1e6 — where a float32 has roughly eight distinct
 * fractional values left. The hash stops being a hash and becomes a regular
 * lattice, which is what put a woven diagonal hatch across the whole beach in
 * sand-r3 and is very likely a large part of the original salt-and-pepper
 * grain defect too. Folding the input into a bounded window first, then hashing
 * with small multipliers, keeps every band random at board scale.
 */
const SAND_NOISE_GLSL = /* glsl */ `
  #ifndef DD_SAND_NOISE
  #define DD_SAND_NOISE

  float ddsHash21(vec2 p) {
    p = mod(p, 8192.0);
    vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }

  float ddsNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = ddsHash21(i);
    float b = ddsHash21(i + vec2(1.0, 0.0));
    float c = ddsHash21(i + vec2(0.0, 1.0));
    float d = ddsHash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float ddsFbm(vec2 p, const int oct) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      if (i >= oct) break;
      v += a * ddsNoise(p);
      p = p * 2.03 + vec2(19.7, 7.3);
      a *= 0.5;
    }
    return v;
  }

  #endif
`;

/**
 * Beach profile GLSL — macro relief only. Everything finer than about three
 * metres is deliberately absent here and lives in the fragment normal instead,
 * where it can be filtered against the pixel footprint. Putting ripple in the
 * vertex height just aliases the vertex normal.
 *
 * R2 note. The profile is now anchored at the STILL-WATER CROSSING rather than
 * at the crest. The crest position and height are derived from a face length
 * that varies along the shore, so a taller berm makes a wider dry beach instead
 * of pushing a sand tongue out into the bay. That is what lets the berm be big
 * enough to read at hero orbit and to occlude at a 9-degree grazing angle
 * without moving the waterline off the water's own meander.
 */
const BEACH_PROFILE_GLSL = /* glsl */ `
  uniform float uBeachSlope;  // metres of fall per metre across the low face
  uniform float uScarpDrop;   // metres the swash-cut scarp drops below the crest
  uniform float uScarpLen;    // metres of run the scarp takes to drop it
  uniform float uCuspAmp;     // beach-cusp amplitude
  uniform float uWindAmp;     // wind-blown backshore undulation
  uniform float uBenchAmp;    // ridge-and-runnel bench amplitude on the face
  uniform float uAlongHalf;   // metres from centre to board end (NOT wrap pad)
  uniform float uBayCentre;   // along-coordinate of the shore-frame origin

  /**
   * Wrap-aware front. On the main span this is shore − coastline. Past each
   * board end the waterline is a circular cap around the corner, so the
   * north wrap is not a 140 m straight waterline at the east-wall X.
   */
  float ddWrapFront(float along, float shore, float t) {
    float coast = ddCoastLine(along, t);
    // 'half' is a GLSL reserved word — it silently killed this whole
    // material's compile (the shelf rendered as nothing since R13b).
    float alongHalfM = max(uAlongHalf, 1.0);
    float extra = abs(along - uBayCentre) - alongHalfM;
    if (extra <= 0.0) return shore - coast;
    float wrapped = length(vec2(extra, shore)) - uWaterFace;
    wrapped -= (coast - uWaterFace);
    return wrapped;
  }

  /**
   * P13-W NE corner (world x > 262 ∧ z < 8). 12 m smoothstep so the
   * mid-beach cannot pick up a seam. Names avoid GLSL reserved words.
   */
  float ddCornerMask(vec3 w) {
    float mx = smoothstep(${(SHORE.cornerMaskX - SHORE.cornerMaskFeather).toFixed(1)}, ${Number(SHORE.cornerMaskX).toFixed(1)}, w.x);
    float mz = 1.0 - smoothstep(${Number(SHORE.cornerMaskZ).toFixed(1)}, ${(SHORE.cornerMaskZ + SHORE.cornerMaskFeather).toFixed(1)}, w.z);
    return clamp(mx * mz, 0.0, 1.0);
  }

  /**
   * P13-W2 NE-corner landform height (metres). Berm ridge + tussock spikes
   * + tidal-pool dish. East bay only. Zero outside the mask so mid-beach
   * vertex height is the pre-W2 expression.
   */
  float ddCornerLift(vec3 w, float along, float front) {
    float m = ddCornerMask(w);
    if (m < 0.002) return 0.0;
    if (uShoreNormal.x < 0.70) return 0.0;
    if (!(along < 1.0e8 && along > -1.0e8)) along = 0.0;
    if (!(front < 1.0e8 && front > -1.0e8)) front = 0.0;
    float alongHalfM = max(uAlongHalf, 1.0);
    float extra = abs(along - uBayCentre) - alongHalfM;
    float wrapGate = smoothstep(-10.0, 2.0, extra);
    if (wrapGate < 0.002) return 0.0;
    float dry = 1.0 - smoothstep(-2.5, 1.0, front);
    float bermAt = ${Number(SHORE.cornerBermAt).toFixed(2)};
    float bermHw = ${Number(SHORE.cornerBermHalfW).toFixed(2)};
    float berm = exp(-pow((front - bermAt) / bermHw, 2.0))
      * ${Number(SHORE.cornerBermH).toFixed(2)} * dry * wrapGate;
    float tuss = 0.0;
    if (berm > 0.04) {
      vec2 tc = floor(vec2(along, front) / 1.85);
      float hk = ddsHash21(tc + 19.7);
      if (hk > 0.42) {
        vec2 f = fract(vec2(along, front) / 1.85) - 0.5;
        float d2 = dot(f, f);
        tuss = max(0.0, 1.0 - d2 * 6.5) * 0.16 * (0.55 + 0.45 * ddsHash21(tc + 4.1));
      }
    }
    float poolA = uBayCentre + alongHalfM + ${Number(SHORE.cornerPoolAlong).toFixed(2)};
    float poolS = ${Number(SHORE.cornerPoolShore).toFixed(2)};
    float sh = ddShoreDist(w);
    float pd = length(vec2(along - poolA, sh - poolS));
    if (!(pd < 1.0e8 && pd > -1.0e8)) pd = 99.0;
    pd += (ddsNoise(vec2(along * 0.48, sh * 0.48) + 3.1) - 0.5) * 1.15;
    float pool = -0.16 * (1.0 - smoothstep(0.55, ${Number(SHORE.cornerPoolR).toFixed(2)}, pd)) * wrapGate;
    float pool2A = uBayCentre + alongHalfM + ${SAND_W15.pool2Along.toFixed(2)};
    float pool2S = ${SAND_W15.pool2Shore.toFixed(2)};
    float pd2 = length(vec2(along - pool2A, sh - pool2S));
    if (!(pd2 < 1.0e8 && pd2 > -1.0e8)) pd2 = 99.0;
    pd2 += (ddsNoise(vec2(along * 0.44, sh * 0.44) + 5.7) - 0.5) * 0.95;
    float pool2 = -0.13 * (1.0 - smoothstep(0.45, ${SAND_W15.pool2R.toFixed(2)}, pd2)) * wrapGate;
    return (berm + tuss + pool + pool2) * m;
  }

  /**
   * P13-W3 wrap-cap pad + seaward Y ceiling. Extra>0 (the polar cap, including
   * under the kiosk) is lifted even at small shore so polygonOffset cannot
   * let the ocean sheet win. East-face promenade (extra<=0, shore<6) stays
   * on SAND_Y for people. Seaward of wrap-front, world Y cannot exceed
   * cornerSeawardMaxY or the tanker wake is cut.
   */
  float ddCornerPad(vec3 w, float along, float sh, float front) {
    float m = ddCornerMask(w);
    if (m < 0.002) return 0.0;
    if (!(along < 1.0e8 && along > -1.0e8)) along = 0.0;
    if (!(sh < 1.0e8 && sh > -1.0e8)) sh = 0.0;
    if (!(front < 1.0e8 && front > -1.0e8)) front = 0.0;
    float alongHalfM = max(uAlongHalf, 1.0);
    float extra = abs(along - uBayCentre) - alongHalfM;
    float wrapCap = smoothstep(-2.0, 2.5, extra);
    float reach = max(wrapCap, smoothstep(6.0, 12.0, sh));
    // P16-PM1. The lift is a BACKSHORE clearance, not a datum, so it is gated
    // on front. Landward it is the full W3 number and every prop keeps its
    // ground; at the waterline it is exactly what puts the sand on the drawn
    // sheet; padSeaTo metres out it is zero and the shelf is bare bathymetry.
    float landT = 1.0 - smoothstep(
      ${Number(SAND_PM1.padLandFrom).toFixed(2)}, 0.0, front);
    float seaT = 1.0 - smoothstep(0.0, ${Number(SAND_PM1.padSeaTo).toFixed(2)}, front);
    float waterLift = ${(SAND_PM1.seaTop - SAND_PM1.seaClear - WATER_Y).toFixed(4)};
    float lift = mix(waterLift, ${Number(SHORE.cornerWrapLift).toFixed(2)}, landT);
    return lift * max(seaT, landT) * reach * m;
  }

  /**
   * P16-PM1. The seaward ceiling is a SLOPE, not a shelf.
   *
   * W3 capped the shelf at a flat world 0.04 over 0.55 m of front so the tanker
   * wake could not be cut. The cap did its job and drew a 1:2.5 cliff doing it.
   * The ceiling now starts seaClear under the drawn sheet at the waterline and
   * falls at seawardFall, so the shelf can only ever go DOWN from the water.
   * W3's contract is kept where it was aimed: the ceiling passes under
   * cornerSeawardMaxY at front 1.23 m and stays under it, and every decal on
   * the sheet sits at least DECAL_LIFT (10 mm) above it at every front.
   */
  float ddCornerSeaCap(vec3 w, float front, float h) {
    float m = ddCornerMask(w);
    if (m < 0.002) return h;
    if (!(front < 1.0e8 && front > -1.0e8)) front = 0.0;
    float ceilLocal = ${(SAND_PM1.seaTop - SAND_PM1.seaClear - SAND_Y).toFixed(4)}
      - max(front, 0.0) * ${Number(SAND_PM1.seawardFall).toFixed(3)}
      + max(-front, 0.0) * ${Number(SAND_PM1.landwardRise).toFixed(3)};
    ceilLocal = max(ceilLocal, ${BED_FLOOR.toFixed(3)});
    float seaGate = smoothstep(${Number(SAND_PM1.seaCapFrom).toFixed(2)},
      ${Number(SAND_PM1.seaCapTo).toFixed(2)}, front) * m;
    return mix(h, min(h, ceilLocal), seaGate);
  }

  /**
   * P15-AP3 APOSTLES COVE — the cove's own bathymetry.
   *
   * This shelf runs sixty metres seaward of the wall (forty of dry sand and
   * twenty of wet: SHORE.sandSeaward + SHORE.wetDepth). The Apostles cove
   * has its own waterline twenty-two metres further in, at world x ~ 313, and
   * where the two disagree the cove's near sea stacks were standing on BEACH.
   * Measured in projected foot boxes on plate r14: stack 0 read 33 % sand and
   * 4 % sea at its foot, stack 4 read 63 % and 2 %, while the three stacks
   * seaward of world x ~ 337 read 26 to 67 % sea. The break is in world x, not
   * in the cove's own coordinates, which is what identifies it as this shelf.
   *
   * Painting over it does not work, and that was tried first: the sand there
   * is genuinely ABOVE still water — ddBeachHeight lands on the waterline at
   * front 0 and rises landward — so a sea floor laid at any plausible water
   * height loses the depth test to it. The shelf has to fall away instead.
   *
   * THE WINDOW IS DISJOINT FROM EVERYTHING THIS FILE ALREADY OWNS.
   *   - east bay only, the same uShoreNormal.x gate ddCornerLift uses
   *   - world z 194 .. 292; the P13 corner mask is z < 20
   *   - world x > 313; every piece of east-beach furniture — the umbrellas,
   *     the volleyball net, the kiosk queue — projects to world x 283 .. 291,
   *     and the cove's own umbrella clusters, kiosk and crowd sit at 297 .. 312
   * Outside the window this returns exactly zero and every W3 / W4 / A8
   * expression is the one that was here before.
   */
  float ddCoveCut(vec3 w) {
    if (uShoreNormal.x < 0.70) return 0.0;
    float mz = smoothstep(194.0, 206.0, w.z) * (1.0 - smoothstep(278.0, 292.0, w.z));
    float mx = smoothstep(313.0, 326.0, w.x);
    // taste-r1 (W16): the shelf's own tip past the hinterland rim join (about x 330, z 326) sinks the same way, so it never
    // stands in the bay as a brown triangle now that the rim's slab shelves under the water there.
    float rimTip = smoothstep(319.0, 324.0, w.z) * smoothstep(323.0, 328.0, w.x);
    return clamp(max(mz * mx, rimTip), 0.0, 1.0);
  }

  /**
   * taste-r1 (W15 fix): the city beach's foam (lip, lace, run-up foam) ends softly before the board end, where the hinterland
   * rim ribbon (fringe/coast-rim.js) takes the shore on. East shelf only; 1 elsewhere. The lip had stopped at the end of the
   * shelf as a white sliver of tight parallel lines (x 286 to 293, z 311 to 314). Switch-off: return 1.0 here.
   */
  float ddRimFoamFade(vec3 w) {
    if (uShoreNormal.x < 0.70) return 1.0;
    return 1.0 - smoothstep(286.0, 304.0, w.z);
  }

  /** The shelf FALLS into the cove; it never ends at a cut face. */
  float ddCoveDrop(vec3 w, float h) {
    float m = ddCoveCut(w);
    if (m < 0.002) return h;
    return mix(h, min(h, ${(-0.62 - SAND_Y).toFixed(3)}), m);
  }

  float ddCornerPoolD(float along, float sh) {
    float alongHalfM = max(uAlongHalf, 1.0);
    float poolA = uBayCentre + alongHalfM + ${Number(SHORE.cornerPoolAlong).toFixed(2)};
    float poolS = ${Number(SHORE.cornerPoolShore).toFixed(2)};
    float pd = length(vec2(along - poolA, sh - poolS));
    if (!(pd < 1.0e8 && pd > -1.0e8)) return 99.0;
    pd += (ddsNoise(vec2(along * 0.48, sh * 0.48) + 3.1) - 0.5) * 1.15;
    return pd;
  }

  /** Rhythmic cusp signal: horns and embayments cut by the swash. */
  float ddCuspOffset(float along) {
    return sin(along * 0.1963 + 0.7) * 0.60
         + sin(along * 0.2992 + 2.3) * 0.28
         + sin(along * 0.0921 - 1.1) * 0.34;
  }

  /**
   * Width of the beach face — berm crest to still-water crossing, in metres.
   * Varying this ALONG the shore is what makes the dry band change width, which
   * a constant-width band cannot do and which reads immediately as a tool.
   */
  float ddFaceLen(float along) {
    float n = clamp((ddsFbm(vec2(along * 0.0115, 17.3), 3) - 0.17) / 0.54, 0.0, 1.0);
    float m = 0.5 + 0.5 * sin(along * 0.0137 + 1.9);
    return 7.2 + 7.0 * clamp(n * 0.62 + m * 0.38, 0.0, 1.0);
  }

  /** front-distance of the berm crest. Negative is up the beach. */
  float ddBermAt(float along) { return -ddFaceLen(along); }

  /**
   * Fall from the crest to a point x metres seaward of it: a short steep scarp
   * the swash has cut, then a low-angle face easing into the low-tide terrace.
   * The scarp slope is deliberately above tan(9 degrees) so it occludes on the
   * grazing plate instead of reading as one smooth ramp.
   */
  float ddFaceFall(float x) {
    float scarp = uScarpDrop * smoothstep(0.0, uScarpLen, x);
    float fx = max(x - uScarpLen, 0.0);
    return scarp + uBeachSlope * fx * (1.0 - 0.35 * smoothstep(0.0, 12.0, fx));
  }

  /**
   * W14-B: where the last big storm left its weed, as a front distance. It is
   * the berm foot pulled 0.35 of the way to the 9 m group-peak run-up line.
   */
  float ddWrackAt(float bermAt) {
    float foot = bermAt + uScarpLen;
    return foot + (-9.0 - foot) * 0.35;
  }

  /**
   * Crest height above the shelf datum, solved so the face lands exactly on
   * still water at front = 0 whatever the face length happens to be.
   */
  float ddBermCrest(float along) {
    return ddFaceFall(ddFaceLen(along)) - ${(SAND_Y - WATER_Y).toFixed(3)};
  }

  /**
   * Height of the beach profile above the shelf datum, in metres.
   * front is measured from the mean waterline (negative up the beach).
   */
  float ddBeachHeight(float along, float front, float t) {
    // Backshore stays on the datum. The boardwalk stair toes, the umbrellas,
    // the van, the bins and the lifeguard tower are all placed against SAND_Y
    // within a couple of centimetres, so relief here reads as floating props.
    //
    // R2b: pushed seaward from (-30,-25). The window has to clear the seaward
    // EDGE of the widest prop footprint, not its centre — the volleyball net
    // is 6.8 m deep about a centre at front -30.1, so it reaches -26.7. At
    // (-30,-25) the old window returned 0.156 at the prop centres and let 25
    // mm of wind undulation under the net posts; the build report's "exactly
    // zero over that whole span" was wrong by that much. Verified in the
    // report's float/bury table, which samples every prop footprint.
    float free = smoothstep(-26.0, -21.5, front);

    float bermAt = ddBermAt(along);
    float crestH = ddBermCrest(along);

    // Backshore ramp. The smoothstep lands on the crest with zero slope and the
    // scarp leaves it steep, so the crest is a convex BREAK rather than a hump.
    //
    // R2b: 14 m of rise became 6.5 m. A 0.6 m crest reached over 14 m is 2.5
    // degrees, which at the 9-degree grazing plate is indistinguishable from
    // the beach's own slope — the critic's "one smooth ramp from the seawall to
    // the water", and correctly called. Over 6.5 m it is 5.3 degrees, and the
    // scarp leaving the crest is 23. The crest now occludes what is behind it.
    float ramp = crestH * smoothstep(bermAt - 6.5, bermAt, front);
    // Storm berm: an older, lower crest further up the beach, left by a bigger
    // tide. Without it the ground behind the active crest is a bare plane and
    // the berm has nothing to be a step DOWN from, which is half of why a berm
    // reads as landform rather than as a tonal band.
    float oldAt = bermAt - 9.0 - 2.2 * ddsNoise(vec2(along * 0.031, 61.0));
    ramp += crestH * 0.34 * smoothstep(oldAt - 5.5, oldAt, front)
          * (1.0 - smoothstep(bermAt - 6.5, bermAt - 1.5, front));
    float x = max(front - bermAt, 0.0);
    float profile = ramp - ddFaceFall(x);

    // Ridge and runnel: the low shore-parallel benches the swash builds on the
    // face, with drains between them. Organisation along the shore is what a
    // beach has and what an isotropic noise field cannot supply.
    float benchPh = x * 0.285 + ddsFbm(vec2(along * 0.021, 2.9), 3) * 2.6;
    float bench = sin(benchPh * 6.2831853) * uBenchAmp
                * smoothstep(0.6, 3.5, x) * (1.0 - smoothstep(7.0, 17.0, x));

    // Cusps: strongest across the swash, dying out up the beach and offshore.
    float cuspEnv = smoothstep(-26.0, -9.0, front) * (1.0 - smoothstep(1.0, 11.0, front));
    float cusp = ddCuspOffset(along) * uCuspAmp * cuspEnv;

    // Wind-blown backshore, stretched about eight to one along the shore. The
    // round-1 field was isotropic and read as cloud blotch from every angle.
    //
    // MESH BUDGET. Backshore rows are 0.79 m apart and columns 1.30 m, so any
    // vertex-height content under about 3 m is sampled two or three times per
    // cell and the analytic normal then disagrees with the facet the mesh can
    // actually draw. That put a hard diagonal corrugation on the backshore at
    // board distance, locked to the row spacing, which survived turning the
    // albedo flat and turning the fragment normal off. Nothing finer than a
    // few metres belongs in this function; the fragment normal carries it.
    float dune = (ddsFbm(vec2(along * 0.026, front * 0.11), 2) - 0.375) * 2.67;
    dune *= uWindAmp * (1.0 - smoothstep(-24.0, -10.0, front));
    // W15: a real dune ridge (0.8–1.5 m), shore-parallel, behind the berm and
    // seaward of the prop datum. The old wind term is texture; this is landform.
    float w15At = ${SAND_W15.ridgeFront.toFixed(2)}
      + ${SAND_W15.ridgeWander.toFixed(2)} * (ddsFbm(vec2(along * 0.012, 8.1), 2) - 0.5);
    float w15H = mix(${SAND_W15.ridgeH0.toFixed(2)}, ${SAND_W15.ridgeH1.toFixed(2)},
      ddsNoise(vec2(along * 0.018, 3.4)));
    float w15Ridge = exp(-pow((front - w15At) / ${SAND_W15.ridgeHalfW.toFixed(2)}, 2.0)) * w15H
      * (1.0 - smoothstep(-9.0, -2.5, front));
    float w15Tuss = 0.0;
    if (w15Ridge > 0.35) {
      vec2 tc = floor(vec2(along, front) / 1.65);
      if (ddsHash21(tc + 29.3) > 0.38) {
        vec2 f = fract(vec2(along, front) / 1.65) - 0.5;
        w15Tuss = max(0.0, 1.0 - dot(f, f) * 7.2) * ${SAND_W15.tussockH.toFixed(2)}
          * (0.55 + 0.45 * ddsHash21(tc + 8.2));
      }
    }

    // Wrack mound: the bank of weed the last high tide dropped at the crest.
    // W14-B: the mound lies at the storm line (the 9 m group-peak reach),
    // pulled toward the berm foot, not 0.9 m behind the crest.
    float wrackBand = exp(-pow((front - ddWrackAt(bermAt)) / 1.1, 2.0));
    float wrackRun = smoothstep(0.44, 0.78, ddsFbm(vec2(along * 0.10, 4.7), 2));
    float wrack = wrackBand * wrackRun * 0.055;

    float dry = (profile + bench + cusp + dune + wrack + w15Ridge + w15Tuss) * free;
    // Pile against the seawall so the board lip is a buried toe, not a tray.
    float sh = front + ddCoastLine(along, t);
    dry += (1.0 - smoothstep(0.35, 5.2, sh)) * 0.48;
    // Two centimetres of tooth everywhere, including under the props. One
    // smooth octave at about a nine-metre cell: long enough that the local
    // slope under any single base plate is nothing, and coarse enough that the
    // mesh can carry it without corrugating. This term and this term only is
    // what a prop base can be standing on, so its half-amplitude IS the
    // float/bury guarantee: +/- 11 mm. See the build report's measured table.
    dry += (ddsNoise(vec2(along * 0.11, front * 0.09)) - 0.5) * 0.022;

    // Under water hand over to the contract bathymetry so the shelf and the
    // water's own depth model agree, then hold the shelf off the trough floor.
    // W14-B: the 1 in 15 face continues under the sheet to 1.3 m of water, so
    // the first metres of sea sit over sand deep enough to take their colour.
    // The contract bathymetry (ddDepth) is no longer read here; the water's
    // own depth follows this section through beachSection.
    float bed = -(${(SAND_Y - WATER_Y).toFixed(3)}
      + min(${SHELF_FACE.slope.toFixed(3)} * max(front, 0.0), ${SHELF_FACE.cap.toFixed(2)}));
    float h = mix(dry, bed, smoothstep(0.0, ${SHELF_FACE.blend.toFixed(1)}, front));
    return max(h, ${BED_FLOOR.toFixed(3)});
  }
`;

/** Band-limited noise, ripple, debris and traffic — the fragment-side detail. */
const SAND_DETAIL_GLSL = /* glsl */ `
  uniform vec3  uSandDry;
  uniform vec3  uSandPale;
  uniform vec3  uSandWarm;
  uniform vec3  uSandShadow;
  uniform vec3  uSandDamp;
  uniform vec3  uSandWet;
  uniform vec3  uSandDeep;
  uniform vec3  uWrackDark;
  uniform vec3  uWrackPale;
  uniform vec3  uTussock;
  uniform vec3  uRock;
  uniform vec3  uPoolFoam;
  uniform vec3  uPoolTint;
  uniform vec3  uSandSky;
  uniform vec3  uSandSwash;
  uniform vec3  uSandFoam;
  uniform float uBaySpread;   // along-offset between stair bays

  // Fragment-scope state, filled once in <color_fragment> and reused by the
  // roughness and normal chunks so nothing is computed three times.
  float ddPx;      // metres per pixel in the shore frame (anisotropic mean)
  float ddPxD;     // worst-axis footprint, for DIRECTIONAL features
  float ddPxA;     // footprint along the ALONG-SHORE axis
  float ddPxS;     // footprint along the SHORE-NORMAL axis
  vec2  ddGP;      // (along, shore) in metres

  /**
   * Footprint of one pixel measured along an arbitrary shore-frame bearing.
   *
   * A sinusoid only aliases along its own wave vector. Round 2 filtered every
   * directional feature against the WORST axis, which on a beach seen at 22
   * degrees is the shore-normal one and is nearly four times the along-shore
   * footprint. That threw away every ripple train and every rill whose crests
   * happen to run the OTHER way and could be resolved perfectly well — which is
   * most of the reading-distance tooth the critic measured as missing. The two
   * screen-space gradients of the shore frame are near-orthogonal on a plane,
   * so the footprint along a unit bearing is their quadrature sum.
   */
  float ddDirPx(vec2 dir) {
    return max(length(vec2(dir.x * ddPxA, dir.y * ddPxS)), 0.0006);
  }
  float ddWetF;    // 0 bone dry .. 1 under water
  float ddFilmF;   // sheet of water left behind by the last run-up
  float ddSubmF;   // metres of still water standing over the shelf
  float ddTrafF;   // trampling density
  float ddToothF;  // fine grain value, drives roughness break-up
  // P13-W4. Both are camera-distance visibilities, filled once in
  // <color_fragment> and read again by the roughness and normal chunks.
  float ddRipV = 1.0;    // wind-ripple visibility: a 1-2 m fact
  float ddPrintV = 1.0;  // single-footprint visibility: a 25 m fact
  float ddPathC = 0.0;   // desire-path core, read again by the roughness chunk
  // P13-A8. Swash film coverage at this fragment, read again by the roughness
  // chunk so a sheet of water is smoother than the sand it is lying on.
  float ddSwashC = 0.0;

  /**
   * P13-W4 ripple visibility against camera distance.
   *
   * The W2 gate was a pixel-footprint window opened WIDE so a 0.9 m train
   * would survive to board distance. It did, and the blind pack called the
   * result an unfinished shader. Wind ripples are read standing on the sand;
   * from forty metres up a beach carries a tonal cast where it is rippled and
   * nothing else. Full close, a quarter at 40 m, gone by 85 m.
   */
  float ddRipVis(vec3 w) {
    float dCam = length(cameraPosition - w);
    if (!(dCam < 1.0e8 && dCam > -1.0e8)) return 0.0;
    float near = 1.0 - ${(1 - SAND_W4.rippleFarKeep).toFixed(2)}
      * smoothstep(${Number(SAND_W4.rippleNear).toFixed(1)}, ${Number(SAND_W4.rippleQuarter).toFixed(1)}, dCam);
    float far = 1.0 - smoothstep(${Number(SAND_W4.rippleQuarter).toFixed(1)}, ${Number(SAND_W4.rippleGone).toFixed(1)}, dCam);
    return clamp(near * far, 0.0, 1.0);
  }

  /** P13-W4 single-print visibility. Sparse pairs only inside 25 m. */
  float ddPrintVis(vec3 w) {
    float dCam = length(cameraPosition - w);
    if (!(dCam < 1.0e8 && dCam > -1.0e8)) return 0.0;
    return 1.0 - smoothstep(${Number(SAND_W4.printNear).toFixed(1)}, ${Number(SAND_W4.printFar).toFixed(1)}, dCam);
  }

  /**
   * P13-W4 total-swing cap for the whole-beach value fields.
   *
   * |out| < cap for every input, and a quartic knee rather than a softsign so
   * the cap is a CEILING and not a global contrast reduction — a plain
   * softsign eats fourteen per cent of a swing at two fifths of the cap,
   * which is most of the beach. A hard clamp was the other option and it
   * flattens every crest that reaches the ceiling into one value.
   */
  float ddMicroCap(float v) {
    float c = ${Number(SAND_W4.microCap).toFixed(3)};
    float a = v / c;
    float a4 = (a * a) * (a * a);
    return v * inversesqrt(sqrt(1.0 + a4));
  }

  // Defined below, used by ddSandMicro above it.
  float ddWindRip(vec2 p, float px, float front, float dry);

  /**
   * Footprint fade for one band: 1 while a cycle is comfortably wider than a
   * pixel, 0 once it approaches two. This is the answer to W-R01a — an
   * unfiltered 4 cm octave is a per-pixel coin toss at hero orbit, which is
   * what read as grey gravel.
   */
  float ddFade(float px, float freq) {
    return 1.0 - smoothstep(0.15, 0.34, px * freq);
  }

  /**
   * One band of a variance-conserving cascade.
   * x = the band's weighted contribution, y = the variance it actually kept.
   *
   * The agg argument stretches the band along the shore. Everything coarser than a couple
   * of metres has to be anisotropic — see ddSandGrain.
   */
  vec2 ddOct(vec2 p, float off, float freq, float w, float px, float agg) {
    float fd = ddFade(px, freq);
    if (fd <= 0.002) return vec2(0.0);
    vec2 q = vec2(p.x / agg, p.y * agg) + off;
    return vec2(w * fd * (ddsNoise(q * freq) - 0.5), w * w * fd * fd);
  }

  /**
   * Zero-mean multi-scale grain, every band limited by the footprint — but the
   * variance a band takes with it when it fades is handed BACK to the bands
   * that survive, so total contrast is conserved as detail coarsens.
   *
   * Round 1 faded each octave to its own mean instead. Tone stayed stable and
   * the surface died: bare-sand p95-p5 measured 27.9 against a gate of 60 and a
   * reference of 92-131. Fading to the mean is a correct anti-alias and a
   * catastrophic art direction, because the thing being averaged away is the
   * entire read of the material.
   *
   * R2b — TWO corrections to that cascade, both found in the plates it made.
   *
   * 1. The coarse octaves are STRETCHED ALONG THE SHORE, hard. Conserving
   *    variance means that at board distance, where every fine band has faded,
   *    the whole budget lands on the two coarsest octaves. Those were isotropic
   *    36 m and 7.7 m cells, so the fix for "no tooth at reading distance"
   *    printed leopard-spot camouflage over the entire beach at hero orbit and
   *    plan view, and left nothing shore-parallel for a berm to be read
   *    against. A beach's large-scale tone organises ALONG the shore because
   *    every process that made it — swash, wind, the tide line — runs that way.
   * 2. The conservation gain is CAPPED at 1.7. Uncapped, a distant beach where
   *    only one band survives multiplies that band by the full cascade norm,
   *    and a soft 8 m undulation becomes a hard blotch.
   */
  float ddSandGrain(vec2 p, float px) {
    vec2 o1 = ddOct(p, 3.10, 0.028, 1.05, px, 5.0);
    vec2 o2 = ddOct(p, 17.9, 0.130, 0.80, px, 3.6);
    vec2 o3 = ddOct(p, 31.7, 0.480, 0.52, px, 2.2);
    vec2 o4 = ddOct(p, 51.1, 1.900, 0.78, px, 1.4);
    vec2 o5 = ddOct(p, 83.7, 6.400, 0.82, px, 1.0);
    vec2 o6 = ddOct(p, 119.3, 17.0, 0.64, px, 1.0);
    vec2 o7 = ddOct(p, 143.1, 46.0, 0.48, px, 1.0);
    vec2 o8 = ddOct(p, 171.7, 128.0, 0.38, px, 1.0);
    float sig = o1.x + o2.x + o3.x + o4.x + o5.x + o6.x + o7.x + o8.x;
    float kept = o1.y + o2.y + o3.y + o4.y + o5.y + o6.y + o7.y + o8.y;
    const float total = 1.05 * 1.05 + 0.80 * 0.80 + 0.52 * 0.52 + 0.78 * 0.78
                      + 0.82 * 0.82 + 0.64 * 0.64 + 0.48 * 0.48 + 0.38 * 0.38;
    return sig * clamp(sqrt(total / max(kept, 1e-3)), 1.0, 1.7);
  }

  /** Single band, kept for the places that want one scale and no cascade. */
  float ddBand(vec2 p, float freq, float px) {
    float fade = ddFade(px, freq);
    if (fade <= 0.002) return 0.0;
    return (ddsNoise(p * freq) - 0.5) * fade;
  }

  /**
   * PM11 broad dry-sand plate. Three non-parallel 3.2/5.6/7.8 m bands make
   * wind-organised drifts without putting any per-pixel grain in the albedo.
   */
  float ddDryPlateTone(vec2 p, float px) {
    vec2 p0 = vec2(p.x * 0.94 + p.y * 0.34, -p.x * 0.34 + p.y * 0.94);
    vec2 p1 = vec2(p.x * 0.72 - p.y * 0.69, p.x * 0.69 + p.y * 0.72);
    float a = ddBand(p0 + 17.3, ${(1 / SAND_PM11.toneScalesM[0]).toFixed(4)}, px) * 2.0;
    float b = ddBand(p1 + 41.7, ${(1 / SAND_PM11.toneScalesM[1]).toFixed(4)}, px) * 2.0;
    float c = ddBand(p + 83.1, ${(1 / SAND_PM11.toneScalesM[2]).toFixed(4)}, px) * 2.0;
    return clamp(a * 0.28 + b * 0.42 + c * 0.30, -1.0, 1.0);
  }

  /**
   * Micro relief in METRES, as a slope-conserving cascade. Amplitudes fall
   * roughly as one over frequency so every band carries a similar slope, which
   * is what a granular surface actually does; when a band fades the survivors
   * are lifted to hold the slope, capped at 2x so a distant beach cannot grow
   * a dune field where it used to have grain.
   */
  vec2 ddSandRelief(vec2 p, float px) {
    vec2 o1 = ddOct(p, 31.7, 0.480, 0.0480, px, 2.2);
    vec2 o2 = ddOct(p, 51.1, 1.900, 0.0205, px, 1.4);
    vec2 o30 = ddOct(p, 67.4, ${(1 / SAND_PM11.reliefWavelengthM).toFixed(3)},
      ${Number(SAND_PM11.reliefAmplitudeM).toFixed(4)}, px, 1.2);
    vec2 o3 = ddOct(p, 83.7, 6.400, 0.0092, px, 1.0);
    vec2 o4 = ddOct(p, 119.3, 17.0, 0.0040, px, 1.0);
    vec2 o5 = ddOct(p, 143.1, 46.0, 0.0017, px, 1.0);
    float sig = o1.x + o2.x + o30.x + o3.x + o4.x + o5.x;
    // Slope variance, band by band: amplitude times frequency, squared.
    float keptS = o1.y * 0.480 * 0.480 + o2.y * 1.900 * 1.900
                + o30.y * ${(1 / SAND_PM11.reliefWavelengthM).toFixed(3)} * ${(1 / SAND_PM11.reliefWavelengthM).toFixed(3)}
                + o3.y * 6.400 * 6.400 + o4.y * 17.0 * 17.0
                + o5.y * 46.0 * 46.0;
    const float totalS = 0.0480 * 0.0480 * 0.480 * 0.480
                       + 0.0205 * 0.0205 * 1.900 * 1.900
                       + ${Number(SAND_PM11.reliefAmplitudeM).toFixed(4)} * ${Number(SAND_PM11.reliefAmplitudeM).toFixed(4)}
                         * ${(1 / SAND_PM11.reliefWavelengthM).toFixed(3)} * ${(1 / SAND_PM11.reliefWavelengthM).toFixed(3)}
                       + 0.0092 * 0.0092 * 6.400 * 6.400
                       + 0.0040 * 0.0040 * 17.0 * 17.0
                       + 0.0017 * 0.0017 * 46.0 * 46.0;
    float k = clamp(sqrt(totalS / max(keptS, 1e-9)), 1.0, 2.0);
    // y is the coarse half: metre-scale undulation shades through the surface
    // normal but does NOT occlude, and driving occlusion from it turns the
    // beach into a stained cloth.
    return vec2(sig, o1.x + o2.x) * k;
  }

  /**
   * Swash and wind ripple: 30 to 55 cm crest to crest, standing one to two
   * centimetres proud, with a gentle stoss slope and a steep lee face. The
   * asymmetry is the whole point — it is what puts a hard lit face against a
   * hard shadowed one, and it is why the reference reads 63 luma between two
   * features a few millimetres apart. Round 1 ran this at 1.7 cm amplitude,
   * an eighth of the slope it needed.
   *
   * WAVELENGTH IS SET BY WHAT THE PLATE CAN RESOLVE, not by what dry wind
   * ripple measures on a real beach. A sharpened, harmonic-rich waveform needs
   * eight to ten pixels a cycle before it beats against the pixel grid, and the
   * reading-distance plate gives about 3.6 cm to a pixel. Fine wind ripple at
   * 10 cm is four pixels a cycle: it painted a hard diagonal moire over the
   * whole beach at board distance, and turning off the albedo, the normal, the
   * shadows and the mesh rows one at a time all left it there. At 30 to 55 cm
   * these are the swash and backwash ripples a beach face actually carries,
   * they resolve honestly at reading distance, and they fade out cleanly.
   *
   * The field is patchy: bearing, wavelength and presence change every few
   * metres, with blown-smooth lanes between the patches. One global sine across
   * the whole beach reads as printed corduroy, which is the tiling-grid failure
   * wearing a different hat.
   */
  /** Where the ripple field exists at all. Cheap, unfiltered, and therefore
   *  still there when the ripple itself has filtered away — a rippled patch of
   *  beach stays measurably darker than a blown-smooth lane at any distance. */
  float ddRippleCover(vec2 p) {
    // R2b: floored at 0.42. This was 0 to 1 over a 19 m cell, so whether any
    // given stretch of beach had ripple at all was a coin toss on a patch
    // roughly the size of the critic's scored rect — and that rect lost the
    // toss, which is most of why it measured a Laplacian sigma of 8 while a
    // patch 20 m up the beach measured 18 with the identical shader. A beach
    // face between the berm and the swash is combed almost everywhere; the
    // blown-smooth lanes are the exception, not half the surface.
    // Two scales. The 19 m term is where the field is combed at all; the
    // 2.9 m term breaks each combed stretch into segments, so the train is
    // never one unbroken sinusoid across twenty metres of frame. That second
    // term is what keeps the autocorrelation honest once the field is
    // prevalent enough to measure.
    return (0.42 + 0.58 * smoothstep(0.20, 0.52, ddsNoise(p * 0.052 + 21.0)))
         * (0.18 + 0.82 * smoothstep(0.28, 0.66, ddsNoise(p * 0.420 + 7.0)))
         * (0.45 + 0.55 * smoothstep(0.24, 0.62, ddsNoise(p * 0.155 + 53.0)));
  }

  /**
   * One ripple train: FIXED bearing and wavelength, phase warped by a bounded
   * noise so the crest lines waver.
   *
   * The bearing has to be constant. dot(p, dir(p)) is not a phase field when
   * dir varies with p — its gradient picks up a term in p itself, and at board
   * metres that term dominates and closes the crests into concentric rings.
   * sand-r3 grew bullseyes that way and so did the first r2 attempt at fixing
   * the corduroy. Direction varies across this beach because a DIFFERENT TRAIN
   * is showing, not because one train is being rotated.
   */
  float ddRippleSet(vec2 p, float bend, float lam, float seed) {
    vec2 dir = vec2(sin(bend), cos(bend));
    // Three scales of phase warp. The two long ones bend the train; the short
    // one breaks individual crests, which is the difference between a ripple
    // field and a printed comb. Real crest lines are a metre or two long.
    float warp = ddsNoise(p * 0.55 + seed) * 1.7 + ddsNoise(p * 0.13 + seed) * 2.9
               + ddsNoise(p * 1.60 + seed) * 0.95;
    float ph = dot(p, dir) * (6.2831853 / lam) + warp;
    // Second harmonic in phase: steep lee face, long gentle stoss slope. Kept
    // modest, because every harmonic added here is energy that has to be
    // filtered back out before the camera pulls away.
    float s = clamp((sin(ph) + 0.28 * sin(2.0 * ph)) * 0.84, -1.0, 1.0);
    // Broad crest, narrower hollow, rather than a symmetric corduroy.
    float brk = smoothstep(0.18, 0.68, ddsNoise(p * 0.92 + seed * 1.7));
    float wave = s > 0.0 ? pow(s, 0.72) : -pow(-s, 1.15);
    return wave * mix(0.12, 1.0, brk);
  }

  /**
   * Full below twelve pixels a cycle, gone by six — measured along the train's
   * OWN bearing, not the worst axis. A ripple whose crests run shore-normal is
   * sampled by the along-shore footprint and resolves at a grazing view where
   * the worst-axis test would have deleted it.
   */
  float ddRipFade(float bend, float lam) {
    return 1.0 - smoothstep(0.083, 0.165, ddDirPx(vec2(sin(bend), cos(bend))) / lam);
  }

  /**
   * Three trains, spread across half a decade of wavelength rather than a
   * third of one: 0.31 / 0.60 / 1.15 m. Shortening them further was tried in
   * R2b and rejected — 0.275/0.45/0.76 bought four points of p95-p5 and took
   * the autocorrelation repeat from 0.28 to 0.52, because more cycles inside
   * the scored patch is more periodicity by definition. Range past this point
   * has to come from things that do not repeat.
   *
   * The reason is the grazing view, not the beach. At 05-sand-macro framing
   * the shore-normal footprint is about 7.5 cm against 2 cm along the shore, so
   * a 31 cm shore-parallel ripple is four pixels a cycle and cannot survive any
   * honest filter. All three of the old trains sat inside that trap, which is
   * why the reading-distance plate measured Laplacian sigma 7 against the
   * reference's 45-63 with a ripple field nominally switched on. The coarse
   * train reads at every distance this suite captures; the fine one is there
   * for the near half of the macro plate and drops out cleanly behind it.
   */
  float ddRipple(vec2 p, float px, float front) {
    // Ripple and rake do not share ground. The rake works the dry upper beach
    // (front -36 to -16) and the swash works the face; letting both run in the
    // same square metre put a regular diamond lattice across the far third of
    // 05-sand-macro — two shore-parallel combs at different pitches crossing,
    // which is a basket weave however good either one is on its own.
    // Distance LOD, SEPARATE from the anti-alias fade. The directional filter
    // says a 1.15 m train is honestly resolvable at hero orbit — twelve pixels
    // a cycle, no aliasing at all — and it is right, and the result was a
    // corrugated-cardboard weave over the whole beach face at board distance.
    // Individual ripple crests are a reading-distance fact; from a hundred and
    // fifty metres up a beach carries a tonal cast where it is rippled and
    // nothing else. ddRippleCover keeps supplying that cast after this is zero.
    float lod = 1.0 - smoothstep(0.040, 0.085, ddPx);
    if (lod <= 0.01) return 0.0;
    float cover = ddRippleCover(p) * smoothstep(-24.0, -17.0, front) * lod
                * (1.0 - smoothstep(-8.5, 0.4, front) * 0.96);
    if (cover <= 0.01) return 0.0;
    // Sharpened so ONE train dominates any given patch. Averaging three
    // bearings evenly gives a basket weave, which is not a beach.
    // Floored at 0.10 for the same reason ddRippleCover is: with all three
    // weights near zero the normalising +0.04 swallowed the signal and the
    // stretch went bare. One train always wins somewhere.
    // Selection cells shrunk from 21-28 m to 5-7 m. With the exclusive maximum
    // below, the cell size IS the length of an unbroken comb: at 24 m and a
    // reading-distance framing of 2 cm a pixel, one train owned twelve hundred
    // pixels and 02-shore-break's near field measured an autocorrelation of
    // 0.89 — printed corduroy, the single worst repeat in the build, and the
    // ripple's own doing (confirmed by ablation: 0.89 to 0.33 with it off).
    // Six metres puts several bearings and several blown lanes in one
    // frame, which is what a beach face looks like. Eleven metres was tried
    // as a middle setting and was WORSE than either end — 0.89 on the scored
    // patch — so this is not a monotone knob and 6 m is where both the macro
    // and the shore-break plates land lowest. The basket weave all of this
    // replaced
    // came from BLENDING two trains at one point, not from having two in one
    // picture, and the exclusive maximum still prevents that.
    float w0 = 0.10 + pow(smoothstep(0.20, 0.72, ddsNoise(p * 0.160 + 3.0)), 3.0);
    float w1 = 0.10 + pow(smoothstep(0.22, 0.74, ddsNoise(p * 0.140 + 61.0)), 3.0);
    float w2 = 0.10 + pow(smoothstep(0.24, 0.76, ddsNoise(p * 0.185 + 131.0)), 3.0);
    // Soft exclusive maximum. Cubing was not enough separation once the three
    // wavelengths spread out: two trains at 0.7 and 0.9 still blend into a
    // lattice. Anything under half the winning weight is switched off, with a
    // smoothstep rather than a step so the patch boundaries are not seams.
    float wmax = max(w0, max(w1, w2));
    if (wmax <= 0.02) return 0.0;
    w0 *= smoothstep(0.42 * wmax, 0.78 * wmax, w0);
    w1 *= smoothstep(0.42 * wmax, 0.78 * wmax, w1);
    w2 *= smoothstep(0.42 * wmax, 0.78 * wmax, w2);
    float sum = w0 + w1 + w2 + 0.04;
    if (sum <= 0.05) return 0.0;
    float s = 0.0;
    if (w0 > 0.01) s += w0 * ddRippleSet(p, -0.62, 0.310, 3.0) * ddRipFade(-0.62, 0.310);
    if (w1 > 0.01) s += w1 * ddRippleSet(p, 0.10, 0.600, 61.0) * ddRipFade(0.10, 0.600);
    if (w2 > 0.01) s += w2 * ddRippleSet(p, 0.74, 1.150, 131.0) * ddRipFade(0.74, 1.150);
    return (s / sum) * cover;
  }

  /**
   * Backwash rills: shore-NORMAL channels the draining swash cuts into damp
   * sand. Cut rather than undulating — mostly flat with narrow incisions — and
   * shore-normal so they do not merge with the shore-parallel comb into one
   * corduroy. This is the texture that has to carry through the wet band, which
   * was otherwise a flat mauve strip with a geometric seaward edge.
   */
  float ddRills(vec2 p, float px, float front, float wet) {
    // Live rills in the wet zone, plus RELICT rills the length of the beach
    // face. The last high tide drained down this whole slope and the channels
    // it cut are still there when the sand dries; gating the only shore-normal
    // feature on the beach to the currently-wet strip left the face carrying
    // nothing but a shore-parallel comb, which reads as one direction of
    // corduroy rather than as a drained slope.
    float band = smoothstep(-9.0, -3.5, front) * (1.0 - smoothstep(1.5, 6.5, front)) * wet;
    band = max(band, 0.30 * smoothstep(-17.0, -11.0, front)
                          * (1.0 - smoothstep(-2.0, 2.5, front)));
    if (band <= 0.01) return 0.0;
    float lam = 0.56;
    // Rills alias in PLAN VIEW, where the shore-normal axis is no longer
    // foreshortened and a 56 cm channel is seven pixels across. At sand-r8-base
    // this printed a hard shore-normal hatch over the whole damp band of
    // 07-topdown-shore — measured by FFT at 7.19 px / 0.548 m, which is this
    // wavelength to two per cent. Their own bearing is along-shore, and the
    // fade is tighter than the ripple's because a hard-edged incision carries
    // far more harmonic energy than a sinusoid does.
    float fade = 1.0 - smoothstep(0.060, 0.110, ddPxA / lam);
    if (fade <= 0.002) return 0.0;
    // The wobble was 3.6 radians over a 2.9 m cell — more than half a cycle
    // of wander per three metres, which stopped being a 56 cm channel field
    // and became broad soft smears on the wobble's own scale. 1.5 rad keeps
    // the channels crooked without dissolving their pitch.
    float wob = ddsNoise(vec2(p.x * 0.34, p.y * 0.075)) * 1.5;
    float run = smoothstep(0.30, 0.66, ddsNoise(vec2(p.x * 0.19, 47.0)));
    float ph = p.x / lam + wob * 0.15915494
             + 0.75 * ddsNoise(vec2(p.x * 0.085, p.y * 0.11 + 13.0));
    float c = max(0.0, -sin(ph * 6.2831853));
    return -pow(c, 0.55) * fade * band * run;
  }

  /** Backwash ripple: shore-parallel ridges combed by the draining swash. */
  float ddBackwash(vec2 p, float px, float front) {
    float band = smoothstep(-17.0, -11.0, front) * (1.0 - smoothstep(0.5, 5.0, front));
    if (band <= 0.01) return 0.0;
    float lam = 0.34;
    float fade = 1.0 - smoothstep(0.083, 0.165, ddPxS / lam);
    if (fade <= 0.002) return 0.0;
    // Two-scale cover. With only the 9 m term this ran unbroken across the
    // whole near field of 02-shore-break and, amplified by the micro-occlusion
    // term, printed a hard corduroy whose autocorrelation measured 0.87 — the
    // worst repeat anywhere in the build. Combed sand comes in patches.
    float cover = smoothstep(0.36, 0.70, ddsNoise(vec2(p.x * 0.11, p.y * 0.20 + 31.0)))
                * (0.30 + 0.70 * smoothstep(0.28, 0.66,
                    ddsNoise(vec2(p.x * 0.42, p.y * 0.30 + 5.0))));
    float wob = ddsNoise(vec2(p.x * 0.085, p.y * 0.045)) * 2.8;
    float s = sin(p.y * (6.2831853 / lam) + wob);
    return sign(s) * pow(abs(s), 0.80) * fade * band * cover;
  }

  /**
   * Council beach rake: shore-parallel FURROWS on the dry upper beach, in runs.
   *
   * R2b. This was a full sine, and in 09-pier-water it printed forty metres
   * of unbroken corduroy across the near half of the beach — regular pitch,
   * regular contrast, dead-parallel lines. A rake does not do that. It drags
   * tines, so what it leaves is a NARROW GROOVE with flat sand between grooves,
   * the passes wander relative to each other, and it stops. Three changes: a
   * one-sided groove profile instead of a symmetric wave, a second wander term
   * an order of magnitude shorter than the first so neighbouring furrows are
   * not parallel, and harder run gating.
   */
  float ddRake(vec2 p, float px, float front) {
    float band = (1.0 - smoothstep(-22.0, -16.0, front)) * smoothstep(-36.0, -30.0, front);
    if (band <= 0.01) return 0.0;
    float lambda = 1.55;
    // Filtered along the furrows' own bearing, which is shore-normal.
    // Tightened in R2b: at the 9-degree grazing plate the shore-normal
    // footprint is 19 cm and a 1.55 m furrow is eight pixels, which printed a
    // hard diagonal hatch across the far third of 06-wet-fringe.
    float fade = 1.0 - smoothstep(0.050, 0.105, ddPxS / lambda);
    if (fade <= 0.002) return 0.0;
    // Broken into runs along the shore: a council rake works in passes and
    // stops, it does not stripe forty metres of beach without a break.
    float run = smoothstep(0.44, 0.78, ddsNoise(vec2(p.x * 0.055, 7.3)))
              * smoothstep(0.36, 0.70, ddsNoise(vec2(p.x * 0.017, 43.9)));
    if (run <= 0.01) return 0.0;
    float wander = ddsNoise(vec2(p.x * 0.020, 19.1)) * 2.4
                 + ddsNoise(vec2(p.x * 0.145, 29.7)) * 0.30;
    // Irregular PITCH, not just an irregular offset. Passes of a rake are
    // not evenly spaced, and an evenly spaced comb puts a single hard line
    // in the autocorrelation whatever its phase does.
    float ph = (p.y + wander) / lambda
             + 1.30 * ddsNoise(vec2(p.x * 0.100, p.y * 0.055));
    // One-sided: the furrow is a groove, the ground between is untouched.
    float c = max(0.0, -sin(ph * 6.2831853));
    // Narrow. At 0.62 the groove covered half the ground and read as printed
    // corduroy in 09-pier-water; a tine cuts a line, it does not shade a
    // stripe.
    return -pow(c, 1.70) * fade * band * run;
  }

  /**
   * Where people actually walk: out of the three stair bays, through the two
   * umbrella rows, thinning before the swash. Untouched sand under a crowd is
   * the loudest tell a beach can have.
   */
  float ddTrafficAt(vec2 p, float front) {
    float shore = p.y;
    float band = smoothstep(5.5, 9.5, shore) * (1.0 - smoothstep(20.0, 30.0, shore));
    float clump = smoothstep(0.28, 0.70, ddsNoise(vec2(p.x * 0.14, 2.7)));
    float crowd = band * (0.30 + 0.70 * clump);
    float lane = 0.0;
    for (int i = 0; i < 3; i += 1) {
      float bay = uBayCentre + (float(i) - 1.0) * uBaySpread;
      float wob = (ddsNoise(vec2(shore * 0.055, float(i) * 5.1)) - 0.5) * 8.0;
      float d = (p.x - (bay + wob)) / 2.6;
      lane = max(lane, exp(-d * d));
    }
    lane *= smoothstep(4.0, 9.0, shore) * (1.0 - smoothstep(-3.0, 2.0, front));
    return clamp(max(crowd * 0.85, lane), 0.0, 1.0);
  }

  /**
   * Footprints, modelled as DEPRESSIONS rather than as marks.
   *
   * Round 1 stamped a flat-topped core beside a flat-topped rim, so every print
   * was the same two-tone comma at the same size with no interior gradient and
   * nothing thrown around it — a stipple brush. Here the print is a paraboloid
   * bowl, so the shading sweeps continuously from the shadowed near wall to the
   * lit far rim; the collar of thrown sand is a separate ring outside it; and a
   * third, wider term roughens the ground around the print so the sand reads as
   * disturbed rather than as punched.
   *
   * Lanes come from a bearing field that turns fast enough for neighbouring
   * tracks to splay instead of running dead parallel, stride and foot size vary
   * per walker rather than per print, and the layer fades once a print is a
   * couple of pixels wide, leaving only the tonal scuffing at hero orbit.
   *
   * Returns (bowl, collar, disturbance).
   */
  vec3 ddPrints(vec2 p, float px, float traffic) {
    // P13-W4: single prints are a 25 m fact. The footprint window alone still
    // drew readable oval pairs across the whole wedge at beach-corner (d = 60),
    // where item 4 wants the LANE to carry the read instead.
    float vis = (1.0 - smoothstep(0.026, 0.068, px)) * ddPrintV;
    if (vis * traffic <= 0.004) return vec3(0.0);
    // Walkers live in 16 m cells, each with its OWN constant bearing measured
    // about its own centre. Rotating a global frame by a smooth field is the
    // same broken construction as the ripple's, and it curled the tracks into
    // arcs around the umbrellas.
    vec2 cellId = floor(p / 16.0);
    vec2 cellO = (cellId + 0.5) * 16.0;
    float bear = (ddsHash21(cellId + 5.0) - 0.5) * 2.7;
    float cb = cos(bear);
    float sb = sin(bear);
    vec2 pl = p - cellO;
    vec2 q = vec2(pl.x * cb + pl.y * sb, -pl.x * sb + pl.y * cb)
           + vec2(ddsHash21(cellId + 71.0), ddsHash21(cellId + 83.0)) * 9.0;
    float laneW = 2.40;
    float lane = floor(q.x / laneW);
    // Per walker, not per print: stride length, foot size and how far the feet
    // sit either side of the line of travel.
    float stride = 0.58 + 0.36 * ddsHash21(vec2(lane, 21.0));
    float straddle = 0.13 + 0.11 * ddsHash21(vec2(lane, 27.0));
    float walkSz = 0.80 + 0.42 * ddsHash21(vec2(lane, 33.0));
    float stepI = floor(q.y / stride);
    float on = ddsHash21(vec2(lane, 0.0) + 11.3);
    float run = ddsNoise(vec2(lane * 1.7, q.y * 0.055 + 3.0));
    if (on * 0.55 + run * 0.45 < 0.80 - clamp(traffic, 0.0, 1.0) * 0.46) return vec3(0.0);
    float foot = mod(stepI, 2.0) < 1.0 ? -straddle : straddle;
    vec2 key = vec2(lane, stepI);
    vec2 jit = vec2((ddsHash21(key) - 0.5) * 0.18, (ddsHash21(key + 7.9) - 0.5) * 0.22);
    vec2 d = q - (vec2((lane + 0.5) * laneW + foot, (stepI + 0.5) * stride) + jit);
    float toe = (ddsHash21(key + 3.3) - 0.5) * 0.55;
    float ca = cos(toe);
    float sa = sin(toe);
    vec2 dr = vec2(d.x * ca - d.y * sa, d.x * sa + d.y * ca);
    float sz = walkSz * (0.93 + 0.14 * ddsHash21(key + 15.1));
    float ex = dr.x / (0.082 * sz);
    float ey = dr.y / (0.158 * sz);
    float e2 = ex * ex + ey * ey;
    if (e2 > 4.0) return vec3(0.0);
    float e = sqrt(e2);
    // Paraboloid floor with a slightly squared shoulder, so the wall of the
    // print is steep where a real one is and the interior still has a gradient.
    float bowl = pow(max(0.0, 1.0 - e2 * 0.86), 0.72) * vis;
    float collar = exp(-pow((e - 1.24) / 0.26, 2.0)) * vis * 0.55;
    float disturb = exp(-pow((e - 1.00) / 0.85, 2.0)) * vis;
    return vec3(bowl, collar, disturb);
  }

  /**
   * Jittered specks — shell grit and dark mineral pepper.
   *
   * Round 1 ran these at one speck per two square metres, which is not grit,
   * it is punctuation. Reference sand at reading distance carries crisp
   * flecks by the hundred per square metre, and they are most of what makes
   * its Laplacian sigma fifty against our six: smooth value noise has no hard
   * edges at any amplitude, and a hard edge is what a grain of shell is.
   */
  float ddSpecks(vec2 p, float px, float cell, float seed, float rMin, float rVar,
                 float fill) {
    // R2b: the visibility window was (0.032, 0.080) and the cell floor 3.4 px.
    // At 05-sand-macro's own scored patch the footprint is about 4.9 cm, so
    // the flecks were already 71 % faded and their cell had been opened to
    // 17 cm — three per square metre, at the one framing where the reference
    // carries hundreds. Widening the window and dropping the floor to 2.6 px is
    // what puts hard edges back in the Laplacian; the hero-orbit footprint is
    // 10 cm and still lands at 4 % visibility, so W-R01a stays shut.
    float vis = 1.0 - smoothstep(0.042, 0.105, px);
    if (vis <= 0.004) return 0.0;
    // Hold the cell open to a few pixels so a distant beach gets fewer, larger
    // flecks instead of per-pixel confetti. Keyed on the WORST axis: on a
    // grazing view the shore-normal footprint is nearly four times the
    // along-shore one, and a fleck sized against the mean is a pixel tall.
    // Sub-pixel flecks average straight back out of the image, which is why
    // the near field of 05-sand-macro looked gritty and its scored patch — the
    // same flecks, four times further away — measured no Laplacian energy.
    cell = max(cell, ddPxD * 3.6);
    vec2 c = floor(p / cell);
    vec2 f = fract(p / cell);
    float k = ddsHash21(c + seed);
    if (k < 1.0 - fill) return 0.0;
    vec2 jit = vec2(ddsHash21(c + seed + 5.3), ddsHash21(c + seed + 11.9));
    float r = rMin + rVar * ddsHash21(c + seed + 19.1);
    // Never let a speck fall under a pixel on its NARROWEST screen axis.
    r = max(r, ddPxD * 1.05);
    float d = length((f - jit) * cell);
    return (1.0 - smoothstep(r * 0.55, r, d)) * vis;
  }

  /**
   * Wrack: weed and debris banked where the last high tide stopped.
   *
   * Round 1 drew this as a band-limited sine along the shore, which produced a
   * near-uniform dash on a 20-pixel cadence sitting exactly on the instantaneous
   * waterline — machine stitching, and arguably a worse read than no wrack at
   * all, because the eye names it as a graphic immediately. Two changes: it sits
   * at the BERM CREST, which is the high-water mark and does not move with the
   * swash; and the debris comes in size classes from a jittered cell field, so
   * a cuttlebone, a stick and a scatter of fine weed are different objects at
   * different sizes rather than one repeated stroke.
   *
   * Returns (mat coverage, discrete-item coverage).
   */
  vec2 ddWrack(vec2 p, float px, float front, float bermAt) {
    // W14-B: a broken dark stain 0.4 to 0.8 m wide at the storm line, with
    // 10 to 30 percent gaps, and a fainter older line behind it.
    float wrackC = ddWrackAt(bermAt);
    // taste-r1 (W15): 0.3 to 0.8 m wide (full width, soft edges), meandering 0.8 m along the shore,
    // 10 to 30 percent gaps. A shader mask only: the 5 cm mound of the geometry is unchanged.
    float wrackWob = (ddsNoise(vec2(p.x * 0.11, 6.2)) - 0.5) * 1.6 + (ddsNoise(vec2(p.x * 0.37, 2.1)) - 0.5) * 0.6;
    float wrackW = mix(0.30, 0.80, ddsNoise(vec2(p.x * 0.23, 9.1)));
    wrackW = max(wrackW, px * 1.6);
    float wdist = abs(front - wrackC - wrackWob);
    float fresh = 1.0 - smoothstep(wrackW * 0.30, wrackW * 0.55, wdist);
    float older = (1.0 - smoothstep(0.30, 0.60, abs(front - wrackC + 4.2 - wrackWob * 1.4))) * 0.38;
    float band = fresh + older;
    if (band <= 0.008) return vec2(0.0);
    float run = ddsFbm(vec2(p.x * 0.17, front * 0.30), 3);
    // taste-r1 (W15): about 25 percent of the line is open, in pieces 2 to 5 m long.
    float gaps = smoothstep(0.30, 0.44, ddsNoise(vec2(p.x * 0.21, 3.7))) * smoothstep(0.22, 0.34, ddsNoise(vec2(p.x * 0.83, 5.9)));
    float clump = gaps * smoothstep(0.20, 0.45, run);
    float mat = clamp(band * clump * (0.55 + 0.45 * (0.5 + ddBand(p, 3.1, px))), 0.0, 1.0);

    // Discrete debris, three size classes on their own cell grids.
    float item = 0.0;
    float vis = 1.0 - smoothstep(0.030, 0.075, px);
    if (vis > 0.004) {
      for (int i = 0; i < 3; i += 1) {
        float fi = float(i);
        float cell = 0.34 + fi * 0.62;
        vec2 c = floor(p / cell);
        float k = ddsHash21(c + fi * 13.7);
        if (k < 0.62 + fi * 0.13) continue;
        vec2 jit = vec2(ddsHash21(c + fi * 5.3 + 2.1), ddsHash21(c + fi * 11.9 + 4.4));
        // Size classes overlap so the line is graded, not sorted.
        float r = (0.020 + 0.055 * fi) * (0.55 + 1.10 * ddsHash21(c + fi * 19.1 + 6.6));
        // Sticks and weed fronds are long, pebbles and shells are not.
        float el = 1.0 + 2.6 * ddsHash21(c + fi * 23.3 + 8.8);
        float ang = ddsHash21(c + fi * 29.9 + 3.3) * 6.2831853;
        vec2 dl = (fract(p / cell) - jit) * cell;
        vec2 dq = vec2(dl.x * cos(ang) - dl.y * sin(ang), dl.x * sin(ang) + dl.y * cos(ang));
        float dd = length(vec2(dq.x / el, dq.y));
        item = max(item, (1.0 - smoothstep(r * 0.6, r, dd)) * vis);
      }
    }
    return vec2(mat, clamp(item * band * (0.35 + 0.65 * clump), 0.0, 1.0));
  }

  /**
   * The sand's own guard on the wet field. Above the highest possible run-up
   * the beach is dry by definition; without this the whole backshore inherits
   * whatever the swash function happens to return up there and the beach goes
   * grey and glossy from the waterline to the seawall.
   */
  float ddWetEnvelope(float front) {
    // R15: envelope must admit the 3–14 m per-segment tongue, not clip at 9.5.
    return smoothstep(-22.0, -0.8, front);
  }
  float ddWetEnvelopeAlong(float along, float front) {
    float jit = ddsNoise(vec2(along * 0.038, 9.2)) * 2.4
              + ddsNoise(vec2(along * 0.112, 3.4)) * 1.4;
    float jit2 = ddsNoise(vec2(along * 0.021, 14.6)) * 2.8
               + ddsNoise(vec2(along * 0.205, 6.1)) * 1.6;
    return smoothstep(-(16.0 + jit + jit2), -0.6 + jit * 0.20, front);
  }

  /**
   * Micro relief in metres. Drives BOTH the fragment normal and the occlusion
   * term in the albedo, because a diffuse surface lit from near its own normal
   * gets almost nothing from a normal map alone — which is the other half of
   * why the round-1 beach measured a Laplacian sigma of 3.7 against 54.6.
   */
  vec2 ddSandMicro(vec2 p, float px, float front, float traffic, float wet) {
    float dryness = 1.0 - wet * 0.62;
    vec2 rel = ddSandRelief(p, px);
    float fine = rel.x - rel.y;
    float h = rel.x;
    float d = ddRipple(p, px, front) * 0.0320 * (0.42 + 0.58 * dryness)
            * (1.0 - traffic * 0.60);
    // Hard XOR, and mute the damp card where both used to print the waffle.
    d += ddRake(p, px, front) * 0.0055 * dryness * (1.0 - traffic);
    vec3 pr = ddPrints(p, px, traffic);
    d += pr.y * 0.009 - pr.x * 0.050;
    // Sand thrown out of a print does not land smooth.
    d += pr.z * ddBand(p + 7.7, 9.0, px) * 0.016;
    // P13-W4 wind-ripple relief. One law: the same ddWindRip the albedo uses,
    // so the crest that is bright is the crest that occludes, and both die
    // together with camera distance. W2 kept a second inline copy here with
    // its own loosened fade, which is why the ridges survived every attempt to
    // damp them in the tone.
    d += ddWindRip(p, px, front, dryness) * ${Number(SAND_W4.rippleRelief).toFixed(3)};
    return vec2(h + d, fine + rel.y * 0.35 + d);
  }

  /**
   * P13-W2 whole-beach micro-surface. Zero-mean value only — hue stays
   * SAND_HUES. Frequencies are world metres; each band is footprint-faded.
   */
  float ddSurfGrain(vec2 p, float px) {
    if (!(p.x < 1.0e8 && p.x > -1.0e8)) p.x = 0.0;
    if (!(p.y < 1.0e8 && p.y > -1.0e8)) p.y = 0.0;
    float gB = ddBand(p + 201.0, ${(1 / SHORE.sandGrainB).toFixed(3)}, px) * 2.0;
    float gA = ddBand(p + 217.0, ${(1 / SHORE.sandGrainA).toFixed(3)}, px) * 2.0;
    return clamp(gB * 0.62 + gA * 0.48, -1.0, 1.0);
  }

  /**
   * P13-W4 wind ripple.
   *
   * Three changes against W2, all of them about stopping one wave vector from
   * owning the frame. (a) Visibility is ddRipV, the camera-distance law —
   * full inside twelve metres, a quarter at forty, nothing past eighty-five.
   * (b) The bearing swings ±25° through a 22 / 30 m direction field, so the
   * train in one 10 m patch is not the train in the next. (c) The amplitude
   * mottles all the way to zero over a 13 / 19 m cell, so it stops and starts
   * instead of running the length of the beach. The anti-alias fade goes back
   * to the file's own band-limit window, measured along the ripple's OWN
   * bearing rather than the shore-normal axis.
   */
  /**
   * Where the ripple train IS, without its phase — the amplitude envelope.
   *
   * A rippled patch of sand is not the same tone as a smooth one even at a
   * distance where no individual crest is resolvable: coarse pale grains
   * collect on the crests and fines settle in the troughs. Fading the whole
   * field to nothing rather than to that cast is what walked the mid-beach
   * windows when the corduroy came out, and it is also what left a beach with
   * no organisation once the stripes were gone.
   */
  float ddWindRipGate(float front, float dry) {
    return (1.0 - smoothstep(${(-SHORE.sandWindRippleFade).toFixed(1)}, 0.0, front)) * dry;
  }

  /** Raw 0..1 amplitude field, 13 / 19 m cells. Reaches zero on purpose. */
  float ddWindRipEnv(vec2 p) {
    if (!(p.x < 1.0e8 && p.x > -1.0e8)) return 0.0;
    if (!(p.y < 1.0e8 && p.y > -1.0e8)) return 0.0;
    float mott = ddsNoise(vec2(p.x * ${Number(SAND_W4.rippleMottA).toFixed(3)}, p.y * 0.090 + 41.0)) * 0.60
               + ddsNoise(vec2(p.x * ${Number(SAND_W4.rippleMottB).toFixed(3)}, p.y * 0.061 + 88.0)) * 0.40;
    return smoothstep(0.34, 0.78, mott);
  }

  float ddWindRipAmp(vec2 p, float front, float dry) {
    float gate = ddWindRipGate(front, dry);
    if (gate <= 0.01) return 0.0;
    return ddWindRipEnv(p) * gate;
  }

  /**
   * The cast the ripple leaves behind once its phase has faded out with
   * distance.
   *
   * A ripple field is not zero-mean in the picture even though its albedo
   * term is: the relief tips crests toward the sun and the lee faces are
   * still carried by the ambient, so rippled ground renders a shade BRIGHTER
   * than smooth ground. Measured on the mid-beach difference image, whose
   * spectrum is dominated by the 0.83-0.88 m bin, that gain is about 1.7 %.
   * Fading the field to nothing rather than to this tone takes the value with
   * it. Crossfaded against ddRipV so the beach never doubles the read.
   */
  float ddWindRipCast(vec2 p, float front, float dry) {
    float gate = ddWindRipGate(front, dry);
    if (gate <= 0.01) return 0.0;
    return ddWindRipEnv(p) * gate * (1.0 - ddRipV);
  }

  float ddWindRip(vec2 p, float px, float front, float dry) {
    if (ddRipV <= 0.004) return 0.0;
    // The envelope carries the front fade and the amplitude mottling; this
    // function only adds a bearing and a phase to it.
    float amp = ddWindRipAmp(p, front, dry);
    if (amp <= 0.004) return 0.0;
    if (!(p.x < 1.0e8 && p.x > -1.0e8)) p.x = 0.0;
    if (!(p.y < 1.0e8 && p.y > -1.0e8)) p.y = 0.0;
    float lam = ${Number(SHORE.sandWindRipplePitch).toFixed(2)};
    // Direction field. Base bearing is shore-normal (crests run along-shore).
    float turn = ddsNoise(vec2(p.x * ${Number(SAND_W4.rippleTurnA).toFixed(3)}, p.y * 0.062 + 17.0)) * 0.62
               + ddsNoise(vec2(p.x * ${Number(SAND_W4.rippleTurnB).toFixed(3)}, p.y * 0.028 + 5.0)) * 0.38;
    float ang = (turn - 0.5) * ${(2 * SAND_W4.rippleTurnDeg * Math.PI / 180).toFixed(4)};
    vec2 dir = vec2(sin(ang), cos(ang));
    float fd = 1.0 - smoothstep(0.15, 0.34, ddDirPx(dir) / lam);
    if (fd <= 0.002) return 0.0;
    float warp = ddsNoise(vec2(p.x * 0.11, p.y * 0.07 + 9.4)) * 1.1;
    float s = sin((dot(p, dir) + warp) * (6.2831853 / lam));
    return sign(s) * pow(abs(s), 0.78) * fd * amp * ddRipV;
  }

  /**
   * W10 plate-scale wind organisation. The 4.7 / 7.3 m phases are warped by
   * two non-periodic fields and blended softly; this is a broad tonal rake,
   * not a second relief corrugation, so it survives distance without aliasing.
   */
  float ddPlateWind(vec2 p, float dry) {
    if (dry <= 0.002) return 0.0;
    vec2 dA = normalize(vec2(0.238, 0.971));
    vec2 dB = normalize(vec2(-0.487, 0.873));
    float warpA = (ddsNoise(p * 0.037 + vec2(17.2, 4.1)) - 0.5) * 5.4;
    float warpB = (ddsNoise(p * 0.021 + vec2(3.7, 29.4)) - 0.5) * 8.1;
    float a = sin((dot(p, dA) + warpA) * (6.2831853 / ${SAND_W10.plateRippleM.toFixed(2)}));
    float b = sin((dot(p, dB) + warpB) * (6.2831853 / ${SAND_W10.plateCrossM.toFixed(2)}));
    float mottle = 0.45 + 0.55 * ddsNoise(vec2(p.x * 0.049, p.y * 0.031 + 61.0));
    return clamp((a * 0.70 + b * 0.30) * mottle, -1.0, 1.0) * dry;
  }

  float ddDuneMott(vec2 p, float px) {
    if (!(p.x < 1.0e8 && p.x > -1.0e8)) p.x = 0.0;
    float a = ddBand(vec2(p.x / 4.2, p.y * 1.55) + 9.1, ${(1 / SHORE.sandMottleB).toFixed(4)}, px) * 2.0;
    float b = ddBand(vec2(p.x / 3.1, p.y * 1.25) + 41.0, ${(1 / SHORE.sandMottleA).toFixed(4)}, px) * 2.0;
    return clamp(a * 0.62 + b * 0.48, -1.0, 1.0);
  }

  float ddDriftLines(vec2 p, float px, float front) {
    float vis = 1.0 - smoothstep(0.55, 1.40, px);
    if (vis <= 0.004) return 0.0;
    float w = ${Number(SHORE.sandDriftWidth).toFixed(2)};
    float wob = ddsNoise(vec2(p.x * 0.055, 5.7)) * 0.55;
    float gA = exp(-pow((front - ${Number(SHORE.sandDriftFrontA).toFixed(2)} - wob) / w, 2.0));
    float gB = exp(-pow((front - ${Number(SHORE.sandDriftFrontB).toFixed(2)} + wob * 0.6) / (w * 1.15), 2.0));
    float gapA = smoothstep(0.30, 0.68, ddsNoise(vec2(p.x * 0.070, 14.2)));
    float gapB = smoothstep(0.28, 0.66, ddsNoise(vec2(p.x * 0.052, 27.8)));
    return (gA * gapA + gB * gapB * 0.88) * vis;
  }

  /**
   * Sparse oval pairs from the three stair bays down to the water. Own
   * vis window so a print still reads at mid-beach (the cell walker in
   * ddPrints fades earlier).
   */
  float ddStairTrails(vec2 p, float px, float front) {
    float vis = 1.0 - smoothstep(0.10, 0.28, px);
    float band = smoothstep(-18.0, -4.0, front) * (1.0 - smoothstep(0.4, 3.5, front));
    if (vis * band <= 0.004) return 0.0;
    float acc = 0.0;
    for (int i = 0; i < 3; i += 1) {
      float bay = uBayCentre + (float(i) - 1.0) * uBaySpread;
      float wob = (ddsNoise(vec2(p.y * 0.045, float(i) * 6.3)) - 0.5) * 6.5;
      float stride = 0.62 + 0.10 * ddsHash21(vec2(float(i), 21.0));
      float stepI = floor(p.y / stride);
      float on = ddsHash21(vec2(float(i) * 3.1 + stepI, 8.4));
      if (on < 0.58) continue;
      float foot = mod(stepI, 2.0) < 1.0 ? -0.14 : 0.14;
      vec2 dlt = p - vec2(bay + wob + foot, (stepI + 0.5) * stride);
      float ex = dlt.x / 0.085;
      float ey = dlt.y / 0.155;
      float e2 = ex * ex + ey * ey;
      if (e2 > 3.2) continue;
      acc = max(acc, pow(max(0.0, 1.0 - e2 * 0.72), 0.70));
    }
    return acc * vis * band;
  }

  /**
   * P13-W4 desire paths.
   *
   * What reads on a beach from sixty metres is not a footprint, it is the
   * LANE. Where a few hundred people a day walk from the stairs to the water
   * the sand is packed: darker because it is compacted and damper, smoother
   * because every grain has been trodden flat, with a pale blown-out margin
   * either side where the loose stuff has been kicked out of the way. Three
   * lanes off the stair bays and one off the kiosk at the wrap. 1.24–1.92 m
   * wide, soft-edged, and no pixel-footprint gate: this is broad value and it
   * is meant to survive every pose in the pack.
   *
   * Returns (core, blown-out margin).
   */
  vec2 ddDesirePath(vec2 p, float front, float cornerM) {
    float band = smoothstep(${Number(SAND_W4.pathFrom).toFixed(1)}, ${(SAND_W4.pathFrom + 8).toFixed(1)}, front)
      * (1.0 - smoothstep(${(SAND_W4.pathTo - 3.8).toFixed(1)}, ${Number(SAND_W4.pathTo).toFixed(1)}, front));
    if (band <= 0.004) return vec2(0.0);
    if (!(p.x < 1.0e8 && p.x > -1.0e8)) return vec2(0.0);
    float alongHalfM = max(uAlongHalf, 1.0);
    float core = 0.0;
    float blown = 0.0;
    for (int i = 0; i < 6; i += 1) {
      // Lanes 0-2 leave the three stair bays on the straight face. Lanes 3-5
      // are the corner wedge's own: past the board end, off the kiosk and the
      // promenade steps, and only inside the P13 mask. Their seats dodge the
      // rock pool (along 8.0) and the W3 tyre grooves (along 3.15).
      float bay = uBayCentre + (float(i) - 1.0) * uBaySpread;
      float gate = 1.0;
      if (i >= 3) {
        bay = uBayCentre + alongHalfM + 13.0 + (float(i) - 3.0) * 8.0;
        gate = cornerM;
      }
      if (gate <= 0.01) continue;
      // A walked lane wanders. Two scales so it is neither a ruler nor a
      // sine: a long drift and a short kink.
      float sway = (ddsNoise(vec2(p.y * 0.055, float(i) * 7.7)) - 0.5) * 7.0
                 + (ddsNoise(vec2(p.y * 0.145, float(i) * 3.1 + 21.0)) - 0.5) * 1.6;
      float halfW = ${Number(SAND_W4.pathHalfMin).toFixed(2)}
        + ${Number(SAND_W4.pathHalfVar).toFixed(2)} * ddsHash21(vec2(float(i), 12.0));
      float d = abs(p.x - (bay + sway));
      // Traffic thins toward the water, so the lane narrows as it goes.
      float taper = 0.72 + 0.28 * (1.0 - smoothstep(-14.0, 1.0, front));
      float hw = halfW * taper;
      float c = 1.0 - smoothstep(hw * 0.55, hw * 1.05, d);
      float b = smoothstep(hw * 0.75, hw * 1.25, d) * (1.0 - smoothstep(hw * 1.5, hw * 2.6, d));
      core = max(core, c * gate);
      blown = max(blown, b * gate);
    }
    return vec2(core, blown) * band;
  }

  float ddWrapWrack(vec2 p, float px, float front, float cornerM) {
    if (cornerM < 0.01) return 0.0;
    float vis = 1.0 - smoothstep(0.28, 0.70, px);
    float band = exp(-pow((front + 3.4) / 0.55, 2.0));
    float gap = smoothstep(0.32, 0.68, ddsNoise(vec2(p.x * 0.070, 88.1)));
    return band * gap * vis * cornerM;
  }

  float ddTussockAmt(vec2 p, float front, float cornerM) {
    if (cornerM < 0.01) return 0.0;
    float ridge = exp(-pow((front - ${Number(SHORE.cornerBermAt).toFixed(2)}) / ${Number(SHORE.cornerBermHalfW).toFixed(2)}, 2.0));
    if (ridge < 0.05) return 0.0;
    vec2 tc = floor(p / 1.85);
    float hk = ddsHash21(tc + 19.7);
    float clump = smoothstep(0.46, 0.80, hk);
    vec2 f = fract(p / 1.85) - 0.5;
    float d2 = dot(f, f);
    float blob = max(0.0, 1.0 - d2 * 5.8);
    return blob * clump * ridge * cornerM;
  }

  /**
   * P13-W3 fragment wrap-front from world XZ — not the interpolated varying.
   * Linear interpolation of polar front across a cartesian triangle is the
   * cream n-gon; this is the analytic iso-front.
   */
  float ddFrontFrag(vec3 w) {
    float al = ddAlong(w);
    float sh = ddShoreDist(w);
    if (!(al < 1.0e8 && al > -1.0e8)) al = vSandAlong;
    if (!(sh < 1.0e8 && sh > -1.0e8)) sh = vSandShore;
    return ddWrapFront(al, sh, uTime);
  }

  /** Two tyre grooves from the promenade toe across the wrap wet band. */
  float ddCornerTyre(vec2 p, float px, float front, float cornerM) {
    if (cornerM < 0.01) return 0.0;
    float vis = 1.0 - smoothstep(0.24, 0.72, px);
    if (vis < 0.004) return 0.0;
    float alongHalfM = max(uAlongHalf, 1.0);
    float extra = abs(p.x - uBayCentre) - alongHalfM;
    float wrapGate = smoothstep(-6.0, 1.5, extra);
    if (wrapGate < 0.01) return 0.0;
    float along0 = uBayCentre + alongHalfM + 3.15;
    float acc = 0.0;
    for (int i = 0; i < 2; i++) {
      float lane = along0 + (float(i) - 0.5) * 1.48;
      float wob = (ddsNoise(vec2(p.y * 0.085, float(i) * 5.1 + 2.2)) - 0.5) * 0.62;
      float d = abs(p.x - (lane + wob));
      acc = max(acc, exp(-pow(d / 0.095, 2.0)));
    }
    float run = smoothstep(-18.0, -3.0, front) * (1.0 - smoothstep(0.8, 3.6, front));
    return acc * run * vis * wrapGate * cornerM;
  }

  /** Stair-to-water prints that actually cross the wrap wet band. */
  float ddCornerPrints(vec2 p, float px, float front, float cornerM) {
    if (cornerM < 0.01) return 0.0;
    float vis = 1.0 - smoothstep(0.12, 0.34, px);
    float band = smoothstep(-16.0, -1.5, front) * (1.0 - smoothstep(0.6, 3.2, front));
    if (vis * band < 0.004) return 0.0;
    float alongHalfM = max(uAlongHalf, 1.0);
    float extra = abs(p.x - uBayCentre) - alongHalfM;
    float wrapGate = smoothstep(-8.0, 1.0, extra);
    if (wrapGate < 0.01) return 0.0;
    float acc = 0.0;
    float along0 = uBayCentre + alongHalfM + 2.4;
    for (int i = 0; i < 2; i++) {
      float lane = along0 + (float(i) - 0.5) * 0.95;
      float stride = 0.58 + 0.08 * float(i);
      float stepI = floor(p.y / stride);
      float on = ddsHash21(vec2(float(i) * 4.7 + stepI, 19.2));
      if (on < 0.42) continue;
      float foot = mod(stepI, 2.0) < 1.0 ? -0.12 : 0.12;
      float wob = (ddsNoise(vec2(p.y * 0.05, float(i) * 3.3)) - 0.5) * 0.55;
      vec2 dlt = p - vec2(lane + wob + foot, (stepI + 0.5) * stride);
      float ex = dlt.x / 0.078;
      float ey = dlt.y / 0.145;
      float e2 = ex * ex + ey * ey;
      if (e2 > 3.0) continue;
      acc = max(acc, pow(max(0.0, 1.0 - e2 * 0.74), 0.70));
    }
    return acc * vis * band * wrapGate * cornerM;
  }

  /**
   * At plate distance an individual 8 cm sole must disappear, but the paired
   * compacted route it leaves must not. This is that route: two soft,
   * intermittently scuffed lanes sharing the close-print alignment, with no
   * pixel-footprint gate and no repeating 20 m tile.
   */
  float ddPlateFootTraffic(vec2 p, float front, float cornerM) {
    if (cornerM < 0.01) return 0.0;
    float alongHalfM = max(uAlongHalf, 1.0);
    float extra = abs(p.x - uBayCentre) - alongHalfM;
    float wrapGate = smoothstep(-8.0, 1.0, extra);
    float band = smoothstep(-17.0, -3.0, front)
      * (1.0 - smoothstep(0.5, 3.4, front));
    float along0 = uBayCentre + alongHalfM + 2.4;
    float lanes = 0.0;
    for (int i = 0; i < 2; i++) {
      float lane = along0 + (float(i) - 0.5) * 0.95;
      float wob = (ddsNoise(vec2(p.y * 0.041, float(i) * 7.3 + 11.0)) - 0.5) * 0.64;
      float d = abs(p.x - lane - wob);
      lanes = max(lanes, 1.0 - smoothstep(0.18, 0.48, d));
    }
    float scuff = 0.58 + 0.42 * ddsNoise(vec2(p.y * 0.083, p.x * 0.029 + 37.0));
    return lanes * scuff * band * wrapGate * cornerM;
  }

  /** Reach-line wrack clumps (mask only). Fainter than the two dry drifts. */
  float ddCornerReachWrack(vec2 p, float px, float front, float cornerM) {
    if (cornerM < 0.01) return 0.0;
    float vis = 1.0 - smoothstep(0.32, 0.88, px);
    float wob = ddsNoise(vec2(p.x * 0.058, 11.4)) * 0.65;
    float g = exp(-pow((front - ${Number(SHORE.sandDriftFrontC).toFixed(2)} - wob) / 0.40, 2.0));
    float gap = smoothstep(0.38, 0.70, ddsNoise(vec2(p.x * 0.095, 51.6)));
    float cell = 0.85;
    vec2 c = floor(p / cell);
    float k = ddsHash21(c + 29.4);
    float item = 0.0;
    if (k > 0.55) {
      vec2 jit = vec2(ddsHash21(c + 4.2), ddsHash21(c + 8.8));
      float d = length((fract(p / cell) - jit) * cell);
      item = 1.0 - smoothstep(0.07, 0.16, d);
    }
    return (g * gap * 0.55 + item * g) * vis * cornerM;
  }

  /**
   * P13-A8 item 1a — the three shoreline bands, mask only.
   *
   * x = wet gradient, y = swash film, z = foam threads. All three are keyed
   * on the ANALYTIC wrap-front the caller already computed, and all three live
   * INLAND of it, where the shelf is opaque, so the widening is a colour fact
   * and not an alpha one: W3's 0.6 m dissolve and the 0.04 m seaward cap are
   * untouched. The run-up line wanders on two scales so no band is a circle
   * concentric with the iso-front — that would trade a razor for a rainbow.
   */
  /**
   * ── P16-PM1 — THE BANDS ARE KEYED ON HEIGHT, NOT ON front. ──
   *
   * front is where the WATERLINE is on the flat; it is not where the SAND
   * leaves the water. Measured on the fixed section (GPU readback, four
   * bearings), the shelf crosses the drawn sheet at front -0.4, -1.7, -2.75 and
   * -2.8 — a 2.4 m wander along a 75 m arc, because ddFaceLen varies the face
   * width by design. Bands authored at fixed fronts therefore sit anywhere from
   * on the waterline to entirely underwater, and at the flattest bearings the
   * whole 2.3 m wet band was drawn under the sea.
   *
   * The shelf's own height above the sheet is available per fragment and it is
   * the quantity that actually says "this sand is at the water". Converting it
   * back to metres of run at the section's seaward slope gives a front that is
   * zero exactly where the sand meets the water, whatever the local face does.
   * Outside the corner mask cornerM is 0 and none of this is on the path.
   */
  float ddShoreFront(vec3 w, float front) {
    float above = w.y - ${Number(SAND_PM1.seaTop).toFixed(4)};
    float run = above / ${Number(SAND_PM1.seawardFall).toFixed(3)};
    // Height alone is not enough and the first cut proved it on the plate: the
    // corner BACKSHORE sits 0.055–0.13 m over the sheet — 0.6 to 1.3 m of run —
    // so a pure height key painted the whole dry beach as swash and put a
    // twenty-metre pale blue lagoon in the middle of corner-close. Height
    // says how far the sand is from the water; PLAN says whether it is the
    // beach face at all. Both gates, and the flat front everywhere else.
    float k = (1.0 - smoothstep(1.6, 5.0, abs(run)))
            * (1.0 - smoothstep(6.0, 14.0, abs(front)));
    return mix(front, -run, k);
  }

  vec3 ddShoreBands(vec2 p, float px, float front, float cornerM) {
    if (cornerM < 0.01) return vec3(0.0);
    // Where the last run-up stopped, in metres of front. Two scales: a slow
    // 30 m swing plus a 6 m kink, so the line reads as surf and not as an arc.
    float run = (ddsNoise(vec2(p.x * 0.033, 4.7)) - 0.5) * 2.0
              + (ddsNoise(vec2(p.x * 0.170, 27.3)) - 0.5) * 0.9;
    run *= ${Number(SAND_A8.runupWobble).toFixed(2)};
    float f = front - run;
    float wet = smoothstep(${Number(SAND_A8.wetFrom).toFixed(2)}, ${Number(SAND_A8.wetTo).toFixed(2)}, f);
    float swash = smoothstep(${Number(SAND_A8.swashFrom).toFixed(2)}, ${Number(SAND_A8.swashTo).toFixed(2)}, f);
    // Foam RISES through the run-up and HOLDS to the cut, then dies offshore.
    // A symmetric band peaked on the front was the first pass, and the ocean
    // eats the last half-metre of shelf, so most of that band was never drawn.
    // Its own wobble, so the white edge is not parallel to the wet band's.
    float runF = (ddsNoise(vec2(p.x * 0.052, 33.1)) - 0.5) * 1.6
               + (ddsNoise(vec2(p.x * 0.240, 9.8)) - 0.5) * 0.7;
    float ff = front - runF * ${Number(SAND_A8.runupWobble).toFixed(2)};
    float foamBand = smoothstep(${Number(SAND_A8.foamFrom).toFixed(2)}, ${Number(SAND_A8.foamMid).toFixed(2)}, ff)
      * (1.0 - smoothstep(${Number(SAND_A8.foamTo).toFixed(2)}, ${(SAND_A8.foamTo + SAND_A8.foamFade).toFixed(2)}, ff));
    // Threads. Surf arrives in cells, and the FIRST pass got this wrong in a
    // way worth recording: the whole breakup hung off a pixel-footprint fade,
    // so at user-corner (d = 150) it collapsed to a constant and the shore came
    // back as an even white ribbon — a drawn line traded for a razor. The
    // 9 m and 3.2 m gap fields are resolvable at every pose in the pack and
    // always apply; only the 0.5 m lace fades with the footprint.
    float gapA = smoothstep(0.24, 0.62, ddsNoise(vec2(p.x * 0.110, 71.9)));
    float gapB = 0.30 + 0.70 * smoothstep(0.28, 0.72, ddsNoise(vec2(p.x * 0.310, 44.2)));
    float fine = 0.40 + 0.60 * ddsNoise(vec2(p.x * 1.900, 13.4));
    float fineVis = 1.0 - smoothstep(0.55, 1.60, px);
    float broken = foamBand * gapA * gapB * mix(1.0, fine, fineVis);
    // W10: retain a coherent main crest (high floor, long modulation) and let
    // a finer offset thread carry the spume. The former multiplicative gaps
    // remain as edge texture but cannot leave aspect<2 foam islands.
    float crestFlow = ${SAND_W10.foamCrestFloor.toFixed(2)}
      + ${(1 - SAND_W10.foamCrestFloor).toFixed(2)}
      * smoothstep(0.20, 0.80, ddsNoise(vec2(p.x * 0.071, p.y * 0.019 + 84.0)));
    float spumeBand = exp(-pow((ff + 0.18) / 0.16, 2.0));
    float spume = spumeBand * (${SAND_W10.foamCrestFloor.toFixed(2)}
      + ${(1 - SAND_W10.foamCrestFloor).toFixed(2)}
      * ddsNoise(vec2(p.x * 0.135, 122.0))) * ${SAND_W10.foamSpumeAmt.toFixed(2)};
    float foam = max(broken, foamBand * crestFlow * 0.82 + spume);
    return vec3(wet, swash, foam) * cornerM;
  }

  /** Lower-amp wind ripple that continues into the wet band (mask only). */
  float ddCornerWetRip(vec2 p, float px, float front, float wet, float cornerM) {
    if (cornerM < 0.01) return 0.0;
    float keep = ${Number(SHORE.sandWetRippleKeep).toFixed(2)}
      * smoothstep(0.08, 0.55, wet) * (1.0 - smoothstep(0.88, 1.0, wet));
    if (keep < 0.01) return 0.0;
    return ddWindRip(p, px, min(front, -0.4), 1.0) * keep * cornerM;
  }
`;

/**
 * Beach shelf material. Standard-lit (so it sits in the same light as the
 * board) with a heavily reworked albedo / normal / roughness path.
 *
 * @param {{
 *   shoreOrigin: THREE.Vector3,
 *   shoreNormal: THREE.Vector3,
 *   quality?: string,
 *   alongLength?: number,
 *   register?: Record<string, {value: unknown}>,
 * }} opts
 */
export function makeSandMaterial({
  shoreOrigin, shoreNormal, quality = 'high', alongLength, alongHalf, register, coastSpine = null,
}) {
  const srgb = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.96,
    metalness: 0.0,
    transparent: true,
    depthWrite: true,
    dithering: true,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 4,
  });
  material.userData.beachSand = true;
  // taste-r1 (W15): the two 768 px photograph tiles (6 MiB, one 2 m repeat) are no longer loaded. The sand
  // surface is the coast pack's sandDry / sandWet channels as luminance under the sand token hue.
  const coastPack = loadCoastPack('coast');
  // W14-B fix: the foam pack's swash channel breaks the swash lace into tongues (foam.js ddSwashSurface).
  const lacePack = loadCoastPack('foam');
  material.userData.coastSand = { repeatM: 12, size: 1024, pack: 'coast' };

  // Sand is a diffuse mineral, not a lacquered board piece. Left at the default
  // family response the wet fringe picks the sky up hard enough to read as
  // polished concrete.
  material.userData.envIntensityBase = 0.5;

  // Along-coordinate of the shore-frame origin, matching contract ddAlong().
  const bayCentre = shoreOrigin.x * shoreNormal.z - shoreOrigin.z * shoreNormal.x;
  // board.js puts three stair bays at ±0.275 × board length from centre.
  const span = alongLength ?? lastAlongLength;
  const baySpread = span * 0.264;

  const shared = {
    uTime: { value: 0 },
    uShoreOrigin: { value: shoreOrigin.clone() },
    uShoreNormal: { value: shoreNormal.clone() },
    uWaterFace: { value: WATER_FACE },
    uBathyMaxDepth: { value: 9.0 },
    uBathyRamp: { value: 165 },
    uBathyBarAt: { value: 55 },
    uBathyBarWidth: { value: 26 },
    uBathyBarRise: { value: 1.35 },
    // Foam module uniforms (ddSwashWet needs these).
    uFoamColor: { value: srgb('#f3efe4') },
    uFoamShadow: { value: srgb('#d4d2c6') },
    uFoamTint: { value: srgb('#c5cfc8') },
    uFoamBreakGain: { value: 2.10 },
    uFoamBoreGain: { value: 0.92 },
    uFoamCapGain: { value: 0.52 },
    uFoamSwashGain: { value: 0.0 },
    uFoamLaceGain: { value: 0.0 },
    uSwashReach: { value: quality === 'low' ? 7.0 : 9.5 },
    // 1 in clear sky; Water.update sets it to TASTE_RAIN.wetAlbedo.sand in the rain states.
    uSandRainAlbedo: { value: 1 },
    uAlongHalf: { value: Number.isFinite(alongHalf) ? alongHalf : 1e6 },
    // Beach profile. The crest height is DERIVED from the face so the shelf
    // always lands on still water at front = 0 — see ddBermCrest.
    uBeachSlope: { value: 0.064 },
    // R2b: 0.34 over 1.25 m was a 15-degree mean scarp, which at the 9-degree
    // grazing plate barely clears the viewing angle and never occludes. 0.44
    // over 1.05 m is 23 degrees mean and 34 at its steepest.
    // taste-r1 (W14-B): a 1.6 m scarp with a 0.40 m drop (was 4.4 m and 0.50 m),
    // so the berm crest shows a lit-side step, about 1 in 4 locally.
    uScarpDrop: { value: 0.30 },
    uScarpLen: { value: 3.40 },
    uCuspAmp: { value: 0.175 },
    uWindAmp: { value: 0.110 },
    uBenchAmp: { value: 0.055 },
    // Tracks.
    uBayCentre: { value: bayCentre },
    uBaySpread: { value: baySpread },
    // Palette. Warm bay quartz, rotated off the round-1 yellow (measured hue
    // 36-42 against a 28-36 target) and given back the chroma the reference
    // carries. Wet sand DARKENS AND DEEPENS: the round-1 wet mixes ran to a
    // grey-olive and took saturation 0.387 to 0.120, which reads as wet cement.
    //
    // R2b: darkened about 10 % and given back 40 % of chroma. `sand-r8a`
    // measured the scored patch at luma 178 against the § 4.1 band of 145-170
    // and chroma 55 against the reference's 81-107, so the beach was reading
    // pale AND washed at the same time. Hue is held at 30-33 degrees, which is
    // the reference's orange tan rather than the 36-42 yellow of round 1.
    // W-R51: honey quartz, not burnt ochre. Less chroma, higher luma, cooler
    // shadows so grain pits do not read as scorch marks.
    uSandDry: { value: srgb(SAND_HUES.dry) },
    uSandPale: { value: srgb(SAND_HUES.pale) },
    uSandWarm: { value: srgb('#c4a46c') },
    uSandShadow: { value: srgb('#8a7358') },
    uSandDamp: { value: srgb(SAND_HUES.damp) },
    uSandWet: { value: srgb(SAND_HUES.wet) },
    uSandDeep: { value: srgb('#84714c') },
    uWrackDark: { value: srgb('#4a4030') },
    uWrackPale: { value: srgb('#9a8a68') },
    uTussock: { value: srgb('#6a6840') },
    uRock: { value: srgb('#6a5a48') },
    uPoolFoam: { value: srgb('#d4d0c4') },
    uPoolTint: { value: srgb(SHORE.cornerPoolTint ?? '#245a56') },
    // P13-W4: what a film of water on sand actually reflects at grazing. The
    // scene background is #4a7ab0; near the horizon it is paler and greyer,
    // and a white highlight on warm sand reads as varnish.
    uSandSky: { value: srgb(SAND_W4.skyTint) },
    // P13-A8 item 1a: the swash film and its foam. Separate colours, because a
    // sheet of water over sand is a dark grey-teal and the white is only in the
    // threads — tinting both toward one value is how a shoreline becomes a
    // gradient smear instead of a shoreline.
    uSandSwash: { value: srgb(SAND_A8.swashTint) },
    uSandFoam: { value: srgb(SAND_A8.foamTint) },
  };
  // Palette VALUES are sand-owned. Reuse a register wrapper when it
  // already has the key (one GPU object) but copy these Colors into it
  // so a planted white/stale uSandDry cannot win.
  const sandAlbedo = {
    uSandDry: shared.uSandDry.value.clone(),
    uSandPale: shared.uSandPale.value.clone(),
    uSandWarm: shared.uSandWarm.value.clone(),
    uSandShadow: shared.uSandShadow.value.clone(),
    uSandDamp: shared.uSandDamp.value.clone(),
    uSandWet: shared.uSandWet.value.clone(),
    uSandDeep: shared.uSandDeep.value.clone(),
    uWrackDark: shared.uWrackDark.value.clone(),
    uWrackPale: shared.uWrackPale.value.clone(),
    uTussock: shared.uTussock.value.clone(),
    uRock: shared.uRock.value.clone(),
    uPoolFoam: shared.uPoolFoam.value.clone(),
    uPoolTint: shared.uPoolTint.value.clone(),
    uSandSky: shared.uSandSky.value.clone(),
    uSandSwash: shared.uSandSwash.value.clone(),
    uSandFoam: shared.uSandFoam.value.clone(),
  };
  if (register) {
    for (const key of Object.keys(register)) {
      if (shared[key] === undefined) shared[key] = register[key];
      else if (sandAlbedo[key] && register[key]?.value?.copy) {
        register[key].value.copy(sandAlbedo[key]);
        shared[key] = register[key];
      }
    }
  }
  Object.assign(register ?? {}, shared);
  // Standard `diffuse` is copied from material.color every draw. Same
  // Color as uSandDry: a missed col-inject still shades warm sand, and
  // a write to uSandDry is visible on either path.
  material.color = shared.uSandDry.value;

  // Wave 75: with the switch on and a spine field, the shelf reads d from the field's texture (uniforms shared with every other reader).
  const spineU = (COAST_SPINE.on && coastSpine)
    ? { ...coastSpineUniforms(coastSpine), uCoastSpineBeachOffset: { value: COAST_SPINE.beachOffset } }
    : null;
  if (spineU) delete spineU.uCoastSpineLabel;
  if (spineU) delete spineU.uCoastSpineTexel;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared);
    if (spineU) Object.assign(shader.uniforms, spineU);
    shader.uniforms.uSandCoastPack = { value: coastPack.texture };
    shader.uniforms.uSandCoastReady = coastPack.ready;
    shader.uniforms.uSandLacePack = { value: lacePack.texture };
    shader.uniforms.uSandLaceReady = lacePack.ready;
    shader.uniforms.uW20Shore = W20_SHORE_GAIN;
    if (CORNER_ALPHA) Object.assign(shader.uniforms, CORNER_ALPHA_UNIFORMS);
    if (shader.uniforms.diffuse) shader.uniforms.diffuse.value = shared.uSandDry.value;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', /* glsl */ `#include <common>
        attribute vec2 aBeach;
        attribute float aSandKind;
        uniform float uW20Shore;
        varying vec3  vSandWorld;
        varying float vSandFront;
        varying float vSandAlong;
        varying float vSandShore;
        varying float vSandH;
        varying float vSandU;
        varying float vSandKind;
        uniform float uTime;
        ${SHORE_COMMON_GLSL}
        ${SAND_NOISE_GLSL}
        ${BEACH_PROFILE_GLSL}
        ${INTERACT_GLSL}
      `)
      // beginnormal_vertex runs BEFORE begin_vertex, and defaultnormal_vertex
      // consumes objectNormal straight after it. The R01 pass displaced the
      // height without ever touching the normal, so the berm, the face and the
      // cusps were geometrically present and completely unlit — which is why
      // W-M3 read as a flat cardboard tray in the plates.
      .replace('#include <beginnormal_vertex>', /* glsl */ `
        vec3 ddWp = (modelMatrix * vec4(position, 1.0)).xyz;
        float ddAlongV = ddAlong(ddWp);
        float ddShoreV = ddShoreDist(ddWp);
        float ddFrontV = ddWrapFront(ddAlongV, ddShoreV, uTime);
        DDTap ddTapV = ddTapSample(ddAlongV, ddFrontV);
        float ddHV = ddBeachHeight(ddAlongV, ddFrontV, uTime)
          - ddTapV.crater * 0.50
          + ddTapV.scatter * 0.44;
        // P13-W3: wrap-cap lift (extra>0, including under the kiosk) so
        // polygonOffset cannot let ocean win. Promenade toe on the east
        // face stays on SAND_Y. Seaward of wrap-front, Y is capped.
        ddHV += ddCornerPad(ddWp, ddAlongV, ddShoreV, ddFrontV);
        ddHV += ddCornerLift(ddWp, ddAlongV, ddFrontV);
        ddHV = ddCornerSeaCap(ddWp, ddFrontV, ddHV);
        // P15-AP3: the Apostles cove's own bathymetry. Zero outside its window.
        ddHV = ddCoveDrop(ddWp, ddHV);
        const float DDE = 0.45;
        vec3 alongDirW = vec3(uShoreNormal.z, 0.0, -uShoreNormal.x);
        vec3 seaDirW = vec3(uShoreNormal.x, 0.0, uShoreNormal.z);
        DDTap ddTapA = ddTapSample(ddAlongV + DDE, ddWrapFront(ddAlongV + DDE, ddShoreV, uTime));
        float ddHa = ddBeachHeight(ddAlongV + DDE,
          ddWrapFront(ddAlongV + DDE, ddShoreV, uTime), uTime)
          - ddTapA.crater * 0.50 + ddTapA.scatter * 0.44;
        ddHa += ddCornerLift(ddWp + alongDirW * DDE, ddAlongV + DDE,
          ddWrapFront(ddAlongV + DDE, ddShoreV, uTime));
        ddHa += ddCornerPad(ddWp + alongDirW * DDE, ddAlongV + DDE, ddShoreV,
          ddWrapFront(ddAlongV + DDE, ddShoreV, uTime));
        ddHa = ddCornerSeaCap(ddWp + alongDirW * DDE,
          ddWrapFront(ddAlongV + DDE, ddShoreV, uTime), ddHa);
        ddHa = ddCoveDrop(ddWp + alongDirW * DDE, ddHa);
        DDTap ddTapB = ddTapSample(ddAlongV - DDE, ddWrapFront(ddAlongV - DDE, ddShoreV, uTime));
        float ddHb = ddBeachHeight(ddAlongV - DDE,
          ddWrapFront(ddAlongV - DDE, ddShoreV, uTime), uTime)
          - ddTapB.crater * 0.50 + ddTapB.scatter * 0.44;
        ddHb += ddCornerLift(ddWp - alongDirW * DDE, ddAlongV - DDE,
          ddWrapFront(ddAlongV - DDE, ddShoreV, uTime));
        ddHb += ddCornerPad(ddWp - alongDirW * DDE, ddAlongV - DDE, ddShoreV,
          ddWrapFront(ddAlongV - DDE, ddShoreV, uTime));
        ddHb = ddCornerSeaCap(ddWp - alongDirW * DDE,
          ddWrapFront(ddAlongV - DDE, ddShoreV, uTime), ddHb);
        ddHb = ddCoveDrop(ddWp - alongDirW * DDE, ddHb);
        DDTap ddTapC = ddTapSample(ddAlongV, ddFrontV + DDE);
        float ddHc = ddBeachHeight(ddAlongV, ddFrontV + DDE, uTime)
          - ddTapC.crater * 0.50 + ddTapC.scatter * 0.44;
        ddHc += ddCornerLift(ddWp + seaDirW * DDE, ddAlongV, ddFrontV + DDE);
        ddHc += ddCornerPad(ddWp + seaDirW * DDE, ddAlongV, ddShoreV + DDE, ddFrontV + DDE);
        ddHc = ddCornerSeaCap(ddWp + seaDirW * DDE, ddFrontV + DDE, ddHc);
        ddHc = ddCoveDrop(ddWp + seaDirW * DDE, ddHc);
        DDTap ddTapD = ddTapSample(ddAlongV, ddFrontV - DDE);
        float ddHd = ddBeachHeight(ddAlongV, ddFrontV - DDE, uTime)
          - ddTapD.crater * 0.50 + ddTapD.scatter * 0.44;
        ddHd += ddCornerLift(ddWp - seaDirW * DDE, ddAlongV, ddFrontV - DDE);
        ddHd += ddCornerPad(ddWp - seaDirW * DDE, ddAlongV, ddShoreV - DDE, ddFrontV - DDE);
        ddHd = ddCornerSeaCap(ddWp - seaDirW * DDE, ddFrontV - DDE, ddHd);
        ddHd = ddCoveDrop(ddWp - seaDirW * DDE, ddHd);
        // Object +X is along-shore and object +Z is seaward (the shelf is only
        // ever yaw-rotated), so the shore-frame gradient is the object normal.
        vec3 objectNormal = normalize(vec3(
          -(ddHa - ddHb) / (2.0 * DDE), 1.0, -(ddHc - ddHd) / (2.0 * DDE)));
        // Wet-band waffle is the regular triangle lattice in the lighting.
        // Flatten those vertex normals; grain stays in the fragment.
        float wetFlat = smoothstep(-6.5, 1.8, ddFrontV);
        float tapKeep = 1.0 - clamp(ddTapV.crater * 2.2 + ddTapV.scatter * 1.4, 0.0, 0.92);
        // Hard flatten printed the triangle lattice as the pier-left waffle.
        objectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), wetFlat * 0.10 * tapKeep));
      `)
      .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
        transformed.y += ddHV;
        vSandAlong = ddAlongV;
        vSandShore = ddShoreV;
        vSandFront = ddFrontV;
        vSandH = ddHV;
        vSandU = aBeach.x;
        vSandKind = aSandKind;
        vSandWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
      `);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */ `#include <common>
        uniform sampler2D uSandCoastPack;
        uniform float uSandCoastReady;
        float ddPackWet = 0.0;
        float ddPackValue = 1.0;

        uniform float uW20Shore;
        uniform float uSandRainAlbedo;${CORNER_ALPHA ? 'uniform float uCaReach, uCaDmax, uCaWander, uCaTail, uCaSoft, uCaPow;\n        ' : ''}
        varying vec3  vSandWorld;
        varying float vSandFront;
        varying float vSandAlong;
        varying float vSandShore;
        varying float vSandH;
        varying float vSandU;
        varying float vSandKind;
        uniform float uTime;
        uniform sampler2D uSandLacePack;
        uniform float uSandLaceReady;
        #define DD_SWASH_PACK
        #define DD_SWASH_READY uSandLaceReady
        float ddSandLaceMask(vec2 uv) { return clamp(texture2D(uSandLacePack, uv).b, 0.0, 1.0); }
        ${SHORE_COMMON_GLSL}
        ${FOAM_GLSL}
        ${SAND_NOISE_GLSL}
        ${BEACH_PROFILE_GLSL}
        ${SAND_DETAIL_GLSL}
        ${INTERACT_GLSL}
        // taste-r1 (W15): the sand's surface luminance. The coast pack's sandDry
        // and sandWet channels (mean 1, SD about 0.2) read twice, at two scales
        // turned against each other with a slow domain warp, so no repeat can be
        // found from 150 m or from 240 m. Luminance only: the hue stays the token.
        float ddSandPackLum(vec2 p, float wet) {
          if (uSandCoastReady < 0.5) return 1.0;
          if (!(p.x < 1.0e8 && p.x > -1.0e8) || !(p.y < 1.0e8 && p.y > -1.0e8)) return 1.0;
          vec3 ch = mix(vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), clamp(wet, 0.0, 1.0));
          vec2 warp = vec2(ddsNoise(p * 0.043 + vec2(3.1, 9.7)), ddsNoise(p * 0.043 + vec2(41.3, 2.9)) ) * 8.0 - 4.0;
          mat2 turnA = mat2(0.9563, 0.2924, -0.2924, 0.9563);
          mat2 turnB = mat2(0.7547, -0.6561, 0.6561, 0.7547);
          vec2 uvA = turnA * (p + warp) / 12.0;
          vec2 uvB = turnB * (p - warp.yx) / 8.3 + vec2(0.371, 0.613);
          float a = dot(texture2D(uSandCoastPack, uvA).rgb, ch) * (255.0 / 128.0);
          float b = dot(texture2D(uSandCoastPack, uvB).rgb, ch) * (255.0 / 128.0);
          return max(1.0 + (a + b - 2.0) * 0.7071, 0.45);
        }
        // The slow mottle the reference sand carries: 9 m at plus or minus 8 %,
        // 30 m at plus or minus 5 %.
        float ddSandMottle(vec2 p) {
          return (ddsNoise(p / 9.0 + vec2(7.3, 1.9)) - 0.5) * 0.16
               + (ddsNoise(p / 30.0 + vec2(19.1, 5.3)) - 0.5) * 0.10;
        }

      `)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        {
          float along = vSandAlong;
          float frontV = vSandFront;
          float frontF = ddFrontFrag(vSandWorld);
          if (!(frontF < 1.0e8 && frontF > -1.0e8)) frontF = frontV;
          float cornerM = ddCornerMask(vSandWorld);
          // Analytic wrap-front inside the mask so the polar iso-front is
          // not a linearly interpolated n-gon. Mid-beach (mask 0) keeps
          // the interpolated varying — byte-identical path.
          float front = mix(frontV, frontF, step(0.01, cornerM));
          vec2 gp = vec2(along, vSandShore);
          ddGP = gp;
          // Footprint of one pixel in the shore frame. Everything high-frequency
          // is measured against this.
          //
          // ANISOTROPIC. Round 1 took the max of the two axes, and on a beach
          // seen at 22 degrees the shore axis is foreshortened nearly three to
          // one, so filtering by the worst axis threw away most of the detail
          // available along the other. Cap the anisotropy at four to one and
          // take the geometric mean, which is what an anisotropic sampler does
          // and is worth about 1.6x of resolvable band at reading distance.
          float ddFx = length(vec2(dFdx(gp.x), dFdy(gp.x)));
          float ddFy = length(vec2(dFdx(gp.y), dFdy(gp.y)));
          float ddHi = max(ddFx, ddFy);
          float ddLo = max(min(ddFx, ddFy), ddHi * 0.25);
          // Floored at 0.65 of the worst axis. The pure geometric mean lets a
          // value-noise cell down to under two pixels, and a 0.53 m cell at two
          // pixels aliases into a hard diagonal moire across the whole beach at
          // board distance — through the tone AND through the normal, which is
          // why turning either one off on its own did not remove it.
          ddPx = max(sqrt(ddHi * ddLo), ddHi * 0.65);
          // A sinusoid can lie along the worst axis, where the geometric mean
          // is a lie and the result is beaded moire. Isotropic value noise has
          // no preferred direction and can use the mean; anything with a
          // bearing gets ddDirPx() along that bearing, and ddPxD is what is
          // left for the few places with no bearing to speak of.
          ddPxD = max(ddHi, 0.0006);
          // Per-axis footprints, anisotropy capped at four to one so a near
          // plan view cannot claim unlimited resolution along one axis.
          ddPxA = max(ddFx, ddHi * 0.25);
          ddPxS = max(ddFy, ddHi * 0.25);
          float px = max(ddPx, 0.0006);
          // P13-W4 camera-distance visibilities. Set before anything reads
          // them; the roughness and normal chunks run after this one.
          ddRipV = ddRipVis(vSandWorld);
          ddPrintV = ddPrintVis(vSandWorld);

          // ── Wetness ───────────────────────────────────────────────────────
          // Sampled from foam.js so the dark band on the sand and the water's
          // swash are one event, then gated by the sand's own run-up envelope.
          // The lags give soak memory and the drain film without depending on
          // any particular numbers inside ddSwashWet.
          float env = ddWetEnvelopeAlong(along, front);
          float envCorner = smoothstep(${(-SHORE.cornerWetInland).toFixed(1)}, -0.5, front);
          env = mix(env, envCorner, cornerM);
          float w0 = ddSwashWet(along, front, uTime) * env;
          // R15: wet-sand recession lags the live tongue by 1–2 wave periods,
          // not sub-second film samples. W14-B: one clock, so the lags are one
          // and two periods of the carrier (DD_WAVE_T = 3.92 s).
          float w1 = ddSwashWet(along, front, uTime - 3.92) * env;
          float w2 = ddSwashWet(along, front, uTime - 7.84) * env;
          float soak = max(w0, max(w1 * 0.80, w2 * 0.48));
          // Standing water over the shelf — cusp-shaped, because the shelf is.
          ddSubmF = max(0.0, ${(WATER_Y - SAND_Y).toFixed(3)} - vSandH);
          float submWet = smoothstep(-0.015, 0.055, ddSubmF);
          DDTap tap = ddTapSample(along, front);
          ddWetF = clamp(max(soak, max(submWet, tap.wet)), 0.0, 1.0);
          // Water sheet left behind where the run-up has just pulled back.
          float drain = clamp((w1 - w0) * 1.9, 0.0, 1.0);
          ddFilmF = drain
            * smoothstep(0.30, 0.72, ddsNoise(gp * 1.15 + 4.0))
            * (1.0 - smoothstep(0.0, 1.5, front))
            * (1.0 - smoothstep(0.02, 0.16, ddSubmF));

          ddTrafF = ddTrafficAt(gp, front) * (1.0 - smoothstep(0.15, 0.75, ddWetF));

          // ── Dry sand tone ─────────────────────────────────────────────────
          float dryMask = 1.0 - smoothstep(0.10, 0.70, ddWetF);
          // Kept for the wet-fringe path below. PM11 does not apply this
          // per-pixel cascade to dry albedo.
          float grain = ddSandGrain(gp, px);
          ddToothF = ddBand(gp + 83.7, 6.400, px) + ddBand(gp + 119.3, 17.0, px);
          float plateTone = ddDryPlateTone(gp, px);
          float paleAmt = clamp(0.20 + plateTone * 0.10, 0.08, 0.34);
          paleAmt *= 1.0 - cornerM * 0.92;
          vec3 col = mix(uSandDry, uSandPale, paleAmt);
          col = mix(col, uSandWarm,
            clamp(0.24 - plateTone * 0.16, 0.0, 1.0) * 0.34);
          // Wrap backshore is a flat disk (relief gated off landward of
          // front −26). Lit as a cream plate it reads as the pale fan —
          // a 10 % value drop still clipped to the same highlight, so
          // the mix has to un-clip: warm quartz + a real value drop.
          col = mix(col, uSandWarm, cornerM * 0.42);
          col = mix(col, uSandShadow, cornerM * 0.10);
          col *= 1.0 - cornerM * 0.18;
          col *= 1.0 + plateTone * ${Number(SAND_PM11.toneGain).toFixed(3)} * dryMask;
          float w15Grass = smoothstep(
              ${SAND_W15.grassFromH.toFixed(2)}, ${SAND_W15.grassToH.toFixed(2)}, vSandH)
            * dryMask * (1.0 - smoothstep(-9.0, -2.0, front));
          col = mix(col, vec3(0.27, 0.33, 0.15), w15Grass * ${SAND_W15.grassAmt.toFixed(2)});

          // ── Micro occlusion ───────────────────────────────────────────────
          // The relief field again, this time as shading rather than as a
          // normal. A rough granular surface self-occludes in its hollows and
          // catches the light on its crests, and that read does NOT depend on
          // the sun raking across it. Round 1 put the whole micro budget into
          // the normal, which is why a beach lit from near its own normal
          // measured a Laplacian sigma of 3.7 against the reference's 54.6.
          vec2 micro = ddSandMicro(gp, px, front, ddTrafF, ddWetF);
          float shade = clamp(micro.y / 0.0185, -1.0, 1.0);
          float wetMicro = 1.0 - dryMask;
          col *= mix(1.0, mix(0.78, 1.18, shade * 0.5 + 0.5), wetMicro);
          col = mix(col, uSandShadow, max(0.0, -shade) * 0.10 * wetMicro);

          // Ripple, backwash comb and rake also read as tone. Wet sand keeps
          // its ripple — it is the smoothed swash sheet that loses it — so the
          // mask damps these rather than deleting them, which is what left the
          // damp band a flat strip with a geometric edge.
          // P13-W2 whole-beach micro-surface, P13-W4 budget. Zero-mean value,
          // hue untouched, and the three fields now share ONE softly-capped
          // ±5 % swing instead of stacking three independent multiplies that
          // could reach ±9 % between them.
          float surfG = ddSurfGrain(gp, px);
          float windR = ddWindRip(gp, px, front, dryMask);
          float mottl = ddDuneMott(gp, px);
          float wetRip = ddCornerWetRip(gp, px, front, ddWetF, cornerM);
          // The ripple's phase goes with camera distance; the tone a rippled
          // patch carries does not. Without this the beach loses value as well
          // as stripes when the corduroy comes out, and the mid-beach windows
          // walk with it.
          float ripCast = ddWindRipCast(gp, front, dryMask);
          // DC restoration — see SAND_W4.rippleReliefDc.
          col *= 1.0 + ${Number(SAND_W4.rippleReliefDc).toFixed(3)}
            * (1.0 - ddRipV) * ddWindRipGate(front, dryMask) * (1.0 - dryMask);
          float wetMicroV = surfG * ${Number(SHORE.sandGrainAmt).toFixed(3)}
                       + (windR + wetRip) * ${Number(SHORE.sandWindRippleAmt).toFixed(3)}
                       + mottl * ${Number(SHORE.sandMottleAmt).toFixed(3)}
                       + ripCast * ${Number(SAND_W4.rippleCastAmt).toFixed(3)};
          float microV = mix(wetMicroV, plateTone * ${Number(SAND_PM11.toneGain * 0.45).toFixed(4)}, dryMask);
          col *= 1.0 + ddMicroCap(microV);
          // Wet sand is a smoothed sheet, not a waffle tile. Keep a little
          // tooth so the fringe is not a painted belt.
          float wetKeep = 0.04 + 0.96 * dryMask;
          // Asymmetric on purpose: a ripple crest is a broad soft highlight and
          // its lee is a narrow hard shadow, so the trough side gets twice the
          // gain. A symmetric multiplier reads as corduroy printed on a plane.
          float rip = ddRipple(gp, px, front) * wetKeep * (1.0 - ddTrafF * 0.65);
          // Trimmed in R2b: the ripple's TONE is what the autocorrelation
          // sees, and a prevalent comb pushed the scored patch's repeat to
          // 0.29 against the critic's 0.25 guard. The relief amplitude took
          // the difference instead, so the ripple still reads — through the
          // light, where it also has to agree with the sun.
          float albedoRip = rip * (1.0 - dryMask);
          col *= 1.0 + (albedoRip > 0.0 ? albedoRip * 0.088 : albedoRip * 0.250);
          // Coarse grains collect on a ripple crest, so the crest is paler as
          // well as brighter.
          col = mix(col, uSandPale, max(0.0, albedoRip) * 0.20 * (1.0 - cornerM));
          col = mix(col, uSandShadow, max(0.0, -albedoRip) * 0.22);

          // Shell grit and dark mineral pepper, four size classes. Density and
          // contrast both raised in R2b: a hard-edged fleck is the only thing
          // on this beach that carries real Laplacian energy, and at the scored
          // patch there were about thirty of them in a 288 x 120 px crop where
          // ref-03 has thousands.
          float shellA = ddSpecks(gp, px, 0.115, 0.0, 0.020, 0.026, 0.34);
          float shellB = ddSpecks(gp, px, 0.520, 63.1, 0.046, 0.062, 0.32);
          float grit = ddSpecks(gp, px, 0.195, 27.3, 0.026, 0.030, 0.32);
          float pepper = ddSpecks(gp, px, 0.085, 41.7, 0.014, 0.017, 0.33);
          // Shell is pale and warm, not white: a neutral additive fleck on warm
          // sand reads as a grey chip, and a subtractive dark one turns red,
          // because the blue channel runs out first.
          // Shell flecks were dry-albedo stipple. They remain available to the
          // relief/diagnostic path but no longer colour the dry or W10 wet plate.
          col = mix(col, uSandWarm * 0.82, grit * 0.38 * (1.0 - dryMask));
          col *= 1.0 - pepper * 0.14 * (1.0 - dryMask);

          // Footprints. Most of the read is the bowl in the normal and in the
          // occlusion above; the albedo only supplies the damp compaction of
          // the floor and the dry, disturbed brightness of the thrown collar.
          vec3 pr = ddPrints(gp, px, ddTrafF);
          col = mix(col, col * 0.80, pr.x * 0.62 * (1.0 - dryMask));
          col *= 1.0 + pr.y * 0.022 * (1.0 - dryMask);
          // Even where individual prints have filtered away, trampled sand is
          // duller and slightly darker than raked sand. That read survives to
          // hero orbit, which is the point.
          col *= 1.0 - ddTrafF * 0.060;
          // Tap crater: floor is a wetter note of THIS ochre. Collar is paler
          // dry spoil of the same sand — chroma must go UP on the lip.
          float holeN = ddsNoise(gp * 3.20 + 11.0);
          col = mix(col, uSandWarm, clamp(tap.crater * (0.22 + 0.08 * holeN), 0.0, 0.22));
          col = mix(col, uSandPale, clamp(tap.scatter * (1.15 + 0.22 * holeN), 0.0, 0.92));
          col *= max(0.72, 1.0 - tap.crater * (0.20 + 0.06 * holeN));
          col = mix(col, uSandShadow, tap.crater * (0.10 + 0.06 * holeN));
          col = mix(col, uSandPale, clamp(tap.scatter * 0.78, 0.0, 0.62));
          col = mix(col, uSandDamp, tap.wet * 0.10);

          // Hollows hold shadow and damp; crests are wind-dried and pale. This
          // keeps the berm and the cusps legible at every camera distance, not
          // only where the sun happens to rake across them.
          col *= mix(0.94 + 0.10 * smoothstep(-0.34, 0.62, vSandH), 0.90, cornerM);
          // The berm read, in three shore-parallel bands rather than one.
          //
          // The geometry is now steep enough for the light to do most of this
          // itself — a 23-degree scarp over a 1 m run is resolved by the vertex
          // normal's 0.45 m central difference — but a 0.6 m landform is five
          // pixels at hero orbit, and five pixels of geometry needs help from
          // tone to survive the grade. Wind-dried pale crest, freshly cut damp
          // scarp, shadowed toe where the scarp meets the face.
          float bermAtF = ddBermAt(along);
          float dCrest = front - bermAtF;
          // taste-r1 (W15): the berm is one soft step of shade, 3 to 6 L*, wandering 1.5 m along the shore
          // over a 3 to 4 m ramp. The narrow crest, scarp and toe bands made a straight dark line 1.8 m
          // landward of the wet band (station 20) and are gone.
          float bermWob = (ddsNoise(vec2(along * 0.052, 12.7)) - 0.5) * 3.0 + (ddsNoise(vec2(along * 0.17, 3.3)) - 0.5) * 1.1;
          float bermSea = smoothstep(-1.2, 2.6 + uScarpLen, dCrest + bermWob);
          col *= mix(1.0, mix(1.03, 0.94, bermSea), 1.0 - cornerM);
          float scarpBand = 0.0;
          float scarpToe = 0.0;
          float crestLine = 0.0;

          // ── P13-W4 value structure ────────────────────────────────────────
          // From sixty metres a beach is read by BROAD VALUE and only then by
          // what is inside each band. W2 put its whole budget into texture and
          // the wedge came back as one tone with a corduroy on it. Four bands,
          // land to sea: a trough in the lee of the berm, a pale dry berm, a
          // damp step with soft edges, and the wet swash the fringe already
          // owns. Widened against the crestLine / scarp trio above, which are
          // one-metre reads and disappear by board distance.
          float ddBandKeep = (1.0 - cornerM * 0.45);
          float trough = exp(-pow((dCrest - ${Number(SAND_W4.troughAt).toFixed(2)}) / ${Number(SAND_W4.troughHalfW).toFixed(2)}, 2.0));
          // Wind-shadow behind a berm holds damp and shadow both.
          col *= 1.0 - trough * ${Number(SAND_W4.troughAmt).toFixed(3)} * ddBandKeep;
          col = mix(col, uSandShadow, trough * 0.085 * ddBandKeep);
          float bermPale = exp(-pow((dCrest - ${Number(SAND_W4.bermPaleAt).toFixed(2)}) / ${Number(SAND_W4.bermPaleHalfW).toFixed(2)}, 2.0));
          // Wind-dried quartz on the crest and its seaward shoulder.
          col = mix(col, uSandPale, bermPale * ${Number(SAND_W4.bermPaleAmt).toFixed(3)} * ddBandKeep);
          // The damp step. Soft on both edges — a hard one is the grey ruler
          // band the fringe spent three rounds getting rid of.
          float dampStep = smoothstep(${Number(SAND_W4.dampFrom).toFixed(1)}, ${(SAND_W4.dampFrom + 3.5).toFixed(1)}, front)
            * (1.0 - smoothstep(${Number(SAND_W4.dampTo).toFixed(1)}, ${(SAND_W4.dampTo + 2.2).toFixed(1)}, front));
          col = mix(col, uSandDamp, dampStep * ${Number(SAND_W4.dampAmt).toFixed(3)} * (1.0 - ddWetF) * ddBandKeep);
          col *= 1.0 + ddPlateWind(gp, dryMask)
            * ${SAND_W10.plateRippleAmt.toFixed(3)};

          // Desire paths and their blown-out margins. Item 4: at the graded
          // poses W2's footprints were invisible, so the lane carries the read
          // and the individual prints are gated to 25 m below.
          vec2 pathF = ddDesirePath(gp, front, cornerM);
          ddPathC = pathF.x;
          col *= 1.0 - pathF.x * ${Number(SAND_W4.pathDark).toFixed(3)};
          col = mix(col, uSandDamp, pathF.x * 0.16 * (1.0 - ddWetF));
          col = mix(col, uSandPale, pathF.y * ${Number(SAND_W4.blownAmt).toFixed(3)} * dryMask);
          // Packed lanes are the broad darker pathF zone above. Their fine
          // ripple suppression happens in ddSandMicro, not by painting the
          // inverse ripple back into dry albedo.
          // Swash marks: thin shore-parallel lines of pale fines the run-up
          // stranded on its way back down the face.
          float swashPh = (front - bermAtF) * 0.62 + ddsFbm(vec2(along * 0.03, 8.1), 3) * 3.0;
          float swashLine = pow(max(0.0, sin(swashPh * 6.2831853)), 9.0)
            * smoothstep(0.2, 2.5, front - bermAtF)
            * (1.0 - smoothstep(4.0, 10.0, front - bermAtF))
            * (1.0 - smoothstep(0.15, 0.5, px));
          col *= 1.0 + swashLine * 0.10;

          // ── Wet fringe ────────────────────────────────────────────────────
          // Cusp embayments hold water a little longer than the horns do.
          vec3 w20Ref = col; // taste-r1 (W20-A): the sand before the wet fringe, the reference for the wet gradient and the pale bed
          float pond = 1.0 + ddCuspOffset(along) * 0.10;
          float wetPocket = 0.42 + 0.68 * ddsNoise(vec2(along * 0.021, 9.3));
          float wetJit = ddsFbm(vec2(along * 0.048, front * 0.07), 3) * 0.52
                       + ddsNoise(vec2(along * 0.11, front * 0.16 + 4.2)) * 0.22;
          float wetC = clamp(ddWetF * pond * wetPocket + wetJit * ddWetF, 0.0, 1.0);
          // Dry #c9b489 → damp #8a6848 → wet #6a5040. The 0.38/0.30 mixes
          // left the swash zone on the pale dry mix (the near-white base
          // under the R13 blanket). Value variation only.
          float wetGain = mix(1.0, ${Number(SHORE.cornerWetGain).toFixed(2)}, cornerM);
          col = mix(col, uSandDamp, smoothstep(0.0, 0.70, wetC) * wetGain);
          col = mix(col, uSandWet, smoothstep(0.22, 0.95, wetC) * wetGain);
          col *= 1.0 - grain * 0.16 * wetC;
          // W14-B: the tongue's own film. Between the leading edge and the
          // still waterline the sand is darkened toward the wet token and
          // carries the shallow water token at no more than 0.12 of the run;
          // anything stronger reads as a green-grey stain.
          vec4 swS = ddSwashSurface(along, front, uTime, ddPxD) * (1.0 - cornerM);
          // The dry-to-wet step: sand with water in its voids is darker by a
          // multiply, at every hue, whatever tone the mixes above settled on.
          col *= mix(1.0, 0.80, smoothstep(0.30, 0.85, ddWetF) * (1.0 - cornerM));
          col = mix(col, uSandWet, swS.x * 0.50);
          col = mix(col, ${SWASH_SHALLOW_GLSL}, swS.x * 0.12 * swS.w);
          // R13b: ddSwashFoam / foamSheet retired. Layer owns waterline white.
          col = mix(col, uSandDeep, smoothstep(0.08, 0.58, ddSubmF) * 0.18);
          // W14-B: sand under the sheet is wet sand. The pale shelf used to
          // bleach the first metres of sea through the water's own opacity.
          col = mix(col, uSandWet, smoothstep(0.02, 0.10, ddSubmF));

          // ── P13-A8 item 1a: the shoreline, bands 1 and 2 ──────────────────
          // R6 held two standing vetoes on a one-pixel sand/water cut. The
          // corner's own wet band runs at cornerWetGain 0.40 (W3 dialled it
          // back to kill the cream fan), so the last two metres of sand before
          // the navy are still dry-tan and the entire colour swing has to
          // happen inside the 0.6 m alpha dissolve. These two bands put the
          // swing back on the LAND side, where the shelf is opaque: a wet
          // gradient, then a film of water lying over sand. The foam threads
          // are painted after the wrack, further down, so nothing covers them.
          vec3 a8Shore = ddShoreBands(gp, px, ddShoreFront(vSandWorld, front), cornerM);
          ddSwashC = a8Shore.y;
          // P16-PM13B: the damp backshore, landward of the saturated band. The
          // ddShoreFront call is repeated rather than hoisted because
          // p13-sand-corner pins the a8Shore line verbatim. (No back-quotes in
          // this block: it is inside a template literal, and one closes it.)
          float a8Back = smoothstep(${Number(SAND_A8.backFrom).toFixed(2)},
            ${Number(SAND_A8.backTo).toFixed(2)}, ddShoreFront(vSandWorld, front)) * cornerM;
          col = mix(col, uSandDamp, a8Back * ${Number(SAND_A8.backAmt).toFixed(3)});
          col *= mix(1.0, ${Number(SAND_A8.backDarken).toFixed(3)}, a8Back);
          col = mix(col, uSandDamp, a8Shore.x * ${(SAND_A8.wetAmt * 0.55).toFixed(3)});
          col = mix(col, uSandWet, a8Shore.x * ${Number(SAND_A8.wetAmt).toFixed(3)});
          col = mix(col, uSandSwash, a8Shore.y * ${Number(SAND_A8.swashAmt).toFixed(3)});
          // P16-PM13B item 5. Saturated sand is DARKER, and a multiply is the
          // only operator that says so at every hue and every key angle. The
          // foam threads are mixed further down, so the white line survives.
          col *= mix(1.0, ${Number(SAND_A8.wetDarken).toFixed(3)},
            clamp(a8Shore.x * 0.72 + a8Shore.y * 0.55, 0.0, 1.0));

          // taste-r1 (W20-A): wet sand as a gradient. Dry sand darkens into damp sand over ${SAND_W20.wetReachM.toFixed(0)} m toward the water by at most ${SAND_W20.wetMax.toFixed(2)} of its value and keeps its hue (the
          // reference tone times a factor, never a mix toward the brown wet token); the landward edge is broken by a ${SAND_W20.wetNoiseM.toFixed(1)} m noise along the shore. The old moving swash
          // wetness keeps ${SAND_W20.oldKeep.toFixed(2)} of its weight inside the same ceiling, so the tongue still breathes. Under the sheet the bed is the reference sand (its own grain) with the red taken out first by the depth of water.
          // SAND_W20.gain 0 restores the wet strip.
          float w20L = dot(col, vec3(0.2126, 0.7152, 0.0722)) / max(dot(w20Ref, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
          float w20Old = clamp((1.0 - w20L) / 0.5, 0.0, 1.0);
          float w20N = ddsNoise(vec2(along * 0.06, 21.0)) * 0.6 + ddsNoise(vec2(along * 0.19, 5.0)) * 0.4;
          float w20Grad = smoothstep(-${SAND_W20.wetReachM.toFixed(1)}, 0.0, front + (2.0 * w20N - 1.0) * ${SAND_W20.wetNoiseM.toFixed(1)});
          float w20Sub = smoothstep(0.02, 0.10, ddSubmF);
          float w20K = max(w20Grad, w20Old * ${SAND_W20.oldKeep.toFixed(2)}) * (1.0 - cornerM);
          vec3 w20Land = w20Ref * (1.0 - ${SAND_W20.wetMax.toFixed(2)} * w20K);
          vec3 w20Bed = w20Ref * exp(-vec3(${SAND_W20.bedAbsorb.map((v) => v.toFixed(2)).join(', ')}) * min(ddSubmF, 1.3));
          float w20Cove = smoothstep(283.0, 333.0, vSandWorld.x) * smoothstep(154.0, 214.0, vSandWorld.z) * (1.0 - smoothstep(272.0, 332.0, vSandWorld.z)) * ${(1 - SHALLOW_TONE.cove).toFixed(2)}; // the Apostles cove keeps its look (soft box edges, no seam); taste-r1 (W22-C): SHALLOW_TONE.cove 1 brings the cove's bed under the same treatment as the beach
          col = mix(col, mix(w20Land, w20Bed, w20Sub), ${SAND_W20.gain.toFixed(2)} * (1.0 - max(cornerM, w20Cove)));

          // ── P13-W4 grazing sheen (item 3) ─────────────────────────────────
          // W3 put the wet band's gloss in ROUGHNESS — 0.12 with the swash —
          // which is a mirror at every angle, and the blind pack read it as a
          // glossy plastic film. A sheet of water on sand is a dielectric: it
          // reflects about two per cent from overhead and the SKY at grazing.
          // Schlick against the ground plane, tinted uSandSky rather than
          // white, with a 0.35 roughness floor on all sand in the roughness
          // chunk so nothing can go back to varnish.
          vec3 ddView = normalize(cameraPosition - vSandWorld);
          float ddFres = 0.02 + 0.98 * pow(1.0 - clamp(ddView.y, 0.0, 1.0), 5.0);
          // P13-A8: the swash film is a millimetre of water on a mineral, so it
          // takes the same dielectric grazing lift the drain film does.
          float filmAmt = clamp(max(max(max(ddFilmF, ddSwashC), swS.x),
            smoothstep(0.25, 0.85, ddWetF)), 0.0, 1.0);
          float w10WetMirror = clamp(max(a8Shore.x, a8Shore.y), 0.0, 1.0);
          col = mix(col, uSandSky, ddFres * filmAmt * mix(
            ${Number(SAND_W4.skyGain).toFixed(2)}, ${SAND_W10.wetSkyGain.toFixed(2)}, w10WetMirror));

          ddPackWet = clamp(max(ddWetF, a8Shore.x), 0.0, 1.0);
          ddPackValue = ddSandPackLum(gp, ddPackWet);
          if (vSandKind < 0.5) {
            // taste-r1 (W15): amp 0.25 inside 120 m fading to 0.10 at 250 m, plus the slow mottle.
            float ddPackD = length(cameraPosition - vSandWorld);
            float ddPackAmp = mix(0.70, 0.26, smoothstep(140.0, 260.0, ddPackD));
            // The pack's contrast is lost to the mip chain as the footprint grows (a 6 cm pixel is 5 texels); the
            // deviation is restored in proportion so a 64 px crop at 105 to 240 m keeps its slab SD.
            float ddPackBoost = 1.0 + 2.0 * smoothstep(0.020, 0.080, ddPx);
            float ddPackLum = max(1.0 + (ddPackValue - 1.0) * ddPackBoost, 0.45);
            col *= 0.73 * mix(1.0, ddPackLum, ddPackAmp) * (1.0 + ddSandMottle(gp));
          }

          // Wrack last: weed and debris SIT ON the sand, wet or dry. Painting it
          // before the fringe let the damp mix wash the whole line away.
          vec2 wr = ddWrack(gp, px, front, bermAtF);
          // W14-B: the stain leans to the dark weed colour (it read as a soft tan band).
          float wrackTone = ddsNoise(vec2(along * 0.9, front * 1.7)) * 0.55;
          vec3 wrackCol = mix(uWrackDark, uWrackPale, wrackTone);
          // taste-r1 (W15): about 10 L* darker than the dry sand beside it, a mix and a multiply.
          col = mix(col, wrackCol, wr.x * 0.55);
          col *= 1.0 - wr.x * 0.12;
          col = mix(col, wrackCol * (0.62 + 0.70 * ddsNoise(gp * 3.3)), wr.y * 0.95);
          // P13-W2 drift lines (two thin wrack threads) + stair-to-water prints.
          // P13-W4: the tide threads are FAINT — item 2 calls them threads and
          // 0.16 drew them as scored lines. Single prints are gated to 25 m.
          col *= 1.0 - ddDriftLines(gp, px, front) * ${(SHORE.sandDriftAmt * SAND_W4.driftAmtScale).toFixed(3)} * (0.55 + 0.45 * dryMask);
          col *= 1.0 - ddStairTrails(gp, px, front) * 0.28 * ddPrintV;
          col *= 1.0 - ddCornerTyre(gp, px, front, cornerM) * 0.34;
          col *= 1.0 - ddCornerPrints(gp, px, front, cornerM) * 0.30 * ddPrintV;
          col *= 1.0 - ddPlateFootTraffic(gp, front, cornerM)
            * ${SAND_W10.trafficTraceAmt.toFixed(3)};
          col *= 1.0 - ddCornerReachWrack(gp, px, front, cornerM) * 0.22;
          // Corner composition (mask only): berm crest, wrap wrack, tussock,
          // tidal pool + foam rim. Extra rock/tussock meshes use vSandKind.
          float bermCrest = exp(-pow((front - ${Number(SHORE.cornerBermAt).toFixed(2)}) / ${Number(SHORE.cornerBermHalfW).toFixed(2)}, 2.0));
          col = mix(col, uSandShadow, bermCrest * 0.32 * cornerM);
          col = mix(col, uWrackDark, ddWrapWrack(gp, px, front, cornerM) * 0.62);
          float tussAmt = ddTussockAmt(gp, front, cornerM);
          col = mix(col, uTussock, tussAmt * 0.84);
          float poolD = ddCornerPoolD(along, vSandShore);
          float poolR0 = ${Number(SHORE.cornerPoolR).toFixed(2)};
          float poolFill = (1.0 - smoothstep(poolR0 * ${SAND_W4.poolEdgeInner.toFixed(2)}, poolR0 * ${SAND_W4.poolEdgeOuter.toFixed(2)}, poolD)) * cornerM;
          float poolRadius = length(vec2(along - (uBayCentre + max(uAlongHalf, 1.0) + ${Number(SHORE.cornerPoolAlong).toFixed(2)}), vSandShore - ${Number(SHORE.cornerPoolShore).toFixed(2)}));
          float poolRim = exp(-pow((poolD - poolR0 * ${SAND_W4.poolEdgeOuter.toFixed(2)}) / ${SAND_W4.poolRimWidth.toFixed(2)}, 2.0)) * cornerM
            * (1.0 - smoothstep(poolR0, poolR0 + ${SAND_W4.poolOuterLimit.toFixed(2)}, poolRadius));
          // Dark wet-sand rim. P13-W4 breaks it around the dish so it is a
          // wet margin rather than a drawn ellipse.
          float rimBreak = clamp(0.45 + 0.85 * ddsNoise(gp * 1.35 + 21.0), 0.0, 1.0);
          col = mix(col, uSandWet * ${Number(SAND_W4.poolRimDark).toFixed(2)}, poolRim * 0.94 * rimBreak);
          // Still water. Item 5: from user-corner this read as a pale disc,
          // because 14 % of lit sand and a 2.2-power Fresnel were showing
          // through a low-roughness lobe. Water seen from ABOVE is dark — you
          // see the bottom, not the sky — so the top-down albedo carries the
          // read and the Fresnel only lifts the grazing edge.
          col = mix(col, uPoolTint, poolFill * ${Number(SAND_W4.poolFill).toFixed(2)});
          col *= 1.0 - poolFill * ${Number(SAND_W4.poolDarken).toFixed(2)};
          col = mix(col, uSandSky, poolFill * ddFres * 0.55);
          // Weed. W3 put one disc at the centre of every 0.55 m cell, which
          // printed a polka-dot lattice at corner-close; jitter the seat, vary
          // the radius, and let a slow field decide where weed grows at all.
          vec2 weedC = floor(gp / 0.55);
          vec2 weedJ = vec2(ddsHash21(weedC + 7.1), ddsHash21(weedC + 13.9));
          float weedR = 0.11 + 0.19 * ddsHash21(weedC + 3.3);
          float weedPatch = smoothstep(0.32, 0.66, ddsNoise(gp * 0.55 + 63.0));
          float weed = (1.0 - smoothstep(weedR * 0.55, weedR, length(fract(gp / 0.55) - weedJ)))
            * step(0.60, ddsHash21(weedC + 41.0)) * weedPatch * poolFill;
          col = mix(col, vec3(0.10, 0.16, 0.10), weed * 0.78);

          // ── P13-A8 item 1a: the shoreline, band 3 ─────────────────────────
          // Foam goes on LAST of the sand terms. The reach-wrack and the drift
          // threads both sit within a metre of the front and painting them over
          // the run-up turned the white into a grey smear the first time round.
          // ── P16-PM8 ITEM 4 — THE DEAD FLAT GREY WEDGE, THIRD ROUND. ──
          // p16-pm8-ray beach-corner 20,120 returns nature:beach-shelf:east at
          // world (327.65, 0.06, 3.92) and that pixel reads (164, 160, 159).
          // A4 F1 and A5 pack-b both measure it as "twenty samples 159–165,
          // every channel within 4 levels", and both read it as an untextured
          // void plane. It is neither untextured nor a stray plane: it is THIS
          // shader's swash foam at full coverage. a8Shore.z saturates across
          // the whole run-up band and uSandFoam is mixed in at strength, and
          // past 85 m every fine octave has faded out BY DESIGN (ddRipVis gone
          // by 85 m, ddPrintVis long before), so what survives at the frame's
          // corner is one colour over sixty by eighty pixels. The toggles agree
          // it is not lighting: ao0 and hiding fringe:port both leave it
          // unchanged to within a level.
          //
          // The fault is FLATNESS, not paleness, so both clauses are aimed at
          // that. The foam takes a ceiling that falls with distance, so the
          // sand's own value always reads through it; and a two-octave tonal
          // field rides on top at range — 18 m and 42 m cycles, which are 9 and
          // 21 pixels at this pose's 95 m, so both are comfortably inside the
          // footprint filter and neither can alias.
          float ddFarD = length(cameraPosition - vSandWorld);
          float ddFarF = smoothstep(45.0, 90.0, ddFarD);
          col = mix(col, uSandFoam,
            min(a8Shore.z * ${Number(SAND_A8.foamAmt).toFixed(3)}, 0.35) * ${(1 - SAND_W20.gain * (1 - SAND_W20.lineKeep)).toFixed(2)}
              * (1.0 - smoothstep(0.12, 0.48, abs(frontF))) * ddRimFoamFade(vSandWorld));
          {
            float ddTone = ddBand(gp + 137.0, 0.055, px) + ddBand(gp + 211.0, 0.024, px) * 1.35;
            col *= 1.0 + ddFarF * clamp(ddTone, -1.0, 1.0) * 0.090;
          }

          if (vSandKind > 0.5 && vSandKind < 1.5) {
            if (cornerM < 0.02) discard;
            float rk = 0.82 + 0.18 * ddsNoise(gp * 4.2 + 3.0);
            col = uRock * rk;
          } else if (vSandKind > 1.5 && vSandKind < 2.5) {
            if (cornerM < 0.02) discard;
            col = mix(uTussock, uTussock * 0.72, ddsNoise(gp * 6.1));
          } else if (vSandKind > 2.5) {
            if (cornerM < 0.02) discard;
            float htN = clamp((vSandWorld.y - ${SAND_Y.toFixed(2)}) / 0.78, 0.0, 1.0);
            vec3 skin = vec3(0.62, 0.42, 0.28);
            vec3 togs = vec3(0.18, 0.28, 0.46);
            col = mix(togs, skin, smoothstep(0.38, 0.62, htN));
          }

          // W20: a continuous 3 m wet band on the actual wrap front,
          // after the old foam overlay so pale scum cannot erase wet sand.
          if (vSandKind < 0.5) {
            // The authored swash occupies the first 4 m landward of front=0.
            // Seat the wet sand behind its landward edge, not in the foam.
            float w20Front = frontF + 4.0 + 0.18 * ddsNoise(vec2(along * 0.12, 7.0));
            float w20Wet = smoothstep(-3.6, -2.9, w20Front)
              * (1.0 - smoothstep(-0.25, 0.2, w20Front));
            // The return beside the port exposes the shelf's INNER edge
            // (shore=0.5 m), not its outer polar swash. Same metric band.
            float w20Return = smoothstep(8.0, 14.0, abs(along-uBayCentre)-uAlongHalf);
            float w20Inner = (1.0-smoothstep(3.0,3.7,vSandShore)) * w20Return;
            w20Wet = max(w20Wet,w20Inner);
            // W4-A: wet sand is the ground.sand.wet token over ground.sand.dry (0.78, 0.79, 0.77), not
            // a sepia 0.43 / 0.35 / 0.28 (the banned sepia shelf).
            col = mix(col, col * vec3(0.78, 0.79, 0.77), w20Wet * 0.85 * uW20Shore * ${(1 - SAND_W20.gain).toFixed(2)}); // taste-r1 (W20-A): the 3 m band is the gradient above when SAND_W20.gain is 1
            float w20Scum = (1.0-smoothstep(0.035,0.10,abs(w20Front+3.15)))
              * smoothstep(0.30,0.65,ddsNoise(vec2(along*0.9, 4.2)));
            w20Scum = max(w20Scum,(1.0-smoothstep(0.035,0.10,abs(vSandShore-3.45))) * w20Return
              * smoothstep(0.30,0.65,ddsNoise(vec2(along*0.9,4.2))));
            float w20ReturnEdge = (1.0-smoothstep(0.06,0.18,abs(vSandShore-0.8))) * w20Return;
            // W4-A: the dashed scum line (noise-gated segments along one front) is the banned
            // dashed polyline surf; only the continuous return edge stays.
            col = mix(col, uSandFoam, w20ReturnEdge * 0.35 * uW20Shore);
          }

          // Wet sand in rain: TASTE_RAIN.wetAlbedo.sand (0.78) on the beach sand albedo, 1.0 when clear.
          if (vSandKind < 0.5) col *= uSandRainAlbedo;

          // W14-B: the lip and the lace go on after the rain albedo so a wet
          // sky never darkens them. Foam token, nothing emissive; lace is at
          // most half covered, the lip is the one thing that reaches 0.9.
          if (vSandKind < 0.5) {
            float ddRimFade = ddRimFoamFade(vSandWorld);
            // taste-w25 (foam): in rain (the albedo above, 0 clear to 1 full) the lip and lace take a lower gain so they do not glow against grey water; 1.0 when FOAM_TORN is 0.
            float ddFoamRain = clamp((1.0 - uSandRainAlbedo) / ${(1 - TASTE_RAIN.wetAlbedo.sand).toFixed(2)}, 0.0, 1.0);
            col = mix(col, uSandFoam, clamp(swS.z, 0.0, 0.5) * ${quality === 'low' ? '0.0' : '1.0'} * ddRimFade * mix(1.0, ${FOAM_TORN_TUNE.rainLace.toFixed(2)}, ddFoamRain));
            col = mix(col, uSandFoam, clamp(swS.y, 0.0, 0.92) * ddRimFade * mix(1.0, ${FOAM_TORN_TUNE.rainLip.toFixed(2)}, ddFoamRain));
          }

          // Assign, not multiply: diffuse is already uSandDry, and a dead
          // multiply on white was the observed neutral pale.
          diffuseColor.rgb = col;

          // ── Dissolve ──────────────────────────────────────────────────────
          // Keyed on how much water stands over the shelf, not on a straight
          // shore distance, and wobbled so the edge is never a ruler (W-R01c).
          float edgeWob = ddBand(gp + 61.0, 0.075, px) * 2.0
                        + ddBand(gp + 71.0, 0.320, px) * 1.1;
          float seaFade = 1.0 - smoothstep(0.18, 1.05, ddSubmF + edgeWob * 0.16);
          // P13-W3: per-FRAGMENT wrap-front feather, ≤ 0.6 m. Vertex-interpolated
          // lipFade was the cream fan (one coarse cap triangle, ocean showing
          // through). Inland of the iso-front the shelf is opaque.
          float lipFade = 1.0 - smoothstep(${Number(SHORE.cornerLipFrom).toFixed(2)}, ${Number(SHORE.cornerLipTo).toFixed(2)}, frontF + edgeWob * 0.08);
          seaFade *= mix(1.0, lipFade, cornerM);
          // P15-AP3: inside the Apostles cove the shelf is under water, so it
          // dissolves there the same way it does past any waterline: through
          // seaFade, so the alpha < 0.14 discard below stops the depth write
          // and the ocean sheet behind it is no longer rejected.
          // W4-A: the cove window used to fade the sloping shelf over 13 m of x, which left a pale
          // translucent strip with straight ends (window edges at x 313..326, z 194..206 and 278..292).
          // The shelf now dissolves early, along a wandering line (noise at 6 m and 2 m along z),
          // so the sand meets the cove water at a shoreline and nothing translucent is left over it.
          float coveN = 0.6 * ddsNoise(vec2(vSandWorld.z * 0.17, 3.7)) + 0.4 * ddsNoise(vec2(vSandWorld.z * 0.53, 8.1));
          seaFade *= 1.0 - smoothstep(0.02 + 0.28 * coveN, 0.30 + 0.28 * coveN, ddCoveCut(vSandWorld));
          // Landward guard only: the first metre is buried inside the seawall.
          float landFade = smoothstep(0.30, 1.15, vSandShore);
          diffuseColor.a *= clamp(seaFade * landFade, 0.0, 1.0);
${CORNER_ALPHA ? CA_ALPHA_GLSL_ON : CA_ALPHA_GLSL_OFF}          if (vSandKind > 0.5) {
            diffuseColor.a = max(diffuseColor.a, 0.99);
          }
          // The shelf is a transparent material with depthWrite on, and it sorts
          // BEFORE the water, so a faded-but-still-drawn fragment over the shallows
          // writes depth and rejects the water plane behind it — a dead-straight
          // cut several metres seaward of the waterline (found by the FOAM seat
          // in foam-r8/03-surf-macro, and the likely root of W-R01c). Discarding
          // once the shelf has effectively dissolved stops the depth write.
          if (diffuseColor.a < 0.14) discard;
        }
      `)
      .replace('#include <roughnessmap_fragment>', /* glsl */ `#include <roughnessmap_fragment>
        {
          // Dry sand is fully diffuse and slightly uneven. Wet sand is smoother.
          // The water sheet left by a run-up is the only near-mirror on the
          // beach, and it is patchy — a uniform gloss over the whole fringe was
          // half of the grey ruler band.
          float r = 0.905 - ddToothF * 0.20;
          r = mix(r, 0.66, smoothstep(0.05, 0.62, ddWetF));
          // P13-W4: the drain film was 0.14 — a mirror. It is a millimetre of
          // water on a rough mineral, not a lacquer coat.
          r = mix(r, 0.42, ddFilmF);
          r = mix(r, 0.52, smoothstep(0.03, 0.40, ddSubmF));
          // A walked lane is packed flat: smoother than raked sand, still matte.
          r = mix(r, ${Number(SAND_W4.pathRough).toFixed(2)}, ddPathC * 0.75);
          // P13-W2 damp-sand sheen: roughness dip just above the wet band.
          float sheen = smoothstep(${Number(SHORE.sandDampSheenFrom).toFixed(1)}, ${Number(SHORE.sandDampSheenFrom + 1.6).toFixed(1)}, vSandFront)
            * (1.0 - smoothstep(${Number(SHORE.sandDampSheenTo - 1.2).toFixed(1)}, ${Number(SHORE.sandDampSheenTo).toFixed(1)}, vSandFront))
            * (1.0 - smoothstep(0.18, 0.55, ddWetF));
          r = mix(r, 0.38, sheen * 0.72);
          // Swash-varying sheen on the corner wet band. P13-W4 raises the W3
          // target from 0.12 to 0.42: at 0.12 this was the glossy plastic film
          // the blind pack named. The highlight now comes from the Fresnel term
          // in the albedo instead, which only fires near grazing.
          float swashSheen = ddSwashWet(vSandAlong, vSandFront, uTime)
            * ddCornerMask(vSandWorld) * smoothstep(0.18, 0.78, ddWetF);
          r = mix(r, 0.42, swashSheen * 0.62);
          // P13-A8: the run-up film. Above W4's floor by construction, so this
          // cannot reopen the varnish the floor was put in to close.
          r = mix(r, ${Number(SAND_A8.swashRough).toFixed(2)}, ddSwashC * 0.85);
          // Hard floor on SAND. Everything above can only approach it.
          r = max(r, ${Number(SAND_W4.wetRoughFloor).toFixed(2)});
          // The rock pool is water, not sand, and keeps its mirror.
          float poolD2 = ddCornerPoolD(vSandAlong, vSandShore);
          float poolWet = (1.0 - smoothstep(${(Number(SHORE.cornerPoolR) * SAND_W4.poolEdgeInner).toFixed(3)}, ${(Number(SHORE.cornerPoolR) * SAND_W4.poolEdgeOuter).toFixed(3)}, poolD2)) * ddCornerMask(vSandWorld);
          r = mix(r, 0.08, poolWet);
          if (vSandKind > 0.5 && vSandKind < 1.5) r = 0.78;
          if (vSandKind > 1.5 && vSandKind < 2.5) r = 0.92;
          if (vSandKind > 2.5) r = 0.55;
          if (vSandKind < 0.5) r += (ddPackValue - 1.0) * 0.18 * (1.0 - poolWet);
          roughnessFactor = clamp(r, 0.06, 1.0);
        }
      `)
      .replace('#include <normal_fragment_maps>', /* glsl */ `#include <normal_fragment_maps>
        {
          // Micro relief as a real world-space gradient pushed into view space.
          // Epsilon tracks the pixel footprint so the perturbation is as
          // band-limited as the field it samples.
          //
          // Round 1 filtered this path by a blanket 1.7x and took a fixed 3 cm
          // epsilon, which cannot resolve a 10 cm ripple at all. The blanket
          // multiplier is gone, replaced by the two things it was standing in
          // for. First, the normal filters against the WORST axis: a gradient
          // is far more alias-prone than a tone, and the anisotropic mean is
          // only honest for the tone. Second, the epsilon tracks the footprint
          // all the way up instead of clamping at 9 cm — a finite difference
          // taken at 9 cm while a pixel covers 20 cm reads the unfiltered
          // gradient of a near-Nyquist field, which beat against the pixel grid
          // and painted a hard diagonal moire over the whole backshore at board
          // distance. That was W-R01a coming back through the normal.
          float npx = max(ddPx, ddPxD * 0.75);
          float e = clamp(npx * 0.85, 0.012, 1.2);
          float fr = mix(vSandFront, ddFrontFrag(vSandWorld), step(0.01, ddCornerMask(vSandWorld)));
          float h0 = ddSandMicro(ddGP, npx, fr, ddTrafF, ddWetF).x;
          float ha = ddSandMicro(ddGP + vec2(e, 0.0), npx, fr, ddTrafF, ddWetF).x;
          float hb = ddSandMicro(ddGP + vec2(0.0, e), npx, fr, ddTrafF, ddWetF).x;
          if (vSandKind < 0.5) {
            // taste-r1 (W15): bump from the pack's luminance, 1.75 times the albedo amplitude, inside 120 m only.
            float ddBumpD = length(cameraPosition - vSandWorld);
            float ddBump = 1.75 * 0.25 * 0.16 * (1.0 - smoothstep(70.0, 120.0, ddBumpD));
            if (ddBump > 0.0005) {
              h0 += (ddSandPackLum(ddGP, ddPackWet) - 1.0) * ddBump;
              ha += (ddSandPackLum(ddGP + vec2(e, 0.0), ddPackWet) - 1.0) * ddBump;
              hb += (ddSandPackLum(ddGP + vec2(0.0, e), ddPackWet) - 1.0) * ddBump;
            }
          }
          float cMn = ddCornerMask(vSandWorld);
          h0 += ddCornerWetRip(ddGP, npx, fr, ddWetF, cMn) * 0.007;
          ha += ddCornerWetRip(ddGP + vec2(e, 0.0), npx, fr, ddWetF, cMn) * 0.007;
          hb += ddCornerWetRip(ddGP + vec2(0.0, e), npx, fr, ddWetF, cMn) * 0.007;
          float tyre0 = ddCornerTyre(ddGP, npx, fr, cMn);
          h0 -= tyre0 * 0.012;
          ha -= ddCornerTyre(ddGP + vec2(e, 0.0), npx, fr, cMn) * 0.012;
          hb -= ddCornerTyre(ddGP + vec2(0.0, e), npx, fr, cMn) * 0.012;
          vec3 seaDir = normalize(vec3(uShoreNormal.x, 0.0, uShoreNormal.z));
          vec3 alongDir = vec3(uShoreNormal.z, 0.0, -uShoreNormal.x);
          vec3 slope = -(alongDir * ((ha - h0) / e) + seaDir * ((hb - h0) / e));
          // Cap the perturbation: a finite difference across a steep ripple lee
          // can otherwise tip the normal past the horizon and go black.
          float sl = length(slope);
          if (sl > 1.4) slope *= 1.4 / sl;
          // L3: half the corner's wear/pit slope; retain the plate-scale tone.
          float gain = 2.1 * mix(1.0, 0.5, cMn) * (1.0 - smoothstep(0.05, 0.55, ddSubmF));
          normal = normalize(normal + (viewMatrix * vec4(slope, 0.0)).xyz * gain);
        }
      `);

    if (spineU) {
      // Wave 75: the shelf's front is d from the spine's texture, per fragment as well as per vertex; the old function stays as ddWrapFrontLegacy.
      const need = (src, from, to) => {
        if (!src.includes(from)) throw new Error(`coast spine: shelf anchor missing: ${from.slice(0, 48)}`);
        return src.replace(from, () => to);
      };
      // Wave 75 fix 3: the corner terms' datum reads (mask-only) become the sheet's, with SEA_DATUM's knobs (BEACH_DATUM). Each text must appear in at least one stage.
      const D = BEACH_DATUM;
      const datumSwaps = [
        [`${Number(SAND_PM1.padLandFrom).toFixed(2)}, 0.0, front);`, `${Number(D.land).toFixed(2)}, 0.0, front);`],
        [`float waterLift = ${(SAND_PM1.seaTop - SAND_PM1.seaClear - WATER_Y).toFixed(4)};`, `float waterLift = ${(D.top - D.clear - WATER_Y).toFixed(4)};`],
        [`float ceilLocal = ${(SAND_PM1.seaTop - SAND_PM1.seaClear - SAND_Y).toFixed(4)}\n      - max(front, 0.0) * ${Number(SAND_PM1.seawardFall).toFixed(3)}`,
          `float ceilLocal = ${(D.top - D.clear - SAND_Y).toFixed(4)}\n      - max(front, 0.0) * ${Number(D.fall).toFixed(3)}`],
        [`float above = w.y - ${Number(SAND_PM1.seaTop).toFixed(4)};\n    float run = above / ${Number(SAND_PM1.seawardFall).toFixed(3)};`,
          `float above = w.y - ${Number(D.top).toFixed(4)};\n    float run = above / ${Number(D.fall).toFixed(3)};`],
      ];
      const swapped = datumSwaps.map(() => 0);
      const swapDatum = (src) => {
        datumSwaps.forEach(([from, to], i) => { if (src.includes(from)) { src = src.replace(from, () => to); swapped[i] += 1; } });
        return src;
      };
      const patch = (src) => {
        src = swapDatum(src);
        if (!src.includes('float ddWrapFront(float along, float shore, float t) {')) return src; // a stage without the beach profile (a test's stub)
        src = need(src, 'float ddWrapFront(float along, float shore, float t) {',
          `${COAST_SPINE_GLSL}\n${COAST_SHELF_FRONT_GLSL}\n${COAST_BEACH_RELIEF_GLSL}\n${swashSpineGlsl()}\n  float ddWrapFrontLegacy(float along, float shore, float t) {`);
        src = need(src, 'float dry = (profile + bench + cusp + dune + wrack + w15Ridge + w15Tuss) * free;',
          `float ddRg = ddSpineRelief(front);
    float ddProf = profile * free;
    float dry = ddProf + (bench + cusp + dune + wrack + w15Ridge + w15Tuss) * free * ddRg;
    float ddFlo = mix(-1.0e3, ${(WATER_Y - SAND_Y).toFixed(4)} + (ddProf - ${(WATER_Y - SAND_Y).toFixed(4)}) * ${BEACH_RELIEF.keep.toFixed(3)}, step(front, 0.0));`);
        src = need(src, 'dry += (ddsNoise(vec2(along * 0.11, front * 0.09)) - 0.5) * 0.022;',
          'dry += (ddsNoise(vec2(along * 0.11, front * 0.09)) - 0.5) * 0.022 * ddRg;\n    dry = max(dry, ddFlo);');
        return src;
      };
      shader.vertexShader = patch(shader.vertexShader);
      const fragPatched = patch(shader.fragmentShader);
      const frontAnchor = 'float front = mix(frontV, frontF, step(0.01, cornerM));'; // absent only from a test's stub fragment stage
      // Wave 78 (2b-3): the swash reads the still front less the old front's drift times the beach weight (swash-spine.js): the tongues, the run-up envelope, the sheen, lip and lace.
      // The sand's own front and its edge stand still. A stage without the front anchor (a test's stub) keeps its text.
      const swashSwaps = [
        ['float env = ddWetEnvelopeAlong(along, front);', 'float env = ddWetEnvelopeAlong(along, swFront);'],
        ['float w0 = ddSwashWet(along, front, uTime) * env;', 'float w0 = ddSwashWet(along, swFront, uTime) * env;'],
        ['float w1 = ddSwashWet(along, front, uTime - 3.92) * env;', 'float w1 = ddSwashWet(along, swFront, uTime - 3.92) * env;'],
        ['float w2 = ddSwashWet(along, front, uTime - 7.84) * env;', 'float w2 = ddSwashWet(along, swFront, uTime - 7.84) * env;'],
        ['vec4 swS = ddSwashSurface(along, front, uTime, ddPxD)', 'vec4 swS = ddSwashSurface(along, swFront, uTime, ddPxD)'],
        ['float swashSheen = ddSwashWet(vSandAlong, vSandFront, uTime)', 'float swashSheen = ddSwashWet(vSandAlong, ddSpineSwashFront(vSandFront, vSandAlong, uTime, ddSpineSwashWeight(vSandWorld.xz)), uTime)'],
      ];
      let fragOut = fragPatched;
      if (fragPatched.includes(frontAnchor)) {
        fragOut = fragPatched.replace(frontAnchor, () => 'float front = frontF;\n          float swFront = ddSpineSwashFront(frontF, along, uTime, ddSpineSwashWeight(vSandWorld.xz));');
        for (const [from, to] of swashSwaps) {
          if (fragOut.split(from).length !== 2) throw new Error(`coast spine swash: the text ${from} is not unique in the sand fragment`);
          fragOut = fragOut.replace(from, () => to);
        }
      }
      shader.fragmentShader = fragOut;
      swapped.forEach((n, i) => { if (!n && shader.vertexShader.includes('ddBeachHeight')) throw new Error(`coast spine: datum text ${i} not found in either stage`); });
    }

    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => (CORNER_ALPHA ? 'dd-beach-sand-v56-p23-photo-ca1' : 'dd-beach-sand-v56-p23-photo') + (spineU ? '-spine1' : '');
  return { material, uniforms: shared };
}

/**
 * CPU mirror of `ddRipVis`. Item 1's law in one place so a test can assert it
 * rather than reading the GLSL back as a string.
 *
 * @param {number} cameraDist metres from the camera to the fragment
 * @returns {number} 0..1 multiplier on the wind-ripple term
 */
export function rippleVisibilityAt(cameraDist) {
  const d = Number(cameraDist);
  if (!Number.isFinite(d)) return 0;
  const ss = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const near = 1 - (1 - SAND_W4.rippleFarKeep)
    * ss(SAND_W4.rippleNear, SAND_W4.rippleQuarter, d);
  const far = 1 - ss(SAND_W4.rippleQuarter, SAND_W4.rippleGone, d);
  return Math.max(0, Math.min(1, near * far));
}

/** CPU mirror of `ddPrintVis`. Single prints only inside `printFar` metres. */
export function printVisibilityAt(cameraDist) {
  const d = Number(cameraDist);
  if (!Number.isFinite(d)) return 0;
  const t = Math.max(0, Math.min(1,
    (d - SAND_W4.printNear) / (SAND_W4.printFar - SAND_W4.printNear)));
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Deterministic CPU receipt for W10's incommensurate plate-scale wind field.
 * It is intentionally phase-equivalent rather than a GPU-noise reimplementation:
 * the test asks whether a 20 m translation repeats, not for texture readback.
 */
export function sandPlatePatternAt(x, z) {
  const px = Number.isFinite(Number(x)) ? Number(x) : 0;
  const pz = Number.isFinite(Number(z)) ? Number(z) : 0;
  const dA = { x: 0.238, z: 0.971 };
  const dB = { x: -0.487, z: 0.873 };
  const warpA = Math.sin(px * 0.037 * 1.73 + pz * 0.037 * 2.19 + 1.7) * 2.7;
  const warpB = Math.sin(px * 0.021 * 2.41 - pz * 0.021 * 1.37 + 4.2) * 4.05;
  const a = Math.sin(((px * dA.x + pz * dA.z + warpA) * 2 * Math.PI)
    / SAND_W10.plateRippleM);
  const b = Math.sin(((px * dB.x + pz * dB.z + warpB) * 2 * Math.PI)
    / SAND_W10.plateCrossM);
  return Math.max(-1, Math.min(1, a * 0.70 + b * 0.30));
}

/**
 * CPU mirror of `ddMicroCap`. The softsign cap on grain + ripple + mottle:
 * |out| < `SAND_W4.microCap` for every finite input, and small inputs pass
 * through unchanged.
 */
export function microValueCap(v) {
  const x = Number(v);
  if (!Number.isFinite(x)) return 0;
  const a = x / SAND_W4.microCap;
  return x / (1 + a * a * a * a) ** 0.25;
}

/** Worst-case unclamped swing of the three whole-beach value fields. */
export function microValueBudget() {
  return {
    grain: SHORE.sandGrainAmt,
    ripple: SHORE.sandWindRippleAmt,
    mottle: SHORE.sandMottleAmt,
    rawWorstCase: SHORE.sandGrainAmt + SHORE.sandWindRippleAmt * 2 + SHORE.sandMottleAmt,
    cap: SAND_W4.microCap,
    cappedWorstCase: Math.abs(microValueCap(1e6)),
  };
}

/** CPU-scale mirror of the three wind-turned bands in `ddDryPlateTone`. */
export function drySandPlateToneAt(alongM, shoreM) {
  const x = Number(alongM);
  const z = Number(shoreM);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
  const phase = (u, v, scale, salt) => Math.sin((u + v + salt) * Math.PI * 2 / scale);
  const a = phase(x * 0.94, z * 0.34, SAND_PM11.toneScalesM[0], 17.3);
  const b = phase(x * 0.72, -z * 0.69, SAND_PM11.toneScalesM[1], 41.7);
  const c = phase(x, z * 0.82, SAND_PM11.toneScalesM[2], 83.1);
  return Math.max(-1, Math.min(1, a * 0.28 + b * 0.42 + c * 0.30));
}

/** 30 cm fine relief remains in the normal path, never in dry albedo. */
export function drySandRelief30cmAt(alongM, shoreM) {
  const x = Number(alongM);
  const z = Number(shoreM);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
  const phase = (x * 0.82 + z * 0.57) * Math.PI * 2 / SAND_PM11.reliefWavelengthM;
  return Math.sin(phase) * SAND_PM11.reliefAmplitudeM;
}

/**
 * Deterministic luma proxy for the same dry plate before/after PM11. The old
 * side includes its 15.6/52.6 cm albedo grain; the new side contains only the
 * 3–8 m tone field. This is the numeric gate reported by PM11.
 */
export function drySandPlateStats({ widthM = 16, depthM = 8, stepM = 0.08 } = {}) {
  const legacy = [];
  const current = [];
  for (let z = 0; z <= depthM + 1e-9; z += stepM) {
    for (let x = 0; x <= widthM + 1e-9; x += stepM) {
      const plate = drySandPlateToneAt(x, z);
      const fine = Math.sin((x * 0.83 + z * 0.56) * Math.PI * 2 / 0.156) * 0.62
        + Math.sin((x * 0.31 - z * 0.95) * Math.PI * 2 / 0.526) * 0.38;
      legacy.push(0.72 * (1 + plate * SAND_PM11.toneGain
        + fine * SAND_PM11.legacyToneGain));
      current.push(0.72 * (1 + plate * SAND_PM11.toneGain));
    }
  }
  const std = (values) => {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
  };
  const legacyStd = std(legacy);
  const currentStd = std(current);
  return {
    samples: current.length,
    legacyStd,
    currentStd,
    reduction: 1 - currentStd / legacyStd,
    relief30cmPeakToPeak: SAND_PM11.reliefAmplitudeM * 2,
  };
}

/**
 * Mid-beach no-change probe: mask, wet/pale/lip gains, and the sand/wet
 * uniform sources. At (280, 120) and (300, 200) mask is 0 so every gain
 * is 1 and the hues match SAND_HUES.
 */
export function sandCornerProbe(x, z, front = 0) {
  const mask = cornerMaskAt(x, z);
  const span = Math.max(SHORE.cornerLipTo - SHORE.cornerLipFrom, 1e-6);
  const t = Math.max(0, Math.min(1, (Number(front) - SHORE.cornerLipFrom) / span));
  const lip = 1 - t * t * (3 - 2 * t);
  const seaLocalCap = Number(SHORE.cornerSeawardMaxY) - SAND_Y;
  return {
    x, z,
    mask,
    wetGain: 1 + (SHORE.cornerWetGain - 1) * mask,
    paleKeep: 1 - mask * 0.92,
    lipFade: 1 + (lip - 1) * mask,
    lipWidth: SHORE.cornerLipTo - SHORE.cornerLipFrom,
    seawardMaxY: SHORE.cornerSeawardMaxY,
    seawardLocalYCap: seaLocalCap,
    wrapLift: SHORE.cornerWrapLift,
    uSandDry: SAND_HUES.dry,
    uSandPale: SAND_HUES.pale,
    uSandDamp: SAND_HUES.damp,
    uSandWet: SAND_HUES.wet,
    uSwashReach: 9.5,
    wetDepth: SHORE.wetDepth,
    wetDarkenExtra: SHORE.wetDarkenExtra,
    sandGrainAmt: SHORE.sandGrainAmt,
    sandWindRippleAmt: SHORE.sandWindRippleAmt,
    sandMottleAmt: SHORE.sandMottleAmt,
    cornerBermH: SHORE.cornerBermH,
    cornerRockCount: SHORE.cornerRockCount,
    cornerTussockCount: SHORE.cornerTussockCount,
    // P13-W4. Amps stay the W2 numbers; the swing is capped on the SUM.
    microCap: SAND_W4.microCap,
    rippleVisNear: rippleVisibilityAt(SAND_W4.rippleNear),
    rippleVisAt40: rippleVisibilityAt(40),
    rippleVisAt70: rippleVisibilityAt(70),
    rippleVisAt150: rippleVisibilityAt(150),
    printVisAt25: printVisibilityAt(25),
    wetRoughFloor: SAND_W4.wetRoughFloor,
    driftAmtEffective: SHORE.sandDriftAmt * SAND_W4.driftAmtScale,
    pathWidthM: [
      SAND_W4.pathHalfMin * 2,
      (SAND_W4.pathHalfMin + SAND_W4.pathHalfVar) * 2,
    ],
    dryToneScalesM: [...SAND_PM11.toneScalesM],
    dryAlbedoGrain: SAND_PM11.dryAlbedoGrain,
    reliefWavelengthM: SAND_PM11.reliefWavelengthM,
  };
}

/* ─────────────────── P16-PM1 — the section, on the CPU ─────────────────── */

/**
 * ── WHY THIS EXISTS, AND WHY IT IS NOT A SECOND OPINION. ──
 *
 * The shelf's height is computed in the VERTEX program, so a raycast against
 * the sand returns the undisplaced plane and every caller that wanted to stand
 * something on the beach has had to guess. `port.js`'s `cornerSandY` guessed
 * `SHORE.sandY` (0.06) landward of the front and `cornerSeawardMaxY` (0.04)
 * seaward of it; measured against the drawn shelf that is 0.16 m low across the
 * whole corner backshore, so the revetment, the beach kit and A9's civilians
 * were all authored a sixth of a metre into the sand.
 *
 * These functions mirror the deterministic terms of `ddBeachHeight` +
 * `ddCornerLift` + `ddCornerPad` + `ddCornerSeaCap` for the east bay. What is
 * deliberately NOT mirrored: `ddTapSample` (transient interaction craters) and
 * `ddCoveDrop` (world z 194–292, a different venue). The residual against the
 * GPU readback is reported in P16-PM1-REPORT.md, and
 * `p13-sand-corner.test.mjs` pins the section laws — crosses the sheet once,
 * falls monotonically through it, slope inside the stated band — so a change to
 * the GLSL that the mirror does not follow fails a test rather than moving a
 * hundred props silently.
 */
const EAST_BAY = Object.freeze({ originX: 274.8, alongHalf: 136, alongCentre: -136 });

function fract1(v) { return v - Math.floor(v); }

/** CPU of `ddsHash21` (SAND_NOISE_GLSL). */
function sHash21(px, pz) {
  const x = ((px % 8192) + 8192) % 8192;
  const y = ((pz % 8192) + 8192) % 8192;
  let qx = fract1(x * 0.1031);
  let qy = fract1(y * 0.1030);
  let qz = fract1(x * 0.0973);
  const d = qx * (qy + 33.33) + qy * (qz + 33.33) + qz * (qx + 33.33);
  qx += d; qy += d; qz += d;
  return fract1((qx + qy) * qz);
}

/** CPU of `ddsNoise`. */
function sNoise(px, pz) {
  const ix = Math.floor(px);
  const iz = Math.floor(pz);
  const fx = px - ix;
  const fz = pz - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = sHash21(ix, iz);
  const b = sHash21(ix + 1, iz);
  const c = sHash21(ix, iz + 1);
  const d = sHash21(ix + 1, iz + 1);
  return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uz;
}

/** CPU of `ddsFbm`. */
function sFbm(px, pz, oct) {
  let v = 0;
  let a = 0.5;
  let x = px;
  let z = pz;
  for (let i = 0; i < oct; i += 1) {
    v += a * sNoise(x, z);
    x = x * 2.03 + 19.7;
    z = z * 2.03 + 7.3;
    a *= 0.5;
  }
  return v;
}

function ss(e0, e1, x) {
  const d = e1 - e0;
  if (Math.abs(d) < 1e-12) return x >= e1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - e0) / d));
  return t * t * (3 - 2 * t);
}

/** CPU of `ddCoastLine` at t = 0. */
function coastLineAt(along) {
  return WATER_FACE
    + Math.sin(along * 0.0080) * 2.10
    + Math.sin(along * 0.0191 + 1.7) * 1.15
    + Math.sin(along * 0.0413 + 0.55) * 0.52
    + Math.sin(along * 0.0110) * 0.55
    + Math.sin(along * 0.0281 + 1.1) * 0.32;
}

/** CPU of `ddDepth` (contract BATHY). */
function depthAt(front) {
  const f = Math.max(front, 0);
  const ramp = Math.min(f / 165, 1);
  const bar = Math.exp(-(((f - 55) / 26) ** 2)) * 1.35;
  return Math.max(0, 9.0 * ramp * ramp * (3 - 2 * ramp) - bar);
}

function faceLenAt(along) {
  const n = Math.max(0, Math.min(1, (sFbm(along * 0.0115, 17.3, 3) - 0.17) / 0.54));
  const m = 0.5 + 0.5 * Math.sin(along * 0.0137 + 1.9);
  return 7.2 + 7.0 * Math.max(0, Math.min(1, n * 0.62 + m * 0.38));
}

function faceFallAt(x, u) {
  const scarp = u.scarpDrop * ss(0, u.scarpLen, x);
  const fx = Math.max(x - u.scarpLen, 0);
  return scarp + u.beachSlope * fx * (1 - 0.35 * ss(0, 12, fx));
}

/** Uniform values the shelf material is built with. Mirrors `makeSandMaterial`. */
const PROFILE_U = Object.freeze({
  beachSlope: 0.064, scarpDrop: 0.30, scarpLen: 3.40,
  // W14-B: the live cusp amplitude. `makeSandMaterial` builds 0.175 and
  // `water.js` sets 0.28 before the first frame; the twin follows what is drawn.
  cuspAmp: 0.28, windAmp: 0.110, benchAmp: 0.055,
});

/**
 * Shore-frame section height, in metres above `SAND_Y`. `along` and `front` are
 * the shore-frame scalars the GLSL uses; `mask` is `cornerMaskAt`.
 */
const CORNER_DATUM_OLD = Object.freeze({
  top: SAND_PM1.seaTop, clear: SAND_PM1.seaClear, pad: SAND_PM1.padSeaTo, fall: SAND_PM1.seawardFall, land: SAND_PM1.padLandFrom,
});
function sectionLocalY(along, front, shore, mask, spine = false) {
  const u = PROFILE_U;
  const free = ss(-26.0, -21.5, front);
  const len = faceLenAt(along);
  const bermAt = -len;
  const crestH = faceFallAt(len, u) - (SAND_Y - WATER_Y);
  let ramp = crestH * ss(bermAt - 6.5, bermAt, front);
  const oldAt = bermAt - 9.0 - 2.2 * sNoise(along * 0.031, 61.0);
  ramp += crestH * 0.34 * ss(oldAt - 5.5, oldAt, front)
    * (1 - ss(bermAt - 6.5, bermAt - 1.5, front));
  const x = Math.max(front - bermAt, 0);
  const profile = ramp - faceFallAt(x, u);
  const benchPh = x * 0.285 + sFbm(along * 0.021, 2.9, 3) * 2.6;
  const bench = Math.sin(benchPh * 6.2831853) * u.benchAmp
    * ss(0.6, 3.5, x) * (1 - ss(7.0, 17.0, x));
  const cuspEnv = ss(-26.0, -9.0, front) * (1 - ss(1.0, 11.0, front));
  const cusp = (Math.sin(along * 0.1963 + 0.7) * 0.60
    + Math.sin(along * 0.2992 + 2.3) * 0.28
    + Math.sin(along * 0.0921 - 1.1) * 0.34) * u.cuspAmp * cuspEnv;
  let dune = (sFbm(along * 0.026, front * 0.11, 2) - 0.375) * 2.67;
  dune *= u.windAmp * (1 - ss(-24.0, -10.0, front));
  const w15At = SAND_W15.ridgeFront
    + SAND_W15.ridgeWander * (sFbm(along * 0.012, 8.1, 2) - 0.5);
  const w15H = SAND_W15.ridgeH0
    + (SAND_W15.ridgeH1 - SAND_W15.ridgeH0) * sNoise(along * 0.018, 3.4);
  const w15Ridge = Math.exp(-(((front - w15At) / SAND_W15.ridgeHalfW) ** 2)) * w15H
    * (1 - ss(-9.0, -2.5, front));
  let w15Tuss = 0;
  if (w15Ridge > 0.35) {
    const tcx = Math.floor(along / 1.65);
    const tcz = Math.floor(front / 1.65);
    if (sHash21(tcx + 29.3, tcz + 29.3) > 0.38) {
      const fx2 = fract1(along / 1.65) - 0.5;
      const fz2 = fract1(front / 1.65) - 0.5;
      w15Tuss = Math.max(0, 1 - (fx2 * fx2 + fz2 * fz2) * 7.2) * SAND_W15.tussockH
        * (0.55 + 0.45 * sHash21(tcx + 8.2, tcz + 8.2));
    }
  }
  const foot = bermAt + u.scarpLen;
  const wrack = Math.exp(-(((front - (foot + (-9.0 - foot) * 0.35)) / 1.1) ** 2))
    * ss(0.44, 0.78, sFbm(along * 0.10, 4.7, 2)) * 0.055;
  // Wave 75 (spine path): the relief fades to nothing at d = 0 and the sand keeps half its profile's height over the sheet (coast-spine.js).
  const rg = spine ? beachReliefGate(front) : 1;
  const prof = profile * free;
  let dry = spine
    ? prof + (bench + cusp + dune + wrack + w15Ridge + w15Tuss) * free * rg
    : (profile + bench + cusp + dune + wrack + w15Ridge + w15Tuss) * free;
  const sh = front + coastLineAt(along);
  dry += (1 - ss(0.35, 5.2, sh)) * 0.48;
  dry += (sNoise(along * 0.11, front * 0.09) - 0.5) * 0.022 * rg;
  if (spine) dry = Math.max(dry, beachReliefFloor(front, prof));
  const bed = -((SAND_Y - WATER_Y)
    + Math.min(SHELF_FACE.slope * Math.max(front, 0), SHELF_FACE.cap));
  let h = Math.max(dry + (bed - dry) * ss(0.0, SHELF_FACE.blend, front), BED_FLOOR);

  if (mask >= 0.002) {
    // Wave 75 fix 3: on the spine path the corner terms read the sheet's datum (BEACH_DATUM = SEA_DATUM's knobs), not 0.1628.
    const dm = spine ? BEACH_DATUM : CORNER_DATUM_OLD;
    /* ddCornerLift — berm ridge, tussock and the pool dish. */
    const alongHalfM = Math.max(EAST_BAY.alongHalf, 1);
    const extra = Math.abs(along - EAST_BAY.alongCentre) - alongHalfM;
    const wrapGate = ss(-10.0, 2.0, extra);
    if (wrapGate >= 0.002) {
      const dryG = 1 - ss(-2.5, 1.0, front);
      const berm = Math.exp(-(((front - SHORE.cornerBermAt) / SHORE.cornerBermHalfW) ** 2))
        * SHORE.cornerBermH * dryG * wrapGate;
      let tuss = 0;
      if (berm > 0.04) {
        const tcx = Math.floor(along / 1.85);
        const tcz = Math.floor(front / 1.85);
        if (sHash21(tcx + 19.7, tcz + 19.7) > 0.42) {
          const fx2 = fract1(along / 1.85) - 0.5;
          const fz2 = fract1(front / 1.85) - 0.5;
          tuss = Math.max(0, 1 - (fx2 * fx2 + fz2 * fz2) * 6.5) * 0.16
            * (0.55 + 0.45 * sHash21(tcx + 4.1, tcz + 4.1));
        }
      }
      const poolA = EAST_BAY.alongCentre + alongHalfM + SHORE.cornerPoolAlong;
      let pd = Math.hypot(along - poolA, sh - SHORE.cornerPoolShore);
      pd += (sNoise(along * 0.48 + 3.1, sh * 0.48 + 3.1) - 0.5) * 1.15;
      const pool = -0.16 * (1 - ss(0.55, SHORE.cornerPoolR, pd)) * wrapGate;
      const pool2A = EAST_BAY.alongCentre + alongHalfM + SAND_W15.pool2Along;
      let pd2 = Math.hypot(along - pool2A, sh - SAND_W15.pool2Shore);
      pd2 += (sNoise(along * 0.44 + 5.7, sh * 0.44 + 5.7) - 0.5) * 0.95;
      const pool2 = -0.13 * (1 - ss(0.45, SAND_W15.pool2R, pd2)) * wrapGate;
      h += (berm + tuss + pool + pool2) * mask;
    }
    /* ddCornerPad — the P16 waterline-referenced backshore lift. */
    const wrapCap = ss(-2.0, 2.5, extra);
    const reach = Math.max(wrapCap, ss(6.0, 12.0, shore));
    const landT = 1 - ss(dm.land, 0, front);
    const seaT = 1 - ss(0, dm.pad, front);
    const waterLift = dm.top - dm.clear - WATER_Y;
    const lift = waterLift + (SHORE.cornerWrapLift - waterLift) * landT;
    h += lift * Math.max(seaT, landT) * reach * mask;
    /* ddCornerSeaCap — the sloping ceiling. */
    const ceil = Math.max(
      dm.top - dm.clear - SAND_Y
        - Math.max(front, 0) * dm.fall
        + Math.max(-front, 0) * SAND_PM1.landwardRise,
      BED_FLOOR,
    );
    const gate = ss(SAND_PM1.seaCapFrom, SAND_PM1.seaCapTo, front) * mask;
    h += (Math.min(h, ceil) - h) * gate;
  }
  return h;
}

/**
 * The beach section at a world XZ, as the shelf actually draws it.
 * Returns world Y plus the shore-frame scalars the caller usually wants next.
 */
export function beachSection(x, z) {
  const wx = Number(x) || 0;
  const wz = Number(z) || 0;
  // Wave 75 fix 2 and 4: with the spine switch on and a field mounted, the shelf is read as the shader draws it, everywhere. The frame is the
  // spine's own (the bay's edge: the east edge on seed 0, the south edge on seed 1; EAST_BAY is only the first), the shelf's relief, floor and
  // datum are the spine path's (the shader has them at every point), and the front is `coastSpineFront`: the baked beach weight gates the spine's
  // d against source A's front, so outside the beach label (weight 0: port, natural, creek) the front is source A's exactly, 1 inside it,
  // a smoothstep over 8 m along the curve at each change (the shader's `ddWrapFront`, the same rule).
  const activeField = activeCoastSpine();
  const fr = activeField?.curve?.info?.frame;
  const along = fr ? wx * fr.a[0] + wz * fr.a[1] : -wz;
  const shore = fr ? (wx - fr.O[0]) * fr.n[0] + (wz - fr.O[1]) * fr.n[1] : wx - EAST_BAY.originX;
  const oldFront = wrapFrontAt(along, shore, fr ? { alongHalf: fr.half, alongCentre: fr.alongC } : {
    alongHalf: EAST_BAY.alongHalf, alongCentre: EAST_BAY.alongCentre,
  }) - (coastLineAt(along) - WATER_FACE);
  const spineField = activeField ?? null;
  const front = spineField ? coastSpineFront(wx, wz, spineField, coastLineAt, oldFront) : oldFront;
  const mask = cornerMaskAt(wx, wz);
  const local = sectionLocalY(along, front, shore, mask, !!spineField);
  return {
    x: wx, z: wz, along, shore, front, mask,
    y: SAND_Y + local,
    // Wave 75: on the spine path the datum is the drawn sheet's height (WATER_Y), not SAND_PM1.seaTop's stale 0.1628, so the bed's zero is the sand's crossing.
    seaTop: spineField ? WATER_Y : SAND_PM1.seaTop,
    /** Metres of sand above the drawn sheet. Negative is underwater. */
    aboveSea: SAND_Y + local - (spineField ? WATER_Y : SAND_PM1.seaTop),
  };
}

/** World Y of the drawn beach shelf at a world XZ. */
export function beachSectionY(x, z) {
  return beachSection(x, z).y;
}

/**
 * Mean fall of the section between two fronts on one bearing, as a 1:N slope.
 * Used by the section pins and by the report's transect table.
 */
export function beachSlopeAt(x, z, from = -6, to = 0, step = 0.25) {
  const fr = activeCoastSpine()?.curve?.info?.frame;
  const shore = fr ? (Number(x) - fr.O[0]) * fr.n[0] + (Number(z) - fr.O[1]) * fr.n[1] : Number(x) - EAST_BAY.originX;
  const along = fr ? Number(x) * fr.a[0] + Number(z) * fr.a[1] : -Number(z);
  const mask = cornerMaskAt(Number(x), Number(z));
  const spineOn = !!activeCoastSpine();
  const at = (f) => SAND_Y + sectionLocalY(along, f, shore + (f - from), mask, spineOn);
  const y0 = at(from);
  const y1 = at(to);
  const run = Math.abs(to - from);
  const fall = y0 - y1;
  void step;
  return { fall, run, oneIn: fall > 1e-6 ? run / fall : Infinity };
}

/** World-Y the shelf is allowed to occupy seaward of wrap-front (mask). */
export function shelfSeawardMaxY() {
  return SHORE.cornerSeawardMaxY;
}

/** CPU of the W15 dune-ridge term (metres of height, before the free gate). */
export function duneRidgeAt(along, front) {
  const a = Number(along) || 0;
  const f = Number(front) || 0;
  const at = SAND_W15.ridgeFront
    + SAND_W15.ridgeWander * (sFbm(a * 0.012, 8.1, 2) - 0.5);
  const h = SAND_W15.ridgeH0
    + (SAND_W15.ridgeH1 - SAND_W15.ridgeH0) * sNoise(a * 0.018, 3.4);
  return Math.exp(-(((f - at) / SAND_W15.ridgeHalfW) ** 2)) * h
    * (1 - ss(-9.0, -2.5, f));
}

/**
 * W14-B: the CPU section (`beachSection`, `beachSectionY`) computes exactly
 * what the vertex program draws, cusp amplitude and submerged face included.
 * `outer-ocean.js` `visibleBeachY` reads this flag through a namespace import
 * and stops adding its own cusp correction when it is true.
 */
export const SAND_TWIN = Object.freeze({ live: true });

const sandModule = {
  buildBeachGeometry, makeSandMaterial, SAND_Y, SAND_HUES, SAND_W4, SAND_W10, SAND_W15, SAND_PM1,
  cornerMaskAt, wrapFrontAt, sandCornerProbe,
  wrapMaxVertexSpacing, shelfSeawardMaxY, duneRidgeAt,
  beachSection, beachSectionY, beachSlopeAt,
  rippleVisibilityAt, printVisibilityAt, sandPlatePatternAt, microValueCap, microValueBudget,
};
export { cornerMaskAt, wrapFrontAt };
// Wave 75: the section's pieces, for coast-spine.js's `coastProfile` (no behaviour).
export { SHELF_FACE, BED_FLOOR, PROFILE_U, faceFallAt, faceLenAt, sectionLocalY };
export default sandModule;
