// District Deck V3.02 — civic land use and the amenity influence field.
// The field is generated content: it is solved once inside createCity, then deep-frozen
// with the city. Nothing in this module reads runtime state or a clock.

import { ARCHETYPES, RULES } from './content.js';
import {
  TILE, TILES_PER_BLOCK, cityExtent, frontage, globalTile, parseParcelId, parcelId, tileCentre,
} from './grid.js';

const freezeRows = (rows) => Object.freeze(
  Object.fromEntries(
    Object.keys(rows).sort().map((id) => [id, Object.freeze(rows[id])]),
  ),
);

export const CIVIC_USES = Object.freeze([
  Object.freeze({
    id: 'transport-interchange',
    label: 'Transport interchange',
    footprint: Object.freeze([1, 2]),
    storeys: 1,
    // One city hub only — multi-modal tram + bus bay (not a pair of stamps).
    quota: 1,
    siting: 'tram',
  }),
  Object.freeze({
    id: 'supermarket-strip',
    label: 'Supermarket',
    // One continuous street-front strip per city: full 3-tile block edge (no mid-block
    // terrace between two separate 1×2 stamps). Depth 1 tile into the block.
    // DDMG-1 forbids 2×2; 3×1 street-front is allowed.
    footprint: Object.freeze([3, 1]),
    storeys: 1,
    quota: 1,
    siting: 'tram-or-corner',
  }),
  Object.freeze({
    id: 'cafe-corner',
    label: 'Corner cafe',
    footprint: Object.freeze([1, 1]),
    // Match the two-storey corner-hotel content / kit specification (P20 I2-B).
    storeys: 2,
    // City roster: exactly two corner cafes.
    quota: 2,
    siting: 'corner',
  }),
  Object.freeze({
    id: 'school-primary',
    label: 'Primary school',
    footprint: Object.freeze([1, 2]),
    storeys: 2,
    // City roster: one primary school.
    quota: 1,
    siting: 'school',
  }),
  Object.freeze({
    id: 'childcare-centre',
    label: 'Childcare centre',
    footprint: Object.freeze([1, 1]),
    storeys: 1,
    // City roster: one childcare centre.
    quota: 1,
    siting: 'childcare',
  }),
  Object.freeze({
    id: 'community-recreation',
    label: 'Community and recreation centre',
    footprint: Object.freeze([1, 2]),
    storeys: 2,
    // City roster: one community centre.
    quota: 1,
    siting: 'community',
  }),
  // V3.70, owner-directed 2026-08-18: the two Melbourne landmarks join the civic roster as
  // quota-1 uses, exactly like the hospital and the school. Civic is the right home — a town
  // hall and a university are one-per-city institutions the generator places, not lots a
  // player trades, and the civic path already carries quota, siting and a placement anchor.
  //
  // `siting: 'any'` deliberately: neither has a real-world siting rule the generator models
  // (the hospital's is clinical catchment, the school's is walk distance), and inventing one
  // would be a balance decision dressed as a placement constraint.
  //
  // V3.71 lane D, owner-directed 2026-08-19: both landmarks claim 2x2, not 1x2. At [1,2] the
  // site was 16 x 32 m while the authored model builds at 31.56 m, so the building stood 6.702 m
  // (seed 0) to 7.78 m (underwriter) out over the kerb. The owner chose to make the site match
  // the model rather than shrink a town hall to 15.6 m, per §5.4 (do not gut an object to move a
  // metric) and §5.3.11 (identity beats the convenient number). A 2x2 pad is 32 x 32 m and the
  // 31.56 m model sits 0.22 m inside it on all four sides. The claim covers the block core tile
  // — unavoidably, see `CORE_TILE_USE_IDS` — and these are the only two uses permitted to.
  Object.freeze({
    id: 'town-hall-melbourne',
    label: 'Melbourne Town Hall',
    footprint: Object.freeze([2, 2]),
    storeys: 4,
    quota: 1,
    siting: 'any',
  }),
  Object.freeze({
    id: 'university-old-arts',
    label: 'City University',
    footprint: Object.freeze([2, 2]),
    storeys: 3,
    quota: 1,
    siting: 'any',
  }),
  Object.freeze({
    id: 'hospital-district',
    label: 'District hospital',
    footprint: Object.freeze([1, 2]),
    storeys: 6,
    quota: 1,
    siting: 'hospital',
  }),
  Object.freeze({
    id: 'police-station',
    label: 'Police station',
    footprint: Object.freeze([1, 1]),
    storeys: 2,
    quota: 1,
    siting: 'any',
  }),
  Object.freeze({
    id: 'courthouse',
    label: 'Courthouse',
    footprint: Object.freeze([1, 1]),
    storeys: 3,
    // Player-authored civic: it is available under BUILD → CIVIC but is never stamped
    // by the city generator. Justice Precinct therefore has to be completed deliberately.
    quota: 0,
    siting: 'any',
  }),
  Object.freeze({
    id: 'remand-centre',
    label: 'Remand centre',
    footprint: Object.freeze([1, 2]),
    storeys: 3,
    quota: 1,
    siting: 'remand',
  }),
  Object.freeze({
    id: 'factory-light',
    label: 'Light factory',
    footprint: Object.freeze([1, 2]),
    storeys: 2,
    // City roster: one light factory (process plant). Warehouses are parcel stock.
    quota: 1,
    siting: 'industrial-district',
  }),
  Object.freeze({
    id: 'stock-exchange',
    label: 'Stock Exchange',
    footprint: Object.freeze([1, 2]),
    storeys: 8,
    quota: 1,
    siting: 'tram',
  }),
  // V4.0 Wave 2 — player-authored institutions. quota 0: the generator never stamps them.
  Object.freeze({
    id: 'missionary-school',
    label: 'Missionary school',
    footprint: Object.freeze([1, 2]),
    storeys: 2,
    quota: 0,
    siting: 'any',
  }),
  Object.freeze({
    id: 'officer-school',
    label: 'Officer school',
    footprint: Object.freeze([1, 2]),
    storeys: 2,
    quota: 0,
    siting: 'any',
  }),
  Object.freeze({
    id: 'space-works',
    label: 'Space works',
    footprint: Object.freeze([1, 2]),
    storeys: 3,
    quota: 0,
    siting: 'industrial-district',
  }),
  Object.freeze({
    id: 'international-exchange',
    label: 'International exchange',
    footprint: Object.freeze([1, 2]),
    storeys: 8,
    quota: 0,
    siting: 'tram',
  }),
  Object.freeze({
    id: 'biolab',
    label: 'Biolab',
    footprint: Object.freeze([1, 2]),
    storeys: 5,
    quota: 0,
    siting: 'tram',
  }),
  Object.freeze({
    id: 'incubator',
    label: 'AI incubator',
    footprint: Object.freeze([1, 2]),
    storeys: 4,
    quota: 0,
    siting: 'tram',
  }),
]);

export const CIVIC_BY_ID = Object.freeze(
  Object.fromEntries(CIVIC_USES.map((use) => [use.id, use])),
);

export const EMITTER_LABELS = Object.freeze({
  ...Object.fromEntries(CIVIC_USES.map((use) => [use.id, use.label])),
  'pocket-park': 'Pocket park',
  playground: 'Playground',
  'community-garden': 'Community garden',
  'laneway-court': 'Laneway court',
  'car-park': 'Car park',
  'works-yard': 'Works yard',
  'sewerage-plant': 'Sewerage plant',
  water: 'Water edge',
  reserve: 'Public reserve',
});

/** Rotation-neutral land-use fit. A 1×2 form fits a 2×1 pad, never a 1×1 parcel. */
export function landUseFootprintFits(lot, form) {
  const lotW = Math.max(1, Math.floor(Number(lot?.w ?? lot?.[0]) || 1));
  const lotD = Math.max(1, Math.floor(Number(lot?.d ?? lot?.[1]) || 1));
  const formW = Math.max(1, Math.floor(Number(form?.w ?? form?.[0]) || 1));
  const formD = Math.max(1, Math.floor(Number(form?.d ?? form?.[1]) || 1));
  return (formW <= lotW && formD <= lotD) || (formD <= lotW && formW <= lotD);
}

