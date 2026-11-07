// District Deck V3.00 — DDMG-1 modular grid.
// Framework §1. Every dimension here is binding; assets are modular only if they honour it.

export const CELL = 4;      // atomic snap unit — props, furniture, trees
export const TILE = 16;     // one parcel footprint module
export const BLOCK = 48;    // 3 x TILE — one city block
export const ROAD = 16;     // corridor width between blocks
export const PITCH = 64;    // BLOCK + ROAD — block-to-block spacing
export const STOREY = 3.2;  // vertical quantum
export const SETBACK = 0.5; // per side, so a 1x1 building is at most 15 m

export const TILES_PER_BLOCK = 3;

// Road corridor composition, metres from the corridor's low edge. Framework §1.3.
export const CORRIDOR = Object.freeze({
  width: ROAD,
  footpathA: [0, 3],
  carriagewayA: [3, 6],
  tramReservation: [6, 10],
  carriagewayB: [10, 13],
  footpathB: [13, 16],
  kerbLow: 3,
  kerbHigh: 13,
  tramCentre: 8,
  footpathCentreLow: 1.5,
  footpathCentreHigh: 14.5,
});

/** Stable parcel id. Content key — same across every seed. */
export function parcelId(bx, bz, tx, tz) {
  return `p${bx}${bz}${tx}${tz}`;
}

export function parseParcelId(id) {
  const m = /^p(\d)(\d)(\d)(\d)$/.exec(id);
  if (!m) throw new Error(`bad parcel id: ${id}`);
  return { bx: +m[1], bz: +m[2], tx: +m[3], tz: +m[4] };
}

/** World-space centre of a parcel, in metres, y implied 0. Framework §1.4. */
export function tileCentre(bx, bz, tx, tz) {
  return {
    x: ROAD + bx * PITCH + tx * TILE + TILE / 2,
    z: ROAD + bz * PITCH + tz * TILE + TILE / 2,
  };
}

/** Global tile lattice coordinates — the adjacency space corridors are computed in. */
export function globalTile(bx, bz, tx, tz) {
  return { gx: bx * TILES_PER_BLOCK + tx, gz: bz * TILES_PER_BLOCK + tz };
}

export function fromGlobalTile(gx, gz) {
  return {
    bx: Math.floor(gx / TILES_PER_BLOCK),
    bz: Math.floor(gz / TILES_PER_BLOCK),
    tx: gx % TILES_PER_BLOCK,
    tz: gz % TILES_PER_BLOCK,
  };
}

/** Total city extent in metres for an N x M block city (road ring on all four sides). */
export function cityExtent(blocksX, blocksZ) {
  return { x: blocksX * PITCH + ROAD, z: blocksZ * PITCH + ROAD };
}

/** Snap an arbitrary world position to the nearest CELL centre. Props only. */
export function snapToCell(v) {
  return Math.round((v - CELL / 2) / CELL) * CELL + CELL / 2;
}

/** Quantise a height to whole storeys. Framework §1.5. */
export function storeyHeight(storeys) {
  return +(storeys * STOREY).toFixed(4);
}

/**
 * Which corridor a tile fronts, and therefore its rotation. Rotation is DERIVED,
 * never rolled — a building must face the street it stands on.
 * Edge tiles face outward. The centre tile is the block core and asking it for a
 * frontage is a generator error.
 * Returns degrees: 0 = front to +Z (south), 90 = +X, 180 = -Z, 270 = -X.
 */
export function frontage(tx, tz) {
  const last = TILES_PER_BLOCK - 1;
  const onSouth = tz === last;
  const onNorth = tz === 0;
  const onEast = tx === last;
  const onWest = tx === 0;
  const sides = [];
  if (onSouth) sides.push({ rotation: 0, side: 'south' });
  if (onEast) sides.push({ rotation: 90, side: 'east' });
  if (onNorth) sides.push({ rotation: 180, side: 'north' });
  if (onWest) sides.push({ rotation: 270, side: 'west' });
  if (sides.length === 0) {
    throw new Error(`landlocked tile has no frontage: (${tx},${tz})`);
  }
  return { ...sides[0], frontages: sides.length, corner: sides.length > 1 };
}

/** Orthogonal neighbours on the global tile lattice — corridors cross streets. */
export function neighbourIds(id, blocksX, blocksZ) {
  const { bx, bz, tx, tz } = parseParcelId(id);
  const { gx, gz } = globalTile(bx, bz, tx, tz);
  const maxGx = blocksX * TILES_PER_BLOCK - 1;
  const maxGz = blocksZ * TILES_PER_BLOCK - 1;
  const out = [];
  const deltas = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dz] of deltas) {
    const nx = gx + dx;
    const nz = gz + dz;
    if (nx < 0 || nz < 0 || nx > maxGx || nz > maxGz) continue;
    const n = fromGlobalTile(nx, nz);
    out.push(parcelId(n.bx, n.bz, n.tx, n.tz));
  }
  return out;
}

/** Enumerate every parcel id in a city, in a fixed order. Order is part of the contract. */
export function allParcelIds(blocksX, blocksZ) {
  const ids = [];
  for (let bz = 0; bz < blocksZ; bz += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      for (let tz = 0; tz < TILES_PER_BLOCK; tz += 1) {
        for (let tx = 0; tx < TILES_PER_BLOCK; tx += 1) {
          ids.push(parcelId(bx, bz, tx, tz));
        }
      }
    }
  }
  return ids;
}
