// District Deck V3.50 — modern lane surfaces. Nine buckets, atlas-bound.
// Nothing else in this lane creates a material.

import * as THREE from 'three';
import { restyleColour, readRestyle } from '../../style/restyle.js';
import {
  getResidentialTextureAtlas,
  applyResidentialAtlas,
  configureResidentialAtlasShader,
  configureResidentialWearShader,
} from '../texture-atlas.js';

/**
 * V3.70 r2 — the nine buckets, authored as TARGET EFFECTIVE ALBEDO rather than as the colour
 * bound to the material.
 *
 * **What round 1 got right, and the step it was missing.** r1 correctly identified that the
 * post grade multiplies hue at the bottom of the curve and correctly stopped authoring near
 * black. Its plate still came back with a roof at `rgb(25,24,45)`, a door at `rgb(0,0,0)`, a
 * pane at luma 0.5 and a batten screen at `rgb(98,0,0)`. The r1 critic's summary is the right
 * one — the hue was fixed by darkening past the point where hue exists — and the mechanism is
 * two multiplications that sit between the authored hex and the pixel, neither of which r1
 * modelled:
 *
 * 1. **The family map.** `materials.js:_create()` attaches the family's procedural albedo map
 *    AND keeps the authored colour, and three multiplies them. The multiplier is not close to
 *    one and it is not grey. Measured by `tests/v370-l1-map-mean.mjs` (linear means):
 *
 *      render        0.607 0.555 0.459      painted_metal  0.680 0.540 0.320
 *      brick         0.402 0.275 0.219      timber         0.325 0.128 0.036
 *      slate         0.126 0.137 0.180      foliage        0.056 0.177 0.035
 *
 *    `timber` divides blue by 27.7 relative to red. That single number IS the crimson batten
 *    screen the r1 critic measured at chroma 80 — authored `#9d5b2c`, effective `rgb(93,31,3)`.
 *    `slate` divides value by about 7.5 and tilts cool, which is the charcoal roof arriving at
 *    luma 4–26 with blue on top. r1 found this twice by plate and fixed it twice by hand; this
 *    table divides it out once, for every bucket, at author time.
 *
 * 2. **The transfer.** `tests/v370-l1-transfer.mjs` re-implements AgX plus the residential
 *    lab's grade LUT, parameter for parameter, and inverts it. The result that governs this
 *    file: the whole of the reference's dark half — plate values 26 to 90 — lives inside
 *    scene-linear radiance **0.012 to 0.021**. Below 0.008 the frame is black; between 0.004
 *    and 0.010 a spectrally NEUTRAL radiance comes out as `(0,0,11)` to `(13,28,61)`, because
 *    the grade's lift splits 0.70/0.86/1.40 across the channels and the 1.46 contrast about
 *    pivot 0.30 then drives red and green negative while blue survives.
 *
 *    Two consequences, and they are the round's palette rules:
 *
 *    *   **A dark surface cannot be placed by albedo alone.** A factor of 1.7 in radiance
 *        covers a factor of 3.4 in plate value, so an unknown irradiance term — which is what
 *        a reveal, a soffit or a shaded elevation is — moves a bucket across the whole band.
 *        Every bucket that has to render dark therefore carries an `emissive` FLOOR: it is
 *        additive, independent of the key, the environment and the shadow term, and it is the
 *        only lever in the renderer that can put a value in that band deterministically.
 *    *   **The darks are authored warm.** Not as taste: at plate value 23 the radiance that
 *        lands NEUTRAL is `(0.0114, 0.0107, 0.0079)`, a red-to-blue ratio of 1.45. Author it
 *        flat and the grade returns navy.
 *
 * **The targets are measured off `_reference-clean/`,** which is the pack the blind bar now
 * uses, and they differ from the numbers r1 worked to — r1 sampled `_reference-v350/`, whose
 * lit cream wall reads Y 92 where the clean pack reads Y 179–221. Acting on the older figure
 * would have darkened the one bucket that is already right. Region medians, clean pack:
 *
 *   cream wall lit  215–227    roof (dark metal)  66–100    brick / podium   49–65
 *   glass           21–88      fence paling       45–48     door timber      32–60
 *   lawn            100–110    shrub              114       paved ground     116–199
 *
 * Each entry below is the effective albedo the surface should have AFTER the family map, given
 * as an sRGB hex. `compensated()` divides the family mean back out. `emissive` is scene-linear
 * and is applied directly.
 *
 * The r10 note that follows supersedes this one on WHICH hex each bucket takes. The mechanism
 * described above — the family map, the transfer, and the rule that darks are authored warm —
 * is unchanged and is what r10 authors under.
 */

/**
 * **V3.70 r10 — six palettes, not one. This table WAS the §2.10 fault.**
 *
 * The r9 critic measured the cause exactly and it is worth restating because the previous
 * version of this comment did not contain it: **five of the six ids shared a single palette to
 * within ±2 per channel** — roof `#242726`/`#232625` on all six, trim `#5d5b4f`–`#605e52`,
 * joinery `#2a2622`–`#2c2824`, garden `#1a3a04`–`#1c3c04`, shadow `#19140e`–`#1b160f` — and
 * within that one scheme six of the eight buckets sat between hue 24° and 52°. Six buildings
 * cast from one warm material is what a hue census reports as "one 30° sector holds 62.8–76.8 %
 * of every model" against the value authority's 37.0–40.4 %.
 *
 * **What r10 changed, and the three rules it changed under.**
 *
 * 1. **Value is held, hue is moved.** r9's other finding is that the exposure is already right:
 *    our plate median-of-medians reads 107.0 against `_reference-mp`'s 107.4, and the brief that
 *    commissioned this round issues no darkening instruction. So every hex below was chosen to
 *    keep its bucket's sRGB luma within a few code values of the r9 value, and the hue and the
 *    chroma are the only things that move. The two deliberate exceptions are named where they
 *    occur: `house-modern-pavilion`'s `wallAlt`, which V350 calls **charcoal** and which
 *    measured buff at 105.9 against a 165.5 wing, and `townhouse-modern-brick`'s `wallAlt`,
 *    which is the id's whole identity and was reading as buff rather than as brick.
 *    `tests/v370-l1-r10-probe.mjs` prints a projected-area mean predicted luma per id as an
 *    exposure guard, so a hue edit that moves the value shows up as a number.
 *
 * 2. **Hues are spread, not swapped.** Moving every id from one warm sector to one cool sector
 *    would score identically on §2.10 and would be the same fault in a new hex — which is what
 *    r9 said about the navy fix. Each id now carries three families with real area: a warm one
 *    (20–45°), a cool one (195–225°) and the planting (85–95°), and `wall`, `wallAlt` and `trim`
 *    — the three largest buckets on every id — are never in the same family as each other.
 *
 * 3. **A cool hue is only reachable on a bucket that renders above ~90, and this is a measured
 *    limit rather than a preference.** It cost an iteration to find and it is worth writing
 *    down. r10's first draft gave `house-modern-pavilion` a genuinely blue-grey charcoal rear
 *    cube, `#3b4046`. Pushed through `v370-l1-transfer.mjs` at five occlusion levels that hex
 *    lands **(0, 0, 23) at ao 0.30** — red and green at literal zero with blue surviving, which
 *    is r1's navy arriving by a different road. The arithmetic behind it: `wallAlt` takes
 *    irradiance 0.25, so its albedo term is comparable to its emissive floor, and to drag the
 *    SUM back to the 1.45 red-to-blue ratio that renders neutral down there the floor would
 *    need a negative blue component. It cannot be done.
 *
 *    So `wallAlt`, `joinery`, `shadow` and `timber` are warm or near-neutral on all six ids.
 *    The cool family is carried by `wall` (renders 178-182), `trim` (161-168) and `roof`
 *    (96-103) — the three buckets far enough up the curve that the grade's channel split is a
 *    tint rather than the whole pixel.
 *
 * The per-id story, in one line each — a lane that later edits one of these should keep the
 * story rather than the hex:
 *
 *   skillion   COOL pale grey render / warm charcoal-brown brick plinth / graphite roof /
 *              warm limestone paving / cedar entry lining
 *   pavilion   warm cream street cube / neutral CHARCOAL rear cube (V350's word) / cool lid /
 *              cool concrete paving
 *   brick      red-brown brick row / cool zinc roof / cool concrete string courses and paving
 *   render     COOL white render / warm stone plinth / warm limestone paving / cedar battens
 *   courtyard  COOL pale shaft / red-brown brick podium / cool parapet / warm stone paving
 *   bar        warm sand render mid / warm brick bookends / cool parapet / cool concrete paving
 */
