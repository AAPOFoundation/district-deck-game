import {
  BUILD_FAMILIES,
  buildCatalog,
  buildCatalogByFamily,
  canPlaceBuilding,
  siteWorksOverlay,
  farmActionCheck,
  worksLiveBlocksForm,
} from '../core/site-works.js';
import { activeParcel } from '../core/city.js';
import { livePadWorksJobs } from '../core/pad-slots.js';
import { buildStartPreview } from '../core/build-preview.js';
import { escapeHtml, money, moneyExact, signedMoney } from '../core/format.js';
import { archetypeThumbSrc } from './card.js';

const FAMILY_LABEL = Object.freeze({
  residential: 'Residential',
  commercial: 'Commercial',
  civic: 'Civic',
  industrial: 'Industrial',
});

export function farmBuildRibbonHtml(city, state, id) {
  const check = farmActionCheck(city, state, id, 'build');
  const preview = check.ok ? buildStartPreview(city, state, id, 'farm') : null;
  // COPY-DRAFT: the farm row uses the same NAV sentence as the other BUILD rows.
  const reason = preview
    ? `Farm · NAV ${moneyExact(preview.navBefore)} to ${moneyExact(preview.navAfter)} when works start · value during works ${moneyExact(preview.valueDuringWorks)}`
    : (check.reason ?? 'One action · one quarter of works');
  const nav = preview
    ? `<span class="build-row__nav${preview.navChange < 0 ? ' is-loss' : ''}" data-build-nav-change="${preview.navChange}">NAV <b>${signedMoney(preview.navChange)}</b></span>`
    : '';
  return `<div class="build-catalog" aria-label="Agriculture building types"><button type="button" class="build-row" data-verb="build-farm" ${check.ok ? '' : 'disabled'} data-reason="${escapeHtml(reason)}" title="${escapeHtml(reason)}"><span class="build-row__label">Build Farm</span><span>$30,000 · L1 Agriculture · 1 quarter</span>${nav}</button></div>`;
}

// BUILD uses each authored archetype plate where one is shipped.
// The catalogue expansion in 1a84184a added forms without plates; use the existing
// steel treatment for those rows instead of requesting missing PNGs. Childcare has a plate.
export const BUILD_THUMBNAIL_STEEL_FALLBACKS = Object.freeze([
  'biolab',
  'cafe-corner',
  'cattle-abattoir',
  'courthouse',
  'dairy-processor',
  'farm',
  'grain-plot',
  'incubator',
  'international-exchange',
  'kiln',
  'missionary-school',
  'officer-school',
  'police-station',
  'printing-press',
  'pulp-mill',
  'refinery',
  'remand-centre',
  'school-high',
  'school-primary',
  'smelter',
  'space-works',
  'steelworks',
  'supermarket-strip',
  'terafab',
  'transport-interchange',
  'winery',
  'works-hall',
]);
const BUILD_THUMBNAIL_STEEL_FALLBACK_SET = new Set(BUILD_THUMBNAIL_STEEL_FALLBACKS);

function availableIndicatorHtml() {
  return `<span class="build-row__available" aria-label="Available" title="Available">
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8"></circle>
      <path d="m8 12 2.6 2.6L16.5 9"></path>
    </svg>
  </span>`;
}

function selectedEntry(catalogId) {
  return buildCatalog().find(({ id }) => id === catalogId) ?? null;
}

export function buildRibbonSummary({
  city = null,
  state = null,
  selectedId = null,
  family = 'residential',
  catalogId = null,
} = {}) {
  const selected = selectedEntry(catalogId);
  if (selected) return selected.label;
  const rows = buildCatalogByFamily(family)
    .filter((entry) => entry.placeable && entry.placesAs);
  if (!city || !state || !selectedId) {
    return `${FAMILY_LABEL[family] ?? family} · ${rows.length} forms`;
  }
  const ceiling = Math.max(0, Number(state.holdings?.[selectedId]?.planningCeiling) || 0);
  const live = rows.filter((entry) => (
    entry.requiredPermitLevel != null && entry.requiredPermitLevel <= ceiling
  )).length;
  return `${FAMILY_LABEL[family] ?? family} · ${live} live`;
}

function dimensions({ w, d }) {
  return `${w * 16}×${d * 16} m`;
}

// The run closes at the final quarter's settle. Works that finish then, or later, earn no rent.
function finishesAfterRun(state, completionQuarter) {
  return Number.isInteger(completionQuarter)
    && Number.isInteger(state?.quarters)
    && completionQuarter >= state.quarters;
}

// The tenant tier the overlay's finished rent was read at (buildTenantQuality in site-works.js).
const TENANT_WORDS = Object.freeze({
  standard: 'a standard tenant',
  'regional-chain': 'a regional chain',
  secure: 'a secure tenant',
});

