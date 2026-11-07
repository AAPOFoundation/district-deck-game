import { floorFromOpeningNav, ruleCall, worksStandingValue } from './rule-calls.js';
import { roomTransferBase } from './room-economy-lifecycle.js';
import { ordinarySellerBaseBp, clampSellerFeeBp } from './seller-fee-contract.js';
// District Deck V3.00 — the finance engine.
// Framework §4. Integer game dollars only. Every function here is pure: (city, state) in,
// numbers out. Nothing in this file mutates, renders, or reads the clock.

import { applyBp, stream } from './rng.js';
import { BUSHFIRE_BURN_BEATS } from './weather.js';
import { settleCybercab, cybercabForOwner } from './cybercab.js';
export { cybercabIncomeLine } from './cybercab.js';
import {
  ARCHETYPES, DISTRICTS, RULES, SECTOR_IDS, SURVEY_DEFECT_TIERS,
  rulesFor, favourCostScaleBp,
} from './content.js';
import {
  activeEvent, activeInterestRateBp, insuranceDeductible, insurancePremium, TENANT_TERMS,
} from './event-rules.js';
import {
  auctionResolving, auctionResolution, eventsResolving,
} from './events.js';
import { holdingFrameworkDefaults } from './intel.js';
import { activeFamilySignalBlocks, humanDemandByBlock } from './people.js';
import { districtEffectBpForParcel, resolvePairSynergies } from './landuse.js';
import {
  activeAdjacency, activeParcel, resolveCurrentParcelId,
} from './city.js';
import {
  buildingBaseFor, consolidatedYieldBaseFor, eraBand, nextArchetypeId, renovateBase,
} from './succession.js';
import {
  roomRenovateQuote as roomRenovateQuoteCore,
  pendingRoomJob,
} from './renovation-rooms.js';
import {
  defaultPlanningCeilingFor, maxPermitLevelFor, minimumPlanningLevelFor, planningCeilingAllows,
  redevelopFinishArchetype,
} from './planning-permits.js';
import {
  constructionDurationQuarters,
  constructionStage,
  isResidentialBuildTarget,
} from './construction-stages.js';
import {
  applyVentureStep,
  activeVenture,
  listedTickerOf,
  LISTED_USE_REASON,
  operatingBaseRent,
  ventureCashburnForOwner,
} from './ventures.js';
import { petrolForecourtForOwner } from './petrol-yield.js';
import { standingPadSlotCount } from './pad-slots.js';
import { applyInflationStep, priceIndexBp } from './rates.js';
import {
  civicUpgradeRentBp, civicUpgradeValueBp, hospitalityValueMultBp,
} from './civic-works.js';
import {
  capitaliseQuarterlyRent,
  franchiseUseMarket,
  rollCommercialCapRate, commercialTenantTerms, isFranchiseTenancyUse,
  rollCommercialAnchor, COMMERCIAL_TENANT_TERM_QUARTERS,
} from './commercial-tenancy.js';

export const TOPOLOGY_FEE_BP = Object.freeze({
  consolidate: 200,
  subdivide: 300,
});

export function sectorIndexBp(state, sector) {
  return state.sectors[sector];
}

export function districtIndexBp(state, districtId) {
  return state.districtIndexBp?.[districtId] ?? 10000;
}

export function blockValueIndexBp(city, state, id) {
  const parcel = activeParcel(city, state, id);
  if (!parcel) return 10000;
  return state.blockValueIndexBp?.[`${parcel.bx},${parcel.bz}`] ?? 10000;
}

/** Compound one authored value-drift step into every currently signalled family block. */
export function applyFamilySignalValueDrift(city, state) {
  state.blockValueIndexBp ??= {};
  const moves = {};
  for (const blockId of activeFamilySignalBlocks(city, state)) {
    const before = state.blockValueIndexBp[blockId] ?? 10000;
    const realisedBp = RULES.familySignalValueDriftBp;
    const after = applyBp(before, 10000 + realisedBp);
    state.blockValueIndexBp[blockId] = after;
    moves[blockId] = { before, realisedBp, indexAfter: after, source: 'family-signal' };
  }
  return moves;
}

const DISTRICT_BY_ID = Object.freeze(Object.fromEntries(
  DISTRICTS.map((district) => [district.id, district]),
));

/** Authored L3 suburb band. This is the single source for cost, value and rent scaling. */
export function l3DistrictBandBp(districtId) {
  return DISTRICT_BY_ID[districtId]?.l3EconomyBandBp ?? 10000;
}

export function isL3Form(archetypeOrId) {
  return minimumPlanningLevelFor(archetypeOrId) === RULES.maxLevel;
}

export function l3RentFloorForDistrict(districtId) {
  return applyBp(RULES.l3RentFloorBase, l3DistrictBandBp(districtId));
}

function l3Scaled(amount, archetypeOrId, districtId) {
  return isL3Form(archetypeOrId)
    ? applyBp(amount, l3DistrictBandBp(districtId))
    : amount;
}

function l3QuarterlyRent(amount, archetypeOrId, districtId) {
  if (!isL3Form(archetypeOrId)) return amount;
  return Math.max(
    l3Scaled(amount, archetypeOrId, districtId),
    l3RentFloorForDistrict(districtId),
  );
}

export function levelOf(state, id) {
  const builtLevel = state.parcelStatus?.[id]?.builtLevel;
  return builtLevel > 0 ? builtLevel : state.holdings[id]?.level ?? builtLevel ?? 0;
}

export function conditionOf(city, state, id) {
  return state.parcelStatus?.[id]?.condition
    ?? state.holdings[id]?.condition
    ?? activeParcel(city, state, id)?.condition
    ?? 0;
}

/** A survey stays current only while its condition certificate and both hazard bands agree. */
export function parcelSurveyComplete(state, id) {
  const intel = state?.intel?.parcels?.[id];
  const status = state?.parcelStatus?.[id];
  return Boolean(
    intel?.conditionRevealed
    && intel.floodExposureBp !== null
    && intel.floodExposureBp !== undefined
    && intel.fireExposureBp !== null
    && intel.fireExposureBp !== undefined
    && status?.surveyedConditionVersion !== null
    && status?.surveyedConditionVersion !== undefined
    && status.surveyedConditionVersion === status.conditionVersion
  );
}

export function conditionAssessmentChanceBp(city, state, id) {
  const condition = conditionOf(city, state, id);
  if (condition === 0) return 2200;
  if (condition === RULES.maxCondition) return 0;
  const archetype = ARCHETYPES[archetypeIdOf(city, state, id)];
  return ['historic', 'interwar', 'industrial'].includes(eraBand(archetype)) ? 800 : 500;
}

export function conditionAssessmentForAcquisition(city, state, id, actionOrdinal) {
  const status = state.parcelStatus[id];
  if (
    status.surveyedConditionVersion !== null
    && status.surveyedConditionVersion === status.conditionVersion
  ) return null;
  const chanceBp = conditionAssessmentChanceBp(city, state, id);
  if (chanceBp <= 0) return null;
  return {
    displayedCondition: conditionOf(city, state, id),
    chanceBp,
    roll: stream(
      state.seed,
      `parcels:q${state.quarter}:condition-settlement:${id}:${actionOrdinal}`,
    ).int(0, 9999),
    resolveQuarter: state.quarter,
  };
}

export function conditionAssessmentRisk(city, state, id) {
  const displayedCondition = conditionOf(city, state, id);
  const displayedMarketValue = marketValue(city, state, id);
  const chanceBp = conditionAssessmentChanceBp(city, state, id);
  const lowerValue = displayedCondition > 0
    ? Math.round(
      displayedMarketValue
      * RULES.conditionValueBp[displayedCondition - 1]
      / RULES.conditionValueBp[displayedCondition],
    )
    : applyBp(displayedMarketValue, RULES.hazardDamageValueBp);
  const lossIfDowngraded = Math.max(0, displayedMarketValue - lowerValue);
  const expectedLossAvoided = applyBp(lossIfDowngraded, chanceBp);
  return {
    displayedCondition,
    displayedMarketValue,
    chanceBp,
    lossIfDowngraded,
    expectedLossAvoided,
    surveyPositiveEV: expectedLossAvoided > RULES.surveyCost,
  };
}

/**
 * Resolve the already-stored acquisition roll against a cloned settlement projection.
 * The stored input remains the authority even when another step has since touched the parcel.
 */
export function resolveConditionAssessment(city, state, id) {
  const holding = state.holdings[id];
  const assessment = holding?.conditionAssessment;
  if (!assessment || assessment.resolveQuarter > state.quarter) return null;
  const status = state.parcelStatus[id];
  const downgrade = assessment.roll < assessment.chanceBp;
  const assessedCondition = downgrade && assessment.displayedCondition > 0
    ? assessment.displayedCondition - 1
    : assessment.displayedCondition;
  const conditionAfter = Math.min(
    holding.condition ?? status.condition,
    status.condition,
    assessedCondition,
  );
  let outcome = 'pass';
  if (downgrade && assessment.displayedCondition > 0) {
    const rebased = renovateBase(
      holding.basePrice,
      holding.baseRent,
      assessment.displayedCondition,
      assessedCondition,
    );
    holding.basePrice = rebased.basePrice;
    holding.baseRent = rebased.baseRent;
    holding.condition = conditionAfter;
    status.condition = conditionAfter;
    status.conditionVersion += 1;
    outcome = 'downgrade';
  } else if (downgrade) {
    holding.condition = conditionAfter;
    status.condition = conditionAfter;
    // A same-settlement flood/fire is later board information and must outrank
    // the acquisition-time latent-defect label.
    status.damage ??= 'latent';
    status.conditionVersion += 1;
    outcome = 'latent-defect';
  }
  holding.conditionAssessment = null;
  return {
    kind: 'condition-assessment',
    owner: holding.owner,
    parcelId: id,
    displayedCondition: assessment.displayedCondition,
    chanceBp: assessment.chanceBp,
    roll: assessment.roll,
    downgrade,
    outcome,
    conditionAfter,
    damage: status.damage,
    cashOut: 0,
    debtTaken: 0,
  };
}

export function archetypeIdOf(city, state, id) {
  return state.parcelStatus?.[id]?.builtArchetypeId
    ?? state.holdings[id]?.archetypeId
    ?? activeParcel(city, state, id)?.archetypeId
    ?? null;
}

export function sectorOf(city, state, id) {
  return ARCHETYPES[archetypeIdOf(city, state, id)]?.sector
    ?? activeParcel(city, state, id)?.sector
    ?? null;
}

export function ownerOf(state, id) {
  return state.holdings[id]?.owner ?? null;
}

/** Standing Hammerbarn pad, if this city has one. */
export function standingHammerbarnId(city, state) {
  const order = city.order ?? Object.keys(city.parcels ?? {});
  for (const id of [...order].sort()) {
    if (archetypeIdOf(city, state, id) === 'hammerbarn') return id;
  }
  return null;
}

/**
 * Hardware-warehouse trade on a construction / renovation bill.
 * L0: owner pays 90%, anyone else pays the bill plus 10% to that owner.
 * L1 double-storey: 80% / 20%.
 */
export function hammerbarnTradeRates(city, state) {
  const barnId = standingHammerbarnId(city, state);
  const upgraded = Boolean(barnId && levelOf(state, barnId) >= 1);
  return {
    barnId,
    upgraded,
    ownerWorksBp: upgraded ? 8000 : RULES.hammerbarnOwnerWorksBp,
    tradeBp: upgraded ? 2000 : RULES.hammerbarnTradeBp,
  };
}

