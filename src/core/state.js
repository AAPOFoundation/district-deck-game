import { validateRoomEconomyVersion, validateRoomEconomyState, isRoomEconomyV2, pendingRoomReplacementReason, resetRoomGeneration, captureRoomCompletedBase, roomTransferBase, restoreParentRoomBase } from './room-economy-lifecycle.js';
// District Deck V3.03 — run state machine.
// Framework §2.2 rule 3: (state, action) -> state, pure, nothing mutated in place.
// Framework §6.2: every verb is a transaction — validate, compute the whole next state,
// commit once or reject. A parcel is never removed before a legal destination exists.

import { stream, applyBp, hash32 } from './rng.js';
import {
  ARCHETYPES, DISTRICTS, DISTRICT_ID_MIGRATION_ALIASES,
  OPERATORS, RULES, SECTOR_IDS, RIVAL_POLICIES, SIM_REVISION, gradeFor, operatorRules,
  RESERVE_CATALOG_BY_ID, SURVEY_DEFECT_TIERS, favourLobbyBonusBp, favourCostScaleBp,
  surveyDefectTierForCondition,
} from './content.js';
import {
  buildingBaseFor, constructionRecord, eraBand, renovateBase, renovationRecord,
} from './succession.js';
import {
  applyAvatarSpend, avatarSpendCandidate, createAvatars,
  createPeopleInputSnapshot,
  emptyPeople, fireExposureBp, freezePeople, humanDemandByBlock,
  PROFESSIONAL_PROJECT_CAP, professionalProjectsUsed,
  resolveAvatarContacts, shouldDespawnPerson, tickPeopleFromSnapshot,
  validateLegacyPurchase, walkDestinationExists, worksQualityRoll,
} from './people.js';
import {
  auctionJitters, auctionResolving, auctionResolution, emptyEvents, eventsResolving,
  createMacroPlan, freezeEvents, lobbyDecisionStream, scheduleEvents,
  pickEstateName, queueDeceasedEstateAuction,
  seatAuctionEventsForView,
} from './events.js';
import {
  markBushfireRepaired, realiseWeather, resolveBushfires, weatherOf,
} from './weather.js';
import {
  activeEvent, activeInterestRateBp, auctionTerms, insuranceDeductible,
  insurancePremium, TENANT_TERMS,
} from './event-rules.js';
import {
  createBlockDemand, createBlockValueIndex, createIntel, createParcelStatus,
  holdingFrameworkDefaults,
} from './intel.js';
import {
  activeInterestBp, activeLvrBp, marketValue, acquireQuote, renovateQuote, redevelopQuote, divestQuote,
  applyFamilySignalValueDrift,
  changeUseQuote, canAcquire, canRenovate, canRenovateRoom, canRedevelop, canChangeUse,
  canTenantExit, canDivest, leaseQuote, rentFor,
  isFreeFollowUpAcquire,
  roomRenovateQuote,
  grossRent, debtOf, navOf, ownerOf, levelOf, conditionOf, yieldBp, corridorLinks,
  archetypeIdOf, sectorOf, portfolioValue, listedBookValue, redevelopmentExitQuote,
  cashPosition, overdraftCharge, overdraftFloor,
  consolidateQuote, subdivideQuote,
  conditionAssessmentForAcquisition,
  resolveConditionAssessment, resolveForcedSaleAssessments,
  parcelSurveyComplete,
  settlementPreview as obligationPreview,
} from './economy.js';
import {
  applyRoomRenovationComplete,
  initialiseRoomEconomy, ROOM_IDS,
  ensureRoomState,
  roomJobs,
  setRoomJobs,
} from './renovation-rooms.js';
import {
  defaultPlanningCeilingFor, maxPermitLevelFor, permitOptionsFor,
  PERMIT_LABELS, PERMIT_FINISH_ARCHETYPE,
  usePermitOptionsFor, grantUsePermit,
} from './planning-permits.js';
import {
  CONSTRUCTION_ACCIDENT_CHANCE_BP,
  constructionDurationQuarters,
} from './construction-stages.js';
import {
  activeAdjacency, activeCity, activeEventExposure, activeOrder, activeParcel,
  createTopology, rebuildTopologyDerivedFields, resolveCurrentParcelId, topologyHash,
} from './city.js';
import { globalTile, parseParcelId, tileCentre } from './grid.js';
import {
  canTrade, createMarkets, ensureMarketsShape, repriceMarkets, marketMacroFromState,
} from './markets.js';
import {
  bracketChildRows, canCancelOrder, canPlaceOrder, recomputeReserved, resolveWorkingOrders,
  tryFillWorkingOrdersNow,
} from './markets-orders.js';
import { payDividends, quarterNarrative } from './markets-narrative.js';
import {
  activateUsePermit,
  applyVentureStep,
  canIpo,
  createDataCentreListing,
  isDataCentreArchetype,
  listedTickerOf,
  LISTED_FABRIC_REASON,
  LISTED_USE_REASON,
  operatingBaseRent,
  releaseListedParcelIfExited,
  rollDataCentreIpoMarketCap,
  ventureCashburnForOwner,
} from './ventures.js';
import { petrolForecourtForOwner } from './petrol-yield.js';
import {
  restoreProcessDrawLog,
  restoreProcessDrawWatermark,
} from './world/processes.js';
import { abortProcessRun, selectProcessOnHolding, settleProcessFacilities, readWorldDrawAck } from './process-runs.js';
import {
  inspectWorldRun, serialiseWorld, WORLD_RUN_KEY,
} from './world/envelope.js';
import { fireDamageForFacility, repairFire } from './world/disasters.js';
import { repairFacilityDamage } from './world/threats.js';
import { CITY_MILITARY_UNIT_KINDS, FACILITY_REPAIR_COST } from './world/catalog.js';
import {
  duePadWorksJobs,
  livePadWorksJobs,
  padSlotRecord,
  primaryLiveWorksJob,
  slotEconomicsParcel,
  standingPadSlotCount,
  syncDualPadIdentity,
} from './pad-slots.js';
import { scriptLordWashRaidHits } from './script-lord.js';
import {
  civicUpgradeQuote,
  emptyCivicWorks,
  emptyUniversityFund,
  ensureCivicDesks,
  universityIdeasFor,
  UNIVERSITY_DONATE_COST,
} from './civic-works.js';
import {
  applyFringeVenueIncome,
  applyFringeVenuePurchase,
  emptyFringeVenues,
  ensureFringeVenues,
  fringeVenueQuote,
} from './fringe-venues.js';
import {
  advanceInterestRate,
  applyInflationStep,
  createRatesState,
  DECEASED_ESTATE_ASK_BP,
  ensureRatesState,
  quarterAllowsCrossingAccident,
} from './rates.js';
import { restoreKitSeqWatermark } from './build-kits.js';
import { CITY_EXPORTS_KEY, CITY_RUN_IDENTITY_KEY } from './city-exports.js';
import { FARM_PERMIT } from './planning-permits.js';
import {
  canPlaceBuilding as canPlaceCatalogBuilding,
  farmActionCheck,
  doDemolishStrike as applyDemolishStrike,
  doPlaceBuilding as applyPlaceBuilding,
} from './site-works.js';
import {
  districtEngineChanges,
  evaluateDistrictEngine,
} from './landuse.js';
import {
  isFranchiseTenancyUse,
} from './commercial-tenancy.js';

import { CYBERCAB_ACTIONS, CYBERCAB_FINANCIAL_ACTIONS, createCybercabState, reduceCybercab, settleCybercab, cybercabIncomeLine, validateCybercabEconomyVersion, validateCybercabRun, initialiseCybercabSeatBooks, cybercabForOwner } from './cybercab.js';
import { validateSellerFeeVersion, validateSellerFeeRun } from './seller-fee-contract.js';
import { admitCybercabPayment, validateCybercabFundingVersion, validateCybercabFundingRun } from './cybercab-funding.js';
import { postCybercabIncidents } from './events.js';

import { STATE_VERSION } from './state-version.js';
export { STATE_VERSION } from './state-version.js';
export const ACTION_PROTOCOL = 'district-deck-action';
export const QUARTER_PROTOCOL = 'district-deck-quarter';
export const SYSTEM_SEAT_ID = 'SYSTEM';
export const SEAT_ID_PATTERN = /^[A-Z][A-Z0-9_-]*$/;

const clone = (value) => structuredClone(value);
const DEFAULT_OPERATOR_ID = 'underwriter';
const OPERATOR_SIGNAL_PREFIX = 'operator:';

function operatorById(operatorId) {
  return OPERATORS.find(({ id }) => id === operatorId)
    ?? OPERATORS.find(({ id }) => id === DEFAULT_OPERATOR_ID);
}

function actionsForOperator(operatorId) {
  return Math.max(0, operatorRules(operatorId).actionsPerQuarter);
}

/** V3.10 §4.2: derive once from authored parcel base prices at run start. */
export function deriveOpeningCash(city) {
  const entryBp = 10_000 - RULES.lvrBp + RULES.dutyBp;
  const entries = Object.values(city.parcels)
    .map(({ basePrice }) => basePrice * entryBp / 10_000)
    .sort((left, right) => left - right);
  if (!entries.length) throw new RangeError('Opening cash requires at least one parcel.');
  const middle = Math.floor(entries.length / 2);
  const medianEntry = entries.length % 2
    ? entries[middle]
    : (entries[middle - 1] + entries[middle]) / 2;
  return Math.round(
    (medianEntry * RULES.openingMultipleBp / 10_000) / RULES.openingRound,
  ) * RULES.openingRound;
}

export function canonicalJson(value) {
  const canonicalise = (item) => {
    if (Array.isArray(item)) return item.map(canonicalise);
    if (item === null || typeof item !== 'object') return item;
    return Object.keys(item).sort().reduce((record, key) => {
      if (item[key] !== undefined) record[key] = canonicalise(item[key]);
      return record;
    }, {});
  };
  return JSON.stringify(canonicalise(value));
}

export function validateSeats(seats, { mode = null } = {}) {
  if (!seats || typeof seats !== 'object' || Array.isArray(seats)) {
    throw new TypeError('Seats must be a record.');
  }
  const ids = Object.keys(seats).sort();
  if (!ids.length) throw new RangeError('At least one seat is required.');
  let nonPolicy = 0;
  for (const seatId of ids) {
    if (seatId === SYSTEM_SEAT_ID || !SEAT_ID_PATTERN.test(seatId)) {
      throw new RangeError(`Invalid seat ID: ${seatId}`);
    }
    const seat = seats[seatId];
    if (!seat || !['human-local', 'policy', 'remote'].includes(seat.kind)) {
      throw new RangeError(`Invalid seat kind for ${seatId}.`);
    }
    if (seat.kind === 'policy') {
      if (typeof seat.policyId !== 'string' || !seat.policyId) {
        throw new RangeError(`Policy seat ${seatId} requires policyId.`);
      }
    } else {
      nonPolicy += 1;
      if ('policyId' in seat) throw new RangeError(`${seatId} cannot declare policyId.`);
    }
  }
  if (nonPolicy < 1 || nonPolicy > 2) {
    throw new RangeError('V3.05 supports one or two non-policy seats.');
  }
  if (
    mode === 'hotseat'
    && (
      ids.join(',') !== 'P1,P2'
      || ids.some((id) => seats[id].kind !== 'human-local')
    )
  ) throw new RangeError('Hotseat requires exactly human-local seats P1 and P2.');
  return Object.fromEntries(ids.map((id) => [id, { ...seats[id] }]));
}

function defaultSeats(mode, policyId) {
  if (mode === 'hotseat') {
    return {
      P1: { kind: 'human-local' },
      P2: { kind: 'human-local' },
    };
  }
  return {
    P1: { kind: 'human-local' },
    R1: { kind: 'policy', policyId },
  };
}

function emptyQuarterCommit(seatIds, quarter) {
  const offset = (quarter - 1) % seatIds.length;
  return {
    status: 'collecting',
    committedSeatIds: [],
    committedPackets: {},
    deadlineStamp: null,
    deadlineApplied: false,
    resolutionOrder: [...seatIds.slice(offset), ...seatIds.slice(0, offset)],
    pendingActions: {},
    nextSeatActionIndex: Object.fromEntries(seatIds.map((id) => [id, 0])),
    startStateHash: null,
  };
}

function creditDefaults(limitNav = RULES.startingCash) {
  return {
    limitNav,
    forcedSaleDueQuarter: null,
    breachedQuarter: null,
    insolvent: false,
  };
}

function privateDefaults() {
  return {
    intelByParcel: {},
    accessTokens: {},
  };
}

function syncCanonicalSeatLayer(state) {
  if (!state.seats) return state;
  const secondarySeatId = state.seats.R1 ? 'R1' : (state.seats.P2 ? 'P2' : null);
  const player = state.seatEconomy?.P1;
  if (player) {
    player.cash = state.cash;
    player.actionsRemaining = state.actionsRemaining;
    player.bankedActions = state.banked;
    player.grade = state.grade ?? null;
  }
  const secondary = secondarySeatId ? state.seatEconomy?.[secondarySeatId] : null;
  if (secondary && state.rival) secondary.cash = state.rival.cash;
  if (state.seatCredit?.P1 && state.creditByOwner?.player) {
    state.seatCredit.P1 = clone(state.creditByOwner.player);
  }
  if (secondarySeatId && state.seatCredit?.[secondarySeatId] && state.creditByOwner?.rival) {
    state.seatCredit[secondarySeatId] = clone(state.creditByOwner.rival);
  }
  if (state.seatPrivate?.P1 && state.intel) {
    state.seatPrivate.P1.intelByParcel = clone(state.intel.parcels ?? {});
    state.seatPrivate.P1.accessTokens = clone(state.avatars?.player?.accessTokens ?? {});
  }
  if (state.avatars?.player && state.seats.P1) {
    state.avatars.P1 = { ...clone(state.avatars.player), id: 'P1' };
  }
  for (const parcelId of Object.keys(state.holdings ?? {}).sort()) {
    const holding = state.holdings[parcelId];
    holding.ownerSeatId ??= holding.owner === 'rival' ? secondarySeatId : 'P1';
  }
  return state;
}

export function createRun({
  city,
  seed = city.seed,
  rivalPolicyId = null,
  operatorId: requestedOperatorId = null,
  openingCash: recordedOpeningCash = null,
  mode = 'solo',
  seats: declaredSeats = null,
  roomEconomyVersion,
  cybercabEconomyVersion,
  sellerFeeVersion,
  cybercabFundingVersion,
}) {
  validateRoomEconomyVersion(roomEconomyVersion);
  validateCybercabEconomyVersion(cybercabEconomyVersion);
  validateSellerFeeVersion(sellerFeeVersion);
  validateCybercabFundingVersion(cybercabFundingVersion);
  const signalledOperatorId = typeof rivalPolicyId === 'string'
    && rivalPolicyId.startsWith(OPERATOR_SIGNAL_PREFIX)
    ? rivalPolicyId.slice(OPERATOR_SIGNAL_PREFIX.length)
    : null;
  const forceDefaultOperator = ['daily', 'campaign'].includes(mode);
  const operator = operatorById(
    forceDefaultOperator ? DEFAULT_OPERATOR_ID : (requestedOperatorId ?? signalledOperatorId),
  );
  const openingCash = recordedOpeningCash ?? deriveOpeningCash(city);
  if (!Number.isInteger(openingCash) || openingCash <= 0) {
    throw new RangeError('Recorded opening cash must be a positive integer.');
  }
  const operatorCash = applyBp(openingCash, operator.cashMultipleBp);
  const openingActions = actionsForOperator(operator.id, 1);
  const rivalRng = stream(seed, 'rival:setup');
  const requestedPolicyId = signalledOperatorId ? null : rivalPolicyId;
  const policy = requestedPolicyId
    ? RIVAL_POLICIES.find((p) => p.id === requestedPolicyId) ?? RIVAL_POLICIES[0]
    : rivalRng.pick(RIVAL_POLICIES);
  const seats = validateSeats(declaredSeats ?? defaultSeats(mode, policy.id), { mode });
  const seatIds = Object.keys(seats).sort();

  const parcelStatus = createParcelStatus(city);
  for (const id of Object.keys(parcelStatus).sort()) {
    parcelStatus[id].conditionVersion = 0;
    parcelStatus[id].surveyedConditionVersion = null;
  }
  const state = {
    version: STATE_VERSION,
    ...(roomEconomyVersion === 2 ? { roomEconomyVersion: 2 } : {}),
    ...(sellerFeeVersion === 1 ? { sellerFeeVersion: 1 } : {}),
    ...(cybercabFundingVersion === 1 ? { cybercabFundingVersion: 1 } : {}),
    seed,
    operatorId: operator.id,
    openingCash,
    quarters: city.quarters,
    quarter: 1,
    phase: 'play',
    actionsRemaining: openingActions,
    banked: 0,
    cash: operatorCash,
    holdings: {},
    sectors: Object.fromEntries(SECTOR_IDS.map((s) => [s, 10000])),
    districtIndexBp: Object.fromEntries(
      [...DISTRICTS]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(({ id }) => [id, 10000]),
    ),
    rival: {
      policyId: policy.id,
      cash: operatorCash,
      intent: null,
    },
    people: emptyPeople(),
    avatars: createAvatars(city, seed, ['player'], operatorCash),
    events: emptyEvents(),
    parcelStatus,
    topology: createTopology(city),
    macroPlan: createMacroPlan(city, seed),
    creditByOwner: {
      player: {
        limitNav: operatorCash,
        forcedSaleDueQuarter: null,
        breachedQuarter: null,
        insolvent: false,
      },
      rival: {
        limitNav: operatorCash,
        forcedSaleDueQuarter: null,
        breachedQuarter: null,
        insolvent: false,
      },
    },
    intel: createIntel(),
    blockDemandBp: createBlockDemand(city),
    blockValueIndexBp: createBlockValueIndex(city),
    markets: createMarkets(seed),
    rates: createRatesState(seed, city.quarters),
    supermarket: createSupermarketState(),
    // Civic favour from central-reserve gifts (0–favourMax). Affects lobby odds + works fees.
    favour: 0,
    civicWorks: emptyCivicWorks(),
    fringeVenues: emptyFringeVenues(),
    farms: {},
    cybercab: createCybercabState({ districtId: 'richmond-flat', parcelId: 'p0010', starterFleet: true, economyVersion: cybercabEconomyVersion }),
    university: emptyUniversityFund(),
    reserveKit: { furniture: {}, terrain: {} },
    military: emptyMilitary(),
    actionOrdinal: 0,
    obligations: [],
    log: [],
    ledger: [],
    kitSeqWatermark: restoreKitSeqWatermark({}),
    processDrawWatermark: restoreProcessDrawWatermark({}),
    processDrawLog: restoreProcessDrawLog({}),
    startNav: operatorCash,
    mode,
    seats,
    seatEconomy: Object.fromEntries(seatIds.map((seatId) => [seatId, {
      cash: operatorCash,
      actionsRemaining: seatId === 'P1' ? openingActions : RULES.actionsPerQuarter,
      bankedActions: 0,
      conflictCredits: 0,
      grade: null,
    }])),
    seatCredit: Object.fromEntries(seatIds.map((seatId) => [seatId, creditDefaults(operatorCash)])),
    seatPrivate: Object.fromEntries(seatIds.map((seatId) => [seatId, privateDefaults()])),
    quarterCommit: emptyQuarterCommit(seatIds, 1),
    activePacts: {},
    pactResults: [],
  };

  initialiseCybercabSeatBooks(state);
  for (const seatId of seatIds) {
    if (seatId === 'P1') continue;
    if (seats[seatId].kind !== 'policy') {
      state.avatars[seatId] = { ...clone(state.avatars.player), id: seatId };
    }
  }

  const quarterFramework = tickPeopleThenScheduleEvents(city, state, 1);
  state.people = quarterFramework.people;
  state.events = quarterFramework.events;
  state.weather = quarterFramework.weather;
  if (state.seats.R1?.kind === 'policy') {
    state.rival.intent = decideRivalIntent(city, state, 1);
    state.events = eventsWithRivalCommitment(state.events, state.rival.intent);
  }
  state.districtEngine = evaluateDistrictEngine(city, state, { settledQuarter: 0 });
  syncCanonicalSeatLayer(state);
  if (mode === 'hotseat') delete state.avatars.player;
  state.quarterCommit.startStateHash = quarterStartStateHash(state);
  Object.defineProperty(state.seats, 'runStartEconomy', {
    value: Object.freeze({ operatorId: operator.id, openingCash }),
    enumerable: false,
  });
  return sealFrameworkState(state);
}

export function migrateState(city, priorState) {
  validateRoomEconomyState(priorState);
  validateCybercabRun(priorState);
  const priorVersion = priorState?.version ?? 0;
  const next = clone(priorState);
  next.version = STATE_VERSION;
  next.cybercab ??= createCybercabState({ quarter: next.quarter, districtId: 'richmond-flat' });
  next.operatorId ??= DEFAULT_OPERATOR_ID;
  next.openingCash ??= deriveOpeningCash(city);
  next.topology ??= createTopology(city);
  next.districtIndexBp = Object.fromEntries(
    [...DISTRICTS]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(({ id }) => {
        const legacyId = Object.keys(DISTRICT_ID_MIGRATION_ALIASES)
          .find((candidate) => DISTRICT_ID_MIGRATION_ALIASES[candidate] === id);
        return [id, next.districtIndexBp?.[id] ?? next.districtIndexBp?.[legacyId] ?? 10000];
      }),
  );
  const neutralBlockIndex = createBlockValueIndex(city);
  next.blockValueIndexBp = Object.fromEntries(
    Object.keys(neutralBlockIndex).sort().map((blockId) => [
      blockId,
      Number.isInteger(next.blockValueIndexBp?.[blockId])
        ? next.blockValueIndexBp[blockId]
        : neutralBlockIndex[blockId],
    ]),
  );
  for (const avatar of Object.values(next.avatars ?? {})) avatar.meetResults ??= {};
  const districtById = Object.fromEntries(DISTRICTS.map((district) => [district.id, district]));
  for (const parcel of Object.values(next.topology.parcels ?? {})) {
    const canonicalId = DISTRICT_ID_MIGRATION_ALIASES[parcel.districtId] ?? parcel.districtId;
    const district = districtById[canonicalId];
    if (!district) continue;
    parcel.districtId = canonicalId;
    parcel.districtName = district.name;
    parcel.heightRegisterId = district.heightRegisterId;
    parcel.districtCapStoreys = district.districtCapStoreys;
    parcel.towerOverlay = district.towerOverlay;
    parcel.bandBp = district.appliedBandBp;
    parcel.appliedBandBp = district.appliedBandBp;
  }
  for (const id of Object.keys(next.parcelStatus ?? {}).sort()) {
    const status = next.parcelStatus[id];
    const holding = next.holdings?.[id];
    const statusLevel = status.builtLevel ?? 0;
    const holdingLevel = holding?.level ?? 0;
    const statusArchetype =
      status.builtArchetypeId ?? activeParcel(city, next, id)?.archetypeId ?? null;
    const holdingShowsSuccession = Boolean(holding) && (
      holdingLevel > statusLevel
      || (
        status.builtArchetypeId == null
        && holding.archetypeId != null
        && holding.archetypeId !== statusArchetype
      )
    );
    if (holdingShowsSuccession) {
      status.builtArchetypeId = holding.archetypeId;
      status.builtLevel = holdingLevel;
    } else {
      status.builtArchetypeId ??= null;
      status.builtLevel ??= 0;
    }
    status.builtLandUseId ??= holding?.landUseId ?? status.builtArchetypeId ?? null;
    if (holding) holding.landUseId ??= status.builtLandUseId ?? holding.archetypeId ?? null;
    status.conditionVersion ??= 0;
    status.surveyedConditionVersion ??= null;
    status.damage ??= null;
    const intel = next.intel?.parcels?.[id];
    if (
      intel?.source === 'survey'
      && intel.conditionRevealed
      && !SURVEY_DEFECT_TIERS[intel.defectTier]
    ) {
      intel.defectTier = surveyDefectTierForCondition(status.condition);
      intel.condition = status.condition;
    }
  }
  for (const id of Object.keys(next.holdings ?? {}).sort()) {
    const holding = next.holdings[id];
    const savedCeiling = Number(holding.planningCeiling);
    const builtLevel = Math.max(
      0,
      Number(holding.level) || 0,
      Number(next.parcelStatus?.[id]?.builtLevel) || 0,
    );
    holding.planningCeiling = Number.isInteger(savedCeiling) && savedCeiling >= builtLevel
      ? Math.min(RULES.maxLevel, savedCeiling)
      : Math.max(builtLevel, defaultPlanningCeilingFor(holding.archetypeId));
    const savedNotice = holding.redevelopmentNotice;
    if (savedNotice && next.parcelStatus?.[id]?.occupancy === 'tenant') {
      const chosenQuarter = savedNotice.chosenQuarter ?? Math.max(
        1,
        (savedNotice.startsQuarter ?? next.quarter + 1) - 1,
      );
      holding.redevelopmentNotice = {
        chosenQuarter,
        startsQuarter: savedNotice.startsQuarter ?? chosenQuarter + 1,
        tenantRentBp: 5000,
      };
    } else {
      holding.redevelopmentNotice = null;
    }
    holding.conditionAssessment ??= null;
  }
  next.macroPlan ??= createMacroPlan(city, next.seed);
  next.creditByOwner ??= {
    player: {
      limitNav: next.startNav ?? RULES.startingCash,
      forcedSaleDueQuarter: null,
      breachedQuarter: null,
      insolvent: false,
    },
    rival: {
      limitNav: RULES.startingCash,
      forcedSaleDueQuarter: null,
      breachedQuarter: null,
      insolvent: false,
    },
  };
  if (priorVersion < 5 || !next.seats) {
    const policyId = next.rival?.policyId ?? RIVAL_POLICIES[0].id;
    next.mode = 'solo';
    next.seats = validateSeats(defaultSeats('solo', policyId), { mode: 'solo' });
    next.seatEconomy = {
      P1: {
        cash: next.cash,
        actionsRemaining: next.actionsRemaining,
        bankedActions: next.banked,
        conflictCredits: 0,
        grade: next.grade ?? null,
      },
      R1: {
        cash: next.rival?.cash ?? RULES.startingCash,
        actionsRemaining: RULES.actionsPerQuarter,
        bankedActions: 0,
        conflictCredits: 0,
        grade: null,
      },
    };
    next.seatCredit = {
      P1: clone(next.creditByOwner.player ?? creditDefaults(next.startNav)),
      R1: clone(next.creditByOwner.rival ?? creditDefaults()),
    };
    next.seatPrivate = {
      P1: {
        intelByParcel: clone(next.intel?.parcels ?? {}),
        accessTokens: clone(next.avatars?.player?.accessTokens ?? {}),
      },
      R1: privateDefaults(),
    };
    if (next.avatars?.player) {
      next.avatars.P1 = { ...clone(next.avatars.player), id: 'P1' };
    }
    for (const parcelId of Object.keys(next.holdings ?? {}).sort()) {
      const holding = next.holdings[parcelId];
      holding.ownerSeatId = holding.owner === 'rival' ? 'R1' : 'P1';
    }
    for (const entry of next.log ?? []) {
      if (entry.type === 'run-start') {
        entry.seatId = SYSTEM_SEAT_ID;
        entry.mode ??= 'solo';
        entry.seats ??= clone(next.seats);
        continue;
      }
      entry.seatId ??= entry.owner === 'rival' ? 'R1' : 'P1';
      entry.seatActionIndex ??= null;
    }
    next.quarterCommit = emptyQuarterCommit(Object.keys(next.seats).sort(), next.quarter);
    next.activePacts = {};
    next.pactResults = [];
  } else {
    next.seats = validateSeats(next.seats, { mode: next.mode ?? null });
    next.seatEconomy ??= {};
    next.seatCredit ??= {};
    next.seatPrivate ??= {};
    for (const seatId of Object.keys(next.seats).sort()) {
      next.seatEconomy[seatId] ??= {
        cash: RULES.startingCash,
        actionsRemaining: RULES.actionsPerQuarter,
        bankedActions: 0,
        conflictCredits: 0,
        grade: null,
      };
      next.seatCredit[seatId] ??= creditDefaults(next.seatEconomy[seatId].cash);
      next.seatPrivate[seatId] ??= privateDefaults();
    }
    next.quarterCommit ??= emptyQuarterCommit(Object.keys(next.seats).sort(), next.quarter);
    next.activePacts ??= {};
    next.pactResults ??= [];
  }
  next.markets = ensureMarketsShape(
    next.markets ?? createMarkets(next.seed ?? city.seed),
    next.seed ?? city.seed,
  );
  next.districtEngine = evaluateDistrictEngine(city, next, {
    settledQuarter: Math.max(0, (next.quarter ?? 1) - 1),
  });
  try {
    next.kitSeqWatermark = restoreKitSeqWatermark(next.kitSeqWatermark ?? {});
  } catch {
    next.kitSeqWatermark = restoreKitSeqWatermark({});
  }
  try {
    next.processDrawWatermark = restoreProcessDrawWatermark(next.processDrawWatermark ?? {});
  } catch {
    next.processDrawWatermark = restoreProcessDrawWatermark({});
  }
  try {
    next.processDrawLog = restoreProcessDrawLog(next.processDrawLog ?? {});
  } catch {
    next.processDrawLog = restoreProcessDrawLog({});
  }
  delete next.consumedKitIds;
  next.military ??= emptyMilitary();
  if (!Array.isArray(next.military.units) || !next.military.watch) {
    next.military = emptyMilitary();
  }
  syncCanonicalSeatLayer(next);
  next.quarterCommit.startStateHash ??= quarterStartStateHash(next);
  return sealFrameworkState(next);
}

function sealFrameworkState(state) {
  validateRoomEconomyState(state);
  state.people = freezePeople(state.people);
  state.events = freezeEvents(state.events);
  return state;
}

/**
 * Binding quarter epoch: people read one immutable input snapshot, then events and
 * crowd scheduling read the named postPeopleTickSnapshot. Never reverse these calls.
 */
function tickPeopleThenScheduleEvents(city, state, quarter) {
  const peopleInputSnapshot = createPeopleInputSnapshot({ ...state, quarter });
  const runtimeCity = activeCity(city, peopleInputSnapshot);
  const people = tickPeopleFromSnapshot(runtimeCity, peopleInputSnapshot, quarter);
  const postPeopleTickSnapshot = createPeopleInputSnapshot({
    ...peopleInputSnapshot,
    people,
  });
  const weather = realiseWeather(state.seed, quarter, runtimeCity, postPeopleTickSnapshot);
  const events = scheduleEvents(runtimeCity, { ...postPeopleTickSnapshot, weather }, quarter);
  return { people, events, weather };
}

function holdingDefaults(city, parcelId) {
  const archetypeId = activeParcel(city, null, parcelId).archetypeId;
  return {
    ...holdingFrameworkDefaults(ARCHETYPES[archetypeId]),
    planningCeiling: defaultPlanningCeilingFor(archetypeId),
  };
}

function holdingDefaultsForState(city, state, parcelId) {
  const archetypeId = archetypeIdOf(city, state, parcelId);
  return {
    ...holdingFrameworkDefaults(ARCHETYPES[archetypeId]),
    planningCeiling: defaultPlanningCeilingFor(archetypeId),
  };
}

function completedBaseForStatus(city, state, parcelId) {
  const parcel = activeParcel(city, state, parcelId);
  const normal = parcel.consolidated && state.parcelStatus[parcelId].builtLevel === 0
    ? {
      archetypeId: parcel.archetypeId,
      sector: parcel.sector,
      storeys: parcel.storeys,
      basePrice: parcel.basePrice,
      baseRent: parcel.baseRent,
    }
    : buildingBaseFor(
      parcel,
      archetypeIdOf(city, state, parcelId),
      state.parcelStatus[parcelId].condition,
      { parcelStatus: state.parcelStatus[parcelId] },
    );
  return roomTransferBase(state, parcelId, normal);
}

function recordBuiltFormOnExit(city, state, parcelId, holding) {
  captureRoomCompletedBase(state, parcelId, holding);
  const status = state.parcelStatus[parcelId];
  status.condition = holding.condition;
  if (
    activeParcel(city, state, parcelId)?.consolidated
    && holding.level === 0
    && status.builtLevel === 0
  ) {
    status.builtArchetypeId = null;
    status.builtLandUseId = null;
    status.builtLevel = 0;
    return;
  }
  status.builtArchetypeId = holding.archetypeId;
  status.builtLandUseId = holding.landUseId ?? holding.archetypeId;
  status.builtLevel = holding.level;
}

function canFund(city, state, owner, cashOut, options) {
  return cashPosition(city, state, owner, cashOut, options);
}

function rivalPolicyCashFunds(state, cashOut) {
  return cashOut <= state.rival.cash;
}

function pendingRenovation(state, parcelId, quote) {
  return Object.freeze({
    ...renovationRecord(quote.nextCondition, state.quarter),
    defectRoll: worksQualityRoll(
      state.seed,
      state.quarter,
      parcelId,
      state.actionOrdinal,
      state.activeSeatId ?? null,
    ),
    defectChanceBp: quote.defectChanceBp,
    tenantRentBp: quote.tenantRentBp,
  });
}

function pendingConstruction(state, parcelId, quote, {
  startedQuarter = state.quarter,
  completionQuarter = null,
} = {}) {
  const duration = quote.durationQuarters
    ?? constructionDurationQuarters(quote.toArchetype, quote.sectorAfter);
  const finishAt = completionQuarter ?? (startedQuarter + duration);
  return Object.freeze({
    ...constructionRecord(quote.fromArchetype, quote.toArchetype, startedQuarter),
    toLandUseId: quote.toLandUseId ?? quote.toArchetype,
    defectRoll: worksQualityRoll(
      state.seed,
      state.quarter,
      parcelId,
      state.actionOrdinal,
      state.activeSeatId ?? null,
    ),
    defectChanceBp: quote.defectChanceBp,
    completionQuarter: finishAt,
    durationQuarters: duration,
    residentialBuild: Boolean(quote.residentialBuild),
    nextLevel: quote.nextLevel,
    accidentOccurred: false,
    accidentQuarter: null,
    slot: quote.slot ?? null,
  });
}

function pendingTenantNotice(state) {
  return Object.freeze({
    chosenQuarter: state.quarter,
    startsQuarter: state.quarter + 1,
    tenantRentBp: 5000,
  });
}

// --- Rival -------------------------------------------------------------------

/**
 * The rival plays the same two verbs the player does, under the same budget, and its
 * next move is always disclosed. The decision is derived purely from
 * (seed, quarter, nonce, current state), so replaying a log reproduces it exactly.
 */