// V3.02 §2.2. Rows absent from a receiver table intentionally contribute zero.
export const INFLUENCE_CURVES = Object.freeze({
  residential: freezeRows({
    'transport-interchange': [-200, 900, 500],
    'stock-exchange': [120, 60, 0],
    'cafe-corner': [420, 260, 80],
    'pocket-park': [620, 300, 120],
    playground: [180, 420, 150],
    'community-garden': [340, 140, 40],
    'laneway-court': [160, 60, 0],
    'supermarket-strip': [-350, 700, 350],
    'community-recreation': [-120, 520, 300],
    'school-primary': [-250, 550, 300],
    'childcare-centre': [-180, 380, 150],
    'police-station': [-150, 260, 180],
    'hospital-district': [-700, 250, 450],
    'car-park': [-280, -90, 0],
    'works-yard': [-520, -200, -60],
    'sewerage-plant': [-980, -480, -160],
    'factory-light': [-1400, -650, -220],
    'remand-centre': [-1600, -900, -400],
    water: [1400, 900, 550],
    reserve: [900, 520, 240],
  }),
  retail: freezeRows({
    'transport-interchange': [1200, 700, 300],
    'supermarket-strip': [560, 300, 120],
    'cafe-corner': [300, 180, 60],
    'school-primary': [340, 260, 100],
    'childcare-centre': [180, 120, 40],
    'hospital-district': [520, 380, 180],
    'community-recreation': [280, 200, 80],
    'factory-light': [250, 140, 40],
    'police-station': [90, 60, 0],
    'car-park': [260, 120, 0],
    'works-yard': [80, 40, 0],
    'sewerage-plant': [-280, -120, -40],
    'pocket-park': [160, 90, 30],
    playground: [160, 90, 30],
    'community-garden': [160, 90, 30],
    'laneway-court': [160, 90, 30],
    'remand-centre': [-600, -340, -140],
    water: [700, 460, 240],
    reserve: [420, 260, 120],
  }),
  office: freezeRows({
    'transport-interchange': [900, 620, 300],
    'cafe-corner': [380, 220, 80],
    'supermarket-strip': [260, 160, 60],
    'pocket-park': [420, 260, 100],
    reserve: [560, 360, 160],
    water: [1100, 740, 380],
    'community-recreation': [180, 120, 40],
    'police-station': [80, 50, 0],
    'car-park': [320, 180, 60],
    'hospital-district': [180, 120, 40],
    'school-primary': [60, 40, 0],
    'childcare-centre': [60, 40, 0],
    playground: [60, 40, 0],
    'community-garden': [60, 40, 0],
    'laneway-court': [60, 40, 0],
    'works-yard': [-180, -90, 0],
    'sewerage-plant': [-360, -180, -60],
    'factory-light': [-700, -380, -140],
    'remand-centre': [-900, -520, -220],
    'stock-exchange': [720, 480, 220],
  }),
});

function participant(kind, ids) {
  return Object.freeze({ kind, ids: Object.freeze(ids) });
}

function pair(name, left, right, effects, maxDistance = 2) {
  return Object.freeze({
    name,
    participants: Object.freeze([left, right]),
    maxDistance,
    effects: Object.freeze(effects.map((effect) => Object.freeze(effect))),
  });
}

/**
 * Ordered person relationships only. Wave L retired every building↔building recipe;
 * `DISTRICT_DEFINITIONS` is now the sole authority for block-condition benefits.
 */
export const PAIR_SYNERGIES = Object.freeze([
  pair(
    'School run',
    participant('person', ['family']),
    participant('building', ['school-primary', 'childcare-centre']),
    [{ target: 0, measure: 'familyDemand', multiplier: 1.25 }],
  ),
  pair(
    'Green family',
    participant('person', ['family']),
    participant('building', ['pocket-park', 'playground', 'community-garden', 'reserve']),
    // 1.28 preserves the pre-district-engine canon: school 1.25 × park 1.28 = 96 bp.
    [{ target: 0, measure: 'familyDemand', multiplier: 1.28 }],
  ),
  pair(
    'Industrial edge',
    participant('person', ['family']),
    participant('building', ['factory-light', 'sewerage-plant']),
    [{ target: 0, measure: 'familyDemand', multiplier: 0.65 }],
  ),
  pair(
    'Family avoidance',
    participant('person', ['family']),
    participant('building', ['remand-centre']),
    [{ target: 0, measure: 'familyDemand', multiplier: 0.55 }],
  ),
  pair(
    'Patrol base',
    participant('person', ['policeman']),
    participant('building', ['police-station']),
    [
      { target: 0, measure: 'suppressionRadius', set: 3 },
      { target: 0, measure: 'incidenceMultiplier', set: 0.25 },
    ],
  ),
  pair(
    'Justice precinct present',
    participant('person', ['policeman']),
    participant('building', ['remand-centre']),
    [{ target: 0, measure: 'suppressionRadius', add: 1, cap: 3 }],
  ),
  pair(
    'Crowd draws agents',
    participant('person', ['property-agent']),
    participant('person', ['auction-crowd']),
    [{ target: 1, measure: 'crowdSize', add: 4, cap: 40 }],
    0,
  ),
  pair(
    'Vulnerable stock',
    participant('person', ['arsonist']),
    participant('building', ['tired-parcel', 'vacant-parcel', 'construction-parcel']),
    [{ target: 1, measure: 'fireTargetScore', authored: true }],
  ),
  pair(
    'Intercepted',
    participant('person', ['policeman']),
    participant('person', ['arsonist']),
    [{ target: 1, measure: 'cancelOutcome', value: 'fire' }],
    3,
  ),
  pair(
    'Moved on',
    participant('person', ['policeman']),
    participant('person', ['squatter']),
    [{ target: 1, measure: 'cancelOutcome', value: 'occupation' }],
    3,
  ),
  pair(
    'Design and build',
    participant('person', ['cheap-builder']),
    participant('person', ['architect']),
    [{ target: 0, measure: 'worksDefectChanceBp', set: 2100 }],
    0,
  ),
  pair(
    'Found together',
    participant('person', ['family']),
    participant('person', ['dog']),
    [{ target: 1, measure: 'dogFindChance', multiplier: 1.25 }],
    0,
  ),
  pair(
    'Deal table',
    participant('person', ['property-agent']),
    participant('person', ['mortgage-broker']),
    [{ target: null, measure: 'coffeeIntelBundle', value: true }],
    0,
  ),
]);

function entityTypeId(entity) {
  return entity.typeId ?? entity.useId ?? entity.archetypeId;
}

function participantAccepts(definition, entity) {
  return definition.kind === entity.kind && definition.ids.includes(entityTypeId(entity));
}

/**
 * Generic ordered pair matcher used by every relationship axis. Entity arrays and
 * each side's candidates are sorted by stable key so insertion order is never a rule.
 */
export function resolvePairSynergies(entities, {
  distance = (left, right) => nearestTileDistance(left.tiles, right.tiles),
} = {}) {
  const ordered = [...entities].sort((left, right) =>
    String(left.key ?? left.id).localeCompare(String(right.key ?? right.id)));
  const matches = [];
  for (const synergy of PAIR_SYNERGIES) {
    const [leftDefinition, rightDefinition] = synergy.participants;
    const leftEntities = ordered.filter((entity) => participantAccepts(leftDefinition, entity));
    const rightEntities = ordered.filter((entity) => participantAccepts(rightDefinition, entity));
    for (const left of leftEntities) {
      for (const right of rightEntities) {
        if (left === right || distance(left, right) > synergy.maxDistance) continue;
        matches.push(Object.freeze({
          name: synergy.name,
          synergy,
          left,
          right,
          effects: synergy.effects,
        }));
      }
    }
  }
  return Object.freeze(matches);
}

function latticeTile(id) {
  const position = parseParcelId(id);
  const lattice = globalTile(position.bx, position.bz, position.tx, position.tz);
  const world = tileCentre(position.bx, position.bz, position.tx, position.tz);
  return { id, ...lattice, ...world };
}

export function nearestTileDistance(aTiles, bTiles) {
  let best = Infinity;
  for (const a of aTiles) {
    for (const b of bTiles) {
      best = Math.min(best, Math.abs(a.gx - b.gx) + Math.abs(a.gz - b.gz));
    }
  }
  return best;
}

/**
 * The block core tile index on both axes. `city.js:blockCoresForCity` hard-codes every core to
 * `tx: 1, tz: 1`, and `city.js` never enters that tile into the parcel stock — it is recorded in
 * `nonTradeableTiles` as `block-core` and skipped. So the tile has no owning parcel, which is a
 * separate obstacle from the coordinate rejection in `tryPlaceFromParcel`, and both must be
 * cleared for a claim that covers it.
 */
