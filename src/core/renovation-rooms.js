// District Deck — room-level renovation (kitchen / bathroom / bedroom / living).
// Pure helpers: seed-drawn room condition, suburb finish bands, quotes.
// Room upgrades cost cash and calendar time but take no action.
// Multiple rooms may upgrade in parallel; they do not block whole-building renovate.

import { applyBp, stream } from './rng.js';
import { DISTRICTS, RULES } from './content.js';
import { TENANT_TERMS } from './event-rules.js';
import { activeParcel } from './city.js';

export const ROOM_IDS = Object.freeze(['kitchen', 'bathroom', 'bedroom', 'living']);

/**
 * Concurrent room upgrade jobs on a holding.
 * Supports legacy single `roomRenovation` objects from older saves.
 * @returns {Array<object>}
 */
export function roomJobs(holding) {
  if (!holding) return [];
  if (Array.isArray(holding.roomRenovations) && holding.roomRenovations.length) {
    return holding.roomRenovations;
  }
  if (holding.roomRenovation) return [holding.roomRenovation];
  return [];
}

/** Active job for a single room, if any. */
export function pendingRoomJob(holding, roomId) {
  return roomJobs(holding).find((job) => job.roomId === roomId) ?? null;
}

/** Write concurrent jobs; clears legacy singular field. */
export function setRoomJobs(holding, jobs) {
  delete holding.roomRenovation;
  if (!jobs?.length) {
    delete holding.roomRenovations;
    return;
  }
  holding.roomRenovations = jobs.map((job) => Object.freeze({ ...job }));
}

export const FINISH_LEVELS = Object.freeze(['basic', 'deluxe', 'luxury']);

/** REIV-informed prestige bands from designIndex / appliedBandBp (content.js). */
export const SUBURB_BANDS = Object.freeze({
  'docklands-quay': 'very_low',
  'richmond-flat': 'low',
  'brunswick-rise': 'medium',
  'carlton-east': 'medium',
  'fitzroy-north': 'high',
  'brighton-reach': 'prestige',
});

/** ROI high-defect band (Worn label): defectPct >= 50 ⇔ condition <= 50. */
const ROOM_DEFECT_CUTOFF_PCT = 50;

/** Tenant demand band: wrecked wet rooms only (not the Worn-at-50 ROI label). */
export const WET_DEMAND_DEFECT_PCT = 80;

/**
 * Value multiple on cash invested when that room has high defect (condition < 50).
 * Kitchen and bathroom lead; bedroom/living are softer. Prestige suburbs pay luxury;
 * low suburbs punish over-finishing (near breakeven above basic).
 */
const ROI_TABLE = Object.freeze({
  very_low: Object.freeze({
    kitchen: { basic: 1.6, deluxe: 1.15, luxury: 0.95 },
    bathroom: { basic: 1.55, deluxe: 1.12, luxury: 0.95 },
    bedroom: { basic: 1.25, deluxe: 1.05, luxury: 0.9 },
    living: { basic: 1.2, deluxe: 1.05, luxury: 0.9 },
  }),
  low: Object.freeze({
    kitchen: { basic: 2.1, deluxe: 1.35, luxury: 1.05 },
    bathroom: { basic: 2.0, deluxe: 1.3, luxury: 1.05 },
    bedroom: { basic: 1.4, deluxe: 1.15, luxury: 0.98 },
    living: { basic: 1.35, deluxe: 1.12, luxury: 0.98 },
  }),
  medium: Object.freeze({
    kitchen: { basic: 1.7, deluxe: 2.15, luxury: 1.7 },
    bathroom: { basic: 1.65, deluxe: 2.1, luxury: 1.65 },
    bedroom: { basic: 1.35, deluxe: 1.6, luxury: 1.4 },
    living: { basic: 1.3, deluxe: 1.55, luxury: 1.35 },
  }),
  high: Object.freeze({
    kitchen: { basic: 1.5, deluxe: 2.0, luxury: 2.55 },
    bathroom: { basic: 1.5, deluxe: 1.95, luxury: 2.5 },
    bedroom: { basic: 1.3, deluxe: 1.55, luxury: 1.9 },
    living: { basic: 1.25, deluxe: 1.5, luxury: 1.85 },
  }),
  prestige: Object.freeze({
    kitchen: { basic: 1.5, deluxe: 2.0, luxury: 3.0 },
    bathroom: { basic: 1.5, deluxe: 2.0, luxury: 3.0 },
    bedroom: { basic: 1.35, deluxe: 1.7, luxury: 2.2 },
    living: { basic: 1.3, deluxe: 1.65, luxury: 2.1 },
  }),
});

