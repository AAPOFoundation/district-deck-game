// Pure public-tree-pit layout. Grid constants only: no Three, no Board,
// Streetscape, or Foliage. Callers pass the already ordered core-then-verge
// roster. This module does not place meshes or move trees.

import { BLOCK, CORRIDOR, PITCH, ROAD } from '../core/grid.js';

/** Named support heights, metres. Outside a pit these do not replace lawn or pavers. */
export const PUBLIC_PIT_LEVELS = Object.freeze({
  paver: 0.275,
  platform: 0.41,
  lawn: 0,
  soil: 0.06,
  grate: 0.270,
  rim: 0.275,
});

/** Corridor-aligned square half-widths, world metres. Not scaled and not yawed. */
const OUTER_HALF = 0.92;
const OPENING_HALF = 0.76;
const RESERVE_RADIUS = 28;
const LOOKUP_CELL = 4;
/** S3 jointed footpath slab. Centred on the footpath centreline. */
const FOOTPATH_SLAB = 2.94;
const SLAB_HALF = FOOTPATH_SLAB / 2;
const CONTAIN_EPS = 1e-6;

const ROOT_ASSUMPTION = 'Clear opening half-width is 0.76 m inside the 0.92 m outer square. '
  + 'A high-tier static audit of 162 provisional street trees found a maximum root square '
  + 'extent of 0.71869 m, about 4 cm inside that opening. Final quality tiers and motion '
  + 'are not certified. This is not an all-root clearance claim.';

const ROUTE_ABSENT = 'Absent protectedRects means route certification is incomplete, '
  + 'not that every entry is safe. Entry rectangles come from planResidentialFrontages '
  + 'in a later phase (gate.x ± clearWidth/2, localZ boundaryZ..kerbZ, parcel centre '
  + 'and rotation). This module does not import that planner. Seed-0 Moderne includes '
  + 'eight routes, one of them P0110 x 42.8812625..44.5112625 / z 77..80.56, clear 1.63 m.';

const ROUTE_EMPTY = 'protectedRects was supplied as an empty list. An empty list does not '
  + 'certify that every entry is safe, and it is not the same as an omitted list.';

const ROUTE_REJECTED = 'Supplied protectedRects contained a malformed rectangle. '
  + 'The plan is rejected. Those rectangles were not dropped and were not treated as tested.';

function freezeRect(minX, maxX, minZ, maxZ) {
  return Object.freeze({ minX, maxX, minZ, maxZ });
}

function square(x, z, half) {
  return freezeRect(x - half, x + half, z - half, z + half);
}

function finiteRect(rect) {
  return !!rect
    && Number.isFinite(rect.minX) && Number.isFinite(rect.maxX)
    && Number.isFinite(rect.minZ) && Number.isFinite(rect.maxZ)
    && rect.maxX > rect.minX && rect.maxZ > rect.minZ;
}

function cloneRect(rect) {
  return freezeRect(rect.minX, rect.maxX, rect.minZ, rect.maxZ);
}

/** Positive-area overlap. Shared edges do not overlap. Not a collision certificate. */
export function rectanglesOverlap(a, b) {
  if (!finiteRect(a) || !finiteRect(b)) return false;
  return a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
}

/** Inclusive. Construction test only, not a physics certificate. */
export function rectangleContainsPoint(rect, x, z) {
  if (!finiteRect(rect) || !Number.isFinite(x) || !Number.isFinite(z)) return false;
  return x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;
}

function rectangleContainsRect(outer, inner) {
  if (!finiteRect(outer) || !finiteRect(inner)) return false;
  return inner.minX >= outer.minX - CONTAIN_EPS
    && inner.maxX <= outer.maxX + CONTAIN_EPS
    && inner.minZ >= outer.minZ - CONTAIN_EPS
    && inner.maxZ <= outer.maxZ + CONTAIN_EPS;
}

function intersection(rect, hole) {
  if (!finiteRect(rect) || !finiteRect(hole)) return null;
  const minX = Math.max(rect.minX, hole.minX);
  const maxX = Math.min(rect.maxX, hole.maxX);
  const minZ = Math.max(rect.minZ, hole.minZ);
  const maxZ = Math.min(rect.maxZ, hole.maxZ);
  if (maxX <= minX || maxZ <= minZ) return null;
  return freezeRect(minX, maxX, minZ, maxZ);
}

/**
 * Disjoint positive-area rectangles covering `rect` minus `rect ∩ hole`.
 * No overlap leaves a copy of `rect`. Full cover returns an empty list.
 * Does not mutate either argument.
 */