const BLOCK_CORE_TILE = 1;

function isBlockCoreTile(id) {
  const { tx, tz } = parseParcelId(id);
  return tx === BLOCK_CORE_TILE && tz === BLOCK_CORE_TILE;
}

/**
 * V3.71 lane D. The only civic uses permitted to claim the block core tile.
 *
 * Both landmark models are authored against a 2x2 envelope and build at 31.56 m. Registered at
 * `[1, 2]` they were dropped onto a 16 m pad and stood 6.70-7.78 m out over the kerb (measured,
 * `_reviews/quality-loop/v371/d-landmark2x2/before.json`). The owner's chosen remedy is to make
 * the site match the model rather than shrink the model to the site.
 *
 * A 2x2 claim in a 3x3 block ALWAYS covers the centre tile — 4 of 4 positions, enumerated in
 * `mvp/tests/v371-lm2x2-arith.mjs`; algebraically, the window spans `{tx0, tx0+1}` with
 * `tx0 in {0,1}`, and 1 is in that pair either way. So this is a precondition of the claim, not a
 * preference, and it is keyed to these two ids on purpose. A blanket relaxation would put every
 * ordinary civic on a block core across the whole board.
 */
const CORE_TILE_USE_IDS = Object.freeze(new Set([
  'town-hall-melbourne',
  'university-old-arts',
]));

/**
 * Candidate footprints this parcel could anchor, in a deterministic order. Consumes no RNG.
 *
 * Returns an array so the 2x2 branch can offer every block quadrant that contains the parcel:
 * a single return would let one quadrant's right-of-way conflict hide three feasible ones.
 * Every other footprint yields zero or one candidate, exactly as before.
 */
function footprintCandidates(parcel, footprint) {
  if (footprint[0] === 1 && footprint[1] === 1) {
    return [{ tiles: [parcel.id], groundFootprint: [1, 1] }];
  }

  // Full street-front strip along one block edge (3 tiles × 1 deep). Used by supermarket.
  // Does not include the block core (tx=1,tz=1); only the three edge parcels face the road.
  const isStreetStrip3 = (
    (footprint[0] === 3 && footprint[1] === 1)
    || (footprint[0] === 1 && footprint[1] === 3)
  );
  if (isStreetStrip3) {
    const last = TILES_PER_BLOCK - 1;
    const side = parcel.rotation === 0
      ? 'south'
      : parcel.rotation === 90
        ? 'east'
        : parcel.rotation === 180
          ? 'north'
          : 'west';
    // Candidate must sit on the street-facing edge of its block.
    if (side === 'south' && parcel.tz !== last) return [];
    if (side === 'north' && parcel.tz !== 0) return [];
    if (side === 'east' && parcel.tx !== last) return [];
    if (side === 'west' && parcel.tx !== 0) return [];
    const tiles = [];
    if (side === 'south' || side === 'north') {
      const tz = parcel.tz;
      for (let tx = 0; tx < TILES_PER_BLOCK; tx += 1) {
        tiles.push(parcelId(parcel.bx, parcel.bz, tx, tz));
      }
      return [{ tiles, groundFootprint: [3, 1] }];
    }
    const tx = parcel.tx;
    for (let tz = 0; tz < TILES_PER_BLOCK; tz += 1) {
      tiles.push(parcelId(parcel.bx, parcel.bz, tx, tz));
    }
    return [{ tiles, groundFootprint: [1, 3] }];
  }

  // V3.71 lane D. Square 2x2 quadrant of the block. Four positions exist in a 3x3 block, each
  // one anchored on a different block corner and each one covering the core tile; every quadrant
  // that contains this parcel's anchor tile is offered, in a fixed (tz0, tx0) order so the walk
  // stays deterministic. Rotation is DERIVED from the quadrant's block corner by the same
  // `frontage()` rule the parcels use — a landmark faces the street its corner addresses — and
  // is never rolled.
  if (footprint[0] === 2 && footprint[1] === 2) {
    const last = TILES_PER_BLOCK - 1;
    const quadrants = [];
    for (let tz0 = 0; tz0 + 1 <= last; tz0 += 1) {
      for (let tx0 = 0; tx0 + 1 <= last; tx0 += 1) {
        const tiles = [];
        for (let dz = 0; dz < 2; dz += 1) {
          for (let dx = 0; dx < 2; dx += 1) {
            tiles.push(parcelId(parcel.bx, parcel.bz, tx0 + dx, tz0 + dz));
          }
        }
        if (!tiles.includes(parcel.id)) continue;
        const cornerTx = tx0 === 0 ? 0 : last;
        const cornerTz = tz0 === 0 ? 0 : last;
        quadrants.push({
          tiles,
          groundFootprint: [2, 2],
          rotation: frontage(cornerTx, cornerTz).rotation,
        });
      }
    }
    return quadrants;
  }

  // Default 1×2 depth pair (into the block from the street frontage).
  const definitions = {
    north: { dx: 0, dz: 1, groundFootprint: [1, 2] },
    south: { dx: 0, dz: -1, groundFootprint: [1, 2] },
    east: { dx: -1, dz: 0, groundFootprint: [2, 1] },
    west: { dx: 1, dz: 0, groundFootprint: [2, 1] },
  };
  const side = parcel.rotation === 0
    ? 'south'
    : parcel.rotation === 90
      ? 'east'
      : parcel.rotation === 180
        ? 'north'
        : 'west';
  const step = definitions[side];
  const tx = parcel.tx + step.dx;
  const tz = parcel.tz + step.dz;
  if (tx < 0 || tz < 0 || tx >= TILES_PER_BLOCK || tz >= TILES_PER_BLOCK) return [];
  return [{
    tiles: [parcel.id, parcelId(parcel.bx, parcel.bz, tx, tz)],
    groundFootprint: step.groundFootprint,
  }];
}

function isCornerTile(id) {
  const { tx, tz } = parseParcelId(id);
  const last = TILES_PER_BLOCK - 1;
  return (tx === 0 || tx === last) && (tz === 0 || tz === last);
}

function ownersFit(candidate, available, tileOwner, allowCoreTile = false) {
  // The block core tile is never a parcel, so it has no owner to fit. Only a use in
  // `CORE_TILE_USE_IDS` may skip it, and only while it is unclaimed: two 2x2 quadrants of the
  // same block can share the core tile and NOTHING else (origins (0,0) and (1,1) intersect only
  // there), so an already-claimed core tile is the sole signal that two landmarks are about to
  // overlap by 16 m. Rejecting it here is what stops that.
  const claimTiles = allowCoreTile
    ? candidate.tiles.filter((tile) => !isBlockCoreTile(tile))
    : candidate.tiles;
  if (allowCoreTile
    && candidate.tiles.some((tile) => isBlockCoreTile(tile) && tileOwner.has(tile))) {
    return null;
  }
  const owners = Array.from(
    new Set(claimTiles.map((tile) => tileOwner.get(tile))),
  ).sort();
  if (owners.some((owner) => !owner || !available.has(owner))) return null;
  if (owners.some((owner) => available.get(owner).tiles.some((tile) => !candidate.tiles.includes(tile)))) {
    return null;
  }
  return owners;
}

function conflictsWithRightOfWay(candidate, rightsOfWay) {
  return rightsOfWay.some((rightOfWay) => {
    const flanks = rightOfWay.flankingParcels.map((flank) => flank.parcelId);
    const occupiedFlanks = flanks.filter((id) => candidate.tiles.includes(id));
    if (occupiedFlanks.length > 1) return true;
    if (occupiedFlanks.length === 0) return false;
    const axisIndex = rightOfWay.setbackAxis === 'x' ? 0 : 1;
    return candidate.groundFootprint[axisIndex] !== 1;
  });
}

function placementDistance(candidate, useId, placed) {
  const other = placed.filter((item) => item.useId === useId);
  if (!other.length) return Infinity;
  const tiles = candidate.tiles.map(latticeTile);
  return Math.min(...other.map((item) => nearestTileDistance(
    tiles,
    item.tiles.map(latticeTile),
  )));
}

