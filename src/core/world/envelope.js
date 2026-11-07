// District Deck — versioned world envelope. Checksum is local hash32; never import landing.
// Storage key names (pass a store object; these modules do not touch DOM):
//   district-deck:v332:world-run
//   district-deck:v332:city-run:${cityId}
// World modules never read or write district-deck:v305:last-run.

import { hash32 } from '../rng.js';
import {
  appendWorldLog,
  WORLD_CITIES,
  WORLD_CITY_STATE_VERSION,
  WORLD_CITY_STATUSES,
  WORLD_PROTOCOL,
  WORLD_SIM_REVISION,
  WORLD_STATE_VERSION,
  WORLD_TREASURY_START,
} from './catalog.js';
import { citySeed } from './seed.js';
import { advanceWorldTrade, openTradeRoute, restoreWorldPulses, restoreWorldRoutes, seedWorldTrade } from './trade.js';
import {
  advanceWorldDisasters,
  mineDesksHalted,
  repairFire,
  restoreWorldDisasters,
  rollDisaster,
} from './disasters.js';
import { CITY_EXPORTS_QUEUE_CAP, latestCityExportsPayload, parseCityExportsQueue } from '../city-exports.js';
import {
  dropSpentBuildKits,
  kitAlreadyShippedReason,
  kitStaleReason,
  readCityExportsKitWatermark,
  readCityRunIdFromExports,
} from '../build-kits.js';
import {
  applyCityExportsToStocks, emptyForces, emptyShipyard, emptyStocks, raiseForce,
  restoreForces, restoreShipyard, restoreStocks, tickShipyard,
} from './forces.js';
import { applyProcessDraws, setMineMake, tickWorldMines, tickWorldWorks } from './processes.js';
import {
  addAdmittedCityLots, addCityLots, buildMarsPart, clampCityLots, commissionOfficer, emptyAmbition, feedBiomind, foundCreed, ledgerApplies,
  ledgerIdentity, openMarsDesk, restoreAmbition, sendMission, shipBuildKit, snapshotInstitutions, trainBiomind,
  stationBase, tickAmbition, trainMissionary,
} from './ambition.js';
import {
  applyShipmentDisasterLoss,
  emptyShipments,
  restoreShipments,
  tickShipmentDepartures,
  tickShipmentProgress,
} from './shipments.js';
import {
  mergePortFullIntoLog,
  portFullLogRow,
  portOccupancy,
  restorePort,
  seedPort,
} from './port-storage.js';
import {
  advanceWorldThreats,
  emptyFacilities,
  emptyThreats,
  repairFacilityDamage,
  restoreFacilities,
  restoreWorldThreats,
  withDamagedPortCapacity,
} from './threats.js';

const MAX_UINT32 = 0xffffffff;
const CITY_STATUS_SET = new Set(WORLD_CITY_STATUSES);

const WORLD_BODY_KEYS = new Set([
  'protocol',
  'worldStateVersion',
  'stateVersion',
  'simRevision',
  'worldSeed',
  'beat',
  'treasuryCash',
  'romanPolicyId',
  'cities',
  'requests',
  'routes',
  'pulses',
  'disasters',
  'log',
  'stocks',
  'forces',
  'ambition',
  'shipments',
  'port',
  'threats',
  'shipyard',
  'facilities',
]);

const CITY_KEYS = new Set([
  'seed',
  'status',
  'romanPresent',
  'allocationCash',
  'nav',
  'rivalNav',
  'ratings',
  'lastQuarter',
  'lastBeat',
]);

const RATINGS_KEYS = new Set(['prosperity', 'culture', 'peace']);

export const WORLD_RUN_KEY = 'district-deck:v332:world-run';
export const CITY_EXPORTS_KEY = 'district-deck:v332:city-exports:melbourne';

export function cityRunKey(cityId) {
  return `district-deck:v332:city-run:${cityId}`;
}

/** Same get/set/remove contract as landing browserStore, copied — not imported. */
export const worldStore = {
  get(key) {
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  },
  set(key, value) {
    try { globalThis.localStorage?.setItem(key, value); return true; } catch { return false; }
  },
  remove(key) {
    try { globalThis.localStorage?.removeItem(key); } catch { /* optional storage */ }
  },
};