export function subtractRectangle(rect, hole) {
  if (!finiteRect(rect)) return Object.freeze([]);
  const hit = intersection(rect, hole);
  if (!hit) return Object.freeze([cloneRect(rect)]);
  if (hit.minX <= rect.minX && hit.maxX >= rect.maxX
    && hit.minZ <= rect.minZ && hit.maxZ >= rect.maxZ) {
    return Object.freeze([]);
  }
  const parts = [];
  if (hit.minX > rect.minX) parts.push(freezeRect(rect.minX, hit.minX, rect.minZ, rect.maxZ));
  if (hit.maxX < rect.maxX) parts.push(freezeRect(hit.maxX, rect.maxX, rect.minZ, rect.maxZ));
  if (hit.minZ > rect.minZ) parts.push(freezeRect(hit.minX, hit.maxX, rect.minZ, hit.minZ));
  if (hit.maxZ < rect.maxZ) parts.push(freezeRect(hit.minX, hit.maxX, hit.maxZ, rect.maxZ));
  return Object.freeze(parts);
}

function pitchLocal(value) {
  const mod = value % PITCH;
  return mod < 0 ? mod + PITCH : mod;
}

function intersectionCentre(x, z) {
  return pitchLocal(x) < ROAD && pitchLocal(z) < ROAD;
}

function cityMetadataOk(city) {
  const corridors = city?.corridors;
  return !!city
    && typeof city === 'object'
    && Array.isArray(corridors?.vertical)
    && Array.isArray(corridors?.horizontal)
    && Number.isInteger(city.blocksX) && city.blocksX >= 0
    && Number.isInteger(city.blocksZ) && city.blocksZ >= 0;
}

function sourceId(placement) {
  return typeof placement?.id === 'string' && placement.id ? placement.id : null;
}

function exclusion(placement, index, reason) {
  return Object.freeze({
    index,
    id: sourceId(placement),
    x: Number.isFinite(placement?.x) ? placement.x : null,
    z: Number.isFinite(placement?.z) ? placement.z : null,
    reason,
  });
}

function blockSpan(along, blockCount) {
  if (!Number.isFinite(along) || along < ROAD) return null;
  const block = Math.floor((along - ROAD) / PITCH);
  if (block < 0 || block >= blockCount) return null;
  const start = block * PITCH + ROAD;
  if (along < start || along >= start + BLOCK) return null;
  return { start, end: start + BLOCK };
}

function slabRect(axis, centreAcross, span) {
  if (axis === 'v') {
    return freezeRect(centreAcross - SLAB_HALF, centreAcross + SLAB_HALF, span.start, span.end);
  }
  return freezeRect(span.start, span.end, centreAcross - SLAB_HALF, centreAcross + SLAB_HALF);
}

/**
 * Finite footpath slab that fully contains the outer square.
 * Corridors are the supplied lists only — no modulo invention.
 */
function locateFootpath(city, outer, x, z) {
  const axes = [
    ['v', city.corridors.vertical, city.blocksX, city.blocksZ, x, z],
    ['h', city.corridors.horizontal, city.blocksZ, city.blocksX, z, x],
  ];
  let match = null;
  for (const [axis, corridors, acrossBlocks, alongBlocks, across, along] of axes) {
    for (let i = 0; i < corridors.length; i += 1) {
      const corridor = corridors[i];
      if (!acceptedCorridor(corridor, axis, acrossBlocks)) continue;
      const span = blockSpan(along, alongBlocks);
      if (!span) continue;
      for (const side of ['low', 'high']) {
        const centre = side === 'low' ? CORRIDOR.footpathCentreLow : CORRIDOR.footpathCentreHigh;
        const acrossCentre = corridor.index * PITCH + centre;
        const band = slabRect(axis, acrossCentre, span);
        if (!rectangleContainsRect(band, outer)) continue;
        const acrossDist = Math.abs(across - acrossCentre);
        if (match && acrossDist >= match.acrossDist) continue;
        match = {
          axis,
          corridorIndex: corridor.index,
          corridorId: typeof corridor.id === 'string' ? corridor.id : null,
          side,
          acrossDist,
          band,
        };
      }
    }
  }
  return match;
}

function rejectReason(city, placement, outer) {
  const x = placement.x;
  const z = placement.z;
  if (intersectionCentre(x, z)) return 'intersection';
  const near = nearestAcross(city, x, z);
  if (!near) return 'no-footpath';
  if (near.acrossDist > SLAB_HALF) return 'no-footpath';
  if (!near.span) {
    const alongLocal = pitchLocal(near.along);
    if (alongLocal < ROAD) return 'intersection';
    return 'outside-block-face';
  }
  if (near.acrossDist > SLAB_HALF - OUTER_HALF) return 'outside-footpath-band';
  if (!rectangleContainsRect(near.band, outer)) return 'outside-block-face';
  return 'no-footpath';
}

