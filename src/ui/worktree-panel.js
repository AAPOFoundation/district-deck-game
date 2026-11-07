// Merged globe resource card (was "How it's made"). Chrome idiom. Pure HTML.
// City facility stage panel stays on the parcel card.

import { handlingFeeForGood, WORLD_CITY_BY_ID } from '../core/world/catalog.js';
import { canOpenTradeRoute } from '../core/world/trade.js';
import {
  COMBO_CHIPS,
  DELAY_CLASSES,
  FACILITY_HOST_WORD,
  PROCESS_BY_ID,
  PROCESS_CHAINS,
  PROCESSES,
  TIME_COST_PER_BEAT,
  canHostProcessInCity,
  comboChipCopy,
  facilityHostsProcess,
  importCapexOf,
  importCostOf,
  isMineMakeDesk,
  processOf,
  processesHostedBy,
  unitCapexOf,
  unitCostOf,
  wageBill,
} from '../core/world/processes.js';
import { comboStateFor, standingProcessForm } from '../core/process-runs.js';
import { createCity } from '../core/city.js';
import { deserialiseState } from '../core/state.js';
import { SIM_REVISION } from '../core/content.js';
import { bestBookForGood, RAIL_CHAIN_INLINE, yardRowModel } from './world-map/yard-list.js';
import { ITEM_LABEL, itemIconHtml } from './world-map/item-icons.js';
import {
  bookButtonLabel,
  bookRouteTitle,
  bookStatusLabel,
  booksHeadingCopy,
  civ3MakeToggle,
  civ3StageMode,
  deskBlurb,
  deskCityForGood,
  goodTitle,
  liveBookRegister,
  madeAtCopy,
  madeAtRouteExplain,
  primaryGoodForDesk,
  resourceCardBooks,
} from './world-map/desk-copy.js';

const LAST_RUN_KEY = 'district-deck:v305:last-run';
const MELBOURNE_ID = 'melbourne-inner';
let liveComboCache = { raw: null, combo: null };