function rowHtml(city, state, selectedId, entry, catalogId) {
  const overlay = selectedId ? siteWorksOverlay(city, state, selectedId, entry.id) : null;
  const check = selectedId
    ? canPlaceBuilding(city, state, selectedId, entry.id)
    : { ok: false, reason: 'Select a holding for price and fit.' };
  const selected = entry.id === catalogId;
  const ceiling = overlay?.planningCeiling ?? 0;
  const required = entry.requiredPermitLevel;
  const permitLocked = Boolean(overlay && (required == null || required > ceiling));
  const usePermitLocked = Boolean(
    overlay && entry.requiredUsePermitId && !overlay.usePermitted,
  );
  const selectable = Boolean(
    entry.placeable && entry.placesAs && !permitLocked && !usePermitLocked,
  );
  const legal = Boolean(check.ok);
  const preview = legal && selectedId ? buildStartPreview(city, state, selectedId, entry.id) : null;
  const worksBlocked = Boolean(selectedId) && worksLiveBlocksForm(city, state, selectedId, entry.id);
  const chips = [];
  if (required > 0 && (!overlay || permitLocked)) chips.push(`NEEDS L${required}`);
  if (entry.requiredUsePermitId && (!overlay || usePermitLocked)) {
    chips.push(`NEEDS ${entry.requiredUsePermitId.toUpperCase()} USE`);
  }
  if (overlay) {
    if (overlay.secondSlot) chips.push('SECOND · 90%');
    if (!permitLocked && !usePermitLocked && !legal) {
      if (!overlay.zoned) chips.push('MUZ ONLY');
      else if (worksBlocked) chips.push('WORKS LIVE');
      else if (!overlay.cleared) chips.push('CLEAR PAD');
      else if (!overlay.fits) chips.push('OVERSIZE');
      else chips.push('BLOCKED');
    }
  }
  // Works that finish on or after the final settle earn no rent in the run. A refused row has no
  // reducer date, so it takes today's quarter plus the quoted works time, as the click would.
  const completionQuarter = preview?.completionQuarter
    ?? (Number.isInteger(overlay?.durationQuarters) && Number.isInteger(state?.quarter)
      ? state.quarter + overlay.durationQuarters
      : null);
  const finishesLate = finishesAfterRun(state, completionQuarter);
  const rentWords = overlay?.secondSlot ? "added to the pad's rent" : 'rent';
  // COPY-DRAFT: finishing at the last settle differs from finishing beyond the run.
  const finishClause = !preview
    ? ''
    : completionQuarter === state?.quarters
      ? '. The works finish at the final settle and no quarter of rent follows.'
      : finishesLate
        ? ' · the works finish after the final quarter'
        : Number.isInteger(overlay?.rentAfter)
          ? ` · ${moneyExact(overlay.rentAfter)}/qtr ${rentWords} from ${TENANT_WORDS[overlay.rentTenant] ?? TENANT_WORDS.standard} at today's prices once finished`
          : '';
  const rentHtml = !Number.isInteger(overlay?.rentAfter)
    ? ''
    : finishesLate
      ? '<span class="build-row__rent" data-build-rent-late>RENT <b>—</b></span>'
      : `<span class="build-row__rent" data-build-rent-after="${overlay.rentAfter}">RENT <b>${money(overlay.rentAfter)}</b>/Q</span>`;
  const reason = preview
    ? `${entry.label} · NAV ${moneyExact(preview.navBefore)} to ${moneyExact(preview.navAfter)} when works start · value during works ${moneyExact(preview.valueDuringWorks)}${finishClause}`
    : !overlay
      ? check.reason
      : permitLocked || usePermitLocked
        ? [
          permitLocked ? `NEEDS L${required}.` : '',
          usePermitLocked ? `Approve the ${entry.requiredUsePermitId} use first.` : '',
        ].filter(Boolean).join(' ')
        : (check.reason || entry.label);
  const storeys = `${entry.storeys} ${entry.storeys === 1 ? 'STOREY' : 'STOREYS'}`;
  const cash = Number.isInteger(overlay?.cashOut) ? moneyExact(overlay.cashOut) : '—';
  const debt = Number.isInteger(overlay?.debtTaken) ? moneyExact(overlay.debtTaken) : '—';
  const duration = Number.isInteger(overlay?.durationQuarters)
    ? `${overlay.durationQuarters} QTR`
    : '—';
  const thumbSrc = BUILD_THUMBNAIL_STEEL_FALLBACK_SET.has(entry.placesAs)
    ? null
    : archetypeThumbSrc(entry.placesAs);
  const chipHtml = legal
    ? availableIndicatorHtml()
    : chips.length
      ? `<span class="build-row__gates">${chips.map((chip) => (
        `<span class="pair-row__chip pair-row__chip--dormant">${escapeHtml(chip)}</span>`
      )).join('')}</span>`
      : '';
  return `
    <button type="button" class="build-row pair-row ${legal ? 'pair-row--live' : 'pair-row--dormant'}${selected ? ' is-selected' : ''}${permitLocked ? ' is-disabled' : ''}${!legal && !permitLocked ? ' is-context-blocked' : ''}"
            data-build-id="${escapeHtml(entry.id)}"
            data-catalog-id="${escapeHtml(entry.id)}"
            data-build-thumbnail="${thumbSrc ? escapeHtml(thumbSrc) : 'steel'}"
            data-build-placeable="${legal ? 'true' : 'false'}"
            data-build-selectable="${selectable ? 'true' : 'false'}"
            data-build-second-slot="${overlay?.secondSlot ? 'true' : 'false'}"
            data-reason="${escapeHtml(reason)}"
            title="${escapeHtml(reason)}"
            ${thumbSrc ? `style="--build-row-thumb:url(${escapeHtml(thumbSrc)})"` : ''}
            ${permitLocked ? 'aria-disabled="true"' : ''}
            aria-pressed="${selected ? 'true' : 'false'}">
      <span class="pair-row__name">
        <span class="build-row__name-label">${escapeHtml(entry.label)}</span>
      </span>
      ${chipHtml}
      <span class="build-row__facts">
        <span class="build-row__money" data-build-money-plate>
          <span class="build-row__cost build-row__cash" data-build-cash>CASH <b>${cash}</b>${overlay?.secondSlot ? ' <small>90%</small>' : ''}</span>
          <span class="build-row__debt" data-build-debt>DEBT <b>${debt}</b></span>
          ${preview ? `<span class="build-row__nav${preview.navChange < 0 ? ' is-loss' : ''}" data-build-nav-change="${preview.navChange}">NAV <b>${signedMoney(preview.navChange)}</b></span>` : ''}
        </span>
        <span class="build-row__height">
          <span class="build-row__duration">${duration}</span>
          <span class="build-row__storeys">${storeys}</span>
          ${rentHtml}
        </span>
      </span>
    </button>`;
}