function obeysSiting(use, candidate, parcel, placed, blocksX, blocksZ) {
  const corner = candidate.tiles.some(isCornerTile);
  if (use.siting === 'tram') return candidate.tram;
  if (use.siting === 'tram-or-corner') return candidate.tram || corner;
  if (use.siting === 'corner') {
    if (!corner) return false;
    // Spread corner cafes across the city — first-walk without spacing packed
    // all five onto two blocks, so the map read as "only two cafes".
    if (use.id === 'cafe-corner') {
      return placementDistance(candidate, 'cafe-corner', placed) >= 3;
    }
    return true;
  }
  if (use.siting === 'school') {
    return !candidate.tram && placementDistance(candidate, 'school-primary', placed) >= 3;
  }
  if (use.siting === 'childcare') {
    return placementDistance(candidate, 'childcare-centre', placed) >= 2;
  }
  if (use.siting === 'community') {
    return placementDistance(candidate, 'community-recreation', placed) >= 4;
  }
  if (use.siting === 'hospital') {
    return parcel.bx > 0 && parcel.bx < blocksX - 1
      && parcel.bz > 0 && parcel.bz < blocksZ - 1;
  }
  if (use.siting === 'remand') {
    const restricted = placed.filter((item) =>
      item.useId === 'hospital-district' || item.useId === 'school-primary');
    const tiles = candidate.tiles.map(latticeTile);
    return restricted.every((item) =>
      nearestTileDistance(tiles, item.tiles.map(latticeTile)) >= 5);
  }
  if (use.siting === 'industrial-district') {
    return parcel.districtId === 'richmond-flat' || parcel.districtId === 'brighton-reach';
  }
  return true;
}

/**
 * Each civic use draws one start offset, then walks the existing parcel order exactly
 * once. It places as much of that use's quota as the walk permits and records the rest.
 */
export function placeCivicUses({
  rng,
  parcels,
  order,
  corridors,
  rightsOfWay,
  blocksX,
  blocksZ,
  frontsTram,
}) {
  const available = new Map(order.map((id) => [id, parcels[id]]));
  const tileOwner = new Map();
  for (const id of [...available.keys()].sort()) {
    const parcel = available.get(id);
    for (const tile of parcel.tiles) tileOwner.set(tile, parcel.id);
  }

  const placed = [];
  const civicShortfall = {};

  for (const use of CIVIC_USES) {
    // Build-only civic rows (courthouse) consume neither a city slot nor layout RNG.
    if (use.quota <= 0) {
      civicShortfall[use.id] = 0;
      continue;
    }
    const start = order.length ? rng.int(0, order.length - 1) : 0;
    let placedForUse = 0;
    const streetStrip = (
      (use.footprint[0] === 3 && use.footprint[1] === 1)
      || (use.footprint[0] === 1 && use.footprint[1] === 3)
    );

    // Street-strip uses (supermarket): rank every valid full-edge candidate and place the
    // best. Prefer long street front [3,1] (matches long-front model) over deep [1,3], and
    // tram frontage, so seed layouts do not leave a terrace between two 1×2 stamps.
    //
    // V3.71 lane D: `footprintCandidates` returns a LIST. Every footprint but the 2x2 quadrant
    // yields zero or one entry, so this loop is a no-op for them; the 2x2 offers up to four and
    // the first that clears the whole gauntlet wins. `allowCoreTile` is the narrow relaxation —
    // the coordinate rejection below still stands for every other civic use, which is what keeps
    // ordinary civics off block cores across the board.
    const allowCoreTile = CORE_TILE_USE_IDS.has(use.id);
    const tryPlaceFromFootprint = (parcel, footprint) => {
      if (!footprint) return null;
      if (!allowCoreTile && footprint.tiles.some(isBlockCoreTile)) return null;
      if (conflictsWithRightOfWay(footprint, rightsOfWay)) return null;
      const owners = ownersFit(footprint, available, tileOwner, allowCoreTile);
      if (!owners) return null;
      const tram = footprint.tiles.some((tile) => frontsTram(corridors, tile));
      const candidate = {
        ...footprint,
        tram,
        corner: footprint.tiles.some(isCornerTile),
      };
      if (!obeysSiting(use, candidate, parcel, placed, blocksX, blocksZ)) return null;
      const centres = footprint.tiles.map((tile) => {
        const position = parseParcelId(tile);
        return tileCentre(position.bx, position.bz, position.tx, position.tz);
      });
      const centre = {
        x: centres.reduce((sum, point) => sum + point.x, 0) / centres.length,
        z: centres.reduce((sum, point) => sum + point.z, 0) / centres.length,
      };
      // Street-facing rotation for the whole strip (not the seed parcel's alone when
      // ranking multi-tile edges). A candidate that derived its own rotation from the geometry
      // it claims (the 2x2 quadrant) keeps it.
      let rotation = footprint.rotation ?? parcel.rotation;
      if (streetStrip) {
        const [gfx, gfz] = footprint.groundFootprint;
        if (gfx === 3 && gfz === 1) {
          // Horizontal edge: south (tz max) faces south (0), north faces north (180).
          const tz = parseParcelId(footprint.tiles[0]).tz;
          rotation = tz === 0 ? 180 : 0;
        } else if (gfx === 1 && gfz === 3) {
          const tx = parseParcelId(footprint.tiles[0]).tx;
          rotation = tx === 0 ? 270 : 90;
        }
      }
      return {
        footprint,
        owners,
        tram,
        corner: candidate.corner,
        centre,
        rotation,
        parcel,
        // Prefer long street front matching the strip model; then tram; then stable id.
        score: (
          (footprint.groundFootprint[0] === 3 ? 1000 : 0)
          + (tram ? 100 : 0)
          + (candidate.corner ? 10 : 0)
        ),
        key: footprint.tiles.slice().sort().join(','),
      };
    };

    const tryPlaceFromParcel = (parcel) => {
      for (const footprint of footprintCandidates(parcel, use.footprint)) {
        const pick = tryPlaceFromFootprint(parcel, footprint);
        if (pick) return pick;
      }
      return null;
    };

    const commitCivic = (pick) => {
      const civic = {
        id: `civic-${use.id}-${placedForUse + 1}`,
        useId: use.id,
        landUseId: use.id,
        landUseFamily: 'civic',
        label: use.label,
        sourceLabel: use.label,
        source: 'runtime-procedural',
        footprint: [...use.footprint],
        groundFootprint: [...pick.footprint.groundFootprint],
        storeys: use.storeys,
        rotation: pick.rotation,
        bx: pick.parcel.bx,
        bz: pick.parcel.bz,
        tx: pick.parcel.tx,
        tz: pick.parcel.tz,
        tiles: [...pick.footprint.tiles],
        centre: pick.centre,
        districtId: pick.parcel.districtId,
        districtName: pick.parcel.districtName,
        tram: pick.tram,
        corner: pick.corner,
        replacedParcelIds: [...pick.owners],
      };
      placed.push(civic);
      placedForUse += 1;
      for (const owner of pick.owners) {
        for (const tile of available.get(owner).tiles) tileOwner.delete(tile);
        available.delete(owner);
      }
      for (const tile of pick.footprint.tiles) tileOwner.set(tile, civic.id);
    };

    // Rank-all-then-place: street strips and corner cafes. Cafe first-walk
    // packed quota onto two adjacent blocks; ranking by separation + tram
    // spreads the milk-bar stamps city-wide.
    const rankedPlace = streetStrip || use.id === 'cafe-corner';

    while (placedForUse < use.quota) {
      if (rankedPlace) {
        const ranked = [];
        const seen = new Set();
        for (const candidateId of order) {
          const parcel = available.get(candidateId);
          if (!parcel) continue;
          const pick = tryPlaceFromParcel(parcel);
          if (!pick || seen.has(pick.key)) continue;
          seen.add(pick.key);
          // Prefer spread for cafes: maximise distance to already-placed cafes.
          const separation = use.id === 'cafe-corner'
            ? Math.min(50, placementDistance(pick.footprint, 'cafe-corner', placed))
            : 0;
          ranked.push({
            ...pick,
            score: pick.score + separation * 20,
          });
        }
        ranked.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
        if (!ranked.length) break;
        commitCivic(ranked[0]);
        continue;
      }

      let placedThisPass = false;
      for (let offset = 0; offset < order.length; offset += 1) {
        const candidateId = order[(start + offset) % order.length];
        const parcel = available.get(candidateId);
        if (!parcel) continue;
        const pick = tryPlaceFromParcel(parcel);
        if (!pick) continue;
        commitCivic(pick);
        placedThisPass = true;
        break;
      }
      if (!placedThisPass) break;
    }
    civicShortfall[use.id] = use.quota - placedForUse;
  }

  const remainingOrder = order.filter((id) => available.has(id));
  const remainingParcels = Object.fromEntries(
    remainingOrder.map((id) => [id, available.get(id)]),
  );
  const covered = {};
  for (const id of remainingOrder) {
    for (const tile of remainingParcels[id].tiles) {
      if (tile !== id) covered[tile] = id;
    }
  }
  // `city.js` spreads this over `nonTradeableTiles`, so whatever is written here for a tile
  // REPLACES the entry the parcel pass made. The block core tile keeps `kind: 'block-core'`
  // deliberately: the core object stays in `city.blockCores` as a display-route node, the tile
  // never entered the parcel stock, and `mvp/tests/core.test.mjs` asserts that kind for every
  // core on every seed. The landmark standing over it is additional information, carried in the
  // extra fields rather than by overwriting the reason the tile is untradeable.
  const civicTiles = Object.fromEntries(placed.flatMap((civic) =>
    civic.tiles.map((tile) => {
      if (!isBlockCoreTile(tile)) {
        return [tile, { kind: 'civic', civicId: civic.id, useId: civic.useId }];
      }
      const { bx, bz } = parseParcelId(tile);
      return [tile, {
        kind: 'block-core',
        blockId: `core-${bx}-${bz}`,
        civicId: civic.id,
        useId: civic.useId,
      }];
    })));

  return {
    civicUses: placed,
    civicShortfall,
    parcels: remainingParcels,
    order: remainingOrder,
    covered,
    civicTiles,
  };
}

