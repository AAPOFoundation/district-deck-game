import { resetRoomGeneration } from './room-economy-lifecycle.js';
// City weather stream. Seeded per run and quarter. Pure. No DOM.
// Heavy rain arms the existing flash-flood event; hot-dry can ignite a
// fringe blaze that burns until repaired, then burns the structure down.

import { stream } from './rng.js';
import { seasonForQuarter } from './veggie-patch.js';

export const WEATHER_STATES = Object.freeze(['clear', 'rain', 'heavy-rain', 'hot-dry']);

/** Modest flood chance given heavy rain. Authored. */
export const WEATHER_FLOOD_CHANCE_BP = 1_800;

/** Bushfire chance given hot-dry. Summer uses the hotter band. */
export const WEATHER_BUSHFIRE_CHANCE_BP = 1_600;
export const WEATHER_BUSHFIRE_SUMMER_CHANCE_BP = 2_800;

/** Beats a fringe blaze burns before the structure is lost. One beat = one settle. */
export const BUSHFIRE_BURN_BEATS = 2;

export const BUSHFIRE_REPAIR_COPY = 'The mill is damaged. Repair costs hold until repaired.';

const STATE_SET = new Set(WEATHER_STATES);

/**
 * Seasonal bands, 10_000 bp. Summer-weighted hot-dry; winter-weighted rain.
 * Melbourne eight-quarter wheel from seasonForQuarter.
 */
export const WEATHER_BANDS_BP = Object.freeze({
  summer: Object.freeze({
    clear: 2_200, rain: 1_400, 'heavy-rain': 1_400, 'hot-dry': 5_000,
  }),
  winter: Object.freeze({
    clear: 2_400, rain: 3_400, 'heavy-rain': 3_200, 'hot-dry': 1_000,
  }),
  spring: Object.freeze({
    clear: 3_000, rain: 2_800, 'heavy-rain': 2_200, 'hot-dry': 2_000,
  }),
  autumn: Object.freeze({
    clear: 3_200, rain: 2_800, 'heavy-rain': 2_000, 'hot-dry': 2_000,
  }),
});

export function weatherStreamName(runId, quarter) {
  return `weather:${runId}:${quarter}`;
}

export function weatherStream(runId, quarter) {
  return stream(runId, weatherStreamName(runId, quarter));
}

function pickState(rng, season) {
  const bands = WEATHER_BANDS_BP[season] ?? WEATHER_BANDS_BP.autumn;
  const roll = rng.int(0, 9_999);
  let cursor = 0;
  for (const state of WEATHER_STATES) {
    cursor += bands[state];
    if (roll < cursor) return { state, roll };
  }
  return { state: 'clear', roll };
}

export function drawWeather(runId, quarter) {
  const season = seasonForQuarter(quarter);
  const rng = weatherStream(runId, quarter);
  const picked = pickState(rng, season);
  return Object.freeze({
    quarter: Number.isInteger(quarter) ? quarter : 1,
    season,
    state: picked.state,
    draw: picked.roll,
  });
}

export function rollFloodArm(runId, quarter, weather = null) {
  const drawn = weather ?? drawWeather(runId, quarter);
  if (drawn.state !== 'heavy-rain') {
    return Object.freeze({ armed: false, roll: null, weather: drawn });
  }
  const rng = stream(runId, `${weatherStreamName(runId, quarter)}:flood`);
  const roll = rng.int(0, 9_999);
  return Object.freeze({
    armed: roll < WEATHER_FLOOD_CHANCE_BP,
    roll,
    weather: drawn,
  });
}

export function bushfireChanceBp(season) {
  return season === 'summer' ? WEATHER_BUSHFIRE_SUMMER_CHANCE_BP : WEATHER_BUSHFIRE_CHANCE_BP;
}

export function fringeParcelIds(city) {
  const maxX = Math.max(0, (city?.blocksX ?? 1) - 1);
  const maxZ = Math.max(0, (city?.blocksZ ?? 1) - 1);
  const order = [...(city?.order ?? [])].sort();
  return order.filter((id) => {
    const parcel = city.parcels?.[id];
    if (!parcel) return false;
    return parcel.bx === 0 || parcel.bz === 0 || parcel.bx === maxX || parcel.bz === maxZ;
  });
}

function standingOn(city, state, parcelId) {
  const holding = state?.holdings?.[parcelId];
  if (!holding?.owner) return false;
  if (holding.siteCleared) return false;
  const status = state.parcelStatus?.[parcelId];
  if (status?.occupancy === 'vacant' && (status.builtLevel ?? holding.level ?? 0) <= 0) {
    if (!holding.construction && filledPadCount(holding) === 0) return false;
  }
  return true;
}

