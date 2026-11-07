// District Deck V3.40 Wave R3 — two-slot 1×2 pads.
// A cleared pad holds two 1×1 forms, slot A = lower parent tile, slot B = higher.
// Right-click rotation is deferred: 1×1 forms do not need a yaw, and no BUILD
// catalog row is 1×2-only.

import { ARCHETYPES } from './content.js';
import { activeParcel } from './city.js';
import { TILE, parseParcelId, tileCentre } from './grid.js';
import { applyBp } from './rng.js';

export const PAD_SLOT_IDS = Object.freeze(['A', 'B']);
/** Second 1×1 on a pad quotes at 90% of ordinary cost (integer bp). */
export const PAD_SECOND_SLOT_COST_BP = 9000;
/** Wave Q group-demo: each extra standing building adds +50% to the strike total. */
export const PAD_GROUP_DEMO_EXTRA_BP = 5000;

function positiveStoreys(value) {
  return Math.max(1, Math.floor(Number(value) || 1));
}

export function isOneByOneFootprint(footprint) {
  return positiveStoreys(footprint?.[0]) === 1 && positiveStoreys(footprint?.[1]) === 1;
}

export function tileCentreFromId(tileId) {
  const tile = parseParcelId(tileId);
  return tileCentre(tile.bx, tile.bz, tile.tx, tile.tz);
}

/** Slot A = lower parent tile, slot B = higher. Null unless the holding is a 1×2 pad. */
export function padSlotTiles(city, state, parcelId) {
  const parcel = activeParcel(city, state, parcelId);
  if (!parcel?.consolidated) return null;
  const tiles = [...new Set(parcel.tiles ?? [])];
  if (tiles.length !== 2) return null;
  const parents = state?.topology?.lineage?.[parcelId]?.parentParcels;
  if (parents?.length === 2) {
    const tileA = parents[0]?.tiles?.[0];
    const tileB = parents[1]?.tiles?.[0];
    if (tileA && tileB && tiles.includes(tileA) && tiles.includes(tileB)) {
      return Object.freeze({ A: tileA, B: tileB });
    }
  }
  const sorted = tiles.slice().sort();
  return Object.freeze({ A: sorted[0], B: sorted[1] });
}

export function padSlotRecord(holding) {
  return {
    A: holding?.padSlots?.A ?? null,
    B: holding?.padSlots?.B ?? null,
  };
}

export function padSlotFilled(slot) {
  return Boolean(slot && (slot.status === 'works' || slot.status === 'standing' || slot.archetypeId));
}

export function standingPadSlotCount(holding) {
  const slots = padSlotRecord(holding);
  return PAD_SLOT_IDS.filter((id) => slots[id]?.status === 'standing').length;
}

export function filledPadSlotCount(holding) {
  const slots = padSlotRecord(holding);
  return PAD_SLOT_IDS.filter((id) => padSlotFilled(slots[id])).length;
}

function vacantPadReady(city, state, parcelId) {
  const parcel = activeParcel(city, state, parcelId);
  const holding = state?.holdings?.[parcelId];
  const status = state?.parcelStatus?.[parcelId];
  if (!parcel?.consolidated || !holding) return false;
  if (holding.construction) return false;
  return Boolean(
    holding.siteCleared
    || (
      (status?.builtLevel ?? holding.level ?? 0) === 0
      && status?.occupancy === 'vacant'
      && !status?.builtArchetypeId
    ),
  );
}

/**
 * First free 1×1 slot on a 1×2 pad, or null when the pad cannot take another 1×1.
 * Empty pads yield A. A whole-pad 1×2 form (or a standing unslotted building)
 * occupies both slots.
 */
export function firstFreePadSlot(city, state, parcelId) {
  const tiles = padSlotTiles(city, state, parcelId);
  if (!tiles) return null;
  const holding = state?.holdings?.[parcelId];
  if (!holding) return null;
  const slots = padSlotRecord(holding);
  if (padSlotFilled(slots.A) && padSlotFilled(slots.B)) return null;
  if (!padSlotFilled(slots.A) && !padSlotFilled(slots.B)) {
    if (holding.construction) return null;
    if (vacantPadReady(city, state, parcelId)) return 'A';
    if (state.parcelStatus?.[parcelId]?.builtArchetypeId) return null;
    if (holding.siteCleared) return 'A';
    return null;
  }
  if (!padSlotFilled(slots.A)) return 'A';
  if (!padSlotFilled(slots.B)) return 'B';
  return null;
}

