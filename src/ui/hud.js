// District Deck V3.00 — HUD.
// Status bar, rival rail, market forecast, action row, toasts, results.
// Reads state, emits intents. It owns no game rules.

import { rivalLeadSummary } from './clarity.js';
import { toastAnchor, TOAST_CAP_WITH_CARD } from './toast-placement.js';
import { cityMoneyKeyHtml, MONEY_KEY_CITY } from './money-key.js';
import { auctionDestination, auctionQuoteState, seatAuctionCopy } from './auction-desk.js';
import {
  ARCHETYPES, SECTOR_IDS, SECTORS, RULES, RIVAL_POLICIES,
} from '../core/content.js';
import { WORLD_RUN_KEY, inspectWorldRun, worldStoreGet } from '../core/world/envelope.js';
import { quarterBeatCanon } from '../core/world/quarter-beat.js';
import { syncCybercabPanel } from './cybercab-panel.js';
import {
  navOf, debtOf, heldBy, settlementPreview, forecastFor, debtStressBp,
  divestQuote, cashPosition, viewerOwner, ownerOf, rentFor, archetypeIdOf,
} from '../core/economy.js';
import { forecastRates } from '../core/rates.js';
import { canApplyAction, runResult } from '../core/state.js';
import {
  AIDO_ACTIONS_EXHAUSTED, AIDO_STANCES, deriveAidoPlan,
} from '../core/aido-pm.js';
import { holdingDisplayName } from '../core/civic-works.js';
import { activeParcel } from '../core/city.js';
import { globalTile, parseParcelId } from '../core/grid.js';
import {
  DISTRICT_DEFINITION_BY_ID, districtEffectCaption, nearestTileDistance,
} from '../core/landuse.js';
import { auctionTerms } from '../core/event-rules.js';
import { BOARD_LENSES, BOARD_LENS_EVENT } from '../render/event-overlays.js';
import { SEASON_LABEL, seasonForQuarter } from '../core/veggie-patch.js';
import { weatherChipCopy, weatherOf } from '../core/weather.js';
import { openModal } from './modal.js';
import { disclosedRivalTargets } from '../core/rival-targets.js';
import { buildRibbonHtml, buildRibbonSummary } from './build-ribbon.js';
import {
  money, moneyExact, signedMoney, pct, signedPct, conditionLabel, escapeHtml,
} from '../core/format.js';
import { personPortraitSrc, personRailPortraitSrc } from '../core/people-identities.js';
import { constructionStage } from '../core/construction-stages.js';
import { DEMOLITION_STRIKES } from '../core/site-works.js';
import { permitFeeForRung } from '../core/planning-permits.js';
import { chromeActionGlyphSvg, consolidateGlyphSvg } from './action-glyphs.js';
import { STAMP_USE_LABELS } from '../core/synergy-readout.js';
import {
  cityDistrictRoster, cityPairRoster, districtNextBuildCount,
  pairReceivers, quarterFires, pairEffectFragment,
} from '../core/synergy-feed.js';
import {
  archetypeRungLabel, eventCardHtml, planningUnlockQuote,
  personLabel, personRole, personChipName, PERSON_CAST_ORDER,
  shortVerbReason,
} from './card.js';

import { qbeatTitle, tickerTitle, resultHeadline } from './copy-labels.js';

const VERB_ICON = Object.freeze({
  acquire: 'verb-acquire.png',
  renovate: 'verb-renovate.png',
  redevelop: 'verb-redevelop.png',
  notice: 'verb-notice.png',
  buyout: 'verb-buyout.png',
  'redevelop:notice': 'verb-notice.png',
  'redevelop:buyout': 'verb-buyout.png',
  divest: 'verb-divest.png',
  survey: 'verb-survey.png',
  walk: 'verb-walk.png',
  lobby: 'verb-lobby.png',
  merge: 'verb-merge.png',
  hold: 'verb-bank.png',
  settle: 'verb-settle.png',
  bank: 'verb-bank.png',
  bid: 'verb-acquire.png',
  forecast: 'verb-forecast.png',
  macro: 'verb-macro.png',
  events: 'verb-events.png',
});

export function campaignHorizon(state) {
  return Math.max(1, Math.floor(Number(state?.quarters) || RULES.quarters));
}

export function isFinalCampaignQuarter(state) {
  return Number(state?.quarter) >= campaignHorizon(state);
}

export const EXCHANGE_PLATE_EVENT = 'district-deck:exchange-plate';
export const EXCHANGE_PLATE_PULSE_MS = 600;
export const EXCHANGE_PLATE_CLASS = 'is-exchange-pulse';

/** CSS-class flash on the plate whose number actually changed. No layout. */
export function pulseExchangePlate(plate, amount = 0) {
  const doc = globalThis.document;
  if (!doc || typeof doc.querySelector !== 'function') return false;
  const root = doc.querySelector(`[data-exchange-plate="${plate}"]`);
  if (!root) return false;
  const target = (typeof root.querySelector === 'function'
    ? root.querySelector('.value--flap')
    : null) ?? root;
  const tokens = [EXCHANGE_PLATE_CLASS, 'is-ticking', 'is-gain', 'is-loss'];
  target.classList.remove(...tokens);
  if (typeof target.offsetWidth === 'number') void target.offsetWidth;
  target.classList.add(EXCHANGE_PLATE_CLASS, 'is-ticking');
  if (amount > 0) target.classList.add('is-gain');
  if (amount < 0) target.classList.add('is-loss');
  const clear = () => {
    target.classList.remove(...tokens);
  };
  if (typeof target.addEventListener === 'function') {
    target.addEventListener('animationend', clear, { once: true });
  }
  if (typeof globalThis.setTimeout === 'function') {
    globalThis.setTimeout(clear, EXCHANGE_PLATE_PULSE_MS);
  }
  return true;
}

export function settlementDayHeadline(state) {
  return resultHeadline(state);
}

export function finalQuarterSettleWarning(state, remaining = state?.actionsRemaining ?? 0) {
  if (!isFinalCampaignQuarter(state)) return null;
  const left = Math.max(0, Math.floor(Number(remaining) || 0));
  return left > 0
    ? `${left} action${left === 1 ? '' : 's'} remain · settle again to confirm · this run settles for good`
    : 'Final quarter · settle again to confirm · this run settles for good';
}

export function settleConfirmWarning(state, remaining = state?.actionsRemaining ?? 0, { forcedSaleParcelId = null, endsRun = false } = {}) {
  if (isFinalCampaignQuarter(state)) return finalQuarterSettleWarning(state, remaining);
  if (endsRun) return 'Overdraft breach: the run ends at this settle · settle again to confirm';
  if (forcedSaleParcelId) return `Forced sale of ${forcedSaleParcelId.toUpperCase()} at this settle · settle again to confirm`;
  const left = Math.max(0, Math.floor(Number(remaining) || 0));
  return left > 0
    ? `${left} action${left === 1 ? '' : 's'} unspent · settle again to end Q${state.quarter} without them`
    : null;
}

/**
 * What the Settle control shows. It stays steel (quiet) until the quarter's first action while actions remain, and it names the
 * forced sale this settle makes: `note` in full for the desktop line and the phone's aria-label, `hint` short for the phone bar.
 * The sale and whether it ends the run come from settlementPreview, the projection doSettle asserts against, because the reducer
 * resolves pending condition assessments before it picks the parcel; forcedSaleResolution alone can name another parcel.
 */
export function settleButtonState(city, state) {
  const playable = state?.phase === 'play';
  const left = Math.max(0, Math.floor(Number(state?.actionsRemaining) || 0));
  // A crossing accident is the traffic simulation, not the player's move.
  const acted = Array.isArray(state?.log) && state.log.some((row) => row?.q === state.quarter && Number.isInteger(row?.actionOrdinal) && row.type !== 'crossing-accident');
  const due = Boolean(playable && city) && state.creditByOwner?.player?.forcedSaleDueQuarter === state.quarter;
  const preview = due ? settlementPreview(city, state, 'player') : null;
  const sale = preview?.forcedSaleTransactions?.find((tx) => tx.kind === 'forced-sale' && tx.owner === 'player') ?? null;
  const forcedSaleParcelId = sale ? String(sale.parcelId ?? '') : null;
  const forcedSaleEndsRun = Boolean(sale) && preview.terminal === true;
  const quiet = playable && left > 0 && !acted && forcedSaleParcelId === null;
  const note = forcedSaleEndsRun
    ? 'Overdraft breach: the run ends at this settle'
    : (forcedSaleParcelId ? `Forced sale of ${forcedSaleParcelId.toUpperCase()} at this settle` : null);
  const hint = forcedSaleEndsRun ? 'Run ends' : (forcedSaleParcelId ? 'Forced sale' : null);
  return Object.freeze({ quiet, left, acted, forcedSaleParcelId, forcedSaleEndsRun, note, hint });
}

function verbIconSrc(verb, family = '') {
  const key = verb.split(':')[0];
  const file = VERB_ICON[verb] || VERB_ICON[family] || VERB_ICON[key];
  return file ? `assets/img/ui-icons/${file}` : '';
}

function iconImg(src, cls = 'verb__icon') {
  return src
    ? `<img class="${cls}" src="${src}" alt="" width="36" height="36" decoding="async">`
    : '';
}

function chromeActionGlyph(verb) {
  if (verb === 'consolidate') {
    return consolidateGlyphSvg('camera-key__glyph chrome-action__glyph actionbar__glyph');
  }
  return chromeActionGlyphSvg(
    verb,
    'camera-key__glyph chrome-action__glyph actionbar__glyph',
  );
}

const LENS_LAMP_LABEL = Object.freeze({
  ownership: 'OWN',
  corridor: 'COR',
  amenity: 'AMN',
  risk: 'RSK',
});

function lensLampLabel(lens) {
  return LENS_LAMP_LABEL[lens] || String(lens).slice(0, 3).toUpperCase();
}
const EVENT_DETAILS = Object.freeze({
  downturn: `Every sector falls ${pct(Math.abs(RULES.eventDownturnBp))} before its floor.`,
  'flash-flood': 'Low-lying parcels can take damage at settle.',
  'interest-shock': `Interest rises to ${pct(RULES.interestShockBp, 2)} at settle. Vinh can cut it to ${pct(RULES.brokerShockInterestBp, 2)}.`,
  'materials-spike': `Works quotes rise ${pct(RULES.materialsSpikeCostBp - 10000, 0)} while this event is active.`,
  fire: 'Insure before settle. Otherwise lose condition or time.',
  'tenant-arrears': 'This holding pays $0 rent at settle if the tenant misses.',
});

const EVENT_EMPTY_BODY = 'No events this quarter.';
const EVENT_LOCKED_BODY =
  'Open Town Hall for the Notice token. It reveals exact event numbers.';

function arrearsGroupHeadline(events) {
  const list = Array.isArray(events) ? events : [];
  const generic = 'Rent might not land';
  if (!list.length) return generic;
  const roomIds = list.map((event) => event.payload?.roomId ?? event.factors?.roomId ?? null);
  const named = roomIds[0] === 'kitchen' || roomIds[0] === 'bathroom';
  const unanimous = named && roomIds.every((id) => id === roomIds[0]);
  const headline = unanimous
    ? `${roomIds[0][0].toUpperCase()}${roomIds[0].slice(1)} wrecked — rent might not land`
    : generic;
  return list.length > 1 ? `${headline} · ${list.length} parcels` : headline;
}

// COPY-DRAFT: one term per thing in event text (parcel, holding, works, settle).
function canonicalEventText(text) {
  return String(text ?? '')
    .replace(/\bAuction on this block\b/gi, 'Auction on this parcel')
    .replace(/\bLow-lying places\b/gi, 'Low-lying parcels')
    .replace(/\bThis place\b/gi, 'This holding')
    .replace(/\bBuilds\b/g, 'Works')
    .replace(/\bReno and redevelop quotes\b/gi, 'Works quotes')
    .replace(/\bconstruction\b/gi, 'works')
    .replace(/\bsettlement\b/gi, 'settle')
    .replace(/\bsite\b/gi, 'parcel')
    .replace(/\bproperty\b(?!\s+group)/gi, 'parcel');
}

const GROUPED_EVENT_TYPES = Object.freeze(new Set(['tenant-arrears', 'fire']));

export function groupActiveEvents(events) {
  const groups = [];
  const seen = new Set();
  for (const event of events) {
    if (seen.has(event.id)) continue;
    if (GROUPED_EVENT_TYPES.has(event.type)) {
      const pack = events.filter((row) => row.type === event.type);
      pack.forEach((row) => seen.add(row.id));
      groups.push({ id: pack[0].id, type: event.type, events: pack });
      continue;
    }
    seen.add(event.id);
    groups.push({ id: event.id, type: event.type, events: [event] });
  }
  return groups;
}

function eventParcelTag(city, event) {
  return event.anchorIds.find((id) => city.parcels[id]) ?? event.anchorIds[0] ?? null;
}

function eventParcelWho(state, parcelId) {
  if (viewerOwner(state, parcelId) === 'player') return 'yours';
  if (ownerOf(state, parcelId) === 'rival') return 'Petridis';
  return 'on the board';
}

function eventExactLine(city, state, event) {
  const parcelId = eventParcelTag(city, event);
  if (!parcelId) return canonicalEventText(event.forecast.detail);
  const tag = parcelId.toUpperCase();
  const who = eventParcelWho(state, parcelId);
  if (event.type === 'tenant-arrears') {
    const rent = rentFor(city, state, parcelId);
    const chance = event.factors?.chanceBp;
    const roomId = event.payload?.roomId ?? event.factors?.roomId;
    const facts = [];
    if (rent > 0) facts.push(`${moneyExact(rent)} risk`);
    if (Number.isFinite(chance)) facts.push(pct(chance));
    if (roomId === 'kitchen' || roomId === 'bathroom') {
      facts.push(roomId === 'kitchen' ? 'kitchen' : 'bathroom');
    }
    return [tag, who, facts.join(' / ')].filter(Boolean).join(' · ');
  }
  if (event.type === 'fire') return `${tag} · ${who} · insure before settle`;
  return tag;
}

