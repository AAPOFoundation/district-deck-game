import { applyRoomRenovationComplete } from '../core/renovation-rooms.js';
import { applyAction } from '../core/state.js';
import { AVATAR_VENUE_SPENDS } from '../core/people.js';
// Display projections only; authoritative quotes/rent remain in core.
import { activeParcel } from '../core/city.js';
import { archetypeIdOf, rentFor, acquireQuote } from '../core/economy.js';
import { buildingBaseFor } from '../core/succession.js';
import { money, moneyExact } from '../core/format.js';

export function acquisitionDisclosure(city, state, id) {
  const parcel = activeParcel(city, state, id), status = state.parcelStatus?.[id];
  const quote = acquireQuote(city, state, id);
  if (!parcel || !status) return { quote, rent: 0, tenancy: 'No tenancy recorded' };
  const archetypeId = archetypeIdOf(city, state, id);
  const base = parcel.consolidated && status.builtLevel === 0 ? parcel
    : buildingBaseFor(parcel, archetypeId, status.condition, { parcelStatus: status });
  const projected = { ...state, holdings: { ...state.holdings, [id]: {
    owner: 'player', archetypeId, level: status.builtLevel, condition: status.condition,
    basePrice: base.basePrice, baseRent: base.baseRent, debt: quote.debtTaken,
  } } };
  const tenancy = status.occupancy === 'tenant'
    ? `Tenanted · ${status.tenant?.quality ?? 'standard'}${status.tenant?.paymentAtRisk ? ' · payment at risk' : ''}`
    : status.occupancy === 'vacant' ? 'Vacant · lease required for rent' : `Occupancy: ${status.occupancy ?? 'unknown'}`;
  return { quote, rent: rentFor(city, projected, id), tenancy };
}

export function roomCommitCopy(quote) {
  return quote ? `${moneyExact(quote.cost)} · no action · finishes when Q${quote.completionQuarter} settles · +${moneyExact(quote.valueAdd)} value${quote.roomEconomyVersion === 2 ? (quote.rentRatio.numerator === quote.rentRatio.denominator ? ' · no rent increase' : ` · rent +${Math.round((quote.rentRatio.numerator / quote.rentRatio.denominator - 1) * 10000) / 100}% at completion (rounded)`) : ''}` : '';
}
export function roomPreviewCaption(finish, currentFinish, queuedFinish = null, quarter = null, label = (value) => value) {
  if (queuedFinish && finish === queuedFinish) return `Queued ${label(finish)} · finishes when Q${quarter} settles`;
  return finish === currentFinish ? `Current ${label(finish)}` : `Preview ${label(finish)} · not ordered`;
}
export function rivalLeadCopy(gap, format = moneyExact) {
  return gap === 0 ? 'NAV tied' : gap > 0 ? `You lead ${format(gap)}` : `Petridis leads ${format(-gap)}`;
}

// COPY-DRAFT: compact rail readout; the full lead sentence remains in rivalLeadCopy.
export function rivalLeadSummary(gap) {
  return gap === 0 ? 'NAV tied' : gap > 0 ? `You +${money(gap)}` : `Petridis +${money(-gap)}`;
}

// Quote the same legal walk, without publishing the returned state or contact outcomes.
export function foodWalkDisclosure(city, state, civicId) {
  const action = { type: 'walk', avatarId: 'player', destination: { kind: 'civic', id: civicId }, purchase: null, brokerChoice: null };
  const result = applyAction(city, state, action);
  if (result.rejected) return { ok: false, reason: result.events.find(e => e.kind === 'reject')?.reason ?? 'Walk unavailable', hint: '1 action', label: 'Walk for Food' };
  const rule = AVATAR_VENUE_SPENDS.food;
  const event = result.events?.find(e => e.venueClass === 'food' && e.anchor?.id === civicId);
  if (event?.kind === 'avatar-spend') return { ok: true, label: 'Walk · get Food', hint: `${moneyExact(event.amount)} · 1 action · Food through Q${event.untilQuarter}`, reason: '' };
  const until = state.avatars.player.accessTokens?.[rule.token] ?? 0;
  const reason = event?.kind === 'avatar-spend-skipped'
    ? (event.reason === 'spending-cap' ? 'Food not granted: lifetime venue-spend allowance reached.' : 'Food not granted: insufficient funds within the overdraft limit.')
    : until >= state.quarter ? `Food already held through Q${until}; no new Food purchase.` : 'No Food purchase is available on this walk.';
  return { ok: false, label: until >= state.quarter ? `Food through Q${until}` : 'Get Food', hint: '1 action', reason };
}

// Same reducer legality as canApplyAction, plus all incidental venue-spend receipts.
export function walkCommitDisclosure(city, state, action) {
  const result = applyAction(city, state, action);
  if (result.rejected) return { ok: false, reason: result.events.find(e => e.kind === 'reject')?.reason ?? `${action.type} is unavailable.`, spendHint: '' };
  const spends = (result.events ?? []).filter(e => e.kind === 'avatar-spend' || e.kind === 'avatar-spend-skipped');
  const spendHint = spends.map(e => {
    const venue = ({ food: 'Food', cafe: 'Cafe', outfitter: 'Outfitter', notice: 'Notice' })[e.venueClass] ?? 'Venue';
    return e.kind === 'avatar-spend' ? `${moneyExact(e.amount)} ${venue} through Q${e.untilQuarter}`
      : `${venue} not bought: ${e.reason === 'spending-cap' ? 'venue allowance reached' : 'insufficient funds'}`;
  }).join(' · ');
  return { ok: true, reason: '', spendHint };
}

export function roomWorkHistory(state, parcelId, roomId, finish) {
  const completed = [...(state.ledger ?? [])].reverse().flatMap(row => (row.renovationCompletions ?? []).map(job => ({quarter: row.quarter, job})))
    .find(({job}) => job.kind === 'room' && job.parcelId === parcelId && job.roomId === roomId);
  if (completed?.job.finish === finish && Number.isInteger(completed.quarter) && completed.quarter > 0) return `Finished when Q${completed.quarter} settled`;
  const ordered = [...(state.log ?? [])].reverse().find(row => row.type === 'renovate-room'
    && row.parcelId === parcelId && row.roomId === roomId && row.finish === finish && Number.isInteger(row.quarter ?? row.q) && (row.quarter ?? row.q) > 0);
  return ordered ? `Ordered Q${ordered.quarter ?? ordered.q}; completion not recorded` : 'No completion recorded';
}
export function roomConditionConsequence(quote) {
  if (!quote) return '';
  const status = { rooms: { [quote.roomId]: quote.roomCondition }, ...(quote.roomEconomyVersion === 2 ? { roomGeneration: quote.roomEconomyTransition.generation } : {}) };
  applyRoomRenovationComplete({ basePrice: 0, baseRent: 0 }, status, quote);
  const after = status.rooms[quote.roomId];
  return after === quote.roomCondition ? `Condition stays ${after}/100` : `Condition ${quote.roomCondition} → ${after}/100`;
}
