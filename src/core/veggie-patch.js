// District Deck V3.70 L7 — the veggie patch on a `community-garden` block centre.
//
// Pure model. No DOM, no THREE, no clock, no Math.random, no network. Every function
// takes a patch record and returns a NEW patch record; nothing here mutates its input
// and nothing here reads or writes simulation state (V370 spec §3.3). The only thing
// this file wants from the sim is the quarter number, and it takes it as an argument.
//
// The growing cycle is bolted to the game's own clock. A plot does not grow because
// time passed in the browser; it grows because the run advanced a quarter and the
// player had watered it before they left the garden. Skipping five quarters replays five
// quarters, in order, from the same seed — so a patch is a pure function of
// (seed, coreId, the ordered list of visits) and two machines reach the same beds.

import { hash32 } from './rng.js';

export const PATCH_VERSION = 2;

/**
 * Melbourne seasons off the run's own quarter counter.
 *
 * Anchored to `STORYLINE.chapters[].cityMood` in `src/core/storyline.js`, which walks
 * Q1 autumn → Q2 winter → Q3 late winter/early spring → Q4 spring → Q5–Q7 summer →
 * Q8 autumn again ("Autumn again, one year on"). That is an eight-quarter wheel, not a
 * four-quarter one, and it repeats. A plain (q-1)%4 would put Q4 in summer and call the
 * Spring Carnival chapter summer, which is the storyline's word against ours.
 */
export const SEASON_WHEEL = Object.freeze([
  'autumn', 'winter', 'winter', 'spring', 'summer', 'summer', 'summer', 'autumn',
]);

export const SEASONS = Object.freeze(['autumn', 'winter', 'spring', 'summer']);

export const SEASON_LABEL = Object.freeze({
  autumn: 'Autumn',
  winter: 'Winter',
  spring: 'Spring',
  summer: 'Summer',
});

export const SEASON_SHORT = Object.freeze({
  autumn: 'Aut',
  winter: 'Win',
  spring: 'Spr',
  summer: 'Sum',
});

export function seasonForQuarter(quarter) {
  const q = Math.max(1, Math.round(Number(quarter) || 1));
  return SEASON_WHEEL[(q - 1) % SEASON_WHEEL.length];
}

/**
 * The eight-quarter year in order, with the current slot marked. The ribbon uses this
 * so a player can see that summer is three quarters long before they sow a pumpkin.
 */
export function seasonRibbon(quarter) {
  const q = Math.max(1, Math.round(Number(quarter) || 1));
  const index = (q - 1) % SEASON_WHEEL.length;
  const cycleStart = q - index;
  return SEASON_WHEEL.map((id, i) => ({
    id,
    label: SEASON_SHORT[id],
    full: SEASON_LABEL[id],
    current: i === index,
    quarter: cycleStart + i,
  }));
}

/** Tank litres the sky puts in, per quarter, by season. Melbourne, so: never zero. */
export const RAINFALL = Object.freeze({
  autumn: 7, winter: 10, spring: 8, summer: 4,
});

/** Chance in 100 that an unattended plot grows a weed in a quarter. */
export const WEED_CHANCE = Object.freeze({
  autumn: 32, winter: 22, spring: 55, summer: 44,
});

export const PLOTS_PER_BED = 4;
export const BEDS = 4;
export const PLOT_COUNT = BEDS * PLOTS_PER_BED;

export const TANK_CAP = 24;
/** Heap units the crate can hold. The mound on the crate is this many lumps. */
export const COMPOST_CAP = 10;
export const COMPOST_PER_PLOT = 2;
/** Chance in 100 the heap cooks one more barrow on a garden day. Never zero. */
export const COMPOST_DAY_CHANCE = 34;
export const COMPOST_TUMBLER_DAY_CHANCE = 56;
export const WEED_CAP = 2;
/** Kept on the save record. Actions no longer spend hours — they spend tin. */
export const HOURS_PER_VISIT = 0;
/** One garden set. Three visits per city quarter to tend it. */
export const DAYS_PER_SEASON = 30;
export const DAYS_PER_WEEK = 7;
/** One main-game quarter is three weeks of garden time. */
export const DAYS_PER_QUARTER = 21;
export const VISITS_PER_QUARTER = 3;
/** The tin never empties completely — a patch you cannot sow again is a dead screen. */
export const SEED_FLOAT = 400;
/** Stake to start a set. Working capital, not city cash (that waits on the ledger lane). */
export const ENTRY_STAKE = 2_000;
export const OPENING_TIN = ENTRY_STAKE;
/** Chance in 100 that a week rains. Never zero; some weeks are still dry. */
export const RAIN_CHANCE = 72;
/** Labour from the tin, so a visit is as long as the wallet. */
export const ACTION_COST = Object.freeze({
  sow: 10,
  water: 10,
  weed: 10,
  compost: 10,
  harvest: 10,
});
/** One can from the tap when the tank is dry. Rain is cheaper; death is not. */
export const WATER_CAN_COST = 80;
/** Bought litres, and the price of a full load. */
export const WATER_LOAD = 8;
export const WATER_LOAD_COST = 480;
/** Two dry quarters running and the crop is gone. One is survivable. */
export const THIRST_DEATH = 2;