function eventsGroupHtml(city, state, group, unlocked, selectedId) {
  const lead = group.events[0];
  const count = group.events.length;
  const headline = lead.type === 'tenant-arrears'
    ? arrearsGroupHeadline(group.events)
    : (count > 1
      ? `${canonicalEventText(lead.forecast.headline)} · ${count} parcels`
      : canonicalEventText(lead.forecast.headline));
  const value = lead.type === 'auction'
    ? `${lead.payload.crowdSize} watching`
    : `impact ${lead.forecast.severity}`;
  const parcels = [...new Set(group.events.flatMap((event) =>
    event.anchorIds.filter((id) => city.parcels[id])))];
  const selected = group.id === selectedId
    || group.events.some((event) => event.id === selectedId);
  const publicDetail = canonicalEventText(EVENT_DETAILS[group.type] ?? lead.forecast.detail);
  const grouped = GROUPED_EVENT_TYPES.has(group.type);
  const exactLines = unlocked && grouped
    ? group.events.map((event) => eventExactLine(city, state, event))
    : [];
  return `
    <div class="event-row ${selected ? 'is-selected' : ''}" data-event-id="${escapeHtml(group.id)}">
      <div class="row">
        <span class="label">${escapeHtml(headline)}</span>
        <span class="value">${escapeHtml(String(value))}</span>
      </div>
      ${unlocked && publicDetail ? `<p class="intent-text">${escapeHtml(publicDetail)}</p>` : ''}
      ${exactLines.map((line) => `<p class="intent-text">${escapeHtml(line)}</p>`).join('')}
      ${parcels.map((id) =>
        `<button type="button" class="tag tag--stamp" data-goto="${id}">${id.toUpperCase()}</button>`).join('')}
      ${selected && lead.type === 'auction' ? eventCardHtml(lead, unlocked, state) : ''}
    </div>
  `;
}

const MACRO_COUNTER_ACTION = Object.freeze({
  downturn: 'Keep liquidity available for the sector move.',
  'flash-flood': 'Insure exposed holdings before it settles.',
  'interest-shock': 'Reduce debt or secure broker terms.',
  'materials-spike': 'Start works before the spike or wait it out.',
});

const MACRO_EXACT = Object.freeze({
  downturn: `${signedPct(RULES.eventDownturnBp)} sectors before floor · board-wide`,
  'interest-shock': `${pct(RULES.interestShockBp, 2)} interest · ${pct(RULES.brokerShockInterestBp, 2)} with broker · all outstanding debt`,
  'materials-spike': `Works quotes ×${(RULES.materialsSpikeCostBp / 10000).toFixed(2)} · all eligible works`,
});

export function nextMacroForecastModel(city, state) {
  const nextQuarter = state.quarter + 1;
  if (nextQuarter > state.quarters) {
    return { headline: `Q${nextQuarter} CLEAR · RUN ENDS`, detail: '', clear: true };
  }
  const entry = state.macroPlan?.entries.find(
    ({ resolveQuarter }) => resolveQuarter === nextQuarter,
  );
  if (!entry) {
    return { headline: `Q${nextQuarter} CLEAR`, detail: '', clear: true };
  }
  const label = entry.type.replace(/-/g, ' ').toUpperCase();
  const exact = entry.type === 'flash-flood'
    ? (() => {
      const ids = Object.keys(entry.exposureRolls ?? {}).sort().map((id) => id.toUpperCase());
      const parcels = ids.length <= 2
        ? ids.join(' + ')
        : `${ids.slice(0, 2).join(' + ')} +${ids.length - 2}`;
      return `${parcels} · exact exposure · survey`;
    })()
    : MACRO_EXACT[entry.type];
  const unlocked = (
    state.avatars?.player?.accessTokens?.eventForecastUntilQuarter ?? 0
  ) >= state.quarter;
  return {
    headline: `${label} · Q${entry.resolveQuarter} · severity ${entry.severity}`,
    detail: MACRO_COUNTER_ACTION[entry.type],
    exact: unlocked ? exact : null,
    clear: false,
  };
}

function firstSentenceRespectingQuotes(text) {
  let inQuote = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') inQuote = !inQuote;
    if (!inQuote && /[.!?]/.test(ch) && (i === text.length - 1 || /\s/.test(text[i + 1] ?? ''))) {
      return text.slice(0, i + 1).trim();
    }
  }
  return text.trim();
}

