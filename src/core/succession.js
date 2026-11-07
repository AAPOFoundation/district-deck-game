// District Deck V3.02 — condition, succession and construction content.
// Pure deterministic helpers only: no renderer state, clock reads or mutation.

import { applyBp } from './rng.js';
import { ARCHETYPES, RULES } from './content.js';

export const CONDITION_LABELS = Object.freeze(['Tired', 'Sound', 'Renewed']);

export const CONDITION_WEIGHTS = Object.freeze({
  historic: Object.freeze([
    Object.freeze({ id: 0, weight: 46 }),
    Object.freeze({ id: 1, weight: 40 }),
    Object.freeze({ id: 2, weight: 14 }),
  ]),
  interwar: Object.freeze([
    Object.freeze({ id: 0, weight: 34 }),
    Object.freeze({ id: 1, weight: 46 }),
    Object.freeze({ id: 2, weight: 20 }),
  ]),
  industrial: Object.freeze([
    Object.freeze({ id: 0, weight: 40 }),
    Object.freeze({ id: 1, weight: 42 }),
    Object.freeze({ id: 2, weight: 18 }),
  ]),
  modern: Object.freeze([
    Object.freeze({ id: 0, weight: 18 }),
    Object.freeze({ id: 1, weight: 46 }),
    Object.freeze({ id: 2, weight: 36 }),
  ]),
});

/**
 * L1 succession (no height permit): ordinary upgrades that stay on opening-stock families.
 * L2 under PERMIT L2 finishes as planning-permit apartments for residential (see economy).
 * Apartment forms never appear in district generation weights.
 */
export const SUCCESSOR = Object.freeze({
  'cottage-federation': 'townhouse-row',
  'heritage-federation-villa': 'townhouse-row',
  'bungalow-californian': 'townhouse-row',
  'bungalow-brighton': 'townhouse-row',
  'terrace-single': 'terrace-double',
  'terrace-double': 'walkup-flats',
  'terrace-carlton-heritage': 'walkup-flats',
  'townhouse-row': 'walkup-flats',
  'townhouse-paired-single': 'townhouse-paired-single',
  // Interwar flats / L1 stock → modern apartments only when L2 permit finishes (economy).
  'walkup-flats': 'apartment-permit',
  'walkup-beaux-arts': 'apartment-permit',
  'walkup-moderne': 'apartment-permit',
  'art-deco-flats': 'apartment-permit',
  // Apartment ladder (built forms only — never map-start).
  'apartment-permit': 'apartment-mid',
  'apartment-low': 'apartment-mid',
  'apartment-midrise': 'apartment-mid',
  'apartment-mid': 'apartment-tower',
  'apartment-tower': 'apartment-tower',
  'house-modern-skillion': 'townhouse-modern-brick',
  'house-modern-pavilion': 'townhouse-modern-render',
  'townhouse-modern-brick': 'apartment-modern-courtyard',
  'townhouse-modern-render': 'apartment-modern-courtyard',
  'apartment-modern-courtyard': 'apartment-modern-bar',
  'apartment-modern-bar': 'apartment-modern-bar',
  // Shop-corner sites share the authored residential L1 rung. A separate use permit
  // may still retain a retail/mixed use; the height ladder itself unlocks Townhouses.
  'shop-corner': 'townhouse-row',
  'shop-corner-victorian': 'townhouse-row',
  'shop-corner-deco': 'townhouse-row',
  'shop-corner-modern': 'townhouse-row',
  'shoptop-mixed': 'apartment-permit',
  'warehouse-brick': 'warehouse-converted',
  'warehouse-richmond-loft': 'warehouse-converted',
  'warehouse-converted': 'office-lowrise',
  // V3.70 L6. The data centre is the bond store's OTHER future (`USE_PERMITS['data-centre']`),
  // and like the apartments conversion it is a built form, never map-start stock. L1
  // industrial redevelop still walks this chain (planning finish is null on sheds);
  // L2+ uses the granted finish and does not need the hop.
  'warehouse-datacentre': 'office-lowrise',
  'factory-light': 'warehouse-converted',
  // Hammerbarn stays a hardware warehouse. Townhouse / apartment finishes are
  // refused at the planning layer; a same-form rebuild is the only L1 job.
  'hammerbarn': 'hammerbarn',
  'office-lowrise': 'tower-office',
  // Tower is the office ceiling form — L0→L1 still pays the redevelop job as a
  // same-form rebuild under the planning rung (value via level multipliers).
  'tower-office': 'tower-office',
});

