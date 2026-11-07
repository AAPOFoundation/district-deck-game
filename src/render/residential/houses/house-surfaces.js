// District Deck V3.40 — seat SURFACES. The nine material buckets for the four detached houses.
//
// Governing spec: docs/next-phase/V340-RESIDENTIAL-HOUSES-FROM-SCRATCH-SPEC.md
// Module contract: ./CONTRACT.md §4 (the nine buckets) and §6 (the required exports).
//
// NOTHING ELSE IN THIS LANE CREATES A MATERIAL. Every call into `MaterialLibrary`,
// `../texture-atlas.js` and `../textures.js` happens here, and wear lives here as albedo and
// roughness masks rather than as geometry cards.
//
// `palette()` and `makeContext()` from `../core.js` are deliberately NOT imported — see the
// header of ./index.js. `shade()` is a pure hex helper and is fine.
//
/* ─────────────────────── THE ONE FINDING THIS FILE EXISTS TO CLOSE ────────────────────────
 *
 * The baseline frontage is one milky mass. Measured off
 * `mvp/_reviews/residential/v340-baseline/cottage-federation--three-quarter.png` with a 15x15
 * median patch, converted to CIE L*:
 *
 *     wall 84.8  ·  trim 76.0  ·  roof 73.3  ·  picket 67.6      — an 17-point spread,
 *     and no dark joinery family anywhere on the building (its "green" measured C 2.2).
 *
 * The same measurement on `_reference-mp/mp-cottage-federation.png`:
 *
 *     wall 93.4  ·  picket 88.7  ·  post 80.7  ·  iron roof 72.0  ·  lawn 66.3
 *     brick 57.9  ·  shrub 54.7  ·  green fascia 43.3  ·  green door 32.5  ·  glass 22.1
 *
 * That last figure is a whole-patch median over the cottage's small deep-reveal front sashes,
 * came and glass together, and it is not the pane. Measured as a pane — the glass field alone,
 * on `mp-bungalow-brighton`'s bay — the reference reads L* 45-52 with its cames 20-32 below it.
 * See the `GLASS_RAMP` comment; taking the 22.1 for the glass itself is what put the leadlight
 * bay under its own cames on the r2 plate.
 *
 * A 61-point ladder against a 17-point one. The contrast IS the ornament, and every other
 * seat's work is invisible without it. So the colour in this file is authored as an EFFECTIVE
 * ALBEDO ladder, not as a set of pleasant hexes.
 *
 * ─────────────────────────── EFFECTIVE ALBEDO, AND WHY IT IS THE NUMBER ────────────────────
 *
 * `material.color` is not what the surface reflects. Every bucket but `glass` samples the
 * shared residential atlas, and each family cell in that atlas has its own mean albedo, so the
 * rendered albedo is `linear(authored) x linear(atlasCellMean)`. Measured off the generators in
 * ../textures.js and the `decorate()` pass in ../texture-atlas.js, the cell means are:
 *
 *     brick (240,238,235)   clinker (234,232,229)   render (190,183,168)
 *     weatherboard (214)    corrugated (156)        tile (214,203,191)
 *     painted_metal (183)   joinery (221)           timber (147,96,51)   foliage (66,115,52)
 *
 * Two consequences that decide the whole scheme:
 *
 *   1. Each family has a CEILING. Pure white on `corrugated` is L* 64.0; on `painted_metal`
 *      L* 74.4; on `joinery` L* 88.1; on `foliage` L* 43.8. A pale cream authored on
 *      `painted_metal` cannot get above L* 74 however white the hex is.
 *   2. So `trim` takes the ATLAS REGION NAMED `joinery` and `joinery` takes the region named
 *      `painted_metal`, which looks backwards and is not. `joinery`'s cell is a quiet
 *      directional brush grain at mean 221 — the right response for a painted barge board and
 *      the highest pale ceiling in the atlas. `painted_metal`'s cell is a brush breakup at mean
 *      183 with a glossier roughness map — the right response for dark enamel joinery, and its
 *      lower mean does half the work of driving the dark end down. The two ends of the
 *      ornamental range are therefore 54-60 L* apart before a photon is traced. The names are
 *      atlas region ids, not bucket names; the atlas is shared with three live lanes and is not
 *      this seat's to rename.
 *
 * Every colour below carries its measured effective-albedo lightness, chroma and hue in a
 * comment. Those are
 * the numbers a critic can check on paper; the plate adds lighting on top of them.
 *
 * ────────────────────────────── SURFACES THAT ANSWER LIGHT ─────────────────────────────────
 *
 * The rhythm on `corrugated` and `tile` is MODELLED BY SEAT KIT, so this file supplies no rib
 * and no course. What it supplies on those two is the breakup underneath — sheet lap, slow
 * value drift, cross-slope undulation, per-tile value — at a normal response low enough that it
 * cannot compete with the geometry, and at region repeats left exactly where the atlas set them
 * so the map-to-geometry ratio stays integer. The block comment above `RESPONSE` has the two
 * ratios and the arithmetic behind them.
 *
 * `weatherboard` and `brick`/`clinker` are the opposite case: their lap and their coursing ARE
 * this file's to make read, and the baseline renders both as faint ruled lines. Their normal
 * response is more than doubled here (weatherboard 0.45 -> 1.00, masonry 0.45 -> 0.95 against
 * atlas Sobel strengths of 3.8 and 2.2).
 */

import * as THREE from 'three';
import {
  getResidentialTextureAtlas,
  applyResidentialAtlas,
  configureResidentialAtlasShader,
  configureResidentialWearShader,
} from '../texture-atlas.js';
import { shade } from '../core.js';

/* ─────────────────────────────────── the authored record ──────────────────────────────────
 *
 * CONTRACT.md §6: exported so a critic can read what each archetype is meant to be without
 * running the renderer. `wallFamily` / `roofFamily` are MaterialLibrary families; the eight
 * colours are AUTHORED hexes, before the atlas cell multiplies them and before the per-façade
 * value jitter. The effective albedo each one lands on is in the trailing comment.
 *
 * The record is eight colours and the ninth bucket is not in it, because glazing is a two-ended
 * ramp rather than a colour. Read it off `GLASS_RAMP`: **L* 36.0 at the sill to L* 44.0 at the
 * head**, cool, the same band on all four archetypes. Where that sits in each ladder, and the
 * only three buckets it ever physically abuts:
 *
 *   above `joinery` (the leadlight came) by 12.8 / 8.1 / 13.9 / 12.1 at its DARKEST point
 *   above `shadow`  (the reveal it sits inside) by 6.0 at its darkest
 *   below `trim`    (the sash and architrave around it) by 37 to 39 at its lightest
 *
 * It overlaps the mid band — `garden` 40.3, `wallAlt` 41.1-48.0, `roof` 45.0-52.1 — and that is
 * accepted rather than solved: an opening is always separated from wall, masonry and roof by its
 * own `shadow` reveal, so those three never share an edge with glass, and every one of them
 * carries chroma 45-62 against the pane's 6-11.
 */