function rivalTenantQuality(city, state, id) {
  return isFranchiseTenancyUse(archetypeIdOf(city, state, id)) ? 'local-operator' : 'secure';
}

function rivalLeaseMove(city, state, excluded) {
  let best = null;
  for (const id of Object.keys(state.holdings).sort()) {
    if (excluded.has(id) || state.holdings[id].owner !== 'rival') continue;
    const tenantQuality = rivalTenantQuality(city, state, id);
    const quote = leaseQuote(city, state, id, tenantQuality, 'rival');
    if (!quote.ok || !rivalPolicyCashFunds(state, quote.cashOut)) continue;
    const projected = { ...state, parcelStatus: { ...state.parcelStatus,
      [id]: { ...state.parcelStatus[id], occupancy: 'tenant', tenant: quote.tenant } } };
    const rent = rentFor(city, projected, id);
    const term = Math.min(quote.termQuarters, state.quarters - state.quarter + 1);
    const gain = (rent - applyBp(rent, RULES.opexBp)) * term - quote.cashOut;
    if (gain > 0 && (!best || gain > best.gain)) best = { id, tenantQuality, gain };
  }
  return best;
}

/** Cash-flow forecast for a policy acquisition, not a promise of future tenants.
 * Uses current rent law and secure renewal terms; future events/market changes
 * remain forecast uncertainty. Never mutates the candidate or spends real cash.
 */
export function rivalAcquisitionIncomeQuote(city, state, id, actionsLeft = RULES.actionsPerQuarter) {
  const none = { operatingIncome: 0, leaseCost: 0, leaseQuarters: 0, existingQuarters: 0 };
  if (ownerOf(state, id) || !activeParcel(city, state, id)) return none;
  const projected = { ...state, rival: { ...state.rival }, holdings: { ...state.holdings },
    parcelStatus: { ...state.parcelStatus, [id]: { ...state.parcelStatus[id] } } };
  const acquisition = executeRivalMove(city, projected, { verb: 'acquire', parcelId: id });
  if (!acquisition.moved) return none;
  const remaining = Math.max(0, state.quarters - state.quarter + 1);
  const status = projected.parcelStatus[id];
  const existingQuarters = status.occupancy === 'tenant' && status.tenant
    ? Math.min(remaining, Math.max(0, status.tenant.expiresAfterQuarter - state.quarter + 1)) : 0;
  const net = rent => rent - applyBp(rent, RULES.opexBp);
  let operatingIncome = net(rentFor(city, projected, id)) * existingQuarters;
  const uncovered = remaining - existingQuarters;
  if (!uncovered) return { ...none, operatingIncome, existingQuarters };
  // Renewal is evaluated after expiry, using the same stable terms the policy
  // actually chooses. An inherited stretch lease is not forecast forever.
  if (existingQuarters) {
    status.tenant = null;
    status.occupancy = 'vacant';
  }
  const lease = leaseQuote(city, projected, id, rivalTenantQuality(city, projected, id), 'rival');
  if (!lease.ok || !rivalPolicyCashFunds(projected, lease.cashOut)) return { ...none, operatingIncome, existingQuarters };
  applyLease(projected, id, lease, 'rival');
  // A purchase in the final slot cannot also lease during that quarter.
  const leaseQuarters = Math.max(0, uncovered - (!existingQuarters && actionsLeft < 2 ? 1 : 0));
  operatingIncome += net(rentFor(city, projected, id)) * leaseQuarters;
  return { operatingIncome, existingQuarters, leaseQuarters,
    leaseCost: Math.ceil(leaseQuarters / lease.termQuarters) * lease.cashOut };
}

function decideRivalMove(city, state, quarter, nonce = 0, excludedParcelIds = new Set(), actionsLeft = RULES.actionsPerQuarter) {
  const policy = RIVAL_POLICIES.find((p) => p.id === state.rival.policyId);
  const lease = rivalLeaseMove(city, state, excludedParcelIds);
  if (lease) return { verb: 'lease', parcelId: lease.id, tenantQuality: lease.tenantQuality,
    policyName: policy.name, text: `${policy.name} will lease ${lease.id.toUpperCase()} to a ${lease.tenantQuality} tenant.` };
  const rng = stream(state.seed, `rival:q${quarter}:${nonce}`);
  const row = city.market.find((r) => r.quarter === quarter);

  // Both verbs are scored on the same basis: expected change in NAV over the rest of
  // the run, per dollar of cash deployed, in basis points. Comparing anything else
  // makes the rival prefer whichever verb happens to have the larger raw numbers.
  const remaining = Math.max(1, state.quarters - quarter + 1);
  const netOf = (rent, debt) =>
    rent - applyBp(rent, RULES.opexBp) - applyBp(debt, RULES.interestBp);

  let bestBuy = null;
  for (const id of [...activeOrder(city, state)].sort()) {
    if (ownerOf(state, id) || excludedParcelIds.has(id)) continue;
    const parcel = activeParcel(city, state, id);
    const price = marketValue(city, state, id);
    const quote = acquireQuote(city, state, id, 'rival');
    // Credit is a legality boundary, not a mandate to lever every disclosed policy
    // move. Ordinary rival scoring retains its established cash-funded discipline;
    // execution still uses the same overdraft floor if a prior commitment moves cash.
    if (!rivalPolicyCashFunds(state, quote.cashOut)) continue;

    const adjacentOwned = activeAdjacency(city, state, id)
      .filter((n) => ownerOf(state, n) === 'rival').length;
    const forecastBp = row ? row.sectors[sectorOf(city, state, id)].forecastBp : 0;
    const income = rivalAcquisitionIncomeQuote(city, state, id, actionsLeft);
    const gain = -quote.duty - income.leaseCost + income.operatingIncome
      - applyBp(quote.debtTaken, RULES.interestBp) * remaining
      + applyBp(price, forecastBp * remaining);
    const roiBp = Math.round((gain * 10000) / Math.max(1, quote.cashOut + income.leaseCost));

    const score = roiBp
      + policy.score({
        yieldBp: yieldBp(city, state, id),
        forecastBp,
        tram: parcel.tram,
        adjacentOwned,
        price,
      })
      // Every policy values adjacency a little; corridors compound for the rival too.
      + adjacentOwned * 260
      + rng.range(-120, 120);

    if (!bestBuy || score > bestBuy.score) bestBuy = { id, score, price };
  }

  let bestRenovate = null;
  let bestRedevelop = null;
  for (const id of Object.keys(state.holdings).sort()) {
    const holding = state.holdings[id];
    if (holding.owner !== 'rival' || holding.construction || holding.renovation) continue;
    const parcel = activeParcel(city, state, id);
    const noticePending = Boolean(
      holding.redevelopmentNotice
      && state.parcelStatus?.[id]?.occupancy === 'tenant',
    );
    // Notice is a tenancy action, not permission to repeat the charge or begin
    // another job during the full notice quarter.
    if (noticePending) continue;
    const occupied = state.parcelStatus?.[id]?.occupancy === 'tenant';
    const links = activeAdjacency(city, state, id)
      .filter((n) => ownerOf(state, n) === 'rival').length;
    if (conditionOf(city, state, id) < RULES.maxCondition) {
      const quote = renovateQuote(city, state, id, 'rival');
      if (rivalPolicyCashFunds(state, quote.cashOut)) {
        const forecastBp = row ? row.sectors[holding.sector ?? parcel.sector].forecastBp : 0;
        const valueGain = quote.valueAfter - quote.valueNow;
        const earningQuarters = Math.max(0, state.quarters - quarter - 1);
        const valueRecognised = quarter < state.quarters ? valueGain : 0;
        const rentGain = quote.rentAfter - quote.rentNow;
        const gain = valueRecognised - quote.cost
          + (rentGain - applyBp(rentGain, RULES.opexBp)) * earningQuarters
          - applyBp(quote.debtTaken, RULES.interestBp) * remaining
          + applyBp(valueRecognised, forecastBp * Math.max(0, remaining - 1));
        const roiBp = Math.round((gain * 10000) / Math.max(1, quote.cashOut));
        const score = roiBp + links * 120 + rng.range(-120, 120);
        if (!bestRenovate || score > bestRenovate.score) {
          bestRenovate = { id, score, cost: quote.cashOut };
        }
      }
    }
    if (holding.level < RULES.maxLevel) {
      const quote = redevelopQuote(city, state, id, 'rival');
      const exit = occupied ? redevelopmentExitQuote(city, state, id, 'rival')?.notice : null;
      const actionCashOut = occupied ? exit?.cashOut : quote?.cashOut;
      // Notice is deliberately cheap at the press because it buys vacancy only. The
      // policy still evaluates and cash-screens the complete intended path, otherwise
      // dividing the redevelopment return by half a quarter's rent makes every occupied
      // holding swamp the disclosed acquisition market. Nothing is reserved or charged
      // here; the later vacant Redevelop must pass its live works quote independently.
      const pathCashOut = occupied
        ? (exit?.cashOut ?? 0) + (quote?.cashOut ?? 0)
        : quote?.cashOut;
      if (quote && rivalPolicyCashFunds(state, pathCashOut)) {
        // The site earns nothing in the settlement it starts or the one it completes
        // in. A final-quarter site never completes, so score its construction value.
        const earningQuarters = Math.max(0, state.quarters - quarter - 1);
        const terminalValue = quarter < state.quarters
          ? quote.valueAfter
          : quote.constructionValue;
        const gain = terminalValue - quote.valueNow - quote.cost - (exit?.cashOut ?? 0)
          + netOf(quote.rentAfter, quote.debtTaken) * earningQuarters
          - netOf(quote.rentNow, 0) * remaining;
        const roiBp = Math.round((gain * 10000) / Math.max(1, pathCashOut));
        const score = roiBp + links * 180 + rng.range(-120, 120);
        if (!bestRedevelop || score > bestRedevelop.score) {
          bestRedevelop = { id, score, cost: actionCashOut, notice: occupied };
        }
      }
    }
  }

  const buyScore = bestBuy ? bestBuy.score : -Infinity;
  const renovateScore = bestRenovate ? bestRenovate.score : -Infinity;
  const redevelopScore = bestRedevelop ? bestRedevelop.score : -Infinity;

  if (redevelopScore > buyScore && redevelopScore > renovateScore && bestRedevelop) {
    const parcel = activeParcel(city, state, bestRedevelop.id);
    return {
      verb: 'redevelop',
      parcelId: bestRedevelop.id,
      policyName: policy.name,
      text: bestRedevelop.notice
        ? `${policy.name} will serve notice on its ${parcel.districtName} holding for about $${bestRedevelop.cost.toLocaleString()}.`
        : `${policy.name} will redevelop its ${parcel.districtName} holding for about $${bestRedevelop.cost.toLocaleString()}.`,
    };
  }
  if (renovateScore > buyScore && bestRenovate) {
    const parcel = activeParcel(city, state, bestRenovate.id);
    return {
      verb: 'renovate',
      parcelId: bestRenovate.id,
      policyName: policy.name,
      text: `${policy.name} will renovate its ${parcel.districtName} holding for about $${bestRenovate.cost.toLocaleString()}.`,
    };
  }
  if (bestBuy) {
    const parcel = activeParcel(city, state, bestBuy.id);
    return {
      verb: 'acquire',
      parcelId: bestBuy.id,
      policyName: policy.name,
      text: `${policy.name} will bid on a ${parcel.sector} parcel in ${parcel.districtName} at about $${bestBuy.price.toLocaleString()}.`,
    };
  }
  return {
    verb: 'hold',
    parcelId: null,
    policyName: policy.name,
    text: `${policy.name} is holding cash — nothing on the board clears its filter.`,
  };
}

function rivalAuctionDecision(city, state, auction) {
  const policy = RIVAL_POLICIES.find((item) => item.id === state.rival.policyId);
  const parcelId = auction.anchorIds[0];
  const parcel = activeParcel(city, state, parcelId);
  const row = city.market.find(({ quarter }) => quarter === state.quarter);
  const forecastBp = row?.sectors[parcel.sector]?.forecastBp ?? 0;
  const runningYieldBp = yieldBp(city, state, parcelId);
  const adjacentOwned = activeAdjacency(city, state, parcelId)
    .filter((id) => ownerOf(state, id) === 'rival').length;
  let attends = false;
  let premiumSteps = 0;
  let rationale;

  if (policy.id === 'value') {
    attends = runningYieldBp >= 500;
    premiumSteps = Math.max(1, Math.min(3, 1 + Math.floor((runningYieldBp - 500) / 40)));
    rationale = `${runningYieldBp / 100}% running yield`;
  } else if (policy.id === 'momentum') {
    attends = forecastBp > 0;
    premiumSteps = Math.max(1, Math.min(4, 1 + Math.floor(forecastBp / 175)));
    rationale = `${forecastBp >= 0 ? '+' : ''}${forecastBp} bp sector forecast`;
  } else {
    attends = parcel.tram || adjacentOwned > 0;
    premiumSteps = Math.min(4, (parcel.tram ? 2 : 1) + Math.min(2, adjacentOwned));
    rationale = parcel.tram
      ? `tram frontage${adjacentOwned ? ` and ${adjacentOwned} corridor link` : ''}`
      : `${adjacentOwned} corridor link`;
  }

  const { reservePrice, increment } = auctionTerms(
    auction.payload.scheduledAsking,
    auction.payload.crowdSize,
  );
  const cashRateBp = 10000 - RULES.lvrBp + RULES.dutyBp;
  // The disclosed rival is allowed to bid to the same legal cash-at-cap ceiling as the
  // player, but its policy voluntarily keeps a 20% liquidity reserve instead of exhausting
  // the account on one appreciating parcel.
  const strategyCash = applyBp(
    Math.max(0, state.rival.cash - overdraftFloor(city, state, 'rival')),
    8000,
  );
  const maxAffordable = Math.floor(
    Math.floor(strategyCash * 10000 / cashRateBp) / increment,
  ) * increment;
  if (!attends || maxAffordable < reservePrice) {
    const reason = attends
      ? `base-rate cash capacity after its 20% liquidity reserve is below the ${reservePrice.toLocaleString()} reserve`
      : `${rationale} does not clear the ${policy.name} strategy`;
    return {
      verb: 'auction-pass',
      eventId: auction.id,
      parcelId,
      policyId: policy.id,
      policyName: policy.name,
      maxBid: null,
      cashAtCap: 0,
      text: `${policy.name} will skip the auction at ${parcelId.toUpperCase()}: ${reason}.`,
    };
  }

  const desired = reservePrice + premiumSteps * increment;
  const maxBid = Math.floor(Math.min(desired, maxAffordable) / increment) * increment;
  const debtAtCap = applyBp(maxBid, RULES.lvrBp);
  const dutyAtCap = applyBp(maxBid, RULES.dutyBp);
  const cashAtCap = maxBid - debtAtCap + dutyAtCap;
  return {
    verb: 'auction',
    eventId: auction.id,
    parcelId,
    policyId: policy.id,
    policyName: policy.name,
    maxBid,
    lvrBp: RULES.lvrBp,
    cashAtCap,
    rationale,
    text: `${policy.name} will attend the auction at ${parcelId.toUpperCase()} with a disclosed $${maxBid.toLocaleString()} ceiling (${rationale}).`,
  };
}

function rivalInsuranceMove(city, state) {
  const exposures = new Map();
  for (const event of eventsResolving(state)) {
    const hazard = event.type === 'flash-flood' ? 'flood' : event.type === 'fire' ? 'fire' : null;
    if (!hazard) continue;
    const ids = hazard === 'flood'
      ? Object.keys(event.payload.exposures ?? {}).sort()
      : [...event.anchorIds].sort();
    for (const parcelId of ids) {
      const holding = state.holdings[parcelId];
      if (
        holding?.owner !== 'rival'
        || (
          holding.insurance?.[hazard]
          && holding.insurance.expiresAfterQuarter >= state.quarter
        )
      ) continue;
      if (!exposures.has(parcelId)) exposures.set(parcelId, new Set());
      exposures.get(parcelId).add(hazard);
    }
  }
  for (const parcelId of [...exposures.keys()].sort()) {
    const hazards = exposures.get(parcelId);
    const cover = hazards.size === 2 ? 'both' : [...hazards][0];
    const premium = insurancePremium(marketValue(city, state, parcelId), cover);
    if (!rivalPolicyCashFunds(state, premium)) continue;
    const policy = RIVAL_POLICIES.find((item) => item.id === state.rival.policyId);
    return {
      verb: 'insure',
      parcelId,
      cover,
      premium,
      policyName: policy.name,
      text: `${policy.name} will insure ${parcelId.toUpperCase()} for ${cover} cover at $${premium.toLocaleString()}.`,
    };
  }
  return null;
}

/**
 * The rival takes two actions per quarter, so it discloses two. The second is planned
 * against a scratch state in which the first has already landed — otherwise the player
 * is told about one bid and then loses a second parcel with no warning, which is not a
 * contest, it is an ambush.
 */
function planRivalQuarter(city, state, quarter) {
  const auction = auctionResolving(state, quarter);
  const auctionMove = auction ? rivalAuctionDecision(city, state, auction) : null;
  const plan = auctionMove ? [auctionMove] : [];
  const excluded = new Set(auction?.anchorIds ?? []);
  let ordinarySlots = RULES.actionsPerQuarter - (auctionMove?.verb === 'auction' ? 1 : 0);
  let scratch = clone(state);
  if (auctionMove?.verb === 'auction') {
    // Reserve the disclosed bid-cap cash while planning the remaining action. Settlement
    // still charges the actual runner-up price, but the rival cannot promise two uses of cash.
    scratch.rival.cash -= auctionMove.cashAtCap;
  }
  const insurance = ordinarySlots > 0 ? rivalInsuranceMove(city, scratch) : null;
  if (insurance) {
    plan.push(insurance);
    executeRivalMove(city, scratch, insurance);
    ordinarySlots -= 1;
  }
  for (let i = 0; i < ordinarySlots; i += 1) {
    const move = decideRivalMove(city, scratch, quarter, i, excluded, ordinarySlots - i);
    plan.push(move);
    if (!move.parcelId) break;
    executeRivalMove(city, scratch, move);
  }
  return plan;
}

function intentFromPlan(city, state, plan) {
  const visible = plan.filter((m) => m.parcelId);
  const real = visible.filter((m) => !['auction', 'auction-pass'].includes(m.verb));
  const auction = visible.find((m) => ['auction', 'auction-pass'].includes(m.verb)) ?? null;
  if (!real.length) {
    return {
      ...plan[0],
      plan,
      parcelIds: [],
      auctionParcelId: auction?.parcelId ?? null,
      text: plan[0].text,
    };
  }
  const describe = (move) => {
    const parcel = activeParcel(city, state, move.parcelId);
    const where = `${parcel.districtName} ${move.parcelId.toUpperCase()}`;
    if (move.verb === 'redevelop') return `redevelop ${where}`;
    if (move.verb === 'lease') return `lease ${where} to a ${move.tenantQuality} tenant`;
    if (move.verb === 'renovate') return `renovate ${where}`;
    if (move.verb === 'insure') return `insure ${where} for ${move.cover}`;
    if (move.verb === 'auction') {
      return `attend the auction at ${where} up to $${move.maxBid.toLocaleString()}`;
    }
    if (move.verb === 'auction-pass') return `skip the auction at ${where}`;
    return `bid on ${where}`;
  };
  return {
    ...real[0],
    plan,
    parcelIds: real.map((m) => m.parcelId),
    auctionParcelId: auction?.parcelId ?? null,
    text: `${real[0].policyName} will ${visible.map(describe).join(', then ')}.`,
  };
}

function decideRivalIntent(city, state, quarter) {
  return intentFromPlan(city, state, planRivalQuarter(city, state, quarter));
}

function eventsWithRivalCommitment(events, intent) {
  const move = intent.plan?.find(({ verb }) => verb === 'auction');
  if (!move) return events;
  const event = events.byId[move.eventId];
  if (!event) throw new Error(`Rival auction plan names missing event ${move.eventId}`);
  const byId = {
    ...events.byId,
    [event.id]: {
      ...event,
      rivalCommitment: {
        policyId: move.policyId,
        maxBid: move.maxBid,
        committedQuarter: event.resolveQuarter,
        lvrBp: move.lvrBp,
        cashAtCap: move.cashAtCap,
        rationale: move.rationale,
      },
    },
  };
  return freezeEvents({ order: events.order, byId });
}

/** Execute one rival move. Same transaction discipline as the player's verbs. */
function executeRivalMove(city, next, move) {
  if (!move || !move.parcelId) return { moved: false, text: 'held cash' };
  if (move.verb === 'auction') return { moved: false, auctionSlot: true, text: 'attended the auction' };
  if (move.verb === 'auction-pass') {
    return { moved: false, auctionSlot: false, text: 'skipped the auction' };
  }
  const reserved = auctionResolving(next)?.anchorIds.includes(move.parcelId);
  if (reserved && move.verb !== 'insure') {
    return { moved: false, text: 'could not use an ordinary slot on the auction parcel' };
  }

  if (move.verb === 'lease') {
    const quote = leaseQuote(city, next, move.parcelId, move.tenantQuality, 'rival');
    if (!quote.ok) return { moved: false, verb: 'lease', parcelId: move.parcelId, text: quote.reason };
    applyLease(next, move.parcelId, quote, 'rival');
    return { moved: true, verb: 'lease', parcelId: move.parcelId,
      tenantQuality: move.tenantQuality, cashOut: quote.cashOut,
      text: `leased ${move.parcelId.toUpperCase()} to a ${move.tenantQuality} tenant for $${quote.cashOut.toLocaleString()}` };
  }

  if (move.verb === 'insure') {
    const holding = next.holdings[move.parcelId];
    if (!holding || holding.owner !== 'rival') {
      return { moved: false, text: 'could not insure a parcel it does not hold' };
    }
    const premium = insurancePremium(marketValue(city, next, move.parcelId), move.cover);
    if (!canFund(city, next, 'rival', premium).ok) {
      return { moved: false, text: 'could not fund insurance' };
    }
    const requested = {
      fire: move.cover === 'fire' || move.cover === 'both',
      flood: move.cover === 'flood' || move.cover === 'both',
    };
    const existing = holding.insurance
      && holding.insurance.expiresAfterQuarter >= next.quarter
      ? holding.insurance
      : { fire: false, flood: false };
    next.rival.cash -= premium;
    holding.insurance = {
      fire: existing.fire || requested.fire,
      flood: existing.flood || requested.flood,
      expiresAfterQuarter: next.quarter + 3,
    };
    return {
      moved: true,
      verb: 'insure',
      parcelId: move.parcelId,
      text: `insured ${activeParcel(city, next, move.parcelId).districtName} for $${premium.toLocaleString()}`,
    };
  }

  if (move.verb === 'renovate') {
    const holding = next.holdings[move.parcelId];
    if (
      !holding || holding.owner !== 'rival' || holding.construction || holding.renovation
      || conditionOf(city, next, move.parcelId) >= RULES.maxCondition
    ) {
      return { moved: false, text: 'could not proceed with its works' };
    }
    const quote = renovateQuote(city, next, move.parcelId, 'rival');
    if (!canFund(city, next, 'rival', quote.cashOut).ok) {
      return { moved: false, text: 'could not fund its works' };
    }
    next.rival.cash -= quote.cashOut;
    creditHammerbarnRoyalty(next, quote);
    holding.debt += quote.debtTaken;
    holding.renovation = pendingRenovation(next, move.parcelId, quote);
    return {
      moved: true,
      verb: 'renovate',
      parcelId: move.parcelId,
      text: `renovated in ${activeParcel(city, next, move.parcelId).districtName} for $${quote.cost.toLocaleString()}`,
    };
  }

  if (move.verb === 'redevelop') {
    const holding = next.holdings[move.parcelId];
    if (
      !holding || holding.owner !== 'rival' || holding.construction || holding.renovation
      || holding.level >= RULES.maxLevel
    ) {
      return { moved: false, text: 'could not proceed with its works' };
    }
    const quote = redevelopQuote(city, next, move.parcelId, 'rival');
    const tenantExit = next.parcelStatus[move.parcelId].occupancy === 'tenant'
      ? 'notice'
      : null;
    if (tenantExit === 'notice' && holding.redevelopmentNotice) {
      return { moved: false, text: 'is waiting for its notice quarter to finish' };
    }
    const cashOut = tenantExit === 'notice'
      ? redevelopmentExitQuote(city, next, move.parcelId, 'rival').notice.cashOut
      : quote?.cashOut;
    if (!quote || !canFund(city, next, 'rival', cashOut).ok) {
      return { moved: false, text: 'could not fund its works' };
    }
    next.rival.cash -= cashOut;
    if (tenantExit === 'notice') {
      holding.redevelopmentNotice = pendingTenantNotice(next);
    } else {
      creditHammerbarnRoyalty(next, quote);
      holding.debt += quote.debtTaken;
      holding.construction = pendingConstruction(next, move.parcelId, quote);
      holding.redevelopmentNotice = null;
    }
    delete holding.renovation;
    return {
      moved: true,
      verb: 'redevelop',
      parcelId: move.parcelId,
      text: tenantExit === 'notice'
        ? `served notice in ${activeParcel(city, next, move.parcelId).districtName}`
        : `started redevelopment in ${activeParcel(city, next, move.parcelId).districtName} for $${quote.cost.toLocaleString()}`,
    };
  }

  const id = move.parcelId;
  if (ownerOf(next, id)) {
    return { moved: false, text: `was outbid on ${activeParcel(city, next, id).districtName}` };
  }
  const quote = acquireQuote(city, next, id, 'rival');
  if (!canFund(city, next, 'rival', quote.cashOut).ok) {
    return { moved: false, text: 'could not fund its bid' };
  }
  next.rival.cash -= quote.cashOut;
  // The rival pays the anchored asking like anyone else — and the purchase consumes it.
  if (next.parcelStatus[id]?.lastSale) next.parcelStatus[id].lastSale = null;
  const completed = completedBaseForStatus(city, next, id);
  const archetypeId = archetypeIdOf(city, next, id);
  next.holdings[id] = {
    owner: 'rival',
    level: next.parcelStatus[id].builtLevel,
    condition: next.parcelStatus[id].condition,
    archetypeId,
    sector: completed.sector,
    basePrice: completed.basePrice,
    baseRent: completed.baseRent,
    debt: quote.debtTaken,
    basis: quote.price,
    acquiredQuarter: next.quarter,
    mature: false,
    conditionAssessment: conditionAssessmentForAcquisition(
      city,
      next,
      id,
      next.actionOrdinal,
    ),
    ...holdingDefaultsForState(city, next, id),
  };
  return {
    moved: true,
    verb: 'acquire',
    parcelId: id,
    text: `acquired in ${activeParcel(city, next, id).districtName} for $${quote.price.toLocaleString()}`,
  };
}

/**
 * Execute the disclosed plan. Every step is re-validated, so a plan the player has
 * already spoiled (by taking the parcel first) simply fails — the rival does not get to
 * improvise a replacement it never announced.
 */
function rivalAct(city, next) {
  if (next.creditByOwner.rival.insolvent) {
    return {
      moved: false,
      moves: [{ moved: false, text: 'contest ended by insolvency' }],
      parcelId: null,
      text: 'contest ended by insolvency',
    };
  }
  const plan = next.rival.intent?.plan ?? [next.rival.intent].filter(Boolean);
  const auctionSlots = plan.some(({ verb }) => verb === 'auction') ? 1 : 0;
  const moves = [];
  const ordinary = plan.filter(({ verb }) => !['auction', 'auction-pass'].includes(verb))
    .slice(0, RULES.actionsPerQuarter - auctionSlots);
  for (const move of ordinary) {
    moves.push(executeRivalMove(city, next, move));
  }
  if (!moves.length) moves.push({ moved: false, text: 'held cash' });
  const done = moves.filter((m) => m.moved);
  return {
    moved: done.length > 0,
    moves,
    parcelId: done[0]?.parcelId ?? null,
    text: done.length ? done.map((m) => m.text).join(', then ') : moves[0].text,
  };
}

// --- Verbs -------------------------------------------------------------------

export function createSupermarketState() {
  return {
    leaseUntilQuarter: 0,
    playsLeft: 0,
    stage: 1,
    stock: { fresh: 8, household: 8, liquor: 6 },
    takings: 0,
  };
}

function ensureSupermarket(state) {
  if (!state.supermarket) state.supermarket = createSupermarketState();
  return state.supermarket;
}

function reject(state, reason) {
  return { state, events: [{ kind: 'reject', reason }], rejected: true };
}

function commitAction(state, entry, {
  costsAction = true,
  obligation = null,
} = {}) {
  const next = state;
  if (costsAction) next.actionsRemaining -= 1;
  next.actionOrdinal += 1;
  next.log.push({
    q: state.quarter,
    ...entry,
    actionOrdinal: next.actionOrdinal,
  });
  next.obligations ??= [];
  next.obligations.push(obligation ?? {
    kind: entry.type,
    timing: 'paid',
    cashOut: 0,
    debtTaken: 0,
  });
  return next;
}

function recordWorldInput(action) {
  return Object.fromEntries(['worldSnapshot', 'worldCityExports', 'worldCityIdentity']
    .filter((key) => Object.hasOwn(action, key)).map((key) => [key, action[key]]));
}

function actionWorldStore(action) {
  return { get(key) {
    if (key === WORLD_RUN_KEY) return action.worldSnapshot ?? null;
    if (key === CITY_EXPORTS_KEY) return action.worldCityExports ?? null;
    if (key === CITY_RUN_IDENTITY_KEY) return action.worldCityIdentity ?? null;
    return null;
  } };
}

function doDemolishStrike(city, state, action) {
  const pendingRoomReason = pendingRoomReplacementReason(state, action.parcelId);
  if (pendingRoomReason) return reject(state, pendingRoomReason);
  const next = clone(state);
  const applied = applyDemolishStrike(city, next, action);
  if (applied.rejected) return reject(state, applied.events[0].reason);
  const event = applied.events[0];
  if (next.holdings[action.parcelId].siteCleared) resetRoomGeneration(next, action.parcelId, false);
  commitAction(next, {
    type: 'demolish-strike',
    parcelId: action.parcelId,
    strike: event.strikes,
    cost: event.cost,
  }, {
    costsAction: false,
    obligation: {
      kind: 'demolish-strike',
      timing: 'paid',
      parcelId: action.parcelId,
      cashOut: event.cost,
      debtTaken: 0,
    },
  });
  return applied;
}

function doPlaceBuilding(city, state, action) {
  const pendingRoomReason = pendingRoomReplacementReason(state, action.parcelId);
  if (pendingRoomReason) return reject(state, pendingRoomReason);
  if (action.catalogId === 'farm' || activeParcel(city, state, action.parcelId)?.surveyedFarm) return doFarmAction(city, state, action, 'build');
  const next = clone(state);
  const applied = applyPlaceBuilding(city, next, { ...action, store: action.store ?? actionWorldStore(action) });
  if (applied.rejected) return reject(state, applied.events[0].reason);
  const event = applied.events[0];
  const holding = next.holdings[action.parcelId];
  const job = pendingConstruction(
    next,
    action.parcelId,
    event.quote,
  );
  const slot = event.slot ?? event.quote?.slot ?? null;
  if (slot) {
    const current = holding.padSlots?.[slot] ?? {};
    holding.padSlots = {
      ...padSlotRecord(holding),
      [slot]: { ...current, status: 'works', works: job },
    };
    holding.construction = primaryLiveWorksJob(holding) ?? job;
  } else {
    holding.construction = job;
  }
  commitAction(next, {
    type: 'place-building',
    ...recordWorldInput(action),
    parcelId: action.parcelId,
    catalogId: action.catalogId,
    slot: event.slot ?? event.quote?.slot ?? null,
    cost: event.cost,
  }, {
    obligation: {
      kind: 'place-building',
      timing: 'paid',
      parcelId: action.parcelId,
      worksCost: event.cost,
      cashOut: event.quote.cashOut,
      debtTaken: event.quote.debtTaken,
    },
  });
  return applied;
}

function canSpendAction(state) {
  if (state.phase !== 'play') return 'The run is over.';
  if (state.actionsRemaining <= 0) return 'No actions left this quarter.';
  return null;
}

function canPlayWithoutAction(state) {
  if (state.phase !== 'play') return 'The run is over.';
  return null;
}

function isFreeBrokerFollowUp(state, action) {
  if (!action?.brokerChoice) return false;
  if (!action.avatarId || !state.avatars[action.avatarId]) return false;
  if (action.destination?.kind === 'person') {
    const person = state.people.byId[action.destination.id];
    return Boolean(person && avatarMetPerson(state, action.avatarId, person));
  }
  const contacts = Object.values(state.people?.byId ?? {})
    .filter((person) => person.archetypeId === 'mortgage-broker');
  return contacts.some((person) => avatarMetPerson(state, action.avatarId, person));
}

function effectiveAvatarDestination(state, destination) {
  return destination.kind === 'person'
    ? state.people.byId[destination.id]?.toAnchor ?? destination
    : destination;
}

function persistMeetResults(source, next, avatarId, events) {
  const avatar = next.avatars?.[avatarId];
  if (!avatar) return;
  avatar.meetResults ??= {};
  for (const event of events ?? []) {
    if (!event?.personId) continue;
    const person = source.people?.byId?.[event.personId]
      ?? next.people?.byId?.[event.personId]
      ?? null;
    avatar.meetResults[event.personId] = {
      personId: event.personId,
      archetypeId: person?.archetypeId ?? event.archetypeId ?? null,
      metQuarter: next.quarter,
      event: clone(event),
      outcome: person?.pendingOutcome ? clone(person.pendingOutcome) : null,
      anchor: person?.toAnchor ? clone(person.toAnchor) : null,
    };
  }
}

function removePerson(next, personId) {
  if (!next.people.byId[personId]) return;
  const order = next.people.order.filter((id) => id !== personId);
  next.people = freezePeople({
    order,
    byId: Object.fromEntries(order.map((id) => [id, next.people.byId[id]])),
  });
}

function markPersonContracted(next, personId, parcelId) {
  const person = next.people.byId[personId];
  if (!person) return;
  const prior = person.pendingOutcome?.kind === 'hire' ? person.pendingOutcome : null;
  const parcelIds = [...new Set([...(prior?.parcelIds ?? []), parcelId].filter(Boolean))];
  const pin = { kind: 'parcel', id: parcelId };
  const byId = {
    ...next.people.byId,
    [personId]: {
      ...person,
      fromAnchor: pin,
      toAnchor: pin,
      interactionTarget: pin,
      pendingOutcome: {
        kind: 'hire',
        status: 'contracted',
        parcelId,
        parcelIds,
        projectsEngaged: (prior?.projectsEngaged ?? 0) + 1,
      },
    },
  };
  next.people = freezePeople({ order: next.people.order, byId });
}