const RESOURCE_CARD_STYLE = `
.province-resource-card{
  display:grid;
  gap:12px;
  color:var(--chrome-bone);
  font:500 var(--chrome-type-1)/1.3 var(--body);
}
.province-resource-zone-identity{
  display:grid;
  gap:6px;
  padding:0 0 10px;
  border-bottom:1px solid var(--chrome-steel-mid);
}
.province-resource-zone-identity .province-resource-head{
  grid-template-columns:20px minmax(0,1fr) auto;
  gap:6px 8px;
}
.province-resource-zone-identity .item-icon{
  width:20px;
  height:20px;
}
.province-resource-zone-identity .province-resource-name{
  font-size:var(--chrome-type-3);
  line-height:1.15;
  color:var(--chrome-bone);
}
.province-resource-zone-identity .province-resource-qty{
  font-size:var(--chrome-type-3);
  line-height:1;
  color:var(--chrome-amber);
}
.province-resource-zone-identity .province-resource-loc{
  font-size:var(--chrome-type-1);
  color:var(--chrome-carbon);
}
.province-resource-zone-economics{
  display:grid;
  gap:8px;
  padding:0 0 10px;
  border-bottom:1px solid var(--chrome-steel-mid);
}
.province-resource-card .province-resource-fees{
  display:grid;
  gap:4px;
  margin:0;
}
.province-resource-zone-identity .province-resource-desk{
  display:grid;
  gap:4px;
  margin:4px 0 0;
  color:var(--chrome-carbon);
  font:500 var(--chrome-type-1)/1.35 var(--body);
  text-transform:none;
  letter-spacing:0;
}
.province-resource-zone-identity .province-resource-desk-name{
  color:var(--chrome-bone);
  font:800 var(--chrome-type-2)/1.2 var(--mono);
  letter-spacing:var(--chrome-track-3);
  text-transform:uppercase;
}
.province-resource-card .province-resource-metric{
  display:grid;
  grid-template-columns:7.5em minmax(0,1fr);
  column-gap:8px;
  align-items:baseline;
}
.province-resource-card .province-resource-metric em{
  color:var(--chrome-carbon);
  font:700 var(--chrome-type-1)/1.2 var(--mono);
  font-style:normal;
  letter-spacing:var(--chrome-track-3);
  text-transform:uppercase;
}
.province-resource-card .province-resource-metric b{
  color:var(--chrome-bone);
  font:800 var(--chrome-type-2)/1.2 var(--mono);
  font-variant-numeric:tabular-nums;
}
.province-resource-card .process-worktree-metrics{
  display:grid;
  gap:4px;
}
.province-resource-card .process-worktree-cost,
.province-resource-card .process-worktree-cost-capex{
  display:grid;
  gap:4px;
  margin:0;
}
.province-resource-card .process-worktree-cost .province-resource-metric b{
  color:var(--chrome-bone);
}
.province-resource-card .process-worktree-cost .province-resource-metric:first-child b{
  color:var(--chrome-amber);
}
.province-resource-card .process-worktree-cost-capex small{
  color:var(--chrome-carbon);
  font:500 var(--chrome-type-1)/1.3 var(--body);
}
.province-resource-card .province-resource-books-heading,
.province-resource-card .province-resource-books{
  flex:1 1 100%;
  display:grid;
  gap:8px;
  width:100%;
}
.province-resource-card .province-book-title{
  color:var(--chrome-amber);
  font:800 var(--chrome-type-2)/1.25 var(--mono);
  letter-spacing:var(--chrome-track-3);
  text-transform:uppercase;
  min-width:0;
}
.province-resource-card .province-resource-books-heading{
  margin:0 0 2px;
  color:var(--chrome-carbon);
  font:700 var(--chrome-type-1)/1.2 var(--mono);
  letter-spacing:var(--chrome-track-3);
  text-transform:uppercase;
}
.province-resource-card .province-book{
  display:grid;
  gap:4px;
  padding:8px 0 0;
  border-top:1px solid var(--chrome-steel);
}
.province-resource-card .province-book-line{
  display:flex;
  gap:8px;
  justify-content:space-between;
  align-items:baseline;
}
.province-resource-card .province-book p{
  margin:0;
  color:var(--chrome-carbon);
  font:500 var(--chrome-type-1)/1.35 var(--body);
  text-transform:none;
  letter-spacing:0;
}
.province-resource-card .province-resource-synergy{
  display:grid;
  gap:4px;
}
.province-resource-card .province-resource-disclose{
  margin:2px 0 0;
  padding-top:8px;
  border-top:1px solid var(--chrome-steel);
}
.province-resource-card .province-resource-disclose>summary{
  color:var(--chrome-carbon);
  cursor:pointer;
  font:700 var(--chrome-type-1)/1.2 var(--mono);
  letter-spacing:var(--chrome-track-3);
  text-transform:uppercase;
}
.province-resource-zone-actions{
  padding:4px 0 14px;
}
.province-resource-card .province-resource-actions{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  align-items:stretch;
}
.province-resource-card .is-dominant-action{
  flex:1 1 100%;
  display:flex;
}
.province-resource-card .is-dominant-action>button,
.province-resource-card .is-dominant-action>.province-open-book:not(:disabled),
.province-resource-card .is-dominant-action>.province-resource-closed{
  flex:1 1 auto;
  min-height:36px;
  padding:10px 12px;
  border:2px solid var(--chrome-amber);
  background:var(--chrome-amber);
  box-shadow:var(--chrome-bevel);
  color:var(--chrome-ink);
  font:800 var(--chrome-type-3)/1.15 var(--mono);
  letter-spacing:var(--chrome-track-2);
  text-transform:uppercase;
}
.province-resource-card .is-dominant-action.is-closed>button,
.province-resource-card .is-dominant-action.is-closed>.province-open-book:not(:disabled),
.province-resource-card .is-dominant-action.is-closed>.province-resource-closed{
  background:var(--chrome-steel-mid);
  border-color:var(--chrome-amber);
  color:var(--chrome-bone);
  box-shadow:var(--chrome-well);
}
.province-resource-card .province-resource-actions>button,
.province-resource-card .province-resource-actions>.province-open-book:not(:disabled),
.province-resource-card .province-resource-actions>.province-make-toggle{
  flex:1 1 30%;
  min-width:0;
  padding:6px 8px;
  border:1px solid var(--chrome-steel-high);
  background:var(--chrome-ink);
  box-shadow:var(--chrome-well);
  color:var(--chrome-carbon);
  font:800 var(--chrome-type-1)/1.15 var(--mono);
  letter-spacing:var(--chrome-track-3);
  text-transform:uppercase;
}
.province-resource-card .province-resource-actions>button:disabled{
  opacity:1;
  border-color:var(--chrome-steel-high);
  background:var(--chrome-steel);
  color:var(--chrome-bone);
}
`;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function money(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const value = Math.round(n);
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return `$${value.toLocaleString('en-AU')}`;
}

