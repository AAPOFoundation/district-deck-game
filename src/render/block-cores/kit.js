// District Deck V3.33 — block-core kit.
// Shared primitives, material buckets and construction helpers for the 16 × 16 m
// centre tile of each city block. Scripts enforce; the critic judges plates.
//
// Deterministic: hash only. No Math.random, no clock. Does not import board.js
// (the reserve / residential / traffic seats own those files).

import * as THREE from 'three';
import { readRestyle, restyleColour } from '../style/restyle.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MaterialLibrary } from '../materials.js';
import { TASTE } from '../taste-tokens.js';
import { enableStaticInstanceCulling } from '../static-instance-culling.js';

const DEG = Math.PI / 180;
export const CORE_PAD = 15.4;

/**
 * The top surface of the board tile, in metres. Exported because r1 did not have it and
 * the absence cost a fault on every object.
 *
 * `boardTile()` lays its ground disc as `cylEx(ground, …, 0.09, 0, top + 0.015, 0)` with
 * `top = 0.20`, so the surface a miniature actually stands on is at **0.26**. Every
 * ground-contact helper in the r1 kit defaulted to `y = 0.205` or `y0 = 0.20` — six
 * centimetres BELOW it. The consequences are visible on the r6 plates and were reported
 * by the critic as three separate faults without the common cause being found:
 *
 *   * `paverRun` / `paverField` laid pavers spanning 0.17–0.24 under a 0.26 ground, so
 *     only the paver tops were level with the surface and the relief was zero. That is
 *     blind pair-04 fault 2 — "A's paving is units; B's paving is a drawing… a flat
 *     orange plane with dark lines scribed on it and no relief" — and pair-03 fault 3.
 *     The pavers were modelled correctly and then sunk.
 *   * `leafShrub` at `y0 = 0.20` put its lowest mass under the ground plane, which is the
 *     flat-cut green blob visible at the tile edge on `r6-substation-v0`.
 *   * `tufts` at `y = 0.24` sat their clumps half-buried, so they read as flat blades
 *     rather than standing proud — blind pair-02 fault 3.
 *
 * Helpers now default from this constant. A caller working on a raised surface (the
 * stormwater bund crest, the mobility-hub planter tops) still passes its own height.
 */
export const CORE_GROUND = 0.26;

/**
 * V3.71 lane I r2 — THE SECOND GROUND, AND THE REASON r1's "BUG FIX" WAS BACKWARDS.
 *
 * There are TWO ground conventions in this kit and r1 assumed there was one.
 *
 *   * `boardTile()` lays a ground disc whose surface is `CORE_GROUND` **0.26**.
 *   * `hardstand()` lays `pad(fill, size, HARDSTAND_Y, HARDSTAND_T)`, a box centred at 0.10
 *     and 0.16 thick, so its surface is **0.180**, with the expansion joints standing proud
 *     to 0.200.
 *
 * r1 read `oilSpot`'s discs (tops at 0.200 and 0.2025) against `CORE_GROUND` 0.26, concluded
 * they were buried, and raised them to it. But **both callers of `oilSpot` draw on
 * `hardstand`** — `works-yard` and `laneway-court`, neither of them named in r1's report —
 * so the discs were bedded 10 mm into the slab and standing 20 mm proud, level with the
 * joint lines, visible and correct. Raised to 0.26 they hang **73 mm in the air**: fifteen
 * of them across two block centres, reading at 5× as black pucks with a lit side wall and
 * their own cast shadow.
 *
 * It passed every gate this programme owns. `FLOAT_GAP` is 0.14, so a 73 mm float clears the
 * float check, and it clears every §3.6 containment sweep. Only a plate of ANOTHER lane's
 * subject shows it (§5.5.7, written from this lane's r1).
 *
 * So the two surfaces are now named constants, `hardstand()` is built from them so they
 * cannot drift apart, and every helper that beds something into a working surface takes
 * `ground` as an argument. A helper that ASSUMES its ground is a helper the next caller
 * inherits this bug from.
 */
export const CORE_HARDSTAND_Y = 0.10;
export const CORE_HARDSTAND_T = 0.16;
export const CORE_HARDSTAND = CORE_HARDSTAND_Y + CORE_HARDSTAND_T / 2;   // 0.180 exactly

// V3.70 L5 — `car-park` is retired from the roster. types/car-park.js stays on disk,
// unregistered, so nothing that still imports it breaks.
export const CORE_TYPES = Object.freeze([
  'playground',
  'sewerage-plant',
  // V3.71 lane I — `car-park` is back on the roster with a builder of its own.
  //
  // It was never off the DRAW. `CORE_USE_WEIGHTS` (`core/city.js:98–123`) names it in all
  // six districts, `landuse.js` carries its label and all three influence curves, and
  // `city.js:755` lists it as a sewerage candidate — so of the thirteen ids here it is the
  // only one whose gameplay hooks were already wired when V3.70 retired it. What V3.70
  // actually did was drop it from this list and alias it to `mobility-hub` in `index.js`,
  // which meant every car park the city drew rendered as a different object. The alias is
  // gone; the id draws itself.
  'car-park',
  'pocket-park',
  'community-garden',
  'works-yard',
  'laneway-court',
  'substation',
  'stormwater-basin',
  'brigade-bay',
  'mobility-hub',
  'market-hall',
  'district-energy',
]);

/** Shared buckets — one MeshPhysicalMaterial each for the whole layer. */
export const BUCKET_IDS = Object.freeze([
  'soil', 'turf', 'softfall', 'asphalt', 'yard', 'yardOil', 'path',
  'timber', 'paintY', 'paintB', 'paintR', 'paintG', 'paintO',
  'steel', 'brick', 'concrete', 'water', 'foliage', 'glass',
  // V3.70: roof and joinery need their own value bands. §2.9 reads the model in
  // greyscale — steel at #c8d0d6 cannot be both the roof and the metalwork.
  'roof', 'trim', 'tileRoof',
]);

export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function unit(seed, salt) {
  return hash32(`${seed}:${salt}`) / 0x100000000;
}

/**
 * V3.70 r2 — the authored colour of every bucket, as one exported table.
 *
 * It is exported because §2.9 and §2.10 are measurable and were not being measured.
 * `mvp/tests/v370-l5-geometry-probe.mjs` reads this table and reports, per object, the
 * luma ladder its buckets occupy and the triangle-weighted mean saturation; the r1
 * palette scored 0.496 there and the r6 plates measured 0.509 on
 * `v370-l5-value-probe.py`, so authored chroma predicts plate chroma to within 0.013 and
 * this table can be tuned against a number instead of an opinion.
 *
 * The target is the Monopoly-Plus reference pack, measured rather than assumed:
 *   mean subject saturation 0.253 · 8.17 populated 16-wide luma bands · p98 luma 144–184.
 * The r6 plates measured 0.509 · 6.33 bands · p98 114–138. Two faults, both §2.10:
 * every paint bucket was a full primary, and the whole ladder sat in the bottom half.
 *
 * So this table does three things at once:
 *   1. halves saturation across the paint buckets (mean 0.496 → 0.256);
 *   2. lifts the light end (path / concrete / trim carry the paving and joinery, which
 *      is the largest area in every reference plate, and it is a LIGHT area);
 *   3. spreads the collisions r1 shipped — brick 131 / tileRoof 131 / paintO 130 all in
 *      one bin on `market-hall`, and steel 207 / trim 210 in one bin on four of the six.
 *
 * Nothing sits below luma 40. §5.2 of the spec: the grade multiplies hue at the bottom
 * of the curve, so an albedo authored near black comes back as the only chroma left in
 * the pipe. `glass` at 45 is the darkest thing in the layer and it is deliberate.
 *
 * Families are unchanged from r1. `MaterialLibrary._create()` multiplies a family's
 * procedural map by the authored colour, so moving a bucket between families changes far
 * more than its value, and that experiment is not part of this round.
 */
export const CORE_COLOURS = Object.freeze({
  // V3.70 r12. Every number in this table is a RENDERED ground luma, not an authored one,
  // out of `mvp/tests/v370-l5-swatch.mjs` — the lab's whole chain (family map multiply →
  // hemi + sun → ACES at exposure 1.05 → sRGB). Authored luma is not a target. It is an
  // input to a transfer function with a per-family gain in front of it, and reading this
  // table as a colour chart is reading the input as the output.
  //
  // The family casts, measured through the shipped generators, white through each family:
  //
  //     render 1 : 0.960 : 0.862      corrugated 1 : 0.959 : 0.884
  //     concrete 1 : 0.979 : 0.904    glass/water 1 : 0.998 : 0.983
  //     brick 1 : 0.805 : 0.671       sand 1 : 0.886 : 0.635
  //     slate 1 : 1.045 : 1.202  ← the only COOL family in the layer
  //
  // ─────────────────────────────────────────────────────────────────────────────────────
  // r12 — WHAT THE r4 PALETTE BOUGHT, WHAT IT COST, AND WHAT THIS ONE CHANGES.
  //
  // r4 broke the hue monopoly and the r11 critic verified it on the capture: dominant-hue
  // share 0.592 → 0.385 on all twelve rows, colour count +37 %, median local range +25 %.
  // That gain is real and it is kept.
  //
  // It was paid for on the axis §5.0's block-centre exemption explicitly RETAINS. Measured
  // on the r11 plates against the six `mp-block-*` panels, subject-masked:
  //
  //     luma span (p95−p5)   131.5 → 111.2   reference 147.7   — 20 luma of span given back
  //     5th-percentile luma   21.1 →  30.8   reference  16.3   — the darks lifted 9.7
  //     median luma           68.4 →  78.7   reference  69.5   — a matched median given up
  //
  // I re-measured the six reference panels myself before touching a hex, with the same
  // flood-plus-sweep mask, and the finding that matters is WHERE the gap is:
  //
  //     reference share below luma 40   14.2 – 31.4 %   (mean 23.0)
  //     ours                             4.8 – 13.6 %
  //     reference share above luma 163    0.3 –  4.6 %   (mean  1.7)
  //     ours                             0.0 –  0.1 %
  //
  // **The top end is not the deficit — the reference barely uses it either. The whole of
  // the missing span is the DARK end.** r4 lifted `tileRoof` 23 → 50 and `roof` 29 → 55 to
  // clear a register floor and took the bottom of the ladder with it. So this table puts
  // the bottom back without going near black, and buys the top back in area rather than in
  // authored value.
  //
  // r11 also found that a dominant bin at 30° is NOT the defect r4 diagnosed it as: five of
  // the six reference panels are themselves dominant at 30°, at shares 0.478–0.844. The
  // SHARE was the fault; the BIN was correct, and r4's correction rotated six of twelve rows
  // to 60° where no reference sits. So `path`, `steel`, `trim` and `tileRoof` come back to
  // the 30° bin — paving, metalwork, joinery and roof sheet are warm in every reference —
  // and the share is held down by AREA instead: green planting and cool concrete carry real
  // surface on every object, which is what §2.6 and the apron work are for.
  //
  // THE LADDER IS A 17-LUMA GRID, SOLVED RATHER THAN GUESSED. `LADDER_MIN` is 14 rendered
  // luma between two buckets that both own real area on the same object, and the worst case
  // in the lane is `brigade-bay` and `market-hall`, which each carry EIGHT buckets over the
  // 4 % threshold at once. Eight rungs between `soil` at 31 and `trim` at 148 is 117 / 7 =
  // 16.7, so the grid is 31 · 48 · 65 · 82 · 99 · 115 · 132 · 148 and every bucket is
  // assigned a rung such that no two buckets sharing an object share a rung. Buckets that
  // never co-occur may share one (`roof`/`tileRoof`, `turf`/`tileRoof`/`paintG`,
  // `path`/`paintR`, `steel`/`timber`), and each such pair is noted below.
  //
  // Every hex was solved against the rendered value by binary search over authored HSV
  // (target rendered luma ±1.2, target rendered hue bin, target rendered saturation), never
  // hand-picked. The swatch board reproduces every row.
  //
  //                        auth → ground (sunlit) · rendered hue bin · rung · rendered sat
  // A second solve pass raised the saturation of the six buckets that carry the largest
  // areas of PLANTING, EARTH and PAVING without moving their rendered luma or their hue bin
  // by more than a degree — `soil` 0.21 → 0.31, `path` 0.15 → 0.22, `turf` 0.38 → 0.45,
  // `foliage` 0.41 → 0.47, `timber` 0.35 → 0.40, `water` 0.45 → 0.50. Measured against the
  // six reference panels the lane sits at 0.22 mean subject saturation and they sit at 0.267,
  // and the shortfall is concentrated on `stormwater-basin` (0.351) and `brigade-bay`
  // (0.321), the two most saturated plates in the pack. Value and bin are untouched, so this
  // costs nothing on the axis the round was opened to recover.
  //
  // ─────────────────────────────────────────────────────────────────────────────────────
  // r14 — THE LADDER IS SOLVED AGAINST THE VALUE THE PLATE SHOWS, NOT AGAINST ONE
  // ORIENTATION, AND THAT IS THE WHOLE OF THIS ROUND'S PALETTE WORK.
  //
  // Every previous table in this file was authored against `renderSwatch(hex, family,
  // ground)` — a sunlit HORIZONTAL. The r3 comment on that function claimed one orientation
  // was enough because "the ORDER of the ladder is preserved and only its spacing scales".
  // Measured over the real face normals of all twelve rows, that is false, and it is false
  // by a lot: every bucket renders BELOW its ground value once its own geometry is applied,
  // and the drop runs from 3.8 luma (`path`, 79 % of its area facing up) to 52.3 luma
  // (`steel`, 68 % of its area vertical). A ladder that is 17 apart on the ground read is
  // 3 apart on the plate wherever a mostly-vertical bucket sits beside a mostly-horizontal
  // one.
  //
  // That is exactly the r13 critic's K1: `market-hall`'s gable wall measured **57.7** and
  // its main roof slope **60.5** on the r13 plate — 2.8 apart, against 70.2 and 114.5 on
  // `mp-block-market-hall`. The authored ladder put `brick` at 82 and `tileRoof` at 65 and
  // the probe reported no collision, and both were true statements about a surface neither
  // of those two buckets mostly has. Reading the geometry, `brick` is 65 % vertical and
  // `tileRoof` 80 % up-facing, so they render 46.5 and 49.9. The instrument agreed with the
  // plate to 3 luma the moment it was asked the right question.
  //
  // So the ladder below is a FACE ladder: for each bucket, the area-weighted mean of
  // `renderSwatch` over that bucket's own face normals across all twelve rows, undersides
  // excluded because no plate has them. `v370-l5-geometry-probe.mjs` computes the same
  // statistic and gates §2.9 on it; the ground read is still reported beside it, because it
  // is the right comparison for two UP-FACING surfaces and that is what a §2.5 drift lobe
  // lying on an apron is.
  //
  // Each hex was found by binary search over authored HSV against that statistic — hue and
  // saturation held, value solved — and the rung assignment came from a deterministic
  // 200-start coordinate descent over the measured co-occurrence graph, with each bucket's
  // own reachable ceiling as a hard bound and the identity orderings below as constraints.
  // It lands **zero collisions on all twelve rows at LADDER_MIN 14**, measured on the face
  // ladder rather than on the ground one.
  //
  // WHAT A CEILING IS, AND WHY IT DECIDED THIS TABLE. A bucket cannot be authored above
  // what white through its family reaches on its own orientation mix. Measured:
  //
  //     brick     71.8   ← the binding one: 65 % vertical through a 0.29-gain map
  //     paintR    90.0        steel 106.3      roof 107.7      tileRoof 108.0
  //     paintB   113.3        timber 115.2     trim 118.4      foliage 120.2
  //     paintG   124.8        turf 142.6       path 147.5      water/glass 170+
  //
  // `concrete` was 80.9 through the `concrete` family, and that single number was what
  // jammed the middle of the ladder: `brick` and `concrete` could not both sit in it with
  // anything between them, and the only remaining answer was to take the brick shed down to
  // 34 to make room. It moves to `limestone` (see `CORE_FAMILIES`) and reaches 117.3, which
  // is what lets `brick` sit where the reference market gable sits and the roof sit 28
  // above it instead of 3.
  //
  // §5.3.2 / L-A. The planting is the round's first priority and it is a value fix, not a
  // texture one. Measured per bucket over real face normals: `foliage` **36.8 → 115.6** and
  // `turf` **60.5 → 130.1**, with the share of each bucket's own area under luma 25 going
  // **27.4 % → 0.0 %** and **5.6 % → 0.0 %**. The six reference panels measure 101.1–131.1
  // on their green pixels. The other two prescriptions in §5.3.2 were tried and measured:
  // `envIntensityBase` is INERT here (`core-lab.js` sets no `scene.environment`, so
  // `envMapIntensity` multiplies nothing — grep is the receipt), and yawing the masses is
  // worth 0.3 luma in this rig because the lab's key is (0.520, 0.780, 0.347) and no face
  // sits at `n·l = 0` the way a card does under the pinned rig's (0.765, 0.640, −0.066).
  // The geometry change is kept — it is free and it breaks the box silhouette — but it is
  // not what moved the number and this table says so.
  //
  //                        authored → FACE (the plate) · ground read · rendered bin · sat
  glass: '#2e323e',      //   →  12    17    210   0.40  deep-set glazing; darkest body here
  soil: '#565655',       //   →  18    29     30   0.31  plinth, reveal voids, grime, tile
                         //              skirt, and the dark ironwork — palisade pales,
                         //              rails and handrails, which is r11's S2 closed by
                         //              putting the fence BEHIND its subject in value.
  roof: '#80827c',       //   →  32    43     30   0.22  seamed metal deck
  get timber() { return restyleColour('#a39b7d', '#efe3b7', { id: 'core:works-yard.timber' }); },     //   →  44    65     30   0.49  stalls, posts, sleepers, decking.
                         //              Down from a face 96: a market trestle that reads
                         //              as dark timber under bright produce is the
                         //              reference's own arrangement, and `timber` is
                         //              `market-hall`-only above the inclusion threshold.
  asphalt: '#8b91a6',    //   →  44    44    210   0.15  (pre-existing types only)
  // taste-r1 W10-C: the service-yard ground. The same token the streets use, in the `asphalt`
  // family (not the `concrete` slab map the old pad borrowed, whose joint grid and bolt dots
  // read as a floor plan). This row is the one exception to "author against the rendered
  // value": it is the street's own value, so the yard and the street beside it match.
  get yard() { return restyleColour(TASTE.built.asphalt, '#9f9c98', { id: 'core:works-yard.yard' }); },
  // The yard's stains, patches and drain channel: the same family one step darker (about 20 %
  // under the pad on screen), so a mark reads as a darker patch of the same ground. `soil` was
  // tried first and renders LIGHTER than the pad (V 52 against 40), which turned every stain
  // into a pale blotch.
  yardOil: '#3C3B39',
  paintG: '#7e9e8c',     //   →  46    61     90   0.32  drab plant green, `substation` only.
                         //              Capped at 82 in the solve: it is 23 % of that
                         //              object's visible area, and a bright green there
                         //              turns a zone substation mint rather than fixing
                         //              anything.
  paintR: '#dda69f',     //   →  57    76      0   0.53  signal red. IMPROVE ROUND: +11 on
                         //              the face ladder, and it is a rung that was empty.
                         //              `brigade-bay` is the only object carrying this
                         //              bucket over the inclusion threshold and it had
                         //              `brick` at 51 and `paintR` at 57 — 5.6 and 2.9 apart
                         //              on the two variants, the tightest live pair in the
                         //              lane and the fire brigade's own red sitting on its
                         //              own brick. The window is set at both ends by the
                         //              buckets either side: `brick` at 51 below and
                         //              `concrete` at 82 above, 31 luma for two rungs, so
                         //              66 is the only place a third rung fits and 90.0 is
                         //              this bucket's own reachable ceiling. Measured:
                         //              `brigade-bay` v0 goes from seven bands with a
                         //              collision to EIGHT with none, v1 from 2.9 to 12.7.
  paintB: '#6d80c2',     //   →  55    88    210   0.43  slate blue accent
  water: '#4a6675',      //   →  57    62    180   0.50  THE POND, and r13's W3. r12 authored
                         //              it a warm brown at rendered 38 and conceded in this
                         //              file that it "separates from the mud it sits in by
                         //              hue and by smoothness rather than by value" — §2.9
                         //              is a value clause, and the critic measured `water`
                         //              38.2 against `soil` 31.0 and `foliage` 49.9, both
                         //              inside `LADDER_MIN`. It is a cool slate pond now, and
                         //              the value was set TWICE: the first r14 solve put it
                         //              at face 59, which is clear of `soil` and lands on
                         //              `concrete` — because the basin's terrace concrete is
                         //              mostly vertical riser and renders 59 on that object
                         //              even though it renders 93 on a flat apron. That is
                         //              the per-row half of the face finding and the face
                         //              ladder is what caught it. At 40 the pond is 21 luma
                         //              off the mud and 19 off the terraces on the plate,
                         //              and 180° against their 30°/210°.
                         //              IMPROVE ROUND: +19 more, and the plate is the
                         //              reason. At a rendered 43 the pond sat 15 luma above
                         //              a `soil` bed at 28 — a real gap by the probe's
                         //              arithmetic and, photographed, two dark things
                         //              inside a shaded bowl reading as one black
                         //              rectangle. Both halves of that are fixed together:
                         //              the basin's bed moves to `concrete` at 93 and the
                         //              pond comes up to 62, so the sheet is 31 luma DARKER
                         //              than what it lies on instead of 15 lighter, and it
                         //              is read against the bed rather than lost in it.
                         //              62 is bounded above by `concrete` 93 (31 clear) and
                         //              below by nothing that matters — `water` is under the
                         //              4 % inclusion threshold on both basin variants and
                         //              appears nowhere else in the six, so this value is a
                         //              read decision and is not moving any gate.
  brick: '#bdd0b1',      //   →  60    92     30   0.43  red-brown, and the market's PRODUCE.
                         //              60 is 12 under the reference gable's own 70.2 and
                         //              inside this bucket's 71.8 ceiling.
  concrete: '#9ea9c4',   //   →  74    93    210   0.08  cool grey. Re-authored bluer for the
                         //              `limestone` map's warmer balance so the bucket
                         //              stays in the 210° bin at the same rendered chroma
                         //              it had before the family move.
  softfall: '#919087',   //   →  74    74     30   0.31  (playground only)
  steel: '#ecf2fc',      //   →  88   134     30   0.11  galvanised, bright metal only
  tileRoof: '#cfdeff',   //   →  88   110    210   0.12  SLATE, AND COOL FROM THIS ROUND.
                         //              Value and rung are unchanged — 88 on the face
                         //              ladder, which is K1's 28 luma above the `brick` it
                         //              rendered 3.4 from on the r13 plate, and `steel`
                         //              still shares the rung and still never co-occurs.
                         //              What moved is the BIN, from 30° to 210°, and it is
                         //              a composition fix rather than a paint preference.
                         //              `market-hall` is the only object in the six that
                         //              carries this bucket over the inclusion threshold,
                         //              and it was the lane's last §2.10 breach on BOTH
                         //              ends: its warm bin owned 0.800 of the chroma against
                         //              a 0.79 ceiling, and only TWO bins carried 5 % against
                         //              a floor of three, because everything a market shed
                         //              is made of — sett paving, timber trestles, brick end
                         //              wall, cream joinery — is warm and the roof was warm
                         //              too. Slate is the one element on the object that is
                         //              cool in every reference plate of a market shed,
                         //              including `mp-block-market-hall.png`. Measured: warm
                         //              share 0.800 → 0.724 and 0.771 → 0.701, bins 2 → 3 on
                         //              both variants, no value moved, no bucket added.
  trim: '#e5eaf3',       //   → 102   137     30   0.11  joinery, fascia, capping
  paintO: '#ffeda6',     //   → 102   150     30   0.48  accent, small areas only
  foliage: '#abe8b4',    //   → 116   145     90   0.33  canopy and massed planting. This is
                         //              the L-A fix and it is 79 luma of it.
  paintY: '#d8ff9e',     //   →  98   153     60   0.48  hazard accent, small areas only;
                         //              ceiling-bound at 106 rather than target-bound
  turf: '#bcfdc4',       //   → 133   149     90   0.34  mown lawn. IMPROVE ROUND: +2.1
                         //              rendered luma on the face ladder, 3.0 on the ground
                         //              read, and it is the cheapest six-warning fix in the
                         //              round. `trim` and `path` both sat 12.4-13.4 UNDER
                         //              `turf` on six rows — `stormwater-basin` path/turf
                         //              13.1 and 13.4, `mobility-hub` trim/turf 12.8 and
                         //              13.4, `district-energy` trim/turf 12.4 and 12.4 —
                         //              every one inside LADDER_MIN and every one a lawn
                         //              against a made surface, which is §2.9's own example
                         //              of muddiness. The bound is NOT this bucket's own
                         //              142.6 face reach: it is `v370-l5-swatch.mjs`'s
                         //              GROUND_CEIL of 150 on any bucket over 4 % of the
                         //              visible lot, and 149.0 is the largest value that
                         //              clears it. Same deference r14 gave that probe on
                         //              `path`, at the other end of the same pair.
  path: '#eaeae3',       //   → 144   159     30   0.17  setts and paving. The brightest
                         //              bucket in the lane, and its value is set by ANOTHER
                         //              PROBE rather than by this solve: `v370-l5-swatch.mjs`
                         //              caps any bucket over 4 % of the VISIBLE LOT at a
                         //              rendered ground luma of 150, and the first r14 solve
                         //              put `path` at 161 and failed that probe on six rows.
                         //              148 is the largest value that clears it. The cost is
                         //              named in the report: it compresses the top of the
                         //              ladder, and the residual collisions on `mobility-hub`
                         //              and `stormwater-basin` are where that compression
                         //              lands.
  //
  // THE CEILING: white through `render` on a sunlit ground plane renders 163, through
  // `corrugated` 134, through `limestone` 160, through `brick` 114. The core lab applies no
  // `post.js` grade and no environment, so this lane cannot author to the residential
  // pack's median (§5.0 upheld that escalation). What it holds is the ladder, the floor,
  // and the hue distribution — which is what §5.0 says block centres are graded on.
  //
  // §2.10, THE BIN LAYOUT, stated so the next round can see the design rather than infer it:
  //     30° warm      soil · roof · timber · brick · path · steel · trim · tileRoof ·
  //                   softfall · paintO         ← where five of six references sit
  //     90° green     foliage · turf · paintG   ← the planting, and only the planting
  //    180/210° cool  glass · asphalt · concrete · paintB · water
  //     60° yellow    paintY                    ← hazard marking, never a big surface
  //      0° red       paintR
  //
  // The share is controlled by AREA and the gate that reads it is CHROMA-WEIGHTED from r14,
  // because an unweighted area vote lets `concrete` at 0.08 chroma and `steel` at 0.11 cast
  // full votes for "warm" and makes the statistic a measure of which side of neutral the
  // near-greys fall on. See `v370-l5-geometry-probe.mjs`.
  // is the correction r4's own §1 asked for in its last line and then did not take.
});

