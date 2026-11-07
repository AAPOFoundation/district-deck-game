// District Deck V3.00 — procedural city generation.
// Framework §3. Pure function of (seed, blocksX, blocksZ). The generation ORDER is
// part of the contract: changing it changes every city ever generated.

import { stream, applyBp, hash32 } from './rng.js';
import {
  TILES_PER_BLOCK, PITCH, ROAD, TILE, BLOCK, CORRIDOR,
  parcelId, parseParcelId, tileCentre, globalTile, frontage, cityExtent, snapToCell, CELL,
} from './grid.js';
import { ARCHETYPES, DISTRICTS, RULES, SECTOR_IDS } from './content.js';
import { placeCivicUses, solveAmenityField } from './landuse.js';
// Survey against the existing deterministic T13 terrain authority. These are
// planning/math functions only: no scene, GPU, or browser state participates.
import { planEdgeMassing, surroundHeightAt, waternessAt, creekFieldAt } from '../render/edge-massing.js';
import { FARM_WINDOW } from '../render/land-edge.js';
import {
  CONDITION_LABELS, buildingBaseFor, drawCondition, zoneCeilingStoreys,
  MAP_START_APARTMENT_IDS,
} from './succession.js';

/**
 * Archetypes that may only stand on a corner parcel. The name is the constraint: these four
 * are one building in four periods, and that building is defined by addressing two streets.
 */
const CORNER_ONLY_IDS = new Set([
  'shop-corner',
  'shop-corner-victorian',
  'shop-corner-deco',
  'shop-corner-modern',
]);

/**
 * Street furniture is decoration on a triangle budget. The factory models are
 * hero-fidelity (2.5k-28k triangles each), so weight and cap are tuned by COST, not by
 * how nice each one looks: cheap models carry the density, expensive ones are accents.
 */
/**
 * Scattered footpath furniture. granite-tree-guard is removed entirely — empty
 * pit rings read as mystery dual frames in front of parcels.
 * cast-street-bollard is NOT scattered: streetscape places bollards at junctions only.
 * hoddle-grid-bin is NOT scattered: avenue places one bin per block beside tram signs.
 * city-blackwood-bench is NOT scattered: avenue places one bench per block beside a lamp.
 * city-information-pillar is NOT scattered: one stand per city block (see propsForCity).
 */
const PROP_KINDS = [
  { id: 'melbourne-bike-hoop', weight: 14, cap: 14, offset: 0.2 },   // 10.3k
  { id: 'city-drinking-fountain', weight: 5, cap: 5, offset: 0.0 },  // 17.5k
  { id: 'signal-cabinet', weight: 3, cap: 3, offset: 0.0 },          // 28.5k
];

const PROP_DENSITY = 0.14;   // probability per CELL of footpath run
const PROP_TOTAL_CAP = 110;  // hard ceiling on scattered street furniture

/** Seed 0 only: swap six existing residential parcels onto the V3.50 modern series. */
const SEED0_MODERN_SWAPS = Object.freeze([
  { from: ['cottage-federation', 'bungalow-brighton'], to: 'house-modern-skillion' },
  { from: ['bungalow-californian', 'heritage-federation-villa'], to: 'house-modern-pavilion' },
  { from: ['terrace-single'], to: 'townhouse-modern-brick' },
  { from: ['terrace-double', 'terrace-carlton-heritage'], to: 'townhouse-modern-render' },
  { from: ['walkup-flats'], to: 'apartment-modern-courtyard' },
  { from: ['art-deco-flats'], to: 'apartment-modern-bar' },
]);

function applySeed0ModernReplacements(parcels, order) {
  const used = new Set();
  const next = { ...parcels };
  for (const swap of SEED0_MODERN_SWAPS) {
    const arch = ARCHETYPES[swap.to];
    if (!arch) continue;
    const id = order.find((pid) => {
      if (used.has(pid)) return false;
      return swap.from.includes(next[pid]?.archetypeId);
    }) ?? order.find((pid) => {
      if (used.has(pid) || !next[pid]) return false;
      const cur = ARCHETYPES[next[pid].archetypeId];
      return cur?.sector === 'residential' && !String(next[pid].archetypeId).startsWith('shop');
    });
    if (!id) continue;
    used.add(id);
    const p = next[id];
    next[id] = Object.freeze({
      ...p,
      archetypeId: arch.id,
      landUseId: arch.id,
      sector: arch.sector,
      storeys: arch.storeys,
    });
  }
  return next;
}

const MODULES_PER_PITCH = PITCH / TILE;

export const WATER_EDGES = Object.freeze(['north', 'east', 'south', 'west']);
export const ROW_SIDES = Object.freeze(['north', 'east', 'south', 'west']);

/** V3.02 §1.1. One weighted layout draw per block, in this declared table order. */
export const CORE_USE_WEIGHTS = Object.freeze({
  'fitzroy-north': Object.freeze([
    { id: 'pocket-park', weight: 26 }, { id: 'laneway-court', weight: 30 },
    { id: 'community-garden', weight: 18 }, { id: 'playground', weight: 14 },
    { id: 'car-park', weight: 8 }, { id: 'works-yard', weight: 4 },
  ]),
  'carlton-east': Object.freeze([
    { id: 'pocket-park', weight: 30 }, { id: 'playground', weight: 22 },
    { id: 'community-garden', weight: 20 }, { id: 'laneway-court', weight: 16 },
    { id: 'car-park', weight: 10 }, { id: 'works-yard', weight: 2 },
  ]),
  'richmond-flat': Object.freeze([
    { id: 'works-yard', weight: 26 }, { id: 'laneway-court', weight: 24 },
    { id: 'car-park', weight: 20 }, { id: 'pocket-park', weight: 16 },
    { id: 'playground', weight: 10 }, { id: 'community-garden', weight: 4 },
  ]),
  'brighton-reach': Object.freeze([
    { id: 'works-yard', weight: 32 }, { id: 'car-park', weight: 24 },
    { id: 'laneway-court', weight: 20 }, { id: 'pocket-park', weight: 14 },
    { id: 'playground', weight: 8 }, { id: 'community-garden', weight: 2 },
  ]),
  'docklands-quay': Object.freeze([
    { id: 'car-park', weight: 34 }, { id: 'laneway-court', weight: 26 },
    { id: 'pocket-park', weight: 20 }, { id: 'playground', weight: 12 },
    { id: 'works-yard', weight: 6 }, { id: 'community-garden', weight: 2 },
  ]),
  'brunswick-rise': Object.freeze([
    { id: 'pocket-park', weight: 26 }, { id: 'playground', weight: 24 },
    { id: 'community-garden', weight: 22 }, { id: 'laneway-court', weight: 16 },
    { id: 'car-park', weight: 8 }, { id: 'works-yard', weight: 4 },
  ]),
});

/**
 * A footpath centreline runs straight through every crossing, so a naive scatter drops
 * benches and street trees into the middle of intersections. Nothing stands in a
 * junction module.
 */
function inIntersection(x, z) {
  const i = Math.floor(x / TILE);
  const j = Math.floor(z / TILE);
  return i % MODULES_PER_PITCH === 0 && j % MODULES_PER_PITCH === 0;
}

/** True when both axes sit inside a ROAD strip — full intersection (not just one tile corner). */
function inRoadJunction(x, z) {
  const lx = ((x % PITCH) + PITCH) % PITCH;
  const lz = ((z % PITCH) + PITCH) % PITCH;
  return lx < ROAD && lz < ROAD;
}

/** Local cross-section coordinate of a world position along a vertical (N–S) corridor. */
function localAlongCorridorX(x) {
  return ((x % PITCH) + PITCH) % PITCH;
}

function localAlongCorridorZ(z) {
  return ((z % PITCH) + PITCH) % PITCH;
}

/** Keep a cross-section offset inside the footpath band (never carriageway / tram). */
function clampToFootpathBand(crossLocal) {
  const mid = ROAD / 2;
  if (crossLocal < mid) {
    return Math.min(
      Math.max(crossLocal, CORRIDOR.footpathA[0] + 0.35),
      CORRIDOR.footpathA[1] - 0.35,
    );
  }
  return Math.min(
    Math.max(crossLocal, CORRIDOR.footpathB[0] + 0.35),
    CORRIDOR.footpathB[1] - 0.35,
  );
}

function isWaterSideFootpath(corridor, centre, blocksX, blocksZ) {
  if (!corridor.esplanade) return false;
  if (corridor.axis === 'v' && corridor.index === 0) return centre === CORRIDOR.footpathCentreLow;
  if (corridor.axis === 'v' && corridor.index === blocksX) return centre === CORRIDOR.footpathCentreHigh;
  if (corridor.axis === 'h' && corridor.index === 0) return centre === CORRIDOR.footpathCentreLow;
  if (corridor.axis === 'h' && corridor.index === blocksZ) return centre === CORRIDOR.footpathCentreHigh;
  return false;
}

/**
 * The City is content, not state. Freezing only the root left `parcels`, `order`,
 * `market`, `adjacency` and `corridors` writable, so a renderer bug could rewrite the
 * board mid-run and no test would notice.
 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  // Some generation passes deliberately shallow-freeze their records. Still walk
  // those records so nested generated content (amenity notes/markers in particular)
  // is frozen with the city.
  for (const key of Object.keys(value).sort()) deepFreeze(value[key]);
  if (!Object.isFrozen(value)) Object.freeze(value);
  return value;
}

function roundTo(value, step) {
  return Math.round(value / step) * step;
}

/**
 * V3.10 §3.2. The generation-side meaning of each authored `waterAffinity`.
 *
 * `bandClaim`     the district partitions the block row/column adjacent to the water
 *                 edge before any Voronoi runs.
 * `reachBlocks`   how far past that band the district may hold blocks. A band holder
 *                 is a waterfront district, not a district that happens to start at the
 *                 water: Brighton is a bayside strip, Docklands is a working quarter
 *                 that pushes one block further inland. Non-band districts are
 *                 unrestricted.
 * `minSiteDepth`  the minimum perpendicular distance, in blocks, between the district's
 *                 Voronoi site and the water edge. §3.2 pushes `inland` sites to 1.5.
 * `bandSeatDepth` where inside its own claimed band a band holder's Voronoi site sits,
 *                 measured from the water edge. A band block spans depth 0 to 1, so
 *                 every value here keeps the site inside the claimed run as §3.2
 *                 requires. Brighton is a beach strip and sits toward the water;
 *                 Docklands is a quarter that starts at the wharf and runs back, so it
 *                 sits at the inland face and pulls the first interior row with it.
 *
 * `river` is authored for `richmond-flat`: it may reach water only through a river
 * corridor. DDMG-1 revision 2 authors no river corridor, so on the current board a
 * `river` district simply never holds a band block — the band is fully partitioned
 * between `coastal` and `harbour` before the Voronoi sees it.
 */
const WATER_AFFINITY = Object.freeze({
  coastal: Object.freeze({
    bandClaim: true, reachBlocks: 1, minSiteDepth: 0, bandSeatDepth: 0.5,
  }),
  harbour: Object.freeze({
    bandClaim: true, reachBlocks: 2, minSiteDepth: 0, bandSeatDepth: 0.95,
  }),
  river: Object.freeze({
    bandClaim: false, reachBlocks: Infinity, minSiteDepth: 0, bandSeatDepth: null,
  }),
  inland: Object.freeze({
    bandClaim: false, reachBlocks: Infinity, minSiteDepth: 1.5, bandSeatDepth: null,
  }),
});

/** The coastal band: the single block row or column that fronts the water, in order. */
function waterEdgeBandCells(waterEdge, blocksX, blocksZ) {
  const cells = [];
  if (waterEdge === 'north') for (let bx = 0; bx < blocksX; bx += 1) cells.push({ bx, bz: 0 });
  else if (waterEdge === 'south') for (let bx = 0; bx < blocksX; bx += 1) cells.push({ bx, bz: blocksZ - 1 });
  else if (waterEdge === 'west') for (let bz = 0; bz < blocksZ; bz += 1) cells.push({ bx: 0, bz });
  else for (let bz = 0; bz < blocksZ; bz += 1) cells.push({ bx: blocksX - 1, bz });
  return cells;
}

/** Perpendicular distance from the water edge to a block centre, in block units. */
function blockWaterDepth(waterEdge, blocksX, blocksZ, bx, bz) {
  if (waterEdge === 'north') return bz + 0.5;
  if (waterEdge === 'south') return blocksZ - bz - 0.5;
  if (waterEdge === 'west') return bx + 0.5;
  return blocksX - bx - 0.5;
}

/** Place a continuous site at a given perpendicular distance from the water edge. */
function siteAtWaterDepth(waterEdge, blocksX, blocksZ, x, z, depth) {
  if (waterEdge === 'north') return { x, z: depth };
  if (waterEdge === 'south') return { x, z: blocksZ - depth };
  if (waterEdge === 'west') return { x: depth, z };
  return { x: blocksX - depth, z };
}

/**
 * V3.10 §3.2 stage 1 — the coastal band claim.
 *
 * §3.2 authors ⌈0.55 × edgeLength⌉ blocks for `brighton-reach` and ⌈0.30 × edgeLength⌉
 * for `docklands-quay`. Those two figures only fit inside the band from edgeLength 5
 * upward; the shipped DDMG-1 board is 4×4, where they demand 3 + 2 = 5 of 4 blocks.
 * The band cannot be over-subscribed, so below that threshold `docklands-quay` keeps
 * its authored run and `brighton-reach` takes the largest run the band can still carry
 * above the G-2 floor of ⌈0.40 × edgeLength⌉. The overflow is recorded on the returned
 * record and reported in the ledger rather than silently rounded away.
 *
 * Exactly one layout draw is consumed, for the end of the band `docklands-quay` claims.
 * §3.2's midpoint jitter for `brighton-reach` has no slack to move inside: the same
 * paragraph gives every remaining block to `brighton-reach`, so the two runs always
 * partition the band exactly and no second draw exists to make.
 */
