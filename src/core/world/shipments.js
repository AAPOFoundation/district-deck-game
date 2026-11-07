// District Deck — multi-quarter in-flight cargo. Pure. No DOM.
// Held books pause remaining beats. Closed books drain in-flight and start no more.
// Stock and cash apply at the arrival beat only.

import {
  dockHoldLogRow,
  exportCashForGood,
  handlingFeeForGood,
  transitBeatsForDays,
  WORLD_TRADE_BY_ID,
  WORLD_TRADE_ROUTES,
} from './catalog.js';
import { emptyStocks } from './forces.js';
import { mineMakeBlocksImport } from './processes.js';
import {
  portFullLogRow,
  portHasRoom,
  portOccupancy,
  portStorageClass,
} from './port-storage.js';
import { routeIsOpen } from './trade.js';

const STOCK_CAP = 99;
const SHIPMENT_RESTORE_CAP = 512;

export function liveShipmentCap(transitBeats) {
  const t = Number.isInteger(transitBeats) && transitBeats > 0 ? transitBeats : 1;
  return t + 1;
}

export function shipmentArriveBeat(shipment) {
  const departed = Number.isInteger(shipment?.departedBeat) ? shipment.departedBeat : 0;
  const transit = Number.isInteger(shipment?.transitBeats) && shipment.transitBeats > 0
    ? shipment.transitBeats
    : 1;
  const paused = Number.isInteger(shipment?.pausedBeats) && shipment.pausedBeats > 0
    ? shipment.pausedBeats
    : 0;
  return departed + transit + paused;
}

export function shipmentLaneFraction(shipment, beat) {
  if (Number.isInteger(shipment?.landedBeat)) return 1;
  const transit = Number.isInteger(shipment?.transitBeats) && shipment.transitBeats > 0
    ? shipment.transitBeats
    : 1;
  const departed = Number.isInteger(shipment?.departedBeat) ? shipment.departedBeat : 0;
  const paused = Number.isInteger(shipment?.pausedBeats) && shipment.pausedBeats > 0
    ? shipment.pausedBeats
    : 0;
  const raw = ((Number.isInteger(beat) ? beat : 0) - departed - paused) / transit;
  if (!Number.isFinite(raw)) return 0;
  if (raw <= 0) return 0;
  if (raw >= 1) return 1;
  return raw;
}

export function emptyShipments() {
  return [];
}

