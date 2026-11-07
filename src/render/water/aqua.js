// P21 R5: the committed transparent bay shading, on the map's continuous coast.
import * as THREE from 'three';
import { SURFACE_GLSL } from './surface.js';
import { SHORE_COMMON_GLSL, WATER_VARYINGS_GLSL } from './contract.js';
import { WATER_SLOPE, waterSlopeField, waterSlopeGlsl } from './slope-field.js';
import { TASTE } from '../taste-tokens.js';
import { WATER_LAW } from './law.js';
import { seaEnvelopeGlsl, seaFragmentGlsl, seaRainState, WHITECAP_FOAM } from './sea.js';
import { SURF, surfLutGlsl, SWELL_WANDER, SWELL_WANDER_TUNE, SWELL_FAR_MIX, SWELL_FAR_MIX_TUNE, SWELL_FAR_TUNE, SWELL_FAR_TUNE_P } from './surf.js';
import { loadCoastPack } from '../coast-textures.js';
import { FRINGE } from './foam.js';
// taste-r1 (W20-A): `fr(old, new)` is the surf-row value with the FRINGE switch (foam.js): old at gain 0, new at gain 1.
const fr = (oldV, newV) => oldV + (newV - oldV) * FRINGE.gain;

/**
 * Sea sparkle and swell-shade strengths (gate ruling 1). Review knobs, tuned against
 * `water-gate.py` at station 21 under clear sky: x glint density (share of cells that host a
 * glint on a sun-facing flank), y glint radiance per unit sun colour, z swell shade (luminance
 * swing of the body across a swell face toward and away from the sun).
 */
// W6-A: gain 0.55 -> 0.41. At full clear sky the 240 m station read luminance SD 13.6 against the 4-12 band
// (specks near clipping). The speck contrast falls steeply with gain through the grade: 0.36 gave SD 5.4 but
// 13% of the energy in five spectral bins and a 64 px tile at SD 2.8 (both over their limits); 0.46 gave SD 12.0.
/** taste-r1 (W15-A1): fleck candidate density inside a gust, clear and rain (tuned against the 0.2-0.6 % and 0.5-1.5 % coverage targets at station 21). */
/**
 * taste-r1 (W19-C): the swell shade falls with the distance from the camera to the water, so the open sea at the overview reads as broad soft tone and not
 * as parallel ribs from edge to edge. Full contrast under `near` metres, `keep` of it by `far`; a slow patch term (octaves `patchM` and 0.45 `patchM`
 * metres, so patches of 150 to 400 m) removes up to `patchDepth` of what is left, growing with the same fall. `gain` 0 restores today's shade at every distance.
 */
export const SEA_FAR_SHADE = Object.freeze({ gain: 1, near: 250, far: 700, keep: 0.42, patchM: 330, patchDepth: 0.75 });
export const FLECK_DENSE = Object.freeze({ clear: 1.15, rain: 6.00 });
/**
 * taste-r1 (W15-A2): rows of surf on the city beach shelf. One row every `spacingM` metres of shore distance, advancing shoreward
 * on the swash period; the nearest row is the widest and brightest. `cap` is the opacity on a row crest (the shore foam stays at 0.7).
 */
export const SURF_ROWS = Object.freeze({
  /** Mean distance between row crests (metres of shore distance): 8 m, so three rows stand inside 25 m and a fourth is born faint beyond. Each row is moved off the even grid by rowJitterM (W16), so the real gaps run about 5.6 to 10.4 m. */
  spacingM: 8.0,
  phase: 0.37,
  /** Full width of the row's lace profile (metres): the outer row is the thinnest, the nearest the widest. */
  widthInnerM: 1.8,
  widthOuterM: 1.0,
  /** Profile centre behind the crest and its wander along the shore (metres, each row its own wander). */
  centreM: 1.7,
  wanderM: 1.6,
  /** Coverage noise: octaves in metres along the row, and the soft threshold that leaves about half the crest foamed. */
  covLongM: 9.0,
  covShortM: 3.6,
  covLo: fr(0.40, 0.48), // taste-r1 (W20-A): the nearest row is broken patches (0.40 -> 0.48)
  covHi: fr(0.55, 0.64),
  /** Alpha floor of the thin film between strands where the lace is open. */
  filmFloor: 0.10,
  bornFromM: 17.0,
  bornToM: 25.0,
  /** Share of the brightness the outermost row keeps against the nearest (16 m from the lip and beyond). taste-r1 (W16): 0.55 -> 0.40 (undo 0.55). */
  outerShare: fr(0.40, 0.13), // taste-r1 (W20-A): a third of today's (0.40 -> 0.13)
  /** taste-r1 (W16): brightness of the second row at 8 m from the lip, between the nearest (1.0) and the outermost (outerShare). Undo: 1.0 with outerShare 0.55. */
  rowSecondOpacity: fr(0.75, 0.25), // taste-r1 (W20-A): 0.75 -> 0.25
  /** taste-r1 (W16): amplitude (m) of each row's distance from the lip, a value noise on an 8 m lattice across the shore (one lattice cell per row) and rowJitterAlongM along it. Undo: 0 (even 8 m spacing). */
  rowJitterM: 1.2,
  rowJitterAlongM: 10.0,
  /** Mips of blur added to the lace read on top of the pixel footprint's own mip (about one pixel more, 6 to 10 cm): the soft edge. */
  laceBlurLod: 0.8,
  laceTileM: 5.5,
  /** Opacity at the row crest. 0 switches the surf rows off (the shelf cover, the shelf shade and the rain chroma stay). */
  cap: 0.70,
  /** Multiplier on the foam token for a row crest. */
  crestGain: 1.0,
  /** Depth scale of the water's cover over the sand on the beach shelf (the shared law uses 0.30 m). */
  shelfCoverM: 0.10,
  /** Share of the swell band shading kept at the waterline on the beach shelf; full again from 38 m. */
  shelfShadeMin: 0.30,
  /** Extra chroma on the beach shelf in rain (the grade desaturates it to S 25; the target is 28 or more). */
  rainShelfChroma: 0.55,
  /** taste-r1 (W15 fix, task 3): share of the linear light the rain takes off the first 12 m of the shelf water (L* 65 to 67 between rows against 50 to 62); 0 switches it off. */
  rainShelfDark: 0.20,
  /** taste-r1 (W17-B): the trail behind each row, on its seaward side (the wave's wake): opacity at the row, length range (metres), and how far the lace is stretched along the travel (the across-row lookup is scaled by this; smaller = longer streaks). 0 gain switches the trails off. Undo: trailGain 0. */
  trailGain: fr(0.32, 0.16), // taste-r1 (W20-A): 0.32 -> 0.16
  trailMinM: 3.0,
  trailMaxM: 6.0,
  trailStretch: 0.70,
  /** taste-r1 (W17-B): the wash between the nearest row and the lip: opacity range of the net (a thin net with holes), its reach from the waterline (metres), its drift as a share of the row speed, and the share it keeps by the time its age reaches a full row period. 0 gain switches it off. Undo: washGain 0. */
  washGain: fr(0.22, 0.10), // taste-r1 (W20-A): 0.22 -> 0.10
  washMinGain: 0.55,
  washReachM: 7.0,
  washDrift: 0.6,
  washAgeKeep: 0.45,
});
// taste-r1 (W15 fix): shade 0.40 -> 0.47; the finite-crest group noise (water/surf.js) lowers the mean swell amplitude, so the 8-33 m band is given back through the shade.
// taste-r1 (W16-A): shade 0.47 -> 0.55 (undo 0.47): the wider group lulls (water/surf.js envMin, envLo, envHi) take swell energy out of the 8-33 m band, so the sets are given it back.
/**
 * taste-r1 (W20-A): clear shallows on the beach shelf. Cover (alpha) of the sheet over the sand by depth of water: a01 at 0.1 m, a04 at 0.4 m, a10 at 1.0 m,
 * the shared law from joinM. `tear` is the share of the depth a metres-scale noise (tearScaleM) moves either way, `chroma` the extra body chroma at zero cover, `tint` the share of the body that is the vivid `aqua` (linear, times the water gain) at zero cover (it falls by `tintCover` of the cover),
 * `mirrorFloor` the share of the sky mirror left at zero cover. `gain` 0 restores wave fifteen's cover (95% at 0.3 m).
 */
export const SHALLOW_CLEAR = Object.freeze({ gain: 1, a01: 0.28, a04: 0.70, a10: 0.90, joinM: 1.4, tear: 0.25, tearScaleM: 2.2, chroma: 2.2 /* taste-r1 (W20 review): 2.8 read as a neon ribbon against the slate sea at station 10 */, mirrorFloor: 0.25, aqua: [0.0, 0.72, 0.64], tint: 1.0, tintCover: 0.35 });
/**
 * taste-r1 (W21-B): Port Phillip tone for the clear shallows. Colour only; the cover law above is untouched. `chroma` replaces SHALLOW_CLEAR.chroma, `aqua` the vivid tint (linear, olive-jade),
 * `rain` the share of chroma and of the tint's own chroma removed at full rain (uSea.x) so the shallows grey with the slate sea but keep the olive hue, `hold` the power on the tint's depth fall (below 1 holds the olive further out over the shelf, 1 is wave twenty's fall), `featherFrom`/`featherTo` the metres of water over which the tint falls into the deep colour
 * (was 0.30 to 0.95). `gain` 0 restores wave twenty's numbers.
 */
export const SHALLOW_TONE = Object.freeze({ gain: 1, chroma: 1.2, aqua: [0.11, 0.41, 0.28], rain: 0.35, hold: 0.45, featherFrom: 0.12, featherTo: 1.4, rainHue: 1 /* taste-r1 (W22-C): share of the shelf body that takes the deep water's hue in rain; 0 restores W21 */, rainHueTo: 3.2 /* m of water over which that pull falls away */, rainHueChroma: 0.30 /* the deep hue's chroma direction, scaled to this share of the body's luminance */, rainLift: 0.0, cove: 1 /* taste-r1 (W22-C): the Apostles cove takes the temperate tone and the feathered edge; 0 keeps wave fifteen's turquoise */ });
/** taste-r1 (W24-A): metres over which the shelf term ramps in across the front's zero (centred); 0 restores the hard step and today's sheet. */
export const SHELF_FRONT_SOFT_M = 12;
/**
 * taste-r1 (W25-A): the switch for the Apostles cove's join with the sea. The cove's tint (scKt) lay over a flat shallow shelfDepth across the whole cove and ended on the soft box, a turquoise pool with a ruled edge (station 08).
 * 1 deepens the depth the tint reads (`openM` at `deepToM` m from the cove beach, from `deepFromM`) and fades the tint out between `fadeFromM` and `fadeToM` m of shore distance along an edge torn `tearM` m either way (noise of `tearScaleM` m);
 * the surf rows' hard cove box becomes a torn edge of `boxSoftM` m. 0 restores wave twenty-four exactly. Browser: `?coveJoin=0`; node: `DD_COVE_JOIN=0`.
 */
export const COVE_JOIN = (typeof process !== 'undefined' && process?.env?.DD_COVE_JOIN !== undefined)
  ? Number(process.env.DD_COVE_JOIN) > 0 ? 1 : 0
  : (typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('coveJoin') === '0' ? 0 : 1);
const CVD = COVE_JOIN > 0 ? 'scDt' : 'scD'; // the depth the tint terms read
export const COVE_JOIN_TUNE = Object.freeze({ fadeFromM: 14, fadeToM: 60, tearM: 14, tearScaleM: 11, openM: 5, deepFromM: 4, deepToM: 45, boxSoftM: 15 });
/**
 * taste-r1 (W40): the switch for the rim's pale shallows, the Pocket Reserve method (water-surface.ts: depth from the shore distance, a bed colour made up in the shader,
 * a per-channel Beer-Lambert tint, `bed * trans + insc * (1 - trans)`, a near-opaque sheet whose cover falls only at the waterline). Nothing is drawn under the water: the sheet itself is the pale shelf.
 * Inside the rim mask (1 minus the coast field's board weight, so from 150 to 220 m outside the board: not the city beach, the port basin or the open sea) the shelf depth is `depthM` m
 * over `shelfM` m of shore distance (smoothstep, from `floorM`), the bed is the rim sand token times `sandGain`, `k0` to `k1` are the Beer-Lambert coefficients per metre (red, green, blue) at the waterline and at the shelf's end,
 * the in-scatter is the sheet's own body colour, the tint hands back to the sheet between `fadeFromM` and `fadeToM` m of shore distance, the cover is at least `cover` past a margin of `marginM` m (torn by `tear` of it) at the waterline.
 * 0 restores wave thirty-nine's shader text exactly. Browser: `?rimTint=0`; node: `DD_RIM_TINT=0`.
 */
export const RIM_TINT = (typeof process !== 'undefined' && process?.env?.DD_RIM_TINT !== undefined)
  ? Number(process.env.DD_RIM_TINT) > 0 ? 1 : 0
  : (typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('rimTint') === '0' ? 0 : 1);
/**
 * taste-r1 (W41): the rim shallows' tone, the owner's choice from a picture of each. Three presets of the shelf's depth, sand gain and Beer-Lambert coefficients (the mask, the cover and the hand-back are the same at all three):
 * `jade` is wave forty's (the default: the shader text is the same as it was), `sand` is pale sand under a thin film (a sandbar in shallow clear water), `clear` is pale aqua (a tropical shelf).
 * Browser: `?rimTone=jade|sand|clear`; node: `DD_RIM_TONE`. Anything else is `jade`. `rimTint=0` still turns the whole shelf off.
 */