/**
 * Eight crops that actually go in an inner-Melbourne bed, with the sowing windows a
 * gardener would recognise. `season` is where the crop puts on growth: a quarter spent
 * outside it is a quarter the plant sulks and does nothing. Nothing is forbidden —
 * you may sow tomatoes in June and watch them sit there until November.
 */
export const CROPS = Object.freeze({
  radish: {
    id: 'radish',
    label: 'Radish',
    quarters: 1,
    days: 21,
    season: ['autumn', 'spring'],
    water: 1,
    seed: 140,
    value: 900,
    note: 'In and out in a quarter. The impatient gardener\'s crop.',
  },
  silverbeet: {
    id: 'silverbeet',
    label: 'Silverbeet',
    quarters: 2,
    days: 35,
    season: ['autumn', 'winter', 'spring'],
    water: 1,
    seed: 180,
    value: 1_800,
    note: 'Grows through the cold and resents being thanked for it.',
  },
  'broad-bean': {
    id: 'broad-bean',
    label: 'Broad bean',
    quarters: 2,
    days: 35,
    season: ['autumn', 'winter'],
    water: 1,
    seed: 160,
    value: 1_600,
    fixesNitrogen: true,
    note: 'Leaves the bed richer than it found it. The next crop notices.',
  },
  potato: {
    id: 'potato',
    label: 'Potato',
    quarters: 3,
    days: 56,
    season: ['winter', 'spring'],
    water: 2,
    seed: 220,
    value: 3_200,
    note: 'Buried, forgotten, then suddenly a great deal of dinner.',
  },
  garlic: {
    id: 'garlic',
    label: 'Garlic',
    quarters: 4,
    days: 84,
    season: ['autumn', 'winter'],
    water: 1,
    seed: 240,
    value: 4_600,
    note: 'Sown in autumn, pulled the following summer. Long money.',
  },
  zucchini: {
    id: 'zucchini',
    label: 'Zucchini',
    quarters: 2,
    days: 35,
    season: ['spring', 'summer'],
    water: 2,
    seed: 190,
    value: 2_600,
    note: 'Two plants feed a street. Four plants start a feud.',
  },
  tomato: {
    id: 'tomato',
    label: 'Tomato',
    quarters: 3,
    days: 63,
    season: ['spring', 'summer'],
    water: 3,
    seed: 260,
    value: 5_200,
    note: 'Thirsty, sun-hungry, and the only reason anyone bothers.',
  },
  pumpkin: {
    id: 'pumpkin',
    label: 'Pumpkin',
    quarters: 4,
    days: 84,
    season: ['summer', 'autumn'],
    water: 3,
    seed: 280,
    value: 6_400,
    note: 'Occupies the bed all summer and then pays for the summer.',
  },
});

export const CROP_IDS = Object.freeze(Object.keys(CROPS));

export const EQUIPMENT = Object.freeze({
  tray: Object.freeze({
    id: 'tray',
    tool: 'sow',
    label: 'Seed tray',
    cost: 1_100,
    note: 'For Sow. Seedlings start in the tray — seed costs a quarter less, and each sowing is already a week ahead.',
  }),
  sprinkler: Object.freeze({
    id: 'sprinkler',
    tool: 'water',
    label: 'Sprinkler',
    cost: 1_800,
    note: 'For Water. Drinks from the tank at the end of each week and waters every thirsty bed.',
  }),
  hoe: Object.freeze({
    id: 'hoe',
    tool: 'weed',
    label: 'Wheel hoe',
    cost: 900,
    note: 'For Weed. Halves the chance a weed takes hold while you are away.',
  }),
  tumbler: Object.freeze({
    id: 'tumbler',
    tool: 'compost',
    label: 'Compost tumbler',
    cost: 1_400,
    note: 'For Compost. A bigger heap, and it cooks another barrow every week.',
  }),
  crate: Object.freeze({
    id: 'crate',
    tool: 'harvest',
    label: 'Harvest crate',
    cost: 1_600,
    note: 'For Harvest. A sturdier haul to the stall — ripe beds pay 15% more.',
  }),
});

export const EQUIPMENT_IDS = Object.freeze(Object.keys(EQUIPMENT));

/** Older patches stored a cold frame and an extra tank. Those become tray and crate. */
const LEGACY_KIT = Object.freeze({ greenhouse: 'tray', cistern: 'crate' });

export function emptyKit() {
  return { tray: false, sprinkler: false, hoe: false, tumbler: false, crate: false };
}

export function tankCap(_patch) {
  return TANK_CAP;
}

export function compostCap(_patch) {
  return COMPOST_CAP;
}

export function seedCost(patch, crop) {
  const base = crop?.seed ?? 0;
  return patch?.kit?.tray ? Math.round(base * 0.75) : base;
}

