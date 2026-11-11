import { acquisitionDisclosure, foodWalkDisclosure, walkCommitDisclosure, roomCommitCopy, roomPreviewCaption, roomWorkHistory, roomConditionConsequence } from './clarity.js';
import { planningZoneTitle, ceilingTitle } from './copy-labels.js';
import { canRaiseForce } from '../core/world/forces.js';
import { acquireFundingExplanation } from './acquire-funding.js';
// District Deck V3.00 — the pop-up property card.
// Framework §6.5 note: this is the most-used surface in the game. It shows the real
// runtime model, the stats, and the SAME explanation string the valuation was built
// from, so the card and the ledger can never disagree.

import {
  ARCHETYPES, PROCESS_KIT, RULES, SECTORS, SECTOR_IDS,
  RESERVE_CATALOG, SURVEY_DEFECT_TIERS, favourLobbyBonusBp, favourCostScaleBp,
} from '../core/content.js';
import { comboStateFor, readWorldDrawAck, standingProcessForm } from '../core/process-runs.js';
import { fireDamageForFacility } from '../core/world/disasters.js';
import { liveFacilityDamage } from '../core/world/threats.js';
import {
  FACILITY_REPAIR_COST,
} from '../core/world/catalog.js';
import { inspectWorldRun, worldStore } from '../core/world/envelope.js';
import { facilityStagePanelHtml } from './worktree-panel.js';
import { globalTile, parseParcelId } from '../core/grid.js';
import {
  CIVIC_BY_ID, EMITTER_LABELS, INFLUENCE_CURVES, PAIR_SYNERGIES, nearestTileDistance,
} from '../core/landuse.js';
import {
  marketValue, rentFor, corridorBp, corridorLinks, levelOf, conditionOf, viewerOwner,
  archetypeIdOf, sectorOf,
  acquireQuote, renovateQuote, redevelopQuote, changeUseQuote, redevelopmentExitQuote, divestQuote,
  consolidateQuote, subdivideQuote,
  canAcquire, canRenovate, canRenovateRoom, canRedevelop, canDivest, yieldBp, corridorIfAcquired,
  parcelSurveyComplete as coreParcelSurveyComplete,
  isFreeFollowUpAcquire,
  roomRenovateQuote,
  settlementPreview, constructionStage, activeHires,
  commercialAnchorValuation,
} from '../core/economy.js';
import {
  ROOM_IDS, FINISH_LEVELS, ensureRoomState, roomDefectPct, suburbBand, suburbBandLabel,
  roomJobs,
  pendingRoomJob,
} from '../core/renovation-rooms.js';
import {
  maxPermitLevelFor, permitOptionsFor, PERMIT_LABELS, PERMIT_FINISH_ARCHETYPE,
  permitFeeForRung, redevelopFinishArchetype, usePermitOptionsFor,
  SHOP_CHANGE_USE_IDS, SHOP_CORNER_USE_ARCHETYPES, USE_PERMITS,
  grantUsePermit, shopUsePermitIdForHolding,
} from '../core/planning-permits.js';
import { CONSTRUCTION_STAGES } from '../core/construction-stages.js';
import {
  activeAdjacency, activeEventExposure, activeOrder, activeParcel,
  resolveCurrentParcelId,
  surveyedPaddocks,
} from '../core/city.js';
import { canApplyAction, farmFieldState } from '../core/state.js';
import { farmActionCheck } from '../core/site-works.js';
import { farmBuildRibbonHtml } from './build-ribbon.js';
import { stateForActiveSeat } from './hotseat.js';
import { auctionDeskModel, auctionDeskBannerHtml, seatAuctionCopy } from './auction-desk.js';
import { fringeAssetCardHtml } from './fringe-desk.js';
import { WORLD_RUN_KEY } from '../core/world/envelope.js';
import {
  activeVenture,
  canIpo,
  listedTickerOf,
  LISTED_FABRIC_REASON,
  startupBurnForQuarter,
} from '../core/ventures.js';
import { insurancePremium, TENANT_TERMS } from '../core/event-rules.js';
import { applyBp } from '../core/rng.js';
import { DECEASED_ESTATE_ASK_BP } from '../core/rates.js';
import { disclosedRivalTargets } from '../core/rival-targets.js';
import {
  AVATAR_VENUE_SPENDS,
  venueSpendUntilQuarter,
  PERSON_ARCHETYPE_BY_ID,
  PROFESSIONAL_PROJECT_CAP,
  avatarHasAccess,
  professionalProjectsRemaining,
} from '../core/people.js';
import { buildingBaseFor, consolidatedSuccessorId, eraBand } from '../core/succession.js';
import { CHARACTER_PROFILES } from '../core/storyline.js';
import { identityFor, personPortraitSrc } from '../core/people-identities.js';
import {
  civicUpgradeQuote,
  universityIdeasFor,
  universityStartupBoostBp,
  UNIVERSITY_DONATE_COST,
  UNIVERSITY_DONATE_STARTUP_BP,
  UNIVERSITY_IDEA_STARTUP_BP,
  UNIVERSITY_IDEA_CAP,
  holdingDisplayName,
} from '../core/civic-works.js';
import { civicInvestmentPreview, civicInvestmentPreviewHtml } from './civic-investment-preview.js';
import { petrolForecourtForParcel } from '../core/petrol-yield.js';
import {
  canTrade, marketBookValue, tradeLotsForCard, marketMacroLabel, MARKET_VENUE_USE_ID,
  marketLotSize, formatTickerPrice,
} from '../core/markets.js';
import { openModal } from './modal.js';
import { runHistoryHtml } from './settlement-presenter.js';
import { mountDiorama } from './card-voxels.js';
import { consolidateGlyphSvg } from './action-glyphs.js';
import {
  money, moneyExact, signedMoney, pct, signedPct, levelLabel, conditionLabel, escapeHtml,
} from '../core/format.js';
import {
  COMMERCIAL_TENANT_ORDER,
  COMMERCIAL_TENANT_TERM_QUARTERS,
  COMMERCIAL_TENANT_TERMS,
  franchiseUseMarket,
} from '../core/commercial-tenancy.js';

const OWNER_LABEL = { player: 'Your holding', rival: 'Roman Petridis holding' };

/** Roles with shipped loop / work plates. Keep in sync with assets/img/people/manifest.json. */
const PERSON_LOOP_ROLES = Object.freeze(new Set([
  'cheap-builder', 'property-agent', 'architect', 'mortgage-broker', 'rival-developer',
  'arsonist', 'squatter', 'policeman', 'family', 'dog',
]));
const PERSON_WORK_ROLES = Object.freeze(new Set([
  'cheap-builder', 'property-agent', 'architect', 'mortgage-broker', 'rival-developer',
]));

const PERSON_CHIP = Object.freeze({
  'property-agent': 'Terry',
  'cheap-builder': 'Wozza',
  architect: 'Saskia',
  'mortgage-broker': 'Vinh',
  'rival-developer': 'Petridis',
  arsonist: 'Trevor',
  squatter: 'Possum',
  policeman: 'Draper',
  family: 'Nguyen',
  dog: 'Banjo',
});

const DOG_FIND_PAYOFF = Object.freeze({
  'lost-auction-paddle': 'You know the passed-in asking on that parcel. Use it to bid or buy.',
  'council-time-capsule': 'The capsule bought you time.',
  'tram-ticket-from-nowhere': 'Paints the trams blue and gold. Cosmetic only.',
});

function dogFindText(kind, dogName = 'Banjo') {
  return {
    'lost-auction-paddle': `Lost auction paddle. ${dogName} is sitting with it, looking pleased.`,
    'builders-dropped-plans': `Builder plans. ${dogName} is carrying the roll like a stick.`,
    'council-time-capsule': `Council time capsule. ${dogName} is digging by the rotunda with intent.`,
    'tram-ticket-from-nowhere': `Tram ticket from nowhere. ${dogName} is waiting at the interchange.`,
  }[kind] ?? `${dogName} found something.`;
}

export function builderPlansVerdict(find) {
  if (
    find?.kind !== 'builders-dropped-plans'
    || !find.parcelId
    || typeof find.defectBand !== 'boolean'
  ) return null;
  return `Wozza's next job on ${String(find.parcelId).toUpperCase()}: ${find.defectBand ? 'defect band' : 'clean'}.`;
}

function dogFindPayoff(find) {
  const verdict = builderPlansVerdict(find);
  if (verdict) return `${verdict} The job does not change.`;
  return DOG_FIND_PAYOFF[find?.kind] ?? 'Finds cost no cash.';
}

function dogNameForFind(state, find) {
  const live = state?.people?.byId?.[find?.personId];
  if (live) return personChipName('dog', live);
  if (find?.personChip) return find.personChip;
  if (Number.isInteger(find?.identityId)) return identityFor('dog', find.identityId).chip;
  return 'Banjo';
}

const EVENT_LOCKED_BODY =
  'Open Town Hall for the Notice token. It reveals exact event numbers.';

export function personChipName(archetypeId, person = null) {
  if (person) {
    return identityFor(archetypeId, person.identityId ?? 0).chip
      ?? PERSON_CHIP[archetypeId]
      ?? personLabel(archetypeId, person);
  }
  return PERSON_CHIP[archetypeId]
    ?? CHARACTER_PROFILES[archetypeId]?.shortName
    ?? personLabel(archetypeId);
}

function roleStamp(role) {
  return String(role ?? '').replace(/\s*--\s*/g, ' · ');
}

function occupancyLabel(occupancy) {
  return occupancy === 'tenant' ? 'tenanted' : String(occupancy ?? 'vacant');
}

function moneyHtml(value) {
  return `<span class="money">${escapeHtml(money(value))}</span>`;
}

function middleEllipsis(text, max = 12) {
  const s = String(text ?? '');
  if (s.length <= max) return s;
  const keep = Math.max(3, Math.floor((max - 1) / 2));
  const tail = Math.max(2, max - keep - 1);
  return `${s.slice(0, keep)}…${s.slice(-tail)}`;
}

function markMoney(text) {
  return escapeHtml(String(text ?? '')).replace(
    /\$[\d,]+(?:\.\d+)?[kKmM]?/g,
    (m) => `<span class="money">${m.replace(/[KM]$/, (unit) => unit.toLowerCase())}</span>`,
  );
}

function blockedVerbName(verb) {
  const value = String(verb ?? '');
  if (value === 'walk-person') return 'Meet';
  if (value.startsWith('redevelop:notice')) return 'Notice';
  if (value.startsWith('redevelop:buyout')) return 'Buy out';
  if (value.startsWith('broker-accept:')) return 'Accept';
  if (value.startsWith('trade:')) return value.includes(':sell:') ? 'Sell' : 'Buy';
  const key = value.split(':')[0];
  return {
    acquire: 'Acquire',
    renovate: 'Renovate',
    'renovate-room': 'Renovate',
    redevelop: 'Redevelop',
    divest: 'Divest',
    survey: 'Survey',
    walk: 'Walk',
    hire: 'Hire',
    lobby: 'Lobby',
    'lobby-use': 'Lobby',
    consolidate: 'Consolidate',
    subdivide: 'Subdivide',
    lease: 'Lease',
    insure: 'Insure',
    remediate: 'Remediate',
    bid: 'Bid',
    goto: 'Open',
    ipo: 'IPO',
    'university-donate': 'Endow',
    'university-fund': 'Fund',
    hold: 'Bank',
    settle: 'Settle',
  }[key] ?? 'Action';
}

// One entry per BANNED pattern in mvp/tests/copy-coherence.test.mjs, case-insensitive and never
// narrower, so a reducer reason carrying a banned term keeps the generic text. Regex literals,
// because copy-coherence scans string literals.
const REDUCER_REASON_HOLD = [
  /\bmerge\b/i,
  /\b(?:AI developer|policy rival|the rival developer|automated opponent)\b/i,
  /\bAI\b/i,
  /\b(?:policy|profile)\b/i,
  /\b(?:lot|site|property)\b/i,
  /\b(?:assets?|stock|your parcels?)\b/i,
  /\b(?:double lot|merged lot)\b/i,
  /\b(?:link chain|adjacency bonus)\b/i,
  /\b(?:free action|costs no action|for no further action|0 actions?)\b|\bfree\s*\(fee only\)/i,
  /\b(?:charges?|retainer)\b/i,
  /\bconstruction\b|\bthe build\b/i,
  /\bsettlement\b|\bend(?: of)? turn\b/i,
  /\bledger\b/i,
  /\bnet (?:worth|assets?)\b/i,
  /\bcoffee token\b|\bvoucher\b/i,
  /\b(?:package|contract)\b/i,
  /\b3 (?:holdings|jobs)\b/i,
  /\b(?:height cap|planning limit)\b/i,
  /\bempty\b|\blet\b/i,
  /\b(?:Must walk to meet first|Walk here to meet)\b/i,
  /\bguests\b/i,
  /\bforces\b/i,
  /\bforce brief\b/i,
];

export function shortVerbReason(verb, reason) {
  const r = String(reason || '').replace(/\s+/g, ' ').trim();
  const verbKey = String(verb || '').split(':')[0];
  const lobbyKey = verbKey === 'lobby' || verbKey === 'lobby-use';
  const requiredRung = r.match(/^Lobby L([1-3]) first\.$/i);
  if (lobbyKey) {
    if (requiredRung) return `L${requiredRung[1]} first.`;
    if (/float owns the fabric/i.test(r)) return r;
    if (/listing froze this use/i.test(r)) return r;
    if (/no actions? left|no action remaining/i.test(r)) return 'Settle for more actions.';
    if (/you do not hold|held by (?:Petridis|the rival)/i.test(r)) return 'Pick your own holding.';
    if (/short \$|overdraft floor|not enough cash|cannot fund|need more cash/i.test(r)) {
      return 'Free more cash.';
    }
    if (/works are pending|under construction|renovation is still underway/i.test(r)) {
      return 'Finish works first.';
    }
    return 'No rung to seek.';
  }
  if (requiredRung) return r;
  const named = (imperative) => `${blockedVerbName(verb)} — ${imperative}`;
  if (!r) return named('try another move.');
  const fireDeadline = r.match(/^Bushfire demolition is due at Q(\d+) settlement; this (?:renovation|room upgrade) cannot finish before Q(\d+) settlement\.$/);
  if (fireDeadline) return verbKey === 'renovate-room'
    ? `Burns Q${fireDeadline[1]}; ready Q${fireDeadline[2]}.`
    : `Fire demolition when Q${fireDeadline[1]} settles; work finishes Q${fireDeadline[2]}.`;
  if (r === 'Walk to meet first.') return r;
  if (/^Already met\b/i.test(r)) return r;
  if (/^(?:Survey|Lobby|Acquire|Notice|Buy out|Divest|Consolidate|Renovate|Redevelop) — [^—]+$/.test(r)) return r;
  if (/^Already here this quarter\b/i.test(r)) return named('read the result below.');
  if (/already banked/i.test(r)) return named('already banked.');
  if (/both parcels.*current surveys?/i.test(r)) return named('survey both parcels first.');
  const missingSurvey = r.match(/^([A-Z]\d+) requires a current survey/i);
  if (missingSurvey) return named(`survey ${missingSurvey[1]} first.`);
  if (/both parcels must remain at built level 0/i.test(r)) return named('both parcels must be L0.');
  if (/under construction/i.test(r)) return named('wait for works.');
  if (/renovation is still underway/i.test(r)) return named('wait for renovation.');
  if (/adds no condition or finish improvement/i.test(r)) return 'No improvement · no fee.';
  if (/condition assessment/i.test(r)) return named('wait for survey.');
  if (/tenant exit.*already funded|tenant notice.*already served|notice.*already served/i.test(r)) {
    return named('wait for vacancy.');
  }
  if (/require an active tenant|no active tenant/i.test(r)) return named('no tenant.');
  if (/active tenant|tenant notice|buyout/i.test(r)) return named('end tenancy first.');
  if (/must be your holdings|both parcels/i.test(r)) return named('pick two holdings.');
  if (/different zones|ZONE_MISMATCH/i.test(r)) return named('choose the same zone.');
  if (/has not been met|must (?:already )?be (?:at|met)|walk (?:to meet|here first)|must walk/i.test(r)) {
    return named('walk to meet.');
  }
  if (/own a (?:free )?holding|no free holding/i.test(r)) return named('pick an unassigned holding.');
  if (/already hired|already engaged/i.test(r)) return named('choose another brief.');
  if (/project cap|no projects left/i.test(r)) return named('unassign a project.');
  if (/no actions? left|no action remaining/i.test(r)) return named('settle for more actions.');
  if (/run is over/i.test(r)) return named('start a new run.');
  if (/you do not hold|held by (?:Petridis|the rival)/i.test(r)) return named(verbKey === 'acquire' ? 'pick an unowned parcel.' : 'pick your own holding.');
  if (/already yours/i.test(r)) return named('pick an unowned parcel.');
  if (/short \$|overdraft floor|not enough cash|cannot fund|need more cash/i.test(r)) return named('free more cash.');
  if (/planning ceiling|no legal successor|higher planning permit/i.test(r)) return named('lobby a higher ceiling.');
  if (/squatt/i.test(r)) return named('remediate the holding.');
  if (/damaged|damage/i.test(r)) return named('repair damage first.');
  if (/1×1|ground footprint|orthogonal|same block|compatible sector|right of way/i.test(r)) return named('choose an eligible pair.');
  if (/pending works|works, notice|hire blocks|insurance blocks/i.test(r)) return named('clear pending commitments.');
  if (/listed|Exchange/i.test(r)) return named('use the Exchange.');
  if (/startup/i.test(r)) return named('wind up startup first.');
  if (/renewed condition/i.test(r)) return named('choose another holding.');
  if (/auction/i.test(r)) return named('wait for the auction.');
  if (r.length <= 48 && !/[—:]/.test(r) && /^[A-Z][a-z]/.test(r) && !REDUCER_REASON_HOLD.some((term) => term.test(r))) {
    const sentence = r.replace(/\.*$/, '.');
    return named(/^(?:Petridis|Roman|Wozza|Vinh|Terry|Aido|Possum|Melbourne|Hammerbarn|Cybercab)\b/.test(r)
      ? sentence
      : sentence[0].toLowerCase() + sentence.slice(1));
  }
  return named('try another move.');
}

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
  'walk-person': 'verb-walk.png',
  hire: 'verb-lobby.png',
  lobby: 'verb-lobby.png',
  subdivide: 'verb-merge.png',
  lease: 'verb-notice.png',
});

function verbIconSrc(verb, family = '') {
  const key = String(verb).split(':')[0];
  const file = VERB_ICON[verb] || VERB_ICON[family] || VERB_ICON[key];
  return file ? `assets/img/ui-icons/${file}` : '';
}

function verbIconHtml(verb, family = '') {
  if (family === 'consolidate' || String(verb).split(':')[0] === 'consolidate') {
    return consolidateGlyphSvg('verb__icon verb__icon--consolidate');
  }
  const icon = verbIconSrc(verb, family);
  return icon
    ? `<img class="verb__icon" src="${icon}" alt="" width="36" height="36" decoding="async">`
    : '';
}
const PERSON_QUIP = Object.freeze({
  'property-agent': 'The upside rolls at the board. My fee remains beautifully predictable.',
  'cheap-builder': 'Cash is grouse, invoices are possible, cheques are a hate crime.',
  architect: 'I don\'t do Hamptons.',
  'mortgage-broker': 'Seventeen lenders on the panel. Sit down — let\'s talk about the other six.',
  'rival-developer': 'I show you the targets because watching you try to outbid me is the entertainment.',
  arsonist: 'Lovely holdings you\'ve got near here. Very combustible era.',
  squatter: 'Possession is nine-tenths of the problem.',
  policeman: 'Keeps a file on Trevor thicker than most novels.',
  family: 'Where families walk, rents follow.',
  dog: 'Has opinions. Expresses them by sitting.',
});

/**
 * Player-facing names for the board cast (builders, consultants, AI rival figure).
 * Shared by person cards, property hire rows and the HUD cast rail — keep one map.
 */
const DISTRICT_ACCENT = Object.freeze({
  'fitzroy-north': 'var(--d-fitzroy)',
  'carlton-east': 'var(--d-carlton)',
  'richmond-flat': 'var(--d-richmond)',
  'brighton-reach': 'var(--d-brighton)',
  'docklands-quay': 'var(--d-docklands)',
  'brunswick-rise': 'var(--d-brunswick)',
});
function districtAccent(districtId) {
  return DISTRICT_ACCENT[districtId] ?? 'var(--brass-dim)';
}

const ZONE_LEDGER = Object.freeze({
  NRZ: 'NRZ · neighbourhood',
  GRZ: 'GRZ · general',
  RGZ: 'RGZ · growth',
  MUZ: 'MUZ · mixed use',
  CZ: 'CZ · commercial',
});

export function planningZoneLabel(zoneId) {
  return ZONE_LEDGER[zoneId] ?? String(zoneId || '—');
}

function isZoneMismatchReason(reason) {
  return /different zones|ZONE_MISMATCH/i.test(String(reason || ''));
}

export const PERSON_LABELS = Object.freeze({
  'property-agent': 'Terry',
  'cheap-builder': 'Wozza',
  architect: 'Saskia',
  'mortgage-broker': 'Vinh',
  'rival-developer': 'Roman Petridis',
  arsonist: 'Trevor',
  squatter: 'Possum',
  policeman: 'Draper',
  family: 'The Nguyen-O’Briens',
  dog: 'Banjo',
});

/** Role family for sorting / badges (HUD cast list groups by this). */
export const PERSON_ROLE = Object.freeze({
  'property-agent': 'Agent',
  'cheap-builder': 'Builder',
  architect: 'Architect',
  'mortgage-broker': 'Broker',
  'rival-developer': 'Opponent',
  arsonist: 'Arsonist',
  squatter: 'Squatter',
  policeman: 'Police officer',
  family: 'Local family',
  dog: 'Dog',
});

/** Rail / card sort: builders and consultants first, then Petridis, then hazards. */
export const PERSON_CAST_ORDER = Object.freeze({
  'cheap-builder': 0,
  architect: 1,
  'property-agent': 2,
  'mortgage-broker': 3,
  'rival-developer': 4,
  policeman: 5,
  family: 6,
  dog: 7,
  squatter: 8,
  arsonist: 9,
});

export function personLabel(archetypeId, person = null) {
  if (person) {
    const identity = identityFor(archetypeId, person.identityId ?? 0);
    if (archetypeId === 'family') return `${identity.chip} family`;
    if (archetypeId === 'rival-developer') {
      return PERSON_LABELS[archetypeId] ?? identity.chip ?? identity.label;
    }
    return identity.chip
      ?? PERSON_LABELS[archetypeId]
      ?? String(archetypeId ?? 'Person').replace(/-/g, ' ');
  }
  return PERSON_LABELS[archetypeId] ?? String(archetypeId ?? 'Person').replace(/-/g, ' ');
}

export function personRole(archetypeId, person = null) {
  if (archetypeId === 'policeman' && person) {
    return identityFor(archetypeId, person.identityId ?? 0).label;
  }
  return PERSON_ROLE[archetypeId] ?? 'Person';
}

/** Hire contracts store profession ids for Builder, Design, and Sales briefs. */
export function professionLabel(professionId) {
  return {
    'cheap-builder': 'Wozza — cost brief',
    architect: 'Saskia — quality brief',
    'property-agent': 'Terry — sales brief',
  }[professionId] ?? personLabel(professionId);
}

function readOpenWorldEnvelope() {
  try {
    const inspected = inspectWorldRun(worldStore.get(WORLD_RUN_KEY));
    return inspected.status === 'valid' ? inspected.world : null;
  } catch {
    return null;
  }
}

function p14RepairButtonHtml(facilityKey, world, beat, cash) {
  if (!facilityKey || !liveFacilityDamage(world, facilityKey, beat)) return '';
  const cost = world?.facilities?.damaged?.[facilityKey]?.repairCost ?? FACILITY_REPAIR_COST;
  const blocked = (cash ?? 0) < cost;
  const reason = blocked
    ? `Need $${Number(cost).toLocaleString('en-AU')}.`
    : `Repair ${facilityKey} · $${Number(cost).toLocaleString('en-AU')}`;
  return `
    <button type="button" class="verb verb--secondary${blocked ? ' verb--blocked' : ''}"
            data-verb="repair-facility" data-verb-family="repair"
            data-facility-id="${escapeHtml(facilityKey)}"
            ${blocked ? 'disabled' : ''}
            title="${escapeHtml(reason)}" data-reason="${escapeHtml(reason)}">
      <span class="verb__stack">
        <span class="verb__label">REPAIR</span>
        <small class="verb__hint">${escapeHtml(`$${Number(cost).toLocaleString('en-AU')}`)}</small>
      </span>
    </button>`;
}

export function p14BuildWarshipButtonHtml(world) {
  const check = canRaiseForce(world ?? {}, 'navy');
  // COPY-DRAFT: show the reducer's refusal beside the pinned cost hint.
  const hint = '$250 m · 1 officer';
  const phone = phoneLayerOn();
  return `
    <button type="button" class="verb verb--secondary${check.ok ? '' : ' verb--blocked'}" ${check.ok ? '' : 'disabled'}
            data-verb="build-warship" data-verb-family="build"
            title="BUILD WARSHIP · $250 m · 1 officer · crates listed"
            data-reason="BUILD WARSHIP · $250 m · 1 officer · crates listed">
      <span class="verb__stack">
        <span class="verb__label">BUILD WARSHIP</span>
        <small class="verb__hint" ${phoneJoinAttrs('hint', hint)}>${phoneHintJoin(hint, phone)}</small>
        ${check.ok ? '' : `<small class="verb__reason">${escapeHtml(check.reason)}</small>`}
      </span>
    </button>`;
}

function verbButton({
  verb,
  label,
  faceSuffix = '',
  check,
  available,
  family = verb.split(':')[0],
  className = '',
  key = '',
  personId = null,
  hint = '',
  risk = '',
  attrs = '',
  hideReason = false,
  blockedHint = '',
  exactBlockedReason = false,
}) {
  const shortReason = check.ok
    ? ''
    : exactBlockedReason
      ? String(check.reason ?? '').replace(/\s+/g, ' ').trim()
      : shortVerbReason(verb, check.reason);
  const reason = check.ok ? available : shortReason;
  const consequence = check.ok && hint ? hint : '';
  const blocked = !check.ok;
  const actionAttribute = personId
    ? `data-person-action="${escapeHtml(verb)}" data-person-id="${escapeHtml(personId)}"`
    : `data-verb="${escapeHtml(verb)}"`;
  const icon = verbIconHtml(verb, family);
  return `
    <button type="button" class="verb ${className}${blocked ? ' verb--blocked' : ''}" ${actionAttribute}
            data-verb-family="${escapeHtml(family)}"
            ${attrs}
            ${key ? `aria-keyshortcuts="${escapeHtml(key)}"` : ''}
            ${check.ok ? '' : 'disabled'}
            title="${escapeHtml(reason)}" data-reason="${escapeHtml(reason)}">
      ${icon}
      <span class="verb__stack">
        <span class="verb__label">${markMoney(`${label}${faceSuffix}`)}</span>
        ${consequence ? `<small class="verb__hint">${markMoney(consequence)}</small>` : ''}
        ${blocked && blockedHint ? `<small class="verb__hint">${markMoney(blockedHint)}</small>` : ''}
        ${check.ok && risk ? `<small class="verb__risk">${markMoney(risk)}</small>` : ''}
        ${blocked && shortReason && !hideReason ? `<small class="verb__reason">${markMoney(shortReason)}</small>` : ''}
      </span>
    </button>
  `;
}

function anchorText(anchor) {
  if (!anchor) return 'No destination';
  return `${anchor.kind} · ${anchor.id}`.replace(/-/g, ' ');
}

function personAccessGate(person, state) {
  const tokens = state?.avatars?.player?.accessTokens ?? {};
  const q = state?.quarter ?? 1;
  const operation = PERSON_ARCHETYPE_BY_ID[person.archetypeId]?.interaction?.operation;
  if (operation === 'broker-offer') {
    const cafe = (tokens.brokerTermsUntilQuarter ?? 0) >= q;
    return cafe
      ? 'Cafe token active · exact loan terms visible'
      : 'Walk to meet (1 action). Cafe token shows exact terms.';
  }
  if (person.archetypeId === 'architect') {
    return `Walk to meet (1 action). Then hire the quality brief — no action, ${money(RULES.architectFee)} fee, ${PROFESSIONAL_PROJECT_CAP} projects. Zero defects, slower rungs.`;
  }
  if (person.archetypeId === 'cheap-builder') {
    return `Walk to meet (1 action). Then hire the cost brief — no action, ${money(RULES.cheapBuilderFee)} fee, ${PROFESSIONAL_PROJECT_CAP} projects. Cheaper works, higher defect odds.`;
  }
  if (person.archetypeId === 'property-agent') {
    return 'Walk to meet (1 action). Then hire Terry on a holding — uplift 0–15% rolled at sale.';
  }
  if (person.archetypeId === 'dog') return 'Walk to the mark (1 action). Then collect the find for no cash.';
  return 'Walk to meet (1 action).';
}

const PERSON_WALK_PAYOFF = Object.freeze({
  'cheap-builder': {
    label: 'Meet',
    hint: `Cost brief · ${money(RULES.cheapBuilderFee)} · no action`,
    risk: `${PROFESSIONAL_PROJECT_CAP} projects · cheaper works · higher defect odds`,
    available: `Walk to meet (1 action). Then hire the cost brief — no action, ${money(RULES.cheapBuilderFee)} fee, ${PROFESSIONAL_PROJECT_CAP} projects. Cheaper works, higher defect odds.`,
  },
  architect: {
    label: 'Meet',
    hint: `Quality brief · ${money(RULES.architectFee)} · no action`,
    risk: `${PROFESSIONAL_PROJECT_CAP} projects · zero defects · slower rungs`,
    available: `Walk to meet (1 action). Then hire the quality brief — no action, ${money(RULES.architectFee)} fee, ${PROFESSIONAL_PROJECT_CAP} projects. Zero defects, slower rungs.`,
  },
  'mortgage-broker': {
    label: 'Meet',
    hint: 'Then choose terms · no action',
    available: 'Walk to meet (1 action). Then choose loan terms — no action. Cafe token shows exact terms.',
  },
  'property-agent': {
    label: 'Meet',
    hint: 'Then hire sales · no action',
    risk: `${PROFESSIONAL_PROJECT_CAP} projects · uplift 0–15% at sale · ${pct(RULES.agentFeeBp)} fee`,
    available: 'Walk to meet (1 action). Then hire Terry on a holding — uplift 0–15% rolled at sale.',
  },
  'rival-developer': {
    label: 'Meet',
    hint: 'Then contest target · no action',
    available: 'Walk to meet (1 action). Then open his named target — no action. Buy first to deny his move.',
  },
  policeman: {
    label: 'Meet',
    hint: 'Then hear the report',
    available: 'Walk to meet (1 action). Then hear her patrol report — no action. Arson risk softens while she patrols.',
  },
  family: {
    label: 'Meet',
    hint: 'Then read demand here',
    available: 'Walk to meet (1 action). Then read demand — no action. Food token shows the exact map.',
  },
  dog: {
    label: 'Collect',
    hint: 'Find · no cash',
    available: 'Walk to the mark (1 action). Then collect the find for no cash.',
  },
  arsonist: {
    label: 'Meet',
    hint: 'Send to Petridis · 1 action',
    risk: 'Fire at settle · insure',
    available: 'Walk to meet (1 action). Then send him to a Petridis holding — 1 action. Fire resolves at settle; insure the threatened holding.',
  },
  squatter: {
    label: 'Meet',
    hint: 'Send to Petridis · 1 action',
    risk: 'Occupation at settle · remediate',
    available: 'Walk to meet (1 action). Then send him to a Petridis holding — 1 action. Occupation resolves at settle; remediate the holding.',
  },
});

/** Visible Walk payoff on a person card. Icon-only "Walk" hid the reason to spend the action. */
export function walkPersonOffer(person, { met = false, collected = false } = {}) {
  const base = PERSON_WALK_PAYOFF[person?.archetypeId] ?? {
    label: 'Meet',
    hint: 'Then unlock what they offer',
    available: 'Walk to meet (1 action). Then unlock the named payoff.',
  };
  if (person?.archetypeId === 'dog' && collected) {
    return {
      label: 'Collected',
      hint: 'Banjo stays on the board',
      available: 'The find stays below. Banjo remains until his final quarter.',
    };
  }
  if (met) {
    return {
      label: 'Met',
      hint: 'Read You got this',
      available: 'You met them. The result stays below.',
    };
  }
  return base;
}