/** Opening-stock archetypes only (map generation must not seed apartments). */
export const MAP_START_APARTMENT_IDS = Object.freeze([
  'apartment-permit',
  'apartment-low',
  'apartment-mid',
  'apartment-midrise',
  'apartment-tower',
]);

export function eraBand(archetype) {
  const era = archetype?.era ?? '';
  if (/Victorian|Edwardian|Federation/.test(era)) return 'historic';
  if (/Interwar/.test(era)) return 'interwar';
  if (/Industrial/.test(era)) return 'industrial';
  return 'modern';
}

export function drawCondition(rng, archetype) {
  return rng.weighted(CONDITION_WEIGHTS[eraBand(archetype)]).id;
}

export function nextArchetypeId(archetypeId, {
  parcel = null,
  level = 0,
} = {}) {
  if (level === 0 && parcel?.consolidated) return consolidatedSuccessorId(parcel);
  const successor = SUCCESSOR[archetypeId] ?? null;
  // Self-mapped ceiling forms (tower-office) still redevelop as a level-rung rebuild.
  if (successor === archetypeId) return successor;
  return successor;
}

export function zoneCeilingStoreys(zoneId, districtCapStoreys) {
  if (zoneId === 'NRZ' || zoneId === 'GRZ') return 2;
  if (zoneId === 'RGZ') return 4;
  if (zoneId === 'CZ') return Math.min(districtCapStoreys, 12);
  if (zoneId === 'MUZ') return 8;
  throw new Error(`unknown zone ${zoneId}`);
}

export function effectiveCeilingStoreys(parcel, parcelStatus = {}) {
  const districtCap = parcel.districtCapStoreys;
  const ordinaryCeiling = Math.min(
    parcel.zoneCeilingStoreys ?? zoneCeilingStoreys(parcel.zoneId, districtCap),
    districtCap,
  );
  const towerException = parcel.towerOverlay
    && parcel.consolidated
    && parcel.tiles?.length === 2
    && (parcel.zoneId === 'MUZ' || parcel.zoneId === 'CZ');
  const baseEffectiveCeiling = towerException ? districtCap : ordinaryCeiling;
  return Math.min(
    districtCap,
    Math.max(
      baseEffectiveCeiling,
      parcelStatus.heightPermitCeilingStoreys ?? baseEffectiveCeiling,
    ),
  );
}

function liftBand(storeys) {
  if (storeys <= 8) {
    return { liftCores: 1, efficiencyBp: RULES.consolidatedEfficiency8Bp, serviceFloors: 0 };
  }
  if (storeys <= 20) {
    return { liftCores: 2, efficiencyBp: RULES.consolidatedEfficiency20Bp, serviceFloors: 0 };
  }
  if (storeys <= 40) {
    return { liftCores: 3, efficiencyBp: RULES.consolidatedEfficiency40Bp, serviceFloors: 0 };
  }
  return {
    liftCores: 3,
    efficiencyBp: RULES.consolidatedEfficiency41PlusBp,
    serviceFloors: Math.floor((storeys - 1) / 20),
  };
}

function sourceUseFor(parcel) {
  if (parcel.zoneId === 'MUZ' || parcel.zoneId === 'NRZ'
    || parcel.zoneId === 'GRZ' || parcel.zoneId === 'RGZ') return 'apartment';
  if (parcel.sector === 'office') return 'office';
  if (parcel.sector === 'retail') return 'mixed';
  return 'apartment';
}

export function consolidatedSuccessorId(parcel) {
  if (parcel.zoneId === 'NRZ') return 'townhouse-paired-single';
  if (parcel.zoneId === 'GRZ') return 'townhouse-row';
  if (parcel.zoneId === 'RGZ') return 'apartment-low';
  if (parcel.zoneId === 'MUZ') {
    return parcel.towerOverlay && parcel.tiles?.length === 2
      ? 'apartment-tower'
      : 'apartment-mid';
  }
  if (parcel.zoneId === 'CZ') {
    if (parcel.towerOverlay && parcel.tiles?.length === 2) return 'apartment-tower';
    if (parcel.sector === 'office') return 'office-lowrise';
    if (parcel.sector === 'retail') return 'shoptop-mixed';
    return 'apartment-mid';
  }
  throw new Error(`unknown consolidated zone ${parcel.zoneId}`);
}