function nearestAcross(city, x, z) {
  const axes = [
    ['v', city.corridors.vertical, city.blocksX, city.blocksZ, x, z],
    ['h', city.corridors.horizontal, city.blocksZ, city.blocksX, z, x],
  ];
  let best = null;
  for (const [axis, corridors, acrossBlocks, alongBlocks, across, along] of axes) {
    for (let i = 0; i < corridors.length; i += 1) {
      const corridor = corridors[i];
      if (!acceptedCorridor(corridor, axis, acrossBlocks)) continue;
      for (const side of ['low', 'high']) {
        const centre = side === 'low' ? CORRIDOR.footpathCentreLow : CORRIDOR.footpathCentreHigh;
        const acrossCentre = corridor.index * PITCH + centre;
        const acrossDist = Math.abs(across - acrossCentre);
        if (best && acrossDist >= best.acrossDist) continue;
        const span = blockSpan(along, alongBlocks);
        const band = span ? slabRect(axis, acrossCentre, span) : null;
        best = { acrossDist, span, band, along };
      }
    }
  }
  return best;
}

function acceptedCorridor(corridor, axis, acrossBlocks) {
  return !!corridor
    && corridor.axis === axis
    && Number.isInteger(corridor.index)
    && corridor.index >= 0
    && corridor.index <= acrossBlocks;
}

function inReserveCircle(city, x, z) {
  const centre = city?.reserve?.centre;
  if (!Number.isFinite(centre?.x) || !Number.isFinite(centre?.z)) return false;
  const dx = x - centre.x;
  const dz = z - centre.z;
  return dx * dx + dz * dz < RESERVE_RADIUS * RESERVE_RADIUS;
}

function stopRect(stop) {
  if (!stop || stop.kind !== 'stop') return null;
  if (!Number.isFinite(stop.x) || !Number.isFinite(stop.z)) return null;
  const vertical = stop.rotation === 90;
  const halfX = vertical ? 2.6 / 2 : 6.2 / 2;
  const halfZ = vertical ? 6.2 / 2 : 2.6 / 2;
  return freezeRect(stop.x - halfX, stop.x + halfX, stop.z - halfZ, stop.z + halfZ);
}

function pushRect(list, minX, maxX, minZ, maxZ) {
  if (maxX > minX && maxZ > minZ) list.push(freezeRect(minX, maxX, minZ, maxZ));
}

/** S3 block-end tactiles and interior junction tactile pads. Actual footprints. */
function crossingReservations(blocksX, blocksZ) {
  const rects = [];
  const tactileAcross = 0.85 / 2;
  const tactileAlong = 1.35 / 2;
  const axes = [
    ['v', blocksX, blocksZ],
    ['h', blocksZ, blocksX],
  ];
  for (const [axis, acrossBlocks, alongBlocks] of axes) {
    for (let i = 0; i <= acrossBlocks; i += 1) {
      for (const side of [-1, 1]) {
        const kerb = i * PITCH + (side < 0 ? CORRIDOR.kerbLow : CORRIDOR.kerbHigh);
        const centreAcross = kerb + side * 0.62;
        for (let b = 0; b < alongBlocks; b += 1) {
          const start = b * PITCH + ROAD;
          for (const at of [start + 0.85, start + BLOCK - 0.85]) {
            if (axis === 'v') {
              pushRect(
                rects,
                centreAcross - tactileAcross,
                centreAcross + tactileAcross,
                at - tactileAlong,
                at + tactileAlong,
              );
            } else {
              pushRect(
                rects,
                at - tactileAlong,
                at + tactileAlong,
                centreAcross - tactileAcross,
                centreAcross + tactileAcross,
              );
            }
          }
        }
      }
    }
  }
  const walkWidth = 7 * 0.5 + 6 * 0.38;
  const zebraCentreOffset = ROAD / 2 + 0.4 + walkWidth * 0.5;
  const kerbHalfSpan = (CORRIDOR.kerbHigh - CORRIDOR.kerbLow) * 0.5;
  const tactileOffset = kerbHalfSpan + 0.92 + 0.48;
  for (let i = 1; i < blocksX; i += 1) {
    for (let j = 1; j < blocksZ; j += 1) {
      const jx = i * PITCH + ROAD / 2;
      const jz = j * PITCH + ROAD / 2;
      pushRect(rects, jx - tactileOffset - 0.475, jx - tactileOffset + 0.475, jz - zebraCentreOffset - 0.9, jz - zebraCentreOffset + 0.9);
      pushRect(rects, jx + tactileOffset - 0.475, jx + tactileOffset + 0.475, jz - zebraCentreOffset - 0.9, jz - zebraCentreOffset + 0.9);
      pushRect(rects, jx - zebraCentreOffset - 0.9, jx - zebraCentreOffset + 0.9, jz - tactileOffset - 0.475, jz - tactileOffset + 0.475);
      pushRect(rects, jx - zebraCentreOffset - 0.9, jx - zebraCentreOffset + 0.9, jz + tactileOffset - 0.475, jz + tactileOffset + 0.475);
    }
  }
  return Object.freeze(rects);
}

