// District Deck V3.03 — one deterministic framework for auctions and macro/micro events.

import { RULES } from './content.js';
import {
  auctionTerms, resolveAuction, resolveSeatAuction, TENANT_TERMS,
} from './event-rules.js';
import { ensureRoomState, wetRoomDemand } from './renovation-rooms.js';
import {
  marketValue, ownerOf,
} from './economy.js';
import { applyBp, stream } from './rng.js';
import { DECEASED_ESTATE_ASK_BP } from './rates.js';
import { pct } from './format.js';
import { weatherOf } from './weather.js';

const EVENT_HEADLINES = Object.freeze({
  auction: 'Auction on this parcel',
  downturn: 'Market dip',
  'flash-flood': 'Flood watch',
  'interest-shock': 'Rates just jumped',
  'materials-spike': 'Works costs jump',
  fire: 'Fire risk on this holding',
  'tenant-arrears': 'Rent might not land',
});

const EVENT_DETAILS = Object.freeze({
  downturn: `Every sector falls ${pct(Math.abs(RULES.eventDownturnBp))} before its floor.`,
  'flash-flood': 'Low-lying parcels can take damage at settle.',
  'interest-shock': `Interest rises to ${pct(RULES.interestShockBp, 2)} at settle. Vinh can cut it to ${pct(RULES.brokerShockInterestBp, 2)}.`,
  'materials-spike': `Works quotes rise ${pct(RULES.materialsSpikeCostBp - 10000, 0)} while this event is active.`,
  fire: 'Insure before settle. Otherwise lose condition or time.',
  'tenant-arrears': 'This holding pays $0 rent at settle if the tenant misses.',
});

function tenantArrearsCopy(roomId) {
  if (roomId === 'kitchen') {
    return Object.freeze({
      headline: 'Kitchen wrecked — rent might not land',
      detail: 'Kitchen wrecked — they skip more often until you upgrade it.',
    });
  }
  if (roomId === 'bathroom') {
    return Object.freeze({
      headline: 'Bathroom wrecked — rent might not land',
      detail: 'Bathroom wrecked — they skip more often until you upgrade it.',
    });
  }
  return Object.freeze({
    headline: EVENT_HEADLINES['tenant-arrears'],
    detail: EVENT_DETAILS['tenant-arrears'],
  });
}

export const EVENT_TYPE_IDS = Object.freeze([
  'auction',
  'downturn',
  'flash-flood',
  'interest-shock',
  'materials-spike',
]);

export const EVENT_TYPES = Object.freeze([
  ...EVENT_TYPE_IDS,
  'fire',
  'tenant-arrears',
  'crossing-accident',
  'cybercab-incident',
]);

export const EVENT_STATUSES = Object.freeze([
  'forecast',
  'active',
  'resolved',
  'cancelled',
]);

function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  for (const key of Object.keys(value).sort()) deepFreeze(value[key]);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

export function eventsStream(seed, suffix) {
  return stream(seed, `events:${suffix}`);
}

export function eventGenerationStream(seed, quarter, eventType) {
  return eventsStream(seed, `q${quarter}:generate:${eventType}`);
}

export function lobbyDecisionStream(seed, quarter, parcelId, actionOrdinal) {
  return eventsStream(seed, `q${quarter}:lobby:${parcelId}:${actionOrdinal}`);
}

export function tenantWarningStream(seed, quarter, parcelId) {
  return eventsStream(seed, `q${quarter}:tenant:${parcelId}`);
}

export function eventParcelStream(seed, eventId, parcelId) {
  return eventsStream(seed, `${eventId}:parcel:${parcelId}`);
}

export function auctionStream(seed, eventId) {
  return eventsStream(seed, `${eventId}:auction`);
}

export function emptyEvents() {
  return deepFreeze({ order: [], byId: {} });
}