export function worldStoreGet(key, store = worldStore) {
  try { return store.get(key) ?? null; } catch { return null; }
}

export function worldStoreSet(key, value, store = worldStore) {
  try { return store.set(key, value); } catch { return false; }
}

export function worldStoreRemove(key, store = worldStore) {
  try { store.remove(key); } catch { /* optional storage */ }
}

export function readCityExportsQueue(store = worldStore) {
  const raw = worldStoreGet(CITY_EXPORTS_KEY, store);
  if (!raw) return [];
  try {
    const parsed = parseCityExportsQueue(JSON.parse(raw));
    return parsed ?? [];
  } catch {
    return [];
  }
}

/** Latest queued payload (current city snapshot). Legacy single-object stores still parse. */
export function readCityExports(store = worldStore) {
  return latestCityExportsPayload(readCityExportsQueue(store));
}

export function discardStrayCityRun(cityId, store = worldStore) {
  worldStoreRemove(cityRunKey(cityId), store);
}

export function canonicalWorld(value) {
  const canonicalise = (item) => {
    if (Array.isArray(item)) return item.map(canonicalise);
    if (item === null || typeof item !== 'object') return item;
    return Object.keys(item).sort().reduce((record, key) => {
      if (item[key] !== undefined) record[key] = canonicalise(item[key]);
      return record;
    }, {});
  };
  return JSON.stringify(canonicalise(value));
}

export function checksumWorld(canonical) {
  if (typeof canonical !== 'string') throw new TypeError('canonical world must be a string.');
  return hash32(canonical).toString(16);
}

function requireUint32(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_UINT32) {
    throw new RangeError(`${label} must be a uint32.`);
  }
  return value;
}