export const MODERN_SURFACE_SCHEME = Object.freeze({
  'house-modern-skillion': Object.freeze({
    // **r12 — `trim` goes cool, and this is the largest single §2.10 lever on this id.**
    // The r12 probe's per-bucket area census (section C) is what settled where the warm area
    // actually is, and it was not where r10 assumed: `joinery` renders at saturation 0.06 and
    // `roof` at 0.06 — both are binned NEUTRAL, neither is in the warm sector. `trim` is **22.0 %
    // of projected area at hue 37, saturation 0.15** and it is the single largest counted field on
    // the id, because `trim` is the whole lot surface: footpath, tray rim, tray field, pavers,
    // plinth caps, string course, drive tops. Taking it to a cool concrete puts that 22 % into the
    // neutral bin (saturation 0.08 at the lit end) instead of into the 30–60° sector.
    // `wallAlt`, the brick plinth, moves from hue 29 to hue 28 with more chroma, which parks it
    // firmly in 0–30° where the reference skillion plate carries 11.2 %.
    wallFamily: 'render', roofFamily: 'metal',
    get wall() { return restyleColour('#99a6a7', '#99a6a7', { id: 'building:house-modern-skillion.wall' }); },
    get wallAlt() { return restyleColour('#4d3c31', '#c59a7e', { id: 'building:house-modern-skillion.wallAlt' }); },
    get roof() { return restyleColour('#2b2823', '#655e52', { id: 'building:house-modern-skillion.roof' }); },
    trim: '#565d61', joinery: '#312b23',
    get timber() { return restyleColour('#603c22', '#9f6438', { id: 'building:house-modern-skillion.timber' }); },
    garden: '#252f10', shadow: '#1c170f',
  }),
  'house-modern-pavilion': Object.freeze({
    wallFamily: 'render', roofFamily: 'metal',
    // `wallAlt` is the rear cube. V350 says charcoal; r9 measured it buff at 105.9 against a
    // 165.5 cream wing and booked the id's two-cube contrast as missing. This is the one
    // deliberate darkening in the table and the critic asked for it by name.
    // r12 — `wallAlt` down 7 luma and its chroma halved. V350's word is CHARCOAL and the r11 plate
    // reads the rear cube as a pale warm brick, not a charcoal one: the two-cube contrast the
    // critic credited is 88 against 181 in the probe and much less than that on the plate, because
    // the atlas brick region carries per-texel warm variation a mean-based prediction cannot see.
    // Darker and flatter is both the value separation §2.9 asks for and the hue split §2.10 does.
    wall: '#b9a77e', wallAlt: '#413e39', roof: '#272a2d',
    trim: '#575e63', joinery: '#2e2a26', timber: '#5c3a24',
    garden: '#242d0e', shadow: '#1a150e',
  }),
  'townhouse-modern-brick': Object.freeze({
    // `wallAlt` carries the whole elevation on this id — `wall` is never bound to a part — so
    // it is the brick. r9 read it as buff; a brick row whose brick is not a brick colour has no
    // identity left. Lifted 11 luma and given 15 points of chroma, with the roof, the string
    // courses and the fence taken cool so the id is not one warm field.
    wallFamily: 'brick', roofFamily: 'metal',
    wall: '#b2a78d', wallAlt: '#5f3f2c',
    get roof() { return restyleColour('#282b2f', '#596069', { id: 'building:townhouse-modern-brick.roof' }); },
    trim: '#575e65', joinery: '#302a24',
    get timber() { return restyleColour('#6e2f22', '#b24a35', { id: 'building:townhouse-modern-brick.timber' }); },
    garden: '#232c0d', shadow: '#1a150e',
  }),
  'townhouse-modern-render': Object.freeze({
    wallFamily: 'render', roofFamily: 'metal',
    get wall() { return restyleColour('#95a4a7', '#95a4a7', { id: 'building:townhouse-modern-render.wall' }); },
    get wallAlt() { return restyleColour('#4c443a', '#a1907b', { id: 'building:townhouse-modern-render.wallAlt' }); },
    get roof() { return restyleColour('#282b2e', '#5c636a', { id: 'building:townhouse-modern-render.roof' }); },
    trim: '#575e65', joinery: '#2f2a25',
    get timber() { return restyleColour('#6b4526', '#9b6437', { id: 'building:townhouse-modern-render.timber' }); },
    garden: '#252e0f', shadow: '#1b160f',
  }),
  'apartment-modern-courtyard': Object.freeze({
    wallFamily: 'render', roofFamily: 'metal',
    // `trim` stays WARM on this id, deliberately and against the move made on the skillion. The
    // courtyard's material story is "warm stone paving" and it is the one id §2.10 already passes
    // on the plate (26.8 % against a reference of 47.4 % under the r9-critic mask). The critic's
    // objection here is the opposite one — "the court reads as a pale blue void" — so taking the
    // paving cool would have made the id's named fault worse to move a number it already clears.
    get wall() { return restyleColour('#9ba6a7', '#838c8d', { id: 'building:apartment-modern-courtyard.wall' }); },
    wallAlt: '#5c3d2b',
    get roof() { return restyleColour('#2a2c2f', '#52545b', { id: 'building:apartment-modern-courtyard.roof' }); },
    trim: '#635d4c', joinery: '#302b25', timber: '#5e3c26',
    garden: '#273011', shadow: '#1a150e',
  }),
  'apartment-modern-bar': Object.freeze({
    wallFamily: 'render', roofFamily: 'metal',
    // **r12 — the mid goes COOL and the bookends go brick, which is a §2.10 fix and an identity fix
    // in one move.** r10's story was "warm sand render mid / warm brick bookends": two warm
    // materials owning the entire envelope, which is the fault §2.10 names, and §5.3.1's permission
    // for a subject to be dominated by its principal material does not extend to two of them.
    // V350 says "brick bookends, glass/render mid" and says nothing about the mid being warm. A
    // pale cool render between warm brick ends is the stronger reading of the same sentence, it
    // gives the id the two-material contrast it did not have, and it takes 15.7 % of projected area
    // out of the 30–60° sector at a stroke.
    wall: '#9ca6a8', wallAlt: '#5c4334', roof: '#27282a',
    trim: '#5a6169', joinery: '#2e2a26', timber: '#5b3a26',
    garden: '#232b0d', shadow: '#1a150e',
  }),
});

/**
 * Albedo-map means, in LINEAR, measured by `tests/v370-l1-map-mean.mjs`.
 *
 * **Two tables, not one, and the distinction is load-bearing.** `applyResidentialAtlas()`
 * OVERWRITES `material.map` with the shared residential atlas, so a bucket that takes the
 * atlas is multiplied by the atlas region and a bucket that skips it is multiplied by the
 * family pack from `textures.js`. The two disagree badly: the family brick pack is a reddish
 * `(0.40, 0.28, 0.22)` while the atlas brick cell is a near-white bond at `(0.82, 0.81, 0.79)`,
 * and the family `painted_metal` pack is the warm `#d8c090` tan r1 diagnosed while the atlas
 * `painted_metal` cell is a flat neutral `0.47`. Compensating an atlas-bound bucket against
 * the family pack would be wrong by a factor of two on value and by the whole of the hue.
 *
 * Frozen rather than computed at build time because the generators cost about a second each
 * and every board build would pay it. `tests/v370-l1-palette-probe.mjs` re-derives both tables
 * and fails the lane if either has drifted, so a change to a generator surfaces as a red probe
 * rather than as six silently re-tinted buildings.
 */
export const FAMILY_MAP_MEAN = Object.freeze({
  'family:render': Object.freeze([0.6071, 0.5551, 0.4592]),
  'family:brick': Object.freeze([0.4023, 0.2751, 0.2191]),
  'family:slate': Object.freeze([0.1262, 0.1365, 0.1799]),
  'family:timber': Object.freeze([0.3249, 0.1283, 0.0361]),
  'family:painted_metal': Object.freeze([0.6795, 0.5403, 0.3203]),
  'family:foliage': Object.freeze([0.0556, 0.1773, 0.0351]),
  'family:concrete': Object.freeze([0.3034, 0.2969, 0.2778]),
  'family:weatherboard': Object.freeze([0.6536, 0.5927, 0.4747]),
  'atlas:render': Object.freeze([0.5554, 0.5077, 0.4201]),
  'atlas:brick': Object.freeze([0.8163, 0.8074, 0.7923]),
  'atlas:joinery': Object.freeze([0.7296, 0.7296, 0.7296]),
  'atlas:painted_metal': Object.freeze([0.4735, 0.4735, 0.4735]),
  'atlas:timber': Object.freeze([0.2899, 0.1151, 0.0328]),
  'atlas:foliage': Object.freeze([0.0538, 0.1715, 0.0339]),
  'atlas:slate': Object.freeze([0.1285, 0.1392, 0.1824]),
});

