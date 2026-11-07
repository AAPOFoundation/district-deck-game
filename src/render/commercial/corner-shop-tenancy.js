// District Deck V3.71 lane H — one corner shop's own choice set, derived deterministically.
//
// Owner instruction: "create procedural versions of the corner shops so they are each a little
// different." The sibling density lane now places corner shops on 14/14 seeds, so two instances
// of one id stand next to each other routinely, and the fault this file exists to remove is the
// one a critic will look for first: **two adjacent instances of the same id reading as the same
// building.**
//
// ── WHAT A "TENANCY" IS, AND WHY THE WORD ──────────────────────────────────────────────────
//
// A tenancy is ONE corner shop's record: the trade behind the glass and the fabric decisions that
// follow from it. It identifies exactly one thing — the choice set for one `(archetypeId,
// districtId, facade)` triple — and nothing else. That precision is deliberate. §5.4.2 records a
// naming hazard this programme has now hit five times (`bed-edge`/`bed-kerb`, `bike-`/`hoop-`,
// `shrub-a` naming six shrubs, two reference packs sharing six filenames): **a name that
// identifies fewer things than the code assumes.** `variant` was already taken in this lane and
// means one of the three PERIODS (`shop-corner-victorian` / `-deco` / `-modern`); if this file
// had reused it, "variant" would have named two different partitions of the same objects, which
// is that hazard exactly. A tenancy sits inside a period, never across one.
//
// The same rule binds every key below: `parapetCrown` names the crown and nothing else,
// `verandahStripes` names the stripes and nothing else. No key is consulted by two axes.
//
// ── §3.3 — THE HASH SOURCE, AND THE PROOF ──────────────────────────────────────────────────
//
// Variation hashes off `archetypeId | districtId | facade` and NOTHING ELSE. No simulation state
// is read, nothing is written, no clock and no `Math.random` is reachable from this file. The two
// hashes below are both pure functions of `ctx.env`, which `index.js` freezes before the builder
// is called:
//
//   `ctx.v`  — `v370|archetypeId|districtId|f{facade}`, built by `assembleCommercial`. Carries
//              the facade, so it is the right seed for the continuous jitters inside a recipe.
//   `districtHash(env)` — `v371h|archetypeId|districtId`, built here. Deliberately does NOT
//              carry the facade, and that omission is the whole design (below).
//
// ── WHY THE RECIPE INDEX IS A PERMUTATION AND NOT A DRAW ───────────────────────────────────
//
// The board batches buildings on `archetypeId : f{facade} : w{bucket}` and derives the facade
// from the parcel id (`board.js` `deterministicFacade`), so **the whole variation space reachable
// from inside a builder is four facades per district.** Two neighbouring parcels are almost
// always in the same district, so the facade is the only axis that separates them.
//
// Drawing a recipe index from a hash would therefore be strictly worse than doing nothing
// clever: four independent draws from four recipes land on four DISTINCT recipes only
// 4!/4^4 = 9.4 % of the time, so most districts would show a repeat among their own four faces.
// Taking the recipe index as `PERM4[h][facade]` instead — one of the 24 permutations of
// [0,1,2,3], chosen by the district hash — guarantees that **within one district the four facades
// are four different tenancies, always**, while different districts pair them differently. The
// worst case is exact, not probabilistic: two adjacent shops of one id repeat only when their
// parcel ids collide modulo 4 in `deterministicFacade`, which is a property of `board.js` and is
// reported rather than worked around (see `r1-builder.md` §"found, not fixed").

import { variation } from '../residential/core.js';

/**
 * Salt block. The lane owns 5000–5999; `corner-shop.js` sits at 5600, the three period builders
 * at 5620 / 5650 / 5680, and their planting salts reach 5740. 5900–5959 is clear, checked by
 * grep across `render/commercial/` rather than assumed.
 */
const S_TEN = 5900;
const S_VIC_TEN = S_TEN;        // 5900–5919
const S_DEC_TEN = S_TEN + 20;   // 5920–5939
const S_MOD_TEN = S_TEN + 40;   // 5940–5959

