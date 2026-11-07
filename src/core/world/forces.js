// Harvest crates from open books; raise army / navy / air. No city engine.

import {
  appendWorldLog,
  CITY_EXPORT_TO_YARD,
  dockHoldLogRow,
  FORCE_BUILD_BEATS,
  handlingFeeForGood,
  WORLD_FORCE_KINDS,
  WORLD_FORCE_RECIPES,
  WORLD_GOODS,
  WORLD_SHIPYARD_KINDS,
  WORLD_TRADE_ROUTES,
} from './catalog.js';
import { routeIsOpen } from './trade.js';
import { mineMakeBlocksImport } from './processes.js';
import {
  attachHeldCity,
  portCapacity,
  portFullLogRow,
  portHasRoom,
  portOccupancy,
  portStorageClass,
} from './port-storage.js';

const STOCK_CAP = 99;

export function emptyStocks() {
  return Object.fromEntries(WORLD_GOODS.map((good) => [good, 0]));
}

export function emptyForces() {
  return Object.fromEntries(WORLD_FORCE_KINDS.map((kind) => [kind, 0]));
}

export function restoreStocks(stocks) {
  const empty = emptyStocks();
  if (stocks == null) return empty;
  if (!stocks || typeof stocks !== 'object' || Array.isArray(stocks)) {
    throw new TypeError('World stocks must be a record.');
  }
  const restored = { ...empty };
  for (const key of Object.keys(stocks)) {
    if (!(key in empty)) continue;
    const value = stocks[key];
    if (!Number.isInteger(value) || value < 0 || value > STOCK_CAP) {
      throw new RangeError(`World stocks.${key} must be an integer 0–${STOCK_CAP}.`);
    }
    restored[key] = value;
  }
  return restored;
}

export function restoreForces(forces) {
  const empty = emptyForces();
  if (forces == null) return empty;
  if (!forces || typeof forces !== 'object' || Array.isArray(forces)) {
    throw new TypeError('World forces must be a record.');
  }
  const restored = { ...empty };
  for (const key of Object.keys(forces)) {
    if (!(key in empty)) throw new Error(`Unknown world force: ${key}`);
    const value = forces[key];
    if (!Number.isInteger(value) || value < 0 || value > STOCK_CAP) {
      throw new RangeError(`World forces.${key} must be an integer 0–${STOCK_CAP}.`);
    }
    restored[key] = value;
  }
  return restored;
}

export function harvestInbound(world, events = null) {
  const stocks = { ...(world.stocks ?? emptyStocks()) };
  let treasuryCash = world.treasuryCash ?? 0;
  const beat = world.beat ?? 0;
  const logRows = [];
  const held = [];
  const storageHeld = [];
  for (const route of WORLD_TRADE_ROUTES) {
    if (route.direction !== 'inbound') continue;
    if (!routeIsOpen(world, route.id)) continue;
    if (route.loan) continue;
    if (!route.playerOpenable && route.good !== 'asylum') continue;
    if (mineMakeBlocksImport(world, route.good)) continue;
    const fee = handlingFeeForGood(route.good);
    if (treasuryCash < fee) {
      held.push({ routeId: route.id, good: route.good });
      continue;
    }
    if (!portHasRoom({ ...world, stocks }, route.good)) {
      storageHeld.push({ routeId: route.id, good: route.good, reason: 'storage-full' });
      continue;
    }
    const before = stocks[route.good] ?? 0;
    const after = Math.min(STOCK_CAP, before + 1);
    if (after <= before) continue;
    treasuryCash -= fee;
    stocks[route.good] = after;
    events?.push(Object.freeze({
      kind: 'harvest',
      routeId: route.id,
      good: route.good,
      beat,
    }));
  }
  if (held.length) logRows.push(dockHoldLogRow(beat, 'inbound', held.length, held[0]));
  const storageByClass = { yard: 0, warehouse: 0, tank: 0 };
  for (const hold of storageHeld) {
    const cls = portStorageClass(hold.good);
    if (cls === 'passenger') continue;
    storageByClass[cls] += 1;
  }
  const occupancy = portOccupancy({ ...world, stocks });
  for (const cls of ['yard', 'warehouse', 'tank']) {
    const heldCount = storageByClass[cls];
    if (!Number.isInteger(heldCount) || heldCount < 1) continue;
    const slot = occupancy.byClass[cls];
    logRows.push(portFullLogRow({
      beat,
      cls,
      used: slot.used,
      cap: slot.cap,
      held: heldCount,
    }));
  }
  return { stocks, treasuryCash, logRows };
}