function doWalk(city, state, action) {
  const freeFollowUp = isFreeBrokerFollowUp(state, action);
  if (action?.brokerChoice && !freeFollowUp) {
    return reject(state, 'Walk to meet first.');
  }
  const unavailable = freeFollowUp ? canPlayWithoutAction(state) : canSpendAction(state);
  if (unavailable) return reject(state, unavailable);
  if (!action.avatarId || !state.avatars[action.avatarId]) {
    return reject(state, 'Unknown avatar.');
  }
  if (!walkDestinationExists(city, state, action.destination)) {
    return reject(state, 'The walk destination does not exist.');
  }
  if (
    action.brokerChoice !== null
    && action.brokerChoice !== undefined
    && !['lvr', 'interest'].includes(action.brokerChoice)
  ) return reject(state, 'Unknown broker choice.');
  const legacyPurchase = validateLegacyPurchase(action);
  if (!legacyPurchase.ok) return reject(state, legacyPurchase.reason);
  const spend = avatarSpendCandidate(
    city,
    state,
    action.avatarId,
    action.destination,
    state.actionOrdinal + 1,
  );
  const sourceAvatar = state.avatars[action.avatarId];
  const capBlocked = spend
    ? sourceAvatar.spendingTotal + spend.amount >= applyBp(sourceAvatar.startingNav, 50)
    : false;
  const spendFunds = spend ? canFund(city, state, 'player', spend.amount) : { ok: true };
  const spendApplied = Boolean(spend && !capBlocked && spendFunds.ok);

  const next = clone(state);
  const avatar = next.avatars[action.avatarId];
  avatar.fromAnchor = { ...avatar.destination };
  avatar.destination = { ...action.destination };
  avatar.movedQuarter = state.quarter;
  let spendEvent = null;
  if (spendApplied) {
    next.cash -= spend.amount;
    const { untilQuarter } = applyAvatarSpend(avatar, state.quarter, spend);
    spendEvent = {
      kind: 'avatar-spend',
      avatarId: action.avatarId,
      venueClass: spend.venueClass,
      anchor: { ...spend.anchor },
      amount: spend.amount,
      token: spend.token,
      untilQuarter,
    };
  } else if (spend) {
    spendEvent = {
      kind: 'avatar-spend-skipped',
      avatarId: action.avatarId,
      venueClass: spend.venueClass,
      anchor: { ...spend.anchor },
      amount: spend.amount,
      reason: capBlocked ? 'spending-cap' : 'overdraft-floor',
    };
  }

  let contactEvents;
  try {
    contactEvents = resolveAvatarContacts(
      city,
      next,
      action.avatarId,
      action.destination,
      action.brokerChoice ?? null,
    );
  } catch (error) {
    return reject(state, error.message);
  }
  // Always surface a person-walk result even if the cast had no operation payload.
  if (
    action.destination?.kind === 'person'
    && (!contactEvents || contactEvents.length === 0)
  ) {
    const person = next.people.byId[action.destination.id];
    contactEvents = [{
      kind: 'contact',
      personId: action.destination.id,
      archetypeId: person?.archetypeId ?? 'person',
    }];
  }
  persistMeetResults(state, next, action.avatarId, contactEvents);
  commitAction(next, {
    type: 'walk',
    avatarId: action.avatarId,
    destination: { ...action.destination },
    brokerChoice: action.brokerChoice ?? null,
  }, {
    costsAction: !freeFollowUp,
    obligation: {
      kind: spendApplied ? 'avatar-spend' : 'walk',
      timing: 'paid',
      cashOut: spendApplied ? spend.amount : 0,
      debtTaken: 0,
    },
  });
  return {
    state: next,
    events: [
      {
        kind: 'walk',
        avatarId: action.avatarId,
        destination: effectiveAvatarDestination(next, action.destination),
        amount: 0,
      },
      ...(spendEvent ? [spendEvent] : []),
      ...contactEvents,
    ],
  };
}

function surveyFloodExposure(city, state, parcelId) {
  const exposure = activeEventExposure(city, state, parcelId);
  if (exposure) {
    return exposure.floodExposureBp;
  }
  const parcel = activeParcel(city, state, parcelId);
  const distances = parcel.tiles.map((tileId) => {
    const match = /^p(\d)(\d)(\d)(\d)$/.exec(tileId);
    const gx = Number(match[1]) * 3 + Number(match[3]);
    const gz = Number(match[2]) * 3 + Number(match[4]);
    if (city.waterEdge === 'west') return gx + 1;
    if (city.waterEdge === 'east') return city.blocksX * 3 - gx;
    if (city.waterEdge === 'north') return gz + 1;
    return city.blocksZ * 3 - gz;
  });
  const distance = Math.min(...distances);
  return distance === 1 ? 3200 : distance === 2 ? 2000 : distance === 3 ? 900 : 100;
}

function doSurvey(city, state, action) {
  const unavailable = canSpendAction(state);
  if (unavailable) return reject(state, unavailable);
  if (!activeParcel(city, state, action.parcelId)) {
    return reject(state, 'Survey requires a tradeable parcel.');
  }
  const existing = state.intel.parcels[action.parcelId];
  if (
    existing?.conditionRevealed
    && existing.floodExposureBp !== null
    && existing.fireExposureBp !== null
    && state.parcelStatus[action.parcelId].surveyedConditionVersion
      === state.parcelStatus[action.parcelId].conditionVersion
  ) return reject(state, 'This parcel is already fully surveyed.');
  const surveyFunds = canFund(city, state, 'player', RULES.surveyCost);
  if (!surveyFunds.ok) {
    return reject(state, `Short $${surveyFunds.shortfall} against the overdraft floor.`);
  }
  const next = clone(state);
  next.cash -= RULES.surveyCost;
  const prior = next.intel.parcels[action.parcelId];
  const revealedCondition = conditionOf(city, state, action.parcelId);
  next.intel.parcels[action.parcelId] = {
    conditionRevealed: true,
    condition: revealedCondition,
    defectTier: surveyDefectTierForCondition(revealedCondition),
    nextAsking: prior?.nextAsking ?? null,
    floodExposureBp: surveyFloodExposure(city, state, action.parcelId),
    fireExposureBp: fireExposureBp(city, state, action.parcelId),
    revealedQuarter: state.quarter,
    source: 'survey',
    avatarId: action.avatarId ?? 'player',
  };
  next.parcelStatus[action.parcelId].surveyedConditionVersion =
    next.parcelStatus[action.parcelId].conditionVersion;
  commitAction(next, { type: 'survey', parcelId: action.parcelId }, {
    obligation: {
      kind: 'survey',
      timing: 'paid',
      cashOut: RULES.surveyCost,
      debtTaken: 0,
    },
  });
  return {
    state: next,
    events: [{
      kind: 'survey',
      parcelId: action.parcelId,
      amount: RULES.surveyCost,
      intel: next.intel.parcels[action.parcelId],
    }],
  };
}

export function avatarMetPerson(state, avatarId, person) {
  const avatar = state.avatars[avatarId];
  if (!avatar || !person) return false;
  if (avatar.meetResults?.[person.id]) return true;
  if (avatar.movedQuarter !== state.quarter) return false;
  return (
    avatar.destination.kind === 'person' && avatar.destination.id === person.id
  ) || (
    effectiveAvatarDestination(state, avatar.destination).kind === person.toAnchor.kind
    && effectiveAvatarDestination(state, avatar.destination).id === person.toAnchor.id
  );
}

function activeHiresOnHolding(holding, quarter) {
  const out = {};
  if (holding?.hires && typeof holding.hires === 'object') {
    for (const [profession, contract] of Object.entries(holding.hires)) {
      if (contract && (contract.expiresAfterQuarter ?? 0) >= quarter) out[profession] = contract;
    }
  }
  if (holding?.hire?.profession && (holding.hire.expiresAfterQuarter ?? 0) >= quarter) {
    out[holding.hire.profession] = holding.hire;
  }
  return out;
}

function writeHires(holding, hires) {
  holding.hires = { ...hires };
  // Legacy single field: prefer architect (planning), else builder.
  holding.hire = hires.architect ?? hires['cheap-builder'] ?? null;
  if (!holding.hire) delete holding.hire;
}

function consumeWorksHires(holding, quarter) {
  const active = activeHiresOnHolding(holding, quarter);
  writeHires(holding, active['property-agent']
    ? { 'property-agent': active['property-agent'] }
    : {});
}

function doHire(city, state, action) {
  const unavailable = canPlayWithoutAction(state);
  if (unavailable) return reject(state, unavailable);
  if (!['cheap-builder', 'architect', 'property-agent'].includes(action.profession)) {
    return reject(state, 'Unknown profession.');
  }
  const person = state.people.byId[action.personId];
  if (!person || person.archetypeId !== action.profession) {
    return reject(state, 'That professional is not available.');
  }
  if (!avatarMetPerson(state, action.avatarId, person)) {
    return reject(state, 'The professional has not been met at this destination.');
  }
  if (professionalProjectsUsed(person) >= PROFESSIONAL_PROJECT_CAP) {
    return reject(state, 'That professional is already engaged on three projects.');
  }
  const holding = state.holdings[action.parcelId];
  if (!holding || holding.owner !== 'player') return reject(state, 'You do not hold this parcel.');
  const existing = activeHiresOnHolding(holding, state.quarter);
  if (existing[action.profession]) {
    return reject(state, 'That profession is already hired on this holding.');
  }
  // Builder, Design, and Sales briefs may overlap; only block a duplicate profession.
  if (action.profession !== 'property-agent' && (holding.renovation || holding.construction)) {
    return reject(state, 'Pending works cannot receive a new professional brief.');
  }
  if (action.profession === 'cheap-builder' && action.brief !== 'cost') {
    return reject(state, 'A cheap builder accepts only the cost brief.');
  }
  if (action.profession === 'architect' && !['quality', 'succession'].includes(action.brief)) {
    return reject(state, 'Unknown architect brief.');
  }
  if (action.profession === 'property-agent' && action.brief !== 'sales') {
    return reject(state, 'A sales consultant accepts only the sales brief.');
  }

  const contract = {
    profession: action.profession,
    personId: action.personId,
    brief: action.brief,
    expiresAfterQuarter: state.quarter + 2,
    ...(action.profession === 'property-agent' ? {
      feeBp: RULES.agentFeeBp,
      saleUpliftMinBp: RULES.agentSaleUpliftMinBp,
      saleUpliftMaxBp: RULES.agentSaleUpliftMaxBp,
    } : {}),
  };
  const probe = clone(state);
  // Hiring costs no action; works-legality probes still require one on renovate/redevelop.
  if (probe.actionsRemaining <= 0) probe.actionsRemaining = 1;
  const probeHires = {
    ...activeHiresOnHolding(probe.holdings[action.parcelId], state.quarter),
    [action.profession]: contract,
  };
  writeHires(probe.holdings[action.parcelId], probeHires);
  if (action.brief === 'quality' && !canRenovate(city, probe, action.parcelId).ok) {
    return reject(state, 'The quality brief requires a legal renovation.');
  }
  if (action.brief === 'succession') {
    const quote = redevelopQuote(city, probe, action.parcelId);
    if (!quote || quote.successionSteps !== 2) {
      return reject(state, 'The succession brief requires two legal rungs.');
    }
  }
  if (
    action.profession === 'cheap-builder'
    && !canRenovate(city, probe, action.parcelId).ok
    && !canRedevelop(
      city,
      probe,
      action.parcelId,
      probe.parcelStatus[action.parcelId].occupancy === 'tenant' ? 'notice' : null,
    ).ok
  ) return reject(state, 'The cost brief requires legal works.');

  const listFee = action.profession === 'cheap-builder'
    ? RULES.cheapBuilderFee
    : action.profession === 'architect'
      ? RULES.architectFee
      : 0;
  const fee = applyBp(listFee, favourCostScaleBp(state.favour ?? 0));
  const hireFunds = canFund(city, state, 'player', fee);
  if (!hireFunds.ok) {
    return reject(state, `Short $${hireFunds.shortfall} against the overdraft floor.`);
  }
  const next = clone(state);
  next.cash -= fee;
  const nextHires = {
    ...activeHiresOnHolding(next.holdings[action.parcelId], state.quarter),
    [action.profession]: contract,
  };
  writeHires(next.holdings[action.parcelId], nextHires);
  markPersonContracted(next, action.personId, action.parcelId);
  commitAction(next, {
    type: 'hire',
    avatarId: action.avatarId,
    parcelId: action.parcelId,
    personId: action.personId,
    profession: action.profession,
    brief: action.brief,
  }, {
    costsAction: false,
    obligation: {
      kind: 'hire',
      timing: 'paid',
      cashOut: fee,
      debtTaken: 0,
      parcelId: action.parcelId,
    },
  });
  return {
    state: next,
    events: [{
      kind: 'hire',
      parcelId: action.parcelId,
      personId: action.personId,
      profession: action.profession,
      brief: action.brief,
      amount: fee,
    }],
  };
}

function parcelSendableForCrew(state, person, parcelId) {
  const status = state.parcelStatus[parcelId];
  const holding = state.holdings[parcelId];
  if (!status || !holding) return false;
  if (person.archetypeId === 'arsonist') {
    return status.occupancy === 'vacant'
      || Boolean(holding.construction)
      || (holding.condition ?? status.condition) === 0;
  }
  if (person.archetypeId === 'squatter') {
    return status.occupancy !== 'squatted'
      && (status.occupancy === 'vacant' || Boolean(holding.construction));
  }
  return false;
}

function sendCrewOutcomeLegal(person) {
  const pending = person.pendingOutcome;
  if (!pending) return true;
  if (pending.status !== 'pending') return false;
  if (person.archetypeId === 'arsonist') return pending.kind === 'fire';
  if (person.archetypeId === 'squatter') return pending.kind === 'occupation';
  return false;
}

/** Rival lots an arsonist / squatter can be sent onto. Intent list first, then holdings. */
export function sendCrewTargets(city, state, person) {
  if (!person || !['arsonist', 'squatter'].includes(person.archetypeId)) return [];
  const seen = new Set();
  const out = [];
  const consider = (id) => {
    if (!id || seen.has(id)) return;
    if (!activeParcel(city, state, id)) return;
    if (ownerOf(state, id) !== 'rival') return;
    if (!parcelSendableForCrew(state, person, id)) return;
    seen.add(id);
    out.push(id);
  };
  for (const id of state.rival?.intent?.parcelIds ?? []) consider(id);
  for (const id of Object.keys(state.holdings ?? {}).sort()) {
    if (state.holdings[id]?.owner === 'rival') consider(id);
  }
  return out.slice(0, 3);
}

function retargetOrSchedulePeopleFire(next, fromParcelId, toParcelId) {
  const events = {
    order: [...(next.events?.order ?? [])],
    byId: { ...(next.events?.byId ?? {}) },
  };
  let retargeted = false;
  for (const id of [...events.order].sort()) {
    const event = events.byId[id];
    if (event.type !== 'fire') continue;
    if (event.status === 'resolved' || event.status === 'cancelled') continue;
    if (!event.factors?.derivedFromPeople) continue;
    const current = event.payload?.parcelId ?? event.anchorIds?.[0];
    if (fromParcelId && current !== fromParcelId) continue;
    events.byId[id] = {
      ...event,
      anchorIds: [toParcelId],
      payload: { ...(event.payload ?? {}), parcelId: toParcelId },
    };
    retargeted = true;
    break;
  }
  if (!retargeted) {
    let ordinal = 0;
    while (events.byId[`fire-q${next.quarter}-${ordinal}`]) ordinal += 1;
    const event = {
      id: `fire-q${next.quarter}-${ordinal}`,
      type: 'fire',
      generatedQuarter: next.quarter === 1 ? 1 : next.quarter - 1,
      forecastQuarter: next.quarter === 1 ? 1 : next.quarter - 1,
      resolveQuarter: next.quarter,
      status: 'active',
      anchorIds: [toParcelId],
      factors: { derivedFromPeople: true },
      forecast: {
        headline: 'Fire risk on this place',
        detail: 'Insure it before settle, or you can lose value and time.',
        severity: 5,
        decal: true,
      },
      payload: { parcelId: toParcelId },
      playerCommitment: null,
      rivalCommitment: null,
      outcome: null,
    };
    events.order.push(event.id);
    events.byId[event.id] = event;
  }
  next.events = freezeEvents(events);
}

function doSendCrew(city, state, action) {
  const unavailable = canSpendAction(state);
  if (unavailable) return reject(state, unavailable);
  if (!action.avatarId || !state.avatars[action.avatarId]) {
    return reject(state, 'Unknown avatar.');
  }
  const person = state.people?.byId?.[action.personId];
  if (!person || !['arsonist', 'squatter'].includes(person.archetypeId)) {
    return reject(state, 'That person cannot be sent.');
  }
  if (!avatarMetPerson(state, action.avatarId, person)) {
    return reject(state, 'Meet them this quarter first.');
  }
  if (!sendCrewOutcomeLegal(person)) {
    return reject(state, 'That person is not free to send.');
  }
  if (!activeParcel(city, state, action.parcelId)) {
    return reject(state, 'Unknown parcel.');
  }
  if (ownerOf(state, action.parcelId) !== 'rival') {
    return reject(state, 'Send only onto a rival lot.');
  }
  if (!parcelSendableForCrew(state, person, action.parcelId)) {
    return reject(state, 'That lot is not sendable.');
  }

  const next = clone(state);
  const pin = { kind: 'parcel', id: action.parcelId };
  const kind = person.archetypeId === 'arsonist' ? 'fire' : 'occupation';
  const priorParcelId = person.pendingOutcome?.parcelId ?? null;
  const byId = {
    ...next.people.byId,
    [action.personId]: {
      ...person,
      fromAnchor: pin,
      toAnchor: pin,
      interactionTarget: pin,
      pendingOutcome: {
        kind,
        parcelId: action.parcelId,
        status: 'pending',
      },
    },
  };
  next.people = freezePeople({ order: next.people.order, byId });
  if (kind === 'fire') retargetOrSchedulePeopleFire(next, priorParcelId, action.parcelId);
  commitAction(next, {
    type: 'send-crew',
    avatarId: action.avatarId,
    personId: action.personId,
    parcelId: action.parcelId,
  });
  return {
    state: next,
    events: [{
      kind: 'send-crew',
      personId: action.personId,
      parcelId: action.parcelId,
      crew: person.archetypeId,
    }],
  };
}

function doLobby(city, state, action) {
  const unavailable = canSpendAction(state);
  if (unavailable) return reject(state, unavailable);
  if (!action.avatarId || !state.avatars[action.avatarId]) return reject(state, 'Unknown avatar.');
  const holding = state.holdings[action.parcelId];
  if (!holding || holding.owner !== 'player') return reject(state, 'You do not hold this parcel.');
  const parcel = activeParcel(city, state, action.parcelId);
  if (!parcel) return reject(state, 'Unknown parcel.');
  if (listedTickerOf(holding)) {
    return reject(state, action.usePermitId ? LISTED_USE_REASON : LISTED_FABRIC_REASON);
  }

  // ── V3.70 L6: change-of-use applications ───────────────────────────────────────────────
  //
  // A use permit and a height permit are the same ACTION and two different ladders, so this
  // branch returns before the height logic rather than threading a flag through it. The reason
  // it cannot share that logic: the height path finds its option BY LEVEL and then writes
  // `planningCeiling = seekLevel`, and a change of use raises no ceiling — routing one through
  // there would hand the player storeys they did not apply for. `permitOptionsFor` remains the
  // height-only list (including every higher legal target); `usePermitOptionsFor` is parallel.
  //
  // Everything the two branches DO share — the action cost, the works-pending block, the
  // overdraft floor, the architect bonus, the favour bonus and the decision stream — is mirrored
  // here deliberately, so a refusal costs the fee on both ladders and neither is the cheap one.
  if (action.usePermitId) {
    const option = usePermitOptionsFor(parcel, holding, holding.archetypeId)
      .find((o) => o.id === action.usePermitId);
    if (!option) return reject(state, 'That use is not permissible on this site.');
    // Room upgrades do not block planning; whole-building works still do.
    if (holding.renovation || holding.construction) {
      return reject(state, 'Planning cannot change while works are pending.');
    }
    const useFunds = canFund(city, state, 'player', option.cost);
    if (!useFunds.ok) {
      return reject(state, `Short $${useFunds.shortfall} against the overdraft floor.`);
    }
    const useArchitect = Boolean(activeHiresOnHolding(holding, state.quarter).architect);
    // `chanceAdjustBp` is authored on the permit record rather than invented here, so how hard a
    // change of use is to win is content, not a number buried in the reducer.
    const useChanceBp = Math.max(1500, (useArchitect ? 7500 : 5500)
      + favourLobbyBonusBp(state.favour ?? 0) + option.chanceAdjustBp);
    const useRoll = lobbyDecisionStream(
      state.seed,
      state.quarter,
      action.parcelId,
      state.actionOrdinal,
    ).int(0, 9999);
    const useNext = clone(state);
    useNext.cash -= option.cost;
    const useSuccess = useRoll < useChanceBp;
    if (useSuccess) {
      // The grant is a record, not a build. `redevelopFinishArchetype` re-checks the site and
      // the shell at works time, so a permit that outlives its warehouse cannot cash in.
      useNext.holdings[action.parcelId].approvedUsePermit = grantUsePermit(option.id);
      activateUsePermit(useNext, action.parcelId, option.id, {
        seed: useNext.seed,
        quarter: useNext.quarter,
      });
    }
    commitAction(useNext, {
      type: 'lobby',
      avatarId: action.avatarId,
      parcelId: action.parcelId,
      usePermitId: option.id,
      success: useSuccess,
      chanceBp: useChanceBp,
      roll: useRoll,
    }, {
      obligation: {
        kind: 'lobby',
        timing: 'paid',
        cashOut: option.cost,
        debtTaken: 0,
        parcelId: action.parcelId,
      },
    });
    return {
      state: useNext,
      events: [{
        kind: 'lobby',
        parcelId: action.parcelId,
        amount: option.cost,
        chanceBp: useChanceBp,
        roll: useRoll,
        success: useSuccess,
        usePermitId: option.id,
        useLabel: option.label,
        planningCeiling: useNext.holdings[action.parcelId].planningCeiling
          ?? defaultPlanningCeilingFor(holding.archetypeId),
      }],
    };
  }

  const maxPermit = maxPermitLevelFor(parcel, holding);
  const currentCeiling = holding.planningCeiling
    ?? defaultPlanningCeilingFor(holding.archetypeId);
  const hasRequestedLevel = action.permitLevel !== undefined && action.permitLevel !== null;
  const requestedLevel = hasRequestedLevel ? Number(action.permitLevel) : currentCeiling + 1;
  if (!Number.isInteger(requestedLevel) || !PERMIT_LABELS[requestedLevel]) {
    return reject(state, 'Choose a defined planning rung: L1, L2 or L3.');
  }
  const seekLevel = requestedLevel;
  if (currentCeiling >= maxPermit) {
    return reject(state, 'Already at the highest permit this site allows.');
  }
  if (seekLevel <= currentCeiling) {
    return reject(state, 'Choose a higher planning permit level for this site.');
  }
  if (seekLevel > maxPermit) {
    return reject(state, 'That planning rung is above this site ceiling.');
  }
  // Room upgrades do not block planning; whole-building works still do.
  if (holding.renovation || holding.construction) {
    return reject(state, 'Planning cannot change while works are pending.');
  }
  const options = permitOptionsFor(parcel, holding);
  const option = options.find((o) => o.level === seekLevel);
  if (!option) return reject(state, 'That planning rung is not lobbyable on this holding.');
  const fee = option.cost;
  const lobbyFunds = canFund(city, state, 'player', fee);
  if (!lobbyFunds.ok) {
    return reject(state, `Short $${lobbyFunds.shortfall} against the overdraft floor.`);
  }
  const architect = Boolean(activeHiresOnHolding(holding, state.quarter).architect);
  const historic = eraBand(ARCHETYPES[holding.archetypeId]) === 'historic';
  const favourBonus = favourLobbyBonusBp(state.favour ?? 0);
  // Higher rungs are slightly harder without a design consultant.
  const rungHardness = (seekLevel - 1) * 800;
  const chanceBp = architect
    ? Math.min(9500, 7500 + favourBonus - Math.floor(rungHardness * 0.35))
    : Math.max(2000, Math.min(7500,
      5500 - (historic ? 1500 : 0) + favourBonus - rungHardness));
  const roll = lobbyDecisionStream(
    state.seed,
    state.quarter,
    action.parcelId,
    state.actionOrdinal,
  ).int(0, 9999);
  const next = clone(state);
  next.cash -= fee;
  const success = fee === 0 ? true : roll < chanceBp;
  if (success) {
    next.holdings[action.parcelId].planningCeiling = seekLevel;
    next.holdings[action.parcelId].approvedPermit = {
      level: seekLevel,
      label: PERMIT_LABELS[seekLevel],
      archetypeId: PERMIT_FINISH_ARCHETYPE[seekLevel],
    };
  }
  commitAction(next, {
    type: 'lobby',
    avatarId: action.avatarId,
    parcelId: action.parcelId,
    permitLevel: seekLevel,
    success,
    chanceBp,
    roll,
  }, {
    obligation: {
      kind: 'lobby',
      timing: 'paid',
      cashOut: fee,
      debtTaken: 0,
      parcelId: action.parcelId,
    },
  });
  return {
    state: next,
    events: [{
      kind: 'lobby',
      parcelId: action.parcelId,
      amount: fee,
      chanceBp,
      roll,
      success,
      permitLevel: seekLevel,
      planningCeiling: next.holdings[action.parcelId].planningCeiling,
    }],
  };
}

/**
 * Gift furniture / terrain to the central public reserve.
 * Cash only · never costs an action · raises civic favour for planning + works discounts.
 */
function doReserveImprove(city, state, action) {
  if (state.phase !== 'play') return reject(state, 'The run is over.');
  if (!city.reserve) return reject(state, 'This city has no public reserve.');
  const item = RESERVE_CATALOG_BY_ID[action.catalogId];
  if (!item) return reject(state, 'Unknown reserve gift.');
  const funds = canFund(city, state, 'player', item.cost);
  if (!funds.ok) {
    return reject(state, `Short $${funds.shortfall} against the overdraft floor.`);
  }
  const next = clone(state);
  next.cash -= item.cost;
  next.favour = Math.min(RULES.favourMax, (next.favour ?? 0) + item.favour);
  next.reserveKit = {
    furniture: { ...(next.reserveKit?.furniture ?? {}) },
    terrain: { ...(next.reserveKit?.terrain ?? {}) },
  };
  const bag = item.kind === 'furniture' ? next.reserveKit.furniture : next.reserveKit.terrain;
  bag[item.id] = (bag[item.id] ?? 0) + 1;
  commitAction(next, {
    type: 'reserve-improve',
    catalogId: item.id,
    kind: item.kind,
    favourAfter: next.favour,
    amount: item.cost,
  }, {
    costsAction: false,
    obligation: {
      kind: 'reserve-improve',
      timing: 'paid',
      cashOut: item.cost,
      debtTaken: 0,
    },
  });
  return {
    state: next,
    events: [{
      kind: 'reserve-improve',
      catalogId: item.id,
      label: item.label,
      itemKind: item.kind,
      amount: item.cost,
      favourGain: item.favour,
      favour: next.favour,
      favourMax: RULES.favourMax,
    }],
  };
}

function doBid(city, state, action) {
  if (state.auctionSeatVersion === 2 && (!['P1', 'P2'].includes(state.activeSeatId)
    || action.avatarId !== state.activeSeatId)) return reject(state, 'A seat auction bid must name its authenticated seat.');
  const unavailable = canSpendAction(state);
  if (unavailable) return reject(state, unavailable);
  const event = state.events.byId[action.eventId];
  if (
    !event
    || event.type !== 'auction'
    || event.resolveQuarter !== state.quarter
    || event.status === 'resolved'
    || event.status === 'cancelled'
  ) return reject(state, 'That auction is not active this quarter.');
  if (event.playerCommitment && action.maxBid <= event.playerCommitment.maxBid) {
    return reject(state, `A bid of $${event.playerCommitment.maxBid.toLocaleString()} is already in. Raise the maximum to go higher.`);
  }
  const avatar = state.avatars[action.avatarId];
  if (!avatar) return reject(state, 'Unknown avatar.');
  const parcelId = event.anchorIds[0];
  const destination = effectiveAvatarDestination(state, avatar.destination);
  if (
    destination.kind !== 'parcel'
    || destination.id !== parcelId
  ) return reject(state, 'The avatar must be at the auction parcel.');
  const { increment } = auctionTerms(
    event.payload.scheduledAsking,
    event.payload.crowdSize,
  );
  if (
    !Number.isInteger(action.maxBid)
    || action.maxBid < 0
    || action.maxBid % increment !== 0
  ) return reject(state, `Maximum bid must be a non-negative multiple of $${increment}.`);
  const lvrBp = state.auctionSeatVersion === 2
    ? activeLvrBp({ quarter: state.quarter, avatars: { player: state.avatars[state.activeSeatId] } })
    : activeLvrBp(state);
  const debtAtCap = applyBp(action.maxBid, lvrBp);
  const dutyAtCap = applyBp(action.maxBid, RULES.dutyBp);
  const cashAtCap = action.maxBid - debtAtCap + dutyAtCap;
  const bidFunds = canFund(city, state, 'player', cashAtCap, { reserveAuction: false });
  if (!bidFunds.ok) {
    return reject(state, `Short $${bidFunds.shortfall} at the bid cap.`);
  }
  const next = clone(state);
  const byId = {
    ...next.events.byId,
    [event.id]: {
      ...event,
      playerCommitment: {
        ...(state.auctionSeatVersion === 2 ? { seatId: state.activeSeatId } : {}),
        avatarId: action.avatarId,
        maxBid: action.maxBid,
        committedQuarter: state.quarter,
        lvrBp,
        cashAtCap,
      },
    },
  };
  next.events = freezeEvents({ order: next.events.order, byId });
  commitAction(next, {
    type: 'bid',
    avatarId: action.avatarId,
    eventId: action.eventId,
    maxBid: action.maxBid,
  }, {
    obligation: {
      kind: 'auction',
      timing: 'due',
      eventId: action.eventId,
      cashOut: null,
      debtTaken: null,
    },
  });
  return {
    state: next,
    events: [{
      kind: 'bid',
      eventId: event.id,
      parcelId,
      maxBid: action.maxBid,
      increment,
    }],
  };
}

function doInsure(city, state, action) {
  const unavailable = canSpendAction(state);
  if (unavailable) return reject(state, unavailable);
  if (!['fire', 'flood', 'both'].includes(action.cover)) {
    return reject(state, 'Unknown insurance cover.');
  }
  const holding = state.holdings[action.parcelId];
  if (!holding || holding.owner !== 'player') return reject(state, 'You do not hold this parcel.');
  const requested = {
    fire: action.cover === 'fire' || action.cover === 'both',
    flood: action.cover === 'flood' || action.cover === 'both',
  };
  const existing = holding.insurance
    && holding.insurance.expiresAfterQuarter >= state.quarter
    ? holding.insurance
    : { fire: false, flood: false };
  if (
    (!requested.fire || existing.fire)
    && (!requested.flood || existing.flood)
  ) return reject(state, 'The selected cover is already active.');
  const premium = insurancePremium(marketValue(city, state, action.parcelId), action.cover);
  const insuranceFunds = canFund(city, state, 'player', premium);
  if (!insuranceFunds.ok) {
    return reject(state, `Short $${insuranceFunds.shortfall} against the overdraft floor.`);
  }
  const next = clone(state);
  next.cash -= premium;
  next.holdings[action.parcelId].insurance = {
    fire: existing.fire || requested.fire,
    flood: existing.flood || requested.flood,
    expiresAfterQuarter: state.quarter + 3,
  };
  commitAction(next, {
    type: 'insure',
    parcelId: action.parcelId,
    cover: action.cover,
  }, {
    obligation: {
      kind: 'insurance',
      timing: 'paid',
      parcelId: action.parcelId,
      cover: action.cover,
      cashOut: premium,
      debtTaken: 0,
    },
  });
  return {
    state: next,
    events: [{
      kind: 'insure',
      parcelId: action.parcelId,
      cover: action.cover,
      amount: premium,
    }],
  };
}

// Both owners pay and establish precisely the quoted lease. Player action logging
// and rival disclosed-slot accounting remain at their existing boundaries.
function applyLease(state, id, quote, owner) {
  if (owner === 'player') state.cash -= quote.cashOut;
  else state.rival.cash -= quote.cashOut;
  state.parcelStatus[id].occupancy = 'tenant';
  state.parcelStatus[id].tenant = { ...quote.tenant };
  state.parcelStatus[id].squatterSinceQuarter = null;
}

function doLease(city, state, action) {
  const unavailable = canSpendAction(state);
  if (unavailable) return reject(state, unavailable);
  const quote = leaseQuote(city, state, action.parcelId, action.tenantQuality);
  if (!quote.ok) return reject(state, quote.reason);
  const next = clone(state);
  applyLease(next, action.parcelId, quote, 'player');
  const anchor = quote.tenant.anchor;
  commitAction(next, {
    type: 'lease',
    parcelId: action.parcelId,
    tenantQuality: action.tenantQuality,
  }, {
    obligation: {
      kind: 'lease',
      timing: 'paid',
      parcelId: action.parcelId,
      cashOut: RULES.leaseFee,
      debtTaken: 0,
    },
  });
  return {
    state: next,
    events: [{
      kind: 'lease',
      parcelId: action.parcelId,
      tenantQuality: action.tenantQuality,
      amount: RULES.leaseFee,
      ...(anchor ? {
        anchorLanded: anchor.landed,
        anchorBrand: anchor.brand,
        anchorRoll: anchor.roll,
      } : {}),
    }],
  };
}