/** The 24 permutations of [0,1,2,3], generated once rather than typed out and mistyped. */
const PERM4 = Object.freeze((() => {
  const out = [];
  const walk = (rest, acc) => {
    if (!rest.length) { out.push(Object.freeze(acc)); return; }
    for (let i = 0; i < rest.length; i += 1) {
      walk([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, rest[i]]);
    }
  };
  walk([0, 1, 2, 3], []);
  return out;
})());

export { PERM4 };

/**
 * The district-scoped hash: archetype and district, deliberately without the facade.
 *
 * @param {{archetypeId: string, districtId: (string|null)}} env
 */
export function districtHash(env) {
  return variation(`v371h|${env.archetypeId}|${env.districtId ?? ''}`);
}

/**
 * Which recipe this facade draws, guaranteed distinct across the four facades of one district.
 *
 * @param {object} env  the frozen build env
 * @param {number} salt permutation salt, unique per period
 * @param {number} n    how many recipes the period offers (2, 3 or 4)
 */
export function tenancyIndex(env, salt, n = 4) {
  const perm = PERM4[districtHash(env).int(salt, 0, PERM4.length - 1)];
  const facade = Math.max(0, Math.min(3, env.facade | 0));
  return n >= 4 ? perm[facade] : perm[facade] % n;
}

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * THE TRADES
 *
 * Real Australian corner-shop trades, and they do real work rather than decorating a comment:
 * the trade picks the word on the one sign carrier that can hold a word on that subject, and it
 * picks which stock the window is dressed with. §5.4.0's ruling is the reason the list is short
 * and the words are short: a word only reads where its carrier is TALL, and a carrier's height
 * is what binds `fitCap`, so eight glyphs on a 0.5 m frieze is a scatter of dots at every station
 * this game is played at. Words are priced by `mvp/tests/v371-h-signcost.mjs` before they ship,
 * per carrier, at 6.47 px/m along a wall and 4.97 px/m up it.
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

const TRADES = Object.freeze([
  Object.freeze({ key: 'milk-bar', word: 'MILK BAR', stock: 'cartons' }),
  Object.freeze({ key: 'grocer', word: 'GROCER', stock: 'crates' }),
  Object.freeze({ key: 'deli', word: 'DELI', stock: 'tins' }),
  Object.freeze({ key: 'bakery', word: 'BAKERY', stock: 'trays' }),
]);

/** The trade, indexed by the same permutation trick so the four facades carry four trades. */
function tradeFor(env, salt) {
  return TRADES[tenancyIndex(env, salt, TRADES.length)];
}

export { TRADES };

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * 1. VICTORIAN
 *
 * Held constant, because they are the id's identity and §5.3.11 settled them: two storeys with
 * the dwelling above the shop, a 45 degree splay with a tessellated entry lobby, a posted
 * verandah over the footpath, a high rendered parapet with a moulded cornice, and a pediment over
 * the splay. A Victorian corner shop must still read Victorian at board zoom.
 *
 * Varied, and they are the four axes §5.3.11 named for separating this family without spending a
 * triangle on width — parapet profile, verandah structure, opening rhythm, material:
 *
 *   parapetCrown   what stands on the frieze: balusters / a deep name frieze / panelled dies
 *                  between short baluster runs / a blind arcade of piers and segmental heads.
 *                  All four are boom-era Melbourne; none changes the silhouette CLASS, which
 *                  stays "tall rendered parapet, pediment over the splay".
 *   pierCrown      what stands on the pilasters: urns / balls / stepped dies.
 *   verandah*      bullnose or straight skillion, striped or plain, post pitch, lace on one run
 *                  or two.
 *   upperSashes    three or four sashes on the principal frontage.
 *   upperFinish    how the dwelling storey is finished: `render` (ashlar render through, the
 *                  `wall` bucket), `painted` (the darker `wallAlt`, a painted upper over a
 *                  rendered shop) or `banded` (render with a picked-out string course under the
 *                  sills). A bucket swap plus at most one member.
 *
 *                  IT IS THREE STATES AND NOT TWO, AND A PLATE IS WHY. The first version was a
 *                  boolean, and `r1/row--shop-corner-victorian--street.png` (opened, 14:18) shows
 *                  what that cost: in `fitzroy-north` it landed `painted` on positions 2 and 3 of
 *                  the row, and two neighbours sharing the loudest cue read as a matched pair
 *                  even though their parapets, verandahs, rhythms and trades all differ.
 *                  `painted` now appears on exactly one recipe of four. The fix is NOT to
 *                  alternate the state by facade parity, which would have made the row plate look
 *                  right while changing nothing on a board where neighbours draw arbitrary
 *                  facades — that is optimising the instrument, which §5.4 forbids.
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

