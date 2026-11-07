// District Deck V3.03 — event arithmetic shared by forecasts, previews and settlement.
// This module deliberately has no dependency on state/economy so the auction ladder and
// active-rate resolver have one authority without creating an import cycle.

import { RULES } from './content.js';
import { applyBp } from './rng.js';

export const AUCTION_TIERS = Object.freeze([
  Object.freeze({ min: 6, max: 11, bidders: 1, reserveBp: 9500, ceilings: [10000], passBand: [0.45, 0.55], target: 0.49834 }),
  Object.freeze({ min: 12, max: 19, bidders: 2, reserveBp: 9800, ceilings: [9950, 10000], passBand: [0.28, 0.38], target: 0.33112 }),
  Object.freeze({ min: 20, max: 29, bidders: 3, reserveBp: 10000, ceilings: [9900, 9950, 10000], passBand: [0.22, 0.32], target: 0.27502 }),
  Object.freeze({ min: 30, max: 39, bidders: 4, reserveBp: 10200, ceilings: [9900, 9925, 9975, 10000], passBand: [0.15, 0.25], target: 0.17988 }),
  Object.freeze({ min: 40, max: 40, bidders: 5, reserveBp: 10500, ceilings: [9875, 9900, 9925, 9975, 10000], passBand: [0.12, 0.20], target: 0.16434 }),
]);

export const TENANT_TERMS = Object.freeze({
  secure: Object.freeze({ rentBp: 9200, arrearsChanceBp: 0 }),
  standard: Object.freeze({ rentBp: 10000, arrearsChanceBp: 600 }),
  stretch: Object.freeze({ rentBp: 11200, arrearsChanceBp: 1800 }),
});

export function roundTo(value, step) {
  return Math.round(value / step) * step;
}

export function floorTo(value, step) {
  return Math.floor(value / step) * step;
}

export function auctionTier(crowdSize) {
  const tier = AUCTION_TIERS.find(({ min, max }) => crowdSize >= min && crowdSize <= max);
  if (!tier) throw new RangeError(`Auction crowd ${crowdSize} is outside 6–40`);
  return tier;
}

export function auctionTerms(scheduledAsking, crowdSize) {
  const tier = auctionTier(crowdSize);
  const reservePrice = roundTo(applyBp(scheduledAsking, tier.reserveBp), 5_000);
  const increment = roundTo(Math.max(5_000, applyBp(reservePrice, 100)), 1_000);
  return { tier, reservePrice, increment };
}

export function bidderCeiling(reservePrice, increment, tableCeilingBp, jitterBp) {
  const ceilingBp = tableCeilingBp + jitterBp;
  return ceilingBp < 10000
    ? floorTo(applyBp(reservePrice, ceilingBp), increment)
    : reservePrice + floorTo(applyBp(reservePrice, ceilingBp - 10000), increment);
}

export function buildAuctionBidders(event, jitters) {
  const { reservePrice, increment, tier } = auctionTerms(
    event.payload.scheduledAsking,
    event.payload.crowdSize,
  );
  return tier.ceilings.map((tableCeilingBp, index) => ({
    bidderId: `rival-${String(index + 1).padStart(2, '0')}`,
    owner: 'rival',
    tableCeilingBp,
    jitterBp: jitters[index],
    ceiling: bidderCeiling(
      reservePrice,
      increment,
      tableCeilingBp,
      jitters[index],
    ),
  }));
}

export function resolveAuction(
  event,
  jitters,
  playerCommitment = event.playerCommitment,
  rivalCommitment = event.rivalCommitment,
  rivalCeiling = Number.POSITIVE_INFINITY,
) {
  const { reservePrice, increment } = auctionTerms(
    event.payload.scheduledAsking,
    event.payload.crowdSize,
  );
  const entries = buildAuctionBidders(event, jitters);
  for (const entry of entries) entry.ceiling = Math.min(entry.ceiling, rivalCeiling);
  if (playerCommitment) {
    entries.push({
      bidderId: 'player',
      owner: 'player',
      ceiling: playerCommitment.maxBid,
    });
  }
  if (rivalCommitment) {
    entries.push({
      bidderId: 'rival-policy',
      owner: 'rival',
      ceiling: rivalCommitment.maxBid,
    });
  }
  entries.sort((left, right) =>
    right.ceiling - left.ceiling
    || (left.owner === right.owner ? 0 : left.owner === 'rival' ? -1 : 1)
    || left.bidderId.localeCompare(right.bidderId));
  const winner = entries[0] ?? null;
  if (!winner || winner.ceiling < reservePrice) {
    return {
      outcome: 'passed-in',
      winner: null,
      salePrice: null,
      reservePrice,
      increment,
      entries,
      askingOverride: roundTo(applyBp(reservePrice, 9700), 5_000),
    };
  }
  const runnerUp = entries[1] ?? null;
  const salePrice = runnerUp
    ? Math.max(reservePrice, Math.min(winner.ceiling, runnerUp.ceiling + increment))
    : reservePrice;
  return {
    outcome: 'sold',
    winner: winner.owner,
    winningBidderId: winner.bidderId,
    salePrice,
    reservePrice,
    increment,
    entries,
    askingOverride: null,
  };
}