function overlapsAny(rect, list) {
  for (let i = 0; i < list.length; i += 1) {
    if (rectanglesOverlap(rect, list[i])) return true;
  }
  return false;
}

const SOIL_SUPPORT = Object.freeze({ ownership: 'soil', level: PUBLIC_PIT_LEVELS.soil });
const RIM_SUPPORT = Object.freeze({
  ownership: 'rim-grate',
  level: PUBLIC_PIT_LEVELS.rim,
  grate: PUBLIC_PIT_LEVELS.grate,
  rim: PUBLIC_PIT_LEVELS.rim,
});
const OUTSIDE_SUPPORT = Object.freeze({ ownership: 'outside', level: null });

function supportOf(pit, x, z) {
  const opening = pit?.opening;
  if (opening
    && x > opening.minX && x < opening.maxX
    && z > opening.minZ && z < opening.maxZ) {
    return SOIL_SUPPORT;
  }
  if (rectangleContainsPoint(pit?.rim, x, z)) return RIM_SUPPORT;
  return null;
}

/**
 * Soil is strictly inside the opening. The shared opening edge is rim.
 * Outside is `level: null`, not the paver and not the lawn.
 * A constructed plan uses its cell lookup. A single pit or a raw array stays a short scan.
 */
export function publicPitSupportAt(source, x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return OUTSIDE_SUPPORT;
  if (source?.lookup && Array.isArray(source.pits)) {
    const key = `${Math.floor(x / source.lookup.cell)}:${Math.floor(z / source.lookup.cell)}`;
    const ids = source.lookup.cells[key];
    if (!ids) return OUTSIDE_SUPPORT;
    for (let i = 0; i < ids.length; i += 1) {
      const hit = supportOf(source.pits[ids[i]], x, z);
      if (hit) return hit;
    }
    return OUTSIDE_SUPPORT;
  }
  const pits = Array.isArray(source) ? source : source?.opening ? [source] : null;
  if (!pits) return OUTSIDE_SUPPORT;
  for (let i = 0; i < pits.length; i += 1) {
    const hit = supportOf(pits[i], x, z);
    if (hit) return hit;
  }
  return OUTSIDE_SUPPORT;
}

function buildLookup(pits) {
  const buckets = Object.create(null);
  for (let i = 0; i < pits.length; i += 1) {
    const rim = pits[i].rim;
    const x0 = Math.floor(rim.minX / LOOKUP_CELL);
    const x1 = Math.floor(rim.maxX / LOOKUP_CELL);
    const z0 = Math.floor(rim.minZ / LOOKUP_CELL);
    const z1 = Math.floor(rim.maxZ / LOOKUP_CELL);
    for (let cx = x0; cx <= x1; cx += 1) {
      for (let cz = z0; cz <= z1; cz += 1) {
        const key = `${cx}:${cz}`;
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(i);
      }
    }
  }
  const cells = {};
  const keys = Object.keys(buckets);
  for (let i = 0; i < keys.length; i += 1) cells[keys[i]] = Object.freeze(buckets[keys[i]]);
  return Object.freeze({ cell: LOOKUP_CELL, cells: Object.freeze(cells) });
}

function finishPlan(pits, excluded, assumptions) {
  return Object.freeze({
    pits: Object.freeze(pits),
    excluded: Object.freeze(excluded),
    levels: PUBLIC_PIT_LEVELS,
    assumptions,
    lookup: buildLookup(pits),
  });
}