export function hammerbarnTradeFor(city, state, builderOwner, worksCost) {
  const rates = hammerbarnTradeRates(city, state);
  const barnOwner = rates.barnId ? ownerOf(state, rates.barnId) : null;
  if (!rates.barnId || !barnOwner) {
    return {
      cost: worksCost,
      royalty: 0,
      royaltyTo: null,
      barnId: rates.barnId,
      ownerDiscount: false,
    };
  }
  const same = barnOwner === builderOwner
    || (barnOwner === 'player' && builderOwner === 'P1')
    || (barnOwner === 'rival' && builderOwner === 'R1');
  if (same) {
    return {
      cost: applyBp(worksCost, rates.ownerWorksBp),
      royalty: 0,
      royaltyTo: null,
      barnId: rates.barnId,
      ownerDiscount: true,
    };
  }
  return {
    cost: worksCost,
    royalty: applyBp(worksCost, rates.tradeBp),
    royaltyTo: barnOwner,
    barnId: rates.barnId,
    ownerDiscount: false,
  };
}

function withHammerbarnTrade(city, state, owner, hiredCost) {
  const favoured = (owner === 'player' || owner === 'P1')
    ? applyBp(hiredCost, favourCostScaleBp(state.favour ?? 0))
    : hiredCost;
  const trade = hammerbarnTradeFor(city, state, owner, favoured);
  const debtTaken = applyBp(trade.cost, acquisitionLvrBp(state, owner));
  return {
    cost: trade.cost,
    debtTaken,
    cashOut: trade.cost - debtTaken + trade.royalty,
    hammerbarnRoyalty: trade.royalty,
    hammerbarnRoyaltyTo: trade.royaltyTo,
    hammerbarnOwnerDiscount: trade.ownerDiscount,
    hammerbarnParcelId: trade.barnId,
  };
}

/**
 * UI-only ownership label relative to whichever seat is currently viewing, not the
 * canonical `owner` field (which mirrors multi-seat `ownerSeatId` down to a legacy
 * 'player'/'rival' pair anchored on P1 — correct for solo, wrong for any other seat
 * viewing its own hotseat turn). Never use this for reducer/legality logic.
 */
export function viewerOwner(state, id, viewerSeatId = 'P1') {
  const ownerSeatId = state.holdings[id]?.ownerSeatId;
  if (!ownerSeatId) return null;
  return ownerSeatId === viewerSeatId ? 'player' : 'rival';
}

function blockKey(city, state, id) {
  const parcel = activeParcel(city, state, id);
  return parcel ? `${parcel.bx},${parcel.bz}` : null;
}

export function peopleValueBp(city, state, id) {
  return state.blockDemandBp?.[blockKey(city, state, id)] ?? 0;
}

export function peopleRentBp(city, state, id) {
  return Math.round(peopleValueBp(city, state, id) * 6000 / 10000);
}

export function activeLvrBp(state) {
  for (const avatarId of Object.keys(state.avatars ?? {}).sort()) {
    const offer = state.avatars[avatarId].brokerOffer;
    if (
      offer?.kind === 'lvr'
      && offer.expiresAfterQuarter >= state.quarter
    ) return offer.valueBp;
  }
  return RULES.lvrBp;
}

/** Cash that must be free at a bid cap: deposit plus stamp duty, after LVR debt. */
export function auctionCashAtCap(maxBid, lvrBp = RULES.lvrBp) {
  return maxBid - applyBp(maxBid, lvrBp) + applyBp(maxBid, RULES.dutyBp);
}

/**
 * Highest increment-legal max bid the owner can fund, using the same overdraft
 * floor as `doBid`. Auction reservations are ignored so a raise can replace the
 * current commitment rather than stacking it.
 */
export function fundableAuctionMax(city, state, increment, owner = 'player') {
  if (!Number.isInteger(increment) || increment < 1) return 0;
  const lvrBp = owner === 'player'
    ? state.onlineView && state.onlineAuctionLvrBp !== undefined ? state.onlineAuctionLvrBp : activeLvrBp(state)
    : RULES.lvrBp;
  const cashRateBp = 10000 - lvrBp + RULES.dutyBp;
  if (cashRateBp <= 0) return 0;
  const funds = cashPosition(city, state, owner, 0, { reserveAuction: false });
  const available = Math.max(0, funds.postActionAvailableCash - funds.overdraftFloor);
  const raw = Math.floor((available * 10000) / cashRateBp);
  return Math.floor(raw / increment) * increment;
}

export function activeInterestBp(state) {
  return activeInterestRateBp(state, 'player');
}

function activeMaterialsCostBp(state) {
  for (const eventId of [...(state.events?.order ?? [])].sort()) {
    const event = state.events.byId[eventId];
    if (
      event.type === 'materials-spike'
      && event.status !== 'resolved'
      && event.status !== 'cancelled'
      && event.resolveQuarter === state.quarter
    ) return RULES.materialsSpikeCostBp;
  }
  return 10000;
}

function designBuildAtParcel(state, parcelId) {
  const entities = [...(state.people?.order ?? [])].sort()
    .map((id) => state.people.byId[id])
    .filter((person) =>
      person.toAnchor.kind === 'parcel' && person.toAnchor.id === parcelId)
    .map((person) => ({
      id: person.id,
      key: person.id,
      kind: 'person',
      typeId: person.archetypeId,
      anchor: person.toAnchor,
      tiles: [],
    }));
  return resolvePairSynergies(entities, {
    distance: (left, right) => (
      left.anchor.kind === right.anchor.kind && left.anchor.id === right.anchor.id
        ? 0
        : Infinity
    ),
  }).some(({ name }) => name === 'Design and build');
}

/** Active hire contracts on a holding (supports architect + builder together). */
export function activeHires(holding, quarter = null) {
  if (!holding) return Object.freeze({});
  const q = quarter ?? Number.POSITIVE_INFINITY;
  const out = {};
  // New shape: hires map by profession.
  if (holding.hires && typeof holding.hires === 'object') {
    for (const [profession, contract] of Object.entries(holding.hires)) {
      if (contract && (contract.expiresAfterQuarter ?? 0) >= q) out[profession] = contract;
    }
  }
  // Legacy single hire field.
  if (holding.hire?.profession && (holding.hire.expiresAfterQuarter ?? 0) >= q) {
    out[holding.hire.profession] = holding.hire;
  }
  return out;
}

export function worksTerms(state, parcelId) {
  const rules = rulesFor(state);
  const hires = activeHires(state.holdings[parcelId], state.quarter);
  const builder = hires['cheap-builder'] ?? null;
  const architect = hires.architect ?? null;
  if (!builder && !architect) {
    return {
      profession: null,
      worksCostBp: 10000,
      defectChanceBp: rules.baseWorksDefectBp,
      tenantRentBp: RULES.renovationTenantBp,
      successionSteps: 1,
    };
  }
  // Both hired: design-and-build — cheaper works, moderated defect, architect succession.
  if (builder && architect) {
    return {
      profession: 'design-build',
      worksCostBp: RULES.cheapBuilderCostBp,
      defectChanceBp: RULES.designBuildDefectBp,
      tenantRentBp: RULES.architectTenantBp,
      successionSteps: architect.brief === 'succession' ? 2 : 1,
    };
  }
  if (builder) {
    return {
      profession: 'cheap-builder',
      worksCostBp: RULES.cheapBuilderCostBp,
      defectChanceBp: designBuildAtParcel(state, parcelId)
        ? RULES.designBuildDefectBp
        : RULES.cheapBuilderDefectBp,
      tenantRentBp: RULES.cheapBuilderTenantBp,
      successionSteps: 1,
    };
  }
  return {
    profession: 'architect',
    worksCostBp: RULES.architectCostBp,
    defectChanceBp: 0,
    tenantRentBp: RULES.architectTenantBp,
    successionSteps: architect.brief === 'succession' ? 2 : 1,
  };
}

/**
 * Current market value: the standing building's own re-banded base × its current
 * sector index × corridor premium. A site uses the incoming building's finished base
 * but retains the outgoing sector until completion, then takes the construction haircut.
 */
export function marketValue(city, state, id) {
  const parcel = activeParcel(city, state, id);
  if (!parcel) return 0;
  const holding = state.holdings[id];
  const standingBase = holding ?? roomTransferBase(state, id, (
    parcel.consolidated
      ? parcel
      : buildingBaseFor(
        parcel,
        archetypeIdOf(city, state, id),
        conditionOf(city, state, id),
        { parcelStatus: state.parcelStatus?.[id] },
      )
  ));
  const constructionBase = holding?.construction
    ? buildingBaseFor(parcel, holding.construction.toArchetype, RULES.maxCondition, {
      parcelStatus: state.parcelStatus?.[id],
    })
    : null;
  const pricedArchetypeId = holding?.construction?.toArchetype
    ?? archetypeIdOf(city, state, id);
  const basePrice = constructionBase?.basePrice ?? standingBase.basePrice;
  const index = sectorIndexBp(state, sectorOf(city, state, id));
  const level = levelOf(state, id);
  const levelBp = RULES.levelValueBp?.[level] ?? 10000;
  // The incoming form and the retained pad use the identical standing chain.
  // Only the pad-floor alternative evaluates the outgoing base a second time.
  const standingFor = (basePrice, archetypeId) => {
    const ordinaryStandingValue = applyBp(
      applyBp(
        applyBp(
          applyBp(
            applyBp(basePrice, index),
            districtIndexBp(state, parcel.districtId),
          ),
          blockValueIndexBp(city, state, id),
        ),
        10000 + peopleValueBp(city, state, id),
      ),
      10000 + corridorValueBp(city, state, id),
    );
    const levelledStandingValue = applyBp(
      ordinaryStandingValue,
      levelBp,
    );
    const standingValue = l3Scaled(
      levelledStandingValue,
      archetypeId,
      parcel.districtId,
    );
    const withHeritage = applyBp(
      standingValue,
      10000 + Math.min(500, holding?.heritageQualityBp ?? 0),
    );
    const withDamage = holding || state.parcelStatus?.[id]?.damage
      ? applyBp(
        withHeritage,
        state.parcelStatus?.[id]?.damage ? RULES.hazardDamageValueBp : 10000,
      )
      : withHeritage;
    return withDamage;
  };
  const incomingStanding = standingFor(basePrice, pricedArchetypeId);
  const standing = holding?.construction
    ? worksStandingValue({
      worksValue: applyBp(incomingStanding, RULES.constructionValueBp),
      padValue: ruleCall('worksValue') === 'pad-floor'
        ? standingFor(standingBase.basePrice, archetypeIdOf(city, state, id))
        : 0,
    })
    : incomingStanding;
  if (listedTickerOf(holding)) return 0;
  const venture = activeVenture(holding);
  if (venture?.valuation) {
    return applyBp(
      venture.valuation,
      10000 + districtEffectBpForParcel(city, state, id, 'value'),
    );
  }
  const anchorMark = commercialAnchorValuation(city, state, id);
  if (anchorMark) return anchorMark.valuation;
  const withCivic = applyBp(standing, 10000 + civicUpgradeValueBp(city, state, id));
  const withHospitality = applyBp(withCivic, hospitalityValueMultBp(city, state, id));
  const districtEffect = districtEffectBpForParcel(city, state, id, 'value');
  const withDistrict = applyBp(withHospitality, 10000 + districtEffect);
  const ordinary = applyBp(withDistrict, priceIndexBp(state));
  // Standing industrial sheds trade in the $12m-$18m band by district (V3.40 E1, critic
  // F2): the band is an ASKING floor — index-independent, so a soft price index cannot
  // deflate a shed below it — and a formed district still lifts it (floor × effect).
  const archId = archetypeIdOf(city, state, id);
  if (/^(warehouse-brick|warehouse-richmond-loft|factory-light|hammerbarn)$/.test(String(archId))
    && !holding?.construction && !holding?.siteCleared) {
    const bands = DISTRICTS.map((d) => d.l3EconomyBandBp ?? 10000);
    const lo = Math.min(...bands);
    const hi = Math.max(...bands);
    const mine = DISTRICTS.find((d) => d.id === parcel.districtId)?.l3EconomyBandBp ?? lo;
    const t = hi === lo ? 0 : (mine - lo) / (hi - lo);
    const floor = Math.round(12_000_000 + t * 6_000_000);
    return Math.max(ordinary, applyBp(floor, 10000 + districtEffect));
  }
  return ordinary;
}