function filledPadCount(holding) {
  const slots = holding?.padSlots;
  if (!slots || typeof slots !== 'object') return 0;
  return ['A', 'B'].filter((slot) => slots[slot] && slots[slot].status === 'standing').length;
}

export function liveBushfires(weather, quarter = weather?.quarter ?? 1) {
  return (weather?.bushfires ?? []).filter((row) => (
    row
    && row.repaired !== true
    && row.burnedDown !== true
    && (row.untilQuarter == null || quarter < row.untilQuarter)
  ));
}

export function blazeOnParcel(weather, parcelId, quarter) {
  return liveBushfires(weather, quarter).some((row) => row.parcelId === parcelId);
}

export function pickBushfireParcel(city, state, rng) {
  const live = liveBushfires(state?.weather, state?.quarter ?? 1);
  const burning = new Set(live.map((row) => row.parcelId));
  const candidates = fringeParcelIds(city).filter((id) => (
    standingOn(city, state, id) && !burning.has(id)
  ));
  if (!candidates.length) return null;
  return rng.pick(candidates);
}

export function rollBushfireIgnite(runId, quarter, city, state, weather = null) {
  const drawn = weather ?? drawWeather(runId, quarter);
  if (drawn.state !== 'hot-dry') {
    return Object.freeze({
      ignite: false, roll: null, parcelId: null, weather: drawn,
    });
  }
  const rng = stream(runId, `${weatherStreamName(runId, quarter)}:bushfire`);
  const roll = rng.int(0, 9_999);
  if (roll >= bushfireChanceBp(drawn.season)) {
    return Object.freeze({
      ignite: false, roll, parcelId: null, weather: drawn,
    });
  }
  const parcelId = pickBushfireParcel(city, state, rng);
  return Object.freeze({
    ignite: Boolean(parcelId),
    roll,
    parcelId,
    weather: drawn,
  });
}

function freezeBlaze(row) {
  return Object.freeze({
    id: String(row.id),
    parcelId: String(row.parcelId),
    ignitedQuarter: Number.isInteger(row.ignitedQuarter) ? row.ignitedQuarter : 1,
    remainingBeats: Number.isInteger(row.remainingBeats) ? row.remainingBeats : BUSHFIRE_BURN_BEATS,
    repaired: row.repaired === true,
    burnedDown: row.burnedDown === true,
    untilQuarter: Number.isInteger(row.untilQuarter) ? row.untilQuarter : null,
  });
}

export function emptyWeather(runId = 0, quarter = 1) {
  const drawn = drawWeather(runId, quarter);
  return Object.freeze({
    quarter: drawn.quarter,
    season: drawn.season,
    state: drawn.state,
    draw: drawn.draw,
    floodArmed: false,
    floodRoll: null,
    bushfireIgnite: false,
    bushfireRoll: null,
    bushfireParcelId: null,
    bushfires: Object.freeze([]),
  });
}

export function realiseWeather(runId, quarter, city = null, state = null) {
  const drawn = drawWeather(runId, quarter);
  const flood = rollFloodArm(runId, quarter, drawn);
  const fire = city
    ? rollBushfireIgnite(runId, quarter, city, state, drawn)
    : { ignite: false, roll: null, parcelId: null };
  const prior = (state?.weather?.bushfires ?? []).map(freezeBlaze);
  let bushfires = prior;
  if (fire.ignite && fire.parcelId && !blazeOnParcel({ bushfires: prior }, fire.parcelId, quarter)) {
    bushfires = [...prior, freezeBlaze({
      id: `bushfire-q${quarter}-${fire.parcelId}`,
      parcelId: fire.parcelId,
      ignitedQuarter: quarter,
      remainingBeats: BUSHFIRE_BURN_BEATS,
      repaired: false,
      burnedDown: false,
      untilQuarter: null,
    })];
  }
  return Object.freeze({
    quarter: drawn.quarter,
    season: drawn.season,
    state: drawn.state,
    draw: drawn.draw,
    floodArmed: flood.armed,
    floodRoll: flood.roll,
    bushfireIgnite: fire.ignite === true,
    bushfireRoll: fire.roll,
    bushfireParcelId: fire.parcelId,
    bushfires: Object.freeze(bushfires),
  });
}

export function restoreWeather(value, runId = 0, quarter = 1) {
  if (value == null) return emptyWeather(runId, quarter);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('City weather must be a record.');
  }
  const state = STATE_SET.has(value.state) ? value.state : 'clear';
  const bushfires = Array.isArray(value.bushfires)
    ? value.bushfires.map(freezeBlaze)
    : [];
  return Object.freeze({
    quarter: Number.isInteger(value.quarter) ? value.quarter : quarter,
    season: value.season ?? seasonForQuarter(quarter),
    state,
    draw: Number.isInteger(value.draw) ? value.draw : 0,
    floodArmed: value.floodArmed === true,
    floodRoll: Number.isInteger(value.floodRoll) ? value.floodRoll : null,
    bushfireIgnite: value.bushfireIgnite === true,
    bushfireRoll: Number.isInteger(value.bushfireRoll) ? value.bushfireRoll : null,
    bushfireParcelId: value.bushfireParcelId == null ? null : String(value.bushfireParcelId),
    bushfires: Object.freeze(bushfires),
  });
}

