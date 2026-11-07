// District Deck — Aido quarterly minute. Self-contained; observes __districtDeck
// read-only. Never mutates game state. Copy is a pure function of seed + quarter.

import { hash32 } from '../core/rng.js';
import {
  ARCHETYPES, SECTOR_IDS, SECTORS, RULES, DISTRICTS,
} from '../core/content.js';
import {
  navOf, heldBy, forecastFor, corridorLinks, canAcquire, acquireQuote, cashPosition,
  conditionOf, archetypeIdOf, rentFor, canDivest, divestQuote,
} from '../core/economy.js';
import { activeAdjacency } from '../core/city.js';
import { money, signedMoney, signedPct, pct, conditionLabel, escapeHtml } from '../core/format.js';
import { forecastRates } from '../core/rates.js';
import { ROOM_IDS, pendingRoomJob, roomJobs } from '../core/renovation-rooms.js';
import { franchiseUseMarket } from '../core/commercial-tenancy.js';
import { weatherMinuteCopy, weatherOf, rollFloodArm } from '../core/weather.js';
import { buildCatalog, canPlaceBuilding } from '../core/site-works.js';
import { cityDistrictRoster } from '../core/synergy-feed.js';
import { canApplyAction } from '../core/state.js';
import { storylineIntroForQuarter } from '../core/storyline.js';
import { chromeActionGlyphSvg } from './action-glyphs.js';
import { forcedSaleSuggestion } from './forced-sale-notice.js';

// forced-sale-notice.js holds settle notices for longer than one poll, so the minute that opens after the books is not raced.
export const POLL_MS = 500;
// Phone round P2a, fix 7: on the phone layer the minute appears where Continue was standing, and its File · Begin quarter (390x844: y 637-685) sits just above the
// bottom of Continue's box (y 682-726). The second tap of a quick double tap on Continue was snapped by touch adjustment to File, and the minute was filed unread.
// File ignores a pointer click whose press began within FILE_HOLD_MS of the minute appearing, on the phone layer only (the wide class and ?phoneHud=0 are untouched);
// Enter or Space on the focused File (a click with no pointer) is never held.
export const FILE_HOLD_MS = 400;
export function fileTapHeld({ phone, trusted, pointer, pressAt, shownAt }) {
  return Boolean(phone && trusted && pointer && Number.isFinite(pressAt) && Number.isFinite(shownAt) && pressAt - shownAt < FILE_HOLD_MS);
}
const ASSET = {
  portrait: 'assets/img/people/aido-portrait.png',
  seal: 'assets/img/ui-icons/stamp-quarter-seal.png',
};

export const AIDO_REMARKS = Object.freeze([
  'The family office has prepared the books.',
  'Cash is a tool. Leaving it idle is a choice.',
  'Petridis discloses his next two parcels.',
  'The minutes are short. The quarter is not.',
  'We keep the books. You keep the city.',
  'Liquidity first. Sentiment is not a strategy.',
  'A corridor starts at two. Buy the neighbour; both rents step up.',
  'The van on the reserve is not a metaphor. Its takings are real.',
  'Heritage is a constraint. Treat it as one.',
  'Idle rooms compound slower than idle cash.',
]);

export const BULLETIN_FOOTER = 'Aido keeps the minutes; you keep the city.';

const BULLETIN_SURFACE_WORD_LIMIT = 16;
const SUGGEST_IDLE = 'You have uncommitted cash. Review a purchase or works.';
const SUGGEST_OVERDRAFT = 'Your cash balance is overdrawn. Review the books before spending.';
const SUGGEST_OPEN = 'Walk the board before the first buy';

function suggestRenewLine(_subject, id) {
  return clipWords(`${parcelTag(id)} is tired. Renovate before the rent notices.`, BULLETIN_SURFACE_WORD_LIMIT);
}

function suggestCorridorLine(id) {
  return clipWords(
    `Buy ${parcelTag(id)} beside your holding to add a corridor link.`,
    BULLETIN_SURFACE_WORD_LIMIT,
  );
}

function suggestRivalLine(id) {
  return clipWords(`Deny Petridis on ${parcelTag(id)} this quarter`, BULLETIN_SURFACE_WORD_LIMIT);
}

export function bulletinSuggestPool(sampleId = 'P1202') {
  return Object.freeze([
    SUGGEST_IDLE,
    SUGGEST_OVERDRAFT,
    SUGGEST_OPEN,
    suggestRenewLine('parcel', sampleId),
    ...ROOM_IDS.map((room) => suggestRenewLine(room, sampleId)),
    suggestCorridorLine(sampleId),
    suggestRivalLine(sampleId),
  ]);
}

export function longestBulletinSuggest(sampleId = 'P1202') {
  return [...bulletinSuggestPool(sampleId)]
    .sort((a, b) => b.length - a.length || b.localeCompare(a))[0] ?? '';
}

export function bulletinNavLine(playerNav, rivalNav) {
  return `NAV ${money(playerNav)} · Petridis ${money(rivalNav)} · lead ${signedMoney(playerNav - rivalNav)}`;
}

function wireFillPool(desk, quarter) {
  const rows = [
    `Books opened on the ${desk} desk`,
    'No works completed on our holdings',
    'Petridis is already walking the tram',
    'The terrace still carries last dust',
    'No auction closed in the last settle',
    'People on the board report a quiet week',
    'No hazard paid out on the books',
    'Council printed nothing worth reading',
    'The port moved freight and said nothing',
    'A surveyor was seen on the strip',
    'Scaffolds up two streets over — not ours',
    'Tram gossip prices a corner high',
    'The exchange closed flat and smug',
  ];
  if (Number(quarter) > 1) rows.splice(6, 0, 'The books carry last quarter clean');
  return rows;
}