export const RIM_TONES = Object.freeze({
  jade: Object.freeze({ depthM: 2.5, sandGain: 0.70, k0: Object.freeze([0.20, 0.07, 0.08]), k1: Object.freeze([0.55, 0.20, 0.25]) }),
  sand: Object.freeze({ depthM: 0.9, sandGain: 1.15, k0: Object.freeze([0.22, 0.08, 0.02]), k1: Object.freeze([0.45, 0.18, 0.04]) }),
  clear: Object.freeze({ depthM: 2.5, sandGain: 1.6, k0: Object.freeze([1.40, 0.15, 0.00]), k1: Object.freeze([1.80, 0.45, 0.20]) }),
});
export const RIM_TONE = (() => {
  const q = (typeof process !== 'undefined' && process?.env?.DD_RIM_TONE !== undefined)
    ? process.env.DD_RIM_TONE
    : (typeof location !== 'undefined' && location?.search ? new URLSearchParams(location.search).get('rimTone') : null);
  return Object.prototype.hasOwnProperty.call(RIM_TONES, q) ? q : 'jade';
})();
export const RIM_TINT_TUNE = Object.freeze({ floorM: 0.03, shelfM: 24, fadeFromM: 26, fadeToM: 56, cover: 0.92, marginM: 1.4, tear: 0.5, ...RIM_TONES[RIM_TONE] });
/**
 * taste-r1 (W42): the switch for the far shore's lip. On the east hinterland shore (c3, c4) the white lip of the shore (aquaFragment's `lip`, a line at the shore distance 0 to 0.8 m) ran as a saw-tooth strip: it is a contour of the coast field's S (and of the bed's own
 * near-zero rows), a 2.73 m texel grid on a shore that runs at 45 degrees, so its contour steps every 3.87 m. 1 reads the lip's shore distance as the mean of `taps` samples of that same distance (S, with the bed's near-shore minimum) on two rings of `ringM` m round the pixel,
 * less `biasM` (what a straight shore adds to its own zero: the mean of the ring's positive part), from `fromM` to `toM` m from the board centre (the bake grid's centre) outward: not the city beach (class 0), the port (class 1), the cove or the open sea.
 * 0 restores wave forty-one's shader text exactly. Browser: `?farShore=0`; node: `DD_FAR_SHORE=0`.
 */
export const FAR_SHORE = (typeof process !== 'undefined' && process?.env?.DD_FAR_SHORE !== undefined)
  ? Number(process.env.DD_FAR_SHORE) > 0 ? 1 : 0
  : (typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('farShore') === '0' ? 0 : 1);
export const FAR_SHORE_TUNE = Object.freeze({ ringM: Object.freeze([1.8, 3.6]), perRing: 6, biasM: 0.78, fromM: 480, toM: 540, nearM: 10 });
/**
 * taste-r1 (W43): the switch for the far shore's teeth. The sand-coloured saw-tooth cut into the white lip from the land side at the far corner is the ocean patch's own alpha edge (`water.a`: shelfDepth, wave15A, the shallow-clear terms),
 * which follows `si.depth`, the bed sampled per fragment from uBedDepth (2.73 m texels). There the bed goes from 0 to 13 to 15 m within one texel along a diagonal staircase, so every depth contour is serrated. 1 replaces `si.depth`, under FAR_SHORE's far-ring mask,
 * with the depth the 1 in 15 shelf gives at the low-passed shore distance the lip reads (the same 13 taps, summed once), `slope * max(meanS - biasM, 0)`, and blends back to the real bed over `fallM` m of that distance. 0 restores wave forty-two's shader text exactly.
 * Browser: `?shoreTeeth=0`; node: `DD_SHORE_TEETH=0`. Needs FAR_SHORE (its ddFarS and taps).
 */
export const SHORE_TEETH = (typeof process !== 'undefined' && process?.env?.DD_SHORE_TEETH !== undefined)
  ? Number(process.env.DD_SHORE_TEETH) > 0 ? 1 : 0
  : (typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('shoreTeeth') === '0' ? 0 : 1);
export const SHORE_TEETH_TUNE = Object.freeze({ slope: 0.066, fallM: Object.freeze([8, 20]), quitM: 26, lipA: 0.75 });
/**
 * taste-r1 (W45): the switch for the sea sparkle's sun path. The sparkle (`spark`, the 1 px points of ddSeaSparkle) had no term for the sun's reflection: its only sun link was `gather`, a swell-slope test that holds the same everywhere on screen, so the points lay evenly over the whole water
 * and were thinnest near the sun's mirror (station 10: 66 to 112 per 100,000 px from the mirror outward). 1 weights both the speck density (through `gather`) and its brightness by a specular lobe on the half vector of the chop normal, `smoothstep(nhFrom, nhTo, nh)` (nh is the GGX lobe's own N.H),
 * so the glints crowd into a glitter path round the mirror point and thin away from it; the peak brightness and the rain and distance fades are unchanged, as are the broad glint and the foam. 0 restores wave forty-four's shader text exactly.
 * Browser: `?seaSparkle=0`; node: `DD_SEA_SPARKLE=0`.
 */
export const SEA_SPARKLE = (typeof process !== 'undefined' && process?.env?.DD_SEA_SPARKLE !== undefined)
  ? Number(process.env.DD_SEA_SPARKLE) > 0 ? 1 : 0
  : (typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('seaSparkle') === '0' ? 0 : 1);
export const SEA_SPARKLE_TUNE = Object.freeze({ nhFrom: 0.93, nhTo: 0.995 });
/**
 * taste-r1 (W46): the switch for the sparkle's glitter path. SEA_SPARKLE's lobe (nh 0.93 to 0.995, about 22 degrees of normal tilt) is wider than the frame at the game camera's range, so inside it the glints are as dense near the sun's mirror as at its edge and no path reads.
 * 1 adds a crowd term, `sparkPath = smoothstep(nhFrom, nhTo, nh)`, a narrow lobe that is 1 at the mirror point and 0 by nhFrom (about 10 degrees of normal tilt, 20 degrees of view angle from the mirror): it lifts `gather` to at least itself, multiplies the cell density by `1 + count * sparkPath`
 * and the brightness by `1 + gain * sparkPath`, so the glints gather densely and brightly into a path round the mirror and fall off smoothly from it. The glints' size (the `size` argument), the broad glint, the whitecap flecks and the foam are not changed. 0 restores wave forty-five's shader text exactly. Needs SEA_SPARKLE (its sparkSun).
 * Off by default through wave forty-seven (each glint drew beside a near-black pixel, a dark speck, and the path multiplied them about
 * tenfold round the mirror: 790 to 8,358 dark outliers in the region at station 46-sun-path); on again from wave forty-eight, whose
 * SHARPEN_FLOOR (post.js) removes the speck at its cause (path on: 8,073 dark outliers with the floor off, 53 with it on; path off: 822 and 0).
 * Browser: `?sparklePath=0`; node: `DD_SPARKLE_PATH=0`.
 */
export const SPARKLE_PATH = (typeof process !== 'undefined' && process?.env?.DD_SPARKLE_PATH !== undefined)
  ? Number(process.env.DD_SPARKLE_PATH) > 0 ? 1 : 0
  : (typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('sparklePath') === '0' ? 0 : 1);
export const SPARKLE_PATH_TUNE = Object.freeze((() => {
  const t = { nhFrom: 0.985, nhTo: 0.9995, count: 3, gain: 1.0 }; // count 3, not 5: at 5 neighbouring cells merged into clusters of up to 14 px (wave forty-six's review)
  const q = typeof location !== 'undefined' && location?.search ? new URLSearchParams(location.search).get('sparklePathTune') : null;
  if (q) { const v = q.split(',').map(Number); if (v.length === 4 && v.every(Number.isFinite)) [t.nhFrom, t.nhTo, t.count, t.gain] = v; }
  return t;
})());
const SPARKLE_PATH_ON = SPARKLE_PATH > 0 && SEA_SPARKLE > 0;
const TEETH_ON = SHORE_TEETH > 0 && FAR_SHORE > 0;
const FAR_SHORE_TAPS = (() => {
  const T = FAR_SHORE_TUNE;
  const taps = [];
  T.ringM.forEach((rad, ri) => { for (let k = 0; k < T.perRing; k += 1) { const th = ((k + 0.5 * ri) / T.perRing) * Math.PI * 2; taps.push([rad * Math.cos(th), rad * Math.sin(th)]); } });
  return taps;
})();
const ST = (a, b) => (a + (b - a) * SHALLOW_TONE.gain).toFixed(3);
export const SEA_TUNE = Object.freeze({ density: 0.075, gain: 0.41, shade: 0.55 });
const SHADE_TRAINS = WATER_LAW.waves.ocean.shadeTrains;
/** taste-r1 (W16-A): share of a group lull the swell shade is lifted back by (was 0.7 inline). 0.55 leaves the lulls visibly quieter, so sets read as sets; undo 0.7. */
export const SEA_LULL_LIFT = 0.55;

export const W22_R4_MACRO_BOUND = 0.012;
// Linear-channel ceiling leaves headroom for the presentation grade's chroma.
export const W22_R5_SATURATION_CEILING = 0.65;
export const W22_R5_THIRD_OCTAVE_BOUND = 0;
/**
 * Fragment chop under the 14 m Gerstner. Normal only — no extra mesh.
 * Metres are District Deck wavelengths, not a copied pond scale.
 */
export const COAST_CHOP = Object.freeze({
  longM: 6.2,
  fineM: 2.7,
  longAmp: 0.11,
  fineAmp: 0.05,
  fineFadeFromM: 90,
  fineFadeToM: 180,
  /** Noise-gradient scale. Small enough that crests do not become metal ridges. */
  slopeGain: 0.16,
  /** Grazing mirror ceiling. Depth still raises the mix under this cap. */
  mirrorCap: 0.28,
  /** Existing planar target, five taps. Not a new pass or a larger buffer. */
  planarBlurTexel: 2.40,
  planarMix: 0.55,
  /** Below this scale the detail slope is absent. 0 is fully off. */
  scaleOpen: 0.04,
  /** Low tier (0.32) sits inside this window; high (0.45) is past it. */
  tierFrom: 0.28,
  tierTo: 0.42,
  tierFloor: 0.70,
});