export const SOURCE_LINE = Object.freeze({
  wine: 'Grown and bottled at Bordeaux. Ships by steamer.',
  beef: 'Raised in Melbourne yards. Ships as offtake.',
  coffee: 'Grown at Santos. Ships for the kitchens.',
  cocoa: 'Grown in Ghana. Ships for the kitchens.',
  food: 'Grain from Melbourne plots and inbound lines.',
  beer: 'Brewed in Hobart. A steamer crosses Bass Strait.',
  'milk-powder': 'Dried in Melbourne dairies. Ships as offtake.',
  tourists: 'Tourists arrive on open visitor lines.',
  people: 'Labour arrives from Mumbai each open beat.',
  asylum: 'People arrive when the guns open.',
  credit: 'Sydney prices a cash line. Repay each beat.',
  biotech: 'Melbourne labs sell licences on offtake lines.',
  education: 'Tuition seats ship to Tokyo.',
  tiles: 'Tile and stone land on inbound lines.',
  timber: 'Jakarta hardwood lands on inbound lines.',
  furniture: 'Ho Chi Minh furniture lands for inner rooms.',
  modular: 'Whole rooms land as inbound crates.',
  autos: 'Nagoya cars land on inbound lines.',
  lng: 'Qatari gas lands on inbound lines.',
  gold: 'Johannesburg bullion lands on inbound lines.',
  marble: 'Carrara marble lands on inbound lines.',
  warships: 'Port Adelaide hulls steam the Bight.',
  starlink: 'A constellation link from Boca.',
  alien: 'Polar alien tech. Yields while the base holds.',
  oil: 'Hormuz crude lands on inbound lines.',
  copper: 'Chilean copper lands for wiring.',
  titanium: 'Eneabba titanium lands for airframes.',
  machinery: 'Shanghai plant machinery lands for the works.',
  materials: 'Slag and red mud from furnace and Bayer.',
  frames: 'Frame parts wait on a later chain.',
  compute: 'Assembled in Melbourne from chips.',
  fittings: 'Cut in the works hall from steel.',
  paper: 'Pulped from timber in the works hall.',
  ink: 'Shanghai printing ink. Ships for the press.',
  bibles: 'Pressed from paper and ink in the works hall.',
});

export function chainForGood(good) {
  if (PROCESS_CHAINS[good]) {
    return Object.freeze({ name: good, stages: PROCESS_CHAINS[good] });
  }
  for (const [name, stages] of Object.entries(PROCESS_CHAINS)) {
    for (let i = 0; i < stages.length; i += 1) {
      const row = PROCESS_BY_ID[stages[i]];
      if ((row?.outputs[good] ?? 0) > 0) {
        return Object.freeze({ name, stages: Object.freeze(stages.slice(0, i + 1)) });
      }
    }
  }
  const solo = PROCESSES.find((row) => (row.outputs[good] ?? 0) > 0);
  if (solo) return Object.freeze({ name: good, stages: Object.freeze([solo.id]) });
  return null;
}

/** Uranium's card presents the whole Olympic Dam chain. Cost compare stays ore-only. */
export function cardChainForGood(good) {
  if (good === 'uranium' && PROCESS_CHAINS.nuke) {
    return Object.freeze({ name: 'uranium', stages: PROCESS_CHAINS.nuke });
  }
  return chainForGood(good);
}

export function elementsLine(good) {
  const chain = chainForGood(good);
  if (!chain) return '';
  const seen = [];
  for (const id of chain.stages) {
    const row = PROCESS_BY_ID[id];
    for (const el of row?.elements ?? []) {
      if (!seen.includes(el)) seen.push(el);
    }
  }
  return seen.join(' · ');
}

export function riskLine(process) {
  const row = typeof process === 'string' ? PROCESS_BY_ID[process] : process;
  if (!row) return '';
  const errorPct = (row.errorChanceBp / 100).toFixed(1);
  let prone = DELAY_CLASSES[0];
  let best = -1;
  for (const klass of DELAY_CLASSES) {
    const bp = row.delayBp?.[klass] ?? 0;
    if (bp > best) {
      best = bp;
      prone = klass;
    }
  }
  return `Works misfire in ${errorPct} of a hundred runs · prone to ${prone}`;
}

function facilityName(process) {
  const host = FACILITY_HOST_WORD[process.facility];
  if (host) return host.replace(/^the /, '');
  return WORLD_CITY_BY_ID[process.facility]?.mapName ?? process.facility;
}

function stageModeKey(mode) {
  if (mode === 'CAN MAKE') return 'can-make';
  if (mode === 'MAKE') return 'make';
  return 'import';
}

function stageMode(world, process, standingIds) {
  if (process.tier === 'mine' && isMineMakeDesk(process.facility)) {
    const on = world?.ambition?.mineMake?.[process.facility] === true;
    return on ? 'MAKE' : 'IMPORT';
  }
  if (canHostProcessInCity(process)) {
    return standingIds.has(process.id) ? 'MAKE' : 'CAN MAKE';
  }
  return 'IMPORT';
}