function claimWaterEdgeBand(rng, waterEdge, blocksX, blocksZ) {
  // Which district claims which run is read out of the authored `waterAffinity`, never
  // named here. That field exists so the rule and the content cannot disagree.
  const coastal = DISTRICTS.find(({ waterAffinity }) => waterAffinity === 'coastal');
  const harbour = DISTRICTS.find(({ waterAffinity }) => waterAffinity === 'harbour');
  if (!coastal || !harbour) throw new Error('GEOGRAPHY_MISSING_WATER_AFFINITY');
  const cells = waterEdgeBandCells(waterEdge, blocksX, blocksZ);
  const edgeLength = cells.length;
  const coastalTarget = Math.ceil(0.55 * edgeLength);
  const harbourTarget = Math.ceil(0.30 * edgeLength);
  const oversubscribed = coastalTarget + harbourTarget > edgeLength;
  const coastalRun = oversubscribed
    ? Math.max(Math.ceil(0.40 * edgeLength), edgeLength - harbourTarget)
    : edgeLength - harbourTarget;
  const harbourRun = edgeLength - coastalRun;

  const harbourAtLowEnd = rng.int(0, 1) === 0;
  const harbourCells = harbourAtLowEnd
    ? cells.slice(0, harbourRun)
    : cells.slice(edgeLength - harbourRun);
  const coastalCells = harbourAtLowEnd
    ? cells.slice(harbourRun)
    : cells.slice(0, edgeLength - harbourRun);

  const byDistrict = new Map([
    [coastal.id, coastalCells],
    [harbour.id, harbourCells],
  ]);
  const byBlock = new Map();
  for (const [districtId, claimed] of byDistrict) {
    for (const { bx, bz } of claimed) byBlock.set(`${bx},${bz}`, districtId);
  }
  return {
    edge: waterEdge,
    edgeLength,
    axis: waterEdge === 'north' || waterEdge === 'south' ? 'x' : 'z',
    coastalTarget,
    harbourTarget,
    oversubscribed,
    harbourAtLowEnd,
    byDistrict,
    byBlock,
    cells,
  };
}

function blockCentroid(cells) {
  return {
    x: cells.reduce((sum, cell) => sum + cell.bx + 0.5, 0) / cells.length,
    z: cells.reduce((sum, cell) => sum + cell.bz + 0.5, 0) / cells.length,
  };
}

function orthogonalNeighbours(bx, bz, blocksX, blocksZ) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dz]) => ({ bx: bx + dx, bz: bz + dz }))
    .filter(({ bx: nx, bz: nz }) => nx >= 0 && nz >= 0 && nx < blocksX && nz < blocksZ);
}

/** Orthogonally connected components of one district's block set, in scan order. */
function districtComponents(byBlock, districtId, blocksX, blocksZ) {
  const own = [];
  for (let bz = 0; bz < blocksZ; bz += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      if (byBlock.get(`${bx},${bz}`) === districtId) own.push(`${bx},${bz}`);
    }
  }
  const remaining = new Set(own);
  const components = [];
  for (const start of own) {
    if (!remaining.has(start)) continue;
    const component = [];
    const queue = [start];
    remaining.delete(start);
    while (queue.length) {
      const key = queue.shift();
      component.push(key);
      const [bx, bz] = key.split(',').map(Number);
      for (const neighbour of orthogonalNeighbours(bx, bz, blocksX, blocksZ)) {
        const nKey = `${neighbour.bx},${neighbour.bz}`;
        if (!remaining.has(nKey)) continue;
        remaining.delete(nKey);
        queue.push(nKey);
      }
    }
    components.push(component.sort());
  }
  return components;
}

/**
 * G-3 repair. A nearest-site Voronoi over a partially pre-claimed grid can strand a
 * district block behind another district's cell; the pre-V3.10 generator stranded one
 * on 38 of 200 seeds and nothing caught it. Every district keeps exactly one anchor
 * component — its band run when it holds one, otherwise its largest component — and
 * every stranded block is handed to the adjacent district that already owns the most
 * of its orthogonal neighbourhood inside an anchor component. Deterministic throughout:
 * blocks are visited in scan order and ties break on the authored DISTRICTS order.
 */
function repairDistrictConnectivity(byBlock, band, blocksX, blocksZ) {
  const rank = new Map(DISTRICTS.map((district, index) => [district.id, index]));
  const reachOf = new Map(DISTRICTS.map((district) => [
    district.id,
    WATER_AFFINITY[district.waterAffinity].reachBlocks,
  ]));
  let repairs = 0;
  for (let pass = 0; pass <= blocksX * blocksZ; pass += 1) {
    const anchored = new Set();
    const stranded = [];
    for (const district of DISTRICTS) {
      const components = districtComponents(byBlock, district.id, blocksX, blocksZ);
      if (!components.length) continue;
      const claimed = band.byDistrict.get(district.id) ?? [];
      const anchorKey = claimed.length ? `${claimed[0].bx},${claimed[0].bz}` : null;
      const anchor = anchorKey
        ? components.find((component) => component.includes(anchorKey))
        : [...components].sort((left, right) =>
          right.length - left.length || left[0].localeCompare(right[0]))[0];
      for (const key of anchor) anchored.add(key);
      for (const component of components) {
        if (component === anchor) continue;
        for (const key of component) stranded.push(key);
      }
    }
    if (!stranded.length) return repairs;

    let moved = false;
    for (const key of stranded.sort()) {
      const [bx, bz] = key.split(',').map(Number);
      const depth = blockWaterDepth(band.edge, blocksX, blocksZ, bx, bz);
      const tally = new Map();
      for (const neighbour of orthogonalNeighbours(bx, bz, blocksX, blocksZ)) {
        const nKey = `${neighbour.bx},${neighbour.bz}`;
        if (!anchored.has(nKey)) continue;
        const districtId = byBlock.get(nKey);
        if (depth > 0.5 + reachOf.get(districtId)) continue;
        tally.set(districtId, (tally.get(districtId) ?? 0) + 1);
      }
      if (!tally.size) continue;
      const [winner] = [...tally.entries()].sort((left, right) =>
        right[1] - left[1] || rank.get(left[0]) - rank.get(right[0]));
      byBlock.set(key, winner[0]);
      repairs += 1;
      moved = true;
      break;
    }
    if (!moved) {
      throw new Error(`GEOGRAPHY_UNREPAIRABLE:${band.edge}:${stranded.sort()[0]}`);
    }
  }
  throw new Error(`GEOGRAPHY_REPAIR_DID_NOT_SETTLE:${band.edge}`);
}

/**
 * V3.10 §3.2. Two-stage assignment: the coastal band is partitioned by authored water
 * affinity first, then the remaining blocks run the jittered-site Voronoi with `inland`
 * sites pushed off the edge and the band holders seated inside their own claimed run so
 * their interior spread stays contiguous with it.
 */
function assignDistricts(rng, blocksX, blocksZ, waterEdge) {
  const band = claimWaterEdgeBand(rng, waterEdge, blocksX, blocksZ);
  // The band holders are seated inside their own claimed run, so the jittered grid is
  // laid out over the interior for the districts that actually contest it. Reusing the
  // six-cell grid with two holes in it hands the vacated cells to whichever district
  // happens to sit next to them, which is how brunswick-rise ended up over its G-4
  // ceiling on the first cut of this rule.
  const interior = DISTRICTS.filter((district) =>
    !(WATER_AFFINITY[district.waterAffinity].bandClaim
      && (band.byDistrict.get(district.id) ?? []).length));
  const interiorRank = new Map(interior.map((district, index) => [district.id, index]));
  const cols = Math.ceil(Math.sqrt(interior.length));
  const rows = Math.ceil(interior.length / cols);
  const alongExtent = waterEdge === 'north' || waterEdge === 'south' ? blocksX : blocksZ;
  const depthExtent = waterEdge === 'north' || waterEdge === 'south' ? blocksZ : blocksX;
  const sites = DISTRICTS.map((district) => {
    // Both jitter draws are unconditional and taken in authored DISTRICTS order, so the
    // layout stream position never depends on which affinity a district carries.
    const rank = interiorRank.get(district.id) ?? 0;
    const alongFraction = ((rank % cols) + 0.5) / cols;
    const depthFraction = (Math.floor(rank / cols) + 0.5) / rows;
    const along = (alongFraction + rng.range(-0.18, 0.18)) * alongExtent;
    // The interior starts one block in from the water, so the depth grid spans
    // [1, depthExtent] rather than the whole board.
    const depth = 1 + (depthFraction + rng.range(-0.18, 0.18)) * (depthExtent - 1);
    const affinity = WATER_AFFINITY[district.waterAffinity];
    const claimed = band.byDistrict.get(district.id);
    if (affinity.bandClaim && claimed?.length) {
      const centroid = blockCentroid(claimed);
      return {
        district,
        ...siteAtWaterDepth(
          waterEdge,
          blocksX,
          blocksZ,
          centroid.x,
          centroid.z,
          affinity.bandSeatDepth,
        ),
        seatedInBand: true,
      };
    }
    const placed = siteAtWaterDepth(
      waterEdge,
      blocksX,
      blocksZ,
      waterEdge === 'north' || waterEdge === 'south' ? along : 0,
      waterEdge === 'north' || waterEdge === 'south' ? 0 : along,
      Math.max(depth, affinity.minSiteDepth),
    );
    return { district, ...placed, seatedInBand: false };
  });

  const byBlockId = new Map();
  for (let bz = 0; bz < blocksZ; bz += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      const key = `${bx},${bz}`;
      const claimedBy = band.byBlock.get(key);
      if (claimedBy) { byBlockId.set(key, claimedBy); continue; }
      const depth = blockWaterDepth(waterEdge, blocksX, blocksZ, bx, bz);
      let best = null;
      let bestD = Infinity;
      for (const site of sites) {
        if (depth > 0.5 + WATER_AFFINITY[site.district.waterAffinity].reachBlocks) continue;
        const dx = bx + 0.5 - site.x;
        const dz = bz + 0.5 - site.z;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = site; }
      }
      if (!best) throw new Error(`GEOGRAPHY_NO_ELIGIBLE_DISTRICT:${key}`);
      byBlockId.set(key, best.district.id);
    }
  }
  const repairs = repairDistrictConnectivity(byBlockId, band, blocksX, blocksZ);

  const districtById = new Map(DISTRICTS.map((district) => [district.id, district]));
  const byBlock = new Map(
    [...byBlockId.entries()].map(([key, id]) => [key, districtById.get(id)]),
  );
  return { byBlock, sites, band, repairs };
}

/**
 * Read-only presentation metadata for V3.10 §3.4. The renderer needs to know which
 * blocks front the water and which district owns each run so the seawall, beach and
 * wharf treatments land on the right band; it must never recompute that itself.
 */
function waterEdgeBandRecord(band, blocksX, blocksZ) {
  return {
    edge: band.edge,
    axis: band.axis,
    edgeLength: band.edgeLength,
    coastalTargetBlocks: band.coastalTarget,
    harbourTargetBlocks: band.harbourTarget,
    targetsOversubscribed: band.oversubscribed,
    harbourAtLowEnd: band.harbourAtLowEnd,
    blocks: band.cells.map(({ bx, bz }, index) => ({
      bx,
      bz,
      index,
      districtId: band.byBlock.get(`${bx},${bz}`) ?? null,
      bounds: {
        minX: ROAD + bx * PITCH,
        maxX: ROAD + bx * PITCH + BLOCK,
        minZ: ROAD + bz * PITCH,
        maxZ: ROAD + bz * PITCH + BLOCK,
      },
    })),
    runs: [...band.byDistrict.entries()]
      .filter(([, cells]) => cells.length)
      .map(([districtId, cells]) => ({
        districtId,
        blocks: cells.map(({ bx, bz }) => ({ bx, bz })),
        length: cells.length,
        share: cells.length / band.edgeLength,
      }))
      .sort((left, right) => left.districtId.localeCompare(right.districtId)),
    // `null` means unlimited. Infinity has no JSON form, so it is written out rather
    // than left to serialise into a null by accident.
    interiorDepthLimitBlocks: Object.fromEntries(
      DISTRICTS.map((district) => {
        const { reachBlocks } = WATER_AFFINITY[district.waterAffinity];
        return [district.id, Number.isFinite(reachBlocks) ? reachBlocks : null];
      }),
    ),
    waterAffinityByDistrict: Object.fromEntries(
      DISTRICTS.map((district) => [district.id, district.waterAffinity]),
    ),
    blocksX,
    blocksZ,
  };
}

function crossingAdjacentInteriorBlocks(blocksX, blocksZ, verticalIndex, horizontalIndex) {
  const blocks = [];
  for (const bz of [horizontalIndex - 1, horizontalIndex]) {
    for (const bx of [verticalIndex - 1, verticalIndex]) {
      if (bx <= 0 || bx >= blocksX - 1 || bz <= 0 || bz >= blocksZ - 1) continue;
      blocks.push({ bx, bz });
    }
  }
  return blocks;
}

function crossingLeavesReserveCandidate(blocksX, blocksZ, verticalIndex, horizontalIndex) {
  const interiorCount = Math.max(0, blocksX - 2) * Math.max(0, blocksZ - 2);
  return crossingAdjacentInteriorBlocks(
    blocksX,
    blocksZ,
    verticalIndex,
    horizontalIndex,
  ).length < interiorCount;
}

/** Corridors are the road runs between blocks. One N-S and one E-W carry trams. */
function buildCorridors(rng, blocksX, blocksZ, waterEdge) {
  const vertical = [];
  const horizontal = [];
  for (let i = 0; i <= blocksX; i += 1) {
    vertical.push({
      id: `v${i}`, index: i, axis: 'v', tram: false,
      esplanade: (waterEdge === 'west' && i === 0) || (waterEdge === 'east' && i === blocksX),
    });
  }
  for (let j = 0; j <= blocksZ; j += 1) {
    horizontal.push({
      id: `h${j}`, index: j, axis: 'h', tram: false,
      esplanade: (waterEdge === 'north' && j === 0) || (waterEdge === 'south' && j === blocksZ),
    });
  }

  // Interior corridors only — the outer ring is a boundary road, not a tram route.
  const interiorV = vertical.filter((c) => c.index > 0 && c.index < blocksX);
  const interiorH = horizontal.filter((c) => c.index > 0 && c.index < blocksZ);
  let tramV = interiorV.length ? rng.pick(interiorV) : null;
  const tramH = interiorH.length ? rng.pick(interiorH) : null;
  if (
    tramV
    && tramH
    && !crossingLeavesReserveCandidate(blocksX, blocksZ, tramV.index, tramH.index)
  ) {
    // A central crossing on the 4×4 board fronts all four interior blocks, leaving no
    // legal reserve. Resolve that degenerate topology without another layout draw:
    // retain the horizontal draw and take the first vertical corridor that leaves a
    // candidate. Draw count and every later layout-stream position stay unchanged.
    tramV = interiorV.find((corridor) =>
      crossingLeavesReserveCandidate(blocksX, blocksZ, corridor.index, tramH.index)) ?? tramV;
  }
  if (tramV) tramV.tram = true;
  if (tramH) tramH.tram = true;

  return { vertical, horizontal };
}