function smooth01(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** CPU twin of the fragment chop weight. Scale 0 returns 0, not the tier floor. */
export function coastChopGain(waveScale) {
  const s = Number.isFinite(Number(waveScale)) ? Number(waveScale) : 0;
  const live = smooth01(0, COAST_CHOP.scaleOpen, Math.max(s, 0));
  const tier = smooth01(COAST_CHOP.tierFrom, COAST_CHOP.tierTo, s);
  return live * (COAST_CHOP.tierFloor + (1 - COAST_CHOP.tierFloor) * tier);
}

/**
 * Fine-octave sample coordinate. Matches the shader:
 * `(q * 1.7 + vec2(4, 1) + step) * 0.31 + drift * 1.4`.
 * The offset is scaled by 0.31 (4 → 1.24, 1 → 0.31). The finite step is `e`,
 * not `e * 1.7`.
 * @param {[number, number]} q warped world point
 * @param {[number, number]} step added in q2 space before the 0.31 scale
 * @param {[number, number]} drift
 */
export function coastChopFineUv(q, step, drift) {
  const q2x = q[0] * 1.7 + 4 + (step[0] || 0);
  const q2y = q[1] * 1.7 + 1 + (step[1] || 0);
  return [
    q2x * 0.31 + drift[0] * 1.4,
    q2y * 0.31 + drift[1] * 1.4,
  ];
}

/**
 * Resolved shading slope at a pixel footprint in metres.
 * The old third argument was a 90–180 m camera fade. That fade removed detail
 * and left the 40/28/14 m Gerstner ribbons. Callers now pass footprint.
 */
export function coastChopSlope(p, t, footprint = 0.4) {
  return waterSlopeField(p, t, footprint).slope;
}

/**
 * Keep the Gerstner normal and add detail slope in xz.
 * Weight 0 returns the normalised base, including across different chop times.
 * @param {[number, number, number]} base
 * @param {[number, number]} slope
 */
export function composeCoastNormal(base, slope, weight) {
  const len0 = Math.hypot(base[0], base[1], base[2]) || 1;
  const bx = base[0] / len0;
  const by = base[1] / len0;
  const bz = base[2] / len0;
  const w = Math.max(0, Number(weight) || 0);
  if (w <= 0) return [bx, by, bz];
  const retain = 1 - w * (1 - WATER_SLOPE.longKeep);
  const x = bx * retain + slope[0] * w;
  const z = bz * retain + slope[1] * w;
  const len = Math.hypot(x, by, z) || 1;
  return [x / len, by / len, z / len];
}

export function w22DistanceGate(distance) {
  const x = Math.max(0, Math.min(1, (distance - 120) / 300));
  return x * x * (3 - 2 * x);
}

/**
 * Wave 75 phase 2b lane 1 (COAST_SPINE on): the depth the clear-shallows law reads as already under the sheet at the front's zero, so that the sheet's
 * alpha is 0.5 there (the metres of water at which `scA` = 0.5: its two smoothsteps, mix(0, a01, ss(0, .1, x)) then mix(., a04, ss(.1, .4, x)), solved by bisection).
 */
function spineEdgeShiftM(target) {
  const ss = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
  const scA = (x) => { let a = SHALLOW_CLEAR.a01 * ss(0, 0.1, x); a += (SHALLOW_CLEAR.a04 - a) * ss(0.1, 0.4, x); return a; };
  // the sheet's alpha at depth x with the shelf gate at 1: the clear-shallows cover and wave fifteen's cover (1 - exp(-x / shelfCoverM)) share it by SHALLOW_CLEAR.gain (the probe
  // read 0.685 at the depth where the clear-shallows cover alone is 0.505, which this law gives)
  const law = (x) => (1 - SHALLOW_CLEAR.gain) * (1 - Math.exp(-x / SURF_ROWS.shelfCoverM)) + SHALLOW_CLEAR.gain * scA(x);
  let lo = 0.0; let hi = 0.4;
  for (let i = 0; i < 40; i += 1) { const m = 0.5 * (lo + hi); if (law(m) < target) lo = m; else hi = m; }
  return 0.5 * (lo + hi);
}
/**
 * Wave 77 (fix 3): the sheet's edge is set by d, not by the bed. Within `from` to `to` m of the front's zero the cover law reads a depth of `slope` m per metre of
 * front (the bed's slope at d = 0: 0.034) in place of the bed's, so every row meets the same alpha at the zero whatever the sand's relief there (the render probe's
 * rows differed by up to 0.13 m of depth, which with a cover that climbs 0.07 per metre seaward put the 0.5 crossing 1.4 m seaward on some rows). The cover at the
 * zero is `alpha0`, over 0.5, so the ramp that caps the alpha (0.5 at the zero) sets the crossing.
 */
/** `centreM`: the ramp's centre moves this far seaward (the render probe, read on a 0.08 m pixel, put the 0.5 crossing 0.04 to 0.065 m landward of d's zero with the ramp centred on it, and 0.03 to 0.04 m seaward of it at 0.05). */
export const SPINE_EDGE = Object.freeze({ slope: 0.034, from: 1, to: 4, alpha0: 0.56, centreM: 0.03 });
export const SPINE_EDGE_SHIFT_M = spineEdgeShiftM(SPINE_EDGE.alpha0);

/**
 * `opts.spine` (default off): the sea's edge from the coast spine's front. With it off the text is exactly today's; with it on, inside the beach
 * (the baked beach weight `spW`) the fragment reads the front per fragment (`frontF`, `ddSpineWaterFront`), the shelf gate and class are 1 and 0
 * there, the cover law reads `SPINE_EDGE_SHIFT_M` more water at the front's zero (fading out by `SPINE_WATER.blendM`), and the alpha falls to 0 over
 * `SPINE_WATER.edgeM` landward of it, so the sheet's alpha 0.5 sits on d's zero.
 */
export function aquaFragment(hullContact, hullSit, bayN = 3, opts = {}) {
  const SP = Boolean(opts.spine); // { glsl, edgeM, blendM } from coast-spine.js (not imported here: coast-spine -> sand -> aqua would be a cycle)
  const SPINE_WATER = opts.spine ?? {};
  const FR = SP ? 'frontF' : 'vFront'; // the front the sheet's terms read: the vertex varying, or (spine) the per-fragment one
  // Reuse the contact loop: every stationary or moving hull retains its rim.
  const contactHullSit = hullSit
    .replace('smoothstep(0.25,2.7,gap)', 'smoothstep(0.18,0.65,gap)');
  return /* glsl */ `
    precision highp float;
    #define DD_AQUA_SOFT
    #include <common>
    #include <packing>
    uniform bool receiveShadow;
    #include <shadowmap_pars_fragment>
    #include <shadowmask_pars_fragment>
    #define ENVMAP_TYPE_CUBE_UV
    uniform sampler2D uAquaPmrem;
    uniform bool uAquaHasPmrem;
    uniform vec3 uAquaCube;
    uniform vec3 uAquaWeather; // cloud cover, diffuse gain, direct sun gain
    uniform vec3 uWaterFog;    // fog token colour (linear)
    uniform vec4 uDbg;         // review multipliers: sparkle, sun shadow, mirror, chop
    #define CUBEUV_TEXEL_WIDTH uAquaCube.x
    #define CUBEUV_TEXEL_HEIGHT uAquaCube.y
    #define CUBEUV_MAX_MIP uAquaCube.z
    #include <cube_uv_reflection_fragment>
    ${WATER_VARYINGS_GLSL}
    varying float vWaterness;
    varying float vHullWakeFoam;
    varying float vCalm;
    uniform sampler2D uBedDepth;
    uniform vec2 uDepthOrigin;
    uniform float uDepthSpan;
    uniform float uTime;
    uniform sampler2D uW19Normal;
    uniform sampler2D uW19Foam;
    uniform float uW19Ready;
    uniform float uW22FoamDebug;
    // Existing harbour reflector. Sampled here; this shader does not allocate it.
    uniform sampler2D uReflMap;
    uniform mat4 uReflMatrix;
    uniform vec2 uReflTexel;
    uniform float uPlanarOn;
    uniform float uPlanarAmt;
    ${SHORE_COMMON_GLSL}
${SP ? `    ${SPINE_WATER.glsl}
` : ''}    ${SURFACE_GLSL}
    ${hullContact}
    ${contactHullSit}
    uniform vec2 uBayDir[${bayN}];
    uniform float uBayLen[${bayN}];
    uniform float uBayAmp[${bayN}];
    uniform float uBaySteep[${bayN}];
    uniform float uBayOmega[${bayN}];
    uniform float uWaveScale;
    uniform vec4 uSeaTune; // review knobs: glint density, glint gain, swell shade
    uniform float uWhitecapGain; // review knob: 1 in the game, 0 to measure the structure bands without flecks
    varying vec2 vShoreN;
    varying float vWaveFront; // the wave field's own shore distance: the packed front clamps at 224 m, this continues it
    ${seaEnvelopeGlsl()}
    ${surfLutGlsl()}
    uniform sampler2D uCoastField;
    uniform float uCoastGain; // 1 at high and medium, 0 at low: no shoaling table, the old front path
    uniform float uShadeGain; // taste-r1 (W17-A): the shade-only swell components (WATER_LAW.waves.ocean.shadeTrains.gain at high and medium, 0 at low)
    uniform float uLineScale; // breaker line width: 1 at high, 2 at medium
    ${seaFragmentGlsl(bayN)}
    float ddAltitude() { return smoothstep(120.0, 420.0, length(cameraPosition - vWorld)); }
${FAR_SHORE > 0 ? `    // taste-r1 (W42): FAR_SHORE. The coast field's S at p with the bed's near-shore minimum, the same two lines that make coastS in main.
    float ddFarS(vec2 p) {
      vec2 fuv = (p - uDepthOrigin) / uDepthSpan;
      vec4 fc = texture2D(uCoastField, fuv);
      float fs = 224.0 * fc.r * fc.r;
      return mix(fs, min(fs, max(texture2D(uBedDepth, fuv).r, 0.0) / 0.066), 1.0 - smoothstep(4.0, 6.0, fs));
    }
` : ''}    ${waterSlopeGlsl()}
    // taste-r1 (W15-A2): the breaker channel of the foam pack as a lace for the surf rows. Two lookups at ${SURF_ROWS.laceTileM.toFixed(1)} m and
    // ${(SURF_ROWS.laceTileM * 1.53).toFixed(1)} m per tile, blended by a slow noise so no tile repeat shows along a row; the fetch is a textureLod so
    // the lace blurs with distance instead of aliasing. Returns 0..1 (the pack's own soft edge).
    vec2 ddRowLace(vec2 p, float foot) {
      float lod = max(0.0, log2(max(foot * 512.0 / ${SURF_ROWS.laceTileM.toFixed(1)}, 1.0)));
      vec2 uvA = p / ${SURF_ROWS.laceTileM.toFixed(1)};
      vec2 uvB = p / ${(SURF_ROWS.laceTileM * 1.53).toFixed(2)} + vec2(0.27, 0.61);
      float k = smoothstep(0.42, 0.58, ddValueNoise(p / 21.0 + vec2(7.3, 2.9)));
      // taste-r1 (W15 fix): the strand is read blurred over ${SURF_ROWS.laceBlurLod.toFixed(1)} mips (about one pixel more than the footprint), so its edge is soft at every camera and the alpha is the
      // pack's own value, never cut to a mask; a second read three mips blurrier feeds the thin film between the strands.
      float soft = mix(textureLod(uFleckPack, uvA, lod + ${SURF_ROWS.laceBlurLod.toFixed(1)}).r, textureLod(uFleckPack, uvB, lod + ${SURF_ROWS.laceBlurLod.toFixed(1)}).r, k);
      float film = mix(textureLod(uFleckPack, uvA, lod + ${(SURF_ROWS.laceBlurLod + 2.0).toFixed(1)}).r, textureLod(uFleckPack, uvB, lod + ${(SURF_ROWS.laceBlurLod + 2.0).toFixed(1)}).r, k);
      return vec2(soft, film);
    }
    // P23: low-amplitude 120 / 48 m luminance variation; no hue noise.
    float ddPaintMacro(vec2 p, float windAcross) {
      float broad = ddValueNoise(p / 120.0);
      float middle = ddValueNoise(p / 48.0 + 17.3);
      float patches = 0.008 * (2.0 * broad - 1.0)
        + 0.004 * (2.0 * middle - 1.0);
      return clamp(patches,
        -${W22_R4_MACRO_BOUND}, ${W22_R4_MACRO_BOUND});
    }
    void main() {
      float waterFoot = max(length(dFdx(vFlatWorld.xz)), length(dFdy(vFlatWorld.xz)));
      if (vWaterness < 0.01) discard;
${SP ? `      float spW;
      float frontF = ddSpineWaterFront(vFlatWorld.xz, vFront, spW); // wave 75 (2b-1): the front per fragment inside the beach
` : ''}      DDSurfaceIn si;
      si.world = vWorld;
      si.flatWorld = vFlatWorld;
      // Analytic Gerstner normals are continuous across the surface. Keep
      // the texture coordinates solely for contact foam, never body colour.
      vec2 uv = vFlatWorld.xz * 0.055;
      vec2 drift = vec2(uTime * 0.008, -uTime * 0.011);
      mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
      si.viewDir = cameraPosition - vWorld;
      si.front = ${FR};
      // Full-precision bed metres, sampled per fragment; wave depth stays capped.
      si.depth = texture2D(uBedDepth, (vFlatWorld.xz - uDepthOrigin) / uDepthSpan).r;
      si.height = vHeight;
      si.crest = vCrest;
      si.steep = vSteep;
      si.fold = vFold;
      si.shoal = vShoal;
      si.t = uTime;
      // SHAPE (water law): the three-train swell, re-derived analytically per pixel so the
      // 19-31 m shading is not aliased by a 2-6 m mesh. The diffuse, Fresnel and sky mirror
      // read this normal and nothing finer, so no chop, caustic or detail net can reach the
      // body colour (gate ruling 1). The chop below feeds the specular normal only.
      vec2 seaDir = normalize(vShoreN + vec2(1e-5));
      vec2 seaAlong = vec2(seaDir.y, -seaDir.x);
      // W14-A: the true shore distance S from the coast field (and, inside 6 m, the bed depth over the 1 in 15 shelf).
      vec4 coastTex = texture2D(uCoastField, (vFlatWorld.xz - uDepthOrigin) / uDepthSpan);
${TEETH_ON ? (() => {
  const T = FAR_SHORE_TUNE;
  const U = SHORE_TEETH_TUNE;
  return `      // taste-r1 (W43): SHORE_TEETH. The sum of ${FAR_SHORE_TAPS.length + 1} ddFarS taps (the lip below reads it too). Under the far-ring mask and within ${U.fallM[1]} m of the shore the bed depth is read from the low-passed shore distance, not from the bed texture's staircase.
      float stSum = 0.0;
      float stK = 0.0;
      {
        float stRing = smoothstep(${T.fromM.toFixed(1)}, ${T.toM.toFixed(1)}, length(vFlatWorld.xz - (uDepthOrigin + vec2(0.5 * uDepthSpan)))) * smoothstep(0.35, 0.5, coastTex.b);
        float stNear = 224.0 * coastTex.r * coastTex.r;
        if (${SP ? 'uCoastGain > 0.5 && ' : ''}stRing * (1.0 - smoothstep(${U.quitM - 4}.0, ${U.quitM}.0, stNear)) > 0.001) {
          stSum = ddFarS(vFlatWorld.xz);
${FAR_SHORE_TAPS.map(([ox, oz]) => `          stSum += ddFarS(vFlatWorld.xz + vec2(${ox.toFixed(3)}, ${oz.toFixed(3)}));`).join('\n')}
          float stMeanS = max(stSum / ${(FAR_SHORE_TAPS.length + 1).toFixed(1)} - ${T.biasM.toFixed(2)}, 0.0);
          stK = stRing * (1.0 - smoothstep(${U.fallM[0].toFixed(1)}, ${U.fallM[1].toFixed(1)}, stMeanS));
          si.depth = mix(si.depth, ${U.slope.toFixed(3)} * stMeanS, stK);
        }
      }
`;
})() : ''}      float coastS = 224.0 * coastTex.r * coastTex.r;
      coastS = mix(coastS, min(coastS, max(si.depth, 0.0) / 0.066), 1.0 - smoothstep(4.0, 6.0, coastS));
      float swellLiveOld = smoothstep(0.80, 11.0, ${FR})
        * smoothstep(0.12, 2.15, si.depth) * min(1.0, max(si.depth, 0.0) / 5.4);
      // taste-r1 (W16-A): where the coast field's front goes negative around the pier tip but the drawn bed is still under water (a pocket 2 to 4 m wide), the shade stopped on a ruled edge: the water is on wherever the bed holds water, with the front as the metre measure.
      float frontEff = max(${FR}, min(max(si.depth, 0.0) / 0.066, 6.0));
      float swellLive = mix(swellLiveOld, smoothstep(0.0, 1.5, coastS), uCoastGain)
        * (1.0 - vCalm) * smoothstep(0.0, 0.25, frontEff);
      // The envelope is evaluated once per pixel and shared by the swell slope, the glint and the flecks.
      float envN = ddSurfEnvelope(vAlong, vWaveFront, uTime);
      vec3 trPh;
      vec3 trEn;
      ddSurfTrains(vAlong, vWaveFront, uTime, trPh, trEn);
      vec2 swellG = ddSeaSwellGrad(vAlong, vWaveFront, uTime, swellLive, si.depth, envN, coastS, uCoastGain);
      vec2 swellW = seaAlong * swellG.x + seaDir * swellG.y;
      // taste-r1 (W17-A): the shade-only components (slope that feeds bandSlope below and nothing else: not the normal, the sky mirror or the sparkle).
      // They fade in between ${SHADE_TRAINS.fadeFrom.toFixed(0)} and ${SHADE_TRAINS.fadeTo.toFixed(0)} m of the true shore distance (they do not refract), follow the rain gain of the trains, and are skipped when off.
      vec2 swellShade = swellW;
${SWELL_WANDER > 0 ? `      // taste-r1 (W26-A): SWELL_WANDER. The shade weighs the trains (carrier first); the height and the normal above keep all three.
${SWELL_FAR_MIX > 0 ? `      // taste-r1 (W27): SWELL_FAR_MIX (water/surf.js): the far half of the open sea (from ${SWELL_FAR_MIX_TUNE.fromM} to ${SWELL_FAR_MIX_TUNE.toM} m of camera distance) changes the shade only.
      float swFarK = smoothstep(${SWELL_FAR_MIX_TUNE.fromM.toFixed(1)}, ${SWELL_FAR_MIX_TUNE.toM.toFixed(1)}, length(cameraPosition - vWorld));
${SWELL_FAR_TUNE > 0 ? `      // taste-r1 (W28): SWELL_FAR_TUNE (water/surf.js): past ${SWELL_FAR_TUNE_P.fromM} m the ribs that are left take more phase noise and a lower lull floor (shade only).
      float swFarK2 = smoothstep(${SWELL_FAR_TUNE_P.fromM.toFixed(1)}, ${SWELL_FAR_TUNE_P.toM.toFixed(1)}, length(cameraPosition - vWorld));
      vec2 swellShadeG = ddSeaSwellShade(vAlong, vWaveFront, uTime, swellLive, si.depth, envN, coastS, uCoastGain, trPh, trEn, swFarK, swFarK2);
` : `      vec2 swellShadeG = ddSeaSwellShade(vAlong, vWaveFront, uTime, swellLive, si.depth, envN, coastS, uCoastGain, trPh, trEn, swFarK);
`}` : `      vec2 swellShadeG = ddSeaSwellShade(vAlong, vWaveFront, uTime, swellLive, si.depth, envN, coastS, uCoastGain, trPh, trEn);
`}      swellShade = seaAlong * swellShadeG.x + seaDir * swellShadeG.y;
` : ''}      float shadeOn = step(0.001, uShadeGain) * smoothstep(${SHADE_TRAINS.fadeFrom.toFixed(1)}, ${SHADE_TRAINS.fadeTo.toFixed(1)}, coastS);
      if (shadeOn > 0.0) {
        // Where the components are on, the three geometric trains keep ${SHADE_TRAINS.trainShare.toFixed(2)} of their own slope in the shade (they stay the carriers of the sets, the added components spread the spectrum).
        vec2 sg = ddSeaShadeGrad(vAlong, vWaveFront, uTime);
        swellShade = swellW * mix(1.0, ${SHADE_TRAINS.trainShare.toFixed(2)}, shadeOn) + (seaAlong * sg.x + seaDir * sg.y) * (uShadeGain * shadeOn);
      }
      vec3 baseN = normalize(vec3(-swellW.x, 1.0, -swellW.y));
      si.normal = baseN;
      vec3 specN = baseN;
      float sigma2 = 0.0;
      if (uWaveScale > 0.0) {
        float chopDamp = smoothstep(0.55, 3.0, max(${FR}, 0.0))
          * smoothstep(0.10, 0.85, max(si.depth, 0.0))
          * mix(1.0, 0.8, vCalm);
        float live = smoothstep(0.0, ${COAST_CHOP.scaleOpen.toFixed(2)}, max(uWaveScale, 0.0));
        float tier = smoothstep(${COAST_CHOP.tierFrom.toFixed(2)}, ${COAST_CHOP.tierTo.toFixed(2)}, uWaveScale);
        // Water law test: no feature under 2 m from a 240 m camera. The 3 m chop
        // beats into a fine lattice at that range, so it is gone by 240 m and the
        // 24 m swell and the roughness term carry the far sea.
        float chopFar = 1.0 - smoothstep(110.0, 240.0, length(cameraPosition - vWorld));
        float chopWeight = chopDamp * live * (${COAST_CHOP.tierFloor.toFixed(2)} + ${(1 - COAST_CHOP.tierFloor).toFixed(2)} * tier) * uDbg.w * chopFar;
        // Sheltered water runs the same two chop components at half their slope (water law presets).
        ddChopSea = seaDir;
        vec3 field = ddWaterSlopeCalm(vFlatWorld.xz, uTime, waterFoot, vCalm);
        specN = normalize(vec3(baseN.x + field.x * chopWeight, baseN.y, baseN.z + field.y * chopWeight));
        sigma2 = field.z * chopWeight * chopWeight;
      }
${COVE_JOIN > 0 ? `      // taste-r1 (W25-A): COVE_JOIN. The cove's bed is a broad 1 to 3 m shelf, so the depth ramp (teal) and the tint (scKt) made a pool that ended on the bed's own edge, a ruled diagonal at station 08. Inside the cove (the soft box of scCoveT) the depth the ramp and the tint read is deepened toward
      // ${COVE_JOIN_TUNE.openM.toFixed(1)} m with the shore distance cvS (the coast field's S, torn ${COVE_JOIN_TUNE.tearM} m either way by a ${COVE_JOIN_TUNE.tearScaleM} m noise): none at ${COVE_JOIN_TUNE.deepFromM} m, all at ${COVE_JOIN_TUNE.deepToM} m. The ramp reads it here; si.depth is put back after, so the swell, the shelf terms and the foam keep the real bed.
      float cvS = coastS + (ddValueNoise(vFlatWorld.xz / ${COVE_JOIN_TUNE.tearScaleM.toFixed(2)} + vec2(4.6, 2.2)) * 0.6 + ddValueNoise(vFlatWorld.xz / ${(COVE_JOIN_TUNE.tearScaleM * 0.36).toFixed(2)} + vec2(1.7, 9.4)) * 0.4 - 0.5) * ${(2 * COVE_JOIN_TUNE.tearM).toFixed(2)};
      float cvK = smoothstep(283.0, 333.0, vFlatWorld.x) * smoothstep(154.0, 214.0, vFlatWorld.z) * (1.0 - smoothstep(340.0, 420.0, vFlatWorld.z)) * smoothstep(${COVE_JOIN_TUNE.deepFromM.toFixed(2)}, ${COVE_JOIN_TUNE.deepToM.toFixed(2)}, cvS);
      float cvDepthReal = si.depth;
      si.depth = mix(si.depth, max(si.depth, ${COVE_JOIN_TUNE.openM.toFixed(2)}), cvK);
` : ''}      vec4 water = ddSurface(si);
${COVE_JOIN > 0 ? `      si.depth = cvDepthReal;
` : ''}      // taste-r1 (W15-A2): on the beach shelf (coast class 0) the water covers the sand faster than the shared law's 0.30 m: the first
      // 10 m (0.7 m of water on the 1 in 15 shelf) read as a milky grey-beige film in both skies (S 3 to 10) with the sand and the sky
      // mirror showing through it, where the ramp's own colour (#6FB6B4, S 39) is wanted. cover = 1 - exp(-depth / 0.12): 92% at 0.3 m,
      // and still clear at the swash where the depth is under 0.05 m, so the lip keeps its wet sand.
${SP ? `      // wave 75 (2b-1): inside the beach label the class is the beach's (0) and the front term is 1 (the sheet's own edge, below, ends it at d's zero); outside it, today's.
      float shelfK = (1.0 - smoothstep(0.15, 0.35, mix(coastTex.b, 0.0, spW))) * (1.0 - smoothstep(0.02, 0.15, vCalm)) * mix(smoothstep(${(-SHELF_FRONT_SOFT_M / 2).toFixed(2)}, ${(SHELF_FRONT_SOFT_M / 2).toFixed(2)}, frontF), 1.0, spW);` : `      float shelfK = (1.0 - smoothstep(0.15, 0.35, coastTex.b)) * (1.0 - smoothstep(0.02, 0.15, vCalm)) * ${SHELF_FRONT_SOFT_M > 0 ? `smoothstep(${(-SHELF_FRONT_SOFT_M / 2).toFixed(2)}, ${(SHELF_FRONT_SOFT_M / 2).toFixed(2)}, vFront)` : 'step(0.0, vFront)'};`} // taste-r1 (W24-A): the shelf term entered on a ruled line (hard step at the front's zero, seen as a straight dark slab at the Apostles, stations 08 and 09); it now ramps over SHELF_FRONT_SOFT_M
${SP ? `      float spShift = ${SPINE_EDGE_SHIFT_M.toFixed(4)} * (1.0 - smoothstep(0.0, ${SPINE_WATER.blendM.toFixed(1)}, frontF)) * spW; // wave 75 (2b-1): the cover law's depth at the front's zero (alpha 0.5 there), none from ${SPINE_WATER.blendM} m seaward
      float shelfDepth = mix(max(si.depth + si.height * 0.85, 0.0), ${SPINE_EDGE.slope.toFixed(3)} * max(frontF, 0.0), spW * (1.0 - smoothstep(${SPINE_EDGE.from.toFixed(1)}, ${SPINE_EDGE.to.toFixed(1)}, frontF))) + spShift; // wave 77 (fix 3): within ${SPINE_EDGE.to} m of the zero the depth is the front's (SPINE_EDGE.slope), not the bed's` : `      float shelfDepth = max(si.depth + si.height * 0.85, 0.0);`}
      // The lift fades out between 0.7 and 1.4 m of water: deeper, the shared law's opacity (0.94 over 2 m) stands, so the class edge of the field never draws a seam.
      // taste-r1 (W20-A): the Apostles cove keeps wave fifteen's cover and its look (no shelf under it): none of the clear-shallows terms below apply inside its box.
      float scCove = smoothstep(283.0, 333.0, vFlatWorld.x) * smoothstep(154.0, 214.0, vFlatWorld.z) * (1.0 - smoothstep(272.0, 332.0, vFlatWorld.z)); // the box of the rows (x from 313, z 194 to 292) with 40 to 60 m soft edges
      float wave15A = mix(water.a, max(water.a, 1.0 - exp(-shelfDepth / ${SURF_ROWS.shelfCoverM.toFixed(2)})), shelfK * (1.0 - smoothstep(0.7, 1.4, shelfDepth)));
      // taste-r1 (W20-A): clear shallows (SHALLOW_CLEAR). The sand shows through the first metre: cover ${SHALLOW_CLEAR.a01.toFixed(2)} at 0.1 m of water, ${SHALLOW_CLEAR.a04.toFixed(2)} at 0.4 m, ${SHALLOW_CLEAR.a10.toFixed(2)} at 1.0 m, the shared law by ${SHALLOW_CLEAR.joinM.toFixed(1)} m.
      // The depth that sets the cover is torn by a 2 m noise (a quarter of its value either way, nothing at zero depth) so the waterline of the sheet is a ragged fade and not a ruled step.
      float scNoise = ddValueNoise(vFlatWorld.xz / ${SHALLOW_CLEAR.tearScaleM.toFixed(2)} + vec2(7.3, 3.1)) * 0.65 + ddValueNoise(vFlatWorld.xz / ${(SHALLOW_CLEAR.tearScaleM * 0.37).toFixed(2)} + vec2(1.7, 9.4)) * 0.35;
      float scD = ${SP ? '(shelfDepth - spShift)' : 'shelfDepth'} * (1.0 + ${SHALLOW_CLEAR.tear.toFixed(2)} * (2.0 * scNoise - 1.0))${SP ? ' + spShift' : ''};
      float scA = mix(0.0, ${SHALLOW_CLEAR.a01.toFixed(2)}, smoothstep(0.0, 0.1, scD));
      scA = mix(scA, ${SHALLOW_CLEAR.a04.toFixed(2)}, smoothstep(0.1, 0.4, scD));
      scA = mix(scA, ${SHALLOW_CLEAR.a10.toFixed(2)}, smoothstep(0.4, 1.0, scD));
      scA = mix(scA, water.a, smoothstep(1.0, ${SHALLOW_CLEAR.joinM.toFixed(2)}, scD));
      float scK = shelfK * (1.0 - scCove) * ${SHALLOW_CLEAR.gain.toFixed(2)};
      float scCoveT = smoothstep(283.0, 333.0, vFlatWorld.x) * smoothstep(154.0, 214.0, vFlatWorld.z) * (1.0 - smoothstep(340.0, 420.0, vFlatWorld.z)); // taste-r1 (W22-C): the tone mask reaches the cove's own beach to the south, edges 50 to 80 m
${COVE_JOIN > 0 ? `      // taste-r1 (W25-A): the tint reads the same deepened depth (cvK above) and fades out from ${COVE_JOIN_TUNE.fadeFromM} to ${COVE_JOIN_TUNE.fadeToM} m of the torn shore distance, in the cove only (the real shelf keeps its own depth).
      float cvFade = 1.0 - smoothstep(${COVE_JOIN_TUNE.fadeFromM.toFixed(2)}, ${COVE_JOIN_TUNE.fadeToM.toFixed(2)}, cvS);
      float scDt = mix(scD, max(scD, ${COVE_JOIN_TUNE.openM.toFixed(2)}), cvK);
` : ''}      float scKt = mix(shelfK, 1.0, scCoveT * ${SHALLOW_TONE.cove.toFixed(2)}${COVE_JOIN > 0 ? ' * cvFade' : ''}) * ${SHALLOW_CLEAR.gain.toFixed(2)}; // taste-r1 (W22-C): the mask of the tone terms; the cover law keeps scK
      float shelfCover = mix(1.0, scA, scK);
${SP ? `      // wave 77 (fix 1): the switch-off law (the old class and front, no shift) beside the spine's, so that where the spine says land (d < 0, inside the beach weight) the sheet is never above today's.
      float shelfKOff = (1.0 - smoothstep(0.15, 0.35, coastTex.b)) * (1.0 - smoothstep(0.02, 0.15, vCalm)) * ${SHELF_FRONT_SOFT_M > 0 ? `smoothstep(${(-SHELF_FRONT_SOFT_M / 2).toFixed(2)}, ${(SHELF_FRONT_SOFT_M / 2).toFixed(2)}, vFront)` : 'step(0.0, vFront)'};
      float shelfDepthOff = max(si.depth + si.height * 0.85, 0.0);
      float wave15AOff = mix(water.a, max(water.a, 1.0 - exp(-shelfDepthOff / ${SURF_ROWS.shelfCoverM.toFixed(2)})), shelfKOff * (1.0 - smoothstep(0.7, 1.4, shelfDepthOff)));
      float scDOff = shelfDepthOff * (1.0 + ${SHALLOW_CLEAR.tear.toFixed(2)} * (2.0 * scNoise - 1.0));
      float scAOff = mix(0.0, ${SHALLOW_CLEAR.a01.toFixed(2)}, smoothstep(0.0, 0.1, scDOff));
      scAOff = mix(scAOff, ${SHALLOW_CLEAR.a04.toFixed(2)}, smoothstep(0.1, 0.4, scDOff));
      scAOff = mix(scAOff, ${SHALLOW_CLEAR.a10.toFixed(2)}, smoothstep(0.4, 1.0, scDOff));
      scAOff = mix(scAOff, water.a, smoothstep(1.0, ${SHALLOW_CLEAR.joinM.toFixed(2)}, scDOff));
      float lawOff = mix(wave15AOff, mix(water.a, scAOff, shelfKOff), ${SHALLOW_CLEAR.gain.toFixed(2)} * (1.0 - scCove));
` : ''}      water.a = mix(wave15A, mix(water.a, scA, shelfK), ${SHALLOW_CLEAR.gain.toFixed(2)} * (1.0 - scCove));
${SP ? `      water.a = mix(water.a, min(water.a, lawOff), step(0.0001, spW) * (1.0 - smoothstep(${(-SPINE_WATER.edgeM).toFixed(2)}, 0.0, gSpineRaw)));
` : ''}      // The body keeps its chroma where the sheet is thin: the ramp's own shallow colour is pushed out as the cover falls, so the tint that is left over the sand reads aqua and not grey-beige.
      vec3 scAqua = vec3(${SHALLOW_CLEAR.aqua.map((v, i) => ST(v, SHALLOW_TONE.aqua[i])).join(', ')});
      float stRain = 1.0 - ${(SHALLOW_TONE.rain * SHALLOW_TONE.gain).toFixed(3)} * uSea.x;
      scAqua = mix(scAqua, vec3(ddLum(scAqua)), 1.0 - stRain); // taste-r1 (W21-B): in rain the shallows grey with the sea beside them
      water.rgb = mix(water.rgb, scAqua * uWaterGain, ${SHALLOW_CLEAR.tint.toFixed(2)} * scKt * pow(1.0 - smoothstep(${ST(0.30, SHALLOW_TONE.featherFrom)}, ${ST(0.95, SHALLOW_TONE.featherTo)}, ${CVD}), ${ST(1.0, SHALLOW_TONE.hold)}) * (1.0 - ${(SHALLOW_CLEAR.tintCover * (1 - SHALLOW_TONE.gain)).toFixed(2)} * scA));
      water.rgb = max(mix(vec3(ddLum(water.rgb)), water.rgb, 1.0 + ${ST(SHALLOW_CLEAR.chroma, SHALLOW_TONE.chroma)} * stRain * (1.0 - shelfCover)), vec3(0.0));
      // taste-r1 (W22-C): in rain the shelf body takes the deep water's hue (the ramp's own cyan dominated it) at its own, lighter value: the chroma direction of the deep ramp stop, scaled by ${SHALLOW_TONE.rainHueChroma.toFixed(2)}, on the body's luminance.
      if (${SHALLOW_TONE.rainHue.toFixed(2)} > 0.0) {
        vec3 deepC = DD_RAMP3 - vec3(ddLum(DD_RAMP3));
        deepC /= max(max(abs(deepC.r), max(abs(deepC.g), abs(deepC.b))), 1e-5);
        float rhLum = ddLum(water.rgb);
        vec3 rhBody = max(vec3(rhLum) * (vec3(1.0) + ${SHALLOW_TONE.rainHueChroma.toFixed(2)} * deepC), vec3(0.0));
        float rhK = ${SHALLOW_TONE.rainHue.toFixed(2)} * uSea.x * scKt * (1.0 - smoothstep(0.6, ${SHALLOW_TONE.rainHueTo.toFixed(2)}, ${CVD}));
        water.rgb = mix(water.rgb, rhBody, rhK);
      }
${RIM_TINT > 0 ? (() => {
  const T = RIM_TINT_TUNE;
  const f = (v) => v.toFixed(3);
  const v3 = (a) => `vec3(${a.map(f).join(', ')})`;
  const sand = new THREE.Color(TASTE.ground.sandDry);
  return `      // taste-r1 (W40): RIM_TINT. Pocket Reserve's pale shallows without a bed mesh: the sheet is near opaque and coloured by depth. The shore distance rtS (the coast field's S, not the swell's shaped coastS) gives a shelf depth
      // of ${T.depthM.toFixed(1)} m over ${T.shelfM} m; the sand bed (the rim sand token) is seen through it by a per-channel Beer-Lambert tint, bed * trans + insc * (1 - trans), with the sheet's own body colour as the in-scatter, so the shelf hands back to the sea at ${T.fadeFromM} to ${T.fadeToM} m.
      // The cover is floored at ${T.cover.toFixed(2)} past a ${T.marginM.toFixed(1)} m torn margin at the waterline, so the sand meets the water softly. The mask is the coast field's board weight (alpha) turned over: none within 150 m of the board.
      float rtS = 224.0 * coastTex.r * coastTex.r;
      float rtMask = (1.0 - coastTex.a) * (1.0 - smoothstep(${f(T.fadeFromM)}, ${f(T.fadeToM)}, rtS));
      float rtDN = smoothstep(0.0, ${f(T.shelfM)}, rtS);
      float rtDepth = ${f(T.floorM)} + ${f(T.depthM)} * rtDN;
      vec3 rtTrans = exp(-mix(${v3(T.k0)}, ${v3(T.k1)}, rtDN) * rtDepth);
      vec3 rtBed = vec3(${f(sand.r * T.sandGain)}, ${f(sand.g * T.sandGain)}, ${f(sand.b * T.sandGain)}) * uWaterGain * mix(1.0, 0.8, rtDN);
      vec3 rtBody = rtBed * rtTrans + water.rgb * (1.0 - rtTrans);
      water.rgb = mix(water.rgb, rtBody, rtMask);
      float rtMargin = smoothstep(0.0, ${f(T.marginM)}, max(rtS + (scNoise - 0.5) * ${f(T.marginM * T.tear * 2)}, 0.0));
      water.a = mix(water.a, max(water.a, ${f(T.cover)} * rtMargin), rtMask);
`;
})() : ''}      // Weather answers through the water law: rain dims the body and removes
      // at most a tenth of its chroma. It never turns the sea one grey, and the
      // depth ramp keeps its hue ordering (TASTE-BIBLE sections 3 and 6).
      if (uAquaWeather.x > 0.0) water.rgb = ddWaterWeather(water.rgb, uAquaWeather.x);
      float macro = ddPaintMacro(vFlatWorld.xz, dot(vec2(-uBayDir[0].y, uBayDir[0].x), vFlatWorld.xz));
      // taste-r1 (W16-A): the shelter gate fades the swell shade and the mottle over vCalm 0.02 to 0.80 (was 0.02 to 0.15, which cut the shade on a ruled diagonal at the port corner, station 10: the ramp is 44 m wide but only its first 13% was used).
      float openWater = smoothstep(2.0, 6.0, si.depth) * (1.0 - smoothstep(0.02, 0.80, vCalm));
      // The old single-train sine multiplier drew the corrugated-iron stripes and is gone.
      // The swell now shades the body only through its own three-train, envelope-grouped
      // slope: faces tilted toward the sun run lighter, faces tilted away run darker.
      vec2 sunAz = normalize(uSunDir.xz + vec2(1e-5));
      float slopeSun = dot(-swellW, sunAz);
      // taste-r1 (W14-A): the shade line no longer waits for the bed to pass 2 m (openWater is 0 exactly where the
      // swell shoals); it runs from the first 1.5 m of the shore out, and not inside the harbour.
      float shadeWater = smoothstep(0.0, 0.25, frontEff) * smoothstep(0.0, 1.5, max(frontEff, 0.0)) * (1.0 - smoothstep(0.02, 0.80, vCalm));
      // taste-r1 (W15-A1): the swell reads as bands because the shade IS the lit normal of the three-train swell: a sun term (faces
      // tilted toward the sun run lighter) and a sky term (faces tilted toward the camera mirror the paler low sky), both from
      // swellW, which already carries the group envelope. Nothing is painted on the sheet.
      vec2 viewAz = normalize(cameraPosition.xz - vFlatWorld.xz + vec2(1e-5));
      float slopeView = dot(-swellShade, viewAz);
      // A lull of the group envelope would leave a flat 8 m tile; the shade is lifted back toward full strength by SEA_LULL_LIFT of the lull (taste-r1 W16-A: 55%, was 70%).
      float groupK = max(envN * dot(trEn, ${SWELL_WANDER > 0 ? `vec3(${SWELL_WANDER_TUNE.groupK.map((v) => v.toFixed(2)).join(', ')})` : 'vec3(0.5, 0.33, 0.17)'}), 0.2);
      float bandSlope = (0.62 * dot(-swellShade, sunAz) + 0.38 * slopeView) / mix(1.0, groupK, ${SEA_LULL_LIFT.toFixed(2)});
      // taste-r1 (W16-A): the shade is given back 30% between 280 and 420 m from the camera (station 10 read 2.0 against 2.5 in the 8-33 m band; the haze and the 0.24 m pixel take the contrast). Undo: delete this line.
${SWELL_WANDER > 0 ? `      bandSlope *= ${SWELL_WANDER_TUNE.shadeBoost.toFixed(2)};
` : ''}      bandSlope *= 1.0 + 0.30 * smoothstep(280.0, 420.0, length(cameraPosition - vWorld)) * (1.0 - ${SEA_FAR_SHADE.gain.toFixed(2)});
      // taste-r1 (W19-C): the far fall of the shade and the broad patches (SEA_FAR_SHADE; gain 0 restores the line above in full).
      float farD = smoothstep(${SEA_FAR_SHADE.near.toFixed(1)}, ${SEA_FAR_SHADE.far.toFixed(1)}, length(cameraPosition - vWorld)) * ${SEA_FAR_SHADE.gain.toFixed(2)};
      vec2 farQ = vFlatWorld.xz + vec2(31.0, -17.0) + uTime * vec2(0.9, 0.5);
      float farN = 0.62 * ddValueNoise(farQ / ${SEA_FAR_SHADE.patchM.toFixed(1)} + vec2(2.9, 8.1)) + 0.38 * ddValueNoise(farQ / ${(SEA_FAR_SHADE.patchM * 0.45).toFixed(1)} + vec2(14.3, 5.5));
      float farPatch = 1.0 - ${SEA_FAR_SHADE.patchDepth.toFixed(2)} * (1.0 - smoothstep(0.30, 0.62, farN));
      float farShade = mix(1.0, ${SEA_FAR_SHADE.keep.toFixed(2)} * farPatch, farD);
${SWELL_FAR_TUNE > 0 && SWELL_FAR_TUNE_P.keepMul !== 1 ? `      farShade *= mix(1.0, ${SWELL_FAR_TUNE_P.keepMul.toFixed(2)}, smoothstep(${SWELL_FAR_TUNE_P.fromM.toFixed(1)}, ${SWELL_FAR_TUNE_P.toM.toFixed(1)}, length(cameraPosition - vWorld)));
` : ''}      // taste-r1 (W15-A2): on the beach shelf the shoaling swell is steep and short, so the shade saturated into broad pale and dark
      // bands out to 30 m, the milky wash at station 10 (43 px, 10 m of pale water). The rows of foam carry the surf there; the shade comes back to full from 38 m.
      float shelfShade = mix(1.0, mix(${SURF_ROWS.shelfShadeMin.toFixed(2)}, 1.0, smoothstep(8.0, 38.0, coastS)), 1.0 - smoothstep(0.15, 0.35, coastTex.b));
      water.rgb *= 1.0 + shadeWater * uSeaTune.z * shelfShade * farShade * clamp(bandSlope * 22.0, -1.0, 1.0);
      // Break-up under the bands (W15-A1): a faint value-noise mottle, at most a third of the band contrast, stretched four to five
      // times along the carrier crest (in the shore frame) so it frays the bands instead of printing cells, and carried with them at
      // half the carrier speed. The old isotropic 5, 13 and 29 m octaves at 0.14 / 0.14 / 0.09 out-shouted the swell.
      vec2 mD = uBayDir[0];
      vec2 mAC = vec2(mD.x * vAlong + mD.y * vWaveFront + uTime * 3.0, -mD.y * vAlong + mD.x * vWaveFront);
      float mottleF = ddValueNoise(vec2(mAC.x / 7.0, mAC.y / 24.0) + vec2(5.0, 61.0));
      float mottleM = ddValueNoise(vec2(mAC.x / 15.0, mAC.y / 60.0) + vec2(41.0, 13.0));
      float mottleB = ddValueNoise(vec2(mAC.x / 30.0, mAC.y / 130.0) + vec2(17.0, 3.0));
      water.rgb *= 1.0 + openWater * (0.040 * (2.0 * mottleF - 1.0) + 0.045 * (2.0 * mottleM - 1.0) + 0.035 * (2.0 * mottleB - 1.0));
      vec3 V = normalize(si.viewDir);
      float fres = 0.020 + 0.980 * pow(1.0 - max(dot(si.normal, V), 0.0), 5.0);
      vec3 reflection = vec3(0.02, 0.06, 0.10);
      if (uAquaHasPmrem) {
        float pmremRough = min(${WATER_SLOPE.pmremCeil.toFixed(2)}, sqrt(${WATER_SLOPE.pmremBase.toFixed(2)} * ${WATER_SLOPE.pmremBase.toFixed(2)} + sigma2));
        vec3 sky = textureCubeUV(uAquaPmrem, reflect(-V, si.normal), pmremRough).rgb;
        // Shoulder only. The old (0.012, 0.06, 0.12) ceiling deleted the sky.
        float skyPeak = max(sky.r, max(sky.g, sky.b));
        reflection = sky * min(1.0, 0.72 / max(skyPeak, 1e-4));
        if (uAquaWeather.x > 0.0) {
          vec3 cloudReflection = vec3(ddLum(reflection)) * vec3(0.84, 1.0, 1.03);
          // taste gate: under the pale rain sky the mirror term washed the shallows to milk at the low Apostles
          // camera (station 09). An overcast sea reflects a darker, flatter sky than the dome's own value.
          reflection = mix(reflection, cloudReflection, uAquaWeather.x) * uAquaWeather.y * mix(1.0, 0.55, uAquaWeather.x);
        }
      }
      // Five taps of the existing harbour target. Ripple the UV so building
      // edges break; do not allocate another reflection pass.
      if (uPlanarOn > 0.5) {
        vec4 reflClip = uReflMatrix * vec4(vWorld, 1.0);
        if (reflClip.w > 1e-4) {
          vec2 nse = vec2(
            ddValueNoise(vFlatWorld.xz * 0.41 + vec2(uTime * 0.07, 2.0)),
            ddValueNoise(vFlatWorld.xz * 0.37 + vec2(5.0, -uTime * 0.05))
          ) - 0.5;
          vec2 reflUv = reflClip.xy / reflClip.w
            + si.normal.xz * uReflTexel * 4.0
            + nse * uReflTexel * 7.0;
          if (reflUv.x >= 0.0 && reflUv.x <= 1.0 && reflUv.y >= 0.0 && reflUv.y <= 1.0) {
            vec2 r = uReflTexel * ${COAST_CHOP.planarBlurTexel.toFixed(2)};
            vec2 uv = clamp(reflUv, vec2(0.002), vec2(0.998));
            vec4 planar = texture2D(uReflMap, uv);
            planar += texture2D(uReflMap, uv + vec2(r.x, r.y));
            planar += texture2D(uReflMap, uv + vec2(-r.x, r.y));
            planar += texture2D(uReflMap, uv + vec2(r.x, -r.y));
            planar += texture2D(uReflMap, uv + vec2(-r.x, -r.y));
            planar *= 0.2;
            vec3 scene = pow(max(planar.rgb, vec3(0.0)), vec3(0.62)) * 1.80;
            float sceneW = clamp(planar.a, 0.0, 1.0) * clamp(uPlanarAmt, 0.0, 1.0) * ${COAST_CHOP.planarMix.toFixed(2)};
            reflection = mix(reflection, scene, sceneW);
          }
        }
      }
      // taste-r1 (W14-A): the shelf water keeps its turquoise. Inside 12 m of the shore the sky mirror and the
      // glint fall to 0.3 of their open value (Pocket Reserve civ7/water-surface.ts:222-238, its 0.3 m shelf scaled by 40).
      float shoreK = mix(0.3, 1.0, smoothstep(0.0, 12.0, max(${FR}, 0.0)));
      float column = smoothstep(0.20, 3.6, max(si.depth, 0.0));
      float mirror = min(${COAST_CHOP.mirrorCap.toFixed(2)}, fres * mix(0.06, 0.55, column)) * ${WATER_LAW.mirrorGain.toFixed(2)};
      if (!(uAquaHasPmrem || uPlanarOn > 0.5)) mirror = 0.0;
      mirror *= uDbg.z * shoreK;
      // taste-r1 (W20-A): thin shelf water reflects little at this camera; the mirror follows the cover (SHALLOW_CLEAR.mirrorFloor is the share kept at zero cover).
      mirror *= mix(1.0, mix(${SHALLOW_CLEAR.mirrorFloor.toFixed(2)}, 1.0, shelfCover), step(0.001, ${SHALLOW_CLEAR.gain.toFixed(2)}));
      water.rgb = mix(water.rgb, reflection, mirror);
      // Bounded luminance-only swell shading: no hue term or exponential gain.
      water.rgb *= 1.0 + openWater * macro;
      // Rough dielectric GGX lobe, evaluated on the displaced wave normal.
      vec3 L = normalize(uSunDir);
      vec3 H = normalize(V + L);
      float nh = max(dot(specN, H), 0.0);
      float nl = max(dot(si.normal, L), 0.0);
      float nv = max(dot(si.normal, V), 0.001);
      // Rain roughens the lobe by TASTE_RAIN.sea.roughnessAdd (uSea.w, 0 in clear sky).
      float roughness = min(${WATER_SLOPE.glintCeil.toFixed(2)}, sqrt(${WATER_SLOPE.glintBase.toFixed(2)} * ${WATER_SLOPE.glintBase.toFixed(2)} + sigma2) + uSea.w);
      float a2 = roughness * roughness;
      float denom = nh * nh * (a2 - 1.0) + 1.0;
      float distribution = a2 / (3.14159265 * denom * denom);
      float visibility = nl / (nl * 0.72 + 0.28) * nv / (nv * 0.72 + 0.28);
      float glint = 0.016 * (1.0 - exp(-distribution * visibility * fres * 4.0));
      // Overcast turns the sun into a diffuse disc: the glints follow the direct sun
      // gain AND the clear share of the sky, so a bright rain key (sunGain 0.62) does
      // not bring back a hard specular on a sky that has none.
      if (uAquaWeather.x > 0.0) glint *= uAquaWeather.z * (1.0 - uAquaWeather.x);
      water.rgb += vec3(1.0, 0.94, 0.83) * glint * shoreK;
      // WATER LAW specular: roughness 0.08 on crests to 0.25 in troughs. A tight
      // lobe on the 3 m chop normal gives the sun-sparkle of the Civ VII open sea
      // (Coastal_in-game); the broad lobe above stays as the soft sheen. Rain takes
      // the sun away, so it takes the sparkle with it.
      // SPARKLE (gate ruling 1): a 0.35-0.7 m detail field that modulates the roughness of the
      // specular lobe only (${WATER_LAW.sparkle.roughness.glint.toFixed(2)} on a glint centre, ${WATER_LAW.sparkle.roughness.trough.toFixed(2)} in the troughs). It is added here, after the
      // diffuse, refraction and Fresnel colour are final, and it reads no body colour.
      // The weight gathers on sun-facing swell flanks (smoothstep of the slope toward the sun,
      // floored so every 64 px tile keeps some), is cut to ${WATER_LAW.rainSea.glintWeight.toFixed(2)} in rain by uSea.z,
      // and fades to zero between ${WATER_LAW.sparkle.fadeFrom.toFixed(0)} and ${WATER_LAW.sparkle.fadeTo.toFixed(0)} m from the camera.
      float sparkDist0 = length(cameraPosition - vWorld);
      float gather = smoothstep(-0.015, 0.035, slopeSun) * envN;
${SEA_SPARKLE > 0 ? `      // taste-r1 (W45): SEA_SPARKLE. The sun's reflection: a lobe on N.H (nh, above) that is 1 at the mirror point and 0 ${SEA_SPARKLE_TUNE.nhFrom} and below (about 22 degrees of normal tilt from the vertical). It thins the specks (through gather) and dims them.
      float sparkSun = smoothstep(${SEA_SPARKLE_TUNE.nhFrom.toFixed(3)}, ${SEA_SPARKLE_TUNE.nhTo.toFixed(3)}, nh);
` : ''}${SPARKLE_PATH_ON ? `      // taste-r1 (W46): SPARKLE_PATH. The glitter path: a narrow lobe on N.H, 1 at the mirror point and 0 by ${SPARKLE_PATH_TUNE.nhFrom}; it gathers the glints (gather), multiplies their density by 1 + ${SPARKLE_PATH_TUNE.count} x it and their brightness by 1 + ${SPARKLE_PATH_TUNE.gain} x it.
      float sparkPath = smoothstep(${SPARKLE_PATH_TUNE.nhFrom.toFixed(4)}, ${SPARKLE_PATH_TUNE.nhTo.toFixed(4)}, nh);
` : ''}      // W6-A near-field cap: inside nearTo metres the speck shrinks and the glint weight falls (law.js).
      float nearK = smoothstep(${WATER_LAW.sparkle.nearFrom.toFixed(1)}, ${WATER_LAW.sparkle.nearTo.toFixed(1)}, sparkDist0);
      float glintCentre = ddSeaSparkle(vFlatWorld.xz, uTime, -seaDir * ${WATER_LAW.sparkle.advectMps.toFixed(1)}, ${SPARKLE_PATH_ON ? 'max(gather, sparkPath) * sparkSun' : `gather${SEA_SPARKLE > 0 ? ' * sparkSun' : ''}`}, ${SPARKLE_PATH_ON ? `min(uSeaTune.x * (1.0 + ${SPARKLE_PATH_TUNE.count.toFixed(2)} * sparkPath), 0.9)` : 'uSeaTune.x'}, mix(${WATER_LAW.sparkle.nearSize.toFixed(2)}, 1.0, nearK));
      float sparkA = mix(${WATER_LAW.sparkle.roughness.trough.toFixed(2)}, ${WATER_LAW.sparkle.roughness.glint.toFixed(2)}, glintCentre);
      float lobeTight = 1.0 / (sparkA * sparkA);
      float lobeTrough = 1.0 / ${(WATER_LAW.sparkle.roughness.trough ** 2).toFixed(4)};
      float lobeGlint = 1.0 / ${(WATER_LAW.sparkle.roughness.glint ** 2).toFixed(4)};
      float spark = (lobeTight - lobeTrough) / (lobeGlint - lobeTrough)
        * uSeaTune.y * uSea.z * uDbg.x * shoreK
        * mix(${WATER_LAW.sparkle.nearWeight.toFixed(2)}, 1.0, nearK * nearK)
        * (1.0 - smoothstep(${WATER_LAW.sparkle.fadeFrom.toFixed(1)}, ${WATER_LAW.sparkle.fadeTo.toFixed(1)}, sparkDist0))${SEA_SPARKLE > 0 ? '\n        * sparkSun' : ''}${SPARKLE_PATH_ON ? `\n        * (1.0 + ${SPARKLE_PATH_TUNE.gain.toFixed(2)} * sparkPath)` : ''};
      water.rgb += uSunColor * spark;
      vec3 sit = ddW20HullSit(vFlatWorld.xz, uSunDir.xz / max(length(uSunDir.xz), 0.001));
      float sunShadow = mix(1.0, getShadowMask(), uDbg.y);
      if (uAquaWeather.x > 0.0) sunShadow = mix(1.0, sunShadow, uAquaWeather.z);
      // Waterline band on every hull: the water darkens 30% inside it (water law, hulls).
      water.rgb *= (1.0 - 0.30 * sit.x) * mix(0.42, 1.0, sunShadow);
      // Three separate eased masks: compression whitecaps, sparse drifting
      // surface lace, and an SDF swash front that advances/retreats in metres.
      float laceA = texture2D(uW19Foam, uv * 0.67 + drift * 0.35, 2.0).r;
      float laceB = texture2D(uW19Foam, turn * uv * 0.91 - drift * 0.21, 2.0).r;
      float lace = sqrt(max(laceA * laceB, 0.0)) * uW19Ready;
      // Shore foam is the SDF lip on the beach-foam mesh. This sheet no longer
      // paints a second collar that travels 0.5–2.7 m off the waterline.
      // Whitecaps (wind state: rain, or the clear-sky share WATER_LAW.waves.clearWind; coverage at most ${WATER_LAW.rainSea.whitecaps * 100}%).
      // Flecks 1.5 to 3 m long on the back of the carrier crests (ddSeaFleck, water/sea.js), hosted where the
      // swell group is strong. The old 2.2 m disc field is gone: those were the rain splash discs.
      float caps = 0.0;
      float windHost = max(uSea.x, ${WATER_LAW.waves.clearWind.toFixed(2)}) * uWhitecapGain;
      if (windHost > 0.0) {
        // Gust patches 60 to 150 m across cover about a fifth of the sea in clear sky and a third in rain; only inside one
        // does a crest carry flecks, and then about one cell of two (four of five in rain). The rain share is TASTE_RAIN.sea.whitecaps.
        float gust = ddSeaGust(vFlatWorld.xz, uTime, mix(0.54, 0.50, uSea.x), mix(0.63, 0.59, uSea.x)) * smoothstep(0.0, 0.4, envN - 0.35);
        float dense = mix(0.85, 1.0, uSea.x) * min(1.0, windHost) * ${(WATER_LAW.rainSea.whitecaps / 0.008).toFixed(3)};
        // taste-r1 (W15-A1): flecks cut from the foam pack's fleck channel (ddSeaFleckPack, water/sea.js). They follow the carrier
        // crest with its open-sea wander and fade where that train's group is weak; none within 30 to 48 m of any shore.
        caps = ddSeaFleckPack(vAlong, vWaveFront, uTime, waterFoot, gust, dense * mix(${FLECK_DENSE.clear.toFixed(2)}, ${FLECK_DENSE.rain.toFixed(2)}, uSea.x), trPh.x, length(cameraPosition - vWorld))
          * openWater * smoothstep(30.0, 48.0, coastS) * smoothstep(0.35, 0.8, trEn.x);
      }
      float ambient = 0.0;
      // Rows of surf and the shore lip (W15-A2), high and medium quality. Three or four broken rows of foam run shoreward over the
      // beach shelf, about ${SURF_ROWS.spacingM.toFixed(1)} m apart in shore distance (5.6 to 10.4 m with the W16 jitter), on the swash period (SURF.period): each row is born faint
      // 17 to 25 m out, thickens and brightens as it comes in (the nearest row is the widest and brightest, the outer the thinnest), and
      // dissolves into the lip between 6.5 m and 1.2 m. A row is a run of 6 to 30 m with clear water either side, tapering to nothing at
      // both ends, cut from the breaker channel of the foam pack (a broken lace, not value noise) in the row's own frame (along
      // the shore, metres seaward of its crest) so the lace travels with the row. Nothing is drawn beyond 34 m.
      // taste-r1 (W17-B): each row also leaves a trail on its seaward side (3 to 6 m of the same lace stretched along the travel and torn by a second
      // lookup, 0.35 at the row falling to nothing), and the water between the nearest live row and the lip carries a wash: a thin drifting net of
      // spent foam with holes, thinning as it ages. Both read the foam pack's existing fleck channel through ddRowLace.
      float surfFoam = 0.0;
      float rowFoam = 0.0;
      float rowCover = 0.0; // taste-r1 (W17-B): the trail and wash opacity, which also lifts the water's own alpha on the thin shelf water so the foam is not painted into a clear sheet
${SP ? `      float coastSw = coastS; // wave 78 (2b-3): the rows, their trail and wash and the lip read the one front inside the beach (the spine's, frontF), not the coast field's chamfer S; the two are one metre apart at most, but not one function
      coastS = mix(coastS, max(frontF, 0.0), spW * (1.0 - smoothstep(20.0, 30.0, frontF)));
` : ''}      if (uCoastGain > 0.5) {
        // The carrier phase, recomputed per pixel with its shoaling term, still drives the lip's lace (unchanged from W14).
        vec4 kkB = ddSurfK(coastS);
        vec4 eeB = ddSurfE(coastS);
        vec2 D0 = uBayDir[0];
        float len0 = max(uBayLen[0], 4.0);
        float wob0 = sin(vAlong * 0.019 + 0.6) * 4.2 + sin(vAlong * 0.047 + 1.9) * 1.8;
        float phi0 = 6.28318530718 / len0 * (D0.x * vAlong + D0.y * (vWaveFront + wob0 * 0.35)) + uBayOmega[0] * uTime + eeB.x;
        float cyc = (phi0 - 1.5707963) / 6.28318530718;
        float u = fract(cyc);
        float waveId = floor(cyc);
        float behindM = u * kkB.y;
        float camD = length(cameraPosition - vWorld);
        // Broken lace: holes of 0.5 to 1.5 m in the line, from two octaves of value noise along the crest and behind it.
        float tear = ddValueNoise(vec2(vAlong / 1.3 + waveId * 3.1, behindM / 0.5)) * 0.65
          + ddValueNoise(vec2(vAlong / 0.55 + waveId * 7.7, behindM / 0.22 + 4.0)) * 0.35;
        float cls = coastTex.b;
        float natural = 1.0 - smoothstep(0.65, 0.85, cls);
${COVE_JOIN > 0 ? `        float cvTn = (ddValueNoise(vFlatWorld.xz / ${COVE_JOIN_TUNE.tearScaleM.toFixed(2)} + vec2(1.3, 6.8)) - 0.5) * ${(2 * COVE_JOIN_TUNE.boxSoftM).toFixed(2)};
        float cove = smoothstep(313.0 - ${COVE_JOIN_TUNE.boxSoftM.toFixed(1)}, 313.0 + ${COVE_JOIN_TUNE.boxSoftM.toFixed(1)}, vFlatWorld.x + cvTn) * smoothstep(194.0 - ${COVE_JOIN_TUNE.boxSoftM.toFixed(1)}, 194.0 + ${COVE_JOIN_TUNE.boxSoftM.toFixed(1)}, vFlatWorld.z + cvTn) * (1.0 - smoothstep(292.0 - ${COVE_JOIN_TUNE.boxSoftM.toFixed(1)}, 292.0 + ${COVE_JOIN_TUNE.boxSoftM.toFixed(1)}, vFlatWorld.z + cvTn)); // taste-r1 (W25-A): a torn edge in place of the ruled box
` : `        float cove = step(313.0, vFlatWorld.x) * step(194.0, vFlatWorld.z) * step(vFlatWorld.z, 292.0);
`}        // taste-r1 (W14 verdict): rows are drawn on the beach shelf only (coast class 0). On the natural hinterland coast and in the
        // Apostles cove there is no shelf under them and they read as white smears over deep water (advisor regression 4); only the lip draws there.
        float beachOnly = 1.0 - smoothstep(0.15, 0.35, cls);
        float calmK = 1.0 - smoothstep(0.02, 0.15, vCalm);
        float camK = 1.0 - smoothstep(350.0, 450.0, camD);
        // taste-r1 (W15 fix): the rows fade out over the last 15 m of the shelf at both ends along the shore (taps of the class channel every
        // 3 m, five a side, so a row thins out before the class edge instead of stopping on a line).
        float endA = 0.0;
        float endB = 0.0;
        for (int ti = 1; ti <= 5; ti++) {
          float to = 3.0 * float(ti);
          endA += smoothstep(0.15, 0.35, texture2D(uCoastField, (vFlatWorld.xz + seaAlong * to - uDepthOrigin) / uDepthSpan).b);
          endB += smoothstep(0.15, 0.35, texture2D(uCoastField, (vFlatWorld.xz - seaAlong * to - uDepthOrigin) / uDepthSpan).b);
        }
        float shelfEnd = 1.0 - max(endA, endB) / 5.0;
        shelfEnd = shelfEnd * shelfEnd * (3.0 - 2.0 * shelfEnd);
        float rowOk = natural * beachOnly * (1.0 - cove) * calmK * camK * step(0.0, ${FR}) * smoothstep(0.0, 1.0, coastS)
          * (1.0 - smoothstep(30.0, 34.0, coastS)) * uFleckReady * shelfEnd;
        if (rowOk > 0.001) {
          float rowT = uTime / ${SURF.period.toFixed(4)} + ${SURF_ROWS.phase.toFixed(3)};
          // The rows meander together: the carrier's own along-shore bend plus a slow noise, so they are parallel curved lines, never a comb.
          float bend = wob0 * 0.18 + (ddValueNoise(vec2(vAlong / 41.0 + 4.1, 9.0)) - 0.5) * 2.2;
          // taste-r1 (W16): each row sits at its own distance from the lip, a value noise over shore distance (one lattice cell per row) and along the shore, so neighbouring rows are unequally spaced and do not run parallel for long.
          float rowW = ${SURF_ROWS.rowJitterM.toFixed(2)} * (2.0 * ddValueNoise(vec2(coastS / ${SURF_ROWS.spacingM.toFixed(2)} + 5.3, vAlong / ${SURF_ROWS.rowJitterAlongM.toFixed(1)} + 2.1)) - 1.0);
          float q = (coastS + bend + rowW) / ${SURF_ROWS.spacingM.toFixed(2)} + rowT;
          float rid = floor(q);
          float x = (q - rid) * ${SURF_ROWS.spacingM.toFixed(2)};
          float sC = coastS - x;
          float inner = 1.0 - smoothstep(7.0, 21.0, sC);
          // Each wave is its own: hashes of the wave id place its lace (offset, scale, mirror), its wander off the lip and its coverage.
          float h1 = ddHash21(vec2(rid, 3.0));
          float h2 = ddHash21(vec2(rid, 7.0));
          float h3 = ddHash21(vec2(rid, 19.0));
          // Narrow smooth profile of ${SURF_ROWS.widthOuterM.toFixed(1)} to ${SURF_ROWS.widthInnerM.toFixed(1)} m, centred just behind the crest, wandering by up to ${SURF_ROWS.wanderM.toFixed(1)} m along the shore (a different wander per row), with a longer tail on the seaward side.
          float cx = ${SURF_ROWS.centreM.toFixed(2)} + ${SURF_ROWS.wanderM.toFixed(2)} * (2.0 * ddValueNoise(vec2(vAlong / 26.0 + h1 * 40.0, rid * 1.7 + 2.0)) - 1.0);
          float hw = mix(${(SURF_ROWS.widthOuterM * 0.5).toFixed(2)}, ${(SURF_ROWS.widthInnerM * 0.5).toFixed(2)}, inner)
            * mix(0.8, 1.25, ddValueNoise(vec2(vAlong / 9.0 + h2 * 30.0, rid * 2.7 + 8.0))) * uLineScale;
          hw = max(hw, 1.2 * waterFoot);
          float dxp = (x - cx) / (hw * ((x > cx) ? 1.45 : 0.75));
          float prof = exp(-1.6 * dxp * dxp) * smoothstep(0.0, 0.35, x);
          // Along the row: a slow noise with a soft threshold leaves foam on about half the crest in lengths of 5 to 30 m and lets it thin to nothing.
          float cn = 0.62 * ddValueNoise(vec2(vAlong / ${SURF_ROWS.covLongM.toFixed(1)} + h2 * 50.0, rid * 3.7 + 1.0)) + 0.38 * ddValueNoise(vec2(vAlong / ${SURF_ROWS.covShortM.toFixed(1)} + h3 * 50.0, rid * 5.9 + 3.0));
          float cov = smoothstep(${SURF_ROWS.covLo.toFixed(2)}, ${SURF_ROWS.covHi.toFixed(2)}, cn);
          vec2 pl = vec2(vAlong * ((h1 < 0.5) ? -1.0 : 1.0) * mix(0.85, 1.2, h3), x * mix(0.85, 1.2, h1)) + vec2(h2, h3) * 60.0;
          vec2 laceR = ddRowLace(pl, waterFoot);
          float m = prof * mix(${SURF_ROWS.filmFloor.toFixed(2)}, 1.0, laceR.x) * mix(0.8, 1.0, laceR.y);
          float born = 1.0 - smoothstep(${SURF_ROWS.bornFromM.toFixed(1)}, ${SURF_ROWS.bornToM.toFixed(1)}, sC);
          float dissolve = smoothstep(1.2, 6.5, sC);
          // taste-r1 (W16): brightness by distance from the lip: 1.0 at the lip, rowSecondOpacity at 8 m, outerShare at 16 m and beyond.
          float rowPs = clamp(sC / ${SURF_ROWS.spacingM.toFixed(2)}, 0.0, 2.0);
          float rowK = mix(mix(1.0, ${SURF_ROWS.rowSecondOpacity.toFixed(2)}, min(rowPs, 1.0)), ${SURF_ROWS.outerShare.toFixed(2)}, clamp(rowPs - 1.0, 0.0, 1.0));
          float amp = born * dissolve * rowK * cov;
          rowFoam = ${SURF_ROWS.cap.toFixed(2)} * m * amp * rowOk;
          // taste-r1 (W17-B): the trail. Seaward of the crest profile, the lace is read again with its across-row coordinate scaled by
          // ${SURF_ROWS.trailStretch.toFixed(2)} (long streaks along the travel) and torn by a second, coarser lookup in a different frame; the opacity falls from the row outward over
          // ${SURF_ROWS.trailMinM.toFixed(1)} to ${SURF_ROWS.trailMaxM.toFixed(1)} m, and follows the row's own strength (nearest row strongest), thinning where the row has no foam.
          float trailK = 0.0;
          if (${SURF_ROWS.trailGain.toFixed(2)} > 0.0 && x > cx) {
            float trailL = mix(${SURF_ROWS.trailMinM.toFixed(2)}, ${SURF_ROWS.trailMaxM.toFixed(2)}, ddValueNoise(vec2(vAlong / 17.0 + h3 * 30.0, rid * 2.3 + 6.0)));
            float tx = x - cx;
            // taste-r1 (W18-A): bend the strands so they curve and cross: a metres-scale offset along the row that grows with the distance behind it, a different field for each lookup; and a ragged end.
            float bendT = (ddValueNoise(vec2(vAlong / 3.5 + h2 * 40.0, tx / 2.8 + rid * 1.7)) - 0.5) * 2.0 * min(tx, 5.0) * 1.3;
            float bendU = (ddValueNoise(vec2(vAlong / 2.7 + h1 * 40.0 + 9.0, tx / 2.2 + rid * 2.9 + 4.0)) - 0.5) * 2.0 * min(tx, 5.0) * 1.1;
            trailL *= mix(0.55, 1.15, ddValueNoise(vec2(vAlong / 3.8 + h1 * 20.0, rid * 4.1 + 2.0)));
            float fall = 1.0 - smoothstep(0.0, trailL, tx);
            fall *= fall;
            vec2 plT = vec2(pl.x + bendT, pl.y * ${SURF_ROWS.trailStretch.toFixed(2)}) + vec2(31.7, 11.3);
            vec2 plU = vec2(pl.x * 1.55 + bendU, pl.y * ${(SURF_ROWS.trailStretch * 1.6).toFixed(2)}) + vec2(-17.9, 43.1);
            vec2 laceT = ddRowLace(plT, waterFoot * 1.0);
            vec2 laceU = ddRowLace(plU, waterFoot * 1.55);
            float tearT = smoothstep(0.30, 0.62, laceU.x);
            float strand = mix(0.40, 1.0, laceT.x) * mix(0.35, 1.0, tearT);
            float tEnv = born * dissolve * rowK * mix(0.45, 1.0, cov);
            // a short soft start so the trail grows out of the crest profile instead of beginning on a line
            float tIn = smoothstep(0.0, 0.6, tx);
            trailK = ${SURF_ROWS.trailGain.toFixed(2)} * fall * strand * tEnv * mix(1.0, tIn, 0.6) * rowOk;
          }
          // taste-r1 (W17-B): the wash. Pixels whose own row has dissolved (sC under about 1 m) lie between the nearest live row and the lip:
          // a net of the lace drifting shoreward at ${SURF_ROWS.washDrift.toFixed(2)} of the row speed, holes where the lace is open, ${SURF_ROWS.washMinGain.toFixed(2)} to 1.0 of ${SURF_ROWS.washGain.toFixed(2)} opacity,
          // out to ${SURF_ROWS.washReachM.toFixed(1)} m from the waterline, thinner as it ages (x is the time since the last crest passed, in metres of the row period) and gone at the nearest crest.
          float washK = 0.0;
          if (${SURF_ROWS.washGain.toFixed(2)} > 0.0) {
            float sw = coastS + ${(SURF_ROWS.washDrift * SURF_ROWS.spacingM).toFixed(2)} * rowT;
            vec2 plW = vec2(vAlong * 0.9, sw * 0.8) + vec2(73.1, 5.7);
            vec2 plV = vec2(vAlong * 1.45, sw * 1.25) + vec2(-29.3, 61.9);
            vec2 laceW = ddRowLace(plW, waterFoot * 0.9);
            vec2 laceV = ddRowLace(plV, waterFoot * 1.45);
            float netA = smoothstep(0.34, 0.62, laceW.x);
            float netB = smoothstep(0.30, 0.60, laceV.x);
            float net = netA * mix(0.45, 1.0, netB);
            float own = 1.0 - smoothstep(1.0, 4.0, sC);
            float toCrest = 8.0 - x;
            float ahead = smoothstep(0.0, 1.6, toCrest);
            float reach = 1.0 - smoothstep(${(SURF_ROWS.washReachM * 0.65).toFixed(2)}, ${SURF_ROWS.washReachM.toFixed(2)}, coastS);
            float lipIn = smoothstep(0.2, 1.4, coastS);
            float age = mix(1.0, ${SURF_ROWS.washAgeKeep.toFixed(2)}, clamp(x / 8.0, 0.0, 1.0));
            float washPatch = mix(0.6, 1.0, ddValueNoise(vec2(vAlong / 23.0 + 3.7, sw / 9.0 + 1.3)));
            washK = ${SURF_ROWS.washGain.toFixed(2)} * mix(${SURF_ROWS.washMinGain.toFixed(2)}, 1.0, laceW.y) * net * own * ahead * reach * lipIn * age * washPatch * rowOk;
          }
          rowCover = max(trailK, washK);
          rowFoam = max(rowFoam, 1.0 - (1.0 - rowFoam) * (1.0 - trailK) * (1.0 - washK));
        }
        // The shore lip: one 0.5 to 1 m line at the waterline on every natural shore (the beach has its own, in the sand).
        float lipW = max(0.8, 1.5 * waterFoot);
        float lipN = ddValueNoise(vec2(vAlong / 9.0, 31.0));
${FAR_SHORE > 0 ? (() => {
  const T = FAR_SHORE_TUNE;
  const taps = FAR_SHORE_TAPS;
  return `        // taste-r1 (W42): FAR_SHORE. Beyond the board's ring the lip reads the shore distance low-passed over ${T.ringM[1]} m (${taps.length + 1} samples) and un-biased by ${T.biasM} m, so its contour follows the shore and not the coast field's 2.73 m texels.
        float lipS = coastS;
        float fsK = smoothstep(${T.fromM.toFixed(1)}, ${T.toM.toFixed(1)}, length(vFlatWorld.xz - (uDepthOrigin + vec2(0.5 * uDepthSpan)))) * smoothstep(0.35, 0.5, cls) * (1.0 - smoothstep(${T.nearM.toFixed(1)}, ${(T.nearM + 4).toFixed(1)}, coastS))${SP ? ' * step(0.5, uCoastGain)' : ''};
        if (fsK > 0.001) {
${TEETH_ON ? `          float fsAcc = stSum; // W43: the sum taken above, centre tap first
` : `          float fsAcc = coastS;
${taps.map(([ox, oz]) => `          fsAcc += ddFarS(vFlatWorld.xz + vec2(${ox.toFixed(3)}, ${oz.toFixed(3)}));`).join('\n')}
`}          lipS = mix(coastS, max(fsAcc / ${(taps.length + 1).toFixed(1)} - ${T.biasM.toFixed(2)}, 0.0), fsK);
        }
`;
})() : ''}        float lip = (1.0 - smoothstep(lipW * 0.5, lipW, abs(${FAR_SHORE > 0 ? 'lipS' : 'coastS'} - lipW * 0.5)))
          * (1.0 - smoothstep(0.82, 0.96, lipN)) * mix(0.6, 1.0, tear) * (0.8 / lipW)
          * natural * (1.0 - cove) * calmK * camK
          * smoothstep(0.15, 0.35, cls);
        surfFoam = max(surfFoam, lip);
      }
${SP ? `      coastS = coastSw;
` : ''}      // taste-r1 (W15-A2): the presentation grade takes about a third of the chroma of the shelf water in rain (S 36 clear to S 25), so the first
      // 20 m of the beach shelf is given back 30% of it in rain; the water law's own rain desaturation (8%) is untouched and the deep sea is not touched.
      float rainShelf = shelfK * clamp(uAquaWeather.x / 0.8, 0.0, 1.0) * (1.0 - smoothstep(12.0, 24.0, coastS));
      water.rgb = max(mix(vec3(ddLum(water.rgb)), water.rgb, 1.0 + ${SURF_ROWS.rainShelfChroma.toFixed(2)} * rainShelf), vec3(0.0)) * (1.0 - ${SURF_ROWS.rainShelfDark.toFixed(2)} * rainShelf);
      float wash = 0.0;
      float hull = (sit.y * 0.40 + sit.z * 0.18) * mix(0.25, 0.85, lace);
      float foam = clamp(surfFoam + ambient + wash + hull, 0.0, 0.90);
      float lit = 0.65 + 0.35 * max(dot(si.normal, normalize(uSunDir)), 0.0);
      if (uAquaWeather.x > 0.0) {
        lit = 0.65 * uAquaWeather.y
          + 0.35 * max(dot(si.normal, normalize(uSunDir)), 0.0) * uAquaWeather.z;
      }
      // Hull foam is the water.foam token at no more than 0.7 opacity (water law).
      // Whitecaps are lit by the open sky, not by the sun, so they keep most of their white in rain.
      water.rgb = mix(water.rgb, DD_FOAM * uWaterGain * mix(lit, 1.0, 0.85 * step(0.01, caps + surfFoam)), min(foam, ${WATER_LAW.shoreFoam.opacity.toFixed(2)}));
      // taste-r1 (W15-A1): a whitecap core reaches L8 200 and over, so it composites past the 0.7 shore-foam cap (0.92); it is lit by
      // the open sky like the lip above.
      water.rgb = mix(water.rgb, DD_FOAM * uWaterGain * ${(1 - (1 - WHITECAP_FOAM.tone) * WHITECAP_FOAM.gain).toFixed(3)} * mix(lit, 1.0, 0.85), min(caps, 0.92));
      water.a = max(water.a, max(wash, rowCover) * 0.8);
${TEETH_ON ? `      // taste-r1 (W43): the lip's white was opaque because the bed's cliff gave it deep water under it; on the smooth shelf the water there is clear, so the foam carries its own cover (${SHORE_TEETH_TUNE.lipA}), with the smooth foam's edge.
      water.a = max(water.a, stK * ${SHORE_TEETH_TUNE.lipA.toFixed(2)} * smoothstep(0.35, 0.8, surfFoam));
` : ''}      if (uW22FoamDebug > 0.5) water = vec4(caps, ambient * 10.0, wash, 1.0);
      // Beyond 250 m the ramp tints toward the fog colour on the fog curve
      // (50% at 900 m), so the far sea closes into the horizon like the land.
      // Water takes three quarters of the land's fog and a fog tinted a third of the way
      // to the mid-deep ramp stop, so the far sea keeps a blue depth read in rain and at
      // the overview instead of closing to the same grey as the sky (flat grey ocean).
      float fogK = ddWaterFogMix(length(cameraPosition - vWorld)) * 0.75;
      vec3 fogBody = mix(uWaterFog, DD_RAMP2 * 2.5, 0.35) * uWaterGain;
      if (uAquaWeather.x > 0.0) fogBody = ddWaterWeather(fogBody, uAquaWeather.x);
      water.rgb = mix(water.rgb, fogBody, fogK);
      // Reserve highlight headroom before the shared presentation grade.
      water.rgb = min(water.rgb, vec3(0.65));
      // taste-r1 (W15-A2): the crest of a surf row composites up to ${SURF_ROWS.cap.toFixed(2)} (the shore foam above is held at 0.7 and under the 0.65 cap) and past that cap, so a
      // row core reaches a screen luminance over L8 215 like the lip does; it is lit by the open sky and thins with the fog like the sea does.
      water.rgb = mix(water.rgb, DD_FOAM * ${SURF_ROWS.crestGain.toFixed(2)} * mix(lit, 1.0, 0.85), min(rowFoam, ${SURF_ROWS.cap.toFixed(2)}) * (1.0 - fogK));
${SP ? `      water.a = mix(water.a, min(water.a, smoothstep(${(-SPINE_WATER.edgeM).toFixed(2)}, ${SPINE_WATER.edgeM.toFixed(2)}, frontF - ${SPINE_EDGE.centreM.toFixed(3)})), spW); // wave 75 (2b-1), wave 77 (fix 3): the sheet's alpha is capped by a ramp that is 0.5 at the front's zero and 0 at ${SPINE_WATER.edgeM} m landward of it (the foam and wash terms above raise the alpha near the waterline, which a fade that multiplied it left 0.12 m landward of the zero); the sand stands above the sheet landward of it
` : ''}${SP ? `      if (spW > 0.0 && water.a < 0.01) discard; // wave 77 (fix 2): landward of its fade the sheet writes neither colour nor depth (the wet-edge decal and the foam draw there)
` : ''}      gl_FragColor = water;
    }
  `;
}

export function bindAquaEnvironment(mesh, uniforms) {
  // taste-r1 (W17-A): the shade-only swell components are off unless the ocean program sets them (high and medium quality).
  uniforms.uShadeGain ??= { value: 0 };
  // R2 delete/refine: cut the unfinished per-frame refraction resolve.
  // Depth transmission remains in ddSurface; PMREM needs no scene copy.
  uniforms.uW22HasBehind = { value: false };
  uniforms.uAquaPmrem = { value: null };
  uniforms.uAquaHasPmrem = { value: false };
  uniforms.uAquaCube = { value: new THREE.Vector3(1 / 768, 1 / 1024, 8) };
  uniforms.uAquaWeather = { value: new THREE.Vector3(0, 1, 1) };
  // Review-only term multipliers: x sparkle, y sun shadow, z sky mirror, w chop.
  // All 1 in the game; the lane review toggles them to attribute a pattern.
  uniforms.uDbg = { value: new THREE.Vector4(1, 1, 1, 1) };
  // Sea sparkle and swell-shade strengths (SEA_TUNE). A page may overwrite them to sweep a term.
  uniforms.uSeaTune = { value: new THREE.Vector4(SEA_TUNE.density, SEA_TUNE.gain, SEA_TUNE.shade, 0) };
  uniforms.uSea ??= { value: new THREE.Vector4(0, 1, 1, 0) };
  // taste-r1 (W14 verdict): whitecaps are switched off. The fleck shader drew one wedge shape repeated in diagonal rows
  // (advisor regression 1, stations 21, 10, 08). Set to 1 again only once the flecks come from the foam pack's fleck channel.
  // W15-A1 outcome: the flecks are rebuilt from the foam pack and draw (set this to 1 to see them), but they stay OFF: at station 21 the
  // nearest-neighbour angle share was 18 to 41 % across rounds (target 18 or under) and a 0.5 % fleck coverage cannot sit under the
  // water-gate luminance SD ceiling of 12 (SD 16.7 rain, 12.0 clear with them on, 11.1 / 11.6 with them off).
  uniforms.uWhitecapGain = { value: 1 }; // taste-r1 (W19-C): whitecaps always on (rain and clear). 0 switches the flecks off.
  // taste-r1 (W15-A1): the fleck channel of the foam pack. `ready` is the loader's own object, so the flecks stay off until the PNG arrives.
  const fleckPack = loadCoastPack('foam');
  uniforms.uFleckPack = { value: fleckPack.texture };
  uniforms.uFleckReady = fleckPack.ready;
  // The far sea closes toward the bible fog token (#A9B9CE) on the bible fog
  // curve, not toward the scene's own fog colour: that is a pale haze (V 90+)
  // set by the lighting profile and turned the far ocean near-white. Weather
  // dims it through ddWaterWeather in the shader like the rest of the body.
  uniforms.uWaterFog = { value: new THREE.Color(TASTE.fog) };
  mesh.onBeforeRender = (renderer, scene, camera) => {
    mesh.userData.syncHullContact?.(camera);
    // Rain state of the sea (ruling 2): swell envelope x1.3, glint weight 35%, roughness +0.12.
    uniforms.uSea.value.set(...seaRainState(uniforms.uAquaWeather.value.x));
    // Keep the bay reflection coloured when the lighting environment is desaturated.
    const env = scene.userData.ddSkyEnvironment ?? scene.environment;
    uniforms.uAquaHasPmrem.value = Boolean(env?.mapping === THREE.CubeUVReflectionMapping);
    if (!uniforms.uAquaHasPmrem.value) return;
    uniforms.uAquaPmrem.value = env;
    const height = env.image.height;
    uniforms.uAquaCube.value.set(1 / env.image.width, 1 / height, Math.log2(height) - 2);
  };
}