function balanceQuotes(text) {
  const n = (String(text).match(/"/g) || []).length;
  if (n % 2 === 0) return text;
  if (text.includes('"') && !text.trimEnd().endsWith('"')) return `${text.trimEnd()}"`;
  return text.replace(/^"+/, '').replace(/"+$/, '').trim();
}

/** First sentence, with authored rhythm intact and opening quote orphans closed. */
export function formatToastDocket(presented) {
  const text = String(presented)
    .replace(/\b1 act left\b/gi, '1 action left')
    .replace(/\b(\d+) act left\b/gi, '$1 actions left')
    .replace(/\s*--\s*/g, ' — ');
  const first = firstSentenceRespectingQuotes(text);
  return balanceQuotes(first);
}

/** One-line pre-commit consequence: cost / cash-after / risk. Never invent arithmetic. */
function cashAfterLine(quote) {
  if (!quote || !Number.isInteger(quote.postActionCash)) return '';
  return `cash after ${money(quote.postActionCash)}`;
}

function actionButton(verb, label, key, check, {
  available,
  className = '',
  family = verb.split(':')[0],
  parcelId = null,
  hint = '',
  blockedHint = '',
  risk = '',
  showKey = true,
  glyph = '',
} = {}) {
  const reason = check.ok ? available : shortVerbReason(verb, check.reason);
  const consequence = check.ok ? hint : blockedHint;
  const blocked = !check.ok;
  const icon = verbIconSrc(verb, family);
  return `
    <button type="button" class="verb ${className}${blocked ? ' verb--blocked' : ''}" data-verb="${escapeHtml(verb)}"
            data-verb-family="${escapeHtml(family)}"
            ${parcelId ? `data-parcel-id="${escapeHtml(parcelId)}"` : ''}
            ${key ? `aria-keyshortcuts="${escapeHtml(key)}"` : ''}
            ${check.ok ? '' : 'disabled'}
            title="${escapeHtml(reason)}" data-reason="${escapeHtml(reason)}">
      ${glyph || iconImg(icon)}
      ${key && showKey ? `<span class="key">${escapeHtml(key)}</span>` : ''}
      <span class="verb__stack">
        <span class="verb__label">${escapeHtml(label)}</span>
        ${consequence ? `<small class="verb__hint">${escapeHtml(consequence)}</small>` : ''}
        ${check.ok && risk ? `<small class="verb__risk">${escapeHtml(risk)}</small>` : ''}
        ${blocked ? `<small class="verb__reason">${escapeHtml(reason)}</small>` : ''}
      </span>
    </button>
  `;
}

export function activeAuction(state) {
  return [...(state.events?.order ?? [])].sort()
    .map((id) => state.events.byId[id])
    .find((event) =>
      event.type === 'auction'
      && event.resolveQuarter === state.quarter
      && event.status !== 'resolved'
      && event.status !== 'cancelled') ?? null;
}

export function auctionRailModel(city, state, auction = activeAuction(state)) {
  if (!auction) return null;
  const parcelId = auction.anchorIds.find((id) => city.parcels[id]) ?? auction.anchorIds[0];
  const terms = auctionTerms(auction.payload.scheduledAsking, auction.payload.crowdSize);
  const firstBid = Math.ceil(terms.reservePrice / terms.increment) * terms.increment;
  const destination = auctionDestination(state);
  const attending = destination?.kind === 'parcel' && destination.id === parcelId;
  const credit = cashPosition(city, auctionQuoteState(state), 'player');
  return Object.freeze({
    eventId: auction.id,
    seatAuction: seatAuctionCopy(state),
    parcelId,
    crowdSize: auction.payload.crowdSize,
    reservePrice: terms.reservePrice,
    reserveSignalBp: terms.tier.reserveBp,
    increment: terms.increment,
    resolvesQuarter: auction.resolveQuarter,
    rivalAttending: Boolean(auction.rivalCommitment),
    rivalCommitment: auction.rivalCommitment?.maxBid ?? 0,
    playerAttending: attending,
    playerCommitment: auction.playerCommitment?.maxBid ?? 0,
    availableCash: credit.ordinaryCash + credit.availableOverdraft,
    ordinaryCash: credit.ordinaryCash,
    availableOverdraft: credit.availableOverdraft,
    reservedForAuction: credit.reservedForAuction,
    firstBid,
    walk: canApplyAction(city, state, {
      type: 'walk',
      avatarId: 'player',
      destination: { kind: 'parcel', id: parcelId },
      purchase: null,
      brokerChoice: null,
    }),
    bid: canApplyAction(city, state, {
      type: 'bid',
      avatarId: 'player',
      eventId: auction.id,
      maxBid: firstBid,
    }),
  });
}

export function auctionRailHtml(model) {
  if (!model) return '';
  return `
    <section class="panel panel--instrument auction-rail" data-auction-rail data-auction-parcel="${model.parcelId}">
      <header><span class="label amber">Auction · ${model.parcelId.toUpperCase()}</span></header>
      <div class="body">
        <div class="auction-rail__metrics">
          ${rowHtml('Commitment', model.playerCommitment ? moneyExact(model.playerCommitment) : 'None')}
          ${rowHtml(model.seatAuction ? 'Available cash' : 'Ordinary cash', moneyExact(model.ordinaryCash))}
          ${rowHtml('Available overdraft', moneyExact(model.availableOverdraft))}
          ${rowHtml('Reserved for auction', moneyExact(model.reservedForAuction))}
          ${model.seatAuction ? rowHtml(`${model.seatAuction.opponent} attendance`, 'Not disclosed')
            : rowHtml('Petridis attendance', model.rivalAttending ? `Attending · ${moneyExact(model.rivalCommitment)} max` : 'Passing')}
          ${rowHtml('Settle', `Resolves Q${model.resolvesQuarter}`)}
          ${rowHtml('Player position', model.playerAttending ? 'At auction parcel' : 'Not attending')}
          ${rowHtml('Increment', moneyExact(model.increment))}
          ${rowHtml('Crowd', `${model.crowdSize} watching`)}
          ${rowHtml('Reserve signal', `${(model.reserveSignalBp / 100).toFixed(0)}%`)}
        </div>
        ${model.seatAuction && !model.seatAuction.enabled ? `<p>${escapeHtml(model.seatAuction.tie)}</p>` : ''}
        <div class="auction-rail__actions">
          ${actionButton('walk', 'Attend', 'W', model.walk, {
            parcelId: model.parcelId,
            available: `Walk to ${model.parcelId.toUpperCase()} (1 action). Then set your maximum.`,
            hint: 'Unlock bidding on this parcel',
          }).replace('<button ', '<button data-auction-action="attend" ')}
          ${actionButton(`bid:${model.firstBid}`, `Bid ${money(model.firstBid)}`, 'B', model.bid, {
            parcelId: model.parcelId,
            family: 'bid',
            className: 'verb--auction',
            available: `Set ${moneyExact(model.firstBid)} maximum. ${model.seatAuction?.tie ?? 'Petridis wins exact ties.'}`,
            hint: `Max ${moneyExact(model.firstBid)} · ${model.seatAuction?.tie ?? 'Petridis wins ties'}`,
          }).replace('<button ', '<button data-auction-action="bid" ')}
        </div>
      </div>
    </section>
  `;
}

function rowHtml(label, value) {
  return `<div class="row"><span class="label">${label}</span><span class="value">${value}</span></div>`;
}

function statusSignedPctHtml(bp) {
  const value = Number(bp) || 0;
  const tone = value > 0 ? 'gain' : value < 0 ? 'loss' : 'status-view__signed--flat';
  return `<span class="status-view__signed ${tone}">${signedPct(value)}</span>`;
}

function statusDatumHtml(value, className = '') {
  return `<span class="status-view__datum${className ? ` ${className}` : ''}">${escapeHtml(value)}</span>`;
}

const AVATAR_TOKEN_LABELS = Object.freeze([
  ['brokerTermsUntilQuarter', 'Cafe'],
  ['askingBandUntilQuarter', 'Outfitter'],
  ['eventForecastUntilQuarter', 'Notice'],
  ['peopleDemandUntilQuarter', 'Food'],
]);

function pairFace(useId) {
  const known = STAMP_USE_LABELS[useId];
  if (known) return known;
  const words = String(useId ?? '').split('-').filter(Boolean).slice(0, 2);
  if (!words.length) return '';
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function pairIdNavigates(id) {
  const key = String(id ?? '');
  if (!key) return false;
  if (key.startsWith('core-')) return false;
  return true;
}

const PAIR_GATEWAY_NAMES = new Set([
  'activity centre',
  'freight',
  'health precinct',
  'justice precinct',
  'meeting strip',
  'strip trade',
]);

const PAIR_GATEWAY_GLYPHS = Object.freeze({
  plane: '<path d="M2 13l8-2 3-8h2l-1 8 7 2v2l-7-1 1 6h-2l-3-6-8 1z"></path>',
  ship: '<path d="M4 11h16l-2 7H6zM8 11V6h8v5M10 6V3h4v3M3 21c2-1 4-1 6 0s4 1 6 0 4-1 6 0"></path>',
  train: '<rect x="5" y="3" width="14" height="14" rx="2"></rect><path d="M8 7h8M8 11h8M8 17l-3 4M16 17l3 4M8 21h8"></path>',
  marquee: '<path d="M3 6h18v12H3zM6 10h12M6 14h8M7 3v3M17 3v3M7 18v3M17 18v3"></path>',
  factory: '<path d="M3 21V9l6 4V9l6 4V5h5v16zM7 17h2M12 17h2M17 17h2"></path>',
});

function pairGatewayKind(row) {
  if (row?.kind !== 'building') return null;
  const signature = `${row.name ?? ''} ${row.leftUse ?? ''} ${row.rightUse ?? ''}`.toLowerCase();
  const named = PAIR_GATEWAY_NAMES.has(String(row.name ?? '').toLowerCase());
  const airport = /\b(?:airport|aerodrome|airfield)\b/.test(signature);
  const port = /\b(?:seaport|port|harbour|wharf|dock)\b/.test(signature);
  if (!named && !airport && !port) return null;
  if (airport) return 'plane';
  if (port) return 'ship';
  if (/freight|factory/.test(signature)) return 'factory';
  if (/activity centre|transport|station|rail/.test(signature)) return 'train';
  return 'marquee';
}

function pairGatewayGlyph(row) {
  const kind = pairGatewayKind(row);
  if (!kind) return '';
  return `<svg class="pair-row__gateway-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${PAIR_GATEWAY_GLYPHS[kind]}</svg>`;
}

function pairLatticeTiles(tiles) {
  const lattice = [];
  for (const tile of tiles ?? []) {
    if (tile && Number.isFinite(tile.gx) && Number.isFinite(tile.gz)) {
      lattice.push(tile);
      continue;
    }
    if (typeof tile !== 'string') continue;
    try {
      const position = parseParcelId(tile);
      lattice.push({ id: tile, ...globalTile(position.bx, position.bz, position.tx, position.tz) });
    } catch {
      // Core mouths and display-only ids do not provide parcel lattice positions.
    }
  }
  return lattice;
}

function pairTilesForId(city, state, id) {
  if (!id) return [];
  const raw = String(id).replace(/:mouth$/, '');
  const emitter = (city.amenityEmitters ?? []).find((entry) =>
    entry.id === id || entry.id === raw);
  if (emitter?.tiles?.length) return pairLatticeTiles(emitter.tiles);
  return pairLatticeTiles(activeParcel(city, state, raw)?.tiles);
}

function pairTileDistance(city, state, leftId, rightId) {
  const left = pairTilesForId(city, state, leftId);
  const right = pairTilesForId(city, state, rightId);
  if (!left.length || !right.length) return null;
  const distance = nearestTileDistance(left, right);
  return Number.isFinite(distance) ? distance : null;
}

function pairProjectModel(city, state, row) {
  const receivers = row.kind === 'person-summary' ? [] : [...pairReceivers(city, state, row)];
  const receiver = receivers[0] ?? null;
  const members = [
    { side: 'left', id: row.leftId, useId: row.leftUse },
    { side: 'right', id: row.rightId, useId: row.rightUse },
  ].map((member) => ({
    ...member,
    face: pairFace(member.useId) || String(member.id ?? '').toUpperCase(),
    status: member.id ? 'filled' : 'missing',
    distance: member.id ? null : row.maxDistance,
    distanceIsLimit: !member.id,
  }));

  if (!row.live) {
    const present = members.filter((member) => member.id);
    if (present.length === 2 && receiver) {
      for (const member of present) {
        member.distance = pairTileDistance(city, state, member.id, receiver.id);
        if (member.distance != null && member.distance > row.maxDistance) {
          member.status = 'out-of-range';
        }
      }
      // Both pieces can flank the receiver while still missing each other's recipe radius.
      // Arm the farther piece so the card still names a concrete next move.
      if (present.every((member) => member.status === 'filled')) {
        const pairDistance = pairTileDistance(city, state, present[0].id, present[1].id);
        const mover = (present[1].distance ?? -1) >= (present[0].distance ?? -1)
          ? present[1]
          : present[0];
        mover.status = 'out-of-range';
        mover.distance = pairDistance;
      }
    } else if (present.length === 2) {
      const pairDistance = pairTileDistance(city, state, present[0].id, present[1].id);
      for (const member of present) {
        member.status = 'out-of-range';
        member.distance = pairDistance;
      }
    }
  }

  const unavailable = members.filter((member) =>
    member.status === 'missing' || member.status === 'out-of-range');
  const status = row.live ? 'live' : unavailable.length === 1 ? 'one-away' : 'dormant';
  // The opportunity plate rolls up the existing positive per-parcel +N values.
  // Signed rows remain in the title receipt so a downside is never disguised as upside.
  const yieldRows = receivers.filter((lot) => Number.isFinite(lot.gainBp) && lot.gainBp > 0);
  const yieldTotal = yieldRows.length
    ? yieldRows.reduce((sum, lot) => sum + lot.gainBp, 0)
    : null;
  const payoff = yieldTotal == null
    ? pairEffectFragment(row)
    : `${signedMoney(yieldTotal)}/q`;
  const payoffHint = receivers
    .filter((lot) => Number.isFinite(lot.gainBp))
    .map((lot) => `${lot.id.toUpperCase()} ${signedMoney(lot.gainBp)}/q`)
    .join(' · ');
  const fallbackFocusId = receiver?.id
    ?? members.find((member) => pairIdNavigates(member.id))?.id
    ?? city.reserve?.id
    ?? city.order?.find((id) => activeParcel(city, state, id))
    ?? null;
  const rank = row.kind === 'person-summary'
    ? 4
    : status === 'live'
      ? 0
      : status === 'one-away'
        ? 1
        : receiver
          ? 2
          : 3;
  const moveDistance = status === 'one-away'
    ? unavailable[0]?.distance ?? Number.POSITIVE_INFINITY
    : Number.POSITIVE_INFINITY;

  return {
    fallbackFocusId,
    gateway: Boolean(pairGatewayKind(row)),
    members,
    moveDistance,
    payoff,
    payoffHint,
    prizeValue: yieldTotal ?? Number.NEGATIVE_INFINITY,
    rank,
    receiver,
    receivers,
    status,
  };
}

function pairSocketHtml(member, model) {
  const focusId = member.status === 'missing'
    ? model.fallbackFocusId
    : pairIdNavigates(member.id)
      ? member.id
      : model.fallbackFocusId;
  const goto = pairIdNavigates(member.id)
    ? ` data-goto="${escapeHtml(member.id)}"`
    : '';
  const focus = focusId ? ` data-pair-focus="${escapeHtml(focusId)}"` : '';
  const distance = member.distance == null
    ? ''
    : `${member.distance} tile${member.distance === 1 ? '' : 's'}`;
  const hint = member.status === 'missing'
    ? `${member.face} · missing · focus build area`
    : member.status === 'out-of-range'
      ? `${member.face} · out of range${distance ? ` · ${distance}` : ''}`
      : `${member.face} · focus piece`;
  const unavailable = member.status !== 'filled';
  const distanceLabel = distance
    ? `${member.distanceIsLimit ? '≤' : ''}${member.distance}T`
    : '';
  const classes = [
    unavailable ? '' : 'tag',
    'pair-row__socket',
    `pair-row__socket--${member.status}`,
    model.marquee && unavailable ? 'pair-row__socket--action' : '',
  ].filter(Boolean).join(' ');
  const contents = unavailable
    ? '<span class="pair-row__socket-mark" aria-hidden="true">+</span>'
    : `<span class="pair-row__socket-face">${escapeHtml(member.face)}</span>`;
  const control = !focusId && !goto
    ? `<span class="${classes}" title="${escapeHtml(hint)}">${contents}</span>`
    : `<button type="button" class="${classes}"${focus}${goto} title="${escapeHtml(hint)}" aria-label="${escapeHtml(hint)}">${contents}</button>`;
  if (!unavailable) return control;
  const caption = [member.face, distanceLabel].filter(Boolean).join(' · ');
  return `<span class="pair-row__socket-unit pair-row__socket-unit--${member.status}">${control}<span class="pair-row__socket-caption" aria-hidden="true">${escapeHtml(caption)}</span></span>`;
}

function pairStatePlate(model) {
  const stateLabel = model.status === 'live'
    ? 'LIVE'
    : model.status === 'one-away'
      ? '1 AWAY'
      : 'DORMANT';
  if (model.status === 'live' && pairIdNavigates(model.receiver?.id)) {
    const focusHint = `${stateLabel} · focus ${model.receiver.id.toUpperCase()}`;
    return `<button type="button" class="pair-row__chip pair-row__chip--live pair-row__lot" data-goto="${escapeHtml(model.receiver.id)}" title="${stateLabel}" aria-label="${escapeHtml(focusHint)}"><span>${stateLabel}</span></button>`;
  }
  return `<span class="pair-row__chip pair-row__chip--${model.status}" title="${stateLabel}"><span>${stateLabel}</span></span>`;
}

function pairPayoffPlate(model) {
  if (!model.payoff) return '';
  const title = model.payoffHint || model.payoff;
  return `<span class="pair-row__payoff pair-row__payoff--${model.status}" title="${escapeHtml(title)}"><span class="pair-row__payoff-value">${escapeHtml(model.payoff)}</span></span>`;
}

function pairRowHtml(city, state, row, selectedId = null, project = null) {
  if (row.kind === 'person-summary') {
    const live = Boolean(row.live);
    const chips = live
      ? (row.liveNames ?? []).map((name) =>
        `<span class="tag pair-row__fire">${escapeHtml(name)}</span>`).join('')
      : '<span class="pair-row__chase">no people fires</span>';
    return `<div class="pair-row pair-row--people ${live ? 'pair-row--live' : 'pair-row--dormant'}">`
      + `<span class="pair-row__plate"><span class="pair-row__name">${escapeHtml(row.name)}</span></span>`
      + `<span class="pair-row__chip pair-row__chip--${live ? 'live' : 'dormant'}"><span>${live ? 'LIVE' : 'DORMANT'}</span></span>`
      + `<span class="pair-row__tags">${chips}${live ? `<span class="pair-row__fire-count">${row.liveCount} FIRE${row.liveCount === 1 ? '' : 'S'}</span>` : ''}</span>`
      + '</div>';
  }
  const model = project ?? pairProjectModel(city, state, row);
  const selectedKey = String(selectedId ?? '').toLowerCase();
  const selected = Boolean(selectedKey) && (
    [row.leftId, row.rightId].some((id) => String(id ?? '').toLowerCase() === selectedKey)
    || model.receivers.some((lot) => String(lot.id ?? '').toLowerCase() === selectedKey)
  );
  const cardClasses = [
    'pair-row',
    `pair-row--${model.status}`,
    model.gateway ? 'pair-row--gateway' : '',
    model.marquee ? 'pair-row--next-move' : '',
    model.rank === 2 ? 'pair-row--in-reach' : '',
    model.rank === 3 ? 'pair-row--out-of-range' : '',
    selected ? 'is-selected' : '',
  ].filter(Boolean).join(' ');
  return `<div class="${cardClasses}" data-pair-state="${model.status}">`
    + `<span class="pair-row__plate">${pairGatewayGlyph(row)}<span class="pair-row__name">${escapeHtml(row.name)}</span></span>`
    + pairStatePlate(model)
    + `<span class="pair-row__tags pair-row__sockets">${model.members.map((member) => pairSocketHtml(member, model)).join('')}</span>`
    + pairPayoffPlate(model)
    + '</div>';
}

function legacyPairsRosterForRail(city, state) {
  const roster = [...cityPairRoster(city, state)].map((row) => ({
    project: pairProjectModel(city, state, row),
    row,
  }));
  roster.sort((left, right) => {
    if (left.project.rank !== right.project.rank) return left.project.rank - right.project.rank;
    if (left.project.rank === 1) {
      const leftDistance = Number.isFinite(left.project.moveDistance)
        ? left.project.moveDistance
        : Number.POSITIVE_INFINITY;
      const rightDistance = Number.isFinite(right.project.moveDistance)
        ? right.project.moveDistance
        : Number.POSITIVE_INFINITY;
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      const leftPrize = Number.isFinite(left.project.prizeValue)
        ? left.project.prizeValue
        : Number.NEGATIVE_INFINITY;
      const rightPrize = Number.isFinite(right.project.prizeValue)
        ? right.project.prizeValue
        : Number.NEGATIVE_INFINITY;
      if (leftPrize !== rightPrize) return rightPrize - leftPrize;
    }
    return left.row.name.localeCompare(right.row.name);
  });
  const marquee = roster.find(({ project }) => project.rank === 1);
  if (marquee) marquee.project.marquee = true;
  return roster;
}

export function districtPayoffModel(city, state, row) {
  const signedExact = (value) => value === 0
    ? '$0'
    : `${value > 0 ? '+' : '−'}${moneyExact(Math.abs(value))}`;
  const without = {
    ...state,
    districtEngine: {
      ...(state.districtEngine ?? {}),
      formations: (state.districtEngine?.formations ?? [])
        .filter((formation) => formation.districtId !== row.id),
    },
  };
  // Same marginal-rent plate for every district: player's in-range holdings only
  // (out-of-range parcels contribute $0 via districtEffectBpForParcel).
  const receivers = heldBy(state, 'player').map((id) => {
    const delta = rentFor(city, state, id) - rentFor(city, without, id);
    return { id, delta };
  }).filter(({ delta }) => delta !== 0);
  const total = receivers.reduce((sum, receiver) => sum + receiver.delta, 0);
  const caption = districtEffectCaption(DISTRICT_DEFINITION_BY_ID[row.id]);
  return {
    payoff: `${signedExact(total)}/q`,
    payoffHint: receivers.length
      ? receivers.map(({ id, delta }) => `${id.toUpperCase()} ${signedExact(delta)}/q`).join(' · ')
      : 'No player holdings currently receive quarterly rent from this footprint.',
    caption,
    receivers,
  };
}

function districtEffectCaptionHtml(caption) {
  const parts = String(caption ?? '').split(' · ');
  return `<span class="pair-row__effect">${parts.map((part, index) => (
    `${index ? '<span class="pair-row__socket-caption" aria-hidden="true"> · </span>' : ''}`
    + `<span class="pair-row__socket-caption">${escapeHtml(part)}</span>`
  )).join('')}</span>`;
}

function districtSocketHtml(member, row) {
  const targetIds = member.targetIds ?? [];
  const candidateIds = member.candidateParcelIds ?? [];
  const focusIds = member.status === 'filled' ? targetIds : candidateIds;
  const focusAttr = member.status === 'filled'
    ? ` data-district-targets="${escapeHtml(focusIds.join('|'))}"`
    : ` data-district-candidates="${escapeHtml(focusIds.join('|'))}"`;
  const fallbackBlocks = row.footprintBlockIds.length
    ? ` data-district-fallback-blocks="${escapeHtml(row.footprintBlockIds.join('|'))}"`
    : '';
  const required = member.required > 1 ? ` · ${member.count}/${member.required}` : '';
  const hint = member.status === 'filled'
    ? `${member.face}${required} · highlight satisfying parcel${focusIds.length === 1 ? '' : 's'}`
    : `${member.face}${required} · highlight candidate parcel${focusIds.length === 1 ? '' : 's'}`;
  const classes = `pair-row__socket pair-row__socket--${member.status}${member.status === 'filled' ? ' tag' : ''}`;
  const contents = member.status === 'filled'
    ? `<span class="pair-row__socket-face">${escapeHtml(member.face)}</span>`
    : '<span class="pair-row__socket-mark" aria-hidden="true">+</span>';
  const requirementNote = member.status === 'filled'
    ? ''
    : ` data-district-requirement="${escapeHtml(`${member.face}${required} required`)}"`;
  const control = focusIds.length
    ? `<button type="button" class="${classes}"${focusAttr}${fallbackBlocks}${requirementNote} title="${escapeHtml(hint)}" aria-label="${escapeHtml(hint)}">${contents}</button>`
    : `<span class="${classes}"${requirementNote} title="${escapeHtml(hint)}">${contents}</span>`;
  if (member.status === 'filled') return control;
  return `<span class="pair-row__socket-unit pair-row__socket-unit--missing">${control}<span class="pair-row__socket-caption">${escapeHtml(`${member.face}${required}`)}</span></span>`;
}

function districtStatePlate(row) {
  const stateLabel = row.status === 'live'
    ? (row.pendingDissolution ? 'LIVE · REVIEW' : 'LIVE')
    : row.status === 'ready'
      ? 'READY'
      : row.status === 'one-away'
        ? '1 AWAY'
        : 'DORMANT';
  const tone = row.status === 'ready' ? 'one-away' : row.status;
  return `<span class="pair-row__chip pair-row__chip--${tone}" title="${escapeHtml(stateLabel)}"><span>${escapeHtml(stateLabel)}</span></span>`;
}

function districtRowHtml(city, state, row, selectedId = null) {
  const payoff = districtPayoffModel(city, state, row);
  const selectedKey = String(selectedId ?? '');
  const selected = row.members.some((member) => (
    member.targetIds?.includes(selectedKey) || member.candidateParcelIds?.includes(selectedKey)
  ));
  const tone = row.status === 'ready' ? 'one-away' : row.status;
  const blockAttr = row.footprintBlockIds.length
    ? ` data-district-blocks="${escapeHtml(row.footprintBlockIds.join('|'))}"`
      + (row.blockId ? ` data-district-home-block="${escapeHtml(String(row.blockId))}"` : '')
    : '';
  const footprintHint = row.originBlockId
    ? `${row.name} · block ${row.originBlockId} + adjacent blocks`
    : row.name;
  return `<div class="pair-row pair-row--${tone}${selected ? ' is-selected' : ''}" data-district-id="${escapeHtml(row.id)}" data-district-effect="${escapeHtml(payoff.caption)}" data-pair-state="${escapeHtml(row.status)}">`
    + `<button type="button" class="pair-row__plate"${blockAttr} title="${escapeHtml(footprintHint)}" aria-label="${escapeHtml(`${footprintHint} · highlight footprint`)}"><span style="display:flex;flex-direction:column;gap:2px;min-width:0"><span class="pair-row__name">${escapeHtml(row.name)}</span>${districtEffectCaptionHtml(payoff.caption)}</span></button>`
    + districtStatePlate(row)
    + `<span class="pair-row__tags pair-row__sockets">${row.members.map((member) => districtSocketHtml(member, row)).join('')}</span>`
    + `<span class="pair-row__payoff pair-row__payoff--${tone}" title="${escapeHtml(payoff.payoffHint)}"><span class="pair-row__payoff-value">${escapeHtml(payoff.payoff)}</span></span>`
    + '</div>';
}

function pairsRosterForRail(city, state) {
  const rank = { live: 0, ready: 1, 'one-away': 2, dormant: 3 };
  return [...cityDistrictRoster(city, state)].sort((left, right) =>
    rank[left.status] - rank[right.status] || left.name.localeCompare(right.name));
}

function pairNextBuildCount(city, state) {
  return districtNextBuildCount(city, state);
}

/** Inner body HTML for the DISTRICTS rail panel (one condition row per definition). */
export function pairsRailHtml(city, state, selectedId = null) {
  return pairsRosterForRail(city, state)
    .map((row) => districtRowHtml(city, state, row, selectedId))
    .join('');
}

const TICKER_CAP = 8;

function tickerReducedMotion() {
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (root?.classList?.contains('reduced-motion')) return true;
  }
  try {
    return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  } catch {
    return false;
  }
}

/** Diff live quarter fires into a capped, de-duped ticker tape. */
export function mergeTickerLines(prevLines, prevSeenKeys, fires, cap = TICKER_CAP) {
  const limit = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : TICKER_CAP;
  const lines = [];
  const seen = new Set(
    prevSeenKeys instanceof Set
      ? prevSeenKeys
      : Array.isArray(prevSeenKeys)
        ? prevSeenKeys
        : prevSeenKeys
          ? [...prevSeenKeys]
          : [],
  );
  if (Array.isArray(prevLines)) {
    for (const line of prevLines) {
      if (!line?.key) continue;
      seen.add(line.key);
      lines.push({
        key: line.key,
        name: line.name,
        fragment: line.fragment ?? '',
        anchorId: line.anchorId ?? null,
      });
    }
  }
  for (const fire of fires ?? []) {
    const key = fire?.key;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    lines.push({
      key,
      name: fire.name,
      fragment: fire.fragment ?? '',
      anchorId: fire.anchorId ?? null,
    });
  }
  const clipped = lines.slice(-limit);
  return Object.freeze({
    lines: Object.freeze(clipped.map((line) => Object.freeze({ ...line }))),
    seen,
  });
}

function tickerLineHtml(line) {
  const name = String(line?.name ?? '').toUpperCase();
  const fragment = String(line?.fragment ?? '');
  const anchorId = line?.anchorId != null && line.anchorId !== ''
    ? String(line.anchorId)
    : '';
  const parts = [`<span class="ticker-line__name">${escapeHtml(name)}</span>`];
  if (fragment) {
    parts.push(`<span class="ticker-line__frag">${escapeHtml(fragment)}</span>`);
  }
  if (anchorId) {
    parts.push(
      `<button type="button" class="ticker-line__anchor" data-goto="${escapeHtml(anchorId)}">`
      + `${escapeHtml(anchorId.toUpperCase())}</button>`,
    );
  }
  return `<div class="ticker-line" title="${escapeHtml(tickerTitle(line))}" data-ticker-key="${escapeHtml(String(line?.key ?? ''))}">`
    + `${parts.join('<span class="ticker-line__sep" aria-hidden="true"> · </span>')}</div>`;
}

/** Statusbar ticker row. Empty when there are no stamped fires. */
export function tickerStripHtml(lines) {
  if (!Array.isArray(lines) || !lines.length) return '';
  const reduced = tickerReducedMotion();
  const shown = reduced ? lines.slice(-1) : lines;
  const reducedClass = reduced ? ' ticker--static' : '';
  return `<div class="status-row status-row--ticker${reducedClass}" data-ticker aria-live="polite">`
    + `<div class="ticker-window">`
    + `<div class="ticker-stack" style="--ticker-count:${shown.length}">`
    + `${shown.map((line) => tickerLineHtml(line)).join('')}`
    + `</div></div></div>`;
}

function avatarTokenStrip(state) {
  const tokens = state.avatars?.player?.accessTokens ?? {};
  return `
    <div class="avatar-token-strip" data-avatar-token-strip aria-label="Avatar intel tokens">
      ${AVATAR_TOKEN_LABELS.map(([key, label]) => {
        const until = tokens[key] ?? 0;
        const active = until >= state.quarter;
        return `<span class="avatar-token ${active ? 'is-active' : 'is-locked is-empty'}"
          data-avatar-token="${key}" data-until-quarter="${until}"
          aria-label="${label} token ${active ? `active through quarter ${until}` : 'locked'}">
          ${label}${active ? `<small>Q${until}</small>` : '<small class="avatar-token__empty" aria-hidden="true"></small>'}
        </span>`;
      }).join('')}
    </div>
  `;
}

/** On-board cast rows for the people rail (builders, consultants, AI figure). */
export function castRailModel(state) {
  const order = [...(state?.people?.order ?? [])].sort((left, right) => {
    const a = state.people.byId[left];
    const b = state.people.byId[right];
    const rankA = PERSON_CAST_ORDER[a?.archetypeId] ?? 50;
    const rankB = PERSON_CAST_ORDER[b?.archetypeId] ?? 50;
    if (rankA !== rankB) return rankA - rankB;
    return left.localeCompare(right);
  });
  return order.map((id) => {
    const person = state.people.byId[id];
    const dest = person?.pendingOutcome?.status === 'found'
      ? 'collected · still on board'
      : person?.toAnchor
        ? `${person.toAnchor.kind} · ${String(person.toAnchor.id).toUpperCase()}`
        : 'no destination';
    const status = person?.pendingOutcome?.status === 'found'
      ? 'COLLECTED · ON BOARD'
      : person?.toAnchor
        ? `${String(person.toAnchor.kind).toUpperCase()} ${String(person.toAnchor.id).toUpperCase()}`
        : `ON BOARD · Q${person?.despawnAfterQuarter ?? state.quarter}`;
    return {
      id,
      archetypeId: person?.archetypeId ?? '',
      identityId: person?.identityId ?? 0,
      label: personLabel(person?.archetypeId, person),
      role: personRole(person?.archetypeId, person),
      dest,
      status,
      until: person?.despawnAfterQuarter ?? state.quarter,
    };
  });
}

const RAIL_TOOL_ROWS = Object.freeze([
  ['demolish', 'Demolish'],
  ['build', 'Build'],
  ['people', 'People'],
  ['pm', 'PM'],
]);

/** Wave B rail contract: exactly four top-level square tools in authored order. */
export function railToolsHtml(state, { tool = null, panels = {} } = {}) {
  const playable = state?.phase === 'play';
  return `
    <nav class="rail-tools" aria-label="Board tools">
      ${RAIL_TOOL_ROWS.map(([id, label]) => {
        const pressed = id === 'demolish' ? tool === 'demolish' : Boolean(panels[id]);
        const disabled = id === 'demolish' && !playable;
        return `
          <button type="button" class="rail-tool mat-steel${pressed ? ' is-armed' : ''}"
                  data-rail-tool="${id}" aria-pressed="${pressed ? 'true' : 'false'}"
                  ${disabled ? 'disabled' : ''}>
            <span class="rail-tool__well" aria-hidden="true">${chromeActionGlyph(id)}</span>
            <span class="rail-tool__label">${label}</span>
          </button>`;
      }).join('')}
    </nav>`;
}

if (typeof document !== 'undefined') document.addEventListener('districtdeck:agendas', (event) => {
  const text = Object.entries(event.detail?.activityCounts ?? {}).map(([activity, count]) => `${count} ${activity}`).join(' · ');
  for (const node of document.querySelectorAll('[data-population-activities]')) node.textContent = text;
});

export function peoplePanelHtml(state) {
  const cast = castRailModel(state);
  const life = globalThis.__districtDeck?.view?.ambientLife;
  const activities = Object.entries(life?.activityCounts ?? {});
  if (!cast.length && !activities.length) return '<p class="intent-text intent-text--empty">No people on the board.</p>';
  return `
    <p style="color: var(--chrome-bone) !important; padding: 0 8px" data-population-activities aria-live="polite">${activities.map(([activity, count]) =>
      `${count} ${escapeHtml(activity)}`).join(' · ')}</p>
    <div class="rail-directory rail-directory--people" aria-label="On-board cast">
      ${cast.map((row) => {
        const portraitSrc = personPortraitSrc(row.archetypeId, row.identityId ?? 0);
        const railSrc = row.archetypeId === 'dog'
          ? portraitSrc
          : personRailPortraitSrc(row.archetypeId, row.identityId ?? 0);
        const chip = personChipName(row.archetypeId, { identityId: row.identityId ?? 0 });
        return `
          <button type="button" class="rail-directory__row rail-person-row"
                  data-person-goto="${escapeHtml(row.id)}"
                  title="${escapeHtml(row.label)} · ${escapeHtml(row.status)}">
            <span class="rail-person-row__portrait">
              <img src="${escapeHtml(railSrc)}" alt="" loading="lazy"
                   onerror="this.src='${escapeHtml(portraitSrc)}'">
            </span>
            <span class="rail-directory__copy">
              <strong>${escapeHtml(chip)}</strong>
              <span>${escapeHtml(row.role)}</span>
              <small>${escapeHtml(row.status)}</small>
            </span>
          </button>`;
      }).join('')}
    </div>`;
}

function holdingWorksStatus(state, holding) {
  if (holding.construction) {
    const stage = constructionStage(holding.construction, state.quarter);
    return stage?.progressLabel ?? `Works · Q${holding.construction.completionQuarter}`;
  }
  if (holding.renovation) return `Renovation · Q${holding.renovation.startedQuarter + 1}`;
  if (holding.redevelopmentNotice) return `Notice · Q${holding.redevelopmentNotice.startsQuarter}`;
  if (holding.demolition?.strikes && holding.demolition.strikes < DEMOLITION_STRIKES) {
    return `Demolition · ${holding.demolition.strikes}/${DEMOLITION_STRIKES}`;
  }
  return null;
}

const AIDO_STANCE_LABEL = Object.freeze({
  'risk-taker': 'Risk-taker',
  balanced: 'Balanced',
  'low-risk': 'Low-risk',
});

// V4.1 Wave 1: cassette entry retired. Panel HTML + `_showAidoPm` stay dormant
// in place (V3.36 Redevelop precedent). No DOM route calls this.
export function aidoPmPanelHtml(city, state, stance = null) {
  const plan = stance ? deriveAidoPlan(city, state, stance) : { stance: null, lines: [] };
  const lines = (plan.lines ?? []).map((line) => (
    `<li class="aido-pm__line" data-aido-kind="${escapeHtml(line.kind)}">`
    + `<strong>${escapeHtml(line.label)}</strong>`
    + `<span>${escapeHtml(line.effect)}</span>`
    + '</li>'
  )).join('');
  return `
    <div class="aido-pm" data-aido-pm data-aido-stance="${escapeHtml(stance ?? '')}">
      <p class="aido-pm__voice">Four moves this quarter. You confirm; I don't freelance.</p>
      <div class="aido-pm__stances" role="group" aria-label="Aido stances">
        ${AIDO_STANCES.map((id) => `
          <button type="button" class="aido-pm__stance${id === stance ? ' is-selected' : ''}"
                  data-aido-stance="${id}" aria-pressed="${id === stance ? 'true' : 'false'}">
            ${AIDO_STANCE_LABEL[id]}
          </button>`).join('')}
      </div>
      <h2 class="aido-pm__plan-title">AIDO'S PLAN</h2>
      ${stance
        ? (lines
          ? `<ol class="aido-pm__plan">${lines}</ol>`
          : '<p class="aido-pm__empty">No moves fit this quarter.</p>')
        : '<p class="aido-pm__empty">Pick a stance for this quarter.</p>'}
    </div>`;
}

export function propertyManagementPanelHtml(city, state) {
  const held = heldBy(state, 'player')
    .map((id) => ({ id, holding: state.holdings[id], parcel: activeParcel(city, state, id) }))
    .filter(({ parcel }) => Boolean(parcel));
  if (!held.length) {
    return '<p class="intent-text intent-text--empty">No holdings yet. Acquire from a parcel card.</p>';
  }
  return `
    <div class="rail-directory rail-directory--holdings" aria-label="Property Management holdings">
      ${held.map(({ id, holding, parcel }) => {
        const formId = holding.construction?.toArchetype ?? archetypeIdOf(city, state, id);
        const archetype = ARCHETYPES[formId];
        const works = holdingWorksStatus(state, holding);
        const status = works
          ?? (holding.siteCleared
            ? 'Cleared pad'
            : state.parcelStatus?.[id]?.occupancy === 'tenant'
              ? `Tenanted · ${moneyExact(rentFor(city, state, id))}/q`
              : 'Vacant');
        const form = holding.siteCleared && !holding.construction
          ? 'Cleared pad'
          : holdingDisplayName(holding, archetype?.label ?? 'Unknown form');
        return `
          <button type="button" class="rail-directory__row rail-holding-row"
                  data-goto="${escapeHtml(id)}" title="Open ${escapeHtml(id.toUpperCase())}">
            <span class="rail-holding-row__id">${escapeHtml(id.toUpperCase())}</span>
            <span class="rail-directory__copy">
              <strong>${escapeHtml(form)}</strong>
              <span>${escapeHtml(parcel.districtName ?? parcel.districtId ?? 'District')}</span>
              <small>${escapeHtml(status)}</small>
            </span>
          </button>`;
      }).join('')}
    </div>`;
}

export class Hud {
  constructor(root, {
    onVerb, onSettle, onHelp, onRestart, onGoto, onPairFocus, onDistrictFocus, onPersonGoto,
    onBuildPreview, onSurfaceChange = () => {},
  }) {
    this.root = root;
    this.onVerb = onVerb;
    this.onSettle = onSettle;
    this.onHelp = onHelp;
    this.onRestart = onRestart;
    this.onGoto = onGoto;
    this.onPairFocus = onPairFocus;
    this.onDistrictFocus = onDistrictFocus;
    this.onPersonGoto = onPersonGoto;
    this.onBuildPreview = onBuildPreview;
    this.onSurfaceChange = onSurfaceChange;
    this.activeLens = 'ownership';
    this.tool = null;
    this.buildFamily = 'residential';
    this.buildCatalogId = null;
    this.buildContextId = null;
    this.pairsExpanded = false;
    // Wave B tool panels are mutually exclusive and survive ordinary state renders.
    this.railPanels = {
      build: false,
      people: false,
      pm: false,
    };

    this.statusbar = root.querySelector('.statusbar');
    this.rail = root.querySelector('.rail');
    this.actionbar = root.querySelector('.actionbar');
    this.toasts = root.querySelector('.toasts');
    this.mobileStrip = root.querySelector('.mobile-cycle-strip');
    this.cameraControls = root.querySelector('.camera-controls');
    this._prevCash = null;
    this._prevNav = null;
    this._tickerSeen = new Set();
    this._tickerLines = [];
    this._onExchangePlate = (event) => {
      const plate = event?.detail?.plate;
      if (plate !== 'cash' && plate !== 'tape') return;
      pulseExchangePlate(plate, event.detail?.amount ?? 0);
    };
    const doc = root?.ownerDocument ?? globalThis.document;
    if (doc && typeof doc.addEventListener === 'function') {
      doc.addEventListener(EXCHANGE_PLATE_EVENT, this._onExchangePlate);
    }

    this.actionbar.addEventListener('click', (event) => {
      const button = event.target.closest('[data-verb]');
      if (!button || button.disabled) return;
      if (button.dataset.verb === 'settle') this.onSettle?.();
      else this._emitVerb(button.dataset.verb, button.dataset.parcelId || undefined);
    });

    // The rival's targets are clickable: contesting a disclosed bid is the counter-play.
    this.rail.addEventListener('click', (event) => {
      const districtsToggle = event.target.closest('[data-districts-toggle]');
      if (districtsToggle) {
        this.pairsExpanded = !this.pairsExpanded;
        if (this.lastCity && this.lastState) this._renderRail(this.lastCity, this.lastState);
        this.rail.querySelector('[data-districts-toggle]')?.focus();
        return;
      }
      const railTool = event.target.closest('[data-rail-tool]');
      if (railTool) {
        this._activateRailTool(railTool.dataset.railTool);
        return;
      }
      const family = event.target.closest('[data-build-family]');
      if (family) {
        this.buildFamily = family.dataset.buildFamily || 'residential';
        this.buildCatalogId = null;
        if (this.lastCity && this.lastState) this._renderRail(this.lastCity, this.lastState);
        this.onBuildPreview?.(null);
        return;
      }
      const build = event.target.closest('[data-build-id]');
      if (build) {
        if (build.dataset.buildSelectable !== 'true') {
          if (build.dataset.reason) this.toast(build.dataset.reason, 'reject');
          return;
        }
        this.buildCatalogId = build.dataset.buildId || null;
        if (this.lastCity && this.lastState) this._renderRail(this.lastCity, this.lastState);
        this.onBuildPreview?.(this.buildCatalogId);
        return;
      }
      const verb = event.target.closest('[data-verb]');
      if (verb) {
        if (verb.disabled || verb.classList.contains('is-disabled')
          || verb.getAttribute('aria-disabled') === 'true') {
          const reason = verb.dataset.reason;
          if (reason) this.toast(reason, 'reject');
          return;
        }
        const name = verb.dataset.verb;
        if (name === 'settle') {
          this.onSettle?.();
          return;
        }
        this._emitVerb(name, verb.dataset.parcelId || undefined);
        return;
      }
      const personGoto = event.target.closest('[data-person-goto]');
      if (personGoto) {
        this.onPersonGoto?.(personGoto.dataset.personGoto);
        return;
      }
      const districtSocket = event.target.closest('[data-district-targets], [data-district-candidates]');
      if (districtSocket) {
        // An unfilled socket names its full requirement in a toast — the board's short
        // caption is space-bound, the popup is not (V3.39 T1).
        const requirement = districtSocket.dataset.districtRequirement
          ?? districtSocket.closest('[data-district-requirement]')?.dataset.districtRequirement;
        if (requirement) this.toast(requirement, 'good');
        const split = (value) => String(value ?? '').split('|').filter(Boolean);
        this.onDistrictFocus?.({
          kind: 'parcels',
          targetIds: split(districtSocket.dataset.districtTargets),
          candidateParcelIds: split(districtSocket.dataset.districtCandidates),
          blockIds: split(districtSocket.dataset.districtFallbackBlocks),
        });
        return;
      }
      const districtHeader = event.target.closest('[data-district-blocks]');
      if (districtHeader) {
        this.onDistrictFocus?.({
          kind: 'blocks',
          blockIds: String(districtHeader.dataset.districtBlocks ?? '').split('|').filter(Boolean),
          homeBlockId: districtHeader.dataset.districtHomeBlock ?? null,
        });
        return;
      }
      const pairFocus = event.target.closest('[data-pair-focus]');
      if (pairFocus) {
        this.onPairFocus?.(pairFocus.dataset.pairFocus);
        return;
      }
      const goto = event.target.closest('[data-goto]');
      if (goto) {
        this.onGoto?.(goto.dataset.goto);
        return;
      }
    });
    this.mobileStrip?.addEventListener('click', (event) => {
      if (event.target.closest('button')) {
        this.mobileStrip.querySelectorAll('details[open]').forEach((drawer) => { drawer.open = false; });
      }
      if (event.target.closest('[data-help]')) {
        this.onHelp?.();
        return;
      }
      const railTool = event.target.closest('[data-mobile-rail-tool]');
      if (railTool) {
        const key = railTool.dataset.mobileRailTool;
        const opening = this._activateRailTool(key);
        if (opening && key !== 'demolish') this._showMobileToolPanel(key);
        return;
      }
      const statusView = event.target.closest('[data-status-view]');
      if (statusView) {
        this._showStatusView(statusView.dataset.statusView);
        return;
      }
      const personGoto = event.target.closest('[data-person-goto]');
      if (personGoto) {
        this.onPersonGoto?.(personGoto.dataset.personGoto);
        return;
      }
      const goto = event.target.closest('[data-goto]');
      if (goto) this.onGoto?.(goto.dataset.goto);
    });
    this._onKey = (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.matches('input, textarea, [contenteditable]')) return;
      const key = event.key.toLowerCase();
      if (key === 'v') {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.cycleLens();
        return;
      }
      if (!['b', 'w'].includes(key)) return;
      const selector = key === 'b'
        ? '[data-auction-action="bid"]'
        : '[data-auction-action="attend"]';
      const button = this.rail.querySelector(selector);
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!button.disabled) button.click();
      else this.toast(button.dataset.reason ?? 'That auction action is unavailable.', 'reject');
    };
    window.addEventListener('keydown', this._onKey, true);
  }

  /** Keep the one actionbar alias out of the reducer contract. */
  _emitVerb(name, parcelId, extra = null) {
    const type = name === 'bank' ? 'hold' : name;
    this.onVerb?.(type, parcelId, extra);
  }

  _activateRailTool(key) {
    if (key === 'demolish') {
      this.railPanels.build = false;
      this.railPanels.people = false;
      this.railPanels.pm = false;
      if (this.buildCatalogId) this.onBuildPreview?.(null);
      this._emitVerb('demolish');
      return true;
    }
    if (key !== 'build' && key !== 'people' && key !== 'pm') return false;
    const opening = !this.railPanels[key];
    this.railPanels.build = false;
    this.railPanels.people = false;
    this.railPanels.pm = false;
    this.railPanels[key] = opening;
    if (!opening || key !== 'build' || this.tool === 'demolish') {
      this.buildCatalogId = null;
      this.onBuildPreview?.(null);
    }
    if (this.lastCity && this.lastState) {
      this._renderRail(this.lastCity, this.lastState);
      this._renderMobileStrip(this.lastCity, this.lastState);
    }
    return opening;
  }

  _showMobileToolPanel(key) {
    const city = this.lastCity;
    const state = this.lastState;
    if (!city || !state) return;
    const buildBody = () => buildRibbonHtml(city, state, {
      selectedId: this.selectedId,
      family: this.buildFamily,
      catalogId: this.buildCatalogId,
    });
    const label = key === 'build' ? 'Build' : key === 'people' ? 'People' : 'Property Management';
    const html = key === 'build'
      ? buildBody()
      : key === 'people'
        ? peoplePanelHtml(state)
        : propertyManagementPanelHtml(city, state);
    openModal(this.root, {
      label,
      html,
      onClick: (event, close) => {
        const family = event.target.closest('[data-build-family]');
        if (family && key === 'build') {
          this.buildFamily = family.dataset.buildFamily || 'residential';
          this.buildCatalogId = null;
          const paper = event.target.closest('.sheet__paper');
          if (paper) paper.innerHTML = buildBody();
          this.onBuildPreview?.(null);
          return;
        }
        const build = event.target.closest('[data-build-id]');
        if (build && key === 'build') {
          if (build.dataset.buildSelectable !== 'true') {
            if (build.dataset.reason) this.toast(build.dataset.reason, 'reject');
            return;
          }
          this.buildCatalogId = build.dataset.buildId || null;
          this.onBuildPreview?.(this.buildCatalogId);
          close();
          return;
        }
        const person = event.target.closest('[data-person-goto]');
        if (person?.dataset.personGoto) {
          close();
          this.onPersonGoto?.(person.dataset.personGoto);
          return;
        }
        const goto = event.target.closest('[data-goto]');
        if (goto?.dataset.goto) {
          close();
          this.onGoto?.(goto.dataset.goto);
        }
      },
    });
  }

  cycleLens() {
    const index = BOARD_LENSES.indexOf(this.activeLens);
    this.activeLens = BOARD_LENSES[(index + 1) % BOARD_LENSES.length];
    this._syncLensButton();
    window.dispatchEvent(new CustomEvent(BOARD_LENS_EVENT, {
      detail: { lens: this.activeLens },
    }));
    return this.activeLens;
  }

  _syncLensButton() {
    const button = this.cameraControls?.querySelector('[data-lens-cycle]')
      ?? this.root.querySelector('[data-lens-cycle]');
    if (!button) return;
    button.dataset.lens = this.activeLens;
    const label = button.querySelector('[data-lens-label]');
    if (label) label.textContent = lensLampLabel(this.activeLens);
    button.setAttribute('aria-label', `Board lens: ${this.activeLens}. Press V to cycle.`);
  }

  setBuildContext(parcelId) {
    const next = parcelId ? String(parcelId).toLowerCase() : null;
    if (next === this.buildContextId) return;
    this.buildContextId = next;
    if (this.railPanels.build && this.lastCity && this.lastState) {
      this._renderRail(this.lastCity, this.lastState);
    }
  }

  _renderLens() {
    const nav = this.cameraControls ?? this.root.querySelector('.camera-controls');
    if (!nav) return;
    this.cameraControls = nav;
    let button = nav.querySelector('[data-lens-cycle]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'lens-switch lens-switch--camera mat-steel';
      button.dataset.lensCycle = '';
      button.setAttribute('aria-keyshortcuts', 'V');
      button.addEventListener('click', () => this.cycleLens());
      nav.appendChild(button);
    }
    button.dataset.lens = this.activeLens;
    button.innerHTML = `
      <span class="chrome-key__well camera-key__well camera-key__well--lens">
        <svg class="camera-key__glyph camera-key__glyph--iris" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="9"></circle>
          <path d="M12 3l5.2 9M19.8 7.5H9.4M19.8 16.5l-5.2-9M12 21l-5.2-9M4.2 16.5h10.4M4.2 7.5l5.2 9"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
        <span class="camera-key__label"><span>LENS<span aria-hidden="true"> · </span></span><strong data-lens-label>${escapeHtml(lensLampLabel(this.activeLens))}</strong></span>
      </span>`;
    button.setAttribute('aria-label', `Board lens: ${this.activeLens}. Press V to cycle.`);
  }

  render(city, state, {
    selectedId = null,
    viewerSeatId = 'P1',
    tool = this.tool,
    catalogId = this.buildCatalogId,
  } = {}) {
    this.lastCity = city;
    this.lastState = state;
    this.lastViewerSeatId = viewerSeatId;
    syncCybercabPanel(this, city, state);
    // Selection single-thread: bar + rail always use the same parcel as the card.
    this.selectedId = selectedId ?? null;
    this.tool = tool ?? null;
    this.buildCatalogId = catalogId ?? null;
    if (!this.buildCatalogId) this.buildContextId = null;
    this._renderStatus(city, state);
    this._renderLens();
    this._renderRail(city, state);
    this._renderMobileStrip(city, state);
    this._renderActions(city, state, this.selectedId, viewerSeatId);
    this.onSurfaceChange();
  }

  _renderStatus(city, state) {
    const nav = navOf(city, state, 'player');
    const debt = debtOf(state, 'player');
    const stress = debtStressBp(city, state, 'player');
    const stressed = stress > RULES.debtStressBp;
    const credit = cashPosition(city, state, 'player');
    // A one-line settle preview that survives the phone layout — on mobile the full
    // "if you settle now" panel is hidden, and net income is the number that matters.
    const { net, auctionPending } = settlementPreview(city, state, 'player');
    const overdraftClass = credit.availableOverdraft === 0 || state.cash < 0 ? 'stat--warn' : '';
    const sites = Object.values(state.holdings ?? {})
      .filter((h) => h.owner === 'player' && h.construction);
    // Season + weather come from the seeded city weather stream now, so the
    // chip is truth, not a cosmetic wheel.
    const season = SEASON_LABEL[seasonForQuarter(Math.max(1, state.quarter))] ?? 'Autumn';
    const weather = weatherChipCopy(weatherOf(state));
    const selectedKey = this.selectedId ? String(this.selectedId).toLowerCase() : null;
    const selectedParcel = selectedKey ? activeParcel(city, state, selectedKey) : null;
    const ownedDistrict = Object.entries(state.holdings ?? {})
      .find(([, holding]) => holding.owner === 'player')?.[0];
    const ownedParcel = ownedDistrict ? activeParcel(city, state, ownedDistrict) : null;
    const districtName = selectedParcel?.districtName
      || ownedParcel?.districtName
      || city.districts?.[0]?.name
      || 'Melbourne';
    const railToast = this.statusbar.querySelector('.toast--rail');
    const fires = quarterFires(this.lastCity ?? city, this.lastState ?? state);
    const priorTicker = this._tickerLines.length;
    const merged = mergeTickerLines(this._tickerLines, this._tickerSeen, fires);
    this._tickerLines = [...merged.lines];
    this._tickerSeen = merged.seen instanceof Set ? merged.seen : new Set(merged.seen);
    const tickerTick = this._tickerLines.length > priorTicker;
    this.statusbar.innerHTML = `
      <div class="statusbar__deck">
      <span class="chrome-rivets" aria-hidden="true"></span>
      <div class="status-row status-row--run">
        <div class="stat stat--home stat--brand"><a href="./index.html">District Deck</a></div>
        <div class="stat stat--instrument stat--run-well stat--quarter stat--label-always">
          <span class="counter__plate"><span class="label counter__caption">QUARTER</span></span>
          <span class="counter__well value">Q${state.quarter}/${state.quarters}</span>
        </div>
        ${(() => {
          const inspected = inspectWorldRun(worldStoreGet(WORLD_RUN_KEY));
          const world = inspected.status === 'valid' ? inspected.world : null;
          const canon = quarterBeatCanon({
            cityQuarter: state.quarter,
            worldBeat: world?.beat ?? 0,
            lastLedgerQuarter: world?.ambition?.lastLedgerQuarter ?? null,
            lastLedgerAppliedBeat: world?.ambition?.lastLedgerAppliedBeat ?? null,
          });
          return `
        <div class="stat stat--instrument stat--run-well stat--qbeat ${canon.drift ? 'stat--qbeat-drift' : ''}"
             title="${escapeHtml(qbeatTitle(canon, Boolean(world)))}">
          <span class="counter__well value">${escapeHtml(canon.cityChip)}</span>
        </div>`;
        })()}
        <div class="stat stat--instrument stat--run-well stat--actions stat--label-always" title="Actions available this quarter. ${state.banked ? `${state.banked} banked for next quarter. ` : ''}Most verbs spend 1 action; Divest — no action. Settle closes the books.">
          <span class="counter__plate"><span class="label counter__caption">Actions</span></span>
          <span class="counter__well value">${state.actionsRemaining}<span class="value__dim">&nbsp;left</span></span>
        </div>
        ${sites.length ? `
          <div class="stat stat--instrument stat--run-well stat--label-always stat--works" title="Active works">
            <span class="counter__plate"><span class="label counter__caption">Works</span></span>
            <span class="counter__well value amber">${sites.length}</span>
          </div>` : ''}
        <div class="status-row status-row--merge" data-merge-rail aria-live="polite"></div>
      </div>
      <div class="status-row status-row--place" aria-label="District weather date">
        <div class="status-place">
          <span>${escapeHtml(String(districtName).split(/\s+/)[0])}</span>
          <span>${season} · ${weather}</span>
        </div>
      </div>
      <!-- COPY-DRAFT: define the city figures and their relation to Treasury. -->
      <div class="status-row status-row--money">
        <div class="stat stat--instrument stat--counter stat--readout stat--captioned stat--lead ${state.cash < 0 ? 'stat--warn' : ''}" title="Cash is the money available for city spending. ${escapeHtml(MONEY_KEY_CITY)}" data-exchange-plate="cash">
          <span class="counter__plate">
            ${chromeActionGlyph('hold')}
            <span class="counter__caption">Cash</span>
          </span>
          <span class="counter__well value value--flap ${state.cash < 0 ? 'loss' : 'amber'}">${money(state.cash)}</span>
        </div>
        <div class="stat stat--instrument stat--counter stat--readout stat--captioned stat--lead" title="NAV is net asset value, the value of city holdings and Cash after debt. ${escapeHtml(MONEY_KEY_CITY)}">
          <span class="counter__plate">
            ${chromeActionGlyph('nav')}
            <span class="counter__caption">NAV</span>
          </span>
          <span class="counter__well value value--flap">${money(nav)}</span>
        </div>
        <div class="stat stat--instrument stat--counter stat--captioned ${stressed ? 'stat--warn' : ''}" title="Debt">
          <span class="counter__plate">
            ${chromeActionGlyph('debt')}
            <span class="counter__caption">Debt</span>
          </span>
          <span class="counter__well value">${money(debt)}${stressed ? ' ⚠' : ''}</span>
        </div>
        <div class="stat stat--instrument stat--counter stat--readout stat--captioned ${overdraftClass}" title="Overdraft remaining">
          <span class="counter__plate">
            ${chromeActionGlyph('overdraft')}
            <span class="counter__caption">Od</span>
          </span>
          <span class="counter__well value">${money(credit.availableOverdraft)}</span>
        </div>
        <div class="stat stat--instrument stat--counter stat--captioned" title="${auctionPending ? 'Auction outcome is private until both plans resolve; quarter net is not yet known.' : 'Quarter net'}">
          <span class="counter__plate">
            ${chromeActionGlyph('settle')}
            <span class="counter__caption">Net</span>
          </span>
          <span class="counter__well value money ${auctionPending ? 'value__dim' : net >= 0 ? 'gain' : 'loss'}">${auctionPending ? 'Pending' : signedMoney(net)}</span>
        </div>
        <div class="statusbar__cassette" role="group" aria-label="Board intelligence">
          ${['world', 'forecast', 'macro', 'events', 'quarterly'].map((key) => `
            <button type="button" class="statusbar__cassette-key" data-status-view="${key}"${key === 'world' ? ' data-exchange-plate="tape"' : ''}>
              <span aria-hidden="true">${key === 'quarterly'
                ? '<img class="statusbar__cassette-seal" src="assets/img/ui-icons/stamp-quarter-seal.png" alt="">'
                : chromeActionGlyph(key)}</span>
              <span>${key === 'world'
                ? 'WORLD'
                : key === 'forecast'
                  ? 'Forecast'
                  : key === 'quarterly'
                    ? 'Quarterly'
                    : key[0].toUpperCase() + key.slice(1)}</span>
            </button>`).join('')}
        </div>
        <button type="button" data-help class="stat stat--help stat__help-btn" title="How to play" aria-label="How to play"><span class="camera-key__well camera-key__well--help" aria-hidden="true"><svg class="camera-key__glyph camera-key__glyph--help" viewBox="0 0 24 24" focusable="false"><path d="M1.5 3.25c3.75-.9 7.15-.25 10.5 2.05v16.2c-3.35-2.3-6.75-2.95-10.5-2.05V3.25Zm21 0c-3.75-.9-7.15-.25-10.5 2.05v16.2c3.35-2.3 6.75-2.95 10.5-2.05V3.25Z"></path></svg></span></button>
      </div>
      </div>
      ${tickerStripHtml(this._tickerLines)}
      ${avatarTokenStrip(state)}
      <div class="board-legend" aria-label="Board ownership legend">
        <span class="board-legend__item board-legend__item--you"><i></i>Yours</span>
        <span class="board-legend__item board-legend__item--ai"><i></i>Petridis</span>
        <span class="board-legend__item board-legend__item--auction"><i></i>Auction</span>
      </div>
    `;
    const mergeRail = this.statusbar.querySelector('[data-merge-rail]');
    if (railToast && mergeRail) mergeRail.appendChild(railToast);
    this.statusbar.querySelector('[data-help]')?.addEventListener('click', () => this.onHelp?.());
    this.statusbar.querySelectorAll('[data-status-view]').forEach((button) => {
      button.addEventListener('click', () => this._showStatusView(button.dataset.statusView));
    });
    this.statusbar.querySelectorAll('[data-goto]').forEach((button) => {
      button.addEventListener('click', (event) => {
        const id = event.currentTarget?.dataset?.goto;
        if (id) this.onGoto?.(id);
      });
    });
    if (tickerTick && !tickerReducedMotion()) {
      this.statusbar.querySelector('[data-ticker] .ticker-stack')
        ?.classList.add('ticker-stack--tick');
    }
    this._tickFlaps(state.cash, nav);
  }

  _showStatusView(key) {
    if (key === 'world') {
      window.__districtDeck?.openWorld();
      return;
    }
    if (key === 'quarterly') {
      window.__districtDeckBulletin?.reopen?.();
      return;
    }
    if (key === 'aido') return;
    const city = this.lastCity;
    const state = this.lastState;
    if (!city || !state) return;
    const label = key === 'forecast' ? 'Forecast' : key === 'macro' ? 'Macro' : 'Events';
    let html = '';
    if (key === 'forecast') {
      const forecast = forecastFor(city, state.quarter) ?? {};
      const rates = forecastRates(state, state.quarter);
      html = `
        <h2>Market forecast</h2>
        <div class="status-view__rows">
          ${rowHtml('Inflation', `${statusSignedPctHtml(rates.inflationForecastBp)} ${statusDatumHtml('now')} · ${statusSignedPctHtml(rates.nextInflationForecastBp)} ${statusDatumHtml('next')}`)}
          ${rowHtml('Interest', `${statusDatumHtml(pct(rates.interestForecastBp))} ${statusDatumHtml('now')} · ${statusDatumHtml(pct(rates.nextInterestForecastBp))} ${statusDatumHtml('next')}`)}
          ${SECTOR_IDS.map((sector) => rowHtml(SECTORS[sector].label, statusSignedPctHtml(forecast[sector] ?? 0))).join('')}
          <div class="status-view__subhead">District drift · next quarter</div>
          ${[...city.districts].sort((a, b) => a.id.localeCompare(b.id)).map((district) => {
            const plan = city.districtDriftPlan[district.id];
            const index = state.districtIndexBp?.[district.id] ?? 10000;
            return `<div data-district-market="${district.id}">${rowHtml(district.name, `${statusSignedPctHtml(plan.forecastBp)} · ${statusDatumHtml(`${(index / 10000).toFixed(4)}×`, 'status-view__index')}`)}</div>`;
          }).join('')}
        </div>`;
    } else if (key === 'macro') {
      const nextMacro = nextMacroForecastModel(city, state);
      html = `
        <h2>${escapeHtml(nextMacro.headline)}</h2>
        ${nextMacro.detail ? `<p>${escapeHtml(nextMacro.detail)}</p>` : ''}
        ${nextMacro.exact ? `<p>${escapeHtml(nextMacro.exact)}</p>` : ''}`;
    } else {
      const activeEvents = [...(state.events?.order ?? [])].sort()
        .map((id) => state.events.byId[id])
        .filter((event) => event.resolveQuarter === state.quarter
          && event.status !== 'resolved' && event.status !== 'cancelled');
      const groups = groupActiveEvents(activeEvents);
      const unlocked = (
        state.avatars?.player?.accessTokens?.eventForecastUntilQuarter ?? 0
      ) >= state.quarter;
      html = `
        <h2>Quarter events</h2>
        ${groups.length
          ? `${unlocked ? '' : `<p>${escapeHtml(EVENT_LOCKED_BODY)}</p>`}${groups.map((group) => eventsGroupHtml(
            city, state, group, unlocked, group.id,
          )).join('')}`
          : `<p>${EVENT_EMPTY_BODY}</p>`}`;
    }
    openModal(this.root, {
      label,
      html,
      onClick: (event, close) => {
        const goto = event.target.closest('[data-goto]');
        if (!goto?.dataset.goto) return;
        close();
        this.onGoto?.(goto.dataset.goto);
      },
    });
  }

  _showAidoPm() {
    const city = this.lastCity;
    const state = this.lastState;
    if (!city || !state) return;
    const stance = this.aidoStance ?? null;
    openModal(this.root, {
      label: 'AIDO',
      html: aidoPmPanelHtml(city, state, stance),
      footer: '<button type="button" class="verb verb--primary" data-aido-confirm>Confirm</button>'
        + '<button type="button" class="verb" data-close data-aido-cancel>Cancel</button>',
      onClick: (event, close) => {
        const picked = event.target.closest('[data-aido-stance]');
        if (picked?.dataset.aidoStance) {
          this.aidoStance = picked.dataset.aidoStance;
          close();
          this._showAidoPm();
          return;
        }
        if (!event.target.closest('[data-aido-confirm]')) return;
        // Confirm without a stance is not a silent close: Aido asks for the stance
        // and the panel stays (V3.40 critic F3).
        if (!this.aidoStance) {
          this.toast('Pick a stance for this quarter.', 'reject');
          return;
        }
        const plan = deriveAidoPlan(city, this.lastState ?? state, this.aidoStance);
        for (const line of plan.lines) {
          const live = this.lastState ?? state;
          const probe = canApplyAction(city, live, line.action);
          if (!probe.ok) {
            const stopped = /no actions left this quarter/i.test(probe.reason)
              ? AIDO_ACTIONS_EXHAUSTED
              : probe.reason;
            this.toast(stopped, 'reject');
            break;
          }
          if (line.kind === 'lease') this._emitVerb(`lease:${line.tenantQuality}`, line.parcelId);
          else this._emitVerb(line.action.type, line.parcelId);
        }
        close();
      },
    });
  }

  _syncRailScrollAffordance() {
    const scroller = this.rail?.querySelector('.rail__scroll--tool > .panel--tool > .body')
      ?? this.rail?.querySelector('.rail__scroll');
    this.rail?.classList.toggle(
      'has-scroll-affordance',
      Boolean(scroller && scroller.scrollHeight > scroller.clientHeight),
    );
  }

  _tickFlaps(cash, nav) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this._prevCash = cash;
      this._prevNav = nav;
      return;
    }
    const flaps = this.statusbar.querySelectorAll('.value--flap');
    const changed = (this._prevCash !== null && cash !== this._prevCash)
                 || (this._prevNav !== null && nav !== this._prevNav);
    if (changed) {
      for (const el of flaps) {
        el.classList.add('is-ticking');
        el.addEventListener('animationend', () => el.classList.remove('is-ticking'), { once: true });
      }
      if (this._prevCash !== null && cash !== this._prevCash) {
        const cashFlap = flaps[0];
        if (cashFlap) {
          const cls = cash > this._prevCash ? 'is-gain' : 'is-loss';
          cashFlap.classList.add(cls);
          setTimeout(() => cashFlap.classList.remove(cls), 600);
        }
      }
    }
    this._prevCash = cash;
    this._prevNav = nav;
  }

  _renderRail(city, state) {
    // Only retain an existing directory interaction; never focus a row on first open.
    const oldPeopleBody = this.rail.querySelector('[data-rail-panel="people"] > .body');
    const peopleScrollTop = oldPeopleBody?.scrollTop ?? 0;
    const focusedPerson = oldPeopleBody?.contains(this.rail.ownerDocument.activeElement)
      ? this.rail.ownerDocument.activeElement.closest('[data-person-goto]')?.dataset.personGoto : null;
    // A BUILD row the keyboard is on keeps the focus when this redraw replaces it (Enter on a row redraws the rail). A row a mouse
    // or touch press focused shows no ring (:focus-visible) and is let go, so pointer use never leaves focus parked in the rail.
    const activeBuildRow = this.rail.ownerDocument?.activeElement?.closest?.('[data-build-id]');
    const focusedBuildId = activeBuildRow && this.rail.contains(activeBuildRow) && activeBuildRow.matches(':focus-visible')
      ? activeBuildRow.dataset.buildId : null;
    const policy = RIVAL_POLICIES.find((row) => row.id === state.rival.policyId);
    const playerNav = navOf(city, state, 'player');
    const rivalNav = navOf(city, state, 'rival');
    const gap = playerNav - rivalNav;
    const targetIds = disclosedRivalTargets(state);
    const activeEvents = [...(state.events?.order ?? [])].sort()
      .map((id) => state.events.byId[id])
      .filter((event) => event.resolveQuarter === state.quarter
        && event.status !== 'resolved' && event.status !== 'cancelled');
    const auction = activeEvents.find(({ type }) => type === 'auction') ?? null;
    const auctionModel = auctionRailModel(city, state, auction);
    const castCount = state.people?.order?.length ?? 0;
    const holdingCount = heldBy(state, 'player').length;
    const pairNext = pairNextBuildCount(city, state);
    const buildSummary = buildRibbonSummary({
      city,
      state,
      selectedId: this.buildContextId ?? this.selectedId,
      family: this.buildFamily,
      catalogId: this.buildCatalogId,
    });
    const header = (label, summary, glyph) => `
      <header>
        ${chromeActionGlyph(glyph)}
        <span class="label">${escapeHtml(label)}</span>
        <span class="rail-tab__summary"><span class="rail-tab__summary-text">${escapeHtml(summary)}</span></span>
      </header>`;
    // A body may be a thunk: the BUILD ribbon prices every legal row, so it waits for the open panel.
    const toolPanel = (key, label, summary, glyph, body) => (
      this.railPanels[key]
        ? `<section class="panel panel--instrument panel--tool is-open" data-rail-panel="${key}">
            ${header(label, summary, glyph)}
            <div class="body">${typeof body === 'function' ? body() : body}</div>
          </section>`
        : ''
    );
    const activeRailPanel = ['build', 'people', 'pm']
      .find((key) => this.railPanels[key]) ?? null;
    const totalNav = playerNav + rivalNav;
    const playerShare = totalNav > 0 ? (playerNav / totalNav * 100).toFixed(1) : 50;
    const rivalShare = totalNav > 0 ? (rivalNav / totalNav * 100).toFixed(1) : 50;
    this.rail.innerHTML = `
      <span class="chrome-rivets" aria-hidden="true"></span>
      <div class="rail__pin">
        ${railToolsHtml(state, { tool: this.tool, panels: this.railPanels })}
        <section class="panel panel--instrument panel--rival is-open" data-rail-panel="rival"
          data-lead-side="${gap === 0 ? 'tie' : gap > 0 ? 'player' : 'rival'}" data-lead-gap="${money(Math.abs(gap))}">
          ${header('Petridis', rivalLeadSummary(gap), 'lobby')}
          <div class="body">
            <div class="rival-dossier">
              <div class="rival-header">
                <span class="rival-portrait-frame">
                  <img class="rival-portrait" src="assets/img/people/rival-developer-portrait.png"
                       alt="Roman Petridis" loading="lazy" onerror="this.style.display='none'">
                </span>
                <div class="rival-header__info">
                  <span class="rival-header__name">Roman Petridis</span>
                  <span class="rival-header__policy">${escapeHtml(policy?.name ?? 'Value')} persona</span>
                </div>
              </div>
              ${targetIds.length ? `
                <div class="rival-next" aria-label="Petridis next moves">
                  <span class="label">Petridis's targets</span>
                  <ol class="rival-next__list">
                    ${targetIds.map((id, index) => `
                      <li class="rival-next__target">
                        <button type="button" class="tag tag--rival tag--rival-pin"
                                data-order="${index + 1}" data-goto="${escapeHtml(id)}">${escapeHtml(id.toUpperCase())}</button>
                      </li>`).join('')}
                  </ol>
                </div>` : '<p class="intent-text intent-text--empty">No parcel targets disclosed.</p>'}
              <div class="rival-nav" aria-label="Petridis NAV">
                <div class="nav-bar" style="--nav-player:${playerShare}fr;--nav-rival:${rivalShare}fr"
                     title="NAV: You ${money(playerNav)} vs Petridis ${money(rivalNav)}">
                  <div class="nav-bar__player" aria-hidden="true"></div>
                  <div class="nav-bar__rival" aria-hidden="true"></div>
                  <span class="nav-bar__readout value value--flap">${money(rivalNav)}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
      <div class="rail__scroll${activeRailPanel ? ' rail__scroll--tool' : ''}">
        ${toolPanel('build', 'Build', buildSummary, 'build', () => buildRibbonHtml(city, state, {
          selectedId: this.buildContextId ?? this.selectedId,
          family: this.buildFamily,
          catalogId: this.buildCatalogId,
        }))}
        ${toolPanel('people', 'People', `${castCount} on board`, 'people', peoplePanelHtml(state))}
        ${toolPanel('pm', 'Your holdings', `${holdingCount} holding${holdingCount === 1 ? '' : 's'}`, 'pm', propertyManagementPanelHtml(city, state))}
        ${activeRailPanel ? '' : `<section class="panel panel--instrument panel--pairs${this.pairsExpanded ? ' is-open' : ''}" data-rail-panel="pairs">
          <button type="button" class="v4-districts-toggle" data-districts-toggle aria-expanded="${this.pairsExpanded}" aria-controls="districts-roster">
            ${chromeActionGlyph('merge')}<span>Districts</span><span class="v4-districts-count">${pairNext} next builds</span><span aria-hidden="true">${this.pairsExpanded ? '−' : '+'}</span>
          </button>
          <div id="districts-roster" class="body pairs-body" data-pairs-roster ${this.pairsExpanded ? '' : 'hidden'}>${pairsRailHtml(city, state, this.selectedId)}</div>
        </section>`}
        ${activeRailPanel ? '' : auctionRailHtml(auctionModel)}
      </div>`;
    const peopleBody = this.rail.querySelector('[data-rail-panel="people"] > .body');
    if (peopleBody && oldPeopleBody) {
      if (focusedPerson) {
        const personButton = [...peopleBody.querySelectorAll('[data-person-goto]')]
          .find(button => button.dataset.personGoto === focusedPerson);
        (personButton ?? this.rail.querySelector('[data-rail-tool="people"]'))?.focus({ preventScroll: true });
      }
      peopleBody.scrollTop = peopleScrollTop;
    }
    if (focusedBuildId) {
      [...this.rail.querySelectorAll('[data-build-id]')]
        .find((row) => row.dataset.buildId === focusedBuildId)?.focus({ preventScroll: true });
    }
    this._syncRailScrollAffordance();
    this.onSurfaceChange();
  }

  _renderMobileStrip(city, state) {
    if (!this.mobileStrip) return;
    const events = [...(state.events?.order ?? [])].sort()
      .map((id) => state.events.byId[id])
      .filter((event) =>
        event.resolveQuarter === state.quarter
        && event.status !== 'resolved'
        && event.status !== 'cancelled');
    const rival = disclosedRivalTargets(state);
    const openDrawers = new Set([...this.mobileStrip.querySelectorAll('details[open]')]
      .map((drawer) => drawer.dataset.mobileDrawer));
    const drawer = (key, label, content) => `<details class="v4-mobile-drawer" data-mobile-drawer="${key}" ${openDrawers.has(key) ? 'open' : ''}>
      <summary>${label}</summary><div class="v4-mobile-drawer__body">${content}</div>
    </details>`;
    const tool = (key, label) => {
      const selected = key === 'demolish' ? this.tool === 'demolish' : Boolean(this.railPanels[key]);
      return `<button type="button" class="mobile-cycle-chip mobile-cycle-chip--tool${selected ? ' is-selected' : ''}"
        data-mobile-rail-tool="${key}" aria-pressed="${selected}">${label}</button>`;
    };
    this.mobileStrip.innerHTML = `
      <button type="button" class="mobile-cycle-chip" data-help aria-label="How to play">Help</button>
      ${tool('build', 'Build')}
      <button type="button" data-exchange-plate="tape" class="mobile-cycle-chip" data-status-view="world">WORLD</button>
      <button type="button" class="mobile-cycle-chip" data-status-view="events">Events · ${events.length}</button>
      ${drawer('targets', `Petridis · ${rival.length}`, `<p>Petridis's targets</p>${rival.length
        ? rival.map((id, index) => `<button type="button" class="mobile-cycle-chip mobile-cycle-chip--rival" data-goto="${escapeHtml(id)}">${index + 1}. ${escapeHtml(id.toUpperCase())}</button>`).join('')
        : '<p>No targets disclosed this quarter.</p>'}`)}
      ${drawer('manage', 'Manage', RAIL_TOOL_ROWS.filter(([key]) => key !== 'build').map(([key, label]) => tool(key, label)).join(''))}
      ${drawer('reports', 'Reports', ['forecast', 'macro', 'quarterly'].map((key) => `<button type="button" class="mobile-cycle-chip" data-status-view="${key}">${key === 'quarterly' ? 'Quarterly briefing' : key === 'forecast' ? 'Cash forecast' : 'Market outlook'}</button>`).join(''))}
    `;
  }

  /**
   * The action bar is driven by the SAME legality helpers as the card. A button that
   * looks pressable and then answers with a rejection toast is a lie the player pays
   * for with a click. Every enabled verb surfaces cost / cash-after / risk before commit.
   */
  _renderActions(city, state, selectedId, viewerSeatId = 'P1') {
    // Bottom ribbon: Settle only. Property verbs live on the card — duplicating them
    // here made the bar compete with the card and buried the critical end-of-quarter action.
    const settleState = settleButtonState(city, state);
    void selectedId;
    void viewerSeatId;
    const playable = state.phase === 'play';
    const left = state.actionsRemaining;
    const spent = left <= 0;
    const finalQuarter = isFinalCampaignQuarter(state);
    const canBank = playable && !spent && state.banked < RULES.maxBankedActions;
    const bank = {
      ok: canBank,
      reason: !playable
        ? 'The run is over.'
        : spent
          ? 'No action left this quarter.'
          : 'An action is already banked.',
    };
    // A forced sale at this settle replaces the count on the visible line above Settle (the phone bar shows settleState.hint).
    const turnHint = settleState.note ?? (playable
      ? (finalQuarter ? `Q${campaignHorizon(state)} · final books` : `${left} left`)
      : 'Run over');
    const cameraControls = this.cameraControls ?? this.root.querySelector('.camera-controls');

    // Floating settle FAB — no full-width ribbon (board keeps bottom real estate).
    this.actionbar.className = 'actionbar actionbar--fab';
    this.actionbar.innerHTML = `
      <div class="settle-fab" role="group" aria-label="End quarter">
        <span class="settle-fab__meta" role="status" aria-live="polite">
          <strong>Settle</strong>
          <span aria-hidden="true">·</span>
          <span>${escapeHtml(turnHint)}</span>
        </span>
        <div class="settle-fab__deck">
          <span data-camera-bay aria-hidden="true"></span>
          <div class="settle-fab__buttons">
            ${state.phase === 'result'
              // COPY-DRAFT: reopen the result sheet from the finished board.
              ? actionButton('new-run', 'New run', '', { ok: true }, {
                className: 'verb--ghost verb--fab-bank',
                available: 'Replay this seed or start a New District.',
                showKey: false,
              })
              : actionButton('hold', 'Bank', '5', bank, {
              className: 'verb--ghost verb--fab-bank',
              available: 'Spend 1 · +1 next Q',
              hint: canBank ? '+1 next Q' : 'Full',
              blockedHint: state.banked > 0 ? `${state.banked} next Q` : '',
              showKey: false,
              glyph: chromeActionGlyph('hold'),
            })}
            ${actionButton('settle', 'Settle', '', {
              ok: playable,
              reason: 'Run over',
            }, {
              className: 'verb--settle verb--fab-settle',
              available: settleState.note ?? (finalQuarter
                ? (left > 0 ? `${left} unspent · run settles for good` : 'Run settles for good')
                : (left > 0 ? `${left} unspent lost` : 'Book rent · next Q')),
              glyph: chromeActionGlyph('settle'),
            })}
          </div>
        </div>
        ${cityMoneyKeyHtml()}
      </div>
    `;
    const cameraBay = this.actionbar.querySelector('[data-camera-bay]');
    if (cameraControls && cameraBay) cameraBay.replaceWith(cameraControls);
    else cameraBay?.remove();
    const settleButton = this.actionbar.querySelector('[data-verb="settle"]');
    if (settleButton) {
      settleButton.dataset.settleQuiet = settleState.quiet ? '1' : '0';
      // hud-phone.js rebuildBar reads these for the phone bar's second line and its aria-label; sheet-phone.js for the card's proxy.
      if (settleState.note) {
        settleButton.dataset.settleNote = settleState.note;
        settleButton.dataset.settleHint = settleState.hint;
      }
      // Every redraw makes a new button: an armed Settle must still read Confirm while Game.settleArmed holds.
      this._showSettleArmed(settleButton);
    }
  }

  /** Game.trySettle arms Settle on its first press and disarms it; the Hud keeps the flag so a redraw keeps the armed view. */
  markSettleArmed(on) {
    this._settleArmed = Boolean(on);
    this._showSettleArmed(this.actionbar?.querySelector('[data-verb="settle"]'));
  }

  _showSettleArmed(settleButton) {
    if (!settleButton) return;
    const on = this._settleArmed === true;
    if (on) settleButton.dataset.settleArmed = '1';
    else delete settleButton.dataset.settleArmed;
    const text = on ? 'Confirm' : 'Settle';
    const label = settleButton.querySelector('.verb__label, .ph-btn__label');
    if (label && label.textContent !== text) label.textContent = text;
    // The phone bar names its buttons in aria-label (hud-phone.js rebuildBar, "Settle, <consequence>"); the first word follows the label.
    const name = settleButton.getAttribute('aria-label');
    if (name && /^(?:Settle|Confirm)\b/.test(name)) {
      const next = name.replace(/^(?:Settle|Confirm)\b/, text);
      if (next !== name) settleButton.setAttribute('aria-label', next);
    }
  }

  // Furniture identity is a single transient hint, never a campaign docket.
  propHint(name, result) {
    clearTimeout(this._propHintTimer);
    const version = this._propHintVersion = (this._propHintVersion ?? 0) + 1;
    let element = this._propHint;
    if (!element?.isConnected) {
      element = document.createElement('div');
      element.className = 'prop-hint';
      element.setAttribute('role', 'status');
      element.setAttribute('aria-live', 'polite');
      element.setAttribute('aria-atomic', 'true');
      this.root.appendChild(element);
      this._propHint = element;
    }
    const rejected = result?.accepted === false;
    element.textContent = rejected ? `${name} · Unavailable right now` : String(name);
    element.dataset.rejected = String(rejected);
    this._propHintTimer = setTimeout(() => {
      if (this._propHint !== element || this._propHintVersion !== version) return;
      element.remove();
      this._propHint = null;
      this._propHintTimer = null;
    }, 2400);
  }

  // Re-seat existing notices as well as new ones when a card opens or changes size.
  placeToasts() {
    const cardRect = this.getToastCardRect?.() ?? null;
    const loose = [...this.toasts.children].filter((node) => !node.dataset?.held);
    const cap = cardRect ? TOAST_CAP_WITH_CARD : 4;
    while (loose.length > cap) loose.shift().remove();
    if (!cardRect) {
      if (!this.toasts.dataset?.cardAnchor) return;
      delete this.toasts.dataset.cardAnchor;
      for (const prop of ['position', 'left', 'right', 'top', 'bottom', 'width', 'maxWidth', 'maxHeight', 'minWidth', 'minHeight', 'overflow']) {
        this.toasts.style[prop] = '';
      }
      return;
    }
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const status = this.root.querySelector('[data-phone="plate"]') ?? this.statusbar;
    const fab = this.root.querySelector('[data-phone="bar"]') ?? this.root.querySelector('.actionbar--fab');
    const statusRect = status?.getBoundingClientRect();
    const fabRect = fab?.getBoundingClientRect();
    const anchor = toastAnchor({
      viewport, cardRect,
      statusBottom: statusRect?.bottom ?? 0,
      fabTop: fabRect?.height === 0 ? viewport.height : (fabRect?.top ?? viewport.height),
    });
    this.toasts.dataset.cardAnchor = '1';
    Object.assign(this.toasts.style, {
      position: 'fixed', left: `${anchor.left}px`, right: 'auto', top: `${anchor.top}px`, bottom: 'auto',
      width: `${anchor.width}px`, maxWidth: `${anchor.width}px`, maxHeight: `${anchor.maxHeight}px`,
      minWidth: '0', minHeight: '0', overflow: 'hidden',
    });
  }

  toast(message, kind = '', { held = false } = {}) {
    if (/^Unknown action\b/i.test(String(message ?? ''))) {
      message = 'That move is not available.';
      kind = kind || 'reject';
    }
    let presented = message;
    const permit = /^Permit approved for ([A-Z0-9]+)\b/.exec(message);
    if (permit && this.lastCity && this.lastState) {
      const parcelId = permit[1].toLowerCase();
      const quote = planningUnlockQuote(this.lastCity, this.lastState, parcelId);
      if (quote) {
        presented = `Ceiling rises to L${quote.nextLevel} and unlocks ${archetypeRungLabel(quote.toArchetype)} — ${moneyExact(permitFeeForRung(quote.nextLevel))} fee · 1 action.`;
      }
    }
    const disposal = /^(?:Divested|Surrendered) ([A-Z0-9]+)\b/.exec(message);
    if (disposal && this.lastCity && this.lastState) {
      const parcelId = disposal[1].toLowerCase();
      const quote = this.lastState.holdings?.[parcelId]
        ? divestQuote(this.lastCity, this.lastState, parcelId)
        : null;
      if (quote) {
        presented = quote.surrender
          ? `Surrender ${disposal[1]} and clear ${moneyExact(quote.debtCleared)} debt — no action. Nothing returns; shortfall ${moneyExact(quote.shortfall)}.`
          : `Divest ${disposal[1]} and clear debt — no action. Net ${moneyExact(quote.proceeds)} after ${moneyExact(quote.fee)} fee and ${moneyExact(quote.debtCleared)} debt.`;
      }
    }
    const element = document.createElement('div');
    element.className = `toast toast--docket ${kind ? `toast--${kind}` : ''}`;
    presented = String(presented)
      .replace(/\b1 act left\b/gi, '1 action left')
      .replace(/\b(\d+) act left\b/gi, '$1 actions left')
      .replace(/\s*--\s*/g, ' — ');
    if (
      (/divest|sold|surrender|^gone\b|\s·\snet\s/i.test(presented) || /\s·\sP\d{3,}\s·\snet\s/i.test(presented))
      && !/^(?:sold|divest)/i.test(presented)
    ) {
      presented = `Divested · ${presented}`;
    }
    const docket = formatToastDocket(presented);
    const mergeRail = /→\s*A\d{3,}|amalgam|bolted|1×2|1x2|subdivid|unbolted/i.test(presented)
      || /\bP\d{4}\s*\+\s*P\d{4}\b/.test(presented);
    if (mergeRail) {
      element.classList.add('toast--rail');
      element.innerHTML = `
        <span class="toast__rivet" aria-hidden="true"><i></i></span>
        <span class="toast__body">${escapeHtml(docket)}</span>
        <span class="toast__rivet" aria-hidden="true"><i></i></span>`;
      this.statusbar?.querySelectorAll('.toast--rail').forEach((node) => node.remove());
      const mergeRail = this.statusbar?.querySelector('[data-merge-rail]');
      (mergeRail || this.statusbar || this.toasts).appendChild(element);
    } else {
      const stamp = /sold|divest|surrender/i.test(presented)
        ? 'stamp-sold-r8'
        : /under offer|auction|bid/i.test(presented)
          ? 'stamp-under-offer'
          : /permit|approv|lobby|height pass/i.test(presented)
            ? 'stamp-approved'
            : /overdue|arrears/i.test(presented)
              ? 'stamp-overdue'
              : /condemn|damage|fire/i.test(presented)
                ? 'stamp-condemned'
                : /reject|cannot|can't|unable/i.test(presented) || kind === 'reject'
                  ? 'stamp-rejected'
                  : kind === 'good'
                    ? 'stamp-approved'
                    : 'stamp-paid';
      const stampKind = stamp.replace(/^stamp-/, '').replace(/-ink$/, '').replace(/-r8$/, '');
      element.innerHTML = `
        <span class="toast__stamp" style="background-image:url('assets/img/ui-icons/${stamp}.png')" data-stamp="${stampKind}" aria-hidden="true"></span>
        <span class="toast__body">${escapeHtml(docket)}</span>`;
      this.toasts.appendChild(element);
    }
    // A held toast (SettleNotices in forced-sale-notice.js) leaves on its owner's clock, which runs only while the board is clear.
    if (held) {
      element.dataset.held = '1';
    } else {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setTimeout(() => {
        if (reducedMotion || document.hidden) {
          element.remove();
          return;
        }
        element.style.transition = 'opacity 140ms ease';
        element.style.opacity = '0';
        setTimeout(() => element.remove(), 160);
      }, document.hidden ? 12000 : (kind === 'reject' ? 2600 : 3200));
    }
    // Held notices keep their owner's clock and never count towards the loose cap.
    this.placeToasts();
    return element;
  }

  /** Settlement summary — every audible cue has this visible equivalent. */
  settleToast(event) {
    const moves = Object.entries(event.moves)
      .map(([sector, m]) => `${SECTORS[sector].label} ${signedPct(m.realisedBp)}`)
      .slice(0, 1)
      .join(' · ');
    this.toast(`Q${event.quarter} settled · net ${signedMoney(event.lines.net)} · ${moves || 'markets flat'}`, 'good');
    if (event.rivalMove?.text) {
      const move = String(event.rivalMove.text)
        .replace(/^Rival\b[:\s-]*/i, '')
        .replace(/\bsettlement\b/gi, 'settle')
        .replace(/\.\s*$/, '');
      this.toast(`Petridis · ${move}`);
    }
  }

  showResult(city, state, overlayHost) {
    const result = runResult(city, state);
    const won = result.playerNav > result.rivalNav;
    return openModal(overlayHost, {
      label: settlementDayHeadline(state),
      html: `
        <!-- COPY-DRAFT: show the actual ending quarter and the full horizon. -->
        <span class="label">Seed ${escapeHtml(state.seed)} · Q${state.quarter} of ${campaignHorizon(state)}</span>
        <h2>${settlementDayHeadline(state)}</h2>
        <p class="card__owner-banner" role="status">${won ? 'You out-built Petridis' : 'Petridis out-built you'}</p>
        <div class="grade">
          <span class="grade__letter">${result.grade}</span>
          <div>
            <div style="font-size:17px;font-weight:700">${result.gradeLabel}</div>
            <div class="label">NAV ratio ${result.ratio.toFixed(2)}×</div>
          </div>
        </div>
        <div class="row"><span class="label">Your NAV</span><span class="value amber">${moneyExact(result.playerNav)}</span></div>
        <div class="row"><span class="label">Petridis NAV</span><span class="value rival-tint">${moneyExact(result.rivalNav)}</span></div>
        <div class="row"><span class="label">Growth on opening capital</span><span class="value ${result.growthBp >= 0 ? 'gain' : 'loss'}">${signedPct(result.growthBp)}</span></div>
        <div class="row"><span class="label">Parcels held</span><span class="value">${result.parcels}</span></div>
        <div class="row"><span class="label">Corridor links</span><span class="value">${result.corridorLinks}</span></div>
        <div class="row"><span class="label">Renovated holdings</span><span class="value">${result.renovated}</span></div>
        <div class="row"><span class="label">Rebuilt holdings</span><span class="value">${result.redeveloped}</span></div>
        <div style="display:flex;gap:10px;margin-top:22px">
          <button class="verb verb--settle" data-restart="same" data-autofocus>Replay this seed</button>
          <!-- COPY-DRAFT: use the New District entry name. -->
          <button class="verb" data-restart="new">New District</button>
          <a class="verb" href="./index.html" style="text-decoration:none">Home</a>
        </div>
      `,
      onClick: (event, close) => {
        const button = event.target.closest('[data-restart]');
        if (!button) return;
        close();
        this.onRestart?.(button.dataset.restart);
      },
    });
  }
}