function doPlaceOrder(city, state, action) {
  const orderType = action.orderType ?? 'limit';
  if (orderType === 'market') {
    const last = state.markets?.prices?.[action.assetId];
    if (action.side === 'buy' && Number.isInteger(action.stopLoss) && Number.isFinite(last)
      && action.stopLoss >= last) {
      return reject(state, `Stop loss must be below the mark (${last}).`);
    }
    if (action.side === 'buy' && Number.isInteger(action.takeProfit) && Number.isFinite(last)
      && action.takeProfit <= last) {
      return reject(state, `Take profit must be above the mark (${last}).`);
    }
    const traded = doTrade(city, state, { ...action, type: 'trade' });
    if (traded.rejected) return traded;
    if (action.side !== 'buy') return traded;
    const sl = Number.isInteger(action.stopLoss) ? action.stopLoss : null;
    const tp = Number.isInteger(action.takeProfit) ? action.takeProfit : null;
    if (!sl && !tp) return traded;
    const next = traded.state;
    next.markets = ensureMarketsShape(next.markets, next.seed);
    const { id, seq } = {
      id: `ord-${String((next.markets.orderSeq ?? 0) + 1).padStart(4, '0')}`,
      seq: (next.markets.orderSeq ?? 0) + 1,
    };
    const children = bracketChildRows({
      id,
      assetId: action.assetId,
      units: action.units,
      tif: action.tif ?? 'gtc',
      venueId: action.venueId,
      quarter: next.quarter,
      stopLoss: sl,
      takeProfit: tp,
    });
    if (!children.length) return traded;
    const orders = [...next.markets.orders, ...children];
    next.markets = {
      ...next.markets,
      orders,
      orderSeq: seq,
      reservedCash: {
        ...next.markets.reservedCash,
        player: recomputeReserved({ ...next.markets, orders }, 'player'),
      },
    };
    traded.events = [
      ...traded.events,
      { kind: 'place-order', orderId: id, assetId: action.assetId, bracket: true },
    ];
    return traded;
  }
  const check = canPlaceOrder(city, state, action);
  if (!check.ok) return reject(state, check.reason);

  const next = clone(state);
  next.markets = ensureMarketsShape(next.markets, next.seed);
  const { id, seq } = { id: `ord-${String((next.markets.orderSeq ?? 0) + 1).padStart(4, '0')}`, seq: (next.markets.orderSeq ?? 0) + 1 };
  const groupId = action.groupId
    ?? ((action.stopLoss || action.takeProfit) ? `oco-${id}` : null);

  const parent = {
    id,
    owner: 'player',
    assetId: check.asset.id,
    side: action.side,
    units: check.units,
    orderType: check.orderType,
    tif: check.tif,
    limitPrice: check.limitPrice,
    stopPrice: check.stopPrice,
    status: 'working',
    placedQuarter: next.quarter,
    venueId: check.venue.id,
    reservedCash: check.reservedCash,
    groupId,
  };
  const orders = [...next.markets.orders, parent];

  if (groupId && action.side === 'buy') {
    orders.push(...bracketChildRows({
      id,
      assetId: check.asset.id,
      units: check.units,
      tif: check.tif,
      venueId: check.venue.id,
      quarter: next.quarter,
      stopLoss: action.stopLoss,
      takeProfit: action.takeProfit,
    }));
  }

  next.markets = {
    ...next.markets,
    orders,
    orderSeq: seq,
    reservedCash: {
      ...next.markets.reservedCash,
      player: recomputeReserved({ ...next.markets, orders }, 'player'),
    },
  };
  const marks = Number.isFinite(Number(action.markPrice))
    ? { [check.asset.id]: Math.max(1, Math.round(Number(action.markPrice))) }
    : (action.marks && typeof action.marks === 'object' ? action.marks : null);
  const fillNow = tryFillWorkingOrdersNow(next, { marks });
  // Resting orders do not spend the quarter action — cash is reserved instead.
  commitAction(next, {
    type: 'place-order',
    orderId: id,
    assetId: check.asset.id,
    side: action.side,
    units: check.units,
    orderType: check.orderType,
    venueId: check.venue.id,
  }, {
    costsAction: false,
    obligation: {
      kind: 'place-order',
      timing: 'reserved',
      cashOut: 0,
      cashIn: 0,
      debtTaken: 0,
      assetId: check.asset.id,
    },
  });
  return {
    state: next,
    events: [{
      kind: 'place-order',
      orderId: id,
      assetId: check.asset.id,
      side: action.side,
      units: check.units,
      orderType: check.orderType,
      venueId: check.venue.id,
    }, ...fillNow],
  };
}

function doScanOrders(city, state, action) {
  const working = (state.markets?.orders ?? []).filter((row) => row.status === 'working');
  if (!working.length) return { state, events: [] };
  const marks = action.marks && typeof action.marks === 'object' ? action.marks : null;
  if (!marks) return { state, events: [] };
  const next = clone(state);
  const events = tryFillWorkingOrdersNow(next, { marks });
  if (!events.some((row) => row.kind === 'order-fill')) return { state, events: [] };
  return { state: next, events };
}

function doCancelOrder(city, state, action) {
  const check = canCancelOrder(city, state, action);
  if (!check.ok) return reject(state, check.reason);
  const next = clone(state);
  next.markets = ensureMarketsShape(next.markets, next.seed);
  const groupId = check.order.groupId;
  const orders = next.markets.orders.map((row) => (
    row.id === check.order.id || (groupId && row.groupId === groupId && row.status === 'working')
      ? { ...row, status: 'cancelled', cancelReason: 'user', resolvedQuarter: next.quarter }
      : row
  ));
  next.markets = {
    ...next.markets,
    orders,
    reservedCash: {
      ...next.markets.reservedCash,
      player: recomputeReserved({ ...next.markets, orders }, 'player'),
    },
  };
  commitAction(next, {
    type: 'cancel-order',
    orderId: check.order.id,
    venueId: check.order.venueId,
  }, {
    costsAction: false,
    obligation: {
      kind: 'cancel-order',
      timing: 'released',
      cashOut: 0,
      cashIn: 0,
      debtTaken: 0,
    },
  });
  return {
    state: next,
    events: [{ kind: 'cancel-order', orderId: check.order.id, assetId: check.order.assetId }],
  };
}

function doSupermarketShift(city, state, action) {
  const shop = ensureSupermarket(state);
  const op = action.op;
  if (op === 'lease') {
    const fee = RULES.supermarketLease ?? 4_500;
    if (state.cash < fee) return reject(state, `Need ${fee.toLocaleString()} cash to lease the strip.`);
    if (shop.leaseUntilQuarter === state.quarter && shop.playsLeft > 0) {
      return reject(state, 'Lease already live this quarter.');
    }
    const next = clone(state);
    const nextShop = ensureSupermarket(next);
    next.cash -= fee;
    nextShop.leaseUntilQuarter = next.quarter;
    nextShop.playsLeft = 1;
    commitAction(next, { type: 'supermarket-shift', op: 'lease' }, {
      costsAction: false,
      obligation: { kind: 'supermarket-shift', timing: 'paid', cashOut: fee, cashIn: 0, debtTaken: 0 },
    });
    return {
      state: next,
      events: [{ kind: 'supermarket-lease', amount: fee, playsLeft: 1 }],
    };
  }
  if (op === 'consume-play') {
    if (shop.playsLeft < 1 || shop.leaseUntilQuarter !== state.quarter) {
      return reject(state, 'Lease a shift first.');
    }
    const next = clone(state);
    ensureSupermarket(next).playsLeft = 0;
    commitAction(next, { type: 'supermarket-shift', op: 'consume-play' }, { costsAction: false });
    return { state: next, events: [{ kind: 'supermarket-play' }] };
  }
  if (op === 'payout') {
    const amount = minigamePayoutAmount(action.amount, 'supermarket-shift');
    if (amount === null) return reject(state, 'Supermarket payout out of range.');
    const next = clone(state);
    const nextShop = ensureSupermarket(next);
    next.cash += amount;
    nextShop.takings = 0;
    if (action.stock && typeof action.stock === 'object') {
      nextShop.stock = {
        fresh: Math.max(0, Math.round(Number(action.stock.fresh) || 0)),
        household: Math.max(0, Math.round(Number(action.stock.household) || 0)),
        liquor: Math.max(0, Math.round(Number(action.stock.liquor) || 0)),
      };
    }
    if (Number.isInteger(action.stage) && action.stage >= 1) nextShop.stage = action.stage;
    commitAction(next, { type: 'supermarket-shift', op: 'payout' }, {
      costsAction: false,
      obligation: { kind: 'supermarket-shift', timing: 'paid', cashOut: 0, cashIn: amount, debtTaken: 0 },
    });
    return {
      state: next,
      events: [{ kind: 'supermarket-payout', amount }],
    };
  }
  return reject(state, 'Unknown supermarket shift.');
}

// V3.70 — the minigame payout trust boundary.
//
// Found by the L7 r1 critic on `veggie-patch-shift` and true of all FOUR shift verbs: the reducer
// took `action.amount` verbatim with `costsAction: false`, and the amount originates in
// localStorage, which no reducer may treat as trusted input. One dispatch measured at +$50,000,000.
//
// The lane's own test passed because it exercised the action BUILDER, which computes a sane amount,
// while the defect lives in the REDUCER, which never re-checks it. That is this codebase's signature
// failure — a check whose stated authority is not the quantity it computes — and it is the reason
// this guard is written here rather than in any caller.
//
// This is a LOCAL single-player game, so the realistic threat is not an attacker: it is a corrupted
// store, or a bug upstream, silently minting cash and wrecking the economy with no symptom until the
// balance is unrecoverable. So the guard REJECTS rather than silently clamping — a truncated payout
// hides the bug that produced it, and a loud rejection is what makes the next one findable.
//
// The ceiling is a trust boundary, not a balance number. Veggie / ice-cream / supermarket
// payouts sit in the low thousands (a veggie harvest measured at 4,200). Script Lord is a
// 30-day wholesale circuit: one satchel of OxyContin at a fair ask already washes past
// $250k, and a spike hop is millions. The shared 250k bound rejected every successful
// Script Lord bank and left city cash unchanged.
const MINIGAME_PAYOUT_CEILING = 250_000;
const SCRIPT_LORD_PAYOUT_CEILING = 10_000_000_000;

/**
 * Validate a client-supplied minigame payout. Returns a finite integer in range, or null when the
 * amount is out of range and the caller must reject.
 *
 * @param {unknown} raw the untrusted `action.amount`
 * @param {string} [type] the shift verb, so Script Lord can clear a real career wash
 * @returns {number|null}
 */
function minigamePayoutAmount(raw, type) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const amount = Math.max(0, Math.round(n));
  if (!Number.isSafeInteger(amount)) return null;
  const ceiling = type === 'script-lord-shift'
    ? SCRIPT_LORD_PAYOUT_CEILING
    : MINIGAME_PAYOUT_CEILING;
  return amount > ceiling ? null : amount;
}

// V3.70 L7 — the veggie patch's harvest payout. Mirrors doIceCreamRushShift exactly. It exists
// as its OWN verb rather than routing a carrot harvest through 'ice-cream-rush-shift', which would
// have worked today and written "ice cream" into the action log for a community garden.
function doVeggiePatchShift(city, state, action) {
  if (action.op !== 'payout') return reject(state, 'Unknown veggie patch shift.');
  const amount = minigamePayoutAmount(action.amount, 'veggie-patch-shift');
  if (amount === null) return reject(state, 'Veggie patch payout out of range.');
  const next = clone(state);
  next.cash += amount;
  commitAction(next, { type: 'veggie-patch-shift', op: 'payout' }, {
    costsAction: false,
    obligation: { kind: 'veggie-patch-shift', timing: 'paid', cashOut: 0, cashIn: amount, debtTaken: 0 },
  });
  return {
    state: next,
    events: [{ kind: 'veggie-patch-payout', amount }],
  };
}

function doIceCreamRushShift(city, state, action) {
  if (action.op !== 'payout') return reject(state, 'Unknown ice-cream rush shift.');
  const amount = minigamePayoutAmount(action.amount, 'ice-cream-rush-shift');
  if (amount === null) return reject(state, 'Ice-cream rush payout out of range.');
  const next = clone(state);
  next.cash += amount;
  commitAction(next, { type: 'ice-cream-rush-shift', op: 'payout' }, {
    costsAction: false,
    obligation: { kind: 'ice-cream-rush-shift', timing: 'paid', cashOut: 0, cashIn: amount, debtTaken: 0 },
  });
  return {
    state: next,
    events: [{ kind: 'ice-cream-rush-payout', amount }],
  };
}

function playerOpeningNav(state) {
  return state.startNav ?? state.openingCash ?? RULES.startingCash;
}

function doScriptLordConfiscate(city, state) {
  const start = playerOpeningNav(state);
  const next = clone(state);
  const parcels = [];
  for (const id of Object.keys(next.holdings ?? {}).sort()) {
    const holding = next.holdings[id];
    if (holding.owner !== 'player' && holding.ownerSeatId !== 'P1') continue;
    recordBuiltFormOnExit(city, next, id, holding);
    delete next.holdings[id];
    parcels.push(id);
  }
  if (next.markets?.portfolios?.player) next.markets.portfolios.player = {};
  if (next.markets?.costBases?.player) next.markets.costBases.player = {};
  next.cash = start;
  next.creditByOwner.player = {
    limitNav: start,
    forcedSaleDueQuarter: null,
    breachedQuarter: null,
    insolvent: false,
  };
  commitAction(next, { type: 'script-lord-shift', op: 'confiscate' }, {
    costsAction: false,
    obligation: { kind: 'script-lord-raid', timing: 'paid', cashOut: 0, cashIn: 0, debtTaken: 0 },
  });
  return {
    state: next,
    events: [{ kind: 'script-lord-raid', startNav: start, parcels }],
  };
}

function doScriptLordShift(city, state, action) {
  if (action.op === 'confiscate') return doScriptLordConfiscate(city, state);
  if (action.op !== 'payout') return reject(state, 'Unknown script-lord shift.');
  const amount = minigamePayoutAmount(action.amount, 'script-lord-shift');
  if (amount === null) return reject(state, 'Script-lord payout out of range.');
  if (amount > 0 && scriptLordWashRaidHits(state.seed, state.quarter)) {
    return doScriptLordConfiscate(city, state);
  }
  const next = clone(state);
  next.cash += amount;
  commitAction(next, { type: 'script-lord-shift', op: 'payout' }, {
    costsAction: false,
    obligation: { kind: 'script-lord-shift', timing: 'paid', cashOut: 0, cashIn: amount, debtTaken: 0 },
  });
  return {
    state: next,
    events: [{ kind: 'script-lord-payout', amount }],
  };
}

function doTrade(city, state, action) {
  const check = canTrade(city, state, action);
  if (!check.ok) return reject(state, check.reason);

  const next = clone(state);
  if (!next.markets) next.markets = createMarkets(next.seed);
  if (!next.markets.portfolios) {
    next.markets.portfolios = { player: {}, rival: {} };
  }
  if (!next.markets.portfolios.player) next.markets.portfolios.player = {};
  if (!next.markets.costBases) next.markets.costBases = { player: {}, rival: {} };
  if (!next.markets.costBases.player) next.markets.costBases.player = {};
  if (!next.markets.costBases.rival) next.markets.costBases.rival = {};
  const book = { ...next.markets.portfolios.player };
  const costBasesPlayer = { ...next.markets.costBases.player };
  const assetId = check.asset.id;
  const held = book[assetId] ?? 0;
  const priorBasis = costBasesPlayer[assetId] ?? 0;
  let realized = 0;
  if (check.asset && action.side === 'buy') {
    // Average cost: remaining basis is total $ still tied up in held units.
    next.cash -= check.cashOut;
    book[assetId] = held + check.units;
    costBasesPlayer[assetId] = priorBasis + check.cashOut;
  } else {
    next.cash += check.cashIn;
    // Pro-rata residual basis; realized = cashIn − released basis.
    const soldBasis = held > 0 ? Math.round((priorBasis * check.units) / held) : 0;
    realized = check.cashIn - soldBasis;
    book[assetId] = held - check.units;
    costBasesPlayer[assetId] = priorBasis - soldBasis;
    if ((book[assetId] ?? 0) <= 0) {
      book[assetId] = 0;
      costBasesPlayer[assetId] = 0;
    }
  }
  const fill = {
    id: `fill-mkt-${next.quarter}-${assetId}-${action.side}-${check.units}`,
    orderId: null,
    assetId,
    side: action.side,
    units: check.units,
    price: check.price,
    quarter: next.quarter,
    cashDelta: action.side === 'buy' ? check.cashOut : check.cashIn,
    realized,
  };
  next.markets = {
    ...next.markets,
    portfolios: {
      ...next.markets.portfolios,
      player: book,
    },
    costBases: {
      ...next.markets.costBases,
      player: costBasesPlayer,
    },
    fills: [...(next.markets.fills ?? []), fill].slice(-80),
  };
  const exitedParcelId = action.side === 'sell'
    ? releaseListedParcelIfExited(next, assetId)
    : null;
  commitAction(next, {
    type: 'trade',
    assetId,
    side: action.side,
    units: check.units,
    venueId: check.venue.id,
  }, {
    costsAction: false,
    obligation: {
      kind: 'trade',
      timing: 'paid',
      cashOut: check.cashOut,
      cashIn: check.cashIn,
      debtTaken: 0,
      assetId,
    },
  });
  return {
    state: next,
    events: [{
      kind: 'trade',
      assetId,
      side: action.side,
      units: check.units,
      price: check.price,
      amount: action.side === 'buy' ? check.cashOut : check.cashIn,
      venueId: check.venue.id,
      ...(action.side === 'sell' ? { realized } : {}),
      ...(exitedParcelId ? { exitedParcelId } : {}),
    }],
  };
}

function doCrossingAccident(city, state, action) {
  if (state.phase !== 'play') return reject(state, 'The run is over.');
  const existing = (state.crossingAccidents ?? [])
    .some((row) => row.quarter === state.quarter);
  if (existing) return reject(state, 'An accident is already being attended this quarter.');
  if (!quarterAllowsCrossingAccident(state.seed, state.quarter)) {
    return reject(state, 'No crossing accident this quarter.');
  }
  const next = clone(state);
  next.rates = ensureRatesState(next, next.seed, next.quarters);
  const accidentId = `xing-${next.quarter}-${next.actionOrdinal}`;
  const victimName = pickEstateName(next.seed, accidentId);
  const hit = {
    id: accidentId,
    quarter: next.quarter,
    x: Number(action.x) || 0,
    z: Number(action.z) || 0,
    pedId: action.pedId ?? null,
    vehicleKind: action.vehicleKind ?? 'car',
    victimName,
    hospitalUntilQuarter: next.quarter,
  };
  next.crossingAccidents = [...(next.crossingAccidents ?? []), hit];
  const listed = queueDeceasedEstateAuction(city, next, {
    parcelId: action.parcelId ?? null,
    victimName,
    accidentId,
    x: hit.x,
    z: hit.z,
  });
  hit.parcelId = listed.parcelId;
  hit.died = true;
  next.events = freezeEvents(next.events);
  commitAction(next, {
    type: 'crossing-accident',
    accidentId,
    parcelId: listed.parcelId,
  }, { costsAction: false });
  return {
    state: next,
    events: [{
      kind: 'crossing-accident',
      accidentId,
      parcelId: listed.parcelId,
      victimName,
      x: hit.x,
      z: hit.z,
      vehicleKind: hit.vehicleKind,
      deceasedEstate: Boolean(listed.event),
    }],
  };
}

function doIpo(city, state, action) {
  const check = canIpo(city, state, action.parcelId);
  if (!check.ok) return reject(state, check.reason);
  const next = clone(state);
  if (!next.markets) next.markets = createMarkets(next.seed);
  next.markets = ensureMarketsShape(next.markets, next.seed);
  const listing = createDataCentreListing(city, next, action.parcelId);
  if (!listing) return reject(state, 'Could not price the listing.');
  const quote = check.quote;
  next.markets = {
    ...next.markets,
    listings: [...(next.markets.listings ?? []), listing],
    prices: { ...next.markets.prices, [listing.id]: listing.basePrice },
    priorPrices: { ...(next.markets.priorPrices ?? {}), [listing.id]: listing.basePrice },
    portfolios: {
      ...next.markets.portfolios,
      player: {
        ...next.markets.portfolios.player,
        [listing.id]: listing.sharesOutstanding,
      },
    },
    costBases: {
      ...next.markets.costBases,
      player: {
        ...next.markets.costBases.player,
        [listing.id]: quote.marketCap,
      },
    },
  };
  next.holdings[action.parcelId].listedTicker = listing.id;
  next.holdings[action.parcelId].listedQuarter = next.quarter;
  commitAction(next, {
    type: 'ipo',
    parcelId: action.parcelId,
    ticker: listing.id,
  });
  return {
    state: next,
    events: [{
      kind: 'ipo',
      parcelId: action.parcelId,
      ticker: listing.id,
      name: listing.name,
      shares: listing.sharesOutstanding,
      ipoPrice: listing.basePrice,
      marketCap: quote.marketCap,
      annualRevenue: quote.annualRevenue,
    }],
  };
}

function doRemediate(city, state, action) {
  const unavailable = canSpendAction(state);
  if (unavailable) return reject(state, unavailable);
  const holding = state.holdings[action.parcelId];
  if (!holding || holding.owner !== 'player') return reject(state, 'You do not hold this parcel.');
  const status = state.parcelStatus[action.parcelId];
  if (status.occupancy !== 'squatted') return reject(state, 'This parcel is not squatted.');
  const remediateFunds = canFund(city, state, 'player', RULES.remediateCost);
  if (!remediateFunds.ok) {
    return reject(state, `Short $${remediateFunds.shortfall} against the overdraft floor.`);
  }
  const next = clone(state);
  next.cash -= RULES.remediateCost;
  next.parcelStatus[action.parcelId].occupancy = 'vacant';
  next.parcelStatus[action.parcelId].tenant = null;
  next.parcelStatus[action.parcelId].squatterSinceQuarter = null;
  commitAction(next, {
    type: 'remediate',
    parcelId: action.parcelId,
  }, {
    obligation: {
      kind: 'remediate',
      timing: 'paid',
      parcelId: action.parcelId,
      cashOut: RULES.remediateCost,
      debtTaken: 0,
    },
  });
  return {
    state: next,
    events: [{
      kind: 'remediate',
      parcelId: action.parcelId,
      amount: RULES.remediateCost,
    }],
  };
}

function doAcquire(city, state, action) {
  if (activeParcel(city, state, action.parcelId)?.surveyedFarm) return doFarmAction(city, state, action, 'acquire');
  const check = canAcquire(city, state, action.parcelId);
  if (!check.ok) return reject(state, check.reason);

  const next = clone(state);
  const ordinaryQuote = acquireQuote(city, state, action.parcelId);
  const price = action.priceOverride ?? ordinaryQuote.price;
  if (!Number.isInteger(price) || price < ordinaryQuote.price) {
    return reject(state, 'Acquisition price override is below reserve.');
  }
  const debtTaken = applyBp(price, Math.round(
    (ordinaryQuote.debtTaken * 10000) / ordinaryQuote.price,
  ));
  const duty = applyBp(price, RULES.dutyBp);
  const quote = {
    ...ordinaryQuote,
    price,
    duty,
    debtTaken,
    cashOut: price - debtTaken + duty,
  };
  if (state.cash - quote.cashOut < overdraftFloor(city, state, 'player')) {
    return reject(state, 'The fixed acquisition price is no longer fundable.');
  }
  next.cash -= quote.cashOut;
  const completed = completedBaseForStatus(city, next, action.parcelId);
  const archetypeId = archetypeIdOf(city, next, action.parcelId);
    if (next.parcelStatus[action.parcelId]?.lastSale) next.parcelStatus[action.parcelId].lastSale = null;
  next.holdings[action.parcelId] = {
    owner: 'player',
    level: next.parcelStatus[action.parcelId].builtLevel,
    condition: next.parcelStatus[action.parcelId].condition,
    archetypeId,
    sector: completed.sector,
    basePrice: completed.basePrice,
    baseRent: completed.baseRent,
    debt: quote.debtTaken,
    basis: quote.price,
    acquiredQuarter: state.quarter,
    mature: false,
    conditionAssessment: conditionAssessmentForAcquisition(
      city,
      next,
      action.parcelId,
      state.actionOrdinal,
    ),
    ...holdingDefaultsForState(city, next, action.parcelId),
  };
  commitAction(next, { type: 'acquire', parcelId: action.parcelId, price: quote.price }, {
    costsAction: !isFreeFollowUpAcquire(state, action.parcelId),
    obligation: {
      kind: 'acquire',
      timing: 'paid',
      parcelId: action.parcelId,
      price: quote.price,
      duty: quote.duty,
      cashOut: quote.cashOut,
      debtTaken: quote.debtTaken,
    },
  });

  const links = corridorLinks(city, next, action.parcelId);
  return {
    state: next,
    events: [
      { kind: 'acquire', parcelId: action.parcelId, amount: quote.cashOut, quote },
      ...(links.length ? [{ kind: 'corridor', parcelId: action.parcelId, links }] : []),
    ],
  };
}

function doFarmAction(city, state, action, op) {
  const check = farmActionCheck(city, state, action.parcelId, op, action.catalogId ?? 'farm');
  if (!check.ok) return reject(state, check.reason);
  const next = clone(state), parcel = activeParcel(city, state, action.parcelId);
  next.farms ??= {};
  next.cash -= check.cost;
  if (op === 'acquire') next.farms[parcel.id] = { owner: 'player', acquiredQuarter: state.quarter, basis: check.cost, permit: { ...FARM_PERMIT }, fieldId: [...parcel.fieldId], completedQuarter: null, lastHarvestQuarter: null };
  else {
    const farm = next.farms[parcel.id];
    farm.basis += check.cost;
    farm.construction = { startedQuarter: state.quarter, completionQuarter: state.quarter + 1, toArchetype: 'farm' };
  }
  commitAction(next, { type: op === 'acquire' ? 'acquire' : 'place-building', parcelId: parcel.id, catalogId: 'farm' }, {
    costsAction: true, obligation: { kind: `farm-${op}`, timing: 'paid', cashOut: check.cost, debtTaken: 0 },
  });
  return { state: next, events: [{ kind: `farm-${op}`, parcelId: parcel.id, amount: check.cost }] };
}

export function farmFieldState(farm, quarter) {
  if (farm?.completedQuarter == null || quarter < farm.completedQuarter) return 'ploughed';
  return ['ploughed', 'green', 'gold', 'harvested'][(quarter - farm.completedQuarter) % 4];
}

function settleFarms(next) {
  for (const [id, farm] of Object.entries(next.farms ?? {})) {
    // Settle q closes q and opens q+1. Construction never earns rent or harvest.
    if (farm.construction?.completionQuarter === next.quarter + 1) {
      farm.completedQuarter = farm.construction.completionQuarter;
      farm.archetypeId = 'farm';
      delete farm.construction;
    }
    if (farm.completedQuarter == null || next.quarter < farm.completedQuarter + 3 || (next.quarter - farm.completedQuarter) % 4 !== 3 || farm.lastHarvestQuarter === next.quarter) continue;
    farm.lastHarvestQuarter = next.quarter;
    farm.harvests = (farm.harvests ?? 0) + 1;
    next.cash += 2000;
    next.log.push({ quarter: next.quarter, kind: 'farm-market-sale', parcelId: id, amount: 2000, text: 'Town-square market bought one farm produce lot for $2,000.' });
  }
}

function creditHammerbarnRoyalty(next, quote) {
  const amount = quote?.hammerbarnRoyalty ?? 0;
  const to = quote?.hammerbarnRoyaltyTo;
  if (!amount || !to) return;
  if (to === 'player') next.cash += amount;
  else if (to === 'rival') next.rival.cash += amount;
}

function doRenovate(city, state, action) {
  const check = canRenovate(city, state, action.parcelId);
  if (!check.ok) return reject(state, check.reason);

  const next = clone(state);
  const ordinaryQuote = renovateQuote(city, state, action.parcelId);
  const quote = action.jointRenovation
    ? (() => {
      const cost = applyBp(ordinaryQuote.cost, 8_500);
      const lvrBp = Math.round((ordinaryQuote.debtTaken * 10000) / ordinaryQuote.cost);
      const debtTaken = applyBp(cost, lvrBp);
      const royalty = ordinaryQuote.hammerbarnRoyalty
        ? applyBp(ordinaryQuote.hammerbarnRoyalty, 8_500)
        : 0;
      return {
        ...ordinaryQuote,
        baseWorksCost: ordinaryQuote.cost,
        cost,
        debtTaken,
        cashOut: cost - debtTaken + royalty,
        jointWorksBp: 8_500,
        hammerbarnRoyalty: royalty,
      };
    })()
    : ordinaryQuote;
  if (state.cash - quote.cashOut < overdraftFloor(city, state, 'player')) {
    return reject(state, 'The renovation is no longer fundable.');
  }
  next.cash -= quote.cashOut;
  creditHammerbarnRoyalty(next, quote);
  const holding = next.holdings[action.parcelId];
  holding.debt += quote.debtTaken;
  holding.renovation = pendingRenovation(state, action.parcelId, quote);
  // Works consume the holding's briefs. The professional stays on the board
  // until their three-project cap is spent and no live contract remains.
  consumeWorksHires(holding, state.quarter);
  commitAction(next, { type: 'renovate', parcelId: action.parcelId, cost: quote.cost }, {
    obligation: {
      kind: 'renovate',
      timing: 'paid',
      parcelId: action.parcelId,
      worksCost: quote.cost,
      cashOut: quote.cashOut,
      debtTaken: quote.debtTaken,
    },
  });

  return {
    state: next,
    events: [{ kind: 'renovate', parcelId: action.parcelId, amount: quote.cost, quote }],
  };
}

function doRenovateRoom(city, state, action) {
  const roomId = action.roomId;
  const finish = action.finish;
  const check = canRenovateRoom(city, state, action.parcelId, roomId, finish);
  if (!check.ok) return reject(state, check.reason);

  const next = clone(state);
  const quote = roomRenovateQuote(city, state, action.parcelId, roomId, finish);
  if (!quote?.ok) return reject(state, quote?.reason ?? 'Room upgrade unavailable.');
  if (next.cash - quote.cashOut < 0) {
    return reject(state, 'Not enough cash for this room upgrade.');
  }
  ensureRoomState(city, next, action.parcelId);
  if (quote.roomEconomyVersion === 2) initialiseRoomEconomy(next.parcelStatus[action.parcelId], quote.roomEconomyTransition);
  next.cash -= quote.cashOut;
  const holding = next.holdings[action.parcelId];
  // Concurrent jobs: push alongside any other rooms (and any whole-building renovate).
  const jobs = roomJobs(holding);
  setRoomJobs(holding, [
    ...jobs,
    {
      roomId,
      finish,
      ...(quote.roomEconomyVersion === 2 ? { roomEconomyVersion: 2, roomEconomyTransition: clone(quote.roomEconomyTransition), rentRatio: clone(quote.rentRatio) } : {}),
      valueAdd: quote.valueAdd,
      multi: quote.multi,
      cost: quote.cost,
      startedQuarter: state.quarter,
      completionQuarter: quote.completionQuarter,
    },
  ]);
  // Free action: costsAction false.
  commitAction(next, {
    type: 'renovate-room',
    parcelId: action.parcelId,
    roomId,
    finish,
    cost: quote.cost,
  }, {
    costsAction: false,
    obligation: {
      kind: 'renovate-room',
      timing: 'paid',
      parcelId: action.parcelId,
      worksCost: quote.cost,
      cashOut: quote.cashOut,
      debtTaken: 0,
    },
  });

  return {
    state: next,
    events: [{
      kind: 'renovate-room',
      parcelId: action.parcelId,
      roomId,
      finish,
      amount: quote.cost,
      quote,
    }],
  };
}

function doTenantExit(city, state, action, tenantExit) {
  const check = canTenantExit(city, state, action.parcelId, tenantExit);
  if (!check.ok) return reject(state, check.reason);

  const next = clone(state);
  const exitQuote = redevelopmentExitQuote(city, state, action.parcelId);
  const path = exitQuote[tenantExit];
  const cashOut = path.cashOut;
  next.cash -= cashOut;
  const holding = next.holdings[action.parcelId];
  holding.redevelopmentNotice = tenantExit === 'notice'
    ? pendingTenantNotice(state)
    : null;
  if (tenantExit === 'buyout') {
    next.parcelStatus[action.parcelId].occupancy = 'vacant';
    next.parcelStatus[action.parcelId].tenant = null;
    next.parcelStatus[action.parcelId].squatterSinceQuarter = null;
  }
  commitAction(next, {
    type: `redevelop:${tenantExit}`,
    parcelId: action.parcelId,
    cost: cashOut,
  }, {
    obligation: {
      kind: tenantExit === 'notice' ? 'tenant-notice' : 'tenant-buyout',
      timing: 'paid',
      parcelId: action.parcelId,
      tenantCompensation: path.compensation,
      noticeRent: tenantExit === 'notice' ? exitQuote.notice.rent : 0,
      cashOut,
      debtTaken: 0,
    },
  });

  return {
    state: next,
    events: [{
      kind: tenantExit === 'notice' ? 'tenant-notice' : 'tenant-buyout',
      parcelId: action.parcelId,
      tenantExit,
      amount: cashOut,
      quote: {
        ...path,
        noticeRent: tenantExit === 'notice' ? path.rent : 0,
      },
    }],
  };
}

function doRedevelop(city, state, action) {
  const tenantExit = action.tenantExit ?? null;
  if (tenantExit === 'notice' || tenantExit === 'buyout') {
    return doTenantExit(city, state, action, tenantExit);
  }
  const pendingRoomReason = pendingRoomReplacementReason(state, action.parcelId);
  if (pendingRoomReason) return reject(state, pendingRoomReason);
  const catalogCheck = action.catalogId
    ? canPlaceCatalogBuilding(city, state, action.parcelId, action.catalogId)
    : null;
  const check = catalogCheck ?? canRedevelop(city, state, action.parcelId, null);
  if (!check.ok) return reject(state, check.reason);

  const next = clone(state);
  const quote = redevelopQuote(
    city,
    state,
    action.parcelId,
    'player',
    catalogCheck?.placesAs ?? null,
  );
  const cashOut = quote.cashOut;
  const debtTaken = quote.debtTaken;
  next.cash -= cashOut;
  creditHammerbarnRoyalty(next, quote);
  next.holdings[action.parcelId].debt += debtTaken;
  const holding = next.holdings[action.parcelId];
  holding.construction = pendingConstruction(state, action.parcelId, quote);
  holding.redevelopmentNotice = null;
  holding.siteCleared = false;
  delete holding.demolition;
  consumeWorksHires(holding, state.quarter);
  delete holding.renovation;
  commitAction(next, {
    type: 'redevelop',
    parcelId: action.parcelId,
    tenantExit: null,
    catalogId: action.catalogId ?? null,
    cost: quote.cost,
  }, {
    obligation: {
      kind: 'redevelop',
      timing: 'paid',
      parcelId: action.parcelId,
      worksCost: quote.cost,
      cashOut,
      debtTaken,
    },
  });

  return {
    state: next,
    events: [{
      kind: 'redevelop',
      parcelId: action.parcelId,
      tenantExit: null,
      amount: cashOut,
      quote: {
        ...quote,
        completionQuarter: quote.completionQuarter
          ?? state.quarter + constructionDurationQuarters(quote.toArchetype, quote.sectorAfter),
      },
    }],
  };
}

