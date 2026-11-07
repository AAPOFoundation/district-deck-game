// District Deck V3.03 Batch 5 — ordered presentation of an already-atomic settlement.
// This file never computes or applies money. It reveals the reducer's returned event and
// ledger row in the binding order, then announces final NAV once.

import { SECTOR_IDS, SECTORS } from '../core/content.js';
import {
  escapeHtml, moneyExact, signedMoney, signedPct,
} from '../core/format.js';
import { validateOwnRoomReceipts } from '../integrations/room-receipts.js';

export const SETTLEMENT_ORDER = Object.freeze([
  'forced-sale',
  'market',
  'rival',
  'auction-events',
  'people',
  'rent',
  'operating',
  'interest',
  'overdraft',
  'forecourt',
  'cybercab',
  'works',
  'districts',
  'nav',
]);

export const SETTLEMENT_DELTA_IDS = Object.freeze([
  'rent',
  'opex',
  'interest',
  'overdraft',
  'forecourt',
  'cybercab',
  'net',
  'cash',
  'nav',
]);

export const SETTLEMENT_CAUSE_ORDER = Object.freeze([
  'occupancy',
  'interest-shock',
  'overdraft',
  'disruption',
  'event',
  'market',
  'district-drift',
  'family-signal',
  'district-change',
  'works',
  'forced-sale',
]);

const DELTA_LABELS = Object.freeze({
  rent: 'Rent',
  opex: 'Operating',
  interest: 'Interest',
  overdraft: 'Overdraft',
  forecourt: 'Forecourt',
  cybercab: 'Cybercab cash',
  net: 'Net',
  cash: 'Cash',
  nav: 'NAV',
});

function recordedCash(row, key) {
  if (!row || !Object.hasOwn(row, key) || !Number.isFinite(row[key])) return null;
  return row[key];
}

function accountingAmount(row, id) {
  if (!row) return 0;
  if (id === 'rent') return row.rent ?? 0;
  if (id === 'opex') return -(row.opex ?? 0);
  if (id === 'interest') return -(row.interest ?? 0);
  if (id === 'overdraft') return -(row.overdraft ?? row.overdraftInterest ?? 0);
  if (id === 'forecourt' || id === 'cybercab') return recordedCash(row, id === 'forecourt' ? 'forecourt' : 'cybercabNet');
  if (id === 'net') return row.net ?? 0;
  if (id === 'cash') return row.cashAfter ?? row.projectedClosingCash ?? 0;
  return row.navAfter ?? 0;
}

function cause(kind, label, amount = null, source = null) {
  return { kind, label, amount: Number.isInteger(amount) ? amount : null, ...(source ? { source } : {}) };
}

function ledgerSource(row, collection, index, item) {
  return Object.freeze({
    quarter: row.quarter, collection, index,
    eventId: item.eventId ?? item.id ?? null,
    parcelId: item.parcelId ?? null,
  });
}

function eventLabel(item, fallback) {
  const parcel = item.parcelId ? ` · ${String(item.parcelId).toUpperCase()}` : '';
  if (item.arrears === true || (item.type ?? item.kind) === 'tenant-arrears') {
    return `Tenant arrears${parcel}`;
  }
  if (item.hazard === 'flood' || item.hazard === 'fire') {
    return `${item.hazard === 'flood' ? 'Flood' : 'Fire'}${parcel}`;
  }
  if (item.kind === 'condition-assessment') {
    return `${item.owner === 'rival' ? 'Rival condition check' : 'Condition check'}${parcel}`;
  }
  return item.headline
    ?? item.forecast?.headline
    ?? `${fallback}${parcel}`;
}

