// District Deck — shared waterfront fringe contract (presentation only).
// Single authority for wall / boardwalk / beach offsets so board.js and water.js
// cannot drift. All geometry lives OUTSIDE the playable board edge (seaward).

import * as THREE from 'three';

/** Metres past the board fringe along the water normal. */
/** Waterness above this is ocean, not crust-painted water: the one statement (wave 78). `SHORE`, `EDGE_SEAM` and `OCEAN` take it; the crust's water test, the sheet mesh's contour and `oceanCoversPoint` read it through them. */
export const WATERNESS_CUT = 0.55;

export const SHORE = Object.freeze({
  wallOffset: 2.8,
  wallDeep: 3.4,
  wallH: 1.42,
  copeH: 0.2,
  boardwalkW: 5.2,
  boardwalkH: 0.26,
  /**
   * Outer-ring ground-contact top (ground-tile.glb / road module-ground-contact).
   * Crust inner ring and the edge apron must meet this — never a step.
   * Independent of `sandY` so stairs / people / fringe keep their landing.
   */
  boardGroundTopY: 0.02,
  boardGroundBottomY: 0,
  boardKerbTopY: 0.16,
  boardAsphaltTopY: 0.04,
  /** Beach shelf plane Y (board + water + stairs share this). */
  sandY: 0.06,
  /** Dry beach depth seaward of wall (board metres). */
  sandSeaward: 40,
  wetDepth: 20,
  /**
   * Extra metres of wet-sand darkening at the waterline.
   * R13: one clean recession, not a 30 m mud strip (R11 extra 22).
   */
  wetDarkenExtra: 8,
  /**
   * P13-W NE port-corner mask (world). x > 262 ∧ z < 8, 12 m smoothstep
   * feather. Mid-beach (z ≳ 20) stays byte-identical. Wet/lip numbers
   * apply only inside the mask — wetDepth / wetDarkenExtra stay global.
   */
  cornerMaskX: 262,
  cornerMaskZ: 8,
  cornerMaskFeather: 12,
  cornerWetGain: 0.40,
  cornerWetInland: 8,
  /**
   * P13-W3: wrap lip is a per-FRAGMENT waterline feather, not the W-era
   * 8 m vertex-interpolated dissolve (that was the cream n-gon fan).
   * Width is metres of wrap-front. Inland of 0 the shelf is opaque.
   */
  cornerLipFrom: 0,
  cornerLipTo: 0.6,
  /** World-Y ceiling seaward of wrap-front (wake must not be cut). */
  cornerSeawardMaxY: 0.04,
  /** Extra metres of wrap-cap lift so polygonOffset cannot lose to ocean. */
  cornerWrapLift: 0.22,
  /**
   * P13-W2 sand micro-surface (whole beach, zero-mean value). Texture, not
   * a hue walk. Grain / wind-ripple / mottling stay inside these amps so
   * mid-beach mean luma cannot drift more than 2 %.
   */
  sandGrainA: 0.4,
  sandGrainB: 1.6,
  sandGrainAmt: 0.03,
  sandWindRipplePitch: 0.9,
  sandWindRippleAmt: 0.02,
  sandWindRippleFade: 6,
  sandMottleA: 20,
  sandMottleB: 40,
  sandMottleAmt: 0.04,
  sandDampSheenFrom: -7.2,
  sandDampSheenTo: -2.4,
  sandDriftFrontA: -2.35,
  sandDriftFrontB: -5.05,
  sandDriftWidth: 0.22,
  sandDriftAmt: 0.16,
  /** P13-W2 corner landform (mask only). Berm height metres, pool radius. */
  cornerBermH: 0.4,
  cornerBermAt: -12,
  cornerBermHalfW: 2.45,
  cornerPoolAlong: 8.0,
  cornerPoolShore: 11.2,
  cornerPoolR: 2.85,
  cornerRockCount: 5,
  cornerTussockCount: 14,
  /** P13-W3 rock-pool fill (linearised via sand.js srgb). */
  cornerPoolTint: '#245a56',
  cornerPoolRimRocks: 4,
  cornerChildCount: 1,
  /** Reach-line wrack (mask only). Fainter than the two whole-beach drifts. */
  sandDriftFrontC: 0.22,
  sandWetRippleKeep: 0.38,
  /**
   * P13-W2 wrap-lace band (metres of wrap-front). Wider seaward than W's
   * 1.5–5 so the ribbon matches mid-beach crest sea; landward stays a
   * waterline band (not the 14 m inland fan W rejected).
   */
  cornerLaceLand0: -11,
  cornerLaceLand1: -6.5,
  cornerLaceSea0: 2.4,
  cornerLaceSea1: 7.0,
  /** Metres past each board end the beach / coast is allowed to turn. */
  cornerWrapR: 140,
  /**
   * Open-bay terrain hole may reach this far past boardHalf along the coast.
   * Finite water extends four metres beyond it, buried beneath the headlands.
   */
  bayWaterAlongPad: 8,
  /** Open bay terrain hole stops here; terrain beyond is the far-shore paddock. */
  baySeaMax: 150,
  /** Finite water covers the full far-berm rise so its seaward edge stays buried. */
  bayWaterOverlap: 68,
  /**
   * Fringe / crust deep-water identity. Held far-sea plates and p9 pin this
   * hex. The live ocean *body* uses `navyDeep` — a punchier basin that can
   * survive AgX + grade. Do not silently equate the two.
   */
  deepWater: '#3a7a8c',
  /**
   * Saturated teal stop of the live four-stage ocean ramp (`uBayMid` /
   * `uRampTeal`). Shared with crust `EDGE_SEAM.shallowWater` so the identity
   * cannot drift; the crust still refuses to paint it.
   */
  shallowWater: '#159098',
  /**
   * Glassy olive shallows (`uBayShoal` / `uRampOlive`). Water column over
   * the first metre — not the crust seabed olive.
   */
  oliveShallow: '#3a8a4e',
  /**
   * Live basin navy (`uBayDeep` / `uRampNavy`). Authored dark and saturated
   * so the post chain cannot milk it back to cyan. R11 drops luminance
   * ~15% vs R10 `#123f5e` so the wide bay ends in deep blue, not cyan.
   */
  navyDeep: '#0e3957',
  /**
   * Wet-sand at the waterline. Single-sourced with crust `EDGE_SEAM.beachWet`
   * so the ocean ramp and the seabed colour cannot drift.
   */
  // Still the crust's sepia: edge-massing.js EDGE_SEAM.beachWet is single-sourced
  // with this and is outside the water lane. The water lane's own wet sand (the
  // sand shelf, the wet-edge decal) is `SAND_HUES.wet` / `WET_EDGE.beachSand`,
  // both ground.sand.wet-like (H 42). Move EDGE_SEAM.beachWet and this together.
  wetSand: '#6a5040',
  /**
   * Crust seabed under the ocean sheet (never water-blue). Sand-olive in
   * the shallows, darker olive as the bed drops. Shared with EDGE_SEAM.
   */
  seabedOlive: '#4a5a32',
  seabedDeep: '#2c3824',
  /**
   * Waterness above this is ocean, not crust-painted water. The crust
   * surface at these samples is seabed, below still-water.
   */
  waternessCut: WATERNESS_CUT,
  /** Foam / train placement from dry/wet transition. */
  foamStripW: 8.5,
  foamTrainW: 5.8,
  foamTrainOffset: 14,
  /**
   * Civic jetty on the bay axis. OuterOcean samples the same numbers for
   * foam collars / the calmer shadow — do not fork a second pier layout.
   */
  pierCount: 1,
  pierLength: 44,
  pierWidth: 5.4,
  pierAlongFrac: 0.5,
  get pierSea0() {
    return this.wallDeep * 0.42;
  },
  /** Water plane starts this far seaward of the wall face. */
  get waterFromWall() {
    return this.sandSeaward + this.wetDepth * 0.38;
  },
});

