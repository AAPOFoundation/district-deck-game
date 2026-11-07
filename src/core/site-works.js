import { pendingRoomReplacementReason } from './room-economy-lifecycle.js';
// District Deck — demolition strikes and cleared-site building catalog.
// Pure rules only. Reducer wrappers pass a cloned state to the two do* mutators.

import { ARCHETYPES, RULES, ZONE_IDS } from './content.js';
import {
  consumeBuildKit,
  hasUnconsumedKit,
  isInstitutionKit,
  recordKitSeqWatermark,
} from './build-kits.js';
import { activeParcel } from './city.js';
import {
  archetypeIdOf, cashPosition, constructionDurationQuarters,
  redevelopQuote, rentFor,
} from './economy.js';
import { TILE, globalTile, parseParcelId } from './grid.js';
import { CIVIC_USES, EMITTER_LABELS, landUseFootprintFits } from './landuse.js';
import {
  approvedUsePermitId, derivedPlanningLevelFor,
} from './planning-permits.js';
import {
  isDataCentreArchetype, listedTickerOf, LISTED_DEMO_REASON, operatingBaseRent,
} from './ventures.js';
import { applyBp } from './rng.js';
import { buildingBaseFor } from './succession.js';
import { TENANT_TERMS } from './event-rules.js';
import { COMMERCIAL_TENANT_TERMS, isFranchiseTenancyUse } from './commercial-tenancy.js';
import {
  assignPadSlot,
  firstFreePadSlot,
  filledPadSlotCount,
  isOneByOneFootprint,
  livePadWorksJobs,
  maxStandingSlotStoreys,
  occupyWholePadSlots,
  oneTileLot,
  padSlotCentre,
  padSlotRecord,
  padSlotTiles,
  PAD_GROUP_DEMO_EXTRA_BP,
  PAD_SECOND_SLOT_COST_BP,
  resolvePadSlot,
  scaleWorksQuote,
  slotEconomicsParcel,
  standingPadSlotCount,
  syncDualPadIdentity,
} from './pad-slots.js';

export const DEMOLITION_STRIKES = 10;
export const BUILD_FAMILIES = Object.freeze([
  'residential', 'commercial', 'civic', 'industrial',
]);

const INDUSTRIAL_ARCHETYPES = new Set([
  'warehouse-brick',
  'factory-light',
  'warehouse-richmond-loft',
  'warehouse-datacentre',
  'hammerbarn',
  'grain-plot',
  'dairy-processor',
  'winery',
  'cattle-abattoir',
  'kiln',
  'works-hall',
  'pulp-mill',
  'printing-press',
  'refinery',
  'steelworks',
  'smelter',
  'terafab',
]);
const BUILD_EXCLUDED_ARCHETYPES = new Set([
  // V3.40 R1b: it remains valid existing board stock, but is no longer a BUILD choice.
  'warehouse-richmond-loft',
]);
const CIVIC_CATALOG_ARCHETYPES = new Set([
  // childcare-centre stays COMMERCIAL by standing user order (V3.38 M4, V3.40).
  'courthouse',
  'school-primary',
  'school-high',
  'supermarket-strip',
  'transport-interchange',
  'remand-centre',
  'police-station',
  'missionary-school',
  'officer-school',
  'space-works',
  'international-exchange',
  'biolab',
  'incubator',
]);
const BUILD_USE_PERMIT_BY_ARCHETYPE = Object.freeze({
  'childcare-centre': 'childcare',
});
// The medical-centre fit-out is the one shop-shell-only physical finish. Childcare and petrol
// are ground-up commercial forms and therefore must not be reserved out of BUILD.
const USE_CONVERSION_ARCHETYPES = new Set([
  'medical-centre',
]);
const COMMERCIAL_ALIASES = Object.freeze([
  Object.freeze({
    id: 'restaurant-hospitality', label: 'Restaurant', footprint: Object.freeze([1, 1]),
    storeys: 1, placesAs: 'shop-corner', placeable: true,
  }),
]);

function reject(state, reason) {
  return { rejected: true, state, events: [{ kind: 'reject', reason }] };
}

function positiveStoreys(value) {
  return Math.max(1, Math.floor(Number(value) || 1));
}

export function demolitionTotalCost(storeys) {
  const count = positiveStoreys(storeys);
  return 35_000 + Math.max(0, count - 2) * 20_000;
}

export function demolitionStrikeCost(storeys, strikeIndex) {
  if (!Number.isInteger(strikeIndex) || strikeIndex < 0 || strikeIndex >= DEMOLITION_STRIKES) {
    throw new RangeError(`Demolition strike index must be 0..${DEMOLITION_STRIKES - 1}.`);
  }
  const total = demolitionTotalCost(storeys);
  const ordinary = Math.floor(total / DEMOLITION_STRIKES);
  return strikeIndex === DEMOLITION_STRIKES - 1
    ? total - ordinary * (DEMOLITION_STRIKES - 1)
    : ordinary;
}

