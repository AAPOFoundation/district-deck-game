// Read-only online presentation. Canonical simulation state stays on the server.
import { privateSeatState, publicSeatState, previewCybercabSeat } from '../core/state.js';
import { cybercabForOwner } from '../core/cybercab.js';
import { activeLvrBp } from '../core/economy.js';
import { seatAuctionEventsForView } from '../core/events.js';
import { validateOwnRoomReceipts } from './room-receipts.js';

// Explicit world/presentation fields: new reducer fields are not published by default.
const SHARED_FIELDS = [
  'version', 'roomEconomyVersion', 'sellerFeeVersion', 'cybercabFundingVersion', 'auctionSeatVersion', 'seed', 'operatorId', 'openingCash', 'quarters',
  'quarter', 'phase', 'holdings', 'sectors', 'districtIndexBp', 'people', 'events',
  'parcelStatus', 'topology', 'macroPlan', 'blockDemandBp', 'blockValueIndexBp',
  'markets', 'rates', 'favour', 'civicWorks', 'fringeVenues', 'farms',
  'university', 'reserveKit', 'military', 'startNav', 'mode', 'seats', 'weather',
  'districtEngine', 'pactResults',
];
const PUBLIC_AVATAR_FIELDS = ['id', 'fromAnchor', 'destination', 'movedQuarter'];
const clone = value => structuredClone(value);

/** This is a Game view, never a save, reducer input, or a complete private history. */
export function roomView(city, state, seatId, { actionTypes = [], ownHistory = null } = {}) {
  const own = privateSeatState(state, seatId);
  const shared = publicSeatState(city, state);
  const business = state.phase === 'play' && state.quarterCommit.status !== 'resolved'
    ? previewCybercabSeat(city, state, seatId)
    : { cybercab: cybercabForOwner(state, seatId), cash: own.economy.cash };
  const otherId = Object.keys(state.seats).find(id => id !== seatId);
  const view = Object.fromEntries(SHARED_FIELDS.filter(key => state[key] !== undefined)
    .map(key => [key, clone(state[key])]));
  view.activeSeatId = seatId;
  view.onlineView = true;
  view.onlineActionTypes = [...actionTypes];
  view.events = seatAuctionEventsForView(state, seatId, business);
  // A planned visit unlocks only this seat's auction controls, not a renderer pose.
  if (state.seats?.P2?.kind === 'remote') view.onlineAuctionDestination = clone(
    business.avatars?.[seatId]?.destination ?? state.avatars[seatId]?.destination ?? null);
  if (state.auctionSeatVersion === 2) view.onlineAuctionLvrBp = activeLvrBp({ quarter: state.quarter,
    avatars: { player: business.avatars?.[seatId] ?? state.avatars[seatId] } });
  view.cybercab = clone(business.cybercab);
  view.cybercabPlanCash = business.cash;
  // Public authoritative NAV includes each seat's business basis without publishing its book.
  view.onlineNav = { player: shared.economy[seatId].nav, rival: shared.economy[otherId].nav };
  view.cash = own.economy.cash;
  view.actionsRemaining = own.economy.actionsRemaining;
  view.banked = own.economy.bankedActions;
  view.grade = own.economy.grade;
  view.rival = { cash: shared.economy[otherId]?.cash ?? 0,
    policyId: state.seats[otherId]?.policyId ?? null,
    intent: state.seats[otherId]?.kind === 'policy' ? clone(state.rival.intent) : null };
  view.creditByOwner = { player: clone(own.credit), rival: {} };
  view.seatCredit = { [seatId]: clone(own.credit) };
  view.seatEconomy = Object.fromEntries(Object.entries(shared.economy).map(([id, value]) =>
    [id, id === seatId ? clone(own.economy) : { cash: value.cash }]));
  view.seatPrivate = { [seatId]: clone(own.private) };
  // The legacy player alias must not publish P1 intel or avatars to P2.
  view.intel = { parcels: clone(own.private.intelByParcel), finds: [] };
  view.avatars = {};
  for (const id of Object.keys(state.seats)) {
    const avatar = state.avatars[id];
    if (!avatar) continue;
    view.avatars[id] = id === seatId ? clone(avatar)
      : Object.fromEntries(PUBLIC_AVATAR_FIELDS.filter(key => avatar[key] !== undefined)
        .map(key => [key, clone(avatar[key])]));
  }
  if (own.avatar) view.avatars.player = { ...clone(own.avatar), id: 'player' };
  for (const holding of Object.values(view.holdings)) {
    holding.owner = holding.ownerSeatId === seatId ? 'player' : 'rival';
  }
  view.quarterCommit = { ...clone(shared.quarterCommit),
    startStateHash: state.quarterCommit.startStateHash,
    pendingActions: { [seatId]: clone(own.pendingActions) },
    committedPackets: own.committedPacket ? { [seatId]: clone(own.committedPacket) } : {},
    nextSeatActionIndex: { [seatId]: state.quarterCommit.nextSeatActionIndex[seatId] },
  };
  view.activePacts = clone(own.activePacts);
  // Full logs, obligations and ledgers include another seat's action/intel payloads.
  // Only the separately retained, authenticated financial receipt crosses this boundary.
  view.log = [];
  if (ownHistory) validateOwnRoomReceipts(ownHistory, seatId, state.quarters);
  view.ledger = ownHistory ? clone(ownHistory.receipts) : [];
  view.onlineHistory = { version: 1, seatId, available: ownHistory !== null,
    recordedFromQuarter: ownHistory?.recordedFromQuarter ?? null };
  view.obligations = [];
  view.actionOrdinal = 0;
  view.supermarket = {};
  view.kitSeqWatermark = {};
  view.processDrawWatermark = {};
  view.processDrawLog = {};
  return view;
}