export const HOUSE_SURFACE_SCHEME = Object.freeze({
  // 1920s Californian bungalow. Sand stucco over dark red clinker, dark brown shingled roof,
  // pale cream trim, olive-green joinery and gable shingles, warm brown door and deck.
  'bungalow-californian': Object.freeze({
    wallFamily: 'render',
    roofFamily: 'tile',
    wall: '#f6dabe', //    eff L 66.0 C 21.1 h 76 — warm sand stucco, the most chromatic wall
    wallAlt: '#bb5333', // eff L 44.1 C 52.2 h 44 — dark red clinker
    roof: '#695649', //    eff L 30.1 C 13.9 h 63 — dark brown shingle; darkest large area
    trim: '#fce9cb', //    eff L 82.0 C 15.1 h 85 — pale cream
    joinery: '#666125', // eff L 27.9 C 27.1 h 100 — olive green (sashes + gable shingle courses)
    timber: '#c9a074', //  eff L 30.9 C 41.3 h 57 — warm brown door and deck
    garden: '#f2ecb0', //  eff L 40.3 C 45.5 h 130
    shadow: '#766155', //  eff L 30.0 C 13.0 h 63 — see the bucket comment: three jobs, one value
  }),
  // 1930s bayside Brighton bungalow. Terracotta is the loudest cue and must not drift toward
  // the Californian's brown — hue 45 against 63, chroma 55 against 14.
  'bungalow-brighton': Object.freeze({
    wallFamily: 'render',
    roofFamily: 'tile',
    wall: '#fbf0dc', //    eff L 70.9 C 16.4 h 87 — warmer, paler cream roughcast
    wallAlt: '#ab4f3a', // eff L 41.1 C 44.9 h 40 — darker, browner clinker than the Californian
    roof: '#d2623d', //    eff L 45.0 C 54.9 h 45 — terracotta tile
    trim: '#fcedd5', //    eff L 82.9 C 12.1 h 85
    joinery: '#315a2f', // eff L 23.2 C 24.5 h 140 — deep green
    timber: '#c49a6e', //  eff L 29.9 C 40.7 h 57
    garden: '#f2ecb0', //  eff L 40.3 C 45.5 h 130
    shadow: '#766155', //  eff L 30.0 C 13.0 h 63 — see the bucket comment: three jobs, one value
  }),
  // Federation Queen Anne villa, about 1905. The grandest of the four and its colour says so:
  // the highest-chroma masonry and the highest-chroma roof in the set.
  'heritage-federation-villa': Object.freeze({
    wallFamily: 'render',
    roofFamily: 'tile',
    wall: '#f8e8d0', //    eff L 69.0 C 18.2 h 83 — cream roughcast
    wallAlt: '#ca5629', // eff L 48.0 C 61.9 h 47 — red brick, the reference plate's L 47 C 56
    roof: '#f0753e', //    eff L 52.1 C 61.9 h 49 — terracotta tile, lighter and louder than
    //                     Brighton's so the two tile roofs are not one roof twice
    trim: '#fae6c7', //    eff L 81.1 C 15.9 h 83
    joinery: '#275731', // eff L 22.1 C 24.2 h 146 — dark green
    timber: '#b98a5e', //  eff L 27.1 C 40.2 h 55 — stained verandah deck
    garden: '#f2ecb0', //  eff L 40.3 C 45.5 h 130
    shadow: '#766155', //  eff L 30.0 C 13.0 h 63 — see the bucket comment: three jobs, one value
  }),
  // Federation weatherboard cottage, about 1910. The plainest, and restraint is not the same as
  // low contrast: its bottle green sits within 2 L* of the villa's dark green.
  'cottage-federation': Object.freeze({
    wallFamily: 'weatherboard',
    roofFamily: 'corrugated',
    wall: '#f0e2c4', //    eff L 77.0 C 14.2 h 90 — pale cream painted weatherboard
    wallAlt: '#c85824', // eff L 48.0 C 62.3 h 50 — red brick chimney
    roof: '#abb7c1', //    eff L 46.0 C  4.0 h 247 — UNPAINTED GALVANISED IRON. A cool mid grey,
    //                     not a dark grey: the reference plate measures this roof at L 72.0 with
    //                     chroma 0.9, lighter than the brick below it and the only roof in the
    //                     set that is not the darkest large area on its building.
    trim: '#faeed5', //    eff L 83.1 C 12.3 h 89 — the palest trim in the set
    joinery: '#2f5d34', // eff L 23.9 C 24.6 h 143 — bottle green
    timber: '#d8b58c', //  eff L 34.5 C 41.7 h 59 — warm verandah deck
    garden: '#f6f2c0', //  eff L 41.4 C 45.4 h 131
    shadow: '#766155', //  eff L 30.0 C 13.0 h 63 — see the bucket comment: three jobs, one value
  }),
});

/**
 * The second authored green for each archetype. `v.pick` chooses between this and the scheme's
 * own so four parcels of one archetype are four houses, without either choice leaving the dark
 * end of the ladder: every alternate is within 3 L* of its primary.
 */
const JOINERY_ALTERNATE = Object.freeze({
  'bungalow-californian': '#5d5a2c', // eff L 25.6 C 21.6 h 103
  'bungalow-brighton': '#2b5238', //   eff L 20.9 C 18.0 h 151
  'heritage-federation-villa': '#22543a', // eff L 21.3 C 20.3 h 157
  'cottage-federation': '#2a5a3c', //  eff L 23.1 C 21.1 h 153
});

/**
 * Which atlas region each bucket binds to.
 *
 * `region` is an id in ../texture-atlas.js `FAMILY_SOURCE`, `family` is a MaterialLibrary
 * family, and `wear` is the family string handed to `configureResidentialWearShader` — which
 * uses it only to decide which of its masks are live, and whose live set does not match the
 * region names. The three are separate on purpose and the report says why for each.
 */
const BINDING = Object.freeze({
  // Wall. `wear: 'render'` also switches on the roughcast program in the shared wear pass for
  // the three archetypes it is gated to; the cottage is weatherboard and correctly gets none.
  wallRender: { family: 'render', region: 'render', wear: 'render' },
  wallBoard: { family: 'weatherboard', region: 'weatherboard', wear: 'weatherboard' },
  // Masonry. The region differs (clinker carries a wider per-brick spread and a deterministic
  // over-fired header) but the wear family must be `brick`: the shared pass's `isMasonry` list
  // is brick / render / concrete and does NOT include clinker, so passing the region name would
  // silently drop the repointed patch, the damp lift and the chimney-cap soot.
  clinker: { family: 'brick', region: 'clinker', wear: 'brick' },
  brick: { family: 'brick', region: 'brick', wear: 'brick' },
  // Roof.
  tile: { family: 'tile', region: 'tile', wear: 'tile' },
  iron: { family: 'corrugated', region: 'corrugated', wear: 'corrugated' },
  // Paint. See the header for why the two region names are crossed.
  trim: { family: 'painted_metal', region: 'joinery', wear: 'weatherboard' },
  joinery: { family: 'painted_metal', region: 'painted_metal', wear: 'weatherboard' },
  // Depth. Region `render` gives a soffit and a plate chamfer a plaster micro-float; the wear
  // family is `painted_metal`, which is in none of the shared pass's live lists, so the wear
  // program compiles into the shader (the whole lane must share one source — see
  // `HOUSE_PROGRAM_KEY`) and contributes exactly nothing to this bucket.
  shadow: { family: 'render', region: 'render', wear: 'painted_metal' },
  timber: { family: 'timber', region: 'timber', wear: 'timber' },
  garden: { family: 'foliage', region: 'foliage', wear: 'foliage' },
});