function reserveForCity(rng, blocksX, blocksZ, corridors) {
  if (blocksX < 3 || blocksZ < 3) return null;
  const tramV = corridors.vertical.find((corridor) => corridor.tram);
  const tramH = corridors.horizontal.find((corridor) => corridor.tram);
  const tramCrossingBlocks = tramV && tramH
    ? crossingAdjacentInteriorBlocks(blocksX, blocksZ, tramV.index, tramH.index)
    : [];
  const crossingAdjacent = new Set(
    tramCrossingBlocks.map(({ bx, bz }) => `${bx},${bz}`),
  );
  const candidates = [];
  for (let bz = 1; bz < blocksZ - 1; bz += 1) {
    for (let bx = 1; bx < blocksX - 1; bx += 1) {
      if (crossingAdjacent.has(`${bx},${bz}`)) continue;
      candidates.push({ bx, bz });
    }
  }
  if (!candidates.length) return null;
  const chosen = rng.pick(candidates);
  const blockX = ROAD + chosen.bx * PITCH;
  const blockZ = ROAD + chosen.bz * PITCH;
  return {
    id: `reserve-${chosen.bx}-${chosen.bz}`,
    ...chosen,
    // Keep the singular field as a compatibility alias while exposing the complete
    // corridor-to-block adjacency that governs reserve exclusion.
    tramCrossingBlock: tramCrossingBlocks[0] ?? null,
    tramCrossingBlocks,
    centre: { x: blockX + BLOCK / 2, z: blockZ + BLOCK / 2 },
    bounds: { minX: blockX, maxX: blockX + BLOCK, minZ: blockZ, maxZ: blockZ + BLOCK },
  };
}

function isReserveBlock(reserve, bx, bz) {
  return Boolean(reserve && reserve.bx === bx && reserve.bz === bz);
}

/**
 * Each ROW uses one fixed tile boundary for its side. The convention turns clockwise
 * around the block, needs no extra random draw, and leaves exactly two flanking parcels.
 */
function rightOfWayForBlock(rng, bx, bz) {
  const side = rng.pick(ROW_SIDES);
  const minX = ROAD + bx * PITCH;
  const minZ = ROAD + bz * PITCH;
  const core = tileCentre(bx, bz, 1, 1);
  const definitions = {
    north: {
      axis: 'z', setbackAxis: 'x',
      flanking: [[0, 0, -0.5], [1, 0, 0.5]],
      centre: { x: minX + TILE, z: (bz * PITCH + CORRIDOR.kerbHigh + (core.z - TILE / 2)) / 2 },
      length: core.z - TILE / 2 - (bz * PITCH + CORRIDOR.kerbHigh),
    },
    east: {
      axis: 'x', setbackAxis: 'z',
      flanking: [[2, 0, -0.5], [2, 1, 0.5]],
      centre: { x: (core.x + TILE / 2 + ((bx + 1) * PITCH + CORRIDOR.kerbLow)) / 2, z: minZ + TILE },
      length: (bx + 1) * PITCH + CORRIDOR.kerbLow - (core.x + TILE / 2),
    },
    south: {
      axis: 'z', setbackAxis: 'x',
      flanking: [[1, 2, -0.5], [2, 2, 0.5]],
      centre: { x: minX + TILE * 2, z: (core.z + TILE / 2 + ((bz + 1) * PITCH + CORRIDOR.kerbLow)) / 2 },
      length: (bz + 1) * PITCH + CORRIDOR.kerbLow - (core.z + TILE / 2),
    },
    west: {
      axis: 'x', setbackAxis: 'z',
      flanking: [[0, 1, -0.5], [0, 2, 0.5]],
      centre: { x: (bx * PITCH + CORRIDOR.kerbHigh + (core.x - TILE / 2)) / 2, z: minZ + TILE * 2 },
      length: core.x - TILE / 2 - (bx * PITCH + CORRIDOR.kerbHigh),
    },
  };
  const definition = definitions[side];
  return {
    id: `row-${bx}-${bz}`,
    bx,
    bz,
    side,
    width: 3,
    surface: 'bluestone-pitchers',
    ...definition,
    flankingParcels: definition.flanking.map(([tx, tz, offset]) => ({
      parcelId: parcelId(bx, bz, tx, tz),
      modelOffset: definition.setbackAxis === 'x' ? { x: offset, z: 0 } : { x: 0, z: offset },
    })),
  };
}

function blockCoresForCity(rng, blocksX, blocksZ, districtByBlock, reserve) {
  const cores = [];
  const rightsOfWay = [];
  for (let bz = 0; bz < blocksZ; bz += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      const district = districtByBlock.get(`${bx},${bz}`);
      const drawnUseId = rng.weighted(CORE_USE_WEIGHTS[district.id]).id;
      const rightOfWay = rightOfWayForBlock(rng, bx, bz);
      cores.push({
        id: `core-${bx}-${bz}`,
        bx,
        bz,
        tx: 1,
        tz: 1,
        districtId: district.id,
        useId: isReserveBlock(reserve, bx, bz) ? 'reserve-rotunda' : drawnUseId,
        drawnUseId,
        centre: tileCentre(bx, bz, 1, 1),
        rightOfWayId: rightOfWay.id,
      });
      rightsOfWay.push(rightOfWay);
    }
  }
  return { cores: decorateBlockCores(cores), rightsOfWay };
}

/**
 * Dress cores after the weight-table draw. Consumes no layout RNG: parcel stock,
 * civic walk and later layout draws stay where they were.
 *
 * - `drawnUseId` is the weight-table result (tests lock that table).
 * - `useId` is the dressed type the amenity field and renderer read.
 * - Two industrial cores become sewerage plants so every city shows the new
 *   depressor; variants alternate by sorted id so two instances of a type
 *   are never the same model.
 */
const SEWER_CANDIDATE_USES = Object.freeze(['works-yard', 'laneway-court', 'car-park']);

/**
 * Prefer an unused core type until every amenity in the roster has appeared.
 * After that, duplicates are allowed. Reserve rotundas are left alone.
 */
function diversifyCoreUses(cores) {
  const roster = [...new Set(
    Object.values(CORE_USE_WEIGHTS).flatMap((rows) => rows.map((row) => row.id)),
  )];
  const used = new Set();
  const next = cores.map((core) => ({ ...core }));
  for (const core of next) {
    if (core.useId === 'reserve-rotunda' || core.useId === 'sewerage-plant') continue;
    if (!used.has(core.useId)) {
      used.add(core.useId);
      continue;
    }
    const districtRows = CORE_USE_WEIGHTS[core.districtId] ?? [];
    const unusedLocal = districtRows
      .filter((row) => !used.has(row.id))
      .sort((a, b) => b.weight - a.weight);
    const unusedGlobal = roster.filter((id) => !used.has(id));
    const pick = unusedLocal[0]?.id ?? unusedGlobal[0];
    if (!pick) continue;
    core.useId = pick;
    used.add(pick);
  }
  return next;
}

function preferUnusedRows(weights, used) {
  const unused = weights.filter((row) => !used.has(row.id));
  return unused.length ? unused : weights;
}

function padArea(parcel) {
  const gf = parcel.groundFootprint ?? parcel.footprint ?? [1, 1];
  return (gf[0] ?? 1) * (gf[1] ?? 1);
}

function isOneByOneFootprint(archetypeId) {
  const arch = ARCHETYPES[archetypeId];
  return Boolean(arch && arch.footprint[0] === 1 && arch.footprint[1] === 1);
}

/**
 * Authored 1×2 identities the board still draws at that envelope. Hammerbarn is a
 * commissioned GLB; the loft is the legacy kit, which ignores lot span and builds
 * `ARCHETYPES[id].footprint` ([1, 2], 15 × 31 m). `warehouse-brick` is also authored
 * [1, 2], but the industrial kit resizes it to the parcel — these two do not.
 */
const STRICT_TWO_TILE_IDS = new Set([
  'hammerbarn',
  'warehouse-richmond-loft',
]);

function skinParcel(parcel, archetypeId) {
  const arch = ARCHETYPES[archetypeId];
  if (!arch) return parcel;
  const gf = parcel.groundFootprint ?? parcel.footprint ?? [1, 1];
  const pad = Object.freeze([gf[0] ?? 1, gf[1] ?? 1]);
  if (STRICT_TWO_TILE_IDS.has(archetypeId) && pad[0] * pad[1] < 2) return parcel;
  return Object.freeze({
    ...parcel,
    archetypeId: arch.id,
    landUseId: arch.id,
    sector: arch.sector,
    storeys: arch.storeys,
    footprint: pad,
    groundFootprint: pad,
  });
}

const WAREHOUSE_ROSTER = Object.freeze([
  'hammerbarn',
  'warehouse-brick',
  'warehouse-richmond-loft',
]);
const WAREHOUSE_IDS = new Set([
  ...WAREHOUSE_ROSTER,
  'warehouse-converted',
]);
const TALL_WALKUP_IDS = Object.freeze([
  'walkup-beaux-arts',
  'walkup-moderne',
  'art-deco-flats',
]);

export function decorateBlockCores(cores) {
  const industrial = cores
    .filter((core) => core.useId !== 'reserve-rotunda' && SEWER_CANDIDATE_USES.includes(core.useId))
    .slice()
    .sort((a, b) => {
      const ha = hash32(`core-sewer:${a.id}`);
      const hb = hash32(`core-sewer:${b.id}`);
      return ha - hb || a.id.localeCompare(b.id);
    });
  const sewerIds = new Set(industrial.slice(0, 2).map((core) => core.id));
  const sewersOn = cores.map((core) => ({
    ...core,
    useId: sewerIds.has(core.id) ? 'sewerage-plant' : core.useId,
  }));
  const dressed = diversifyCoreUses(sewersOn);
  const byUse = new Map();
  for (const core of dressed) {
    if (!byUse.has(core.useId)) byUse.set(core.useId, []);
    byUse.get(core.useId).push(core);
  }
  const variantOf = new Map();
  for (const list of byUse.values()) {
    list.sort((a, b) => a.id.localeCompare(b.id));
    list.forEach((core, index) => variantOf.set(core.id, index % 2));
  }
  return dressed.map((core) => Object.freeze({
    ...core,
    variant: variantOf.get(core.id) ?? 0,
  }));
}

function rowPlacementByParcel(rightsOfWay) {
  const placements = new Map();
  for (const rightOfWay of rightsOfWay) {
    for (const flank of rightOfWay.flankingParcels) {
      placements.set(flank.parcelId, {
        rightOfWayId: rightOfWay.id,
        rightOfWaySide: rightOfWay.side,
        setbackAxis: rightOfWay.setbackAxis,
        envelopeMetres: 13.5,
        modelOffset: flank.modelOffset,
      });
    }
  }
  return placements;
}

function modelPlacement(groundFootprint, rotationDeg, rowPlacement) {
  const envelope = {
    x: groundFootprint[0] * TILE - 1,
    z: groundFootprint[1] * TILE - 1,
  };
  const turned = rotationDeg % 180 !== 0;
  const worldScale = { x: 1, z: 1 };
  if (rowPlacement) {
    envelope[rowPlacement.setbackAxis] = 13.5;
    worldScale[rowPlacement.setbackAxis] = 13.5 / 15;
  }
  const localScale = turned
    ? { x: worldScale.z, y: 1, z: worldScale.x }
    : { x: worldScale.x, y: 1, z: worldScale.z };
  return {
    source: 'ddmg-footprint',
    envelopeMetres: envelope,
    modelScale: localScale,
    rowScaleFactor: rowPlacement ? 13.5 / 15 : null,
    rowAxis: rowPlacement?.setbackAxis ?? null,
    modelOffset: rowPlacement?.modelOffset ?? { x: 0, z: 0 },
    rightOfWayId: rowPlacement?.rightOfWayId ?? null,
    rightOfWaySide: rowPlacement?.rightOfWaySide ?? null,
  };
}

/**
 * A rotated building claims rotated ground. A 1x2 warehouse turned to face an
 * east-west street runs its long axis along X, so the claimed tiles and model agree.
 */
function orientedFootprint(footprint, rotationDeg) {
  const [fx, fz] = footprint;
  return rotationDeg % 180 === 0 ? [fx, fz] : [fz, fx];
}

/** Tiles a multi-tile archetype would occupy, anchored inside one block. */
function footprintTiles(bx, bz, tx, tz, footprint) {
  const [fx, fz] = footprint;
  const tiles = [];
  for (let dz = 0; dz < fz; dz += 1) {
    for (let dx = 0; dx < fx; dx += 1) {
      const ntx = tx + dx;
      const ntz = tz + dz;
      if (ntx >= TILES_PER_BLOCK || ntz >= TILES_PER_BLOCK) return null;
      tiles.push(parcelId(bx, bz, ntx, ntz));
    }
  }
  return tiles;
}

function nonTradeableTile(id, reserve) {
  const { bx, bz, tx, tz } = parseParcelId(id);
  return (tx === 1 && tz === 1) || isReserveBlock(reserve, bx, bz);
}

/**
 * A footprint may touch one side of one ROW, but may neither cross the ROW nor use
 * the ROW setback on its long axis. That keeps the sole runtime scale exactly the
 * declared 15 m -> 13.5 m single-axis narrowing.
 */
function rowPlacementForFootprint(tiles, footprint, rowByParcel) {
  const placements = tiles.map((id) => rowByParcel.get(id)).filter(Boolean);
  if (placements.length === 0) return { valid: true, placement: null };
  if (placements.length > 1) return { valid: false, placement: null };
  const placement = placements[0];
  const axisIndex = placement.setbackAxis === 'x' ? 0 : 1;
  if (footprint[axisIndex] !== 1) return { valid: false, placement: null };
  return { valid: true, placement };
}

function tileFrontsTram(corridors, bx, bz, tx, tz) {
  const last = TILES_PER_BLOCK - 1;
  const fronted = [];
  if (tx === 0) fronted.push(corridors.vertical[bx]);
  if (tx === last) fronted.push(corridors.vertical[bx + 1]);
  if (tz === 0) fronted.push(corridors.horizontal[bz]);
  if (tz === last) fronted.push(corridors.horizontal[bz + 1]);
  return fronted.some((c) => c && c.tram);
}

