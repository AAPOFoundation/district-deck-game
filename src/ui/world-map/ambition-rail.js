// Ambition requirements rail. View-only: probes the same reducers the Yard
// keys already call. Does not write world state.

import {
  CITY_EXPORT_TO_YARD,
  WORLD_CITY_BY_ID,
  WORLD_FORCE_RECIPES,
  WORLD_BIOMIND_BIOLABS,
  WORLD_BIOMIND_COST,
  WORLD_BIOMIND_STOCKS,
  emptyBiomindFed,
  WORLD_BUILD_KIT_IDS,
  WORLD_BUILD_KITS,
  WORLD_MARS_PARTS,
  WORLD_MISSIONARY_COST,
  WORLD_OFFICER_COST,
  WORLD_STATION_COST,
  WORLD_TRADE_ROUTES,
} from '../../core/world/catalog.js';
import {
  buildMarsPart,
  commissionOfficer,
  foundCreed,
  feedBiomind,
  liveBiolabCount,
  liveInstitutions,
  openMarsDesk,
  sendMission,
  shipBuildKit,
  trainBiomind,
  stationBase,
  trainMissionary,
} from '../../core/world/ambition.js';
import { canRaiseForce, emptyStocks } from '../../core/world/forces.js';
import { canOpenTradeRoute } from '../../core/world/trade.js';
import { isMineMakeDesk, makeModeCopy } from '../../core/world/processes.js';
import { hasItemIcon, itemIconHtml, ITEM_LABEL } from './item-icons.js';

const MELBOURNE_ID = 'melbourne-inner';

const AMBITION_RAIL_STYLE = `
.province-ambition-rail{
  display:grid;
  gap:8px;
  padding-bottom:20px;
}
.province-ambition-rail>h2{
  margin:0;
  color:var(--chrome-amber);
  font:800 var(--chrome-type-3)/1.15 var(--mono);
  letter-spacing:var(--chrome-track-2);
  text-transform:uppercase;
}
.province-ambition-rail .province-lead{
  margin:0;
  color:var(--chrome-carbon);
  font:500 var(--chrome-type-1)/1.35 var(--body);
}
.province-ambition-rail .province-kit-sub{
  margin:0;
  color:var(--chrome-carbon);
  font:500 var(--chrome-type-1)/1.35 var(--body);
  letter-spacing:0;
  text-transform:none;
}
.province-ambition-rail .province-need-list{
  display:grid;
  gap:6px;
  margin:0 0 4px;
  padding:0;
  list-style:none;
}
.province-ambition-rail .province-need{
  display:grid;
  grid-template-columns:16px minmax(0,1fr);
  gap:8px;
  align-items:start;
  padding:8px;
}
.province-ambition-rail .province-need.is-req-met{
  background:#24341c;
  border:2px solid #7aa05a;
  box-shadow:var(--chrome-well);
  color:#d4e8b8;
}
.province-ambition-rail .province-need.is-req-unmet{
  background:var(--chrome-ink);
  border:2px solid var(--chrome-amber);
  box-shadow:var(--chrome-well);
  color:var(--chrome-bone);
}
.province-ambition-rail .province-need strong{
  color:inherit;
  font:800 var(--chrome-type-2)/1.15 var(--mono);
  letter-spacing:var(--chrome-track-3);
  text-transform:uppercase;
}
.province-ambition-rail .province-need b{
  color:inherit;
  font-size:var(--chrome-type-2);
  font-variant-numeric:tabular-nums;
}
.province-ambition-rail .province-need em,
.province-ambition-rail .province-need-source{
  color:inherit;
  font-size:var(--chrome-type-1);
}
.province-ambition-rail-actions{
  display:grid;
  gap:6px;
  margin-top:12px;
  padding-top:12px;
  padding-bottom:8px;
  border-top:1px solid var(--chrome-steel-mid);
}
.province-ambition-rail-actions .province-ambition-commit{
  min-height:36px;
  padding:10px 12px;
  border:2px solid var(--chrome-amber);
  background:var(--chrome-amber);
  color:var(--chrome-ink);
  font:800 var(--chrome-type-3)/1.15 var(--mono);
  letter-spacing:var(--chrome-track-2);
  text-transform:uppercase;
}
.province-ambition-rail-actions .province-ambition-commit:disabled{
  opacity:1;
  background:var(--chrome-steel-mid);
  border-color:var(--chrome-amber);
  color:var(--chrome-bone);
}
.province-ambition-rail-actions .province-ambition-back{
  padding:6px 8px;
  border:1px solid var(--chrome-steel-high);
  background:var(--chrome-ink);
  color:var(--chrome-carbon);
  font:800 var(--chrome-type-1)/1.15 var(--mono);
  letter-spacing:var(--chrome-track-3);
  text-transform:uppercase;
}
`;