/** Cash cost as bp of archetype base price by room × finish. */
const COST_BP = Object.freeze({
  kitchen: { basic: 280, deluxe: 520, luxury: 980 },
  bathroom: { basic: 260, deluxe: 500, luxury: 940 },
  bedroom: { basic: 180, deluxe: 340, luxury: 620 },
  living: { basic: 200, deluxe: 380, luxury: 700 },
});

/** Quarters of works: basic/deluxe 1, luxury 2. Apartments always settle in 1Q. */
const DURATION_QUARTERS = Object.freeze({
  basic: 1,
  deluxe: 1,
  luxury: 2,
});

/** Extra sale-value multiple on apartment room jobs (on top of the suburb ROI table). */
const APARTMENT_ROOM_SALE_MULTI = 1.4;

/** Apartment stock: kitchen/bath/bed/living jobs complete in one quarter. */
export function isApartmentRoomHost(archetypeId) {
  return String(archetypeId ?? '').startsWith('apartment');
}

export function suburbBand(districtId) {
  return SUBURB_BANDS[districtId] ?? 'medium';
}

export function suburbBandLabel(band) {
  return ({
    very_low: 'Very low',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    prestige: 'Prestige',
  })[band] ?? band;
}

/** Room condition 0–100; defect% = 100 − condition. */
export function drawRoomConditions(seed, parcelId, generation = 0) {
  const rooms = {};
  for (const room of ROOM_IDS) {
    rooms[room] = stream(seed, `rooms:${parcelId}:${room}:open${generation > 0 ? `:generation:${generation}` : ''}`).int(12, 96);
  }
  return rooms;
}

export function ensureRoomState(city, state, parcelId) {
  const status = state.parcelStatus?.[parcelId];
  if (!status) return null;
  if (!status.rooms) {
    status.rooms = drawRoomConditions(state.seed, parcelId, state.roomEconomyVersion === 2 ? (status.roomGeneration ?? 0) : 0);
  }
  if (!status.roomFinish) {
    status.roomFinish = Object.fromEntries(ROOM_IDS.map((id) => [id, null]));
  }
  return status.rooms;
}

export function roomDefectPct(rooms, roomId) {
  const condition = rooms?.[roomId] ?? 50;
  return Math.max(0, Math.min(100, 100 - condition));
}

/**
 * Wrecked kitchen / bathroom each add one standard-tenant arrears chance.
 * Secure tenants (baseChanceBp === 0) never pick up the extra.
 * Prefer the worse wet room as the named demand; kitchen wins a tie.
 * @returns {{ roomId: 'kitchen'|'bathroom'|null, extraArrearsBp: 0|600|1200 }}
 */
export function wetRoomDemand(status, baseChanceBp) {
  if (baseChanceBp === 0) {
    return { roomId: null, extraArrearsBp: 0 };
  }
  const rooms = status?.rooms;
  const kitchenDefect = roomDefectPct(rooms, 'kitchen');
  const bathroomDefect = roomDefectPct(rooms, 'bathroom');
  const kitchenWrecked = kitchenDefect >= WET_DEMAND_DEFECT_PCT;
  const bathroomWrecked = bathroomDefect >= WET_DEMAND_DEFECT_PCT;
  const extraEach = TENANT_TERMS.standard.arrearsChanceBp;
  const extraArrearsBp = (kitchenWrecked ? extraEach : 0) + (bathroomWrecked ? extraEach : 0);
  if (!extraArrearsBp) {
    return { roomId: null, extraArrearsBp: 0 };
  }
  const roomId = kitchenWrecked && bathroomWrecked
    ? (bathroomDefect > kitchenDefect ? 'bathroom' : 'kitchen')
    : (kitchenWrecked ? 'kitchen' : 'bathroom');
  return { roomId, extraArrearsBp };
}