export function harvestTake(patch, plot) {
  const paid = plotValue(plot);
  return patch?.kit?.crate ? Math.round(paid * 1.15) : paid;
}

export function daysNeeded(crop) {
  if (!crop) return 0;
  return crop.days ?? crop.quarters * DAYS_PER_QUARTER;
}

export function cropOf(cropId) {
  return CROPS[cropId] ?? null;
}

export function emptyPlot() {
  return {
    crop: null,
    sownQuarter: 0,
    ticks: 0,
    daysGrown: 0,
    watered: 0,
    thirst: 0,
    weeds: 0,
    compost: 0,
    /** Set when a legume is pulled — the next crop in this plot reads it. */
    enriched: false,
  };
}

/**
 * A fresh patch. `coreId` is the block-core id (`core-2-1`) so two gardens on one board
 * roll different weeds; `seed` is the run seed so a replay of the run replays the patch.
 */
export function createPatch({ seed = 0, coreId = 'core', quarter = 1 } = {}) {
  return {
    version: PATCH_VERSION,
    seed: String(seed),
    coreId: String(coreId),
    quarter: Math.max(1, Math.round(Number(quarter) || 1)),
    day: 1,
    kit: emptyKit(),
    plots: Array.from({ length: PLOT_COUNT }, () => emptyPlot()),
    tank: 12,
    compost: 2,
    hours: 0,
    tin: OPENING_TIN,
    visits: 0,
    visitQuarter: 0,
    rained: false,
    lifetimeSold: 0,
    lifetimeHarvest: 0,
    log: [],
  };
}

function clonePatch(patch) {
  return {
    ...patch,
    kit: { ...emptyKit(), ...(patch.kit ?? {}) },
    plots: patch.plots.map((plot) => ({ ...plot })),
    log: patch.log.slice(-12),
  };
}

function seedKey(patch) {
  return `veggie:${patch.seed}:${patch.coreId}`;
}

function note(patch, text) {
  patch.log = [...patch.log.slice(-11), text];
  return patch;
}

function reject(patch, reason) {
  return { patch, ok: false, reason };
}

function accept(patch, reason = '') {
  return { patch, ok: true, reason };
}

export function inSeason(cropId, season) {
  const crop = cropOf(cropId);
  if (!crop) return false;
  return crop.season.includes(season);
}

export function plotIsRipe(plot) {
  const crop = cropOf(plot?.crop);
  if (!crop) return false;
  if ((plot.daysGrown ?? 0) >= daysNeeded(crop)) return true;
  return plot.ticks >= crop.quarters;
}

export function quartersLeft(plot) {
  const crop = cropOf(plot?.crop);
  if (!crop) return 0;
  return Math.max(0, crop.quarters - plot.ticks);
}

export function daysLeft(plot) {
  const crop = cropOf(plot?.crop);
  if (!crop) return 0;
  return Math.max(0, daysNeeded(crop) - (plot.daysGrown ?? plot.ticks * DAYS_PER_QUARTER));
}

/**
 * What a plot pays if pulled now. Weeds take a third each, compost adds a quarter each,
 * and a bed a legume left behind pays a fifteenth more. Unripe pays nothing — pulling a
 * green tomato is a decision, not a harvest.
 */
export function plotValue(plot) {
  const crop = cropOf(plot?.crop);
  if (!crop || !plotIsRipe(plot)) return 0;
  const compost = 1 + 0.25 * Math.min(COMPOST_PER_PLOT, plot.compost ?? 0);
  const weeds = Math.max(0.4, 1 - 0.3 * Math.min(WEED_CAP, plot.weeds ?? 0));
  const enriched = plot.enriched ? 1.15 : 1;
  return Math.round(crop.value * compost * weeds * enriched);
}

/** Everything ripe in the beds, in dollars. The number on the "sell" button. */
export function standingValue(patch) {
  return patch.plots.reduce((sum, plot) => sum + plotValue(plot), 0);
}

export function bedReport(patch) {
  const season = seasonForQuarter(patch.quarter);
  let planted = 0;
  let ripe = 0;
  let thirsty = 0;
  let weedy = 0;
  let sulking = 0;
  for (const plot of patch.plots) {
    if (!plot.crop) continue;
    planted += 1;
    if (plotIsRipe(plot)) ripe += 1;
    if (plot.watered < (cropOf(plot.crop)?.water ?? 1)) thirsty += 1;
    if (plot.weeds > 0) weedy += 1;
    if (!inSeason(plot.crop, season)) sulking += 1;
  }
  return {
    season,
    planted,
    ripe,
    thirsty,
    weedy,
    sulking,
    empty: PLOT_COUNT - planted,
    standing: standingValue(patch),
  };
}

// --- Visit actions -----------------------------------------------------------
// Labour is tin, not hours. A visit lasts as long as the wallet.