export function parcelStoreys(city, state, parcelId) {
  const holding = state?.holdings?.[parcelId];
  const slotStoreys = maxStandingSlotStoreys(holding);
  if (slotStoreys != null) return slotStoreys;
  const parcel = activeParcel(city, state, parcelId);
  const archetype = ARCHETYPES[archetypeIdOf(city, state, parcelId)];
  return positiveStoreys(archetype?.storeys ?? parcel?.storeys ?? 1);
}

function tileBounds(tileIds) {
  if (!tileIds?.length) return null;
  const points = tileIds.map((id) => {
    const tile = parseParcelId(id);
    return globalTile(tile.bx, tile.bz, tile.tx, tile.tz);
  });
  const xs = points.map(({ gx }) => gx);
  const zs = points.map(({ gz }) => gz);
  return {
    w: Math.max(...xs) - Math.min(...xs) + 1,
    d: Math.max(...zs) - Math.min(...zs) + 1,
  };
}

export function parcelLotTiles(city, state, parcelId) {
  const parcel = activeParcel(city, state, parcelId);
  if (!parcel) return null;
  const bounds = tileBounds(parcel.tiles);
  // Consolidation spreads the lower parent (including its stale 1×1 groundFootprint)
  // before joining the live tile set. The live two-tile bounds are authoritative for a pad.
  const w = positiveStoreys(
    (parcel.consolidated ? bounds?.w : parcel.groundFootprint?.[0])
      ?? bounds?.w
      ?? parcel.groundFootprint?.[0]
      ?? 1,
  );
  const d = positiveStoreys(
    (parcel.consolidated ? bounds?.d : parcel.groundFootprint?.[1])
      ?? bounds?.d
      ?? parcel.groundFootprint?.[1]
      ?? 1,
  );
  const tiles = Math.max(1, parcel.tiles?.length ?? w * d);
  return Object.freeze({ w, d, tiles, areaM2: tiles * TILE * TILE });
}

export function catalogFootprint(entry) {
  const w = positiveStoreys(entry?.footprint?.[0] ?? 1);
  const d = positiveStoreys(entry?.footprint?.[1] ?? 1);
  return Object.freeze({
    w,
    d,
    areaM2: w * d * TILE * TILE,
    storeys: positiveStoreys(entry?.storeys ?? 1),
  });
}

export function footprintFits(lot, building) {
  return Boolean(lot && building && landUseFootprintFits(lot, building));
}

function catalogRow({ id, family, label, footprint, storeys, placesAs = null, placeable, zoneIds = null }) {
  const target = placesAs ? ARCHETYPES[placesAs] : null;
  // L0 is the as-of-right register: single-storey forms need no height permit.
  // Taller forms bind to the existing L1-L3 height ladder, then honour any stricter
  // authored classification (the three-storey data centre is deliberately L3).
  const derivedPermitLevel = target
    ? (positiveStoreys(target.storeys) === 1 ? 0 : derivedPlanningLevelFor(target))
    : null;
  const authoredMinimum = Math.max(0, Math.floor(Number(target?.minPermitLevel) || 0));
  const requiredPermitLevel = derivedPermitLevel == null
    ? null
    : Math.max(derivedPermitLevel, authoredMinimum);
  const requiredUsePermitId = placesAs
    ? (BUILD_USE_PERMIT_BY_ARCHETYPE[placesAs] ?? null)
    : null;
  const zones = Array.isArray(zoneIds) && zoneIds.length
    ? zoneIds
    : (Array.isArray(target?.zoneIds) && target.zoneIds.length ? target.zoneIds : null);
  return Object.freeze({
    id,
    family,
    label: label ?? EMITTER_LABELS[id] ?? String(id).replace(/-/g, ' '),
    footprint: Object.freeze([positiveStoreys(footprint?.[0]), positiveStoreys(footprint?.[1])]),
    storeys: positiveStoreys(storeys),
    placesAs,
    placeable: Boolean(placeable),
    requiredPermitLevel,
    requiredUsePermitId,
    zoneIds: zones ? Object.freeze([...zones]) : null,
  });
}

