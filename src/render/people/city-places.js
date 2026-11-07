// District Deck H-LIFE — resolve story place ids against the live city.
// Presentation catalog. No sim writes.

import { BLOCK, CORRIDOR, PITCH, ROAD } from '../../core/grid.js';
import { buildingFootprintAabbs } from '../navmesh.js';
import { SHORE, boardwalkCentre, shorePoint } from '../shore.js';
import { corridorCell, deckTopY, esplanadeFlights, tramStops } from './city-surface.js';

/**
 * Stand a walker on the pavement in front of a building, not inside the mass.
 * Civic centres sit on parcel interiors; a plate cannot prove "at the cafe"
 * if the body is buried in the shopfront.
 */
export function pavementFront(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { x: 0, z: 0 };
  const cell = corridorCell(x, z);
  if (cell) {
    if (cell.kind === 'footpath') return { x, z };
    const foot = cell.local < ROAD / 2 ? CORRIDOR.footpathCentreLow : CORRIDOR.footpathCentreHigh;
    if (cell.axis === 'v') return { x: cell.low + foot, z };
    return { x, z: cell.low + foot };
  }
  const cx = ((x % PITCH) + PITCH) % PITCH;
  const cz = ((z % PITCH) + PITCH) % PITCH;
  const localX = cx - ROAD;
  const localZ = cz - ROAD;
  if (localX < 0 || localX > BLOCK || localZ < 0 || localZ > BLOCK) return { x, z };
  const west = localX;
  const east = BLOCK - localX;
  const north = localZ;
  const south = BLOCK - localZ;
  const nearest = Math.min(west, east, north, south);
  const baseX = x - cx;
  const baseZ = z - cz;
  if (nearest === west) return { x: baseX + CORRIDOR.footpathCentreHigh, z };
  if (nearest === east) return { x: baseX + PITCH + CORRIDOR.footpathCentreLow, z };
  if (nearest === north) return { x, z: baseZ + CORRIDOR.footpathCentreHigh };
  return { x, z: baseZ + PITCH + CORRIDOR.footpathCentreLow };
}

const CIVIC_ALIASES = Object.freeze({
  cafe: Object.freeze(['cafe-corner']),
  shop: Object.freeze(['shop-corner', 'supermarket-strip']),
  exchange: Object.freeze(['stock-exchange', 'transport-interchange']),
  work: Object.freeze(['factory-light', 'warehouse-brick', 'transport-interchange']),
  site: Object.freeze(['factory-light', 'warehouse-brick', 'remand-centre']),
  school: Object.freeze(['school-primary', 'childcare-centre']),
});

/**
 * Slide from the street stand toward the building centre.
 * bias 0 = kerb, 1 = parcel centroid. Cafe terrace ~0.38; yard/lot ~0.72.
 */
export function occupyFront(cx, cz, bias = 0.4) {
  const pavement = pavementFront(cx, cz);
  return {
    x: pavement.x + (cx - pavement.x) * bias,
    z: pavement.z + (cz - pavement.z) * bias,
  };
}

/**
 * Metres from the kerb onto a frontage, then along it.
 * Bias fractions hid the tradie inside the shed and sat the designer
 * between planters; chairs and yards are a couple of metres in, then sideways.
 */
export function terraceSeat(cx, cz, inwardM = 2.2, alongM = 2.0) {
  const pavement = pavementFront(cx, cz);
  const ix = cx - pavement.x;
  const iz = cz - pavement.z;
  const len = Math.hypot(ix, iz) || 1;
  const ux = ix / len;
  const uz = iz / len;
  return {
    x: pavement.x + ux * inwardM - uz * alongM,
    z: pavement.z + uz * inwardM + ux * alongM,
    yaw: Math.atan2(ux, uz),
  };
}

/** Sister chair on the same terrace — one seat over, same facing. */
export function terraceCompanion(cx, cz, inwardM = 2.45, alongM = 2.20, gapM = 1.15) {
  return terraceSeat(cx, cz, inwardM, alongM + gapM);
}

/**
 * Front hardstand of a 1×2 industrial civic. The kit yard is local +Z;
 * rotation 180 maps that to world −Z (south on seed 0). Terrace metres
 * along the west flank land inside the brick, not on the slab.
 */
