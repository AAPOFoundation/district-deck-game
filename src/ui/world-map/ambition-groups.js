// Ambition regrouped by win condition. Five chrome category cards.
// View-only: probes existing reducers. Does not write world state.

import {
  WORLD_BIOMIND_BEATS,
  WORLD_BIOMIND_STOCKS,
  WORLD_BUILD_KIT_IDS,
  WORLD_BUILD_KITS,
  WORLD_CASH_WIN,
  WORLD_CITIES,
  WORLD_CHOKEPOINTS,
  WORLD_FORCE_KINDS,
  WORLD_FORCE_RECIPES,
  WORLD_MARS_PARTS,
  WORLD_MISSIONARY_COST,
  WORLD_OFFICER_COST,
  WORLD_STARTUP_WIN_COUNT,
  WORLD_STATION_COST,
  emptyBiomindFed,
} from '../../core/world/catalog.js';
import { deskIsOpen, liveInstitutions, victoryProgress } from '../../core/world/ambition.js';
import { canRaiseForce } from '../../core/world/forces.js';
import { yardListHtml } from './yard-list.js';
import { KIT_SHIP_SUBTITLE, KIT_SHIPPED_LABEL, kitIsShipped } from './ambition-rail.js';

/**
 * V4.5 Wave 2 user order: AI BIOMIND is a real win. Mechanics are
 * `train-biomind` / trainBiomind. Cited by v45-wave-2.test.mjs.
 */
export const AGI_WIN_UI_LABEL = 'AI BIOMIND';

const KIT_LIVE_KEY = Object.freeze({
  'space-works': 'spaceWorks',
  'missionary-school': 'missionarySchool',
  'officer-school': 'officerSchool',
  'international-exchange': 'exchange',
  biolab: 'biolab',
  'ai-incubator': 'incubator',
});

const AMBITION_GROUPS_STYLE = `
.province-win-list{
  display:grid;
  gap:8px;
  padding-bottom:18px;
}
.province-win{
  display:grid;
  gap:6px;
  margin:0;
  padding:8px;
  border:1px solid var(--chrome-steel-mid);
  background:var(--chrome-ink);
  box-shadow:var(--chrome-bevel);
}
.province-win.is-untouched{
  background:var(--chrome-ink);
  border-color:var(--chrome-steel-mid);
}
.province-win.is-progress{
  border-left:4px solid var(--chrome-amber);
  border-top-color:var(--chrome-steel-high);
  border-right-color:var(--chrome-steel-high);
  border-bottom-color:var(--chrome-steel-high);
  background:var(--chrome-ink);
}
.province-win-head{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  grid-template-areas:"label plate" "goal goal";
  gap:6px 10px;
  padding:8px 10px;
  border:1px solid var(--chrome-steel-mid);
  background:var(--chrome-steel);
  box-shadow:var(--chrome-well);
}
.province-win.is-progress .province-win-head{
  background:var(--chrome-steel-mid);
  border-color:var(--chrome-amber);
}
.province-win-head strong{
  grid-area:label;
  color:var(--chrome-carbon);
  font:800 var(--chrome-type-2)/1 var(--mono);
  letter-spacing:var(--chrome-track-1);
}
.province-win.is-progress .province-win-head strong{
  color:var(--chrome-amber);
}
.province-win-goal{
  grid-area:goal;
  color:var(--chrome-carbon);
  font:500 var(--chrome-type-1)/1.35 var(--body);
  text-transform:none;
}
.province-win-plate{
  grid-area:plate;
  justify-self:end;
  color:var(--chrome-bone);
  font:800 var(--chrome-type-3)/1 var(--mono);
  letter-spacing:var(--chrome-track-2);
  text-transform:uppercase;
  white-space:nowrap;
}
.province-win.is-progress .province-win-plate{
  padding:4px 8px;
  background:var(--chrome-amber);
  color:var(--chrome-ink);
}
.province-win-fan{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  padding:8px 0 4px;
}
.province-win-fan .is-req-met,
.province-ambition-actions .is-req-met{
  background:#24341c;
  border:2px solid #7aa05a;
  color:#d4e8b8;
}
.province-win-fan .is-req-unmet,
.province-ambition-actions .is-req-unmet{
  background:var(--chrome-ink);
  border:2px solid var(--chrome-steel-high);
  color:var(--chrome-bone);
}
.province-raise-wrap.is-req-unmet>.province-raise-force{
  background:var(--chrome-ink);
  border:2px solid var(--chrome-steel-high);
  color:var(--chrome-bone);
}
.province-win-fan .province-ambition:not([aria-disabled="true"]):not(.is-req-met),
.province-win-fan .province-raise-force:not([aria-disabled="true"]){
  border-color:var(--chrome-amber);
  color:var(--chrome-amber);
}
.province-win.is-armed,
.province-win-head.is-armed{
  border-color:var(--chrome-amber);
  box-shadow:var(--chrome-well),inset 0 -3px 0 var(--chrome-amber);
}
.province-win-head.is-armed strong,
.province-ambition.is-armed,
.province-raise-force.is-armed{
  color:var(--chrome-amber);
}
.province-ambition.is-armed,
.province-raise-force.is-armed{
  border-color:var(--chrome-amber);
  background:var(--chrome-ink);
  box-shadow:var(--chrome-well),inset 0 -3px 0 var(--chrome-amber);
}
`;

