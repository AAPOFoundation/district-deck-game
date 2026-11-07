// What the inner board should animate when a globe beat harvests.
// Pure. Does not write storage. Restore ignores this module.
//
// Wave R5: rows are 1:1 with movement records the reducers logged on this
// beat — harvest, city-admission, export-shipment, export-departure. No stock-diff reconstruction
// and no fallback synthesis. No rows → no hops.

import { cityExtent, parcelId, TILES_PER_BLOCK, tileCentre } from '../grid.js';
import { WORLD_TRADE_BY_ID } from './catalog.js';
import { ledgerIdentity } from './ambition.js';

/**
 * Inbound harvest quay inset, metres past the water-side rim.
 * Must match `DOCK_INSET` in mvp/src/render/world-deliveries.js
 * (`worldDeliveryEndpoints(city, 'in', 0).start`).
 */
export const WORLD_DELIVERY_DOCK_INSET = 1.8;

/**
 * Lane fan used by the inbound quay. Must match `LANE_GAP` in
 * mvp/src/render/world-deliveries.js.
 */
export const WORLD_DELIVERY_APRON_LANE_GAP = 8.8;

const MELBOURNE = 'melbourne-inner';
const STOCK_CAP = 99;

function freezeRows(rows) {
  return Object.freeze(rows.map((row) => Object.freeze(row)));
}

function harvestRow(route, index = 0) {
  return {
    id: index ? `${route.id}:${index}` : route.id,
    good: route.good,
    dir: 'in',
    via: 'ship',
    cause: 'harvest',
    from: route.from,
    to: route.to,
    kind: route.kind,
    book: route.id,
  };
}

function ledgerRow(good, index) {
  return {
    id: `city-ledger:${good}:${index}`,
    good,
    dir: 'in',
    via: 'road',
    cause: 'city-ledger',
    from: MELBOURNE,
    to: MELBOURNE,
    kind: 'rail',
    book: null,
  };
}

function exportRow(route, index) {
  return {
    id: `${route.id}:${index}`,
    good: route.good,
    dir: 'out',
    via: 'ship',
    cause: 'export',
    from: route.from,
    to: route.to,
    kind: route.kind,
    book: route.id,
  };
}

/**
 * The city-exports payload that actually applied on this beat, or null.
 * Identity is runId:quarter; a newer settle sitting in storage is not this beat.
 */
export function matchingAppliedLedger(world, payload) {
  if (!world || !payload) return null;
  if (world.ambition?.lastLedgerAppliedBeat !== (world.beat ?? 0)) return null;
  const identity = ledgerIdentity(payload);
  if (!identity || identity !== world.ambition?.lastLedgerApplied) return null;
  return payload;
}

function routeFor(entry) {
  return WORLD_TRADE_BY_ID[entry?.routeId] ?? null;
}

function expandLogEntry(entry) {
  if (!entry || typeof entry !== 'object') return [];
  if (entry.kind === 'harvest') {
    const route = routeFor(entry);
    if (!route) return [];
    return [harvestRow(route)];
  }
  if (entry.kind === 'city-admission') {
    const rows = [];
    const goods = entry.goods && typeof entry.goods === 'object' && !Array.isArray(entry.goods)
      ? entry.goods
      : {};
    for (const [good, delta] of Object.entries(goods)) {
      if (!Number.isInteger(delta) || delta <= 0) continue;
      for (let index = 0; index < delta; index += 1) {
        rows.push(ledgerRow(good, index));
      }
    }
    return rows;
  }
  if (entry.kind === 'export-shipment') {
    const route = routeFor(entry);
    if (!route) return [];
    const count = Number.isInteger(entry.count) && entry.count > 0 ? entry.count : 0;
    const rows = [];
    for (let index = 0; index < count; index += 1) {
      rows.push(exportRow(route, index));
    }
    return rows;
  }
  if (entry.kind === 'export-departure') {
    const route = routeFor(entry);
    if (!route) return [];
    const count = Number.isInteger(entry.count) && entry.count > 0 ? entry.count : 0;
    const rows = [];
    for (let index = 0; index < count; index += 1) {
      rows.push({ ...exportRow(route, index), cause: 'export-departure' });
    }
    return rows;
  }
  if (
    entry.type === 'threat-repelled'
    || entry.type === 'threat-loss'
    || entry.type === 'threat-damage'
  ) {
    const outcome = entry.type === 'threat-repelled'
      ? 'repelled'
      : entry.type === 'threat-loss'
        ? 'loss'
        : 'damage';
    return [{
      id: `threat:${outcome}:${entry.kind}:${entry.beat}`,
      good: null,
      dir: 'in',
      via: 'air',
      cause: 'threat-strike',
      from: MELBOURNE,
      to: MELBOURNE,
      kind: entry.kind,
      book: entry.book ?? entry.targetBook ?? null,
      targetFacility: entry.facility ?? entry.targetFacility ?? null,
      targetBook: entry.book ?? entry.targetBook ?? null,
      strength: entry.strength ?? null,
      interceptors: entry.interceptors ?? [],
      outcome,
      beat: entry.beat,
    }];
  }
  if (entry.kind === 'process-draw' || entry.kind === 'process-deposit' || entry.kind === 'process-scrap') {
    const rows = [];
    const goods = entry.goods && typeof entry.goods === 'object' && !Array.isArray(entry.goods)
      ? entry.goods
      : {};
    const dir = entry.kind === 'process-deposit' ? 'in' : 'out';
    for (const [good, delta] of Object.entries(goods)) {
      if (!Number.isInteger(delta) || delta <= 0) continue;
      for (let index = 0; index < delta; index += 1) {
        rows.push({
          id: `process:${entry.kind}:${entry.facilityId}:${good}:${index}`,
          good,
          dir,
          via: 'road',
          cause: entry.kind,
          from: MELBOURNE,
          to: MELBOURNE,
          kind: 'rail',
          book: null,
        });
      }
    }
    return rows;
  }
  return [];
}