function doChangeUse(city, state, action) {
  const check = canChangeUse(city, state, action.parcelId);
  if (!check.ok) return reject(state, check.reason);
  const quote = check.quote ?? changeUseQuote(city, state, action.parcelId);
  const next = clone(state);
  next.cash -= quote.cashOut;
  creditHammerbarnRoyalty(next, quote);
  const holding = next.holdings[action.parcelId];
  holding.debt += quote.debtTaken;
  holding.construction = pendingConstruction(state, action.parcelId, quote);
  holding.redevelopmentNotice = null;
  delete holding.venture;
  delete holding.renovation;
  consumeWorksHires(holding, state.quarter);
  const status = next.parcelStatus[action.parcelId];
  status.occupancy = 'vacant';
  status.tenant = null;
  status.squatterSinceQuarter = null;
  commitAction(next, {
    type: 'change-use',
    parcelId: action.parcelId,
    usePermitId: holding.approvedUsePermit?.id ?? null,
    cost: quote.cost,
  }, {
    obligation: {
      kind: 'change-use',
      timing: 'paid',
      parcelId: action.parcelId,
      worksCost: quote.cost,
      cashOut: quote.cashOut,
      debtTaken: quote.debtTaken,
    },
  });
  return {
    state: next,
    // Reuse the established scaffold/VFX presentation path; the committed verb remains
    // `change-use`, so replay and the ledger name the actual decision.
    events: [{
      kind: 'redevelop',
      changeUse: true,
      parcelId: action.parcelId,
      amount: quote.cashOut,
      quote,
    }],
  };
}

function doDivest(city, state, action) {
  const check = canDivest(city, state, action.parcelId);
  if (!check.ok) return reject(state, check.reason);

  const next = clone(state);
  // Free exit remains legal, but cannot discard the already-fixed condition
  // roll. Resolve before both valuation and recording the returned built form.
  const assessment = resolveConditionAssessment(city, next, action.parcelId);
  const quote = divestQuote(city, next, action.parcelId);
  next.cash += quote.proceeds;                 // 0 on a surrender — the debt just goes
  const holding = next.holdings[action.parcelId];
  recordBuiltFormOnExit(city, next, action.parcelId, holding);
  // A divest returns this holding to the open market; parcel-specific asking devices do not
  // transfer with it. Pins on any parcel the player never held remain untouched.
  const status = next.parcelStatus[action.parcelId];
  status.askingOverride = null;
  status.askingOverrideUntil = 0;
  delete status.peExitPrice;
  // The market remembers the sale: the parcel re-lists at what it just sold for and the
  // anchor drifts with the district at each settle. Buying consumes it (V3.39).
  status.lastSale = quote.value > 0
    ? { price: quote.value, quarter: next.quarter }
    : null;
  delete next.holdings[action.parcelId];
  commitAction(
    next,
    {
      type: 'divest',
      ...(assessment ? { conditionAssessment: assessment } : {}),
      parcelId: action.parcelId,
      proceeds: quote.proceeds,
      surrender: quote.surrender,
      baseValue: quote.baseValue,
      value: quote.value,
      terryBriefed: quote.terryBriefed,
      saleUplift: quote.saleUplift,
      saleUpliftBp: quote.saleUpliftBp,
      fee: quote.fee,
      feeBp: quote.feeBp,
      peSale: quote.peSale,
      incomeSale: quote.incomeSale,
    },
    {
      costsAction: RULES.divestCostsAction,
      obligation: {
        kind: quote.surrender ? 'surrender' : 'divest',
        timing: 'paid',
        parcelId: action.parcelId,
        cashOut: -quote.proceeds,
        debtTaken: 0,
        debtCleared: quote.debtCleared,
        baseValue: quote.baseValue,
        value: quote.value,
        terryBriefed: quote.terryBriefed,
        saleUplift: quote.saleUplift,
        saleUpliftBp: quote.saleUpliftBp,
        fee: quote.fee,
        feeBp: quote.feeBp,
        peSale: quote.peSale,
        incomeSale: quote.incomeSale,
      },
    },
  );

  return {
    state: next,
    events: [...(assessment ? [assessment] : []), {
      kind: quote.surrender ? 'surrender' : 'divest',
      parcelId: action.parcelId,
      amount: quote.proceeds,
      quote,
    }],
  };
}

function auctionReservesParcel(state, parcelId) {
  return [...(state.events?.order ?? [])].sort()
    .map((eventId) => state.events.byId[eventId])
    .some((event) =>
      event.type === 'auction'
      && event.status !== 'resolved'
      && event.status !== 'cancelled'
      && event.anchorIds.includes(parcelId));
}

function activeInsurance(holding, quarter) {
  return Boolean(
    holding.insurance
    && holding.insurance.expiresAfterQuarter >= quarter
    && (holding.insurance.fire || holding.insurance.flood),
  );
}

function pairCrossesRightOfWay(city, parcelIds) {
  const selected = new Set(parcelIds);
  return (city.rightsOfWay ?? []).some((rightOfWay) =>
    rightOfWay.flankingParcels
      .filter(({ parcelId }) => selected.has(parcelId))
      .length === 2);
}

function consolidationPair(action) {
  if (Array.isArray(action.parcelIds)) {
    return [...new Set(action.parcelIds)].sort();
  }
  return action.parcelId ? [action.parcelId] : [];
}

function footprintIs1x1(parcel) {
  // Prefer live tile count; fall back to groundFootprint / archetype footprint.
  if (Array.isArray(parcel.tiles) && parcel.tiles.length === 1) return true;
  const fp = parcel.groundFootprint
    ?? ARCHETYPES[parcel.archetypeId]?.footprint
    ?? [1, 1];
  return Number(fp[0]) === 1 && Number(fp[1]) === 1;
}

function sectorCompatibleForMerge(a, b) {
  // Same sector always OK. Residential families also merge across cottage/terrace/etc.
  if (a === b) return true;
  const residentialLike = new Set(['residential']);
  return residentialLike.has(a) && residentialLike.has(b);
}

function hasPendingWorks(holding, quarter = null) {
  if (!holding) return true;
  if (holding.construction || holding.renovation || holding.redevelopmentNotice) return true;
  if (roomJobs(holding).length > 0) return true;
  // Only active hire contracts block topology (expired keys are cleaned at settle).
  if (quarter != null) {
    return Object.keys(activeHiresOnHolding(holding, quarter)).length > 0;
  }
  if (holding.hire) return true;
  if (holding.hires && typeof holding.hires === 'object') {
    return Object.keys(holding.hires).length > 0;
  }
  return false;
}

function validateConsolidation(city, state, parcelIds) {
  const unavailable = canSpendAction(state);
  if (unavailable) return { ok: false, reason: unavailable };
  const ids = [...new Set(parcelIds ?? [])].sort();
  if (ids.length !== 2) {
    return { ok: false, reason: 'Consolidation requires exactly two active parcels.' };
  }
  const parcels = ids.map((id) => activeParcel(city, state, id));
  if (parcels.some((parcel) => !parcel)) {
    return { ok: false, reason: 'Consolidation requires exactly two active parcels.' };
  }
  const holdings = ids.map((id) => state.holdings[id]);
  if (holdings.some((holding) => holding?.owner !== 'player')) {
    return { ok: false, reason: 'Both parcels must be your holdings.' };
  }
  const unsurveyed = ids.filter((id) => !parcelSurveyComplete(state, id));
  if (unsurveyed.length === 2) {
    return { ok: false, reason: 'Both parcels require current surveys before consolidation.' };
  }
  if (unsurveyed.length === 1) {
    return {
      ok: false,
      reason: `${unsurveyed[0].toUpperCase()} requires a current survey before consolidation.`,
    };
  }
  if (parcels[0].bx !== parcels[1].bx || parcels[0].bz !== parcels[1].bz) {
    return { ok: false, reason: 'Both parcels must be in the same block.' };
  }
  if (parcels.some((parcel) => !footprintIs1x1(parcel))) {
    return { ok: false, reason: 'Only two 1×1 ground footprints can consolidate.' };
  }
  if (parcels[0].zoneId !== parcels[1].zoneId) {
    return {
      ok: false,
      reason: `Different zones — ${parcels[0].zoneId} cannot join ${parcels[1].zoneId}.`,
    };
  }
  const positions = parcels.map((parcel) => {
    const tile = parseParcelId(parcel.tiles[0]);
    return globalTile(tile.bx, tile.bz, tile.tx, tile.tz);
  });
  if (
    Math.abs(positions[0].gx - positions[1].gx)
      + Math.abs(positions[0].gz - positions[1].gz) !== 1
  ) return { ok: false, reason: 'The two parcels must share an orthogonal tile edge.' };
  if (pairCrossesRightOfWay(city, ids)) {
    return { ok: false, reason: 'A consolidation cannot cross a right of way.' };
  }
  if (!sectorCompatibleForMerge(parcels[0].sector, parcels[1].sector)) {
    return { ok: false, reason: 'Both parcels must share a compatible sector.' };
  }
  for (const id of ids) {
    const holding = state.holdings[id];
    const status = state.parcelStatus[id];
    if (levelOf(state, id) !== 0) {
      return { ok: false, reason: 'Both parcels must remain at built level 0.' };
    }
    // Vacant preferred, but tenanted stock can merge — site is cleared on consolidate.
    if (!status) {
      return { ok: false, reason: 'Missing parcel status.' };
    }
    if (status.occupancy === 'squatted') {
      return { ok: false, reason: 'Squatted parcels cannot consolidate until remediated.' };
    }
    if (status.damage) return { ok: false, reason: 'Damaged parcels cannot consolidate.' };
    if (auctionReservesParcel(state, id)) {
      return { ok: false, reason: 'An auction-reserved parcel cannot consolidate.' };
    }
    if (holding.conditionAssessment
      && holding.conditionAssessment.resolveQuarter > state.quarter) {
      // Only a future-quarter certificate blocks. A this-quarter assessment carries a
      // stored fair roll, so doConsolidate resolves it early and deterministically —
      // survey-then-consolidate works inside one quarter (V3.39 P7).
      return { ok: false, reason: 'Condition assessment settles this quarter' };
    }
    if (hasPendingWorks(holding, state.quarter)) {
      return { ok: false, reason: 'Pending works, notice or hire blocks consolidation.' };
    }
    // Insurance no longer blocks: merged pad drops cover (re-insure after).
  }
  const quote = consolidateQuote(city, state, ids);
  if (!quote.ok) {
    return {
      ok: false,
      reason: `Short $${quote.shortfall.toLocaleString()} against the overdraft floor.`,
    };
  }
  return { ok: true, ids, parcels, holdings, quote };
}

function inferredConsolidation(city, state, parcelId) {
  if (!parcelId) return null;
  let bestFail = null;
  for (const neighbour of [...activeAdjacency(city, state, parcelId)].sort()) {
    // Only consider player-owned neighbours for the primary path.
    if (state.holdings[neighbour]?.owner !== 'player') continue;
    const validation = validateConsolidation(city, state, [parcelId, neighbour]);
    if (validation.ok) return validation;
    bestFail = validation;
  }
  // Second pass: any orthogonal neighbour reason (helps card copy).
  if (!bestFail) {
    for (const neighbour of [...activeAdjacency(city, state, parcelId)].sort()) {
      const validation = validateConsolidation(city, state, [parcelId, neighbour]);
      if (validation.ok) return validation;
      bestFail = validation;
    }
  }
  return bestFail;
}

function nextTopologyParcelId(next, lowerId, higherId) {
  const committed = next.log.at(-1);
  if (
    committed?.type !== 'consolidate'
    || !Number.isInteger(committed.actionOrdinal)
  ) throw new Error('Consolidation id requires its committed action ordinal.');
  let base = hash32(
    `${next.seed}::topology::${lowerId}+${higherId}::${committed.actionOrdinal}`,
  ) % 10000;
  for (let attempt = 0; attempt < 10000; attempt += 1) {
    const candidate = `A${String(base).padStart(4, '0')}`;
    if (
      !next.topology.parcels[candidate]
      && !next.topology.lineage[candidate]
    ) return candidate;
    base = (base + 1) % 10000;
  }
  throw new Error('Topology parcel id space exhausted.');
}

function consolidatedParcel(next, id, parents, holdings) {
  const [lower, higher] = parents;
  const condition = Math.min(holdings[0].condition, holdings[1].condition);
  const componentParcelIds = [...new Set(
    parents.flatMap((parcel) => parcel.componentParcelIds ?? [parcel.id]),
  )].sort();
  return {
    ...lower,
    id,
    tiles: [...new Set([...lower.tiles, ...higher.tiles])].sort(),
    topologyVersion: next.topology.version,
    componentParcelIds,
    successionSourceId: lower.id,
    consolidated: true,
    archetypeId: holdings[0].archetypeId,
    landUseId: holdings[0].landUseId ?? holdings[0].archetypeId,
    sector: holdings[0].sector,
    storeys: Math.max(
      ARCHETYPES[holdings[0].archetypeId]?.storeys ?? lower.storeys,
      ARCHETYPES[holdings[1].archetypeId]?.storeys ?? higher.storeys,
    ),
    condition,
    corner: Boolean(lower.corner || higher.corner),
    frontages: Math.max(lower.frontages ?? 1, higher.frontages ?? 1),
    tram: Boolean(lower.tram || higher.tram),
    basePrice: holdings[0].basePrice + holdings[1].basePrice,
    baseRent: holdings[0].baseRent + holdings[1].baseRent,
    valuation: `Consolidated from ${lower.id.toUpperCase()} + ${higher.id.toUpperCase()}`,
  };
}

function topologyStatus(condition, versions) {
  return {
    condition,
    builtArchetypeId: null,
    builtLandUseId: null,
    builtLevel: 0,
    damage: null,
    occupancy: 'vacant',
    tenant: null,
    squatterSinceQuarter: null,
    askingOverride: null,
    askingOverrideUntil: 0,
    conditionVersion: Math.max(0, ...versions),
    surveyedConditionVersion: null,
  };
}

function doConsolidate(city, state, action) {
  let validation = validateConsolidation(city, state, consolidationPair(action));
  if (!validation.ok && !Array.isArray(action.parcelIds) && action.parcelId) {
    validation = inferredConsolidation(city, state, action.parcelId) ?? validation;
  }
  if (!validation.ok) return reject(state, validation.reason);

  const {
    ids: [lowerId, higherId],
    parcels,
    holdings: quotedHoldings,
    quote,
  } = validation;
  const next = clone(state);
  // Early-resolve any this-quarter condition assessments on the parents: the stored roll
  // is already fixed, so resolution here equals resolution at settle. If the assessment
  // downgraded the condition (bumping conditionVersion), the surveyor's this-quarter
  // certificate covers the resolved state — refresh it so the merge stays surveyed.
  const assessmentsResolved = [];
  for (const id of [lowerId, higherId]) {
    if (!next.holdings[id]?.conditionAssessment) continue;
    const surveyedBefore = parcelSurveyComplete(next, id);
    const row = resolveConditionAssessment(city, next, id);
    if (row) assessmentsResolved.push(row);
    const status = next.parcelStatus[id];
    if (surveyedBefore && status.surveyedConditionVersion !== status.conditionVersion) {
      status.surveyedConditionVersion = status.conditionVersion;
    }
  }
  // V2 snapshots the already-resolved owned bases. Legacy runs retain their
  // historical pre-resolution aggregation for exact replay compatibility.
  const snapshotState = isRoomEconomyV2(state) ? next : state;
  const holdings = isRoomEconomyV2(state)
    ? [next.holdings[lowerId], next.holdings[higherId]] : quotedHoldings;
  const parentStatuses = [lowerId, higherId].map(id => clone(snapshotState.parcelStatus[id]));
  const beforeHash = topologyHash(next.topology);
  next.cash -= quote.fee;
  commitAction(next, {
    type: 'consolidate',
    parcelIds: [lowerId, higherId],
  }, {
    obligation: {
      kind: 'consolidate',
      timing: 'paid',
      parcelIds: [lowerId, higherId],
      cashOut: quote.fee,
      debtTaken: 0,
    },
  });

  next.topology.version += 1;
  const parcelId = nextTopologyParcelId(next, lowerId, higherId);
  next.topology.lineage[parcelId] = {
    parentIds: [lowerId, higherId],
    parentParcels: parcels.map(clone),
    parentStatuses,
    parentHoldings: holdings.map(clone),
    weights: [marketValue(city, snapshotState, lowerId), marketValue(city, snapshotState, higherId)],
    createdAtVersion: next.topology.version,
  };
  for (const retiredId of [lowerId, higherId]) {
    next.topology.tombstones[retiredId] = {
      retiredAtVersion: next.topology.version,
      retiredQuarter: state.quarter,
      successors: [parcelId],
    };
    delete next.topology.parcels[retiredId];
    delete next.holdings[retiredId];
    delete next.parcelStatus[retiredId];
  }
  const parcel = consolidatedParcel(next, parcelId, parcels, holdings);
  next.topology.parcels[parcelId] = parcel;
  const condition = parcel.condition;
  next.holdings[parcelId] = {
    ...clone(holdings[0]),
    owner: 'player',
    level: 0,
    condition,
    archetypeId: holdings[0].archetypeId,
    sector: holdings[0].sector,
    basePrice: holdings[0].basePrice + holdings[1].basePrice,
    baseRent: holdings[0].baseRent + holdings[1].baseRent,
    debt: holdings[0].debt + holdings[1].debt,
    basis: holdings[0].basis + holdings[1].basis,
    acquiredQuarter: Math.max(holdings[0].acquiredQuarter, holdings[1].acquiredQuarter),
    mature: Boolean(holdings[0].mature && holdings[1].mature),
    insurance: null,
    planningCeiling: Math.max(
      holdings[0].planningCeiling,
      holdings[1].planningCeiling,
    ),
    hire: null,
    heritageQualityBp: Math.max(
      holdings[0].heritageQualityBp ?? 0,
      holdings[1].heritageQualityBp ?? 0,
    ),
    redevelopmentNotice: null,
    conditionAssessment: null,
    padSlots: { A: null, B: null },
  };
  next.parcelStatus[parcelId] = topologyStatus(
    condition,
    parentStatuses.map(status => status.conditionVersion),
  );
  next.topology = rebuildTopologyDerivedFields(city, next.topology);
  const afterHash = topologyHash(next.topology);
  return {
    state: next,
    events: [{
      kind: 'consolidate',
      parcelId,
      parcelIds: [lowerId, higherId],
      amount: quote.fee,
      quote,
      assessmentsResolved,
      topologyVersion: next.topology.version,
      topologyHashBefore: beforeHash,
      topologyHashAfter: afterHash,
    }],
  };
}

function validateSubdivision(city, state, parcelId) {
  const unavailable = canSpendAction(state);
  if (unavailable) return { ok: false, reason: unavailable };
  const parcel = activeParcel(city, state, parcelId);
  if (!parcel?.consolidated) {
    return { ok: false, reason: 'Subdivision requires an active consolidated parcel.' };
  }
  const holding = state.holdings[parcelId];
  if (holding?.owner !== 'player') {
    return { ok: false, reason: 'You do not hold this consolidated parcel.' };
  }
  const status = state.parcelStatus[parcelId];
  // Unredeveloped consolidated pads may subdivide regardless of planning ceiling.
  // (Ceiling was previously hard-coded to 2; L1/L3 suburbs still undo a merge.)
  if (!status || status.occupancy !== 'vacant') {
    return { ok: false, reason: 'The consolidated parcel must be vacant.' };
  }
  if (status.damage) return { ok: false, reason: 'A damaged parcel cannot subdivide.' };
  if (holding.conditionAssessment) {
    return { ok: false, reason: 'Condition assessment settles this quarter' };
  }
  if (status.builtLevel !== 0) {
    return { ok: false, reason: 'A redeveloped consolidated parcel cannot subdivide.' };
  }
  if (
    holding.construction
    || holding.renovation
    || holding.redevelopmentNotice
    || holding.hire
    || activeInsurance(holding, state.quarter)
  ) return { ok: false, reason: 'Works, notice, hire or insurance blocks subdivision.' };
  const lineage = state.topology.lineage[parcelId];
  if (!lineage || lineage.parentIds.length !== 2) {
    throw new Error(`Missing two-parent lineage for ${parcelId}.`);
  }
  const quote = subdivideQuote(city, state, parcelId);
  if (!quote.ok) {
    return {
      ok: false,
      reason: `Short $${quote.shortfall.toLocaleString()} against the overdraft floor.`,
    };
  }
  return { ok: true, parcel, holding, status, lineage, quote };
}

function proportionalShares(total, weights) {
  const denominator = weights[0] + weights[1];
  if (denominator <= 0) throw new Error('Topology lineage weights must sum above zero.');
  const first = Math.floor(total * weights[0] / denominator);
  return [first, total - first];
}

function doSubdivide(city, state, action) {
  const pendingRoomReason = pendingRoomReplacementReason(state, action.parcelId);
  if (pendingRoomReason) return reject(state, pendingRoomReason);
  const validation = validateSubdivision(city, state, action.parcelId);
  if (!validation.ok) return reject(state, validation.reason);
  const {
    holding, status, lineage, quote,
  } = validation;
  const parentIds = [...lineage.parentIds];
  const debtShares = proportionalShares(holding.debt, lineage.weights);
  const basisShares = proportionalShares(holding.basis, lineage.weights);
  const clearedAtSubdivision = Boolean(holding.siteCleared);
  const next = clone(state);
  const beforeHash = topologyHash(next.topology);
  next.cash -= quote.fee;
  commitAction(next, {
    type: 'subdivide',
    parcelId: action.parcelId,
  }, {
    obligation: {
      kind: 'subdivide',
      timing: 'paid',
      parcelId: action.parcelId,
      cashOut: quote.fee,
      debtTaken: 0,
    },
  });

  next.topology.version += 1;
  delete next.topology.parcels[action.parcelId];
  delete next.holdings[action.parcelId];
  delete next.parcelStatus[action.parcelId];
  next.topology.tombstones[action.parcelId] = {
    retiredAtVersion: next.topology.version,
    retiredQuarter: state.quarter,
    successors: [...parentIds],
  };
  parentIds.forEach((parentId, index) => {
    next.topology.parcels[parentId] = clone(lineage.parentParcels[index]);
    const savedHolding = clone(lineage.parentHoldings[index]);
    const restoredHolding = {
      ...savedHolding,
      owner: holding.owner,
      condition: status.condition,
      debt: debtShares[index],
      basis: basisShares[index],
      planningCeiling: savedHolding.planningCeiling,
      mature: savedHolding.mature,
      construction: null,
      renovation: null,
      redevelopmentNotice: null,
      hire: null,
      insurance: null,
      conditionAssessment: null,
    };
    if (clearedAtSubdivision) {
      restoredHolding.siteCleared = true;
      delete restoredHolding.demolition;
    }
    next.holdings[parentId] = restoredHolding;
    const restoredStatus = {
      ...clone(lineage.parentStatuses[index]),
      condition: status.condition,
      damage: null,
      occupancy: 'vacant',
      tenant: null,
      squatterSinceQuarter: null,
      askingOverride: null,
      askingOverrideUntil: 0,
      surveyedConditionVersion: null,
    };
    if (clearedAtSubdivision) {
      restoredStatus.builtArchetypeId = null;
      restoredStatus.builtLandUseId = null;
      restoredStatus.builtLevel = 0;
    }
    next.parcelStatus[parentId] = restoredStatus;
    if (clearedAtSubdivision) resetRoomGeneration(next, parentId, false);
    else restoreParentRoomBase(next, parentId, savedHolding);
  });
  next.topology = rebuildTopologyDerivedFields(city, next.topology);
  const afterHash = topologyHash(next.topology);
  return {
    state: next,
    events: [{
      kind: 'subdivide',
      parcelId: action.parcelId,
      parcelIds: parentIds,
      amount: quote.fee,
      quote,
      topologyVersion: next.topology.version,
      topologyHashBefore: beforeHash,
      topologyHashAfter: afterHash,
    }],
  };
}

function doPlantBreak(city, state, action) {
  const id = action.parcelId;
  const holding = state.holdings[id];
  if (!holding?.construction) return reject(state, 'No works on that parcel.');
  if (holding.construction.accidentOccurred) {
    return reject(state, 'That plant is already written off.');
  }
  if (holding.construction.completionQuarter <= state.quarter) {
    return reject(state, 'Works are already completing.');
  }
  const next = clone(state);
  const live = next.holdings[id];
  const job = live.construction;
  delayWorksJob(live, job.slot ?? null, job, {
    completionQuarter: job.completionQuarter + 1,
    accidentOccurred: true,
    accidentQuarter: next.quarter,
  });
  commitAction(next, { type: 'plant-break', parcelId: id }, { costsAction: false });
  return {
    state: next,
    events: [{
      kind: 'plant-break',
      parcelId: id,
      delayQuarters: 1,
      completionQuarter: next.holdings[id].construction.completionQuarter,
    }],
  };
}

function doHold(city, state, action = {}) {
  if (state.phase !== 'play') return reject(state, 'The run is over.');
  if (state.actionsRemaining <= 0) return reject(state, 'No actions left this quarter.');
  const bankRequested = action.bankRequested !== false;
  if (bankRequested && state.banked >= RULES.maxBankedActions && action.reason !== 'deadline') {
    return reject(state, `Only ${RULES.maxBankedActions} action can be banked at a time.`);
  }
  const next = clone(state);
  if (bankRequested && next.banked < RULES.maxBankedActions) next.banked += 1;
  commitAction(next, {
    type: 'hold',
    reason: action.reason ?? 'chosen',
    bankRequested,
  });
  return {
    state: next,
    events: [{ kind: 'hold', banked: next.banked, bankRequested }],
  };
}

// --- Settlement --------------------------------------------------------------

function applyForcedSaleStep(city, next) {
  const transactions = [];
  let terminal = false;
  for (const owner of ['player', 'rival']) {
    const prepared = resolveForcedSaleAssessments(city, next, owner);
    const resolution = prepared.resolution;
    if (!resolution) continue;
    transactions.push(...prepared.transactions);
    const credit = next.creditByOwner[owner];
    if (resolution.kind === 'forced-sale-averted') {
      credit.forcedSaleDueQuarter = null;
      credit.breachedQuarter = null;
      transactions.push({
        kind: 'forced-sale-averted',
        owner,
        parcelId: null,
        cashOut: 0,
        debtCleared: 0,
        overdraftFloor: resolution.overdraftFloor,
      });
      continue;
    }
    if (resolution.parcelId) {
      if (owner === 'player') next.cash += resolution.quote.proceeds;
      else next.rival.cash += resolution.quote.proceeds;
      const holding = next.holdings[resolution.parcelId];
      recordBuiltFormOnExit(city, next, resolution.parcelId, holding);
      delete next.holdings[resolution.parcelId];
    }
    transactions.push({
      kind: 'forced-sale',
      owner,
      parcelId: resolution.parcelId,
      proceeds: resolution.quote?.proceeds ?? 0,
      debtCleared: resolution.quote?.debtCleared ?? 0,
      cashOut: -(resolution.quote?.proceeds ?? 0),
      surrender: resolution.quote?.surrender ?? false,
      overdraftFloor: resolution.overdraftFloor,
      insolvent: resolution.insolvent,
    });
    credit.insolvent = resolution.insolvent;
    if (resolution.insolvent) {
      if (owner === 'player') {
        next.phase = 'result';
        next.grade = 'INSOLVENT';
        next.actionsRemaining = 0;
        next.banked = 0;
        terminal = true;
        break;
      }
    } else {
      credit.forcedSaleDueQuarter = null;
      credit.breachedQuarter = null;
    }
  }
  const checkpoint = assertMutationCheckpoint(city, next, '0 forced sale');
  return { transactions, checkpoint, terminal };
}

function assertMutationCheckpoint(city, state, label, holdingIds = null) {
  for (const [name, value] of [
    ['player cash', state.cash],
    ['rival cash', state.rival.cash],
    ...Object.keys(state.holdings).sort()
      .map((id) => [`${id} debt`, state.holdings[id].debt]),
  ]) {
    if (!Number.isInteger(value)) throw new Error(`${label}: ${name} is not integer`);
  }
  if (holdingIds) {
    const actual = Object.keys(state.holdings).sort();
    if (JSON.stringify(actual) !== JSON.stringify([...holdingIds].sort())) {
      throw new Error(`${label}: holding identity changed outside an acquisition slot`);
    }
  }
  for (const owner of ['player', 'rival']) {
    const cash = owner === 'player' ? state.cash : state.rival.cash;
    // NAV = cash + property portfolio + listed market book − debt (Stock Exchange book is real NAV).
    const independent = cash
      + portfolioValue(city, state, owner)
      + listedBookValue(state, owner)
      - debtOf(state, owner);
    if (independent !== navOf(city, state, owner)) {
      throw new Error(`${label}: ${owner} NAV identity failed`);
    }
  }
  return {
    label,
    nav: navOf(city, state, 'player'),
    rivalNav: navOf(city, state, 'rival'),
  };
}

/**
 * Event-driven typology / sector shocks (REIV-style relative moves).
 * Residential, industrial (factory/warehouse), office/retail respond differently.
 */
function typologyEventShockBp(next, sector) {
  let shock = 0;
  if (activeEvent(next, 'materials-spike', next.quarter)) {
    // Build cost stress: industrial land softens; finished residential less so.
    if (sector === 'industrial') shock -= 220;
    else if (sector === 'office') shock -= 80;
    else if (sector === 'residential') shock -= 40;
    else if (sector === 'retail') shock -= 60;
  }
  if (activeEvent(next, 'interest-shock', next.quarter)) {
    // Rate stress hits leverage-sensitive residential & office hardest.
    if (sector === 'residential') shock -= 180;
    else if (sector === 'office') shock -= 200;
    else if (sector === 'retail') shock -= 120;
    else if (sector === 'industrial') shock -= 90;
  }
  if (activeEvent(next, 'flash-flood', next.quarter)) {
    // Low-lying risk already parcel-level; sector drift is mild portfolio scare.
    if (sector === 'residential') shock -= 60;
    else if (sector === 'industrial') shock -= 40;
  }
  if (activeEvent(next, 'downturn', next.quarter)) {
    // Broad cut is already RULES.eventDownturnBp; add mild industrial lag recovery.
    if (sector === 'industrial') shock += 40;
  }
  return shock;
}

function applyMarketStep(city, next) {
  const row = city.market.find((r) => r.quarter === next.quarter);
  const downturn = activeEvent(next, 'downturn', next.quarter);
  const moves = {};
  for (const sector of SECTOR_IDS) {
    const authoredBp = row ? row.sectors[sector].realisedBp : 0;
    const typologyBp = typologyEventShockBp(next, sector);
    const realisedBp = authoredBp + (downturn ? RULES.eventDownturnBp : 0) + typologyBp;
    const before = next.sectors[sector];
    const after = Math.max(RULES.sectorFloorBp, applyBp(before, 10000 + realisedBp));
    next.sectors[sector] = after;
    moves[sector] = {
      authoredBp,
      realisedBp,
      typologyBp,
      forecastBp: row ? row.sectors[sector].forecastBp : 0,
      indexAfter: after,
    };
  }
  applyInflationStep(next);
  return moves;
}

function applyDistrictDriftStep(city, next) {
  const moves = {};
  const quarterIndex = next.quarter - 1;
  for (const districtId of Object.keys(city.districtDriftPlan).sort()) {
    const plan = city.districtDriftPlan[districtId];
    const realisedBp = plan.realisedByQuarterBp[quarterIndex] ?? 0;
    const scaledRealisedBp = applyBp(realisedBp, RULES.districtDriftScaleBp);
    const before = next.districtIndexBp[districtId];
    const after = applyBp(before, 10000 + scaledRealisedBp);
    next.districtIndexBp[districtId] = after;
    moves[districtId] = {
      forecastBp: plan.forecastBp,
      realisedBp,
      scaledRealisedBp,
      indexAfter: after,
    };
  }
  // Last-sale asking anchors ride the same drift: a $50m divest re-lists at $50m and
  // moves with the district each settle until someone buys it (V3.39).
  for (const parcelId of Object.keys(next.parcelStatus).sort()) {
    const status = next.parcelStatus[parcelId];
    const anchor = status?.lastSale;
    if (!anchor || !Number.isFinite(anchor.price) || next.holdings[parcelId]) continue;
    const districtId = city.parcels[parcelId]?.districtId
      ?? next.topology?.lineage?.[parcelId]?.parentParcels?.[0]?.districtId;
    const move = districtId ? moves[districtId] : null;
    if (move) {
      anchor.price = Math.max(1, applyBp(anchor.price, 10000 + move.scaledRealisedBp));
    }
  }
  return moves;
}

function createAuctionHolding(city, next, parcelId, owner, salePrice, debtTaken) {
  const completed = completedBaseForStatus(city, next, parcelId);
  const archetypeId = archetypeIdOf(city, next, parcelId);
  next.holdings[parcelId] = {
    owner,
    level: next.parcelStatus[parcelId].builtLevel,
    condition: next.parcelStatus[parcelId].condition,
    archetypeId,
    sector: completed.sector,
    basePrice: completed.basePrice,
    baseRent: completed.baseRent,
    debt: debtTaken,
    basis: salePrice,
    acquiredQuarter: next.quarter,
    mature: false,
    conditionAssessment: conditionAssessmentForAcquisition(
      city,
      next,
      parcelId,
      next.actionOrdinal,
    ),
    ...holdingDefaultsForState(city, next, parcelId),
  };
}

