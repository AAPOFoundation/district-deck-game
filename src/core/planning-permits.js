// District Deck — planning permits.
//
// TWO LADDERS LIVE HERE AND THEY ARE DIFFERENT KINDS OF PERMISSION.
//
// 1. THE HEIGHT LADDER (L1 townhouse · L2 low-rise · L3 high-rise). Grounded in Victorian
//    residential zones (NRZ 2-storey, GRZ 3-storey, RGZ ~4-storey, MUZ/CZ activity-centre /
//    docklands towers). District caps still apply. A height permit raises `planningCeiling`
//    and the redevelop job then finishes at the form that ceiling allows.
//
// 2. THE USE LADDER (V3.70 L6). A change-of-use permit on a shell that is STAYING. It adds no
//    floor area, it never touches `planningCeiling`, and the thing it changes is what the
//    building is FOR. Warehouse and corner-shop shells each carry their own authored set:
//    the bond store → data centre permit is the second future for a warehouse, while
//    medical consulting rooms share the shop-corner shell with AI startup. Childcare keeps that
//    shop conversion and also uses the same licensed-use application on a cleared BUILD pad;
//    petrol remains available through its existing shop change-of-use path and ground-up BUILD.
//    chain already turns a bond store into apartments (`succession.js`
//    `warehouse-brick → warehouse-converted`), and this is the other door out of the same room.
//
// Why the two are separate functions rather than one list. `state.js: doLobby` reads a height
// option BY ITS LEVEL and writes `planningCeiling = seekLevel`; a use permit routed through
// that would raise a ceiling nobody asked to raise. `permitOptionsFor` therefore remains the
// height-only list (now containing every higher legal target), while callers that know about
// use permits ask for the parallel list by name.

import { ARCHETYPES, RULES } from './content.js';

/**
 * Suburb + zone → max planning level the player may lobby for.
 * L1 = townhouses · L2 = low-rise apartments · L3 = high-rise apartments.
 */
export const DISTRICT_PERMIT_MAX = Object.freeze({
  // Prestige NRZ bayside — character protection; townhouses only.
  'brighton-reach': 1,
  // Heritage inner: townhouse + low-rise near RGZ/MUZ; no high-rise.
  'fitzroy-north': 2,
  'carlton-east': 2,
  // Industrial bones / mixed: L2 default; L3 only on MUZ/CZ.
  'richmond-flat': 2,
  // Rising mixed: L2, L3 on growth zones.
  'brunswick-rise': 2,
  // Docklands unit / tower overlay: high-rise OK.
  'docklands-quay': 3,
});

/** Zone floor on what can be sought (Vic zone height language, game-simplified). */
export const ZONE_PERMIT_MAX = Object.freeze({
  NRZ: 1, // ~2 storeys / neighbourhood character
  GRZ: 2, // ~3 storeys
  RGZ: 2, // ~4 storeys growth — still low-rise apartments in game terms
  MUZ: 3, // activity-centre intensity
  CZ: 3, // commercial / tower-capable
});

export const PERMIT_LABELS = Object.freeze({
  1: 'L1 Residential/Commercial',
  2: 'L2 Low-rise Residential/Civic/Industrial',
  3: 'L3 High-rise apartments',
});

/** The surveyed agricultural covenant conveys L1 farm use, never urban height. */
export const FARM_PERMIT = Object.freeze({ id: 'agriculture', level: 1, label: 'L1 Agriculture' });

export const PERMIT_FINISH_ARCHETYPE = Object.freeze({
  1: 'townhouse-row',
  2: 'apartment-permit',
  3: 'apartment-tower',
});

/** The user-facing and reducer-facing lobby price for each planning rung. */
export const PERMIT_FEE_BY_RUNG = Object.freeze({
  1: 25_000,
  2: 50_000,
  3: 90_000,
});

export function permitFeeForRung(rung) {
  return PERMIT_FEE_BY_RUNG[Number(rung)] ?? 0;
}

/** New holdings begin at L0. Hammerbarn keeps its authored as-of-right extra storey. */
export function defaultPlanningCeilingFor(archetypeId) {
  return String(archetypeId ?? '') === 'hammerbarn' ? 1 : 0;
}