function stageHtml(world, processId, standingIds, options = {}) {
  const process = PROCESS_BY_ID[processId];
  if (!process) return '';
  const mode = stageMode(world, process, standingIds);
  const outputGood = Object.keys(process.outputs ?? {})[0] ?? null;
  const inline = Boolean(options.inlineQty && outputGood && RAIL_CHAIN_INLINE.includes(outputGood));
  const count = world?.stocks?.[outputGood] ?? 0;
  const qty = inline
    ? `<b class="process-worktree-inline-qty" data-inline-good="${escapeHtml(outputGood)}">${escapeHtml(ITEM_LABEL[outputGood] ?? outputGood)} ${count === 0 ? '–' : String(count)}</b>`
    : '';
  const madeAtDesk = WORLD_CITY_BY_ID[process.facility]?.mapName ?? facilityName(process);
  const modeLine = processId === 'enrichment'
    ? `<span class="process-worktree-made-at" data-made-at="1"> — ${escapeHtml(madeAtCopy(madeAtDesk))}</span>`
    : `<span class="process-worktree-mode" data-mode="${stageModeKey(mode)}"> — ${escapeHtml(civ3StageMode(mode))}</span>`;
  return `
    <li class="process-worktree-stage" data-stage="${escapeHtml(process.id)}"${inline ? ` data-inline-good="${escapeHtml(outputGood)}"` : ''}>
      <strong>${escapeHtml(process.label)}</strong>
      ${modeLine}
      <span class="process-worktree-facility"> — ${escapeHtml(facilityName(process))}</span>
      ${qty}
      <span class="process-worktree-risk"> — ${escapeHtml(riskLine(process))}</span>
    </li>
  `;
}

export function costCompareHtml(good) {
  const chain = chainForGood(good);
  const make = chain ? unitCostOf(chain.stages) : null;
  const makeCapex = chain ? unitCapexOf(chain.stages) : null;
  const imported = importCostOf(good);
  const importedCapex = importCapexOf(good);
  if (make == null && imported == null) return '';
  const makeLine = make == null
    ? ''
    : `<span class="province-resource-metric"><em>Domestic production</em><b> — ${money(make)} per crate</b></span>`;
  const importLine = imported == null
    ? '<span class="province-resource-metric"><em>Imported</em><b> — no inbound line</b></span>'
    : `<span class="province-resource-metric"><em>Imported</em><b> — ${money(imported)} per crate</b></span>`;
  const makeCapexLine = make == null
    ? ''
    : `<small>Founding works — ${money(makeCapex ?? 0)} per crate</small>`;
  const importCapexLine = imported == null
    ? ''
    : `<small>Inbound works — ${money(importedCapex ?? 0)} per crate</small>`;
  return `
    <div class="process-worktree-metrics">
      <p class="process-worktree-cost">${makeLine}${importLine}</p>
      <p class="process-worktree-cost-capex">${makeCapexLine}${importCapexLine}</p>
    </div>
  `;
}

function warmLiveCombo(store = globalThis.localStorage) {
  try {
    const raw = store && typeof store.get === 'function'
      ? store.get(LAST_RUN_KEY)
      : store?.getItem?.(LAST_RUN_KEY);
    if (!raw) {
      liveComboCache = { raw: null, combo: null, state: null };
      return liveComboCache;
    }
    if (liveComboCache.raw !== raw) {
      const envelope = JSON.parse(raw);
      if (envelope.simRevision !== SIM_REVISION) {
        liveComboCache = { raw, combo: null, state: null };
      } else {
        const parsed = JSON.parse(envelope.canonicalState);
        const city = createCity({ seed: parsed.seed });
        const state = deserialiseState(envelope.canonicalState, { city });
        liveComboCache = { raw, combo: comboStateFor(city, state), state };
      }
    }
    return liveComboCache;
  } catch {
    liveComboCache = { raw: null, combo: null, state: null };
    return liveComboCache;
  }
}

function comboMatchesGood(row, good, chain, state) {
  for (const parcelId of row.parcelIds ?? []) {
    const process = processOf(state?.holdings?.[parcelId]?.processId);
    if (!process) continue;
    if ((process.outputs?.[good] ?? 0) > 0) return true;
    if (chain?.stages.includes(process.id)) return true;
  }
  return false;
}

/**
 * Chip + linked stage count from comboStateFor only. A chain that does
 * not produce this good never donates its tier.
 */
export function comboAuthorityForGood(good, combo, state, chain = chainForGood(good)) {
  if (!combo?.chains?.length) return Object.freeze({ chip: '', linked: 0 });
  let chip = '';
  let linked = 0;
  for (const row of combo.chains) {
    if (!comboMatchesGood(row, good, chain, state)) continue;
    const stages = Number.isInteger(row.stages) ? row.stages : 0;
    if (row.chip && stages >= linked) {
      chip = row.chip;
      linked = stages;
    } else if (!chip && stages > linked) {
      linked = stages;
    }
  }
  return Object.freeze({ chip, linked });
}