function requireNonNegativeInt(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer.`);
  }
  return value;
}

function requireIntOrNull(value, label) {
  if (value === null) return null;
  if (!Number.isInteger(value)) throw new RangeError(`${label} must be an integer or null.`);
  return value;
}

function worldBody(world) {
  if (!world || typeof world !== 'object' || Array.isArray(world)) {
    throw new TypeError('World must be an object.');
  }
  const body = { ...world };
  delete body.checksum;
  return body;
}

function restoreRatings(ratings) {
  if (ratings === null) return null;
  if (!ratings || typeof ratings !== 'object' || Array.isArray(ratings)) {
    throw new TypeError('City ratings must be an object or null.');
  }
  for (const key of Object.keys(ratings)) {
    if (!RATINGS_KEYS.has(key)) throw new Error(`Unsupported ratings field: ${key}`);
  }
  for (const key of RATINGS_KEYS) {
    if (!Number.isInteger(ratings[key]) || ratings[key] < 0 || ratings[key] > 100) {
      throw new RangeError(`City ratings.${key} must be an integer 0–100.`);
    }
  }
  return {
    prosperity: ratings.prosperity,
    culture: ratings.culture,
    peace: ratings.peace,
  };
}

function restoreCity(cityId, record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError(`World city ${cityId} must be an object.`);
  }
  for (const key of Object.keys(record)) {
    if (!CITY_KEYS.has(key)) throw new Error(`Unsupported city field: ${key}`);
  }
  if (!CITY_STATUS_SET.has(record.status)) {
    throw new RangeError(`World city ${cityId} has an unsupported status.`);
  }
  if (typeof record.romanPresent !== 'boolean') {
    throw new TypeError(`World city ${cityId} romanPresent must be boolean.`);
  }
  const allocationCash = requireIntOrNull(record.allocationCash, `${cityId}.allocationCash`);
  if (record.status === 'in-play' && (allocationCash === null || allocationCash < 0)) {
    throw new RangeError(`World city ${cityId} in-play requires allocationCash.`);
  }
  return {
    seed: requireUint32(record.seed, `${cityId}.seed`),
    status: record.status,
    romanPresent: record.romanPresent,
    allocationCash,
    nav: requireIntOrNull(record.nav, `${cityId}.nav`),
    rivalNav: requireIntOrNull(record.rivalNav, `${cityId}.rivalNav`),
    ratings: restoreRatings(record.ratings ?? null),
    lastQuarter: requireIntOrNull(record.lastQuarter, `${cityId}.lastQuarter`),
    lastBeat: requireIntOrNull(record.lastBeat, `${cityId}.lastBeat`),
  };
}

function restoreWorld(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new TypeError('World body must be an object.');
  }
  for (const key of Object.keys(body)) {
    if (!WORLD_BODY_KEYS.has(key)) throw new Error(`Unsupported world field: ${key}`);
  }
  if (body.protocol !== WORLD_PROTOCOL) {
    throw new Error('The world protocol is not supported.');
  }
  if (body.worldStateVersion !== WORLD_STATE_VERSION) {
    throw new Error(`The world uses state version ${String(body.worldStateVersion)}; this build supports ${WORLD_STATE_VERSION}.`);
  }
  if (body.stateVersion !== WORLD_CITY_STATE_VERSION) {
    throw new Error(`The world uses city state version ${String(body.stateVersion)}; this build supports ${WORLD_CITY_STATE_VERSION}.`);
  }
  if (body.simRevision !== WORLD_SIM_REVISION) {
    throw new Error(`The world uses simulation revision ${String(body.simRevision)}; this build supports ${WORLD_SIM_REVISION}.`);
  }
  if (body.romanPolicyId !== 'value') {
    throw new RangeError('World romanPolicyId must be value.');
  }
  if (!body.cities || typeof body.cities !== 'object' || Array.isArray(body.cities)) {
    throw new TypeError('World cities must be a record.');
  }
  for (const kind of ['requests', 'pulses', 'log']) {
    if (!Array.isArray(body[kind])) throw new TypeError(`World ${kind} must be an array.`);
  }
  if (body.disasters != null && !Array.isArray(body.disasters)) {
    throw new TypeError('World disasters must be an array.');
  }
  const routes = restoreWorldRoutes(body.routes);
  const pulses = restoreWorldPulses(body.pulses);
  const disasters = restoreWorldDisasters(body.disasters);
  const shipments = restoreShipments(body.shipments);
  const threats = restoreWorldThreats(body.threats);
  const shipyard = restoreShipyard(body.shipyard);
  const facilities = restoreFacilities(body.facilities);
  const worldSeed = requireUint32(body.worldSeed, 'worldSeed');

  const cities = {};
  let inPlay = 0;
  for (const city of WORLD_CITIES) {
    if (!body.cities[city.id]) {
      cities[city.id] = {
        seed: citySeed(worldSeed, city.id),
        status: city.startStatus,
        romanPresent: city.romanStart,
        allocationCash: null,
        nav: null,
        rivalNav: null,
        ratings: null,
        lastQuarter: null,
        lastBeat: null,
      };
      continue;
    }
    cities[city.id] = restoreCity(city.id, body.cities[city.id]);
    if (cities[city.id].status === 'in-play') inPlay += 1;
  }
  for (const id of Object.keys(body.cities)) {
    if (!cities[id]) continue;
  }
  if (inPlay > 1) throw new Error('At most one city may be in-play.');

  const beat = requireNonNegativeInt(body.beat, 'beat');
  return {
    protocol: WORLD_PROTOCOL,
    worldStateVersion: WORLD_STATE_VERSION,
    stateVersion: WORLD_CITY_STATE_VERSION,
    simRevision: WORLD_SIM_REVISION,
    worldSeed,
    beat,
    treasuryCash: requireNonNegativeInt(body.treasuryCash, 'treasuryCash'),
    romanPolicyId: 'value',
    cities,
    requests: structuredClone(body.requests),
    routes,
    pulses,
    disasters,
    log: structuredClone(body.log),
    stocks: restoreStocks(body.stocks),
    forces: restoreForces(body.forces),
    ambition: restoreAmbition(body.ambition, beat),
    shipments,
    port: restorePort(body.port),
    threats,
    shipyard,
    facilities,
  };
}

export function createWorldRun({ worldSeed } = {}) {
  requireUint32(worldSeed, 'worldSeed');
  const cities = {};
  for (const city of WORLD_CITIES) {
    cities[city.id] = {
      seed: citySeed(worldSeed, city.id),
      status: city.startStatus,
      romanPresent: city.romanStart,
      allocationCash: null,
      nav: null,
      rivalNav: null,
      ratings: null,
      lastQuarter: null,
      lastBeat: null,
    };
  }
  return {
    protocol: WORLD_PROTOCOL,
    worldStateVersion: WORLD_STATE_VERSION,
    stateVersion: WORLD_CITY_STATE_VERSION,
    simRevision: WORLD_SIM_REVISION,
    worldSeed,
    beat: 0,
    treasuryCash: WORLD_TREASURY_START,
    romanPolicyId: 'value',
    cities,
    // Geelong’s capital request is a consequence of Melbourne return, not create.
    requests: [],
    ...seedWorldTrade(worldSeed),
    disasters: [],
    stocks: emptyStocks(),
    forces: emptyForces(),
    ambition: emptyAmbition(),
    shipments: emptyShipments(),
    port: seedPort(),
    threats: emptyThreats(),
    shipyard: emptyShipyard(),
    facilities: emptyFacilities(),
  };
}

function observedBuildKits(ambition, payload) {
  if (!payload) return ambition.buildKits ?? {};
  return dropSpentBuildKits(
    ambition.buildKits,
    payload.kitSeqWatermark ?? {},
    payload.runId,
  );
}

function observeProcessDraws(world, payload, stocks, watermark, processDrawRunId, stockQuality) {
  const drawn = applyProcessDraws(
    stocks,
    payload,
    watermark ?? {},
    world.beat ?? 0,
    processDrawRunId ?? null,
    stockQuality ?? null,
    world,
  );
  return {
    stocks: drawn.stocks,
    watermark: drawn.watermark,
    processDrawRunId: drawn.processDrawRunId ?? processDrawRunId ?? null,
    stockQuality: drawn.stockQuality ?? stockQuality ?? {},
    log: drawn.events.length ? appendWorldLog(world.log, drawn.events) : world.log,
  };
}

export function applyCityLedger(world, store = worldStore) {
  // ONE SETTLE FEEDS ONE BEAT: a beat applies the oldest unapplied quarter
  // and leaves the rest queued. Live kit/process echoes ride the latest entry.
  const queue = readCityExportsQueue(store);
  const latest = latestCityExportsPayload(queue);
  const ambition = restoreAmbition(world.ambition, world.beat ?? 0);
  const payload = queue.find((entry) => ledgerApplies(entry, ambition)) ?? null;
  if (!payload) {
    // Even with nothing to apply, restored or stale lots may exceed physical
    // stock (a spend or a hand-rolled save) — clamp before the tick ships.
    // Spent kit vouchers still drop when the latest city watermark is observed.
    // processDraws do NOT apply on this path — a spent quarter must not mint.
    return {
      world: {
        ...world,
        stocks: world.stocks,
        log: world.log,
        port: world.port ?? seedPort(),
        ambition: {
          ...ambition,
          cityLots: clampCityLots(ambition.cityLots, world.stocks),
          buildKits: observedBuildKits(ambition, latest),
        },
      },
      applied: null,
    };
  }
  const identity = ledgerIdentity(payload);
  const beforeStocks = world.stocks;
  const facilities = payload.defence
    ? {
      ...restoreFacilities(world.facilities),
      defence: payload.defence,
    }
    : restoreFacilities(world.facilities);
  const restoredPort = payload.portStorage
    ? restorePort(payload.portStorage)
    : (world.port ?? seedPort());
  const nextPort = withDamagedPortCapacity(
    restoredPort,
    { ...world, facilities },
    world.beat ?? 0,
  );
  const fedStocks = applyCityExportsToStocks(world.stocks, payload, nextPort);
  const heldCity = fedStocks.heldCity ?? {};
  // Lots are granted only for crates the capped admission actually added.
  const admitted = addAdmittedCityLots(ambition.cityLots, beforeStocks, fedStocks);
  const goods = {};
  for (const [yardGood, after] of Object.entries(fedStocks)) {
    const delta = after - (beforeStocks?.[yardGood] ?? 0);
    if (delta > 0) goods[yardGood] = delta;
  }
  let admissionLog = Object.keys(goods).length
    ? appendWorldLog(world.log, Object.freeze({
      kind: 'city-admission',
      goods: Object.freeze(goods),
      beat: world.beat ?? 0,
    }))
    : world.log;
  const occupancy = portOccupancy({ ...world, stocks: fedStocks, port: nextPort });
  for (const [cls, count] of Object.entries(heldCity)) {
    if (!Number.isInteger(count) || count < 1) continue;
    const slot = occupancy.byClass[cls];
    if (!slot) continue;
    admissionLog = mergePortFullIntoLog(admissionLog, portFullLogRow({
      beat: world.beat ?? 0,
      cls,
      used: slot.used,
      cap: slot.cap,
      held: 0,
      heldCity: count,
    }));
  }
  const drawn = observeProcessDraws(
    { ...world, log: admissionLog },
    payload,
    fedStocks,
    ambition.processDrawWatermark,
    ambition.processDrawRunId,
    ambition.stockQuality,
  );
  // Process-made deposits (gives) are city production — mint lots for the
  // crates the capped give actually landed, then clamp to physical stock.
  const lotsAfterGives = addAdmittedCityLots(admitted, fedStocks, drawn.stocks);
  return {
    world: {
      ...world,
      stocks: drawn.stocks,
      log: drawn.log,
      port: nextPort,
      facilities,
      ambition: {
        ...ambition,
        institutions: snapshotInstitutions(payload.institutions),
        educationSeats: Number.isInteger(payload.goods?.educationSeats)
          ? payload.goods.educationSeats
          : 0,
        lastLedgerRunId: payload.runId,
        lastLedgerQuarter: payload.quarter,
        lastLedgerApplied: identity,
        lastLedgerAppliedBeat: world.beat ?? 0,
        biolabCount: Number.isInteger(payload.biolabCount)
          ? payload.biolabCount
          : (payload.institutions?.biolab === true ? 1 : 0),
        startupValuations: Array.isArray(payload.startupValuations)
          ? [...payload.startupValuations]
          : [],
        cityLots: clampCityLots(lotsAfterGives, drawn.stocks),
        buildKits: observedBuildKits(ambition, payload),
        processDrawWatermark: drawn.watermark,
        processDrawRunId: drawn.processDrawRunId ?? payload.runId,
        stockQuality: drawn.stockQuality ?? ambition.stockQuality ?? {},
      },
    },
    applied: payload,
  };
}

export function advanceAndStoreWorld(world, store = worldStore) {
  const nextBeat = (world.beat ?? 0) + 1;
  const preview = rollDisaster(world.worldSeed, nextBeat, { ...world, beat: nextBeat });
  const skipPulseDesks = preview ? new Set([preview.deskId]) : new Set();
  const advanced = advanceWorldTrade(world, { skipPulseDesks });
  const disastered = advanceWorldDisasters(advanced);
  const launched = tickShipyard(disastered);
  const threatened = advanceWorldThreats(launched);
  const mined = tickWorldMines(threatened, { haltMineDesks: mineDesksHalted(threatened) });
  const afterMine = {
    ...threatened,
    stocks: mined.stocks,
    treasuryCash: mined.treasuryCash,
    ambition: {
      ...(threatened.ambition ?? {}),
      mineMake: mined.mineMake,
      mineRuns: mined.mineRuns,
      mineRunIndex: mined.mineRunIndex,
      mineImportBlock: mined.importBlock,
    },
  };
  const worked = tickWorldWorks(afterMine, { haltMineDesks: mineDesksHalted(threatened) });
  const afterWorks = {
    ...afterMine,
    stocks: worked.stocks,
    treasuryCash: worked.treasuryCash,
    ambition: {
      ...(afterMine.ambition ?? {}),
      worksRuns: worked.worksRuns,
      worksRunIndex: worked.worksRunIndex,
    },
  };
  const harvestEvents = [];
  const stripped = applyShipmentDisasterLoss(afterWorks);
  const progressed = tickShipmentProgress(stripped, harvestEvents);
  const harvested = {
    ...progressed.world,
    // Mine rows last so a busy harvest beat cannot evict this shift's copy.
    log: appendWorldLog(threatened.log, [
      ...harvestEvents,
      ...progressed.logRows,
      ...mined.logRows,
      ...mined.events,
      ...worked.logRows,
      ...worked.events,
    ]),
  };
  const { world: fed, applied } = applyCityLedger(harvested, store);
  const departed = tickShipmentDepartures(fed);
  const logged = {
    ...departed.world,
    log: appendWorldLog(departed.world.log, departed.logRows),
  };
  const next = tickAmbition(reconcileCityLots(logged), applied);
  worldStoreSet(WORLD_RUN_KEY, serialiseWorld(next), store);
  return next;
}

/** City settle → one world beat, exactly once per unapplied quarter watermark. */
export function advanceWorldOnCitySettle(store = worldStore) {
  const raw = worldStoreGet(WORLD_RUN_KEY, store);
  if (!raw) return { advanced: false, world: null };
  const inspected = inspectWorldRun(raw);
  if (inspected.status !== 'valid' || !inspected.world) {
    return { advanced: false, world: null };
  }
  const world = inspected.world;
  const queue = readCityExportsQueue(store);
  const pending = queue.find((entry) => ledgerApplies(entry, world.ambition));
  if (!pending) return { advanced: false, world };
  const next = advanceAndStoreWorld(world, store);
  return { advanced: true, world: next };
}

/** First globe create after city-only settles: drain the unapplied queue, one beat each. */
export function catchUpPendingSettles(world, store = worldStore) {
  let next = world;
  const cap = Number.isInteger(CITY_EXPORTS_QUEUE_CAP) ? CITY_EXPORTS_QUEUE_CAP : 8;
  for (let i = 0; i < cap; i += 1) {
    const queue = readCityExportsQueue(store);
    const pending = queue.find((entry) => ledgerApplies(entry, next.ambition));
    if (!pending) break;
    next = advanceAndStoreWorld(next, store);
  }
  return next;
}

export function setMineMakeAndStore(world, deskId, on, store = worldStore) {
  const result = setMineMake(world, deskId, on);
  if (result.ok) worldStoreSet(WORLD_RUN_KEY, serialiseWorld(result.world), store);
  return result;
}

/** Any action that spent Yard stock may strand lots above stock — reconcile before storing. */
function reconcileCityLots(world) {
  const ambition = restoreAmbition(world.ambition, world.beat ?? 0);
  return { ...world, ambition: { ...ambition, cityLots: clampCityLots(ambition.cityLots, world.stocks) } };
}

export function raiseAndStoreForce(world, kind, store = worldStore) {
  const result = raiseForce(world, kind);
  if (!result.ok) return result;
  const reconciled = reconcileCityLots(result.world);
  worldStoreSet(WORLD_RUN_KEY, serialiseWorld(reconciled), store);
  return { ...result, world: reconciled };
}

export function openAndStoreTrade(world, routeId, store = worldStore) {
  const result = openTradeRoute(world, routeId);
  if (result.ok) worldStoreSet(WORLD_RUN_KEY, serialiseWorld(result.world), store);
  return result;
}

export function repairAndStoreFire(world, disasterId, store = worldStore) {
  const result = repairFire(world, disasterId);
  if (result.ok && worldStoreSet(WORLD_RUN_KEY, serialiseWorld(result.world), store) !== true) {
    return { ...result, ok: false, reason: 'World repair could not be saved.', world };
  }
  return result;
}

export function repairAndStoreFacility(world, facilityKey, store = worldStore) {
  const result = repairFacilityDamage(world, facilityKey);
  if (result.ok && worldStoreSet(WORLD_RUN_KEY, serialiseWorld(result.world), store) !== true) {
    return { ...result, ok: false, reason: 'World repair could not be saved.', world };
  }
  return result;
}

function storeAmbitionResult(result, store) {
  if (!result.ok) return result;
  const reconciled = reconcileCityLots(result.world);
  const written = worldStoreSet(WORLD_RUN_KEY, serialiseWorld(reconciled), store);
  if (written === false) {
    return { ok: false, reason: 'The world could not be recorded.', world: result.world };
  }
  return { ...result, world: reconciled };
}

export function foundAndStoreCreed(world, creedId, store = worldStore) {
  return storeAmbitionResult(foundCreed(world, creedId), store);
}

export function startAndStoreBiomind(world, store = worldStore) {
  return storeAmbitionResult(trainBiomind(world), store);
}

export function feedAndStoreBiomind(world, good = null, store = worldStore) {
  return storeAmbitionResult(feedBiomind(world, good), store);
}

export function openAndStoreMars(world, store = worldStore) {
  return storeAmbitionResult(openMarsDesk(world), store);
}

export function buildAndStoreMarsPart(world, partId, store = worldStore) {
  return storeAmbitionResult(buildMarsPart(world, partId), store);
}

export function trainAndStoreMissionary(world, store = worldStore) {
  return storeAmbitionResult(trainMissionary(world), store);
}

export function sendAndStoreMission(world, cityId, store = worldStore) {
  return storeAmbitionResult(sendMission(world, cityId), store);
}

export function commissionAndStoreOfficer(world, store = worldStore) {
  return storeAmbitionResult(commissionOfficer(world), store);
}

export function stationAndStoreBase(world, chokeId, store = worldStore) {
  return storeAmbitionResult(stationBase(world, chokeId), store);
}

export function shipAndStoreBuildKit(world, institutionId, store = worldStore) {
  const runId = readCityRunIdFromExports(store);
  if (typeof runId !== 'string' || runId.length === 0) {
    return { ok: false, reason: 'No city run is in play.', world };
  }
  const observed = readCityExportsKitWatermark(store);
  if (observed.runId && observed.runId !== runId) {
    return { ok: false, reason: kitStaleReason(), world };
  }
  const ambition = restoreAmbition(world.ambition, world.beat ?? 0);
  const liveKits = dropSpentBuildKits(ambition.buildKits, observed.kitSeqWatermark);
  const outstanding = liveKits[institutionId];
  if (outstanding && outstanding.runId !== runId) {
    return { ok: false, reason: kitStaleReason(), world };
  }
  if (outstanding) {
    return { ok: false, reason: kitAlreadyShippedReason(institutionId), world };
  }
  const result = shipBuildKit(
    { ...world, ambition: { ...ambition, buildKits: liveKits } },
    institutionId,
    runId,
  );
  if (!result.ok) return result;
  const stored = storeAmbitionResult(result, store);
  if (!stored.ok) return { ok: false, reason: stored.reason, world };
  return stored;
}

export function serialiseWorld(world) {
  const body = restoreWorld(worldBody(world));
  const canonical = canonicalWorld(body);
  const envelope = JSON.parse(canonical);
  envelope.checksum = checksumWorld(canonical);
  return JSON.stringify(envelope);
}

export function inspectWorldRun(rawEnvelope) {
  if (rawEnvelope === null || rawEnvelope === undefined || rawEnvelope === '') {
    return { status: 'missing', reason: '', world: null };
  }
  let envelope;
  try {
    envelope = typeof rawEnvelope === 'string' ? JSON.parse(rawEnvelope) : structuredClone(rawEnvelope);
  } catch {
    return { status: 'invalid', reason: 'The world envelope is not valid JSON.', world: null };
  }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return { status: 'invalid', reason: 'The world envelope is not an object.', world: null };
  }
  if (envelope.protocol !== WORLD_PROTOCOL) {
    return { status: 'invalid', reason: 'The world protocol is not supported.', world: null };
  }
  if (envelope.worldStateVersion !== WORLD_STATE_VERSION) {
    return {
      status: 'invalid',
      reason: `The world uses state version ${String(envelope.worldStateVersion)}; this build supports ${WORLD_STATE_VERSION}.`,
      world: null,
    };
  }
  if (envelope.stateVersion !== WORLD_CITY_STATE_VERSION) {
    return {
      status: 'invalid',
      reason: `The world uses city state version ${String(envelope.stateVersion)}; this build supports ${WORLD_CITY_STATE_VERSION}.`,
      world: null,
    };
  }
  if (envelope.simRevision !== WORLD_SIM_REVISION) {
    return {
      status: 'invalid',
      reason: `The world uses simulation revision ${String(envelope.simRevision)}; this build supports ${WORLD_SIM_REVISION}.`,
      world: null,
    };
  }
  if (typeof envelope.checksum !== 'string') {
    return { status: 'invalid', reason: 'The world checksum is missing.', world: null };
  }
  const { checksum, ...body } = envelope;
  const canonical = canonicalWorld(body);
  if (checksum !== checksumWorld(canonical)) {
    return { status: 'invalid', reason: 'The world checksum does not match its body.', world: null };
  }
  try {
    return { status: 'valid', reason: '', world: restoreWorld(body) };
  } catch (error) {
    return {
      status: 'invalid',
      reason: `The world envelope could not be restored: ${error.message}`,
      world: null,
    };
  }
}