function protectionState(options) {
  if (!options || typeof options !== 'object'
    || !Object.prototype.hasOwnProperty.call(options, 'protectedRects')) {
    return { kind: 'omitted', rects: [] };
  }
  const list = options.protectedRects;
  if (!Array.isArray(list)) return { kind: 'malformed', rects: [] };
  if (list.length === 0) return { kind: 'empty', rects: [] };
  for (let i = 0; i < list.length; i += 1) {
    if (!finiteRect(list[i])) return { kind: 'malformed', rects: [] };
  }
  return { kind: 'supplied', rects: list };
}

function assumptionsFor(protectionKind, platformsSupplied) {
  const lines = [ROOT_ASSUMPTION];
  if (protectionKind === 'supplied') {
    lines.push('Caller-supplied protectedRects were tested against the outer pit square. '
      + 'Routes absent from that list are not certified here.');
  } else if (protectionKind === 'empty') {
    lines.push(ROUTE_EMPTY);
  } else if (protectionKind === 'malformed') {
    lines.push(ROUTE_REJECTED);
  } else {
    lines.push(ROUTE_ABSENT);
  }
  if (!platformsSupplied) {
    lines.push('city.transit was not an array, so raised stop footprints were not tested. '
      + 'That is not a certificate that no platform occupies a pit.');
  }
  return Object.freeze(lines);
}

/**
 * @param {object} city
 * @param {readonly object[]} orderedPlacements authoritative core then verge, already ordered
 * @param {{ protectedRects?: readonly object[] }} [options]
 *   Omitting `protectedRects` is not the same as passing an empty list.
 *   A malformed supplied list rejects the plan.
 */
export function planPublicTreePits(city, orderedPlacements, options) {
  const protection = protectionState(options);
  const metadataOk = cityMetadataOk(city);
  const platformsSupplied = metadataOk && Array.isArray(city.transit);
  const assumptions = assumptionsFor(protection.kind, platformsSupplied);
  const roster = Array.isArray(orderedPlacements) ? orderedPlacements : [];
  if (protection.kind === 'malformed') {
    const excluded = roster.map((placement, index) => exclusion(placement, index, 'invalid-protected-rect'));
    return finishPlan([], excluded, assumptions);
  }
  if (!metadataOk || !Array.isArray(orderedPlacements)) {
    const reason = Array.isArray(orderedPlacements) ? 'city-metadata' : 'roster-invalid';
    const excluded = roster.map((placement, index) => exclusion(placement, index, reason));
    return finishPlan([], excluded, assumptions);
  }

  const stops = platformsSupplied
    ? city.transit.map(stopRect).filter(Boolean)
    : [];
  const crossings = crossingReservations(city.blocksX, city.blocksZ);
  const pits = [];
  const excluded = [];

  for (let index = 0; index < roster.length; index += 1) {
    const placement = roster[index];
    const x = placement?.x;
    const z = placement?.z;
    if (!placement || !Number.isFinite(x) || !Number.isFinite(z)) {
      excluded.push(exclusion(placement, index, 'invalid-position'));
      continue;
    }
    if (placement.role) {
      excluded.push(exclusion(placement, index, 'off-street-role'));
      continue;
    }
    if (inReserveCircle(city, x, z)) {
      excluded.push(exclusion(placement, index, 'reserve-zone'));
      continue;
    }
    const opening = square(x, z, OPENING_HALF);
    const rim = square(x, z, OUTER_HALF);
    const footpath = locateFootpath(city, rim, x, z);
    if (!footpath) {
      excluded.push(exclusion(placement, index, rejectReason(city, placement, rim)));
      continue;
    }
    if (overlapsAny(rim, stops)) {
      excluded.push(exclusion(placement, index, 'stop-platform'));
      continue;
    }
    if (overlapsAny(rim, crossings)) {
      excluded.push(exclusion(placement, index, 'crossing-tactile'));
      continue;
    }
    if (protection.kind === 'supplied' && overlapsAny(rim, protection.rects)) {
      excluded.push(exclusion(placement, index, 'protected-route'));
      continue;
    }
    if (pits.some((pit) => rectanglesOverlap(pit.rim, rim))) {
      excluded.push(exclusion(placement, index, 'pit-overlap'));
      continue;
    }
    pits.push(Object.freeze({
      index,
      id: sourceId(placement),
      x,
      z,
      axis: footpath.axis,
      corridorIndex: footpath.corridorIndex,
      corridorId: footpath.corridorId,
      side: footpath.side,
      opening,
      rim,
      soil: PUBLIC_PIT_LEVELS.soil,
      grate: PUBLIC_PIT_LEVELS.grate,
      rimLevel: PUBLIC_PIT_LEVELS.rim,
    }));
  }

  return finishPlan(pits, excluded, assumptions);
}