function liveComboContext(store, extra = {}) {
  if (extra.combo || extra.state || extra.city) {
    const state = extra.state ?? null;
    const combo = extra.combo ?? (extra.city && state ? comboStateFor(extra.city, state) : null);
    return { combo, state };
  }
  return warmLiveCombo(store);
}

/**
 * Live combo from the same-origin city save. Globe resource card entry:
 * resourceCardHtml → synergyModelForGood. Public comboChip inputs are
 * validated against comboStateFor and dropped. No chip on this good's
 * chain means no chip — never the first city chip.
 */
export function liveComboChipForGood(good, store = globalThis.localStorage, extra = {}) {
  const cache = liveComboContext(store, extra);
  if (!cache.combo) return '';
  return comboAuthorityForGood(good, cache.combo, cache.state).chip;
}

function makeDeskForGood(good) {
  const process = PROCESSES.find((row) => (
    row.tier === 'mine' && (row.outputs[good] ?? 0) > 0 && isMineMakeDesk(row.facility)
  ));
  return process?.facility ?? null;
}

const NEXT_CHIP = Object.freeze({
  1: COMBO_CHIPS[2],
  2: COMBO_CHIPS[3],
  3: COMBO_CHIPS[4],
  4: COMBO_CHIPS[5],
});

function standingCityStages(chain, state) {
  const standing = [];
  const seen = new Set();
  for (const parcelId of Object.keys(state?.holdings ?? {}).sort()) {
    const holding = state.holdings[parcelId];
    if (holding?.owner && holding.owner !== 'player') continue;
    const process = processOf(holding.processId);
    if (!process || !chain?.stages.includes(process.id)) continue;
    if (!canHostProcessInCity(process)) continue;
    const form = standingProcessForm(null, state, parcelId);
    if (!facilityHostsProcess(form, process)) continue;
    if (seen.has(process.id)) continue;
    seen.add(process.id);
    standing.push(process.label);
  }
  return { standing, seen };
}

function nextSynergyLine(cityStages, standing, seen, linked, chip) {
  // Empty when there is nothing actionable — the adjacency line already
  // says "none standing", and restating it read as a duplicate (V5.1).
  if (!cityStages.length) return '';
  const peak = Math.min(5, cityStages.length);
  if (linked >= 2 && linked >= peak) {
    return `Adjacency · ${comboChipCopy(peak) || chip} holds`;
  }
  if (linked < 2) {
    if (cityStages.length < 2) return '';
    if (standing.length >= 2) {
      return `Adjacency · co-locate ${standing[0]} and ${standing[1]} for ${COMBO_CHIPS[2]}`;
    }
    if (standing.length === 0) {
      const first = PROCESS_BY_ID[cityStages[0]]?.label ?? cityStages[0];
      const second = PROCESS_BY_ID[cityStages[1]]?.label ?? cityStages[1];
      return `Adjacency · co-locate ${first} and ${second} for ${COMBO_CHIPS[2]}`;
    }
  }
  const nextChip = NEXT_CHIP[Math.min(4, Math.max(1, linked))] ?? COMBO_CHIPS[2];
  const remain = cityStages.find((id) => !seen.has(id));
  const nextLabel = remain ? (PROCESS_BY_ID[remain]?.label ?? remain) : 'the next stage';
  return `Adjacency · co-locate ${nextLabel} for ${nextChip}`;
}

export function warnInjectedComboChip(injected, derived) {
  if (typeof injected !== 'string' || injected === '') return;
  if (injected === derived) return;
  const production = typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';
  if (production) return;
  console.warn(
    `[district-deck] ignored injected combo chip ${injected}; comboStateFor derived ${derived || 'none'}`,
  );
}

export function synergyModelForGood(good, {
  comboChip = '',
  store = globalThis.localStorage,
  city = null,
  state = null,
  combo = null,
} = {}) {
  const chain = chainForGood(good);
  const cache = liveComboContext(store, { city, state, combo });
  const cityStages = (chain?.stages ?? []).filter((id) => canHostProcessInCity(id));
  const { standing, seen } = standingCityStages(chain, cache.state);
  const authority = comboAuthorityForGood(good, cache.combo, cache.state, chain);
  const linked = authority.linked;
  warnInjectedComboChip(comboChip, authority.chip);
  const chip = authority.chip;
  const standingLine = standing.length
    ? `CITY WORKS — ${standing.join(' · ')}`
    : 'CITY WORKS — none built';
  const adjacencyLine = chip
    ? `ADJACENCY BONUS — ${chip}`
    : 'ADJACENCY BONUS — none standing';
  const nextLine = nextSynergyLine(cityStages, standing, seen, linked, chip);
  return Object.freeze({
    standing: Object.freeze(standing),
    standingIds: Object.freeze([...seen]),
    chip,
    linked,
    standingLine,
    adjacencyLine,
    tierLine: adjacencyLine,
    nextLine,
  });
}