/**
 * How each family answers light.
 *
 * `normal` multiplies the atlas's own Sobel strength, which is 2.2 on masonry, 3.8 on
 * weatherboard, 1.6 on tile, 1.0 on render and 0.85 on corrugated. The two numbers that moved
 * against the previous lane are `weatherboard` and `brick`: both sat at 0.45, which is why the
 * baseline's board laps read as ruled lines and its brick as a printed stripe.
 *
 * `corrugated` stays low on purpose. The atlas note is explicit that its height excursion is
 * authored for a normal scale around 0.30-0.45 and that anything more returns the salt-and-
 * pepper a previous seat measured; 0.22 with a 1.0 u-repeat keeps the map a sheet-scale
 * undulation under KIT's modelled rib.
 *
 * `envBase` overrides `MaterialLibrary`'s family default through `get({ envBase })`. It is the
 * one lever that keeps a dark green dark: environment fill is what lifts a saturated dark into
 * mud, so `joinery` runs at 0.62 against the family's own 1.15.
 */
const RESPONSE = Object.freeze({
  render: { roughness: 0.92, metalness: 0.0, envBase: 0.72, normal: 0.30 },
  weatherboard: { roughness: 0.90, metalness: 0.0, envBase: 0.74, normal: 1.00 },
  masonry: { roughness: 0.94, metalness: 0.02, envBase: 0.66, normal: 0.95 },
  tile: { roughness: 0.90, metalness: 0.0, envBase: 0.58, normal: 0.70, specular: 0.30 },
  iron: { roughness: 0.62, metalness: 0.16, envBase: 0.78, normal: 0.22, specular: 0.45 },
  trim: { roughness: 0.95, metalness: 0.0, envBase: 0.80, normal: 0.30, clearcoat: 0.0 },
  joinery: { roughness: 0.86, metalness: 0.02, envBase: 0.62, normal: 0.38, clearcoat: 0.14 },
  shadow: { roughness: 0.96, metalness: 0.0, envBase: 0.60, normal: 0.22 },
  timber: { roughness: 0.82, metalness: 0.0, envBase: 0.62, normal: 0.55 },
  garden: { roughness: 0.95, metalness: 0.0, envBase: 0.42, normal: 0.75 },
});

/* ─────────────────── THE TWO ROOF FAMILIES CARRY NO RHYTHM FROM THIS FILE ──────────────────
 *
 * The rib and the course are MODELLED BY SEAT KIT: 20 ribs per roof plane at high quality
 * (10 mid, 5 low) at 0.060 m depth, and 9 tile courses per plane. This file supplies neither,
 * at either pitch, in either albedo or normal.
 *
 * `corrugated` keeps the region's own [4.0, 1.8] repeat, which is not an accident and is not
 * this seat's to retune: the atlas authors ten undulations per family tile against UVs
 * normalised 0..1 per authored primitive, so 4.0 puts forty relief units across a plane and
 * KIT's twenty ribs give exactly 2.00 atlas undulations per modelled rib. An integer ratio has
 * no beat; a fractional one is what produced the speckle a previous round measured as
 * anisotropy collapsing from 2.49 on the near plane to 1.24 on the far hip. The albedo carries
 * no rib at all — the atlas removed it deliberately — so what is left is the cross-slope wave,
 * the sheet end lap, a slow value drift and rust in the troughs of one band of sheets. The
 * normal scale is held at 0.22, below the 0.30-0.45 the atlas says its height excursion was
 * authored for, so the map sits under the geometry rather than beside it.
 *
 * `tile` likewise keeps [3.0, 1.3] — 7 courses x 1.3 = 9.1 course units against KIT's 9
 * modelled courses, a ratio of 1.01, which drifts by 0.09 of a course across a whole plane and
 * so stays in near-lock rather than beating. Its normal scale is cut from the 1.05 the previous
 * lane used to 0.70: the roll runs ACROSS the course and cannot beat with it, the per-tile
 * value break cannot either, and holding the whole family down keeps the lap relief under the
 * modelled course instead of competing with it.
 */

/**
 * Glazing, as head-to-sill linear radiance rather than one hex.
 *
 * §4 forbids the flat blue rectangle and the flat matte black one, and a pane that falls from sky
 * at the head to the room at the sill is right — that part of the first draft stands, and the
 * chromaticity of both endpoints below is untouched from it. What moved is where the ramp SITS
 * and how far it throws, because the r2 plate made two things measurable that the first draft had
 * no plate to see.
 *
 * **1. The pane was authored darker than the cames laid on it.** `joinery` is the leadlight came,
 * and its effective albedo is L* 23.2 Brighton / 27.9 Californian / 22.1 villa / 23.9 cottage.
 * The old ramp ran L* 37.5 at the head to L* 19.6 at the sill and therefore CROSSED every one of
 * them inside the pane: at uv.y 0.257 on Brighton, 0.417 on the Californian, 0.215 on the villa,
 * 0.282 on the cottage. At that line the came is exactly invisible, and below it the contrast is
 * inverted — a dark green came reading LIGHTER than the glass it is drawn on, which is the
 * opposite of a leadlight. Brighton's bay is the archetype's second identity cue after the roof
 * and it read on the plate as a dark slot.
 *
 * **2. The opening's own reveal already ramps the pane, hard.** Measured off
 * `v340-r2/bungalow-brighton--three-quarter.png` down one sash, rendered L* against authored L*:
 * 56 from 37.5 at the head, 38 from 30.3 at mid-pane, 9 from 19.6 at the sill — a lighting gain
 * that runs 1.35 to 0.70 in (L*+16), a factor of 1.92, or 7.1x in luminance. An authored ramp
 * multiplies on top of that. The old 3.4x authored throw times the reveal's 7.1x is a 24x fall
 * down a 0.9 m pane, and the references do not do that: on `mp-bungalow-brighton` the bay's glass
 * field measures L* 47.0 / 46.9 / 44.8 / 46.4 / 49.8 in five bands head to sill — flat — and the
 * photograph `detail-leadlight-bay-window.png` measures its leadlight toplights at 51.3 / 47.1 /
 * 45.8 while its PLAIN sashes below, in the same frame and the same light, fall 40.1 to 9.5.
 * Textured leadlight glass scatters; it does not mirror the sky at the head and the room at the
 * sill the way a plain sheet does. Both are on this one bucket, so the ramp splits the difference
 * and lets the reveal supply the rest.
 *
 * **The throw could not simply be kept and lifted.** Holding the old 3.40x off a sill high enough
 * to clear the cames (L* 36.0) puts the head at L* 62.2, and the head is where the reveal's gain
 * is highest: rendered, that is L* 89 — the same value the lit render wall measures on the r2
 * plate. A hole in a wall would read as a bright card set into it. So the ramp lifts and shortens
 * together: **head L* 44.0, sill L* 36.0, a 1.54x luminance throw** against the baseline plate's
 * measured 1.2x. Predicted rendered pane, applying the gains above: 65 at the head, 49 at
 * mid-pane, 21 at the sill, against the reference's 45-52 field — and the came, which lies ON the
 * pane and therefore takes exactly the same light, sits 28 / 20 / 9 L* below the glass at those
 * three heights and never crosses it. The reference photograph's own came-to-pane separation is
 * 11-15 L*; `mp-bungalow-brighton`'s is 20-32.
 *
 * Chromaticity is untouched at both ends — each endpoint is its first-draft triple scaled by a
 * scalar, so hue holds at 269 head / 274 sill and the head stays the bluer of the two, which is
 * the sky-at-the-head reading the first draft authored and which survives intact.
 */