export function roomRoiMultiple(districtId, roomId, finish, defectPct) {
  const band = suburbBand(districtId);
  const table = ROI_TABLE[band]?.[roomId] ?? ROI_TABLE.medium.living;
  let multi = table[finish] ?? 1;
  // Soft rooms or low defect: dampen the kitchen/bath premium.
  if (defectPct < ROOM_DEFECT_CUTOFF_PCT) {
    multi = 1 + (multi - 1) * 0.45;
  }
  if (roomId === 'bedroom' || roomId === 'living') {
    // already softer in table
  }
  return multi;
}

export function roomRenovateCost(basePrice, roomId, finish) {
  const bp = COST_BP[roomId]?.[finish] ?? 300;
  return Math.max(5_000, applyBp(basePrice, bp));
}

function roomHostReason(state, parcel, holding, status) {
  if (state.roomEconomyVersion !== 2) return null;
  const slots = holding.padSlots;
  const whole = Boolean(slots?.A?.whole && slots?.B?.whole && slots.A.archetypeId === slots.B.archetypeId);
  const split = slots && Object.values(slots).some(Boolean) && !whole;
  if (holding.siteCleared || status.roomGenerationState === 'cleared' || holding.demolition)
    return 'Room work needs a standing building without demolition.';
  if (holding.sector !== 'residential' || split || (parcel.consolidated && status.builtLevel === 0))
    return 'Room work needs one completed residential building.';
  return null;
}

export function roomRenovateQuote(city, state, parcelId, roomId, finish) {
  if (!ROOM_IDS.includes(roomId)) return null;
  if (!FINISH_LEVELS.includes(finish)) return null;
  const p = activeParcel(city, state, parcelId);
  if (!p) return null;
  const holding = state.holdings?.[parcelId];
  if (!holding) return null;
  // Quotes and legality checks must not initialize live state on rejection.
  // Accepted execution calls ensureRoomState on its cloned state.
  const status = state.parcelStatus?.[parcelId] ?? {};
  const rooms = status.rooms ?? drawRoomConditions(state.seed, parcelId, state.roomEconomyVersion === 2 ? (status.roomGeneration ?? 0) : 0);
  const defectPct = roomDefectPct(rooms, roomId);
  const basePrice = holding.basePrice ?? p.basePrice ?? 500_000;
  const cost = roomRenovateCost(basePrice, roomId, finish);
  const apartment = isApartmentRoomHost(holding.archetypeId ?? p.archetypeId);
  const multi = roomRoiMultiple(p.districtId, roomId, finish, defectPct)
    * (apartment ? APARTMENT_ROOM_SALE_MULTI : 1);
  const valueAdd = Math.round(cost * multi);
  const duration = apartment ? 1 : (DURATION_QUARTERS[finish] ?? 1);
  const cash = state.cash ?? 0;
  const fundable = cash - cost >= 0; // room renos are cash-only (no LVR)
  const hostReason = roomHostReason(state, p, holding, status);
  const delta = state.roomEconomyVersion === 2 ? roomEconomicDelta(p, holding, status, rooms, roomId, finish) : null;
  return {
    roomId,
    finish,
    cost,
    cashOut: cost,
    debtTaken: 0,
    valueAdd: delta?.valueAdd ?? valueAdd,
    multi,
    defectPct,
    roomCondition: rooms[roomId],
    durationQuarters: duration,
    completionQuarter: state.quarter + duration,
    apartment,
    band: suburbBand(p.districtId),
    ...(delta ?? {}),
    ok: !hostReason && fundable && (!delta || delta.hasEffect),
    reason: hostReason ?? (delta && !delta.hasEffect ? 'This work adds no condition or finish improvement.' : fundable ? null : 'Not enough cash for this room upgrade.'),
    ordinaryCash: cash,
    postActionCash: cash - cost,
    availableOverdraft: 0,
    reservedForAuction: 0,
  };
}

export function initialiseRoomEconomy(status, transition) {
  if (!status.roomEconomy) status.roomEconomy = { ...structuredClone(transition.basis), rooms: {} };
  if (status.roomEconomy.generation !== transition.generation) throw new Error('Room economy generation mismatch.');
  return status.roomEconomy;
}

