// Yard arrival plate. Three segments max.
// Roster is WORLD_GOODS at call time — labels come from the screen's CHIP_NAME.

import { WORLD_GOODS } from '../../core/world/catalog.js';
import { portFullCopy, portHoldRows, portOccupancy } from '../../core/world/port-storage.js';

export { portFullCopy, portHoldRows };

/**
 * Yard-register hold plate. One line per port-full row (already coalesced
 * per class per beat). Empty when the beat has no storage holds.
 */
export function formatYardHoldNotice(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  return rows
    .map((row) => row?.body ?? portFullCopy(row?.cls, row?.used, row?.cap))
    .filter((line) => typeof line === 'string' && line.length > 0)
    .join(' ');
}

/**
 * Positive stock deltas for the beat notice. Call this from the real
 * advance path so a catalog good a parallel wave adds is named without
 * a second hand roster.
 */
export function yardArrivalLines(beforeStocks, afterStocks, {
  goods = WORLD_GOODS,
  labels = {},
} = {}) {
  return [...goods]
    .map((good) => {
      const count = (afterStocks?.[good] ?? 0) - (beforeStocks?.[good] ?? 0);
      return {
        good,
        label: labels[good] ?? good,
        count,
      };
    })
    .filter(({ count }) => count > 0)
    .map(({ label, count }) => `${label} +${count}`);
}

export function formatYardHoldSegment(rows, { occupancy = null } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const total = rows.reduce((sum, row) => {
    const held = Number.isInteger(row?.held) && row.held > 0 ? row.held : 0;
    const city = Number.isInteger(row?.heldCity) && row.heldCity > 0 ? row.heldCity : 0;
    return sum + held + city;
  }, 0);
  const n = total > 0 ? total : rows.length;
  let good = null;
  if (rows.length === 1) {
    const row = rows[0];
    if (typeof row?.good === 'string' && row.good) good = row.good;
    else if (occupancy?.byGood) {
      const match = occupancy.byGood.find((entry) => entry.cls === row.cls);
      good = match?.good ?? null;
    }
  }
  const named = good ? `${n} ${good}` : `${n} crates`;
  return `Port full — ${named} held at anchor.`;
}

export function formatYardArrivalsNotice(arrivals, holdSegment = '') {
  const hold = typeof holdSegment === 'string' ? holdSegment.replace(/\.$/, '') : '';
  if (hold) {
    if (!Array.isArray(arrivals) || arrivals.length === 0) return `${hold}.`;
    return `Crates received · ${arrivals[0]} · ${hold}.`;
  }
  if (!Array.isArray(arrivals) || arrivals.length === 0) {
    return 'Beat advanced. No Yard crates arrived.';
  }
  if (arrivals.length === 1) return `Crates received · ${arrivals[0]}.`;
  if (arrivals.length === 2) return `Crates received · ${arrivals[0]} · ${arrivals[1]}.`;
  return `Crates received · ${arrivals[0]} · +${arrivals.length - 1} more.`;
}

/**
 * Screen notice renderer. world-map onAdvanceLedger calls this with
 * CHIP_NAME and no goods override so the roster is WORLD_GOODS at
 * call time. Writes the plate when `element` is passed.
 */
export function renderYardArrivalNotice(beforeStocks, afterStocks, {
  goods = WORLD_GOODS,
  labels = {},
  element = null,
  holds = null,
  world = null,
} = {}) {
  const arrivals = yardArrivalLines(beforeStocks, afterStocks, { goods, labels });
  const holdRows = Array.isArray(holds)
    ? holds
    : (world ? portHoldRows(world) : []);
  const holdSegment = formatYardHoldSegment(holdRows, {
    occupancy: world ? portOccupancy(world) : null,
  });
  const notice = formatYardArrivalsNotice(arrivals, holdSegment);
  if (element) {
    element.textContent = notice;
    if ('hidden' in element) element.hidden = !notice;
  }
  return notice;
}