const CITY_FED = new Set(Object.values(CITY_EXPORT_TO_YARD));

export const KIT_SHIP_SUBTITLE = 'Ships parts to Melbourne — then place it with BUILD in the city.';
export const KIT_SHIPPED_LABEL = 'KIT SHIPPED — build it in Melbourne (BUILD)';

export function kitIsShipped(world, institution) {
  return Boolean(world?.ambition?.buildKits?.[institution]);
}

export const AMBITION_PURPOSE = Object.freeze({
  army: 'Mark a battalion from iron, copper, oil, and one officer.',
  navy: 'Mark a ship from iron, timber, robots, chips, rare earth, and one officer.',
  air: 'Mark a squadron from titanium, chips, rare earth, robots, and one officer.',
  drone: 'Mark a drone wing from robots, chips, lithium, cobalt, rare earth, graphite, nickel, and one officer.',
  nuke: 'Mark a deterrent from enriched uranium, a warhead, a missile body, and one officer.',
  probe: 'Stack the probe on the Mars hull.',
  habitat: 'Stack the habitat on the Mars hull.',
  drive: 'Stack the drive on the Mars hull.',
  life: 'Stack life support on the Mars hull.',
  stack: 'Stack the landing stack on the Mars hull.',
  'train-missionary': 'Train one missionary at the missionary school.',
  'send-mission': 'Send a missionary and one bible to convert this desk.',
  'commission-officer': 'Commission one officer at the officer school.',
  'station-base': 'Station an officer and a ship on this choke.',
  'open-mars-desk': 'Open Mars from chips, robots, and cash.',
  'train-biomind': 'Feed crates into training, then spend cash in two standing biolabs.',
  'feed-biomind': 'Move Yard crates into the biomind training total.',
  'found-doctrine': 'Found this doctrine. Open lines spread it.',
  'space-works': 'Ship steel, robots, and chips so the city can place space works.',
  'international-exchange': 'Ship steel, marble, and chips so the city can place the exchange.',
  'missionary-school': 'Ship timber and marble so the city can place the missionary school.',
  'officer-school': 'Ship steel and timber so the city can place the officer school.',
  biolab: 'Ship steel, chips, and ceramics so the city can place the biolab.',
  'ai-incubator': 'Ship steel, chips, and compute so the city can place the incubator.',
});

/** Every player-facing ambition action. describeAmbition must cover each id. */
export const AMBITION_REGISTRY = Object.freeze([
  Object.freeze({ type: 'raise-force', kind: 'army' }),
  Object.freeze({ type: 'raise-force', kind: 'navy' }),
  Object.freeze({ type: 'raise-force', kind: 'air' }),
  Object.freeze({ type: 'raise-force', kind: 'drone' }),
  Object.freeze({ type: 'raise-force', kind: 'nuke' }),
  Object.freeze({ type: 'mars-part', part: 'probe' }),
  Object.freeze({ type: 'mars-part', part: 'habitat' }),
  Object.freeze({ type: 'mars-part', part: 'drive' }),
  Object.freeze({ type: 'mars-part', part: 'life' }),
  Object.freeze({ type: 'mars-part', part: 'stack' }),
  Object.freeze({ type: 'train-missionary' }),
  Object.freeze({ type: 'send-mission', city: 'singapore-roads' }),
  Object.freeze({ type: 'commission-officer' }),
  Object.freeze({ type: 'station-base', choke: 'hormuz' }),
  Object.freeze({ type: 'open-mars-desk' }),
  Object.freeze({ type: 'train-biomind' }),
  Object.freeze({ type: 'feed-biomind' }),
  Object.freeze({ type: 'found-doctrine', creed: 'christianity' }),
  ...WORLD_BUILD_KIT_IDS.map((institution) => Object.freeze({
    type: 'ship-build-kit',
    institution,
  })),
]);

function goodName(good) {
  return ITEM_LABEL[good] ?? good;
}

function shortfallLine(have, need, kind) {
  const gap = need - have;
  if (gap <= 0) return '';
  if (kind === 'cash') return `${gap.toLocaleString('en-AU')} more needed`;
  return `${gap} more needed`;
}