export function harvestStocks(world, events = null) {
  return harvestInbound(world, events).stocks;
}

export function applyCityExportsToStocks(stocks, cityExports, port) {
  const next = { ...(stocks ?? emptyStocks()) };
  const goods = cityExports?.goods;
  if (!goods || typeof goods !== 'object' || Array.isArray(goods)) {
    return port == null ? next : attachHeldCity(next, {});
  }
  if (port == null) {
    for (const [cityGood, amount] of Object.entries(goods)) {
      if (!Number.isInteger(amount) || amount <= 0) continue;
      const yardGood = CITY_EXPORT_TO_YARD[cityGood];
      if (!yardGood) continue;
      next[yardGood] = Math.min(STOCK_CAP, (next[yardGood] ?? 0) + amount);
    }
    return next;
  }
  const cap = portCapacity(port);
  const used = { yard: 0, warehouse: 0, tank: 0 };
  for (const good of WORLD_GOODS) {
    const cls = portStorageClass(good);
    if (cls === 'passenger') continue;
    used[cls] += next[good] ?? 0;
  }
  const heldCity = { yard: 0, warehouse: 0, tank: 0 };
  for (const [cityGood, amount] of Object.entries(goods)) {
    if (!Number.isInteger(amount) || amount <= 0) continue;
    const yardGood = CITY_EXPORT_TO_YARD[cityGood];
    if (!yardGood) continue;
    const cls = portStorageClass(yardGood);
    for (let i = 0; i < amount; i += 1) {
      const before = next[yardGood] ?? 0;
      if (before >= STOCK_CAP) break;
      if (cls !== 'passenger' && used[cls] >= cap[cls]) {
        heldCity[cls] += 1;
        continue;
      }
      next[yardGood] = before + 1;
      if (cls !== 'passenger') used[cls] += 1;
    }
  }
  return attachHeldCity(next, heldCity);
}

export function canRaiseForce(world, kind) {
  const recipe = WORLD_FORCE_RECIPES[kind];
  if (!recipe) return { ok: false, reason: 'No such wing.', fee: 0 };
  if (recipe.age === 'space') {
    return { ok: false, reason: 'Space age is catalogued. Not this sitting.', fee: recipe.cash };
  }
  if ((world.ambition?.officers ?? 0) < 1) {
    return {
      ok: false,
      reason: 'Need 1 trained officer. Commission one at the officer school.',
      fee: recipe.cash,
    };
  }
  if ((world.treasuryCash ?? 0) < recipe.cash) {
    return {
      ok: false,
      reason: `Head office needs $${recipe.cash.toLocaleString('en-AU')}.`,
      fee: recipe.cash,
    };
  }
  const stocks = world.stocks ?? emptyStocks();
  for (const [good, need] of Object.entries(recipe.stocks)) {
    if ((stocks[good] ?? 0) < need) {
      return {
        ok: false,
        reason: `Need ${need} ${good} crates (have ${stocks[good] ?? 0}).`,
        fee: recipe.cash,
      };
    }
  }
  return { ok: true, reason: '', fee: recipe.cash };
}

const SHIPYARD_KIND_SET = new Set(WORLD_SHIPYARD_KINDS);
const SHIPYARD_RESTORE_CAP = 256;

function freezeShipyard(row) {
  if (!SHIPYARD_KIND_SET.has(row.kind)) {
    throw new RangeError(`Unsupported shipyard kind: ${row.kind}`);
  }
  return Object.freeze({
    id: String(row.id),
    kind: row.kind,
    startedBeat: requireShipyardInt(row.startedBeat, 'shipyard.startedBeat'),
    readyBeat: requireShipyardInt(row.readyBeat, 'shipyard.readyBeat'),
    launched: row.launched === true,
  });
}