function createBuildCatalog() {
  const rows = [];
  for (const archetype of Object.values(ARCHETYPES)) {
    if (archetype.conversionOnly || BUILD_EXCLUDED_ARCHETYPES.has(archetype.id)) continue;
    let family = null;
    if (CIVIC_CATALOG_ARCHETYPES.has(archetype.id)) family = 'civic';
    else if (INDUSTRIAL_ARCHETYPES.has(archetype.id)) family = 'industrial';
    else if (archetype.sector === 'residential') family = 'residential';
    else if (archetype.sector === 'retail' || archetype.sector === 'office') family = 'commercial';
    if (!family) continue;
    rows.push(catalogRow({
      ...archetype,
      family,
      placesAs: archetype.id,
      placeable: true,
    }));
  }

  for (const alias of COMMERCIAL_ALIASES) {
    rows.push(catalogRow({ ...alias, family: 'commercial' }));
  }

  const reserved = new Set([
    ...COMMERCIAL_ALIASES.map(({ id }) => id),
    ...INDUSTRIAL_ARCHETYPES,
    ...USE_CONVERSION_ARCHETYPES,
    // The café is a commercial parcel archetype even though the city also stamps it as a civic.
    'cafe-corner',
  ]);
  for (const use of CIVIC_USES) {
    if (reserved.has(use.id)) continue;
    // An archetype that already carries its own placeable row in another family must not
    // double-list from the civic-use side (childcare-centre is COMMERCIAL by user order).
    if (rows.some((row) => row.id === use.id && row.placeable)) continue;
    const family = 'civic';
    const placesAs = ARCHETYPES[use.id] ? use.id : null;
    rows.push(catalogRow({
      ...use,
      family,
      placesAs,
      placeable: Boolean(placesAs),
    }));
  }

  for (const id of ['works-yard', 'sewerage-plant']) {
    if (!EMITTER_LABELS[id]) continue;
    rows.push(catalogRow({
      id,
      family: 'industrial',
      label: EMITTER_LABELS[id],
      footprint: [1, 1],
      storeys: 1,
      placesAs: ARCHETYPES[id] ? id : null,
      placeable: Boolean(ARCHETYPES[id]),
    }));
  }

  const unique = new Map();
  for (const row of rows) unique.set(`${row.family}:${row.id}`, row);
  return Object.freeze([...unique.values()].sort((left, right) =>
    BUILD_FAMILIES.indexOf(left.family) - BUILD_FAMILIES.indexOf(right.family)
      || catalogSortPermit(left) - catalogSortPermit(right)
      || catalogSortPrice(left) - catalogSortPrice(right)
      || left.label.localeCompare(right.label)
      || left.id.localeCompare(right.id)));
}

function catalogArchetype(row) {
  return ARCHETYPES[row?.placesAs] ?? ARCHETYPES[row?.id] ?? null;
}

function catalogSortPermit(row) {
  const authored = Math.floor(Number(catalogArchetype(row)?.minPermitLevel) || 0);
  return authored > 0 ? authored : 1;
}

function catalogSortPrice(row) {
  return Number(catalogArchetype(row)?.basePrice) || 0;
}

const BUILD_CATALOG = createBuildCatalog();

export function buildCatalog() {
  return BUILD_CATALOG;
}

export function buildCatalogByFamily(family) {
  return Object.freeze(BUILD_CATALOG.filter((entry) => entry.family === family));
}

export function industrialZoningAllows(parcel) {
  // Industrial forms sit in commercial and mixed-use intensity (V3.39: CZ joins MUZ).
  return Boolean(parcel && ZONE_IDS.includes(parcel.zoneId)
    && (parcel.zoneId === 'MUZ' || parcel.zoneId === 'CZ'));
}

function zoningAllows(entry, parcel) {
  if (entry?.family === 'industrial') return industrialZoningAllows(parcel);
  if (Array.isArray(entry?.zoneIds) && entry.zoneIds.length) {
    return Boolean(parcel && entry.zoneIds.includes(parcel.zoneId));
  }
  return true;
}

function zoneRefusal(entry) {
  if (entry?.family === 'industrial') return 'Industrial needs mixed-use zoning.';
  const zones = Array.isArray(entry?.zoneIds) ? entry.zoneIds.filter(Boolean) : [];
  if (entry?.id === 'space-works') return 'Space works needs MUZ or CZ.';
  if (entry?.id === 'international-exchange') return 'International exchange needs CZ.';
  if (entry?.id === 'biolab') return 'Biolab needs CZ.';
  if (zones.length) return `${entry.label} needs ${zones.join(' or ')}.`;
  return 'That form is not zoned for this parcel.';
}