function applyAuctionStep(city, next) {
  const event = auctionResolving(next);
  if (!event) return [];
  const resolution = auctionResolution(next, event);
  const seatAuction = next.auctionSeatVersion === 2;
  const parcelId = event.anchorIds[0];
  let transaction;
  if (resolution.outcome === 'passed-in') {
    next.parcelStatus[parcelId].askingOverride = resolution.askingOverride;
    next.parcelStatus[parcelId].askingOverrideUntil = event.resolveQuarter + 1;
    transaction = {
      kind: 'auction',
      eventId: event.id,
      parcelId,
      outcome: 'passed-in',
      salePrice: null,
      duty: 0,
      debtTaken: 0,
      cashOut: 0,
      winner: null,
      ...(seatAuction ? { winnerSeatId: null } : {}),
    };
  } else {
    if (ownerOf(next, parcelId)) {
      throw new Error(`Auction ${event.id} parcel was acquired outside step 2a`);
    }
    const commitment = resolution.winner === 'player'
      ? event.playerCommitment
      : event.rivalCommitment;
    if (seatAuction && (commitment?.seatId !== resolution.winnerSeatId
      || resolution.winner !== (resolution.winnerSeatId === 'P1' ? 'player' : 'rival'))) {
      throw new Error('Seat auction winner does not match its commitment.');
    }
    const lvrBp = commitment?.lvrBp ?? (
      resolution.winner === 'player' ? activeLvrBp(next) : RULES.lvrBp
    );
    const debtTaken = applyBp(resolution.salePrice, lvrBp);
    const duty = applyBp(resolution.salePrice, RULES.dutyBp);
    const cashOut = resolution.salePrice - debtTaken + duty;
    if (resolution.winner === 'player') next.cash -= cashOut;
    else next.rival.cash -= cashOut;
    createAuctionHolding(
      city,
      next,
      parcelId,
      resolution.winner,
      resolution.salePrice,
      debtTaken,
    );
    if (seatAuction) next.holdings[parcelId].ownerSeatId = resolution.winnerSeatId;
    transaction = {
      kind: 'auction',
      eventId: event.id,
      parcelId,
      outcome: 'sold',
      salePrice: resolution.salePrice,
      duty,
      debtTaken,
      cashOut,
      winner: resolution.winner,
      ...(seatAuction ? { winnerSeatId: resolution.winnerSeatId } : {}),
    };
  }
  next.events.byId[event.id] = {
    ...next.events.byId[event.id],
    status: 'resolved',
    outcome: {
      ...resolution,
      entries: resolution.entries.map((entry) => ({ ...entry })),
    },
  };
  return [transaction];
}

function cancelAuctionForInsolvency(next) {
  const event = auctionResolving(next);
  if (!event) return [];
  const parcelId = event.anchorIds[0];
  const transaction = {
    kind: 'auction',
    eventId: event.id,
    parcelId,
    outcome: 'voided-by-insolvency',
    salePrice: null,
    duty: 0,
    debtTaken: 0,
    cashOut: 0,
    winner: null,
  };
  next.events.byId[event.id] = {
    ...event,
    status: 'cancelled',
    playerCommitment: null,
    rivalCommitment: null,
    outcome: {
      outcome: 'voided-by-insolvency',
      winner: null,
      salePrice: null,
      entries: [],
    },
  };
  return [transaction];
}

function coveredFor(holding, hazard, quarter) {
  return Boolean(holding?.owner)
    && holding.insurance?.[hazard]
    && holding.insurance.expiresAfterQuarter >= quarter;
}

function applyHazard(
  city,
  next,
  event,
  hazard,
  propertyEvents,
  dueObligations,
  bindingPlayerPreview = null,
) {
  const eventParcelIds = hazard === 'flood'
    ? Object.keys(event.payload.exposures ?? {}).sort()
      .filter((id) => event.payload.exposures[id].hit)
    : [...event.anchorIds].sort();
  const parcelIds = [...new Set(eventParcelIds
    .map((id) => resolveCurrentParcelId(city, next, id) ?? id))]
    .filter((id) => next.parcelStatus[id])
    .sort();
  for (const parcelId of parcelIds) {
    const holding = next.holdings[parcelId];
    const beforeValue = marketValue(city, next, parcelId);
    if (coveredFor(holding, hazard, next.quarter)) {
      // The player's settlement preview is a binding quote made before Petridis moves.
      // A same-settle rival redevelopment can alter adjacency value, but it cannot reprice
      // an already-disclosed insurance deductible between the preview and the charge.
      const quotedDeductible = holding.owner === 'player'
        ? bindingPlayerPreview?.obligations?.find((item) =>
          item.kind === 'deductible'
          && item.eventId === event.id
          && item.parcelId === parcelId
          && item.hazard === hazard)?.cashOut
        : null;
      const deductible = quotedDeductible ?? insuranceDeductible(beforeValue);
      if (holding.owner === 'player') next.cash -= deductible;
      else next.rival.cash -= deductible;
      dueObligations.push({
        kind: 'deductible',
        timing: 'due',
        eventId: event.id,
        parcelId,
        hazard,
        owner: holding.owner,
        cashOut: deductible,
        debtTaken: 0,
      });
      propertyEvents.push({ eventId: event.id, parcelId, hazard, insured: true, deductible });
      continue;
    }
    if (holding?.construction || livePadWorksJobs(holding).length) {
      for (const { slot, construction: job } of livePadWorksJobs(holding)) {
        delayWorksJob(holding, slot, job, {
          completionQuarter: job.completionQuarter + 1,
        });
      }
      propertyEvents.push({ eventId: event.id, parcelId, hazard, insured: false, delayed: true });
      continue;
    }
    const current = holding?.condition ?? next.parcelStatus[parcelId].condition;
    const condition = Math.max(0, current - 1);
    next.parcelStatus[parcelId].condition = condition;
    next.parcelStatus[parcelId].damage = hazard;
    next.parcelStatus[parcelId].conditionVersion += 1;
    if (holding) holding.condition = condition;
    propertyEvents.push({ eventId: event.id, parcelId, hazard, insured: false, condition });
  }
}

function applyPropertyEventStep(city, next, bindingPlayerPreview = null) {
  const propertyEvents = [];
  const dueObligations = [];
  for (const event of eventsResolving(next)) {
    if (event.type === 'flash-flood') {
      applyHazard(
        city,
        next,
        event,
        'flood',
        propertyEvents,
        dueObligations,
        bindingPlayerPreview,
      );
    } else if (event.type === 'fire') {
      applyHazard(
        city,
        next,
        event,
        'fire',
        propertyEvents,
        dueObligations,
        bindingPlayerPreview,
      );
      if (event.payload?.source === 'bushfire') {
        const insured = propertyEvents.some((row) => (
          row.eventId === event.id && row.insured === true
        ));
        if (insured) {
          const parcelId = event.payload.parcelId ?? event.anchorIds[0];
          next.weather = markBushfireRepaired(weatherOf(next), parcelId, next.quarter);
        }
      }
    } else if (event.type === 'tenant-arrears') {
      const parcelId = resolveCurrentParcelId(city, next, event.anchorIds[0])
        ?? event.anchorIds[0];
      const tenant = next.parcelStatus[parcelId]?.tenant;
      if (tenant) tenant.paymentAtRisk = true;
      propertyEvents.push({ eventId: event.id, parcelId, arrears: true });
    }
    if (['flash-flood', 'fire', 'tenant-arrears'].includes(event.type)) {
      next.events.byId[event.id] = {
        ...next.events.byId[event.id],
        status: 'resolved',
        outcome: propertyEvents.filter(({ eventId }) => eventId === event.id),
      };
    }
  }
  return { propertyEvents, dueObligations };
}

function applyPeopleOutcomeStep(city, next) {
  const outcomes = [];
  const byId = structuredClone(next.people.byId);
  for (const personId of [...next.people.order].sort()) {
    const person = byId[personId];
    if (
      person.pendingOutcome?.kind === 'occupation'
      && person.pendingOutcome.status === 'pending'
    ) {
      const parcelId = resolveCurrentParcelId(
        city,
        next,
        person.pendingOutcome.parcelId,
      ) ?? person.pendingOutcome.parcelId;
      const status = next.parcelStatus[parcelId];
      if (status && status.occupancy !== 'squatted') {
        status.occupancy = 'squatted';
        status.tenant = null;
        status.squatterSinceQuarter = next.quarter;
      }
      person.pendingOutcome = { ...person.pendingOutcome, status: 'resolved' };
      outcomes.push({ kind: 'occupation', personId, parcelId });
    }
  }
  next.people = { order: [...next.people.order], byId };
  next.blockDemandBp = humanDemandByBlock(city, next);
  for (const parcelId of Object.keys(next.parcelStatus).sort()) {
    const tenant = next.parcelStatus[parcelId].tenant;
    if (
      tenant?.quality === 'stretch'
      && tenant.paymentAtRisk
      && activeParcel(city, next, parcelId).sector === 'residential'
    ) {
      const parcel = activeParcel(city, next, parcelId);
      const blockId = `${parcel.bx},${parcel.bz}`;
      next.blockDemandBp[blockId] = Math.max(
        -RULES.peopleDemandClampBp,
        next.blockDemandBp[blockId] - 20,
      );
    }
  }
  return outcomes;
}

function applyConditionAssessmentStep(city, next) {
  const transactions = [];
  for (const parcelId of Object.keys(next.holdings).sort()) {
    const transaction = resolveConditionAssessment(city, next, parcelId);
    if (transaction) transactions.push(transaction);
  }
  return transactions;
}

function settleOwner(city, next, owner) {
  if (next.creditByOwner[owner].insolvent) {
    return {
      rent: 0,
      opex: 0,
      interest: 0,
      overdraft: 0,
      overdraftInterest: 0,
      negativePrincipal: Math.max(0, -(owner === 'player' ? next.cash : next.rival.cash)),
      net: 0,
      interestBp: activeInterestRateBp(next, owner),
      debtAtInterest: debtOf(next, owner),
    };
  }
  const rent = grossRent(city, next, owner);
  const opex = applyBp(rent, RULES.opexBp) + ventureCashburnForOwner(next, owner);
  const interestBp = activeInterestRateBp(next, owner);
  const debtAtInterest = debtOf(next, owner);
  const interest = applyBp(debtAtInterest, interestBp);
  const forecourt = petrolForecourtForOwner(city, next, owner);
  const cashBefore = owner === 'player' ? next.cash : next.rival.cash;
  const business = cybercabForOwner(next, owner);
  const cybercab = business ? settleCybercab(business, { seed: next.seed, quarter: next.quarter }) : null;
  if (cybercab) {
    if (owner === 'player') next.cybercab = cybercab.state;
    else next.cybercabBySeat.P2 = cybercab.state;
    next.events = postCybercabIncidents(next.events, cybercab.events, cybercab.state.depot);
    next.log.push(...cybercab.events.filter(row => row.kind === 'cybercab-import-arrival'));
  }
  const cybercabNet = cybercab?.cashDelta ?? 0;
  const cashAfterDebtInterest = cashBefore + rent - opex - interest + forecourt.amount + cybercabNet;
  const {
    negativePrincipal,
    overdraftInterest,
    cashAfterOverdraft,
  } = overdraftCharge(next, cashAfterDebtInterest);
  const net = rent - opex - interest - overdraftInterest + forecourt.amount + cybercabNet;
  if (owner === 'player') next.cash = cashAfterOverdraft;
  else next.rival.cash = cashAfterOverdraft;
  return {
    rent,
    opex,
    interest,
    overdraft: overdraftInterest,
    overdraftInterest,
    negativePrincipal,
    net,
    interestBp,
    debtAtInterest,
    forecourt: forecourt.amount,
    forecourtCars: forecourt.cars,
    forecourtLines: forecourt.rows,
    cybercabIncome: cybercab?.fares ?? 0,
    cybercabCosts: cybercab?.costs ?? 0,
    cybercabPaidCosts: cybercab?.paidCosts ?? 0,
    cybercabNet,
  };
}

function resolveRemainingEvents(next) {
  for (const event of eventsResolving(next)) {
    next.events.byId[event.id] = {
      ...next.events.byId[event.id],
      status: 'resolved',
      outcome: next.events.byId[event.id].outcome ?? { applied: true },
    };
  }
}

function writeWorksJob(holding, slot, job) {
  if (slot) {
    const current = holding.padSlots?.[slot] ?? {};
    holding.padSlots = {
      ...padSlotRecord(holding),
      [slot]: { ...current, status: current.status ?? 'works', works: job },
    };
  }
  holding.construction = primaryLiveWorksJob(holding) ?? job ?? null;
  if (!holding.construction) delete holding.construction;
}

function delayWorksJob(holding, slot, job, extra) {
  const nextJob = Object.freeze({ ...job, ...extra });
  writeWorksJob(holding, slot ?? job.slot ?? null, nextJob);
  return nextJob;
}

function rollConstructionAccidents(city, next) {
  const accidents = [];
  for (const id of Object.keys(next.holdings).sort()) {
    const holding = next.holdings[id];
    const jobs = livePadWorksJobs(holding);
    if (!jobs.length) continue;
    for (const { slot, construction: job } of jobs) {
      if (!job || job.accidentOccurred) continue;
      // Accidents only while works are still open (not already completing this settle).
      if (job.completionQuarter <= next.quarter) continue;
      const streamKey = slot
        ? `construction-accident:${id}:${slot}:q${next.quarter}:s${job.startedQuarter}`
        : `construction-accident:${id}:q${next.quarter}:s${job.startedQuarter}`;
      const roll = stream(next.seed, streamKey).int(0, 9999);
      if (roll >= CONSTRUCTION_ACCIDENT_CHANCE_BP) continue;
      const delayed = delayWorksJob(holding, slot, job, {
        completionQuarter: job.completionQuarter + 1,
        accidentOccurred: true,
        accidentQuarter: next.quarter,
      });
      accidents.push({
        kind: 'construction-accident',
        parcelId: id,
        slot: slot ?? null,
        delayQuarters: 1,
        completionQuarter: delayed.completionQuarter,
        owner: holding.owner,
        toArchetype: job.toArchetype,
      });
    }
  }
  return accidents;
}

function finishConstructionJob(city, next, id, holding, job, slot) {
  const target = job.toArchetype;
  const targetLandUse = job.toLandUseId ?? target;
  const parcel = activeParcel(city, next, id);
  const defect = job.defectRoll < job.defectChanceBp;
  const completedCondition = defect ? RULES.maxCondition - 1 : RULES.maxCondition;
  const slotParcel = slot ? slotEconomicsParcel(city, next, id, slot) : null;
  const completed = buildingBaseFor(slotParcel ?? parcel, target, completedCondition, {
    parcelStatus: next.parcelStatus[id],
  });
  const baseRent = operatingBaseRent(target, completed.baseRent);
  holding.condition = completedCondition;
  holding.level = job.nextLevel;
  if (slot) {
    const tileId = holding.padSlots?.[slot]?.tileId ?? null;
    holding.padSlots = {
      ...padSlotRecord(holding),
      [slot]: {
        ...(holding.padSlots?.[slot] ?? {}),
        catalogId: holding.padSlots?.[slot]?.catalogId ?? targetLandUse,
        archetypeId: target,
        tileId,
        status: 'standing',
        works: null,
        basePrice: completed.basePrice,
        baseRent,
        level: job.nextLevel,
      },
    };
    syncDualPadIdentity(holding, next.parcelStatus[id]);
  } else {
    resetRoomGeneration(next, id, true);
    holding.archetypeId = target;
    holding.landUseId = targetLandUse;
    holding.sector = completed.sector;
    holding.basePrice = completed.basePrice;
    holding.baseRent = baseRent;
    if (holding.padSlots?.A?.whole) {
      holding.padSlots = {
        A: { ...holding.padSlots.A, status: 'standing', archetypeId: target, works: null },
        B: { ...holding.padSlots.B, status: 'standing', archetypeId: target, works: null },
      };
    }
    next.parcelStatus[id].builtArchetypeId = target;
    next.parcelStatus[id].builtLandUseId = targetLandUse;
    next.parcelStatus[id].builtLevel = job.nextLevel;
  }
  if (isDataCentreArchetype(target) && !holding.ipoMarketCap) {
    holding.ipoMarketCap = rollDataCentreIpoMarketCap(next.seed, id);
  }
  next.parcelStatus[id].condition = completedCondition;
  next.parcelStatus[id].damage = null;
  next.parcelStatus[id].conditionVersion += 1;
  const serviceUse = isFranchiseTenancyUse(target);
  if (isDataCentreArchetype(target) || target === 'warehouse-converted') {
    const quality = isDataCentreArchetype(target) ? 'secure' : 'standard';
    const terms = TENANT_TERMS[quality];
    next.parcelStatus[id].occupancy = 'tenant';
    next.parcelStatus[id].tenant = {
      quality,
      rentBp: terms.rentBp,
      arrearsChanceBp: terms.arrearsChanceBp,
      expiresAfterQuarter: (next.quarters ?? RULES.quarters) + 8,
      paymentAtRisk: false,
    };
  } else if (serviceUse && standingPadSlotCount(holding) <= 1) {
    next.parcelStatus[id].occupancy = 'vacant';
    next.parcelStatus[id].tenant = null;
    next.parcelStatus[id].squatterSinceQuarter = null;
  }
  return {
    parcelId: id,
    slot: slot ?? null,
    archetypeId: target,
    sector: holding.sector,
    condition: completedCondition,
    defect,
    owner: holding.owner,
  };
}

function completeWorks(city, next) {
  const renovationCompletions = [];
  const completions = [];
  const noticeConversions = [];
  const constructionAccidents = rollConstructionAccidents(city, next);
  for (const id of Object.keys(next.holdings).sort()) {
    const holding = next.holdings[id];
    if (holding.redevelopmentNotice) {
      const notice = holding.redevelopmentNotice;
      const status = next.parcelStatus[id];
      const eligibleQuarter = notice.startsQuarter ?? ((notice.chosenQuarter ?? next.quarter) + 1);
      // Serving in Q1 leaves the tenant through the Q1 settle and one entire Q2.
      // The Q2 settle (which opens Q3) enacts vacancy; works still need Redevelop.
      if (status?.occupancy === 'tenant' && next.quarter >= eligibleQuarter) {
        status.occupancy = 'vacant';
        status.tenant = null;
        status.squatterSinceQuarter = null;
        noticeConversions.push({
          kind: 'tenant-notice-vacated',
          parcelId: id,
          startsQuarter: notice.startsQuarter,
          vacantQuarter: next.quarter + 1,
          owner: holding.owner,
        });
        holding.redevelopmentNotice = null;
      }
    }
    if (holding.renovation?.startedQuarter < next.quarter) {
      const target = holding.renovation.nextCondition;
      const beforeCondition = holding.condition;
      const defect = holding.renovation.defectRoll < holding.renovation.defectChanceBp;
      const completedCondition = defect ? Math.max(beforeCondition, target - 1) : target;
      const rebased = renovateBase(
        holding.basePrice,
        holding.baseRent,
        beforeCondition,
        completedCondition,
      );
      holding.condition = completedCondition;
      holding.basePrice = rebased.basePrice;
      holding.baseRent = rebased.baseRent;
      if (holding.renovation.defectChanceBp === 0) {
        holding.heritageQualityBp = Math.min(
          500,
          holding.heritageQualityBp + RULES.architectHeritageValueBp,
        );
      }
      next.parcelStatus[id].condition = completedCondition;
      next.parcelStatus[id].damage = null;
      next.parcelStatus[id].conditionVersion += 1;
      delete holding.renovation;
      renovationCompletions.push({
        parcelId: id,
        condition: completedCondition,
        defect,
        owner: holding.owner,
      });
    }
    // Concurrent room upgrades: complete every job due this settle; leave others running.
    {
      const jobs = roomJobs(holding);
      if (isRoomEconomyV2(next)) {
        jobs.sort((a, b) => a.completionQuarter - b.completionQuarter
          || ROOM_IDS.indexOf(a.roomId) - ROOM_IDS.indexOf(b.roomId));
      }
      if (jobs.length) {
        const remaining = [];
        ensureRoomState(city, next, id);
        for (const job of jobs) {
          if (job.completionQuarter <= next.quarter) {
            applyRoomRenovationComplete(holding, next.parcelStatus[id], job);
            renovationCompletions.push({
              parcelId: id,
              roomId: job.roomId,
              finish: job.finish,
              valueAdd: job.valueAdd,
              owner: holding.owner,
              kind: 'room',
            });
          } else {
            remaining.push(job);
          }
        }
        setRoomJobs(holding, remaining);
      }
    }
    const dueJobs = duePadWorksJobs(holding, next.quarter);
    if (!dueJobs.length) continue;
    for (const { slot, construction: job } of dueJobs) {
      completions.push(finishConstructionJob(city, next, id, holding, job, slot));
    }
    const stillWorks = ['A', 'B']
      .map((key) => holding.padSlots?.[key])
      .filter((rec) => rec?.status === 'works' && rec.works)
      .map((rec) => rec.works);
    if (stillWorks.length) holding.construction = stillWorks[0];
    else delete holding.construction;
  }
  return { renovationCompletions, completions, noticeConversions, constructionAccidents };
}

function matureHoldings(next) {
  for (const id of Object.keys(next.holdings).sort()) {
    const holding = next.holdings[id];
    if (holding.acquiredQuarter < next.quarter) holding.mature = true;
  }
}

function projectSettlement(city, state, {
  includeRival = state.mode !== 'hotseat' && !state.quarterCommit?.policyResolved,
  bindingPlayerPreview = null,
} = {}) {
  const next = clone(state);
  const forcedSale = applyForcedSaleStep(city, next);
  if (forcedSale.terminal) {
    const auctionTransactions = [
      ...forcedSale.transactions,
      ...cancelAuctionForInsolvency(next),
    ];
    const playerLines = settleOwner(city, next, 'player');
    const rivalLines = settleOwner(city, next, 'rival');
    return {
      next,
      moves: {},
      districtMoves: {},
      blockMoves: {},
      rivalMove: { moved: false, moves: [], text: 'settlement stopped at insolvency' },
      auctionTransactions,
      propertyEvents: [],
      peopleOutcomes: [],
      conditionAssessments: [],
      dueObligations: [],
      playerLines,
      rivalLines,
      renovationCompletions: [],
      completions: [],
      noticeConversions: [],
      constructionAccidents: [],
      checkpoints: [forcedSale.checkpoint],
      terminal: true,
    };
  }
  const moves = applyMarketStep(city, next);
  const districtMoves = applyDistrictDriftStep(city, next);
  const blockMoves = applyFamilySignalValueDrift(city, next);
  const rivalMove = includeRival ? rivalAct(city, next) : { moved: false, moves: [] };
  const auctionTransactions = [
    ...forcedSale.transactions,
    ...applyAuctionStep(city, next),
  ];
  const afterAuctionIds = Object.keys(next.holdings).sort();
  const auctionCheckpoint = assertMutationCheckpoint(city, next, '2a auctions');
  const { propertyEvents, dueObligations } = applyPropertyEventStep(
    city,
    next,
    bindingPlayerPreview,
  );
  const propertyCheckpoint = assertMutationCheckpoint(
    city,
    next,
    '2b property events',
    afterAuctionIds,
  );
  const peopleOutcomes = applyPeopleOutcomeStep(city, next);
  const peopleCheckpoint = assertMutationCheckpoint(
    city,
    next,
    '2c people outcomes',
    afterAuctionIds,
  );
  const ventureEvents = applyVentureStep(next);
  const conditionAssessments = applyConditionAssessmentStep(city, next);
  const conditionAssessmentCheckpoint = assertMutationCheckpoint(
    city,
    next,
    '2d unsurveyed condition assessments',
    afterAuctionIds,
  );
  const playerLines = settleOwner(city, next, 'player');
  const rivalLines = settleOwner(city, next, 'rival');
  resolveRemainingEvents(next);
  return {
    next,
    moves,
    districtMoves,
    blockMoves,
    rivalMove,
    auctionTransactions,
    propertyEvents: [...propertyEvents, ...ventureEvents],
    peopleOutcomes,
    conditionAssessments,
    dueObligations,
    playerLines,
    rivalLines,
    checkpoints: [
      forcedSale.checkpoint,
      auctionCheckpoint,
      propertyCheckpoint,
      peopleCheckpoint,
      conditionAssessmentCheckpoint,
    ],
    terminal: false,
  };
}

export function settlementPreview(city, state, owner = 'player') {
  return obligationPreview(city, state, owner);
}

function expireAndScheduleNext(city, next, state, { sectorMoves = null } = {}) {
  for (const id of Object.keys(next.parcelStatus).sort()) {
    const tenant = next.parcelStatus[id].tenant;
    if (tenant) tenant.paymentAtRisk = false;
  }
  if (state.quarter < state.quarters) {
    const nextQuarter = state.quarter + 1;
    // Listed markets reprice into the new quarter — macro-linked to events + property pulse.
    if (next.markets) {
      const macro = marketMacroFromState(state, {
        sectorMoves,
        resolvingQuarter: state.quarter,
      });
      const dividends = payDividends(next, 'player');
      if (dividends.cash > 0) next.cash += dividends.cash;
      next.markets = {
        ...ensureMarketsShape(next.markets, next.seed),
        priorPrices: { ...next.markets.prices },
        prices: repriceMarkets(
          next.seed,
          nextQuarter,
          next.markets.prices,
          macro,
          next.markets.listings ?? [],
        ),
        lastMacro: macro,
        lastDividends: dividends,
        lastNarrative: quarterNarrative(next.seed, nextQuarter),
      };
      next.orderFillEvents = resolveWorkingOrders(next, state.quarter);
      for (const fill of next.orderFillEvents ?? []) {
        if (fill.side === 'sell') releaseListedParcelIfExited(next, fill.assetId);
      }
    }
    for (const id of Object.keys(next.holdings).sort()) {
      const holding = next.holdings[id];
      if (holding.hires && typeof holding.hires === 'object') {
        for (const profession of Object.keys(holding.hires)) {
          const c = holding.hires[profession];
          if (!c || c.expiresAfterQuarter < nextQuarter) delete holding.hires[profession];
        }
        writeHires(holding, holding.hires);
      } else if (holding.hire && holding.hire.expiresAfterQuarter < nextQuarter) {
        holding.hire = null;
      }
      if (
        holding.insurance
        && holding.insurance.expiresAfterQuarter < nextQuarter
      ) holding.insurance = null;
    }
    for (const id of Object.keys(next.parcelStatus).sort()) {
      const status = next.parcelStatus[id];
      if (status.tenant && status.tenant.expiresAfterQuarter < nextQuarter) {
        status.tenant = null;
        if (status.occupancy === 'tenant') status.occupancy = 'vacant';
      }
    }
    const quarterFramework = tickPeopleThenScheduleEvents(city, next, nextQuarter);
    next.people = quarterFramework.people;
    next.events = quarterFramework.events;
    next.weather = quarterFramework.weather;
  } else {
    const resultInput = { ...next, phase: 'result' };
    const order = next.people.order.filter((id) =>
      !shouldDespawnPerson(city, resultInput, next.people.byId[id], state.quarter + 1));
    next.people = freezePeople({
      order,
      byId: Object.fromEntries(order.map((id) => [id, next.people.byId[id]])),
    });
  }
}

function doSettle(city, state, action) {
  if (state.phase !== 'play') return reject(state, 'The run is over.');
  const preview = settlementPreview(city, state, 'player');
  const projection = projectSettlement(city, state, { bindingPlayerPreview: preview });
  const {
    next, moves, districtMoves, blockMoves, rivalMove, auctionTransactions, propertyEvents, peopleOutcomes,
    conditionAssessments, dueObligations, playerLines, rivalLines, checkpoints, terminal,
  } = projection;
  if (
    preview.rent !== playerLines.rent
    || preview.opex !== playerLines.opex
    || preview.interest !== playerLines.interest
    || preview.overdraftInterest !== playerLines.overdraftInterest
    || preview.net !== playerLines.net
    || preview.projectedClosingCash !== next.cash
  ) throw new Error(`Settlement preview diverged from charged settlement: ${JSON.stringify({
    preview: {
      seed: state.seed,
      quarter: state.quarter,
      auction: auctionResolving(state)?.id ?? null,
      rent: preview.rent,
      opex: preview.opex,
      interest: preview.interest,
      overdraftInterest: preview.overdraftInterest,
      net: preview.net,
      projectedClosingCash: preview.projectedClosingCash,
    },
    charged: { ...playerLines, projectedClosingCash: next.cash },
  })}`);

  let renovationCompletions = projection.renovationCompletions ?? [];
  let completions = projection.completions ?? [];
  let noticeConversions = projection.noticeConversions ?? [];
  let constructionAccidents = projection.constructionAccidents ?? [];
  if (!terminal) {
    applyFringeVenueIncome(next);
    settleFarms(next);
    ({
      renovationCompletions,
      completions,
      noticeConversions,
      constructionAccidents,
    } = completeWorks(city, next));
    resolveBushfires(city, next);
    checkpoints.push(assertMutationCheckpoint(
      city,
      next,
      '5b works completion / notice',
      Object.keys(next.holdings),
    ));
    matureHoldings(next);
    checkpoints.push(assertMutationCheckpoint(
      city,
      next,
      '5c maturity',
      Object.keys(next.holdings),
    ));
    expireAndScheduleNext(city, next, state, { sectorMoves: moves });
    settleProcessFacilities(city, next, { worldAck: readWorldDrawAck(actionWorldStore(action)) });
    for (const owner of ['player', 'rival']) {
      if (next.creditByOwner[owner].insolvent) continue;
      const cash = owner === 'player' ? next.cash : next.rival.cash;
      if (cash < overdraftFloor(city, next, owner)) {
        next.creditByOwner[owner].forcedSaleDueQuarter = state.quarter + 1;
        next.creditByOwner[owner].breachedQuarter = state.quarter;
      }
    }
  }

  const districtEngineBefore = next.districtEngine ?? evaluateDistrictEngine(city, state, {
    settledQuarter: Math.max(0, state.quarter - 1),
  });
  next.districtEngine = { ...evaluateDistrictEngine(city, next, { settledQuarter: state.quarter }),
    incomeLines: [cybercabIncomeLine(next)] };
  const districtChanges = districtEngineChanges(districtEngineBefore, next.districtEngine);

  const navAfter = navOf(city, next, 'player');
  const rivalNavAfter = navOf(city, next, 'rival');
  const ledgerRow = {
    quarter: state.quarter,
    moves,
    districtMoves,
    blockMoves,
    transactions: [...auctionTransactions, ...conditionAssessments],
    ...playerLines,
    propertyEvents,
    peopleOutcomes,
    conditionAssessments,
    obligations: preview.obligations.map((item) => ({ ...item })),
    dueCash: preview.dueCash,
    projectedClosingCash: preview.projectedClosingCash,
    cashAfter: next.cash,
    navAfter,
    rivalNet: rivalLines.net,
    rivalRent: rivalLines.rent,
    rivalOpex: rivalLines.opex,
    rivalInterest: rivalLines.interest,
    rivalOverdraft: rivalLines.overdraftInterest,
    rivalOverdraftInterest: rivalLines.overdraftInterest,
    rivalInterestBp: rivalLines.interestBp,
    rivalDebtAtInterest: rivalLines.debtAtInterest,
    rivalNavAfter,
    rivalMove,
    renovationCompletions,
    completions,
    noticeConversions,
    constructionAccidents,
    districtChanges,
    checkpoints,
  };
  next.ledger.push(ledgerRow);
  next.log.push({ q: state.quarter, type: 'settle', ...recordWorldInput(action),
    ...(action.worldMilitary ? { worldMilitary: clone(action.worldMilitary) } : {}),
  });
  next.obligations = [];

  if (terminal) {
    next.phase = 'result';
    next.actionsRemaining = 0;
    next.banked = 0;
    next.rival.intent = { parcelId: null, text: 'The run is closed.' };
  } else if (state.quarter >= state.quarters) {
    next.phase = 'result';
    next.actionsRemaining = 0;
    next.banked = 0;
    next.rival.intent = { parcelId: null, text: 'The run is closed.' };
  } else {
    next.creditByOwner.player.limitNav = navAfter;
    next.creditByOwner.rival.limitNav = rivalNavAfter;
    next.quarter = state.quarter + 1;
    advanceInterestRate(next);
    next.actionsRemaining = actionsForOperator(next.operatorId, next.quarter) + next.banked;
    next.banked = 0;
    if (next.seats?.R1?.kind === 'policy') {
      next.rival.intent = next.creditByOwner.rival.insolvent
        ? { parcelId: null, parcelIds: [], plan: [], text: 'The rival contest ended by insolvency.' }
        : decideRivalIntent(city, next, next.quarter);
      if (!next.creditByOwner.rival.insolvent) {
        next.events = eventsWithRivalCommitment(next.events, next.rival.intent);
      }
    } else {
      next.rival.intent = null;
    }
  }
  if (
    ledgerRow.navAfter !== navOf(city, next, 'player')
    || ledgerRow.rivalNavAfter !== navOf(city, next, 'rival')
  ) throw new Error('Ledger NAV does not equal returned-state NAV');

  return {
    state: next,
    events: [{
      kind: 'settle',
      quarter: state.quarter,
      lines: playerLines,
      moves,
      districtMoves,
      blockMoves,
      rivalMove,
      auctionTransactions,
      propertyEvents,
      peopleOutcomes,
      conditionAssessments,
      renovationCompletions,
      completions,
      noticeConversions,
      constructionAccidents,
      districtChanges,
      navAfter,
      rivalNavAfter,
    }],
  };
}

function doFringeVenue(city, state, action) {
  const unavailable = canSpendAction(state);
  if (unavailable) return reject(state, unavailable);
  ensureFringeVenues(state);
  const id = action.id;
  const quote = fringeVenueQuote(state, id);
  if (!quote?.ok) return reject(state, quote?.reason ?? 'That city asset is not available.');
  const funds = canFund(city, state, 'player', quote.cost);
  if (!funds.ok) {
    return reject(state, `Short $${funds.shortfall} against the overdraft floor.`);
  }
  const next = clone(state);
  ensureFringeVenues(next);
  next.cash -= quote.cost;
  next.fringeVenues = applyFringeVenuePurchase(next.fringeVenues, id);
  commitAction(next, {
    type: 'fringe-venue',
    id,
  }, {
    obligation: {
      kind: 'fringe-venue',
      timing: 'paid',
      cashOut: quote.cost,
      debtTaken: 0,
      venueId: id,
    },
  });
  return {
    state: next,
    events: [{
      kind: 'fringe-venue',
      id,
      amount: quote.cost,
      label: quote.label,
      fringeVenues: { ...next.fringeVenues },
    }],
  };
}

function doCivicUpgrade(city, state, action) {
  const unavailable = canSpendAction(state);
  if (unavailable) return reject(state, unavailable);
  ensureCivicDesks(state);
  const useId = action.useId;
  const quote = civicUpgradeQuote(state, useId);
  if (!quote?.ok) return reject(state, quote?.reason ?? 'That civic cannot be upgraded.');
  const civic = (city.civicUses ?? []).find((row) => row.useId === useId);
  if (!civic) return reject(state, 'That civic is not on this city.');
  const funds = canFund(city, state, 'player', quote.cost);
  if (!funds.ok) {
    return reject(state, `Short $${funds.shortfall} against the overdraft floor.`);
  }
  const next = clone(state);
  ensureCivicDesks(next);
  next.cash -= quote.cost;
  next.civicWorks[useId] = quote.nextLevel;
  commitAction(next, {
    type: 'civic-upgrade',
    useId,
    civicId: civic.id,
    level: quote.nextLevel,
  }, {
    obligation: {
      kind: 'civic-upgrade',
      timing: 'paid',
      cashOut: quote.cost,
      debtTaken: 0,
      civicId: civic.id,
    },
  });
  return {
    state: next,
    events: [{
      kind: 'civic-upgrade',
      useId,
      civicId: civic.id,
      amount: quote.cost,
      level: quote.nextLevel,
      label: quote.label,
    }],
  };
}