function feesHtml(world, row) {
  const handle = `${money(handlingFeeForGood(row.good))} per shipment`;
  return `
    <div class="province-resource-fees">
      <span class="province-resource-metric"><em>Trade route</em><b> — ${escapeHtml(row.chip)}</b></span>
      <span class="province-resource-metric"><em>Harbour fees</em><b> — ${escapeHtml(handle)}</b></span>
    </div>
  `;
}

/**
 * Live decision on the merged card.
 * MAKE wins while a mine-make desk is on, or when MAKE is the only lever.
 * Otherwise IMPORT (the inbound book) is the live decision.
 */
export function dominantResourceAction(world, good) {
  const desk = makeDeskForGood(good);
  const makeOn = desk ? world?.ambition?.mineMake?.[desk] === true : false;
  const route = bestBookForGood(world, good);
  const openable = Boolean(route?.playerOpenable);
  if (desk && makeOn) return 'make';
  if (openable) return 'import';
  if (desk) return 'make';
  return 'import';
}

function wrapDominant(kind, dominant, html, closed = false) {
  if (kind !== dominant) return html;
  const closedClass = closed ? ' is-closed' : '';
  return `<span class="is-dominant-action${closedClass}">${html}</span>`;
}

function bookRowHtml(world, route, {
  dominant = false,
  closed = false,
} = {}) {
  const row = world?.routes?.[route.id] ?? { status: 'closed' };
  const check = world?.routes
    ? canOpenTradeRoute(world, route.id)
    : { ok: false, fee: route.openFee ?? 0, reason: '' };
  const remaining = row.untilBeat == null || world?.beat == null
    ? null
    : Math.max(0, row.untilBeat - world.beat);
  const title = bookRouteTitle(route);
  const reasonId = `province-book-reason-${route.id}`;
  const reason = check.ok ? '' : check.reason;
  const button = `<button type="button"
              class="province-open-book"
              data-route="${escapeHtml(route.id)}"
              aria-describedby="${escapeHtml(reasonId)}"
              ${check.ok ? '' : 'disabled'}>${escapeHtml(bookButtonLabel(route, row, check.fee))}</button>`;
  const wrapped = dominant
    ? wrapDominant('import', 'import', button, closed && !check.ok)
    : button;
  return `
    <article class="province-book" data-status="${escapeHtml(row.status)}" data-route="${escapeHtml(route.id)}" data-book-title="${escapeHtml(title)}">
      <div class="province-book-line">
        <strong class="province-book-title">${escapeHtml(title)}</strong>
        <span class="province-book-status" data-status="${escapeHtml(row.status)}"> — ${escapeHtml(bookStatusLabel(route, row, remaining))}</span>
      </div>
      <p>${escapeHtml(liveBookRegister(route, row, world))}</p>
      ${route.loan ? '' : `<p class="v4-book-recurring">Harbour: ${escapeHtml(money(handlingFeeForGood(route.good)))} per delivered crate.</p>`}
      ${wrapped}
      <p class="province-book-reason" id="${escapeHtml(reasonId)}" ${reason ? '' : 'hidden'}>
        ${escapeHtml(reason)}
      </p>
    </article>
  `;
}