function placementQuote(city, state, parcelId, entry) {
  const holding = state?.holdings?.[parcelId];
  const status = state?.parcelStatus?.[parcelId];
  if (!holding || !status || !entry?.placesAs) return null;
  const quoteCeiling = Math.max(
    1,
    entry.requiredPermitLevel ?? 0,
    Number(holding.planningCeiling) || 0,
  );
  const slot = resolvePadSlot(city, state, parcelId, entry.footprint);
  const economics = slot ? slotEconomicsParcel(city, state, parcelId, slot) : null;
  const quoteState = economics && state.topology?.parcels?.[parcelId]
    ? {
      ...state,
      topology: {
        ...state.topology,
        parcels: {
          ...state.topology.parcels,
          [parcelId]: economics,
        },
      },
    }
    : state;
  // Ground-up BUILD pricing uses the existing works economics without inheriting
  // succession-only source restrictions (for example Hammerbarn's self-rebuild rule).
  const projected = {
    ...quoteState,
    holdings: {
      ...quoteState.holdings,
      [parcelId]: {
        ...holding,
        archetypeId: entry.placesAs,
        planningCeiling: quoteCeiling,
        siteCleared: true,
      },
    },
    parcelStatus: {
      ...quoteState.parcelStatus,
      [parcelId]: {
        ...status,
        builtArchetypeId: entry.placesAs,
        builtLandUseId: entry.id,
        builtLevel: 0,
      },
    },
  };
  // Value and rent after works are read at the level doPlaceBuilding installs.
  const ordinary = redevelopQuote(city, projected, parcelId, 'player', entry.placesAs, {
    finishLevel: Math.max(0, entry.requiredPermitLevel ?? 0),
  });
  if (slot && filledPadSlotCount(holding) >= 1) {
    return scaleWorksQuote(ordinary, PAD_SECOND_SLOT_COST_BP);
  }
  return ordinary;
}

/**
 * The tenant tier a finished BUILD form is priced at. finishConstructionJob (state.js) leases a
 * data centre to a secure tenant on completion; a franchise use's 10000 bp tier is the regional
 * chain; every other use leases to a standard tenant.
 */
export function buildTenantQuality(archetypeId) {
  if (isDataCentreArchetype(archetypeId)) return 'secure';
  return isFranchiseTenancyUse(archetypeId) ? 'regional-chain' : 'standard';
}

function buildTenant(quality) {
  const terms = TENANT_TERMS[quality] ?? COMMERCIAL_TENANT_TERMS[quality];
  return { quality, rentBp: terms.rentBp, paymentAtRisk: false };
}

// The slot record finishConstructionJob (state.js) writes when a pad job finishes.
function finishedSlotRecord(city, state, parcelId, slot, record, archetypeId, level) {
  const completed = buildingBaseFor(
    slotEconomicsParcel(city, state, parcelId, slot),
    archetypeId,
    RULES.maxCondition,
    { parcelStatus: state.parcelStatus[parcelId] },
  );
  return {
    ...(record ?? {}),
    archetypeId,
    status: 'standing',
    works: null,
    basePrice: completed.basePrice,
    baseRent: operatingBaseRent(archetypeId, completed.baseRent),
    level,
  };
}

/**
 * Quarterly rent the form earns once finished and leased, read by rentFor itself on a copy of
 * the state with the works done, so block demand, civic upgrades, district formations and the
 * price index count as they do in the books. On a merged pad the figure is the rise in the pad's
 * rent, because both slots earn the higher slot level: a second form's figure carries the uplift
 * it gives the first. Any other live job on the pad counts as finished on both sides of that rise.
 * The tenant tier follows the form the holding is known by once finished (slot A on a pad).
 * Returns { rent, tenant } with tenant a buildTenantQuality tier, or null.
 */
function finishedRentAfter(city, state, parcelId, entry, slot) {
  const holding = state?.holdings?.[parcelId];
  const status = state?.parcelStatus?.[parcelId];
  const parcel = activeParcel(city, state, parcelId);
  const archetypeId = entry?.placesAs;
  if (!holding || !status || !parcel || !ARCHETYPES[archetypeId]) return null;
  const level = Math.max(0, entry.requiredPermitLevel ?? 0);
  const tenantOf = (built) => buildTenantQuality(built.builtArchetypeId);
  const leasedRent = (finished, built) => rentFor(city, {
    ...state,
    holdings: { ...state.holdings, [parcelId]: finished },
    parcelStatus: {
      ...state.parcelStatus,
      [parcelId]: {
        ...status,
        builtArchetypeId: built.builtArchetypeId,
        builtLandUseId: built.builtLandUseId,
        builtLevel: built.builtLevel,
        condition: RULES.maxCondition,
        damage: null,
        occupancy: 'tenant',
        tenant: buildTenant(tenantOf(built)),
      },
    },
  }, parcelId);
  const finished = { ...holding, siteCleared: false, condition: RULES.maxCondition };
  delete finished.construction;
  delete finished.demolition;
  delete finished.hospitality;

  if (!slot) {
    const completed = buildingBaseFor(parcel, archetypeId, RULES.maxCondition, { parcelStatus: status });
    const tiles = padSlotTiles(city, state, parcelId);
    Object.assign(finished, {
      archetypeId,
      landUseId: entry.id,
      sector: completed.sector,
      basePrice: completed.basePrice,
      baseRent: operatingBaseRent(archetypeId, completed.baseRent),
      level,
    });
    if (tiles && !isOneByOneFootprint(entry.footprint)) {
      const whole = { catalogId: entry.id, archetypeId, status: 'standing', works: null, whole: true };
      finished.padSlots = { A: { ...whole, tileId: tiles.A }, B: { ...whole, tileId: tiles.B } };
    }
    const built = { builtArchetypeId: archetypeId, builtLandUseId: entry.id, builtLevel: level };
    return { rent: leasedRent(finished, built), tenant: tenantOf(built) };
  }

  const slots = { ...padSlotRecord(holding) };
  finished.padSlots = slots;
  const built = {
    builtArchetypeId: status.builtArchetypeId,
    builtLandUseId: status.builtLandUseId,
    builtLevel: status.builtLevel,
  };
  for (const { slot: other, construction: job } of livePadWorksJobs(holding)) {
    if (!other || other === slot || slots[other]?.status !== 'works') continue;
    slots[other] = finishedSlotRecord(city, state, parcelId, other, slots[other], job.toArchetype, job.nextLevel);
    finished.level = job.nextLevel;
    syncDualPadIdentity(finished, built);
  }
  const before = standingPadSlotCount(finished) > 0 ? leasedRent({ ...finished }, { ...built }) : 0;
  slots[slot] = finishedSlotRecord(city, state, parcelId, slot, {
    ...(slots[slot] ?? {}),
    catalogId: entry.id,
    tileId: slots[slot]?.tileId ?? padSlotTiles(city, state, parcelId)?.[slot] ?? null,
  }, archetypeId, level);
  finished.level = level;
  syncDualPadIdentity(finished, built);
  return { rent: leasedRent(finished, built) - before, tenant: tenantOf(built) };
}