/** The works mark uses the same authority and premiums as portfolio NAV. */
export function worksValueAt(city, state, id) {
  return marketValue(city, state, id);
}

/**
 * Value premium from corridor membership, in basis points.
 *
 * The premium is RECOGNISED AT THE NEXT SETTLEMENT, not on the day of purchase. Without
 * that delay a parcel that joins two holdings is worth more the instant it is bought,
 * and since divesting is free the round trip prints money: a 9% premium against a 7.5%
 * duty-plus-fee round trip is an arbitrage, not a strategy.
 *
 * Maturity is an explicit flag on the holding, NOT derived from `state.quarter`. Deriving
 * it meant the premium switched on the instant settlement advanced the quarter, so the
 * NAV written into the ledger and the NAV of the state handed back differed by the whole
 * premium — and a final-quarter purchase never matured at all.
 */
export function corridorValueBp(city, state, id) {
  const holding = state.holdings[id];
  if (!holding || !holding.mature) return 0;
  let links = 0;
  for (const neighbour of activeAdjacency(city, state, id)) {
    const other = state.holdings[neighbour];
    if (!other || other.owner !== holding.owner || !other.mature) continue;
    links += 1;
  }
  return Math.min(links * RULES.corridorValueBp, RULES.corridorValueCapBp);
}

/**
 * What the corridor would be worth if the player acquired this parcel right now.
 * The card shows this BEFORE commitment — otherwise adjacency is a lesson you only
 * learn from the results screen.
 */
export function corridorIfAcquired(city, state, id, owner = 'player') {
  const links = activeAdjacency(city, state, id).filter((n) => ownerOf(state, n) === owner);
  return {
    links,
    rentBp: Math.min(links.length * RULES.corridorLinkBp, RULES.corridorCapBp),
    valueBp: Math.min(links.length * RULES.corridorValueBp, RULES.corridorValueCapBp),
  };
}

/**
 * Corridor uplift in basis points: 800 per orthogonally adjacent parcel held by the
 * SAME owner, capped at 3200. Geography, not volume, is what compounds.
 */
export function corridorBp(city, state, id) {
  const owner = ownerOf(state, id);
  if (!owner) return 0;
  let links = 0;
  for (const neighbour of activeAdjacency(city, state, id)) {
    if (ownerOf(state, neighbour) === owner) links += 1;
  }
  return Math.min(links * RULES.corridorLinkBp, RULES.corridorCapBp);
}

export function corridorLinks(city, state, id) {
  const owner = ownerOf(state, id);
  if (!owner) return [];
  return activeAdjacency(city, state, id).filter((n) => ownerOf(state, n) === owner);
}

/** Shared lease terms and legality; action-slot accounting belongs to the caller. */
export function leaseQuote(city, state, id, tenantQuality, owner = 'player') {
  const no = reason => ({ ok: false, reason });
  if (!['player', 'rival'].includes(owner)) return no('Unknown lease owner.');
  const holding = state.holdings[id];
  if (!holding || holding.owner !== owner) return no('You do not hold this parcel.');
  const status = state.parcelStatus[id];
  const parcel = activeParcel(city, state, id);
  const useId = archetypeIdOf(city, state, id);
  const commercialUse = isFranchiseTenancyUse(useId);
  const terms = commercialUse ? commercialTenantTerms(useId, tenantQuality) : TENANT_TERMS[tenantQuality];
  if (!terms || !Number.isFinite(terms.rentBp)) return no('Unknown tenant quality.');
  const vacantPad = Boolean(parcel?.consolidated && status?.builtArchetypeId == null && (status?.builtLevel ?? 0) === 0);
  if (holding.demolition && !holding.siteCleared) return no('Finish demolition first.');
  if (holding.construction || holding.renovation) return no('Works must finish before this parcel can be leased.');
  if (holding.siteCleared || vacantPad) return no('Nothing standing to lease.');
  if (status.occupancy === 'squatted') return no('Remediate the parcel before leasing it.');
  if (status.tenant && status.tenant.expiresAfterQuarter >= state.quarter) return no('This parcel already has an active tenant.');
  const funds = cashPosition(city, state, owner, RULES.leaseFee);
  if (!funds.ok) return no(`Short $${funds.shortfall} against the overdraft floor.`);
  const anchor = commercialUse && terms.anchorCandidate ? rollCommercialAnchor(state.seed, id, state.quarter, useId) : null;
  const termQuarters = commercialUse ? COMMERCIAL_TENANT_TERM_QUARTERS : 4;
  return { ok: true, cashOut: RULES.leaseFee, termQuarters, tenant: {
    quality: tenantQuality,
    label: terms.label ?? `${tenantQuality} tenant`,
    rentBp: terms.rentBp,
    arrearsChanceBp: terms.arrearsChanceBp,
    expiresAfterQuarter: state.quarter + termQuarters - 1,
    paymentAtRisk: false,
    ...(commercialUse ? { commercialUseId: useId } : {}),
    ...(anchor ? { anchor } : {}),
  } };
}

/** Quarterly gross rent. Vacancy, squatting, damage and construction are explicit zero-rent states. */
export function rentFor(city, state, id) {
  if (activeParcel(city, state, id)?.surveyedFarm) return state.farms?.[id]?.completedQuarter != null && state.quarter >= state.farms[id].completedQuarter ? ARCHETYPES.farm.baseRent : 0;
  const parcel = activeParcel(city, state, id);
  const holding = state.holdings[id];
  if (!parcel || !holding?.owner) return 0;
  if (holding.construction && standingPadSlotCount(holding) === 0) return 0;
  if (activeVenture(holding) || listedTickerOf(holding)) return 0;
  const status = state.parcelStatus?.[id];
  if (
    status
    && (
      status.occupancy !== 'tenant'
      || status.damage
      || status.tenant?.paymentAtRisk
    )
  ) return 0;
  const level = levelOf(state, id);
  const levelRentBp = RULES.levelRentBp?.[level] ?? 10000;
  const authoredRent = operatingBaseRent(
    archetypeIdOf(city, state, id),
    holding.baseRent ?? parcel.baseRent,
  );
  let rent = applyBp(
    authoredRent,
    10000 + peopleRentBp(city, state, id),
  );
  rent = applyBp(rent, 10000 + corridorBp(city, state, id));
  rent = applyBp(rent, levelRentBp);
  rent = l3QuarterlyRent(rent, archetypeIdOf(city, state, id), parcel.districtId);
  if (status?.tenant) rent = applyBp(rent, status.tenant.rentBp);
  if (status?.tenant?.anchor?.landed) {
    rent = applyBp(rent, status.tenant.anchor.rentBp ?? 10000);
  }
  if (holding.renovation && status?.occupancy === 'tenant') {
    rent = applyBp(rent, holding.renovation.tenantRentBp);
  }
  if (holding.redevelopmentNotice && status?.occupancy === 'tenant') {
    rent = applyBp(rent, holding.redevelopmentNotice.tenantRentBp);
  }
  rent = applyBp(rent, 10000 + civicUpgradeRentBp(city, state, id));
  rent = applyBp(rent, hospitalityValueMultBp(city, state, id));
  rent = applyBp(
    rent,
    10000 + districtEffectBpForParcel(city, state, id, 'rent'),
  );
  return applyBp(rent, priceIndexBp(state));
}

/**
 * A landed big-brand anchor is marked from rent collected in the current cash period at
 * a named per-quarter investor yield. Arrears therefore haircut Books, NAV and divestQuote
 * together instead of being cloned out of the bid.
 */
export function commercialAnchorValuation(city, state, id) {
  const holding = state.holdings?.[id];
  const status = state.parcelStatus?.[id];
  const anchor = status?.tenant?.anchor;
  if (
    !holding?.owner
    || holding.construction
    || status?.occupancy !== 'tenant'
    || !anchor?.landed
  ) return null;
  const useId = status.tenant.commercialUseId ?? archetypeIdOf(city, state, id);
  const market = franchiseUseMarket(useId);
  if (!market) return null;
  const quarterlyRent = rentFor(city, state, id);
  const annualRent = quarterlyRent * 4;
  const cap = rollCommercialCapRate(state.seed, id, state.quarter, useId);
  return Object.freeze({
    useId,
    brand: anchor.brand,
    quarterlyRent,
    annualRent,
    capRateBp: cap.capRateBp,
    capRateBasis: cap.basis,
    capRateMinBp: market.capRateMinBp,
    capRateMaxBp: market.capRateMaxBp,
    investor: cap.investor,
    arrearsAdjusted: Boolean(status.tenant.paymentAtRisk),
    valuation: capitaliseQuarterlyRent(quarterlyRent, cap.capRateBp),
    stream: cap.stream,
  });
}

export function heldBy(state, owner) {
  return Object.keys(state.holdings).sort().filter((id) => {
    const holding = state.holdings[id];
    if (owner === 'player' || owner === 'rival') return holding.owner === owner;
    return holding.ownerSeatId === owner;
  });
}

export function portfolioValue(city, state, owner) {
  let total = Object.values(state.farms ?? {}).filter((farm) => farm.owner === owner).reduce((sum, farm) => sum + farm.basis, 0);
  const business = cybercabForOwner(state, owner);
  if (business) total += business.fleet.reduce((sum, cab) => sum + cab.basis, 0) + business.depot.basis;
  for (const id of heldBy(state, owner)) total += marketValue(city, state, id);
  return total;
}

/** Cash book of listed equities + crypto (Stock Exchange venue) — marks into NAV. */
export function listedBookValue(state, owner) {
  const key = owner === 'P1' || owner === 'player' ? 'player'
    : owner === 'R1' || owner === 'rival' ? 'rival'
      : null;
  if (!key || !state.markets) return 0;
  const book = state.markets.portfolios?.[key] ?? {};
  const prices = state.markets.prices ?? {};
  let total = 0;
  for (const id of Object.keys(book).sort()) {
    const units = book[id] ?? 0;
    if (!units) continue;
    const mark = prices[id];
    if (!Number.isFinite(mark)) continue;
    total += units * mark;
  }
  return total;
}

export function debtOf(state, owner) {
  let total = 0;
  for (const id of heldBy(state, owner)) total += state.holdings[id].debt;
  return total;
}

export function grossRent(city, state, owner) {
  let total = 0;
  for (const id of heldBy(state, owner)) total += rentFor(city, state, id);
  for (const farm of Object.values(state.farms ?? {})) if (farm.owner === owner && farm.completedQuarter != null && state.quarter >= farm.completedQuarter) total += ARCHETYPES.farm.baseRent;
  return total;
}

export function navOf(city, state, owner) {
  if (state.onlineView && state.onlineNav) {
    const key = owner === 'player' || owner === state.activeSeatId ? 'player' : 'rival';
    return state.onlineNav[key];
  }
  const cash = state.seatEconomy?.[owner]?.cash
    ?? (owner === 'player' ? state.cash : state.rival.cash);
  return cash
    + portfolioValue(city, state, owner)
    + listedBookValue(state, owner)
    - debtOf(state, owner);
}

