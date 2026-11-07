// Port warehouse plate for the city port card, plus the Yard capacity chip
// model. Pure HTML/model — no DOM writes, no clock, no Math.random.

import { escapeHtml } from '../core/format.js';
import {
  WORLD_RUN_KEY,
  inspectWorldRun,
  worldStoreGet,
} from '../core/world/envelope.js';
import {
  ADJACENT_WAREHOUSE_CAPACITY,
  portHoldRows,
  portOccupancy,
  portStorageClass,
} from '../core/world/port-storage.js';
import { ITEM_LABEL, itemIconHtml } from './world-map/item-icons.js';

export const PORT_WAREHOUSE_ROW_CAP = 12;
export const PORT_BAR_HOT_RATIO = 0.9;
export const YARD_CHIP_AMBER_RATIO = 0.75;
export const YARD_CHIP_RED_RATIO = 1;

export const PORT_CLASS_CHIP = Object.freeze({
  yard: 'YARD',
  warehouse: 'SECURE',
  tank: 'TANK',
});

export const PORT_CLASS_PLATE = Object.freeze({
  yard: 'yard',
  warehouse: 'secure',
  tank: 'tank',
});

/**
 * The call to action is derived from the live capacity table so the copy can
 * never drift from the mechanic (P13 B2 retuned +12/+8 to +128/+64; a literal
 * here shipped the stale numbers for one round).
 */
export const PORT_WAREHOUSE_CTA =
  `Build a warehouse on a block beside the port (+${ADJACENT_WAREHOUSE_CAPACITY.yard} yard · +${ADJACENT_WAREHOUSE_CAPACITY.warehouse} secure each)`;

/** Tank holds cannot be relieved by a warehouse (tank +0), so the CTA says so. */
export const PORT_TANK_CTA =
  'The tank farm holds what it holds. Open fewer oil and LNG books.';

export function portHoldCta(holdRows) {
  const list = Array.isArray(holdRows) ? holdRows : [];
  if (!list.length) return '';
  const relievable = list.some((row) => row?.cls === 'yard' || row?.cls === 'warehouse');
  return relievable ? PORT_WAREHOUSE_CTA : PORT_TANK_CTA;
}

export const PORT_WAREHOUSE_EMPTY =
  'Nothing in store. Open a book on the world map to bring crates in.';

const STORED = Object.freeze(['yard', 'warehouse', 'tank']);

export function readOpenWorld() {
  try {
    const inspected = inspectWorldRun(worldStoreGet(WORLD_RUN_KEY));
    return inspected.status === 'valid' ? inspected.world : null;
  } catch {
    return null;
  }
}

export function portClassChip(cls) {
  return PORT_CLASS_CHIP[cls] ?? '';
}

export function portClassPlate(cls) {
  return PORT_CLASS_PLATE[cls] ?? (PORT_CLASS_PLATE.yard);
}

function ratioOf(used, cap) {
  const u = Number.isInteger(used) ? used : 0;
  const c = Number.isInteger(cap) ? cap : 0;
  if (c > 0) return u / c;
  return u > 0 ? 1 : 0;
}

function holdCount(row) {
  const held = Number.isInteger(row?.held) && row.held > 0 ? row.held : 0;
  const city = Number.isInteger(row?.heldCity) && row.heldCity > 0 ? row.heldCity : 0;
  return held + city;
}

function namedHoldGood(row, occupancy) {
  if (typeof row?.good === 'string' && row.good) return row.good;
  const cls = row?.cls;
  if (!cls || !occupancy?.byGood) return null;
  const match = occupancy.byGood.find((entry) => entry.cls === cls);
  return match?.good ?? null;
}

export function formatPortHoldPlate(row, occupancy = null) {
  const cls = portClassPlate(row?.cls);
  const used = Number.isInteger(row?.used) ? row.used : 0;
  const cap = Number.isInteger(row?.cap) ? row.cap : 0;
  const n = holdCount(row);
  const good = namedHoldGood(row, occupancy);
  const goodBit = good ? `${good} ` : '';
  return `PORT FULL · ${cls} ${used}/${cap} — ${n} ${goodBit}crates wait at anchor`;
}

