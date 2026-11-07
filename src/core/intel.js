// District Deck V3.03 — parcel status and intel schemas/defaults.
// These records are inert in Batch 2: economy continues to read the existing holdings
// and immutable city content until the later effect batches explicitly switch authority.

import { eraBand } from './succession.js';

export const STANDARD_TENANT = Object.freeze({
  quality: 'standard',
  rentBp: 10000,
  arrearsChanceBp: 600,
  expiresAfterQuarter: 4,
  paymentAtRisk: false,
});

export function createParcelStatus(city) {
  return Object.fromEntries([...city.order].sort().map((id) => {
    const parcel = city.parcels[id];
    const occupied = parcel.sector === 'residential' && parcel.condition >= 1;
    return [id, {
      condition: parcel.condition,
      builtArchetypeId: null,
      builtLandUseId: null,
      builtLevel: 0,
      damage: null,
      occupancy: occupied ? 'tenant' : 'vacant',
      tenant: occupied ? { ...STANDARD_TENANT } : null,
      squatterSinceQuarter: null,
      askingOverride: null,
      askingOverrideUntil: 0,
    }];
  }));
}

export function createIntel() {
  return { parcels: {}, finds: [] };
}

export function createBlockDemand(city) {
  const entries = [];
  for (let bz = 0; bz < city.blocksZ; bz += 1) {
    for (let bx = 0; bx < city.blocksX; bx += 1) entries.push([`${bx},${bz}`, 0]);
  }
  return Object.fromEntries(entries);
}

/** Cumulative parcel-value index by city block; 10000 is the neutral opening mark. */
export function createBlockValueIndex(city) {
  return Object.fromEntries(Object.keys(createBlockDemand(city)).sort()
    .map((blockId) => [blockId, 10000]));
}

export function holdingFrameworkDefaults(archetype) {
  return {
    insurance: null,
    // New holdings have no planning uplift until a listed rung passes Lobby.
    planningCeiling: 0,
    hire: null,
    heritageQualityBp: 0,
    redevelopmentNotice: null,
  };
}