/**
 * Scene-linear emissive floors, per bucket.
 *
 * Sized off the inverted transfer so that the surface lands between plate value ~12 (fully
 * occluded, screen-space AO at its 0.30 floor) and ~75 (unoccluded) on the emissive term
 * ALONE, with the diffuse term then carrying the lit/shade separation on top. The point is not
 * brightness, it is that no instance of these buckets can reach display zero however deep the
 * reveal it sits in — which is the mechanism behind five of the r1 critic's sixteen majors and
 * behind 12.8–18.7 % of every subject sitting at luma ≤ 2.
 *
 * Warm, deliberately: see the palette note above. A neutral floor at this level returns navy.
 * `wall` and `trim` have none — they are nowhere near the bottom of the curve.
 */
const EMISSIVE_FLOOR = Object.freeze({
  // **r12 — `wall` and `trim` get floors, and both are consequences of measurements this round.**
  //
  // `trim` FIRST, because it is now the bucket every recess is lined with. `modern-detail.js` moved
  // every reveal return to it and `modern-kit.js` moved every balcony and loggia soffit to it, on
  // §5.3's paid-for L4 finding. That move is only correct if the bucket can hold value at the deep
  // end, and `trim` had NO floor at all: through `v370-l1-transfer.mjs` at ao 0.30 in cast shadow it
  // landed at plate luma 17, i.e. it would have carried the crush into a brighter bucket rather than
  // out of it. With this floor the same point reads 45. The cost at the lit end is +6 luma
  // (164 → 170), which is inside the reference's 116–199 band for paved ground.
  //
  // `wall` second, and it is the bucket behind two of the three places the r11 critic's dark map put
  // the literal-zero population: the back wall of every balcony and the courtyard's court elevation.
  // Same instrument: shaded at ao 0.30 it went from 38 to 57, at ao 0.22 from 22 to 28, at ao 0.15
  // from 2 to 10, and the lit end moves 182 → 184.
  //
  // **What the floor does NOT do, stated because it would be easy to claim it.** It does not fix the
  // slate-blue drift the critic booked as minor 2. Measured: the shaded `wall` on
  // `townhouse-modern-render` reads (132,147,160) at hue 208 without the floor and (140,151,161) at
  // hue 209 with it. The hue is the grade's cool lift acting on a cool albedo (§5.2) and no additive
  // warm term at this magnitude moves it. The floor buys VALUE at the bottom, which is the crush;
  // the hue is a separate fault and is treated separately in the per-id table above.
  wall: Object.freeze([0.0124, 0.0096, 0.0052]),
  trim: Object.freeze([0.0176, 0.0166, 0.0118]),
  // r10: `roof`, `joinery`, `shadow` and `timber` are SOLVED against a target plate colour at
  // their nominal occlusion through `v370-l1-transfer.mjs`'s inverse, not scaled by hand — the
  // hand-scaled first attempt landed `shadow` at plate (49,39,49), a magenta, because a floor
  // whose ratio is right at plate 23 is wrong at plate 40. `wallAlt` is lifted only x1.33: r9's
  // dark map put the crushed population in soffits, reveal linings and picket gaps, which are
  // `shadow` and `joinery` instances, and `wallAlt` is an exposed bucket that did not need it.
  wallAlt: Object.freeze([0.0142, 0.0135, 0.0081]),
  roof: Object.freeze([0.0122, 0.0115, 0.0097]),
  joinery: Object.freeze([0.0186, 0.0197, 0.0148]),
  // The largest floor, because `shadow` is the bucket that lives inside the reveals: the jamb,
  // head and sill returns, the eave bead, the batten bead, the room plane behind a pane. Their
  // diffuse term is a rounding error by construction, so the floor is nearly all of their value.
  shadow: Object.freeze([0.0317, 0.0314, 0.0219]),
  timber: Object.freeze([0.0068, 0.0059, 0.0042]),
  // r12 — doubled. §5.3.2 is a programme-wide ruling that a black plant is a lighting fault, and the
  // r12 probe measured `garden` at plate luma 0 in cast shadow at ao 0.30 on the old floor. The
  // primitive change in `modern-kit.js` does most of the work — `leafClump`'s twelve faces point in
  // twelve directions, so unlike a box or a crossed card none of them can sit at `n·l = 0` as a
  // family — and this carries the rest. Deep shade now reads 12 rather than 0.
  garden: Object.freeze([0.0150, 0.0190, 0.0100]),
});

/**
 * **What a floor can and cannot buy, stated because the numbers look arbitrary otherwise.**
 *
 * Screen-space AO multiplies the emissive term along with everything else, and the lab clamps
 * that product at about 0.35 in the deepest crease. Run the floors above through the inverted
 * transfer at three occlusion levels and the honest picture is:
 *
 *            AO 1.00   AO 0.60   AO 0.35
 *   shadow      ~75       ~26       ~2
 *   joinery     ~30        ~3       ~0
 *
 * So this does NOT guarantee that nothing reaches display zero, and it cannot: between
 * scene-linear 0.008 and 0.021 the transfer covers plate values 0 to 75, which is a narrower
 * window than the occlusion range of a real reveal. What it does is move the POPULATION — the
 * surfaces that were at zero across the whole occlusion range now sit between 25 and 90 across
 * most of it, and only the deepest pockets fall out of the bottom. The reference's own darkest
 * measured value is 21 and it carries 0.06-1.12 % of its subject at luma <= 2, so a small black
 * population is correct. 12.8-18.7 % is not.
 *
 * **r10 — the r2 floors were sized at the wrong end of the occlusion range, and the plate said
 * so.** r9 measured 5.7-12.7 % of every subject below luma 21 and, worse, **2.7-6.6 % at
 * literal sRGB zero** against the authority pack's 1.1-1.5 % and ~0.00 %, and painted it back
 * onto the plates: balcony soffits, reveal linings, and the gaps between fence pickets. Every
 * one of those is a `shadow` or a `joinery` instance at the deep end of the sweep.
 *
 * The r2 floors were verified at ONE occlusion each, and `v370-l1-palette-probe.mjs` evaluates
 * each bucket at one nominal `ao` for the same reason, which is how a clean predicted ladder and
 * a plate with a black population coexisted for eight rounds. `tests/v370-l1-r10-probe.mjs`
 * sweeps five occlusion levels instead, and on the r9 floors it prints:
 *
 *            ao 0.30   0.45   0.60   0.80   1.00
 *   shadow        3     23     45     68     83
 *   joinery       1     17     33     59     75
 *   wallAlt       4     24     48     70     85
 *   roof          8     28     56     76     90
 *   timber        9     26     37     64     79
 *
 * Five buckets fall to display zero in a deep crease. The r10 multipliers put the deep end at
 * 13-20 instead of 1-9, which removes the literal-zero population — the half of the fault §5.2
 * states as a rule — at a stated cost: an UNOCCLUDED instance of `shadow` now renders about 98
 * rather than 83, and of `joinery` about 98 rather than 75.
 *
 * **Why not go further and clear 21 at ao 0.30.** It is reachable — shadow x1.60 does it — and
 * it was rejected on a measurement rather than on taste. The transfer covers plate 0 to 109 over
 * the 3.33x radiance range that ao 0.30 to 1.00 spans, so pinning the deep end at 25 pins the
 * lit end at 109. `shadow` is not only the inside of a reveal: it is also the board tray's
 * bevelled edge (§2.1 asks for that edge to be dark), the modelled brick bed joints and the
 * shadow bead beside every roof batten — the three surfaces r9 named as the lane's best work.
 * At 109 those all stop being dark lines. Trading §2.9 on the roof and the bond to buy four
 * code values at the bottom is the wrong trade, and the honest answer is that this bucket is
 * carrying two jobs that want different floors and the nine-bucket cap has no room for a tenth.
 * `lot-tray-body` is moved to `joinery` in `modern-garden.js` for exactly this reason.
 *
 * **CROSS-LANE, and it retires half of a standing instruction.** L4 r8 built
 * `tests/v370-l4-r8-transfer.mjs`, which imports `bakeGradeLut` from `post.js` and `solarProfile`
 * from `lighting.js` READ-ONLY (the rig stays pinned, §4.9) and reproduces six independently
 * measured plate rows to **rms 2.73 luma with one free parameter**. Two numbers out of it govern
 * this table:
 *
 *   * the display chain's **black clip is scene-linear 0.0062, not zero** — the residential
 *     grade's 1.46 contrast about pivot 0.30 clips it;
 *   * **GTAO multiplies by as little as 0.328** in a reveal.
 *
 * The consequence is the one this lane arrived at independently and is worth stating in L4's
 * sharper form: **"author nothing near black" is necessary and not sufficient.** A diffuse term
 * is `albedo x irradiance`, and inside a reveal it is the IRRADIANCE that goes to zero, so no
 * albedo whatever closes the recess crush. A surface in a reveal has to CARRY its value, which
 * is what an emissive floor is.
 *
 * L4's solve table gives **emissive 0.00992 for plate luma 20**. Because GTAO multiplies the
 * emissive term too, a bucket that must clear 20 at the deepest crease needs
 * `0.00992 / 0.328 = 0.0302` authored. `shadow` is therefore raised to a luma-weighted 0.0310
 * rather than the 0.0281 this lane had solved for on its own transfer, and `wallAlt` to 0.0137 —
 * which also opens the `joinery~wallAlt` value collision the palette probe was booking.
 */

