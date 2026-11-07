// District Deck H-LIFE — measured walkable surfaces for pedestrians.
//
// Reconstructs esplanade stairs and balustrades from the same SHORE / board
// constants `_buildEsplanade` uses. The catalog is arithmetic, not a scene walk,
// so a headless test can ask "is this point on a tread" without a renderer.
//
// Keep these numbers in lockstep with board.js `_buildEsplanade`:
//   stairBays 3, steps 8, run 0.52, stepW 2.2, deckTopY = SHORE.wallH - 0.08
//   rail seaward = boardwalkW * 0.46 from walkPos
//   openings at stair bays and the single centre pier throat
//
// Junctions use the same lattice as traffic.js `cityJunctions` (not exported).

import { CORRIDOR, PITCH, ROAD } from '../../core/grid.js';
import { buildingFootprintAabbs } from '../navmesh.js';
import {
  SHORE, alongLength, boardwalkCentre, edgeAxes, shorePoint,
} from '../shore.js';

export const ESPLANADE_STAIR = Object.freeze({
  bays: 3,
  steps: 8,
  run: 0.52,
  width: 2.2,
});

export function deckTopY() {
  return SHORE.wallH - 0.08;
}

function alongOf(edge, extent) {
  return alongLength(edge, extent);
}

function stairBayTs(L) {
  const { bays } = ESPLANADE_STAIR;
  return Array.from({ length: bays }, (_, b) => (
    (b / Math.max(1, bays - 1) - 0.5) * (L * 0.55)
  ));
}

function pierBayTs(edge, extent) {
  const L = alongOf(edge, extent);
  const pierCount = 1;
  const frameLen = edge === 'north' || edge === 'south' ? extent.x : extent.z;
  const pierMargin = Math.max(28, frameLen * 0.12);
  const pierUsable = Math.max(frameLen - pierMargin * 2, 40);
  const pierStep = pierCount <= 1 ? 0 : pierUsable / (pierCount - 1);
  return Array.from({ length: pierCount }, (_, i) => (
    pierCount === 1 ? 0 : (pierMargin + pierStep * i) - frameLen * 0.5
  ));
}

/**
 * Three seaward flights per water edge, top centre on the boardwalk.
 */
export function esplanadeFlights(city) {
  const edge = city?.waterEdge;
  const extent = city?.extent;
  if (!edge || !extent) return [];
  const { seaward, along } = edgeAxes(edge);
  const L = alongOf(edge, extent);
  const walk = boardwalkCentre(edge, extent);
  const deckY = deckTopY();
  const sandY = SHORE.sandY ?? 0.06;
  const rise = (deckY - sandY) / ESPLANADE_STAIR.steps;
  // Match board.js tread schedule: first tread centre is
  // walk + seaward * (boardwalkW * 0.48 + run * 0.5). Origin is out=0
  // at the top landing, so seaward offset is boardwalkW * 0.48.
  const stairSeaward = SHORE.boardwalkW * 0.48;
  const flights = [];
  for (const t of stairBayTs(L)) {
    const top = shorePoint(edge, extent, 0, t);
    const originX = walk.x + seaward.x * stairSeaward + along.x * t;
    const originZ = walk.z + seaward.z * stairSeaward + along.z * t;
    flights.push({
      id: `esplanade-stair:${edge}:${t.toFixed(1)}`,
      originX,
      originZ,
      seawardX: seaward.x,
      seawardZ: seaward.z,
      alongX: along.x,
      alongZ: along.z,
      rise,
      run: ESPLANADE_STAIR.run,
      count: ESPLANADE_STAIR.steps,
      width: ESPLANADE_STAIR.width,
      deckY,
      sandY,
      alongT: t,
      edge,
      // unused, keeps the helper referenced so a refactor cannot drop shorePoint
      _boardT: top.x + top.z,
    });
  }
  return flights;
}

/**
 * Landward wells through the seawall — board.js `landBayTs` / landSteps.
 * Down-direction is toward the city so a climber's feet track the railed wall,
 * not the seaward sand stringers the r1h critic called a wrecked pier.
 */