function settlementCauses(row, previous, log = []) {
  const rent = [];
  const interest = [];
  const cash = [];
  const nav = [];

  for (const [index, item] of (row?.propertyEvents ?? []).entries()) {
    const type = item.type ?? item.kind ?? 'event';
    const label = eventLabel(item, 'Quarter event');
    const source = ledgerSource(row, 'propertyEvents', index, item);
    if (type === 'tenant-arrears') {
      rent.push(cause('occupancy', `OCCUPANCY · ${label}`, item.amount, source));
    } else {
      rent.push(cause('event', label, item.amount, source));
      nav.push(cause('event', label, item.amount, source));
    }
  }
  for (const item of row?.peopleOutcomes ?? []) {
    if (item.kind !== 'occupation') continue;
    rent.push(cause('occupancy', `OCCUPANCY · ${item.parcelId ?? item.personId}`, item.amount));
  }
  for (const [index, item] of (row?.transactions ?? []).entries()) {
    const label = eventLabel(item, item.kind === 'auction' ? 'Auction' : 'Quarter transaction');
    const source = ledgerSource(row, 'transactions', index, item);
    if (['forced-sale', 'forced-sale-averted'].includes(item.kind)) {
      const chip = cause(
        'forced-sale',
        `${item.kind.toUpperCase()}${item.parcelId ? ` · ${item.parcelId}` : ''}`,
        item.cashOut === undefined ? null : -item.cashOut,
        source,
      );
      cash.push(chip);
      nav.push(chip);
    } else {
      cash.push(cause('event', label, item.cashOut === undefined ? null : -item.cashOut, source));
      nav.push(cause('event', label, null, source));
    }
  }
  for (const item of row?.obligations ?? []) {
    if (item.kind === 'place-building') {
      // COPY-DRAFT: label only; the ledger already owns the recorded NAV amount.
      nav.push(cause('works', `WORKS STARTED · ${item.parcelId}`, null));
    }
    if (['renovate', 'redevelop'].includes(item.kind)) {
      rent.push(cause('disruption', `DISRUPTION · ${item.parcelId}`, null));
    }
    if (item.kind === 'auction') cash.push(cause('event', `AUCTION · ${item.eventId}`, null));
    if (item.kind === 'divest' || item.kind === 'surrender') {
      cash.push(cause('forced-sale', `${item.kind.toUpperCase()} · ${item.parcelId}`, -item.cashOut));
    }
  }
  for (const item of [
    ...(row?.renovationCompletions ?? []),
    ...(row?.completions ?? []),
  ]) {
    const chip = cause('works', `WORKS · ${item.parcelId}`, null);
    rent.push(chip);
    nav.push(chip);
  }
  for (const item of row?.districtChanges?.formed ?? []) {
    const chip = cause('district-change', `FORMED · ${item.name} · ${item.blockId}`, null);
    rent.push(chip);
    nav.push(chip);
  }
  for (const item of row?.districtChanges?.dissolved ?? []) {
    const chip = cause('district-change', `DISSOLVED · ${item.name} · ${item.blockId}`, null);
    rent.push(chip);
    nav.push(chip);
  }

  const currentRate = row?.interestBp ?? 0;
  const priorRate = previous?.interestBp ?? null;
  if ([95, 120, 140, 165].includes(currentRate) && currentRate !== priorRate) {
    interest.push(cause('interest-shock', `INTEREST SHOCK · ${currentRate} bp`, null));
  }
  const overdraft = row?.overdraft ?? row?.overdraftInterest ?? 0;
  const overdraftCauses = overdraft
    ? [cause('overdraft', 'OVERDRAFT', -overdraft)]
    : [];

  const moved = SECTOR_IDS.filter((sector) => (row?.moves?.[sector]?.realisedBp ?? 0) !== 0);
  if (moved.length) {
    const shown = moved.slice(0, 2).map((sector) => SECTORS[sector].label);
    if (moved.length > shown.length) shown.push(`+${moved.length - shown.length} sectors`);
    const label = `MARKET · ${shown.join(' · ')}`;
    rent.push(cause('market', label, null));
    nav.push(cause('market', label, null));
  }

  for (const [blockId, move] of Object.entries(row?.blockMoves ?? {})
    .sort(([left], [right]) => left.localeCompare(right))) {
    const realisedBp = move?.realisedBp ?? 0;
    if (!realisedBp) continue;
    const label = `FAMILY SIGNAL · ${blockId} · ${signedPct(realisedBp, 2)}`;
    rent.push(cause('family-signal', label, null));
    nav.push(cause('family-signal', label, null));
  }

  for (const entry of log) {
    if (entry.q !== row?.quarter || !entry.parcelId) continue;
    if (['lease', 'remediate'].includes(entry.type)) {
      rent.push(cause('occupancy', `OCCUPANCY · ${entry.parcelId}`, null));
    }
  }
  for (const item of row?.forecourtLines ?? []) {
    rent.push(cause('occupancy', item.line, item.amount));
  }

  const all = [...rent, ...interest, ...overdraftCauses, ...cash, ...nav];
  const sortCauses = (items) => [...new Map(items.map((item) => [
    `${item.kind}:${item.label}:${item.amount}:${item.source ? JSON.stringify(item.source) : ''}`,
    item,
  ])).values()].sort((left, right) =>
    SETTLEMENT_CAUSE_ORDER.indexOf(left.kind) - SETTLEMENT_CAUSE_ORDER.indexOf(right.kind)
    || left.label.localeCompare(right.label));
  return {
    rent: sortCauses(rent),
    opex: sortCauses(rent),
    interest: sortCauses(interest),
    overdraft: sortCauses(overdraftCauses),
    forecourt: sortCauses([]),
    cybercab: sortCauses([]),
    net: sortCauses(all),
    cash: sortCauses([...all, ...cash]),
    nav: sortCauses([...rent, ...interest, ...nav]),
  };
}