const GLASS_RAMP = Object.freeze({
  head: Object.freeze([0.1099, 0.1409, 0.1973]),
  sill: Object.freeze([0.0811, 0.0905, 0.1123]),
  roughness: 0.28,
  envBase: 0.45,
  specular: 0.55,
});

/**
 * Per-archetype numbers the wear program needs and cannot derive.
 *
 * `storey` is the finished-floor-to-eaves height, taken from the ENVELOPE table in ./index.js
 * (`floorY + wallH`). The shared wear pass phases its splash and sill bands on it, so a single
 * storey house wants one period across its own wall rather than the 3.2 m block default.
 *
 * `bellcast` is the height of the moulded course where render meets masonry, in metres above
 * the lot datum. Zero switches the grime band off — the cottage is weatherboard to the ground
 * and has no such course.
 */
const ARCHETYPE_WEAR = Object.freeze({
  'bungalow-californian': { storey: 3.47, bellcast: 1.52 },
  'bungalow-brighton': { storey: 3.53, bellcast: 1.34 },
  'heritage-federation-villa': { storey: 3.95, bellcast: 1.78 },
  'cottage-federation': { storey: 3.22, bellcast: 0.0 },
});

/** How much dirt each bucket is allowed to carry. Paint stays paint. */
const SOIL = Object.freeze({
  wall: 0.95, masonry: 1.05, roof: 0.85, trim: 0.55, joinery: 0.45, none: 0.0,
});

/**
 * One program for the whole lane.
 *
 * `configureResidentialAtlasShader` sets every atlas material's cache key to
 * `residential-atlas-v320`, and three.js computes that key BEFORE `onBeforeCompile` runs and
 * then hands back the first program compiled under it. Two materials with the same key and
 * different shader SOURCE is the collision `configureResidentialShadowFloor` in ../core.js
 * documents at length. This lane adds a source pass of its own, so it takes its own key — which
 * also isolates it from the terrace, walk-up and contemporary lanes, which are live work
 * belonging to another session and share the v320 key between them.
 *
 * The corollary is a rule this file must not break: EVERY atlas bucket here runs the identical
 * pass sequence, including the ones the wear masks do nothing for. All of the wear pass's
 * branching rides uniforms, so one source serves all eight and the key stays honest.
 */
const HOUSE_PROGRAM_KEY = 'v340-houses-surface-r1';

/* ────────────────────────────── the lane's own directed mark ───────────────────────────────
 *
 * The shared wear pass already sites six directed marks — downpipe-collar oxide, gutter-joint
 * rust above the same two stations, a splash grime band with a wavering tide line above the
 * plinth, soot on an upward masonry face above 3.4 m, moss at the flashing junction, and
 * chalking on the sun elevation. It does not site the seventh this seat is asked for: the grime
 * band immediately above a bellcast or string course, where the render sheds its water onto the
 * masonry below and the film slows against the moulding.
 *
 * It is a band with a top edge and a wandering lower one, on vertical wall faces only, at a
 * height this file supplies per archetype. Everything is a uniform, so the source is identical
 * for every material in the lane and the shared key above stays valid.
 */