export function sow(patch, index, cropId) {
  const crop = cropOf(cropId);
  if (!crop) return reject(patch, 'No such seed in the tin.');
  const plot = patch.plots[index];
  if (!plot) return reject(patch, 'No such plot.');
  if (plot.crop) return reject(patch, 'Something is already growing there.');
  const cost = seedCost(patch, crop) + actionPrice('sow');
  const pay = payOrReject(patch, cost, `Seed is $${cost}. Keep $${SEED_FLOAT} in the tin.`);
  if (!pay.ok) return reject(patch, pay.reason);
  const next = clonePatch(patch);
  next.tin -= cost;
  next.plots[index] = {
    ...emptyPlot(),
    crop: crop.id,
    sownQuarter: patch.quarter,
    daysGrown: patch.kit?.tray ? DAYS_PER_WEEK : 0,
    enriched: Boolean(plot.enriched),
  };
  const season = seasonForQuarter(patch.quarter);
  const fit = crop.season.includes(season);
  note(next, fit
    ? `${crop.label} sown. Right season for it.`
    : `${crop.label} sown out of season — it will sit there until ${crop.season.map((s) => SEASON_LABEL[s]).join(' or ')}.`);
  return accept(next, fit ? '' : 'out-of-season');
}

export function canPayFromTin(patch, cost) {
  return patch.tin - cost >= SEED_FLOAT;
}

/** Old local saves kept a spent tin. A new set that never harvested opens at the stake. */
export function ensureStake(patch) {
  if ((patch.lifetimeHarvest ?? 0) === 0 && patch.tin < OPENING_TIN) {
    return { ...clonePatch(patch), tin: OPENING_TIN };
  }
  if (patch.tin < SEED_FLOAT) {
    return { ...clonePatch(patch), tin: SEED_FLOAT };
  }
  return patch;
}

export function actionPrice(verb, extra = 0) {
  return (ACTION_COST[verb] ?? 0) + extra;
}

function payOrReject(patch, cost, reason) {
  if (cost < 1) return { ok: true };
  if (!canPayFromTin(patch, cost)) return { ok: false, reason };
  return { ok: true };
}

/**
 * Three visits per city quarter. Re-opening the gate spends a visit.
 * A new quarter resets the count.
 */
export function beginVisit(patch, quarter) {
  const q = Math.max(1, Math.round(Number(quarter) || 1));
  const same = (patch.visitQuarter ?? 0) === q;
  const used = same ? (patch.visits ?? 0) : 0;
  if (used >= VISITS_PER_QUARTER) {
    return reject(patch, 'Three visits this quarter. Come back after settle.');
  }
  const next = clonePatch(patch);
  next.visitQuarter = q;
  next.visits = used + 1;
  return accept(next);
}

/** Price of one watering can. Tank water is free; the tap is not. */
export function waterCanCost(patch) {
  return patch.tank < 1 ? WATER_CAN_COST : 0;
}

export function water(patch, index) {
  const plot = patch.plots[index];
  if (!plot) return reject(patch, 'No such plot.');
  if (!plot.crop) return reject(patch, 'Nothing to water.');
  const crop = cropOf(plot.crop);
  if (plot.watered >= crop.water) return reject(patch, `${crop.label} has had enough.`);
  const tap = waterCanCost(patch);
  const cost = actionPrice('water', tap);
  const pay = payOrReject(patch, cost, tap
    ? `Tank empty. A can is $${cost}.`
    : `Water is $${cost}.`);
  if (!pay.ok) return reject(patch, pay.reason);
  const next = clonePatch(patch);
  next.tin -= cost;
  if (tap < 1) next.tank -= 1;
  next.plots[index] = { ...plot, watered: plot.watered + 1 };
  return accept(next);
}

/** Buy tank water from the tap. Fills up to WATER_LOAD litres. */
export function buyWater(patch) {
  const room = tankCap(patch) - patch.tank;
  if (room < 1) return reject(patch, 'The tank is full.');
  const litres = Math.min(WATER_LOAD, room);
  const cost = Math.round(WATER_LOAD_COST * (litres / WATER_LOAD));
  if (!canPayFromTin(patch, cost)) {
    return reject(patch, `Water is $${cost}. Keep $${SEED_FLOAT} for seed.`);
  }
  const next = clonePatch(patch);
  next.tin -= cost;
  next.tank += litres;
  return accept(next);
}

export function weed(patch, index) {
  const plot = patch.plots[index];
  if (!plot) return reject(patch, 'No such plot.');
  if (!plot.weeds) return reject(patch, 'Nothing to pull.');
  const cost = actionPrice('weed');
  const pay = payOrReject(patch, cost, `Weeding is $${cost}.`);
  if (!pay.ok) return reject(patch, pay.reason);
  const next = clonePatch(patch);
  next.tin -= cost;
  next.plots[index] = { ...plot, weeds: 0 };
  next.compost = Math.min(compostCap(next), next.compost + 1);
  note(next, 'Weeds pulled and thrown on the heap.');
  return accept(next);
}