export function standingBesideCopy(adjacentWarehouses) {
  const n = Number.isInteger(adjacentWarehouses) && adjacentWarehouses > 0
    ? adjacentWarehouses
    : 0;
  return `Beside the port · ${n} standing`;
}

function barModel(cls, slot) {
  const used = Number.isInteger(slot?.used) ? slot.used : 0;
  const cap = Number.isInteger(slot?.cap) ? slot.cap : 0;
  const ratio = ratioOf(used, cap);
  return Object.freeze({
    cls,
    label: portClassChip(cls),
    used,
    cap,
    ratio,
    pct: Math.max(0, Math.min(100, Math.round(ratio * 100))),
    hot: ratio >= PORT_BAR_HOT_RATIO,
    text: `${used}/${cap}`,
  });
}

export function portWarehouseModel(world) {
  const beat = Number.isInteger(world?.beat) ? world.beat : 0;
  const occupancy = portOccupancy(world ?? {});
  const rows = occupancy.byGood
    .filter((entry) => portStorageClass(entry.good) !== 'passenger')
    .map((entry) => Object.freeze({
      good: entry.good,
      label: ITEM_LABEL[entry.good] ?? entry.good,
      count: entry.count,
      cls: entry.cls,
      chip: portClassChip(entry.cls),
    }));
  const visible = rows.slice(0, PORT_WAREHOUSE_ROW_CAP);
  const more = Math.max(0, rows.length - visible.length);
  const holds = world ? portHoldRows(world, beat) : [];
  const holdPlates = holds.map((row) => formatPortHoldPlate(row, occupancy));
  const adjacent = occupancy.adjacentWarehouses;
  const empty = rows.length === 0;
  return Object.freeze({
    beat,
    header: `PORT WAREHOUSE · BEAT ${beat}`,
    bars: Object.freeze(STORED.map((cls) => barModel(cls, occupancy.byClass[cls]))),
    rows: Object.freeze(visible),
    more,
    moreChip: more > 0 ? `+${more} more` : '',
    empty,
    emptyCopy: PORT_WAREHOUSE_EMPTY,
    holds: Object.freeze(holdPlates),
    cta: portHoldCta(holds),
    standing: standingBesideCopy(adjacent),
    adjacentWarehouses: adjacent,
  });
}

// COPY-DRAFT: two short lines for the phone's port peek.
export const PORT_PEEK_NONE = 'No crates are stored yet.';
const PORT_PEEK_LINE_LIMIT = 40;

export function portPeekSummary(world) {
  const model = portWarehouseModel(world);
  const capacityLine = (format, separator = ' · ') => model.bars.map((bar) => {
    const label = bar.label[0] + bar.label.slice(1).toLowerCase();
    return `${label} ${format(bar.used)}/${format(bar.cap)}`;
  }).join(separator);
  let capacity = capacityLine(String);
  if (capacity.length > PORT_PEEK_LINE_LIMIT) capacity = capacityLine(String, '·');
  if (capacity.length > PORT_PEEK_LINE_LIMIT) {
    const compact = new Intl.NumberFormat('en-AU', { notation: 'compact', maximumSignificantDigits: 1 });
    capacity = capacityLine((n) => compact.format(n), '·');
  }
  const rows = model.rows.slice(0, 3);
  const total = model.rows.length + model.more;
  let goods = PORT_PEEK_NONE;
  while (total > 0) {
    const lines = rows.map((row) => `${row.label} ${row.count}`);
    const more = total - rows.length;
    // COPY-DRAFT: count of stored goods omitted from the short line.
    if (more > 0) lines.push(`+${more} more`);
    goods = lines.join(' · ');
    if (goods.length <= PORT_PEEK_LINE_LIMIT || !rows.length) break;
    rows.pop();
  }
  return { capacity, goods };
}