/**
 * V3.70 r3 — the family each bucket is bound to, as one exported table.
 *
 * It is exported for the same reason `CORE_COLOURS` is, and it turned out to matter more.
 * `MaterialLibrary._create()` keeps the authored colour AND binds the family's procedural
 * albedo map, and three multiplies them, so the family is a per-bucket GAIN on top of the
 * hex. Measured on the shipped generators (`mvp/tests/v370-l5-swatch.mjs`, linear mean of
 * the albedo map):
 *
 *     sand 0.58 · render 0.60 · corrugation 0.40 · brick 0.29 · concrete 0.29
 *     slate 0.14 · foliage 0.10 · timber 0.10 · asphalt 0.03
 *
 * That is a 20× spread, and it is why r2's palette reasoning was true of the table and
 * false of the plate: `soil` authored at luma 66 rendered at 12.5 because the `concrete`
 * map halves it twice over, and `foliage` authored at 112 rendered at 12. Neither can be
 * rescued by editing a hex — to land `soil` at a visible 45 through `concrete` the authored
 * value would have to exceed 255. **The family is the value lever; the colour is the hue
 * lever.** The swatch board prints both and the probe reads this table, so the renderer and
 * the instrument cannot disagree about which gain applies.
 */
export const CORE_FAMILIES = Object.freeze({
  soil: 'render',        // r3: was `concrete` (gain 0.29 on an already-dark hex → 6 luma)
  turf: 'render',        // r3: was `sand`, whose map is warm 1:0.88:0.65 — it is what turned
                         //     an authored 0.29 green into the bilious olive at 0.64 the
                         //     critic measured. `render` is 1:0.96:0.88, near neutral.
  softfall: 'render',
  asphalt: 'concrete',
  yard: 'asphalt',       // W10-C: the streets' own family.
  yardOil: 'asphalt',
  path: 'render',        // r3: was `sand`. Kept warm by its hex instead of by the map.
  timber: 'render',      // r3: was `timber` (gain 0.10 → 15 luma; posts and stalls read black)
  paintY: 'render',
  paintB: 'render',
  paintR: 'render',
  paintG: 'render',
  paintO: 'render',
  steel: 'render',
  brick: 'brick',        // stays: the bond pattern IS the bucket
  /**
   * r14: was `concrete`. The `concrete` albedo map is a dark aggregate — linear mean 0.29
   * against `limestone`'s 0.44 — and once the ladder is measured on real face normals
   * rather than on one sunlit horizontal, that gain is the single constraint jamming the
   * middle of the lane's ladder. Measured: `concrete` carries 12–27 % of the visible face
   * area on ten of the twelve rows, and through the `concrete` family its reachable FACE
   * ceiling is **80.9** — so `brick` (ceiling 71.8) and `concrete` cannot both sit in the
   * 14-luma ladder with anything between them, and the optimiser's only remaining answer
   * was to take the brick shed down to 34 to make room. Through `limestone` the ceiling is
   * 111.6, which is what lets `brick` sit where the reference market gable sits (70.2) and
   * the roof sit 44 above it, which is K1.
   *
   * This is §5.0's own remedy, not a dodge: "the family map is a per-bucket gain with a 20x
   * spread… author against the rendered value, never the hex", and r3 made the same move
   * four times (`soil`, `turf`, `foliage`, `timber` all off families that rendered them
   * black). `limestone` keeps a stone texture — §2.5 and §2.7 both want one — and its
   * albedo balance is 1:0.934:0.763 against `render`'s 1:0.928:0.764, so nothing about the
   * hue behaviour is new to this lane. The authored hex is re-solved for the warmer map so
   * the bucket stays in the 210° cool bin, which is checked by the geometry probe.
   */
  concrete: 'limestone',
  water: 'water',
  foliage: 'render',     // r3: was `foliage` (gain 0.10 → 12 luma; every canopy was a void)
  glass: 'glass',
  roof: 'corrugated',    // stays: the corrugation profile IS the bucket
  trim: 'render',
  tileRoof: 'corrugated',
});

// Only the works-yard builder derives these colours. Other cores retain their
// shared palette; clones retain the existing texture, hooks and program key.
const worksYardPalettes = new WeakMap();
export function deriveWorksYardPalette(palette) {
  if (!readRestyle(globalThis.location?.search ?? '').enabled) return palette;
  if (worksYardPalettes.has(palette)) return worksYardPalettes.get(palette);
  const out = { ...palette };
  for (const role of ['paintY', 'steel']) {
    const base = palette[role];
    const material = base.clone();
    material.userData = { ...base.userData };
    if (Object.hasOwn(base, 'onBeforeCompile')) material.onBeforeCompile = base.onBeforeCompile;
    if (Object.hasOwn(base, 'customProgramCacheKey')) material.customProgramCacheKey = base.customProgramCacheKey;
    material.color.copy(restyleColour(base.color, base.color.clone().multiplyScalar(2),
      { id: `core:works-yard.${role}` }));
    out[role] = material;
  }
  const result = Object.freeze(out);
  worksYardPalettes.set(palette, result);
  worksYardPalettes.set(result, result);
  return result;
}

export function createCorePalette(materials) {
  // Family + roughness stay per bucket; the colour comes from the one exported table so
  // the probe and the renderer can never disagree about what was authored, and since r3
  // the family comes from `CORE_FAMILIES` for the same reason.
  const B = (bucket, family, variant, extra = {}) => materials.get(CORE_FAMILIES[bucket] ?? family, {
    variant, color: CORE_COLOURS[bucket], ...extra,
  });
  return Object.freeze({
    soil: B('soil', 'concrete', 'core-soil', { roughness: 0.94 }),
    // §2.9. turf / foliage / water sat in one dark-green band in the 2026-08-17 build, so
    // a greyscale read of any planted core came out muddy. Split into three: mown lawn
    // (light), canopy (deep), water (slate — a pond is not algae). The `foliage` texture
    // set multiplies its own dark leaf albedo, so any green fed to it comes back
    // canopy-dark; lawn takes the fine-grain `sand` set instead.
    turf: B('turf', 'sand', 'core-turf', { roughness: 0.94, metalness: 0 }),
    softfall: B('softfall', 'render', 'core-softfall', { roughness: 0.88, metalness: 0 }),
    // Concrete family — asphalt texture set crushes to a black void on the lab.
    asphalt: B('asphalt', 'concrete', 'core-asphalt', { roughness: 0.93 }),
    yard: B('yard', 'asphalt', 'core-yard', { roughness: 0.94, metalness: 0 }),
    yardOil: B('yardOil', 'asphalt', 'core-yard-oil', { roughness: 0.82, metalness: 0 }),
    path: B('path', 'sand', 'core-path', { roughness: 0.9 }),
    timber: B('timber', 'timber', 'core-timber', { roughness: 0.8 }),
    paintY: B('paintY', 'render', 'core-paint-y', { roughness: 0.48, metalness: 0.04 }),
    paintB: B('paintB', 'render', 'core-paint-b', { roughness: 0.48, metalness: 0.04 }),
    paintR: B('paintR', 'render', 'core-paint-r', { roughness: 0.48, metalness: 0.04 }),
    paintG: B('paintG', 'render', 'core-paint-g', { roughness: 0.5, metalness: 0.03 }),
    paintO: B('paintO', 'render', 'core-paint-o', { roughness: 0.5, metalness: 0.03 }),
    steel: B('steel', 'render', 'core-steel', { roughness: 0.42, metalness: 0.18, envBase: 0.85 }),
    brick: B('brick', 'brick', 'core-brick', { roughness: 0.84 }),
    concrete: B('concrete', 'concrete', 'core-concrete', { roughness: 0.9 }),
    water: B('water', 'water', 'core-water', { roughness: 0.20, metalness: 0.10 }),
    foliage: B('foliage', 'foliage', 'core-leaf', { roughness: 0.9 }),
    glass: B('glass', 'glass', 'core-glass', { roughness: 0.08, metalness: 0.16 }),
    // §2.4 / §2.9. Seamed roof deck sits a full value band below `steel`, so a greyscale
    // read separates roof from metalwork. Corrugated family carries the profile.
    roof: B('roof', 'corrugated', 'core-roof', { roughness: 0.62, metalness: 0.14, envBase: 0.6 }),
    // Bone joinery: window frames, fascia, arch surrounds, cornice. Warm, high value.
    trim: B('trim', 'render', 'core-trim', { roughness: 0.74, metalness: 0 }),
    // Slate-green sheet for the market hall. Terracotta was tried first and failed §2.10
    // — brick wall + terracotta roof + red awning is one hue owning the model.
    tileRoof: B('tileRoof', 'corrugated', 'core-tile', { roughness: 0.72, metalness: 0.08, envBase: 0.55 }),
  });
}

/**
 * Local-space part collector. Type builders push primitives in metres about the
 * core origin. The layer instances the merged model at each core centre.
 */
export class CoreContext {
  constructor(palette, variant) {
    this.palette = palette;
    this.variant = variant | 0;
    this.buckets = new Map();
    this.toys = [];
    /**
     * r14 — every §2.5 drift lobe, with the ground bucket it was laid ON.
     *
     * The r13 critic measured the `brigade-bay` v1 lobe at rendered luma 36 on a pad at
     * 88–105, where the scene's own cast shadows measure 88–90: `soil` four to five rungs
     * below its ground, which is the exact tar-patch failure r3 removed at r2. The r12
     * premise — "a patch in the bucket one rung BELOW its ground is a weathering
     * difference" — is right, and nothing in the source or the probes checked that the
     * patch was one rung rather than four. It does now: `driftField` records the pair and
     * `v370-l5-geometry-probe.mjs` fails any lobe further than `DRIFT_MAX` from its own
     * ground. A premise that is only in a comment is not a premise the next round inherits.
     */
    this.drifts = [];
    // UNBURY ROUND — face area laid as §2.5 drift lobes, per bucket. See `tonalDrift`.
    this.driftArea = new Map();
  }

  push(bucket, geometry) {
    if (!this.palette[bucket]) throw new RangeError(`unknown core bucket ${bucket}`);
    MaterialLibrary.ensureUv2(geometry);
    if (!this.buckets.has(bucket)) this.buckets.set(bucket, []);
    this.buckets.get(bucket).push(geometry);
  }

  box(bucket, w, h, d, x, y, z, yawDeg = 0) {
    return this.boxEx(bucket, w, h, d, x, y, z, { yaw: yawDeg });
  }