export function overdraftFloor(city, state, owner) {
  const openingNav = state.seatCredit?.[owner]?.limitNav
    ?? state.creditByOwner?.[owner]?.limitNav
    ?? navOf(city, state, owner);
  return floorFromOpeningNav(openingNav, rulesFor(state).overdraftLimitBp);
}

export function reservedAuctionCash(state, owner) {
  let total = 0;
  for (const eventId of [...(state.events?.order ?? [])].sort()) {
    const event = state.events.byId[eventId];
    if (
      event.type !== 'auction'
      || event.resolveQuarter !== state.quarter
      || event.status === 'resolved'
      || event.status === 'cancelled'
    ) continue;
    const commitment = owner === 'player'
      ? event.playerCommitment
      : event.rivalCommitment;
    if (!commitment) continue;
    const lvrBp = commitment.lvrBp ?? (
      owner === 'player' ? activeLvrBp(state) : RULES.lvrBp
    );
    const cashAtCap = commitment.cashAtCap ?? (
      commitment.maxBid
      - applyBp(commitment.maxBid, lvrBp)
      + applyBp(commitment.maxBid, RULES.dutyBp)
    );
    total += cashAtCap;
  }
  return total;
}

export function cashPosition(city, state, owner, cashOut = 0, {
  reserveAuction = true,
} = {}) {
  const cash = state.seatEconomy?.[owner]?.cash
    ?? (owner === 'player' ? state.cash : state.rival.cash);
  const floor = overdraftFloor(city, state, owner);
  const reservedForAuction = reserveAuction ? reservedAuctionCash(state, owner) : 0;
  const unreservedCash = cash - reservedForAuction;
  const ordinaryCash = Math.max(0, unreservedCash);
  const availableOverdraft = Math.max(0, unreservedCash - floor - ordinaryCash);
  const postActionCash = cash - cashOut;
  const postActionAvailableCash = postActionCash - reservedForAuction;
  return {
    cash,
    ordinaryCash,
    overdraftFloor: floor,
    availableOverdraft,
    reservedForAuction,
    postActionCash,
    postActionAvailableCash,
    ok: postActionAvailableCash >= floor,
    shortfall: Math.max(0, floor - postActionAvailableCash),
  };
}

export function consolidateQuote(city, state, parcelIds) {
  const ids = [...new Set(parcelIds ?? [])].sort();
  const combinedMV = ids.reduce((sum, id) => sum + marketValue(city, state, id), 0);
  const fee = applyBp(combinedMV, TOPOLOGY_FEE_BP.consolidate);
  return {
    parcelIds: ids,
    combinedMV,
    fee,
    cashOut: fee,
    debtTaken: 0,
    ...cashPosition(city, state, 'player', fee),
  };
}

export function subdivideQuote(city, state, parcelId) {
  const currentMV = marketValue(city, state, parcelId);
  const fee = applyBp(currentMV, TOPOLOGY_FEE_BP.subdivide);
  return {
    parcelId,
    currentMV,
    fee,
    cashOut: fee,
    debtTaken: 0,
    ...cashPosition(city, state, 'player', fee),
  };
}

export function overdraftCharge(state, cashAfterDebtInterest) {
  const negativePrincipal = Math.max(0, -cashAfterDebtInterest);
  const overdraftInterest = applyBp(
    negativePrincipal,
    rulesFor(state).overdraftInterestBp,
  );
  return {
    negativePrincipal,
    overdraftInterest,
    cashAfterOverdraft: cashAfterDebtInterest - overdraftInterest,
  };
}

export function debtStressBp(city, state, owner) {
  const assets = portfolioValue(city, state, owner);
  if (assets <= 0) return 0;
  return Math.round((debtOf(state, owner) * 10000) / assets);
}

/** Running yield in basis points — the number the Value rival optimises. */
export function yieldBp(city, state, id) {
  const value = marketValue(city, state, id);
  if (value <= 0) return 0;
  const parcel = activeParcel(city, state, id);
  const baseRent = state.holdings[id]?.baseRent ?? roomTransferBase(state, id,
    parcel.consolidated ? parcel : buildingBaseFor(parcel, archetypeIdOf(city, state, id),
      conditionOf(city, state, id), { parcelStatus: state.parcelStatus?.[id] }),
  ).baseRent;
  const levelRentBp = RULES.levelRentBp?.[levelOf(state, id)] ?? 10000;
  const quarterlyRent = l3QuarterlyRent(
    applyBp(baseRent, levelRentBp),
    archetypeIdOf(city, state, id),
    parcel.districtId,
  );
  const annualRent = quarterlyRent * 4;
  return Math.round((annualRent * 10000) / value);
}

// --- Quotes: what a verb would cost, computed before it is committed. ---

function acquisitionLvrBp(state, owner) {
  // Broker access is a player verb reward. The rival consistently finances at the
  // published base rate, including ordinary buys, works and auctions.
  return owner === 'player' || owner === 'P1' ? activeLvrBp(state) : RULES.lvrBp;
}

/**
 * Revision-29 checkpoint compatibility only. New Terry meetings never write agent intel;
 * an older saved run that already contains it must retain its quoted acquisition on replay.
 */
export function agentBuyerDiscountBp(state, id, owner = 'player') {
  if (owner !== 'player' && owner !== 'P1') return 0;
  const intel = state.intel?.parcels?.[id];
  if (!intel?.conditionRevealed || intel.source !== 'agent') return 0;
  // Fresh intel this or last quarter gets full 6% ask cut; older still 3%.
  const age = state.quarter - (intel.revealedQuarter ?? state.quarter);
  return age <= 1 ? 600 : age <= 3 ? 300 : 0;
}

/** Sales consultant portfolio token: lower agent fee on divest. */
export function agentSellerFeeBp(state, owner = 'player') {
  // Absent marker: the accepted player/P1 lookup, unchanged.
  if (state?.sellerFeeVersion !== 1) {
    const base = RULES.agentFeeBp;
    if (owner !== 'player' && owner !== 'P1') return base;
    const until = state.avatars?.player?.accessTokens?.askingBandUntilQuarter ?? 0;
    if (until < state.quarter) return base;
    return Math.max(50, base - 80); // 2.00% → 1.20% with Outfitter/sales token
  }
  const seat = owner === 'player' ? (state.activeSeatId ?? 'P1') : owner;
  const base = ordinarySellerBaseBp({
    version: state.sellerFeeVersion,
    seat,
    operatorFeeBp: rulesFor(state).agentFeeBp,
    legacyFeeBp: RULES.agentFeeBp,
  });
  if (owner !== 'player' && owner !== 'P1' && owner !== 'P2') return base;
  const avatar = owner === 'player'
    ? (state.avatars?.player ?? state.avatars?.[seat])
    : state.avatars?.[owner];
  const until = avatar?.accessTokens?.askingBandUntilQuarter ?? 0;
  if (until < state.quarter) return base;
  return clampSellerFeeBp(base);
}

export function acquireQuote(city, state, id, owner = 'player') {
  if (activeParcel(city, state, id)?.surveyedFarm) return { price: 20000, duty: 0, debtTaken: 0, cashOut: 20000, ok: state.cash >= 20000, askingBeforeDiscount: 20000, defectDiscount: 0, agentDiscountBp: 0 };
  const status = state.parcelStatus?.[id];
  let askingBeforeDiscount = status?.askingOverride !== null
    && status?.askingOverrideUntil >= state.quarter
    ? status.askingOverride
    : marketValue(city, state, id);
  // A recent sale anchors the asking: the vendor's price stands (drifting with the
  // district each settle) until someone pays it — no same-quarter flip-downs (V3.39).
  const lastSale = status?.lastSale;
  if (lastSale && Number.isFinite(lastSale.price) && !state.holdings?.[id]) {
    askingBeforeDiscount = Math.max(askingBeforeDiscount, lastSale.price);
  }
  const intel = state.intel?.parcels?.[id];
  const defectTier = parcelSurveyComplete(state, id)
    ? SURVEY_DEFECT_TIERS[intel?.defectTier] ?? SURVEY_DEFECT_TIERS.none
    : SURVEY_DEFECT_TIERS.none;
  const defectDiscount = applyBp(askingBeforeDiscount, defectTier.discountBp);
  let price = askingBeforeDiscount - defectDiscount;
  const agentCutBp = agentBuyerDiscountBp(state, id, owner);
  if (agentCutBp > 0) price = applyBp(price, 10000 - agentCutBp);
  const duty = applyBp(price, RULES.dutyBp);
  const debtTaken = applyBp(price, acquisitionLvrBp(state, owner));
  const cashOut = price - debtTaken + duty;
  return {
    price,
    duty,
    debtTaken,
    cashOut,
    askingBeforeDiscount,
    defectTier: defectTier.id,
    defectDiscountBp: defectTier.discountBp,
    defectDiscount,
    agentDiscountBp: agentCutBp,
    ...cashPosition(city, state, owner, cashOut),
  };
}

export function renovateQuote(city, state, id, owner = 'player') {
  const rules = rulesFor(state);
  const parcel = activeParcel(city, state, id);
  const holding = state.holdings[id];
  const condition = conditionOf(city, state, id);
  const nextCondition = Math.min(condition + 1, RULES.maxCondition);
  const archetypeId = archetypeIdOf(city, state, id);
  const archetype = ARCHETYPES[archetypeId];
  const terms = worksTerms(state, id);
  const baseCost = applyBp(archetype.basePrice, rules.renovateCostBp);
  const eventCost = applyBp(baseCost, activeMaterialsCostBp(state));
  const hiredCost = applyBp(
    applyBp(eventCost, terms.worksCostBp),
    priceIndexBp(state),
  );
  const billed = withHammerbarnTrade(city, state, owner, hiredCost);
  const { cost, debtTaken, cashOut } = billed;
  const nextBase = renovateBase(
    holding?.basePrice ?? parcel.basePrice,
    holding?.baseRent ?? parcel.baseRent,
    condition,
    nextCondition,
  );
  const premiumBp = 10000 + corridorValueBp(city, state, id);
  const valueNow = marketValue(city, state, id);
  const valueAfter = applyBp(
    applyBp(
      applyBp(nextBase.basePrice, sectorIndexBp(state, sectorOf(city, state, id))),
      districtIndexBp(state, parcel.districtId),
    ),
    premiumBp,
  );
  const rentNow = rentFor(city, state, id);
  const rentAfter = applyBp(nextBase.baseRent, 10000 + corridorBp(city, state, id));
  return {
    cost, cashOut, debtTaken, condition, nextCondition,
    baseCost, eventCost, ...terms,
    hammerbarnRoyalty: billed.hammerbarnRoyalty,
    hammerbarnRoyaltyTo: billed.hammerbarnRoyaltyTo,
    hammerbarnOwnerDiscount: billed.hammerbarnOwnerDiscount,
    hammerbarnParcelId: billed.hammerbarnParcelId,
    basePriceAfter: nextBase.basePrice,
    baseRentAfter: nextBase.baseRent,
    valueNow, valueAfter, rentNow, rentAfter,
    ...cashPosition(city, state, owner, cashOut),
  };
}

/**
 * Redevelopment is financed at the standard LVR, but changes the building rather than
 * multiplying a level. `valueAfter` is the completed building on its incoming sector;
 * `constructionValue` is the site immediately after demolition.
 */
/**
 * Redevelopment builds to the approved planning ceiling in one job.
 * L0 + ceiling 1 → L1; L0 + PERMIT L2 → L2 (not an L0→L1 intermediate);
 * L1 + ceiling 2 → L2. Construction cost is for the finished L2 (or L1) form.
 */
export function redevelopmentStepsToCeiling(level, planningCeiling, { consolidated = false } = {}) {
  const ceiling = Math.min(planningCeiling ?? 0, RULES.maxLevel);
  if (level >= ceiling) return 0;
  if (consolidated) return 1;
  // One construction action reaches the approved height — no L0→L1→L2 ladder.
  return ceiling - level;
}