function requireShipyardInt(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer.`);
  }
  return value;
}

export function emptyShipyard() {
  return [];
}

export function restoreShipyard(shipyard) {
  if (shipyard == null) return [];
  if (!Array.isArray(shipyard)) throw new TypeError('World shipyard must be an array.');
  if (shipyard.length > SHIPYARD_RESTORE_CAP) {
    throw new RangeError(`World shipyard exceeds the restore cap of ${SHIPYARD_RESTORE_CAP}.`);
  }
  return shipyard.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new TypeError(`World shipyard ${index} must be an object.`);
    }
    return freezeShipyard(row);
  });
}

export function tickShipyard(world) {
  const beat = world.beat ?? 0;
  const rows = world.shipyard ?? [];
  if (!rows.length) return world;
  const forces = { ...(world.forces ?? emptyForces()) };
  const nextRows = [];
  const logRows = [];
  let launched = false;
  for (const row of rows) {
    if (row.launched || beat < row.readyBeat) {
      nextRows.push(row);
      continue;
    }
    forces[row.kind] = Math.min(STOCK_CAP, (forces[row.kind] ?? 0) + 1);
    nextRows.push(freezeShipyard({ ...row, launched: true }));
    launched = true;
    const recipe = WORLD_FORCE_RECIPES[row.kind];
    logRows.push(Object.freeze({
      beat,
      type: 'shipyard-launched',
      kind: row.kind,
      body: `Launched ${recipe?.label ?? row.kind}.`,
    }));
  }
  if (!launched) return { ...world, shipyard: nextRows };
  return {
    ...world,
    forces,
    shipyard: nextRows,
    log: appendWorldLog(world.log, logRows),
  };
}

export function raiseForce(world, kind) {
  const check = canRaiseForce(world, kind);
  if (!check.ok) return { ok: false, world, fee: check.fee, reason: check.reason };
  const recipe = WORLD_FORCE_RECIPES[kind];
  const stocks = { ...(world.stocks ?? emptyStocks()) };
  for (const [good, need] of Object.entries(recipe.stocks)) {
    stocks[good] -= need;
  }
  const officers = (world.ambition?.officers ?? 0) - 1;
  const buildBeats = FORCE_BUILD_BEATS[kind];
  const beat = world.beat ?? 0;
  if (!Number.isInteger(buildBeats) || buildBeats < 1) {
    const forces = { ...(world.forces ?? emptyForces()) };
    forces[kind] = Math.min(STOCK_CAP, (forces[kind] ?? 0) + 1);
    const log = appendWorldLog(world.log, Object.freeze({
      beat,
      type: `raise-${kind}`,
      body: `Raised ${recipe.label}.`,
    }));
    return {
      ok: true,
      fee: check.fee,
      reason: '',
      world: {
        ...world,
        treasuryCash: world.treasuryCash - check.fee,
        stocks,
        forces,
        ambition: { ...(world.ambition ?? {}), officers },
        log,
      },
    };
  }
  const shipyard = [...(world.shipyard ?? [])];
  const readyBeat = beat + buildBeats;
  const row = freezeShipyard({
    id: `yard:${kind}:${beat}:${shipyard.length}`,
    kind,
    startedBeat: beat,
    readyBeat,
    launched: false,
  });
  shipyard.push(row);
  const log = appendWorldLog(world.log, Object.freeze({
    beat,
    type: 'shipyard-laid',
    kind,
    readyBeat,
    body: `Laid ${recipe.label}. Ready beat ${readyBeat}.`,
  }));
  return {
    ok: true,
    fee: check.fee,
    reason: '',
    world: {
      ...world,
      treasuryCash: world.treasuryCash - check.fee,
      stocks,
      shipyard,
      ambition: { ...(world.ambition ?? {}), officers },
      log,
    },
  };
}