  boxEx(bucket, w, h, d, x, y, z, { yaw = 0, pitch = 0, roll = 0 } = {}) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    if (pitch) geometry.rotateX(pitch * DEG);
    if (roll) geometry.rotateZ(roll * DEG);
    if (yaw) geometry.rotateY(yaw * DEG);
    geometry.translate(x, y, z);
    this.push(bucket, geometry);
    return geometry;
  }

  cyl(bucket, rTop, rBot, h, x, y, z, segments = 12) {
    const geometry = new THREE.CylinderGeometry(rTop, rBot, h, segments, 1);
    geometry.translate(x, y, z);
    this.push(bucket, geometry);
  }

  cylEx(bucket, rTop, rBot, h, x, y, z, {
    yaw = 0, pitch = 0, roll = 0, segments = 10, openEnded = false,
  } = {}) {
    const geometry = new THREE.CylinderGeometry(rTop, rBot, h, segments, 1, openEnded);
    if (pitch) geometry.rotateX(pitch * DEG);
    if (roll) geometry.rotateZ(roll * DEG);
    if (yaw) geometry.rotateY(yaw * DEG);
    geometry.translate(x, y, z);
    this.push(bucket, geometry);
  }

  /**
   * r4 — a horizontal surface with NO UNDERSIDE, for the large ground planes whose backs no
   * camera can reach.
   *
   * Same finding as the open-ended skirt, one layer up. `boardTile`'s ground disc was a
   * closed 4-segment cylinder: 12 triangles and ~448 m², of which the 221 m² bottom cap is
   * against the tile shoulder and the side band is 5 m². Three of the six laid that disc in
   * `concrete` and it alone put 700–1,050 m² into one bucket, which is how the 210° bin came
   * to own `district-energy` at 0.693 once the palette went cool.
   *
   * A `PlaneGeometry` is 2 triangles and one face. It is front-side only, which is correct
   * here and not a shortcut: the object is graded from above at board zoom and the underside
   * of a board tile is not a surface the game has.
   */
  slab(bucket, w, d, x, y, z, yaw = 0) {
    const geometry = new THREE.PlaneGeometry(w, d);
    geometry.rotateX(-Math.PI / 2);
    if (yaw) geometry.rotateY(yaw * DEG);
    geometry.translate(x, y, z);
    this.push(bucket, geometry);
  }

  /**
   * V3.71 lane I — `slab` inverted: a horizontal surface with NO TOP, for the underside of
   * a deck. Two triangles, one downward face.
   *
   * It exists because §5.3's "no albedo can light a reveal" bites hardest on a car park's
   * deck soffit, and the honest answer in this layer is to give that surface the lightest
   * bucket on the ladder rather than the structural slab's concrete. A thin BOX would do
   * the same job for 12 triangles and would also push a ~70 m² buried TOP face into that
   * bucket's area — which is the same phantom-area species r4 removed from the tile skirt,
   * and it would be counted by `v370-l5-geometry-probe.mjs`'s face census while the face a
   * player actually sees is dropped by it (`n.y < −0.5`). One primitive, one real face.
   */
  soffit(bucket, w, d, x, y, z, yaw = 0) {
    const geometry = new THREE.PlaneGeometry(w, d);
    geometry.rotateX(Math.PI / 2);
    if (yaw) geometry.rotateY(yaw * DEG);
    geometry.translate(x, y, z);
    this.push(bucket, geometry);
  }

  cone(bucket, r, h, x, y, z, segments = 8) {
    const geometry = new THREE.ConeGeometry(r, h, segments, 1);
    geometry.translate(x, y, z);
    this.push(bucket, geometry);
  }

  sphere(bucket, r, x, y, z, wSeg = 8, hSeg = 6) {
    const geometry = new THREE.SphereGeometry(r, wSeg, hSeg);
    geometry.translate(x, y, z);
    this.push(bucket, geometry);
  }

  torus(bucket, r, tube, x, y, z, yawDeg = 0, radial = 10, tubular = 8) {
    const geometry = new THREE.TorusGeometry(r, tube, radial, tubular);
    geometry.rotateX(Math.PI / 2);
    if (yawDeg) geometry.rotateY(yawDeg * DEG);
    geometry.translate(x, y, z);
    this.push(bucket, geometry);
  }

  /** Pad + soil lip. Every core starts here so the 16 m tile reads as ground, not float. */
  pad(bucket, size = CORE_PAD, y = 0.1, thickness = 0.14) {
    this.box(bucket, size, thickness, size, 0, y, 0);
    this.box('soil', size + 0.35, 0.06, size + 0.35, 0, y - thickness * 0.45, 0);
  }

  /**
   * Service-yard hardstand with a perimeter kerb.
   *
   * taste-r1 wave 10 (W10-C): the pad is ASPHALT, not pale concrete. The owner and the advisor
   * both read the old yards as roofless buildings: a near-white slab (V 71 on screen, lighter
   * than the footpath at 56) cut by a 4 x 4 grid of dark joints, which is exactly what a floor
   * plan looks like from above. A yard is the darkest flat thing in its block, the same family
   * as the street beside it. Asphalt has no joint grid, so none is laid; what makes it a yard
   * is `yardDrain`, `yardPatch`, `oilSpot` and `bayLines`, all of them flat marks under 0.05 m.
   */
  hardstand({
    fill = 'yard', size = CORE_PAD, kerb = true,
  } = {}) {
    // V3.71 lane I r2 — the literals are now the exported constants, so `CORE_HARDSTAND`
    // cannot drift away from the surface it names. `0.10 + 0.16 / 2 === 0.18` exactly in
    // IEEE754, checked, so the geometry this lays is bit-for-bit what it laid before.
    this.pad(fill, size, CORE_HARDSTAND_Y, CORE_HARDSTAND_T);
    this.yardGround = true;   // `oilSpot` stains in `yardOil` only where this ground exists.
    if (kerb) {
      const k = size * 0.5 - 0.08;
      this.box(fill, size, 0.16, 0.22, 0, 0.22, -k);
      this.box(fill, size, 0.16, 0.22, 0, 0.22, k);
      this.box(fill, 0.22, 0.16, size - 0.4, -k, 0.22, 0);
      this.box(fill, 0.22, 0.16, size - 0.4, k, 0.22, 0);
    }
  }

  /**
   * W10-C: a dished drain channel with ONE grate, laid on the hardstand. Everything here is
   * under 0.04 m so it reads as a mark in the ground, not as a fitting standing on it.
   * `yaw` 0 runs the channel along Z; the grate sits at the +Z end, half a metre in.
   */
  yardDrain(x, z, len = 8, yaw = 0, ground = CORE_HARDSTAND) {
    const s = Math.sin(yaw * DEG);
    const c = Math.cos(yaw * DEG);
    this.boxEx('yardOil', 0.36, 0.012, len, x, ground + 0.004, z, { yaw });
    const gx = x + s * (len * 0.5 - 0.55);
    const gz = z + c * (len * 0.5 - 0.55);
    this.boxEx('steel', 0.66, 0.026, 0.54, gx, ground + 0.010, gz, { yaw });
    for (let i = -2; i <= 2; i += 1) {
      this.boxEx('yardOil', 0.56, 0.010, 0.045, gx + s * i * 0.10, ground + 0.026, gz + c * i * 0.10, { yaw });
    }
  }

  /** W10-C: a flat repair patch, a slightly darker rectangle in the surface. */
  yardPatch(x, z, w, d, yaw = 0, ground = CORE_HARDSTAND) {
    this.boxEx('yardOil', w, 0.012, d, x, ground + 0.004, z, { yaw });
  }

  /** W10-C: one worn-white painted line, 0.10 m wide and 12 mm proud. `yaw` runs along Z. */
  paintLine(x, z, len, yaw = 0, ground = CORE_HARDSTAND) {
    this.boxEx('steel', 0.10, 0.012, len, x, ground + 0.005, z, { yaw });
  }

  /**
   * W10-C: a loading-bay outline in front of a roller door. (x, z) is the middle of the door
   * threshold; the bay is `w` across and `d` out from the wall, and `yaw` turns local +Z (the
   * way the bay opens out) onto the world: 0 = +Z, 90 = +X, 180 = -Z, 270 = -X.
   */
  bayLines(x, z, w = 2.9, d = 2.6, yaw = 0) {
    const s = Math.sin(yaw * DEG);
    const c = Math.cos(yaw * DEG);
    const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    for (const sx of [-1, 1]) {
      const [px, pz] = at(sx * w * 0.5, d * 0.5);
      this.paintLine(px, pz, d, yaw);
    }
    const [fx, fz] = at(0, d);
    this.paintLine(fx, fz, w + 0.10, yaw + 90);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // V3.70 register helpers. Every one of these exists because §2 names a fault the
  // 2026-08-17 baseline has: flat ground, card windows, no plinth, painted-on seams,
  // clean colour, lollipop trees, drawn paths, floating pickets.
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * §2.1 board tile. A chamfered plinth with a dark bevelled edge, so the miniature
   * stands ON something instead of being a rectangle laid flat on the terrain.
   * Four-segment cylinders give a true square frustum for ~16 tri each.
   */
  boardTile({
    ground = 'turf', size = CORE_PAD, top = 0.20, skirt = 'soil',
    hollow = null, apron = null,
  } = {}) {
    const r = (side) => side * Math.SQRT1_2;
    const inset = 0.52;
    // r2: the chamfer is roughly 1:2 rather than 1:3, because on the r6 plates the bevel
    // was too shallow to throw its own shadow and the tile read as a flat card with a
    // dark line round it. The reference plinths are unmistakably a solid the model stands
    // on, and the bevel is the thing that says so.
    //
    // r4 — THE SKIRT FRUSTA ARE OPEN-ENDED, and this is a real fix, not an accounting one.
    //
    // Both were closed 4-segment cylinders. Measured on `substation` v0: the two of them
    // carried **986.7 m² of the `soil` bucket's 1,127.8**, which is 41 % of the whole
    // object's face area — and essentially all of it is cap. The lower frustum's bottom cap
    // is the underside of the board; its top cap sits inside the upper frustum; the upper
    // frustum's top cap sits inside the ground disc. Not one of the four is visible from
    // any camera that can see this object. The bevel a critic actually reads is the SIDE
    // wall, which is ~20 m² of the 987.
    //
    // The lane has a gate for geometry paid for and never seen (`sunk`) and it cannot see
    // this, because these primitives have their tops above ground — they are not buried,
    // they are hollow-side-out. Two `openEnded: true` flags remove 8 triangles each and
    // ~975 m² of phantom area per object, with zero visual change, and the phantom area was
    // sitting in the 30° warm hue bin on every one of the twelve rows and driving §2.10.
    //
    // The ground disc keeps its caps: its TOP cap is the lot surface the miniature stands
    // on, which is the one cap in the assembly that is the object.
    this.cylEx(skirt, r(size), r(size + 0.42), 0.32, 0, top - 0.18, 0, { yaw: 45, segments: 4, openEnded: true });
    this.cylEx(skirt, r(size - inset), r(size), 0.10, 0, top - 0.025, 0, { yaw: 45, segments: 4, openEnded: true });

    /**
     * r4 — §2.1 + the `stormwater-basin` landform, which is the fix the r3 builder said
     * needed "a tile that can be excavated" and filed as an orchestrator request. It is not
     * one: `boardTile` is lane source, so the lane can cut it.
     *
     * `hollow: { halfX, halfZ, depth, floor, batter }` lays the ground as four boards round
     * a rectangular void instead of one disc, then steps the void's sides down to a floor
     * `depth` below the lot surface. The basin's bowl was 4 cm deep because it was made by
     * raising a bund on top of a solid tile; cut the tile and the same object reads metres
     * deep with no bund at all.
     */
    if (hollow) {
      const {
        halfX = 4.4, halfZ = 3.4, depth = 1.30, floor = ground, batter = ground, steps = 3,
      } = hollow;
      const gh = r(size - inset) * Math.SQRT2 * 0.5;   // half-width of the ground square
      const yTop = top + 0.06;
      // Four ground boards round the void. Together they are the disc, minus the hole.
      this.slab(ground, gh * 2, gh - halfZ, 0, yTop, -(halfZ + gh) * 0.5);
      this.slab(ground, gh * 2, gh - halfZ, 0, yTop, (halfZ + gh) * 0.5);
      this.slab(ground, gh - halfX, halfZ * 2, -(halfX + gh) * 0.5, yTop, 0);
      this.slab(ground, gh - halfX, halfZ * 2, (halfX + gh) * 0.5, yTop, 0);
      // Stepped batters down into the hole — a graded bowl, not a shaft.
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        const y = yTop - depth * t;
        const hx = halfX - (halfX * 0.42) * t;
        const hz = halfZ - (halfZ * 0.42) * t;
        const bw = (i === 1 ? halfX : halfX - (halfX * 0.42) * ((i - 1) / steps)) - hx;
        const bd = (i === 1 ? halfZ : halfZ - (halfZ * 0.42) * ((i - 1) / steps)) - hz;
        const b = i === steps ? floor : batter;
        this.box(b, (hx + bw) * 2, 0.10, bd, 0, y, -(hz + bd * 0.5));
        this.box(b, (hx + bw) * 2, 0.10, bd, 0, y, (hz + bd * 0.5));
        this.box(b, bw, 0.10, hz * 2, -(hx + bw * 0.5), y, 0);
        this.box(b, bw, 0.10, hz * 2, (hx + bw * 0.5), y, 0);
      }
      const fx = halfX * 0.58; const fz = halfZ * 0.58;
      this.box(floor, fx * 2, 0.10, fz * 2, 0, yTop - depth, 0);
      return;
    }
    /**
     * r4 — the lot surface, and §2.10 as a composition rule rather than a paint rule.
     *
     * `apron: { bucket, halfX, halfZ, x, z }` lays a second real surface over part of the
     * ground instead of letting one bucket own the whole 14.88 m square. The reference lots
     * are never one material: the mobility hub has stone pavers AND an asphalt bay AND
     * planted beds; the district energy yard has dark pavers inside a planted margin. r3's
     * three worst §2.10 rows were all objects that laid the entire tile in one bucket.
     */
    const gh = r(size - inset) * Math.SQRT2 * 0.5;
    const yTop = top + 0.06;
    if (!apron) {
      this.slab(ground, gh * 2, gh * 2, 0, yTop, 0);
      return;
    }
    const {
      bucket: ab, halfX: ax = gh * 0.52, halfZ: az = gh * 0.52, x: aox = 0, z: aoz = 0,
    } = apron;
    // Ground in four boards round the apron, then the apron itself 1 cm proud so its edge
    // throws a line rather than z-fighting the surface it sits on.
    this.slab(ground, gh * 2, gh - (aoz + az), 0, yTop, (aoz + az + gh) * 0.5);
    this.slab(ground, gh * 2, gh + (aoz - az), 0, yTop, (aoz - az - gh) * 0.5);
    this.slab(ground, gh - (aox + ax), az * 2, (aox + ax + gh) * 0.5, yTop, aoz);
    this.slab(ground, gh + (aox - ax), az * 2, (aox - ax - gh) * 0.5, yTop, aoz);
    // A slab, not a box: the apron's underside is against the ground it is laid on, and a
    // box would have paid 132 m² for it — the same phantom-area species as the skirt caps.
    this.slab(ab, ax * 2, az * 2, aox, yTop + 0.006, aoz);
  }

  /**
   * §2.1 + §2.6 + §2.7 — the lot edge, and the single highest-value change in this round.
   *
   * The r1 critic's fix list opens with it: "Kill the flat green field. One helper, twelve
   * plates. Every one of the twelve sits on a flat green plane meeting a hard edge, which
   * §2.1 names as an automatic 2. Until the lot is a planted surface with tufts standing
   * proud and a soft transition into the tile skirt, no object here can score above 2
   * whatever else is fixed." All six blind calls named it too, in the same words each
   * time: "A's yard is a flat tan rectangle with a hard edge"; "A's sits on a flat tan
   * rectangle on a flat green field with two lollipop trees"; "B's lot is a concrete slab
   * with a flat dark-green strip and no planting at all".
   *
   * What the six Monopoly-Plus reference plates actually do, read off them in order from
   * the outside in, because every one of the six does the same four things:
   *
   *   1. a dark chamfered plinth (that is `boardTile`);
   *   2. a course of individual paving setts running the whole perimeter, with joints;
   *   3. a gravel margin inside it, uneven in tone, with the working surface's edge
   *      dissolving into it rather than butting against it;
   *   4. dense grass tufts and shrub masses standing proud of that margin, THROUGH the
   *      sett course and over the plinth line — which is what actually kills the hard
   *      edge. Nothing in the reference has a clean boundary anywhere.
   *
   * The ring is laid at the tile edge rather than inset, so a perimeter fence at ±7.15
   * stands ON the sett course. That is the reference substation's arrangement exactly,
   * and it means no type has to be re-laid out to adopt this.
   */
  lotEdge({
    size = CORE_PAD, seed = 'lot', y = CORE_GROUND,
    sett = 'path', gravel = 'concrete',
    /**
     * V3.71 lane I — `spill`, defaulting to `sett` so nothing that exists today moves.
     *
     * The loose gravel breaking over the sett course is laid in the SETT bucket, on the r12
     * reasoning that spill in the margin's own colour is invisible. That is right where the
     * working surface is a pale apron and wrong where it is asphalt: on `car-park`'s board
     * plate six `path` lobes at rendered 159 on tarmac at 44 read as spilt white paint, not
     * as gravel. A caller whose ground is dark passes the margin's bucket instead.
     */
    spill = null,
    grass = 'turf', shrub = 'foliage',
    tuftCount = 15, shrubs = [[-1, -1], [1, 1]], shrubScale = 0.9,
    settPitch = 1.24, drift = false,
  } = {}) {
    /**
     * r3, and this is the change the round turns on.
     *
     * r2 laid the gravel margin, the joint bed under the setts, five drift discs and six
     * loose-gravel discs from the `soil` bucket. `soil` was authored at luma 66 and the
     * `concrete` family multiplied it to **12.5 on the plate**, so between 15 % and 34 % of
     * the visible lot on every one of the twelve was a bucket that renders as black. The
     * r2 critic measured it from directly above, named it the fault that decided three of
     * six blind calls, and put it first on the fix list: *"a hard-edged trench separating
     * the working surface from the sett course, with the setts floating over it and the
     * fence posts standing in it."*
     *
     * Three separate things were wrong and all three are fixed here rather than tinted:
     *
     *   1. **The margin is off `soil`.** It defaults to `gravel = 'concrete'` — rendered 80
     *      against the sett course's 93, so the margin reads as grey gravel beside tan
     *      setts instead of as a hole. Every one of the six already carries `concrete` in
     *      its nine, so this costs no bucket anywhere.
     *   2. **The joint ring is gone.** Its top sat at 0.255 under a ground disc whose top
     *      is 0.26, so it was never visible from any angle — the critic's own "paid for and
     *      buried" table lists it at 63–269 m² per object. It was 48 triangles of nothing.
     *   3. **The drift discs are gone by default.** Five discs up to 2.3 m across in a
     *      twenty-times-darker bucket read as tar patches, not as tonal variation
     *      (`r7-district-energy-v0` x 830–1300 / y 570–780). Tonal drift is a texture
     *      problem and this layer has no texture budget for it; a wrong answer removed
     *      beats a wrong answer tinted.
     */
    const half = size * 0.5 - 0.04;         // 7.66 at the default 15.4 m pad
    const settIn = half - 0.66;             // sett course 0.66 m wide
    const marginIn = settIn - 0.74;         // gravel margin 0.74 m wide
    const settMid = (half + settIn) * 0.5;
    const marginMid = (settIn + marginIn) * 0.5;

    const ring = (bucket, mid, band, h, yy) => {
      this.box(bucket, size, h, band, 0, yy, -mid);
      this.box(bucket, size, h, band, 0, yy, mid);
      this.box(bucket, band, h, mid * 2, -mid, yy, 0);
      this.box(bucket, band, h, mid * 2, mid, yy, 0);
    };
    ring(gravel, marginMid, 0.78, 0.06, y - 0.01);

    // Individual setts. Two courses would double the cost for very little read at board
    // zoom, so it is one course with an alternating offset and a slight height jitter —
    // the jitter is what stops it reading as a scribed line, which is fault 2 in blind
    // pairs 04 and 03.
    const runs = [
      [-1, 0, 1, 0, 'x', -settMid], [-1, 0, 1, 0, 'x', settMid],
      [0, -1, 0, 1, 'z', -settMid], [0, -1, 0, 1, 'z', settMid],
    ];
    let k = 0;
    for (const [, , , , axis, off] of runs) {
      const len = axis === 'x' ? size : settMid * 2;
      const n = Math.max(4, Math.round(len / settPitch));
      for (let i = 0; i < n; i += 1) {
        const t = (i + 0.5) / n * len - len * 0.5;
        const jitter = 0.055 + unit(seed, `sj${k}`) * 0.035;
        const px = axis === 'x' ? t : off;
        const pz = axis === 'x' ? off : t;
        this.box(sett, axis === 'x' ? len / n - 0.09 : 0.58, jitter, axis === 'x' ? 0.58 : len / n - 0.09, px, y + jitter * 0.5, pz);
        k += 1;
      }
    }

    // Tonal drift over the working surface — §2.5 says nothing is a clean flat colour,
    // and a 15 m slab of one value is the largest clean flat colour on the object.
    if (drift) {
      for (let i = 0; i < 5; i += 1) {
        const a = unit(seed, `da${i}`) * Math.PI * 2;
        const rr = 1.5 + unit(seed, `dr${i}`) * 4.4;
        this.cyl(
          gravel, 0.95 + unit(seed, `ds${i}`) * 1.35, 0.75 + unit(seed, `dt${i}`) * 1.15, 0.025,
          Math.sin(a) * rr, y + 0.028, Math.cos(a) * rr, 6,
        );
      }
    }

    // Loose gravel breaking over the sett course. Laid in the SETT bucket, not the margin's
    // — spill from the course onto the margin reads; spill in the margin's own colour is
    // invisible, and spill in a near-black bucket is the r2 fault at a smaller scale.
    //
    // r12: laid as `tonalDrift` lobes rather than 5-segment discs. A disc lying on the ground
    // pays 20 triangles for a bottom cap against the surface it lies on and a rim 5 cm high;
    // three yawed planes are 6 triangles and a less regular outline. Six of these an object,
    // twelve rows.
    for (let i = 0; i < 6; i += 1) {
      const a = unit(seed, `ga${i}`) * Math.PI * 2;
      const rr = marginIn + unit(seed, `gr${i}`) * (half - marginIn - 0.55);
      this.tonalDrift(spill ?? sett, Math.sin(a) * rr, Math.cos(a) * rr, 0.62 + unit(seed, `gs${i}`) * 0.5, {
        seed: `${seed}-g${i}`, y: y + 0.02, lobes: 2,
      });
    }

    // Tufts in the margin, walked round the ring as a SQUARE rather than scattered in a
    // box or spun round a circle. The tile is square, and a circular scatter leaves the
    // four corners bare — which is exactly where every reference plate is densest.
    for (let i = 0; i < tuftCount; i += 1) {
      const t = (i + 0.5) / tuftCount;
      const side = Math.floor(t * 4);
      const u = (t * 4 - side) * 2 - 1;               // -1 .. 1 along this side
      const band = marginIn + 0.10 + unit(seed, `tb${i}`) * (half - marginIn - 0.32);
      const along = u * (half - 0.25);
      const [px, pz] = side === 0 ? [along, -band]
        : side === 1 ? [band, along]
          : side === 2 ? [-along, band]
            : [-band, -along];
      this.tuft(
        px + (unit(seed, `tx${i}`) - 0.5) * 0.34,
        pz + (unit(seed, `tz${i}`) - 0.5) * 0.34,
        { y: y + 0.03, scale: 0.80 + unit(seed, `ts${i}`) * 0.75, bucket: grass, seed: `${seed}-e${i}` },
      );
    }

    // Shrub masses on the corners — the thing that actually breaks the plinth line.
    for (const [sx, sz] of shrubs) {
      this.leafShrub(sx * (half - 0.95), sz * (half - 0.95), {
        s: shrubScale, bucket: shrub, y0: y + 0.02, seed: `${seed}-c${sx}${sz}`,
      });
    }
  }

  /**
   * §2.6 — a planted verge, which is what three of the six had instead of one.
   *
   * All three drew `box('turf', 13.9, 0.10, 1.15, …)`: one flat rectangle of one colour with
   * a hard edge. The r2 critic recorded it as `brigade-bay` major 1 and would not accept the
   * r2 answer, correctly: *"It now draws from `turf`, which fixes the greyscale collapse and
   * does not fix the object: it is still one flat rectangle of one colour with a hard edge
   * and **nothing standing proud of it**, which is §2.6's actual requirement."*
   *
   * Three things make a verge: a lobed edge rather than a ruled one, clumps standing off the
   * surface along its length, and one mass big enough to break the line at an end. It is 170
   * triangles, and it is the difference between a lawn and a green rectangle.
   */
  plantedVerge(bucket, w, d, x, y, z, { seed = 'verge', count = 8, shrub = null } = {}) {
    const lobes = 3;
    for (let i = 0; i < lobes; i += 1) {
      const lw = w / lobes;
      const ld = d * (0.82 + unit(seed, `ld${i}`) * 0.34);
      this.box(bucket, lw + 0.06, 0.10, ld, x - w * 0.5 + (i + 0.5) * lw, y, z + (d - ld) * 0.22);
    }
    for (let i = 0; i < count; i += 1) {
      const t = (i + 0.5) / count;
      this.tuft(
        x - w * 0.5 + t * w + (unit(seed, `vx${i}`) - 0.5) * 0.5,
        z + (unit(seed, `vz${i}`) - 0.5) * d * 0.72,
        { y: y + 0.05, scale: 0.85 + unit(seed, `vs${i}`) * 0.7, bucket, seed: `${seed}-v${i}` },
      );
    }
    if (shrub) {
      this.leafShrub(x + w * 0.5 - 0.85, z, { s: 0.82, bucket: shrub, y0: y + 0.05, seed: `${seed}-vs` });
    }
  }

  /**
   * r4 — §2.6, ANSWERED WITH AREA RATHER THAN WITH COUNT, and it is the fix that closes
   * §2.10 at the same time.
   *
   * §2.6 has been the most-cited major in this lane for three rounds and every previous
   * answer made the individual tuft better while leaving the PLANTED AREA at 1–4 % of the
   * object. Measured against the references: `mp-block-mobility-hub` and
   * `mp-block-district-energy` both carry kerbed beds of massed planting running whole
   * elevations — planting is 15–25 % of those frames. Ours was a dozen pegs on a strip.
   *
   * That is also why §2.10 would not close. With planting at 3 % the only large surfaces on
   * an object are its hard ones, so whichever bin the paving and the metal land in owns the
   * model — first the 30° bin when everything ran through `render`, then the 210° bin when I
   * moved the metals cool, then the 60° bin when I moved them back. **Three attempts to fix a
   * hue monopoly by moving hues, when the real fault was that one class of surface had all
   * the area.** A bed with real green area is the only version of this that holds.
   *
   * A kerbed bed: a raised kerb with its own section, a soil body inset behind it, a mounded
   * planting mass, clustered shrubs and tufts breaking the kerb line. ~40 tri/m² of bed.
   */
  plantedBed(x, z, w, d, {
    kerb = 'concrete', soil: soilB = 'soil', mass = 'foliage', grass = 'turf',
    seed = 'bed', shrubs = 3, tufts = 7, yaw = 0, y = CORE_GROUND, h = 0.30,
  } = {}) {
    const hw = w * 0.5; const hd = d * 0.5;
    // Kerb — four members with real section, not a painted outline.
    this.box(kerb, w + 0.24, h, 0.24, x, y + h * 0.5, z - hd - 0.12, yaw);
    this.box(kerb, w + 0.24, h, 0.24, x, y + h * 0.5, z + hd + 0.12, yaw);
    this.box(kerb, 0.24, h, d, x - hw - 0.12, y + h * 0.5, z, yaw);
    this.box(kerb, 0.24, h, d, x + hw + 0.12, y + h * 0.5, z, yaw);
    // Bed body, and a planted surface mounded above the kerb so the bed reads as full
    // rather than as an empty box. This is where the green AREA comes from.
    this.box(soilB, w, h * 0.72, d, x, y + h * 0.36, z, yaw);
    this.box(grass, w - 0.06, h * 0.46, d - 0.06, x, y + h * 0.82, z, yaw);
    for (let i = 0; i < 2; i += 1) {
      const mw = w * (0.42 + unit(seed, `mw${i}`) * 0.30);
      const md = d * (0.44 + unit(seed, `md${i}`) * 0.30);
      // r14 §5.3.2 — the bed mass is crowned rather than laid flat-sided, so its long
      // faces tilt toward sky instead of standing dead-vertical against the key.
      this.boxEx(mass, mw, h * 0.5, md,
        x + (unit(seed, `mx${i}`) - 0.5) * w * 0.48, y + h * 1.02,
        z + (unit(seed, `mz${i}`) - 0.5) * d * 0.40,
        // 5°, not 13°: this box is up to 2.7 m long, and a 13° pitch on a 2.7 m box drops its
        // far corner 0.30 m — 0.19 m under the ground on `district-energy`'s 8.1 m bed. The
        // crown only has to break the flat top; it does not have to be a ramp.
        { yaw: yaw + (i ? -14 : 14), pitch: i ? -5 : 5, roll: i ? 5 : -5 });
    }
    for (let i = 0; i < shrubs; i += 1) {
      const t = (i + 0.5) / shrubs;
      this.leafShrub(
        x + (t - 0.5) * w * 0.82 + (unit(seed, `sx${i}`) - 0.5) * 0.4,
        z + (unit(seed, `sz${i}`) - 0.5) * d * 0.5,
        { s: 0.62 + unit(seed, `ss${i}`) * 0.42, bucket: mass, y0: y + h * 0.95, seed: `${seed}-s${i}` },
      );
    }
    // Tufts breaking OVER the kerb line — §2.6's "nothing in the reference has a clean
    // boundary anywhere". Half of them sit outside the bed, on the paving.
    for (let i = 0; i < tufts; i += 1) {
      const out = i % 2 === 0;
      const t = (i + 0.5) / tufts;
      this.tuft(
        x + (t - 0.5) * w * (out ? 1.08 : 0.88),
        z + (out ? (unit(seed, `to${i}`) > 0.5 ? hd + 0.22 : -hd - 0.22) : (unit(seed, `tz${i}`) - 0.5) * d * 0.7),
        {
          y: out ? y : y + h * 1.0, bucket: grass,
          scale: 0.8 + unit(seed, `ts${i}`) * 0.7, seed: `${seed}-t${i}`,
        },
      );
    }
  }

  /**
   * §2.3 plinth course. A darker, slightly proud masonry base wrapping a mass where it
   * meets the ground. Hides the ground intersection and grounds the silhouette.
   */
  plinthCourse(bucket, w, d, x, y, z, { yaw = 0, h = 0.42, proud = 0.09 } = {}) {
    this.box(bucket, w + proud * 2, h, d + proud * 2, x, y + h * 0.5, z, yaw);
    this.box(bucket, w + proud * 2.9, 0.07, d + proud * 2.9, x, y + h + 0.02, z, yaw);
  }

  /**
   * §2.5 grunge. Tonal drift and grime at the base of a wall, and streaking below a
   * fixing. Deliberately thin boxes in a darker bucket — no texture, no decal.
   */
  grime(bucket, w, h, x, y, z, { yaw = 0, t = 0.035 } = {}) {
    this.box(bucket, w, h, t, x, y, z, yaw);
  }

  /**
   * §2.5 done properly. `grime()` lays one band; the r1 build called it once or twice per
   * elevation and the builder's own §8 conceded the result — "grime() and streaks() are
   * placed by hand at a handful of points, so most wall area is still one flat tone,
   * which is §2.5 half-answered". The r1 critic put it as the difference that decided
   * blind pair-01: "B's wall varies course to course, darkens at the base where it meets
   * the ground, and carries grime up the pier faces. A's brick is one flat repeating
   * pattern at one tone across a single plane, with the same value top to bottom."
   *
   * So this lays a graded base wash plus hash-placed patches across the whole elevation
   * for about 10 boxes — 120 triangles per wall face, which is affordable where a texture
   * is not. Faces local +Z after `yaw`; `x, z` is the face centre and `y0` its foot.
   */
  grimeWall(bucket, w, h, x, y0, z, { yaw = 0, seed = 'g', patches = 5, wash = 3 } = {}) {
    const sideX = Math.cos(yaw * DEG);
    const sideZ = -Math.sin(yaw * DEG);
    // Graded base wash: widest and tallest at the foot, fading up. Splash-back and rising
    // damp are the two things every reference elevation has and no baseline wall does.
    for (let i = 0; i < wash; i += 1) {
      const f = (i + 1) / wash;
      this.box(
        bucket, w * (1.0 - i * 0.06), h * 0.30 * (1 - i * 0.24), 0.028 + i * 0.006,
        x, y0 + h * 0.10 * f, z, yaw,
      );
    }
    // Hash-placed patches over the field, leaning so they do not read as a second course.
    for (let i = 0; i < patches; i += 1) {
      const along = (unit(seed, `pa${i}`) * 2 - 1) * w * 0.42;
      const up = 0.14 + unit(seed, `pu${i}`) * 0.72;
      const pw = w * (0.10 + unit(seed, `pw${i}`) * 0.20);
      const ph = h * (0.07 + unit(seed, `ph${i}`) * 0.16);
      this.boxEx(
        bucket, pw, ph, 0.026,
        x + sideX * along, y0 + h * up, z + sideZ * along,
        { yaw, roll: (unit(seed, `pr${i}`) * 2 - 1) * 9 },
      );
    }
  }

  /**
   * r12 — §2.5 TONAL DRIFT ON A GROUND SURFACE, at two triangles a lobe.
   *
   * §2.5 is the clause this lane has never moved, and the r11 critic sized it: 15.5 % of
   * subject pixels are dead-flat at a 5×5 test against 0.7 % on the references, and median
   * local range is 47 % of the references'. The single largest flat surface on every one of
   * the twelve is the ground — an apron or a hardstand of 100–140 m² laid as one `slab`.
   *
   * r2 tried this and r3 removed it, correctly: with `soil` twenty times darker than the
   * paving it sat on, five drift discs read as tar patches, not as tonal variation. That was
   * a palette problem, not a mechanism problem. On the r12 ladder the rungs are 17 luma
   * apart, so a patch laid in the bucket one rung BELOW its ground is a weathering
   * difference — which is what the reference aprons actually show — and the mechanism is
   * worth having back.
   *
   * It is laid as overlapping yawed `slab`s rather than as cylinders because a ground patch
   * is only ever seen from above: a 6-segment disc costs 24 triangles for a shape whose
   * underside and rim are against the surface it lies on, and three yawed planes cost 6 for
   * an outline that is less regular than a disc. Species identical to r4's skirt-cap finding,
   * one layer down.
   *
   * r14 — AND THE PREMISE IS NOW CHECKED RATHER THAN ASSERTED. The r13 critic measured the
   * `brigade-bay` v1 lobe at luma 36 against a pad at 88–105, four to five rungs below its
   * ground and darker than the scene's own cast shadows, which is r2's tar patch arriving
   * again under a comment that says it cannot. Both `tonalDrift` and `driftField` now take
   * the ground bucket they lie ON and record the pair; the geometry probe fails the row if
   * the two are further apart than one rung. A `slab` faces up, and so does the ground it
   * lies on, so the comparison is like-for-like on the same orientation — this is the one
   * §2.9 test in the lane where the single sunlit-horizontal reading is the right one.
   */
  /**
   * UNBURY ROUND — the lobe AREA is accumulated per bucket, because the collision
   * exemption in `v370-l5-geometry-probe.mjs` states a condition it could not measure.
   * Its written scope is "where that bucket's only use on an object is its drift lobes";
   * a `slab` is front-side only, so lobe face area is exactly `w * d` and the probe can
   * now compare it with the bucket's whole face area and apply the condition as written.
   */
  tonalDrift(bucket, x, z, size, { seed = 'drift', y = CORE_GROUND, lobes = 3, on = null } = {}) {
    if (on) this.drifts.push({ bucket, on, asked: lobes, placed: lobes });
    for (let i = 0; i < lobes; i += 1) {
      const w = size * (0.55 + unit(seed, `w${i}`) * 0.62);
      const d = size * (0.42 + unit(seed, `d${i}`) * 0.58);
      this.driftArea.set(bucket, (this.driftArea.get(bucket) ?? 0) + w * d);
      this.slab(
        bucket, w, d,
        x + (unit(seed, `x${i}`) - 0.5) * size * 0.72,
        y + 0.004 + i * 0.0015,
        z + (unit(seed, `z${i}`) - 0.5) * size * 0.72,
        unit(seed, `r${i}`) * 90,
      );
    }
  }

  /**
   * r12 — §2.5 on a large flat surface, walked as a field rather than placed by hand.
   * `count` drift clusters inside `half`, hash-scattered, with an optional keep-out.
   */
  /**
   * IMPROVE ROUND — THE ATTEMPT BUDGET WAS THREE TIMES `count`, AND ON A KEEP-OUT FIELD
   * THAT IS NOT ENOUGH TO PLACE ONE LOBE.
   *
   * Two bounds decide where a lobe may go and they pull against each other. `inner` keeps
   * centres `size` in from `half`; `avoid` keeps them out of the middle. On a field whose
   * keep-out is most of the square inside `inner` — which is every field laid on a RING or
   * on an off-centre apron — the pass rate is a few per cent, and at `count * 3` attempts
   * the loop silently placed a handful of lobes or none at all while the caller, the
   * report and the probe all counted the field as §2.5 coverage.
   *
   * Measured on the shipped source before this change: `market-hall`'s forecourt field
   * asked for 5 lobes and placed 0 on v0 and 1 on v1; the `stormwater-basin` crest field
   * asked for 5 and placed 0, because `half − size` was 6.02 against a keep-out at 6.57 and
   * NO point could satisfy both. A helper that cannot meet its brief should not return
   * quietly, and this is the same species as r13's LF4 — two numbers in one instrument that
   * cannot both hold.
   *
   * The budget goes to `count * 12`, which fills every field in the lane, and the
   * unsatisfiable case is now visible rather than silent: `driftField` returns how many it
   * placed, so a caller or a probe can compare it with what was asked.
   */
  /**
   * UNBURY ROUND — THE SAMPLER WAS NOT RANDOM, AND THAT IS WHY A FIELD WITH A 25 % LEGAL
   * AREA PLACED ZERO LOBES IN NINETY-SIX ATTEMPTS.
   *
   * The improve round raised the attempt budget from `count * 3` to `count * 12` and
   * reported that this "fills every field in the lane". It does not, and the reason is not
   * the budget. `unit(seed, 'fx0'..'fx95')` draws from FNV-1a over a string whose only
   * varying characters are the trailing index digits, and FNV-1a has no final avalanche —
   * so consecutive salts return nearly consecutive values. Printed for `subd1`, the first
   * twenty x draws are 0.572 0.580 0.557 0.564 0.603 … 0.320 and the first twenty z draws
   * are −0.522 −0.514 … 0.699. That is not a scatter over the square, it is two short runs
   * inside it. `substation` v1's coarse field keeps out |p| < 2.6 of an inner 3.0, which is
   * 25 % of the square legal — and every one of its 96 candidates landed in the 75 %, so it
   * placed **nothing** while the report, the probe and the collision exemption all counted
   * the field as live §2.5 coverage. Same mechanism, worse odds, on the basin crest.
   *
   * The draw is a stratified R2 (Roberts) low-discrepancy sequence instead, phase-shifted
   * per seed. R2's two increments are irrational multiples of the plastic number, so any
   * consecutive run of samples covers the square evenly by construction — it cannot cluster,
   * and it is deterministic, which is what this lane's cross-process check requires. The
   * seed still decides where the sequence starts, so different fields still differ.
   *
   * `hash32` itself is NOT touched. It drives every tuft, grime patch and toy in five lanes
   * and re-mixing it would move every plate in the programme; the fault is that a sequential
   * salt is the wrong way to ask it for a scatter, and that is fixed where it is asked.
   *
   * What is asked and what is placed are both recorded on `this.drifts` now, because
   * `driftField` has returned `placed` for a round and NOTHING READ IT — grep was the
   * receipt. `v370-l5-geometry-probe.mjs` fails a row whose declared field placed fewer
   * lobes than it asked for.
   */
  driftField(bucket, half, {
    seed = 'df', count = 6, y = CORE_GROUND, size = 1.9, avoid = null, on = null,
  } = {}) {
    // Centres are kept `size` inboard of `half`: a lobe is up to 1.17x `size` across and is
    // offset up to 0.36x `size` from its cluster centre, so placing centres at `half` puts
    // geometry past it. The geometry probe caught exactly that on the basin crest at +0.122 m.
    const inner = Math.max(0, half - size);
    // Plastic number: a1 = 1/g, a2 = 1/g². The R2 sequence.
    const A1 = 0.7548776662466927;
    const A2 = 0.5698402909980532;
    const px0 = unit(seed, 'phase-x');
    const pz0 = unit(seed, 'phase-z');
    let placed = 0;
    for (let i = 0; i < count * 12 && placed < count; i += 1) {
      const px = ((px0 + A1 * (i + 1)) % 1) * 2 * inner - inner;
      const pz = ((pz0 + A2 * (i + 1)) % 1) * 2 * inner - inner;
      if (avoid && avoid(px, pz)) continue;
      this.tonalDrift(bucket, px, pz, size * (0.7 + unit(seed, `fs${i}`) * 0.8), {
        seed: `${seed}-${i}`, y, lobes: 2 + (i % 2),
      });
      placed += 1;
    }
    // The pair is recorded ONCE, after the loop, with both numbers on it.
    if (on) this.drifts.push({ bucket, on, asked: count, placed });
    return placed;
  }

  streaks(bucket, x, y, z, { yaw = 0, count = 3, len = 0.55, spread = 0.42 } = {}) {
    const sideX = Math.cos(yaw * DEG);
    const sideZ = -Math.sin(yaw * DEG);
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * spread * 2;
      const drop = len * (0.62 + ((i * 7 + 3) % 5) * 0.11);
      this.box(
        bucket, 0.055, drop, 0.03,
        x + sideX * t, y - drop * 0.5, z + sideZ * t, yaw,
      );
    }
  }

  /**
   * §2.2 deep-set opening. A real reveal: a dark recessed body, glass set back inside it,
   * a chunky frame with visible section standing proud, and a sill nosing that projects.
   * Faces local +Z after `yaw`. Returns nothing — geometry only.
   */
  revealWindow(x, y, z, {
    w = 1.15, h = 1.30, yaw = 0, depth = 0.24,
    frame = 'trim', glass = 'glass', sillBucket = 'concrete', void_ = 'soil',
    bars = 1, transom = false, head = true,
  } = {}) {
    const fwdX = Math.sin(yaw * DEG);
    const fwdZ = Math.cos(yaw * DEG);
    const sideX = Math.cos(yaw * DEG);
    const sideZ = -Math.sin(yaw * DEG);
    const at = (along, out) => [x + sideX * along + fwdX * out, z + sideZ * along + fwdZ * out];
    // Reveal void: the hole is dark all the way in, so the opening reads as depth.
    const [vx, vz] = at(0, -depth * 0.5);
    this.box(void_, w, h, depth, vx, y, vz, yaw);
    // Glass body set back inside the reveal.
    const [gx, gz] = at(0, -depth * 0.42);
    this.box(glass, w - 0.10, h - 0.10, 0.06, gx, y, gz, yaw);
    // Frame members with real section, standing proud of the wall face.
    const jamb = 0.11;
    for (const s of [-1, 1]) {
      const [jx, jz] = at(s * (w * 0.5 + jamb * 0.5), 0.035);
      this.box(frame, jamb, h + jamb * 2, 0.17, jx, y, jz, yaw);
    }
    if (head) {
      const [hx, hz] = at(0, 0.045);
      this.box(frame, w + jamb * 2.6, 0.15, 0.20, hx, y + h * 0.5 + 0.075, hz, yaw);
      const [lx, lz] = at(0, 0.10);
      this.box(frame, w + jamb * 3.2, 0.08, 0.12, lx, y + h * 0.5 + 0.185, lz, yaw);
    }
    // Sill: projects further than the head, with a drip nose under it.
    const [sx, sz] = at(0, 0.10);
    this.box(sillBucket, w + jamb * 3.0, 0.12, 0.30, sx, y - h * 0.5 - 0.06, sz, yaw);
    const [dx, dz] = at(0, 0.16);
    this.box(sillBucket, w + jamb * 2.4, 0.06, 0.10, dx, y - h * 0.5 - 0.14, dz, yaw);
    for (let i = 0; i < bars; i += 1) {
      const t = bars === 1 ? 0 : (i / (bars - 1) - 0.5) * (w - 0.24);
      const [bx, bz] = at(t, -depth * 0.30);
      this.box(frame, 0.07, h - 0.12, 0.09, bx, y, bz, yaw);
    }
    if (transom) {
      const [tx, tz] = at(0, -depth * 0.30);
      this.box(frame, w - 0.10, 0.08, 0.09, tx, y + h * 0.22, tz, yaw);
    }
  }

  /** Door in the same reveal language: recessed leaf, chunky architrave, threshold step. */
  revealDoor(x, y0, z, {
    w = 1.05, h = 2.10, yaw = 0, depth = 0.22,
    leaf = 'timber', frame = 'trim', void_ = 'soil', threshold = 'concrete',
    fanlight = true, handle = 'steel', glass = 'glass',
  } = {}) {
    const fwdX = Math.sin(yaw * DEG);
    const fwdZ = Math.cos(yaw * DEG);
    const sideX = Math.cos(yaw * DEG);
    const sideZ = -Math.sin(yaw * DEG);
    const at = (along, out) => [x + sideX * along + fwdX * out, z + sideZ * along + fwdZ * out];
    const cy = y0 + h * 0.5;
    const [vx, vz] = at(0, -depth * 0.5);
    this.box(void_, w, h, depth, vx, cy, vz, yaw);
    const [lx, lz] = at(0, -depth * 0.24);
    this.box(leaf, w - 0.09, h - 0.08, 0.09, lx, cy, lz, yaw);
    // Two sunk panels so the leaf is not a slab.
    for (const oy of [-0.42, 0.30]) {
      const [px, pz] = at(0, -depth * 0.32);
      this.box(void_, w - 0.36, 0.52, 0.05, px, cy + oy, pz, yaw);
    }
    const jamb = 0.12;
    for (const s of [-1, 1]) {
      const [jx, jz] = at(s * (w * 0.5 + jamb * 0.5), 0.04);
      this.box(frame, jamb, h + jamb, 0.19, jx, cy + jamb * 0.5, jz, yaw);
    }
    const [hx, hz] = at(0, 0.05);
    this.box(frame, w + jamb * 2.6, 0.16, 0.22, hx, y0 + h + 0.08, hz, yaw);
    if (fanlight) {
      const [fx, fz] = at(0, -depth * 0.36);
      this.box(glass, w - 0.28, 0.26, 0.05, fx, y0 + h - 0.20, fz, yaw);
    }
    const [tx, tz] = at(0, 0.14);
    this.box(threshold, w + jamb * 3.4, 0.13, 0.46, tx, y0 + 0.06, tz, yaw);
    const [gx, gz] = at(w * 0.28, -depth * 0.10);
    this.box(handle, 0.07, 0.07, 0.14, gx, cy - 0.05, gz, yaw);
  }

  /**
   * §2.4 seamed skillion. Battens are raised members with their own shadow, the fascia
   * has section, and the gutter is a body with a downpipe — not a painted line.
   */
  seamSkillion(bucket, {
    x, z, w, d, y, yaw = 0, rise = 0.55, fascia = 'trim', gutter = 'steel', overhang = 0.34,
  }) {
    const W = w + overhang * 2;
    const D = d + overhang * 2;
    const slope = Math.atan2(rise, D) / DEG;
    const len = Math.hypot(D, rise);
    const midY = y + rise * 0.5;
    this.boxEx(bucket, W, 0.13, len, x, midY, z, { yaw, pitch: -slope });
    const fwdX = Math.sin(yaw * DEG);
    const fwdZ = Math.cos(yaw * DEG);
    const sideX = Math.cos(yaw * DEG);
    const sideZ = -Math.sin(yaw * DEG);
    const seams = Math.max(5, Math.round(W / 0.62));
    for (let i = 0; i <= seams; i += 1) {
      const t = (i / seams - 0.5) * W;
      this.boxEx(
        bucket, 0.09, 0.11, len * 0.99,
        x + sideX * t, midY + 0.10, z + sideZ * t,
        { yaw, pitch: -slope },
      );
    }
    // r2 FIX. `boxEx` rotates X then Y, so local +Z on a plane pitched by `-slope` points
    // at `(0, sin slope, cos slope)`: the plane's LOW eave is at -fwd and its HIGH end is
    // at +fwd, and the low eave sits at `y`, not at `y - rise * 0.5`. r1 put the fascia,
    // the gutter and the downpipe on the +fwd side at `y - rise * 0.5 - 0.06`, which is
    // the wrong end of the roof AND 0.29 m below the wall head on a 0.46 m rise — the
    // "loose trim bars flying free with both ends unattached" in the r1 critic's §3.
    const lowX = x - fwdX * (D * 0.5);
    const lowZ = z - fwdZ * (D * 0.5);
    const highX = x + fwdX * (D * 0.5);
    const highZ = z + fwdZ * (D * 0.5);
    this.box(fascia, W + 0.10, 0.24, 0.14, lowX, y - 0.09, lowZ, yaw);
    this.box(gutter, W + 0.04, 0.14, 0.19, lowX - fwdX * 0.10, y - 0.26, lowZ - fwdZ * 0.10, yaw);
    this.box(fascia, W + 0.10, 0.20, 0.13, highX, y + rise - 0.06, highZ, yaw);
    // Downpipe: runs from under the gutter to the ground, not to an arbitrary half-height.
    const dropTop = y - 0.33;
    const dropH = Math.max(0.4, dropTop - 0.20);
    this.cyl(
      gutter, 0.07, 0.07, dropH,
      lowX - fwdX * 0.10 + sideX * (W * 0.46),
      0.20 + dropH * 0.5,
      lowZ - fwdZ * 0.10 + sideZ * (W * 0.46), 6,
    );
  }

  /**
   * §2.4 seamed gable. Ridge runs along local Z; slopes fall in ±X.
   *
   * r2 SIGN FIX, and it is the largest single geometry defect the r1 round shipped.
   *
   * `boxEx` applies rotateX → rotateZ → rotateY, so a box whose length lies on local +X,
   * rolled by `a` about Z, points along `(cos a, sin a, 0)`. The r1 code passed
   * `roll: roll * s` with `roll = +atan2(rise, halfW)`, which sends the +X end of each
   * slope UPWARD as it travels AWAY from the ridge. Both slopes therefore rose outward:
   * the assembly was a butterfly, not a gable, the two planes met at the LOW point, and
   * the ridge cap — placed at `y + rise` — hung 1.15–1.30 m above where they met, over
   * open sky.
   *
   * That single sign is the r1 critic's §3 `market-hall` majors 1 and 5 ("roof planes at
   * different pitches interpenetrate, with a hole through to sky between them", "strut
   * passes through the eave and connects to nothing"), `brigade-bay` major 1 ("roof
   * separated from the wall with sky visible in the gap"), and the blind pair-03 call
   * ("B's roof planes sit proud of the wall with daylight visible in the gap"). It also
   * explains why the stepped gable-end infill read as a phantom second roof plane in
   * both files: the infill was drawn as a correct triangle, narrowing upward, and the
   * roof it was infilling opened upward.
   *
   * Verified by construction rather than by eye, because no plate can be captured this
   * round: `mvp/tests/v370-l5-roof-probe.mjs` samples the built slope geometry and
   * asserts the ridge end is the high end on both slopes and that the two planes meet
   * within 0.05 m of the ridge cap's underside.
   */
  seamGable(bucket, {
    x, z, w, d, y, yaw = 0, rise = 1.15, fascia = 'trim', gutter = 'steel',
    overhang = 0.36, seamStep = 0.60, ridge = true,
  }) {
    const D = d + overhang * 2;
    const halfW = w * 0.5 + overhang;
    const slopeLen = Math.hypot(halfW, rise);
    const roll = Math.atan2(rise, halfW) / DEG;
    const sideX = Math.cos(yaw * DEG);
    const sideZ = -Math.sin(yaw * DEG);
    const fwdX = Math.sin(yaw * DEG);
    const fwdZ = Math.cos(yaw * DEG);
    for (const s of [-1, 1]) {
      const px = x + sideX * (halfW * 0.5) * s;
      const pz = z + sideZ * (halfW * 0.5) * s;
      const py = y + rise * 0.5;
      this.boxEx(bucket, slopeLen, 0.13, D, px, py, pz, { yaw, roll: -roll * s });
      const seams = Math.max(4, Math.round(D / seamStep));
      for (let i = 0; i <= seams; i += 1) {
        const t = (i / seams - 0.5) * D;
        this.boxEx(
          bucket, slopeLen * 0.99, 0.11, 0.09,
          px + fwdX * t, py + 0.10, pz + fwdZ * t,
          { yaw, roll: -roll * s },
        );
      }
    }
    if (ridge) {
      this.box(bucket, 0.30, 0.17, D + 0.06, x, y + rise + 0.05, z, yaw);
      this.box(fascia, 0.20, 0.09, D + 0.14, x, y + rise + 0.16, z, yaw);
    }
    for (const s of [-1, 1]) {
      this.box(
        fascia, 0.16, 0.26, D + 0.10,
        x + sideX * halfW * s, y - 0.10, z + sideZ * halfW * s, yaw,
      );
      this.box(
        gutter, 0.20, 0.15, D + 0.04,
        x + sideX * (halfW + 0.11) * s, y - 0.26, z + sideZ * (halfW + 0.11) * s, yaw,
      );
      this.cyl(
        gutter, 0.07, 0.07, Math.max(0.6, y - 0.4),
        x + sideX * (halfW + 0.11) * s + fwdX * (D * 0.44),
        Math.max(0.6, y - 0.4) * 0.5 + 0.18,
        z + sideZ * (halfW + 0.11) * s + fwdZ * (D * 0.44), 6,
      );
    }
  }

  /**
   * §2.7 a path made of something. Individual pavers with joint lines running between
   * two points. Runs along X or Z only — every core path in this layer is orthogonal.
   */
  paverRun(ax, az, bx, bz, {
    width = 1.70, bucket = 'path', joint = 'soil', unit = 0.56, y = CORE_GROUND,
  } = {}) {
    const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
    const len = alongX ? Math.abs(bx - ax) : Math.abs(bz - az);
    const mx = (ax + bx) * 0.5;
    const mz = (az + bz) * 0.5;
    const rows = Math.max(2, Math.round(len / unit));
    const cols = Math.max(2, Math.round(width / unit));
    // r3: the bed sits at y − 0.005, not y − 0.03. At the old height its top was 0.255
    // under a tile ground surface of 0.26, so it was hidden by the very ground it was laid
    // on — the r2 critic's "paid for and buried" table lists 63–269 m² of it per object,
    // and the joints it was meant to draw were never drawn. Now the pavers stand 1.5 cm
    // proud of it and the gaps between them read as joints with real depth. §2.7.
    this.box(joint, alongX ? len + 0.10 : width + 0.10, 0.05, alongX ? width + 0.10 : len + 0.10, mx, y - 0.005, mz);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const along = (r + 0.5) / rows * len - len * 0.5;
        const across = (c + 0.5) / cols * width - width * 0.5 + ((r % 2) ? unit * 0.24 : 0);
        const px = mx + (alongX ? along : across);
        const pz = mz + (alongX ? across : along);
        this.box(
          bucket,
          (alongX ? len / rows : width / cols) - 0.07,
          0.07,
          (alongX ? width / cols : len / rows) - 0.07,
          px, y, pz,
        );
      }
    }
  }

  /** Paved forecourt: a field of pavers with joints. Same language as paverRun. */
  paverField(x, z, w, d, { bucket = 'path', joint = 'soil', unit = 0.72, y = CORE_GROUND } = {}) {
    const cols = Math.max(2, Math.round(w / unit));
    const rows = Math.max(2, Math.round(d / unit));
    this.box(joint, w + 0.08, 0.05, d + 0.08, x, y - 0.005, z);   // r3, see paverRun
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        this.box(
          bucket, w / cols - 0.08, 0.07, d / rows - 0.08,
          x - w * 0.5 + (c + 0.5) * (w / cols),
          y,
          z - d * 0.5 + (r + 0.5) * (d / rows),
        );
      }
    }
  }

  /**
   * §2.8 a fence with real pickets. Posts at intervals with caps, two rails with
   * section, capped pickets that stand ON the bottom rail, and a gate with a hung leaf.
   */
  picketFence({
    halfX = 7.1, halfZ = 7.1, h = 1.05, gate = true, gateWidth = 2.2,
    post = 'timber', picket = 'trim', pitch = 0.42, y0 = CORE_GROUND,
  } = {}) {
    const railY = [y0 + h * 0.28, y0 + h * 0.78];
    const postAt = (px, pz) => {
      this.box(post, 0.17, h + 0.22, 0.17, px, y0 + (h + 0.22) * 0.5, pz);
      this.box(picket, 0.24, 0.09, 0.24, px, y0 + h + 0.26, pz);
      this.cone(post, 0.13, 0.16, px, y0 + h + 0.38, pz, 4);
    };
    const run = (ax, az, bx, bz) => {
      const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
      const len = alongX ? Math.abs(bx - ax) : Math.abs(bz - az);
      const mx = (ax + bx) * 0.5;
      const mz = (az + bz) * 0.5;
      for (const y of railY) {
        if (alongX) this.box(post, len, 0.10, 0.09, mx, y, mz);
        else this.box(post, 0.09, 0.10, len, mx, y, mz);
      }
      const n = Math.max(3, Math.floor(len / pitch));
      for (let i = 0; i < n; i += 1) {
        const t = (i + 0.5) / n * len - len * 0.5;
        const px = mx + (alongX ? t : 0);
        const pz = mz + (alongX ? 0 : t);
        this.box(picket, alongX ? 0.13 : 0.05, h, alongX ? 0.05 : 0.13, px, y0 + h * 0.5 + 0.05, pz);
      }
      // Capping rail over the picket heads: the cap read for 12 tri instead of one
      // cone per picket, which is where a 16 m perimeter's budget goes.
      if (alongX) this.box(picket, len, 0.09, 0.15, mx, y0 + h + 0.10, mz);
      else this.box(picket, 0.15, 0.09, len, mx, y0 + h + 0.10, mz);
    };
    const step = (halfX * 2) / 6;
    for (let i = 0; i <= 6; i += 1) {
      const px = -halfX + i * step;
      if (!(gate && Math.abs(px) < gateWidth * 0.5)) postAt(px, halfZ);
      postAt(px, -halfZ);
    }
    for (let i = 1; i < 6; i += 1) {
      const pz = -halfZ + i * ((halfZ * 2) / 6);
      postAt(-halfX, pz);
      postAt(halfX, pz);
    }
    run(-halfX, -halfZ, halfX, -halfZ);
    run(-halfX, -halfZ, -halfX, halfZ);
    run(halfX, -halfZ, halfX, halfZ);
    if (gate) {
      run(-halfX, halfZ, -gateWidth * 0.5, halfZ);
      run(gateWidth * 0.5, halfZ, halfX, halfZ);
      postAt(-gateWidth * 0.5, halfZ);
      postAt(gateWidth * 0.5, halfZ);
      // Hung leaf, swung INWARD off the pier. Same r2 fix as `utilityFence` — r1 built
      // this leaf about a centre outside the fence line, so it hung over the ground past
      // the tile edge and swept through its own perimeter run.
      const LEAF_SWING = 58;
      const gx = -gateWidth * 0.5;
      const L = gateWidth * 0.92;
      const dirX = Math.cos(LEAF_SWING * DEG);
      const dirZ = -Math.sin(LEAF_SWING * DEG);
      const cx = gx + dirX * L * 0.5;
      const cz = halfZ + dirZ * L * 0.5;
      this.boxEx(picket, L, h, 0.07, cx, y0 + h * 0.5 + 0.05, cz, { yaw: LEAF_SWING });
      this.boxEx(post, L * 1.02, 0.09, 0.09, cx, y0 + h * 0.86, cz, { yaw: LEAF_SWING });
      this.boxEx(post, L * 1.02, 0.09, 0.09, cx, y0 + h * 0.22, cz, { yaw: LEAF_SWING });
      for (const hy of [y0 + h * 0.86, y0 + h * 0.22]) {
        this.box('steel', 0.24, 0.07, 0.09, gx + 0.10, hy, halfZ);
        this.cyl('steel', 0.05, 0.05, 0.18, gx, hy, halfZ, 6);
      }
    }
  }

  /**
   * Lean utility palisade. `chainLink({ barb: true })` costs ~14.8k tri on a 16 m
   * perimeter (56 tori at 160 tri each), which is the whole triangle budget for one
   * fence. This is the same read — capped box posts, three rails with section, palisade
   * verticals, a straight barb line on angle brackets — for about a sixth of the cost.
   */
  /**
   * r2 note on `pitch`: the default moved 0.44 → 0.66 and `barb` from three wires to two.
   * A 16 m perimeter at 0.44 is ~130 palisade verticals, 1,560 triangles, for a fence
   * that occupies a few percent of the plate — measured by
   * `v370-l5-geometry-probe.mjs --buckets`, which weights by face area precisely so this
   * kind of trade can be made on a number. That reclaim is what pays for `lotEdge`, which
   * the r1 critic ranked first by impact per unit of effort. Callers that want the dense
   * read can still pass `pitch`.
   */
  /**
   * r12 — THE FENCE IS DARK NOW, AND IT IS THE SAME CHANGE AS THE DARK-AREA DEFICIT.
   *
   * `post` and `rail` defaulted to `steel`, which the r12 ladder puts at rendered 132 — the
   * second-brightest bucket in the layer. The r11 critic's `substation` major S2: "the
   * perimeter rail is the brightest mass on the object and reads as a cage… The reference's
   * fence sits BELOW the transformer in value and lets the transformer read as the subject.
   * Here the fence wins the frame."
   *
   * The default is `soil` at rendered 31. Three things follow from one change:
   *   * the palisade sits below everything it stands in front of, as the reference's does;
   *   * a perimeter fence is 10–15 % of the face area on the objects that carry one, so it
   *     is the single largest contribution available to the dark-area floor the r11 plates
   *     measure at 4.8–13.6 % against the references' 14.2–31.4 %;
   *   * `steel` goes back to meaning bright galvanised structure — gantry, busbar, tank,
   *     flue frame — which is what makes the transformer read as the subject again.
   *
   * A caller wanting a genuinely galvanised fence (the mobility hub's cycle cage) still
   * passes `steel` explicitly.
   *
   * COST, because this helper is also the largest single item in the lane's budget: it was
   * 1,890 triangles on `substation`, 21 % of a 9,000 cap. Three cuts, none of which a plate
   * can see: the post foot pad (a 0.26 m square 9 cm high, buried in the sett course it
   * stands on — 12 triangles × 20 posts), the second barb wire (one strand reads as barbed
   * at board zoom and two do not read as two), and the pale pitch from 0.46 to 0.56, which
   * still puts 25 pales on a 14.3 m run. The r2 critic's complaint was 0.95 reading as "a
   * three-rail hand-rail with posts about a metre apart"; 0.56 is nowhere near that.
   */
  /**
   * IMPROVE ROUND — `spear`, and it is §2.8 asked for by name.
   *
   * §2.8: "fences with real pickets, capped, with posts at intervals, and a gate." The r13
   * critic read ours as "a plain balustrade against a spear-topped palisade" and put the
   * pickets first on this object's fix list. The pales EXIST in source — three-segment
   * prisms at 0.56 m pitch — but they stop dead level with the top rail at `h - 0.06`, so
   * the fence's silhouette is a rail with nothing above it, which is a balustrade whatever
   * is behind it. What makes `mp-block-substation.png`'s fence read as a palisade in one
   * glance is the row of points standing PROUD of the top rail.
   *
   * `spear` is that projection in metres. It costs nothing — the pale is the same prism,
   * run longer and tapered to a point at the head instead of to 0.030 — so this is a
   * silhouette change with a zero triangle delta, which is the rarest kind and the reason
   * it goes in rather than something bought with headroom. Default 0 so the wire-fenced
   * callers (`district-energy`'s security fence, `stormwater-basin`'s low rail) are
   * unchanged: a chain-wire fence has no pales to point.
   */
  utilityFence({
    halfX = 7.15, halfZ = 7.15, h = 1.75, gate = true, gateWidth = 2.8,
    post = 'soil', rail = 'soil', barb = true, pitch = 0.66, y0 = CORE_GROUND,
    foot = false, spear = 0,
  } = {}) {
    const railY = [y0 + 0.24, y0 + h * 0.56, y0 + h - 0.06];
    const postAt = (px, pz) => {
      this.box(post, 0.14, h, 0.14, px, y0 + h * 0.5, pz);
      this.box(post, 0.22, 0.08, 0.22, px, y0 + h + 0.03, pz);
      if (foot) this.box(post, 0.26, 0.09, 0.26, px, y0 + 0.05, pz);
    };
    const run = (ax, az, bx, bz) => {
      const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
      const len = alongX ? Math.abs(bx - ax) : Math.abs(bz - az);
      const mx = (ax + bx) * 0.5;
      const mz = (az + bz) * 0.5;
      for (const y of railY) {
        if (alongX) this.box(rail, len, 0.075, 0.065, mx, y, mz);
        else this.box(rail, 0.065, 0.075, len, mx, y, mz);
      }
      /**
       * Palisade pales. r3: an open-ended triangular prism, 6 triangles, instead of a box
       * at 12 — a real palisade pale is a folded D-section anyway, so the section is more
       * honest as well as half the price. The saving is spent entirely on pitch: the r2
       * critic measured that paying for `lotEdge` by taking `substation`'s pitch from 0.44
       * to 0.95 turned its palisade into "a three-rail hand-rail with posts about a metre
       * apart, which reads as a balcony balustrade, not a substation palisade", and asked
       * for it back. At 6 triangles a pale the dense read costs what the sparse one used to.
       */
      const n = Math.max(2, Math.floor(len / pitch));
      const paleH = h - 0.12 + spear;
      for (let i = 0; i < n; i += 1) {
        const t = (i + 0.5) / n * len - len * 0.5;
        this.cylEx(
          rail, spear ? 0.004 : 0.030, 0.036, paleH,
          mx + (alongX ? t : 0), y0 + (h - 0.12) * 0.5 + (spear ? spear * 0.5 : 0), mz + (alongX ? 0 : t),
          { segments: 3, openEnded: true, yaw: alongX ? 0 : 90 },
        );
      }
      if (barb) {
        // r12: one strand, not two. At board zoom two strands 0.16 m apart merge into one
        // line anyway, and the second cost 12 triangles a run on five runs an object.
        const lift = 0.26;
        if (alongX) this.box(rail, len, 0.04, 0.04, mx, y0 + h + lift, mz - 0.06);
        else this.box(rail, 0.04, 0.04, len, mx - 0.06, y0 + h + lift, mz);
      }
    };
    const step = (halfX * 2) / 5;
    for (let i = 0; i <= 5; i += 1) {
      const px = -halfX + i * step;
      postAt(px, -halfZ);
      if (!(gate && Math.abs(px) < gateWidth * 0.5)) postAt(px, halfZ);
    }
    for (let i = 1; i < 5; i += 1) {
      const pz = -halfZ + i * ((halfZ * 2) / 5);
      postAt(-halfX, pz);
      postAt(halfX, pz);
    }
    run(-halfX, -halfZ, halfX, -halfZ);
    run(-halfX, -halfZ, -halfX, halfZ);
    run(halfX, -halfZ, halfX, halfZ);
    if (gate) {
      run(-halfX, halfZ, -gateWidth * 0.5, halfZ);
      run(gateWidth * 0.5, halfZ, halfX, halfZ);
      for (const s of [-1, 1]) {
        this.box(post, 0.20, h + 0.42, 0.20, s * gateWidth * 0.5, y0 + (h + 0.42) * 0.5, halfZ);
        this.box(post, 0.28, 0.09, 0.28, s * gateWidth * 0.5, y0 + h + 0.46, halfZ);
      }
      // r2 FIX — the gate leaf is HUNG, and it swings INWARD.
      //
      // r1 built the leaf about a centre 0.62 m OUTSIDE the fence line and swung it out
      // over the ground. A 2.58 m leaf yawed 58° about that centre put its near end
      // 1.71 m beyond the fence — past the board tile — with no hinge post and no ground
      // contact, and its swept path crossed the perimeter run and the concrete pier. That
      // is four of the r1 critic's majors from one helper (`substation` 1 and 2,
      // `stormwater-basin` 1), and it is the same leaf on both objects, so it is one fix.
      //
      // The leaf now hangs off the pier at (-gateWidth/2, halfZ) and opens into the yard.
      // A box whose length lies on local +X and is yawed by `a` runs along
      // `(cos a, 0, -sin a)`, so at `a = LEAF_SWING` the leaf travels +x and -z — inward,
      // away from the tile edge. Its far corner lands at
      //   x = -gateWidth/2 + L·cos a,  z = halfZ - L·sin a
      // which for the roster's widest gate (2.8 m) is (1.08, halfZ - 2.11): inside the
      // fence on both axes. Checked by `mvp/tests/v370-l5-geometry-probe.mjs`, which
      // reports the worst |x|,|z| reach of any primitive against the tile half-extent.
      const LEAF_SWING = 55;
      const gx = -gateWidth * 0.5;
      const L = gateWidth * 0.92;
      const dirX = Math.cos(LEAF_SWING * DEG);
      const dirZ = -Math.sin(LEAF_SWING * DEG);
      const cx = gx + dirX * L * 0.5;
      const cz = halfZ + dirZ * L * 0.5;
      for (const ry of [y0 + h - 0.10, y0 + 0.28]) {
        this.boxEx(rail, L, 0.075, 0.065, cx, ry, cz, { yaw: LEAF_SWING });
      }
      for (let i = 0; i < 5; i += 1) {
        const t = (i + 0.5) / 5 - 0.5;
        this.boxEx(
          rail, 0.055, h - 0.30, 0.045,
          cx + dirX * t * L, y0 + h * 0.5, cz + dirZ * t * L,
          { yaw: LEAF_SWING },
        );
      }
      this.boxEx(rail, L * 1.02, 0.06, 0.05, cx, y0 + h * 0.52, cz, { yaw: LEAF_SWING, roll: 30 });
      // Hinges on the pier — the leaf is carried by something, per §1.2.
      for (const hy of [y0 + h - 0.14, y0 + 0.32]) {
        this.box(rail, 0.30, 0.09, 0.11, gx + 0.09, hy, halfZ, 0);
        this.cyl(rail, 0.055, 0.055, 0.20, gx, hy, halfZ, 6);
      }
      // Drop bolt at the leaf's free end, so it terminates on the ground rather than in air.
      this.cyl(rail, 0.045, 0.045, y0 + 0.30, gx + dirX * L * 0.94, (y0 + 0.30) * 0.5, halfZ + dirZ * L * 0.94, 6);
    }
  }

  /**
   * §2.6 lawn that is not a flat rectangle. Blades stand proud of the turf in clumps,
   * placed off a hash so the scatter is repeatable.
   */
  /**
   * One clump of grass. r3 rebuild — the r2 critic's fix item 4.
   *
   * r2 drew two upright boxes, `0.075 × 0.34 × 0.055` and `0.055 × 0.26 × 0.075`, fifteen
   * to sixteen per object, and it is the most-repeated element in the lane. On the plate
   * they read as *pegs*: "small green pegs with flat tops standing at even intervals on the
   * paving", named on four of the six objects and in two of the six blind calls.
   *
   * A blade of grass is not a box. Three tapered blades on a 3-sided open cylinder splay
   * from one root: a wide base, a tip at a fifth of the base radius, and three different
   * leans about two axes so the clump has a silhouette from every yaw. The taper is what
   * separates grass from a fence post at board zoom, and it is free — an open-ended
   * 3-segment cylinder is **6 triangles**, so a three-blade clump costs 18 against the
   * two-box clump's 24. Better read, and 6 triangles a clump back for the lot.
   */
  tuft(x, z, { y = CORE_GROUND, scale = 1, bucket = 'foliage', seed = 'tuft' } = {}) {
    const s = scale;
    const base = unit(seed, 'l') * 360;
    for (let i = 0; i < 3; i += 1) {
      const a = base + i * 118 + unit(seed, `a${i}`) * 26;
      const h = (0.30 + unit(seed, `h${i}`) * 0.16) * s;
      // r14 §5.3.2 — the lean band was 14–36°, which leaves a blade's flank near-vertical
      // and therefore on the hemisphere floor for half its circumference. 28–58° splays the
      // clump wider AND turns more of each blade's flank toward sky. Same triangle count.
      const lean = 28 + unit(seed, `n${i}`) * 30;
      // Lean the blade away from the clump centre, then swing it round to its own bearing.
      // The centre height is `h/2 · cos(lean)` so the BASE lands exactly on `y` whatever the
      // lean — a leaned primitive placed at h/2 floats by h(1−cos θ)/2, which at 36° is a
      // centimetre of daylight under every blade in the lane.
      this.cylEx(
        bucket, 0.011 * s, 0.052 * s, h,
        x + Math.sin(a * DEG) * 0.035 * s, y + h * 0.5 * Math.cos(lean * DEG), z + Math.cos(a * DEG) * 0.035 * s,
        { roll: lean, yaw: a, segments: 3, openEnded: true },
      );
    }
  }

  tufts(seed, count, {
    half = 7.0, bucket = 'foliage', y = CORE_GROUND, avoid = null, scale = 1,
  } = {}) {
    for (let i = 0; i < count; i += 1) {
      const px = (unit(seed, `tx${i}`) * 2 - 1) * half;
      const pz = (unit(seed, `tz${i}`) * 2 - 1) * half;
      if (avoid && avoid(px, pz)) continue;
      this.tuft(px, pz, {
        y, bucket, seed: `${seed}-${i}`,
        scale: (0.7 + unit(seed, `ts${i}`) * 0.7) * scale,
      });
    }
  }

  /**
   * §2.6 a tree with a leaf-cluster canopy, not a lollipop. Tapered trunk, two limbs,
   * and a canopy built from overlapping low-segment masses plus flat leaf plates that
   * break the outline. ~230 tri.
   */
  leafTree(x, z, {
    s = 1, bucket = 'foliage', trunk = 'timber', y0 = CORE_GROUND, seed = 'tree', lit = null,
  } = {}) {
    const h = 2.05 * s;
    // r2: the reference trees are open-crowned eucalypts with a lot of sky in them, not
    // solid balls. Four masses instead of six, a thinner trunk, and the outer leaf plates
    // split across TWO buckets so the canopy carries a second value — §2.9 asks for value
    // separation and a monolithic dark-green ball is the largest single-value object on
    // three of the six. `lit` defaults to the same bucket, so callers that do not care
    // get the old read at a lower triangle cost.
    /**
     * r3: `lit` is clamped to the canopy bucket unless the caller passes something within
     * a value band of it, and no caller passes one any more.
     *
     * The r2 API let a caller light the outer leaf plates from any bucket, and three types
     * passed `lit: 'turf'`. `turf` was authored 89 luma above `foliage`, so every third
     * leaf plate — a 0.74 × 0.075 × 0.44 box — arrived on the plate as a pale plank nailed
     * to a dark canopy with both ends in open sky. The r2 critic counted it as a §1.2
     * floating element on `stormwater-basin` and `mobility-hub` and called it in blind
     * pair-02: *"a pale tan bar sticking horizontally out of the canopy into open air."*
     * A canopy gets its second value from the geometry now — plate angle and self-shadow —
     * not from a second bucket.
     */
    const hi = bucket;
    this.cyl(trunk, 0.085 * s, 0.17 * s, h, x, y0 + h * 0.5, z, 6);
    this.cyl(trunk, 0.24 * s, 0.30 * s, 0.14 * s, x, y0 + 0.06 * s, z, 6);
    this.cylEx(trunk, 0.06 * s, 0.09 * s, 0.88 * s, x + 0.24 * s, y0 + h * 0.82, z + 0.06 * s, { roll: -40, segments: 5 });
    this.cylEx(trunk, 0.055 * s, 0.08 * s, 0.74 * s, x - 0.22 * s, y0 + h * 0.86, z - 0.08 * s, { roll: 36, segments: 5 });
    const top = y0 + h + 0.28 * s;
    // r4 — same change as `leafShrub`, same reason. An open-crowned canopy is a cluster of
    // lumps with sky between them, and four yawed boxes read closer to that than four spheres
    // do, at 48 triangles against 144.
    /**
     * r14 — §5.3.2, THE THIRD PRESCRIPTION, APPLIED TO BOXES.
     *
     * §5.3.2 names this lane's planting bands and prescribes ambient, authored value and
     * YAWING THE CARDS OFF THE AXIS. L5's planting is not crossed cards, it is yawed boxes,
     * and the same geometry applies one step over: a box has four vertical faces at yaw,
     * yaw+90, yaw+180 and yaw+270, so whatever the yaw, TWO of the four always face away
     * from the sun and receive hemisphere only. Measured on the lab rig
     * (`core-lab.js:38–44`, key (0.520, 0.780, 0.347)), `foliage` renders 10.0 on those two
     * faces against 49.9 on a top face, and a yaw sweep from 0° to 90° moves the four-face
     * mean by 2.5 luma — yaw alone buys nothing here.
     *
     * What DOES buy something is pitch and roll, because the hemisphere term is
     * `0.5·n.y + 0.5` toward sky and away from the dark ground colour: tilting a face
     * skyward lifts it whether or not the sun is behind it. So the canopy masses are yawed
     * toward the sun bearing (56.3° in this rig) AND tilted, which turns two dead vertical
     * faces per box into two sky-facing ones and one culled underside.
     */
    for (const [ox, oy, oz, w, h, d, yaw, pitch, roll] of [
      [0, 0.08, 0, 1.34, 0.96, 1.24, 56, 22, -16],
      [0.50, -0.06, 0.22, 0.94, 0.72, 0.86, 20, -19, 24],
      [-0.46, 0.02, -0.24, 0.98, 0.68, 0.90, -34, 24, 18],
      [0.14, 0.44, -0.30, 0.80, 0.60, 0.76, 74, -17, -21],
    ]) {
      this.boxEx(bucket, w * s, h * s, d * s, x + ox * s, top + oy * s, z + oz * s, { yaw, pitch, roll });
    }
    for (let i = 0; i < 8; i += 1) {
      const a = unit(seed, `lp${i}`) * 360;
      const rr = (0.60 + unit(seed, `lr${i}`) * 0.52) * s;
      const yy = top + ((unit(seed, `ly${i}`) * 2 - 1) * 0.64) * s;
      this.boxEx(
        i % 3 === 0 ? hi : bucket, 0.74 * s, 0.075 * s, 0.44 * s,
        x + Math.sin(a * DEG) * rr, yy, z + Math.cos(a * DEG) * rr,
        { yaw: a, roll: (unit(seed, `lz${i}`) * 2 - 1) * 26 },
      );
    }
  }

  /**
   * §2.6 shrub as a clustered mass with leaf silhouette. ~150 tri.
   *
   * r3: `lit` is ignored for the same reason as `leafTree`, and the mass count went from
   * three spheres to three spheres plus a skirt of splayed leaf plates that BREAK THE
   * OUTLINE at the base. The r2 critic measured what three bare spheres read as on four
   * plates — "a faceted lump", "a smooth olive-yellow polyhedron", "a lump of dough" — and
   * the cause is that a 6 × 4-segment sphere has a perfectly smooth silhouette. The plates
   * are what stops it being a ball; they need to reach past the spheres, not sit inside
   * them, so the radius went 0.34 → 0.52 and two of the five now sit low.
   */
  leafShrub(x, z, {
    s = 1, bucket = 'foliage', y0 = CORE_GROUND, seed = 'shrub',
  } = {}) {
    /**
     * r4 — CLUSTERED IRREGULAR MASSES, NOT SPHERES, which is the r3 critic's own prescription
     * ("a clustered shrub built from four or five overlapping irregular masses rather than one
     * sphere") and its own diagnosis of why three rounds of shrubs read as dough: "a 6 × 4
     * segment sphere has a perfectly smooth silhouette".
     *
     * Four boxes at four yaws overlap into a lumpy mass whose outline breaks at every corner.
     * It is also **48 triangles against the three spheres' 108**, which is the whole reason
     * §2.6 could be answered with real bed AREA this round without the lot allowance going
     * further past §3.4 than it already has. Better read and cheaper is not a trade — the
     * sphere was paying 36 triangles each for the one property the critic did not want.
     */
    // r14 — §5.3.2, as `leafTree`. Yawed toward the sun bearing and tilted, so the two
    // faces a yawed box always turns away from the key are sky-facing rather than dead.
    // The vertical offsets are raised to clear the tilt: a box of half-width w/2 rotated by
    // (pitch p, roll r) reaches `(w/2)|sin r| + ((h/2)cos p + (d/2)|sin p|)|cos r|` below its
    // centre, which for the first mass is 0.54 against an untilted 0.31. r12's offsets put
    // the tilted corner 24 cm under the ground; the lane's own geometry probe caught it at
    // −0.211 m on `district-energy` before any plate was taken.
    for (const [ox, oy, oz, w, h, d, yaw, pitch, roll] of [
      [0, 0.56, 0, 0.86, 0.62, 0.78, 56, 20, -18],
      [0.30, 0.48, 0.17, 0.62, 0.50, 0.58, 18, -22, 21],
      [-0.28, 0.46, -0.15, 0.60, 0.46, 0.62, -38, 25, 16],
      [0.05, 0.62, -0.22, 0.54, 0.40, 0.50, 72, -16, -24],
    ]) {
      this.boxEx(bucket, w * s, h * s, d * s, x + ox * s, y0 + oy * s, z + oz * s, { yaw, pitch, roll });
    }
    for (let i = 0; i < 6; i += 1) {
      const a = unit(seed, `s${i}`) * 360;
      const low = i % 3 === 0;
      this.boxEx(
        bucket, (low ? 0.40 : 0.54) * s, 0.055 * s, 0.26 * s,
        x + Math.sin(a * DEG) * (low ? 0.44 : 0.52) * s,
        y0 + (low ? 0.10 : 0.26 + unit(seed, `sy${i}`) * 0.42) * s,
        z + Math.cos(a * DEG) * (low ? 0.44 : 0.52) * s,
        { yaw: a, roll: (unit(seed, `sr${i}`) * 2 - 1) * 34 },
      );
    }
  }

  /** Post-and-rail kept for garden timber; prefer chainLink / bollards elsewhere. */
  fence({
    halfX = 7.1, halfZ = 7.1, h = 1.15, post = 'steel', rail = 'steel',
    gate = true, gateWidth = 2.2, postR = 0.09, railT = 0.07,
  } = {}) {
    const postsX = 6;
    const postsZ = 6;
    for (let i = 0; i <= postsX; i += 1) {
      const x = -halfX + (i / postsX) * halfX * 2;
      for (const z of [-halfZ, halfZ]) {
        if (gate && z > 0 && Math.abs(x) < gateWidth * 0.5) continue;
        this.cyl(post, postR, postR, h, x, h * 0.5 + 0.12, z, 6);
      }
    }
    for (let i = 1; i < postsZ; i += 1) {
      const z = -halfZ + (i / postsZ) * halfZ * 2;
      for (const x of [-halfX, halfX]) {
        this.cyl(post, postR, postR, h, x, h * 0.5 + 0.12, z, 6);
      }
    }
    for (const y of [0.42, 1.05]) {
      this.box(rail, halfX * 2, railT, railT, 0, y, -halfZ);
      if (gate) {
        const run = halfX - gateWidth * 0.5;
        this.box(rail, run, railT, railT, -halfX + run * 0.5, y, halfZ);
        this.box(rail, run, railT, railT, halfX - run * 0.5, y, halfZ);
      } else {
        this.box(rail, halfX * 2, railT, railT, 0, y, halfZ);
      }
      this.box(rail, railT, railT, halfZ * 2, -halfX, y, 0);
      this.box(rail, railT, railT, halfZ * 2, halfX, y, 0);
    }
    if (gate) {
      this.box(post, 0.14, h, 0.14, -gateWidth * 0.5, h * 0.5 + 0.12, halfZ);
      this.box(post, 0.14, h, 0.14, gateWidth * 0.5, h * 0.5 + 0.12, halfZ);
    }
  }

  /**
   * Toy chain-link / palisade: thick posts, top rail, panel fill that survives 16 m.
   * Mesh is vertical palisade + mid rail — reads as barrier, not ranch wire.
   */
  chainLink({
    halfX = 7.15, halfZ = 7.15, h = 1.15, gate = true, gateWidth = 2.4,
    post = 'steel', rail = 'steel', barb = false, mesh = false,
  } = {}) {
    const cornerR = 0.15;
    const midR = 0.11;
    const y0 = 0.16;
    const postsX = 7;
    const postsZ = 7;
    const plant = (x, z, r) => {
      this.cyl(post, r, r, h, x, y0 + h * 0.5, z, 8);
      this.cyl(post, r * 1.35, r * 1.35, 0.08, x, y0 + 0.03, z, 8);
    };
    for (let i = 0; i <= postsX; i += 1) {
      const x = -halfX + (i / postsX) * halfX * 2;
      for (const z of [-halfZ, halfZ]) {
        if (gate && z > 0 && Math.abs(x) < gateWidth * 0.5) continue;
        const r = (i === 0 || i === postsX) ? cornerR : midR;
        plant(x, z, r);
      }
    }
    for (let i = 1; i < postsZ; i += 1) {
      const z = -halfZ + (i / postsZ) * halfZ * 2;
      for (const x of [-halfX, halfX]) plant(x, z, midR);
    }

    const railY = [0.28, 0.62, y0 + h - 0.08];
    const span = (ax, az, bx, bz) => {
      const mx = (ax + bx) * 0.5;
      const mz = (az + bz) * 0.5;
      const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
      const len = alongX ? Math.abs(bx - ax) : Math.abs(bz - az);
      for (const y of railY) {
        if (alongX) this.box(rail, len, 0.055, 0.055, mx, y, mz);
        else this.box(rail, 0.055, 0.055, len, mx, y, mz);
      }
      if (mesh) {
        const step = 0.36;
        const n = Math.max(2, Math.floor(len / step));
        for (let i = 0; i < n; i += 1) {
          const t = (i + 0.5) / n - 0.5;
          const x = mx + (alongX ? t * len : 0);
          const z = mz + (alongX ? 0 : t * len);
          this.boxEx(rail, alongX ? 0.40 : 0.03, 0.03, alongX ? 0.03 : 0.40, x, y0 + 0.42, z, { roll: 40 });
          this.boxEx(rail, alongX ? 0.40 : 0.03, 0.03, alongX ? 0.03 : 0.40, x, y0 + 0.42, z, { roll: -40 });
          this.boxEx(rail, alongX ? 0.40 : 0.03, 0.03, alongX ? 0.03 : 0.40, x, y0 + 0.78, z, { roll: 40 });
          this.boxEx(rail, alongX ? 0.40 : 0.03, 0.03, alongX ? 0.03 : 0.40, x, y0 + 0.78, z, { roll: -40 });
        }
      } else {
        const step = 0.16;
        const n = Math.max(2, Math.floor(len / step));
        for (let i = 1; i < n; i += 1) {
          const t = i / n;
          const x = ax + (bx - ax) * t;
          const z = az + (bz - az) * t;
          this.box(rail, alongX ? 0.03 : 0.04, h - 0.18, alongX ? 0.04 : 0.03, x, y0 + h * 0.48, z);
        }
      }
    };

    span(-halfX, -halfZ, halfX, -halfZ);
    span(-halfX, -halfZ, -halfX, halfZ);
    span(halfX, -halfZ, halfX, halfZ);
    if (gate) {
      span(-halfX, halfZ, -gateWidth * 0.5, halfZ);
      span(gateWidth * 0.5, halfZ, halfX, halfZ);
      this.box(post, 0.14, h, 0.14, -gateWidth * 0.5, y0 + h * 0.5, halfZ);
      this.box(post, 0.14, h, 0.14, gateWidth * 0.5, y0 + h * 0.5, halfZ);
    } else {
      span(-halfX, halfZ, halfX, halfZ);
    }

    if (barb) {
      const coil = (ax, az, bx, bz) => {
        const n = 14;
        for (let i = 0; i < n; i += 1) {
          const t = (i + 0.5) / n;
          const x = ax + (bx - ax) * t;
          const z = az + (bz - az) * t;
          this.torus(rail, 0.09, 0.028, x, y0 + h + 0.14, z);
        }
      };
      coil(-halfX, -halfZ, halfX, -halfZ);
      coil(-halfX, halfZ, halfX, halfZ);
      coil(-halfX, -halfZ, -halfX, halfZ);
      coil(halfX, -halfZ, halfX, halfZ);
    }
  }

  timberFence({
    halfX = 7.15, halfZ = 7.15, h = 1.05, gate = true, gateWidth = 2.2,
  } = {}) {
    this.fence({
      halfX, halfZ, h, post: 'timber', rail: 'timber',
      gate, gateWidth, postR: 0.22, railT: 0.18,
    });
    for (const y of [0.32, 0.78, 1.18]) {
      this.box('timber', halfX * 2, 0.08, 0.10, 0, y, -halfZ);
      this.box('timber', 0.10, 0.08, halfZ * 2, -halfX, y, 0);
      this.box('timber', 0.10, 0.08, halfZ * 2, halfX, y, 0);
    }
  }

  bollards({
    halfX = 7.15, halfZ = 7.15, gate = true, gateWidth = 3.2, h = 0.72,
  } = {}) {
    const step = 1.55;
    const plant = (x, z) => {
      this.cyl('concrete', 0.12, 0.14, h, x, 0.18 + h * 0.5, z, 8);
      this.cyl('paintY', 0.13, 0.13, 0.08, x, 0.18 + h - 0.02, z, 8);
    };
    for (let x = -halfX; x <= halfX + 0.01; x += step) {
      plant(x, -halfZ);
      if (!(gate && Math.abs(x) < gateWidth * 0.5)) plant(x, halfZ);
    }
    for (let z = -halfZ + step; z < halfZ - 0.01; z += step) {
      plant(-halfX, z);
      plant(halfX, z);
    }
  }

  /**
   * Stairs that plant on the pad: paired stringers, treads, risers, handrails.
   * Climbs in +Z of local yaw (yaw 0 = +Z). First tread sits on y0.
   */
  stairs({
    x, z, y0 = CORE_GROUND, yaw = 0,
    steps = 6, rise = 0.20, tread = 0.26, width = 0.62,
    stringerT = 0.09, railH = 0.88,
    treadBucket = 'paintY', stringerBucket = 'paintB', railBucket = 'steel',
  } = {}) {
    const dirX = Math.sin(yaw * DEG);
    const dirZ = Math.cos(yaw * DEG);
    const sideX = Math.cos(yaw * DEG);
    const sideZ = -Math.sin(yaw * DEG);
    this.box(stringerBucket, width + 0.08, 0.10, tread + 0.06, x, y0 + 0.04, z, yaw);
    for (let i = 0; i < steps; i += 1) {
      const along = (i + 0.5) * tread;
      const px = x + dirX * along;
      const pz = z + dirZ * along;
      const cheekH = (i + 1) * rise + 0.10;
      for (const s of [-1, 1]) {
        this.box(
          stringerBucket, 0.11, cheekH, tread * 0.98,
          px + sideX * (width * 0.5 + 0.04) * s,
          y0 + cheekH * 0.5,
          pz + sideZ * (width * 0.5 + 0.04) * s,
          yaw,
        );
      }
    }
    for (let i = 0; i < steps; i += 1) {
      const along = (i + 0.5) * tread;
      const px = x + dirX * along;
      const pz = z + dirZ * along;
      const ty = y0 + (i + 1) * rise - 0.035;
      this.box(treadBucket, width, 0.07, tread * 0.92, px, ty, pz, yaw);
      this.box(
        stringerBucket, width, rise * 0.82, 0.05,
        x + dirX * (i * tread + 0.02), y0 + i * rise + rise * 0.4, z + dirZ * (i * tread + 0.02),
        yaw,
      );
    }
    const run = steps * tread;
    const riseT = steps * rise;
    const len = Math.hypot(run, riseT);
    const pitch = Math.atan2(riseT, run) / DEG;
    const midAlong = run * 0.5;
    const midY = y0 + riseT * 0.5;
    for (const s of [-1, 1]) {
      const sx = x + dirX * midAlong + sideX * (width * 0.5 + 0.02) * s;
      const sz = z + dirZ * midAlong + sideZ * (width * 0.5 + 0.02) * s;
      this.boxEx(stringerBucket, stringerT, 0.20, len, sx, midY, sz, { yaw, pitch: -pitch });
    }
    const posts = steps + 1;
    for (let i = 0; i <= steps; i += 1) {
      const along = i * tread;
      const py = y0 + i * rise + railH * 0.5;
      for (const s of [-1, 1]) {
        const px = x + dirX * along + sideX * (width * 0.5 + 0.03) * s;
        const pz = z + dirZ * along + sideZ * (width * 0.5 + 0.03) * s;
        this.cyl(railBucket, 0.035, 0.035, railH, px, py, pz, 6);
      }
    }
    for (const s of [-1, 1]) {
      const hx = x + dirX * midAlong + sideX * (width * 0.5 + 0.03) * s;
      const hz = z + dirZ * midAlong + sideZ * (width * 0.5 + 0.03) * s;
      this.boxEx(
        railBucket, 0.045, 0.045, len,
        hx, y0 + riseT * 0.5 + railH, hz,
        { yaw, pitch: -pitch },
      );
    }
  }

  /**
   * r14 — `y0`. The foot was hardcoded at 0.18 m, which is fine for a ladder standing on the
   * lot and wrong for one climbing anything that starts higher: on `brigade-bay` the tank
   * ladder was drawn from 0.18 to 4.33 against a tank whose crown is at 5.81, so it began
   * inside the stand and ended in mid-air between the two. That is the r13 critic's B1,
   * second half — "the orange access ladder's stiles terminate above the pad and below the
   * tank crown, touching neither" — and it was a defaulted constant, not a placement.
   */
  ladder(x, z, h = 1.8, yaw = 0, bucket = 'steel', { y0 = 0.18 } = {}) {
    const dirX = Math.sin(yaw * DEG);
    const dirZ = Math.cos(yaw * DEG);
    const sideX = Math.cos(yaw * DEG);
    const sideZ = -Math.sin(yaw * DEG);
    for (const s of [-1, 1]) {
      this.cyl(
        bucket, 0.035, 0.035, h,
        x + sideX * 0.22 * s, y0 + h * 0.5, z + sideZ * 0.22 * s, 6,
      );
    }
    const rungs = Math.max(4, Math.round(h / 0.28));
    for (let i = 0; i < rungs; i += 1) {
      const y = y0 + 0.10 + i * (h - 0.2) / (rungs - 1);
      this.box(bucket, 0.48, 0.04, 0.04, x + dirX * 0.02, y, z + dirZ * 0.02, yaw);
    }
  }

  slatBench(x, z, yaw = 0, { w = 1.85, slat = 'timber', frame = 'steel' } = {}) {
    const y = CORE_GROUND;
    const end = w * 0.5 - 0.06;
    const sideX = Math.cos(yaw * DEG);
    const sideZ = -Math.sin(yaw * DEG);
    for (const s of [-1, 1]) {
      const ex = x + sideX * end * s;
      const ez = z + sideZ * end * s;
      this.boxEx(frame, 0.10, 0.62, 0.42, ex, y + 0.38, ez, { yaw });
      this.boxEx(frame, 0.08, 0.28, 0.08, ex + Math.sin(yaw * DEG) * 0.14, y + 0.14, ez + Math.cos(yaw * DEG) * 0.14, { yaw });
      this.boxEx(frame, 0.08, 0.28, 0.08, ex - Math.sin(yaw * DEG) * 0.14, y + 0.14, ez - Math.cos(yaw * DEG) * 0.14, { yaw });
    }
    for (const t of [-0.14, 0, 0.14]) {
      this.boxEx(
        slat, w - 0.12, 0.06, 0.10,
        x + Math.sin(yaw * DEG) * t, y + 0.46, z + Math.cos(yaw * DEG) * t,
        { yaw },
      );
    }
    this.boxEx(
      slat, w - 0.16, 0.42, 0.07,
      x - Math.sin(yaw * DEG) * 0.18, y + 0.78, z - Math.cos(yaw * DEG) * 0.18,
      { yaw },
    );
    for (const t of [0.12, 0.28]) {
      this.boxEx(
        slat, w - 0.2, 0.07, 0.06,
        x - Math.sin(yaw * DEG) * 0.18, y + 0.58 + t, z - Math.cos(yaw * DEG) * 0.18,
        { yaw },
      );
    }
  }

  lantern(x, z) {
    this.cyl('soil', 0.22, 0.26, 0.28, x, 0.28, z, 8);
    this.cyl('soil', 0.14, 0.14, 2.20, x, 1.40, z, 8);
    this.box('soil', 0.58, 0.14, 0.58, x, 2.52, z);
    this.box('paintY', 0.40, 0.50, 0.40, x, 2.80, z);
    this.box('soil', 0.18, 0.50, 0.18, x - 0.22, 2.80, z - 0.22);
    this.box('soil', 0.18, 0.50, 0.18, x + 0.22, 2.80, z + 0.22);
    this.box('soil', 0.18, 0.50, 0.18, x - 0.22, 2.80, z + 0.22);
    this.box('soil', 0.18, 0.50, 0.18, x + 0.22, 2.80, z - 0.22);
    this.box('soil', 0.56, 0.12, 0.56, x, 3.08, z);
    this.cone('soil', 0.26, 0.20, x, 3.22, z, 6);
  }

  fountain(x, z, { figure = true } = {}) {
    this.cyl('concrete', 1.48, 1.62, 0.52, x, 0.42, z, 16);
    this.cyl('concrete', 1.32, 1.32, 0.16, x, 0.66, z, 16);
    this.cyl('paintB', 1.24, 1.24, 0.42, x, 0.86, z, 14);
    if (figure) {
      this.cyl('concrete', 0.88, 0.98, 0.34, x, 0.88, z + 0.10, 12);
      this.sphere('concrete', 0.40, x, 1.18, z + 0.22, 8, 6);
      this.cyl('concrete', 0.24, 0.28, 0.14, x, 1.32, z + 0.12, 8);
      this.sphere('concrete', 0.38, x, 1.52, z + 0.38, 8, 6);
      this.cyl('concrete', 0.32, 0.24, 0.34, x, 1.74, z + 0.10, 8);
      this.sphere('concrete', 0.24, x, 2.04, z + 0.06, 8, 6);
      this.cylEx('concrete', 0.11, 0.12, 0.36, x - 0.32, 0.80, z + 0.38, { pitch: 22 });
      this.cylEx('concrete', 0.11, 0.12, 0.36, x + 0.32, 0.80, z + 0.38, { pitch: 22 });
      this.cylEx('concrete', 0.09, 0.09, 0.50, x - 0.46, 1.58, z + 0.18, { roll: 38 });
      this.cylEx('concrete', 0.09, 0.09, 0.50, x + 0.46, 1.58, z + 0.18, { roll: -38 });
      this.boxEx('concrete', 1.05, 0.10, 0.44, x - 0.58, 1.70, z - 0.18, { yaw: 14, roll: 22 });
      this.boxEx('concrete', 1.05, 0.10, 0.44, x + 0.58, 1.70, z - 0.18, { yaw: -14, roll: -22 });
      this.cyl('paintY', 0.06, 0.06, 0.12, x, 2.36, z + 0.02, 6);
      this.cyl('paintB', 0.05, 0.05, 0.24, x, 2.48, z + 0.02, 6);
    }
    for (const a of [0, 90, 180, 270]) {
      const dx = Math.sin(a * DEG) * 1.00;
      const dz = Math.cos(a * DEG) * 1.00;
      this.box('paintB', 0.12, 0.42, 0.12, x + dx, 0.48, z + dz);
    }
  }

  topiary(x, y, z, s = 1) {
    for (const [ox, oy, oz, r] of [
      [0.00, 0.38, 0.00, 0.48],
      [0.28, 0.34, 0.16, 0.34],
      [-0.26, 0.32, -0.14, 0.34],
      [0.12, 0.30, -0.28, 0.32],
      [-0.16, 0.36, 0.26, 0.32],
      [0.30, 0.22, -0.18, 0.28],
      [-0.28, 0.22, 0.20, 0.28],
      [0.06, 0.54, 0.04, 0.30],
      [0.22, 0.48, 0.22, 0.26],
      [-0.20, 0.50, -0.10, 0.26],
      [0.00, 0.22, 0.00, 0.36],
      [0.18, 0.42, -0.20, 0.24],
      [-0.14, 0.44, 0.18, 0.24],
    ]) {
      this.sphere('foliage', r * s, x + ox * s, y + oy * s, z + oz * s, 6, 4);
    }
    for (const [ox, oy, oz, yaw] of [
      [0.22, 0.56, 0.10, 18], [-0.20, 0.52, -0.08, -28],
      [0.08, 0.62, 0.18, 8], [-0.08, 0.50, -0.18, -16],
      [0.16, 0.40, -0.14, 36], [-0.12, 0.58, 0.14, -10],
      [0.00, 0.70, 0.00, 4], [0.20, 0.34, 0.12, 48],
    ]) {
      this.boxEx(
        'foliage', 0.42 * s, 0.08 * s, 0.24 * s,
        x + ox * s, y + oy * s, z + oz * s,
        { yaw },
      );
    }
    this.sphere('paintY', 0.10 * s, x - 0.18 * s, y + 0.58 * s, z + 0.16 * s, 5, 4);
    this.sphere('paintR', 0.08 * s, x + 0.08 * s, y + 0.72 * s, z - 0.08 * s, 5, 4);
  }

  veg(x, y, z, kind = 0) {
    const body = kind === 0 ? 'paintO' : kind === 1 ? 'paintR' : 'paintY';
    this.sphere(body, 0.38, x, y + 0.28, z, 7, 5);
    if (kind === 0) this.cone(body, 0.20, 0.36, x, y + 0.20, z, 6);
    this.boxEx('paintG', 0.78, 0.06, 0.30, x + 0.22, y + 0.50, z, { pitch: -10 });
    this.boxEx('paintG', 0.78, 0.06, 0.30, x - 0.22, y + 0.50, z, { pitch: -10, yaw: 180 });
    this.boxEx('paintG', 0.30, 0.06, 0.78, x, y + 0.52, z + 0.22, { pitch: -10 });
    this.boxEx('paintG', 0.30, 0.06, 0.78, x, y + 0.52, z - 0.22, { pitch: -10 });
  }

  raisedBed(x, z, w = 3.6, d = 2.4, pattern = 0) {
    this.box('timber', w, 0.42, d, x, 0.38, z);
    this.box('timber', w + 0.08, 0.08, 0.08, x, 0.58, z - d * 0.5);
    this.box('timber', w + 0.08, 0.08, 0.08, x, 0.58, z + d * 0.5);
    this.box('soil', w - 0.28, 0.16, d - 0.28, x, 0.56, z);
    const cols = 3;
    const rows = 2;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const vx = x - w * 0.28 + c * (w * 0.28);
        const vz = z - d * 0.22 + r * (d * 0.44);
        this.veg(vx, 0.62, vz, (pattern + r + c) % 3);
      }
    }
  }

  corrugatedWall(bucket, w, h, x, y, z, yaw = 0, depth = 0.08) {
    const step = 0.14;
    const n = Math.max(3, Math.round(w / step));
    const sideX = Math.cos(yaw * DEG);
    const sideZ = -Math.sin(yaw * DEG);
    for (let i = 0; i < n; i += 1) {
      const t = (i + 0.5) / n - 0.5;
      const px = x + sideX * t * w;
      const pz = z + sideZ * t * w;
      const bump = (i % 2) ? depth : depth * 0.45;
      this.box(bucket, step * 0.72, h, bump, px, y, pz, yaw);
    }
  }

  pitchedRoof(bucket, w, d, x, y, z, yaw = 0) {
    this.box(bucket, w + 0.5, 0.16, d + 0.5, x, y + 0.06, z, yaw);
    this.box(bucket, w + 0.22, 0.28, d * 0.4, x, y + 0.24, z, yaw);
    const n = Math.max(5, Math.round(d / 0.22));
    const fwdX = Math.sin(yaw * DEG);
    const fwdZ = Math.cos(yaw * DEG);
    for (let i = 0; i < n; i += 1) {
      const t = (i + 0.5) / n - 0.5;
      this.box(bucket, w + 0.42, 0.05, 0.09, x + fwdX * t * d, y + 0.15, z + fwdZ * t * d, yaw);
    }
  }

  /**
   * Corrugated shed. Optional open roller bay on the +Z face (after yaw).
   * Interior is a dark steel void so the mouth reads as a loading bay.
   */
  corrugatedShed({
    x, z, w = 6.4, d = 4.6, h = 3.1, yaw = 0,
    wall = 'paintY', roof = 'steel',
    bay = true, bayW = 2.6, bayH = 2.15,
    door = true, sign = '', apron = 'concrete',
  } = {}) {
    this.box(bay ? 'soil' : 'steel', w - 0.45, h - 0.55, d - 0.45, x, 0.18 + (h - 0.55) * 0.5, z);
    this.box(roof, w - 0.2, 0.08, d - 0.2, x, 0.18 + h - 0.12, z);
    const sideX = Math.cos(yaw * DEG);
    const sideZ = -Math.sin(yaw * DEG);
    const fwdX = Math.sin(yaw * DEG);
    const fwdZ = Math.cos(yaw * DEG);
    const backX = x - fwdX * (d * 0.5);
    const backZ = z - fwdZ * (d * 0.5);
    const frontX = x + fwdX * (d * 0.5);
    const frontZ = z + fwdZ * (d * 0.5);
    const leftX = x - sideX * (w * 0.5);
    const leftZ = z - sideZ * (w * 0.5);
    const rightX = x + sideX * (w * 0.5);
    const rightZ = z + sideZ * (w * 0.5);
    this.corrugatedWall(wall, w, h, backX, 0.18 + h * 0.5, backZ, yaw, 0.09);
    this.corrugatedWall(wall, d, h, leftX, 0.18 + h * 0.5, leftZ, yaw + 90, 0.09);
    this.corrugatedWall(wall, d, h, rightX, 0.18 + h * 0.5, rightZ, yaw + 90, 0.09);
    if (bay) {
      const leaf = (w - bayW) * 0.5;
      this.corrugatedWall(
        wall, leaf, h,
        frontX - sideX * (bayW * 0.5 + leaf * 0.5), 0.18 + h * 0.5, frontZ - sideZ * (bayW * 0.5 + leaf * 0.5),
        yaw, 0.09,
      );
      this.corrugatedWall(
        wall, leaf, h,
        frontX + sideX * (bayW * 0.5 + leaf * 0.5), 0.18 + h * 0.5, frontZ + sideZ * (bayW * 0.5 + leaf * 0.5),
        yaw, 0.09,
      );
      this.box(
        wall, bayW + 0.2, h - bayH, 0.12,
        frontX, 0.18 + bayH + (h - bayH) * 0.5, frontZ, yaw,
      );
      this.box('steel', bayW + 0.16, 0.12, 0.16, frontX, 0.18 + bayH, frontZ, yaw);
      this.box('steel', 0.08, bayH, 0.10, frontX - sideX * (bayW * 0.5), 0.18 + bayH * 0.5, frontZ - sideZ * (bayW * 0.5), yaw);
      this.box('steel', 0.08, bayH, 0.10, frontX + sideX * (bayW * 0.5), 0.18 + bayH * 0.5, frontZ + sideZ * (bayW * 0.5), yaw);
      this.box(apron, bayW + 0.3, 0.10, 0.45, frontX + fwdX * 0.2, 0.20, frontZ + fwdZ * 0.2, yaw);
    } else {
      this.corrugatedWall(wall, w, h, frontX, 0.18 + h * 0.5, frontZ, yaw, 0.09);
      if (door) {
        this.box('timber', 0.95, 1.7, 0.08, frontX + fwdX * 0.06, 1.02, frontZ + fwdZ * 0.06, yaw);
        this.box('paintG', 0.82, 1.55, 0.05, frontX + fwdX * 0.08, 1.0, frontZ + fwdZ * 0.08, yaw);
        this.box('glass', 0.55, 0.48, 0.04, frontX + sideX * 1.15 + fwdX * 0.06, 1.65, frontZ + sideZ * 1.15 + fwdZ * 0.06, yaw);
        this.box('steel', 0.62, 0.06, 0.05, frontX + sideX * 1.15 + fwdX * 0.06, 1.92, frontZ + sideZ * 1.15 + fwdZ * 0.06, yaw);
        this.box('steel', 0.62, 0.06, 0.05, frontX + sideX * 1.15 + fwdX * 0.06, 1.38, frontZ + sideZ * 1.15 + fwdZ * 0.06, yaw);
      }
    }
    this.pitchedRoof(roof, w, d, x, 0.18 + h, z, yaw);
    if (sign) {
      this.letterBar(
        sign,
        frontX + fwdX * 0.10,
        0.18 + h - 0.52,
        frontZ + fwdZ * 0.10,
        { yaw, scale: 1.12 },
      );
    }
  }

  /** Five-stroke painted letters on a blue board. Must read at ¾. */
  letterBar(text, x, y, z, { yaw = 0, scale = 1 } = {}) {
    const S = scale;
    const sideX = Math.cos(yaw * DEG);
    const sideZ = -Math.sin(yaw * DEG);
    const fwdX = Math.sin(yaw * DEG);
    const fwdZ = Math.cos(yaw * DEG);
    const pitch = 0.70 * S;
    const n = text.length;
    this.box('paintB', n * pitch + 0.50 * S, 1.05 * S, 0.14, x, y, z, yaw);
    const start = -((n - 1) * pitch) * 0.5;
    const put = (ox, oy, w, h) => {
      this.box(
        'paintY', w, h, 0.16,
        x + sideX * ox + fwdX * 0.10,
        y + oy,
        z + sideZ * ox + fwdZ * 0.10,
        yaw,
      );
    };
    for (let i = 0; i < n; i += 1) {
      const ox = start + i * pitch;
      const ch = text[i];
      if (ch === 'W') {
        put(ox - 0.26 * S, 0, 0.14 * S, 0.82 * S);
        put(ox + 0.26 * S, 0, 0.14 * S, 0.82 * S);
        put(ox - 0.09 * S, -0.16 * S, 0.14 * S, 0.50 * S);
        put(ox + 0.09 * S, -0.16 * S, 0.14 * S, 0.50 * S);
        put(ox, -0.34 * S, 0.28 * S, 0.14 * S);
      } else if (ch === 'O') {
        put(ox, 0.32 * S, 0.46 * S, 0.14 * S);
        put(ox, -0.32 * S, 0.46 * S, 0.14 * S);
        put(ox - 0.20 * S, 0, 0.14 * S, 0.50 * S);
        put(ox + 0.20 * S, 0, 0.14 * S, 0.50 * S);
      } else if (ch === 'R') {
        put(ox - 0.20 * S, 0, 0.14 * S, 0.82 * S);
        put(ox + 0.04 * S, 0.34 * S, 0.34 * S, 0.14 * S);
        put(ox + 0.18 * S, 0.16 * S, 0.14 * S, 0.36 * S);
        put(ox + 0.02 * S, 0.00 * S, 0.32 * S, 0.14 * S);
        put(ox + 0.16 * S, -0.30 * S, 0.14 * S, 0.28 * S);
      } else if (ch === 'K') {
        put(ox - 0.20 * S, 0, 0.16 * S, 0.82 * S);
        put(ox + 0.00 * S, 0.00 * S, 0.18 * S, 0.16 * S);
        put(ox + 0.16 * S, 0.28 * S, 0.16 * S, 0.36 * S);
        put(ox + 0.28 * S, 0.36 * S, 0.16 * S, 0.22 * S);
        put(ox + 0.16 * S, -0.28 * S, 0.16 * S, 0.36 * S);
        put(ox + 0.28 * S, -0.36 * S, 0.16 * S, 0.22 * S);
      } else if (ch === 'S') {
        put(ox, 0.34 * S, 0.46 * S, 0.14 * S);
        put(ox - 0.18 * S, 0.18 * S, 0.14 * S, 0.26 * S);
        put(ox, 0, 0.46 * S, 0.14 * S);
        put(ox + 0.18 * S, -0.18 * S, 0.14 * S, 0.26 * S);
        put(ox, -0.34 * S, 0.46 * S, 0.14 * S);
      } else if (ch === 'D') {
        put(ox - 0.18 * S, 0, 0.14 * S, 0.82 * S);
        put(ox + 0.02 * S, 0.34 * S, 0.28 * S, 0.14 * S);
        put(ox + 0.02 * S, -0.34 * S, 0.28 * S, 0.14 * S);
        put(ox + 0.16 * S, 0, 0.14 * S, 0.54 * S);
      } else if (ch === 'I') {
        put(ox, 0, 0.16 * S, 0.82 * S);
        put(ox, 0.36 * S, 0.32 * S, 0.12 * S);
        put(ox, -0.36 * S, 0.32 * S, 0.12 * S);
      } else if (ch === 'E') {
        put(ox - 0.16 * S, 0, 0.14 * S, 0.82 * S);
        put(ox + 0.04 * S, 0.34 * S, 0.32 * S, 0.14 * S);
        put(ox + 0.02 * S, 0, 0.26 * S, 0.14 * S);
        put(ox + 0.04 * S, -0.34 * S, 0.32 * S, 0.14 * S);
      } else if (ch === 'L') {
        put(ox - 0.16 * S, 0, 0.14 * S, 0.82 * S);
        put(ox + 0.04 * S, -0.34 * S, 0.36 * S, 0.14 * S);
      }
    }
  }

  /** One continuous pitched chute from the deck to the rubber. */
  waveChute(x, y0, z0, { segs = 1, yaw = 0 } = {}) {
    const dirX = Math.sin(yaw * DEG);
    const dirZ = Math.cos(yaw * DEG);
    const sideX = Math.cos(yaw * DEG);
    const sideZ = -Math.sin(yaw * DEG);
    const along = 1.55;
    const px = x + dirX * along;
    const pz = z0 + dirZ * along;
    const y = y0 - 0.15;
    const len = 3.55;
    const pitch = 32;
    this.boxEx('paintY', 1.00, 0.14, len, px, y, pz, { yaw, pitch });
    this.boxEx('paintB', 0.15, 0.42, len, px - sideX * 0.52, y + 0.16, pz - sideZ * 0.52, { yaw, pitch });
    this.boxEx('paintB', 0.15, 0.42, len, px + sideX * 0.52, y + 0.16, pz + sideZ * 0.52, { yaw, pitch });
  }

  /** Wall-mounted roller: tracks + header + sill + ribbed curtain. No center mullion. */
  rollerInWall(x, y, z, {
    w = 2.4, h = 2.2, yaw = 0, bucket = 'steel', open = 0, bay = true, sill = 'concrete',
  } = {}) {
    const lift = open * h * 0.42;
    const fwdX = Math.sin(yaw * DEG);
    const fwdZ = Math.cos(yaw * DEG);
    const sideX = Math.cos(yaw * DEG);
    const sideZ = -Math.sin(yaw * DEG);
    if (bay) {
      this.box(
        'soil', w * 0.98, h * 1.12, 1.55,
        x - fwdX * 0.82, y + h * 0.52, z - fwdZ * 0.82, yaw,
      );
    }
    this.box('soil', w * 0.98, 0.90, 0.95, x - fwdX * 0.42, y + h - 0.10, z - fwdZ * 0.42, yaw);
    this.box('soil', w + 0.30, 0.32, 0.28, x, y + h + 0.08, z, yaw);
    this.box('steel', 0.11, h, 0.16, x - sideX * (w * 0.5 + 0.07), y + h * 0.5, z - sideZ * (w * 0.5 + 0.07), yaw);
    this.box('steel', 0.11, h, 0.16, x + sideX * (w * 0.5 + 0.07), y + h * 0.5, z + sideZ * (w * 0.5 + 0.07), yaw);
    this.box(sill, w + 0.26, 0.10, 0.26, x, y + 0.04, z, yaw);
    const curtainH = Math.max(0.40, h - lift - 0.10);
    const cy = y + lift + curtainH * 0.5 + 0.06;
    this.box(bucket, w, curtainH, 0.16, x, cy, z, yaw);
    const ribs = Math.max(10, Math.round(curtainH / 0.10));
    for (let i = 0; i < ribs; i += 1) {
      const ry = y + lift + 0.10 + i * (curtainH / ribs);
      this.box('steel', w * 0.96, 0.045, 0.08, x + fwdX * 0.04, ry, z + fwdZ * 0.04, yaw);
    }
  }

  /**
   * W10-C: a 240 L council wheelie bin at its real size, 0.58 x 0.73 x 1.07 m. It was a
   * 1.15 x 1.05 x 0.85 m pastel box (a pink, sky-blue or teal chest freezer on four castors).
   *
   * Council bins are a dark body with a coloured lid, so the body is charcoal (`soil`) or dark
   * green (`paintG`) and ONLY the lid carries the accent. `body` still accepts the old bucket
   * names so existing call sites keep working: `paintR` / `paintO` / `paintY` now name the LID
   * colour on a charcoal body, `paintG` is an all-green body, anything else is a charcoal body.
   * Local -Z is the back (handle and wheels), local +Z is the front.
   */
  wheeledBin(x, z, body = 'soil', { lid = null, yaw = 0, ground = CORE_GROUND } = {}) {
    const green = body === 'paintG';
    const bodyBucket = green ? 'paintG' : 'soil';
    // The default lid is a bucket every caller already owns (a green body keeps a green lid, a
    // charcoal body takes `paintY`), so a bin never adds a draw call to the type that holds it.
    const lidBucket = lid ?? (green ? 'paintG' : ['paintR', 'paintO', 'paintY'].includes(body) ? body : 'paintY');
    const s = Math.sin(yaw * DEG);
    const c = Math.cos(yaw * DEG);
    const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    this.boxEx(bodyBucket, 0.54, 0.88, 0.66, x, ground + 0.54, z, { yaw });
    this.boxEx(lidBucket, 0.58, 0.07, 0.73, x, ground + 1.035, z, { yaw });
    const [hx, hz] = at(0, -0.37);
    this.boxEx('soil', 0.46, 0.05, 0.05, hx, ground + 0.96, hz, { yaw });
    for (const sx of [-1, 1]) {
      const [wx, wz] = at(sx * 0.26, -0.25);
      this.boxEx('soil', 0.06, 0.20, 0.20, wx, ground + 0.10, wz, { yaw });
    }
  }

  drum(x, z, body = 'paintO') {
    this.cyl(body, 0.28, 0.28, 0.85, x, 0.58, z, 10);
    this.cyl('steel', 0.30, 0.30, 0.05, x, 0.28, z, 10);
    this.cyl('steel', 0.30, 0.30, 0.05, x, 0.58, z, 10);
    this.cyl('steel', 0.30, 0.30, 0.05, x, 0.88, z, 10);
    this.box('paintY', 0.22, 0.12, 0.04, x, 0.62, z + 0.28);
    this.box('paintY', 0.34, 0.08, 0.04, x, 0.72, z + 0.28);
    this.box('paintY', 0.08, 0.22, 0.04, x - 0.10, 0.58, z + 0.28);
    this.box('paintY', 0.08, 0.22, 0.04, x + 0.10, 0.58, z + 0.28);
  }

  /**
   * W10-C: a skip bin, 1.8 x 1.2 x 1.3 m, in dark steel (`soil`, the dark-ironwork bucket). It was a 3.2 m yellow
   * hopper with sixty pieces of scrap heaped in it; the owner read the scrap as pastel litter.
   * Sides lean out 10 degrees like a real skip, with a floor, two skids and a little rubble.
   * Local +X is the long axis.
   */
  skip(x, z, yaw = 0, body = 'soil', ground = CORE_HARDSTAND) {
    const s = Math.sin(yaw * DEG);
    const c = Math.cos(yaw * DEG);
    const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const y = ground + 0.68;
    for (const sz of [-1, 1]) {
      const [px, pz] = at(0, sz * 0.54);
      this.boxEx(body, 1.8, 1.12, 0.07, px, y, pz, { pitch: sz * 10, yaw });
    }
    for (const sx of [-1, 1]) {
      const [px, pz] = at(sx * 0.88, 0);
      this.boxEx(body, 0.07, 1.12, 1.16, px, y, pz, { roll: -sx * 10, yaw });
    }
    this.boxEx(body, 1.7, 0.08, 1.1, x, ground + 0.16, z, { yaw });
    for (const sz of [-1, 1]) {
      const [px, pz] = at(0, sz * 0.42);
      this.boxEx('soil', 1.9, 0.10, 0.10, px, ground + 0.06, pz, { yaw });
    }
    for (const [lx, lz, w, h, d, r] of [
      [-0.35, 0.10, 0.62, 0.26, 0.46, 18], [0.30, -0.12, 0.52, 0.30, 0.40, -24], [0.02, 0.18, 0.40, 0.22, 0.34, 8],
    ]) {
      const [px, pz] = at(lx, lz);
      this.boxEx(r > 0 ? 'timber' : 'soil', w, h, d, px, ground + 0.32 + h * 0.5, pz, { yaw: yaw + r });
    }
  }

  /**
   * W10-C: a 1.2 x 1.0 m timber pallet, 0.15 m a layer, stacked at most five high. Three
   * bearers carry one deck. The old pallet sat its bearers ON the deck and left a 40 mm gap
   * between layers. Local +X is the 1.2 m side.
   */
  pallet(x, z, stack = 1, { yaw = 0, ground = CORE_HARDSTAND } = {}) {
    const s = Math.sin(yaw * DEG);
    const c = Math.cos(yaw * DEG);
    const n = Math.max(1, Math.min(5, stack | 0));
    for (let i = 0; i < n; i += 1) {
      const y0 = ground + i * 0.15;
      for (const lz of [-0.40, 0, 0.40]) {
        this.boxEx('timber', 1.2, 0.105, 0.09, x + lz * s, y0 + 0.0525, z + lz * c, { yaw });
      }
      this.boxEx('timber', 1.2, 0.045, 1.0, x, y0 + 0.1275, z, { yaw });
    }
  }

  wallPack(x, y, z, yaw = 0) {
    this.box('steel', 0.28, 0.16, 0.18, x, y, z, yaw);
    this.box('paintY', 0.18, 0.10, 0.08, x, y - 0.02, z, yaw);
  }

  /** Pipe that starts at A and ends at B — both ends get a flange so it is not a floating stick. */
  /**
   * r12 — the same phantom-geometry species r4 found in the board-tile skirt, in the
   * pipework. A `pipe` was a CLOSED 8-segment cylinder (32 triangles) with a flange disc at
   * each end (32 each): 96 a segment, of which the two body caps are inside the flanges and
   * are never visible from any camera. `openEnded` on the body, and `caps` lets a run put
   * flanges only where it actually terminates. 96 -> 48 on an interior segment.
   */
  pipe(ax, ay, az, bx, by, bz, r = 0.16, bucket = 'steel', { caps = 3 } = {}) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz) || 0.01;
    const geometry = new THREE.CylinderGeometry(r, r, len, 8, 1, true);
    geometry.rotateZ(Math.PI / 2);
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(dx, dy, dz).normalize(),
    );
    geometry.applyQuaternion(quat);
    geometry.translate((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5);
    this.push(bucket, geometry);
    if (caps & 1) this.cyl(bucket, r * 1.55, r * 1.55, r * 0.7, ax, ay, az, 8);
    if (caps & 2) this.cyl(bucket, r * 1.55, r * 1.55, r * 0.7, bx, by, bz, 8);
  }

  pipeRun(points, r = 0.16, bucket = 'steel') {
    const last = points.length - 2;
    for (let i = 0; i <= last; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      this.pipe(a[0], a[1], a[2], b[0], b[1], b[2], r, bucket, {
        caps: (i === 0 ? 1 : 0) | (i === last ? 2 : 0),
      });
    }
    // r12: an elbow was an 8x6 sphere, 96 triangles, for a ball a fifth of a metre across.
    // A short 8-segment cylinder is 32 and is what an elbow fitting looks like anyway.
    for (let i = 1; i < points.length - 1; i += 1) {
      const p = points[i];
      this.cyl(bucket, r * 1.30, r * 1.30, r * 2.1, p[0], p[1], p[2], 8);
    }
  }

  pipeShoe(x, y, z, r = 0.16) {
    this.box('concrete', r * 2.4, 0.16, r * 2.4, x, y, z);
    this.box('steel', r * 0.6, 0.22, r * 1.6, x, y + 0.16, z);
  }

  shrub(x, y, z, s = 1, bucket = 'foliage') {
    this.topiary(x, y, z, s);
  }

  sign(x, z, yaw, face = 'paintB', post = 'steel') {
    this.cyl(post, 0.055, 0.055, 1.55, x, 0.9, z, 6);
    this.box(face, 0.72, 0.48, 0.06, x, 1.72, z, yaw);
    this.box('steel', 0.76, 0.05, 0.07, x, 1.98, z, yaw);
  }

  /**
   * r3: the channel body sat at y 0.20 with height 0.08, so its top was 0.24 under a 0.26 m
   * ground — 7.1 m² of steel paid for on both `district-energy` variants and visible from
   * nowhere. The new sunk check in `v370-l5-geometry-probe.mjs` found it; nothing in r1 or
   * r2 could, because the old `below` column only fired at the tile UNDERSIDE. The channel
   * now sits in the ground with its grating proud of it, which is what a drain looks like.
   */
  gratedDrain(x, z, len = 4.2, yaw = 0) {
    this.box('steel', 0.42, 0.10, len, x, CORE_GROUND, z, yaw);
    // r12: bar pitch 0.22 -> 0.36. A 7 m drain was 32 grate bars at 12 triangles each; at
    // board zoom a 0.22 m pitch and a 0.36 m pitch are the same grey line, and the object
    // carrying this one was the worst row against the S3.4 combined cap.
    const n = Math.max(4, Math.round(len / 0.36));
    for (let i = 0; i < n; i += 1) {
      const t = (i + 0.5) / n - 0.5;
      const dx = Math.sin(yaw * DEG) * t * len;
      const dz = Math.cos(yaw * DEG) * t * len;
      this.box('soil', 0.30, 0.045, 0.075, x + dx, CORE_GROUND + 0.045, z + dz, yaw);
    }
  }

  /**
   * An oil stain: a shallow disc bedded INTO the working surface, with a fresher spot on it.
   *
   * V3.71 lane I r2 — THE HELPER TAKES ITS GROUND. r1 gave it `y`, defaulted to
   * `CORE_GROUND` 0.26, on the reading that the discs were buried. They were not: both
   * callers lay `hardstand`, whose surface is 0.180, and the discs sat 0.170–0.200 —
   * bedded 10 mm in, standing 20 mm proud, flush with the joint lines. The default moved
   * them 73 mm into the air on `works-yard` (3 discs) and `laneway-court` (12).
   *
   * `ground` is the top of the surface the stain lies IN, and the bedding is expressed
   * against it rather than as absolute heights, so a caller on a deck, a ramp or a board
   * tile passes its own number and gets the same read. The default is `CORE_HARDSTAND`
   * because that is what both existing callers actually lay — derived from the callers,
   * not from a constant that happened to be in scope.
   *
   * A stain is not an object: it must not have a side wall you can see. −10 / +20 mm is the
   * shallowest bed that still clears z-fighting with the slab it lies on.
   */
  oilSpot(x, z, s = 1, { ground = CORE_HARDSTAND } = {}) {
    // W10-C: the fresher `steel` centre is gone. A bright dot in a dark stain reads as a coin
    // or a bolt from 100 m; a stain is one darker shape, here two overlapping discs.
    const stain = this.yardGround ? 'yardOil' : 'soil';
    this.cyl(stain, 0.55 * s, 0.42 * s, 0.03, x, ground + 0.005, z, 10);
    this.cyl(stain, 0.36 * s, 0.30 * s, 0.03, x + 0.38 * s, ground + 0.008, z - 0.22 * s, 8);
  }

  /**
   * Chunky painted bay car — occupancy, not a decal. Length along local +X.
   *
   * V3.71 lane I r2 — `ground`, AND THE r1 JUSTIFICATION FOR THE OLD DEFAULT WAS FALSE.
   *
   * r1 gave this helper `{ y0 = 0 }` and wrote that the default was 0 "so `laneway-court`'s
   * five cars do not move". `laneway-court` has no cars. Re-derived from the callers rather
   * than from the report: `grep -rn "parkedCar" mvp/src` returns exactly two call sites,
   * both in `types/car-park.js`, and BOTH pass an explicit height. There is no second caller
   * whose behaviour an inert default protects, so the default should be the one that is
   * CORRECT rather than the one that is invisible.
   *
   * Every height here was a V3.33 constant that put the wheel undersides at 0.08 — 0.10 m
   * below a `hardstand` of 0.180, and 0.18 m below a `boardTile` of 0.26. The heights are now
   * expressed against `ground`, which is the surface the WHEELS REST ON, so a car on a deck,
   * a ramp or a board tile is the same call with a different number.
   */
  parkedCar(x, z, yaw = 0, body = 'paintB', { ground = CORE_HARDSTAND } = {}) {
    const fx = Math.cos(yaw * DEG);
    const fz = -Math.sin(yaw * DEG);
    const rx = Math.sin(yaw * DEG);
    const rz = Math.cos(yaw * DEG);
    const g = ground;
    this.box(body, 2.15, 0.46, 1.12, x, g + 0.42, z, yaw);
    this.box(body, 1.22, 0.52, 1.04, x - fx * 0.22, g + 0.84, z - fz * 0.22, yaw);
    this.box('soil', 0.70, 0.30, 0.98, x + fx * 0.62, g + 0.66, z + fz * 0.62, yaw);
    this.box('soil', 0.10, 0.22, 0.96, x - fx * 0.78, g + 0.84, z - fz * 0.78, yaw);
    this.box('paintY', 0.10, 0.10, 0.22, x + fx * 1.08 + rx * 0.32, g + 0.36, z + fz * 1.08 + rz * 0.32, yaw);
    this.box('paintY', 0.10, 0.10, 0.22, x + fx * 1.08 - rx * 0.32, g + 0.36, z + fz * 1.08 - rz * 0.32, yaw);
    for (const [lx, lr] of [[-0.68, -0.50], [-0.68, 0.50], [0.68, -0.50], [0.68, 0.50]]) {
      this.box('soil', 0.32, 0.28, 0.16, x + fx * lx + rx * lr, g + 0.14, z + fz * lx + rz * lr, yaw);
    }
  }

  trolley(x, z, yaw = 0) {
    const fx = Math.cos(yaw * DEG);
    const fz = -Math.sin(yaw * DEG);
    this.box('steel', 0.78, 0.08, 0.52, x, 0.42, z, yaw);
    this.box('steel', 0.06, 0.50, 0.50, x - fx * 0.34, 0.70, z - fz * 0.34, yaw);
    this.box('steel', 0.06, 0.50, 0.50, x + fx * 0.34, 0.70, z + fz * 0.34, yaw);
    this.box('steel', 0.74, 0.48, 0.06, x, 0.70, z, yaw);
    this.box('steel', 0.08, 0.62, 0.08, x - fx * 0.42, 0.95, z - fz * 0.42, yaw);
    this.box('steel', 0.52, 0.06, 0.06, x - fx * 0.62, 1.24, z - fz * 0.62, yaw);
    this.box('soil', 0.18, 0.18, 0.08, x + fx * 0.28, 0.18, z + fz * 0.18, yaw);
    this.box('soil', 0.18, 0.18, 0.08, x - fx * 0.28, 0.18, z - fz * 0.18, yaw);
  }

  /** Record a tap-animated toy. Built later in world space per core. */
  toy(spec) {
    this.toys.push(Object.freeze({ ...spec }));
  }

  toModel() {
    const parts = [];
    for (const [bucket, geos] of this.buckets) {
      if (!geos.length) continue;
      let geometry = null;
      try {
        geometry = geos.length === 1 ? geos[0].clone() : mergeGeometries(geos, false);
      } catch {
        geometry = geos[0].clone();
      }
      if (!geometry) continue;
      MaterialLibrary.ensureUv2(geometry);
      geometry.computeBoundingBox();
      parts.push({ geometry, material: this.palette[bucket] });
    }
    return {
      parts, toys: this.toys, drifts: this.drifts, driftArea: this.driftArea,
    };
  }
}

export function instanceModel(model, placements, { castShadow = true, receiveShadow = true } = {}) {
  const group = new THREE.Group();
  if (!model?.parts?.length || !placements.length) return { group, meshes: [] };
  const matrix = new THREE.Matrix4();
  const meshes = [];
  for (const part of model.parts) {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, placements.length);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    placements.forEach((placement, index) => {
      matrix.compose(placement.position, placement.quaternion, placement.scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    enableStaticInstanceCulling(mesh);
    group.add(mesh);
    meshes.push(mesh);
  }
  return { group, meshes };
}

export function placementAt(x, y, z, yawDeg = 0) {
  return {
    position: new THREE.Vector3(x, y, z),
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawDeg * DEG),
    scale: new THREE.Vector3(1, 1, 1),
  };
}