function parcelTileFrontsTram(corridors, id) {
  const position = parseParcelId(id);
  return tileFrontsTram(
    corridors,
    position.bx,
    position.bz,
    position.tx,
    position.tz,
  );
}

function propsForCity(rng, blocksX, blocksZ, corridors) {
  const props = [];
  const extent = cityExtent(blocksX, blocksZ);
  const used = new Map();

  /**
   * Place on a vertical (N–S) corridor footpath: X is locked to the footpath band,
   * Z snaps along the run. Never in a road junction or on carriageway/tram.
   */
  const placeVerticalFootpath = (baseX, footpathCentre, z, rotation) => {
    if (props.length >= PROP_TOTAL_CAP) return;
    const zSnap = snapToCell(z);
    if (inRoadJunction(baseX + footpathCentre, zSnap)) return;
    if (inIntersection(snapToCell(baseX + footpathCentre), zSnap)) return;
    const available = PROP_KINDS.filter((k) => (used.get(k.id) ?? 0) < k.cap);
    if (!available.length) return;
    const kind = rng.weighted(available);
    used.set(kind.id, (used.get(kind.id) ?? 0) + 1);
    // Offset is toward the kerb but clamped inside the footpath band.
    const cross = clampToFootpathBand(footpathCentre + kind.offset);
    props.push({
      model: kind.id,
      x: +(baseX + cross).toFixed(3),
      z: +zSnap.toFixed(3),
      rotation,
    });
  };

  const placeHorizontalFootpath = (baseZ, footpathCentre, x, rotation) => {
    if (props.length >= PROP_TOTAL_CAP) return;
    const xSnap = snapToCell(x);
    if (inRoadJunction(xSnap, baseZ + footpathCentre)) return;
    if (inIntersection(xSnap, snapToCell(baseZ + footpathCentre))) return;
    const available = PROP_KINDS.filter((k) => (used.get(k.id) ?? 0) < k.cap);
    if (!available.length) return;
    const kind = rng.weighted(available);
    used.set(kind.id, (used.get(kind.id) ?? 0) + 1);
    const cross = clampToFootpathBand(footpathCentre + kind.offset);
    props.push({
      model: kind.id,
      x: +xSnap.toFixed(3),
      z: +(baseZ + cross).toFixed(3),
      rotation,
    });
  };

  // Footpath runs on both sides of every corridor, populated at ~1 prop per 3 CELLs.
  for (const corridor of corridors.vertical) {
    const baseX = corridor.index * PITCH;
    for (const centre of [CORRIDOR.footpathCentreLow, CORRIDOR.footpathCentreHigh]) {
      if (isWaterSideFootpath(corridor, centre, blocksX, blocksZ)) continue;
      for (let z = CELL / 2; z < extent.z; z += CELL) {
        if (rng.unit() > PROP_DENSITY) continue;
        placeVerticalFootpath(baseX, centre, z, centre < TILE / 2 ? 90 : 270);
      }
    }
  }
  for (const corridor of corridors.horizontal) {
    const baseZ = corridor.index * PITCH;
    for (const centre of [CORRIDOR.footpathCentreLow, CORRIDOR.footpathCentreHigh]) {
      if (isWaterSideFootpath(corridor, centre, blocksX, blocksZ)) continue;
      for (let x = CELL / 2; x < extent.x; x += CELL) {
        if (rng.unit() > PROP_DENSITY) continue;
        placeHorizontalFootpath(baseZ, centre, x, centre < TILE / 2 ? 180 : 0);
      }
    }
  }

  // One Melbourne city information stand per city block — mid-block on the west
  // footpath of the road east of the block (corridor bx+1 low kerb faces block bx).
  // Deterministic roster; not part of the weighted scatter stream.
  for (let bx = 0; bx < blocksX; bx += 1) {
    for (let bz = 0; bz < blocksZ; bz += 1) {
      // Corridor index east of block = bx + 1; low kerb = western footpath of that road
      // = eastern frontage of the block. Mid-block along Z (clear of junctions).
      const corridorIndex = bx + 1;
      if (corridorIndex > blocksX) continue;
      const x = corridorIndex * PITCH + clampToFootpathBand(CORRIDOR.footpathCentreLow);
      const z = ROAD + bz * PITCH + BLOCK / 2;
      if (inRoadJunction(x, z) || inIntersection(snapToCell(x), snapToCell(z))) continue;
      props.push({
        model: 'city-information-pillar',
        x: +x.toFixed(3),
        z: +z.toFixed(3),
        rotation: 90, // face the footpath / block frontage
      });
    }
  }

  return props;
}

const TREE_SPECIES = [
  { id: 'australian-eucalyptus', weight: 32 },
  { id: 'australian-jacaranda', weight: 25 },
  { id: 'australian-bottlebrush', weight: 18 },
  { id: 'plane-tree-london', weight: 25 },
];

/**
 * Street trees on the footpath centrelines, one per tile frontage with deterministic
 * gaps so the avenue has rhythm rather than a hedge. Visual only, own draw from the
 * props stream, and cheap enough to keep their shadows.
 */
function treesForCity(rng, blocksX, blocksZ, corridors) {
  const trees = [];
  const extent = cityExtent(blocksX, blocksZ);

  const place = (x, z) => {
    if (inIntersection(x, z)) return;   // never in a junction
    if (rng.unit() < 0.34) return;      // gaps for driveways, crossings, stops
    const species = rng.weighted(TREE_SPECIES);
    trees.push({
      model: species.id,
      x: +x.toFixed(3),
      z: +z.toFixed(3),
      rotation: rng.int(0, 3) * 90,
      scale: +(0.86 + rng.unit() * 0.34).toFixed(3),
    });
  };

  for (const corridor of corridors.vertical) {
    const baseX = corridor.index * PITCH;
    for (const centre of [CORRIDOR.footpathCentreLow, CORRIDOR.footpathCentreHigh]) {
      if (isWaterSideFootpath(corridor, centre, blocksX, blocksZ)) continue;
      for (let z = TILE / 2; z < extent.z; z += TILE) place(baseX + centre, z);
    }
  }
  for (const corridor of corridors.horizontal) {
    const baseZ = corridor.index * PITCH;
    for (const centre of [CORRIDOR.footpathCentreLow, CORRIDOR.footpathCentreHigh]) {
      if (isWaterSideFootpath(corridor, centre, blocksX, blocksZ)) continue;
      for (let x = TILE / 2; x < extent.x; x += TILE) place(x, baseZ + centre);
    }
  }
  return trees;
}

function reserveTreesForCity(rng, reserve) {
  if (!reserve) return [];
  const { minX, maxX, minZ, maxZ } = reserve.bounds;
  const positions = [
    [minX + 12, minZ + 3], [minX + 36, minZ + 3],
    [maxX - 3, minZ + 12], [maxX - 3, minZ + 36],
    [minX + 12, maxZ - 3], [minX + 36, maxZ - 3],
    [minX + 3, minZ + 12], [minX + 3, minZ + 36],
  ];
  return positions.map(([x, z], index) => ({
    id: `${reserve.id}-tree-${index + 1}`,
    model: rng.weighted(TREE_SPECIES).id,
    x,
    z,
    rotation: rng.int(0, 3) * 90,
    scale: +(0.92 + rng.unit() * 0.16).toFixed(3),
    role: 'reserve-avenue',
  }));
}

function coreTreesForCity(rng, cores) {
  const trees = [];
  for (const core of cores) {
    if (core.useId !== 'pocket-park') continue;
    for (const [index, offset] of [[-4.5, -3.5], [4.5, -2], [0, 4]].entries()) {
      trees.push({
        id: `${core.id}-tree-${index + 1}`,
        model: rng.weighted(TREE_SPECIES).id,
        x: core.centre.x + offset[0],
        z: core.centre.z + offset[1],
        rotation: rng.int(0, 3) * 90,
        scale: +(0.72 + rng.unit() * 0.12).toFixed(3),
        role: 'core-pocket-park',
      });
    }
  }
  return trees;
}

function waterfrontForCity(rng, waterEdge, extent) {
  const alongMax = waterEdge === 'north' || waterEdge === 'south' ? extent.x : extent.z;
  const alongMin = ROAD + 20;
  const alongLimit = alongMax - ROAD - 20;
  const jettyAlong = [rng.range(alongMin, alongLimit), rng.range(alongMin, alongLimit)].sort((a, b) => a - b);
  const shedAlong = rng.range(alongMin, alongLimit);
  const position = (along, outward) => {
    if (waterEdge === 'north') return { x: along, z: -outward };
    if (waterEdge === 'south') return { x: along, z: extent.z + outward };
    if (waterEdge === 'west') return { x: -outward, z: along };
    return { x: extent.x + outward, z: along };
  };
  const rotation = waterEdge === 'north' || waterEdge === 'south' ? 0 : 90;
  return {
    edge: waterEdge,
    structures: [
      ...jettyAlong.map((along, index) => ({
        id: `jetty-${index + 1}`,
        kind: 'jetty',
        along: +along.toFixed(3),
        ...position(along, 10),
        rotation,
        source: 'runtime-procedural',
      })),
      {
        id: 'boat-shed',
        kind: 'boat-shed',
        along: +shedAlong.toFixed(3),
        ...position(shedAlong, 2),
        rotation,
        source: 'runtime-procedural',
      },
    ],
  };
}

function dressReserve(rng, reserve) {
  if (!reserve) return null;
  const quadrants = ['north-west', 'north-east', 'south-east', 'south-west'];
  const playgroundQuadrant = rng.pick(quadrants);
  const pondQuadrant = rng.pick(quadrants.filter((quadrant) => quadrant !== playgroundQuadrant));
  return {
    ...reserve,
    surface: 'lawn',
    avenueTreeCount: 8,
    coreFeature: 'rotunda',
    playgroundQuadrant,
    pondQuadrant,
    pondAreaMetres: TILE * TILE,
    pathNetwork: 'perimeter-cross-and-diagonals',
  };
}

/**
 * Tram-stop furniture and the tram itself, on the flagged corridors.
 * Stops sit on the footpath mid-block — never on the tram reservation, carriageway,
 * or at the junction (old math used tramCentre − kerbLow → middle of the road).
 */
function transitForCity(blocksX, blocksZ, corridors) {
  const transit = [];
  const extent = cityExtent(blocksX, blocksZ);
  for (const corridor of corridors.vertical) {
    if (!corridor.tram) continue;
    const baseX = corridor.index * PITCH;
    const tramX = baseX + CORRIDOR.tramCentre;
    transit.push({
      kind: 'tram',
      model: 'australian-tram',
      axis: 'v',
      x: tramX,
      from: ROAD,
      to: extent.z - ROAD,
      rotation: 0,
    });
    // One stop per block face on the high footpath (kerbside), mid-block along Z.
    for (let bz = 0; bz < blocksZ; bz += 1) {
      const z = bz * PITCH + ROAD + BLOCK / 2;
      const x = baseX + CORRIDOR.footpathCentreHigh;
      if (inRoadJunction(x, z)) continue;
      transit.push({
        kind: 'stop',
        model: 'modern-tram-stop-pylon',
        x: +x.toFixed(3),
        z: +z.toFixed(3),
        rotation: 90,
      });
    }
  }
  for (const corridor of corridors.horizontal) {
    if (!corridor.tram) continue;
    const baseZ = corridor.index * PITCH;
    const tramZ = baseZ + CORRIDOR.tramCentre;
    transit.push({
      kind: 'tram',
      model: 'australian-tram',
      axis: 'h',
      z: tramZ,
      from: ROAD,
      to: extent.x - ROAD,
      rotation: 90,
    });
    for (let bx = 0; bx < blocksX; bx += 1) {
      const x = bx * PITCH + ROAD + BLOCK / 2;
      const z = baseZ + CORRIDOR.footpathCentreHigh;
      if (inRoadJunction(x, z)) continue;
      transit.push({
        kind: 'stop',
        model: 'modern-tram-stop-pylon',
        x: +x.toFixed(3),
        z: +z.toFixed(3),
        rotation: 0,
      });
    }
  }
  return transit;
}

function displayNodeId(x, z) {
  return `n:${String(x).padStart(6, '0')}:${String(z).padStart(6, '0')}`;
}

function activeBuildingAabbs(parcels, civicUses) {
  return [...Object.values(parcels), ...civicUses].map((building) => {
    const offset = building.placement?.modelOffset ?? { x: 0, z: 0 };
    const envelope = building.placement?.envelopeMetres ?? {
      x: building.groundFootprint[0] * TILE - 1,
      z: building.groundFootprint[1] * TILE - 1,
    };
    const x = building.centre.x + offset.x;
    const z = building.centre.z + offset.z;
    return {
      minX: x - envelope.x / 2,
      maxX: x + envelope.x / 2,
      minZ: z - envelope.z / 2,
      maxZ: z + envelope.z / 2,
    };
  });
}

