// Auction desk: one readable model for the card (and any rail that wants it).
// The hammer is a max-bid, not a shout. Walk on site, set a ceiling, settle.

import { auctionTerms } from '../core/event-rules.js';
import { previewAuctionResolution } from '../core/events.js';
import { auctionCashAtCap, activeLvrBp, fundableAuctionMax } from '../core/economy.js';
import { canApplyAction } from '../core/state.js';
import { money, moneyExact } from '../core/format.js';

export function activeAuctionOnParcel(state, parcelId) {
  if (!parcelId) return null;
  return [...(state?.events?.order ?? [])].sort()
    .map((id) => state.events.byId[id])
    .find((event) =>
      event?.type === 'auction'
      && event.anchorIds?.includes(parcelId)
      && event.resolveQuarter === state.quarter
      && event.status !== 'resolved'
      && event.status !== 'cancelled') ?? null;
}

export function auctionDestination(state) {
  if (state.onlineView && Object.hasOwn(state, 'onlineAuctionDestination')) return state.onlineAuctionDestination;
  return state.avatars?.player?.destination ?? null;
}

export function auctionQuoteState(state) {
  return state.onlineView && Number.isSafeInteger(state.cybercabPlanCash)
    ? { ...state, cash: state.cybercabPlanCash } : state;
}

export function seatAuctionCopy(state) {
  if (!state.onlineView) return null;
  const other = Object.keys(state.seats ?? {}).find(id => id !== state.activeSeatId);
  if (!other || state.seats[other]?.kind !== 'remote') return null;
  return { opponent: other, enabled: state.auctionSeatVersion === 2,
    tie: state.auctionSeatVersion === 2
      ? `${state.quarterCommit.resolutionOrder[0]} wins equal bids this quarter.`
      : 'Open View plan → Enable seat auctions at an empty quarter before bidding.' };
}

export function auctionDeskModel(city, state, auction) {
  if (!auction) return null;
  const parcelId = auction.anchorIds.find((id) => city.parcels?.[id]) ?? auction.anchorIds[0];
  const terms = auctionTerms(auction.payload.scheduledAsking, auction.payload.crowdSize);
  const seatAuction = seatAuctionCopy(state);
  const destination = auctionDestination(state);
  const attending = destination?.kind === 'parcel' && destination.id === parcelId;
  const committed = auction.playerCommitment?.maxBid ?? 0;
  const rivalMax = seatAuction ? null : auction.rivalCommitment?.maxBid ?? 0;
  const quoteState = auctionQuoteState(state);
  const lvrBp = state.onlineView && state.onlineAuctionLvrBp !== undefined ? state.onlineAuctionLvrBp : activeLvrBp(state);
  const fundable = fundableAuctionMax(city, quoteState, terms.increment, 'player');
  const reserve = terms.reservePrice;
  const increment = terms.increment;
  const beatRival = rivalMax > 0 ? rivalMax + increment : 0;

  const offers = [];
  const pushOffer = (id, amount, label, why) => {
    if (!Number.isInteger(amount) || amount < reserve || amount % increment !== 0) return;
    if (amount > fundable) return;
    if (committed && amount <= committed) return;
    const check = canApplyAction(city, state, {
      type: 'bid',
      avatarId: 'player',
      eventId: auction.id,
      maxBid: amount,
    });
    offers.push({
      id,
      amount,
      label,
      why,
      cashAtCap: auctionCashAtCap(amount, lvrBp),
      check,
    });
  };

  pushOffer('reserve', reserve, `Max ${money(reserve)}`, 'Reserve — the cheapest legal ceiling.');
  if (beatRival && beatRival !== reserve) {
    pushOffer(
      'outbid',
      beatRival,
      `Outbid ${money(beatRival)}`,
      `One step over Petridis at ${moneyExact(rivalMax)}.`,
    );
  }
  if (fundable >= reserve && fundable !== reserve && fundable !== beatRival) {
    pushOffer(
      'ceiling',
      fundable,
      `Ceiling ${money(fundable)}`,
      'Highest increment your cash and overdraft will fund.',
    );
  }

  const hammerMax = committed || null;
  const preview = seatAuction ? null : previewAuctionResolution(state, auction, hammerMax);
  let outcomeLine;
  if (seatAuction) {
    outcomeLine = !seatAuction.enabled ? seatAuction.tie
      : !attending ? 'Plan a visit to this lot, then set your maximum. The server checks both moves in order.'
        : committed ? `Your private maximum is ${moneyExact(committed)}. The hammer price is known after both plans resolve.`
          : 'Your visit is in place. Set a private maximum; the other seat’s plan is not disclosed.';
  } else if (!attending) {
    outcomeLine = 'Walk onto the lot. Bidding stays locked until you stand here.';
  } else if (!committed && rivalMax) {
    outcomeLine = `Petridis is in to ${moneyExact(rivalMax)}. A reserve-only max loses. Settle after you outbid.`;
  } else if (!committed) {
    outcomeLine = `Petridis is passing. A reserve max of ${moneyExact(reserve)} takes it when you settle.`;
  } else if (preview.outcome === 'sold' && preview.winner === 'player') {
    outcomeLine = `Your max ${moneyExact(committed)} is winning at about ${moneyExact(preview.salePrice)}. Settle to bring the hammer down.`;
  } else if (preview.outcome === 'sold') {
    outcomeLine = `Petridis at ${moneyExact(rivalMax || preview.salePrice)} beats your max ${moneyExact(committed)}. Raise before you settle.`;
  } else {
    outcomeLine = `Your max ${moneyExact(committed)} is below reserve ${moneyExact(reserve)}. Raise or the lot passes in.`;
  }

  return {
    eventId: auction.id,
    parcelId,
    crowdSize: auction.payload.crowdSize,
    reservePrice: reserve,
    increment,
    ask: auction.payload.scheduledAsking,
    marketValue: auction.payload.marketValue ?? null,
    deceasedEstate: Boolean(auction.payload.deceasedEstate),
    victimName: auction.payload.victimName ?? null,
    resolvesQuarter: auction.resolveQuarter,
    rivalMax,
    rivalPassing: seatAuction ? null : !rivalMax,
    seatAuction,
    attending,
    committed,
    fundable,
    offers,
    preview,
    outcomeLine,
    lvrBp,
  };
}

export function auctionDeskBannerHtml(model) {
  if (!model) return '';
  const estate = model.deceasedEstate
    ? `Deceased estate · ${model.victimName ?? 'the estate'} · 30% below market. `
    : '';
  const rival = model.seatAuction ? `${model.seatAuction.opponent} attendance and maximum are not disclosed.` : model.rivalPassing
    ? 'Petridis is passing.'
    : `Petridis disclosed ${moneyExact(model.rivalMax)} max.`;
  const you = model.committed
    ? `Your max ${moneyExact(model.committed)}.`
    : 'You have not set a max.';
  return `
    <section class="card__owner-banner" role="status" data-auction-desk${model.deceasedEstate ? ' data-deceased-estate-banner' : ''}>
      <p><strong>Auction this quarter</strong> · ${estate}Ask ${money(model.ask)} · reserve ${money(model.reservePrice)} · ${money(model.increment)} steps. ${rival} ${you}</p>
      <p>${model.outcomeLine}</p>
      <p>${model.seatAuction
        ? `Plan a visit and a maximum, then commit. The price is the reserve or runner-up plus one step, capped at your maximum. ${model.seatAuction.tie}`
        : 'Walk here, set a maximum, then settle. You pay the hammer price (runner-up plus one step), not your max. Exact ties go to Petridis.'}</p>
    </section>
  `;
}