export const AMBITION_CATEGORIES = Object.freeze([
  Object.freeze({
    id: 'mars',
    label: 'MARS',
    goal: 'Assemble the five-part Mars stack.',
    progressKey: 'wonder',
  }),
  Object.freeze({
    id: 'culture',
    label: 'CULTURE',
    goal: 'Convert eight cities to the doctrine.',
    progressKey: 'culture',
  }),
  Object.freeze({
    id: 'military',
    label: 'MILITARY',
    goal: 'Station officers on every choke.',
    progressKey: 'military',
  }),
  Object.freeze({
    id: 'financial',
    label: 'FINANCIAL',
    goal: 'Grow listed tape to ten trillion.',
    progressKey: 'financial',
  }),
  Object.freeze({
    id: 'agi',
    label: AGI_WIN_UI_LABEL,
    goal: 'Train the biomind in a standing biolab.',
    progressKey: 'tech',
  }),
]);

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function money(n) {
  const value = Math.round(n);
  if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(1)}T`;
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return `$${value.toLocaleString('en-AU')}`;
}

function moneyTape(n) {
  const value = Math.round(n);
  if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(1)}T`;
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return money(value);
}

export function categoryProgressPlate(world, categoryId, progress = victoryProgress(world)) {
  if (categoryId === 'mars') {
    return `${progress.wonder.have}/${progress.wonder.need} PARTS`;
  }
  if (categoryId === 'culture') {
    return `${progress.culture.have}/${progress.culture.need} CITIES`;
  }
  if (categoryId === 'military') {
    return `${progress.military.have}/${progress.military.need} CHOKES`;
  }
  if (categoryId === 'financial') {
    // One short counter, BIOMIND-style — the compound plate used to swallow
    // the FINANCIAL label. Listings and the $100m note live in the fan-out.
    const startups = progress.financial.startups ?? 0;
    const need = progress.financial.startupsNeed ?? WORLD_STARTUP_WIN_COUNT;
    return `${startups}/${need} STARTUPS`;
  }
  if (categoryId === 'agi') {
    const fed = progress.tech.fed ?? emptyBiomindFed();
    const chipsNeed = WORLD_BIOMIND_STOCKS.chips;
    if (progress.tech.training || (progress.tech.have ?? 0) >= WORLD_BIOMIND_BEATS) {
      return `${progress.tech.have}/${progress.tech.need} BEATS`;
    }
    return `${fed.chips ?? 0}/${chipsNeed} CHIPS`;
  }
  return '';
}

function reqClass(met) {
  return met ? 'is-req-met' : 'is-req-unmet';
}

