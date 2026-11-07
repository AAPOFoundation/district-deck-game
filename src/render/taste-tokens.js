// @ts-check
/**
 * Taste tokens: the numeric half of docs/art-direction/taste/TASTE-BIBLE.md.
 *
 * Every lane takes ground, built, water, foliage and accent colours from here
 * and tests its own surfaces against the caps and banned bands below, so the
 * fringe, the coast and the city converge on one register. Pure data plus three
 * small helpers; no three.js import, so node tests and browser modules share it.
 * A hex that is not a token, on a surface over 25 m², is a fault under the bible.
 */

export const TASTE = Object.freeze({
  ground: Object.freeze({
    grassLush: '#6F7F48',
    grassDry: '#9A8A55',
    soil: '#8A6A45',
    track: '#A89A7C',
    sandDry: '#C9B386',
    sandWet: '#9E8E68',
    rockLight: '#A79E8C',
    rockDark: '#5E6470',
    snow: '#DDE4EC',
  }),
  built: Object.freeze({
    asphalt: '#4C4B49',
    concrete: '#A8A49A',
    kerb: '#B8B3A6',
    timber: '#8C6A48',
    roofIron: '#8E8A80',
    roofSlate: '#5E5A52',
    glazing: '#9FB4C4',
    marking: '#D9D6CE',
    /**
     * taste-r1 (W26, FENCE_CARRY): the post-and-wire parcel fence, weathered. Posts a grey-brown timber and the wire a darker
     * galvanised grey-brown, so the fence stands 8 to 12 L* under the lit paddock (W25's '#a29f94' read pale against it).
     */
    fenceTimber: '#9E8C78',
    fenceWire: '#877A6A',
  }),
  /** Depth ramp, shared by every body of water. Blend by absorption exp(-depth / 4). */
  water: Object.freeze({
    foam: '#DCE8E6',
    shallow: '#6FB6B4',
    mid: '#3F8E9A',
    midDeep: '#2A6587',
    deep: '#1E3B5D',
    /** [depth in metres, token] stops of the ramp. */
    ramp: Object.freeze([
      Object.freeze([0.5, '#6FB6B4']),
      Object.freeze([2, '#3F8E9A']),
      Object.freeze([6, '#2A6587']),
      Object.freeze([15, '#1E3B5D']),
    ]),
    absorptionDepth: 4,
  }),
  foliage: Object.freeze({
    leafA: '#5C6E3E',
    leafB: '#6E7D48',
    leafGrey: '#7A8468',
    leafAutumn: '#B5873E',
    trunk: '#6B5A48',
    /**
     * taste-r1 (W26): bark of the pale-barked eucalypt under CROWN_SHADE_WARM, a warm grey multiplier (it renders near 93, 84, 69 in shade at station 18; #867664 read orange-brown). The shade
     * light is blue, so the grey the callers built from rockLight and trunk (about H 38, S 22) read lavender in shade.
     */
    trunkPale: '#938C8A',
    /**
     * taste W43 (TRUNK_BARK): the pale bark of the eucalypt with the switch on, the same luminance as trunkPale (within 1 percent) and
     * warmer and more saturated (H 34, S 24 against H 15, S 6): trunkPale is near neutral, so at f1 the shaded foot of the bole read
     * (86, 80, 88), H 285, lilac. Its multiplier keeps r / g near 1.9, well over the shader's bark ratio of 1.5.
     */
    trunkBark: '#9B8B76',
    /** Largest share of trees in any frame that may carry the autumn accent. */
    autumnShareMax: 0.25,
    /**
     * taste-r1 (W25): the CROWN_GREENS targets, one per crown species, as the crown wears them (tree-forms.js takes each over the
     * instance colour the caller gives the species, tint included). Each sits inside TASTE_CAPS.foliage and off every banned
     * band, with room for the form-to-form roll of 5 degrees of hue and 5 percent of value and the card roll of 3 degrees.
     */
    crownGreens: Object.freeze({
      // The clear-day shade light gives a crown about 0.07 red, 0.14 green and 0.33 blue of what the lit side gets, so a pale grey
      // albedo (S 24) turned teal in the shade; eucalypt and cypress carry more saturation and a yellower hue to stay green there.
      eucalypt: '#788545', // grey-olive (H 72, S 48, V 52)
      cypress: '#3E6631', // dark green (H 105, S 52, V 40)
      plane: '#788F42', // fresh mid green, yellow-leaning (H 78, S 54, V 56)
      weeping: '#6A8F6A', // silvery blue-green (H 120, S 26, V 56)
      shrub: '#808040', // yellower olive (H 60, S 50, V 50)
    }),
    /**
     * taste-r1 (W25): the AUTUMN_SET tones mixed card by card inside one autumn crown (amber is leafAutumn). Each sits inside
     * TASTE_CAPS.foliageAutumn and off every banned band; `green` is a plane that has not turned yet.
     */
    autumnSet: Object.freeze({
      amber: '#B5873E', // H 37, S 66, V 71
      russet: '#7A3627', // H 11, S 68, V 48
      copper: '#9E5A33', // H 22, S 68, V 62
      oldGold: '#B39E52', // H 47, S 54, V 70
      green: '#67804A', // H 88, S 42, V 50
    }),
  }),
  /** Small surfaces only: each under 4 m². */
  accent: Object.freeze({
    red: '#9E3B2E',
    gold: '#C9A23F',
    navy: '#2F4A6A',
    maroon: '#7A3A3A',
    olive: '#6B6E48',
  }),
  /** Landmark identity colours for courts and sports surfaces, and tent canvas (round-one gate, ruling 3). */
  venue: Object.freeze({
    courtPlay: '#3E6F9E',
    courtRunoff: '#2F527A',
    canvas: '#D9D6CE',
  }),
  fog: '#A9B9CE',
  shadowTint: '#3E4A5E',
});