// Online seat auctions use actual submitted ceilings, not the policy's crowd.
// The quarter's recorded order breaks equal bids, just as it does for acquisitions.
export function resolveSeatAuction(event, resolutionOrder) {
  if ([...resolutionOrder].sort().join(',') !== 'P1,P2') {
    throw new Error('Seat auction resolution order is invalid.');
  }
  const { reservePrice, increment } = auctionTerms(event.payload.scheduledAsking, event.payload.crowdSize);
  const entries = [['P1', event.playerCommitment], ['P2', event.rivalCommitment]]
    .filter(([, commitment]) => commitment)
    .map(([seatId, commitment]) => {
      if (commitment.seatId !== seatId || !Number.isSafeInteger(commitment.maxBid) || commitment.maxBid < 0) {
        throw new Error('Seat auction commitment identity or ceiling is invalid.');
      }
      return { bidderId: seatId, seatId, owner: seatId === 'P1' ? 'player' : 'rival', ceiling: commitment.maxBid };
    });
  entries.sort((left, right) => right.ceiling - left.ceiling
    || resolutionOrder.indexOf(left.seatId) - resolutionOrder.indexOf(right.seatId));
  const winner = entries[0];
  if (!winner || winner.ceiling < reservePrice) {
    return { outcome: 'passed-in', winner: null, winnerSeatId: null, salePrice: null,
      reservePrice, increment, entries, askingOverride: roundTo(applyBp(reservePrice, 9700), 5_000) };
  }
  const runnerUp = entries[1];
  return { outcome: 'sold', winner: winner.owner, winnerSeatId: winner.seatId,
    winningBidderId: winner.bidderId,
    salePrice: runnerUp ? Math.max(reservePrice, Math.min(winner.ceiling, runnerUp.ceiling + increment)) : reservePrice,
    reservePrice, increment, entries, askingOverride: null };
}

export function activeEvent(state, type, quarter = state.quarter) {
  return [...(state.events?.order ?? [])].sort()
    .map((id) => state.events.byId[id])
    .find((event) =>
      event.type === type
      && event.resolveQuarter === quarter
      && event.status !== 'resolved'
      && event.status !== 'cancelled') ?? null;
}

export function activeInterestRateBp(state, owner = 'player', quarter = state.quarter) {
  const shocked = Boolean(activeEvent(state, 'interest-shock', quarter));
  const pathRate = Number.isFinite(state?.rates?.interestBp)
    ? state.rates.interestBp
    : RULES.interestBp;
  if (owner !== 'player') {
    return shocked ? Math.max(pathRate, RULES.interestShockBp) : pathRate;
  }
  let broker = false;
  for (const avatarId of Object.keys(state.avatars ?? {}).sort()) {
    const offer = state.avatars[avatarId].brokerOffer;
    if (offer?.kind === 'interest' && offer.expiresAfterQuarter >= quarter) {
      broker = true;
      break;
    }
  }
  if (shocked) {
    return broker
      ? Math.max(pathRate, RULES.brokerShockInterestBp)
      : Math.max(pathRate, RULES.interestShockBp);
  }
  return broker ? Math.min(pathRate, RULES.brokerInterestBp) : pathRate;
}

export function insurancePremium(value, cover) {
  const fire = Math.max(1_500, applyBp(value, RULES.insuranceFirePremiumBp));
  const flood = Math.max(1_500, applyBp(value, RULES.insuranceFloodPremiumBp));
  if (cover === 'fire') return fire;
  if (cover === 'flood') return flood;
  if (cover === 'both') return applyBp(fire + flood, RULES.insuranceBundleBp);
  throw new RangeError(`Unknown insurance cover ${cover}`);
}

export function insuranceDeductible(value) {
  return Math.max(
    RULES.insuranceMinimumDeductible,
    applyBp(value, RULES.insuranceDeductibleBp),
  );
}