export function categoryHasProgress(world, categoryId, progress = victoryProgress(world)) {
  if (categoryId === 'mars') return (progress.wonder.have ?? 0) > 0 || Boolean(progress.wonder.open);
  if (categoryId === 'culture') return (progress.culture.have ?? 0) > 0 || Boolean(progress.culture.creed);
  if (categoryId === 'military') return (progress.military.have ?? 0) > 0;
  if (categoryId === 'financial') {
    return (progress.financial.listings ?? 0) > 0
      || (progress.financial.startups ?? 0) > 0
      || (progress.financial.have ?? 0) > 0;
  }
  if (categoryId === 'agi') {
    return (progress.tech.have ?? 0) > 0
      || Boolean(progress.tech.training)
      || Boolean(progress.tech.biolab)
      || (progress.tech.fed?.chips ?? 0) > 0;
  }
  return false;
}

export function ambitionArmedKey(spec = {}) {
  if (spec.type === 'ship-build-kit' || spec.ambition === 'ship-kit') {
    return spec.institution ? `ship-kit:${spec.institution}` : 'ship-kit';
  }
  if (spec.type === 'raise-force' || spec.force) return `raise:${spec.kind ?? spec.force}`;
  if (spec.type === 'mars-part' || spec.ambition === 'mars-part') return `mars-part:${spec.part}`;
  if (spec.type === 'open-mars-desk' || spec.ambition === 'mars') return 'mars';
  if (spec.type === 'train-biomind' || spec.ambition === 'biomind' || spec.ambition === 'agi') return 'biomind';
  if (spec.type === 'found-doctrine' || spec.ambition === 'creed') return 'creed';
  if (spec.type === 'train-missionary' || spec.ambition === 'train-missionary') return 'train-missionary';
  if (spec.type === 'send-mission' || spec.ambition === 'send-mission') return `send-mission:${spec.city}`;
  if (spec.type === 'commission-officer' || spec.ambition === 'commission-officer') return 'commission-officer';
  if (spec.type === 'station-base' || spec.ambition === 'station-base') return `station-base:${spec.choke}`;
  if (spec.type === 'feed-biomind') return 'feed-biomind';
  if (spec.type === 'open-mars-desk') return 'mars';
  return spec.type ?? spec.ambition ?? '';
}

function armedClass(isArmed) {
  return isArmed ? ' is-armed' : '';
}

function kitButton(world, institution, disabled = false, armedKey = null) {
  const kit = WORLD_BUILD_KITS[institution];
  if (!kit) return '';
  const live = liveInstitutions(world);
  const key = KIT_LIVE_KEY[institution];
  const met = Boolean(key && live[key]);
  const shipped = kitIsShipped(world, institution);
  const armedId = `ship-kit:${institution}`;
  const label = shipped ? KIT_SHIPPED_LABEL : `${kit.action} · ${money(kit.cash)}`;
  const sub = shipped
    ? ''
    : `<small class="province-kit-sub">${escapeHtml(KIT_SHIP_SUBTITLE)}</small>`;
  return `
    <button type="button"
            class="province-ambition ${reqClass(met)}${armedClass(armedKey === armedId)}"
            data-ambition="ship-kit"
            data-institution="${escapeHtml(institution)}"
            data-armed-key="${escapeHtml(armedId)}"
            data-kit-shipped="${shipped ? '1' : '0'}"
            aria-disabled="${disabled ? 'true' : 'false'}">
      <span class="province-kit-key">${escapeHtml(label)}</span>
      ${sub}
    </button>`;
}

function raiseButton(world, kind, armedKey = null) {
  const recipe = WORLD_FORCE_RECIPES[kind];
  const check = canRaiseForce(world, kind);
  const wrapClass = check.ok ? '' : ' is-req-unmet';
  const armedId = `raise:${kind}`;
  return `
    <span class="province-raise-wrap${wrapClass}">
    <button type="button"
            class="province-raise-force${armedClass(armedKey === armedId)}"
            data-force="${escapeHtml(kind)}"
            data-armed-key="${escapeHtml(armedId)}"
            aria-disabled="${check.ok ? 'false' : 'true'}">
      Raise ${kind} · ${money(recipe.cash)}
    </button>
    </span>`;
}