/** Storey-derived height rung, before any authored minimum classification. */
export function derivedPlanningLevelFor(archetypeOrId) {
  const archetype = typeof archetypeOrId === 'string'
    ? ARCHETYPES[archetypeOrId]
    : archetypeOrId;
  const storeys = Math.max(1, Math.floor(Number(archetype?.storeys) || 1));
  for (let level = 1; level <= RULES.maxLevel; level += 1) {
    const finish = ARCHETYPES[PERMIT_FINISH_ARCHETYPE[level]];
    if (finish && storeys <= finish.storeys) return level;
  }
  return RULES.maxLevel + 1;
}

/** Smallest legal rung, respecting a form's authored minimum classification. */
export function minimumPlanningLevelFor(archetypeOrId) {
  const archetype = typeof archetypeOrId === 'string'
    ? ARCHETYPES[archetypeOrId]
    : archetypeOrId;
  const authoredMinimum = Math.max(0, Math.floor(Number(archetype?.minPermitLevel) || 0));
  return Math.max(derivedPlanningLevelFor(archetype), authoredMinimum);
}

export function planningCeilingAllows(holding, archetypeOrId) {
  const ceiling = Math.max(0, Math.floor(Number(holding?.planningCeiling) || 0));
  return minimumPlanningLevelFor(archetypeOrId) <= ceiling;
}

/* ────────────────────────── use-class permits (V3.70 L6) ────────────────────────── */

/** Every shell that participates in the corner-shop change-of-use ribbon. */
export const SHOP_CORNER_USE_ARCHETYPES = Object.freeze([
  'shop-corner',
  'shop-corner-victorian',
  'shop-corner-deco',
  'shop-corner-modern',
  'medical-centre',
]);

/** User-facing order is authored once and shared by the card and tests. */
export const SHOP_CHANGE_USE_IDS = Object.freeze([
  'ai-startup',
  'childcare',
  'medical-centre',
  'petrol-station',
]);

/**
 * Change-of-use permits: the shell stays, the use changes.
 *
 * `archetypeId` is what a redevelop job finishes as once the permit is approved, and it is the
 * only thing this record does to the world. Everything else here is the application: who may
 * apply, where, what it costs, and how hard it is to win.
 *
 * THE DATA CENTRE, AND WHY IT IS A PERMIT RATHER THAN A SUCCESSION RUNG. A bond store already
 * has a successor — `warehouse-converted`, the apartments conversion — and succession is
 * automatic: redevelop a warehouse and you get flats whether you wanted them or not. The whole
 * point of this one is that the player looks at a warehouse and picks between two futures for
 * it, so it has to be a thing that is applied for and can be refused. It is priced at the third
 * rung of the same fee ladder the height permits use — one step above the L2 rung the
 * apartments conversion sits behind — because a change of use that lands 4 MVA and a generator
 * yard in a mixed-use street is a harder application than another set of flats.
 *
 * ZONING IS NOT DECORATION HERE. `zones` is the industrial/commercial intensity a data centre's
 * plant needs; `excludeDistricts` carries the same character-protection logic that caps
 * `brighton-reach` at L1 — a prestige bayside NRZ plate does not get a generator yard, and a
 * player who wants one buys in Richmond.
 */