export function postCybercabIncidents(events, incidents, depot) {
  const next = { order: [...events.order], byId: structuredClone(events.byId) };
  const copy = {
    virus: ['Virus attack', 'All cabs halt for one beat. Recovery costs $4,000, plus $900 when software is below 30%.'],
    accident: ['Car accident', 'Cab to the repair shop for a quarter. Repairs cost $6,500.'],
    puncture: ['Tyre puncture', 'Cab stopped roadside. Repair costs $450; tow required below 20% tyres.'],
    clientele: ['Bad clientele', 'Fare refunded and $300 cleaning. Cab out for one beat.'],
  };
  for (const row of incidents) {
    if (!copy[row.kind] || next.byId[row.id]) continue;
    next.order.push(row.id);
    next.byId[row.id] = {
      id: row.id, type: 'cybercab-incident', generatedQuarter: row.quarter,
      forecastQuarter: row.quarter, resolveQuarter: row.quarter, status: 'active',
      anchorIds: depot.parcelId ? [depot.parcelId] : [],
      factors: { cybercab: true, districtId: depot.districtId },
      forecast: { headline: copy[row.kind][0], detail: copy[row.kind][1], severity: 3, decal: false },
      payload: { ...row }, playerCommitment: null, rivalCommitment: null,
      outcome: { applied: true, cost: row.cost, refund: row.refund },
    };
  }
  // P22 orchestrator (2026-09-07): settle keeps writing into `next.events.byId` after this poster runs (state.js ~4703),
  // so the working copy must stay mutable here — freezing it threw "Cannot assign to read only property" on every
  // permit and farm settle. The quarter framework freezes the store at the end of settle as before (C1-SIM paused mid-work).
  return next;
}

export function assertEvent(event) {
  if (typeof event.id !== 'string') throw new TypeError('Event.id must be a string');
  if (!EVENT_TYPES.includes(event.type)) throw new TypeError(`unknown Event.type ${event.type}`);
  for (const field of ['generatedQuarter', 'forecastQuarter', 'resolveQuarter']) {
    if (!Number.isInteger(event[field])) throw new TypeError(`Event.${field} must be an integer`);
  }
  if (!EVENT_STATUSES.includes(event.status)) {
    throw new TypeError(`unknown Event.status ${event.status}`);
  }
  if (!Array.isArray(event.anchorIds)) throw new TypeError('Event.anchorIds must be an array');
  for (const field of ['factors', 'forecast', 'payload']) {
    if (!event[field] || typeof event[field] !== 'object') {
      throw new TypeError(`Event.${field} must be an object`);
    }
  }
  for (const field of ['playerCommitment', 'rivalCommitment', 'outcome']) {
    if (event[field] !== null && typeof event[field] !== 'object') {
      throw new TypeError(`Event.${field} must be an object or null`);
    }
  }
  if (event.type === 'auction') {
    for (const field of ['playerCommitment', 'rivalCommitment']) {
      const commitment = event[field];
      if (!commitment) continue;
      if (
        !Number.isInteger(commitment.maxBid)
        || commitment.maxBid < 0
        || commitment.maxBid % event.payload.increment !== 0
      ) {
        throw new TypeError(
          `Event.${field}.maxBid must be a non-negative multiple of $${event.payload.increment}`,
        );
      }
    }
  }
  return event;
}

export function freezeEvents(events) {
  const order = [...new Set(events.order)].sort();
  const byId = {};
  for (const id of order) {
    if (!events.byId[id]) throw new Error(`events.order names missing event ${id}`);
    byId[id] = deepFreeze({ ...assertEvent(events.byId[id]) });
  }
  return deepFreeze({ order, byId });
}

function anchorBlock(city, anchor, people) {
  if (anchor.kind === 'person') {
    return anchorBlock(city, people.byId[anchor.id]?.toAnchor ?? {}, people);
  }
  if (anchor.kind === 'parcel') {
    const parcel = city.parcels[anchor.id];
    return parcel ? `${parcel.bx},${parcel.bz}` : null;
  }
  if (anchor.kind === 'civic') {
    const civic = city.civicUses.find(({ id }) => id === anchor.id);
    return civic ? `${civic.bx},${civic.bz}` : null;
  }
  if (anchor.kind === 'reserve' && city.reserve?.id === anchor.id) {
    return `${city.reserve.bx},${city.reserve.bz}`;
  }
  const coreId = anchor.id?.replace?.(/:mouth$/, '');
  const core = city.blockCores.find(({ id }) => id === coreId)
    ?? city.rightsOfWay.find(({ id }) => id === coreId);
  return core ? `${core.bx},${core.bz}` : null;
}

