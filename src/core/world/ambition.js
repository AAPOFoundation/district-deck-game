// Civ3 analog victories on the Melbourne globe. Ambition defaults so WORLD_STATE_VERSION stays 6.
// V4.0 Wave R3: monotonic ledger watermark, cityLots listing provenance.

import {
  appendWorldLog,
  CITY_EXPORT_TO_YARD,
  WORLD_CASH_WIN,
  WORLD_CHOKE_BY_ID,
  WORLD_CHOKEPOINTS,
  WORLD_CITY_BY_ID,
  WORLD_CREDIT_TAPE,
  WORLD_CREEDS,
  WORLD_CULTURE_CREED,
  WORLD_CULTURE_HOLD,
  WORLD_CULTURE_NEED,
  WORLD_EXPORT_TAPE,
  WORLD_INBOUND_TAPE,
  WORLD_LISTING_NEED,
  WORLD_LISTING_SHIPMENTS,
  WORLD_MARS_PARTS,
  WORLD_MISSION_BASE_PCT,
  WORLD_MISSION_MODIFIER_PCT,
  WORLD_MISSIONARY_CAP,
  WORLD_MISSIONARY_COST,
  WORLD_OFFICER_CAP,
  WORLD_OFFICER_COST,
  WORLD_STATION_COST,
  WORLD_TAPE_START,
  WORLD_TRADE_ROUTES,
  WORLD_BIOMIND_BEATS,
  WORLD_BIOMIND_BIOLABS,
  WORLD_BIOMIND_COST,
  WORLD_BIOMIND_DELAY_BP,
  WORLD_BIOMIND_FED_CAP,
  WORLD_BIOMIND_STOCK_KEYS,
  WORLD_BIOMIND_STOCKS,
  WORLD_BUILD_KITS,
  WORLD_STARTUP_WIN_COUNT,
  WORLD_STARTUP_WIN_VALUATION,
  booksGuardedByStationedChokes,
  dockHoldLogRow,
  emptyBiomindFed,
  exportCashForGood,
  handlingFeeForGood,
} from './catalog.js';
import { emptyForces, emptyStocks } from './forces.js';
import { worldStream } from './seed.js';
import { routeIsOpen } from './trade.js';
import {
  issueBuildKitVoucher,
  kitAlreadyShippedReason,
  restoreBuildKits,
  restoreKitSeq,
} from '../build-kits.js';
import { DELAY_BEATS, DELAY_CLASSES, MINE_MAKE_DESKS, WORLD_WORKS_DESKS, restoreProcessDrawWatermark } from './processes.js';

const CREED_SET = new Set(WORLD_CREEDS.map((row) => row.id));
const PART_SET = new Set(WORLD_MARS_PARTS.map((row) => row.id));
const CHOKE_SET = new Set(WORLD_CHOKEPOINTS.map((row) => row.id));
const CITY_SET = new Set(Object.keys(WORLD_CITY_BY_ID));

/** Applied ledger older than this many beats is treated as no institutions. */
export const INSTITUTION_STALE_BEATS = 8;

export const EMPTY_INSTITUTIONS = Object.freeze({
  spaceWorks: false,
  missionarySchool: false,
  officerSchool: false,
  exchange: false,
  biolab: false,
  incubator: false,
});

const LISTING_LABEL = Object.freeze({
  food: 'Grain',
  fittings: 'Fittings',
  chips: 'Chips',
  people: 'Labour',
  timber: 'Timber',
  biotech: 'Biotech',
  'milk-powder': 'Milk powder',
  wine: 'Wine',
  beef: 'Beef',
  education: 'Tuition',
});

export function emptyAmbition() {
  return {
    tape: WORLD_TAPE_START,
    creed: null,
    influence: {},
    marsOpen: false,
    marsParts: [],
    biomindTraining: false,
    biomindBeats: 0,
    biomindDelayRemaining: 0,
    biomindFed: emptyBiomindFed(),
    biolabCount: 0,
    startupValuations: [],
    missionaries: 0,
    officers: 0,
    convertedDesks: [],
    stationedChokepoints: [],
    shipped: {},
    lastMissionBeat: null,
    won: null,
    institutions: { ...EMPTY_INSTITUTIONS },
    lastLedgerApplied: null,
    lastLedgerRunId: null,
    lastLedgerQuarter: null,
    lastLedgerAppliedBeat: null,
    cityLots: {},
    educationSeats: 0,
    buildKits: {},
    kitSeq: {},
    processDrawWatermark: {},
    processDrawRunId: null,
    mineMake: {},
    mineRuns: {},
    mineRunIndex: {},
    worksRuns: {},
    worksRunIndex: {},
    stockQuality: {},
  };
}

