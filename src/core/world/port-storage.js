// District Deck — port warehouse / apron / tank capacity. Pure. No DOM.
// world.stocks is the port warehouse; this module is the class-capacity law
// in front of STOCK_CAP. Passenger goods walk off and are never stored.

import { parseParcelId } from '../grid.js';
import { WORLD_GOODS, WORLD_LOG_CAP } from './catalog.js';

export const PORT_STORAGE_CLASSES = Object.freeze(['yard', 'warehouse', 'tank', 'passenger']);

export const PORT_BASE_CAPACITY = Object.freeze({
  yard: 200,
  warehouse: 84,
  tank: 16,
});

/** Per standing `warehouse-brick` on a block that touches the port edge. */
export const ADJACENT_WAREHOUSE_CAPACITY = Object.freeze({
  yard: 128,
  warehouse: 64,
  tank: 0,
});

export const PORT_WAREHOUSE_FORM = 'warehouse-brick';
export const PORT_ADJACENT_CAP = 100_000;

const TANK_GOODS = Object.freeze(['oil', 'lng']);
const PASSENGER_GOODS = Object.freeze(['people', 'tourists', 'asylum', 'education']);
const WAREHOUSE_GOODS = Object.freeze([
  'food', 'beef', 'milk-powder', 'coffee', 'cocoa', 'beer', 'wine',
  'biotech', 'ancient-biotech', 'chips', 'compute', 'starlink', 'robots',
  'wafer', 'die', 'magnets', 'alien', 'gold', 'platinum', 'credit',
  'bibles', 'paper', 'ink', 'uranium', 'enriched-uranium', 'warhead',
  'missile-body',
]);

const CLASS_SET = new Set(PORT_STORAGE_CLASSES);
const STORED_CLASSES = Object.freeze(['yard', 'warehouse', 'tank']);

function overlayClass(table, ids, cls) {
  for (const id of ids) {
    if (!Object.prototype.hasOwnProperty.call(table, id)) {
      throw new RangeError(`PORT_STORAGE_CLASS_OF ${cls} names ${id} which is not a WORLD_GOOD`);
    }
    table[id] = cls;
  }
}

const CLASS_TABLE = Object.fromEntries(WORLD_GOODS.map((good) => [good, 'yard']));
overlayClass(CLASS_TABLE, WAREHOUSE_GOODS, 'warehouse');
overlayClass(CLASS_TABLE, TANK_GOODS, 'tank');
overlayClass(CLASS_TABLE, PASSENGER_GOODS, 'passenger');

export const PORT_STORAGE_CLASS_OF = Object.freeze({ ...CLASS_TABLE });

export function portStorageClass(good) {
  const cls = PORT_STORAGE_CLASS_OF[good];
  return CLASS_SET.has(cls) ? cls : 'yard';
}

export function capacityForAdjacentWarehouses(adjacentWarehouses) {
  const n = Number.isInteger(adjacentWarehouses) && adjacentWarehouses > 0
    ? adjacentWarehouses
    : 0;
  return {
    yard: PORT_BASE_CAPACITY.yard + n * ADJACENT_WAREHOUSE_CAPACITY.yard,
    warehouse: PORT_BASE_CAPACITY.warehouse + n * ADJACENT_WAREHOUSE_CAPACITY.warehouse,
    tank: PORT_BASE_CAPACITY.tank + n * ADJACENT_WAREHOUSE_CAPACITY.tank,
  };
}

export function portCapacity(port) {
  const fallback = capacityForAdjacentWarehouses(port?.adjacentWarehouses ?? 0);
  const cap = port?.capacity;
  return {
    yard: Number.isInteger(cap?.yard) ? cap.yard : fallback.yard,
    warehouse: Number.isInteger(cap?.warehouse) ? cap.warehouse : fallback.warehouse,
    tank: Number.isInteger(cap?.tank) ? cap.tank : fallback.tank,
  };
}

export function seedPort() {
  return {
    adjacentWarehouses: 0,
    capacity: { ...PORT_BASE_CAPACITY },
  };
}

function requirePortInt(value, label, fallback) {
  if (value == null) return fallback;
  if (!Number.isInteger(value) || value < 0 || value > PORT_ADJACENT_CAP) {
    throw new RangeError(`${label} must be an integer 0–${PORT_ADJACENT_CAP}.`);
  }
  return value;
}