/**
 * **r12 — EVERY HEX ABOVE IS RE-SOLVED AGAINST THE ADDED EMISSIVE FLOORS, AND THAT IS THE HALF OF
 * THIS MOVE r10 LEFT OUT.**
 *
 * An emissive floor is additive: it lifts the whole ladder, deep end and lit end together. r10 added
 * floors to five buckets and did NOT take the corresponding value back out of the albedo, and said
 * so — "an unoccluded `shadow` surface now renders ~101 instead of 83" — and its own exposure proxy
 * then went up by 14 to 26. §5.0 is explicit that a lane authors against the RENDERED value, not
 * against the hex, and a floor changes the rendered value.
 *
 * So each of the three buckets that gained or changed a floor this round had its hex re-solved
 * through `v370-l1-transfer.mjs` to land back on the value it had before, measured at the LIT end:
 *
 *              r10 lit    r12 first draft    r12 as shipped     deep end (shadow, ao 0.30)
 *   trim         164            171               166            17  ->  36
 *   wall         182            184               183            38  ->  55
 *   garden       113            126               113             0  ->   4
 *
 * The deep end moves and the lit end does not, which is the whole point: the floor buys value where
 * the irradiance is missing and gives it back where the irradiance is not.
 *
 * **This was caught on a plate, not by reasoning.** The first r12 draft was captured and
 * `v370-l1-r9critic-value.py` read `house-modern-skillion` at median 126.8 against r11's 122.9 under
 * the same mask — a +3.9 drift on an id already above the §5.0 bar, bought for nothing. The brief
 * for this round says value was held while hue came down and to protect that. It is protected by
 * re-solving, not by declining the floors.
 */
/** Buckets whose compensation clipped at author time. Read by the palette probe. */
export const COMPENSATION_CLIPS = [];