export function portPeekHtml(world) {
  const { capacity, goods } = portPeekSummary(world);
  return `<p class="port-peek" data-port-peek><span>${escapeHtml(capacity)}</span><span>${escapeHtml(goods)}</span></p>`;
}

function barHtml(bar) {
  const hot = bar.hot ? ' port-warehouse-fill--hot' : '';
  return `
    <div class="port-warehouse-bar" data-class="${escapeHtml(bar.cls)}" data-hot="${bar.hot ? '1' : '0'}">
      <span class="port-warehouse-bar-label">${escapeHtml(bar.label)}</span>
      <span class="port-warehouse-well">
        <span class="port-warehouse-fill${hot}" style="width:${bar.pct}%"></span>
      </span>
      <span class="port-warehouse-bar-count">${escapeHtml(bar.text)}</span>
    </div>`;
}

function rowHtml(row) {
  return `
    <div class="port-warehouse-row" data-good="${escapeHtml(row.good)}" data-class="${escapeHtml(row.cls)}">
      ${itemIconHtml(row.good, 16)}
      <span class="port-warehouse-row-label">${escapeHtml(row.label)}</span>
      <span class="port-warehouse-row-count">${escapeHtml(String(row.count))}</span>
      <span class="port-warehouse-chip">${escapeHtml(row.chip)}</span>
    </div>`;
}

export function renderPortWarehouse(model) {
  if (!model) return '';
  const holdBlock = model.holds.length
    ? `<div class="port-warehouse-hold" data-port-hold="1">
        ${model.holds.map((line) => `<p class="port-warehouse-hold-line">${escapeHtml(line)}</p>`).join('')}
        <p class="port-warehouse-cta">${escapeHtml(model.cta)}</p>
        <p class="port-warehouse-standing">${escapeHtml(model.standing)}</p>
      </div>`
    : '';
  const body = model.empty
    ? `<p class="port-warehouse-empty">${escapeHtml(model.emptyCopy)}</p>`
    : `<div class="port-warehouse-grid">
        ${model.rows.map((row) => rowHtml(row)).join('')}
        ${model.moreChip ? `<span class="port-warehouse-more">${escapeHtml(model.moreChip)}</span>` : ''}
      </div>`;
  return `
    <section class="port-warehouse" data-port-warehouse="1" aria-label="Port warehouse">
      <div class="port-warehouse-head">
        <span class="chrome-rivets" aria-hidden="true"></span>
        ${escapeHtml(model.header)}
      </div>
      <div class="port-warehouse-bars">
        ${model.bars.map((bar) => barHtml(bar)).join('')}
      </div>
      ${body}
      ${holdBlock}
    </section>`;
}

export function portWarehouseHtml(world) {
  return renderPortWarehouse(portWarehouseModel(world));
}

export function yardCapacityChipModel(world) {
  const occupancy = portOccupancy(world ?? {});
  const yard = occupancy.byClass.yard;
  const secure = occupancy.byClass.warehouse;
  const tank = occupancy.byClass.tank;
  const ratios = {
    yard: ratioOf(yard.used, yard.cap),
    warehouse: ratioOf(secure.used, secure.cap),
    tank: ratioOf(tank.used, tank.cap),
  };
  const peak = Math.max(ratios.yard, ratios.warehouse, ratios.tank);
  const tone = peak >= YARD_CHIP_RED_RATIO
    ? 'red'
    : (peak >= YARD_CHIP_AMBER_RATIO ? 'amber' : 'ok');
  const text = `PORT · yard ${yard.used}/${yard.cap} · secure ${secure.used}/${secure.cap} · tank ${tank.used}/${tank.cap}`;
  return Object.freeze({
    text,
    tone,
    ratios: Object.freeze(ratios),
    used: Object.freeze({
      yard: yard.used,
      warehouse: secure.used,
      tank: tank.used,
    }),
    cap: Object.freeze({
      yard: yard.cap,
      warehouse: secure.cap,
      tank: tank.cap,
    }),
  });
}

export function globeCargoVisible(shipment) {
  return !Number.isInteger(shipment?.landedBeat);
}