export function permittedBuildCatalog(city, state, parcelId, family = null) {
  const parcel = activeParcel(city, state, parcelId);
  const holding = state?.holdings?.[parcelId];
  if (!parcel || holding?.owner !== 'player') return Object.freeze([]);
  return Object.freeze(BUILD_CATALOG.filter((entry) => (
    (!family || entry.family === family)
    && entry.placeable
    && entry.placesAs
    && ARCHETYPES[entry.placesAs]
    && (entry.requiredPermitLevel ?? Number.POSITIVE_INFINITY) <= (holding.planningCeiling ?? 0)
    && (!entry.requiredUsePermitId
      || approvedUsePermitId(holding) === entry.requiredUsePermitId)
    && (entry.family !== 'industrial' || industrialZoningAllows(parcel))
    && (!entry.zoneIds || entry.zoneIds.includes(parcel.zoneId))
    && placementQuote(city, state, parcelId, entry)
  )));
}

function catalogEntry(catalogId) {
  return BUILD_CATALOG.find(({ id }) => id === catalogId) ?? null;
}

export function canDemolishStrike(city, state, parcelId) {
  const roomReason = pendingRoomReplacementReason(state, parcelId);
  if (roomReason) return { ok: false, reason: roomReason };
  if (state?.phase !== 'play') return { ok: false, reason: 'The run is over.' };
  const parcel = activeParcel(city, state, parcelId);
  const holding = state?.holdings?.[parcelId];
  if (!parcel || !holding || holding.owner !== 'player') {
    return { ok: false, reason: 'Only player holdings can be demolished.' };
  }
  if (listedTickerOf(holding)) return { ok: false, reason: LISTED_DEMO_REASON };
  if (holding.siteCleared) return { ok: false, reason: 'This pad is already cleared.' };
  if (holding.construction || holding.renovation) {
    return { ok: false, reason: 'Works are already live on this holding.' };
  }
  if (holding.redevelopmentNotice) {
    return { ok: false, reason: 'A tenant notice is already served on this holding.' };
  }
  const status = state.parcelStatus?.[parcelId];
  if (status?.occupancy === 'tenant') return { ok: false, reason: 'Clear tenancy first.' };
  if (status?.occupancy === 'squatted') return { ok: false, reason: 'Remediate first.' };

  const saved = holding.demolition;
  const storeys = positiveStoreys(saved?.storeys ?? parcelStoreys(city, state, parcelId));
  const extraBuildings = Math.max(0, standingPadSlotCount(holding) - 1);
  const totalCost = saved?.totalCost ?? applyBp(
    demolitionTotalCost(storeys),
    10000 + extraBuildings * PAD_GROUP_DEMO_EXTRA_BP,
  );
  const strikes = Math.max(0, Math.min(
    DEMOLITION_STRIKES,
    Math.floor(saved?.strikes ?? 0),
  ));
  if (strikes >= DEMOLITION_STRIKES) {
    return { ok: false, reason: 'This pad is already cleared.' };
  }
  const paid = Math.max(0, Math.floor(saved?.paid ?? 0));
  const cost = demolitionStrikeCost(storeys, strikes);
  const funds = cashPosition(city, state, 'player', cost);
  if (!funds.ok) return { ok: false, reason: 'Not enough cash for this strike.' };
  return {
    ok: true,
    reason: '',
    cost,
    strikes,
    remaining: Math.max(0, totalCost - paid - cost),
    totalCost,
    storeys,
  };
}