function requireNonNegativeInt(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer.`);
  }
  return value;
}

const STARTUP_VALUATION_ECHO_COUNT = 64;
const STARTUP_VALUATION_ECHO_CAP = 1_000_000_000_000;

function restoreBiomindFed(value) {
  const empty = emptyBiomindFed();
  if (value == null) return empty;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('ambition.biomindFed must be a record.');
  }
  const restored = { ...empty };
  for (const key of WORLD_BIOMIND_STOCK_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    restored[key] = Math.min(
      WORLD_BIOMIND_FED_CAP,
      requireNonNegativeInt(value[key], `ambition.biomindFed.${key}`),
    );
  }
  return restored;
}

function restoreStartupValuations(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new TypeError('ambition.startupValuations must be an array.');
  }
  if (value.length > STARTUP_VALUATION_ECHO_COUNT) {
    throw new RangeError('ambition.startupValuations exceeds the echo cap.');
  }
  return value.map((n, index) => {
    const amount = requireNonNegativeInt(n, `ambition.startupValuations.${index}`);
    if (amount > STARTUP_VALUATION_ECHO_CAP) {
      throw new RangeError(`ambition.startupValuations.${index} exceeds the echo cap.`);
    }
    return amount;
  });
}

export function liveBiolabCount(world) {
  if (!liveInstitutions(world).biolab) return 0;
  const count = world?.ambition?.biolabCount;
  if (Number.isInteger(count) && count > 0) return count;
  return 1;
}

export function countedStartups(world, floor = WORLD_STARTUP_WIN_VALUATION) {
  const values = world?.ambition?.startupValuations ?? [];
  return values.filter((value) => Number.isInteger(value) && value >= floor).length;
}

export function snapshotInstitutions(row) {
  return {
    spaceWorks: row?.spaceWorks === true,
    missionarySchool: row?.missionarySchool === true,
    officerSchool: row?.officerSchool === true,
    exchange: row?.exchange === true,
    biolab: row?.biolab === true,
    incubator: row?.incubator === true,
  };
}

export function ledgerIdentity(payload) {
  if (!payload || typeof payload.runId !== 'string' || payload.runId.length === 0) return null;
  if (!Number.isInteger(payload.quarter)) return null;
  return `${payload.runId}:${payload.quarter}`;
}

/** Split `"runId:quarter"` on the last colon. Unparseable identities reset. */
export function parseLedgerWatermark(identity) {
  if (typeof identity !== 'string' || identity.length === 0) return null;
  const idx = identity.lastIndexOf(':');
  if (idx <= 0 || idx >= identity.length - 1) return null;
  const runId = identity.slice(0, idx);
  const quarter = Number(identity.slice(idx + 1));
  if (!Number.isInteger(quarter) || quarter < 0 || runId.length === 0) return null;
  return { runId, quarter };
}

function watermarkOf(ambition) {
  if (!ambition) return null;
  if (
    typeof ambition.lastLedgerRunId === 'string'
    && ambition.lastLedgerRunId.length > 0
    && Number.isInteger(ambition.lastLedgerQuarter)
    && ambition.lastLedgerQuarter >= 0
  ) {
    return { runId: ambition.lastLedgerRunId, quarter: ambition.lastLedgerQuarter };
  }
  return parseLedgerWatermark(ambition.lastLedgerApplied);
}

/** Apply when the run changed, or the same run's quarter is strictly newer. Same-run rollback is inert. */
export function ledgerApplies(payload, ambition) {
  if (!payload || typeof payload.runId !== 'string' || payload.runId.length === 0) return false;
  if (!Number.isInteger(payload.quarter) || payload.quarter < 0) return false;
  const mark = watermarkOf(ambition);
  if (!mark) return true;
  return payload.runId !== mark.runId || payload.quarter > mark.quarter;
}

export function addCityLots(cityLots, payload) {
  const next = { ...(cityLots ?? {}) };
  const goods = payload?.goods;
  if (!goods || typeof goods !== 'object' || Array.isArray(goods)) return next;
  for (const [cityGood, amount] of Object.entries(goods)) {
    if (!Number.isInteger(amount) || amount <= 0) continue;
    const yardGood = CITY_EXPORT_TO_YARD[cityGood];
    if (!yardGood) continue;
    next[yardGood] = (next[yardGood] ?? 0) + amount;
  }
  return next;
}

/**
 * A city lot is a crate that physically entered the Yard from the city. Lots
 * granted may never exceed the stock the capped admission actually added, and
 * may never exceed current stock after any spend — a listing must always be
 * backed by a crate that is both present and city-fed.
 */
export function addAdmittedCityLots(cityLots, stocksBefore, stocksAfter) {
  const next = { ...(cityLots ?? {}) };
  for (const [good, after] of Object.entries(stocksAfter ?? {})) {
    const delta = after - (stocksBefore?.[good] ?? 0);
    if (delta > 0) next[good] = (next[good] ?? 0) + delta;
  }
  return next;
}

export function clampCityLots(cityLots, stocks) {
  const next = {};
  for (const [good, count] of Object.entries(cityLots ?? {})) {
    const kept = Math.min(count, stocks?.[good] ?? 0);
    if (kept > 0) next[good] = kept;
  }
  return next;
}

export function liveInstitutions(world) {
  const ambition = world?.ambition ?? emptyAmbition();
  const appliedBeat = ambition.lastLedgerAppliedBeat;
  const beat = world?.beat ?? 0;
  const mark = watermarkOf(ambition);
  if (!mark || !Number.isInteger(appliedBeat)) {
    return { ...EMPTY_INSTITUTIONS };
  }
  const age = beat - appliedBeat;
  if (age < 0 || age > INSTITUTION_STALE_BEATS) {
    return { ...EMPTY_INSTITUTIONS };
  }
  return snapshotInstitutions(ambition.institutions);
}

export function listedGoods(ambition) {
  const shipped = ambition?.shipped ?? {};
  return Object.keys(shipped)
    .filter((good) => (shipped[good] ?? 0) >= WORLD_LISTING_SHIPMENTS)
    .sort();
}

function restoreWatermark(value) {
  const hasRun = value.lastLedgerRunId != null;
  const hasQuarter = value.lastLedgerQuarter != null;
  if (hasRun || hasQuarter) {
    const runId = String(value.lastLedgerRunId ?? '');
    if (runId.length === 0) {
      throw new RangeError('ambition.lastLedgerRunId must be a string or null.');
    }
    const quarter = requireNonNegativeInt(value.lastLedgerQuarter, 'ambition.lastLedgerQuarter');
    return { runId, quarter };
  }
  if (value.lastLedgerApplied == null) return { runId: null, quarter: null };
  const identity = String(value.lastLedgerApplied);
  if (identity.length === 0) {
    throw new RangeError('ambition.lastLedgerApplied must be a string or null.');
  }
  return parseLedgerWatermark(identity) ?? { runId: null, quarter: null };
}

function restoreCityLots(value) {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('ambition.cityLots must be a record.');
  }
  const cityLots = {};
  for (const [good, count] of Object.entries(value)) {
    cityLots[good] = requireNonNegativeInt(count, `ambition.cityLots.${good}`);
  }
  return cityLots;
}

export function restoreAmbition(value, beat = null) {
  const empty = emptyAmbition();
  if (value == null) return empty;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('World ambition must be a record.');
  }
  const creed = value.creed == null ? null : String(value.creed);
  if (creed != null && !CREED_SET.has(creed)) {
    throw new RangeError(`Unknown creed: ${creed}`);
  }
  const influence = {};
  const rawInfluence = value.influence && typeof value.influence === 'object' && !Array.isArray(value.influence)
    ? value.influence
    : {};
  for (const [cityId, score] of Object.entries(rawInfluence)) {
    influence[cityId] = requireNonNegativeInt(score, `ambition.influence.${cityId}`);
  }
  const marsParts = Array.isArray(value.marsParts) ? value.marsParts.map(String) : [];
  for (const part of marsParts) {
    if (!PART_SET.has(part)) throw new RangeError(`Unknown Mars part: ${part}`);
  }
  const convertedDesks = Array.isArray(value.convertedDesks) ? [...new Set(value.convertedDesks.map(String))] : [];
  for (const cityId of convertedDesks) {
    if (!CITY_SET.has(cityId)) throw new RangeError(`Unknown converted desk: ${cityId}`);
  }
  const stationedChokepoints = Array.isArray(value.stationedChokepoints)
    ? [...new Set(value.stationedChokepoints.map(String))]
    : [];
  for (const chokeId of stationedChokepoints) {
    if (!CHOKE_SET.has(chokeId)) throw new RangeError(`Unknown chokepoint: ${chokeId}`);
  }
  const shipped = {};
  const rawShipped = value.shipped && typeof value.shipped === 'object' && !Array.isArray(value.shipped)
    ? value.shipped
    : {};
  for (const [good, count] of Object.entries(rawShipped)) {
    shipped[good] = requireNonNegativeInt(count, `ambition.shipped.${good}`);
  }
  let won = null;
  if (value.won != null) {
    if (!value.won || typeof value.won !== 'object' || Array.isArray(value.won)) {
      throw new TypeError('World ambition.won must be a record.');
    }
    won = {
      kind: String(value.won.kind),
      beat: requireNonNegativeInt(value.won.beat, 'ambition.won.beat'),
      register: String(value.won.register ?? ''),
    };
  }
  const lastMissionBeat = value.lastMissionBeat == null
    ? null
    : requireNonNegativeInt(value.lastMissionBeat, 'ambition.lastMissionBeat');
  const mark = restoreWatermark(value);
  const lastLedgerApplied = mark.runId == null ? null : `${mark.runId}:${mark.quarter}`;
  let lastLedgerAppliedBeat = value.lastLedgerAppliedBeat == null
    ? null
    : requireNonNegativeInt(value.lastLedgerAppliedBeat, 'ambition.lastLedgerAppliedBeat');
  if (Number.isInteger(beat) && Number.isInteger(lastLedgerAppliedBeat) && lastLedgerAppliedBeat > beat) {
    lastLedgerAppliedBeat = beat;
  }
  const buildKits = restoreBuildKits(value.buildKits ?? {});
  const kitSeq = restoreKitSeq(value.kitSeq ?? {});
  const processDrawWatermark = restoreProcessDrawWatermark(value.processDrawWatermark ?? {});
  let processDrawRunId = null;
  if (value.processDrawRunId != null && value.processDrawRunId !== '') {
    if (typeof value.processDrawRunId !== 'string' || value.processDrawRunId.length > 200) {
      throw new RangeError('ambition.processDrawRunId must be a short string or null.');
    }
    processDrawRunId = value.processDrawRunId;
  }
  const mineMake = restoreMineMake(value.mineMake);
  const mineRuns = restoreMineRuns(value.mineRuns);
  const mineRunIndex = restoreMineRunIndex(value.mineRunIndex);
  const stockQuality = restoreStockQuality(value.stockQuality);
  for (const [institutionId, row] of Object.entries(buildKits)) {
    if ((kitSeq[institutionId] ?? 0) < row.seq) {
      throw new RangeError(`The issued kit sequence for ${institutionId} is behind the outstanding row.`);
    }
  }
  return {
    tape: requireNonNegativeInt(value.tape ?? WORLD_TAPE_START, 'ambition.tape'),
    creed,
    influence,
    marsOpen: Boolean(value.marsOpen),
    marsParts: [...new Set(marsParts)],
    biomindTraining: Boolean(
      Object.prototype.hasOwnProperty.call(value, 'biomindTraining')
        ? value.biomindTraining
        // Restore-migration only: pre-V4.5 W2 envelopes stored agiTraining.
        : value.agiTraining,
    ),
    biomindBeats: requireNonNegativeInt(
      Object.prototype.hasOwnProperty.call(value, 'biomindBeats')
        ? value.biomindBeats
        // Restore-migration only: pre-V4.5 W2 envelopes stored agiBeats.
        : (value.agiBeats ?? 0),
      'ambition.biomindBeats',
    ),
    biomindDelayRemaining: requireNonNegativeInt(
      value.biomindDelayRemaining ?? 0,
      'ambition.biomindDelayRemaining',
    ),
    missionaries: Math.min(
      requireNonNegativeInt(value.missionaries ?? 0, 'ambition.missionaries'),
      WORLD_MISSIONARY_CAP,
    ),
    officers: Math.min(
      requireNonNegativeInt(value.officers ?? 0, 'ambition.officers'),
      WORLD_OFFICER_CAP,
    ),
    convertedDesks,
    stationedChokepoints,
    shipped,
    lastMissionBeat,
    won,
    institutions: snapshotInstitutions(value.institutions),
    lastLedgerApplied,
    lastLedgerRunId: mark.runId,
    lastLedgerQuarter: mark.quarter,
    lastLedgerAppliedBeat,
    cityLots: restoreCityLots(value.cityLots),
    educationSeats: requireNonNegativeInt(value.educationSeats ?? 0, 'ambition.educationSeats'),
    biolabCount: requireNonNegativeInt(value.biolabCount ?? 0, 'ambition.biolabCount'),
    startupValuations: restoreStartupValuations(value.startupValuations),
    biomindFed: restoreBiomindFed(value.biomindFed),
    buildKits,
    kitSeq,
    processDrawWatermark,
    processDrawRunId,
    mineMake,
    mineRuns,
    mineRunIndex,
    worksRuns: restoreWorksRuns(value.worksRuns),
    worksRunIndex: restoreWorksRunIndex(value.worksRunIndex),
    stockQuality,
  };
}

function restoreMineMake(value) {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('ambition.mineMake must be a record.');
  }
  const restored = {};
  for (const [deskId, on] of Object.entries(value)) {
    if (!Object.prototype.hasOwnProperty.call(MINE_MAKE_DESKS, deskId)) continue;
    restored[deskId] = on === true;
  }
  return restored;
}

function restoreMineRunIndex(value) {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('ambition.mineRunIndex must be a record.');
  }
  const restored = {};
  for (const [deskId, index] of Object.entries(value)) {
    if (!Object.prototype.hasOwnProperty.call(MINE_MAKE_DESKS, deskId)) continue;
    restored[deskId] = requireNonNegativeInt(index, `ambition.mineRunIndex.${deskId}`);
  }
  return restored;
}

function restoreMineRuns(value) {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('ambition.mineRuns must be a record.');
  }
  const restored = {};
  for (const [deskId, run] of Object.entries(value)) {
    if (!Object.prototype.hasOwnProperty.call(MINE_MAKE_DESKS, deskId)) continue;
    if (!run || typeof run !== 'object' || Array.isArray(run)) {
      throw new TypeError(`ambition.mineRuns.${deskId} must be an object.`);
    }
    restored[deskId] = Object.freeze({
      remainingBeats: requireNonNegativeInt(run.remainingBeats, `ambition.mineRuns.${deskId}.remainingBeats`),
      runIndex: requireNonNegativeInt(run.runIndex, `ambition.mineRuns.${deskId}.runIndex`),
      error: run.error === true,
      delayBeats: requireNonNegativeInt(run.delayBeats ?? 0, `ambition.mineRuns.${deskId}.delayBeats`),
    });
  }
  return restored;
}

const WORLD_WORKS_RUN_KEYS = new Set(
  Object.entries(WORLD_WORKS_DESKS).flatMap(([deskId, ids]) => ids.map((id) => `${deskId}:${id}`)),
);

function restoreWorksRunIndex(value) {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('ambition.worksRunIndex must be a record.');
  }
  const restored = {};
  for (const [key, index] of Object.entries(value)) {
    if (!WORLD_WORKS_RUN_KEYS.has(key)) continue;
    restored[key] = requireNonNegativeInt(index, `ambition.worksRunIndex.${key}`);
  }
  return restored;
}

function restoreWorksRuns(value) {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('ambition.worksRuns must be a record.');
  }
  const restored = {};
  for (const [key, run] of Object.entries(value)) {
    if (!WORLD_WORKS_RUN_KEYS.has(key)) continue;
    if (!run || typeof run !== 'object' || Array.isArray(run)) {
      throw new TypeError(`ambition.worksRuns.${key} must be an object.`);
    }
    restored[key] = Object.freeze({
      remainingBeats: requireNonNegativeInt(run.remainingBeats, `ambition.worksRuns.${key}.remainingBeats`),
      runIndex: requireNonNegativeInt(run.runIndex, `ambition.worksRuns.${key}.runIndex`),
      error: run.error === true,
      delayBeats: requireNonNegativeInt(run.delayBeats ?? 0, `ambition.worksRuns.${key}.delayBeats`),
    });
  }
  return restored;
}

function restoreStockQuality(value) {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('ambition.stockQuality must be a record.');
  }
  const restored = {};
  for (const [good, quality] of Object.entries(value)) {
    if (!Number.isInteger(quality) || quality < 0 || quality > 9) {
      throw new RangeError(`ambition.stockQuality.${good} must be an integer 0–9.`);
    }
    if (quality > 0) restored[good] = quality;
  }
  return restored;
}

export function openExportCount(world) {
  return WORLD_TRADE_ROUTES.filter((route) => (
    route.direction === 'outbound' && routeIsOpen(world, route.id)
  )).length;
}

export function cultureHolds(world) {
  const ambition = world.ambition ?? emptyAmbition();
  if (!ambition.creed) return 0;
  return Object.values(ambition.influence).filter((score) => score >= WORLD_CULTURE_HOLD).length;
}

export function liveConvertedDesks(world) {
  return (world?.ambition?.convertedDesks ?? []).filter((cityId) => deskIsOpen(world, cityId));
}

export function convertedDeskCount(world) {
  return liveConvertedDesks(world).length;
}

export function victoryProgress(world) {
  const ambition = world.ambition ?? emptyAmbition();
  const tape = ambition.tape ?? WORLD_TAPE_START;
  const stationed = ambition.stationedChokepoints ?? [];
  const listings = listedGoods(ambition);
  const converted = convertedDeskCount(world);
  return Object.freeze({
    financial: Object.freeze({
      have: tape,
      need: WORLD_CASH_WIN,
      listings: listings.length,
      listingsNeed: WORLD_LISTING_NEED,
      listed: Object.freeze([...listings]),
      startups: countedStartups(world),
      startupsNeed: WORLD_STARTUP_WIN_COUNT,
      startupFloor: WORLD_STARTUP_WIN_VALUATION,
      ratio: Math.min(1, tape / WORLD_CASH_WIN),
    }),
    culture: Object.freeze({
      creed: ambition.creed,
      have: converted,
      need: WORLD_CULTURE_NEED,
      holds: cultureHolds(world),
      missionaries: ambition.missionaries ?? 0,
      ratio: Math.min(1, converted / WORLD_CULTURE_NEED),
    }),
    military: Object.freeze({
      have: stationed.length,
      need: WORLD_CHOKEPOINTS.length,
      stationed: Object.freeze([...stationed]),
      officers: ambition.officers ?? 0,
      ratio: Math.min(1, stationed.length / WORLD_CHOKEPOINTS.length),
    }),
    wonder: Object.freeze({
      open: ambition.marsOpen,
      have: ambition.marsParts.length,
      need: WORLD_MARS_PARTS.length,
      ratio: ambition.marsOpen
        ? Math.min(1, ambition.marsParts.length / WORLD_MARS_PARTS.length)
        : 0,
    }),
    tech: Object.freeze({
      training: ambition.biomindTraining,
      have: ambition.biomindBeats,
      need: WORLD_BIOMIND_BEATS,
      ratio: Math.min(1, ambition.biomindBeats / WORLD_BIOMIND_BEATS),
      win: Boolean(
        ambition.won?.kind === 'tech'
        || (ambition.biomindBeats >= WORLD_BIOMIND_BEATS && !ambition.biomindTraining),
      ),
      biolab: liveInstitutions(world).biolab,
      biolabs: liveBiolabCount(world),
      biolabsNeed: WORLD_BIOMIND_BIOLABS,
      fed: Object.freeze({ ...(ambition.biomindFed ?? emptyBiomindFed()) }),
    }),
    exports: openExportCount(world),
    won: ambition.won,
  });
}

function spend(world, cash, stocksNeed) {
  if ((world.treasuryCash ?? 0) < cash) {
    return { ok: false, reason: `Head office needs $${cash.toLocaleString('en-AU')}.` };
  }
  const stocks = { ...(world.stocks ?? emptyStocks()) };
  for (const [good, need] of Object.entries(stocksNeed)) {
    if ((stocks[good] ?? 0) < need) {
      const label = good === 'people' ? 'labour crate' : `${good} crates`;
      const noun = need === 1 && good === 'people' ? 'labour crate' : label;
      return { ok: false, reason: `Need ${need} ${noun} (have ${stocks[good] ?? 0}).` };
    }
  }
  const nextStocks = { ...stocks };
  for (const [good, need] of Object.entries(stocksNeed)) nextStocks[good] -= need;
  return {
    ok: true,
    reason: '',
    treasuryCash: world.treasuryCash - cash,
    stocks: nextStocks,
  };
}

export function foundCreed(world, creedId) {
  const ambition = restoreAmbition(world.ambition);
  if (ambition.creed) return { ok: false, reason: 'A doctrine is already founded.', world };
  if (!CREED_SET.has(creedId)) return { ok: false, reason: 'No such doctrine.', world };
  const paid = spend(world, 200_000, {});
  if (!paid.ok) return { ok: false, reason: paid.reason, world };
  return {
    ok: true,
    reason: '',
    world: {
      ...world,
      treasuryCash: paid.treasuryCash,
      stocks: paid.stocks,
      ambition: { ...ambition, creed: creedId },
    },
  };
}

function rollBiomindDelays(world) {
  const rng = worldStream(world.worldSeed, `biomind:${world.beat ?? 0}`);
  let delayBeats = 0;
  const hits = [];
  for (const klass of DELAY_CLASSES) {
    const bp = WORLD_BIOMIND_DELAY_BP[klass];
    const hit = Math.floor(rng.unit() * 10_000) < bp;
    const [lo, hi] = DELAY_BEATS[klass];
    const extra = rng.int(lo, hi);
    if (hit) {
      hits.push(Object.freeze({ class: klass, beats: extra }));
      delayBeats += extra;
    }
  }
  return Object.freeze({ delayBeats, delays: Object.freeze(hits) });
}

export function trainBiomind(world) {
  const ambition = restoreAmbition(world.ambition);
  if (ambition.biomindTraining || ambition.biomindBeats >= WORLD_BIOMIND_BEATS) {
    return { ok: false, reason: 'Biomind training is already under way.', world };
  }
  const biolabs = liveBiolabCount(world);
  if (biolabs < WORLD_BIOMIND_BIOLABS) {
    return {
      ok: false,
      reason: `Need ${WORLD_BIOMIND_BIOLABS} standing biolabs (have ${biolabs}).`,
      world,
    };
  }
  const fed = ambition.biomindFed ?? emptyBiomindFed();
  if ((fed.asylum ?? 0) < WORLD_BIOMIND_STOCKS.asylum) {
    return {
      ok: false,
      reason: `Need ${WORLD_BIOMIND_STOCKS.asylum} asylum crates — refugees for human trials (have ${fed.asylum ?? 0}).`,
      world,
    };
  }
  for (const [good, need] of Object.entries(WORLD_BIOMIND_STOCKS)) {
    if ((fed[good] ?? 0) < need) {
      return {
        ok: false,
        reason: `Need ${need} fed ${good} crates (have ${fed[good] ?? 0}).`,
        world,
      };
    }
  }
  const paid = spend(world, WORLD_BIOMIND_COST, {});
  if (!paid.ok) return { ok: false, reason: paid.reason, world };
  const rolled = rollBiomindDelays(world);
  const delayLog = rolled.delays.map((hit) => Object.freeze({
    beat: world.beat ?? 0,
    type: 'biomind-delay',
    body: hit.class === 'political'
      ? `Political red tape holds biomind training — ${hit.beats} beat${hit.beats === 1 ? '' : 's'}.`
      : hit.class === 'environmental'
        ? `Environmental review holds biomind training — ${hit.beats} beat${hit.beats === 1 ? '' : 's'}.`
        : `Accident holds biomind training — ${hit.beats} beat${hit.beats === 1 ? '' : 's'}.`,
  }));
  return {
    ok: true,
    reason: '',
    world: {
      ...world,
      treasuryCash: paid.treasuryCash,
      stocks: paid.stocks,
      log: delayLog.length ? appendWorldLog(world.log, delayLog) : world.log,
      ambition: {
        ...ambition,
        biomindTraining: true,
        biomindDelayRemaining: rolled.delayBeats,
      },
    },
  };
}

export function feedBiomind(world, good = null) {
  const ambition = restoreAmbition(world.ambition);
  const keys = good == null ? [...WORLD_BIOMIND_STOCK_KEYS] : [good];
  for (const key of keys) {
    if (!WORLD_BIOMIND_STOCK_KEYS.includes(key)) {
      return { ok: false, reason: 'That crate is not a biomind input.', world };
    }
  }
  const stocks = { ...(world.stocks ?? emptyStocks()) };
  const fed = { ...(ambition.biomindFed ?? emptyBiomindFed()) };
  const movedGoods = [];
  let moved = 0;
  for (const key of keys) {
    const remaining = Math.max(0, WORLD_BIOMIND_STOCKS[key] - (fed[key] ?? 0));
    const room = Math.max(0, WORLD_BIOMIND_FED_CAP - (fed[key] ?? 0));
    const n = Math.min(stocks[key] ?? 0, remaining, room);
    if (n <= 0) continue;
    stocks[key] = (stocks[key] ?? 0) - n;
    fed[key] = (fed[key] ?? 0) + n;
    moved += n;
    movedGoods.push(`${n} ${key}`);
  }
  if (moved <= 0) {
    return { ok: false, reason: 'No biomind crates to feed from the Yard.', world };
  }
  const log = appendWorldLog(world.log, Object.freeze({
    beat: world.beat ?? 0,
    type: 'biomind-feed',
    body: `Fed ${movedGoods.join(', ')} into biomind training.`,
  }));
  return {
    ok: true,
    reason: '',
    moved,
    world: {
      ...world,
      stocks,
      log,
      ambition: { ...ambition, biomindFed: fed },
    },
  };
}

export function openMarsDesk(world) {
  const ambition = restoreAmbition(world.ambition);
  if (ambition.marsOpen) return { ok: false, reason: 'The Mars desk is already open.', world };
  const paid = spend(world, 500_000, { chips: 2, robots: 1 });
  if (!paid.ok) return { ok: false, reason: paid.reason, world };
  return {
    ok: true,
    reason: '',
    world: {
      ...world,
      treasuryCash: paid.treasuryCash,
      stocks: paid.stocks,
      ambition: { ...ambition, marsOpen: true },
    },
  };
}

export function buildMarsPart(world, partId) {
  const ambition = restoreAmbition(world.ambition);
  if (!ambition.marsOpen) return { ok: false, reason: 'Open the Mars desk first.', world };
  if (!liveInstitutions(world).spaceWorks) {
    return { ok: false, reason: 'The city has no space works.', world };
  }
  const part = WORLD_MARS_PARTS.find((row) => row.id === partId);
  if (!part) return { ok: false, reason: 'No such Mars part.', world };
  if (ambition.marsParts.includes(partId)) return { ok: false, reason: 'That part is already stacked.', world };
  const paid = spend(world, part.cash, part.stocks);
  if (!paid.ok) return { ok: false, reason: paid.reason, world };
  return {
    ok: true,
    reason: '',
    world: {
      ...world,
      treasuryCash: paid.treasuryCash,
      stocks: paid.stocks,
      ambition: { ...ambition, marsParts: [...ambition.marsParts, partId] },
    },
  };
}

export function shipBuildKit(world, institutionId, runId = null) {
  const kit = WORLD_BUILD_KITS[institutionId];
  if (!kit) return { ok: false, reason: 'No such build kit.', world };
  const ambition = restoreAmbition(world.ambition, world.beat ?? 0);
  if (ambition.buildKits[institutionId]) {
    return { ok: false, reason: kitAlreadyShippedReason(institutionId), world };
  }
  const paid = spend(world, kit.cash, kit.stocks);
  if (!paid.ok) return { ok: false, reason: paid.reason, world };
  const log = appendWorldLog(world.log, Object.freeze({
    beat: world.beat,
    type: `ship-kit-${institutionId}`,
    body: `Shipped the ${kit.label} kit.`,
  }));
  const spentWorld = {
    ...world,
    treasuryCash: paid.treasuryCash,
    stocks: paid.stocks,
    log,
  };
  if (typeof runId !== 'string' || runId.length === 0) {
    return {
      ok: true,
      reason: '',
      fee: kit.cash,
      institutionId,
      world: spentWorld,
    };
  }
  const issued = issueBuildKitVoucher(ambition, {
    runId,
    institutionId,
    beat: world.beat ?? 0,
  });
  return {
    ok: true,
    reason: '',
    fee: kit.cash,
    institutionId,
    seq: issued.row.seq,
    id: issued.row.id,
    world: {
      ...spentWorld,
      ambition: { ...ambition, buildKits: issued.buildKits, kitSeq: issued.kitSeq },
    },
  };
}

export function trainMissionary(world) {
  const ambition = restoreAmbition(world.ambition);
  if (!liveInstitutions(world).missionarySchool) {
    return { ok: false, reason: 'The city has no missionary school.', world };
  }
  if (ambition.missionaries >= WORLD_MISSIONARY_CAP) {
    return { ok: false, reason: `Missionaries wait at cap (${WORLD_MISSIONARY_CAP}).`, world };
  }
  const paid = spend(world, WORLD_MISSIONARY_COST, { people: 1 });
  if (!paid.ok) return { ok: false, reason: paid.reason, world };
  worldStream(world.worldSeed, `train-missionary:${world.beat ?? 0}:${ambition.missionaries}`).int(0, 99);
  return {
    ok: true,
    reason: '',
    world: {
      ...world,
      treasuryCash: paid.treasuryCash,
      stocks: paid.stocks,
      ambition: { ...ambition, missionaries: ambition.missionaries + 1 },
    },
  };
}

export function deskIsOpen(world, cityId) {
  if (!CITY_SET.has(cityId) || cityId === 'melbourne-inner') return false;
  const city = world.cities?.[cityId];
  if (city?.status === 'open' || city?.status === 'in-play') return true;
  return WORLD_TRADE_ROUTES.some((route) => (
    (route.from === cityId || route.to === cityId) && routeIsOpen(world, route.id)
  ));
}

export function conversionChancePct(cityId) {
  const modifier = WORLD_MISSION_MODIFIER_PCT[cityId] ?? 0;
  const chance = WORLD_MISSION_BASE_PCT + modifier;
  return Math.max(5, Math.min(90, chance));
}

export function sendMission(world, cityId) {
  const ambition = restoreAmbition(world.ambition);
  if (!liveInstitutions(world).missionarySchool) {
    return { ok: false, converted: false, reason: 'The city has no missionary school.', world };
  }
  if (ambition.creed !== WORLD_CULTURE_CREED) {
    return { ok: false, converted: false, reason: 'Found the Christian doctrine first.', world };
  }
  if (ambition.missionaries < 1) {
    return { ok: false, converted: false, reason: 'Need 1 missionary.', world };
  }
  if ((world.stocks?.bibles ?? 0) < 1) {
    return { ok: false, converted: false, reason: 'Need 1 bible.', world };
  }
  if (!CITY_SET.has(cityId) || cityId === 'melbourne-inner') {
    return { ok: false, converted: false, reason: 'No such desk.', world };
  }
  if (ambition.convertedDesks.includes(cityId)) {
    return { ok: false, converted: false, reason: 'That desk is already converted.', world };
  }
  if (!deskIsOpen(world, cityId)) {
    return { ok: false, converted: false, reason: 'That desk is shut.', world };
  }
  const beat = world.beat ?? 0;
  if (ambition.lastMissionBeat === beat) {
    return { ok: false, converted: false, reason: 'A mission already rolled this beat.', world };
  }
  const chance = conversionChancePct(cityId);
  const roll = worldStream(world.worldSeed, `mission:${beat}:${cityId}`).int(0, 99);
  const converted = roll < chance;
  const mapName = WORLD_CITY_BY_ID[cityId]?.mapName ?? cityId;
  const nextDesks = converted ? [...ambition.convertedDesks, cityId] : ambition.convertedDesks;
  const register = converted
    ? `Mission holds at ${mapName}. Desk converted.`
    : `The mission does not hold at ${mapName}.`;
  const log = appendWorldLog(world.log, Object.freeze({
    beat,
    type: 'mission',
    body: register,
  }));
  return {
    ok: true,
    converted,
    reason: register,
    world: {
      ...world,
      stocks: { ...(world.stocks ?? emptyStocks()), bibles: (world.stocks?.bibles ?? 0) - 1 },
      ambition: {
        ...ambition,
        missionaries: ambition.missionaries - 1,
        convertedDesks: nextDesks,
        lastMissionBeat: beat,
      },
      log,
    },
  };
}

export function commissionOfficer(world) {
  const ambition = restoreAmbition(world.ambition);
  if (!liveInstitutions(world).officerSchool) {
    return { ok: false, reason: 'The city has no officer school.', world };
  }
  if (ambition.officers >= WORLD_OFFICER_CAP) {
    return { ok: false, reason: `Officers wait at cap (${WORLD_OFFICER_CAP}).`, world };
  }
  const paid = spend(world, WORLD_OFFICER_COST, { people: 1 });
  if (!paid.ok) return { ok: false, reason: paid.reason, world };
  worldStream(world.worldSeed, `commission-officer:${world.beat ?? 0}:${ambition.officers}`).int(0, 99);
  return {
    ok: true,
    reason: '',
    world: {
      ...world,
      treasuryCash: paid.treasuryCash,
      stocks: paid.stocks,
      ambition: { ...ambition, officers: ambition.officers + 1 },
    },
  };
}

export function stationBase(world, chokeId) {
  const ambition = restoreAmbition(world.ambition);
  if (!liveInstitutions(world).officerSchool) {
    return { ok: false, reason: 'The city has no officer school.', world };
  }
  const choke = WORLD_CHOKE_BY_ID[chokeId];
  if (!choke) return { ok: false, reason: 'No such choke.', world };
  if (ambition.stationedChokepoints.includes(chokeId)) {
    return { ok: false, reason: 'That choke is already stationed.', world };
  }
  if (ambition.officers < 1) return { ok: false, reason: 'Need 1 officer.', world };
  const navy = world.forces?.navy ?? 0;
  if (navy < 1) return { ok: false, reason: 'Need 1 navy force.', world };
  const paid = spend(world, WORLD_STATION_COST.cash, WORLD_STATION_COST.stocks);
  if (!paid.ok) return { ok: false, reason: paid.reason, world };
  const forces = { ...(world.forces ?? emptyForces()), navy: navy - 1 };
  const register = `Base stationed on ${choke.label}.`;
  const log = appendWorldLog(world.log, Object.freeze({
    beat: world.beat ?? 0,
    type: 'station',
    body: register,
  }));
  return {
    ok: true,
    reason: register,
    world: {
      ...world,
      treasuryCash: paid.treasuryCash,
      stocks: paid.stocks,
      forces,
      ambition: {
        ...ambition,
        officers: ambition.officers - 1,
        stationedChokepoints: [...ambition.stationedChokepoints, chokeId],
      },
      log,
    },
  };
}

function linkedCityIds(world) {
  const ids = new Set();
  for (const route of WORLD_TRADE_ROUTES) {
    if (!routeIsOpen(world, route.id)) continue;
    if (route.from === 'melbourne-inner') ids.add(route.to);
    if (route.to === 'melbourne-inner') ids.add(route.from);
  }
  return ids;
}

function listingNames(ambition) {
  return listedGoods(ambition)
    .map((good) => LISTING_LABEL[good] ?? good)
    .join(', ');
}

function firstWin(world, ambition) {
  if (ambition.won) return ambition.won;
  const beat = world.beat ?? 0;
  const listings = listedGoods(ambition);
  const institutions = liveInstitutions({ ...world, ambition });
  if (
    institutions.exchange
    && (ambition.tape ?? 0) >= WORLD_CASH_WIN
    && listings.length >= WORLD_LISTING_NEED
    && countedStartups({ ambition }) >= WORLD_STARTUP_WIN_COUNT
  ) {
    return {
      kind: 'financial',
      beat,
      register: `The tape prints ten trillion. Listed: ${listingNames(ambition)}.`,
    };
  }
  if (
    institutions.officerSchool
    && (ambition.stationedChokepoints ?? []).length >= WORLD_CHOKEPOINTS.length
  ) {
    return {
      kind: 'military',
      beat,
      register: 'Bases hold Hormuz, Suez, Bass Strait, and the Pacific lane.',
    };
  }
  if (ambition.marsParts.length >= WORLD_MARS_PARTS.length) {
    return { kind: 'wonder', beat, register: 'The Mars stack clears the yard. A wonder for the dark.' };
  }
  if (
    ambition.creed === WORLD_CULTURE_CREED
    && liveConvertedDesks({ ...world, ambition }).length >= WORLD_CULTURE_NEED
  ) {
    return {
      kind: 'culture',
      beat,
      register: 'Eight desks converted. The mission book is closed.',
    };
  }
  if (ambition.biomindBeats >= WORLD_BIOMIND_BEATS) {
    return { kind: 'tech', beat, register: 'The biomind wakes. Melbourne trained it.' };
  }
  return null;
}

function inboundTapeUnits(world, appliedLedger) {
  const consumed = appliedLedger?.consumedImports;
  if (!consumed || typeof consumed !== 'object' || Array.isArray(consumed)) return 0;
  const openInboundGoods = new Set();
  for (const route of WORLD_TRADE_ROUTES) {
    if (route.direction !== 'inbound' || !routeIsOpen(world, route.id)) continue;
    if (route.loan) continue;
    openInboundGoods.add(route.good);
  }
  let units = 0;
  for (const [good, count] of Object.entries(consumed)) {
    if (!openInboundGoods.has(good)) continue;
    if (!Number.isInteger(count) || count <= 0) continue;
    units += count;
  }
  return units;
}

function shipOutboundEvents(world) {
  const stocks = { ...(world.stocks ?? emptyStocks()) };
  const cityLots = { ...(world.ambition?.cityLots ?? {}) };
  const shipped = {};
  const books = [];
  const logRows = [];
  const held = [];
  let events = 0;
  let treasuryCash = world.treasuryCash ?? 0;
  const beat = world.beat ?? 0;
  for (const route of WORLD_TRADE_ROUTES) {
    if (route.direction !== 'outbound') continue;
    if (route.loan) continue;
    if (!routeIsOpen(world, route.id)) continue;
    const cap = Number.isInteger(route.capacity) && route.capacity > 0 ? route.capacity : 1;
    const have = stocks[route.good] ?? 0;
    const want = Math.min(cap, have);
    if (want <= 0) continue;
    const unitFee = handlingFeeForGood(route.good);
    let n = 0;
    while (n < want) {
      if (treasuryCash < unitFee) break;
      treasuryCash -= unitFee;
      n += 1;
    }
    if (n <= 0) {
      held.push({ routeId: route.id, good: route.good });
      continue;
    }
    stocks[route.good] = have - n;
    events += n;
    treasuryCash += n * exportCashForGood(route.good);
    books.push(Object.freeze({
      kind: 'export-shipment',
      routeId: route.id,
      good: route.good,
      count: n,
      beat,
    }));
    const lots = cityLots[route.good] ?? 0;
    const listed = Math.min(n, lots);
    if (listed > 0) {
      const remain = lots - listed;
      if (remain > 0) cityLots[route.good] = remain;
      else delete cityLots[route.good];
      shipped[route.good] = (shipped[route.good] ?? 0) + listed;
    }
  }
  if (held.length) logRows.push(dockHoldLogRow(beat, 'outbound', held.length, held[0]));
  return { stocks, shipped, events, treasuryCash, cityLots, books, logRows };
}

function outboundOfftakeFromLog(world) {
  const beat = world.beat ?? 0;
  let events = 0;
  const shipped = {};
  for (const entry of world.log ?? []) {
    if (entry?.kind !== 'export-shipment' || entry.beat !== beat) continue;
    const n = Number.isInteger(entry.count) && entry.count > 0 ? entry.count : 0;
    const listed = Number.isInteger(entry.listed) ? entry.listed : n;
    events += n;
    if (typeof entry.good === 'string' && listed > 0) {
      shipped[entry.good] = (shipped[entry.good] ?? 0) + listed;
    }
  }
  return { events, shipped };
}

export function tickAmbition(world, appliedLedger = null) {
  const ambition = restoreAmbition(world.ambition, world.beat ?? 0);
  const offtake = outboundOfftakeFromLog(world);
  const inboundUnits = inboundTapeUnits(world, appliedLedger);
  const creditOpen = routeIsOpen(world, 'credit-sydney-melbourne');
  const creditConsumed = Number.isInteger(appliedLedger?.consumedImports?.credit)
    && appliedLedger.consumedImports.credit >= 1;
  const tapeGain = (offtake.events * WORLD_EXPORT_TAPE)
    + (inboundUnits * WORLD_INBOUND_TAPE)
    + (creditOpen && creditConsumed ? WORLD_CREDIT_TAPE : 0);
  const treasuryCash = world.treasuryCash ?? 0;
  const influence = { ...ambition.influence };
  if (ambition.creed) {
    for (const cityId of linkedCityIds(world)) {
      influence[cityId] = Math.min(100, (influence[cityId] ?? 0) + 12);
    }
  }
  const shipped = { ...ambition.shipped };
  for (const [good, count] of Object.entries(offtake.shipped)) {
    shipped[good] = (shipped[good] ?? 0) + count;
  }
  let biomindBeats = ambition.biomindBeats;
  let biomindDelayRemaining = ambition.biomindDelayRemaining ?? 0;
  let biomindTraining = ambition.biomindTraining;
  if (biomindTraining) {
    if (biomindDelayRemaining > 0) biomindDelayRemaining -= 1;
    else biomindBeats += 1;
  }
  const biomindJustClosed = biomindTraining && biomindBeats >= WORLD_BIOMIND_BEATS;
  if (biomindJustClosed) biomindTraining = false;
  const log = appendWorldLog(world.log, [
    biomindJustClosed
      ? Object.freeze({
        beat: world.beat ?? 0,
        type: 'biomind',
        body: 'The biomind wakes. Melbourne trained it.',
      })
      : null,
  ]);
  const nextAmbition = {
    ...ambition,
    tape: ambition.tape + tapeGain,
    influence,
    shipped,
    cityLots: ambition.cityLots,
    biomindBeats,
    biomindTraining,
    biomindDelayRemaining,
  };
  const draft = {
    ...world,
    treasuryCash,
    stocks: world.stocks,
    log,
    ambition: nextAmbition,
  };
  nextAmbition.won = firstWin(draft, nextAmbition);
  return { ...draft, ambition: nextAmbition };
}

export { booksGuardedByStationedChokes };