function srgbToLinear(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * Divide the family's map mean back out of a target effective albedo.
 *
 * Returns a `THREE.Color` whose components are LINEAR and may legitimately exceed the value a
 * hex could express — that is the whole point, and it is why the result is built with
 * `setRGB` rather than parsed from a string. A component above 1 exceeds the
 * legacy authoring envelope, so the default path clamps it and records `COMPENSATION_CLIPS`.
 * R72 restyled wall/timber callers can opt into extended linear multipliers: the shader
 * uniform supports them and the map product still carries the authored effective albedo.
 */
export function compensated(mapKey, hex, tint = 0, extended = false) {
  const mean = FAMILY_MAP_MEAN[mapKey];
  const n = parseInt(hex.replace('#', ''), 16);
  const target = [
    srgbToLinear((n >> 16) & 255),
    srgbToLinear((n >> 8) & 255),
    srgbToLinear(n & 255),
  ].map((v) => v * (1 + tint));
  const colour = new THREE.Color();
  if (!mean) {
    colour.setRGB(target[0], target[1], target[2]);
    return colour;
  }
  const raw = target.map((v, i) => v / mean[i]);
  if (!extended && raw.some((v) => v > 1)) {
    COMPENSATION_CLIPS.push({ mapKey, hex, raw: raw.map((v) => Number(v.toFixed(3))) });
  }
  colour.setRGB(
    extended ? raw[0] : Math.min(1, raw[0]),
    extended ? raw[1] : Math.min(1, raw[1]),
    extended ? raw[2] : Math.min(1, raw[2]),
  );
  return colour;
}

/** The effective albedo a bucket will actually present to the light. Linear. */
export function effectiveAlbedo(mapKey, colour) {
  const mean = FAMILY_MAP_MEAN[mapKey] ?? [1, 1, 1];
  return [colour.r * mean[0], colour.g * mean[1], colour.b * mean[2]];
}

/** Which map a binding is actually multiplied by: the atlas region, or the family pack. */
export function mapKeyFor(binding, skipAtlas) {
  return skipAtlas ? `family:${binding.family}` : `atlas:${binding.region}`;
}

const BINDING = Object.freeze({
  wall: { family: 'render', region: 'render', wear: 'render' },
  masonry: { family: 'brick', region: 'brick', wear: 'brick' },
  // `wear: 'corrugated'` rather than 'weatherboard'. The wear shader branches on family:
  // 'weatherboard' lands in its wall bucket, which is grime at the base of a wall, and the
  // roof bucket — streaking that runs DOWN a metal plane from its fixings — was unreachable
  // from this lane. §2.5 asks for exactly that streak, so the metal bucket now asks for it.
  // `family: 'slate'`, not `'painted_metal'`. `MaterialLibrary._create()` multiplies the
  // family's procedural MAP by the authored colour, and the `painted_metal` pack is built
  // around `#d8c090` — a warm tan. The r2 plate measured the consequence: a roof authored at a
  // neutral `#55534b` (85,83,75) rendered `rgb(124,103,78)`, a khaki that no amount of
  // roughness or envBase was going to neutralise, because the tint is in the albedo product.
  // `slate` carries a cool-grey pack at `#9aa4b0` with fine mineral grain, which is the right
  // base for painted steel at model scale and lets the authored charcoal decide the hue.
  // The atlas is skipped on this bucket, so `region` is inert here and only `wear` still bites.
  // `family: 'concrete'`, not `'slate'`.
  //
  // r1 moved this bucket off `painted_metal` because that pack's warm `#d8c090` base tinted a
  // neutral roof khaki, and landed on `slate` — whose pack is a TILED SLATE ROOF: staggered
  // rectangular units with modelled gap rows. Laid under a standing-seam batten run at 0.48
  // pitch that is two regular grids crossing each other, which is the "regular checkered moiré
  // over the seam battens" the r1 critic measured on `townhouse-modern-brick` at
  // x700-1050 / y100-320. It is also simply the wrong material: a standing-seam roof is a
  // folded steel sheet and has no units in it at all.
  //
  // `concrete` is fine isotropic noise at a near-neutral 0.30 linear mean, which is what
  // painted steel at model scale looks like — grain, no pattern — and it removes the second
  // grid entirely rather than trying to out-run it with a batten pitch.
  iron: { family: 'concrete', region: 'painted_metal', wear: 'corrugated' },
  trim: { family: 'painted_metal', region: 'joinery', wear: 'weatherboard' },
  joinery: { family: 'painted_metal', region: 'painted_metal', wear: 'weatherboard' },
  shadow: { family: 'render', region: 'render', wear: 'painted_metal' },
  timber: { family: 'timber', region: 'timber', wear: 'timber' },
  garden: { family: 'foliage', region: 'foliage', wear: 'foliage' },
});

/**
 * `envBase` on the dark buckets is the second half of the navy fix.
 *
 * A near-black dielectric still returns its F0 — about 4% — of whatever the environment
 * hands it, and `lighting.bakeEnvironment()` bakes a sky. When the albedo carries no chroma
 * that 4% IS the pixel's chroma, which is why the baseline's roof read blue on a charcoal
 * albedo. Raising the albedo (above) makes the diffuse term dominant again; pulling
 * `envBase` down on iron / joinery / shadow keeps the specular term from clawing it back.
 *
 * Glass moves the other way. §2.2 wants "a hint of sky or foliage in it", so the pane is the
 * one bucket that SHOULD carry an environment return, and its envBase goes up.
 */
const RESPONSE = Object.freeze({
  render: { roughness: 0.92, metalness: 0.0, envBase: 0.70, normal: 0.28 },
  masonry: { roughness: 0.94, metalness: 0.02, envBase: 0.58, normal: 0.95 },
  // Iron: rough, not glossy. The r1 plate came back with a khaki roof on a neutral
  // `#55534b` albedo, which is the low warm key reflecting off a 0.62-rough, 0.12-metal plane
  // — a sheen across the whole pitch that carries the sun's colour rather than the roof's. A
  // painted steel roof at model scale is matt; 0.88 lets the albedo decide the colour.
  iron: { roughness: 0.88, metalness: 0.0, envBase: 0.08, normal: 0.18, specular: 0.06 },
  trim: { roughness: 0.94, metalness: 0.0, envBase: 0.76, normal: 0.28 },
  // Joinery: no clearcoat. This was the second navy source and it survived the albedo rebuild
  // — the r1 plate still had a navy fence and a navy portico at albedo `#3a3833` (Y 56), which
  // no diffuse term produces. `clearcoat` adds a SECOND specular lobe that samples the baked
  // sky env on its own, on top of the base lobe, and on a dark surface those two lobes are the
  // whole pixel. Removed rather than tuned: a clearcoat on a powder-coated steel picket is
  // wrong on the merits too.
  joinery: { roughness: 0.88, metalness: 0.0, envBase: 0.07, normal: 0.30 },
  shadow: { roughness: 0.97, metalness: 0.0, envBase: 0.14, normal: 0.16 },
  timber: { roughness: 0.82, metalness: 0.0, envBase: 0.40, normal: 0.58 },
  garden: { roughness: 0.96, metalness: 0.0, envBase: 0.28, normal: 0.75 },
});

/**
 * The pane ramp, in linear-ish display units, sill → head.
 *
 * The baseline ran 0.04 → 0.10, a range so short and so dark that the whole pane arrived as
 * one flat value — the "flat card" §2.2 names. The reference plate's panes run from
 * rgb(28,19,14) at the bottom of the glass to rgb(39,51,63) where the sky is in it, so the
 * ramp is authored to cross the frame's value on its way up rather than sit under it, and it
 * runs warm at the sill (the room behind) and cool at the head (the sky in front).
 */
const GLASS_RAMP = Object.freeze({
  // **The pane is now EMISSIVE, and that is the fix for the r1 critic's suspicion 1.**
  //
  // The critic's refinement was the important half: at 3x zoom the reveal geometry is there —
  // jamb returns, a chunky frame ring, a proud sill, a head drip — and the pane body is
  // rendering at luma 0.5, 1.7 and 0.1 inside it. More geometry cannot fix a pane at zero.
  //
  // Neither can a brighter diffuse albedo, and this is the part r1 could not have known
  // without inverting the transfer. A pane sits 0.24 m behind a 0.20 m lining; the lab drives
  // screen-space AO at intensity 3.05 with radii scaled to the subject, so a window reveal is
  // fully occluded, and the diffuse and environment terms it has left are a rounding error.
  // The SAME material on the pavilion's shallow curtain wall was measured at luma 99 — one
  // ramp, three failure modes, none of them landing in the reference's 21-88. That spread is
  // irradiance, not albedo, and no albedo edit closes it.
  //
  // Emissive is added to outgoing radiance after all of that. Screen-space AO still multiplies
  // it — the lab clamps that product at about 0.30 and it is near 1.0 on an open face — so the
  // numbers below are chosen to land the pane inside the reference band across the WHOLE of
  // that range rather than at one point in it:
  //
  //          AO 0.30      AO 0.60      AO 1.00      reference band
  //   sill     ~28          ~55          ~82         21 (dark pane)
  //   head     ~55          ~78          ~105        88 (pane with sky), 106 (lit room)
  //
  // Warm at the sill (the room behind) and cool at the head (the sky in front), which is the
  // relationship the reference plate has across a single pane.
  // Scaled by 1/opacity below, because alpha blending multiplies the pane's own outgoing
  // radiance — emissive included — by its alpha before compositing what is behind it.
  headEmissive: Object.freeze([0.0446, 0.0473, 0.0446]),
  sillEmissive: Object.freeze([0.0284, 0.0243, 0.0189]),
  // The diffuse body stays low. It is what lets a pane still darken under a deep head lining
  // rather than reading as a lit panel, and it carries the specular glint.
  head: Object.freeze([0.048, 0.056, 0.068]),
  sill: Object.freeze([0.020, 0.017, 0.014]),
  // Rougher than r1's 0.20. A near-mirror pane samples the baked environment, and in a studio
  // that hides its sky dome the environment it mirrors is the dark side of the reveal — which
  // is the second half of why the pane read as a hole. 0.42 spreads that return into a broad
  // sheen instead of a mirror.
  // **r10 — a reflected horizon across the pane, added for r9 majors 3 and 6.**
  //
  // r9's finding is that the ramp itself is fine — it measured the pane at 40.4, inside the
  // reference's own 21-88 band — and that the fault is what the pane LOOKS like: "at 5x the upper
  // curtain wall is a uniform milky grey card with no reflection, no foliage and no sky". A
  // monotone vertical ramp of this amplitude reads flat because it has no EDGE in it, and what
  // makes glass read as glass at model scale is the horizon line between the sky the pane
  // reflects and the darker ground below it.
  //
  // The shader below adds one: a diagonal split from `uv.y * 1.25 - uv.x * 0.50`, softened over
  // 0.14 of its range, that multiplies the ramp by 1 ± 0.31 and adds a small cool bias on the sky
  // side. It is authored **symmetric about the ramp** so that a pane's mean is unchanged to
  // within a code value — the brief and the critic both say not to chase the glass value, and
  // this is not chasing it. [ARGUED, not seen: the amplitude was chosen against the reference's
  // measured pane spread of rgb(28,19,14) to rgb(39,51,63), not against a captured plate of ours.]
  roughness: 0.42,
  envBase: 0.22,
  specular: 0.38,
  // **The pane is no longer opaque, and this is the r1 critic's pair-02 loss.**
  //
  // Its call on that pair was that the reference "shows a lit room behind it — furniture, a
  // plant, a table — so the glass has somewhere to be transparent to", against our "milky
  // pale-blue gradient card with nothing behind it". `house-modern-pavilion` DOES build a
  // table, a chair, a pot and a pendant lamp; r1 put them at 0.22 m behind the wall face while
  // `GLASS_IN` is 0.24, so they sat 20 mm in FRONT of an `opacity: 1.0` pane — furniture jammed
  // into a window reveal rather than a room seen through glass. There is no depth of field in
  // which an opaque pane has anything behind it.
  //
  // 0.74 rather than the family's 0.58: enough to read the room, not so much that the pane
  // stops being a surface. `MaterialLibrary._create()` sets `depthWrite` false below 0.95,
  // which is correct here — the room plane and the furniture are opaque and already in the
  // depth buffer when the transparent pass runs, so the pane composites over them and is still
  // depth-rejected by any wall in front of it.
  //
  // [ARGUED, not seen]. If a captured plate shows sorting artefacts across the merged glass
  // bucket, the revert is one line: `opacity: 1.0`, and divide the two emissive triples above
  // by 1.35 to put them back where they were.
  opacity: 0.74,
});

const PROGRAM_KEY = 'v370-modern-surface-r1';

// Ruling 78, pixel owners from census-p17-4b. Linear first-pass estimates;
// the orchestrator's next census judges the resulting medians and tails.
const RESTYLE_OWNER_GAINS = Object.freeze({
  'house-modern-pavilion': Object.freeze({ wall: 0.64, wallAlt: 2.12, timber: 3.96, roof: 6.73 }),
  'house-modern-skillion': Object.freeze({ wall: 0.77 }),
  // Ruling 80/round 3: V35 -> V70 overshot; cut the round-2 timber by x0.55 toward V54.
  'townhouse-modern-render': Object.freeze({ wall: 0.81, wallAlt: 1.62, timber: 1.010625 * 0.80 }), // orchestrator: round 3 read 62
});

function bucket(materials, atlas, {
  binding, color, response, variant, wear, skipAtlas = false, emissive = null,
}) {
  const r = response;
  const mapKey = mapKeyFor(binding, skipAtlas);
  // R72/73: the authored hex sets albedo; cancelling a dark map may need a
  // multiplier above one. Keep the legacy clamp for every other bucket/state.
  const extended = readRestyle(globalThis.location?.search ?? '').enabled
    && (/^v350\|(house-modern-skillion|townhouse-modern-render|apartment-modern-courtyard)\|.*\|wall$/.test(variant)
      || /^v350\|townhouse-modern-brick\|.*\|timber$/.test(variant));
  const authoredColor = compensated(mapKey, color, 0, extended);
  const entryId = variant.split('|')[1], role = variant.split('|').at(-1);
  const gain = RESTYLE_OWNER_GAINS[entryId]?.[role];
  const compensatedColor = gain == null ? authoredColor : restyleColour(
    authoredColor, authoredColor.clone().multiplyScalar(gain), { id: `building:${entryId}.${role}` },
  );
  const material = materials.get(binding.family, {
    variant,
    // `MaterialLibrary.get()` keys its cache on the colour it is handed, so a compensated
    // colour has to reach it as the cache key too or two buckets that differ only after
    // compensation would share one material.
    color: `#${compensatedColor.getHexString(THREE.SRGBColorSpace)}`,
    roughness: r.roughness,
    metalness: r.metalness,
    envBase: r.envBase,
  });
  if (material.userData.v350Surface) return material;
  material.userData.v350Surface = { region: binding.region, variant };
  // Set the colour again from the linear triple. `get()` had to be handed a hex for its cache
  // key, and an 8-bit hex round trip costs up to half a code value on a compensated component
  // that lands near the bottom of the ramp — which is exactly where this lane's buckets live.
  material.color.copy(compensatedColor);
  material.userData.v370Effective = effectiveAlbedo(mapKey, material.color);
  material.userData.v370MapKey = mapKey;
  if (emissive) {
    // Scene-linear, additive, and untouched by the key, the environment or the shadow map.
    // See EMISSIVE_FLOOR: this is the only lever that can place a value in the 0.012-0.021
    // radiance band the reference's dark half occupies, because that band is narrower than
    // the irradiance difference between a lit face and a reveal.
    material.emissive.setRGB(emissive[0], emissive[1], emissive[2]);
    material.emissiveIntensity = 1;
    material.userData.v370Emissive = emissive;
  }
  if (!skipAtlas && applyResidentialAtlas(material, binding.region, atlas)) {
    configureResidentialAtlasShader(
      material, atlas, binding.region, null,
      binding.region === 'brick',
    );
  }
  if (material.normalScale) material.normalScale.set(r.normal, r.normal);
  else material.normalScale = new THREE.Vector2(r.normal, r.normal);
  if (r.specular !== undefined) material.specularIntensity = r.specular;
  if (r.clearcoat !== undefined) {
    material.clearcoat = r.clearcoat;
    material.clearcoatRoughness = 0.46;
  }
  configureResidentialWearShader(material, binding.wear, wear);
  material.customProgramCacheKey = () => PROGRAM_KEY;
  if (role === 'wall' && gain != null && readRestyle(globalThis.location?.search ?? '').enabled) {
    // Bound the bright tail after inherited texture/wear and physical setup.
    const previous = material.onBeforeCompile;
    material.onBeforeCompile = function (shader, renderer) {
      previous.call(this, shader, renderer);
      const anchor = '#include <lights_fragment_begin>';
      if (shader.fragmentShader.split(anchor).length !== 2) throw new Error('Modern wall lighting anchor missing or ambiguous');
      shader.fragmentShader = shader.fragmentShader.replace(anchor,
        'material.diffuseColor *= min(1.0, 0.88 / max(max(material.diffuseColor.r, material.diffuseColor.g), max(material.diffuseColor.b, 0.000001)));\n' + anchor);
    };
    // Round 2: kit AO/edge finish runs after lighting and can raise the old
    // diffuse cap. Bound these two residual tails after that finish, before grading.
    const finalTail = entryId === 'house-modern-skillion' || entryId === 'townhouse-modern-render';
    if (finalTail) {
      const capped = material.onBeforeCompile;
      material.onBeforeCompile = function (shader, renderer) {
        capped.call(this, shader, renderer);
        const anchor = '#include <tonemapping_fragment>';
        if (shader.fragmentShader.split(anchor).length !== 2) throw new Error('Modern wall output anchor missing or ambiguous');
        shader.fragmentShader = shader.fragmentShader.replace(anchor,
          'gl_FragColor.rgb *= min(1.0, 0.88 / max(max(gl_FragColor.r, gl_FragColor.g), max(gl_FragColor.b, 0.000001)));\n' + anchor);
      };
    }
    material.customProgramCacheKey = () => `${PROGRAM_KEY}|p17-w2a-wall-tail${finalTail ? '|p17-w2a-output-tail-r2' : ''}`;
  }
  material.needsUpdate = true;
  return material;
}

function glassBucket(materials, variant) {
  const material = materials.get('glass', {
    variant,
    color: '#14181c',
    roughness: GLASS_RAMP.roughness,
    metalness: 0.0,
    opacity: GLASS_RAMP.opacity,
    envBase: GLASS_RAMP.envBase,
  });
  if (material.userData.v350Glass) return material;
  material.userData.v350Glass = true;
  material.ior = 1.5;
  material.specularIntensity = GLASS_RAMP.specular;
  material.specularColor = new THREE.Color('#c8d0d4');
  // `emissive` has to be non-black for three to keep the term alive through the material's
  // own uniform refresh; the ramp below overwrites `totalEmissiveRadiance` per fragment, so
  // this value is only the fallback for a pane whose UVs did not survive the merge.
  material.emissive.setRGB(
    (GLASS_RAMP.sillEmissive[0] + GLASS_RAMP.headEmissive[0]) / 2,
    (GLASS_RAMP.sillEmissive[1] + GLASS_RAMP.headEmissive[1]) / 2,
    (GLASS_RAMP.sillEmissive[2] + GLASS_RAMP.headEmissive[2]) / 2,
  );
  material.emissiveIntensity = 1;
  const uniforms = {
    ddPaneHead: { value: new THREE.Vector3(...GLASS_RAMP.head) },
    ddPaneSill: { value: new THREE.Vector3(...GLASS_RAMP.sill) },
    ddPaneHeadE: { value: new THREE.Vector3(...GLASS_RAMP.headEmissive) },
    ddPaneSillE: { value: new THREE.Vector3(...GLASS_RAMP.sillEmissive) },
  };
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (previous) previous(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nvarying float ddPaneT;\nvarying float ddPaneU;',
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n\tddPaneT = uv.y;\n\tddPaneU = uv.x;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
varying float ddPaneT;
varying float ddPaneU;
uniform vec3 ddPaneHead;
uniform vec3 ddPaneSill;
uniform vec3 ddPaneHeadE;
uniform vec3 ddPaneSillE;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
  float ddPaneValid = step(1e-6, fwidth(ddPaneT));
  float ddPane = mix(0.62, clamp(ddPaneT, 0.0, 1.0), ddPaneValid);
  float ddPaneMix = smoothstep(0.04, 0.96, ddPane);
  diffuseColor.rgb = mix(ddPaneSill, ddPaneHead, ddPaneMix);`,
    );
    // The pane's VALUE is emissive, not diffuse. `<emissivemap_fragment>` is the last stage
    // that writes `totalEmissiveRadiance` before the lights are gathered, so replacing it here
    // puts the ramp into outgoing radiance where no shadow, environment or diffuse term can
    // take it back to zero. That, and not more geometry, is what closes the r1 critic's
    // "panes render at luma 0.5, 1.7 and 0.1".
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
  vec3 ddPaneBase = mix(ddPaneSillE, ddPaneHeadE, ddPaneMix);
  float ddPaneUu = mix(0.5, clamp(ddPaneU, 0.0, 1.0), ddPaneValid);
  float ddSky = clamp(ddPane * 1.25 - ddPaneUu * 0.50 + 0.08, 0.0, 1.0);
  float ddHorizon = smoothstep(0.33, 0.47, ddSky) - 0.5;
  totalEmissiveRadiance = ddPaneBase * (1.0 + 0.62 * ddHorizon)
    + vec3(0.0020, 0.0028, 0.0042) * ddHorizon;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
  roughnessFactor = max(roughnessFactor, ${GLASS_RAMP.roughness.toFixed(2)});`,
    );
  };
  material.customProgramCacheKey = () => `${PROGRAM_KEY}-glass`;
  material.needsUpdate = true;
  return material;
}