export function inboundBookForGood(good) {
  const routes = WORLD_TRADE_ROUTES.filter((route) => (
    route.good === good
    && route.direction === 'inbound'
    && route.to === MELBOURNE_ID
    && route.playerOpenable
  ));
  return routes;
}

export function sourceForGood(world, good) {
  const routes = inboundBookForGood(good);
  if (routes.length) {
    const open = routes.find((route) => world.routes?.[route.id]?.status === 'open');
    const route = open ?? routes[0];
    const desk = WORLD_CITY_BY_ID[route.from]?.mapName ?? route.from;
    const name = goodName(good);
    const row = world.routes?.[route.id];
    if (open) {
      const makeOn = isMineMakeDesk(route.from) && world.ambition?.mineMake?.[route.from] === true;
      if (makeOn) {
        return { text: `${makeModeCopy(true)} at ${desk} — the mine ticks`, routeId: route.id };
      }
      return { text: `${name} arrives each beat`, routeId: route.id };
    }
    // The reducer is the authority on WHY a shut book cannot open right now
    // (fee shortfall, embargo wait, cut line). The rail repeats its reason.
    const check = canOpenTradeRoute(world, route.id);
    if (!check.ok) {
      if (row?.status === 'embargoed') {
        const remaining = Math.max(1, (row.untilBeat ?? (world.beat ?? 0) + 1) - (world.beat ?? 0));
        return { text: `${desk} is embargoed — ${remaining} beats. ${check.reason}`.trim(), routeId: route.id };
      }
      return { text: check.reason || 'The line is shut.', routeId: route.id };
    }
    return { text: `${name} ships from ${desk} — open its line`, routeId: route.id };
  }
  if (CITY_FED.has(good)) {
    const name = good === 'food' ? 'grain' : goodName(good).toLowerCase();
    return { text: `Melbourne ${name} arrives at settle`, routeId: null };
  }
  return { text: `${goodName(good)} has no inbound line`, routeId: null };
}

function cashRow(world, need) {
  const have = world.treasuryCash ?? 0;
  const met = have >= need;
  return {
    key: 'cash',
    icon: 'cash',
    name: 'Cash',
    have,
    need,
    met,
    shortfall: met ? '' : shortfallLine(have, need, 'cash'),
    source: { text: 'Head office cash. Sell from Melbourne to earn more.', routeId: null },
    displayHave: have,
    displayNeed: need,
  };
}

function countRow(world, key, icon, name, have, need, source) {
  const met = have >= need;
  return {
    key,
    icon,
    name,
    have,
    need,
    met,
    shortfall: met ? '' : shortfallLine(have, need, 'count'),
    source,
    displayHave: have,
    displayNeed: need,
  };
}

function stockRow(world, good, need) {
  const have = world.stocks?.[good] ?? 0;
  return countRow(
    world,
    good,
    hasItemIcon(good) ? good : 'modular',
    goodName(good),
    have,
    need,
    sourceForGood(world, good),
  );
}

function fedStockRow(world, good, need) {
  const fed = world.ambition?.biomindFed ?? emptyBiomindFed();
  const have = fed[good] ?? 0;
  const yard = world.stocks?.[good] ?? 0;
  return countRow(
    world,
    good,
    hasItemIcon(good) ? good : 'modular',
    goodName(good),
    have,
    need,
    {
      text: `Training total ${have}/${need}. Yard holds ${yard}.`,
      routeId: sourceForGood(world, good).routeId,
    },
  );
}

function officerRow(world, need = 1) {
  return countRow(
    world,
    'officer',
    'officer',
    'Officer',
    world.ambition?.officers ?? 0,
    need,
    { text: 'Officers train at the officer school.', routeId: null },
  );
}

function missionaryRow(world, need = 1) {
  return countRow(
    world,
    'missionary',
    'missionary',
    'Missionary',
    world.ambition?.missionaries ?? 0,
    need,
    { text: 'Missionaries train at the missionary school.', routeId: null },
  );
}

function navyRow(world, need = 1) {
  return countRow(
    world,
    'navy',
    'navy',
    'Navy',
    world.forces?.navy ?? 0,
    need,
    { text: 'Raise navy under MILITARY.', routeId: null },
  );
}

function flagRow(key, icon, name, have, need, source) {
  const met = have >= need;
  return {
    key,
    icon,
    name,
    have,
    need,
    met,
    shortfall: met ? '' : shortfallLine(have, need, 'count'),
    source,
    displayHave: have,
    displayNeed: need,
  };
}