export function compost(patch, index) {
  const plot = patch.plots[index];
  if (!plot) return reject(patch, 'No such plot.');
  if (patch.compost < 1) return reject(patch, 'The heap is bare.');
  if ((plot.compost ?? 0) >= COMPOST_PER_PLOT) return reject(patch, 'That bed is already rich.');
  const cost = actionPrice('compost');
  const pay = payOrReject(patch, cost, `Compost is $${cost}.`);
  if (!pay.ok) return reject(patch, pay.reason);
  const next = clonePatch(patch);
  next.tin -= cost;
  next.compost -= 1;
  next.plots[index] = { ...plot, compost: (plot.compost ?? 0) + 1 };
  return accept(next);
}

export function harvest(patch, index) {
  const plot = patch.plots[index];
  if (!plot) return reject(patch, 'No such plot.');
  const crop = cropOf(plot.crop);
  if (!crop) return reject(patch, 'Nothing in that bed.');
  if (!plotIsRipe(plot)) {
    const left = daysLeft(plot);
    return reject(patch, `${crop.label} wants ${left} more day${left === 1 ? '' : 's'}.`);
  }
  const labour = actionPrice('harvest');
  const pay = payOrReject(patch, labour, `Harvest is $${labour}.`);
  if (!pay.ok) return reject(patch, pay.reason);
  const paid = harvestTake(patch, plot);
  const next = clonePatch(patch);
  next.tin += paid - labour;
  next.lifetimeHarvest += paid;
  next.compost = Math.min(compostCap(next), next.compost + 1);
  next.plots[index] = { ...emptyPlot(), enriched: Boolean(crop.fixesNitrogen) };
  note(next, `${crop.label} pulled — $${paid.toLocaleString('en-AU')} in the tin.`);
  return accept(next);
}

/**
 * What the sell button hands the sim.
 *
 * Two ceilings, and the second one matters. The tin keeps a seed float, because a patch
 * you cannot sow next quarter is a screen with a button that does nothing. And you can
 * only ever bank what the garden actually GREW — without that clause the opening tin is
 * free money on every community garden on the board, banked in one click before a seed
 * goes in the ground. Found by looking at the lab on boot: "Sell at the gate · $1,800"
 * on an empty patch.
 */
export function sellable(patch) {
  const aboveFloat = Math.max(0, patch.tin - SEED_FLOAT);
  const grown = Math.max(0, (patch.lifetimeHarvest ?? 0) - (patch.lifetimeSold ?? 0));
  return Math.min(aboveFloat, grown);
}

export function sell(patch) {
  const amount = sellable(patch);
  if (amount <= 0) return { ...reject(patch, 'Nothing worth carting to the gate.'), amount: 0 };
  const next = clonePatch(patch);
  next.tin -= amount;
  next.lifetimeSold += amount;
  // Report what is actually left, not the floor. The floor is a minimum, not the answer.
  note(next, `Sold at the gate — $${amount.toLocaleString('en-AU')}. $${next.tin.toLocaleString('en-AU')} left in the tin for seed.`);
  return { ...accept(next), amount };
}

/**
 * The action the sim reducer sees. Same shape as `ice-cream-rush-shift` and
 * `script-lord-shift`, which is deliberate: one payout verb, no new mechanics in the
 * ledger, and the render layer still never writes state itself.
 */
export const PAYOUT_TYPE = 'veggie-patch-shift';

export function payoutAction(amount, coreId) {
  return {
    type: PAYOUT_TYPE,
    op: 'payout',
    amount: Math.max(0, Math.round(Number(amount) || 0)),
    coreId: String(coreId ?? ''),
  };
}

// --- The clock ---------------------------------------------------------------

function weedRoll(key, quarter, index) {
  return hash32(`${key}:weed:${quarter}:${index}`) % 100;
}

/**
 * Advance exactly one quarter. Pure, and the only place growth happens.
 *
 * The season used is the season of the quarter that is ENDING, not the one being
 * entered. The player sowed in autumn, watered in autumn, and autumn is what passed;
 * resolving that quarter against winter would tell a gardener their autumn planting
 * failed for a reason that had not happened yet.
 *
 * Order matters and is fixed: rain first (so a tank that filled this quarter is
 * available next visit), then each plot resolves its own watering, then weeds seed.
 */
export function advanceQuarter(patch, toQuarter) {
  const next = clonePatch(patch);
  const season = seasonForQuarter(patch.quarter);
  const key = seedKey(patch);
  applySprinkler(next);
  applyRain(next, next.quarter);
  cookCompost(next, DAYS_PER_QUARTER, next.quarter);

  next.plots = next.plots.map((plot, index) => resolvePlotGrowth(
    plot, index, {
      key,
      season,
      hoe: Boolean(next.kit?.hoe),
      greenhouse: Boolean(next.kit?.greenhouse),
      days: DAYS_PER_QUARTER,
      tick: 1,
      stamp: toQuarter,
    },
  ));

  next.quarter = toQuarter;
  next.day = 1;
  next.hours = 0;
  next.visits = 0;
  next.visitQuarter = 0;
  const died = next.plots.filter((p, i) => !p.crop && patch.plots[i].crop).length;
  if (died) note(next, `${died} bed${died === 1 ? '' : 's'} lost to thirst. Two dry quarters does it.`);
  return next;
}