export function resolvePadSlot(city, state, parcelId, footprint, requested = null) {
  if (!isOneByOneFootprint(footprint)) return null;
  const tiles = padSlotTiles(city, state, parcelId);
  if (!tiles) return null;
  if (requested === 'A' || requested === 'B') {
    const slots = padSlotRecord(state.holdings?.[parcelId]);
    if (padSlotFilled(slots[requested])) return null;
    return requested;
  }
  return firstFreePadSlot(city, state, parcelId);
}

export function padSlotCentre(city, state, parcelId, slot) {
  const tiles = padSlotTiles(city, state, parcelId);
  const tileId = tiles?.[slot];
  return tileId ? tileCentreFromId(tileId) : null;
}

export function scaleWorksQuote(quote, bp) {
  if (!quote || !Number.isInteger(quote.cost)) return quote;
  const cost = applyBp(quote.cost, bp);
  const debtTaken = applyBp(quote.debtTaken ?? 0, bp);
  const royalty = Number.isInteger(quote.hammerbarnRoyalty)
    ? applyBp(quote.hammerbarnRoyalty, bp)
    : quote.hammerbarnRoyalty;
  return {
    ...quote,
    cost,
    debtTaken,
    cashOut: cost - debtTaken + (royalty ?? 0),
    ...(Number.isInteger(royalty) ? { hammerbarnRoyalty: royalty } : {}),
  };
}

export function emptyPadSlots() {
  return { A: null, B: null };
}

export function assignPadSlot(holding, slot, record) {
  const next = { ...padSlotRecord(holding), [slot]: record };
  holding.padSlots = next;
  return next;
}

export function occupyWholePadSlots(holding, record, tiles) {
  holding.padSlots = {
    A: { ...record, tileId: tiles.A, whole: true },
    B: { ...record, tileId: tiles.B, whole: true },
  };
  return holding.padSlots;
}

export function standingSlotRecords(holding) {
  const slots = padSlotRecord(holding);
  return PAD_SLOT_IDS
    .map((id) => ({ slot: id, record: slots[id] }))
    .filter(({ record }) => record?.status === 'standing' && record.archetypeId);
}

export function standingSlotForms(holding) {
  return standingSlotRecords(holding).map(({ record }) => record.archetypeId);
}

/** Dual-aware form list: standing slots if present, else the holding's primary id. */
export function holdingFormIds(holding, status = null) {
  const standing = [...new Set(standingSlotForms(holding))];
  if (standing.length) return standing;
  const primary = status?.builtArchetypeId ?? holding?.archetypeId ?? null;
  return primary ? [primary] : [];
}

export function holdingHasForm(holding, status, formId) {
  return holdingFormIds(holding, status).includes(formId);
}

export function maxStandingSlotStoreys(holding) {
  const forms = standingSlotForms(holding);
  if (!forms.length) return null;
  return Math.max(...forms.map((id) => positiveStoreys(ARCHETYPES[id]?.storeys)));
}

export function dualPadDisplayName(holding) {
  const labels = standingSlotRecords(holding)
    .filter(({ record }) => !record.whole)
    .map(({ record }) => ARCHETYPES[record.archetypeId]?.label ?? record.archetypeId);
  if (labels.length >= 2) return labels.join(' · ');
  return null;
}

/**
 * Live works jobs on a pad. Slot A is primary when both run.
 * `holding.construction` is still the headline pointer for unslotted jobs
 * and for consumers that only look at one works record.
 */
export function livePadWorksJobs(holding) {
  const slots = padSlotRecord(holding);
  const jobs = [];
  const seen = new Set();
  const push = (slot, job) => {
    if (!job) return;
    const key = slot ?? 'pad';
    if (seen.has(key)) return;
    seen.add(key);
    jobs.push({ slot: slot ?? job.slot ?? null, construction: job });
  };
  for (const id of PAD_SLOT_IDS) {
    if (slots[id]?.status === 'works') push(id, slots[id].works);
  }
  if (holding?.construction) push(holding.construction.slot ?? null, holding.construction);
  return jobs;
}