function stocksFrom(recipe) {
  return Object.entries(recipe?.stocks ?? {}).map(([good, need]) => ({ good, need }));
}

export function describeAmbition(spec) {
  if (!spec) return null;
  if (spec.type === 'raise-force') {
    const recipe = WORLD_FORCE_RECIPES[spec.kind];
    if (!recipe || recipe.age === 'space') return null;
    return {
      type: spec.type,
      kind: spec.kind,
      name: `Raise ${spec.kind}`,
      purpose: AMBITION_PURPOSE[spec.kind],
      cash: recipe.cash,
      stocks: stocksFrom(recipe),
      officers: 1,
      keyLabel: `Raise ${spec.kind}`,
    };
  }
  if (spec.type === 'mars-part') {
    const part = WORLD_MARS_PARTS.find((row) => row.id === spec.part);
    if (!part) return null;
    return {
      type: spec.type,
      part: spec.part,
      name: part.label,
      purpose: AMBITION_PURPOSE[spec.part] ?? 'Stack this part on the Mars hull.',
      cash: part.cash,
      stocks: stocksFrom(part),
      spaceWorks: true,
      marsOpen: true,
      keyLabel: `Stack ${part.label}`,
    };
  }
  if (spec.type === 'train-missionary') {
    return {
      type: spec.type,
      name: 'Train missionary',
      purpose: AMBITION_PURPOSE['train-missionary'],
      cash: WORLD_MISSIONARY_COST,
      stocks: [{ good: 'people', need: 1 }],
      missionarySchool: true,
      keyLabel: 'Train missionary',
    };
  }
  if (spec.type === 'commission-officer') {
    return {
      type: spec.type,
      name: 'Commission officer',
      purpose: AMBITION_PURPOSE['commission-officer'],
      cash: WORLD_OFFICER_COST,
      stocks: [{ good: 'people', need: 1 }],
      officerSchool: true,
      keyLabel: 'Commission officer',
    };
  }
  if (spec.type === 'send-mission') {
    const city = WORLD_CITY_BY_ID[spec.city];
    return {
      type: spec.type,
      city: spec.city,
      name: `Send mission · ${city?.mapName ?? spec.city}`,
      purpose: AMBITION_PURPOSE['send-mission'],
      cash: 0,
      stocks: [{ good: 'bibles', need: 1 }],
      missionary: 1,
      missionarySchool: true,
      needsCreed: true,
      desk: spec.city,
      keyLabel: 'Send mission',
    };
  }
  if (spec.type === 'station-base') {
    return {
      type: spec.type,
      choke: spec.choke,
      name: 'Station base',
      purpose: AMBITION_PURPOSE['station-base'],
      cash: WORLD_STATION_COST.cash,
      stocks: stocksFrom(WORLD_STATION_COST),
      officers: 1,
      navy: 1,
      officerSchool: true,
      keyLabel: 'Station base',
    };
  }
  if (spec.type === 'open-mars-desk') {
    return {
      type: spec.type,
      name: 'Open Mars',
      purpose: AMBITION_PURPOSE['open-mars-desk'],
      cash: 500_000,
      stocks: [{ good: 'chips', need: 2 }, { good: 'robots', need: 1 }],
      keyLabel: 'Open Mars',
    };
  }
  if (spec.type === 'train-biomind') {
    return {
      type: 'train-biomind',
      name: 'Train biomind',
      purpose: AMBITION_PURPOSE['train-biomind'],
      cash: WORLD_BIOMIND_COST,
      stocks: stocksFrom({ stocks: WORLD_BIOMIND_STOCKS }),
      fromFed: true,
      biolabsNeed: WORLD_BIOMIND_BIOLABS,
      keyLabel: 'Train biomind',
    };
  }
  if (spec.type === 'feed-biomind') {
    return {
      type: 'feed-biomind',
      name: 'Feed biomind',
      purpose: AMBITION_PURPOSE['feed-biomind'],
      cash: 0,
      stocks: stocksFrom({ stocks: WORLD_BIOMIND_STOCKS }),
      fromFed: true,
      keyLabel: 'Feed training',
    };
  }
  if (spec.type === 'ship-build-kit') {
    const kit = WORLD_BUILD_KITS[spec.institution];
    if (!kit) return null;
    return {
      type: spec.type,
      institution: spec.institution,
      name: kit.action,
      purpose: AMBITION_PURPOSE[spec.institution] ?? kit.register,
      cash: kit.cash,
      stocks: stocksFrom(kit),
      keyLabel: kit.action,
    };
  }
  if (spec.type === 'found-doctrine') {
    return {
      type: spec.type,
      creed: spec.creed,
      name: 'Found doctrine',
      purpose: AMBITION_PURPOSE['found-doctrine'],
      cash: 200_000,
      stocks: [],
      keyLabel: 'Found doctrine',
    };
  }
  return null;
}