function emitterTilesFromIds(ids) {
  return ids.map(latticeTile);
}

function buildEmitters({
  civicUses,
  blockCores,
  reserve,
  waterEdge,
  blocksX,
  blocksZ,
}) {
  const civic = civicUses.map((use) => ({
    id: use.id,
    useId: use.useId,
    label: use.label,
    tiles: emitterTilesFromIds(use.tiles),
  }));
  const cores = blockCores
    .filter((core) => core.useId !== 'reserve-rotunda')
    .map((core) => ({
      id: core.id,
      useId: core.useId,
      label: EMITTER_LABELS[core.useId],
      tiles: emitterTilesFromIds([parcelId(core.bx, core.bz, 1, 1)]),
    }));
  const reserveEmitter = reserve
    ? [{
      id: reserve.id,
      useId: 'reserve',
      label: EMITTER_LABELS.reserve,
      tiles: Array.from({ length: TILES_PER_BLOCK * TILES_PER_BLOCK }, (_, index) => {
        const tx = index % TILES_PER_BLOCK;
        const tz = Math.floor(index / TILES_PER_BLOCK);
        return latticeTile(parcelId(reserve.bx, reserve.bz, tx, tz));
      }),
    }]
    : [];
  const maxGx = blocksX * TILES_PER_BLOCK - 1;
  const maxGz = blocksZ * TILES_PER_BLOCK - 1;
  const waterTiles = [];
  const extent = cityExtent(blocksX, blocksZ);
  if (waterEdge === 'north' || waterEdge === 'south') {
    for (let gx = 0; gx <= maxGx; gx += 1) {
      waterTiles.push({
        gx,
        gz: waterEdge === 'north' ? -1 : maxGz + 1,
        x: null,
        z: waterEdge === 'north' ? 0 : extent.z,
      });
    }
  } else {
    for (let gz = 0; gz <= maxGz; gz += 1) {
      waterTiles.push({
        gx: waterEdge === 'west' ? -1 : maxGx + 1,
        gz,
        x: waterEdge === 'west' ? 0 : extent.x,
        z: null,
      });
    }
  }
  return [
    ...civic,
    ...cores,
    ...reserveEmitter,
    {
      id: `water-${waterEdge}`,
      useId: 'water',
      label: EMITTER_LABELS.water,
      waterEdge,
      tiles: waterTiles,
    },
  ];
}

function nearestEmitterTile(receiverTiles, emitter) {
  let best = null;
  let bestDistance = Infinity;
  for (const receiver of receiverTiles) {
    for (const source of emitter.tiles) {
      const distance = Math.abs(receiver.gx - source.gx) + Math.abs(receiver.gz - source.gz);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { receiver, source };
      }
    }
  }
  if (!best) return null;
  const sourcePoint = emitter.useId === 'water'
    ? {
      x: best.source.x ?? best.receiver.x,
      z: best.source.z ?? best.receiver.z,
    }
    : { x: best.source.x, z: best.source.z };
  return { distance: bestDistance, sourcePoint };
}

export function applyOperations(value, operations) {
  let bp = value;
  let product = 1;
  const names = [];
  for (const operation of operations) {
    if (!names.includes(operation.name)) names.push(operation.name);
    if (operation.zeroNegative) {
      if (bp < 0) bp = 0;
      continue;
    }
    const nextProduct = Math.min(1.6, product * operation.multiplier);
    const effectiveMultiplier = nextProduct / product;
    bp = Math.round(bp * effectiveMultiplier);
    product = nextProduct;
  }
  return { bp, synergy: names.length ? names.join(' + ') : null };
}

/**
 * Solve every surviving tradeable receiver. amenityNotes are the five strongest
 * explanations; amenityMarkers retain every non-zero contributor for the renderer.
 */
export function solveAmenityField({
  parcels,
  order,
  civicUses,
  blockCores,
  reserve,
  waterEdge,
  blocksX,
  blocksZ,
}) {
  const emitters = buildEmitters({
    civicUses,
    blockCores,
    reserve,
    waterEdge,
    blocksX,
    blocksZ,
  });
  const solved = {};

  for (const id of order) {
    const parcel = parcels[id];
    const receiverTiles = emitterTilesFromIds(parcel.tiles);
    const contributions = [];
    for (let sourceOrder = 0; sourceOrder < emitters.length; sourceOrder += 1) {
      const emitter = emitters[sourceOrder];
      const nearest = nearestEmitterTile(receiverTiles, emitter);
      if (!nearest || nearest.distance < 1 || nearest.distance > 3) continue;
      const curve = INFLUENCE_CURVES[parcel.sector]?.[emitter.useId];
      if (!curve) continue;
      const result = applyOperations(
        curve[nearest.distance - 1],
        [],
      );
      if (result.bp === 0) continue;
      contributions.push({
        sourceId: emitter.id,
        sourceLabel: emitter.label,
        sourceUseId: emitter.useId,
        distance: nearest.distance,
        bp: result.bp,
        synergy: result.synergy,
        sourceOrder,
        marker: nearest.sourcePoint,
      });
    }
    const rawAmenityValueBp = contributions.reduce((sum, note) => sum + note.bp, 0);
    const amenityValueBp = Math.max(
      -RULES.amenityClampBp,
      Math.min(RULES.amenityClampBp, rawAmenityValueBp),
    );
    const sorted = contributions.slice().sort((a, b) =>
      Math.abs(b.bp) - Math.abs(a.bp) || a.sourceOrder - b.sourceOrder);
    solved[id] = {
      ...parcel,
      amenityValueBp,
      amenityRentBp: Math.round(amenityValueBp * RULES.amenityRentShareBp / 10000),
      amenityClamped: amenityValueBp !== rawAmenityValueBp,
      amenityNotes: sorted.slice(0, 5).map((note) => ({
        sourceId: note.sourceId,
        sourceLabel: note.sourceLabel,
        distance: note.distance,
        bp: note.bp,
        synergy: note.synergy,
      })),
      amenityMarkers: contributions.map((note) => ({
        sourceId: note.sourceId,
        sourceUseId: note.sourceUseId,
        distance: note.distance,
        bp: note.bp,
        x: note.marker.x,
        z: note.marker.z,
      })),
    };
  }

  return { parcels: solved, emitters };
}