export function restorePort(port) {
  if (port == null) return seedPort();
  if (!port || typeof port !== 'object' || Array.isArray(port)) {
    throw new TypeError('World port must be a record.');
  }
  for (const key of Object.keys(port)) {
    if (key !== 'adjacentWarehouses' && key !== 'capacity') {
      throw new Error(`Unsupported port field: ${key}`);
    }
  }
  const adjacentWarehouses = requirePortInt(
    port.adjacentWarehouses,
    'port.adjacentWarehouses',
    0,
  );
  const cap = port.capacity;
  if (cap == null) {
    return {
      adjacentWarehouses,
      capacity: capacityForAdjacentWarehouses(adjacentWarehouses),
    };
  }
  if (!cap || typeof cap !== 'object' || Array.isArray(cap)) {
    throw new TypeError('World port.capacity must be a record.');
  }
  for (const key of Object.keys(cap)) {
    if (!STORED_CLASSES.includes(key)) {
      throw new Error(`Unsupported port.capacity field: ${key}`);
    }
  }
  const fallback = capacityForAdjacentWarehouses(adjacentWarehouses);
  return {
    adjacentWarehouses,
    capacity: {
      yard: requirePortInt(cap.yard, 'port.capacity.yard', fallback.yard),
      warehouse: requirePortInt(cap.warehouse, 'port.capacity.warehouse', fallback.warehouse),
      tank: requirePortInt(cap.tank, 'port.capacity.tank', fallback.tank),
    },
  };
}

function classUsed(stocks, cls) {
  let used = 0;
  for (const good of WORLD_GOODS) {
    if (portStorageClass(good) !== cls) continue;
    const n = stocks?.[good] ?? 0;
    if (Number.isInteger(n) && n > 0) used += n;
  }
  return used;
}

export function portOccupancy(world) {
  const stocks = world?.stocks ?? {};
  const cap = portCapacity(world?.port);
  const byClass = {
    yard: { used: classUsed(stocks, 'yard'), cap: cap.yard },
    warehouse: { used: classUsed(stocks, 'warehouse'), cap: cap.warehouse },
    tank: { used: classUsed(stocks, 'tank'), cap: cap.tank },
  };
  const byGood = [];
  for (const good of WORLD_GOODS) {
    const count = stocks[good] ?? 0;
    if (!Number.isInteger(count) || count <= 0) continue;
    byGood.push({ good, count, cls: portStorageClass(good) });
  }
  byGood.sort((a, b) => b.count - a.count || (a.good < b.good ? -1 : a.good > b.good ? 1 : 0));
  const adjacentWarehouses = Number.isInteger(world?.port?.adjacentWarehouses)
    ? world.port.adjacentWarehouses
    : 0;
  return {
    byClass,
    byGood,
    total: byClass.yard.used + byClass.warehouse.used + byClass.tank.used,
    adjacentWarehouses,
  };
}

export function portHasRoom(world, good) {
  const cls = portStorageClass(good);
  if (cls === 'passenger') return true;
  const slot = portOccupancy(world).byClass[cls];
  if (!slot) return true;
  return slot.used < slot.cap;
}

export function portHoldRows(world, beat = world?.beat) {
  const rows = [];
  for (const entry of world?.log ?? []) {
    if (entry?.type !== 'port-full') continue;
    if (entry.beat !== beat) continue;
    rows.push(entry);
  }
  return rows;
}

export function portFullCopy(cls, used, cap) {
  const name = CLASS_SET.has(cls) && cls !== 'passenger' ? cls : 'yard';
  const u = Number.isInteger(used) ? used : 0;
  const c = Number.isInteger(cap) ? cap : 0;
  if (name === 'tank') {
    return `PORT FULL · tank ${u}/${c} — the tank farm holds what it holds; open fewer oil and LNG books`;
  }
  return `PORT FULL · ${name} ${u}/${c} — build a warehouse on a block beside the port`;
}

export function portFullLogRow({
  beat, cls, used, cap, held = 0, heldCity = 0,
}) {
  return Object.freeze({
    beat,
    type: 'port-full',
    cls,
    used,
    cap,
    held: Number.isInteger(held) && held > 0 ? held : 0,
    heldCity: Number.isInteger(heldCity) && heldCity > 0 ? heldCity : 0,
    body: portFullCopy(cls, used, cap),
  });
}

export function mergePortFullIntoLog(log, row, cap = WORLD_LOG_CAP) {
  if (!row) return Array.isArray(log) ? log : [];
  const next = Array.isArray(log) ? [...log] : [];
  const idx = next.findIndex((entry) => (
    entry?.type === 'port-full' && entry.beat === row.beat && entry.cls === row.cls
  ));
  if (idx < 0) {
    next.push(Object.isFrozen(row) ? row : portFullLogRow(row));
  } else {
    const prior = next[idx];
    next[idx] = portFullLogRow({
      beat: row.beat,
      cls: row.cls,
      used: Number.isInteger(row.used) ? row.used : (prior.used ?? 0),
      cap: Number.isInteger(row.cap) ? row.cap : (prior.cap ?? 0),
      held: (prior.held ?? 0) + (row.held ?? 0),
      heldCity: (prior.heldCity ?? 0) + (row.heldCity ?? 0),
    });
  }
  return next.slice(-Math.max(1, cap));
}