/**
 * Map a stored (post-tick) world to one painted token per crate that moved
 * on that beat. Reads `world.log` only — harvest, city-admission,
 * export-shipment, and export-departure rows whose `beat` equals the current
 * beat. Opening a book
 * after the tick, or a capped harvest, leaves no row and paints nothing.
 */
export function beatDeliveries(world) {
  if (!world) return freezeRows([]);
  const beat = world.beat ?? 0;
  const rows = [];
  for (const entry of world.log ?? []) {
    if (entry?.beat !== beat) continue;
    rows.push(...expandLogEntry(entry));
  }
  return freezeRows(rows);
}

export { STOCK_CAP as WORLD_DELIVERY_STOCK_CAP };

/**
 * Water-edge city tile the inbound harvest hop crosses onto the board.
 * Crates physically land at the quay from
 * `worldDeliveryEndpoints(city, 'in', 0).start` in
 * mvp/src/render/world-deliveries.js (DOCK_INSET past the rim, lane 0).
 * Distance law cannot import that render adapter; this is the same
 * coordinate mapped onto the global tile lattice.
 */
export function portApronParcelId(city) {
  const blocksX = Number.isInteger(city?.blocksX) && city.blocksX > 0 ? city.blocksX : 4;
  const blocksZ = Number.isInteger(city?.blocksZ) && city.blocksZ > 0 ? city.blocksZ : 4;
  const waterEdge = city?.waterEdge ?? 'east';
  const extent = cityExtent(blocksX, blocksZ);
  const laneSlot = -0.75 * WORLD_DELIVERY_APRON_LANE_GAP;
  let x = extent.x * 0.5;
  let z = extent.z * 0.5;
  if (waterEdge === 'north') {
    x += laneSlot;
    z = WORLD_DELIVERY_DOCK_INSET;
  } else if (waterEdge === 'south') {
    x += laneSlot;
    z = extent.z - WORLD_DELIVERY_DOCK_INSET;
  } else if (waterEdge === 'west') {
    x = WORLD_DELIVERY_DOCK_INSET;
    z += laneSlot;
  } else {
    x = extent.x - WORLD_DELIVERY_DOCK_INSET;
    z += laneSlot;
  }
  return nearestWaterEdgeParcel(blocksX, blocksZ, waterEdge, x, z);
}

function nearestWaterEdgeParcel(blocksX, blocksZ, waterEdge, x, z) {
  const last = TILES_PER_BLOCK - 1;
  let bestId = null;
  let bestD = Infinity;
  const consider = (bx, bz, tx, tz) => {
    const centre = tileCentre(bx, bz, tx, tz);
    const d = Math.hypot(centre.x - x, centre.z - z);
    if (d < bestD) {
      bestD = d;
      bestId = parcelId(bx, bz, tx, tz);
    }
  };
  if (waterEdge === 'north') {
    for (let bx = 0; bx < blocksX; bx += 1) {
      for (let tx = 0; tx < TILES_PER_BLOCK; tx += 1) consider(bx, 0, tx, 0);
    }
  } else if (waterEdge === 'south') {
    for (let bx = 0; bx < blocksX; bx += 1) {
      for (let tx = 0; tx < TILES_PER_BLOCK; tx += 1) consider(bx, blocksZ - 1, tx, last);
    }
  } else if (waterEdge === 'west') {
    for (let bz = 0; bz < blocksZ; bz += 1) {
      for (let tz = 0; tz < TILES_PER_BLOCK; tz += 1) consider(0, bz, 0, tz);
    }
  } else {
    for (let bz = 0; bz < blocksZ; bz += 1) {
      for (let tz = 0; tz < TILES_PER_BLOCK; tz += 1) consider(blocksX - 1, bz, last, tz);
    }
  }
  return bestId;
}