// V3.38 Wave L — settled block-condition districts. These effects are authored in
// integer basis points and are the sole building-district economy. The older pair
// matcher remains below the people layer for person interactions only; it no longer
// changes the generated amenity field.
const DISTRICT_GREENS = Object.freeze([
  'pocket-park', 'playground', 'community-garden', 'reserve', 'reserve-rotunda',
]);
const DISTRICT_FREIGHT_FORMS = Object.freeze([
  'warehouse-brick', 'warehouse-richmond-loft', 'warehouse-converted',
  'factory-light',
]);
const DISTRICT_AGRICULTURAL_FORMS = Object.freeze([
  'grain-plot', 'dairy-processor', 'winery', 'cattle-abattoir',
]);
const DISTRICT_INDUSTRIAL_RECEIVERS = Object.freeze([
  ...DISTRICT_FREIGHT_FORMS, 'hammerbarn', ...DISTRICT_AGRICULTURAL_FORMS,
]);
const DISTRICT_SHOPS = Object.freeze([
  'shop-corner', 'shop-corner-deco', 'shop-corner-modern', 'shoptop-mixed',
]);

function requirement(id, label, { useIds = [], category = null, min = 1, gatewayKind = null } = {}) {
  return Object.freeze({
    id, label, useIds: Object.freeze(useIds), category, min, gatewayKind,
  });
}

function districtDefinition(id, name, requirements, effects) {
  return Object.freeze({
    id,
    name,
    requirements: Object.freeze(requirements),
    effects: Object.freeze(effects.map(Object.freeze)),
  });
}

/**
 * Authored Wave-L district table. Receiver names are intentionally semantic rather
 * than sector ids because warehouses share the retail sector in the legacy market.
 */
export const DISTRICT_DEFINITIONS = Object.freeze([
  districtDefinition('freight-district', 'Freight District', [
    requirement('gateway', 'Port / station adjacency', { category: 'gateway' }),
    requirement('freight-forms', 'Warehouse / factory ×2', {
      category: 'freight-form', min: 2,
    }),
  ], [
    { measure: 'value', receiver: 'industrial', bp: 250 },
    { measure: 'rent', receiver: 'industrial', bp: 1200 },
  ]),
  districtDefinition('justice-precinct', 'Justice Precinct', [
    requirement('police', 'Police station', { useIds: ['police-station'] }),
    requirement('remand', 'Remand centre', { useIds: ['remand-centre'] }),
    requirement('courthouse', 'Courthouse', { useIds: ['courthouse'] }),
  ], [
    { measure: 'value', receiver: 'any', bp: 350 },
    { measure: 'rent', receiver: 'office', bp: 250 },
  ]),
  districtDefinition('shopping-strip', 'Shopping Strip', [
    requirement('cafe', 'Cafe', { useIds: ['cafe-corner'] }),
    requirement('supermarket', 'Supermarket', { useIds: ['supermarket-strip'] }),
    requirement('shop', 'Shop', { category: 'shop' }),
  ], [
    { measure: 'value', receiver: 'retail', bp: 450 },
    { measure: 'rent', receiver: 'retail', bp: 900 },
  ]),
  districtDefinition('construction-precinct', 'Construction Precinct', [
    requirement('hammerbarn', 'Hammerbarn', { useIds: ['hammerbarn'] }),
    requirement('factory', 'Factory', { useIds: ['factory-light'] }),
  ], [
    { measure: 'value', receiver: 'industrial', bp: 300 },
    { measure: 'rent', receiver: 'industrial', bp: 500 },
  ]),
  districtDefinition('health-precinct', 'Health Precinct', [
    requirement('hospital', 'Hospital', { useIds: ['hospital-district'] }),
    requirement('medical', 'Medical centre', { useIds: ['medical-centre'] }),
  ], [
    { measure: 'value', receiver: 'residential', bp: 500 },
    { measure: 'rent', receiver: 'retail', bp: 300 },
  ]),
  districtDefinition('activity-centre', 'Activity Centre', [
    requirement('transport', 'Transport', { useIds: ['transport-interchange'] }),
    requirement('shop', 'Shop', { category: 'shop' }),
    requirement('supermarket', 'Supermarket', { useIds: ['supermarket-strip'] }),
    requirement('l3-apartment', 'L3 apartment', { category: 'l3-apartment' }),
  ], [
    { measure: 'value', receiver: 'any', bp: 400 },
    { measure: 'rent', receiver: 'retail', bp: 600 },
  ]),
  districtDefinition('commercial-precinct', 'Commercial Precinct', [
    requirement('exchange', 'Stock Exchange', { useIds: ['stock-exchange'] }),
    requirement('valued-startups', 'Successful AI startup ×2', {
      category: 'valued-venture', min: 2,
    }),
  ], [
    { measure: 'value', receiver: 'office', bp: 700 },
    { measure: 'rent', receiver: 'office', bp: 800 },
    { measure: 'value', receiver: 'venture', bp: 1000 },
  ]),
  districtDefinition('education-precinct', 'Education Precinct', [
    // One primary-school entity may satisfy both school predicates. That is deliberate:
    // sockets describe facts, not consumable recipe ingredients.
    requirement('university-or-school', 'University or school', {
      useIds: ['university-old-arts', 'school-primary', 'school-high'],
    }),
    requirement('primary', 'Primary school', { useIds: ['school-primary'] }),
    requirement('childcare', 'Childcare', { useIds: ['childcare-centre'] }),
  ], [
    { measure: 'value', receiver: 'residential', bp: 600 },
    { measure: 'rent', receiver: 'residential', bp: 250 },
  ]),
  districtDefinition('civic-green', 'Civic Green', [
    requirement('community', 'Community centre', { useIds: ['community-recreation'] }),
    requirement('school', 'Primary school', { useIds: ['school-primary'] }),
  ], [
    { measure: 'value', receiver: 'residential', bp: 300 },
    { measure: 'rent', receiver: 'residential', bp: 200 },
  ]),
  // V4.0 Wave 3 / R5 — Agricultural District. Home block sits NEXT TO THE PORT
  // (category:'gateway' + gatewayKind:'port'). Freight still accepts any
  // gateway (port | station | interchange); farms do not form on the station
  // block or beside an inland interchange. Two standing farm forms.
  // Value 200 / rent 700 industrial: below freight (250/1200) because broadacre
  // is cheaper land than a bond-store apron, above construction rent (500)
  // because offtake cashflow is stronger than a works precinct.
  districtDefinition('agricultural', 'Agricultural District', [
    requirement('gateway', 'Port adjacency', { category: 'gateway', gatewayKind: 'port' }),
    requirement('farm-forms', 'Farm forms ×2', {
      category: 'agricultural-form', min: 2,
    }),
  ], [
    { measure: 'value', receiver: 'industrial', bp: 200 },
    { measure: 'rent', receiver: 'industrial', bp: 700 },
  ]),
]);

export const DISTRICT_DEFINITION_BY_ID = Object.freeze(Object.fromEntries(
  DISTRICT_DEFINITIONS.map((row) => [row.id, row]),
));

/** R1 plate derived from authored effects: `+{valueBp} value · +{rentBp} rent · {receiver}`. */
export function districtEffectCaption(definition) {
  const effects = definition?.effects ?? [];
  let valueBp = 0;
  let rentBp = 0;
  const receivers = [];
  for (const effect of effects) {
    if (effect.measure === 'value') valueBp += effect.bp;
    if (effect.measure === 'rent') rentBp += effect.bp;
    if (effect.receiver && !receivers.includes(effect.receiver)) receivers.push(effect.receiver);
  }
  const signed = (bp) => `${bp < 0 ? '−' : '+'}${Math.abs(bp)}`;
  return `${signed(valueBp)} value · ${signed(rentBp)} rent · ${receivers.join('/') || 'any'}`;
}

function runtimeParcels(city, state) {
  if (state?.topology?.version && state.topology.parcels) return state.topology.parcels;
  return city?.parcels ?? {};
}

function runtimeOrder(city, state) {
  if (state?.topology?.version && state.topology.order) return state.topology.order;
  return city?.order ?? Object.keys(runtimeParcels(city, state)).sort();
}

function entityUseId(parcel, holding, status) {
  return status?.builtLandUseId
    ?? holding?.landUseId
    ?? status?.builtArchetypeId
    ?? holding?.archetypeId
    ?? parcel?.landUseId
    ?? parcel?.archetypeId
    ?? null;
}

function standingSlotForms(holding) {
  return ['A', 'B']
    .map((id) => holding?.padSlots?.[id])
    .filter((row) => row?.status === 'standing' && row.archetypeId)
    .map((row) => ({
      archetypeId: row.archetypeId,
      useId: row.catalogId ?? row.archetypeId,
    }));
}