export function landwardFlights(city) {
  const edge = city?.waterEdge;
  const extent = city?.extent;
  if (!edge || !extent) return [];
  const { seaward, along } = edgeAxes(edge);
  const L = alongOf(edge, extent);
  const deckY = deckTopY();
  const climbStart = 0.3;
  const climbEnd = SHORE.wallOffset + SHORE.wallDeep * 0.48 - SHORE.boardwalkW * 0.08;
  const count = 10;
  const span = climbEnd - climbStart;
  const rise = deckY / count;
  const run = span / count;
  return [-0.2 * L, 0.2 * L].map((t) => {
    const top = shorePoint(edge, extent, climbEnd, t);
    return {
      id: `landward-stair:${edge}:${t.toFixed(1)}`,
      originX: top.x,
      originZ: top.z,
      seawardX: -seaward.x,
      seawardZ: -seaward.z,
      alongX: along.x,
      alongZ: along.z,
      rise,
      run,
      count,
      width: 2.15,
      deckY,
      sandY: 0,
      alongT: t,
      edge,
      landward: true,
    };
  });
}

/**
 * Seaward handrail segments, gapped at stairs and pier throats — same openings
 * as board.js so a pedestrian cannot walk through a rail the plate draws.
 */
export function esplanadeRails(city) {
  const edge = city?.waterEdge;
  const extent = city?.extent;
  if (!edge || !extent) return [];
  const { seaward, along } = edgeAxes(edge);
  const L = alongOf(edge, extent);
  const walk = boardwalkCentre(edge, extent);
  const railSeaward = SHORE.boardwalkW * 0.46;
  const stepOpen = ESPLANADE_STAIR.width * 0.55 + 0.45;
  const pierOpen = 5.4 * 0.52 + 0.35;
  const gaps = [
    ...stairBayTs(L).map((t) => ({ t, half: stepOpen })),
    ...pierBayTs(edge, extent).map((t) => ({ t, half: pierOpen })),
  ];
  const railSpan = L - 1.6;
  const railMin = -railSpan * 0.5;
  const railMax = railSpan * 0.5;
  const openings = gaps
    .map((g) => [Math.max(railMin, g.t - g.half), Math.min(railMax, g.t + g.half)])
    .filter(([a, b]) => b > a + 0.15)
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const op of openings) {
    if (!merged.length || op[0] > merged[merged.length - 1][1] + 0.05) merged.push(op.slice());
    else merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], op[1]);
  }
  const segments = [];
  let cursor = railMin;
  for (const [o0, o1] of merged) {
    if (o0 - cursor > 0.35) segments.push([cursor, o0]);
    cursor = o1;
  }
  if (railMax - cursor > 0.35) segments.push([cursor, railMax]);

  return segments.map(([a0, a1], i) => {
    const ax = walk.x + seaward.x * railSeaward + along.x * a0;
    const az = walk.z + seaward.z * railSeaward + along.z * a0;
    const bx = walk.x + seaward.x * railSeaward + along.x * a1;
    const bz = walk.z + seaward.z * railSeaward + along.z * a1;
    return {
      id: `esplanade-rail:${edge}:${i}`,
      ax, az, bx, bz,
      nx: seaward.x,
      nz: seaward.z,
      y: deckTopY() + 0.52,
    };
  });
}

/**
 * Corridor crossings — same lattice as traffic.js cityJunctions.
 */
export function cityCrossings(city) {
  const blocksX = city?.blocksX ?? 0;
  const blocksZ = city?.blocksZ ?? 0;
  const junctions = [];
  for (let i = 0; i <= blocksX; i += 1) {
    for (let j = 0; j <= blocksZ; j += 1) {
      const interior = i >= 1 && i < blocksX && j >= 1 && j < blocksZ;
      const x = i * PITCH + ROAD / 2;
      const z = j * PITCH + ROAD / 2;
      junctions.push({
        x,
        z,
        signalised: interior && ((i + j) % 2 === 1),
        key: `${Math.round(x)}:${Math.round(z)}`,
        interior,
      });
    }
  }
  return junctions;
}

/** Melbourne tram-stop mid-block points on tram corridors, if the city flags them. */
export function tramStops(city) {
  const stops = [];
  const corridors = city?.corridors;
  if (!corridors) return stops;
  const vertical = (corridors.vertical ?? []).filter((c) => c.tram);
  const horizontal = (corridors.horizontal ?? []).filter((c) => c.tram);
  const blocksZ = city.blocksZ ?? 0;
  const blocksX = city.blocksX ?? 0;
  for (const c of vertical) {
    const x = c.x ?? (c.index * PITCH + ROAD / 2);
    for (let bz = 0; bz < blocksZ; bz += 1) {
      const z = ROAD + bz * PITCH + 24;
      stops.push({
        x: x - ROAD / 2 + CORRIDOR.kerbHigh + 0.55,
        z,
        yaw: Math.PI / 2,
        axis: 'v',
      });
    }
  }
  for (const c of horizontal) {
    const z = c.z ?? (c.index * PITCH + ROAD / 2);
    for (let bx = 0; bx < blocksX; bx += 1) {
      const x = ROAD + bx * PITCH + 24;
      stops.push({
        x,
        z: z - ROAD / 2 + CORRIDOR.kerbHigh + 0.55,
        yaw: 0,
        axis: 'h',
      });
    }
  }
  return stops;
}