function configureHouseGrimeBand(material, { active, height, seed, soil }) {
  const existing = material.userData.v340GrimeBand;
  if (existing) {
    existing.ddHouseGrimeOn.value = active ? 1 : 0;
    existing.ddHouseGrimeY.value = height;
    existing.ddHouseGrimeSeed.value = seed;
    existing.ddHouseGrimeSoil.value = soil;
    material.needsUpdate = true;
    return;
  }
  const uniforms = {
    ddHouseGrimeOn: { value: active ? 1 : 0 },
    ddHouseGrimeY: { value: height },
    ddHouseGrimeSeed: { value: seed },
    ddHouseGrimeSoil: { value: soil },
  };
  material.userData.v340GrimeBand = uniforms;

  const previousCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (previousCompile) previousCompile(shader, renderer);
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec3 ddHousePos;\nvarying vec3 ddHouseNrm;',
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n\tddHousePos = transformed;\n\tddHouseNrm = objectNormal;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
varying vec3 ddHousePos;
varying vec3 ddHouseNrm;
uniform float ddHouseGrimeOn;
uniform float ddHouseGrimeY;
uniform float ddHouseGrimeSeed;
uniform float ddHouseGrimeSoil;`,
    );
    // `<color_fragment>` and `<metalnessmap_fragment>` are the two anchors in meshphysical's
    // main() that neither the atlas pass nor the wear pass rewrites, and they sit either side of
    // `roughnessFactor`'s declaration. Anchoring on `<map_fragment>` or `<roughnessmap_fragment>`
    // would match nothing here — the atlas pass has already replaced both — and a failed
    // `String.replace` returns the subject unchanged without reporting, which is how two earlier
    // passes in this stack sat dead for thirty rounds.
    if (!shader.fragmentShader.includes('#include <color_fragment>')
      || !shader.fragmentShader.includes('#include <metalnessmap_fragment>')) {
      console.error('[houses] grime band: missing shader anchor — pass not applied');
      return;
    }
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
  // Vertical faces only: a bellcast throws water off a wall, it does not stain a soffit.
  vec3 ddGrimeAbs = abs(normalize(ddHouseNrm + vec3(0.0, 1e-5, 0.0)));
  float ddGrimeUpright = 1.0 - smoothstep(0.35, 0.62, ddGrimeAbs.y);
  // The coordinate that runs ACROSS whichever elevation this fragment is on, so the wander is
  // the same size on a bay and on a flank.
  float ddGrimeAlong = ddGrimeAbs.x > ddGrimeAbs.z ? ddHousePos.z : ddHousePos.x;
  // A hard top edge at the course and a soft, wavering bottom: water leaves the moulding at one
  // height and runs out at several. A gradient with no edge is a vignette, not a band.
  float ddGrimeFoot = ddHouseGrimeY - 0.30
    - 0.075 * sin(ddGrimeAlong * 2.3 + ddHouseGrimeSeed * 21.0)
    - 0.040 * sin(ddGrimeAlong * 6.1 - ddHouseGrimeSeed * 5.0);
  float ddGrimeBand = smoothstep(ddHouseGrimeY + 0.055, ddHouseGrimeY - 0.010, ddHousePos.y)
    * smoothstep(ddGrimeFoot, ddGrimeFoot + 0.20, ddHousePos.y);
  float ddGrimeRun = 0.55 + 0.45
    * pow(max(0.0, sin(ddGrimeAlong * 3.1 + ddHouseGrimeSeed * 9.0)), 2.0);
  float ddHouseGrime = ddHouseGrimeOn * ddGrimeUpright * ddGrimeBand * ddGrimeRun
    * ddHouseGrimeSoil;
  // A warm loss rather than a grey overlay: the wall is dirty, not repainted.
  diffuseColor.rgb *= vec3(1.0 - ddHouseGrime * 0.075, 1.0 - ddHouseGrime * 0.088,
    1.0 - ddHouseGrime * 0.104);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <metalnessmap_fragment>',
      `#include <metalnessmap_fragment>
  roughnessFactor = clamp(roughnessFactor + ddHouseGrime * 0.16, 0.0, 1.0);`,
    );
  };
  material.customProgramCacheKey = () => HOUSE_PROGRAM_KEY;
  material.needsUpdate = true;
}

/* ────────────────────────── RECESSION — the §2.9 pass, and why it is here ──────────────────
 *
 * Round 3 measured the same fault four times, once per archetype: a recess with no recession.
 * The cottage's verandah rendered BRIGHTER than its own sunlit façade, Brighton's porch at
 * 0.00 stops under its wall, the villa's at 0.17 against the reference's 2.54. Three graded
 * dimensions were paying for it — a pierced valance needs something dark behind it, and the
 * villa had seven surfaces including the footpath inside 0.13 L of each other.
 *
 * **The reference does not win this with a global value drop.** A critic measured its own
 * global offset at +0.21 stops. It wins with the verandah beam's cast shadow, corner ambient
 * occlusion, and a dark door. Measured on `v340-r3`, we had the first one only in the largest
 * sizes: Brighton's chimney throws a 2.54-stop shadow across its own roof, so the shadow map
 * is not broken. What is missing is everything the shadow map cannot express — the sky and
 * the ground bounce reaching into a pocket the roof over it should have closed.
 *
 * Four lights and an environment, and only ONE of them is occluded by anything:
 *
 *   key     3.96  DirectionalLight, castShadow  — the only caster in the rig
 *   fill    0.82  DirectionalLight, no shadow   — pours through a verandah roof
 *   bounce  0.54  DirectionalLight, no shadow   — pours up through a verandah floor
 *   rim     0.19  DirectionalLight, no shadow
 *   IBL     env   image-based, occluded by nothing at all, by construction
 *
 * At the lab's time of day the front elevation sits at N·L 0.12 — eight degrees off parallel
 * to the sun — so the key is a small part of what lights it whether it is shadowed or not.
 * Removing the key from a recess is worth about 0.4 stops. The other 1.6 has to come off the
 * unoccluded terms, and neither `lighting.js` nor `post.js` can do that without changing every
 * other building on the board and in a parallel session's commercial, civic and industrial
 * lanes. So it is done here, in the lane's own shader, where it reaches these four archetypes
 * and nothing else.
 *
 * TWO SIGNALS, both already on the fragment and neither costing a texture fetch:
 *
 *   1. **The key's own shadow term.** A point the sun cannot see because a verandah roof is in
 *      the way is a point most of the sky cannot see either. `lights_fragment_begin` computes
 *      that number and throws it away into `directLight.color`; the pass below captures it on
 *      the way past. Zero extra shadow lookups.
 *   2. **A downward-facing normal.** A verandah ceiling, an eaves soffit, a window-head reveal
 *      and the underside of a window hood see no sky by geometry alone, and the environment
 *      map has no way to know it.
 *
 * THE TRAP, AND IT IS NAMED IN THE SPEC. V3.20 §6.1 was written after a brief describing a
 * verandah as "a void" produced a black-crushed verandah that erased three rounds of lace
 * work, and §2.9 requires the verandah wall, the door and the post bases to stay READABLE
 * inside the shadow. Measured on `v340-r3` all four plates are already CLEANER than the
 * reference below L 0.01 — villa 1.14 % against 1.82 %, cottage 1.51 against 2.26 — so the
 * fault is the opposite one and there is real headroom. Three things keep this pass out of
 * the trap:
 *
 *   - it is a MULTIPLIER ON LIGHT, not a floor on albedo, so a surface keeps its own colour
 *     and its own texture inside the shadow;
 *   - `floor` clamps the total loss, so nothing in the lane can fall past a fixed fraction of
 *     its unoccluded value however the two signals stack;
 *   - the direct term is cut far less than the indirect one, because the ground bounce is
 *     exactly what keeps a post base and a deck board readable in a recess.
 *
 * Every number is a uniform and every bucket compiles the identical source, so the lane's one
 * program key stays honest — see `HOUSE_PROGRAM_KEY`.
 */
const RECESS = Object.freeze({
  // What a fully key-occluded fragment loses. `shade` weights the shadow signal, `down` the
  // sky-facing one; they sum and clamp, so a shaded soffit is not darkened twice.
  shade: 1.0,
  down: 0.90,
  // The loss itself, split. Indirect is sky and IBL and is what a roof over the head actually
  // stops. Direct is fill, rim and ground bounce, cut far more gently: §2.9's readability
  // clause lives on this number.
  indirect: 0.60,
  direct: 0.28,
  // Nothing in the lane falls below this fraction of its unoccluded value. The clamp, not a
  // hope.
  floor: 0.33,
  // THE DARK GUARD, and it was measured rather than reasoned. The first pass ran without it
  // and put every plate PAST the reference below L 0.01 — villa 3.90 % against the bar's
  // 1.82 %, Californian 4.95 % against 2.73 % — which is the V3.20 §6.1 trap, arrived at from
  // the other side. Masking the crushed pixels and looking at where they were settled what to
  // do about it: they were not the verandah wall, which is what the pass is for. They were the
  // recessed sashes, the dark-green palisade and the ironwork — the families whose ALBEDO is
  // already at the bottom of the ladder, losing the same fraction of light as a cream wall and
  // arriving at zero because they started three stops lower.
  //
  // So the loss is scaled by the surface's own reflectance: a bucket at the pale end takes the
  // full occlusion, a bucket at the dark end keeps `darkFloor` of the fill that is holding it
  // off black. This is not a floor on albedo and it repaints nothing — the dark families still
  // darken in a recess, by roughly half as much as the wall around them, which is what keeps a
  // came visible against its pane and a post base visible against its deck.
  darkLo: 0.015,
  darkHi: 0.13,
  darkFloor: 0.45,
});

/**
 * Per-bucket override. The roof is the one family that already had its recession — Brighton's
 * chimney measures a 2.54-stop shadow across its own tiles on the r3 plate — so it takes half
 * the shadow weight and none of the soffit term, and a roof valley does not go to pitch.
 * `garden` keeps the full shadow term (the reference lots carry a dark building shadow across
 * the lawn) and loses the soffit term, which a lawn has no use for.
 */
const RECESS_BY_BUCKET = Object.freeze({
  roof: { shade: 0.45, down: 0.0, indirect: 0.48, direct: 0.20, floor: 0.38 },
  garden: { shade: 0.85, down: 0.0 },
  // Glazing takes the shadow term and little else. A pane is already the darkest thing on the
  // frontage before any occlusion — `GLASS_RAMP` runs L* 36 to 44 — and the crush map put a
  // third of the first pass's black pixels inside four recessed sashes.
  glass: {
    down: 0.0, indirect: 0.42, direct: 0.16, floor: 0.46, darkFloor: 0.70,
  },
});

/**
 * `lights_fragment_begin`, with the directional shadow term captured instead of discarded.
 *
 * Built from `THREE.ShaderChunk` at call time rather than pasted in, so it cannot drift from
 * the three version actually vendored. The statement it rewrites is
 *
 *     directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( … ) : 1.0;
 *
 * inside the DIRECTIONAL light loop — the spot and point loops call `getShadow( spotShadowMap`
 * and `getPointShadow`, so the anchor below matches the directional one and only that one. The
 * loop is unrolled by three AFTER `onBeforeCompile`, and the unroller repeats the snippet
 * without braces, so `ddDirShadow` is declared once outside rather than in the body. Only the
 * key casts a shadow in this rig, so the running product is the key's own term; multiplying
 * rather than indexing means it stays correct whatever order the renderer sorts the lights in.
 *
 * Returns null if the anchor is gone, and the caller reports rather than shipping a dead pass.
 */
function lightsChunkWithShadowCapture() {
  const source = THREE.ShaderChunk?.lights_fragment_begin;
  if (typeof source !== 'string') return null;
  const anchor = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]';
  const start = source.indexOf(anchor);
  if (start < 0) return null;
  const tail = source.indexOf(': 1.0', start);
  if (tail < 0) return null;
  const end = source.indexOf(';', tail);
  if (end < 0) return null;
  const statement = source.slice(start, end + 1);
  const expression = statement
    .replace('directLight.color *= ', '')
    .replace(/;\s*$/, '');
  const replacement = `ddDirShadow = ${expression};
		directLight.color *= ddDirShadow;
		ddKeyShadow *= ddDirShadow;`;
  return source.slice(0, start) + replacement + source.slice(end + 1);
}

/** The declarations the capture needs, and the uniform block the loss reads. */
const RECESS_UNIFORM_DECL = `
uniform float ddRecessShade;
uniform float ddRecessDown;
uniform float ddRecessIndirect;
uniform float ddRecessDirect;
uniform float ddRecessFloor;
uniform vec3 ddRecessDark;`;

/**
 * The loss itself. `ddCover` is the sky-occlusion estimate, 0 in the open and 1 in a closed
 * pocket; everything after it is arithmetic on light that has already been gathered.
 *
 * `<aomap_fragment>` is the anchor because it is where three itself applies occlusion to
 * indirect light, it sits after `lights_fragment_end` so both accumulators are complete, and
 * nothing else in this stack — not the atlas pass, not the wear pass, not the grime band —
 * touches it.
 */
function recessLossSource(withNormal) {
  const down = withNormal
    ? 'smoothstep( -0.06, -0.70, normalize( ddHouseNrm + vec3( 0.0, 1e-5, 0.0 ) ).y )'
    : '0.0';
  return `
  float ddShaded = 1.0 - clamp( ddKeyShadow, 0.0, 1.0 );
  float ddDownFace = ${down};
  float ddCover = clamp( ddShaded * ddRecessShade + ddDownFace * ddRecessDown, 0.0, 1.0 );
  // The dark guard. ddRecessDark is ( lo, hi, floor ) — see RECESS.
  // (No backticks in this comment: it lives inside a JS template literal.)
  float ddAlbedo = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  ddCover *= mix( ddRecessDark.z, 1.0,
    smoothstep( ddRecessDark.x, ddRecessDark.y, ddAlbedo ) );
  float ddRecessIn = max( 1.0 - ddRecessIndirect * ddCover, ddRecessFloor );
  float ddRecessDi = max( 1.0 - ddRecessDirect * ddCover, ddRecessFloor );
  reflectedLight.indirectDiffuse *= ddRecessIn;
  reflectedLight.indirectSpecular *= ddRecessIn;
  reflectedLight.directDiffuse *= ddRecessDi;
  reflectedLight.directSpecular *= ddRecessDi;`;
}

/**
 * Hang the recession pass on one material. Re-entrant through the same `userData` guard the
 * rest of this file uses: a second copy would declare `ddKeyShadow` twice at function scope
 * and fail to link.
 *
 * `withNormal` is false for glazing, which carries no `ddHouseNrm` varying — a pane in a
 * reveal still takes the shadow term, which is the half that matters on an opening.
 */
function configureHouseRecess(material, profile, withNormal) {
  const merged = { ...RECESS, ...(profile ?? {}) };
  const existing = material.userData.v340Recess;
  if (existing) {
    existing.ddRecessShade.value = merged.shade;
    existing.ddRecessDown.value = merged.down;
    existing.ddRecessIndirect.value = merged.indirect;
    existing.ddRecessDirect.value = merged.direct;
    existing.ddRecessFloor.value = merged.floor;
    existing.ddRecessDark.value.set(merged.darkLo, merged.darkHi, merged.darkFloor);
    material.needsUpdate = true;
    return;
  }
  const uniforms = {
    ddRecessShade: { value: merged.shade },
    ddRecessDown: { value: merged.down },
    ddRecessIndirect: { value: merged.indirect },
    ddRecessDirect: { value: merged.direct },
    ddRecessFloor: { value: merged.floor },
    ddRecessDark: {
      value: new THREE.Vector3(merged.darkLo, merged.darkHi, merged.darkFloor),
    },
  };
  material.userData.v340Recess = uniforms;

  const previousCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (previousCompile) previousCompile(shader, renderer);
    Object.assign(shader.uniforms, uniforms);

    const captured = lightsChunkWithShadowCapture();
    if (!captured || !shader.fragmentShader.includes('#include <lights_fragment_begin>')) {
      console.error('[houses] recess: no shadow-capture anchor — pass not applied');
      return;
    }
    if (!shader.fragmentShader.includes('#include <aomap_fragment>')) {
      console.error('[houses] recess: missing <aomap_fragment> anchor — pass not applied');
      return;
    }
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      () => `#include <common>${RECESS_UNIFORM_DECL}`,
    );
    // `float` declarations outside the unrolled loop: see lightsChunkWithShadowCapture().
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_begin>',
      () => `float ddKeyShadow = 1.0;\n\tfloat ddDirShadow = 1.0;\n${captured}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <aomap_fragment>',
      () => `#include <aomap_fragment>${recessLossSource(withNormal)}`,
    );
  };
  material.needsUpdate = true;
}