function requireNonNegativeInt(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer.`);
  }
  return value;
}

function freezeShipment(row) {
  const transitBeats = Number.isInteger(row.transitBeats) && row.transitBeats > 0
    ? row.transitBeats
    : 1;
  return Object.freeze({
    id: String(row.id),
    routeId: String(row.routeId),
    good: String(row.good),
    direction: row.direction,
    count: requireNonNegativeInt(row.count, 'shipment.count'),
    departedBeat: requireNonNegativeInt(row.departedBeat, 'shipment.departedBeat'),
    transitBeats,
    pausedBeats: requireNonNegativeInt(row.pausedBeats ?? 0, 'shipment.pausedBeats'),
    handlingFee: requireNonNegativeInt(row.handlingFee ?? 0, 'shipment.handlingFee'),
    exportCash: requireNonNegativeInt(row.exportCash ?? 0, 'shipment.exportCash'),
    listed: requireNonNegativeInt(row.listed ?? 0, 'shipment.listed'),
    landedBeat: row.landedBeat == null
      ? null
      : requireNonNegativeInt(row.landedBeat, 'shipment.landedBeat'),
  });
}

export function restoreShipments(shipments) {
  if (shipments == null) return [];
  if (!Array.isArray(shipments)) throw new TypeError('World shipments must be an array.');
  if (shipments.length > SHIPMENT_RESTORE_CAP) {
    throw new RangeError(`World shipments exceed the restore cap of ${SHIPMENT_RESTORE_CAP}.`);
  }
  return shipments.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new TypeError(`World shipment ${index} must be an object.`);
    }
    if (row.direction !== 'inbound' && row.direction !== 'outbound') {
      throw new RangeError(`World shipment ${index} direction must be inbound or outbound.`);
    }
    if (!Number.isInteger(row.count) || row.count < 1) {
      throw new RangeError(`World shipment ${index} count must be a positive integer.`);
    }
    if (!Number.isInteger(row.transitBeats) || row.transitBeats < 1) {
      throw new RangeError(`World shipment ${index} transitBeats must be a positive integer.`);
    }
    return freezeShipment(row);
  });
}

function routeHeld(world, routeId) {
  return world?.routes?.[routeId]?.status === 'held';
}

function liveCountForRoute(shipments, routeId) {
  return shipments.filter((row) => row.routeId === routeId && row.landedBeat == null).length;
}

function canDepartInbound(world, route) {
  if (route.direction !== 'inbound') return false;
  if (!routeIsOpen(world, route.id)) return false;
  if (route.loan) return false;
  if (!route.playerOpenable && route.good !== 'asylum') return false;
  if (mineMakeBlocksImport(world, route.good)) return false;
  return true;
}

function canDepartOutbound(world, route) {
  if (route.direction !== 'outbound') return false;
  if (route.loan) return false;
  if (!routeIsOpen(world, route.id)) return false;
  return true;
}

function makeShipment({
  route, direction, beat, count, listed = 0,
}) {
  const transitBeats = Number.isInteger(route.transitBeats) && route.transitBeats > 0
    ? route.transitBeats
    : transitBeatsForDays(route.days);
  return freezeShipment({
    id: `ship:${route.id}:${beat}`,
    routeId: route.id,
    good: route.good,
    direction,
    count,
    departedBeat: beat,
    transitBeats,
    pausedBeats: 0,
    handlingFee: handlingFeeForGood(route.good),
    exportCash: direction === 'outbound' ? exportCashForGood(route.good) : 0,
    listed,
    landedBeat: null,
  });
}

export function applyShipmentDisasterLoss(world) {
  const beat = world?.beat ?? 0;
  const hits = (world?.disasters ?? []).filter((row) => (
    row?.beat === beat && (row.type === 'tsunami' || row.type === 'asteroid')
  ));
  if (!hits.length) return world;
  const lostIds = new Set();
  for (const hit of hits) {
    for (const id of hit.lostBooks ?? []) lostIds.add(id);
    if (!hit.lostBooks?.length) {
      for (const id of hit.books ?? []) lostIds.add(id);
    }
  }
  if (!lostIds.size) return world;
  const shipments = world.shipments ?? [];
  const next = shipments.filter((row) => !lostIds.has(row.routeId));
  if (next.length === shipments.length) return world;
  return { ...world, shipments: next };
}

function landInbound(world, shipment, events) {
  const route = WORLD_TRADE_BY_ID[shipment.routeId];
  if (!route) return { world, landed: true, leftover: null, hold: null };
  const stocks = { ...(world.stocks ?? emptyStocks()) };
  let treasuryCash = world.treasuryCash ?? 0;
  const beat = world.beat ?? 0;
  const fee = shipment.handlingFee ?? handlingFeeForGood(route.good);
  const count = shipment.count;
  let landed = 0;
  let unfunded = false;
  let storageFull = false;
  for (let i = 0; i < count; i += 1) {
    if (treasuryCash < fee) {
      unfunded = true;
      break;
    }
    if (!portHasRoom({ ...world, stocks }, route.good)) {
      storageFull = true;
      break;
    }
    const before = stocks[route.good] ?? 0;
    const after = Math.min(STOCK_CAP, before + 1);
    if (after <= before) break;
    treasuryCash -= fee;
    stocks[route.good] = after;
    landed += 1;
    events?.push(Object.freeze({
      kind: 'harvest',
      routeId: route.id,
      good: route.good,
      beat,
    }));
  }
  const leftoverCount = count - landed;
  const storageHold = leftoverCount > 0 && storageFull
    ? { routeId: route.id, good: route.good, reason: 'storage-full', count: leftoverCount }
    : null;
  const unfundedHold = leftoverCount > 0 && unfunded
    ? { routeId: route.id, good: route.good }
    : null;
  if (landed <= 0) {
    return {
      world,
      landed: false,
      leftover: shipment,
      hold: unfundedHold ?? storageHold,
    };
  }
  return {
    world: { ...world, stocks, treasuryCash },
    landed: leftoverCount <= 0,
    leftover: leftoverCount > 0
      ? freezeShipment({
        ...shipment,
        count: leftoverCount,
        listed: Math.min(shipment.listed ?? 0, leftoverCount),
      })
      : null,
    hold: unfundedHold ?? storageHold,
  };
}

function landOutbound(world, shipment, events) {
  const route = WORLD_TRADE_BY_ID[shipment.routeId];
  if (!route) return { world, landed: true, leftover: null, hold: null };
  let treasuryCash = world.treasuryCash ?? 0;
  const beat = world.beat ?? 0;
  const fee = shipment.handlingFee ?? handlingFeeForGood(route.good);
  const cash = shipment.exportCash ?? exportCashForGood(route.good);
  const count = shipment.count;
  let landed = 0;
  for (let i = 0; i < count; i += 1) {
    if (treasuryCash < fee) break;
    treasuryCash -= fee;
    treasuryCash += cash;
    landed += 1;
  }
  if (landed <= 0) {
    return {
      world,
      landed: false,
      leftover: shipment,
      hold: { routeId: route.id, good: route.good },
    };
  }
  events?.push(Object.freeze({
    kind: 'export-shipment',
    routeId: route.id,
    good: route.good,
    count: landed,
    listed: Math.min(shipment.listed ?? 0, landed),
    beat,
  }));
  const leftoverCount = count - landed;
  const listedLeft = Math.max(0, (shipment.listed ?? 0) - Math.min(shipment.listed ?? 0, landed));
  return {
    world: { ...world, treasuryCash },
    landed: leftoverCount <= 0,
    leftover: leftoverCount > 0
      ? freezeShipment({ ...shipment, count: leftoverCount, listed: listedLeft })
      : null,
    hold: leftoverCount > 0 ? { routeId: route.id, good: route.good } : null,
  };
}

export function tickShipmentProgress(world, events = null) {
  const beat = world.beat ?? 0;
  const live = Array.isArray(world.shipments) ? world.shipments : [];
  const next = [];
  const inboundHeld = [];
  const outboundHeld = [];
  const storageHeld = [];
  let current = world;
  for (const shipment of live) {
    if (Number.isInteger(shipment.landedBeat)) {
      if (beat > shipment.landedBeat) continue;
      next.push(shipment);
      continue;
    }
    if (routeHeld(current, shipment.routeId)) {
      next.push(freezeShipment({
        ...shipment,
        pausedBeats: (shipment.pausedBeats ?? 0) + 1,
      }));
      continue;
    }
    if (beat < shipmentArriveBeat(shipment)) {
      next.push(shipment);
      continue;
    }
    const result = shipment.direction === 'outbound'
      ? landOutbound(current, shipment, events)
      : landInbound(current, shipment, events);
    current = result.world;
    if (result.hold) {
      if (result.hold.reason === 'storage-full') storageHeld.push(result.hold);
      else if (shipment.direction === 'outbound') outboundHeld.push(result.hold);
      else inboundHeld.push(result.hold);
    }
    if (result.landed) {
      next.push(freezeShipment({ ...shipment, landedBeat: beat }));
      continue;
    }
    if (result.leftover) next.push(result.leftover);
  }
  const logRows = [];
  if (inboundHeld.length) {
    logRows.push(dockHoldLogRow(beat, 'inbound', inboundHeld.length, inboundHeld[0]));
  }
  if (outboundHeld.length) {
    logRows.push(dockHoldLogRow(beat, 'outbound', outboundHeld.length, outboundHeld[0]));
  }
  const storageByClass = { yard: 0, warehouse: 0, tank: 0 };
  for (const hold of storageHeld) {
    const cls = portStorageClass(hold.good);
    if (cls === 'passenger') continue;
    const n = Number.isInteger(hold.count) && hold.count > 0 ? hold.count : 1;
    storageByClass[cls] = (storageByClass[cls] ?? 0) + n;
  }
  const occupancy = portOccupancy(current);
  for (const cls of ['yard', 'warehouse', 'tank']) {
    const held = storageByClass[cls];
    if (!Number.isInteger(held) || held < 1) continue;
    const slot = occupancy.byClass[cls];
    logRows.push(portFullLogRow({
      beat,
      cls,
      used: slot.used,
      cap: slot.cap,
      held,
      heldCity: 0,
    }));
  }
  return {
    world: { ...current, shipments: next },
    logRows,
  };
}

export function tickShipmentDepartures(world) {
  const beat = world.beat ?? 0;
  const shipments = Array.isArray(world.shipments) ? [...world.shipments] : [];
  const stocks = { ...(world.stocks ?? emptyStocks()) };
  const cityLots = { ...(world.ambition?.cityLots ?? {}) };
  const logRows = [];
  for (const route of WORLD_TRADE_ROUTES) {
    if (!canDepartInbound(world, route)) continue;
    if (liveCountForRoute(shipments, route.id) >= liveShipmentCap(route.transitBeats)) continue;
    shipments.push(makeShipment({
      route, direction: 'inbound', beat, count: 1, listed: 0,
    }));
  }
  for (const route of WORLD_TRADE_ROUTES) {
    if (!canDepartOutbound(world, route)) continue;
    if (liveCountForRoute(shipments, route.id) >= liveShipmentCap(route.transitBeats)) continue;
    const capacity = Number.isInteger(route.capacity) && route.capacity > 0 ? route.capacity : 1;
    const have = stocks[route.good] ?? 0;
    const want = Math.min(capacity, have);
    if (want <= 0) continue;
    stocks[route.good] = have - want;
    const lots = cityLots[route.good] ?? 0;
    const listed = Math.min(want, lots);
    if (listed > 0) {
      const remain = lots - listed;
      if (remain > 0) cityLots[route.good] = remain;
      else delete cityLots[route.good];
    }
    shipments.push(makeShipment({
      route, direction: 'outbound', beat, count: want, listed,
    }));
    logRows.push(Object.freeze({
      kind: 'export-departure',
      routeId: route.id,
      good: route.good,
      count: want,
      beat,
    }));
  }
  return {
    world: {
      ...world,
      stocks,
      shipments,
      ambition: {
        ...(world.ambition ?? {}),
        cityLots,
      },
    },
    logRows,
  };
}

export {
  STOCK_CAP as WORLD_SHIPMENT_STOCK_CAP,
  SHIPMENT_RESTORE_CAP,
};