/**
 * Read-only V3.04 projection. It never becomes run state or a second money authority:
 * amounts come directly from sealed ledger totals and deltas compare adjacent rows.
 */
export function settlementDeltaProjection(ledger, index = ledger.length - 1, log = []) {
  const row = ledger[index];
  if (!row) return Object.freeze([]);
  const previous = index > 0 ? ledger[index - 1] : null;
  const causes = settlementCauses(row, previous, log);
  return Object.freeze(SETTLEMENT_DELTA_IDS.map((id) => {
    const amount = accountingAmount(row, id);
    const earlier = previous ? accountingAmount(previous, id) : null;
    return Object.freeze({
      id,
      amount,
      delta: !previous || amount == null || earlier == null ? null : amount - earlier,
      causes: Object.freeze(causes[id].map(Object.freeze)),
    });
  }));
}

function deltaText(delta) {
  return delta === null ? 'NEW' : signedMoney(delta);
}

function causeChipHtml(item) {
  return `<span class="cause-chip" data-cause-kind="${item.kind}"${item.source ? ` data-cause-source="${escapeHtml(JSON.stringify(item.source))}"` : ''}>
    ${escapeHtml(item.label)}${item.amount === null ? '' : ` · ${signedMoney(item.amount)}`}
  </span>`;
}

function historyContext(items) {
  // Cash and NAV can reference the same transaction with a value and a null
  // annotation. Show its value once; retain both records in the projection.
  // Distinct ledger entries, including equal-valued ones, keep their own chips.
  const key = item => JSON.stringify([item.kind, item.label, item.source]);
  const valued = new Set(items.filter(item => item.source && item.amount !== null).map(key));
  return items.filter(item => item.amount !== null || !item.source || !valued.has(key(item)));
}

export function settlementDeltaHtml(lines) {
  return `
    <ol class="settlement-delta" aria-label="Books delta">
      ${lines.map((line) => {
        const context = historyContext(line.causes);
        return `
        <li data-settlement-line="${line.id}">
          <span class="label">${DELTA_LABELS[line.id]}</span>
          <span class="value">${line.amount == null ? '—' : signedMoney(line.amount)}</span>
          <span class="settlement-delta__change ${line.amount == null || line.delta === null || line.delta >= 0 ? 'gain' : 'loss'}">${line.amount == null ? '—' : deltaText(line.delta)}</span>
          ${context.length ? `<span class="settlement-delta__causes" aria-label="Related quarter context">${context.slice(0, 4).map(causeChipHtml).join('')}${context.length > 4 ? causeChipHtml({ kind: 'more', label: `+${context.length - 4} more`, amount: null }) : ''}</span>` : ''}
        </li>
      `; }).join('')}
    </ol>
  `;
}