export function buildDisplayWalkGraph({
  blocksX,
  blocksZ,
  corridors,
  rightsOfWay,
  blockCores,
  reserve,
  parcels,
  civicUses,
  walkAnchors,
}) {
  const extent = cityExtent(blocksX, blocksZ);
  const footprints = activeBuildingAabbs(parcels, civicUses);
  const nodes = new Map();
  const edges = new Map();
  const legal = (x, z) => !footprints.some((box) =>
    x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ);
  const addNode = (x, z) => {
    if (!legal(x, z)) return null;
    const id = displayNodeId(x, z);
    nodes.set(id, { x, z });
    if (!edges.has(id)) edges.set(id, new Set());
    return id;
  };
  const connect = (left, right) => {
    if (!left || !right || left === right) return;
    edges.get(left).add(right);
    edges.get(right).add(left);
  };
  const addLine = (points) => {
    let previous = null;
    for (const point of points) {
      const current = addNode(point.x, point.z);
      if (
        previous
        && current
        && Math.abs(nodes.get(previous).x - point.x)
          + Math.abs(nodes.get(previous).z - point.z) === CELL
      ) connect(previous, current);
      previous = current;
    }
  };

  // CELL-centre samples on the two footpaths of every corridor. Inside a
  // corridor intersection these four lines are the only road crossings.
  for (const corridor of corridors.vertical) {
    const baseX = corridor.index * PITCH;
    for (const offset of [CELL / 2, ROAD - CELL / 2]) {
      const points = [];
      for (let z = CELL / 2; z < extent.z; z += CELL) {
        points.push({ x: baseX + offset, z });
      }
      addLine(points);
    }
  }
  for (const corridor of corridors.horizontal) {
    const baseZ = corridor.index * PITCH;
    for (const offset of [CELL / 2, ROAD - CELL / 2]) {
      const points = [];
      for (let x = CELL / 2; x < extent.x; x += CELL) {
        points.push({ x, z: baseZ + offset });
      }
      addLine(points);
    }
  }

  // ROWs sit on tile boundaries rather than the global CELL-centre lattice.
  // Retain their exact centreline, sample it every CELL, then join the mouth to
  // the adjacent same-side footpath samples without crossing a carriageway.
  for (const row of [...rightsOfWay].sort((a, b) => a.id.localeCompare(b.id))) {
    const along = row.axis === 'x' ? 'x' : 'z';
    const across = along === 'x' ? 'z' : 'x';
    const min = row.centre[along] - row.length / 2;
    const max = row.centre[along] + row.length / 2;
    const first = Math.ceil((min - CELL / 2) / CELL) * CELL + CELL / 2;
    const points = [];
    for (let value = first; value <= max; value += CELL) {
      points.push({ [along]: value, [across]: row.centre[across] });
    }
    addLine(points);
    const mouthValue = row.side === 'north' || row.side === 'west'
      ? Math.min(...points.map((point) => point[along]))
      : Math.max(...points.map((point) => point[along]));
    const mouth = displayNodeId(
      along === 'x' ? mouthValue : row.centre.x,
      along === 'z' ? mouthValue : row.centre.z,
    );
    if (!nodes.has(mouth)) continue;
    const nearby = [...nodes.entries()]
      .filter(([id, point]) =>
        id !== mouth
        && point[along] === mouthValue
        && Math.abs(point[across] - row.centre[across]) <= CELL / 2)
      .sort(([left], [right]) => left.localeCompare(right));
    for (const [id] of nearby) connect(mouth, id);
  }

  const centres = new Map([
    ...Object.values(parcels).map(({ id, centre }) => [`parcel:${id}`, centre]),
    ...civicUses.map(({ id, centre }) => [`civic:${id}`, centre]),
    ...blockCores.map(({ id, centre }) => [`core:${id}`, centre]),
    ...rightsOfWay.map(({ id, centre }) => [`core:${id}:mouth`, centre]),
    ...(reserve ? [[`reserve:${reserve.id}`, reserve.centre]] : []),
  ]);
  const nodeIds = [...nodes.keys()].sort();
  for (const value of [...walkAnchors].sort((left, right) =>
    `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`))) {
    const anchorId = `${value.kind}:${value.id}`;
    const key = `a:${anchorId}`;
    const centre = centres.get(anchorId);
    if (!centre || !nodeIds.length) throw new Error(`NO_DISPLAY_ROUTE:${key}:${key}`);
    const nearest = [...nodeIds].sort((left, right) => {
      const a = nodes.get(left);
      const b = nodes.get(right);
      const distanceA = Math.abs(a.x - centre.x) + Math.abs(a.z - centre.z);
      const distanceB = Math.abs(b.x - centre.x) + Math.abs(b.z - centre.z);
      return distanceA - distanceB || left.localeCompare(right);
    })[0];
    edges.set(key, new Set([nearest]));
    edges.get(nearest).add(key);
  }

  const graph = Object.fromEntries([...edges.keys()].sort().map((id) => [
    id,
    [...edges.get(id)].sort(),
  ]));
  const anchorIds = Object.keys(graph).filter((id) => id.startsWith('a:')).sort();
  if (anchorIds.length) {
    const reached = new Set([anchorIds[0]]);
    const queue = [anchorIds[0]];
    for (let index = 0; index < queue.length; index += 1) {
      for (const neighbour of graph[queue[index]]) {
        if (reached.has(neighbour)) continue;
        reached.add(neighbour);
        queue.push(neighbour);
      }
    }
    const missing = anchorIds.find((id) => !reached.has(id));
    if (missing && import.meta.env?.PROD !== true) {
      throw new Error(`NO_DISPLAY_ROUTE:${anchorIds[0]}:${missing}`);
    }
  }
  return graph;
}

/**
 * Renderer-independent V3.04 §6.1 graph. B3 originally hosted this builder in
 * people.js; B5 makes the parcel collection explicit so the same implementation
 * can build frozen city content and every accepted topology version.
 */
export function buildCoreWalkGraph({
  city,
  parcels,
  walkAnchors,
}) {
  const footprints = activeBuildingAabbs(parcels, city.civicUses ?? []);
  const nodes = new Map();
  const edges = new Map();
  const legal = (x, z) => !footprints.some((box) =>
    x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ);
  const addNode = (x, z) => {
    if (!legal(x, z)) return null;
    const id = displayNodeId(x, z);
    nodes.set(id, { x, z });
    if (!edges.has(id)) edges.set(id, new Set());
    return id;
  };
  const connect = (left, right) => {
    if (!left || !right || left === right) return;
    edges.get(left).add(right);
    edges.get(right).add(left);
  };
  const addLine = (points) => {
    let previous = null;
    for (const point of points) {
      const current = addNode(point.x, point.z);
      if (
        previous
        && current
        && Math.abs(nodes.get(previous).x - point.x)
          + Math.abs(nodes.get(previous).z - point.z) === CELL
      ) connect(previous, current);
      previous = current;
    }
  };
  const extent = city.extent ?? cityExtent(city.blocksX, city.blocksZ);
  for (const corridor of city.corridors.vertical) {
    const baseX = corridor.index * PITCH;
    for (const offset of [CELL / 2, ROAD - CELL / 2]) {
      const points = [];
      for (let z = CELL / 2; z < extent.z; z += CELL) {
        points.push({ x: baseX + offset, z });
      }
      addLine(points);
    }
  }
  for (const corridor of city.corridors.horizontal) {
    const baseZ = corridor.index * PITCH;
    for (const offset of [CELL / 2, ROAD - CELL / 2]) {
      const points = [];
      for (let x = CELL / 2; x < extent.x; x += CELL) {
        points.push({ x, z: baseZ + offset });
      }
      addLine(points);
    }
  }
  for (const row of [...city.rightsOfWay].sort((a, b) => a.id.localeCompare(b.id))) {
    const along = row.axis === 'x' ? 'x' : 'z';
    const across = along === 'x' ? 'z' : 'x';
    const min = row.centre[along] - row.length / 2;
    const max = row.centre[along] + row.length / 2;
    const first = Math.ceil((min - CELL / 2) / CELL) * CELL + CELL / 2;
    const points = [];
    for (let value = first; value <= max; value += CELL) {
      points.push({ [along]: value, [across]: row.centre[across] });
    }
    addLine(points);
    const mouthValue = row.side === 'north' || row.side === 'west'
      ? Math.min(...points.map((point) => point[along]))
      : Math.max(...points.map((point) => point[along]));
    const mouth = displayNodeId(
      along === 'x' ? mouthValue : row.centre.x,
      along === 'z' ? mouthValue : row.centre.z,
    );
    if (!nodes.has(mouth)) continue;
    const nearby = [...nodes.entries()]
      .filter(([id, point]) =>
        id !== mouth
        && point[along] === mouthValue
        && Math.abs(point[across] - row.centre[across]) <= CELL / 2)
      .sort(([left], [right]) => left.localeCompare(right));
    for (const [id] of nearby) connect(mouth, id);
  }

  const centres = new Map([
    ...Object.values(parcels).map(({ id, centre }) => [`parcel:${id}`, centre]),
    ...(city.civicUses ?? []).map(({ id, centre }) => [`civic:${id}`, centre]),
    ...(city.blockCores ?? []).map(({ id, centre }) => [`core:${id}`, centre]),
    ...(city.rightsOfWay ?? []).map(({ id, centre }) => [`core:${id}:mouth`, centre]),
    ...(city.reserve ? [[`reserve:${city.reserve.id}`, city.reserve.centre]] : []),
  ]);
  const nodeIds = [...nodes.keys()].sort();
  const attachments = {};
  for (const value of walkAnchors) {
    const centre = centres.get(`${value.kind}:${value.id}`);
    if (!centre || !nodeIds.length) continue;
    const nearest = [...nodeIds].sort((left, right) => {
      const a = nodes.get(left);
      const b = nodes.get(right);
      const distanceA = Math.abs(a.x - centre.x) + Math.abs(a.z - centre.z);
      const distanceB = Math.abs(b.x - centre.x) + Math.abs(b.z - centre.z);
      return distanceA - distanceB || left.localeCompare(right);
    })[0];
    attachments[`${value.kind}:${value.id}`] = nearest;
  }
  return {
    graph: Object.fromEntries([...edges.keys()].sort().map((id) => [
      id,
      [...edges.get(id)].sort(),
    ])),
    attachments,
  };
}

const AMENITY_KEYS = Object.freeze([
  'amenityValueBp',
  'amenityRentBp',
  'amenityClamped',
  'amenityNotes',
  'amenityMarkers',
]);

function amenityRecord(parcel) {
  return Object.fromEntries(AMENITY_KEYS.map((key) => [key, structuredClone(parcel[key])]));
}

function activeWalkAnchors(city, parcels, order) {
  return [
    ...order.map((id) => ({ kind: 'parcel', id })),
    ...(city.walkAnchors ?? []).filter(({ kind }) => kind !== 'parcel'),
  ].sort((left, right) =>
    `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`));
}

function tileOrdinal(city, tileId) {
  const { bx, bz, tx, tz } = parseParcelId(tileId);
  return (((bz * city.blocksX + bx) * TILES_PER_BLOCK + tz) * TILES_PER_BLOCK) + tx;
}

function orderedActiveIds(city, parcels) {
  return Object.keys(parcels).sort((left, right) => {
    const leftOrdinal = Math.min(...parcels[left].tiles.map((id) => tileOrdinal(city, id)));
    const rightOrdinal = Math.min(...parcels[right].tiles.map((id) => tileOrdinal(city, id)));
    return leftOrdinal - rightOrdinal || left.localeCompare(right);
  });
}

function activeGeometry(city, parcels) {
  const order = orderedActiveIds(city, parcels);
  const normalized = {};
  const covered = {};
  for (const id of order) {
    const parcel = parcels[id];
    const positions = parcel.tiles.map(parseParcelId);
    const gx = positions.map((position) => globalTile(
      position.bx,
      position.bz,
      position.tx,
      position.tz,
    ).gx);
    const gz = positions.map((position) => globalTile(
      position.bx,
      position.bz,
      position.tx,
      position.tz,
    ).gz);
    const groundFootprint = [
      Math.max(...gx) - Math.min(...gx) + 1,
      Math.max(...gz) - Math.min(...gz) + 1,
    ];
    const centres = parcel.tiles.map((tileId) => {
      const position = parseParcelId(tileId);
      return tileCentre(position.bx, position.bz, position.tx, position.tz);
    });
    const centre = {
      x: centres.reduce((sum, point) => sum + point.x, 0) / centres.length,
      z: centres.reduce((sum, point) => sum + point.z, 0) / centres.length,
    };
    normalized[id] = {
      ...parcel,
      groundFootprint,
      centre,
      placement: {
        ...(parcel.placement ?? {}),
        envelopeMetres: {
          x: groundFootprint[0] * TILE - 1,
          z: groundFootprint[1] * TILE - 1,
        },
        modelOffset: parcel.consolidated
          ? { x: 0, z: 0 }
          : parcel.placement?.modelOffset ?? { x: 0, z: 0 },
      },
    };
    for (const tileId of parcel.tiles) {
      if (tileId !== id) covered[tileId] = id;
    }
  }
  return { order, parcels: normalized, covered };
}

function activeAdjacencyFor(city, parcels, order) {
  const tileOwner = {};
  for (const id of order) {
    for (const tileId of parcels[id].tiles) tileOwner[tileId] = id;
  }
  const adjacency = {};
  for (const id of order) {
    const neighbours = new Set();
    for (const tileId of parcels[id].tiles) {
      const position = parseParcelId(tileId);
      const { gx, gz } = globalTile(
        position.bx,
        position.bz,
        position.tx,
        position.tz,
      );
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = gx + dx;
        const nz = gz + dz;
        if (
          nx < 0
          || nz < 0
          || nx >= city.blocksX * TILES_PER_BLOCK
          || nz >= city.blocksZ * TILES_PER_BLOCK
        ) continue;
        const nBx = Math.floor(nx / TILES_PER_BLOCK);
        const nBz = Math.floor(nz / TILES_PER_BLOCK);
        const neighbourTile = parcelId(
          nBx,
          nBz,
          nx % TILES_PER_BLOCK,
          nz % TILES_PER_BLOCK,
        );
        const owner = tileOwner[neighbourTile];
        if (owner && owner !== id) neighbours.add(owner);
      }
    }
    adjacency[id] = [...neighbours].sort();
  }
  return adjacency;
}

function exposureFor(city, parcels, order) {
  return Object.fromEntries(order.map((id) => {
    const distances = parcels[id].tiles.map((tileId) => {
      const { bx, bz, tx, tz } = parseParcelId(tileId);
      const { gx, gz } = globalTile(bx, bz, tx, tz);
      if (city.waterEdge === 'west') return gx + 1;
      if (city.waterEdge === 'east') return city.blocksX * TILES_PER_BLOCK - gx;
      if (city.waterEdge === 'north') return gz + 1;
      return city.blocksZ * TILES_PER_BLOCK - gz;
    });
    const waterDistance = Math.min(...distances);
    return [id, {
      waterDistance,
      lowLying: waterDistance <= 2,
      floodExposureBp: waterDistance === 1
        ? 3200
        : waterDistance === 2
          ? 2000
          : waterDistance === 3
            ? 900
            : 100,
    }];
  }));
}

/** Deterministic version-0 state projection. Accessors still pass through to city at v0. */
export function createTopology(city) {
  const parcels = Object.fromEntries(city.order.map((id) => [
    id,
    structuredClone(city.parcels[id]),
  ]));
  const displayAnchors = Object.fromEntries(city.order.map((id) => [
    id,
    {
      kind: 'parcel',
      id,
      x: city.parcels[id].centre.x,
      z: city.parcels[id].centre.z,
    },
  ]));
  return {
    version: 0,
    order: [...city.order],
    parcels,
    covered: structuredClone(city.covered),
    adjacency: structuredClone(city.adjacency),
    amenity: Object.fromEntries(city.order.map((id) => [
      id,
      amenityRecord(city.parcels[id]),
    ])),
    displayAnchors,
    coreWalkGraph: structuredClone(city.coreWalkGraph),
    displayWalkGraph: structuredClone(city.displayWalkGraph),
    eventExposure: structuredClone(city.eventExposure),
    tombstones: {},
    lineage: {},
    amenitySolveCount: 0,
  };
}