export function consolidatedYieldBaseFor(parcel, parcelStatus = {}) {
  if (!parcel.consolidated || parcel.tiles?.length !== 2) {
    throw new Error('Consolidated yield requires one legal 1×2 pad.');
  }
  const storeys = effectiveCeilingStoreys(parcel, parcelStatus);
  const band = liftBand(storeys);
  const siteScale = parcel.tiles.length;
  if (parcel.zoneId === 'NRZ') {
    return {
      archetypeId: 'townhouse-paired-single',
      use: 'apartment',
      sector: 'residential',
      storeys: 1,
      siteScale,
      liftCores: 1,
      efficiencyBp: RULES.consolidatedEfficiency8Bp,
      serviceFloors: 0,
      basePrice: applyBp(
        ARCHETYPES['townhouse-row'].basePrice,
        RULES.townhousePairedSingleBp,
      ) * siteScale,
      baseRent: applyBp(
        ARCHETYPES['townhouse-row'].baseRent,
        RULES.townhousePairedSingleBp,
      ) * siteScale,
    };
  }
  if (parcel.zoneId === 'GRZ') {
    return {
      archetypeId: 'townhouse-row',
      use: 'apartment',
      sector: 'residential',
      storeys: 2,
      siteScale,
      liftCores: 1,
      efficiencyBp: RULES.consolidatedEfficiency8Bp,
      serviceFloors: 0,
      basePrice: ARCHETYPES['townhouse-row'].basePrice * siteScale,
      baseRent: ARCHETYPES['townhouse-row'].baseRent * siteScale,
    };
  }
  const use = sourceUseFor(parcel);
  const valueKey = use === 'office'
    ? 'consolidatedOfficePlateValue'
    : use === 'mixed'
      ? 'consolidatedMixedPlateValue'
      : 'consolidatedApartmentPlateValue';
  const rentKey = use === 'office'
    ? 'consolidatedOfficePlateRent'
    : use === 'mixed'
      ? 'consolidatedMixedPlateRent'
      : 'consolidatedApartmentPlateRent';
  const basePrice = applyBp(
    storeys * RULES[valueKey] * siteScale,
    band.efficiencyBp,
  );
  const baseRent = applyBp(
    storeys * RULES[rentKey] * siteScale,
    band.efficiencyBp,
  );
  return {
    archetypeId: consolidatedSuccessorId(parcel),
    use,
    sector: use === 'office' ? 'office' : use === 'mixed' ? 'retail' : 'residential',
    storeys,
    siteScale,
    ...band,
    basePrice,
    baseRent,
  };
}

function roundTo(value, step) {
  return Math.round(value / step) * step;
}

/**
 * Re-band an archetype through the parcel's immutable district/frontage/amenity chain.
 * This is generation's arithmetic and redevelopment's arithmetic from one authority.
 */
export function buildingBaseFor(parcel, archetypeId, condition, {
  parcelStatus = {},
} = {}) {
  const archetype = ARCHETYPES[archetypeId];
  if (!archetype) throw new Error(`unknown succession archetype ${archetypeId}`);
  const consolidated = parcel.consolidated
    ? consolidatedYieldBaseFor(parcel, parcelStatus)
    : null;
  const authoredPrice = consolidated?.basePrice ?? archetype.basePrice;
  const authoredRent = consolidated?.baseRent ?? archetype.baseRent;
  const price = applyBp(
    applyBp(applyBp(authoredPrice, parcel.bandBp), parcel.upliftBp),
    RULES.conditionValueBp[condition],
  );
  const rent = applyBp(
    applyBp(applyBp(authoredRent, parcel.bandBp), parcel.rentUpliftBp),
    RULES.conditionRentBp[condition],
  );
  return {
    archetypeId,
    sector: consolidated?.sector ?? archetype.sector,
    storeys: consolidated?.storeys ?? archetype.storeys,
    basePrice: roundTo(price, 5_000),
    baseRent: roundTo(rent, 100),
  };
}

/** Apply the exact ratio between condition multipliers to already-authored money. */
export function renovateBase(basePrice, baseRent, condition, nextCondition) {
  return {
    basePrice: Math.round(
      basePrice * RULES.conditionValueBp[nextCondition] / RULES.conditionValueBp[condition],
    ),
    baseRent: Math.round(
      baseRent * RULES.conditionRentBp[nextCondition] / RULES.conditionRentBp[condition],
    ),
  };
}

export function renovationRecord(nextCondition, quarter) {
  return Object.freeze({
    nextCondition,
    startedQuarter: quarter,
  });
}

export function constructionRecord(archetypeId, toArchetype, quarter) {
  return Object.freeze({
    fromArchetype: archetypeId,
    toArchetype,
    startedQuarter: quarter,
  });
}