export function industrialYardSeat(civic) {
  const c = civic?.centre;
  if (!c) return null;
  const rot = ((civic.rotation ?? 0) * Math.PI) / 180;
  const fx = Math.sin(rot);
  const fz = Math.cos(rot);
  const rx = Math.cos(rot);
  const rz = -Math.sin(rot);
  const offset = civic.placement?.modelOffset ?? { x: 0, z: 0 };
  return {
    x: c.x + (offset.x ?? 0) + fx * 9.0 + rx * 1.4,
    z: c.z + (offset.z ?? 0) + fz * 9.0 + rz * 1.4,
    yaw: Math.atan2(fx, fz),
  };
}

/**
 * Walk a stand point back out of a building envelope, along the line it came in on.
 *
 * V3.70 L2. The terrace and forecourt metres in `catalogPlaces` were measured off plates rather
 * than against the envelope AABBs, and two of them land *inside* one: the cafe terrace seat sits
 * 3.15 m into `civic-cafe-corner-1` and the exchange forecourt 30 per cent of the way to the
 * centroid of `civic-stock-exchange-1`. The pavement probe scores 2 009 of its 120 000 samples as
 * "inside a building" for that one reason, and V3.32 §3's I-29 gate — no figure centre inside a
 * building, every frame — says the same thing more sharply.
 *
 * The fix keeps the read and loses the violation: slide the stand back toward the kerb until it
 * clears the envelope by `margin`. A figure at the shopfront still reads as *at the cafe*; a
 * figure 3 m inside the shopfront reads as inside the shop.
 */
export function clearOfEnvelope(point, kerb, footprints, margin = 0.35) {
  if (!footprints?.length || !point) return point;
  const dx = point.x - kerb.x;
  const dz = point.z - kerb.z;
  const span = Math.hypot(dx, dz);
  if (span < 1e-3) return point;
  const steps = 24;
  for (let step = 0; step <= steps; step += 1) {
    const t = 1 - step / steps;
    const x = kerb.x + dx * t;
    const z = kerb.z + dz * t;
    let inside = false;
    for (const box of footprints) {
      if (x >= box.minX - margin && x <= box.maxX + margin
        && z >= box.minZ - margin && z <= box.maxZ + margin) { inside = true; break; }
    }
    if (!inside) return { ...point, x, z };
  }
  return { ...point, x: kerb.x, z: kerb.z };
}

function civicCentre(city, useIds, bias = 0.4, metres = null, footprints = null) {
  const uses = city?.civicUses ?? [];
  for (const want of useIds) {
    const hit = uses.find((civic) => civic.useId === want && civic.centre);
    if (hit) {
      const yard = (want === 'factory-light' || want === 'warehouse-brick')
        ? industrialYardSeat(hit)
        : null;
      const stand = yard
        ?? (metres
          ? terraceSeat(hit.centre.x, hit.centre.z, metres.inward, metres.along)
          : occupyFront(hit.centre.x, hit.centre.z, bias));
      const kerb = pavementFront(hit.centre.x, hit.centre.z);
      const clear = footprints ? clearOfEnvelope(stand, kerb, footprints) : stand;
      return {
        x: clear.x, z: clear.z, y: 0, id: hit.id, kind: want, yaw: stand.yaw ?? 0,
      };
    }
  }
  return null;
}

function firstParcelCentre(city) {
  const order = city?.order ?? [];
  const parcels = city?.parcels ?? {};
  for (const id of order) {
    const parcel = parcels[id];
    if (parcel?.centre) {
      const stand = pavementFront(parcel.centre.x, parcel.centre.z);
      return { x: stand.x, z: stand.z, y: 0, id, kind: 'parcel' };
    }
  }
  return null;
}

/**
 * Avenue kerb benches — one per block on the west footpath of the road east of the block.
 * Matches `board.js` `_buildAvenueKerbFurniture` lattice (low kerb, mid-block).
 */
export function catalogBenches(city) {
  const benches = [];
  const blocksX = city?.blocksX ?? 0;
  const blocksZ = city?.blocksZ ?? 0;
  const kerbLow = CORRIDOR.kerbLow - 0.55;
  for (let i = 1; i <= blocksX; i += 1) {
    for (let bz = 0; bz < blocksZ; bz += 1) {
      benches.push({
        x: i * PITCH + kerbLow,
        z: ROAD + bz * PITCH + BLOCK / 2,
        y: 0,
        yaw: Math.PI / 2,
        kind: 'bench',
      });
    }
  }
  if (city?.reserve?.centre) {
    const { x, z } = city.reserve.centre;
    benches.push(
      { x: x + 4.6, z: z + 6.2, y: 0, yaw: Math.PI, kind: 'bench' },
      { x: x + 4.6, z: z - 5.4, y: 0, yaw: 0, kind: 'bench' },
      { x: x + 8.4, z: z + 0.4, y: 0, yaw: -Math.PI / 2, kind: 'bench' },
      { x: x + 0.8, z: z + 0.4, y: 0, yaw: Math.PI / 2, kind: 'bench' },
    );
  }
  return benches;
}