export const USE_PERMITS = Object.freeze({
  'data-centre': Object.freeze({
    id: 'data-centre',
    kind: 'use',
    label: 'Data centre fit-out',
    short: 'Data centre',
    description: 'Shell retained · generator yard · no new floor area',
    /** What a redevelop job finishes as once this is approved. */
    archetypeId: 'warehouse-datacentre',
    /** Shells this permit may be sought on. The shell is the point — it is not demolished. */
    fromArchetypes: Object.freeze([
      'warehouse-brick',
      'warehouse-richmond-loft',
      'warehouse-converted',
      'factory-light',
    ]),
    /** Zones with the intensity the plant needs. */
    zones: Object.freeze(['RGZ', 'MUZ', 'CZ']),
    /** Character-protected plates that will not entertain the application at all. */
    excludeDistricts: Object.freeze(['brighton-reach']),
    /** Fee rung on the shared ladder. 3 = the L3 rung's number. */
    feeRung: 3,
    /**
     * How much harder than a height application of the same rung. Basis points off the roll
     * chance, applied by whichever action runs the lobby; stated here so the difficulty is
     * authored content rather than a number invented at the call site.
     */
    chanceAdjustBp: -600,
  }),
  // Corner shop's other future: the shell stays a shop, the use becomes an AI startup.
  // No new floor area, no demolition. Granting the permit starts the venture immediately.
  'ai-startup': Object.freeze({
    id: 'ai-startup',
    kind: 'use',
    label: 'AI startup',
    short: 'AI startup',
    description: 'The shop hosts a speculative venture. Rent stops while it operates.',
    archetypeId: null,
    startsOnGrant: true,
    fromArchetypes: SHOP_CORNER_USE_ARCHETYPES,
    zones: Object.freeze(['NRZ', 'GRZ', 'RGZ', 'MUZ', 'CZ']),
    excludeDistricts: Object.freeze([]),
    feeRung: 1,
    chanceAdjustBp: 2000,
  }),
  childcare: Object.freeze({
    id: 'childcare',
    kind: 'use',
    label: 'Childcare centre',
    short: 'Childcare',
    description: 'Licensed childcare use for a shop conversion or a cleared civic BUILD pad.',
    archetypeId: 'childcare-centre',
    startsOnGrant: false,
    allowsClearedPad: true,
    fromArchetypes: SHOP_CORNER_USE_ARCHETYPES,
    zones: Object.freeze(['NRZ', 'GRZ', 'RGZ', 'MUZ', 'CZ']),
    excludeDistricts: Object.freeze([]),
    feeRung: 1,
    chanceAdjustBp: 1200,
  }),
  'petrol-station': Object.freeze({
    id: 'petrol-station',
    kind: 'use',
    label: 'Petrol station',
    short: 'Petrol station',
    description: 'Forecourt and bowsers on the corner. Higher rent, fuel-fire exposure.',
    archetypeId: 'petrol-station',
    startsOnGrant: false,
    fromArchetypes: SHOP_CORNER_USE_ARCHETYPES,
    zones: Object.freeze(['GRZ', 'RGZ', 'MUZ', 'CZ']),
    excludeDistricts: Object.freeze(['brighton-reach']),
    feeRung: 3,
    chanceAdjustBp: -900,
  }),
  'medical-centre': Object.freeze({
    id: 'medical-centre',
    kind: 'use',
    label: 'Medical centre',
    short: 'Medical centre',
    description: 'The shop becomes local consulting rooms. Civic demand supports steady rent.',
    archetypeId: 'medical-centre',
    startsOnGrant: false,
    fromArchetypes: SHOP_CORNER_USE_ARCHETYPES,
    zones: Object.freeze(['NRZ', 'GRZ', 'RGZ', 'MUZ', 'CZ']),
    excludeDistricts: Object.freeze([]),
    feeRung: 2,
    chanceAdjustBp: 600,
  }),
  'walkup-hotel': Object.freeze({
    id: 'walkup-hotel',
    kind: 'use',
    label: 'Hotel conversion',
    short: 'Hotel',
    description: 'Same walk-up shell · bronze signage · nearby cluster lifts hotels',
    archetypeId: null,
    startsOnGrant: true,
    fromArchetypes: Object.freeze([
      'walkup-beaux-arts',
      'walkup-moderne',
      'walkup-flats',
      'art-deco-flats',
    ]),
    zones: Object.freeze(['NRZ', 'GRZ', 'RGZ', 'MUZ', 'CZ']),
    excludeDistricts: Object.freeze([]),
    feeRung: 2,
    chanceAdjustBp: 2800,
  }),
  'walkup-luxe': Object.freeze({
    id: 'walkup-luxe',
    kind: 'use',
    label: 'Luxury apartments',
    short: 'Luxe flats',
    description: 'Same walk-up shell · gold dressings · nearby cluster lifts luxury',
    archetypeId: null,
    startsOnGrant: true,
    fromArchetypes: Object.freeze([
      'walkup-beaux-arts',
      'walkup-moderne',
      'walkup-flats',
      'art-deco-flats',
    ]),
    zones: Object.freeze(['NRZ', 'GRZ', 'RGZ', 'MUZ', 'CZ']),
    excludeDistricts: Object.freeze([]),
    feeRung: 2,
    chanceAdjustBp: 2800,
  }),
});

export const USE_PERMIT_IDS = Object.freeze(Object.keys(USE_PERMITS));