/** HSV caps per surface class. Hue in degrees, saturation and value in percent. */
export const TASTE_CAPS = Object.freeze({
  ground: Object.freeze({ h: [30, 100], s: [15, 50], v: [42, 70] }),
  sand: Object.freeze({ h: [35, 50], s: [15, 50], v: [42, 82] }),
  foliage: Object.freeze({ s: [20, 55], v: [35, 60] }),
  foliageAutumn: Object.freeze({ s: [20, 70], v: [35, 75] }),
  paint: Object.freeze({ s: [0, 55], v: [25, 80] }),
  vehicle: Object.freeze({ s: [0, 60], v: [30, 85] }),
  neutral: Object.freeze({ h: [20, 50], s: [0, 12] }),
  snow: Object.freeze({ h: [200, 220], s: [4, 10], v: [0, 93] }),
  court: Object.freeze({ h: [200, 215], s: [0, 62], v: [45, 62] }),
  /** Venue ground (turf, paving) sits with the paddocks and the city, never paler. */
  venueGround: Object.freeze({ s: [0, 50], v: [42, 72] }),
  /** Adjacent ground patches may differ by at most this much. */
  patchDeltaV: 20,
  patchDeltaH: 25,
});

/**
 * Colours banned from any surface over 25 m². `hue` ranges may wrap through 0.
 * Each entry names the fault it retires.
 */
export const TASTE_BANNED = Object.freeze([
  Object.freeze({ id: 'blood-red', hue: [0, 20], sMin: 70, vMax: 45 }),
  Object.freeze({ id: 'mustard', hue: [40, 55], sMin: 50, vMin: 75 }),
  Object.freeze({ id: 'lime', hue: [95, 130], sMin: 40, vMin: 65 }),
  Object.freeze({ id: 'cyan-glow', hue: [180, 200], sMin: 30, vMin: 75 }),
  Object.freeze({ id: 'ink-blue', hue: [0, 360], sMin: 90 }),
  Object.freeze({ id: 'near-black-green', hue: [60, 180], sMin: 15, vMax: 22 }),
  Object.freeze({ id: 'pure-white', hue: [0, 360], sMax: 5, vMin: 93 }),
  Object.freeze({ id: 'sepia-shelf', hue: [330, 20], sMin: 20, vMax: 45 }),
]);