export function categoryFanHtml(world, categoryId, options = {}) {
  const institutions = liveInstitutions(world);
  const ambition = world.ambition ?? {};
  const missionaries = ambition.missionaries ?? 0;
  const officers = ambition.officers ?? 0;
  const stacked = ambition.marsParts ?? [];
  const armedKey = options.armedKey ?? null;

  if (categoryId === 'mars') {
    const marsParts = WORLD_MARS_PARTS.map((part) => {
      const stackedPart = stacked.includes(part.id);
      return `
      <button type="button"
              class="province-ambition ${reqClass(stackedPart)}${armedClass(armedKey === `mars-part:${part.id}`)}"
              data-ambition="mars-part"
              data-part="${escapeHtml(part.id)}"
              data-armed-key="mars-part:${escapeHtml(part.id)}"
              aria-disabled="${(!ambition.marsOpen || stackedPart) ? 'true' : 'false'}">
        ${escapeHtml(part.label)}${stackedPart ? ' · stacked' : ` · ${money(part.cash)}`}
      </button>`;
    }).join('');
    return `
      <button type="button"
              class="province-ambition ${reqClass(Boolean(ambition.marsOpen))}${armedClass(armedKey === 'mars')}"
              data-ambition="mars"
              data-armed-key="mars"
              aria-disabled="${ambition.marsOpen ? 'true' : 'false'}">
        ${ambition.marsOpen ? 'Mars open' : 'Open Mars'}
      </button>
      ${kitButton(world, 'space-works', false, armedKey)}
      <div class="province-ambition-actions">${marsParts}</div>
    `;
  }

  if (categoryId === 'culture') {
    const openDesks = WORLD_CITIES.filter((city) => deskIsOpen(world, city.id)
      && !(ambition.convertedDesks ?? []).includes(city.id));
    const missionTargets = (openDesks.length ? openDesks.slice(0, 8) : [{ id: 'singapore-roads', mapName: 'Singapore' }]).map((city) => `
      <button type="button"
              class="province-ambition ${reqClass(false)}${armedClass(armedKey === `send-mission:${city.id}`)}"
              data-ambition="send-mission"
              data-city="${escapeHtml(city.id)}"
              data-armed-key="send-mission:${escapeHtml(city.id)}"
              aria-disabled="${(openDesks.length < 1 || missionaries < 1) ? 'true' : 'false'}">
        Send mission · ${escapeHtml(city.mapName)}
      </button>
    `).join('');
    const creedFound = ambition.creed === 'christianity';
    return `
      <button type="button"
              class="province-ambition ${reqClass(creedFound)}${armedClass(armedKey === 'creed')}"
              data-ambition="creed"
              data-creed="christianity"
              data-armed-key="creed">
        Found doctrine
      </button>
      ${kitButton(world, 'missionary-school', false, armedKey)}
      <button type="button"
              class="province-ambition ${reqClass(false)}${armedClass(armedKey === 'train-missionary')}"
              data-ambition="train-missionary"
              data-armed-key="train-missionary"
              aria-disabled="${institutions.missionarySchool ? 'false' : 'true'}">
        Train missionary · ${money(WORLD_MISSIONARY_COST)}
      </button>
      <p class="province-force-recipe">Bibles ${(world.stocks?.bibles ?? 0)}/1 · send mission spends one bible</p>
      ${missionTargets}
    `;
  }

  if (categoryId === 'military') {
    const chokes = WORLD_CHOKEPOINTS.filter((choke) => !(ambition.stationedChokepoints ?? []).includes(choke.id));
    const chokeTargets = chokes.map((choke) => `
      <button type="button"
              class="province-ambition ${reqClass(false)}${armedClass(armedKey === `station-base:${choke.id}`)}"
              data-ambition="station-base"
              data-choke="${escapeHtml(choke.id)}"
              data-armed-key="station-base:${escapeHtml(choke.id)}"
              aria-disabled="${(officers < 1 || (world.forces?.navy ?? 0) < 1) ? 'true' : 'false'}">
        Station base · ${escapeHtml(choke.label)} · ${money(WORLD_STATION_COST.cash)}
      </button>
    `).join('');
    const raises = WORLD_FORCE_KINDS
      .filter((kind) => WORLD_FORCE_RECIPES[kind]?.age !== 'space')
      .map((kind) => raiseButton(world, kind, armedKey))
      .join('');
    return `
      ${kitButton(world, 'officer-school', false, armedKey)}
      <button type="button"
              class="province-ambition ${reqClass(false)}${armedClass(armedKey === 'commission-officer')}"
              data-ambition="commission-officer"
              data-armed-key="commission-officer"
              aria-disabled="${institutions.officerSchool ? 'false' : 'true'}">
        Commission officer · ${money(WORLD_OFFICER_COST)}
      </button>
      <div class="province-win-raises">${raises}</div>
      ${chokeTargets}
    `;
  }

  if (categoryId === 'financial') {
    const progress = victoryProgress(world).financial;
    const listed = (progress.listed ?? []).length;
    const startups = progress.startups ?? 0;
    return `
      <p class="province-force-recipe">Listings ${listed}/${progress.listingsNeed ?? 3} · listed ${moneyTape(ambition.tape ?? 0)} / ${money(WORLD_CASH_WIN)}</p>
      <p class="province-force-recipe">${startups}/${WORLD_STARTUP_WIN_COUNT} AI startups worth $100m or more</p>
      ${kitButton(world, 'international-exchange', false, armedKey)}
      ${kitButton(world, 'ai-incubator', false, armedKey)}
    `;
  }

  if (categoryId === 'agi') {
    const locked = ambition.biomindTraining || (ambition.biomindBeats ?? 0) >= WORLD_BIOMIND_BEATS;
    return `
      ${kitButton(world, 'biolab', false, armedKey)}
      <button type="button"
              class="province-ambition ${reqClass(locked)}${armedClass(armedKey === 'biomind')}"
              data-ambition="biomind"
              data-armed-key="biomind"
              aria-disabled="${locked ? 'true' : 'false'}">
        Train biomind
      </button>
    `;
  }

  return '';
}