export function buildRibbonHtml(city, state, {
  selectedId = null,
  family = 'residential',
  catalogId = null,
} = {}) {
  if (activeParcel(city, state, selectedId)?.surveyedFarm) return farmBuildRibbonHtml(city, state, selectedId);
  const activeFamily = BUILD_FAMILIES.includes(family) ? family : BUILD_FAMILIES[0];
  const rows = buildCatalogByFamily(activeFamily)
    .filter((entry) => entry.placeable && entry.placesAs && entry.id !== 'farm');
  const parcel = selectedId ? activeParcel(city, state, selectedId) : null;
  const contextOverlay = parcel && rows.length
    ? siteWorksOverlay(city, state, selectedId, catalogId ?? rows[0].id)
    : null;
  const overlay = parcel && catalogId
    ? siteWorksOverlay(city, state, selectedId, catalogId)
    : null;
  const holding = state.holdings?.[selectedId];
  // A merged pad can run two jobs; the site is done when the later one finishes.
  const doneAt = holding?.construction
    ? Math.max(...livePadWorksJobs(holding).map(({ construction }) => construction.completionQuarter))
    : null;
  // COPY-DRAFT: the final settle completes these works, without a later rent quarter.
  const context = parcel
    ? Number.isInteger(doneAt)
      ? `${selectedId.toUpperCase()} · WORKS LIVE · ${doneAt === state?.quarters ? 'DONE AT THE FINAL SETTLE' : finishesAfterRun(state, doneAt) ? 'DONE AFTER THE FINAL QUARTER' : `DONE AT Q${doneAt} SETTLE`}`
      : `${selectedId.toUpperCase()} · ${parcel.zoneId} L${contextOverlay?.planningCeiling ?? 0} · ${contextOverlay?.cleared ? 'CLEARED' : 'STANDING'}`
    : 'Select a holding for price and fit.';
  const dimensionsCaption = overlay
    ? `PAD ${dimensions(overlay.lot)} · FORM ${dimensions(overlay.building)}`
    : '';
  return `
    <div class="build-family-chips" aria-label="Build families">
      ${BUILD_FAMILIES.map((id) => `
        <button type="button" class="tag build-family-chip${id === activeFamily ? ' is-selected' : ''}"
                data-build-family="${id}" aria-pressed="${id === activeFamily ? 'true' : 'false'}">
          ${FAMILY_LABEL[id]}
        </button>`).join('')}
    </div>
    <p class="build-ribbon__caption">${escapeHtml(context)}</p>
    ${dimensionsCaption ? `<p class="build-ribbon__caption">${escapeHtml(dimensionsCaption)}</p>` : ''}
    <div class="build-catalog" aria-label="${escapeHtml(FAMILY_LABEL[activeFamily])} building types">
      ${rows.length
        ? rows.map((entry) => rowHtml(city, state, selectedId, entry, catalogId)).join('')
        : '<p class="build-catalog__empty">No forms in this family.</p>'}
    </div>`;
}
