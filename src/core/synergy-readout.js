// Compatibility readout for surviving pair interactions. Wave L moved all building
// combinations to the settle-owned district engine, so civic-only matches are empty.

import { resolvePairSynergies } from './landuse.js';

export const SYNERGY_STAMP_LIMIT = 3;

function hasTiles(entry) {
  return Array.isArray(entry?.tiles) && entry.tiles.length > 0;
}

function asBuilding(emitter) {
  return {
    id: emitter.id,
    key: emitter.id,
    kind: 'building',
    typeId: emitter.useId,
    tiles: emitter.tiles,
  };
}

/** Civic uses, plus reserve/block cores that already emit with tiles. */
function civicSynergyEntities(city) {
  const emitters = new Map();
  for (const emitter of city.amenityEmitters ?? []) {
    if (!hasTiles(emitter) || emitter.useId === 'water') continue;
    emitters.set(emitter.id, asBuilding(emitter));
  }
  const entities = [];
  const take = (id) => {
    const entity = emitters.get(id);
    if (entity) entities.push(entity);
  };
  for (const civic of city.civicUses ?? []) take(civic.id);
  for (const core of city.blockCores ?? []) take(core.id);
  if (city.reserve?.id) take(city.reserve.id);
  return entities;
}

function pairIdentity(row) {
  return `${row.name}\0${row.leftId}\0${row.rightId}`;
}

/**
 * Unique live building pairs on `city`, sorted by name then left/right ids.
 * `{ name, leftId, rightId, leftUse, rightUse }`
 */
export function liveCivicSynergies(city) {
  const unique = [];
  const seen = new Set();
  for (const match of resolvePairSynergies(civicSynergyEntities(city))) {
    const row = Object.freeze({
      name: match.name,
      leftId: match.left.id,
      rightId: match.right.id,
      leftUse: match.left.typeId ?? match.left.useId,
      rightUse: match.right.typeId ?? match.right.useId,
    });
    const key = pairIdentity(row);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  unique.sort((left, right) =>
    left.name.localeCompare(right.name)
    || left.leftId.localeCompare(right.leftId)
    || left.rightId.localeCompare(right.rightId));
  return Object.freeze(unique);
}

/** 1–2 word face labels for civic / core / reserve uses. Not new pair math. */
export const STAMP_USE_LABELS = Object.freeze({
  'school-primary': 'School',
  'childcare-centre': 'Childcare',
  'community-recreation': 'Recreation',
  reserve: 'Reserve',
  'pocket-park': 'Park',
  playground: 'Playground',
  'community-garden': 'Garden',
  'transport-interchange': 'Transport',
  'supermarket-strip': 'Supermarket',
  'cafe-corner': 'Cafe',
  'police-station': 'Police',
  'remand-centre': 'Remand',
  courthouse: 'Courthouse',
  'factory-light': 'Factory',
  hammerbarn: 'Hammerbarn',
  'warehouse-brick': 'Warehouse',
  'warehouse-richmond-loft': 'Warehouse',
  'warehouse-converted': 'Warehouse',
  'medical-centre': 'Medical',
  'shop-corner': 'Shop',
  'shop-corner-deco': 'Shop',
  'shop-corner-modern': 'Shop',
  'apartment-permit': 'L3 apartment',
  'hospital-district': 'Hospital',
  'works-yard': 'Yard',
  'stock-exchange': 'Exchange',
  'town-hall-melbourne': 'Town hall',
  'university-old-arts': 'University',
  'laneway-court': 'Court',
  'car-park': 'Car park',
  'sewerage-plant': 'Sewerage',
  water: 'Water',
});

function stampUseLabel(useId) {
  const known = STAMP_USE_LABELS[useId];
  if (known) return known;
  const words = String(useId ?? '').split('-').filter(Boolean).slice(0, 2);
  if (!words.length) return '';
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Short stamp copy from the existing pair name. Never more than four words. */
export function synergyStampLabel(row) {
  const name = String(row?.name ?? '').trim();
  if (!name) return '';
  return name.split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
}

/** Face recipe, e.g. "School + Childcare". */
export function synergyStampRecipe(row) {
  const left = stampUseLabel(row?.leftUse);
  const right = stampUseLabel(row?.rightUse);
  if (!left || !right) return '';
  return `${left} + ${right}`;
}

/** First pair per name, in readout order. HUD stamps these, not every site pair. */
export function uniqueNamedSynergies(rows) {
  const unique = [];
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.name)) continue;
    seen.add(row.name);
    unique.push(row);
  }
  return Object.freeze(unique);
}