export function redevelopQuote(city, state, id, owner = 'player', targetArchetype = null, {
  finishLevel = null,
} = {}) {
  const rules = rulesFor(state);
  const parcel = activeParcel(city, state, id);
  const holding = state.holdings[id];
  const level = holding?.siteCleared ? 0 : levelOf(state, id);
  const terms = worksTerms(state, id);
  const fromArchetype = archetypeIdOf(city, state, id);
  let ceiling = Math.min(
    holding?.planningCeiling ?? defaultPlanningCeilingFor(fromArchetype),
    RULES.maxLevel,
  );
  if (fromArchetype === 'hammerbarn') {
    ceiling = Math.min(ceiling, maxPermitLevelFor(parcel, holding));
  }
  let successionSteps;
  let nextLevel;
  let toArchetype;
  if (targetArchetype) {
    const target = ARCHETYPES[targetArchetype];
    const approvedSameShellUse = Boolean(
      target
      && holding?.approvedUsePermit?.archetypeId === targetArchetype
      && redevelopFinishArchetype(fromArchetype, level, parcel, holding) === targetArchetype,
    );
    if (!target || (!approvedSameShellUse && !planningCeilingAllows(holding, target))) return null;
    nextLevel = approvedSameShellUse
      ? level
      : Math.max(level + 1, minimumPlanningLevelFor(target));
    if (!approvedSameShellUse && nextLevel > ceiling) return null;
    successionSteps = approvedSameShellUse ? 0 : nextLevel - level;
    toArchetype = targetArchetype;
  } else {
    // Prefer ceiling jump; architect succession brief still requires multi-rung when ceiling allows.
    successionSteps = redevelopmentStepsToCeiling(level, ceiling, {
      consolidated: Boolean(parcel.consolidated),
    });
    if (!parcel.consolidated && terms.successionSteps === 2 && ceiling >= level + 2) {
      successionSteps = Math.max(successionSteps, 2);
    }
    if (successionSteps < 1) return null;
    nextLevel = level + successionSteps;
    if (nextLevel > ceiling) return null;
    toArchetype = fromArchetype;
    // A granted height or use permit IS the legal successor. Walk the authored
    // SUCCESSOR chain only when planning has no finish form (L1 warehouse/office,
    // consolidated pads). Walking first used to return null on a missing key and
    // paint Redevelop as "No legal successor exists." after a lobby already won.
    const finish = parcel.consolidated
      ? null
      : redevelopFinishArchetype(fromArchetype, nextLevel, parcel, holding);
    if (finish) {
      toArchetype = finish;
    } else {
      for (let step = 0; step < successionSteps; step += 1) {
        const successor = nextArchetypeId(toArchetype, {
          parcel,
          level: level + step,
        });
        // Missing chain = illegal. Self-map (tower-office → tower-office) is a legal
        // level-rung rebuild so office / industrial ceiling stock stays redevelopable.
        if (!successor) return null;
        toArchetype = successor;
      }
      if (!parcel.consolidated && nextLevel >= 2) {
        const fromSector = ARCHETYPES[fromArchetype]?.sector
          ?? holding?.sector
          ?? parcel.sector;
        if (fromSector === 'residential' || fromSector === 'retail') {
          if (fromArchetype === 'apartment-permit') toArchetype = 'apartment-mid';
          else if (fromArchetype === 'apartment-mid' || fromArchetype === 'apartment-midrise') {
            toArchetype = 'apartment-tower';
          } else if (fromArchetype === 'apartment-low') {
            toArchetype = 'apartment-mid';
          } else if (
            fromArchetype !== 'hammerbarn'
            && !String(fromArchetype).startsWith('apartment')
          ) {
            toArchetype = nextLevel >= 3 ? 'apartment-tower' : 'apartment-permit';
          }
        }
      }
    }
  }
  if (fromArchetype === 'hammerbarn') {
    if (targetArchetype && targetArchetype !== 'hammerbarn') return null;
    toArchetype = 'hammerbarn';
  }
  const incoming = ARCHETYPES[toArchetype];
  if (!incoming) return null;
  const parcelStatus = state.parcelStatus?.[id];
  const finishedBase = buildingBaseFor(parcel, toArchetype, RULES.maxCondition, {
    parcelStatus,
  });
  const authoredIncoming = parcel.consolidated
    ? consolidatedYieldBaseFor(parcel, parcelStatus)
    : incoming;
  const unbandedBaseCost = applyBp(authoredIncoming.basePrice, rules.redevelopCostBp);
  const districtEconomyBandBp = isL3Form(toArchetype)
    ? l3DistrictBandBp(parcel.districtId)
    : 10000;
  const baseCost = applyBp(unbandedBaseCost, districtEconomyBandBp);
  const eventCost = applyBp(baseCost, activeMaterialsCostBp(state));
  const hiredCost = applyBp(
    applyBp(eventCost, terms.worksCostBp),
    priceIndexBp(state),
  );
  const billed = withHammerbarnTrade(city, state, owner, hiredCost);
  const { cost, debtTaken, cashOut } = billed;
  const premiumBp = 10000 + corridorValueBp(city, state, id);

  const valueNow = marketValue(city, state, id);
  // Apply completed level multipliers so L2 apartment quotes match live marketValue/rent.
  // BUILD installs a form at its own permit level (L0 forms included), which can sit
  // below the works rung priced here, so it passes the level the form finishes at.
  const finishedLevel = Number.isInteger(finishLevel) ? finishLevel : nextLevel;
  const levelValueBp = RULES.levelValueBp?.[finishedLevel] ?? 10000;
  const levelRentBp = RULES.levelRentBp?.[finishedLevel] ?? 10000;
  const ordinaryValueAfter = applyBp(
    applyBp(
      applyBp(
        applyBp(finishedBase.basePrice, sectorIndexBp(state, finishedBase.sector)),
        districtIndexBp(state, parcel.districtId),
      ),
      premiumBp,
    ),
    levelValueBp,
  );
  const valueAfter = l3Scaled(ordinaryValueAfter, toArchetype, parcel.districtId);
  const ordinaryConstructionValue = applyBp(
    applyBp(
      applyBp(
        applyBp(
          finishedBase.basePrice,
          sectorIndexBp(state, holding?.sector ?? parcel.sector),
        ),
        districtIndexBp(state, parcel.districtId),
      ),
      premiumBp,
    ),
    RULES.constructionValueBp,
  );
  const constructionValue = worksStandingValue({
    worksValue: l3Scaled(ordinaryConstructionValue, toArchetype, parcel.districtId),
    padValue: valueNow,
  });
  const rentNow = rentFor(city, state, id);
  const ordinaryRentAfter = applyBp(
    applyBp(
      operatingBaseRent(toArchetype, finishedBase.baseRent),
      10000 + corridorBp(city, state, id),
    ),
    levelRentBp,
  );
  const rentAfter = l3QuarterlyRent(
    ordinaryRentAfter,
    toArchetype,
    parcel.districtId,
  );
  const durationQuarters = constructionDurationQuarters(
    toArchetype,
    finishedBase.sector,
  );
  const residentialBuild = isResidentialBuildTarget(toArchetype, finishedBase.sector);
  return {
    cost, cashOut, debtTaken, level, nextLevel,
    baseCost, unbandedBaseCost, eventCost, districtEconomyBandBp, ...terms, successionSteps,
    fromArchetype, toArchetype,
    sectorNow: holding?.sector ?? parcel.sector,
    sectorAfter: finishedBase.sector,
    conditionAfter: RULES.maxCondition,
    basePriceAfter: finishedBase.basePrice,
    baseRentAfter: finishedBase.baseRent,
    valueNow, constructionValue, valueAfter, rentNow, rentAfter,
    durationQuarters,
    residentialBuild,
    completionQuarter: state.quarter + durationQuarters,
    hammerbarnRoyalty: billed.hammerbarnRoyalty,
    hammerbarnRoyaltyTo: billed.hammerbarnRoyaltyTo,
    hammerbarnOwnerDiscount: billed.hammerbarnOwnerDiscount,
    hammerbarnParcelId: billed.hammerbarnParcelId,
    ...cashPosition(city, state, owner, cashOut),
  };
}

export function redevelopmentExitQuote(city, state, id, owner = 'player') {
  const works = redevelopQuote(city, state, id, owner);
  if (!activeParcel(city, state, id) || !state.holdings?.[id]) return null;
  const ordinaryRent = rentFor(city, state, id);
  const noticeRent = applyBp(ordinaryRent, 5000);
  const buyout = ordinaryRent;
  return {
    works,
    notice: {
      tenantExit: 'notice',
      rent: noticeRent,
      compensation: 0,
      cashOut: noticeRent,
      debtTaken: 0,
      startsQuarter: state.quarter + 1,
      ...cashPosition(city, state, owner, noticeRent),
    },
    buyout: {
      tenantExit: 'buyout',
      rent: 0,
      buyout,
      compensation: buyout,
      cashOut: buyout,
      debtTaken: 0,
      startsQuarter: state.quarter,
      ...cashPosition(city, state, owner, buyout),
    },
  };
}

export { constructionStage, constructionDurationQuarters, isResidentialBuildTarget };

/**
 * Terry's sale uplift is a named, replay-safe triangular roll. Two inclusive dice keep
 * the bounds reachable while concentrating results around the 7.5% midpoint.
 */
export function terrySaleUpliftBp(state, parcelId) {
  const min = RULES.agentSaleUpliftMinBp;
  const max = RULES.agentSaleUpliftMaxBp;
  const width = Math.max(0, max - min);
  const firstMax = Math.floor(width / 2);
  const secondMax = width - firstMax;
  const rng = stream(
    state.seed,
    `terry-uplift:${parcelId}:${state.quarter}`,
  );
  return min + rng.int(0, firstMax) + rng.int(0, secondMax);
}

/**
 * A sale settles the debt out of the proceeds. When the debt is larger than the parcel
 * is worth, the exit becomes a SURRENDER: the debt is cleared, no cash moves, the
 * parcel is gone. Without this the escape hatch locks exactly when it is needed, and a
 * player watches interest run for four quarters with no legal move.
 */
export function divestQuote(city, state, id) {
  const assessment = state.holdings[id]?.conditionAssessment;
  if (assessment && assessment.resolveQuarter <= state.quarter) {
    // A voluntary exit settles the same stored acquisition roll as a forced
    // sale. Copy only the records the resolver mutates: quote reads stay pure.
    state = {
      ...state,
      holdings: { ...state.holdings, [id]: { ...state.holdings[id] } },
      parcelStatus: { ...state.parcelStatus, [id]: { ...state.parcelStatus[id] } },
    };
    resolveConditionAssessment(city, state, id);
  }
  const holding = state.holdings[id];
  const owner = holding?.owner ?? 'player';
  const venture = activeVenture(holding);
  const terry = (owner === 'player' || owner === 'P1')
    ? activeHires(holding, state.quarter)['property-agent'] ?? null
    : null;
  const peSale = Boolean(venture?.valuation);
  const incomeMark = peSale ? null : commercialAnchorValuation(city, state, id);
  const incomeSale = Boolean(incomeMark);
  const baseValue = incomeMark?.valuation ?? marketValue(city, state, id);
  // A valued venture exits as a trade sale. Terry's shopfront sale brief neither
  // re-prices the company nor attracts an agent fee on that buyer's valuation. An
  // income-fund quote remains subject to ordinary sale costs, but Terry cannot multiply
  // the cap-rate mark: the investor already supplied the price authority.
  const saleUpliftBp = terry && !peSale && !incomeSale ? terrySaleUpliftBp(state, id) : 0;
  const value = saleUpliftBp
    ? applyBp(baseValue, 10000 + saleUpliftBp)
    : baseValue;
  const feeBp = peSale ? 0 : (terry?.feeBp ?? agentSellerFeeBp(state, owner));
  const fee = applyBp(value, feeBp);
  const debtCleared = state.holdings[id]?.debt ?? 0;
  const proceeds = value - fee - debtCleared;
  const cash = owner === 'player' ? state.cash : state.rival.cash;
  const surrender = proceeds < 0 && cash + proceeds < overdraftFloor(city, state, owner);
  return {
    baseValue,
    value,
    saleUplift: value - baseValue,
    saleUpliftBp,
    terryBriefed: Boolean(terry),
    fee,
    feeBp,
    debtCleared,
    proceeds: surrender ? 0 : proceeds,
    shortfall: surrender ? -proceeds : 0,
    surrender,
    peSale,
    incomeSale,
  };
}