function roomEconomicDelta(parcel, holding, status, conditions, roomId, finish) {
  const generation = status.roomGeneration ?? 0;
  const existing = status.roomEconomy;
  const basis = existing ? structuredClone(Object.fromEntries(Object.entries(existing).filter(([key]) => key !== 'rooms'))) : {
    generation, basisPrice: holding.basePrice ?? parcel.basePrice ?? 500000,
    basisApartment: isApartmentRoomHost(holding.archetypeId ?? parcel.archetypeId),
    basisBand: suburbBand(parcel.districtId), initialConditions: { ...conditions },
    initialFinishes: { ...Object.fromEntries(ROOM_IDS.map(id => [id, null])), ...(status.roomFinish ?? {}) },
  };
  const prior = existing?.rooms?.[roomId] ?? { highestFinish: null, awardedValue: 0, awardedRentBp: 0 };
  const rank = FINISH_LEVELS.indexOf(finish), priorRank = FINISH_LEVELS.indexOf(prior.highestFinish);
  const higher = rank > priorRank;
  const floor = finish === 'luxury' ? 96 : finish === 'deluxe' ? 82 : 68;
  const table = ROI_TABLE[basis.basisBand]?.[roomId] ?? ROI_TABLE.medium[roomId];
  let multiple = table[finish] ?? 1;
  if (roomDefectPct(basis.initialConditions, roomId) < ROOM_DEFECT_CUTOFF_PCT) multiple = 1 + (multiple - 1) * .45;
  multiple *= basis.basisApartment ? APARTMENT_ROOM_SALE_MULTI : 1;
  const targetValue = Math.round(roomRenovateCost(basis.basisPrice, roomId, finish) * multiple);
  const targetRent = roomId === 'kitchen' || roomId === 'bathroom' ? (finish === 'luxury' ? 400 : finish === 'deluxe' ? 250 : 150) : 0;
  const awardedValue = higher ? Math.max(prior.awardedValue, targetValue) : prior.awardedValue;
  const awardedRentBp = higher ? Math.max(prior.awardedRentBp, targetRent) : prior.awardedRentBp;
  return {
    roomEconomyVersion: 2, hasEffect: higher || conditions[roomId] < floor,
    valueAdd: awardedValue - prior.awardedValue,
    rentRatio: awardedRentBp === prior.awardedRentBp ? { numerator: 1, denominator: 1 } : { numerator: 10000 + awardedRentBp, denominator: 10000 + prior.awardedRentBp },
    roomEconomyTransition: { generation, basis, roomId, highestFinish: higher ? finish : prior.highestFinish, awardedValue, awardedRentBp },
  };
}

export function applyRoomRenovationComplete(holding, status, job) {
  if (job.roomEconomyVersion === 2) {
    const transition = job.roomEconomyTransition;
    const generation = status.roomGeneration ?? 0;
    if (!transition || transition.generation !== generation || transition.basis?.generation !== generation
      || (status.roomEconomy && status.roomEconomy.generation !== generation)
      || status.roomGenerationState === 'cleared') throw new Error('Room economy generation mismatch.');
  }
  if (!status.rooms) status.rooms = {};
  if (!status.roomFinish) status.roomFinish = {};
  // Room condition lifts to finish quality.
  const lift = job.finish === 'luxury' ? 96 : job.finish === 'deluxe' ? 82 : 68;
  status.rooms[job.roomId] = Math.max(status.rooms[job.roomId] ?? 0, lift);
  status.roomFinish[job.roomId] = job.finish;
  holding.basePrice = Math.max(
    holding.basePrice ?? 0,
    (holding.basePrice ?? 0) + (job.valueAdd ?? 0),
  );
  if (job.roomEconomyVersion === 2) {
    const economy = initialiseRoomEconomy(status, job.roomEconomyTransition);
    const { roomId, highestFinish, awardedValue, awardedRentBp } = job.roomEconomyTransition;
    economy.rooms[roomId] = { highestFinish, awardedValue, awardedRentBp };
    holding.baseRent = Math.round((holding.baseRent ?? 0) * job.rentRatio.numerator / job.rentRatio.denominator);
    return;
  }
  // Mild rent follow for wet areas.
  if (job.roomId === 'kitchen' || job.roomId === 'bathroom') {
    const rentBp = job.finish === 'luxury' ? 400 : job.finish === 'deluxe' ? 250 : 150;
    holding.baseRent = applyBp(holding.baseRent ?? 0, 10000 + rentBp);
  }
}

export function districtBandLegend() {
  return DISTRICTS.map((d) => ({
    id: d.id,
    name: d.name,
    band: suburbBand(d.id),
    appliedBandBp: d.appliedBandBp,
  }));
}

// Touch RULES export path for balance docs.
void RULES;