function cookCompost(patch, days, stamp) {
  const chance = patch.kit?.tumbler ? COMPOST_TUMBLER_DAY_CHANCE : COMPOST_DAY_CHANCE;
  const cap = compostCap(patch);
  for (let day = 0; day < days; day += 1) {
    if (hash32(`${seedKey(patch)}:cook:${stamp}:${day}`) % 100 < chance) {
      patch.compost = Math.min(cap, patch.compost + 1);
    }
  }
}

function applyRain(patch, stamp) {
  const roll = hash32(`${seedKey(patch)}:rain:${stamp}`) % 100;
  if (roll >= RAIN_CHANCE) {
    patch.rained = false;
    return;
  }
  patch.rained = true;
  patch.tank = tankCap(patch);
}

function applySprinkler(patch) {
  if (!patch.kit?.sprinkler) return;
  for (const plot of patch.plots) {
    if (!plot.crop) continue;
    const crop = cropOf(plot.crop);
    const need = Math.max(0, (crop?.water ?? 1) - (plot.watered ?? 0));
    const give = Math.min(need, patch.tank);
    if (give < 1) continue;
    plot.watered += give;
    patch.tank -= give;
  }
}

function resolvePlotGrowth(plot, index, {
  key, season, hoe, greenhouse, days, tick, stamp,
}) {
  const weedChance = Math.round((WEED_CHANCE[season] ?? 30) * (hoe ? 0.5 : 1));
  if (!plot.crop) {
    const rolled = weedRoll(key, stamp, index) < weedChance;
    return { ...plot, weeds: rolled ? Math.min(WEED_CAP, plot.weeds + 1) : plot.weeds };
  }
  const crop = cropOf(plot.crop);
  const quenched = plot.watered >= crop.water;
  const inFit = crop.season.includes(season);
  const growing = quenched && (inFit || greenhouse);
  const growthDays = growing ? (inFit ? days : Math.round(days / 2)) : 0;
  const thirst = quenched ? 0 : plot.thirst + (tick || 1);
  if (thirst >= THIRST_DEATH) {
    return { ...emptyPlot(), weeds: Math.min(WEED_CAP, plot.weeds + 1) };
  }
  const rolled = weedRoll(key, stamp, index) < weedChance;
  const daysGrown = (plot.daysGrown ?? plot.ticks * DAYS_PER_QUARTER) + growthDays;
  const ticks = plot.ticks + (growing && inFit ? (tick || 0) : 0);
  return {
    ...plot,
    ticks,
    daysGrown,
    watered: 0,
    thirst,
    weeds: rolled ? Math.min(WEED_CAP, plot.weeds + 1) : plot.weeds,
  };
}

/**
 * Seven garden days. Watering this visit counts for the week. Used so a 90-day
 * season can finish inside the overlay without waiting on city settle.
 */
export function advanceWeek(patch) {
  if ((patch.day ?? 1) >= DAYS_PER_SEASON) {
    return reject(patch, 'Day 30. Leave the garden and settle the city quarter to open the next set.');
  }
  const next = clonePatch(patch);
  const season = seasonForQuarter(next.quarter);
  const key = seedKey(next);
  const stamp = next.quarter * 100 + Math.ceil((next.day ?? 1) / DAYS_PER_WEEK);
  applySprinkler(next);
  applyRain(next, stamp);
  cookCompost(next, DAYS_PER_WEEK, stamp);
  next.plots = next.plots.map((plot, index) => resolvePlotGrowth(
    plot, index, {
      key,
      season,
      hoe: Boolean(next.kit?.hoe),
      greenhouse: Boolean(next.kit?.greenhouse),
      days: DAYS_PER_WEEK,
      tick: 0,
      stamp,
    },
  ));
  next.day = Math.min(DAYS_PER_SEASON, (next.day ?? 1) + DAYS_PER_WEEK);
  next.hours = 0;
  const died = next.plots.filter((p, i) => !p.crop && patch.plots[i].crop).length;
  if (died) note(next, `${died} bed${died === 1 ? '' : 's'} lost to thirst.`);
  else note(next, `Week gone. Day ${next.day} of ${DAYS_PER_SEASON}.`);
  return accept(next);
}

export function buyEquipment(patch, kitId) {
  const item = EQUIPMENT[kitId];
  if (!item) return reject(patch, 'No such kit at the shed.');
  if (patch.kit?.[kitId]) return reject(patch, `${item.label} is already on the farm.`);
  if (patch.tin - item.cost < SEED_FLOAT) {
    return reject(patch, `${item.label} is $${item.cost}. Keep $${SEED_FLOAT} in the tin for seed.`);
  }
  const next = clonePatch(patch);
  next.tin -= item.cost;
  next.kit = { ...emptyKit(), ...next.kit, [kitId]: true };
  note(next, `${item.label} is on the farm.`);
  return accept(next);
}