function doUniversityDonate(city, state) {
  const unavailable = canSpendAction(state);
  if (unavailable) return reject(state, unavailable);
  ensureCivicDesks(state);
  if (state.university.donated) return reject(state, 'The university already has your endowment.');
  const hall = (city.civicUses ?? []).find((row) => row.useId === 'university-old-arts');
  if (!hall) return reject(state, 'There is no university on this city.');
  const funds = canFund(city, state, 'player', UNIVERSITY_DONATE_COST);
  if (!funds.ok) {
    return reject(state, `Short $${funds.shortfall} against the overdraft floor.`);
  }
  const next = clone(state);
  ensureCivicDesks(next);
  next.cash -= UNIVERSITY_DONATE_COST;
  next.university.donated = true;
  commitAction(next, { type: 'university-donate', civicId: hall.id }, {
    obligation: {
      kind: 'university-donate',
      timing: 'paid',
      cashOut: UNIVERSITY_DONATE_COST,
      debtTaken: 0,
      civicId: hall.id,
    },
  });
  return {
    state: next,
    events: [{
      kind: 'university-donate',
      civicId: hall.id,
      amount: UNIVERSITY_DONATE_COST,
    }],
  };
}

function doUniversityFund(city, state, action) {
  const unavailable = canSpendAction(state);
  if (unavailable) return reject(state, unavailable);
  ensureCivicDesks(state);
  if (!state.university.donated) {
    return reject(state, 'Donate first. Then the desk will show the ideas.');
  }
  const idea = universityIdeasFor(state).find((row) => row.id === action.ideaId);
  if (!idea) return reject(state, 'That idea is not on this desk.');
  if (state.university.funded.includes(idea.id)) {
    return reject(state, 'You already funded that idea.');
  }
  const hall = (city.civicUses ?? []).find((row) => row.useId === 'university-old-arts');
  if (!hall) return reject(state, 'There is no university on this city.');
  const funds = canFund(city, state, 'player', idea.cost);
  if (!funds.ok) {
    return reject(state, `Short $${funds.shortfall} against the overdraft floor.`);
  }
  const next = clone(state);
  ensureCivicDesks(next);
  next.cash -= idea.cost;
  next.university.funded = [...next.university.funded, idea.id].sort();
  commitAction(next, {
    type: 'university-fund',
    civicId: hall.id,
    ideaId: idea.id,
  }, {
    obligation: {
      kind: 'university-fund',
      timing: 'paid',
      cashOut: idea.cost,
      debtTaken: 0,
      civicId: hall.id,
      ideaId: idea.id,
    },
  });
  return {
    state: next,
    events: [{
      kind: 'university-fund',
      civicId: hall.id,
      ideaId: idea.id,
      label: idea.label,
      amount: idea.cost,
    }],
  };
}

function doVisitVenue(_city, state, action) {
  const unavailable = canSpendAction(state);
  if (unavailable) return reject(state, unavailable);
  const venueId = String(action.venueId ?? '').trim();
  if (!venueId) return reject(state, 'No venue selected.');
  const next = clone(state);
  commitAction(next, { type: 'visit-venue', venueId });
  return {
    state: next,
    events: [{ kind: 'visit-venue', venueId }],
  };
}

function doSelectProcess(city, state, action) {
  const next = clone(state);
  const result = selectProcessOnHolding(city, next, action?.parcelId, action?.processId);
  if (result.rejected) return reject(state, result.reason);
  return {
    state: next,
    events: [{
      kind: 'select-process',
      parcelId: action.parcelId,
      processId: action.processId,
    }],
  };
}

function doAbortProcess(city, state, action) {
  const next = clone(state);
  const result = abortProcessRun(city, next, action?.parcelId, { worldAck: readWorldDrawAck(actionWorldStore(action)) });
  if (result.rejected) return reject(state, result.reason);
  Object.assign(next.log.at(-1), recordWorldInput(action));
  return {
    state: next,
    events: [{
      kind: 'abort-process',
      parcelId: action.parcelId,
      refund: result.refund,
    }],
  };
}

function emptyMilitary() {
  return { units: [], watch: { officerOnWatch: false } };
}

function parseBlockId(blockId) {
  if (typeof blockId !== 'string') return null;
  const match = /^(\d+),(\d+)$/.exec(blockId);
  if (!match) return null;
  return {
    bx: Number(match[1]),
    bz: Number(match[2]),
    id: `${Number(match[1])},${Number(match[2])}`,
  };
}

function restoreMilitary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyMilitary();
  const units = Array.isArray(value.units)
    ? value.units
      .filter((unit) => unit && CITY_MILITARY_UNIT_KINDS.includes(unit.kind))
      .map((unit) => ({
        id: String(unit.id),
        kind: unit.kind,
        blockId: unit.blockId == null ? null : String(unit.blockId),
        x: Number.isFinite(unit.x) ? unit.x : 0,
        z: Number.isFinite(unit.z) ? unit.z : 0,
        orderedBeat: Number.isInteger(unit.orderedBeat) ? unit.orderedBeat : 0,
      }))
    : [];
  return {
    units,
    watch: { officerOnWatch: value.watch?.officerOnWatch === true },
  };
}

function militaryWatch(units) {
  return { officerOnWatch: units.some((unit) => unit.kind === 'officer' && unit.blockId) };
}

function nextUnitId(units, kind) {
  const have = new Set(units.filter((unit) => unit.kind === kind).map((unit) => unit.id));
  let n = 1;
  while (have.has(`${kind}-${n}`)) n += 1;
  return `${kind}-${n}`;
}

function syncMilitaryFromWorld(state, snapshot) {
  const caps = snapshot.caps;
  const military = restoreMilitary(state.military);
  const kept = [];
  const dropped = [];
  for (const kind of CITY_MILITARY_UNIT_KINDS) {
    const list = military.units
      .filter((unit) => unit.kind === kind)
      .sort((left, right) => (
        (left.orderedBeat - right.orderedBeat) || left.id.localeCompare(right.id)
      ));
    const cap = caps[kind] ?? 0;
    while (list.length > cap) dropped.push(list.shift());
    kept.push(...list);
    while (kept.filter((unit) => unit.kind === kind).length < cap) {
      kept.push({
        id: nextUnitId(kept, kind),
        kind,
        blockId: null,
        x: 0,
        z: 0,
        orderedBeat: snapshot.beat,
      });
    }
  }
  state.military = { units: kept, watch: militaryWatch(kept) };
  for (const unit of dropped) {
    state.log.push({
      q: state.quarter,
      type: 'unit-dropped',
      unitId: unit.id,
      kind: unit.kind,
      body: `${unit.kind} ${unit.id} left the roster.`,
    });
  }
}

function doStationUnit(city, state, action) {
  const unavailable = canSpendAction(state);
  if (unavailable) return reject(state, unavailable);
  const unitId = String(action?.unitId ?? '').trim();
  const parsed = parseBlockId(action?.blockId);
  if (!unitId) return reject(state, 'No unit selected.');
  if (!parsed) return reject(state, 'No block selected.');
  const blocksX = Number.isInteger(city?.blocksX) ? city.blocksX : 4;
  const blocksZ = Number.isInteger(city?.blocksZ) ? city.blocksZ : 4;
  if (parsed.bx < 0 || parsed.bz < 0 || parsed.bx >= blocksX || parsed.bz >= blocksZ) {
    return reject(state, 'That block is not on the board.');
  }
  const next = clone(state);
  const military = restoreMilitary(next.military);
  const unit = military.units.find((row) => row.id === unitId);
  if (!unit) return reject(state, 'No such unit.');
  const centre = tileCentre(parsed.bx, parsed.bz, 1, 1);
  const units = military.units.map((row) => (
    row.id === unitId
      ? {
        ...row,
        blockId: parsed.id,
        x: centre.x,
        z: centre.z,
        orderedBeat: next.quarter,
      }
      : row
  ));
  next.military = { units, watch: militaryWatch(units) };
  commitAction(next, {
    type: 'station-unit',
    ...(action.worldMilitary ? { worldMilitary: clone(action.worldMilitary) } : {}),
    unitId,
    blockId: parsed.id,
  });
  return {
    state: next,
    events: [{ kind: 'station-unit', unitId, blockId: parsed.id }],
  };
}

function doRepairFacility(_city, state, action) {
  const inspected = inspectWorldRun(action.worldSnapshot);
  if (inspected.status !== 'valid' || !inspected.world) {
    return reject(state, 'The globe is dark.');
  }
  const facilityKey = action?.facilityKey
    ?? action?.facilityId
    ?? (typeof action?.processId === 'string' ? action.processId : null);
  const damaged = inspected.world.facilities?.damaged?.[facilityKey];
  if (damaged) {
    const cost = damaged.repairCost || FACILITY_REPAIR_COST;
    if ((state.cash ?? 0) < cost) {
      return reject(state, `Need $${cost.toLocaleString('en-AU')}.`);
    }
    const result = repairFacilityDamage(inspected.world, facilityKey);
    if (!result.ok) return reject(state, result.reason);
    const next = clone(state);
    next.cash -= cost;
    commitAction(next, {
      type: 'repair-facility',
      worldSnapshot: action.worldSnapshot,
      facilityKey,
      cost,
    }, {
      costsAction: false,
      obligation: {
        kind: 'repair-facility',
        timing: 'paid',
        cashOut: cost,
        debtTaken: 0,
      },
    });
    return {
      state: next,
      events: [{ kind: 'world-repair', before: serialiseWorld(inspected.world), after: serialiseWorld(result.world) }, {
        kind: 'repair-facility',
        facilityKey,
        fee: cost,
      }],
    };
  }
  const processId = action?.processId;
  const facilityId = action?.facilityId
    ?? (typeof processId === 'string' ? processId : null);
  const hit = fireDamageForFacility(inspected.world, facilityId, inspected.world.beat);
  if (!hit) return reject(state, 'No fire to repair.');
  const result = repairFire(inspected.world, hit.disasterId);
  if (!result.ok) return reject(state, result.reason);
  const next = clone(state);
  next.log.push({ q: next.quarter, type: 'repair-facility', facilityId: hit.facilityId, worldSnapshot: action.worldSnapshot });
  return {
    state: next,
    events: [{ kind: 'world-repair', before: serialiseWorld(inspected.world), after: serialiseWorld(result.world) }, {
      kind: 'repair-facility',
      facilityId: hit.facilityId,
      fee: result.fee,
    }],
  };
}

// --- Public reducer ----------------------------------------------------------

function doCybercab(city, state, action) {
  if (state.phase !== 'play') return reject(state, 'The run is over.');
  if ((state.cybercab?.economyVersion === 2 || action.type === 'UPGRADE_CAB_BOOK')
    && state.activeSeatId && state.activeSeatId !== (state.cybercab?.ownerSeatId ?? 'P1'))
    return reject(state, `This Cybercab business belongs to ${state.cybercab?.ownerSeatId ?? 'P1'}.`);
  const result = reduceCybercab(state.cybercab, action, {
    seed: state.seed, quarter: state.quarter, cash: state.cash,
  });
  if (result.rejected) return reject(state, result.reason);
  if (result.cashDelta < 0) {
    const admission = admitCybercabPayment(city, state, -result.cashDelta);
    if (!admission.ok) return reject(state, admission.reason);
  }
  const next = clone(state);
  next.cybercab = result.state;
  if (action.type === 'UPGRADE_CAB_BOOK') initialiseCybercabSeatBooks(next);
  next.cash += result.cashDelta;
  next.events = postCybercabIncidents(next.events, result.events, next.cybercab.depot);
  if (action.type === 'DISMISS_INCIDENT' && next.events.byId[action.incidentId]) {
    next.events = { order: [...next.events.order], byId: { ...next.events.byId,
      [action.incidentId]: { ...next.events.byId[action.incidentId], status: 'resolved' } } };
  }
  commitAction(next, { ...action }, { costsAction: false,
    obligation: { kind: action.type, timing: 'paid', cashOut: -result.cashDelta, debtTaken: 0 } });
  next.districtEngine = { ...next.districtEngine, incomeLines: [cybercabIncomeLine(next)] };
  return { state: next, events: result.events };
}

const VERBS = {
  ...Object.fromEntries(CYBERCAB_ACTIONS.map(type => [type, doCybercab])),
  walk: doWalk,
  bid: doBid,
  survey: doSurvey,
  hire: doHire,
  'send-crew': doSendCrew,
  lobby: doLobby,
  insure: doInsure,
  lease: doLease,
  remediate: doRemediate,
  trade: doTrade,
  'place-order': doPlaceOrder,
  'cancel-order': doCancelOrder,
  'scan-orders': doScanOrders,
  'supermarket-shift': doSupermarketShift,
  'ice-cream-rush-shift': doIceCreamRushShift,
  'veggie-patch-shift': doVeggiePatchShift,
  'script-lord-shift': doScriptLordShift,
  acquire: doAcquire,
  'demolish-strike': doDemolishStrike,
  'place-building': doPlaceBuilding,
  'select-process': doSelectProcess,
  'abort-process': doAbortProcess,
  'process-abort': doAbortProcess, // Replay of the process helper's durable log row.
  'repair-facility': doRepairFacility,
  'station-unit': doStationUnit,
  renovate: doRenovate,
  'renovate-room': doRenovateRoom,
  redevelop: doRedevelop,
  'change-use': doChangeUse,
  'redevelop:notice': (city, state, action) =>
    doTenantExit(city, state, action, 'notice'),
  'redevelop:buyout': (city, state, action) =>
    doTenantExit(city, state, action, 'buyout'),
  // One-revision replay alias. Tenant-exit payloads are accepted defensively by doRedevelop.
  develop: doRedevelop,
  divest: doDivest,
  consolidate: doConsolidate,
  // HUD wall used to dispatch `merge`; same verb, same reducer.
  merge: doConsolidate,
  subdivide: doSubdivide,
  hold: doHold,
  ipo: doIpo,
  'crossing-accident': doCrossingAccident,
  'plant-break': doPlantBreak,
  settle: doSettle,
  'reserve-improve': doReserveImprove,
  'civic-upgrade': doCivicUpgrade,
  'fringe-venue': doFringeVenue,
  'university-donate': doUniversityDonate,
  'university-fund': doUniversityFund,
  'visit-venue': doVisitVenue,
};

function applyLegacyAction(city, state, action) {
  const verb = VERBS[action.type];
  if (!verb) return reject(state, `Unknown action: ${action.type}`);
  const result = verb(city, state, action);
  if (!result.rejected) sealFrameworkState(result.state);
  return result;
}

function requiredSeatIds(state) {
  return Object.keys(state.seats).sort().filter((seatId) => state.seats[seatId].kind !== 'policy');
}

function secondarySeatId(state) {
  return state.seats.R1 ? 'R1' : (state.seats.P2 ? 'P2' : null);
}

function seatActionCosts(action) {
  return ![
    ...CYBERCAB_ACTIONS,
    'commit-quarter', 'defect', 'honour-pact', 'apply-deadline', 'run-start',
    'renovate-room', 'place-order', 'cancel-order', 'scan-orders', 'trade',
    'supermarket-shift', 'plant-break', 'ice-cream-rush-shift', 'script-lord-shift',
    'veggie-patch-shift', 'hire', 'demolish-strike', 'repair-facility',
  ].includes(action.type) && !(action.type === 'divest' && !RULES.divestCostsAction)
    && !(action.type === 'walk' && action.brokerChoice);
}

function targetOf(action) {
  return action.parcelId ?? action.targetId ?? action.eventId ?? null;
}

export function isRemoteSeatAuctionRoom(state) {
  return state.mode === 'correspondence' && Object.keys(state.seats ?? {}).sort().join(',') === 'P1,P2'
    && state.seats.P1.kind === 'remote' && state.seats.P2.kind === 'remote';
}

export function validateSeatAuctionState(state) {
  if (state.auctionSeatVersion === undefined) return;
  if (state.auctionSeatVersion !== 2 || !isRemoteSeatAuctionRoom(state)) {
    throw new Error('Unsupported seat auction contract or seat topology.');
  }
  const transitions = state.log.filter(entry => entry.type === 'upgrade-seat-auctions');
  if (transitions.length !== 1 || transitions[0].seatId !== SYSTEM_SEAT_ID
    || transitions[0].fromVersion !== 1 || transitions[0].toVersion !== 2
    || !['P1', 'P2'].includes(transitions[0].requestedBySeatId)) {
    throw new Error('Seat auction transition is not recorded.');
  }
  for (const event of Object.values(state.events?.byId ?? {})) {
    if (event.type !== 'auction' || ['resolved', 'cancelled'].includes(event.status)) continue;
    for (const [seatId, commitment] of [['P1', event.playerCommitment], ['P2', event.rivalCommitment]]) {
      if (commitment && (commitment.seatId !== seatId || !Number.isSafeInteger(commitment.maxBid)
        || commitment.maxBid < 0 || !Number.isInteger(commitment.lvrBp) || commitment.lvrBp < 0
        || commitment.lvrBp > 10000 || !Number.isSafeInteger(commitment.cashAtCap) || commitment.cashAtCap < 0)) {
        throw new Error('Seat auction commitment identity or funds are invalid.');
      }
    }
  }
}

export function legacySeatAuctionSettlementBlocked(state) {
  if (!isRemoteSeatAuctionRoom(state) || state.auctionSeatVersion === 2) return false;
  const actions = [...Object.values(state.quarterCommit.pendingActions).flat(),
    ...Object.values(state.quarterCommit.committedPackets).flatMap(packet => packet.actions),
    ...Object.values(state.activePacts ?? {}).flatMap(pact => Object.values(pact.decisions ?? {})
      .map(decision => decision?.replacementAction).filter(Boolean))];
  return actions.some(action => action.type === 'bid') || Object.values(state.events.byId).some(event =>
    event.type === 'auction' && !['resolved', 'cancelled'].includes(event.status)
      && (event.playerCommitment || event.rivalCommitment));
}

export function seatAuctionUpgradeReason(state) {
  if (!isRemoteSeatAuctionRoom(state)) return 'Seat auctions require an online room with two remote seats.';
  if (state.auctionSeatVersion !== undefined) return 'This room already uses seat auctions.';
  const quarter = state.quarterCommit;
  if (state.phase !== 'play' || quarter.status !== 'collecting'
    || quarter.committedSeatIds.length || Object.keys(quarter.committedPackets).length
    || Object.values(quarter.pendingActions).some(actions => actions.length)
    || Object.keys(state.activePacts ?? {}).length || quarter.deadlineApplied || quarter.deadlineStamp != null
    || Object.values(state.events.byId).some(event => event.type === 'auction'
      && !['resolved', 'cancelled'].includes(event.status) && (event.playerCommitment || event.rivalCommitment))) {
    return 'Enable seat auctions at an empty quarter: no accepted plans, commits, pacts or auction commitments.';
  }
  return '';
}

function upgradeSeatAuctions(state, command) {
  if (Object.keys(command).sort().join(',') !== 'fromVersion,requestedBySeatId,seatId,toVersion,type'
    || command.seatId !== SYSTEM_SEAT_ID || command.fromVersion !== 1 || command.toVersion !== 2
    || !['P1', 'P2'].includes(command.requestedBySeatId)) return reject(state, 'Invalid seat auction transition.');
  const reason = seatAuctionUpgradeReason(state);
  if (reason) return reject(state, reason);
  const next = clone(state);
  next.auctionSeatVersion = 2;
  next.log.push(clone(command));
  next.quarterCommit.startStateHash = quarterStartStateHash(next);
  return { state: sealFrameworkState(next), events: [{ kind: 'seat-auctions-enabled', seatId: command.requestedBySeatId }] };
}

function swapSeatAuctionCommitments(state) {
  state.events = clone(state.events);
  for (const event of Object.values(state.events.byId)) {
    if (event.type === 'auction') {
      [event.playerCommitment, event.rivalCommitment] = [event.rivalCommitment, event.playerCommitment];
    }
  }
}

function projectSeatAsLegacyPlayer(state, seatId) {
  const scratch = clone(state);
  scratch.activeSeatId = seatId;
  if (state.auctionSeatVersion === 2 && seatId === 'P2') swapSeatAuctionCommitments(scratch);
  if (state.cybercabBySeat?.[seatId]) scratch.cybercab = clone(state.cybercabBySeat[seatId]);
  const economy = state.seatEconomy[seatId];
  const credit = state.seatCredit[seatId];
  const privateState = state.seatPrivate[seatId];
  scratch.cash = economy.cash;
  scratch.actionsRemaining = economy.actionsRemaining;
  scratch.banked = economy.bankedActions;
  scratch.grade = economy.grade;
  scratch.creditByOwner.player = clone(credit);
  scratch.intel = {
    parcels: clone(privateState.intelByParcel),
    finds: clone(state.intel?.finds ?? []),
  };
  const avatar = state.avatars[seatId] ?? state.avatars.player;
  scratch.avatars.player = { ...clone(avatar), id: 'player' };
  for (const parcelId of Object.keys(scratch.holdings).sort()) {
    const canonicalOwner = state.holdings[parcelId].ownerSeatId
      ?? (state.holdings[parcelId].owner === 'rival' ? secondarySeatId(state) : 'P1');
    scratch.holdings[parcelId].owner = canonicalOwner === seatId ? 'player' : 'rival';
  }
  return scratch;
}

function restoreCanonicalAfterSeatAction(base, projected, seatId, logLength) {
  const next = projected;
  if (base.auctionSeatVersion === 2 && seatId === 'P2') swapSeatAuctionCommitments(next);
  if (base.cybercabBySeat?.[seatId]) {
    next.cybercabBySeat = { ...clone(base.cybercabBySeat), [seatId]: clone(projected.cybercab) };
    next.cybercab = clone(base.cybercab);
  }
  const seatIds = Object.keys(base.seats).sort();
  next.seats = clone(base.seats);
  next.mode = base.mode;
  next.seatEconomy = clone(base.seatEconomy);
  next.seatCredit = clone(base.seatCredit);
  next.seatPrivate = clone(base.seatPrivate);
  next.quarterCommit = clone(base.quarterCommit);
  next.activePacts = clone(base.activePacts);
  next.pactResults = clone(base.pactResults);
  next.log = clone(base.log.slice(0, logLength));

  const economy = next.seatEconomy[seatId];
  economy.cash = projected.cash;
  economy.actionsRemaining = projected.actionsRemaining;
  economy.bankedActions = projected.banked;
  economy.grade = projected.grade ?? null;
  next.seatCredit[seatId] = clone(projected.creditByOwner.player);
  next.seatPrivate[seatId].intelByParcel = clone(projected.intel.parcels);

  const resolvedAvatar = projected.avatars[seatId] ?? projected.avatars.player;
  next.avatars = clone(base.avatars);
  next.avatars[seatId] = { ...clone(resolvedAvatar), id: seatId };
  next.seatPrivate[seatId].accessTokens = clone(resolvedAvatar.accessTokens ?? {});

  for (const parcelId of Object.keys(next.holdings).sort()) {
    const projectedOwner = next.holdings[parcelId].owner;
    const previousOwner = base.holdings[parcelId]?.ownerSeatId
      ?? (base.holdings[parcelId]?.owner === 'rival' ? secondarySeatId(base) : 'P1');
    const ownerSeatId = projectedOwner === 'player' ? seatId : previousOwner;
    next.holdings[parcelId].ownerSeatId = ownerSeatId;
    next.holdings[parcelId].owner = ownerSeatId === 'P1' ? 'player' : 'rival';
  }

  const second = secondarySeatId(next);
  next.cash = next.seatEconomy.P1.cash;
  next.actionsRemaining = next.seatEconomy.P1.actionsRemaining;
  next.banked = next.seatEconomy.P1.bankedActions;
  next.grade = next.seatEconomy.P1.grade;
  next.creditByOwner.player = clone(next.seatCredit.P1);
  next.intel = {
    parcels: clone(next.seatPrivate.P1.intelByParcel),
    finds: clone(projected.intel?.finds ?? base.intel?.finds ?? []),
  };
  next.avatars.player = {
    ...clone(next.avatars.P1 ?? base.avatars.player),
    id: 'player',
  };
  if (second) {
    next.rival.cash = next.seatEconomy[second].cash;
    next.creditByOwner.rival = clone(next.seatCredit[second]);
  }
  for (const id of seatIds) {
    next.seatEconomy[id].conflictCredits ??= 0;
  }
  delete next.activeSeatId;
  if (next.mode === 'hotseat') delete next.avatars.player;
  return sealFrameworkState(next);
}

function applySeatActionNow(city, state, seatId, action) {
  if (!state.seats[seatId]) return reject(state, `Unknown seat: ${seatId}`);
  const projected = projectSeatAsLegacyPlayer(state, seatId);
  const logLength = state.log.length;
  const result = applyLegacyAction(city, projected, action);
  if (result.rejected) return { ...result, state };
  return {
    ...result,
    state: restoreCanonicalAfterSeatAction(state, result.state, seatId, logLength),
  };
}

function validateEnvelope(state, envelope) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return 'Action envelope must be an object.';
  }
  if (envelope.protocol !== ACTION_PROTOCOL) return 'Unsupported action protocol.';
  if (envelope.stateVersion !== STATE_VERSION) return 'Action state version mismatch.';
  if (envelope.simRevision !== SIM_REVISION) return 'Action simulation revision mismatch.';
  if (envelope.seed !== state.seed) return 'Action seed mismatch.';
  if (envelope.quarter !== state.quarter) return 'Action quarter mismatch.';
  if (!state.seats[envelope.seatId]) return 'Action names an undeclared seat.';
  if (
    !Number.isInteger(envelope.seatActionIndex)
    || envelope.seatActionIndex < 0
    || envelope.seatActionIndex !== state.quarterCommit.nextSeatActionIndex[envelope.seatId]
  ) return 'Seat action index is not the next canonical index.';
  if (!envelope.action || typeof envelope.action.type !== 'string') {
    return 'Action body is missing.';
  }
  return null;
}

export function createSeatActionEnvelope(state, seatId, action, seatActionIndex = null) {
  return {
    protocol: ACTION_PROTOCOL,
    stateVersion: STATE_VERSION,
    simRevision: SIM_REVISION,
    seed: state.seed,
    quarter: state.quarter,
    seatId,
    seatActionIndex: seatActionIndex ?? state.quarterCommit.nextSeatActionIndex[seatId],
    action: clone(action),
  };
}

function quarterPacketBody(state, seatId, actions = null) {
  return {
    protocol: QUARTER_PROTOCOL,
    stateVersion: STATE_VERSION,
    simRevision: SIM_REVISION,
    seed: state.seed,
    quarter: state.quarter,
    seatId,
    startStateHash: state.quarterCommit.startStateHash,
    actions: clone(actions ?? state.quarterCommit.pendingActions[seatId] ?? []),
  };
}

export function committedPacketFor(state, seatId, actions = null) {
  if (!state.seats[seatId]) throw new RangeError(`Unknown seat: ${seatId}`);
  const body = quarterPacketBody(state, seatId, actions);
  return {
    ...body,
    packetHash: hash32(canonicalJson(body)).toString(16),
  };
}

function validateActionAgainstSeatSnapshot(city, state, seatId, action) {
  if (['commit-quarter', 'defect', 'apply-deadline', 'run-start'].includes(action.type)) {
    return { ok: false, reason: `${action.type} is not a packet action.` };
  }
  if (action.type === 'pact') return { ok: true, reason: '' };
  if (action.type === 'acquire' && action.maxBid !== null && action.maxBid !== undefined) {
    if (!Number.isInteger(action.maxBid)) return { ok: false, reason: 'maxBid must be an integer.' };
    const projected = projectSeatAsLegacyPlayer(state, seatId);
    const quote = acquireQuote(city, projected, action.parcelId);
    if (action.maxBid < quote.price) return { ok: false, reason: 'maxBid is below asking price.' };
    const ceiling = fundableAcquisitionCeiling(city, state, seatId, action.parcelId);
    if (action.maxBid > ceiling) return { ok: false, reason: 'maxBid exceeds the fundable ceiling.' };
  }
  const result = applySeatActionNow(
    city,
    state,
    seatId,
    action.type === 'acquire' ? { ...action, maxBid: undefined } : action,
  );
  return result.rejected
    ? { ok: false, reason: result.events[0].reason }
    : { ok: true, reason: '' };
}

function simulatePendingPacket(city, state, seatId, actions) {
  let scratch = clone(state);
  for (const action of actions) {
    if (action.type === 'pact') continue;
    const result = applySeatActionNow(
      city,
      scratch,
      seatId,
      action.type === 'acquire' ? { ...action, maxBid: undefined } : action,
    );
    if (result.rejected) return { ok: false, reason: result.events[0].reason };
    scratch = result.state;
  }
  return { ok: true, state: scratch };
}

// Reuse the canonical packet simulation so a staged dispatch/service updates the
// business panel without publishing the private plan or mutating room state.
export function previewCybercabSeat(city, state, seatId = 'P1') {
  // Online views already carry only this seat's server-computed staged book.
  if (state.onlineView) return { ...state, cash: state.cybercabPlanCash ?? state.cash };
  if (!state.seats?.[seatId]) return state;
  const actions = state.phase === 'play' ? state.quarterCommit?.pendingActions?.[seatId] ?? [] : [];
  const simulated = actions.length ? simulatePendingPacket(city, state, seatId, actions) : { ok: true, state };
  if (!simulated.ok) throw new Error(`Cybercab plan unavailable: ${simulated.reason}`);
  const projected = simulated.state;
  return { ...projected, activeSeatId: seatId,
    cash: projected.seatEconomy[seatId].cash,
    cybercab: cybercabForOwner(projected, seatId) ?? projected.cybercab };
}

function acquisitionCashOutAtPrice(price, reserveQuote) {
  const lvrBp = Math.round((reserveQuote.debtTaken * 10000) / reserveQuote.price);
  return price - applyBp(price, lvrBp) + applyBp(price, RULES.dutyBp);
}

function fundableAcquisitionCeiling(city, state, seatId, parcelId) {
  const projected = projectSeatAsLegacyPlayer(state, seatId);
  const quote = acquireQuote(city, projected, parcelId);
  const funds = projected.cash - overdraftFloor(city, projected, 'player');
  let low = 0;
  let high = Math.max(quote.price, 1);
  while (acquisitionCashOutAtPrice(high, quote) <= funds && high < Number.MAX_SAFE_INTEGER / 2) {
    high *= 2;
  }
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (acquisitionCashOutAtPrice(middle, quote) <= funds) low = middle;
    else high = middle;
  }
  return low;
}

export function acquisitionIncrement(reservePrice) {
  return Math.round(Math.max(5_000, applyBp(reservePrice, 100)) / 1_000) * 1_000;
}

function spendSeatAction(state, seatId) {
  const next = clone(state);
  if (next.seatEconomy[seatId].actionsRemaining > 0) {
    next.seatEconomy[seatId].actionsRemaining -= 1;
  }
  next.actionOrdinal += 1;
  next.cash = next.seatEconomy.P1.cash;
  next.actionsRemaining = next.seatEconomy.P1.actionsRemaining;
  const second = secondarySeatId(next);
  if (second) next.rival.cash = next.seatEconomy[second].cash;
  return next;
}

function policyPacket(state, seatId) {
  const actions = [];
  const plan = state.rival?.intent?.plan ?? [state.rival?.intent].filter(Boolean);
  for (const move of plan.slice(0, RULES.actionsPerQuarter)) {
    if (['acquire', 'renovate', 'redevelop'].includes(move.verb)) {
      actions.push({ type: move.verb, parcelId: move.parcelId, maxBid: null });
    } else if (move.verb === 'lease') {
      actions.push({ type: 'lease', parcelId: move.parcelId, tenantQuality: move.tenantQuality });
    } else if (move.verb === 'auction') {
      actions.push({
        type: 'policy-auction',
        eventId: move.eventId,
        parcelId: move.parcelId,
      });
    } else if (move.verb === 'insure') {
      actions.push({
        type: 'insure',
        parcelId: move.parcelId,
        cover: move.cover,
      });
    } else {
      actions.push({ type: 'hold', reason: 'chosen', bankRequested: false });
    }
  }
  while (actions.length < RULES.actionsPerQuarter) {
    actions.push({ type: 'hold', reason: 'chosen', bankRequested: false });
  }
  return committedPacketFor(state, seatId, actions);
}

function deriveMatchingPacts(state) {
  const candidates = [];
  for (const seatId of Object.keys(state.quarterCommit.committedPackets).sort()) {
    const packet = state.quarterCommit.committedPackets[seatId];
    for (let index = 0; index < packet.actions.length; index += 1) {
      const action = packet.actions[index];
      if (action.type === 'pact') candidates.push({ seatId, index, action });
    }
  }
  const active = {};
  for (const candidate of candidates) {
    if (active[candidate.action.pactId]) continue;
    const match = candidates.find((other) => (
      other.seatId === candidate.action.partnerSeatId
      && other.action.partnerSeatId === candidate.seatId
      && other.action.pactId === candidate.action.pactId
      && other.action.pactKind === candidate.action.pactKind
      && other.action.beneficiarySeatId === candidate.action.beneficiarySeatId
      && other.action.targetId === candidate.action.targetId
      && other.action.maxBid === candidate.action.maxBid
    ));
    if (!match) continue;
    const members = [candidate.seatId, match.seatId].sort();
    const code = candidate.action.pactKind === 'joint-bid' ? 'BID' : 'RENO';
    const expectedId = `P${state.quarter}-${code}-${members[0]}-${members[1]}-${candidate.action.targetId}`;
    if (candidate.action.pactId !== expectedId) continue;
    active[expectedId] = {
      pactId: expectedId,
      pactKind: candidate.action.pactKind,
      members,
      beneficiarySeatId: candidate.action.beneficiarySeatId,
      targetId: candidate.action.targetId,
      maxBid: candidate.action.maxBid,
      decisions: Object.fromEntries(members.map((id) => [id, null])),
    };
  }
  return active;
}

function collectResolutionActions(state) {
  const rows = [];
  for (const seatId of state.quarterCommit.resolutionOrder) {
    const packet = state.quarterCommit.committedPackets[seatId];
    if (!packet) continue;
    packet.actions.forEach((action, seatActionIndex) => {
      rows.push({ seatId, seatActionIndex, action: clone(action) });
    });
  }
  return rows;
}