/**
 * Which strip of a corridor this point sits in, or null if it is inside a block.
 */
export function corridorCell(x, z) {
  const cx = ((x % PITCH) + PITCH) % PITCH;
  const cz = ((z % PITCH) + PITCH) % PITCH;
  if (cx < ROAD) {
    return { axis: 'v', local: cx, low: x - cx, kind: stripKind(cx) };
  }
  if (cz < ROAD) {
    return { axis: 'h', local: cz, low: z - cz, kind: stripKind(cz) };
  }
  return null;
}

function stripKind(local) {
  if (local < CORRIDOR.footpathA[1]) return 'footpath';
  if (local < CORRIDOR.carriagewayA[1]) return 'carriageway';
  if (local < CORRIDOR.tramReservation[1]) return 'tram';
  if (local < CORRIDOR.carriagewayB[1]) return 'carriageway';
  return 'footpath';
}

export function isCarriageway(x, z) {
  const cell = corridorCell(x, z);
  return cell?.kind === 'carriageway' || cell?.kind === 'tram';
}

/**
 * Kerb stand points that face across a tram reservation at each tram junction.
 * Two per crossing (both footpaths) so a zebra has a waiter on each side.
 */
export function tramKerbStands(city) {
  const crossings = cityCrossings(city);
  const corridors = city?.corridors;
  const vTram = new Set(
    (corridors?.vertical ?? [])
      .filter((c) => c.tram)
      .map((c) => c.index * PITCH + ROAD / 2),
  );
  const hTram = new Set(
    (corridors?.horizontal ?? [])
      .filter((c) => c.tram)
      .map((c) => c.index * PITCH + ROAD / 2),
  );
  const stands = [];
  // Same offset streetscape.js uses for junction tactile pads
  // (`ROAD/2 + 0.62`). The kerb stand sat 3 m east of the gold pad
  // and the after plate read as mid-box idle (r1p).
  const ramp = ROAD / 2 + 0.62;
  const farWest = CORRIDOR.kerbHigh;
  const farEast = CORRIDOR.kerbLow;
  for (const crossing of crossings) {
    const onV = vTram.has(crossing.x);
    const onH = hTram.has(crossing.z);
    if (!onV && !onH) continue;
    const x0 = crossing.x - ROAD / 2;
    const z0 = crossing.z - ROAD / 2;
    if (onV) {
      const z = crossing.z;
      stands.push({
        x: crossing.x - ramp,
        z,
        yaw: Math.PI / 2,
        far: { x: x0 + farWest, z },
        crossing,
        axis: 'v',
      });
      stands.push({
        x: crossing.x + ramp,
        z,
        yaw: -Math.PI / 2,
        far: { x: x0 + farEast, z },
        crossing,
        axis: 'v',
      });
    }
    if (onH) {
      const x = crossing.x;
      stands.push({
        x,
        z: crossing.z - ramp,
        yaw: 0,
        far: { x, z: z0 + farWest },
        crossing,
        axis: 'h',
      });
      stands.push({
        x,
        z: crossing.z + ramp,
        yaw: Math.PI,
        far: { x, z: z0 + farEast },
        crossing,
        axis: 'h',
      });
    }
  }
  return stands;
}

/** Opposite footpath across the same corridor, or null when not beside one. */
export function oppositeKerb(x, z) {
  const cell = corridorCell(x, z);
  if (!cell) return null;
  const far = cell.local < ROAD / 2 ? CORRIDOR.footpathCentreHigh : CORRIDOR.footpathCentreLow;
  if (cell.axis === 'v') return { x: cell.low + far, z, axis: 'v' };
  return { x, z: cell.low + far, axis: 'h' };
}

function seawardOut(x, z, world) {
  const edge = world?.waterEdge;
  const extent = world?.extent;
  if (!edge || !extent) return null;
  const { seaward } = edgeAxes(edge);
  const walk = boardwalkCentre(edge, extent);
  return (x - walk.x) * seaward.x + (z - walk.z) * seaward.z;
}

/** Street / lot grade. Raised decks and sand are measured; this is the inland default. */
export const STREET_Y = 0;
/**
 * Top of the corridor footpath slab. Lockstep with `assets.js` fallback road
 * (`footpathA/B` height 0.16, origin at grade) and `board.js` tram/prop sit height.
 */