export function probeAmbition(world, spec) {
  if (spec?.type === 'raise-force') return canRaiseForce(world, spec.kind);
  if (spec?.type === 'mars-part') {
    const result = buildMarsPart(world, spec.part);
    return { ok: result.ok, reason: result.reason };
  }
  if (spec?.type === 'train-missionary') {
    const result = trainMissionary(world);
    return { ok: result.ok, reason: result.reason };
  }
  if (spec?.type === 'commission-officer') {
    const result = commissionOfficer(world);
    return { ok: result.ok, reason: result.reason };
  }
  if (spec?.type === 'send-mission') {
    const result = sendMission(world, spec.city);
    return { ok: result.ok, reason: result.reason };
  }
  if (spec?.type === 'station-base') {
    const result = stationBase(world, spec.choke);
    return { ok: result.ok, reason: result.reason };
  }
  if (spec?.type === 'open-mars-desk') {
    const result = openMarsDesk(world);
    return { ok: result.ok, reason: result.reason };
  }
  if (spec?.type === 'train-biomind') {
    const result = trainBiomind(world);
    return { ok: result.ok, reason: result.reason };
  }
  if (spec?.type === 'feed-biomind') {
    const result = feedBiomind(world, spec.good ?? null);
    return { ok: result.ok, reason: result.reason };
  }
  if (spec?.type === 'ship-build-kit') {
    const result = shipBuildKit(world, spec.institution);
    return { ok: result.ok, reason: result.reason };
  }
  if (spec?.type === 'found-doctrine') {
    const result = foundCreed(world, spec.creed);
    return { ok: result.ok, reason: result.reason };
  }
  return { ok: false, reason: 'No such action.' };
}

export function ambitionRequirementRows(world, spec) {
  const described = describeAmbition(spec);
  if (!described) return [];
  const rows = [];
  const institutions = liveInstitutions(world);
  if (described.marsOpen) {
    rows.push(flagRow(
      'mars-desk',
      'alien',
      'Mars desk',
      world.ambition?.marsOpen ? 1 : 0,
      1,
      { text: 'Open Mars from Ambition.', routeId: null },
    ));
  }
  if (described.spaceWorks) {
    rows.push(flagRow(
      'space-works',
      'school',
      'Space works',
      institutions.spaceWorks ? 1 : 0,
      1,
      { text: 'Build Space Works in the city.', routeId: null },
    ));
  }
  if (described.missionarySchool) {
    rows.push(flagRow(
      'missionary-school',
      'school',
      'Missionary school',
      institutions.missionarySchool ? 1 : 0,
      1,
      { text: 'Build the missionary school in the city.', routeId: null },
    ));
  }
  if (described.officerSchool) {
    rows.push(flagRow(
      'officer-school',
      'school',
      'Officer school',
      institutions.officerSchool ? 1 : 0,
      1,
      { text: 'Build the officer school in the city.', routeId: null },
    ));
  }
  if (described.biolab) {
    rows.push(flagRow(
      'biolab',
      'school',
      'Biolab',
      institutions.biolab ? 1 : 0,
      1,
      { text: 'Build the biolab in the city.', routeId: null },
    ));
  }
  if (described.biolabsNeed) {
    const have = liveBiolabCount(world);
    rows.push(flagRow(
      'biolab',
      'school',
      'Biolab',
      have,
      described.biolabsNeed,
      { text: 'Place standing biolabs in the city.', routeId: null },
    ));
  }
  if (described.needsCreed) {
    rows.push(flagRow(
      'creed',
      'missionary',
      'Christian doctrine',
      world.ambition?.creed === 'christianity' ? 1 : 0,
      1,
      { text: 'Found the Christian doctrine on the Melbourne card.', routeId: null },
    ));
  }
  if (described.desk) {
    const open = WORLD_TRADE_ROUTES.some((route) => (
      (route.from === described.desk || route.to === described.desk)
      && world.routes?.[route.id]?.status === 'open'
    )) || world.cities?.[described.desk]?.status === 'open'
      || world.cities?.[described.desk]?.status === 'in-play';
    const deskName = WORLD_CITY_BY_ID[described.desk]?.mapName ?? described.desk;
    rows.push(flagRow(
      'desk',
      'credit',
      `${deskName} desk`,
      open ? 1 : 0,
      1,
      { text: 'Open a supply line at that city first.', routeId: null },
    ));
  }
  if (described.cash > 0) rows.push(cashRow(world, described.cash));
  for (const { good, need } of described.stocks) {
    rows.push(described.fromFed ? fedStockRow(world, good, need) : stockRow(world, good, need));
  }
  if (described.officers) rows.push(officerRow(world, described.officers));
  if (described.missionary) rows.push(missionaryRow(world, described.missionary));
  if (described.navy) rows.push(navyRow(world, described.navy));
  return rows;
}

