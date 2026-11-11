import { mountWaterPatches } from './water-geometry-patches.js';
// District Deck V5.3 Lane W3 / Painted water — paint is the colour, the
// coast is the map. Shore-strip V = SDF so crest bands fan with the
// land contour; polar wrap is welded; port basin sits below the apron.
// W2: base-paint U is one continuous along/tileSpan (no cell jitter);
// deep calms with distance; along U is wrap-safe at ±π.
// W3: foam-plate UV NaN/Inf + ly clamp so the pier collar cannot feed
// RepeatWrapping a degenerate sample (r18b-swash checkerboard).
// Foam lace stays R16b. Presentation only. Deterministic. No per-frame
// allocation beyond uTime / uMotion / uFoamPhase.
// GLSL: never name a float/vec `sample`, `half`, `filter`, `buffer`,
// `input`, or `output` — those fail to compile silently in WebGL 1.

import * as THREE from 'three';
import { applyWorldRestyle } from './style/restyle.js';
import { OceanBuoyancy } from './water/buoyancy.js';
import { HullSitRegistry, HULL_SIT_GLSL, W20_HULL_GAIN, W22_HULL_LIMIT, nearestHullContacts } from './water/hull-sit.js';
import { loadImagenWater } from './water/imagen.js';
import { SHORE, WATERNESS_CUT, edgeAxes, boardEdgeOrigin } from './shore.js';
import {
  COAST_SDF,
  COAST_W15,
  EDGE_SEAM,
  coastFieldAt,
  coastRimAt,
  coastSdf,
  oceanDepthAt,
  planEdgeMassing,
  shelfFrontAt,
  shelfTurningCensus,
  surroundHeightAt,
  waternessAt,
} from './edge-massing.js';
import {
  SHORE_COMMON_GLSL,
  WATER_VARYINGS_GLSL,
  WATER_Y,
  WATER_FLOOR_Y,
  shoreCommonUniforms,
} from './water/contract.js';
import { surfaceUniforms } from './water/surface.js';
import { aquaFragment, bindAquaEnvironment } from './water/aqua.js';
import { WATER_LAW } from './water/law.js';
import { appendWetEdgeSpine, WET_EDGE_SPINE } from './water/wet-edge-spine.js'; // wave 78 (2b-2): the wet-edge decal on the spine, switch on only
import { coastSpineWaterWeight, getCoastSpine } from './coast-spine.js';
import { swellEnvelopeAt, seaEnvelopeGlsl } from './water/sea.js';
import { SURF, bakeSurfLut, surfLutGlsl, surfLutAt, surfTrainTermsAt, surfTrainsGlsl } from './water/surf.js';
import { bakeCoastField, sampleCoastField } from './water/coast-field.js';
import { beachSection } from './water/sand.js';
import { FOAM_SPINE_PRELUDE_GLSL } from './water/swash-spine.js'; // wave 78 (2b-3)
import { activeCoastSpine, sampleCoastW, sampleCoastD, beachExtentWeight, BEACH_LAND_GUARD, COAST_SPINE_GLSL, COAST_WATER_FRONT_GLSL, SPINE_WATER, coastSpineUniforms, COAST_SPINE } from './coast-spine.js';
import * as sandMod from './water/sand.js';
import { foamUniforms, SWASH, RUN_UP, swashReachAt, wrapFrontAt, cornerMaskAt, cornerWrapLineAt, cornerLaceBandAt, wrapLaceAlongAt, cornerLipFadeAt } from './water/foam.js';

export { SWASH, swashReachAt, wrapFrontAt, cornerMaskAt, cornerWrapLineAt, cornerLaceBandAt, wrapLaceAlongAt, cornerLipFadeAt };
import {
  INTERACT_GLSL,
  createInteractUniforms,
} from './water/interact.js';
import { WORLD_CURVE_GLSL, shareWorldCurveUniforms } from './world-curve.js';
import { isLodEnabled, waterInFrustumLowerHalf } from './lod.js';

/**
 * One-ocean register. Triangle counts are high-quality tessellation;
 * uniforms listed are the ones written every frame.
 */
export const OCEAN = Object.freeze({
  foamPeriod: 7.5,
  freezePhase: 0.38,
  freezeTime: 2.85,
  maxDepth: 9.0,
  waternessCut: WATERNESS_CUT,
  depthTexSize: 1024,
  foamTexSize: 256,
  /**
   * Graded polar sheet. High-quality nearshore: ~0.72 m radial through the
   * surf, denser azimuths on water edges. Offshore coarsens. Exact counts
   * come from `buildOceanGeometry` (az is adaptive).
   */
  azHigh: 320,
  radHigh: 160,
  azLow: 96,
  radLow: 36,
  foamAz: 192,
  foamRad: 12,
  rampKeep: 1.0,
  fogResist: 0.70,
  /** Per-frame uniform writes: uTime, uMotion, uFoamPhase. */
  frameUniforms: 3,
  /**
   * Fringe surf plate hidden once this sheet owns the beach foam.
   * Held-file touch: visibility only, no geometry/material edit.
   */
  hiddenSurfMesh: 'fringe:apostles:tide-line',
  hiddenPortWater: 'fringe:port-harbour:surface',
  /**
   * Water-only fringe sheets that would paint over / through the one-ocean.
   * Landmarks (boats, stacks, reefs, gulls) are not in this list.
   */
  hiddenOpenBayDrape: 'fringe:apostles-open-bay:drape',
  hiddenFarSea: 'fringe:far-sea-beyond',
  hiddenSwellGlitter: 'fringe:apostles-open-bay:swell-glitter',
  hiddenSwellCrestPrefix: 'fringe:apostles-open-bay:swell-crest:',
  /**
   * The legacy near terrain annulus predates the edge-massing crust, which
   * now owns all surround terrain. Its green inner band poked above the
   * beach dune as the hard "green edge" horizon stripe the R8 water critic
   * flagged (bisected live: hiding this exact mesh removes the stripe;
   * N/S/E/W orbits show the crust covering its ground with no new holes —
   * the NW grey slabs are the held Tullamarine seat, present either way).
   * Held-file touch: visibility only, no geometry/material edit.
   */
  hiddenNearAnnulus: 'fringe:annulus-near',
  /**
   * R11 micro-normal camera fade. Strong at gameplay close (≤60 m); mip-fades
   * by ~250 m so the wide bay does not shimmer. Replaces the R10 shore-distance
   * gate that zeroed ripples past 72 m of shoreline.
   */
  microCamNear: 60,
  microCamFar: 250,
  /**
   * R13: smooth crest additive DROPPED (was 0.12). Crest read is facet
   * shading + a near-binary line term. Kept at 0 so the walked pin is
   * explicit: "does this read as drawn-on-purpose in a still frame?"
   */
  crestAdd: 0,
  /** Specular glint gain. R11 1.25 was still a smear; R13 restrains it. */
  glintGain: 0.55,
});

/**
 * ── P16-W5 ITEM 2: THE WATER REFLECTS SOMETHING. ──
 *
 * The sheet had `uEnvMap` on its uniform block and `uHasEnv` nailed to false,
 * with the note "sampling the env equirect was the rectangular-patch source".
 * That note is right about the SYMPTOM and wrong about the cause. The equirect
 * is 256x128 float, LinearFilter, no mipmaps, and `buildEnvironmentEquirect`
 * writes a sun disc at 22-68x the sky value into it. One bilinear tap of a
 * 68x spike on a 256-wide lattice IS a bright rectangle; the sky underneath it
 * is a smooth gradient that reflects perfectly well. So the disc is clamped out
 * of the tap and the sun is put back analytically on the glint and track terms,
 * and the tap is averaged over five rays to take the lattice out of the rest.
 *
 * `reflMax` is a ceiling, not a target: this is a painted-water register and a
 * true mirror would throw the plate away. At the port poses the Fresnel term
 * runs 0.06-0.30 and only the grazing far field reaches the ceiling.
 */
export const REFLECT = Object.freeze({
  /** Grazing reflectance ceiling. Schlick would reach 1.0; the plate would not survive it. */
  reflMax: 0.34,
  /** Master gain on the reflection mix — 1.0 uses the Fresnel term as computed. */
  gain: 1.0,
  /** Luminance ceiling on an env tap. Sky ~0.6-1.4; the disc is 22-68. */
  clamp: 2.2,
  /** Angular spread of the four side taps, radians. */
  tapSpread: 0.055,
  /** Broad sun track exponent + gain. The 220 glint stays as the sparkle. */
  trackExp: 26.0,
  trackGain: 0.16,
  /** Reflection is occluded within this many metres of a quay wall or shore. */
  shoreOccM: 9.0,
  shoreOccAmt: 0.85,
  /** Waterline darkening under a blocked reflection. */
  darkAmt: 0.30,
  /** Steps and stride (m) of the mass march along the reflected ray. */
  marchN: 4,
  marchStep: 3.2,
  /** Deepest tone a blocked reflection falls to (hull shadow on water). */
  blockedTint: '#0c1a24',
  /** Micro-chop kept inside the sheltered harbour (1 = open-sea chop). */
  harbourChop: 0.45,
  /**
   * P16-W5 item 3. Fraction of the deep plate's bright excursion over its own
   * mip mean that is cut in OPEN water. The plates carry white lace painted
   * into them; near a shore or a hull that lace reads as foam and earns its
   * place, and out in the middle of the harbour it is the "stretched painted
   * texture with repeating cloud blobs" the audit measured. Only the bright
   * side is touched, so hue, drift and the dark half of the plate survive.
   */
  laceCut: 0.72,
  /** Metres of shore distance over which the lace is allowed back. */
  laceShoreFrom: 6.0,
  laceShoreTo: 26.0,
  /**
   * Metres of DEPTH over which the lace is allowed back. Shore distance alone
   * was not enough: the corner beach reads as open water in the coast SDF, so
   * a distance-only gate cut the pale shallow lace off the sand as well as the
   * cloud blobs off the harbour. Under this depth the water is shallow enough
   * for sand and surf to show through, and the lace is what shows them.
   */
  laceDepthFrom: 0.6,
  laceDepthTo: 2.6,

  // ── P16-W6 ─────────────────────────────────────────────────────────────
  /**
   * Object3D layer the planar reflection camera renders. Nothing else in the
   * board uses a non-zero layer, so enabling it on a mesh is invisible to the
   * main camera (which stays on layer 0) and to every pick raycast.
   */
  layer: 3,
  /** Planar reflection target. 16:9, capped at 384×216 (P19 X1B). */
  planarW: 384,
  planarH: 216,
  /** Metres of world AABB a port form needs before it earns a reflection draw. */
  planarMinSpan: 4.2,
  planarMinHeight: 2.2,
  /** Above this height a form is kept even when it stands well inland. */
  planarTallM: 13.0,
  /** Metres beyond the port basin the reflection layer still collects. */
  planarPadM: 60,
  /** How far the ripple normal pushes the reflection UV, in target texels. */
  planarDistortPx: 7.0,
  /** Blur radius of the reflection tap, in target texels (4-tap tent). */
  planarBlurPx: 0.85,
  /** Master gain on the planar mix. */
  planarAmt: 0.86,
  /**
   * The planar term's own Fresnel curve. Real water at the play camera's 24-38
   * degrees returns 0.06-0.10, which is why the audit found no reflection in
   * seven poses; these are the stylised replacements and both sit under W5's
   * `reflMax` ceiling so the painted plate still owns the surface.
   */
  planarFloor: 0.36,
  planarCeil: 0.44,
  /** Oblique-projection bias. Pulls the clip a hair off the exact surface. */
  clipBias: 0.004,

  // Item 2. The rippled normal, split harbour / open sea.
  /** Mix of the two-octave ripple normal into the surface normal. */
  rippleMixHarbour: 0.34,
  rippleMixSea: 0.52,
  /** Metres of the two scrolling octaves. */
  rippleBigM: 6.2,
  rippleSmallM: 1.7,
  /** Scroll speed, m/s, of the two octaves. */
  rippleDriftBig: 0.34,
  rippleDriftSmall: 0.62,
  /** Slope gain per octave (harbour amplitude is the smaller of the two). */
  rippleSlopeBig: 2.10,
  rippleSlopeSmall: 1.35,
  rippleHarbourAmp: 0.55,

  // Item 2. Depth falloff: scene depth (the bed) against the water surface.
  /** Metres of water the shallow tint survives; e-folding of the deep tone. */
  depthFallM: 3.4,
  /** How much of the body the depth ramp is allowed to move. */
  depthFallAmt: 0.42,
  /** Shallow tint (sand showing through) and the deep tone it falls to. */
  shallowTint: '#7fb9a8',
  deepTint: '#123449',

  // Item 2. Depth-driven foam at the shoreline, replacing the speckle band.
  /** Water depth at or under which the surface carries foam, metres. */
  foamDepthM: 0.6,
  /** Softness of that edge, metres. */
  foamDepthSoft: 0.30,
  /** Peak coverage of the depth foam. */
  foamDepthAmt: 0.46,
  /** Under this depth the band fades again — this is a contour, not a fill. */
  foamDepthMin: 0.22,
  /** How much of the band the break-up noise is allowed to take away. */
  foamBreakUp: 0.55,
  /** Break-up of the foam edge by the ripple, in metres of depth. */
  foamRippleM: 0.22,
});

/**
 * P16-W10 outer-water specular contract.
 *
 * W8/W9 carried three unrelated highlights: a 220-power point masked by
 * two-metre hash cells, a 48-power fill, and a 26-power "track". In the
 * military plates those three lobes did not add up to sun on water; they made
 * one detached bright blob surrounded by a featureless plastic gradient.
 * This is one dielectric GGX response instead. The wave normal moves the lobe,
 * Schlick keeps the water F0 at 0.02, and the only extra sparkle is a
 * derivative-sized, world-anchored fleck inside the 25-degree sun axis.
 */
export const OCEAN_SPECULAR = Object.freeze({
  f0: 0.02,
  /** W11: 0.20 on the sun axis so the lobe is still a highlight, not a disc. */
  roughAxis: 0.20,
  /** W11: 0.30 floor — W10's 0.08–0.25 parked the sheet off every play camera. */
  roughPlane: 0.30,
  /** Dedicated half-vector sheet, broad enough to sit on-screen at 45–55°. */
  sheetRough: 0.35,
  sparkleAxisDeg: 25,
  sheetGain: 0.92,
  sheetCap: 0.16,
  /** Extra gain on the 0.35 sheet only; the original GGX lobe keeps sheetGain. */
  sheetTermGain: 1.35,
  skyMix: 0.46,
  sparkleGain: 0.020,
  sparkleKeep: 0.84,
  sparkleCellPx: 1.65,
  /** Stylised env Fresnel floor at the play camera's 45–55° (cos 50° ≈ 0.643). */
  envFresnelFloor: 0.12,
  envFresnelGrazing: 1.0,
  envViewCos: 0.643,
});

/**
 * P16-W11 albedo / micro-normal contract. The outer sea was a 10–30 m
 * camouflage mottle (~40 luma) with no sheet for the glint to break on.
 * Fine 2–6 m patches at ≤12 luma, plus a 0.5–1 m ripple, replace it.
 */
export const OCEAN_W11 = Object.freeze({
  mottleM: 3.19,
  mottleCrossM: 2.37,
  mottleThirdM: 5.83,
  /** Peak |albedo − base| as a 0–1 fraction. 12 luma / 255 ≈ 0.047. */
  mottleContrast: 0.047,
  /** Residual deep-plate excursion kept after crushing the camouflage. */
  plateCrush: 0.14,
  rippleSheetM: 0.73,
  rippleSheetSlope: 0.48,
  rippleSheetFadeFromM: 90,
  rippleSheetFadeToM: 220,
  rippleSheetRotate: 1.17,
});

/**
 * P16-W12 — make the sheet, planar read and meniscus VISIBLE at the graded
 * poses. W11 mixed sky into a body that was already sky-cyan (env mix of two
 * similar colours) and the planar target's half-float mean of ~0.03 never
 * reached displayable crane/hull luma. This layer keeps every W9/W10/W11
 * registry and pin, then adds a luma-asymmetric sheet, a decoded planar tap,
 * a 0.6 m depth/mass meniscus on every solid, and wall foam. Open sea stays
 * inside W8's 0.35 mix budget.
 */
export const OCEAN_W12 = Object.freeze({
  /** Near-camera body multiply inside the sheltered basin. */
  basinBodyKeep: 0.70,
  /** Grazing sheet mix (N·V → 0). */
  sheetGrazing: 0.78,
  /** Head-on sheet floor. Polar 24° (N·V ≈ 0.41) sits well above this. */
  sheetFloor: 0.22,
  /** Extra luma on the sheet colour versus the painted plate. */
  sheetLift: 1.45,
  sheetTint: Object.freeze([0.48, 0.68, 0.90]),
  /** Half-float planar decode: 0.032^0.50 ≈ 0.179 before gain. */
  planarGamma: 0.50,
  planarGain: 3.20,
  planarChroma: 1.65,
  /** 0.6 m dark meniscus from the existing reflected-depth ruler. */
  wetFromM: 0.02,
  wetToM: 0.60,
  wetDarken: 0.62,
  foamFromM: 0.10,
  foamPeakM: 0.22,
  foamToM: 0.52,
  foamAmt: 0.70,
  /** Mass-field fallback when the depth sample misses, metres. */
  massWetM: 0.55,
  massFoamM: 1.15,
  massFoamAmt: 0.58,
});

/**
 * P16-W13 — undo W12's milk. The W11 0.12 env floor and W12 sheetFloor 0.22
 * lifted every water pixel (a12r11 quay-hero p50 180, tail 9, sat 0.28).
 * This layer keeps every W9–W12 pin, then: (1) effective env floor 0.04 so
 * the sky multiplies a darker base, (2) planar read capped at 0.45 with +2 px
 * blur and a ≤30 luma lift, (3) a localised half-vector sheet (roughness
 * 0.30 / 0.35 unchanged) plus 2–5 px foam lines as the bright tail.
 * HARBOUR_CONTACT.planarReadMax and OCEAN_SPECULAR.envFresnelFloor stay
 * pinned; the shader mixes this layer on with uW13WaterAmt.
 */
export const OCEAN_W13 = Object.freeze({
  envFresnelFloor: 0.04,
  planarReadMax: 0.45,
  planarBlurExtraPx: 2.0,
  /** 30 luma / 255. Planar may not lift the body above this. */
  planarLumaLiftMax: 30 / 255,
  /** Floor on the luma-conditional scale (harbour / open sea). */
  basinBodyKeep: 0.28,
  seaBodyKeep: 0.22,
  /** Linear luma the milk is compressed toward (sRGB-out ~125 / ~95). */
  basinTarget: 0.145,
  seaTarget: 0.105,
  /** Linear deep teal, hue ~205. satPush stays modest so hue does not go green. */
  deepTint: Object.freeze([0.034, 0.122, 0.208]),
  deepMix: 0.88,
  satPush: 1.22,
  /** Extra sheet gain is gated to the half-vector; the W11 0.35 lobe stays. */
  sheetLobeFrom: 0.62,
  sheetLobeTo: 0.92,
  sheetExtra: 2.80,
  sheetTightPow: 5.0,
  foamLineAmt: 0.94,
  foamRgb: Object.freeze([0.96, 0.98, 1.00]),
});

/**
 * P16-W14 — continuous foam. W13's 2–5 px lines were fwidth of a VERTEX
 * hull-foam varying, so each polar quad that touched a hull painted as a
 * hard white rectangle. Axis-aligned ±X/±Z mass taps dilated every wall
 * into a square. This layer keeps every W9–W13 pin, then: (1) a fragment
 * crest from the hull-contact gap, the W9 reflected-depth gap, and a
 * circular mass ring, broken by scrolling noise; (2) opaque harbour alpha
 * so depth-bake holes cannot punch sky tiles; (3) a 0.4–0.8 m bow/stern
 * normal ring (≤6 luma); (4) a pale 2–4 px shelf plus a 0.3–0.8 m noise
 * break on the wet/shore join. No new pass or texture.
 */
export const OCEAN_W14 = Object.freeze({
  crestFromM: 0.04,
  crestPeakM: 0.11,
  crestToM: 0.28,
  crestAmt: 0.90,
  noiseScale: 1.85,
  noiseScroll: 0.31,
  noiseKeep: 0.38,
  shelfFromM: 0.02,
  shelfToM: 0.22,
  shelfAmt: 0.18,
  wetJitterMinM: 0.30,
  wetJitterMaxM: 0.80,
  ringFromM: 0.40,
  ringToM: 0.80,
  ringSlope: 0.22,
  ringLuma: 6 / 255,
  massRingM: 0.16,
  foamRgb: Object.freeze([0.96, 0.98, 1.00]),
});

/**
 * P19 X3 — cap the sun sheet when the camera looks into the sun (toward the
 * city with the sun in front). W11 sheetRough 0.35 and sheetCap 0.16 stay
 * pinned; this layer widens the live GGX and clamps added luma. W13 bands
 * are unchanged (the cap only binds on the bright tail).
 */
export const OCEAN_X3 = Object.freeze({
  lumaCeil: 215 / 255,
  sheetAddMax: 60 / 255,
  sheetRoughWide: 0.62,
  towardFrom: 0.12,
  towardTo: 0.55,
});

/**
 * P19-W15 — pristine shelf over a curved coastline. W13 luma/sat/hue pins
 * stay; this layer (1) keys colour on the circular shelf front so the pale
 * band is not a 90° polygon, (2) paints turquoise-over-sand with caustics
 * ≤ 8 luma and 0.5–1 m swell lines ≤ 10 luma, (3) crushes deep mottle to
 * ≤ 6 luma at altitude. Mix with uW15WaterAmt.
 */
export const OCEAN_W15 = Object.freeze({
  // P21 (2026-09-07): late read — edge-massing.js may still be initialising when this module evaluates (Node import cycle).
  get fadeFromM() { return COAST_W15.fadeFromM; },
  get fadeToM() { return COAST_W15.fadeToM; },
  causticLuma: 8 / 255,
  causticM: 1.85,
  swellLuma: 10 / 255,
  swellFromM: 0.52,
  swellToM: 0.96,
  mottleAltFromM: 110,
  mottleAltToM: 240,
  mottleAltKeep: 6 / 12,
  sandThrough: 0.42,
  shallowMix: 0.58,
  barAmt: 0.34,
});

/** W16: retain the shelf and close crest; resolve distant water in metres. */
export const OCEAN_W16 = Object.freeze({
  collarFadeFromM: 170,
  collarFadeToM: 320,
  wetLineGain: 0.03,
  deepFromM: 60,
  deepToM: 150,
  greenBlue: Object.freeze([0.018, 0.125, 0.18]),
  ultramarine: Object.freeze([0.006, 0.020, 0.095]),
  swellLuma: 0.0015,
});

/**
 * P16-W9 harbour-water close-read terms. The contact widths are metres in the
 * mirrored camera's reconstructed view depth: the water point and the first
 * solid at that pixel share a ray, so their depth difference is a stable
 * world-metre ruler at every camera distance. `depthMaxM` is also the hard
 * sampling gate promised by the lane brief.
 */
export const HARBOUR_CONTACT = Object.freeze({
  depthMaxM: 0.40,
  wetFromM: 0.02,
  wetToM: 0.28,
  foamFromM: 0.11,
  foamPeakM: 0.17,
  foamToM: 0.25,
  darken: 0.34,
  ridgeGloss: 0.18,
  foamAmt: 0.42,
  planarReadGain: 2.40,
  planarReadMax: 0.75,
  planarColourGain: 1.40,
  /** Fine chop is useful nearby and aliases into a tiled wash at distance. */
  tileFadeFromM: 42,
  tileFadeToM: 125,
  crossM: 1.13,
  crossSlope: 0.72,
  crossRotate: 0.83,
});

/**
 * P16-W7 outer-sea register. W6's 6.2 / 1.7 m detail ripples intentionally
 * mip away at the wide board cameras; these two analytic slopes remain broad
 * enough to read there, while the one master gain keeps the whole W7 term
 * separable for the frame-cost receipt.
 */
export const OUTER_SEA = Object.freeze({
  swellLongM: 46.0,
  swellCrossM: 24.0,
  swellDriftLong: 0.18,
  swellDriftCross: 0.27,
  swellSlopeLong: 0.21,
  swellSlopeCross: 0.13,
  normalMixNear: 0.18,
  normalMixFar: 0.34,
  shelterNormalKeep: 0.14,
  deepFromM: 1.8,
  deepByM: 6.2,
  farFromM: 140,
  farByM: 420,
  depthMix: 0.74,
  fresnelFloor: 0.08,
  fresnelCeil: 0.34,
  horizonMix: 0.24,
  /** Total effective sky share after W5 Fresnel + W7 Fresnel + horizon. */
  reflectionBudget: 0.35,
  /** The horizon target is 78% reflected sky and 22% retained deep colour. */
  horizonSkyShare: 0.78,
  /** Soft shoulder for unusually bright cloud / sun-lattice environment taps. */
  skyLumaKnee: 0.45,
  skyLumaCeil: 0.62,
  /** Fresnel kept under a tap already on the bright-sky shoulder. */
  brightSkyFresnelKeep: 0.10,
  /** Linear sun-track gain ceiling beneath a bright open-sea sky tap. */
  trackCap: 0.012,
  trackBoost: 1.45,
  foamGain: 1.32,
});

/** Wet material is allowed no higher than 0.4 m above still water. */
export const WET_EDGE = Object.freeze({
  /** Vertical 0.4 m wall quads along the sector coast. Off: a wall of water is banned. */
  walls: false,
  /** Wet-sand colour of the main-beach contact film (ground.sand.wet family, H 42). */
  beachSand: '#8a7852',
  riseM: 0.4,
  landWidthM: 3.2,
  waterDepthM: 0.6,
  waterFadeM: 0.9,
  shelfAmt: 0.14,
  waterDarken: 0.72,
  reflectionFloor: 0.18,
  // Wet rock and quay film at the waterline: a dark neutral from the rock tokens
  // (rockDark x 0.8), not the dark teal that read as a panel on the water.
  color: '#4a505a',
  roughness: 0.16,
  metalness: 0.06,
  opacity: 0.62,
});

/**
 * taste W71: WET_EDGE_SHELF. On the east beach the wet-edge decal is seated on the city shelf only inside `beachBlend` (z 68 to 192);
 * elsewhere it follows the board-edge SDF contour, 5 to 7 m seaward of the shelf's own waterline at the north-east corner, and lies over
 * open water as a pale, faceted band (wave seventy). 1 (the default) reads the knobs below and drops or fades decal quads inside the
 * shelf's footprint (x 275.3 to 354.4, z -70 to 342: the mesh `water.js` `_buildSandShelf` builds) by the shelf's own front, read from
 * its CPU twin (`beachSection`). Outside the footprint (the remote coast, the port face) nothing changes.
 * `?wetEdgeShelfMode=clip` drops quads where the shelf's front is seaward of `?wetEdgeShelfLo=` metres, fading over `?wetEdgeShelfFade=`
 * metres landward of it; `shelf` drops every quad in the footprint (the fade is then inside its edge); `unseated` (the default,
 * wave seventy-one second pass) drops only the quads in the footprint that `beachBlend` does not seat on the shelf, so the hovering
 * band goes and R103's seated strip (z 68 to 192) stays, with its tapered ends: a quad goes when `beachBlend` is under `?wetEdgeShelfSeat=` (0.01,
 * wave seventy-one third pass: 0.5 also took 50 quads of the strip's own taper) at both ends of its segment (no fade in this mode). An explicit `clip` with the default lo (1000 m) and fade 0 drops nothing. A fade above
 * 0 in `clip` or `shelf` adds a per-vertex alpha (`aWetShelf`) and a cache-key suffix. `?wetEdgeShelf=0` (node `DD_WET_EDGE_SHELF=0`)
 * ignores every knob and gives the geometry, shader text and cache key of before this switch.
 * Node: `DD_WET_EDGE_SHELF_MODE`, `DD_WET_EDGE_SHELF_LO`, `DD_WET_EDGE_SHELF_FADE`, `DD_WET_EDGE_SHELF_SEAT`.
 */
const wetShelfKnob = (envName, param) => {
  let raw;
  if (typeof process !== 'undefined' && process?.env?.[envName] !== undefined) raw = process.env[envName];
  else if (typeof location !== 'undefined' && location?.search) raw = new URLSearchParams(location.search).get(param);
  return raw === undefined || raw === null || raw === '' ? undefined : raw;
};
const wetShelfNum = (envName, param, dflt) => {
  const raw = wetShelfKnob(envName, param);
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : dflt;
};
export const WET_EDGE_SHELF = Object.freeze((() => {
  const switchRaw = wetShelfKnob('DD_WET_EDGE_SHELF', 'wetEdgeShelf');
  const on = switchRaw === undefined ? 1 : (Number(switchRaw) > 0 ? 1 : 0);
  const modeRaw = wetShelfKnob('DD_WET_EDGE_SHELF_MODE', 'wetEdgeShelfMode');
  const mode = modeRaw === 'shelf' || modeRaw === 'clip' ? modeRaw : 'unseated';
  const lo = wetShelfNum('DD_WET_EDGE_SHELF_LO', 'wetEdgeShelfLo', 1000);
  const fade = mode === 'unseated' ? 0 : Math.max(0, wetShelfNum('DD_WET_EDGE_SHELF_FADE', 'wetEdgeShelfFade', 0));
  const seat = wetShelfNum('DD_WET_EDGE_SHELF_SEAT', 'wetEdgeShelfSeat', 0.01);
  const active = on && (mode !== 'clip' || lo < 1000) ? 1 : 0;
  return { on, mode, lo, fade, seat, active, attr: active && fade > 0 ? 1 : 0 };
})());

export const OCEAN_RAMP = Object.freeze({
  wetSand: SHORE.wetSand,
  olive: SHORE.oliveShallow,
  teal: SHORE.shallowWater,
  deep: SHORE.navyDeep,
  seabedOlive: SHORE.seabedOlive,
  seabedDeep: SHORE.seabedDeep,
});

/**
 * Visible-bay colour bands. Labels stay SDF-metres for the column pin.
 * R13 live colour is THREE sequential zones (sand-glass / turquoise / deep)
 * with short blend windows — not overlapping hue plates. oliveMix / tealMix
 * / navyMix are retained as documentation of the old stacked windows.
 */
export const OCEAN_BANDS = Object.freeze({
  sandyTo: 10,
  oliveTo: 25,
  tealTo: 70,
  navyFrom: 90,
  oliveMix: Object.freeze([0.18, 1.35]),
  tealMix: Object.freeze([0.85, 3.40]),
  navyMix: Object.freeze([2.60, 6.80]),
  ampFade: Object.freeze([0.8, 11.0]),
  /** Breaker arc seaward reach (metres of front). Was a 7–20 m wash. */
  breakBand: Object.freeze([4, 10]),
  depthLimit: 5.4,
  /** Offshore-only bathymetry pockets start here (R7 split, R9 pockets). */
  pocketFrom: 40,
});

/**
 * R13 crest line. Physical metres + near-binary window. No gaussian.
 * Painted-water: facet mix ≤ 0.15 everywhere (paint carries the read;
 * R17 plank facets die). Function stays for the no-texture fallback.
 */
export const CREST_LINE = Object.freeze({
  cycleTop: 0.05,
  window: 0.12,
  widthMin: 0.6,
  widthMax: 1.2,
  dash: 14,
  gap: 4,
  dashMin: 8,
  dashMax: 20,
  gapMin: 2,
  gapMax: 6,
  facetNear: 0.12,
  facetMid: 0.12,
  facetFar: 0.10,
});

/**
 * R13 breaker: 2–3 discrete arcs per 100 m of beach, 4–10 m deep,
 * AA ≤ 0.5 m. Retreat is 1–2 thin lace lines, not a wash.
 */
export const BREAKER_ARCS = Object.freeze({
  per100: 2.5,
  periodM: 40,
  gapMin: 8,
  gapMax: 16,
  depthMin: 4,
  depthMax: 8,
  aaM: 0.5,
  laceW: 0.85,
  laceCount: 2,
  rows: 2,
});

/**
 * R13b: one foam authority at the waterline. The beach-foam layer paints
 * arcs + lace + wharf lap. The ocean sheet keeps only seaward curl past
 * the layer band, plus offshore whitecaps. The shelf swash foam is retired.
 */
export const FOAM_STACK = Object.freeze({
  samplesM: Object.freeze([-6, -2, 0, 2, 6]),
  oceanLandward: 0,
  shelfRetired: true,
  wrapMatch: 0.15,
  whiteMaxM: 8,
  oceanCurlFrom: 8,
});

/**
 * R13 colour zones (still-water metres). Blend window ≤ 15 % of zone width.
 * Transparency lives only inside sand-glass (≤ transTo).
 */
export const ZONE_BLEND = Object.freeze({
  sandGlassTo: 2.0,
  turquoiseTo: 5.2,
  blendFrac: 0.15,
  transTo: 2.0,
  valueVar: 0.06,
  transK: 0.40,
});

/** R13 specular: no glint cluster wider than maxM metres. */
export const SPEC_CLUSTER = Object.freeze({
  maxM: 2.0,
  sparkCut: 0.78,
});

/**
 * Foam mask edges. Tight smoothstep (width ≤ 0.12) so breakers read as
 * scalloped bands, not a gaussian airbrush. R7 used 0.32–0.72 (width 0.40).
 */
export const FOAM_MASK = Object.freeze({
  edge0: 0.47,
  edge1: 0.55,
  clumpCut: 0.38,
  contactW: 2.60,
  /** R11 fleck thresholds (walked). R15 whitecaps crop foam-crest-c; ≤4 %. */
  whiteCut: 0.65,
  whiteCover: 0.04,
  whiteCut2: 0.78,
  whiteSizeMin: 1.5,
  whiteSizeMax: 4.0,
});

/**
 * R15/R16b authored foam plates. White-on-black PNGs; luminance is alpha.
 * TextureLoader at OuterOcean boot; baked blob map is the crash-free fallback.
 *
 * `windows` are measured UV-frame seats (centre, along-band angle). Sampling
 * rotates into that frame at WORLD SCALE — one plate spans spanU × spanV
 * metres, aspect preserved. halfWidth is a measured plate fact (crest strip
 * / lace waterline seat), never a V-window that stretches a razor band.
 * invertV: 1 = seaward walks toward the crest's ragged face.
 */
export const FOAM_ART = Object.freeze({
  files: Object.freeze({
    laceA: 'foam-lace-a.png',
    laceB: 'foam-lace-b.png',
    crest: 'foam-crest-c.png',
  }),
  dir: '../../assets/water/foam/',
  windows: Object.freeze({
    crest: Object.freeze({
      cx: 0.524, cy: 0.430, angle: 0.402, halfWidth: 0.055, invertV: 1,
    }),
    laceA: Object.freeze({
      cx: 0.481, cy: 0.400, angle: 0.089, halfWidth: 0.360, invertV: 0,
    }),
    laceB: Object.freeze({
      cx: 0.545, cy: 0.494, angle: 0.602, halfWidth: 0.180, invertV: 0,
    }),
  }),
  readNear: 70,
  readFar: 210,
  mipBiasFar: 2.4,
  whiteHit: 0.12,
  segMin: 12,
  segMax: 30,
  uniqueM: 200,
  runUpMin: RUN_UP.min,
  runUpMax: RUN_UP.max,
  backwashAlphaMin: 0.30,
  backwashAlphaMax: 0.55,
  washLines: 3,
  troughMin: 0.06,
  troughMax: 0.10,
  /** Adjacent-cell overlap (fraction of width). Crossfade hides plate edges. */
  overlap: 0.32,
  /**
   * Breaker envelope around sdf=0. 60 % landward / 40 % seaward so the
   * white ribbon straddles the waterline, not a seaward-only slab.
   */
  crestLand: 3.6,
  crestSea: 2.4,
  /** Metres added to front so crest ly=0 (ribbon) sits at envelope centre. */
  crestAnchor: 0.6,
  crestGain: 0.60,
  /** Envelope (metres of sdf). Fitted so freeze-phase cover ≈ 0.3/0.6/0.5/0.2. */
  bandLandLo: -4.0,
  bandLandHi: 0.0,
  bandSeaLo: -0.8,
  bandSeaHi: 10.5,
  /** Soft edge of the lace envelope (waterline → run-up), metres. */
  envSoft: 1.5,
  /**
   * World scale of one plate. Jitter is one hash → both axes together.
   * 22×15 … 30×20 keeps the 1536×1024 aspect (~1.5).
   */
  spanUMin: 22,
  spanUMax: 30,
  spanVMin: 15,
  spanVMax: 20,
  spanU0: 26,
  spanV0: 17.5,
  /** Close-range luma tracks plate grey. Far path raises contrast only. */
  lumaFloorFrom: 150,
  lumaFloorTo: 230,
  lumaCloseExp: 0.85,
  lumaFarContrast: 2.0,
});

/**
 * Three directional Gerstner swells at diorama scale. dir is (along, seaward).
 *
 * R8 was geometrically invisible: λ 44/29/17.5 m, amp 1.42/0.62/0.24. At the
 * widebay pose (D=230 m, ~42° vFOV) a 1.4 m crest is ~0.8 % of frame height;
 * shading facet mix 0.34→0.10 hid the rest. R9 keeps displacement modest
 * (beach-safe) and makes BODIES with wavelength + facet + crest term:
 *   macro 72 m / 1.90 m / onshore +8°  — 4–5 crests across the bay
 *   mid   32 m / 0.78 m / −30° (38° offset) — crossing crests
 *   micro 14 m / 0.20 m / +22° plus fragment chop (9 m / 5 m, normal-only)
 * R13: FBM ripple normals stay in source (R11 pin) but are NOT mixed —
 * they were the oversized soft blobs. Crests are facet planes + a 0.6–1.2 m
 * dashed line. Q stays ≤ 0.55. Vertex N stays 3.
 */
// WATER LAW (TASTE-BIBLE section 6): the open-ocean swell is one octave near
// 24 m with 0.25 m of crest (0.6 x a 40 m ship), travelling at 1.2 m/s; the 3 m
// chop is the fragment slope in water/slope-field.js. Two crossing trains share
// the swell octave so the sheet is never one corduroy. `amp` is pre `uWaveScale`
// (0.45 on high), so the effective crest sum is 0.27 m. The old 40 / 28 / 14 m
// stack at 1.2 / 0.68 / 0.20 m travelled at 4 m/s and read as large soft ripples.
// ROUND TWO (gate ruling 1, TASTE-BIBLE section 6): three swell trains at 24, 19 and 31 m,
// headings -25, 0 and +20 degrees off the prevailing direction, 0.14 / 0.08 / 0.06 m effective
// amplitude, each at its deep-water speed omega = sqrt(g k). Their sum is multiplied by the
// drifting 90 m / 220 m envelope (`ddSeaEnvelope`, water/sea.js) so swell arrives in groups.
// Round one drew two near-equal trains and the 240 m camera read them as corrugated iron.
// `amp` is pre `uWaveScale` (0.45 on the high tier), so the effective amplitudes match the law.
export const BAY_WAVE_SCALE = 0.45;
/**
 * taste-r1 (W15-A1): the open-sea bend of the wave front (beyond 120 to 240 m of the shore). The old 8 m at 58 m and 3 m at 27 m
 * shifted the phase of a 24 m swell by up to a full cycle inside one 60 m feature, which tore the bands into cloud-like cells. The
 * bend is now a slow 2.6 m at 150 m and 0.9 m at 70 m: crests curve and drift apart without breaking into cells.
 */
export const W15_SEA_WARP = Object.freeze({ bigM: 2.6, bigScale: 150, smallM: 0.9, smallScale: 70 });
export const BAY_SWELL = Object.freeze(WATER_LAW.waves.ocean.swell.map((s) => {
  const heading = ((WATER_LAW.waves.prevailingDeg + s.headingDeg) * Math.PI) / 180;
  return Object.freeze({
    dir: Object.freeze([Math.sin(heading), Math.cos(heading)]),
    len: s.len,
    amp: s.amp / BAY_WAVE_SCALE,
    steep: 0.25,
    omega: Math.sqrt((9.81 * 2 * Math.PI) / s.len),
  });
}));

/** Desired along-shore metres per strip tile before integer-tile snap. */
const PAINT_SPAN_TARGET = 170;
const PAINT_SPAN_LO = 140;
const PAINT_SPAN_HI = 200;
/** Polar radius (m) whose circumference is the along-perimeter for snap. */
const PAINT_SPAN_REF_R = 180;

function snapPaintSpan(perimeter, target = PAINT_SPAN_TARGET, lo = PAINT_SPAN_LO, hi = PAINT_SPAN_HI) {
  const p = Math.max(1, Number(perimeter) || 0);
  let n = Math.max(1, Math.round(p / Math.max(target, 1)));
  let span = p / n;
  if (span < lo && n > 1) {
    const wider = p / (n - 1);
    if (wider <= hi + 1e-9) {
      n -= 1;
      span = wider;
    }
  } else if (span > hi) {
    n += 1;
    span = p / n;
  }
  return span;
}

/** Polar-sheet circumference at `radius` — the along-perimeter for tile snap. */
export function paintedAlongPerimeter(radius = PAINT_SPAN_REF_R) {
  return Math.PI * 2 * (Number(radius) || PAINT_SPAN_REF_R);
}

/** Tile span such that `perimeter / span` is an integer, kept in 140–200 m. */
export function paintedTileSpan(perimeter, target = PAINT_SPAN_TARGET, lo = PAINT_SPAN_LO, hi = PAINT_SPAN_HI) {
  return snapPaintSpan(perimeter ?? paintedAlongPerimeter(), target, lo, hi);
}

/**
 * Painted-water plates. Colour comes from the shore strip (V = SDF) then
 * a deep tile past the strip's reach. TextureLoader at OuterOcean boot;
 * the analytic ramp is the crash-free fallback (Node / missing files).
 */
export const PAINTED = Object.freeze({
  files: Object.freeze({
    stripA: 'painted-shore-strip.png',
    stripB: 'painted-shore-strip-b.png',
    deep: 'painted-deep-tile.png',
  }),
  dir: '../../_reviews/aaa-loop/ocean-refs/',
  /**
   * Along-shore metres per strip tile. W2: ONE continuous span — no
   * per-segment jitter/offset on the base paint. Snapped so 2π·spanRefR
   * is an integer number of tiles (boot can recompute from the same
   * along-perimeter).
   */
  spanUMin: PAINT_SPAN_LO,
  spanUMax: PAINT_SPAN_HI,
  spanRefR: PAINT_SPAN_REF_R,
  spanU0: snapPaintSpan(Math.PI * 2 * PAINT_SPAN_REF_R),
  /** SDF metres: V=0 at the waterline (strip bottom / sand glass). */
  stripReach: 68,
  /** Crossfade window (m) starting at stripReach into the deep tile. */
  fadeWin: 40,
  /** Far-field tile world span (m). Constant — not a noisy mix. */
  deepSpanMin: 110,
  deepSpanMax: 150,
  deepSpan0: 130,
  /** ~15° off-axis. */
  deepRot: 0.262,
  deepWarpScale: 0.008,
  deepWarpAmp: 8.0,
  /** Along-shore strip drift (m/s). */
  stripDrift: 0.30,
  deepDriftX: 0.11,
  deepDriftZ: -0.07,
  abOmega: 0.17,
  facetMix: 0.12,
  microMix: 0.12,
  troughScale: 0.5,
  /** Plate-edge overlap (fraction of U) so L–R tileability is C0. */
  edgeOverlap: 0.08,
  /** Mirror-fold window (m) around the polar ±π azimuth. */
  wrapFoldM: 8,
  /** Camera-distance calm: 0 at calmNear, calmAmt at calmFar. */
  calmNear: 180,
  calmFar: 400,
  calmAmt: 0.70,
  mipBiasFar: 2.4,
  /** Basin-scoped sheet drop (m). Feathered over portFeather metres. */
  portDrop: 0.32,
  portFeather: 8,
  swellDamp: 0.18,
  /**
   * Port–inland wrap (airport / east frontage). Same drop as the quay,
   * feathered in a band seaward of both edges. Does not change portFeather.
   */
  airportFeatherIn: 70,
  airportFeatherPort: 55,
  /**
   * Tullamarine apron top at group y=0 (`addApron` 0.44). Same family as
   * `apronTop` so the wrap pin can share the ≥0.2 m clearance.
   */
  airportDeck: 0.44,
  /**
   * Rendered port apron top. Matches fringe/port.js DECK_Y
   * (`sandY + 0.28 + 0.10`) without importing that held file.
   */
  apronTop: SHORE.sandY + 0.38,
  /**
   * ── SHELTERED HARBOUR (board-AAA lane 7) ──────────────────────────────────
   *
   * The port edge's authored waterline (`portFaceM()` in edge-massing) sits
   * 3.99 m seaward of the board rim, but the wharf that is actually RENDERED
   * runs from 1.5 m to 38.5 m seaward (fringe/port.js `QUAY_SEAWARD` 32 with a
   * `QUAY_BACK_Z` −30.5 / `COPE_Z` +6.5 slab). So the coast field classifies
   * the whole deck as open water, `classMask` is 1 across it, and the Gerstner
   * swell — unrestrained, because the only existing basin term is an 8 m bubble
   * centred on that 3.99 m face — lifts the sheet to +2.40 m over concrete
   * whose top is 0.452 m. Measured: 83.9 % of the deck footprint is classified
   * water, and over a 16 s clock the sheet stands above the deck across a mean
   * 29.5 % of it (peak 60 %, worst sample 1.95 m proud).
   *
   * The fix is not a clip. The port has a breakwater at 103–113 m seaward, so
   * the water inside it is a sheltered basin: swell dies at the armour and the
   * quay looks down on flat water. That is one continuous sea — same mesh, same
   * material, same still-water level — with an authored wave envelope, which is
   * what a harbour is. `harbourSwell` is the amplitude kept inside the shelter;
   * 2.40 m of coincident crest × 0.06 = 0.14 m, a clear 0.29 m under the deck.
   *
   * `shelterTo` holds flat water across the wharf AND its foreground (the tight
   * pose's camera sits 58.6 m seaward, so everything it sees of the basin is
   * inside 60 m), then lets swell rebuild so the basin is not a dead pond: about
   * 1.4 m of crest is back by the breakwater armour, which is where it belongs.
   *
   * The envelope is two shelters multiplied, NOT the bay↔port `portW` blend.
   * `portW` is 0.28 at the wharf's own east end (the slab runs to x 296.9, past
   * the board corner at 272), so a portW gate leaves the corner berth carrying
   * 1.1 m crests — measured, and the reason this term keys off the two seaward
   * scalars instead: metres north of the port face, and metres east of the bay
   * face. The Apostles bay is 200 m the wrong side of the first one, so its
   * weight is identically zero there and can be shown to be.
   */
  // taste-r1 (W16-A): -10 -> -46 (undo -10). The landward edge of the shelter gate was an 8 m ramp along the port face's straight line, so at the north end of the bay (station 10) the swell shade stopped on a ruled diagonal; 44 m lets it die away over about 160 px. Nothing at or seaward of seaPort -2 moves, so the basin sheet keeps its height.
  harbourLandwardFrom: -46,
  harbourLandwardTo: -2,
  harbourShelterTo: 60,
  harbourOpenBy: 150,
  harbourBayFrom: 60,
  harbourBayTo: 170,
  // Water law: a sheltered basin has no swell at all, only the 1.5 m chop.
  harbourSwell: 0,
  /**
   * ── SEA BODY COLOUR (board-AAA lane 7, r2) ────────────────────────────────
   *
   * Two faults, one cause each, measured off the authored plates rather than
   * off an impression:
   *
   * 1. THE DEPTH RAMP IS INVERTED AT THE BERTH. `ddPaintedBody` took no depth
   *    argument — `paintedVAt` and `paintedDeepMixAt` were functions of `front`
   *    alone, so body colour encoded distance-from-waterline as a stand-in for
   *    depth. That is right for a beach and wrong for a quay wall, where depth
   *    steps to ~10 m at the face. Measured at the berth: `oceanDepthAt` 9.00 m
   *    against `columnDepthAt(front)` 3.72 m, deepMix 0.06 — the palest end of
   *    the ramp against the deepest water on the board. `deepByDepth*` lets the
   *    depth the bake already carries force the deep plate.
   *
   *    Thresholds are 6.0-8.5 m and NOT the 2.2-5.0 m that reproduces the bay's
   *    own front/depth curve. `oceanDepthAt` carries the deliberate +/-35 m
   *    isobath warp, so a low threshold imports that meander into the bay's
   *    colour bands: it moved 6.3% of Apostles samples by more than 0.6 and
   *    peaked at 0.911. At 6.0-8.5 the bay changes by EXACTLY zero, because
   *    wherever bay depth passes 6 m the front-driven term is already 1. The
   *    two only disagree at a dredged wall, which is the whole diagnosis.
   *
   * 2. THE SEA HAS NO RED CHANNEL. `painted-deep-tile.png` was R mean 0.3/255
   *    with 76.7% of its texels at R == 0 exactly. Water under daylight
   *    scatters sky and sun and cannot have a dead red channel — a zero channel
   *    is a clipped channel — so floor red at a fraction of the brightest
   *    channel, in linear space, after the plates are sampled. A max() leaves
   *    every already-red pixel untouched, so this only re-hues dead pixels.
   *
   *    ── THE NUMBER 0.28 WAS CALIBRATED AGAINST A PHANTOM. READ THIS BEFORE
   *       RE-TUNING IT. ──
   *    It was swept to hit "red 60-120, saturation <= 150", a band measured off
   *    `monopoly-plus-4.jpg` and `-5.jpg`. Neither still contains water. mp-4's
   *    pale blue-grey "canal" is the Monopoly BOARD — it carries VIRGINIA
   *    AVENUE, STATES AVENUE, ELECTRIC COMPANY, both dice and the car token —
   *    and mp-5's "moat" is the JUST VISITING strip wrapping the JAIL corner.
   *    The band described printed cardboard. Every red target derived from it
   *    is void, including the ones that drove this constant.
   *
   *    0.28 is KEPT, on reasoning that does not depend on that band: it takes
   *    R == 0 to 0.00% in every frame, and it is depth-neutral. Measured on the
   *    plate mix, dropping it to 0.12 moves the Apostles p95/p5 by 5.55 -> 5.67
   *    and moves the wide pose the WRONG WAY, 3.20 -> 3.09. The floor was never
   *    what flattened the sea; a tonal lift on the deep plate was, and that has
   *    been reverted. Do not spend depth re-tuning this constant.
   *
   *    Any future red target must be derived from our own best water frame and
   *    said to be so. Do not quote a Monopoly Plus colour band again.
   */
  deepByDepth0: 6.0,
  deepByDepth1: 8.5,
  seaRedFloor: 0.28,
});

const BAY_SWELL_N = BAY_SWELL.length;

function srgb(hex) {
  // Single conversion: THREE's Color(hex) already lands in the linear
  // working space (the edge-massing double-darken bug, same class).
  return new THREE.Color(hex);
}

/** Phase in [0, 1). Reduced-motion is a constant good-looking freeze. */
export function foamPhaseAt(elapsed, reducedMotion = false) {
  if (reducedMotion) return OCEAN.freezePhase;
  const p = OCEAN.foamPeriod;
  const t = Number(elapsed);
  if (!Number.isFinite(t)) return 0;
  const wrapped = ((t % p) + p) % p;
  return wrapped / p;
}

/** True when the ocean sheet draws at this world XZ (water sector inside the crust). */
export function oceanCoversPoint(x, z, extent, plan) {
  const hx = (extent?.x ?? 272) * 0.5;
  const hz = (extent?.z ?? 272) * 0.5;
  const r = Math.hypot(x - hx, z - hz);
  if (r > EDGE_SEAM.outerRadius) return false;
  return waternessAt(x, z, extent, plan) >= OCEAN.waternessCut;
}

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function smooth01(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0 || 1e-6));
  return t * t * (3 - 2 * t);
}

function ggxSheetAt(noH, noV, noL, roughness, fresnel, gain) {
  const alpha = roughness * roughness;
  const alpha2 = alpha * alpha;
  const denom = noH * noH * (alpha2 - 1) + 1;
  const distribution = alpha2 / Math.max(Math.PI * denom * denom, 1e-5);
  const k = ((roughness + 1) ** 2) / 8;
  const v = Math.max(0, Math.min(1, noV));
  const l = Math.max(0, Math.min(1, noL));
  const visibility = (v / Math.max(v * (1 - k) + k, 1e-4))
    * (l / Math.max(l * (1 - k) + k, 1e-4));
  const raw = distribution * visibility * fresnel
    / Math.max(4 * v * l, 1e-4) * l * gain;
  return raw / (1 + raw / OCEAN_SPECULAR.sheetCap);
}

/** CPU receipt for the GGX roughness/Fresnel/angular gate plus the W11 sheet. */
export function oceanSpecularProfileAt(axisDegrees, noV = 0.72, noL = 0.72) {
  const deg = Math.max(0, Number.isFinite(axisDegrees) ? axisDegrees : 90);
  const noH = Math.max(0, Math.cos(deg * Math.PI / 180));
  const axisCos = Math.cos(OCEAN_SPECULAR.sparkleAxisDeg * Math.PI / 180);
  const axis = smooth01(axisCos, 1, noH);
  const roughness = OCEAN_SPECULAR.roughPlane
    + (OCEAN_SPECULAR.roughAxis - OCEAN_SPECULAR.roughPlane) * axis;
  const v = Math.max(0, Math.min(1, noV));
  const fresnel = OCEAN_SPECULAR.f0
    + (1 - OCEAN_SPECULAR.f0) * ((1 - noH) ** 5);
  const sheet = ggxSheetAt(noH, v, noL, roughness, fresnel, OCEAN_SPECULAR.sheetGain);
  const envFresnel = oceanEnvFresnelAt(v);
  const sheetFresnel = Math.max(fresnel, OCEAN_SPECULAR.envFresnelFloor);
  const sunSheet = ggxSheetAt(
    noH, v, noL, OCEAN_SPECULAR.sheetRough, sheetFresnel, OCEAN_SPECULAR.sheetTermGain,
  );
  return {
    axis, roughness, fresnel, sheet,
    envFresnel,
    sheetRough: OCEAN_SPECULAR.sheetRough,
    sunSheet,
    sparkleAllowed: deg <= OCEAN_SPECULAR.sparkleAxisDeg,
  };
}

/** Stylised env Fresnel: floor 0.12 at 45–55°, 1.0 at grazing. */
export function oceanEnvFresnelAt(noV) {
  const v = clamp01(Number(noV));
  const t = smooth01(0, OCEAN_SPECULAR.envViewCos, v);
  return OCEAN_SPECULAR.envFresnelGrazing
    + (OCEAN_SPECULAR.envFresnelFloor - OCEAN_SPECULAR.envFresnelGrazing) * t;
}

/**
 * CPU twin of the W11 2–6 m albedo mottle. Incommensurate sines, not a
 * GPU-noise reimplementation: the test asks whether a 60 m window tiles
 * and whether |contrast| stays ≤ 12 luma.
 */
export function oceanMottleAt(x, z) {
  const px = Number.isFinite(Number(x)) ? Number(x) : 0;
  const pz = Number.isFinite(Number(z)) ? Number(z) : 0;
  const rot = (xx, zz, a) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return { x: c * xx - s * zz, z: s * xx + c * zz };
  };
  const p0 = rot(px, pz, 0.41);
  const warpA = Math.sin(p0.x * 0.113 + pz * 0.047 + 2.8) * 2.4;
  const warpB = Math.sin(p0.z * 0.091 - px * 0.063 + 1.9) * 2.1;
  const p = { x: p0.x + warpA, z: p0.z + warpB };
  const nA = Math.sin((p.x * 0.91 + p.z * 0.42) * Math.PI * 2 / OCEAN_W11.mottleM);
  const nB = Math.sin((p.x * -0.53 + p.z * 0.85) * Math.PI * 2 / OCEAN_W11.mottleCrossM);
  const nC = Math.sin((p.x * 0.22 + p.z * -0.97) * Math.PI * 2 / OCEAN_W11.mottleThirdM);
  const nD = Math.sin((p.x * 0.67 - p.z * 0.74) * Math.PI * 2 / 4.73);
  const n = nA * 0.34 + nB * 0.28 + nC * 0.22 + nD * 0.16;
  return Math.max(-1, Math.min(1, n)) * OCEAN_W11.mottleContrast;
}

/** CPU twin of the W12 view-dependent sheet mix. Polar 24° → N·V ≈ sin 24°. */
export function oceanW12SheetAmtAt(noV) {
  const v = clamp01(Number(noV));
  const graze = (1 - v) ** 1.6;
  return OCEAN_W12.sheetFloor
    + (OCEAN_W12.sheetGrazing - OCEAN_W12.sheetFloor) * graze;
}

/** CPU twin of the W12 half-float planar decode + chroma push. */
export function oceanW12PlanarLiftAt(r, g, b) {
  const gamma = OCEAN_W12.planarGamma;
  const gain = OCEAN_W12.planarGain;
  const lift = [
    (Math.max(0, Number(r) || 0) ** gamma) * gain,
    (Math.max(0, Number(g) || 0) ** gamma) * gain,
    (Math.max(0, Number(b) || 0) ** gamma) * gain,
  ];
  const luma = 0.2126 * lift[0] + 0.7152 * lift[1] + 0.0722 * lift[2];
  const c = OCEAN_W12.planarChroma;
  return {
    r: luma + (lift[0] - luma) * c,
    g: luma + (lift[1] - luma) * c,
    b: luma + (lift[2] - luma) * c,
    luma,
  };
}

/** CPU twin of the W13 env floor (0.04 at 45–55°, 1.0 at grazing). */
export function oceanW13EnvFresnelAt(noV) {
  const v = clamp01(Number(noV));
  const t = smooth01(0, OCEAN_SPECULAR.envViewCos, v);
  return OCEAN_SPECULAR.envFresnelGrazing
    + (OCEAN_W13.envFresnelFloor - OCEAN_SPECULAR.envFresnelGrazing) * t;
}

/** CPU twin of the W13 planar luma-lift cap (≤ 30 luma over the body). */
export function oceanW13PlanarLiftCap(bodyLuma, planarLuma) {
  const body = Number(bodyLuma);
  const planar = Number(planarLuma);
  const base = Number.isFinite(body) ? body : 0;
  const lift = Number.isFinite(planar) ? planar : 0;
  return Math.min(lift, base + OCEAN_W13.planarLumaLiftMax);
}

/** CPU twin of the W13 half-vector sheet lobe. */
export function oceanW13SheetLobeAt(ndh) {
  return smooth01(OCEAN_W13.sheetLobeFrom, OCEAN_W13.sheetLobeTo, clamp01(Number(ndh)));
}

/** P19 X3: 0 when the sun is behind the camera, 1 when the sun sits in front. */
export function oceanX3TowardSunAt(lDotV, noV = 0.72) {
  const toward = smooth01(
    OCEAN_X3.towardFrom, OCEAN_X3.towardTo, clamp01(-Number(lDotV)),
  );
  const graze = (1 - clamp01(Number(noV))) ** 1.2;
  return toward * graze;
}

/** Wider GGX roughness on the sun-toward-camera sheet. */
export function oceanX3SheetRoughAt(lDotV, noV = 0.72) {
  const w = oceanX3TowardSunAt(lDotV, noV);
  return OCEAN_SPECULAR.sheetRough
    + (OCEAN_X3.sheetRoughWide - OCEAN_SPECULAR.sheetRough) * w;
}

/**
 * Cap the sheet's added luma at 60/255 and the body at 215/255.
 * `sheetLuma` is the additive term; `baseLuma` is the water before it.
 */
export function oceanX3CapSheet(baseLuma, sheetLuma) {
  const base = Number.isFinite(Number(baseLuma)) ? Number(baseLuma) : 0;
  const add = Math.max(0, Number.isFinite(Number(sheetLuma)) ? Number(sheetLuma) : 0);
  const cappedAdd = Math.min(add, OCEAN_X3.sheetAddMax);
  const total = Math.min(base + cappedAdd, OCEAN_X3.lumaCeil);
  return {
    added: cappedAdd,
    total,
    scale: add > 0 ? cappedAdd / add : 1,
  };
}

/** CPU twin of the W14 2–5 px crest. `px` is metres per fragment (fwidth). */
export function oceanW14CrestAt(gapM, px = 0.06) {
  const g = Math.max(0, Number(gapM) || 0);
  const step = Math.max(1e-4, Number(px) || 0.06);
  const lo = Math.max(OCEAN_W14.crestFromM, step * 2);
  const hi = Math.max(OCEAN_W14.crestToM, step * 5);
  const pk = Math.max(OCEAN_W14.crestPeakM, step * 3.2);
  return smooth01(lo * 0.20, pk, g) * (1 - smooth01(pk, hi, g));
}

/** CPU twin: at altitude the entire wet line fits inside one fragment. */
export function oceanW16CrestAt(gapM, px = 0.06, camd = 140) {
  const step = Math.max(1e-4, Number(px) || 0.06);
  const g = Math.max(0, Number(gapM) || 0);
  const far = smooth01(OCEAN_W16.collarFadeFromM, OCEAN_W16.collarFadeToM, camd);
  const wet = (1 - smooth01(0, step, g)) * OCEAN_W16.wetLineGain;
  return oceanW14CrestAt(g, step) * (1 - far) + wet * far;
}

/** CPU twin of the W14 bow/stern displacement ring (0.4–0.8 m). */
export function oceanW14RingAt(gapM) {
  const g = Number(gapM);
  if (!Number.isFinite(g)) return 0;
  return smooth01(OCEAN_W14.ringFromM, OCEAN_W14.ringFromM + 0.08, g)
    * (1 - smooth01(OCEAN_W14.ringToM - 0.08, OCEAN_W14.ringToM, g));
}

/** CPU twin of W15 seabed caustics. Peak ≤ 8 luma. */
export function oceanW15CausticAt(x, z, depthM = 1.2) {
  const px = Number.isFinite(Number(x)) ? Number(x) : 0;
  const pz = Number.isFinite(Number(z)) ? Number(z) : 0;
  const d = Math.max(0, Number(depthM) || 0);
  const gate = (1 - smooth01(0.15, 3.4, d)) * smooth01(0.02, 0.45, d);
  const u = (px * 0.73 + pz * 0.68) * Math.PI * 2 / OCEAN_W15.causticM;
  const v = (px * -0.61 + pz * 0.79) * Math.PI * 2 / (OCEAN_W15.causticM * 1.37);
  const n = 0.5 + 0.5 * Math.sin(u) * Math.sin(v);
  return n * OCEAN_W15.causticLuma * gate;
}

/** CPU twin of W15 shore-parallel swell shading. Peak ≤ 10 luma. */
export function oceanW15SwellShadeAt(alongM, frontM = 12) {
  const a = Number.isFinite(Number(alongM)) ? Number(alongM) : 0;
  const f = Math.max(0, Number(frontM) || 0);
  const lam = OCEAN_W15.swellFromM
    + (OCEAN_W15.swellToM - OCEAN_W15.swellFromM) * 0.5;
  const s = Math.sin(f * Math.PI * 2 / lam);
  const gate = smooth01(2, 10, f) * (1 - smooth01(48, 70, f));
  return s * OCEAN_W15.swellLuma * gate;
}

/** W11 mottle after the W15 altitude crush. camd in metres. */
export function oceanW15MottleAt(x, z, camd = 80) {
  const base = oceanMottleAt(x, z);
  const alt = smooth01(OCEAN_W15.mottleAltFromM, OCEAN_W15.mottleAltToM, Number(camd) || 0);
  return base * (1 - alt * (1 - OCEAN_W15.mottleAltKeep));
}

/** CPU twin of the W12 0.6 m reflected-depth meniscus / pale collar. */
export function oceanW12ContactAtDepthGap(depthGapM) {
  const raw = Number(depthGapM);
  if (!Number.isFinite(raw) || raw < -0.02 || raw > 0.80) {
    return { wet: 0, foam: 0 };
  }
  const gap = Math.max(0, raw);
  const wet = 1 - smooth01(OCEAN_W12.wetFromM, OCEAN_W12.wetToM, gap);
  const foam = smooth01(OCEAN_W12.foamFromM, OCEAN_W12.foamPeakM, gap)
    * (1 - smooth01(OCEAN_W12.foamPeakM, OCEAN_W12.foamToM, gap));
  return { wet, foam };
}

/** CPU twin of the W9 reflected-depth contact profile, for deterministic QA. */
export function harbourContactAtDepthGap(depthGapM) {
  const raw = Number(depthGapM);
  if (!Number.isFinite(raw) || raw < -0.02 || raw > HARBOUR_CONTACT.depthMaxM) {
    return { wet: 0, foam: 0 };
  }
  const gap = Math.max(0, raw);
  const wet = 1 - smooth01(HARBOUR_CONTACT.wetFromM, HARBOUR_CONTACT.wetToM, gap);
  const foam = smooth01(HARBOUR_CONTACT.foamFromM, HARBOUR_CONTACT.foamPeakM, gap)
    * (1 - smooth01(HARBOUR_CONTACT.foamPeakM, HARBOUR_CONTACT.foamToM, gap));
  return { wet, foam };
}

/**
 * P16-W8: compress only the bright shoulder of an open-sea environment tap.
 * Values under the knee are byte-for-byte unchanged; the rational shoulder
 * approaches the ceiling without flattening every cloud to one grey value.
 */
export function outerSeaSkyLumaAt(luma, outerDeep = 1) {
  const source = Math.max(0, Number(luma) || 0);
  const excess = Math.max(0, source - OUTER_SEA.skyLumaKnee);
  const shoulder = OUTER_SEA.skyLumaKnee + excess
    / (1 + excess / Math.max(1e-6, OUTER_SEA.skyLumaCeil - OUTER_SEA.skyLumaKnee));
  const toned = Math.min(source, shoulder);
  const mix = clamp01(Number(outerDeep) || 0);
  return source * (1 - mix) + toned * mix;
}

/**
 * Effective reflected-sky share for the three sequential water mixes. Each
 * later mix receives only the room left under the one open-sea budget.
 */
export function outerSeaReflectionBudgetAt(baseWeight, outerWeight, horizonWeight) {
  const budget = OUTER_SEA.reflectionBudget;
  const base = Math.min(budget, clamp01(Number(baseWeight) || 0));
  const outerWant = clamp01(Number(outerWeight) || 0);
  const outerRoom = Math.max(0, budget - base) / Math.max(1e-6, 1 - base);
  const outer = Math.min(outerWant, outerRoom);
  const afterOuter = 1 - (1 - base) * (1 - outer);
  const horizonWant = clamp01(Number(horizonWeight) || 0);
  const horizonRoom = Math.max(0, budget - afterOuter)
    / Math.max(1e-6, (1 - afterOuter) * OUTER_SEA.horizonSkyShare);
  const horizon = Math.min(horizonWant, horizonRoom);
  const effective = 1 - (1 - afterOuter)
    * (1 - horizon * OUTER_SEA.horizonSkyShare);
  return { base, outer, horizon, effective };
}

/** Still-water depth (metres) of the bay ramp at a safe front. */
export function columnDepthAt(distFromShore) {
  const front = Math.max(0, Number(distFromShore) || 0);
  return (front / 120) ** 0.70 * OCEAN.maxDepth;
}

/** Dominant colour band at a shoreline distance (metres, + seaward). */
export function oceanBandAt(distFromShore) {
  const d = Number(distFromShore);
  if (!Number.isFinite(d) || d < 0) return 'wet-sand';
  if (d < OCEAN_BANDS.sandyTo) return 'sandy';
  if (d < OCEAN_BANDS.oliveTo) return 'olive';
  if (d < OCEAN_BANDS.navyFrom) return 'teal';
  return 'navy';
}

/**
 * Linear-working-space ramp colour matching the live fragment: ONE zone
 * decision per sample, then transmission only inside the first ~2 m of
 * sand-glass. No overlapping olive/teal/navy plates (R13 pivot).
 */
export function rampColorAt(distFromShore) {
  const front = Number(distFromShore) || 0;
  const iso = columnDepthAt(front);
  const z1 = ZONE_BLEND.sandGlassTo;
  const z2 = ZONE_BLEND.turquoiseTo;
  const w1 = z1 * ZONE_BLEND.blendFrac;
  const w2 = (z2 - z1) * ZONE_BLEND.blendFrac;
  const aqua = srgb(OCEAN_RAMP.olive).lerp(srgb(OCEAN_RAMP.teal), 0.72);
  let column;
  if (iso < z1) {
    const t = smooth01(z1 - w1, z1, iso);
    column = aqua.clone().lerp(srgb(OCEAN_RAMP.teal), t);
  } else if (iso < z2) {
    const t = smooth01(z2 - w2, z2, iso);
    column = srgb(OCEAN_RAMP.teal).lerp(srgb(OCEAN_RAMP.deep), t);
  } else {
    column = srgb(OCEAN_RAMP.deep);
  }
  const trans = Math.exp(-iso * ZONE_BLEND.transK) * (1 - smooth01(1.55, z1, iso));
  const bed = srgb(OCEAN_RAMP.wetSand);
  return bed.lerp(column, 1 - trans);
}

/** Peak vertical swell amplitude (metres) after shore fade AND depth limit. */
export function waveAmpAt(distFromShore, scale = 1) {
  const front = Number(distFromShore);
  if (!Number.isFinite(front) || front <= 0) return 0;
  const fade = smooth01(OCEAN_BANDS.ampFade[0], OCEAN_BANDS.ampFade[1], front);
  let sum = 0;
  for (let i = 0; i < BAY_SWELL.length; i += 1) sum += BAY_SWELL[i].amp;
  const depth = columnDepthAt(front);
  const depthLimit = clamp01(depth / OCEAN_BANDS.depthLimit) * smooth01(0.12, 2.15, depth);
  return sum * fade * depthLimit * scale;
}

/**
 * Beach-foam LAYER coverage 0..1 (the waterline authority). R13 CPU is the
 * in-arc ENVELOPE (no along sample): breaker 4–8 m deep, two thin retreat
 * lace lines. Ocean-sheet landward / shelf swash are not in this number.
 */
export function foamCoverAt(distFromShore, phase = OCEAN.freezePhase) {
  const p = ((Number(phase) % 1) + 1) % 1;
  const run = p < 0.5 ? p * 2 : 2 - p * 2;
  const front = Number(distFromShore) || 0;
  const depth = columnDepthAt(front);
  const aa = BREAKER_ARCS.aaM;
  const reach = BREAKER_ARCS.depthMin
    + (BREAKER_ARCS.depthMax - BREAKER_ARCS.depthMin) * run;
  const seaward = 1 - smooth01(reach - aa, reach + aa, front);
  const landward = smooth01(-aa, aa, front);
  const breakness = smooth01(0.55, 1.65, depth) * (1 - smooth01(3.55, 5.40, depth));
  const curl = seaward * landward * (0.55 + 0.45 * run) * Math.max(breakness, 0.75 * seaward * landward);
  const leftover = 0.35 + 0.65 * (1 - run);
  const halfW = BREAKER_ARCS.laceW * 0.5;
  const laceLine = (centre) => {
    const d = Math.abs(front - centre);
    return 1 - smooth01(halfW, halfW + aa, d);
  };
  const lace = leftover * Math.max(laceLine(-0.70), laceLine(-2.05));
  return clamp01(Math.max(curl, lace * 0.90));
}

/** Alias: layer is the waterline authority. */
export function beachFoamCoverAt(distFromShore, phase = OCEAN.freezePhase) {
  return foamCoverAt(distFromShore, phase);
}

/**
 * Ocean-sheet white-foam at a front sample. R13b: landward and the
 * waterline band are 0 (layer owns them). Whitecaps live offshore.
 */
export function oceanSheetFoamAt(distFromShore, phase = OCEAN.freezePhase) {
  const front = Number(distFromShore) || 0;
  if (front <= FOAM_STACK.oceanCurlFrom) return 0;
  const p = ((Number(phase) % 1) + 1) % 1;
  const run = p < 0.5 ? p * 2 : 2 - p * 2;
  const aa = BREAKER_ARCS.aaM;
  const reach = BREAKER_ARCS.depthMin
    + (BREAKER_ARCS.depthMax - BREAKER_ARCS.depthMin) * run;
  const seaward = 1 - smooth01(reach - aa, reach + aa, front);
  const from = smooth01(FOAM_STACK.oceanCurlFrom, FOAM_STACK.oceanCurlFrom + 2, front);
  return clamp01(seaward * from);
}

/** Shelf swash foam — retired from the live path. Always 0. */
export function shelfSwashFoamAt() {
  return 0;
}

/**
 * Live white-foam contributors at one front sample. Sum must not exceed
 * one system's max (no stacking).
 */
export function foamStackAt(distFromShore, phase = OCEAN.freezePhase) {
  const ocean = oceanSheetFoamAt(distFromShore, phase);
  const layer = beachFoamCoverAt(distFromShore, phase);
  const shelf = shelfSwashFoamAt(distFromShore, phase);
  const peak = Math.max(ocean, layer, shelf);
  return {
    ocean,
    layer,
    shelf,
    sum: ocean + layer + shelf,
    peak,
  };
}

/**
 * Wharf / seawall lap ring. `portW` 1 = on the port face. Subtly phase-modulated.
 */
export function contactFoamAt(distFromShore, portW = 1, phase = OCEAN.freezePhase) {
  const p = ((Number(phase) % 1) + 1) % 1;
  const lap = 0.78 + 0.22 * Math.sin(p * Math.PI * 2);
  const band = 1 - smooth01(0.35, FOAM_MASK.contactW, Math.abs(Number(distFromShore) || 0));
  return clamp01(band * clamp01(Number(portW) || 0) * lap * 0.88);
}

/**
 * CPU column through the live ocean register. Colour follows depth +
 * transmission; swell is depth-limited; foam is the unified break system.
 */
export function sampleOceanColumn(distFromShore, opts = {}) {
  const front = Number(distFromShore);
  const phase = opts.phase ?? OCEAN.freezePhase;
  const scale = opts.scale ?? 1;
  const colour = rampColorAt(front);
  const depth = columnDepthAt(front);
  return {
    band: oceanBandAt(front),
    colour,
    hex: `#${colour.getHexString()}`,
    waveAmp: waveAmpAt(front, scale),
    foam: foamCoverAt(front, phase),
    contact: contactFoamAt(front, opts.portW ?? 0, phase),
    front,
    depth,
  };
}

function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Discrete breaker-arc seeds along the beach. ≥2 arcs per 100 m with
 * authored gaps — not one continuous band. Matches BREAKER_ARCS.periodM.
 */
export function breakerArcsAt(along0 = 0, length = 100) {
  const period = BREAKER_ARCS.periodM;
  const lo = Number(along0) || 0;
  const hi = lo + (Number(length) || 100);
  const arcs = [];
  const startIdx = Math.floor(lo / period) - 1;
  const endIdx = Math.ceil(hi / period) + 1;
  for (let idx = startIdx; idx <= endIdx; idx += 1) {
    const h = hash2(idx * 1.71, 3.17);
    const h2 = hash2(idx * 2.43, 8.91);
    const gap = BREAKER_ARCS.gapMin + (BREAKER_ARCS.gapMax - BREAKER_ARCS.gapMin) * h;
    const arcLen = period - gap;
    const a0 = idx * period + h2 * (gap * 0.4);
    const a1 = a0 + arcLen;
    if (a1 > lo && a0 < hi) {
      arcs.push({
        start: Math.max(a0, lo),
        end: Math.min(a1, hi),
        depth: BREAKER_ARCS.depthMin
          + (BREAKER_ARCS.depthMax - BREAKER_ARCS.depthMin) * hash2(idx * 0.9, 5.5),
        gap,
      });
    }
  }
  return arcs;
}

/** True in a browser that can decode PNGs. Node tests take the baked fallback. */
export function textureLoaderAvailable() {
  return typeof globalThis.Image === 'function'
    || (typeof globalThis.document !== 'undefined'
      && typeof globalThis.document.createElement === 'function');
}

export function foamPlateHref(fileName) {
  try {
    return new URL(`${FOAM_ART.dir}${fileName}`, import.meta.url).href;
  } catch {
    return `assets/water/foam/${fileName}`;
  }
}

export function paintPlateHref(fileName) {
  try {
    return new URL(`${PAINTED.dir}${fileName}`, import.meta.url).href;
  } catch {
    return `_reviews/aaa-loop/ocean-refs/${fileName}`;
  }
}

/** Strip V: 0 at the waterline (PNG bottom / sand glass), 1 at strip top. */
export function paintedVAt(sdf) {
  const front = Math.max(0, Number(sdf) || 0);
  return Math.min(1, front / PAINTED.stripReach);
}

/**
 * 0 inside the strip, 1 AT stripReach (the V clamp). W2b: the fade ends
 * at the clamp — fading past it sampled the strip's clamped top row and
 * smeared it into vertical streak columns.
 */
export function paintedDeepMixAt(sdf, depth = 0) {
  const byFront = smooth01(
    PAINTED.stripReach - PAINTED.fadeWin, PAINTED.stripReach, Number(sdf) || 0,
  );
  const byDepth = smooth01(PAINTED.deepByDepth0, PAINTED.deepByDepth1, Number(depth) || 0);
  // max(), never min(): the fade must still COMPLETE by the strip's V clamp or
  // the whole fade band samples the strip's clamped top row and smears into
  // vertical streak columns (the r18-widebay lower third). Taking the larger of
  // the two can only bring the deep plate in earlier, never later.
  return Math.max(byFront, byDepth);
}

/**
 * Linear-space red floor for the sea body. `c` is [r, g, b] in linear 0-1.
 * Mirrors `ddSeaRedFloor` in the fragment; see `PAINTED.seaRedFloor`.
 */
export function seaRedFloorLin(c) {
  const k = PAINTED.seaRedFloor;
  const r = Number(c?.[0]) || 0;
  const g = Number(c?.[1]) || 0;
  const b = Number(c?.[2]) || 0;
  return [Math.max(r, k * Math.max(g, b)), g, b];
}

/** Distance-calm mix: 0 at ≤calmNear, calmAmt (~0.70) by calmFar. */
export function paintedCalmAt(camd) {
  return PAINTED.calmAmt * smooth01(PAINTED.calmNear, PAINTED.calmFar, Number(camd) || 0);
}

/** Polar wrap pair 0.5 m (default) each side of the ±π azimuth. */
export function paintedWrapPair(extent, radius = PAINTED.spanRefR, offsetM = 0.5) {
  const hx = (extent?.x ?? 272) * 0.5;
  const hz = (extent?.z ?? 272) * 0.5;
  const r = Number(radius) || PAINTED.spanRefR;
  const eps = (Number(offsetM) || 0.5) / Math.max(r, 1e-3);
  const at = (az) => ({
    x: hx + Math.sin(az) * r,
    z: hz + Math.cos(az) * r,
    az,
  });
  return { a: at(-Math.PI + eps), b: at(Math.PI - eps), hx, hz, r };
}

/**
 * Wrap-safe paint U. Cartesian `along / span` everywhere, mirror-folded
 * onto the polar ±π seam so U does not jump mid-tile. `t` is the same
 * freeze/live time the strip drift uses.
 */
export function paintedWrapSafeU(along, x, z, extent, t = OCEAN.freezeTime) {
  const span = Math.max(PAINTED.spanU0, 4);
  const uCart = ((Number(along) || 0) + (Number(t) || 0) * PAINTED.stripDrift) / span;
  const hx = (extent?.x ?? 272) * 0.5;
  const hz = (extent?.z ?? 272) * 0.5;
  const dx = (Number(x) || 0) - hx;
  const dz = (Number(z) || 0) - hz;
  const az = Math.atan2(dx, dz);
  const r = Math.max(Math.hypot(dx, dz), 1e-3);
  const seamM = Math.min(Math.abs(az + Math.PI), Math.abs(az - Math.PI)) * r;
  const fold = 1 - smooth01(0, PAINTED.wrapFoldM, seamM);
  const azFold = Math.abs(Math.abs(az) - Math.PI);
  const uFold = (azFold * r) / span;
  return uCart * (1 - fold) + uFold * fold;
}

/** CPU mirror of the live strip UV. Reduced-motion uses the freeze time. */
export function paintedUvAt(along, sdf, opts = {}) {
  const motion = opts.motion === true;
  const t = motion ? (Number(opts.t) || 0) : OCEAN.freezeTime;
  const spanU = PAINTED.spanU0;
  let u = ((Number(along) || 0) + t * PAINTED.stripDrift) / Math.max(spanU, 4);
  if (opts.x != null && opts.z != null) {
    u = paintedWrapSafeU(along, opts.x, opts.z, opts.extent, t);
  }
  return {
    u,
    v: paintedVAt(sdf),
    spanU,
    deepMix: paintedDeepMixAt(sdf),
  };
}

/** 1 at the quay face, 0 by portFeather metres. */
export function portBasinWeightAt(portFront, portW = 1) {
  const near = 1 - smooth01(0, PAINTED.portFeather, Math.abs(Number(portFront) || 0));
  return near * smooth01(0.40, 0.85, Number(portW) || 0);
}

/**
 * CPU of the airport/east wrap bowl. 1 in the port–inland quadrant band,
 * 0 on the dry airport and on the open bay.
 */
export function airportWrapBasinWeight(inlandSea, portSea) {
  const inlandNear = smooth01(-8, 6, Number(inlandSea) || 0)
    * (1 - smooth01(8, PAINTED.airportFeatherIn, Number(inlandSea) || 0));
  const portNear = smooth01(-10, 4, Number(portSea) || 0)
    * (1 - smooth01(6, PAINTED.airportFeatherPort, Number(portSea) || 0));
  return inlandNear * portNear;
}

/** Quay bowl plus the port–inland wrap. Extra args are optional. */
export function harbourBasinWeightAt(portFront, portW = 1, inlandSea, portSea) {
  const quay = portBasinWeightAt(portFront, portW);
  if (inlandSea == null || portSea == null) return quay;
  return Math.max(quay, airportWrapBasinWeight(inlandSea, portSea));
}

/**
 * Sheet Y in the port basin (CPU of the vertex program).
 *
 * Mirrors `OCEAN_VERT` term for term and in the same ORDER: the sheltered
 * harbour scales the swell, the 8 m quay bowl damps what is left, the authored
 * drop is subtracted, then the floor. Anything that changes in the shader has
 * to change here in the same commit — the drawn surface and every offline
 * sweep read from these two, and a divergence is invisible in a plate.
 *
 * `extra` may pass `{ inlandSea, portSea, baySea }`. `portSea` switches the
 * sheltered-harbour term on; without it this function cannot know where the
 * sample is and applies no shelter. `baySea` is optional and defaults to the
 * fully sheltered side, which is correct anywhere `portSea` places the sample
 * on the port frontage — the only place callers ask for a quay height.
 */
export function portSheetYAt(portFront, portW = 1, swellY = 0, extra = null) {
  const basin = harbourBasinWeightAt(
    portFront,
    portW,
    extra && extra.inlandSea,
    extra && extra.portSea,
  );
  const calm = extra && extra.portSea != null
    ? harbourSwellScaleAt(extra.portSea, extra.baySea ?? 0)
    : 1;
  const y = WATER_Y
    + (Number(swellY) || 0) * calm * (1 - (1 - PAINTED.swellDamp) * basin)
    - PAINTED.portDrop * basin;
  return Math.max(y, WATER_FLOOR_Y);
}

/**
 * Sheltered-harbour weight (CPU of the vertex `calmGate`).
 *
 * 1 across the port frontage from the board rim out to `harbourShelterTo`,
 * falling to 0 by `harbourOpenBy` (past the breakwater armour at 103–113 m),
 * and 0 on the open bay because `portW` gates it. Arguments are the two
 * scalars the vertex shader already has: metres seaward of the PORT wall face,
 * and the bay↔port blend.
 */
export function harbourCalmAt(portSea, baySea) {
  const s = Number(portSea) || 0;
  const b = Number(baySea) || 0;
  const roll = smooth01(PAINTED.harbourLandwardFrom, PAINTED.harbourLandwardTo, s);
  const inside = 1 - smooth01(PAINTED.harbourShelterTo, PAINTED.harbourOpenBy, s);
  const offBay = 1 - smooth01(PAINTED.harbourBayFrom, PAINTED.harbourBayTo, b);
  return roll * inside * offBay;
}

/** Swell-amplitude multiplier at a sample. 1 on the open bay, `harbourSwell` at the quay. */
export function harbourSwellScaleAt(portSea, baySea) {
  const calm = harbourCalmAt(portSea, baySea);
  return 1 + (PAINTED.harbourSwell - 1) * calm;
}

/**
 * Peak sheet Y the harbour can reach at a sample, given the unrestrained
 * coincident-crest height of the swell stack. The pin the wharf clearance is
 * argued from: `apronTop - harbourPeakYAt(seaward, 1) >= 0.2`.
 */
export function harbourPeakYAt(portSea, baySea) {
  const crest = BAY_SWELL.reduce((a, s) => a + s.amp, 0);
  return WATER_Y + crest * harbourSwellScaleAt(portSea, baySea) * SURF.gainCap;
}

/** Bind-pose world pair on either side of the polar wrap azimuth. */
export function seamWorldPair(extent, radius = 180) {
  const hx = (extent?.x ?? 272) * 0.5;
  const hz = (extent?.z ?? 272) * 0.5;
  const r = Number(radius) || 180;
  const eps = 1.5e-3;
  const at = (az) => ({
    x: hx + Math.sin(az) * r,
    z: hz + Math.cos(az) * r,
    az,
  });
  return { a: at(-Math.PI + eps), b: at(Math.PI - eps), hx, hz, r };
}

/**
 * The coast field the live ocean baked (water/coast-field.js), shared with the CPU twins so a boat reads the same
 * bytes the vertex shader reads. Null offline: the twins then keep the old front path.
 */
let CPU_COAST = null;
export function setOceanCoastField(bake) { CPU_COAST = bake ?? null; }
export function oceanCoastFieldAt(x, z) { return CPU_COAST ? sampleCoastField(CPU_COAST, x, z) : null; }

/** CPU Gerstner frame matching ddBaySwell (scale 1, freeze time default). `coast` is `{ S, a }` from the coast field. */
export function paintedSwellFrameAt(along, front, depth, t = OCEAN.freezeTime, scale = 1, bed = Infinity, coast = null) {
  const fade = smooth01(0.80, 11.0, Number(front) || 0);
  const d = Number(depth) || 0;
  const depthLimit = smooth01(0.12, 2.15, d) * Math.min(1, d / 5.4);
  const ca = coast ? Math.min(1, Math.max(0, coast.a)) : 0;
  const lut = coast ? surfLutAt(Math.max(0, coast.S)) : null;
  const liveOld = fade * depthLimit;
  const liveNew = (Number(front) || 0) > 0 ? smooth01(0, 1.5, Math.max(0, coast ? coast.S : 0)) : 0;
  const gain = coast ? 1 + (lut.gain - 1) * ca : 1;
  const live = (liveOld + (liveNew - liveOld) * ca) * (Number.isFinite(Number(scale)) ? Number(scale) : 1);
  if ((Number(front) || 0) <= 0 || live <= 0) {
    return { offsetY: 0, normal: { x: 0, y: 1, z: 0 } };
  }
  let tAx = 1;
  let tAy = 0;
  let tAz = 0;
  let tBx = 0;
  let tBy = 0;
  let tBz = 1;
  let oy = 0;
  const crestWob = Math.sin(along * 0.019 + 0.6) * 4.2
    + Math.sin(along * 0.047 + 1.9) * 1.8;
  const swellEnv = swellEnvelopeAt(along, Number(front) || 0, t);
  // taste-r1 (W14-A): sand clearance, the twin of the vertex `bedCap` (crest sum <= 0.39 of the drawn bed).
  // taste-r1 (W15-A1): per-train wander and group amplitude in the open sea (0 inside 120 m of the shore), the twin of `ddSurfTrains`.
  const trains = surfTrainTermsAt(along, Number(front) || 0, t);
  let crestSum = 0;
  for (let i = 0; i < BAY_SWELL.length; i += 1) crestSum += BAY_SWELL[i].amp * live * swellEnv * gain * trains.en[i];
  const capDepth = coast ? Number(bed) + (Math.min(lut.depth, Number(bed)) - Number(bed)) * ca : Number(bed);
  const bedCap = Math.min(1, 0.39 * Math.max(capDepth, 0) / Math.max(crestSum, 1e-3));
  for (let i = 0; i < BAY_SWELL.length; i += 1) {
    const s = BAY_SWELL[i];
    const len = Math.hypot(s.dir[0], s.dir[1]) || 1;
    const Dx = s.dir[0] / len;
    const Dy = s.dir[1] / len;
    const k = (Math.PI * 2) / Math.max(s.len, 4);
    const amp = s.amp * live * swellEnv * gain * bedCap * trains.en[i];
    const qA = s.steep * amp;
    // taste-r1 (W14-A D1): + omega * t, crests move onshore.
    const phi = k * (Dx * along + Dy * (front + crestWob * 0.35)) + s.omega * t + (coast ? ca * lut.e[i] : 0) + trains.ph[i];
    const sn = Math.sin(phi);
    const cn = Math.cos(phi);
    oy += amp * sn;
    const kQAs = k * qA * sn;
    const kAc = k * amp * cn;
    tAx += -Dx * Dx * kQAs;
    tAy += Dx * kAc;
    tAz += -Dy * Dx * kQAs;
    tBx += -Dx * Dy * kQAs;
    tBy += Dy * kAc;
    tBz += -Dy * Dy * kQAs;
  }
  const nx = tBy * tAz - tBz * tAy;
  const ny = tBz * tAx - tBx * tAz;
  const nz = tBx * tAy - tBy * tAx;
  const nlen = Math.hypot(nx, ny, nz) || 1;
  // The shader applies `ddSoftFloorY(oy, 0.48, 0.09)` to the summed height
  // before it leaves ddBaySwell. This mirror did not, so every offline sweep
  // reported troughs ~0.07 m deeper than the surface actually goes and pinned
  // them on the hard WATER_FLOOR_Y clamp (-0.550) that the drawn sheet never
  // reaches. Crests are unaffected — the term only limits the downward side.
  // Found by cross-checking this function against an independently written
  // mirror of the same shader; the two disagreed only below the waterline.
  return {
    offsetY: ddSoftFloorY(oy, 0.48, 0.09),
    normal: { x: nx / nlen, y: ny / nlen, z: nz / nlen },
  };
}

/** CPU of the vertex `ddSoftFloorY` — softplus trough limiter, same constants. */
function ddSoftFloorY(y, L, knee) {
  const a = (y + L) / Math.max(knee, 1e-4);
  if (a > 10) return y;
  return knee * Math.log(1 + Math.exp(a)) - L;
}

/**
 * Vertical displacement the DRAWN sheet applies at a world point, in metres.
 *
 * This is the function anything that floats should read. It resolves the shore
 * frame, the coast field and the depth the way `OCEAN_VERT` does, evaluates the
 * same `BAY_SWELL` stack through the same mirror, and applies the sheltered
 * harbour envelope, so a hull placed on `WATER_Y + oceanSwellHeightAt(...)`
 * sits on the surface the camera sees.
 *
 * It exists because `water/waves.js: sampleWaveHeight` does NOT. That function
 * mirrors the retired shader chunk in `water/waves.js`, which is compiled by
 * nothing in the live tree — the only importers are the two `_stash/` rollback
 * copies of `water.js`, and `p10-ocean` has a source scan that keeps it out of
 * this file. Measured at the Apostles boat stations, the two disagree by 0.13x
 * to 1.91x depending on depth, and they are uncorrelated in phase (best r =
 * 0.15 at any lag), so no gain and no offset reconciles them. Receipts in
 * `mvp/_reviews/board-aaa/probe-wave-parity.mjs`.
 *
 * Not cheap — it plans the edge massing unless a `plan` is passed. Sample it at
 * build time, or hoist the plan, rather than calling it per frame per object.
 */
export function oceanSwellHeightAt(x, z, t = OCEAN.freezeTime, city = null, plan = null) {
  const extent = city?.extent ?? { x: 272, z: 272 };
  const live = plan ?? planEdgeMassing(city ?? { extent });
  const field = coastFieldAt(x, z, extent, live);
  const front = Math.min(field.warped, field.unwarped);
  const bathymetry = oceanDepthAt(x, z, extent, live);
  const depth = Math.min(bathymetry, OCEAN.maxDepth);
  const bed = physicalSeabedDepthAt(x, z, extent, live, { field, bathymetry });
  const along = x * (1 - field.portW) + z * field.portW;
  const cf = CPU_COAST ? sampleCoastField(CPU_COAST, x, z) : null;
  const swell = paintedSwellFrameAt(along, front, depth, t, BAY_WAVE_SCALE, bed, cf ? { S: cf.S, a: cf.weight } : null).offsetY;
  return swell * harbourSwellScaleAt(field.portSea, field.baySea);
}

/** Still-water level plus the drawn swell. The Y a floating hull should ride. */
export function oceanSurfaceYAt(x, z, t = OCEAN.freezeTime, city = null, plan = null) {
  return WATER_Y + oceanSwellHeightAt(x, z, t, city, plan);
}

/* ================================================================== *
 * P14 M11 ITEM 2 — THE HULL WAKE. A DISPLACEMENT, NOT A BILLBOARD.
 *
 * MC6 pack-k, 2/10: "faceted unweathered hull plus a flat billboard wake that
 * never displaces the sea". The second half of that sentence is a fact about
 * where the wake lived: every wake this board drew was a decal PARENTED TO THE
 * HULL — `addSternWake`'s tapering strip, `addBowWave`'s crest plates, the
 * skiffs' `:wake` groups. A quad that hangs off a boat cannot deform the sea
 * because it is not the sea.
 *
 * This block is the only thing M11 adds to `outer-ocean.js`, and it is
 * deliberately one thing: a small uniform array of hull states, a field
 * function evaluated in BOTH the vertex and the fragment stage, and the
 * plumbing that fills it. W6's planar reflector, the swell stack, the depth
 * bake, the foam art and the painted plates are untouched.
 *
 *   VERTEX    `ddWakeHeight(xz)` is added to the swell's own Y displacement,
 *             so the SHEET moves. Capped at `HULL_WAKE.ampMax` (0.25 m).
 *   VERTEX    `ddWakeFoam(xz)` is evaluated on the same dense water mesh and
 *             interpolated into `cover` — the same white the breaker arcs and
 *             depth-foam contour already write. The fragment stage does not
 *             walk eight hulls for every covered pixel.
 *
 * The field is a Kelvin-ish system with its origin at the STEM, which is where
 * a real ship's wave system starts: a crest at the stem (the bow wave), a V of
 * divergent crests inside the 19.47-degree half-angle, a train of transverse
 * crests inside the same wedge, and a propeller wash astern of the transom.
 * Everything decays astern, and the foam decays over `foamRunM`.
 * ================================================================== */
export const HULL_WAKE = Object.freeze({
  /** Hard ceiling on the uniform array. The GLSL loop is this long. */
  max: 8,
  /** Kelvin half-angle, 19.47 degrees. tan / sin / cos, written once. */
  tanA: 0.353553,
  sinA: 0.333333,
  cosA: 0.942809,
  /** Vertex displacement ceiling, metres. The brief's number. */
  ampMax: 0.25,
  /** Divergent-arm, transverse and bow-crest shares of that ceiling. */
  divAmp: 0.132,
  trAmp: 0.012,
  bowAmp: 0.165,
  /** e-folding length of the crest train astern, metres. */
  decayM: 26,
  /** Divergent-arm half width at the stem, and how fast it opens astern. */
  armW0: 0.62,
  armWK: 0.021,
  /** Per-hull foam ceiling: energetic water, never a solid-white wedge. */
  foamCap: 0.58,
  /** The foam wedge fades to nothing at this distance astern of the stem. */
  foamRunM: 40,
  /** Speed at which the wake reaches full strength, m/s, and the floor. */
  speedFull: 3.6,
  speedFloor: 0.35,
  /*
   * THE REPLAY IS TIME-COMPRESSED AND THE WAKE MUST NOT BE.
   *
   * Measured on the live seafight (`M11-probe.json` walk): the navy hull runs
   * 174.9,-54 to 130.9,-152 — 107 m — in 4.2 s, peaking at 70 m/s of frame-to
   * -frame travel. That is the choreography's pace, not a ship's: a wake
   * driven by it would carry a 3 km wavelength and no visible crest at all.
   * The speed handed to the field is capped here, at 7.5 m/s (about 15 knots,
   * a patrol vessel's transit), so a hull that is under way makes a ship's
   * wake whatever the replay's own clock is doing.
   */
  speedCap: 7.5,
  /** Attack and release on the speed low pass. A wake outlives the way on. */
  tauAttack: 0.20,
  tauRelease: 2.6,
  /** Deep-water wavelength 2*pi*V^2/g, clamped to what the sheet can carry. */
  lambdaMin: 11,
  lambdaMax: 26,
  /** Slack added to each hull's own radius when the bounding circle is built. */
  boundPadM: 6,
});

/**
 * P16-W10 hull-to-sea contact. This is deliberately a separate registry from
 * HULL_WAKE: a stopped or reduced-motion hull still displaces water and keeps
 * a meniscus, while P14's speed floor is still allowed to report zero wakes.
 * Widths are water-side world metres. Hull-side paint already carries the
 * shared 0.4-0.8 m boot/wet bands; this field supplies their missing dark
 * hollow and pale collar in the water itself.
 */
export const HULL_CONTACT = Object.freeze({
  /** W20: fifteen port hulls plus the existing military contacts coexist. */
  max: W22_HULL_LIMIT,
  wetFromM: -0.08,
  wetPeakM: 0.05,
  /** W11: 0.6 m water-side meniscus so the dark ring reads at 1280×720. */
  wetToM: 0.60,
  foamFromM: 0.10,
  foamPeakM: 0.20,
  /** Pale collar ≥ 0.4 m wide (0.10 → 0.52). */
  foamToM: 0.52,
  hollowDepthM: 0.085,
  wetDarken: 0.62,
  reflectionLift: 0.08,
  foamAmt: 0.70,
  boundPadM: 1.2,
});

const WAKE_SOURCES = new Map();
const WAKE_LIVE = [];
const WAKE_BOUND = { x: 0, z: 0, r: 0 };
const HULL_CONTACT_SOURCES = new Map();
const HULL_CONTACT_LIVE = [];
const HULL_CONTACT_BOUND = { x: 0, z: 0, r: 0 };

function wakeGainFor(speed) {
  const s = Math.max(0, Number.isFinite(speed) ? speed : 0);
  return clamp01((s - HULL_WAKE.speedFloor) / (HULL_WAKE.speedFull - HULL_WAKE.speedFloor));
}
function wakeLambdaFor(speed) {
  const s = Math.max(0, Number.isFinite(speed) ? speed : 0);
  const raw = (2 * Math.PI * s * s) / 9.81;
  return Math.min(HULL_WAKE.lambdaMax, Math.max(HULL_WAKE.lambdaMin, raw));
}

function rebuildWakeLive() {
  WAKE_LIVE.length = 0;
  for (const list of WAKE_SOURCES.values()) {
    for (const h of list) {
      if (WAKE_LIVE.length >= HULL_WAKE.max) break;
      WAKE_LIVE.push(h);
    }
  }
  if (WAKE_LIVE.length === 0) {
    WAKE_BOUND.x = 0;
    WAKE_BOUND.z = 0;
    WAKE_BOUND.r = 0;
    return WAKE_LIVE;
  }
  let cx = 0;
  let cz = 0;
  for (const h of WAKE_LIVE) { cx += h.x; cz += h.z; }
  cx /= WAKE_LIVE.length;
  cz /= WAKE_LIVE.length;
  let r = 0;
  for (const h of WAKE_LIVE) {
    // A hull's own field reaches `foamRunM` astern and `tanA * foamRunM` wide.
    const reach = HULL_WAKE.foamRunM + h.halfLen * 2 + HULL_WAKE.boundPadM;
    r = Math.max(r, Math.hypot(h.x - cx, h.z - cz) + reach);
  }
  WAKE_BOUND.x = cx;
  WAKE_BOUND.z = cz;
  WAKE_BOUND.r = r;
  return WAKE_LIVE;
}

const HULL_CONTACT_CAMERA = new THREE.Vector3();
function rebuildHullContactLive(camera = HULL_CONTACT_CAMERA) {
  HULL_CONTACT_CAMERA.copy(camera);
  HULL_CONTACT_LIVE.length = 0;
  for (const list of HULL_CONTACT_SOURCES.values()) {
    for (const h of list) {
      HULL_CONTACT_LIVE.push(h);
    }
  }
  const nearest = nearestHullContacts(HULL_CONTACT_LIVE, camera);
  HULL_CONTACT_LIVE.length = 0;
  HULL_CONTACT_LIVE.push(...nearest);
  if (HULL_CONTACT_LIVE.length === 0) {
    HULL_CONTACT_BOUND.x = 0;
    HULL_CONTACT_BOUND.z = 0;
    HULL_CONTACT_BOUND.r = 0;
    return HULL_CONTACT_LIVE;
  }
  let cx = 0;
  let cz = 0;
  for (const h of HULL_CONTACT_LIVE) { cx += h.x; cz += h.z; }
  cx /= HULL_CONTACT_LIVE.length;
  cz /= HULL_CONTACT_LIVE.length;
  let r = 0;
  for (const h of HULL_CONTACT_LIVE) {
    const reach = Math.hypot(h.halfLen, h.halfBeam) + HULL_CONTACT.boundPadM;
    r = Math.max(r, Math.hypot(h.x - cx, h.z - cz) + reach);
  }
  HULL_CONTACT_BOUND.x = cx;
  HULL_CONTACT_BOUND.z = cz;
  HULL_CONTACT_BOUND.r = r;
  return HULL_CONTACT_LIVE;
}

/**
 * Register the hulls one layer is driving. `source` is a stable key per layer
 * (`'military:sea'`, `'military:yard'`), so two layers cannot clobber each
 * other and a layer that stops driving clears only its own entries. Each hull:
 *
 *     { x, z, heading, speed, halfLen, halfBeam }
 *
 * `heading` is the world XZ bearing the bow points along, in the frame
 * `f = (cos h, sin h)` over `(x, z)`; `speed` is metres per second.
 */
const WAKE_SOURCE_POOL = new Map();
export function setOceanWakeHulls(source, hulls = []) {
  let pool = WAKE_SOURCE_POOL.get(source);
  if (!pool) {
    pool = { list: [], contacts: [], rows: Array.from({ length: HULL_CONTACT.max }, () => ({})) };
    WAKE_SOURCE_POOL.set(source, pool);
  }
  const { list, contacts } = pool;
  list.length = 0; contacts.length = 0;
  for (const h of hulls ?? []) {
    if (!h || !Number.isFinite(h.x) || !Number.isFinite(h.z)) continue;
    const speed = Number.isFinite(h.speed) ? h.speed : 0;
    const gain = wakeGainFor(speed);
    const base = pool.rows[contacts.length] ?? (pool.rows[contacts.length] = {});
    base.x = h.x; base.z = h.z;
    base.heading = Number.isFinite(h.heading) ? h.heading : 0;
    base.gain = gain;
    base.halfLen = Math.max(1.2, h.halfLen ?? 6);
    base.halfBeam = Math.max(0.5, h.halfBeam ?? 2);
    base.lambda = wakeLambdaFor(speed); base.speed = speed;
    // Contact is a waterline fact, not a speed effect. Keep stopped hulls in
    // this list while preserving the inherited wake list's speed floor.
    contacts.push(base);
    if (gain > 0.001 && list.length < HULL_WAKE.max) list.push(base);
  }
  if (list.length === 0) WAKE_SOURCES.delete(source);
  else WAKE_SOURCES.set(source, list);
  if (contacts.length === 0) HULL_CONTACT_SOURCES.delete(source);
  else HULL_CONTACT_SOURCES.set(source, contacts);
  rebuildHullContactLive();
  return rebuildWakeLive();
}

export function clearOceanWakeHulls(source) {
  WAKE_SOURCE_POOL.delete(source);
  WAKE_SOURCES.delete(source);
  HULL_CONTACT_SOURCES.delete(source);
  rebuildHullContactLive();
  return rebuildWakeLive();
}

/** Read-only view of what the shader is being handed. For the instruments. */
export function oceanWakeState() {
  return {
    count: WAKE_LIVE.length,
    bound: { x: WAKE_BOUND.x, z: WAKE_BOUND.z, r: WAKE_BOUND.r },
    hulls: WAKE_LIVE.map((h) => ({ ...h })),
  };
}

/** Read-only hull-contact state; unlike the wake state it includes speed zero. */
export function oceanHullContactState() {
  return {
    count: HULL_CONTACT_LIVE.length,
    bound: {
      x: HULL_CONTACT_BOUND.x,
      z: HULL_CONTACT_BOUND.z,
      r: HULL_CONTACT_BOUND.r,
    },
    hulls: HULL_CONTACT_LIVE.map((h) => ({ ...h })),
  };
}

/**
 * CPU twin of the vertex contact field. Returns metres of downward hollow and
 * the two 0..1 water-side profiles. Elliptical distance is scaled by beam so
 * every craft gets the same physical collar width rather than a UV fraction.
 */
export function oceanHullContactAt(x, z) {
  let hollow = 0;
  let wet = 0;
  let foam = 0;
  if (HULL_CONTACT_LIVE.length === 0 || HULL_CONTACT_BOUND.r <= 0) {
    return { hollow, wet, foam };
  }
  const dbx = x - HULL_CONTACT_BOUND.x;
  const dbz = z - HULL_CONTACT_BOUND.z;
  if (dbx * dbx + dbz * dbz > HULL_CONTACT_BOUND.r * HULL_CONTACT_BOUND.r) {
    return { hollow, wet, foam };
  }
  for (const hull of HULL_CONTACT_LIVE) {
    const ca = Math.cos(hull.heading);
    const sa = Math.sin(hull.heading);
    const dx = x - hull.x;
    const dz = z - hull.z;
    const along = dx * ca + dz * sa;
    const lat = -dx * sa + dz * ca;
    if (Math.abs(along) > hull.halfLen + HULL_CONTACT.boundPadM
      || Math.abs(lat) > hull.halfBeam + HULL_CONTACT.boundPadM) continue;
    const ell = Math.hypot(along / hull.halfLen, lat / hull.halfBeam);
    const gap = (ell - 1) * hull.halfBeam;
    const w = smooth01(HULL_CONTACT.wetFromM, HULL_CONTACT.wetPeakM, gap)
      * (1 - smooth01(HULL_CONTACT.wetPeakM, HULL_CONTACT.wetToM, gap));
    const f = smooth01(HULL_CONTACT.foamFromM, HULL_CONTACT.foamPeakM, gap)
      * (1 - smooth01(HULL_CONTACT.foamPeakM, HULL_CONTACT.foamToM, gap));
    wet = Math.max(wet, w);
    foam = Math.max(foam, f);
    hollow = Math.min(hollow, -HULL_CONTACT.hollowDepthM * w);
  }
  return { hollow, wet, foam };
}

/** CPU twin of `ddHullContactGap` — metres outside the nearest hull ellipse. */
export function oceanHullContactGapAt(x, z) {
  if (HULL_CONTACT_LIVE.length === 0 || HULL_CONTACT_BOUND.r <= 0) return 1e4;
  const dbx = x - HULL_CONTACT_BOUND.x;
  const dbz = z - HULL_CONTACT_BOUND.z;
  if (dbx * dbx + dbz * dbz > HULL_CONTACT_BOUND.r * HULL_CONTACT_BOUND.r) return 1e4;
  let best = 1e4;
  for (const hull of HULL_CONTACT_LIVE) {
    const ca = Math.cos(hull.heading);
    const sa = Math.sin(hull.heading);
    const dx = x - hull.x;
    const dz = z - hull.z;
    const along = dx * ca + dz * sa;
    const lat = -dx * sa + dz * ca;
    if (Math.abs(along) > hull.halfLen + HULL_CONTACT.boundPadM
      || Math.abs(lat) > hull.halfBeam + HULL_CONTACT.boundPadM) continue;
    const ell = Math.hypot(along / hull.halfLen, lat / hull.halfBeam);
    best = Math.min(best, (ell - 1) * hull.halfBeam);
  }
  return best;
}

/**
 * The JS mirror of the two shader functions, term for term and in the same
 * order — one call returns both, because offline nobody is paying per pixel.
 * This is
 * what the transect receipt measures and what `p14-military-art` asserts; it
 * exists so the number in the report is the number the shader computes and not
 * an argument about one.
 *
 * Returns `{ h, foam }` — metres of vertical displacement and 0..1 of foam.
 */
export function oceanWakeFieldAt(x, z) {
  let h = 0;
  let foam = 0;
  let foamOverlap = 0;
  if (WAKE_LIVE.length === 0 || WAKE_BOUND.r <= 0) return { h, foam };
  const dbx = x - WAKE_BOUND.x;
  const dbz = z - WAKE_BOUND.z;
  if (dbx * dbx + dbz * dbz > WAKE_BOUND.r * WAKE_BOUND.r) return { h, foam };
  for (const hull of WAKE_LIVE) {
    const ca = Math.cos(hull.heading);
    const sa = Math.sin(hull.heading);
    const dx = x - hull.x;
    const dz = z - hull.z;
    const along = dx * ca + dz * sa;
    const lat = -dx * sa + dz * ca;
    const b = Math.abs(lat);
    const armA = Math.max(-along, 0);
    const W = HULL_WAKE.tanA * armA;
    const armW = HULL_WAKE.armW0 + HULL_WAKE.armWK * armA;
    // The coarse circle is cheap, but covers a great deal of water beside a
    // long track. Three arm widths plus the bow's own beam contains every
    // visible term and lets the shader skip its exponentials and cosines.
    if (b > Math.max(hull.halfBeam * 4.5, W + armW * 3.2)) continue;
    const a = hull.halfLen - along;
    const aa = Math.max(a, 0);
    const aStern = a - 2 * hull.halfLen;
    // The hull's own plan is excluded, so a crest cannot come up through the
    // deck and the M10 waterline receipt keeps measuring the same water.
    const ell = Math.max(
      Math.abs(along) / (hull.halfLen * 1.02),
      b / (hull.halfBeam * 0.92),
    );
    const outside = smooth01(0.80, 1.0, ell);
    if (outside <= 0.0005) continue;
    const astern = smooth01(-1.5, 1.5, a);
    const k = (2 * Math.PI) / hull.lambda;
    const armD = (b - W) / armW;
    const armE = Math.exp(-armD * armD);
    const u = armA * HULL_WAKE.cosA + b * HULL_WAKE.sinA;
    const w = Math.max(aStern, 0);
    const dec = Math.exp(-w / HULL_WAKE.decayM);
    const wedgeIn = 1 - smooth01(0.34, 0.86, b / Math.max(W, 0.6));
    const arc = aa + (b * b) / (2 * Math.max(aa, 5));
    const hDiv = Math.cos(k * u) * armE * dec;
    const hTr = Math.cos(k * arc) * wedgeIn * dec;
    const bowT = Math.exp(-((a / 2.6) ** 2));
    const bowL = Math.exp(-(((b - hull.halfBeam * 1.05) / (hull.halfBeam * 1.15)) ** 2));
    const hBow = HULL_WAKE.bowAmp * bowT * bowL;
    const g = hull.gain * outside;
    h += ((hDiv * HULL_WAKE.divAmp + hTr * HULL_WAKE.trAmp) * astern + hBow) * g;
    const foamDec = 1 - smooth01(0, HULL_WAKE.foamRunM, w);
    const armCrest = Math.max(0, Math.cos(k * u));
    // The divergent arms and the narrow prop wash carry the foam. Even a
    // low-amplitude fill across the whole wedge reads as a translucent decal
    // once four hulls overlap, so the interior stays water-coloured.
    const fArm = armE * (0.55 + 0.45 * armCrest);
    const washLat = b / Math.max(hull.halfBeam * 1.6, 0.8);
    const wash = 1.55 * Math.exp(-Math.max(aStern, 0) / 40)
      * Math.exp(-(washLat ** 4))
      * (aStern > -0.5 ? 1 : 0);
    const f = Math.min(
      HULL_WAKE.foamCap,
      Math.max(fArm, wash) * foamDec * astern * g,
    );
    if (f > 0.002) {
      foam += Math.min(HULL_WAKE.foamCap, Math.max(0, f));
      foamOverlap += 1;
    }
  }
  const cap = HULL_WAKE.ampMax;
  return {
    h: Math.max(-cap, Math.min(cap, h)),
    foam: Math.min(HULL_WAKE.foamCap, foam / Math.max(1, foamOverlap)),
  };
}

/** Metres of wake displacement at a world point. The transect's own reading. */
export function oceanWakeHeightAt(x, z) {
  return oceanWakeFieldAt(x, z).h;
}

/**
 * The surface a camera SEES: still water plus the swell plus the hull wake.
 * `oceanSurfaceYAt` deliberately stays swell-only — a hull that rode its own
 * bow wave would drive itself, which is a feedback loop and not a boat — so
 * the two are separate calls and the report quotes both.
 */
export function oceanDrawnSurfaceYAt(x, z, t = OCEAN.freezeTime, city = null, plan = null) {
  return oceanSurfaceYAt(x, z, t, city, plan) + oceanWakeHeightAt(x, z);
}

const HULL_WAKE_GLSL = /* glsl */ `
  #define DD_WAKE_N ${HULL_WAKE.max}
  uniform float uWakeCount;
  // .x .y  hull centre in world XZ    .z .w  cos / sin of the heading
  uniform vec4  uWakeHull[DD_WAKE_N];
  // .x  half length   .y  half beam   .z  wavelength   .w  gain 0..1
  uniform vec4  uWakeSpan[DD_WAKE_N];
  // .xy bounding-circle centre, .z its radius. Zero radius = the term is off.
  uniform vec3  uWakeBound;

  /*
   * ── WHY THIS IS TWO FUNCTIONS AND NOT ONE. ──
   *
   * The first cut returned vec2(height, foam) from one function and called it
   * in BOTH stages, so the fragment stage paid for the crest train it never
   * reads and the vertex stage paid for the foam it never writes. Measured on
   * the seafight pose (M11-wip-status.json cost): +4.19 ms a frame against a
   * budget of +0.8. Three changes, and they are all bookkeeping rather than
   * art: the two stages get their own function, the heading arrives as a
   * cos/sin PAIR so no shader computes a trig of a constant, and each hull
   * rejects on a squared distance before it evaluates anything at all.
   */
  bool ddWakeReject(vec2 xz, vec4 H, vec4 S, out vec2 d) {
    d = xz - H.xy;
    // A hull's field reaches 2*halfLen astern of the bow plus the foam run.
    float R = 2.0 * S.x + ${(HULL_WAKE.foamRunM + 8).toFixed(1)};
    return dot(d, d) > R * R;
  }

  float ddWakeHeight(vec2 xz) {
    if (uWakeBound.z <= 0.0 || uWakeCount < 0.5) return 0.0;
    vec2 db = xz - uWakeBound.xy;
    if (dot(db, db) > uWakeBound.z * uWakeBound.z) return 0.0;
    float acc = 0.0;
    for (int i = 0; i < DD_WAKE_N; i++) {
      if (float(i) >= uWakeCount) break;
      vec4 H = uWakeHull[i];
      vec4 S = uWakeSpan[i];
      vec2 d;
      if (ddWakeReject(xz, H, S, d)) continue;
      float along = d.x * H.z + d.y * H.w;
      float b = abs(-d.x * H.w + d.y * H.z);
      float armA = max(-along, 0.0);
      float armW = ${HULL_WAKE.armW0.toFixed(3)} + ${HULL_WAKE.armWK.toFixed(4)} * armA;
      float W = ${HULL_WAKE.tanA.toFixed(6)} * armA;
      if (b > max(S.y * 4.5, W + armW * 3.2)) continue;
      float a = S.x - along;
      float aa = max(a, 0.0);
      float w = max(a - 2.0 * S.x, 0.0);
      float ell = max(abs(along) / (S.x * 1.02), b / (S.y * 0.92));
      float outside = smoothstep(0.80, 1.0, ell);
      if (outside <= 0.0005) continue;
      float astern = smoothstep(-1.5, 1.5, a);
      float k = 6.28318530718 / S.z;
      float armD = (b - W) / armW;
      float armE = exp(-armD * armD);
      float dec = exp(-w / ${HULL_WAKE.decayM.toFixed(1)});
      float wedgeIn = 1.0 - smoothstep(0.34, 0.86, b / max(W, 0.6));
      float arc = aa + (b * b) / (2.0 * max(aa, 5.0));
      float hDiv = cos(k * (armA * ${HULL_WAKE.cosA.toFixed(6)} + b * ${HULL_WAKE.sinA.toFixed(6)}))
        * armE * dec;
      float hTr = cos(k * arc) * wedgeIn * dec;
      // pow(x, 2.0) is UNDEFINED for x < 0 in GLSL and a is negative ahead of
      // the stem, which returned NaN through clamp and max and painted the
      // whole harbour sheet white on the first live frame. Squared instead.
      float bowA = a / 2.6;
      float bowB = (b - S.y * 1.05) / (S.y * 1.15);
      float hBow = ${HULL_WAKE.bowAmp.toFixed(4)} * exp(-bowA * bowA) * exp(-bowB * bowB);
      acc += ((hDiv * ${HULL_WAKE.divAmp.toFixed(4)} + hTr * ${HULL_WAKE.trAmp.toFixed(4)})
        * astern + hBow) * S.w * outside;
    }
    return clamp(acc, -${HULL_WAKE.ampMax.toFixed(3)}, ${HULL_WAKE.ampMax.toFixed(3)});
  }

  float ddWakeFoam(vec2 xz) {
    #ifdef DD_WAKE_INTERPOLATED
      return vHullWakeFoam;
    #else
    if (uWakeBound.z <= 0.0 || uWakeCount < 0.5) return 0.0;
    vec2 db = xz - uWakeBound.xy;
    if (dot(db, db) > uWakeBound.z * uWakeBound.z) return 0.0;
    float acc = 0.0;
    float overlap = 0.0;
    for (int i = 0; i < DD_WAKE_N; i++) {
      if (float(i) >= uWakeCount) break;
      vec4 H = uWakeHull[i];
      vec4 S = uWakeSpan[i];
      vec2 d;
      if (ddWakeReject(xz, H, S, d)) continue;
      float along = d.x * H.z + d.y * H.w;
      float b = abs(-d.x * H.w + d.y * H.z);
      float armA = max(-along, 0.0);
      float armW = ${HULL_WAKE.armW0.toFixed(3)} + ${HULL_WAKE.armWK.toFixed(4)} * armA;
      float W = ${HULL_WAKE.tanA.toFixed(6)} * armA;
      if (b > max(S.y * 4.5, W + armW * 3.2)) continue;
      float a = S.x - along;
      float aStern = a - 2.0 * S.x;
      float w = max(aStern, 0.0);
      float ell = max(abs(along) / (S.x * 1.02), b / (S.y * 0.92));
      float outside = smoothstep(0.80, 1.0, ell);
      if (outside <= 0.0005) continue;
      float astern = smoothstep(-1.5, 1.5, a);
      float k = 6.28318530718 / S.z;
      float armD = (b - W) / armW;
      float armE = exp(-armD * armD);
      float foamDec = 1.0 - smoothstep(0.0, ${HULL_WAKE.foamRunM.toFixed(1)}, w);
      // Foam on the ARM sits on the arm's own crests, which run across the arm
      // rather than across the track — that is what feathers a V.
      float armCrest = max(0.0, cos(k * (armA * ${HULL_WAKE.cosA.toFixed(6)}
        + b * ${HULL_WAKE.sinA.toFixed(6)})));
      /*
       * ── WHAT A WAKE LOOKS LIKE FROM ABOVE. ──
       * Two bright divergent LINES, a turbulent patch right behind the
       * transom, and water between them that is disturbed but not white. The
       * first cut gave the interior a flat 0.30 and four overlapping wedges
       * painted the lower frame; the second gave it 0.05-0.27 and the seafight
       * still read as pale streaks. The energy belongs on the arms.
       */
      float fArm = armE * (0.55 + 0.45 * armCrest);
      float washLat = b / max(S.y * 1.6, 0.8);
      float wash = 1.55 * exp(-w / 40.0)
        * exp(-(washLat * washLat) * (washLat * washLat))
        * step(-0.5, aStern);
      float f = min(${HULL_WAKE.foamCap.toFixed(2)},
        max(fArm, wash) * foamDec * astern * S.w * outside);
      if (f > 0.002) {
        acc += clamp(f, 0.0, ${HULL_WAKE.foamCap.toFixed(2)});
        overlap += 1.0;
      }
    }
    // Each contributor receives one overlap share. Four coincident V fields
    // can reinforce geometry, but their white term cannot sum past one wake.
    return min(${HULL_WAKE.foamCap.toFixed(2)}, acc / max(overlap, 1.0));
    #endif
  }
`;

const HULL_CONTACT_GLSL = /* glsl */ `
  #define DD_HULL_CONTACT_N ${HULL_CONTACT.max}
  uniform float uHullContactCount;
  // .xy centre; .zw heading cos/sin.
  uniform vec4 uHullContactHull[DD_HULL_CONTACT_N];
  // .xy half length/beam; .z wake gain (contact itself does not depend on it).
  uniform vec4 uHullContactSpan[DD_HULL_CONTACT_N];
  uniform vec3 uHullContactBound;

  // x = negative displacement metres, y = wet/meniscus, z = pale foam collar.
  vec3 ddHullContactField(vec2 xz) {
    if (uHullContactCount < 0.5 || uHullContactBound.z <= 0.0) return vec3(0.0);
    vec2 db = xz - uHullContactBound.xy;
    if (dot(db, db) > uHullContactBound.z * uHullContactBound.z) return vec3(0.0);
    vec3 field = vec3(0.0);
    for (int i = 0; i < DD_HULL_CONTACT_N; i++) {
      if (float(i) >= uHullContactCount) break;
      vec4 H = uHullContactHull[i];
      vec4 S = uHullContactSpan[i];
      vec2 d = xz - H.xy;
      float along = d.x * H.z + d.y * H.w;
      float lat = -d.x * H.w + d.y * H.z;
      if (abs(along) > S.x + ${HULL_CONTACT.boundPadM.toFixed(1)}
        || abs(lat) > S.y + ${HULL_CONTACT.boundPadM.toFixed(1)}) continue;
      float ell = length(vec2(along / max(S.x, 0.1), lat / max(S.y, 0.1)));
      float gap = (ell - 1.0) * S.y;
      float wet = smoothstep(
        ${HULL_CONTACT.wetFromM.toFixed(2)}, ${HULL_CONTACT.wetPeakM.toFixed(2)}, gap)
        * (1.0 - smoothstep(
          ${HULL_CONTACT.wetPeakM.toFixed(2)}, ${HULL_CONTACT.wetToM.toFixed(2)}, gap));
      float foam = smoothstep(
        ${HULL_CONTACT.foamFromM.toFixed(2)}, ${HULL_CONTACT.foamPeakM.toFixed(2)}, gap)
        * (1.0 - smoothstep(
          ${HULL_CONTACT.foamPeakM.toFixed(2)}, ${HULL_CONTACT.foamToM.toFixed(2)}, gap));
      field.x = min(field.x, -${HULL_CONTACT.hollowDepthM.toFixed(3)} * wet);
      field.y = max(field.y, wet);
      field.z = max(field.z, foam);
    }
    return field;
  }

  // Metres outside the nearest registered hull ellipse. Negative is inside
  // the plan; 1e4 is "no hull". W14's crest keys off this, not the filled
  // 0.52 m collar, so a polar vertex cannot flood a whole quad with white.
  float ddHullContactGap(vec2 xz) {
    if (uHullContactCount < 0.5 || uHullContactBound.z <= 0.0) return 1e4;
    vec2 db = xz - uHullContactBound.xy;
    if (dot(db, db) > uHullContactBound.z * uHullContactBound.z) return 1e4;
    float best = 1e4;
    for (int i = 0; i < DD_HULL_CONTACT_N; i++) {
      if (float(i) >= uHullContactCount) break;
      vec4 H = uHullContactHull[i];
      vec4 S = uHullContactSpan[i];
      vec2 d = xz - H.xy;
      float along = d.x * H.z + d.y * H.w;
      float lat = -d.x * H.w + d.y * H.z;
      if (abs(along) > S.x + ${HULL_CONTACT.boundPadM.toFixed(1)}
        || abs(lat) > S.y + ${HULL_CONTACT.boundPadM.toFixed(1)}) continue;
      float ell = length(vec2(along / max(S.x, 0.1), lat / max(S.y, 0.1)));
      best = min(best, (ell - 1.0) * S.y);
    }
    return best;
  }
`;


function wakeUniformBlock() {
  const hull = [];
  const span = [];
  for (let i = 0; i < HULL_WAKE.max; i += 1) {
    hull.push(new THREE.Vector4(0, 0, 0, 0));
    span.push(new THREE.Vector4(1, 1, 12, 0));
  }
  return {
    uWakeCount: { value: 0 },
    uWakeHull: { value: hull },
    uWakeSpan: { value: span },
    uWakeBound: { value: new THREE.Vector3(0, 0, 0) },
  };
}

function hullContactUniformBlock() {
  const hull = [];
  const span = [];
  for (let i = 0; i < HULL_CONTACT.max; i += 1) {
    hull.push(new THREE.Vector4(0, 0, 0, 0));
    span.push(new THREE.Vector4(1, 1, 0, 0));
  }
  return {
    uHullContactCount: { value: 0 },
    uHullContactHull: { value: hull },
    uHullContactSpan: { value: span },
    uHullContactBound: { value: new THREE.Vector3(0, 0, 0) },
  };
}

/** Dot of analytic swell normals on either side of the wrap azimuth. */
export function seamNormalDot(city, radius = 180, t = OCEAN.freezeTime) {
  const extent = city?.extent ?? { x: 272, z: 272 };
  const plan = planEdgeMassing(city);
  const pair = seamWorldPair(extent, radius);
  const frame = (p) => {
    const field = coastFieldAt(p.x, p.z, extent, plan);
    const depth = oceanDepthAt(p.x, p.z, extent, plan);
    const along = p.x * (1 - field.portW) + p.z * field.portW;
    return paintedSwellFrameAt(along, field.sdf, depth, t);
  };
  const na = frame(pair.a).normal;
  const nb = frame(pair.b).normal;
  return na.x * nb.x + na.y * nb.y + na.z * nb.z;
}

function foamSegBounds(id) {
  const mean = RUN_UP.segMean;
  const amp = RUN_UP.segJitter;
  const b0 = id * mean + (hash2(id, 1.1) - 0.5) * amp;
  const b1 = (id + 1) * mean + (hash2(id + 1, 1.1) - 0.5) * amp;
  return [b0, b1];
}

/**
 * Irregular along-shore foam cell (12–30 m). Plate + rot-hash + scale are
 * unique per id so two cells 100 m apart never share the triple.
 * Plate UV rotation is the authored window angle (fingers down-slope);
 * only along-shore mirror + U offset are jittered. Span jitter is one
 * hash on both axes together (never independent U/V scale).
 */
export function foamSegmentAt(along) {
  const mean = RUN_UP.segMean;
  const i0 = Math.floor((Number(along) || 0) / mean);
  let id = i0;
  let b0 = i0 * mean;
  let b1 = (i0 + 1) * mean;
  for (let k = -2; k <= 2; k += 1) {
    const j = i0 + k;
    const bounds = foamSegBounds(j);
    if (along >= bounds[0] && along < bounds[1]) {
      id = j;
      b0 = bounds[0];
      b1 = bounds[1];
      break;
    }
  }
  const width = Math.max(FOAM_ART.segMin, Math.min(FOAM_ART.segMax, b1 - b0));
  const plate = hash2(id * 3.17, 2.4) < 0.5 ? 0 : 1;
  // Cell identity hash — uniqueness pin. Not the plate UV rotation.
  const rot = id + hash2(id * 5.91, 7.2);
  const jitter = hash2(id * 1.73, 11.6);
  const spanU = FOAM_ART.spanUMin + (FOAM_ART.spanUMax - FOAM_ART.spanUMin) * jitter;
  const spanV = FOAM_ART.spanVMin + (FOAM_ART.spanVMax - FOAM_ART.spanVMin) * jitter;
  const scale = spanU / FOAM_ART.spanU0;
  const uvOff = [hash2(id * 9.1, 1.2), hash2(id * 4.4, 13.8)];
  const mirror = hash2(id * 2.2, 8.1) >= 0.5 ? 1 : 0;
  const laceKey = plate === 0 ? 'laceA' : 'laceB';
  return {
    id,
    start: b0,
    end: b1,
    centre: 0.5 * (b0 + b1),
    width,
    plate,
    rot,
    scale,
    spanU,
    spanV,
    uvOff,
    mirror,
    plateAngle: FOAM_ART.windows[laceKey].angle,
  };
}

/**
 * CPU mirror of the live GLSL world-scale map. `kind` is crest | laceA | laceB.
 * U = along / spanU (+ offset/mirror). V = (front + seat) / spanV. No band
 * window, no V stretch. Crest seat is crestAnchor metres (ribbon at envelope
 * centre). Lace seat is −halfWidth of UV at the waterline. Off-plate UV is
 * luma 0 at the sampler.
 */
export function foamArtUv(kind, along, front, opts = {}) {
  const win = FOAM_ART.windows[kind];
  if (!win) return { u: 0, v: 0 };
  const a = Number.isFinite(Number(along)) ? Number(along) : 0;
  const seg = opts.seg ?? foamSegmentAt(a);
  const spanU = Math.max(Number(seg.spanU) || FOAM_ART.spanU0, 4);
  const spanV = Math.max(Number(seg.spanV) || FOAM_ART.spanV0, 4);
  let u01 = a / spanU + (seg.uvOff?.[0] ?? 0);
  if (!Number.isFinite(u01)) u01 = 0;
  u01 -= Math.floor(u01);
  if (seg.mirror) u01 = 1 - u01;
  const f = Number.isFinite(Number(front)) ? Number(front) : 0;
  const vM = kind === 'crest'
    ? f + FOAM_ART.crestAnchor
    : -f - win.halfWidth * spanV;
  let ly = vM / spanV;
  if (!Number.isFinite(ly)) ly = 0;
  if (ly > 2) ly = 2;
  else if (ly < -2) ly = -2;
  if (win.invertV) ly = -ly;
  const c = Math.cos(win.angle);
  const s = Math.sin(win.angle);
  const lx = u01 - 0.5;
  const u = win.cx + lx * c - ly * s;
  const v = win.cy + lx * s + ly * c;
  if (!Number.isFinite(u) || !Number.isFinite(v)) return { u: 0, v: 0 };
  return { u, v };
}

/**
 * Smoothstep crossfade weight for one along-shore cell. 1 in the interior,
 * 0.5 at the geometric edge, 0 past the overlap skirt.
 */
export function foamCellWeight(along, seg, overlap = FOAM_ART.overlap) {
  const span = Math.max((seg.end - seg.start) || seg.width || 0, 4);
  const u = (Number(along) - seg.centre) / span;
  return 1 - smooth01(0.5 - overlap * 0.5, 0.5 + overlap * 0.5, Math.abs(u));
}

/**
 * Fraction of an along-shore sample row through the breaker-band centre
 * that lands on plate-white. `sampleLuma(u, v)` returns 0..1 (0 off-plate).
 * Centre is the crest ribbon (ly=0), slightly landward of sdf=0 under
 * the 60/40 envelope.
 */
export function breakerBandWhiteHitRate(sampleLuma, along, opts = {}) {
  const seg = opts.seg ?? foamSegmentAt(along);
  const reach = opts.reach ?? segmentRunUpAt(seg.centre, opts.t ?? OCEAN.freezeTime);
  const n = opts.n ?? 96;
  const front = opts.front ?? (0.5 * FOAM_ART.crestSea - 0.5 * FOAM_ART.crestLand);
  const span = Math.max(seg.width, 1e-3);
  let hits = 0;
  for (let i = 0; i < n; i += 1) {
    const a = seg.start + ((i + 0.5) / n) * span;
    const uv = foamArtUv('crest', a, front, { seg, reach });
    if (sampleLuma(uv.u, uv.v) >= FOAM_ART.whiteHit) hits += 1;
  }
  return hits / n;
}

function foamTimeFromPhase(phase) {
  const p = ((Number(phase) % 1) + 1) % 1;
  return p * OCEAN.foamPeriod;
}

/** Per-segment run-up, 3–14 m, keyed to the macro swell at the cell centre. */
export function segmentRunUpAt(along, t = OCEAN.freezeTime) {
  const seg = foamSegmentAt(along);
  const k = (Math.PI * 2) / RUN_UP.swellLen;
  const phi = k * RUN_UP.swellDirX * seg.centre - RUN_UP.swellOmega * Number(t);
  const crest = 0.5 + 0.5 * Math.sin(phi);
  return FOAM_ART.runUpMin + (FOAM_ART.runUpMax - FOAM_ART.runUpMin) * (crest * crest);
}

function inBreakerArc(along) {
  const arcs = breakerArcsAt(along - 60, 120);
  for (let i = 0; i < arcs.length; i += 1) {
    if (along >= arcs[i].start && along <= arcs[i].end) return true;
  }
  return false;
}

function foamPhaseRun(phase) {
  const p = ((Number(phase) % 1) + 1) % 1;
  return p < 0.5 ? p * 2 : 2 - p * 2;
}

/** GLSL leftover = mix(0.22, 1.0, 1.0 - run). */
function foamLeftover(phase) {
  return 0.22 + 0.78 * (1 - foamPhaseRun(phase));
}

function foamLaceGate(front, reach) {
  const f = Number(front) || 0;
  const soft = FOAM_ART.envSoft;
  return (1 - smooth01(0, soft, f)) * smooth01(-reach - soft, -reach, f);
}

function foamCrestGate(front) {
  const f = Number(front) || 0;
  return smooth01(FOAM_ART.bandLandLo, FOAM_ART.bandLandHi, f)
    * (1 - smooth01(FOAM_ART.bandSeaLo, FOAM_ART.bandSeaHi, f));
}

/**
 * Along-aware authored foam. Between arcs this is exactly 0 (the zone-1
 * milk pin). Envelope `foamCoverAt` stays along-independent for R13 pins.
 * Live band straddles sdf=0 (breaker envelope 60 % land / 40 % sea); lace
 * starts at the waterline and runs landward with per-segment reach. Art
 * is sampled at world scale; this envelope only gates WHERE it may show.
 */
export function authoredFoamAt(along, front, phase = OCEAN.freezePhase) {
  if (!inBreakerArc(along)) return 0;
  const t = foamTimeFromPhase(phase);
  const reach = segmentRunUpAt(along, t);
  const f = Number(front) || 0;
  if (f > FOAM_ART.bandSeaHi + 0.5 || f < -reach - 1.0) return 0;
  const leftover = foamLeftover(phase);
  const breaker = foamCrestGate(f) * FOAM_ART.crestGain;
  const lace = foamLaceGate(f, reach) * leftover * FOAM_ART.backwashAlphaMin;
  return clamp01(Math.max(breaker, lace));
}

/** Backwash alpha at a sample. Breaker (front ≥ 0) is not the translucent path. */
export function backwashAlphaAt(along, front, phase = OCEAN.freezePhase) {
  if ((Number(front) || 0) >= 0) return 0;
  if (!inBreakerArc(along)) return 0;
  const t = foamTimeFromPhase(phase);
  const reach = segmentRunUpAt(along, t);
  const inLace = foamLaceGate(front, reach);
  if (inLace <= 0) return 0;
  const leftover = foamLeftover(phase);
  const art = 0.55 + 0.45 * hash2(along * 0.17, 3.1);
  return clamp01(inLace * leftover * (FOAM_ART.backwashAlphaMin
    + (FOAM_ART.backwashAlphaMax - FOAM_ART.backwashAlphaMin) * art));
}

function configureFoamPlate(tex) {
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Boot-time plate load. `onDone(textures|null)` — null means stay on the
 * baked blob map. Never throws. Node (no Image) is an immediate null.
 */
export function loadAuthoredFoamPlates(onDone) {
  const done = typeof onDone === 'function' ? onDone : () => {};
  if (!textureLoaderAvailable()) {
    done(null);
    return false;
  }
  let loader;
  try {
    loader = new THREE.TextureLoader();
  } catch {
    done(null);
    return false;
  }
  const keys = ['laceA', 'laceB', 'crest'];
  const out = {};
  let left = keys.length;
  let failed = false;
  const finish = () => {
    if (failed) {
      for (const k of keys) out[k]?.dispose?.();
      done(null);
      return;
    }
    done(out);
  };
  for (const key of keys) {
    const url = foamPlateHref(FOAM_ART.files[key]);
    try {
      loader.load(
        url,
        (tex) => {
          if (failed) {
            tex.dispose?.();
            return;
          }
          out[key] = configureFoamPlate(tex);
          left -= 1;
          if (left <= 0) finish();
        },
        undefined,
        () => {
          failed = true;
          left -= 1;
          if (left <= 0) finish();
        },
      );
    } catch {
      failed = true;
      left -= 1;
      if (left <= 0) finish();
    }
  }
  return true;
}

function configurePaintPlate(tex, wrapT) {
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = wrapT;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  // flipY so V=0 samples the PNG bottom (sand glass). Authored top is navy.
  tex.flipY = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Boot-time painted plates. `onDone(textures|null)` — null means stay on
 * the analytic ramp. Never throws. Node (no Image) is an immediate null.
 */
export function loadAuthoredPaintPlates(onDone) {
  const done = typeof onDone === 'function' ? onDone : () => {};
  if (!textureLoaderAvailable()) {
    done(null);
    return false;
  }
  let loader;
  try {
    loader = new THREE.TextureLoader();
  } catch {
    done(null);
    return false;
  }
  const keys = ['stripA', 'stripB', 'deep'];
  const wrapT = {
    stripA: THREE.ClampToEdgeWrapping,
    stripB: THREE.ClampToEdgeWrapping,
    deep: THREE.RepeatWrapping,
  };
  const out = {};
  let left = keys.length;
  let failed = false;
  const finish = () => {
    if (failed) {
      for (const k of keys) out[k]?.dispose?.();
      done(null);
      return;
    }
    done(out);
  };
  for (const key of keys) {
    const url = paintPlateHref(PAINTED.files[key]);
    try {
      loader.load(
        url,
        (tex) => {
          if (failed) {
            tex.dispose?.();
            return;
          }
          out[key] = configurePaintPlate(tex, wrapT[key]);
          left -= 1;
          if (left <= 0) finish();
        },
        undefined,
        () => {
          failed = true;
          left -= 1;
          if (left <= 0) finish();
        },
      );
    } catch {
      failed = true;
      left -= 1;
      if (left <= 0) finish();
    }
  }
  return true;
}

function wrapNoise(u, v, freq) {
  const a = u * freq;
  const b = v * freq;
  const x = Math.cos(a * Math.PI * 2);
  const z = Math.sin(b * Math.PI * 2);
  return hash2(x * 8.3 + freq, z * 8.3 + freq * 1.7);
}

/**
 * Where the drawn shelf may replace offshore bathymetry.
 * The sand apron continues past the old 14 m waterline note; profile coverage
 * fades from 14 m to 34 m of beach front. The sdf and waterness factors reach
 * exactly 0 before the old hard cuts (sdf 40, waterness 0.4). The port factor
 * is the existing 0.2–0.5 blend and is already 0 at 0.5.
 */
export const SEABED_SHELF = Object.freeze({
  frontFull: 14,
  frontGone: 34,
  sdfFadeStart: 37,
  sdfFadeEnd: 39.5,
  wetFadeStart: 0.42,
  wetFadeEnd: 0.58,
  portFadeStart: 0.2,
  portFadeEnd: 0.5,
  sdfCut: 40,
  wetCut: 0.4,
});

export function seabedDomainWeight(field) {
  const offshore = 1 - smooth01(SEABED_SHELF.sdfFadeStart, SEABED_SHELF.sdfFadeEnd, field.sdf);
  const afloat = smooth01(SEABED_SHELF.wetFadeStart, SEABED_SHELF.wetFadeEnd, field.waterness);
  const port = 1 - smooth01(SEABED_SHELF.portFadeStart, SEABED_SHELF.portFadeEnd, field.portW);
  return offshore * afloat * port;
}

/**
 * Wave 75 fix 3: the bed's gate follows the front's extent rule. `today` is `seabedDomainWeight(field)`; `front` the one front at the point. With no
 * spine, or beach weight 0, it is today's. Inside the board's extent it is the beach weight (mixed with today's across the label's band) times a land
 * guard: on the land side (spine d < 0) the beach's underwater slope fades out as the front rises from 0 to 2 m, so no pond lies under the grass. From
 * `BEACH_EXTENT.feather` m past either end it is today's, blending by the weight the front uses (`beachExtentWeight` = smoothstep(0, 3, extra)).
 */
export function seabedShelfGate(x, z, today, spine, front) {
  const wBeach = spine ? sampleCoastW(spine, x, z) : 0;
  if (!(wBeach > 0)) return today;
  const gateIn = wBeach >= 1 ? 1 : wBeach + (1 - wBeach) * today;
  const guard = sampleCoastD(spine, x, z) < 0 ? 1 - smooth01(BEACH_LAND_GUARD.from, BEACH_LAND_GUARD.to, front) : 1;
  const ext = beachExtentWeight(spine, x, z);
  return gateIn * guard + (today - gateIn * guard) * ext;
}

/**
 * Physical seabed metres. `sample` supplies a field and bathymetry the caller
 * already evaluated; otherwise this samples them. The shelf correction is the
 * drawn beach section blended into the existing bathymetry, and its weight is
 * 0 on both sides of the old sdf / waterness cuts.
 */
export function physicalSeabedDepthAt(x, z, extent, plan, sample = null) {
  const field = sample?.field ?? coastFieldAt(x, z, extent, plan);
  const bathymetry = sample?.bathymetry ?? oceanDepthAt(x, z, extent, plan);
  // Wave 75 fix 2: with the spine on, inside the beach label the shelf correction is keyed on d (its `profile` below), not on the old waterness
  // and sdf, which put the bed's zero metres off at the caps and the corner.
  const spine = activeCoastSpine();
  // Wave 75 fix 2: the gate is the baked beach weight (the one rule the shelf's shader and `beachSection` read): 1 inside the beach label, the old
  // weight outside it, mixed across the label's 8 m band.
  const wBeach = spine ? sampleCoastW(spine, x, z) : 0;
  const today = seabedDomainWeight(field);
  if (!(wBeach > 0) && !(today > 0)) return bathymetry;
  const sand = beachSection(x, z);
  const gate = seabedShelfGate(x, z, today, spine, sand.front);
  if (!(gate > 0)) return bathymetry;
  const profile = 1 - smooth01(SEABED_SHELF.frontFull, SEABED_SHELF.frontGone, sand.front);
  const sandDepth = Math.max(0, -sand.aboveSea);
  return bathymetry + (sandDepth - bathymetry) * gate * profile;
}

/**
 * CPU bake of the depth/waterness field. R = depth / maxDepth, G = waterness.
 * Unsigned-byte so the GPU sample matches the test walk of the same buffer.
 */
export function bakeOceanDepthData(city, plan, size = OCEAN.depthTexSize) {
  const extent = city?.extent ?? { x: 272, z: 272 };
  const hx = extent.x * 0.5;
  const hz = extent.z * 0.5;
  const R = EDGE_SEAM.outerRadius;
  const originX = hx - R;
  const originZ = hz - R;
  const span = R * 2;
  const data = new Uint8Array(size * size * 4);
  const bedDepth = new Float32Array(size * size);
  const coastClass = new Uint8Array(size * size);
  const livePlan = plan ?? planEdgeMassing(city);
  let f2Changed = 0;
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      const x = originX + ((i + 0.5) / size) * span;
      const z = originZ + ((j + 0.5) / size) * span;
      const field = coastFieldAt(x, z, extent, livePlan);
      const d = oceanDepthAt(x, z, extent, livePlan);
      // RGBA below stays on `d` and `field`. Physical metres are a separate
      // continuous shelf join; they do not alter the wave-map bytes.
      const physicalDepth = physicalSeabedDepthAt(x, z, extent, livePlan, {
        field, bathymetry: d,
      });
      const w = field.waterness;
      // taste-r1 (W14-A, F2): on the remote coast, where the shelf and the port have no say and the point is more
      // than 60 m off the board, the bed never sits below the DRAWN land: min(physical, WATER_Y - surroundHeight).
      // That is what lets the coast field (water/coast-field.js) find the shore lane C raises. RGBA stays as it was.
      let bedMetres = physicalDepth;
      if (w >= 0.20 && w <= 0.65 && field.portW < 0.5
        && Math.max(Math.abs(x - hx) - hx, Math.abs(z - hz) - hz) > 60
        && seabedDomainWeight(field) <= 0) {
        bedMetres = Math.min(physicalDepth, Math.max(0, WATER_Y - surroundHeightAt(x, z, extent, livePlan)));
        if (bedMetres !== physicalDepth) f2Changed += 1;
      }
      bedDepth[j * size + i] = bedMetres;
      // Coast class for the coast field: 1 a wall or quay (the port), 0 the drawn beach shelf, 0.5 everything natural.
      coastClass[j * size + i] = field.portW > 0.5 ? 255 : seabedDomainWeight(field) > 0.5 ? 0 : 128;
      const o = (j * size + i) * 4;
      data[o] = Math.round(clamp01(d / OCEAN.maxDepth) * 255);
      data[o + 1] = Math.round(clamp01(w) * 255);
      // B = shore-clamped warpedFront, A = unwarpedFront. The live shaders
      // classify and displace with min(warpedFront, unwarpedFront).
      data[o + 2] = Math.round(
        clamp01((field.warped - COAST_SDF.sdfOrigin) / COAST_SDF.sdfSpan) * 255,
      );
      data[o + 3] = Math.round(
        clamp01((field.unwarped - COAST_SDF.sdfOrigin) / COAST_SDF.sdfSpan) * 255,
      );
    }
  }
  return { data, bedDepth, coastClass, originX, originZ, span, size, f2Changed };
}

// taste-r1 (W15 fix): wet-edge quads whose midpoint has a hinterland coast coordinate under this many metres are dropped.
const WET_EDGE_RIM_DROP_QM = 32;

/**
 * P16-W7 land-side wet edge. March the zero contour already baked for the
 * ocean instead of inventing a second coastline. Each short quad starts just
 * landward of still water and follows the crust surface, capped at +0.4 m;
 * shelves above that cap occlude it naturally. One mesh / one draw call.
 */
export function buildWetEdgeGeometry(city, plan, depthBake, quality = 'high') {
  const extent = city?.extent ?? { x: 272, z: 272 };
  const livePlan = plan ?? planEdgeMassing(city);
  const bake = depthBake ?? bakeOceanDepthData(
    city,
    livePlan,
    quality === 'low' ? 256 : quality === 'medium' ? 512 : OCEAN.depthTexSize,
  );
  const { data, size, originX, originZ, span } = bake;
  const step = quality === 'low' ? 2 : 2;
  const positions = [];
  const indices = [];
  // x marks the selected sand contact, y feathers its opacity across the
  // band and at the two ends. Every retained cliff/port vertex stays (0, 0).
  const beachResponse = [];
  const wetShelf = []; // taste W71: one keep per vertex, only when WET_EDGE_SHELF.attr
  let segmentCount = 0;
  // Wave 78 (2b-2, COAST_SPINE on only): inside the beach weight the band is traced on the spine's d and seated on the drawn sand
  // (water/wet-edge-spine.js); the contour quads below that lie there (weight >= WET_EDGE_SPINE.replaceWeight) are not emitted. Null with the switch off.
  // The active field must be this city's (the cache returns the same object for it); a stale field of another city, as a test can leave, is not read.
  const activeField = COAST_SPINE.on ? activeCoastSpine() : null;
  const spineField = activeField && getCoastSpine(city, livePlan) === activeField ? activeField : null;

  const offset = (i, j) => (j * size + i) * 4;
  const frontAt = (i, j) => {
    const o = offset(i, j);
    const packed = Math.min(data[o + 2], data[o + 3]) / 255;
    return packed * COAST_SDF.sdfSpan + COAST_SDF.sdfOrigin;
  };
  const waterAt = (i, j) => data[offset(i, j) + 1] / 255;
  const pointAt = (i, j) => ({
    x: originX + ((i + 0.5) / size) * span,
    z: originZ + ((j + 0.5) / size) * span,
  });
  const edgePoint = (edge, corners, values) => {
    const pair = edge === 0 ? [0, 1]
      : edge === 1 ? [1, 2]
        : edge === 2 ? [2, 3] : [3, 0];
    const a = pair[0];
    const b = pair[1];
    const den = values[a] - values[b];
    const t = Math.abs(den) < 1e-6 ? 0.5 : Math.max(0, Math.min(1, values[a] / den));
    return {
      x: corners[a].x + (corners[b].x - corners[a].x) * t,
      z: corners[a].z + (corners[b].z - corners[a].z) * t,
    };
  };
  // Corners are bottom-left, bottom-right, top-right, top-left. Entries name
  // the two cell edges joined by each marching-squares case.
  const cases = [
    [], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[3, 2], [0, 1]],
    [[0, 2]], [[3, 2]], [[2, 3]], [[0, 2]], [[0, 3], [1, 2]],
    [[1, 2]], [[1, 3]], [[0, 1]], [[3, 0]], [],
  ];
  const wetY = (x, z) => {
    const ground = surroundHeightAt(x, z, extent, livePlan);
    return Math.min(
      WATER_Y + WET_EDGE.riseM + 0.012,
      Math.max(WATER_Y + 0.012, ground + 0.012),
    );
  };
  const smooth = (a, b, value) => {
    const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  // `beachSection` mirrors the authored CPU defaults, but the mounted sand
  // program uses a .28 cusp and a power bathymetry where the CPU mirror uses
  // .175 and a cubic ramp. Recover only the dry part of this main-beach
  // section, then apply the actual static vertex program's two live values.
  // Corner and cove operations are identity inside the selected reach.
  const visibleBeachY = (x, z) => {
    const section = beachSection(x, z);
    // taste-r1 (W14-A, interface I2b): once lane B's CPU section IS the drawn sand, the correction below is not applied twice.
    if (sandMod.SAND_TWIN?.live) return section.y;
    const { along, front } = section;
    const f = Math.max(front, 0);
    const w = smooth(1, 14, front);
    const cpuRamp = Math.min(f / 165, 1);
    const cpuDepth = Math.max(0, 9 * cpuRamp * cpuRamp * (3 - 2 * cpuRamp)
      - Math.exp(-(((f - 55) / 26) ** 2)) * 1.35);
    const oldBed = -(0.04 + Math.min(cpuDepth, 0.62));
    const oldH = section.y - SHORE.sandY;
    const oldDry = w < 1 ? (oldH - oldBed * w) / (1 - w) : 0;
    const cuspSignal = Math.sin(along * 0.1963 + 0.7) * 0.60
      + Math.sin(along * 0.2992 + 2.3) * 0.28
      + Math.sin(along * 0.0921 - 1.1) * 0.34;
    const cuspEnv = smooth(-26, -9, front) * (1 - smooth(1, 11, front));
    const dry = oldDry + cuspSignal * (0.28 - 0.175) * cuspEnv
      * smooth(-26, -21.5, front);
    const shaderRamp = Math.pow(Math.min(f / 165, 1), 0.78) * 9;
    const bar = (f - 55) / 26;
    const shaderDepth = Math.max(shaderRamp - 1.35 * Math.exp(-bar * bar), 0.02);
    const shaderBed = -(0.04 + Math.min(shaderDepth, 0.62));
    return SHORE.sandY + Math.max(dry * (1 - w) + shaderBed * w, -0.66);
  };
  // The main east beach is a displaced sand shelf. The generic surround
  // height is flat at the waterline here and makes its wet strip hover over
  // the visible sand. Only the sandy land strip is seated to that shelf;
  // sector/cliff wet walls and the other coasts keep their original geometry.
  const beachBlend = (x, z) => city?.waterEdge === 'east'
    && x > extent.x + 28 && x < extent.x + 75
    ? smooth(68, 84, z) * (1 - smooth(180, 192, z))
    : 0;
  // taste W71 (WET_EDGE_SHELF): 1 keeps a decal point, 0 drops it. Inside the city shelf's footprint (the mesh `_buildSandShelf` builds:
  // along -extent.z/2 +- (extent.z + cornerWrapR)/2, shore from its inland to waterFromWall + 14 + the 18 m apron) the shelf already
  // paints its own wet band, read from its CPU twin: `clip` drops where its front is seaward of `lo`, `shelf` drops all of it, `unseated`
  // drops what `beachBlend` does not seat on the shelf (`seated`, the larger of its weights at the two ends, under `seat`).
  const shelfOn = WET_EDGE_SHELF.active && city?.waterEdge === 'east'; // the shelf is built for the east beach only, as `beachBlend` is
  const shelfAttr = WET_EDGE_SHELF.attr;
  const shelfKeep = (x, z, seated = 0) => {
    const sec = beachSection(x, z);
    const halfAlong = (extent.z + (SHORE.cornerWrapR ?? 88)) * 0.5;
    const inside = Math.min(
      sec.along + extent.z * 0.5 + halfAlong,
      extent.z * 0.5 + halfAlong - sec.along,
      sec.shore - Math.max(0.5, SHORE.wallDeep * 0.25 - 3),
      SHORE.waterFromWall + 14 + 18 - sec.shore,
    );
    const fade = WET_EDGE_SHELF.fade;
    const domain = fade > 0 ? smooth(0, fade, inside) : (inside > 0 ? 1 : 0);
    if (domain <= 0) return 1;
    if (WET_EDGE_SHELF.mode === 'unseated') return seated >= WET_EDGE_SHELF.seat ? 1 : 1 - domain;
    if (WET_EDGE_SHELF.mode === 'shelf') return 1 - domain;
    const lo = WET_EDGE_SHELF.lo;
    const past = fade > 0 ? smooth(lo - fade, lo, sec.front) : (sec.front > lo ? 1 : 0);
    return 1 - domain * past;
  };
  // Four decal vertices [x, z] -> their keeps, or null when the quad is dropped (no fade: judged at its centre).
  const shelfQuad = (pts, seated = 0) => {
    if (!shelfOn) return [1, 1, 1, 1];
    if (!shelfAttr) {
      const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) * 0.25;
      const cz = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) * 0.25;
      return shelfKeep(cx, cz, seated) < 0.5 ? null : [1, 1, 1, 1];
    }
    const k = pts.map(([x, z]) => shelfKeep(x, z, seated));
    return Math.max(...k) < 0.003 ? null : k;
  };
  const pushSegment = (p0, p1, mode = 'land') => {
    const dx = p1.x - p0.x;
    const dz = p1.z - p0.z;
    const len = Math.hypot(dx, dz);
    if (!(len > 0.05) || len > (span / size) * step * 2.2) return;
    let nx = -dz / len;
    let nz = dx / len;
    const mx = (p0.x + p1.x) * 0.5;
    const mz = (p0.z + p1.z) * 0.5;
    // Do not lay the decal inside the playable board. Both authored coasts
    // live outside it, including the short port face at four metres.
    const outside = Math.max(-mx, mx - extent.x, -mz, mz - extent.z);
    if (outside < -0.5) return;
    const centreX = extent.x * 0.5;
    const centreZ = extent.z * 0.5;
    if (Math.hypot(mx - centreX, mz - centreZ) > EDGE_SEAM.outerRadius - span / size) return;
    // taste-r1 (W15 fix, land): where the hinterland coast rim ribbon (fringe/coast-rim.js) draws the shore, the film
    // is its own sand and this strip showed through it as a straight grey stripe (x 316.5 to 319.6, z 301 to 340).
    // The ribbon spans coast coordinate -3 to 26 m; the city beach decal sits at 40 m and more, so it is untouched.
    // Switch-off: set WET_EDGE_RIM_DROP_QM to -1e9 (nothing dropped).
    if (mode === 'land') {
      const rimHere = coastRimAt(mx, mz, extent, livePlan);
      if (rimHere.valid && rimHere.qm < WET_EDGE_RIM_DROP_QM) return;
      if (spineField && coastSpineWaterWeight(mx, mz, spineField) >= WET_EDGE_SPINE.replaceWeight) return; // wave 78: the spine's band is here
    }
    const probe = 0.8;
    const plusField = coastFieldAt(mx + nx * probe, mz + nz * probe, extent, livePlan);
    const minusField = coastFieldAt(mx - nx * probe, mz - nz * probe, extent, livePlan);
    const plus = mode === 'wall' ? plusField.waterness : plusField.sdf;
    const minus = mode === 'wall' ? minusField.waterness : minusField.sdf;
    // Lower SDF / lower waterness is landward.
    if (plus > minus) {
      nx = -nx;
      nz = -nz;
    }
    const inset = 0.06;
    if (mode === 'wall') {
      const base = positions.length / 3;
      const y0 = WATER_Y - 0.025;
      const y1 = WATER_Y + WET_EDGE.riseM;
      positions.push(
        p0.x + nx * inset, y0, p0.z + nz * inset,
        p1.x + nx * inset, y0, p1.z + nz * inset,
        p0.x + nx * inset, y1, p0.z + nz * inset,
        p1.x + nx * inset, y1, p1.z + nz * inset,
      );
      beachResponse.push(0, 0, 0, 0, 0, 0, 0, 0);
      if (shelfAttr) wetShelf.push(1, 1, 1, 1);
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      segmentCount += 1;
      return;
    }
    if (Math.max(beachBlend(p0.x, p0.z), beachBlend(p1.x, p1.z)) > 0) {
      // Sample the visible static sand section at sub-metre intervals. A
      // narrower, sloped contact film submerges naturally wherever the sand
      // falls under still water; the long strip can no longer read as a flat
      // teal ledge across the beach's cross-section.
      const pieces = Math.max(1, Math.ceil(len / 0.68));
      for (let piece = 0; piece < pieces; piece += 1) {
        const a = piece / pieces;
        const b = (piece + 1) / pieces;
        const at = (t) => ({ x: p0.x + dx * t, z: p0.z + dz * t });
        const pa = at(a);
        const pb = at(b);
        for (let lane = 0; lane < 2; lane += 1) {
          const contact = (p, across) => {
            const t = beachBlend(p.x, p.z);
            const oldOffset = inset + (WET_EDGE.landWidthM - inset) * across;
            const newOffset = 0.40 + (2.05 - 0.40) * across;
            const oldX = p.x + nx * oldOffset;
            const oldZ = p.z + nz * oldOffset;
            const x = p.x + nx * (oldOffset + (newOffset - oldOffset) * t);
            const z = p.z + nz * (oldOffset + (newOffset - oldOffset) * t);
            const oldY = wetY(oldX, oldZ);
            const sandY = visibleBeachY(x, z) + 0.010;
            return [x, oldY + (sandY - oldY) * t, z];
          };
          const va = contact(pa, lane / 2);
          const vb = contact(pb, lane / 2);
          const vc = contact(pa, (lane + 1) / 2);
          const vd = contact(pb, (lane + 1) / 2);
          const keeps = shelfQuad([[va[0], va[2]], [vb[0], vb[2]], [vc[0], vc[2]], [vd[0], vd[2]]],
            Math.max(beachBlend(pa.x, pa.z), beachBlend(pb.x, pb.z)));
          if (!keeps) continue;
          if (shelfAttr) wetShelf.push(...keeps);
          const base = positions.length / 3;
          positions.push(...va, ...vb, ...vc, ...vd);
          const fadeAt = (p, across) => beachBlend(p.x, p.z)
            * Math.max(0, 1 - Math.abs(across - 0.5) * 2);
          beachResponse.push(
            1, fadeAt(pa, lane / 2), 1, fadeAt(pb, lane / 2),
            1, fadeAt(pa, (lane + 1) / 2), 1, fadeAt(pb, (lane + 1) / 2),
          );
          const up = (vc[2] - va[2]) * (vb[0] - va[0])
            - (vc[0] - va[0]) * (vb[2] - va[2]);
          if (up > 0) {
            indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
          } else {
            indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
          }
          segmentCount += 1;
        }
      }
      return;
    }
    const q0 = {
      x: p0.x + nx * WET_EDGE.landWidthM,
      z: p0.z + nz * WET_EDGE.landWidthM,
    };
    const q1 = {
      x: p1.x + nx * WET_EDGE.landWidthM,
      z: p1.z + nz * WET_EDGE.landWidthM,
    };
    // wave 78 (fix 2): the quad's whole footprint (its two triangles' centres and its own) is judged against the replace weight, not only the contour's midpoint
    if (spineField) {
      const cw = (x, z) => coastSpineWaterWeight(x, z, spineField);
      if (Math.max(cw((p0.x + p1.x + q0.x) / 3, (p0.z + p1.z + q0.z) / 3), cw((p1.x + q0.x + q1.x) / 3, (p1.z + q0.z + q1.z) / 3),
        cw((p0.x + p1.x + q0.x + q1.x) / 4, (p0.z + p1.z + q0.z + q1.z) / 4)) >= WET_EDGE_SPINE.replaceWeight) return;
    }
    const keeps = shelfQuad([[p0.x, p0.z], [p1.x, p1.z], [q0.x, q0.z], [q1.x, q1.z]]);
    if (!keeps) return;
    if (shelfAttr) wetShelf.push(...keeps);
    const base = positions.length / 3;
    positions.push(
      p0.x + nx * inset, wetY(p0.x, p0.z), p0.z + nz * inset,
      p1.x + nx * inset, wetY(p1.x, p1.z), p1.z + nz * inset,
      q0.x, wetY(q0.x, q0.z), q0.z,
      q1.x, wetY(q1.x, q1.z), q1.z,
    );
    beachResponse.push(0, 0, 0, 0, 0, 0, 0, 0);
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    segmentCount += 1;
  };

  const pushCase = (corners, values, mode) => {
    let mask = 0;
    for (let k = 0; k < 4; k += 1) if (values[k] >= 0) mask |= 1 << k;
    if (mask === 0 || mask === 15) return;
    for (const [a, b] of cases[mask]) {
      pushSegment(edgePoint(a, corners, values), edgePoint(b, corners, values), mode);
    }
  };

  for (let j = 0; j + step < size; j += step) {
    for (let i = 0; i + step < size; i += step) {
      const ij = [[i, j], [i + step, j], [i + step, j + step], [i, j + step]];
      const frontValues = ij.map(([ii, jj]) => frontAt(ii, jj));
      const waterValues = ij.map(([ii, jj]) => waterAt(ii, jj));
      const maxWater = Math.max(...waterValues);
      const corners = ij.map(([ii, jj]) => pointAt(ii, jj));
      if (maxWater >= 0.40) pushCase(corners, frontValues, 'land');
      // The shroud / transport headlands are a sector coast: their SDF stays
      // offshore while waterness crosses the same 0.55 cut used by the crust.
      // A 0.4 m vertical wet face is the honest land-side band on that cliff.
      // WET_EDGE.walls is off: the vertical 0.4 m quads stood on the straight
      // waterness contour of the sector coast, not on any cliff, and rendered as
      // dark teal panels rising out of the water beside the Apostles. Real cliffs
      // carry their own wet band (fringe:apostles:cliff-wet, the port wet-collar).
      if (WET_EDGE.walls && Math.max(...frontValues) > 0) {
        pushCase(corners, waterValues.map((w) => w - OCEAN.waternessCut), 'wall');
      }
    }
  }

  const spineIndexStart = indices.length; // wave 78: the old contour quads are indices [0, this); the spine's band follows
  if (spineField) {
    segmentCount += appendWetEdgeSpine(spineField, { positions, beachResponse, indices }, { wetShelf: shelfAttr ? wetShelf : null, quality });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aWetBeach',new THREE.Float32BufferAttribute(beachResponse, 2));
  if (shelfAttr) geometry.setAttribute('aWetShelf', new THREE.Float32BufferAttribute(wetShelf, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData.wetHeightM = WET_EDGE.riseM;
  geometry.userData.wetWidthM = WET_EDGE.landWidthM;
  geometry.userData.segments = segmentCount;
  if (spineField) geometry.userData.spineIndexStart = spineIndexStart; // wave 78: set with the switch on only
  return { geometry, triangles: segmentCount * 2, segments: segmentCount };
}

/** Seamless foam mask (boot only). Harder blobs / higher lacunarity (R11). */
export function bakeFoamMapData(size = OCEAN.foamTexSize) {
  const data = new Uint8Array(size * size * 4);
  const ca = Math.cos(0.37);
  const sa = Math.sin(0.37);
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      const u0 = i / size;
      const v0 = j / size;
      const wu = wrapNoise(u0, v0, 1.7) - 0.5;
      const wv = wrapNoise(u0 + 0.31, v0 + 0.17, 1.9) - 0.5;
      const ur = (u0 - 0.5) * ca - (v0 - 0.5) * sa + 0.5 + wu * 0.08;
      const vr = (u0 - 0.5) * sa + (v0 - 0.5) * ca + 0.5 + wv * 0.08;
      let n = 0;
      n += wrapNoise(ur, vr, 4) * 0.34;
      n += wrapNoise(ur + 0.19, vr + 0.27, 11) * 0.28;
      n += wrapNoise(ur + 0.41, vr + 0.09, 27) * 0.22;
      n += wrapNoise(ur + 0.63, vr + 0.52, 61) * 0.10;
      n += wrapNoise(ur + 0.07, vr + 0.81, 97) * 0.06;
      // Tight S-curve: bipolar clumps, not a grey wash. Coverage ~15%.
      let blob = smooth01(0.50, 0.58, n);
      blob *= smooth01(0.30, 0.42, wrapNoise(ur + 0.8, vr + 0.2, 31));
      blob *= 0.15 + 0.85 * smooth01(0.28, 0.46, wrapNoise(ur * 2.1 + 0.4, vr + 0.55, 17));
      const v255 = Math.round(clamp01(blob) * 255);
      const o = (j * size + i) * 4;
      data[o] = v255;
      data[o + 1] = v255;
      data[o + 2] = v255;
      data[o + 3] = 255;
    }
  }
  return data;
}

function makeDataTex(data, size, wrap) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.wrapS = wrap;
  tex.wrapT = wrap;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false;
  return tex;
}

function rayToSquare(az, hx, hz) {
  const dx = Math.sin(az);
  const dz = Math.cos(az);
  const tx = Math.abs(dx) < 1e-9 ? Infinity : hx / Math.abs(dx);
  const tz = Math.abs(dz) < 1e-9 ? Infinity : hz / Math.abs(dz);
  return Math.min(tx, tz);
}

function hitBoardEdge(az) {
  const dx = Math.sin(az);
  const dz = Math.cos(az);
  const tx = Math.abs(dx) < 1e-9 ? Infinity : 1 / Math.abs(dx);
  const tz = Math.abs(dz) < 1e-9 ? Infinity : 1 / Math.abs(dz);
  if (tx < tz) return dx > 0 ? 'east' : 'west';
  return dz > 0 ? 'south' : 'north';
}

/**
 * Polar-annulus quad indices, wound counter-clockwise as seen from +Y.
 *
 * `a` inner/this-az, `b` inner/next-az, `c` outer/this-az, `e` outer/next-az.
 * The previous order (a,b,c / b,e,c) faced −Y, so FrontSide produced zero
 * fragments from every camera above the sheet.
 */
export function pushPolarQuad(indices, w, a, b, c, e) {
  indices[w] = a;
  indices[w + 1] = c;
  indices[w + 2] = b;
  indices[w + 3] = b;
  indices[w + 4] = c;
  indices[w + 5] = e;
  return w + 6;
}

/** True when a fringe mesh paints water or terrain the one-ocean/crust owns. */
export function isHiddenFringeWaterName(name) {
  if (!name) return false;
  if (name === OCEAN.hiddenSurfMesh) return true;
  if (name === OCEAN.hiddenPortWater) return true;
  if (name === OCEAN.hiddenOpenBayDrape) return true;
  if (name === OCEAN.hiddenFarSea) return true;
  if (name === OCEAN.hiddenSwellGlitter) return true;
  if (name === OCEAN.hiddenNearAnnulus) return true;
  // R5B: retire the landmark's broad surge pads and opaque raised collars
  // through the existing one-ocean visibility contract. Keep the rock mesh,
  // its eroded dark foot intact. R5C also cuts the remaining white collar:
  // it still spans the arch opening and cove shelf after the surge pads go.
  if (/^fringe:apostle:\d+:(?:foam|finger:\d+|aerated|collar|wet-foot|tide-mark|spray.*)$/.test(name)) return true;
  if (/^fringe:apostle:\d+:leg-[LR]:(?:wet-foot|tide-mark)$/.test(name)) return true;
  if (/^fringe:apostles:cliff-surge:\d+:(?:foam|finger:\d+|aerated|collar|spray.*)$/.test(name)) return true;
  if (name.startsWith(OCEAN.hiddenSwellCrestPrefix)) return true;
  return false;
}

/**
 * Radial knots in metres from the board rim. Dense through the surf and
 * the 90 m nearshore band, then geometric coarsening to the crust rim.
 */
export function oceanRadialKnots(inner, outer, quality = 'high') {
  const span = Math.max(40, outer - inner);
  const low = quality === 'low';
  const medium = quality === 'medium';
  // WATER LAW mesh budget: the swell is 24 m and the chop is fragment-only, so the
  // sheet needs about 1 m through the surf and 6 m offshore, not 0.72 m and 3.5 m.
  const surfStep = low ? 2.4 : medium ? 1.4 : 1.4;
  const apronStep = low ? 3.2 : medium ? 2.4 : 2.0;
  const face = SHORE.waterFromWall;
  const surfFrom = 4;
  const surfTo = face + 36;
  const nearTo = face + COAST_SDF.nearshoreM;
  const knots = [0];
  let s = 0;
  while (s < surfFrom - 1e-4) {
    s = Math.min(s + apronStep, surfFrom);
    knots.push(s);
  }
  while (s < surfTo - 1e-4) {
    s = Math.min(s + surfStep, surfTo);
    knots.push(s);
  }
  let step = low ? 3.2 : medium ? 2.6 : 2.6;
  while (s < Math.min(nearTo, span) - 1e-4) {
    s = Math.min(s + step, Math.min(nearTo, span));
    knots.push(s);
  }
  // W22: sample the 14 m component with at least four radial vertices offshore.
  // Round two budget: the sheet is at most 120k triangles (TASTE-BIBLE section 6). The swell is
  // shaded analytically per pixel (water/sea.js), so the 2-8 m mesh only has to carry the 0.14 m
  // vertex displacement, not the normals.
  const maxStep = low ? 7 : medium ? 8.5 : 8.5;
  while (s < span - 1e-4) {
    step = Math.min(step * (low ? 1.16 : 1.2), maxStep);
    s = Math.min(s + step, span);
    knots.push(s);
  }
  return knots;
}

/** Adaptive azimuths: fine on water edges, coarse on land edges. */
export function oceanAzimuths(plan, quality = 'high') {
  const water = new Set(plan.waterEdges);
  const fine = quality === 'low' ? 0.028 : quality === 'medium' ? 0.016 : 0.016;
  const coarse = quality === 'low' ? 0.07 : quality === 'medium' ? 0.045 : 0.04;
  const knots = [-Math.PI];
  let az = -Math.PI;
  while (az < Math.PI - 1e-6) {
    const edge = hitBoardEdge(az + fine * 0.5);
    const step = water.has(edge) ? fine : coarse;
    az = Math.min(az + step, Math.PI);
    knots.push(az);
  }
  if (knots[knots.length - 1] < Math.PI - 1e-8) knots.push(Math.PI);
  return knots;
}

/**
 * Live ocean sheet. Graded polar annulus — dense through the nearshore
 * band, coarse offshore. This is the geometry the scene draws.
 */
export function buildOceanGeometry(city, quality = 'high') {
  const extent = city.extent ?? { x: 272, z: 272 };
  const plan = planEdgeMassing(city);
  const hx = extent.x * 0.5;
  const hz = extent.z * 0.5;
  const outer = EDGE_SEAM.outerRadius;
  const azAll = oceanAzimuths(plan, quality);
  // First / last knots are the wrap pair (±π). Drop the duplicate last
  // ring and index the last sector back onto ring 0 so the polar seam
  // shares vertices — no shading or displacement crease.
  const wrapPair = Math.abs(azAll[0] + Math.PI) < 1e-8
    && Math.abs(azAll[azAll.length - 1] - Math.PI) < 1e-8;
  const azs = wrapPair ? azAll.slice(0, -1) : azAll.slice();
  const inner0 = rayToSquare(azs[0], hx, hz);
  const knots = oceanRadialKnots(inner0, outer, quality);
  const ringN = azs.length;
  const radN = knots.length;
  const positions = new Float32Array(ringN * radN * 3);
  const uvs = new Float32Array(ringN * radN * 2);
  let p = 0;
  let t = 0;
  for (let ia = 0; ia < ringN; ia += 1) {
    const az = azs[ia];
    const inner = rayToSquare(az, hx, hz);
    const span = outer - inner;
    for (let ir = 0; ir < radN; ir += 1) {
      const offset = Math.min(knots[ir], span);
      const r = inner + offset;
      positions[p] = hx + Math.sin(az) * r;
      positions[p + 1] = WATER_Y;
      positions[p + 2] = hz + Math.cos(az) * r;
      uvs[t] = ia / Math.max(1, ringN);
      uvs[t + 1] = offset / span;
      p += 3;
      t += 2;
    }
  }
  const azCount = ringN;
  const radCount = radN - 1;
  const indices = new Uint32Array(azCount * radCount * 6);
  let w = 0;
  for (let ia = 0; ia < azCount; ia += 1) {
    const iaNext = ia + 1 === azCount ? 0 : ia + 1;
    for (let ir = 0; ir < radCount; ir += 1) {
      const a = ia * radN + ir;
      const b = iaNext * radN + ir;
      const c = a + 1;
      const e = b + 1;
      w = pushPolarQuad(indices, w, a, b, c, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeBoundingSphere();
  return {
    geometry: geo,
    azCount,
    radCount,
    triangles: azCount * radCount * 2,
    knots,
    azs,
    welded: wrapPair,
    radN,
    ringN,
  };
}

/**
 * Count live verts in the nearshore band (sdf in [0, 90] or depth < 12
 * with sdf > -4). Used by the honest p10 pin — not a second mesh.
 */
export function nearshoreStats(geometry, city, plan) {
  const extent = city.extent ?? { x: 272, z: 272 };
  const livePlan = plan ?? planEdgeMassing(city);
  const pos = geometry.getAttribute('position').array;
  let near = 0;
  let total = 0;
  for (let i = 0; i < pos.length; i += 3) {
    total += 1;
    const x = pos[i];
    const z = pos[i + 2];
    const sdf = coastSdf(x, z, extent, livePlan);
    if (sdf > -4 && sdf <= COAST_SDF.nearshoreM) {
      near += 1;
    }
  }
  return { near, total };
}

function buildBeachFoamGeometry(city, quality = 'high') {
  const extent = city.extent ?? { x: 272, z: 272 };
  const azCount = quality === 'low' ? 72 : OCEAN.foamAz;
  const radCount = quality === 'low' ? 4 : OCEAN.foamRad;
  const hx = extent.x * 0.5;
  const hz = extent.z * 0.5;
  const face = SHORE.waterFromWall;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let ia = 0; ia <= azCount; ia += 1) {
    const az = (ia / azCount) * Math.PI * 2 - Math.PI;
    const boardR = rayToSquare(az, hx, hz);
    const r0 = boardR + Math.max(2, face - 22);
    const r1 = boardR + face + 42;
    for (let ir = 0; ir <= radCount; ir += 1) {
      const u = ir / radCount;
      // Cluster rows on the waterline (u=0.55 of the ribbon).
      const t = u * u * (3 - 2 * u);
      const clustered = t * 0.42 + u * 0.58;
      const r = r0 + (r1 - r0) * clustered;
      positions.push(hx + Math.sin(az) * r, WATER_Y + 0.018, hz + Math.cos(az) * r);
      uvs.push(ia / azCount, u);
    }
  }
  const stride = radCount + 1;
  for (let ia = 0; ia < azCount; ia += 1) {
    for (let ir = 0; ir < radCount; ir += 1) {
      const a = ia * stride + ir;
      const b = a + stride;
      const c = a + 1;
      const e = b + 1;
      // Same +Y winding as the ocean sheet (foam is DoubleSide, but keep consistent).
      indices.push(a, c, b, b, c, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return { geometry: geo, triangles: azCount * radCount * 2 };
}

function wallOrigin(edge, extent) {
  const origin = boardEdgeOrigin(edge, extent);
  const { seaward } = edgeAxes(edge);
  return origin.clone().addScaledVector(seaward, SHORE.wallOffset);
}

const OCEAN_SHARED_GLSL = /* glsl */ `
  vec2 ddRotate2(vec2 p, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }
  float ddCamFade(float camd) {
    // Strong ≤60 m, mip-fade by ~250 m. Replaces the R10 shore-distance
    // gate that zeroed micro-normals past 72 m of shoreline.
    return 1.0 - smoothstep(${OCEAN.microCamNear.toFixed(1)}, ${OCEAN.microCamFar.toFixed(1)}, camd);
  }
  float ddWaterlineShift(float along, float run) {
    // Living waterline: along-shore scallop ±2–4 m AND foam-phase sweep.
    float scallop = sin(along * 0.21 + 0.4) * 2.6 + sin(along * 0.53 + 1.3) * 1.3;
    float pulse = (run - 0.5) * 3.4;
    return scallop + pulse;
  }
  vec2 ddAntiTile(vec2 p, float rot, float warpScale, float warpAmp, vec2 jitterKey) {
    vec2 r = ddRotate2(p, rot);
    vec2 w = vec2(
      ddValueNoise(r * warpScale + vec2(2.4, 7.1)),
      ddValueNoise(r * warpScale + vec2(8.2, 1.3))
    ) - 0.5;
    float j = 0.90 + 0.20 * ddValueNoise(jitterKey);
    return (r + w * warpAmp) * j;
  }
  float ddHardLine(float x, float halfW, float aa) {
    return 1.0 - smoothstep(halfW - aa, halfW + aa, abs(x));
  }
  float ddBreakerRow(float along, float front, float run, float seed) {
    float period = ${BREAKER_ARCS.periodM.toFixed(1)};
    float idx = floor(along / period);
    float local = along - idx * period;
    float h = ddHash21(vec2(idx, 3.7 + seed));
    float h2 = ddHash21(vec2(idx, 8.1 + seed));
    float gap = mix(${BREAKER_ARCS.gapMin.toFixed(1)}, ${BREAKER_ARCS.gapMax.toFixed(1)}, h);
    float arcLen = period - gap;
    float a0 = h2 * (gap * 0.40);
    float a1 = a0 + arcLen;
    float aa = ${BREAKER_ARCS.aaM.toFixed(2)};
    float alongM = smoothstep(a0, a0 + aa, local) * (1.0 - smoothstep(a1 - aa, a1, local));
    float reach = mix(
      ${BREAKER_ARCS.depthMin.toFixed(1)},
      ${BREAKER_ARCS.depthMax.toFixed(1)},
      run * 0.70 + h * 0.30
    );
    float rag = (ddHash21(vec2(idx, floor(along * 0.17))) - 0.5) * 1.1;
    float land = smoothstep(-0.35 + rag, aa + rag, front);
    float sea = 1.0 - smoothstep(reach, reach + aa, front);
    return alongM * land * sea;
  }
  float ddBreakerArcs(float along, float front, float run) {
    // R15: one along-row. The second offset row filled the authored gaps
    // and restored the continuous scalloped blanket.
    return ddBreakerRow(along, front, run, 0.0);
  }
  float ddRetreatLace(float front, float leftover) {
    float aa = 0.25;
    float halfW = ${BREAKER_ARCS.laceW.toFixed(2)} * 0.5;
    float l0 = ddHardLine(front + 0.70, halfW, aa);
    float l1 = ddHardLine(front + 2.05, halfW, aa);
    return leftover * max(l0, l1);
  }
  float ddLuma(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
  }
  float ddFoamSegB0(float id) {
    float mean = ${RUN_UP.segMean.toFixed(1)};
    float amp = ${RUN_UP.segJitter.toFixed(1)};
    return id * mean + (ddHash21(vec2(id, 1.1)) - 0.5) * amp;
  }
  float ddFoamSegId(float along) {
    float mean = ${RUN_UP.segMean.toFixed(1)};
    float i = floor(along / mean);
    float seg = i;
    for (int k = -2; k <= 2; k++) {
      float j = i + float(k);
      float b0 = ddFoamSegB0(j);
      float b1 = ddFoamSegB0(j + 1.0);
      if (along >= b0 && along < b1) {
        seg = j;
        break;
      }
    }
    return seg;
  }
  float ddFoamSegRunUpId(float id, float t) {
    float b0 = ddFoamSegB0(id);
    float b1 = ddFoamSegB0(id + 1.0);
    float centre = 0.5 * (b0 + b1);
    float k = 6.28318530718 / ${RUN_UP.swellLen.toFixed(1)};
    float phi = k * ${RUN_UP.swellDirX.toFixed(5)} * centre - ${RUN_UP.swellOmega.toFixed(2)} * t;
    float crest = 0.5 + 0.5 * sin(phi);
    return mix(${RUN_UP.min.toFixed(1)}, ${RUN_UP.max.toFixed(1)}, crest * crest);
  }
  float ddFoamSegRunUp(float along, float t) {
    return ddFoamSegRunUpId(ddFoamSegId(along), t);
  }
  float ddFoamCellWeight(float along, float id) {
    float b0 = ddFoamSegB0(id);
    float b1 = ddFoamSegB0(id + 1.0);
    float span = max(b1 - b0, 4.0);
    float centre = 0.5 * (b0 + b1);
    float u = (along - centre) / span;
    float ov = ${FOAM_ART.overlap.toFixed(2)};
    return 1.0 - smoothstep(0.5 - ov * 0.5, 0.5 + ov * 0.5, abs(u));
  }
  float ddArcAlong(float along) {
    float period = ${BREAKER_ARCS.periodM.toFixed(1)};
    float idx = floor(along / period);
    float local = along - idx * period;
    float h = ddHash21(vec2(idx, 3.7));
    float h2 = ddHash21(vec2(idx, 8.1));
    float gap = mix(${BREAKER_ARCS.gapMin.toFixed(1)}, ${BREAKER_ARCS.gapMax.toFixed(1)}, h);
    float arcLen = period - gap;
    float a0 = h2 * (gap * 0.40);
    float a1 = a0 + arcLen;
    float aa = ${BREAKER_ARCS.aaM.toFixed(2)};
    return smoothstep(a0, a0 + aa, local) * (1.0 - smoothstep(a1 - aa, a1, local));
  }
  float ddPlateLuma(sampler2D plate, vec2 uv) {
    return ddLuma(texture2D(plate, uv).rgb);
  }
  // R16b measured plate seats. Sample in the plate's rotated frame at
  // world scale so lace shapes survive; envelope (not a V-window) masks.
  const vec2 DD_WIN_CREST_C = vec2(${FOAM_ART.windows.crest.cx.toFixed(3)}, ${FOAM_ART.windows.crest.cy.toFixed(3)});
  const float DD_WIN_CREST_A = ${FOAM_ART.windows.crest.angle.toFixed(3)};
  const float DD_WIN_CREST_W = ${FOAM_ART.windows.crest.halfWidth.toFixed(3)};
  const float DD_WIN_CREST_I = ${FOAM_ART.windows.crest.invertV.toFixed(1)};
  const vec2 DD_WIN_LACEA_C = vec2(${FOAM_ART.windows.laceA.cx.toFixed(3)}, ${FOAM_ART.windows.laceA.cy.toFixed(3)});
  const float DD_WIN_LACEA_A = ${FOAM_ART.windows.laceA.angle.toFixed(3)};
  const float DD_WIN_LACEA_W = ${FOAM_ART.windows.laceA.halfWidth.toFixed(3)};
  const float DD_WIN_LACEA_I = ${FOAM_ART.windows.laceA.invertV.toFixed(1)};
  const vec2 DD_WIN_LACEB_C = vec2(${FOAM_ART.windows.laceB.cx.toFixed(3)}, ${FOAM_ART.windows.laceB.cy.toFixed(3)});
  const float DD_WIN_LACEB_A = ${FOAM_ART.windows.laceB.angle.toFixed(3)};
  const float DD_WIN_LACEB_W = ${FOAM_ART.windows.laceB.halfWidth.toFixed(3)};
  const float DD_WIN_LACEB_I = ${FOAM_ART.windows.laceB.invertV.toFixed(1)};
  vec2 ddFoamPlateUv(vec2 centre, float angle, float invertV, float u01, float vM, float spanV, float mirror) {
    // W3: fract(Inf) is NaN; a near-zero span or huge vM (pier-collar
    // fragments sit on sdf ≪ 0) would RepeatWrap raw texels. Bound the
    // inputs, then NaN-guard the rotated UV.
    if (!(u01 < 1.0e8 && u01 > -1.0e8)) u01 = 0.0;
    if (!(vM < 1.0e8 && vM > -1.0e8)) vM = 0.0;
    float u = fract(u01);
    u = mix(u, 1.0 - u, step(0.5, mirror));
    float ly = vM / max(spanV, 4.0);
    ly = clamp(ly, -2.0, 2.0);
    ly = mix(ly, -ly, step(0.5, invertV));
    vec2 uv = centre + ddRotate2(vec2(u - 0.5, ly), angle);
    if (!(uv.x < 1.0e8 && uv.x > -1.0e8)) uv.x = 0.5;
    if (!(uv.y < 1.0e8 && uv.y > -1.0e8)) uv.y = 0.5;
    return uv;
  }
  float ddPlateLumaWindow(sampler2D plate, vec2 uv, float bias) {
    // NaN fails every comparison: the old less/greater window let NaN
    // through to texture2D (Mac Metal paints that as a grey checkerboard).
    float ok = 0.0;
    vec2 safe = vec2(0.5);
    if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
      ok = 1.0;
      safe = uv;
    }
    return ok * ddLuma(texture2D(plate, safe, bias).rgb);
  }
  float ddFoamReadable(float luma, float camd) {
    // Close: alpha tracks plate luminance (gentle curve) so grey lace
    // stays translucent. Past ~150 m raise contrast only — never a
    // tighter luma window that clips grey edges into slabs.
    float far = smoothstep(${FOAM_ART.lumaFloorFrom.toFixed(1)}, ${FOAM_ART.lumaFloorTo.toFixed(1)}, camd);
    float close = pow(clamp(luma, 0.0, 1.0), ${FOAM_ART.lumaCloseExp.toFixed(2)});
    float gain = mix(1.0, ${FOAM_ART.lumaFarContrast.toFixed(2)}, far);
    float crisp = clamp(0.5 + (luma - 0.5) * gain, 0.0, 1.0);
    return mix(close, crisp, far);
  }
  float ddFoamArtSample(sampler2D plate, vec2 uv, float camd) {
    float far = smoothstep(${FOAM_ART.readNear.toFixed(1)}, ${FOAM_ART.readFar.toFixed(1)}, camd);
    float bias = mix(0.0, ${FOAM_ART.mipBiasFar.toFixed(2)}, far);
    float sharp = ddPlateLumaWindow(plate, uv, 0.0);
    float soft = ddPlateLumaWindow(plate, uv, bias);
    return ddFoamReadable(mix(sharp, max(sharp, soft), far), camd);
  }
`;

export const OCEAN_VERT = /* glsl */ `
  #include <common>
  #include <shadowmap_pars_vertex>
  ${WATER_VARYINGS_GLSL}
  varying float vWaterness;
  varying float vPortW;
  varying float vCalm;
  varying float vHullWakeFoam;
  varying float vHullContactWet;
  varying float vHullContactFoam;
  varying vec3  vOuterSwellNormal;
  varying float vShelfFront;
  // Seaward unit vector of the shore frame (x, z): the fragment stage turns the swell slope
  // it re-derives per pixel (water/sea.js) back into world space with it.
  varying vec2  vShoreN;

  uniform float uTime;
  uniform float uMotion;
  uniform float uOuterSeaAmt;
  // taste-r1 (W14-A D2): the sheet's own trough floor. It used to share the name uWaterFloor with the
  // radiance floor in surface.js, which overwrote it (0.002) and clipped every open-sea trough flat.
  uniform float uSheetFloorY;
  uniform float uBayFace;
  uniform float uPortFace;
  uniform vec3  uBayOrigin;
  uniform vec3  uBayNormal;
  uniform vec3  uPortOrigin;
  uniform vec3  uPortNormal;
  uniform vec3  uInlandOrigin;
  uniform vec3  uInlandNormal;
  uniform sampler2D uDepthMap;
  uniform sampler2D uBedDepth;
  uniform sampler2D uCoastField;
  uniform vec2  uDepthOrigin;
  uniform float uDepthSpan;
  uniform float uDepthMax;
  uniform float uSdfOrigin;
  uniform float uSdfSpan;
  uniform vec2  uBayDir[${BAY_SWELL_N}];
  uniform float uBayLen[${BAY_SWELL_N}];
  uniform float uBayAmp[${BAY_SWELL_N}];
  uniform float uBaySteep[${BAY_SWELL_N}];
  uniform float uBayOmega[${BAY_SWELL_N}];
  uniform float uWaveScale;
  // taste-r1 (W14-A fix): the wave field's own shore distance. The packed front clamps at 224 m (edge-massing sdfSpan), so
  // 92% of the sea carried one constant front and its swell, envelope and flecks degenerated into stripes along the swell heading.
  varying float vWaveFront;

  ${SHORE_COMMON_GLSL}
  ${INTERACT_GLSL}
  ${WORLD_CURVE_GLSL}
  ${HULL_WAKE_GLSL}
  ${HULL_CONTACT_GLSL}
  ${HULL_SIT_GLSL}
  ${seaEnvelopeGlsl()}
  ${surfLutGlsl()}
  ${surfTrainsGlsl()}

  // P16-W7: evaluate the two broad slopes on the dense polar sheet, not once
  // per covered pixel. The 24 / 46 m wavelengths remain well sampled while
  // the master-gain branch makes the A/B's OFF arm an honest zero-cost arm.
  vec3 ddOuterSwellNormal(vec2 xz, float t) {
    vec2 dA = vec2(0.927, 0.375);
    vec2 dB = vec2(-0.438, 0.899);
    float pA = 6.28318530718
      * (dot(xz, dA) - t * ${OUTER_SEA.swellDriftLong.toFixed(2)})
      / ${OUTER_SEA.swellLongM.toFixed(1)};
    float pB = 6.28318530718
      * (dot(xz, dB) - t * ${OUTER_SEA.swellDriftCross.toFixed(2)})
      / ${OUTER_SEA.swellCrossM.toFixed(1)};
    vec3 n = vec3(0.0, 1.0, 0.0);
    n.xz -= dA * cos(pA) * ${OUTER_SEA.swellSlopeLong.toFixed(2)};
    n.xz -= dB * cos(pB) * ${OUTER_SEA.swellSlopeCross.toFixed(2)};
    return normalize(n);
  }

  struct DDWave {
    vec3  offset;
    vec3  normal;
    float steep;
    float crest;
    float fold;
    float shoal;
  };

  float ddSoftFloorY(float y, float L, float knee) {
    float a = (y + L) / max(knee, 1e-4);
    if (a > 10.0) return y;
    return knee * log(1.0 + exp(a)) - L;
  }

  DDWave ddBaySwell(float along, float front, float depth, float t, float bed, float S, float coastA) {
    DDWave o;
    o.offset = vec3(0.0);
    o.normal = vec3(0.0, 1.0, 0.0);
    o.steep = 0.0;
    o.crest = 0.0;
    o.fold = 0.0;
    o.shoal = 1.0 - smoothstep(0.55, 5.20, depth);
    // Beach-safe: both the shaped coastline and the hard beach boundary
    // must classify the vertex offshore before waves can rise.
    float fade = smoothstep(0.80, 11.0, front);
    float depthLimit = smoothstep(0.12, 2.15, depth) * min(1.0, depth / 5.4);
    // W14-A: inside the coast field's reach the shore distance S (true distance, not the L-shaped front) drives the
    // shoaling table; beyond it (coastA 0) the old front path stands.
    vec4 kk = ddSurfK(S);
    vec4 ee = ddSurfE(S);
    float live = mix(fade * depthLimit, step(0.0, front) * smoothstep(0.0, 1.5, S), coastA);
    if (front <= 0.0 || live <= 0.0) return o;
    float gain = mix(1.0, kk.x, coastA);

    float ox = 0.0;
    float oy = 0.0;
    float oz = 0.0;
    vec3 tA = vec3(1.0, 0.0, 0.0);
    vec3 tB = vec3(0.0, 0.0, 1.0);
    float crestAcc = 0.0;
    float crestW = 0.0;
    // Low-frequency along-shore bend so macro crests are not a comb.
    float crestWob = sin(along * 0.019 + 0.6) * 4.2 + sin(along * 0.047 + 1.9) * 1.8;
    // Swell arrives in groups: the three trains share one drifting 90 / 220 m envelope.
    float swellEnv = ddSeaEnvelope(along, front, t);
    // taste-r1 (W14-A): the summed crest never exceeds 0.39 of the DRAWN bed depth, so the sheet cannot
    // pass under the sand where the bed is shallow (uBedDepth is the physical bed, not the 9 m byte).
    // taste-r1 (W15-A1): each train's own wander and group amplitude in the open sea (water/surf.js, 0 inside 120 m of the shore).
    vec3 trainPh;
    vec3 trainEn;
    ddSurfTrains(along, front, t, trainPh, trainEn);
    float crestSum = 0.0;
    for (int i = 0; i < ${BAY_SWELL_N}; i++) crestSum += uBayAmp[i] * uWaveScale * live * swellEnv * gain * trainEn[i];
    float bedCap = min(1.0, 0.39 * max(mix(bed, min(kk.w, bed), coastA), 0.0) / max(crestSum, 1e-3));

    for (int i = 0; i < ${BAY_SWELL_N}; i++) {
      vec2 D = uBayDir[i];
      float len = max(uBayLen[i], 4.0);
      float k = 6.28318530718 / len;
      float amp = uBayAmp[i] * uWaveScale * live * swellEnv * gain * bedCap * trainEn[i];
      float Q = uBaySteep[i];
      // taste-r1 (W14-A D1): + omega * t, so crests travel toward smaller front, onshore.
      float phi = k * (D.x * along + D.y * (front + crestWob * 0.35)) + uBayOmega[i] * t + coastA * ee[i] + trainPh[i];
      float s = sin(phi);
      float c = cos(phi);
      float qA = Q * amp;
      ox += D.x * qA * c;
      oz += D.y * qA * c;
      oy += amp * s;
      float kQAs = k * qA * s;
      float kAc = k * amp * c;
      tA.x += -D.x * D.x * kQAs;
      tA.y += D.x * kAc;
      tA.z += -D.y * D.x * kQAs;
      tB.x += -D.x * D.y * kQAs;
      tB.y += D.y * kAc;
      tB.z += -D.y * D.y * kQAs;
      float u = 0.5 + 0.5 * s;
      crestAcc += amp * u * u * u;
      crestW += amp;
    }

    oy = ddSoftFloorY(oy, 0.48, 0.09);
    o.offset = vec3(ox, oy, oz);
    vec3 n = normalize(cross(tB, tA));
    if (n.y < 0.12) n = normalize(vec3(n.x, 0.12, n.z));
    o.normal = n;
    float slope = length(n.xz) / max(n.y, 0.12);
    o.steep = smoothstep(0.06, 0.36, slope);
    // R13: raw 0–1 ridge metric. The fragment draws a 0.6–1.2 m near-binary
    // line in the top 4–6 % of the cycle — not a 0.58–0.92 lobe.
    o.crest = crestAcc / max(crestW, 1e-4);
    float breakness = smoothstep(0.48, 0.86, (abs(oy) * 2.05 + 0.08) / max(depth, 0.18))
      * smoothstep(0.55, 1.65, depth)
      * (1.0 - smoothstep(3.55, 5.40, depth));
    // W22: horizontal Gerstner Jacobian compression, not a depth-only crest gate.
    float jacobian = tA.x * tB.z - tA.z * tB.x;
    o.fold = max(smoothstep(0.022, 0.078, 1.0 - jacobian) * o.crest,
      o.steep * o.crest * breakness);
    return o;
  }

  void main() {
    vec3 pos = position;
    vec3 flatWorld = (modelMatrix * vec4(pos, 1.0)).xyz;
    vFlatWorld = flatWorld;

    float t = uTime;
    vOuterSwellNormal = vec3(0.0, 1.0, 0.0);
    if (uOuterSeaAmt > 0.001) {
      float outerT = mix(${OCEAN.freezeTime.toFixed(2)}, uTime, uMotion);
      vOuterSwellNormal = ddOuterSwellNormal(flatWorld.xz, outerT);
    }
    float seaBay = dot(flatWorld - uBayOrigin, uBayNormal);
    float seaPort = dot(flatWorld - uPortOrigin, uPortNormal);
    float seaInland = dot(flatWorld - uInlandOrigin, uInlandNormal);
    float portW = smoothstep(-10.0, 10.0, seaPort - seaBay);
    vPortW = portW;
    vec3 shoreN = normalize(mix(uBayNormal, uPortNormal, portW));
    vShoreN = shoreN.xz;
    float along = dot(flatWorld.xz, vec2(shoreN.z, -shoreN.x));
    float portFront = seaPort - ${(SHORE.wallDeep * 0.35).toFixed(2)};
    float quayBasin = (1.0 - smoothstep(0.0, ${PAINTED.portFeather.toFixed(1)}, abs(portFront)))
      * smoothstep(0.40, 0.85, portW);
    float inlandNear = smoothstep(-8.0, 6.0, seaInland)
      * (1.0 - smoothstep(8.0, ${PAINTED.airportFeatherIn.toFixed(1)}, seaInland));
    float portNear = smoothstep(-10.0, 4.0, seaPort)
      * (1.0 - smoothstep(6.0, ${PAINTED.airportFeatherPort.toFixed(1)}, seaPort));
    float basin = max(quayBasin, inlandNear * portNear);
    // Sheltered harbour. The wharf that is drawn runs to 38.5 m seaward while
    // the authored port waterline is at 3.99 m, so the deck is inside the water
    // field; unrestrained swell put the sheet 1.95 m over 0.452 m concrete.
    // Inside the breakwater the swell is authored down instead of clipped, so
    // the basin and the open sea stay one sheet with one still-water level.
    float calmGate = smoothstep(${PAINTED.harbourLandwardFrom.toFixed(1)}, ${PAINTED.harbourLandwardTo.toFixed(1)}, seaPort)
      * (1.0 - smoothstep(${PAINTED.harbourShelterTo.toFixed(1)}, ${PAINTED.harbourOpenBy.toFixed(1)}, seaPort))
      * (1.0 - smoothstep(${PAINTED.harbourBayFrom.toFixed(1)}, ${PAINTED.harbourBayTo.toFixed(1)}, seaBay));
    float calmScale = mix(1.0, ${PAINTED.harbourSwell.toFixed(2)}, calmGate);
    // P16-W5: hand the shelter gate to the fragment stage so the micro-chop
    // can be calmed inside the harbour by the SAME mask that calms the swell.
    vCalm = calmGate;

    vec2 duv = (flatWorld.xz - uDepthOrigin) / uDepthSpan;
    vec4 packed = texture2D(uDepthMap, duv);
    float depth = packed.r * uDepthMax;
    vWaterness = packed.g;
    float warpedFront = packed.b * uSdfSpan + uSdfOrigin;
    float unwarpedFront = packed.a * uSdfSpan + uSdfOrigin;
    float front = min(warpedFront, unwarpedFront);

    float bedPhysical = texture2D(uBedDepth, duv).r;
    vec4 coastTex = texture2D(uCoastField, duv);
    float coastS = 224.0 * coastTex.r * coastTex.r;
    // Beyond the packed 224 m the true distance is not stored; continue it with the straight-face / circular-corner distance
    // (within 3 m of the packed front on the board's faces), blended in over the last 74 m so the phase stays continuous.
    float farLin = mix(seaBay - uBayFace, seaPort - uPortFace, portW);
    float farCirc = length(vec2(max(seaBay, 0.0), max(seaPort, 0.0))) - mix(uBayFace, uPortFace, portW);
    float farFront = mix(farLin, farCirc, smoothstep(-4.0, 10.0, seaBay) * smoothstep(-4.0, 10.0, seaPort));
    float waveFront = front + smoothstep(150.0, 224.0, front) * (farFront - front);
    // Swell crests are never ruled: out in the open sea (beyond 120 to 240 m of the shore) the wave field's distance is bent by two
    // octaves of slow noise (58 m and 27 m), 8 m and 3 m in size, so the three trains lose their line spectrum and their lattice.
    waveFront += smoothstep(120.0, 240.0, waveFront)
      * (${W15_SEA_WARP.bigM.toFixed(2)} * (2.0 * ddValueNoise(flatWorld.xz / ${W15_SEA_WARP.bigScale.toFixed(1)} + vec2(3.3, 9.1)) - 1.0) + ${W15_SEA_WARP.smallM.toFixed(2)} * (2.0 * ddValueNoise(flatWorld.xz / ${W15_SEA_WARP.smallScale.toFixed(1)} + vec2(14.7, 2.2)) - 1.0));
    vWaveFront = waveFront;
    DDWave w = ddBaySwell(along, waveFront, depth, t, bedPhysical, coastS, coastTex.a);
    // Displacement, analytic normal and the wave metrics all fall together —
    // damping Y alone would leave a flat sheet shaded and foamed as if it
    // still carried 2 m crests.
    w.offset *= calmScale;
    w.normal = normalize(mix(w.normal, vec3(0.0, 1.0, 0.0), 1.0 - calmScale));
    w.steep *= calmScale;
    w.crest *= calmScale;
    w.fold *= calmScale;
    w.offset.y *= mix(1.0, ${PAINTED.swellDamp.toFixed(2)}, basin);
    DDTap tap = ddTapSample(along, front);

    vec3 alongVec = vec3(shoreN.z, 0.0, -shoreN.x);
    vec3 seaVec = shoreN;
    // P14 M11 item 2 — the hull wake displaces the SHEET. It rides on top of
    // the swell's own Y and is not scaled by the harbour's calm gate: a boat
    // making way inside the breakwater still pushes water, and the basin is
    // exactly where the shipyard launch and the raid are shot.
    vec3 hullContact = ddHullContactField(flatWorld.xz);
    float wakeY = ddWakeHeight(flatWorld.xz) + hullContact.x;
    wakeY += 0.14 * ddW20HullSit(flatWorld.xz, vec2(0.0)).z;
    vHullWakeFoam = ddWakeFoam(flatWorld.xz);
    vHullContactWet = hullContact.y;
    vHullContactFoam = hullContact.z;
    vec3 disp = alongVec * w.offset.x
      + seaVec * w.offset.z
      + vec3(0.0, w.offset.y + tap.height * step(0.0, front) + wakeY, 0.0);

    vec3 world = flatWorld + disp;
    world.y -= ${PAINTED.portDrop.toFixed(2)} * basin;
    // taste-r1 (W14-A D2): open-sea troughs are free; the basin (and the wrap basin) keeps the height it is drawn at.
    world.y = max(world.y, mix(uSheetFloorY, ${SURF.basinSheetY.toFixed(3)}, smoothstep(0.0, 0.05, basin)));
    vHeight = world.y - flatWorld.y;
    world = ddBendWorld(world);

    vWorld = world;
    vWaveNormal = normalize(
      alongVec * w.normal.x + vec3(0.0, w.normal.y, 0.0) + seaVec * w.normal.z
    );
    vFront = front;
    vAlong = along;
    vDepth = depth;
    // W15: circular shelf front in the water-water quadrant (identity on a
    // mid-edge). Colour keys off this so the pale band is not a 90° L.
    float w15WrapQ = smoothstep(-4.0, 10.0, seaBay) * smoothstep(-4.0, 10.0, seaPort);
    float w15Circ = length(vec2(max(seaBay, 0.0), max(seaPort, 0.0)))
      - mix(uBayFace, uPortFace, portW);
    float w15MixC = w15WrapQ * (1.0 - portW * ${COAST_W15.portKeep.toFixed(2)});
    vShelfFront = mix(front, w15Circ, w15MixC);
    vSteep = w.steep;
    vCrest = w.crest;
    vFold = w.fold;
    vShoal = w.shoal;

    vec4 worldPosition = vec4(world, 1.0);
    #include <shadowmap_vertex>
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

/**
 * Wave 75 phase 2b lane 1 (COAST_SPINE on only): the ocean's vertex stage with the front from the spine inside the beach (`ddSpineWaterFront`, coast-spine.js). The
 * swell, the sheet's height at the shore (no swell at or landward of d's zero), the wave phase and the varying `vFront` read it; the taps (wave 78) read it too,
 * being stored against it. Off: `OCEAN_VERT` itself, byte for byte.
 */
export const OCEAN_VERT_SPINE = (() => {
  const main = '  void main() {';
  const front = '    float front = min(warpedFront, unwarpedFront);';
  const tap = '    DDTap tap = ddTapSample(along, front);';
  const bay = '  DDWave ddBaySwell(float along, float front, float depth, float t, float bed, float S, float coastA) {';
  const live = '    float live = mix(fade * depthLimit, step(0.0, front) * smoothstep(0.0, 1.5, S), coastA);';
  for (const [name, text] of [['main', main], ['front', front], ['tap', tap], ['bay', bay], ['live', live]]) {
    if (OCEAN_VERT.split(text).length !== 2) throw new Error(`ocean vertex stage: the ${name} anchor is not unique`);
  }
  return OCEAN_VERT
    .replace(main, () => `${COAST_SPINE_GLSL}\n${COAST_WATER_FRONT_GLSL}\n${main}`)
    .replace(front, () => `${front}\n    float frontOld = front;\n    float spineW;\n    front = ddSpineWaterFront(flatWorld.xz, front, spineW);\n    gSpineW = spineW;`)
    // wave 78 (2b-3): the taps are stored against the spine's front (water.js `_tapFront`), so the ocean reads them against `front`, which is the spine's inside the beach (it was `frontOld`, the packed front).
    .replace(bay, () => `  float gSpineW = 0.0; // the beach weight at the vertex, for ddBaySwell\n${bay}`)
    .replace(live, () => `${live}\n    live *= mix(1.0, smoothstep(${SPINE_WATER.swellFrom.toFixed(1)}, ${SPINE_WATER.swellTo.toFixed(1)}, front), gSpineW);`);
})();

const OCEAN_FRAG = /* glsl */ `
  precision highp float;

  ${WATER_VARYINGS_GLSL}
  varying float vWaterness;
  varying float vPortW;
  varying float vCalm;
  varying float vHullWakeFoam;
  varying float vHullContactWet;
  varying float vHullContactFoam;
  varying vec3  vOuterSwellNormal;
  varying float vShelfFront;

  uniform float uTime;
  uniform float uMotion;
  uniform float uFoamPhase;
  uniform sampler2D uFoamMap;
  uniform sampler2D uFoamLaceA;
  uniform sampler2D uFoamLaceB;
  uniform sampler2D uFoamCrest;
  uniform float uFoamUseArt;
  uniform float uFoamArtGain;
  uniform sampler2D uPaintStripA;
  uniform sampler2D uPaintStripB;
  uniform sampler2D uPaintDeep;
  uniform float uPaintUseArt;
  uniform float uPaintSpanU;
  uniform vec2  uDepthOrigin;
  uniform float uDepthSpan;
  uniform float uPierAlong;
  uniform float uPierWidth;
  uniform float uPierLength;
  uniform float uPierSea0;
  uniform vec3  uRampWet;
  uniform vec3  uRampOlive;
  uniform vec3  uRampTeal;
  uniform vec3  uRampNavy;
  uniform float uRampKeep;
  uniform float uFogResist;
  uniform float uDepthMax;
  uniform vec3  uSunDir;
  uniform vec3  uSunColor;
  uniform vec3  uFoamColor;
  uniform vec3  uFoamShadow;
  uniform vec2  uBayDir[${BAY_SWELL_N}];
  uniform float uBayLen[${BAY_SWELL_N}];
  uniform float uBayAmp[${BAY_SWELL_N}];
  uniform float uBayOmega[${BAY_SWELL_N}];
  uniform vec3  uBayOrigin;
  uniform vec3  uBayNormal;
  // P16-W5 reflection block.
  uniform sampler2D uEnvMap;
  uniform bool  uHasEnv;
  uniform float uReflGain;
  uniform sampler2D uMassMap;
  uniform vec2  uMassOrigin;
  uniform float uMassSpan;
  uniform float uMassMaxH;
  uniform bool  uHasMass;
  uniform vec3  uMassTint;
  // P16-W6 planar reflection block.
  uniform sampler2D uReflMap;
  uniform mat4  uReflMatrix;
  uniform vec2  uReflTexel;
  uniform float uPlanarOn;
  uniform float uPlanarAmt;
  // P16-W9: the existing reflector's depth attachment. No second pass.
  uniform sampler2D uReflDepth;
  uniform mat4  uReflProjInv;
  uniform mat4  uReflView;
  uniform float uContactOn;
  uniform float uW9WaterAmt;
  uniform float uW11WaterAmt;
  uniform float uW12WaterAmt;
  uniform float uW13WaterAmt;
  uniform float uW14WaterAmt;
  uniform float uX3WaterAmt;
  uniform float uW15WaterAmt;
  uniform float uW16WaterAmt;
  uniform float uW17ReflectionAmt;
  uniform float uW18WaterAmt;
  uniform float uW18Receipt;
  uniform sampler2D uW19Albedo;
  uniform sampler2D uW19Normal;
  uniform sampler2D uW19Foam;
  uniform float uW19Ready;
  uniform float uW19EnvIntensity;
  uniform vec3 uPortOrigin;
  uniform vec3 uPortNormal;
  uniform float uBayFace;
  uniform float uPortFace;
  // P16-W6 item 2: ripple / depth falloff / depth foam.
  uniform float uRippleMix;
  uniform vec3  uShallowTint;
  uniform vec3  uDeepTint;
  uniform float uDepthFallAmt;
  uniform float uFoamDepthAmt;
  // P16-W7 outer-sea / wet-edge master gains. Zero is the receipt's OFF arm.
  uniform float uOuterSeaAmt;
  uniform float uWetEdgeAmt;

  ${SHORE_COMMON_GLSL}
  ${INTERACT_GLSL}
  #define DD_WAKE_INTERPOLATED
  ${HULL_WAKE_GLSL}
  ${HULL_CONTACT_GLSL}
  ${HULL_SIT_GLSL}

  float ddBlueNoise(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  }

  ${OCEAN_SHARED_GLSL}

  float ddRibbonWob(float along) {
    return 0.70
      + 0.22 * sin(along * 0.027 + 0.8)
      + 0.10 * sin(along * 0.071 + 2.1);
  }

  vec3 ddRippleNormal(vec2 xz, float t, float camd) {
    // 3 advected world-space FBM octaves: 9 m / 3.5 m / 1.2 m.
    // Rotated + domain-warped + scale-jitter so the field does not tile
    // along 200 m of coast. Fine octave mip-fades before the others.
    if (camd >= ${OCEAN.microCamFar.toFixed(1)}) return vec3(0.0, 1.0, 0.0);
    vec2 p0 = ddAntiTile(xz + vec2(t * 0.31, -t * 0.19), 0.41, 0.027, 3.4, xz * 0.004 + vec2(2.1, 8.4));
    float e = 0.18;
    vec3 n = vec3(0.0, 1.0, 0.0);
    float s0 = 1.0 / 9.0;
    vec2 pA = p0 * s0;
    float hx = ddValueNoise(pA + vec2(e, 0.0)) - ddValueNoise(pA - vec2(e, 0.0));
    float hz = ddValueNoise(pA + vec2(0.0, e)) - ddValueNoise(pA - vec2(0.0, e));
    n.x -= hx * 2.85;
    n.z -= hz * 2.85;
    float s1 = 1.0 / 3.5;
    vec2 pB = ddRotate2(p0, 0.73) * s1 + vec2(4.1, 1.3);
    hx = ddValueNoise(pB + vec2(e, 0.0)) - ddValueNoise(pB - vec2(e, 0.0));
    hz = ddValueNoise(pB + vec2(0.0, e)) - ddValueNoise(pB - vec2(0.0, e));
    n.x -= hx * 2.25;
    n.z -= hz * 2.25;
    float fine = 1.0 - smoothstep(40.0, 110.0, camd);
    float s2 = 1.0 / 1.2;
    vec2 pC = ddRotate2(p0, -0.52) * s2 + vec2(7.7, 5.6) + vec2(t * 0.42, t * 0.11);
    hx = ddValueNoise(pC + vec2(e, 0.0)) - ddValueNoise(pC - vec2(e, 0.0));
    hz = ddValueNoise(pC + vec2(0.0, e)) - ddValueNoise(pC - vec2(0.0, e));
    n.x -= hx * 1.70 * fine;
    n.z -= hz * 1.70 * fine;
    return normalize(n);
  }

  vec3 ddChopNormal(float along, float front, float t) {
    // Two small Gerstner, normal-only, ±20–50° off the macro heading.
    // 9 m / 0.14 m at +35° and 5 m / 0.07 m at −42°. Fragment-only so
    // vertex N stays 3 and the beach-safe displacement gate is untouched.
    vec3 n = vec3(0.0, 1.0, 0.0);
    vec2 DA = vec2(0.78, 0.63);
    DA = normalize(DA);
    float kA = 6.28318530718 / 9.0;
    float phiA = kA * (DA.x * along + DA.y * front) - 1.15 * t;
    float cA = cos(phiA);
    n.x -= DA.x * kA * 0.14 * cA * 2.6;
    n.z -= DA.y * kA * 0.14 * cA * 2.6;
    vec2 DB = vec2(-0.67, 0.74);
    DB = normalize(DB);
    float kB = 6.28318530718 / 5.0;
    float phiB = kB * (DB.x * along + DB.y * front) - 1.55 * t;
    float cB = cos(phiB);
    n.x -= DB.x * kB * 0.07 * cB * 2.8;
    n.z -= DB.y * kB * 0.07 * cB * 2.8;
    return normalize(n);
  }

  float ddWhitecap(vec2 xz, float along, float depth, float crest, float steep, float camd) {
    // R15: ≤4 % of cells, directional. Live path crops foam-crest-c;
    // chevron is the crash-free fallback (whiteSizeMin/Max still walked).
    if (depth < 5.8) return 0.0;
    vec2 D = vec2(0.14, 1.0);
    D = normalize(D);
    float alongC = D.y * xz.x - D.x * xz.y;
    float across = D.x * xz.x + D.y * xz.y;
    float cellA = 12.0;
    float cellB = 9.0;
    vec2 id = vec2(floor(alongC / cellA), floor(across / cellB));
    float h = ddHash21(id);
    float keep = step(1.0 - ${FOAM_MASK.whiteCover.toFixed(2)}, h);
    if (keep < 0.5) return 0.0;
    float ridge = step(0.55, crest) * mix(0.6, 1.0, steep);
    if (uFoamUseArt > 0.5) {
      vec2 f = vec2(fract(alongC / cellA), fract(across / cellB));
      float u01 = f.x + ddHash21(id + 4.0);
      float vM = (f.y - 0.5) * cellB;
      vec2 uv = ddFoamPlateUv(
        DD_WIN_CREST_C, DD_WIN_CREST_A, DD_WIN_CREST_I,
        u01, vM, ${FOAM_ART.spanV0.toFixed(1)}, step(0.5, ddHash21(id + 9.0))
      );
      float art = ddFoamArtSample(uFoamCrest, uv, camd);
      return keep * art * ridge;
    }
    float size = mix(
      ${FOAM_MASK.whiteSizeMin.toFixed(1)},
      ${FOAM_MASK.whiteSizeMax.toFixed(1)},
      ddHash21(id + 19.0)
    );
    vec2 f = vec2(fract(alongC / cellA) * cellA, fract(across / cellB) * cellB);
    vec2 c = vec2(cellA * 0.5, cellB * 0.5);
    float chev = abs(f.y - c.y) + abs(f.x - c.x) * 0.45;
    float aa = 0.22;
    float shape = 1.0 - smoothstep(size * 0.42 - aa, size * 0.42 + aa, chev);
    return keep * shape * ridge;
  }

  float ddTroughTerm(float height, float depth) {
    // Darken wave troughs 6–10 %, broader in deeper water, so faces read
    // as bodies with light AND shadow.
    float floorH = mix(-0.22, -0.48, smoothstep(1.2, 7.5, depth));
    float trough = smoothstep(0.06, floorH, height);
    float gain = mix(
      ${FOAM_ART.troughMin.toFixed(2)},
      ${FOAM_ART.troughMax.toFixed(2)},
      smoothstep(1.5, 8.0, depth)
    );
    return trough * gain;
  }

  float ddCrestTerm(float crest, float height, vec3 N, vec3 L) {
    // R13: ridge gate only. Smooth additive (height window + upslope mix)
    // was the giant white lobe. Window ≤ 0.15 of the 0–1 cycle metric.
    float ridge = smoothstep(1.0 - ${CREST_LINE.window.toFixed(2)}, 1.0, crest);
    return ridge * step(0.0, height + 1.0) * step(-2.0, dot(N, L));
  }

  float ddCrestLine(float along, float front, float t) {
    float line = 0.0;
    float window = ${CREST_LINE.window.toFixed(2)};
    for (int i = 0; i < ${BAY_SWELL_N}; i++) {
      vec2 D = uBayDir[i];
      float len = max(uBayLen[i], 4.0);
      float k = 6.28318530718 / len;
      float phi = k * (D.x * along + D.y * front) - uBayOmega[i] * t;
      float dist = abs(cos(phi)) / k;
      float halfW = mix(
        ${CREST_LINE.widthMin.toFixed(2)},
        ${CREST_LINE.widthMax.toFixed(2)},
        clamp(len / 72.0, 0.0, 1.0)
      );
      float n = dist / max(halfW, 1e-4);
      float band = 1.0 - smoothstep(1.0 - window, 1.0, n);
      float crestAlong = D.y * along - D.x * front;
      float dash = ${CREST_LINE.dash.toFixed(1)};
      float gap = ${CREST_LINE.gap.toFixed(1)};
      float span = dash + gap;
      float m = mod(crestAlong, span);
      float inDash = step(m, dash);
      float cell = floor(crestAlong / span);
      inDash *= step(0.40, ddValueNoise(vec2(cell * 0.17, 3.3 + float(i))));
      float wt = mix(0.48, 1.0, clamp(uBayAmp[i] / 1.90, 0.0, 1.0));
      line = max(line, band * inDash * wt);
    }
    return line;
  }

  float ddGgxDistribution(float NoH, float roughness) {
    float alpha = roughness * roughness;
    float alpha2 = alpha * alpha;
    float d = NoH * NoH * (alpha2 - 1.0) + 1.0;
    return alpha2 / max(3.14159265359 * d * d, 1e-5);
  }

  float ddGgxVisibility(float NoV, float NoL, float roughness) {
    // Schlick-GGX Smith masking. One lobe, evaluated against the actual wave
    // normal, replaces the disconnected Phong fill/glint/track trio.
    float k = roughness + 1.0;
    k = (k * k) * 0.125;
    float gv = NoV / max(NoV * (1.0 - k) + k, 1e-4);
    float gl = NoL / max(NoL * (1.0 - k) + k, 1e-4);
    return gv * gl;
  }

  float ddStableSparkle(vec2 xz, float axisGate) {
    if (axisGate <= 0.001) return 0.0;
    // The cell is quantised in WORLD metres from the derivative footprint.
    // It therefore stays seated under TAA jitter, but remains <= roughly two
    // pixels at every distance instead of becoming a metre-wide white blob.
    float pxM = max(length(dFdx(xz)), length(dFdy(xz)));
    float wanted = clamp(pxM * ${OCEAN_SPECULAR.sparkleCellPx.toFixed(2)}, 0.125, 4.0);
    float cell = exp2(floor(log2(wanted)));
    vec2 id = floor(xz / cell);
    vec2 f = fract(xz / cell);
    vec2 seat = vec2(ddHash21(id + 17.0), ddHash21(id + 31.0));
    float keep = step(${OCEAN_SPECULAR.sparkleKeep.toFixed(2)}, ddHash21(id + 53.0));
    float fleck = 1.0 - smoothstep(0.10, 0.42, length(f - seat));
    return keep * fleck * axisGate;
  }

  float ddIsoWobble(vec3 world, float along, float front) {
    // R8 "rectangular tonal patches" were NOT nearest-texel (uDepthMap is
    // LinearFilter). Cause: axis-aligned value-noise FBM at ~0.021 cycles/m
    // (~47 m square cells) painted rectangular isobath plateaus. Rotate,
    // domain-warp, and sample anisotropically along the coast.
    vec2 p = ddRotate2(world.xz, 0.54);
    vec2 warp = vec2(
      ddValueNoise(p * 0.011 + vec2(3.1, 8.4)),
      ddValueNoise(p * 0.011 + vec2(9.2, 1.7))
    ) - 0.5;
    p += warp * 22.0;
    vec2 q = vec2(along * 0.0095, front * 0.0064) + p * 0.0075;
    return ddFbm(q, 4) - 0.5;
  }

  vec3 ddAuthoredRamp(float depth, vec3 world, float along, float front, float graze) {
    // R13: one zone decision, then shading. Iso wobble / pockets are VALUE
    // only (±6 % luminance), never a new hue plate. Transmission dies at 2 m.
    float iso = max(depth, 0.0);
    float z1 = ${ZONE_BLEND.sandGlassTo.toFixed(2)};
    float z2 = ${ZONE_BLEND.turquoiseTo.toFixed(2)};
    float bw1 = z1 * ${ZONE_BLEND.blendFrac.toFixed(2)};
    float bw2 = (z2 - z1) * ${ZONE_BLEND.blendFrac.toFixed(2)};
    float nearE = smoothstep(z1 - bw1, z1, iso) * (1.0 - smoothstep(z1, z1 + bw1, iso));
    float farE = smoothstep(z2 - bw2, z2, iso) * (1.0 - smoothstep(z2, z2 + bw2, iso));
    iso += (ddBlueNoise(gl_FragCoord.xy) - 0.5) * 0.02 * max(nearE, farE);
    iso = max(iso, 0.0);

    vec3 aqua = mix(uRampOlive, uRampTeal, 0.72);
    vec3 column;
    if (iso < z1) {
      float t = smoothstep(z1 - bw1, z1, iso);
      column = mix(aqua, uRampTeal, t);
    } else if (iso < z2) {
      float t = smoothstep(z2 - bw2, z2, iso);
      column = mix(uRampTeal, uRampNavy, t);
    } else {
      column = uRampNavy;
    }
    column = mix(column, uRampNavy, graze * step(z2 - bw2, iso) * 0.35);

    float wobbleV = ddIsoWobble(world, along, front);
    float pocket = ddFbm(ddRotate2(world.xz, -0.37) * 0.016 + vec2(2.0, 6.1), 3) - 0.5;
    float value = clamp(wobbleV * 0.12, -${ZONE_BLEND.valueVar.toFixed(2)}, ${ZONE_BLEND.valueVar.toFixed(2)});
    // R15: offshore pockets DARKEN only past the turquoise zone. Lightening
    // toward cyan was the bloom-island read.
    float pocketV = min(pocket * 0.12, 0.0) * step(z2, iso);
    value += clamp(pocketV, -${ZONE_BLEND.valueVar.toFixed(2)}, 0.0);
    column *= 1.0 + value;

    float trans = exp(-iso * ${ZONE_BLEND.transK.toFixed(2)}) * (1.0 - smoothstep(1.55, z1, iso));
    return mix(column, uRampWet, trans);
  }

  float ddContactFoam(float front, float portW, float along, float phase) {
    float lap = 0.78 + 0.22 * sin(phase * 6.28318530718 + along * 0.31);
    float band = 1.0 - smoothstep(0.35, ${FOAM_MASK.contactW.toFixed(2)}, abs(front));
    return clamp(band * smoothstep(0.28, 0.78, portW) * lap * 0.88, 0.0, 1.0);
  }

  vec3 ddPaintTap(sampler2D plate, vec2 uv, float overlap) {
    // 6–10 % U-edge overlap so an imperfectly tileable plate does not
    // print a value step at fract(U)=0. RepeatWrapping: u=0 and u=1
    // are the same sample; mix toward the opposite interior.
    float u = fract(uv.x);
    float o = max(overlap, 1e-4);
    vec3 a = texture2D(plate, uv).rgb;
    vec3 b = texture2D(plate, vec2(uv.x + 1.0 - o, uv.y)).rgb;
    float edge = min(u, 1.0 - u);
    float w = 1.0 - smoothstep(0.0, o, edge);
    return mix(a, b, w * 0.5);
  }

  float ddPaintU(float along, vec3 world, float t) {
    // ONE continuous U = along / tileSpan. No cell offset, no mirror,
    // no jitter — that vocabulary stays on the foam layer. Near the
    // polar ±π azimuth, mirror-fold so U does not jump mid-tile.
    float span = max(uPaintSpanU, 4.0);
    float uCart = (along + t * ${PAINTED.stripDrift.toFixed(2)}) / span;
    vec2 center = uDepthOrigin + vec2(uDepthSpan * 0.5);
    vec2 d = world.xz - center;
    float az = atan(d.x, d.y);
    float r = max(length(d), 1e-3);
    float seamM = min(abs(az + 3.14159265359), abs(az - 3.14159265359)) * r;
    float fold = 1.0 - smoothstep(0.0, ${PAINTED.wrapFoldM.toFixed(1)}, seamM);
    float azFold = abs(abs(az) - 3.14159265359);
    float uFold = azFold * r / span;
    return mix(uCart, uFold, fold);
  }

  // Water scatters sky and sun; a dead red channel is not a colour water can
  // be. Floors red at a fraction of the brightest channel, in linear space, so
  // already-red pixels are untouched. See PAINTED.seaRedFloor for the numbers.
  vec3 ddSeaRedFloor(vec3 c) {
    return vec3(max(c.r, ${PAINTED.seaRedFloor.toFixed(2)} * max(c.g, c.b)), c.g, c.b);
  }

  float ddLum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

  // P16-W8: preserve every ordinary sky value and bend only the overbright
  // cloud/sun-lattice shoulder. This is a radiance tone map, not a sea tint.
  float ddOuterSkyLuma(float source) {
    float excess = max(0.0, source - ${OUTER_SEA.skyLumaKnee.toFixed(2)});
    float shoulder = ${OUTER_SEA.skyLumaKnee.toFixed(2)} + excess
      / (1.0 + excess / ${(
        OUTER_SEA.skyLumaCeil - OUTER_SEA.skyLumaKnee
      ).toFixed(2)});
    return min(source, shoulder);
  }

  // ── P16-W5: sky reflection ───────────────────────────────────────────────
  // The lighting rig's equirect: row 0 / v 0 is the zenith (DataTexture, so
  // flipY is false) and phi = atan2(x, z). Getting either wrong is what put a
  // taupe ground-bounce smear on the far water in R01.
  vec3 ddEnvTap(vec3 d) {
    vec2 uv = vec2(
      atan(d.x, d.z) * 0.15915494309 + 0.5,
      acos(clamp(d.y, -1.0, 1.0)) * 0.31830988618
    );
    return texture2D(uEnvMap, uv).rgb;
  }
  // Five taps averaged, then a luminance clamp. The clamp is the whole trick:
  // the equirect carries a 22-68x sun disc that one bilinear tap on a 256-wide
  // lattice renders as a bright RECTANGLE, which is the artefact this shader
  // stopped sampling the env for. The sky under the disc is a smooth gradient
  // and reflects fine; the sun goes back on the analytic glint/track terms.
  vec3 ddSkyReflection(vec3 R) {
    vec3 d = normalize(vec3(R.x, max(R.y, 0.035), R.z));
    vec3 t = normalize(cross(vec3(0.0, 1.0, 0.0), d));
    vec3 b = cross(d, t);
    float e = ${REFLECT.tapSpread.toFixed(3)};
    vec3 c = ddEnvTap(d)
      + ddEnvTap(normalize(d + t * e)) + ddEnvTap(normalize(d - t * e))
      + ddEnvTap(normalize(d + b * e)) + ddEnvTap(normalize(d - b * e));
    c *= 0.2;
    float l = max(max(c.r, max(c.g, c.b)), 1e-4);
    return c * min(1.0, ${REFLECT.clamp.toFixed(2)} / l);
  }

  // ── P16-W5: standing mass in the reflected direction ─────────────────────
  // uMassMap is a boot-baked height field of everything that stands out of
  // the water — hulls, quay walls, cranes, sheds — in the red channel, scaled
  // by uMassMaxH. This is NOT a mirror and does not claim to be one: it is
  // reflection OCCLUSION plus the tone the blocked sky is replaced with, which
  // is what a black hull side actually does to the water beside it. Four taps.
  float ddMassAt(vec2 xz) {
    vec2 uv = (xz - uMassOrigin) / max(uMassSpan, 1.0);
    // Positive-form window, not the negated one: W3 pinned that shape out of
    // this file because a NaN slips THROUGH the negated window and reaches the
    // sampler. Written this way a NaN fails every comparison and returns 0.
    if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
      return texture2D(uMassMap, uv).r;
    }
    return 0.0;
  }
  // Circular occupancy at radius r. Eight taps so a wall dilates as a
  // rounded outline, not the axis-aligned square the ±X/±Z pair printed.
  float ddMassRing(vec2 xz, float r) {
    float s = r * 0.70710678;
    return max(
      max(
        max(ddMassAt(xz + vec2(r, 0.0)), ddMassAt(xz + vec2(-r, 0.0))),
        max(ddMassAt(xz + vec2(0.0, r)), ddMassAt(xz + vec2(0.0, -r)))),
      max(
        max(ddMassAt(xz + vec2(s, s)), ddMassAt(xz + vec2(-s, s))),
        max(ddMassAt(xz + vec2(s, -s)), ddMassAt(xz + vec2(-s, -s)))));
  }
  // Thin 2–5 px crest from a metre-gap. px is fwidth(gap) so the line
  // stays a screen-space thread at every camera instead of a world fill.
  float ddW14Crest(float gapM, float px) {
    float g = max(gapM, 0.0);
    float lo = max(${OCEAN_W14.crestFromM.toFixed(2)}, px * 2.0);
    float hi = max(${OCEAN_W14.crestToM.toFixed(2)}, px * 5.0);
    float pk = max(${OCEAN_W14.crestPeakM.toFixed(2)}, px * 3.2);
    return smoothstep(lo * 0.20, pk, g) * (1.0 - smoothstep(pk, hi, g));
  }
  float ddW16Crest(float gapM, float px, float camd) {
    float far = smoothstep(${OCEAN_W16.collarFadeFromM.toFixed(1)},
      ${OCEAN_W16.collarFadeToM.toFixed(1)}, camd) * uW16WaterAmt;
    float wet = (1.0 - smoothstep(0.0, px, max(gapM, 0.0)))
      * ${OCEAN_W16.wetLineGain.toFixed(2)};
    return mix(ddW14Crest(gapM, px), wet, far);
  }
  // ── P16-W6 item 2: the rippled tangent-space normal ──────────────────────
  // Two scrolling value-noise octaves, forward-differenced (three taps each,
  // not four: the half-step bias is invisible and it saves eight hash calls a
  // pixel). The sheet is near-horizontal, so tangent space IS world XZ and the
  // returned normal needs no TBN. Amplitude is the harbour/open-sea split the
  // audit asked for: inside the breakwater the water is glassy and the ripple
  // is a sixth of a millimetre of slope, outside it is open chop.
  vec3 ddSurfRipple(vec2 xz, float t, float calm, float camFade, float camd) {
    float amp = mix(1.0, ${REFLECT.rippleHarbourAmp.toFixed(2)}, calm) * camFade;
    float tileFade = 1.0 - smoothstep(
      ${HARBOUR_CONTACT.tileFadeFromM.toFixed(1)},
      ${HARBOUR_CONTACT.tileFadeToM.toFixed(1)}, camd);
    float e = 0.19;
    vec3 n = vec3(0.0, 1.0, 0.0);
    if (amp <= 0.001) return n;

    vec2 pA = ddRotate2(xz + vec2(t * ${REFLECT.rippleDriftBig.toFixed(2)},
                                  -t * ${(REFLECT.rippleDriftBig * 0.63).toFixed(2)}), 0.31)
      / ${REFLECT.rippleBigM.toFixed(2)};
    float a0 = ddValueNoise(pA);
    n.x -= (ddValueNoise(pA + vec2(e, 0.0)) - a0) * ${REFLECT.rippleSlopeBig.toFixed(2)} * amp;
    n.z -= (ddValueNoise(pA + vec2(0.0, e)) - a0) * ${REFLECT.rippleSlopeBig.toFixed(2)} * amp;

    vec2 pB = ddRotate2(xz + vec2(-t * ${(REFLECT.rippleDriftSmall * 0.45).toFixed(2)},
                                  t * ${REFLECT.rippleDriftSmall.toFixed(2)}), -1.07)
      / ${REFLECT.rippleSmallM.toFixed(2)} + vec2(5.9, 2.7);
    float b0 = ddValueNoise(pB);
    float w9Harbour = smoothstep(0.12, 0.55, calm) * uW9WaterAmt;
    float fineKeep = mix(1.0, tileFade, w9Harbour);
    n.x -= (ddValueNoise(pB + vec2(e, 0.0)) - b0) * ${REFLECT.rippleSlopeSmall.toFixed(2)} * amp * fineKeep;
    n.z -= (ddValueNoise(pB + vec2(0.0, e)) - b0) * ${REFLECT.rippleSlopeSmall.toFixed(2)} * amp * fineKeep;

    // A second, differently rotated fine octave breaks the visible 1.7 m
    // cadence close to camera. Both fine octaves fade before they can turn
    // into repeated screen-space tiles; W7's broad analytic swell owns range.
    float crossKeep = tileFade * w9Harbour;
    if (crossKeep > 0.001) {
      vec2 pC = ddRotate2(xz + vec2(t * 0.21, t * -0.37),
        ${HARBOUR_CONTACT.crossRotate.toFixed(2)})
        / ${HARBOUR_CONTACT.crossM.toFixed(2)} + vec2(11.3, -4.8);
      float c0 = ddValueNoise(pC);
      n.x -= (ddValueNoise(pC + vec2(e, 0.0)) - c0)
        * ${HARBOUR_CONTACT.crossSlope.toFixed(2)} * amp * crossKeep;
      n.z -= (ddValueNoise(pC + vec2(0.0, e)) - c0)
        * ${HARBOUR_CONTACT.crossSlope.toFixed(2)} * amp * crossKeep;
    }
    // W11: a 0.5–1 m ripple so the on-camera sheet has something to break on.
    // Fades later than the harbour fine tile: seafight sits at ~94 m.
    float sheetKeep = (1.0 - smoothstep(
      ${OCEAN_W11.rippleSheetFadeFromM.toFixed(1)},
      ${OCEAN_W11.rippleSheetFadeToM.toFixed(1)}, camd)) * uW11WaterAmt;
    if (sheetKeep > 0.001) {
      vec2 pS = ddRotate2(xz + vec2(t * 0.47, -t * 0.29),
        ${OCEAN_W11.rippleSheetRotate.toFixed(2)})
        / ${OCEAN_W11.rippleSheetM.toFixed(2)} + vec2(3.9, 8.1);
      float s0 = ddValueNoise(pS);
      n.x -= (ddValueNoise(pS + vec2(e, 0.0)) - s0)
        * ${OCEAN_W11.rippleSheetSlope.toFixed(2)} * amp * sheetKeep;
      n.z -= (ddValueNoise(pS + vec2(0.0, e)) - s0)
        * ${OCEAN_W11.rippleSheetSlope.toFixed(2)} * amp * sheetKeep;
    }
    return normalize(n);
  }

  float ddW11Mottle(vec2 xz) {
    vec2 p = ddRotate2(xz, 0.41);
    vec2 warp = vec2(
      ddValueNoise(p * 0.073 + vec2(2.8, 9.4)),
      ddValueNoise(p * 0.061 + vec2(7.1, 1.9))
    ) - 0.5;
    p += warp * 3.4;
    float a = ddValueNoise(p / ${OCEAN_W11.mottleM.toFixed(2)});
    float b = ddValueNoise(ddRotate2(p, 0.93) / ${OCEAN_W11.mottleCrossM.toFixed(2)} + vec2(5.2, 3.7));
    float c = ddValueNoise(ddRotate2(p, -0.61) / ${OCEAN_W11.mottleThirdM.toFixed(2)} + vec2(11.0, -6.4));
    float d = ddValueNoise(ddRotate2(p, 1.21) / 4.73 + vec2(-8.4, 2.2));
    float n = (a * 0.34 + b * 0.28 + c * 0.22 + d * 0.16) * 2.0 - 1.0;
    return n * ${OCEAN_W11.mottleContrast.toFixed(3)};
  }

  // ── P16-W6 item 1A: the planar reflection tap ────────────────────────────
  // uReflMatrix is (bias * proj * view) of the mirrored camera, so the water
  // projects its own world point into the reflection image. The ripple normal
  // pushes that UV, which is what turns a mirror into water. Four taps in a
  // rotated tent — the target is 640x360 for a 1600x900 plate, so it is
  // already a half-octave of blur before this widens it.
  vec4 ddPlanarTap(vec3 world, vec2 push) {
    vec4 clip = uReflMatrix * vec4(world, 1.0);
    if (clip.w <= 1e-4) return vec4(0.0);
    vec2 uv = clip.xy / clip.w + push;
    // Positive-form window (the W3 law): a NaN fails every comparison here and
    // returns transparent, instead of slipping through a negated test.
    if (!(uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0)) return vec4(0.0);
    vec2 r = uReflTexel * (${REFLECT.planarBlurPx.toFixed(2)}
      + ${OCEAN_W13.planarBlurExtraPx.toFixed(2)} * uW13WaterAmt);
    // W17: the 384px target already softens edges; preserve narrow gantries.
    r = mix(r, uReflTexel * 0.65, uW17ReflectionAmt);
    vec4 c = texture2D(uReflMap, uv);
    c += texture2D(uReflMap, uv + vec2(r.x, r.y));
    c += texture2D(uReflMap, uv + vec2(-r.x, r.y));
    c += texture2D(uReflMap, uv + vec2(r.x, -r.y));
    c += texture2D(uReflMap, uv + vec2(-r.x, -r.y));
    // W13: a second axis-aligned ring at the same extra radius so the 512×288
    // tiles average instead of printing as pale squares.
    c += texture2D(uReflMap, uv + vec2(r.x, 0.0)) * uW13WaterAmt;
    c += texture2D(uReflMap, uv + vec2(-r.x, 0.0)) * uW13WaterAmt;
    c += texture2D(uReflMap, uv + vec2(0.0, r.y)) * uW13WaterAmt;
    c += texture2D(uReflMap, uv + vec2(0.0, -r.y)) * uW13WaterAmt;
    c /= mix(5.0, 9.0, uW13WaterAmt);
    float solidDepth = texture2D(uReflDepth, uv).r;
    if (solidDepth < 0.999999) {
      vec4 solidView = uReflProjInv * vec4(uv * 2.0 - 1.0, solidDepth * 2.0 - 1.0, 1.0);
      float gap = abs((uReflView * vec4(world, 1.0)).z - solidView.z / solidView.w);
      c.a *= mix(1.0, 1.0 - smoothstep(20.0, 100.0, gap), uW17ReflectionAmt);
    }
    // The target is half-float LINEAR, and the body this mixes into is linear
    // too (the painted plates are squared on the way in). No decode here: the
    // first cut squared this sample and put the whole reflection four stops
    // down, which reads as "no reflection" and is how the term looked absent.
    return vec4(max(c.rgb, vec3(0.0)), clamp(c.a, 0.0, 1.0));
  }

  // P16-W9: distance, in metres along the mirrored view ray, from this water
  // fragment to the nearest reflected solid. The reflection pass already
  // writes depth; reconstructing it here makes the contact width independent
  // of screen resolution and camera distance. A clear depth or any non-finite
  // projection fails the positive-form windows and returns no contact.
  float ddReflectDepthGap(vec3 world) {
    vec4 clip = uReflMatrix * vec4(world, 1.0);
    if (clip.w <= 1e-4) return -1.0;
    vec2 uv = clip.xy / clip.w;
    if (!(uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0)) return -1.0;
    float solidDepth = texture2D(uReflDepth, uv).r;
    if (!(solidDepth >= 0.0 && solidDepth < 0.999999)) return -1.0;
    vec4 solidView = uReflProjInv * vec4(uv * 2.0 - 1.0, solidDepth * 2.0 - 1.0, 1.0);
    if (!(abs(solidView.w) >= 1e-6)) return -1.0;
    solidView /= solidView.w;
    vec4 waterView = uReflView * vec4(world, 1.0);
    float gap = waterView.z - solidView.z;
    if (!(gap >= -0.02 && gap <= ${HARBOUR_CONTACT.depthMaxM.toFixed(2)})) return -1.0;
    return max(gap, 0.0);
  }

  float ddMassOcclusion(vec3 flatWorld, vec3 R) {
    if (!uHasMass) return 0.0;
    vec2 dir = R.xz;
    float len = length(dir);
    if (len < 1e-3) return 0.0;
    dir /= len;
    float rise = max(R.y, 0.02) / len;
    float occ = 0.0;
    for (int i = 1; i <= ${REFLECT.marchN}; i += 1) {
      float s = float(i) * ${REFLECT.marchStep.toFixed(2)};
      float h = ddMassAt(flatWorld.xz + dir * s) * uMassMaxH;
      float need = rise * s;
      occ = max(occ, smoothstep(need - 0.60, need + 1.10, h));
    }
    return occ;
  }

  vec3 ddPaintedBody(float along, float front, float depth, vec3 world, float t, float camd) {
    // V = SDF: 0 at the waterline (strip bottom / sand glass) so painted
    // crest bands fan around every coast contour. U tiles along-shore.
    float reach = ${PAINTED.stripReach.toFixed(1)};
    float fadeWin = ${PAINTED.fadeWin.toFixed(1)};
    float stripV = clamp(front / reach, 0.0, 1.0);
    float stripU = ddPaintU(along, world, t);
    vec3 colA = ddPaintTap(uPaintStripA, vec2(stripU, stripV), ${PAINTED.edgeOverlap.toFixed(2)});
    vec3 colB = ddPaintTap(uPaintStripB, vec2(stripU + 0.37, stripV), ${PAINTED.edgeOverlap.toFixed(2)});
    colA *= colA;
    colB *= colB;
    // Uniform temporal A/B — never a spatial plate switch (those were
    // the marching along-shore value steps).
    float abMix = 0.5 + 0.5 * sin(t * ${PAINTED.abOmega.toFixed(2)});
    vec3 stripCol = mix(colA, colB, abMix);

    vec2 deepP = ddRotate2(
      world.xz + vec2(t * ${PAINTED.deepDriftX.toFixed(2)}, t * ${PAINTED.deepDriftZ.toFixed(2)}),
      ${PAINTED.deepRot.toFixed(3)}
    );
    float deepSpan = ${PAINTED.deepSpan0.toFixed(1)};
    vec2 deepUv = deepP / max(deepSpan, 8.0);
    float far = smoothstep(${PAINTED.calmNear.toFixed(1)}, ${PAINTED.calmFar.toFixed(1)}, camd);
    float deepBias = mix(0.0, ${PAINTED.mipBiasFar.toFixed(2)}, far);
    vec3 deepCol = texture2D(uPaintDeep, deepUv, deepBias).rgb;
    deepCol *= deepCol;
    vec3 deepMean = texture2D(uPaintDeep, deepUv, 8.0).rgb;
    deepMean *= deepMean;
    deepCol = mix(deepCol, deepMean, far * ${PAINTED.calmAmt.toFixed(2)});
    // Orchestrator W2b: the fade must COMPLETE at the strip's V clamp.
    // Starting it AT the clamp meant the whole fade band sampled the
    // strip's single clamped top row — its along-shore colours smeared
    // into vertical streak columns (r18-widebay lower third).
    // The front-driven term stays EXACTLY as it was — p10 pins its text, and it
    // is what guarantees the fade completes at the V clamp. The depth term can
    // only pull the deep plate in earlier, at a dredged wall where front lies.
    float deepMix = max(
      smoothstep(reach - fadeWin, reach, front),
      smoothstep(${PAINTED.deepByDepth0.toFixed(1)}, ${PAINTED.deepByDepth1.toFixed(1)}, depth)
    );
    vec3 paintCol = mix(stripCol, deepCol, deepMix);
    // ── P16-W5 item 3: foam that belongs to something ──
    // The white lace is IN the plate, so no foam term controls it — zeroing
    // the sheet's curl and the waterline layer both left the streaks standing
    // (shots-W5-wip/foamsrc-grid.png). Cut the plate's bright excursion over
    // its own mip mean wherever there is neither a shore nor a hull to make
    // foam, and leave it wherever there is.
    float laceShore = 1.0 - smoothstep(
      ${REFLECT.laceShoreFrom.toFixed(1)}, ${REFLECT.laceShoreTo.toFixed(1)}, max(front, 0.0));
    float laceMass = uHasMass ? max(
      max(ddMassAt(world.xz + vec2(3.0, 0.0)), ddMassAt(world.xz - vec2(3.0, 0.0))),
      max(ddMassAt(world.xz + vec2(0.0, 3.0)), ddMassAt(world.xz - vec2(0.0, 3.0)))
    ) : 0.0;
    float laceShallow = 1.0 - smoothstep(
      ${REFLECT.laceDepthFrom.toFixed(1)}, ${REFLECT.laceDepthTo.toFixed(1)}, depth);
    float openW = (1.0 - max(laceShore, laceShallow))
      * (1.0 - smoothstep(0.015, 0.18, laceMass));
    float lace = max(0.0, ddLum(paintCol) - ddLum(deepMean));
    paintCol = max(paintCol - openW * lace * ${REFLECT.laceCut.toFixed(2)}, deepMean * 0.55);
    // W11: crush the deep-plate camouflage (10–30 m / ~40 luma) so the 2–6 m
    // mottle owns the remaining grain. Near-shore strip is left alone.
    float w11Crush = mix(1.0, ${OCEAN_W11.plateCrush.toFixed(2)}, uW11WaterAmt * deepMix);
    paintCol = mix(deepMean, paintCol, w11Crush);
    float trans = exp(-max(front, 0.0) * ${ZONE_BLEND.transK.toFixed(2)})
      * (1.0 - smoothstep(0.0, ${ZONE_BLEND.transTo.toFixed(2)}, max(front, 0.0)));
    return mix(paintCol, uRampWet, trans);
  }

  void main() {
    float classMask = smoothstep(-0.12, 0.38, vFront);
    // W14: break the ruler shoreline 0.3–0.8 m and let the foam crest lap
    // onto the wet band. Spatial only — reduced motion still matches.
    float w14WetAmp = mix(
      ${OCEAN_W14.wetJitterMinM.toFixed(2)}, ${OCEAN_W14.wetJitterMaxM.toFixed(2)},
      ddValueNoise(vec2(vAlong * 0.37, 5.10)));
    float w14WetSign = ddValueNoise(vec2(vAlong * 1.15, 11.4)) * 2.0 - 1.0;
    float w14Class = smoothstep(-0.12 - w14WetAmp, 0.38 + w14WetAmp * 0.25, vFront);
    classMask = mix(classMask, w14Class, uW14WaterAmt);
    if (classMask <= 0.0) discard;

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uSunDir);
    vec3 facetN = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (dot(facetN, vec3(0.0, 1.0, 0.0)) < 0.0) facetN = -facetN;
    // R15: the 1/6 normal quantizer printed rectangular facet debris in
    // close-ups. Geometric dFdx facets stay; the snap-to-grid does not.
    facetN = normalize(facetN + vec3(0.0, 0.10, 0.0));
    float mid = smoothstep(14.0, 72.0, vFront);
    float facetW = ${PAINTED.facetMix.toFixed(2)};
    vec3 N = normalize(mix(normalize(vWaveNormal), facetN, facetW));
    float camd = distance(cameraPosition, vWorld);
    float camFade = ddCamFade(camd);
    float liveT = mix(${OCEAN.freezeTime.toFixed(2)}, uTime, uMotion);
    // Waterness, not the W6 shelter mask, owns the outer colour/reflection.
    // The transport corridor is calm by that broad mask but is still open sea.
    float outerWater = smoothstep(0.40, 0.58, vWaterness);
    float outerDeep = outerWater
      * smoothstep(${OUTER_SEA.deepFromM.toFixed(1)}, ${OUTER_SEA.deepByM.toFixed(1)}, vDepth);
    float outerSeaMask = outerDeep * uOuterSeaAmt;
    float outerMotion = outerDeep * mix(
      1.0, ${OUTER_SEA.shelterNormalKeep.toFixed(2)}, smoothstep(0.08, 0.55, vCalm));
    float outerFar = smoothstep(
      ${OUTER_SEA.farFromM.toFixed(1)}, ${OUTER_SEA.farByM.toFixed(1)}, camd);
    // P16-W5: the sheltered basin already has its SWELL authored down in the
    // vertex program (calmGate / harbourSwell). Its micro-chop was not, so the
    // harbour carried open-sea ripple on a still-water level. vCalm is the
    // same shelter gate the vertex stage computed — no second mask.
    float chopKeep = mix(1.0, ${REFLECT.harbourChop.toFixed(2)}, vCalm);
    N = normalize(mix(N, ddRippleNormal(vFlatWorld.xz, liveT, camd), ${PAINTED.microMix.toFixed(2)} * camFade * chopKeep));
    // P16-W6 item 2. The micro normal above is a 0.12 mix of anti-tiled detail
    // and never read as ripple at any camera; this is the two-octave scrolling
    // ripple the audit asked for, and it is kept as its own vector because the
    // reflection UV is pushed by IT and not by the swell.
    vec3 ripple = ddSurfRipple(vFlatWorld.xz, liveT, vCalm, camFade, camd);
    float rippleMix = uRippleMix * mix(
      ${REFLECT.rippleMixSea.toFixed(2)}, ${REFLECT.rippleMixHarbour.toFixed(2)}, vCalm
    );
    N = normalize(mix(N, ripple, rippleMix * camFade));
    if (outerMotion * uOuterSeaAmt > 0.001) {
      float macroMix = mix(
        ${OUTER_SEA.normalMixNear.toFixed(2)}, ${OUTER_SEA.normalMixFar.toFixed(2)}, outerFar);
      N = normalize(mix(
        N, normalize(vOuterSwellNormal), macroMix * outerMotion * uOuterSeaAmt));
    }
    if (N.y < 0.06) N = normalize(vec3(N.x, 0.06, N.z));

    float graze = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.4);
    float w15Iso = smoothstep(8.0, 36.0, max(vFront, 0.0));
    float w15Arc = sin(vAlong * 0.0449) * ${COAST_W15.arcA.toFixed(1)}
      + sin(vAlong * 0.0698 + 1.3) * ${COAST_W15.arcB.toFixed(1)};
    float w15N = (ddValueNoise(vec2(vAlong * 0.041, vShelfFront * 0.028)) - 0.5)
      * ${COAST_W15.edgeNoiseM.toFixed(1)};
    float w15ShelfF = vShelfFront
      + (w15Arc * (1.0 - vPortW) + w15N) * w15Iso;
    float w15Front = mix(vFront, w15ShelfF, uW15WaterAmt);
    vec3 authored = uPaintUseArt > 0.5
      ? ddPaintedBody(vAlong, w15Front, vDepth, vFlatWorld, liveT, camd)
      : ddAuthoredRamp(vDepth, vFlatWorld, vAlong, w15Front, graze);
    // One place, so the authored-plate path and the ramp fallback cannot drift.
    authored = ddSeaRedFloor(authored);
    authored *= 1.0 + ddW11Mottle(vFlatWorld.xz) * uW11WaterAmt;
    float w15Alt = smoothstep(
      ${OCEAN_W15.mottleAltFromM.toFixed(1)},
      ${OCEAN_W15.mottleAltToM.toFixed(1)}, camd);
    float w15MottleKeep = mix(1.0, ${OCEAN_W15.mottleAltKeep.toFixed(2)},
      w15Alt * uW15WaterAmt);
    float w15Mot = ddW11Mottle(vFlatWorld.xz) * uW11WaterAmt;
    authored *= mix(1.0,
      (1.0 + w15Mot * w15MottleKeep) / max(1.0 + w15Mot, 1e-4),
      uW15WaterAmt);
    float ndl = clamp(dot(N, L), 0.0, 1.0);
    float ndlQ = mix(ndl, floor(ndl * 5.0 + 0.5) / 5.0, mid);
    float face = mix(0.42, 1.30, ndlQ);
    float sunPeak = max(max(uSunColor.r, uSunColor.g), uSunColor.b);
    vec3 sunTint = mix(vec3(1.0), uSunColor / max(sunPeak, 1e-4), 0.28);
    vec3 body = authored * face * sunTint;
    body = mix(body, authored, 1.0 - uRampKeep);

    body *= 1.0 - ddTroughTerm(vHeight, vDepth) * ${PAINTED.troughScale.toFixed(2)};

    float run = uFoamPhase < 0.5 ? uFoamPhase * 2.0 : 2.0 - uFoamPhase * 2.0;
    float lineShift = ddWaterlineShift(vAlong, run);
    // R13b: shelf owns wet sand. Ocean does not paint a landward wet plate.

    DDTap tap = ddTapSample(vAlong, vFront);
    body *= mix(vec3(1.0), vec3(0.78, 0.84, 0.82), clamp(tap.crater * 0.22, 0.0, 0.18));
    // R15: tap ring was a cyan lift (0.88, 1.02, 1.10). Value-only mute.
    body *= mix(vec3(1.0), vec3(0.92, 0.94, 0.93), clamp(tap.ring * 0.48, 0.0, 0.42));

    // ── P16-W5: reflection, occlusion, waterline darkening ────────────────
    // Order matters. The reflection is mixed into the BODY before the sun
    // terms, so the glint sits on top of a reflecting surface rather than on a
    // painted one; the darkening then multiplies the body but not the glint,
    // because a hull's shadow takes the sky away and leaves the sun track.
    vec3 Rv = reflect(-V, N);
    float fres = 0.02 + 0.98 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
    fres = min(fres, ${REFLECT.reflMax.toFixed(2)});
    vec3 sky = uHasEnv
      ? ddSkyReflection(Rv)
      : mix(uFoamShadow, uFoamColor, 0.35) * (0.55 + 0.45 * max(Rv.y, 0.0));
    float skyTapLuma = ddLum(sky);
    float skyTonedLuma = mix(skyTapLuma, ddOuterSkyLuma(skyTapLuma), outerSeaMask);
    sky *= skyTonedLuma / max(skyTapLuma, 1e-4);
    float brightSkyGate = outerSeaMask * smoothstep(
      ${OUTER_SEA.skyLumaKnee.toFixed(2)}, ${OUTER_SEA.skyLumaCeil.toFixed(2)}, skyTapLuma);
    // Within a few metres of a quay wall the sky IS the wall — but only if a
    // wall is standing there. Gating this on shore distance ALONE darkened
    // every waterline on the board, and the beach has no vertical face to
    // block anything: it took the shallow tint off the sand at the corner
    // (shots-W5-wip/cmp-cc-shallow.png caught it). A four-tap ring in the mass
    // field says whether there is a wall within 4.5 m, and a beach answers no.
    float wallNear = uHasMass ? max(
      max(ddMassAt(vFlatWorld.xz + vec2(4.5, 0.0)), ddMassAt(vFlatWorld.xz - vec2(4.5, 0.0))),
      max(ddMassAt(vFlatWorld.xz + vec2(0.0, 4.5)), ddMassAt(vFlatWorld.xz - vec2(0.0, 4.5)))
    ) : 0.0;
    float shoreOcc = (1.0 - smoothstep(0.0, ${REFLECT.shoreOccM.toFixed(1)}, max(vFront, 0.0)))
      * ${REFLECT.shoreOccAmt.toFixed(2)} * smoothstep(0.02, 0.18, wallNear);
    float block = clamp(max(ddMassOcclusion(vFlatWorld, Rv), shoreOcc), 0.0, 1.0);
    vec3 blocked = uMassTint * (0.30 + 1.30 * ddLum(sky));
    vec3 refl = mix(sky, blocked, block);
    float baseSkyW = min(
      ${OUTER_SEA.reflectionBudget.toFixed(2)}, clamp(fres * uReflGain, 0.0, 1.0));
    body = mix(body, refl, baseSkyW);
    // ── P16-W6 item 1A: the planar reflection over the port basin ──────────
    // Its own mix curve, deliberately, and W5's sky path above is untouched.
    // Water's true Schlick term at this camera is 0.06-0.10: physically right
    // and visually nothing, which is why seven poses read as no reflection of
    // any hull, quay or crane. The planar term runs from REFLECT.planarFloor
    // head-on to REFLECT.planarCeil at grazing, both under W5's 0.34 ceiling,
    // so a hull reads at every angle the play camera holds without the plate
    // being replaced by a mirror.
    //
    // vCalm is the vertex stage's own shelter gate — the basin inside the
    // breakwater — so this is ON for the port and OFF (sky env only) in the
    // open bay, which is the default the brief asks for. Off the mirrored
    // frame the tap alpha is zero and the sky is what is left.
    // Re-evaluate the cheap contact ellipse per pixel so a 0.5 m collar does
    // not depend on the offshore polar mesh spacing. Vertex evaluation above
    // remains the authority for actual downward displacement.
    vec3 hullContactPx = ddHullContactField(vFlatWorld.xz);
    float w14HullGap = ddHullContactGap(vFlatWorld.xz);
    float solidWet = max(vHullContactWet, hullContactPx.y);
    float solidFoam = 0.0;
    float contactGapM = -1.0;
    vec3 solidReflectCol = refl;
    float planarKeep = 0.0;
    float basinRefl = uPlanarOn * smoothstep(0.12, 0.55, vCalm);
    // W12: the graded port cameras still see harbour water where vCalm is
    // mid-range. Keep the W9 line above (tests pin it) and admit any
    // waterness inside the mirrored frame; off-frame taps stay alpha 0.
    basinRefl = max(basinRefl, uPlanarOn * uW12WaterAmt
      * smoothstep(0.08, 0.40, vCalm) * smoothstep(0.40, 0.58, vWaterness));
    if (basinRefl > 0.004) {
      vec2 push = ripple.xz * uReflTexel * ${REFLECT.planarDistortPx.toFixed(1)};
      push *= mix(1.0, 0.28, uW17ReflectionAmt);
      vec4 planar = ddPlanarTap(vWorld, push);
      vec3 planarLin = max(planar.rgb, vec3(0.0));
      vec3 planarLift = pow(planarLin, vec3(${OCEAN_W12.planarGamma.toFixed(2)}))
        * ${OCEAN_W12.planarGain.toFixed(2)};
      float planarLuma = ddLum(planarLift);
      planarLift = mix(vec3(planarLuma), planarLift, ${OCEAN_W12.planarChroma.toFixed(2)});
      planarLift = mix(planarLin, planarLift, uW12WaterAmt);
      float fresP = mix(
        ${REFLECT.planarFloor.toFixed(2)}, ${REFLECT.planarCeil.toFixed(2)},
        pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0)
      );
      float readGain = mix(1.0, ${HARBOUR_CONTACT.planarReadGain.toFixed(2)}, uW9WaterAmt);
      float readMax = mix(1.0, ${HARBOUR_CONTACT.planarReadMax.toFixed(2)}, uW9WaterAmt);
      readMax = mix(readMax, min(readMax, ${OCEAN_W13.planarReadMax.toFixed(2)}), uW13WaterAmt);
      float wPlanar = clamp(planar.a * basinRefl * uPlanarAmt * fresP * uReflGain
        * readGain, 0.0, readMax);
      wPlanar = mix(wPlanar, min(readMax, planar.a * basinRefl * uPlanarAmt
        * mix(0.35, 0.40, pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0))), uW17ReflectionAmt);
      wPlanar = mix(wPlanar, planar.a * basinRefl * 0.45, uW18WaterAmt);
      planarKeep = wPlanar;
      solidReflectCol = planarLift * mix(
        1.0, ${HARBOUR_CONTACT.planarColourGain.toFixed(2)}, uW9WaterAmt);
      float bodyLumaPre = ddLum(body);
      float planarLiftCap = bodyLumaPre + ${OCEAN_W13.planarLumaLiftMax.toFixed(3)};
      float planarNow = ddLum(solidReflectCol);
      solidReflectCol *= mix(1.0, min(1.0, planarLiftCap / max(planarNow, 1e-4)), uW13WaterAmt);
      // W13: pale 512×288 sky tiles recolour as water, not milk.
      vec3 w13PlanarTeal = vec3(
        ${OCEAN_W13.deepTint[0].toFixed(3)},
        ${OCEAN_W13.deepTint[1].toFixed(3)},
        ${OCEAN_W13.deepTint[2].toFixed(3)});
      float w13PlanarL = ddLum(solidReflectCol);
      solidReflectCol = mix(solidReflectCol,
        w13PlanarTeal * (w13PlanarL / max(ddLum(w13PlanarTeal), 1e-3)),
        0.85 * uW13WaterAmt);
      if (uW17ReflectionAmt < 0.5) body = mix(body, solidReflectCol, wPlanar);
      // Preserve source structure for the post-calibration read below. No
      // gamma lift: this target and the receiving body are both linear.
      solidReflectCol = mix(solidReflectCol, planarLin, uW17ReflectionAmt);
      // A real reflection already carries the hull's dark side; the mass
      // field's substitute tone must stand down where it does.
      block *= 1.0 - clamp(planar.a * basinRefl, 0.0, 1.0) * 0.70;
    }

    // P16-W10: the W9 metric contact is no longer tied to the PLANAR COLOUR
    // basin. The existing reflection depth is queried near a sheltered quay,
    // near boot-baked mass, or near a registered hull; open water still skips
    // the lookup. This reaches the outer berth and sea-fight hulls without a
    // second render pass, while retaining W9's hard 0.40 m depth ruler.
    float reflectedContactGate = max(
      smoothstep(0.12, 0.55, vCalm),
      max(smoothstep(0.02, 0.18, wallNear), hullContactPx.y));
    float contactField = uContactOn * uW9WaterAmt * reflectedContactGate;
    if (contactField > 0.004) {
      float solidGap = ddReflectDepthGap(vWorld);
      contactGapM = solidGap;
      if (solidGap >= 0.0) {
        float depthWet = (1.0 - smoothstep(
          ${HARBOUR_CONTACT.wetFromM.toFixed(2)},
          ${HARBOUR_CONTACT.wetToM.toFixed(2)}, solidGap)) * contactField;
        float foamIn = smoothstep(
          ${HARBOUR_CONTACT.foamFromM.toFixed(2)},
          ${HARBOUR_CONTACT.foamPeakM.toFixed(2)}, solidGap);
        float foamOut = 1.0 - smoothstep(
          ${HARBOUR_CONTACT.foamPeakM.toFixed(2)},
          ${HARBOUR_CONTACT.foamToM.toFixed(2)}, solidGap);
        // A coherent crest with a high floor: the slow, anisotropic modulation
        // feathers the line but cannot shatter it into the muddy round blobs
        // seen at shipyard-t10. It is world-anchored and therefore TAA-stable.
        vec2 contactFlow = vec2(
          dot(vFlatWorld.xz, vec2(0.943, 0.332)) * 0.075,
          dot(vFlatWorld.xz, vec2(-0.231, 0.973)) * 0.018);
        float crestKeep = 0.70 + 0.30 * smoothstep(
          0.24, 0.76, ddValueNoise(contactFlow + vec2(13.7, 4.1)));
        solidWet = max(solidWet, depthWet);
        solidFoam = max(solidFoam, foamIn * foamOut * crestKeep * contactField);
        // W12: same depth ruler, 0.6 m meniscus + ≥0.4 m pale collar. W9's
        // 0.28 m wetTo stays pinned; this is an extra envelope on top.
        float w12Wet = (1.0 - smoothstep(
          ${OCEAN_W12.wetFromM.toFixed(2)},
          ${OCEAN_W12.wetToM.toFixed(2)}, solidGap)) * contactField * uW12WaterAmt;
        float w12Foam = smoothstep(
          ${OCEAN_W12.foamFromM.toFixed(2)},
          ${OCEAN_W12.foamPeakM.toFixed(2)}, solidGap)
          * (1.0 - smoothstep(
            ${OCEAN_W12.foamPeakM.toFixed(2)},
            ${OCEAN_W12.foamToM.toFixed(2)}, solidGap))
          * contactField * uW12WaterAmt;
        solidWet = max(solidWet, w12Wet);
        solidFoam = max(solidFoam, w12Foam);
      }
    }
    // W12 mass-field meniscus / quay-wall foam when the depth sample misses.
    if (uHasMass && uW12WaterAmt > 0.001) {
      float massClose = max(
        max(ddMassAt(vFlatWorld.xz + vec2(${OCEAN_W12.massWetM.toFixed(2)}, 0.0)),
            ddMassAt(vFlatWorld.xz - vec2(${OCEAN_W12.massWetM.toFixed(2)}, 0.0))),
        max(ddMassAt(vFlatWorld.xz + vec2(0.0, ${OCEAN_W12.massWetM.toFixed(2)})),
            ddMassAt(vFlatWorld.xz - vec2(0.0, ${OCEAN_W12.massWetM.toFixed(2)}))));
      float massFoamTap = max(
        max(ddMassAt(vFlatWorld.xz + vec2(${OCEAN_W12.massFoamM.toFixed(2)}, 0.0)),
            ddMassAt(vFlatWorld.xz - vec2(${OCEAN_W12.massFoamM.toFixed(2)}, 0.0))),
        max(ddMassAt(vFlatWorld.xz + vec2(0.0, ${OCEAN_W12.massFoamM.toFixed(2)})),
            ddMassAt(vFlatWorld.xz - vec2(0.0, ${OCEAN_W12.massFoamM.toFixed(2)}))));
      float massWet = smoothstep(0.02, 0.16, massClose) * uW12WaterAmt;
      float massFoam = (1.0 - smoothstep(0.08, 0.26, massClose))
        * smoothstep(0.03, 0.18, massFoamTap)
        * ${OCEAN_W12.massFoamAmt.toFixed(2)} * uW12WaterAmt;
      float wallFoam = smoothstep(0.04, 0.22, wallNear)
        * (1.0 - smoothstep(0.0, 0.85, solidWet))
        * ${OCEAN_W12.massFoamAmt.toFixed(2)} * uW12WaterAmt;
      solidWet = max(solidWet, massWet);
      // W14: the ±X/±Z mass foam is the square-tile jigsaw. Keep the W12
      // writes for the pin, then stand the filled white down.
      solidFoam = max(solidFoam, max(massFoam, wallFoam) * (1.0 - uW14WaterAmt));
    }
    // Calm the dark meniscus so its narrow reflected ridge reads proud of the
    // chop, then let it deepen the already-present mass occlusion.
    if (solidWet > 0.002) {
      N = normalize(mix(N, vec3(0.0, 1.0, 0.0),
        solidWet * ${HARBOUR_CONTACT.ridgeGloss.toFixed(2)}));
      block = max(block, solidWet * 0.72);
    }
    // W14: a 0.4–0.8 m bow/stern ripple so hulls sit IN the sheet. Normal
    // only; the meniscus darkening above is untouched. Peak luma ≤ 6.
    float w14Ring = smoothstep(
      ${OCEAN_W14.ringFromM.toFixed(2)}, ${(OCEAN_W14.ringFromM + 0.08).toFixed(2)}, w14HullGap)
      * (1.0 - smoothstep(
        ${(OCEAN_W14.ringToM - 0.08).toFixed(2)}, ${OCEAN_W14.ringToM.toFixed(2)}, w14HullGap));
    vec2 w14Rip = vec2(
      ddValueNoise(vFlatWorld.xz * 2.85 + vec2(liveT * 0.41, 3.2)),
      ddValueNoise(vFlatWorld.xz * 2.85 + vec2(8.1, -liveT * 0.37))) * 2.0 - 1.0;
    N = normalize(mix(N, normalize(vec3(
      N.x + w14Rip.x * ${OCEAN_W14.ringSlope.toFixed(2)} * w14Ring,
      max(N.y, 0.08),
      N.z + w14Rip.y * ${OCEAN_W14.ringSlope.toFixed(2)} * w14Ring)), uW14WaterAmt));
    // ── P16-W6 item 2: depth-based colour falloff ─────────────────────────
    // vDepth is the water column at this fragment: the baked bed depth against
    // the surface. Beer-Lambert on that column, so the shallow tint survives
    // over sand and a berth pocket falls to the deep tone, which is the
    // "no depth-based colour falloff" the audit measured. Shore-side only —
    // out past the falloff length the term is identically zero.
    float shallowW = exp(-max(vDepth, 0.0) / ${REFLECT.depthFallM.toFixed(2)});
    vec3 depthCol = mix(uDeepTint, uShallowTint, shallowW);
    // Renormalised to the body's own luminance, so this is a HUE ramp with
    // depth and not a second brightness pass fighting the painted plate.
    vec3 depthBody = depthCol * (ddLum(body) / max(ddLum(depthCol), 1e-3));
    body = mix(body, depthBody, uDepthFallAmt * (1.0 - fres) * classMask);
    // W7 extends the depth hue into the open sheet without lifting or crushing
    // its value: the extra is only the distance between W6's 0.42 and the W7
    // outer-sea ceiling, and the sheltered basin remains byte-for-byte gated.
    float outerDepthExtra = max(0.0, ${OUTER_SEA.depthMix.toFixed(2)} - uDepthFallAmt);
    body = mix(
      body, depthBody,
      outerDepthExtra * (1.0 - fres) * outerDeep * uOuterSeaAmt * classMask);
    // A hull or a wall does not only take the sky away; it puts its own dark
    // side on the water at its foot. This is the "waterline darkening" the
    // audit found missing at every quay and under every hull.
    body *= 1.0 - ${REFLECT.darkAmt.toFixed(2)} * block;

    // W7 open-water Fresnel and horizon grade. The reflected colour retains
    // W5's hull / quay
    // occlusion, while the far/grazing envelope turns the deep tone toward the
    // actual sky rather than a flat invented horizon colour.
    float outerFres = mix(
      ${OUTER_SEA.fresnelFloor.toFixed(2)}, ${OUTER_SEA.fresnelCeil.toFixed(2)},
      pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0));
    float outerSkyWant = outerSeaMask * outerFres
      * mix(1.0, ${OUTER_SEA.brightSkyFresnelKeep.toFixed(2)}, brightSkyGate);
    float outerSkyRoom = max(0.0, ${OUTER_SEA.reflectionBudget.toFixed(2)} - baseSkyW)
      / max(1e-4, 1.0 - baseSkyW);
    float outerSkyW = min(outerSkyWant, outerSkyRoom);
    body = mix(body, refl, outerSkyW);
    float skyAfterOuter = 1.0 - (1.0 - baseSkyW) * (1.0 - outerSkyW);
    float outerHorizon = outerDeep * outerFar
      * smoothstep(0.04, 0.34, graze) * ${OUTER_SEA.horizonMix.toFixed(2)} * uOuterSeaAmt;
    float horizonSkyRoom = max(
      0.0, ${OUTER_SEA.reflectionBudget.toFixed(2)} - skyAfterOuter)
      / max(1e-4, (1.0 - skyAfterOuter) * ${OUTER_SEA.horizonSkyShare.toFixed(2)});
    float horizonW = min(outerHorizon, horizonSkyRoom);
    body = mix(body, mix(depthBody, refl, ${OUTER_SEA.horizonSkyShare.toFixed(2)}), horizonW);

    // The glossy ridge remains dark after the later open-sea colour terms.
    // A sliver of its own reflected solid is retained as the wet highlight;
    // the white thread is composited with the other foam below.
    float hullWetPx = max(vHullContactWet, hullContactPx.y);
    float wetDarken = max(
      mix(
        ${HARBOUR_CONTACT.darken.toFixed(2)},
        ${OCEAN_W12.wetDarken.toFixed(2)},
        uW12WaterAmt),
      mix(
        ${HARBOUR_CONTACT.darken.toFixed(2)},
        ${HULL_CONTACT.wetDarken.toFixed(2)},
        hullWetPx * uW11WaterAmt));
    float wetWidth = fwidth(solidWet);
    float solidWetPx = max(solidWet,
      smoothstep(0.0, max(wetWidth * 2.4, 0.04), solidWet));
    body *= 1.0 - solidWetPx * wetDarken;
    body = mix(body, solidReflectCol, solidWet * 0.08);

    // Dark, glossy water-side half of the wet edge. The land-side ribbon is
    // the same baked zero contour and is capped at WET_EDGE.riseM.
    float sdfCoastGate = smoothstep(0.0, 0.12, max(vFront, 0.0))
      * (1.0 - smoothstep(24.0, 44.0, max(vFront, 0.0)));
    float sectorCoastGate = smoothstep(0.34, 0.43, vWaterness)
      * (1.0 - smoothstep(0.56, 0.74, vWaterness));
    float allCoastGate = max(sdfCoastGate, sectorCoastGate);
    float wetWater = smoothstep(0.02, 0.14, max(vDepth, 0.0))
      * (1.0 - smoothstep(
        ${WET_EDGE.waterDepthM.toFixed(2)}, ${WET_EDGE.waterFadeM.toFixed(2)}, max(vDepth, 0.0)))
      * allCoastGate;
    // A pale translucent shelf announces every solid/water meeting before the
    // nested dark meniscus and white crest take over at the final decimetres.
    // The coast depth path covers beaches; mass/reflected contact covers quay,
    // breakwater and hull walls even where the berth is dredged deep.
    float solidShelf = max(wetWater,
      smoothstep(0.02, 0.18, wallNear) * (1.0 - smoothstep(0.68, 1.0, solidWet)));
    float w14Shelf = 0.0;
    if (contactGapM >= 0.0) {
      w14Shelf = 1.0 - smoothstep(
        ${OCEAN_W14.shelfFromM.toFixed(2)}, ${OCEAN_W14.shelfToM.toFixed(2)}, contactGapM);
    }
    w14Shelf = max(w14Shelf,
      (1.0 - smoothstep(0.02, 0.35, abs(vFront)))
      * (1.0 - smoothstep(0.45, 1.6, max(vDepth, 0.0))));
    w14Shelf = max(w14Shelf, w14Ring * 0.35);
    body = mix(body, uShallowTint,
      max(solidShelf * ${WET_EDGE.shelfAmt.toFixed(2)} * uWetEdgeAmt,
          w14Shelf * ${OCEAN_W14.shelfAmt.toFixed(2)} * uW14WaterAmt));
    body *= mix(1.0, ${WET_EDGE.waterDarken.toFixed(2)}, wetWater * uWetEdgeAmt);
    body = mix(
      body, refl,
      wetWater * uWetEdgeAmt * max(fres, ${WET_EDGE.reflectionFloor.toFixed(2)}));

    vec3 H = normalize(L + V);
    float nov = max(dot(N, V), 0.001);
    float ndh = max(dot(N, H), 0.0);
    float voh = max(dot(V, H), 0.0);
    float sunAxis = smoothstep(
      ${(Math.cos(OCEAN_SPECULAR.sparkleAxisDeg * Math.PI / 180)).toFixed(6)}, 1.0, ndh);
    float waterRough = mix(
      ${OCEAN_SPECULAR.roughPlane.toFixed(2)}, ${OCEAN_SPECULAR.roughAxis.toFixed(2)}, sunAxis);
    float Dggx = ddGgxDistribution(ndh, waterRough);
    float Gggx = ddGgxVisibility(nov, max(ndl, 0.001), waterRough);
    float Fggx = ${OCEAN_SPECULAR.f0.toFixed(2)}
      + ${(1 - OCEAN_SPECULAR.f0).toFixed(2)} * pow(1.0 - voh, 5.0);
    float ggxRaw = Dggx * Gggx * Fggx
      / max(4.0 * nov * max(ndl, 0.001), 1e-4)
      * ndl * ${OCEAN_SPECULAR.sheetGain.toFixed(2)} * (1.0 - block);
    // Soft shoulder, not a clipped disc: asymptotes to the cap while retaining
    // a broad >200 px sheet as roughness opens across the wave field.
    float ggxSheet = ggxRaw / (1.0 + ggxRaw / ${OCEAN_SPECULAR.sheetCap.toFixed(2)});
    float sparkle = ddStableSparkle(vFlatWorld.xz, sunAxis)
      * ${OCEAN_SPECULAR.sparkleGain.toFixed(3)} * ndl * (1.0 - block);
    vec3 specularColour = mix(sky, uSunColor, ${OCEAN_SPECULAR.skyMix.toFixed(2)});
    body += specularColour * (ggxSheet + sparkle);
    // W11: environment sheet with a 0.12 floor at 45–55°, rising to 1 at
    // grazing. Blended over the planar so hull/crane colour still reads
    // underneath. Open sea cannot spend past W8's remaining 0.35 room.
    float envT = smoothstep(0.0, ${OCEAN_SPECULAR.envViewCos.toFixed(3)}, nov);
    float envFres = mix(
      ${OCEAN_SPECULAR.envFresnelGrazing.toFixed(2)},
      ${OCEAN_SPECULAR.envFresnelFloor.toFixed(2)}, envT);
    envFres = mix(envFres, mix(
      ${OCEAN_SPECULAR.envFresnelGrazing.toFixed(2)},
      ${OCEAN_W13.envFresnelFloor.toFixed(2)}, envT), uW13WaterAmt);
    float envW = envFres * uW11WaterAmt * (1.0 - block) * (1.0 - planarKeep * 0.85);
    float envRoom = max(0.0, ${OUTER_SEA.reflectionBudget.toFixed(2)} - skyAfterOuter)
      / max(1e-4, 1.0 - skyAfterOuter);
    envW = mix(envW, min(envW, envRoom), outerSeaMask);
    body = mix(body, sky, clamp(envW, 0.0, 1.0));
    // W12: W11 mixed sky into a body that was already sky-cyan, so quay-hero
    // did not move. Darken the still basin under the camera, then lift a
    // grazing sheet that is brighter than the painted plate. Open sea stays
    // inside W8's remaining 0.35 room.
    float w12NdotV = clamp(dot(N, V), 0.0, 1.0);
    float w12Graze = pow(1.0 - w12NdotV, 1.6);
    float w12Harbour = smoothstep(0.12, 0.55, vCalm);
    body *= mix(1.0, ${OCEAN_W12.basinBodyKeep.toFixed(2)},
      w12Harbour * (1.0 - w12Graze) * uW12WaterAmt);
    vec3 w12Tint = vec3(
      ${OCEAN_W12.sheetTint[0].toFixed(2)},
      ${OCEAN_W12.sheetTint[1].toFixed(2)},
      ${OCEAN_W12.sheetTint[2].toFixed(2)});
    vec3 w12Sheet = mix(sky, w12Tint, 0.42) * ${OCEAN_W12.sheetLift.toFixed(2)};
    float w12Amt = mix(
      ${OCEAN_W12.sheetFloor.toFixed(2)},
      ${OCEAN_W12.sheetGrazing.toFixed(2)}, w12Graze);
    w12Amt *= 0.62 + 0.38 * ddValueNoise(vFlatWorld.xz * 0.19 + vec2(4.1, 9.7));
    w12Amt *= uW12WaterAmt * (1.0 - block * 0.35);
    w12Amt = mix(w12Amt, min(w12Amt, ${OUTER_SEA.reflectionBudget.toFixed(2)}), outerSeaMask);
    body = mix(body, max(body, w12Sheet), clamp(w12Amt, 0.0, 0.85));
    // W11 sun sheet: half-vector GGX at 0.35 roughness, on-screen at every
    // play-camera pose. Additive, so it does not wipe the planar read.
    float Dsheet = ddGgxDistribution(ndh, ${OCEAN_SPECULAR.sheetRough.toFixed(2)});
    float Gsheet = ddGgxVisibility(nov, max(ndl, 0.001), ${OCEAN_SPECULAR.sheetRough.toFixed(2)});
    float Fsheet = max(Fggx, ${OCEAN_SPECULAR.envFresnelFloor.toFixed(2)});
    float sheetRaw = Dsheet * Gsheet * Fsheet
      / max(4.0 * nov * max(ndl, 0.001), 1e-4)
      * ndl * ${OCEAN_SPECULAR.sheetTermGain.toFixed(2)} * (1.0 - block) * uW11WaterAmt;
    float sunSheet = sheetRaw / (1.0 + sheetRaw / ${OCEAN_SPECULAR.sheetCap.toFixed(2)});
    // P19 X3: widen the live sheet when the sun sits in front of the camera
    // (half-vector near the view at grazing). Pinned Dsheet / sunSheet stay.
    float x3Toward = smoothstep(
      ${OCEAN_X3.towardFrom.toFixed(2)}, ${OCEAN_X3.towardTo.toFixed(2)},
      max(0.0, -dot(L, V)))
      * pow(1.0 - nov, 1.2) * uX3WaterAmt;
    float x3Rough = mix(
      ${OCEAN_SPECULAR.sheetRough.toFixed(2)},
      ${OCEAN_X3.sheetRoughWide.toFixed(2)}, x3Toward);
    float Dwide = ddGgxDistribution(ndh, x3Rough);
    float Gwide = ddGgxVisibility(nov, max(ndl, 0.001), x3Rough);
    float sheetRawWide = Dwide * Gwide * Fsheet
      / max(4.0 * nov * max(ndl, 0.001), 1e-4)
      * ndl * ${OCEAN_SPECULAR.sheetTermGain.toFixed(2)} * (1.0 - block) * uW11WaterAmt;
    float sunSheetWide = sheetRawWide / (1.0 + sheetRawWide / ${OCEAN_SPECULAR.sheetCap.toFixed(2)});
    float sunSheetLive = mix(sunSheet, sunSheetWide, x3Toward);
    float w13Lobe = smoothstep(
      ${OCEAN_W13.sheetLobeFrom.toFixed(2)}, ${OCEAN_W13.sheetLobeTo.toFixed(2)}, ndh);
    vec3 x3BeforeSheets = body;
    body += specularColour * sunSheet;
    body += specularColour * (sunSheetLive - sunSheet);
    // W13: undo the milk AFTER the W11/W12 sky lifts, then put a localised
    // half-vector tail back on. Compressing first let the sheet re-milk the
    // basin. Already-dark water (crane-close) keeps its luma; bright tiles
    // fall to the teal target.
    vec3 w13Deep = vec3(
      ${OCEAN_W13.deepTint[0].toFixed(3)},
      ${OCEAN_W13.deepTint[1].toFixed(3)},
      ${OCEAN_W13.deepTint[2].toFixed(3)});
    float w13Keep = mix(
      ${OCEAN_W13.seaBodyKeep.toFixed(2)},
      ${OCEAN_W13.basinBodyKeep.toFixed(2)}, w12Harbour);
    float w13Target = mix(
      ${OCEAN_W13.seaTarget.toFixed(2)},
      ${OCEAN_W13.basinTarget.toFixed(2)}, w12Harbour);
    float w13Cur = ddLum(body);
    float w13Scale = clamp(w13Target / max(w13Cur, 1e-4), w13Keep, 1.0);
    w13Scale = mix(1.0, w13Scale, smoothstep(w13Target * 0.70, w13Target * 1.15, w13Cur));
    vec3 w13Body = body * w13Scale;
    float w13Luma = ddLum(w13Body);
    vec3 w13Tinted = mix(
      w13Body, w13Deep * (w13Luma / max(ddLum(w13Deep), 1e-3)),
      ${OCEAN_W13.deepMix.toFixed(2)});
    float w13SatL = ddLum(w13Tinted);
    w13Tinted = mix(vec3(w13SatL), w13Tinted, ${OCEAN_W13.satPush.toFixed(2)});
    w13Tinted = max(w13Tinted, vec3(0.0));
    float w13Post = ddLum(w13Tinted);
    float w13Ceil = w13Target * 1.15;
    w13Tinted *= min(1.0, w13Ceil / max(w13Post, 1e-4));
    body = mix(body, w13Tinted, uW13WaterAmt);
    // W17: compose once AFTER body calibration so its clamp cannot flatten
    // hull/crane silhouettes. W13's 30/255 lift cap and 0.45 share cap hold.
    float w17BodyLuma = ddLum(body);
    vec3 w17Reflection = solidReflectCol;
    w17Reflection *= min(1.0, (w17BodyLuma + ${OCEAN_W13.planarLumaLiftMax.toFixed(3)})
      / max(ddLum(w17Reflection), 1e-4));
    w17Reflection = mix(w17Reflection, solidReflectCol, uW18WaterAmt);
    body = mix(body, w17Reflection, planarKeep * uW17ReflectionAmt);
    // Tight tail only: pow on the lobe so a flat harbour cannot re-milk.
    body += specularColour * sunSheetLive * ${OCEAN_W13.sheetExtra.toFixed(2)}
      * pow(w13Lobe, ${OCEAN_W13.sheetTightPow.toFixed(1)}) * uW13WaterAmt;
    // P19 X3 glare cap: sheet add ≤ 60 luma, body ≤ 215. Mix so uX3=0 is identity.
    float x3Added = max(0.0, ddLum(body) - ddLum(x3BeforeSheets));
    float x3Keep = min(1.0, ${OCEAN_X3.sheetAddMax.toFixed(4)} / max(x3Added, 1e-4));
    body = mix(x3BeforeSheets, body, mix(1.0, x3Keep, uX3WaterAmt));
    float x3Now = ddLum(body);
    body *= mix(1.0, min(1.0, ${OCEAN_X3.lumaCeil.toFixed(4)} / max(x3Now, 1e-4)),
      uX3WaterAmt);

    // W15: pristine turquoise shallows over sand, after W13 so the deep
    // basin keeps its luma/sat/hue pins. Harbour (vCalm / vPortW) is left.
    float w15Shallow = (1.0 - smoothstep(
        ${OCEAN_W15.fadeFromM.toFixed(1)}, ${OCEAN_W15.fadeToM.toFixed(1)},
        max(w15Front, 0.0)))
      * (1.0 - smoothstep(0.12, 0.55, vCalm))
      * (1.0 - vPortW * 0.72)
      * uW15WaterAmt;
    vec3 w15Turq = mix(uRampOlive, uRampTeal, 0.78);
    vec3 w15Col = mix(uRampWet, w15Turq, smoothstep(0.25, 2.8, max(vDepth, 0.0)));
    float w15Bed = exp(-max(vDepth, 0.0) * 0.85) * w15Shallow;
    body = mix(body, mix(body, w15Col, ${OCEAN_W15.shallowMix.toFixed(2)}), w15Shallow);
    body = mix(body, mix(body, uRampWet, ${OCEAN_W15.sandThrough.toFixed(2)}), w15Bed * 0.55);
    float w15Cau = sin(dot(vFlatWorld.xz, vec2(0.73, 0.68))
        * 6.28318530718 / ${OCEAN_W15.causticM.toFixed(2)})
      * sin(dot(vFlatWorld.xz, vec2(-0.61, 0.79))
        * 6.28318530718 / ${(OCEAN_W15.causticM * 1.37).toFixed(2)});
    w15Cau = w15Cau * 0.5 + 0.5;
    body += vec3(${OCEAN_W15.causticLuma.toFixed(4)}) * w15Cau
      * (1.0 - smoothstep(0.15, 3.4, max(vDepth, 0.0)))
      * smoothstep(0.02, 0.45, max(vDepth, 0.0)) * w15Shallow;
    float w15Lam = mix(${OCEAN_W15.swellFromM.toFixed(2)},
      ${OCEAN_W15.swellToM.toFixed(2)}, 0.50);
    float w15Sw = sin(max(w15Front, 0.0) * 6.28318530718 / w15Lam)
      * smoothstep(2.0, 10.0, max(w15Front, 0.0))
      * (1.0 - smoothstep(48.0, 70.0, max(w15Front, 0.0)));
    body *= 1.0 + w15Sw * ${OCEAN_W15.swellLuma.toFixed(4)} * uW15WaterAmt
      * (1.0 - smoothstep(0.12, 0.55, vCalm));
    float w15Bar = exp(-pow((w15Front - ${COAST_W15.bar1At.toFixed(1)})
        / ${COAST_W15.bar1W.toFixed(1)}, 2.0)) * 0.55
      + exp(-pow((w15Front - ${COAST_W15.bar2At.toFixed(1)})
        / ${COAST_W15.bar2W.toFixed(1)}, 2.0)) * 0.40;
    body = mix(body, mix(uRampWet, uRampTeal, 0.45),
      w15Bar * ${OCEAN_W15.barAmt.toFixed(2)} * w15Shallow);

    // W16B: evaluate shelf distance per fragment, independent of the packed
    // 8-bit depth/front bake and polar-mesh interpolation. Smooth maximum
    // joins the two edge distances; the circular fan retains W15's wet corner.
    float w16Bay = dot(vFlatWorld - uBayOrigin, uBayNormal);
    float w16Port = dot(vFlatWorld - uPortOrigin, uPortNormal);
    float w16PortW = smoothstep(-10.0, 10.0, w16Port - w16Bay);
    float w16Face = mix(uBayFace, uPortFace, w16PortW);
    float w16Delta = w16Bay - w16Port;
    float w16Edge = 0.5 * (w16Bay + w16Port
      + sqrt(w16Delta * w16Delta + 16.0)) - w16Face;
    float w16Fan = smoothstep(-4.0, 10.0, w16Bay)
      * smoothstep(-4.0, 10.0, w16Port);
    float w16Front = mix(w16Edge,
      length(max(vec2(w16Bay, w16Port), vec2(0.0))) - w16Face,
      w16Fan * (1.0 - w16PortW * ${COAST_W15.portKeep.toFixed(2)}));
    float w16Deep = smoothstep(${OCEAN_W16.deepFromM.toFixed(1)},
      ${OCEAN_W16.deepToM.toFixed(1)}, w16Front);
    float w16Open = uW16WaterAmt;
    vec3 w16Colour = mix(vec3(${OCEAN_W16.greenBlue.join(', ')}),
      vec3(${OCEAN_W16.ultramarine.join(', ')}), w16Deep);
    // Two rotated noise octaves form a soft normal, with no sine stripe or
    // stretched lookup. Symmetric derivatives preserve a zero-mean slope.
    vec2 w16P = vFlatWorld.xz + vec2(liveT * 0.23, -liveT * 0.19);
    vec2 w16Slope = vec2(0.0);
    for (int octave = 0; octave < 2; octave++) {
      float scale = octave == 0 ? 0.13 : 0.29;
      float weight = octave == 0 ? 0.65 : 0.35;
      vec2 q = ddRotate2(w16P, octave == 0 ? 0.41 : 1.37) * scale;
      vec2 slope = vec2(
        ddValueNoise(q + vec2(0.18, 0.0)) - ddValueNoise(q - vec2(0.18, 0.0)),
        ddValueNoise(q + vec2(0.0, 0.18)) - ddValueNoise(q - vec2(0.0, 0.18)));
      w16Slope += ddRotate2(slope, octave == 0 ? -0.41 : -1.37) * weight;
    }
    vec3 w16Normal = normalize(vec3(-w16Slope.x, 1.0, -w16Slope.y));
    float w16Sw = clamp(dot(w16Normal.xz, vec2(0.6, 0.8)) * 2.0, -1.0, 1.0);
    w16Colour += vec3(w16Sw * ${OCEAN_W16.swellLuma.toFixed(5)});
    // Retain a directional sun contribution rather than brightening all sea.
    w16Colour += specularColour * min(sunSheetLive, 0.16);
    float w16ColourMix = smoothstep(60.0, 110.0, w16Front);
    body = mix(body, max(w16Colour, vec3(0.0)), w16ColourMix * w16Open);

    float foamFront = vFront - lineShift;
    float leftover = mix(0.22, 1.0, 1.0 - run);
    // R13b: layer owns waterline foam (arcs + lace + lap). Ocean keeps
    // curl only seaward of the layer band. Painted-water retires the
    // offshore whitecap crops (they read as debris).
    float curl = ddBreakerArcs(vAlong, foamFront, run)
      * smoothstep(8.0, 10.0, foamFront)
      * ddArcAlong(vAlong);
    float lace = 0.0 * leftover;
    float contact = 0.0 * ddContactFoam(vFront, vPortW, vAlong, uFoamPhase);
    float cover = curl;
    float pierDa = abs(vAlong - uPierAlong);
    float pierHalf = uPierWidth * 0.5;
    float sea = dot(vFlatWorld - uBayOrigin, uBayNormal);
    float shadowZone = (1.0 - smoothstep(pierHalf, pierHalf + 8.0, pierDa))
      * smoothstep(uPierSea0, uPierSea0 + 6.0, sea)
      * (1.0 - smoothstep(uPierSea0 + uPierLength * 0.85, uPierSea0 + uPierLength, sea))
      * (1.0 - vPortW);
    cover *= mix(1.0, 0.28, shadowZone);
    cover = clamp(cover * uFoamArtGain, 0.0, 1.0);
    // ── P16-W6 item 2: the depth-driven foam mask ─────────────────────────
    // The audit's "speckle-band decal" is a band laid along the coast at a
    // fixed distance, which is why it runs straight across a sloping bed and
    // straight past a quay wall. This is the same white driven by the WATER
    // COLUMN instead: at or under 0.6 m of water the surface carries foam, and
    // the ripple moves that contour by a couple of hundred millimetres so the
    // edge is a line the sea drew rather than one the shader did. It follows a
    // bar, a hull's shoal and a boat ramp for free, because they are all in
    // the depth bake.
    float rippleBreak = (ripple.x + ripple.z) * ${REFLECT.foamRippleM.toFixed(2)};
    float wd = max(vDepth, 0.0);
    float depthFoam = 1.0 - smoothstep(
      ${REFLECT.foamDepthM.toFixed(2)} - ${REFLECT.foamDepthSoft.toFixed(2)} + rippleBreak,
      ${REFLECT.foamDepthM.toFixed(2)} + ${REFLECT.foamDepthSoft.toFixed(2)} + rippleBreak,
      wd
    );
    // Off again in the last few centimetres, so the term is a BAND across the
    // 0.6 m contour and not a white blanket over every shallow shelf. The
    // shelf already carries its own swash layer; this one is for the contour.
    depthFoam *= smoothstep(0.0, ${REFLECT.foamDepthMin.toFixed(2)}, wd);
    // W10: modulation may feather a crest but may not cut it into round
    // islands. Long/cross coordinates keep the component anisotropic and the
    // 0.68 floor keeps the principal crest connected for >=12 screen pixels.
    vec2 depthFlow = vec2(
      dot(vFlatWorld.xz, vec2(0.970, 0.243)) * 0.064,
      dot(vFlatWorld.xz, vec2(-0.354, 0.935)) * 0.021);
    float depthCrestKeep = 0.68 + 0.32 * smoothstep(
      0.22, 0.78, ddValueNoise(depthFlow + vec2(2.7, 19.1)));
    depthFoam *= depthCrestKeep * 1.18;
    // Only where there is actually a shore to break on: a berth pocket dredged
    // to 0.5 m in the middle of the basin is not a beach.
    depthFoam *= allCoastGate;
    depthFoam *= mix(1.0, ${OUTER_SEA.foamGain.toFixed(2)}, outerWater * uOuterSeaAmt);
    // W13: depth-bake foam was a white grid in the sheltered basin. Beach
    // (vCalm ~ 0) keeps it; the harbour does not.
    depthFoam *= mix(1.0, 1.0 - smoothstep(0.12, 0.45, vCalm), uW13WaterAmt);
    cover = clamp(max(cover, clamp(depthFoam, 0.0, 1.0) * uFoamDepthAmt), 0.0, 1.0);
    cover *= mix(1.0, 1.0 - 0.92 * smoothstep(0.12, 0.45, vCalm), uW13WaterAmt);
    cover = clamp(max(cover, solidFoam * mix(
      ${HARBOUR_CONTACT.foamAmt.toFixed(2)},
      ${OCEAN_W12.foamAmt.toFixed(2)}, uW12WaterAmt) * (1.0 - uW14WaterAmt)), 0.0, 1.0);
    cover = clamp(max(cover,
      max(vHullContactFoam, hullContactPx.z) * ${HULL_CONTACT.foamAmt.toFixed(2)}
      * (1.0 - uW14WaterAmt)), 0.0, 1.0);
    // ── P14 M11 item 2: the wake's own foam, in the sheet's own white. ──
    // Folded into the cover term rather than added over it, so the wake is
    // composited through the same body/foam mix as every other foam on this
    // sheet and takes the same fog, tone map and alpha. The low-frequency,
    // high-floor modulation gives fine spume without turning the V into blobs.
    float wakeFoam = ddWakeFoam(vFlatWorld.xz);
    if (wakeFoam > 0.002) {
      vec2 wakeFlow = vec2(
        dot(vFlatWorld.xz, vec2(0.910, 0.415)) * 0.082,
        dot(vFlatWorld.xz, vec2(-0.287, 0.958)) * 0.026);
      float spumeKeep = 0.72 + 0.28 * smoothstep(
        0.20, 0.80, ddValueNoise(wakeFlow + vec2(31.4, 7.2)));
      wakeFoam = min(${HULL_WAKE.foamCap.toFixed(2)}, wakeFoam * spumeKeep);
      cover = clamp(max(cover, clamp(wakeFoam, 0.0, 1.0)), 0.0, 1.0);
    }
    // W13: 2–5 px foam lines at every wall and hull, ≥220 luma. Existing
    // W9/W10/W12 contact foam stays; this is a screen-space crest on top.
    float w13HullF = max(vHullContactFoam, hullContactPx.z);
    float w13HullW = max(fwidth(w13HullF), 1e-4);
    float w13HullLine = smoothstep(0.0, w13HullW * 2.0, w13HullF)
      * (1.0 - smoothstep(w13HullW * 2.0, w13HullW * 5.0, w13HullF));
    float w13WallLine = smoothstep(0.04, 0.16, wallNear)
      * (1.0 - smoothstep(0.16, 0.42, wallNear));
    float w13FoamLine = max(w13HullLine, w13WallLine);
    w13FoamLine = max(w13FoamLine, solidFoam * (1.0 - solidWetPx * 0.35));
    cover = clamp(max(cover, w13FoamLine * ${OCEAN_W13.foamLineAmt.toFixed(2)}
      * uW13WaterAmt * (1.0 - uW14WaterAmt)), 0.0, 1.0);
    // W14: fragment crest from (a) reflected-depth gap, (b) hull-contact
    // gap, (c) circular mass ring, plus the waterline. Scrolling noise
    // tears the thread into spume. No quad decals.
    float w14PxH = max(fwidth(w14HullGap), 1e-4);
    float w14HullCrest = ddW16Crest(w14HullGap, w14PxH, camd);
    float w14DepthCrest = 0.0;
    if (contactGapM >= 0.0) {
      w14DepthCrest = ddW16Crest(contactGapM, max(fwidth(contactGapM), 1e-4), camd);
      // Reflected proxies resolve to a rectangular depth footprint at altitude.
      // The actual hull ellipse supplies the wet line once that footprint fades.
      w14DepthCrest *= 1.0 - smoothstep(170.0, 320.0, camd) * uW16WaterAmt;
    }
    float w14WallCrest = 0.0;
    if (uHasMass && wallNear > 0.012 && uW14WaterAmt > 0.001) {
      float w14MassHere = ddMassAt(vFlatWorld.xz);
      float w14MassR = ddMassRing(vFlatWorld.xz, ${OCEAN_W14.massRingM.toFixed(2)});
      w14WallCrest = (1.0 - smoothstep(0.02, 0.12, w14MassHere))
        * smoothstep(0.04, 0.16, w14MassR);
      float w14WallPx = max(fwidth(w14MassR), 1e-4);
      w14WallCrest *= 1.0 - smoothstep(w14WallPx * 1.6, w14WallPx * 5.2, w14MassR);
      // The baked mass field includes hull bounding boxes. At altitude its
      // circular taps still trace rectangular collars; keep only the metric
      // subpixel hull/depth wet line there, while shore foam remains continuous.
      w14WallCrest *= 1.0 - smoothstep(170.0, 320.0, camd) * uW16WaterAmt;
    }
    float w14FrontPx = max(fwidth(vFront), 1e-4);
    float w14ShoreCrest = max(
      ddW14Crest(max(vFront, 0.0), w14FrontPx),
      ddW14Crest(max(-vFront, 0.0), w14FrontPx) * 0.85);
    vec2 w14Flow = vFlatWorld.xz * ${OCEAN_W14.noiseScale.toFixed(2)}
      + vec2(liveT * ${OCEAN_W14.noiseScroll.toFixed(2)},
             -liveT * ${(OCEAN_W14.noiseScroll * 0.73).toFixed(2)});
    float w14Spume = ddValueNoise(w14Flow) * 0.56
      + ddValueNoise(w14Flow * 2.31 + vec2(6.2, 1.4)) * 0.44;
    float w14Crest = max(w14HullCrest, max(w14DepthCrest, max(w14WallCrest, w14ShoreCrest)));
    w14Crest *= mix(${OCEAN_W14.noiseKeep.toFixed(2)}, 1.0,
      smoothstep(0.22, 0.74, w14Spume));
    // W19: lace exists only within metric solid-contact bands.
    float w19Contact = max(1.0 - smoothstep(0.15, 2.5, w14HullGap),
      max(w14WallCrest, w14ShoreCrest));
    float w19Lace = texture2D(uW19Foam, vFlatWorld.xz / 3.0
      + liveT * vec2(0.004, -0.002)).r;
    w14Crest = mix(w14Crest, w19Contact * w19Lace, uW19Ready);
    cover = clamp(max(cover, w14Crest * ${OCEAN_W14.crestAmt.toFixed(2)} * uW14WaterAmt), 0.0, 1.0);
    vec3 foamCol = mix(uFoamColor, vec3(
      ${OCEAN_W13.foamRgb[0].toFixed(2)},
      ${OCEAN_W13.foamRgb[1].toFixed(2)},
      ${OCEAN_W13.foamRgb[2].toFixed(2)}), max(uW13WaterAmt, uW14WaterAmt));

    float bodyAlpha = mix(0.26, 1.0, smoothstep(0.0, 2.0, max(vDepth, 0.0))) * classMask;
    // W13: depth-bake holes used to punch alpha 0.26 through the harbour,
    // compositing the pale sky as tiles. Gate on vFront (vertex SDF), not the
    // packed waterness, because the same texel that zeros depth zeros that too.
    float w13Sheet = classMask * smoothstep(3.0, 10.0, max(vFront, 0.0));
    bodyAlpha = mix(bodyAlpha, max(bodyAlpha, w13Sheet), uW13WaterAmt);
    // W14: harbour / classified water is opaque even when the depth bake is 0,
    // so the polar quads cannot composite the sky as a jigsaw.
    float w14Opaque = classMask * max(
      smoothstep(0.08, 0.40, vCalm),
      smoothstep(0.40, 0.58, vWaterness));
    bodyAlpha = mix(bodyAlpha, max(bodyAlpha, w14Opaque), uW14WaterAmt);
    float bodyW = bodyAlpha * (1.0 - cover);
    float alpha = (bodyW + cover) * classMask;
    if (alpha < 0.004) discard;
    vec3 colour = (body * bodyW + foamCol * cover) / max(bodyW + cover, 1e-4);

    // W18: painted structure now comes from W19's Imagen height/albedo sheet.
    if (uW18WaterAmt > 0.001) {
      vec2 paintXZ = vFlatWorld.xz;
      float paintBasin = smoothstep(0.12, 0.70, vCalm);
      vec2 uv0 = paintXZ / 60.0 + liveT * vec2(0.0007, 0.0003);
      vec2 uv1 = ddRotate2(paintXZ, 0.73) / 14.0 + liveT * vec2(-0.0011, 0.0017);
      vec3 normal0 = texture2D(uW19Normal, uv0, 2.0).xyz * 2.0 - 1.0;
      vec3 normal1 = texture2D(uW19Normal, uv1, 2.0).xyz * 2.0 - 1.0;
      vec2 slope = normal0.xy / max(normal0.z, 0.2) * 0.65
        + ddRotate2(normal1.xy / max(normal1.z, 0.2), -0.73) * 0.22;
      slope *= uW19Ready;
      vec3 swellN = normalize(vec3(slope.x, 1.0, slope.y));
      vec3 swellL = normalize(uSunDir);
      vec3 swellH = normalize(V + swellL);
      float swellNV = max(dot(swellN, V), 0.001);
      float swellNL = max(dot(swellN, swellL), 0.001);
      float swellNH = max(dot(swellN, swellH), 0.0);
      float swellF = 0.02 + 0.98 * pow(1.0 - swellNV, 5.0);
      // Texture normal variance broadens subpixel specular to avoid post-AA ringing.
      float swellVariance = dot(dFdx(swellN), dFdx(swellN))
        + dot(dFdy(swellN), dFdy(swellN));
      float swellRough = sqrt(0.32 * 0.32 + min(0.18, swellVariance * 2.0));
      float swellSun = ddGgxDistribution(swellNH, swellRough)
        * ddGgxVisibility(swellNV, swellNL, swellRough)
        * (0.02 + 0.98 * pow(1.0 - max(dot(V, swellH), 0.0), 5.0))
        / max(4.0 * swellNV, 0.004);
      vec3 albedo = mix(texture2D(uW19Albedo, uv0).rgb,
        texture2D(uW19Albedo, uv1).rgb, 0.35);
      // Existing W13 depth/reflection luminance colours the actual image.
      float depthLuma = clamp(ddLum(colour), 0.035, 0.4);
      vec3 painted = mix(colour, albedo * (0.65 + depthLuma * 3.2), uW19Ready);
      float paintedLuma = ddLum(painted);
      painted = mix(vec3(paintedLuma), painted, 0.68);
      painted.g = mix(painted.r, painted.b, 0.42);
      painted *= 0.27 + 0.05 * swellNL;
      vec3 swellSky = uHasEnv ? ddSkyReflection(reflect(-V, swellN)) : sky;
      // Independent water environment intensity; L4B global gain is irrelevant.
      painted = mix(painted, swellSky * uW19EnvIntensity, 0.012 * (1.0 - exp(-swellF * 8.0)));
      // Preserve the MP blue chroma in sky-facing facets as well as troughs.
      painted = ddLum(painted) * vec3(0.55, 1.00, 1.60) * 0.54;
      // Broad sky/sun sheen complements the .22 microfacet glints, using the
      // same texture normal and actual sun half vector at every camera pose.
      float swellBroad = ddGgxDistribution(swellNH, 0.52)
        * ddGgxVisibility(swellNV, swellNL, 0.52)
        * (0.02 + 0.98 * pow(1.0 - max(dot(V, swellH), 0.0), 5.0))
        / max(4.0 * swellNV, 0.004);
      // W19C: a closed ellipse, not a half-plane ramp. Its centre follows
      // the sun on the sea plane; the C2 rim has zero slope at both ends.
      vec3 viewBack = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
      vec2 viewSeaCentre = cameraPosition.xz - viewBack.xz
        * ((cameraPosition.y - 0.02) / max(viewBack.y, 0.08));
      float trackFacing = dot(paintXZ - viewSeaCentre, normalize(swellL.xz))
        / max(cameraPosition.y, 20.0);
      float trackCross = dot(paintXZ - viewSeaCentre, normalize(vec2(-swellL.z, swellL.x)))
        / max(cameraPosition.y, 20.0);
      float trackWidth = 0.23;
      vec2 trackUV = vec2((trackFacing * viewBack.y - 0.40) / 0.40,
        trackCross / trackWidth);
      float trackRadius = length(trackUV);
      float trackFalloff = clamp(1.0 - trackRadius, 0.0, 1.0);
      float sunTrack = trackFalloff * trackFalloff * trackFalloff
        * (trackFalloff * (trackFalloff * 6.0 - 15.0) + 10.0);
      // Relative energy preserves blue-teal chroma and cannot turn darker
      // water into a white sheet. Image normals retain low-contrast movement.
      float swellEnergy = 0.32 * sunTrack
        * (0.92 + 0.04 * normal0.x + 0.04 * normal1.x);
      painted *= 1.0 + swellEnergy;
      // Separate sparse, pixel-footprint glints share the sunward envelope.
      float glint = ddStableSparkle(paintXZ, sunTrack)
        * smoothstep(-0.10, 0.30, normal1.x);
      painted += uSunColor * glint * 0.02;
      painted *= 0.90;
      float ring = w19Lace * w19Contact;
      colour = mix(colour, painted, uW18WaterAmt * (1.0 - cover));
      if (uW18Receipt > 0.5) colour = vec3(0.0, ring > 0.10 ? 1.0 : 0.0, 1.0);
    }

    // W20: hull-only contact survives the painted-water replacement above.
    vec3 w20Sit = ddW20HullSit(vFlatWorld.xz, normalize(uSunDir.xz));
    colour *= 1.0 - 0.30 * w20Sit.x;
    float w20Foam = max(w20Sit.y * w19Lace * uW19Ready, w20Sit.z * (0.55 + 0.45*w19Lace));
    colour = mix(colour, foamCol, w20Foam * 0.65);

    // W16B: high-pass a deterministic pixel hash (blue noise spectrum: zero
    // DC, suppressed low frequencies). Range is +/-0.5, one 8-bit code peak
    // to peak; apply before framebuffer quantisation, without time flicker.
    vec2 pixel = floor(gl_FragCoord.xy);
    float blue = 0.5 * (ddHash21(pixel) - 0.25 * (
      ddHash21(pixel + vec2(1.0, 0.0)) + ddHash21(pixel - vec2(1.0, 0.0))
      + ddHash21(pixel + vec2(0.0, 1.0)) + ddHash21(pixel - vec2(0.0, 1.0))));
    colour += vec3(blue / 255.0) * w16ColourMix * uW16WaterAmt;
    gl_FragColor = vec4(max(colour, vec3(0.0)), alpha);
  }
`;

const FOAM_LAYER_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vFlatWorld;
  uniform sampler2D uDepthMap;
  uniform vec2  uDepthOrigin;
  uniform float uDepthSpan;
  ${WORLD_CURVE_GLSL}
  void main() {
    vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
    vFlatWorld = world;
    world = ddBendWorld(world);
    vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

/**
 * Beach-foam lip on the existing coast SDF.
 * physicalM is a District Deck swash (~1% of the 20 m wet shelf), not the
 * pond shader's 0.003 local-unit width. pixelScale is screen-space coverage.
 */
export const SHORE_LIP = Object.freeze({
  physicalM: 0.12,
  pixelScale: 1.45,
  landCutPx: 0.30,
  peak: 0.42,
});

const FOAM_LAYER_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vWorld;
  varying vec3 vFlatWorld;
  uniform float uTime;
  uniform float uFoamPhase;
  uniform sampler2D uFoamMap;
  uniform sampler2D uFoamLaceA;
  uniform sampler2D uFoamLaceB;
  uniform sampler2D uFoamCrest;
  uniform float uFoamUseArt;
  uniform float uFoamArtGain;
  uniform float uPierAlong;
  uniform float uPierWidth;
  uniform float uPierLength;
  uniform float uPierSea0;
  uniform sampler2D uDepthMap;
  uniform vec2  uDepthOrigin;
  uniform float uDepthSpan;
  uniform float uDepthMax;
  uniform float uSdfOrigin;
  uniform float uSdfSpan;
  uniform vec3  uFoamColor;
  uniform vec3  uFoamShadow;
  uniform vec3  uBayOrigin;
  uniform vec3  uBayNormal;
  uniform vec3  uPortOrigin;
  uniform vec3  uPortNormal;
  uniform float uPortFace;

  float ddHash21(vec2 p) {
    vec2 q = mod(p, 8192.0);
    vec3 p3 = fract(vec3(q.x, q.y, q.x) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float ddValueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = ddHash21(i);
    float b = ddHash21(i + vec2(1.0, 0.0));
    float c = ddHash21(i + vec2(0.0, 1.0));
    float d = ddHash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float ddFbm(vec2 p, const int oct) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 6; i++) {
      if (i >= oct) break;
      v += a * ddValueNoise(p);
      p = p * 2.03 + vec2(19.7, 7.3);
      a *= 0.5;
    }
    return v;
  }

  ${OCEAN_SHARED_GLSL}

  float ddFoamCellCover(float along, float line, float t, float run, float leftover, float camd, float id) {
    float jitter = ddHash21(vec2(id * 1.73, 11.6));
    float spanU = mix(${FOAM_ART.spanUMin.toFixed(1)}, ${FOAM_ART.spanUMax.toFixed(1)}, jitter);
    float spanV = mix(${FOAM_ART.spanVMin.toFixed(1)}, ${FOAM_ART.spanVMax.toFixed(1)}, jitter);
    float uOff = ddHash21(vec2(id * 9.1, 1.2));
    float mirror = step(0.5, ddHash21(vec2(id * 2.2, 8.1)));
    float plate = step(0.5, ddHash21(vec2(id * 3.17, 2.4)));
    float reach = ddFoamSegRunUpId(id, t);
    if (!(along < 1.0e8 && along > -1.0e8)) along = 0.0;
    if (!(line < 1.0e8 && line > -1.0e8)) line = 0.0;
    float u01 = along / max(spanU, 4.0) + uOff;

    // Envelope (not a V-window) decides WHERE foam may appear. 60/40
    // breaker around sdf=0; seaward tail so +6 m still reads.
    float inBreak = smoothstep(${FOAM_ART.bandLandLo.toFixed(1)}, ${FOAM_ART.bandLandHi.toFixed(1)}, line)
      * (1.0 - smoothstep(${FOAM_ART.bandSeaLo.toFixed(1)}, ${FOAM_ART.bandSeaHi.toFixed(1)}, line));
    float vCrest = line + ${FOAM_ART.crestAnchor.toFixed(2)};
    vec2 crestUv = ddFoamPlateUv(
      DD_WIN_CREST_C, DD_WIN_CREST_A, DD_WIN_CREST_I,
      u01, vCrest, spanV, mirror
    );
    float crestArt = ddFoamArtSample(uFoamCrest, crestUv, camd);
    float breaker = inBreak * crestArt * ${FOAM_ART.crestGain.toFixed(2)};

    // Lace starts AT the waterline and runs landward with this cell's
    // 3–14 m tongue. Soft edge ~1.5 m. Art sampled at world scale.
    float inBack = (1.0 - smoothstep(0.0, ${FOAM_ART.envSoft.toFixed(1)}, line))
      * smoothstep(-reach - ${FOAM_ART.envSoft.toFixed(1)}, -reach, line);
    float back = 0.0;
    float backArt = 0.0;
    for (int w = 0; w < ${FOAM_ART.washLines}; w++) {
      float fw = float(w);
      float vLaceA = -line - DD_WIN_LACEA_W * spanV;
      float vLaceB = -line - DD_WIN_LACEB_W * spanV;
      vec2 uvA = ddFoamPlateUv(
        DD_WIN_LACEA_C, DD_WIN_LACEA_A, DD_WIN_LACEA_I,
        u01 + fw * 0.17 + 0.05 * fract(run + fw), vLaceA, spanV, mirror
      );
      vec2 uvB = ddFoamPlateUv(
        DD_WIN_LACEB_C, DD_WIN_LACEB_A, DD_WIN_LACEB_I,
        u01 + fw * 0.31 + 0.05 * fract(run + fw * 0.7), vLaceB, spanV, 1.0 - mirror
      );
      float artA = ddFoamArtSample(uFoamLaceA, uvA, camd);
      float artB = ddFoamArtSample(uFoamLaceB, uvB, camd);
      float art = mix(artA, artB, plate);
      // washHit: GLSL ES reserved-word rename (was the silent compile skip).
      float washHit = inBack * art * leftover;
      backArt = mix(backArt, art, step(back, washHit));
      back = max(back, washHit);
    }
    float backAlpha = back * mix(
      ${FOAM_ART.backwashAlphaMin.toFixed(2)},
      ${FOAM_ART.backwashAlphaMax.toFixed(2)},
      backArt
    );
    return max(breaker, backAlpha);
  }

  float ddAuthoredShore(float along, float line, float t, float run, float leftover, float camd) {
    float arc = ddArcAlong(along);
    if (arc <= 0.001) return 0.0;
    float id = ddFoamSegId(along);
    float b0 = ddFoamSegB0(id);
    float b1 = ddFoamSegB0(id + 1.0);
    float idN = id + mix(-1.0, 1.0, step(b1 - along, along - b0));
    float w = ddFoamCellWeight(along, id);
    float wN = ddFoamCellWeight(along, idN);
    float cover = ddFoamCellCover(along, line, t, run, leftover, camd, id);
    float coverN = ddFoamCellCover(along, line, t, run, leftover, camd, idN);
    return (cover * w + coverN * wN) / max(w + wN, 1e-4) * arc;
  }

  void main() {
    vec2 duv = (vFlatWorld.xz - uDepthOrigin) / uDepthSpan;
    vec4 packed = texture2D(uDepthMap, duv);
    float warpedFront = packed.b * uSdfSpan + uSdfOrigin;
    float unwarpedFront = packed.a * uSdfSpan + uSdfOrigin;
    float sdf = min(warpedFront, unwarpedFront);
    if (!(sdf < 1.0e8 && sdf > -1.0e8)) sdf = 0.0;
    float waterness = packed.g;
    float run = uFoamPhase < 0.5 ? uFoamPhase * 2.0 : 2.0 - uFoamPhase * 2.0;
    float leftover = mix(0.22, 1.0, 1.0 - run);
    float seaBay = dot(vFlatWorld - uBayOrigin, uBayNormal);
    float seaPortA = dot(vFlatWorld - uPortOrigin, uPortNormal);
    float portBlend = smoothstep(-10.0, 10.0, seaPortA - seaBay);
    vec3 shoreN = normalize(mix(uBayNormal, uPortNormal, portBlend));
    float along = dot(vFlatWorld.xz, vec2(shoreN.z, -shoreN.x));
    if (!(along < 1.0e8 && along > -1.0e8)) along = 0.0;
    float lineShift = ddWaterlineShift(along, run);
    // R16: the authored ribbon is centred on the SDF waterline. The ±4 m
    // living-waterline shift beached the slabs (clear water below). A
    // centimetre-scale rag keeps the terminator from reading as a ruler.
    float rag = (ddHash21(vec2(floor(along * 0.31), 5.2)) - 0.5) * 0.8;
    float line = sdf - rag;
    float foamFront = sdf - lineShift;
    // Lace sits on the shared SDF waterline, not the sector-diagonal waterness 0.5.
    float wetGate = step(0.38, waterness);
    float cover;
    if (uFoamUseArt > 0.5) {
      float camd = distance(cameraPosition, vWorld);
      cover = ddAuthoredShore(along, line, uTime, run, leftover, camd) * wetGate;
    } else {
      // Baked-mask fallback: current discrete arcs + lace. Never crash.
      float curl = ddBreakerArcs(along, foamFront, run) * wetGate * ddArcAlong(along);
      float lace = ddRetreatLace(foamFront, leftover) * (1.0 - run) * wetGate * ddArcAlong(along);
      cover = max(curl, lace);
    }
    // P13-W: same authored lace on the SAND wrap-front at the NE corner
    // (bay-east only). max() not add — no second white blanket. NaN-gated
    // along/shore/line so a degenerate wrap cannot RepeatWrap.
    float cornerMx = smoothstep(${(SHORE.cornerMaskX - SHORE.cornerMaskFeather).toFixed(1)}, ${Number(SHORE.cornerMaskX).toFixed(1)}, vFlatWorld.x);
    float cornerMz = 1.0 - smoothstep(${Number(SHORE.cornerMaskZ).toFixed(1)}, ${(SHORE.cornerMaskZ + SHORE.cornerMaskFeather).toFixed(1)}, vFlatWorld.z);
    float cornerM = clamp(cornerMx * cornerMz, 0.0, 1.0);
    if (cornerM > 0.002 && uBayNormal.x > 0.70) {
      float sandShore = dot(vFlatWorld - uBayOrigin, uBayNormal);
      float sandAlong = dot(vFlatWorld.xz, vec2(uBayNormal.z, -uBayNormal.x));
      if (!(sandAlong < 1.0e8 && sandAlong > -1.0e8)) sandAlong = 0.0;
      if (!(sandShore < 1.0e8 && sandShore > -1.0e8)) sandShore = 0.0;
      float alongHalfM = 136.0;
      float bayCentre = uBayOrigin.x * uBayNormal.z - uBayOrigin.z * uBayNormal.x;
      float extra = abs(sandAlong - bayCentre) - alongHalfM;
      float wrapLine = extra <= 0.0
        ? sandShore - ${Number(SHORE.waterFromWall).toFixed(2)}
        : length(vec2(extra, sandShore)) - ${Number(SHORE.waterFromWall).toFixed(2)};
      if (!(wrapLine < 1.0e8 && wrapLine > -1.0e8)) wrapLine = 0.0;
      // P13-W2: metres-along the cap (atan * face) so foam cell / arc
      // density matches the east-face. Polar sandAlong stretched the
      // cells and left the wrap ribbon thinner than mid-beach lace.
      float wrapAlongUse = sandAlong;
      if (extra > 0.0) {
        float capAng = atan(extra, max(sandShore, 0.05));
        if (!(capAng < 1.0e8 && capAng > -1.0e8)) capAng = 0.0;
        wrapAlongUse = bayCentre + alongHalfM - capAng * ${Number(SHORE.waterFromWall).toFixed(2)};
        if (!(wrapAlongUse < 1.0e8 && wrapAlongUse > -1.0e8)) wrapAlongUse = sandAlong;
      }
      float wrapRag = (ddHash21(vec2(floor(wrapAlongUse * 0.31), 5.2)) - 0.5) * 0.8;
      float wrapCamd = distance(cameraPosition, vWorld);
      float wrapCover = ddAuthoredShore(wrapAlongUse, wrapLine - wrapRag, uTime, run, leftover, wrapCamd);
      // Waterline ribbon, not a 14 m inland fan (W residual still holds).
      float wrapBand = smoothstep(${Number(SHORE.cornerLaceLand0).toFixed(1)}, ${Number(SHORE.cornerLaceLand1).toFixed(1)}, wrapLine)
        * (1.0 - smoothstep(${Number(SHORE.cornerLaceSea0).toFixed(1)}, ${Number(SHORE.cornerLaceSea1).toFixed(1)}, wrapLine));
      cover = max(cover, wrapCover * cornerM * wrapBand);
    }
    float portW = portBlend;
    float lap = 0.78 + 0.22 * sin(uFoamPhase * 6.28318530718 + along * 0.31);
    float contact = (1.0 - smoothstep(0.35, ${FOAM_MASK.contactW.toFixed(2)}, abs(sdf)))
      * smoothstep(0.28, 0.78, portW) * lap * 0.88;
    // Pier collars around posts + calmer shadow along the deck.
    float pierDa = abs(along - uPierAlong);
    float pierHalf = uPierWidth * 0.5;
    float collar = 0.0;
    for (int s = 0; s < 7; s++) {
      float ts = (float(s) + 0.5) / 7.0;
      float seaP = uPierSea0 + uPierLength * ts;
      for (int side = 0; side < 2; side++) {
        float aP = uPierAlong + mix(-1.0, 1.0, float(side)) * uPierWidth * 0.34;
        float d = length(vec2(along - aP, seaBay - seaP));
        collar = max(collar, 1.0 - smoothstep(0.45, 1.40, d));
      }
    }
    float faceLap = (1.0 - smoothstep(pierHalf + 0.2, pierHalf + 3.6, pierDa))
      * (1.0 - smoothstep(1.1, 4.4, abs(seaBay - 0.5)));
    float shadowZone = (1.0 - smoothstep(pierHalf, pierHalf + 8.0, pierDa))
      * smoothstep(uPierSea0, uPierSea0 + 6.0, seaBay)
      * (1.0 - smoothstep(uPierSea0 + uPierLength * 0.85, uPierSea0 + uPierLength, seaBay));
    float pierGate = 1.0 - portW;
    cover = max(cover, collar * pierGate * 0.85);
    cover = max(cover, faceLap * pierGate * 0.55);
    cover *= mix(1.0, 0.32, shadowZone * pierGate * (1.0 - collar));
    cover = max(cover, contact * 0.80);
    cover = clamp(cover * uFoamArtGain, 0.0, 1.0);
    // Water-side lip on the existing SDF. The old abs(sdf) gate kept a
    // land-side ribbon. Width is a decimetre swash or ~1.5 pixels, whichever
    // is wider — screen scale, not a copied pond constant.
    // WATER LAW FOAM RULE (TASTE-BIBLE 6, water/law.js shoreFoam). A band 2-4 m
    // wide on the water side of the waterline, broken by noise at 1.5 m feature
    // size, swashing at 0.3 Hz, opacity 0.7. The authored breaker and lace plates
    // above were cut to a 12 cm lip, which is the dashed white polyline along the
    // sand/water join; they no longer reach the screen.
    float swash = 0.5 + 0.5 * sin(uTime * ${(2 * Math.PI * WATER_LAW.shoreFoam.hz).toFixed(5)} + along * 0.17);
    float bandW = mix(${WATER_LAW.shoreFoam.bandMin.toFixed(1)}, ${WATER_LAW.shoreFoam.bandMax.toFixed(1)}, ddValueNoise(vec2(along * 0.045, 3.1)));
    float reachM = bandW * (0.70 + 0.30 * swash);
    // W4-A: the band is measured from a waved copy of the coast distance. The analytic coast is a
    // polyline (the Apostles cove waterline is a chevron of straight runs), and a band whose landward
    // edge is a 0.35 m smoothstep of that polyline came out as a pale strip with straight sides and
    // straight ends. Noise at 6 m (3 m deep) and 2 m (1.2 m deep) turns the edges and ends into a shoreline.
    float sdfW = sdf + (ddValueNoise(vFlatWorld.xz * 0.16 + vec2(5.3, 1.7)) - 0.5) * 3.0
      + (ddValueNoise(vFlatWorld.xz * 0.45 + vec2(2.1, 8.3)) - 0.5) * 1.2;
    float shoreIn = smoothstep(-0.2, 0.9, sdfW);
    float shoreOut = 1.0 - smoothstep(reachM * 0.45, reachM, sdfW);
    vec2 foamP = vFlatWorld.xz / ${WATER_LAW.shoreFoam.noiseM.toFixed(1)} + vec2(uTime * 0.30, -uTime * 0.20);
    float lace = ddFbm(foamP, 3);
    float taper = 1.0 - clamp(sdfW / max(reachM, 0.1), 0.0, 1.0);
    float broken = smoothstep(0.40, 0.62, lace + 0.30 * taper);
    cover = shoreIn * shoreOut * broken * ${WATER_LAW.shoreFoam.opacity.toFixed(2)};
    // R5B: walls keep their face waterline and water shadow, not a beach
    // swash apron. The continuous beach SDF edge remains on the bay sector.
    cover *= 1.0 - smoothstep(0.28, 0.65, portW);
    if (cover < 0.008) discard;
    vec3 col = mix(uFoamShadow, uFoamColor, clamp(cover, 0.0, 1.0));
    gl_FragColor = vec4(col * cover, cover);
  }
`;

/**
 * Wave 78 phase 2b lane 3 (COAST_SPINE on only): the low-quality foam layer with its `sdf` (the lip, the cover, the wave-noised band) taken from the spine's
 * front inside the beach (`ddSpineWaterFront`, coast-spine.js) in place of the packed 8-bit SDF, so the lip lies on d's zero (the same function as the sea's).
 * It has no drift of its own: the old layer read the static SDF too. Off: `FOAM_LAYER_FRAG` itself, byte for byte.
 */
const FOAM_LAYER_FRAG_SPINE = (() => {
  const main = '  void main() {';
  const sdf = '    if (!(sdf < 1.0e8 && sdf > -1.0e8)) sdf = 0.0;\n';
  for (const [name, text] of [['main', main], ['sdf', sdf]]) {
    if (FOAM_LAYER_FRAG.split(text).length !== 2) throw new Error(`foam layer: the ${name} anchor is not unique`);
  }
  return FOAM_LAYER_FRAG
    .replace(main, () => `${FOAM_SPINE_PRELUDE_GLSL}\n${COAST_SPINE_GLSL}\n${COAST_WATER_FRONT_GLSL}\n${main}`)
    .replace(sdf, () => `${sdf}    float spineLipW;\n    sdf = ddSpineWaterFront(vFlatWorld.xz, sdf, spineLipW);\n`);
})();

function dummyFrame(city) {
  const extent = city.extent ?? { x: 272, z: 272 };
  const edge = city.waterEdge ?? 'south';
  const origin = wallOrigin(edge, extent);
  const { seaward } = edgeAxes(edge);
  return {
    origin,
    normal: seaward.clone(),
    along: edge === 'north' || edge === 'south' ? 'x' : 'z',
    length: edge === 'north' || edge === 'south' ? extent.x : extent.z,
  };
}

/**
 * Unified ocean sheet + beach foam layer. One material for the sheet.
 */
/**
 * ── P16-W6 PROTOTYPE A: the planar harbour reflector ──────────────────────
 *
 * A mirrored camera renders the port's large forms — hulls, gantries, quay
 * walls, sheds, tanks — into a 640x360 target, and the ocean shader samples it
 * through the same projection, distorted by the ripple normal. This is a true
 * reflection: the crane's yellow and the hull's blue land in the water, which
 * is what W5's mass field could not do (it knew the mass was there and only
 * took the sky away under it).
 *
 * Three decisions make it affordable on a board that already draws 14k calls
 * and 12M triangles per frame:
 *
 * 1. **It renders PROXIES, not the scene.** The port subtree is 8,286 meshes;
 *    a second `renderer.render(scene, mirrorCam)` would walk 46,457 nodes and
 *    re-cull them whatever the camera layers say, because three's
 *    `projectObject` descends the whole graph regardless. The reflection scene
 *    holds one lightweight `Mesh` per qualifying source mesh, sharing its
 *    geometry (and, for an InstancedMesh, its `instanceMatrix` buffer), so the
 *    traversal is over the reflection set alone.
 * 2. **The proxies are Lambert, lit by one sun and one hemisphere.** Sharing
 *    the source materials would compile a second program variant for every one
 *    of them (different light counts, no shadow maps). One material class and
 *    two lights is one program for the whole pass, and at 640x360 under a 0.34
 *    Fresnel ceiling the difference between Lambert and the board's full
 *    standard shading does not survive the blur.
 * 3. **No shadow pass.** `shadowMap.autoUpdate` is off across the call, so the
 *    reflection reuses nothing and re-renders nothing.
 *
 * The source meshes still carry `layers.enable(REFLECT.layer)` as the record
 * of membership — that is the "reflection layer" — and the mirror camera is
 * pinned to that layer, so a proxy that ever ends up in the main graph by
 * accident is invisible to the play camera.
 */
export class HarbourReflector {
  constructor({
    width = REFLECT.planarW,
    height = REFLECT.planarH,
    planeY = WATER_Y,
    layer = REFLECT.layer,
  } = {}) {
    this.enabled = false;
    this.planeY = planeY;
    this.layer = layer;
    this.target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      // Half-float and LINEAR. An 8-bit linear target spends ten of its codes
      // on the bottom fifth of the visible range, which is exactly the range a
      // harbour reflection lives in; and an 8-bit sRGB target would have to be
      // decoded in the shader, which is one more place for the plate's
      // squared-plate convention to drift out of step.
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    this.target.texture.name = 'nature:water:reflection';
    // The pass already paid for a depth buffer. Expose that same attachment to
    // the ocean shader so W9 can measure a metric water/solid gap without a
    // second camera, scene traversal or render target.
    this.depthTexture = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);
    this.depthTexture.name = 'nature:water:reflection-depth';
    this.depthTexture.format = THREE.DepthFormat;
    this.depthTexture.type = THREE.UnsignedIntType;
    this.depthTexture.minFilter = THREE.NearestFilter;
    this.depthTexture.magFilter = THREE.NearestFilter;
    this.depthTexture.generateMipmaps = false;
    this.target.depthTexture = this.depthTexture;
    this.texture = this.target.texture;
    this.textureMatrix = new THREE.Matrix4();
    this.depthProjectionInverse = new THREE.Matrix4();
    this.depthViewMatrix = new THREE.Matrix4();
    this.scene = new THREE.Scene();
    this.scene.name = 'nature:water:reflection-scene';
    // Every proxy matrix is written by hand from its source, so three has no
    // hierarchy to walk here.
    this.scene.matrixWorldAutoUpdate = false;
    this.camera = new THREE.PerspectiveCamera();
    this.camera.layers.set(layer);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.1);
    this.sun.castShadow = false;
    this.sun.position.set(-0.4, 1.0, 0.55);
    // The mirror camera is pinned to the reflection layer, and three's
    // `projectObject` layer-tests LIGHTS as well as meshes: leave these on
    // layer 0 and the pass collects no lights at all, compiles a zero-light
    // program and renders the whole port black. (It did, once.)
    this.sun.layers.set(layer);
    this.scene.add(this.sun);
    this.sky = new THREE.HemisphereLight(0xbcd7ea, 0x51606a, 1.15);
    this.sky.layers.set(layer);
    this.scene.add(this.sky);
    this.proxies = [];
    this.merged = [];
    this._finalised = false;
    this._materials = new Map();
    this._ownedMaterials = [];
    this._ownedGeometries = [];
    this._clearColor = new THREE.Color(0x000000);
    this._normal = new THREE.Vector3(0, 1, 0);
    this._reflectorPos = new THREE.Vector3(0, planeY, 0);
    this._cameraPos = new THREE.Vector3();
    this._view = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._rot = new THREE.Matrix4();
    this._plane = new THREE.Plane();
    this._clipPlane = new THREE.Vector4();
    this._q = new THREE.Vector4();
    this._savedClear = new THREE.Color();
    this.stats = {
      proxies: 0, instanced: 0, materials: 0, triangles: 0, merged: 0, drawObjects: 0,
    };
    this._reflectCadence = 0;
    this._drewOnce = false;
    // P14-M9 item 2: enrol so late-built port mass (the military shipyard) can
    // reach the proxy layer without a forward through `water.js`.
    LATE_SUBTREE_TARGETS.add(this);
  }

  /**
   * Lambert stand-in for a source material, cached so one program serves all.
   * The cache key is the source's colour QUANTISED to 12 steps a channel, plus
   * its map and its two-sidedness — not the source material object. The port's
   * 8,286 meshes carry 172 distinct materials, and 172 material switches over
   * ~220 draws is a state change per draw; quantising folds them to a couple of
   * dozen buckets that three can then batch, and at 512x288 under a blur no
   * viewer can tell a crane's orange from the next crane's orange.
   */
  _proxyMaterial(source) {
    const src = Array.isArray(source) ? source[0] : source;
    if (!src) return null;
    const q = (v) => Math.round(Math.min(1, Math.max(0, v)) * 12);
    const c = src.color;
    const key = c
      ? `${src.map?.uuid ?? '-'}|${q(c.r)},${q(c.g)},${q(c.b)}|${src.side ?? 0}|${src.transparent ? 1 : 0}`
      : `${src.map?.uuid ?? '-'}|none|${src.side ?? 0}|${src.transparent ? 1 : 0}`;
    const hit = this._materials.get(key);
    if (hit) return hit;
    const mat = new THREE.MeshLambertMaterial({
      color: src.color ? src.color.clone() : new THREE.Color(0x8a949c),
      map: src.map ?? null,
      side: src.side ?? THREE.FrontSide,
      transparent: Boolean(src.transparent),
      opacity: src.opacity ?? 1,
      alphaTest: src.alphaTest ?? 0,
      vertexColors: Boolean(src.vertexColors),
      flatShading: Boolean(src.flatShading),
      fog: true,
    });
    if (src.emissive && src.emissiveIntensity > 0) {
      mat.emissive = src.emissive.clone();
      mat.emissiveIntensity = Math.min(src.emissiveIntensity, 1);
    }
    this._materials.set(key, mat);
    this._ownedMaterials.push(mat);
    return mat;
  }

  /**
   * Build the reflection set from meshes already carrying `REFLECT.layer`.
   * Called once, from the same walk that bakes the mass field, so the "large
   * port forms" test is written down in exactly one place.
   */
  addSource(mesh) {
    if (!mesh?.isMesh || !mesh.geometry) return false;
    const material = this._proxyMaterial(mesh.material);
    if (!material) return false;
    let proxy;
    if (mesh.isInstancedMesh) {
      proxy = new THREE.InstancedMesh(mesh.geometry, material, mesh.count);
      // Share the buffer rather than copy it: an instanced stack that moves
      // moves in the reflection too, with no per-frame upload.
      proxy.instanceMatrix = mesh.instanceMatrix;
      if (mesh.instanceColor) proxy.instanceColor = mesh.instanceColor;
      proxy.count = mesh.count;
      this.stats.instanced += 1;
    } else {
      proxy = new THREE.Mesh(mesh.geometry, material);
    }
    proxy.name = `nature:water:reflect-proxy:${this.proxies.length}`;
    proxy.matrixAutoUpdate = false;
    proxy.castShadow = false;
    proxy.receiveShadow = false;
    proxy.layers.set(this.layer);
    proxy.matrix.copy(mesh.matrixWorld);
    proxy.matrixWorld.copy(mesh.matrixWorld);
    proxy.frustumCulled = true;
    proxy.userData.reflectSource = mesh;
    this.scene.add(proxy);
    this.proxies.push(proxy);
    const index = mesh.geometry.index;
    const pos = mesh.geometry.attributes?.position;
    const tris = index ? index.count / 3 : (pos ? pos.count / 3 : 0);
    this.stats.triangles += Math.round(tris * (mesh.isInstancedMesh ? mesh.count : 1));
    this.stats.proxies = this.proxies.length;
    this.stats.materials = this._materials.size;
    return true;
  }

  /**
   * Fold the STATIC half of the reflection set into one mesh per material.
   *
   * The pass's cost is per-OBJECT, not per-pixel: at 512x288 the fill is
   * nothing and the bill is three's `projectObject` walk, the frustum test and
   * the per-draw uniform upload, about six microseconds each. 735 proxies is
   * therefore about 4.4 ms, and the brief's ceiling is 4. Merging the static
   * forms — the quay, the gantries, the sheds, the tanks — into one buffer per
   * material bucket drops the object count by roughly five to one without
   * removing a single form from the water.
   *
   * Vessels and instanced stacks are NOT merged: a hull that gets under way
   * has to take its reflection with it, and an InstancedMesh proxy already
   * draws a whole container stack in one call. Both keep their live matrix
   * sync in `render`.
   */
  finalise() {
    if (this._finalised) return this.stats;
    this._finalised = true;
    // Only things that actually move. The first cut also excluded `harbour`
    // (the parent group of every quayside fixture, not just the craft) and
    // `crane` (the gantry structure is bolted down; its trolley and hoist are
    // the moving parts and they are named), and merged 210 of 735 instead of
    // 600 — the difference between +4.4 ms and +2.4.
    const dynamic = /ship|barge|tug|boat|vessel|tanker|craft|hoist|trolley|spreader/;
    /** @type {Map<THREE.Material, THREE.Mesh[]>} */
    const buckets = new Map();
    const keep = [];
    for (const proxy of this.proxies) {
      const src = proxy.userData.reflectSource;
      let moves = Boolean(proxy.isInstancedMesh);
      for (let q = src; q && !moves; q = q.parent) {
        if (typeof q.name === 'string' && dynamic.test(q.name)) moves = true;
      }
      const g = src?.geometry;
      const usable = g?.attributes?.position && g.attributes.normal && g.attributes.uv;
      if (moves || !usable) { keep.push(proxy); continue; }
      const list = buckets.get(proxy.material) ?? [];
      list.push(proxy);
      buckets.set(proxy.material, list);
    }
    const CHUNK = 240000;
    for (const [mat, list] of buckets) {
      if (list.length < 3) { keep.push(...list); continue; }
      let batch = [];
      let verts = 0;
      const flush = () => {
        if (batch.length < 2) { keep.push(...batch); batch = []; verts = 0; return; }
        this._mergeBatch(batch, mat, verts);
        for (const proxy of batch) this.scene.remove(proxy);
        batch = [];
        verts = 0;
      };
      for (const proxy of list) {
        const g = proxy.geometry;
        const n = g.index ? g.index.count : g.attributes.position.count;
        if (verts + n > CHUNK) flush();
        batch.push(proxy);
        verts += n;
      }
      flush();
    }
    this.proxies = keep;
    this.stats.proxies = this.proxies.length;
    this.stats.merged = this.merged.length;
    this.stats.drawObjects = this.proxies.length + this.merged.length;
    return this.stats;
  }

  /** One merged, world-baked mesh for a batch of static proxies. */
  _mergeBatch(batch, material, verts) {
    const pos = new Float32Array(verts * 3);
    const nor = new Float32Array(verts * 3);
    const uvs = new Float32Array(verts * 2);
    const v = new THREE.Vector3();
    const nm = new THREE.Matrix3();
    let w = 0;
    for (const proxy of batch) {
      const g = proxy.geometry;
      const P = g.attributes.position;
      const N = g.attributes.normal;
      const U = g.attributes.uv;
      const idx = g.index;
      const count = idx ? idx.count : P.count;
      nm.getNormalMatrix(proxy.matrixWorld);
      for (let i = 0; i < count; i += 1) {
        const k = idx ? idx.getX(i) : i;
        v.fromBufferAttribute(P, k).applyMatrix4(proxy.matrixWorld);
        pos[w * 3] = v.x; pos[w * 3 + 1] = v.y; pos[w * 3 + 2] = v.z;
        v.fromBufferAttribute(N, k).applyMatrix3(nm).normalize();
        nor[w * 3] = v.x; nor[w * 3 + 1] = v.y; nor[w * 3 + 2] = v.z;
        uvs[w * 2] = U.getX(k); uvs[w * 2 + 1] = U.getY(k);
        w += 1;
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geom.computeBoundingSphere();
    const mesh = new THREE.Mesh(geom, material);
    mesh.name = `nature:water:reflect-merged:${this.merged.length}`;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.layers.set(this.layer);
    mesh.updateMatrix();
    mesh.updateMatrixWorld(true);
    this.scene.add(mesh);
    this.merged.push(mesh);
    this._ownedGeometries.push(geom);
  }

  /** Sun direction / colour, so the reflection is lit like the board is. */
  setSolar(sunDir, sunColor) {
    if (sunDir) this.sun.position.copy(sunDir).multiplyScalar(120);
    if (sunColor) this.sun.color.copy(sunColor);
  }

  /**
   * Mirror the play camera about the water plane and draw. Follows three's own
   * `Reflector`: the camera is MOVED and re-aimed rather than the projection
   * being negated, so triangle winding is preserved and no material needs a
   * side flip. The near plane is then made oblique to the water so nothing
   * below the surface leaks into the reflection — an oblique projection rather
   * than `renderer.clippingPlanes`, which would force a second program variant
   * on every material in the pass.
   */
  render(renderer, camera, scene) {
    if (!this.enabled || !renderer || !camera) return false;
    if (!this.proxies.length && !this.merged.length) return false;
    this._reflectCadence += 1;
    // P19 X1C: skip the planar pass when no water sits in the lower half of the view.
    if (!waterInFrustumLowerHalf(camera, this.planeY)) return false;
    // P19 X1B: 384×216, every 2nd frame. Keep the last colour/depth when we skip.
    if (this._drewOnce && (this._reflectCadence & 1) === 0) return true;
    // Live matrices for anything that moves (a tug under way, a swinging boom).
    for (let i = 0; i < this.proxies.length; i += 1) {
      const proxy = this.proxies[i];
      const src = proxy.userData.reflectSource;
      if (src) {
        proxy.matrix.copy(src.matrixWorld);
        proxy.matrixWorld.copy(src.matrixWorld);
        proxy.visible = src.visible;
        if (src.isInstancedMesh) proxy.count = src.count;
      }
    }
    this.scene.fog = scene?.fog ?? null;
    this._cameraPos.setFromMatrixPosition(camera.matrixWorld);
    this._view.subVectors(this._reflectorPos, this._cameraPos);
    // Camera under the water plane: there is no reflection to draw.
    if (this._view.dot(this._normal) > 0) return false;
    this._view.reflect(this._normal).negate();
    this._view.add(this._reflectorPos);
    this._rot.extractRotation(camera.matrixWorld);
    this._look.set(0, 0, -1).applyMatrix4(this._rot).add(this._cameraPos);
    this._target.subVectors(this._reflectorPos, this._look);
    this._target.reflect(this._normal).negate();
    this._target.add(this._reflectorPos);
    this.camera.position.copy(this._view);
    this._up.set(0, 1, 0).applyMatrix4(this._rot).reflect(this._normal).negate();
    this.camera.up.copy(this._up);
    this.camera.lookAt(this._target);
    this.camera.far = camera.far;
    this.camera.near = camera.near;
    this.camera.fov = camera.fov;
    this.camera.aspect = camera.aspect;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();

    // Screen-space projection of the reflection, in [0,1].
    this.textureMatrix.set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0,
    );
    this.textureMatrix.multiply(this.camera.projectionMatrix);
    this.textureMatrix.multiply(this.camera.matrixWorldInverse);

    // Oblique near plane on the water surface. `Plane.applyMatrix4` carries the
    // inverse-transpose for us; hand-rolling it on a Vector4 is the classic way
    // to get a reflection that clips on the wrong side at a raking camera.
    this._plane.setFromNormalAndCoplanarPoint(this._normal, this._reflectorPos);
    this._plane.applyMatrix4(this.camera.matrixWorldInverse);
    this._clipPlane.set(
      this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant,
    );
    const proj = this.camera.projectionMatrix;
    this._q.x = (Math.sign(this._clipPlane.x) + proj.elements[8]) / proj.elements[0];
    this._q.y = (Math.sign(this._clipPlane.y) + proj.elements[9]) / proj.elements[5];
    this._q.z = -1.0;
    this._q.w = (1.0 + proj.elements[10]) / proj.elements[14];
    const denom = this._clipPlane.dot(this._q);
    if (Math.abs(denom) > 1e-6) {
      const scale = 2.0 / denom;
      proj.elements[2] = this._clipPlane.x * scale;
      proj.elements[6] = this._clipPlane.y * scale;
      proj.elements[10] = this._clipPlane.z * scale + 1.0 - REFLECT.clipBias;
      proj.elements[14] = this._clipPlane.w * scale;
    }
    // Depth was written with the oblique projection, whereas textureMatrix's
    // XY came from the clean projection above. The oblique edit changes clip Z
    // only, so the shared UV remains exact and this inverse reconstructs the
    // solid in mirrored-camera metres.
    this.depthProjectionInverse.copy(proj).invert();
    this.depthViewMatrix.copy(this.camera.matrixWorldInverse);

    const prevTarget = renderer.getRenderTarget();
    const prevActiveCube = renderer.getActiveCubeFace();
    const prevActiveMip = renderer.getActiveMipmapLevel();
    const prevShadowAuto = renderer.shadowMap.autoUpdate;
    const prevShadowNeeds = renderer.shadowMap.needsUpdate;
    const prevAutoClear = renderer.autoClear;
    const prevSort = renderer.sortObjects;
    renderer.getClearColor(this._savedClear);
    const prevClearAlpha = renderer.getClearAlpha();
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = false;
    renderer.autoClear = true;
    // Opaque proxies at 512x288 under a blur: a front-to-back sort buys nothing
    // and costs a full sort of the draw list every frame.
    renderer.sortObjects = false;
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(this._clearColor, 0);
    renderer.clear(true, true, false);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prevTarget, prevActiveCube, prevActiveMip);
    renderer.setClearColor(this._savedClear, prevClearAlpha);
    renderer.shadowMap.autoUpdate = prevShadowAuto;
    renderer.shadowMap.needsUpdate = prevShadowNeeds;
    renderer.autoClear = prevAutoClear;
    renderer.sortObjects = prevSort;
    this._drewOnce = true;
    return true;
  }

  /**
   * ── P14-M9 ITEM 2: LATE-BUILT SUBTREES JOIN THE PROXY LAYER. ──
   *
   * `water.js`'s qualifier walk runs once, at boot, over the roots the mass
   * field is baked from. The military shipyard does not exist then — its slip
   * dress, its crowd, its gantry and the hull on the blocks are built by
   * `MilitaryShipyardLayer._ensureHull` the first frame the yard has a navy row
   * — so none of its 389 meshes ever carried `REFLECT.layer` and none of them
   * reflected. Measured, before this change: `onReflectLayer: 0` of 389
   * (`shots-v56/M9-probe.json`, Q1). MC4 pack-k reads the result as
   * "no AO, contact, or water reflection".
   *
   * This walks a subtree with the SAME two gates the boot walk uses
   * (`planarMinHeight`, `planarMinSpan`) and the same name deny-list, and adds
   * what qualifies. Post-`finalise` additions go straight onto `proxies`, which
   * is the list `render` re-syncs from its source matrix every frame — so a
   * hull that launches down the slip takes its reflection with it, which the
   * merged static set could not do.
   *
   * `cap` is a hard ceiling on how many a single call may add: the pass is
   * billed per OBJECT (W6 measured about six microseconds each), so a cap of 48
   * is at most +0.3 ms on a +4 ms budget.
   */
  addSubtree(root, {
    minHeight = REFLECT.planarMinHeight,
    minSpan = REFLECT.planarMinSpan,
    cap = 48,
    deny = /person|people|figure|worker|crew|decal|shadow|wake|foam|spray|contact|patch/,
  } = {}) {
    if (!root) return { walked: 0, added: 0, capped: false };
    root.updateWorldMatrix(true, true);
    const box = new THREE.Box3();
    const cands = [];
    let walked = 0;
    root.traverse((m) => {
      if (!m.isMesh || !m.visible || !m.geometry) return;
      walked += 1;
      if (m.layers.isEnabled(this.layer)) return;
      let named = m.name || '';
      for (let q = m; q && !named; q = q.parent) named = q.name || '';
      if (deny.test(named)) return;
      if (deny.test(m.parent?.name ?? '')) return;
      box.setFromObject(m);
      if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.y)) return;
      const h = box.max.y - this.planeY;
      const span = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
      if (h < minHeight || span < minSpan) return;
      // Biggest first, so a cap keeps the forms that actually read in the water.
      cands.push({ mesh: m, score: span * Math.min(h, 24) });
    });
    cands.sort((a, b) => b.score - a.score);
    let added = 0;
    for (const c of cands) {
      if (added >= cap) break;
      c.mesh.layers.enable(this.layer);
      if (this.addSource(c.mesh)) added += 1;
    }
    this.stats.drawObjects = this.proxies.length + this.merged.length;
    return { walked, added, capped: cands.length > cap, candidates: cands.length };
  }

  /**
   * W11: name/colour census of the planar proxy set, so a dump can prove the
   * target contains hulls and yellow cranes before the composite is blamed.
   */
  censusSources() {
    let crane = 0;
    let hull = 0;
    let yellow = 0;
    const names = [];
    const consider = (obj) => {
      const src = obj?.userData?.reflectSource;
      const name = String(src?.name || obj?.name || '');
      if (name) names.push(name);
      if (/crane|gantry/i.test(name)) crane += 1;
      if (/hull|ship|tug|barge|tanker|vessel/i.test(name)) hull += 1;
      const mat = obj?.material;
      const col = mat?.color;
      if (col && col.r > 0.45 && col.g > 0.35 && col.b < 0.28) yellow += 1;
    };
    for (const p of this.proxies) consider(p);
    for (const m of this.merged) consider(m);
    return {
      proxies: this.proxies.length,
      merged: this.merged.length,
      crane,
      hull,
      yellow,
      names: names.slice(0, 24),
    };
  }

  /**
   * Read the current 512×288 planar target. Returns luma / yellow-pixel
   * receipts; the raw buffer is not returned (it is 1.5 MiB of float).
   */
  dumpTarget(renderer) {
    if (!renderer || !this.target) return null;
    const w = this.target.width;
    const h = this.target.height;
    const gl = renderer.getContext();
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    let live = 0;
    let yellow = 0;
    let sum = 0;
    let maxL = 0;
    let nonzero = 0;
    try {
      const buf = new Uint16Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.HALF_FLOAT ?? 0x140B, buf);
      const half = (u) => {
        const s = (u & 0x8000) >> 15;
        const e = (u & 0x7c00) >> 10;
        const f = u & 0x03ff;
        if (e === 0) return (s ? -1 : 1) * (f / 1024) * (2 ** -14);
        if (e === 31) return f ? NaN : ((s ? -1 : 1) * Infinity);
        return (s ? -1 : 1) * (1 + f / 1024) * (2 ** (e - 15));
      };
      for (let i = 0; i < buf.length; i += 4) {
        const r = half(buf[i]);
        const g = half(buf[i + 1]);
        const b = half(buf[i + 2]);
        if (!(r > 0.004 || g > 0.004 || b > 0.004)) continue;
        nonzero += 1;
        live += 1;
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        sum += luma;
        if (luma > maxL) maxL = luma;
        if (r > 0.45 && g > 0.35 && b < 0.28) yellow += 1;
      }
    } catch (err) {
      renderer.setRenderTarget(prev);
      return { width: w, height: h, error: String(err) };
    }
    renderer.setRenderTarget(prev);
    return {
      width: w,
      height: h,
      live,
      yellow,
      nonzero,
      meanLuma: live ? sum / live : 0,
      maxLuma: maxL,
    };
  }

  dispose() {
    LATE_SUBTREE_TARGETS.delete(this);
    for (const proxy of this.proxies) this.scene.remove(proxy);
    this.proxies.length = 0;
    for (const mesh of this.merged) this.scene.remove(mesh);
    this.merged.length = 0;
    for (const geom of this._ownedGeometries) geom.dispose?.();
    this._ownedGeometries.length = 0;
    for (const mat of this._ownedMaterials) mat.dispose?.();
    this._ownedMaterials.length = 0;
    this._materials.clear();
    this.target?.dispose();
    this.target = null;
    this.texture = null;
    this.depthTexture = null;
  }
}

/**
 * ── P14-M9 ITEM 2: HOW A LATE SUBTREE FINDS THE REFLECTOR. ──
 *
 * The reflector is private to `Water` (`water.js` holds it as `_reflector`) and
 * `water.js` is not this lane's file, so there is no forward to add. The
 * registry is the smallest thing that closes the gap: a reflector enrols itself
 * on construction and drops out on dispose, and any module that builds port
 * mass after boot calls `addReflectionSources(root)` once. It holds at most the
 * one reflector the board makes, and it is a `Set`, so a double enrolment is a
 * no-op and a disposed reflector cannot be written to.
 */
const LATE_SUBTREE_TARGETS = new Set();
export function addReflectionSources(root, opts = {}) {
  const out = [];
  for (const target of LATE_SUBTREE_TARGETS) {
    if (!target?.target) continue;
    out.push(target.addSubtree(root, opts));
  }
  return out;
}
export function reflectionSourceTargets() {
  return LATE_SUBTREE_TARGETS.size;
}
export function harbourReflectorAt(index = 0) {
  let i = 0;
  for (const target of LATE_SUBTREE_TARGETS) {
    if (i === index) return target;
    i += 1;
  }
  return null;
}

export class OuterOcean {
  constructor({
    parent,
    city,
    quality = 'high',
    reducedMotion = false,
    envMap = null,
    interactUniforms = null,
    frame = null,
  } = {}) {
    this.parent = parent;
    this.city = city;
    this.quality = quality;
    this.reducedMotion = reducedMotion;
    this._disposables = [];
    this._ownedMaterials = [];
    this.triangleBudget = { ocean: 0, foam: 0, wetEdge: 0 };

    const plan = planEdgeMassing(city);
    this.plan = plan;
    const extent = city.extent ?? { x: 272, z: 272 };
    const liveFrame = frame ?? dummyFrame(city);

    const depthSize = quality === 'low' ? 256 : quality === 'medium' ? 512 : OCEAN.depthTexSize;
    const depthBake = bakeOceanDepthData(city, plan, depthSize);
    this._depthTex = makeDataTex(depthBake.data, depthBake.size, THREE.ClampToEdgeWrapping);
    this._disposables.push(this._depthTex);
    this._depthBake = depthBake;
    // W14-A (F3 and F4): the coast field and the shoaling table. Low quality binds an empty field and a gain of 0,
    // so the old front path stands there (DESIGN section 4, quality).
    const coastT0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const hxB = extent.x * 0.5;
    const hzB = extent.z * 0.5;
    // wave 75 (2b-1): with the spine on, low binds the real coast field (the 1 x 1 stub below made RIM_TINT read S = 0 and class 0 across the whole sea); uCoastGain stays 0 there.
    const spineField = COAST_SPINE.on ? activeCoastSpine() : null;
    this._coastBake = quality === 'low' && !spineField ? null : bakeCoastField({
      bedDepth: depthBake.bedDepth, size: depthBake.size, span: depthBake.span,
      originX: depthBake.originX, originZ: depthBake.originZ, classBytes: depthBake.coastClass,
      boardDistance: (x, z) => Math.max(Math.abs(x - hxB) - hxB, Math.abs(z - hzB) - hzB),
    });
    this._coastBakeMs = typeof performance !== 'undefined' ? performance.now() - coastT0 : 0;
    setOceanCoastField(quality === 'low' ? null : this._coastBake);
    const coastTex = this._coastBake
      ? makeDataTex(this._coastBake.data, depthBake.size, THREE.ClampToEdgeWrapping)
      : new THREE.DataTexture(new Uint8Array([0, 0, 128, 0]), 1, 1, THREE.RGBAFormat);
    coastTex.needsUpdate = true;
    coastTex.minFilter = coastTex.magFilter = THREE.LinearFilter;
    coastTex.generateMipmaps = false;
    this._disposables.push(coastTex);
    const surfBake = bakeSurfLut();
    const surfTex = new THREE.DataTexture(surfBake.data, surfBake.width, surfBake.height, THREE.RGBAFormat, THREE.FloatType);
    surfTex.minFilter = surfTex.magFilter = THREE.LinearFilter;
    surfTex.wrapS = surfTex.wrapT = THREE.ClampToEdgeWrapping;
    surfTex.generateMipmaps = false;
    surfTex.needsUpdate = true;
    this._disposables.push(surfTex);
    const bedTexture = new THREE.DataTexture(depthBake.bedDepth, depthBake.size,
      depthBake.size, THREE.RedFormat, THREE.FloatType);
    bedTexture.minFilter = bedTexture.magFilter = THREE.LinearFilter;
    bedTexture.generateMipmaps = false;
    bedTexture.needsUpdate = true;
    this._disposables.push(bedTexture);

    const foamData = bakeFoamMapData();
    this._foamTex = makeDataTex(foamData, OCEAN.foamTexSize, THREE.RepeatWrapping);
    this._disposables.push(this._foamTex);
    this._foamLoadCancelled = false;
    this._paintLoadCancelled = false;

    const bayEdge = plan.bay;
    const portEdge = plan.port;
    const inlandEdge = plan.inland;
    const bayOrigin = wallOrigin(bayEdge, extent);
    const portOrigin = wallOrigin(portEdge, extent);
    const inlandOrigin = wallOrigin(inlandEdge, extent);
    const bayNormal = edgeAxes(bayEdge).seaward.clone();
    const portNormal = edgeAxes(portEdge).seaward.clone();
    const inlandNormal = edgeAxes(inlandEdge).seaward.clone();

    const interact = interactUniforms ?? createInteractUniforms();

    const freezeT = reducedMotion ? OCEAN.freezeTime : 0;
    this.uniforms = {
      uTime: { value: freezeT },
      uMotion: { value: reducedMotion ? 0 : 1 },
      uSheetFloorY: { value: WATER_FLOOR_Y },
      uFoamPhase: { value: foamPhaseAt(freezeT, reducedMotion) },
      uBayFace: { value: SHORE.waterFromWall },
      uPortFace: { value: SHORE.wallOffset + SHORE.wallDeep * 0.35 },
      uBayOrigin: { value: bayOrigin },
      uBayNormal: { value: bayNormal },
      uPortOrigin: { value: portOrigin },
      uPortNormal: { value: portNormal },
      uInlandOrigin: { value: inlandOrigin },
      uInlandNormal: { value: inlandNormal },
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.lights),
      uBedDepth: { value: bedTexture },
      uDepthMap: { value: this._depthTex },
      uCoastField: { value: coastTex },
      uSurfLut: { value: surfTex },
      uCoastGain: { value: quality === 'low' ? 0 : 1 },
      uShadeGain: { value: quality === 'low' ? 0 : WATER_LAW.waves.ocean.shadeTrains.gain }, // taste-r1 (W17-A): shade-only swell components, off at low
      uLineScale: { value: quality === 'medium' ? 2 : 1 },
      uDepthOrigin: { value: new THREE.Vector2(depthBake.originX, depthBake.originZ) },
      uDepthSpan: { value: depthBake.span },
      uDepthMax: { value: OCEAN.maxDepth },
      uSdfOrigin: { value: COAST_SDF.sdfOrigin },
      uSdfSpan: { value: COAST_SDF.sdfSpan },
      uFoamMap: { value: this._foamTex },
      uFoamLaceA: { value: this._foamTex },
      uFoamLaceB: { value: this._foamTex },
      uFoamCrest: { value: this._foamTex },
      uFoamUseArt: { value: 0 },
      uFoamArtGain: { value: textureLoaderAvailable() ? 0 : 1 },
      uPaintStripA: { value: this._foamTex },
      uPaintStripB: { value: this._foamTex },
      uPaintDeep: { value: this._foamTex },
      uPaintUseArt: { value: 0 },
      uPaintSpanU: { value: paintedTileSpan(paintedAlongPerimeter(PAINTED.spanRefR)) },
      uPierAlong: {
        value: (liveFrame.along === 'x' ? liveFrame.origin.x : liveFrame.origin.z),
      },
      uPierWidth: { value: SHORE.pierWidth },
      uPierLength: { value: SHORE.pierLength },
      uPierSea0: { value: SHORE.pierSea0 },
      uRampWet: { value: srgb(OCEAN_RAMP.wetSand) },
      uRampOlive: { value: srgb(OCEAN_RAMP.olive) },
      uRampTeal: { value: srgb(OCEAN_RAMP.teal) },
      uRampNavy: { value: srgb(OCEAN_RAMP.deep) },
      uRampKeep: { value: OCEAN.rampKeep },
      uFogResist: { value: OCEAN.fogResist },
      uWaveScale: { value: quality === 'low' ? 0.32 : BAY_WAVE_SCALE },
      // Rain state of the sea (water/sea.js): x rain, y swell envelope gain, z glint weight,
      // w roughness added. `bindAquaEnvironment` refreshes it from uAquaWeather every frame.
      uSea: { value: new THREE.Vector4(0, 1, 1, 0) },
      uBayDir: {
        value: BAY_SWELL.map((s) => {
          const len = Math.hypot(s.dir[0], s.dir[1]) || 1;
          return new THREE.Vector2(s.dir[0] / len, s.dir[1] / len);
        }),
      },
      uBayLen: { value: BAY_SWELL.map((s) => s.len) },
      uBayAmp: { value: BAY_SWELL.map((s) => s.amp) },
      uBaySteep: { value: BAY_SWELL.map((s) => s.steep) },
      uBayOmega: { value: BAY_SWELL.map((s) => s.omega) },
      ...shoreCommonUniforms(liveFrame),
      ...surfaceUniforms(quality),
      ...foamUniforms(quality),
      ...interact,
      // P14 M11 item 2 — the hull-wake block. Four uniforms, 8 hulls max.
      ...wakeUniformBlock(),
      // P16-W10 — stopped hulls retain a physical contact independent of wake.
      ...hullContactUniformBlock(),
    };
    // P16-W5 reflection uniforms. `uEnvMap` / `uHasEnv` already existed on the
    // block (surface.js contributes them) and were held at null / false; they
    // are live now and the ocean's own fragment shader declares them.
    if (spineField) {
      // wave 75 (2b-1): the field's textures (d, beach weight), its rect, the beach offset and the bay frame's extent, the shelf's own values.
      const fr = spineField.curve?.info?.frame;
      Object.assign(this.uniforms, coastSpineUniforms(spineField), {
        uCoastSpineBeachOffset: { value: COAST_SPINE.beachOffset },
        uCoastSpineExtent: { value: new THREE.Vector2(fr?.alongC ?? 0, fr?.half ?? 1) },
      });
    }
    this.uniforms.uReflGain = { value: REFLECT.gain };
    this.uniforms.uMassMap = { value: this._foamTex };
    this.uniforms.uMassOrigin = { value: new THREE.Vector2(0, 0) };
    this.uniforms.uMassSpan = { value: 1 };
    this.uniforms.uMassMaxH = { value: 1 };
    this.uniforms.uHasMass = { value: false };
    this.uniforms.uMassTint = { value: srgb(REFLECT.blockedTint) };
    // P16-W6: the planar harbour reflection (prototype A) and the item-2 terms.
    this.uniforms.uReflMap = { value: this._foamTex };
    this.uniforms.uReflMatrix = { value: new THREE.Matrix4() };
    this.uniforms.uReflTexel = {
      value: new THREE.Vector2(1 / REFLECT.planarW, 1 / REFLECT.planarH),
    };
    this.uniforms.uPlanarOn = { value: 0 };
    this.uniforms.uPlanarAmt = { value: REFLECT.planarAmt };
    this.uniforms.uReflDepth = { value: this._foamTex };
    this.uniforms.uReflProjInv = { value: new THREE.Matrix4() };
    this.uniforms.uReflView = { value: new THREE.Matrix4() };
    this.uniforms.uContactOn = { value: 0 };
    // Receipt master: 0 is the inherited W8 composite, 1 is W9. It changes no
    // program defines and therefore supports a fair same-session cost check.
    this.uniforms.uW9WaterAmt = { value: 1 };
    this.uniforms.uW11WaterAmt = { value: 1 };
    this.uniforms.uW12WaterAmt = { value: 1 };
    this.uniforms.uW13WaterAmt = { value: 1 };
    this.uniforms.uW14WaterAmt = { value: 1 };
    this.uniforms.uX3WaterAmt = { value: 1 };
    this.uniforms.uW15WaterAmt = { value: 1 };
    this.uniforms.uW16WaterAmt = { value: 1 };
    this.uniforms.uW17ReflectionAmt = { value: 1 };
    this.uniforms.uW18WaterAmt = { value: 1 };
    this.uniforms.uW18Receipt = { value: 0 };
    this.uniforms.uW19Albedo = { value: this._foamTex };
    this.uniforms.uW19Normal = { value: this._foamTex };
    this.uniforms.uW19Foam = { value: this._foamTex };
    this.uniforms.uW19Ready = { value: 0 };
    this.uniforms.uW22FoamDebug = { value: 0 };
    this.uniforms.uW19Wet = { value: 1 };
    this.uniforms.uW20Hull = W20_HULL_GAIN;
    this.uniforms.uW19EnvIntensity = { value: 1 };
    // W22: reuse the accepted Imagen normal/foam assets in the aqua composition.
    loadImagenWater((textures) => {
      if (!textures) return;
      if (this._paintLoadCancelled || !this.uniforms) {
        textures.forEach((texture) => texture.dispose()); return;
      }
      this._disposables.push(...textures);
      [this.uniforms.uW19Albedo.value, this.uniforms.uW19Normal.value,
        this.uniforms.uW19Foam.value] = textures;
      this.uniforms.uW19Ready.value = 1;
    });
    // Master gain on the ripple, 1 = the authored harbour / open-sea split.
    // A single knob so the A/B instrument can take the term out cleanly.
    this.uniforms.uRippleMix = { value: 1 };
    this.uniforms.uShallowTint = { value: srgb(REFLECT.shallowTint) };
    this.uniforms.uDeepTint = { value: srgb(REFLECT.deepTint) };
    this.uniforms.uDepthFallAmt = { value: REFLECT.depthFallAmt };
    this.uniforms.uFoamDepthAmt = { value: REFLECT.foamDepthAmt };
    // W7's two master gains. The capture receipt toggles these without
    // recompiling; the land ribbon remains one cheap draw in both arms.
    this.uniforms.uOuterSeaAmt = { value: 1 };
    this.uniforms.uWetEdgeAmt = { value: 1 };
    // P21 R5: preserve surfaceUniforms' committed aqua extinction palette.
    // R13: foam is a near-binary white shape, not beige-grey film.
    // Radiance, not albedo: the foam layer is added to the graded frame without a
    // light, so the token is scaled by WATER_LAW.foamGain (it was a raw 0.72 linear,
    // which tone-mapped to pure white, V above 93).
    this.uniforms.uFoamColor.value.copy(srgb(WATER_LAW.foam)).multiplyScalar(WATER_LAW.foamGain);
    this.uniforms.uFoamShadow.value.copy(srgb('#c9d8d8')).multiplyScalar(WATER_LAW.foamGain);
    // P16-W5: the constructor's `envMap` option was accepted and then dropped
    // on the floor, and `WaterSurface` pushes the rig's equirect before this
    // object exists, so `setEnvMap` returned early on a null uniform block and
    // the sheet never saw a sky. Both paths land here.
    if (this.uniforms.uEnvMap) this.uniforms.uEnvMap.value = envMap ?? this._foamTex;
    if (this.uniforms.uHasEnv) this.uniforms.uHasEnv.value = Boolean(envMap);
    const flatRipple = new THREE.DataTexture(new Uint8Array([128, 255, 128, 255]), 1, 1);
    flatRipple.needsUpdate = true;
    this._disposables.push(flatRipple);
    this.uniforms.uRippleMap.value = flatRipple;
    if (this.uniforms.uGlitter) this.uniforms.uGlitter.value = 0;
    this.uniforms.uReflMax.value = 0.18;
    this.uniforms.uEnvIntensity.value = 0.76;
    shareWorldCurveUniforms(this.uniforms);

    this.material = new THREE.ShaderMaterial({
      vertexShader: spineField ? OCEAN_VERT_SPINE : OCEAN_VERT,
      // P21 R5 sea mount: aqua surface on the retained continuous coast mesh.
      fragmentShader: spineField
        ? aquaFragment(HULL_CONTACT_GLSL, HULL_SIT_GLSL, BAY_SWELL_N, { spine: { glsl: `${COAST_SPINE_GLSL}\n${COAST_WATER_FRONT_GLSL}`, edgeM: SPINE_WATER.edgeM, blendM: SPINE_WATER.blendM } })
        : aquaFragment(HULL_CONTACT_GLSL, HULL_SIT_GLSL, BAY_SWELL_N),
      lights: true,
      uniforms: this.uniforms,
      transparent: true,
      // W17 material ID in the otherwise unused scene alpha: covered water
      // writes zero; partial shore coverage retains the underlying solid ID.
      // RGB is exactly NormalBlending. AO consumes this before output alpha
      // is restored to one, so wave crests need no guessed height envelope.
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      depthWrite: true,
      side: THREE.FrontSide,
      fog: false,
    });
    applyWorldRestyle(this.material, 'sea');
    this._ownedMaterials.push(this.material);

    const ocean = buildOceanGeometry(city, quality);
    this._disposables.push(ocean.geometry);
    this.triangleBudget.ocean = ocean.triangles;
    this.mesh = new THREE.Mesh(ocean.geometry, this.material);
    this.mesh.name = 'nature:water:ocean';
    bindAquaEnvironment(this.mesh, this.uniforms);
    this.mesh.userData.syncHullContact = camera => {
      rebuildHullContactLive(camera.position);
      this._applyHullContact();
    };
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.renderOrder = 5;
    this.mesh.frustumCulled = false;
    // P19 X6: extra polar sheets only when LOD is on, and only when the camera
    // actually asks for mid/far — three copies of the ocean were a heap slab,
    // and the low mesh tore the waterline. W15 shore/shelf is not this block.
    const waterLod = isLodEnabled() && quality === 'high';
    this.mesh.userData.waterLodGeos = [ocean.geometry, ocean.geometry, ocean.geometry];
    this.mesh.userData.lodFamily = 'water';
    if (waterLod) {
      this.mesh.userData.waterLodBuild = (level) => {
        const geos = this.mesh.userData.waterLodGeos;
        if (level >= 1 && geos[1] === ocean.geometry) {
          const mid = buildOceanGeometry(city, 'medium');
          this._disposables.push(mid.geometry);
          geos[1] = mid.geometry;
        }
        if (level >= 2 && geos[2] === ocean.geometry) {
          const far = buildOceanGeometry(city, 'low');
          this._disposables.push(far.geometry);
          geos[2] = far.geometry;
        }
        return geos[level] || geos[0];
      };
    }
    // Preserve the existing optional water LOD path. The default full-detail
    // path keeps every triangle, but stops submitting offscreen ocean patches.
    if (quality === 'high' && !isLodEnabled()) this._disposables.push(...mountWaterPatches(this.mesh, { cellSize: 256 }));
    parent.add(this.mesh);

    const wetEdge = buildWetEdgeGeometry(city, plan, depthBake, quality);
    this._disposables.push(wetEdge.geometry);
    this.triangleBudget.wetEdge = wetEdge.triangles;
    this.wetEdgeMaterial = new THREE.MeshStandardMaterial({
      color: WET_EDGE.color,
      roughness: WET_EDGE.roughness,
      metalness: WET_EDGE.metalness,
      transparent: true,
      premultipliedAlpha: true,
      opacity: WET_EDGE.opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    });
    // The old glossy response remains byte-for-byte for cliff and port faces
    // (mask zero). Only the geometry-marked main-beach contact takes a diffuse
    // sand colour and a width/end opacity feather. This remains one mesh and
    // one wet-edge draw; no ocean/foam material or wave program is changed.
    const wetSand = new THREE.Color(WET_EDGE.beachSand);
    this.wetEdgeMaterial.userData.beachResponse = 'r103b-diffuse-wet-sand';
    this.wetEdgeMaterial.customProgramCacheKey = () => (WET_EDGE_SHELF.attr ? 'r103b-wet-beach-response-shelf' : 'r103b-wet-beach-response');
    this.wetEdgeMaterial.onBeforeCompile = (shader) => {
      const insert = (source, token, code) => {
        if (!source.includes(token)) throw new Error(`Missing wet-edge shader chunk ${token}`);
        return source.replace(token, `${token}\n${code}`);
      };
      shader.vertexShader = insert(shader.vertexShader, '#include <common>',
        `attribute vec2 aWetBeach; varying vec2 vWetBeach; varying vec2 vWetXZ;${WET_EDGE_SHELF.attr ? ' attribute float aWetShelf; varying float vWetShelf;' : ''}`);
      shader.vertexShader = insert(shader.vertexShader, '#include <begin_vertex>',
        `vWetBeach = aWetBeach;\nvWetXZ = (modelMatrix * vec4(position, 1.0)).xz;${WET_EDGE_SHELF.attr ? '\nvWetShelf = aWetShelf;' : ''}`);
      shader.fragmentShader = insert(shader.fragmentShader, '#include <common>',
        `varying vec2 vWetBeach; varying vec2 vWetXZ;${WET_EDGE_SHELF.attr ? ' varying float vWetShelf;' : ''}`);
      shader.fragmentShader = insert(shader.fragmentShader, '#include <color_fragment>',
        // W4-A: in the Apostles cove (east bay, x past 300, z 192 to 304) this decal followed the shelf's drop
        // as a straight-ended glossy ribbon that mirrored the sky as a pale strip. Its alpha is zero there,
        // feathered over 8 m at each side, so the main beach's decal ends the way it did and nothing here has a cut end.
        `diffuseColor.a *= 1.0 - smoothstep(298.0, 306.0, vWetXZ.x) * smoothstep(190.0, 198.0, vWetXZ.y) * (1.0 - smoothstep(296.0, 304.0, vWetXZ.y));\n`+
        `float beachMask = clamp(vWetBeach.x, 0.0, 1.0);\n`+
        `diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${wetSand.r.toFixed(6)}, ${wetSand.g.toFixed(6)}, ${wetSand.b.toFixed(6)}), beachMask);\n`+
        `diffuseColor.a *= mix(1.0, 0.44 * clamp(vWetBeach.y, 0.0, 1.0), beachMask);${WET_EDGE_SHELF.attr ? '\ndiffuseColor.a *= clamp(vWetShelf, 0.0, 1.0);' : ''}`);
      shader.fragmentShader = insert(shader.fragmentShader, '#include <roughnessmap_fragment>',
        'roughnessFactor = mix(roughnessFactor, 0.92, clamp(vWetBeach.x, 0.0, 1.0));');
      shader.fragmentShader = insert(shader.fragmentShader, '#include <metalnessmap_fragment>',
        'metalnessFactor = mix(metalnessFactor, 0.0, clamp(vWetBeach.x, 0.0, 1.0));');
    };
    this._ownedMaterials.push(this.wetEdgeMaterial);
    this.wetEdgeMesh = new THREE.Mesh(wetEdge.geometry, this.wetEdgeMaterial);
    this.wetEdgeMesh.name = 'nature:water:wet-edge';
    this.wetEdgeMesh.receiveShadow = true;
    this.wetEdgeMesh.castShadow = false;
    this.wetEdgeMesh.renderOrder = 4;
    this.wetEdgeMesh.frustumCulled = false;
    parent.add(this.wetEdgeMesh);

    this._foamUniforms = {
      uTime: this.uniforms.uTime,
      uFoamPhase: this.uniforms.uFoamPhase,
      uFoamMap: this.uniforms.uFoamMap,
      uFoamLaceA: this.uniforms.uFoamLaceA,
      uFoamLaceB: this.uniforms.uFoamLaceB,
      uFoamCrest: this.uniforms.uFoamCrest,
      uFoamUseArt: this.uniforms.uFoamUseArt,
      uFoamArtGain: this.uniforms.uFoamArtGain,
      uPierAlong: this.uniforms.uPierAlong,
      uPierWidth: this.uniforms.uPierWidth,
      uPierLength: this.uniforms.uPierLength,
      uPierSea0: this.uniforms.uPierSea0,
      uDepthMap: this.uniforms.uDepthMap,
      uDepthOrigin: this.uniforms.uDepthOrigin,
      uDepthSpan: this.uniforms.uDepthSpan,
      uDepthMax: this.uniforms.uDepthMax,
      uSdfOrigin: this.uniforms.uSdfOrigin,
      uSdfSpan: this.uniforms.uSdfSpan,
      uFoamColor: this.uniforms.uFoamColor,
      uFoamShadow: this.uniforms.uFoamShadow,
      uBayOrigin: this.uniforms.uBayOrigin,
      uBayNormal: this.uniforms.uBayNormal,
      uPortOrigin: this.uniforms.uPortOrigin,
      uPortNormal: this.uniforms.uPortNormal,
      uPortFace: this.uniforms.uPortFace,
      uWorldCurve: this.uniforms.uWorldCurve,
      uWorldCurveTarget: this.uniforms.uWorldCurveTarget,
    };
    if (spineField) {
      // wave 78 (2b-3): the lip reads the spine's front: the field's textures, its rect, the beach offset and the bay frame's extent are the sea's own.
      for (const name of ['uCoastSpineD', 'uCoastSpineW', 'uCoastSpineRect', 'uCoastSpineBeachOffset', 'uCoastSpineExtent']) this._foamUniforms[name] = this.uniforms[name];
    }
    shareWorldCurveUniforms(this._foamUniforms);
    this.foamMaterial = new THREE.ShaderMaterial({
      vertexShader: FOAM_LAYER_VERT,
      fragmentShader: spineField ? FOAM_LAYER_FRAG_SPINE : FOAM_LAYER_FRAG,
      uniforms: this._foamUniforms,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this._ownedMaterials.push(this.foamMaterial);
    const foam = buildBeachFoamGeometry(city, quality);
    this._disposables.push(foam.geometry);
    this.triangleBudget.foam = foam.triangles;
    this.foamMesh = new THREE.Mesh(foam.geometry, this.foamMaterial);
    this.foamMesh.name = 'nature:water:beach-foam';
    this.foamMesh.receiveShadow = false;
    this.foamMesh.castShadow = false;
    this.foamMesh.renderOrder = 6;
    this.foamMesh.frustumCulled = false;
    // taste-r1 (W14-A step 5): at high and medium the breaker lines and the shore lip (water/aqua.js) replace this ribbon.
    // Its source stays; low quality keeps it, because low has no coast field and so no lines.
    this.foamMesh.visible = quality === 'low';
    parent.add(this.foamMesh);

    loadAuthoredFoamPlates((plates) => {
      if (this._foamLoadCancelled) {
        if (plates) {
          plates.laceA?.dispose?.();
          plates.laceB?.dispose?.();
          plates.crest?.dispose?.();
        }
        return;
      }
      if (!plates || !this.uniforms) {
        if (this.uniforms) {
          this.uniforms.uFoamUseArt.value = 0;
          this.uniforms.uFoamArtGain.value = 1;
        }
        return;
      }
      this._disposables.push(plates.laceA, plates.laceB, plates.crest);
      this.uniforms.uFoamLaceA.value = plates.laceA;
      this.uniforms.uFoamLaceB.value = plates.laceB;
      this.uniforms.uFoamCrest.value = plates.crest;
      this.uniforms.uFoamUseArt.value = 1;
      this.uniforms.uFoamArtGain.value = 1;
    });

    if (false) loadAuthoredPaintPlates((plates) => {
      if (this._paintLoadCancelled) {
        if (plates) {
          plates.stripA?.dispose?.();
          plates.stripB?.dispose?.();
          plates.deep?.dispose?.();
        }
        return;
      }
      if (!plates || !this.uniforms) {
        if (this.uniforms) this.uniforms.uPaintUseArt.value = 0;
        return;
      }
      this._disposables.push(plates.stripA, plates.stripB, plates.deep);
      this.uniforms.uPaintStripA.value = plates.stripA;
      this.uniforms.uPaintStripB.value = plates.stripB;
      this.uniforms.uPaintDeep.value = plates.deep;
      this.uniforms.uPaintUseArt.value = 1;
    });
  }

  /**
   * P16-W5: this used to be a deliberate no-op — the equirect was pushed into
   * the uniform and `uHasEnv` held at false, with the note that sampling it was
   * the rectangular-patch source. The rectangles were the 22-68x sun disc read
   * through a 256x128 unmipped bilinear tap, not the sky; `ddSkyReflection`
   * clamps the disc out and averages five rays, and the sun is restored on the
   * analytic glint / track terms. See REFLECT.
   */
  setEnvMap(texture) {
    if (!this.uniforms) return;
    this.uniforms.uEnvMap.value = texture ?? this._foamTex;
    if (this.uniforms.uHasEnv) this.uniforms.uHasEnv.value = Boolean(texture);
  }

  /**
   * Boot-baked height field of everything standing out of the water — hulls,
   * quay walls, cranes, sheds. Red channel is height / `maxHeight`. The shader
   * marches it along the reflected ray for reflection occlusion and waterline
   * darkening; it is not a mirror and does not carry colour.
   */
  setMassMap(texture, originX, originZ, span, maxHeight) {
    if (!this.uniforms) return;
    if (!texture) {
      this.uniforms.uHasMass.value = false;
      return;
    }
    this.uniforms.uMassMap.value = texture;
    this.uniforms.uMassOrigin.value.set(originX, originZ);
    this.uniforms.uMassSpan.value = Math.max(span, 1);
    this.uniforms.uMassMaxH.value = Math.max(maxHeight, 0.1);
    this.uniforms.uHasMass.value = true;
    this._disposables.push(texture);
  }

  /**
   * P16-W6 prototype A. `texture` is the mirrored render of the port's large
   * forms; `matrix` projects a world point into it. Passing a null texture
   * puts the sheet back on the sky env alone, which is the OFF half of the
   * A/B and the default everywhere outside the port basin.
   */
  setPlanarReflection(
    texture, matrix, width, height, depthTexture, projectionInverse, viewMatrix,
  ) {
    if (!this.uniforms) return;
    if (!texture || !matrix) {
      this.uniforms.uPlanarOn.value = 0;
      this.uniforms.uContactOn.value = 0;
      return;
    }
    this.uniforms.uReflMap.value = texture;
    this.uniforms.uReflMatrix.value.copy(matrix);
    if (width && height) this.uniforms.uReflTexel.value.set(1 / width, 1 / height);
    this.uniforms.uPlanarOn.value = 1;
    if (depthTexture && projectionInverse && viewMatrix) {
      this.uniforms.uReflDepth.value = depthTexture;
      this.uniforms.uReflProjInv.value.copy(projectionInverse);
      this.uniforms.uReflView.value.copy(viewMatrix);
      this.uniforms.uContactOn.value = 1;
    } else {
      this.uniforms.uContactOn.value = 0;
    }
  }

  setSolar(profile, sunDir) {
    if (!this.uniforms || !profile) return;
    if (sunDir) this.uniforms.uSunDir.value.copy(sunDir).normalize();
    if (profile.keyColor) this.uniforms.uSunColor.value.copy(profile.keyColor);
  }

  setReducedMotion(on) {
    this.reducedMotion = on;
    if (!this.uniforms) return;
    this.uniforms.uMotion.value = on ? 0 : 1;
    if (on) {
      this.uniforms.uTime.value = OCEAN.freezeTime;
      this.uniforms.uFoamPhase.value = OCEAN.freezePhase;
    }
  }

  /**
   * P16-W10 — contact remains live under reduced motion and at speed zero.
   * This loop is vertex-only in the shader and contains no time term.
   */
  _applyHullContact() {
    const u = this.uniforms;
    if (!u?.uHullContactCount) return 0;
    const n = Math.min(HULL_CONTACT.max, HULL_CONTACT_LIVE.length);
    for (let i = 0; i < n; i += 1) {
      const h = HULL_CONTACT_LIVE[i];
      u.uHullContactHull.value[i].set(
        h.x, h.z, Math.cos(h.heading), Math.sin(h.heading),
      );
      u.uHullContactSpan.value[i].set(h.halfLen, h.halfBeam, h.gain, smooth01(0.12, 1.8, h.speed));
    }
    u.uHullContactCount.value = n;
    u.uHullContactBound.value.set(
      HULL_CONTACT_BOUND.x,
      HULL_CONTACT_BOUND.z,
      n > 0 ? HULL_CONTACT_BOUND.r : 0,
    );
    return n;
  }

  /**
   * P14 M11 item 2 — push `WAKE_LIVE` into the uniform block. Under
   * `reducedMotion` the count is forced to zero and the bounding radius with
   * it, which is the brief's law read literally: no wake animation, and the
   * sheet is the mean sea the hulls are parked on.
   */
  _applyWake() {
    const u = this.uniforms;
    if (!u?.uWakeCount) return 0;
    if (this.reducedMotion) {
      u.uWakeCount.value = 0;
      u.uWakeBound.value.set(0, 0, 0);
      return 0;
    }
    const n = Math.min(HULL_WAKE.max, WAKE_LIVE.length);
    for (let i = 0; i < n; i += 1) {
      const h = WAKE_LIVE[i];
      // The heading arrives as a cos/sin PAIR: a shader that recomputes a
      // trig of a constant once per hull per fragment is paying for nothing.
      u.uWakeHull.value[i].set(h.x, h.z, Math.cos(h.heading), Math.sin(h.heading));
      u.uWakeSpan.value[i].set(h.halfLen, h.halfBeam, h.lambda, h.gain);
    }
    u.uWakeCount.value = n;
    u.uWakeBound.value.set(WAKE_BOUND.x, WAKE_BOUND.z, n > 0 ? WAKE_BOUND.r : 0);
    return n;
  }

  update(elapsed) {
    if (!this.uniforms) return;
    // A populated registry already owns discovery; its live samples still run below.
    // Keep retrying missing or empty ports so late attachment follows the same path.
    const port = this._w20Hulls?.meshes.length ? null
      : this.parent?.parent?.getObjectByName?.('fringe:port')
        ?? this.parent?.getObjectByName?.('fringe:port');
    if (port && !this._w20Hulls?.meshes.length) {
      this._w20Hulls = new HullSitRegistry(port);
      // Fixed mooring stations are baked once; the wave loop below is scalar-only.
      const extent = this.city.extent ?? { x: 272, z: 272 };
      this._w22Buoyancy = new OceanBuoyancy(port, (x, z) => {
        const f = coastFieldAt(x, z, extent, this.plan);
        const portW = smooth01(-10, 10, f.portSea - f.baySea);
        // Match the vertex shader's normalised shore tangent, including its
        // sign at the port. A blend of x/z samples a different wave phase.
        const bay = this.uniforms.uBayNormal.value, quay = this.uniforms.uPortNormal.value;
        const nx = bay.x * (1 - portW) + quay.x * portW;
        const nz = bay.z * (1 - portW) + quay.z * portW;
        const norm = Math.hypot(nx, nz) || 1;
        const basin = harbourBasinWeightAt(f.portSea - SHORE.wallDeep * .35,
          portW, f.inlandSea, f.portSea);
        return { along: (x * nz - z * nx) / norm,
          front: Math.min(f.warped, f.unwarped),
          depth: Math.min(oceanDepthAt(x, z, extent, this.plan), OCEAN.maxDepth),
          bed: physicalSeabedDepthAt(x, z, extent, this.plan),
          coast: oceanCoastFieldAt(x, z),
          calm: harbourSwellScaleAt(f.portSea, f.baySea)
            * (1 - (1 - PAINTED.swellDamp) * basin) };
      }, (p, t) => paintedSwellFrameAt(p.along, p.front, p.depth, t, this.uniforms.uWaveScale.value, p.bed,
        p.coast ? { S: p.coast.S, a: p.coast.weight } : null).offsetY * p.calm);
    }
    this._w22Buoyancy?.update(this.reducedMotion ? OCEAN.freezeTime : elapsed);
    if (this._w20Hulls?.meshes.length) {
      setOceanWakeHulls('port:ships', this._w20Hulls.sample(elapsed));
    }
    this._applyHullContact();
    this._applyWake();
    if (this.reducedMotion) {
      this.uniforms.uTime.value = OCEAN.freezeTime;
      this.uniforms.uFoamPhase.value = OCEAN.freezePhase;
      this.uniforms.uMotion.value = 0;
      return;
    }
    this.uniforms.uMotion.value = 1;
    this.uniforms.uTime.value = elapsed;
    this.uniforms.uFoamPhase.value = foamPhaseAt(elapsed, false);
  }

  dispose() {
    this._w22Buoyancy?.dispose();
    this.mesh?.userData.disposeAqua?.();
    this._foamLoadCancelled = true;
    this._paintLoadCancelled = true;
    if (this.mesh?.parent) this.mesh.parent.remove(this.mesh);
    if (this.wetEdgeMesh?.parent) this.wetEdgeMesh.parent.remove(this.wetEdgeMesh);
    if (this.foamMesh?.parent) this.foamMesh.parent.remove(this.foamMesh);
    for (const item of this._disposables) item?.dispose?.();
    for (const material of this._ownedMaterials) material.dispose?.();
    this._disposables.length = 0;
    this._ownedMaterials.length = 0;
    this.material = null;
    this.mesh = null;
    this.wetEdgeMaterial = null;
    this.wetEdgeMesh = null;
    this.foamMesh = null;
    this.uniforms = null;
  }
}

export { oceanDepthAt, coastSdf, COAST_SDF, COAST_W15, shelfFrontAt, shelfTurningCensus };

export default {
  OCEAN,
  OCEAN_SPECULAR,
  OCEAN_W11,
  OCEAN_W12,
  OCEAN_W13,
  OCEAN_W14,
  OCEAN_X3,
  OCEAN_W15,
  OUTER_SEA,
  HARBOUR_CONTACT,
  WET_EDGE,
  OCEAN_RAMP,
  OCEAN_BANDS,
  BAY_SWELL,
  FOAM_MASK,
  CREST_LINE,
  BREAKER_ARCS,
  ZONE_BLEND,
  SPEC_CLUSTER,
  FOAM_STACK,
  FOAM_ART,
  PAINTED,
  SWASH,
  foamPhaseAt,
  foamSegmentAt,
  foamArtUv,
  foamCellWeight,
  breakerBandWhiteHitRate,
  segmentRunUpAt,
  authoredFoamAt,
  backwashAlphaAt,
  textureLoaderAvailable,
  loadAuthoredFoamPlates,
  loadAuthoredPaintPlates,
  foamPlateHref,
  paintPlateHref,
  paintedVAt,
  paintedDeepMixAt,
  paintedUvAt,
  paintedAlongPerimeter,
  paintedTileSpan,
  paintedCalmAt,
  paintedWrapSafeU,
  paintedWrapPair,
  portBasinWeightAt,
  harbourBasinWeightAt,
  airportWrapBasinWeight,
  portSheetYAt,
  seamWorldPair,
  seamNormalDot,
  paintedSwellFrameAt,
  oceanCoversPoint,
  HULL_WAKE,
  HULL_CONTACT,
  setOceanWakeHulls,
  clearOceanWakeHulls,
  oceanWakeState,
  oceanHullContactState,
  oceanHullContactAt,
  oceanWakeFieldAt,
  oceanWakeHeightAt,
  oceanDrawnSurfaceYAt,
  sampleOceanColumn,
  oceanBandAt,
  rampColorAt,
  waveAmpAt,
  foamCoverAt,
  beachFoamCoverAt,
  oceanSheetFoamAt,
  shelfSwashFoamAt,
  foamStackAt,
  wrapFrontAt,
  swashReachAt,
  contactFoamAt,
  harbourContactAtDepthGap,
  oceanSpecularProfileAt,
  oceanEnvFresnelAt,
  oceanMottleAt,
  oceanW12SheetAmtAt,
  oceanW12PlanarLiftAt,
  oceanW12ContactAtDepthGap,
  oceanW13EnvFresnelAt,
  oceanW13PlanarLiftCap,
  oceanW13SheetLobeAt,
  oceanX3TowardSunAt,
  oceanX3SheetRoughAt,
  oceanX3CapSheet,
  oceanW14CrestAt,
  oceanW14RingAt,
  oceanW15CausticAt,
  oceanW15SwellShadeAt,
  oceanW15MottleAt,
  oceanHullContactGapAt,
  COAST_W15,
  shelfFrontAt,
  shelfTurningCensus,
  OCEAN_W11,
  OCEAN_W12,
  OCEAN_W13,
  OCEAN_W14,
  OCEAN_X3,
  harbourReflectorAt,
  breakerArcsAt,
  bakeOceanDepthData,
  physicalSeabedDepthAt,
  SEABED_SHELF,
  buildWetEdgeGeometry,
  bakeFoamMapData,
  buildOceanGeometry,
  nearshoreStats,
  oceanRadialKnots,
  oceanAzimuths,
  pushPolarQuad,
  isHiddenFringeWaterName,
  columnDepthAt,
  OuterOcean,
  oceanDepthAt,
  coastSdf,
  COAST_SDF,
};