/** Mutates the reducer-owned clone passed as `state`; it never commits an action. */
export function doDemolishStrike(city, state, action) {
  const check = canDemolishStrike(city, state, action?.parcelId);
  if (!check.ok) return reject(state, check.reason);
  const holding = state.holdings[action.parcelId];
  const strikes = check.strikes + 1;
  const paid = (holding.demolition?.paid ?? 0) + check.cost;
  holding.demolition = {
    strikes,
    storeys: check.storeys,
    totalCost: check.totalCost,
    paid,
  };
  state.cash -= check.cost;
  const cleared = strikes === DEMOLITION_STRIKES;
  if (cleared) {
    holding.siteCleared = true;
    holding.padSlots = { A: null, B: null };
    const status = state.parcelStatus[action.parcelId];
    status.occupancy = 'vacant';
    status.tenant = null;
    status.squatterSinceQuarter = null;
  }
  return {
    state,
    events: [{
      kind: 'demolish-strike',
      parcelId: action.parcelId,
      strikes,
      total: DEMOLITION_STRIKES,
      amount: check.cost,
      cost: check.cost,
      paid,
      remaining: check.remaining,
      totalCost: check.totalCost,
      storeys: check.storeys,
      cleared,
      fromArchetype: archetypeIdOf(city, state, action.parcelId),
    }],
  };
}

export function siteWorksOverlay(city, state, parcelId, catalogId) {
  if (activeParcel(city, state, parcelId)?.surveyedFarm || catalogId === 'farm') return farmBuildOverlay(city, state, parcelId, catalogId);
  const parcel = activeParcel(city, state, parcelId);
  const entry = catalogEntry(catalogId);
  if (!parcel || !entry) return null;
  const lot = parcelLotTiles(city, state, parcelId);
  const building = catalogFootprint(entry);
  const holding = state.holdings?.[parcelId];
  const placesAs = entry.placesAs ? ARCHETYPES[entry.placesAs] : null;
  const requiredCeiling = placesAs ? entry.requiredPermitLevel : null;
  const planningCeiling = Math.max(0, Math.floor(Number(holding?.planningCeiling) || 0));
  const permitted = Boolean(
    placesAs
    && requiredCeiling != null
    && requiredCeiling <= planningCeiling,
  );
  const requiredUsePermitId = entry.requiredUsePermitId ?? null;
  const usePermitted = Boolean(
    !requiredUsePermitId || approvedUsePermitId(holding) === requiredUsePermitId,
  );
  const worksQuote = permitted ? placementQuote(city, state, parcelId, entry) : null;
  const vacantMergedPad = Boolean(
    parcel.consolidated
    && (state.parcelStatus?.[parcelId]?.builtLevel ?? holding?.level ?? 0) === 0
    && state.parcelStatus?.[parcelId]?.occupancy === 'vacant'
    && !holding?.construction
    && filledPadSlotCount(holding) === 0,
  );
  const slot = resolvePadSlot(city, state, parcelId, entry.footprint);
  const slotReady = Boolean(slot && firstFreePadSlot(city, state, parcelId) === slot);
  const slotCentre = slot ? padSlotCentre(city, state, parcelId, slot) : null;
  const overlayLot = slot ? oneTileLot() : lot;
  const finishedRent = worksQuote ? finishedRentAfter(city, state, parcelId, entry, slot) : null;
  return Object.freeze({
    parcelId,
    catalogId,
    lot: overlayLot,
    building,
    fits: footprintFits(overlayLot, building),
    owned: holding?.owner === 'player',
    cleared: Boolean(holding?.siteCleared || vacantMergedPad || slotReady),
    placeable: entry.placeable,
    permitted,
    requiredCeiling,
    planningCeiling,
    requiredUsePermitId,
    usePermitted,
    zoned: zoningAllows(entry, parcel),
    zoneId: parcel.zoneId,
    archetypeId: entry.placesAs,
    cost: worksQuote?.cost ?? null,
    cashOut: worksQuote?.cashOut ?? null,
    debtTaken: worksQuote?.debtTaken ?? null,
    durationQuarters: worksQuote?.durationQuarters
      ?? (placesAs ? constructionDurationQuarters(entry.placesAs, placesAs.sector) : null),
    valueAfter: worksQuote?.valueAfter ?? null,
    // rentFor on the finished, leased form at today's prices (finishedRentAfter).
    rentAfter: finishedRent?.rent ?? null,
    rentTenant: finishedRent?.tenant ?? null,
    centre: Object.freeze(slotCentre ?? { x: parcel.centre.x, z: parcel.centre.z }),
    slot: slot ?? null,
    secondSlot: Boolean(slot && filledPadSlotCount(holding) >= 1),
  });
}