function eventKey(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/^event window:\s*/i, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sharedClauseKey(text) {
  return /\brent might not land\b/i.test(String(text ?? ''))
    ? 'shared:rent-might-not-land'
    : '';
}

function plateKindFor(...tokens) {
  const blob = tokens.filter(Boolean).join(' ').toLowerCase().replace(/[_-]+/g, ' ');
  const rules = [
    [/\bflood\b|\bstorm\b|flash flood/, 'flood'],
    [/\btenant|\btenancy|\barrears\b|\bnotice\b|payment warning/, 'tenancy'],
    [/\bpermit\b|\blobby\b|\bplanning\b/, 'permit'],
    [/\bmarket\b|\bexchange\b|\bforecast\b|\bdownturn\b|\binterest\b/, 'market'],
    [/\bworks\b|\brenovat|\bredevelop|\bfire\b/, 'works'],
    [/\bauction\b|\bacqui|\bbid\b|\btakes\b/, 'auction'],
  ];
  for (const [re, kind] of rules) {
    if (re.test(blob)) return kind;
  }
  return null;
}

function assignWireMarks(items) {
  return items.map((item) => ({
    ...item,
    plate: item.plate || plateKindFor(item.text),
  }));
}

/** Shared payoff clauses are one wire fact. Preserve their evidence as a count. */
function mergeSharedWireClauses(items) {
  const arrears = items.filter(({ text }) => /\brent might not land\b/i.test(String(text)));
  if (arrears.length < 2) return items;
  let emitted = false;
  return items.flatMap((item) => {
    if (!/\brent might not land\b/i.test(String(item.text))) return [item];
    if (emitted) return [];
    emitted = true;
    return [{
      ...item,
      text: `Rent might not land · ${arrears.length} places`,
      plate: 'tenancy',
    }];
  });
}

function mergeParcelStems(items) {
  const out = [];
  const buckets = new Map();
  for (const item of items) {
    const ids = [...String(item.text).matchAll(/\bP[0-9]+\b/g)].map((m) => m[0]);
    const stem = String(item.text)
      .replace(/\s*·\s*/g, ' ')
      .replace(/\bP[0-9]+\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (ids.length !== 1 || !stem) {
      out.push({ text: item.text, plate: item.plate });
      continue;
    }
    const key = `${item.plate ?? ''}::${stem}`;
    if (buckets.has(key)) {
      buckets.get(key).ids.push(ids[0]);
      continue;
    }
    const rec = { text: item.text, plate: item.plate, stem, ids: [ids[0]] };
    buckets.set(key, rec);
    out.push(rec);
  }
  return out.map((item) => {
    if (!item.ids) return { text: item.text, plate: item.plate };
    const ids = [...new Set(item.ids)].sort();
    let text = item.text;
    if (ids.length > 3) text = clipWords(`${item.stem} ${ids.length} parcels`, 10);
    else if (ids.length > 1) text = clipWords(`${item.stem} ${ids.join(', ')}`, 10);
    return { text, plate: item.plate };
  });
}

const FORECAST_LINES = Object.freeze([
  'Residential leads the forecast. Buy where next quarter’s rent is going.',
  'Retail is the soft line. Hold retail buys until the number turns.',
  'Office leads the forecast. Buy where next quarter’s rent is going.',
  'The three sectors stay nearly level. Buy on the parcel, not the sector.',
]);

const MACRO_IMPLY = Object.freeze({
  downturn: 'Hold cash for the sector reset — buyers eat first on the way back up.',
  'flash-flood': 'Insure the low-lying holdings before settle — uninsured, the flood takes the rent.',
  'interest-shock': 'Cut debt now, or meet Vinh for better terms before the rate lands.',
  'materials-spike': 'Quote works now or wait the spike out — mid-spike builds pay the premium.',
  clear: 'No shock is booked for next quarter. Build while the weather holds.',
});

export function mix32(seed, quarter, salt = '') {
  return hash32(`${Number(seed) >>> 0}::q${Number(quarter) || 1}::${salt}`);
}

function pick(pool, seed, quarter, salt) {
  const list = pool ?? [];
  if (!list.length) return '';
  return list[mix32(seed, quarter, salt) % list.length];
}

function words(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean);
}

function clipWords(text, max) {
  const parts = words(text);
  if (parts.length <= max) return parts.join(' ');
  return parts.slice(0, max).join(' ');
}

function deskName(city) {
  const counts = new Map();
  for (const id of city?.order ?? []) {
    const parcel = city.parcels?.[id];
    const name = parcel?.districtName
      ?? DISTRICTS.find((row) => row.id === parcel?.districtId)?.name
      ?? '';
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const raw = ranked[0]?.[0] ?? 'Richmond';
  return raw.replace(/\s+(Flat|East|North|Rise|Reach|Quay)$/i, '');
}

function yearOf(quarter) {
  return Math.floor((Math.max(1, Number(quarter) || 1) - 1) / 4) + 1;
}

export function bulletinDateLine(quarter, quarters = RULES.quarters, desk = 'Melbourne') {
  const horizon = Math.max(1, Math.floor(Number(quarters) || RULES.quarters));
  const q = Math.max(1, Math.min(horizon, Math.floor(Number(quarter) || 1)));
  const years = Math.ceil(horizon / 4);
  const intro = storylineIntroForQuarter(q, horizon);
  return `Q${q}/${horizon} · Year ${yearOf(q)}/${years} · ${intro.title} · ${desk} desk`;
}

function parcelTag(id) {
  return String(id ?? '').toUpperCase();
}

function blockTag(id) {
  return String(id ?? '').trim();
}

function formLabel(archetypeId) {
  const raw = ARCHETYPES[archetypeId]?.label ?? String(archetypeId ?? '').replace(/-/g, ' ');
  const label = raw.split(',')[0].trim();
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : '';
}

function sentenceFormLabel(archetypeId) {
  const label = formLabel(archetypeId);
  return label ? label.charAt(0).toLowerCase() + label.slice(1) : '';
}

function canonicalBulletinText(text) {
  return String(text ?? '')
    .replace(/\bAI developer\b/gi, 'Petridis')
    .replace(/\bthe rival\b/gi, 'Petridis')
    .replace(/\bRival\b/g, 'Petridis')
    .replace(/\bAuction on this block\b/gi, 'Auction on this parcel')
    .replace(/\bconstruction\b/gi, 'works')
    .replace(/\bsettlement\b/gi, 'settle')
    .replace(/\bsite\b/gi, 'parcel')
    .replace(/\blot\b/gi, 'parcel')
    .replace(/\bproperty\b(?!\s+group)/gi, 'parcel');
}

function readState(dd) {
  if (!dd?.serialise) return null;
  try {
    return JSON.parse(dd.serialise());
  } catch {
    return null;
  }
}

function lastLedger(state) {
  const rows = state?.ledger ?? [];
  return rows.length ? rows[rows.length - 1] : null;
}

function rivalVerb(move) {
  return String(move?.verb ?? move?.type ?? move?.kind ?? '').toLowerCase();
}

function receiptRows(row, field) {
  const direct = row?.[field] ?? [];
  if (field !== 'auctionTransactions') return direct;
  const transactions = (row?.transactions ?? []).filter(({ kind }) => kind === 'auction');
  const seen = new Set();
  return [...direct, ...transactions].filter((item) => {
    const key = [item.eventId, item.parcelId, item.outcome, item.winner].join('::');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function wireFromLedger(city, state, row) {
  const lines = [];
  for (const item of row?.completions ?? []) {
    const id = parcelTag(item.parcelId);
    const form = formLabel(item.archetypeId ?? archetypeIdOf(city, state, item.parcelId));
    if (form && id) lines.push({ text: `${form} topped out on ${id}`, plate: 'works' });
  }
  for (const item of row?.districtChanges?.formed ?? []) {
    const block = blockTag(item.blockId);
    if (item.name && block) {
      lines.push({ text: `${item.name} is live on the ${block}`, plate: 'wire' });
    }
  }
  for (const item of row?.districtChanges?.dissolved ?? []) {
    if (item.name) lines.push({ text: `${item.name} lapsed`, plate: 'wire' });
  }
  for (const tx of receiptRows(row, 'auctionTransactions')) {
    if (tx.kind && String(tx.kind).includes('forced')) continue;
    const id = parcelTag(tx.parcelId ?? tx.id);
    if (!id) continue;
    if (tx.outcome === 'sold') {
      lines.push({ text: `${id} sold under the hammer`, plate: 'auction' });
    } else if (tx.outcome === 'passed-in') {
      lines.push({ text: `${id} passed in`, plate: 'auction' });
    }
  }
  for (const item of row?.obligations ?? []) {
    if (item.kind !== 'lease') continue;
    const id = item.parcelId;
    const anchor = state?.parcelStatus?.[id]?.tenant?.anchor;
    if (anchor?.landed && anchor.brand) {
      lines.push({ text: `${anchor.brand} signs at ${parcelTag(id)}`, plate: 'tenancy' });
    }
  }
  for (const item of row?.propertyEvents ?? []) {
    if (item.kind === 'startup-valuation' && item.brand) {
      lines.push({ text: `${item.brand} takes a term sheet`, plate: 'market' });
    }
  }
  const rivalMoves = row?.rivalMove?.moves ?? [];
  for (const move of rivalMoves) {
    if (move.moved === false) continue;
    const id = parcelTag(move.parcelId ?? move.id);
    const verb = rivalVerb(move);
    if (verb === 'acquire') lines.push({ text: `Petridis takes ${id}`, plate: 'auction' });
    else if (verb === 'renovate') lines.push({ text: `Petridis renovates ${id}`, plate: 'works' });
    else if (verb === 'redevelop') lines.push({ text: `Petridis redevelops ${id}`, plate: 'works' });
    else if (verb === 'insure') lines.push({ text: `Petridis insures ${id}`, plate: plateKindFor(verb, move.cover) ?? 'flood' });
    else if (verb && id) {
      lines.push({ text: `Petridis ${verb.replace(/-/g, ' ')} ${id}`, plate: plateKindFor(verb) });
    }
  }
  for (const item of row?.renovationCompletions ?? []) {
    lines.push({ text: `Renovation complete on ${parcelTag(item.parcelId)}`, plate: 'works' });
  }
  for (const item of row?.propertyEvents ?? []) {
    if (item.hazard === 'fire') lines.push({ text: `Fire hits ${parcelTag(item.parcelId)}`, plate: 'works' });
    else if (item.hazard === 'flood') lines.push({ text: `Flood marks ${parcelTag(item.parcelId)}`, plate: 'flood' });
    else if (item.arrears) lines.push({ text: `Arrears open on ${parcelTag(item.parcelId)}`, plate: 'tenancy' });
  }
  return lines;
}

function liveEvents(state) {
  return [...(state?.events?.order ?? [])]
    .sort()
    .map((id) => state.events.byId[id])
    .filter((event) => event && event.status !== 'resolved' && event.status !== 'cancelled');
}

function thisQuarterEvents(state) {
  return liveEvents(state).filter((event) => event.resolveQuarter === state.quarter);
}

function wireFromEvents(state) {
  const lines = [];
  for (const event of thisQuarterEvents(state)) {
    const id = parcelTag(event.anchorIds?.[0] ?? event.parcelId);
    if (event.type === 'auction') {
      lines.push({ text: id ? `Auction opens on ${id}` : 'An auction opens this quarter', plate: 'auction' });
    } else if (event.type === 'flash-flood') {
      lines.push({ text: 'Flash flood watch is posted', plate: 'flood' });
    } else if (event.type === 'downturn') {
      lines.push({ text: 'Downturn is booked this settle', plate: 'market' });
    } else if (event.forecast?.headline) {
      lines.push({
        text: clipWords(canonicalBulletinText(event.forecast.headline), 10),
        plate: plateKindFor(event.type, event.forecast.headline),
      });
    }
  }
  return lines;
}

function nextMacro(state) {
  const nextQuarter = (state.quarter ?? 1) + 1;
  if (nextQuarter > (state.quarters ?? RULES.quarters)) {
    return { type: 'clear', headline: `Q${nextQuarter} CLEAR`, imply: MACRO_IMPLY.clear, severity: 0 };
  }
  const entry = state.macroPlan?.entries?.find(({ resolveQuarter }) => resolveQuarter === nextQuarter);
  // Floods are weather-armed now, so the forecast consults the same seeded
  // lookahead the scheduler uses — never the vestigial plan entry, which
  // stopped materialising floods when the weather stream took them over.
  const flood = rollFloodArm(state.seed ?? 0, nextQuarter);
  const planned = entry && entry.type !== 'flash-flood' ? entry : null;
  if (flood.armed && planned) {
    // Two shocks can share a quarter: a weather-armed flood never hides a
    // scheduled macro (critic R2 — seed 0/Q30 dropped the downturn).
    const label = String(planned.type).replace(/-/g, ' ').toUpperCase();
    return {
      type: planned.type,
      headline: `${label} + FLASH FLOOD · Q${nextQuarter}`,
      imply: `${MACRO_IMPLY[planned.type] ?? MACRO_IMPLY.clear} ${MACRO_IMPLY['flash-flood']}`,
      severity: Math.max(planned.severity ?? 0, 1),
    };
  }
  if (flood.armed) {
    return {
      type: 'flash-flood',
      headline: `FLASH FLOOD · Q${nextQuarter}`,
      imply: MACRO_IMPLY['flash-flood'],
      severity: entry?.type === 'flash-flood' ? (entry.severity ?? 1) : 1,
    };
  }
  if (!planned) {
    return { type: 'clear', headline: `Q${nextQuarter} CLEAR`, imply: MACRO_IMPLY.clear, severity: 0 };
  }
  const label = String(planned.type).replace(/-/g, ' ').toUpperCase();
  return {
    type: planned.type,
    headline: `${label} · Q${planned.resolveQuarter}`,
    imply: MACRO_IMPLY[planned.type] ?? MACRO_IMPLY.clear,
    severity: planned.severity ?? 0,
  };
}

function breachMacro(state, forcedSale) {
  const planned = nextMacro(state);
  if (!forcedSale) return planned;
  return {
    ...planned,
    imply: forcedSale.line,
    ...(planned.type !== 'clear' ? { shock: planned.imply } : {}),
  };
}

function forecastModel(city, state) {
  const table = forecastFor(city, state.quarter) ?? {};
  const rates = forecastRates(state, state.quarter);
  const rows = SECTOR_IDS.map((sector) => {
    const bp = table[sector] ?? 0;
    const arrow = bp > 40 ? '↑' : bp < -40 ? '↓' : '→';
    return {
      sector,
      label: SECTORS[sector].label.slice(0, 3).toUpperCase(),
      bp,
      arrow,
    };
  });
  const ranked = [...rows].sort((a, b) => Math.abs(b.bp) - Math.abs(a.bp) || a.sector.localeCompare(b.sector));
  let line = FORECAST_LINES[3];
  if (ranked[0] && Math.abs(ranked[0].bp) > 40) {
    if (ranked[0].sector === 'residential') line = FORECAST_LINES[0];
    else if (ranked[0].sector === 'retail') line = FORECAST_LINES[1];
    else line = FORECAST_LINES[2];
  }
  return { rows, line, rates };
}

function detectArcade(dd = globalThis.__districtDeck) {
  if (dd && (typeof dd.openRush === 'function' || dd.rush)) return true;
  if (typeof document === 'undefined') return false;
  return Boolean(document.querySelector('link[href*="ice-cream-rush"], script[src*="ice-cream-rush"]'));
}

function detectShop(dd = globalThis.__districtDeck) {
  if (dd && (typeof dd.openShop === 'function' || dd.shop)) return true;
  if (typeof document === 'undefined') return false;
  return Boolean(document.querySelector('link[href*="supermarket-td"], script[src*="supermarket-td"]'));
}

function prospectiveDistrictRent(city, state, row) {
  const blockId = row?.originBlockId;
  if (!blockId) return 0;
  const [bx, bz] = blockId.split(',').map(Number);
  const formation = {
    key: `${row.id}@${blockId}`,
    districtId: row.id,
    name: row.name,
    blockId,
    bx,
    bz,
    footprintBlockIds: [...(row.footprintBlockIds ?? [])],
  };
  const formations = state?.districtEngine?.formations ?? [];
  if (formations.some(({ key }) => key === formation.key)) return 0;
  const projected = {
    ...state,
    districtEngine: {
      ...(state?.districtEngine ?? {}),
      formations: [...formations, formation],
    },
  };
  return heldBy(state, 'player').reduce((sum, id) => (
    sum + Math.max(0, rentFor(city, projected, id) - rentFor(city, state, id))
  ), 0);
}

function districtEarnLine(city, state) {
  const rows = cityDistrictRoster(city, state)
    .filter(({ status }) => status === 'one-away')
    .map((row) => ({ row, payoff: prospectiveDistrictRent(city, state, row) }))
    .filter(({ payoff }) => Number.isFinite(payoff) && payoff > 0)
    .sort((left, right) => (
      right.payoff - left.payoff
      || left.row.name.localeCompare(right.row.name)
      || String(left.row.originBlockId).localeCompare(String(right.row.originBlockId))
    ));
  const hit = rows[0];
  const missing = hit?.row.members.find(({ status }) => status === 'missing');
  const shortForms = {
    gateway: 'Gateway',
    'freight-forms': 'Freight form',
    'valued-startups': 'Valued startup',
    'university-or-school': 'University',
  };
  const form = shortForms[missing?.id]
    ?? String(missing?.face ?? '').replace(/\s*×\d+\s*$/, '').trim();
  const block = blockTag(hit?.row.originBlockId);
  if (!hit || !form || !block) return null;
  return `The ${hit.row.name} wants one more piece — ${form} on the ${block}. It pays ${money(hit.payoff)}/q.`;
}

function franchiseEarnLine(city, state) {
  for (const id of heldBy(state, 'player')) {
    const useId = archetypeIdOf(city, state, id);
    const market = franchiseUseMarket(useId);
    if (!market) continue;
    const check = canApplyAction(city, state, {
      type: 'lease', parcelId: id, tenantQuality: 'franchise-anchor',
    });
    if (!check.ok) continue;
    return `The ${sentenceFormLabel(useId)} on ${parcelTag(id)} could take a franchise anchor. Bigger rent if the brand signs.`;
  }
  return null;
}

function ventureEarnLine(city, state) {
  const hits = heldBy(state, 'player').flatMap((id) => {
    const venture = state?.holdings?.[id]?.venture;
    const quote = venture?.status === 'valued' ? divestQuote(city, state, id) : null;
    const check = venture?.status === 'valued' ? canDivest(city, state, id) : null;
    const brand = venture?.label ?? venture?.brand;
    return check?.ok && quote?.peSale && brand
      ? [{ brand, value: quote.value, id }]
      : [];
  }).sort((left, right) => right.value - left.value || left.id.localeCompare(right.id));
  return hits[0] ? `${hits[0].brand} has a bid. The trade sale is yours to take.` : null;
}

function affordableBuildEarnLine(city, state) {
  const hits = [];
  for (const id of heldBy(state, 'player')) {
    for (const entry of buildCatalog()) {
      const check = canPlaceBuilding(city, state, id, entry.id);
      if (!check.ok || check.debtTaken <= 0) continue;
      hits.push({ id, entry, cashOut: check.cashOut });
    }
  }
  hits.sort((left, right) => (
    left.cashOut - right.cashOut
    || left.entry.label.localeCompare(right.entry.label)
    || left.id.localeCompare(right.id)
  ));
  const hit = hits[0];
  if (!hit) return null;
  return `${hit.entry.label} is buildable on ${parcelTag(hit.id)} — cash down ${money(hit.cashOut)}, debt carries the rest.`;
}

function earnLines(city, state, extras, seen = new Set()) {
  const lines = [];
  const push = (text) => {
    const next = clipWords(String(text ?? ''), BULLETIN_SURFACE_WORD_LIMIT);
    const key = eventKey(next);
    const shared = sharedClauseKey(next);
    if (!next || seen.has(next) || (key && seen.has(key)) || (shared && seen.has(shared))) return;
    seen.add(next);
    if (key) seen.add(key);
    if (shared) seen.add(shared);
    lines.push(next);
  };
  if (state.onlineView && state.cybercab?.economyVersion === 2) {
    push('Plan your Cybercab routes and service. Fleet earnings post when both players commit the quarter.');
  }
  if (extras?.arcade && !state.onlineView) {
    push('The van is out on the reserve. Run it and keep the takings.');
  }
  if (extras?.shop && !state.onlineView) {
    push('The supermarket is short a shift. Work it and the till pay is yours.');
  }
  for (const line of [
    districtEarnLine(city, state),
    franchiseEarnLine(city, state),
    ventureEarnLine(city, state),
    affordableBuildEarnLine(city, state),
  ]) push(line);
  for (const event of thisQuarterEvents(state)) {
    if (event.type === 'auction') {
      const id = parcelTag(event.anchorIds?.[0]);
      push(id
        ? `Auction on ${id} this quarter. Bring a maximum, not a hope.`
        : 'An auction window is open. Bring a maximum, not a hope.');
    } else if (event.resolveQuarter === state.quarter) {
      const head = canonicalBulletinText(event.forecast?.headline ?? event.type);
      push(head);
    }
  }
  if (!lines.length) {
    push(pick([
      'Nothing is posted. Bank an action or walk the strip and make your own quarter.',
      'No windows this quarter. Renovate something tired; rent remembers.',
      'Quiet board. Survey the corner you have been circling.',
      'Nothing posted. Lobby a rung now and build into next quarter.',
    ], state.seed, state.quarter, 'earn-empty'), { clip: false });
  }
  return lines.slice(0, 4);
}

function cashSuggestion(city, state) {
  const pos = cashPosition(city, state, 'player');
  // Available credit and auction reservations are not a drawn overdraft.
  if (pos.cash < 0) {
    return {
      icon: 'bank',
      line: SUGGEST_OVERDRAFT,
      evidence: `${money(-pos.cash)} overdraft drawn`,
      key: 'overdraft',
    };
  }
  const nav = navOf(city, state, 'player');
  const idle = Math.max(0, pos.ordinaryCash ?? state.cash ?? 0);
  if (nav <= 0 || idle < nav * 0.45) return null;
  return {
    icon: 'bank',
    line: SUGGEST_IDLE,
    evidence: `${money(idle)} uncommitted cash`,
    key: 'idle',
  };
}

function tiredRoomSuggestion(city, state) {
  const hits = [];
  for (const id of heldBy(state, 'player')) {
    const holding = state.holdings[id];
    if (holding?.construction || holding?.renovation) continue;
    if (conditionOf(city, state, id) < 1 && !roomJobs(holding).length) {
      hits.push({
        id,
        room: 'building',
        label: conditionLabel(0),
      });
    }
    const rooms = state.parcelStatus?.[id]?.rooms;
    if (!rooms) continue;
    for (const room of ROOM_IDS) {
      const cond = rooms[room];
      if (Number.isFinite(cond) && cond < 70 && !pendingRoomJob(holding, room)) {
        hits.push({ id, room, label: `cond ${cond}` });
      }
    }
  }
  hits.sort((a, b) => a.id.localeCompare(b.id) || a.room.localeCompare(b.room));
  const hit = hits[0];
  if (!hit) return null;
  const subject = hit.room === 'building' ? 'parcel' : hit.room;
  return {
    icon: 'survey',
    line: suggestRenewLine(subject, hit.id),
    evidence: `${parcelTag(hit.id)} ${subject} ${hit.label} · below Sound${roomJobs(state.holdings[hit.id]).map(job => ` · ${job.roomId} queued · finishes when Q${job.completionQuarter} settles`).join('')}`,
    key: 'rooms',
  };
}

function corridorSuggestion(city, state) {
  const owned = new Set(heldBy(state, 'player'));
  const hits = [];
  for (const id of owned) {
    const adj = activeAdjacency(city, state, id);
    const links = corridorLinks(city, state, id);
    const missing = adj.filter((n) => !owned.has(n) && !state.holdings?.[n]);
    if (links.length <= 1 && missing.length === 1 && canAcquire(city, state, missing[0])?.ok) {
      hits.push({ from: id, buy: missing[0] });
    }
  }
  hits.sort((a, b) => a.buy.localeCompare(b.buy) || a.from.localeCompare(b.from));
  const hit = hits[0];
  if (!hit) return null;
  return {
    icon: 'merge',
    line: suggestCorridorLine(hit.buy),
    evidence: `${parcelTag(hit.from)} neighbours ${parcelTag(hit.buy)} · ${owned.size} holding${owned.size === 1 ? '' : 's'} owned`,
    key: 'corridor',
  };
}

function rivalTargetSuggestion(city, state) {
  const targets = [...new Set(state.rival?.intent?.parcelIds ?? [])].sort();
  for (const id of targets) {
    const check = canAcquire(city, state, id);
    if (!check?.ok) continue;
    const quote = acquireQuote(city, state, id);
    const cashOut = Number.isFinite(quote?.cashOut) ? quote.cashOut : null;
    return {
      icon: 'acquire',
      line: suggestRivalLine(id),
      evidence: cashOut != null
        ? `${parcelTag(id)} · ${money(cashOut)} within cash`
        : `${parcelTag(id)} is an open Petridis target`,
      key: 'rival',
    };
  }
  return null;
}

function suggestionsFor(city, state, seen = new Set()) {
  const pool = [
    forcedSaleSuggestion(city, state),
    cashSuggestion(city, state),
    tiredRoomSuggestion(city, state),
    corridorSuggestion(city, state),
    rivalTargetSuggestion(city, state),
  ].filter(Boolean);
  const unique = [];
  for (const row of pool) {
    const line = clipWords(row.line, BULLETIN_SURFACE_WORD_LIMIT);
    const key = eventKey(line);
    if (!line || seen.has(line) || (key && seen.has(key))) continue;
    seen.add(line);
    if (key) seen.add(key);
    unique.push({ ...row, line });
    if (unique.length >= 2) break;
  }
  if (!unique.length) {
    const owned = heldBy(state, 'player');
    const pending = owned.flatMap(id => roomJobs(state.holdings[id]).map(job => ({ id, ...job })));
    const line = owned.length ? (pending.length ? 'Your room work is queued. Review it before you settle.' : 'Review your holdings before you settle.') : SUGGEST_OPEN;
    const evidence = owned.length
      ? `${owned.length} holding${owned.length === 1 ? '' : 's'} · ${money(state.cash ?? 0)} cash${pending.map(job => ` · ${parcelTag(job.id)} ${job.roomId} finishes when Q${job.completionQuarter} settles`).join('')}`
      : `${money(state.cash ?? 0)} cash · no holdings yet`;
    if (!seen.has(line)) {
      seen.add(line);
      unique.push({
        icon: 'survey',
        line,
        evidence,
        key: 'open',
      });
    }
  }
  return unique;
}

export function composeBulletin(city, state, extras = {}) {
  const seed = state?.seed ?? 0;
  const quarter = state?.quarter ?? 1;
  const quarters = state?.quarters ?? RULES.quarters;
  const desk = deskName(city);
  const storylineIntro = storylineIntroForQuarter(quarter, quarters);
  const selectedRemark = pick(AIDO_REMARKS, seed, quarter, 'remark');
  const invitedOpponent = state.onlineView && !state.rival?.policyId;
  // COPY-DRAFT: private plans resolve when both players Settle.
  const remark = state.onlineView && selectedRemark.includes('van on the reserve')
    ? 'Fleet earnings follow your dispatch plan. Keep your cabs working.'
    : invitedOpponent && selectedRemark.includes('Petridis discloses')
      ? 'Plans stay private until both players Settle.' : selectedRemark;
  const ledger = lastLedger(state);
  const sky = weatherMinuteCopy(weatherOf(state));
  const wire = mergeSharedWireClauses([
    { text: sky, plate: plateKindFor(sky) ?? 'flood' },
    ...wireFromLedger(city, state, ledger),
    ...wireFromEvents(state),
  ]);
  const seen = new Set();
  const unique = [];
  for (const item of wire) {
    const text = clipWords(item.text, 10);
    const key = eventKey(text);
    if (!text || seen.has(text) || (key && seen.has(key))) continue;
    seen.add(text);
    if (key) seen.add(key);
    unique.push({ ...item, text, plate: item.plate || plateKindFor(item.text) });
  }
  const merged = mergeParcelStems(unique);
  const fills = wireFillPool(desk, quarter);
  let fill = 0;
  while (merged.length < 1) {
    const text = pick(fills, seed, quarter, `fill:${fill}`);
    fill += 1;
    const key = eventKey(text);
    if (!text || seen.has(text) || (key && seen.has(key))) {
      if (fill > 12) break;
      continue;
    }
    seen.add(text);
    if (key) seen.add(key);
    merged.push({ text, plate: plateKindFor(text) });
  }
  const playerNav = navOf(city, state, 'player');
  const rivalNav = navOf(city, state, 'rival');
  const wireRows = assignWireMarks(merged.slice(0, 3));
  const printed = new Set([
    ...wireRows.flatMap((item) => [
      item.text, eventKey(item.text), sharedClauseKey(item.text),
    ].filter(Boolean)),
  ]);
  const earn = earnLines(city, state, extras, printed);
  const suggests = suggestionsFor(city, state, printed);
  const forcedSale = forcedSaleSuggestion(city, state);
  const model = {
    seed,
    quarter,
    quarters,
    year: yearOf(quarter),
    desk,
    dateLine: bulletinDateLine(quarter, quarters, desk),
    storylineIntro,
    office: 'DELACQUA FAMILY OFFICE',
    title: 'QUARTERLY MINUTE',
    prepared: 'prepared by Aido, Chief of Staff',
    remark,
    wire: wireRows,
    // In a breach quarter the macro desk leads with the forced sale. A booked shock stays on the next line;
    // a clear quarter does not keep the "build while the weather holds" filler.
    macro: breachMacro(state, forcedSale),
    forecast: forecastModel(city, state),
    earn,
    arcade: Boolean(extras.arcade) && !state.onlineView,
    shop: Boolean(extras.shop) && !state.onlineView,
    suggests,
    navLine: bulletinNavLine(playerNav, rivalNav).replace('Petridis', invitedOpponent ? 'Opponent' : 'Petridis'),
    footer: BULLETIN_FOOTER,
    filed: 'FILED',
  };
  return model;
}

export function canonicalBulletin(model) {
  return JSON.stringify(model);
}

function bulletinGlyph(name, className) {
  return chromeActionGlyphSvg(name, className)
    || chromeActionGlyphSvg('events', className);
}

function verbIconName(kind, text) {
  const blob = String(text ?? '');
  const mapped = kind || plateKindFor(blob);
  if (mapped === 'auction') return 'acquire';
  if (mapped === 'works') return /redevelop/i.test(blob) ? 'redevelop' : 'renovate';
  if (mapped === 'flood') return 'events';
  if (mapped === 'tenancy') return 'notice';
  if (mapped === 'market') return 'forecast';
  if (mapped === 'permit') return 'lobby';
  return 'wire';
}

function earnIconName(line) {
  const blob = String(line ?? '');
  if (/wants one more piece/i.test(blob)) return 'merge';
  if (/franchise anchor/i.test(blob)) return 'notice';
  if (/trade sale|has a bid/i.test(blob)) return 'divest';
  if (/\bis buildable on\b/i.test(blob)) return 'build';
  if (/van is (?:parked|out)|keep the takings|takings are yours/i.test(blob)) return 'walk';
  if (/shop on the strip|supermarket is short|till pay/i.test(blob)) return 'walk';
  if (/walk the reserve/i.test(blob)) return 'survey';
  if (/hold cash|nothing is posted/i.test(blob)) return 'bank';
  if (/no auction/i.test(blob)) return 'notice';
  const mapped = plateKindFor(blob);
  if (mapped) return verbIconName(mapped, blob);
  return 'earn';
}

function iconTileHtml(kind, text, compact = false, iconName = null) {
  const name = iconName || (compact ? earnIconName(text) : verbIconName(kind, text));
  const cls = compact ? 'qb__icon-tile qb__icon-tile--compact' : 'qb__icon-tile';
  return `<span class="${cls}" data-qb-icon-tile="${escapeHtml(name)}">${bulletinGlyph(name, 'qb__glyph qb__glyph--tile')}</span>`;
}

function chipHtml(sector, k, name, value, dir) {
  return `<span class="qb__chip" data-sector="${escapeHtml(sector)}" data-dir="${escapeHtml(dir)}">
    <span class="qb__chip-k">${escapeHtml(k)}</span>
    <span class="qb__chip-n">${escapeHtml(name)}</span>
    <span class="qb__chip-v">${escapeHtml(value)}</span>
  </span>`;
}

function section(id, title, icon, body) {
  return `
    <section class="qb__section" data-qb-section="${id}">
      <header class="qb__h">
        <span class="qb__section-glyph" data-qb-icon="${icon}" aria-hidden="true">${bulletinGlyph(icon, 'qb__glyph qb__glyph--section')}</span>
        <h2>${escapeHtml(title)}</h2>
      </header>
      ${body}
    </section>`;
}

export function renderBulletinHtml(model, ui = {}) {
  const dismissed = Boolean(ui.dismissed);
  const cue = dismissed
    ? 'Filed. Close to return to the city.'
    : 'Read the minute. File it to begin the quarter.';
  const fileLabel = dismissed ? 'CLOSE' : 'FILE · BEGIN QUARTER';
  const fileState = dismissed ? 'filed' : 'begin';
  const wire = model.wire.map((item) => {
    return `
    <li class="qb__wire-item is-icon" data-plate="${escapeHtml(item.plate ?? '')}">
      ${iconTileHtml(item.plate, item.text)}
      <p>${escapeHtml(item.text)}</p>
    </li>`;
  }).join('');
  const rates = model.forecast.rates ?? {};
  const infBp = rates.inflationForecastBp ?? 0;
  const intBp = rates.interestForecastBp ?? 0;
  const forecast = [
    chipHtml('inflation', 'INF', 'Inflation', signedPct(infBp), infBp > 0 ? 'up' : infBp < 0 ? 'down' : 'flat'),
    chipHtml('interest', 'INT', 'Interest', pct(intBp), 'flat'),
    ...model.forecast.rows.map((row) => chipHtml(
      row.sector,
      row.label,
      SECTORS[row.sector].label,
      signedPct(row.bp),
      row.arrow === '↑' ? 'up' : row.arrow === '↓' ? 'down' : 'flat',
    )),
  ].join('');
  const earn = model.earn.map((line, index) => (
    `<li class="qb__earn-item" data-earn="${index}">${iconTileHtml(null, line, true)}<span class="qb__earn-copy">${escapeHtml(line)}</span></li>`
  )).join('');
  const suggests = model.suggests.map((row) => `
    <li class="qb__suggest" data-suggest="${escapeHtml(row.key)}">
      ${iconTileHtml(null, row.line, true, row.icon)}
      <div class="qb__suggest-copy">
        <p>${escapeHtml(row.line)}</p>
        <p class="qb__suggest-evidence" data-qb-suggest-evidence>${escapeHtml(row.evidence)}</p>
      </div>
    </li>`).join('');
  return `
    <span class="qb__clip" aria-hidden="true"></span>
    <div class="qb__scroll has-scroll-affordance" data-qb-scroll data-scroll-affordance="gutter">
      <div class="qb__masthead" data-qb-section="masthead">
        <div class="qb__masthead-type">
          <h1 data-qb-masthead>${escapeHtml(model.title)}</h1>
        </div>
        <div class="qb__office">
          <p class="qb__office-name">${escapeHtml(model.office)}</p>
          <p class="qb__prepared">${escapeHtml(model.prepared)}</p>
          <p class="qb__date">${escapeHtml(model.dateLine)}</p>
        </div>
        <div class="qb__aido">
          <div class="qb__aido-frame">
            <img src="${ASSET.portrait}" alt="" width="72" height="96" data-qb-portrait>
          </div>
        </div>
        <img class="qb__seal" src="${ASSET.seal}" alt="" width="64" height="64">
        <p class="qb__remark">${escapeHtml(model.remark)}</p>
      </div>
      ${section('macro', 'MACRO DESK', 'macro', `
        <p class="qb__macro-head" data-macro="${escapeHtml(model.macro.type)}">${escapeHtml(model.macro.headline)}</p>
        <p class="qb__macro-imply">${escapeHtml(model.macro.imply)}</p>
        ${model.macro.shock ? `<p class="qb__macro-imply" data-qb-macro-shock>${escapeHtml(model.macro.shock)}</p>` : ''}`)}
      ${section('wire', 'THE WIRE', 'wire', `<ul class="qb__wire">${wire}</ul>`)}
      ${section('forecast', 'FORECAST', 'forecast', `
        <div class="qb__forecast" aria-label="Next-quarter rates">
          <p class="qb__forecast-kicker">NEXT-Q RATES</p>
          ${forecast}
        </div>
        <p>${escapeHtml(model.forecast.line)}</p>`)}
      ${section('earn', 'WAYS TO EARN', 'earn', `<ul class="qb__earn">${earn}</ul>`)}
      ${section('suggests', 'AIDO SUGGESTS', 'survey', `<ul class="qb__suggests">${suggests}</ul>`)}
    </div>
    <div class="qb__actions">
      <p class="qb__scroll-hint" data-qb-scroll-hint>Scroll down for forecast and advice ↓</p>
      <footer class="qb__footer" data-qb-section="footer">
        <p class="qb__nav">${escapeHtml(model.navLine)}</p>
        ${dismissed ? `<span class="qb__filed">${escapeHtml(model.filed)}</span>` : ''}
        <p class="qb__close">${escapeHtml(model.footer)}</p>
      </footer>
      <p class="qb__cue" data-qb-cue>${escapeHtml(cue)}</p>
      <button type="button" class="qb__file${dismissed ? ' qb__file--close' : ''}"
              data-qb-file data-qb-file-state="${fileState}">${fileLabel}</button>
    </div>`;
}

function ensureStyles() {
  if (document.querySelector('link[data-qb-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./quarterly-bulletin.css', import.meta.url).href;
  link.dataset.qbCss = '1';
  document.head.appendChild(link);
}

function otherOverlayOpen() {
  return Boolean(
    document.querySelector('.settlement-presenter')
    || document.querySelector('.overlay:not([hidden])')
    || document.querySelector('.loader:not(.loader--gone)'),
  );
}

function focusables(root) {
  return [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((node) => !node.hasAttribute('disabled') && node.offsetParent !== null);
}

export function mountQuarterlyBulletin(options = {}) {
  if (typeof document === 'undefined') return null;
  ensureStyles();
  const existing = document.querySelector('[data-qb-root]');
  if (existing && !options.replace) {
    return existing.__qb ?? null;
  }
  existing?.remove();

  const root = document.createElement('div');
  root.className = 'qb';
  root.dataset.qbRoot = '1';
  root.innerHTML = `
    <div class="qb__scrim" data-qb-scrim hidden></div>
    <div class="qb__sheet" data-qb role="dialog" aria-modal="true" aria-labelledby="qb-title" hidden>
    </div>`;
  document.body.appendChild(root);
  const sheet = root.querySelector('[data-qb]');
  const scrim = root.querySelector('[data-qb-scrim]');
  sheet.id = 'qb-sheet';

  let lastKey = '';
  let lastCanonical = '';
  let lastModel = null;
  let open = false;
  let pendingQuarter = null;
  let seen = new Set();
  let lastFocus = null;
  let hideTimer = 0;
  let timer = 0;
  let dismissed = false;
  let shownAt = NaN;
  let pressAt = NaN;
  sheet.addEventListener('pointerdown', (event) => { pressAt = event.timeStamp; }, true);

  const extrasNow = (dd) => ({
    arcade: detectArcade(dd),
    shop: detectShop(dd),
  });

  const paint = (model) => {
    lastModel = model;
    lastCanonical = canonicalBulletin(model);
    sheet.dataset.canonical = lastCanonical;
    sheet.innerHTML = renderBulletinHtml(model, { dismissed });
    const title = sheet.querySelector('h1');
    if (title) title.id = 'qb-title';
    sheet.setAttribute('aria-label', model.title);
    sheet.querySelector('[data-qb-file]')?.addEventListener('click', (event) => {
      const held = fileTapHeld({
        phone: document.documentElement.dataset.phoneHud === '1',
        trusted: event.isTrusted,
        pointer: event.detail > 0,
        pressAt: Number.isFinite(pressAt) ? pressAt : event.timeStamp,
        shownAt,
      });
      if (held) {
        event.preventDefault();
        return;
      }
      close();
    });
    const portrait = sheet.querySelector('[data-qb-portrait]');
    portrait?.addEventListener('error', () => {
      portrait.classList.add('is-absent');
      portrait.removeAttribute('src');
    }, { once: true });
    for (const img of sheet.querySelectorAll('img')) {
      img.addEventListener('error', () => {
        img.classList.add('is-missing');
      }, { once: true });
    }
    const scroller = sheet.querySelector('[data-qb-scroll]');
    const syncOverflow = () => {
      if (!scroller) return;
      scroller.classList.toggle('is-overflowing', scroller.scrollHeight > scroller.clientHeight + 1);
      const hint = sheet.querySelector('[data-qb-scroll-hint]');
      if (hint) hint.hidden = scroller.scrollHeight - scroller.scrollTop <= scroller.clientHeight + 1;
    };
    scroller?.addEventListener('scroll', syncOverflow, { passive: true });
    requestAnimationFrame(syncOverflow);
  };

  const composeNow = () => {
    const dd = window.__districtDeck;
    if (!dd?.city) return null;
    const state = readState(dd);
    if (!state) return null;
    return composeBulletin(dd.city, state, extrasNow(dd));
  };

  const trap = (event) => {
    if (!open || event.key !== 'Tab') return;
    const nodes = focusables(sheet);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const onKey = (event) => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    trap(event);
  };

  const show = (model, { restore = false } = {}) => {
    if (!model) return;
    if (!restore) dismissed = false;
    paint(model);
    open = true;
    shownAt = performance.now();
    pressAt = NaN;
    pendingQuarter = null;
    seen.add(model.quarter);
    lastKey = `${model.seed}:${model.quarter}`;
    window.clearTimeout(hideTimer);
    sheet.hidden = false;
    scrim.hidden = false;
    sheet.inert = false;
    // Establish the closed pose before starting the existing eased transition.
    if (!root.classList.contains('is-open')) void sheet.offsetHeight;
    root.classList.add('is-open');
    sheet.setAttribute('aria-hidden', 'false');
    lastFocus = document.activeElement;
    const scroller = sheet.querySelector('[data-qb-scroll]') ?? sheet;
    scroller.scrollTop = 0;
    sheet.scrollTop = 0;
    const file = sheet.querySelector('[data-qb-file]');
    window.setTimeout(() => {
      if (!open || !file?.isConnected) return;
      file?.focus({ preventScroll: true });
      scroller.scrollTop = 0;
      sheet.scrollTop = 0;
    }, 30);
    document.addEventListener('keydown', onKey, true);
    if (!restore) scroller.scrollTop = 0;
  };

  const close = () => {
    if (!open) return;
    dismissed = true;
    open = false;
    root.classList.remove('is-open');
    // Move focus out before hiding the dialog from assistive technology.
    if (lastFocus?.isConnected && !sheet.contains(lastFocus) && lastFocus !== document.body) lastFocus.focus?.();
    if (sheet.contains(document.activeElement)) document.querySelector('[data-status-view="quarterly"]')?.focus();
    if (sheet.contains(document.activeElement)) document.activeElement?.blur();
    sheet.inert = true;
    // display:none used to cancel the exit on the same frame it began.
    window.clearTimeout(hideTimer);
    const hide = () => {
      if (open) return;
      sheet.hidden = true;
      scrim.hidden = true;
    };
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) hide();
    else hideTimer = window.setTimeout(hide, 240);
    sheet.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', onKey, true);
  };

  const reopen = () => {
    const model = lastModel ?? composeNow();
    if (model) show(model, { restore: true });
  };

  scrim.addEventListener('click', () => close());

  const consider = () => {
    const dd = window.__districtDeck;
    if (!dd?.snapshot) return;
    const snap = dd.snapshot();
    const quarter = snap.quarter;
    const key = `${snap.seed}:${quarter}`;
    // First-time players already have the short introduction. Keep the initial
    // briefing available through Quarterly without queuing a second modal as
    // soon as they press Play. Later quarters retain the automatic bulletin.
    if (lastKey === '' && quarter === 1) {
      seen.add(quarter);
      lastKey = key;
    }
    if (key !== lastKey && !seen.has(quarter)) {
      pendingQuarter = quarter;
    }
    if (pendingQuarter != null && !open && !otherOverlayOpen()) {
      const model = composeNow();
      if (model && model.quarter === pendingQuarter) show(model);
    }
  };

  timer = window.setInterval(consider, POLL_MS);
  consider();

  const api = {
    compose: composeNow,
    canonical: () => lastCanonical || canonicalBulletin(composeNow() ?? {}),
    model: () => lastModel,
    isOpen: () => open,
    open: () => show(composeNow() ?? lastModel),
    close,
    reopen,
    dispose() {
      window.clearInterval(timer);
      window.clearTimeout(hideTimer);
      document.removeEventListener('keydown', onKey, true);
      root.remove();
    },
  };
  root.__qb = api;
  window.__districtDeckBulletin = api;
  return api;
}

if (typeof document !== 'undefined') {
  const boot = () => {
    if (!document.querySelector('main.game') && !/play\.html/i.test(location.pathname)) return;
    mountQuarterlyBulletin();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}