export function primaryLiveWorksJob(holding) {
  return livePadWorksJobs(holding)[0]?.construction ?? holding?.construction ?? null;
}

/** Jobs due this quarter, preferring a headline `holding.construction` copy when it is newer. */
export function duePadWorksJobs(holding, quarter) {
  const slots = padSlotRecord(holding);
  const due = [];
  const seen = new Set();
  for (const id of PAD_SLOT_IDS) {
    const rec = slots[id];
    const fromSlot = rec?.status === 'works' ? rec.works : null;
    const fromHolding = holding?.construction?.slot === id ? holding.construction : null;
    const job = (fromHolding && fromHolding.completionQuarter <= quarter)
      ? fromHolding
      : (fromSlot && fromSlot.completionQuarter <= quarter ? fromSlot : null);
    if (!job) continue;
    seen.add(id);
    due.push({ slot: id, construction: job });
  }
  const headline = holding?.construction;
  if (
    headline
    && headline.completionQuarter <= quarter
    && !seen.has(headline.slot)
    && !headline.slot
  ) {
    due.push({ slot: null, construction: headline });
  }
  return due;
}

export function oneTileLot() {
  return Object.freeze({ w: 1, d: 1, tiles: 1, areaM2: TILE * TILE });
}

export function standingPadSlotPlacements(city, state, parcelId) {
  const tiles = padSlotTiles(city, state, parcelId);
  if (!tiles) return [];
  return standingSlotRecords(state?.holdings?.[parcelId])
    .filter(({ record }) => !record.whole)
    .map(({ slot, record }) => {
      const centre = padSlotCentre(city, state, parcelId, slot);
      return Object.freeze({
        slot,
        archetypeId: record.archetypeId,
        tileId: record.tileId ?? tiles[slot],
        centre,
        footprint: Object.freeze([1, 1]),
      });
    })
    .filter((row) => row.centre);
}

/** Primary = slot A when it is standing; books still sum every standing slot. */
export function syncDualPadIdentity(holding, status = null) {
  const standing = standingSlotRecords(holding);
  if (!standing.length) return holding;
  const primary = standing.find(({ slot }) => slot === 'A') ?? standing[0];
  const target = primary.record.archetypeId;
  holding.archetypeId = target;
  holding.landUseId = primary.record.catalogId ?? target;
  holding.sector = ARCHETYPES[target]?.sector ?? holding.sector;
  holding.basePrice = standing.reduce((sum, { record }) => sum + (record.basePrice ?? 0), 0);
  holding.baseRent = standing.reduce((sum, { record }) => sum + (record.baseRent ?? 0), 0);
  const levels = standing
    .map(({ record }) => record.level)
    .filter((level) => Number.isInteger(level));
  if (levels.length) holding.level = Math.max(holding.level ?? 0, ...levels);
  if (status) {
    status.builtArchetypeId = target;
    status.builtLandUseId = primary.record.catalogId ?? target;
    if (Number.isInteger(holding.level)) status.builtLevel = holding.level;
  }
  return holding;
}

export function slotParcelView(city, state, parcelId, slot) {
  const economics = slotEconomicsParcel(city, state, parcelId, slot);
  const centre = padSlotCentre(city, state, parcelId, slot);
  if (!economics || !centre) return null;
  return {
    ...economics,
    id: parcelId,
    centre,
    groundFootprint: [1, 1],
    placement: {
      ...(economics.placement ?? {}),
      envelopeMetres: { x: TILE - 1, z: TILE - 1 },
      modelOffset: { x: 0, z: 0 },
    },
  };
}

export function slotEconomicsParcel(city, state, parcelId, slot) {
  const parcel = activeParcel(city, state, parcelId);
  const tiles = padSlotTiles(city, state, parcelId);
  const tileId = tiles?.[slot];
  const parentIndex = slot === 'A' ? 0 : 1;
  const parent = state?.topology?.lineage?.[parcelId]?.parentParcels?.[parentIndex];
  if (parent) {
    return {
      ...parent,
      consolidated: false,
      groundFootprint: [1, 1],
    };
  }
  if (!parcel) return null;
  return {
    ...parcel,
    consolidated: false,
    groundFootprint: [1, 1],
    tiles: tileId ? [tileId] : parcel.tiles?.slice(0, 1),
    centre: tileId ? tileCentreFromId(tileId) : parcel.centre,
  };
}