export const WORKS_LIVE_REASON = 'Works are already live on this holding.';

/**
 * BUILD's works-live refusal: renovation, or construction that leaves no free 1×1
 * pad slot for this form. The ribbon reads it for its chip whatever else refuses the row.
 */
export function worksLiveBlocksForm(city, state, parcelId, catalogId) {
  const holding = state?.holdings?.[parcelId];
  if (!holding) return false;
  if (holding.renovation) return true;
  if (!holding.construction) return false;
  const entry = catalogEntry(catalogId);
  if (!entry) return false;
  const freeSlot = resolvePadSlot(city, state, parcelId, entry.footprint)
    ?? firstFreePadSlot(city, state, parcelId);
  return !freeSlot || !isOneByOneFootprint(entry.footprint);
}

export function canPlaceBuilding(city, state, parcelId, catalogId, slot = null, store = null) {
  const roomReason = pendingRoomReplacementReason(state, parcelId);
  if (roomReason) return { ok: false, reason: roomReason };
  if (activeParcel(city, state, parcelId)?.surveyedFarm || catalogId === 'farm') return farmActionCheck(city, state, parcelId, 'build', catalogId);
  if (state?.phase !== 'play') return { ok: false, reason: 'The run is over.' };
  if (state.actionsRemaining <= 0) {
    return { ok: false, reason: 'No actions left this quarter.' };
  }
  const entry = catalogEntry(catalogId);
  if (!entry) return { ok: false, reason: 'Unknown building type.' };
  if (slot === 'A' || slot === 'B') {
    const tiles = padSlotTiles(city, state, parcelId);
    if (!tiles) return { ok: false, reason: 'This holding has no pad slots.' };
    if (!isOneByOneFootprint(entry.footprint)) {
      return { ok: false, reason: 'That form needs the whole pad.' };
    }
    const resolved = resolvePadSlot(city, state, parcelId, entry.footprint, slot);
    if (resolved !== slot) return { ok: false, reason: 'That pad slot is taken.' };
  }
  const overlay = siteWorksOverlay(city, state, parcelId, catalogId);
  if (!overlay) return { ok: false, reason: 'Pick a parcel to size it.' };
  if (!entry.placeable || !entry.placesAs || !ARCHETYPES[entry.placesAs]) {
    return { ok: false, reason: 'Planning row only.', ...overlay };
  }
  const holding = state.holdings?.[parcelId];
  if (!holding || holding.owner !== 'player') {
    return { ok: false, reason: 'Acquire this parcel first.', ...overlay };
  }
  if (worksLiveBlocksForm(city, state, parcelId, catalogId)) {
    return { ok: false, reason: WORKS_LIVE_REASON, ...overlay };
  }
  if (!overlay.cleared) {
    return { ok: false, reason: 'Demolish the standing building first.', ...overlay };
  }
  if (!overlay.zoned) {
    return { ok: false, reason: zoneRefusal(entry), ...overlay };
  }
  if (!overlay.permitted) {
    return {
      ok: false,
      reason: `Lobby L${overlay.requiredCeiling} first.`,
      ...overlay,
    };
  }
  if (!overlay.usePermitted) {
    return {
      ok: false,
      reason: `Approve the ${String(overlay.requiredUsePermitId)} use first.`,
      ...overlay,
    };
  }
  if (!overlay.fits) {
    return { ok: false, reason: 'Building is oversize for this parcel.', ...overlay };
  }
  if (holding.redevelopmentNotice) {
    return { ok: false, reason: 'Wait for the holding to become vacant.', ...overlay };
  }
  const status = state.parcelStatus?.[parcelId];
  if (status?.occupancy === 'tenant') {
    return { ok: false, reason: 'Notice or buy out first.', ...overlay };
  }
  if (status?.occupancy === 'squatted') {
    return { ok: false, reason: 'Remediate the holding first.', ...overlay };
  }
  if (!Number.isInteger(overlay.cost)) {
    return { ok: false, reason: 'No live build quote.', ...overlay };
  }
  if (!Number.isInteger(overlay.cashOut) || !Number.isInteger(overlay.debtTaken)) {
    return { ok: false, reason: 'No live build terms.', ...overlay };
  }
  const funds = cashPosition(city, state, 'player', overlay.cashOut);
  if (!funds.ok) {
    return {
      ok: false,
      reason: `Short $${funds.shortfall.toLocaleString('en-AU')} against the overdraft floor.`,
      ...overlay,
    };
  }
  const institutionId = isInstitutionKit(entry.placesAs) ? entry.placesAs : null;
  if (institutionId) {
    const kit = hasUnconsumedKit(institutionId, state, store);
    if (!kit.ok) return { ok: false, reason: kit.reason, ...overlay };
  }
  return {
    ok: true,
    reason: '',
    ...overlay,
    ...funds,
    entry,
    placesAs: entry.placesAs,
  };
}