export function farmerAdvice(patch) {
  const report = bedReport(patch);
  const season = SEASON_LABEL[report.season] ?? 'this season';
  if ((patch.day ?? 1) >= DAYS_PER_SEASON) {
    return {
      title: 'Day 90',
      body: 'This season is spent. Leave the garden and settle the city quarter to open the next 90 days.',
    };
  }
  if (report.planted === 0) {
    return {
      title: 'Sow first',
      body: `Empty beds grow weeds, not dinner. Pick Sow, choose a seed that likes ${season}, then click a bare plot. Water after the seed is in — a can on dirt does nothing.`,
    };
  }
  if (report.thirsty > 0) {
    return {
      title: 'Water next',
      body: `${report.thirsty} bed${report.thirsty === 1 ? '' : 's'} will sulk if you leave them dry. One can per need. Then you can weed or walk away.`,
    };
  }
  if (report.weedy > 0) {
    return {
      title: 'Pull the weeds',
      body: 'They steal a third of the harvest each. Weeding also feeds the compost heap.',
    };
  }
  if (report.ripe > 0) {
    return {
      title: 'Harvest',
      body: `${report.ripe} bed${report.ripe === 1 ? ' is' : 's are'} ripe. Pull them, then sell at the gate so the tin reaches the city ledger.`,
    };
  }
  if (sellable(patch) > 0) {
    return {
      title: 'Sell at the gate',
      body: 'The tin is only city cash when you sell. Keep a little back for next week\'s seed.',
    };
  }
  return {
    title: 'Keep them fed',
    body: `Day ${patch.day ?? 1} of ${DAYS_PER_SEASON}. Grab a tool from the table. The shed sells kit. Rain sometimes fills the tank.`,
  };
}

/**
 * Bring a stored patch up to the run's current quarter, replaying every quarter in
 * between. Called once when the gate opens. Replaying forty quarters costs nothing and
 * guarantees a patch reopened after a long absence looks the same on every machine.
 */
export function catchUp(patch, quarter) {
  const target = Math.max(1, Math.round(Number(quarter) || 1));
  let next = patch;
  let guard = 0;
  while (next.quarter < target && guard < 512) {
    next = advanceQuarter(next, next.quarter + 1);
    guard += 1;
  }
  if (next === patch && next.quarter !== target) return { ...clonePatch(patch), quarter: target };
  return next;
}

// --- Persistence -------------------------------------------------------------
// The patch is render-layer-local by design: it is a player-expression layer that
// READS the sim clock and pays INTO the sim through the payout verb. It never lives in
// `state.js`, so nothing here can drift a run's replay.

export function patchKey(seed, coreId) {
  return `dd:veggie:${seed}:${coreId}`;
}

export function serialisePatch(patch) {
  return JSON.stringify({ ...patch, log: patch.log.slice(-6) });
}

/**
 * The bound on a stored quarter when the caller supplied no authority to check it against.
 * Structural only — it stops an absurd integer reaching `harvestCeiling`; it is NOT the value
 * bound. The value bound is the caller's run quarter. See `parsePatch`.
 */
const QUARTER_STRUCTURAL_CAP = 4096;

function clampInt(value, low, high, fallbackValue = low) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallbackValue;
  return Math.max(low, Math.min(high, n));
}

/**
 * The most a garden could possibly have grown by a given quarter.
 *
 * Sixteen plots, each turned over as many times as the quarters allow — `floor(q / quarters)`
 * harvests, not `q / quarters`, because half a pumpkin is not a harvest — at the best crop
 * available, every one of them double-composted and following a legume. That is a true upper
 * bound and it is well above anything a player reaches, which is the point: this is a bound
 * on the absurd, not a balance rule.
 */
function harvestCeiling(quarter) {
  const q = Math.max(1, quarter);
  const best = Math.max(...CROP_IDS.map((id) => Math.floor(q / CROPS[id].quarters) * CROPS[id].value));
  const compostAndBeans = 1.25 * 1.25 * 1.15;
  return Math.ceil(Math.max(best, CROPS.radish.value) * compostAndBeans * PLOT_COUNT);
}

/**
 * Read a stored patch, CLAMPING every field on the way in.
 *
 * This is the trust boundary, and r1 left it open. `sellable()` is derived from
 * `lifetimeHarvest`, `lifetimeSold` and `tin`, all three of which arrived verbatim from
 * `localStorage`; the payout action is built from `sellable()`; and the reducer takes
 * `action.amount` at face value. A hand-edited storage key was therefore a mint. Two things
 * close it and both should exist: the reducer clamping what it accepts (orchestrator, and
 * the shape is shared with `ice-cream-rush-shift` and `supermarket-shift`), and this — the
 * garden refusing to load a state it could not have reached by playing.
 *
 * The ceiling is generous on purpose. It is not a balance rule; it is a bound that says a
 * patch cannot have grown more than sixteen plots of the best crop, fully composted, in the
 * quarters that have actually passed.
 *
 * `options.quarter` is the run's own quarter and is the ONLY authority for how many quarters
 * have actually passed — see the note at the clamp. Callers that have it should pass it.
 */