export const FOOTPATH_Y = 0.16;
/** Top of the asphalt / tram-reservation bands in the same road module (height 0.02). */
export const CARRIAGEWAY_Y = 0.02;
/**
 * Top of reserve turf tiles. `board.js` `_buildTopology` places turf at y=0.235
 * with height 0.07 (centre), so the walkable face is 0.27. Landing's overlay
 * plane sits at 0.28 — one centimetre, not a second datum.
 */
export const RESERVE_LAWN_Y = 0.27;
/** Top of reserve hoggin / promenade tiles (centre 0.336, height 0.028). */
export const RESERVE_PATH_Y = 0.35;

/**
 * The footpath centre of the corridor this point is in, or the point itself off-corridor.
 * Used to slide a walker off a car hull onto the kerb instead of freezing inside it.
 */
export function kerbStand(x, z) {
  const cell = corridorCell(x, z);
  if (!cell) return { x, z };
  const stand = cell.local < ROAD / 2 ? CORRIDOR.footpathCentreLow : CORRIDOR.footpathCentreHigh;
  if (cell.axis === 'v') return { x: cell.low + stand, z };
  return { x, z: cell.low + stand };
}

function insideReserveBlock(x, z, reserve) {
  const bounds = reserve?.bounds;
  if (!bounds) return false;
  return x > bounds.minX && x < bounds.maxX && z > bounds.minZ && z < bounds.maxZ;
}

/**
 * Made ground on the public reserve: radial arms, promenade circuit, rotunda apron.
 * Numbers lock to `Board.reserveLayout` (PATH_HALF 1.80, LOOP 17.6, APRON 7.40).
 */
function onReservePaving(x, z, reserve) {
  const cx = reserve?.centre?.x;
  const cz = reserve?.centre?.z;
  if (!Number.isFinite(cx) || !Number.isFinite(cz)) return false;
  const dx = Math.abs(x - cx);
  const dz = Math.abs(z - cz);
  const arm = 1.80 + 0.55;
  if (dx < arm || dz < arm) return true;
  const loop = 17.6;
  const loopHalf = 1.20 + 0.45;
  if (Math.abs(dx - loop) < loopHalf && dz < loop + loopHalf) return true;
  if (Math.abs(dz - loop) < loopHalf && dx < loop + loopHalf) return true;
  return Math.hypot(dx, dz) < 7.40 + 0.8;
}

/**
 * Deck / sand / kerb / lawn height at a point.
 *
 * Stair treads are applied by the walker via `sampleStairs` *before* this, so a flight
 * is not re-derived here. The fourth argument used to be "keep the last altitude", and
 * that is how a walker left the boardwalk and hung in the air over the street: inland
 * of the deck is the surface under the feet, not whatever Y they were carrying.
 *
 * Inland is not all grade 0. The footpath slab is 0.16 m and the reserve turf sits
 * at 0.27 m — standing on STREET_Y plants the sole inside those plates (sunk on the
 * pavement, floating under the lawn overlay on the landing loop).
 */
export function groundYAt(x, z, world, fallback = STREET_Y) {
  const out = seawardOut(x, z, world);
  if (out != null) {
    const half = SHORE.boardwalkW * 0.52;
    if (out > -half && out < half) return deckTopY();
    if (out >= half) return SHORE.sandY ?? 0.06;
  }
  const reserve = world?.reserve;
  if (insideReserveBlock(x, z, reserve)) {
    return onReservePaving(x, z, reserve) ? RESERVE_PATH_Y : RESERVE_LAWN_Y;
  }
  const cell = corridorCell(x, z);
  if (cell?.kind === 'footpath') return FOOTPATH_Y;
  if (cell?.kind === 'carriageway' || cell?.kind === 'tram') return CARRIAGEWAY_Y;
  return STREET_Y;
}

export function buildCityWorld(city) {
  return {
    flights: [...landwardFlights(city), ...esplanadeFlights(city)],
    rails: esplanadeRails(city),
    crossings: cityCrossings(city),
    tramStops: tramStops(city),
    footprints: buildingFootprintAabbs(city),
    // `footpaths` — the V3.70 L2 pavement graph — is attached by the layer that needs it
    // (`ambient-life.js`), not here: `city-routes.js` imports `corridorCell` from this module and
    // building it in would close an import cycle for no caller's benefit.
    waterEdge: city?.waterEdge ?? null,
    extent: city?.extent ?? null,
    reserve: city?.reserve ?? null,
  };
}