export function ambitionCategoryHtml(world, { expandedId = null, armedWin = null, armedKey = null } = {}) {
  const progress = victoryProgress(world);
  const cards = AMBITION_CATEGORIES.map((category) => {
    const expanded = expandedId === category.id;
    const plate = categoryProgressPlate(world, category.id, progress);
    const warm = categoryHasProgress(world, category.id, progress);
    const winArmed = armedWin === category.id && !armedKey;
    return `
      <article class="province-win ${warm ? 'is-progress' : 'is-untouched'}"
               data-win="${escapeHtml(category.id)}"
               data-expanded="${expanded ? '1' : '0'}"
               data-progress="${warm ? 'progress' : 'untouched'}">
        <button type="button"
                class="province-win-head${winArmed ? ' is-armed' : ''}"
                data-ambition-category="${escapeHtml(category.id)}"
                aria-expanded="${expanded ? 'true' : 'false'}">
          <strong>${escapeHtml(category.label)}</strong>
          <span class="province-win-goal">${escapeHtml(category.goal)}</span>
          <b class="province-win-plate">${escapeHtml(plate)}</b>
        </button>
        ${expanded ? `<div class="province-win-fan">${categoryFanHtml(world, category.id, { armedKey })}</div>` : ''}
      </article>
    `;
  }).join('');
  return `
    <div class="province-win-list">
      <style>${AMBITION_GROUPS_STYLE}</style>
      ${cards}
    </div>
  `;
}

export function globeRailHtml(world, { armed = null, expandedId = null } = {}) {
  const armedGood = armed?.kind === 'good' ? armed.id : null;
  const armedWin = armed?.kind === 'win' ? armed.id : null;
  const armedKey = armed?.kind === 'key' ? armed.id : null;
  return `${yardListHtml(world, { armedGood })}${ambitionCategoryHtml(world, {
    expandedId: expandedId ?? (armedWin || null),
    armedWin,
    armedKey,
  })}`;
}