export function forcedSaleResolution(city, state, owner) {
  const credit = state.creditByOwner?.[owner];
  if (!credit || credit.forcedSaleDueQuarter !== state.quarter) return null;
  const floor = overdraftFloor(city, state, owner);
  const cash = owner === 'player' ? state.cash : state.rival.cash;
  if (cash >= floor) {
    return {
      kind: 'forced-sale-averted',
      owner,
      overdraftFloor: floor,
      cashBefore: cash,
      cashAfter: cash,
      parcelId: null,
      quote: null,
      insolvent: false,
    };
  }
  let parcelId = null;
  for (const candidate of heldBy(state, owner)) {
    if (parcelId === null) {
      parcelId = candidate;
      continue;
    }
    const candidateDebt = state.holdings[candidate].debt;
    const selectedDebt = state.holdings[parcelId].debt;
    const candidateValue = marketValue(city, state, candidate);
    const selectedValue = marketValue(city, state, parcelId);
    if (candidateDebt * selectedValue > selectedDebt * candidateValue) {
      parcelId = candidate;
    }
  }
  const quote = parcelId === null ? null : divestQuote(city, state, parcelId);
  const cashAfter = cash + (quote?.proceeds ?? 0);
  return {
    kind: 'forced-sale',
    owner,
    overdraftFloor: floor,
    cashBefore: cash,
    cashAfter,
    parcelId,
    quote,
    insolvent: parcelId === null || cashAfter < floor,
  };
}

export function resolveForcedSaleAssessments(city, state, owner) {
  const credit = state.creditByOwner?.[owner];
  if (!credit || credit.forcedSaleDueQuarter !== state.quarter) {
    return { resolution: null, transactions: [] };
  }
  const floor = overdraftFloor(city, state, owner);
  const cash = owner === 'player' ? state.cash : state.rival.cash;
  if (cash >= floor) {
    return { resolution: forcedSaleResolution(city, state, owner), transactions: [] };
  }
  const transactions = [];
  for (const parcelId of heldBy(state, owner)) {
    const transaction = resolveConditionAssessment(city, state, parcelId);
    if (transaction) transactions.push(transaction);
  }
  return {
    resolution: forcedSaleResolution(city, state, owner),
    transactions,
  };
}

function applyPreviewForcedSale(city, projected, resolution) {
  if (!resolution) return;
  const credit = projected.creditByOwner[resolution.owner];
  if (resolution.kind === 'forced-sale-averted') {
    credit.forcedSaleDueQuarter = null;
    credit.breachedQuarter = null;
    return;
  }
  if (resolution.parcelId) {
    if (resolution.owner === 'player') projected.cash += resolution.quote.proceeds;
    else projected.rival.cash += resolution.quote.proceeds;
    const holding = projected.holdings[resolution.parcelId];
    const status = projected.parcelStatus[resolution.parcelId];
    status.condition = holding.condition;
    if (
      activeParcel(city, projected, resolution.parcelId)?.consolidated
      && holding.level === 0
      && status.builtLevel === 0
    ) {
      status.builtArchetypeId = null;
      status.builtLevel = 0;
    } else {
      status.builtArchetypeId = holding.archetypeId;
      status.builtLevel = holding.level;
    }
    delete projected.holdings[resolution.parcelId];
  }
  credit.insolvent = resolution.insolvent;
  if (!resolution.insolvent) {
    credit.forcedSaleDueQuarter = null;
    credit.breachedQuarter = null;
  }
}

// --- Legality. A verb is offered only when it would succeed. ---

function insufficientCashReason(position) {
  return `Short $${position.shortfall.toLocaleString()} against the overdraft floor.`;
}

/** Meet-then-take: agent intel or Petridis disclosure unlocks a free acquire this quarter. */
export function isFreeFollowUpAcquire(state, parcelId) {
  const until = state?.avatars?.player?.followUpTokens?.acquireParcels?.[parcelId];
  return Number.isInteger(until) && until >= (state.quarter ?? 0);
}

export function canAcquire(city, state, id) {
  if (!activeParcel(city, state, id)) return { ok: false, reason: 'No parcel here.' };
  if (state.phase !== 'play') return { ok: false, reason: 'The run is over.' };
  if (state.actionsRemaining <= 0 && !isFreeFollowUpAcquire(state, id)) {
    return { ok: false, reason: 'No actions left this quarter.' };
  }
  const owner = ownerOf(state, id);
  if (owner === 'player') return { ok: false, reason: 'Already yours.' };
  if (owner === 'rival') return { ok: false, reason: 'Held by the rival.' };
  const auction = [...(state.events?.order ?? [])].sort()
    .map((eventId) => state.events.byId[eventId])
    .find((event) =>
      event.type === 'auction'
      && event.resolveQuarter === state.quarter
      && event.status !== 'resolved'
      && event.status !== 'cancelled'
      && event.anchorIds.includes(id));
  if (auction) return { ok: false, reason: 'This parcel is reserved to its scheduled auction.' };
  const quote = acquireQuote(city, state, id);
  if (!quote.ok) return { ok: false, reason: insufficientCashReason(quote) };
  return { ok: true };
}

// Whole-building completion runs before bushfire demolition at each settlement.
// Inspect only the recorded blaze/current event; never forecast future weather.
function bushfireWorksDeadline(state, id, completionQuarter, workLabel) {
  const holding = state.holdings[id];
  const pendingFire = eventsResolving(state).find(event => event.type === 'fire'
    && event.payload?.source === 'bushfire' && event.anchorIds.includes(id));
  // Cover bought after a fire resolved does not repair its existing damage.
  if (pendingFire && holding.insurance?.fire
    && holding.insurance.expiresAfterQuarter >= state.quarter) return null;
  if (!state.parcelStatus?.[id]?.damage && !pendingFire) return null;
  for (const blaze of state.weather?.bushfires ?? []) {
    if (blaze.parcelId !== id || blaze.repaired || blaze.burnedDown) continue;
    const demolitionQuarter = state.quarter + Math.max(1, blaze.remainingBeats ?? BUSHFIRE_BURN_BEATS) - 1;
    // An already queued whole-building repair can save concurrently queued rooms.
    if (holding.renovation && holding.renovation.startedQuarter + 1 <= demolitionQuarter) continue;
    if (completionQuarter > demolitionQuarter) return {
      ok: false,
      reason: `Bushfire demolition is due at Q${demolitionQuarter} settlement; this ${workLabel} cannot finish before Q${completionQuarter} settlement.`,
    };
  }
  return null;
}

export function canRenovate(city, state, id) {
  if (state.phase !== 'play') return { ok: false, reason: 'The run is over.' };
  if (state.actionsRemaining <= 0) return { ok: false, reason: 'No actions left this quarter.' };
  if (ownerOf(state, id) !== 'player') return { ok: false, reason: 'You do not hold this parcel.' };
  if (state.holdings[id].construction) return { ok: false, reason: 'The parcel is under construction.' };
  if (state.holdings[id].renovation) return { ok: false, reason: 'The renovation is still underway.' };
  if (activeVenture(state.holdings[id])) {
    return { ok: false, reason: 'The shop is an operating startup.' };
  }
  if (listedTickerOf(state.holdings[id])) {
    return { ok: false, reason: 'Listed vehicles renovate through the company.' };
  }
  // Room upgrades may run in parallel with whole-building renovate.
  if (conditionOf(city, state, id) >= RULES.maxCondition) {
    return { ok: false, reason: 'Already in renewed condition.' };
  }
  const deadline = bushfireWorksDeadline(state, id, state.quarter + 1, 'renovation');
  if (deadline) return deadline;
  const quote = renovateQuote(city, state, id);
  if (!quote.ok) return { ok: false, reason: insufficientCashReason(quote) };
  return { ok: true };
}

/**
 * Room upgrade: free action, cash + calendar only.
 * Concurrent with whole-building renovate and with other rooms; only the same room
 * cannot be double-booked while its job is still running.
 */
export function canRenovateRoom(city, state, id, roomId, finish) {
  if (state.phase !== 'play') return { ok: false, reason: 'The run is over.' };
  if (ownerOf(state, id) !== 'player') return { ok: false, reason: 'You do not hold this parcel.' };
  if (state.holdings[id].construction) return { ok: false, reason: 'Under construction.' };
  if (pendingRoomJob(state.holdings[id], roomId)) {
    return { ok: false, reason: `${roomId} upgrade already underway.` };
  }
  const quote = roomRenovateQuoteCore(city, state, id, roomId, finish);
  if (!quote) return { ok: false, reason: 'Invalid room or finish.' };
  const deadline = bushfireWorksDeadline(state, id, quote.completionQuarter, 'room upgrade');
  if (deadline) return deadline;
  if (!quote.ok) return { ok: false, reason: quote.reason ?? 'Cannot fund room upgrade.' };
  return { ok: true, quote };
}

export { roomRenovateQuoteCore as roomRenovateQuote };

/** Tenant exits are eviction tools; their legality does not depend on a successor form. */
export function canTenantExit(city, state, id, tenantExit) {
  if (state.phase !== 'play') return { ok: false, reason: 'The run is over.' };
  if (state.actionsRemaining <= 0) return { ok: false, reason: 'No actions left this quarter.' };
  if (ownerOf(state, id) !== 'player') return { ok: false, reason: 'You do not hold this parcel.' };
  const holding = state.holdings[id];
  if (holding.construction) return { ok: false, reason: 'The parcel is under construction.' };
  if (holding.renovation) return { ok: false, reason: 'The renovation is still underway.' };
  if (activeVenture(holding)) return { ok: false, reason: 'Wind up or sell the startup first.' };
  if (listedTickerOf(holding)) {
    return { ok: false, reason: 'Sell shares at the Exchange — the pad is listed.' };
  }
  if (holding.redevelopmentNotice) {
    return { ok: false, reason: 'A tenant notice is already served on this holding.' };
  }
  if (state.parcelStatus?.[id]?.occupancy !== 'tenant') {
    return { ok: false, reason: 'Tenant notice and buyout require an active tenant.' };
  }
  if (tenantExit !== 'notice' && tenantExit !== 'buyout') {
    return { ok: false, reason: 'Choose notice or buyout.' };
  }
  const path = redevelopmentExitQuote(city, state, id)?.[tenantExit];
  if (!path) return { ok: false, reason: 'No tenant exit quote.' };
  if (!path.ok) return { ok: false, reason: insufficientCashReason(path) };
  return { ok: true };
}

