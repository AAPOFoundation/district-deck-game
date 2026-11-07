// Compact Yard grid. One cell per WORLD_GOODS id except RAIL_CHAIN_INLINE
// (qty lives on the parent card). Alphabetical by label. Pure. No DOM writes.

import {
  WORLD_CITY_BY_ID,
  WORLD_GOODS,
  WORLD_TRADE_ROUTES,
} from '../../core/world/catalog.js';
import { canOpenTradeRoute } from '../../core/world/trade.js';
import { PROCESSES, STAGE_FACILITY } from '../../core/world/processes.js';
import { hasItemIcon, ITEM_LABEL, itemIconHtml } from './item-icons.js';
import { civ3RouteChip } from './desk-copy.js';
import { portStorageClass } from '../../core/world/port-storage.js';
import { portClassChip } from '../port-warehouse-card.js';

const MELBOURNE_ID = 'melbourne-inner';

const YARD_GRID_STYLE = `
.province-yard-grid{
  display:grid;
  gap:4px;
  padding:0;
}
.province-yard-priority{
  grid-template-columns:minmax(0,1fr);
}
.province-yard-closed-grid{
  grid-template-columns:repeat(7,minmax(0,1fr));
}
.province-yard-grid .province-yard-row-main{
  font-size:var(--chrome-type-1);
}
.province-yard-grid .province-yard-row-name,
.province-yard-grid .province-yard-row-count{
  font-size:var(--chrome-type-2);
  color:var(--chrome-bone);
}
.province-yard-grid .province-yard-row-count{
  color:var(--chrome-bone);
  font-variant-numeric:tabular-nums;
}
.province-yard-grid .is-armed .province-yard-row-count{
  color:var(--chrome-amber);
}
.province-yard-grid .province-yard-route-chip,
.province-yard-grid .province-yard-route-quiet{
  font-size:var(--chrome-type-1);
  color:var(--chrome-carbon);
}
.province-yard-grid .province-yard-row.is-shut:not(.is-stocked) .province-yard-row-main{
  background:var(--chrome-steel);
  border:2px solid var(--chrome-steel-high);
  box-shadow:var(--chrome-well);
  color:var(--chrome-carbon);
}
.province-yard-grid .province-yard-row.is-shut:not(.is-stocked) .province-yard-row-name,
.province-yard-grid .province-yard-row.is-shut:not(.is-stocked) .province-yard-route-quiet,
.province-yard-grid .province-yard-row.is-shut:not(.is-stocked) .province-yard-row-count{
  color:var(--chrome-carbon);
}
.province-yard-grid .province-yard-row.is-stocked:not(.is-armed) .province-yard-row-main{
  background:var(--chrome-ink);
  border:2px solid var(--chrome-steel-high);
  box-shadow:var(--chrome-well);
  color:var(--chrome-bone);
}
.province-yard-grid .province-yard-row.is-stocked:not(.is-armed) .province-yard-row-name{
  color:var(--chrome-bone);
}
.province-yard-grid .province-yard-row.is-stocked:not(.is-armed) .province-yard-row-count{
  color:var(--chrome-bone);
}
.province-yard-grid .province-yard-row[data-route-state="make-only"]:not(.is-armed) .province-yard-row-main{
  background:var(--chrome-steel);
  border:2px solid var(--chrome-steel-high);
  box-shadow:var(--chrome-well);
  color:var(--chrome-carbon);
}
.province-yard-grid .province-yard-row[data-route-state="make-only"]:not(.is-armed) .province-yard-row-name,
.province-yard-grid .province-yard-row[data-route-state="make-only"]:not(.is-armed) .province-yard-route-chip,
.province-yard-grid .province-yard-row[data-route-state="make-only"]:not(.is-armed) .province-yard-route-quiet,
.province-yard-grid .province-yard-row[data-route-state="make-only"]:not(.is-armed) .province-yard-row-count{
  color:var(--chrome-carbon);
}
.province-yard-grid .province-yard-row.is-armed .province-yard-row-main,
.province-yard-grid .province-yard-row.is-stocked.is-armed .province-yard-row-main,
.province-yard-grid .province-yard-row.is-shut.is-armed .province-yard-row-main,
.province-yard-grid .province-yard-row[data-route-state="held"].is-armed .province-yard-row-main,
.province-yard-grid .province-yard-row[data-route-state="make-only"].is-armed .province-yard-row-main{
  background:var(--chrome-amber-wash);
  border:2px solid var(--chrome-amber);
  box-shadow:var(--chrome-well),inset 0 -4px 0 var(--chrome-amber),inset 5px 0 0 var(--chrome-amber);
  color:var(--chrome-amber);
}
.province-yard-grid .province-yard-row.is-armed .province-yard-row-name,
.province-yard-grid .province-yard-row.is-armed .province-yard-row-count{
  color:var(--chrome-amber);
}
.province-yard-grid .province-yard-row[data-route-state="held"]:not(.is-armed) .province-yard-row-main{
  background:var(--chrome-steel);
  border:2px solid var(--chrome-steel-high);
  box-shadow:var(--chrome-well);
  color:var(--chrome-carbon);
}
.province-yard-grid .province-yard-row[data-route-state="held"]:not(.is-armed) .province-yard-row-name,
.province-yard-grid .province-yard-row[data-route-state="held"]:not(.is-armed) .province-yard-route-chip,
.province-yard-grid .province-yard-row[data-route-state="held"]:not(.is-armed) .province-yard-route-quiet{
  color:var(--chrome-carbon);
}
`;