export function farmActionCheck(city, state, id, op, catalogId = 'farm') {
  if (!activeParcel(city, state, id)?.surveyedFarm || catalogId !== 'farm') return { ok: false, reason: 'Farm needs a surveyed hinterland paddock.' };
  if (state.phase !== 'play' || state.actionsRemaining < 1) return { ok: false, reason: 'One action required.' };
  const farm = state.farms?.[id], cost = op === 'acquire' ? 20000 : 30000;
  if (op === 'acquire' && farm) return { ok: false, reason: 'Already acquired.' };
  if (op === 'build' && (!farm || farm.owner !== 'player' || farm.permit?.id !== 'agriculture' || farm.permit.level < 1)) return { ok: false, reason: 'Acquire the paddock with its L1 Agriculture covenant first.' };
  if (op === 'build' && (farm.construction || farm.completedQuarter != null)) return { ok: false, reason: 'Farm already built or under construction.' };
  if (state.cash < cost) return { ok: false, reason: 'Not enough cash.' };
  return { ok: true, cost };
}

function farmBuildOverlay(city, state, id, catalogId) {
  const parcel = activeParcel(city, state, id), farm = state.farms?.[id];
  if (!parcel) return null;
  return { parcelId: id, catalogId, lot: { w: 3, d: 3 }, building: { w: 3, d: 3 },
    fits: parcel.surveyedFarm === true, owned: farm?.owner === 'player', cleared: Boolean(farm && !farm.construction && farm.completedQuarter == null),
    placeable: true, permitted: farm?.permit?.level === 1, requiredCeiling: 1, planningCeiling: farm?.permit?.level ?? 0,
    usePermitted: true, zoned: parcel.surveyedFarm === true && catalogId === 'farm', zoneId: 'AG', archetypeId: 'farm',
    cost: 30000, cashOut: 30000, debtTaken: 0, durationQuarters: 1, centre: parcel.centre, slot: null };
}

/** Mutates the reducer-owned clone passed as `state`; it never commits an action. */
export function doPlaceBuilding(city, state, action) {
  const store = action?.store ?? null;
  const check = canPlaceBuilding(
    city,
    state,
    action?.parcelId,
    action?.catalogId,
    action?.slot ?? null,
    store,
  );
  if (!check.ok) return reject(state, check.reason);
  const institutionId = isInstitutionKit(check.placesAs) ? check.placesAs : null;
  if (institutionId) {
    const consumed = consumeBuildKit(institutionId, state, store);
    if (!consumed.ok) return reject(state, consumed.reason);
    state.kitSeqWatermark = recordKitSeqWatermark(
      state.kitSeqWatermark,
      institutionId,
      consumed.seq,
    );
  }
  const holding = state.holdings[action.parcelId];
  const fromArchetype = archetypeIdOf(city, state, action.parcelId) ?? 'vacant-pad';
  const target = ARCHETYPES[check.placesAs];
  const durationQuarters = constructionDurationQuarters(check.placesAs, target.sector);
  const slot = check.slot
    ?? resolvePadSlot(city, state, action.parcelId, check.entry.footprint, action?.slot ?? null);
  const tiles = padSlotTiles(city, state, action.parcelId);
  const quote = {
    cost: check.cost,
    cashOut: check.cashOut,
    debtTaken: check.debtTaken,
    fromArchetype,
    toArchetype: check.placesAs,
    toLandUseId: check.entry.id,
    nextLevel: Math.max(0, check.requiredCeiling ?? 0),
    durationQuarters,
    residentialBuild: target.sector === 'residential',
    defectChanceBp: 0,
    slot: slot ?? null,
  };
  state.cash -= check.cashOut;
  holding.debt += check.debtTaken;
  holding.siteCleared = false;
  delete holding.demolition;
  // The demolished building's hospitality record must not survive onto the
  // replacement works — a rebuilt pad is not still a hotel.
  delete holding.hospitality;
  if (tiles && slot) {
    assignPadSlot(holding, slot, {
      catalogId: action.catalogId,
      archetypeId: check.placesAs,
      tileId: tiles[slot],
      status: 'works',
    });
  } else if (tiles && !isOneByOneFootprint(check.entry.footprint)) {
    occupyWholePadSlots(holding, {
      catalogId: action.catalogId,
      archetypeId: check.placesAs,
      status: 'works',
    }, tiles);
  }
  return {
    state,
    events: [{
      kind: 'place-building',
      parcelId: action.parcelId,
      catalogId: action.catalogId,
      slot: slot ?? null,
      label: check.entry.label,
      amount: check.cashOut,
      cost: check.cost,
      quote,
    }],
  };
}