const VICTORIAN_RECIPES = Object.freeze([
  Object.freeze({
    key: 'balustraded',
    parapetCrown: 'balusters',
    friezeH: 0.55,
    balusterPitch: 0.36,
    pierCrown: 'urn',
    pedimentCrown: 'finial',
    verandahBullnose: true,
    verandahStripes: true,
    verandahPostPitch: 3.4,
    laceSide: true,
    upperSashes: 3,
    upperFinish: 'render',
    signCarrier: null,
  }),
  Object.freeze({
    key: 'name-frieze',
    // The one profile whose frieze is tall enough to carry a word. A boom-era shop that put its
    // name across the parapet did it on a deep solid frieze with the balustrade omitted, which is
    // the same building minus a member rather than a different building.
    parapetCrown: 'name-frieze',
    friezeH: 1.06,
    balusterPitch: 0,
    pierCrown: 'ball',
    pedimentCrown: 'shoulders',
    verandahBullnose: true,
    verandahStripes: false,
    verandahPostPitch: 3.0,
    laceSide: false,
    upperSashes: 4,
    upperFinish: 'banded',
    signCarrier: 'frieze',
  }),
  Object.freeze({
    key: 'panelled-dies',
    parapetCrown: 'panelled-dies',
    friezeH: 0.55,
    balusterPitch: 0.34,
    pierCrown: 'die',
    pedimentCrown: 'finial',
    verandahBullnose: true,
    verandahStripes: true,
    verandahPostPitch: 3.9,
    laceSide: true,
    upperSashes: 3,
    upperFinish: 'painted',
    signCarrier: null,
  }),
  Object.freeze({
    key: 'blind-arcade',
    parapetCrown: 'blind-arcade',
    friezeH: 0.48,
    balusterPitch: 0,
    pierCrown: 'urn',
    pedimentCrown: 'roundel',
    verandahBullnose: false,
    verandahStripes: true,
    verandahPostPitch: 3.2,
    laceSide: true,
    upperSashes: 4,
    upperFinish: 'render',
    signCarrier: null,
  }),
]);

export { VICTORIAN_RECIPES };

/**
 * The Victorian tenancy for this build.
 * @param {object} ctx the builder ctx (`env` and `v` are read; nothing is written)
 */
export function victorianTenancy(ctx) {
  const { env, v } = ctx;
  const recipe = VICTORIAN_RECIPES[tenancyIndex(env, S_VIC_TEN, VICTORIAN_RECIPES.length)];
  return Object.freeze({
    ...recipe,
    trade: tradeFor(env, S_VIC_TEN + 1),
    // Continuous jitters ride `ctx.v`, which already carries the facade, so two districts drawing
    // the same recipe still differ in the small dimensions.
    verandahFall: v.range(S_VIC_TEN + 2, 0.30, 0.40),
    chimneyRise: v.range(S_VIC_TEN + 3, 1.62, 2.18),
    chimneyPots: v.int(S_VIC_TEN + 4, 1, 3),
    shopBayShift: v.range(S_VIC_TEN + 5, -0.16, 0.16),
  });
}

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * 2. ART DECO
 *
 * Held constant: two storeys, the three-facet curved corner, the cantilevered slab over the
 * footpath, the horizontal steel banks, the stepped parapet stepping up over the corner. Varied:
 * how many steps the tower takes and how tall the top one is, how the top block is articulated,
 * whether the awning is stepped and on how many rods, how many spandrel bands run the building,
 * how many lights divide the window banks, and WHICH BUCKET THE BANDS ARE PAINTED FROM.
 *
 * ── THE BAND BUCKET IS THE DECO'S MATERIAL AXIS, AND A PLATE IS WHY IT EXISTS ───────────────
 *
 * [SEEN] `r1b/row--shop-corner-deco--street.png` (opened, 14:45), five copies at facades 0,1,2,3,0
 * in `fitzroy-north`. The towers separate cleanly — four step profiles, four heights, and the
 * fifth correctly matching the first — but **the BODIES under them are near-identical**: one
 * cream render, one window bank, one awning line, five times. Unlike the other three ids this one
 * had no material axis at all, because a 1930s corner shop is rendered to the ground and there is
 * no second wall material to swap.
 *
 * The bands are the answer and they cost nothing. A deco frontage is read on its horizontals, and
 * whether those horizontals are picked out DARK (`wallAlt`, the terrazzo, 52) or PALE (`trim`, the
 * cope and fluting bucket, 140) is the single loudest thing about the elevation — the same
 * building in two paint schemes, both of which are on the street. Two recipes each, so no three
 * of four share it.
 *
 * The tower is the silhouette event of this id and it stays the tallest thing on the lot in all
 * four tenancies — what changes is its PROFILE, which is the axis §5.3.11 named.
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

