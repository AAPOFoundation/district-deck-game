// Civic desks: school/transport upgrades, university donation and funded ideas,
// walk-up hotel / luxury-apartment conversion premiums.

import { applyBp, stream } from './rng.js';
import { RULES } from './content.js';
import { nearestTileDistance } from './landuse.js';
import { activeParcel } from './city.js';
import { globalTile, parseParcelId } from './grid.js';
import { airportLinkValueBp, fringeEventsValueBp } from './fringe-venues.js';
import { dualPadDisplayName } from './pad-slots.js';

function asLattice(tiles) {
  return (tiles ?? []).map((tile) => {
    if (tile && Number.isInteger(tile.gx) && Number.isInteger(tile.gz)) return tile;
    const id = typeof tile === 'string' ? tile : tile?.id;
    const parsed = parseParcelId(id);
    return { id, ...globalTile(parsed.bx, parsed.bz, parsed.tx, parsed.tz) };
  });
}

export const CIVIC_UPGRADE_USE_IDS = Object.freeze([
  'school-primary',
  'transport-interchange',
]);

export const CIVIC_UPGRADE_SPEC = Object.freeze({
  'school-primary': Object.freeze({
    maxLevel: 2,
    costs: Object.freeze([0, 85_000, 220_000]),
    labels: Object.freeze(['Primary school', 'Extended school', 'Academy']),
    liftBp: Object.freeze([0, 500, 1100]),
  }),
  'transport-interchange': Object.freeze({
    maxLevel: 2,
    costs: Object.freeze([0, 120_000, 280_000]),
    labels: Object.freeze(['Transport interchange', 'Upgraded interchange', 'City hub']),
    liftBp: Object.freeze([0, 600, 1300]),
  }),
});

export const UNIVERSITY_DONATE_COST = 40_000;
export const UNIVERSITY_DONATE_STARTUP_BP = 400;
export const UNIVERSITY_IDEA_STARTUP_BP = 800;
export const UNIVERSITY_IDEA_CAP = 3;

export const UNIVERSITY_CATALOG = Object.freeze([
  Object.freeze({
    id: 'prism-lab',
    label: 'Prism Lab',
    blurb: 'Students build their first ventures in your shopfronts. Some stay.',
    cost: 140_000,
  }),
  Object.freeze({
    id: 'helix-studio',
    label: 'Helix Studio',
    blurb: 'Cheap burn, expensive thoughts. The graduates go straight to your ventures.',
    cost: 90_000,
  }),
  Object.freeze({
    id: 'nimbus-foundry',
    label: 'Nimbus Foundry',
    blurb: 'The cluster never sleeps. Neither does the dean, if you call.',
    cost: 180_000,
  }),
  Object.freeze({
    id: 'kite-fellows',
    label: 'Kite Fellows',
    blurb: 'Three founders on stipends. One of them is already eyeing your shop.',
    cost: 110_000,
  }),
]);

export const HOSPITALITY_CLUSTER_BP = 800;
export const HOSPITALITY_CLUSTER_CAP_BP = 3200;
export const HOTEL_BRAND_CHANCE_BP = 1800;
export const HOTEL_BRAND_NAMES = Object.freeze([
  'The Majorca', 'Lygon Grand', 'Palais House', 'The Esplanade', 'Crown Court',
]);

export function emptyCivicWorks() {
  return Object.fromEntries(CIVIC_UPGRADE_USE_IDS.map((id) => [id, 0]));
}

export function emptyUniversityFund() {
  return { donated: false, funded: [] };
}

export function ensureCivicDesks(state) {
  if (!state.civicWorks) state.civicWorks = emptyCivicWorks();
  if (!state.university) state.university = emptyUniversityFund();
  return state;
}

export function civicUpgradeLevel(state, useId) {
  return Number(state?.civicWorks?.[useId] ?? 0);
}

export function civicUpgradeQuote(state, useId) {
  const spec = CIVIC_UPGRADE_SPEC[useId];
  if (!spec) return null;
  const level = civicUpgradeLevel(state, useId);
  if (level >= spec.maxLevel) return { ok: false, reason: 'Already at the top civic grade.', level };
  const cost = spec.costs[level + 1];
  return {
    ok: true,
    useId,
    level,
    nextLevel: level + 1,
    cost,
    label: spec.labels[level + 1],
    fromLabel: spec.labels[level],
  };
}

function civicTiles(city, useId) {
  const civic = (city.civicUses ?? []).find((row) => row.useId === useId);
  return civic?.tiles ?? null;
}

function parcelTiles(city, state, parcelId) {
  const parcel = activeParcel(city, state, parcelId);
  return parcel?.tiles ?? null;
}