export function weatherOf(state) {
  if (state?.weather) return state.weather;
  return emptyWeather(state?.seed ?? 0, state?.quarter ?? 1);
}

export function weatherMinuteCopy(weather) {
  if (!weather) return 'The sky is unread.';
  if (weather.floodArmed) {
    return 'FLASH FLOOD — Insure the low-lying holdings before settle.';
  }
  if (weather.state === 'heavy-rain') {
    return 'Heavy rain. The low ground is watching the drains.';
  }
  if (weather.state === 'rain') return 'Rain on the inner city. The drains will hold.';
  if (weather.state === 'hot-dry') {
    if (liveBushfires(weather, weather.quarter).length) {
      return 'Hot and dry. A fringe blaze burns until repaired.';
    }
    return 'Hot and dry. The fringe is tinder.';
  }
  return 'The quarter opens under a clear sky.';
}

export function weatherChipCopy(weather) {
  if (!weather) return 'CLEAR';
  if (weather.floodArmed) return 'FLOOD WATCH';
  if (weather.state === 'heavy-rain') return 'HEAVY RAIN';
  if (weather.state === 'rain') return 'RAIN';
  if (weather.state === 'hot-dry') {
    return liveBushfires(weather, weather.quarter).length ? 'BUSHFIRE' : 'HOT DRY';
  }
  return 'CLEAR';
}

export function markBushfireRepaired(weather, parcelId, quarter) {
  const rows = (weather?.bushfires ?? []).map((row) => {
    if (row.parcelId !== parcelId || row.repaired || row.burnedDown) return freezeBlaze(row);
    return freezeBlaze({
      ...row,
      repaired: true,
      remainingBeats: 0,
      untilQuarter: quarter,
    });
  });
  return Object.freeze({
    ...(weather ?? emptyWeather()),
    bushfires: Object.freeze(rows),
  });
}

export function burnDownHolding(city, state, parcelId) {
  const holding = state.holdings?.[parcelId];
  const status = state.parcelStatus?.[parcelId];
  if (!holding || !status) return { burned: false };
  resetRoomGeneration(state, parcelId, false);
  holding.siteCleared = true;
  holding.padSlots = { A: null, B: null };
  holding.construction = null;
  holding.renovation = null;
  // Same empty-job contract as setRoomJobs: discard pending work, not history.
  delete holding.roomRenovations;
  delete holding.roomRenovation;
  holding.level = 0;
  status.occupancy = 'vacant';
  status.tenant = null;
  status.squatterSinceQuarter = null;
  status.builtLevel = 0;
  status.damage = 'fire';
  status.condition = 0;
  status.conditionVersion += 1;
  holding.condition = 0;
  return { burned: true, parcelId };
}

/**
 * After property events and works: insured / repaired blazes go out.
 * An unrepaired blaze burns one beat; at zero the structure is lost.
 */
export function resolveBushfires(city, state) {
  const weather = weatherOf(state);
  const quarter = state.quarter ?? 1;
  const nextRows = [];
  const burned = [];
  for (const row of weather.bushfires ?? []) {
    if (row.repaired || row.burnedDown) {
      nextRows.push(freezeBlaze(row));
      continue;
    }
    const status = state.parcelStatus?.[row.parcelId];
    const holding = state.holdings?.[row.parcelId];
    if (!holding) {
      nextRows.push(freezeBlaze({ ...row, repaired: true, untilQuarter: quarter }));
      continue;
    }
    if (status?.damage == null && holding.siteCleared !== true) {
      nextRows.push(freezeBlaze({
        ...row, repaired: true, remainingBeats: 0, untilQuarter: quarter,
      }));
      continue;
    }
    const remaining = Math.max(0, (row.remainingBeats ?? BUSHFIRE_BURN_BEATS) - 1);
    if (remaining <= 0) {
      burnDownHolding(city, state, row.parcelId);
      nextRows.push(freezeBlaze({
        ...row,
        remainingBeats: 0,
        burnedDown: true,
        untilQuarter: quarter,
      }));
      burned.push(row.parcelId);
      continue;
    }
    nextRows.push(freezeBlaze({ ...row, remainingBeats: remaining }));
  }
  state.weather = Object.freeze({
    ...weather,
    bushfires: Object.freeze(nextRows),
  });
  return { burned };
}

export function oneBlazeGuardCopy() {
  return 'One blaze per facility. A second strike feeds the existing fire.';
}