export function canRedevelop(city, state, id, tenantExit = null, targetArchetype = null) {
  if (tenantExit === 'notice' || tenantExit === 'buyout') {
    return canTenantExit(city, state, id, tenantExit);
  }
  if (state.phase !== 'play') return { ok: false, reason: 'The run is over.' };
  if (state.actionsRemaining <= 0) return { ok: false, reason: 'No actions left this quarter.' };
  if (ownerOf(state, id) !== 'player') return { ok: false, reason: 'You do not hold this parcel.' };
  if (state.holdings[id].construction) return { ok: false, reason: 'The parcel is under construction.' };
  if (state.holdings[id].renovation) return { ok: false, reason: 'The renovation is still underway.' };
  if (activeVenture(state.holdings[id])) {
    return { ok: false, reason: 'Wind up or sell the startup first.' };
  }
  if (listedTickerOf(state.holdings[id])) {
    return { ok: false, reason: 'Sell shares at the Exchange — the pad is listed.' };
  }
  {
    const from = archetypeIdOf(city, state, id);
    let legal = Math.min(
      state.holdings[id].planningCeiling ?? defaultPlanningCeilingFor(from),
      RULES.maxLevel,
    );
    if (from === 'hammerbarn') {
      legal = Math.min(legal, maxPermitLevelFor(activeParcel(city, state, id), state.holdings[id]));
    }
    const currentLevel = state.holdings[id].siteCleared ? 0 : levelOf(state, id);
    if (currentLevel >= legal) {
      return { ok: false, reason: 'Already at the legal planning ceiling.' };
    }
  }
  const quote = redevelopQuote(city, state, id, 'player', targetArchetype);
  if (!quote) return { ok: false, reason: 'No legal successor exists.' };
  if (
    archetypeIdOf(city, state, id) === 'hammerbarn'
    && (String(quote.toArchetype).startsWith('apartment')
      || String(quote.toArchetype).startsWith('townhouse'))
  ) {
    return { ok: false, reason: 'Hammerbarn cannot be permitted for townhouses or apartments.' };
  }
  const occupied = state.parcelStatus?.[id]?.occupancy === 'tenant';
  const servedNotice = state.holdings[id].redevelopmentNotice;
  if (servedNotice) {
    return { ok: false, reason: 'A tenant notice is already served on this holding.' };
  }
  if (occupied && !['notice', 'buyout'].includes(tenantExit)) {
    return { ok: false, reason: 'Notice — end tenancy first.' };
  }
  if (!occupied && tenantExit !== null) {
    return { ok: false, reason: 'Tenant notice and buyout require an active tenant.' };
  }
  const cash = occupied
    ? redevelopmentExitQuote(city, state, id)[tenantExit]
    : quote;
  if (!cash.ok) return { ok: false, reason: insufficientCashReason(cash) };
  return { ok: true };
}

/** Approved shell-retaining use works, quoted through the same construction economics. */
/**
 * The data-centre fit-out is authored, not derived: a shell-retaining conversion prices
 * plant and power, and the user's band is $5m (cheapest district) to $7m (dearest).
 * Scaled linearly on the district's L3 band position so suburbs matter (V3.40 E2).
 */
export const DATACENTRE_FITOUT_MIN = 5_000_000;
export const DATACENTRE_FITOUT_MAX = 7_000_000;

export function datacentreFitoutCost(city, state, id) {
  const parcel = activeParcel(city, state, id);
  const bands = DISTRICTS.map((d) => d.l3EconomyBandBp ?? 10000);
  const lo = Math.min(...bands);
  const hi = Math.max(...bands);
  const mine = DISTRICTS.find((d) => d.id === parcel?.districtId)?.l3EconomyBandBp ?? lo;
  const t = hi === lo ? 0 : (mine - lo) / (hi - lo);
  return Math.round(DATACENTRE_FITOUT_MIN + t * (DATACENTRE_FITOUT_MAX - DATACENTRE_FITOUT_MIN));
}

export function changeUseQuote(city, state, id, owner = 'player') {
  const holding = state.holdings?.[id];
  const target = holding?.approvedUsePermit?.archetypeId ?? null;
  if (!target || archetypeIdOf(city, state, id) === target) return null;
  const quote = redevelopQuote(city, state, id, owner, target);
  if (!quote || target !== 'warehouse-datacentre') return quote;
  const cost = datacentreFitoutCost(city, state, id);
  const debtTaken = Math.round(cost * (quote.debtTaken / Math.max(1, quote.cost)));
  return { ...quote, cost, debtTaken, cashOut: cost - debtTaken };
}

export function canChangeUse(city, state, id) {
  if (state.phase !== 'play') return { ok: false, reason: 'The run is over.' };
  if (state.actionsRemaining <= 0) return { ok: false, reason: 'No actions left this quarter.' };
  if (ownerOf(state, id) !== 'player') return { ok: false, reason: 'You do not hold this parcel.' };
  const holding = state.holdings[id];
  if (holding.construction) return { ok: false, reason: 'The parcel is under construction.' };
  if (holding.renovation) return { ok: false, reason: 'The renovation is still underway.' };
  if (listedTickerOf(holding)) return { ok: false, reason: LISTED_USE_REASON };
  const target = holding.approvedUsePermit?.archetypeId ?? null;
  if (!target) return { ok: false, reason: 'Win a physical change-of-use permit first.' };
  if (archetypeIdOf(city, state, id) === target) {
    return { ok: false, reason: 'That use is already current.' };
  }
  if (state.parcelStatus?.[id]?.occupancy === 'tenant') {
    return { ok: false, reason: 'Notice — end tenancy first.' };
  }
  const quote = changeUseQuote(city, state, id);
  if (!quote) return { ok: false, reason: 'The approved use no longer fits this shell.' };
  if (!quote.ok) return { ok: false, reason: insufficientCashReason(quote) };
  return { ok: true, quote };
}

/** Divesting is free by rule, so it stays legal even when every action is spent. */
export function canDivest(city, state, id) {
  if (state.phase !== 'play') return { ok: false, reason: 'The run is over.' };
  if (RULES.divestCostsAction && state.actionsRemaining <= 0) {
    return { ok: false, reason: 'No actions left this quarter.' };
  }
  if (ownerOf(state, id) !== 'player') return { ok: false, reason: 'You do not hold this parcel.' };
  if (listedTickerOf(state.holdings[id])) {
    return { ok: false, reason: 'Sell the listing at the Stock Exchange.' };
  }
  return { ok: true };
}

function previewAuctionHolding(city, projected, parcelId, owner, salePrice, debtTaken) {
  const archetypeId = archetypeIdOf(city, projected, parcelId);
  const completed = roomTransferBase(projected, parcelId, buildingBaseFor(
    activeParcel(city, projected, parcelId),
    archetypeId,
    projected.parcelStatus[parcelId].condition,
    { parcelStatus: projected.parcelStatus[parcelId] },
  ));
  projected.holdings[parcelId] = {
    owner,
    level: projected.parcelStatus[parcelId].builtLevel,
    condition: projected.parcelStatus[parcelId].condition,
    archetypeId,
    sector: completed.sector,
    basePrice: completed.basePrice,
    baseRent: completed.baseRent,
    debt: debtTaken,
    basis: salePrice,
    acquiredQuarter: projected.quarter,
    mature: false,
    conditionAssessment: conditionAssessmentForAcquisition(
      city,
      projected,
      parcelId,
      projected.actionOrdinal,
    ),
    ...holdingFrameworkDefaults(ARCHETYPES[archetypeId]),
    planningCeiling: defaultPlanningCeilingFor(archetypeId),
  };
}

/**
 * Apply Petridis's already-disclosed ordinary moves to the isolated settlement projection.
 * Those moves precede auctions and hazards in the reducer. In particular, rival works can pay
 * a Hammerbarn royalty to the player; omitting that transfer made the binding cash preview drift
 * whenever the new district-true L3 quote changed which development Petridis selected.
 */
function applyPreviewRivalMoves(city, projected) {
  if (
    projected.mode === 'hotseat'
    || projected.quarterCommit?.policyResolved
    || projected.creditByOwner?.rival?.insolvent
  ) return [];
  const plan = projected.rival?.intent?.plan
    ?? [projected.rival?.intent].filter(Boolean);
  const auctionSlots = plan.some(({ verb }) => verb === 'auction') ? 1 : 0;
  const ordinary = plan
    .filter(({ verb }) => !['auction', 'auction-pass'].includes(verb))
    .slice(0, RULES.actionsPerQuarter - auctionSlots);
  const transactions = [];
  const creditRoyalty = (quote) => {
    const amount = quote?.hammerbarnRoyalty ?? 0;
    const to = quote?.hammerbarnRoyaltyTo;
    if (!amount || !to) return;
    if (to === 'player') projected.cash += amount;
    else if (to === 'rival') projected.rival.cash += amount;
  };

  for (const move of ordinary) {
    const parcelId = move?.parcelId;
    if (!parcelId) continue;
    const reserved = auctionResolving(projected)?.anchorIds.includes(parcelId);
    if (reserved && move.verb !== 'insure') continue;

    if (move.verb === 'insure') {
      const holding = projected.holdings[parcelId];
      if (!holding || holding.owner !== 'rival') continue;
      const premium = insurancePremium(marketValue(city, projected, parcelId), move.cover);
      if (!cashPosition(city, projected, 'rival', premium).ok) continue;
      const requested = {
        fire: move.cover === 'fire' || move.cover === 'both',
        flood: move.cover === 'flood' || move.cover === 'both',
      };
      const existing = holding.insurance
        && holding.insurance.expiresAfterQuarter >= projected.quarter
        ? holding.insurance
        : { fire: false, flood: false };
      projected.rival.cash -= premium;
      holding.insurance = {
        fire: existing.fire || requested.fire,
        flood: existing.flood || requested.flood,
        expiresAfterQuarter: projected.quarter + 3,
      };
      transactions.push({ verb: move.verb, parcelId, cashOut: premium });
      continue;
    }

    if (move.verb === 'renovate') {
      const holding = projected.holdings[parcelId];
      if (
        !holding || holding.owner !== 'rival' || holding.construction || holding.renovation
        || conditionOf(city, projected, parcelId) >= RULES.maxCondition
      ) continue;
      const quote = renovateQuote(city, projected, parcelId, 'rival');
      if (!cashPosition(city, projected, 'rival', quote.cashOut).ok) continue;
      projected.rival.cash -= quote.cashOut;
      creditRoyalty(quote);
      holding.debt += quote.debtTaken;
      holding.renovation = { preview: true, tenantRentBp: quote.tenantRentBp };
      transactions.push({
        verb: move.verb,
        parcelId,
        cashOut: quote.cashOut,
        royalty: quote.hammerbarnRoyalty ?? 0,
      });
      continue;
    }

    if (move.verb === 'redevelop') {
      const holding = projected.holdings[parcelId];
      if (
        !holding || holding.owner !== 'rival' || holding.construction || holding.renovation
        || holding.level >= RULES.maxLevel
      ) continue;
      const quote = redevelopQuote(city, projected, parcelId, 'rival');
      if (!quote) continue;
      const occupied = projected.parcelStatus[parcelId].occupancy === 'tenant';
      if (occupied && holding.redevelopmentNotice) continue;
      const exit = occupied
        ? redevelopmentExitQuote(city, projected, parcelId, 'rival')?.notice
        : null;
      const cashOut = occupied ? exit?.cashOut : quote.cashOut;
      if (!Number.isInteger(cashOut) || !cashPosition(city, projected, 'rival', cashOut).ok) {
        continue;
      }
      projected.rival.cash -= cashOut;
      if (occupied) {
        holding.redevelopmentNotice = { preview: true, tenantRentBp: 5000 };
      } else {
        creditRoyalty(quote);
        holding.debt += quote.debtTaken;
        holding.construction = { preview: true, toArchetype: quote.toArchetype };
        holding.redevelopmentNotice = null;
      }
      transactions.push({
        verb: move.verb,
        parcelId,
        cashOut,
        royalty: occupied ? 0 : (quote.hammerbarnRoyalty ?? 0),
      });
      continue;
    }

    if (ownerOf(projected, parcelId)) continue;
    const quote = acquireQuote(city, projected, parcelId, 'rival');
    if (!cashPosition(city, projected, 'rival', quote.cashOut).ok) continue;
    projected.rival.cash -= quote.cashOut;
    previewAuctionHolding(
      city,
      projected,
      parcelId,
      'rival',
      quote.price,
      quote.debtTaken,
    );
    transactions.push({ verb: 'acquire', parcelId, cashOut: quote.cashOut });
  }
  return transactions;
}