/**
 * V3.71 Lane G — per-instance palette rows.
 *
 * **Row 0 is the V3.70 scheme above**, so a third of instances keep the hue story the last round
 * authored and graded, and this axis cannot become a silent re-colour of six buildings. It is not
 * byte-identical to V3.70: `LADDER_TRIM` below applies a value-only correction to every row,
 * including row 0, and the reason is measured in that comment.
 *
 * Rows 1 and 2 move **hue and chroma, not value.** §2.9 is the binding clause on a subject like
 * this (see §5.3.1: §2.10 governs the palette, not the material), and it is graded on the
 * PREDICTED PLATE VALUE ladder — so a row that pushed `wall` two stops would collapse the ladder
 * on that facade only, which is exactly the kind of fault a single-facade probe cannot see.
 * Every hex below was authored against `tests/v371-g-budget.mjs`, which runs the ladder for all
 * six ids at all four facades and both wall buckets, and no row moves a bucket's predicted plate
 * luma by more than five code values from row 0.
 *
 * `joinery` and `shadow` are deliberately absent from every row. They are the two buckets the
 * value contract has least room in — `shadow` is the only bucket authored below luma 26 and
 * `joinery` sits directly above it — and moving either is how a lane arrives back at §2.10's
 * original fault of one hue owning five elements.
 */