/**
 * One bucket: fetch, bind its atlas region, set its response, and hang the wear masks on it.
 *
 * Re-entrant. `MaterialLibrary.get()` caches on `family::variant::overrides`, so a second
 * `housePalette()` call for one archetype/district/façade hands back the SAME object; without
 * the guard the second pass would append a second `varying vec3 ddHousePos;` at global scope
 * and the program would fail to link — on the wall, the roof and the trim at once.
 */
function bucket(materials, atlas, {
  binding, color, response, variant, wear, recess,
}) {
  const r = response;
  const material = materials.get(binding.family, {
    variant,
    color,
    roughness: r.roughness,
    metalness: r.metalness,
    envBase: r.envBase,
  });

  // THE GUARD IS LOAD-BEARING AND COVERS THE WHOLE CONFIGURE BLOCK, NOT JUST THE ATLAS BIND.
  // `configureResidentialWearShader` carries no re-entrancy guard of its own: it captures
  // `material.onBeforeCompile` and reassigns, so a second call on one material chains a second
  // copy of the wear pass and the program gets `varying vec3 ddResidentialPosition;` declared
  // twice at global scope. That is a link failure on the wall, the roof and the trim at once,
  // and it would never show in a node smoke test because nothing compiles there.
  if (material.userData.v340Surface) return material;
  material.userData.v340Surface = { region: binding.region, variant };

  if (applyResidentialAtlas(material, binding.region, atlas)) {
    // `null` repeat: every family keeps the atlas's own authored repeat. The two that matter
    // are the roof families, and the reason they are not overridden is above `RESPONSE`.
    // `worldSpaceBrick` for masonry puts one drawn brick at 230 x 76 mm of real wall however
    // the caller authored its UVs, which is the only reason a chimney and a boundary wall
    // course at the same size.
    configureResidentialAtlasShader(
      material, atlas, binding.region, null,
      binding.region === 'brick' || binding.region === 'clinker',
    );
  }
  // The atlas replaces `normalMap` with its own, so the scale is set after the bind.
  if (material.normalScale) material.normalScale.set(r.normal, r.normal);
  else material.normalScale = new THREE.Vector2(r.normal, r.normal);
  if (r.specular !== undefined) material.specularIntensity = r.specular;
  // `painted_metal` carries a 0.35 clearcoat in the family spec. A barge board is painted
  // timber, not a car panel; the dark joinery keeps a trace of enamel and the trim keeps none.
  if (r.clearcoat !== undefined) {
    material.clearcoat = r.clearcoat;
    material.clearcoatRoughness = 0.5;
  }

  configureResidentialWearShader(material, binding.wear, wear.profile);
  configureHouseGrimeBand(material, wear.grime);
  // Last in the chain, and it has to be: it reads `ddHouseNrm`, which the grime pass declares,
  // and it rewrites `<lights_fragment_begin>` and `<aomap_fragment>`, which nothing above it
  // touches. Every bucket takes the identical source and differs only in five uniforms.
  configureHouseRecess(material, recess, true);
  material.customProgramCacheKey = () => HOUSE_PROGRAM_KEY;
  material.needsUpdate = true;
  return material;
}