/** Standing, block-addressable facts used by every condition evaluation. */
export function districtEntities(city, state = {}) {
  const parcels = runtimeParcels(city, state);
  const rows = [];
  for (const id of runtimeOrder(city, state)) {
    const parcel = parcels[id];
    if (!parcel) continue;
    const holding = state.holdings?.[id];
    const slotForms = standingSlotForms(holding);
    if (holding?.siteCleared) continue;
    if (holding?.construction && !slotForms.length) continue;
    const status = state.parcelStatus?.[id];
    const useId = slotForms[0]?.useId ?? entityUseId(parcel, holding, status);
    const archetypeId = slotForms[0]?.archetypeId
      ?? status?.builtArchetypeId
      ?? holding?.archetypeId
      ?? parcel.archetypeId
      ?? useId;
    rows.push({
      id,
      key: `parcel:${id}`,
      kind: 'parcel',
      useId,
      archetypeId,
      useIds: slotForms.length ? slotForms.map((row) => row.useId) : [useId],
      archetypeIds: slotForms.length ? slotForms.map((row) => row.archetypeId) : [archetypeId],
      bx: parcel.bx,
      bz: parcel.bz,
      blockId: `${parcel.bx},${parcel.bz}`,
      level: status?.builtLevel ?? holding?.level ?? 0,
      venture: holding?.venture ?? null,
    });
  }
  for (const civic of city?.civicUses ?? []) {
    rows.push({
      id: civic.id,
      key: `civic:${civic.id}`,
      kind: 'civic',
      useId: civic.useId ?? civic.landUseId,
      archetypeId: civic.useId ?? civic.landUseId,
      bx: civic.bx,
      bz: civic.bz,
      blockId: `${civic.bx},${civic.bz}`,
      level: 0,
      venture: null,
    });
  }
  for (const core of city?.blockCores ?? []) {
    rows.push({
      id: core.id,
      key: `core:${core.id}`,
      kind: 'core',
      useId: core.useId,
      archetypeId: core.useId,
      bx: core.bx,
      bz: core.bz,
      blockId: `${core.bx},${core.bz}`,
      level: 0,
      venture: null,
    });
  }
  if (city?.reserve) {
    rows.push({
      id: city.reserve.id,
      key: `reserve:${city.reserve.id}`,
      kind: 'reserve',
      useId: 'reserve',
      archetypeId: 'reserve',
      bx: city.reserve.bx,
      bz: city.reserve.bz,
      blockId: `${city.reserve.bx},${city.reserve.bz}`,
      level: 0,
      venture: null,
    });
  }
  return Object.freeze(rows.sort((left, right) => left.key.localeCompare(right.key)));
}

function categoryAccepts(category, entity) {
  const useIds = entity.useIds ?? [entity.useId];
  const archetypeIds = entity.archetypeIds ?? [entity.archetypeId];
  if (category === 'freight-form') {
    return useIds.some((useId) => DISTRICT_FREIGHT_FORMS.includes(useId));
  }
  if (category === 'agricultural-form') {
    return useIds.some((useId) => DISTRICT_AGRICULTURAL_FORMS.includes(useId));
  }
  if (category === 'shop') return useIds.some((useId) => DISTRICT_SHOPS.includes(useId));
  if (category === 'green') return useIds.some((useId) => DISTRICT_GREENS.includes(useId));
  if (category === 'l3-apartment') {
    return entity.level >= 3 && archetypeIds.some((id) => String(id ?? '').includes('apartment'));
  }
  if (category === 'valued-venture') {
    return entity.venture?.status === 'valued' && Number(entity.venture.valuation) > 0;
  }
  return false;
}

const OPPOSITE_EDGE = Object.freeze({
  north: 'south', south: 'north', east: 'west', west: 'east',
});

function fringeGatewayRoles(city) {
  const bay = city?.waterEdge ?? 'south';
  const perpendicular = bay === 'north' || bay === 'south'
    ? ['west', 'east']
    : ['north', 'south'];
  return {
    portEdge: city?.waterEdgeBand?.harbourAtLowEnd ? perpendicular[0] : perpendicular[1],
    stationEdge: OPPOSITE_EDGE[bay],
  };
}

function blockTouchesEdge(city, block, edge) {
  if (edge === 'north') return block.bz === 0;
  if (edge === 'south') return block.bz === (city.blocksZ ?? 1) - 1;
  if (edge === 'west') return block.bx === 0;
  if (edge === 'east') return block.bx === (city.blocksX ?? 1) - 1;
  return false;
}

function southernCrossBlock(city, stationEdge) {
  const maxGx = Math.max(0, (city?.blocksX ?? 1) * TILES_PER_BLOCK - 1);
  const maxGz = Math.max(0, (city?.blocksZ ?? 1) * TILES_PER_BLOCK - 1);
  const gxAlong = Math.round(maxGx * 0.74);
  const gzAlong = Math.round(maxGz * 0.74);
  const gx = stationEdge === 'west' ? 0 : stationEdge === 'east' ? maxGx : gxAlong;
  const gz = stationEdge === 'north' ? 0 : stationEdge === 'south' ? maxGz : gzAlong;
  return {
    bx: Math.min((city?.blocksX ?? 1) - 1, Math.floor(gx / TILES_PER_BLOCK)),
    bz: Math.min((city?.blocksZ ?? 1) - 1, Math.floor(gz / TILES_PER_BLOCK)),
  };
}

function orthogonallyAdjacent(left, right) {
  return Math.abs(left.bx - right.bx) + Math.abs(left.bz - right.bz) === 1;
}

function gatewayEvidence(city, block, entities) {
  const evidence = [];
  const roles = fringeGatewayRoles(city);
  if (blockTouchesEdge(city, block, roles.portEdge)) {
    evidence.push({
      id: `gateway-port-${roles.portEdge}`,
      key: `gateway:port:${roles.portEdge}`,
      kind: 'gateway',
      gatewayKind: 'port',
      useId: 'port',
      bx: block.bx,
      bz: block.bz,
      blockId: block.blockId,
    });
  }
  const station = southernCrossBlock(city, roles.stationEdge);
  if (station.bx === block.bx && station.bz === block.bz) {
    evidence.push({
      id: 'gateway-southern-cross',
      key: 'gateway:station:southern-cross',
      kind: 'gateway',
      gatewayKind: 'station',
      useId: 'train-station',
      bx: block.bx,
      bz: block.bz,
      blockId: block.blockId,
    });
  }
  for (const entity of entities) {
    if (entity.useId !== 'transport-interchange') continue;
    if (!orthogonallyAdjacent(block, entity)) continue;
    evidence.push({ ...entity, gatewayKind: 'interchange' });
  }
  return evidence.sort((left, right) => left.key.localeCompare(right.key));
}

function requirementMatches(requirementRow, localEntities, gateway) {
  if (requirementRow.category === 'gateway') {
    if (requirementRow.gatewayKind) {
      return gateway.filter((row) => row.gatewayKind === requirementRow.gatewayKind);
    }
    return gateway;
  }
  if (requirementRow.category) {
    return localEntities.filter((entity) => categoryAccepts(requirementRow.category, entity));
  }
  return localEntities.filter((entity) => requirementRow.useIds.includes(entity.useId));
}

function blockRows(city) {
  const rows = [];
  for (let bz = 0; bz < (city?.blocksZ ?? 0); bz += 1) {
    for (let bx = 0; bx < (city?.blocksX ?? 0); bx += 1) {
      rows.push({ bx, bz, blockId: `${bx},${bz}` });
    }
  }
  return rows;
}

export function districtFootprintBlockIds(city, bx, bz) {
  return Object.freeze([
    { bx, bz },
    { bx: bx - 1, bz },
    { bx: bx + 1, bz },
    { bx, bz: bz - 1 },
    { bx, bz: bz + 1 },
  ].filter((block) => (
    block.bx >= 0 && block.bz >= 0
    && block.bx < (city?.blocksX ?? 0) && block.bz < (city?.blocksZ ?? 0)
  )).map((block) => `${block.bx},${block.bz}`).sort());
}