export function parsePatch(text, fallback, { quarter: trusted = null } = {}) {
  try {
    const raw = JSON.parse(String(text));
    if (!raw || raw.version !== PATCH_VERSION) return fallback;
    if (!Array.isArray(raw.plots) || raw.plots.length !== PLOT_COUNT) return fallback;
    // THE CLAIMED QUARTER IS NOT EVIDENCE, and r2 let it act as evidence.
    //
    // `harvestCeiling` scales with the quarter, and r2 clamped the quarter to 4096 rather
    // than to the run — so a record claiming `quarter: 9999` bought itself a ceiling of
    // $50 M and every clamp below became a no-op. The r2 report quoted a 1,933x reduction
    // that holds at quarter 1 and only at quarter 1: the same hand-edit that sets `tin`
    // sets `quarter`, so the bound cost the attacker one extra field.
    //
    // No cash was ever minted by this — `state.js` rejects the payout outright, with a live
    // positive control, and that reducer guard is the authoritative fix. This is defence in
    // depth behind a guard that already holds, and it is fixed here so the two layers agree.
    //
    // The authority is the RUN's quarter, which the caller knows: either passed explicitly
    // as `options.quarter` or carried by the fallback patch the caller built from it. Both
    // in-repo callers now supply one.
    //
    // With NEITHER there is no authority to check against, and this function will not invent
    // one — it falls back to the structural cap, which is r2's behaviour, and a caller in that
    // position gets record fidelity and no value bound. That is stated rather than hidden
    // because it is the shape of the remaining exposure: a future caller that omits both
    // arguments re-opens exactly this hole.
    const authority = Number.isFinite(trusted)
      ? Math.max(1, Math.trunc(trusted))
      : (Number.isFinite(fallback?.quarter) ? Math.max(1, Math.trunc(fallback.quarter)) : null);
    const quarter = clampInt(raw.quarter, 1, authority ?? QUARTER_STRUCTURAL_CAP, 1);
    const ceiling = harvestCeiling(quarter);
    const lifetimeHarvest = clampInt(raw.lifetimeHarvest, 0, ceiling, 0);
    const lifetimeSold = clampInt(raw.lifetimeSold, 0, lifetimeHarvest, 0);
    const base = createPatch({ seed: raw.seed, coreId: raw.coreId, quarter });
    const kit = emptyKit();
    for (const id of EQUIPMENT_IDS) kit[id] = raw.kit?.[id] === true;
    for (const [legacy, nextId] of Object.entries(LEGACY_KIT)) {
      if (raw.kit?.[legacy] === true) kit[nextId] = true;
    }
    const cap = tankCap({ kit });
    return {
      ...base,
      quarter,
      day: clampInt(raw.day, 1, DAYS_PER_SEASON, 1),
      kit,
      tank: clampInt(raw.tank, 0, cap, base.tank),
      compost: clampInt(raw.compost, 0, COMPOST_CAP, base.compost),
      hours: 0,
      visits: clampInt(raw.visits, 0, VISITS_PER_QUARTER, 0),
      visitQuarter: clampInt(raw.visitQuarter, 0, quarter, 0),
      rained: raw.rained === true,
      // The tin can hold the float plus whatever the garden actually grew and has not sold.
      // A never-harvested save below the stake is an old record — open at $2,000.
      tin: (() => {
        const loaded = clampInt(raw.tin, 0, SEED_FLOAT + ceiling, base.tin);
        if (lifetimeHarvest === 0 && loaded < OPENING_TIN) return OPENING_TIN;
        if (loaded < SEED_FLOAT) return SEED_FLOAT;
        return loaded;
      })(),
      lifetimeHarvest,
      lifetimeSold,
      plots: raw.plots.map((plot) => {
        const crop = cropOf(plot?.crop);
        if (!crop) return { ...emptyPlot(), enriched: plot?.enriched === true, weeds: clampInt(plot?.weeds, 0, WEED_CAP, 0) };
        return {
          crop: crop.id,
          sownQuarter: clampInt(plot.sownQuarter, 0, quarter, 0),
          ticks: clampInt(plot.ticks, 0, crop.quarters, 0),
          daysGrown: clampInt(plot.daysGrown, 0, daysNeeded(crop), plot.ticks * DAYS_PER_QUARTER),
          watered: clampInt(plot.watered, 0, crop.water, 0),
          thirst: clampInt(plot.thirst, 0, THIRST_DEATH - 1, 0),
          weeds: clampInt(plot.weeds, 0, WEED_CAP, 0),
          compost: clampInt(plot.compost, 0, COMPOST_PER_PLOT, 0),
          enriched: plot.enriched === true,
        };
      }),
      log: (Array.isArray(raw.log) ? raw.log : [])
        .filter((line) => typeof line === 'string')
        .map((line) => line.slice(0, 160))
        .slice(-6),
    };
  } catch {
    return fallback;
  }
}