function resourceActionsHtml(world, good, row, deskCityId = null) {
  const route = bestBookForGood(world, good);
  const status = route ? (world?.routes?.[route.id]?.status ?? 'closed') : '';
  const check = route && world?.routes
    ? canOpenTradeRoute(world, route.id)
    : { ok: false, fee: route?.openFee ?? 0, reason: '' };
  const openable = Boolean(route?.playerOpenable);
  const canOpen = openable && status === 'closed' && check.ok;
  const desk = makeDeskForGood(good);
  const makeOn = desk ? world?.ambition?.mineMake?.[desk] === true : false;
  const dominant = dominantResourceAction(world, good);
  const importClosed = status !== 'open';
  const deskId = deskCityId ?? deskCityForGood(good);
  const books = row.kind === 'make-only'
    ? resourceCardBooks(good, null)
    : resourceCardBooks(good, deskId);
  const heading = books.length ? booksHeadingCopy(books) : '';
  const primaryIndex = Math.max(0, books.findIndex((candidate) => candidate.good === good));
  const bookHtml = books.map((candidate, index) => {
    const isPrimary = dominant === 'import' && index === primaryIndex;
    return bookRowHtml(world, candidate, {
      dominant: isPrimary,
      closed: isPrimary && importClosed && !canOpen,
    });
  }).join('');
  let makeButton = desk
    ? `<button type="button"
               class="province-make-toggle"
               data-desk="${escapeHtml(desk)}"
               data-on="${makeOn ? '1' : '0'}">${escapeHtml(civ3MakeToggle(makeOn))}</button>`
    : '';
  let closedPlate = '';
  let madeAtRow = '';
  if (row.kind === 'make-only') {
    const madeTitle = madeAtCopy(row.location);
    madeAtRow = `
      <article class="province-book" data-status="make-only" data-book-title="${escapeHtml(madeTitle)}">
        <div class="province-book-line">
          <strong class="province-book-title">${escapeHtml(madeTitle)}</strong>
        </div>
        <p>${escapeHtml(madeAtRouteExplain(row.location))}</p>
      </article>`;
  }
  if (dominant === 'make' && makeButton) {
    makeButton = wrapDominant('make', dominant, makeButton, false);
  } else if (dominant === 'import' && books.length === 0 && !madeAtRow) {
    closedPlate = wrapDominant(
      dominant,
      dominant,
      `<span class="province-resource-closed">${escapeHtml(row.chip)}</span>`,
      true,
    );
  }
  return `
    <div class="province-resource-actions">
      ${books.length || madeAtRow ? `<p class="province-resource-books-heading">${escapeHtml(heading || 'Trade routes')}</p>
      <div class="province-resource-books">${bookHtml}${madeAtRow}</div>` : ''}
      ${makeButton}
      ${closedPlate}
    </div>
  `;
}

export function resourceCardHtml(good, {
  world = null,
  comboChip = '',
  comboNote = 'Combo chips land on the city card.',
  store = globalThis.localStorage,
  city = null,
  state = null,
  combo = null,
  deskCityId = null,
} = {}) {
  const label = goodTitle(good, deskCityId) || ITEM_LABEL[good] || good;
  const chain = chainForGood(good);
  const cardChain = cardChainForGood(good);
  const source = SOURCE_LINE[good] ?? '';
  const elements = elementsLine(good);
  const live = world ?? { stocks: {}, routes: {} };
  const row = yardRowModel(live, good);
  const synergy = synergyModelForGood(good, { comboChip, store, city, state, combo });
  const standingIds = new Set(synergy.standingIds);
  const inlineQty = good === 'uranium';
  const tree = cardChain
    ? `<ol class="process-worktree-tree" data-card-chain="${escapeHtml(cardChain.name)}">${cardChain.stages.map((id) => stageHtml(world, id, standingIds, { inlineQty })).join('')}</ol>`
    : `<p class="process-worktree-source">${escapeHtml(source || `${label} has no make chain.`)}</p>`;
  const comboAttr = synergy.chip ? ` data-combo="${escapeHtml(synergy.chip)}"` : '';
  const elementsBlock = elements
    ? `<p class="process-worktree-elements">${escapeHtml(elements)}</p>`
    : '';
  const uraniumChain = good === 'uranium' && cardChain;
  const disclose = uraniumChain
    ? (elements
      ? `<details class="province-resource-disclose">
        <summary class="province-resource-disclose-summary">Elements & works</summary>
        ${elementsBlock}
      </details>`
      : '')
    : (chain
      ? `<details class="province-resource-disclose">
        <summary class="province-resource-disclose-summary">${elements ? 'Elements & works' : 'Stages'}</summary>
        ${elementsBlock}
        ${tree}
      </details>`
      : `${elementsBlock}${tree}`);
  const chainBlock = uraniumChain ? tree : '';
  const uraniumStyle = uraniumChain
    ? `<style data-uranium-chain="1">
.province-resource-card .process-worktree-tree[data-card-chain="uranium"]{
  display:grid;
  gap:8px;
  margin:8px 0 0;
  padding:8px 0 0;
  border-top:1px solid var(--chrome-steel);
}
.province-resource-card .process-worktree-made-at{
  color:var(--chrome-amber);
  font:800 var(--chrome-type-1)/1.2 var(--mono);
  letter-spacing:var(--chrome-track-3);
  text-transform:uppercase;
}
.province-resource-card .process-worktree-inline-qty{
  color:var(--chrome-amber);
  font:800 var(--chrome-type-2)/1.2 var(--mono);
  font-variant-numeric:tabular-nums;
}
</style>`
    : '';
  const dominant = dominantResourceAction(live, good);
  const deskId = deskCityId ?? deskCityForGood(good);
  const deskCity = deskId ? WORLD_CITY_BY_ID[deskId] : null;
  const blurb = deskId ? deskBlurb(deskId) : '';
  const deskLine = deskCity
    ? `<p class="province-resource-desk" data-desk="${escapeHtml(deskId)}">
         <strong class="province-resource-desk-name">${escapeHtml(deskCity.mapName)}</strong>
         <span class="province-resource-desk-blurb"> — ${escapeHtml(blurb)}</span>
       </p>`
    : '';
  return `
    <article class="province-resource-card" data-resource-card="${escapeHtml(good)}" data-good="${escapeHtml(good)}" data-dominant-action="${dominant}"${deskId ? ` data-desk="${escapeHtml(deskId)}"` : ''}>
      <style>${RESOURCE_CARD_STYLE}</style>
        ${uraniumStyle}
      <section class="province-resource-zone province-resource-zone-identity" data-zone="identity">
        <header class="province-resource-head">
          ${itemIconHtml(good, 20)}
          <span class="province-resource-name">${escapeHtml(label)}</span>
          <b class="province-resource-qty">${escapeHtml(row.displayCount)}</b>
          <span class="province-resource-loc">${escapeHtml(row.location)}</span>
        </header>
        ${deskLine}
      </section>
      <section class="province-resource-zone province-resource-zone-economics" data-zone="economics">
        ${feesHtml(live, row)}
        <div class="province-resource-synergy">
          <p data-synergy="standing">${escapeHtml(synergy.standingLine)}</p>
          <p class="process-worktree-combo" data-synergy="adjacency" data-synergy-tier="1"${comboAttr}>${escapeHtml(synergy.adjacencyLine)}</p>
          ${synergy.nextLine ? `<p data-synergy="next">${escapeHtml(synergy.nextLine)}</p>` : ''}
        </div>
        ${chain ? costCompareHtml(good) : ''}
        ${chainBlock}
        ${disclose}
      </section>
      <section class="province-resource-zone province-resource-zone-actions" data-zone="actions">
        ${resourceActionsHtml(live, good, row, deskId)}
      </section>
    </article>
  `;
}