/** Unit seaward (+1) / along-board axes for each edge. */
export function edgeAxes(edge) {
  if (edge === 'north') {
    return {
      seaward: new THREE.Vector3(0, 0, -1),
      along: new THREE.Vector3(1, 0, 0),
      alongX: true,
    };
  }
  if (edge === 'south') {
    return {
      seaward: new THREE.Vector3(0, 0, 1),
      along: new THREE.Vector3(1, 0, 0),
      alongX: true,
    };
  }
  if (edge === 'west') {
    return {
      seaward: new THREE.Vector3(-1, 0, 0),
      along: new THREE.Vector3(0, 0, 1),
      alongX: false,
    };
  }
  // east
  return {
    seaward: new THREE.Vector3(1, 0, 0),
    along: new THREE.Vector3(0, 0, 1),
    alongX: false,
  };
}

/** Board-edge mid-point on the water face (still on the fringe, not past it). */
export function boardEdgeOrigin(edge, extent) {
  if (edge === 'north') return new THREE.Vector3(extent.x / 2, 0, 0);
  if (edge === 'south') return new THREE.Vector3(extent.x / 2, 0, extent.z);
  if (edge === 'west') return new THREE.Vector3(0, 0, extent.z / 2);
  return new THREE.Vector3(extent.x, 0, extent.z / 2);
}

/** Seawall centre world position (outside fringe). */
export function wallCentre(edge, extent) {
  const { seaward } = edgeAxes(edge);
  const origin = boardEdgeOrigin(edge, extent);
  return origin.clone().addScaledVector(seaward, SHORE.wallOffset);
}

/**
 * Boardwalk centre: seaward of wall face with slight socket onto the wall.
 * walkOffset from board edge along seaward.
 */
export function boardwalkCentre(edge, extent) {
  const { seaward } = edgeAxes(edge);
  const origin = boardEdgeOrigin(edge, extent);
  const walkOffset = SHORE.wallOffset
    + SHORE.wallDeep * 0.48
    + SHORE.boardwalkW * 0.42;
  return origin.clone().addScaledVector(seaward, walkOffset);
}

/** Along-edge length for esplanade runs (slightly proud of board). */
export function alongLength(edge, extent) {
  return edge === 'north' || edge === 'south' ? extent.x + 6 : extent.z + 6;
}

/**
 * World point: edge origin + seaward * s + along * t
 * t measured from centre (0) so t ∈ [-L/2, L/2].
 */
export function shorePoint(edge, extent, seawardM, alongFromCentre = 0) {
  const { seaward, along } = edgeAxes(edge);
  const origin = boardEdgeOrigin(edge, extent);
  return origin
    .clone()
    .addScaledVector(seaward, seawardM)
    .addScaledVector(along, alongFromCentre);
}

export default SHORE;