function activeCrowdDensity(city, state) {
  const density = Object.fromEntries(Object.keys(state.blockDemandBp).sort()
    .map((blockId) => [blockId, 0]));
  for (const id of [...state.people.order].sort()) {
    const block = anchorBlock(city, state.people.byId[id].toAnchor, state.people);
    if (block) density[block] += 1;
  }
  for (const id of [...state.events.order].sort()) {
    const event = state.events.byId[id];
    if (
      event.type !== 'auction'
      || event.status === 'resolved'
      || event.status === 'cancelled'
      || !event.anchorIds[0]
    ) continue;
    const parcel = city.parcels[event.anchorIds[0]];
    if (parcel) density[`${parcel.bx},${parcel.bz}`] += Math.ceil(event.payload.crowdSize / 5);
  }
  return density;
}

function realisedRow(city, quarter) {
  const sourceQuarter = quarter === 1 ? 1 : quarter - 1;
  return city.market.find((row) => row.quarter === sourceQuarter) ?? null;
}

function currentAsking(city, state, parcelId) {
  const status = state.parcelStatus[parcelId];
  if (
    status.askingOverride !== null
    && status.askingOverrideUntil >= state.quarter
  ) return status.askingOverride;
  return marketValue(city, state, parcelId);
}

function auctionCandidate(city, state, quarter, anchorUnit) {
  const row = realisedRow(city, quarter);
  const density = activeCrowdDensity(city, state);
  const agents = Object.fromEntries(Object.keys(density).map((id) => [id, 0]));
  for (const id of [...state.people.order].sort()) {
    const person = state.people.byId[id];
    if (person.archetypeId !== 'property-agent') continue;
    const block = anchorBlock(city, person.toAnchor, state.people);
    if (block) agents[block] += 1;
  }
  const blocks = {};
  for (const parcelId of [...city.order].sort()) {
    const parcel = city.parcels[parcelId];
    const blockId = `${parcel.bx},${parcel.bz}`;
    if (!blocks[blockId]) blocks[blockId] = [];
    blocks[blockId].push(parcelId);
  }
  const candidates = [];
  for (const blockId of Object.keys(blocks).sort()) {
    const parcelIds = blocks[blockId];
    const rises = parcelIds.map((id) =>
      Math.max(0, row?.sectors[city.parcels[id].sector]?.realisedBp ?? 0));
    const priceRiseBp = Math.round(
      rises.reduce((sum, value) => sum + value, 0) / Math.max(1, rises.length),
    );
    const humanDensity = density[blockId] ?? 0;
    const agentCount = agents[blockId] ?? 0;
    const auctionPressure = priceRiseBp + 40 * humanDensity + 180 * agentCount;
    if (auctionPressure < 500 || priceRiseBp <= 0) continue;
    for (const parcelId of parcelIds) {
      if (
        ownerOf(state, parcelId)
        || state.parcelStatus[parcelId].occupancy === 'squatted'
      ) continue;
      const parcel = city.parcels[parcelId];
      const humans = [...state.people.order].sort()
        .map((id) => state.people.byId[id])
        .filter((person) => {
          if (person.toAnchor.kind !== 'parcel') return false;
          const other = city.parcels[person.toAnchor.id];
          if (!other) return false;
          return person.toAnchor.id === parcelId
            || Math.abs(other.bx * 3 + other.tx - (parcel.bx * 3 + parcel.tx))
              + Math.abs(other.bz * 3 + other.tz - (parcel.bz * 3 + parcel.tz)) <= 1;
        }).length;
      const asking = currentAsking(city, state, parcelId);
      candidates.push({
        parcelId,
        score: asking + applyBp(asking, priceRiseBp) + 25_000 * humans,
        priceRiseBp,
        humanDensity,
        agentCount,
        auctionPressure,
      });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score || a.parcelId.localeCompare(b.parcelId));
  const top = candidates.filter(({ score }) => score === candidates[0].score);
  return top[Math.min(top.length - 1, Math.floor(anchorUnit * top.length))];
}

function createEvent(type, quarter, ordinal, anchorIds, factors, forecast, payload) {
  return {
    id: `${type}-q${quarter}-${ordinal}`,
    type,
    generatedQuarter: quarter === 1 ? 1 : quarter - 1,
    forecastQuarter: quarter === 1 ? 1 : quarter - 1,
    resolveQuarter: quarter,
    status: 'active',
    anchorIds: [...anchorIds].sort(),
    factors,
    forecast,
    payload,
    playerCommitment: null,
    rivalCommitment: null,
    outcome: null,
  };
}

function addEvent(events, event) {
  if (events.byId[event.id]) return;
  events.order.push(event.id);
  events.byId[event.id] = event;
}

function scheduleAuction(city, state, quarter, events) {
  if ([...events.order].some((id) =>
    events.byId[id].type === 'auction' && events.byId[id].resolveQuarter === quarter)) return;
  const rng = eventGenerationStream(state.seed, quarter, 'auction');
  const incidenceRoll = rng.int(0, 9999);
  const anchorUnit = rng.unit();
  const severityUnit = rng.unit();
  const selected = auctionCandidate(city, state, quarter, anchorUnit);
  if (!selected) return;
  const scheduledAsking = currentAsking(city, state, selected.parcelId);
  const rawCrowd = 6
    + Math.floor(selected.priceRiseBp / 100) * 2
    + selected.humanDensity * 2
    + selected.agentCount * 4;
  const crowdSize = Math.max(6, Math.min(40, 2 * Math.round(rawCrowd / 2)));
  const { reservePrice, increment, tier } = auctionTerms(scheduledAsking, crowdSize);
  addEvent(events, createEvent(
    'auction',
    quarter,
    0,
    [selected.parcelId],
    {
      incidenceRoll,
      anchorUnit,
      severityUnit,
      priceRiseBp: selected.priceRiseBp,
      humanDensity: selected.humanDensity,
      agentCount: selected.agentCount,
      auctionPressure: selected.auctionPressure,
    },
    {
      headline: EVENT_HEADLINES.auction,
      detail: 'Set maximum · pay hammer price · Petridis wins ties',
      severity: crowdSize,
      decal: true,
    },
    {
      crowdSize,
      scheduledAsking,
      reservePrice,
      increment,
      rivalBidderCount: tier.bidders,
    },
  ));
}

function macroAnchors(city, state, type) {
  if (type === 'flash-flood') {
    return [...city.order].sort().filter((id) => city.eventExposure[id].lowLying);
  }
  if (type === 'interest-shock') {
    const debtAnchors = Object.keys(state.holdings).sort();
    return debtAnchors.length ? debtAnchors : [city.order[0]];
  }
  if (type === 'materials-spike') return Object.keys(state.holdings).sort();
  return [...city.order].sort();
}

const MACRO_FORECASTS = Object.freeze({
  downturn: [EVENT_HEADLINES.downturn, EVENT_DETAILS.downturn],
  'flash-flood': [EVENT_HEADLINES['flash-flood'], EVENT_DETAILS['flash-flood']],
  'interest-shock': [EVENT_HEADLINES['interest-shock'], EVENT_DETAILS['interest-shock']],
  'materials-spike': [EVENT_HEADLINES['materials-spike'], EVENT_DETAILS['materials-spike']],
});

const MACRO_SEVERITY = Object.freeze({
  downturn: 3,
  'flash-flood': 4,
  'interest-shock': 4,
  'materials-spike': 3,
});

function lowLyingParcelIds(city) {
  return [...city.order].sort().filter((id) => city.eventExposure[id].lowLying);
}

function plannedMacroType(seed, quarter, exposureExists) {
  const roll = eventsStream(seed, `run:macro-type:q${quarter}`).int(0, 999);
  if (roll < 500) return 'downturn';
  // Named B4 dial: optional flood cumulative threshold restored 500 → 700 so the
  // weighted downturn → flood → interest → materials order has a real flood band.
  if (exposureExists && roll < 700) return 'flash-flood';
  if (roll < 900) return 'interest-shock';
  return 'materials-spike';
}

/**
 * One run-level macro authority. All draws happen exactly once here; quarterly event
 * scheduling merely materialises the selected entry and performs no incidence roll.
 */
export function createMacroPlan(city, seed) {
  const exposedParcelIds = lowLyingParcelIds(city);
  const exposureExists = exposedParcelIds.length > 0;
  const horizon = Math.max(1, Number(city?.quarters) || RULES.quarters);
  const cycleQuarters = 20;
  const cycles = [];
  const entries = [];
  for (let start = 1, cycle = 1; start <= horizon; start += cycleQuarters, cycle += 1) {
    const width = Math.min(cycleQuarters, horizon - start + 1);
    const slots = Array.from({ length: width }, (_, index) => start + index);
    const budget = Math.min(width, eventsStream(seed, `run:macro-budget:c${cycle}`).int(2, 4));
    const slotRng = eventsStream(seed, `run:macro-slots:c${cycle}`);
    for (let i = slots.length - 1; i >= 1; i -= 1) {
      const j = slotRng.int(0, i);
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    const selected = slots.slice(0, budget).sort((left, right) => left - right);
    const requiredRoll = eventsStream(seed, `run:macro-required:c${cycle}`).int(0, 9999);
    const requiredType = exposureExists && requiredRoll >= 5000
      ? 'flash-flood'
      : 'downturn';
    const cycleEntries = selected.map((resolveQuarter, index) => {
      const type = index === 0
        ? requiredType
        : plannedMacroType(seed, resolveQuarter, exposureExists);
      return {
        type,
        resolveQuarter,
        severity: MACRO_SEVERITY[type],
        exposureRolls: type === 'flash-flood'
          ? Object.fromEntries(exposedParcelIds.map((parcelId) => [
            parcelId,
            eventParcelStream(seed, `flash-flood-q${resolveQuarter}-0`, parcelId)
              .int(0, 9999),
          ]))
          : null,
      };
    });
    entries.push(...cycleEntries);
    cycles.push({ cycle, startQuarter: start, endQuarter: start + width - 1, budget });
  }
  return { budget: entries.length, cycles, entries };
}

function scheduleWeatherFlood(city, state, quarter, events) {
  if ([...events.order].some((id) =>
    events.byId[id].type === 'flash-flood' && events.byId[id].resolveQuarter === quarter)) {
    return;
  }
  const weather = weatherOf(state);
  if (weather.quarter !== quarter || weather.floodArmed !== true) return;
  const anchors = macroAnchors(city, state, 'flash-flood');
  const [headline, detail] = MACRO_FORECASTS['flash-flood'];
  const payload = {
    source: 'weather',
    exposures: Object.fromEntries(anchors.map((parcelId) => {
      const roll = eventParcelStream(state.seed, `flash-flood-q${quarter}-0`, parcelId)
        .int(0, 9999);
      return [parcelId, {
        roll,
        exposureBp: city.eventExposure[parcelId].floodExposureBp,
        hit: roll < city.eventExposure[parcelId].floodExposureBp,
      }];
    })),
  };
  addEvent(events, createEvent(
    'flash-flood',
    quarter,
    0,
    anchors,
    { planned: false, weatherArmed: true },
    { headline, detail, severity: MACRO_SEVERITY['flash-flood'], decal: true },
    payload,
  ));
}

function scheduleWeatherBushfire(city, state, quarter, events) {
  const weather = weatherOf(state);
  const parcelId = weather.bushfireParcelId;
  if (weather.quarter !== quarter || weather.bushfireIgnite !== true || !parcelId) return;
  if ([...events.order].some((id) => {
    const event = events.byId[id];
    return event.type === 'fire'
      && event.resolveQuarter === quarter
      && event.anchorIds.includes(parcelId);
  })) return;
  addEvent(events, createEvent(
    'fire',
    quarter,
    90,
    [parcelId],
    { weatherArmed: true, source: 'bushfire' },
    {
      headline: EVENT_HEADLINES.fire,
      detail: 'A fringe blaze burns until repaired. Insure before settle.',
      severity: 5,
      decal: true,
    },
    { parcelId, source: 'bushfire' },
  ));
}

function schedulePlannedMacro(city, state, quarter, events) {
  if ([...events.order].some((id) =>
    ['downturn', 'flash-flood', 'interest-shock', 'materials-spike'].includes(events.byId[id].type)
    && events.byId[id].resolveQuarter === quarter)) return;
  const planned = state.macroPlan?.entries.find((entry) => entry.resolveQuarter === quarter);
  if (!planned) return;
  if (planned.type === 'flash-flood') return;
  const anchors = macroAnchors(city, state, planned.type);
  const [headline, detail] = MACRO_FORECASTS[planned.type];
  const payload = {};
  if (planned.type === 'flash-flood') {
    payload.exposures = Object.fromEntries(anchors.map((parcelId) => {
      const roll = planned.exposureRolls[parcelId];
      return [parcelId, {
        roll,
        exposureBp: city.eventExposure[parcelId].floodExposureBp,
        hit: roll < city.eventExposure[parcelId].floodExposureBp,
      }];
    }));
  }
  addEvent(events, createEvent(
    planned.type,
    quarter,
    0,
    anchors,
    { planned: true },
    { headline, detail, severity: planned.severity, decal: true },
    payload,
  ));
}

function scheduleFireAndArrears(city, state, quarter, events) {
  const fireParcels = [...state.people.order].sort()
    .map((id) => state.people.byId[id])
    .filter((person) =>
      person.archetypeId === 'arsonist'
      && person.pendingOutcome?.kind === 'fire'
      && person.pendingOutcome.status === 'pending')
    .map((person) => person.pendingOutcome.parcelId)
    .filter((id, index, all) => all.indexOf(id) === index)
    .sort();
  fireParcels.forEach((parcelId, ordinal) => {
    addEvent(events, createEvent(
      'fire',
      quarter,
      ordinal,
      [parcelId],
      { derivedFromPeople: true },
      {
        headline: EVENT_HEADLINES.fire,
        detail: EVENT_DETAILS.fire,
        severity: 5,
        decal: true,
      },
      { parcelId },
    ));
  });

  const tenantIds = [...city.order].sort().filter((id) => {
    const tenant = state.parcelStatus[id].tenant;
    return tenant && tenant.expiresAfterQuarter >= quarter;
  });
  let ordinal = 0;
  for (const parcelId of tenantIds) {
    const tenant = state.parcelStatus[parcelId].tenant;
    const baseChanceBp = TENANT_TERMS[tenant.quality]?.arrearsChanceBp ?? tenant.arrearsChanceBp ?? 0;
    const demand = wetDemandForParcel(city, state, parcelId, baseChanceBp);
    const chanceBp = baseChanceBp + demand.extraArrearsBp;
    if (chanceBp <= 0) continue;
    const paymentRoll = tenantWarningStream(state.seed, quarter, parcelId).int(0, 9999);
    if (paymentRoll >= chanceBp) continue;
    const copy = tenantArrearsCopy(demand.roomId);
    addEvent(events, createEvent(
      'tenant-arrears',
      quarter,
      ordinal,
      [parcelId],
      {
        paymentRoll,
        chanceBp,
        extraArrearsBp: demand.extraArrearsBp,
        roomId: demand.roomId,
      },
      {
        headline: copy.headline,
        detail: copy.detail,
        severity: 2,
        decal: true,
      },
      { parcelId, roomId: demand.roomId },
    ));
    ordinal += 1;
  }
}

/** Probe copy so scheduling can ensureRoomState without mutating frozen snapshots. */
function wetDemandForParcel(city, state, parcelId, baseChanceBp) {
  const live = state.parcelStatus?.[parcelId];
  if (!live) return wetRoomDemand(null, baseChanceBp);
  const probe = { ...live };
  ensureRoomState(city, { seed: state.seed, roomEconomyVersion: state.roomEconomyVersion, parcelStatus: { [parcelId]: probe } }, parcelId);
  return wetRoomDemand(probe, baseChanceBp);
}

/**
 * Scheduling is a single table-driven pass over the post-people snapshot. Auction, macro,
 * fire and arrears records share the same lifecycle, forecast schema and settlement slot.
 */
export function scheduleEvents(city, state, quarter) {
  const events = {
    order: [...(state.events?.order ?? [])],
    byId: structuredClone(state.events?.byId ?? {}),
  };
  scheduleAuction(city, state, quarter, events);
  schedulePlannedMacro(city, state, quarter, events);
  scheduleWeatherFlood(city, state, quarter, events);
  scheduleFireAndArrears(city, state, quarter, events);
  scheduleWeatherBushfire(city, state, quarter, events);
  return freezeEvents(events);
}

export function auctionJitters(seed, event) {
  const rng = auctionStream(seed, event.id);
  const count = auctionTerms(
    event.payload.scheduledAsking,
    event.payload.crowdSize,
  ).tier.bidders;
  return Array.from({ length: count }, () => rng.int(-150, 150));
}

export function auctionResolution(state, event) {
  if (state.onlineView && state.seats?.P2?.kind === 'remote') {
    const { reservePrice, increment } = auctionTerms(event.payload.scheduledAsking, event.payload.crowdSize);
    return { outcome: 'undisclosed', winner: null, winnerSeatId: null, salePrice: null,
      reservePrice, increment, entries: [], askingOverride: null };
  }
  if (state.auctionSeatVersion === 2) return resolveSeatAuction(event, state.quarterCommit.resolutionOrder);
  return resolveAuction(
    event,
    auctionJitters(state.seed, event),
    event.playerCommitment,
    event.rivalCommitment,
    event.rivalCommitment?.maxBid ?? 0,
  );
}

// Remote plans are sealed. Publish the hammer result, never the other seat's cap
// or synthetic resolver entries. A caller may supply only its own planned state.
export function seatAuctionEventsForView(state, seatId = null, plannedState = state) {
  const events = structuredClone(state.events);
  if (state.seats?.P1?.kind !== 'remote' || state.seats?.P2?.kind !== 'remote') return events;
  for (const event of Object.values(events.byId)) {
    if (event.type !== 'auction') continue;
    const source = plannedState.events?.byId?.[event.id] ?? event;
    const commitment = seatId && state.auctionSeatVersion === 2
      ? [source.playerCommitment, source.rivalCommitment].find(row => row?.seatId === seatId) : null;
    event.playerCommitment = commitment ? structuredClone(commitment) : null;
    event.rivalCommitment = null;
    if (event.outcome) {
      delete event.outcome.entries;
      if (seatId && event.outcome.winnerSeatId) {
        event.outcome.winner = event.outcome.winnerSeatId === seatId ? 'player' : 'rival';
      }
    }
    // COPY-DRAFT: state the seat-auction prerequisite without an occupancy term.
    if (event.forecast) event.forecast.detail = state.auctionSeatVersion === 2
      ? 'Walk here and set a private maximum. Both plans resolve together; equal bids use the quarter’s seat order.'
      : 'Scheduled bidding needs seat auctions, which can be enabled only in a quarter with no accepted plans, commits, pacts or auction commitments.';
  }
  return events;
}

/** Hammer preview for a hypothetical player max, using the live rival commitment. */
export function previewAuctionResolution(state, event, playerMaxBid = null) {
  const playerCommitment = playerMaxBid == null
    ? event.playerCommitment
    : { ...(event.playerCommitment ?? {}), maxBid: playerMaxBid };
  return resolveAuction(
    event,
    auctionJitters(state.seed, event),
    playerCommitment,
    event.rivalCommitment,
    event.rivalCommitment?.maxBid ?? 0,
  );
}

export function eventsResolving(state, quarter = state.quarter) {
  return [...state.events.order].sort()
    .map((id) => state.events.byId[id])
    .filter((event) =>
      event.resolveQuarter === quarter
      && event.status !== 'resolved'
      && event.status !== 'cancelled');
}

export function auctionResolving(state, quarter = state.quarter) {
  return eventsResolving(state, quarter).find(({ type }) => type === 'auction') ?? null;
}

const ESTATE_NAMES = Object.freeze([
  'M. Chen', 'A. Papadopoulos', 'S. Nguyen', 'R. O\'Brien', 'L. Ibrahim',
  'J. Rossi', 'K. Singh', 'P. Walker', 'H. Tanaka', 'D. Ferreira',
]);

export function pickEstateName(seed, accidentId) {
  return eventsStream(seed, `estate-name:${accidentId}`).pick(ESTATE_NAMES);
}

/** True when the player or Petridis already holds the parcel. */
export function isHeldByDeveloper(state, id) {
  const holding = state.holdings?.[id];
  if (!holding) return false;
  const owner = holding.owner;
  if (owner === 'player' || owner === 'rival' || owner === 'P1' || owner === 'R1') return true;
  const seat = holding.ownerSeatId;
  if (seat === 'P1' || seat === 'R1') return true;
  return Boolean(owner);
}

/** Unowned parcel nearest the hit. Never a player or Petridis holding. */
export function pickDeceasedEstateParcel(city, state, { x = 0, z = 0 } = {}) {
  const free = [...city.order].sort().filter((id) =>
    !isHeldByDeveloper(state, id)
    && !ownerOf(state, id)
    && state.parcelStatus?.[id]?.occupancy !== 'squatted');
  if (!free.length) return null;
  let best = free[0];
  let bestDist = Infinity;
  for (const id of free) {
    const c = city.parcels[id]?.centre;
    if (!c) continue;
    const d = Math.hypot((c.x ?? 0) - x, (c.z ?? 0) - z);
    if (d < bestDist) {
      bestDist = d;
      best = id;
    }
  }
  return best;
}

/**
 * Open a deceased-estate auction this quarter if the board is clear,
 * otherwise the next free quarter. Asking is 30% below live market.
 */
export function queueDeceasedEstateAuction(city, state, {
  parcelId,
  victimName,
  accidentId,
  x = 0,
  z = 0,
}) {
  const requested = parcelId && !isHeldByDeveloper(state, parcelId) && !ownerOf(state, parcelId)
    ? parcelId
    : null;
  const id = requested ?? pickDeceasedEstateParcel(city, state, { x, z });
  if (!id || isHeldByDeveloper(state, id) || ownerOf(state, id)) {
    return { parcelId: null, event: null };
  }
  const events = {
    order: [...(state.events?.order ?? [])],
    byId: { ...(state.events?.byId ?? {}) },
  };
  const taken = new Set(
    events.order
      .map((eid) => events.byId[eid])
      .filter((ev) => ev?.type === 'auction' && ev.status !== 'resolved' && ev.status !== 'cancelled')
      .map((ev) => ev.resolveQuarter),
  );
  let quarter = state.quarter;
  while (taken.has(quarter) && quarter <= (state.quarters ?? quarter)) quarter += 1;
  if (quarter > (state.quarters ?? quarter)) return { parcelId: id, event: null };

  const market = marketValue(city, state, id);
  const asking = Math.max(1, applyBp(market, DECEASED_ESTATE_ASK_BP));
  state.parcelStatus[id].askingOverride = asking;
  state.parcelStatus[id].askingOverrideUntil = quarter + 1;
  const { reservePrice, increment, tier } = auctionTerms(asking, 12);
  const event = createEvent(
    'auction',
    quarter,
    40,
    [id],
    {
      deceasedEstate: true,
      accidentId,
      victimName,
      marketValue: market,
    },
    {
      headline: `Estate sale · ${victimName}`,
      detail: `They died at a crossing. The parcel lists ${pct(10000 - DECEASED_ESTATE_ASK_BP, 0)} under market.`,
      severity: 4,
      decal: true,
    },
    {
      crowdSize: 12,
      scheduledAsking: asking,
      reservePrice,
      increment,
      rivalBidderCount: tier.bidders,
      deceasedEstate: true,
      victimName,
      marketValue: market,
      discountBp: 10000 - DECEASED_ESTATE_ASK_BP,
    },
  );
  event.id = `auction-estate-${accidentId}`;
  addEvent(events, event);
  state.events = events;
  return { parcelId: id, event };
}