export function yardLabel(good) {
  return ITEM_LABEL[good] ?? good;
}

/**
 * Alphabetical left→right, top→bottom. Label first, then id so a parallel
 * wave's new good slots in without a hardcoded roster.
 */
export function yardGoodIds(goods = WORLD_GOODS) {
  return Object.freeze([...goods].sort((a, b) => {
    const cmp = yardLabel(a).localeCompare(yardLabel(b), 'en', { sensitivity: 'base' });
    return cmp !== 0 ? cmp : a.localeCompare(b);
  }));
}

export const YARD_GOOD_IDS = yardGoodIds();

/** Chain outputs shown on the parent card. No rail cell of their own. */
export const RAIL_CHAIN_INLINE = Object.freeze([
  'enriched-uranium',
  'warhead',
  'missile-body',
]);

export function railGoodIds(goods = WORLD_GOODS) {
  return yardGoodIds(goods).filter((good) => !RAIL_CHAIN_INLINE.includes(good));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function deskName(cityId) {
  return WORLD_CITY_BY_ID[cityId]?.mapName ?? cityId;
}

function inboundBooksForGood(good) {
  return WORLD_TRADE_ROUTES.filter((route) => route.good === good && route.direction === 'inbound');
}

function outboundBooksForGood(good) {
  return WORLD_TRADE_ROUTES.filter((route) => route.good === good && route.direction === 'outbound');
}

function bookDesk(route) {
  if (!route) return '';
  if (route.direction === 'outbound' || route.from === MELBOURNE_ID) {
    return deskName(route.to);
  }
  return deskName(route.from);
}

function rankBook(world, route) {
  const row = world?.routes?.[route.id];
  const status = row?.status ?? 'closed';
  if (status === 'open') return 0;
  if (status === 'held') return 1;
  if (status === 'embargoed') return 2;
  if (status === 'cut') return 3;
  if (route.playerOpenable) return 4;
  return 5;
}

export function bestBookForGood(world, good) {
  const books = inboundBooksForGood(good);
  if (!books.length) return null;
  const ranked = [...books].sort((a, b) => rankBook(world, a) - rankBook(world, b));
  return ranked[0] ?? null;
}

export function bestOutboundBookForGood(world, good) {
  const books = outboundBooksForGood(good);
  if (!books.length) return null;
  const ranked = [...books].sort((a, b) => rankBook(world, a) - rankBook(world, b));
  return ranked[0] ?? null;
}

export function makeOnlyDeskId(good) {
  const process = PROCESSES.find((row) => (
    (row.outputs[good] ?? 0) > 0 || (row.byproducts[good] ?? 0) > 0
  ));
  if (!process) return null;
  const facility = process.facility ?? STAGE_FACILITY[process.id];
  return WORLD_CITY_BY_ID[facility] ? facility : null;
}

function makeOnlyDesk(good) {
  const facility = makeOnlyDeskId(good);
  if (!facility) return 'Melbourne';
  return WORLD_CITY_BY_ID[facility]?.mapName ?? facility ?? 'Melbourne';
}

/**
 * Route state from the good's best book.
 * Open · {desk} | Held · Nature has the book | Closed |
 * reducer wait reason | MADE AT {desk}
 */
export function yardRouteState(world, good) {
  const route = bestBookForGood(world, good);
  if (!route) {
    return Object.freeze({
      kind: 'make-only',
      greyed: false,
      tappable: true,
      routeId: null,
      chip: civ3RouteChip('make-only', makeOnlyDesk(good)),
      reason: '',
    });
  }
  const row = world?.routes?.[route.id] ?? { status: 'closed' };
  const desk = bookDesk(route);
  if (row.status === 'open') {
    return Object.freeze({
      kind: 'open',
      greyed: false,
      tappable: true,
      routeId: route.id,
      chip: civ3RouteChip('open', desk),
      reason: '',
    });
  }
  if (row.status === 'held') {
    return Object.freeze({
      kind: 'held',
      greyed: true,
      tappable: true,
      routeId: route.id,
      chip: civ3RouteChip('held'),
      reason: 'Held. Nature has the book.',
    });
  }
  if (row.status === 'embargoed' || row.status === 'cut') {
    const check = canOpenTradeRoute(world, route.id);
    return Object.freeze({
      kind: row.status,
      greyed: true,
      tappable: true,
      routeId: route.id,
      chip: check.reason || civ3RouteChip(row.status),
      reason: check.reason,
    });
  }
  if (route.playerOpenable) {
    return Object.freeze({
      kind: 'shut',
      greyed: true,
      tappable: true,
      routeId: route.id,
      chip: civ3RouteChip('shut'),
      reason: '',
    });
  }
  const check = canOpenTradeRoute(world, route.id);
  return Object.freeze({
    kind: 'held',
    greyed: true,
    tappable: true,
    routeId: route.id,
    chip: check.reason || 'The line is shut.',
    reason: check.reason,
  });
}

export function yardRowEmphasis(row) {
  if ((row?.count ?? 0) > 0) return 'key';
  if (row?.kind === 'open' || row?.kind === 'held' || row?.kind === 'make-only') return 'key';
  return 'quiet';
}

export function yardRowModel(world, good) {
  const route = yardRouteState(world, good);
  const inbound = bestBookForGood(world, good);
  const outbound = bestOutboundBookForGood(world, good);
  const outboundOpen = outbound && (world?.routes?.[outbound.id]?.status === 'open');
  const sellsChip = outboundOpen ? `SELLS · ${bookDesk(outbound)}` : '';
  const count = world?.stocks?.[good] ?? 0;
  const location = inbound ? bookDesk(inbound) : makeOnlyDesk(good);
  const storageClass = portStorageClass(good);
  const storageChip = portClassChip(storageClass);
  return Object.freeze({
    good,
    label: yardLabel(good),
    count,
    storageClass,
    storageChip,
    displayCount: count === 0 ? '–' : String(count),
    hasIcon: hasItemIcon(good),
    location,
    sellsChip,
    sellsRouteId: outboundOpen ? outbound.id : null,
    openFee: inbound?.openFee ?? null,
    ...route,
  });
}

export function yardListModels(world, goods = WORLD_GOODS) {
  return yardGoodIds(goods).map((good) => yardRowModel(world, good));
}

export function yardRowHtml(row, options = {}) {
  const routeAttr = row.routeId ? ` data-route="${escapeHtml(row.routeId)}"` : '';
  const grey = row.greyed ? ' is-greyed' : '';
  const stocked = row.count > 0 ? ' is-stocked' : '';
  const shut = row.kind === 'shut' ? ' is-shut' : '';
  const armedGood = options.armedGood ?? options.selectedGood ?? null;
  const isArmed = armedGood === row.good;
  const armed = isArmed ? ' is-armed' : '';
  const emphasis = yardRowEmphasis(row);
  const quiet = emphasis === 'quiet';
  const chipText = quiet && row.kind === 'shut' ? 'Closed' : row.chip;
  const chipClass = quiet ? 'province-yard-route-quiet' : 'province-yard-route-chip';
  return `
    <article class="province-yard-row${grey}${stocked}${shut}${armed}"
             data-yard-cell="1"
             data-good="${escapeHtml(row.good)}"
             data-armed="${isArmed ? '1' : '0'}"
             data-route-state="${escapeHtml(row.kind)}"
             data-emphasis="${emphasis}"
             data-greyed="${row.greyed ? '1' : '0'}"
             data-has-qty="${row.count > 0 ? '1' : '0'}"
             ${routeAttr}>
      <button type="button"
              class="province-yard-row-main"
              data-good="${escapeHtml(row.good)}"
              data-worktree="${escapeHtml(row.good)}"
              ${row.storageChip ? `title="${escapeHtml(row.storageChip)}"` : ''}
              ${row.storageClass ? `data-storage-class="${escapeHtml(row.storageClass)}"` : ''}
              ${row.routeId ? `data-route="${escapeHtml(row.routeId)}"` : ''}
              ${row.tappable ? '' : 'disabled'}
              ${armed ? 'aria-pressed="true"' : 'aria-pressed="false"'}>
        ${itemIconHtml(row.good)}
        <span class="province-yard-row-name">${escapeHtml(row.label)}</span>
        <b class="province-yard-row-count">${escapeHtml(row.displayCount)}</b>
        <small class="${chipClass}">${escapeHtml(chipText)}</small>
      </button>
    </article>
  `;
}

/**
 * A closed, empty book carries no per-row action copy beyond "Closed". Keep
 * that state on the group and accessible name, then give the register room for
 * every full good name instead of repeating the same second line 62 times.
 */
export function yardClosedChipHtml(row, options = {}) {
  const routeAttr = row.routeId ? ` data-route="${escapeHtml(row.routeId)}"` : '';
  const label = `${row.label} — Closed — none in the Yard`;
  // SUITE-T7: a closed book can still be armed (its route is opened from the rail),
  // so the chip carries the same armed state as a priority row.
  const isArmed = (options.armedGood ?? options.selectedGood ?? null) === row.good;
  return `
    <article class="province-yard-row province-yard-row--closed-chip is-greyed is-shut${isArmed ? ' is-armed' : ''}"
             data-yard-cell="1"
             data-good="${escapeHtml(row.good)}"
             data-armed="${isArmed ? '1' : '0'}"
             data-route-state="shut"
             data-emphasis="quiet"
             data-greyed="1"
             data-has-qty="0"
             ${routeAttr}>
      <button type="button"
              class="province-yard-row-main province-yard-closed-chip"
              data-good="${escapeHtml(row.good)}"
              data-worktree="${escapeHtml(row.good)}"
              ${row.storageChip ? `title="${escapeHtml(`${label}. ${row.storageChip}`)}"` : `title="${escapeHtml(label)}"`}
              ${row.storageClass ? `data-storage-class="${escapeHtml(row.storageClass)}"` : ''}
              ${row.routeId ? `data-route="${escapeHtml(row.routeId)}"` : ''}
              aria-label="${escapeHtml(label)}"
              aria-pressed="${isArmed ? 'true' : 'false'}">
        ${itemIconHtml(row.good)}
        <span class="province-yard-row-name">${escapeHtml(row.label)}</span>
      </button>
    </article>
  `;
}

export function yardListHtml(world, options = {}) {
  const goods = options.goods ?? WORLD_GOODS;
  const rows = yardListModels(world, railGoodIds(goods));
  const closed = rows.filter((row) => row.kind === 'shut' && row.count === 0);
  const priority = rows.filter((row) => !(row.kind === 'shut' && row.count === 0));
  return `
    <div class="province-yard-wrap">
      <style>${YARD_GRID_STYLE}</style>
      <section class="province-yard-book-group province-yard-book-group--priority"
               aria-labelledby="province-yard-priority-title">
        <p class="province-yard-group-title" id="province-yard-priority-title">
          <span>Open · made here · advice</span><b>${priority.length}</b>
        </p>
        <div class="province-yard-grid province-yard-priority" data-yard-priority="1">
          ${priority.map((row) => yardRowHtml(row, options)).join('')}
        </div>
      </section>
      <details class="province-yard-book-group province-yard-book-group--closed"
               data-yard-closed="1"${options.closedBooksOpen === true ? ' open' : ''}>
        <summary class="province-yard-group-title" id="province-yard-closed-title">
          <span>Closed books</span><b>${closed.length}</b>
        </summary>
        <div class="province-yard-grid province-yard-closed-grid" data-yard-grid="1">
          ${closed.map((row) => yardClosedChipHtml(row, options)).join('')}
        </div>
      </details>
    </div>
  `;
}

/** Read before replacing the grid: refreshes must preserve the player's disclosure. */
export function yardDisclosureOptions(container) {
  return { closedBooksOpen: container.querySelector('[data-yard-closed]')?.open === true };
}

/** Covered-or-inlined: every catalog id is on the rail or in RAIL_CHAIN_INLINE. */
export function assertYardCoversWorldGoods(goods = WORLD_GOODS) {
  const listed = [...yardGoodIds(goods)].sort();
  const catalog = [...goods].sort();
  const inlined = catalog.filter((id) => RAIL_CHAIN_INLINE.includes(id));
  const html = yardListHtml({ stocks: {}, routes: {} }, { goods });
  const cells = [...html.matchAll(/data-yard-cell="1"[^>]*data-good="([^"]+)"/g)].map((row) => row[1]);
  const expectedCells = catalog.filter((id) => !RAIL_CHAIN_INLINE.includes(id)).sort();
  const cellSet = [...cells].sort();
  const listedMatch = listed.length === catalog.length
    && listed.every((id, i) => id === catalog[i]);
  const cellsMatch = cellSet.length === expectedCells.length
    && cellSet.every((id, i) => id === expectedCells[i]);
  const uniqueCells = new Set(cells).size === cells.length;
  return Object.freeze({
    ok: listedMatch && cellsMatch && uniqueCells,
    listed,
    catalog,
    cells,
    inlined,
    missing: catalog.filter((id) => !listed.includes(id)),
    extra: listed.filter((id) => !goods.includes(id)),
    uncovered: expectedCells.filter((id) => !cellSet.includes(id)),
  });
}