const DECO_RECIPES = Object.freeze([
  Object.freeze({
    key: 'ziggurat',
    tierPlan: Object.freeze([
      Object.freeze({ dw: 1.35, h: 0.95, dz: 0.02 }),
      Object.freeze({ dw: 0.55, h: 1.75, dz: 0.00 }),
      Object.freeze({ dw: -0.30, h: 3.05, dz: -0.02 }),
    ]),
    finCount: 5,
    finTop: 'cap',
    chevron: true,
    awningTiers: 1,
    awningRodPitch: 3.2,
    bandCount: 2,
    bandBucket: 'wallAlt',
    upperLights: 3,
    pilasterFlutes: 3,
    signCarrier: null,
  }),
  Object.freeze({
    key: 'fin-tower',
    tierPlan: Object.freeze([
      Object.freeze({ dw: 1.10, h: 1.30, dz: 0.02 }),
      Object.freeze({ dw: 0.20, h: 3.55, dz: -0.01 }),
    ]),
    finCount: 3,
    finTop: 'chamfer',
    chevron: false,
    awningTiers: 2,
    awningRodPitch: 2.6,
    bandCount: 3,
    bandBucket: 'trim',
    upperLights: 4,
    pilasterFlutes: 2,
    // MEASURED, NOT ASSUMED, AND THE MEASUREMENT KILLED THE WORD. `v371-h-signcost.mjs` prices
    // the tower panel at a 0.44 m cap — 2.2 px at the 319 m board station and 3.7 px at the
    // SHIPPED 190 m default, `blank-plate` at both, because the panel is 1.96 m wide by 0.52 m
    // tall and on a carrier that shape the HEIGHT binds `fitCap` however short the word is. Two
    // of these four recipes carried `signCarrier: 'tower'` when they were written and the probe
    // refused them, which is the probe doing its job: §5.4.0 licenses real words at the station a
    // player plays at, and a 3.7 px cap there is the scatter of dots it explicitly forbids. The
    // tower keeps its blank moulded panel, which is also what the reference plate carries.
    signCarrier: null,
  }),
  Object.freeze({
    key: 'shouldered',
    tierPlan: Object.freeze([
      Object.freeze({ dw: 1.60, h: 0.80, dz: 0.03 }),
      Object.freeze({ dw: 0.90, h: 1.45, dz: 0.01 }),
      Object.freeze({ dw: 0.20, h: 2.35, dz: 0.00 }),
      Object.freeze({ dw: -0.55, h: 3.35, dz: -0.03 }),
    ]),
    finCount: 7,
    finTop: 'cap',
    chevron: true,
    awningTiers: 0,
    awningRodPitch: 3.8,
    bandCount: 2,
    bandBucket: 'wallAlt',
    upperLights: 3,
    pilasterFlutes: 3,
    signCarrier: null,
  }),
  Object.freeze({
    key: 'stepped-slab',
    tierPlan: Object.freeze([
      Object.freeze({ dw: 1.20, h: 1.05, dz: 0.02 }),
      Object.freeze({ dw: 0.35, h: 2.10, dz: 0.00 }),
      Object.freeze({ dw: -0.10, h: 2.80, dz: -0.02 }),
    ]),
    finCount: 5,
    finTop: 'chamfer',
    chevron: false,
    awningTiers: 2,
    awningRodPitch: 2.9,
    bandCount: 3,
    bandBucket: 'trim',
    upperLights: 4,
    pilasterFlutes: 2,
    // MEASURED, NOT ASSUMED, AND THE MEASUREMENT KILLED THE WORD. `v371-h-signcost.mjs` prices
    // the tower panel at a 0.44 m cap — 2.2 px at the 319 m board station and 3.7 px at the
    // SHIPPED 190 m default, `blank-plate` at both, because the panel is 1.96 m wide by 0.52 m
    // tall and on a carrier that shape the HEIGHT binds `fitCap` however short the word is. Two
    // of these four recipes carried `signCarrier: 'tower'` when they were written and the probe
    // refused them, which is the probe doing its job: §5.4.0 licenses real words at the station a
    // player plays at, and a 3.7 px cap there is the scatter of dots it explicitly forbids. The
    // tower keeps its blank moulded panel, which is also what the reference plate carries.
    signCarrier: null,
  }),
]);