export function activeParcel(city, state, id) {
  if (String(id).startsWith('farm-')) return surveyedPaddocks(city).find((p) => p.id === id);
  if (!state?.topology || state.topology.version === 0) return city.parcels[id];
  return state.topology.parcels[id];
}

// T13's integer site hash and invertible warp. Farms own the worked polygon,
// with an inset building envelope; neither enters the city street-tile draw.
export function farmFieldAt(x, z, seed = 0) {
  const h = (a, b) => { const n = ((a * 127 + b * 311 + (seed % 997) * 17) % 997 + 997) % 997; return (n * n * 13 % 997) / 997; };
  const noise = (t, s) => 2 * Math.sin(t * Math.PI / 20 + s % 997) + Math.sin(t * Math.PI / 10 + (s % 997) * 1.7 + 2.3);
  const a = x + 9 * Math.sin(z / 115 + seed % 997), b = z + 11 * Math.sin(x / 137 - seed % 997);
  let u = .9323273456 * a - .3616154320 * b, v = .3616154320 * a + .9323273456 * b;
  u += noise(v, seed); v += noise(u, seed + 31);
  let first = Infinity, second = Infinity, winner;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const ix = Math.floor(u / 72) + i, iz = Math.floor(v / 72) + j;
    const d = ((ix + .18 + h(ix, iz) * .64) * 72 - u) ** 2 + ((iz + .18 + h(ix + 37, iz - 19) * .64) * 72 - v) ** 2;
    if (d < first) { second = first; first = d; winner = { ix, iz, arable: h(ix + 83, iz + 127) >= .5 }; }
    else second = Math.min(second, d);
  }
  return winner;
}

export function farmFieldPolygon([ix, iz], seed = 0) {
  const h = (a, b) => { const n = ((a * 127 + b * 311 + (seed % 997) * 17) % 997 + 997) % 997; return (n * n * 13 % 997) / 997; };
  const site = (a, b) => [(a + .18 + h(a, b) * .64) * 72, (b + .18 + h(a + 37, b - 19) * .64) * 72];
  const noise = (t, s) => 2 * Math.sin(t * Math.PI / 20 + s % 997) + Math.sin(t * Math.PI / 10 + (s % 997) * 1.7 + 2.3);
  const unwarp = (x, z) => {
    z -= noise(x, seed + 31); x -= noise(z, seed);
    [x, z] = [.9323273456 * x + .3616154320 * z, -.3616154320 * x + .9323273456 * z];
    let wx = x, wz = z;
    for (let i = 0; i < 7; i++) { wx = x - 9 * Math.sin(wz / 115 + seed % 997); wz = z - 11 * Math.sin(wx / 137 - seed % 997); }
    return [wx, wz];
  };
  const centre = site(ix, iz);
  let poly = [[-160, -160], [160, -160], [160, 160], [-160, 160]].map(([x, z]) => [x + centre[0], z + centre[1]]);
  for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
    if (!a && !b) continue;
    const other = site(ix + a, iz + b), nx = other[0] - centre[0], nz = other[1] - centre[1];
    const c = (other[0] ** 2 + other[1] ** 2 - centre[0] ** 2 - centre[1] ** 2) / 2, clipped = [];
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k], q = poly[(k + 1) % poly.length];
      const dp = p[0] * nx + p[1] * nz - c, dq = q[0] * nx + q[1] * nz - c;
      if (dp <= 0) clipped.push(p);
      if ((dp <= 0) !== (dq <= 0)) { const t = dp / (dp - dq); clipped.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    poly = clipped;
  }
  return poly.flatMap((p, i) => {
    const q = poly[(i + 1) % poly.length], n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 4));
    return Array.from({ length: n }, (_, k) => unwarp(p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n));
  });
}

const farmSurveys = new WeakMap();
export function surveyedPaddocks(city) {
  if (farmSurveys.has(city)) return farmSurveys.get(city);
  const seed = (city.seed ?? 0) >>> 0, e = city.extent;
  const terrain = planEdgeMassing(city), heightAt = (x, z) => surroundHeightAt(x, z, e, terrain);
  const inland = { east: [-1, 0], west: [1, 0], north: [0, 1], south: [0, -1] }[city.waterEdge ?? 'south'];
  const anchor = { x: e.x / 2 + inland[0] * (e.x / 2 + 4), z: e.z / 2 + inland[1] * (e.z / 2 + 4) };
  const gateway = { ...anchor }, alongAxis = inland[0] ? 'z' : 'x';
  const gates = terrain.seats.filter(s => s.id === 'tullamarine' || s.id === 'southern-cross').sort((a, b) => a[alongAxis] - b[alongAxis]);
  if (gates.length === 2) gateway[alongAxis] = (gates[0][alongAxis] + gates[0].radius + gates[1][alongAxis] - gates[1].radius) / 2;
  const out = [], seen = new Set();
  for (let distance = FARM_WINDOW.dist0; distance <= FARM_WINDOW.dist1 && out.length < 2; distance += FARM_WINDOW.step) {
    for (let along = FARM_WINDOW.along0; along <= FARM_WINDOW.along1 && out.length < 2; along += FARM_WINDOW.step) {
      const x = anchor.x + inland[0] * distance + inland[1] * along;
      const z = anchor.z + inland[1] * distance + inland[0] * along;
      const field = farmFieldAt(x, z, seed), key = `${field.ix},${field.iz}`;
      if (!field.arable || seen.has(key)) continue;
      const polygon = [[x - 23, z - 19], [x + 23, z - 19], [x + 23, z + 19], [x - 23, z + 19]];
      if (!polygon.every(([px, pz]) => { const f = farmFieldAt(px, pz, seed); return f.ix === field.ix && f.iz === field.iz; })) continue;
      const heights = polygon.map(([px, pz]) => heightAt(px, pz));
      if (Math.min(...heights) < .5 || Math.max(...heights) - Math.min(...heights) > 3.8) continue;
      if (polygon.some(([px, pz]) => waternessAt(px, pz, e, terrain) > .02)) continue;
      if ([...polygon, [x, z]].some(([px, pz]) => creekFieldAt(px, pz, e, terrain, terrain.seats, Math.max(-px, -pz, px - e.x, pz - e.z), 0).thread > .01)) continue;
      if (terrain.seats.some(s => Math.hypot(s.x - x, s.z - z) < s.radius + 30)) continue;
      seen.add(key);
      const accessTrack = [[x, z + 9], inland[0] ? [x, gateway.z] : [gateway.x, z + 9], [gateway.x, gateway.z]];
      out.push(Object.freeze({ id: `farm-${out.length + 1}`, surveyedFarm: true, label: `Surveyed paddock ${out.length + 1}`, centre: { x, z }, polygon: farmFieldPolygon([field.ix, field.iz], seed), buildEnvelope: polygon, accessTrack,
        fieldId: [field.ix, field.iz], gateway, tiles: [], footprint: [3, 3], groundFootprint: [3, 3], adjacency: [], sector: 'retail', zoneId: 'AG', districtId: 'hinterland', districtName: 'Hinterland', archetypeId: 'farm', storeys: 1, basePrice: 20000, baseRent: 0 }));
    }
  }
  farmSurveys.set(city, Object.freeze(out));
  return farmSurveys.get(city);
}

export function activeOrder(city, state) {
  if (!state?.topology || state.topology.version === 0) return city.order;
  return state.topology.order;
}

export function activeCovered(city, state) {
  if (!state?.topology || state.topology.version === 0) return city.covered;
  return state.topology.covered;
}

export function activeAdjacency(city, state, id = null) {
  const record = !state?.topology || state.topology.version === 0
    ? city.adjacency
    : state.topology.adjacency;
  return id === null ? record : record[id] ?? [];
}

export function activeEventExposure(city, state, id = null) {
  const record = !state?.topology || state.topology.version === 0
    ? city.eventExposure
    : state.topology.eventExposure;
  return id === null ? record : record[id];
}

export function activeDisplayWalkGraph(city, state) {
  if (!state?.topology || state.topology.version === 0) return city.displayWalkGraph;
  return state.topology.displayWalkGraph;
}

export function activeCoreWalkGraph(city, state) {
  if (!state?.topology || state.topology.version === 0) return city.coreWalkGraph;
  return state.topology.coreWalkGraph;
}

export function activeWalkAnchorsFor(city, state) {
  if (!state?.topology || state.topology.version === 0) return city.walkAnchors;
  return activeWalkAnchors(city, state.topology.parcels, state.topology.order);
}

/** Facade for legacy pure consumers that accept city but not a separate topology argument. */
export function activeCity(city, state) {
  if (!state?.topology || state.topology.version === 0) return city;
  return {
    ...city,
    parcels: state.topology.parcels,
    order: state.topology.order,
    covered: state.topology.covered,
    adjacency: state.topology.adjacency,
    walkAnchors: activeWalkAnchorsFor(city, state),
    coreWalkGraph: state.topology.coreWalkGraph,
    displayWalkGraph: state.topology.displayWalkGraph,
    eventExposure: state.topology.eventExposure,
  };
}

/**
 * V3.04 §18.3 locked order: footprint/covered, adjacency, amenity,
 * display anchors, core graph, display graph, exposure. Exactly one amenity
 * solver call occurs in this function.
 */
export function rebuildTopologyDerivedFields(city, topology) {
  const geometry = activeGeometry(city, topology.parcels);
  const adjacency = activeAdjacencyFor(city, geometry.parcels, geometry.order);
  const amenityField = solveAmenityField({
    parcels: geometry.parcels,
    order: geometry.order,
    civicUses: city.civicUses,
    blockCores: city.blockCores,
    reserve: city.reserve,
    waterEdge: city.waterEdge,
    blocksX: city.blocksX,
    blocksZ: city.blocksZ,
  });
  const parcels = Object.fromEntries(geometry.order.map((id) => [
    id, (() => {
      const parcel = geometry.parcels[id];
      const amenity = amenityRecord(amenityField.parcels[id]);
      return {
      ...geometry.parcels[id],
        ...amenity,
        upliftBp: 10000
          + (parcel.tram ? RULES.tramFrontageBp : 0)
          + (parcel.corner ? RULES.cornerFrontageBp : 0)
          + amenity.amenityValueBp,
        rentUpliftBp: 10000
          + (parcel.tram ? RULES.tramFrontageBp : 0)
          + (parcel.corner ? RULES.cornerFrontageBp : 0)
          + amenity.amenityRentBp,
      };
    })(),
  ]));
  const amenity = Object.fromEntries(geometry.order.map((id) => [
    id,
    amenityRecord(parcels[id]),
  ]));
  const displayAnchors = Object.fromEntries(geometry.order.map((id) => [
    id,
    {
      kind: 'parcel',
      id,
      x: parcels[id].centre.x,
      z: parcels[id].centre.z,
    },
  ]));
  const walkAnchors = activeWalkAnchors(city, parcels, geometry.order);
  const coreWalkGraph = buildCoreWalkGraph({ city, parcels, walkAnchors });
  const displayWalkGraph = buildDisplayWalkGraph({
    blocksX: city.blocksX,
    blocksZ: city.blocksZ,
    corridors: city.corridors,
    rightsOfWay: city.rightsOfWay,
    blockCores: city.blockCores,
    reserve: city.reserve,
    parcels,
    civicUses: city.civicUses,
    walkAnchors,
  });
  const eventExposure = exposureFor(city, parcels, geometry.order);
  return {
    ...topology,
    order: geometry.order,
    parcels,
    covered: geometry.covered,
    adjacency,
    amenity,
    displayAnchors,
    coreWalkGraph,
    displayWalkGraph,
    eventExposure,
    amenitySolveCount: (topology.amenitySolveCount ?? 0) + 1,
  };
}

function canonicalTopology(value) {
  if (Array.isArray(value)) return value.map(canonicalTopology);
  if (value === null || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((record, key) => {
    record[key] = canonicalTopology(value[key]);
    return record;
  }, {});
}

const FRONTAGE_GROUP_BY_TILE = Object.freeze({
  '0,0': 0,
  '1,0': 0,
  '2,0': 1,
  '2,1': 1,
  '2,2': 2,
  '1,2': 2,
  '0,2': 3,
  '0,1': 3,
});

/** V3.06 A.3: isolated per-block zoning streams in numeric bz-major order. */
export function createBlockZones(seed, blocksX, blocksZ, districtByBlock) {
  const entries = [];
  for (let bz = 0; bz < blocksZ; bz += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      const blockKey = `${bx},${bz}`;
      const district = districtByBlock instanceof Map
        ? districtByBlock.get(blockKey)
        : districtByBlock[blockKey];
      if (!district?.zonePalette) throw new Error(`missing zone palette for block ${blockKey}`);
      const rng = stream(seed, `layout:zoning:block:${blockKey}`);
      const primaryZone = rng.weighted(district.zonePalette).id;
      const splitRoll = rng.int(0, 9999);
      const split = splitRoll < RULES.zoningSplitChanceBp;
      let secondaryZone = null;
      let splitStart = null;
      if (split) {
        secondaryZone = rng.weighted(
          district.zonePalette.filter(({ id }) => id !== primaryZone),
        ).id;
        splitStart = rng.int(0, 3);
      }
      entries.push([blockKey, {
        blockKey,
        primaryZone,
        secondaryZone,
        split,
        splitStart,
      }]);
    }
  }
  return Object.fromEntries(entries);
}

function zoneForAnchor(blockZone, tx, tz) {
  if (!blockZone.split) return blockZone.primaryZone;
  const frontageGroup = FRONTAGE_GROUP_BY_TILE[`${tx},${tz}`];
  if (frontageGroup === undefined) {
    throw new Error(`zoning anchor ${tx},${tz} is not a perimeter position`);
  }
  return frontageGroup === blockZone.splitStart
    || frontageGroup === (blockZone.splitStart + 1) % 4
    ? blockZone.secondaryZone
    : blockZone.primaryZone;
}

export function topologyHash(topology) {
  return hash32(JSON.stringify(canonicalTopology(topology))).toString(16).padStart(8, '0');
}