/** Visible Walk payoff on a property / verb-wall. */
export function walkParcelOffer(city, state, parcelId) {
  if (!parcelId) {
    return {
      label: 'Meet',
      hint: 'Open the People rail',
      available: 'Open the People rail. Walk to meet (1 action).',
    };
  }
  const id = String(parcelId).toUpperCase();
  const liveAuction = [...(state?.events?.order ?? [])]
    .map((eventId) => state.events.byId[eventId])
    .find((event) => event?.type === 'auction'
      && event.anchorIds?.includes(parcelId)
      && event.resolveQuarter === state.quarter
      && event.status !== 'resolved'
      && event.status !== 'cancelled');
  const names = (state?.people?.order ?? [])
    .map((personId) => state.people.byId[personId])
    .filter((person) => person?.toAnchor?.kind === 'parcel' && person.toAnchor.id === parcelId)
    .map((person) => personChipName(person.archetypeId, person));
  if (liveAuction) {
    return {
      label: 'Attend',
      hint: '1 action · unlock bidding here',
      available: `Walk to ${id} (1 action). Then set your maximum.`,
    };
  }
  if (names.length) {
    const shown = names.slice(0, 2).join(' · ');
    return {
      label: 'Meet',
      hint: `1 action · meet ${shown} here`,
      available: `Walk to ${id} (1 action). Meet ${names.join(', ')} on this parcel.`,
    };
  }
  return {
    label: 'Walk',
    hint: '1 action · bid, meet, or collect tokens',
    available: `Walk to ${id} (1 action). Then bid, meet, or collect tokens.`,
  };
}

const INTEL_CAST = Object.freeze(new Set([
  'property-agent', 'rival-developer', 'policeman', 'family',
  'arsonist', 'squatter', 'dog',
]));

/**
 * What the player actually got from this meeting. Stays on the card.
 * Toasts were vanishing in 3s with no record of the intel.
 */
function meetRecordFor(state, person, viewerSeatId = 'P1') {
  if (!person) return null;
  return state?.avatars?.[viewerSeatId]?.meetResults?.[person.id]
    ?? state?.avatars?.player?.meetResults?.[person.id]
    ?? null;
}

function playerMetPerson(state, person, viewerSeatId = 'P1') {
  const record = meetRecordFor(state, person, viewerSeatId);
  if (record) return true;
  const avatar = state?.mode === 'solo'
    ? (state?.avatars?.player ?? state?.avatars?.[viewerSeatId])
    : (state?.avatars?.[viewerSeatId] ?? state?.avatars?.player);
  if (!avatar || avatar.movedQuarter !== state.quarter || !person) return false;
  if (avatar.destination?.kind === 'person' && avatar.destination.id === person.id) return true;
  const dest = avatar.destination;
  const stand = person.toAnchor;
  return Boolean(dest && stand && dest.kind === stand.kind && dest.id === stand.id);
}

function dogFindForPerson(state, person) {
  return [...(state?.intel?.finds ?? [])].reverse()
    .find((row) => row.personId === person?.id) ?? null;
}

function familySignalModel(city, state, person, chip, record) {
  const event = record?.event ?? null;
  // The persisted event is the reveal authority: a hidden (null) Food-token result must
  // stay hidden instead of leaking through the person's authored pending outcome.
  const revealed = event
    ? (event.blockIds ?? event.blockId ?? null)
    : null;
  const blockIds = [...new Set((Array.isArray(revealed) ? revealed : [revealed])
    .filter(Boolean).map(String))].sort();
  if (!blockIds.length) {
    return {
      got: `The ${chip}s are looking nearby, but the map is still folded.`,
      effect: `Walk to a supermarket (1 action); an eligible food visit costs ${moneyExact(RULES.foodCost)} and grants Food through Q${venueSpendUntilQuarter(state.quarter, AVATAR_VENUE_SPENDS.food)}.`,
      next: `Then meet ${chip} again (1 action). Food requires enough cash and an unused venue-spend allowance; there is no separate token-use button.`,
      cta: null,
      blockIds: [],
    };
  }
  const parcels = [...activeOrder(city, state)].sort()
    .map((id) => activeParcel(city, state, id))
    .filter((parcel) => parcel && blockIds.includes(`${parcel.bx},${parcel.bz}`));
  const anchorCandidates = [record?.anchor, person.toAnchor]
    .filter((anchor) => anchor?.kind === 'parcel')
    .map((anchor) => String(anchor.id));
  const anchorId = anchorCandidates.find((id) => parcels.some((parcel) => parcel.id === id))
    ?? parcels[0]?.id
    ?? null;
  const districtNames = [...new Set(parcels.map(({ districtName }) => districtName).filter(Boolean))];
  const place = districtNames.length === 1
    ? districtNames[0]
    : districtNames.length === 2
      ? districtNames.join(' / ')
      : 'local district';
  return {
    got: anchorId
      ? `The ${chip}s are looking at the ${place} blocks around ${anchorId.toUpperCase()}.`
      : `The ${chip}s are looking at the ${place} blocks.`,
    effect: `Live signal · +${pct(RULES.familySignalValueDriftBp, 2)} block value drift each settle.`,
    next: 'Tap this receipt to highlight and frame every signalled parcel.',
    cta: null,
    blockIds,
  };
}

export function meetResultModel(city, state, person, met, viewerSeatId = 'P1') {
  const record = meetRecordFor(state, person, viewerSeatId);
  const collected = person?.archetypeId === 'dog'
    && (person.pendingOutcome?.status === 'found' || Boolean(dogFindForPerson(state, person)));
  if ((!met && !record && !collected) || !person) return null;
  const intent = state?.rival?.intent;
  const firstMove = record?.event?.firstMove ?? intent?.plan?.[0] ?? intent ?? null;
  const chip = personChipName(person.archetypeId, person);
  switch (person.archetypeId) {
    case 'property-agent':
      return {
        got: `${chip} · sales mandate open`,
        effect: 'Hire Terry on a holding — uplift 0–15% rolled at sale.',
        next: `Up to ${PROFESSIONAL_PROJECT_CAP} projects per engagement.`,
        cta: null,
      };
    case 'rival-developer': {
      const parcelId = firstMove?.parcelId ?? intent?.parcelIds?.[0] ?? null;
      const verb = firstMove?.verb ?? 'acquire';
      const contest = parcelId && verb === 'acquire' && !state.holdings?.[parcelId];
      const effect = verb === 'lease'
        ? `Plans to pay ${money(RULES.leaseFee)} to lease this holding and restore rental income. Inspect its condition and tenancy.`
        : contest
          ? 'Buy that parcel first to deny his move.'
          : parcelId
            // COPY-DRAFT: name the parcel Roman disclosed; the next line already says to open it.
            ? `Ownership, funds and legal works on ${String(parcelId).toUpperCase()} are checked again when the quarter settles.`
            : 'Watch the Petridis rail for his next target.';
      return {
        got: parcelId
          ? `${chip} · ${verb} ${String(parcelId).toUpperCase()}`
          : `${chip} target · pending`,
        effect,
        next: parcelId
          ? `Open ${String(parcelId).toUpperCase()} before settle.`
          : null,
        cta: parcelId
          ? { verb: 'goto', parcelId, label: `${contest ? 'Contest' : 'Inspect'} ${String(parcelId).toUpperCase()}` }
          : null,
      };
    }
    case 'cheap-builder':
      return {
        got: `${chip} · cost brief`,
        effect: `Hire the cost brief — no action, ${money(RULES.cheapBuilderFee)} fee, ${PROFESSIONAL_PROJECT_CAP} projects. Cheaper works, higher defect odds.`,
        next: null,
        cta: null,
      };
    case 'architect':
      return {
        got: `${chip} · quality or two-rung brief`,
        effect: `Hire the quality brief — no action, ${money(RULES.architectFee)} fee, ${PROFESSIONAL_PROJECT_CAP} projects. Zero defects, slower rungs.`,
        next: null,
        cta: null,
      };
    case 'mortgage-broker':
      return {
        got: `${chip} · loan offer`,
        effect: 'Choose higher LVR or lower interest — no action.',
        next: 'Only one offer can be accepted.',
        cta: null,
      };
    case 'policeman':
      return {
        got: `${chip} · patrol active`,
        effect: 'Arson risk softens while she patrols.',
        voice: chip === 'Nash'
          ? 'Another lap, then. Trouble behaves when the new uniform keeps moving.'
          : 'Patrol logged. If trouble objects, it can file the form.',
        next: 'Insure other vulnerable holdings before settle.',
        cta: null,
      };
    case 'family':
      return familySignalModel(city, state, person, chip, record);
    case 'arsonist':
      return {
        got: `${chip} · seen nearby`,
        effect: 'Uninsured timber can burn at settle.',
        next: 'Insure threatened holdings before this quarter settles.',
        cta: null,
      };
    case 'squatter':
      return {
        got: `${chip} · vacant holding marked`,
        effect: 'Remediate now; lease on a later action.',
        next: 'Otherwise rent remains zero.',
        cta: person.toAnchor?.kind === 'parcel'
          ? { verb: 'goto', parcelId: person.toAnchor.id, label: `Open ${person.toAnchor.id.toUpperCase()}` }
          : null,
      };
    case 'dog': {
      const find = dogFindForPerson(state, person);
      const text = find ? dogFindText(find.kind, chip) : null;
      const payoff = find
        ? dogFindPayoff(find)
        : `${chip} sometimes finds auction paddles, builder plans, time capsules, or tram tickets. Finds cost no cash.`;
      const motto = find?.kind === 'council-time-capsule' && find.motto
        ? `The slip reads “${find.motto}.”`
        : null;
      return {
        got: `${text ?? `${chip} sniffed the parcel and found nothing this quarter.`}${motto ? ` ${motto}` : ''}`,
        effect: payoff,
        next: find?.kind === 'council-time-capsule'
          ? (find.actionsGranted
            ? `Spend the ${find.actionsGranted} added actions before settle.`
            : 'Use the time before settle.')
          : find?.parcelId ? `Open ${String(find.parcelId).toUpperCase()} to use it.` : null,
        cta: find?.parcelId
          ? { verb: 'goto', parcelId: find.parcelId, label: `Open ${String(find.parcelId).toUpperCase()}` }
          : null,
      };
    }
    default:
      return {
        got: `Met · ${personChipName(person.archetypeId, person)}`,
        effect: 'They have nothing further this stop.',
        next: null,
        cta: null,
      };
  }
}

export function banjoFindBannerHtml(state, parcelId) {
  const finds = (state?.intel?.finds ?? []).filter((row) => row.parcelId === parcelId);
  if (!finds.length) return '';
  const latest = finds[finds.length - 1];
  const dogName = dogNameForFind(state, latest);
  const text = dogFindText(latest.kind, dogName);
  const payoff = dogFindPayoff(latest);
  return `
    <section class="meet-result meet-result--parcel" data-banjo-find role="status">
      <div class="meet-result__k">${escapeHtml(dogName)}’s find</div>
      <p class="meet-result__got">${escapeHtml(text)}</p>
      <p class="meet-result__effect">${escapeHtml(payoff)}</p>
      <p class="meet-result__next">${escapeHtml(dogName)} stays on the People rail until the final quarter.</p>
    </section>`;
}

export function meetResultHtml(city, state, person, met, viewerSeatId = 'P1') {
  const model = meetResultModel(city, state, person, met, viewerSeatId);
  if (!model) return '';
  const signalAttrs = model.blockIds?.length
    ? ` data-family-signal-blocks="${escapeHtml(model.blockIds.join(';'))}" role="button" tabindex="0" aria-label="Show family demand signal on the board"`
    : '';
  return `
    <section class="meet-result${model.blockIds?.length ? ' meet-result--signal' : ''}" data-meet-result${signalAttrs || ' role="status"'}>
      <div class="meet-result__k">You got this</div>
      <p class="meet-result__got">${escapeHtml(model.got)}</p>
      <p class="meet-result__effect">${escapeHtml(model.effect)}</p>
      ${model.voice ? `<p class="meet-result__voice">${escapeHtml(model.voice)}</p>` : ''}
      ${model.next ? `<p class="meet-result__next">${escapeHtml(model.next)}</p>` : ''}
    </section>`;
}

function personOutcomeText(person) {
  const outcome = person.pendingOutcome;
  if (!outcome) return 'No pending hazard or find yet';
  if (outcome.kind === 'hire' && outcome.status === 'contracted') {
    return `Brief active on ${String(outcome.parcelId ?? '').toUpperCase()} · hire applies there`;
  }
  if (outcome.kind !== 'dog-find') {
    return `${outcome.kind.replace(/-/g, ' ')} · ${outcome.status ?? 'pending'}`;
  }
  const dogName = personChipName('dog', person);
  return {
    'lost-auction-paddle': `Auction paddle · ${dogName} has it`,
    'builders-dropped-plans': `Builder plans · ${dogName} has the roll`,
    'council-time-capsule': `Council time capsule · ${dogName} digs nearby`,
    'tram-ticket-from-nowhere': `Tram ticket · ${dogName} waits at interchange`,
  }[outcome.findKind] ?? `${dogName} marked something worth investigating`;
}

function professionalActionHtml(city, state, person, viewerSeatId = 'P1') {
  if (!['cheap-builder', 'architect', 'property-agent'].includes(person.archetypeId)) return '';
  const remaining = professionalProjectsRemaining(person);
  if (remaining <= 0) {
    return `<p class="card__empty">Engaged on ${PROFESSIONAL_PROJECT_CAP} projects. No further briefs this engagement.</p>`;
  }
  const held = Object.keys(state.holdings).sort()
    .filter((id) => {
      const holding = state.holdings[id];
      if (holding.ownerSeatId !== viewerSeatId) return false;
      if (person.archetypeId !== 'property-agent' && (holding.renovation || holding.construction)) {
        return false;
      }
      // Allow hiring the other profession while one is already contracted.
      const already = (holding.hires && holding.hires[person.archetypeId])
        || holding.hire?.profession === person.archetypeId;
      return !already;
    });
  const fee = person.archetypeId === 'cheap-builder'
    ? RULES.cheapBuilderFee
    : person.archetypeId === 'architect'
      ? RULES.architectFee
      : null;
  const candidates = [];
  for (const parcelId of held) {
    if (person.archetypeId === 'cheap-builder') {
      candidates.push({
        parcelId,
        brief: 'cost',
        label: 'Hire cost',
        hint: `${parcelId.toUpperCase()} · ${money(fee)} fee · cheaper works`,
        risk: 'Then Renovate or choose BUILD on this holding',
      });
      continue;
    }
    if (person.archetypeId === 'property-agent') {
      candidates.push({
        parcelId,
        brief: 'sales',
        label: 'Hire sales',
        hint: `${parcelId.toUpperCase()} · uplift 0–15% at sale`,
        risk: `Divest while active · ${pct(RULES.agentFeeBp)} sale fee`,
      });
      continue;
    }
    candidates.push({
      parcelId,
      brief: 'quality',
      label: 'Hire quality',
      hint: `${parcelId.toUpperCase()} · ${money(fee)} fee · zero defect`,
      risk: 'Then Renovate on this holding',
    });
    if (!RULES.redevelopButtonRetired) {
      candidates.push({
        parcelId,
        brief: 'succession',
        label: 'Hire two-rung',
        hint: `${parcelId.toUpperCase()} · ${money(fee)} fee · two-rung`,
        risk: 'Then Redevelop on this holding',
      });
    }
  }
  if (!candidates.length) {
    const unavailable = 'No unassigned holding. Acquire one or wait for active works.';
    return verbButton({
      verb: `hire:${person.archetypeId}:unassigned`,
      family: 'hire',
      label: 'Hire',
      key: 'J',
      personId: person.id,
      className: 'verb--recessed verb--empty-hire',
      check: { ok: false, reason: unavailable },
      available: '',
      hideReason: true,
      blockedHint: unavailable,
    });
  }
  return candidates.slice(0, Math.max(remaining, 3)).map(({ parcelId, brief, label, hint, risk }) => {
    const action = {
      type: 'hire',
      avatarId: 'player',
      parcelId,
      personId: person.id,
      profession: person.archetypeId,
      brief,
    };
    const check = canApplyAction(city, state, action);
    const meetGate = /has not been met|must (?:already )?be (?:at|met)|walk (?:to meet|here first)|must walk/i
      .test(check.reason || '');
    return verbButton({
      verb: `hire:${person.archetypeId}:${brief}:${parcelId}`,
      family: 'hire',
      label,
      key: 'J',
      personId: person.id,
      className: check.ok ? 'verb--primary' : 'verb--recessed',
      check: meetGate ? { ok: false, reason: 'Meet first' } : check,
      hideReason: false,
      exactBlockedReason: meetGate,
      available: `${person.archetypeId === 'property-agent' ? `${pct(RULES.agentFeeBp)} sale fee` : `${moneyExact(fee)} fee`} · no action · ${remaining}/${PROFESSIONAL_PROJECT_CAP} projects through Q${state.quarter + 2}`,
      hint,
      risk,
    });
  }).join('');
}

/** Broker accept = walk-to-person with brokerChoice after contact is open. */
function brokerActionHtml(city, state, person, met) {
  if (person.archetypeId !== 'mortgage-broker') return '';
  const choices = [
    {
      choice: 'lvr',
      label: 'Accept · higher LVR',
      hint: `LVR ${(RULES.brokerLvrBp / 100).toFixed(0)}% · no action · Vinh leaves`,
    },
    {
      choice: 'interest',
      label: 'Accept · lower interest',
      hint: `Interest ${(RULES.brokerInterestBp / 100).toFixed(2)}% · no action · Vinh leaves`,
    },
  ];
  return choices.map(({ choice, label, hint }) => {
    const action = {
      type: 'walk',
      avatarId: 'player',
      destination: { kind: 'person', id: person.id },
      purchase: null,
      brokerChoice: choice,
    };
    return verbButton({
      verb: `broker-accept:${choice}`,
      family: 'walk',
      label,
      personId: person.id,
      check: met
        ? canApplyAction(city, state, action)
        : { ok: false, reason: 'Walk to meet first.' },
      available: 'Walk to meet (1 action). Then accept one offer — no action.',
      hint,
      risk: 'One offer · then Vinh leaves',
    });
  }).join('');
}

/** Stable civic display copy: authored use names win; procedural ids never reach a card title. */
export function civicDisplayName(civicOrUseId) {
  const civic = civicOrUseId && typeof civicOrUseId === 'object' ? civicOrUseId : null;
  const useId = String(civic?.useId ?? civicOrUseId ?? '').trim();
  if (useId === 'university-old-arts') return 'CITY UNIVERSITY';

  const registered = CIVIC_BY_ID?.[useId]?.label ?? EMITTER_LABELS?.[useId];
  if (registered) return registered;

  const authored = String(civic?.label ?? '').trim();
  const looksProcedural = /^civic[-_]/i.test(authored)
    || /^[a-z0-9]+(?:[-_][a-z0-9]+)+$/i.test(authored)
    || /(?:^|[-_\s])\d+(?:$|[-_\s])/.test(authored);
  if (authored && !looksProcedural) return authored;

  const source = useId || String(civic?.id ?? '').trim();
  const cleaned = source
    .replace(/^civic[-_]/i, '')
    .replace(/[-_]\d+$/, '')
    .replace(/_/g, '-');
  const words = cleaned.split('-').filter((word) => word && !/^\d+$/.test(word));
  if (!words.length) return 'Civic place';
  return words
    .map((word, index) => (index === 0
      ? `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`
      : word.toLowerCase()))
    .join(' ');
}

function humanPlaceLabel(city, parcelId) {
  const id = String(parcelId ?? '').trim();
  if (!id) return '—';
  const parcel = city?.parcels?.[id];
  const placedCivic = city?.civicUses?.find((candidate) => candidate.id === id) ?? null;
  if (placedCivic) return civicDisplayName(placedCivic);
  const civic = CIVIC_BY_ID?.[id] ?? CIVIC_BY_ID?.[parcel?.useId];
  if (civic?.label) return civic.label;
  if (parcel?.label && !/^P\d/i.test(parcel.label) && !/^[A-Z]+-[A-Z0-9-]+$/i.test(parcel.label)) {
    return parcel.label;
  }
  const cleaned = id.replace(/^CIVIC-/i, '').replace(/-\d+$/, '').replace(/_/g, '-');
  const words = cleaned.split('-').filter(Boolean);
  if (!words.length) return id;
  return words
    .map((word, index) => (index === 0
      ? `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`
      : word.toLowerCase()))
    .join(' ');
}

function personSiteParcelId(person, state) {
  if (person.toAnchor?.kind === 'parcel') return person.toAnchor.id;
  const hired = Object.entries(state.holdings ?? {}).find(([, holding]) => {
    if (holding.hire?.personId === person.id) return true;
    return Object.values(holding.hires ?? {}).some((contract) => contract?.personId === person.id);
  });
  if (hired) return hired[0];
  return Object.entries(state.holdings ?? {}).find(([, holding]) => holding.owner === 'player')?.[0] ?? null;
}

function personPictogramGutter(person, state, work, remaining, city = null) {
  const site = (work.site || (person.toAnchor?.kind === 'parcel' ? person.toAnchor.id : '') || '')
    .toString()
    .toUpperCase()
    .replace(/^PARCEL\s+/, '');
  const place = site ? humanPlaceLabel(city, site) : '—';
  const isPro = ['cheap-builder', 'architect', 'property-agent'].includes(person.archetypeId);
  const fee = person.archetypeId === 'architect'
    ? RULES.architectFee
    : person.archetypeId === 'cheap-builder'
      ? RULES.cheapBuilderFee
      : null;
  const feePlate = person.archetypeId === 'property-agent'
    ? [pct(RULES.agentFeeBp), `${pct(RULES.agentFeeBp)} sale fee`]
    : [money(fee), `Fee ${moneyExact(fee)}`];
  const projects = isPro ? professionalProjectsRemaining(person) : state.actionsRemaining;
  const tiles = [
    ['site', 'Parcel', place, site || 'No parcel'],
    ['tenure', 'Until', `Q${person.despawnAfterQuarter} · ${remaining} qtr`,
      `On board through Q${person.despawnAfterQuarter} · ${remaining} quarter${remaining === 1 ? '' : 's'} left`],
    ...(isPro ? [['fee', 'Fee', feePlate[0], feePlate[1]]] : []),
    ['acts', isPro ? 'Projects' : 'Actions', `${projects}`, isPro
      ? `${projects} of ${PROFESSIONAL_PROJECT_CAP} projects left`
      : `${state.actionsRemaining} actions remaining`],
  ];
  return `
    <div class="dossier-gutter" aria-label="Status">
      ${tiles.map(([key, label, value, title]) => `
        <div class="dossier-stat dossier-stat--${key}" title="${escapeHtml(title)}">
          <span class="dossier-stat__icon" aria-hidden="true"></span>
          <span class="dossier-stat__copy">
            <span class="dossier-stat__k">${escapeHtml(label)}</span>
            <span class="dossier-stat__v">${escapeHtml(String(value))}</span>
          </span>
        </div>`).join('')}
    </div>`;
}

function personVerbGrid(city, state, person, viewerSeatId, walk, met) {
  const isPro = ['cheap-builder', 'architect', 'property-agent'].includes(person.archetypeId);
  const isBroker = person.archetypeId === 'mortgage-broker';
  const collected = person.archetypeId === 'dog'
    && (person.pendingOutcome?.status === 'found' || Boolean(dogFindForPerson(state, person)));
  const record = meetRecordFor(state, person, viewerSeatId);
  const avatar = state.mode === 'solo'
    ? (state.avatars?.player ?? state.avatars?.[viewerSeatId])
    : (state.avatars?.[viewerSeatId] ?? state.avatars?.player);
  const revealDemand = met && person.archetypeId === 'family'
    && !record?.event?.blockId && !(record?.event?.blockIds?.length)
    && Boolean(avatar && avatarHasAccess(avatar, AVATAR_VENUE_SPENDS.food.token, state.quarter));
  const offer = revealDemand
    ? { label: 'Reveal demand', hint: '1 action · meet again with Food', available: `Walk to meet again; Food is active through Q${avatar.accessTokens[AVATAR_VENUE_SPENDS.food.token]}.` }
    : walkPersonOffer(person, { met, collected });
  const [hintHead, ...hintRest] = String(offer.hint ?? '').split(/\s+·\s+/);
  const hintTail = hintRest.join(' · ');
  const visibleHint = offer.risk ? offer.hint : (hintTail ? `${hintHead} ·` : (hintHead || offer.hint));
  const visibleRisk = offer.risk || hintTail;
  const walkGate = !met && (isPro || isBroker) ? 'Walk to meet (1 action).' : '';
  const walkBtn = verbButton({
    verb: 'walk-person',
    family: 'walk',
    label: offer.label,
    key: 'W',
    personId: person.id,
    check: ((met && !revealDemand) || collected)
      ? { ok: false, reason: collected
        ? 'Find is on this card. Banjo stays on the board.'
        : 'Already met. Read You got this.' }
      : walk,
    className: 'verb--pictorial verb--primary verb--meet verb--walk-quote',
    available: [offer.available, walk.spendHint].filter(Boolean).join(' · '),
    hint: [walkGate || (met ? visibleHint : `1 action · ${visibleHint}`), walk.spendHint].filter(Boolean).join(' · '),
    risk: visibleRisk,
  });
  const result = meetResultModel(city, state, person, met, viewerSeatId);
  const cta = result?.cta
    ? verbButton({
      verb: 'goto',
      family: 'acquire',
      label: result.cta.label,
      check: { ok: true, reason: '' },
      className: 'verb--pictorial verb--primary',
      available: result.next || result.effect,
      hint: 'No action',
      attrs: `data-parcel-id="${escapeHtml(result.cta.parcelId)}"`,
    })
    : '';
  let hireHtml = '';
  if (isPro) {
    hireHtml = professionalActionHtml(city, state, person, viewerSeatId)
      .replaceAll('class="verb ', 'class="verb verb--pictorial ')
      || verbButton({
        verb: 'lobby',
        family: 'lobby',
        label: 'Hire',
        personId: person.id,
        check: { ok: false, reason: 'Acquire an unassigned holding first.' },
        className: 'verb--pictorial',
        available: '',
      });
  } else if (isBroker) {
    const brokerHtml = brokerActionHtml(city, state, person, met);
    hireHtml = brokerHtml
      ? brokerHtml.replaceAll('class="verb ', 'class="verb verb--pictorial ')
      : verbButton({
        verb: 'lobby',
        family: 'lobby',
        label: 'Accept',
        personId: person.id,
        check: { ok: false, reason: 'Walk to meet (1 action).' },
        className: 'verb--pictorial',
        available: '',
      });
  }
  const showGate = Boolean(hireHtml) && !met && (isPro || isBroker);
  const hireBlock = hireHtml
    ? `<div class="dossier-verbs__${showGate ? 'recessed' : 'hires'}${isBroker ? ' dossier-verbs__choices' : ''}">${hireHtml}</div>`
    : '';
  return `
    <div class="dossier-verbs" aria-label="Person verbs">
      ${walkBtn}
      ${hireBlock}
      ${cta}
    </div>`;
}