export { DECO_RECIPES };

/** The Art Deco tenancy for this build. */
export function decoTenancy(ctx) {
  const { env, v } = ctx;
  const recipe = DECO_RECIPES[tenancyIndex(env, S_DEC_TEN, DECO_RECIPES.length)];
  return Object.freeze({
    ...recipe,
    trade: tradeFor(env, S_DEC_TEN + 1),
    awningProj: v.range(S_DEC_TEN + 2, 1.80, 2.20),
    bandDepth: v.range(S_DEC_TEN + 3, 0.11, 0.15),
    stallboardBand: v.chance(S_DEC_TEN + 4, 0.5),
  });
}

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * 3. MODERN
 *
 * Held constant: two storeys, the orthogonal notch at the corner, the thin blade over the
 * footpath, the face-brick spandrel under a panelled dwelling storey, the flat parapet. Varied:
 * the parapet's own upstand and coping, what stands on the roof, the blade's reach and fascia,
 * how the ribbon is divided, and how many expressed panel joints run the frontage.
 *
 * This is the one id in the family whose spandrel is tall enough to carry a word at the shipped
 * station (§5.4.0), so its trade word ships on every tenancy and the WORD is one of the four
 * things that separates two neighbours.
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

const MODERN_RECIPES = Object.freeze([
  Object.freeze({
    key: 'flat-coped',
    parapetUpstand: 0.42,
    copingProud: 0.10,
    roofPlant: 'condenser-flue',
    awningProj: 2.05,
    awningFascia: 'thin',
    upperRibbon: 2,
    panelJoints: 4,
    brickBand: 1.20,
    signCarrier: 'spandrel',
  }),
  Object.freeze({
    key: 'blade-fin',
    parapetUpstand: 0.62,
    copingProud: 0.08,
    roofPlant: 'flue-pair',
    awningProj: 1.80,
    awningFascia: 'deep',
    upperRibbon: 3,
    panelJoints: 5,
    brickBand: 1.34,
    signCarrier: 'spandrel',
  }),
  Object.freeze({
    key: 'banded',
    parapetUpstand: 0.30,
    copingProud: 0.14,
    roofPlant: 'condenser-screen',
    awningProj: 2.25,
    awningFascia: 'deep',
    upperRibbon: 2,
    panelJoints: 3,
    brickBand: 1.42,
    signCarrier: 'spandrel',
  }),
  Object.freeze({
    key: 'hooded',
    parapetUpstand: 0.52,
    copingProud: 0.11,
    roofPlant: 'condenser-pair',
    awningProj: 1.95,
    awningFascia: 'thin',
    upperRibbon: 3,
    panelJoints: 4,
    brickBand: 1.26,
    signCarrier: 'spandrel',
  }),
]);

export { MODERN_RECIPES };