export function nearestBench(x, z, benches, maxDist = 5.5) {
  let best = null;
  let bestD = maxDist;
  for (const bench of benches ?? []) {
    const d = Math.hypot((bench.x ?? 0) - x, (bench.z ?? 0) - z);
    if (d < bestD) {
      bestD = d;
      best = bench;
    }
  }
  return best;
}

export function catalogPlaces(city) {
  // Path ring just off the rotunda deck — not the hedge at +7.4 / +3.1.
  const reserve = city?.reserve?.centre
    ? {
      x: city.reserve.centre.x + 4.6,
      z: city.reserve.centre.z + 0.4,
      y: 0,
      id: city.reserve.id,
      kind: 'reserve',
    }
    : null;
  const stops = tramStops(city);
  const tram = stops[0]
    ? { x: stops[0].x, z: stops[0].z, y: 0, id: 'tram-0', kind: 'tram' }
    : null;
  const flights = esplanadeFlights(city);
  const flight = flights[0] ?? null;
  const stairs = flight
    ? {
      x: flight.originX, z: flight.originZ, y: flight.deckY,
      id: flight.id, kind: 'stairs',
    }
    : null;
  const edge = city?.waterEdge;
  const extent = city?.extent;
  let promenade = null;
  let beach = null;
  let look = null;
  if (edge && extent) {
    const walk = boardwalkCentre(edge, extent);
    promenade = { x: walk.x, z: walk.z, y: deckTopY(), id: 'promenade', kind: 'promenade' };
    const sand = shorePoint(edge, extent, SHORE.wallOffset + SHORE.wallDeep + 10, 0);
    beach = { x: sand.x, z: sand.z, y: SHORE.sandY ?? 0.06, id: 'beach', kind: 'beach' };
    if (flight) {
      look = {
        x: flight.originX + flight.seawardX * 0.2,
        z: flight.originZ + flight.seawardZ * 0.2,
        y: flight.deckY,
        id: 'look-sea',
        kind: 'look-sea',
      };
    }
  }
  // Every civic stand is walked back clear of its own envelope — V3.32 §3's I-29 gate, applied
  // where the number is authored rather than patched per frame by the walker.
  const fp = buildingFootprintAabbs(city);
  return {
    cafe: civicCentre(city, CIVIC_ALIASES.cafe, 0.38, { inward: 3.15, along: 2.00 }, fp),
    // +along is the empty sister chair. −along (0.85) sat the barista in the planter.
    cafeCompanion: civicCentre(city, CIVIC_ALIASES.cafe, 0.38, { inward: 3.15, along: 3.15 }, fp),
    shop: civicCentre(city, CIVIC_ALIASES.shop, 0.34, null, fp),
    exchange: civicCentre(city, CIVIC_ALIASES.exchange, 0.30, null, fp),
    work: civicCentre(city, CIVIC_ALIASES.work, 0.55, null, fp),
    site: civicCentre(city, CIVIC_ALIASES.site, 0.18, { inward: 5.20, along: -9.80 }, fp),
    school: civicCentre(city, CIVIC_ALIASES.school, 0.40, null, fp),
    parcel: firstParcelCentre(city),
    reserve,
    tram,
    stairs,
    promenade,
    beach,
    'look-sea': look,
  };
}

/**
 * Home is the actor's spawn. Missing catalog entries fall back to home
 * so a city without a cafe never NaNs a walker.
 */
export function resolvePlace(kind, actor, places) {
  if (kind === 'home' || !kind) {
    return {
      x: actor.homeX ?? actor.x,
      z: actor.homeZ ?? actor.z,
      y: actor.baseY ?? 0,
      kind: 'home',
    };
  }
  const hit = places?.[kind];
  if (hit && Number.isFinite(hit.x) && Number.isFinite(hit.z)) return hit;
  return {
    x: actor.homeX ?? actor.x,
    z: actor.homeZ ?? actor.z,
    y: actor.baseY ?? 0,
    kind: 'home',
  };
}