export function personCardHtml(city, state, personId, viewerSeatId = 'P1') {
  const person = state.people?.byId?.[personId];
  if (!person) return null;
  const remaining = Math.max(0, person.despawnAfterQuarter - state.quarter + 1);
  const role = personRole(person.archetypeId, person);
  const walk = walkCommitDisclosure(city, state, {
    type: 'walk',
    avatarId: 'player',
    destination: { kind: 'person', id: person.id },
    purchase: null,
    brokerChoice: null,
  });
  const met = playerMetPerson(state, person, viewerSeatId);
  const quip = PERSON_QUIP[person.archetypeId]
    ?? CHARACTER_PROFILES[person.archetypeId]?.idle?.[0]
    ?? '';
  const working = personIsWorking(person, state);
  const work = personWorkMeta(person, state);
  const ident = identityFor(person.archetypeId, person.identityId ?? 0);
  const displayName = (person.identityId ?? 0) === 0
    ? (CHARACTER_PROFILES[person.archetypeId]?.name ?? ident.label ?? PERSON_LABELS[person.archetypeId])
    : (ident.chip ?? PERSON_LABELS[person.archetypeId]);
  const roleLine = roleStamp(role).split('·')[0].trim();
  const firmLine = (() => {
    const title = CHARACTER_PROFILES[person.archetypeId]?.title ?? '';
    const after = title.split(/\s+[—–-]\s+/).slice(1).join(' — ').trim();
    const firm = after.split(/[,(]/)[0].trim();
    if (firm && firm.toLowerCase() !== roleLine.toLowerCase()) return firm;
    return '';
  })();
  const filledQuarters = Math.max(0, Math.min(4, Math.round((work.pct / 100) * 4)));
  const progress = working ? `
    <div class="card__work-progress card__work-progress--quarters" data-person-work-progress>
      <span>Brief active</span>
      <div class="dossier-quarters" aria-label="${filledQuarters} of 4 quarters">
        ${[0, 1, 2, 3].map((i) =>
    `<span class="dossier-quarters__block${i < filledQuarters ? ' is-filled' : ''}"></span>`).join('')}
      </div>
    </div>` : '';
  const verbs = personVerbGrid(city, state, person, viewerSeatId, walk, met);
  const gutter = personPictogramGutter(person, state, work, remaining, city);
  if (working) {
    return `
    <header class="deed-binder deed-binder--person">
      <div class="deed-tab" data-deed-tab>
        <span>${escapeHtml(displayName)}</span>
        <span class="deed-tab__suburb">${escapeHtml(roleLine || 'On parcel')}</span>
      </div>
      <button class="card__close" type="button" aria-label="Close person card">✕</button>
    </header>
    <div class="dossier-body">
    <div class="card__landuse-head card__identity" data-person-state="working">
      <div class="card__work-layout">
        ${personStageHtml(person, state)}
        ${personSiteCamHtml(person, state)}
      </div>
      ${progress}
      <div class="card__person-info">
        <div class="card__title">${escapeHtml(displayName)}</div>
        <div class="card__subtitle">${escapeHtml(work.jobLine)}</div>
        ${quip ? `<p class="card__playbook card__quip" role="status">${escapeHtml(quip)}</p>` : ''}
      </div>
    </div>
    ${gutter}
    ${meetResultHtml(city, state, person, met, viewerSeatId)}
    </div>
    ${verbs}
  `;
  }
  return `
    <header class="deed-binder deed-binder--person">
      <div class="deed-tab" data-deed-tab>
        <span>${escapeHtml(displayName)}</span>
        <span class="deed-tab__suburb">${escapeHtml(roleLine)}</span>
      </div>
      <button class="card__close" type="button" aria-label="Close person card">✕</button>
    </header>
    <div class="dossier-body">
    <div class="card__landuse-head card__identity" data-person-state="idle">
      <div class="card__person-hero card__person-hero--dossier">
        ${personStageHtml(person, state)}
        <div class="card__person-info">
          <div class="card__title">${escapeHtml(displayName)}</div>
          ${firmLine ? `<div class="card__subtitle">${escapeHtml(firmLine)}</div>` : ''}
          ${quip ? `<p class="card__playbook card__quip" role="status">${escapeHtml(quip)}</p>` : ''}
        </div>
      </div>
    </div>
    ${gutter}
    ${meetResultHtml(city, state, person, met, viewerSeatId)}
    </div>
    ${verbs}
  `;
}

function factorText(event) {
  const factors = Object.entries(event.factors ?? {})
    .filter(([, value]) => ['number', 'boolean', 'string'].includes(typeof value))
    .filter(([key]) => !/(?:roll|unit)$/i.test(key))
    .sort(([left], [right]) => left.localeCompare(right));
  return factors.length
    ? factors.slice(0, 3).map(([key, value]) => {
      const label = key.replace(/([A-Z])/g, ' $1').toLowerCase();
      const formatted = typeof value === 'number' && /bp$/i.test(key)
        ? pct(value)
        : typeof value === 'number'
          ? value.toLocaleString()
          : value;
      return `${label} ${formatted}`;
    }).join(' · ')
    : 'Derived from the people forecast';
}

function arithmeticBand(event) {
  if (event.type === 'auction') {
    const estate = event.payload?.deceasedEstate
      ? ` · estate −${pct(event.payload.discountBp ?? 10000 - DECEASED_ESTATE_ASK_BP, 0)}`
      : '';
    return `Reserve ${moneyExact(event.payload.reservePrice)} · ${moneyExact(event.payload.increment)} steps${estate}`;
  }
  if (event.type === 'downturn') return `${signedPct(RULES.eventDownturnBp)} sectors before floor`;
  if (event.type === 'flash-flood') {
    const exposure = Object.values(event.payload.exposures ?? {}).map(({ exposureBp }) => exposureBp);
    return exposure.length
      ? `${pct(Math.min(...exposure))}–${pct(Math.max(...exposure))} parcel exposure`
      : 'Low-lying holdings exposed';
  }
  if (event.type === 'interest-shock') return `${pct(RULES.interestShockBp, 2)} interest · ${pct(RULES.brokerShockInterestBp, 2)} with broker`;
  if (event.type === 'materials-spike') return `Works quotes ×${(RULES.materialsSpikeCostBp / 10000).toFixed(2)} during this window`;
  if (event.type === 'fire') return 'Insured: deductible · uninsured: condition loss or delay';
  if (event.type === 'tenant-arrears') return 'Rent at risk: one full quarter';
  return event.forecast?.detail ?? 'See forecast';
}

function canonicalEventCopy(text) {
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

export function eventCardHtml(event, showExact = true, state = null) {
  const seatAuction = state && event.type === 'auction' ? seatAuctionCopy(state) : null;
  if (seatAuction) return `
    <section class="card__event" data-event-card="${escapeHtml(event.id)}">
      <div class="card__section-title">${escapeHtml(canonicalEventCopy(event.forecast.headline))} · resolves Q${event.resolveQuarter}</div>
      <p>${escapeHtml(showExact ? `Set a private maximum; pay the hammer price. ${seatAuction.tie}` : EVENT_LOCKED_BODY)}</p>
      ${showExact ? row('Factors', escapeHtml(factorText(event))) : ''}
      ${showExact ? row('Arithmetic band', escapeHtml(arithmeticBand(event))) : ''}
      ${row('Your maximum', event.playerCommitment ? moneyExact(event.playerCommitment.maxBid) : 'None')}
      ${row(`${seatAuction.opponent} attendance and maximum`, 'Not disclosed')}
    </section>`;
  const playerCommitment = event.playerCommitment
    ? Object.entries(event.playerCommitment).sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 2)
      .map(([key, value]) => `${key} ${typeof value === 'number' ? moneyExact(value) : value}`).join(' · ')
    : 'Player absent';
  const rivalCommitment = event.type === 'auction'
    ? event.rivalCommitment
      ? `Petridis max ${moneyExact(event.rivalCommitment.maxBid)} — ${event.rivalCommitment.rationale}`
      : 'Petridis passes'
    : null;
  const commitment = rivalCommitment
    ? `${playerCommitment} · ${rivalCommitment}`
    : playerCommitment;
  return `
    <section class="card__event" data-event-card="${event.id}">
      <div class="card__section-title">${escapeHtml(canonicalEventCopy(event.forecast.headline))} · resolves Q${event.resolveQuarter}</div>
      <p>${escapeHtml(showExact
        ? (event.type === 'auction'
          ? 'Set maximum · pay hammer price · Petridis wins ties'
          : canonicalEventCopy(event.forecast.detail))
        : EVENT_LOCKED_BODY)}</p>
      ${showExact ? row('Factors', escapeHtml(factorText(event))) : ''}
      ${showExact ? row('Arithmetic band', escapeHtml(arithmeticBand(event))) : ''}
      ${row('Commitment', escapeHtml(commitment))}
    </section>
  `;
}

function auctionCaptionHtml(model) {
  if (!model) return '';
  if (model.seatAuction) return auctionDeskBannerHtml(model);
  const maximum = model.committed || model.fundable || model.reservePrice;
  const hammer = model.preview?.salePrice ?? model.reservePrice;
  return `
    <section class="card__owner-banner card__owner-banner--diorama" role="status" data-auction-desk>
      <div class="card-diorama-host card-diorama-host--auction"
        data-card-diorama="auction"
        data-reserve="${model.reservePrice}"
        data-max="${maximum}"
        data-hammer="${hammer}"></div>
    </section>`;
}

function row(label, value, className = '') {
  return `<div class="row"><span class="label">${label}</span><span class="value ${className}">${value}</span></div>`;
}

function statChip(label, value) {
  return `<div class="stat-chip"><span class="stat-chip__k">${label}</span><span class="stat-chip__v">${value}</span></div>`;
}

export function rubberStamp(kind) {
  const name = String(kind || '').replace(/^stamp-/, '');
  if (!name) return '';
  return `<span class="rubber-stamp rubber-stamp--${escapeHtml(name)}" data-stamp="${escapeHtml(name)}" aria-hidden="true"></span>`;
}

/** Next legal form if this lot is (or becomes) a 1×2 pad. */
export function mergeUnlockFor(parcel) {
  if (!parcel) return null;
  try {
    const tiles = Array.isArray(parcel.tiles) && parcel.tiles.length === 2
      ? parcel.tiles
      : [parcel.id ?? 'a', `${parcel.id ?? 'a'}:b`];
    const id = consolidatedSuccessorId({
      ...parcel,
      consolidated: true,
      tiles,
    });
    return {
      id,
      label: ARCHETYPES[id]?.label ?? id,
      storeys: ARCHETYPES[id]?.storeys ?? parcel.storeys,
    };
  } catch {
    return null;
  }
}

/** A survey is current only while its condition certificate and both hazard bands agree. */
export function parcelSurveyComplete(state, parcelId) {
  return coreParcelSurveyComplete(state, parcelId);
}

/** View-only prerequisite. Wave 2 owns the matching reducer invariant. */
export function mergeSurveyGate(state, parcelId, partnerId) {
  if (!partnerId) {
    return { ok: false, reason: 'Consolidate — choose an adjacent L0 holding.' };
  }
  const missing = [parcelId, partnerId].filter((id) => !parcelSurveyComplete(state, id));
  if (missing.length === 2) {
    return { ok: false, reason: 'Consolidate — survey both parcels first.' };
  }
  if (missing.length === 1) {
    return { ok: false, reason: `Consolidate — survey ${missing[0].toUpperCase()} first.` };
  }
  return { ok: true, reason: '' };
}

/** Pure model for the merge / subdivide verb and the amalgam plate. */
export function topologyVerbModel(city, state, parcelId) {
  const parcel = activeParcel(city, state, parcelId);
  const holding = state.holdings?.[parcelId];
  if (!parcel || holding?.owner !== 'player') return null;
  const unlock = mergeUnlockFor(parcel);
  const fakePad = {
    ...parcel,
    consolidated: true,
    tiles: parcel.tiles?.length === 2 ? parcel.tiles : [parcelId, `${parcelId}:b`],
  };
  const permitNow = maxPermitLevelFor(parcel);
  const permitAfter = maxPermitLevelFor(fakePad);
  if (parcel.consolidated) {
    const quote = subdivideQuote(city, state, parcelId);
    const check = canApplyAction(city, state, { type: 'subdivide', parcelId });
    const dq = redevelopQuote(city, state, parcelId);
    const nextForm = dq?.toArchetype
      ? {
        id: dq.toArchetype,
        label: ARCHETYPES[dq.toArchetype]?.label ?? dq.toArchetype,
      }
      : unlock;
    return {
      kind: 'subdivide',
      ok: check.ok,
      check,
      quote,
      unlock: nextForm,
      ceilingForm: unlock,
      parents: parcel.componentParcelIds ?? [],
      permitNow,
      permitAfter,
    };
  }
  const candidates = [...activeAdjacency(city, state, parcelId)].sort()
    .map((otherId) => {
      const action = { type: 'consolidate', parcelIds: [parcelId, otherId].sort() };
      return {
        otherId,
        action,
        check: canApplyAction(city, state, action),
        owned: state.holdings[otherId]?.owner === 'player',
      };
    });
  const option = candidates.find(({ check }) => check.ok)
    ?? candidates.find(({ owned, check }) => owned && !isZoneMismatchReason(check.reason))
    ?? candidates.find(({ owned }) => owned)
    ?? candidates[0];
  const reducerCheck = option?.check ?? canApplyAction(city, state, {
    type: 'consolidate',
    parcelId,
  });
  const surveyGate = mergeSurveyGate(state, parcelId, option?.otherId ?? null);
  // The explicit-pair canApplyAction result comes from validateConsolidation and is the one
  // authority for every state gate. The old view-only survey gate remains only as a readiness
  // data hook; substituting it here erased partner ids and non-survey causes from the key.
  const check = reducerCheck;
  const quote = option?.check?.ok
    ? consolidateQuote(city, state, option.action.parcelIds)
    : null;
  const ownedPartner = Boolean(option?.owned);
  return {
    kind: 'consolidate',
    ok: Boolean(reducerCheck.ok),
    hide: false,
    check,
    reducerCheck,
    surveyGate,
    quote,
    unlock,
    partnerId: option?.otherId ?? null,
    ownedPartner,
    permitNow,
    permitAfter,
  };
}

/** The one topology control rendered by the card; its disabled state comes from the view model. */
export function topologyActionButtonHtml(model) {
  if (!model) return '';
  if (model.kind === 'subdivide') {
    return verbButton({
      verb: 'subdivide',
      label: model.quote ? `Subdivide ${money(model.quote.fee)}` : 'Subdivide',
      key: 'U',
      check: model.check,
      available: model.quote
        ? `Restore ${(model.parents ?? []).map((id) => id.toUpperCase()).join(' + ')} for ${moneyExact(model.quote.fee)} cash.`
        : 'Restore the two parcel titles.',
      hint: 'Two titles again',
    });
  }
  return verbButton({
    verb: model.partnerId ? `consolidate:${model.partnerId}` : 'consolidate',
    family: 'consolidate',
    label: 'Consolidate',
    key: 'C',
    check: model.check,
    className: model.ok ? 'verb--primary' : 'verb--secondary',
    available: 'Consolidate the eligible pair.',
    hint: model.ok && model.quote ? `${money(model.quote.fee)} · 1 action` : '',
    risk: '',
    exactBlockedReason: true,
    attrs: `data-merge-survey="${model.surveyGate?.ok ? 'ready' : 'blocked'}" data-merge-partner="${escapeHtml(model.partnerId ?? '')}"`,
  });
}

function rivetPress(html) {
  if (!html) return html;
  const nut = '<img src="assets/img/ui-icons/hex-boss.png" alt="" width="24" height="24" decoding="async">';
  return html.replace('</button>',
    `<span class="verb__grit" aria-hidden="true"></span>`
    + `<span class="verb__soil verb__soil--grease" aria-hidden="true">`
    + `<img src="assets/img/ui-icons/grease-blot.png" alt="" width="52" height="34" decoding="async"></span>`
    + `<span class="verb__soil verb__soil--face" aria-hidden="true">`
    + `<img src="assets/img/ui-icons/grease-drip.png" alt="" width="48" height="22" decoding="async"></span>`
    + `<span class="verb__soil verb__soil--well" aria-hidden="true">`
    + `<img src="assets/img/ui-icons/grease-pool.png" alt="" width="56" height="34" decoding="async"></span>`
    + `<span class="verb__boss" data-corner="tl" aria-hidden="true">${nut}</span>`
    + `<span class="verb__boss" data-corner="tr" aria-hidden="true">${nut}</span>`
    + `<span class="verb__boss" data-corner="bl" aria-hidden="true">${nut}</span>`
    + `<span class="verb__boss" data-corner="br" aria-hidden="true">${nut}</span></button>`);
}

function shortFormLabel(label) {
  const raw = String(label || '').trim();
  return raw.replace(/\s+(apartments|houses|house|row)$/i, '').trim() || raw;
}

/** True on the phone layer (<html data-phone-hud="1">). The render reads it once and hands it to the two join helpers below; `doc` defaults to the global document. */
export function phoneLayerOn(doc = globalThis.document) {
  return doc?.documentElement?.getAttribute?.('data-phone-hud') === '1';
}

/** Phone layer only (`phone` true). A verb hint may break at " · " and must keep a number with its unit and a count with its noun. Off the phone layer this is escapeHtml. title and data-reason are not passed through here. */
export function phoneHintJoin(text, phone) {
  const safe = escapeHtml(String(text ?? ''));
  if (phone !== true) return safe;
  return safe.replace(/(\d) (?=[A-Za-z])/g, '$1&nbsp;');
}

/** Phone layer only (`phone` true). A permit name may break after "/" and must not break at its hyphen. Off the phone layer this is escapeHtml. */
export function phoneSlashBreak(text, phone) {
  const safe = escapeHtml(String(text ?? ''));
  if (phone !== true) return safe;
  return safe.replaceAll('-', '&#8209;').replaceAll('/', '/<wbr>');
}

const PHONE_JOINS = { hint: phoneHintJoin, slash: phoneSlashBreak };

/** Windows that already carry the shared layoutchange listener (P2d SHEET item 2). */
const phoneJoinWindows = new WeakSet();

/** One layoutchange listener per window for every card in its document: when layout-class.js flips phoneHud (data-phone-hud is already
 *  written when it fires) each `aside.card` redoes its joins. It holds no card, so a card instance that is dropped or rebuilt leaves nothing
 *  behind. A document without a window (a test host) adds nothing. Returns true when this call added the listener. */
export function listenPhoneJoins(doc) {
  const win = doc?.defaultView;
  if (!win || typeof win.addEventListener !== 'function' || phoneJoinWindows.has(win)) return false;
  phoneJoinWindows.add(win);
  win.addEventListener('layoutchange', (event) => {
    const flag = event?.detail?.phoneHud;
    const phone = typeof flag === 'boolean' ? flag : phoneLayerOn(doc);
    for (const card of doc.querySelectorAll?.('aside.card') ?? []) syncPhoneJoins(card, phone);
  });
  return true;
}

/** The attributes that let a rendered card redo a join when the layer flips (P2d SHEET item 2): the helper's kind and the raw text. The element's
 *  content must be exactly the helper's output for that text. */
function phoneJoinAttrs(kind, text) {
  return `data-phone-join="${kind}" data-phone-join-text="${escapeHtml(String(text ?? ''))}"`;
}

/** Redo every join under `root` for the layer `phone`. An element is rewritten only when its content differs from the helper's output, compared
 *  as parsed nodes (a template element's content against a clone of the element's children, with isEqualNode), never as raw innerHTML: the
 *  live markup serialises U+2011 as a character where the helper writes &#8209;. Returns how many elements were rewritten. */
export function syncPhoneJoins(root, phone) {
  const doc = root?.ownerDocument;
  if (!doc || typeof root.querySelectorAll !== 'function') return 0;
  let rewritten = 0;
  for (const el of root.querySelectorAll('[data-phone-join]')) {
    const join = PHONE_JOINS[el.getAttribute('data-phone-join')];
    if (!join) continue;
    const next = join(el.getAttribute('data-phone-join-text') ?? '', phone);
    const want = doc.createElement('template');
    want.innerHTML = next;
    const have = doc.createDocumentFragment();
    for (const child of el.childNodes) have.appendChild(child.cloneNode(true));
    if (want.content.isEqualNode(have)) continue;
    el.innerHTML = next;
    rewritten += 1;
  }
  return rewritten;
}

function amalgamStrapHtml(size = '') {
  const cls = ['amalgam-strap-img', size ? `amalgam-strap-img--${size}` : '']
    .filter(Boolean).join(' ');
  return consolidateGlyphSvg(`${cls} consolidate-glyph`);
}

function amalgamDiagramHtml(leftId, rightId, nextId = '') {
  const left = escapeHtml(String(leftId || '').toUpperCase());
  const right = escapeHtml(String(rightId || '').toUpperCase());
  const next = nextId ? escapeHtml(String(nextId).toUpperCase()) : '';
  return `
    <div class="amalgam-diagram">
      <span class="amalgam-diagram__lot">${left}</span>
      ${amalgamStrapHtml()}
      <span class="amalgam-diagram__lot">${right}</span>
      ${next ? `<span class="amalgam-diagram__arrow" aria-hidden="true">→</span>
      <span class="amalgam-diagram__lot amalgam-diagram__lot--new">${next}</span>` : ''}
    </div>`;
}

export function amalgamPlateHtml(model, parcelId) {
  if (!model) return '';
  const unlock = model.unlock?.label ?? 'a larger building';
  if (model.kind === 'subdivide') {
    return `
      <aside class="amalgam-plate amalgam-plate--done amalgam-plate--diorama" data-amalgam="merged">
        <div class="card-diorama-host" data-card-diorama="merge" data-mode="subdivide"></div>
      </aside>`;
  }
  if (model.ok) {
    return `
      <aside class="amalgam-plate amalgam-plate--ready amalgam-plate--diorama" data-amalgam="ready">
        <div class="card-diorama-host" data-card-diorama="merge" data-mode="merge"></div>
      </aside>`;
  }
  // COPY-DRAFT: use the same verb as the Consolidate action.
  return `
    <aside class="amalgam-plate amalgam-plate--blocked" data-amalgam="blocked">
      ${consolidateGlyphSvg('amalgam-plate__icon consolidate-glyph')}
      <div class="amalgam-plate__copy">
        <strong>${model.ownedPartner === false ? 'Consolidate needs a neighbour' : 'Consolidate blocked'}</strong>
        <p>${escapeHtml(model.ownedPartner === false ? 'Own an adjacent parcel to consolidate the two.' : shortVerbReason('consolidate', model.check?.reason))}</p>
      </div>
    </aside>`;
}

function signedBp(value) {
  if (value === 0) return '0';
  return `${value > 0 ? '+' : '−'}${Math.abs(value)}`;
}

function curveText(curve) {
  return curve ? curve.map(signedBp).join(' · ') : 'No effect';
}

function latticeTiles(ids) {
  return ids.map((id) => {
    const tile = parseParcelId(id);
    return { id, ...globalTile(tile.bx, tile.bz, tile.tx, tile.tz) };
  });
}

function activeSynergies(city, emitter) {
  const active = [];
  const operations = Object.fromEntries(SECTOR_IDS.map((sector) => [sector, []]));
  for (const synergy of PAIR_SYNERGIES) {
    const [left, right] = synergy.participants;
    if (left.kind !== 'building' || right.kind !== 'building') continue;
    const selectedSide = left.ids.includes(emitter.useId)
      ? 0
      : right.ids.includes(emitter.useId)
        ? 1
        : null;
    if (selectedSide === null) continue;
    const partnerUseIds = synergy.participants[selectedSide === 0 ? 1 : 0].ids;
    const partners = city.amenityEmitters
      .filter((candidate) =>
        candidate.id !== emitter.id && partnerUseIds.includes(candidate.useId));
    for (const partner of partners) {
      const distance = nearestTileDistance(emitter.tiles, partner.tiles);
      if (distance > synergy.maxDistance) continue;
      const selectedEffects = synergy.effects.filter((effect) =>
        effect.measure === 'curve' && effect.target === selectedSide);
      for (const effect of selectedEffects) {
        operations[effect.sector].push({ ...effect, name: synergy.name });
      }
      active.push({
        name: synergy.name,
        partner,
        distance,
        selectedEffects,
      });
    }
  }
  return { active, operations };
}

function applySynergyOperations(curve, operations) {
  if (!curve) return null;
  return curve.map((sample) => {
    let bp = sample;
    let product = 1;
    for (const operation of operations) {
      if (operation.zeroNegative) {
        if (bp < 0) bp = 0;
        continue;
      }
      const nextProduct = Math.min(1.6, product * operation.multiplier);
      bp = Math.round(bp * (nextProduct / product));
      product = nextProduct;
    }
    return bp;
  });
}

function affectedParcels(city, state, emitter, operations) {
  const affected = [];
  for (const id of activeOrder(city, state)) {
    const parcel = activeParcel(city, state, id);
    const distance = nearestTileDistance(latticeTiles(parcel.tiles), emitter.tiles);
    if (distance < 1 || distance > 3) continue;
    const curve = INFLUENCE_CURVES[parcel.sector]?.[emitter.useId];
    if (!curve) continue;
    const postSynergy = applySynergyOperations(curve, operations[parcel.sector]);
    const bp = postSynergy[distance - 1];
    if (bp === 0) continue;
    affected.push({ parcel, distance, bp });
  }
  return affected
    .sort((a, b) => Math.abs(b.bp) - Math.abs(a.bp) || a.parcel.id.localeCompare(b.parcel.id))
    .slice(0, 3);
}

function influenceRows(useId, operations) {
  return SECTOR_IDS.map((sector) => {
    const curve = INFLUENCE_CURVES[sector]?.[useId] ?? null;
    const post = applySynergyOperations(curve, operations[sector]);
    const changed = curve && post.some((sample, index) => sample !== curve[index]);
    return `
      <div class="card__influence-row">
        <span>${SECTORS[sector].label}</span>
        <span class="value">${curveText(curve)}</span>
        ${changed ? `<span class="card__influence-post">post-synergy ${curveText(post)}</span>` : ''}
      </div>
    `;
  }).join('');
}

function synergyRows(active, useId, operations) {
  if (!active.length) {
    return '<p class="card__empty">No active pair synergy within 2 tiles.</p>';
  }
  return `<ul class="card__synergies">${active.map((entry) => {
    const sectors = Array.from(new Set(entry.selectedEffects.map((effect) => effect.sector)));
    const samples = sectors.length
      ? sectors.slice(0, 2).map((sector) => {
        const curve = INFLUENCE_CURVES[sector]?.[useId] ?? null;
        const values = curveText(applySynergyOperations(curve, operations[sector]))
          .replaceAll(' · ', '/');
        return `${SECTORS[sector].label} ${values}`;
      }).join(' / ')
      : 'Partner curve only · this emitter is unchanged';
    return `<li>
      <strong>${entry.name}</strong> · ${entry.partner.label ?? EMITTER_LABELS[entry.partner.useId]}
      · distance ${entry.distance}
      <span>${samples}</span>
    </li>`;
  }).join('')}</ul>`;
}

function affectedRows(affected) {
  if (!affected.length) return '<p class="card__empty">No tradeable parcel is inside d1–d3.</p>';
  return `<ul class="card__receivers">${affected.map(({ parcel, distance, bp }) => `
    <li>
      <span>${parcel.id.toUpperCase()} · ${ARCHETYPES[parcel.archetypeId].label}</span>
      <span>${SECTORS[parcel.sector].label} · d${distance}</span>
      <strong class="${bp > 0 ? 'gain' : 'loss'}">${signedBp(bp)} bp</strong>
    </li>
  `).join('')}</ul>`;
}

function formatMarketPnl(unrealized, unrealizedBp) {
  if (!Number.isFinite(unrealized) || unrealized === 0) {
    return { text: 'P&L $0', cls: '' };
  }
  const sign = unrealized > 0 ? '+' : '−';
  const abs = Math.abs(Math.round(unrealized));
  const pctPart = Number.isFinite(unrealizedBp)
    ? ` · ${unrealizedBp >= 0 ? '+' : ''}${(unrealizedBp / 100).toFixed(1)}%`
    : '';
  return {
    text: `P&L ${sign}$${abs.toLocaleString('en-AU')}${pctPart}`,
    cls: unrealized > 0 ? 'gain' : 'loss',
  };
}

/**
 * Stock Exchange trade panel. lotSelections maps assetId → selected lot multiples
 * (1 = one board lot). Default is 1 lot when affordable / held.
 */
function stockExchangeTradeHtml(city, state, venueId, lotSelections = {}) {
  if (!state) return '';
  const lots = tradeLotsForCard(state);
  const book = marketBookValue(state, 'player');
  const rows = lots.map((lot) => {
    const lotSize = marketLotSize(lot.id);
    // Cash (buy) and held units (sell) only — no artificial unit ceiling.
    const maxBuyLots = lot.price > 0
      ? Math.floor(state.cash / (lot.price * lotSize))
      : 0;
    const maxSellLots = Math.floor(lot.held / lotSize);
    const maxLots = Math.max(1, maxBuyLots, maxSellLots);
    const preferred = Number.isInteger(lotSelections[lot.id]) ? lotSelections[lot.id] : 1;
    // Min 1 lot (or max affordable / held when that is the only option).
    const selectedLots = Math.max(1, Math.min(maxLots, preferred));
    const buyUnits = selectedLots * lotSize;
    const sellUnits = selectedLots * lotSize;
    const canBuy = selectedLots >= 1 && selectedLots <= maxBuyLots && buyUnits >= 1;
    const canSell = selectedLots >= 1 && selectedLots <= maxSellLots && sellUnits >= 1;
    const buyCheck = canBuy
      ? canTrade(city, state, {
        type: 'trade', assetId: lot.id, side: 'buy', units: buyUnits, venueId,
      })
      : { ok: false, reason: maxBuyLots < 1
        ? `Not enough cash for a ${lotSize}-unit batch.`
        : `Select 1–${maxBuyLots} batches to buy.` };
    const sellCheck = canSell
      ? canTrade(city, state, {
        type: 'trade', assetId: lot.id, side: 'sell', units: sellUnits, venueId,
      })
      : { ok: false, reason: maxSellLots < 1 ? 'None held.' : `Select 1–${maxSellLots} batches to sell.` };
    const buyTotal = lot.price * buyUnits;
    const sellTotal = lot.price * sellUnits;
    const priceLabel = formatTickerPrice(lot.price, lot.class, lot.id);
    const pnl = lot.held > 0
      ? formatMarketPnl(lot.unrealized, lot.unrealizedBp)
      : null;
    const navShare = lot.held * lot.price;
    return `
      <div class="market-lot"
           data-market-asset="${escapeHtml(lot.id)}"
           data-market-price="${lot.price}"
           data-market-lot-size="${lotSize}"
           data-market-held="${lot.held}"
           data-market-avg-cost="${lot.avgCost}"
           data-market-class="${escapeHtml(lot.class)}"
           data-market-lots="${selectedLots}"
           data-market-max-buy-lots="${maxBuyLots}"
           data-market-max-sell-lots="${maxSellLots}"
           data-market-venue="${escapeHtml(venueId)}">
        <div class="market-lot__meta">
          <strong>${escapeHtml(lot.id)}</strong>
          <span class="tag tag--stamp">${escapeHtml(lot.class)}</span>
          <span>${escapeHtml(priceLabel)}</span>
          <span class="market-lot__delta ${lot.deltaBp >= 0 ? 'gain' : 'loss'}">${lot.deltaBp >= 0 ? '+' : ''}${(lot.deltaBp / 100).toFixed(1)}% q/q</span>
          <span class="market-lot__afford">held ${lot.held} · batch ${lotSize}${navShare ? ` · NAV ${money(navShare)}` : ''}</span>
          ${pnl ? `<span class="market-lot__pnl ${pnl.cls}" data-market-pnl>${escapeHtml(pnl.text)}</span>` : ''}
        </div>
        <div class="market-lot__stepper" aria-label="Batches of ${lotSize} for ${escapeHtml(lot.id)}">
          <button type="button" class="market-lot__step" data-market-lot-step="-1"
                  ${selectedLots <= 1 ? 'disabled' : ''} aria-label="Fewer batches">−</button>
          <span class="market-lot__lot-count" data-market-lot-count>${selectedLots}</span>
          <span class="market-lot__lot-unit">×${lotSize}</span>
          <button type="button" class="market-lot__step" data-market-lot-step="1"
                  ${selectedLots >= maxLots ? 'disabled' : ''} aria-label="More batches">+</button>
        </div>
        <div class="market-lot__verbs market-lot__verbs--pair" aria-label="Trade ${escapeHtml(lot.id)}">
          ${verbButton({
            verb: `trade:${lot.id}:buy:${buyUnits}`,
            family: 'trade',
            label: `Buy ${buyUnits} · ${money(buyTotal)}`,
            personId: venueId,
            check: buyCheck,
            available: `Buy ${buyUnits} ${lot.id} · ${moneyExact(buyTotal)} · no action`,
            hint: `${selectedLots} batch${selectedLots === 1 ? '' : 'es'} · cash only`,
            className: 'verb--primary',
          })}
          ${verbButton({
            verb: `trade:${lot.id}:sell:${sellUnits}`,
            family: 'trade',
            label: canSell || maxSellLots >= 1 ? `Sell ${sellUnits} · ${money(sellTotal)}` : 'Sell',
            personId: venueId,
            check: sellCheck,
            available: `Sell ${sellUnits} ${lot.id} · ${moneyExact(sellTotal)} · no action`,
            hint: lot.held
              ? (pnl ? `${pnl.text} · hold ${lot.held}` : `hold ${lot.held}`)
              : 'none held',
          })}
        </div>
      </div>`;
  }).join('');
  const macroLine = marketMacroLabel(state.markets?.lastMacro)
    .replace(/\bSettle\b/g, 'settle');
  return `
    <section class="card__section card__section--market" data-card-section="market" aria-label="Listed markets">
      <div class="card__section-title">Markets · batch size · cash only</div>
      <p class="card__playbook-lead">Positions ${moneyExact(book)} · prices move at settle</p>
      <p class="card__owner-banner" role="status">${escapeHtml(macroLine)}</p>
      ${rows}
    </section>`;
}

/** Pure HTML projection of the frozen City influence content; no property actions. */
export function landUseCardHtml(city, selection, state = null, lotSelections = null, viewerSeatId = 'P1') {
  const civic = selection.kind === 'civic'
    ? city.civicUses.find((candidate) => candidate.id === selection.id)
    : null;
  const reserve = selection.kind === 'reserve' && city.reserve?.id === selection.id
    ? city.reserve
    : null;
  if (!civic && !reserve) return null;

  const useId = civic?.useId ?? 'reserve';
  const emitter = city.amenityEmitters.find((candidate) => candidate.id === selection.id);
  if (!emitter) return null;
  const { active, operations } = activeSynergies(city, emitter);
  const affected = affectedParcels(city, state, emitter, operations);
  const receivingSectors = SECTOR_IDS
    .filter((sector) => INFLUENCE_CURVES[sector]?.[useId]?.some((value) => value !== 0))
    .map((sector) => SECTORS[sector].label);
  const receiving = receivingSectors.length <= 3
    ? receivingSectors.join(' · ') || 'None'
    : [...receivingSectors.slice(0, 2), `+${receivingSectors.length - 2} sectors`].join(' · ');
  const isExchange = civic?.useId === MARKET_VENUE_USE_ID;
  const isShop = civic?.useId === 'supermarket-strip';
  const isScript = civic?.useId === 'remand-centre';
  const isNotice = civic?.useId === AVATAR_VENUE_SPENDS.notice.useId;
  const isSchool = civic?.useId === 'school-primary';
  const isTransport = civic?.useId === 'transport-interchange';
  const isUniversity = civic?.useId === 'university-old-arts';

  const identity = civic
    ? {
      eyebrow: `${civic.id} · ${civic.districtName}`,
      title: civicDisplayName(civic),
      sub: isUniversity
        ? 'Campus venture funding · not real-estate'
        : isExchange
          ? 'Click to trade · NASDAQ names + crypto · cash only'
          : isShop
            ? 'Lease the strip · Zombie Shopper TD · cash only'
            : isScript
              ? 'Script Lord · 30-day wholesale circuit · cash-out on retire'
              : isNotice && state
                ? `Public notices · ${money(RULES[AVATAR_VENUE_SPENDS.notice.costRule])} · rest of the run`
                : `${civic.footprint[0]}×${civic.footprint[1]} tile footprint · ${civic.storeys} storey${civic.storeys === 1 ? '' : 's'}`,
      status: isUniversity ? 'CAMPUS PROGRAM'
        : isExchange ? 'Market venue · not real-estate'
          : isShop || isScript ? 'Concession venue · not real-estate'
            : isNotice && state ? 'Notice desk · not real-estate'
              : 'Non-tradeable civic land',
    }
    : {
      eyebrow: `${reserve.id}`,
      title: EMITTER_LABELS.reserve,
      sub: 'Public reserve · full footprint · non-tradeable',
      status: null,
    };
  const use = CIVIC_BY_ID[useId];
  const district = reserve
    ? city.districts.find((candidate) =>
      candidate.id === city.districtByBlock[`${reserve.bx},${reserve.bz}`])
    : null;
  const favour = state?.favour ?? 0;
  const favourMax = RULES.favourMax ?? 100;
  const register = isUniversity
    ? {
      plates: [['ROLE', 'ENDOWMENT DESK'], ['VERBS', 'ENDOW · FUND'], ['REACH', 'SHOP VENTURES']],
      explainer: 'Fund three ideas, no more. Each shoves a shop toward a term sheet.',
    }
    : isNotice
      ? {
        plates: [['ROLE', 'NOTICE DESK'], ['VERB', 'COLLECT NOTICE'], ['REACH', 'RUN-WIDE EVENTS']],
        explainer: 'Collect the Notice token here. Event numbers stay exact through the run.',
      }
      : isSchool
        ? {
          plates: [['ROLE', 'PRIMARY SCHOOL'], ['VERB', 'UPGRADE'], ['REACH', 'ELIGIBLE PARCELS']],
          explainer: 'The next grade adds a distance increment on eligible parcels, not only houses.',
        }
        : isTransport
          ? {
            plates: [['ROLE', 'INTERCHANGE'], ['VERB', 'UPGRADE'], ['REACH', 'ELIGIBLE PARCELS']],
            explainer: 'The next grade adds a distance increment on eligible parcels.',
          }
          : isExchange
            ? {
              plates: [['ROLE', 'MARKET VENUE'], ['VERB', 'TRADE'], ['SETTLE', 'PRICES RE-RATE']],
              explainer: 'Trade listed names here. Prices re-rate at settle.',
            }
            : isShop
              ? {
                plates: [['ROLE', 'CONCESSION'], ['VERB', 'RUN STRIP'], ['BOOKS', 'CASH ONLY']],
                explainer: 'Lease the strip, then run it. Takings stay cash-only.',
              }
              : isScript
                ? {
                  plates: [['ROLE', 'WHOLESALE CIRCUIT'], ['VERB', 'OPEN SCRIPT'], ['EXIT', 'RETIRE']],
                  explainer: 'Open the circuit here. Retire when the wholesale run is done.',
                }
                : reserve
                  ? {
                    plates: [['ROLE', 'PUBLIC RESERVE'], ['VERB', 'IMPROVE'], ['RETURN', 'FAVOUR']],
                    explainer: 'Improve the reserve for favour. Favour helps lobbying and trims works costs.',
                  }
                  : {
                    plates: [['ROLE', 'CIVIC USE'], ['TRADE', 'NO'], ['REACH', 'NEARBY PARCELS']],
                    explainer: 'This civic use shifts nearby holdings. Distance decides who receives it.',
                  };
  const registerHtml = `
    <div class="civic-r1-plates" data-civic-register="r1" aria-label="Civic rule plates">
      ${register.plates.map(([label, value]) => `
        <div class="civic-r1-plate">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>`).join('')}
    </div>
    <p class="civic-r2-explainer" data-civic-register="r2">${escapeHtml(register.explainer)}</p>`;

  let deskBody = '';
  if (isExchange && state) {
    deskBody = stockExchangeTradeHtml(city, state, civic.id, lotSelections ?? {});
  } else if (isUniversity) {
    deskBody = universityDeskHtml(city, state);
  } else {
    deskBody += reserve && state ? reserveGiftHtml(city, state) : `
      <section class="card__section" data-card-section="money" aria-label="Money">
        ${row('Trade status', civic ? 'Non-tradeable civic land' : 'Public reserve · non-tradeable')}
      </section>
      <section class="card__section" data-card-section="geography" aria-label="What it emits">
        <div class="card__section-title">${(isSchool || isTransport) ? 'Base influence' : 'What it emits · basis points'}</div>
        <div class="card__influence-head"><span>Receiver</span><span>d1 · d2 · d3</span></div>
        ${influenceRows(useId, operations)}
      </section>
      <section class="card__section" data-card-section="intel" aria-label="Who receives it">
        <div class="card__section-title">Who receives it</div>
        <p class="card__receiver-sectors">${receiving}</p>
        ${affectedRows(affected)}
      </section>
      <section class="card__section" data-card-section="effects" aria-label="Active pair synergies">
        <div class="card__section-title">Active pair synergies</div>
        ${synergyRows(active, useId, operations)}
      </section>
      ${(isSchool || isTransport) && state && civic ? civicInvestmentPreviewHtml(civicInvestmentPreview(city, state, civic.useId, viewerSeatId)) : ''}
      ${civic ? `<section class="card__section" data-card-section="effects" aria-label="Siting">
        ${row('Siting rule', use.siting)}
        ${row('City quota shortfall', String(city.civicShortfall[useId] ?? 0))}
      </section>` : ''}`;
  }
  deskBody += civicDeskActionsHtml(city, state, civic, {
    isExchange, isShop, isScript, isNotice, isSchool, isTransport,
  });

  const districtId = civic?.districtId ?? district?.id ?? null;
  const districtChip = (civic?.districtName ?? district?.name ?? 'PUBLIC').split(/\s+/)[0];
  const cardId = civic?.id ?? reserve.id;
  // Phone round P2a (item C). The public reserve's eyebrow line is its id ("reserve-2-1"), legacy text the desktop keeps. On the phone layer the sheet
  // shows the game's own name for it, EMITTER_LABELS.reserve, with its district (sheet-phone.js tidyEyebrow reads data-phone-name), and the reserve
  // has no plate to show: the civics folder has no reserve.png and neither has the archetype folder, so its <img> was two 404s and a broken box.
  // The desktop card is as it was; the phone layer leaves the portrait out and the identity grid takes one column.
  const phoneName = reserve ? [EMITTER_LABELS.reserve, district?.name].filter(Boolean).join(' · ') : '';
  const noPortrait = Boolean(reserve) && globalThis.document?.documentElement?.getAttribute?.('data-phone-hud') === '1';
  // Phone round P2b (item 4): `district` above compares a district's id with the block's district OBJECT (city.districtByBlock holds the objects, city.js:2665),
  // so it is never found and the desktop chip reads "PUBLIC"; that stays as it is. The phone line gets the block's district by its own hook (data-phone-district).
  const phoneDistrict = reserve && !district ? (city.districtByBlock?.[`${reserve.bx},${reserve.bz}`]?.name ?? '') : '';
  return `
    <header class="deed-binder deed-binder--civic" data-civic-binder
            style="--district-accent: ${districtAccent(districtId)}">
      <div class="deed-tab" data-deed-tab>
        <span>${escapeHtml(identity.title)}</span>
        <span class="deed-tab__suburb">${escapeHtml(districtChip)}</span>
      </div>
      <div class="card__band">
        <span class="card__band-district">${reserve ? 'PUBLIC RESERVE' : 'CIVIC DESK'}</span>
        <span class="card__band-parcel" aria-hidden="true"></span>
        <span class="card__band-ribbon">NON-TRADEABLE</span>
      </div>
      <button class="card__close" type="button" aria-label="Close card">✕</button>
    </header>
    <section class="civic-sheet deed-well" data-civic-card="${escapeHtml(cardId)}"
             data-civic-use="${escapeHtml(useId)}">
      <header class="card__head card__identity civic-identity-plate" data-card-section="identity">
        <div class="card__identity-grid${noPortrait ? ' card__identity-grid--solo' : ''}">
          <div class="card__identity-copy">
            <div class="card__addr"${phoneName ? ` data-phone-name="${escapeHtml(phoneName)}"` : ''}${phoneName && phoneDistrict ? ` data-phone-district="${escapeHtml(phoneDistrict)}"` : ''}>${escapeHtml(identity.eyebrow)}</div>
            <div class="card__title">${escapeHtml(identity.title)}</div>
            <div class="card__sub">${noPortrait ? identity.sub.split(' · ').map((part) => `<span class="card__sub-part">${escapeHtml(part)}</span>`).join(' · ') : escapeHtml(identity.sub)}</div>
            ${identity.status ? `<div class="tag card__nontradeable">${escapeHtml(identity.status)}</div>` : ''}
          </div>
          ${noPortrait ? '' : `<figure class="deed-polaroid civic-portrait" data-deed-polaroid>
            <img class="deed-polaroid__img is-loading" src="assets/img/ui-plates/civics/${encodeURIComponent(useId)}.png"
                 onerror="this.onerror=null;this.src='${archetypeThumbSrc(useId)}'"
                 alt="${escapeHtml(identity.title)}" width="512" height="384"
                 loading="eager" decoding="async" data-archetype-thumb="${escapeHtml(useId)}">
          </figure>`}
        </div>
        ${isUniversity ? universityStatusHtml(state) : ''}
        ${registerHtml}
        <div class="card__mobile-summary">
          <span>${isUniversity ? 'Lock boost' : isExchange ? 'Positions' : reserve ? 'Favour' : 'Emission'}</span>
          <strong>${isUniversity
            ? (state ? signedPct(universityStartupBoostBp(state)) : '0.0%')
            : isExchange && state
              ? moneyExact(marketBookValue(state, 'player'))
              : reserve
                ? `${favour}/${favourMax}`
                : receiving}</strong>
        </div>
      </header>
      ${deskBody}
    </section>`;
}

function civicDeskActionsHtml(city, state, civic, flags) {
  if (!civic || !state) return '';
  const parts = [];
  if (flags.isExchange) parts.push(verbButton({
    verb: 'open-desk',
    family: 'trade',
    label: 'Open the trading desk',
    check: { ok: true },
    available: 'Open the trading desk — no action.',
    className: 'verb--primary',
  }));
  if (flags.isShop) parts.push(verbButton({
    verb: 'open-shop',
    family: 'shop',
    label: 'Work the shift — 1 action',
    check: { ok: true },
    available: 'Open Zombie Shopper — 1 action.',
    className: 'verb--primary',
  }));
  if (flags.isScript) parts.push(verbButton({
    verb: 'open-script',
    family: 'script',
    label: 'Run the yard — 1 action',
    check: { ok: true },
    available: 'Open Script Lord — 1 action.',
    className: 'verb--primary',
  }));
  if (flags.isShop) {
    const food = foodWalkDisclosure(city, state, civic.id);
    parts.push(verbButton({ verb: 'walk-civic', family: 'walk', label: food.label,
      check: { ok: food.ok, reason: food.reason }, exactBlockedReason: true,
      hint: food.hint, available: food.hint, className: 'verb--primary verb--food' }));
  }
  if (flags.isNotice) parts.push(noticeVerbHtml(city, state, civic));
  if (flags.isSchool || flags.isTransport) parts.push(civicUpgradeVerbHtml(city, state, civic));
  if (!parts.length) return '';
  return `<div class="card__actions card__actions--civic" data-card-section="action">${parts.join('')}</div>`;
}

function civicUpgradeVerbHtml(city, state, civic) {
  const quote = civicUpgradeQuote(state, civic.useId);
  if (!quote) return '';
  const action = { type: 'civic-upgrade', useId: civic.useId, civicId: civic.id };
  const check = quote.ok
    ? canApplyAction(city, state, action)
    : { ok: false, reason: quote.reason };
  const label = quote.ok
    ? `${quote.label} · ${money(quote.cost)}`
    : quote.fromLabel ?? 'Upgraded';
  return verbButton({
    verb: 'civic-upgrade',
    family: 'civic-upgrade',
    label,
    check,
    available: `Nearby parcels lift. — ${moneyExact(quote.cost)} · 1 action`,
    hint: 'Nearby parcels lift',
    className: 'verb--primary',
    attrs: `data-use-id="${escapeHtml(civic.useId)}"`,
  });
}

function universityStatusHtml(state) {
  const donated = Boolean(state?.university?.donated);
  const fundedCount = Math.min(UNIVERSITY_IDEA_CAP, state?.university?.funded?.length ?? 0);
  const boost = state ? universityStartupBoostBp(state) : 0;
  const maxBoost = UNIVERSITY_DONATE_STARTUP_BP + UNIVERSITY_IDEA_CAP * UNIVERSITY_IDEA_STARTUP_BP;
  const endowMark = `endowment-desk__mark endowment-desk__mark--${donated ? 'in' : 'out'}`;
  return `
      <div class="endowment-desk__well" role="status" aria-label="Campus funding status">
        <div class="endowment-desk__stat">
          <span class="endowment-desk__stat-label">Endowment</span>
          <span class="${endowMark}">${donated ? 'IN' : 'OUT'}</span>
        </div>
        <div class="endowment-desk__stat">
          <span class="endowment-desk__stat-label">Ideas funded</span>
          <span class="endowment-desk__stat-value">${fundedCount}/${UNIVERSITY_IDEA_CAP}</span>
        </div>
        <div class="endowment-desk__stat endowment-desk__stat--lead">
          <span class="endowment-desk__stat-label">Shop automation lock boost</span>
          <span class="endowment-desk__stat-value" data-endowment-boost-readout>${signedPct(boost)}</span>
          <span class="endowment-desk__stat-max">of ${signedPct(maxBoost)}</span>
          <span class="endowment-desk__stat-caption">Adds percentage points to every shop automation lock roll at settle. It affects neither yield nor nearby value.</span>
        </div>
        ${fundedCount >= UNIVERSITY_IDEA_CAP ? `
        <div class="endowment-desk__complete" data-endowment-complete>
          <span class="endowment-desk__mark endowment-desk__mark--in">CAMPUS DESK COMPLETE</span>
        </div>` : ''}
      </div>
`;
}

function universityDeskHtml(city, state) {
  const donated = Boolean(state?.university?.donated);
  const fundedIds = Array.isArray(state?.university?.funded) ? state.university.funded : [];
  const funded = new Set(fundedIds);
  const boost = state ? universityStartupBoostBp(state) : 0;
  const fundedCount = Math.min(UNIVERSITY_IDEA_CAP, fundedIds.length);

  let endowCluster = '';
  if (state && donated) {
    endowCluster = `
      <div class="endowment-desk__endow endowment-desk__endow--done">
        <span class="endowment-desk__mark endowment-desk__mark--in">ENDOWED</span>
        <span class="endowment-desk__paid">Paid ${money(UNIVERSITY_DONATE_COST)}</span>
      </div>`;
  } else if (state) {
    const donateCheck = canApplyAction(city, state, { type: 'university-donate' });
    endowCluster = `
      <div class="endowment-desk__endow">
        ${verbButton({
          verb: 'university-donate',
          family: 'university-donate',
          label: `Endow · ${money(UNIVERSITY_DONATE_COST)}`,
          check: donateCheck,
          available: `A cheque, no plaque. Same shove, thinner — ${moneyExact(UNIVERSITY_DONATE_COST)} · 1 action.`,
          hint: donateCheck.ok ? `${signedPct(UNIVERSITY_DONATE_STARTUP_BP)} lock chance` : '',
          className: 'verb--primary',
          hideReason: true,
        })}
        ${donateCheck.ok ? '' : `<p class="endowment-desk__reason" role="status">${escapeHtml(donateCheck.reason)}</p>`}
      </div>`;
  }

  let ideasHtml = '';
  if (donated && state) {
    ideasHtml = `<div class="endowment-desk__ideas">${universityIdeasFor(state).map((idea) => {
      if (funded.has(idea.id)) {
        return `
      <div class="endowment-idea endowment-idea--funded"
           data-endowment-idea="${escapeHtml(idea.id)}"
           data-endowment-idea-state="funded">
        <div class="endowment-idea__copy">
          <strong class="endowment-idea__name">${escapeHtml(idea.label)}</strong>
          <p class="endowment-idea__blurb">${escapeHtml(idea.blurb)}</p>
          <p class="endowment-idea__meta">${signedPct(UNIVERSITY_IDEA_STARTUP_BP)} lock · paid ${money(idea.cost)}</p>
        </div>
        <div class="endowment-idea__act">
          <span class="endowment-desk__mark endowment-desk__mark--in endowment-desk__mark--verb">FUNDED</span>
        </div>
      </div>`;
      }
      const check = canApplyAction(city, state, { type: 'university-fund', ideaId: idea.id });
      return `
      <div class="endowment-idea" data-endowment-idea="${escapeHtml(idea.id)}" data-endowment-idea-state="open">
        <div class="endowment-idea__copy">
          <strong class="endowment-idea__name">${escapeHtml(idea.label)}</strong>
          <p class="endowment-idea__blurb">${escapeHtml(idea.blurb)}</p>
          <p class="endowment-idea__meta">${signedPct(UNIVERSITY_IDEA_STARTUP_BP)} lock · ${money(idea.cost)} · 1 action</p>
        </div>
        <div class="endowment-idea__act">
          ${verbButton({
            verb: 'university-fund',
            family: 'university-fund',
            label: `Fund · ${money(idea.cost)}`,
            check,
            available: `Boost valuation locks — ${moneyExact(idea.cost)} · 1 action.`,
            hint: check.ok ? `${signedPct(UNIVERSITY_IDEA_STARTUP_BP)} lock chance` : '',
            className: 'verb--primary',
            hideReason: true,
            attrs: `data-idea-id="${escapeHtml(idea.id)}"`,
          })}
          ${check.ok ? '' : `<p class="endowment-desk__reason" role="status">${escapeHtml(check.reason)}</p>`}
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  return `
    <section class="card__section endowment-desk${donated ? ' endowment-desk--donated' : ''}${fundedCount >= UNIVERSITY_IDEA_CAP ? ' endowment-desk--complete' : ''}"
             data-card-section="endowment"
             data-endowment-desk
             ${donated ? '' : 'data-endowment-gate'}
             data-endowment-donated="${donated ? 'true' : 'false'}"
             data-endowment-funded="${fundedCount}"
             data-endowment-boost-bp="${boost}"
             aria-label="University campus funding">
      <p class="endowment-desk__payoff" data-civic-payoff>
        Only corner-shop ventures use this city-wide boost.
        It never lifts holdings without a venture.
      </p>
      ${endowCluster}
      ${donated && state ? ideasHtml : ''}
    </section>`;
}

function noticeVerbHtml(city, state, civic) {
  const rule = AVATAR_VENUE_SPENDS.notice;
  const avatar = state.avatars?.player;
  const until = avatar?.accessTokens?.[rule.token] ?? 0;
  const held = avatarHasAccess(avatar, rule.token, state.quarter);
  const action = {
    type: 'walk',
    avatarId: 'player',
    destination: { kind: 'civic', id: civic.id },
    purchase: null,
    brokerChoice: null,
  };
  const check = held
    ? { ok: false, reason: `Notice held through Q${until}` }
    : canApplyAction(city, state, action);
  const label = held
    ? `Notice through Q${until}`
    : `Notice · ${money(RULES[rule.costRule])}`;
  return verbButton({
    verb: 'walk-civic',
    family: 'walk',
    label,
    check,
    available: 'Collect the Notice token. — 1 action',
    hint: 'Exact event numbers · rest of run',
    className: 'verb--primary',
  });
}

/** Central reserve gift shop — furniture and terrain at Melbourne rates, no action. */
function reserveGiftHtml(city, state) {
  const favour = state.favour ?? 0;
  const favourMax = RULES.favourMax ?? 100;
  const lobbyBonus = favourLobbyBonusBp(favour);
  const costScale = favourCostScaleBp(favour);
  const worksOff = ((10000 - costScale) / 100).toFixed(1);
  const kit = state.reserveKit ?? { furniture: {}, terrain: {} };
  const rows = RESERVE_CATALOG.map((item) => {
    const owned = (item.kind === 'furniture' ? kit.furniture : kit.terrain)?.[item.id] ?? 0;
    const funds = state.cash >= item.cost;
    return `<div class="reserve-gift" data-reserve-gift="${item.id}">
      <div class="reserve-gift__copy">
        <strong>${escapeHtml(item.label)}</strong>
        <span class="reserve-gift__meta">${escapeHtml(item.blurb)} · +${item.favour} favour${owned ? ` · own ${owned}` : ''}</span>
      </div>
      <button type="button"
        class="verb verb--primary"
        data-verb="reserve-improve:${item.id}"
        ${funds ? '' : 'disabled'}
        title="${funds ? 'No action · cash only' : 'Need more cash'}">
        Gift · ${money(item.cost)}
      </button>
    </div>`;
  }).join('');
  return `
    <section class="card__section card__section--reserve" data-card-section="reserve-shop" aria-label="Reserve gifts">
      <div class="card__section-title">Civic gifts · no action</div>
      <p class="card__playbook-lead">Gifts build Favour. Favour improves planning odds and cuts fees.</p>
      <p class="card__owner-banner" role="status">
        FAVOUR ${favour}/${favourMax} · lobby +${(lobbyBonus / 100).toFixed(0)}% · works −${worksOff}%
      </p>
      <div class="reserve-gift-list">${rows}</div>
      <p class="card__contents">Tap reserve benches and trees for mischief. Gifts appear by the rotunda.</p>
    </section>
  `;
}

export const TENANT_QUALITY_ORDER = Object.freeze(['secure', 'standard', 'stretch']);
const TENANT_TERM_QUARTERS = 4;

function permitFormLabel(level) {
  return (PERMIT_LABELS[level] ?? `L${level}`).replace(/^L\d+\s+/, '');
}

export function archetypeRungLabel(archetypeId, permitLevel = null) {
  if (PERMIT_FINISH_ARCHETYPE[permitLevel] === archetypeId) {
    return permitFormLabel(permitLevel);
  }
  return (ARCHETYPES[archetypeId]?.label ?? archetypeId).split(',')[0].trim();
}

/** Uses rentFor with a neutral tenant to obtain the already-authoritative leaseable base. */
export function tenantQualityProjection(city, state, parcelId) {
  const projected = structuredClone(state);
  const status = projected.parcelStatus?.[parcelId];
  if (!status || !projected.holdings?.[parcelId]) return Object.freeze([]);
  const useId = archetypeIdOf(city, state, parcelId);
  const commercialMarket = franchiseUseMarket(useId);
  const order = commercialMarket ? COMMERCIAL_TENANT_ORDER : TENANT_QUALITY_ORDER;
  const termQuarters = commercialMarket ? COMMERCIAL_TENANT_TERM_QUARTERS : TENANT_TERM_QUARTERS;
  status.occupancy = 'tenant';
  status.tenant = {
    quality: 'standard',
    rentBp: 10000,
    arrearsChanceBp: 0,
    expiresAfterQuarter: state.quarter + termQuarters - 1,
    paymentAtRisk: false,
  };
  const leaseableRentBeforeTenant = rentFor(city, projected, parcelId);
  const feePerQuarter = Math.ceil(RULES.leaseFee / termQuarters);
  return Object.freeze(order.map((quality) => {
    const terms = commercialMarket
      ? COMMERCIAL_TENANT_TERMS[quality]
      : TENANT_TERMS[quality];
    const quotedGross = applyBp(leaseableRentBeforeTenant, terms.rentBp);
    const expectedCollected = applyBp(quotedGross, 10000 - terms.arrearsChanceBp);
    const expectedOpex = applyBp(expectedCollected, RULES.opexBp);
    return Object.freeze({
      quality,
      label: terms.label ?? `${quality} tenant`,
      commercial: Boolean(commercialMarket),
      quotedGross,
      rentBp: terms.rentBp,
      arrearsChanceBp: terms.arrearsChanceBp,
      termQuarters,
      evPerQuarter: expectedCollected - expectedOpex - feePerQuarter,
      anchorChanceBp: terms.anchorCandidate ? commercialMarket.anchorChanceBp : 0,
      bigBrandRentBp: terms.anchorCandidate ? commercialMarket.bigBrandRentBp : 10000,
    });
  }));
}

/** Isolates one holding, then asks the existing settlement preview to price its contribution. */
export function parcelSettlementContribution(city, state, parcelId, viewerSeatId = 'P1') {
  if (state.holdings?.[parcelId]?.ownerSeatId !== viewerSeatId) return 0;
  const projected = structuredClone(state);
  for (const id of Object.keys(projected.holdings).sort()) {
    if (projected.holdings[id].ownerSeatId === viewerSeatId && id !== parcelId) {
      delete projected.holdings[id];
    }
  }
  for (const eventId of [...(projected.events?.order ?? [])].sort()) {
    const event = projected.events.byId[eventId];
    if (event.type === 'auction') projected.events.byId[eventId] = { ...event, status: 'cancelled' };
  }
  projected.obligations = (projected.obligations ?? [])
    .filter((item) => item.kind !== 'auction');
  return settlementPreview(city, projected, 'player').net;
}

export function planningUnlockQuote(city, state, parcelId) {
  const holding = state.holdings?.[parcelId];
  if (!holding) return null;
  const projected = structuredClone(state);
  projected.holdings[parcelId].planningCeiling = Math.max(
    1,
    Number(projected.holdings[parcelId].planningCeiling) || 0,
  );
  return redevelopQuote(city, projected, parcelId);
}

export function divestItemisation(quote) {
  if (!quote) return Object.freeze([]);
  const lines = [
    { id: 'market-value', label: 'Market value', amount: quote.baseValue ?? quote.value },
    ...(quote.saleUplift > 0
      ? [{ id: 'terry-uplift', label: 'Terry sale uplift', amount: quote.saleUplift }]
      : []),
    { id: 'agent-fee', label: 'less agent fee', amount: -quote.fee },
    { id: 'debt-cleared', label: 'less debt cleared', amount: -quote.debtCleared },
    { id: 'net-cash', label: 'Net cash', amount: quote.proceeds },
  ];
  if (quote.surrender) {
    lines.push({
      id: 'debt-shortfall',
      label: 'Debt shortfall surrendered',
      amount: quote.shortfall,
    });
  }
  return Object.freeze(lines.map(Object.freeze));
}

function divestItemisationHtml(quote) {
  return `<div class="card__itemisation" data-divest-itemisation>
    ${divestItemisation(quote).map((line) =>
    row(line.label, moneyExact(line.amount), line.amount >= 0 ? 'gain' : 'loss')).join('')}
  </div>`;
}

function redevelopmentPreviewHtml(state, parcelId, quote, tenantExitPresent = false) {
  if (!quote) return '<p class="card__empty">No legal successor inside the current ceiling.</p>';
  const occupied = state.parcelStatus?.[parcelId]?.occupancy === 'tenant';
  const duration = quote.durationQuarters ?? 1;
  const stages = quote.residentialBuild
    ? CONSTRUCTION_STAGES.map((s) => `<span class="build-stage">${escapeHtml(s.short)}</span>`).join('<span class="build-stage__sep">→</span>')
    : '<span class="build-stage is-active">Works</span>';
  return `
    <div class="redevelop-preview" data-redevelop-preview>
      <strong class="redevelop-preview__title">${escapeHtml(ARCHETYPES[quote.fromArchetype].label)} → ${escapeHtml(redevelopDestLabel(quote))}</strong>
      <div class="redevelop-preview__facts">
        <span>L${quote.level}→L${quote.nextLevel}</span>
        <span>${duration}q · Q${quote.completionQuarter ?? state.quarter + duration}</span>
        <span>${money(quote.cost)}</span>
        <span>${(quote.defectChanceBp / 100).toFixed(0)}% defect</span>
      </div>
      <div class="build-progress__stages redevelop-preview__stages">${stages}</div>
      ${occupied && !tenantExitPresent ? '<p class="card__status-stamp" role="status">Tenanted — notice or buy out first</p>' : ''}
    </div>
  `;
}

export function archetypeThumbSrc(archetypeId) {
  // Rooted, not relative: this src is also consumed through a CSS custom property,
  // and url() inside a var() resolves against the stylesheet path, not the document.
  return `/assets/img/ui-plates/archetypes/${encodeURIComponent(archetypeId)}.png`;
}

function redevelopDestLabel(quote) {
  if (quote?.fromArchetype === 'hammerbarn' && quote?.toArchetype === 'hammerbarn') {
    return 'Two-storey Hammerbarn';
  }
  return ARCHETYPES[quote?.toArchetype]?.label ?? quote?.toArchetype ?? '—';
}

/** Full planning ladder for the picker. Each rung quotes at its own ceiling so a raised
 *  permit cannot collapse two rungs onto one finish form (r5 R5-2). */
export function redevelopLadder(city, state, parcelId) {
  const holding = state.holdings?.[parcelId];
  const parcel = activeParcel(city, state, parcelId);
  if (!holding || !parcel) return [];
  const level = levelOf(state, parcelId);
  const currentId = archetypeIdOf(city, state, parcelId);
  const ceiling = holding.planningCeiling ?? 0;
  const siteMax = maxPermitLevelFor(parcel, holding);
  let top = Math.min(RULES.maxLevel, Math.max(siteMax, ceiling, level));
  if (currentId === 'hammerbarn') top = Math.min(top, Math.max(1, level));
  const vacantPad = Boolean(parcel.consolidated && level === 0 && !holding.construction);
  const rungs = [{
    key: `L${level}`,
    level,
    archetypeId: vacantPad ? null : currentId,
    current: true,
    locked: false,
    sameForm: false,
    quote: null,
    vacantPad,
  }];
  for (let nextLevel = level + 1; nextLevel <= top; nextLevel += 1) {
    const projected = structuredClone(state);
    projected.holdings[parcelId] = {
      ...projected.holdings[parcelId],
      planningCeiling: nextLevel,
    };
    const quote = redevelopQuote(city, projected, parcelId);
    // The holding rides along for the same reason `economy.js redevelopQuote` passes it: an
    // approved change-of-use permit lives there, and it OVERRIDES the height finish. Omitting it
    // here while `redevelopQuote` passes it would make this preview name a form the build does
    // not produce — the rung would read "Low-rise office" and the works would raise a data centre.
    // Both call sites take the holding, or the button lies about what it does.
    const finish = parcel.consolidated
      ? (quote?.toArchetype ?? null)
      : currentId === 'hammerbarn'
        ? 'hammerbarn'
        : (redevelopFinishArchetype(currentId, nextLevel, parcel, holding)
          ?? PERMIT_FINISH_ARCHETYPE[nextLevel]
          ?? quote?.toArchetype
          ?? null);
    const prevId = rungs[rungs.length - 1]?.archetypeId;
    const sameForm = Boolean(finish && finish === prevId);
    if (!finish) continue;
    if (sameForm && !(currentId === 'hammerbarn' && nextLevel === 1)) continue;
    rungs.push({
      key: `L${nextLevel}`,
      level: nextLevel,
      archetypeId: finish,
      current: false,
      locked: nextLevel > ceiling || !quote,
      sameForm,
      label: currentId === 'hammerbarn' && nextLevel === 1 ? 'Two-storey Hammerbarn' : undefined,
      quote,
    });
  }
  return rungs;
}

export function redevelopPickerHtml(
  city,
  state,
  parcelId,
  liveQuote = null,
  tenantExitPresent = false,
) {
  const rungs = redevelopLadder(city, state, parcelId);
  if (!rungs.length) return '<p class="card__empty">No planning ladder on this parcel.</p>';
  const occupied = state.parcelStatus?.[parcelId]?.occupancy === 'tenant';
  const showWorksPrices = !occupied;
  const holding = state.holdings?.[parcelId];
  const currentLevel = rungs.find((rung) => rung.current)?.level ?? 0;
  const vacantNow = rungs.some((rung) => rung.vacantPad);
  const nextRung = rungs.find((rung) =>
    !rung.current
      && !rung.locked
      && (liveQuote?.toArchetype === rung.archetypeId || liveQuote?.nextLevel === rung.level))
    ?? rungs.find((rung) => !rung.current && !rung.locked)
    ?? null;
  const bidRung = vacantNow ? nextRung : null;
  // Keep the armed destination visible through tenancy. Occupancy blanks money only;
  // the target rung, duration, and footprint remain useful before the exit completes.
  const targetRung = !vacantNow ? nextRung : null;
  const targetQuote = (targetRung ?? bidRung)?.quote ?? null;
  const targetArch = targetRung?.archetypeId ? ARCHETYPES[targetRung.archetypeId] : null;
  const parcel = activeParcel(city, state, parcelId);
  const padTiles = parcel?.tiles?.length ?? 1;
  const foot = parcel?.consolidated
    ? [1, Math.max(2, padTiles)]
    : (targetArch?.footprint ?? [1, 1]);
  const footW = Number(foot[0]) || 1;
  const footD = Number(foot[1]) || 1;
  const footCap = parcel?.consolidated ? '1 × 2' : `${footW} × ${footD}`;
  const committedId = holding?.construction?.toArchetype ?? null;

  const strip = rungs.map((rung, index) => {
    const arch = rung.archetypeId ? ARCHETYPES[rung.archetypeId] : null;
    const label = rung.label
      ?? (rung.archetypeId ? archetypeRungLabel(rung.archetypeId, rung.level) : null)
      ?? arch?.label
      ?? rung.archetypeId
      ?? '—';
    const quote = rung.quote;
    const isTarget = targetRung && rung.level === targetRung.level && !rung.current;
    const behind = rung.level < currentLevel;
    const isBid = vacantNow && bidRung && rung.level === bidRung.level && !rung.current;
    const cls = [
      'redevelop-picker__card',
      rung.current ? 'is-current' : '',
      rung.locked ? 'is-locked' : '',
      isTarget ? 'is-target' : '',
      isBid ? 'is-bid' : '',
      behind ? 'is-behind' : '',
      committedId && committedId === rung.archetypeId ? 'is-committed' : '',
    ].filter(Boolean).join(' ');
    const thumb = rung.vacantPad
      ? `<img class="redevelop-picker__thumb redevelop-picker__thumb--pad" src="assets/img/ui-icons/verb-merge.png"
           alt="Vacant 1×2 pad" width="512" height="288" loading="lazy">`
      : rung.archetypeId
        ? `<img class="redevelop-picker__thumb" data-archetype-thumb="${escapeHtml(rung.archetypeId)}"
           src="${archetypeThumbSrc(rung.archetypeId)}" alt="${escapeHtml(label)}"
           width="512" height="384" loading="lazy">`
        : '<div class="redevelop-picker__thumb redevelop-picker__thumb--empty" aria-hidden="true"></div>';
    const chevron = isTarget && !rung.current
      ? '<span class="redevelop-picker__chevron" aria-hidden="true">▸</span>'
      : '';
    const padlock = rung.locked
      ? '<span class="redevelop-picker__padlock" title="Lobby to unlock"></span>'
      : '';
    const stamp = committedId && committedId === rung.archetypeId
      ? '<span class="redevelop-picker__stamp" aria-hidden="true"></span>'
      : '';
    return `
      ${index > 0 && isTarget ? chevron : ''}
      <article class="${cls}" data-redevelop-rung="${rung.level}"
               data-to-archetype="${escapeHtml(rung.archetypeId ?? '')}"
               data-locked="${rung.locked ? '1' : '0'}">
        ${padlock}
        ${stamp}
        ${rung.current ? '<span class="redevelop-picker__now">NOW</span>' : ''}
        ${thumb}
        <span class="redevelop-picker__level">${rung.vacantPad ? 'PAD' : `L${rung.level}`}</span>
        <span class="redevelop-picker__cost">${(rung.current || rung.locked || !showWorksPrices) ? '—' : (quote ? money(quote.cost) : '—')}</span>
      </article>
    `;
  }).join('');

  const specDelta = targetQuote ? targetQuote.valueAfter - targetQuote.valueNow : 0;

  return `
    <div class="redevelop-picker redevelop-picker--strip" data-redevelop-picker>
      <span class="permit-form-strip__caption" data-permit-form-caption>BUILD</span>
      <div class="redevelop-picker__strip" role="list">
        ${strip}
      </div>
      <div class="redevelop-picker__spec">
        <div class="redevelop-picker__well">
          <span class="redevelop-picker__well-k">${vacantNow ? 'Now' : 'Cost'}</span>
          <span class="redevelop-picker__well-v">${vacantNow
            ? 'Vacant 1×2'
            : !showWorksPrices
              ? '—'
              : (targetQuote ? money(targetQuote.cost) : '—')}</span>
        </div>
        <div class="redevelop-picker__well">
          <span class="redevelop-picker__well-k">${vacantNow ? 'Bid' : 'Quarters'}</span>
          <span class="redevelop-picker__well-v">${vacantNow
            ? (targetQuote ? money(targetQuote.cost) : '—')
            : (targetQuote ? `${targetQuote.durationQuarters ?? 1} qtr` : '—')}</span>
        </div>
        <div class="redevelop-picker__well">
          <span class="redevelop-picker__well-k">${vacantNow ? 'Build' : 'Value after'}</span>
          <span class="redevelop-picker__well-v">${vacantNow
            ? (targetQuote ? `${targetQuote.durationQuarters ?? 1} qtr` : '—')
            : !showWorksPrices
              ? '—'
              : (targetQuote ? money(targetQuote.valueAfter) : '—')}</span>
          ${vacantNow || !showWorksPrices ? '' : `<span class="redevelop-picker__delta">${targetQuote ? signedMoney(specDelta) : ''}</span>`}
        </div>
        <div class="redevelop-picker__well redevelop-picker__well--foot" aria-label="Footprint">
          <span class="redevelop-picker__well-k">Footprint</span>
          <span class="redevelop-picker__well-v redevelop-picker__foot-cap">${footCap}</span>
        </div>
      </div>
      ${occupied && !tenantExitPresent ? '<p class="card__status-stamp" role="status">Tenanted — notice or buy out first</p>' : ''}
    </div>
  `;
}

function personIsWorking(person, state) {
  return Object.values(state.holdings ?? {}).some((holding) => {
    if (holding.hire?.personId === person.id) return true;
    return Object.values(holding.hires ?? {}).some((contract) => contract?.personId === person.id);
  });
}

function personWorkMeta(person, state) {
  const found = Object.entries(state.holdings ?? {}).find(([, holding]) => {
    if (holding.hire?.personId === person.id) return true;
    return Object.values(holding.hires ?? {}).some((contract) => contract?.personId === person.id);
  });
  const parcelId = found?.[0] ?? null;
  const holding = found?.[1] ?? null;
  const job = holding?.construction;
  if (job) {
    const duration = Math.max(1, job.durationQuarters ?? 1);
    const elapsed = Math.max(0, state.quarter - (job.startedQuarter ?? state.quarter));
    const pct = Math.min(99, Math.round(((elapsed + 0.4) / duration) * 100));
    return {
      site: (parcelId ?? 'parcel').toUpperCase(),
      label: `Building ${ARCHETYPES[job.toArchetype]?.label ?? job.toArchetype}`,
      jobLine: ARCHETYPES[job.toArchetype]?.label ?? 'Works',
      pct,
    };
  }
  if (holding?.renovation) {
    return {
      site: (parcelId ?? 'parcel').toUpperCase(),
      label: 'Renovating',
      jobLine: 'Renovation',
      pct: 45,
    };
  }
  return {
    site: parcelId ? parcelId.toUpperCase() : String(person.toAnchor?.id ?? 'PARCEL').toUpperCase(),
    label: 'On parcel',
    jobLine: roleStamp(personRole(person.archetypeId, person)),
    pct: 20,
  };
}

function personSiteCamHtml(person, state) {
  const id = person.archetypeId;
  const name = PERSON_LABELS[id] ?? id;
  const hasWork = PERSON_WORK_ROLES.has(id);
  if (!hasWork || !personIsWorking(person, state)) return '';
  return `
    <div class="card__sitecam" data-person-sitecam>
      <video class="card__cast-work is-live" muted loop autoplay playsinline
             poster="assets/img/people/${id}-work.png"
             src="assets/img/people/${id}-work.mp4"
             aria-label="${escapeHtml(name)} works cam"></video>
      <span class="media-bezel" aria-hidden="true"></span>
      <span class="card__cast-sitecam-tag">Works cam</span>
    </div>`;
}

function personStageHtml(person, state) {
  const id = person.archetypeId;
  const name = personLabel(id, person);
  const portrait = personPortraitSrc(id, person.identityId ?? 0);
  const working = personIsWorking(person, state);
  return `
    <div class="card__cast-media card__cast-media--bust${working ? ' is-working' : ''}"
         data-person-stage>
      <img class="card__cast-bust" src="${portrait}"
           alt="${escapeHtml(name)}" width="512" height="640">
      <span class="media-bezel" aria-hidden="true"></span>
      <button class="card__cast-replay" type="button" hidden>Replay</button>
    </div>
  `;
}

function constructionProgressHtml(state, holding) {
  const job = holding?.construction;
  if (!job) return '';
  const stage = constructionStage(job, state.quarter);
  const duration = Math.max(
    1,
    job.durationQuarters
      ?? ((job.completionQuarter ?? state.quarter) - (job.startedQuarter ?? state.quarter)),
  );
  const elapsed = Math.max(0, state.quarter - (job.startedQuarter ?? state.quarter));
  const progress = Math.min(1, (elapsed + 0.5) / duration);
  const pct = Math.round(progress * 100);
  const completionQ = Number(stage?.completionQuarter ?? job.completionQuarter);
  const remainingRaw = stage?.remainingQuarters;
  const remaining = Number.isFinite(remainingRaw)
    ? remainingRaw
    : Number.isFinite(completionQ)
      ? Math.max(0, completionQ - state.quarter)
      : Math.max(0, duration - elapsed);
  const stages = job.residentialBuild || duration >= 4
    ? CONSTRUCTION_STAGES.map((s, i) => {
      const cls = i < (stage?.index ?? 0)
        ? 'is-done'
        : i === (stage?.index ?? 0)
          ? 'is-active'
          : '';
      return `<li class="build-stage ${cls}" title="${escapeHtml(s.description)}">
        <span class="build-stage__dot" aria-hidden="true"></span>
        <span class="build-stage__label">${escapeHtml(s.short)}</span>
      </li>`;
    }).join('')
    : `<li class="build-stage is-active"><span class="build-stage__dot"></span><span class="build-stage__label">Works</span></li>`;
  const accident = job.accidentOccurred
    ? `<p class="build-progress__accident" role="status">Works accident · +1q · finishes Q${job.completionQuarter}</p>`
    : '';
  return `
    <div class="build-progress" data-build-progress>
      <div class="build-progress__head">
        <div>
          <strong>${escapeHtml(stage?.label ?? 'Works underway')}</strong>
          <p class="build-progress__desc">${escapeHtml(stage?.short ?? 'Works')} · ${escapeHtml(ARCHETYPES[job.toArchetype]?.label ?? 'building')}</p>
        </div>
        <span class="build-progress__pct">${pct}%</span>
      </div>
      <div class="build-progress__bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <span class="build-progress__bar-fill" style="width:${pct}%"></span>
      </div>
      <ol class="build-progress__stages" aria-label="Works stages">${stages}</ol>
      <div class="build-progress__facts">
        <span>Done <strong>Q${Number.isFinite(completionQ) ? completionQ : (job.startedQuarter ?? state.quarter) + duration}</strong></span>
        <span><strong>${remaining}</strong> q left</span>
        <span>${escapeHtml(ARCHETYPES[job.toArchetype]?.label ?? job.toArchetype)}</span>
        <span>Rent <strong>$0</strong></span>
      </div>
      ${accident}
    </div>
  `;
}

function tenantExitChoiceHtml(city, state, parcelId) {
  const exits = redevelopmentExitQuote(city, state, parcelId);
  if (!exits) return '<p class="card__empty">No legal tenant exit quote.</p>';
  const noticeCheck = canApplyAction(city, state, { type: 'redevelop:notice', parcelId });
  const buyoutCheck = canApplyAction(city, state, { type: 'redevelop:buyout', parcelId });
  return `
    <div class="tenant-exit-sheet tenant-exit-sheet--chip-strip" data-tenant-exit-sheet>
      <div class="tenant-exit-sheet__copy">
        <strong class="tenant-exit-sheet__title">Tenanted · notice or buy out</strong>
      </div>
      ${verbButton({
    verb: 'redevelop:notice',
    family: 'redevelop',
    label: `Notice ${moneyExact(exits.notice.cashOut)} · Vacant after one quarter`,
    key: '',
    check: noticeCheck,
    className: 'verb--secondary verb--notice',
    available: 'Half rent this quarter · vacant after one full quarter',
  })}
      ${verbButton({
    verb: 'redevelop:buyout',
    family: 'redevelop',
    label: `Buy out ${moneyExact(exits.buyout.cashOut)} · Vacant now`,
    check: buyoutCheck,
    className: 'verb--secondary verb--notice',
    available: 'Pay the tenant; the holding is vacant now — 1 action.',
  })}
    </div>
  `;
}

function roomConditionLabel(defect) {
  if (defect >= 70) return 'Very worn';
  if (defect >= 50) return 'Worn';
  if (defect >= 30) return 'Tired';
  if (defect >= 10) return 'OK';
  return 'Good';
}

function roomFinishDisplayName(finish) {
  if (finish === 'luxury') return 'Art deco';
  if (finish === 'deluxe') return 'Deluxe';
  if (finish === 'basic') return 'Basic';
  if (finish === 'tired' || !finish) return 'Tired';
  return finish;
}

function worksOverlayHtml(state, holding) {
  const job = holding?.construction;
  const reno = holding?.renovation;
  if (!job && !reno) return '';
  const duration = Math.max(
    1,
    job?.durationQuarters
      ?? ((job?.completionQuarter ?? state.quarter) - (job?.startedQuarter ?? state.quarter))
      ?? 1,
  );
  const elapsed = Math.max(0, state.quarter - (job?.startedQuarter ?? reno?.startedQuarter ?? state.quarter));
  const pct = Math.min(99, Math.round(((elapsed + 0.4) / duration) * 100));
  const stage = job ? constructionStage(job, state.quarter) : null;
  const target = job ? (ARCHETYPES[job.toArchetype]?.label ?? job.toArchetype) : 'Renovation';
  const short = stage?.short ?? 'Reno';
  return `
    <div class="works-overlay" data-works-overlay>
      <span class="works-overlay__stamp" aria-hidden="true"></span>
      <span class="works-overlay__label">Under works</span>
      <span class="works-overlay__pct">${pct}% · ${escapeHtml(short)} · ${escapeHtml(target)}</span>
    </div>`;
}

function roomPolaroidHtml(city, state, parcelId) {
  const holding = state.holdings?.[parcelId];
  const underWorks = Boolean(holding?.renovation || holding?.construction);
  const rooms = state.parcelStatus?.[parcelId]?.rooms;
  void rooms;
  const finishes = state.parcelStatus?.[parcelId]?.roomFinish ?? {};
  const pendingJobs = holding ? roomJobs(holding) : [];
  const focusJob = pendingJobs[pendingJobs.length - 1] ?? null;
  const focusRoom = focusJob?.roomId ?? 'kitchen';
  const focusFinish = focusJob?.finish ?? finishes[focusRoom] ?? 'tired';
  const targetId = holding?.construction?.toArchetype ?? holding?.archetypeId;
  const previewSrc = underWorks && holding?.construction
    ? archetypeThumbSrc(targetId)
    : roomPreviewSrc(focusRoom, focusFinish || 'tired');
  const stage = holding?.construction ? constructionStage(holding.construction, state.quarter) : null;
  const captionTitle = underWorks
    ? (ARCHETYPES[targetId]?.label ?? 'Works')
    : focusRoom;
  const captionSub = underWorks
    ? `${stage?.short ?? 'Works'} · building`
    : roomPreviewCaption(focusFinish, finishes[focusRoom] ?? 'tired', focusJob?.finish, focusJob?.completionQuarter, roomFinishDisplayName);
  return `
    <aside class="room-preview-rail room-polaroid room-polaroid--plate" data-room-rail aria-label="${underWorks ? 'Building preview illustration' : 'Room finish illustration'}">
      <img class="room-preview-rail__img" data-room-preview-img src="${escapeHtml(previewSrc)}"
           alt="${escapeHtml(captionTitle)} ${underWorks ? 'building preview illustration' : 'finish illustration'}" />
      ${worksOverlayHtml(state, holding)}
      <div class="room-preview-rail__caption">
        <strong data-room-preview-title>${escapeHtml(String(captionTitle).replace(/-/g, ' ').toUpperCase())}</strong>
        <span data-room-preview-sub>ILLUSTRATION · ${escapeHtml(String(captionSub).toUpperCase())}</span>
      </div>
    </aside>`;
}

export function roomRenovateSheetHtml(city, state, parcelId) {
  state = { ...state, parcelStatus: { ...state.parcelStatus, [parcelId]: { ...state.parcelStatus[parcelId] } } };
  ensureRoomState(city, state, parcelId);
  const rooms = state.parcelStatus[parcelId].rooms;
  const finishes = state.parcelStatus[parcelId].roomFinish ?? {};
  const band = suburbBand(activeParcel(city, state, parcelId)?.districtId);
  const holding = state.holdings[parcelId];
  const pendingJobs = roomJobs(holding);
  const focusJob = pendingJobs[pendingJobs.length - 1] ?? null;
  const focusRoom = focusJob?.roomId ?? 'kitchen';
  const focusFinish = focusJob?.finish
    ?? finishes[focusRoom]
    ?? 'tired';

  const condTone = (condition) => {
    if (condition === 'Very worn' || condition === 'Worn') return 'is-worn';
    if (condition === 'Tired') return 'is-tired';
    if (condition === 'OK') return 'is-ok';
    return 'is-good';
  };
  const pendingTotal = pendingJobs.reduce((sum, job) => sum + (job.cost ?? job.valueAdd ?? 0), 0);
  const rows = ROOM_IDS.map((roomId) => {
    const defect = roomDefectPct(rooms, roomId);
    const currentFinish = finishes[roomId] || 'tired';
    const condition = roomConditionLabel(defect);
    const job = pendingRoomJob(holding, roomId);
    const thumb = roomPreviewSrc(roomId, job?.finish || currentFinish);
    const focused = roomId === focusRoom ? ' is-focused' : '';
    if (job) {
      const finishName = roomFinishDisplayName(job.finish);
      return `<div class="room-reno-row room-reno-row--pending${focused}" data-room="${roomId}" data-room-hover="${roomId}" data-finish-hover="${escapeHtml(job.finish)}" data-current-finish="${escapeHtml(currentFinish)}" data-queued-finish="${escapeHtml(job.finish)}" data-completion-quarter="${job.completionQuarter}">
        <img class="room-reno-row__thumb" src="${escapeHtml(thumb)}" alt="">
        <div>
          <div class="room-reno-row__meta">
            <span class="room-reno-row__name">${escapeHtml(roomId)}</span>
            <span class="room-reno-row__condition is-pending">${escapeHtml(finishName)} · queued</span>
          </div>
          <p class="room-reno-row__now">Current ${escapeHtml(roomFinishDisplayName(currentFinish))} · finishes when Q${job.completionQuarter} settles · +${money(job.valueAdd)} value</p>
        </div>
      </div>`;
    }
    const finishBtns = FINISH_LEVELS.map((finish) => {
      const q = roomRenovateQuote(city, state, parcelId, roomId, finish);
      const check = canRenovateRoom(city, state, parcelId, roomId, finish);
      const finishLabel = roomFinishDisplayName(finish);
      return verbButton({
        verb: `renovate-room:${roomId}:${finish}`,
        family: 'renovate-room',
        label: `${finish === currentFinish ? 'Repeat ' : ''}${finishLabel}`.toUpperCase(),
        check,
        className: `verb--secondary verb--room-finish verb--finish-${finish}`,
        available: q ? `${finishLabel} · ${roomCommitCopy(q)}` : finishLabel,
        hint: [roomCommitCopy(q), roomConditionConsequence(q)].filter(Boolean).join(' · '),
        attrs: `data-room-hover="${roomId}" data-finish-hover="${finish}"`,
      });
    }).join('');
    const finishName = roomFinishDisplayName(currentFinish);
    const lastRenew = roomWorkHistory(state, parcelId, roomId, currentFinish);
    const nextFinish = currentFinish === 'luxury' ? 'luxury' : (currentFinish === 'deluxe' ? 'luxury' : 'basic');
    const nextQuote = roomRenovateQuote(city, state, parcelId, roomId, nextFinish);
    const uplift = nextQuote?.valueAdd ? `${nextFinish === currentFinish ? 'Repeat' : 'Offer'} ${roomFinishDisplayName(nextFinish)} +${money(nextQuote.valueAdd)}` : '—';
    return `<div class="room-reno-row${focused}" data-room="${roomId}" data-room-hover="${roomId}" data-finish-hover="${escapeHtml(currentFinish)}" data-current-finish="${escapeHtml(currentFinish)}">
      <img class="room-reno-row__thumb" src="${escapeHtml(thumb)}" alt="">
      <div>
        <div class="room-reno-row__meta">
          <span class="room-reno-row__name">${escapeHtml(roomId)}</span>
          <span class="room-reno-row__condition ${condTone(condition)}">Condition ${rooms[roomId]}/100</span>
        </div>
        <p class="room-reno-row__facts">
          <span>${escapeHtml(String(finishName).toUpperCase())}</span>
          <span>${escapeHtml(String(lastRenew).toUpperCase())}</span>
          <span class="money">${escapeHtml(uplift)}</span>
        </p>
        <div class="room-reno-row__verbs" role="group" aria-label="Upgrade ${escapeHtml(roomId)}">${finishBtns}</div>
      </div>
    </div>`;
  }).join('');

  const foot = `<div class="room-reno-sheet__foot" data-rooms-total>
        <span class="room-reno-sheet__total">TOTAL <span class="money">${escapeHtml(pendingJobs.length ? money(pendingTotal) : '$0')}</span>${pendingJobs.length ? ` · ${pendingJobs.length} queued` : ''}</span>
        <span class="room-reno-sheet__commit-note">Finish buttons commit that room</span>
      </div>`;
  return `<div class="room-reno-layout" data-room-reno data-room-focus="${escapeHtml(focusRoom)}" data-room-finish="${escapeHtml(focusFinish || 'tired')}">
    <div class="room-reno-sheet">
      <p class="room-reno-sheet__band">
        <span class="room-reno-sheet__badge">${escapeHtml(suburbBandLabel(band).toUpperCase())} SUBURB</span>
        <span class="room-reno-sheet__guide">FINISH BUTTONS ORDER WORK · CASH NOW · NO ACTION</span>
      </p>
      <div class="room-reno-list">
      <div class="room-reno-cols" aria-hidden="true">
        <span class="room-reno-cols__pad"></span>
        <span>Finish</span>
        <span>Work history</span>
        <span>Quoted value lift</span>
      </div>
      <div class="room-reno-sheet__scroll">
        ${rows}
      </div>
      </div>
      ${foot}
    </div>
  </div>`;
}

// Deluxe uses former luxury plates; luxury is futuristic art-deco (new plates).
const ROOM_PREVIEW = Object.freeze({
  kitchen: {
    tired: 'assets/img/room-upgrades/kitchen-tired.jpg',
    basic: 'assets/img/room-upgrades/kitchen-basic-v4.jpg',
    deluxe: 'assets/img/room-upgrades/kitchen-luxury.jpg',
    luxury: 'assets/img/room-upgrades/kitchen-artdeco.jpg',
  },
  bathroom: {
    tired: 'assets/img/room-upgrades/bathroom-tired.jpg',
    basic: 'assets/img/room-upgrades/bathroom-basic.jpg',
    deluxe: 'assets/img/room-upgrades/bathroom-luxury.jpg',
    luxury: 'assets/img/room-upgrades/bathroom-artdeco.jpg',
  },
  bedroom: {
    tired: 'assets/img/room-upgrades/bedroom-tired.jpg',
    basic: 'assets/img/room-upgrades/bedroom-basic.jpg',
    deluxe: 'assets/img/room-upgrades/bedroom-luxury.jpg',
    luxury: 'assets/img/room-upgrades/bedroom-artdeco.jpg',
  },
  living: {
    tired: 'assets/img/room-upgrades/living-tired.jpg',
    basic: 'assets/img/room-upgrades/living-basic.jpg',
    deluxe: 'assets/img/room-upgrades/living-luxury.jpg',
    luxury: 'assets/img/room-upgrades/living-artdeco.jpg',
  },
});

function roomPreviewSrc(roomId, finish = 'tired') {
  const pack = ROOM_PREVIEW[roomId] ?? ROOM_PREVIEW.kitchen;
  const key = finish && pack[finish] ? finish : 'tired';
  // Fall back to kitchen stills until every room has dedicated plates.
  return pack[key] ?? ROOM_PREVIEW.kitchen[key] ?? ROOM_PREVIEW.kitchen.tired;
}

function creditQuoteText(quote) {
  if (!quote) return '';
  return `cash ${moneyExact(quote.ordinaryCash)} · overdraft ${moneyExact(quote.availableOverdraft)}. `
    + `Auction reserve ${moneyExact(quote.reservedForAuction)} · cash after ${moneyExact(quote.postActionCash)}.`;
}

/** Compact one-line consequence for card action row (pre-commit). */
function cashAfterHint(quote) {
  if (!quote || !Number.isInteger(quote.postActionCash)) return '';
  return `cash after ${money(quote.postActionCash)}`;
}

export function tenantSheetHtml(city, state, parcelId) {
  const rows = tenantQualityProjection(city, state, parcelId);
  const commercial = rows.some((item) => item.commercial);
  const damaged = Boolean(state.parcelStatus?.[parcelId]?.damage);
  const operatorLine = 'Operators pay more as covenant risk rises; an anchor bid can land a big brand.';
  const damagedLead = `Rent is $0 while damaged. A lease signed now costs the ${moneyExact(RULES.leaseFee)} fee and 1 action, and it pays only for the term left once RENOVATION finishes.`;
  // COPY-DRAFT: a damaged commercial holding keeps the operator line after the damage sentence.
  const lead = damaged
    ? `${damagedLead}${commercial ? ` ${operatorLine}` : ''}`
    : `Lease starts rent — ${moneyExact(RULES.leaseFee)} fee · 1 action. ${commercial ? operatorLine : 'Safer tenants pay less and miss less.'}`;
  return `<div class="tenant-sheet" data-tenant-quality-sheet>
    <p class="card__playbook-lead">${lead}</p>
    ${rows.map((item) => {
    const check = canApplyAction(city, state, {
      type: 'lease',
      parcelId,
      tenantQuality: item.quality,
    });
    return `<div class="tenant-sheet__row" data-tenant-quality="${item.quality}"${item.commercial ? ` data-commercial-tenant="${item.quality}"` : ''}>
      <div>
        <strong>${escapeHtml(item.label)}</strong>
        <span>${moneyExact(item.quotedGross)} gross · ${(item.rentBp / 10000).toFixed(2)}× rent</span>
        <span>${damaged ? `${(item.arrearsChanceBp / 100).toFixed(1)}% arrears · ${item.termQuarters}q term · ` : ''}EV/qtr ${moneyExact(item.evPerQuarter)}${item.anchorChanceBp ? ` · ${(item.anchorChanceBp / 100).toFixed(0)}% BIG BRAND roll` : ''}</span>
      </div>
      ${verbButton({
        verb: `lease:${item.quality}`,
        family: 'lease',
        label: `${item.label} · ${money(item.quotedGross)}/q`,
        key: 'K',
        check,
        available: damaged
          ? `Rent stays $0 while damaged. — ${moneyExact(RULES.leaseFee)} fee · 1 action`
          : `Lease starts rent with ${item.label.toLowerCase()}. — ${moneyExact(RULES.leaseFee)} fee · 1 action`,
        hint: damaged
          ? `$0 while damaged · ${item.termQuarters}q term`
          : `${(item.arrearsChanceBp / 100).toFixed(0)}% arrears · ${item.termQuarters}q term`,
      })}
    </div>`;
  }).join('')}
  </div>`;
}

export function ventureBurnChipText(seed, parcelId, quarter) {
  return `BURN ${money(startupBurnForQuarter(seed, parcelId, quarter))} · UNTIL TERM`;
}

export function ventureShapeHtml(venture, context = {}) {
  if (!venture) return '';
  const valued = venture.status === 'valued';
  const banner = valued
    ? `${venture.label} · PE bid ${money(venture.valuation)} · trade sale ready`
    : venture.label;
  const burn = !valued && context.seed != null && context.parcelId != null && context.quarter != null
    ? startupBurnForQuarter(context.seed, context.parcelId, context.quarter)
    : (venture.burnMin ?? 50_000);
  const burnChip = `BURN ${money(burn)} · UNTIL TERM`;
  const plates = valued
    ? `${statChip('DRIFT UP', '· +10%')}${statChip('DRIFT DOWN', '· −20%')}`
    : `${statChip('UNVALUED', '· AT SETTLE')}<div class="stat-chip" data-venture-burn="${burn}" aria-label="${escapeHtml(burnChip)}"><span class="stat-chip__k">BURN ${money(burn)}</span><span class="stat-chip__v">· UNTIL TERM</span></div>`;
  const reveal = valued
    ? 'It can re-rate. Markets happen.'
    : 'Backers circle at settle. The burn is real until the term sheet.';
  return `<section class="card__venture-model" data-venture-shape data-venture="${escapeHtml(venture.id)}">
    <p class="card__owner-banner" role="status">${escapeHtml(banner)}</p>
    <div class="card__venture-plates" aria-label="Venture status">
      ${plates}
    </div>
    <p class="card__reveal-copy">${escapeHtml(reveal)}</p>
  </section>`;
}

export function commercialAnchorPlateHtml(anchorMark, tenant) {
  if (!anchorMark || !tenant?.anchor?.landed) return '';
  return `<section class="card__venture-model card__anchor-model" data-commercial-anchor data-brand="${escapeHtml(anchorMark.brand)}">
    <p class="card__owner-banner" role="status">BIG BRAND · ${escapeHtml(anchorMark.brand)}</p>
    <div class="card__venture-plates" aria-label="Franchise anchor status">
      ${statChip('ANCHOR RENT', `${money(anchorMark.quarterlyRent)} / QTR`)}
      ${statChip('INVESTOR BID', `CAP ${pct(anchorMark.capRateBp, 2)}/q`)}
    </div>
  </section>`;
}

export function surveyDossierHtml(intel, condition, quote) {
  const tier = SURVEY_DEFECT_TIERS[intel?.defectTier] ?? SURVEY_DEFECT_TIERS.none;
  const askingPlate = tier.discountBp > 0
    ? `Asking ${moneyExact(quote.askingBeforeDiscount)} · defects −${moneyExact(quote.defectDiscount)} · deed ${moneyExact(quote.price)}`
    : `Asking ${moneyExact(quote.price)} · no defects`;
  return `<section class="card__survey-dossier" data-survey-dossier data-defect-tier="${tier.id}">
    <div class="card__section-title">Survey dossier</div>
    <div class="card__survey-plates" aria-label="Survey reveal">
      ${statChip('Condition', conditionLabel(intel?.condition ?? condition))}
      ${statChip('Defects', tier.label)}
      ${statChip('Flood exposure', pct(intel.floodExposureBp))}
      ${statChip('Fire exposure', pct(intel.fireExposureBp))}
    </div>
    <p class="card__asking-defects" data-defect-asking>${escapeHtml(askingPlate)}</p>
    <p class="card__reveal-copy">Survey records stay with the deed for every buyer.</p>
  </section>`;
}

export function planningContextHtml(city, state, parcelId) {
  const holding = state.holdings[parcelId];
  const parcel = activeParcel(city, state, parcelId);
  const ceiling = holding.planningCeiling ?? 0;
  const maxPermit = maxPermitLevelFor(parcel, holding);
  const padQuote = parcel?.consolidated ? redevelopQuote(city, state, parcelId) : null;
  const finishId = parcel?.consolidated
    ? (padQuote?.toArchetype ?? null)
    : (holding.approvedPermit?.archetypeId
      ?? PERMIT_FINISH_ARCHETYPE[ceiling]
      ?? null);
  const approved = holding.approvedPermit?.label
    ?? (finishId ? archetypeRungLabel(finishId) : null)
    ?? PERMIT_LABELS[ceiling]
    ?? null;
  const lastLobby = [...(state.log ?? [])]
    .reverse()
    .find((entry) => entry.type === 'lobby' && entry.parcelId === parcelId);
  const vacantPad = Boolean(
    parcel?.consolidated && levelOf(state, parcelId) === 0 && !holding?.construction,
  );
  let resultBanner = vacantPad && ceiling >= 1
    ? `<p class="card__owner-banner" role="status" data-lobby-result="vacant">
      Vacant · rebuild as ${escapeHtml(approved ?? 'the unlocked form')}
    </p>`
    : '';
  if (lastLobby && lastLobby.success === false && ceiling < maxPermit) {
    resultBanner += `<p class="card__owner-banner card__owner-banner--warn" role="status" data-lobby-result="fail">
      Last bid refused · fee spent
    </p>`;
  }

  const architectHire = (holding.hires?.architect
    && holding.hires.architect.expiresAfterQuarter >= state.quarter)
    || (holding.hire?.profession === 'architect'
      && holding.hire.expiresAfterQuarter >= state.quarter);
  const architect = Boolean(architectHire);
  const favourBonus = favourLobbyBonusBp(state.favour ?? 0);

  // ── V3.70 L6: the change-of-use ladder, beside the height rungs and never inside them ──
  //
  // Two ladders, one action. A height rung buys STOREYS and moves `planningCeiling`; a use rung
  // buys a different BUILDING on the same shell and moves nothing. They render as separate groups
  // because a player choosing between "three more floors" and "a data centre" is choosing between
  // two futures for the site, and a single list would read as one ladder with a strange rung on it.
  const currentArchetypeId = archetypeIdOf(city, state, parcelId);
  const useOptions = usePermitOptionsFor(parcel, holding, currentArchetypeId);
  const approvedUse = holding.approvedUsePermit ?? null;
  const useDecision = (opt) => {
    const useChanceBp = Math.max(1500, (architect ? 7500 : 5500)
      + favourBonus + (opt.chanceAdjustBp ?? 0));
    // Probe the real reducer with the real action, so a refusal reason on the button is the
    // reason the reducer would actually give rather than a guess made in the view.
    const check = canApplyAction(city, state, {
      type: 'lobby',
      avatarId: 'player',
      parcelId,
      usePermitId: opt.id,
    });
    const button = verbButton({
      verb: `lobby-use:${opt.id}`,
      family: 'lobby',
      label: 'Lobby',
      check,
      className: 'verb--secondary',
      available: opt.description,
      hint: `${(useChanceBp / 100).toFixed(0)}% pass`,
    });
    return { button, check, chanceBp: useChanceBp };
  };
  const optionById = new Map(useOptions.map((option) => [option.id, option]));
  const currentShopUseId = shopUsePermitIdForHolding(holding);
  const shopRibbon = SHOP_CORNER_USE_ARCHETYPES.includes(currentArchetypeId)
    || Boolean(currentShopUseId);
  const rowIds = shopRibbon
    ? SHOP_CHANGE_USE_IDS
    : [...new Set([
      ...useOptions.map(({ id }) => id),
      ...(approvedUse?.id ? [approvedUse.id] : []),
    ])];
  const useRows = rowIds.map((id) => {
    const permit = USE_PERMITS[id];
    if (!permit) return '';
    const option = optionById.get(id);
    const isCurrent = id === currentShopUseId
      || Boolean(
        approvedUse?.id === id
        && (permit.startsOnGrant || permit.archetypeId === currentArchetypeId),
      );
    const isApproved = approvedUse?.id === id && !isCurrent;
    const chanceBp = Math.max(1500, (architect ? 7500 : 5500)
      + favourBonus + (permit.chanceAdjustBp ?? 0));
    const decision = option && !isCurrent && !isApproved ? useDecision(option) : null;
    // The economy only quotes physical works after approval. Project that one field in a
    // read-only state copy so every row presents the reducer's real quote before commitment.
    const projectedState = permit.archetypeId && permit.archetypeId !== currentArchetypeId
      ? {
        ...state,
        holdings: {
          ...state.holdings,
          [parcelId]: {
            ...holding,
            approvedUsePermit: grantUsePermit(id),
          },
        },
      }
      : null;
    const worksQuote = projectedState
      ? changeUseQuote(city, projectedState, parcelId)
      : null;
    const form = permit.archetypeId
      ? shortFormLabel(archetypeRungLabel(permit.archetypeId))
      : 'SHOP SHELL';
    const stateSuffix = isCurrent ? ' (current)' : isApproved ? ' (approved)' : '';
    const rowName = shopRibbon
      ? `${String(permit.short ?? permit.label).toUpperCase()}${stateSuffix}`
      : `${permit.short ?? permit.label}${stateSuffix}`;
    const actionCell = isCurrent
      ? '<span class="permit-rung-info__action permit-rung-info__action--live">LIVE</span>'
      : isApproved
        ? '<span class="permit-rung-info__action permit-rung-info__action--approved">APPROVED</span>'
        : decision
          ? `<span class="permit-rung-info__action">${decision.button}</span>`
          : '';
    const duration = worksQuote?.durationQuarters ?? 1;
    return `
      <li class="permit-rung-info change-use-rung${isCurrent ? ' is-current' : ''}${isApproved ? ' is-approved' : ''}${decision && !decision.check.ok ? ' is-blocked' : ''}"
          data-change-use-option="${escapeHtml(id)}"
          data-change-use-cost="${worksQuote?.cost ?? ''}"
          data-change-use-cash-out="${worksQuote?.cashOut ?? ''}"
          data-change-use-debt-taken="${worksQuote?.debtTaken ?? ''}"
          data-change-use-quarters="${worksQuote?.durationQuarters ?? ''}"
          ${isCurrent ? 'aria-current="true"' : ''}>
        <span class="permit-rung-info__identity">
          <strong>${escapeHtml(rowName)}</strong>
        </span>
        <span class="permit-rung-info__facts" aria-label="${escapeHtml(permit.label)} decision facts">
          <span class="permit-rung-info__fact" data-change-use-fact="fee"><small>LOBBY FEE</small><strong>${money(permitFeeForRung(permit.feeRung))}</strong></span>
          <span class="permit-rung-info__fact" data-change-use-fact="pass"><small>PASS</small><strong>${(chanceBp / 100).toFixed(0)}%</strong></span>
          <span class="permit-rung-info__fact permit-rung-info__fact--form" data-change-use-fact="form"><small>FORM</small><strong>${escapeHtml(form)}</strong></span>
          <span class="permit-rung-info__fact" data-change-use-fact="cash"><small>CASH</small><strong>${worksQuote ? money(worksQuote.cashOut) : '—'}</strong></span>
          <span class="permit-rung-info__fact" data-change-use-fact="time"><small>TIME</small><strong>${permit.startsOnGrant ? 'ON GRANT' : worksQuote ? `${duration} QUARTER${duration === 1 ? '' : 'S'}` : '—'}</strong></span>
        </span>
        ${actionCell}
      </li>`;
  }).join('');
  const useWorksQuote = approvedUse?.archetypeId
    && approvedUse.archetypeId !== currentArchetypeId
    ? changeUseQuote(city, state, parcelId)
    : null;
  const useWorksAction = useWorksQuote
    ? verbButton({
      verb: 'change-use',
      family: 'redevelop',
      label: `Change use · ${approvedUse.label} — ${money(useWorksQuote.cost)}`,
      check: canApplyAction(city, state, { type: 'change-use', parcelId }),
      className: 'verb--primary',
      available: `Shell stays. Works finish as ${archetypeRungLabel(approvedUse.archetypeId)}.`,
      hint: `${useWorksQuote.durationQuarters ?? 1}q · ${cashAfterHint(useWorksQuote)}`,
    })
    : '';
  const useGroup = (useRows || approvedUse)
    ? `
      <div class="planning-context__use" data-planning-use ${shopRibbon ? 'data-change-use-ribbon' : ''}>
        <div class="card__section-title">Change of use</div>
        ${approvedUse && !shopRibbon
    ? `<p class="card__owner-banner" role="status" data-use-permit="${escapeHtml(approvedUse.id)}">
          ${approvedUse.archetypeId
    ? `${escapeHtml(approvedUse.label)} approved · works finish as ${escapeHtml(archetypeRungLabel(approvedUse.archetypeId))}`
    : `${escapeHtml(approvedUse.label)} live`}
        </p>`
    : ''}
        ${holding.hospitality?.kind === 'hotel' && holding.hospitality.worldClass
    ? `<p class="card__owner-banner" role="status">World-class brand · ${escapeHtml(holding.hospitality.brand)} · 2× sale and rent</p>`
      : holding.hospitality?.kind === 'hotel'
      ? '<p class="card__owner-banner" role="status">Hotel conversion live · nearby hotels lift every hotel</p>'
      : holding.hospitality?.kind === 'luxe'
        ? '<p class="card__owner-banner" role="status">Luxury flats live · nearby luxe and hotels lift</p>'
        : ''}
        ${useRows ? `<ol class="permit-rung-info-list change-use-rung-list" aria-label="Change-of-use options">${useRows}</ol>` : ''}
        ${useWorksAction}
      </div>`
    : '';

  const content = `
      ${resultBanner}
      ${useGroup}`;
  return content.trim() ? `
    <div class="planning-context" data-planning-context>
      ${content}
    </div>
  ` : '';
}

/**
 * Vacant holdings lead with tenant offers. Shop change-of-use remains the first
 * permit decision; other parcels retain their height → planning order.
 * Kept pure so the page-order contract can be exercised without a browser DOM.
 */
export function worksPagePriorityLayout({
  planningHtml = '', tenantHtml = '', shopChangeUse = false,
} = {}) {
  const tenantWell = tenantHtml
    ? `<div class="works-root-actions" data-works-root-actions>${tenantHtml}</div>`
    : '';
  return Object.freeze({
    beforeNav: tenantWell,
    beforePermitRungs: shopChangeUse ? planningHtml : '',
    afterPermitRungs: shopChangeUse ? '' : planningHtml,
  });
}

export function permitRungListHtml(city, state, parcelId, owner) {
  const parcel = activeParcel(city, state, parcelId);
  const holding = state.holdings?.[parcelId] ?? null;
  const listedLock = listedTickerOf(holding)
    ? `<p class="card__owner-banner" role="status">${escapeHtml(LISTED_FABRIC_REASON)}</p>`
    : '';
  const ceiling = Math.max(0, Math.min(3, holding?.planningCeiling ?? 0));
  const maxPermit = parcel ? maxPermitLevelFor(parcel, holding) : 3;
  const readOnly = owner !== 'player';
  const options = owner === 'player' && parcel ? permitOptionsFor(parcel, holding) : [];
  const architectHire = (holding?.hires?.architect
    && holding.hires.architect.expiresAfterQuarter >= state.quarter)
    || (holding?.hire?.profession === 'architect'
      && holding.hire.expiresAfterQuarter >= state.quarter);
  const architect = Boolean(architectHire);
  const favourBonus = favourLobbyBonusBp(state.favour ?? 0);
  const historic = eraBand(ARCHETYPES[holding?.archetypeId ?? archetypeIdOf(city, state, parcelId)])
    === 'historic';
  const chanceForLevel = (level) => {
    const rungHardness = (level - 1) * 800;
    return architect
      ? Math.min(9500, 7500 + favourBonus - Math.floor(rungHardness * 0.35))
      : Math.max(2000, Math.min(7500,
        5500 - (historic ? 1500 : 0) + favourBonus - rungHardness));
  };
  const ladderByLevel = new Map(
    (owner === 'player' ? redevelopLadder(city, state, parcelId) : [])
      .map((rung) => [rung.level, rung]),
  );
  const optionButtonByLevel = new Map();
  const optionButtons = options.map((opt) => {
    const chanceBp = chanceForLevel(opt.level);
    const chancePct = (chanceBp / 100).toFixed(0);
    const feeLabel = money(permitFeeForRung(opt.level));
    // Probe the real lobby action (with permit level) so cash/action reasons match.
    const check = canApplyAction(city, state, {
      type: 'lobby',
      avatarId: 'player',
      parcelId,
      permitLevel: opt.level,
    });
    const button = verbButton({
      verb: `lobby:${opt.level}`,
      family: 'lobby',
      label: `Lobby L${opt.level}`,
      faceSuffix: ` · ${feeLabel}`,
      check,
      className: 'verb--secondary',
      // COPY-DRAFT: the maximum available rung is the zone cap.
      available: `${opt.label} · zone cap L${maxPermit}`,
      hint: `PASS ${chancePct}%`,
    });
    optionButtonByLevel.set(opt.level, button);
    return button;
  }).join('');
  const gate = owner === null
    ? 'Acquire first — permits are lobbied on holdings.'
    : owner === 'rival'
      ? 'Read only — permits are lobbied on your holdings.'
      : '';
  const currentFormId = parcel?.consolidated
    ? redevelopQuote(city, state, parcelId)?.toArchetype
    : (holding?.approvedPermit?.archetypeId ?? PERMIT_FINISH_ARCHETYPE[ceiling]);
  const currentFormLabel = currentFormId
    ? archetypeRungLabel(currentFormId, ceiling)
    : permitFormLabel(ceiling);
  const phone = phoneLayerOn();
  const rows = [1, 2, 3].map((level) => {
    const future = level > ceiling && level <= maxPermit;
    const nextAction = owner === 'player' ? (optionButtonByLevel.get(level) ?? '') : '';
    const rung = ladderByLevel.get(level) ?? null;
    const quote = rung?.quote ?? null;
    const successorId = rung?.archetypeId ?? PERMIT_FINISH_ARCHETYPE[level] ?? null;
    const successor = successorId
      ? shortFormLabel(archetypeRungLabel(successorId, level))
      : '—';
    const chancePct = (chanceForLevel(level) / 100).toFixed(0);
    const stateLabel = nextAction
      ? 'Lobby'
      : level < ceiling
        ? 'Cleared'
        : level > ceiling && level <= maxPermit
          ? 'Future'
          : level > maxPermit
            ? 'Zone cap'
            : null;
    const currentActionKind = owner === 'player' ? 'live' : 'ceiling';
    const actionCell = level === ceiling
      ? `<span class="permit-rung-info__action permit-rung-info__action--${currentActionKind}"
               data-permit-${currentActionKind}-form>
          ${owner === 'player' ? 'Live' : `CEILING · <span ${phoneJoinAttrs('slash', currentFormLabel)}>${phoneSlashBreak(currentFormLabel, phone)}</span>`}
        </span>`
      : nextAction
        ? `<span class="permit-rung-info__action">${nextAction}</span>`
        : future
          ? `<span class="permit-rung-info__future">
              <span class="permit-rung-info__price">${money(permitFeeForRung(level))}</span>
              <span class="permit-rung-info__lock" aria-hidden="true"></span>
            </span>`
          : '';
    return `
      <li class="permit-rung-info${level === ceiling ? ' is-current' : ''}${level > maxPermit ? ' is-capped' : ''}${future && !nextAction ? ' is-locked' : ''}"
          data-permit-rung-info="${level}"
          data-development-cost="${quote?.cost ?? ''}"
          data-development-quarters="${quote?.durationQuarters ?? ''}"
          ${level === ceiling ? 'aria-current="step"' : ''}>
        <span class="permit-rung-info__identity">
          <strong ${phoneJoinAttrs('slash', PERMIT_LABELS[level] ?? `L${level}`)}>${phoneSlashBreak(PERMIT_LABELS[level] ?? `L${level}`, phone)}</strong>
          ${stateLabel ? `<span class="permit-rung-info__state">${stateLabel}</span>` : ''}
        </span>
        <span class="permit-rung-info__facts" aria-label="L${level} decision facts">
          <span class="permit-rung-info__fact" data-permit-fact="fee"><small>LOBBY FEE</small><strong>${money(permitFeeForRung(level))}</strong></span>
          <span class="permit-rung-info__fact" data-permit-fact="pass"><small>PASS</small><strong>${chancePct}%</strong></span>
          <span class="permit-rung-info__fact permit-rung-info__fact--form" data-permit-fact="successor"><small>SUCCESSOR</small><strong ${phoneJoinAttrs('slash', successor)}>${phoneSlashBreak(successor, phone)}</strong></span>
          <span class="permit-rung-info__fact" data-permit-fact="development-cost"><small>DEVELOPMENT COST</small><strong>${quote ? money(quote.cost) : '—'}</strong></span>
          <span class="permit-rung-info__fact" data-permit-fact="quarters"><small>TIME</small><strong>${quote ? `${quote.durationQuarters ?? 1} QUARTERS` : '—'}</strong></span>
        </span>
        ${actionCell}
      </li>`;
  }).join('');
  return `
    <section class="works-readonly works-readonly--permit" data-permit-rung-list
             data-read-only="${readOnly ? 'true' : 'false'}"
             data-has-lobby="${optionButtons ? 'true' : 'false'}" aria-label="Planning permit rungs">
      ${listedLock}
      <div class="card__section-title">Planning permit rungs</div>
      <div class="permit-rung-info__ceiling" data-current-planning-ceiling title="${escapeHtml(ceilingTitle(ceiling, maxPermit))}">CEILING · L${ceiling}</div>
      <ol class="permit-rung-info-list">${rows}</ol>
      ${owner === null && !RULES.redevelopButtonRetired
        ? permitFormStripHtml(city, state, parcelId)
        : ''}
      ${gate ? `<p class="works-readonly__gate" role="status">${gate}</p>` : ''}
    </section>`;
}

function permitFormStripHtml(city, state, parcelId) {
  const currentArchetypeId = archetypeIdOf(city, state, parcelId);
  const currentLevel = levelOf(state, parcelId);
  const currentCondition = conditionOf(city, state, parcelId);
  const parcel = activeParcel(city, state, parcelId);
  const currentBase = buildingBaseFor(parcel, currentArchetypeId, currentCondition, {
    parcelStatus: state.parcelStatus?.[parcelId],
  });
  const projected = structuredClone(state);
  projected.holdings[parcelId] = {
    owner: 'player',
    level: currentLevel,
    condition: currentCondition,
    archetypeId: currentArchetypeId,
    sector: currentBase.sector,
    basePrice: currentBase.basePrice,
    baseRent: currentBase.baseRent,
    debt: 0,
    basis: marketValue(city, state, parcelId),
    acquiredQuarter: state.quarter,
    mature: false,
    planningCeiling: 0,
  };
  const forms = [
    {
      level: currentLevel,
      archetypeId: currentArchetypeId,
      label: archetypeRungLabel(currentArchetypeId, currentLevel),
      current: true,
      locked: false,
      quote: null,
    },
    ...[1, 2, 3].map((level) => ({
      level,
      archetypeId: PERMIT_FINISH_ARCHETYPE[level],
      label: archetypeRungLabel(PERMIT_FINISH_ARCHETYPE[level], level),
      current: false,
      locked: true,
      quote: (() => {
        projected.holdings[parcelId].planningCeiling = level;
        return redevelopQuote(city, projected, parcelId);
      })(),
    })),
  ].map(({ level, archetypeId, label, current, locked, quote }) => `
    <article class="redevelop-picker__card${current ? ' is-current' : ''}${locked ? ' is-locked' : ''}"
             role="listitem" data-permit-form-thumb="${level}"
             data-redevelop-rung="${level}" data-to-archetype="${escapeHtml(archetypeId ?? '')}"
             data-locked="${locked ? '1' : '0'}">
      ${current
    ? '<span class="redevelop-picker__now">NOW</span>'
    : locked ? '<span class="redevelop-picker__padlock" title="Lobby to unlock"></span>' : ''}
      <img class="redevelop-picker__thumb" data-archetype-thumb="${escapeHtml(archetypeId ?? '')}"
           src="${archetypeThumbSrc(archetypeId)}" alt="${escapeHtml(label)}"
           width="512" height="384" loading="lazy">
      <span class="redevelop-picker__level">L${level}</span>
      <span class="redevelop-picker__cost">${locked ? '—' : (quote ? money(quote.cost) : '—')}</span>
    </article>`).join('');
  return `
    <div class="permit-form-strip redevelop-picker redevelop-picker--strip"
         data-permit-form-strip data-read-only="true">
      <span class="permit-form-strip__caption" data-permit-form-caption>BUILD</span>
      <div class="redevelop-picker__strip" role="list">${forms}</div>
    </div>`;
}

function renovationSummaryHtml(city, state, parcelId, owner) {
  const condition = conditionOf(city, state, parcelId);
  const nextCondition = Math.min(RULES.maxCondition, condition + 1);
  const result = condition >= RULES.maxCondition
    ? `${conditionLabel(condition)} · maximum`
    : conditionLabel(nextCondition);
  const gate = owner === null
    ? 'Acquire first — renovations are commissioned on holdings.'
    : 'Read only — renovations are commissioned on your holdings.';
  return `
    <section class="works-readonly works-readonly--renovation" data-renovation-summary
             data-read-only="true" aria-label="Renovation summary">
      <div class="card__section-title">Whole-building condition</div>
      <dl class="works-readonly__summary">
        <div><dt>Current</dt><dd>${escapeHtml(conditionLabel(condition))}</dd></div>
        <div><dt>Next rung</dt><dd>${escapeHtml(result)}</dd></div>
      </dl>
      <p class="works-readonly__gate" role="status">${gate}</p>
    </section>`;
}

/** One titled block inside the stacked owned-parcel action sheet. */
function contextBlock(title, body) {
  return `
    <div class="card__context-block" data-context-block>
      <div class="card__section-title">${escapeHtml(title)}</div>
      ${body}
    </div>
  `;
}

// `owned` is the viewer-relative answer from show() (viewerOwner): the canonical
// holdings[id].owner reads 'rival' when hotseat P2 views its own holding.
function riskContextHtml(city, state, parcelId, events, insure, remediate, owned) {
  const status = state.parcelStatus[parcelId];
  const bundleFee = insurancePremium(marketValue(city, state, parcelId), 'both');
  const chips = [
    status.damage ? `DAMAGE · ${status.damage}${owned ? ' · rent $0 while damaged' : ''}` : '',
    status.tenant?.paymentAtRisk ? 'ARREARS · rent at risk' : '',
    status.occupancy === 'squatted' ? 'OCCUPANCY · squatted' : '',
    ...events.filter(({ type }) => ['fire', 'flash-flood', 'tenant-arrears'].includes(type))
      .map((event) => `${event.forecast.headline} · resolves Q${event.resolveQuarter}`),
  ].filter(Boolean);
  return `
    <div class="risk-context">
      ${chips.map((chip) => `<span class="cause-chip">${escapeHtml(chip)}</span>`).join('')}
      <div class="card__context-actions">
        ${status.damage && owned ? '<button type="button" class="verb verb--secondary" data-open-renovation>Open RENOVATION</button>' : ''}
        ${verbButton({
          verb: 'insure:both',
          family: 'insure',
          label: 'Insure fire + flood',
          key: 'I',
          check: insure,
          available: `Cover fire and flood for three quarters — ${moneyExact(bundleFee)} fee · 1 action.`,
        })}
        ${status.occupancy === 'squatted' ? verbButton({
          verb: 'remediate',
          label: `Remediate ${money(RULES.remediateCost)}`,
          key: 'X',
          check: remediate,
          available: `Clear the occupation — ${moneyExact(RULES.remediateCost)} · 1 action. Lease on a later action.`,
        }) : ''}
      </div>
    </div>
  `;
}

export function parcelHistoryLines(state, parcelId, city = null) {
  const lines = [];
  const parcelLog = state.log.map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.parcelId === parcelId);
  for (const { entry, index } of parcelLog) {
    let label = `${entry.type.replace(/-/g, ' ')} · ${parcelId.toUpperCase()}`;
    if (entry.type === 'lobby') {
      const chancePct = entry.chanceBp != null ? `${(entry.chanceBp / 100).toFixed(0)}%` : '?';
      // V3.70 L6: a change-of-use application is logged as a `lobby` too, and calling it a
      // HEIGHT PASS would be false — it moves no ceiling. It carries `usePermitId`, so the
      // history can tell the two ladders apart without a second log type.
      if (entry.usePermitId) {
        const useId = String(entry.usePermitId).replace(/-/g, ' ');
        label = entry.success === true
          ? `USE PASS · ${useId} approved · ${chancePct} chance`
          : entry.success === false
            ? `USE FAIL · use unchanged · ${chancePct} chance`
            : 'Use application · outcome missing';
      } else if (entry.success === true || (entry.success == null
        && state.holdings?.[parcelId]?.planningCeiling >= 1
        && index === parcelLog.filter(({ entry: e }) => e.type === 'lobby').at(-1)?.index)) {
        const quote = city ? redevelopQuote(city, state, parcelId) : null;
        const rung = quote ? archetypeRungLabel(quote.toArchetype) : 'next legal rung';
        label = `CEILING PASS · unlocks ${rung} · ${chancePct} chance`;
      } else if (entry.success === false) {
        label = `CEILING FAIL · still locked · ${chancePct} chance`;
      } else {
        label = 'Lobby · outcome missing';
      }
    }
    lines.push({ q: entry.q, order: index, kind: 'action', label });
  }
  for (const ledger of state.ledger ?? []) {
    const matches = [
      ...(ledger.transactions ?? []),
      ...(ledger.propertyEvents ?? []),
      ...(ledger.peopleOutcomes ?? []),
      ...(ledger.renovationCompletions ?? []),
      ...(ledger.completions ?? []),
    ].filter((item) => item.parcelId === parcelId);
    for (const [index, item] of matches.entries()) {
      lines.push({
        q: ledger.quarter,
        order: 10_000 + index,
        kind: 'settle',
        label: `${item.kind ?? item.type ?? 'settle'} · ${item.eventId ?? parcelId.toUpperCase()}`,
      });
    }
  }
  return Object.freeze(lines.sort((left, right) =>
    right.q - left.q || right.order - left.order).slice(0, 6).map(Object.freeze));
}

/** Books receipt for Terry's named sale roll. Active briefs show their authored range;
 * once a holding is divested, the parcel keeps the exact realised uplift in its log. */
export function salesBriefBookLine(
  state,
  parcelId,
  holding = state.holdings?.[parcelId],
  anchorValuation = null,
) {
  const terry = activeHires(holding, state.quarter)['property-agent'] ?? null;
  const tradeSale = Boolean(activeVenture(holding)?.valuation);
  const tenant = state.parcelStatus?.[parcelId]?.tenant;
  const incomeValuation = Boolean(anchorValuation) || Boolean(
    holding?.owner
    && !holding.construction
    && state.parcelStatus?.[parcelId]?.occupancy === 'tenant'
    && tenant?.anchor?.landed,
  );
  if (terry) {
    return incomeValuation
      ? 'Sales brief — no effect on an income valuation.'
      : tradeSale
      ? 'Sales brief · no uplift on PE trade sale'
      : 'Sales brief · uplift 0–15% at sale';
  }
  const lastSale = [...(state.log ?? [])].reverse()
    .find((entry) => entry.type === 'divest' && entry.parcelId === parcelId);
  if (!lastSale?.terryBriefed) return null;
  if (lastSale.incomeSale) return 'Sales brief — no effect on an income valuation.';
  if (lastSale.peSale) return 'Sales brief · no uplift on PE trade sale';
  return `Sales brief · uplift ${pct(lastSale.saleUpliftBp ?? 0, 2)} rolled at sale`;
}

function eightWords(text) {
  const words = String(text ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return '';
  return words.length <= 8 ? words.join(' ') : words.slice(0, 8).join(' ');
}

function ledgerLine(label, value, extra = '') {
  const text = /\bledger-line--text\b/.test(extra);
  return `<div class="ledger-line ${extra}">
    <span class="ledger-line__k">${escapeHtml(eightWords(label))}</span>
    <span class="ledger-line__v${text ? ' ledger-line__v--text' : ''}">${value}</span>
  </div>`;
}

export function anchorValuationBookLine(anchorValuation) {
  if (!anchorValuation) return '';
  return `${anchorValuation.investor} · CAP ${pct(anchorValuation.capRateBp, 2)}/q · `
    + `${moneyExact(anchorValuation.quarterlyRent)}/q current ÷ cap = ${moneyExact(anchorValuation.valuation)}`;
}

function ledgerRegisterHtml({
  value, debt, contribution, parcel, condition, intel, corridor, links, preview, owner,
  amenityNotes, history, flood, fire, brokerOffer, salesBriefLine = null,
  anchorValuation = null, forecourtLine = null, formName = null,
}) {
  const amenity = (amenityNotes ?? []).slice(0, 3).map((note) =>
    ledgerLine(
      String(note.sourceLabel || note.sourceId || 'Amenity')
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (ch) => ch.toUpperCase()),
      `<span class="ledger-signed ${note.bp > 0 ? 'is-gain' : note.bp < 0 ? 'is-loss' : ''}">${signedPct(note.bp)}</span>`,
      note.bp > 0 ? 'is-gain' : note.bp < 0 ? 'is-loss' : '',
    )).join('');
  const hist = (history ?? []).map((line) => {
    const overdue = /arrears|overdue|fail/i.test(line.label);
    const paid = /(?:^|\b)(?:rent|settlement|paid)(?:\b|$)/i.test(line.label)
      && !/acquire|divest/i.test(line.label);
    const stamp = overdue ? rubberStamp('overdue') : paid ? rubberStamp('paid') : '';
    return `<div class="ledger-line ledger-line--entry ledger-line--text ${overdue ? 'is-overdue' : paid ? 'is-paid' : ''}">
      <span class="ledger-line__k">Q${line.q} · ${escapeHtml(eightWords(line.kind))}</span>
      <span class="ledger-line__v ledger-line__v--text">${escapeHtml(eightWords(line.label))}</span>
      ${stamp}
    </div>`;
  }).join('');
  const corridorValue = owner
    ? (corridor ? `+${pct(corridor)} · ${links.length}` : 'none')
    : (preview.links.length ? `+${pct(preview.rentBp)} rent` : 'none');
  return `<section class="ledger-register" data-ledger-register>
    <div class="ledger-block" data-ledger-block="value">
      <span class="ledger-block__mark">Value</span>
      ${ledgerLine('MV', moneyExact(value), 'ledger-line--figure')}
      ${ledgerLine('Equity', moneyExact(value - debt), 'ledger-line--figure')}
      ${ledgerLine('Debt', moneyExact(debt), 'ledger-line--figure')}
      ${anchorValuation ? `<p class="ledger-line ledger-line--note" data-anchor-cap-rate>${escapeHtml(anchorValuationBookLine(anchorValuation))}</p>` : ''}
    </div>
    <div class="ledger-block" data-ledger-block="income">
      <span class="ledger-block__mark">Income</span>
      ${ledgerLine(
    'Net / qtr',
    signedMoney(contribution),
    `ledger-line--figure${contribution > 0 ? ' is-gain' : contribution < 0 ? ' is-loss' : ''}`,
  )}
      ${forecourtLine
    ? `<p class="ledger-line ledger-line--note" data-forecourt-trade>${escapeHtml(forecourtLine)}</p>`
    : ''}
      ${ledgerLine('Corridor', corridorValue, /[+\-−]/.test(String(corridorValue)) ? '' : 'ledger-line--text')}
      ${brokerOffer ? ledgerLine(
    'Vinh offer',
    `${brokerOffer.kind === 'lvr' ? 'higher LVR' : 'lower interest'} · until Q${brokerOffer.expiresAfterQuarter}`,
    'ledger-line--text',
  ) : ''}
      ${salesBriefLine
    ? `<p class="ledger-line ledger-line--note" data-sales-brief>${escapeHtml(salesBriefLine)}</p>`
    : ''}
    </div>
    <div class="ledger-block" data-ledger-block="site">
      <span class="ledger-block__mark">Parcel</span>
      ${formName ? ledgerLine('Form', escapeHtml(formName), 'ledger-line--text') : ''}
      ${ledgerLine('District', escapeHtml(parcel.districtName), 'ledger-line--text')}
      ${ledgerLine('Zone', `<span title="${escapeHtml(planningZoneTitle(parcel.zoneId))}">${escapeHtml(planningZoneLabel(parcel.zoneId))}</span>`, 'ledger-line--text')}
      ${ledgerLine('Condition', escapeHtml(condition), 'ledger-line--text')}
      ${ledgerLine('Flood', escapeHtml(flood), 'ledger-line--text')}
      ${ledgerLine('Fire', escapeHtml(fire), 'ledger-line--text')}
      ${ledgerLine('Frontage', `${parcel.tram ? 'tram · ' : ''}${parcel.corner ? 'corner' : 'mid'}`, 'ledger-line--text')}
      ${amenity}
    </div>
    <div class="ledger-block ledger-block--history" data-ledger-block="history">
      <span class="ledger-block__mark">Run</span>
      ${hist || '<p class="card__empty">No parcel history yet.</p>'}
    </div>
  </section>`;
}

export class PropertyCard {
  constructor(host, { onAction, onClose }) {
    this.host = host;
    this.onAction = onAction;
    this.onClose = onClose;
    this.element = null;
    this.parcelId = null;
    this.selection = null;
    this.thumbnails = null;
    this.activeTab = 'intel';
    this.detailsOpen = false;
    this.folderPage = 'sheet';
    this.worksPage = 'ladder';
    this._folderParcel = null;
    /** Selected board-lot multiples per ticker on the Stock Exchange card. */
    this.marketLots = {};
    this._disposePortrait3d = null;
    this._dioramaControllers = [];
    // P2d SHEET item 2: the joins (phoneHintJoin, phoneSlashBreak) are written for the layer the card was rendered in, so when layout-class.js
    // flips phoneHud the cards redo them. One shared listener per window (listenPhoneJoins), not one per card: PropertyCard has no teardown
    // (close() ends the element, never the instance), so a listener per instance could never be removed.
    listenPhoneJoins(host.ownerDocument);
    host.ownerDocument?.addEventListener('districtdeck:agendas', (event) => {
      const actor = event.detail?.actors?.find(a => a.id === this.element?.dataset.personId);
      const now = this.element?.querySelector('[data-person-agenda]');
      const day = this.element?.querySelector('[data-person-day]');
      if (actor && now) now.textContent = actor.activityLine;
      if (actor && day) day.textContent = actor.agendaDayLine;
    });
    // Ambient taps already pass through PeopleDrag's pick. Remember it on down because
    // the window's drag handler clears pending before document receives pointerup.
    let agendaPick = null;
    host.ownerDocument?.addEventListener('pointerdown', () => {
      agendaPick = globalThis.__districtDeck?.view?.peopleDrag?.pending ?? null;
    }, true);
    host.ownerDocument?.addEventListener('pointerup', (event) => {
      const drag = globalThis.__districtDeck?.view?.peopleDrag;
      const pending = agendaPick;
      agendaPick = null;
      if (!pending || drag.active || event.button !== 0 || event.pointerId !== pending.pointerId
        || Math.hypot(event.clientX - pending.x0, event.clientY - pending.y0) >= 5) return;
      const actor = pending.actor;
      if (!actor?.agendaNow) return;
      // A task runs after canvas selection; a microtask can run between event listeners.
      setTimeout(() => {
        if (drag.active || actor.dragHold) return;
        this.selection = { kind: 'person', id: actor.id };
        this.parcelId = null;
        this._render(`<header class="deed-binder deed-binder--person"><div class="deed-tab">
          <span>${escapeHtml(actor.agenda.identity.replaceAll('-', ' '))}</span></div>
          <button class="card__close" type="button" aria-label="Close person card">✕</button></header>
          <div class="dossier-body"><p data-person-agenda>${escapeHtml(actor.activityLine)}</p>
          <p class="card__empty" data-person-day>${escapeHtml(actor.agendaDayLine)}</p></div>`, 'Resident daily agenda');
        this.element.classList.add('card--person');
        this.element.dataset.personId = actor.id;
      }, 0);
    }, true);
  }

  setThumbnailMaker(maker) {
    this.thumbnails = maker;
  }

  close() {
    this._disposePortrait3d?.();
    this._disposePortrait3d = null;
    this._disposeDioramas();
    if (this.element) {
      const el = this.element;
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reducedMotion) {
        el.remove();
      } else {
        el.classList.add('is-closing');
        const cleanup = () => el.remove();
        el.addEventListener('animationend', cleanup, { once: true });
        setTimeout(cleanup, 160);
      }
      this.element = null;
    }
    this.parcelId = null;
    this.selection = null;
    this.detailsOpen = false;
    this.marketLots = {};
    this.host?.dispatchEvent?.(new CustomEvent('districtdeck:card-close')); // Phone round P1 L2b: <html data-phone-sheet> goes to none now
  }

  isOpen(selection) {
    const target = typeof selection === 'string' ? { kind: 'parcel', id: selection } : selection;
    return this.selection?.kind === target?.kind && this.selection?.id === target?.id;
  }

  showPerson(city, state, personId, viewerSeatId = 'P1') {
    const html = personCardHtml(city, state, personId, viewerSeatId);
    if (!html) return false;
    this.selection = { kind: 'person', id: personId };
    this.parcelId = null;
    this._render(html, 'Person and contact details');
    this.element.dataset.personId = personId;
    this.element.classList.remove('card--deed', 'card--civic', 'card--fringe');
    this.element.classList.add('card--person', 'has-scroll-affordance');
    this.element.dataset.scrollAffordance = 'gutter';
    const person = state.people?.byId?.[personId];
    this.element.classList.toggle('card--person-working', Boolean(person && personIsWorking(person, state)));
    this.element.classList.remove('card--deed');
    return true;
  }

  /** One off-board holding, seated in the same left cassette as a parcel. */
  showFringe(state, fringeId) {
    const options = arguments[2] ?? {};
    const html = fringeAssetCardHtml(state, fringeId, options);
    if (!html) return false;
    this.selection = { kind: 'fringe', id: fringeId };
    this.parcelId = null;
    this.folderPage = 'sheet';
    this.lastState = state;
    this._render(html, 'Fringe holding details');
    this.element.dataset.fringeId = fringeId;
    this.element.dataset.folderPage = 'sheet';
    if (options.focus) this.element.dataset.fringeFocus = options.focus;
    else delete this.element.dataset.fringeFocus;
    this.element.classList.remove(
      'card--person',
      'card--person-working',
      'card--civic',
      'has-scroll-affordance',
    );
    delete this.element.dataset.scrollAffordance;
    this.element.classList.add('card--deed', 'card--fringe');
    this._ensureWorldRunListener();
    if (options.focus === 'warehouse') this._scrollPortWarehouse();
    this._injectP14FringeVerbs(fringeId, state);
    return true;
  }

  _injectP14FringeVerbs(fringeId, state) {
    const actions = this.element?.querySelector('.card__actions-primary');
    if (!actions) return;
    const world = readOpenWorldEnvelope();
    const beat = world?.beat ?? 0;
    if (fringeId === 'port') {
      const repair = p14RepairButtonHtml('port', world, beat, state?.cash);
      if (repair && !actions.querySelector('[data-verb="repair-facility"]')) {
        actions.insertAdjacentHTML('beforeend', repair);
      }
      if (!actions.querySelector('[data-verb="build-warship"]')) {
        actions.insertAdjacentHTML('beforeend', p14BuildWarshipButtonHtml(world));
      }
    }
  }

  _ensureWorldRunListener() {
    if (this._worldRunBound) return;
    this._worldRunBound = true;
    this._onWorldRunStorage = (event) => {
      if (event.key !== WORLD_RUN_KEY) return;
      if (this.selection?.kind !== 'fringe' || this.selection.id !== 'port') return;
      if (!this.lastState || !this.element) return;
      this.showFringe(this.lastState, 'port');
    };
    window.addEventListener('storage', this._onWorldRunStorage);
  }

  _scrollPortWarehouse() {
    const section = this.element?.querySelector('[data-port-warehouse]');
    if (!section) return;
    const scroller = this.element.querySelector('.fringe-card__body');
    const move = () => {
      if (scroller) scroller.scrollTop = section.offsetTop;
      else section.scrollIntoView({ block: 'start' });
    };
    requestAnimationFrame(move);
  }

  /** Render (or re-render) the card for a parcel against the current run state. */
  show(city, state, selection, viewerSeatId = 'P1') {
    let target = typeof selection === 'string' ? { kind: 'parcel', id: selection } : selection;
    if (target?.kind === 'parcel' && !activeParcel(city, state, target.id)) {
      const resolved = resolveCurrentParcelId(city, state, target.id);
      if (!resolved) {
        this.close();
        return;
      }
      target = { kind: 'parcel', id: resolved };
    }
    if (target?.kind === 'civic' || target?.kind === 'reserve') {
      this.lastCity = city;
      this.lastState = state;
      // Reset lot steppers only when switching to a different civic/reserve selection.
      if (this.selection?.kind !== target.kind || this.selection?.id !== target.id) {
        this.marketLots = {};
      }
      const html = landUseCardHtml(city, target, state, this.marketLots, viewerSeatId);
      if (!html) return;
      this.selection = target;
      this.parcelId = null;
      this._render(html, target.kind === 'civic' ? 'Civic influence details' : 'Reserve influence details');
      this.element.classList.remove(
        'card--person',
        'card--person-working',
        'card--fringe',
        'has-scroll-affordance',
      );
      this.element.classList.add('card--deed', 'card--civic');
      this.element.dataset.civicId = target.id;
      delete this.element.dataset.scrollAffordance;
      this._paintArchetypeThumbs();
      if (city.civicUses.find((c) => c.id === target.id)?.useId === 'transport-interchange') {
        this.element.insertAdjacentHTML('beforeend', `<section class="card__actions-primary" aria-label="Hinterland gateway"><h3>Hinterland gateway</h3>${surveyedPaddocks(city).map((p) => `<button type="button" data-farm-goto="${p.id}">${escapeHtml(p.label)} · $20,000</button>`).join('')}</section>`);
      }
      return;
    }
    if (target?.kind !== 'parcel') return;
    const parcelId = target.id;
    const parcel = activeParcel(city, state, parcelId);
    if (!parcel) return;
    if (parcel.surveyedFarm) {
      this.lastCity = city; this.lastState = state; this.selection = target; this.parcelId = parcelId;
      const farm = state.farms?.[parcelId], check = farmActionCheck(city, state, parcelId, 'acquire');
      this._render(`<div class="card__body"><p>HINTERLAND · ${escapeHtml(parcelId)}</p><h2>${escapeHtml(parcel.label)}</h2><p>Surveyed agricultural land outside the ring road, with gateway access.</p><p>${farm ? 'Owned · L1 Agriculture' : 'Acquire $20,000 · one action · L1 Agriculture covenant included'}</p><p>${farm?.construction ? 'Farm under works · ready from Q' + farm.construction.completionQuarter : farm?.completedQuarter != null ? 'Farm · ' + farmFieldState(farm, state.quarter) + ' · $9,000 base rent per quarter' : 'Unbuilt paddock'}</p><p>One harvest per four-quarter crop cycle. Town-square market pays $2,000 per harvest.</p>${farm ? farm.completedQuarter == null && !farm.construction ? farmBuildRibbonHtml(city, state, parcelId) : '' : `<button type="button" data-verb="acquire" ${check.ok ? '' : 'disabled'}>Acquire · $20,000</button>`}</div>`, 'Surveyed farm details');
      this.element.classList.add('card--deed');
      return;
    }
    // Reset progressive-disclosure accordion when the selection changes.
    if (this.parcelId !== parcelId) this.detailsOpen = false;
    this.selection = target;
    this.parcelId = parcelId;

    const owner = viewerOwner(state, parcelId, viewerSeatId);
    const holding = state.holdings[parcelId];
    const viewerAvatar = state.mode === 'solo'
      ? state.avatars?.player
      : (state.avatars?.[viewerSeatId] ?? state.avatars?.player);
    const brokerOffer = viewerAvatar?.brokerOffer?.expiresAfterQuarter >= state.quarter
      ? viewerAvatar.brokerOffer
      : null;
    const archetypeId = holding?.construction?.toArchetype ?? archetypeIdOf(city, state, parcelId);
    const archetype = ARCHETYPES[archetypeId];
    const level = levelOf(state, parcelId);
    const condition = conditionOf(city, state, parcelId);
    const value = marketValue(city, state, parcelId);
    const links = owner ? corridorLinks(city, state, parcelId) : [];
    const corridor = owner ? corridorBp(city, state, parcelId) : 0;
    const runningYield = yieldBp(city, state, parcelId);

    const acquire = canAcquire(city, state, parcelId);
    const seatState = stateForActiveSeat(state, viewerSeatId);
    const renovate = canRenovate(city, seatState, parcelId);
    const redevelop = RULES.redevelopButtonRetired
      ? { ok: false, reason: 'Use BUILD on a cleared pad.' }
      : canRedevelop(city, state, parcelId);
    const divest = canDivest(city, state, parcelId);

    const aq = acquireQuote(city, state, parcelId);
    const rq = condition < RULES.maxCondition && owner ? renovateQuote(city, seatState, parcelId) : null;
    const dq = level < RULES.maxLevel && owner ? redevelopQuote(city, state, parcelId) : null;
    const sq = owner === 'player' ? divestQuote(city, state, parcelId) : null;

    const sector = SECTORS[sectorOf(city, state, parcelId)];
    const preview = corridorIfAcquired(city, state, parcelId, 'player');
    const rivalPlan = disclosedRivalTargets(state);
    const rivalOrder = rivalPlan.indexOf(parcelId);
    const rivalTotal = rivalPlan.length;
    const rivalTarget = rivalOrder >= 0;
    const parcelEvents = [...(state.events?.order ?? [])].sort()
      .map((id) => state.events.byId[id])
      .filter((event) =>
        event.anchorIds.includes(parcelId)
        && event.resolveQuarter === state.quarter
        && event.status !== 'resolved'
        && event.status !== 'cancelled');
    const auction = parcelEvents.find(({ type }) => type === 'auction') ?? null;
    const amenityNotes = parcel.amenityNotes.slice(0, 3);
    const amenityList = amenityNotes.length
      ? `<section class="card__amenities" aria-label="Amenity price contributors">
          <div class="card__amenity-title">Amenity field</div>
          <ul>
            ${amenityNotes.map((note) => `
              <li>
                <span class="card__amenity-source">${note.sourceLabel}</span>
                <span class="card__amenity-distance">${note.distance} tile${note.distance === 1 ? '' : 's'}</span>
                <span class="card__amenity-bp ${note.bp > 0 ? 'gain' : 'loss'}">${signedPct(note.bp)}</span>
                ${note.synergy ? `<span class="card__amenity-synergy">${note.synergy}</span>` : ''}
              </li>
            `).join('')}
          </ul>
        </section>`
      : '';

    const intel = state.intel?.parcels?.[parcelId] ?? null;
    const parcelStatus = state.parcelStatus[parcelId];
    const anchorValuation = commercialAnchorValuation(city, state, parcelId);
    const survey = canApplyAction(city, state, { type: 'survey', parcelId });
    const walk = walkCommitDisclosure(city, state, {
      type: 'walk',
      avatarId: 'player',
      destination: { kind: 'parcel', id: parcelId },
      purchase: null,
      brokerChoice: null,
    });
    const insure = owner === 'player'
      ? canApplyAction(city, state, { type: 'insure', parcelId, cover: 'both' })
      : null;
    const remediate = owner === 'player'
      ? canApplyAction(city, state, { type: 'remediate', parcelId })
      : null;
    const district = city.districts.find(({ id }) => id === parcel.districtId);
    const districtDrift = city.districtDriftPlan[parcel.districtId];
    const geographyStats = [
      row('District', parcel.districtName),
      row('Research analogue', escapeHtml(district.researchAnalogue)),
      row('Raw anchor', escapeHtml(district.rawAnchor)),
      row('Raw index', district.designIndex.toLocaleString()),
      row(
        'Applied band',
        `${district.appliedBandBp.toLocaleString()} bp · ${(district.appliedBandBp / 100).toFixed(2)}%`,
      ),
      row('Compression', RULES.districtCompressionExponent.toFixed(2)),
      row(
        'District forecast',
        `${signedBp(districtDrift.forecastBp)} bp next quarter · cumulative ${(
          (state.districtIndexBp?.[parcel.districtId] ?? 10000) / 10000
        ).toFixed(4)}×`,
        districtDrift.forecastBp >= 0 ? 'gain' : 'loss',
      ),
      row(
        'Source / date',
        `<a href="${escapeHtml(district.researchSourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(
          `${district.researchSource} · ${district.researchSourceDate}`,
        )}</a>`,
      ),
      row('Frontage', `${parcel.tram ? 'tram · ' : ''}${parcel.corner ? 'corner' : 'standard'}`),
      row(
        owner ? 'Corridor uplift' : 'Corridor if acquired',
        owner
          ? (corridor ? `+${pct(corridor)} · ${links.length} link${links.length === 1 ? '' : 's'}` : 'none')
          : (preview.links.length
            ? `+${pct(preview.rentBp)} rent · +${pct(preview.valueBp)} value · ${preview.links.length} link${preview.links.length === 1 ? '' : 's'}`
            : 'none — no holding beside it'),
        owner ? (corridor ? 'gain' : '') : (preview.links.length ? 'gain' : ''),
      ),
    ].join('');
    const intelStats = [
      row(
        'Condition',
        holding?.construction
          ? 'Works underway'
          : (
            owner || intel?.conditionRevealed
              ? conditionLabel(condition)
              : 'Unsurveyed. Condition may assess one rung lower at settle.'
          ),
      ),
      row(
        'Flood exposure',
        intel?.floodExposureBp !== null && intel?.floodExposureBp !== undefined
          ? pct(intel.floodExposureBp)
          : (activeEventExposure(city, state, parcelId).lowLying
            ? 'Low-lying · survey for exact band'
            : 'Survey for exact band'),
      ),
      row(
        'Fire exposure',
        intel?.fireExposureBp !== null && intel?.fireExposureBp !== undefined
          ? pct(intel.fireExposureBp)
          : 'Unsurveyed',
      ),
      row(
        'People demand',
        (state.avatars?.player?.accessTokens?.peopleDemandUntilQuarter ?? 0) >= state.quarter
          ? signedPct(state.blockDemandBp?.[`${parcel.bx},${parcel.bz}`] ?? 0)
          : 'Presence visible · Food token reveals exact bp',
      ),
      row(
        'Hired pros',
        (() => {
          const parts = [];
          const hires = holding?.hires ?? {};
          if (hires.architect && hires.architect.expiresAfterQuarter >= state.quarter) {
            parts.push(`Design ${hires.architect.brief} Q${hires.architect.expiresAfterQuarter}`);
          } else if (holding?.hire?.profession === 'architect'
            && holding.hire.expiresAfterQuarter >= state.quarter) {
            parts.push(`Design ${holding.hire.brief} Q${holding.hire.expiresAfterQuarter}`);
          }
          if (hires['cheap-builder'] && hires['cheap-builder'].expiresAfterQuarter >= state.quarter) {
            parts.push(`Builder cost Q${hires['cheap-builder'].expiresAfterQuarter}`);
          } else if (holding?.hire?.profession === 'cheap-builder'
            && holding.hire.expiresAfterQuarter >= state.quarter) {
            parts.push(`Builder cost Q${holding.hire.expiresAfterQuarter}`);
          }
          if (hires['property-agent'] && hires['property-agent'].expiresAfterQuarter >= state.quarter) {
            parts.push(`Sales 0–15% Q${hires['property-agent'].expiresAfterQuarter}`);
          }
          return parts.length
            ? parts.join(' · ')
            : 'None. Builder, Design, and Sales briefs can overlap.';
        })(),
      ),
    ].join('');
    const effectStats = owner ? [
      row(
        'Insurance',
        holding?.insurance
          ? `${holding.insurance.fire ? 'fire' : ''}${holding.insurance.fire && holding.insurance.flood ? ' + ' : ''}${holding.insurance.flood ? 'flood' : ''} · through Q${holding.insurance.expiresAfterQuarter}`
          : 'uninsured',
      ),
      row(
        'Tenant',
        parcelStatus.occupancy === 'tenant'
          ? `${parcelStatus.tenant?.quality ?? 'standard'} · ${parcelStatus.tenant?.paymentAtRisk ? 'payment at risk' : 'paying'}`
          : occupancyLabel(parcelStatus.occupancy),
      ),
      row('Succession', levelLabel(level)),
    ].join('') : [
      row('Running yield', pct(runningYield)),
      row('Occupancy', occupancyLabel(parcelStatus.occupancy)),
    ].join('');

    const tags = [
      parcel.tram ? '<span class="tag tag--tram">Tram</span>' : '',
      parcel.corner ? '<span class="tag tag--corner">Corner</span>' : '',
      parcel.consolidated ? '<span class="tag tag--permit">1×2 pad</span>' : '',
      holding?.construction
        ? `<span class="tag tag--rival">${escapeHtml(
          constructionStage(holding.construction, state.quarter)?.short
            ?? 'Works',
        )}</span>`
        : '',
      holding?.renovation ? '<span class="tag tag--corridor">Reno</span>' : '',
      holding
        ? `<span class="tag tag--permit" title="${escapeHtml(ceilingTitle(holding.planningCeiling ?? 0, maxPermitLevelFor(parcel, holding)))}">Ceiling L${holding.planningCeiling ?? 0}</span>`
        : '',
      rivalTarget ? `<span class="tag tag--rival">Petridis ${rivalOrder + 1}</span>` : '',
      auction ? '<span class="tag tag--corner" data-auction-in-rail>Auction</span>' : '',
      auction?.payload?.deceasedEstate
        ? '<span class="tag tag--corner" data-deceased-estate>Deceased estate</span>'
        : '',
      sector?.label ? `<span class="tag">${escapeHtml(sector.label)}</span>` : '',
    ].filter(Boolean).join('');

    const contribution = parcelSettlementContribution(city, state, parcelId, viewerSeatId);
    const debt = holding?.debt ?? 0;
    const metrics = [
      ['MV', moneyExact(value), 'amber'],
      ['Equity', moneyExact(value - debt), value - debt >= 0 ? 'gain' : 'loss'],
      ['Net / qtr', signedMoney(contribution), contribution >= 0 ? 'gain' : 'loss'],
      ['Debt', moneyExact(debt), ''],
    ];

    const atRisk = Boolean(
      parcelStatus.damage
      || parcelStatus.tenant?.paymentAtRisk
      || parcelStatus.occupancy === 'squatted'
      || parcelEvents.some(({ type }) => ['fire', 'flash-flood', 'tenant-arrears'].includes(type)),
    );
    // Owned player parcels: stack every currently legal decision section (not exclusive if).
    // Free land / rival / no decision → one-line corridor pitch. Acquire stays on fixedActions.
    // Full geography / RAW ANCHOR / COMPRESSION lives under Details.
    let contextTitle = '';
    let contextHtml = '';
    let isDecisionContext = false;
    // Stacked blocks include their own section titles.
    let contextTitlesInternal = false;
    const amenityNearby = amenityNotes.length > 0;
    const corridorPitchHtml = (owned) => {
      if (owned) {
        return corridor
          ? `<p class="card__pitch card__pitch--chips"><span class="pitch-chip pitch-chip--ok">Corridor +${pct(corridor)}</span><span class="pitch-chip">${links.length} link${links.length === 1 ? '' : 's'}</span></p>`
          : `<p class="card__pitch card__pitch--chips"><span class="pitch-chip pitch-chip--bad">No corridor link</span>${amenityNearby ? '<span class="pitch-chip pitch-chip--ok">Amenity nearby</span>' : ''}</p>`;
      }
      if (preview.links.length) {
        return `<p class="card__pitch card__pitch--chips"><span class="pitch-chip pitch-chip--ok">Corridor if acquired +${pct(preview.rentBp)} rent</span><span class="pitch-chip">${preview.links.length} link${preview.links.length === 1 ? '' : 's'}</span></p>`;
      }
      return `<p class="card__pitch card__pitch--chips"><span class="pitch-chip pitch-chip--bad">No corridor link</span>${amenityNearby ? '<span class="pitch-chip pitch-chip--ok">Amenity nearby</span>' : ''}</p>`;
    };

    this._pickerHtml = '';
    let planningHtml = '';
    let tenantExitHtml = '';
    let worksNote = '';
    let pendingWorksHtml = '';
    let riskHtml = '';
    let vacantTenantHtml = '';
    if (owner === 'player') {
      this._roomUpgradeHtml = '';
      const underWorks = Boolean(holding?.renovation || holding?.construction);
      const blocks = [];

      // 1. Risk / works first when active (priority banners; still stack with later sections).
      if (atRisk) {
        riskHtml = riskContextHtml(
          city,
          state,
          parcelId,
          parcelEvents,
          insure ?? { ok: false, reason: 'Acquire this parcel before insuring it.' },
          remediate ?? { ok: false, reason: 'Acquire this parcel before remediating it.' },
          true,
        );
        blocks.push(contextBlock('Resolving risk / arrears', riskHtml));
      }
      if (underWorks) {
        pendingWorksHtml = holding.construction
          ? constructionProgressHtml(state, holding)
          : `<div class="card__context-grid">
              <strong>Renovation underway</strong>
              ${row('Ready after', `Q${holding.renovation.startedQuarter} settles`)}
              ${row('Risk', 'May finish one condition step lower')}
            </div>`;
        blocks.push(contextBlock('Pending works', pendingWorksHtml));
      }

      // 2. Room upgrades live only on the side rail (R30h) — no duplicate main-column block.
      // Desktop: sticky right rail · narrow: stacked sticky room band under actions.
      const roomUpgradeHtml = roomRenovateSheetHtml(city, state, parcelId);
      this._roomUpgradeHtml = roomUpgradeHtml;

      // 3. Lease — vacant only. Compact when room upgrades also stack.
      if (
        !underWorks
        && parcelStatus.occupancy !== 'tenant'
        && parcelStatus.occupancy !== 'squatted'
      ) {
        vacantTenantHtml = tenantSheetHtml(city, state, parcelId);
        blocks.push(contextBlock('Tenant decision', vacantTenantHtml));
      }

      // Permit ladder and works progress persist through the WORKS page.
      {
        const parcelForPermit = activeParcel(city, state, parcelId);
        const maxP = parcelForPermit ? maxPermitLevelFor(parcelForPermit) : 1;
        const showPlanning = (holding.planningCeiling ?? 0) < maxP
          || (holding.planningCeiling ?? 0) >= 1
          || level < RULES.maxLevel;
        planningHtml = showPlanning
          ? planningContextHtml(city, state, parcelId)
          : '';
        tenantExitHtml = parcelStatus.occupancy === 'tenant'
          ? tenantExitChoiceHtml(city, state, parcelId)
          : '';
        worksNote = holding.construction
          ? `<p class="build-progress__desc" data-blueprint-works>Building ${escapeHtml(ARCHETYPES[holding.construction.toArchetype]?.label ?? holding.construction.toArchetype)} · ${escapeHtml(constructionStage(holding.construction, state.quarter)?.short ?? 'Works')} · Q${holding.construction.completionQuarter ?? ''}</p>`
          : '';
        this._pickerHtml = RULES.redevelopButtonRetired
          ? ''
          : redevelopPickerHtml(
            city,
            state,
            parcelId,
            dq,
            Boolean(tenantExitHtml),
          );
        blocks.push(contextBlock(
          'Works · permits',
          `${worksNote}${planningHtml}`,
        ));
      }

      // 5. Corridor pitch only when nothing decision-like is on the sheet.
      if (blocks.length) {
        isDecisionContext = true;
        contextTitlesInternal = true;
        contextTitle = 'Parcel decisions';
        contextHtml = blocks.join('');
      } else {
        contextTitle = 'Corridor';
        contextHtml = corridorPitchHtml(true);
      }
    } else if (atRisk) {
      // Free land / rival: keep risk banner; insure/remediate stay gated. Acquire is on fixedActions.
      isDecisionContext = true;
      contextTitle = 'Resolving risk / arrears';
      contextHtml = riskContextHtml(
        city,
        state,
        parcelId,
        parcelEvents,
        insure ?? { ok: false, reason: 'Acquire this parcel before insuring it.' },
        remediate ?? { ok: false, reason: 'Acquire this parcel before remediating it.' },
        false,
      );
    } else if (holding?.renovation || holding?.construction) {
      isDecisionContext = true;
      contextTitle = 'Pending works';
      contextHtml = holding.construction
        ? redevelopmentPreviewHtml(state, parcelId, {
          ...holding.construction,
          cost: 0,
          constructionValue: value,
          sectorAfter: buildingBaseFor(
            parcel,
            holding.construction.toArchetype,
            RULES.maxCondition,
            { parcelStatus },
          ).sector,
          profession: null,
          level,
          nextLevel: holding.construction.nextLevel,
        }, Boolean(tenantExitHtml))
        : `<div class="card__context-grid">
            <strong>Renovation underway</strong>
            ${row('Completion', `Next eligible settle after Q${holding.renovation.startedQuarter}`)}
            ${row('Defect', `${(holding.renovation.defectChanceBp / 100).toFixed(1)}%`)}
            ${row('Defect outcome', 'One condition rung below target')}
          </div>`;
    } else {
      // Free land / rival pitch — acquire remains on the fixed action row.
      contextTitle = owner ? 'Corridor' : 'Corridor opportunity';
      contextHtml = corridorPitchHtml(Boolean(owner));
    }

    const history = parcelHistoryLines(state, parcelId, city);
    const historyHtml = history.length
      ? `<ol class="card__history">${history.map((line) => {
          const overdue = /arrears|overdue|fail/i.test(line.label);
          const paid = /rent|settlement|paid|acquire|divest/i.test(line.label);
          const stamp = overdue ? rubberStamp('overdue') : paid ? rubberStamp('paid') : '';
          return `<li class="ledger-row--stamped"><span>Q${line.q} · ${line.kind}</span><strong>${escapeHtml(line.label)}</strong>${stamp}</li>`;
        }).join('')}</ol>`
      : '<p class="card__empty">No parcel action or settle history yet.</p>';

    const topology = owner === 'player' ? topologyVerbModel(city, state, parcelId) : null;
    const topologyAction = topologyActionButtonHtml(topology);
    const amalgamHtml = amalgamPlateHtml(topology, parcelId);

    const venture = activeVenture(holding);
    const salesBriefLine = salesBriefBookLine(state, parcelId, holding, anchorValuation);
    const ipoCheck = owner === 'player' ? canIpo(city, state, parcelId) : { ok: false };
    const listedTicker = listedTickerOf(holding);
    const walkOffer = walkParcelOffer(city, state, parcelId);
    const desk = auction ? auctionDeskModel(city, state, auction) : null;
    const walkHere = verbButton({
      verb: 'walk',
      label: walkOffer.label,
      key: 'W',
      check: walk,
      className: `verb--walk-quote ${auction && !desk?.attending ? 'verb--primary' : 'verb--secondary'}`,
      available: [walkOffer.available, walk.spendHint].filter(Boolean).join(' · '),
      hint: [walkOffer.hint, walk.spendHint].filter(Boolean).join(' · '),
    });
    const auctionBidButtons = (desk?.offers ?? []).map((offer) => verbButton({
      verb: `bid:${offer.amount}`,
      family: 'bid',
      label: offer.label,
      key: offer.id === 'outbid' || offer.id === 'reserve' ? 'B' : '',
      check: offer.check,
      className: offer.id === 'outbid' || (!desk.rivalMax && offer.id === 'reserve')
        ? 'verb--primary'
        : 'verb--secondary',
      available: offer.why,
      hint: `Cash reserved ${moneyExact(offer.cashAtCap)} · hammer on settle`,
    }));
    const acquisition = !owner ? acquisitionDisclosure(city, state, parcelId) : null;
    const rentNow = acquisition ? acquisition.rent : rentFor(city, state, parcelId);
    const tenanted = parcelStatus?.occupancy === 'tenant';
    // Gold marks an actionable commitment: Consolidate on PROPERTY and Renovate on
    // RENOVATION. The stashed Redevelop control returns only when its RULES flag is off.
    const ownedPrimary = (() => {
      if (holding?.construction || holding?.renovation) return null;
      if (topology?.ok && topology.kind === 'consolidate') return 'consolidate';
      if (!RULES.redevelopButtonRetired && redevelop.ok) return 'redevelop';
      if (renovate.ok) return 'renovate';
      return null;
    })();
    const vacantPadNow = Boolean(
      parcel.consolidated && level === 0 && !holding?.construction,
    );
    const redevelopAction = !RULES.redevelopButtonRetired && owner === 'player' && !tenanted
      ? verbButton({
        verb: 'redevelop',
        label: `Redevelop${dq ? ` ${money(dq.cost)}` : ''}`,
        key: '3',
        check: redevelop,
        className: ownedPrimary === 'redevelop' ? 'verb--primary' : 'verb--secondary',
        available: dq
          ? `${ARCHETYPES[dq.toArchetype].label} · L${dq.nextLevel}`
          : 'Lobby a higher permit, then redevelop.',
        hint: dq ? `${dq.durationQuarters ?? 1}q · L${dq.level}→L${dq.nextLevel}` : '',
        risk: '',
      })
      : '';
    const roomFinishAvailable = owner === 'player' && !vacantPadNow && !renovate.ok
      && ROOM_IDS.some((roomId) => FINISH_LEVELS.some((finish) => (
        canRenovateRoom(city, state, parcelId, roomId, finish).ok
      )));
    const wholeBuildingReason = renovate.reason === 'Already in renewed condition.'
      ? 'Whole-building condition is renewed.'
      : shortVerbReason('renovate', renovate.reason).replace(/^Renovate — /, 'Whole-building renovation — ');
    const renovateDisplayCheck = renovate.ok ? renovate : {
      ...renovate,
      reason: `${wholeBuildingReason}${roomFinishAvailable ? ' Room finishes are available below.' : ''}`,
    };
    const renovateAction = owner === 'player' && !vacantPadNow
      ? verbButton({
        verb: 'renovate',
        label: `Renovate${rq ? ` ${money(rq.cost)}` : ''}`,
        key: '2',
        check: renovateDisplayCheck,
        exactBlockedReason: true,
        className: ownedPrimary === 'renovate' ? 'verb--primary' : 'verb--secondary',
        available: rq
          ? `Whole-building · ${moneyExact(rq.cost)} · 1 action · ${conditionLabel(rq.condition)}→${conditionLabel(rq.nextCondition)}`
          : 'Whole-building condition lift (1 action).',
        hint: rq
          ? `1 action · ${conditionLabel(rq.condition)}→${conditionLabel(rq.nextCondition)}`
          : '',
        risk: rq?.defectChanceBp
          ? `${(rq.defectChanceBp / 100).toFixed(0)}% defect`
          : '',
      })
      : '';
    const permitRungsHtml = permitRungListHtml(city, state, parcelId, owner);
    const worksPriority = worksPagePriorityLayout({
      planningHtml,
      tenantHtml: tenantExitHtml || vacantTenantHtml,
      shopChangeUse: planningHtml.includes('data-change-use-ribbon'),
    });
    const readOnlyRenovationHtml = owner === 'player'
      ? ''
      : renovationSummaryHtml(city, state, parcelId, owner);
    const surveyAction = verbButton({
      verb: 'survey',
      label: 'Survey',
      key: 'S',
      check: survey,
      exactBlockedReason: true,
      className: 'verb--secondary',
      available: `Survey names condition and hazard bands. — ${money(RULES.surveyCost)} · 1 action`,
      hint: `${money(RULES.surveyCost)} · 1 action`,
    });
    const mergeFootAction = owner === 'player'
      && topology?.kind === 'consolidate'
      ? (topology.ok
        ? rivetPress(topologyAction.replace('class="verb ', 'class="verb verb--rivet '))
        : topologyAction)
      : '';
    const currentSurvey = parcelSurveyComplete(state, parcelId);
    const hazardFactsHtml = currentSurvey
      ? (owner === null
        ? surveyDossierHtml(intel, condition, aq)
        : `<div class="card__hazard-facts" data-hazard-facts data-surveyed="true">
            ${statChip('Flood', pct(intel.floodExposureBp))}
            ${statChip('Fire', pct(intel.fireExposureBp))}
          </div>`)
      : `<div class="card__hazard-facts card__hazard-facts--unsurveyed" data-hazard-facts data-surveyed="false">
          <div class="stat-chip stat-chip--unsurveyed"><span class="stat-chip__k">Unsurveyed</span></div>
        </div>`;
    const fixedActions = owner === 'player'
      ? [
        ipoCheck.ok ? verbButton({
          verb: 'ipo',
          family: 'lobby',
          label: `IPO · ${money(ipoCheck.quote.marketCap)}`,
          check: ipoCheck,
          className: 'verb--primary',
          available: `${ipoCheck.quote.multiple}× annual rent · ${ipoCheck.quote.shares.toLocaleString()} shares @ ${money(ipoCheck.quote.ipoPrice)}`,
          hint: `${money(ipoCheck.quote.quarterlyRent)}/q · ${money(ipoCheck.quote.annualRevenue)}/yr`,
        }) : (listedTicker
          ? `<p class="card__owner-banner" role="status">Listed ${escapeHtml(listedTicker)} · sell shares at the Exchange</p>`
          : ''),
        commercialAnchorPlateHtml(anchorValuation, parcelStatus?.tenant),
        ventureShapeHtml(venture, {
          seed: state.seed,
          parcelId,
          quarter: state.quarter,
        }),
        topology?.kind === 'subdivide' && !vacantPadNow ? topologyAction : '',
        verbButton({
          verb: 'divest',
          label: sq?.surrender
            ? 'Divest · surrender'
            : sq?.peSale
              ? `Divest to PE ${sq ? money(sq.proceeds) : ''}`
              : `Divest ${sq ? money(sq.proceeds) : ''}`,
          key: '4',
          check: divest,
          className: sq?.peSale ? 'verb--primary' : 'verb--secondary',
          available: sq?.peSale
            ? `Trade sale — the buyer takes ${escapeHtml(venture?.label ?? 'the startup')}. The shop returns to the market as a shop.`
            : sq
              ? `Cash ${moneyExact(sq.proceeds)} · debt clears ${moneyExact(sq.debtCleared)} · no action`
              : 'Divest this holding.',
          hint: sq
            ? (sq.surrender
              ? `Short ${money(sq.shortfall)} vs overdraft floor`
              : sq.peSale
                ? `Net ${money(sq.proceeds)}`
                : `Net ${money(sq.proceeds)}`)
            : '',
          risk: sq && !sq.surrender && !sq.peSale ? 'no action' : '',
        }),
      ].filter(Boolean)
      : [
        ...auctionBidButtons,
        ...(auction ? [] : [(() => {
          const funding = acquireFundingExplanation(aq, acquire.reason);
          const button = verbButton({
            verb: 'acquire',
            // COPY-DRAFT: label the action and put funding on the two supporting lines.
            label: 'Acquire',
            key: '1',
            check: funding ? { ok: false, reason: funding.concise } : acquire,
            exactBlockedReason: Boolean(funding),
            className: 'verb--primary',
            attrs: funding ? `aria-describedby="acquire-funding-${parcelId}"` : '',
            available: isFreeFollowUpAcquire(state, parcelId)
              ? `The parcel is yours at once, on ${pct(RULES.lvrBp)} debt. — ${pct(RULES.dutyBp)} duty · no action`
              : `The parcel is yours at once, on ${pct(RULES.lvrBp)} debt. — ${pct(RULES.dutyBp)} duty · 1 action`,
            hint: `pay ${money(aq.cashOut)} · cash left ${money(aq.postActionCash)}`
              + (isFreeFollowUpAcquire(state, parcelId) ? ' · Contact follow-up / no action' : ''),
            risk: aq.debtTaken ? `${money(aq.debtTaken)} new debt` : '',
          });
          if (!funding) return button;
          return `${button}<p class="acquire-funding" id="acquire-funding-${parcelId}" tabindex="0">${markMoney(funding.detail)}</p>`;
        })()]),
      ];
    // Walk sits on the card with a payoff hint. Acquire still buys; Walk stands you here.

    // A surveyed defect discount makes the dossier's third segment the deed price;
    // the header must not print a second, different number labelled Asking.
    const defectDiscounted = !owner && (aq.defectDiscount ?? 0) > 0;
    const priceLabel = owner ? 'Market' : defectDiscounted ? 'Deed' : 'Asking';
    const priceValue = owner ? value : aq.price;
    const rentLabel = owner ? 'Rent / qtr' : 'Owned rent / qtr';
    this.detailsOpen = true;
    const underWorksNow = Boolean(holding?.renovation || holding?.construction || roomJobs(holding).length);
    if (this._folderParcel !== parcelId) {
      this.folderPage = underWorksNow ? 'works' : 'sheet';
      this._folderParcel = parcelId;
    } else if (underWorksNow && this.folderPage === 'sheet') {
      this.folderPage = 'works';
    }
    const contextClass = isDecisionContext
      ? 'card__context card__context--decision'
      : 'card__context card__context--pitch';
    if (owner !== 'player') this._roomUpgradeHtml = '';
    const ownerRibbon = owner === 'player' ? 'YOURS' : owner === 'rival' ? 'PETRIDIS' : 'FOR SALE';
    const ribbonClass = owner === 'player' ? 'card__owner-ribbon--player' : owner === 'rival' ? 'card__owner-ribbon--rival' : 'card__owner-ribbon--free';
    const suburbChip = escapeHtml((parcel.districtName ?? '').split(/\s+/)[0] ?? '');
    const condemned = condition === 0 && Boolean(parcelStatus.damage || parcelStatus.occupancy === 'squatted');
    const vacantPad = Boolean(
      parcel.consolidated
      && (parcelStatus?.builtLevel ?? level) === 0
      && !holding?.construction,
    );
    const cardStamp = auction
      ? rubberStamp('under-offer')
      : condemned
        ? rubberStamp('condemned')
        : vacantPad
          ? rubberStamp('merged')
          : (holding?.planningCeiling >= 1 ? rubberStamp('approved') : '');
    const padUnlock = topology?.unlock ?? mergeUnlockFor(parcel);
    const sheetTitle = holding?.construction
      ? `Building ${archetype.label}`
      : vacantPad
        ? 'Vacant 1×2 pad'
        : holdingDisplayName(holding, archetype.label);
    const sheetSub = vacantPad
      ? `Holding pair · 1×2 pad · rebuild as ${padUnlock?.label ?? 'the larger form'}`
      : `${archetype.era} · ${archetype.storeys} storey${archetype.storeys === 1 ? '' : 's'}`;
    const sheetPhoto = vacantPad
      ? `<figure class="deed-plate deed-plate--wide" data-deed-polaroid data-pad-thumb="1">
      <img class="deed-plate__img" src="assets/img/ui-icons/pad-amalgam.png"
           alt="Vacant 1×2 pad" width="1024" height="768" decoding="async">
    </figure>`
      : `<figure class="deed-polaroid" data-deed-polaroid>
      <img class="deed-polaroid__img is-loading" src="${archetypeThumbSrc(archetypeId)}"
           alt="${escapeHtml(archetype.label)}"
           width="512" height="384" loading="eager" decoding="async" fetchpriority="high"
           data-archetype-thumb="${escapeHtml(archetypeId)}">
    </figure>`;
    const inverseAction = vacantPad && topologyAction
      ? topologyAction
        .replace(/verb--primary/g, 'verb--secondary')
        .replace('class="verb ', 'class="verb verb--inverse ')
      : '';
    const actionRow = (() => {
      const primary = fixedActions.find((h) => h && (h.includes('verb--rivet') || h.includes('verb--primary'))) || fixedActions[0] || '';
      const rest = fixedActions.filter((h) => h && h !== primary);
      const stamps = rest.filter((h) => h.includes('card__status-stamp') || h.includes('card__owner-banner'));
      const secondary = rest.filter((h) => !stamps.includes(h));
      return `
        ${hazardFactsHtml}
        <div class="card__actions-primary">${primary}</div>
        ${inverseAction ? `<div class="card__actions-inverse">${inverseAction}</div>` : ''}
        ${secondary.length ? `<div class="card__actions-secondary">${secondary.join('')}</div>` : ''}
        ${stamps.join('')}
        <div class="card__actions-survey-merge" data-survey-merge-actions>
          ${surveyAction}
          ${mergeFootAction}
          ${walkHere}
        </div>
      `;
    })();
    const html = `
      <header class="deed-binder" style="--district-accent: ${districtAccent(parcel.districtId)}">
        <div class="deed-tab" data-deed-tab>
          <span>${parcelId.toUpperCase()}</span>
          <span class="deed-tab__suburb">${suburbChip}</span>
        </div>
        <div class="card__band">
          <span class="card__band-district" title="${escapeHtml(planningZoneTitle(parcel.zoneId))}">${escapeHtml(planningZoneLabel(parcel.zoneId))}</span>
          <span class="card__band-parcel" aria-hidden="true"></span>
          <span class="card__band-ribbon ${ribbonClass}">${ownerRibbon}</span>
        </div>
        <button class="card__close" type="button" aria-label="Close card">✕</button>
      </header>
      <nav class="deed-pages" role="tablist" aria-label="Deed pages">
        <button type="button" role="tab" data-card-tab="sheet">PROPERTY</button>
        <button type="button" role="tab" data-card-tab="works">WORKS</button>
        <button type="button" role="tab" data-card-tab="ledger">BOOKS</button>
      </nav>
      <section class="card__folder-page deed-well" data-card-panel="sheet" role="tabpanel">
        ${cardStamp ? `<div class="card__stamp-slot card__stamp-slot--sheet">${cardStamp}</div>` : ''}
        ${banjoFindBannerHtml(state, parcelId)}
        <header class="card__head card__identity" data-card-section="identity">
          <div class="card__identity-grid${vacantPad ? ' card__identity-grid--plate' : ''}">
            <div class="card__identity-copy">
              <div class="card__title">${escapeHtml(sheetTitle)}</div>
              <div class="card__sub">${escapeHtml(sheetSub)}</div>
              <div class="card__tags">${tags}</div>
            </div>
            ${sheetPhoto}
          </div>
          ${desk ? auctionCaptionHtml(desk) : ''}
          <section class="card__lead-cost" aria-label="Asking price and rent">
            <span class="card__lead-cost-line"><span class="label">${priceLabel}</span><strong class="amber value value--flap">${moneyHtml(priceValue)}</strong></span>
            <span class="card__lead-cost-line"><span class="label">${rentLabel}</span><strong class="value value--flap">${moneyHtml(rentNow)}</strong></span>
            <!-- COPY-DRAFT: separate the deed total from how it is funded. -->
            ${acquisition ? `<p data-acquisition-disclosure>${escapeHtml(acquisition.tenancy)}. Gross at current conditions, before costs and interest. Deed ${moneyExact(aq.price)} + duty ${moneyExact(aq.duty)} = ${moneyExact(aq.price + aq.duty)}. Paid as ${moneyExact(aq.cashOut)} cash and ${moneyExact(aq.debtTaken)} new debt.</p>` : ''}
            ${(() => {
              const forecourt = petrolForecourtForParcel(city, state, parcelId);
              return forecourt
                ? `<span class="card__lead-cost-line" data-forecourt-trade><span class="label">Forecourt</span><strong class="value">${escapeHtml(forecourt.line)}</strong></span>`
                : '';
            })()}
          </section>
          ${(() => {
            // V4.5 Wave 1 — process-tree stage panel. Entry: PropertyCard.show()
            // after the lead-cost plate, before amalgamHtml.
            const formId = standingProcessForm(city, state, parcelId)
              ?? holding?.archetypeId
              ?? archetypeId;
            if (!PROCESS_KIT[formId]) return '';
            const combo = comboStateFor(city, state).byParcel?.[parcelId] ?? null;
            const run = holding?.processRun ?? null;
            const delayLines = (state.log ?? [])
              .filter((row) => row.parcelId === parcelId && row.type === 'process-delay')
              .map((row) => row.body)
              .slice(-4);
            const ack = readWorldDrawAck();
            const fireDamage = fireDamageForFacility(ack.world, formId, ack.worldBeat);
            const p14World = readOpenWorldEnvelope();
            const p14Repair = p14RepairButtonHtml(
              formId,
              p14World,
              p14World?.beat ?? ack.worldBeat ?? 0,
              state?.cash,
            );
            return facilityStagePanelHtml({
              processId: run?.processId ?? holding?.processId ?? null,
              formId,
              run,
              comboChip: combo?.chip ?? run?.comboChip ?? '',
              delayLines,
              remainingBeats: run?.remainingBeats ?? null,
              fireDamage,
            }) + p14Repair;
          })()}
        </header>
        ${amalgamHtml}
        <div class="card__actions card__actions--fixed card__actions--r30b" data-card-section="action" aria-label="Parcel actions">
          ${vacantTenantHtml ? `<button type="button" class="verb verb--secondary" data-lease-shortcut>
            <span class="verb__stack"><span class="verb__label">Choose a tenant</span><small class="verb__hint">Compare offers · no action</small></span>
          </button>` : ''}
          ${actionRow}
        </div>
        ${corridorPitchHtml(Boolean(owner))}
      </section>
      <section class="card__folder-page deed-well" data-card-panel="works" role="tabpanel" hidden>
        ${worksPriority.beforeNav}
        <nav class="works-pages" role="tablist" aria-label="Works pages">
          <button type="button" role="tab" data-works-page="ladder">PERMIT</button>
          <button type="button" role="tab" data-works-page="rooms">RENOVATION</button>
        </nav>
        <div class="works-stage">
        <div class="works-panel has-scroll-affordance" data-works-panel="ladder" data-scroll-affordance="gutter-fade">
          <div class="works-panel__scroll">
            ${worksPriority.beforePermitRungs}
            ${permitRungsHtml}
            ${worksPriority.afterPermitRungs}
            ${this._pickerHtml || ''}
            ${redevelopAction ? `<div class="works-panel__commit" data-permit-redevelop>${redevelopAction}</div>` : ''}
            ${riskHtml}
            ${pendingWorksHtml}
            ${worksNote}
          </div>
        </div>
        <div class="works-panel has-scroll-affordance" data-works-panel="rooms" data-scroll-affordance="gutter-fade" hidden>
          <div class="works-panel__scroll">
            ${renovateAction ? `<div class="works-panel__commit renovation-ribbon-row" data-renovation-action data-renovation-ribbon>${renovateAction}</div>` : ''}
            ${owner === 'player' ? roomPolaroidHtml(city, state, parcelId) : ''}
            ${this._roomUpgradeHtml ?? ''}
            ${readOnlyRenovationHtml}
          </div>
        </div>
        </div>
      </section>
      <section class="card__folder-page deed-well" data-card-panel="ledger" role="tabpanel" hidden>
        ${ledgerRegisterHtml({
          value,
          debt,
          contribution,
          parcel,
          condition: holding?.construction
            ? 'works'
            : (owner || intel?.conditionRevealed ? conditionLabel(condition) : 'unsurveyed'),
          intel,
          corridor,
          links,
          preview,
          owner,
          amenityNotes,
          history,
          flood: intel?.floodExposureBp != null && intel?.floodExposureBp !== undefined
            ? pct(intel.floodExposureBp)
            : 'survey',
          fire: intel?.fireExposureBp != null && intel?.fireExposureBp !== undefined
            ? pct(intel.fireExposureBp)
            : 'survey',
          brokerOffer,
          salesBriefLine,
          anchorValuation,
          forecourtLine: petrolForecourtForParcel(city, state, parcelId)?.line ?? null,
          formName: holdingDisplayName(holding, vacantPad ? 'Vacant 1×2 pad' : archetype.label),
        })}
        <button type="button" class="card__ledger-link verb verb--primary" data-run-ledger>View run history · free</button>
      </section>
    `;

    this.lastCity = city;
    this.lastState = state;
    this._render(html, 'Parcel details');
    this.element.classList.remove(
      'card--person',
      'card--person-working',
      'card--civic',
      'card--fringe',
      'has-scroll-affordance',
    );
    delete this.element.dataset.scrollAffordance;
    this.element.classList.add('card--deed');
    this.element.dataset.folderPage = this.folderPage || 'sheet';
    this._paintArchetypeThumbs();
  }

  _paintArchetypeThumbs() {
    if (!this.element) return;
    this.element.querySelectorAll('img[data-archetype-thumb]').forEach((img) => {
      const id = img.dataset.archetypeThumb;
      const polaroid = Boolean(img.closest('[data-deed-polaroid]'));
      const mark = (state) => {
        img.classList.remove('is-loading', 'is-ready', 'is-fallback');
        img.classList.add(state);
      };
      const fallback = () => {
        const url = this.thumbnails?.make(id);
        if (url && img.getAttribute('src') !== url) {
          img.src = url;
          mark('is-fallback');
          return;
        }
        mark(img.naturalWidth > 0 ? 'is-ready' : 'is-loading');
      };
      const ready = () => {
        if (img.naturalWidth > 0) mark('is-ready');
        else fallback();
      };
      if (polaroid) {
        img.loading = 'eager';
        img.removeAttribute('loading');
        mark('is-loading');
      }
      if (img.complete) {
        ready();
        return;
      }
      img.addEventListener('load', ready, { once: true });
      img.addEventListener('error', fallback, { once: true });
      img.decode?.().then(ready).catch(fallback);
    });
  }

  _render(html, ariaLabel) {
    this._disposePortrait3d?.();
    this._disposePortrait3d = null;
    this._disposeDioramas();
    if (!this.element) {
      this.element = document.createElement('aside');
      this.element.className = 'card card--instrument';
      this.element.setAttribute('role', 'dialog');
      this.host.appendChild(this.element);
      this.element.addEventListener('click', (event) => {
        const close = event.target.closest('.card__close');
        if (close) {
          const closedSelection = this.selection;
          this.close();
          this.onClose?.(closedSelection);
          return;
        }
        const familySignal = event.target.closest('[data-family-signal-blocks]');
        if (familySignal) {
          const blockIds = String(familySignal.dataset.familySignalBlocks ?? '')
            .split(';').map((id) => id.trim()).filter(Boolean);
          this.onAction?.('focus-family-signal', null, { blockIds });
          return;
        }
        const replay = event.target.closest('.card__cast-replay');
        if (replay) {
          const stage = replay.closest('.card__cast-media');
          const loop = stage?.querySelector('.card__cast-loop, .card__cast-work');
          if (loop) {
            loop.currentTime = 0;
            loop.play?.().catch(() => {});
          }
          return;
        }
        const lotStep = event.target.closest('[data-market-lot-step]');
        if (lotStep) {
          if (lotStep.disabled) return;
          event.preventDefault();
          this._adjustMarketLots(lotStep);
          return;
        }
        const personAction = event.target.closest('[data-person-action]');
        if (personAction) {
          if (personAction.disabled) return;
          this.onAction?.(personAction.dataset.personAction, personAction.dataset.personId);
          return;
        }
        const snap = event.target.closest('[data-card-snap]');
        if (snap) {
          this.element.classList.toggle('card--collapsed');
          const collapsed = this.element.classList.contains('card--collapsed');
          snap.textContent = collapsed ? '▸' : '▾';
          snap.setAttribute('aria-label', collapsed ? 'Expand card' : 'Collapse card');
          return;
        }
        // _syncWorksPages writes data-works-page onto the card root. A bare
        // closest('[data-works-page]') therefore matches ASIDE.card and swallows
        // every folder-tab click before the [data-card-tab] branch (r4 A6).
        if (this._activateFolderChrome(event.target)) return;
        if (event.target.closest('[data-run-ledger]')) {
          openModal(this.host, {
            label: 'Run history',
            returnFocus: () => this.element?.querySelector('[data-run-ledger]'),
            html: runHistoryHtml(this.lastState),
          });
          return;
        }
        const button = event.target.closest('[data-verb]');
        const farmGoto = event.target.closest('[data-farm-goto]');
        if (farmGoto) { this.onAction?.('goto', farmGoto.dataset.farmGoto); return; }
        if (!button || button.disabled) return;
        // Parcel actions use parcelId; civic/reserve gifts use selection id (or null for focus).
        const verb = button.dataset.verb;
        if (verb === 'build-farm') { this.onAction?.({ type: 'place-building', parcelId: this.parcelId, catalogId: 'farm' }); return; }
        if (verb === 'select-process') {
          this.onAction?.({
            type: 'select-process',
            parcelId: this.parcelId,
            processId: button.dataset.processId,
          });
          return;
        }
        if (verb === 'repair-facility') {
          this.onAction?.({
            type: 'repair-facility',
            parcelId: this.parcelId,
            facilityId: button.dataset.facilityId,
            facilityKey: button.dataset.facilityId,
          });
          return;
        }
        if (verb === 'build-warship') {
          this.onAction?.({ type: 'build-warship' });
          return;
        }
        if (verb === 'fringe-venue') {
          this.onAction?.({
            type: 'fringe-venue',
            id: button.dataset.fringeId,
          });
          return;
        }
        // Room upgrade verbs encode room + finish: renovate-room:kitchen:basic
        if (verb?.startsWith('renovate-room:')) {
          const [, roomId, finish] = verb.split(':');
          this.onAction?.('renovate-room', this.parcelId, { roomId, finish });
          return;
        }
        // V3.70 L6 change-of-use. Dispatched as a full action object rather than a verb string
        // because `lobby:<n>` is parsed as a LEVEL by the verb translator, and a use permit has
        // no level — encoding one there would apply for storeys instead. The object form is the
        // established payload path for actions the string grammar cannot carry (the exchange desk
        // and the shop both use it) and reaches the same `applyAction` call.
        if (verb === 'civic-upgrade') {
          this.onAction?.({
            type: 'civic-upgrade',
            useId: button.dataset.useId,
            civicId: this.selection?.id ?? null,
          });
          return;
        }
        if (verb === 'university-donate') {
          this.onAction?.({ type: 'university-donate' });
          return;
        }
        if (verb === 'university-fund') {
          this.onAction?.({
            type: 'university-fund',
            ideaId: button.dataset.ideaId,
          });
          return;
        }
        if (verb?.startsWith('lobby-use:')) {
          const usePermitId = verb.slice('lobby-use:'.length);
          const targetId = button.dataset.parcelId ?? this.parcelId ?? this.selection?.id ?? null;
          if (!targetId || !usePermitId) return;
          this.onAction?.({
            type: 'lobby',
            avatarId: 'player',
            parcelId: targetId,
            usePermitId,
          });
          return;
        }
        this.onAction?.(
          verb,
          button.dataset.parcelId ?? this.parcelId ?? this.selection?.id ?? null,
        );
      });
      this.element.addEventListener('pointerover', (event) => {
        const hover = event.target.closest('[data-room-hover]');
        if (!hover || !this.element.contains(hover)) return;
        this._setRoomPreview(
          hover.dataset.roomHover,
          hover.dataset.finishHover || 'tired',
          { focus: false },
        );
      });
      this.element.addEventListener('click', (event) => {
        const row = event.target.closest('.room-reno-row');
        if (!row || !this.element.contains(row) || event.target.closest('[data-verb]')) return;
        this._setRoomPreview(row.dataset.room, row.dataset.finishHover || 'tired');
      });
      // Window-level Enter in main.js calls trySettle() and preventDefault.
      // Stop the key here so a focused tab still activates (Space + Enter).
      this.element.addEventListener('keydown', (event) => {
        const familySignal = event.target.closest('[data-family-signal-blocks]');
        if (familySignal && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          event.stopPropagation();
          const blockIds = String(familySignal.dataset.familySignalBlocks ?? '')
            .split(';').map((id) => id.trim()).filter(Boolean);
          this.onAction?.('focus-family-signal', null, { blockIds });
          return;
        }
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
          const tab = event.target.closest('[data-card-tab], .works-pages [data-works-page]');
          if (tab && this.element.contains(tab)) {
            const group = tab.matches('[data-card-tab]')
              ? [...this.element.querySelectorAll('[data-card-tab]')]
              : [...this.element.querySelectorAll('.works-pages [data-works-page]')];
            if (group.length) {
              const index = group.indexOf(tab);
              let next = index;
              if (event.key === 'ArrowRight') next = (index + 1) % group.length;
              else if (event.key === 'ArrowLeft') next = (index - 1 + group.length) % group.length;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = group.length - 1;
              const dest = group[next];
              if (dest) {
                dest.focus();
                this._activateFolderChrome(dest);
                event.preventDefault();
                event.stopPropagation();
              }
            }
            return;
          }
        }
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (!this._activateFolderChrome(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
      });
    }
    this.element.classList.add('card--left-seated');
    delete this.element.dataset.personId;
    delete this.element.dataset.fringeId;
    delete this.element.dataset.civicId;
    if (this.parcelId) this.element.dataset.parcelId = this.parcelId;
    else delete this.element.dataset.parcelId;
    this.element.setAttribute('aria-label', ariaLabel);
    this.element.classList.toggle('card--strategic', ariaLabel === 'Parcel details');
    this.element.innerHTML = html;
    this._mountDioramas();
    this.element.querySelectorAll('.card__stamp-slot').forEach((slot) => {
      slot.style.pointerEvents = 'none';
    });
    if (document.hidden) {
      this.element.style.animation = 'none';
      this.element.style.opacity = '1';
    }
    this.activeTab ??= 'intel';
    this.folderPage ??= 'sheet';
    this.worksPage ??= 'ladder';
    this._syncTab();
    this._bindRoomPreview();
    const identity = this.element.querySelector('.card__identity, .card__head, .card__landuse-head');
    if (identity && !identity.querySelector('[data-card-snap]') && ariaLabel !== 'Person and contact details') {
      identity.insertAdjacentHTML(
        'beforeend',
        '<button class="card__snap" type="button" data-card-snap aria-label="Collapse card">▾</button>',
      );
    }
    // Phone round P1 L2b: sheet-phone.js dresses the card as a sheet in this same task (the camera reads its state straight after show()).
    this.host?.dispatchEvent?.(new CustomEvent('districtdeck:card-render'));
  }

  _disposeDioramas() {
    for (const controller of this._dioramaControllers ?? []) controller.dispose();
    this._dioramaControllers = [];
  }

  _mountDioramas() {
    if (!this.element) return;
    const parse = (value) => {
      if (value === '') return undefined;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : value;
    };
    this._dioramaControllers = [...this.element.querySelectorAll('[data-card-diorama]')]
      .map((host) => {
        const kind = host.dataset.cardDiorama;
        const opts = {};
        for (const [key, value] of Object.entries(host.dataset)) {
          if (key === 'cardDiorama') continue;
          const parsed = parse(value);
          if (parsed !== undefined) opts[key] = parsed;
        }
        return mountDiorama(kind, host, opts);
      });
  }

  _bindRoomPreview() {
    const root = this.element?.querySelector('[data-room-reno]');
    if (!root) {
      this.element?.classList.remove('card--room-rail');
      return;
    }
    this.element.classList.remove('card--room-rail');
    const focus = root.dataset.roomFocus || 'kitchen';
    const finish = root.dataset.roomFinish || 'tired';
    this._setRoomPreview(focus, finish);
  }

  _setRoomPreview(roomId, finish = 'tired', { focus = true } = {}) {
    if (!this.element) return;
    const img = this.element.querySelector('[data-room-preview-img]');
    const title = this.element.querySelector('[data-room-preview-title]');
    const sub = this.element.querySelector('[data-room-preview-sub]');
    if (!img) return;
    if (this.element.querySelector('[data-works-overlay]')) return;
    const src = roomPreviewSrc(roomId, finish);
    if (img.getAttribute('src') !== src) {
      img.style.opacity = '0.55';
      img.onload = () => { img.style.opacity = '1'; };
      img.src = src;
    }
    img.alt = `${roomId} ${roomFinishDisplayName(finish)} finish illustration`;
    if (title) title.textContent = String(roomId).replace(/-/g, ' ').toUpperCase();
    const row = [...this.element.querySelectorAll('.room-reno-row')].find(r => r.dataset.room === roomId);
    if (sub) sub.textContent = 'ILLUSTRATION · ' + roomPreviewCaption(finish, row?.dataset.currentFinish ?? 'tired', row?.dataset.queuedFinish, row?.dataset.completionQuarter, roomFinishDisplayName).toUpperCase();
    if (focus) {
      this.element.querySelectorAll('.room-reno-row').forEach((row) => {
        row.classList.toggle('is-focused', row.dataset.room === roomId);
      });
      const root = this.element.querySelector('[data-room-reno]');
      if (root) {
        root.dataset.roomFocus = roomId;
        root.dataset.roomFinish = finish;
      }
    }
  }

  _syncDetails() {
    if (!this.element) return;
    const root = this.element.querySelector('[data-card-details-root]');
    if (!root) return;
    const open = Boolean(this.detailsOpen);
    root.classList.toggle('is-open', open);
    const toggle = root.querySelector('[data-card-details]');
    if (toggle) {
      toggle.setAttribute('aria-expanded', String(open));
      const chevron = toggle.querySelector('.card__details-chevron');
      if (chevron) chevron.textContent = open ? '▴' : '▾';
    }
    const body = root.querySelector('.card__details-body');
    if (body) body.hidden = !open;
  }

  /**
   * Stock Exchange lot stepper: update selected board-lot multiples and patch
   * buy/sell verb units + labels without a full card re-render.
   */
  _adjustMarketLots(stepButton) {
    const row = stepButton.closest('.market-lot');
    if (!row || !this.lastCity || !this.lastState) return;
    const assetId = row.dataset.marketAsset;
    const venueId = row.dataset.marketVenue;
    const lotSize = Number(row.dataset.marketLotSize);
    const price = Number(row.dataset.marketPrice);
    const held = Number(row.dataset.marketHeld);
    const avgCost = Number(row.dataset.marketAvgCost);
    const maxBuyLots = Number(row.dataset.marketMaxBuyLots);
    const maxSellLots = Number(row.dataset.marketMaxSellLots);
    if (!assetId || !venueId || !Number.isInteger(lotSize) || lotSize < 1) return;

    const delta = Number(stepButton.dataset.marketLotStep);
    const maxLots = Math.max(1, maxBuyLots, maxSellLots);
    const current = Number(row.dataset.marketLots) || 1;
    const nextLots = Math.max(1, Math.min(maxLots, current + (Number.isFinite(delta) ? delta : 0)));
    this.marketLots[assetId] = nextLots;
    row.dataset.marketLots = String(nextLots);

    const countEl = row.querySelector('[data-market-lot-count]');
    if (countEl) countEl.textContent = String(nextLots);

    const dec = row.querySelector('[data-market-lot-step="-1"]');
    const inc = row.querySelector('[data-market-lot-step="1"]');
    if (dec) dec.disabled = nextLots <= 1;
    if (inc) inc.disabled = nextLots >= maxLots;

    const units = nextLots * lotSize;
    const buyTotal = price * units;
    const sellTotal = price * units;
    // Cash / holdings only — no artificial unit ceiling.
    const canBuy = nextLots <= maxBuyLots && units >= 1;
    const canSell = nextLots <= maxSellLots && units >= 1;

    const buyCheck = canBuy
      ? canTrade(this.lastCity, this.lastState, {
        type: 'trade', assetId, side: 'buy', units, venueId,
      })
      : { ok: false, reason: maxBuyLots < 1
        ? `Not enough cash for a ${lotSize}-unit batch.`
        : `Select 1–${maxBuyLots} batches to buy.` };
    const sellCheck = canSell
      ? canTrade(this.lastCity, this.lastState, {
        type: 'trade', assetId, side: 'sell', units, venueId,
      })
      : { ok: false, reason: maxSellLots < 1 ? 'None held.' : `Select 1–${maxSellLots} batches to sell.` };

    const buttons = row.querySelectorAll('[data-person-action]');
    for (const button of buttons) {
      const action = button.dataset.personAction ?? '';
      const isBuy = action.startsWith(`trade:${assetId}:buy:`);
      const isSell = action.startsWith(`trade:${assetId}:sell:`);
      if (!isBuy && !isSell) continue;
      const side = isBuy ? 'buy' : 'sell';
      const check = isBuy ? buyCheck : sellCheck;
      const total = isBuy ? buyTotal : sellTotal;
      const verb = `trade:${assetId}:${side}:${units}`;
      button.dataset.personAction = verb;
      button.disabled = !check.ok;
      button.classList.toggle('verb--blocked', !check.ok);
      const reason = check.ok
        ? `${isBuy ? 'Buy' : 'Sell'} ${units} ${assetId} · ${moneyExact(total)} · no action`
        : shortVerbReason(verb, check.reason);
      button.title = reason;
      button.dataset.reason = reason;
      const label = button.querySelector('.verb__label');
      if (label) {
        label.textContent = isBuy
          ? `Buy ${units} · ${money(total)}`
          : (canSell || maxSellLots >= 1 ? `Sell ${units} · ${money(total)}` : 'Sell');
      }
      const hint = button.querySelector('.verb__hint');
      if (hint) {
        if (isBuy) {
          hint.textContent = `${nextLots} batch${nextLots === 1 ? '' : 'es'} · cash only`;
          hint.hidden = !check.ok;
        } else if (held > 0) {
          const unrealized = (price - avgCost) * held;
          const unrealizedBp = avgCost > 0
            ? Math.round(((price - avgCost) / avgCost) * 10000)
            : 0;
          const pnl = formatMarketPnl(unrealized, unrealizedBp);
          hint.textContent = `${pnl.text} · hold ${held}`;
          hint.hidden = !check.ok;
        } else {
          hint.textContent = 'none held';
          hint.hidden = !check.ok;
        }
      }
      let reasonEl = button.querySelector('.verb__reason');
      if (!check.ok) {
        if (!reasonEl) {
          const stack = button.querySelector('.verb__stack');
          reasonEl = document.createElement('small');
          reasonEl.className = 'verb__reason';
          stack?.appendChild(reasonEl);
        }
        reasonEl.textContent = shortVerbReason(verb, check.reason);
      } else if (reasonEl) {
        reasonEl.remove();
      }
    }
  }

  /** Folder pages + works sub-pages. Must not match the card root's data-works-page. */
  _activateFolderChrome(target) {
    if (!(target instanceof Element) || !this.element?.contains(target)) return false;
    if (target.closest('[data-open-renovation]')) {
      this.folderPage = 'works';
      this.worksPage = 'rooms';
      this._syncTab();
      this._syncWorksPages();
      // The button sits in the PERMIT panel, which is now hidden: keep keyboard focus on the
      // RENOVATION tab, or it falls to the body, where Tab moves the board and Enter settles.
      this.element.querySelector('.works-pages [data-works-page="rooms"]')?.focus();
      return true;
    }
    if (target.closest('[data-lease-shortcut]')) {
      this.folderPage = 'works';
      this.worksPage = 'ladder';
      this._syncTab();
      // Keep keyboard focus on navigation; opening offers never selects a lease.
      this.element.querySelector('[data-card-tab="works"]')?.focus();
      return true;
    }
    const worksPage = target.closest('button[data-works-page], [data-works-page]:not(.card)');
    if (worksPage && worksPage !== this.element && this.element.contains(worksPage)) {
      this.worksPage = worksPage.dataset.worksPage || 'ladder';
      this._syncWorksPages();
      return true;
    }
    const tab = target.closest('[data-card-tab]');
    if (tab && this.element.contains(tab)) {
      const key = tab.dataset.cardTab;
      if (['sheet', 'works', 'ledger'].includes(key)) this.folderPage = key;
      else this.activeTab = key;
      this._syncTab();
      return true;
    }
    return false;
  }

  _syncTab() {
    if (!this.element) return;
    const folder = this.element.querySelector('[data-card-tab="sheet"], [data-card-tab="works"]');
    const active = folder
      ? (['sheet', 'works', 'ledger'].includes(this.folderPage) ? this.folderPage : 'sheet')
      : (this.activeTab === 'history' ? 'history' : 'intel');
    this.element.dataset.folderPage = active;
    for (const button of this.element.querySelectorAll('[data-card-tab]')) {
      const selected = button.dataset.cardTab === active;
      button.setAttribute('aria-selected', String(selected));
      button.classList.toggle('is-active', selected);
    }
    for (const panel of this.element.querySelectorAll('[data-card-panel]')) {
      const isActive = panel.dataset.cardPanel === active;
      panel.hidden = !isActive;
      if (isActive) {
        panel.removeAttribute('hidden');
        panel.classList.add('is-entering');
        panel.addEventListener('animationend', () => panel.classList.remove('is-entering'), { once: true });
      }
    }
    this._syncWorksPages();
  }

  _syncWorksPages() {
    if (!this.element) return;
    const page = ['ladder', 'rooms'].includes(this.worksPage) ? this.worksPage : 'ladder';
    this.worksPage = page;
    this.element.dataset.worksPage = page;
    for (const button of this.element.querySelectorAll('[data-works-page]')) {
      const selected = button.dataset.worksPage === page;
      button.setAttribute('aria-selected', String(selected));
      button.classList.toggle('is-active', selected);
    }
    for (const panel of this.element.querySelectorAll('[data-works-panel]')) {
      panel.hidden = panel.dataset.worksPanel !== page;
    }
  }
}