/** The modern tenancy for this build. */
export function modernTenancy(ctx) {
  const { env, v } = ctx;
  const recipe = MODERN_RECIPES[tenancyIndex(env, S_MOD_TEN, MODERN_RECIPES.length)];
  return Object.freeze({
    ...recipe,
    trade: tradeFor(env, S_MOD_TEN + 1),
    plantShift: v.range(S_MOD_TEN + 2, -0.55, 0.55),
    jointShift: v.range(S_MOD_TEN + 3, -0.12, 0.12),
    downpipeSide: v.chance(S_MOD_TEN + 4, 0.5) ? -1 : 1,
  });
}

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * 4. THE EDWARDIAN INCUMBENT — `shop-corner`
 *
 * It is a corner shop, it is inside `render/commercial/`, and the live board gives it 15 of 82
 * corner-shop placements over eight seeds across SIX districts — the widest district spread of
 * the four. Leaving it uniform while the three period ids each carry four tenancies would put
 * the one repeated building in the family on the most streets, which is the exact fault this
 * round exists to remove.
 *
 * Held constant, because they are its identity and §5.3.11 settled the storeys: two storeys with
 * the dwelling above the shop, a NARROW 1.70 m splay, posted canvas awnings over both footpaths,
 * a flat roof behind a plain rendered parapet with a raised pediment over the splay, red brick
 * with rendered dressings, and a first floor that is deliberately the SHORTEST of the four so it
 * separates from the Victorian in silhouette.
 *
 * Varied on the same four axes: parapet height and what stands on the pediment, awning reach and
 * whether it is posted, the upper storey's opening rhythm, and how the brick storey is DRESSED.
 *
 * ── AND THE MATERIAL AXIS HERE IS DRESSINGS, NOT A BUCKET SWAP ──────────────────────────────
 *
 * The three period ids can swap their dwelling storey between `wall` and `wallAlt` because both
 * of those are renders. This one's `wallAlt` is **`#415751`, the bottle-green glazed
 * stallboard** — and `corner-shop-variants.js` already records the exact fault of drawing the
 * wrong thing from it: "the bottle-green chimney pots" stood open on this subject for four rounds
 * because a terracotta pot was taken from the stallboard bucket. A whole dwelling storey in
 * bottle green would be that fault at fifty times the area, and no §5.3 floor fixes a hue fault.
 * `trim` is no better — it is the parapet, the cornice and the pediment, so an upper wall drawn
 * from it would leave every moulding on this subject with no value step against its own field,
 * which is the OTHER fault this file has shipped twice.
 *
 * So the Edwardian's material axis is the dressing pattern its own brief names — "red brick with
 * rendered dressings" — run at four densities: plain, a rendered string course, rendered quoins,
 * or both. `trim` on `wall` is a 45-luma step this file has already proved reads at plate zoom.
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

const S_EDW_TEN = S_TEN + 60;   // 5960-5979

const EDWARDIAN_RECIPES = Object.freeze([
  Object.freeze({
    key: 'plain-parapet',
    parapetH: 1.05,
    pediment: 0.78,
    pedimentCrown: 'finial',
    awningPosts: true,
    awningProj: 1.55,
    awningStripes: false,
    upperBays: 2,
    upperDressing: 'plain',
  }),
  Object.freeze({
    key: 'raised-pediment',
    parapetH: 1.22,
    pediment: 1.06,
    pedimentCrown: 'ball',
    awningPosts: true,
    awningProj: 1.75,
    awningStripes: true,
    upperBays: 3,
    upperDressing: 'banded',
  }),
  Object.freeze({
    key: 'suspended-awning',
    parapetH: 0.92,
    pediment: 0.66,
    pedimentCrown: 'die',
    // A suspended awning on rods rather than posts is the other half of the Edwardian street:
    // the posted verandah was being taken off Melbourne shopfronts through the 1920s and both
    // survive side by side. It is the same member set less the posts.
    awningPosts: false,
    awningProj: 1.90,
    awningStripes: true,
    upperBays: 2,
    upperDressing: 'quoined',
  }),
  Object.freeze({
    key: 'stepped-parapet',
    parapetH: 1.34,
    pediment: 0.92,
    pedimentCrown: 'finial',
    awningPosts: false,
    awningProj: 1.45,
    awningStripes: false,
    upperBays: 3,
    upperDressing: 'banded-quoined',
  }),
]);

export { EDWARDIAN_RECIPES };

/** The Edwardian incumbent's tenancy for this build. */
export function edwardianTenancy(ctx) {
  const { env, v } = ctx;
  const recipe = EDWARDIAN_RECIPES[tenancyIndex(env, S_EDW_TEN, EDWARDIAN_RECIPES.length)];
  return Object.freeze({
    ...recipe,
    trade: tradeFor(env, S_EDW_TEN + 1),
    chimneyRise: v.range(S_EDW_TEN + 2, 1.45, 1.95),
    bayShift: v.range(S_EDW_TEN + 3, -0.20, 0.20),
  });
}