/**
 * Port edge = water-edge band's perpendicular (`fringeGatewayRoles`).
 * Cited from mvp/src/core/landuse.js:1402-1450 — reimplemented so this
 * module does not import landuse.js (that graph pulls the city engine).
 */
function fringeGatewayRoles(city) {
  const bay = city?.waterEdge ?? 'south';
  const perpendicular = bay === 'north' || bay === 'south'
    ? ['west', 'east']
    : ['north', 'south'];
  return {
    portEdge: city?.waterEdgeBand?.harbourAtLowEnd ? perpendicular[0] : perpendicular[1],
  };
}

function blockTouchesEdge(city, block, edge) {
  if (edge === 'north') return block.bz === 0;
  if (edge === 'south') return block.bz === (city.blocksZ ?? 1) - 1;
  if (edge === 'west') return block.bx === 0;
  if (edge === 'east') return block.bx === (city.blocksX ?? 1) - 1;
  return false;
}

export function blocksAdjacentToPort(city) {
  const edge = fringeGatewayRoles(city).portEdge;
  const blocksX = Number.isInteger(city?.blocksX) && city.blocksX > 0 ? city.blocksX : 1;
  const blocksZ = Number.isInteger(city?.blocksZ) && city.blocksZ > 0 ? city.blocksZ : 1;
  const blocks = [];
  for (let bz = 0; bz < blocksZ; bz += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      if (blockTouchesEdge(city, { bx, bz }, edge)) blocks.push({ bx, bz });
    }
  }
  return blocks;
}

function blockTouchesPort(city, block) {
  return blockTouchesEdge(city, block, fringeGatewayRoles(city).portEdge);
}

/**
 * Standing-form walk, cited from mvp/src/core/city-exports.js:147-202
 * (`standingSlotRecords` / `holdingStandingPlacements` / `holdingYieldForms`).
 * Reimplemented so port-storage does not import city-exports (cycle).
 */
function standingSlotRecords(holding) {
  const slots = holding?.padSlots;
  if (!slots || typeof slots !== 'object') return [];
  const records = [];
  for (const key of ['A', 'B']) {
    const slot = slots[key];
    if (slot?.status === 'standing' && typeof slot.archetypeId === 'string') {
      records.push({ slot: key, record: slot });
    }
  }
  return records;
}

function holdingStandingPlacements(holding, status) {
  const slotted = standingSlotRecords(holding);
  if (holding?.siteCleared && slotted.length === 0) return [];
  if (slotted.length) {
    const whole = slotted.filter(({ record }) => record.whole === true);
    if (whole.length) return [whole[0].record.archetypeId];
    return slotted.map(({ record }) => record.archetypeId);
  }
  const primary = status?.builtArchetypeId ?? holding?.archetypeId ?? null;
  return typeof primary === 'string' && primary ? [primary] : [];
}

function holdingYieldForms(holding, status) {
  const slotted = standingSlotRecords(holding);
  if (slotted.length || holding?.siteCleared) {
    return holdingStandingPlacements(holding, status);
  }
  if (holding?.construction) return [];
  return holdingStandingPlacements(holding, status);
}

function parcelBlock(parcelId) {
  try {
    const parsed = parseParcelId(parcelId);
    return { bx: parsed.bx, bz: parsed.bz };
  } catch {
    return null;
  }
}

export function portCapacityFromCity(city, state) {
  const holdings = state?.holdings ?? {};
  const parcelStatus = state?.parcelStatus ?? {};
  let adjacentWarehouses = 0;
  for (const parcelId of Object.keys(holdings)) {
    const holding = holdings[parcelId];
    if (!holding) continue;
    const forms = holdingYieldForms(holding, parcelStatus[parcelId]);
    let bricks = 0;
    for (const formId of forms) {
      if (formId === PORT_WAREHOUSE_FORM) bricks += 1;
    }
    if (bricks < 1) continue;
    const block = parcelBlock(parcelId);
    if (!block) continue;
    if (blockTouchesPort(city, block)) adjacentWarehouses += bricks;
  }
  return {
    adjacentWarehouses,
    capacity: capacityForAdjacentWarehouses(adjacentWarehouses),
  };
}

export function attachHeldCity(stocks, heldCity) {
  const held = {};
  for (const cls of STORED_CLASSES) {
    const n = heldCity?.[cls] ?? 0;
    if (Number.isInteger(n) && n > 0) held[cls] = n;
  }
  Object.defineProperty(stocks, 'heldCity', {
    value: Object.freeze(held),
    enumerable: false,
    configurable: true,
  });
  return stocks;
}

export { STORED_CLASSES };