export function resolveCurrentParcelId(city, state, id) {
  if (activeParcel(city, state, id)) return id;
  const seen = new Set();
  let current = id;
  while (!seen.has(current)) {
    seen.add(current);
    const successors = state?.topology?.tombstones?.[current]?.successors ?? [];
    if (successors.length !== 1) return null;
    [current] = successors;
    if (activeParcel(city, state, current)) return current;
  }
  return null;
}

/**
 * History identity is explicitly (topologyVersion,id). Current-version callers
 * may opt into the same sole-successor follow used by board selection.
 */
export function resolveTopologyId(city, state, topologyVersion, id) {
  if (!Number.isInteger(topologyVersion) || topologyVersion < 0) return null;
  if (topologyVersion > (state?.topology?.version ?? 0)) return null;
  if (topologyVersion === (state?.topology?.version ?? 0)) {
    return resolveCurrentParcelId(city, state, id);
  }
  const lineage = state?.topology?.lineage?.[id];
  if (lineage && lineage.createdAtVersion > topologyVersion) return null;
  return id;
}

/** The published forecast / realised move table. Precomputed so a run never drifts. */
function marketTable(rng, quarters) {
  const table = [];
  for (let q = 1; q <= quarters; q += 1) {
    const row = { quarter: q, sectors: {} };
    for (const sector of SECTOR_IDS) {
      const forecastBp = Math.round(rng.range(RULES.forecastMinBp, RULES.forecastMaxBp));
      const noise = Math.round(rng.range(-RULES.realisedNoiseBp, RULES.realisedNoiseBp));
      row.sectors[sector] = { forecastBp, realisedBp: forecastBp + noise };
    }
    table.push(row);
  }
  return table;
}

/** V3.04 §16.3. Frozen with the city; run state stores only cumulative indices. */
export function createDistrictDriftPlan(seed, quarters = RULES.quarters) {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const horizon = Math.max(1, quarters | 0);
  const entries = [];
  for (const district of [...DISTRICTS].sort((left, right) => left.id.localeCompare(right.id))) {
    const setup = stream(seed, `market:district:${district.id}:setup`);
    const arcJitterBp = setup.int(-8, 8);
    const forecastBp = clamp(district.baseDriftBp + arcJitterBp, -30, 45);
    const realisedByQuarterBp = [];
    for (let quarter = 1; quarter <= horizon; quarter += 1) {
      const noiseBp = stream(seed, `market:district:${district.id}:q${quarter}`).int(-10, 10);
      realisedByQuarterBp.push(clamp(forecastBp + noiseBp, -30, 45));
    }
    entries.push([district.id, {
      arcJitterBp,
      forecastBp,
      realisedByQuarterBp,
    }]);
  }
  return Object.fromEntries(entries);
}

/**
 * Generate a city. Frozen on return — the city is read-only content, and every
 * mutable fact about a run lives in the run state instead.
 */
export function createCity({ seed, blocksX = 4, blocksZ = 4, quarters = RULES.quarters }) {
  const layout = stream(seed, 'layout');
  const parcelRng = stream(seed, 'parcels');
  const propRng = stream(seed, 'props');
  const marketRng = stream(seed, 'market');

  // V3.02/V3.04: the water edge must exist before the district assignment. V3.10 §3.2
  // makes that assignment two-stage — the coastal band is claimed by authored water
  // affinity before any Voronoi runs — so the edge is now load-bearing, not a nudge.
  const waterEdge = layout.pick(WATER_EDGES);

  // 1. Districts
  const districtLayout = assignDistricts(layout, blocksX, blocksZ, waterEdge);
  const districtByBlock = districtLayout.byBlock;
  const blockZones = createBlockZones(seed, blocksX, blocksZ, districtByBlock);

  // 2. Corridors, then the reserve draw, then cores/ROWs, all from layout.
  const corridors = buildCorridors(layout, blocksX, blocksZ, waterEdge);
  const reserveLocation = reserveForCity(layout, blocksX, blocksZ, corridors);
  const blockLayout = blockCoresForCity(layout, blocksX, blocksZ, districtByBlock, reserveLocation);
  const rowByParcel = rowPlacementByParcel(blockLayout.rightsOfWay);

  // 3+4. Parcels and valuation
  let parcels = {};
  let covered = {};
  let nonTradeableTiles = {};
  let order = [];
  const usedArchetypes = new Set();

  for (let bz = 0; bz < blocksZ; bz += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      const district = districtByBlock.get(`${bx},${bz}`);
      const zoneSourceBlockKey = `${bx},${bz}`;
      const blockZone = blockZones[zoneSourceBlockKey];
      for (let tz = 0; tz < TILES_PER_BLOCK; tz += 1) {
        for (let tx = 0; tx < TILES_PER_BLOCK; tx += 1) {
          const id = parcelId(bx, bz, tx, tz);
          if (covered[id]) continue;
          if (tx === 1 && tz === 1) {
            nonTradeableTiles[id] = { kind: 'block-core', blockId: `core-${bx}-${bz}` };
            continue;
          }
          if (isReserveBlock(reserveLocation, bx, bz)) {
            nonTradeableTiles[id] = { kind: 'public-reserve', blockId: reserveLocation.id };
            continue;
          }

          // Rotation comes from the street the tile fronts. The footprint is claimed
          // in that orientation, with an explicit 1x1 fallback when it cannot fit.
          const face = frontage(tx, tz);
          if (face.frontages === 0) throw new Error(`parcel ${id} has no street frontage`);

          // Apartments are built under PERMIT L2 — never map-start stock.
          const openWeights = district.weights.filter(
            ({ id: archetypeId }) => !MAP_START_APARTMENT_IDS.includes(archetypeId),
          );
          // V3.70, owner-reported 2026-08-18: "since it says corner shop, it should be on
          // corners only". Measured before the fix on seed 0: 9 of 17 corner shops stood
          // mid-block, against 46 corner parcels available — so this was never a shortage of
          // corners, just an unconstrained draw. A corner shop's whole form is a splayed entry
          // addressing two streets; mid-block it is an ordinary shop wearing a chamfer.
          const cornerEligible = face.corner
            ? openWeights
            : openWeights.filter(({ id: archetypeId }) => !CORNER_ONLY_IDS.has(archetypeId));
          const stockWeights = cornerEligible.length
            ? cornerEligible
            : (openWeights.length ? openWeights : district.weights);
          let choice = parcelRng.weighted(preferUnusedRows(stockWeights, usedArchetypes));
          let archetype = ARCHETYPES[choice.id];
          let footprint = orientedFootprint(archetype.footprint, face.rotation);
          let tiles = footprintTiles(bx, bz, tx, tz, footprint);
          let rowFit = tiles
            ? rowPlacementForFootprint(tiles, footprint, rowByParcel)
            : { valid: false, placement: null };
          const unavailable = () => !tiles
            || !rowFit.valid
            || tiles.some((tile) =>
              nonTradeableTile(tile, reserveLocation)
              || covered[tile]
              || (tile !== id && parcels[tile]));

          if (unavailable()) {
            const singles = stockWeights.filter(({ id: archetypeId }) => (
              isOneByOneFootprint(archetypeId)
            ));
            const districtSingles = district.weights.filter(({ id: archetypeId }) => (
              isOneByOneFootprint(archetypeId)
            ));
            const pool = singles.length
              ? singles
              : (districtSingles.length
                ? districtSingles
                : [{ id: 'cottage-federation', weight: 1 }]);
            choice = parcelRng.weighted(preferUnusedRows(pool, usedArchetypes));
            archetype = ARCHETYPES[choice.id];
            footprint = [1, 1];
            tiles = [id];
            rowFit = rowPlacementForFootprint(tiles, footprint, rowByParcel);
          }
          usedArchetypes.add(choice.id);

          const tram = tiles.some((tile) => {
            const position = parseParcelId(tile);
            return tileFrontsTram(
              corridors,
              position.bx,
              position.bz,
              position.tx,
              position.tz,
            );
          });
          const model = modelPlacement(footprint, face.rotation, rowFit.placement);
          const condition = drawCondition(parcelRng, archetype);
          const zoneId = zoneForAnchor(blockZone, tx, tz);

          const upliftBp = 10000
            + (tram ? RULES.tramFrontageBp : 0)
            + (face.corner ? RULES.cornerFrontageBp : 0);

          const bandedPrice = applyBp(archetype.basePrice, district.appliedBandBp);
          const bandedRent = applyBp(archetype.baseRent, district.appliedBandBp);
          const basePrice = roundTo(
            applyBp(applyBp(bandedPrice, upliftBp), RULES.conditionValueBp[condition]),
            5_000,
          );
          const baseRent = roundTo(
            applyBp(applyBp(bandedRent, upliftBp), RULES.conditionRentBp[condition]),
            100,
          );

          const tileCentres = tiles.map((tile) => {
            const position = parseParcelId(tile);
            return tileCentre(position.bx, position.bz, position.tx, position.tz);
          });
          const centre = {
            x: tileCentres.reduce((sum, point) => sum + point.x, 0) / tileCentres.length,
            z: tileCentres.reduce((sum, point) => sum + point.z, 0) / tileCentres.length,
          };

          const parcel = Object.freeze({
            id,
            bx, bz, tx, tz,
            tiles,
            districtId: district.id,
            districtName: district.name,
            zoneId,
            zoneSourceBlockKey,
            zoneSplit: blockZone.split,
            zoneCeilingStoreys: zoneCeilingStoreys(zoneId, district.districtCapStoreys),
            heightRegisterId: district.heightRegisterId,
            districtCapStoreys: district.districtCapStoreys,
            towerOverlay: district.towerOverlay,
            accent: district.accent,
            archetypeId: archetype.id,
            landUseId: archetype.id,
            landUseFamily: 'tradeable',
            sector: archetype.sector,
            storeys: archetype.storeys,
            // As authored for the model, and as rotated on the board.
            footprint: archetype.footprint,
            groundFootprint: footprint,
            rotation: face.rotation,
            frontages: face.frontages,
            corner: face.corner,
            tram,
            centre,
            placement: model,
            condition,
            basePrice,
            baseRent,
            upliftBp,
            rentUpliftBp: upliftBp,
            // Compatibility input for succession helpers; the authored district record
            // names the precomputed value `appliedBandBp`.
            bandBp: district.appliedBandBp,
            appliedBandBp: district.appliedBandBp,
            // The card and the ledger read this same string — §3, last paragraph.
            valuation: [
              `${archetype.label} base $${archetype.basePrice.toLocaleString()}`,
              `${district.name} applied band ${(district.appliedBandBp / 100).toFixed(2)}%`,
              `${CONDITION_LABELS[condition].toLowerCase()} condition`,
              tram ? `tram frontage +${(RULES.tramFrontageBp / 100).toFixed(1)}%` : null,
              face.corner ? `corner site +${(RULES.cornerFrontageBp / 100).toFixed(1)}%` : null,
            ].filter(Boolean).join(' · '),
          });

          parcels[id] = parcel;
          order.push(id);
          for (const tile of tiles) {
            if (tile !== id) covered[tile] = id;
          }
        }
      }
    }
  }