/**
 * Glazing. No atlas — the `glass` family carries no texture set, so the pane's whole read is
 * the authored ramp plus the physical material's own Schlick term.
 *
 * The ramp is keyed to `uv.y`, which runs 0 at the sill to 1 at the head on every vertical face
 * the residential primitives produce, and which is the only per-pane signal that survives
 * index.js's merge (it deletes every attribute except position, normal and uv). A pane whose uv
 * is constant across the primitive carries no height signal at all; `fwidth` is exactly zero
 * there and only there, so those fall back to a fixed point on the ramp — 0.62 up it, effective
 * albedo L* 41.8 — rather than to a black card.
 */
function glassBucket(materials, variant) {
  const material = materials.get('glass', {
    variant,
    // Inert: the ramp below overwrites `diffuseColor.rgb` outright. Authored dark and cool
    // anyway, so a pane whose shader pass ever failed to anchor would degrade to a dark window
    // rather than to a white card.
    color: '#2c3a42',
    roughness: GLASS_RAMP.roughness,
    metalness: 0.0,
    opacity: 1.0,
    envBase: GLASS_RAMP.envBase,
  });
  if (material.userData.v340Glass) return material;
  material.userData.v340Glass = true;
  material.ior = 1.5;
  material.specularIntensity = GLASS_RAMP.specular;
  material.specularColor = new THREE.Color('#ccd4d8');

  const uniforms = {
    ddPaneHead: { value: new THREE.Vector3(...GLASS_RAMP.head) },
    ddPaneSill: { value: new THREE.Vector3(...GLASS_RAMP.sill) },
  };
  const previousCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (previousCompile) previousCompile(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nvarying float ddPaneT;',
    );
    // `attribute vec2 uv;` is unconditional in three's vertex prefix, so this needs no USE_UV
    // guard and costs nothing on a material that carries no map.
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n\tddPaneT = uv.y;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nvarying float ddPaneT;\nuniform vec3 ddPaneHead;\nuniform vec3 ddPaneSill;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
  float ddPaneValid = step( 1e-6, fwidth( ddPaneT ) );
  float ddPane = mix( 0.62, clamp( ddPaneT, 0.0, 1.0 ), ddPaneValid );
  diffuseColor.rgb = mix( ddPaneSill, ddPaneHead, smoothstep( 0.04, 0.96, ddPane ) );`,
    );
    // The roughness floor lives in the shader rather than on `material.roughness`, because three
    // refreshes that uniform from the material on every version bump and a later setter would
    // win. `max` so nothing downstream can turn the pane into a mirror of the studio dome, which
    // is what made an authored ramp invisible on the previous lane.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
  roughnessFactor = max( roughnessFactor, ${GLASS_RAMP.roughness.toFixed(2)} );`,
    );
  };
  // A pane sitting in a reveal has to lose the sky the reveal is hiding from it, or a window
  // in a verandah reads as a lit card set into a dark wall. No normal term: glazing carries no
  // `ddHouseNrm` varying and a pane is vertical anyway.
  configureHouseRecess(material, RECESS_BY_BUCKET.glass, false);
  material.customProgramCacheKey = () => 'v340-houses-glass-r1';
  material.needsUpdate = true;
  return material;
}

/**
 * The nine buckets for one archetype. CONTRACT.md §4 — nine, and there is no tenth.
 *
 * Pure apart from the `MaterialLibrary` cache and deterministic: the same arguments return the
 * same materials, and every variation comes from `v` (salts 1500-1599) and nowhere else.
 *
 * @param {import('../../materials.js').MaterialLibrary} materials
 * @param {{ id: string, districtId: string|null, facade: number,
 *           v: ReturnType<import('../core.js').variation> }} opts
 */