export const MODERN_PALETTE_ROWS = Object.freeze({
  'house-modern-skillion': Object.freeze([
    null,
    // Warm grey render over a grey-brown brick, with a browner charcoal roof: the same house
    // built by a different builder in the same street.
    Object.freeze({
      get wall() { return restyleColour('#a3a49a', '#a3a49a', { id: 'building:house-modern-skillion.wall' }); },
      get wallAlt() { return restyleColour('#473c35', '#b79b89', { id: 'building:house-modern-skillion.wallAlt' }); },
      get roof() { return restyleColour('#2f2a24', '#6d6153', { id: 'building:house-modern-skillion.roof' }); },
      get timber() { return restyleColour('#5a4028', '#7f5a38', { id: 'building:house-modern-skillion.timber' }); },
      garden: '#27300f'
    }),
    // Cooler render, redder plinth brick, blue-grey roof.
    Object.freeze({
      get wall() { return restyleColour('#96a4ac', '#96a4ac', { id: 'building:house-modern-skillion.wall' }); },
      get wallAlt() { return restyleColour('#553a2c', '#d79370', { id: 'building:house-modern-skillion.wallAlt' }); },
      get roof() { return restyleColour('#282a2c', '#5d6267', { id: 'building:house-modern-skillion.roof' }); },
      get timber() { return restyleColour('#653a1f', '#a25d32', { id: 'building:house-modern-skillion.timber' }); },
      garden: '#232d11'
    }),
  ]),
  // **r2 — this id's `wallAlt` is DERIVED from row 0, and that closes the r1 critic's regression
  // R1.** Its finding: *"palette row 2 moves the rear cube off V3.50's charcoal brick to buff,
  // collapsing the two-cube value contrast the id is composed around."*
  //
  // Two things are true and they pull in different directions, so both are stated. The §2.9 ladder
  // did NOT see this — measured on this checkout with `v371-g2-value.mjs`, the predicted plate gap
  // between `wall` and `wallAlt` runs 96 / 100 / 97 across the three rows, a drift of four code
  // values, and `v370-l1-palette-probe.mjs` reports 0 breaches on every row. So the row was not
  // moving the VALUE. What r1's rows did move is chroma: authored as free hexes, row 2's
  // `#443c34` carries about half again the chroma of row 0's `#413e39`, and warm chroma on a
  // masonry atlas whose own texels carry warm variation is exactly what reads as buff rather than
  // as charcoal — which is the mechanism the r12 comment on `MODERN_SURFACE_SCHEME` already
  // records for this same bucket ("the atlas brick region carries per-texel warm variation a
  // mean-based prediction cannot see").
  //
  // So the rows no longer author this bucket at all. Both are `tintShift()` of row 0's charcoal at
  // RESTORED LUMA and bounded chroma — which is precisely what the critic asked for ("take the
  // row's variation in hue and chroma at held value") and what `tintShift` was written to do. The
  // gap cannot drift now because it is the same luma by construction, and no row can reach buff
  // because the chroma is bounded to ±15 % of a hex whose chroma is 0.07.
  'house-modern-pavilion': Object.freeze([
    null,
    Object.freeze({
      wall: '#b3ab88',
      wallAlt: tintShift(MODERN_SURFACE_SCHEME['house-modern-pavilion'].wallAlt, 0.022, -0.15, 0),
      roof: '#2a2926',
      timber: '#573c28',
      garden: '#262f0c',
    }),
    Object.freeze({
      wall: '#bfa576',
      wallAlt: tintShift(MODERN_SURFACE_SCHEME['house-modern-pavilion'].wallAlt, -0.030, 0.15, 0),
      roof: '#252a30',
      timber: '#61371f',
      garden: '#222b10',
    }),
  ]),
  'townhouse-modern-brick': Object.freeze([
    null,
    // A grey-brown brick row. Still unambiguously brick — §5.3.1 permits the principal material
    // to dominate — but a different clay from its neighbour.
    Object.freeze({
      wall: '#aea992', wallAlt: '#5a4436',
      get roof() { return restyleColour('#2a2a2c', '#5f5f63', { id: 'building:townhouse-modern-brick.roof' }); },
      get timber() { return restyleColour('#66332a', '#b25847', { id: 'building:townhouse-modern-brick.timber' }); },
      garden: '#252c0b'
    }),
    // A red-brown brick row with a cooler roof and a darker red door.
    Object.freeze({
      wall: '#b6a486', wallAlt: '#663a26',
      get roof() { return restyleColour('#262c31', '#55626d', { id: 'building:townhouse-modern-brick.roof' }); },
      get timber() { return restyleColour('#742c1c', '#b24128', { id: 'building:townhouse-modern-brick.timber' }); },
      garden: '#212d10'
    }),
  ]),
  'townhouse-modern-render': Object.freeze([
    null,
    Object.freeze({
      get wall() { return restyleColour('#9ea296', '#9ea296', { id: 'building:townhouse-modern-render.wall' }); },
      get wallAlt() { return restyleColour('#4a453e', '#9d9384', { id: 'building:townhouse-modern-render.wallAlt' }); },
      get roof() { return restyleColour('#2b2b2b', '#646464', { id: 'building:townhouse-modern-render.roof' }); },
      get timber() { return restyleColour('#64472a', '#91673d', { id: 'building:townhouse-modern-render.timber' }); },
      garden: '#272d0d'
    }),
    Object.freeze({
      get wall() { return restyleColour('#8fa1ae', '#8fa1ae', { id: 'building:townhouse-modern-render.wall' }); },
      get wallAlt() { return restyleColour('#4f4136', '#a78972', { id: 'building:townhouse-modern-render.wallAlt' }); },
      get roof() { return restyleColour('#252b30', '#55636e', { id: 'building:townhouse-modern-render.roof' }); },
      get timber() { return restyleColour('#714220', '#a35f2e', { id: 'building:townhouse-modern-render.timber' }); },
      garden: '#222f12'
    }),
  ]),
  'apartment-modern-courtyard': Object.freeze([
    null,
    Object.freeze({
      get wall() { return restyleColour('#a4a49c', '#8a8a83', { id: 'building:apartment-modern-courtyard.wall' }); }, wallAlt: '#57422f',
      get roof() { return restyleColour('#2c2b2c', '#565356', { id: 'building:apartment-modern-courtyard.roof' }); },
      timber: '#5a3f2b',
      garden: '#293011'
    }),
    Object.freeze({
      get wall() { return restyleColour('#96a5ad', '#7e8b92', { id: 'building:apartment-modern-courtyard.wall' }); }, wallAlt: '#623927',
      get roof() { return restyleColour('#272b31', '#4b535e', { id: 'building:apartment-modern-courtyard.roof' }); },
      timber: '#633921',
      garden: '#252f10'
    }),
  ]),
  'apartment-modern-bar': Object.freeze([
    null,
    Object.freeze({ wall: '#a5a59d', wallAlt: '#57473a', roof: '#282827', timber: '#5e3d22', garden: '#252c0c' }),
    Object.freeze({ wall: '#95a5ae', wallAlt: '#623f2e', roof: '#25282c', timber: '#583b2b', garden: '#222b10' }),
  ]),
});

/**
 * V3.71 Lane G — a per-instance tint that moves HUE AND CHROMA AT CONSTANT VALUE.
 *
 * **This replaces `shade()` for the per-facade jitter, and the reason is a measurement.**
 * `shade()` is a pure value move — it multiplies toward black or lerps toward white — and the
 * V3.70 jitter ran it at ±0.03 on `wall`, `roof`, `garden`, `trim` and ±0.04 on `wallAlt` and
 * `timber`. The §2.9 ladder those buckets sit in is 6–14 code values wide in the 70–110 band, so
 * a ±0.04 value jitter is the same order as the band it is jittering inside.
 *
 * `tests/v371-g-budget.mjs` measured the consequence, which no earlier instrument could see:
 * `v370-l1-palette-probe.mjs` reads facade 0 with a stubbed variation source, and facade 0 is the
 * one facade where `spread` is zero. Across all four facades and both wall buckets the shipped
 * jitter produced **36 value collisions in 48 rows**. The palette was authored correctly and
 * graded correctly, and then jittered out of its own ladder on three facades in four.
 *
 * So the jitter keeps its job — no two neighbouring instances share a render tone — and loses its
 * power to break the ladder. The hue rotates, the chroma scales, and the luma of the authored
 * target is restored by construction. Value separation is what §2.9 grades; hue is what §2.10
 * asks to be varied. This moves the one and holds the other.
 *
 * Working space is whatever `THREE.Color` gives for a hex, exactly as `shade()` uses, so the
 * round trip through `getHexString()` is unchanged. Because `compensated()` divides the family
 * map back out, the authored target IS the effective albedo — so holding luma here holds it on
 * the material as well.
 */