export function runLedgerHtml(ledger, log = []) {
  if (!ledger.length) return '<p class="intent-text">No settled quarter yet.</p>';
  return [...ledger].map((row, index) => `
    <section class="run-ledger-quarter">
      <h3>Quarter ${row.quarter}</h3>
      ${settlementDeltaHtml(settlementDeltaProjection(ledger, index, log))}
    </section>
  `).join('');
}

/** Shared by Books and the online plan. A financial receipt is not a mixed event log. */
export function runHistoryHtml(state) {
  if (!state?.onlineView) return `<div class="run-history">
    <p class="run-history__context">These are your settled totals. Related quarter context can include other owners’ holdings.</p>
    ${runLedgerHtml(state?.ledger ?? [], state?.log ?? [])}
  </div>`;
  const history = state.onlineHistory, rows = state.ledger;
  const unavailable = '<div class="run-history"><p>Completed-quarter financial receipts are unavailable for this room.</p></div>';
  if (!history?.available) return unavailable;
  try {
    validateOwnRoomReceipts({ version: history.version, seatId: history.seatId,
      recordedFromQuarter: history.recordedFromQuarter, receipts: rows }, state.activeSeatId, state.quarters);
  } catch { return unavailable; }
  const exactSignedMoney = value => `${value > 0 ? '+' : ''}${moneyExact(value)}`;
  const earlier = history.recordedFromQuarter > 1;
  // COPY-DRAFT: name the costs paid when the player chooses Settle.
  return `<div class="run-history">
    <p class="run-history__context">These are your completed-quarter financial totals. Detailed action outcomes are not included.</p>
    ${earlier ? `<p>Earlier quarter receipts were not recorded.${rows.length ? ` Receipts are available from Quarter ${history.recordedFromQuarter}.` : ''}</p>` : ''}
    ${rows.length ? rows.map((row, index) => `<section class="run-ledger-quarter">
      <h3>Quarter ${row.quarter}</h3>
      ${settlementDeltaHtml(settlementDeltaProjection(rows, index))}
      <p>Confirmed cash before resolution ${moneyExact(row.cashBefore)} → ${moneyExact(row.cashAfter)}; change ${exactSignedMoney(row.cashAfter - row.cashBefore)}. Cash change includes planned spending. Net shows income after costs paid at Settle, including Cybercab earnings.</p>
      ${row.cybercab ? `<h4>Your Cybercab totals</h4><p>Fares ${moneyExact(row.cybercab.fares)} · running costs ${moneyExact(row.cybercab.costs)} · service paid ${moneyExact(row.cybercab.servicePaid)} · capital paid ${moneyExact(row.cybercab.capitalPaid)}.</p>
        <p>Operating profit ${exactSignedMoney(row.cybercab.net)} · business cash movement ${exactSignedMoney(row.cybercab.cashMovement)}. Capital purchases affect cash, not operating profit.</p>` : '<p>Cybercab totals were not recorded for this quarter.</p>'}
    </section>`).join('') : `<p>${earlier ? 'No completed-quarter receipts are available.' : 'No settled quarter yet.'}</p>`}
  </div>`;
}

function recordedOverdraft(lines) {
  if (lines && Object.hasOwn(lines, 'overdraftInterest') && Number.isFinite(lines.overdraftInterest)) return lines.overdraftInterest;
  if (lines && Object.hasOwn(lines, 'overdraft') && Number.isFinite(lines.overdraft)) return lines.overdraft;
  return 0;
}