function applyPreviewHazard(city, projected, event, hazard, due, previewOwner) {
  const eventIds = hazard === 'flood'
    ? Object.keys(event.payload.exposures ?? {}).sort()
      .filter((id) => event.payload.exposures[id].hit)
    : [...event.anchorIds].sort();
  const ids = [...new Set(eventIds
    .map((id) => resolveCurrentParcelId(city, projected, id) ?? id))]
    .filter((id) => projected.parcelStatus[id])
    .sort();
  for (const parcelId of ids) {
    const holding = projected.holdings[parcelId];
    if (
      holding?.owner
      && holding.insurance?.[hazard]
      && holding.insurance.expiresAfterQuarter >= projected.quarter
    ) {
      const cashOut = insuranceDeductible(marketValue(city, projected, parcelId));
      if (holding.owner === 'player') projected.cash -= cashOut;
      else projected.rival.cash -= cashOut;
      if (holding.owner === previewOwner) {
        due.push({
          kind: 'deductible',
          timing: 'due',
          eventId: event.id,
          parcelId,
          hazard,
          owner: holding.owner,
          cashOut,
          debtTaken: 0,
        });
      }
      continue;
    }
    if (holding?.construction) {
      holding.construction = Object.freeze({
        ...holding.construction,
        completionQuarter: holding.construction.completionQuarter + 1,
      });
      continue;
    }
    const condition = Math.max(
      0,
      (holding?.condition ?? projected.parcelStatus[parcelId].condition) - 1,
    );
    projected.parcelStatus[parcelId].condition = condition;
    projected.parcelStatus[parcelId].damage = hazard;
    projected.parcelStatus[parcelId].conditionVersion += 1;
    if (holding) holding.condition = condition;
  }
}

/**
 * Everything settlement charges, projected through the binding 1–2d order. State settlement
 * consumes this exact active-rate/obligation result and rejects any reconciliation drift.
 */
export function settlementPreview(city, state, owner) {
  const projected = structuredClone(state);
  const forcedSaleTransactions = [];
  for (const creditOwner of ['player', 'rival']) {
    const prepared = resolveForcedSaleAssessments(city, projected, creditOwner);
    const resolution = prepared.resolution;
    if (!resolution) continue;
    forcedSaleTransactions.push(...prepared.transactions);
    forcedSaleTransactions.push({
      kind: resolution.kind,
      owner: creditOwner,
      parcelId: resolution.parcelId,
      proceeds: resolution.quote?.proceeds ?? 0,
      debtCleared: resolution.quote?.debtCleared ?? 0,
      cashOut: -(resolution.quote?.proceeds ?? 0),
      insolvent: resolution.insolvent,
    });
    applyPreviewForcedSale(city, projected, resolution);
    if (creditOwner === 'player' && resolution.insolvent) {
      return {
        rent: 0,
        opex: 0,
        interest: 0,
        overdraft: 0,
        overdraftInterest: 0,
        negativePrincipal: Math.max(0, -projected.cash),
        net: 0,
        interestBp: activeInterestRateBp(projected, owner),
        activeInterestBp: activeInterestRateBp(projected, owner),
        debtAtInterest: debtOf(projected, owner),
        obligations: [],
        dueCash: 0,
        actionPhaseCash: owner === 'player' ? state.cash : state.rival.cash,
        projectedClosingCash: owner === 'player' ? projected.cash : projected.rival.cash,
        forcedSaleTransactions,
        terminal: true,
      };
    }
  }
  const row = city.market.find(({ quarter }) => quarter === projected.quarter);
  const downturn = activeEvent(projected, 'downturn', projected.quarter);
  for (const sector of SECTOR_IDS) {
    const move = (row?.sectors[sector].realisedBp ?? 0)
      + (downturn ? RULES.eventDownturnBp : 0);
    projected.sectors[sector] = Math.max(
      RULES.sectorFloorBp,
      applyBp(projected.sectors[sector], 10000 + move),
    );
  }
  applyInflationStep(projected);
  const quarterIndex = projected.quarter - 1;
  for (const districtId of Object.keys(city.districtDriftPlan).sort()) {
    const realisedBp = city.districtDriftPlan[districtId]
      .realisedByQuarterBp[quarterIndex] ?? 0;
    const scaledRealisedBp = applyBp(realisedBp, RULES.districtDriftScaleBp);
    projected.districtIndexBp[districtId] = applyBp(
      projected.districtIndexBp[districtId],
      10000 + scaledRealisedBp,
    );
  }
  applyFamilySignalValueDrift(city, projected);

  const rivalMoveTransactions = applyPreviewRivalMoves(city, projected);

  let auctionItem = null;
  let auctionPending = false;
  const auction = auctionResolving(projected);
  if (auction) {
    const outcome = auctionResolution(projected, auction);
    // With no own bid this seat cannot acquire the auction lot. A later quarter's
    // new auction must not hide the numeric preview of its existing portfolio.
    auctionPending = outcome.outcome === 'undisclosed' && Boolean(auction.playerCommitment);
    if (outcome.outcome === 'sold' && outcome.winner === owner) {
      const commitment = owner === 'player'
        ? auction.playerCommitment
        : auction.rivalCommitment;
      const lvrBp = commitment?.lvrBp ?? (
        owner === 'player' ? activeLvrBp(projected) : RULES.lvrBp
      );
      const debtTaken = applyBp(outcome.salePrice, lvrBp);
      const duty = applyBp(outcome.salePrice, RULES.dutyBp);
      const cashOut = outcome.salePrice - debtTaken + duty;
      if (owner === 'player') projected.cash -= cashOut;
      else projected.rival.cash -= cashOut;
      previewAuctionHolding(
        city,
        projected,
        auction.anchorIds[0],
        owner,
        outcome.salePrice,
        debtTaken,
      );
      auctionItem = {
        kind: 'auction',
        eventId: auction.id,
        parcelId: auction.anchorIds[0],
        outcome: 'sold',
        salePrice: outcome.salePrice,
        duty,
        debtTaken,
        cashOut,
        winner: owner,
        timing: 'due',
      };
    }
  }

  const due = [];
  for (const event of eventsResolving(projected)) {
    if (event.type === 'flash-flood') {
      applyPreviewHazard(city, projected, event, 'flood', due, owner);
    }
    if (event.type === 'fire') applyPreviewHazard(city, projected, event, 'fire', due, owner);
    if (event.type === 'tenant-arrears') {
      const parcelId = resolveCurrentParcelId(city, projected, event.anchorIds[0])
        ?? event.anchorIds[0];
      const tenant = projected.parcelStatus[parcelId]?.tenant;
      if (tenant) tenant.paymentAtRisk = true;
    }
  }
  for (const personId of [...projected.people.order].sort()) {
    const outcome = projected.people.byId[personId].pendingOutcome;
    if (outcome?.kind !== 'occupation' || outcome.status !== 'pending') continue;
    const parcelId = resolveCurrentParcelId(city, projected, outcome.parcelId)
      ?? outcome.parcelId;
    const status = projected.parcelStatus[parcelId];
    if (status) {
      status.occupancy = 'squatted';
      status.tenant = null;
      status.squatterSinceQuarter = projected.quarter;
    }
  }
  projected.blockDemandBp = humanDemandByBlock(city, projected);
  for (const parcelId of Object.keys(projected.parcelStatus).sort()) {
    const tenant = projected.parcelStatus[parcelId].tenant;
    if (
      tenant?.quality === 'stretch'
      && tenant.paymentAtRisk
      && activeParcel(city, projected, parcelId).sector === 'residential'
    ) {
      const parcel = activeParcel(city, projected, parcelId);
      const blockId = `${parcel.bx},${parcel.bz}`;
      projected.blockDemandBp[blockId] = Math.max(
        -RULES.peopleDemandClampBp,
        projected.blockDemandBp[blockId] - 20,
      );
    }
  }
  // Settlement marks ventures before rent and burn are charged. Mirror that order here
  // so a startup valued on this settle stops burning in both preview and the ledger.
  // The projected state is already an isolated clone; the event rows are presentation-only.
  applyVentureStep(projected);
  for (const parcelId of Object.keys(projected.holdings).sort()) {
    resolveConditionAssessment(city, projected, parcelId);
  }

  const obligations = (owner === 'player' ? state.obligations ?? [] : []).map((item) =>
    item.kind === 'auction' && item.timing === 'due'
      ? auctionItem ?? {
        kind: 'auction',
        eventId: item.eventId,
        timing: 'due',
        outcome: 'lost-or-absent',
        cashOut: 0,
        debtTaken: 0,
      }
      : { ...item });
  if (owner === 'player') obligations.push(...due);
  const rent = grossRent(city, projected, owner);
  const opex = applyBp(rent, RULES.opexBp) + ventureCashburnForOwner(projected, owner);
  const interestBp = activeInterestRateBp(projected, owner);
  const debtAtInterest = debtOf(projected, owner);
  const interest = applyBp(debtAtInterest, interestBp);
  const forecourt = petrolForecourtForOwner(city, projected, owner);
  const actionPhaseCash = owner === 'player' ? state.cash : state.rival.cash;
  const projectedCashBeforeIncome = owner === 'player' ? projected.cash : projected.rival.cash;
  const business = cybercabForOwner(projected, owner);
  const cybercab = business ? settleCybercab(business, { seed: projected.seed, quarter: projected.quarter }) : null;
  const cybercabNet = cybercab?.cashDelta ?? 0;
  const cashAfterDebtInterest = projectedCashBeforeIncome + rent - opex - interest + forecourt.amount + cybercabNet;
  const {
    negativePrincipal,
    overdraftInterest,
    cashAfterOverdraft,
  } = overdraftCharge(projected, cashAfterDebtInterest);
  const net = rent - opex - interest - overdraftInterest + forecourt.amount + cybercabNet;
  const dueCash = obligations
    .filter(({ timing }) => timing === 'due')
    .reduce((sum, item) => sum + (item.cashOut ?? 0), 0);
  return {
    rent,
    opex,
    interest,
    overdraft: overdraftInterest,
    overdraftInterest,
    negativePrincipal,
    net,
    interestBp,
    activeInterestBp: interestBp,
    debtAtInterest,
    obligations,
    dueCash,
    actionPhaseCash,
    projectedClosingCash: cashAfterOverdraft,
    forcedSaleTransactions,
    rivalMoveTransactions,
    ...(auctionPending ? { auctionPending: true } : {}),
    terminal: false,
    forecourt: forecourt.amount,
    forecourtCars: forecourt.cars,
    forecourtLines: forecourt.rows,
    cybercabIncome: cybercab?.fares ?? 0,
    cybercabCosts: cybercab?.costs ?? 0,
    cybercabPaidCosts: cybercab?.paidCosts ?? 0,
    cybercabNet,
  };
}

export function forecastFor(city, quarter) {
  const row = city.market.find((r) => r.quarter === quarter);
  if (!row) return null;
  const out = {};
  for (const sector of SECTOR_IDS) out[sector] = row.sectors[sector].forecastBp;
  return out;
}