/** Current facts, independent of whether settle has committed them yet. */
export function evaluateDistrictConditions(city, state = {}) {
  const entities = districtEntities(city, state);
  const byBlock = new Map(blockRows(city).map((block) => [block.blockId, []]));
  for (const entity of entities) {
    if (!byBlock.has(entity.blockId)) byBlock.set(entity.blockId, []);
    byBlock.get(entity.blockId).push(entity);
  }
  const evaluations = [];
  for (const block of blockRows(city)) {
    const localEntities = byBlock.get(block.blockId) ?? [];
    const gateway = gatewayEvidence(city, block, entities);
    const localParcelIds = localEntities
      .filter((entity) => entity.kind === 'parcel')
      .map((entity) => entity.id)
      .sort();
    for (const definition of DISTRICT_DEFINITIONS) {
      const sockets = definition.requirements.map((requirementRow) => {
        const matches = requirementMatches(requirementRow, localEntities, gateway);
        const count = matches.length;
        const satisfied = count >= requirementRow.min;
        return Object.freeze({
          id: requirementRow.id,
          label: requirementRow.label,
          required: requirementRow.min,
          count,
          satisfied,
          targetIds: Object.freeze(matches.map((entity) => entity.id).sort()),
          candidateParcelIds: Object.freeze(satisfied ? [] : localParcelIds),
        });
      });
      const met = sockets.filter((socket) => socket.satisfied).length;
      evaluations.push(Object.freeze({
        key: `${definition.id}@${block.blockId}`,
        districtId: definition.id,
        name: definition.name,
        blockId: block.blockId,
        bx: block.bx,
        bz: block.bz,
        formed: met === sockets.length,
        met,
        total: sockets.length,
        missing: sockets.length - met,
        footprintBlockIds: districtFootprintBlockIds(city, block.bx, block.bz),
        sockets: Object.freeze(sockets),
      }));
    }
  }
  return Object.freeze(evaluations.sort((left, right) => left.key.localeCompare(right.key)));
}

/** The district authority persisted at settle. */
export function evaluateDistrictEngine(city, state = {}, { settledQuarter = state.quarter ?? 0 } = {}) {
  const formations = evaluateDistrictConditions(city, state)
    .filter((row) => row.formed)
    .map((row) => Object.freeze({
      key: row.key,
      districtId: row.districtId,
      name: row.name,
      blockId: row.blockId,
      bx: row.bx,
      bz: row.bz,
      footprintBlockIds: row.footprintBlockIds,
    }));
  return Object.freeze({
    version: 1,
    settledQuarter,
    formations: Object.freeze(formations),
  });
}

export function districtEngineChanges(before, after) {
  const prior = new Map((before?.formations ?? []).map((row) => [row.key, row]));
  const next = new Map((after?.formations ?? []).map((row) => [row.key, row]));
  const formed = [...next.keys()].filter((key) => !prior.has(key)).map((key) => next.get(key));
  const dissolved = [...prior.keys()].filter((key) => !next.has(key)).map((key) => prior.get(key));
  return Object.freeze({
    formed: Object.freeze(formed),
    dissolved: Object.freeze(dissolved),
  });
}

function parcelEffectIdentity(city, state, parcelId) {
  const parcel = runtimeParcels(city, state)[parcelId];
  if (!parcel) return null;
  const holding = state?.holdings?.[parcelId];
  const status = state?.parcelStatus?.[parcelId];
  const archetypeId = status?.builtArchetypeId
    ?? holding?.construction?.toArchetype
    ?? holding?.archetypeId
    ?? parcel.archetypeId;
  return {
    blockId: `${parcel.bx},${parcel.bz}`,
    useId: entityUseId(parcel, holding, status) ?? archetypeId,
    archetypeId,
    sector: holding?.sector ?? ARCHETYPES[archetypeId]?.sector ?? parcel.sector,
    venture: holding?.venture ?? null,
  };
}

function parcelEffectIdentities(city, state, parcelId) {
  const parcel = runtimeParcels(city, state)[parcelId];
  if (!parcel) return [];
  const holding = state?.holdings?.[parcelId];
  const slotForms = standingSlotForms(holding);
  if (slotForms.length) {
    return slotForms.map((row) => ({
      blockId: `${parcel.bx},${parcel.bz}`,
      useId: row.useId,
      archetypeId: row.archetypeId,
      sector: ARCHETYPES[row.archetypeId]?.sector ?? holding?.sector ?? parcel.sector,
      venture: holding?.venture ?? null,
    }));
  }
  const identity = parcelEffectIdentity(city, state, parcelId);
  return identity ? [identity] : [];
}

function receiverAccepts(receiver, identity) {
  const isIndustrial = DISTRICT_INDUSTRIAL_RECEIVERS.includes(identity.useId)
    || DISTRICT_INDUSTRIAL_RECEIVERS.includes(identity.archetypeId);
  const isValuedVenture = identity.venture?.status === 'valued'
    && Number(identity.venture.valuation) > 0;
  if (receiver === 'any') return true;
  if (receiver === 'industrial') return isIndustrial;
  if (receiver === 'venture') return isValuedVenture;
  if (receiver === 'office') return identity.sector === 'office' && !isValuedVenture;
  if (receiver === 'retail') return identity.sector === 'retail' && !isIndustrial;
  if (receiver === 'residential') return identity.sector === 'residential';
  return false;
}

/** Additive authored bp applying to one live parcel from the settled formation snapshot. */
export function districtEffectBpForParcel(
  city,
  state,
  parcelId,
  measure,
  { excludeDistrictId = null, excludeFormationKey = null } = {},
) {
  const identities = parcelEffectIdentities(city, state, parcelId);
  if (!identities.length) return 0;
  let bp = 0;
  for (const formation of state?.districtEngine?.formations ?? []) {
    if (formation.districtId === excludeDistrictId || formation.key === excludeFormationKey) continue;
    if (!formation.footprintBlockIds?.includes(identities[0].blockId)) continue;
    const definition = DISTRICT_DEFINITION_BY_ID[formation.districtId];
    for (const effect of definition?.effects ?? []) {
      if (
        effect.measure === measure
        && identities.some((identity) => receiverAccepts(effect.receiver, identity))
      ) bp += effect.bp;
    }
  }
  return bp;
}

export function districtEffectsForParcel(city, state, parcelId) {
  return Object.freeze({
    valueBp: districtEffectBpForParcel(city, state, parcelId, 'value'),
    rentBp: districtEffectBpForParcel(city, state, parcelId, 'rent'),
  });
}

export function civicCounts(civicUses) {
  return Object.fromEntries(CIVIC_USES.map((use) => [
    use.id,
    civicUses.filter((civic) => civic.useId === use.id).length,
  ]));
}

export function waterTileDistance(parcel, waterEdge, blocksX, blocksZ) {
  const maxGx = blocksX * TILES_PER_BLOCK - 1;
  const maxGz = blocksZ * TILES_PER_BLOCK - 1;
  const tiles = parcel.tiles.map(latticeTile);
  return Math.min(...tiles.map((tile) => {
    if (waterEdge === 'north') return tile.gz + 1;
    if (waterEdge === 'south') return maxGz - tile.gz + 1;
    if (waterEdge === 'west') return tile.gx + 1;
    return maxGx - tile.gx + 1;
  }));
}

export const CIVIC_BAND_PALETTE = Object.freeze([
  '#d9d2bf', // civic ivory
  '#c071c7', // orchid
  '#8d72c9', // violet
  '#d978ad', // magenta
  '#58aaa4', // turquoise
  '#9b8fa6', // civic slate
]);

export const CIVIC_BAND_BY_USE = Object.freeze({
  'school-primary': CIVIC_BAND_PALETTE[0],
  'hospital-district': CIVIC_BAND_PALETTE[1],
  'childcare-centre': CIVIC_BAND_PALETTE[2],
  'police-station': CIVIC_BAND_PALETTE[5],
  'remand-centre': CIVIC_BAND_PALETTE[5],
  courthouse: CIVIC_BAND_PALETTE[0],
  'factory-light': CIVIC_BAND_PALETTE[4],
  'community-recreation': CIVIC_BAND_PALETTE[2],
  'supermarket-strip': CIVIC_BAND_PALETTE[3],
  'cafe-corner': CIVIC_BAND_PALETTE[3],
  'transport-interchange': CIVIC_BAND_PALETTE[4],
  'stock-exchange': CIVIC_BAND_PALETTE[1],
  'missionary-school': CIVIC_BAND_PALETTE[0],
  'officer-school': CIVIC_BAND_PALETTE[5],
  'space-works': CIVIC_BAND_PALETTE[4],
  'international-exchange': CIVIC_BAND_PALETTE[1],
  biolab: CIVIC_BAND_PALETTE[1],
  reserve: CIVIC_BAND_PALETTE[1],
});

export const CIVIC_TILE_METRES = TILE;