/** Whether one use permit is legal on this parcel and this shell/pad, ignoring money. */
export function usePermitAllowed(permit, parcel, fromArchetype, holding = null) {
  if (!permit || !parcel) return false;
  if (permit.excludeDistricts.includes(parcel.districtId)) return false;
  if (!permit.zones.includes(parcel.zoneId)) return false;
  return permit.fromArchetypes.includes(String(fromArchetype))
    || Boolean(permit.allowsClearedPad && holding?.siteCleared);
}

/**
 * Use-class permits the player may lobby for on this parcel right now.
 *
 * Shape deliberately mirrors `permitOptionsFor`'s entries — `{ label, archetypeId, cost }` —
 * so the permit UI can render the two lists through one row component. `kind: 'use'` and the
 * absence of `level` are what tell a caller not to touch the planning ceiling with it.
 *
 * @param {object} parcel
 * @param {object|null} holding
 * @param {string|null} fromArchetype the shell standing on the parcel today
 * @returns {Array<{id:string, kind:'use', label:string, short:string, description:string,
 *                  archetypeId:string, cost:number, chanceAdjustBp:number}>}
 */
export function usePermitOptionsFor(parcel, holding = null, fromArchetype = null) {
  const from = fromArchetype ?? holding?.archetypeId ?? parcel?.archetypeId ?? null;
  const already = approvedUsePermitId(holding);
  const hospitalityLive = Boolean(holding?.hospitality?.kind);
  const options = [];
  for (const id of USE_PERMIT_IDS) {
    const permit = USE_PERMITS[id];
    if (already === id) continue;
    if (hospitalityLive && (id === 'walkup-hotel' || id === 'walkup-luxe')) continue;
    if (!usePermitAllowed(permit, parcel, from, holding)) continue;
    options.push({
      id: permit.id,
      kind: 'use',
      label: permit.label,
      short: permit.short,
      description: permit.description,
      archetypeId: permit.archetypeId,
      cost: permitFeeForRung(permit.feeRung),
      chanceAdjustBp: permit.chanceAdjustBp,
    });
  }
  return options;
}

/** The use permit a holding has been granted, or null. Pure read; never mutates. */
export function approvedUsePermitId(holding) {
  const id = holding?.approvedUsePermit?.id ?? null;
  return id && USE_PERMITS[id] ? id : null;
}

/** Current corner-shop ribbon use, including a completed physical conversion. */
export function shopUsePermitIdForHolding(holding) {
  const approved = approvedUsePermitId(holding);
  if (approved && USE_PERMITS[approved]?.startsOnGrant) return approved;
  const archetypeId = holding?.archetypeId ?? null;
  return SHOP_CHANGE_USE_IDS.find((id) => USE_PERMITS[id]?.archetypeId === archetypeId) ?? null;
}

/**
 * The record a granting action writes onto the holding.
 *
 * Returned rather than assigned, so the state layer stays the only thing that mutates state
 * (framework §2.1: authored content is separate from runtime state). A caller does
 * `next.holdings[id].approvedUsePermit = grantUsePermit('data-centre')`.
 */
export function grantUsePermit(usePermitId) {
  const permit = USE_PERMITS[usePermitId];
  if (!permit) return null;
  return Object.freeze({
    id: permit.id,
    kind: 'use',
    label: permit.label,
    archetypeId: permit.archetypeId,
  });
}

function isHammerbarnSite(parcel, holding = null) {
  return (holding?.archetypeId ?? parcel?.archetypeId) === 'hammerbarn';
}