export function housePalette(materials, { id, districtId, facade, v }) {
  const scheme = HOUSE_SURFACE_SCHEME[id] ?? HOUSE_SURFACE_SCHEME['cottage-federation'];
  const wearSpec = ARCHETYPE_WEAR[id] ?? ARCHETYPE_WEAR['cottage-federation'];
  const atlas = getResidentialTextureAtlas(materials);
  const key = `v340|${id}|${districtId ?? 'none'}|f${facade}`;

  /* One weather seed for the whole building, not one per bucket. The shared wear pass turns
   * `seed` into two downpipe stations, and a streak that lands at x = -2.4 on the wall has to
   * land at x = -2.4 on the fence capping under it or it is two unrelated marks rather than one
   * downpipe. Marks are a property of the building. */
  const weatherSeed = v.unit(1510);
  const patch = {
    patchX: v.range(1531, -2.4, 2.4),
    patchY: v.range(1532, 0.75, 2.05),
    patchWidth: v.range(1533, 0.85, 1.60),
  };
  const grimeSeed = v.unit(1520);

  /** The wear argument for one bucket: the shared pass's profile plus this lane's own band. */
  const wearFor = (soil, grimeActive) => ({
    profile: {
      archetypeId: id,
      seed: weatherSeed,
      soil,
      storey: wearSpec.storey,
      ...patch,
      // Left null deliberately. `targetColor` drives `ddResidentialTargetRatio`, which divides
      // a wanted colour by `material.color` inside the shader — a second colour authority on
      // top of this file's, and this file is meant to be the only one.
      targetColor: null,
    },
    grime: {
      active: grimeActive && wearSpec.bellcast > 0.01,
      height: wearSpec.bellcast,
      seed: grimeSeed,
      soil: 1.0,
    },
  });

  const wallBinding = scheme.wallFamily === 'weatherboard'
    ? BINDING.wallBoard : BINDING.wallRender;
  const wallResponse = scheme.wallFamily === 'weatherboard'
    ? RESPONSE.weatherboard : RESPONSE.render;
  const masonryBinding = id === 'bungalow-californian' || id === 'bungalow-brighton'
    ? BINDING.clinker : BINDING.brick;
  const roofBinding = scheme.roofFamily === 'corrugated' ? BINDING.iron : BINDING.tile;
  const roofResponse = id === 'bungalow-californian'
    ? { ...RESPONSE.tile, normal: 0.18 }
    : scheme.roofFamily === 'corrugated' ? RESPONSE.iron : RESPONSE.tile;

  // Per-façade value jitter. Deliberately small — a façade's real variation is ornament and
  // planting, and every point of value spent here comes out of the ladder the whole file exists
  // to build. `shade` multiplies toward black below zero and lerps toward white above it.
  //
  // FAÇADE 0 TAKES THE AUTHORED COLOUR EXACTLY. It is the plate a critic grades, so the
  // canonical colour of each archetype belongs on it and the street's spread goes on 1-3. A
  // graded plate that happens to have drawn +3 L* on its clinker and the alternate green is a
  // plate nobody authored, and it is measured against a scheme it does not carry.
  const spread = facade === 0 ? 0 : 1;
  const wallColor = shade(scheme.wall, spread * v.range(1500, -0.035, 0.035));
  const wallAltColor = shade(scheme.wallAlt, spread * v.range(1501, -0.045, 0.030));
  const roofColor = shade(scheme.roof, spread * v.range(1502, -0.030, 0.030));
  const trimColor = shade(scheme.trim, spread * v.range(1503, -0.020, 0.020));
  const joineryColor = facade === 0 ? scheme.joinery
    : v.pick(1504, [scheme.joinery, JOINERY_ALTERNATE[id] ?? scheme.joinery]);
  const gardenColor = shade(scheme.garden, spread * v.range(1505, -0.030, 0.030));
  const timberColor = shade(scheme.timber, spread * v.range(1506, -0.040, 0.040));

  return {
    /** Roughcast, stucco, painted weatherboard, and the gable render faces. */
    wall: bucket(materials, atlas, {
      binding: wallBinding,
      color: wallColor,
      response: wallResponse,
      variant: `${key}|wall`,
      // The grime band is the wall's, because the wall is what sheds onto the course below it.
      wear: wearFor(SOIL.wall, true),
    }),
    /** All masonry: base course, chimney shafts, pier pedestals, the low boundary wall. */
    wallAlt: bucket(materials, atlas, {
      binding: masonryBinding,
      color: wallAltColor,
      response: RESPONSE.masonry,
      variant: `${key}|wallAlt`,
      wear: wearFor(SOIL.masonry, false),
    }),
    /** The roof covering only, including the bullnose verandah roof and the ridge capping. */
    roof: bucket(materials, atlas, {
      binding: roofBinding,
      color: roofColor,
      response: roofResponse,
      variant: `${key}|roof`,
      // No repeat override on either roof family — see the block comment above.
      wear: wearFor(SOIL.roof, false),
      recess: RECESS_BY_BUCKET.roof,
    }),
    /** The pale cream family, and it does most of the ornamental work. */
    trim: bucket(materials, atlas, {
      binding: BINDING.trim,
      color: trimColor,
      response: RESPONSE.trim,
      variant: `${key}|trim`,
      wear: wearFor(SOIL.trim, false),
    }),
    /** The dark accent that carries the frontage's contrast. */
    joinery: bucket(materials, atlas, {
      binding: BINDING.joinery,
      color: joineryColor,
      response: RESPONSE.joinery,
      variant: `${key}|joinery`,
      wear: wearFor(SOIL.joinery, false),
    }),
    /** Glazing. */
    glass: glassBucket(materials, `${key}|glass`),
    /**
     * Depth, and the hardest-worked bucket in the nine. It carries FOUR jobs in three different
     * lighting situations, and the GARDEN seat's bed soil is the one that constrains it most:
     *
     *   1. opening liners, reveals, the recess behind a valance   — deep shade
     *   2. the verandah ceiling and eaves undersides              — deep shade
     *   3. the lot plate's chamfered edge                         — vertical, mostly sky fill
     *   4. garden bed soil, with shrubs standing in it            — full sun, horizontal
     *
     * Measured on the reference plates, those four land at very different plate values: villa
     * verandah ceiling L 18.7, villa plate chamfer L 17.1, cottage bed soil L 34.7 C 29.4 at
     * hue 74. They differ because the LIGHT differs, not because the albedo does, so one warm
     * dark-brown albedo serves all four — and the arithmetic says which one. Dividing each
     * reference value by a plausible gain for its own orientation (about 2.2x on a sunlit
     * horizontal bed, 1.0 on the chamfer, 0.4 in a recess) implies albedos of L* 22.9, 20.1 and
     * 32.8. This is authored at L* 30.0 C 13.0 hue 63, between them and biased toward the two
     * that have to survive daylight.
     *
     * A REAL SURFACE THAT TAKES LIGHT. The previous lane authored this bucket at `#080a0a` with
     * zero specular and `toneMapped = false`, so it clamped to black whatever the key did and
     * every verandah in the set crushed to a void. Nothing here clamps: `toneMapped` is left at
     * three's default, specular is the family's own, and `envBase` is held at 0.60 rather than
     * cut — the environment fill is precisely what keeps a recess readable as a recess and a
     * bed readable as soil rather than as a hole cut in the lawn.
     */
    shadow: bucket(materials, atlas, {
      binding: BINDING.shadow,
      color: scheme.shadow,
      response: RESPONSE.shadow,
      variant: `${key}|shadow`,
      wear: wearFor(SOIL.none, false),
    }),
    /** Warm unpainted timber: verandah deck boards, the front door, tree trunks. */
    timber: bucket(materials, atlas, {
      binding: BINDING.timber,
      color: timberColor,
      response: RESPONSE.timber,
      variant: `${key}|timber`,
      wear: wearFor(SOIL.none, false),
    }),
    /**
     * One green family for lawn, shrub masses and hedges.
     *
     * The separation between them is form and occlusion, so the response is tuned to reward
     * that rather than to fill flat: the foliage region's leaf-scale breakup runs at a normal
     * scale of 0.75, and `envBase` is held down at 0.42 so a blue sky fill does not wash the
     * chroma out of a rounded shrub's shaded side.
     */
    garden: bucket(materials, atlas, {
      binding: BINDING.garden,
      color: gardenColor,
      response: RESPONSE.garden,
      variant: `${key}|garden`,
      wear: wearFor(SOIL.none, false),
      recess: RECESS_BY_BUCKET.garden,
    }),
  };
}