// V3.02 §2.1. Civic placement reclaims complete parcel ownership after the
  // tradeable draw. Each use consumes one layout start draw and walks order once.
  const civicPlacement = placeCivicUses({
    rng: layout,
    parcels,
    order,
    corridors,
    rightsOfWay: blockLayout.rightsOfWay,
    blocksX,
    blocksZ,
    frontsTram: parcelTileFrontsTram,
  });
  parcels = civicPlacement.parcels;
  order = civicPlacement.order;
  covered = civicPlacement.covered;
  nonTradeableTiles = {
    ...nonTradeableTiles,
    ...civicPlacement.civicTiles,
  };
  const civicUses = civicPlacement.civicUses.map((civic) => {
    const rowFit = rowPlacementForFootprint(civic.tiles, civic.groundFootprint, rowByParcel);
    if (!rowFit.valid) throw new Error(`civic ${civic.id} crossed its right of way`);
    return {
      ...civic,
      placement: modelPlacement(civic.groundFootprint, civic.rotation, rowFit.placement),
    };
  });

  // V3.70, owner-reported 2026-08-18: the two landmarks "sit outside the block on the road."
  //
  // V3.71 CORRECTION, measured 2026-08-18 by `mvp/tests/v371-landmark-overhang.mjs` against both
  // owner URLs. The paragraph that stood here blamed the ordering — `blockCoresForCity()` running
  // before civic placement, so "a two-tile landmark has nowhere to go but out over the kerb." That
  // is REFUTED, and it was a hypothesis rather than a finding.
  //
  //   1. `placeCivicUses()` never lands on the core tile in the first place. `landuse.js:654-657`
  //      rejects any candidate footprint containing tx===1 && tz===1. The core cannot displace a
  //      civic because the civic is never offered that tile.
  //   2. The overhang is an ENVELOPE-vs-PAD mismatch and it is present whatever the core does.
  //      These uses are registered `footprint: [1,2]` (16 x 32 m claim, 15 x 31 m envelope), but
  //      `board.js:_buildCivicBuildings` calls `buildingKit.get(useId, null, facade)` with NO
  //      `lotSpan`, so `landmarks/index.js:69` falls back to the AUTHORED `[2,2]` and builds at
  //      31 x 31 m. Measured on seed 0: the town hall's rendered AABB spans 28.40 m across a 16 m
  //      pad and clears the block's north kerb by 6.70 m; the university spans 28.40 m across a
  //      16 m pad and clears the east kerb by 6.70 m. On the underwriter URL both measure 31.56 m
  //      across a 16 m pad, 7.78 m out on each side.
  //
  // So the kerb overhang is NOT fixed here and cannot be — `board.js` and `landuse.js` are
  // outside this lane. Filed as an orchestrator request in
  // `_reviews/quality-loop/v371/a-landmark/r1-builder.md`.
  //
  // What the mark below DOES fix is the second, separate fault the same measurement found: the
  // landmark mesh interpenetrates the block core in its own block — 5.58 m of overlap on seed 0
  // (both landmarks), 7.66-7.69 m on the underwriter URL. A landmark standing through a
  // playground is worth removing on its own account.
  //
  // The fix is a post-pass rather than a reorder: cores are drawn from a district weight table and
  // reordering the draw would move every core on every seed. Dropping the core from the handful of
  // blocks that host an oversized civic changes only those blocks.
  const LARGE_CIVIC_IDS = new Set(['town-hall-melbourne', 'university-old-arts']);
  const landmarkBlocks = new Set(
    civicUses
      .filter((civic) => LARGE_CIVIC_IDS.has(civic.useId))
      .map((civic) => `${civic.bx},${civic.bz}`),
  );
  // NOTE: the cores CANNOT simply be filtered out. `blockCores` feeds display-route construction
  // (`city.js:1320`), which throws `NO_DISPLAY_ROUTE` when a core it expects is missing — a block
  // core is a route node as well as a building. Dropping two cores broke city generation outright.
  //
  // So the landmark blocks are marked rather than emptied, and the RENDER side is what must honour
  // the mark. V3.71: the mark is now PUBLISHED on the returned city (`coreSuppressedBlocks`, a
  // sorted array of `"bx,bz"` keys) and `render/block-cores/index.js` skips the mesh for those
  // blocks. The core stays in `city.blockCores` throughout — it is a display-route node, and the
  // `NO_DISPLAY_ROUTE` note above is the reason, not a suggestion.
  const coreSuppressedBlocks = landmarkBlocks;

  // Cityscape roster: at least four warehouses, one of them Hammerbarn.
  // Unique types first (Hammerbarn, brick, loft). Excess 1×2 industrial becomes office-lowrise.
  {
    const TARGET = 4;
    const scoreDistrict = (d) => {
      if (d === 'richmond-flat') return 0;
      if (d === 'docklands-quay') return 1;
      return 2;
    };
    const rankCandidates = (ids) => ids.slice().sort((a, b) => {
      const pa = parcels[a];
      const pb = parcels[b];
      const d = scoreDistrict(pa.districtId) - scoreDistrict(pb.districtId);
      if (d !== 0) return d;
      return padArea(pb) - padArea(pa);
    });
    const warehouseOrder = order.filter((id) => WAREHOUSE_IDS.has(parcels[id]?.archetypeId));
    if (warehouseOrder.length > TARGET) {
      const keep = new Set(warehouseOrder.slice(0, TARGET));
      const extra = warehouseOrder.filter((id) => !keep.has(id));
      const office = ARCHETYPES['office-lowrise'] ?? ARCHETYPES['tower-office'];
      for (const id of extra) {
        parcels[id] = skinParcel(parcels[id], office.id);
      }
    }
    const current = () => order.filter((id) => WAREHOUSE_IDS.has(parcels[id]?.archetypeId));
    const haveType = (type) => current().some((id) => parcels[id].archetypeId === type);
    const twoTile = (id) => padArea(parcels[id]) >= 2;
    if (!haveType('hammerbarn')) {
      const host = rankCandidates(current().filter(twoTile))[0]
        ?? rankCandidates(order.filter((id) => parcels[id] && twoTile(id)))[0];
      if (host) parcels[host] = skinParcel(parcels[host], 'hammerbarn');
    }
    for (const type of WAREHOUSE_ROSTER) {
      if (current().length >= TARGET) break;
      if (haveType(type)) continue;
      const needTwo = STRICT_TWO_TILE_IDS.has(type);
      const host = rankCandidates(order.filter((id) => {
        const p = parcels[id];
        if (!p || WAREHOUSE_IDS.has(p.archetypeId)) return false;
        if (needTwo && padArea(p) < 2) return false;
        // Loft is a Richmond subject. Do not stamp it onto a Docklands 1×2 office
        // just because that is the only two-tile pad left.
        if (type === 'warehouse-richmond-loft' && p.districtId !== 'richmond-flat') return false;
        return true;
      }))[0];
      if (host) parcels[host] = skinParcel(parcels[host], type);
    }
    while (current().length < TARGET) {
      const host = rankCandidates(order.filter((id) => {
        const p = parcels[id];
        return p && !WAREHOUSE_IDS.has(p.archetypeId);
      }))[0];
      if (!host) break;
      parcels[host] = skinParcel(parcels[host], 'warehouse-brick');
    }
    // Last defence: a 1×2 loft identity on a 1-tile pad is the pre-V3.32 kit
    // overhanging its lot. Reskin to brick, which the industrial kit can size.
    for (const id of current()) {
      if (parcels[id].archetypeId === 'warehouse-richmond-loft' && padArea(parcels[id]) < 2) {
        parcels[id] = skinParcel(parcels[id], 'warehouse-brick');
      }
    }
  }

  if (String(seed) === '0') {
    parcels = applySeed0ModernReplacements(parcels, order);
  }

  // At least seven taller walk-ups (Beaux-Arts, Moderne, Art Deco). Unique types first.
  {
    const TARGET = 7;
    const walkupHome = new Set([
      'fitzroy-north', 'carlton-east', 'richmond-flat', 'brunswick-rise',
    ]);
    const isTall = (id) => TALL_WALKUP_IDS.includes(parcels[id]?.archetypeId);
    const usedTypes = new Set(order.filter(isTall).map((id) => parcels[id].archetypeId));
    const candidates = order.filter((id) => {
      const p = parcels[id];
      if (!p || WAREHOUSE_IDS.has(p.archetypeId) || isTall(id)) return false;
      if (p.sector !== 'residential') return false;
      if (String(p.archetypeId).startsWith('shop')) return false;
      if (padArea(p) !== 1) return false;
      return walkupHome.has(p.districtId) || p.districtId === 'brighton-reach';
    }).sort((a, b) => {
      const da = walkupHome.has(parcels[a].districtId) ? 0 : 1;
      const db = walkupHome.has(parcels[b].districtId) ? 0 : 1;
      return da - db || a.localeCompare(b);
    });
    let have = order.filter(isTall).length;
    let cursor = 0;
    while (have < TARGET && cursor < candidates.length) {
      const type = TALL_WALKUP_IDS.find((id) => !usedTypes.has(id))
        ?? TALL_WALKUP_IDS[have % TALL_WALKUP_IDS.length];
      const host = candidates[cursor];
      cursor += 1;
      const dest = type === 'walkup-beaux-arts' && parcels[host].districtId === 'brighton-reach'
        ? 'art-deco-flats'
        : type;
      parcels[host] = skinParcel(parcels[host], dest);
      usedTypes.add(dest);
      have += 1;
    }
  }

  // V3.02 §2.2–2.5. The complete field is content, solved once before adjacency.
  const amenityField = solveAmenityField({
    parcels,
    order,
    civicUses,
    blockCores: blockLayout.cores,
    coreSuppressedBlocks: Array.from(coreSuppressedBlocks),
    reserve: reserveLocation,
    waterEdge,
    blocksX,
    blocksZ,
  });
  parcels = Object.fromEntries(order.map((id) => {
    const parcel = amenityField.parcels[id];
    const district = districtByBlock.get(`${parcel.bx},${parcel.bz}`);
    const archetype = ARCHETYPES[parcel.archetypeId];
    const upliftBp = 10000
      + (parcel.tram ? RULES.tramFrontageBp : 0)
      + (parcel.corner ? RULES.cornerFrontageBp : 0)
      + parcel.amenityValueBp;
    const rentUpliftBp = 10000
      + (parcel.tram ? RULES.tramFrontageBp : 0)
      + (parcel.corner ? RULES.cornerFrontageBp : 0)
      + parcel.amenityRentBp;
    const rebased = buildingBaseFor({
      ...parcel,
      bandBp: district.appliedBandBp,
      appliedBandBp: district.appliedBandBp,
      upliftBp,
      rentUpliftBp,
    }, archetype.id, parcel.condition);
    const amenityClause = parcel.amenityValueBp === 0
      ? null
      : `amenity net ${parcel.amenityValueBp > 0 ? '+' : '−'}${(
        Math.abs(parcel.amenityValueBp) / 100
      ).toFixed(1)}%`;
    return [id, Object.freeze({
      ...parcel,
      topologyVersion: 0,
      componentParcelIds: Object.freeze([id]),
      successionSourceId: id,
      consolidated: false,
      basePrice: rebased.basePrice,
      baseRent: rebased.baseRent,
      upliftBp,
      rentUpliftBp,
      valuation: [
        `${archetype.label} base $${archetype.basePrice.toLocaleString()}`,
        `${district.name} applied band ${(district.appliedBandBp / 100).toFixed(2)}%`,
        `${CONDITION_LABELS[parcel.condition].toLowerCase()} condition`,
        parcel.tram ? `tram frontage +${(RULES.tramFrontageBp / 100).toFixed(1)}%` : null,
        parcel.corner ? `corner site +${(RULES.cornerFrontageBp / 100).toFixed(1)}%` : null,
        amenityClause,
      ].filter(Boolean).join(' · '),
    })];
  }));

  // Adjacency across the whole occupied-tile set, so multi-tile buildings link correctly.
  const tileOwner = {};
  for (const id of order) for (const t of parcels[id].tiles) tileOwner[t] = id;
  const maxGx = blocksX * TILES_PER_BLOCK - 1;
  const maxGz = blocksZ * TILES_PER_BLOCK - 1;
  const adjacency = {};
  for (const id of order) {
    const set = new Set();
    for (const t of parcels[id].tiles) {
      const p = parseParcelId(t);
      const { gx, gz } = globalTile(p.bx, p.bz, p.tx, p.tz);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = gx + dx;
        const nz = gz + dz;
        if (nx < 0 || nz < 0 || nx > maxGx || nz > maxGz) continue;
        const nBx = Math.floor(nx / TILES_PER_BLOCK);
        const nBz = Math.floor(nz / TILES_PER_BLOCK);
        const neighbourTile = parcelId(nBx, nBz, nx % TILES_PER_BLOCK, nz % TILES_PER_BLOCK);
        const owner = tileOwner[neighbourTile];
        if (owner && owner !== id) set.add(owner);
      }
    }
    adjacency[id] = Array.from(set).sort();
  }

  // 5. Props and reserve dressing (visual only — their own stream cannot move economy)
  const reserve = dressReserve(propRng, reserveLocation);
  const props = propsForCity(propRng, blocksX, blocksZ, corridors);
  const trees = [
    ...treesForCity(propRng, blocksX, blocksZ, corridors),
    ...reserveTreesForCity(propRng, reserve),
    ...coreTreesForCity(propRng, blockLayout.cores),
  ];
  const transit = transitForCity(blocksX, blocksZ, corridors);
  const waterfront = waterfrontForCity(propRng, waterEdge, cityExtent(blocksX, blocksZ));

  // V3.03 derived walking and exposure content. These are pure geometry records:
  // no people/event stream is consumed and no runtime decision is authored here.
  const walkAnchors = [
    ...[...order].sort().map((id) => ({ kind: 'parcel', id })),
    ...[...civicUses].sort((a, b) => a.id.localeCompare(b.id))
      .map(({ id }) => ({ kind: 'civic', id })),
    ...(reserve ? [{ kind: 'reserve', id: reserve.id }] : []),
    ...[...blockLayout.cores].sort((a, b) => a.id.localeCompare(b.id))
      .map(({ id }) => ({ kind: 'core', id })),
    ...[...blockLayout.rightsOfWay].sort((a, b) => a.id.localeCompare(b.id))
      .map(({ id }) => ({ kind: 'core', id: `${id}:mouth` })),
  ].sort((left, right) =>
    `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`));
  const walkAnchorKeys = walkAnchors.map(({ kind, id }) => `${kind}:${id}`);
  const walkGraph = Object.fromEntries(walkAnchorKeys.map((key) => [
    key,
    walkAnchorKeys.filter((candidate) => candidate !== key),
  ]));
  const coreWalkGraph = buildCoreWalkGraph({
    city: {
      blocksX,
      blocksZ,
      extent: cityExtent(blocksX, blocksZ),
      corridors,
      rightsOfWay: blockLayout.rightsOfWay,
      civicUses,
      blockCores: blockLayout.cores,
      reserve,
    },
    parcels,
    walkAnchors,
  });
  const displayWalkGraph = buildDisplayWalkGraph({
    blocksX,
    blocksZ,
    corridors,
    rightsOfWay: blockLayout.rightsOfWay,
    blockCores: blockLayout.cores,
    reserve,
    parcels,
    civicUses,
    walkAnchors,
  });
  const eventExposure = Object.fromEntries([...order].sort().map((id) => {
    const distances = parcels[id].tiles.map((tileId) => {
      const { bx, bz, tx, tz } = parseParcelId(tileId);
      const { gx, gz } = globalTile(bx, bz, tx, tz);
      if (waterEdge === 'west') return gx + 1;
      if (waterEdge === 'east') return blocksX * TILES_PER_BLOCK - gx;
      if (waterEdge === 'north') return gz + 1;
      return blocksZ * TILES_PER_BLOCK - gz;
    });
    const waterDistance = Math.min(...distances);
    const floodExposureBp = waterDistance === 1
      ? 3200
      : waterDistance === 2
        ? 2000
        : waterDistance === 3
          ? 900
          : 100;
    return [id, {
      waterDistance,
      lowLying: waterDistance <= 2,
      floodExposureBp,
    }];
  }));

  return deepFreeze({
    seed,
    blocksX,
    blocksZ,
    quarters,
    extent: cityExtent(blocksX, blocksZ),
    waterEdge,
    waterEdgeBand: waterEdgeBandRecord(districtLayout.band, blocksX, blocksZ),
    waterfront,
    reserve,
    districts: DISTRICTS,
    districtByBlock: Object.fromEntries(districtByBlock),
    districtDriftPlan: createDistrictDriftPlan(seed, quarters),
    blockZones,
    districtSites: districtLayout.sites,
    corridors,
    blockCores: blockLayout.cores,
    // V3.71 lane A. Blocks whose core mesh must NOT be drawn because an oversized civic
    // (`LARGE_CIVIC_IDS`) stands through it. Keys are `"bx,bz"`. The cores themselves stay in
    // `blockCores` — see the note at the `coreSuppressedBlocks` assignment; removing them there
    // throws `NO_DISPLAY_ROUTE`. Render-side consumer: `render/block-cores/index.js` `_build()`.
    coreSuppressedBlocks: Array.from(coreSuppressedBlocks).sort(),
    rightsOfWay: blockLayout.rightsOfWay,
    civicUses,
    civicShortfall: civicPlacement.civicShortfall,
    amenityEmitters: amenityField.emitters,
    parcels,
    covered,
    nonTradeableTiles,
    order,
    adjacency,
    walkAnchors,
    walkGraph,
    coreWalkGraph,
    displayWalkGraph,
    eventExposure,
    props,
    trees,
    transit,
    market: marketTable(marketRng, quarters),
  });
}