export function worktreePanelHtml(good, options = {}) {
  return resourceCardHtml(good, options);
}

export function deskCardHtml(cityId, options = {}) {
  const good = primaryGoodForDesk(cityId);
  if (!good) return '';
  return resourceCardHtml(good, { ...options, deskCityId: cityId });
}

export function facilityStagePanelHtml({
  processId = null,
  formId = null,
  run = null,
  comboChip = '',
  delayLines = [],
  remainingBeats = null,
  fireDamage = null,
} = {}) {
  const process = PROCESS_BY_ID[processId] ?? null;
  const hosted = formId ? processesHostedBy(formId) : [];
  if (!process && !run && hosted.length === 0) return '';
  const live = run ?? null;
  const id = live?.processId ?? process?.id;
  const row = PROCESS_BY_ID[id] ?? process;
  const beats = remainingBeats ?? live?.remainingBeats;
  const chip = comboChip || live?.comboChip || comboChipCopy(0);
  const delays = Array.isArray(delayLines) ? delayLines : [];
  const delayHtml = delays.length
    ? `<ul class="process-stage-delays">${delays.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
    : '<p class="process-stage-delays is-empty">No delay this run.</p>';
  const runLine = live
    ? `Current run · ${beats == null ? 'live' : (beats === 1 ? '1 beat left' : `${beats} beats left`)}`
    : row
      ? 'No run.'
      : 'Pick a process.';
  const picker = (!id && hosted.length)
    ? `<div class="process-stage-picker">${hosted.map((candidate) => `
        <button type="button"
                class="verb"
                data-verb="select-process"
                data-process-id="${escapeHtml(candidate.id)}">
          ${escapeHtml(candidate.label)}
        </button>`).join('')}</div>`
    : '';
  const fireHtml = fireDamage
    ? `<p class="process-stage-fire">${escapeHtml(`The mill is damaged. Repair costs $${Number(fireDamage.cost).toLocaleString('en-AU')}.`)}</p>
       <button type="button" class="verb" data-verb="repair-facility" data-facility-id="${escapeHtml(fireDamage.facilityId)}">Repair</button>`
    : '';
  return `
    <section class="process-stage-panel" data-process-stage="${escapeHtml(id ?? formId ?? '')}">
      <h3>How it's made</h3>
      ${row ? `<p class="process-worktree-elements">${escapeHtml((row.elements ?? []).join(' · '))}</p>` : ''}
      <p class="process-stage-run">${escapeHtml(row?.label ?? 'Plant')} · ${escapeHtml(runLine)}</p>
      ${row ? `<p class="process-worktree-risk">${escapeHtml(riskLine(row))}</p>` : ''}
      ${fireHtml}
      ${picker}
      ${delayHtml}
      ${chip
    ? `<p class="process-worktree-combo" data-combo="${escapeHtml(chip)}">${escapeHtml(chip)}</p>`
    : ''}
    </section>
  `;
}

export { TIME_COST_PER_BEAT };