function money(n) {
  const value = Math.round(n);
  if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(1)}T`;
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  return `$${value.toLocaleString('en-AU')}`;
}

function formatHaveNeed(row) {
  if (row.key === 'cash') return `${money(row.have)}/${money(row.need)}`;
  return `${row.have}/${row.need}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function ambitionRailHtml(world, spec) {
  const described = describeAmbition(spec);
  if (!described) return '';
  const rows = ambitionRequirementRows(world, spec);
  const check = probeAmbition(world, spec);
  const rowHtml = rows.map((row) => {
    const source = row.source?.routeId
      ? `<button type="button" class="province-need-source" data-route="${escapeHtml(row.source.routeId)}">${escapeHtml(row.source.text)}</button>`
      : `<span class="province-need-source">${escapeHtml(row.source?.text ?? '')}</span>`;
    return `
      <li class="province-need ${row.met ? 'is-req-met' : 'is-req-unmet'}" data-status="${row.met ? 'met' : 'short'}" data-input="${escapeHtml(row.key)}">
        ${itemIconHtml(row.icon)}
        <div>
          <strong>${escapeHtml(row.name)}</strong>
          <b>${escapeHtml(formatHaveNeed(row))}</b>
          ${row.met ? '' : `<em>${escapeHtml(row.shortfall)}</em>`}
          ${source}
        </div>
      </li>
    `;
  }).join('');
  const attrs = [
    `data-ambition-commit="${escapeHtml(described.type)}"`,
    described.kind ? `data-force="${escapeHtml(described.kind)}"` : '',
    described.part ? `data-part="${escapeHtml(described.part)}"` : '',
    described.city ? `data-city="${escapeHtml(described.city)}"` : '',
    described.choke ? `data-choke="${escapeHtml(described.choke)}"` : '',
    described.creed ? `data-creed="${escapeHtml(described.creed)}"` : '',
    described.institution ? `data-institution="${escapeHtml(described.institution)}"` : '',
  ].filter(Boolean).join(' ');
  const shipped = described.type === 'ship-build-kit' && kitIsShipped(world, described.institution);
  const heading = shipped ? KIT_SHIPPED_LABEL : described.name;
  const keyLabel = shipped ? KIT_SHIPPED_LABEL : described.keyLabel;
  const kitSub = described.type === 'ship-build-kit' && !shipped
    ? `<p class="province-kit-sub">${escapeHtml(KIT_SHIP_SUBTITLE)}</p>`
    : '';
  const cashBit = described.cash && !shipped ? ` · ${money(described.cash)}` : '';
  return `
    <section class="province-ambition-rail">
    <style>${AMBITION_RAIL_STYLE}</style>
    <span class="province-status" data-status="${check.ok ? 'open' : 'locked'}">${check.ok ? 'ready' : 'short'}</span>
    <h2>${escapeHtml(heading)}</h2>
    <p class="province-lead">${escapeHtml(described.purpose)}</p>
    ${kitSub}
    <p class="province-books-heading">Have / need</p>
    <ul class="province-need-list">${rowHtml}</ul>
    <p class="province-book-reason" ${check.ok ? 'hidden' : ''}>${escapeHtml(check.reason ?? '')}</p>
    <div class="province-ambition-rail-actions">
    ${described.type === 'train-biomind' ? `
    <button type="button"
            class="province-ambition-commit"
            data-ambition-commit="feed-biomind">
      Feed training
    </button>` : ''}
    <button type="button"
            class="province-ambition-commit"
            ${attrs}
            ${check.ok ? '' : 'disabled'}>
      ${escapeHtml(keyLabel)}${cashBit}
    </button>
    <button type="button" class="province-ambition-back" data-ambition-back="1">Back</button>
    </div>
    </section>
  `;
}

export function emptyWorldStocks() {
  return emptyStocks();
}