/** Scale law. Metres. The tray is 1:1 from one adult; big machines are 1:4 on every axis. */
export const TASTE_SCALE = Object.freeze({
  adult: [1.6, 1.8],
  storey: 3.2,
  door: 2.2,
  sapling: [3, 5],
  streetTree: [9, 14],
  heroTree: [14, 20],
  eucalypt: [16, 24],
  cypress: [12, 16],
  palmTrunk: [6, 10],
  norfolk: [18, 24],
  hedge: Object.freeze({ width: 1.8, height: 2.2 }),
  fence: Object.freeze({ height: 1.1, postPitch: 4 }),
  umbrella: Object.freeze({ diameter: [2.0, 2.4], height: [2.2, 2.4] }),
  boulder: [0.6, 2.5],
  machineRatio: 0.25,
  landscapeHeightRatio: 0.5,
});

/** Boundary law. Metres. */
export const TASTE_BOUNDARY = Object.freeze({
  /** Nothing but built and ground tokens renders within this band outside the tray edge. */
  trayBand: 6,
  /** Blend distance from verge level to hinterland level. */
  trayBlend: 20,
  /** Shared blend zone between adjacent precincts; their ground polygons never overlap. */
  precinctBlend: 10,
  /** Minimum blend width of a paddock patch edge, and the noise feature size of the mask. */
  paddockBlend: 12,
  paddockNoise: 6,
});

/** Motion law. Metres. */
export const TASTE_MOTION = Object.freeze({
  /** Deepest interpenetration a sweep test tolerates as contact rather than a fault. */
  tolerance: 0.3,
  spreaderClearance: 0.5,
  boomClearance: 1,
  laneWidthPerBeam: 1.5,
  crossingSeparation: 40,
  floatHullGap: 6,
});

/** Rain may soften the key and wet the ground. It may not tint neutrals or remove shadows. */
export const TASTE_RAIN = Object.freeze({
  sunGain: 0.55,
  sunColour: '#F2EEE8',
  hemisphereGain: 1.3,
  skyZenith: '#9CA5AE',
  skyHorizon: '#B9BEC4',
  /** Cloud-shadow mottle on the sun: two noise octaves (metres), mapped to [min, 1], drifting. */
  mottle: Object.freeze({ octaves: [140, 400], min: 0.55, drift: 3 }),
  shadowRadiusPx: 6,
  shadowFloor: 0.55,
  wetRoughness: 0.30,
  puddle: Object.freeze({ noise: 2.5, coverage: 0.12, roughness: 0.05 }),
  wetAlbedo: Object.freeze({ sand: 0.78, soil: 0.80, grass: 0.92, concrete: 0.90 }),
  desaturate: 0.08,
  neutralHueShiftMax: 4,
  sea: Object.freeze({ roughnessAdd: 0.12, glintWeight: 0.35, swellEnvelope: 1.3, whitecaps: 0.008, deepSaturationMin: 45 }),
});

/** @param {string} hex @returns {{h:number,s:number,v:number}} hue in degrees, s and v in percent */
export function hexToHsv(hex) {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : (d / max) * 100, v: max * 100 };
}

const hueIn = (h, [lo, hi]) => (lo <= hi ? h >= lo && h <= hi : h >= lo || h <= hi);

/** @param {string} hex @returns {string|null} the id of the banned band the colour falls in, or null */
export function bannedBandOf(hex) {
  const { h, s, v } = hexToHsv(hex);
  for (const band of TASTE_BANNED) {
    if (!hueIn(h, band.hue)) continue;
    if (band.sMin !== undefined && s <= band.sMin) continue;
    if (band.sMax !== undefined && s >= band.sMax) continue;
    if (band.vMin !== undefined && v <= band.vMin) continue;
    if (band.vMax !== undefined && v >= band.vMax) continue;
    return band.id;
  }
  return null;
}

/** @param {string} hex @param {keyof typeof TASTE_CAPS} kind @returns {boolean} */
export function withinCaps(hex, kind) {
  const cap = TASTE_CAPS[kind];
  if (!cap || typeof cap !== 'object') return false;
  const { h, s, v } = hexToHsv(hex);
  if (cap.h && !hueIn(h, cap.h) && s > 3) return false;
  if (cap.s && (s < cap.s[0] || s > cap.s[1])) return false;
  if (cap.v && (v < cap.v[0] || v > cap.v[1])) return false;
  return true;
}