export function civicUpgradeValueBp(city, state, parcelId) {
  const parcelTilesNow = parcelTiles(city, state, parcelId);
  if (!parcelTilesNow) return 0;
  let total = 0;
  for (const useId of CIVIC_UPGRADE_USE_IDS) {
    const level = civicUpgradeLevel(state, useId);
    if (level < 1) continue;
    const tiles = civicTiles(city, useId);
    if (!tiles) continue;
    const distance = nearestTileDistance(asLattice(parcelTilesNow), asLattice(tiles));
    if (!Number.isFinite(distance) || distance < 1 || distance > 3) continue;
    const peak = CIVIC_UPGRADE_SPEC[useId].liftBp[level] ?? 0;
    const share = distance === 1 ? 10000 : distance === 2 ? 6000 : 3000;
    total += applyBp(peak, share);
  }
  return (
    total
    + airportLinkValueBp(city, state, parcelId)
    + fringeEventsValueBp(city, state, parcelId)
  );
}

export function civicUpgradeRentBp(city, state, parcelId) {
  return applyBp(civicUpgradeValueBp(city, state, parcelId), RULES.amenityRentShareBp);
}

export function universityIdeasFor(state) {
  const rng = stream(state.seed, 'university:desk');
  const pool = [...UNIVERSITY_CATALOG];
  const picked = [];
  while (picked.length < UNIVERSITY_IDEA_CAP && pool.length) {
    const index = rng.int(0, pool.length - 1);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

export function universityStartupBoostBp(state) {
  const desk = state?.university ?? emptyUniversityFund();
  const funded = Array.isArray(desk.funded) ? desk.funded.length : 0;
  const donate = desk.donated ? UNIVERSITY_DONATE_STARTUP_BP : 0;
  return donate + Math.min(UNIVERSITY_IDEA_CAP, funded) * UNIVERSITY_IDEA_STARTUP_BP;
}

export function hospitalityOf(holding) {
  const kind = holding?.hospitality?.kind;
  if (kind === 'hotel' || kind === 'luxe') return holding.hospitality;
  return null;
}

export function hospitalityBlockCount(city, state, parcelId) {
  const parcel = activeParcel(city, state, parcelId);
  if (!parcel) return 0;
  let count = 0;
  for (const id of Object.keys(state.holdings ?? {}).sort()) {
    if (!hospitalityOf(state.holdings[id])) continue;
    const other = activeParcel(city, state, id);
    if (other && other.bx === parcel.bx && other.bz === parcel.bz) count += 1;
  }
  return count;
}

export function hospitalityClusterBp(city, state, parcelId) {
  if (!hospitalityOf(state.holdings?.[parcelId])) return 0;
  const extras = Math.max(0, hospitalityBlockCount(city, state, parcelId) - 1);
  return Math.min(HOSPITALITY_CLUSTER_CAP_BP, extras * HOSPITALITY_CLUSTER_BP);
}

export function hospitalityValueMultBp(city, state, parcelId) {
  const hospitality = hospitalityOf(state.holdings?.[parcelId]);
  if (!hospitality) return 10000;
  let bp = 10000 + hospitalityClusterBp(city, state, parcelId);
  if (hospitality.kind === 'hotel' && hospitality.worldClass) bp = applyBp(bp, 20000);
  return bp;
}

export function rollHotelBrand(seed, parcelId) {
  const rng = stream(seed, `hospitality:brand:${parcelId}`);
  if (rng.int(0, 9999) >= HOTEL_BRAND_CHANCE_BP) {
    return { worldClass: false, brand: null };
  }
  return { worldClass: true, brand: rng.pick(HOTEL_BRAND_NAMES) };
}

export function createHospitality(kind, seed, parcelId) {
  if (kind === 'hotel') {
    const rolled = rollHotelBrand(seed, parcelId);
    return Object.freeze({
      kind: 'hotel',
      worldClass: rolled.worldClass,
      brand: rolled.brand,
    });
  }
  return Object.freeze({ kind: 'luxe', worldClass: false, brand: null });
}

/** Deed / PM / Books identity for a hotel conversion. Internal ids stay on the shell. */
export function boutiqueHotelName(hospitality) {
  if (hospitality?.kind !== 'hotel') return null;
  if (hospitality.worldClass && hospitality.brand) {
    return `${String(hospitality.brand).toUpperCase()} BOUTIQUE HOTEL`;
  }
  return 'BOUTIQUE HOTEL';
}

export function holdingDisplayName(holding, fallback) {
  return boutiqueHotelName(holding?.hospitality)
    ?? dualPadDisplayName(holding)
    ?? fallback;
}