function cashLine(label, amount) {
  if (amount == null) return { label, value: '—', stamp: '' };
  return {
    label,
    value: signedMoney(amount),
    stamp: amount > 0 ? 'paid' : '',
  };
}

function countText(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function lineStamp(kind) {
  if (!kind) return '';
  return `<span class="rubber-stamp rubber-stamp--${kind} settlement-presenter__row-stamp" data-stamp="${kind}" aria-hidden="true"></span>`;
}

function presentationValueHtml(line) {
  if (line.id !== 'rival') return escapeHtml(line.value);
  const text = String(line.value ?? '');
  const move = text.match(/^(.+?)\s+in\s+(.+?)\s+for\s+(\$[0-9][0-9,.]*)$/i);
  const segments = move
    ? [move[1], `in ${move[2]}`, `for ${move[3]}`]
    : [text];
  return `<span class="settlement-presenter__segments${move ? '' : ' is-whole'}">
    ${segments.map((segment) => `<span>${escapeHtml(segment)}</span>`).join('')}
  </span>`;
}

function canonicalMoveText(text) {
  return String(text ?? '')
    .replace(/^Rival\b/i, 'Petridis')
    .replace(/\bAI developer\b/gi, 'Petridis')
    .replace(/\bconstruction\b/gi, 'works')
    .replace(/\bsettlement\b/gi, 'settle')
    .replace(/\bsite\b/gi, 'parcel')
    .replace(/\blot\b/gi, 'parcel')
    .replace(/\bproperty\b(?!\s+group)/gi, 'parcel');
}

export function settlementPresentationLines(event, ledgerRow = {}) {
  const marketRows = SECTOR_IDS.map((sector) => {
    const move = event.moves?.[sector];
    return `${SECTORS[sector].label} ${signedPct(move?.realisedBp ?? 0)}`;
  });
  const market = marketRows.length <= 3
    ? marketRows.join(' · ')
    : [...marketRows.slice(0, 2), `+${marketRows.length - 2} sectors`].join(' · ');
  const rivalMoves = event.rivalMove?.moves ?? [];
  const rivalRows = rivalMoves.map((move) => (
    move.text ?? `${move.verb ?? 'move'} ${move.parcelId ?? ''}`.trim()
  )).map(canonicalMoveText);
  const rival = rivalRows.length
    ? (rivalRows.length <= 3
      ? rivalRows.join(' · ')
      : [...rivalRows.slice(0, 2), `+${rivalRows.length - 2} moves`].join(' · '))
    : canonicalMoveText(event.rivalMove?.text ?? 'No Petridis move');
  const forcedSales = (event.auctionTransactions ?? [])
    .filter(({ kind }) => ['forced-sale', 'forced-sale-averted'].includes(kind));
  const auctionCount = (event.auctionTransactions ?? [])
    .filter(({ kind }) => kind === 'auction').length;
  const peopleCount = event.peopleOutcomes?.length ?? 0;
  const worksCount = (event.renovationCompletions?.length ?? 0)
    + (event.completions?.length ?? 0)
    + (event.noticeConversions?.length ?? 0);
  const formedDistricts = event.districtChanges?.formed ?? [];
  const dissolvedDistricts = event.districtChanges?.dissolved ?? [];
  const rent = event.lines?.rent ?? 0;
  const opex = event.lines?.opex ?? 0;
  const interest = event.lines?.interest ?? 0;
  const overdraft = recordedOverdraft(event.lines);
  const arrears = (event.propertyEvents ?? []).some((item) =>
    item.type === 'tenant-arrears' || item.kind === 'tenant-arrears');
  const forcedLive = forcedSales.some((item) => item.kind === 'forced-sale');
  // A sale due at the next settle is named beside whatever this settle recorded (an averted sale, or Petridis's sale).
  const forcedDue = event.forcedSaleDue
    ? (event.forcedSaleDue.insolvent
      ? 'Run ends at the next settle'
      : `${String(event.forcedSaleDue.parcelId).toUpperCase()} at the next settle`)
    : null;
  const byId = {
    'forced-sale': {
      label: 'Forced sale',
      value: forcedSales.slice(0, 2).map((item) =>
        item.kind === 'forced-sale-averted'
          ? 'Averted'
          : (item.parcelId?.toUpperCase() ?? '—'))
        .concat(forcedSales.length > 2 ? [`+${forcedSales.length - 2} more`] : [])
        .concat(forcedDue ? [forcedDue] : [])
        .join(' · ') || 'None',
      stamp: forcedLive || forcedDue ? 'overdue' : '',
    },
    market: {
      label: 'Market',
      value: market || 'Flat',
      stamp: '',
    },
    rival: {
      label: 'Petridis',
      value: rival,
      stamp: '',
    },
    'auction-events': {
      label: 'Auctions',
      value: auctionCount ? String(auctionCount) : 'None',
      stamp: '',
    },
    people: {
      label: 'People',
      value: peopleCount ? String(peopleCount) : 'None',
      stamp: '',
    },
    rent: {
      label: 'Rent',
      value: signedMoney(rent),
      stamp: arrears ? 'overdue' : (rent > 0 ? 'paid' : ''),
    },
    operating: {
      label: 'Operating',
      value: opex ? `−${moneyExact(opex)}` : '—',
      stamp: opex ? 'paid' : '',
    },
    interest: {
      label: 'Interest',
      value: interest ? `−${moneyExact(interest)}` : '—',
      stamp: interest ? 'paid' : '',
    },
    overdraft: {
      label: 'Overdraft',
      value: overdraft ? `−${moneyExact(overdraft)}` : '—',
      stamp: overdraft ? 'overdue' : '',
    },
    forecourt: cashLine('Forecourt', recordedCash(event.lines, 'forecourt')),
    cybercab: cashLine('Cybercab cash', recordedCash(event.lines, 'cybercabNet')),
    works: {
      label: 'Works completed',
      value: worksCount ? String(worksCount) : 'None',
      stamp: worksCount ? 'paid' : '',
    },
    districts: {
      label: 'Districts',
      value: formedDistricts.length || dissolvedDistricts.length
        ? [
          ...formedDistricts.map((item) => `FORMED · ${item.name}`),
          ...dissolvedDistricts.map((item) => `DISSOLVED · ${item.name}`),
        ].slice(0, 2).join(' · ')
        : 'No change',
      stamp: formedDistricts.length ? 'paid' : '',
    },
    nav: {
      label: 'NAV',
      value: moneyExact(event.navAfter ?? ledgerRow.navAfter ?? 0),
      stamp: '',
    },
  };
  return Object.freeze(SETTLEMENT_ORDER.map((id) => Object.freeze({
    id,
    label: byId[id].label,
    value: byId[id].value,
    stamp: byId[id].stamp,
  })));
}

// The receipt opens complete. On the phone layer, hold pointer presses begun within
// CONTINUE_HOLD_MS of opening so the opening tap cannot close unread books. Keys and
// pointerless clicks continue immediately; off the phone layer nothing is held.
export const CONTINUE_HOLD_MS = 400;
export function continueTapHeld({ phone, pointer, pressAt, revealedAt }) {
  return Boolean(phone && pointer && Number.isFinite(pressAt) && Number.isFinite(revealedAt) && pressAt - revealedAt < CONTINUE_HOLD_MS);
}
const clockNow = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
const phoneLayer = () => globalThis.document?.documentElement?.dataset?.phoneHud === '1';

export class SettlementPresenter {
  constructor(host, {
    reducedMotion = false,
    onDismiss = () => {},
  } = {}) {
    this.host = host;
    this.reducedMotion = reducedMotion;
    this.onDismiss = onDismiss;
    this.element = null;
    this.complete = false;
    this._closingKey = null;
    this._resizeBound = false;
    this._edgeFrame = 0;
    this._pressAt = NaN;
    this._revealedAt = NaN;
    this._onScroll = () => this._markEdges();
    this.live = document.createElement('div');
    this.live.className = 'sr-only';
    this.live.setAttribute('role', 'status');
    this.live.setAttribute('aria-live', 'polite');
    this.live.setAttribute('aria-atomic', 'true');
    host.appendChild(this.live);
    this._onKey = (input) => {
      if (!['Enter', ' ', 'Escape'].includes(input.key)) return;
      // Keep the closing press until keyup so its repeats cannot settle again
      // through the board shortcut after this modal has been removed.
      if (!this.isOpen && !(input.repeat && input.key === this._closingKey)) return;
      input.preventDefault();
      input.stopImmediatePropagation();
      if (input.repeat) return;
      if (input.key === 'Escape' || this.complete) this._closingKey = input.key;
      if (input.key === 'Escape') this.dismiss();
      else this.advance();
    };
    this._onKeyUp = (input) => {
      if (input.key === this._closingKey) this._closingKey = null;
    };
    window.addEventListener('keydown', this._onKey, true);
    window.addEventListener('keyup', this._onKeyUp, true);
  }

  get isOpen() {
    return Boolean(this.element);
  }

  show(event, ledgerRow = {}) {
    this.dismiss(false);
    this.event = event;
    this.lines = settlementPresentationLines(event, ledgerRow);
    this.ledgerRows ??= [];
    const existing = this.ledgerRows.findIndex(({ quarter }) => quarter === ledgerRow.quarter);
    if (existing >= 0) this.ledgerRows[existing] = ledgerRow;
    else this.ledgerRows.push(ledgerRow);
    this.ledgerRows.sort((left, right) => left.quarter - right.quarter);
    this.deltaLines = settlementDeltaProjection(
      this.ledgerRows,
      this.ledgerRows.findIndex(({ quarter }) => quarter === ledgerRow.quarter),
    );
    this.visibleCount = this.lines.length;
    this.complete = this.visibleCount === this.lines.length;
    this._pressAt = NaN;
    this._revealedAt = clockNow();
    this.element = document.createElement('section');
    this.element.className = 'settlement-presenter';
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-label', `Quarter ${event.quarter} books`);
    // Reading or scrolling the receipt is not an advance action.
    this.element.addEventListener('pointerdown', (input) => { this._pressAt = input.timeStamp; }, true);
    this.element.addEventListener('click', (input) => {
      if (!input.target.closest?.('[data-settlement-go]')) return;
      input.preventDefault();
      input.stopPropagation();
      // A press belongs to one click: read it and clear it, so a later click with no press of its own is timed by itself.
      const pressAt = Number.isFinite(this._pressAt) ? this._pressAt : input.timeStamp;
      this._pressAt = NaN;
      if (this.complete && continueTapHeld({
        phone: phoneLayer(),
        pointer: input.detail > 0,
        pressAt,
        revealedAt: this._revealedAt,
      })) return;
      this.advance();
    });
    this.host.appendChild(this.element);
    this.render(event.quarter);
    // The complete receipt stays open until an explicit Continue or Escape.
    if (this.complete) this.announce(event);
  }

  render(quarter) {
    if (!this.element) return;
    const lines = this.event?.lines;
    const recorded = (key) => lines && Object.hasOwn(lines, key) && Number.isFinite(lines[key]);
    const part = (key, sign = 1) => (recorded(key) ? sign * lines[key] : 0);
    const net = recorded('net')
      ? lines.net
      : part('rent') - part('opex') - part('interest') - recordedOverdraft(lines)
        + part('forecourt') + part('cybercabNet');
    this.element.innerHTML = `
      <div class="settlement-presenter__binder">
      <span class="settlement-presenter__clip" aria-hidden="true"></span>
      <div class="settlement-presenter__sheet settlement-presenter__sheet--invoice">
        <div class="settlement-presenter__scroll" data-presenter-scroll>
        <header class="settlement-presenter__head">
          <span class="label">Q${quarter}</span>
          <h2>Books closed</h2>
          <span class="settlement-presenter__ref">Quarter carbon</span>
        </header>
        <ol class="settlement-presenter__lines">
          ${this.lines.map((line, index) => `
            <li class="${index < this.visibleCount ? 'is-visible' : ''}" data-ledger-line="${line.id}" style="--receipt-row:${index}">
              <span class="label">${line.label}</span>
              <span class="value">${index < this.visibleCount ? presentationValueHtml(line) : ''}</span>
              ${line.stamp && index < this.visibleCount ? lineStamp(line.stamp) : ''}
            </li>
          `).join('')}
        </ol>
        <div class="settlement-presenter__total${this.complete ? ' is-visible' : ''}">
          <span class="label">Total</span>
          <span class="value">${this.complete ? signedMoney(net) : ''}</span>
        </div>
        ${this.complete
          ? '<span class="rubber-stamp rubber-stamp--quarter settlement-presenter__seal" data-stamp="quarter-seal" aria-hidden="true"></span>'
          : ''}
        </div>
        <footer class="settlement-presenter__foot">
          <button type="button" class="settlement-presenter__go" data-settlement-go>
            <!-- COPY-DRAFT: match the input available on each device. -->
            <span class="settlement-presenter__go-key">Enter · continue</span>
            <span class="settlement-presenter__go-touch">Continue</span>
          </button>
        </footer>
      </div>
      </div>
    `;
    // The receipt tests call render() on a plain host object, so the watcher is optional.
    this._watchScroll?.();
  }

  // Phone round P2a (A): on the phone classes the receipt scrolls above a footer that holds this button (hud-phone.css). The scrollbar is hidden, so the
  // scroller says which edge has more: data-more is "below", "above", "both" or absent, and the stylesheet fades those edges. Off the phone classes the two
  // wrappers are display: contents, the scroller has no box, and this reads 0 and sets nothing.
  _markEdges() {
    const scroller = this.element?.querySelector?.('[data-presenter-scroll]');
    if (!scroller) return;
    const room = scroller.scrollHeight - scroller.clientHeight;
    const above = room > 1 && scroller.scrollTop > 1;
    const below = room > 1 && scroller.scrollTop < room - 1;
    const more = above && below ? 'both' : below ? 'below' : above ? 'above' : '';
    if (more) scroller.setAttribute('data-more', more);
    else scroller.removeAttribute('data-more');
  }

  _watchScroll() {
    const scroller = this.element?.querySelector?.('[data-presenter-scroll]');
    if (!scroller) return;
    scroller.addEventListener('scroll', this._onScroll, { passive: true });
    if (!this._resizeBound) {
      this._resizeBound = true;
      window.addEventListener('resize', this._onScroll);
    }
    this._markEdges();
    // The sheet has its size after this frame's layout (a rotation, a late font), so read the edges once more.
    if (typeof requestAnimationFrame === 'function') {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._edgeFrame);
      this._edgeFrame = requestAnimationFrame(() => { this._edgeFrame = 0; this._markEdges(); });
    }
  }

  announce(event) {
    if (this.announcedEvent === event) return;
    this.announcedEvent = event;
    this.live.textContent = `Q${event.quarter} settled. NAV ${moneyExact(event.navAfter)}.`;
  }

  advance() {
    if (!this.element) return;
    this.dismiss();
  }

  dismiss(notify = true) {
    if (this._edgeFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._edgeFrame);
    this._edgeFrame = 0;
    if (this._resizeBound) {
      this._resizeBound = false;
      window.removeEventListener('resize', this._onScroll);
    }
    this.element?.remove();
    const wasOpen = Boolean(this.element);
    this.element = null;
    this.complete = false;
    if (wasOpen && notify) this.onDismiss();
  }

  dispose() {
    this.dismiss(false);
    window.removeEventListener('keydown', this._onKey, true);
    window.removeEventListener('keyup', this._onKeyUp, true);
    this._closingKey = null;
    this.live.remove();
  }
}