export function tintShift(hex, dHue = 0, dSat = 0, dVal = 0) {
  const c = new THREE.Color(hex);
  const y0 = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const hsl = c.getHSL({ h: 0, s: 0, l: 0 });
  c.setHSL(
    ((hsl.h + dHue) % 1 + 1) % 1,
    Math.min(1, Math.max(0, hsl.s * (1 + dSat))),
    hsl.l,
  );
  const y1 = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (y1 > 1e-6) {
    // Restore the authored luma, then take whatever headroom is left before a channel clips.
    // A clip would be a silent value move, which is the exact fault this function exists to stop.
    const want = y0 * (1 + dVal);
    const peak = Math.max(c.r, c.g, c.b, 1e-6);
    c.multiplyScalar(Math.min(want / y1, 1 / peak));
  }
  return `#${c.getHexString()}`;
}

/**
 * V3.71 Lane G — the §2.9 separation trim.
 *
 * **This is not a re-colour. It is a value-only correction, and it was sized by measurement.**
 *
 * `tests/v371-g-budget.mjs` runs the predicted-plate ladder for all six ids across four facades
 * and two wall buckets — 48 rows where the shipped probe reads one — and it found the ladder is
 * intrinsically tight in the 60–110 band on every id. `joinery` is a CONSTANT at plate 76–77 on
 * all six (it takes no jitter and no row), and `timber` and `wallAlt` bracket it within a few
 * code values, while `roof` and `garden` close to 2–4 on the brick row. Two of those collisions
 * are visible at facade 0 and were reported by `v370-l1-palette-probe.mjs` as its two standing
 * breaches; the rest were invisible because the shipped probe reads the one facade where the
 * jitter is switched off.
 *
 * The trim moves `timber` down and `wallAlt` up — away from the fixed `joinery` pin — and opens
 * `roof`/`garden` where they close. Each number is a luma multiplier on the authored target, so
 * hue and chroma are untouched and §2.10's hue story is exactly what the last round authored.
 * The values are the smallest that clear a six-code-value gap on all 48 rows.
 */
const LADDER_TRIM = Object.freeze({
  'house-modern-skillion': Object.freeze({ timber: -0.12, wallAlt: 0.10 }),
  'house-modern-pavilion': Object.freeze({ timber: -0.10, wallAlt: 0.12 }),
  'townhouse-modern-brick': Object.freeze({ timber: 0.07, garden: 0.15 }),
  'townhouse-modern-render': Object.freeze({ timber: -0.30, wallAlt: 0.08, garden: 0.06 }),
  'apartment-modern-courtyard': Object.freeze({ timber: -0.13, wallAlt: 0.10 }),
  'apartment-modern-bar': Object.freeze({ wallAlt: -0.10, garden: 0.06 }),
});

export function modernPalette(materials, {
  id, districtId, facade, v, variant = null, eavesY = null,
}) {
  const base = MODERN_SURFACE_SCHEME[id] ?? MODERN_SURFACE_SCHEME['house-modern-skillion'];
  const row = MODERN_PALETTE_ROWS[id]?.[variant?.paletteRow ?? 0] ?? null;
  const merged = row ? { ...base, ...row } : base;
  const trim = LADDER_TRIM[id] ?? {};
  const scheme = { ...merged };
  // P17: inverse of atlas:joinery compensation selects the existing V67 metal swatch.
  if (['house-modern-skillion', 'townhouse-modern-brick', 'townhouse-modern-render', 'apartment-modern-courtyard'].includes(id)) {
    scheme.trim = restyleColour(scheme.trim, '#8d9196', { id: `building:${id}.trim` });
  }
  for (const [bucketName, dv] of Object.entries(trim)) {
    if (scheme[bucketName]) scheme[bucketName] = tintShift(scheme[bucketName], 0, 0, dv);
  }
  const atlas = getResidentialTextureAtlas(materials);
  const key = `v350|${id}|${districtId ?? 'none'}|f${facade}`;
  // §2.5 — nothing is a clean flat colour. `soil` is the wear shader's grime weight and the
  // baseline ran it at 0.72 on a near-black albedo, where grime has nothing to darken. On the
  // rebuilt ladder the darks have somewhere to go, so the weights go up across the board and
  // the wall bucket carries the heaviest base grime. `eavesY` is passed rather than left to
  // the shader's per-archetype constant table, which has no entry for a modern id and
  // silently switches the gutter-line marks off when it does not recognise one.
  const wear = {
    archetypeId: id,
    seed: v.unit(3410),
    soil: 1.05,
    storey: 3.2,
    eavesY: eavesY ?? null,
    patchX: v.range(3411, -2.2, 2.2),
    patchY: v.range(3412, 0.6, 1.8),
    patchWidth: v.range(3413, 0.7, 1.4),
    targetColor: null,
  };
  const spread = facade === 0 ? 0 : 1;
  return {
    wall: bucket(materials, atlas, {
      binding: BINDING.wall,
      color: tintShift(scheme.wall, spread * v.range(3400, -0.020, 0.020), spread * v.range(3420, -0.26, 0.26), spread * v.range(3440, -0.012, 0.012)),
      response: RESPONSE.render,
      variant: `${key}|wall`,
      wear: { ...wear, soil: 1.35 },
      emissive: EMISSIVE_FLOOR.wall,
    }),
    wallAlt: bucket(materials, atlas, {
      binding: BINDING.masonry,
      color: tintShift(scheme.wallAlt, spread * v.range(3401, -0.024, 0.024), spread * v.range(3421, -0.30, 0.24), 0),
      response: RESPONSE.masonry,
      variant: `${key}|wallAlt`,
      wear: { ...wear, soil: 1.45 },
      emissive: EMISSIVE_FLOOR.wallAlt,
    }),
    roof: bucket(materials, atlas, {
      binding: BINDING.iron,
      color: tintShift(scheme.roof, spread * v.range(3402, -0.028, 0.028), spread * v.range(3422, -0.32, 0.32), 0),
      response: RESPONSE.iron,
      variant: `${key}|roof`,
      // Streak weight, not grime weight. At 1.15 the corrugated wear branch put enough rust
      // into the roof to swing it orange on the r2 plate; 0.30 leaves the streaks below the
      // fixings that §2.5 asks for and lets the charcoal stay charcoal.
      wear: { ...wear, soil: 0.30 },
      emissive: EMISSIVE_FLOOR.roof,
      skipAtlas: true,
    }),
    trim: bucket(materials, atlas, {
      binding: BINDING.trim,
      color: tintShift(scheme.trim, spread * v.range(3403, -0.018, 0.018), spread * v.range(3423, -0.24, 0.24), spread * v.range(3443, -0.010, 0.010)),
      response: RESPONSE.trim,
      variant: `${key}|trim`,
      wear: { ...wear, soil: 0.70 },
      emissive: EMISSIVE_FLOOR.trim,
    }),
    joinery: bucket(materials, atlas, {
      binding: BINDING.joinery,
      color: scheme.joinery,
      response: RESPONSE.joinery,
      variant: `${key}|joinery`,
      wear: { ...wear, soil: 0.55 },
      emissive: EMISSIVE_FLOOR.joinery,
    }),
    glass: glassBucket(materials, `${key}|glass`),
    shadow: bucket(materials, atlas, {
      binding: BINDING.shadow,
      color: scheme.shadow,
      response: RESPONSE.shadow,
      variant: `${key}|shadow`,
      wear: { ...wear, soil: 0.2 },
      emissive: EMISSIVE_FLOOR.shadow,
    }),
    timber: bucket(materials, atlas, {
      binding: BINDING.timber,
      color: tintShift(scheme.timber, spread * v.range(3406, -0.010, 0.010), spread * v.range(3426, -0.12, 0.12), 0),
      response: RESPONSE.timber,
      variant: `${key}|timber`,
      wear: { ...wear, soil: 0.55 },
      emissive: EMISSIVE_FLOOR.timber,
      skipAtlas: true,
    }),
    garden: bucket(materials, atlas, {
      binding: BINDING.garden,
      color: tintShift(scheme.garden, spread * v.range(3405, -0.018, 0.018), spread * v.range(3425, -0.22, 0.22), 0),
      response: RESPONSE.garden,
      variant: `${key}|garden`,
      wear: { ...wear, soil: 0.4 },
      emissive: EMISSIVE_FLOOR.garden,
      skipAtlas: true,
    }),
  };
}