function pactResolutionRows(state) {
  const pactIds = new Set(Object.keys(state.activePacts));
  const ordinary = collectResolutionActions(state)
    .filter(({ action }) => action.type !== 'pact' || !pactIds.has(action.pactId));
  const synthetic = [];
  const results = [];
  for (const pactId of Object.keys(state.activePacts).sort()) {
    const pact = state.activePacts[pactId];
    const defectors = pact.members.filter((id) => pact.decisions[id]?.choice === 'defect');
    const cooperators = pact.members.filter((id) => !defectors.includes(id));
    let appliedEffect = null;
    if (defectors.length === 0) {
      const beneficiaryIndex = state.quarterCommit.committedPackets[
        pact.beneficiarySeatId
      ].actions.findIndex((action) => action.pactId === pactId);
      synthetic.push({
        seatId: pact.beneficiarySeatId,
        seatActionIndex: beneficiaryIndex,
        action: pact.pactKind === 'joint-bid'
          ? {
            type: 'acquire',
            parcelId: pact.targetId,
            maxBid: pact.maxBid,
            jointBid: true,
            pactId,
          }
          : {
            type: 'renovate',
            parcelId: pact.targetId,
            jointRenovation: true,
            pactId,
          },
      });
      for (const member of pact.members) {
        if (member !== pact.beneficiarySeatId) {
          synthetic.push({
            seatId: member,
            seatActionIndex: state.quarterCommit.committedPackets[member].actions
              .findIndex((action) => action.pactId === pactId),
            action: { type: 'pact-partner-spend', pactId },
          });
        }
      }
      appliedEffect = pact.pactKind === 'joint-bid'
        ? 'joint-bid-increment'
        : 'renovation-8500bp';
    } else if (defectors.length === 1) {
      const defector = defectors[0];
      const cooperator = cooperators[0];
      if (cooperator === pact.beneficiarySeatId) {
        synthetic.push({
          seatId: cooperator,
          seatActionIndex: state.quarterCommit.committedPackets[cooperator].actions
            .findIndex((action) => action.pactId === pactId),
          action: pact.pactKind === 'joint-bid'
            ? { type: 'acquire', parcelId: pact.targetId, maxBid: pact.maxBid, pactId }
            : { type: 'renovate', parcelId: pact.targetId, pactId },
        });
      } else {
        synthetic.push({
          seatId: cooperator,
          seatActionIndex: state.quarterCommit.committedPackets[cooperator].actions
            .findIndex((action) => action.pactId === pactId),
          action: { type: 'pact-cooperator-spend', pactId },
        });
      }
      synthetic.push({
        seatId: defector,
        seatActionIndex: state.quarterCommit.committedPackets[defector].actions
          .findIndex((action) => action.pactId === pactId),
        action: {
          ...(pact.decisions[defector].replacementAction ?? {
            type: 'hold',
            reason: 'chosen',
            bankRequested: false,
          }),
          pactId,
          freeDefectorReplacement: true,
        },
      });
    } else {
      for (const member of pact.members) {
        synthetic.push({
          seatId: member,
          seatActionIndex: state.quarterCommit.committedPackets[member].actions
            .findIndex((action) => action.pactId === pactId),
          action: { type: 'pact-double-defect-spend', pactId },
        });
      }
    }
    results.push({
      type: 'pact-result',
      pactId,
      quarter: state.quarter,
      cooperators,
      defectors,
      appliedEffect,
      targetId: pact.targetId,
    });
  }
  const orderIndex = Object.fromEntries(
    state.quarterCommit.resolutionOrder.map((id, index) => [id, index]),
  );
  return {
    rows: [...ordinary, ...synthetic].sort((left, right) => (
      orderIndex[left.seatId] - orderIndex[right.seatId]
      || left.seatActionIndex - right.seatActionIndex
    )),
    results,
  };
}

function executeResolutionRow(city, state, row) {
  if (row.action.type === 'policy-auction') {
    return {
      state: spendSeatAction(state, row.seatId),
      events: [{
        kind: 'policy-auction-committed',
        seatId: row.seatId,
        eventId: row.action.eventId,
        parcelId: row.action.parcelId,
      }],
    };
  }
  if (row.action.type.startsWith('pact-') && row.action.type.endsWith('-spend')) {
    return {
      state: spendSeatAction(state, row.seatId),
      events: [{ kind: row.action.type, seatId: row.seatId, pactId: row.action.pactId }],
    };
  }
  const beforeActions = state.seatEconomy[row.seatId].actionsRemaining;
  const result = applySeatActionNow(
    city,
    state,
    row.seatId,
    row.action.type === 'acquire'
      ? { ...row.action, maxBid: undefined }
      : row.action,
  );
  if (
    !result.rejected
    && row.action.freeDefectorReplacement
  ) {
    result.state.seatEconomy[row.seatId].actionsRemaining = beforeActions;
    result.state.actionsRemaining = result.state.seatEconomy.P1.actionsRemaining;
  }
  return result;
}

function contestSnapshotFor(city, state, rows) {
  const groups = {};
  for (const row of rows.filter(({ action }) => action.type === 'acquire')) {
    (groups[row.action.parcelId] ??= []).push(row);
  }
  const contests = [];
  for (const parcelId of Object.keys(groups).sort()) {
    const participants = groups[parcelId];
    if (participants.length < 2) continue;
    const firstProjection = projectSeatAsLegacyPlayer(state, participants[0].seatId);
    const reserve = acquireQuote(city, firstProjection, parcelId).price;
    const increment = acquisitionIncrement(reserve);
    const candidates = participants.map((row) => {
      const ceiling = fundableAcquisitionCeiling(city, state, row.seatId, parcelId);
      const requested = row.action.maxBid ?? reserve;
      const effectiveRequested = row.action.jointBid
        ? Math.min(requested + increment, ceiling)
        : requested;
      const cap = Math.min(effectiveRequested, ceiling);
      return { ...row, cap, eligible: cap >= reserve };
    });
    const eligible = candidates.filter(({ eligible: value }) => value)
      .sort((left, right) => (
        right.cap - left.cap
        || state.quarterCommit.resolutionOrder.indexOf(left.seatId)
          - state.quarterCommit.resolutionOrder.indexOf(right.seatId)
      ));
    const winner = eligible[0] ?? null;
    const runnerCap = eligible[1]?.cap ?? reserve - increment;
    contests.push({
      parcelId,
      reserve,
      increment,
      candidates,
      winner,
      salePrice: winner
        ? Math.max(reserve, Math.min(winner.cap, runnerCap + increment))
        : null,
    });
  }
  return contests;
}

function appendResolutionLog(state, row, outcome) {
  const publicAction = clone(row.action);
  if (publicAction.type === 'acquire') delete publicAction.maxBid;
  state.log.push({
    type: 'resolved-action',
    q: state.quarter,
    quarter: state.quarter,
    seatId: row.seatId,
    seatActionIndex: row.seatActionIndex,
    action: publicAction,
    outcome,
  });
}

function settleResolvedQuarter(city, state, worldInput = {}) {
  const carry = Object.fromEntries(Object.keys(state.seats).sort().map((seatId) => [
    seatId,
    {
      bankedActions: state.seatEconomy[seatId].bankedActions,
      conflictCredits: state.seatEconomy[seatId].conflictCredits,
    },
  ]));
  const result = applyLegacyAction(city, state, { type: 'settle', ...recordWorldInput(worldInput) });
  if (result.rejected) return result;
  const next = result.state;
  syncCanonicalSeatLayer(next);
  if (next.phase === 'play') {
    for (const seatId of Object.keys(next.seats).sort()) {
      next.seatEconomy[seatId].actionsRemaining = (seatId === 'P1'
        ? actionsForOperator(next.operatorId, next.quarter)
        : RULES.actionsPerQuarter)
        + carry[seatId].bankedActions
        + carry[seatId].conflictCredits;
      next.seatEconomy[seatId].bankedActions = 0;
      next.seatEconomy[seatId].conflictCredits = 0;
    }
    next.actionsRemaining = next.seatEconomy.P1.actionsRemaining;
    next.banked = 0;
    const second = secondarySeatId(next);
    if (second) next.rival.cash = next.seatEconomy[second].cash;
    next.quarterCommit = emptyQuarterCommit(Object.keys(next.seats).sort(), next.quarter);
    next.activePacts = {};
    next.quarterCommit.startStateHash = quarterStartStateHash(next);
  } else {
    for (const seatId of Object.keys(next.seats).sort()) {
      next.seatEconomy[seatId].actionsRemaining = 0;
      next.seatEconomy[seatId].bankedActions = 0;
    }
    next.quarterCommit.status = 'resolved';
    next.activePacts = {};
  }
  return { ...result, state: next };
}

function resolveCommittedQuarter(city, state, worldInput = {}) {
  let next = clone(state);
  const { rows, results } = pactResolutionRows(next);
  const contests = contestSnapshotFor(city, next, rows);
  const contestedKeys = new Set();
  const events = [];
  const winningTargets = new Map();
  // All seats stage against the same immutable world. Compose repairs in the
  // canonical resolution order; a second order for the same repair is a no-op.
  const repairBatches = new Map();
  let repairedWorldSnapshot = null;

  for (const contest of contests) {
    for (const candidate of contest.candidates) {
      contestedKeys.add(`${candidate.seatId}:${candidate.seatActionIndex}`);
    }
    for (const candidate of contest.candidates) {
      if (contest.winner && candidate.seatId === contest.winner.seatId) continue;
      next = spendSeatAction(next, candidate.seatId);
      const kind = candidate.eligible ? 'contest-lost' : 'contest-ineligible';
      const event = {
        kind,
        seatId: candidate.seatId,
        parcelId: contest.parcelId,
        winningSeatId: contest.winner?.seatId ?? null,
        salePrice: contest.salePrice,
      };
      events.push(event);
      appendResolutionLog(next, candidate, event);
    }
    if (!contest.winner) continue;
    const winnerRow = contest.winner;
    const winnerResult = applySeatActionNow(city, next, winnerRow.seatId, {
      ...winnerRow.action,
      maxBid: undefined,
      priceOverride: contest.salePrice,
    });
    if (winnerResult.rejected) {
      next = spendSeatAction(next, winnerRow.seatId);
      const event = {
        kind: 'contest-underfunded',
        seatId: winnerRow.seatId,
        parcelId: contest.parcelId,
        salePrice: contest.salePrice,
      };
      next.ledger.push(event);
      events.push(event);
      appendResolutionLog(next, winnerRow, event);
    } else {
      next = winnerResult.state;
      events.push(...winnerResult.events, {
        kind: 'contest-won',
        seatId: winnerRow.seatId,
        parcelId: contest.parcelId,
        salePrice: contest.salePrice,
      });
      winningTargets.set(contest.parcelId, winnerRow.seatId);
      appendResolutionLog(next, winnerRow, {
        kind: 'contest-won',
        salePrice: contest.salePrice,
      });
    }
  }

  for (const row of rows) {
    if (contestedKeys.has(`${row.seatId}:${row.seatActionIndex}`)) continue;
    let resolutionRow = row;
    let repairBatch = null;
    let repairKey = null;
    if (row.action.type === 'repair-facility') {
      const original = row.action.worldSnapshot;
      repairBatch = repairBatches.get(original);
      const inspected = inspectWorldRun(original);
      if (inspected.status === 'valid') {
        const facilityKey = row.action.facilityKey ?? row.action.facilityId ?? row.action.processId;
        const fire = fireDamageForFacility(inspected.world,
          row.action.facilityId ?? row.action.processId, inspected.world.beat);
        repairKey = inspected.world.facilities?.damaged?.[facilityKey]
          ? `facility:${facilityKey}` : fire ? `fire:${fire.disasterId}` : null;
      }
      if (repairBatch?.completed.has(repairKey)) {
        const event = { kind: 'repair-already-completed', seatId: row.seatId, fee: 0 };
        events.push(event);
        appendResolutionLog(next, row, event);
        continue;
      }
      if (repairBatch) resolutionRow = { ...row,
        action: { ...row.action, worldSnapshot: repairBatch.worldSnapshot },
      };
    }
    const result = executeResolutionRow(city, next, resolutionRow);
    if (!result.rejected) {
      const effect = result.events.find((event) => event.kind === 'world-repair');
      if (effect) {
        repairBatch ??= { completed: new Set(), worldSnapshot: effect.before };
        repairBatch.completed.add(repairKey);
        repairBatch.worldSnapshot = effect.after;
        repairBatches.set(row.action.worldSnapshot, repairBatch);
        repairedWorldSnapshot = effect.after;
      }
      next = result.state;
      const target = targetOf(row.action);
      if (target) winningTargets.set(target, row.seatId);
      events.push(...result.events);
      appendResolutionLog(next, row, { kind: 'applied' });
      continue;
    }
    const target = targetOf(row.action);
    if (row.action.freeDefectorReplacement) {
      next = spendSeatAction(next, row.seatId);
      const event = {
        kind: 'illegal-replacement',
        seatId: row.seatId,
        pactId: row.action.pactId,
        reason: result.events[0].reason,
      };
      events.push(event);
      appendResolutionLog(next, row, event);
    } else if (
      row.action.type !== 'acquire'
      && target
      && winningTargets.has(target)
    ) {
      next.seatEconomy[row.seatId].conflictCredits += 1;
      const event = {
        kind: 'conflict-refund',
        seatId: row.seatId,
        actionType: row.action.type,
        targetId: target,
        winningSeatId: winningTargets.get(target),
      };
      events.push(event);
      appendResolutionLog(next, row, event);
    } else {
      next = spendSeatAction(next, row.seatId);
      const event = {
        kind: 'resolution-failed',
        seatId: row.seatId,
        actionType: row.action.type,
        targetId: target,
        reason: result.events[0].reason,
      };
      events.push(event);
      appendResolutionLog(next, row, event);
    }
  }

  next.pactResults.push(...results);
  for (const result of results) {
    next.log.push(clone(result));
    events.push({ kind: 'pact-result', ...result });
  }
  next.activePacts = {};
  next.quarterCommit.policyResolved = Object.keys(next.seats)
    .some((seatId) => next.seats[seatId].kind === 'policy');
  next.quarterCommit.status = 'resolved';
  const settled = settleResolvedQuarter(city, next, repairedWorldSnapshot
    ? { ...worldInput, worldSnapshot: repairedWorldSnapshot } : worldInput);
  if (settled.rejected) return settled;
  return { state: settled.state, events: [...events, ...settled.events] };
}

function queueSeatEnvelope(city, state, envelope) {
  if (state.quarterCommit.status !== 'collecting') {
    return reject(state, 'Quarter collection is closed.');
  }
  if (state.quarterCommit.committedPackets[envelope.seatId]) {
    return reject(state, 'That seat has already committed.');
  }
  const action = envelope.action;
  if (action.type === 'commit-quarter') return commitSeatEnvelope(city, state, envelope);
  if (['defect', 'honour-pact'].includes(action.type)) {
    return reject(state, 'The defection window is not open.');
  }
  if (action.type === 'hold') {
    if (!['chosen', 'deadline'].includes(action.reason)) {
      return reject(state, 'Hold reason must be chosen or deadline.');
    }
    if (typeof action.bankRequested !== 'boolean') {
      return reject(state, 'Hold must state whether banking is requested.');
    }
  }
  if (action.type === 'pact') {
    const existingPact = (state.quarterCommit.pendingActions[envelope.seatId] ?? [])
      .some((item) => item.type === 'pact');
    if (existingPact) return reject(state, 'A seat may name only one pact per quarter.');
    if (
      !['joint-bid', 'joint-renovation'].includes(action.pactKind)
      || !state.seats[action.partnerSeatId]
      || action.partnerSeatId === envelope.seatId
      || !state.seats[action.beneficiarySeatId]
      || typeof action.targetId !== 'string'
    ) return reject(state, 'Malformed pact action.');
  } else {
    const quarterlyCabAction = CYBERCAB_FINANCIAL_ACTIONS.includes(action.type)
      && (cybercabForOwner(state, envelope.seatId)?.economyVersion === 2
        || (state.quarterCommit.pendingActions[envelope.seatId] ?? []).some(row => row.type === 'UPGRADE_CAB_BOOK'));
    // Block 2/service can become legal through block 1 in this same private plan.
    // The complete ordered packet is still reduced and validated immediately below.
    if (!quarterlyCabAction && !(state.auctionSeatVersion === 2 && action.type === 'bid')) {
      const validation = validateActionAgainstSeatSnapshot(city, state, envelope.seatId, action);
      if (!validation.ok) return reject(state, validation.reason);
    }
  }

  const nextActions = [
    ...(state.quarterCommit.pendingActions[envelope.seatId] ?? []),
    clone(action),
  ];
  const capacity = state.seatEconomy[envelope.seatId].actionsRemaining;
  if (nextActions.filter(seatActionCosts).length > capacity) {
    return reject(state, 'Packet exceeds the seat action capacity.');
  }
  const simulated = simulatePendingPacket(city, state, envelope.seatId, nextActions);
  if (!simulated.ok) return reject(state, simulated.reason);

  const next = clone(state);
  next.quarterCommit.pendingActions[envelope.seatId] = nextActions;
  next.quarterCommit.nextSeatActionIndex[envelope.seatId] += 1;
  next.log.push(clone(envelope));
  return {
    state: next,
    events: [{
      kind: 'seat-action-staged',
      seatId: envelope.seatId,
      seatActionIndex: envelope.seatActionIndex,
    }],
  };
}

function openBarrier(city, state, rollbackState = state, worldInput = {}) {
  const next = clone(state);
  for (const seatId of Object.keys(next.seats).sort()) {
    if (next.seats[seatId].kind !== 'policy') continue;
    const packet = policyPacket(next, seatId);
    next.quarterCommit.committedPackets[seatId] = packet;
    next.quarterCommit.committedSeatIds.push(seatId);
    next.log.push({
      type: 'policy-packet',
      seatId,
      quarter: next.quarter,
      packet: clone(packet),
    });
  }
  next.quarterCommit.committedSeatIds.sort();
  next.activePacts = deriveMatchingPacts(next);
  const pactRows = Object.values(next.quarterCommit.committedPackets)
    .flatMap((packet) => packet.actions.filter((action) => action.type === 'pact'));
  const matchedIds = new Set(Object.keys(next.activePacts));
  if (pactRows.some((action) => !matchedIds.has(action.pactId))) {
    return reject(rollbackState, 'Unmatched pact action.');
  }
  const targetIds = Object.values(next.activePacts).map(({ targetId }) => targetId);
  if (new Set(targetIds).size !== targetIds.length) {
    return reject(rollbackState, 'Only one pact may target an asset per quarter.');
  }
  if (Object.keys(next.activePacts).length) {
    next.quarterCommit.status = 'defection';
    return {
      state: next,
      events: Object.values(next.activePacts).map((pact) => ({
        kind: 'pact-disclosed',
        pactId: pact.pactId,
        members: [...pact.members],
      })),
    };
  }
  return resolveCommittedQuarter(city, next, worldInput);
}

function commitSeatEnvelope(city, state, envelope) {
  if (state.quarterCommit.status !== 'collecting') {
    return reject(state, 'Quarter collection is closed.');
  }
  const seatId = envelope.seatId;
  if (state.quarterCommit.committedPackets[seatId]) {
    return reject(state, 'That seat has already committed.');
  }
  const packet = committedPacketFor(state, seatId);
  if (
    typeof envelope.action.packetHash !== 'string'
    || !/^[0-9a-f]+$/.test(envelope.action.packetHash)
    || envelope.action.packetHash !== packet.packetHash
  ) return reject(state, 'Commit packet hash mismatch.');
  const validation = simulatePendingPacket(city, state, seatId, packet.actions);
  if (!validation.ok) return reject(state, validation.reason);

  const next = clone(state);
  next.quarterCommit.committedPackets[seatId] = packet;
  next.quarterCommit.committedSeatIds.push(seatId);
  next.quarterCommit.committedSeatIds.sort();
  next.quarterCommit.nextSeatActionIndex[seatId] += 1;
  next.log.push(clone(envelope));
  const required = requiredSeatIds(next);
  const barrierOpen = required.every((id) => next.quarterCommit.committedPackets[id])
    || next.quarterCommit.deadlineApplied;
  if (!barrierOpen) {
    return {
      state: next,
      events: [{ kind: 'seat-committed', seatId, committed: true }],
    };
  }
  return openBarrier(city, next, state, envelope);
}

function applyDeadline(city, state, command) {
  if (
    command.seatId !== SYSTEM_SEAT_ID
    || command.type !== 'apply-deadline'
    || command.quarter !== state.quarter
    || typeof command.deadlineStamp !== 'string'
    || !command.deadlineStamp
  ) return reject(state, 'Malformed deadline command.');
  if (state.quarterCommit.status !== 'collecting' || state.quarterCommit.deadlineApplied) {
    return reject(state, 'Deadline is not applicable.');
  }
  let next = clone(state);
  next.log.push(clone(command));
  for (const seatId of requiredSeatIds(next)) {
    if (next.quarterCommit.committedPackets[seatId]) continue;
    const actions = [{
      type: 'hold',
      reason: 'deadline',
      bankRequested: true,
    }];
    const packet = committedPacketFor(next, seatId, actions);
    next.quarterCommit.pendingActions[seatId] = actions;
    next.quarterCommit.committedPackets[seatId] = packet;
    next.quarterCommit.committedSeatIds.push(seatId);
  }
  next.quarterCommit.committedSeatIds.sort();
  next.quarterCommit.deadlineApplied = true;
  next.quarterCommit.deadlineStamp = command.deadlineStamp;
  return openBarrier(city, next, state, command);
}

function decidePactEnvelope(city, state, envelope) {
  if (state.quarterCommit.status !== 'defection') {
    return reject(state, 'The defection window is not open.');
  }
  const action = envelope.action;
  const pact = state.activePacts[action.pactId];
  if (!pact || !pact.members.includes(envelope.seatId)) {
    return reject(state, 'Seat is not a member of that pact.');
  }
  if (pact.decisions[envelope.seatId] !== null) {
    return reject(state, 'Pact member has already decided.');
  }
  let decision;
  if (action.type === 'honour-pact') {
    decision = { choice: 'honour', replacementAction: null };
  } else {
    const replacement = action.replacementAction;
    if (
      replacement !== null
      && (
        !replacement
        || typeof replacement.type !== 'string'
        || ['pact', 'commit-quarter', 'defect', 'honour-pact'].includes(replacement.type)
      )
    ) return reject(state, 'Defection replacement must be an ordinary action or null.');
    decision = {
      choice: 'defect',
      replacementAction: replacement === null
        ? { type: 'hold', reason: 'chosen', bankRequested: false }
        : clone(replacement),
    };
  }
  const next = clone(state);
  next.activePacts[action.pactId].decisions[envelope.seatId] = decision;
  next.quarterCommit.nextSeatActionIndex[envelope.seatId] += 1;
  next.log.push(clone(envelope));
  const allDecided = Object.values(next.activePacts).every((active) =>
    active.members.every((member) => active.decisions[member] !== null));
  if (allDecided) return resolveCommittedQuarter(city, next, envelope);
  return {
    state: next,
    events: [{ kind: 'pact-decision-recorded', seatId: envelope.seatId }],
  };
}

export function finaliseDefectionWindow(city, state, worldInput = {}) {
  if (state.quarterCommit.status !== 'defection') {
    return reject(state, 'The defection window is not open.');
  }
  const next = clone(state);
  for (const pact of Object.values(next.activePacts)) {
    for (const member of pact.members) {
      pact.decisions[member] ??= { choice: 'honour', replacementAction: null };
    }
  }
  return resolveCommittedQuarter(city, next, worldInput);
}

export function applyAction(city, state, action) {
  if (state?.onlineView === true) return reject(state, 'Online views are read-only. Send the action to the room server.');
  validateRoomEconomyState(state);
  validateCybercabRun(state);
  validateSeatAuctionState(state);
  // Only explicit, recorded input may cross from the world into city simulation.
  // Existing saves need no new state fields; older actions without a snapshot
  // preserve their saved military roster.
  if (action?.worldMilitary != null) {
    if (action.protocol !== ACTION_PROTOCOL && !['settle', 'station-unit', 'apply-deadline'].includes(action.type)) {
      return reject(state, 'World military input requires a recorded world boundary action.');
    }
    const input = action.worldMilitary;
    if (!Number.isSafeInteger(input.beat) || input.beat < 0
      || !input.caps || Object.keys(input.caps).sort().join(',') !== 'drone,officer,tank'
      || Object.values(input.caps).some((n) => !Number.isInteger(n) || n < 0 || n > 10000)) {
      return reject(state, 'Invalid world military snapshot.');
    }
    const next = clone(state);
    syncMilitaryFromWorld(next, input);
    const result = applyActionWithWorldInput(city, next, action);
    return result.rejected ? { ...result, state } : result;
  }
  return applyActionWithWorldInput(city, state, action);
}

function applyActionWithWorldInput(city, state, action) {
  if (action?.type === 'upgrade-seat-auctions') return upgradeSeatAuctions(state, action);
  if (action?.type === 'apply-deadline' && action?.seatId === SYSTEM_SEAT_ID) {
    return applyDeadline(city, state, action);
  }
  if (action?.protocol === ACTION_PROTOCOL) {
    const invalid = validateEnvelope(state, action);
    if (invalid) return reject(state, invalid);
    if (['defect', 'honour-pact'].includes(action.action.type)) {
      return decidePactEnvelope(city, state, action);
    }
    return queueSeatEnvelope(city, state, action);
  }
  const priorQuarter = state.quarter;
  const result = applyLegacyAction(city, state, action);
  if (result.rejected || !result.state.seats) return result;
  syncCanonicalSeatLayer(result.state);
  if (action.type === 'settle' && result.state.quarter !== priorQuarter) {
    result.state.quarterCommit = emptyQuarterCommit(
      Object.keys(result.state.seats).sort(),
      result.state.quarter,
    );
    result.state.quarterCommit.startStateHash = quarterStartStateHash(result.state);
  }
  return result;
}

/**
 * Read-only legality probe for UI surfaces.
 *
 * The reducer is pure and every successful verb writes to a cloned state before it
 * commits, so probing the real transaction keeps button reasons identical to action
 * rejection reasons without mutating the live run or bypassing the action log.
 */
export function canApplyAction(city, state, action) {
  if (state?.onlineView === true) {
    const seatId = state.activeSeatId;
    const no = reason => ({ ok: false, reason, advisory: true });
    if (state.phase !== 'play') return no('The run is over.');
    if (!seatId || !state.seats?.[seatId]) return no('No active online seat.');
    if (state.quarterCommit?.committedPackets?.[seatId]
      || state.quarterCommit?.committedSeatIds?.includes(seatId)) return no('Your quarter plan is already committed.');
    if (!Array.isArray(state.onlineActionTypes) || !state.onlineActionTypes.includes(action?.type)) {
      return no('This action is unavailable in this online room.');
    }
    // Permission to request a plan entry, not a quote or claim of affordability.
    // Only the server has the complete state needed to validate the transaction.
    return { ok: true, reason: '', advisory: true };
  }
  const result = applyAction(city, state, action);
  if (!result.rejected) return { ok: true, reason: '' };
  return {
    ok: false,
    reason: result.events.find(({ kind }) => kind === 'reject')?.reason
      ?? `${action.type} is unavailable.`,
  };
}

/** The determinism proof. Same seed + same action log -> byte-identical state. */
export function replay(city, actions, options = {}) {
  const runStart = actions[0]?.type === 'run-start' ? actions[0] : null;
  const initial = createRun({
    city,
    seed: city.seed,
    ...options,
    roomEconomyVersion: runStart?.roomEconomyVersion,
    cybercabEconomyVersion: runStart ? runStart.cybercabEconomyVersion : options.cybercabEconomyVersion,
    sellerFeeVersion: runStart ? runStart.sellerFeeVersion : options.sellerFeeVersion,
    cybercabFundingVersion: runStart ? runStart.cybercabFundingVersion : options.cybercabFundingVersion,
    ...(runStart ? {
      operatorId: runStart.operatorId,
      openingCash: runStart.openingCash,
      mode: runStart.mode ?? options.mode,
      seats: runStart.seats ?? options.seats,
    } : {}),
  });
  if (!runStart) return replayFromState(city, initial, actions);
  if (runStart.seed !== city.seed) throw new Error('Replay run-start seed differs from the city seed.');
  initial.log.push(clone(runStart));
  return replayFromState(city, initial, actions.slice(1));
}

/**
 * Reduce strictly by action-log array index. Avatar actions use this same path when
 * their verb lands; avatar-map enumeration is never an action application mechanism.
 */
export function replayFromState(city, initialState, actions) {
  validateRoomEconomyState(initialState);
  let state = initialState;
  for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
    const action = actions[actionIndex];
    const result = applyAction(city, state, action);
    if (result.rejected) throw new Error(`replay rejected ${action.type}: ${result.events[0].reason}`);
    state = result.state;
  }
  return state;
}

/** Canonical serialisation used for equality checks and for local save. */
export function serialise(state) {
  const durable = clone(state);
  for (const avatar of Object.values(durable.avatars ?? {})) {
    delete avatar.quarterProgress;
    delete avatar.pathProgress;
    delete avatar.pathInterpolationParameter;
    delete avatar.pathSegmentIndex;
    delete avatar.derivedRoute;
  }
  return canonicalJson(durable);
}

export function quarterStartStateHash(state) {
  const snapshot = clone(state);
  if (snapshot.quarterCommit) snapshot.quarterCommit.startStateHash = null;
  return hash32(serialise(snapshot)).toString(16);
}

export function deserialiseState(canonicalState, { city = null } = {}) {
  if (typeof canonicalState !== 'string') {
    throw new TypeError('Canonical state must be a string.');
  }
  let parsed;
  try {
    parsed = JSON.parse(canonicalState);
  } catch {
    throw new Error('Canonical state is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('Canonical state must contain one state object.');
  }
  if (parsed.version < STATE_VERSION) {
    if (!city) throw new Error('A city is required to migrate an older state.');
    return migrateState(city, parsed);
  }
  if (parsed.version !== STATE_VERSION) throw new Error('Unsupported state version.');
  validateRoomEconomyState(parsed);
  validateSellerFeeRun(parsed);
  validateCybercabFundingRun(parsed);
  validateCybercabRun(parsed);
  validateSeatAuctionState(parsed);
  parsed.seats = validateSeats(parsed.seats, { mode: parsed.mode ?? null });
  for (const seatId of Object.keys(parsed.seats).sort()) {
    if (!parsed.seatEconomy?.[seatId] || !parsed.seatCredit?.[seatId]) {
      throw new Error(`State is missing seat records for ${seatId}.`);
    }
  }
  restoreKitSeqWatermark(parsed.kitSeqWatermark);
  restoreProcessDrawWatermark(parsed.processDrawWatermark);
  restoreProcessDrawLog(parsed.processDrawLog);
  if (serialise(parsed) !== canonicalState) {
    throw new Error('State bytes are not canonical or do not round-trip.');
  }
  return sealFrameworkState(parsed);
}

export function publicSeatState(city, state) {
  const economy = {};
  for (const seatId of Object.keys(state.seats).sort()) {
    economy[seatId] = {
      cash: state.seatEconomy[seatId].cash,
      debt: debtOf(state, seatId),
      nav: navOf(city, state, seatId),
      holdingCount: Object.values(state.holdings)
        .filter((holding) => holding.ownerSeatId === seatId).length,
      committed: Boolean(state.quarterCommit.committedPackets[seatId]),
    };
  }
  const avatars = {};
  for (const seatId of Object.keys(state.seats).sort()) {
    const avatar = state.avatars[seatId];
    if (!avatar) continue;
    avatars[seatId] = {
      id: seatId,
      quarterStartPosition: clone(avatar.fromAnchor),
      auctionAttendance: avatar.destination?.kind === 'parcel'
        ? avatar.destination.id
        : null,
    };
  }
  return {
    seed: state.seed,
    quarter: state.quarter,
    phase: state.phase,
    mode: state.mode,
    seats: clone(state.seats),
    economy,
    holdings: clone(state.holdings),
    parcelStatus: clone(state.parcelStatus),
    sectors: clone(state.sectors),
    districtIndexBp: clone(state.districtIndexBp),
    events: seatAuctionEventsForView(state),
    quarterCommit: {
      status: state.quarterCommit.status,
      committedSeatIds: [...state.quarterCommit.committedSeatIds].sort(),
      deadlineApplied: state.quarterCommit.deadlineApplied,
      resolutionOrder: [...state.quarterCommit.resolutionOrder],
    },
    pactResults: clone(state.pactResults),
    avatars,
  };
}

export function privateSeatState(state, seatId) {
  if (!state.seats[seatId]) throw new RangeError(`Unknown seat: ${seatId}`);
  const activePacts = Object.fromEntries(Object.entries(state.activePacts)
    .filter(([, pact]) => pact.members.includes(seatId))
    .map(([pactId, pact]) => {
      const privatePact = clone(pact);
      const pactDecided = pact.members.every((member) => pact.decisions[member] !== null);
      if (!pactDecided) {
        for (const member of pact.members) {
          if (member !== seatId) privatePact.decisions[member] = null;
        }
      }
      return [pactId, privatePact];
    }));
  return {
    seatId,
    economy: clone(state.seatEconomy[seatId]),
    credit: clone(state.seatCredit[seatId]),
    private: clone(state.seatPrivate[seatId]),
    avatar: state.avatars[seatId] ? clone(state.avatars[seatId]) : null,
    pendingActions: clone(state.quarterCommit.pendingActions[seatId] ?? []),
    committedPacket: state.quarterCommit.committedPackets[seatId]
      ? clone(state.quarterCommit.committedPackets[seatId])
      : null,
    activePacts,
  };
}

export function runResult(city, state) {
  const playerNav = navOf(city, state, 'player');
  const rivalNav = navOf(city, state, 'rival');
  const ratio = rivalNav > 0 ? playerNav / rivalNav : 2;
  const band = gradeFor(ratio);
  const held = Object.keys(state.holdings)
    .sort()
    .filter((id) => state.holdings[id].owner === 'player');
  let corridors = 0;
  for (const id of held) corridors += corridorLinks(city, state, id).length;
  return {
    playerNav,
    rivalNav,
    ratio,
    grade: state.grade ?? band.grade,
    gradeLabel: state.grade === 'INSOLVENT' ? 'Insolvent' : band.label,
    parcels: held.length,
    corridorLinks: corridors / 2,
    renovated: held.filter((id) =>
      conditionOf(city, state, id) > activeParcel(city, state, id).condition).length,
    redeveloped: held.filter((id) => levelOf(state, id) > 0).length,
    growthBp: Math.round((playerNav * 10000) / state.startNav) - 10000,
  };
}
