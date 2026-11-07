// Cybercab auction-reserve admission. Absent marker is legacy cash-only admission.

import { cashPosition } from './economy.js';
import { moneyExact } from './format.js';

export function validateCybercabFundingVersion(value) {
  if (value === undefined) return;
  if (value !== 1) throw new RangeError('Unsupported cybercab funding version.');
}

export function validateCybercabFundingRun(state) {
  validateCybercabFundingVersion(state?.cybercabFundingVersion);
  for (const start of (state?.log ?? []).filter((row) => row?.type === 'run-start')) {
    validateCybercabFundingVersion(start.cybercabFundingVersion);
    if (start.cybercabFundingVersion !== state.cybercabFundingVersion) {
      throw new Error('Run-start cybercab funding mismatch.');
    }
  }
}

export function cybercabReserveReason(shortfall) {
  return `Short ${moneyExact(shortfall)} of the auction reserve.`;
}

export function isCybercabReserveReason(reason) {
  return typeof reason === 'string' && /^Short \$[\d,]+ of the auction reserve\.$/.test(reason);
}

function actingSeat(state, seatId) {
  return seatId ?? state?.activeSeatId ?? 'P1';
}

function actingCash(state, seatId) {
  const seatCash = state?.seatEconomy?.[seatId]?.cash;
  if (state?.onlineView) {
    const pending = state.quarterCommit?.pendingActions?.[seatId]?.length;
    if (pending && !Number.isFinite(state.cybercabPlanCash)) return null;
    if (Number.isFinite(state.cybercabPlanCash)) return state.cybercabPlanCash;
  }
  if (state?.activeSeatId === seatId && Number.isFinite(state.cash)) return state.cash;
  if (!state?.activeSeatId && (seatId === 'P1' || seatId === 'player') && Number.isFinite(state?.cash)) {
    return state.cash;
  }
  if (Number.isFinite(seatCash)) return seatCash;
  return null;
}

function capturedLimitNav(state, seatId) {
  const seatNav = state?.seatCredit?.[seatId]?.limitNav;
  if (Number.isFinite(seatNav)) return seatNav;
  const alias = state?.creditByOwner?.player?.limitNav;
  const aliasIsThisSeat = !state?.activeSeatId || state.activeSeatId === seatId || state.activeSeatId === 'player';
  if (aliasIsThisSeat && Number.isFinite(alias) && seatId !== 'P2') return alias;
  return null;
}

function ownCommitment(event, state, seatId) {
  const slots = [event.playerCommitment, event.rivalCommitment].filter(Boolean);
  if (state.auctionSeatVersion === 2) {
    if (slots.some((row) => row.seatId !== 'P1' && row.seatId !== 'P2')) {
      return { blocked: 'Auction reserve is missing its seat.' };
    }
    return { commitment: slots.find((row) => row.seatId === seatId) ?? null };
  }
  const legacy = seatId === 'P2' || seatId === 'rival' ? event.rivalCommitment : event.playerCommitment;
  return { commitment: legacy ?? null };
}

function fundingEvents(state, seatId) {
  const order = [];
  const byId = {};
  for (const id of [...(state.events?.order ?? [])].sort()) {
    const event = state.events.byId[id];
    if (event?.type !== 'auction') continue;
    const own = ownCommitment(event, state, seatId);
    if (own.blocked) return own;
    order.push(id);
    byId[id] = {
      type: 'auction',
      resolveQuarter: event.resolveQuarter,
      status: event.status,
      playerCommitment: own.commitment,
      rivalCommitment: null,
    };
  }
  return { events: { order, byId } };
}

/** One reserve/floor quote. `player` here is the acting seat already selected above. */
export function admitCybercabPayment(city, state, cashOut, seatId = actingSeat(state)) {
  if (!(cashOut > 0) || state?.cybercabFundingVersion !== 1) return { ok: true, reason: '' };
  const seat = actingSeat(state, seatId);
  const cash = actingCash(state, seat);
  if (!Number.isFinite(cash)) {
    return { ok: false, reason: 'Cybercab funding cash is not available.', unavailable: true };
  }
  const limitNav = capturedLimitNav(state, seat);
  if (!Number.isFinite(limitNav)) {
    return { ok: false, reason: 'Cybercab funding needs captured credit.', unavailable: true };
  }
  const reserved = fundingEvents(state, seat);
  if (reserved.blocked) return { ok: false, reason: reserved.blocked, unavailable: true };
  const position = cashPosition(city, {
    cash,
    quarter: state.quarter,
    operatorId: state.operatorId,
    events: reserved.events,
    creditByOwner: { player: { limitNav } },
  }, 'player', cashOut);
  if (position.ok) return { ok: true, reason: '', ...position };
  return { ok: false, reason: cybercabReserveReason(position.shortfall), ...position };
}
