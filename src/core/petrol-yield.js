// District Deck V3.40 Wave R3 — petrol passing-car yield.
// Traffic.js is presentation-only (per-frame poses, no quarter clock). Settle therefore
// derives a deterministic per-quarter count from each fronted corridor's authored flow.
// No named stream: the count is a pure function of city corridors + parcel tiles.

import { activeParcel } from './city.js';
import { TILES_PER_BLOCK, parseParcelId } from './grid.js';
import { holdingHasForm, standingSlotRecords } from './pad-slots.js';

function heldIds(state, owner) {
  return Object.keys(state?.holdings ?? {}).sort().filter((id) => {
    const holding = state.holdings[id];
    if (owner === 'player' || owner === 'rival') return holding.owner === owner;
    return holding.ownerSeatId === owner;
  });
}

export const PETROL_CAR_YIELD = 100;
export const PETROL_FORECOURT_CAP = 25_000;

/**
 * Authored cars per quarter on one kerb. Interior belts carry the visual fleet;
 * perimeter roads exist but spawn no cars in traffic.js, so they stay sparse here.
 * A tram reservation lifts the count. Corner parcels sum both frontages, then cap.
 */
export const CORRIDOR_CARS_PER_QUARTER = Object.freeze({
  interior: 140,
  interiorTram: 220,
  perimeter: 40,
  perimeterTram: 70,
});

function corridorCars(city, corridor) {
  if (!corridor) return 0;
  const interior = corridor.axis === 'v'
    ? corridor.index > 0 && corridor.index < city.blocksX
    : corridor.index > 0 && corridor.index < city.blocksZ;
  if (interior) {
    return corridor.tram
      ? CORRIDOR_CARS_PER_QUARTER.interiorTram
      : CORRIDOR_CARS_PER_QUARTER.interior;
  }
  return corridor.tram
    ? CORRIDOR_CARS_PER_QUARTER.perimeterTram
    : CORRIDOR_CARS_PER_QUARTER.perimeter;
}

function tileFrontageCorridors(city, bx, bz, tx, tz) {
  const last = TILES_PER_BLOCK - 1;
  const out = [];
  if (tx === 0) out.push(city.corridors?.vertical?.[bx]);
  if (tx === last) out.push(city.corridors?.vertical?.[bx + 1]);
  if (tz === 0) out.push(city.corridors?.horizontal?.[bz]);
  if (tz === last) out.push(city.corridors?.horizontal?.[bz + 1]);
  return out.filter(Boolean);
}

export function parcelFrontageCorridors(city, parcel) {
  if (!parcel || !city?.corridors) return [];
  const seen = new Set();
  const out = [];
  const tiles = parcel.tiles?.length ? parcel.tiles : (
    parcel.id && /^p\d{4}$/.test(parcel.id) ? [parcel.id] : []
  );
  const pushFrom = (bx, bz, tx, tz) => {
    for (const corridor of tileFrontageCorridors(city, bx, bz, tx, tz)) {
      if (seen.has(corridor.id)) continue;
      seen.add(corridor.id);
      out.push(corridor);
    }
  };
  if (tiles.length) {
    for (const tileId of tiles) {
      try {
        const tile = parseParcelId(tileId);
        pushFrom(tile.bx, tile.bz, tile.tx, tile.tz);
      } catch {
        /* topology ids such as A#### are not lattice keys; fall through */
      }
    }
  }
  if (!out.length && Number.isInteger(parcel.bx)) {
    pushFrom(parcel.bx, parcel.bz, parcel.tx, parcel.tz);
  }
  return out;
}

export function petrolPassingCars(city, parcel) {
  const corridors = parcelFrontageCorridors(city, parcel);
  return corridors.reduce((sum, corridor) => sum + corridorCars(city, corridor), 0);
}

export function petrolForecourtBonus(cars) {
  const n = Math.max(0, Math.floor(Number(cars) || 0));
  return Math.min(PETROL_FORECOURT_CAP, n * PETROL_CAR_YIELD);
}

export function isPetrolHolding(holding, status) {
  return holdingHasForm(holding, status, 'petrol-station');
}

export function petrolForecourtForParcel(city, state, parcelId) {
  const holding = state?.holdings?.[parcelId];
  const status = state?.parcelStatus?.[parcelId];
  if (!holding?.owner || !isPetrolHolding(holding, status)) return null;
  if (holding.siteCleared) return null;
  const petrolStanding = standingSlotRecords(holding)
    .some(({ record }) => record.archetypeId === 'petrol-station');
  if (holding.construction && !petrolStanding) return null;
  const parcel = activeParcel(city, state, parcelId);
  if (!parcel) return null;
  const cars = petrolPassingCars(city, parcel);
  const amount = petrolForecourtBonus(cars);
  return Object.freeze({
    parcelId,
    cars,
    amount,
    capped: amount === PETROL_FORECOURT_CAP && cars * PETROL_CAR_YIELD > PETROL_FORECOURT_CAP,
    line: `Forecourt trade · ${cars} cars · $${amount.toLocaleString('en-AU')}`,
  });
}

export function petrolForecourtForOwner(city, state, owner) {
  const rows = [];
  let amount = 0;
  let cars = 0;
  for (const id of heldIds(state, owner)) {
    const row = petrolForecourtForParcel(city, state, id);
    if (!row || !row.amount) continue;
    rows.push(row);
    amount += row.amount;
    cars += row.cars;
  }
  return Object.freeze({ amount, cars, rows });
}