export function maxPermitLevelFor(parcel, holding = null) {
  // Hardware warehouse: one as-of-right extra storey. Townhouses and apartments stay refused.
  if (isHammerbarnSite(parcel, holding)) return 1;
  const districtMax = DISTRICT_PERMIT_MAX[parcel.districtId] ?? 2;
  let zoneMax = ZONE_PERMIT_MAX[parcel.zoneId] ?? 1;
  // Tower overlay / docklands activity plates: allow high-rise where zone supports intensity.
  if (
    (parcel.towerOverlay || parcel.districtId === 'docklands-quay')
    && (parcel.zoneId === 'MUZ' || parcel.zoneId === 'CZ' || parcel.zoneId === 'RGZ')
  ) {
    zoneMax = Math.max(zoneMax, 3);
  }
  // Lot consolidation (1×2 pad) can unlock +1 rung up to district max (amalgamation
  // uplift) — but character protection outranks amalgamation: NRZ parcels and
  // brighton-reach keep their table caps (V3.39 critic F3).
  const characterProtected = parcel.zoneId === 'NRZ' || parcel.districtId === 'brighton-reach';
  let districtCap = districtMax;
  if (parcel.consolidated && districtMax < 3 && !characterProtected) {
    districtCap = Math.min(3, districtMax + 1);
  }
  // The uplift must lift the ZONE dimension too, or the final clamp hands the pad its
  // pre-merge ceiling and an approved L3 tower can never list (V3.39 P8).
  if (parcel.consolidated && !characterProtected) {
    zoneMax = Math.min(3, zoneMax + 1);
  }
  // Richmond industrial MUZ/CZ can reach L3 for mid-rise even if district default is L2.
  if (
    parcel.districtId === 'richmond-flat'
    && (parcel.zoneId === 'MUZ' || parcel.zoneId === 'CZ')
  ) {
    districtCap = Math.max(districtCap, 3);
  }
  if (
    parcel.districtId === 'brunswick-rise'
    && (parcel.zoneId === 'MUZ' || parcel.zoneId === 'RGZ')
  ) {
    districtCap = Math.max(districtCap, 3);
  }
  return Math.min(RULES.maxLevel, districtCap, zoneMax);
}

/**
 * Legal permit applications the player can lobby for on this parcel right now.
 * Returns list of { level, label, archetypeId, cost }.
 */
export function permitOptionsFor(parcel, holding) {
  // Hammerbarn's authored extra storey remains as-of-right; it is not a housing application.
  if (isHammerbarnSite(parcel, holding)) return [];
  const current = holding?.planningCeiling ?? defaultPlanningCeilingFor(holding?.archetypeId);
  const max = maxPermitLevelFor(parcel, holding);
  const options = [];
  // Every defined rung above the current ceiling is an independent application. An L0
  // holding may therefore pursue L1, L2 or L3 directly when the site cap permits it.
  for (let level = current + 1; level <= max; level += 1) {
    options.push({
      level,
      label: PERMIT_LABELS[level],
      archetypeId: PERMIT_FINISH_ARCHETYPE[level],
      cost: permitFeeForRung(level),
    });
  }
  return options;
}

/**
 * Finish form when redeveloping to a given planning ceiling.
 *
 * `holding` is OPTIONAL AND FOURTH, and both of those matter. It is optional because every
 * existing call site passes three arguments and must keep behaving exactly as it did; it is
 * fourth because the approved use permit lives on the holding and nowhere else — `activeParcel`
 * returns city topology with no holding overlay, so the parcel cannot answer this question.
 * A caller that passes the holding gets the use ladder; a caller that does not gets the height
 * ladder alone, which is what the whole game did before V3.70.
 *
 * ORDER OF PRECEDENCE, and it is deliberate: a granted use permit wins over succession and over
 * the height finish. A player who paid for a data-centre permit and then pressed redevelop gets
 * a data centre, not the apartments the succession chain would otherwise have handed them.
 */
export function redevelopFinishArchetype(fromArchetype, nextLevel, parcel, holding = null) {
  const usePermitId = approvedUsePermitId(holding);
  if (usePermitId) {
    const permit = USE_PERMITS[usePermitId];
    // Still checked against the site and the shell: a permit granted on a warehouse does not
    // survive the warehouse being replaced by something else in the meantime.
    // A grant with no finish form (AI startup) does not steal the height ladder.
    if (permit?.archetypeId && usePermitAllowed(permit, parcel, fromArchetype, holding)) {
      return permit.archetypeId;
    }
  }
  if (String(fromArchetype) === 'hammerbarn') {
    return nextLevel >= 1 ? 'hammerbarn' : null;
  }
  if (parcel?.consolidated) {
    // Consolidated pads keep zone-driven successors from succession.js helpers.
    return null;
  }
  if (nextLevel >= 3) return PERMIT_FINISH_ARCHETYPE[3];
  if (nextLevel >= 2) return PERMIT_FINISH_ARCHETYPE[2];
  if (nextLevel >= 1) {
    // L1: townhouses for residential and shop-corner stock; industrial stays on its
    // warehouse ladder and office stock remains office-authored.
    const from = String(fromArchetype);
    if (from.startsWith('warehouse') || from === 'factory-light' || from === 'hammerbarn') {
      return null;
    }
    if (from.startsWith('office') || from === 'tower-office') return null;
    return PERMIT_FINISH_ARCHETYPE[1];
  }
  return null;
}
